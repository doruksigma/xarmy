import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, WIDTH } from "./config";
import { frontDirection, frontField, frontSlots, frontValue } from "./front";
import type { FrontSource, FrontUnit } from "./front";
import { mapIds, passable, route } from "./terrain";
import type { MapId } from "./terrain";
import { advanceTerritory, createTerritory, territoryOwner, TERRITORY_COLS, TERRITORY_ROWS } from "./territory";

const source = (map: MapId = "plains", count = 25): FrontSource => ({
  map, elapsed: 0, territory: createTerritory(map), units: ([1, 2] as const).flatMap(team => Array.from({ length: count }, (_, index): FrontUnit => ({
    id: (team - 1) * count + index + 1, team, hp: 48,
    x: team === 1 ? 61.5 : 82.5, y: HEIGHT * (index + .5) / count,
  }))),
});
test("the frontier changes only where a live soldier physically occupies enemy ground", () => {
  const state = source("plains", 1), first = frontField(state);
  state.units[0].x = 70.25; state.units[0].y = 45.25;
  assert.equal(frontField(state), first, "movement alone does not capture remote territory");
  advanceTerritory(state); assert.equal(frontField(state), first, "moving inside owned ground leaves borders unchanged");
  state.units[0].x = 72.25; advanceTerritory(state);
  const captured = frontField(state);
  assert.notEqual(captured.key, first.key);
  assert.equal(territoryOwner(state, state.units[0]), 1);
  assert.ok(captured.segments.some(segment => segment.a.x > WIDTH / 2));
  state.units[0].x = 60; state.units[0].hp = 0; advanceTerritory(state);
  assert.equal(frontField(state), captured, "retreat or death does not return captured land");
});

test("city ownership, elapsed time, army death and remote troop positions cannot change occupation", () => {
  const state = Object.assign(source(), { cities: [{ x: 2, y: 2, owner: 1 }] });
  const first = frontField(state);
  state.cities[0].owner = 2; state.elapsed = 90;
  state.units = state.units.map(unit => ({ ...unit, x: unit.x + 20, hp: 0 }));
  advanceTerritory(state);
  assert.equal(frontField(state), first);
});

test("front geometry and target positions resume deterministically from current soldier poses", () => {
  const state = source("forest");
  state.units[5].x = 72.75; state.units[8].x = 72.25; advanceTerritory(state);
  const restored: FrontSource = JSON.parse(JSON.stringify(state));
  assert.deepEqual(frontField(restored), frontField(state));
  for (const team of [1, 2] as const) assert.deepEqual(frontSlots(restored, team, 25), frontSlots(state, team, 25));
  const copy = frontSlots(state, 1, 25), x = copy[0].x;
  copy[0].x = -1;
  assert.equal(frontSlots(state, 1, 25)[0].x, x, "callers cannot mutate cached slot geometry");
});

test("front directions follow stored ownership and remain finite with no armies", () => {
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
      assert.equal(territoryOwner(state, slot), team);
      assert.ok(route(first, slot, "light", map).length, `disconnected ${slot.x},${slot.y}`);
    }
    assert.ok(slots.every((point, index) => index === 0 || point.y >= slots[index - 1].y));
  }
});

test("closed persistent pocket loops appear in the line without requiring soldiers inside", () => {
  const state = source(), cols = TERRITORY_COLS;
  // A blue island inside red occupation: exact half-cell edges form a closed loop.
  for (let y = 80; y < 88; y++) for (let x = 190; x < 198; x++) state.territory.owners[y * cols + x] = 1;
  state.territory.revision++;
  const segments = frontField(state).segments.filter(segment => segment.a.x >= 95 && segment.b.x >= 95);
  assert.equal(segments.length, 4);
  const vertices = new Map<string, number>();
  for (const segment of segments) for (const point of [segment.a, segment.b]) {
    const key = `${point.x}:${point.y}`; vertices.set(key, (vertices.get(key) ?? 0) + 1);
  }
  assert.equal(vertices.size, 4); assert.ok([...vertices.values()].every(count => count === 2));
  assert.ok(frontDirection(state, 1, { x: 98.5, y: 42 }).x > .9);
});

// Independent whole-grid BFS reference for the old nearest-owner geometry.
// The optimized frontier must preserve its answer even though it now floods
// only neutral blockers and rebuilds only affected edge rows/columns.
function referenceDistances(owners: number[], team: 1 | 2) {
  const cols = TERRITORY_COLS, result = new Int32Array(owners.length).fill(cols + TERRITORY_ROWS + 1);
  const queue = new Int32Array(owners.length); let read = 0, length = 0;
  for (let cell = 0; cell < owners.length; cell++) if (owners[cell] === team) { result[cell] = 0; queue[length++] = cell; }
  while (read < length) {
    const cell = queue[read++], x = cell % cols, nextDistance = result[cell] + 1;
    const visit = (next: number) => {
      if (result[next] > nextDistance) { result[next] = nextDistance; queue[length++] = next; }
    };
    if (x) visit(cell - 1); if (x + 1 < cols) visit(cell + 1);
    if (cell >= cols) visit(cell - cols); if (cell + cols < owners.length) visit(cell + cols);
  }
  return result;
}

for (const map of mapIds) test(`${map}: incremental border edges match independent nearest-owner geometry`, () => {
  const state = source(map), cols = TERRITORY_COLS, rows = TERRITORY_ROWS;
  frontField(state);
  // Several revisions exercise reused edge runs, including blocker-bank changes.
  for (let revision = 0; revision < 4; revision++) {
    for (let index = 0; index < 35; index++) {
      const cell = (6 + (index * 17 + revision * 11) % (rows - 12)) * cols + 126 + (index * 7 + revision * 3) % 36;
      if (state.territory.owners[cell]) state.territory.owners[cell] = state.territory.owners[cell] === 1 ? 2 : 1;
    }
    state.territory.revision++; frontField(state);
  }
  const owners = state.territory.owners, blue = referenceDistances(owners, 1), red = referenceDistances(owners, 2);
  const effective = owners.map((owner, cell) => owner || (blue[cell] <= red[cell] ? 1 : 2));
  const expected: string[] = [], actual: string[] = [];
  for (let y = 0; y < rows; y++) for (let x = 1; x < cols; x++) {
    const left = effective[y * cols + x - 1], right = effective[y * cols + x];
    if (left !== right) expected.push(`v:${x}:${y}:${left === 1 ? 1 : -1}`);
  }
  for (let y = 1; y < rows; y++) for (let x = 0; x < cols; x++) {
    const above = effective[(y - 1) * cols + x], below = effective[y * cols + x];
    if (above !== below) expected.push(`h:${x}:${y}:${above === 1 ? 1 : -1}`);
  }
  const field = frontField(state);
  for (const segment of field.segments) {
    if (segment.a.x === segment.b.x) {
      for (let y = segment.a.y * 2; y < segment.b.y * 2; y++) actual.push(`v:${segment.a.x * 2}:${y}:${segment.normal!.x}`);
    } else for (let x = segment.a.x * 2; x < segment.b.x * 2; x++) actual.push(`h:${x}:${segment.a.y * 2}:${segment.normal!.y}`);
  }
  assert.deepEqual(actual.sort(), expected.sort());
  assert.deepEqual(field.values, Float64Array.from(owners, (owner, cell) =>
    (owner === 1 ? -red[cell] : owner === 2 ? blue[cell] : blue[cell] - red[cell]) * .5));
});

test("deferred distance values and old geometry remain stable after later territory revisions", () => {
  const state = source(), first = frontField(state), before = JSON.stringify(first.segments);
  const point = { x: 75.25, y: 45.25 }, cell = 90 * TERRITORY_COLS + 150;
  state.territory.owners[cell] = 1; state.territory.revision++;
  const next = frontField(state);
  assert.ok(frontValue(next, point) < 0);
  assert.ok(frontValue(first, point) > 0, "the old lazy field reads its own ownership snapshot");
  assert.equal(JSON.stringify(first.segments), before);
  assert.notEqual(first.values, next.values);
});

test("restored ownership buffers and a different map invalidate reused frontier geometry and slots", () => {
  const state = source(); frontSlots(state, 1, 25);
  const owners = state.territory.owners.slice(); owners[90 * TERRITORY_COLS + 150] = 1;
  state.territory = { owners, revision: state.territory.revision };
  const fresh = JSON.parse(JSON.stringify(state)) as FrontSource;
  assert.deepEqual(frontField(state), frontField(fresh));
  assert.deepEqual(frontSlots(state, 1, 25), frontSlots(fresh, 1, 25));
  state.map = "center"; state.territory = createTerritory("center");
  const restored = JSON.parse(JSON.stringify(state)) as FrontSource;
  assert.deepEqual(frontField(state), frontField(restored));
  assert.deepEqual(frontSlots(state, 2, 125), frontSlots(restored, 2, 125));
});
