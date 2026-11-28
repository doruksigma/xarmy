import assert from "node:assert/strict";
import test from "node:test";
import { applyGameCommand, canApplyGameCommand, isGameCommand } from "./commands";
import type { GameCommand } from "./commands";
import { HEIGHT, MAX_ROUTE_POINTS, WIDTH } from "./config";
import { createMatch } from "./engine";
import { nearestOpen, passable } from "./terrain";

test("wire command guards bound IDs, coordinates and route arrays before any game mutation", () => {
  const point = { x: 20, y: 30 };
  for (const value of [
    null, [], {}, { kind: "move", ids: [], point }, { kind: "move", ids: [1, 1], point },
    { kind: "move", ids: [0], point }, { kind: "move", ids: [1.5], point },
    { kind: "move", ids: new Array(1), point }, { kind: "move", ids: Array.from({ length: 601 }, (_, i) => i + 1), point },
    ...[NaN, Infinity, -1, WIDTH + 1].map(x => ({ kind: "move", ids: [1], point: { x, y: 0 } })),
    { kind: "move", ids: [1], point: { x: 0, y: HEIGHT + 1 } },
    { kind: "order", ids: [1], order: { mode: "route", points: [], next: 0 } },
    { kind: "order", ids: [1], order: { mode: "route", points: new Array(1), next: 0 } },
    { kind: "order", ids: [1], order: { mode: "route", points: Array(MAX_ROUTE_POINTS + 1).fill(point), next: 0 } },
    { kind: "order", ids: [1], order: { mode: "route", points: [point], next: 2 } },
    { kind: "order", ids: [1], order: { mode: "attack", target: -1 } },
    { kind: "build", city: -1, unit: "light" }, { kind: "build", city: 0, unit: "tank" },
    { kind: "rally", city: 0, point: undefined }, { kind: "stance", ids: [1], stance: "manual" },
  ]) assert.equal(isGameCommand(value), false, JSON.stringify(value));
  for (const value of [
    { kind: "move", ids: [1], point }, { kind: "order", ids: [1], order: { mode: "hold" } },
    { kind: "order", ids: [1], order: { mode: "route", points: [point], next: 0 } },
    { kind: "stance", ids: [1], stance: "defend" }, { kind: "build", city: 0, unit: "heavy" },
    { kind: "rally", city: 0, point: null },
  ]) assert.equal(isGameCommand(value), true);
});

test("authorization rejects enemy, mixed, stale and dead selections atomically", () => {
  const match = createMatch("normal", "command-ownership", false, "plains");
  const blue = match.units.find(unit => unit.team === 1)!, red = match.units.find(unit => unit.team === 2)!;
  const redCity = match.cities.find(city => city.owner === 2)!;
  blue.hp = 0;
  const before = structuredClone(match);
  const invalid: GameCommand[] = [
    { kind: "move", ids: [red.id], point: { x: 50, y: 40 } },
    { kind: "stance", ids: [blue.id, red.id], stance: "attack" },
    { kind: "order", ids: [blue.id], order: { mode: "hold" } },
    { kind: "order", ids: [99999], order: { mode: "hold" } },
    { kind: "build", city: redCity.id, unit: "heavy" },
    { kind: "rally", city: redCity.id, point: { x: 70, y: 20 } },
    { kind: "rally", city: 99999, point: null },
  ];
  for (const cmd of invalid) {
    assert.equal(canApplyGameCommand(match, 1, cmd), false);
    assert.equal(applyGameCommand(match, 1, cmd), false);
    assert.deepEqual(match, before);
  }
});

test("red commands use actual red IDs and canonical world coordinates, without rewriting blue orders", () => {
  const match = createMatch("normal", "red-command", false, "plains");
  const red = match.units.filter(unit => unit.team === 2).slice(10, 13);
  const blueBefore = structuredClone(match.units.filter(unit => unit.team === 1));
  const point = { x: 110, y: 45 };
  assert.equal(applyGameCommand(match, 2, { kind: "move", ids: red.map(unit => unit.id), point }), true);
  assert.ok(red.every(unit => unit.stance === "manual" && unit.order.mode === "move" && unit.order.point.x > WIDTH / 2));
  assert.equal(new Set(red.map(unit => JSON.stringify(unit.order))).size, 3);
  assert.ok(red.every(unit => unit.path.every(p => passable(p, match.map))));
  assert.deepEqual(match.units.filter(unit => unit.team === 1), blueBefore);
  const city = match.cities.find(city => city.owner === 2)!;
  city.build!.elapsed = 37;
  const other = match.cities.find(candidate => candidate.owner === 2 && candidate.id !== city.id)!;
  other.build!.elapsed = 44;
  assert.equal(applyGameCommand(match, 2, { kind: "build", city: city.id, unit: "heavy" }), true);
  assert.equal(city.build!.elapsed, 37); assert.equal(other.build!.elapsed, 44); assert.equal(city.build?.kind, "heavy");
  assert.equal(applyGameCommand(match, 2, { kind: "rally", city: city.id, point }), true);
  assert.deepEqual(city.rally, nearestOpen(point, match.map));
  assert.equal(applyGameCommand(match, 2, { kind: "rally", city: city.id, point: null }), true);
  assert.equal(city.rally, null);
});

test("attack targets must be live opponents and each selected route owns its own guide data", () => {
  const match = createMatch("normal", "command-targets", false, "plains");
  const [first, second] = match.units.filter(unit => unit.team === 1);
  const enemy = match.units.find(unit => unit.team === 2)!;
  for (const target of [first.id, second.id, 99999]) {
    assert.equal(applyGameCommand(match, 1, { kind: "order", ids: [first.id], order: { mode: "attack", target } }), false);
  }
  assert.equal(applyGameCommand(match, 1, { kind: "order", ids: [first.id], order: { mode: "attack", target: enemy.id } }), true);
  enemy.hp = 0;
  assert.equal(applyGameCommand(match, 1, { kind: "order", ids: [first.id], order: { mode: "attack", target: enemy.id } }), false);
  const points = [{ x: 60, y: 10 }, { x: 56, y: 13 }];
  assert.equal(applyGameCommand(match, 1, { kind: "order", ids: [first.id, second.id], order: { mode: "route", points, next: 0 } }), true);
  points[0].x = 0;
  assert.equal(first.order.mode, "route"); assert.equal(second.order.mode, "route");
  if (first.order.mode === "route" && second.order.mode === "route") {
    assert.equal(first.order.points[0].x, 60);
    first.order.points[0].x = 2;
    assert.equal(second.order.points[0].x, 60);
  }
  match.result = "won";
  const before = structuredClone(match);
  assert.equal(applyGameCommand(match, 1, { kind: "stance", ids: [first.id], stance: "attack" }), false);
  assert.deepEqual(match, before);
});
