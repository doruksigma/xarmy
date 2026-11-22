import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "./ai";
import { CAPTURE, GRACE, STEP, dist, units } from "./config";
import { createMatch, orderUnit, send, step, supply } from "./engine";
import type { Match } from "./engine";
import { validMatch } from "./storage";
import { cities, clearShot, passable, route, tileAt } from "./terrain";

const match = () => createMatch("normal", "test-match", false);
const advance = (state: Match, seconds: number, ai = false) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(state, STEP, [], ai ? decide : () => {});
};

test("the single map connects every city, and routes respect bridge and corner rules", () => {
  for (const from of cities) for (const to of cities) {
    const path = route(from, to, "heavy");
    assert.ok(path.length);
    assert.deepEqual(path.at(-1), { x: to.x, y: to.y });
    assert.ok(path.every(passable));
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      if (a.x !== b.x && a.y !== b.y) {
        assert.ok(passable({ x: a.x, y: b.y }));
        assert.ok(passable({ x: b.x, y: a.y }));
      }
    }
  }
  assert.ok(route(cities[0], cities[2], "light").some((point) => tileAt(point) === "bridge"));
  assert.equal(clearShot({ x: 13.5, y: 13.5 }, { x: 20.5, y: 13.5 }), false);
  assert.equal(clearShot({ x: 14.25, y: 11.8 }, { x: 13.8, y: 12.25 }), false);
});

test("formations physically advance, use different endpoints, and avoid impassable tiles", () => {
  const state = match();
  const group = state.units.filter((unit) => unit.team === 1);
  state.units = group;
  const destination = { x: 33.5, y: 10.5 };
  send(group, destination);
  assert.equal(new Set(group.map((unit) => JSON.stringify(unit.path.at(-1)))).size, group.length);
  for (let i = 0; i < 1_450; i++) {
    advance(state, STEP);
    assert.ok(group.every(passable));
  }
  assert.ok(group.every((unit) => dist(unit, destination) < 3));
  assert.ok(group.every((unit) => unit.order.mode === "hold"));
});

test("contested cities pause capture and departure resets progress; capturing cancels production", () => {
  const state = match();
  const city = state.cities[4];
  const blue = state.units[0];
  const red = state.units[4];
  Object.assign(blue, { x: city.x, y: city.y });
  advance(state, 2);
  assert.ok(city.progress > 1.9);
  Object.assign(red, { x: city.x, y: city.y });
  const progress = city.progress;
  advance(state, STEP);
  assert.equal(city.progress, progress);
  Object.assign(red, { x: 43.5, y: 16.5 });
  Object.assign(blue, { x: 4.5, y: 13.5 });
  advance(state, STEP);
  assert.equal(city.progress, 0);
  city.owner = 2;
  city.build = { kind: "heavy", elapsed: 1 };
  city.repeat = true;
  city.rally = { x: 12.5, y: 20.5 };
  Object.assign(blue, { x: city.x, y: city.y });
  advance(state, CAPTURE);
  assert.equal(city.owner, 1);
  assert.equal(city.build, null);
  assert.equal(city.rally, null);
  assert.equal(city.repeat, false);
  assert.equal(state.report.captured, 1);
});

test("production obeys build time and supply and sends reinforcements to a rally point", () => {
  const state = match();
  const city = state.cities[0];
  city.build = { kind: "heavy", elapsed: 0 };
  city.rally = { x: 7.5, y: 14.5 };
  state.cities[1].owner = 0;
  advance(state, 20);
  assert.equal(city.build?.elapsed, 0);
  state.cities[1].owner = 1;
  advance(state, units.heavy.build - STEP);
  assert.equal(supply(state, 1).used, 5);
  advance(state, STEP);
  assert.equal(supply(state, 1).used, 7);
  assert.equal(state.units.at(-1)?.order.mode, "move");
  assert.equal(city.build, null);
});

test("attrition has a grace period, marks the newest excess, and stops on recovery", () => {
  const state = match();
  state.cities[0].build = { kind: "heavy", elapsed: units.heavy.build - STEP };
  advance(state, STEP);
  const latest = state.units.at(-1)!;
  state.cities[1].owner = 0;
  advance(state, GRACE - STEP);
  assert.deepEqual(state.units.filter((unit) => unit.team === 1 && unit.marked).map((unit) => unit.id), [latest.id]);
  assert.equal(latest.hp, units.heavy.hp);
  advance(state, STEP * 2);
  assert.ok(latest.hp < units.heavy.hp);
  state.cities[1].owner = 1;
  const hp = latest.hp;
  advance(state, 2);
  assert.equal(latest.hp, hp);
  assert.equal(latest.marked, false);
});

test("attacks require clear range, simultaneous elimination draws, and a cityless army survives", () => {
  const state = match();
  const [blue, red] = [state.units[0], state.units[4]];
  Object.assign(blue, { x: 13.8, y: 13.5 });
  Object.assign(red, { x: 20.1, y: 13.5 });
  state.units = [blue, red];
  for (const city of state.cities) city.owner = 0;
  advance(state, 1);
  assert.equal(state.result, null);
  assert.equal(blue.hp, units.light.hp);
  Object.assign(blue, { x: 5.5, y: 4.5, hp: 1 });
  Object.assign(red, { x: 6.5, y: 4.5, hp: 1 });
  orderUnit(blue, { mode: "attack", target: red.id });
  advance(state, STEP);
  assert.equal(state.result, "draw");
  assert.deepEqual(state.units, []);
});

test("AI produces, captures territory, and loaded snapshots continue deterministically", () => {
  const state = match();
  advance(state, 55, true);
  assert.ok(state.units.some((unit) => unit.team === 2 && unit.id > 8));
  assert.ok(state.cities.filter((city) => city.owner === 2).length > 2);
  const snapshot: unknown = JSON.parse(JSON.stringify(state));
  assert.ok(validMatch(snapshot));
  advance(state, 20, true);
  advance(snapshot, 20, true);
  assert.deepEqual(snapshot, state);
  assert.equal(validMatch({ ...state, version: 2 }), false);
  assert.equal(validMatch({ ...state, units: [{}] }), false);
});

test("eliminating both enemy holdings and units wins and losing both ends the match", () => {
  for (const team of [1, 2] as const) {
    const state = match();
    state.units = state.units.filter((unit) => unit.team !== team);
    for (const city of state.cities) if (city.owner === team) city.owner = 0;
    advance(state, STEP);
    assert.equal(state.result, team === 1 ? "lost" : "won");
  }
});
