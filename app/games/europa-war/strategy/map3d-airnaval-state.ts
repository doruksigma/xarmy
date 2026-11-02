import { AIRCRAFT, SEA_ZONES } from "./advanced-catalog";
import { wingEfficiency } from "./airnaval";
import { portZone, seaRoute, shipOperational } from "./military-assets";
import { formationSnapshotTransition } from "./map3d-unit-events";
import { atWar, friendly, GEOGRAPHY } from "./world";
import { worldHour } from "./time";
import { NAVAL_PRESENTATION } from "./map3d-naval-space";
import type { AirWing, Country, SeaZone, World } from "./types";

export type AirNavalModel =
  | "fighter"
  | "bomber"
  | "ship"
  | "carrier"
  | "submarine";
export interface AirNavalPoint {
  x: number;
  y: number;
}
export interface AirNavalUnit {
  id: string;
  country: string;
  color: string;
  model: AirNavalModel;
  airborne: boolean;
  active: boolean;
  from: AirNavalPoint;
  target: AirNavalPoint;
  phase: number;
  scale: number;
  seaZone?: SeaZone;
}
export interface AirNavalOutcome {
  key: string;
  kind: "dogfight" | "bombing" | "naval" | "navalStrike" | "flak";
  sourceId: string;
  targetId: string;
  sourceCountry: string;
  targetCountry: string;
  from: AirNavalPoint;
  to: AirNavalPoint;
  loss: number;
}

/** A visual-only stable phase: never consumes or writes the campaign RNG. */
export function airNavalPhase(id: string): number {
  let value = 2166136261;
  for (let index = 0; index < id.length; index++)
    value = Math.imul(value ^ id.charCodeAt(index), 16777619);
  // Sequentially allocated IDs otherwise retain almost identical high bits,
  // stacking whole formations at the same point on their patrol paths.
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function point(id: string): AirNavalPoint {
  return { x: GEOGRAPHY[id].x, y: GEOGRAPHY[id].y };
}
function loads(world: World) {
  const result: Record<string, number> = {};
  for (const country of Object.values(world.countries))
    for (const wing of country.air.wings)
      result[wing.base] = (result[wing.base] ?? 0) + wing.count;
  return result;
}
function flying(
  world: World,
  country: Country,
  wing: AirWing,
  baseLoads: Record<string, number>,
) {
  const target = world.provinces[wing.target];
  return (
    wing.count > 0 &&
    wing.mission !== "idle" &&
    !!target &&
    (friendly(world, country.id, target.controller) ||
      atWar(world, country.id, target.controller)) &&
    (wing.mission !== "naval" || GEOGRAPHY[wing.target].port) &&
    wingEfficiency(world, country, wing, baseLoads) > 0
  );
}
/** Display one representative miniature per real wing, and one per real ship.
 * Patrol loops illustrate assigned missions; they do not invent simulation positions. */
function knownCountry(world: World, country: string) {
  const player = world.countries[world.player];
  return (
    country === world.player ||
    player.allies.includes(country) ||
    (player.intel[country]?.expires ?? -1) > world.day
  );
}
export function airNavalUnits(
  world: World,
  outcomes: readonly AirNavalOutcome[] = [],
): AirNavalUnit[] {
  const result: AirNavalUnit[] = [],
    baseLoads = loads(world);
  const contacts = new Set(
    outcomes
      .filter(
        (event) =>
          knownCountry(world, event.sourceCountry) ||
          knownCountry(world, event.targetCountry),
      )
      .flatMap((event) => [event.sourceId, event.targetId]),
  );
  const friendlyFleets = Object.values(world.countries).filter(
    (country) =>
      country.id === world.player ||
      world.countries[world.player].allies.includes(country.id),
  );
  const visibleProvince = (id: string) => {
    const known = (province: string) =>
      world.provinces[province]?.controller === world.player ||
      world.countries[world.player].allies.includes(
        world.provinces[province]?.controller,
      );
    return known(id) || GEOGRAPHY[id].neighbors.some((edge) => known(edge.id));
  };
  for (const country of Object.values(world.countries)) {
    if (country.capitulated) continue;
    for (const wing of country.air.wings) {
      if (wing.count <= 0 || !GEOGRAPHY[wing.base] || !GEOGRAPHY[wing.target])
        continue;
      const active = !!flying(world, country, wing, baseLoads);
      const known = knownCountry(world, country.id);
      if (
        !known &&
        !contacts.has(wing.id) &&
        !(active && visibleProvince(wing.target))
      )
        continue;
      if (!known && !active) continue;
      result.push({
        id: wing.id,
        country: country.id,
        color: country.color,
        model: ["fighter", "carrierFighter"].includes(wing.model)
          ? "fighter"
          : "bomber",
        airborne: true,
        active,
        // Contact reveals the observed mission area, never an unseen enemy airbase.
        from: point(known ? wing.base : wing.target),
        target: active ? point(wing.target) : point(wing.base),
        phase: airNavalPhase(wing.id),
        scale:
          wing.model === "strategicBomber" || wing.model === "transport"
            ? 1.12
            : 1,
      });
    }
    for (const ship of country.navy.ships) {
      if (ship.health <= 0 || !SEA_ZONES[ship.zone]) continue;
      const basin = SEA_ZONES[ship.zone];
      if (
        !knownCountry(world, country.id) &&
        !outcomes.some(
          (event) =>
            (event.sourceId === ship.id || event.targetId === ship.id) &&
            event.to.x === basin.x &&
            event.to.y === basin.y,
        ) &&
        !(
          shipOperational(world, country, ship) &&
          friendlyFleets.some(
            (ally) =>
              atWar(world, country.id, ally.id) &&
              ally.navy.ships.some(
                (known) =>
                  known.zone === ship.zone &&
                  shipOperational(world, ally, known),
              ),
          )
        )
      )
        continue;
      // The simulation stores the assigned basin, not a geographic ship track.
      // Show transit/patrol movement inside that real basin rather than inventing a route across land.
      result.push({
        id: ship.id,
        country: country.id,
        color: country.color,
        model:
          ship.model === "carrier"
            ? "carrier"
            : ship.model === "submarine"
              ? "submarine"
              : "ship",
        airborne: false,
        seaZone: ship.zone,
        active: ship.transit > 0 || shipOperational(world, country, ship),
        from: { x: basin.x, y: basin.y },
        target: { x: basin.x, y: basin.y },
        phase: airNavalPhase(ship.id),
        scale:
          NAVAL_PRESENTATION[ship.zone].scale *
          (ship.model === "battleship"
            ? 1.25
            : ship.model === "destroyer"
              ? 0.8
              : 1),
      });
    }
  }
  return result.sort(
    (left, right) =>
      Number(right.country === world.player) -
        Number(left.country === world.player) ||
      Number(right.active) - Number(left.active) ||
      left.id.localeCompare(right.id),
  );
}

/** Confirmed outcomes only. Loss of a base/port, attrition, commands, loading,
 * pauses, and time discontinuities cannot masquerade as weapon impacts. */
export function detectAirNavalOutcomes(
  previous: World | null,
  current: World,
): AirNavalOutcome[] {
  if (
    !previous ||
    formationSnapshotTransition(previous, current) !== "step" ||
    current.day === previous.day
  )
    return [];
  const result: AirNavalOutcome[] = [],
    baseLoads = loads(previous),
    tick = worldHour(current);
  const countries = Object.values(previous.countries);
  const activeWings = countries.flatMap((country) =>
    country.air.wings
      .filter((wing) => flying(previous, country, wing, baseLoads))
      .map((wing) => ({ country, wing })),
  );
  const activeShips = countries.flatMap((country) =>
    country.navy.ships
      .filter((ship) => shipOperational(previous, country, ship))
      .map((ship) => ({ country, ship })),
  );
  const exposedShips = countries.flatMap((country) =>
    country.navy.ships
      .filter(
        (ship) => ship.health > 0 && ship.mission !== "idle" && !ship.transit,
      )
      .map((ship) => ({ country, ship })),
  );
  const progressed = (country: Country, wing: AirWing) => {
    const next = current.countries[country.id]?.air.wings.find(
      (item) => item.id === wing.id,
    );
    return (
      next &&
      next.base === wing.base &&
      (next.experience > wing.experience || wing.experience >= 100)
    );
  };
  for (const { country, wing } of activeWings) {
    const next = current.countries[country.id]?.air.wings.find(
      (item) => item.id === wing.id,
    );
    const target = previous.provinces[wing.target],
      nextTarget = current.provinces[wing.target];
    if (
      wing.mission === "strategic" &&
      progressed(country, wing) &&
      atWar(previous, country.id, target.controller) &&
      nextTarget.controller === target.controller &&
      nextTarget.damage > target.damage
    ) {
      result.push({
        key: `${tick}:bomb:${wing.id}`,
        kind: "bombing",
        sourceId: wing.id,
        targetId: wing.target,
        sourceCountry: country.id,
        targetCountry: target.controller,
        from: point(wing.base),
        to: point(wing.target),
        loss: nextTarget.damage - target.damage,
      });
    }
    const loss = wing.count - (next?.count ?? 0);
    if (
      loss <= 0 ||
      (next && next.base !== wing.base) ||
      !friendly(current, country.id, current.provinces[wing.base].controller)
    )
      continue;
    const interceptor = activeWings.find(
      ({ country: enemy, wing: fighter }) =>
        atWar(previous, country.id, enemy.id) &&
        fighter.mission === "superiority" &&
        Math.hypot(
          GEOGRAPHY[fighter.target].x - GEOGRAPHY[wing.target].x,
          GEOGRAPHY[fighter.target].y - GEOGRAPHY[wing.target].y,
        ) < 180 &&
        Math.hypot(
          GEOGRAPHY[fighter.base].x - GEOGRAPHY[wing.target].x,
          GEOGRAPHY[fighter.base].y - GEOGRAPHY[wing.target].y,
        ) <=
          AIRCRAFT[fighter.model].range *
            (enemy.tech.includes("aviation3") ? 1.2 : 1),
    );
    if (interceptor)
      result.push({
        key: `${tick}:air:${wing.id}`,
        kind: "dogfight",
        sourceId: interceptor.wing.id,
        targetId: wing.id,
        sourceCountry: interceptor.country.id,
        targetCountry: country.id,
        from: point(interceptor.wing.target),
        to: point(wing.target),
        loss,
      });
    else if (
      atWar(previous, country.id, target.controller) &&
      target.buildings.antiAir > 0
    )
      result.push({
        key: `${tick}:flak:${wing.id}`,
        kind: "flak",
        sourceId: wing.target,
        targetId: wing.id,
        sourceCountry: target.controller,
        targetCountry: country.id,
        from: point(wing.target),
        to: point(wing.target),
        loss,
      });
  }
  for (const { country, ship } of exposedShips) {
    const next = current.countries[country.id]?.navy.ships.find(
      (item) => item.id === ship.id,
    );
    const loss = ship.health - (next?.health ?? 0);
    if (
      loss <= 0 ||
      !friendly(current, country.id, current.provinces[ship.port].controller) ||
      !seaRoute(current, country.id, portZone(ship.port), ship.zone)
    )
      continue;
    const enemy = shipOperational(previous, country, ship)
      ? activeShips.find(
          (item) =>
            item.ship.zone === ship.zone &&
            atWar(previous, country.id, item.country.id),
        )
      : undefined;
    const attacker = activeWings.find(
      (item) =>
        item.wing.mission === "naval" &&
        GEOGRAPHY[item.wing.target].port &&
        previous.provinces[item.wing.target].controller === country.id &&
        portZone(item.wing.target) === ship.zone &&
        atWar(previous, country.id, item.country.id) &&
        progressed(item.country, item.wing),
    );
    const basin = SEA_ZONES[ship.zone],
      to = { x: basin.x, y: basin.y };
    // Earlier assets may consume the shared fuel before this ship acts. Sea XP
    // proves that it actually exchanged fire; enemy presence alone does not.
    // At the XP cap, prefer a proven bomber source when the cause is ambiguous.
    const exchangedFire =
      (!!next && next.experience > ship.experience) ||
      (!attacker && (!next || ship.experience >= 100));
    if (enemy && exchangedFire)
      result.push({
        key: `${tick}:sea:${ship.id}`,
        kind: "naval",
        sourceId: enemy.ship.id,
        targetId: ship.id,
        sourceCountry: enemy.country.id,
        targetCountry: country.id,
        from: to,
        to,
        loss,
      });
    else if (attacker)
      result.push({
        key: `${tick}:strike:${ship.id}`,
        kind: "navalStrike",
        sourceId: attacker.wing.id,
        targetId: ship.id,
        sourceCountry: attacker.country.id,
        targetCountry: country.id,
        from: point(attacker.wing.target),
        to,
        loss,
      });
  }
  return result
    .filter(
      (outcome) =>
        knownCountry(current, outcome.sourceCountry) ||
        knownCountry(current, outcome.targetCountry),
    )
    .slice(0, 64);
}
