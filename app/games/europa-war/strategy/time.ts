import type { World } from "./types";

export const HOURS_PER_DAY = 24;
export const MAX_CAMPAIGN_HOUR = 36_500 * HOURS_PER_DAY + 23;

/** Absolute campaign hour, with midnight for snapshots made before v3. */
export function worldHour(
  world: Pick<World, "day"> & Partial<Pick<World, "hour">>,
): number {
  return world.day * HOURS_PER_DAY + (world.hour ?? 0);
}

export function hourLabel(tick: number): string {
  return `${String(Math.floor(tick) % HOURS_PER_DAY).padStart(2, "0")}:00`;
}
