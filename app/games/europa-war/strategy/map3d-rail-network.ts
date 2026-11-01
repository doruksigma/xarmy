import { containsProvincePoint, provincePolygons } from "./map3d-geometry";
import { friendly, GEOGRAPHY } from "./world";
import type { World } from "./types";

export interface RailPoint {
  x: number;
  y: number;
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
  }>;
  routes: RailRoute[];
  stations: Array<{ province: string; point: RailPoint }>;
  omittedConnections: number;
}

const MAX_SAMPLE_DISTANCE = 0.7;
const MAX_GRID_CELLS = 8000;
const anchors = new Map<string, RailPoint>();
const paths = new Map<string, RailPoint[] | null>();
const distance = (a: RailPoint, b: RailPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

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

function landSegment(ids: readonly string[]) {
  const inside = (p: RailPoint) =>
    ids.some((id) => containsProvincePoint(id, p.x, p.y));
  const boundaries = ids.flatMap((id) =>
    provincePolygons(id).flatMap((part) =>
      [part.outer, ...part.holes].flatMap((ring) =>
        ring.map((point, i) => [point, ring[(i + 1) % ring.length]] as const),
      ),
    ),
  );
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
  const inside = (point: RailPoint) =>
    containsProvincePoint(from, point.x, point.y) ||
    containsProvincePoint(to, point.x, point.y);
  const segment = landSegment([from, to]);
  const save = (result: RailPoint[] | null) => {
    const rounded = result && roundRailCorners(result, segment);
    paths.set(key, rounded && (from < to ? rounded : [...rounded].reverse()));
    return rounded;
  };
  if (segment(a, b)) return save([a, b]);
  const first = provincePolygons(from).flatMap((p) => p.outer);
  const second = provincePolygons(to).flatMap((p) => p.outer);
  const vertices = new Set(second.map((p) => `${p.x}:${p.y}`));
  const portals = first.filter((p) => vertices.has(`${p.x}:${p.y}`));
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
  };
  const player = world.countries[countryId];
  if (!player) return network;
  const eligible = (id: string) =>
    world.provinces[id]?.buildings.rail > 0 &&
    friendly(world, player.id, world.provinces[id].controller);
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
      network.edges.push({ from, to: edge.id, points: path });
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

/** All inputs which can change global physical tracks, stations or access.
 * Economies, game date, army positions and the selected player do not affect it. */
export function railNetworkSignature(world: World): string {
  return [
    ...Object.keys(world.countries)
      .sort()
      .map((id) => {
        const country = world.countries[id];
        return `${id}:${country.capital}:${country.subjectOf ?? ""}:${[...country.allies].sort().join(",")}:${[...country.access].sort().join(",")}:${[...country.wars].sort().join(",")}`;
      }),
    ...Object.values(world.provinces).map(
      (p) => `${p.id}:${p.controller}:${p.buildings.rail}:${p.buildings.hub}`,
    ),
  ].join("|");
}

let globalCache: { signature: string; network: RailNetwork } | undefined;
const localTracks = new Map<string, RailPoint[] | null>();

/** Countries with only one rail province or an island capital still have a
 * local railway. It is an internal station track, never a fabricated neighbor
 * connection. Its entire 3.6-unit corridor must fit inside the real province. */
function localCapitalTrack(id: string): RailPoint[] | null {
  if (localTracks.has(id)) return localTracks.get(id)!;
  const center = anchor(id);
  if (!center) return null;
  const polygons = provincePolygons(id);
  const vertices = polygons.flatMap((part) =>
    [part.outer, ...part.holes].flat(),
  );
  const seeds: RailPoint[] = [center];
  for (const part of [...polygons].sort(
    (a, b) => b.outer.length - a.outer.length,
  )) {
    const left = Math.min(...part.outer.map((point) => point.x)),
      right = Math.max(...part.outer.map((point) => point.x));
    const top = Math.min(...part.outer.map((point) => point.y)),
      bottom = Math.max(...part.outer.map((point) => point.y));
    for (let row = 0; row < 6 && seeds.length < 64; row++)
      for (let col = 0; col < 6 && seeds.length < 64; col++) {
        const point = {
          x: left + ((col + 0.5) * (right - left)) / 6,
          y: top + ((row + 0.5) * (bottom - top)) / 6,
        };
        if (containsProvincePoint(id, point.x, point.y)) seeds.push(point);
      }
  }
  const corridor = 1.8;
  const candidates: Array<{
    a: RailPoint;
    b: RailPoint;
    ux: number;
    uy: number;
    length: number;
    score: number;
  }> = [];
  for (const seed of seeds)
    for (let angle = 0; angle < 16; angle++) {
      const ux = Math.cos((angle * Math.PI) / 16),
        uy = Math.sin((angle * Math.PI) / 16);
      const across = (along: number) =>
        [-corridor, 0, corridor].every((offset) =>
          containsProvincePoint(
            id,
            seed.x + ux * along - uy * offset,
            seed.y + uy * along + ux * offset,
          ),
        );
      if (!across(0)) continue;
      const extent = (sign: number) => {
        let length = 0;
        for (let step = 1; step <= 38; step++) {
          if (!across(step * sign)) break;
          length = step;
        }
        return Math.max(0, length - 0.25);
      };
      const back = extent(-1),
        forward = extent(1),
        length = back + forward;
      if (length < 8) continue;
      const a = { x: seed.x - ux * back, y: seed.y - uy * back },
        b = { x: seed.x + ux * forward, y: seed.y + uy * forward };
      candidates.push({
        a,
        b,
        ux,
        uy,
        length,
        score: length - distance(seed, center) * 0.1,
      });
    }
  candidates.sort((a, b) => b.score - a.score);
  const safe = landSegment([id]);
  for (const candidate of candidates.slice(0, 96)) {
    const { a, b, ux, uy, length } = candidate;
    const leftA = { x: a.x - uy * corridor, y: a.y + ux * corridor };
    const leftB = { x: b.x - uy * corridor, y: b.y + ux * corridor };
    const rightA = { x: a.x + uy * corridor, y: a.y - ux * corridor };
    const rightB = { x: b.x + uy * corridor, y: b.y - ux * corridor };
    if (
      ![
        [a, b],
        [leftA, leftB],
        [rightA, rightB],
        [leftA, rightA],
        [leftB, rightB],
      ].every(([from, to]) => safe(from, to))
    )
      continue;
    // Four safe sides alone could enclose a water hole. Any boundary vertex
    // strictly inside the strip rejects that case too.
    if (
      vertices.some((point) => {
        const dx = point.x - a.x,
          dy = point.y - a.y;
        const along = dx * ux + dy * uy,
          across = -dx * uy + dy * ux;
        return (
          along > 1e-6 &&
          along < length - 1e-6 &&
          Math.abs(across) < corridor - 1e-6
        );
      })
    )
      continue;
    const result = [a, b];
    localTracks.set(id, result);
    return result;
  }
  localTracks.set(id, null);
  return null;
}

/** Shared read-only presentation graph: each country's real capital-connected
 * network participates, independent of which country the human selected.
 * Physical tracks/stations are deduplicated; every valid country gets its first
 * itinerary before any country receives secondary routes (64-route ceiling). */
export function buildGlobalRailNetwork(world: World): RailNetwork {
  const signature = railNetworkSignature(world);
  if (globalCache?.signature === signature) return globalCache.network;
  const network: RailNetwork = {
    edges: [],
    routes: [],
    stations: [],
    omittedConnections: 0,
  };
  const edges = new Map<string, RailNetwork["edges"][number]>();
  const stations = new Map<string, RailNetwork["stations"][number]>();
  const countryRoutes: RailRoute[][] = [];
  for (const id of Object.keys(world.countries).sort()) {
    const country = buildRailNetwork(world, id);
    const capital = world.countries[id].capital;
    if (
      !country.routes.length &&
      world.provinces[capital]?.buildings.rail > 0 &&
      friendly(world, id, world.provinces[capital].controller)
    ) {
      const points = localCapitalTrack(capital);
      if (points) {
        country.edges.push({ from: capital, to: capital, points, local: true });
        country.routes.push({
          country: id,
          local: true,
          ids: [capital],
          points,
          length: distance(points[0], points[1]),
        });
        const point = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        const station = country.stations.find(
          (station) => station.province === capital,
        );
        if (station) station.point = point;
        else country.stations.push({ province: capital, point });
      }
    }
    network.omittedConnections += country.omittedConnections;
    if (country.routes.length) countryRoutes.push(country.routes);
    for (const edge of country.edges) {
      const reversed = edge.from > edge.to;
      const from = reversed ? edge.to : edge.from,
        to = reversed ? edge.from : edge.to;
      const key = `${from}:${to}`;
      if (!edges.has(key))
        edges.set(key, {
          from,
          to,
          points: reversed ? [...edge.points].reverse() : edge.points,
          ...(edge.local ? { local: true } : {}),
        });
    }
    for (const station of country.stations)
      stations.set(station.province, station);
  }
  network.edges = [...edges.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  network.stations = [...stations.values()].sort((a, b) =>
    a.province.localeCompare(b.province),
  );
  for (let round = 0; round < 10 && network.routes.length < 64; round++)
    for (const routes of countryRoutes) {
      if (routes[round]) network.routes.push(routes[round]);
      if (network.routes.length === 64) break;
    }
  globalCache = { signature, network };
  return network;
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
