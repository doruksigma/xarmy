import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { bindInput, clampCamera } from "./input";
import { startBattle } from "./battle";
import { createMatch } from "./engine";
import { toWorld, viewOf } from "./render";
import type { Box, Camera } from "./render";
import type { Point } from "./config";
import { mapIds, nearestOpen, passable } from "./terrain";

// DOM/event mocks test input and lifecycle contracts; they are not browser/device QA.
class Surface extends EventTarget {
  emit(type: string, values: Record<string, unknown> = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, pointerId: 1, pointerType: "mouse", clientX: 0, clientY: 0, ...values });
    this.dispatchEvent(event);
    return event;
  }
}
class FakeCanvas extends Surface {
  style = { touchAction: "pan-y" };
  dataset: Record<string, string> = {};
  width = 960;
  height = 600;
  clientWidth = 960;
  clientHeight = 600;
  renderedWidth = 960;
  renderedHeight = 600;
  captures = new Set<number>();
  context = new Proxy<Record<string, unknown>>({}, {
    get(target, key: string) { return target[key] ?? (() => {}); },
    set(target, key: string, value) { target[key] = value; return true; },
  });
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 100, top: 50, width: this.renderedWidth, height: this.renderedHeight }; }
  focus() { (document as unknown as FakeDocument).activeElement = this; }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); this.emit("lostpointercapture", { pointerId: id }); }
  asCanvas() { return this as unknown as HTMLCanvasElement; }
}
class FakeDocument extends Surface {
  hidden = false;
  activeElement: FakeCanvas | null = null;
  createElement() { return new FakeCanvas(); }
}
function environment(t: TestContext) {
  const document = new FakeDocument();
  const window = Object.assign(new Surface(), { devicePixelRatio: 2 });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const values: Record<string, unknown> = {
    document, window,
    requestAnimationFrame(callback: FrameRequestCallback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  };
  const originals = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    for (const key of Object.keys(values)) {
      const original = originals[key];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    document, window, frames,
    runFrame(now: number) {
      const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      assert.ok(entry, "a single animation frame should be scheduled");
      frames.delete(entry[0]); entry[1](now);
    },
  };
}
function inputs(t: TestContext) {
  const env = environment(t);
  const canvas = new FakeCanvas();
  const camera: Camera = { x: 24, y: 15, zoom: 2 };
  const state = { active: true, multi: false, paused: 0, box: null as Box | null,
    taps: [] as Array<{ point: Point; command: boolean; touch: boolean; add: boolean; radius: number }>,
    selections: [] as Array<{ from: Point; to: Point; add: boolean }> };
  const view = () => viewOf(canvas.clientWidth, canvas.clientHeight, camera);
  const input = bindInput(canvas.asCanvas(), {
    camera, view, active: () => state.active, multi: () => state.multi,
    drag(box) { state.box = box; }, pause() { state.paused++; },
    tap(point, command, touch, add, radius) { state.taps.push({ point, command, touch, add, radius }); },
    select(from, to, add) { state.selections.push({ from, to, add }); },
  });
  t.after(() => input.dispose());
  const tap = (x: number, y: number, extra: Record<string, unknown> = {}) => {
    canvas.emit("pointerdown", { clientX: x, clientY: y, ...extra });
    canvas.emit("pointerup", { clientX: x, clientY: y, ...extra });
  };
  return { ...env, canvas, camera, view, state, input, tap };
}

test("input coordinates survive camera movement, CSS scaling and high pixel-density backing stores", t => {
  const f = inputs(t);
  f.canvas.renderedWidth = 480; f.canvas.renderedHeight = 300;
  f.canvas.width = 1920; f.canvas.height = 1200;
  f.tap(260, 140);
  assert.deepEqual(f.state.taps[0].point, { x: 20, y: 12 });
  f.camera.x = 26; f.camera.y = 17;
  f.tap(260, 140, { pointerType: "touch" });
  assert.deepEqual(f.state.taps[1].point, { x: 22, y: 14 });
  assert.equal(f.state.taps[1].touch, true);
  assert.ok(f.state.taps[1].radius * f.view().scale >= 22);
});

test("rectangle selection uses final pointer-up coordinates and preserves Shift addition", t => {
  const f = inputs(t);
  f.canvas.emit("pointerdown", { clientX: 300, clientY: 250, shiftKey: true });
  f.canvas.emit("pointermove", { clientX: 350, clientY: 280 });
  assert.ok(f.state.box);
  f.canvas.emit("pointerup", { clientX: 500, clientY: 400 });
  assert.deepEqual(f.state.selections[0], {
    from: toWorld(f.view(), { x: 200, y: 200 }), to: toWorld(f.view(), { x: 400, y: 350 }), add: true,
  });
  assert.equal(f.state.box, null);
  assert.equal(f.canvas.captures.size, 0);
});

test("two-finger pan/pinch consumes the surviving touch instead of issuing a command", t => {
  const f = inputs(t);
  f.canvas.emit("pointerdown", { pointerId: 10, pointerType: "touch", clientX: 400, clientY: 300 });
  f.canvas.emit("pointerdown", { pointerId: 11, pointerType: "touch", clientX: 600, clientY: 300 });
  f.canvas.emit("pointermove", { pointerId: 11, pointerType: "touch", clientX: 700, clientY: 320 });
  assert.ok(f.camera.zoom > 2);
  assert.notEqual(f.camera.x, 24);
  f.canvas.emit("pointerup", { pointerId: 11, pointerType: "touch", clientX: 700, clientY: 320 });
  f.canvas.emit("pointerup", { pointerId: 10, pointerType: "touch", clientX: 400, clientY: 300 });
  assert.equal(f.state.taps.length, 0);
  assert.equal(f.state.selections.length, 0);
  f.tap(500, 350, { pointerType: "touch" });
  assert.equal(f.state.taps.length, 1);
});

test("touch drag selection is opt-in and disabled matches reject new and pending input", t => {
  const f = inputs(t);
  for (const enabled of [false, true]) {
    f.state.multi = enabled;
    f.canvas.emit("pointerdown", { pointerType: "touch", clientX: 300, clientY: 250 });
    f.canvas.emit("pointermove", { pointerType: "touch", clientX: 500, clientY: 400 });
    assert.equal(Boolean(f.state.box), enabled);
    f.canvas.emit("pointerup", { pointerType: "touch", clientX: 500, clientY: 400 });
  }
  assert.equal(f.state.selections.length, 1);
  f.canvas.emit("pointerdown", { clientX: 300, clientY: 250 });
  f.state.active = false;
  f.canvas.emit("pointerup", { clientX: 300, clientY: 250 });
  f.tap(300, 250);
  assert.equal(f.state.taps.length, 0);
  assert.equal(f.canvas.captures.size, 0);
});

test("keyboard controls require game focus, respect browser shortcuts and stop on blur", t => {
  const f = inputs(t);
  f.canvas.focus();
  f.canvas.emit("keydown", { key: "d" });
  f.input.moveCamera(0.1);
  assert.ok(f.camera.x > 24);
  f.canvas.emit("blur");
  const stopped = f.camera.x;
  f.input.moveCamera(0.1);
  assert.equal(f.camera.x, stopped);
  const shortcut = f.canvas.emit("keydown", { key: "w", ctrlKey: true });
  assert.equal(shortcut.defaultPrevented, false);
  f.canvas.emit("keydown", { key: "d" });
  f.document.activeElement = null;
  f.input.moveCamera(0.1);
  assert.equal(f.camera.x, stopped);
  f.canvas.focus();
  const escape = f.canvas.emit("keydown", { key: "Escape" });
  f.canvas.emit("keydown", { key: "Escape", repeat: true });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.state.paused, 1);
});

test("wheel zoom keeps the world point anchored and cameras cannot pan beyond visible map bounds", t => {
  const f = inputs(t);
  const point = { x: 420, y: 250 };
  const before = toWorld(f.view(), point);
  f.canvas.emit("wheel", { clientX: point.x + 100, clientY: point.y + 50, deltaY: -60, deltaMode: 0 });
  const after = toWorld(f.view(), point);
  assert.ok(Math.abs(before.x - after.x) < 1e-10 && Math.abs(before.y - after.y) < 1e-10);
  f.camera.zoom = 1; f.camera.x = -100; f.camera.y = 100;
  clampCamera(f.camera, f.view());
  assert.deepEqual(f.camera, { x: 24, y: 15, zoom: 1 });
});

test("cancel, hidden-tab reset and repeated disposal release capture and remove input listeners", t => {
  const f = inputs(t);
  f.canvas.emit("pointerdown", { pointerId: 7, clientX: 500, clientY: 350 });
  f.canvas.emit("pointercancel", { pointerId: 7 });
  assert.equal(f.canvas.captures.size, 0);
  f.canvas.emit("pointerdown", { pointerId: 8, clientX: 500, clientY: 350 });
  f.document.hidden = true; f.document.emit("visibilitychange");
  assert.equal(f.canvas.captures.size, 0);
  f.input.dispose(); f.input.dispose();
  f.tap(500, 350);
  assert.equal(f.state.taps.length, 0);
  assert.equal(f.canvas.style.touchAction, "pan-y");
  assert.equal(f.canvas.emit("contextmenu").defaultPrevented, false);
});

test("battle saves and pauses when hidden, resumes without accumulated time, and cleans up its sole loop", t => {
  const env = environment(t);
  const canvas = new FakeCanvas(), mini = new FakeCanvas();
  const match = createMatch("normal", "input-lifecycle", false, "plains");
  let saved = 0, pauses = 0;
  const battle = startBattle(match, canvas.asCanvas(), mini.asCanvas(), () => {},
    () => { pauses++; battle.pause(true); }, () => { saved++; }, () => {});
  t.after(() => battle.dispose());
  assert.equal(env.frames.size, 1);
  env.runFrame(1000); env.runFrame(1050);
  assert.ok(match.elapsed > 0);
  const beforeHidden = match.elapsed;
  env.document.hidden = true; env.document.emit("visibilitychange");
  assert.equal(saved, 1); assert.equal(pauses, 1); assert.equal(env.frames.size, 0);
  env.document.hidden = false; env.document.emit("visibilitychange");
  env.runFrame(100000); env.runFrame(100050);
  assert.equal(match.elapsed, beforeHidden);
  battle.pause(false);
  env.runFrame(100100); env.runFrame(100150);
  assert.ok(match.elapsed > beforeHidden && match.elapsed - beforeHidden <= 0.051);
  const beforePagehideSaves = saved;
  env.window.emit("pagehide");
  assert.equal(saved, beforePagehideSaves + 1); assert.equal(env.frames.size, 0);
  env.window.emit("pageshow"); env.window.emit("pageshow");
  assert.equal(env.frames.size, 1);
  const staleFrame = [...env.frames.values()][0];
  battle.dispose(); battle.dispose();
  assert.equal(env.frames.size, 0);
  staleFrame(999999);
  env.window.emit("pageshow"); env.document.emit("visibilitychange");
  assert.equal(env.frames.size, 0);
  assert.equal(saved, beforePagehideSaves + 1);
});

test("battle movement and rally orders use each match's terrain and hold clears existing paths", t => {
  environment(t);
  for (const map of mapIds) {
    const canvas = new FakeCanvas();
    const match = createMatch("normal", `commands-${map}`, false, map);
    const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
    try {
      battle.selectAll();
      const target = nearestOpen({ x: 17.5, y: 14.5 }, map);
      canvas.emit("pointerdown", { button: 2, clientX: 100 + target.x * 20, clientY: 50 + target.y * 20 });
      const own = match.units.filter(unit => unit.team === 1);
      assert.ok(own.every(unit => unit.path.length > 0));
      assert.ok(own.every(unit => unit.path.every(point => passable(point, map))), map);
      assert.ok(own.some(unit => unit.path.at(-1)?.x === target.x && unit.path.at(-1)?.y === target.y), map);
      battle.hold();
      assert.ok(own.every(unit => unit.order.mode === "hold" && unit.path.length === 0));
      const city = match.cities.find(item => item.owner === 1)!;
      const cityPointer = { clientX: 100 + city.x * 20, clientY: 50 + city.y * 20 };
      canvas.emit("pointerdown", cityPointer); canvas.emit("pointerup", cityPointer);
      assert.equal(battle.rally(), true);
      assert.equal(battle.rallyPending(), true);
      const rallyPoint = { x: 23.5, y: 14.5 };
      const rallyPointer = { clientX: 100 + rallyPoint.x * 20, clientY: 50 + rallyPoint.y * 20 };
      canvas.emit("pointerdown", rallyPointer); canvas.emit("pointerup", rallyPointer);
      assert.deepEqual(city.rally, nearestOpen(rallyPoint, map));
      assert.equal(battle.rallyPending(), false);
    } finally { battle.dispose(); }
  }
});

test("surrender commits exactly once without waiting for an animation frame", t => {
  const env = environment(t);
  const match = createMatch("easy", "immediate-result", false, "plains");
  let finished = 0;
  const battle = startBattle(match, new FakeCanvas().asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => { finished++; });
  try {
    battle.surrender(); battle.surrender();
    assert.equal(match.result, "lost");
    assert.equal(finished, 1);
    env.runFrame(1000); env.runFrame(1050);
    assert.equal(finished, 1);
  } finally { battle.dispose(); }
});
