import { HEIGHT, WIDTH } from "./config";
import type { Kind, Point, Team } from "./config";
import { getMap, nearestOpen } from "./terrain";
import type { MapId } from "./terrain";
import { TERRITORY_COLS, TERRITORY_ROWS, TERRITORY_SPACING } from "./territory";
import type { Territory, TerritorySource } from "./territory";

export type FrontUnit = Point & { id: number; team: Team; hp: number; kind?: Kind };
export type FrontSource = TerritorySource & { elapsed: number; units: readonly FrontUnit[] };
/** normal points from blue occupation toward red occupation. */
export type FrontSegment = { a: Point; b: Point; normal?: Point };
export type FrontField = {
  key: string; spacing: number; origin: number; cols: number; rows: number; values: Float64Array;
  segments: FrontSegment[]; blueCount: number; redCount: number;
};
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
type Scratch = {
  effective: Uint8Array; nextEffective: Uint8Array; queue: Int32Array; used: Uint32Array; generation: number;
  vertical: FrontSegment[][]; horizontal: FrontSegment[][]; dirtyX: Uint8Array; dirtyY: Uint8Array; map: MapId;
  blue?: Float32Array; red?: Float32Array;
};
type Cached = { field: FrontField; territory: Territory; owners: number[]; revision: number; map: MapId; slots: Map<string, Point[]>; scratch: Scratch };
const fields = new WeakMap<FrontSource, Cached>();
const blockedCells = new Map<MapId, Int32Array>();

function blockers(map: MapId): Int32Array {
  const existing = blockedCells.get(map); if (existing) return existing;
  const tiles = getMap(map).tiles, result: number[] = [];
  for (let y = 0; y < TERRITORY_ROWS; y++) for (let x = 0; x < TERRITORY_COLS; x++) {
    const tile = tiles[Math.floor(y * TERRITORY_SPACING) * WIDTH + Math.floor(x * TERRITORY_SPACING)];
    if (tile === "rock" || tile === "water") result.push(y * TERRITORY_COLS + x);
  }
  const cells = Int32Array.from(result); blockedCells.set(map, cells); return cells;
}

/** Extend ownership only across neutral blockers for drawing. A nearest owner's
 * path cannot cross the other owner's ground first, so a multi-source flood of
 * neutral cells gives the same Manhattan winner as two full distance fields.
 * Blue seeds precede red seeds at each distance, preserving the blue tie rule.
 */
function extendBlockers(owners: Uint8Array, effective: Uint8Array, queue: Int32Array, map: MapId): void {
  const blocked = blockers(map), cols = TERRITORY_COLS, size = owners.length;
  let length = 0, read = 0;
  for (const team of [1, 2] as const) for (const cell of blocked) {
    if (effective[cell]) continue;
    const x = cell % cols;
    if ((x > 0 && owners[cell - 1] === team) || (x + 1 < cols && owners[cell + 1] === team) ||
        (cell >= cols && owners[cell - cols] === team) || (cell + cols < size && owners[cell + cols] === team)) {
      effective[cell] = team; queue[length++] = cell;
    }
  }
  while (read < length) {
    const cell = queue[read++], owner = effective[cell], x = cell % cols;
    if (x > 0 && !effective[cell - 1]) { effective[cell - 1] = owner; queue[length++] = cell - 1; }
    if (x + 1 < cols && !effective[cell + 1]) { effective[cell + 1] = owner; queue[length++] = cell + 1; }
    if (cell >= cols && !effective[cell - cols]) { effective[cell - cols] = owner; queue[length++] = cell - cols; }
    if (cell + cols < size && !effective[cell + cols]) { effective[cell + cols] = owner; queue[length++] = cell + cols; }
  }
}

// Exact grid Manhattan distance with two bounded raster passes. This fills only
// the geometric field: it never changes occupation or creates supply through rock.
function distances(owners: Uint8Array, team: Team, result: Float32Array) {
  const cols = TERRITORY_COLS, rows = TERRITORY_ROWS, far = cols + rows + 1;
  // TypedArray.from over a JavaScript array creates an intermediate iterable
  // conversion. Indexed writes keep full-grid revisions cheap during 3× play.
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
  const cols = TERRITORY_COLS, rows = TERRITORY_ROWS, spacing = TERRITORY_SPACING;
  const scratch: Scratch = cached?.scratch ?? {
    effective: new Uint8Array(owners.length), nextEffective: new Uint8Array(owners.length), queue: new Int32Array(owners.length),
    used: new Uint32Array(WIDTH * HEIGHT), generation: 0,
    vertical: Array.from({ length: cols }, () => []), horizontal: Array.from({ length: rows }, () => []),
    dirtyX: new Uint8Array(cols), dirtyY: new Uint8Array(rows), map,
  };
  // Keep each public field's values immutable even if a caller first reads them
  // after another territory revision. Only this compact ownership snapshot is
  // allocated eagerly; distance buffers are reused and evaluated on demand.
  const snapshot = new Uint8Array(owners.length), effective = scratch.nextEffective, previous = scratch.effective;
  const { dirtyX, dirtyY } = scratch;
  const reset = !cached || scratch.map !== map;
  dirtyX.fill(reset ? 1 : 0); dirtyY.fill(reset ? 1 : 0); scratch.map = map;
  const dirty = (cell: number) => {
    const x = cell % cols, y = Math.floor(cell / cols);
    if (x) dirtyX[x] = 1; if (x + 1 < cols) dirtyX[x + 1] = 1;
    if (y) dirtyY[y] = 1; if (y + 1 < rows) dirtyY[y + 1] = 1;
  };
  let blueCount = 0, redCount = 0, hash = 2166136261;
  for (let cell = 0; cell < owners.length; cell++) {
    const owner = owners[cell];
    snapshot[cell] = owner; effective[cell] = owner;
    if (!reset && owner && owner !== previous[cell]) dirty(cell);
    if (owner === 1) blueCount++; else if (owner === 2) redCount++;
    hash = Math.imul(hash ^ owner, 16777619);
  }
  extendBlockers(snapshot, effective, scratch.queue, map);
  if (!reset) for (const cell of blockers(map)) if (effective[cell] !== previous[cell]) dirty(cell);
  let values: Float64Array | undefined;
  const field: FrontField = {
    key: `${map}:${territory.revision}:${hash >>> 0}`, spacing, origin: spacing / 2, cols, rows,
    get values() {
      if (values) return values;
      const blueDistance = distances(snapshot, 1, scratch.blue ??= new Float32Array(snapshot.length));
      const redDistance = distances(snapshot, 2, scratch.red ??= new Float32Array(snapshot.length));
      values = new Float64Array(snapshot.length);
      for (let cell = 0; cell < snapshot.length; cell++) {
        const owner = snapshot[cell];
        values[cell] = (owner === 1 ? -redDistance[cell] : owner === 2 ? blueDistance[cell] : blueDistance[cell] - redDistance[cell]) * spacing;
      }
      return values;
    },
    segments: [], blueCount, redCount,
  };
  // Only a changed cell's adjacent rows/columns can change their edge runs.
  // Reuse other line arrays (immutable to callers) rather than scanning two full
  // grids every time one soldier occupies another half-cell.
  for (let x = 1; x < cols; x++) {
    if (!dirtyX[x]) continue;
    const segments: FrontSegment[] = [];
    let start = -1, normal = 0;
    for (let y = 0; y <= rows; y++) {
      const left = y < rows ? effective[y * cols + x - 1] : 0, right = y < rows ? effective[y * cols + x] : 0;
      const next = left && right && left !== right ? (left === 1 ? 1 : -1) : 0;
      if (next !== normal) {
        if (normal) segments.push({ a: { x: x * spacing, y: start * spacing }, b: { x: x * spacing, y: y * spacing }, normal: { x: normal, y: 0 } });
        start = next ? y : -1; normal = next;
      }
    }
    scratch.vertical[x] = segments;
  }
  for (let y = 1; y < rows; y++) {
    if (!dirtyY[y]) continue;
    const segments: FrontSegment[] = [];
    let start = -1, normal = 0;
    for (let x = 0; x <= cols; x++) {
      const above = x < cols ? effective[(y - 1) * cols + x] : 0, below = x < cols ? effective[y * cols + x] : 0;
      const next = above && below && above !== below ? (above === 1 ? 1 : -1) : 0;
      if (next !== normal) {
        if (normal) segments.push({ a: { x: start * spacing, y: y * spacing }, b: { x: x * spacing, y: y * spacing }, normal: { x: 0, y: normal } });
        start = next ? x : -1; normal = next;
      }
    }
    scratch.horizontal[y] = segments;
  }
  for (const segments of scratch.vertical) for (const segment of segments) field.segments.push(segment);
  for (const segments of scratch.horizontal) for (const segment of segments) field.segments.push(segment);
  field.segments.sort((a, b) => (a.a.y + a.b.y) - (b.a.y + b.b.y) || (a.a.x + a.b.x) - (b.a.x + b.b.x));
  scratch.effective = effective; scratch.nextEffective = previous;
  fields.set(match, { field, territory, owners, revision: territory.revision, map, slots: new Map(), scratch });
  return field;
}

/** Bilinear signed distance from cell centers: negativeblue, positivered. */
export function frontValue(field: FrontField, point: Point): number {
  const gx = clamp((point.x - field.origin) / field.spacing, 0, field.cols - 1), gy = clamp((point.y - field.origin) / field.spacing, 0, field.rows - 1);
  const x = Math.min(field.cols - 2, Math.floor(gx)), y = Math.min(field.rows - 2, Math.floor(gy));
  const tx = gx - x, ty = gy - y, base = y * field.cols + x;
  const values = field.values;
  return (values[base] * (1 - tx) + values[base + 1] * tx) * (1 - ty) +
    (values[base + field.cols] * (1 - tx) + values[base + field.cols + 1] * tx) * ty;
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
  for (const unit of match.units) if (unit.team === team && unit.hp > 0 && unit.kind !== "aircraft") {
    const x = Math.floor(unit.x), y = Math.floor(unit.y), component = connectivity[y * WIDTH + x];
    if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && component >= 0) accessible.add(component);
    else {
      const point = nearestOpen(unit, match.map); accessible.add(connectivity[Math.floor(point.y) * WIDTH + Math.floor(point.x)]);
    }
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
  const total = lengths.reduce((sum, length) => sum + length, 0), slots: Point[] = [];
  const scratch = cache.scratch, used = scratch.used;
  scratch.generation = (scratch.generation + 1) >>> 0;
  if (!scratch.generation) { used.fill(0); scratch.generation = 1; }
  const generation = scratch.generation, owners = match.territory.owners;
  let segmentIndex = 0, traversed = 0;
  for (let slot = 0; slot < count; slot++) {
    const along = total * (slot + .5) / count;
    while (segmentIndex < segments.length - 1 && along - traversed > lengths[segmentIndex]) traversed += lengths[segmentIndex++];
    const distance = along - traversed;
    const segment = segments[segmentIndex], t = lengths[segmentIndex] ? distance / lengths[segmentIndex] : .5;
    const border = { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
    const toward = segment.normal ? { x: segment.normal.x * (team === 1 ? 1 : -1), y: segment.normal.y * (team === 1 ? 1 : -1) } : direction(field, team, border), ideal = { x: border.x - toward.x * 2, y: border.y - toward.y * 2 };
    const origin = { x: Math.floor(clamp(ideal.x, 0, WIDTH - 1)), y: Math.floor(clamp(ideal.y, 0, HEIGHT - 1)) };
    let found: Point | null = null;
    for (let radius = 0; radius <= 20 && !found; radius++) {
      let score = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        // Visit just the perimeter, in the same deterministic order as the old
        // square scan. Interior work grew cubically around rivers and mountains.
        const stride = Math.abs(dy) === radius || !radius ? 1 : radius * 2;
        for (let dx = -radius; dx <= radius; dx += stride) {
          const x = origin.x + dx, y = origin.y + dy, id = y * WIDTH + x;
          if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || used[id] === generation || !accessible.has(connectivity[id])) continue;
          const cell = (y * 2 + 1) * TERRITORY_COLS + x * 2 + 1;
          if (owners[cell] !== team) continue;
          const px = x + .5, py = y + .5, candidate = (px - ideal.x) ** 2 + (py - ideal.y) ** 2;
          if (candidate < score) { found = { x: px, y: py }; score = candidate; }
        }
      }
    }
    if (found) { used[Math.floor(found.y) * WIDTH + Math.floor(found.x)] = generation; slots.push(found); }
  }
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  cache.slots.set(cacheKey, slots);
  return slots.map(point => ({ ...point }));
}
