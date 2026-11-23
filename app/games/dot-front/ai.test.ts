import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "./ai";
import { STEP, difficulty, dist, units } from "./config";
import type { Kind, Owner, Team } from "./config";
import { createMatch, step, supply } from "./engine";
import type { City, Match, Unit } from "./engine";
import { mapIds, passable } from "./terrain";

const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light"): Unit => ({
  id, team, x, y, kind, hp: units[kind].hp, cooldown: 0, order: { mode: "hold" },
  path: [], waypoint: 0, replan: 0, marked: false,
});
const city = (id: number, owner: Owner, x: number, y: number): City => ({
  id, owner, x, y, capturing: 0, progress: 0, rally: null, build: null, repeat: false,
});
const fixture = (army: Unit[], cities: City[], level: Match["difficulty"] = "normal") => {
  const match = createMatch(level, "ai-unit-test", false, "plains");
  match.units = army;
  match.cities = cities;
  match.nextAi = 0;
  match.nextId = Math.max(0, ...army.map((unit) => unit.id)) + 1;
  return match;
};
const advance = (match: Match, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(match, STEP, [], decide);
};

test("difficulty changes decision timing without changing health or production rules", () => {
  for (const level of ["easy", "normal", "hard"] as const) {
    const match = fixture([soldier(1, 2, 40.5, 16.5)], [city(0, 2, 40.5, 16.5), city(1, 0, 30.5, 16.5)], level);
    decide(match);
    assert.equal(match.nextAi, difficulty[level].period);
    assert.deepEqual(match.cities[0].build, { kind: "light", elapsed: 0 });
    assert.equal(match.units[0].hp, units.light.hp);
    const snapshot = JSON.stringify(match);
    decide(match);
    assert.equal(JSON.stringify(match), snapshot);
  }
});

test("an isolated soldier does not borrow the strength of a distant army", () => {
  const lone = soldier(1, 2, 35.5, 5.5);
  const match = fixture([lone,
    ...Array.from({ length: 8 }, (_, i) => soldier(i + 2, 2, 5.5 + i * 0.2, 24.5)),
    ...Array.from({ length: 4 }, (_, i) => soldier(i + 10, 1, 25.5 + i * 0.2, 5.5, "heavy"))],
  [city(0, 2, 38.5, 5.5), city(1, 2, 5.5, 24.5), city(2, 1, 25.5, 5.5)]);
  decide(match);
  assert.notEqual(lone.order.mode, "attack");
  if (lone.order.mode === "move") assert.ok(dist(lone.order.point, match.cities[2]) > 5);
});

test("a locally outnumbered group retreats toward a safe owned city", () => {
  const red = [soldier(1, 2, 28.5, 5.5), soldier(2, 2, 28.8, 5.5)];
  const match = fixture([...red, ...Array.from({ length: 4 }, (_, i) => soldier(i + 3, 1, 31.5, 5.5 + i * 0.2, "heavy"))],
    [city(0, 2, 41.5, 5.5), city(1, 0, 20.5, 5.5)]);
  decide(match);
  for (const unit of red) {
    assert.equal(unit.order.mode, "move");
    if (unit.order.mode === "move") assert.ok(dist(unit.order.point, match.cities[0]) < 3);
  }
});

test("nearby soldiers defend a threatened city as a group", () => {
  const red = Array.from({ length: 6 }, (_, i) => soldier(i + 1, 2, 35.5, 15.5 + i * 0.1));
  const enemy = soldier(7, 1, 37.5, 15.5);
  const match = fixture([...red, enemy], [city(0, 2, 38.5, 15.5), city(1, 0, 25.5, 5.5)]);
  decide(match);
  assert.ok(red.every((unit) => unit.order.mode === "attack" && unit.order.target === enemy.id));
});

test("a lone recruit waits at safe assembly instead of feeding into a distant siege", () => {
  const recruit = soldier(1, 2, 44.5, 5.5);
  const match = fixture([recruit, ...Array.from({ length: 4 }, (_, i) => soldier(i + 2, 1, 34.5, 5.5 + i * 0.2, "heavy"))],
    [city(0, 2, 34.5, 5.5), city(1, 2, 44.5, 5.5), city(2, 0, 15.5, 5.5)]);
  decide(match);
  assert.notEqual(recruit.order.mode, "attack");
  if (recruit.order.mode === "move") assert.ok(dist(recruit.order.point, match.cities[0]) > 5);
});

test("cityless survivors still move inside the capture area of a nearby neutral city", () => {
  const unit = soldier(1, 2, 33.5, 5.5);
  const match = fixture([unit], [city(0, 0, 30.5, 5.5), city(1, 1, 5.5, 5.5)], "hard");
  decide(match);
  assert.equal(unit.order.mode, "move");
  if (unit.order.mode === "move") assert.ok(dist(unit.order.point, match.cities[0]) < 1);
  advance(match, 12);
  assert.equal(match.cities[0].owner, 2);
});

test("production reserves supply and does not queue over available capacity", () => {
  const match = fixture(Array.from({ length: 5 }, (_, i) => soldier(i + 1, 2, 40.5, 16.5)),
    [city(0, 2, 40.5, 16.5), city(1, 0, 30.5, 16.5)]);
  decide(match);
  assert.equal(match.cities[0].build, null);
  assert.equal(supply(match, 2).used, 5);
});

test("tutorial decisions stay dormant until the final interactive lesson is complete", () => {
  const match = createMatch("hard", "tutorial-ai", true);
  match.elapsed = 100;
  for (const phase of [0, 1, 2, 3, 4]) {
    match.tutorial = phase;
    const snapshot = JSON.stringify(match);
    decide(match);
    assert.equal(JSON.stringify(match), snapshot);
  }
  match.tutorial = 5;
  decide(match);
  assert.ok(match.nextAi > match.elapsed);
  assert.ok(match.cities.some((city) => city.owner === 2 && city.build));
});

test("AI produces and captures actual reachable territory on all six maps", () => {
  for (const map of mapIds) {
    const match = createMatch("normal", `ai-${map}`, false, map);
    advance(match, 60);
    assert.ok(match.units.some((unit) => unit.team === 2 && unit.id > 8), `${map}: reinforcement production`);
    assert.ok(match.cities.filter((city) => city.owner === 2).length > 2, `${map}: neutral expansion`);
    assert.ok(match.units.every((unit) => passable(unit, map)), `${map}: all troops on legal terrain`);
    assert.ok(match.units.every((unit) => unit.hp <= units[unit.kind].hp), `${map}: shared health limits`);
  }
});

test("reloaded matches preserve deterministic tactical decisions and combat", () => {
  for (const map of mapIds) {
    const match = createMatch("hard", `resume-${map}`, false, map);
    advance(match, 22);
    const restored: Match = JSON.parse(JSON.stringify(match));
    advance(match, 25);
    advance(restored, 25);
    assert.deepEqual(restored, match, map);
  }
});
