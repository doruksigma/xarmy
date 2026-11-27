import assert from "node:assert/strict";
import test from "node:test";
import { CITY_PRODUCTION, POCKET_DAMAGE, POCKET_FIREPOWER, POCKET_GRACE, POCKET_SPEED, STEP, WIDTH, units } from "./config";
import { commandUnit, createMatch, setGroupStance, step } from "./engine";
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
  state.territory.revision++;
  return Math.floor(center.y / TERRITORY_SPACING) * TERRITORY_COLS + minX;
}

test("an enemy occupation ring cuts supply even when the pocket contains a friendly city", () => {
  const { state, city, blue } = fixture();
  assert.equal(isSupplied(state, 1, blue), true);
  encircle(state, blue, 2);
  assert.equal(city.owner, 1); assert.equal(territoryOwner(state, blue), 1);
  assert.equal(isSupplied(state, 1, blue), false); assert.equal(isSupplied(state, 1, city), false);
  advance(state, STEP);
  assert.equal(blue.pocketed, true); assert.equal(blue.pocketTime, STEP);
});

test("pocket attrition waits twenty seconds and reconnection immediately resets its timer", () => {
  const { state, blue } = fixture();
  const opening = encircle(state, blue, 2);
  advance(state, POCKET_GRACE - STEP); assert.equal(blue.hp, units.light.hp);
  advance(state, STEP); assert.ok(Math.abs(blue.hp - units.light.hp) < 1e-7);
  advance(state, 2); assert.ok(Math.abs(blue.hp - (units.light.hp - POCKET_DAMAGE * 2)) < 1e-7);
  state.territory.owners[opening] = 1; state.territory.revision++;
  const hp = blue.hp;
  advance(state, STEP);
  assert.equal(blue.pocketed, false); assert.equal(blue.pocketTime, 0);
  advance(state, 5); assert.equal(blue.hp, hp);
});

test("encircled cities preserve production progress until a ground corridor reconnects them", () => {
  const { state, city, blue } = fixture();
  city.build!.elapsed = CITY_PRODUCTION - 5;
  const opening = encircle(state, blue, 2), before = state.units.length;
  advance(state, 12);
  assert.equal(city.build!.elapsed, CITY_PRODUCTION - 5); assert.equal(state.units.length, before);
  state.territory.owners[opening] = 1; state.territory.revision++;
  advance(state, 5 - STEP); assert.equal(state.units.length, before);
  advance(state, STEP);
  assert.equal(state.units.length, before + 1); assert.equal(city.build!.elapsed, 0);
});

test("pocket movement and firepower penalties are immediate and apply equally to both teams", () => {
  const { state, blue, red } = fixture();
  encircle(state, blue, 2);
  const start = { x: blue.x, y: blue.y };
  commandUnit(state, blue.id, { mode: "move", point: { x: start.x + 1, y: start.y } });
  advance(state, 1);
  assert.ok(Math.abs(blue.x - start.x - units.light.speed * POCKET_SPEED) < 1e-7);
  commandUnit(state, blue.id, { mode: "hold" });
  Object.assign(red, { x: blue.x + 1.5, y: blue.y });
  const blueHp = blue.hp, redHp = red.hp;
  advance(state, STEP);
  assert.equal(blue.pocketed, true); assert.equal(red.pocketed, true);
  assert.ok(Math.abs(blue.hp - (blueHp - units.light.damage * POCKET_FIREPOWER)) < 1e-7);
  assert.ok(Math.abs(red.hp - (redHp - units.light.damage * POCKET_FIREPOWER)) < 1e-7);
});

test("pocket timers, occupied cells and attrition resume deterministically from the saved match", () => {
  const { state, blue } = fixture(); encircle(state, blue, 2);
  advance(state, 5);
  const saved = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved));
  advance(state, 19); advance(saved, 19);
  assert.deepEqual(saved, state); assert.ok(validMatch(state));
  const split = JSON.parse(JSON.stringify(state));
  advance(state, 2); advance(split, 2, .1);
  assert.ok(Math.abs(state.units[0].hp - split.units[0].hp) < 1e-7);
  assert.ok(Math.abs(state.units[0].pocketTime - split.units[0].pocketTime) < 1e-7);
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
