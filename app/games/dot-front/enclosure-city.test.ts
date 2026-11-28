import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE, STEP } from "./config";
import type { Team } from "./config";
import { createMatch, step } from "./engine";
import type { City, Match } from "./engine";
import { validMatch } from "./storage";
import { isSupplied, resolveEnclosures, TERRITORY_COLS, TERRITORY_SPACING, territoryOwner } from "./territory";

function fixture(captor: Team) {
  const state = createMatch("normal", `engulfed-city-${captor}`, false, "plains");
  const city = state.cities.find(item => item.x === (captor === 1 ? 122.5 : 21.5) && item.y === (captor === 1 ? 63.5 : 26.5))!;
  state.units = [];
  city.build = { kind: "heavy", elapsed: 59 };
  city.rally = { x: city.x + 1, y: city.y };
  city.progress = 8; city.capturing = captor;
  return { state, city };
}
function row(city: City) { return Math.floor(city.y / TERRITORY_SPACING); }
function col(city: City) { return Math.floor(city.x / TERRITORY_SPACING); }
function paint(state: Match, x: number, y: number, owner: Team) {
  const cell = y * TERRITORY_COLS + x;
  if (state.territory.owners[cell]) state.territory.owners[cell] = owner;
}
function lineToRear(state: Match, x: number, y: number, owner: Team) {
  for (let next = owner === 1 ? 0 : x; next <= (owner === 1 ? x : TERRITORY_COLS - 1); next++) paint(state, next, y, owner);
}
function ring(state: Match, city: City, captor: Team) {
  const cx = col(city), cy = row(city);
  for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) {
    if (Math.abs(y - cy) === 6 || Math.abs(x - cx) === 6) paint(state, x, y, captor);
  }
  lineToRear(state, cx, cy - 6, captor);
}
function advance(state: Match, seconds: number) {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) step(state, STEP, [], () => {});
}

for (const shape of ["center", "island", "grounded trace"] as const) {
  test(`completed enclosures capture empty cities with a previously occupied ${shape}, for either side`, () => {
    for (const captor of [1, 2] as const) {
      const { state, city } = fixture(captor), before = state.cities.map(item => item.owner);
      ring(state, city, captor);
      const radius = shape === "island" ? 4 : 0;
      for (let y = row(city) - radius; y <= row(city) + radius; y++) for (let x = col(city) - radius; x <= col(city) + radius; x++) paint(state, x, y, captor);
      if (shape === "grounded trace") lineToRear(state, col(city), row(city), captor);
      state.territory.revision++;
      assert.equal(territoryOwner(state, city), captor);
      assert.equal(isSupplied(state, captor, city), shape === "grounded trace");
      advance(state, STEP);
      assert.equal(city.owner, captor);
      assert.equal(isSupplied(state, captor, city), true);
      assert.deepEqual(city.build, { kind: "light", elapsed: 0 });
      assert.equal(city.progress, 0); assert.equal(city.capturing, 0); assert.equal(city.rally, null); assert.equal(city.repeat, true);
      assert.equal(state.units.length, 0, "the captured city's nearly completed enemy production must not spawn");
      assert.equal(state.report.captured, captor === 1 ? 1 : 0);
      for (const other of state.cities) if (other !== city) assert.equal(other.owner, before[other.id], "an unrelated city must not change hands");
      advance(state, 1);
      assert.ok(Math.abs(city.build!.elapsed - 1) < 1e-8);
      assert.equal(state.report.captured, captor === 1 ? 1 : 0, "capture accounting runs once");
      assert.equal(city.owner, captor);
    }
  });
}

test("a trapped soldier on a prepainted city center dies without converting when the enclosure completes", () => {
  for (const captor of [1, 2] as const) {
    const { state, city } = fixture(captor), defender = city.owner as Team;
    const army = createMatch("normal", "enclosed-city-armies", false, "plains").units;
    const trapped = army.find(unit => unit.team === defender && unit.kind === "light")!;
    const safe = army.find(unit => unit.team === captor && unit.kind === "light")!;
    Object.assign(trapped, { x: city.x, y: city.y, stance: "manual" });
    Object.assign(safe, { x: captor === 1 ? 8.5 : 135.5, y: 4.5, stance: "manual" });
    state.units = [trapped, safe];
    ring(state, city, captor);
    paint(state, col(city), row(city), captor); state.territory.revision++;
    advance(state, STEP);
    assert.equal(city.owner, captor); assert.equal(trapped.hp, 0); assert.equal(trapped.team, defender);
    assert.deepEqual(state.units.map(unit => unit.id), [safe.id]); assert.equal(safe.team, captor);
    assert.equal(state.report.fallen, defender === 1 ? 1 : 0); assert.equal(state.report.killed, defender === 2 ? 1 : 0);
    advance(state, STEP);
    assert.equal(state.report.fallen, defender === 1 ? 1 : 0); assert.equal(state.report.killed, defender === 2 ? 1 : 0);
  }
});

test("a one-cell friendly corridor inside the capture area prevents automatic city conquest", () => {
  for (const captor of [1, 2] as const) {
    const { state, city } = fixture(captor), owner = city.owner as Team;
    ring(state, city, captor);
    lineToRear(state, col(city), row(city), captor);
    lineToRear(state, col(city), row(city) + 1, owner);
    state.territory.revision++;
    assert.equal(isSupplied(state, captor, city), true, "the enemy has already walked to the city center");
    advance(state, 1);
    assert.equal(city.owner, owner);
    assert.deepEqual(city.build, { kind: "heavy", elapsed: 59 });
    assert.equal(state.report.captured, 0);
    assert.equal(state.territory.owners[(row(city) + 1) * TERRITORY_COLS + col(city)], owner);
  }
});

test("a single soldier's grounded occupation footprint still needs the normal city capture timer", () => {
  for (const captor of [1, 2] as const) {
    const { state, city } = fixture(captor), owner = city.owner;
    city.progress = 0; city.capturing = 0;
    const soldier = createMatch("normal", "city-occupier", false, "plains").units.find(unit => unit.team === captor && unit.kind === "light")!;
    Object.assign(soldier, { x: city.x, y: city.y, stance: "manual" });
    state.units = [soldier];
    lineToRear(state, col(city), row(city), captor); state.territory.revision++;
    advance(state, CAPTURE - STEP);
    assert.equal(city.owner, owner); assert.ok(city.progress > CAPTURE - .1);
    assert.equal(territoryOwner(state, city), captor); assert.equal(isSupplied(state, captor, city), true);
    advance(state, STEP); assert.equal(city.owner, captor);
    assert.deepEqual(city.build, { kind: "light", elapsed: 0 });
    assert.equal(soldier.team, captor);
  }
});

test("a saved already-completed pocket repairs its stale city without another territory revision", () => {
  for (const captor of [1, 2] as const) {
    const { state, city } = fixture(captor);
    for (let y = row(city) - 4; y <= row(city) + 4; y++) for (let x = col(city) - 4; x <= col(city) + 4; x++) paint(state, x, y, captor);
    lineToRear(state, col(city), row(city), captor); state.territory.revision++;
    assert.equal(resolveEnclosures(state), null, "there is no new land transfer to announce");
    const saved: unknown = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved));
    const revision = saved.territory.revision;
    advance(saved, STEP);
    const restored = saved.cities.find(item => item.id === city.id)!;
    assert.equal(restored.owner, captor); assert.deepEqual(restored.build, { kind: "light", elapsed: 0 });
    assert.equal(saved.territory.revision, revision);
    assert.ok(validMatch(saved));
    advance(saved, STEP); assert.equal(saved.report.captured, captor === 1 ? 1 : 0);
  }
});

test("an entirely enemy-colored capture area without a grounded supply connection cannot take a city", () => {
  for (const captor of [1, 2] as const) {
    const { state, city } = fixture(captor), owner = city.owner;
    state.territory.owners = state.territory.owners.map(value => value ? 3 - value : 0);
    state.territory.revision++;
    assert.equal(territoryOwner(state, city), captor); assert.equal(isSupplied(state, captor, city), false);
    advance(state, 1);
    assert.equal(city.owner, owner); assert.deepEqual(city.build, { kind: "heavy", elapsed: 59 });
    assert.equal(state.report.captured, 0);
  }
});
