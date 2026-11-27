import { HEIGHT, WIDTH } from "./config";
import type { Owner, Point, Team } from "./config";
import { getMap } from "./terrain";
import type { MapId } from "./terrain";

export const TERRITORY_SPACING = .5;
export const TERRITORY_COLS = WIDTH / TERRITORY_SPACING;
export const TERRITORY_ROWS = HEIGHT / TERRITORY_SPACING;
export const TERRITORY_SIZE = TERRITORY_COLS * TERRITORY_ROWS;
export const OCCUPATION_RADIUS = .6;
export type Territory = { owners: number[]; revision: number };
export type TerritorySource = { map: MapId; territory: Territory };
export type OccupationSource = TerritorySource & { units: readonly (Point & { team: Team; hp: number })[] };

const masks = new Map<MapId, Uint8Array>();
function walkable(map: MapId) {
  const cached = masks.get(map); if (cached) return cached;
  const tiles = getMap(map).tiles, mask = new Uint8Array(TERRITORY_SIZE);
  for (let y = 0; y < TERRITORY_ROWS; y++) for (let x = 0; x < TERRITORY_COLS; x++) {
    const tile = tiles[Math.floor(y * TERRITORY_SPACING) * WIDTH + Math.floor(x * TERRITORY_SPACING)];
    mask[y * TERRITORY_COLS + x] = Number(tile !== "rock" && tile !== "water");
  }
  masks.set(map, mask); return mask;
}

export function territoryCell(point: Point): number {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x >= WIDTH || point.y >= HEIGHT) return -1;
  return Math.floor(point.y / TERRITORY_SPACING) * TERRITORY_COLS + Math.floor(point.x / TERRITORY_SPACING);
}

export function createTerritory(map: MapId): Territory {
  const mask = walkable(map);
  return { owners: Array.from(mask, (open, index) => open ? (index % TERRITORY_COLS < TERRITORY_COLS / 2 ? 1 : 2) : 0), revision: 0 };
}

export function territoryOwner(source: TerritorySource, point: Point): Owner {
  const cell = territoryCell(point);
  return cell < 0 ? 0 : (source.territory.owners[cell] ?? 0) as Owner;
}

type Scratch = { claims: Uint8Array; visited: Uint32Array; generation: number; queue: Int32Array; touched: number[] };
const scratches = new WeakMap<Territory, Scratch>();

/** Only the small area actually occupied by living soldiers changes ownership.
 * Claims are resolved together, so traversal order gives neither side priority.
 * Local four-neighbor growth cannot stamp through water, rocks or blocked corners.
 */
export function advanceTerritory(source: OccupationSource): boolean {
  const { territory } = source, mask = walkable(source.map);
  let scratch = scratches.get(territory);
  if (!scratch) {
    scratch = { claims: new Uint8Array(TERRITORY_SIZE), visited: new Uint32Array(TERRITORY_SIZE), generation: 0, queue: new Int32Array(32), touched: [] };
    scratches.set(territory, scratch);
  }
  const { claims, visited, queue, touched } = scratch;
  const radiusSquared = OCCUPATION_RADIUS ** 2;
  for (const unit of source.units) {
    if (unit.hp <= 0 || (unit.team !== 1 && unit.team !== 2)) continue;
    const start = territoryCell(unit); if (start < 0 || !mask[start]) continue;
    scratch.generation = (scratch.generation + 1) >>> 0;
    if (!scratch.generation) { visited.fill(0); scratch.generation = 1; }
    const generation = scratch.generation;
    let read = 0, length = 1; queue[0] = start; visited[start] = generation;
    while (read < length) {
      const cell = queue[read++], x = cell % TERRITORY_COLS, y = Math.floor(cell / TERRITORY_COLS);
      if (!claims[cell]) touched.push(cell);
      claims[cell] |= unit.team;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * TERRITORY_COLS + nx;
        if (nx < 0 || ny < 0 || nx >= TERRITORY_COLS || ny >= TERRITORY_ROWS || !mask[next] || visited[next] === generation) continue;
        visited[next] = generation;
        const px = (nx + .5) * TERRITORY_SPACING, py = (ny + .5) * TERRITORY_SPACING;
        if ((px - unit.x) ** 2 + (py - unit.y) ** 2 > radiusSquared + 1e-9) continue;
        queue[length++] = next;
      }
    }
  }
  let changed = false;
  for (const cell of touched) {
    const owner = claims[cell];
    if (owner !== 3 && territory.owners[cell] !== owner) { territory.owners[cell] = owner; changed = true; }
    claims[cell] = 0;
  }
  touched.length = 0;
  if (changed) territory.revision = (territory.revision + 1) & 0x7fffffff;
  return changed;
}

type SupplyCache = { map: MapId; revision: number; owners: number[]; supplied: Uint8Array };
const supplies = new WeakMap<Territory, SupplyCache>();

/** Both teams are filled in one bounded four-neighbor search from their rear edge.
 * A surrounded friendly island is disconnected even if it contains owned cities.
 */
export function suppliedCells(source: TerritorySource): Uint8Array {
  const { territory, map } = source, cached = supplies.get(territory);
  if (cached?.map === map && cached.revision === territory.revision && cached.owners === territory.owners) return cached.supplied;
  const owners = territory.owners, mask = walkable(map), supplied = new Uint8Array(TERRITORY_SIZE), queue = new Int32Array(TERRITORY_SIZE);
  let read = 0, length = 0;
  for (let y = 0; y < TERRITORY_ROWS; y++) for (const team of [1, 2] as const) {
    const cell = y * TERRITORY_COLS + (team === 1 ? 0 : TERRITORY_COLS - 1);
    if (mask[cell] && owners[cell] === team) { supplied[cell] = team; queue[length++] = cell; }
  }
  while (read < length) {
    const cell = queue[read++], team = supplied[cell], x = cell % TERRITORY_COLS, y = Math.floor(cell / TERRITORY_COLS);
    const visit = (next: number) => {
      if (!supplied[next] && mask[next] && owners[next] === team) { supplied[next] = team; queue[length++] = next; }
    };
    if (x > 0) visit(cell - 1); if (x + 1 < TERRITORY_COLS) visit(cell + 1);
    if (y > 0) visit(cell - TERRITORY_COLS); if (y + 1 < TERRITORY_ROWS) visit(cell + TERRITORY_COLS);
  }
  supplies.set(territory, { map, revision: territory.revision, owners, supplied });
  return supplied;
}

export function isSupplied(source: TerritorySource, team: Team, point: Point): boolean {
  const cell = territoryCell(point);
  return cell >= 0 && source.territory.owners[cell] === team && suppliedCells(source)[cell] === team;
}
