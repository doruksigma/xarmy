import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "./ai";
import { CAPTURE, CITY_PRODUCTION, HEIGHT, STEP, difficulty, dist, units } from "./config";
import type { Kind, Owner, Team } from "./config";
import { commandUnit, createMatch, recruitmentCity, step } from "./engine";
import type { City, Match, Unit } from "./engine";
import { mapIds, nearestOpen, passable } from "./terrain";
import { TERRITORY_COLS, isSupplied, territoryCell } from "./territory";

const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light"): Unit => ({
  ...nearestOpen({ x, y }, "plains"), id, team, stance: "defend", nextOrder: 0, kind, hp: units[kind].hp, cooldown: 0,
  order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false, pocketed: false, pocketTime: 0,
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

test("difficulty changes decisions without accelerating production or increasing troop stats", () => {
  assert.equal(CITY_PRODUCTION, 60);
  for (const level of ["easy", "normal", "hard"] as const) {
    const match = fixture([soldier(1, 2, 110.5, 16.5)], [city(0, 2, 110.5, 16.5), city(1, 1, 90.5, 16.5)], level);
    match.recruitment[1] = 30;
    match.cities[0].build!.elapsed = 30;
    decide(match);
    assert.equal(match.nextAi, difficulty[level].period);
    assert.equal(match.cities[0].build!.elapsed, 30);
    assert.equal(match.recruitment[1], 30);
    assert.equal(match.units[0].hp, units.light.hp);
    const snapshot = JSON.stringify(match); decide(match);
    assert.equal(JSON.stringify(match), snapshot);
  }
});

test("the initial army commits separate offensive lanes while keeping distributed reserves", () => {
  const match = createMatch("normal", "ai-wide-front", false, "plains");
  const red = match.units.filter((unit) => unit.team === 2);
  assert.equal("commanders" in match, false);
  assert.equal(red.length, 25);
  assert.ok(red.every((unit) => !("commanderId" in unit)));
  assert.ok(Math.max(...red.map((unit) => unit.y)) - Math.min(...red.map((unit) => unit.y)) > HEIGHT * 0.8);
  match.elapsed = match.nextAi; decide(match);
  const attacking = red.filter((unit) => unit.stance === "manual");
  assert.ok(attacking.length >= 15);
  assert.ok(red.filter((unit) => unit.stance === "defend").length >= 4);
  const destinations = attacking.flatMap((unit) => unit.order.mode === "move" ? [unit.order.point] : []);
  assert.ok(destinations.length >= 15, "offensive soldiers receive real city-bound movement orders");
  assert.ok(destinations.every(point => point.x < 72), "offensive goals cross into enemy territory");
  assert.ok(Math.max(...destinations.map((point) => point.y)) - Math.min(...destinations.map((point) => point.y)) > HEIGHT * 0.65);
});

test("equal local forces attack together and retain a shared live target across decisions", () => {
  const red = [soldier(1, 2, 78.5, 8.5), soldier(2, 2, 78.5, 10.5), soldier(3, 2, 80.5, 9.5)];
  const blue = [soldier(11, 1, 74.5, 8.5), soldier(12, 1, 74.5, 10.5), soldier(13, 1, 74.5, 12.5)];
  const match = fixture([...red, ...blue], [city(0, 2, 110.5, 8.5), city(1, 1, 60.5, 8.5)]);
  decide(match);
  assert.ok(red.every(unit => unit.order.mode === "attack"));
  const targetIds = red.map(unit => unit.order.mode === "attack" ? unit.order.target : -1);
  assert.equal(new Set(targetIds).size, 1, "nearby soldiers concentrate damage instead of waiting at parity");
  match.elapsed = match.nextAi; decide(match);
  assert.deepEqual(red.map(unit => unit.order.mode === "attack" ? unit.order.target : -1), targetIds);
});

test("overwhelming local resistance does not recall distant offensive sectors", () => {
  const endangered = soldier(1, 2, 82.5, 5.5);
  const distant = Array.from({ length: 8 }, (_, i) => soldier(i + 2, 2, 85.5, 30.5 + i * 6));
  const enemies = Array.from({ length: 4 }, (_, i) => soldier(i + 20, 1, 85.5, 5.5 + i, "heavy"));
  const match = fixture([endangered, ...distant, ...enemies], [city(0, 2, 110.5, 5.5),
    city(1, 1, 60.5, 5.5), city(2, 1, 60.5, 40.5), city(3, 1, 60.5, 75.5)]);
  decide(match);
  assert.equal(endangered.stance, "defend");
  assert.ok(distant.some((unit) => unit.stance === "manual"));
  const goals = distant.flatMap((unit) => unit.order.mode === "move" ? [unit.order.point] : []);
  assert.ok(goals.some((a) => goals.some((b) => dist(a, b) > 20)), "unthreatened sectors keep separate objectives");
});

test("blue individual drawn routes are untouched by enemy tactical decisions", () => {
  const blue = soldier(1, 1, 40.5, 10.5);
  const red = Array.from({ length: 8 }, (_, i) => soldier(i + 2, 2, 85.5, 10.5 + i * 9));
  const match = fixture([blue, ...red], [city(0, 2, 110.5, 45.5), city(1, 1, 30.5, 45.5)]);
  commandUnit(match, blue.id, { mode: "route", points: [{ x: 45.5, y: 10.5 }, { x: 45.5, y: 15.5 }], next: 0 });
  const before = JSON.stringify(blue); decide(match);
  assert.equal(JSON.stringify(blue), before);
});

test("city operations persist between decisions rather than resetting toward the old front", () => {
  const red = Array.from({ length: 25 }, (_, i) => soldier(i + 1, 2, 80.5, 2.5 + i * 3.5));
  const match = fixture(red, [city(0, 2, 115.5, 10.5), city(1, 2, 115.5, 70.5),
    ...Array.from({ length: 5 }, (_, i) => city(i + 2, 1, 70.5, 10.5 + i * 16))]);
  decide(match);
  const operations = red.filter(unit => unit.stance === "manual").map(unit => ({ id: unit.id, order: JSON.stringify(unit.order) }));
  assert.ok(operations.length >= 15);
  assert.ok(red.filter(unit => unit.stance === "defend").length >= 4);
  match.elapsed = match.nextAi; decide(match);
  for (const operation of operations) assert.equal(JSON.stringify(red.find(unit => unit.id === operation.id)!.order), operation.order);
});

test("a threatened city receives proportionate local attack orders without recalling the whole line", () => {
  const red = Array.from({ length: 12 }, (_, i) => soldier(i + 1, 2, 85.5, 5.5 + i * 7));
  const intruder = soldier(30, 1, 88.5, 5.5);
  const threatened = city(0, 2, 88.5, 5.5); threatened.capturing = 1; threatened.progress = 2;
  const match = fixture([...red, intruder], [threatened, city(1, 2, 120.5, 70.5), city(2, 1, 50.5, 45.5)]);
  decide(match);
  assert.deepEqual(red[0].order, { mode: "attack", target: intruder.id });
  assert.ok(red.filter(unit => unit.order.mode === "attack" && unit.order.target === intruder.id).length <= 4);
  assert.ok(red.some(unit => unit.y > 60 && unit.order.mode === "move" && unit.order.point.x < 72));
});

test("a soldier already occupying a city remains until the in-progress capture completes", () => {
  const unit = soldier(1, 2, 100.5, 5.5);
  const target = city(0, 1, 100.5, 5.5); target.capturing = 2; target.progress = 10;
  const match = fixture([unit], [target, city(1, 1, 15.5, 5.5)]);
  decide(match); advance(match, CAPTURE - 10 + STEP);
  assert.equal(target.owner, 2);
  assert.ok(dist(unit, target) <= 1.45);
});

test("a cityless soldier can walk slowly to and recover an undefended city", () => {
  const unit = soldier(1, 2, 103.5, 5.5);
  const match = fixture([unit], [city(0, 1, 100.5, 5.5), city(1, 1, 15.5, 5.5)], "hard");
  decide(match);
  assert.equal(unit.order.mode, "move");
  if (unit.order.mode === "move") assert.ok(dist(unit.order.point, match.cities[0]) < 1);
  advance(match, CAPTURE + 10);
  assert.equal(match.cities[0].owner, 2);
});

test("AI rescue intentions never resurrect soldiers eliminated by a completed encirclement", () => {
  const trapped = soldier(1, 2, 90.5, 10.5), rescuer = soldier(2, 2, 94.5, 10.5);
  const match = fixture([trapped, rescuer], [city(0, 2, 115.5, 10.5), city(1, 1, 60.5, 10.5)]);
  // The blue corridor reaches its rear territory, so this is a completed red
  // encirclement rather than an isolated blue ring inside supplied red land.
  for (let y = 7; y < 14; y += .5) for (let x = 71; x < 94; x += .5) match.territory.owners[territoryCell({ x, y })] = 1;
  match.territory.owners[territoryCell(trapped)] = 2; match.territory.revision++;
  trapped.pocketed = true; trapped.pocketTime = 5;
  assert.equal(isSupplied(match, 2, trapped), false);
  const landBefore = [...match.territory.owners]; decide(match);
  assert.equal(trapped.order.mode, "move");
  if (trapped.order.mode === "move") assert.ok(isSupplied(match, 2, trapped.order.point));
  assert.equal(rescuer.order.mode, "move");
  if (rescuer.order.mode === "move") assert.ok(dist(rescuer.order.point, trapped) < 1);
  assert.deepEqual(match.territory.owners, landBefore, "AI orders never grant territory without occupation");
  advance(match, 15);
  assert.equal(match.units.some(unit => unit.id === trapped.id), false);
  assert.equal(match.report.killed, 1);
  assert.ok(match.units.some(unit => unit.id === rescuer.id && unit.order.mode === "move"), "surviving soldiers continue receiving offensive orders");
  assert.ok(match.units.every(unit => passable(unit, match.map)));
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

test("Normal AI really attacks and occupies enemy land on all six maps during four slow minutes", () => {
  let cityGains = 0;
  for (const map of mapIds) {
    const match = createMatch("normal", `ai-${map}`, false, map);
    let shots = 0;
    for (let i = 0; i < Math.round(240 / STEP); i++) {
      const effects: Parameters<typeof step>[2] = []; step(match, STEP, effects, decide);
      shots += effects.filter(effect => effect.team === 2).length;
    }
    const occupation = match.territory.owners.reduce((sum, owner, cell) => sum + Number(owner === 2 && cell % TERRITORY_COLS < TERRITORY_COLS / 2), 0);
    const redCities = match.cities.filter(city => city.owner === 2).length;
    cityGains += Math.max(0, redCities - 25);
    assert.ok(shots >= 25, `${map}: actual shots fired, not only an attack flag`);
    assert.ok(match.report.fallen >= 3, `${map}: attacks cause real blue casualties`);
    assert.ok(occupation >= 80, `${map}: physical enemy-land occupation advances`);
    assert.ok(match.units.every(unit => passable(unit, map)), `${map}: all movement stays on legal terrain`);
    assert.ok(match.units.every(unit => unit.hp <= units[unit.kind].hp), `${map}: shared health limits`);
    assert.equal("commanders" in match, false);
  }
  assert.ok(cityGains >= 4, "sustained attacks also turn into city captures rather than permanent front-line stalling");
});

test("saved tactical orders and occupation restore deterministic AI decisions across production", () => {
  const match = createMatch("hard", "resume-front", false, "plains");
  advance(match, 55);
  const restored: Match = JSON.parse(JSON.stringify(match));
  advance(match, 20); advance(restored, 20);
  assert.deepEqual(restored, match);
  assert.ok(match.report.killed + match.report.fallen > 0, "slow combat still resolves losses");
});


test("AI plans just the current recruitment city without changing the shared timer", () => {
  const match = createMatch("normal", "single-ai-recruitment", false, "plains");
  match.nextAi = 0;
  match.recruitment[1] = 37;
  const source = recruitmentCity(match, 2)!;
  const inactive = match.cities.filter(city => city.owner === 2 && city.id !== source.id);
  const before = structuredClone(inactive.map(city => city.build));
  decide(match);
  assert.equal(match.recruitment[1], 37);
  assert.deepEqual(inactive.map(city => city.build), before);
  assert.equal(source.build!.kind, "heavy");
});
