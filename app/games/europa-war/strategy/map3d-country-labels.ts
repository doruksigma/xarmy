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
        },
      ];
    })
    .sort(
      (a, b) => b.provinces - a.provinces || a.country.localeCompare(b.country),
    );
}
