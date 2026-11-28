import assert from "node:assert/strict";
import test from "node:test";
import { units } from "./config";
import { createMatch } from "./engine";
import { summary } from "./battle";
import { formatSoldiers, manpower, soldiersInUnit } from "./manpower";
import { migrateMatch } from "./storage";
import { packMatch, unpackMatch } from "./online-protocol";

test("each side starts with 250,000 soldiers represented by only 25 army entities", () => {
  const match = createMatch("normal", "manpower-opening", false);
  assert.equal(match.units.length, 50);
  assert.deepEqual(manpower(match), {
    blue: { soldiers: 250_000, fallen: 0, formations: 25 },
    red: { soldiers: 250_000, fallen: 0, formations: 25 },
  });
  assert.equal(formatSoldiers(250_000), "250.000");
});

test("every army type represents 10,000 personnel while retaining different combat durability", () => {
  for (const kind of ["light", "heavy", "artillery", "aircraft"] as const) {
    assert.equal(soldiersInUnit({ kind, hp: units[kind].hp }), 10_000);
    assert.equal(soldiersInUnit({ kind, hp: units[kind].hp / 2 }), 5_000);
    assert.equal(soldiersInUnit({ kind, hp: .000001 }), 1);
    assert.equal(soldiersInUnit({ kind, hp: 0 }), 0);
    assert.equal(soldiersInUnit({ kind, hp: -10 }), 0);
    assert.equal(soldiersInUnit({ kind, hp: units[kind].hp * 2 }), 10_000);
  }
  assert.ok(units.heavy.hp > units.light.hp);
});

test("partial casualties and removed armies conserve personnel without counting a death twice", () => {
  const match = createMatch("normal", "manpower-casualties", false);
  const unit = match.units[0];
  unit.hp /= 2;
  assert.deepEqual(manpower(match).blue, { soldiers: 245_000, fallen: 5_000, formations: 25 });
  unit.hp = 0;
  const beforeRemoval = manpower(match);
  match.units = match.units.filter(item => item.id !== unit.id);
  match.report.fallen++;
  assert.deepEqual(manpower(match), beforeRemoval);
  assert.deepEqual(manpower(match).blue, { soldiers: 240_000, fallen: 10_000, formations: 24 });
  const recruit = { ...match.units[0], id: match.nextId++ };
  match.units.push(recruit);
  assert.deepEqual(manpower(match).blue, { soldiers: 250_000, fallen: 10_000, formations: 25 });
});

test("saved games and online packets preserve both partial and complete casualty totals", () => {
  const match = createMatch("normal", "manpower-save", false);
  match.units[0].hp /= 2;
  match.units.find(unit => unit.team === 2)!.hp /= 4;
  match.report.fallen = 2; match.report.killed = 3;
  const expected = manpower(match);
  assert.equal(expected.blue.fallen, 25_000);
  assert.equal(expected.red.fallen, 37_500);
  for (const restored of [migrateMatch(match), unpackMatch(packMatch(match))]) {
    assert.ok(restored);
    assert.deepEqual(manpower(restored), expected);
    assert.equal(restored.version, 7, "the economy upgrade preserves personnel accounting");
  }
});

test("both online perspectives agree on casualties and selection sums only the local army", () => {
  const match = createMatch("normal", "manpower-perspective", false);
  const blue = match.units[0], red = match.units.find(unit => unit.team === 2)!;
  blue.hp /= 2; red.hp /= 4;
  const picked = new Set([blue.id, red.id]);
  const host = summary(match, picked, null, false, 1), guest = summary(match, picked, null, false, 2);
  assert.deepEqual(host.manpower, guest.manpower);
  assert.equal(host.selectedSoldiers, 5_000); assert.equal(guest.selectedSoldiers, 2_500);
  assert.equal(host.selectedUnits, 1); assert.equal(guest.selectedUnits, 1);
});
