import { HEIGHT, WIDTH, dist } from "./config";
import type { Point } from "./config";
import { toWorld } from "./render";
import type { Box, Camera, View } from "./render";

export interface Inputs {
  view(): View;
  camera: Camera;
  tap(point: Point, command: boolean, touch: boolean, add: boolean, radius: number): void;
  select(from: Point, to: Point, add: boolean): void;
  drag(box: Box | null): void;
  multi(): boolean;
  pause(): void;
}

export function clampCamera(camera: Camera) {
  camera.x = Math.max(0, Math.min(WIDTH, camera.x));
  camera.y = Math.max(0, Math.min(HEIGHT, camera.y));
}

export function bindInput(canvas: HTMLCanvasElement, handler: Inputs) {
  const controller = new AbortController();
  const opts = { signal: controller.signal };
  const pointers = new Map<number, Point>();
  const keys = new Set<string>();
  let start: Point | null = null;
  let shift = false;
  let selection = false;
  const pointOf = (ev: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };
  const center = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function zoomAt(point: Point, factor: number) {
    const before = toWorld(handler.view(), point);
    handler.camera.zoom = Math.max(1, Math.min(4, handler.camera.zoom * factor));
    const after = toWorld(handler.view(), point);
    handler.camera.x += before.x - after.x;
    handler.camera.y += before.y - after.y;
    clampCamera(handler.camera);
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    canvas.focus({ preventScroll: true });
    const point = pointOf(event);
    if (event.button === 2) {
      handler.tap(toWorld(handler.view(), point), true, false, false, 0.8);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size > 1) {
      start = null;
      handler.drag(null);
      return;
    }
    start = point;
    selection = event.pointerType === "mouse" || handler.multi();
    shift = event.shiftKey || (event.pointerType !== "mouse" && handler.multi());
  }, opts);
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    const point = pointOf(event);
    pointers.set(event.pointerId, point);
    const after = [...pointers.values()];
    if (after.length === 2) {
      const oldCenter = center(before[0], before[1]);
      const newCenter = center(after[0], after[1]);
      const scale = handler.view().scale;
      handler.camera.x += (oldCenter.x - newCenter.x) / scale;
      handler.camera.y += (oldCenter.y - newCenter.y) / scale;
      zoomAt(newCenter, dist(after[0], after[1]) / Math.max(1, dist(before[0], before[1])));
    } else if (start && selection && dist(start, point) >= 7) {
      handler.drag({ from: start, to: point });
    }
  }, opts);
  canvas.addEventListener("pointerup", (event) => {
    if (!pointers.delete(event.pointerId) || !start) return;
    const point = pointOf(event);
    const view = handler.view();
    if (selection && dist(start, point) >= 7) handler.select(toWorld(view, start), toWorld(view, point), shift);
    else if (dist(start, point) < 7) {
      const touch = event.pointerType !== "mouse";
      handler.tap(toWorld(view, point), false, touch, shift, Math.max(0.55, (touch ? 17 : 9) / view.scale));
    }
    start = null;
    handler.drag(null);
  }, opts);
  const cancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    start = null;
    handler.drag(null);
  };
  canvas.addEventListener("pointercancel", cancel, opts);
  canvas.addEventListener("lostpointercapture", cancel, opts);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), opts);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(pointOf(event), Math.exp(-event.deltaY * 0.0012));
  }, { ...opts, passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!event.repeat) handler.pause();
      return;
    }
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) return;
    event.preventDefault();
    keys.add(key);
  }, opts);
  canvas.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()), opts);
  canvas.addEventListener("blur", () => keys.clear(), opts);
  return {
    moveCamera(dt: number) {
      const delta = 15 * dt / handler.camera.zoom;
      handler.camera.x += ((keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0)) * delta;
      handler.camera.y += ((keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0)) * delta;
      clampCamera(handler.camera);
    },
    dispose() { controller.abort(); },
  };
}
