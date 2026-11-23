import { HEIGHT, WIDTH, dist } from "./config";
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
  let disposed = false;
  const active = () => !disposed && (handler.active?.() ?? true);
  const pointOf = (ev: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const view = handler.view();
    return {
      x: (ev.clientX - rect.left) * view.width / Math.max(1, rect.width),
      y: (ev.clientY - rect.top) * view.height / Math.max(1, rect.height),
    };
  };
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
    handler.drag(null);
    for (const id of ids) release(id);
  }
  function zoomAt(point: Point, factor: number) {
    const before = toWorld(handler.view(), point);
    handler.camera.zoom = Math.max(1, Math.min(MAX_ZOOM, handler.camera.zoom * factor));
    const after = toWorld(handler.view(), point);
    handler.camera.x += before.x - after.x;
    handler.camera.y += before.y - after.y;
    clampCamera(handler.camera, handler.view());
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
      handler.drag(null);
      return;
    }
    if (gesture) return;
    owner = event.pointerId;
    start = point;
    selection = event.pointerType === "mouse" || handler.multi();
    shift = event.shiftKey || (event.pointerType !== "mouse" && handler.multi());
  }, opts);
  function pointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    if (!active()) { reset(); return; }
    event.preventDefault();
    const before = [...pointers.values()];
    const point = pointOf(event);
    pointers.set(event.pointerId, point);
    const after = [...pointers.values()];
    if (after.length >= 2) {
      const oldCenter = center(before[0], before[1]);
      const newCenter = center(after[0], after[1]);
      const scale = handler.view().scale;
      handler.camera.x += (oldCenter.x - newCenter.x) / scale;
      handler.camera.y += (oldCenter.y - newCenter.y) / scale;
      zoomAt(newCenter, dist(after[0], after[1]) / Math.max(1, dist(before[0], before[1])));
    } else if (!gesture && owner === event.pointerId && start && selection && dist(start, point) >= 7) {
      handler.drag({ from: start, to: point });
    }
  }
  canvas.addEventListener("pointermove", pointerMove, opts);
  canvas.addEventListener("pointerup", (event) => {
    if (!pointers.has(event.pointerId)) return;
    // The final event may contain a newer position than the last pointermove.
    pointerMove(event);
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const from = start;
    const consumed = gesture || owner !== event.pointerId;
    pointers.delete(event.pointerId);
    start = null;
    owner = null;
    if (!pointers.size) gesture = false;
    release(event.pointerId);
    handler.drag(null);
    if (consumed || !from || !active()) return;
    const point = pointOf(event);
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
    handler.drag(null);
    release(event.pointerId);
  };
  canvas.addEventListener("pointercancel", cancel, opts);
  canvas.addEventListener("lostpointercapture", cancel, opts);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), opts);
  canvas.addEventListener("wheel", (event) => {
    if (!active()) return;
    event.preventDefault();
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
  }, opts);
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()), opts);
  canvas.addEventListener("blur", () => keys.clear(), opts);
  window.addEventListener("blur", reset, opts);
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); }, opts);
  return {
    moveCamera(dt: number) {
      if (!active() || document.activeElement !== canvas) { keys.clear(); return; }
      const dx = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
      const dy = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
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
