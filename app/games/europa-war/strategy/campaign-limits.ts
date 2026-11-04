import map from "./map-data.json";
import type { World } from "./types";

/** A finite simulation and save budget that grows with the scenario's size. */
export const MAX_ARMIES = Math.max(2500, map.countries.length * 40);

/** Training reserves its place before charging equipment or manpower. */
export function hasArmyCapacity(w: World): boolean {
  let committed = w.armies.length;
  for (const country of Object.values(w.countries)) {
    committed += country.recruitment.length;
    if (committed >= MAX_ARMIES) return false;
  }
  return committed < MAX_ARMIES;
}
