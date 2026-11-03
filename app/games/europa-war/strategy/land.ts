import { airSupport } from "./airnaval";
import { commanderOrderAllows } from "./commander-roster";
import { addWarScore, openConference } from "./conference";
import { equipmentNeeds } from "./planning";
import { seaEdgeOpen } from "./military-assets";
import { TERRAINS, UNITS } from "./catalog";
import {
  createMovementTimeEstimator,
  movementLegDays,
  movementProgressRate,
  movementSupply,
} from "./land-movement-cost";
import {
  atWar,
  clamp,
  event,
  friendly,
  GEOGRAPHY,
  localSupply,
  supplyNetwork,
  surrender,
} from "./world";
import type { Army, World } from "./types";

export function routeTo(
  w: World,
  army: Army,
  to: string,
  from = army.province,
  formation: readonly Army[] = [army],
): string[] | null {
  return findMovementRoute(w, army, to, from, formation, false);
}

/** A strategic plan may look across future enemy provinces, but only issues
 * the first land step. routeTo still validates the actual movement order. */
export function nextLandStep(
  w: World,
  army: Army,
  to: string,
  formation: readonly Army[] = [army],
): string | undefined {
  return findMovementRoute(w, army, to, army.province, formation, true)?.[0];
}

function findMovementRoute(
  w: World,
  army: Army,
  to: string,
  from: string,
  formation: readonly Army[],
  strategic: boolean,
): string[] | null {
  if (
    !Object.hasOwn(GEOGRAPHY, from) ||
    !Object.hasOwn(GEOGRAPHY, to) ||
    !w.provinces[to]
  )
    return null;
  if (from === to) return [];
  const destination = w.provinces[to].controller;
  if (
    !friendly(w, army.country, destination) &&
    !atWar(w, army.country, destination)
  )
    return null;
  const travelTime = createMovementTimeEstimator(w, formation);
  const previous: Record<string, string> = {};
  const distance = new Map([[from, 0]]);
  // Dijkstra's heap stays bounded by relaxed edges. Equal costs use stable
  // province IDs, never army order, map iteration luck or the campaign RNG.
  type Node = { id: string; cost: number };
  const heap: Node[] = [];
  const before = (a: Node, b: Node) =>
    a.cost < b.cost || (a.cost === b.cost && a.id < b.id);
  const push = (node: Node) => {
    let index = heap.length;
    heap.push(node);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(node, heap[parent])) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = node;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        const left = index * 2 + 1,
          right = left + 1;
        const child =
          right < heap.length && before(heap[right], heap[left]) ? right : left;
        if (!before(heap[child], last)) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  push({ id: from, cost: 0 });
  while (heap.length) {
    const node = pop();
    if (node.cost !== distance.get(node.id)) continue;
    if (node.id === to) {
      const path = [to];
      while (previous[path[0]] !== from) path.unshift(previous[path[0]]);
      return path;
    }
    for (const edge of GEOGRAPHY[node.id].neighbors) {
      if (
        edge.sea &&
        (strategic || !seaEdgeOpen(w, army.country, node.id, edge.id))
      )
        continue;
      const controller = w.provinces[edge.id].controller;
      if (
        !friendly(w, army.country, controller) &&
        !atWar(w, army.country, controller)
      )
        continue;
      // A route may end in hostile territory, but cannot plan through uncaptured enemy land.
      if (!strategic && atWar(w, army.country, controller) && edge.id !== to)
        continue;
      const cost = node.cost + travelTime(node.id, edge.id, edge.sea);
      const known = distance.get(edge.id) ?? Number.POSITIVE_INFINITY;
      if (cost < known) {
        distance.set(edge.id, cost);
        previous[edge.id] = node.id;
        push({ id: edge.id, cost });
      }
    }
  }
  return null;
}
export function combatPower(
  w: World,
  a: Army,
  attacking: boolean,
  province: string,
) {
  const c = w.countries[a.country],
    d = UNITS[a.type],
    p = w.provinces[province],
    geo = GEOGRAPHY[province],
    terrain = TERRAINS[geo.terrain];
  let terrainFactor = attacking ? terrain.attack : terrain.defense;
  if (a.type === "mountain" && geo.terrain === "mountain")
    terrainFactor *= attacking ? 1.8 : 1.25;
  if (d.fuel && ["mountain", "marsh", "urban"].includes(geo.terrain))
    terrainFactor *= 0.65;
  const general = c.generals.find((g) => g.id === a.general);
  const tech =
    1 +
    (c.tech.includes("landDoctrine") ? 0.15 : 0) +
    (!d.fuel && attacking
      ? ["weapons1", "weapons2", "weapons3"].reduce(
          (n, id) =>
            n + (c.tech.includes(id) ? (id === "weapons1" ? 0.15 : 0.2) : 0),
          0,
        )
      : 0);
  const intel = c.intel[p.controller];
  const air = airSupport(w, a.country, province);
  const plan = w.plans.find((p) => p.active && p.armies.includes(a.id));
  const support =
    1 +
    (attacking && a.support.includes("artillery") ? 0.18 : 0) +
    (!attacking && a.support.includes("engineers") ? 0.15 : 0) +
    (attacking && a.support.includes("recon") ? 0.08 : 0) +
    (!attacking && c.cabinet.military === "defender" ? 0.1 : 0) +
    (attacking && plan ? plan.preparation * 0.003 : 0);
  return (
    (attacking ? d.attack : d.defense) *
    (a.strength / 100) *
    (0.2 + (0.8 * a.organization) / 100) *
    (0.35 + 0.65 * a.supply) *
    (0.6 + (0.4 * a.morale) / 100) *
    terrainFactor *
    (a.country === w.player
      ? { easy: 1.5, normal: 1, hard: 0.85 }[w.difficulty]
      : 1) *
    support *
    tech *
    (1 +
      a.experience * 0.003 +
      (c.advisor === "army" ? 0.1 : 0) +
      (general
        ? general.skill * 0.04 +
          (general.trait === (attacking ? "attack" : "defense") ? 0.12 : 0)
        : 0)) *
    (1 +
      air +
      (intel && intel.expires > w.day && intel.level >= 80 ? 0.12 : 0)) *
    (d.fuel && c.stock.fuel <= 0 ? 0.4 : 1) *
    (attacking
      ? geo.river
        ? a.support.includes("engineers")
          ? 0.9
          : 0.8
        : 1
      : 1 + p.buildings.fort * 0.15 + a.entrenchment * 0.003)
  );
}
function casualty(
  w: World,
  a: Army,
  strength: number,
  org: number,
  combat = true,
  elapsedDays = 1,
  engagements = 1,
) {
  const actual = Math.min(a.strength, strength);
  a.strength = clamp(a.strength - actual);
  a.organization = clamp(a.organization - org);
  a.morale = clamp(a.morale - org * 0.25);
  if (combat)
    a.experience = clamp(a.experience + 0.3 * elapsedDays * engagements);
  const c = w.countries[a.country];
  c.casualties += (UNITS[a.type].men * actual) / 100;
  if (a.support.includes("hospital"))
    c.manpower += ((UNITS[a.type].men * actual) / 100) * 0.2;
  c.exhaustion = clamp(c.exhaustion + actual * 0.015);
  const g = c.generals.find((g) => g.id === a.general);
  if (combat && g)
    for (let engagement = 0; engagement < engagements; engagement++) {
      g.xp = clamp(g.xp + 0.5 * elapsedDays, 0, 50);
      if (g.xp >= 50 && g.skill < 6) {
        g.xp -= 50;
        g.skill++;
      }
    }
}
/** Select every retreat before moving any division, so one escape cannot block another. */
function retreatDestination(w: World, a: Army) {
  const exits = GEOGRAPHY[a.province].neighbors.filter(
    (e) =>
      !e.sea &&
      friendly(w, a.country, w.provinces[e.id].controller) &&
      !w.armies.some(
        (enemy) =>
          enemy.strength > 0 &&
          enemy.province === e.id &&
          atWar(w, a.country, enemy.country),
      ),
  );
  exits.sort(
    (l, r) =>
      localSupply(w, a.country, r.id) - localSupply(w, a.country, l.id) ||
      compareIds(l.id, r.id),
  );
  return exits[0]?.id;
}
function retreat(w: World, a: Army, destination: string | undefined) {
  if (destination) {
    a.province = destination;
    a.organization = Math.max(12, a.organization);
    a.move = null;
    a.route = [];
    a.entrenchment = 0;
  } else {
    w.countries[a.country].casualties += (UNITS[a.type].men * a.strength) / 100;
    a.strength = 0;
  }
  delete a.marchGroup;
}
export function inLandContact(w: World, a: Army) {
  const to = a.move?.to ?? a.route[0];
  return (
    !!to &&
    a.move?.kind !== "paradrop" &&
    atWar(w, a.country, w.provinces[to].controller) &&
    GEOGRAPHY[a.province].neighbors.some((e) => e.id === to && !e.sea)
  );
}
const compareIds = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Fixed simulation rates are expressed per day; one hour passes 1 / 24. */
export function resolveLandStep(w: World, elapsedDays = 1) {
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0 || elapsedDays > 1)
    throw new Error("Kara simülasyon adımı 0–1 gün arasında olmalı.");
  if (elapsedDays === 0) return;
  const orderedArmies = [...w.armies].sort((a, b) => compareIds(a.id, b.id));
  if (!orderedArmies.length) {
    w.battles = [];
    resolveCapitulations(w);
    return;
  }
  const troopCounts = new Map<string, Map<string, number>>();
  for (const army of orderedArmies) {
    const counts = troopCounts.get(army.province) ?? new Map<string, number>();
    counts.set(army.country, (counts.get(army.country) ?? 0) + 1);
    troopCounts.set(army.province, counts);
  }
  const networks = new Map<string, Set<string>>();
  // Positions and infrastructure do not change during the readiness pass.
  // Stacked divisions share its supply calculation, but retain their own
  // general, support and cabinet modifiers. Discard before resolving movement.
  const supplies = new Map<string, Map<string, number>>();
  const supplyAt = (country: string, province: string) => {
    let values = supplies.get(country);
    if (!values) supplies.set(country, (values = new Map()));
    if (!values.has(province)) {
      if (!networks.has(country))
        networks.set(country, supplyNetwork(w, country));
      values.set(
        province,
        localSupply(
          w,
          country,
          province,
          networks.get(country)!,
          [...(troopCounts.get(province) ?? [])].reduce(
            (total, [owner, count]) =>
              total + (friendly(w, country, owner) ? count : 0),
            0,
          ),
        ),
      );
    }
    return values.get(province)!;
  };
  const previousBattles = w.battles;
  const planGroups = new Map<string, string>();
  // A completed objective can deactivate its plan while other formations are
  // still en route. Keep their issued legs together; stop/delete clears orders,
  // and a replacement manual order removes that unit's plan membership.
  for (const plan of w.plans)
    for (const id of plan.armies) planGroups.set(id, plan.id);
  const marchKey = (a: Army) => {
    const group = a.marchGroup
      ? `order:${a.marchGroup}`
      : `plan:${planGroups.get(a.id) ?? ""}`;
    return a.move &&
      a.move.kind !== "paradrop" &&
      (a.marchGroup || planGroups.has(a.id))
      ? `${a.country}:${group}:${a.province}:${a.move.to}`
      : null;
  };
  const marchStarts = new Map<string, number>();
  const pendingMarches: Army[] = [];
  const occupants = new Map<string, Set<string>>();
  for (const a of orderedArmies) {
    if (a.strength <= 0) continue;
    if (!occupants.has(a.province)) occupants.set(a.province, new Set());
    occupants.get(a.province)!.add(a.country);
  }
  const engagements = orderedArmies.filter(
    (a) =>
      a.strength > 0 &&
      (inLandContact(w, a) ||
        (a.move &&
          a.move.progress >= a.move.days &&
          atWar(w, a.country, w.provinces[a.move.to].controller))) &&
      // An undefended hostile province is a march, not a battle. Treating it
      // as combat prevents recovering organization and receiving reinforcements.
      [...(occupants.get(a.move?.to ?? a.route[0]) ?? [])].some((country) =>
        atWar(w, a.country, country),
      ),
  );
  const engagedIds = new Set(engagements.map((a) => a.id));
  const attacked = new Map<string, Set<string>>();
  for (const a of engagements) {
    const to = a.move?.to ?? a.route[0];
    if (!attacked.has(to)) attacked.set(to, new Set());
    attacked.get(to)!.add(a.country);
  }
  w.battles = [];
  for (const a of orderedArmies) {
    if (a.strength <= 0) continue;
    const engaged =
      engagedIds.has(a.id) ||
      [...(attacked.get(a.province) ?? [])].some((id) =>
        atWar(w, id, a.country),
      );
    const c = w.countries[a.country],
      d = UNITS[a.type];
    a.supply = movementSupply(w, a, supplyAt(a.country, a.province));
    if (a.supply < 0.25) {
      casualty(w, a, 0.25 * elapsedDays, 2 * elapsedDays, false);
    } else if (!engaged) {
      a.organization = clamp(
        a.organization + (a.move ? 1 : 3) * a.supply * elapsedDays,
      );
      a.morale = clamp(a.morale + 0.5 * a.supply * elapsedDays);
      if (a.strength < 100 && c.manpower > 0) {
        const needs = equipmentNeeds(a);
        let fraction = Math.min(
          0.004 * a.supply * elapsedDays,
          (100 - a.strength) / 100,
          c.manpower / d.men,
        );
        for (const [key, count] of Object.entries(needs))
          fraction = Math.min(
            fraction,
            c.equipment[key as keyof typeof c.equipment] / count,
          );
        fraction = Math.max(0, fraction);
        c.manpower = Math.max(0, c.manpower - d.men * fraction);
        for (const [key, count] of Object.entries(needs))
          c.equipment[key as keyof typeof c.equipment] = Math.max(
            0,
            c.equipment[key as keyof typeof c.equipment] - count * fraction,
          );
        a.strength = clamp(a.strength + fraction * 100);
      }
    }
    if (a.strength <= 0) continue;
    if (!a.move && a.route.length) {
      const next = a.route[0],
        edge = GEOGRAPHY[a.province].neighbors.find((e) => e.id === next);
      if (
        !edge ||
        !commanderOrderAllows(w, a, next) ||
        (!friendly(w, a.country, w.provinces[next].controller) &&
          !atWar(w, a.country, w.provinces[next].controller)) ||
        (edge.sea && !seaEdgeOpen(w, a.country, a.province, next))
      )
        a.route = [];
      else {
        a.route.shift();
        a.move = {
          to: next,
          progress: 0,
          days: movementLegDays(w, a, a.province, next, edge.sea),
        };
        a.entrenchment = 0;
      }
    }
    if (a.move) {
      const controller = w.provinces[a.move.to].controller;
      const seaEdge = GEOGRAPHY[a.province].neighbors.find(
        (e) => e.id === a.move!.to,
      )?.sea;
      if (
        !commanderOrderAllows(w, a, a.move.to) ||
        (!friendly(w, a.country, controller) &&
          !atWar(w, a.country, controller)) ||
        (a.move.kind !== "paradrop" &&
          seaEdge &&
          !seaEdgeOpen(w, a.country, a.province, a.move.to))
      ) {
        a.move = null;
        a.route = [];
      } else {
        marchStarts.set(a.id, a.move.progress);
        pendingMarches.push(a);
      }
    } else a.entrenchment = clamp(a.entrenchment + 2 * elapsedDays, 0, 30);
  }
  // All motorized formations use the same remaining country fuel for this step.
  // Otherwise whichever unit happened to be visited last would suffer the shortage alone.
  const fuelCosts = new Map<string, number>();
  for (const army of pendingMarches) {
    if (army.strength <= 0 || !army.move) continue;
    const country = w.countries[army.country];
    const fuel =
      UNITS[army.type].fuel *
      (country.tech.includes("engines") ? 0.85 : 1) *
      (army.support.includes("logistics") ? 0.8 : 1) *
      elapsedDays;
    fuelCosts.set(army.country, (fuelCosts.get(army.country) ?? 0) + fuel);
  }
  for (const [country, fuel] of fuelCosts)
    w.countries[country].stock.fuel = Math.max(
      0,
      w.countries[country].stock.fuel - fuel,
    );
  for (const army of pendingMarches) {
    // Apply shortage to this step's distance, never subtract accrued progress.
    const fuelFactor =
      UNITS[army.type].fuel && w.countries[army.country].stock.fuel <= 0
        ? 0.3
        : 1;
    army.move!.progress +=
      movementProgressRate(army.supply, fuelFactor) * elapsedDays;
  }
  // A group command is one formation, not a tank departing ahead of its infantry.
  // Independent orders and formations on different legs retain their own speed.
  const marches = new Map<string, Army[]>();
  for (const a of orderedArmies) {
    const key = a.strength > 0 ? marchKey(a) : null;
    if (!key) continue;
    if (!marches.has(key)) marches.set(key, []);
    marches.get(key)!.push(a);
  }
  for (const members of marches.values()) {
    if (members.length < 2) continue;
    const pace = Math.min(
      ...members.map(
        (a) =>
          Math.max(0, a.move!.progress - marchStarts.get(a.id)!) / a.move!.days,
      ),
    );
    for (const a of members)
      a.move!.progress = marchStarts.get(a.id)! + pace * a.move!.days;
  }
  const readyMarches = new Map<string, boolean>();
  const readyToEnter = (a: Army) => {
    if (!a.move || a.move.progress < a.move.days) return false;
    const key = marchKey(a);
    if (!key) return true;
    if (!readyMarches.has(key))
      readyMarches.set(
        key,
        (marches.get(key) ?? []).every(
          (member) =>
            // A halted, destroyed or routed member no longer holds up its old group.
            member.strength <= 0 ||
            marchKey(member) !== key ||
            member.move!.progress >= member.move!.days,
        ),
      );
    return readyMarches.get(key)!;
  };
  // Read a coherent post-readiness snapshot without cloning the world: no unit,
  // commander, ownership or war-score writes occur until every front is evaluated.
  const groups = new Map<
    string,
    { country: string; to: string; armies: Army[] }
  >();
  const friendlyArrivals: Army[] = [];
  const byProvince = new Map<string, Army[]>();
  for (const army of orderedArmies) {
    if (army.strength <= 0) continue;
    const residents = byProvince.get(army.province) ?? [];
    residents.push(army);
    byProvince.set(army.province, residents);
    if (
      !army.move ||
      (army.move.progress < army.move.days && !inLandContact(w, army))
    )
      continue;
    const to = army.move.to;
    if (!atWar(w, army.country, w.provinces[to].controller)) {
      if (readyToEnter(army)) friendlyArrivals.push(army);
      continue;
    }
    const key = `${army.country}:${to}`;
    if (!groups.has(key))
      groups.set(key, { country: army.country, to, armies: [] });
    groups.get(key)!.armies.push(army);
  }
  const damage = new Map<
    string,
    {
      strength: number;
      organization: number;
      engagements: number;
      defended: boolean;
    }
  >();
  const addDamage = (
    army: Army,
    strength: number,
    organization: number,
    defended: boolean,
  ) => {
    const previous = damage.get(army.id) ?? {
      strength: 0,
      organization: 0,
      engagements: 0,
      defended: false,
    };
    previous.strength += strength;
    previous.organization += organization;
    previous.engagements++;
    previous.defended ||= defended;
    damage.set(army.id, previous);
  };
  const intents = [...groups.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([id, group]) => {
      const defenders = (byProvince.get(group.to) ?? []).filter((army) =>
        atWar(w, group.country, army.country),
      );
      const powers = new Map(
        group.armies.map((army) => [
          army.id,
          combatPower(w, army, true, group.to),
        ]),
      );
      const attack = group.armies.reduce(
        (sum, army) => sum + powers.get(army.id)!,
        0,
      );
      const defense = defenders.reduce(
        (sum, army) => sum + combatPower(w, army, false, group.to),
        0,
      );
      const defender = w.provinces[group.to].controller;
      const attackLoss =
        clamp((defense / Math.max(1, attack)) * 1.3, 0.15, 6) * elapsedDays;
      const defenseLoss =
        clamp((attack / Math.max(1, defense)) * 1.5, 0.15, 7) * elapsedDays;
      if (defenders.length) {
        w.battles.push({
          id,
          province: group.to,
          attacker: group.country,
          defender,
          started:
            previousBattles.find((battle) => battle.id === id)?.started ??
            w.day + (w.hour ?? 0) / 24,
          attack,
          defense,
        });
        for (const army of group.armies)
          addDamage(army, attackLoss, attackLoss * 2.8, false);
        for (const army of defenders)
          addDamage(army, defenseLoss, defenseLoss * 3, true);
      }
      return { ...group, defender, defenders, powers, attackLoss, defenseLoss };
    });
  // A division fighting on several fronts takes their summed damage, capped by
  // its actual remaining strength. A lethal hit cannot erase its already-planned fire.
  for (const army of orderedArmies) {
    const loss = damage.get(army.id);
    if (loss)
      casualty(
        w,
        army,
        loss.strength,
        loss.organization,
        true,
        elapsedDays,
        loss.engagements,
      );
  }
  for (const intent of intents) {
    if (!intent.defenders.length) continue;
    addWarScore(
      w,
      intent.country,
      intent.defender,
      intent.defenseLoss * intent.defenders.length,
    );
    addWarScore(
      w,
      intent.defender,
      intent.country,
      intent.attackLoss * intent.armies.length,
    );
    const exhausted = intent.armies.filter(
      (army) => army.organization < 8 || army.strength < 15,
    );
    for (const army of exhausted) {
      army.move = null;
      army.route = [];
      delete army.marchGroup;
    }
    const stopped = exhausted.filter((army) => army.strength > 0).length;
    if (stopped && intent.country === w.player)
      event(
        w,
        `${GEOGRAPHY[intent.to].name} taarruzunda ${stopped} tümen, düşük organizasyon veya ağır kayıplar nedeniyle durdu. Dinlenip takviye aldıktan sonra yeniden emir ver.`,
        "war",
      );
  }
  const retreats = orderedArmies
    .filter(
      (army) =>
        army.strength > 0 &&
        damage.get(army.id)?.defended &&
        (army.organization < 10 || army.strength < 15),
    )
    .map((army) => ({ army, destination: retreatDestination(w, army) }));
  for (const { army, destination } of retreats) retreat(w, army, destination);
  readyMarches.clear();
  const claims = new Map<
    string,
    { country: string; defender: string; armies: Army[]; power: number }[]
  >();
  for (const intent of intents) {
    if (
      orderedArmies.some(
        (army) =>
          army.province === intent.to &&
          army.strength > 0 &&
          atWar(w, intent.country, army.country),
      )
    )
      continue;
    const arrivals = intent.armies.filter(
      (army) =>
        army.strength > 0 && army.move?.to === intent.to && readyToEnter(army),
    );
    if (!arrivals.length) continue;
    const candidates = claims.get(intent.to) ?? [];
    candidates.push({
      country: intent.country,
      defender: intent.defender,
      armies: arrivals,
      power: arrivals.reduce(
        (sum, army) => sum + intent.powers.get(army.id)!,
        0,
      ),
    });
    claims.set(intent.to, candidates);
  }
  // Simultaneous claims use surviving arriving force, then stable country IDs.
  // A tie must finish rather than leave equal armies stalled outside an empty city.
  const captures = [...claims.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .flatMap(([to, candidates]) => {
      candidates.sort(
        (left, right) =>
          right.power - left.power || compareIds(left.country, right.country),
      );
      return [{ to, ...candidates[0] }];
    });
  for (const capture of captures) {
    const province = w.provinces[capture.to];
    addWarScore(
      w,
      capture.country,
      capture.defender,
      GEOGRAPHY[capture.to].vp * 2,
    );
    province.controller = capture.country;
    province.resistance = province.owner === capture.country ? 0 : 20;
    province.compliance = 0;
    province.damage = clamp(province.damage + 10);
    for (const army of capture.armies) {
      army.province = capture.to;
      army.move = null;
    }
    if (capture.country === w.player || capture.defender === w.player)
      event(
        w,
        `${GEOGRAPHY[capture.to].name}, ${w.countries[capture.country].name} kontrolüne geçti.`,
        "war",
      );
  }
  // Friendly arrivals and allied participants see the final ownership update;
  // they never enter a province another enemy has captured in the same step.
  for (const army of [
    ...friendlyArrivals,
    ...intents.flatMap((intent) => intent.armies),
  ]) {
    if (army.strength <= 0 || !army.move || !readyToEnter(army)) continue;
    const controller = w.provinces[army.move.to].controller;
    if (friendly(w, army.country, controller)) {
      army.province = army.move.to;
      army.move = null;
    } else if (!atWar(w, army.country, controller)) {
      army.move = null;
      army.route = [];
      delete army.marchGroup;
    }
  }
  w.armies = w.armies.filter((a) => a.strength > 0);
  for (const a of w.armies) if (!a.move && !a.route.length) delete a.marchGroup;
  resolveCapitulations(w);
}

export function resolveLandDay(w: World) {
  resolveLandStep(w, 1);
}

function resolveCapitulations(w: World) {
  const candidates = Object.values(w.countries)
    .filter(
      (country) =>
        !country.capitulated &&
        country.wars.length &&
        surrender(w, country.id) >= 80,
    )
    .sort((left, right) => compareIds(left.id, right.id));
  for (const c of candidates) {
    const occupied = Object.values(w.provinces).filter(
      (p) => p.owner === c.id && atWar(w, c.id, p.controller),
    );
    const scores: Record<string, number> = {};
    for (const p of occupied)
      scores[p.controller] = (scores[p.controller] ?? 0) + GEOGRAPHY[p.id].vp;
    const victor = Object.keys(scores).sort(
      (a, b) => scores[b] - scores[a] || compareIds(a, b),
    )[0];
    if (!victor) continue;
    c.capitulated = true;
    c.victor = victor;
    w.armies = w.armies.filter((a) => a.country !== c.id);
    for (const p of Object.values(w.provinces))
      if (p.owner === c.id && p.controller === c.id) {
        p.controller = victor;
        p.resistance = 25;
      }
    openConference(w, c.id);
    event(
      w,
      `${c.name} teslim oldu. ${w.countries[victor].name} barış koşullarını belirleyebilir.`,
      "war",
    );
  }
}
