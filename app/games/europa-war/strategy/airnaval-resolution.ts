import { AIRCRAFT, SEA_ZONES, SHIPS } from "./advanced-catalog";
import { mapDistance } from "./geography-distance";
import { portZone, seaRoute } from "./military-assets";
import {
  atWar,
  capacity,
  clamp,
  controlled,
  event,
  friendly,
  GEOGRAPHY,
} from "./world";
import type {
  AirNavalDailyReport,
  AirWing,
  Country,
  SeaZone,
  Warship,
  World,
} from "./types";

type Efficiency = (
  world: World,
  country: Country,
  wing: AirWing,
  loads: Record<string, number>,
) => number;
type WingPlan = {
  country: Country;
  wing: AirWing;
  funded: boolean;
  efficiency: number;
  loss: number;
};
type ShipPlan = {
  country: Country;
  ship: Warship;
  originalHealth: number;
  originalAircraft: number;
  inTransit: boolean;
  hasPort: boolean;
  funded: boolean;
  attrition: number;
  repair: number;
  surfaceDamage: number;
  airHits: Map<string, number>;
};
const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const add = (map: Map<string, number>, key: string, amount: number) =>
  map.set(key, (map.get(key) ?? 0) + amount);

function report(country: string, day: number): AirNavalDailyReport {
  return {
    country,
    day,
    air: {
      flown: 0,
      combatLosses: 0,
      baseLosses: 0,
      reinforced: 0,
      fuelSpent: 0,
      bombingDamage: 0,
      navalDamage: 0,
      engagements: 0,
    },
    navy: {
      active: 0,
      combatDamage: 0,
      attritionDamage: 0,
      sunk: 0,
      aircraftLost: 0,
      repaired: 0,
      fuelSpent: 0,
      engagements: 0,
    },
  };
}

/** Prepare only the affected asset/stock records. Geography, diplomacy and
 * infrastructure are read-only until every combat outcome has been computed.
 * No country or asset iteration order may decide who gets a first strike. */
export function resolveAirNavalDay(world: World, efficiencyOfWing: Efficiency) {
  const countries = Object.keys(world.countries)
    .sort()
    .map((id) => {
      const source = world.countries[id];
      return {
        ...source,
        stock: { ...source.stock },
        equipment: { ...source.equipment },
        air: {
          ...source.air,
          wings: source.air.wings.map((wing) => ({ ...wing })).sort(byId),
        },
        navy: {
          ...source.navy,
          ships: source.navy.ships.map((ship) => ({ ...ship })).sort(byId),
        },
      };
    });
  const snapshot: World = {
    ...world,
    countries: Object.fromEntries(
      countries.map((country) => [country.id, country]),
    ),
  };
  const reports = new Map(
    countries.map((country) => [country.id, report(country.id, world.day)]),
  );
  const wings: WingPlan[] = [];
  const ships: ShipPlan[] = [];
  const fuelRemaining = new Map<string, number>();
  const routes = new Map<string, SeaZone[] | null>();
  const route = (id: string, from: SeaZone, to: SeaZone) => {
    const key = `${id}:${from}:${to}`;
    if (!routes.has(key)) routes.set(key, seaRoute(snapshot, id, from, to));
    return routes.get(key)!;
  };

  // Reserve replacements and repairs from the real opening stocks. Stable IDs
  // are the tie-breaker for scarce replacements/fuel, never UI array ordering.
  for (const country of countries) {
    const ownReport = reports.get(country.id)!;
    fuelRemaining.set(country.id, country.stock.fuel);
    if (country.capitulated) {
      for (const wing of country.air.wings) wing.mission = "idle";
      for (const ship of country.navy.ships) ship.mission = "idle";
      continue;
    }
    let safeBase: string | null | undefined;
    for (const wing of country.air.wings) {
      if (
        !friendly(
          snapshot,
          country.id,
          snapshot.provinces[wing.base].controller,
        )
      ) {
        if (safeBase === undefined)
          safeBase =
            controlled(snapshot, country.id)
              .filter((p) => p.buildings.airfield > 0)
              .sort(byId)[0]?.id ?? null;
        if (!safeBase) {
          ownReport.air.baseLosses += wing.count;
          wing.count = 0;
          continue;
        }
        ownReport.air.baseLosses += wing.count * 0.2;
        wing.count *= 0.8;
        wing.readiness *= 0.5;
        wing.base = wing.target = safeBase;
        wing.mission = "idle";
      }
      const replacement = Math.max(
        0,
        Math.min(2, wing.size - wing.count, country.equipment[wing.model]),
      );
      wing.count += replacement;
      country.equipment[wing.model] -= replacement;
      ownReport.air.reinforced += replacement;
      if (wing.mission === "idle") {
        wing.readiness = clamp(wing.readiness + 6);
        continue;
      }
      const controller = snapshot.provinces[wing.target].controller;
      const hostile = atWar(snapshot, country.id, controller);
      if (
        (!friendly(snapshot, country.id, controller) && !hostile) ||
        (["strategic", "naval"].includes(wing.mission) && !hostile) ||
        (wing.mission === "naval" && !GEOGRAPHY[wing.target].port)
      ) {
        wing.mission = "idle";
        continue;
      }
      wings.push({ country, wing, funded: false, efficiency: 0, loss: 0 });
    }
    const repairable: ShipPlan[] = [];
    for (const ship of country.navy.ships) {
      const plan: ShipPlan = {
        country,
        ship,
        originalHealth: ship.health,
        originalAircraft: ship.aircraft,
        inTransit: ship.transit > 0,
        hasPort: false,
        funded: false,
        attrition: 0,
        repair: 0,
        surfaceDamage: 0,
        airHits: new Map(),
      };
      ships.push(plan);
      if (ship.health <= 0) continue;
      if (plan.inTransit) {
        ship.transit--;
        continue;
      }
      plan.hasPort =
        ship.port !== "ussr-13" &&
        friendly(
          snapshot,
          country.id,
          snapshot.provinces[ship.port].controller,
        ) &&
        !!route(country.id, portZone(ship.port), ship.zone);
      if (!plan.hasPort) {
        plan.attrition = Math.min(ship.health, 0.3);
        ship.health -= plan.attrition;
        ownReport.navy.attritionDamage += plan.attrition;
      } else if (ship.mission === "idle" && ship.health < 100)
        repairable.push(plan);
    }
    // Water-fill a FIXED daily dock budget. Completing one nearly repaired hull
    // redistributes its unused share, but never creates a new budget mid-loop.
    repairable.sort((a, b) =>
      a.ship.health === b.ship.health
        ? byId(a.ship, b.ship)
        : b.ship.health - a.ship.health,
    );
    let repairBudget = repairable.length
      ? Math.min(
          capacity(snapshot, country.id, "dock") * 1.5,
          country.stock.steel * 2,
        )
      : 0;
    for (const [index, plan] of repairable.entries()) {
      plan.repair = Math.max(
        0,
        Math.min(
          100 - plan.ship.health,
          repairBudget / (repairable.length - index),
        ),
      );
      plan.ship.health += plan.repair;
      repairBudget = Math.max(0, repairBudget - plan.repair);
      ownReport.navy.repaired += plan.repair;
    }
    country.stock.steel = Math.max(
      0,
      country.stock.steel - ownReport.navy.repaired / 2,
    );
  }

  const loads: Record<string, number> = {};
  for (const country of countries)
    for (const wing of country.air.wings)
      loads[wing.base] = (loads[wing.base] ?? 0) + wing.count;
  // Resolve a shared national fuel budget before anyone contributes power.
  // Air sorties retain the existing priority over sea patrols, with stable
  // asset IDs within each service. Unfunded forces cannot provide ghost cover.
  for (const plan of wings) {
    const { country, wing } = plan;
    const fuel = wing.count * AIRCRAFT[wing.model].fuel;
    plan.efficiency = efficiencyOfWing(snapshot, country, wing, loads);
    if (
      wing.count > 0 &&
      plan.efficiency > 0 &&
      fuel <= fuelRemaining.get(country.id)!
    ) {
      plan.funded = true;
      fuelRemaining.set(
        country.id,
        Math.max(0, fuelRemaining.get(country.id)! - fuel),
      );
      reports.get(country.id)!.air.fuelSpent += fuel;
      reports.get(country.id)!.air.flown += wing.count;
    }
  }
  for (const plan of ships) {
    const { country, ship } = plan;
    const fuel = SHIPS[ship.model].fuel;
    if (
      ship.health > 0 &&
      !plan.inTransit &&
      plan.hasPort &&
      ship.mission !== "idle" &&
      fuel <= fuelRemaining.get(country.id)!
    ) {
      plan.funded = true;
      fuelRemaining.set(
        country.id,
        Math.max(0, fuelRemaining.get(country.id)! - fuel),
      );
      reports.get(country.id)!.navy.fuelSpent += fuel;
      reports.get(country.id)!.navy.active++;
    }
  }

  const superiority = new Map<string, WingPlan[]>();
  for (const plan of wings) {
    if (!plan.funded || plan.wing.mission !== "superiority") continue;
    const active = superiority.get(plan.country.id) ?? [];
    active.push(plan);
    superiority.set(plan.country.id, active);
  }
  const airPowerCache = new Map<string, number>();
  const airPower = (countryId: string, province: string) => {
    const key = `${countryId}:${province}`;
    if (!airPowerCache.has(key)) {
      const country = snapshot.countries[countryId];
      let power = 0;
      for (const plan of superiority.get(countryId) ?? []) {
        const wing = plan.wing;
        if (
          mapDistance(GEOGRAPHY[wing.target], GEOGRAPHY[province]) >= 180 ||
          mapDistance(GEOGRAPHY[wing.base], GEOGRAPHY[province]) >
            AIRCRAFT[wing.model].range *
              (country.tech.includes("aviation3") ? 1.2 : 1)
        )
          continue;
        power +=
          wing.count *
          plan.efficiency *
          AIRCRAFT[wing.model].attack *
          (1 + wing.experience * 0.002);
      }
      airPowerCache.set(
        key,
        power *
          (country.tech.includes("airDoctrine") ? 1.2 : 1) *
          (country.tech.includes("aviation3") ? 1.3 : 1),
      );
    }
    return airPowerCache.get(key)!;
  };
  const seaPower = new Map<string, number>(),
    screens = new Map<string, number>(),
    raiders = new Map<string, number>();
  const exposed = new Map<string, ShipPlan[]>();
  for (const plan of ships) {
    const { country, ship } = plan;
    const key = `${country.id}:${ship.zone}`;
    if (ship.health > 0 && !plan.inTransit && ship.mission !== "idle") {
      const atSea = exposed.get(key) ?? [];
      atSea.push(plan);
      exposed.set(key, atSea);
    }
    if (!plan.funded) continue;
    add(
      seaPower,
      key,
      (((SHIPS[ship.model].power + ship.aircraft * 0.8) * ship.health) / 100) *
        (1 + ship.experience * 0.002) *
        (country.tech.includes("naval2") ? 1.25 : 1) *
        (country.tech.includes("navalDoctrine") ? 1.2 : 1),
    );
    add(screens, key, (SHIPS[ship.model].antiSub * ship.health) / 100);
    if (ship.model === "submarine" && ship.mission === "raid")
      add(raiders, key, 1);
  }
  const provinceHits = new Map<string, Map<string, number>>();
  const reconnaissance = new Map<string, Map<string, number>>();

  // All calculations below read the frozen prepared strength, base damage and
  // funded participation. No losses, retreats or bombing have been committed.
  for (const plan of wings) {
    if (!plan.funded) continue;
    const { country, wing } = plan;
    const ownReport = reports.get(country.id)!;
    const target = snapshot.provinces[wing.target];
    const hostile = atWar(snapshot, country.id, target.controller);
    const enemy = [...country.wars]
      .sort()
      .reduce((sum, id) => sum + airPower(id, wing.target), 0);
    const escort = airPower(country.id, wing.target);
    const interception = clamp((escort + 10) / (enemy + 10), 0.15, 1);
    const flak = hostile ? target.buildings.antiAir : 0;
    plan.loss = Math.min(wing.count * 0.1, enemy * 0.0015 + flak * 0.015);
    if (enemy > 0 || flak > 0) ownReport.air.engagements++;
    if (wing.mission === "strategic" && hostile) {
      const hits = provinceHits.get(target.id) ?? new Map<string, number>();
      add(
        hits,
        country.id,
        (wing.count *
          (wing.model === "strategicBomber" ? 0.12 : 0.04) *
          plan.efficiency *
          interception) /
          (1 + flak * 0.35 + target.buildings.radar * 0.15),
      );
      provinceHits.set(target.id, hits);
    }
    if (wing.mission === "recon" && hostile) {
      const intel = reconnaissance.get(country.id) ?? new Map<string, number>();
      intel.set(
        target.controller,
        Math.max(
          intel.get(target.controller) ?? 0,
          55 + Math.min(20, wing.count),
        ),
      );
      reconnaissance.set(country.id, intel);
    }
    if (wing.mission === "naval" && hostile) {
      const fleet =
        exposed.get(`${target.controller}:${portZone(target.id)}`) ?? [];
      const damage =
        (wing.count * plan.efficiency * interception * 0.025) /
        Math.max(1, fleet.length);
      for (const ship of fleet) add(ship.airHits, country.id, damage);
    }
  }
  for (const plan of ships) {
    const { country, ship } = plan;
    if (ship.health <= 0 || plan.inTransit || ship.mission === "idle") continue;
    const key = `${country.id}:${ship.zone}`;
    const opposition = [...country.wars]
      .sort()
      .reduce((sum, id) => sum + (seaPower.get(`${id}:${ship.zone}`) ?? 0), 0);
    const submarine = [...country.wars]
      .sort()
      .reduce((sum, id) => sum + (raiders.get(`${id}:${ship.zone}`) ?? 0), 0);
    plan.surfaceDamage =
      (opposition * 0.018) /
        SHIPS[ship.model].armor /
        Math.max(1, exposed.get(key)?.length ?? 0) +
      (ship.model !== "submarine"
        ? (submarine * 0.08) / (1 + (screens.get(key) ?? 0))
        : 0);
  }

  // Commit each loss once, capped by real remaining health/count. Attribute
  // capped mixed air/surface damage proportionally, so reports cannot count
  // overkill as destroyed ships or deduct the same aircraft from depot twice.
  for (const plan of wings) {
    const { wing, country } = plan;
    if (plan.funded) {
      wing.count = Math.max(0, wing.count - plan.loss);
      wing.readiness = clamp(wing.readiness + 0.5);
      wing.experience = clamp(wing.experience + 0.05);
      reports.get(country.id)!.air.combatLosses += plan.loss;
    } else wing.readiness = clamp(wing.readiness + 1);
  }
  for (const plan of ships) {
    const { country, ship } = plan;
    const ownReport = reports.get(country.id)!;
    const airDamage = [...plan.airHits.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    const incoming = airDamage + plan.surfaceDamage;
    const damage = Math.min(ship.health, incoming);
    ship.health = clamp(ship.health - damage);
    ownReport.navy.combatDamage += damage;
    if (incoming > 0) {
      ownReport.navy.engagements++;
      for (const [attacker, amount] of plan.airHits)
        reports.get(attacker)!.air.navalDamage += (damage * amount) / incoming;
      if (plan.funded) ship.experience = clamp(ship.experience + 0.1);
    }
    ship.aircraft =
      ship.health > 0 ? Math.max(0, ship.aircraft - damage * 0.04) : 0;
    ownReport.navy.aircraftLost += plan.originalAircraft - ship.aircraft;
    if (plan.originalHealth > 0 && ship.health <= 0) ownReport.navy.sunk++;
    if (plan.funded && ship.health > 0 && ship.health < 30) {
      const home = portZone(ship.port);
      const path = route(country.id, ship.zone, home);
      if (path) {
        ship.zone = home;
        ship.transit = (path.length - 1) * 3;
        ship.mission = "idle";
      }
    }
  }
  for (const [province, hits] of provinceHits) {
    const total = [...hits.values()].reduce((sum, amount) => sum + amount, 0);
    const damage = Math.min(100 - world.provinces[province].damage, total);
    world.provinces[province].damage += damage;
    for (const [country, amount] of hits)
      reports.get(country)!.air.bombingDamage += (damage * amount) / total;
  }
  for (const country of countries) {
    const actual = world.countries[country.id];
    actual.stock.fuel = fuelRemaining.get(country.id)!;
    actual.stock.steel = country.stock.steel;
    for (const model of Object.keys(AIRCRAFT) as (keyof typeof AIRCRAFT)[])
      actual.equipment[model] = country.equipment[model];
    const wingById = new Map(country.air.wings.map((wing) => [wing.id, wing]));
    for (const wing of actual.air.wings)
      Object.assign(wing, wingById.get(wing.id)!);
    actual.air.wings = actual.air.wings.filter(
      (wing) => wing.count > 0 || actual.equipment[wing.model] > 0,
    );
    const shipById = new Map(country.navy.ships.map((ship) => [ship.id, ship]));
    for (const ship of actual.navy.ships)
      Object.assign(ship, shipById.get(ship.id)!);
    actual.navy.ships = actual.navy.ships.filter((ship) => ship.health > 0);
    for (const [target, level] of reconnaissance.get(country.id) ?? []) {
      actual.intel[target] = {
        level: Math.max(actual.intel[target]?.level ?? 0, level),
        expires: world.day + 14,
      };
    }
  }
  for (const plan of ships) {
    if (
      plan.country.id !== world.player ||
      plan.originalHealth <= 0 ||
      plan.ship.health > 0
    )
      continue;
    event(
      world,
      `${plan.ship.name}, ${SEA_ZONES[plan.ship.zone].name} ${plan.surfaceDamage || plan.airHits.size ? "muharebesinde" : "ikmalsizlik nedeniyle"} battı.`,
      "war",
    );
  }
  world.airNavalReports = countries.map((country) => reports.get(country.id)!);
}
