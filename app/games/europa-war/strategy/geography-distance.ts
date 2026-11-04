import map from "./map-data.json";

// The legacy European atlas has edges; the world atlas joins across the date line.
export function mapDeltaX(fromX: number, toX: number): number {
  const delta = toX - fromX;
  if (map.width < 5000 || Math.abs(delta) <= map.width / 2) return delta;
  return delta - Math.sign(delta) * map.width;
}
export function mapWrapX(x: number): number {
  return map.width >= 5000 ? ((x % map.width) + map.width) % map.width : x;
}
export function mapDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.hypot(mapDeltaX(from.x, to.x), to.y - from.y);
}
