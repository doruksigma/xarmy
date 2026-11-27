import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, WIDTH } from "./config";
import type { Point } from "./config";
import { frontDirection, frontField, frontSlots, frontValue } from "./front";
import type { FrontSource, FrontUnit } from "./front";
import { mapIds, passable, route } from "./terrain";
import type { MapId } from "./terrain";

const source = (map: MapId = "plains", count = 25): FrontSource => ({
  map, elapsed: 0, units: ([1, 2] as const).flatMap(team => Array.from({ length: count }, (_, index): FrontUnit => ({
    id: (team - 1) * count + index + 1, team, hp: 48,
    x: team === 1 ? 61.5 : 82.5, y: HEIGHT * (index + .5) / count,
  }))),
});
const meanBorderX = (state: FrontSource) => {
  const field = frontField(state);
  return field.segments.reduce((total, segment) => total + (segment.a.x + segment.b.x) / 2, 0) / field.segments.length;
};

test("a fraction of a slow soldier's movement shifts the live border before any city changes", () => {
  const state = source("plains", 1);
  const first = frontField(state), before = meanBorderX(state);
  state.units[0].x += .05;
  const after = frontField(state);
  assert.notEqual(after.key, first.key);
  assert.ok(meanBorderX(state) > before + .01);
  assert.ok(meanBorderX(state) < before + .1);
  assert.ok(frontValue(after, { x: WIDTH / 2, y: HEIGHT / 2 }) < 0);
  state.units[0].x += .25;
  assert.ok(meanBorderX(state) > before + .1);
});

test("city ownership, elapsed time and dead soldiers never supply territory influence", () => {
  const state = Object.assign(source(), { cities: [{ x: 2, y: 2, owner: 1 }] });
  const first = frontField(state);
  state.cities[0].owner = 2; state.elapsed = 90;
  assert.equal(frontField(state), first);
  state.units = [...state.units, { id: 900, team: 1, hp: 0, x: 130, y: 45 }];
  assert.equal(frontField(state), first);
  state.units.at(-1)!.hp = 1;
  assert.notEqual(frontField(state).key, first.key);
});

test("front geometry and target positions resume deterministically from current soldier poses", () => {
  const state = source("forest");
  state.units[5].x += .28; state.units[8].y -= .13;
  const restored: FrontSource = JSON.parse(JSON.stringify(state));
  assert.deepEqual(frontField(restored), frontField(state));
  for (const team of [1, 2] as const) assert.deepEqual(frontSlots(restored, team, 25), frontSlots(state, team, 25));
  const copy = frontSlots(state, 1, 25), x = copy[0].x;
  copy[0].x = -1;
  assert.equal(frontSlots(state, 1, 25)[0].x, x, "callers cannot mutate cached slot geometry");
});

test("front directions face the opposing army and remain finite for empty or coincident armies", () => {
  const state = source();
  assert.ok(frontDirection(state, 1, { x: 70, y: 45 }).x > .99);
  assert.ok(frontDirection(state, 2, { x: 74, y: 45 }).x < -.99);
  const cases: FrontSource[] = [
    { ...state, units: [] }, { ...state, units: state.units.filter(unit => unit.team === 1) },
    { ...state, units: state.units.filter(unit => unit.team === 2) },
    { ...state, units: state.units.map(unit => ({ ...unit, x: 72, y: 45 })) },
  ];
  for (const match of cases) {
    const field = frontField(match);
    assert.ok(field.segments.length);
    assert.ok([...field.values].every(Number.isFinite));
    for (const team of [1, 2] as const) {
      const direction = frontDirection(match, team, { x: 72, y: 45 });
      assert.ok(Number.isFinite(direction.x) && Number.isFinite(direction.y));
      assert.ok(frontSlots(match, team, 3).every(point => passable(point, match.map)));
    }
  }
});

for (const map of mapIds) test(`${map}: all soldiers receive distinct reachable positions across the whole front`, () => {
  const state = source(map), field = frontField(state);
  for (const team of [1, 2] as const) for (const count of [25, 125]) {
    const slots = frontSlots(state, team, count);
    assert.equal(slots.length, count);
    assert.equal(new Set(slots.map(point => `${point.x}:${point.y}`)).size, count);
    assert.ok(Math.max(...slots.map(point => point.y)) - Math.min(...slots.map(point => point.y)) > HEIGHT * .85);
    const first = state.units.find(unit => unit.team === team)!;
    for (const slot of slots) {
      assert.ok(passable(slot, map), `blocked ${slot.x},${slot.y}`);
      assert.ok(frontValue(field, slot) * (team === 1 ? 1 : -1) < 0, "defense target stays on its own side");
      assert.ok(route(first, slot, "light", map).length, `disconnected ${slot.x},${slot.y}`);
    }
    assert.ok(slots.every((point, index) => index === 0 || point.y >= slots[index - 1].y));
  }
});

test("a curved border follows local troops and target assignment stays spatially distributed", () => {
  const state = source();
  state.units = state.units.map(unit => ({ ...unit, x: unit.x + (unit.team === 1 ? 13 * Math.sin(unit.y / HEIGHT * Math.PI * 2) : 0) }));
  const field = frontField(state);
  const xs = field.segments.flatMap(segment => [segment.a.x, segment.b.x]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 8);
  const slots = frontSlots(state, 1, 25);
  assert.equal(slots.length, 25);
  assert.ok(slots.at(-1)!.y - slots[0].y > HEIGHT * .8);
  assert.ok(slots.every((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
