import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "./ai";
import { CITY_PRODUCTION, STEP, difficulty, dist, units } from "./config";
import type { Kind, Owner, Team } from "./config";
import { commanderMembers, createMatch, step, supply } from "./engine";
import type { City, Match, Unit } from "./engine";
import { mapIds, nearestOpen, passable } from "./terrain";

const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light", commanderId = team * 100): Unit => ({
  ...nearestOpen({ x, y }, "plains"), id, team, commanderId, kind, hp: units[kind].hp, cooldown: 0,
  order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
});
const city = (id: number, owner: Owner, x: number, y: number): City => ({
  ...nearestOpen({ x, y }, "plains"), id, owner, capturing: 0, progress: 0, rally: null,
  build: owner ? { kind: "light", elapsed: 0 } : null, repeat: true,
});
const fixture = (army: Unit[], cities: City[], level: Match["difficulty"] = "normal") => {
  const match = createMatch(level, "ai-unit-test", false, "plains");
  match.units = army;
  match.cities = cities;
  match.commanders = [...new Set(army.map((unit) => unit.commanderId))].map((id) => {
    const leader = army.find((unit) => unit.commanderId === id)!;
    return { id, team: leader.team, leaderId: leader.id, order: { mode: "hold" as const }, autoFront: false, nextOrder: 0 };
  });
  match.nextCommanderId = Math.max(0, ...match.commanders.map((commander) => commander.id)) + 1;
  match.nextAi = 0;
  match.nextId = Math.max(0, ...army.map((unit) => unit.id)) + 1;
  return match;
};
const advance = (match: Match, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(match, STEP, [], decide);
};

test("difficulty only changes decisions and keeps automatic production clocks intact", () => {
  for (const level of ["easy", "normal", "hard"] as const) {
    const match = fixture([soldier(1, 2, 110.5, 16.5)], [city(0, 2, 110.5, 16.5), city(1, 1, 90.5, 16.5)], level);
    match.cities[0].build!.elapsed = CITY_PRODUCTION / 2;
    decide(match);
    assert.equal(match.nextAi, difficulty[level].period);
    assert.equal(match.cities[0].build!.elapsed, CITY_PRODUCTION / 2);
    assert.equal(match.cities[0].repeat, true);
    assert.equal(match.units[0].hp, units.light.hp);
    const snapshot = JSON.stringify(match);
    decide(match);
    assert.equal(JSON.stringify(match), snapshot);
  }
});

test("AI orders preserve persistent 10+10+5 commander memberships", () => {
  const match = createMatch("normal", "ai-commanders", false, "plains");
  const commanders = match.commanders.filter((commander) => commander.team === 2);
  assert.deepEqual(commanders.map((commander) => commanderMembers(match, commander.id).length).sort((a, b) => b - a), [10, 10, 5]);
  const membership = match.units.map((unit) => [unit.id, unit.commanderId]);
  const ids = match.commanders.map((commander) => commander.id);
  match.elapsed = match.nextAi;
  decide(match);
  assert.deepEqual(match.units.map((unit) => [unit.id, unit.commanderId]), membership);
  assert.deepEqual(match.commanders.map((commander) => commander.id), ids);
  assert.ok(commanders.some((commander) => commander.order.mode !== "hold"));
});

test("a commander does not borrow the strength of distant members or another army", () => {
  const leader = soldier(1, 2, 105.5, 5.5);
  const match = fixture([leader,
    ...Array.from({ length: 9 }, (_, i) => soldier(i + 2, 2, 130.5 + i * 0.2, 75.5)),
    ...Array.from({ length: 4 }, (_, i) => soldier(i + 11, 1, 95.5 + i * 0.2, 5.5, "heavy"))],
    [city(0, 2, 110.5, 5.5), city(1, 2, 130.5, 75.5), city(2, 1, 95.5, 5.5)]);
  decide(match);
  const commander = match.commanders.find((candidate) => candidate.id === leader.commanderId)!;
  assert.notEqual(commander.order.mode, "attack");
  if (commander.order.mode === "move") assert.ok(dist(commander.order.point, match.cities[2]) > 5);
});

test("an outnumbered commander retreats with its existing group", () => {
  const red = [soldier(1, 2, 82.5, 5.5), soldier(2, 2, 82.8, 5.5)];
  const match = fixture([...red, ...Array.from({ length: 4 }, (_, i) => soldier(i + 3, 1, 85.5, 5.5 + i * 0.2, "heavy"))],
    [city(0, 2, 110.5, 5.5), city(1, 1, 75.5, 5.5)]);
  const commander = match.commanders.find((candidate) => candidate.team === 2)!;
  decide(match);
  assert.equal(commander.order.mode, "move");
  if (commander.order.mode === "move") assert.ok(dist(commander.order.point, match.cities[0]) < 1);
  assert.ok(red.every((unit) => unit.commanderId === commander.id && unit.order.mode === "move"));
});

test("a nearby assembled commander defends its city as one formation", () => {
  const red = Array.from({ length: 6 }, (_, i) => soldier(i + 1, 2, 105.5, 15.5 + i * 0.1));
  const enemy = soldier(7, 1, 107.5, 15.5);
  const match = fixture([...red, enemy], [city(0, 2, 108.5, 15.5), city(1, 1, 85.5, 5.5)]);
  decide(match);
  const commander = match.commanders.find((candidate) => candidate.team === 2)!;
  assert.deepEqual(commander.order, { mode: "attack", target: enemy.id });
  assert.ok(red.every((unit) => unit.order.mode === "attack" && unit.order.target === enemy.id));
});

test("an isolated commander waits safely rather than feeding into a siege", () => {
  const recruit = soldier(1, 2, 114.5, 5.5);
  const match = fixture([recruit, ...Array.from({ length: 4 }, (_, i) => soldier(i + 2, 1, 94.5, 5.5 + i * 0.2, "heavy"))],
    [city(0, 2, 94.5, 5.5), city(1, 2, 114.5, 5.5), city(2, 1, 75.5, 5.5)]);
  decide(match);
  const commander = match.commanders.find((candidate) => candidate.team === 2)!;
  assert.notEqual(commander.order.mode, "attack");
  if (commander.order.mode === "move") assert.ok(dist(commander.order.point, match.cities[0]) > 5);
});

test("a cityless surviving commander attempts to recapture an undefended city", () => {
  const unit = soldier(1, 2, 103.5, 5.5);
  const match = fixture([unit], [city(0, 1, 100.5, 5.5), city(1, 1, 15.5, 5.5)], "hard");
  decide(match);
  const commander = match.commanders.find((candidate) => candidate.team === 2)!;
  assert.equal(commander.order.mode, "move");
  if (commander.order.mode === "move") assert.ok(dist(commander.order.point, match.cities[0]) < 1);
  advance(match, 9.8);
  assert.equal(match.cities[0].owner, 2);
});

test("full supply keeps the automatic light cycle instead of creating unaffordable heavies", () => {
  const match = fixture(Array.from({ length: 5 }, (_, i) => soldier(i + 1, 2, 110.5, 16.5)),
    [city(0, 2, 110.5, 16.5), city(1, 1, 90.5, 16.5)]);
  match.cities[0].build!.elapsed = 3;
  decide(match);
  assert.deepEqual(match.cities[0].build, { kind: "light", elapsed: 3 });
  assert.equal(supply(match, 2).used, 5);
});

test("tutorial decisions stay dormant until the enemy-capture and attack lessons finish", () => {
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
});

test("AI advances commanders, auto-produces and captures enemy cities on all six large maps", () => {
  for (const map of mapIds) {
    const match = createMatch("normal", `ai-${map}`, false, map);
    const initialIds = new Set(match.units.map((unit) => unit.id));
    const original = new Map(match.units.map((unit) => [unit.id, { x: unit.x, y: unit.y, commanderId: unit.commanderId }]));
    assert.equal(match.cities.length, 50);
    assert.equal(match.cities.filter((city) => city.owner === 2).length, 25);
    advance(match, 12);
    assert.ok(match.units.some((unit) => unit.team === 2 && original.has(unit.id) && dist(unit, original.get(unit.id)!) > 2), `${map}: commander movement`);
    // Defended passes and the reinforced center need longer to break than open
    // terrain. Retain player automatic-front defense to exercise a real assault.
    const assaultWindow = map === "passes" ? 90 : map === "center" ? 180 : 60;
    advance(match, assaultWindow - 12);
    assert.ok(match.units.some((unit) => unit.team === 2 && !initialIds.has(unit.id)), `${map}: automatic reinforcements`);
    assert.ok(match.cities.filter((city) => city.owner === 2).length > 25, `${map}: enemy city capture`);
    if (map === "passes" || map === "center") assert.ok(match.report.killed > 0 && match.report.fallen > 0, `${map}: both armies fight before the breakthrough`);
    assert.ok(match.units.every((unit) => !original.has(unit.id) || unit.commanderId === original.get(unit.id)!.commanderId), `${map}: persistent membership`);
    assert.ok(match.units.every((unit) => passable(unit, map)), `${map}: legal terrain`);
    assert.ok(match.units.every((unit) => unit.hp <= units[unit.kind].hp), `${map}: shared health limits`);
    assert.ok(match.commanders.every((commander) => commanderMembers(match, commander.id).length <= 10), `${map}: bounded squads`);
  }
});

test("large-map commander decisions resume exactly from serialized match state", () => {
  for (const map of mapIds) {
    const match = createMatch("hard", `resume-${map}`, false, map);
    advance(match, 8);
    const restored: Match = JSON.parse(JSON.stringify(match));
    advance(match, 6);
    advance(restored, 6);
    assert.deepEqual(restored, match, map);
  }
});
