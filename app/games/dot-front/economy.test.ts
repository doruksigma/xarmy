import assert from "node:assert/strict";
import test from "node:test";
import { STARTING_MONEY, UPKEEP, units } from "./config";
import type { Kind } from "./config";
import { advanceEconomy, economySummary } from "./economy";
import { createMatch } from "./engine";

function allKinds() {
  const state = createMatch("normal", "money-fixture", true, "plains"), template = state.units[0];
  state.units = ([1, 2] as const).flatMap(team => (["light", "heavy", "artillery", "aircraft"] as Kind[]).map(kind => ({
    ...structuredClone(template), id: state.nextId++, kind, team, hp: units[kind].hp,
  })));
  return state;
}

test("both sides start with equal money, visible city income and the same unit upkeep rates", () => {
  const state = createMatch("normal", "fair-money", false, "plains");
  for (const team of [1, 2] as const) {
    const economy = economySummary(state, team);
    assert.equal(economy.money, STARTING_MONEY); assert.equal(economy.income, 25);
    assert.ok(Math.abs(economy.upkeep - (20 * UPKEEP.light + 5 * UPKEEP.heavy)) < 1e-7);
    assert.equal(economy.net, economy.income - economy.upkeep); assert.equal(economy.shortage, 0);
  }
  const before = state.economy[0].money; advanceEconomy(state, 10);
  assert.ok(state.economy[0].money > before); assert.deepEqual(state.economy[0], state.economy[1]);
});

test("treasury is spent before gradual maintenance losses affect every kind, without converting or deleting units", () => {
  const state = allKinds(); state.cities = [];
  const upfront = economySummary(state, 1).upkeep;
  state.economy[0].money = upfront; state.economy[1].money = 1000;
  advanceEconomy(state, 1);
  assert.equal(state.economy[0].money, 0);
  assert.ok(state.units.every(unit => unit.hp === units[unit.kind].hp));
  advanceEconomy(state, 2);
  assert.equal(state.economy[0].money, 0); assert.equal(state.economy[0].shortage, 2);
  for (const unit of state.units) {
    if (unit.team === 1) assert.ok(unit.hp < units[unit.kind].hp && unit.hp > units[unit.kind].hp * .98, unit.kind);
    else assert.equal(unit.hp, units[unit.kind].hp);
  }
  assert.equal(state.units.length, 8);
  state.economy[0].money = 100; const health = state.units.map(unit => unit.hp);
  advanceEconomy(state, .5); assert.deepEqual(state.units.map(unit => unit.hp), health); assert.equal(state.economy[0].shortage, 0);
});

test("partial funding and health attrition are independent of simulation step partition", () => {
  const state = allKinds(); state.cities = []; state.economy[0].money = .1; state.economy[1].money = .1;
  const divided = structuredClone(state);
  advanceEconomy(state, 2);
  for (let index = 0; index < 20; index++) advanceEconomy(divided, .1);
  for (let index = 0; index < state.units.length; index++) assert.ok(Math.abs(state.units[index].hp - divided.units[index].hp) < 1e-7);
  for (let team = 0; team < 2; team++) {
    assert.ok(Math.abs(state.economy[team].shortage - divided.economy[team].shortage) < 1e-7);
    assert.equal(state.economy[team].money, 0); assert.equal(divided.economy[team].money, 0);
  }
});

test("captured cities change income immediately and enough income stops losses without inventing money", () => {
  const state = allKinds(); for (const city of state.cities) city.owner = 2;
  state.economy[0].money = 0; advanceEconomy(state, 1);
  const health = state.units.filter(unit => unit.team === 1).map(unit => unit.hp);
  for (const city of state.cities.slice(0, 7)) city.owner = 1;
  assert.equal(economySummary(state, 1).income, 7);
  advanceEconomy(state, 2);
  assert.deepEqual(state.units.filter(unit => unit.team === 1).map(unit => unit.hp), health);
  assert.equal(state.economy[0].shortage, 0); assert.ok(state.economy[0].money > 0);
});

test("zero, invalid or negative time never spends money or ages the maintenance shortage", () => {
  const state = allKinds(), before = structuredClone(state);
  for (const dt of [0, -1, Infinity, NaN]) advanceEconomy(state, dt);
  assert.deepEqual(state, before);
});
