import { HEIGHT, WIDTH } from "./config";
import type { Point, Team } from "./config";
import { getMap, nearestOpen, passable } from "./terrain";
import type { MapId } from "./terrain";
import { TERRITORY_COLS, TERRITORY_ROWS, TERRITORY_SPACING, territoryOwner } from "./territory";
import type { Territory, TerritorySource } from "./territory";

export type FrontUnit = Point & { id: number; team: Team; hp: number };
export type FrontSource = TerritorySource & { elapsed: number; units: readonly FrontUnit[] };
/** normal points from blue occupation toward red occupation. */
export type FrontSegment = { a: Point; b: Point; normal?: Point };
export type FrontField = {
  key: string; spacing: number; origin: number; cols: number; rows: number; values: Float64Array;
  segments: FrontSegment[]; blueCount: number; redCount: number;
};
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
type Cached = { field: FrontField; territory: Territory; owners: number[]; revision: number; map: MapId; slots: Map<string, Point[]> };
const fields = new WeakMap<FrontSource, Cached>();

// Exact grid Manhattan distance with two bounded raster passes. This fills only
// the geometric field: it never changes occupation or creates supply through rock.
function distances(owners: readonly number[], team: Team) {
  const cols = TERRITORY_COLS, rows = TERRITORY_ROWS, far = cols + rows + 1;
  // TypedArray.from over a JavaScript array creates an intermediate iterable
  // conversion. Indexed writes keep full-grid revisions cheap during 3× play.
  const result = new Float32Array(owners.length);
  for (let i = 0; i < owners.length; i++) result[i] = owners[i] === team ? 0 : far;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (x > 0) result[i] = Math.min(result[i], result[i - 1] + 1);
    if (y > 0) result[i] = Math.min(result[i], result[i - cols] + 1);
  }
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
    const i = y * cols + x;
    if (x + 1 < cols) result[i] = Math.min(result[i], result[i + 1] + 1);
    if (y + 1 < rows) result[i] = Math.min(result[i], result[i + cols] + 1);
  }
  return result;
}

/** Occupation is persistent state. Neither troop proximity, death, time nor city
 * ownership can move this line. Only a physical occupation change bumps revision.
 */
export function frontField(match: FrontSource): FrontField {
  const { territory, map } = match, owners = territory.owners, cached = fields.get(match);
  if (cached?.territory === territory && cached.owners === owners && cached.map === map && cached.revision === territory.revision) return cached.field;
  const blueDistance = distances(owners, 1), redDistance = distances(owners, 2);
  const cols = TERRITORY_COLS, rows = TERRITORY_ROWS, spacing = TERRITORY_SPACING;
  const values = new Float64Array(owners.length), effective = new Uint8Array(owners.length);
  let blueCount = 0, redCount = 0, hash = 2166136261;
  for (let cell = 0; cell < owners.length; cell++) {
    const owner = owners[cell];
    values[cell] = (owner === 1 ? -redDistance[cell] : owner === 2 ? blueDistance[cell] : blueDistance[cell] - redDistance[cell]) * spacing;
    // Neutral blockers have no owner. A geometric extension places the visible
    // front between opposing banks so soldiers can still spread along the banks.
    effective[cell] = owner || (values[cell] <= 0 ? 1 : 2);
    if (owner === 1) blueCount++; else if (owner === 2) redCount++;
    hash = Math.imul(hash ^ owner, 16777619);
  }
  const field: FrontField = { key: `${map}:${territory.revision}:${hash >>> 0}`, spacing, origin: spacing / 2, cols, rows, values, segments: [], blueCount, redCount };
  // Merge collinear half-cell edges. Closed pockets stay closed and boundaries
  // match the exact stored cells instead of shifting halfway toward remote units.
  for (let x = 1; x < cols; x++) {
    let start = -1, normal = 0;
    for (let y = 0; y <= rows; y++) {
      const left = y < rows ? effective[y * cols + x - 1] : 0, right = y < rows ? effective[y * cols + x] : 0;
      const next = left && right && left !== right ? (left === 1 ? 1 : -1) : 0;
      if (next !== normal) {
        if (normal) field.segments.push({ a: { x: x * spacing, y: start * spacing }, b: { x: x * spacing, y: y * spacing }, normal: { x: normal, y: 0 } });
        start = next ? y : -1; normal = next;
      }
    }
  }
  for (let y = 1; y < rows; y++) {
    let start = -1, normal = 0;
    for (let x = 0; x <= cols; x++) {
      const above = x < cols ? effective[(y - 1) * cols + x] : 0, below = x < cols ? effective[y * cols + x] : 0;
      const next = above && below && above !== below ? (above === 1 ? 1 : -1) : 0;
      if (next !== normal) {
        if (normal) field.segments.push({ a: { x: start * spacing, y: y * spacing }, b: { x: x * spacing, y: y * spacing }, normal: { x: 0, y: normal } });
        start = next ? x : -1; normal = next;
      }
    }
  }
  field.segments.sort((a, b) => (a.a.y + a.b.y) - (b.a.y + b.b.y) || (a.a.x + a.b.x) - (b.a.x + b.b.x));
  fields.set(match, { field, territory, owners, revision: territory.revision, map, slots: new Map() });
  return field;
}

/** Bilinear signed distance from cell centers: negativeblue, positivered. */
export function frontValue(field: FrontField, point: Point): number {
  const gx = clamp((point.x - field.origin) / field.spacing, 0, field.cols - 1), gy = clamp((point.y - field.origin) / field.spacing, 0, field.rows - 1);
  const x = Math.min(field.cols - 2, Math.floor(gx)), y = Math.min(field.rows - 2, Math.floor(gy));
  const tx = gx - x, ty = gy - y, base = y * field.cols + x;
  return (field.values[base] * (1 - tx) + field.values[base + 1] * tx) * (1 - ty) +
    (field.values[base + field.cols] * (1 - tx) + field.values[base + field.cols + 1] * tx) * ty;
}
function direction(field: FrontField, team: Team, point: Point): Point {
  const sign = team === 1 ? 1 : -1;
  const dx = frontValue(field, { x: point.x + .75, y: point.y }) - frontValue(field, { x: point.x - .75, y: point.y });
  const dy = frontValue(field, { x: point.x, y: point.y + .75 }) - frontValue(field, { x: point.x, y: point.y - .75 });
  const length = Math.hypot(dx, dy);
  if (length > 1e-7) return { x: sign * dx / length, y: sign * dy / length };
  let closest: FrontSegment | undefined, best = Infinity;
  for (const segment of field.segments) {
    const distance = (point.x - (segment.a.x + segment.b.x) / 2) ** 2 + (point.y - (segment.a.y + segment.b.y) / 2) ** 2;
    if (distance < best) { closest = segment; best = distance; }
  }
  return closest?.normal ? { x: sign * closest.normal.x, y: sign * closest.normal.y } : { x: sign, y: 0 };
}
export function frontDirection(match: FrontSource, team: Team, point: Point): Point { return direction(frontField(match), team, point); }

const connectedMaps = new Map<MapId, Int32Array>();
function components(mapId: MapId) {
  const cached = connectedMaps.get(mapId); if (cached) return cached;
  const tiles = getMap(mapId).tiles, result = new Int32Array(tiles.length).fill(-1), pending = new Int32Array(tiles.length);
  let component = 0;
  for (let start = 0; start < tiles.length; start++) {
    if (result[start] !== -1 || tiles[start] === "rock" || tiles[start] === "water") continue;
    let read = 0, length = 1; pending[0] = start; result[start] = component;
    while (read < length) {
      const id = pending[read++], x = id % WIDTH, y = Math.floor(id / WIDTH);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * WIDTH + nx;
        if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT || result[next] !== -1 || tiles[next] === "rock" || tiles[next] === "water") continue;
        result[next] = component; pending[length++] = next;
      }
    }
    component++;
  }
  connectedMaps.set(mapId, result); return result;
}

/** Distinct reachable friendly positions sampled along the stored occupation border. */
export function frontSlots(match: FrontSource, team: Team, count: number): Point[] {
  count = Math.max(0, Math.min(WIDTH * HEIGHT, Math.floor(count)));
  if (!count) return [];
  const field = frontField(match), cache = fields.get(match)!;
  const connectivity = components(match.map), accessible = new Set<number>();
  for (const unit of match.units) if (unit.team === team && unit.hp > 0) {
    const point = nearestOpen(unit, match.map); accessible.add(connectivity[Math.floor(point.y) * WIDTH + Math.floor(point.x)]);
  }
  if (!accessible.size) {
    const point = nearestOpen({ x: team === 1 ? .5 : WIDTH - .5, y: HEIGHT / 2 }, match.map);
    accessible.add(connectivity[Math.floor(point.y) * WIDTH + Math.floor(point.x)]);
  }
  const cacheKey = `${team}:${count}:${[...accessible].sort((a, b) => a - b).join(",")}`;
  const existing = cache.slots.get(cacheKey); if (existing) return existing.map(point => ({ ...point }));
  const edge = team === 1 ? WIDTH - .5 : .5;
  const segments: FrontSegment[] = field.segments.length ? field.segments : [{ a: { x: edge, y: 0 }, b: { x: edge, y: HEIGHT } }];
  const lengths = segments.map(segment => Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y));
  const total = lengths.reduce((sum, length) => sum + length, 0), used = new Set<number>(), slots: Point[] = [];
  for (let slot = 0; slot < count; slot++) {
    let distance = total * (slot + .5) / count, segmentIndex = 0;
    while (segmentIndex < segments.length - 1 && distance > lengths[segmentIndex]) distance -= lengths[segmentIndex++];
    const segment = segments[segmentIndex], t = lengths[segmentIndex] ? distance / lengths[segmentIndex] : .5;
    const border = { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
    const toward = segment.normal ? { x: segment.normal.x * (team === 1 ? 1 : -1), y: segment.normal.y * (team === 1 ? 1 : -1) } : direction(field, team, border), ideal = { x: border.x - toward.x * 2, y: border.y - toward.y * 2 };
    const origin = { x: Math.floor(clamp(ideal.x, 0, WIDTH - 1)), y: Math.floor(clamp(ideal.y, 0, HEIGHT - 1)) };
    let found: Point | null = null;
    for (let radius = 0; radius <= 20 && !found; radius++) {
      let score = Infinity;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = origin.x + dx, y = origin.y + dy, id = y * WIDTH + x;
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || used.has(id) || !accessible.has(connectivity[id])) continue;
        const point = { x: x + .5, y: y + .5 };
        if (!passable(point, match.map) || territoryOwner(match, point) !== team) continue;
        const candidate = (point.x - ideal.x) ** 2 + (point.y - ideal.y) ** 2;
        if (candidate < score) { found = point; score = candidate; }
      }
    }
    if (found) { used.add(Math.floor(found.y) * WIDTH + Math.floor(found.x)); slots.push(found); }
  }
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  cache.slots.set(cacheKey, slots);
  return slots.map(point => ({ ...point }));
}
