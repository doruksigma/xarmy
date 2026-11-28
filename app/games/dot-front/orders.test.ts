import assert from "node:assert/strict";
import test from "node:test";
import { CITY_PRODUCTION, FRONT_INTERVAL, HEIGHT, STEP, WIDTH, dist, units } from "./config";
import { commandUnit, createMatch, setGroupStance, setUnitStance, step } from "./engine";
import type { Match } from "./engine";
import { frontSlots } from "./front";
import { territoryOwner } from "./territory";
import { mapIds, nearestOpen, passable } from "./terrain";
import { validMatch } from "./storage";

function advance(match: Match, seconds: number) {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) step(match, STEP, [], () => {});
}
function fixture() {
  const state = createMatch("normal", "individual-orders", true, "plains");
  for (const unit of state.units) unit.stance = "manual";
  return state;
}
const targets = (state: Match, team = 1) => state.units.filter(unit => unit.team === team)
  .map(unit => unit.order.mode === "move" ? unit.order.point : { x: unit.x, y: unit.y });

test("each army starts as twenty-five individual soldiers with no commander identities", () => {
  const state = fixture();
  assert.equal(state.units.length, 50);
  assert.equal("commanders" in state, false);
  assert.equal("nextCommanderId" in state, false);
  assert.ok(state.units.every(unit => !("commanderId" in unit) && !("independent" in unit)));
  assert.equal(new Set(state.units.map(unit => unit.id)).size, 50);
});

test("a direct order changes exactly one soldier and remains manual across autonomous updates", () => {
  const state = createMatch("normal", "manual-survives", false, "plains");
  const unit = state.units[12], others = state.units.filter(other => other.id !== unit.id).map(other => structuredClone(other.order));
  commandUnit(state, unit.id, { mode: "move", point: { x: 40.5, y: unit.y } });
  assert.equal(unit.stance, "manual");
  assert.deepEqual(state.units.filter(other => other.id !== unit.id).map(other => other.order), others);
  const order = structuredClone(unit.order);
  state.recruitment[0] = CITY_PRODUCTION - STEP;
  advance(state, 3);
  assert.deepEqual(unit.order, order);
  assert.equal(unit.stance, "manual");
  assert.ok(state.units.length > 50);
  assert.ok(validMatch(state));
  const saved = JSON.parse(JSON.stringify(state));
  advance(state, 2); advance(saved, 2);
  assert.deepEqual(saved, state);
});

test("whole-front defense assigns different positions instead of piling soldiers at one point", () => {
  for (const map of mapIds) {
    const state = createMatch("normal", `wide-front-${map}`, false, map);
    for (const team of [1, 2] as const) {
      const army = state.units.filter(unit => unit.team === team);
      assert.ok(Math.max(...army.map(unit => unit.y)) - Math.min(...army.map(unit => unit.y)) > 75);
      assert.equal(new Set(army.map(unit => `${unit.x}:${unit.y}`)).size, 25);
    }
    advance(state, FRONT_INTERVAL);
    for (const team of [1, 2] as const) {
      const goals = targets(state, team);
      assert.equal(new Set(goals.map(point => `${point.x}:${point.y}`)).size, 25, `${map}: distinct destinations`);
      assert.ok(Math.max(...goals.map(point => point.y)) - Math.min(...goals.map(point => point.y)) > 65, `${map}: full front`);
      assert.ok(goals.every(point => passable(point, map)));
    }
  }
});

test("attack advances beyond defense while retaining separate destinations and a wide front", () => {
  const defend = fixture(), attack = structuredClone(defend);
  setGroupStance(defend, defend.units.filter(unit => unit.team === 1).map(unit => unit.id), "defend");
  setGroupStance(attack, attack.units.filter(unit => unit.team === 1).map(unit => unit.id), "attack");
  const defensive = targets(defend), attacking = targets(attack);
  assert.ok(attacking.reduce((sum, point) => sum + point.x, 0) / 25 > defensive.reduce((sum, point) => sum + point.x, 0) / 25 + 3);
  assert.equal(new Set(attacking.map(point => `${point.x}:${point.y}`)).size, 25);
  assert.ok(Math.max(...attacking.map(point => point.y)) - Math.min(...attacking.map(point => point.y)) > 65);
  const unit = attack.units[0], path = unit.path, deadline = unit.nextOrder;
  setUnitStance(attack, unit.id, "attack");
  assert.equal(unit.path, path); assert.equal(unit.nextOrder, deadline);
});

test("autonomous paths are not rebuilt every frame and manual hold never chases", () => {
  const state = createMatch("normal", "bounded-front", false, "plains");
  advance(state, FRONT_INTERVAL);
  const paths = state.units.map(unit => unit.path);
  const deadlines = state.units.map(unit => unit.nextOrder);
  advance(state, FRONT_INTERVAL - STEP);
  assert.deepEqual(state.units.map(unit => unit.nextOrder), deadlines);
  assert.ok(state.units.every((unit, index) => unit.path === paths[index]));
  const unit = state.units[12]; commandUnit(state, unit.id, { mode: "hold" });
  const point = { x: unit.x, y: unit.y };
  advance(state, 3);
  assert.deepEqual({ x: unit.x, y: unit.y }, point);
  assert.equal(unit.stance, "manual");
});

test("captured ground persists after departure and death until an enemy physically arrives", () => {
  const state = fixture(), unit = state.units[12];
  for (const enemy of state.units.filter(item => item.team === 2)) enemy.x = 120.5;
  const captured = { x: 75.5, y: unit.y };
  assert.equal(territoryOwner(state, captured), 2);
  commandUnit(state, unit.id, { mode: "move", point: { x: 78.5, y: unit.y } });
  advance(state, 30);
  assert.equal(territoryOwner(state, captured), 1);
  commandUnit(state, unit.id, { mode: "move", point: { x: 67.5, y: unit.y } });
  advance(state, 30);
  assert.equal(territoryOwner(state, captured), 1);
  unit.hp = 0;
  for (const city of state.cities) city.owner = city.owner === 1 ? 2 : 1;
  advance(state, STEP);
  assert.equal(territoryOwner(state, captured), 1);
  const enemy = state.units.find(item => item.team === 2)!;
  Object.assign(enemy, captured);
  advance(state, STEP);
  assert.equal(territoryOwner(state, captured), 2);
});

test("drawn routes visit each bend in order and resume within the current segment", () => {
  const state = fixture(), unit = state.units[0];
  Object.assign(unit, { x: 10.5, y: 10.5 });
  const expected = [{ x: 10.5, y: 12.5 }, { x: 12.5, y: 12.5 }, { x: 12.5, y: 10.5 }];
  const guides = structuredClone(expected);
  commandUnit(state, unit.id, { mode: "route", points: guides, next: 0 });
  guides[0].x = 99;
  const visited = new Set<number>();
  for (let tick = 0; tick < 130; tick++) {
    advance(state, STEP);
    expected.forEach((point, index) => { if (dist(unit, point) < 0.04) visited.add(index); });
    if (!visited.has(0)) assert.ok(unit.x < 10.6, "must finish the first leg before turning");
  }
  assert.ok(visited.has(0)); assert.equal(unit.order.mode, "route");
  if (unit.order.mode === "route") assert.equal(unit.order.next, 1);
  const saved = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved));
  for (let tick = 0; tick < 220; tick++) {
    advance(state, STEP); advance(saved, STEP);
    expected.forEach((point, index) => { if (dist(unit, point) < 0.04) visited.add(index); });
  }
  assert.deepEqual(saved, state); assert.deepEqual([...visited], [0, 1, 2]);
  assert.equal(unit.order.mode, "hold"); assert.equal(unit.stance, "manual");
  assert.ok(dist(unit, expected[2]) < 0.01);
});

test("obstructed guide points resolve to legal paths without skipping later reachable bends", () => {
  const state = createMatch("normal", "blocked-guide", true, "passes"), unit = state.units[0];
  Object.assign(unit, nearestOpen({ x: 65.5, y: 10.5 }, state.map));
  const blocked = { x: 71.5, y: 10.5 }, finish = { x: 65.5, y: 18.5 };
  assert.equal(passable(blocked, state.map), false);
  commandUnit(state, unit.id, { mode: "route", points: [blocked, finish], next: 0 });
  for (let tick = 0; tick < 1200; tick++) { advance(state, STEP); assert.ok(passable(unit, state.map)); }
  assert.equal(unit.order.mode, "hold"); assert.ok(dist(unit, finish) < 0.1);
  assert.ok(frontSlots(state, 1, 25).every(point => passable(point, state.map)));
});

test("slow movement uses simulation seconds independently of the step partition", () => {
  const first = fixture(), unit = first.units[0];
  Object.assign(unit, { x: 10.5, y: 10.5 });
  commandUnit(first, unit.id, { mode: "move", point: { x: 20.5, y: 10.5 } });
  const second = structuredClone(first);
  advance(first, 10);
  for (let tick = 0; tick < 100; tick++) step(second, 0.1, [], () => {});
  assert.ok(Math.abs(unit.x - 14.5) < 1e-7);
  assert.ok(Math.abs(second.units[0].x - unit.x) < 1e-7);
  assert.equal(units.light.speed, 0.4); assert.equal(units.heavy.speed, 0.25);
});

test("slow combat respects three-second attack cooldowns instead of rapid volleys", () => {
  const state = fixture();
  const blue = state.units[0], red = state.units.find(unit => unit.team === 2)!;
  state.units = [blue, red];
  Object.assign(blue, { x: 71.5, y: 10.5 }); Object.assign(red, { x: 72.5, y: 10.5 });
  advance(state, STEP);
  assert.equal(blue.hp, units.light.hp - 4); assert.equal(red.hp, units.light.hp - 4);
  advance(state, 3 - STEP);
  assert.equal(blue.hp, units.light.hp - 4);
  advance(state, STEP);
  assert.equal(blue.hp, units.light.hp - 8);
  assert.ok(blue.hp > 0 && red.hp > 0);
});

test("edge clicks and invalid routes cannot make invalid or unbounded movement state", () => {
  const state = fixture(), unit = state.units[0];
  commandUnit(state, unit.id, { mode: "move", point: { x: WIDTH, y: HEIGHT } });
  assert.equal(unit.order.mode, "move");
  if (unit.order.mode === "move") assert.ok(unit.order.point.x < WIDTH && unit.order.point.y < HEIGHT);
  const order = structuredClone(unit.order);
  commandUnit(state, unit.id, { mode: "route", points: Array.from({ length: 129 }, () => ({ x: 5, y: 5 })), next: 0 });
  assert.deepEqual(unit.order, order);
  assert.ok(validMatch(state));
});
