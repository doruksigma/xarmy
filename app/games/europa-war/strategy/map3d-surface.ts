import type { BufferGeometry } from "three";
import map from "./map-data.json";
import { heightAt } from "./map3d-geometry";

const STRIDE = 10;
const MAX_BUCKET_REFERENCES = 16;
const EDGE_EPSILON = 1e-7;

/** Samples the surface that is actually drawn, rather than its source heightfield.
 * Coordinates are map coordinates; the result is the terrain's world Y.
 * The immutable position/index snapshot and its bounded spatial index belong to
 * this sampler only. Recreate it when terrain positions change; color updates
 * need no rebuild. No geometry, material, or World state is modified.
 */
export function createTerrainSurfaceSampler(
  geometry: BufferGeometry,
): (mapX: number, mapY: number) => number {
  const fallback = (x: number, y: number) =>
    heightAt(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
  const position = geometry.getAttribute("position");
  if (!position || position.itemSize < 3) return fallback;
  const index = geometry.getIndex();
  const faceCount = Math.floor((index?.count ?? position.count) / 3);
  const triangles = new Float64Array(faceCount * STRIDE);
  let count = 0;
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;

  for (let face = 0; face < faceCount; face++) {
    const ai = index ? index.getX(face * 3) : face * 3;
    const bi = index ? index.getX(face * 3 + 1) : face * 3 + 1;
    const ci = index ? index.getX(face * 3 + 2) : face * 3 + 2;
    const ax = position.getX(ai) + map.width / 2;
    const az = position.getZ(ai) + map.height / 2;
    const ay = position.getY(ai);
    const bx = position.getX(bi) + map.width / 2;
    const bz = position.getZ(bi) + map.height / 2;
    const by = position.getY(bi);
    const cx = position.getX(ci) + map.width / 2;
    const cz = position.getZ(ci) + map.height / 2;
    const cy = position.getY(ci);
    const abx = bx - ax,
      abz = bz - az,
      acx = cx - ax,
      acz = cz - az;
    const determinant = abx * acz - abz * acx;
    if (
      !Number.isFinite(ax + az + ay + bx + bz + by + cx + cz + cy) ||
      !Number.isFinite(determinant) ||
      Math.abs(determinant) < 1e-12
    )
      continue;
    const offset = count++ * STRIDE;
    triangles[offset] = ax;
    triangles[offset + 1] = az;
    triangles[offset + 2] = abx;
    triangles[offset + 3] = abz;
    triangles[offset + 4] = acx;
    triangles[offset + 5] = acz;
    triangles[offset + 6] = ay;
    triangles[offset + 7] = by - ay;
    triangles[offset + 8] = cy - ay;
    triangles[offset + 9] = 1 / determinant;
    minX = Math.min(minX, ax, bx, cx);
    maxX = Math.max(maxX, ax, bx, cx);
    minZ = Math.min(minZ, az, bz, cz);
    maxZ = Math.max(maxZ, az, bz, cz);
  }
  if (!count) return fallback;

  // Bound both the grid dimensions and each triangle's index duplication. Very
  // large triangles are checked separately instead of filling thousands of cells.
  const cellSize = Math.max(24, (maxX - minX) / 128, (maxZ - minZ) / 128);
  const columns = Math.floor((maxX - minX) / cellSize) + 1;
  const rows = Math.floor((maxZ - minZ) / cellSize) + 1;
  const buckets = new Map<number, number[]>();
  const wideTriangles: number[] = [];
  for (let face = 0; face < count; face++) {
    const offset = face * STRIDE;
    const ax = triangles[offset],
      az = triangles[offset + 1];
    const bx = ax + triangles[offset + 2],
      bz = az + triangles[offset + 3];
    const cx = ax + triangles[offset + 4],
      cz = az + triangles[offset + 5];
    const left = Math.floor((Math.min(ax, bx, cx) - minX) / cellSize);
    const right = Math.floor((Math.max(ax, bx, cx) - minX) / cellSize);
    const top = Math.floor((Math.min(az, bz, cz) - minZ) / cellSize);
    const bottom = Math.floor((Math.max(az, bz, cz) - minZ) / cellSize);
    if ((right - left + 1) * (bottom - top + 1) > MAX_BUCKET_REFERENCES) {
      wideTriangles.push(offset);
      continue;
    }
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const key = row * columns + column;
        let bucket = buckets.get(key);
        if (!bucket) buckets.set(key, (bucket = []));
        bucket.push(offset);
      }
    }
  }

  const sampleCandidates = (
    candidates: number[] | undefined,
    x: number,
    z: number,
    highest: number,
  ) => {
    if (!candidates) return highest;
    for (const offset of candidates) {
      const dx = x - triangles[offset];
      const dz = z - triangles[offset + 1];
      const b =
        (dx * triangles[offset + 5] - dz * triangles[offset + 4]) *
        triangles[offset + 9];
      const c =
        (triangles[offset + 2] * dz - triangles[offset + 3] * dx) *
        triangles[offset + 9];
      if (b < -EDGE_EPSILON || c < -EDGE_EPSILON || b + c > 1 + EDGE_EPSILON)
        continue;
      highest = Math.max(
        highest,
        triangles[offset + 6] +
          b * triangles[offset + 7] +
          c * triangles[offset + 8],
      );
    }
    return highest;
  };

  return (mapX, mapY) => {
    if (
      !Number.isFinite(mapX) ||
      !Number.isFinite(mapY) ||
      mapX < minX - EDGE_EPSILON ||
      mapX > maxX + EDGE_EPSILON ||
      mapY < minZ - EDGE_EPSILON ||
      mapY > maxZ + EDGE_EPSILON
    )
      return fallback(mapX, mapY);
    const column = Math.max(
      0,
      Math.min(columns - 1, Math.floor((mapX - minX) / cellSize)),
    );
    const row = Math.max(
      0,
      Math.min(rows - 1, Math.floor((mapY - minZ) / cellSize)),
    );
    let highest = sampleCandidates(
      buckets.get(row * columns + column),
      mapX,
      mapY,
      -Infinity,
    );
    highest = sampleCandidates(wideTriangles, mapX, mapY, highest);
    // Oceans, polygon holes and permitted tiny cartographic seams have no drawn
    // terrain triangle. Only these misses use the source relief field.
    return Number.isFinite(highest) ? highest : fallback(mapX, mapY);
  };
}
