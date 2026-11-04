import { COMMANDER_CAPACITY } from "./commander-roster";
import { createCommand, executeCommandInPlace } from "./commands";
import { UNITS } from "./catalog";
import { mapDistance } from "./geography-distance";
import { combatPower } from "./land";
import { tacticalAccess } from "./ai-access";
import {
  atWar,
  controlled,
  friendly,
  GEOGRAPHY,
  localSupply,
  supplyNetwork,
} from "./world";
import type { Action, Army, World } from "./types";

type Submit = (action: Action) => boolean;
const destination = (army: Army) =>
  army.route.at(-1) ?? army.move?.to ?? army.province;
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Reserve an actual division, never a synthetic defense bonus. Moving orders
 * and commander/front plans are detached through the same commands as a player.
 * Battle retreats and occupation remain the responsibility of the land engine. */
function reserveCapital(
  w: World,
  id: string,
  own: Army[],
  submit: Submit,
  access: ReturnType<typeof tacticalAccess>,
): string | undefined {
  const capital = w.countries[id].capital;
  if (w.provinces[capital]?.controller !== id) return;
  const planned = (a: Army) =>
    w.fronts.some((f) => f.armies.includes(a.id)) ||
    w.plans.some((p) => p.armies.includes(a.id)) ||
    w.countries[id].generals.some((g) => g.id === a.general && g.front);
  const stationed = own
    .filter((a) => a.province === capital)
    .sort(
      (a, b) =>
        Number(Boolean(a.move || a.route.length)) -
          Number(Boolean(b.move || b.route.length)) ||
        Number(b.type === "infantry") - Number(a.type === "infantry") ||
        b.strength - a.strength ||
        compareIds(a.id, b.id),
    )[0];
  if (stationed) {
    if (
      stationed.move ||
      stationed.route.length ||
      stationed.stance !== "hold" ||
      planned(stationed)
    )
      submit({ type: "halt", army: stationed.id });
    return stationed.id;
  }
  // Retain a valid incoming guard; repeatedly choosing a nearer new reserve
  // would otherwise leave the capital permanently waiting for its protection.
  const candidates = [...own].sort(
    (a, b) =>
      Number(destination(b) === capital) - Number(destination(a) === capital) ||
      mapDistance(GEOGRAPHY[a.province], GEOGRAPHY[capital]) -
        mapDistance(GEOGRAPHY[b.province], GEOGRAPHY[capital]) ||
      compareIds(a.id, b.id),
  );
  for (const army of candidates) {
    if (!access.canReach(army.province, capital)) continue;
    if (
      destination(army) === capital &&
      army.stance === "hold" &&
      !planned(army)
    )
      return army.id;
    if (submit({ type: "move", army: army.id, to: capital, stance: "hold" }))
      return army.id;
  }
  // No reachable survivor: train a replacement from actual national stocks.
  // One queued guard is sufficient even when the next tactical tick is soon.
  const c = w.countries[id];
  if (
    w.provinces[capital].owner === id &&
    !c.recruitment.some((r) => r.province === capital) &&
    c.recruitment.length < 6 &&
    c.manpower >= UNITS.infantry.men &&
    c.equipment.rifle >= UNITS.infantry.equipment.rifle!
  )
    submit({ type: "recruit", unit: "infantry", province: capital });
}

/** Plan one country's local war from a bounded snapshot. This function never
 * manages the player's divisions, including when their assistants are enabled. */
export function runCountryTactics(
  w: World,
  countryId: string,
  assignCommanders = false,
) {
  let c = w.countries[countryId];
  if (!c || countryId === w.player || c.capitulated) return;
  const lands = controlled(w, countryId);
  if (!lands.length) return;
  const submit: Submit = (action) => {
    const result = executeCommandInPlace(
      w,
      createCommand(w, action, countryId),
      countryId,
    );
    c = w.countries[countryId];
    return result.status === "applied" || result.status === "duplicate";
  };
  const indices = new Map<string, number>();
  const own: Army[] = [];
  const commanderCounts = new Map<string, number>();
  for (const [index, a] of w.armies.entries()) {
    if (a.country !== countryId || a.strength <= 0) continue;
    own.push(a);
    indices.set(a.id, index);
  }
  const access = tacticalAccess(w, countryId);
  const guard = reserveCapital(w, countryId, own, submit, access);
  for (const index of indices.values()) {
    const general = w.armies[index].general;
    if (general)
      commanderCounts.set(general, (commanderCounts.get(general) ?? 0) + 1);
  }
  if (assignCommanders)
    for (const [armyId, index] of indices) {
      const a = w.armies[index];
      if (a.general || ((a.move || a.route.length) && armyId !== guard))
        continue;
      const preferred = c.generals[a.type === "infantry" ? 0 : 1];
      const availableFor = (id: string) =>
        (commanderCounts.get(id) ?? 0) < COMMANDER_CAPACITY &&
        (armyId !== guard || !c.generals.find((g) => g.id === id)?.front);
      let available =
        preferred && availableFor(preferred.id)
          ? preferred.id
          : c.generals.find((g) => availableFor(g.id))?.id;
      if (!available && submit({ type: "commanderCreate" }))
        available = c.generals.at(-1)?.id;
      if (
        available &&
        submit({ type: "general", army: armyId, general: available })
      )
        commanderCounts.set(
          available,
          (commanderCounts.get(available) ?? 0) + 1,
        );
    }
  if (!c.wars.length) return;

  // Rebuild once after commands, because copy-on-write publication replaces
  // army objects. All further decisions share local force and supply caches.
  const byProvince = new Map<string, Army[]>();
  const projected = new Map<string, number>();
  for (const a of w.armies) {
    if (a.strength <= 0) continue;
    const at = byProvince.get(a.province);
    if (at) at.push(a);
    else byProvince.set(a.province, [a]);
    if (a.country === countryId) {
      const to = destination(a);
      projected.set(to, (projected.get(to) ?? 0) + 1);
    }
  }
  let network: Set<string> | undefined;
  const supplies = new Map<string, number>();
  const supplyAt = (province: string) => {
    network ??= supplyNetwork(w, countryId);
    if (!supplies.has(province))
      supplies.set(province, localSupply(w, countryId, province, network));
    return supplies.get(province)!;
  };
  const defenses = new Map<string, number>();
  const defenseAt = (province: string) => {
    if (!defenses.has(province))
      defenses.set(
        province,
        (byProvince.get(province) ?? [])
          .filter((a) => atWar(w, countryId, a.country))
          .reduce((sum, a) => sum + combatPower(w, a, false, province), 0),
      );
    return defenses.get(province)!;
  };
  const movements = new Map<
    string,
    { armies: string[]; to: string; stance: "hold" | "advance" }
  >();
  const ordered = new Set<string>(guard ? [guard] : []);
  const queueMove = (
    a: Army,
    to: string,
    stance: "hold" | "advance" = "advance",
  ) => {
    if (ordered.has(a.id)) return;
    ordered.add(a.id);
    const key = `${a.province}:${to}:${stance}`;
    const group = movements.get(key);
    if (group) group.armies.push(a.id);
    else movements.set(key, { armies: [a.id], to, stance });
    projected.set(
      a.province,
      Math.max(0, (projected.get(a.province) ?? 0) - 1),
    );
    projected.set(to, (projected.get(to) ?? 0) + 1);
  };
  const candidates = new Map<string, Army[]>();
  const reserves: Army[] = [];
  for (const index of indices.values()) {
    const a = w.armies[index];
    if (ordered.has(a.id) || a.move || a.route.length) continue;
    const adjacent = GEOGRAPHY[a.province].neighbors.filter(
      (e) =>
        !e.sea || (a.organization >= 70 && access.seaOpen(a.province, e.id)),
    );
    const enemies = adjacent.filter((e) =>
      atWar(w, countryId, w.provinces[e.id].controller),
    );
    if (a.organization < 30 || a.supply < 0.35 || a.strength < 35) {
      const rear = adjacent
        .filter(
          (e) =>
            friendly(w, countryId, w.provinces[e.id].controller) &&
            defenseAt(e.id) === 0,
        )
        .sort(
          (l, r) => supplyAt(r.id) - supplyAt(l.id) || compareIds(l.id, r.id),
        );
      if (
        rear[0] &&
        (enemies.length || (a.supply < 0.35 && supplyAt(rear[0].id) > a.supply))
      )
        queueMove(a, rear[0].id, "hold");
      continue;
    }
    if (!enemies.length) reserves.push(a);
    for (const e of enemies) {
      const members = candidates.get(e.id);
      if (members) members.push(a);
      else candidates.set(e.id, [a]);
    }
  }

  // Concentrate available neighboring formations on weak, valuable targets.
  // An individual infantry division need not beat an entire defending stack.
  const threshold = (to: string) =>
    w.difficulty === "easy" && w.provinces[to].controller === w.player
      ? 1.4
      : w.difficulty === "hard"
        ? 1.05
        : 1.2;
  const targets = [...candidates]
    .map(([to, armies]) => {
      const attack = armies.reduce(
        (sum, a) => sum + combatPower(w, a, true, to),
        0,
      );
      const defense = Math.max(1, defenseAt(to));
      const province = w.provinces[to];
      const value =
        GEOGRAPHY[to].vp +
        province.buildings.hub * 2 +
        (w.countries[province.controller]?.capital === to ? 12 : 0);
      return {
        to,
        armies,
        score: Math.min(6, attack / defense) * Math.max(1, value),
      };
    })
    .sort((a, b) => b.score - a.score || compareIds(a.to, b.to));
  for (const target of targets) {
    const available = target.armies.filter((a) => !ordered.has(a.id));
    const attack = available.reduce(
      (sum, a) => sum + combatPower(w, a, true, target.to),
      0,
    );
    if (attack / Math.max(1, defenseAt(target.to)) <= threshold(target.to))
      continue;
    for (const a of available) queueMove(a, target.to);
  }

  const borders = lands.filter((p) =>
    GEOGRAPHY[p.id].neighbors.some(
      (e) => !e.sea && atWar(w, countryId, w.provinces[e.id].controller),
    ),
  );
  const pressure = new Map(
    borders.map((p) => [
      p.id,
      GEOGRAPHY[p.id].neighbors
        .filter((e) => !e.sea)
        .reduce((sum, e) => sum + defenseAt(e.id), 0),
    ]),
  );
  for (const a of reserves) {
    // Pending destinations count immediately, so a large rear stack spreads
    // across uncovered fronts instead of choosing the same empty city 128 times.
    const ranked = borders
      .map((p) => ({
        id: p.id,
        score:
          (projected.get(p.id) ?? 0) * 120 +
          mapDistance(GEOGRAPHY[a.province], GEOGRAPHY[p.id]) * 0.2 -
          Math.min(120, (pressure.get(p.id) ?? 0) * 1.5),
      }))
      .sort((l, r) => l.score - r.score || compareIds(l.id, r.id));
    for (const target of ranked) {
      if (target.id === a.province) break;
      if (access.canReach(a.province, target.id)) {
        queueMove(a, target.id, "hold");
        break;
      }
    }
  }
  // Shared origins and destinations form atomic orders with independent routes.
  // Bounded chunks also accommodate legacy saves with very long army IDs.
  for (const group of movements.values())
    for (let offset = 0; offset < group.armies.length; offset += 512) {
      const ids = group.armies.slice(offset, offset + 512);
      submit(
        ids.length === 1
          ? { type: "move", army: ids[0], to: group.to, stance: group.stance }
          : {
              type: "moveGroup",
              armies: ids,
              to: group.to,
              stance: group.stance,
            },
      );
    }
}
