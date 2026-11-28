import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, commandUnit, step } from "./engine";
import { mapIds } from "./terrain";
import { MAX_ONLINE_BODY_BYTES, packMatch, unpackMatch, unpackStoredMatch } from "./online-protocol";
import { TERRITORY_SIZE } from "./territory";

for (const map of mapIds) test(`${map}: the online snapshot preserves the entire v6 simulation and independent city clocks losslessly`, () => {
  const match = createMatch("normal", `online-${map}`, false, map);
  commandUnit(match, match.units[0].id, { mode: "route", points: [{ x: 60.5, y: 20.5 }, { x: 70.5, y: 20.5 }], next: 0 });
  for (let i = 0; i < 20; i++) step(match, .05, [], () => {});
  for (const city of match.cities) if (city.build) city.build.elapsed = (city.id * 7.125) % 60;
  const packet = packMatch(match), restored = unpackMatch(JSON.parse(JSON.stringify(packet)));
  assert.deepEqual(restored, match);
  assert.ok(JSON.stringify(packet).length < JSON.stringify(match).length);
  assert.notEqual(restored!.units, match.units);
  restored!.units[0].hp--;
  assert.notEqual(restored!.units[0].hp, match.units[0].hp);
});

test("RLE rejects oversized, fractional, missing, invalid-owner and ambiguous runs", () => {
  const packet = packMatch(createMatch("easy", "codec", false, "plains"));
  for (const runs of [[], [[1, TERRITORY_SIZE + 1]], [[1, TERRITORY_SIZE - 1]], [[1, .5]], [[1, 0]], [[1, -1]], [[3, TERRITORY_SIZE]], [["1", TERRITORY_SIZE]], [[1, TERRITORY_SIZE, 0]], null]) {
    assert.equal(unpackMatch({ ...packet, territory: { revision: 0, runs } }), null);
  }
  assert.equal(unpackMatch({ ...packet, territory: { ...packet.territory, owners: [] } }), null);
  assert.equal(unpackMatch({ ...packet, territory: { revision: -1, runs: packet.territory.runs } }), null);
});

test("queued snapshots stay independent while the live host continues its simulation", () => {
  const match = createMatch("normal", "retry-isolation", false, "plains");
  const before = structuredClone(match), packet = packMatch(match);
  match.units[0].hp--;
  match.units[0].path.push({ x: 20.5, y: 20.5 });
  match.cities[0].owner = 2;
  match.cities[1].build!.elapsed = 30;
  match.territory.owners.fill(2);
  assert.deepEqual(unpackMatch(packet), before);
  const decoded = unpackMatch(packet)!;
  decoded.units[0].hp--;
  decoded.territory.owners.fill(2);
  assert.deepEqual(unpackMatch(packet), before);
});

test("the decoded match still passes strict terrain, unit, timer and current-version validation", () => {
  const packet = packMatch(createMatch("easy", "codec", false, "valley"));
  assert.equal(unpackMatch({ ...packet, version: 4 }), null);
  assert.equal(unpackMatch({ ...packet, version: 5, recruitment: [0, 0] }), null);
  assert.equal(unpackMatch({ ...packet, recruitment: [0, 0] }), null);
  const invalidTimer = structuredClone(packet); invalidTimer.cities[0].build!.elapsed = 60.1;
  assert.equal(unpackMatch(invalidTimer), null);
  assert.equal(unpackMatch({ ...packet, territory: { revision: 0, runs: [[0, TERRITORY_SIZE]] } }), null);
  assert.equal(unpackMatch({ ...packet, units: [{ ...packet.units[0], hp: Infinity }] }), null);
  assert.equal(unpackMatch({ ...packet, encoding: "other" }), null);
});

test("only stored-room decoding upgrades validated v5, preserving source progress without accepting old host uploads", () => {
  const match = createMatch("normal", "stored-v5-room", false, "plains");
  const blueSource = match.cities.filter(city => city.owner === 1)[2];
  const redSource = match.cities.filter(city => city.owner === 2)[3];
  blueSource.build = { kind: "heavy", elapsed: 36.5 };
  redSource.build = { kind: "light", elapsed: 59.75 };
  const packet = packMatch(match);
  const legacy = { ...packet, version: 5, recruitment: [36.5, 59.75] };
  const before = structuredClone(legacy);
  assert.equal(unpackMatch(legacy), null, "the live host upload path cannot silently migrate an old simulation");
  const restored = unpackStoredMatch(legacy);
  assert.deepEqual(restored, match);
  assert.deepEqual(legacy, before);
  assert.equal(restored!.cities.filter(city => (city.build?.elapsed ?? 0) > 0).length, 2);
  assert.deepEqual(unpackMatch(packMatch(restored!)), match, "the migrated server snapshot uses the current wire shape");
  assert.deepEqual(unpackStoredMatch(packet), match, "current stored packets remain lossless");
});

test("stored-room migration rejects other legacy versions and malformed v5 payloads", () => {
  const packet = packMatch(createMatch("normal", "stored-invalid", false, "plains"));
  for (const version of [1, 2, 3, 4]) assert.equal(unpackStoredMatch({ ...packet, version }), null);
  const legacy = { ...packet, version: 5, recruitment: [12, 24] };
  for (const recruitment of [undefined, [0], [0, 0, 0], [61, 0], [NaN, 0]]) {
    assert.equal(unpackStoredMatch({ ...legacy, recruitment }), null);
  }
  assert.equal(unpackStoredMatch({ ...legacy, territory: { ...legacy.territory, runs: [[2, TERRITORY_SIZE]] } }), null,
    "old records still cannot claim blocked terrain");
  const invalidCity = structuredClone(legacy); invalidCity.cities[0].build!.elapsed = 60.1;
  assert.equal(unpackStoredMatch(invalidCity), null);
  const invalidUnit = structuredClone(legacy); invalidUnit.units[0].pocketTime = -1;
  assert.equal(unpackStoredMatch(invalidUnit), null);
});

test("encoding limits are bounded and malicious/cyclic input never escapes unpack", () => {
  const match = createMatch("easy", "codec", false, "plains");
  match.id = "a".repeat(MAX_ONLINE_BODY_BYTES);
  assert.throws(() => packMatch(match), /limit/);
  assert.equal(unpackMatch({ large: match.id }), null);
  const cycle: { cycle?: unknown } = {}; cycle.cycle = cycle;
  assert.equal(unpackMatch(cycle), null);
  assert.equal(unpackMatch({ get encoding() { throw new Error("bad getter"); } }), null);
  assert.equal(unpackStoredMatch({ ...packMatch(createMatch("normal", "oversized-v5", false, "plains")),
    version: 5, recruitment: [0, 0], id: match.id }), null);
  assert.equal(unpackStoredMatch(cycle), null);
});
