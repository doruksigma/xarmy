import assert from "node:assert/strict";
import test from "node:test";
import { CITY_PRODUCTION, POCKET_DAMAGE, POCKET_GRACE, STEP, WIDTH, units } from "./config";
import { createMatch, setGroupStance, step } from "./engine";
import type { Match } from "./engine";
import { isSupplied, TERRITORY_COLS, TERRITORY_SPACING, territoryCell, territoryOwner } from "./territory";
import { passable, tileAt } from "./terrain";
import { validMatch } from "./storage";

function advance(state: Match, seconds: number, dt = STEP) {
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) step(state, dt, [], () => {});
}
function fixture() {
  const state = createMatch("normal", "pocket-fixture", true, "plains");
  const city = state.cities.find(item => item.x === 21.5 && item.y === 26.5)!;
  const blue = state.units.find(unit => unit.team === 1)!;
  const red = state.units.find(unit => unit.team === 2)!;
  Object.assign(blue, { x: city.x, y: city.y, stance: "manual" });
  Object.assign(red, { x: 100.5, y: 80.5, stance: "manual" });
  state.units = [blue, red];
  return { state, city, blue, red };
}
function encircle(state: Match, center: { x: number; y: number }, owner: 1 | 2) {
  const minX = Math.floor((center.x - 3) / TERRITORY_SPACING), maxX = Math.floor((center.x + 3) / TERRITORY_SPACING);
  const minY = Math.floor((center.y - 3) / TERRITORY_SPACING), maxY = Math.floor((center.y + 3) / TERRITORY_SPACING);
  for (let row = minY; row <= maxY; row++) for (let col = minX; col <= maxX; col++) {
    if (row !== minY && row !== maxY && col !== minX && col !== maxX) continue;
    assert.ok(passable({ x: (col + .5) * TERRITORY_SPACING, y: (row + .5) * TERRITORY_SPACING }, state.map));
    state.territory.owners[row * TERRITORY_COLS + col] = owner;
  }
  // The encircling army needs a real connection to its own rear. An isolated
  // ring is itself a pocket, not a license for both components to swap colors.
  for (let col = owner === 1 ? 0 : minX; col <= (owner === 1 ? maxX : TERRITORY_COLS - 1); col++) {
    const cell = minY * TERRITORY_COLS + col;
    if (state.territory.owners[cell]) state.territory.owners[cell] = owner;
  }
  state.territory.revision++;
  return Math.floor(center.y / TERRITORY_SPACING) * TERRITORY_COLS + minX;
}

test("a closed grounded ring takes the land and city, kills trapped soldiers and clears dead targets once", () => {
  const { state, city, blue, red } = fixture();
  city.build = { kind: "heavy", elapsed: 12 }; city.rally = { x: 15.5, y: city.y };
  red.order = { mode: "attack", target: blue.id };
  assert.equal(isSupplied(state, 1, blue), true);
  encircle(state, blue, 2);
  assert.equal(city.owner, 1); assert.equal(territoryOwner(state, blue), 1);
  assert.equal(isSupplied(state, 1, blue), false); assert.equal(isSupplied(state, 1, city), false);
  advance(state, STEP);
  assert.equal(blue.hp, 0); assert.equal(blue.team, 1, "soldiers never change team");
  assert.equal(state.units.some(unit => unit.id === blue.id), false);
  assert.equal(state.units.filter(unit => unit.team === 2).length, 1);
  assert.equal(red.order.mode, "hold");
  assert.equal(city.owner, 2); assert.equal(city.rally, null);
  assert.equal(city.build?.kind, "light"); assert.equal(city.progress, 0); assert.equal(city.capturing, 0);
  assert.equal(territoryOwner(state, blue), 2); assert.equal(state.report.fallen, 1);
  advance(state, 2); assert.equal(state.report.fallen, 1); assert.equal(city.owner, 2);
});

test("one open friendly corridor prevents capture until an enemy physically seals it", () => {
  const { state, city, blue, red } = fixture();
  const opening = encircle(state, blue, 2);
  state.territory.owners[opening] = 1; state.territory.revision++;
  advance(state, 2);
  assert.equal(state.units.includes(blue), true); assert.equal(city.owner, 1);
  assert.equal(blue.pocketed, false); assert.equal(blue.pocketTime, 0);
  Object.assign(red, { x: (opening % TERRITORY_COLS + .5) * TERRITORY_SPACING,
    y: (Math.floor(opening / TERRITORY_COLS) + .5) * TERRITORY_SPACING });
  advance(state, STEP);
  assert.equal(state.units.includes(blue), false); assert.equal(city.owner, 2);
  assert.equal(red.team, 2); assert.equal(state.report.fallen, 1);
});

test("supply isolation without a grounded captor retains its grace period and paused city timer", () => {
  const { state, city, blue, red } = fixture();
  state.territory.owners = state.territory.owners.map(owner => owner ? 3 - owner : 0);
  state.territory.revision++;
  Object.assign(blue, { x: 100.5, y: 45.5 }); Object.assign(red, { x: 40.5, y: 45.5 });
  city.build!.elapsed = CITY_PRODUCTION - 5;
  advance(state, POCKET_GRACE);
  assert.equal(state.units.includes(blue), true); assert.ok(Math.abs(blue.hp - units.light.hp) < 1e-7);
  assert.equal(city.build!.elapsed, CITY_PRODUCTION - 5);
  advance(state, 2);
  assert.ok(Math.abs(blue.hp - units.light.hp + POCKET_DAMAGE * 2) < 1e-7);
  const hp = blue.hp;
  state.territory.owners = state.territory.owners.map(owner => owner ? 1 : 0); state.territory.revision++;
  advance(state, STEP); assert.equal(blue.pocketed, false); assert.equal(blue.pocketTime, 0);
  advance(state, 1); assert.equal(blue.hp, hp);
});

test("both sides lose enclosed soldiers simultaneously without conversions or duplicate result reports", () => {
  const { state, blue, red } = fixture(); state.cities = [];
  Object.assign(blue, { x: 100.5, y: 30.5 }); Object.assign(red, { x: 30.5, y: 60.5 });
  for (const unit of [blue, red]) {
    const center = territoryCell(unit);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) state.territory.owners[center + dy * TERRITORY_COLS + dx] = unit.team;
  }
  state.territory.revision++;
  advance(state, STEP);
  assert.equal(state.result, "draw"); assert.equal(state.units.length, 0);
  assert.equal(blue.team, 1); assert.equal(red.team, 2);
  assert.deepEqual(state.report, { captured: 0, killed: 1, fallen: 1 });
  advance(state, 1); assert.deepEqual(state.report, { captured: 0, killed: 1, fallen: 1 });
});

test("a saved completed enclosure resumes with identical land, city and soldier losses", () => {
  const { state, blue } = fixture(); encircle(state, blue, 2);
  const saved = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved));
  advance(state, 1); advance(saved, 1);
  assert.deepEqual(saved, state); assert.ok(validMatch(state));
  assert.equal(state.units.some(unit => unit.id === blue.id), false);
  assert.equal(state.report.fallen, 1);
});

test("attack stance chooses enemy ground beyond rivers and retains its crossing order", () => {
  const state = createMatch("normal", "crossing-assault", false, "valley");
  state.units = state.units.filter(unit => unit.team === 1);
  const ids = state.units.map(unit => unit.id);
  for (const unit of state.units) unit.stance = "manual";
  setGroupStance(state, ids, "attack");
  assert.ok(state.units.every(unit => unit.order.mode === "move" && unit.order.point.x > WIDTH / 2));
  assert.ok(state.units.some(unit => unit.path.some(point => tileAt(point, state.map) === "bridge")));
  const unit = state.units[3], target = unit.order.mode === "move" ? structuredClone(unit.order.point) : null;
  advance(state, 4);
  assert.equal(unit.order.mode, "move");
  if (unit.order.mode === "move") assert.deepEqual(unit.order.point, target);
  advance(state, 100);
  assert.ok(state.units.some(troop => ids.includes(troop.id) && troop.x > 82), "attack must pass the first shallow frontier goal");
  assert.ok(state.units.every(troop => passable(troop, state.map)));
  assert.ok(state.territory.owners[territoryCell({ x: 72.5, y: 18.5 })] !== 0);
});
