import { containsProvincePoint, provincePolygons } from "./map3d-geometry";
import { GEOGRAPHY } from "./world";
import type { World } from "./types";

export interface RailPoint {
  x: number;
  y: number;
}
export interface RailSeam {
  polygon: RailPoint[];
  maxGap: number;
}
export interface RailRoute {
  /** Country whose capital-connected railway supports this visual itinerary. */
  country?: string;
  /** An existing rail facility's wholly internal capital-province shuttle. */
  local?: boolean;
  ids: string[];
  points: RailPoint[];
  length: number;
}
export interface RailNetwork {
  edges: Array<{
    from: string;
    to: string;
    points: RailPoint[];
    local?: boolean;
    seams?: RailSeam[];
  }>;
  routes: RailRoute[];
  stations: Array<{ province: string; point: RailPoint }>;
  omittedConnections: number;
  /** Edges crossing explicitly validated sub-pixel map rounding seams. */
  repairedConnections?: number;
}

const MAX_SAMPLE_DISTANCE = 0.7;
const MAX_GRID_CELLS = 8000;
const anchors = new Map<string, RailPoint>();
const paths = new Map<string, RailPoint[] | null>();
const seamCache = new Map<string, RailSeam[]>();
const pathRepairs = new Map<string, RailSeam[]>();
const distance = (a: RailPoint, b: RailPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function inRing(
  point: RailPoint,
  ring: readonly RailPoint[],
  includeBoundary = true,
) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length2 || 1),
      ),
    );
    if ((point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2 < 1e-14)
      return includeBoundary;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

const ringBounds = new WeakMap<
  readonly RailPoint[],
  { left: number; right: number; top: number; bottom: number }
>();
function bounds(ring: readonly RailPoint[]) {
  let cached = ringBounds.get(ring);
  if (!cached) {
    cached = {
      left: Math.min(...ring.map((point) => point.x)),
      right: Math.max(...ring.map((point) => point.x)),
      top: Math.min(...ring.map((point) => point.y)),
      bottom: Math.max(...ring.map((point) => point.y)),
    };
    ringBounds.set(ring, cached);
  }
  return cached;
}
function ringsOverlapInterior(
  a: readonly RailPoint[],
  b: readonly RailPoint[],
) {
  const aa = bounds(a),
    bb = bounds(b);
  if (
    aa.right <= bb.left ||
    bb.right <= aa.left ||
    aa.bottom <= bb.top ||
    bb.bottom <= aa.top
  )
    return false;
  if (
    a.some((point) => inRing(point, b, false)) ||
    b.some((point) => inRing(point, a, false))
  )
    return true;
  const midpointInside = (
    ring: readonly RailPoint[],
    other: readonly RailPoint[],
  ) =>
    ring.some((point, i) => {
      const next = ring[(i + 1) % ring.length];
      return inRing(
        { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
        other,
        false,
      );
    });
  if (midpointInside(a, b) || midpointInside(b, a)) return true;
  // The seam is convex. Coincident strips can share every edge/vertex while
  // their interiors still overlap; vertex/crossing tests alone miss that.
  const center = {
    x: a.reduce((sum, point) => sum + point.x, 0) / a.length,
    y: a.reduce((sum, point) => sum + point.y, 0) / a.length,
  };
  if (inRing(center, a, false) && inRing(center, b, false)) return true;
  const cross = (from: RailPoint, to: RailPoint, point: RailPoint) =>
    (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i],
        q = a[(i + 1) % a.length],
        r = b[j],
        s = b[(j + 1) % b.length];
      if (
        cross(p, q, r) * cross(p, q, s) < -1e-12 &&
        cross(r, s, p) * cross(r, s, q) < -1e-12
      )
        return true;
    }
  return false;
}

export function railEdgeContainsPoint(
  edge: Pick<RailNetwork["edges"][number], "from" | "to" | "seams">,
  point: RailPoint,
): boolean {
  return (
    containsProvincePoint(edge.from, point.x, point.y) ||
    containsProvincePoint(edge.to, point.x, point.y) ||
    !!edge.seams?.some((seam) => inRing(point, seam.polygon))
  );
}

/** Repairs only a narrowly bounded rounding seam between opposite land sides.
 * No coast-wide buffer is applied; callers must establish real land adjacency. */
export function cartographicRailSeams(
  a0: RailPoint,
  a1: RailPoint,
  b0: RailPoint,
  b1: RailPoint,
  options: {
    adjacent: boolean;
    landA: (point: RailPoint) => boolean;
    landB: (point: RailPoint) => boolean;
    blocked?: (point: RailPoint) => boolean;
    blockers?: readonly (readonly RailPoint[])[];
  },
): RailSeam[] {
  if (!options.adjacent) return [];
  const length = distance(a0, a1),
    otherLength = distance(b0, b1);
  if (Math.min(length, otherLength) < 1.5) return [];
  const ux = (a1.x - a0.x) / length,
    uy = (a1.y - a0.y) / length;
  const bx = b1.x - b0.x,
    by = b1.y - b0.y;
  if (Math.abs(ux * by - uy * bx) / otherLength > 0.01) return [];
  const projection = (point: RailPoint) =>
    (point.x - a0.x) * ux + (point.y - a0.y) * uy;
  const startB = projection(b0),
    endB = projection(b1);
  const start = Math.max(0, Math.min(startB, endB)),
    end = Math.min(length, Math.max(startB, endB));
  if (end - start < 1.5) return [];
  const first = (t: number) => ({ x: a0.x + ux * t, y: a0.y + uy * t });
  const second = (t: number) => ({
    x: b0.x + (bx * (t - startB)) / (endB - startB),
    y: b0.y + (by * (t - startB)) / (endB - startB),
  });
  const gap = (t: number) => {
    const a = first(t),
      b = second(t);
    return (b.x - a.x) * -uy + (b.y - a.y) * ux;
  };
  const d0 = gap(start),
    d1 = gap(end);
  if (Math.max(Math.abs(d0), Math.abs(d1)) > 0.15 + 1e-9) return [];
  const cuts = [
    start,
    ...(d0 * d1 < 0 ? [start + ((end - start) * -d0) / (d1 - d0)] : []),
    end,
  ];
  const seams: RailSeam[] = [];
  for (let index = 1; index < cuts.length; index++) {
    const from = cuts[index - 1],
      to = cuts[index];
    if (to - from < 1.5 || Math.abs(gap((from + to) / 2)) < 1e-6) continue;
    const polygon = [first(from), first(to), second(to), second(from)];
    if (options.blockers?.some((ring) => ringsOverlapInterior(polygon, ring)))
      continue;
    let valid = true;
    for (const factor of [0.1, 0.5, 0.9]) {
      const t = from + (to - from) * factor,
        a = first(t),
        b = second(t);
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const left = { x: middle.x - uy * 0.3, y: middle.y + ux * 0.3 };
      const right = { x: middle.x + uy * 0.3, y: middle.y - ux * 0.3 };
      if (
        options.landA(middle) ||
        options.landB(middle) ||
        options.blocked?.(middle) ||
        !(
          (options.landA(left) && options.landB(right)) ||
          (options.landB(left) && options.landA(right))
        )
      ) {
        valid = false;
        break;
      }
    }
    if (valid)
      seams.push({
        polygon,
        maxGap: Math.max(Math.abs(gap(from)), Math.abs(gap(to))),
      });
  }
  return seams;
}

export function findRailSeamRepairs(from: string, to: string): RailSeam[] {
  if (
    !GEOGRAPHY[from]?.neighbors.some(
      (neighbor) => neighbor.id === to && !neighbor.sea,
    )
  )
    return [];
  const key = [from, to].sort().join(":");
  const cached = seamCache.get(key);
  if (cached) return cached;
  const first = provincePolygons(from),
    second = provincePolygons(to);
  const holes = [...first, ...second].flatMap((part) => part.holes);
  const blockers = [
    ...holes,
    ...Object.keys(GEOGRAPHY)
      .filter((id) => id !== from && id !== to)
      .flatMap((id) => provincePolygons(id).map((part) => part.outer)),
  ];
  const boundary = (parts: ReturnType<typeof provincePolygons>) =>
    parts.flatMap((part) =>
      part.outer.map(
        (point, i) => [point, part.outer[(i + 1) % part.outer.length]] as const,
      ),
    );
  const landA = (point: RailPoint) =>
    containsProvincePoint(from, point.x, point.y);
  const landB = (point: RailPoint) =>
    containsProvincePoint(to, point.x, point.y);
  const result: RailSeam[] = [];
  for (const [a0, a1] of boundary(first))
    for (const [b0, b1] of boundary(second))
      result.push(
        ...cartographicRailSeams(a0, a1, b0, b1, {
          adjacent: true,
          landA,
          landB,
          blockers,
        }),
      );
  seamCache.set(key, result);
  return result;
}

/** A bounded quadratic fillet, accepted only when its complete polyline can
 * travel on the same permitted land as the original edge. Tight coasts keep
 * their original corner rather than allowing a decorative water shortcut. */
export function roundRailCorners(
  points: readonly RailPoint[],
  canTravel: (start: RailPoint, end: RailPoint) => boolean,
): RailPoint[] {
  if (points.length < 3) return [...points];
  const rounded = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1],
      corner = points[i],
      after = points[i + 1];
    const incoming = distance(before, corner),
      outgoing = distance(corner, after);
    if (Math.min(incoming, outgoing) < 0.2) {
      rounded.push(corner);
      continue;
    }
    const ux = (corner.x - before.x) / incoming,
      uy = (corner.y - before.y) / incoming;
    const vx = (after.x - corner.x) / outgoing,
      vy = (after.y - corner.y) / outgoing;
    const dot = ux * vx + uy * vy;
    if (dot > 0.998 || dot < -0.96) {
      rounded.push(corner);
      continue;
    }
    const radius = Math.min(5, incoming * 0.35, outgoing * 0.35);
    let accepted = false;
    for (const factor of [1, 0.55, 0.28]) {
      const cut = radius * factor;
      if (cut < 0.12) break;
      const start = { x: corner.x - ux * cut, y: corner.y - uy * cut };
      const end = { x: corner.x + vx * cut, y: corner.y + vy * cut };
      const steps = Math.max(6, Math.min(18, Math.ceil(cut * 3)));
      const curve = Array.from({ length: steps + 1 }, (_, index) => {
        const t = index / steps,
          s = 1 - t;
        return {
          x: s * s * start.x + 2 * s * t * corner.x + t * t * end.x,
          y: s * s * start.y + 2 * s * t * corner.y + t * t * end.y,
        };
      });
      const chain = [rounded[rounded.length - 1], ...curve, after];
      if (
        !chain.slice(1).every((point, index) => canTravel(chain[index], point))
      )
        continue;
      rounded.push(...curve);
      accepted = true;
      break;
    }
    if (!accepted) rounded.push(corner);
  }
  rounded.push(points[points.length - 1]);
  return rounded.filter(
    (point, index) => !index || distance(point, rounded[index - 1]) > 1e-7,
  );
}

function anchor(id: string): RailPoint | null {
  const cached = anchors.get(id);
  if (cached) return cached;
  const p = GEOGRAPHY[id];
  if (containsProvincePoint(id, p.x, p.y)) {
    const result = { x: p.x, y: p.y };
    anchors.set(id, result);
    return result;
  }
  // Some schematic city centers lie outside their narrow coastal polygons.
  // Find a real interior point instead of putting a station on water.
  let best: RailPoint | null = null;
  let nearest = Infinity;
  for (const part of provincePolygons(id)) {
    const xs = part.outer.map((v) => v.x),
      ys = part.outer.map((v) => v.y);
    const left = Math.min(...xs),
      right = Math.max(...xs);
    const top = Math.min(...ys),
      bottom = Math.max(...ys);
    for (let row = 0; row < 24; row++)
      for (let col = 0; col < 24; col++) {
        const point = {
          x: left + ((col + 0.5) / 24) * (right - left),
          y: top + ((row + 0.5) / 24) * (bottom - top),
        };
        const d = distance(point, p);
        if (d < nearest && containsProvincePoint(id, point.x, point.y)) {
          best = point;
          nearest = d;
        }
      }
  }
  if (best) anchors.set(id, best);
  return best;
}

function landSegment(ids: readonly string[], seams: readonly RailSeam[] = []) {
  const inside = (p: RailPoint) =>
    ids.some((id) => containsProvincePoint(id, p.x, p.y)) ||
    seams.some((seam) => inRing(p, seam.polygon));
  const boundaries = [
    ...ids.flatMap((id) =>
      provincePolygons(id).flatMap((part) =>
        [part.outer, ...part.holes].flatMap((ring) =>
          ring.map((point, i) => [point, ring[(i + 1) % ring.length]] as const),
        ),
      ),
    ),
    ...seams.flatMap((seam) =>
      seam.polygon.map(
        (point, i) =>
          [point, seam.polygon[(i + 1) % seam.polygon.length]] as const,
      ),
    ),
  ];
  return (start: RailPoint, end: RailPoint) => {
    const steps = Math.max(
      1,
      Math.ceil(distance(start, end) / MAX_SAMPLE_DISTANCE),
    );
    for (let i = 0; i <= steps; i++)
      if (
        !inside({
          x: start.x + ((end.x - start.x) * i) / steps,
          y: start.y + ((end.y - start.y) * i) / steps,
        })
      )
        return false;
    // Sampling alone can miss a narrow inlet between samples. Polygon
    // intersections partition the entire segment into intervals whose
    // membership cannot change; checking each midpoint closes that gap.
    const dx = end.x - start.x,
      dy = end.y - start.y;
    const cuts = [0, 1];
    for (const [p, q] of boundaries) {
      const ex = q.x - p.x,
        ey = q.y - p.y;
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-10) continue;
      const px = p.x - start.x,
        py = p.y - start.y;
      const t = (px * ey - py * ex) / denominator;
      const u = (px * dy - py * dx) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
    cuts.sort((p, q) => p - q);
    for (const cut of cuts) {
      const point = { x: start.x + dx * cut, y: start.y + dy * cut };
      if (inside(point)) continue;
      // Even/odd polygon membership may reject the exact shared boundary
      // because of floating-point rounding. It is an interior crossing only
      // when land exists on both sides; tangencies to a coastline are refused.
      const length = Math.hypot(dx, dy) || 1;
      const ox = (-dy / length) * 1e-5,
        oy = (dx / length) * 1e-5;
      if (
        !inside({ x: point.x + ox, y: point.y + oy }) ||
        !inside({ x: point.x - ox, y: point.y - oy })
      )
        return false;
    }
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < 1e-9) continue;
      const middle = (cuts[i] + cuts[i - 1]) / 2;
      if (!inside({ x: start.x + dx * middle, y: start.y + dy * middle }))
        return false;
    }
    return true;
  };
}

function edgePath(from: string, to: string): RailPoint[] | null {
  const key = from < to ? `${from}:${to}` : `${to}:${from}`;
  if (paths.has(key)) {
    const saved = paths.get(key)!;
    if (!saved) return null;
    return from < to ? saved : [...saved].reverse();
  }
  const a = anchor(from),
    b = anchor(to);
  if (!a || !b) return null;
  let seams: RailSeam[] = [];
  const inside = (point: RailPoint) =>
    containsProvincePoint(from, point.x, point.y) ||
    containsProvincePoint(to, point.x, point.y) ||
    seams.some((seam) => inRing(point, seam.polygon));
  const strictSegment = landSegment([from, to]);
  let segment = strictSegment;
  const save = (result: RailPoint[] | null) => {
    const rounded = result && roundRailCorners(result, segment);
    paths.set(key, rounded && (from < to ? rounded : [...rounded].reverse()));
    pathRepairs.set(
      key,
      rounded &&
        !rounded.slice(1).every((point, i) => strictSegment(rounded[i], point))
        ? seams
        : [],
    );
    return rounded;
  };
  if (segment(a, b)) return save([a, b]);
  seams = findRailSeamRepairs(from, to);
  if (seams.length) {
    segment = landSegment([from, to], seams);
    if (segment(a, b)) return save([a, b]);
  }
  const first = provincePolygons(from).flatMap((p) => p.outer);
  const second = provincePolygons(to).flatMap((p) => p.outer);
  const vertices = new Set(second.map((p) => `${p.x}:${p.y}`));
  const portals = first.filter((p) => vertices.has(`${p.x}:${p.y}`));
  portals.push(
    ...seams.map((seam) => ({
      x: seam.polygon.reduce((sum, p) => sum + p.x, 0) / seam.polygon.length,
      y: seam.polygon.reduce((sum, p) => sum + p.y, 0) / seam.polygon.length,
    })),
  );
  portals.sort(
    (p, q) => distance(a, p) + distance(p, b) - distance(a, q) - distance(q, b),
  );
  for (const portal of portals)
    if (segment(a, portal) && segment(portal, b)) return save([a, portal, b]);

  // Concave coastlines sometimes need an interior detour. A bounded grid is
  // used only after direct/shared-boundary paths fail; no sea shortcuts.
  const points = [...first, ...second];
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - left;
  const height = Math.max(...points.map((p) => p.y)) - top;
  const step = Math.max(0.7, Math.sqrt((width * height) / MAX_GRID_CELLS));
  const cols = Math.ceil(width / step) + 1,
    rows = Math.ceil(height / step) + 1;
  if (cols * rows > MAX_GRID_CELLS * 1.5) return save(null);
  const pointAt = (index: number): RailPoint => ({
    x: left + (index % cols) * step,
    y: top + Math.floor(index / cols) * step,
  });
  const land = new Int8Array(cols * rows);
  const isLand = (index: number) => {
    if (land[index] === 0) land[index] = inside(pointAt(index)) ? 1 : -1;
    return land[index] === 1;
  };
  const previous = new Int32Array(cols * rows).fill(-2);
  const queue: number[] = [];
  const neighborsOf = (p: RailPoint) => {
    const col = Math.round((p.x - left) / step),
      row = Math.round((p.y - top) / step);
    const result: number[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = col + dx,
          y = row + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const index = y * cols + x;
          if (isLand(index) && segment(p, pointAt(index))) result.push(index);
        }
      }
    return result;
  };
  for (const index of neighborsOf(a)) {
    previous[index] = -1;
    queue.push(index);
  }
  const goals = new Set(neighborsOf(b));
  let reached = -1;
  for (let i = 0; i < queue.length && reached === -1; i++) {
    const current = queue[i];
    if (goals.has(current)) {
      reached = current;
      break;
    }
    const x = current % cols,
      y = Math.floor(current / cols);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const next = ny * cols + nx;
        if (
          previous[next] !== -2 ||
          !isLand(next) ||
          !segment(pointAt(current), pointAt(next))
        )
          continue;
        previous[next] = current;
        queue.push(next);
      }
  }
  if (reached < 0) return save(null);
  const reverse: RailPoint[] = [b];
  while (reached !== -1) {
    reverse.push(pointAt(reached));
    reached = previous[reached];
  }
  reverse.push(a);
  const raw = reverse.reverse(),
    simplified = [a];
  for (let i = 0; i < raw.length - 1; ) {
    let next = raw.length - 1;
    while (next > i + 1 && !segment(raw[i], raw[next])) next--;
    simplified.push(raw[next]);
    i = next;
  }
  return save(
    simplified.filter((p, i, all) => !i || distance(p, all[i - 1]) > 1e-7),
  );
}

/** Presentation only: an existing capital-connected railway tree, never a
 * replacement for the simulation's supply or convoy capacity calculations. */
export function buildRailNetwork(
  world: World,
  countryId = world.player,
): RailNetwork {
  const network: RailNetwork = {
    edges: [],
    routes: [],
    stations: [],
    omittedConnections: 0,
    repairedConnections: 0,
  };
  const player = world.countries[countryId];
  if (!player) return network;
  const eligible = (id: string) =>
    world.provinces[id]?.buildings.rail > 0 &&
    world.provinces[id].controller === player.id;
  if (!eligible(player.capital) || !anchor(player.capital)) return network;
  const queue = [player.capital];
  const parent = new Map<string, { id: string; points: RailPoint[] }>();
  const seen = new Set(queue),
    attempted = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    if (from === player.capital || world.provinces[from].buildings.hub > 0)
      network.stations.push({ province: from, point: anchor(from)! });
    for (const edge of [...GEOGRAPHY[from].neighbors].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (edge.sea || seen.has(edge.id) || !eligible(edge.id)) continue;
      const key = [from, edge.id].sort().join(":");
      if (attempted.has(key)) continue;
      attempted.add(key);
      const path = edgePath(from, edge.id);
      if (
        !path ||
        path.length < 2 ||
        path.every((p) => distance(p, path[0]) < 1e-7)
      ) {
        network.omittedConnections++;
        continue;
      }
      seen.add(edge.id);
      queue.push(edge.id);
      parent.set(edge.id, { id: from, points: path });
      const seams = pathRepairs.get(key) ?? [];
      network.edges.push({
        from,
        to: edge.id,
        points: path,
        ...(seams.length ? { seams } : {}),
      });
      if (seams.length) network.repairedConnections!++;
    }
  }
  // Through-country itineraries use exactly the same connected tree edges as
  // the rendered track. They never invent a shortcut between remote terminals.
  const nonLeaves = new Set([...parent.values()].map((value) => value.id));
  const lineages = new Map<string, string[]>();
  const rootDistances = new Map<string, number>([[player.capital, 0]]);
  for (const id of queue) {
    const edge = parent.get(id);
    if (edge)
      rootDistances.set(
        id,
        rootDistances.get(edge.id)! +
          edge.points
            .slice(1)
            .reduce(
              (sum, point, index) => sum + distance(edge.points[index], point),
              0,
            ),
      );
    const lineage = [id];
    while (parent.has(lineage[lineage.length - 1]))
      lineage.push(parent.get(lineage[lineage.length - 1])!.id);
    lineages.set(id, lineage);
  }
  const terminals = queue
    .filter((id) => !nonLeaves.has(id))
    .sort(
      (a, b) =>
        rootDistances.get(b)! - rootDistances.get(a)! || a.localeCompare(b),
    )
    .slice(0, 24);
  if (
    parent.size &&
    (terminals.length === 1 ||
      network.edges.filter((edge) => edge.from === player.capital).length === 1)
  )
    terminals.push(player.capital);
  const candidates: RailRoute[] = [];
  for (let i = 0; i < terminals.length; i++)
    for (let j = i + 1; j < terminals.length; j++) {
      const a = lineages.get(terminals[i])!,
        b = lineages.get(terminals[j])!;
      const shared = a.find((id) => b.includes(id))!;
      const ids = [
        ...a.slice(0, a.indexOf(shared) + 1),
        ...b.slice(0, b.indexOf(shared)).reverse(),
      ];
      const points: RailPoint[] = [];
      for (let index = 1; index < ids.length; index++) {
        const from = ids[index - 1],
          to = ids[index];
        const backwards = parent.get(from)?.id === to;
        const edge = backwards ? parent.get(from)! : parent.get(to)!;
        const part = backwards ? [...edge.points].reverse() : edge.points;
        points.push(...(points.length ? part.slice(1) : part));
      }
      const length = points
        .slice(1)
        .reduce((sum, point, index) => sum + distance(points[index], point), 0);
      if (length > 1e-7)
        candidates.push({ country: countryId, ids, points, length });
    }
  const usedEdges = new Set<string>();
  const routeEdges = new Map(
    candidates.map((route) => [
      route,
      route.ids
        .slice(1)
        .map((id, index) => [id, route.ids[index]].sort().join(":")),
    ]),
  );
  while (candidates.length && network.routes.length < 10) {
    const score = (route: RailRoute) => {
      const edges = routeEdges.get(route)!;
      let fresh = 0;
      for (const key of edges) if (!usedEdges.has(key)) fresh++;
      return route.length * (0.35 + (0.65 * fresh) / edges.length);
    };
    candidates.sort(
      (a, b) =>
        score(b) - score(a) || a.ids.join(":").localeCompare(b.ids.join(":")),
    );
    const route = candidates.shift()!;
    network.routes.push(route);
    routeEdges.get(route)!.forEach((key) => usedEdges.add(key));
  }
  return network;
}

/** Only player-controlled rail provinces can affect this live graph. Foreign
 * economy, diplomacy, game time and troop movement never invalidate it. */
function playerRailInputs(world: World): string {
  return [
    world.player,
    world.countries[world.player]?.capital ?? "",
    ...Object.values(world.provinces)
      .filter(
        (province) =>
          province.controller === world.player && province.buildings.rail > 0,
      )
      .map((province) => `${province.id}:${+(province.buildings.hub > 0)}`),
  ].join("|");
}

let playerCache:
  | { inputs: string; signature: string; network: RailNetwork }
  | undefined;

/** Shared read-only live scene graph. It never includes allied/access-only
 * territory, disconnected occupied pockets or decorative local shuttles. */
export function buildPlayerRailNetwork(world: World): RailNetwork {
  const inputs = playerRailInputs(world);
  if (playerCache?.inputs === inputs) return playerCache.network;
  const network = buildRailNetwork(world);
  const signature = [
    world.player,
    ...network.edges.map(
      (edge) =>
        `${edge.from}:${edge.to}:${edge.points.map((point) => `${point.x},${point.y}`).join(";")}`,
    ),
    ...network.stations.map(
      (station) =>
        `station:${station.province}:${station.point.x},${station.point.y}`,
    ),
    ...network.routes.map((route) => `route:${route.ids.join(",")}`),
  ].join("|");
  playerCache = { inputs, signature, network };
  return network;
}

/** Actual connected paths/stations only: capturing an isolated rail pocket
 * can re-evaluate connectivity, but does not rebuild unchanged scene batches. */
export function playerRailNetworkSignature(world: World): string {
  buildPlayerRailNetwork(world);
  return playerCache!.signature;
}

/** Distance is clamped. Heading follows map x/y in radians; the train renderer
 * may reverse it for a return journey without changing the network. */
export function railPointAt(
  route: RailRoute,
  distanceAlong: number,
): RailPoint & { heading: number } {
  if (!route.points.length) return { x: 0, y: 0, heading: 0 };
  let remaining = Math.max(
    0,
    Math.min(route.length, Number.isFinite(distanceAlong) ? distanceAlong : 0),
  );
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i],
      length = distance(a, b);
    if (length < 1e-8) continue;
    if (remaining <= length || i === route.points.length - 1) {
      const t = Math.min(1, remaining / length);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        heading: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remaining -= length;
  }
  return { ...route.points.at(-1)!, heading: 0 };
}
