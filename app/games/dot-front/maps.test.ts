import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { HEIGHT, WIDTH } from "./config";
import { cities, clearShot, getMap, mapIds, nearestOpen, passable, route, tileAt, tiles } from "./terrain";

test("the original valley tiles, city layout and default APIs preserve saved matches", () => {
  assert.equal(createHash("sha256").update(JSON.stringify(getMap("valley").tiles)).digest("hex"),
    "669e45d781e879753e2ba112a2858105aa4d1bb6f08830838177527d2c791742");
  assert.equal(getMap("valley").tiles, tiles);
  assert.equal(getMap("valley").cities, cities);
  assert.deepEqual(cities.map(city => [city.x, city.y, city.owner]), [
    [4.5, 13.5, 1], [9.5, 6.5, 1], [43.5, 16.5, 2], [38.5, 23.5, 2],
    [10.5, 19.5, 0], [37.5, 10.5, 0], [20.5, 8.5, 0], [27.5, 21.5, 0],
    [18.5, 23.5, 0], [29.5, 6.5, 0],
  ]);
  assert.deepEqual(route(cities[0], cities[2], "light"), route(cities[0], cities[2], "light", "valley"));
  assert.equal(clearShot({ x: 13.5, y: 13.5 }, { x: 20.5, y: 13.5 }), false);
  assert.ok(route(cities[0], cities[2], "light").every(passable));
});

for (const mapId of mapIds) {
  test(`${mapId}: balanced starts, rotational symmetry and ten accessible city sites`, () => {
    const map = getMap(mapId);
    assert.equal(map.tiles.length, WIDTH * HEIGHT);
    assert.equal(map.cities.length, 10);
    assert.equal(map.cities.filter(city => city.owner === 1).length, 2);
    assert.equal(map.cities.filter(city => city.owner === 2).length, 2);
    for (let index = 0; index < map.tiles.length; index++) {
      assert.equal(map.tiles[index], map.tiles[map.tiles.length - 1 - index], `asymmetric tile ${index}`);
    }
    for (const city of map.cities) {
      assert.ok(passable(city, mapId));
      assert.ok(map.cities.some(other => other.x === WIDTH - city.x && other.y === HEIGHT - city.y));
    }
  });

  test(`${mapId}: light and heavy routes reach every city without crossing blocked corners`, () => {
    const map = getMap(mapId);
    for (const kind of ["light", "heavy"] as const) for (const from of map.cities) for (const to of map.cities) {
      const path = route(from, to, kind, mapId);
      assert.ok(path.length, `${kind}: ${from.x},${from.y} -> ${to.x},${to.y}`);
      assert.deepEqual(path.at(-1), { x: to.x, y: to.y });
      assert.ok(path.every(point => passable(point, mapId)));
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        assert.ok(Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
        if (a.x !== b.x && a.y !== b.y) {
          assert.ok(passable({ x: a.x, y: b.y }, mapId));
          assert.ok(passable({ x: b.x, y: a.y }, mapId));
        }
      }
    }
  });
}

test("six distinct landscapes retain their strategic terrain and do not share an active map", () => {
  assert.equal(new Set(mapIds.map(mapId => JSON.stringify(getMap(mapId).tiles))).size, 6);
  const count = (mapId: typeof mapIds[number], tile: string) => getMap(mapId).tiles.filter(value => value === tile).length;
  assert.ok(count("plains", "field") > WIDTH * HEIGHT * .8);
  assert.ok(count("forest", "forest") > count("plains", "forest") * 2);
  assert.ok(count("valley", "bridge") > 0 && count("valley", "water") > 0);
  assert.ok(count("passes", "rock") > count("plains", "rock") * 3);
  assert.equal(tileAt({ x: 23.5, y: 14.5 }, "fronts"), "rock");
  assert.ok(passable({ x: 23.5, y: 3.5 }, "fronts"));
  assert.ok(passable({ x: 23.5, y: 26.5 }, "fronts"));
  assert.ok(getMap("center").cities.filter(city => city.owner === 0).every(city => Math.abs(city.x - WIDTH / 2) < 6));
  const point = { x: 23.5, y: 14.5 };
  assert.equal(tileAt(point, "valley"), "water");
  getMap("center");
  assert.equal(tileAt(point), "water");
  assert.equal(tileAt(point, "plains"), "field");
  assert.ok(passable(nearestOpen(point, "fronts"), "fronts"));
  assert.equal(clearShot({ x: 12.5, y: 14.5 }, { x: 35.5, y: 14.5 }, "fronts"), false);
});
