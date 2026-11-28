import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE, CITY_PRODUCTION, GRACE, HEIGHT, INITIAL_ARMY_SIZE, INITIAL_HEAVY_ARMIES, INITIAL_HEAVY_CITIES, STEP, WIDTH, dist, units } from "./config";
import type { Kind, Owner, Point, Team } from "./config";
import { canTraverse, createMatch, send, step, supply } from "./engine";
import type { City, Match, Unit } from "./engine";
import { validMatch } from "./storage";
import { clearShot, getMap, mapIds, nearestOpen, passable, route } from "./terrain";
import { TERRITORY_COLS, TERRITORY_SPACING } from "./territory";

const advance = (state: Match, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(state, STEP, [], () => {});
};
const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light"): Unit => ({
  id, team, x, y, kind, hp: units[kind].hp, cooldown: 0, stance: "manual", nextOrder: 0, pocketed: false, pocketTime: 0,
  order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
});
const city = (id: number, owner: Owner, x: number, y: number): City => ({
  id, owner, x, y, capturing: 0, progress: 0, rally: null,
  build: owner ? { kind: "light", elapsed: 0 } : null, repeat: !!owner,
});
const fixture = (army: Unit[], cities: City[], map: Match["map"] = "plains") => {
  const state = createMatch("normal", "engine-fixture", true, map);
  state.units = army; state.cities = cities;
  state.nextId = Math.max(0, ...army.map((unit) => unit.id)) + 1;
  return state;
};

test("all six maps start with equally supplied mixed armies and five spread-out armor cities per side", () => {
  assert.equal(WIDTH, 144); assert.equal(HEIGHT, 90);
  for (const map of mapIds) {
    const state = createMatch("normal", `initial-${map}`, false, map);
    assert.equal(state.version, 7); assert.equal(state.cities.length, 50);
    assert.equal("recruitment" in state, false);
    assert.equal(getMap(map).tiles.length, WIDTH * HEIGHT);
    assert.equal(state.units.length, 50); assert.equal("commanders" in state, false);
    for (const team of [1, 2] as const) {
      assert.equal(state.cities.filter((item) => item.owner === team).length, 25);
      assert.equal(state.units.filter((unit) => unit.team === team).length, 25);
      assert.deepEqual(supply(state, team), { used: 30, capacity: 125 });
      const army = state.units.filter(unit => unit.team === team);
      const armor = army.filter(unit => unit.kind === "heavy");
      assert.equal(armor.length, INITIAL_HEAVY_ARMIES);
      assert.equal(army.filter(unit => unit.kind === "light").length, INITIAL_ARMY_SIZE - INITIAL_HEAVY_ARMIES);
      assert.ok(army.every(unit => unit.hp === units[unit.kind].hp));
      assert.deepEqual(army.flatMap((unit, index) => unit.kind === "heavy" ? [index] : []), [2, 7, 12, 17, 22]);
      assert.ok(Math.max(...armor.map(unit => unit.y)) - Math.min(...armor.map(unit => unit.y)) > 65);
      const armorCities = state.cities.filter(city => city.owner === team && city.build?.kind === "heavy");
      assert.equal(armorCities.length, INITIAL_HEAVY_CITIES);
      assert.ok(Math.max(...armorCities.map(city => city.y)) - Math.min(...armorCities.map(city => city.y)) > 70);
      assert.ok(armorCities.every(city => Math.abs(city.x - WIDTH / 2) < 11));
      assert.ok(Math.max(...army.map(unit => unit.y)) - Math.min(...army.map(unit => unit.y)) > 75);
      assert.equal(new Set(army.map(unit => `${unit.x}:${unit.y}`)).size, 25);
      assert.ok(army.every(unit => unit.stance === "defend" && !("commanderId" in unit)));
    }
    assert.ok(state.units.every((unit) => passable(unit, map)));
    assert.ok(state.units.every((unit) => unit.team === 1 ? unit.x < WIDTH / 2 : unit.x > WIDTH / 2));
    for (const blue of state.units.filter((unit) => unit.team === 1)) for (const red of state.units.filter((unit) => unit.team === 2)) {
      assert.ok(dist(blue, red) > units.heavy.range, `${map}: no immediate spawn combat`);
    }
    assert.ok(state.cities.every((item) => item.build?.elapsed === 0 && item.repeat));
    for (const blue of state.cities.filter(city => city.owner === 1)) {
      const red = state.cities.find(city => city.owner === 2 && city.x === WIDTH - blue.x && city.y === HEIGHT - blue.y);
      assert.equal(red?.build?.kind, blue.build?.kind, `${map}: mirrored production type`);
    }
  }
});

test("every owned city independently recruits one soldier every sixty seconds", () => {
  const state = createMatch("normal", "automatic-cities", true, "plains");
  // Isolate city recruitment from the new support combat, while still allowing
  // both independent support clocks to produce their real reinforcements.
  const recruit = (seconds: number) => {
    for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
      for (const unit of state.units) if (unit.kind === "artillery" || unit.kind === "aircraft") {
        unit.stance = "manual"; unit.order = { mode: "hold" }; unit.path = []; unit.cooldown = 100;
      }
      step(state, STEP, [], () => {});
    }
  };
  const ordinary = () => state.units.filter(unit => unit.kind === "light" || unit.kind === "heavy");
  recruit(CITY_PRODUCTION - STEP);
  assert.equal(state.units.length, 50);
  recruit(STEP);
  assert.equal(ordinary().length, 100); assert.equal(state.units.length, 104);
  for (const team of [1, 2] as const) assert.equal(state.units.filter(unit => unit.team === team && unit.kind === "heavy").length, 10);
  assert.ok(state.cities.every((item) => item.build?.elapsed === 0 && item.repeat));
  recruit(CITY_PRODUCTION);
  assert.equal(ordinary().length, 150); assert.equal(state.units.length, 158);
  for (const team of [1, 2] as const) {
    assert.equal(ordinary().filter(unit => unit.team === team).length, 75);
    assert.equal(state.units.filter(unit => unit.team === team && unit.kind === "artillery").length, 2);
    assert.equal(state.units.filter(unit => unit.team === team && unit.kind === "aircraft").length, 2);
    assert.equal(state.units.filter(unit => unit.team === team && unit.kind === "heavy").length, 15);
    assert.deepEqual(supply(state, team), { used: 102, capacity: 125 });
  }
  assert.ok(state.units.every(unit => !("commanderId" in unit)));
});

test("resuming an existing all-light save never converts its armies, city choices or manual orders", () => {
  const state = createMatch("normal", "existing-light-save", true, "plains");
  for (const unit of state.units) { unit.kind = "light"; unit.hp = units.light.hp; unit.stance = "manual"; }
  for (const city of state.cities) if (city.build) city.build.kind = "light";
  const restored: unknown = JSON.parse(JSON.stringify(state));
  assert.ok(validMatch(restored));
  const before = structuredClone(restored.units);
  advance(restored, STEP);
  assert.deepEqual(restored.units.map(unit => ({ id: unit.id, kind: unit.kind, order: unit.order, hp: unit.hp })),
    before.map(unit => ({ id: unit.id, kind: unit.kind, order: unit.order, hp: unit.hp })));
  assert.ok(restored.cities.every(city => city.build?.kind === "light"));
});

test("capture pauses when contested and clears the captured city's old orders and production clock", () => {
  const blue = soldier(1, 1, 80.5, 20.5), red = soldier(2, 2, 100.5, 20.5);
  const target = city(2, 2, 80.5, 20.5);
  target.build = { kind: "heavy", elapsed: 0 };
  target.rally = { x: 30.5, y: 20.5 };
  const state = fixture([blue, red], [city(0, 1, 5.5, 20.5), city(1, 2, 100.5, 20.5), target]);
  // A narrow occupied approach supplies the attacker, but the whole capture
  // area still belongs to red. This tests ordinary timed capture, not a city
  // that was already engulfed by supplied blue territory before the test.
  const approachRow = Math.floor(blue.y / TERRITORY_SPACING);
  for (let x = 0; x <= Math.floor(blue.x / TERRITORY_SPACING); x++) {
    const cell = approachRow * TERRITORY_COLS + x;
    if (state.territory.owners[cell]) state.territory.owners[cell] = 1;
  }
  state.territory.revision++;
  advance(state, 2); assert.ok(target.progress > 1.9);
  Object.assign(red, { x: target.x + 0.5, y: target.y });
  const row = Math.floor(red.y / TERRITORY_SPACING);
  for (let x = Math.floor(red.x / TERRITORY_SPACING); x < TERRITORY_COLS; x++) state.territory.owners[row * TERRITORY_COLS + x] = 2;
  state.territory.revision++;
  const progress = target.progress; advance(state, STEP); assert.equal(target.progress, progress);
  Object.assign(blue, { x: 5.5, y: 20.5 }); Object.assign(red, { x: 100.5, y: 20.5 });
  advance(state, STEP); assert.equal(target.progress, 0);
  target.build = { kind: "heavy", elapsed: 0 };
  Object.assign(blue, { x: target.x, y: target.y }); advance(state, CAPTURE);
  assert.equal(target.owner, 1); assert.equal(target.build?.kind, "light");
  assert.equal(target.build!.elapsed, 0);
  assert.equal(target.repeat, true); assert.equal(target.rally, null); assert.equal(state.report.captured, 1);
  advance(state, CITY_PRODUCTION - STEP); assert.ok(target.build!.elapsed > CITY_PRODUCTION - 0.1);
  const count = state.units.filter(unit => unit.team === 1).length; advance(state, STEP);
  assert.equal(state.units.filter(unit => unit.team === 1).length, count + 1); assert.equal(target.build!.elapsed, 0);
});

test("a city's completed soldier waits at capacity and spawns after a supply point becomes free", () => {
  const army = Array.from({ length: 5 }, (_, id) => soldier(id + 1, 1, 5.5 + id, 20.5));
  const home = city(0, 1, 5.5, 20.5);
  const state = fixture(army, [home, city(1, 2, 120.5, 70.5)]);
  home.build!.elapsed = 4;
  advance(state, 12); assert.ok(Math.abs(home.build!.elapsed - 16) < 1e-7);
  advance(state, CITY_PRODUCTION - 16); assert.equal(home.build!.elapsed, CITY_PRODUCTION);
  assert.equal(supply(state, 1).used, 5);
  state.units = state.units.filter((unit) => unit.id !== 5);
  advance(state, STEP); assert.equal(supply(state, 1).used, 5); assert.equal(home.build!.elapsed, 0);
});

test("heavy and light automatic recruitment use the same explicit sixty-second city clock", () => {
  const home = city(0, 1, 5.5, 20.5); home.build = { kind: "heavy", elapsed: 0 };
  const state = fixture([soldier(1, 1, 6.5, 20.5)], [home, city(1, 2, 120.5, 70.5), city(2, 1, 20.5, 20.5)]);
  advance(state, CITY_PRODUCTION - STEP); assert.equal(state.units.filter((unit) => unit.team === 1).length, 1);
  advance(state, STEP);
  assert.equal(state.units.filter((unit) => unit.team === 1 && unit.kind === "heavy").length, 1);
  assert.equal(state.units.filter((unit) => unit.team === 1 && unit.kind === "light").length, 2);
  assert.equal(state.units.filter((unit) => unit.team === 1 && unit.kind === "artillery").length, 1);
  assert.equal(state.units.filter((unit) => unit.team === 1 && unit.kind === "aircraft").length, 1);
  assert.equal(supply(state, 1).used, 10);
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
  for (let i = 0; i < 400; i++) {
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
  // Both armies lack a grounded captor here; this isolates the line-of-sight
  // behavior from the separate closed-enclosure elimination rule.
  state.territory.owners = state.territory.owners.map(owner => owner ? 3 - owner : 0); state.territory.revision++;
  advance(state, 1); assert.equal(blue.hp, units.light.hp); assert.equal(red.hp, units.light.hp);
  Object.assign(red, { x: 120.5, y: 70.5 }); const previous = { x: blue.x, y: blue.y };
  advance(state, 1); assert.deepEqual({ x: blue.x, y: blue.y }, previous);
});

test("all maps preserve physical movement and saved simulation state exactly", () => {
  for (const map of mapIds) {
    const state = createMatch("normal", `resume-${map}`, true, map);
    const group = state.units.filter(unit => unit.team === 1).slice(0, 10);
    const target = { x: 82.5, y: 18.5 };
    send(group, target, map); advance(state, 2);
    const saved: unknown = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved), map);
    for (let i = 0; i < 160; i++) {
      advance(state, STEP); advance(saved, STEP);
      assert.ok(state.units.every((unit) => passable(unit, map)), `${map}: legal unit positions`);
    }
    assert.deepEqual(saved, state, `${map}: deterministic individual simulation`);
  }
});

test("a mixed sixteen-soldier formation crosses the enlarged river through legal bridges", () => {
  const army = Array.from({ length: 16 }, (_, id) => soldier(id + 1, 1, 61.5 + id % 4, 16.5 + Math.floor(id / 4), id % 4 ? "light" : "heavy"));
  const state = fixture(army, [city(0, 0, 5.5, 20.5), city(1, 2, 120.5, 70.5)], "valley");
  state.cities[0].owner = 1; state.cities[0].x = 10.5;
  // Preserve supply without producing soldiers along the crossing itself.
  for (let id = 2; id < 6; id++) state.cities.push(city(id, 1, 8.5, 80.5 + id));
  send(army, { x: 82.5, y: 18.5 }, state.map);
  for (let i = 0; i < 2800; i++) {
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
  advance(state, STEP); assert.equal(state.result, "draw"); assert.equal(state.units.length, 0);
  for (const team of [1, 2] as const) {
    const survivor = soldier(1, team, team === 1 ? 10.5 : 120.5, 20.5);
    const other = soldier(2, team === 1 ? 2 : 1, team === 1 ? 120.5 : 10.5, 70.5);
    const match = fixture([survivor, other], []); advance(match, STEP); assert.equal(match.result, null);
    match.units = [survivor]; advance(match, STEP); assert.equal(match.result, team === 1 ? "won" : "lost");
  }
});

test("tutorial production advances only after an automatic reinforcement actually completes", () => {
  const state = createMatch("easy", "automatic-training", true, "plains"); state.tutorial = 3;
  advance(state, CITY_PRODUCTION - STEP); assert.equal(state.tutorial, 3);
  advance(state, STEP); assert.equal(state.tutorial, 4);
});
