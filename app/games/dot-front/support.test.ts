import assert from "node:assert/strict";
import test from "node:test";
import { AIRCRAFT_DECAY, ARTILLERY_TARGET_LIMIT, HEIGHT, STEP, SUPPORT_PRODUCTION, WIDTH, dist, units } from "./config";
import type { Kind, Team } from "./config";
import { canTraverse, commandUnit, createMatch, frontlinePoint, step, supply, supportSourceCity } from "./engine";
import type { Flash, Match, Unit } from "./engine";
import { clearShot, getMap, mapIds, passable, tileAt } from "./terrain";
import { createTerritory, isSupplied, TERRITORY_COLS, TERRITORY_SPACING } from "./territory";
import { validMatch } from "./storage";

function soldier(state: Match, team: Team, kind: Kind, x: number, y: number): Unit {
  return { id: state.nextId++, team, kind, x, y, hp: units[kind].hp, cooldown: 100,
    stance: "manual", nextOrder: 0, order: { mode: "hold" }, path: [], waypoint: 0,
    replan: 0, marked: false, pocketed: false, pocketTime: 0 };
}
function advance(state: Match, seconds: number, quiet = false) {
  for (let index = 0; index < Math.round(seconds / STEP); index++) {
    if (quiet) for (const unit of state.units) { unit.stance = "manual"; unit.cooldown = 100; }
    step(state, STEP, [], () => {});
  }
}
function invaderRoad(state: Match, unit: Unit) {
  const row = Math.floor(unit.y / TERRITORY_SPACING), end = Math.floor(unit.x / TERRITORY_SPACING);
  for (let x = unit.team === 1 ? 0 : end; x <= (unit.team === 1 ? end : TERRITORY_COLS - 1); x++) {
    const cell = row * TERRITORY_COLS + x;
    if (state.territory.owners[cell]) state.territory.owners[cell] = unit.team;
  }
  state.territory.revision++;
}

test("one artillery salvo kills exactly five valid enemy ground formations, never allies, aircraft or remote units", () => {
  const state = createMatch("normal", "five-ground-kills", true, "plains");
  const gun = soldier(state, 1, "artillery", 61.5, 45.5); gun.cooldown = 0;
  const targets = [[73.5, 43.5], [73.5, 44.5], [73.5, 45.5], [73.5, 46.5], [73.5, 47.5], [74.5, 45.5]]
    .map(([x, y]) => soldier(state, 2, "heavy", x, y));
  const ally = soldier(state, 1, "light", 70.5, 45.5);
  const plane = soldier(state, 2, "aircraft", 74.5, 44.5), remote = soldier(state, 2, "light", 100.5, 45.5);
  state.units = [gun, ...targets, ally, plane, remote];
  const flashes: Flash[] = [];
  step(state, STEP, flashes, () => {});
  assert.equal(targets.filter(unit => !state.units.includes(unit)).length, ARTILLERY_TARGET_LIMIT);
  assert.equal(state.report.killed, 5); assert.equal(state.report.fallen, 0);
  assert.equal(ally.hp, units.light.hp); assert.equal(remote.hp, units.light.hp);
  assert.ok(plane.hp > units.aircraft.hp - .1);
  assert.equal(gun.hp, 22); assert.equal(gun.cooldown, 24);
  assert.equal(flashes.filter(flash => flash.kind === "artillery").length, 5);
  advance(state, 1);
  assert.equal(state.report.killed, 5, "one volley cannot kill a sixth army during its cooldown");
  assert.ok(targets.every(unit => unit.team === 2), "dead armies never switch teams");
});

test("artillery obeys mountain line of sight and only valid in-range targets can be hit", () => {
  const state = createMatch("normal", "gun-wall", true, "passes"), map = getMap(state.map);
  let pair: [{ x: number; y: number }, { x: number; y: number }] | undefined;
  for (let y = 3; y < HEIGHT - 3 && !pair; y++) for (let x = 30; x < WIDTH - 30; x++) {
    const a = { x: x - 2.5, y: y + .5 }, b = { x: x + 3.5, y: y + .5 };
    if (map.tiles[y * WIDTH + x] === "rock" && passable(a, state.map) && passable(b, state.map) && !clearShot(a, b, state.map)) { pair = [a, b]; break; }
  }
  assert.ok(pair);
  const [a, b] = pair, middle = (a.x + b.x) / 2;
  state.territory.owners = state.territory.owners.map((owner, id) => owner ? (id % TERRITORY_COLS + .5) * TERRITORY_SPACING < middle ? 1 : 2 : 0);
  state.territory.revision++;
  const gun = soldier(state, 1, "artillery", a.x, a.y), target = soldier(state, 2, "heavy", b.x, b.y);
  gun.cooldown = 0; state.units = [gun, target];
  assert.ok(isSupplied(state, 1, gun)); assert.ok(isSupplied(state, 2, target));
  const effects: Flash[] = []; step(state, STEP, effects, () => {});
  assert.equal(target.hp, units.heavy.hp); assert.equal(effects.filter(effect => effect.kind === "artillery").length, 0);
});

test("aircraft bomb a limited enemy ground cluster while allies and other aircraft survive", () => {
  const state = createMatch("normal", "air-bomb", true, "plains");
  const plane = soldier(state, 1, "aircraft", 72.5, 45.5); plane.cooldown = 0;
  const foes = [[73.5, 44.5], [73.5, 45.5], [73.5, 46.5], [74.5, 45.5]].map(([x, y]) => soldier(state, 2, "light", x, y));
  const ally = soldier(state, 1, "light", 70.5, 45.5), enemyPlane = soldier(state, 2, "aircraft", 73.5, 45.5);
  state.units = [plane, ...foes, ally, enemyPlane];
  const effects: Flash[] = []; step(state, STEP, effects, () => {});
  assert.equal(foes.filter(unit => Math.abs(unit.hp - 24) < 1e-8).length, 3);
  assert.equal(foes.filter(unit => unit.hp === 48).length, 1);
  assert.equal(ally.hp, 48); assert.ok(enemyPlane.hp > 35.9);
  assert.equal(effects.filter(effect => effect.kind === "aircraft").length, 3);
  assert.equal(plane.cooldown, 8);
});

test("a manually attacking artillery battery walks around a ridge to a legal firing position without stalling", () => {
  const state = createMatch("normal", "gun-ridge-approach", true, "fronts");
  const gun = soldier(state, 1, "artillery", 61.5, 21.5), target = soldier(state, 2, "light", 74.5, 21.5);
  gun.cooldown = 0; state.units = [gun, target];
  assert.ok(!clearShot(gun, target, state.map));
  commandUnit(state, gun.id, { mode: "attack", target: target.id });
  const flashes: Flash[] = [];
  for (let tick = 0; tick < Math.round(60 / STEP) && state.units.includes(target); tick++) {
    const previous = { x: gun.x, y: gun.y };
    step(state, STEP, flashes, () => {});
    assert.ok(canTraverse(previous, gun, state.map), "a firing approach must not clip the ridge");
  }
  assert.ok(dist(gun, { x: 61.5, y: 21.5 }) > 1);
  assert.equal(state.units.includes(target), false);
  assert.equal(state.report.killed, 1);
  assert.ok(flashes.some(flash => flash.kind === "artillery" && clearShot(flash.from, flash.to, state.map)));
});

test("aircraft cross water without occupying it, are not pocketed and lose lifetime health", () => {
  const state = createMatch("normal", "air-over-water", true, "valley");
  const plane = soldier(state, 1, "aircraft", 70.5, 35.5);
  state.units = [plane]; const territory = [...state.territory.owners];
  commandUnit(state, plane.id, { mode: "move", point: { x: 74.5, y: 35.5 } });
  advance(state, 1.5);
  assert.equal(tileAt(plane, state.map), "water"); assert.equal(passable(plane, state.map), false);
  assert.equal(plane.pocketed, false); assert.equal(plane.pocketTime, 0);
  assert.ok(Math.abs(plane.hp - (36 - 1.5 * AIRCRAFT_DECAY)) < 1e-7);
  assert.deepEqual(state.territory.owners, territory);
  assert.ok(validMatch(state), "a saved airborne position over water is valid");
  advance(state, 1.5); assert.equal(plane.x, 74.5); assert.equal(plane.y, 35.5);
});

test("automatic artillery stays behind the front while aircraft acquire ground enemies without player orders", () => {
  const state = createMatch("normal", "support-autopilot", false, "plains");
  const gun = soldier(state, 1, "artillery", 50.5, 45.5), plane = soldier(state, 1, "aircraft", 61.5, 45.5);
  gun.stance = "defend"; plane.stance = "defend";
  const enemy = soldier(state, 2, "heavy", 77.5, 45.5); state.units = [gun, plane, enemy];
  step(state, STEP, [], () => {});
  assert.equal(gun.order.mode, "move"); assert.equal(plane.order.mode, "move");
  if (gun.order.mode === "move") { assert.ok(gun.order.point.x < 65); assert.ok(isSupplied(state, 1, gun.order.point)); }
  if (plane.order.mode === "move") assert.ok(plane.order.point.x > 74);
  assert.ok(plane.x > 61.5); assert.ok(gun.x > 50.5);
});

test("support reinforcements are exactly one of each type per team each minute, in addition to ordinary city recruits", () => {
  for (const map of mapIds) {
    const state = createMatch("normal", `support-minute-${map}`, true, map), startId = state.nextId;
    advance(state, SUPPORT_PRODUCTION - STEP, true);
    assert.equal(state.units.filter(unit => unit.kind === "artillery" || unit.kind === "aircraft").length, 0);
    step(state, STEP, [], () => {});
    for (const team of [1, 2] as const) {
      const source = supportSourceCity(state, team); assert.ok(source, map);
      const support = state.units.filter(unit => unit.team === team && (unit.kind === "artillery" || unit.kind === "aircraft"));
      assert.equal(support.length, 2, map); assert.equal(support.filter(unit => unit.kind === "artillery").length, 1);
      assert.equal(support.filter(unit => unit.kind === "aircraft").length, 1);
      assert.ok(support.every(unit => dist(unit, source) <= 1.5), `${map}: support comes from the rear staging city`);
      assert.ok(dist(source, frontlinePoint(state, team, source)) >= 8);
      assert.equal(state.units.filter(unit => unit.team === team && unit.id >= startId && (unit.kind === "light" || unit.kind === "heavy")).length, 25);
      assert.deepEqual(state.support[team - 1], { artillery: 0, aircraft: 0 });
      assert.deepEqual(supply(state, team), { used: 66, capacity: 125 });
    }
    assert.ok(validMatch(state));
  }
});

test("a ready support clock waits for capacity and never banks multiple missed reinforcements", () => {
  const state = createMatch("normal", "support-capacity", true, "plains");
  const base = soldier(state, 1, "light", 15.5, 45.5);
  state.units = Array.from({ length: 125 }, (_, index) => ({ ...base, id: state.nextId++, x: 10.5 + index % 20, y: 20.5 + Math.floor(index / 20) }));
  state.support[0] = { artillery: 59.95, aircraft: 59.95 };
  advance(state, 8, true);
  assert.deepEqual(state.support[0], { artillery: 60, aircraft: 60 });
  state.units.splice(0, 6); const first = state.nextId;
  step(state, STEP, [], () => {});
  assert.equal(state.units.filter(unit => unit.id >= first && unit.team === 1).length, 2);
  assert.deepEqual(state.support[0], { artillery: 0, aircraft: 0 });
  assert.equal(supply(state, 1).used, 125);
  advance(state, 1, true);
  assert.equal(state.units.filter(unit => unit.id >= first && unit.team === 1).length, 2);
});

test("support clocks freeze without a supplied rear city and preserve their progress when it returns", () => {
  const state = createMatch("normal", "support-disconnected", true, "plains");
  state.support[0] = { artillery: 59, aircraft: 35 };
  state.territory.owners = state.territory.owners.map(owner => owner ? 3 - owner : 0); state.territory.revision++;
  advance(state, 2, true); assert.deepEqual(state.support[0], { artillery: 59, aircraft: 35 });
  state.territory = createTerritory(state.map); const first = state.nextId;
  advance(state, 1, true);
  assert.equal(state.units.filter(unit => unit.id >= first && unit.team === 1 && unit.kind === "artillery").length, 1);
  assert.ok(Math.abs(state.support[0].aircraft - 36) < 1e-7);
});

test("aircraft and artillery cannot capture cities by merely standing in the capture circle", () => {
  for (const kind of ["aircraft", "artillery"] as const) {
    const state = createMatch("normal", `support-no-city-${kind}`, true, "plains"), city = state.cities[31];
    assert.equal(city.owner, 2);
    const unit = soldier(state, 1, kind, city.x, city.y); state.units = [unit];
    if (kind === "artillery") invaderRoad(state, unit);
    advance(state, 25, true);
    assert.equal(city.owner, 2); assert.equal(city.progress, 0); assert.equal(city.capturing, 0);
    assert.equal(unit.team, 1); assert.ok(unit.hp > 0);
  }
});

test("aircraft expire after their autonomous sortie even with a full treasury and pause does not age them", () => {
  const state = createMatch("normal", "air-lifetime", true, "plains"), plane = soldier(state, 1, "aircraft", 5.5, 5.5);
  state.units = [plane]; state.economy[0].money = 10000;
  const hp = plane.hp; step(state, 0, [], () => {}); assert.equal(plane.hp, hp);
  advance(state, 119, true); assert.ok(plane.hp > 0 && plane.hp < .31);
  advance(state, 1, true); assert.equal(state.units.some(unit => unit.id === plane.id), false);
  assert.equal(plane.team, 1); assert.ok(state.report.fallen >= 1);
});

test("a destroyed or airborne support attack target does not leave invalid tracking orders", () => {
  const state = createMatch("normal", "support-target-cleanup", true, "plains");
  const gun = soldier(state, 1, "artillery", 61.5, 45.5), air = soldier(state, 2, "aircraft", 73.5, 45.5);
  state.units = [gun, air];
  commandUnit(state, gun.id, { mode: "attack", target: air.id }); assert.equal(gun.order.mode, "hold");
  gun.order = { mode: "attack", target: state.nextId++ };
  step(state, STEP, [], () => {}); assert.equal(gun.order.mode, "hold");
});
