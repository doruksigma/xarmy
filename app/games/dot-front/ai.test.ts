import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "./ai";
import { CAPTURE, CITY_PRODUCTION, HEIGHT, STEP, difficulty, dist, units } from "./config";
import type { Kind, Owner, Team } from "./config";
import { commandUnit, createMatch, step } from "./engine";
import type { City, Match, Unit } from "./engine";
import { mapIds, nearestOpen, passable } from "./terrain";

const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light"): Unit => ({
  ...nearestOpen({ x, y }, "plains"), id, team, stance: "defend", nextOrder: 0, kind, hp: units[kind].hp, cooldown: 0,
  order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
});
const city = (id: number, owner: Owner, x: number, y: number): City => ({
  ...nearestOpen({ x, y }, "plains"), id, owner, capturing: 0, progress: 0, rally: null,
  build: owner ? { kind: "light", elapsed: 0 } : null, repeat: true,
});
const fixture = (army: Unit[], cities: City[], level: Match["difficulty"] = "normal") => {
  const match = createMatch(level, "ai-unit-test", false, "plains");
  match.units = army; match.cities = cities; match.nextAi = 0;
  match.nextId = Math.max(0, ...army.map((unit) => unit.id)) + 1;
  return match;
};
const advance = (match: Match, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(match, STEP, [], decide);
};

test("difficulty changes decision frequency without accelerating the minute production clock", () => {
  assert.equal(CITY_PRODUCTION, 60);
  for (const level of ["easy", "normal", "hard"] as const) {
    const match = fixture([soldier(1, 2, 110.5, 16.5)], [city(0, 2, 110.5, 16.5), city(1, 1, 90.5, 16.5)], level);
    match.cities[0].build!.elapsed = 30;
    decide(match);
    assert.equal(match.nextAi, difficulty[level].period);
    assert.equal(match.cities[0].build!.elapsed, 30);
    assert.equal(match.units[0].hp, units.light.hp);
    const snapshot = JSON.stringify(match); decide(match);
    assert.equal(JSON.stringify(match), snapshot);
  }
});

test("the initial individual army attacks across multiple lanes and keeps interleaved defenders", () => {
  const match = createMatch("normal", "ai-wide-front", false, "plains");
  const red = match.units.filter((unit) => unit.team === 2);
  assert.equal("commanders" in match, false);
  assert.equal(red.length, 25);
  assert.ok(red.every((unit) => !("commanderId" in unit)));
  assert.ok(Math.max(...red.map((unit) => unit.y)) - Math.min(...red.map((unit) => unit.y)) > HEIGHT * 0.8);
  match.elapsed = match.nextAi; decide(match);
  assert.ok(red.filter((unit) => unit.stance === "attack").length >= 15);
  assert.ok(red.filter((unit) => unit.stance === "defend").length >= 4);
  const destinations = red.flatMap((unit) => unit.order.mode === "move" ? [unit.order.point] : []);
  assert.ok(destinations.length > 20);
  assert.equal(new Set(destinations.map((point) => `${point.x}:${point.y}`)).size, destinations.length);
  assert.ok(Math.max(...destinations.map((point) => point.y)) - Math.min(...destinations.map((point) => point.y)) > HEIGHT * 0.7);
});

test("a dispersed army advances without gathering around a leader or borrowing distant support", () => {
  const red = Array.from({ length: 12 }, (_, i) => soldier(i + 1, 2, 85.5, 3.5 + i * 7));
  const blue = Array.from({ length: 6 }, (_, i) => soldier(i + 20, 1, 65.5, 4.5 + i * 14));
  const match = fixture([...red, ...blue], [city(0, 2, 110.5, 45.5), city(1, 1, 45.5, 45.5)]);
  decide(match);
  assert.ok(red.filter((unit) => unit.stance === "attack").length >= 8);
  assert.ok(red.every((unit) => unit.order.mode === "move"));
  assert.ok(red.every((unit) => unit.path.length > 0));
});

test("a locally outmatched soldier defends without pulling distant soldiers into a blob", () => {
  const endangered = soldier(1, 2, 82.5, 5.5);
  const distant = Array.from({ length: 8 }, (_, i) => soldier(i + 2, 2, 85.5, 30.5 + i * 6));
  const enemies = Array.from({ length: 4 }, (_, i) => soldier(i + 20, 1, 85.5, 5.5 + i, "heavy"));
  const match = fixture([endangered, ...distant, ...enemies], [city(0, 2, 110.5, 5.5), city(1, 1, 60.5, 5.5)]);
  decide(match);
  assert.equal(endangered.stance, "defend");
  assert.ok(distant.some((unit) => unit.stance === "attack"));
  const goals = distant.flatMap((unit) => unit.order.mode === "move" ? [unit.order.point] : []);
  assert.equal(new Set(goals.map((point) => `${point.x}:${point.y}`)).size, goals.length);
  assert.ok(goals.some((a) => goals.some((b) => dist(a, b) > 20)), "support remains spread across the actual troop front");
});

test("blue individual drawn routes are untouched by enemy tactical decisions", () => {
  const blue = soldier(1, 1, 40.5, 10.5);
  const red = Array.from({ length: 8 }, (_, i) => soldier(i + 2, 2, 85.5, 10.5 + i * 9));
  const match = fixture([blue, ...red], [city(0, 2, 110.5, 45.5), city(1, 1, 30.5, 45.5)]);
  commandUnit(match, blue.id, { mode: "route", points: [{ x: 45.5, y: 10.5 }, { x: 45.5, y: 15.5 }], next: 0 });
  const before = JSON.stringify(blue); decide(match);
  assert.equal(JSON.stringify(blue), before);
});

test("capture detachments use different city targets while most soldiers retain front coverage", () => {
  const red = Array.from({ length: 25 }, (_, i) => soldier(i + 1, 2, 80.5, 2.5 + i * 3.5));
  const match = fixture(red, [city(0, 2, 115.5, 10.5), city(1, 2, 115.5, 70.5),
    ...Array.from({ length: 5 }, (_, i) => city(i + 2, 1, 70.5, 10.5 + i * 16))]);
  decide(match);
  const raiders = red.filter((unit) => unit.stance === "manual");
  assert.ok(raiders.length > 0 && raiders.length <= 6);
  const destinations = raiders.flatMap((unit) => unit.order.mode === "move" ? [`${unit.order.point.x}:${unit.order.point.y}`] : []);
  assert.equal(new Set(destinations).size, destinations.length);
  assert.ok(red.filter((unit) => unit.stance !== "manual").length >= 19);
  assert.ok(red.some((unit) => unit.stance === "attack"));
  assert.ok(red.some((unit) => unit.stance === "defend"));
});

test("a nearby threatened city receives local help without recalling the whole line", () => {
  const red = Array.from({ length: 12 }, (_, i) => soldier(i + 1, 2, 85.5, 5.5 + i * 7));
  const intruder = soldier(30, 1, 88.5, 5.5);
  const threatened = city(0, 2, 88.5, 5.5); threatened.capturing = 1; threatened.progress = 2;
  const match = fixture([...red, intruder], [threatened, city(1, 2, 120.5, 70.5), city(2, 1, 50.5, 45.5)]);
  decide(match);
  assert.equal(red[0].stance, "manual");
  assert.equal(red[0].order.mode, "move");
  if (red[0].order.mode === "move") assert.ok(dist(red[0].order.point, threatened) < 1.5);
  assert.ok(red.filter((unit) => unit.stance !== "manual").length >= 9);
});

test("a cityless soldier can walk slowly to and recapture an undefended city", () => {
  const unit = soldier(1, 2, 103.5, 5.5);
  const match = fixture([unit], [city(0, 1, 100.5, 5.5), city(1, 1, 15.5, 5.5)], "hard");
  decide(match);
  assert.equal(unit.order.mode, "move");
  if (unit.order.mode === "move") assert.ok(dist(unit.order.point, match.cities[0]) < 1);
  advance(match, CAPTURE + 10);
  assert.equal(match.cities[0].owner, 2);
});

test("AI cannot produce an automatic reinforcement before sixty simulation seconds", () => {
  const match = fixture([soldier(1, 2, 110.5, 16.5)], [city(0, 2, 110.5, 16.5), city(1, 1, 15.5, 70.5)]);
  const nextId = match.nextId;
  advance(match, CITY_PRODUCTION - STEP); assert.equal(match.nextId, nextId);
  advance(match, STEP);
  assert.ok(match.units.some((unit) => unit.team === 2 && unit.id >= nextId));
});

test("tutorial AI waits for the interactive lessons to finish", () => {
  const match = createMatch("hard", "tutorial-ai", true); match.elapsed = 100;
  for (const phase of [0, 1, 2, 3, 4]) {
    match.tutorial = phase; const snapshot = JSON.stringify(match); decide(match);
    assert.equal(JSON.stringify(match), snapshot);
  }
  match.tutorial = 5; decide(match); assert.ok(match.nextAi > match.elapsed);
});

test("all six maps keep slow individual armies on legal terrain and produce on minute boundaries", () => {
  for (const map of mapIds) {
    const match = createMatch("normal", `ai-${map}`, false, map);
    const initialNextId = match.nextId;
    advance(match, 65);
    assert.ok(match.nextId > initialNextId, `${map}: first minute production completes`);
    assert.ok(match.units.some((unit) => unit.team === 2 && unit.stance === "attack"), `${map}: advancing soldiers remain active`);
    assert.ok(match.units.every((unit) => passable(unit, map)), `${map}: legal terrain`);
    assert.ok(match.units.every((unit) => unit.hp <= units[unit.kind].hp), `${map}: shared health limits`);
    assert.equal("commanders" in match, false);
  }
});

test("slow opposing fronts really fight and AI decisions restore exactly across production", () => {
  const match = createMatch("hard", "resume-front", false, "plains");
  advance(match, 55);
  const restored: Match = JSON.parse(JSON.stringify(match));
  advance(match, 20); advance(restored, 20);
  assert.deepEqual(restored, match);
  assert.ok(match.report.killed + match.report.fallen > 0, "slow combat still resolves losses");
});
