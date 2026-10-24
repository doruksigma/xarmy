import { test } from "node:test";
import assert from "node:assert/strict";
import { MAPS } from "./maps";
import { RULES } from "./types";

const blocked = (map: (typeof MAPS)[keyof typeof MAPS], x: number, z: number) =>
  map.objects.some(
    (o) =>
      o.solid &&
      (o.y ?? 0) < 1.8 &&
      Math.abs(x - o.x) < o.width / 2 + RULES.radius &&
      Math.abs(z - o.z) < o.depth / 2 + RULES.radius,
  );

for (const map of Object.values(MAPS)) {
  test(`${map.name}: shared collision data, all spawns clear and arena boundaries closed`, () => {
    assert.equal(
      new Set(map.objects.map((o) => o.id)).size,
      map.objects.length,
    );
    assert.equal(map.spawns.length, 5);
    for (const p of [map.spawn, ...map.spawns])
      assert.equal(blocked(map, p.x, p.z), false, `spawn ${p.x},${p.z}`);
    for (const o of map.objects) {
      assert.ok(o.width > 0 && o.depth > 0 && o.height > 0);
      assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z));
      assert.match(o.color, /^#[0-9a-f]{6}$/i);
    }
    for (const p of [
      [0, -32],
      [0, 32],
      [-32, 0],
      [32, 0],
    ])
      assert.ok(blocked(map, p[0], p[1]));
  });
  test(`${map.name}: hiding areas are connected to the start, including room interiors`, () => {
    // Grid walk at half-metre spacing with a real player's expanded radius.
    const size = 125,
      seen = new Set<string>(),
      queue: [[number, number]] | [number, number][] = [[62, 110]];
    for (let i = 0; i < queue.length; i++) {
      const [gx, gz] = queue[i];
      const key = `${gx},${gz}`;
      if (
        seen.has(key) ||
        gx < 0 ||
        gz < 0 ||
        gx >= size ||
        gz >= size ||
        blocked(map, gx / 2 - 31, gz / 2 - 31)
      )
        continue;
      seen.add(key);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        queue.push([gx + dx, gz + dz]);
    }
    const targets =
      map.id === "forest"
        ? [
            [-18, -19],
            [-18, 4],
            [15, 17],
            [0, -23],
          ]
        : map.id === "city"
          ? [
              [-17, -16],
              [16, -17],
              [-18, 9],
              [18, 11],
            ]
          : [
              [-18, -17],
              [18, -17],
              [-18, 8],
              [18, 8],
            ];
    for (const [x, z] of targets)
      assert.ok(
        seen.has(`${(x + 31) * 2},${(z + 31) * 2}`),
        `unreachable ${x},${z}`,
      );
    assert.ok(seen.size > 8000, "arena has space to travel");
  });
}
