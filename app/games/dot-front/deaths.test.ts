import assert from "node:assert/strict";
import test from "node:test";
import { GRACE, POCKET_GRACE, STEP, units } from "./config";
import { createMatch, step } from "./engine";
import type { Match, Unit } from "./engine";
import { validMatch } from "./storage";
import { TERRITORY_COLS, territoryCell } from "./territory";

function advance(match: Match, ticks = 1) {
  for (let tick = 0; tick < ticks; tick++) step(match, STEP, [], () => {});
}
function duel() {
  const match = createMatch("normal", "death-accounting", true, "plains");
  const blue = match.units.find(unit => unit.team === 1)!;
  const red = match.units.find(unit => unit.team === 2)!;
  Object.assign(blue, { x: 71.2, y: 45.5, stance: "manual" });
  Object.assign(red, { x: 72.8, y: 45.5, stance: "manual" });
  match.units = [blue, red];
  return { match, blue, red };
}
function expectDeaths(match: Match, blue: number, red: number) {
  assert.equal(match.report.fallen, blue);
  assert.equal(match.report.killed, red);
}

test("combat removes and counts either team's defeated dot exactly once", () => {
  for (const team of [1, 2] as const) {
    const { match, blue, red } = duel(), victim = team === 1 ? blue : red;
    victim.hp = 1; victim.cooldown = 3;
    advance(match);
    assert.equal(match.units.includes(victim), false);
    assert.equal(match.units.length, 1);
    expectDeaths(match, Number(team === 1), Number(team === 2));
    advance(match, 5);
    expectDeaths(match, Number(team === 1), Number(team === 2));
  }
});

test("several attackers killing the same dot in one combat step still produce one death", () => {
  const { match, blue, red } = duel();
  const support: Unit = { ...structuredClone(blue), id: match.nextId++, y: 46.5 };
  match.units.push(support);
  red.hp = units.light.damage + 1; red.cooldown = 3;
  const flashes: Parameters<typeof step>[2] = [];
  step(match, STEP, flashes, () => {});
  assert.equal(flashes.length, 2);
  assert.equal(match.units.includes(red), false);
  expectDeaths(match, 0, 1);
  advance(match, 5); expectDeaths(match, 0, 1);
});

test("capacity attrition counts blue and red deaths equally, including the previously omitted red loss", () => {
  const match = createMatch("normal", "capacity-deaths", true, "plains");
  for (const city of match.cities) if (city.id !== 0 && city.id !== 25) {
    city.owner = 0; city.build = null; city.repeat = false;
  }
  match.units = match.units.filter(unit => unit.id <= 6 || unit.id >= 26 && unit.id <= 31);
  const victims: Unit[] = [];
  for (const team of [1, 2] as const) {
    const army = match.units.filter(unit => unit.team === team);
    army.forEach((unit, index) => Object.assign(unit, {
      x: (team === 1 ? 10.5 : 120.5) + index * 2, y: team === 1 ? 20.5 : 70.5, stance: "manual",
    }));
    const victim = army.at(-1)!;
    victim.kind = "heavy"; victim.hp = .1; victims.push(victim);
  }
  match.elapsed = GRACE; match.shortage = [GRACE, GRACE];
  advance(match);
  assert.ok(victims.every(victim => victim.marked && victim.hp <= 0 && !match.units.includes(victim)));
  assert.equal(match.units.length, 10);
  expectDeaths(match, 1, 1);
  advance(match, 10);
  expectDeaths(match, 1, 1);
});

test("disconnected-supply attrition counts both sides without adding combat or enclosure deaths", () => {
  const { match, blue, red } = duel();
  match.territory.owners = match.territory.owners.map(owner => owner ? 3 - owner : 0);
  match.territory.revision++;
  Object.assign(blue, { x: 100.5, y: 45.5 }); Object.assign(red, { x: 40.5, y: 45.5 });
  match.elapsed = POCKET_GRACE;
  for (const unit of match.units) { unit.hp = .05; unit.pocketed = true; unit.pocketTime = POCKET_GRACE; }
  const flashes: Parameters<typeof step>[2] = [];
  step(match, STEP, flashes, () => {});
  assert.equal(flashes.length, 0); assert.equal(match.units.length, 0);
  expectDeaths(match, 1, 1);
  advance(match, 10); expectDeaths(match, 1, 1);
});

test("enclosure removes both teams' trapped dots without converting them or counting later cleanup passes", () => {
  const { match, blue, red } = duel();
  Object.assign(blue, { x: 100.5, y: 30.5 }); Object.assign(red, { x: 30.5, y: 60.5 });
  for (const unit of match.units) {
    const center = territoryCell(unit);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) match.territory.owners[center + dy * TERRITORY_COLS + dx] = unit.team;
  }
  match.territory.revision++;
  advance(match);
  assert.equal(match.units.length, 0);
  assert.equal(blue.team, 1); assert.equal(red.team, 2);
  expectDeaths(match, 1, 1);
  advance(match, 10); expectDeaths(match, 1, 1);
});

test("simultaneous fatal combat records both deaths before announcing a draw", () => {
  const { match, blue, red } = duel();
  match.cities = []; blue.hp = red.hp = 1;
  advance(match);
  assert.equal(match.result, "draw"); assert.equal(match.units.length, 0);
  expectDeaths(match, 1, 1);
  advance(match, 10); expectDeaths(match, 1, 1);
});

test("old saved death totals remain unchanged until a new death and resume deterministically", () => {
  const { match, red } = duel();
  match.report = { captured: 3, fallen: 7, killed: 5 };
  for (const unit of match.units) unit.cooldown = 1;
  assert.ok(validMatch(match));
  advance(match);
  expectDeaths(match, 7, 5);
  red.hp = 1;
  match.units.find(unit => unit.team === 1)!.cooldown = 0;
  const saved: unknown = JSON.parse(JSON.stringify(match)); assert.ok(validMatch(saved));
  advance(match); advance(saved);
  assert.deepEqual(saved, match);
  expectDeaths(match, 7, 6);
  assert.equal(match.report.captured, 3);
});
