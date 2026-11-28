import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, commandUnit, step } from "./engine";
import { mapIds } from "./terrain";
import { MAX_ONLINE_BODY_BYTES, packMatch, unpackMatch } from "./online-protocol";
import { TERRITORY_SIZE } from "./territory";

for (const map of mapIds) test(`${map}: the online snapshot preserves the entire v5 simulation losslessly`, () => {
  const match = createMatch("normal", `online-${map}`, false, map);
  commandUnit(match, match.units[0].id, { mode: "route", points: [{ x: 60.5, y: 20.5 }, { x: 70.5, y: 20.5 }], next: 0 });
  for (let i = 0; i < 20; i++) step(match, .05, [], () => {});
  match.recruitment = [12.3, 26.7];
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

test("the decoded match still passes strict terrain, unit, timer and current-version validation", () => {
  const packet = packMatch(createMatch("easy", "codec", false, "valley"));
  assert.equal(unpackMatch({ ...packet, version: 4 }), null);
  assert.equal(unpackMatch({ ...packet, recruitment: [61, 0] }), null);
  assert.equal(unpackMatch({ ...packet, territory: { revision: 0, runs: [[0, TERRITORY_SIZE]] } }), null);
  assert.equal(unpackMatch({ ...packet, units: [{ ...packet.units[0], hp: Infinity }] }), null);
  assert.equal(unpackMatch({ ...packet, encoding: "other" }), null);
});

test("encoding limits are bounded and malicious/cyclic input never escapes unpack", () => {
  const match = createMatch("easy", "codec", false, "plains");
  match.id = "a".repeat(MAX_ONLINE_BODY_BYTES);
  assert.throws(() => packMatch(match), /limit/);
  assert.equal(unpackMatch({ large: match.id }), null);
  const cycle: { cycle?: unknown } = {}; cycle.cycle = cycle;
  assert.equal(unpackMatch(cycle), null);
  assert.equal(unpackMatch({ get encoding() { throw new Error("bad getter"); } }), null);
});
