import assert from "node:assert/strict";
import { test } from "node:test";
import atlas from "./map-data.json";
import corridors from "./land-corridors.json";
import { isObsoleteLandEdge, isTraversableLandEdge } from "./land-corridors";

test("Cached land validity exactly preserves every atlas pair, including non-neighbours and obsolete sea shortcuts", () => {
  const source = JSON.stringify(atlas);
  const blocked = new Set(corridors.blocked);
  let validPairs = 0;
  let obsoletePairs = 0;
  for (const from of atlas.provinces) {
    for (const to of atlas.provinces) {
      const key = [from.id, to.id].sort().join("|");
      const edge = from.neighbors.find((entry) => entry.id === to.id);
      const expected = !!edge && !edge.sea && !blocked.has(key);
      const actual = isTraversableLandEdge(from.id, to.id);
      assert.equal(actual, expected, key);
      assert.equal(isObsoleteLandEdge(from.id, to.id), blocked.has(key), key);
      if (actual) validPairs++;
      if (blocked.has(key)) obsoletePairs++;
    }
  }
  assert.ok(validPairs > 0);
  assert.equal(obsoletePairs, corridors.blocked.length * 2);
  // Reversed/repeated queries must neither mutate the source nor grow it.
  for (const from of [...atlas.provinces].reverse()) {
    assert.equal(isTraversableLandEdge(from.id, from.id), false);
    assert.equal(isTraversableLandEdge(from.id, "unknown-region"), false);
    assert.equal(isTraversableLandEdge("unknown-region", from.id), false);
    assert.equal(isObsoleteLandEdge(from.id, "unknown-region"), false);
    assert.equal(isObsoleteLandEdge("unknown-region", from.id), false);
  }
  assert.equal(JSON.stringify(atlas), source);
});
