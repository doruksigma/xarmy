import { HEIGHT, WIDTH } from "./config";
import type { Point } from "./config";
import type { Match } from "./engine";
import { frontField } from "./front";
import type { FrontField, FrontSegment } from "./front";
import { soldiersInUnit } from "./manpower";

export const FRONT_STRENGTH_SECTOR = 24;
export const FRONT_STRENGTH_DISTANCE = 12;
const COLS = Math.ceil(WIDTH / FRONT_STRENGTH_SECTOR);
const ROWS = Math.ceil(HEIGHT / FRONT_STRENGTH_SECTOR);
const EPSILON = 1e-9;

export type FrontStrengthSegment = Readonly<{ a: Readonly<Point>; b: Readonly<Point> }>;
export type FrontStrength = Readonly<{
  id: string; x: number; y: number; blue: number; red: number; formations: number;
  /** Cached boundary pieces inside this world sector, for viewport clipping. */
  segments: readonly FrontStrengthSegment[];
}>;
type Piece = { segment: FrontStrengthSegment; sector: number; dx: number; dy: number; inverseLength: number;
  left: number; right: number; top: number; bottom: number; axial: boolean };
type Sector = { key: number; id: string; x: number; y: number; segments: readonly FrontStrengthSegment[] };
type Geometry = { pieces: readonly Piece[]; sectors: readonly Sector[]; buckets: readonly (readonly number[])[] };
const geometries = new WeakMap<FrontField, Geometry>();

function project(point: Point, segment: FrontStrengthSegment): Point {
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
  const length = dx * dx + dy * dy;
  const along = length ? Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / length)) : 0;
  return { x: segment.a.x + dx * along, y: segment.a.y + dy * along };
}

function clipped(segment: FrontSegment, left: number, top: number, right: number, bottom: number): FrontStrengthSegment | null {
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  let from = 0, to = 1;
  for (const [p, q] of [[-dx, segment.a.x - left], [dx, right - segment.a.x],
    [-dy, segment.a.y - top], [dy, bottom - segment.a.y]]) {
    if (Math.abs(p) <= EPSILON) { if (q < 0) return null; continue; }
    const at = q / p;
    if (p < 0) from = Math.max(from, at); else to = Math.min(to, at);
    if (from > to) return null;
  }
  const a = { x: segment.a.x + dx * from, y: segment.a.y + dy * from };
  const b = { x: segment.a.x + dx * to, y: segment.a.y + dy * to };
  if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 <= EPSILON) return null;
  return Object.freeze({ a: Object.freeze(a), b: Object.freeze(b) });
}

function geometry(field: FrontField): Geometry {
  const cached = geometries.get(field);
  if (cached) return cached;
  const pieces: Piece[] = [], buckets: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const grouped = new Map<number, { segments: FrontStrengthSegment[]; x: number; y: number; length: number }>();
  const col = (x: number) => Math.max(0, Math.min(COLS - 1, Math.floor(x / FRONT_STRENGTH_SECTOR)));
  const row = (y: number) => Math.max(0, Math.min(ROWS - 1, Math.floor(y / FRONT_STRENGTH_SECTOR)));
  for (const original of field.segments) {
    if (![original.a.x, original.a.y, original.b.x, original.b.y].every(Number.isFinite)) continue;
    const minX = Math.min(original.a.x, original.b.x), maxX = Math.max(original.a.x, original.b.x);
    const minY = Math.min(original.a.y, original.b.y), maxY = Math.max(original.a.y, original.b.y);
    for (let y = row(minY); y <= row(maxY); y++) for (let x = col(minX); x <= col(maxX); x++) {
      const segment = clipped(original, x * FRONT_STRENGTH_SECTOR, y * FRONT_STRENGTH_SECTOR,
        Math.min(WIDTH, (x + 1) * FRONT_STRENGTH_SECTOR), Math.min(HEIGHT, (y + 1) * FRONT_STRENGTH_SECTOR));
      if (!segment) continue;
      const key = y * COLS + x, index = pieces.length;
      const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
      pieces.push({ segment, sector: key, dx, dy, inverseLength: 1 / (dx * dx + dy * dy),
        left: Math.min(segment.a.x, segment.b.x), right: Math.max(segment.a.x, segment.b.x),
        top: Math.min(segment.a.y, segment.b.y), bottom: Math.max(segment.a.y, segment.b.y), axial: dx === 0 || dy === 0 });
      const length = Math.hypot(dx, dy);
      const group = grouped.get(key) ?? { segments: [], x: 0, y: 0, length: 0 };
      group.segments.push(segment);
      group.x += (segment.a.x + segment.b.x) / 2 * length;
      group.y += (segment.a.y + segment.b.y) / 2 * length;
      group.length += length;
      grouped.set(key, group);
      // Expand each local piece by the inclusion radius once. A soldier then
      // queries only its own bucket, rather than all frontier segments per frame.
      const left = col(Math.min(segment.a.x, segment.b.x) - FRONT_STRENGTH_DISTANCE);
      const right = col(Math.max(segment.a.x, segment.b.x) + FRONT_STRENGTH_DISTANCE);
      const top = row(Math.min(segment.a.y, segment.b.y) - FRONT_STRENGTH_DISTANCE);
      const bottom = row(Math.max(segment.a.y, segment.b.y) + FRONT_STRENGTH_DISTANCE);
      for (let by = top; by <= bottom; by++) for (let bx = left; bx <= right; bx++) buckets[by * COLS + bx].push(index);
    }
  }
  const sectors = [...grouped].sort(([a], [b]) => a - b).map(([key, group]): Sector => {
    const center = { x: group.x / group.length, y: group.y / group.length };
    let anchor = group.segments[0].a, distance = Infinity;
    for (const segment of group.segments) {
      const candidate = project(center, segment), squared = (candidate.x - center.x) ** 2 + (candidate.y - center.y) ** 2;
      if (squared < distance - EPSILON || Math.abs(squared - distance) <= EPSILON &&
          (candidate.x < anchor.x || candidate.x === anchor.x && candidate.y < anchor.y)) {
        anchor = candidate; distance = squared;
      }
    }
    return { key, id: `front:${key % COLS}:${Math.floor(key / COLS)}`, x: anchor.x, y: anchor.y,
      segments: Object.freeze(group.segments) };
  });
  const result = { pieces, buckets, sectors };
  geometries.set(field, result);
  return result;
}

/** Aggregate current personnel near the real occupation border, without moving
 * armies or touching ownership. World sectors stay stable as the camera moves.
 * Geometry is cached; current HP, positions and army membership are read every
 * call, including while paused or between two frames at the same game time. */
export function frontStrength(match: Match, field: FrontField = frontField(match)): readonly FrontStrength[] {
  const cached = geometry(field);
  if (!cached.pieces.length) return [];
  const blue = new Float64Array(COLS * ROWS), red = new Float64Array(COLS * ROWS), formations = new Uint32Array(COLS * ROWS);
  const limit = FRONT_STRENGTH_DISTANCE ** 2;
  for (const unit of match.units) {
    if (!(unit.hp > 0) || !Number.isFinite(unit.hp) || !Number.isFinite(unit.x) || !Number.isFinite(unit.y) ||
        unit.x < 0 || unit.y < 0 || unit.x >= WIDTH || unit.y >= HEIGHT || (unit.team !== 1 && unit.team !== 2)) continue;
    const bucket = Math.floor(unit.y / FRONT_STRENGTH_SECTOR) * COLS + Math.floor(unit.x / FRONT_STRENGTH_SECTOR);
    let nearest = -1, distance = limit;
    for (const index of cached.buckets[bucket]) {
      const piece = cached.pieces[index], { a } = piece.segment;
      const outsideX = unit.x < piece.left ? piece.left - unit.x : unit.x > piece.right ? unit.x - piece.right : 0;
      const outsideY = unit.y < piece.top ? piece.top - unit.y : unit.y > piece.bottom ? unit.y - piece.bottom : 0;
      let squared = outsideX * outsideX + outsideY * outsideY;
      if (squared > distance + EPSILON) continue;
      // Actual occupation edges are horizontal/vertical, making the bounding
      // box distance exact. Keep the general projection for other input fields.
      if (!piece.axial) {
        const along = Math.max(0, Math.min(1, ((unit.x - a.x) * piece.dx + (unit.y - a.y) * piece.dy) * piece.inverseLength));
        const dx = a.x + piece.dx * along - unit.x, dy = a.y + piece.dy * along - unit.y;
        squared = dx * dx + dy * dy;
        if (squared > distance + EPSILON) continue;
      }
      if (nearest < 0 || squared < distance - EPSILON || Math.abs(squared - distance) <= EPSILON && piece.sector < nearest) {
        nearest = piece.sector; distance = squared;
      }
    }
    if (nearest < 0) continue;
    const strength = soldiersInUnit(unit);
    if (!Number.isFinite(strength) || strength <= 0) continue;
    if (unit.team === 1) blue[nearest] += strength; else red[nearest] += strength;
    formations[nearest]++;
  }
  const result: FrontStrength[] = [];
  for (const sector of cached.sectors) if (formations[sector.key]) result.push({
    id: sector.id, x: sector.x, y: sector.y, segments: sector.segments,
    blue: blue[sector.key], red: red[sector.key], formations: formations[sector.key],
  });
  return result;
}
