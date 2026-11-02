import { commanderTargets } from "./commanders";
import { atWar } from "./world";
import type { World } from "./types";

export const EASY_PLAY_PREFERENCE = "xarmy-europa-easy-play-v1";

/** Presentation preferences never change difficulty, automation or a save. */
export function easyPresentationPreference(value: string | null): boolean {
  return value !== "advanced";
}

export function easyCommanderGuide(world: World, selectedId = "") {
  const country = world.countries[world.player];
  const counts = new Map<string, number>();
  let unassigned = 0,
    total = 0;
  for (const army of world.armies) {
    if (army.country !== country.id) continue;
    total++;
    if (army.general)
      counts.set(army.general, (counts.get(army.general) ?? 0) + 1);
    else unassigned++;
  }
  const selected =
    country.generals.find((general) => general.id === selectedId) ??
    country.generals.find((general) => (counts.get(general.id) ?? 0) > 0) ??
    country.generals[0];
  const members = selected ? (counts.get(selected.id) ?? 0) : 0;
  const neighbors = commanderTargets(world, country.id);
  // Orders always refer to the applied front, never a pending picker choice.
  const deployedTarget = selected?.front
    ? world.countries[selected.front.target]
    : undefined;
  const canAttack = Boolean(
    !country.capitulated &&
      members > 0 &&
      selected?.front &&
      deployedTarget &&
      !deployedTarget.capitulated &&
      atWar(world, country.id, deployedTarget.id),
  );
  return {
    country,
    selected,
    counts,
    members,
    total,
    unassigned,
    neighbors,
    deployedTarget,
    canDeploy: !country.capitulated && members > 0 && neighbors.length > 0,
    canAttack,
  };
}
