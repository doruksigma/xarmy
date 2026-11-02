import { inLandContact } from "./land";
import { armyMapPosition } from "./map3d-visuals";
import { atWar, GEOGRAPHY } from "./world";
import type { Army, Battle, World } from "./types";

export interface FormationCombat {
  key: string;
  battleId: string;
  province: string;
  target: { x: number; y: number };
}

export interface FormationCapture {
  key: string;
  province: string;
  country: string;
  armyIds: string[];
}

/** A real fight that finished between two daily simulation snapshots. */
export interface ResolvedFormationCombat {
  key: string;
  battleId: string;
  province: string;
  country: string;
  opponent: string;
  armyIds: string[];
  position: { x: number; y: number };
  target: { x: number; y: number };
}

function attacking(world: World, army: Army, battle: Battle) {
  return (
    army.strength > 0 &&
    army.country === battle.attacker &&
    army.move?.to === battle.province &&
    atWar(world, army.country, world.provinces[battle.province].controller) &&
    (army.move.progress >= army.move.days || inLandContact(world, army))
  );
}

function defending(world: World, army: Army, battle: Battle) {
  return (
    army.strength > 0 &&
    army.province === battle.province &&
    atWar(world, army.country, battle.attacker)
  );
}

/**
 * Read the resolved battle, not just a shared country or a movement order.
 * Called when the renderer receives a simulation snapshot; animation frames do
 * not scan the world, change combat, or consume the simulation's random seed.
 */
export function formationCombat(
  world: World,
  armies: readonly Army[],
): FormationCombat | null {
  for (const battle of world.battles) {
    if (!world.provinces[battle.province] || !GEOGRAPHY[battle.province])
      continue;
    const attacker = armies.find((army) => attacking(world, army, battle));
    // A withdrawing defender remains exposed to engine damage until it leaves
    // the province, but its miniature should march out instead of firing.
    const defender = armies.find(
      (army) => !army.move && defending(world, army, battle),
    );
    if (!attacker && !defender) continue;

    // Only actual opponents in this battle can provide an aim position. A
    // reserve elsewhere in the same enemy country must never be disclosed.
    const opponent = world.armies.find((army) =>
      attacker
        ? defending(world, army, battle)
        : attacking(world, army, battle),
    );
    // A battle record can survive the resolution tick in which its last
    // defender retreats. Stop shooting as soon as that combat is over.
    if (!opponent) continue;
    const participant = attacker ?? defender!;
    const position = GEOGRAPHY[opponent.province]
      ? armyMapPosition(opponent)
      : GEOGRAPHY[battle.province];
    return {
      key: `${battle.id}:${battle.started}:${participant.country}`,
      battleId: battle.id,
      province: battle.province,
      target: { x: position.x, y: position.y },
    };
  }
  return null;
}

/**
 * A defender can rout in the same tick that first records a battle. In that
 * case formationCombat correctly finds no active opponent, but dropping the
 * resolved exchange would make the entire genuine fight invisible. Return
 * only surviving, damaged combatants and their historical contact positions;
 * the renderer owns a short, bounded playback, never a simulation delay.
 */
export function detectResolvedFormationCombats(
  previous: World | null,
  current: World,
): ResolvedFormationCombat[] {
  if (
    !previous ||
    current.day !== previous.day + 1 ||
    current.version !== previous.version ||
    current.player !== previous.player ||
    current.mode !== previous.mode ||
    current.serial < previous.serial
  )
    return [];

  const currentArmies = new Map(current.armies.map((army) => [army.id, army]));
  const events: ResolvedFormationCombat[] = [];
  for (const battle of current.battles) {
    if (
      !GEOGRAPHY[battle.province] ||
      !previous.provinces[battle.province] ||
      !(battle.attack > 0 && battle.defense > 0)
    )
      continue;
    const attackers = previous.armies.filter(
      (army) =>
        army.strength > 0 &&
        army.country === battle.attacker &&
        (army.move?.to ?? army.route[0]) === battle.province &&
        inLandContact(previous, army),
    );
    const defenders = previous.armies.filter(
      (army) =>
        army.strength > 0 &&
        !army.move &&
        army.province === battle.province &&
        atWar(previous, army.country, battle.attacker),
    );
    if (!attackers.length || !defenders.length) continue;

    for (const [participants, opponents] of [
      [attackers, defenders],
      [defenders, attackers],
    ]) {
      const groups = new Map<string, { before: Army; after: Army }[]>();
      for (const before of participants) {
        const after = currentArmies.get(before.id);
        // Attrition lowers strength but never grants land combat experience.
        // Veterans already at the cap cannot gain more; their current battle,
        // prior hostile contact and actual loss still prove the exchange.
        // Missing/dead armies must not become ghost models in a past exchange.
        if (
          !after ||
          after.country !== before.country ||
          after.strength <= 0 ||
          after.strength >= before.strength ||
          !(
            after.experience > before.experience ||
            (before.experience === 100 && after.experience === 100)
          )
        )
          continue;
        const groupKey = `${before.country}:${before.province}:${before.move?.to ?? before.route[0] ?? "idle"}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey)!.push({ before, after });
      }
      for (const [groupKey, members] of groups) {
        if (
          formationCombat(
            current,
            members.map(({ after }) => after),
          )
        )
          continue;
        const first = members[0].before;
        events.push({
          key: `${battle.id}:${battle.started}:${current.day}:${groupKey}:resolved`,
          battleId: battle.id,
          province: battle.province,
          country: first.country,
          opponent: opponents[0].country,
          armyIds: members.map(({ after }) => after.id),
          position: armyMapPosition(first),
          // Never aim at (or disclose) a defender's new retreat destination.
          target: armyMapPosition(opponents[0]),
        });
      }
    }
  }
  return events;
}

/** A military arrival and hostile control change, never a save/load flourish. */
export function detectFormationCaptures(
  previous: World | null,
  current: World,
): FormationCapture[] {
  if (
    !previous ||
    current.day !== previous.day + 1 ||
    current.version !== previous.version ||
    current.player !== previous.player ||
    current.mode !== previous.mode ||
    current.serial < previous.serial
  )
    return [];

  const oldArmies = new Map(previous.armies.map((army) => [army.id, army]));
  const arrivals = new Map<string, string[]>();
  for (const army of current.armies) {
    const before = oldArmies.get(army.id);
    const oldProvince = previous.provinces[army.province];
    const province = current.provinces[army.province];
    if (
      army.strength <= 0 ||
      !before ||
      before.strength <= 0 ||
      before.country !== army.country ||
      before.province === army.province ||
      !oldProvince ||
      !province ||
      province.controller !== army.country ||
      oldProvince.controller === province.controller ||
      !atWar(previous, army.country, oldProvince.controller)
    )
      continue;

    // Fast units can start and finish the first queued leg in one day. The
    // preceding march or next queued leg must target the newly held province;
    // unrelated capitulation/peace transfers receive no capture animation.
    if ((before.move?.to ?? before.route[0]) !== army.province) continue;
    const ids = arrivals.get(army.province) ?? [];
    ids.push(army.id);
    arrivals.set(army.province, ids);
  }
  return Array.from(arrivals, ([province, armyIds]) => {
    const country = current.provinces[province].controller;
    return {
      key: `${current.day}:${province}:${country}`,
      province,
      country,
      armyIds,
    };
  });
}
