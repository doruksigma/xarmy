import { GEOGRAPHY, MAP } from "./world";
import type { World } from "./types";

export interface CountryMapLabel {
  country: string;
  province: string;
  name: string;
  x: number;
  y: number;
  extent: number;
  provinces: number;
  axisX: number;
  axisY: number;
  span: number;
  minorSpan: number;
}

/** Label the largest connected controlled landmass, never its sea centroid.
 * Occupation changes the label territory just as it changes political colour.
 * The scene caches this result by ownership, not by simulation hour. */
export function countryLabelSignature(world: World) {
  return (
    MAP.provinces.map((p) => world.provinces[p.id].controller).join("|") +
    Object.values(world.countries)
      .map((c) => `|${c.id}:${c.name}`)
      .join("")
  );
}

export function countryMapLabels(world: World): CountryMapLabel[] {
  const visited = new Set<string>();
  const largest = new Map<string, string[]>();
  for (const p of MAP.provinces) {
    if (visited.has(p.id)) continue;
    const controller = world.provinces[p.id].controller;
    const component = [p.id];
    visited.add(p.id);
    for (let i = 0; i < component.length; i++) {
      for (const edge of GEOGRAPHY[component[i]].neighbors) {
        if (
          edge.sea ||
          visited.has(edge.id) ||
          world.provinces[edge.id]?.controller !== controller
        )
          continue;
        visited.add(edge.id);
        component.push(edge.id);
      }
    }
    if ((largest.get(controller)?.length ?? 0) < component.length)
      largest.set(controller, component);
  }
  return [...largest.entries()]
    .flatMap(([country, ids]) => {
      const state = world.countries[country];
      if (!state) return [];
      const places = ids.map((id) => GEOGRAPHY[id]);
      const cx = places.reduce((s, p) => s + p.x, 0) / places.length;
      const cy = places.reduce((s, p) => s + p.y, 0) / places.length;
      // A territory's long axis gives readable, geographic label placement
      // without handwritten country rotations or a graphics-library import.
      let xx = 0,
        yy = 0,
        xy = 0;
      for (const p of places) {
        const dx = p.x - cx,
          dy = p.y - cy;
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
      }
      const spread = Math.hypot(xx - yy, 2 * xy);
      const elongated =
        (xx + yy + spread) / Math.max(1, xx + yy - spread) > 1.6;
      const angle = elongated ? Math.atan2(2 * xy, xx - yy) / 2 : 0;
      const axisX = Math.cos(angle),
        axisY = Math.sin(angle);
      const along = places.map((p) => (p.x - cx) * axisX + (p.y - cy) * axisY);
      const across = places.map(
        (p) => -(p.x - cx) * axisY + (p.y - cy) * axisX,
      );
      const span = Math.max(...along) - Math.min(...along) + 18;
      const minorSpan = Math.max(...across) - Math.min(...across) + 14;
      const anchor = places.reduce((best, p) =>
        Math.hypot(p.x - cx, p.y - cy) < Math.hypot(best.x - cx, best.y - cy)
          ? p
          : best,
      );
      const extent = Math.max(
        Math.max(...places.map((p) => p.x)) -
          Math.min(...places.map((p) => p.x)),
        Math.max(...places.map((p) => p.y)) -
          Math.min(...places.map((p) => p.y)),
      );
      return [
        {
          country,
          province: anchor.id,
          name: state.name,
          x: anchor.x,
          y: anchor.y,
          extent,
          provinces: ids.length,
          axisX,
          axisY,
          span,
          minorSpan,
        },
      ];
    })
    .sort(
      (a, b) => b.provinces - a.provinces || a.country.localeCompare(b.country),
    );
}

export interface ScreenCountryLabel {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

/** Separating-axis test: a diagonal country's empty bounding-box corners
 * must not suppress the name of a neighbouring country. */
export function countryLabelsOverlap(
  a: ScreenCountryLabel,
  b: ScreenCountryLabel,
  padding = 4,
): boolean {
  const ax = Math.cos(a.angle),
    ay = Math.sin(a.angle);
  const bx = Math.cos(b.angle),
    by = Math.sin(b.angle);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [x, y] of [
    [ax, ay],
    [-ay, ax],
    [bx, by],
    [-by, bx],
  ]) {
    const radiusA =
      (a.width / 2 + padding) * Math.abs(x * ax + y * ay) +
      (a.height / 2 + padding) * Math.abs(-x * ay + y * ax);
    const radiusB =
      (b.width / 2 + padding) * Math.abs(x * bx + y * by) +
      (b.height / 2 + padding) * Math.abs(-x * by + y * bx);
    if (Math.abs(dx * x + dy * y) > radiusA + radiusB) return false;
  }
  return true;
}
