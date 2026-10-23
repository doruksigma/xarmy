import { airSupport } from "./airnaval";
import { addWarScore, openConference } from "./conference";
import { equipmentNeeds } from "./planning";
import { seaEdgeOpen } from "./military-assets";
import { TERRAINS, UNITS } from "./catalog";
import {
  addArmy,
  atWar,
  clamp,
  event,
  friendly,
  GEOGRAPHY,
  localSupply,
  seaOpen,
  supplyNetwork,
  surrender,
  uid,
} from "./world";
import type { Army, World } from "./types";

export function routeTo(
  w: World,
  army: Army,
  to: string,
  from = army.province,
): string[] | null {
  if (from === to) return [];
  const previous: Record<string, string> = {};
  const seen = new Set([from]),
    queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const edge of GEOGRAPHY[queue[i]].neighbors) {
      if (
        seen.has(edge.id) ||
        (edge.sea && !seaEdgeOpen(w, army.country, queue[i], edge.id))
      )
        continue;
      const controller = w.provinces[edge.id].controller;
      if (
        !friendly(w, army.country, controller) &&
        !atWar(w, army.country, controller)
      )
        continue;
      // A route may end in hostile territory, but cannot plan through uncaptured enemy land.
      if (atWar(w, army.country, controller) && edge.id !== to) continue;
      seen.add(edge.id);
      previous[edge.id] = queue[i];
      if (edge.id === to) {
        const path = [to];
        while (previous[path[0]] !== from) path.unshift(previous[path[0]]);
        return path;
      }
      queue.push(edge.id);
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
function casualty(w: World, a: Army, strength: number, org: number) {
  const actual = Math.min(a.strength, strength);
  a.strength = clamp(a.strength - actual);
  a.organization = clamp(a.organization - org);
  a.morale = clamp(a.morale - org * 0.25);
  a.experience = clamp(a.experience + 0.3);
  const c = w.countries[a.country];
  c.casualties += Math.round((UNITS[a.type].men * actual) / 100);
  if (a.support.includes("hospital"))
    c.manpower += Math.round(((UNITS[a.type].men * actual) / 100) * 0.2);
  c.exhaustion = clamp(c.exhaustion + actual * 0.015);
  const g = c.generals.find((g) => g.id === a.general);
  if (g) {
    g.xp = clamp(g.xp + 0.5, 0, 50);
    if (g.xp >= 50 && g.skill < 6) {
      g.xp -= 50;
      g.skill++;
    }
  }
}
function retreat(w: World, a: Army) {
  const exits = GEOGRAPHY[a.province].neighbors.filter(
    (e) =>
      !e.sea &&
      friendly(w, a.country, w.provinces[e.id].controller) &&
      !w.armies.some(
        (enemy) =>
          enemy.province === e.id && atWar(w, a.country, enemy.country),
      ),
  );
  exits.sort(
    (l, r) => localSupply(w, a.country, r.id) - localSupply(w, a.country, l.id),
  );
  if (exits[0]) {
    a.province = exits[0].id;
    a.organization = Math.max(12, a.organization);
    a.move = null;
    a.route = [];
    a.entrenchment = 0;
  } else {
    w.countries[a.country].casualties += Math.round(
      (UNITS[a.type].men * a.strength) / 100,
    );
    a.strength = 0;
  }
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
export function resolveLandDay(w: World) {
  const networks = Object.fromEntries(
    Object.keys(w.countries).map((c) => [c, supplyNetwork(w, c)]),
  );
  // Positions and infrastructure do not change during the readiness pass.
  // Stacked divisions share its supply calculation, but retain their own
  // general, support and cabinet modifiers. Discard before resolving movement.
  const supplies = new Map<string, Map<string, number>>();
  const supplyAt = (country: string, province: string) => {
    let values = supplies.get(country);
    if (!values) supplies.set(country, (values = new Map()));
    if (!values.has(province))
      values.set(province, localSupply(w, country, province, networks[country]));
    return values.get(province)!;
  };
  const previousBattles = w.battles;
  const engagements = w.armies.filter(
    (a) =>
      a.strength > 0 &&
      (inLandContact(w, a) ||
        (a.move &&
          a.move.progress >= a.move.days &&
          atWar(w, a.country, w.provinces[a.move.to].controller))),
  );
  const engagedIds = new Set(engagements.map((a) => a.id));
  const attacked = new Map<string, Set<string>>();
  for (const a of engagements) {
    const to = a.move?.to ?? a.route[0];
    if (!attacked.has(to)) attacked.set(to, new Set());
    attacked.get(to)!.add(a.country);
  }
  w.battles = [];
  for (const a of w.armies) {
    if (a.strength <= 0) continue;
    const engaged =
      engagedIds.has(a.id) ||
      [...(attacked.get(a.province) ?? [])].some((id) =>
        atWar(w, id, a.country),
      );
    const c = w.countries[a.country],
      d = UNITS[a.type];
    const general = c.generals.find((g) => g.id === a.general);
    a.supply = clamp(
      supplyAt(a.country, a.province) *
        (general?.trait === "logistics" ? 1.15 : 1) *
        (a.support.includes("logistics") ? 1.2 : 1) *
        (c.cabinet.military === "quartermaster" ? 1.1 : 1),
      0,
      1,
    );
    if (a.supply < 0.25) {
      casualty(w, a, 0.25, 2);
      a.move && (a.move.progress = Math.max(0, a.move.progress - 0.1));
    } else if (!engaged) {
      a.organization = clamp(a.organization + (a.move ? 1 : 3) * a.supply);
      a.morale = clamp(a.morale + 0.5 * a.supply);
      if (a.strength < 100 && c.manpower > 0) {
        const needs = equipmentNeeds(a);
        let fraction = Math.min(
          0.004 * a.supply,
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
    if (d.fuel && a.move)
      c.stock.fuel = Math.max(
        0,
        c.stock.fuel -
          d.fuel *
            (c.tech.includes("engines") ? 0.85 : 1) *
            (a.support.includes("logistics") ? 0.8 : 1),
      );
    if (!a.move && a.route.length) {
      const next = a.route[0],
        edge = GEOGRAPHY[a.province].neighbors.find((e) => e.id === next);
      if (
        !edge ||
        (!friendly(w, a.country, w.provinces[next].controller) &&
          !atWar(w, a.country, w.provinces[next].controller)) ||
        (edge.sea && !seaEdgeOpen(w, a.country, a.province, next))
      )
        a.route = [];
      else {
        a.route.shift();
        const distance = Math.hypot(
          GEOGRAPHY[next].x - GEOGRAPHY[a.province].x,
          GEOGRAPHY[next].y - GEOGRAPHY[a.province].y,
        );
        a.move = {
          to: next,
          progress: 0,
          days:
            Math.max(2, distance / 18) /
            (d.speed *
              (a.support.includes("recon") ? 1.1 : 1) *
              TERRAINS[GEOGRAPHY[next].terrain].speed *
              (edge.sea ? 0.5 : 1) *
              (d.fuel && c.tech.includes("engines") ? 1.2 : 1)),
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
        (!friendly(w, a.country, controller) &&
          !atWar(w, a.country, controller)) ||
        (a.move.kind !== "paradrop" &&
          seaEdge &&
          !seaEdgeOpen(w, a.country, a.province, a.move.to))
      ) {
        a.move = null;
        a.route = [];
      } else
        a.move.progress +=
          Math.max(0.15, a.supply) * (d.fuel && c.stock.fuel <= 0 ? 0.3 : 1);
    } else a.entrenchment = clamp(a.entrenchment + 2, 0, 30);
  }
  // Resolve one battle per attacking country and destination, with all forces together.
  // Apply casualties to the same world transaction; simultaneous battles cannot overwrite each other.
  const groups = new Map<string, { to: string; armies: Army[] }>();
  for (const a of w.armies.filter(
    (a) =>
      a.strength > 0 &&
      a.move &&
      (a.move.progress >= a.move.days || inLandContact(w, a)),
  )) {
    const to = a.move!.to;
    if (!atWar(w, a.country, w.provinces[to].controller)) {
      a.province = to;
      a.move = null;
      continue;
    }
    const key = `${a.country}:${to}`;
    if (!groups.has(key)) groups.set(key, { to, armies: [] });
    groups.get(key)!.armies.push(a);
  }
  for (const { to, armies } of groups.values()) {
    // An earlier battle may have killed or routed members of this group.
    const attackers = armies.filter((a) => a.strength > 0 && a.move?.to === to);
    const first = attackers[0];
    if (!first) continue;
    const p = w.provinces[to],
      defender = p.controller;
    // Another country may already have captured this destination today.
    if (!atWar(w, first.country, defender)) {
      for (const a of attackers) {
        if (!friendly(w, a.country, defender)) {
          a.move = null;
          a.route = [];
        } else if (a.move!.progress >= a.move!.days) {
          a.province = to;
          a.move = null;
        }
      }
      continue;
    }
    const defenders = w.armies.filter(
      (a) =>
        a.province === to &&
        a.strength > 0 &&
        atWar(w, first.country, a.country),
    );
    const attack = attackers.reduce(
        (n, a) => n + combatPower(w, a, true, to),
        0,
      ),
      defense = defenders.reduce((n, a) => n + combatPower(w, a, false, to), 0);
    if (defenders.length) {
      w.battles.push({
        id: `${first.country}:${to}`,
        province: to,
        attacker: first.country,
        defender,
        started:
          previousBattles.find((b) => b.id === `${first.country}:${to}`)
            ?.started ?? w.day,
        attack,
        defense,
      });
      const attackLoss = clamp((defense / Math.max(1, attack)) * 1.3, 0.15, 6),
        defenseLoss = clamp((attack / Math.max(1, defense)) * 1.5, 0.15, 7);
      addWarScore(w, first.country, defender, defenseLoss * defenders.length);
      addWarScore(w, defender, first.country, attackLoss * attackers.length);
      attackers.forEach((a) => casualty(w, a, attackLoss, attackLoss * 2.8));
      defenders.forEach((a) => casualty(w, a, defenseLoss, defenseLoss * 3));
      for (const a of attackers)
        if (a.organization < 8 || a.strength < 15) {
          a.move = null;
          a.route = [];
        }
      for (const a of defenders)
        if (a.organization < 10 || a.strength < 15) retreat(w, a);
    }
    if (
      !w.armies.some(
        (a) =>
          a.province === to &&
          a.strength > 0 &&
          atWar(w, first.country, a.country),
      ) &&
      attackers.some(
        (a) => a.move && a.move.progress >= a.move.days && a.strength > 15,
      )
    ) {
      addWarScore(w, first.country, defender, GEOGRAPHY[to].vp * 2);
      p.controller = first.country;
      p.resistance = p.owner === first.country ? 0 : 20;
      p.compliance = 0;
      p.damage = clamp(p.damage + 10);
      for (const a of attackers)
        if (a.move && a.move.progress >= a.move.days && a.strength > 0) {
          a.province = to;
          a.move = null;
        }
      if (first.country === w.player || defender === w.player)
        event(
          w,
          `${GEOGRAPHY[to].name}, ${w.countries[first.country].name} kontrolüne geçti.`,
          "war",
        );
    }
  }
  w.armies = w.armies.filter((a) => a.strength > 0);
  for (const c of Object.values(w.countries))
    if (!c.capitulated && c.wars.length && surrender(w, c.id) >= 80) {
      const occupied = Object.values(w.provinces).filter(
        (p) => p.owner === c.id && atWar(w, c.id, p.controller),
      );
      const scores: Record<string, number> = {};
      for (const p of occupied)
        scores[p.controller] = (scores[p.controller] ?? 0) + GEOGRAPHY[p.id].vp;
      const victor = Object.keys(scores).sort(
        (a, b) => scores[b] - scores[a],
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
