import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { bindInput, clampCamera } from "./input";
import { startBattle, summary } from "./battle";
import { commanderLeader, commanderMembers, createMatch } from "./engine";
import { commanderBadge, toWorld, viewOf } from "./render";
import type { Box, Camera, View } from "./render";
import { HEIGHT, WIDTH } from "./config";
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

test("commander movement and rally orders use each match's terrain and hold clears persistent squad orders", t => {
  const env = environment(t);
  for (const map of mapIds) {
    const canvas = new FakeCanvas();
    const match = createMatch("normal", `commands-${map}`, false, map);
    const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
    try {
      const commander = match.commanders.find(item => item.team === 1)!;
      battle.selectCommander(commander.id);
      env.runFrame(1000);
      const leader = commanderLeader(match, commander.id)!;
      const target = nearestOpen({ x: leader.x - 8, y: leader.y + 3 }, map);
      canvas.emit("pointerdown", { button: 2, ...canvas.point(target) });
      const own = commanderMembers(match, commander.id);
      assert.ok(own.every(unit => unit.path.length > 0));
      assert.ok(own.every(unit => unit.path.every(point => passable(point, map))), map);
      assert.ok(own.some(unit => unit.path.at(-1)?.x === target.x && unit.path.at(-1)?.y === target.y), map);
      battle.hold();
      assert.ok(own.every(unit => unit.order.mode === "hold" && unit.path.length === 0));
      assert.equal(commander.order.mode, "hold");
      assert.equal(commander.autoFront, false);
      const city = match.cities.find(item => item.owner === 1)!;
      battle.pan({ x: city.x / WIDTH, y: city.y / HEIGHT });
      env.runFrame(1000);
      const cityPointer = canvas.point(city);
      canvas.emit("pointerdown", cityPointer); canvas.emit("pointerup", cityPointer);
      assert.equal(battle.rally(), true);
      assert.equal(battle.rallyPending(), true);
      const rallyPoint = { x: WIDTH / 2, y: HEIGHT / 2 };
      const rallyPointer = canvas.point(rallyPoint);
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

test("soldier and badge taps select complete commanders; Shift and boxes operate on full squads", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "squad-selection", true, "plains");
  const blue = match.commanders.filter(commander => commander.team === 1);
  const first = blue[1], second = blue[2];
  const firstLeader = commanderLeader(match, first.id)!;
  const secondLeader = commanderLeader(match, second.id)!;
  const shift = { x: firstLeader.x + 7 - secondLeader.x, y: firstLeader.y + 6 - secondLeader.y };
  for (const unit of commanderMembers(match, second.id)) { unit.x += shift.x; unit.y += shift.y; }
  let hud = summary(match, new Set(), null);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose());
  env.runFrame(1000);
  const tap = (point: Point, extra: Record<string, unknown> = {}) => {
    canvas.emit("pointerdown", { ...canvas.point(point), ...extra });
    canvas.emit("pointerup", { ...canvas.point(point), ...extra });
  };
  tap(commanderMembers(match, first.id).at(-1)!);
  assert.equal(hud.light + hud.heavy, 10);
  assert.deepEqual(hud.commanders.filter(commander => commander.selected).map(commander => commander.id), [first.id]);
  tap(commanderMembers(match, second.id).at(-1)!, { shiftKey: true });
  assert.equal(hud.light + hud.heavy, 15);
  assert.equal(hud.commanders.filter(commander => commander.selected).length, 2);
  const member = commanderMembers(match, first.id).at(-1)!;
  canvas.emit("pointerdown", canvas.point({ x: member.x - 0.3, y: member.y - 0.3 }));
  canvas.emit("pointerup", canvas.point({ x: member.x + 0.3, y: member.y + 0.3 }));
  assert.equal(hud.light + hud.heavy, 10);
  battle.deselect();
  const badge = commanderBadge(canvas.view(), firstLeader);
  const badgePointer = { clientX: 100 + badge.x, clientY: 50 + badge.y, pointerType: "touch" };
  canvas.emit("pointerdown", badgePointer); canvas.emit("pointerup", badgePointer);
  assert.equal(hud.light + hud.heavy, 10);
  assert.equal(hud.blueCommanders, 3);
  assert.equal(hud.redCommanders, 3);
});

test("commander panel selection persists across reinforcements and manual orders disable automatic front movement", t => {
  const env = environment(t), canvas = new FakeCanvas();
  const match = createMatch("normal", "squad-recruits", true, "plains");
  const commander = match.commanders.find(item => item.team === 1 && commanderMembers(match, item.id).length === 5)!;
  let hud = summary(match, new Set(), null);
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), value => { hud = value; }, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose());
  battle.selectCommander(commander.id);
  assert.equal(hud.light + hud.heavy, 5);
  battle.hold();
  assert.equal(commander.autoFront, false);
  assert.equal(commander.order.mode, "hold");
  battle.autoFront(true);
  assert.equal(commander.autoFront, true);
  assert.equal(hud.commanders.find(item => item.id === commander.id)?.autoFront, true);
  battle.hold();
  const original = commanderMembers(match, commander.id)[0];
  match.units.push({ ...original, id: match.nextId++, x: original.x - 2, order: { mode: "hold" }, path: [], waypoint: 0 });
  env.runFrame(1000); env.runFrame(1200);
  assert.equal(hud.light + hud.heavy, 6);
  assert.equal(hud.commanders.find(item => item.id === commander.id)?.count, 6);
  assert.equal(hud.commanders.find(item => item.id === commander.id)?.selected, true);
});

test("mobile battle starts on a visible front squad at readable scale and changing automatic city production preserves progress", t => {
  const env = environment(t), canvas = new FakeCanvas();
  canvas.clientWidth = canvas.renderedWidth = 390;
  canvas.clientHeight = canvas.renderedHeight = 500;
  const match = createMatch("normal", "mobile-front", true, "plains");
  const battle = startBattle(match, canvas.asCanvas(), new FakeCanvas().asCanvas(), () => {}, () => {}, () => {}, () => {});
  env.cleanup(() => battle.dispose());
  env.runFrame(1000);
  assert.ok(canvas.drawnView.scale >= 19.9);
  assert.ok(match.commanders.filter(commander => commander.team === 1).some(commander => {
    const leader = commanderLeader(match, commander.id)!;
    const p = canvas.point(leader);
    return p.clientX > 100 && p.clientX < 490 && p.clientY > 50 && p.clientY < 550;
  }));
  const city = match.cities.find(item => item.owner === 1)!;
  city.build = { kind: "light", elapsed: 4 };
  battle.pan({ x: city.x / WIDTH, y: city.y / HEIGHT });
  env.runFrame(1000);
  const pointer = canvas.point(city);
  canvas.emit("pointerdown", pointer); canvas.emit("pointerup", pointer);
  battle.build("heavy");
  assert.deepEqual(city.build, { kind: "heavy", elapsed: 4 });
  assert.equal(city.repeat, true);
  battle.build("light");
  assert.deepEqual(city.build, { kind: "light", elapsed: 4 });
});
