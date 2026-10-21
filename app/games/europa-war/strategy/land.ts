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
  const sea = seaOpen(w, army.country);
  for (let i = 0; i < queue.length; i++)
    for (const edge of GEOGRAPHY[queue[i]].neighbors) {
      if (seen.has(edge.id) || (edge.sea && !sea)) continue;
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
  const air =
    c.air.mission === "support" &&
    c.air.target === p.controller &&
    c.stock.fuel > 0
      ? Math.min(0.25, c.equipment.bomber * 0.005) *
        (c.tech.includes("airDoctrine") ? 1.2 : 1)
      : 0;
  return (
    (attacking ? d.attack : d.defense) *
    (a.strength / 100) *
    (0.2 + (0.8 * a.organization) / 100) *
    (0.35 + 0.65 * a.supply) *
    (0.6 + (0.4 * a.morale) / 100) *
    terrainFactor *
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
        ? 0.8
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
export function resolveLandDay(w: World) {
  const networks = Object.fromEntries(
    Object.keys(w.countries).map((c) => [c, supplyNetwork(w, c)]),
  );
  w.battles = [];
  for (const a of w.armies) {
    const c = w.countries[a.country],
      d = UNITS[a.type];
    const general = c.generals.find((g) => g.id === a.general);
    a.supply = clamp(
      localSupply(w, a.country, a.province, networks[a.country]) *
        (general?.trait === "logistics" ? 1.15 : 1),
      0,
      1,
    );
    if (a.supply < 0.25) {
      casualty(w, a, 0.25, 2);
      a.move && (a.move.progress = Math.max(0, a.move.progress - 0.1));
    } else {
      a.organization = clamp(a.organization + (a.move ? 1 : 3) * a.supply);
      a.morale = clamp(a.morale + 0.5 * a.supply);
      if (a.strength < 100 && c.manpower > 0 && c.equipment.rifle > 0) {
        const men = Math.min(
          c.manpower,
          d.men * 0.004,
          ((100 - a.strength) / 100) * d.men,
          c.equipment.rifle * 100,
        );
        c.manpower = Math.max(0, c.manpower - men);
        c.equipment.rifle = Math.max(0, c.equipment.rifle - men / 100);
        a.strength += (100 * men) / d.men;
      }
    }
    if (d.fuel && a.move)
      c.stock.fuel = Math.max(
        0,
        c.stock.fuel - d.fuel * (c.tech.includes("engines") ? 0.85 : 1),
      );
    if (!a.move && a.route.length) {
      const next = a.route[0],
        edge = GEOGRAPHY[a.province].neighbors.find((e) => e.id === next);
      if (
        !edge ||
        (!friendly(w, a.country, w.provinces[next].controller) &&
          !atWar(w, a.country, w.provinces[next].controller)) ||
        (edge.sea && !seaOpen(w, a.country))
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
        (seaEdge && !seaOpen(w, a.country))
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
  const groups = new Map<string, Army[]>();
  for (const a of w.armies.filter(
    (a) => a.strength > 0 && a.move && a.move.progress >= a.move.days,
  )) {
    const to = a.move!.to;
    if (!atWar(w, a.country, w.provinces[to].controller)) {
      a.province = to;
      a.move = null;
      continue;
    }
    const key = `${a.country}:${to}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const attackers of groups.values()) {
    const first = attackers[0];
    if (!first.move) continue;
    const to = first.move.to,
      p = w.provinces[to],
      defender = p.controller;
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
        started: w.day,
        attack,
        defense,
      });
      const attackLoss = clamp((defense / Math.max(1, attack)) * 1.3, 0.15, 6),
        defenseLoss = clamp((attack / Math.max(1, defense)) * 1.5, 0.15, 7);
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
      attackers.some((a) => a.move && a.strength > 15)
    ) {
      p.controller = first.country;
      p.resistance = p.owner === first.country ? 0 : 20;
      p.compliance = 0;
      p.damage = clamp(p.damage + 10);
      for (const a of attackers)
        if (a.move && a.strength > 0) {
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
      event(
        w,
        `${c.name} teslim oldu. ${w.countries[victor].name} barış koşullarını belirleyebilir.`,
        "war",
      );
    }
}
