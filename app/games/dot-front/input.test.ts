import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { bindInput, clampCamera } from "./input";
import { GAME_SPEEDS, startBattle, summary } from "./battle";
import { createMatch, recruitmentCity } from "./engine";
import type { GameCommand } from "./commands";
import { toWorld, viewOf } from "./render";
import type { Box, Camera, View } from "./render";
import { HEIGHT, MAX_ROUTE_POINTS, POCKET_GRACE, STEP, WIDTH } from "./config";
import type { Point } from "./config";
import { mapIds, nearestOpen, passable } from "./terrain";
import { TERRITORY_COLS, TERRITORY_SPACING } from "./territory";

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
  drawnView = { x: 0, y: 0, scale: 1 };
  context = new Proxy<Record<string, unknown>>({
    translate: (x: number, y: number) => { this.drawnView.x = x; this.drawnView.y = y; },
    scale: (value: number) => { this.drawnView.scale = value; },
    measureText: (text: string) => ({ width: text.length * 7 }),
  }, {
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
  view(): View { return { ...this.drawnView, width: this.clientWidth, height: this.clientHeight }; }
  point(point: Point) { return { clientX: 100 + this.drawnView.x + point.x * this.drawnView.scale, clientY: 50 + this.drawnView.y + point.y * this.drawnView.scale }; }
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
  const cleanups: Array<() => void> = [];
  let nextFrame = 1;
  const values: Record<string, unknown> = {
    document, window,
    requestAnimationFrame(callback: FrameRequestCallback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  };
  const originals = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
    for (const key of Object.keys(values)) {
      const original = originals[key];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    document, window, frames,
    cleanup(callback: () => void) { cleanups.push(callback); },
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
  const camera: Camera = { x: WIDTH / 2, y: HEIGHT / 2, zoom: 40 / Math.min(canvas.clientWidth / WIDTH, canvas.clientHeight / HEIGHT) };
  const state = { active: true, multi: false, paused: 0, drawing: false, preview: [] as Point[], routes: [] as Point[][], box: null as Box | null,
    taps: [] as Array<{ point: Point; command: boolean; touch: boolean; add: boolean; radius: number }>,
    selections: [] as Array<{ from: Point; to: Point; add: boolean }> };
  const view = () => viewOf(canvas.clientWidth, canvas.clientHeight, camera);
  const input = bindInput(canvas.asCanvas(), {
    camera, view, active: () => state.active, multi: () => state.multi,
    drag(box) { state.box = box; }, pause() { state.paused++; },
    routeMode: () => state.drawing, preview(points) { state.preview = points; }, route(points) { state.routes.push(points); },
    tap(point, command, touch, add, radius) { state.taps.push({ point, command, touch, add, radius }); },
    select(from, to, add) { state.selections.push({ from, to, add }); },
  });
  env.cleanup(() => input.dispose());
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
  assert.deepEqual(f.state.taps[0].point, { x: WIDTH / 2 - 4, y: HEIGHT / 2 - 3 });
  f.camera.x += 2; f.camera.y += 2;
  f.tap(260, 140, { pointerType: "touch" });
  assert.deepEqual(f.state.taps[1].point, { x: WIDTH / 2 - 2, y: HEIGHT / 2 - 1 });
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
  const initialZoom = f.camera.zoom;
  f.canvas.emit("pointerdown", { pointerId: 10, pointerType: "touch", clientX: 400, clientY: 300 });
  f.canvas.emit("pointerdown", { pointerId: 11, pointerType: "touch", clientX: 600, clientY: 300 });
  f.canvas.emit("pointermove", { pointerId: 11, pointerType: "touch", clientX: 700, clientY: 320 });
  assert.ok(f.camera.zoom > initialZoom);
  assert.notEqual(f.camera.x, WIDTH / 2);
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
  assert.ok(f.camera.x > WIDTH / 2);
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
  assert.deepEqual(f.camera, { x: WIDTH / 2, y: HEIGHT / 2, zoom: 1 });
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
  env.cleanup(() => battle.dispose());
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

test("manual soldier movement and rally orders use each match's terrain without controlling another soldier", t => {
  const env = environment(t);
  for (const map of mapIds) {
    const canvas = new FakeCanvas();
    const match = createMatch("normal", `commands-${map}`, true, map);
    const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
    try {
      env.runFrame(1000);
      const unit = match.units.filter(item => item.team === 1).sort((a, b) => Math.abs(a.y - HEIGHT / 2) - Math.abs(b.y - HEIGHT / 2))[0];
      const pointer = canvas.point(unit);
      canvas.emit("pointerdown", pointer); canvas.emit("pointerup", pointer);
      const untouched = match.units.filter(other => other !== unit).map(other => JSON.stringify(other.order));
      const target = nearestOpen({ x: unit.x - 8, y: unit.y + 3 }, map);
      canvas.emit("pointerdown", { button: 2, ...canvas.point(target) });
      assert.ok(unit.path.length > 0);
      assert.ok(unit.path.every(point => passable(point, map)), map);
      assert.deepEqual(unit.path.at(-1), target);
      assert.equal(unit.stance, "manual");
      assert.deepEqual(match.units.filter(other => other !== unit).map(other => JSON.stringify(other.order)), untouched);
      battle.hold();
      assert.equal(unit.order.mode, "hold"); assert.equal(unit.path.length, 0);
      const city = match.cities.find(item => item.owner === 1)!;
      battle.pan({ x: city.x / WIDTH, y: city.y / HEIGHT }); env.runFrame(1000);
      const cityPointer = canvas.point(city);
      canvas.emit("pointerdown", cityPointer); canvas.emit("pointerup", cityPointer);
      assert.equal(battle.rally(), true);
      const rallyPoint = { x: WIDTH / 2, y: HEIGHT / 2 }, rallyPointer = canvas.point(rallyPoint);
      canvas.emit("pointerdown", rallyPointer); canvas.emit("pointerup", rallyPointer);
      assert.deepEqual(city.rally, nearestOpen(rallyPoint, map)); assert.equal(battle.rallyPending(), false);
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
    assert.equal(match.result, "lost"); assert.equal(finished, 1);
    env.runFrame(1000); env.runFrame(1050); assert.equal(finished, 1);
  } finally { battle.dispose(); }
});

test("soldier taps select only one, Shift adds individuals, and boxes select exact soldiers", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "individual-selection", true, "plains");
  const blue = match.units.filter(unit => unit.team === 1);
  const [first, second, third] = blue.slice(10, 13);
  let hud = summary(match, new Set(), null);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose()); env.runFrame(1000);
  const tap = (point: Point, extra: Record<string, unknown> = {}) => {
    canvas.emit("pointerdown", { ...canvas.point(point), ...extra });
    canvas.emit("pointerup", { ...canvas.point(point), ...extra });
  };
  tap(first); assert.equal(hud.selectedUnits, 1);
  tap(second, { shiftKey: true }); assert.equal(hud.selectedUnits, 2);
  canvas.emit("pointerdown", canvas.point({ x: third.x - .4, y: third.y - .4 }));
  canvas.emit("pointerup", canvas.point({ x: third.x + .4, y: third.y + .4 }));
  assert.equal(hud.selectedUnits, 1);
  battle.selectAll(); assert.equal(hud.selectedUnits, 25);
  battle.hold(); assert.ok(blue.every(unit => unit.stance === "manual" && unit.order.mode === "hold"));
  battle.stance("attack"); assert.equal(hud.selectedStance, "attack");
  assert.ok(blue.every(unit => unit.stance === "attack"));
  battle.deselect(); assert.equal(hud.selectedUnits, 0); assert.equal(hud.selectedStance, null);
  battle.frontlineAll(); assert.equal(hud.selectedUnits, 25); assert.equal(hud.selectedStance, "defend");
  assert.ok(blue.every(unit => unit.stance === "defend"));
});

test("select-all keeps its exact selection after new recruits and removes dead selected soldiers", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "selection-recruits", true, "plains");
  let hud = summary(match, new Set(), null);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose()); battle.selectAll();
  assert.equal(hud.selectedUnits, 25);
  const original = match.units.find(unit => unit.team === 1)!;
  match.units.push({ ...original, id: match.nextId++, x: original.x - 2, order: { mode: "hold" }, path: [], waypoint: 0 });
  env.runFrame(1000); env.runFrame(1200);
  assert.equal(hud.selectedUnits, 25);
  original.hp = 0; env.runFrame(1400);
  assert.equal(hud.selectedUnits, 24);
});

test("drawing a route records ordered world-space bends after camera scaling and ends without selecting or tapping", t => {
  const f = inputs(t); f.state.drawing = true;
  f.canvas.renderedWidth = 480; f.canvas.renderedHeight = 300;
  f.camera.x += 3; f.camera.y -= 2;
  const first = { x: 200, y: 100 }, bend = { x: 300, y: 200 }, final = { x: 400, y: 100 };
  const eventPoint = (p: Point) => ({ clientX: 100 + p.x / 2, clientY: 50 + p.y / 2 });
  f.canvas.emit("pointerdown", eventPoint(first));
  f.canvas.emit("pointermove", eventPoint(bend));
  assert.equal(f.state.preview.length, 2);
  f.canvas.emit("pointerup", eventPoint(final));
  assert.deepEqual(f.state.routes[0], [first, bend, final].map(point => toWorld(f.view(), point)));
  assert.deepEqual(f.state.preview, []);
  assert.equal(f.state.taps.length, 0); assert.equal(f.state.selections.length, 0); assert.equal(f.canvas.captures.size, 0);
});

test("route drawing is bounded, preserves the last endpoint, and cancels when two fingers pan or the tab hides", t => {
  const f = inputs(t); f.state.drawing = true;
  f.canvas.emit("pointerdown", { clientX: 200, clientY: 100 });
  for (let i = 0; i < 400; i++) f.canvas.emit("pointermove", { clientX: 200 + (i % 20) * 30, clientY: 100 + Math.floor(i / 20) * 20 });
  f.canvas.emit("pointerup", { clientX: 600, clientY: 400 });
  assert.ok(f.state.routes[0].length <= MAX_ROUTE_POINTS);
  assert.deepEqual(f.state.routes[0].at(-1), toWorld(f.view(), { x: 500, y: 350 }));
  f.canvas.emit("pointerdown", { pointerId: 10, pointerType: "touch", clientX: 300, clientY: 300 });
  f.canvas.emit("pointermove", { pointerId: 10, pointerType: "touch", clientX: 400, clientY: 300 });
  assert.ok(f.state.preview.length);
  f.canvas.emit("pointerdown", { pointerId: 11, pointerType: "touch", clientX: 500, clientY: 300 });
  assert.deepEqual(f.state.preview, []);
  f.canvas.emit("pointermove", { pointerId: 11, pointerType: "touch", clientX: 600, clientY: 320 });
  f.canvas.emit("pointerup", { pointerId: 11, pointerType: "touch", clientX: 600, clientY: 320 });
  f.canvas.emit("pointerup", { pointerId: 10, pointerType: "touch", clientX: 400, clientY: 300 });
  assert.equal(f.state.routes.length, 1);
  f.canvas.emit("pointerdown", { pointerId: 12, pointerType: "touch", clientX: 300, clientY: 300 });
  f.document.hidden = true; f.document.emit("visibilitychange");
  f.canvas.emit("pointerup", { pointerId: 12, pointerType: "touch", clientX: 400, clientY: 300 });
  assert.equal(f.state.routes.length, 1); assert.deepEqual(f.state.preview, []); assert.equal(f.canvas.captures.size, 0);
});

test("drawn battle routes control only the selected soldier and stay manual during automatic front updates", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "draw-individual-route", true, "plains");
  const unit = match.units.filter(unit => unit.team === 1)[12];
  let hud = summary(match, new Set(), null);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose()); env.runFrame(1000);
  const pointer = canvas.point(unit); canvas.emit("pointerdown", pointer); canvas.emit("pointerup", pointer);
  assert.equal(hud.selectedUnits, 1);
  battle.routeMode(true); assert.equal(hud.routeDrawing, true);
  const points = [{ x: unit.x, y: unit.y }, { x: unit.x - 2, y: unit.y + 2 }, { x: unit.x - 4, y: unit.y }];
  canvas.emit("pointerdown", canvas.point(points[0])); canvas.emit("pointermove", canvas.point(points[1])); canvas.emit("pointerup", canvas.point(points[2]));
  assert.equal(hud.routeDrawing, false); assert.equal(unit.stance, "manual"); assert.equal(unit.order.mode, "route");
  if (unit.order.mode === "route") assert.deepEqual(unit.order.points, points);
  assert.equal(match.units.filter(other => other.order.mode === "route").length, 1);
  match.tutorial = null; match.nextAi = 999;
  for (let i = 1; i <= 15; i++) env.runFrame(1000 + i * 100);
  assert.equal(unit.stance, "manual"); assert.equal(unit.order.mode, "route");
  battle.routeMode(true); battle.pause(true); assert.equal(hud.routeDrawing, false);
  env.runFrame(3000); assert.equal(hud.routeDrawing, false);
});

test("mobile battle shows individual front soldiers and production type changes preserve progress", t => {
  const env = environment(t), canvas = new FakeCanvas();
  canvas.clientWidth = canvas.renderedWidth = 390; canvas.clientHeight = canvas.renderedHeight = 500;
  const match = createMatch("normal", "mobile-front", true, "plains");
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose()); env.runFrame(1000);
  assert.ok(canvas.drawnView.scale >= 19.9);
  assert.ok(match.units.some(unit => {
    const p = canvas.point(unit); return unit.team === 1 && p.clientX > 100 && p.clientX < 490 && p.clientY > 50 && p.clientY < 550;
  }));
  const city = recruitmentCity(match, 1)!;
  match.recruitment[0] = 4;
  city.build = { kind: "light", elapsed: 4 };
  battle.pan({ x: city.x / WIDTH, y: city.y / HEIGHT }); env.runFrame(1000);
  const pointer = canvas.point(city); canvas.emit("pointerdown", pointer); canvas.emit("pointerup", pointer);
  battle.build("heavy"); assert.deepEqual(city.build, { kind: "heavy", elapsed: 4 }); assert.equal(city.repeat, true);
  battle.build("light"); assert.deepEqual(city.build, { kind: "light", elapsed: 4 });
  const hud = summary(match, new Set(), city.id);
  assert.equal(hud.isRecruitmentCity, true); assert.equal(hud.recruitmentCityId, city.id);
  assert.equal(hud.recruitmentProgress, 4); assert.equal(hud.city?.build?.elapsed, 4);
  assert.equal(match.recruitment[0], 4, "switching type must preserve the shared team clock");
  const inactive = match.cities.find(item => item.owner === 1 && item.id !== city.id)!;
  inactive.build!.elapsed = 58;
  const waiting = summary(match, new Set(), inactive.id);
  assert.equal(waiting.isRecruitmentCity, false); assert.equal(waiting.city?.build?.elapsed, 0);
  assert.equal(waiting.recruitmentProgress, 4);
});

test("every offered speed advances the fixed-step simulation by its wall-time multiplier", t => {
  const env = environment(t);
  assert.deepEqual(GAME_SPEEDS, [.5, 1, 2, 3]);
  for (const speed of GAME_SPEEDS) {
    const match = createMatch("normal", `speed-${speed}`, true, "plains");
    const battle = startBattle(match, new FakeCanvas().asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
    try {
      battle.speed(speed); env.runFrame(1000);
      for (let frame = 1; frame <= 40; frame++) env.runFrame(1000 + frame * 100);
      assert.ok(Math.abs(match.elapsed - 4 * speed) <= STEP + 1e-8, `${speed}x produced ${match.elapsed} game seconds`);
      assert.equal(env.frames.size, 1);
      // A delayed render can only add the bounded live-frame delta, not catch up
      // several minutes of unobserved battle time at the selected speed.
      const beforeStall = match.elapsed; env.runFrame(500_000);
      assert.ok(match.elapsed - beforeStall <= .15 * speed + STEP + 1e-8);
    } finally { battle.dispose(); }
  }
});

test("3x speed remains frame-rate independent and hidden tabs never catch up on resume", t => {
  const env = environment(t);
  const elapsed: number[] = [];
  for (const frameMs of [20, 100]) {
    const match = createMatch("normal", `rate-${frameMs}`, true, "plains");
    const battle = startBattle(match, new FakeCanvas().asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
    try {
      battle.speed(3); env.runFrame(1000);
      for (let time = frameMs; time <= 2000; time += frameMs) env.runFrame(1000 + time);
      elapsed.push(match.elapsed);
      const beforeHidden = match.elapsed;
      env.document.hidden = true; env.document.emit("visibilitychange");
      assert.equal(env.frames.size, 0);
      env.document.hidden = false; env.document.emit("visibilitychange");
      env.runFrame(800_000); env.runFrame(800_100);
      assert.equal(match.elapsed, beforeHidden);
      battle.pause(false); env.runFrame(800_200); env.runFrame(800_300);
      assert.ok(Math.abs(match.elapsed - beforeHidden - .3) <= STEP + 1e-8);
      battle.pause(true); const beforePause = match.elapsed;
      env.runFrame(810_000); assert.equal(match.elapsed, beforePause);
    } finally { battle.dispose(); }
  }
  assert.ok(Math.abs(elapsed[0] - elapsed[1]) <= STEP + 1e-8);
});

test("invalid speed input safely falls back to1x", t => {
  const env = environment(t);
  const match = createMatch("normal", "invalid-speed", true, "plains");
  const battle = startBattle(match, new FakeCanvas().asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose()); env.runFrame(1000);
  env.document.activeElement = null;
  battle.speed(3);
  assert.equal(env.document.activeElement, null, "changing the speed must not steal focus from its select control");
  let time = 1000;
  for (const invalid of [0, -1, 100, Infinity, NaN]) {
    const before = match.elapsed; battle.speed(invalid);
    env.runFrame(time += 100); env.runFrame(time += 100);
    assert.ok(Math.abs(match.elapsed - before - .2) <= STEP + 1e-8);
  }
});

test("HUD exposes pocket counts and the earliest selected attrition countdown", () => {
  const match = createMatch("normal", "pocket-hud", true, "plains");
  const [first, second] = match.units.filter(unit => unit.team === 1);
  const enemy = match.units.find(unit => unit.team === 2)!;
  first.pocketed = true; first.pocketTime = POCKET_GRACE - 7;
  second.pocketed = true; second.pocketTime = POCKET_GRACE + 2;
  enemy.pocketed = true;
  const one = summary(match, new Set([first.id]), null);
  assert.equal(one.bluePocketed, 2); assert.equal(one.selectedPocketed, 1); assert.equal(one.selectedPocketGrace, 7);
  const both = summary(match, new Set([first.id, second.id]), null);
  assert.equal(both.selectedPocketed, 2); assert.equal(both.selectedPocketGrace, 0);
  first.pocketed = false; first.pocketTime = 0;
  const safe = summary(match, new Set([first.id]), null);
  assert.equal(safe.selectedPocketed, 0); assert.equal(safe.selectedPocketGrace, null);
});

test("HUD distinguishes an isolated city from normal capacity shortage and clears when its corridor reopens", () => {
  const match = createMatch("normal", "isolated-city-hud", true, "plains");
  const city = match.cities.find(item => item.owner === 1)!;
  const col = Math.floor(city.x / TERRITORY_SPACING), row = Math.floor(city.y / TERRITORY_SPACING);
  assert.equal(summary(match, new Set(), city.id).cityIsolated, false);
  const ring: number[] = [];
  for (let y = row - 3; y <= row + 3; y++) for (let x = col - 3; x <= col + 3; x++) {
    if (Math.max(Math.abs(x - col), Math.abs(y - row)) !== 3) continue;
    const id = y * TERRITORY_COLS + x; match.territory.owners[id] = 2; ring.push(id);
  }
  match.territory.revision++;
  const cut = summary(match, new Set(), city.id);
  assert.equal(cut.cityIsolated, true); assert.equal(cut.blocked, true);
  assert.ok(cut.logistics.used < cut.logistics.capacity);
  for (const id of ring) match.territory.owners[id] = 1;
  match.territory.revision++;
  const open = summary(match, new Set(), city.id);
  assert.equal(open.cityIsolated, false); assert.equal(open.blocked, false);
});

test("guest selection and direct orders control actual red soldiers without mirroring the map", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "red-player", false, "plains");
  const red = match.units.filter(unit => unit.team === 2)[12], blue = match.units.find(unit => unit.team === 1)!;
  let hud = summary(match, new Set(), null, false, 2);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => {}, { team: 2, simulate: false, bot: false });
  env.cleanup(() => battle.dispose()); env.runFrame(1000);
  const redPointer = canvas.point(red);
  assert.ok(redPointer.clientX >= 100 && redPointer.clientX <= 1060, "the guest camera initially shows its own red frontline");
  canvas.emit("pointerdown", redPointer); canvas.emit("pointerup", redPointer);
  assert.equal(hud.localTeam, 2); assert.equal(hud.selectedUnits, 1);
  const blueBefore = structuredClone(match.units.filter(unit => unit.team === 1));
  const target = nearestOpen({ x: red.x + 6, y: red.y + 2 }, match.map);
  canvas.emit("pointerdown", { ...canvas.point(target), button: 2 });
  assert.equal(red.order.mode, "move");
  if (red.order.mode === "move") assert.deepEqual(red.order.point, target);
  assert.equal(red.stance, "manual");
  assert.deepEqual(match.units.filter(unit => unit.team === 1), blueBefore);
  battle.selectAll(); assert.equal(hud.selectedUnits, 25);
  battle.stance("attack"); assert.equal(hud.selectedStance, "attack");
  assert.ok(match.units.filter(unit => unit.team === 2).every(unit => unit.stance === "attack"));
  assert.deepEqual(match.units.filter(unit => unit.team === 1), blueBefore);
  battle.deselect();
  canvas.emit("pointerdown", canvas.point(blue)); canvas.emit("pointerup", canvas.point(blue));
  assert.equal(hud.selectedUnits, 0, "a left click cannot select the opponent");
  const city = match.cities.find(item => item.owner === 2)!;
  battle.pan({ x: city.x / WIDTH, y: city.y / HEIGHT }); env.runFrame(1100);
  canvas.emit("pointerdown", canvas.point(city)); canvas.emit("pointerup", canvas.point(city));
  battle.build("heavy"); assert.equal(city.build?.kind, "heavy");
  assert.equal(battle.rally(), true);
  canvas.emit("pointerdown", canvas.point(target)); canvas.emit("pointerup", canvas.point(target));
  assert.deepEqual(city.rally, target);
  battle.surrender(); assert.equal(match.result, "won"); assert.equal(hud.result, "lost");
});

test("online dispatch emits intent for every control without optimistically mutating guest state", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "network-intent", false, "plains");
  const sent: GameCommand[] = [];
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {},
    { team: 2, simulate: false, bot: false, command: cmd => sent.push(cmd) });
  env.cleanup(() => battle.dispose()); env.runFrame(1000);
  const before = structuredClone(match);
  const red = match.units.filter(unit => unit.team === 2)[12];
  canvas.emit("pointerdown", canvas.point(red)); canvas.emit("pointerup", canvas.point(red));
  const target = { x: red.x + 5, y: red.y + 1 };
  canvas.emit("pointerdown", { ...canvas.point(target), button: 2 });
  battle.hold(); battle.stance("attack");
  battle.routeMode(true);
  canvas.emit("pointerdown", canvas.point(red)); canvas.emit("pointerup", canvas.point(target));
  const city = match.cities.find(item => item.owner === 2)!;
  battle.pan({ x: city.x / WIDTH, y: city.y / HEIGHT }); env.runFrame(1100);
  canvas.emit("pointerdown", canvas.point(city)); canvas.emit("pointerup", canvas.point(city));
  battle.build("heavy"); battle.rally();
  canvas.emit("pointerdown", canvas.point(target)); canvas.emit("pointerup", canvas.point(target));
  assert.deepEqual(sent.map(command => command.kind), ["move", "order", "stance", "order", "build", "rally"]);
  assert.deepEqual(sent[0], { kind: "move", ids: [red.id], point: target });
  const route = sent[3];
  assert.equal(route.kind, "order");
  if (route.kind === "order") assert.equal(route.order.mode, "route");
  assert.deepEqual(match, before, "only authoritative snapshots or host command application may change guest state");
});

test("host bot=false never makes AI decisions while guest simulate=false never advances any simulation", t => {
  const env = environment(t);
  for (const simulate of [true, false]) {
    const canvas = new FakeCanvas(), match = createMatch("hard", `no-ai-${simulate}`, false, "plains");
    match.nextAi = 0;
    const before = structuredClone(match);
    let saved = 0, pauses = 0;
    const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => { pauses++; }, () => { saved++; }, () => {},
      { team: simulate ? 1 : 2, simulate, bot: false });
    try {
      battle.speed(3); env.runFrame(1000);
      canvas.focus(); canvas.emit("keydown", { key: "d" });
      const initialCameraX = canvas.drawnView.x;
      for (let frame = 1; frame <= 30; frame++) env.runFrame(1000 + frame * 100);
      assert.notEqual(canvas.drawnView.x, initialCameraX, "guests still pan the camera locally");
      assert.equal(match.nextAi, 0, "neither online peer should run the solo AI");
      if (simulate) assert.ok(match.elapsed > 8);
      else { assert.deepEqual(match, before); assert.equal(saved, 0); }
      env.document.hidden = true; env.document.emit("visibilitychange");
      assert.equal(pauses, 1); assert.equal(env.frames.size, 0);
      env.document.hidden = false; env.document.emit("visibilitychange");
      env.runFrame(90000); env.runFrame(90100);
      const pausedAt = match.elapsed;
      env.runFrame(90200); assert.equal(match.elapsed, pausedAt);
      if (!simulate) assert.equal(saved, 0);
    } finally { battle.dispose(); }
  }
});

test("guest snapshots replace stable match contents and refresh selection, supply, recruitment and terminal results once", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "snapshot-state", false, "plains"), originalReference = match;
  let finished = 0, hud = summary(match, new Set(), null, false, 2);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => { finished++; },
    { team: 2, simulate: false, bot: false });
  env.cleanup(() => battle.dispose()); env.runFrame(1000); battle.selectAll(); battle.routeMode(true);
  assert.equal(hud.selectedUnits, 25);
  const snapshot = structuredClone(match);
  snapshot.elapsed = 81; snapshot.recruitment = [12, 43]; snapshot.shortage[1] = 8;
  snapshot.units = snapshot.units.filter(unit => unit.team !== 2);
  snapshot.cities = snapshot.cities.map(city => ({ ...city, owner: city.owner === 2 ? 1 : city.owner }));
  battle.replaceSnapshot(snapshot);
  assert.equal(match, originalReference); assert.equal(match.elapsed, 81);
  assert.equal(hud.localTeam, 2); assert.equal(hud.selectedUnits, 0); assert.equal(hud.routeDrawing, false);
  assert.equal(hud.logistics.capacity, 0); assert.equal(hud.logistics.used, 0); assert.equal(hud.shortage, 8);
  assert.equal(hud.recruitmentProgress, 43); assert.equal(hud.recruitmentCityId, null);
  assert.equal(env.frames.size, 1); assert.equal(finished, 0);
  snapshot.elapsed = 99;
  assert.equal(match.elapsed, 81, "later transport mutations cannot alias the live match");
  snapshot.result = "lost";
  battle.replaceSnapshot(snapshot); battle.replaceSnapshot(snapshot);
  assert.equal(hud.result, "won"); assert.equal(finished, 1); assert.equal(env.frames.size, 1);
  env.runFrame(50000); env.runFrame(50100);
  assert.equal(match.elapsed, 99); assert.equal(finished, 1);
});

test("guest HUD uses red capacity, shortages and pockets while preserving canonical colors and report totals", () => {
  const match = createMatch("normal", "red-hud", false, "plains");
  const red = match.units.find(unit => unit.team === 2)!, blue = match.units.find(unit => unit.team === 1)!;
  red.pocketed = true; red.pocketTime = POCKET_GRACE - 4;
  match.shortage = [2, 7]; match.recruitment = [3, 23]; match.cities.find(city => city.owner === 2)!.owner = 1;
  match.report = { fallen: 3, captured: 2, killed: 1 }; match.result = "won";
  const source = recruitmentCity(match, 2)!;
  const hud = summary(match, new Set([red.id, blue.id]), source.id, false, 2);
  assert.equal(hud.logistics.capacity, 24 * 5); assert.equal(hud.shortage, 7);
  assert.equal(hud.playerCities, 24); assert.equal(hud.enemyCities, 26);
  assert.equal(hud.playerPocketed, 1); assert.equal(hud.bluePocketed, 0);
  assert.equal(hud.selectedUnits, 1); assert.equal(hud.selectedPocketGrace, 4);
  assert.equal(hud.recruitmentProgress, 23); assert.equal(hud.city?.build?.elapsed, 23);
  assert.equal(hud.result, "lost"); assert.deepEqual(hud.report, match.report);
});
