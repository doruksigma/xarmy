import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, SOLDIERS_PER_ARMY, WIDTH, units } from "./config";
import type { Kind, Team } from "./config";
import { createMatch } from "./engine";
import type { Unit } from "./engine";
import { frontField } from "./front";
import type { FrontField, FrontSegment } from "./front";
import { frontStrength, FRONT_STRENGTH_DISTANCE, FRONT_STRENGTH_SECTOR } from "./front-strength";
import type { FrontStrength } from "./front-strength";
import { mapIds } from "./terrain";
import { TERRITORY_COLS, TERRITORY_ROWS } from "./territory";

const army = (id: number, team: Team, x: number, y: number, hp = units.light.hp, kind: Kind = "light"): Unit => ({
  id, team, x, y, kind, hp, cooldown: 0, stance: "manual", nextOrder: 0, pocketed: false, pocketTime: 0,
  order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
});
const fixture = () => createMatch("normal", "front-personnel", true, "plains");
const totals = (sectors: readonly FrontStrength[]) => sectors.reduce((sum, sector) => ({
  blue: sum.blue + sector.blue, red: sum.red + sector.red, formations: sum.formations + sector.formations,
}), { blue: 0, red: 0, formations: 0 });
function field(segments: FrontSegment[]): FrontField {
  return { key: "test-front", spacing: .5, origin: .25, cols: TERRITORY_COLS, rows: TERRITORY_ROWS,
    blueCount: 1, redCount: 1, segments,
    get values(): Float64Array { throw new Error("Front strength must not compute the distance field"); },
  };
}
const vertical = (x = 72, top = 0, bottom = HEIGHT): FrontSegment => ({ a: { x, y: top }, b: { x, y: bottom } });
function assertAnchors(sectors: readonly FrontStrength[]) {
  for (const sector of sectors) {
    assert.ok([sector.x, sector.y, sector.blue, sector.red, sector.formations].every(Number.isFinite));
    assert.ok(sector.x >= 0 && sector.y >= 0 && sector.x <= WIDTH && sector.y <= HEIGHT);
    assert.ok(sector.segments.some(({ a, b }) => Math.abs((sector.x - a.x) * (b.y - a.y) - (sector.y - a.y) * (b.x - a.x)) < 1e-7 &&
      sector.x >= Math.min(a.x, b.x) - 1e-7 && sector.x <= Math.max(a.x, b.x) + 1e-7 &&
      sector.y >= Math.min(a.y, b.y) - 1e-7 && sector.y <= Math.max(a.y, b.y) + 1e-7), "anchor must lie on the actual boundary");
  }
}

for (const map of mapIds) test(`${map}: nearby armies aggregate exactly once into a few camera-independent front sectors`, () => {
  const match = createMatch("normal", `sector-${map}`, true, map), snapshot = structuredClone(match);
  const sectors = frontStrength(match);
  assert.deepEqual(totals(sectors), { blue: 25 * SOLDIERS_PER_ARMY, red: 25 * SOLDIERS_PER_ARMY, formations: 50 });
  assert.ok(sectors.length <= Math.ceil(WIDTH / FRONT_STRENGTH_SECTOR) * Math.ceil(HEIGHT / FRONT_STRENGTH_SECTOR));
  assert.ok(sectors.length < match.units.length);
  assert.equal(new Set(sectors.map(sector => sector.id)).size, sectors.length);
  assertAnchors(sectors);
  assert.deepEqual(match, snapshot, "drawing totals cannot mutate simulation");
  assert.deepEqual(frontStrength(structuredClone(match)), sectors);
});

test("junctions and sector boundaries never double-count a dot and resolve ties deterministically", () => {
  const match = fixture();
  match.units = [army(1, 1, 72, 48), army(2, 2, 70, 47)];
  const segments = [vertical(), { a: { x: 0, y: 48 }, b: { x: WIDTH, y: 48 } }];
  const result = frontStrength(match, field(segments));
  assert.deepEqual(totals(result), { blue: 10_000, red: 10_000, formations: 2 });
  assert.equal(result.find(sector => sector.blue)?.id, "front:3:1");
  match.units.reverse();
  assert.deepEqual(frontStrength(match, field([...segments].reverse())), result);
  assertAnchors(result);
});

test("the twelve-world-unit inclusion radius uses segment distance, including endpoints, and excludes rear armies", () => {
  const match = fixture(), radius = FRONT_STRENGTH_DISTANCE;
  match.units = [army(1, 1, 72 - radius, 25), army(2, 1, 72 - radius - .001, 25),
    army(3, 2, 72 + radius, 25), army(4, 2, 72 + radius + .001, 25),
    army(5, 1, 72, 20 - radius), army(6, 1, 72, 20 - radius - .001), army(7, 1, 72 - radius, 20 - radius)];
  const result = frontStrength(match, field([vertical(72, 20, 30)]));
  assert.deepEqual(totals(result), { blue: 20_000, red: 10_000, formations: 3 });
});

test("HP, movement, deaths and newly recruited dots update immediately while time and frontier stay unchanged", () => {
  const match = fixture(), boundary = field([vertical()]);
  const blue = army(1, 1, 70, 10, 24), red = army(2, 2, 75, 60, 55, "heavy");
  match.units = [blue, red]; match.elapsed = 42;
  const first = frontStrength(match, boundary);
  assert.deepEqual(totals(first), { blue: 5_000, red: 5_000, formations: 2 });
  blue.hp = 12; blue.y = 70;
  const moved = frontStrength(match, boundary);
  assert.deepEqual(totals(moved), { blue: 2_500, red: 5_000, formations: 2 });
  assert.notEqual(first.find(sector => sector.blue)?.id, moved.find(sector => sector.blue)?.id);
  blue.x = 10;
  assert.deepEqual(totals(frontStrength(match, boundary)), { blue: 0, red: 5_000, formations: 1 });
  red.hp = 0;
  assert.deepEqual(frontStrength(match, boundary), []);
  match.units = [army(3, 1, 71, 42)];
  assert.deepEqual(totals(frontStrength(match, boundary)), { blue: 10_000, red: 0, formations: 1 });
  assert.equal(match.elapsed, 42);
});

test("disconnected fronts retain separate sectors and badges stay on their own boundary pieces", () => {
  const match = fixture();
  for (let y = 80; y < 88; y++) for (let x = 192; x < 200; x++) match.territory.owners[y * TERRITORY_COLS + x] = 1;
  match.territory.revision++;
  match.units = [army(1, 1, 98, 42), army(2, 2, 103, 42), army(3, 1, 70, 70)];
  const result = frontStrength(match);
  assert.deepEqual(totals(result), { blue: 20_000, red: 10_000, formations: 3 });
  assert.equal(result.length, 2);
  const island = result.find(sector => sector.red)!;
  assert.equal(island.id, "front:4:1"); assert.equal(island.formations, 2);
  assert.ok(island.segments.every(segment => segment.a.x >= 96 && segment.b.x >= 96));
  assertAnchors(result);
});

test("actual ownership geometry controls distance, while city labels and army team do not move the front", () => {
  const match = fixture(); match.units = [army(1, 1, 46, 45), army(2, 2, 50, 45)];
  const old = frontField(match);
  assert.deepEqual(frontStrength(match, old), []);
  match.cities.forEach(city => { city.owner = city.owner === 1 ? 2 : 1; });
  assert.equal(frontField(match), old);
  assert.deepEqual(frontStrength(match), []);
  match.territory.owners = match.territory.owners.map((owner, index) => owner ? index % TERRITORY_COLS < 96 ? 1 : 2 : 0);
  match.territory.revision++;
  const moved = frontStrength(match);
  assert.deepEqual(totals(moved), { blue: 10_000, red: 10_000, formations: 2 });
  assert.ok(moved.every(sector => sector.x === 48));
  assertAnchors(moved);
});

test("cached geometry never rereads the territory or distance field and exposes reusable immutable clipping pieces", () => {
  const match = fixture(); match.units = [army(1, 1, 71, 45)];
  const boundary = field([vertical()]); let reads = 0;
  Object.defineProperty(boundary, "segments", { get() { reads++; return [vertical()]; } });
  Object.defineProperty(match, "territory", { get() { throw new Error("An explicit field already owns the geometry"); } });
  const first = frontStrength(match, boundary);
  match.units[0].hp = 24;
  const next = frontStrength(match, boundary);
  assert.equal(reads, 1);
  assert.equal(first[0].segments, next[0].segments);
  assert.ok(Object.isFrozen(next[0].segments)); assert.ok(Object.isFrozen(next[0].segments[0].a));
  assert.deepEqual(totals(next), { blue: 5_000, red: 0, formations: 1 });
  assert.ok(next[0].segments.some(segment => Math.min(segment.a.y, segment.b.y) <= 45 && Math.max(segment.a.y, segment.b.y) >= 45),
    "the default close camera can place a badge on the visible sector piece");
});

test("empty fronts, dead armies and malformed nonfinite input never produce invalid badge numbers", () => {
  const match = fixture();
  match.units = [army(1, 1, 71, 45, 0), army(2, 2, 73, 45, -1), army(3, 1, NaN, 45),
    army(4, 1, Infinity, 45), army(5, 2, 73, 45, NaN), army(6, 1, -1, 45), army(7, 2, 73, 45, Infinity)];
  assert.deepEqual(frontStrength(match, field([vertical()])), []);
  match.units = [army(8, 1, 71, 45)];
  assert.deepEqual(frontStrength(match, field([])), []);
  const result = frontStrength(match, field([vertical(), { a: { x: NaN, y: 0 }, b: { x: 10, y: 10 } },
    { a: { x: -1e308, y: 0 }, b: { x: 1e308, y: 0 } }, { a: { x: 72, y: 45 }, b: { x: 72, y: 45 } }]));
  assert.deepEqual(totals(result), { blue: 10_000, red: 0, formations: 1 });
  assertAnchors(result);
});
