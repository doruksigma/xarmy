import { HEIGHT, MAX_ROUTE_POINTS, WIDTH, dist } from "./config";
import type { Point } from "./config";
import { toWorld } from "./render";
import type { Box, Camera, View } from "./render";

export const MAX_ZOOM = 20;

export interface Inputs {
  view(): View;
  camera: Camera;
  tap(point: Point, command: boolean, touch: boolean, add: boolean, radius: number): void;
  select(from: Point, to: Point, add: boolean): void;
  drag(box: Box | null): void;
  multi(): boolean;
  pause(): void;
  active?(): boolean;
  routeMode?(): boolean;
  preview?(points: Point[]): void;
  route?(points: Point[]): void;
  invalidate?(): void;
}

export function clampCamera(camera: Camera, view?: View) {
  const halfWidth = view ? Math.min(WIDTH / 2, view.width / view.scale / 2) : 0;
  const halfHeight = view ? Math.min(HEIGHT / 2, view.height / view.scale / 2) : 0;
  camera.x = Math.max(halfWidth, Math.min(WIDTH - halfWidth, camera.x));
  camera.y = Math.max(halfHeight, Math.min(HEIGHT - halfHeight, camera.y));
}

export function bindInput(canvas: HTMLCanvasElement, handler: Inputs) {
  const controller = new AbortController();
  const opts = { signal: controller.signal };
  const pointers = new Map<number, Point>();
  const keys = new Set<string>();
  const touchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  let start: Point | null = null;
  let owner: number | null = null;
  let shift = false;
  let selection = false;
  let gesture = false;
  let routePoints: Point[] | null = null;
  let disposed = false;
  const active = () => !disposed && (handler.active?.() ?? true);
  const projection = () => {
    const rect = canvas.getBoundingClientRect();
    const view = handler.view();
    return (ev: PointerEvent | WheelEvent) => ({
      x: (ev.clientX - rect.left) * view.width / Math.max(1, rect.width),
      y: (ev.clientY - rect.top) * view.height / Math.max(1, rect.height),
    });
  };
  const pointOf = (ev: PointerEvent | WheelEvent) => projection()(ev);
  const center = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function release(id: number) {
    try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch { /* Detached canvas. */ }
  }
  function reset() {
    const ids = [...pointers.keys()];
    pointers.clear();
    keys.clear();
    start = null;
    owner = null;
    gesture = false;
    routePoints = null;
    handler.drag(null);
    handler.preview?.([]);
    for (const id of ids) release(id);
  }
  function routePoint(point: Point) {
    const world = toWorld(handler.view(), point);
    return { x: Math.max(0.001, Math.min(WIDTH - 0.001, world.x)), y: Math.max(0.001, Math.min(HEIGHT - 0.001, world.y)) };
  }
  function appendRoute(point: Point, final = false, publish = true) {
    if (!routePoints) return false;
    const world = routePoint(point);
    const last = routePoints.at(-1);
    if (last && dist(last, world) < (final ? 0.001 : 0.5)) return false;
    routePoints.push(world);
    if (routePoints.length > MAX_ROUTE_POINTS) {
      // Preserve endpoints and turns; remove the least significant interior bend.
      let remove = 1, smallest = Infinity;
      for (let i = 1; i < routePoints.length - 1; i++) {
        const [a, b, c] = [routePoints[i - 1], routePoints[i], routePoints[i + 1]];
        const score = dist(a, b) + dist(b, c) - dist(a, c);
        if (score < smallest) { smallest = score; remove = i; }
      }
      routePoints.splice(remove, 1);
    }
    if (publish) handler.preview?.(routePoints.map(value => ({ ...value })));
    return true;
  }
  function zoomAt(point: Point, factor: number) {
    const before = toWorld(handler.view(), point);
    handler.camera.zoom = Math.max(1, Math.min(MAX_ZOOM, handler.camera.zoom * factor));
    const after = toWorld(handler.view(), point);
    handler.camera.x += before.x - after.x;
    handler.camera.y += before.y - after.y;
    clampCamera(handler.camera, handler.view());
    handler.invalidate?.();
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!active() || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const point = pointOf(event);
    if (event.button === 2) {
      if (!pointers.size) handler.tap(toWorld(handler.view(), point), true, false, false, Math.max(0.55, 9 / handler.view().scale));
      return;
    }
    pointers.set(event.pointerId, point);
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer ended before capture. */ }
    if (pointers.size > 1) {
      gesture = true;
      start = null;
      owner = null;
      routePoints = null;
      handler.drag(null);
      handler.preview?.([]);
      return;
    }
    if (gesture) return;
    owner = event.pointerId;
    start = point;
    if (handler.routeMode?.()) {
      routePoints = [];
      appendRoute(point, true);
      selection = false;
      keys.clear();
      return;
    }
    selection = event.pointerType === "mouse" || handler.multi();
    shift = event.shiftKey || (event.pointerType !== "mouse" && handler.multi());
  }, opts);
  function pointerMove(event: PointerEvent, finalPoint?: Point, project?: ReturnType<typeof projection>) {
    if (!pointers.has(event.pointerId)) return;
    if (!active()) { reset(); return; }
    event.preventDefault();
    // One projection/layout read serves the complete coalesced event batch.
    const transform = project ?? projection();
    const point = finalPoint ?? transform(event);
    const before = pointers.size >= 2 ? [...pointers.values()] : null;
    pointers.set(event.pointerId, point);
    if (before) {
      const after = [...pointers.values()];
      const oldCenter = center(before[0], before[1]);
      const newCenter = center(after[0], after[1]);
      const scale = handler.view().scale;
      handler.camera.x += (oldCenter.x - newCenter.x) / scale;
      handler.camera.y += (oldCenter.y - newCenter.y) / scale;
      zoomAt(newCenter, dist(after[0], after[1]) / Math.max(1, dist(before[0], before[1])));
    } else if (!gesture && owner === event.pointerId && routePoints) {
      const samples = event.getCoalescedEvents?.() ?? [];
      let changed = false;
      const count = Math.min(32, samples.length);
      for (let index = 0; index < count; index++) {
        changed = appendRoute(transform(samples[Math.floor(index * samples.length / count)]), false, false) || changed;
      }
      changed = appendRoute(point, false, false) || changed;
      if (changed) handler.preview?.(routePoints.map(value => ({ ...value })));
    } else if (!gesture && owner === event.pointerId && start && selection && dist(start, point) >= 7) {
      handler.drag({ from: start, to: point });
    }
  }
  canvas.addEventListener("pointermove", event => pointerMove(event), opts);
  canvas.addEventListener("pointerup", (event) => {
    if (!pointers.has(event.pointerId)) return;
    // The final event may contain a newer position than the last pointermove.
    const project = projection(), point = project(event);
    pointerMove(event, point, project);
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const from = start;
    const consumed = gesture || owner !== event.pointerId;
    if (routePoints && !consumed) appendRoute(point, true);
    const drawnRoute = routePoints;
    routePoints = null;
    pointers.delete(event.pointerId);
    start = null;
    owner = null;
    if (!pointers.size) gesture = false;
    release(event.pointerId);
    handler.drag(null);
    handler.preview?.([]);
    if (consumed || !from || !active()) return;
    if (drawnRoute) {
      if (handler.routeMode?.() && drawnRoute.length) handler.route?.(drawnRoute.map(point => ({ ...point })));
      return;
    }
    const view = handler.view();
    if (selection && dist(from, point) >= 7) handler.select(toWorld(view, from), toWorld(view, point), shift);
    else if (dist(from, point) < 7) {
      const touch = event.pointerType !== "mouse";
      handler.tap(toWorld(view, point), false, touch, shift, Math.max(0.55, (touch ? 22 : 9) / view.scale));
    }
  }, opts);
  const cancel = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    start = null;
    owner = null;
    gesture = pointers.size > 0;
    routePoints = null;
    handler.drag(null);
    handler.preview?.([]);
    release(event.pointerId);
  };
  canvas.addEventListener("pointercancel", cancel, opts);
  canvas.addEventListener("lostpointercapture", cancel, opts);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), opts);
  canvas.addEventListener("wheel", (event) => {
    if (!active()) return;
    event.preventDefault();
    if (routePoints) return;
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
    zoomAt(pointOf(event), Math.exp(-Math.max(-160, Math.min(160, event.deltaY * multiplier)) * 0.0012));
  }, { ...opts, passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !active()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      keys.clear();
      if (!event.repeat) handler.pause();
      return;
    }
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) return;
    event.preventDefault();
    keys.add(key);
    handler.invalidate?.();
  }, opts);
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()), opts);
  canvas.addEventListener("blur", () => keys.clear(), opts);
  window.addEventListener("blur", reset, opts);
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); }, opts);
  return {
    moveCamera(dt: number) {
      if (!active() || document.activeElement !== canvas) { keys.clear(); return; }
      if (routePoints) { keys.clear(); return; }
      const dx = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
      const dy = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
      if (!dx && !dy) return;
      const delta = 420 * Math.max(0, Math.min(dt, 0.15)) / handler.view().scale / Math.max(1, Math.hypot(dx, dy));
      handler.camera.x += dx * delta;
      handler.camera.y += dy * delta;
      clampCamera(handler.camera, handler.view());
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      controller.abort();
      canvas.style.touchAction = touchAction;
    },
  };
}
