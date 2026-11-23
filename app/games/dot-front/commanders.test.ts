import assert from "node:assert/strict";
import test from "node:test";
import { CITY_PRODUCTION, COMMANDER_LIMIT, FRONT_INTERVAL, STEP, dist, units } from "./config";
import { commandCommander, commanderLeader, commanderMembers, createMatch, frontlinePoint, maintainCommanders, setCommanderAutoFront, step } from "./engine";
import type { Match } from "./engine";
import { passable } from "./terrain";
import { validMatch } from "./storage";

const advance = (match: Match, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(match, STEP, [], () => {});
};
const match = () => {
  const state = createMatch("normal", "commander-tests", false, "plains");
  for (const commander of state.commanders) commander.autoFront = false;
  return state;
};

test("commanders are existing soldiers with ordinary stats, not extra combat entities", () => {
  const state = match();
  assert.equal(state.units.length, 50);
  for (const commander of state.commanders) {
    const members = commanderMembers(state, commander.id), leader = commanderLeader(state, commander.id)!;
    assert.ok(members.length <= COMMANDER_LIMIT);
    assert.ok(members.includes(leader)); assert.equal(leader.team, commander.team);
    assert.equal(leader.hp, units[leader.kind].hp);
    assert.equal(state.units.filter((unit) => unit.id === leader.id).length, 1);
  }
});

test("commander commands move exactly their persistent members and manual orders disable automatic front movement", () => {
  const state = match(), commander = state.commanders[0];
  const members = commanderMembers(state, commander.id), ids = members.map((unit) => unit.id);
  commander.autoFront = true;
  commandCommander(state, commander.id, { mode: "move", point: { x: 55.5, y: 18.5 } });
  assert.equal(commander.autoFront, false);
  assert.ok(members.every((unit) => unit.order.mode === "move" && unit.path.length));
  assert.ok(state.units.filter((unit) => unit.commanderId !== commander.id).every((unit) => unit.order.mode === "hold"));
  advance(state, 2);
  assert.deepEqual(commanderMembers(state, commander.id).map((unit) => unit.id), ids);
  commandCommander(state, commander.id, { mode: "hold" });
  assert.ok(members.every((unit) => unit.order.mode === "hold" && !unit.path.length));
  assert.equal(commander.order.mode, "hold");
});

test("leader death promotes a surviving soldier without adding a unit, changing stats or losing the group", () => {
  const state = match(), commander = state.commanders[0], leader = commanderLeader(state, commander.id)!;
  const members = commanderMembers(state, commander.id).filter((unit) => unit.id !== leader.id);
  const promoted = members.reduce((a, b) => a.id < b.id ? a : b);
  const hp = promoted.hp; leader.hp = 0;
  advance(state, STEP);
  assert.equal(state.units.length, 49); assert.equal(state.commanders.length, 6);
  assert.equal(commander.leaderId, promoted.id); assert.equal(promoted.hp, hp);
  assert.equal(commanderMembers(state, commander.id).length, 9); assert.equal(state.report.fallen, 1);
});

test("a completely eliminated group removes only its own commander", () => {
  const state = match(), commander = state.commanders[0];
  for (const unit of commanderMembers(state, commander.id)) unit.hp = 0;
  advance(state, STEP);
  assert.equal(state.units.length, 40); assert.equal(state.commanders.length, 5);
  assert.equal(commanderLeader(state, commander.id), undefined);
  assert.equal(state.commanders.some((item) => item.id === commander.id), false);
});

test("new recruits join the nearest available commander and physically walk from their city", () => {
  const state = match(), commander = state.commanders[0];
  const remove = commanderMembers(state, commander.id).at(-1)!;
  state.units = state.units.filter((unit) => unit.id !== remove.id); maintainCommanders(state);
  const leader = commanderLeader(state, commander.id)!;
  const home = state.cities.filter((item) => item.owner === 1).sort((a, b) => dist(a, leader) - dist(b, leader))[0];
  home.build!.elapsed = CITY_PRODUCTION - STEP;
  const recruitId = state.nextId; advance(state, STEP);
  const recruit = state.units.find((unit) => unit.id === recruitId)!;
  assert.equal(recruit.commanderId, commander.id); assert.equal(commanderMembers(state, commander.id).length, 10);
  assert.ok(dist(recruit, home) <= 1); assert.ok(dist(recruit, leader) > 2);
  assert.equal(recruit.order.mode, "move");
  if (recruit.order.mode === "move") assert.deepEqual(Object.keys(recruit.order.point).sort(), ["x", "y"]);
  const origin = { x: recruit.x, y: recruit.y }; advance(state, 1);
  assert.ok(dist(recruit, origin) > 0.5 && dist(recruit, origin) <= units.light.speed + 0.05);
  assert.doesNotThrow(() => JSON.stringify(state)); assert.ok(validMatch(state));
});

test("a recruit creates an automatic commander when all existing groups are full", () => {
  const state = match(), partial = state.commanders.find((item) => item.team === 1 && commanderMembers(state, item.id).length === 5)!;
  state.units = state.units.filter((unit) => unit.commanderId !== partial.id); maintainCommanders(state);
  const before = new Set(state.commanders.map((item) => item.id));
  const home = state.cities.find((item) => item.owner === 1)!; home.build!.elapsed = CITY_PRODUCTION - STEP;
  const recruitId = state.nextId; advance(state, STEP);
  const recruit = state.units.find((unit) => unit.id === recruitId)!, created = state.commanders.find((item) => item.id === recruit.commanderId)!;
  assert.equal(before.has(created.id), false); assert.equal(created.leaderId, recruit.id);
  assert.equal(created.autoFront, true); assert.equal(commanderMembers(state, created.id).length, 1);
  assert.ok(state.commanders.every((item) => commanderMembers(state, item.id).length <= COMMANDER_LIMIT));
});

test("automatic front commands are bounded by a persisted deadline and do not replan every frame", () => {
  const state = match(), commander = state.commanders[0], members = commanderMembers(state, commander.id);
  members.forEach((unit, index) => { unit.x = 8.5 + index % 5; unit.y = 8.5 + Math.floor(index / 5); });
  setCommanderAutoFront(state, commander.id, true);
  assert.equal(commander.autoFront, true); assert.equal(commander.nextOrder, FRONT_INTERVAL);
  assert.equal(commander.order.mode, "move");
  const paths = members.map((unit) => unit.path);
  advance(state, FRONT_INTERVAL - STEP);
  assert.equal(commander.nextOrder, FRONT_INTERVAL);
  assert.ok(members.every((unit, index) => unit.path === paths[index]));
  advance(state, STEP); assert.ok(commander.nextOrder >= FRONT_INTERVAL * 2 - 1e-6);
  assert.ok(members.every((unit, index) => unit.path === paths[index]));
});

test("the automatic border advances with captured territory instead of using rear-city midpoints", () => {
  const state = match(), origin = { x: 67.5, y: 45.5 };
  const before = frontlinePoint(state, 1, origin);
  assert.ok(before.x > 64 && before.x < 70);
  for (const home of state.cities) if (home.owner === 2 && home.x < 85) home.owner = 1;
  const after = frontlinePoint(state, 1, origin);
  assert.ok(after.x > 80, "border follows the forward captured city column"); assert.ok(passable(after, state.map));
});

test("commander orders, automatic deadlines and promotions survive exact saved-state continuation", () => {
  const state = match(), commander = state.commanders[0];
  setCommanderAutoFront(state, commander.id, true); commanderLeader(state, commander.id)!.hp = 0;
  advance(state, 2); const saved: unknown = JSON.parse(JSON.stringify(state)); assert.ok(validMatch(saved));
  advance(state, 12); advance(saved, 12);
  assert.deepEqual(saved, state); assert.ok(validMatch(saved));
});
