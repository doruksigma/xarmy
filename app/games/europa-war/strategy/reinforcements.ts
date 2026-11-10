import { SUPPORT } from "./advanced-catalog";
import { TERRAINS, UNITS } from "./catalog";
import { MAX_ARMIES } from "./campaign-limits";
import { PRODUCTION_BALANCE } from "./economy-balance";
import {
  corridorLength,
  isTraversableLandEdge,
  movementLegPath,
} from "./land-corridors";
import { seaEdgeOpen } from "./military-assets";
import { HOURS_PER_DAY, worldHour } from "./time";
import { atWar, friendly, GEOGRAPHY, uid } from "./world";
import type { Army, Equipment, SupportType, UnitType, World } from "./types";
import type {
  ReinforcementCargo,
  ReinforcementLedger,
  ReinforcementShipment,
  ReinforcementState,
} from "./reinforcement-types";

export const MAX_REINFORCEMENT_FRACTION = 0.004;
export const MAX_REINFORCEMENT_SHIPMENTS = MAX_ARMIES;
const EPSILON = 1e-10;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const emptyCargo = (): ReinforcementCargo => ({ manpower: 0, equipment: {} });
const emptyLedger = (): ReinforcementLedger => ({
  dispatched: emptyCargo(),
  delivered: emptyCargo(),
  returned: emptyCargo(),
  lost: emptyCargo(),
});

/** Frozen full-strength equipment requirements, including paid supports. */
export function reinforcementRequirements(
  unit: UnitType,
  support: readonly SupportType[],
): Partial<Record<Equipment, number>> {
  const needs = { ...UNITS[unit].equipment };
  for (const id of support)
    for (const [equipment, amount] of Object.entries(SUPPORT[id].equipment)) {
      const key = equipment as Equipment;
      needs[key] = (needs[key] ?? 0) + amount;
    }
  return needs;
}

/** Abstract freight units, not tonnes or separately owned train/convoy stock. */
export function reinforcementCargoWeight(cargo: ReinforcementCargo): number {
  return (
    cargo.manpower / 100 +
    Object.entries(cargo.equipment).reduce((total, [id, amount]) => {
      const weight = id === "rifle" ? 0.1 : id === "truck" ? 1 : 3;
      return total + amount * weight;
    }, 0)
  );
}

/** Shared physical node capacity in freight units per hour. Infrastructure,
 * rail, hubs and damage all affect actual shipment throughput. This does not
 * replace the wider localSupply model or allocate train/convoy inventory. */
export function reinforcementNodeCapacity(w: World, province: string): number {
  const p = w.provinces[province];
  if (!p) return 0;
  return (
    (0.15 +
      p.buildings.infra * 0.1 +
      p.buildings.rail * 0.35 +
      p.buildings.hub * 0.75) *
    Math.max(0, 1 - p.damage / 100)
  );
}

export function reinforcementEdgeCapacity(
  w: World,
  from: string,
  to: string,
): number {
  const edge = GEOGRAPHY[from]?.neighbors.find((e) => e.id === to);
  if (!edge || (!edge.sea && !isTraversableLandEdge(from, to))) return 0;
  return (
    Math.min(
      reinforcementNodeCapacity(w, from),
      reinforcementNodeCapacity(w, to),
    ) * (edge.sea ? 0.5 : 1)
  );
}

export function reinforcementLegHours(
  w: World,
  from: string,
  to: string,
): number {
  const edge = GEOGRAPHY[from].neighbors.find((e) => e.id === to)!;
  const path = movementLegPath(from, to);
  if (!path) throw new Error("Geçerli bir takviye geçişi seç.");
  const distance = corridorLength(path);
  if (edge.sea) return Math.max(12, distance / 10);
  const rail = Math.min(
    w.provinces[from].buildings.rail,
    w.provinces[to].buildings.rail,
  );
  return Math.max(
    2,
    Math.max(3, distance / 20) /
      ((1 + rail * 0.2) * TERRAINS[GEOGRAPHY[to].terrain].speed),
  );
}

function edgeAvailable(w: World, country: string, from: string, to: string) {
  const edge = GEOGRAPHY[from]?.neighbors.find((e) => e.id === to);
  return (
    !!edge &&
    friendly(w, country, w.provinces[from].controller) &&
    friendly(w, country, w.provinces[to].controller) &&
    reinforcementEdgeCapacity(w, from, to) > EPSILON &&
    (!edge.sea || seaEdgeOpen(w, country, from, to))
  );
}

/** A deterministic friendly path. Blocked and fully damaged edges are excluded,
 * so opening another connection permits a real reroute from the current node. */
function createReinforcementRouter(w: World) {
  const trees = new Map<string, Map<string, string | null>>();
  const available = new Map<string, boolean>();
  const edgeOpen = (country: string, from: string, to: string) => {
    const key = `${country}:${from}:${to}`;
    if (!available.has(key))
      available.set(key, edgeAvailable(w, country, from, to));
    return available.get(key)!;
  };
  return (country: string, from: string, to: string): string[] | null => {
    if (
      !w.countries[country] ||
      !w.provinces[from] ||
      !w.provinces[to] ||
      !friendly(w, country, w.provinces[from].controller) ||
      !friendly(w, country, w.provinces[to].controller)
    )
      return null;
    if (from === to) return [];
    const key = `${country}:${from}`;
    let previous = trees.get(key);
    if (!previous) {
      previous = new Map<string, string | null>([[from, null]]);
      const queue = [from];
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        for (const edge of [...GEOGRAPHY[current].neighbors].sort((a, b) =>
          compare(a.id, b.id),
        )) {
          if (previous.has(edge.id) || !edgeOpen(country, current, edge.id))
            continue;
          previous.set(edge.id, current);
          queue.push(edge.id);
        }
      }
      trees.set(key, previous);
    }
    if (!previous.has(to)) return null;
    const path: string[] = [];
    let node = to;
    while (node !== from) {
      path.unshift(node);
      node = previous.get(node)!;
    }
    return path;
  };
}
export function reinforcementRoute(
  w: World,
  country: string,
  from: string,
  to: string,
): string[] | null {
  return createReinforcementRouter(w)(country, from, to);
}

function addCargo(target: ReinforcementCargo, cargo: ReinforcementCargo) {
  target.manpower += cargo.manpower;
  for (const [id, amount] of Object.entries(cargo.equipment)) {
    const key = id as Equipment;
    target.equipment[key] = (target.equipment[key] ?? 0) + amount;
  }
}
function takeCargo(
  shipment: ReinforcementShipment,
  ratio: number,
): ReinforcementCargo {
  const part: ReinforcementCargo = {
    manpower: shipment.cargo.manpower * ratio,
    equipment: {},
  };
  shipment.cargo.manpower -= part.manpower;
  for (const [id, amount] of Object.entries(shipment.cargo.equipment)) {
    const key = id as Equipment;
    part.equipment[key] = amount * ratio;
    shipment.cargo.equipment[key] = amount - part.equipment[key]!;
  }
  return part;
}
function profileMatches(shipment: ReinforcementShipment, army?: Army) {
  return (
    !!army &&
    army.country === shipment.country &&
    army.strength > 0 &&
    army.type === shipment.unit &&
    army.support.length === shipment.support.length &&
    army.support.every((id) => shipment.support.includes(id))
  );
}
function beginReturn(shipment: ReinforcementShipment) {
  shipment.status = "returning";
  shipment.route = [];
  shipment.leg = null;
  shipment.blocked = null;
}

/** Reserve a single paid daily packet per recipient. The country stock exposed
 * to training, aid and production screens is already net of this reservation. */
export function reserveReinforcements(
  w: World,
  eligibleIds: ReadonlySet<string>,
  findRoute = createReinforcementRouter(w),
): void {
  const now = worldHour(w);
  if (w.hour !== 0 || w.reinforcements?.lastDispatchHour === now) return;
  const existing = w.reinforcements;
  const active = new Set(existing?.shipments.map((s) => s.army) ?? []);
  let state = existing;
  // All countries compete in stable recipient order for their own finite stock.
  for (const army of [...w.armies].sort((a, b) => compare(a.id, b.id))) {
    if (
      !eligibleIds.has(army.id) ||
      active.has(army.id) ||
      army.strength <= 0 ||
      army.strength >= 100 ||
      army.supply < 0.25 ||
      (state?.shipments.length ?? 0) >= MAX_REINFORCEMENT_SHIPMENTS
    )
      continue;
    const country = w.countries[army.country];
    if (
      country.capitulated ||
      w.provinces[country.capital]?.controller !== country.id
    )
      continue;
    const needs = reinforcementRequirements(army.type, army.support);
    const men = UNITS[army.type].men;
    let fraction = Math.min(
      MAX_REINFORCEMENT_FRACTION * Math.min(1, army.supply),
      (100 - army.strength) / 100,
      country.manpower / men,
    );
    for (const [id, amount] of Object.entries(needs))
      fraction = Math.min(
        fraction,
        country.equipment[id as Equipment] / amount,
      );
    if (!(fraction > EPSILON)) continue;
    // Empty depots should never trigger a separate map traversal per division.
    const route = findRoute(country.id, country.capital, army.province);
    if (!route) continue;
    const cargo: ReinforcementCargo = {
      manpower: men * fraction,
      equipment: Object.fromEntries(
        Object.entries(needs).map(([id, amount]) => [id, amount * fraction]),
      ),
    };
    country.manpower = Math.max(0, country.manpower - cargo.manpower);
    for (const [id, amount] of Object.entries(cargo.equipment)) {
      const key = id as Equipment;
      country.equipment[key] = Math.max(0, country.equipment[key] - amount);
    }
    if (!state) {
      state = { shipments: [], ledger: {}, lastDispatchHour: now };
      w.reinforcements = state;
    }
    state.ledger[country.id] ??= emptyLedger();
    addCargo(state.ledger[country.id].dispatched, cargo);
    state.shipments.push({
      id: uid(w, "reinforcement"),
      country: country.id,
      army: army.id,
      unit: army.type,
      support: [...army.support].sort(compare),
      origin: country.capital,
      province: country.capital,
      destination: army.province,
      route: route.slice(0, 1),
      leg: null,
      loadingHours: 1,
      status: "outbound",
      blocked: null,
      cargo,
      createdHour: now,
    });
    active.add(army.id);
  }
  if (state) state.lastDispatchHour = now;
}

type FreightRequest = {
  shipment: ReinforcementShipment;
  kind: "loading" | "movement";
  weight: number;
  demand: number;
  resources: string[];
};

function stepShipments(
  w: World,
  state: ReinforcementState,
  eligibleIds: ReadonlySet<string>,
  hours: number,
  findRoute: ReturnType<typeof createReinforcementRouter>,
) {
  const armies = new Map(w.armies.map((army) => [army.id, army]));
  const finished = new Set<string>();
  const requests: FreightRequest[] = [];
  const capacities = new Map<string, number>();
  const demands = new Map<string, number>();
  const settle = (shipment: ReinforcementShipment) => {
    const country = w.countries[shipment.country];
    const ledger = state.ledger[shipment.country];
    if (shipment.status === "returning") {
      // Ownership may have changed while this final leg was already underway.
      if (
        shipment.province !== country.capital ||
        w.provinces[country.capital].controller !== country.id
      ) {
        shipment.blocked = "depot";
        return;
      }
      // Keep surplus physically at the depot until space exists. Otherwise the
      // next economy clamp would silently erase this already paid equipment.
      let ratio = Math.min(
        1,
        Math.max(0, 1e9 - country.manpower) / shipment.cargo.manpower,
      );
      for (const [id, amount] of Object.entries(shipment.cargo.equipment)) {
        if (amount > 0)
          ratio = Math.min(
            ratio,
            Math.max(
              0,
              PRODUCTION_BALANCE.equipmentStockLimit -
                country.equipment[id as Equipment],
            ) / amount,
          );
      }
      if (ratio <= EPSILON) {
        shipment.blocked = "depot";
        return;
      }
      const cargo = takeCargo(shipment, ratio);
      country.manpower += cargo.manpower;
      for (const [id, amount] of Object.entries(cargo.equipment))
        country.equipment[id as Equipment] += amount;
      addCargo(ledger.returned, cargo);
      if (shipment.cargo.manpower > EPSILON) shipment.blocked = "depot";
      else finished.add(shipment.id);
      return;
    }
    const army = armies.get(shipment.army)!;
    if (!eligibleIds.has(army.id)) {
      shipment.blocked = army.supply < 0.25 ? "supply" : "combat";
      return;
    }
    const needed = Math.max(
      0,
      ((100 - army.strength) / 100) * UNITS[army.type].men,
    );
    const delivered = takeCargo(
      shipment,
      Math.min(1, needed / shipment.cargo.manpower),
    );
    army.strength = Math.min(
      100,
      army.strength + (delivered.manpower / UNITS[army.type].men) * 100,
    );
    addCargo(ledger.delivered, delivered);
    if (shipment.cargo.manpower > EPSILON) beginReturn(shipment);
    else finished.add(shipment.id);
  };
  for (const shipment of [...state.shipments].sort((a, b) =>
    compare(a.id, b.id),
  )) {
    const country = w.countries[shipment.country];
    const controller = w.provinces[shipment.province]?.controller;
    shipment.blocked = null;
    if (
      country.capitulated ||
      !controller ||
      atWar(w, shipment.country, controller)
    ) {
      const cargo = takeCargo(shipment, 1);
      addCargo(state.ledger[shipment.country].lost, cargo);
      country.casualties += cargo.manpower;
      finished.add(shipment.id);
      continue;
    }
    const army = armies.get(shipment.army);
    if (shipment.status === "outbound" && !profileMatches(shipment, army))
      beginReturn(shipment);
    if (!friendly(w, shipment.country, controller)) {
      shipment.blocked = "route";
      continue;
    }
    if (shipment.loadingHours > EPSILON) {
      const weight = reinforcementCargoWeight(shipment.cargo);
      const demand = weight * Math.min(hours, shipment.loadingHours);
      const node = `node:${shipment.province}`;
      capacities.set(
        node,
        reinforcementNodeCapacity(w, shipment.province) * hours,
      );
      demands.set(node, (demands.get(node) ?? 0) + demand);
      requests.push({
        shipment,
        kind: "loading",
        weight,
        demand,
        resources: [node],
      });
      continue;
    }
    if (
      shipment.leg &&
      !edgeAvailable(w, shipment.country, shipment.province, shipment.leg.to)
    ) {
      shipment.leg = null;
      shipment.route = [];
    }
    if (!shipment.leg) {
      shipment.destination =
        shipment.status === "returning" ? country.capital : army!.province;
      if (
        shipment.status === "returning" &&
        w.provinces[country.capital]?.controller !== country.id
      ) {
        shipment.blocked = "depot";
        continue;
      }
      if (shipment.province === shipment.destination) {
        settle(shipment);
        continue;
      }
      const remaining = findRoute(
        shipment.country,
        shipment.province,
        shipment.destination,
      );
      if (!remaining?.length) {
        shipment.route = [];
        shipment.blocked = "route";
        continue;
      }
      shipment.route = remaining.slice(0, 1);
      shipment.leg = {
        to: remaining[0],
        hours: reinforcementLegHours(w, shipment.province, remaining[0]),
        progress: 0,
      };
    }
    const leg = shipment.leg;
    const weight = reinforcementCargoWeight(shipment.cargo);
    const demand =
      (weight * Math.min(hours, leg.hours - leg.progress)) / leg.hours;
    const nodeA = `node:${shipment.province}`;
    const nodeB = `node:${leg.to}`;
    const edge = `edge:${[shipment.province, leg.to].sort(compare).join(":")}`;
    capacities.set(
      nodeA,
      reinforcementNodeCapacity(w, shipment.province) * hours,
    );
    capacities.set(nodeB, reinforcementNodeCapacity(w, leg.to) * hours);
    capacities.set(
      edge,
      reinforcementEdgeCapacity(w, shipment.province, leg.to) * hours,
    );
    const resources = [nodeA, nodeB, edge];
    for (const id of resources)
      demands.set(id, (demands.get(id) ?? 0) + demand);
    requests.push({ shipment, kind: "movement", weight, demand, resources });
  }
  // Proportional admission is conservative: every user sees the same aggregate
  // demand for a physical resource. It cannot spend the same edge/node twice,
  // even across allied countries or opposite directions. Spare downstream
  // capacity is not redistributed in this bounded approximation.
  for (const request of requests) {
    const { shipment, weight, demand, resources } = request;
    const ratio = Math.min(
      1,
      ...resources.map((id) => capacities.get(id)! / demands.get(id)!),
    );
    const grant = demand * ratio;
    if (ratio < 1 - EPSILON) shipment.blocked = "capacity";
    if (request.kind === "loading") {
      shipment.loadingHours = Math.max(
        0,
        shipment.loadingHours - grant / weight,
      );
      if (shipment.loadingHours < EPSILON) shipment.loadingHours = 0;
      continue;
    }
    const leg = shipment.leg!;
    leg.progress += (grant / weight) * leg.hours;
    if (leg.progress >= leg.hours - EPSILON) {
      shipment.province = leg.to;
      shipment.route.shift();
      shipment.leg = null;
      // The target may have moved while the shipment was already in transit.
      // Only a genuinely co-located, unchanged recipient receives its cargo.
      const army = armies.get(shipment.army);
      const actualDestination =
        shipment.status === "returning"
          ? w.countries[shipment.country].capital
          : army!.province;
      if (shipment.province === actualDestination) {
        shipment.destination = actualDestination;
        shipment.route = [];
        settle(shipment);
      }
    }
  }
  state.shipments = state.shipments.filter(
    (shipment) => !finished.has(shipment.id),
  );
}

/** Called after land readiness, before movement/combat. Pending cargo progresses
 * even with no armies. New daily packets are reserved after this step, so no
 * dispatch can also be delivered in the same simulation call. */
export function resolveReinforcements(
  w: World,
  eligibleIds: ReadonlySet<string>,
  elapsedDays = 1 / HOURS_PER_DAY,
): void {
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0 || elapsedDays > 1)
    throw new Error("Takviye adımı 0–1 gün arasında olmalı.");
  if (elapsedDays === 0) return;
  const findRoute = createReinforcementRouter(w);
  let hours = elapsedDays * HOURS_PER_DAY;
  while (w.reinforcements?.shipments.length && hours > EPSILON) {
    const step = Math.min(1, hours);
    stepShipments(w, w.reinforcements, eligibleIds, step, findRoute);
    hours -= step;
  }
  reserveReinforcements(w, eligibleIds, findRoute);
}
