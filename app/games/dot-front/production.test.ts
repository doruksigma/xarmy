import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE, CITY_PRODUCTION, STEP, dist, units } from "./config";
import { createMatch, recruitmentCity, step, supply } from "./engine";
import type { Match } from "./engine";
import { frontField } from "./front";
import { advanceTerritory, isSupplied, TERRITORY_COLS, TERRITORY_SPACING } from "./territory";
import { validMatch } from "./storage";

function fixture() {
  const state = createMatch("normal", "team-recruitment", true, "plains");
  for (const unit of state.units) unit.stance = "manual";
  return state;
}
function advance(state: Match, seconds: number) {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) step(state, STEP, [], () => {});
}
function isolate(state: Match, point: { x: number; y: number }) {
  const left = Math.floor((point.x - 3) / TERRITORY_SPACING), right = Math.floor((point.x + 3) / TERRITORY_SPACING);
  const top = Math.floor((point.y - 3) / TERRITORY_SPACING), bottom = Math.floor((point.y + 3) / TERRITORY_SPACING);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (x === left || x === right || y === top || y === bottom) state.territory.owners[y * TERRITORY_COLS + x] = 2;
  }
  for (let x = right; x < TERRITORY_COLS; x++) if (state.territory.owners[top * TERRITORY_COLS + x]) state.territory.owners[top * TERRITORY_COLS + x] = 2;
  state.territory.revision++;
}

test("recruitment measures distance to the full frontier and uses city IDs to break ties", () => {
  const state = fixture();
  assert.equal(frontField(state).segments.length, 1);
  assert.equal(recruitmentCity(state, 1)?.id, 4);
  assert.equal(recruitmentCity(state, 2)?.id, 29);
  const middle = state.cities[14], farther = state.cities[3];
  state.cities = [farther, middle];
  assert.equal(recruitmentCity(state, 1), middle, "a segment midpoint is closer than its remote endpoints");
  const tie = { ...middle, id: 0, y: 64.5 };
  state.cities = [middle, tie, farther];
  assert.equal(recruitmentCity(state, 1), tie);
  state.cities.reverse();
  assert.equal(recruitmentCity(state, 1), tie, "array order must not choose the source");
});

test("physical occupation changes the source immediately and transfers one existing team clock", () => {
  const state = fixture(), old = recruitmentCity(state, 1)!;
  state.recruitment[0] = 17.25;
  old.build!.elapsed = 45; // A stale city queue cannot become extra progress.
  const invader = state.units.find(unit => unit.team === 2)!;
  Object.assign(invader, { x: 23.5, y: 26.5 });
  for (let x = Math.floor(invader.x / TERRITORY_SPACING); x < TERRITORY_COLS; x++) state.territory.owners[Math.floor(invader.y / TERRITORY_SPACING) * TERRITORY_COLS + x] = 2;
  state.territory.revision++;
  advanceTerritory(state);
  const source = recruitmentCity(state, 1)!;
  assert.equal(source.id, 6); assert.notEqual(source, old);
  assert.ok(isSupplied(state, 1, source));
  advance(state, STEP);
  assert.equal(state.recruitment[0], 17.3);
  assert.equal(source.build!.elapsed, state.recruitment[0]);
  assert.equal(old.build!.elapsed, 0);
  assert.equal(state.units.length, 50);
  assert.equal(state.cities.filter(city => city.owner === 1 && city.build!.elapsed > 0).length, 1);
});

test("capturing the selected city cancels its local orders but cannot steal or multiply team progress", () => {
  const state = fixture(), former = recruitmentCity(state, 1)!;
  state.recruitment = [CITY_PRODUCTION - STEP, 11];
  former.build = { kind: "heavy", elapsed: CITY_PRODUCTION - STEP };
  former.rally = { x: 40.5, y: former.y };
  former.capturing = 2; former.progress = CAPTURE - STEP;
  const invader = state.units.find(unit => unit.team === 2)!;
  Object.assign(invader, { x: former.x, y: former.y });
  for (let x = Math.floor(invader.x / TERRITORY_SPACING); x < TERRITORY_COLS; x++) state.territory.owners[Math.floor(invader.y / TERRITORY_SPACING) * TERRITORY_COLS + x] = 2;
  state.territory.revision++;
  const nextId = state.nextId;
  advance(state, STEP);
  assert.equal(former.owner, 2); assert.equal(former.rally, null);
  assert.deepEqual(former.build, { kind: "light", elapsed: state.recruitment[1] });
  const recruit = state.units.find(unit => unit.id === nextId)!;
  assert.equal(recruit.team, 1); assert.equal(recruit.kind, "light");
  assert.ok(dist(recruit, recruitmentCity(state, 1)!) <= 1);
  assert.equal(state.units.length, 51);
  assert.equal(state.recruitment[0], 0);
  assert.ok(Math.abs(state.recruitment[1] - 11 - STEP) < 1e-7);
});

test("a cut-off city yields recruitment to a supplied city without losing or duplicating progress", () => {
  const state = fixture(), former = recruitmentCity(state, 1)!;
  state.recruitment[0] = CITY_PRODUCTION - STEP;
  isolate(state, former);
  assert.equal(isSupplied(state, 1, former), false);
  const source = recruitmentCity(state, 1)!;
  assert.notEqual(source, former); assert.ok(isSupplied(state, 1, source));
  const nextId = state.nextId;
  advance(state, STEP);
  assert.equal(state.units.length, 51);
  assert.ok(dist(state.units.find(unit => unit.id === nextId)!, recruitmentCity(state, 1)!) <= 1);
  assert.equal(state.recruitment[0], 0); assert.equal(former.owner, 2);
  assert.equal(former.build!.elapsed, recruitmentCity(state, 2) === former ? state.recruitment[1] : 0);
});

test("selected unit kind governs capacity and a free supply point resumes the saved team timer", () => {
  const state = fixture(), source = recruitmentCity(state, 1)!;
  for (const city of state.cities) if (city.owner === 1 && city !== source) city.owner = 0;
  const army = state.units.filter(unit => unit.team === 1).slice(0, 4);
  state.units = [...army, state.units.find(unit => unit.team === 2)!];
  source.build = { kind: "heavy", elapsed: 0 };
  state.recruitment[0] = CITY_PRODUCTION - 2;
  assert.deepEqual(supply(state, 1), { used: 4, capacity: 5 });
  advance(state, 8);
  assert.equal(state.recruitment[0], CITY_PRODUCTION - 2);
  assert.equal(source.build.elapsed, CITY_PRODUCTION - 2);
  state.units = state.units.filter(unit => unit.id !== army[0].id);
  advance(state, 2 - STEP);
  assert.equal(state.units.filter(unit => unit.team === 1).length, 3);
  advance(state, STEP);
  const heavy = state.units.filter(unit => unit.team === 1 && unit.kind === "heavy");
  assert.equal(heavy.length, 1); assert.equal(heavy[0].hp, units.heavy.hp);
  assert.deepEqual(supply(state, 1), { used: 5, capacity: 5 });
  assert.equal(state.recruitment[0], 0);
});

test("a cityless side pauses its timer, resumes from a new source and never catches up in a burst", () => {
  const state = fixture(), home = recruitmentCity(state, 1)!;
  for (const city of state.cities) if (city.owner === 1) city.owner = 0;
  state.recruitment[0] = CITY_PRODUCTION - STEP;
  assert.equal(recruitmentCity(state, 1), undefined);
  advance(state, 15);
  assert.equal(state.recruitment[0], CITY_PRODUCTION - STEP);
  assert.equal(state.units.length, 50);
  // One city can supply five soldiers; leave one survivor to receive its recruit.
  state.units = state.units.filter(unit => unit.team === 2 || unit.id === 1);
  home.owner = 1;
  const count = state.units.length;
  advance(state, STEP);
  assert.equal(state.units.length, count + 1); assert.equal(state.recruitment[0], 0);
  advance(state, STEP);
  assert.equal(state.units.length, count + 1); assert.equal(state.recruitment[0], STEP);
});

test("shared timers and source changes continue identically after saving and loading", () => {
  const state = fixture();
  state.recruitment = [59.9, 46.4];
  const invader = state.units.find(unit => unit.team === 2)!;
  Object.assign(invader, { x: 23.5, y: 26.5 });
  for (let x = Math.floor(invader.x / TERRITORY_SPACING); x < TERRITORY_COLS; x++) state.territory.owners[Math.floor(invader.y / TERRITORY_SPACING) * TERRITORY_COLS + x] = 2;
  state.territory.revision++;
  advance(state, STEP);
  const saved = JSON.parse(JSON.stringify(state));
  assert.ok(validMatch(saved));
  advance(state, 14); advance(saved, 14);
  assert.deepEqual(saved, state);
  assert.equal(state.units.filter(unit => unit.team === 1).length, 26);
  assert.equal(state.units.filter(unit => unit.team === 2).length, 26);
  assert.ok(validMatch(state));
});
