import { HEIGHT, WIDTH, units } from "./config";
import type { Kind, Owner, Point } from "./config";

export type Tile = "field" | "forest" | "rock" | "water" | "bridge";
export const mapIds = ["plains", "forest", "valley", "passes", "fronts", "center"] as const;
export type MapId = typeof mapIds[number];
export type Landscape = { tiles: ReadonlyArray<Tile>; cities: ReadonlyArray<Point & { owner: Owner }> };
// Keep the original valley exports and coordinates for version-one saved games.
export const cities: ReadonlyArray<Point & { owner: Owner }> = [
  { x: 4.5, y: 13.5, owner: 1 }, { x: 9.5, y: 6.5, owner: 1 },
  { x: 43.5, y: 16.5, owner: 2 }, { x: 38.5, y: 23.5, owner: 2 },
  { x: 10.5, y: 19.5, owner: 0 }, { x: 37.5, y: 10.5, owner: 0 },
  { x: 20.5, y: 8.5, owner: 0 }, { x: 27.5, y: 21.5, owner: 0 },
  { x: 18.5, y: 23.5, owner: 0 }, { x: 29.5, y: 6.5, owner: 0 },
];
const tileId = (x: number, y: number) => y * WIDTH + x;
const center = (id: number) => ({ x: id % WIDTH + 0.5, y: Math.floor(id / WIDTH) + 0.5 });

function landscape(x: number, y: number): Tile {
  // The opposite shore mirrors the approach distances and terrain.
  if (x >= WIDTH / 2) return landscape(WIDTH - 1 - x, HEIGHT - 1 - y);
  if (x === 23 || (x === 22 && y > 10 && y < 19)) {
    return (y >= 7 && y <= 9) || (y >= 20 && y <= 22) ? "bridge" : "water";
  }
  if (x >= 14 && x <= 19 && y >= 12 && y <= 16 && (x !== 14 || y < 15)) return "rock";
  if ((x >= 11 && x <= 16 && y >= 2 && y <= 5) || (x >= 5 && x <= 12 && y >= 22 && y <= 26) ||
      (x >= 16 && x <= 20 && y >= 18 && y <= 20)) return "forest";
  return "field";
}
export const tiles = Array.from({ length: WIDTH * HEIGHT }, (_, id) => landscape(id % WIDTH, Math.floor(id / WIDTH)));

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function mapTile(x: number, y: number, mapId: Exclude<MapId, "valley">): Tile {
  // Rotational symmetry gives both armies the same approaches and nearby resources.
  if (x >= WIDTH / 2) return mapTile(WIDTH - 1 - x, HEIGHT - 1 - y, mapId);
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => inEllipse(x, y, cx, cy, rx, ry);
  if (mapId === "plains") {
    if (ellipse(3, 3, 1.6, 2) || ellipse(16, 14, 1.5, 1.4)) return "rock";
    if (ellipse(8, 25, 4, 2.5) || ellipse(14, 4, 4, 2) || ellipse(21, 18, 2, 3)) return "forest";
  } else if (mapId === "forest") {
    if (ellipse(4, 25, 2.5, 1.8)) return "water";
    if (ellipse(23, 14, 1.5, 2.5)) return "rock";
    if (ellipse(10, 13, 6, 4.5) || ellipse(17, 5, 5.5, 4) || ellipse(17, 23, 5, 4) || ellipse(2, 4, 4, 3)) return "forest";
  } else if (mapId === "passes") {
    if (x >= 22 && !((y >= 5 && y <= 8) || (y >= 13 && y <= 16) || (y >= 21 && y <= 24))) return "rock";
    if (ellipse(14, 14, 2.8, 5) || ellipse(4, 3, 3, 2.2)) return "rock";
    if (ellipse(8, 24, 4, 3) || ellipse(17, 4, 3, 2) || ellipse(20, 18, 2, 2)) return "forest";
  } else if (mapId === "fronts") {
    // A continuous central massif leaves two separate northern/southern attack lanes.
    if (ellipse(23.5, 14.5, 10.5, 5.8)) return "rock";
    if (ellipse(3, 3, 2, 2)) return "water";
    if (ellipse(15, 3, 6, 2) || ellipse(8, 23, 3, 3) || ellipse(21, 25, 4, 2)) return "forest";
  } else if (mapId === "center") {
    if (ellipse(4, 3, 3, 2) || ellipse(8, 25, 2.5, 2)) return "rock";
    if (ellipse(14, 10, 3, 3) || ellipse(19, 25, 5, 2) || ellipse(22, 3, 3, 2)) return "forest";
  }
  return "field";
}

const landscapes = new Map<MapId, Landscape>([["valley", { tiles, cities }]]);
export function getMap(mapId: MapId = "valley"): Landscape {
  const cached = landscapes.get(mapId);
  if (cached) return cached;
  const mapCities = mapId === "center" ? [
    ...cities.slice(0, 4),
    { x: 18.5, y: 12.5, owner: 0 as const }, { x: 29.5, y: 17.5, owner: 0 as const },
    { x: 20.5, y: 8.5, owner: 0 as const }, { x: 27.5, y: 21.5, owner: 0 as const },
    { x: 21.5, y: 18.5, owner: 0 as const }, { x: 26.5, y: 11.5, owner: 0 as const },
  ] : cities;
  const mapTiles = Array.from({ length: WIDTH * HEIGHT }, (_, id): Tile => {
    const x = id % WIDTH, y = Math.floor(id / WIDTH);
    // Spawn and capture areas remain clear without removing the map's bottlenecks.
    if (mapCities.some(city => Math.hypot(city.x - x - 0.5, city.y - y - 0.5) <= 1.5)) return "field";
    return mapTile(x, y, mapId as Exclude<MapId, "valley">);
  });
  const generated = { tiles: mapTiles, cities: mapCities };
  landscapes.set(mapId, generated);
  return generated;
}

export function tileAt({ x, y }: Point, mapId: MapId = "valley"): Tile {
  const col = Math.floor(x);
  const row = Math.floor(y);
  return col >= 0 && col < WIDTH && row >= 0 && row < HEIGHT ? getMap(mapId).tiles[tileId(col, row)] : "rock";
}
export function passable(point: Point, mapId?: MapId): boolean;
// The existing tests and callers use Array.every(passable); its numeric index is not a map ID.
export function passable(point: Point, index: number): boolean;
export function passable(point: Point, mapId: MapId | number = "valley"): boolean {
  return !["rock", "water"].includes(tileAt(point, typeof mapId === "string" ? mapId : "valley"));
}

export function nearestOpen(point: Point, mapId: MapId = "valley"): Point {
  const x = Math.max(0, Math.min(WIDTH - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(HEIGHT - 1, Math.floor(point.y)));
  if (passable({ x, y }, mapId)) return { x: x + 0.5, y: y + 0.5 };
  for (let r = 1; r < WIDTH; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && passable({ x: x + dx, y: y + dy }, mapId)) {
          return { x: x + dx + 0.5, y: y + dy + 0.5 };
        }
      }
    }
  }
  return getMap(mapId).cities[0];
}

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function route(from: Point, to: Point, kind: Kind, mapId: MapId = "valley"): Point[] {
  const goal = nearestOpen(to, mapId);
  const mapTiles = getMap(mapId).tiles;
  const start = tileId(Math.floor(from.x), Math.floor(from.y));
  const end = tileId(Math.floor(goal.x), Math.floor(goal.y));
  const parent = new Int16Array(mapTiles.length).fill(-1);
  const cost = new Float32Array(mapTiles.length).fill(Infinity);
  const closed = new Uint8Array(mapTiles.length);
  const open = [start];
  cost[start] = 0;
  const rank = (id: number) => cost[id] + Math.hypot(id % WIDTH + 0.5 - goal.x, Math.floor(id / WIDTH) + 0.5 - goal.y);
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (rank(open[i]) < rank(open[best])) best = i;
    const id = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (closed[id]) continue;
    if (id === end) {
      const path = [goal];
      for (let p = parent[end]; p !== -1; p = parent[p]) path.push(center(p));
      return path.reverse();
    }
    closed[id] = 1;
    const x = id % WIDTH;
    const y = Math.floor(id / WIDTH);
    for (const [dx, dy] of directions) {
      const next = { x: x + dx, y: y + dy };
      if (!passable(next, mapId) || (dx && dy && (!passable({ x: x + dx, y }, mapId) || !passable({ x, y: y + dy }, mapId)))) continue;
      const nextId = tileId(next.x, next.y);
      if (closed[nextId]) continue;
      const weight = mapTiles[nextId] === "forest" ? 1 / units[kind].forest : 1;
      const score = cost[id] + Math.hypot(dx, dy) * weight;
      if (score >= cost[nextId]) continue;
      parent[nextId] = id;
      cost[nextId] = score;
      open.push(nextId);
    }
  }
  return [];
}

export function clearShot(from: Point, to: Point, mapId: MapId = "valley"): boolean {
  // Traverse grid boundaries exactly, including both sides of a corner crossing.
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tx = sx ? Math.abs(1 / dx) : Infinity;
  const ty = sy ? Math.abs(1 / dy) : Infinity;
  let nextX = sx ? ((sx > 0 ? x + 1 : x) - from.x) / dx : Infinity;
  let nextY = sy ? ((sy > 0 ? y + 1 : y) - from.y) / dy : Infinity;
  while (Math.min(nextX, nextY) < 1) {
    if (Math.abs(nextX - nextY) < 1e-8) {
      if (tileAt({ x: x + sx, y }, mapId) === "rock" || tileAt({ x, y: y + sy }, mapId) === "rock") return false;
      x += sx;
      y += sy;
      nextX += tx;
      nextY += ty;
    } else if (nextX < nextY) {
      x += sx;
      nextX += tx;
    } else {
      y += sy;
      nextY += ty;
    }
    if (tileAt({ x, y }, mapId) === "rock") return false;
  }
  return tileAt(to, mapId) !== "rock";
}
