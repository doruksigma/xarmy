import { current, isDraft } from "immer";
import { TERRAINS, UNITS } from "./catalog";
import {
  clamp,
  friendly,
  GEOGRAPHY,
  localSupply,
  supplyNetwork,
} from "./world";
import type { Army, World } from "./types";

/** The same unmodified leg duration used by the hourly movement simulation. */
export function movementLegDays(
  world: World,
  army: Army,
  from: string,
  to: string,
  sea: boolean,
): number {
  const unit = UNITS[army.type];
  const distance = Math.hypot(
    GEOGRAPHY[to].x - GEOGRAPHY[from].x,
    GEOGRAPHY[to].y - GEOGRAPHY[from].y,
  );
  return (
    Math.max(2, distance / 18) /
    (unit.speed *
      (army.support.includes("recon") ? 1.1 : 1) *
      TERRAINS[GEOGRAPHY[to].terrain].speed *
      (sea ? 0.5 : 1) *
      (unit.fuel && world.countries[army.country].tech.includes("engines")
        ? 1.2
        : 1))
  );
}

export function movementSupply(
  world: World,
  army: Army,
  baseSupply: number,
  logisticsCommander?: boolean,
): number {
  const country = world.countries[army.country];
  const logistics =
    logisticsCommander ??
    country.generals.find((general) => general.id === army.general)?.trait ===
      "logistics";
  return clamp(
    baseSupply *
      (logistics ? 1.15 : 1) *
      (army.support.includes("logistics") ? 1.2 : 1) *
      (country.cabinet.military === "quartermaster" ? 1.1 : 1),
    0,
    1,
  );
}

export function movementProgressRate(supply: number, fuelFactor = 1): number {
  const speed = supply < 0.25 ? Math.max(0.05, supply - 0.1) : supply;
  return speed * fuelFactor;
}

/** Reuse only within one routing operation: troop positions, access and supply
 * may change before the next order or daily commander update. */
export function createMovementTimeContext(world: World, countryId: string) {
  const country = world.countries[countryId];
  if (!country) return null;
  const armies = isDraft(world.armies) ? current(world.armies) : world.armies;
  const friendlyCounts = new Map<string, number>();
  for (const army of armies)
    if (army.strength > 0 && friendly(world, countryId, army.country))
      friendlyCounts.set(
        army.province,
        (friendlyCounts.get(army.province) ?? 0) + 1,
      );
  const network = supplyNetwork(world, countryId);
  const generals = new Map(
    country.generals.map((general) => [general.id, general]),
  );
  return {
    world,
    countryId,
    friendlyCounts,
    network,
    generals,
    profileKey: (army: Army) =>
      `${army.type}:${army.support.includes("recon")}:${army.support.includes("logistics")}:${generals.get(army.general ?? "")?.trait === "logistics"}`,
  };
}

/** Order-time estimate, not a promised ETA: future fuel, damage and occupation
 * can change. Infrastructure affects routing through the actual supply rules.
 * Build the network/counts once, memoize each node and collapse equivalent
 * movement profiles so large stacks do not rescan the world per edge or unit. */
export function createMovementTimeEstimator(
  world: World,
  members: readonly Army[],
  context?: ReturnType<typeof createMovementTimeContext>,
) {
  const countryId = members[0]?.country;
  if (!countryId) return () => Number.POSITIVE_INFINITY;
  const country = world.countries[countryId];
  if (!country) return () => Number.POSITIVE_INFINITY;
  const shared =
    context?.world === world && context.countryId === countryId
      ? context
      : createMovementTimeContext(world, countryId)!;
  const { friendlyCounts, network, profileKey } = shared;
  const cohort = [
    ...new Map(
      members
        .filter((army) => army.country === countryId && army.strength > 0)
        .map((army) => [army.id, army]),
    ).values(),
  ];
  const cohortCounts = new Map<string, number>();
  const profiles = new Map<string, Army>();
  for (const army of cohort) {
    cohortCounts.set(army.province, (cohortCounts.get(army.province) ?? 0) + 1);
    const key = profileKey(army);
    if (!profiles.has(key)) profiles.set(key, army);
  }
  if (!profiles.size) return () => Number.POSITIVE_INFINITY;
  const rates = new Map<string, number[]>();
  const costByEdge = new Map<string, number>();
  const variants = [...profiles.values()];
  const logistics = variants.map(
    (army) => shared.generals.get(army.general ?? "")?.trait === "logistics",
  );
  return (from: string, to: string, sea: boolean): number => {
    const key = `${from}:${to}:${sea}`;
    const cached = costByEdge.get(key);
    if (cached !== undefined) return cached;
    let speeds = rates.get(from);
    if (!speeds) {
      // Current residents plus this arriving formation; members already here
      // must not count twice. Stacked groups keep the real congestion cost.
      const troops =
        (friendlyCounts.get(from) ?? 0) +
        cohort.length -
        (cohortCounts.get(from) ?? 0);
      const base = localSupply(world, countryId, from, network, troops);
      speeds = variants.map((army, index) =>
        movementProgressRate(
          movementSupply(world, army, base, logistics[index]),
          UNITS[army.type].fuel && country.stock.fuel <= 0 ? 0.3 : 1,
        ),
      );
      rates.set(from, speeds);
    }
    let slowest = 0;
    for (let index = 0; index < variants.length; index++)
      slowest = Math.max(
        slowest,
        movementLegDays(world, variants[index], from, to, sea) / speeds[index],
      );
    costByEdge.set(key, slowest);
    return slowest;
  };
}
