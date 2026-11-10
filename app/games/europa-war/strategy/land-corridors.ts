import atlas from "./map-data.json";
import data from "./land-corridors.json";

export interface CorridorPoint {
  x: number;
  y: number;
}
const geography = new Map(atlas.provinces.map((p) => [p.id, p]));
const blocked = new Set(data.blocked);
const curved = data.curved as Record<string, number[][]>;
const cache = new Map<string, readonly CorridorPoint[]>();
const neighborCache = new Map<string, { id: string; sea: boolean }[]>();
const lengthCache = new WeakMap<readonly CorridorPoint[], number>();
// Reviewed domestic sea links replacing old fictitious land adjacency. These
// are existing ports; normal naval control and military access still apply.
const domesticSeaLinks = [
  ["germany-8", "germany-9"], // Stettin–Königsberg, around the Polish corridor.
  ["denmark-0", "denmark-1"], // Copenhagen–Aarhus, across the Danish straits.
  ["uk-2", "uk-7"], // Liverpool–Belfast, across the Irish Sea.
] as const;
const keyOf = (a: string, b: string) => [a, b].sort().join("|");
// Geography is immutable during a campaign. Resolve the pair keys once,
// instead of allocating and sorting them inside every supply/army step.
const landNeighbors = new Map(
  atlas.provinces.map((province) => [
    province.id,
    new Set(
      province.neighbors
        .filter(
          (edge) => !edge.sea && !blocked.has(keyOf(province.id, edge.id)),
        )
        .map((edge) => edge.id),
    ),
  ]),
);
const obsoleteNeighbors = new Map<string, Set<string>>();
for (const pair of blocked) {
  const [a, b] = pair.split("|");
  if (!obsoleteNeighbors.has(a)) obsoleteNeighbors.set(a, new Set());
  if (!obsoleteNeighbors.has(b)) obsoleteNeighbors.set(b, new Set());
  obsoleteNeighbors.get(a)!.add(b);
  obsoleteNeighbors.get(b)!.add(a);
}

/** Normalize once: geographically disconnected port pairs are sea transports,
 * never walkable shortcuts. Other phantom adjacencies are removed. */
export function movementNeighbors(
  from: string,
): { id: string; sea: boolean }[] {
  const cached = neighborCache.get(from);
  if (cached) return cached;
  const neighbors = (geography.get(from)?.neighbors ?? []).flatMap((edge) => {
    if (edge.sea || !blocked.has(keyOf(from, edge.id))) return [{ ...edge }];
    return geography.get(from)?.port && geography.get(edge.id)?.port
      ? [{ id: edge.id, sea: true }]
      : [];
  });
  for (const [a, b] of domesticSeaLinks) {
    const to = from === a ? b : from === b ? a : undefined;
    if (to && !neighbors.some((edge) => edge.id === to))
      neighbors.push({ id: to, sea: true });
  }
  neighborCache.set(from, neighbors);
  return neighbors;
}

/** Static geographic validity only; ownership, war and access are checked by
 * the caller. Asset generation does all polygon work outside the browser. */
export function isTraversableLandEdge(from: string, to: string): boolean {
  return landNeighbors.get(from)?.has(to) ?? false;
}

/** Old saves may have treated this now-sea/removed pair as an ordinary walk. */
export function isObsoleteLandEdge(from: string, to: string): boolean {
  return obsoleteNeighbors.get(from)?.has(to) ?? false;
}

/** A permitted land corridor or explicit sea/paradrop leg. Invalid old land
 * orders have no drawable path and are rerouted by the movement simulation. */
export function movementLegPath(
  from: string,
  to: string,
  airborne = false,
): readonly CorridorPoint[] | null {
  const a = geography.get(from),
    b = geography.get(to);
  if (!a || !b) return null;
  const edge = movementNeighbors(from).find((e) => e.id === to);
  if (!airborne && (!edge || (!edge.sea && !isTraversableLandEdge(from, to))))
    return null;
  const key = `${from}:${to}:${airborne}`;
  let result = cache.get(key);
  if (result) return result;
  const points = !airborne && !edge?.sea ? curved[keyOf(from, to)] : undefined;
  result = points
    ? (from < to ? points : [...points].reverse()).map(([x, y]) => ({ x, y }))
    : [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
  cache.set(key, result);
  return result;
}

export function corridorLength(points: readonly CorridorPoint[]): number {
  const cached = lengthCache.get(points);
  if (cached !== undefined) return cached;
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  lengthCache.set(points, length);
  return length;
}

/** Position and remaining polyline share an arc-length parameter, so arrows
 * never cut across a bay when the animated unit has rounded its coast. */
export function remainingCorridor(
  points: readonly CorridorPoint[],
  ratio: number,
): CorridorPoint[] {
  if (!points.length) return [];
  let remaining = Math.max(0, Math.min(1, ratio)) * corridorLength(points);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return [
        { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        ...points.slice(i),
      ];
    }
    remaining -= length;
  }
  return [{ ...points[points.length - 1] }];
}
