import { HEIGHT, WIDTH } from "./config";
import type { Point, Team } from "./config";
import { getMap, nearestOpen, passable } from "./terrain";
import type { MapId } from "./terrain";

export type FrontUnit = Point & { id: number; team: Team; hp: number };
export type FrontSource = { map: MapId; elapsed: number; units: readonly FrontUnit[] };
export type FrontSegment = { a: Point; b: Point };
export type FrontField = {
  key: string; spacing: number; cols: number; rows: number; values: Float64Array;
  segments: FrontSegment[]; blueCount: number; redCount: number;
};
const SPACING = 3;
const POSE_SCALE = 32;
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
type Tree = { point: Point; axis: 0 | 1; left: Tree | null; right: Tree | null };
function tree(points: Point[], depth = 0): Tree | null {
  if (!points.length) return null;
  const axis = (depth % 2) as 0 | 1, key = axis ? "y" : "x";
  points.sort((a, b) => a[key] - b[key] || a.x - b.x || a.y - b.y);
  const middle = points.length >> 1;
  return { point: points[middle], axis, left: tree(points.slice(0, middle), depth + 1), right: tree(points.slice(middle + 1), depth + 1) };
}
function nearest(root: Tree | null, point: Point, best = Infinity): number {
  if (!root) return best;
  const dx = root.point.x - point.x, dy = root.point.y - point.y;
  best = Math.min(best, dx * dx + dy * dy);
  const delta = root.axis ? point.y - root.point.y : point.x - root.point.x;
  best = nearest(delta < 0 ? root.left : root.right, point, best);
  if (delta * delta < best) best = nearest(delta < 0 ? root.right : root.left, point, best);
  return best;
}

type Cached = { field: FrontField; slots: Map<string, Point[]> };
const fields = new WeakMap<FrontSource, Cached>();

/** Troop-only influence. Negative is blue, positive is red; city data is never read.
 * A thirty-second of a cell is below one screen pixel at the normal camera scale,
 * so even the slow infantry continuously changes the line. Cached geometry is a
 * pure function of these poses: reloading a save produces the identical front.
 */
export function frontField(match: FrontSource): FrontField {
  const living = match.units.filter(unit => unit.hp > 0 && Number.isFinite(unit.x) && Number.isFinite(unit.y))
    .map(unit => ({ id: unit.id, team: unit.team, x: Math.round(unit.x * POSE_SCALE) / POSE_SCALE, y: Math.round(unit.y * POSE_SCALE) / POSE_SCALE }))
    .sort((a, b) => a.id - b.id);
  const key = `${match.map}|${living.map(unit => `${unit.id}:${unit.team}:${unit.x}:${unit.y}`).join(";")}`;
  const cached = fields.get(match);
  if (cached?.field.key === key) return cached.field;
  const blue = living.filter(unit => unit.team === 1), red = living.filter(unit => unit.team === 2);
  const blueTree = tree([...blue]), redTree = tree([...red]);
  const cols = Math.ceil(WIDTH / SPACING) + 1, rows = Math.ceil(HEIGHT / SPACING) + 1;
  const values = new Float64Array(cols * rows);
  let anyNegative = false, anyPositive = false;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const point = { x: Math.min(WIDTH, col * SPACING), y: Math.min(HEIGHT, row * SPACING) };
    const value = blue.length && red.length ? Math.sqrt(nearest(blueTree, point)) - Math.sqrt(nearest(redTree, point)) :
      point.x - (blue.length ? WIDTH - 1.5 : red.length ? 1.5 : WIDTH / 2);
    values[row * cols + col] = value;
    if (value < 0) anyNegative = true; if (value > 0) anyPositive = true;
  }
  // Coincident opposing armies give an undefined all-zero bisector; split the map
  // deterministically instead of losing the line or consulting ownership.
  if (!anyNegative && !anyPositive) for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) values[row * cols + col] = col * SPACING - WIDTH / 2;
  const field: FrontField = { key, spacing: SPACING, cols, rows, values, segments: [], blueCount: blue.length, redCount: red.length };
  for (let row = 0; row < rows - 1; row++) for (let col = 0; col < cols - 1; col++) {
    const points = [
      { x: col * SPACING, y: row * SPACING }, { x: (col + 1) * SPACING, y: row * SPACING },
      { x: (col + 1) * SPACING, y: (row + 1) * SPACING }, { x: col * SPACING, y: (row + 1) * SPACING },
    ];
    const v = [values[row * cols + col], values[row * cols + col + 1], values[(row + 1) * cols + col + 1], values[(row + 1) * cols + col]];
    const crossings: Point[] = [];
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      if ((v[edge] <= 0) === (v[next] <= 0)) continue;
      const t = clamp(v[edge] / (v[edge] - v[next]), 0, 1);
      crossings.push({ x: points[edge].x + (points[next].x - points[edge].x) * t, y: points[edge].y + (points[next].y - points[edge].y) * t });
    }
    if (crossings.length === 2) field.segments.push({ a: crossings[0], b: crossings[1] });
    else if (crossings.length === 4) {
      const same = (v[0] <= 0) === (v.reduce((sum, value) => sum + value, 0) <= 0);
      for (const [a, b] of same ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]) field.segments.push({ a: crossings[a], b: crossings[b] });
    }
  }
  field.segments.sort((a, b) => (a.a.y + a.b.y) - (b.a.y + b.b.y) || (a.a.x + a.b.x) - (b.a.x + b.b.x));
  fields.set(match, { field, slots: new Map() });
  return field;
}

/** Bilinear signed influence, shared by rendering, slot placement and stance direction. */
export function frontValue(field: FrontField, point: Point): number {
  const gx = clamp(point.x / field.spacing, 0, field.cols - 1), gy = clamp(point.y / field.spacing, 0, field.rows - 1);
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
  return length > 1e-7 ? { x: sign * dx / length, y: sign * dy / length } : { x: sign, y: 0 };
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

/** Distinct reachable positions sampled along the entire troop-derived border. */
export function frontSlots(match: FrontSource, team: Team, count: number): Point[] {
  count = Math.max(0, Math.min(WIDTH * HEIGHT, Math.floor(count)));
  if (!count) return [];
  const field = frontField(match), cache = fields.get(match)!;
  const cacheKey = `${team}:${count}`, existing = cache.slots.get(cacheKey);
  if (existing) return existing.map(point => ({ ...point }));
  const connectivity = components(match.map), accessible = new Set<number>();
  for (const unit of match.units) if (unit.team === team && unit.hp > 0) {
    const point = nearestOpen(unit, match.map); accessible.add(connectivity[Math.floor(point.y) * WIDTH + Math.floor(point.x)]);
  }
  if (!accessible.size) {
    const point = nearestOpen({ x: team === 1 ? .5 : WIDTH - .5, y: HEIGHT / 2 }, match.map);
    accessible.add(connectivity[Math.floor(point.y) * WIDTH + Math.floor(point.x)]);
  }
  const segments = field.segments.length ? field.segments : [{ a: { x: WIDTH / 2, y: 0 }, b: { x: WIDTH / 2, y: HEIGHT } }];
  const lengths = segments.map(segment => Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y));
  const total = lengths.reduce((sum, length) => sum + length, 0), used = new Set<number>(), slots: Point[] = [];
  for (let slot = 0; slot < count; slot++) {
    let distance = total * (slot + .5) / count, segmentIndex = 0;
    while (segmentIndex < segments.length - 1 && distance > lengths[segmentIndex]) distance -= lengths[segmentIndex++];
    const segment = segments[segmentIndex], t = lengths[segmentIndex] ? distance / lengths[segmentIndex] : .5;
    const border = { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
    const toward = direction(field, team, border), ideal = { x: border.x - toward.x * 2, y: border.y - toward.y * 2 };
    const origin = { x: Math.floor(clamp(ideal.x, 0, WIDTH - 1)), y: Math.floor(clamp(ideal.y, 0, HEIGHT - 1)) };
    let found: Point | null = null;
    for (let radius = 0; radius <= 20 && !found; radius++) {
      let score = Infinity;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = origin.x + dx, y = origin.y + dy, id = y * WIDTH + x;
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || used.has(id) || !accessible.has(connectivity[id])) continue;
        const point = { x: x + .5, y: y + .5 };
        if (!passable(point, match.map) || frontValue(field, point) * (team === 1 ? 1 : -1) > -.03) continue;
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
