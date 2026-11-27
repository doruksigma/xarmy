import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, WIDTH } from "./config";
import { getMap, mapIds, nearestOpen, passable } from "./terrain";
import { advanceTerritory, createTerritory, isSupplied, suppliedCells, territoryCell, territoryOwner, TERRITORY_COLS, TERRITORY_ROWS, TERRITORY_SIZE, TERRITORY_SPACING } from "./territory";
import type { OccupationSource } from "./territory";

const source = (): OccupationSource => ({ map: "plains", territory: createTerritory("plains"), units: [] });

test("only a living soldier's visited footprint changes permanent occupation", () => {
  const state = source(), point = { x: 72.75, y: 45.25 };
  assert.equal(territoryOwner(state, point), 2);
  state.units = [{ ...point, hp: 48, team: 1 }];
  assert.equal(advanceTerritory(state), true);
  assert.equal(territoryOwner(state, point), 1);
  const revision = state.territory.revision, saved = [...state.territory.owners];
  state.units = [{ x: 61, y: 45, hp: 48, team: 1 }];
  assert.equal(advanceTerritory(state), false);
  state.units = [{ ...point, hp: 0, team: 2 }];
  assert.equal(advanceTerritory(state), false);
  state.units = []; assert.equal(advanceTerritory(state), false);
  assert.equal(state.territory.revision, revision);
  assert.deepEqual(state.territory.owners, saved);
  assert.equal(territoryOwner(state, { x: point.x + 2, y: point.y }), 2, "distant cells are not taken by proximity");
});

test("the opponent must physically return to retake visited ground", () => {
  const state = source(), point = { x: 73.25, y: 45.25 };
  state.units = [{ ...point, hp: 48, team: 1 }]; advanceTerritory(state);
  state.units = [{ x: 78.25, y: 45.25, hp: 48, team: 2 }]; advanceTerritory(state);
  assert.equal(territoryOwner(state, point), 1);
  state.units = [{ ...point, hp: 48, team: 2 }]; advanceTerritory(state);
  assert.equal(territoryOwner(state, point), 2);
});

test("opposing simultaneous claims leave contested ownership unchanged regardless of iteration order", () => {
  for (const x of [71.75, 72.25]) {
    const first = source(), second = source();
    const units = [{ x, y: 45.25, hp: 48, team: 1 as const }, { x, y: 45.25, hp: 48, team: 2 as const }];
    first.units = units; second.units = [...units].reverse();
    const before = [...first.territory.owners];
    assert.equal(advanceTerritory(first), false); assert.equal(advanceTerritory(second), false);
    assert.deepEqual(first.territory.owners, before); assert.deepEqual(second.territory.owners, before);
  }
});

test("water, rock and invalid positions cannot be occupied or stamp remote cells", () => {
  for (const map of ["valley", "fronts"] as const) {
    const state: OccupationSource = { map, territory: createTerritory(map), units: [{ x: 71.5, y: 35.5, hp: 48, team: 1 }] };
    assert.equal(passable(state.units[0], map), false);
    const before = [...state.territory.owners]; assert.equal(advanceTerritory(state), false);
    assert.deepEqual(state.territory.owners, before);
    const bank = nearestOpen(state.units[0], map);
    state.units = [{ ...bank, hp: 48, team: territoryOwner(state, bank) === 1 ? 2 : 1 }];
    advanceTerritory(state);
    for (let cell = 0; cell < TERRITORY_SIZE; cell++) if (!before[cell]) assert.equal(state.territory.owners[cell], 0);
    state.units = [{ x: -1, y: 45, hp: 48, team: 1 }, { x: WIDTH, y: HEIGHT, hp: 48, team: 2 }];
    assert.equal(advanceTerritory(state), false);
  }
});

test("a true closed enemy ring severs supply and a physically opened corridor restores it", () => {
  const state = source(), cols = TERRITORY_COLS, point = { x: 20.25, y: 45.25 };
  assert.equal(isSupplied(state, 1, point), true);
  for (let x = 36; x <= 47; x++) { state.territory.owners[84 * cols + x] = 2; state.territory.owners[95 * cols + x] = 2; }
  for (let y = 84; y <= 95; y++) { state.territory.owners[y * cols + 36] = 2; state.territory.owners[y * cols + 47] = 2; }
  // The ring itself connects to the enemy's rear through this occupied corridor.
  for (let x = 47; x < cols / 2; x++) state.territory.owners[84 * cols + x] = 2;
  state.territory.revision++;
  assert.equal(territoryOwner(state, point), 1);
  assert.equal(isSupplied(state, 1, point), false);
  assert.equal(isSupplied(state, 2, { x: 18.25, y: 42.25 }), true);
  const cache = suppliedCells(state); assert.equal(suppliedCells(state), cache);
  state.units = [{ x: 18.25, y: 45.25, hp: 48, team: 1 }];
  assert.equal(advanceTerritory(state), true);
  assert.equal(isSupplied(state, 1, point), true);
  assert.notEqual(suppliedCells(state), cache);
});

for (const map of mapIds) test(`${map}: the initial cities and rear territory have valid supply without crossing blockers`, () => {
  const state = { map, territory: createTerritory(map) }, terrain = getMap(map);
  assert.equal(state.territory.owners.length, TERRITORY_SIZE);
  assert.equal(TERRITORY_COLS, 288); assert.equal(TERRITORY_ROWS, 180); assert.equal(TERRITORY_SPACING, .5);
  for (const city of terrain.cities) assert.equal(isSupplied(state, city.owner as 1 | 2, city), true);
  for (let cell = 0; cell < TERRITORY_SIZE; cell++) {
    const point: { x: number; y: number } = { x: (cell % TERRITORY_COLS + .5) * .5, y: (Math.floor(cell / TERRITORY_COLS) + .5) * .5 };
    assert.equal(state.territory.owners[cell] === 0, !passable(point, map));
  }
});

test("occupation and supply reload exactly, and revision rollover invalidates the previous cache", () => {
  const state = source(); state.units = [{ x: 73.25, y: 45.25, hp: 48, team: 1 }]; advanceTerritory(state);
  const restored: OccupationSource = JSON.parse(JSON.stringify(state));
  assert.deepEqual(suppliedCells(state), suppliedCells(restored));
  assert.equal(territoryOwner(restored, state.units[0]), 1);
  state.territory.revision = 0x7fffffff;
  const cached = suppliedCells(state);
  state.units = [{ x: 74.25, y: 45.25, hp: 48, team: 1 }]; advanceTerritory(state);
  assert.equal(state.territory.revision, 0);
  assert.notEqual(suppliedCells(state), cached);
  assert.equal(territoryCell({ x: NaN, y: 1 }), -1);
  assert.equal(territoryOwner(state, { x: -1, y: 0 }), 0);
});
