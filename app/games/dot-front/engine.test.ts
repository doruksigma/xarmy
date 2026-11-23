import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE, CITY_PRODUCTION, GRACE, HEIGHT, STEP, WIDTH, dist, units } from "./config";
import type { Kind, Owner, Point, Team } from "./config";
import { canTraverse, commanderMembers, createMatch, maintainCommanders, send, step, supply } from "./engine";
import type { City, Match, Unit } from "./engine";
import { validMatch } from "./storage";
import { clearShot, getMap, mapIds, nearestOpen, passable, route } from "./terrain";

const advance = (state: Match, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(state, STEP, [], () => {});
};
const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light"): Unit => ({
  id, team, x, y, kind, hp: units[kind].hp, cooldown: 0, commanderId: 0,
  order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
});
const city = (id: number, owner: Owner, x: number, y: number): City => ({
  id, owner, x, y, capturing: 0, progress: 0, rally: null,
  build: owner ? { kind: "light", elapsed: 0 } : null, repeat: !!owner,
});
const fixture = (army: Unit[], cities: City[], map: Match["map"] = "plains") => {
  const state = createMatch("normal", "engine-fixture", true, map);
  state.units = army; state.cities = cities; state.commanders = []; state.nextCommanderId = 1;
  state.nextId = Math.max(0, ...army.map((unit) => unit.id)) + 1;
  maintainCommanders(state);
  for (const commander of state.commanders) commander.autoFront = false;
  return state;
};

test("all six expanded maps start with fifty owned cities and fifty frontline soldiers", () => {
  assert.equal(WIDTH, 144); assert.equal(HEIGHT, 90);
  for (const map of mapIds) {
    const state = createMatch("normal", `initial-${map}`, false, map);
    assert.equal(state.version, 2); assert.equal(state.cities.length, 50);
    assert.equal(getMap(map).tiles.length, WIDTH * HEIGHT);
    assert.equal(state.units.length, 50); assert.equal(state.commanders.length, 6);
    for (const team of [1, 2] as const) {
      assert.equal(state.cities.filter((item) => item.owner === team).length, 25);
      assert.equal(state.units.filter((unit) => unit.team === team).length, 25);
      assert.deepEqual(supply(state, team), { used: 25, capacity: 125 });
      assert.deepEqual(state.commanders.filter((item) => item.team === team).map((item) => commanderMembers(state, item.id).length), [10, 10, 5]);
    }
    assert.ok(state.units.every((unit) => passable(unit, map)));
    assert.ok(state.units.every((unit) => unit.team === 1 ? unit.x < WIDTH / 2 : unit.x > WIDTH / 2));
    for (const blue of state.units.filter((unit) => unit.team === 1)) for (const red of state.units.filter((unit) => unit.team === 2)) {
      assert.ok(dist(blue, red) > units.heavy.range, `${map}: no immediate spawn combat`);
    }
    assert.ok(state.cities.every((item) => item.build?.kind === "light" && item.build.elapsed === 0 && item.repeat));
  }
});

test("every owned city automatically recruits at ten-second intervals without player input", () => {
  const state = createMatch("normal", "automatic-cities", true, "plains");
  advance(state, CITY_PRODUCTION - STEP);
  assert.equal(state.units.length, 50);
  advance(state, STEP);
  assert.equal(state.units.length, 100);
  assert.ok(state.cities.every((item) => item.build?.elapsed === 0 && item.repeat));
  advance(state, CITY_PRODUCTION);
  assert.equal(state.units.length, 150);
  assert.ok(state.commanders.every((item) => commanderMembers(state, item.id).length <= 10));
});

test("capture pauses when contested, resets when abandoned, and restarts the new owner's production clock", () => {
  const blue = soldier(1, 1, 20.5, 20.5), red = soldier(2, 2, 100.5, 20.5);
  const target = city(2, 2, 20.5, 20.5);
  target.build = { kind: "heavy", elapsed: 0 };
  target.rally = { x: 30.5, y: 20.5 };
  const state = fixture([blue, red], [city(0, 1, 5.5, 20.5), city(1, 2, 100.5, 20.5), target]);
  advance(state, 2); assert.ok(target.progress > 1.9);
  Object.assign(red, { x: target.x + 0.5, y: target.y });
  const progress = target.progress; advance(state, STEP); assert.equal(target.progress, progress);
  Object.assign(blue, { x: 5.5, y: 20.5 }); Object.assign(red, { x: 100.5, y: 20.5 });
  advance(state, STEP); assert.equal(target.progress, 0);
  target.build = { kind: "heavy", elapsed: 0 };
  Object.assign(blue, { x: target.x, y: target.y }); advance(state, CAPTURE);
  assert.equal(target.owner, 1); assert.deepEqual(target.build, { kind: "light", elapsed: 0 });
  assert.equal(target.repeat, true); assert.equal(target.rally, null); assert.equal(state.report.captured, 1);
  advance(state, CITY_PRODUCTION - STEP); assert.ok(target.build!.elapsed > 9.9);
  const count = state.units.length; advance(state, STEP);
  assert.equal(state.units.length, count + 1); assert.equal(target.build!.elapsed, 0);
});

test("automatic recruitment pauses at supply capacity and resumes without discarding elapsed progress", () => {
  const army = Array.from({ length: 5 }, (_, id) => soldier(id + 1, 1, 5.5 + id, 20.5));
  const home = city(0, 1, 5.5, 20.5); home.build!.elapsed = 4;
  const state = fixture(army, [home, city(1, 2, 120.5, 70.5)]);
  advance(state, 12); assert.equal(home.build!.elapsed, 4);
  state.units = state.units.filter((unit) => unit.id !== 5);
  advance(state, CITY_PRODUCTION - 4 - STEP); assert.equal(supply(state, 1).used, 4);
  advance(state, STEP); assert.equal(supply(state, 1).used, 5); assert.equal(home.build!.elapsed, 0);
});

test("heavy and light automatic recruitment use the same explicit ten-second city clock", () => {
  const home = city(0, 1, 5.5, 20.5); home.build = { kind: "heavy", elapsed: 0 };
  const state = fixture([soldier(1, 1, 6.5, 20.5)], [home, city(1, 2, 120.5, 70.5)]);
  advance(state, CITY_PRODUCTION - STEP); assert.equal(state.units.filter((unit) => unit.team === 1).length, 1);
  advance(state, STEP);
  assert.equal(state.units.filter((unit) => unit.team === 1 && unit.kind === "heavy").length, 1);
  assert.equal(supply(state, 1).used, 3);
});

test("supply attrition preserves its grace period and stable newest-unit penalty", () => {
  const army = Array.from({ length: 5 }, (_, id) => soldier(id + 1, 1, 10.5 + id, 20.5));
  const heavy = soldier(6, 1, 16.5, 20.5, "heavy"); army.push(heavy);
  const state = fixture(army, [city(0, 1, 5.5, 20.5), city(1, 2, 120.5, 70.5)]);
  advance(state, GRACE - STEP);
  assert.deepEqual(state.units.filter((unit) => unit.team === 1 && unit.marked).map((unit) => unit.id), [heavy.id]);
  assert.equal(heavy.hp, units.heavy.hp);
  advance(state, STEP * 2); assert.ok(heavy.hp < units.heavy.hp);
  state.cities.push(city(2, 1, 20.5, 20.5));
  const hp = heavy.hp; advance(state, 2); assert.equal(heavy.hp, hp); assert.equal(heavy.marked, false);
});

function obstructedCorner(map: Match["map"]): { from: Point; to: Point } {
  for (let y = 1; y < HEIGHT - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
    if (passable({ x, y }, map) || !passable({ x: x - 1, y }, map) || !passable({ x, y: y - 1 }, map)) continue;
    return { from: { x: x + 0.25, y: y - 0.2 }, to: { x: x - 0.2, y: y + 0.25 } };
  }
  throw new Error("Map has no obstacle corner");
}

test("movement replans stale corner-crossing waypoints and never clips obstacles", () => {
  const map = "valley", { from, to } = obstructedCorner(map);
  assert.ok(passable(from, map) && passable(to, map)); assert.equal(canTraverse(from, to, map), false);
  const unit = soldier(1, 1, from.x, from.y);
  const state = fixture([unit], [city(0, 1, 5.5, 20.5), city(1, 2, 120.5, 70.5)], map);
  unit.order = { mode: "move", point: to }; unit.path = [to];
  for (let i = 0; i < 140; i++) {
    const previous = { x: unit.x, y: unit.y }; advance(state, STEP);
    assert.ok(canTraverse(previous, unit, map)); assert.ok(passable(unit, map));
  }
  assert.ok(dist(unit, nearestOpen(to, map)) < 0.01); assert.equal(unit.order.mode, "hold");
});

test("mountain corners occlude fire and hold orders never pursue remote enemies", () => {
  const { from, to } = obstructedCorner("valley");
  assert.equal(clearShot(from, to, "valley"), false);
  const blue = soldier(1, 1, from.x, from.y), red = soldier(2, 2, to.x, to.y);
  const state = fixture([blue, red], [city(0, 1, 5.5, 20.5), city(1, 2, 120.5, 70.5)], "valley");
  advance(state, 1); assert.equal(blue.hp, units.light.hp); assert.equal(red.hp, units.light.hp);
  Object.assign(red, { x: 120.5, y: 70.5 }); const previous = { x: blue.x, y: blue.y };
  advance(state, 1); assert.deepEqual({ x: blue.x, y: blue.y }, previous);
});

test("all maps preserve physical movement and saved simulation state exactly", () => {
  for (const map of mapIds) {
    const state = createMatch("normal", `resume-${map}`, true, map);
    const group = commanderMembers(state, state.commanders[0].id);
    const target = { x: 82.5, y: 18.5 };
    send(group, target, map); advance(state, 2);
    const saved: unknown = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved), map);
    for (let i = 0; i < 160; i++) {
      advance(state, STEP); advance(saved, STEP);
      assert.ok(state.units.every((unit) => passable(unit, map)), `${map}: legal unit positions`);
    }
    assert.deepEqual(saved, state, `${map}: deterministic simulation and recruit membership`);
  }
});

test("a mixed sixteen-soldier formation crosses the enlarged river through legal bridges", () => {
  const army = Array.from({ length: 16 }, (_, id) => soldier(id + 1, 1, 61.5 + id % 4, 16.5 + Math.floor(id / 4), id % 4 ? "light" : "heavy"));
  const state = fixture(army, getMap("valley").cities.map((item, id) => city(id, item.owner, item.x, item.y)), "valley");
  send(army, { x: 82.5, y: 18.5 }, state.map);
  for (let i = 0; i < 700; i++) {
    advance(state, STEP); assert.ok(army.every((unit) => passable(unit, state.map)));
  }
  assert.ok(army.every((unit) => unit.x > 77));
  assert.ok(army.every((unit) => unit.order.mode === "hold"));
  assert.ok(route({ x: 61.5, y: 18.5 }, { x: 82.5, y: 18.5 }, "heavy", "valley").some((point) => getMap("valley").tiles[Math.floor(point.y) * WIDTH + Math.floor(point.x)] === "bridge"));
});

test("simultaneous extinction draws, cityless soldiers survive, and each eliminated side loses", () => {
  const blue = soldier(1, 1, 10.5, 20.5), red = soldier(2, 2, 11.5, 20.5);
  blue.hp = red.hp = 1;
  const state = fixture([blue, red], []); assert.equal(state.result, null);
  advance(state, STEP); assert.equal(state.result, "draw"); assert.equal(state.units.length, 0); assert.equal(state.commanders.length, 0);
  for (const team of [1, 2] as const) {
    const survivor = soldier(1, team, 10.5, 20.5);
    const other = soldier(2, team === 1 ? 2 : 1, 120.5, 70.5);
    const match = fixture([survivor, other], []); advance(match, STEP); assert.equal(match.result, null);
    match.units = [survivor]; advance(match, STEP); assert.equal(match.result, team === 1 ? "won" : "lost");
  }
});

test("tutorial production advances only after an automatic reinforcement actually completes", () => {
  const state = createMatch("easy", "automatic-training", true, "plains"); state.tutorial = 3;
  advance(state, CITY_PRODUCTION - STEP); assert.equal(state.tutorial, 3);
  advance(state, STEP); assert.equal(state.tutorial, 4);
});
