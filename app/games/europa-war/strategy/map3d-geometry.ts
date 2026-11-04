import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from "three";
import type { ColorRepresentation } from "three";
import map from "./map-data.json";
import { CARTOGRAPHIC_TERRAINS } from "./map3d-cartography-palette";

type Point = { x: number; y: number };
export type PolygonPart = { outer: Point[]; holes: Point[][] };
export type VertexRange = { start: number; count: number };
export interface TerrainMesh {
  geometry: BufferGeometry;
  borderGeometry: BufferGeometry;
  coastGeometry: BufferGeometry;
  provinceVertexRanges: Map<string, VertexRange>;
  provinceBorderRanges: Map<string, VertexRange>;
  faceProvinceIds: string[];
  dispose(): void;
}

const WIDTH = map.width;
const HEIGHT = map.height;
const CELL = 8;
const COLS = Math.ceil(WIDTH / CELL) + 1;
const ROWS = Math.ceil(HEIGHT / CELL) + 1;
const MAX_FACES = 150_000;
const polygonCache = new Map<string, PolygonPart[]>();
const provinceById = new Map(map.provinces.map((p) => [p.id, p]));

function signedArea(ring: Point[]) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    area += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  return area / 2;
}

function inRing(ring: Point[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** The shipped geographic SVG paths contain polygon M/L/Z commands only.
 * Keep this parser DOM-free so the same exact rings can be tested in Node.
 * Unsupported curves fail visibly rather than silently changing geography.
 * Geographic ring nesting defines holes irrespective of ring winding. */
export function parsePolygonPath(path: string): PolygonPart[] {
  const tokens =
    path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (path.replace(/[MLZmlz\s,\d.+eE-]/g, "").length)
    throw new Error("3D harita yalnızca çokgen SVG yollarını destekler.");
  const rings: Point[][] = [];
  let ring: Point[] = [],
    command = "",
    x = 0,
    y = 0,
    i = 0;
  const finish = () => {
    if (
      ring.length > 1 &&
      ring[0].x === ring[ring.length - 1].x &&
      ring[0].y === ring[ring.length - 1].y
    )
      ring.pop();
    if (ring.length >= 3 && Math.abs(signedArea(ring)) > 1e-7) rings.push(ring);
    ring = [];
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      command = tokens[i++];
      if (!/^[MLZmlz]$/.test(command))
        throw new Error("Desteklenmeyen SVG harita komutu.");
      if (command.toUpperCase() === "Z") {
        if (ring.length) {
          x = ring[0].x;
          y = ring[0].y;
        }
        finish();
        command = "";
        continue;
      }
      if (command.toUpperCase() === "M") finish();
    }
    if (!command || i + 1 >= tokens.length || /^[a-zA-Z]$/.test(tokens[i + 1]))
      throw new Error("Bozuk SVG harita koordinatı.");
    let nx = Number(tokens[i++]),
      ny = Number(tokens[i++]);
    if (!Number.isFinite(nx) || !Number.isFinite(ny))
      throw new Error("Geçersiz harita koordinatı.");
    if (command === command.toLowerCase()) {
      nx += x;
      ny += y;
    }
    x = nx;
    y = ny;
    if (
      !ring.length ||
      ring[ring.length - 1].x !== x ||
      ring[ring.length - 1].y !== y
    )
      ring.push({ x, y });
    if (command.toUpperCase() === "M") command = command === "M" ? "L" : "l";
  }
  finish();
  const ordered = rings
    .map((points) => ({
      points,
      area: Math.abs(signedArea(points)),
      parent: -1,
      depth: 0,
    }))
    .sort((a, b) => b.area - a.area);
  for (let n = 0; n < ordered.length; n++) {
    let smallest = Infinity;
    for (let parent = 0; parent < n; parent++) {
      const p = ordered[parent];
      if (
        p.area < smallest &&
        inRing(p.points, ordered[n].points[0].x, ordered[n].points[0].y)
      ) {
        ordered[n].parent = parent;
        smallest = p.area;
      }
    }
    if (ordered[n].parent !== -1)
      ordered[n].depth = ordered[ordered[n].parent].depth + 1;
  }
  const parts: PolygonPart[] = [];
  for (let n = 0; n < ordered.length; n++) {
    const ring = ordered[n];
    if (ring.depth % 2) continue;
    parts.push({
      outer: ring.points,
      holes: ordered
        .filter((r) => r.parent === n && r.depth % 2 === 1)
        .map((r) => r.points),
    });
  }
  return parts;
}

export function provincePolygons(id: string): PolygonPart[] {
  let parts = polygonCache.get(id);
  if (!parts) {
    const province = provinceById.get(id);
    if (!province) throw new Error("Harita bölgesi bulunamadı.");
    parts = parsePolygonPath(province.path);
    polygonCache.set(id, parts);
  }
  return parts;
}

export function containsProvincePoint(id: string, x: number, y: number) {
  return provincePolygons(id).some(
    (part) =>
      inRing(part.outer, x, y) &&
      !part.holes.some((hole) => inRing(hole, x, y)),
  );
}

// Strategic relief is procedural presentation, not measured terrain/DEM data.
// It is keyed solely to the shipped geography, never the simulation PRNG.
let heights: Float32Array | undefined;
function heightGrid() {
  if (heights) return heights;
  const grid = new Float32Array(COLS * ROWS);
  // A mountain only affects the surrounding 80 map units. Scatter these local
  // contributions once instead of checking every mountain at every world cell.
  // This keeps the 5400×3300 atlas proportional to grid size + mountain count.
  const influenceGrid = new Float64Array(COLS * ROWS);
  for (const p of map.provinces) {
    if (p.terrain !== "mountain") continue;
    const firstRow = Math.max(0, Math.floor((p.y - 80) / CELL));
    const lastRow = Math.min(ROWS - 1, Math.ceil((p.y + 80) / CELL));
    const firstCol = Math.max(0, Math.floor((p.x - 80) / CELL));
    const lastCol = Math.min(COLS - 1, Math.ceil((p.x + 80) / CELL));
    for (let row = firstRow; row <= lastRow; row++)
      for (let col = firstCol; col <= lastCol; col++) {
        const d2 = (p.x - col * CELL) ** 2 + (p.y - row * CELL) ** 2;
        if (d2 < 6400) influenceGrid[row * COLS + col] += Math.exp(-d2 / 850);
      }
  }
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL,
        y = row * CELL;
      const influence = influenceGrid[row * COLS + col];
      const ridge =
        0.62 +
        0.23 * Math.sin(x * 0.092 + y * 0.039) +
        0.15 * Math.cos(y * 0.13 - x * 0.045);
      const rolling = 1.1 + Math.sin(x * 0.023) * Math.cos(y * 0.027) * 0.85;
      grid[row * COLS + col] =
        0.25 +
        rolling * 0.55 +
        (1 - Math.exp(-influence * 1.1)) * (12 + ridge * 21);
    }
  heights = grid;
  return grid;
}

/** Continuous strategic terrain height, in map/world units; input is map x/y. */
export function heightAt(mapX: number, mapY: number): number {
  const x = Math.max(0, Math.min(WIDTH, mapX)) / CELL;
  const y = Math.max(0, Math.min(HEIGHT, mapY)) / CELL;
  const col = Math.min(COLS - 2, Math.floor(x)),
    row = Math.min(ROWS - 2, Math.floor(y));
  const tx = x - col,
    ty = y - row,
    h = heightGrid();
  return (
    h[row * COLS + col] * (1 - tx) * (1 - ty) +
    h[row * COLS + col + 1] * tx * (1 - ty) +
    h[(row + 1) * COLS + col] * (1 - tx) * ty +
    h[(row + 1) * COLS + col + 1] * tx * ty
  );
}

function lineVertices(parts: PolygonPart[], maxEdge: number, lift: number) {
  const positions: number[] = [];
  for (const part of parts)
    for (const ring of [part.outer, ...part.holes])
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        const steps = Math.max(
          1,
          Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / maxEdge),
        );
        for (let step = 0; step < steps; step++)
          for (const t of [step / steps, (step + 1) / steps]) {
            const x = a.x + (b.x - a.x) * t,
              y = a.y + (b.y - a.y) * t;
            positions.push(
              x - WIDTH / 2,
              heightAt(x, y) + lift,
              y - HEIGHT / 2,
            );
          }
      }
  return positions;
}

export function provinceOutline(id: string, lift = 0.55): BufferGeometry {
  return new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(lineVertices(provincePolygons(id), 8, lift), 3),
  );
}

/** Close the exposed edge of the elevated land down to the water plane.
 * Interior country contours are harmless buried faces; this does not change
 * the province surface, picking identity or political border geometry. */
function buildCoastSkirt() {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const country of map.countries) {
    for (const part of parsePolygonPath(country.path)) {
      for (const [ring, hole] of [
        [part.outer, false],
        ...part.holes.map((r) => [r, true] as const),
      ] as [Point[], boolean][]) {
        const contour =
          signedArea(ring) > 0 === !hole ? ring : [...ring].reverse();
        const firstVertex = positions.length / 3;
        for (let i = 0; i < contour.length; i++) {
          const a = contour[i],
            b = contour[(i + 1) % contour.length];
          const count = Math.max(
            1,
            Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 8),
          );
          for (let n = 0; n < count; n++) {
            const ax = a.x + ((b.x - a.x) * n) / count;
            const ay = a.y + ((b.y - a.y) * n) / count;
            positions.push(
              ax - WIDTH / 2,
              heightAt(ax, ay),
              ay - HEIGHT / 2,
              ax - WIDTH / 2,
              -0.4,
              ay - HEIGHT / 2,
            );
          }
        }
        // Neighboring walls reuse their top/bottom vertices. The global coast
        // retains every source bend with one third of the previous attributes.
        const points = (positions.length / 3 - firstVertex) / 2;
        for (let i = 0; i < points; i++) {
          const at = firstVertex + i * 2;
          const bt = firstVertex + ((i + 1) % points) * 2;
          indices.push(at, bt, bt + 1, at, bt + 1, at + 1);
        }
      }
    }
  }
  const geometry = new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildTerrain(options: { maxEdge?: number } = {}): TerrainMesh {
  // Preserve local detail while bounding subdivision for a globe-sized atlas.
  const defaultEdge = WIDTH > 2000 ? 32 : 16;
  const maxEdge = Math.max(
    8,
    Math.min(
      80,
      Number.isFinite(options.maxEdge) ? options.maxEdge! : defaultEdge,
    ),
  );
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    terrainTypes: number[] = [],
    uv: number[] = [],
    borders: number[] = [];
  const faceProvinceIds: string[] = [];
  const provinceVertexRanges = new Map<string, VertexRange>();
  const provinceBorderRanges = new Map<string, VertexRange>();
  const distance2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const midpoint = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const pushTriangle = (
    a: Point,
    b: Point,
    c: Point,
    id: string,
    color: Color,
    terrainType: number,
  ) => {
    if (faceProvinceIds.length >= MAX_FACES)
      throw new Error("3D arazi ayrıntı bütçesini aşıyor.");
    // Map y points south (+world z); reverse SVG winding to face world +Y.
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const triangle = cross > 0 ? [a, c, b] : [a, b, c];
    for (const p of triangle) {
      const height = heightAt(p.x, p.y);
      positions.push(p.x - WIDTH / 2, height, p.y - HEIGHT / 2);
      const dx = (heightAt(p.x + 1, p.y) - heightAt(p.x - 1, p.y)) / 2;
      const dz = (heightAt(p.x, p.y + 1) - heightAt(p.x, p.y - 1)) / 2;
      const length = Math.hypot(dx, 1, dz);
      normals.push(-dx / length, 1 / length, -dz / length);
      colors.push(color.r, color.g, color.b);
      terrainTypes.push(terrainType);
      uv.push(p.x / WIDTH, 1 - p.y / HEIGHT);
    }
    faceProvinceIds.push(id);
  };
  for (const province of map.provinces) {
    const start = positions.length / 3;
    const parts = provincePolygons(province.id);
    const color = new Color(
      map.countries.find((c) => c.id === province.country)!.color,
    );
    for (const part of parts) {
      const outer = part.outer.map((p) => new Vector2(p.x, p.y));
      const holes = part.holes.map((ring) =>
        ring.map((p) => new Vector2(p.x, p.y)),
      );
      const vertices = [...outer, ...holes.flat()];
      const triangles = ShapeUtils.triangulateShape(outer, holes);
      const pending: [Point, Point, Point][] = triangles.map((face) => [
        vertices[face[0]],
        vertices[face[1]],
        vertices[face[2]],
      ]);
      while (pending.length) {
        const [a, b, c] = pending.pop()!;
        const ab = distance2(a, b),
          bc = distance2(b, c),
          ca = distance2(c, a);
        if (Math.max(ab, bc, ca) <= maxEdge * maxEdge) {
          pushTriangle(
            a,
            b,
            c,
            province.id,
            color,
            CARTOGRAPHIC_TERRAINS[
              province.terrain as keyof typeof CARTOGRAPHIC_TERRAINS
            ].index,
          );
          continue;
        }
        if (ab >= bc && ab >= ca) {
          const m = midpoint(a, b);
          pending.push([a, m, c], [m, b, c]);
        } else if (bc >= ca) {
          const m = midpoint(b, c);
          pending.push([a, b, m], [a, m, c]);
        } else {
          const m = midpoint(c, a);
          pending.push([a, b, m], [m, b, c]);
        }
      }
    }
    provinceVertexRanges.set(province.id, {
      start,
      count: positions.length / 3 - start,
    });
    const borderStart = borders.length / 3;
    borders.push(...lineVertices(parts, maxEdge / 2, 0.2));
    provinceBorderRanges.set(province.id, {
      start: borderStart,
      count: borders.length / 3 - borderStart,
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "terrainType",
    new Float32BufferAttribute(terrainTypes, 1),
  );
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const borderGeometry = new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(borders, 3),
  );
  borderGeometry.computeBoundingSphere();
  const coastGeometry = buildCoastSkirt();
  return {
    geometry,
    borderGeometry,
    coastGeometry,
    provinceVertexRanges,
    provinceBorderRanges,
    faceProvinceIds,
    dispose() {
      geometry.dispose();
      borderGeometry.dispose();
      coastGeometry.dispose();
    },
  };
}

/** Update controller/map-mode colors without rebuilding terrain geometry. */
export function colorTerrain(
  terrain: TerrainMesh,
  id: string,
  colorValue: ColorRepresentation,
) {
  const range = terrain.provinceVertexRanges.get(id);
  if (!range) return;
  const color = new Color(colorValue),
    attribute = terrain.geometry.getAttribute("color");
  for (let i = range.start; i < range.start + range.count; i++)
    attribute.setXYZ(i, color.r, color.g, color.b);
  attribute.needsUpdate = true;
}
