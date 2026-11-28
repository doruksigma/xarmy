import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE, CITY_PRODUCTION, STEP, dist, units } from "./config";
import { createMatch, step, supply } from "./engine";
import type { Match } from "./engine";
import { advanceTerritory, createTerritory, isSupplied, TERRITORY_COLS, TERRITORY_SPACING } from "./territory";
import { mapIds, passable } from "./terrain";
import { validMatch } from "./storage";

function fixture() {
  const state = createMatch("normal", "city-recruitment", true, "plains");
  for (const unit of state.units) unit.stance = "manual";
  return state;
}
function advance(state: Match, seconds: number) {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) step(state, STEP, [], () => {});
}
function connectInvader(state: Match, point: { x: number; y: number }) {
  const row = Math.floor(point.y / TERRITORY_SPACING);
  for (let x = Math.floor(point.x / TERRITORY_SPACING); x < TERRITORY_COLS; x++) {
    if (state.territory.owners[row * TERRITORY_COLS + x]) state.territory.owners[row * TERRITORY_COLS + x] = 2;
  }
  state.territory.revision++;
}

test("all six maps produce one soldier at every owned city, including cities far from the front", () => {
  for (const map of mapIds) {
    const state = createMatch("normal", `all-cities-${map}`, true, map);
    const firstId = state.nextId;
    advance(state, CITY_PRODUCTION - STEP); assert.equal(state.units.length, 50, map);
    advance(state, STEP);
    const recruits = state.units.filter(unit => unit.id >= firstId);
    assert.equal(recruits.length, 50, map);
    for (const city of state.cities) {
      assert.equal(recruits.filter(unit => unit.team === city.owner && dist(unit, city) <= 1.5).length, 1, `${map}: city ${city.id}`);
      assert.equal(city.build?.elapsed, 0); assert.equal(city.repeat, true);
    }
    assert.ok(recruits.every(unit => passable(unit, map)));
    assert.equal(recruits.filter(unit => unit.team === 1).length, 25);
    assert.equal(recruits.filter(unit => unit.team === 2).length, 25);
  }
});

test("a simultaneous fifty-soldier wave receives distinct whole-front orders on the next simulation step", () => {
  const state = createMatch("normal", "full-city-wave", false, "plains");
  step(state, 1, [], () => {});
  state.elapsed = CITY_PRODUCTION - STEP;
  for (const city of state.cities) city.build!.elapsed = CITY_PRODUCTION - STEP;
  for (const unit of state.units) unit.nextOrder = CITY_PRODUCTION + 1;
  const firstId = state.nextId;
  advance(state, STEP);
  assert.equal(state.units.length, 100);
  assert.ok(state.units.filter(unit => unit.id >= firstId).every(unit => unit.order.mode === "hold"));
  advance(state, STEP);
  assert.ok(state.units.filter(unit => unit.id >= firstId).every(unit => unit.order.mode === "move" && unit.path.length > 0));
  for (const team of [1, 2] as const) {
    const targets = state.units.filter(unit => unit.team === team).map(unit => unit.order.mode === "move" ? unit.order.point : unit);
    assert.equal(new Set(targets.map(point => `${point.x}:${point.y}`)).size, 50);
    assert.ok(Math.max(...targets.map(point => point.y)) - Math.min(...targets.map(point => point.y)) > 75);
  }
});

test("independent city clocks survive a changing frontier without moving or combining progress", () => {
  const state = fixture(), first = state.cities[0], second = state.cities[6], third = state.cities[4];
  first.build!.elapsed = 45; second.build!.elapsed = 17.25; third.build!.elapsed = 8;
  const invader = state.units.find(unit => unit.team === 2)!;
  Object.assign(invader, { x: 23.5, y: 26.5 }); connectInvader(state, invader); advanceTerritory(state);
  assert.ok(isSupplied(state, 1, second));
  advance(state, STEP);
  assert.ok(Math.abs(first.build!.elapsed - 45.05) < 1e-7);
  assert.ok(Math.abs(second.build!.elapsed - 17.3) < 1e-7);
  assert.ok(Math.abs(third.build!.elapsed - 8.05) < 1e-7);
  assert.equal(state.units.length, 50);
  assert.equal("recruitment" in state, false);
});

test("capturing a ready city cancels its old soldier and requires a full new minute for its new owner", () => {
  const state = fixture(), captured = state.cities[4], other = state.cities[0], redHome = state.cities[25];
  captured.build = { kind: "heavy", elapsed: CITY_PRODUCTION - STEP };
  captured.rally = { x: 40.5, y: captured.y };
  captured.capturing = 2; captured.progress = CAPTURE - STEP;
  other.build!.elapsed = CITY_PRODUCTION - STEP; redHome.build!.elapsed = 11;
  const invader = state.units.find(unit => unit.team === 2)!;
  Object.assign(invader, { x: captured.x, y: captured.y }); connectInvader(state, invader);
  const firstId = state.nextId;
  advance(state, STEP);
  assert.equal(captured.owner, 2); assert.equal(captured.rally, null);
  assert.deepEqual(captured.build, { kind: "light", elapsed: 0 });
  assert.equal(state.units.filter(unit => unit.id >= firstId).length, 1);
  assert.ok(dist(state.units.find(unit => unit.id === firstId)!, other) <= 1.5);
  assert.ok(Math.abs(redHome.build!.elapsed - 11.05) < 1e-7);
  advance(state, CITY_PRODUCTION - STEP);
  assert.ok(Math.abs(captured.build!.elapsed - (CITY_PRODUCTION - STEP)) < 1e-7);
  const finalId = state.nextId;
  advance(state, STEP);
  assert.equal(captured.build!.elapsed, 0);
  assert.equal(state.units.filter(unit => unit.id >= finalId && unit.team === 2 && dist(unit, captured) <= 1.5).length, 1);
});

test("ready cities wait at full capacity, then take freed slots in stable order without starving other ready cities", () => {
  const state = fixture(), first = state.cities[0], second = state.cities[1];
  for (const city of state.cities) if (city.owner === 1 && city !== first && city !== second) city.owner = 0;
  const army = state.units.filter(unit => unit.team === 1).slice(0, 10);
  state.units = [...army, state.units.find(unit => unit.team === 2)!];
  first.build = { kind: "heavy", elapsed: 58 }; second.build = { kind: "heavy", elapsed: 58 };
  state.cities.reverse();
  advance(state, 8);
  assert.equal(first.build.elapsed, 60); assert.equal(second.build.elapsed, 60);
  assert.deepEqual(supply(state, 1), { used: 10, capacity: 10 });
  state.units = state.units.filter(unit => unit.id !== army[0].id && unit.id !== army[1].id);
  const firstId = state.nextId;
  advance(state, STEP);
  assert.equal(first.build.elapsed, 0); assert.equal(second.build.elapsed, 60);
  assert.equal(state.units.find(unit => unit.id === firstId)?.kind, "heavy");
  assert.ok(dist(state.units.find(unit => unit.id === firstId)!, first) <= 1.5);
  state.units = state.units.filter(unit => unit.id !== firstId);
  const secondId = state.nextId;
  advance(state, STEP);
  assert.equal(first.build.elapsed, STEP); assert.equal(second.build.elapsed, 0);
  assert.ok(dist(state.units.find(unit => unit.id === secondId)!, second) <= 1.5);
  assert.deepEqual(supply(state, 1), { used: 10, capacity: 10 });
});

test("a heavy city's capacity wait cannot block a different city's affordable light soldier", () => {
  const state = fixture(), heavy = state.cities[0], light = state.cities[1];
  for (const city of state.cities) if (city.owner === 1 && city !== heavy && city !== light) city.owner = 0;
  state.units = [...state.units.filter(unit => unit.team === 1).slice(0, 9), state.units.find(unit => unit.team === 2)!];
  heavy.build = { kind: "heavy", elapsed: CITY_PRODUCTION - STEP };
  light.build = { kind: "light", elapsed: CITY_PRODUCTION - STEP };
  const nextId = state.nextId;
  advance(state, STEP);
  assert.equal(heavy.build.elapsed, CITY_PRODUCTION); assert.equal(light.build.elapsed, 0);
  assert.equal(state.units.find(unit => unit.id === nextId)?.kind, "light");
  assert.ok(dist(state.units.find(unit => unit.id === nextId)!, light) <= 1.5);
});

test("lost road supply pauses each city's own progress and reconnection resumes without a catch-up burst", () => {
  const state = fixture(), city = state.cities[0], other = state.cities[1];
  state.territory.owners = state.territory.owners.map(owner => owner ? 3 - owner : 0); state.territory.revision++;
  city.build!.elapsed = CITY_PRODUCTION - 5; other.build!.elapsed = 13;
  advance(state, 8);
  assert.equal(city.build!.elapsed, CITY_PRODUCTION - 5); assert.equal(other.build!.elapsed, 13);
  assert.equal(state.units.length, 50);
  state.territory = createTerritory(state.map);
  advance(state, 5 - STEP); assert.equal(state.units.length, 50);
  advance(state, STEP);
  assert.equal(state.units.length, 51); assert.equal(city.build!.elapsed, 0);
  assert.ok(Math.abs(other.build!.elapsed - 18) < 1e-7);
});

test("enclosure transfers a city's territory and ownership but discards its pending production", () => {
  const state = fixture(), city = state.cities[6], untouched = state.cities[0];
  city.build = { kind: "heavy", elapsed: CITY_PRODUCTION - STEP }; untouched.build!.elapsed = 20;
  const left = Math.floor((city.x - 3) / TERRITORY_SPACING), right = Math.floor((city.x + 3) / TERRITORY_SPACING);
  const top = Math.floor((city.y - 3) / TERRITORY_SPACING), bottom = Math.floor((city.y + 3) / TERRITORY_SPACING);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (x === left || x === right || y === top || y === bottom) state.territory.owners[y * TERRITORY_COLS + x] = 2;
  }
  // Keep the fixture's supply corridor clear of a blue starting soldier, which
  // would physically cut the red route and legitimately recapture the pocket.
  for (const unit of state.units) if (unit.team === 1 && Math.abs(unit.y - top * TERRITORY_SPACING) < 1) unit.y -= 2;
  connectInvader(state, { x: right * TERRITORY_SPACING, y: top * TERRITORY_SPACING });
  advance(state, STEP);
  assert.equal(city.owner, 2); assert.deepEqual(city.build, { kind: "light", elapsed: 0 });
  assert.equal(state.units.length, 50);
  assert.ok(Math.abs(untouched.build!.elapsed - 20.05) < 1e-7);
});

test("neutral cities never recruit and a large time step never produces more than once per city", () => {
  const state = fixture(), neutral = state.cities[0];
  neutral.owner = 0; neutral.build = { kind: "heavy", elapsed: 59.95 };
  step(state, 180, [], () => {});
  assert.equal(neutral.build, null); assert.equal(neutral.repeat, false);
  assert.equal(state.units.length, 99);
  assert.ok(state.cities.filter(city => city.owner).every(city => city.build?.elapsed === 0));
});

test("all independent city clocks, unit types and completion order survive save and resume exactly", () => {
  const state = fixture();
  state.cities[0].build = { kind: "heavy", elapsed: 59.9 };
  state.cities[1].build!.elapsed = 17.25;
  state.cities[25].build!.elapsed = 46.4;
  advance(state, STEP);
  const saved = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved));
  advance(state, 14); advance(saved, 14);
  assert.deepEqual(saved, state); assert.ok(validMatch(state));
  assert.equal(state.units.filter(unit => unit.team === 1).length, 26);
  assert.equal(state.units.filter(unit => unit.team === 2).length, 26);
  assert.equal(state.units.filter(unit => unit.kind === "heavy").length, 1);
  assert.equal(state.units.find(unit => unit.kind === "heavy")?.hp, units.heavy.hp);
});
