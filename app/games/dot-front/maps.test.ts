import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, WIDTH } from "./config";
import { cities, clearShot, getMap, mapIds, nearestOpen, passable, route, tileAt, tiles } from "./terrain";
import type { MapId } from "./terrain";

function flood(mapId: MapId) {
  const map = getMap(mapId), first = map.cities[0];
  const start = Math.floor(first.y) * WIDTH + Math.floor(first.x);
  const visited = new Uint8Array(WIDTH * HEIGHT), pending = new Int32Array(WIDTH * HEIGHT);
  let head = 0, length = 1; pending[0] = start; visited[start] = 1;
  while (head < length) {
    const id = pending[head++], x = id % WIDTH, y = Math.floor(id / WIDTH);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * WIDTH + nx;
      if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT || visited[next]) continue;
      if (map.tiles[next] === "rock" || map.tiles[next] === "water") continue;
      visited[next] = 1; pending[length++] = next;
    }
  }
  return visited;
}

for (const mapId of mapIds) {
  test(`${mapId}: spacious fifty-city map starts with balanced established territories`, () => {
    const map = getMap(mapId), reachable = flood(mapId);
    assert.equal(WIDTH, 144); assert.equal(HEIGHT, 90);
    assert.equal(map.tiles.length, WIDTH * HEIGHT);
    assert.equal(map.cities.length, 50);
    assert.equal(map.cities.filter(city => city.owner === 1).length, 25);
    assert.equal(map.cities.filter(city => city.owner === 2).length, 25);
    assert.equal(map.cities.filter(city => city.owner === 0).length, 0);
    for (let index = 0; index < map.tiles.length; index++) {
      assert.equal(map.tiles[index], map.tiles[map.tiles.length - 1 - index], `asymmetric tile ${index}`);
    }
    for (const city of map.cities) {
      assert.ok(reachable[Math.floor(city.y) * WIDTH + Math.floor(city.x)], `unreachable city ${city.x},${city.y}`);
      assert.equal(city.x < WIDTH / 2, city.owner === 1);
      assert.ok(map.cities.some(other => other.x === WIDTH - city.x && other.y === HEIGHT - city.y && other.owner !== city.owner));
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= 4) assert.ok(passable({ x: city.x + dx, y: city.y + dy }, mapId));
      }
    }
    for (const x of [67.5, 77.5]) for (const y of [18.5, 45.5, 72.5]) {
      assert.ok(reachable[Math.floor(y) * WIDTH + Math.floor(x)], "frontline troop deployments connect to cities");
    }
  });

  test(`${mapId}: heap A* routes both troop kinds across front and rear without blocked corners`, () => {
    const map = getMap(mapId);
    const pairs = [
      [map.cities[0], map.cities[25]], [map.cities[10], map.cities[35]],
      [map.cities[24], map.cities[49]], [map.cities[4], map.cities[20]],
      [{ x: 67.5, y: 18.5 }, { x: 77.5, y: 18.5 }],
      [{ x: 67.5, y: 45.5 }, { x: 77.5, y: 45.5 }],
      [{ x: 67.5, y: 72.5 }, { x: 77.5, y: 72.5 }],
    ];
    for (const kind of ["light", "heavy"] as const) for (const [from, to] of pairs) {
      const path = route(from, to, kind, mapId);
      assert.ok(path.length, `${kind}: ${from.x},${from.y} -> ${to.x},${to.y}`);
      assert.ok(path.length <= WIDTH * HEIGHT, "search and resulting path remain bounded");
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

test("six large landscapes have distinct lanes, forests, river crossings and immutable map identity", () => {
  const count = (mapId: MapId, tile: string) => getMap(mapId).tiles.filter(value => value === tile).length;
  assert.equal(new Set(mapIds.map(mapId => JSON.stringify(getMap(mapId).tiles))).size, 6);
  assert.ok(count("plains", "field") > WIDTH * HEIGHT * .8);
  assert.ok(count("forest", "forest") > count("plains", "forest") * 2);
  assert.ok(count("valley", "bridge") > 0 && count("valley", "water") > 0);
  assert.ok(count("passes", "rock") > count("plains", "rock") * 3);
  assert.equal(tileAt({ x: 71.5, y: 45.5 }, "fronts"), "rock");
  assert.ok(passable({ x: 71.5, y: 18.5 }, "fronts"));
  assert.ok(passable({ x: 71.5, y: 72.5 }, "fronts"));
  assert.equal(tileAt({ x: 71.5, y: 18.5 }, "center"), "rock");
  assert.ok(passable({ x: 71.5, y: 45.5 }, "center"));
  assert.ok(route({ x: 67.5, y: 18.5 }, { x: 77.5, y: 18.5 }, "light", "valley").some(point => tileAt(point, "valley") === "bridge"));
  const point = { x: 71.5, y: 35.5 };
  assert.equal(tileAt(point, "valley"), "water"); getMap("center");
  assert.equal(tileAt(point), "water"); assert.equal(tileAt(point, "plains"), "field");
  assert.equal(tiles, getMap("valley").tiles); assert.equal(cities, getMap("valley").cities);
  assert.ok(passable(nearestOpen(point, "fronts"), "fronts"));
  assert.equal(clearShot({ x: 66.5, y: 44.5 }, { x: 78.5, y: 44.5 }, "fronts"), false);
});

test("invalid and obstructed route requests terminate without an unbounded search", () => {
  assert.deepEqual(route({ x: -1, y: -1 }, { x: 50, y: 40 }, "heavy"), []);
  assert.deepEqual(route({ x: 71.5, y: 44.5 }, { x: 60, y: 40 }, "heavy", "fronts"), []);
  const path = route({ x: 67.5, y: 45.5 }, { x: 71.5, y: 44.5 }, "heavy", "fronts");
  assert.ok(path.length && passable(path.at(-1)!, "fronts"));
  assert.ok(route(cities[0], cities[1], "light").every(passable));
});

test("air routes cross water and mountains directly while artillery retains bounded ground A star", () => {
  for (const map of ["valley", "fronts"] as const) {
    const blocked = { x: 71.5, y: 35.5 };
    assert.equal(passable(blocked, map), false);
    const target = { x: 77.25, y: 35.75 };
    assert.deepEqual(route(blocked, target, "aircraft", map), [target]);
    assert.deepEqual(route(blocked, target, "artillery", map), []);
    const path = route(nearestOpen(blocked, map), target, "artillery", map);
    assert.ok(path.length > 0);
    assert.ok(path.every(point => passable(point, map)));
  }
  const edge = route({ x: 2, y: 2 }, { x: WIDTH + 20, y: -10 }, "aircraft", "plains")[0];
  assert.ok(edge.x < WIDTH && edge.x >= 0); assert.equal(edge.y, 0);
  assert.deepEqual(route({ x: -1, y: 2 }, { x: 3, y: 2 }, "aircraft"), []);
  assert.deepEqual(route({ x: 1, y: 2 }, { x: NaN, y: 2 }, "aircraft"), []);
});
