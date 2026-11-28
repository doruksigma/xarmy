import { HEIGHT, WIDTH, units } from "./config";
import type { Kind, Owner, Point } from "./config";

export type Tile = "field" | "forest" | "rock" | "water" | "bridge";
export const mapIds = ["plains", "forest", "valley", "passes", "fronts", "center"] as const;
export type MapId = typeof mapIds[number];
export type Landscape = { tiles: ReadonlyArray<Tile>; cities: ReadonlyArray<Point & { owner: Owner }> };

// Fifty cities form two established territories. Every blue position has an exact
// red rotational counterpart, including its distance to the front and resources.
const blueCities = [8.5, 26.5, 45.5, 64.5, 81.5].flatMap(y =>
  [8.5, 21.5, 34.5, 47.5, 61.5].map(x => ({ x, y, owner: 1 as const })));
export const cities: ReadonlyArray<Point & { owner: Owner }> = [
  ...blueCities,
  ...blueCities.map(city => ({ x: WIDTH - city.x, y: HEIGHT - city.y, owner: 2 as const })),
];
const tileId = (x: number, y: number) => y * WIDTH + x;
const center = (id: number) => ({ x: id % WIDTH + 0.5, y: Math.floor(id / WIDTH) + 0.5 });
const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const frontRows = [18, 45, 72];

function landscape(x: number, y: number, mapId: MapId): Tile {
  if (x >= WIDTH / 2) return landscape(WIDTH - 1 - x, HEIGHT - 1 - y, mapId);
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => inEllipse(x, y, cx, cy, rx, ry);
  const crossing = frontRows.some(row => Math.abs(y - row) <= 3);
  if (mapId === "plains") {
    if (ellipse(4, 40, 2, 5) || ellipse(40, 16, 3, 2)) return "rock";
    if (ellipse(15, 70, 7, 5) || ellipse(42, 8, 7, 4) || ellipse(54, 37, 4, 7) || ellipse(27, 51, 5, 3)) return "forest";
  } else if (mapId === "forest") {
    if (ellipse(5, 50, 3, 7) || ellipse(55, 12, 4, 3)) return "water";
    if (ellipse(40, 69, 3, 4)) return "rock";
    if (ellipse(15, 18, 11, 14) || ellipse(40, 14, 12, 8) || ellipse(31, 48, 10, 16) ||
        ellipse(53, 69, 13, 12) || ellipse(61, 35, 8, 12) || ellipse(7, 76, 7, 10)) return "forest";
  } else if (mapId === "valley") {
    const riverEdge = 69 + Math.round(Math.sin((y - 44.5) / 11));
    if (x >= riverEdge) return crossing ? "bridge" : "water";
    if (ellipse(40, 39, 5, 8) || ellipse(9, 5, 4, 2)) return "rock";
    if (ellipse(29, 17, 8, 6) || ellipse(20, 75, 9, 7) || ellipse(54, 55, 6, 9)) return "forest";
  } else if (mapId === "passes") {
    if (x >= 69 && !crossing) return "rock";
    if (ellipse(40, 38, 5, 11) || ellipse(15, 72, 4, 6) || ellipse(10, 2, 6, 2)) return "rock";
    if (ellipse(29, 16, 8, 5) || ellipse(54, 58, 6, 8) || ellipse(37, 81, 7, 4)) return "forest";
  } else if (mapId === "fronts") {
    // The long central massif sends armies around the northern and southern ends.
    if (ellipse(71.5, 44.5, 9, 24)) return "rock";
    if (ellipse(7, 4, 4, 3)) return "water";
    if (ellipse(40, 8, 12, 5) || ellipse(18, 62, 7, 9) || ellipse(55, 79, 9, 5)) return "forest";
  } else if (mapId === "center") {
    // Flank ridges funnel the two territories toward the open central corridor.
    if (x >= 69 && (y < 31 || y > 58)) return "rock";
    if (ellipse(7, 5, 4, 3) || ellipse(26, 77, 4, 5)) return "water";
    if (ellipse(37, 14, 12, 7) || ellipse(56, 21, 8, 9) || ellipse(55, 73, 8, 9) || ellipse(19, 55, 7, 6)) return "forest";
  }
  return "field";
}

const landscapes = new Map<MapId, Landscape>();
export function getMap(mapId: MapId = "valley"): Landscape {
  const cached = landscapes.get(mapId);
  if (cached) return cached;
  const mapTiles = Array.from({ length: WIDTH * HEIGHT }, (_, id): Tile => {
    const x = id % WIDTH, y = Math.floor(id / WIDTH);
    if (cities.some(city => Math.hypot(city.x - x - .5, city.y - y - .5) <= 2.8)) return "field";
    // Formations deploy on accessible clear ground beside each approach lane.
    const frontX = Math.min(x, WIDTH - 1 - x), frontY = x < WIDTH / 2 ? y : HEIGHT - 1 - y;
    if (frontRows.some(row => Math.hypot(frontX - 66, frontY - row) <= 3)) return "field";
    return landscape(x, y, mapId);
  });
  const generated = { tiles: mapTiles, cities };
  landscapes.set(mapId, generated);
  return generated;
}
// Retained convenience exports always describe valley; no mutable active map.
export const tiles = getMap("valley").tiles;
export function tileAt({ x, y }: Point, mapId: MapId = "valley"): Tile {
  const col = Math.floor(x), row = Math.floor(y);
  return col >= 0 && col < WIDTH && row >= 0 && row < HEIGHT ? getMap(mapId).tiles[tileId(col, row)] : "rock";
}
export function passable(point: Point, mapId?: MapId): boolean;
export function passable(point: Point, index: number): boolean;
export function passable(point: Point, mapId: MapId | number = "valley"): boolean {
  const tile = tileAt(point, typeof mapId === "string" ? mapId : "valley");
  return tile !== "rock" && tile !== "water";
}

export function nearestOpen(point: Point, mapId: MapId = "valley"): Point {
  const x = Math.max(0, Math.min(WIDTH - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(HEIGHT - 1, Math.floor(point.y)));
  if (passable({ x, y }, mapId)) return { x: x + .5, y: y + .5 };
  for (let radius = 1; radius < Math.max(WIDTH, HEIGHT); radius++) {
    let best: Point | null = null, distance = Infinity;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || !passable({ x: x + dx, y: y + dy }, mapId)) continue;
      const candidate = { x: x + dx + .5, y: y + dy + .5 };
      const squared = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
      if (squared < distance) { best = candidate; distance = squared; }
    }
    if (best) return best;
  }
  return cities[0];
}

class Frontier {
  private values: Array<{ id: number; score: number }> = [];
  get length() { return this.values.length; }
  push(id: number, score: number) {
    const entry = { id, score }; let index = this.values.length;
    this.values.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].score <= score) break;
      this.values[index] = this.values[parent]; index = parent;
    }
    this.values[index] = entry;
  }
  pop() {
    const first = this.values[0], last = this.values.pop()!;
    if (this.values.length) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1].score < this.values[child].score) child++;
        if (this.values[child].score >= last.score) break;
        this.values[index] = this.values[child]; index = child;
      }
      this.values[index] = last;
    }
    return first.id;
  }
}
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Bounded grid A*; a binary heap avoids rescanning a large frontier per node. */
export function route(from: Point, to: Point, kind: Kind, mapId: MapId = "valley"): Point[] {
  // Aircraft have a direct in-bounds flight path; terrain still constrains all
  // ground formations, including the slower artillery batteries.
  if (kind === "aircraft") {
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite) ||
      from.x < 0 || from.y < 0 || from.x >= WIDTH || from.y >= HEIGHT) return [];
    return [{ x: Math.max(0, Math.min(WIDTH - .001, to.x)), y: Math.max(0, Math.min(HEIGHT - .001, to.y)) }];
  }
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !passable(from, mapId)) return [];
  const goal = nearestOpen(to, mapId), mapTiles = getMap(mapId).tiles;
  const start = tileId(Math.floor(from.x), Math.floor(from.y));
  const end = tileId(Math.floor(goal.x), Math.floor(goal.y));
  const parent = new Int32Array(mapTiles.length).fill(-1);
  const cost = new Float64Array(mapTiles.length).fill(Infinity);
  const closed = new Uint8Array(mapTiles.length);
  const open = new Frontier(); cost[start] = 0;
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x + .5 - goal.x), dy = Math.abs(y + .5 - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT &&
    mapTiles[tileId(x, y)] !== "rock" && mapTiles[tileId(x, y)] !== "water";
  open.push(start, heuristic(Math.floor(from.x), Math.floor(from.y)));
  let visited = 0;
  while (open.length && visited < mapTiles.length) {
    const id = open.pop();
    if (closed[id]) continue;
    if (id === end) {
      const path = [goal];
      for (let p = parent[end]; p !== -1; p = parent[p]) path.push(center(p));
      return path.reverse();
    }
    closed[id] = 1; visited++;
    const x = id % WIDTH, y = Math.floor(id / WIDTH);
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy;
      if (!walk(nx, ny) || (dx && dy && (!walk(nx, y) || !walk(x, ny)))) continue;
      const nextId = tileId(nx, ny);
      if (closed[nextId]) continue;
      const weight = mapTiles[nextId] === "forest" ? 1 / units[kind].forest : 1;
      const score = cost[id] + (dx && dy ? Math.SQRT2 : 1) * weight;
      if (score >= cost[nextId]) continue;
      parent[nextId] = id; cost[nextId] = score; open.push(nextId, score + heuristic(nx, ny));
    }
  }
  return [];
}

export function clearShot(from: Point, to: Point, mapId: MapId = "valley"): boolean {
  let x = Math.floor(from.x), y = Math.floor(from.y);
  if (tileAt(from, mapId) === "rock") return false;
  const dx = to.x - from.x, dy = to.y - from.y, sx = Math.sign(dx), sy = Math.sign(dy);
  const tx = sx ? Math.abs(1 / dx) : Infinity, ty = sy ? Math.abs(1 / dy) : Infinity;
  let nextX = sx ? ((sx > 0 ? x + 1 : x) - from.x) / dx : Infinity;
  let nextY = sy ? ((sy > 0 ? y + 1 : y) - from.y) / dy : Infinity;
  while (Math.min(nextX, nextY) < 1) {
    if (Math.abs(nextX - nextY) < 1e-8) {
      if (tileAt({ x: x + sx, y }, mapId) === "rock" || tileAt({ x, y: y + sy }, mapId) === "rock") return false;
      x += sx; y += sy; nextX += tx; nextY += ty;
    } else if (nextX < nextY) { x += sx; nextX += tx; }
    else { y += sy; nextY += ty; }
    if (tileAt({ x, y }, mapId) === "rock") return false;
  }
  return tileAt(to, mapId) !== "rock";
}
