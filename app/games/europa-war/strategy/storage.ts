import {
  HISTORICAL_EVENTS,
  historicalEvent,
  historicalFocusId,
} from "./historical-catalog";
import {
  AIRCRAFT,
  SHIPS,
  SUPPORT,
  SEA_ZONES,
  AIR_MISSIONS,
} from "./advanced-catalog";
import { initializeAssets } from "./military-assets";
import { quickAirOrder, quickNavalOrder } from "./airnaval";
import {
  BUILDINGS,
  EQUIPMENT,
  IDEOLOGIES,
  MISSIONS,
  TECHNOLOGIES,
  UNITS,
  focusTree,
} from "./catalog";
import { GEOGRAPHY, MAP, event, uid } from "./world";
import { COMMANDER_CAPACITY, MAX_COMMANDERS } from "./commander-roster";
import { isValidCommandState } from "./command-types";
import { HOURS_PER_DAY, MAX_CAMPAIGN_HOUR, hourLabel, worldHour } from "./time";
import { isUint32, isValidRandomStreams } from "./rng";
import { MAX_ARMIES } from "./campaign-limits";
import { isTraversableLandEdge } from "./land-corridors";
import {
  MAX_REINFORCEMENT_FRACTION,
  MAX_REINFORCEMENT_SHIPMENTS,
  reinforcementRequirements,
} from "./reinforcements";
import type { ReinforcementCargo } from "./reinforcement-types";
import legacyEurope from "./legacy-europe-map.json";
import {
  extendEuropeanCampaign,
  GLOBAL_MAP_VERSION,
} from "./world-map-migration";
import type { Building, Country, World } from "./types";

type Validator = (value: unknown) => boolean;
const num =
  (max = 1e9, min = 0): Validator =>
  (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const str: Validator = (v) => typeof v === "string" && v.length <= 500;
const bool: Validator = (v) => typeof v === "boolean";
const one =
  (values: readonly unknown[]): Validator =>
  (v) =>
    values.includes(v);
const nullable =
  (v: Validator): Validator =>
  (x) =>
    x === null || v(x);
const arr =
  (v: Validator, max = 1000): Validator =>
  (x) =>
    Array.isArray(x) && x.length <= max && x.every(v);
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const safeKey = (k: string) =>
  /^[a-zA-Z0-9_-]{1,80}$/.test(k) &&
  !["__proto__", "prototype", "constructor"].includes(k);
const record =
  (v: Validator, max = 100): Validator =>
  (x) =>
    object(x) &&
    Object.keys(x).length <= max &&
    Object.entries(x).every(([k, a]) => safeKey(k) && v(a));
const shape =
  (fields: Record<string, Validator>): Validator =>
  (x) =>
    object(x) &&
    Object.keys(x).length === Object.keys(fields).length &&
    Object.entries(fields).every(([k, v]) => Object.hasOwn(x, k) && v(x[k]));
// Existing saves keep their exact shape; new optional fields are validated strictly.
const shapeWithOptionalField = (
  fields: Record<string, Validator>,
  key: string,
  validator: Validator,
): Validator => {
  const original = shape(fields),
    extended = shape({ ...fields, [key]: validator });
  return (x) => original(x) || extended(x);
};
const shapeWithOptionalFields =
  (
    fields: Record<string, Validator>,
    optional: Record<string, Validator>,
  ): Validator =>
  (value) =>
    object(value) &&
    Object.keys(value).every(
      (key) => Object.hasOwn(fields, key) || Object.hasOwn(optional, key),
    ) &&
    Object.entries(fields).every(
      ([key, validate]) => Object.hasOwn(value, key) && validate(value[key]),
    ) &&
    Object.entries(optional).every(
      ([key, validate]) => !Object.hasOwn(value, key) || validate(value[key]),
    );
const province = one(Object.keys(GEOGRAPHY)),
  unit = one(Object.keys(UNITS)),
  equipment = one(Object.keys(EQUIPMENT)),
  building = one(Object.keys(BUILDINGS));
const ideology = one(Object.keys(IDEOLOGIES)),
  tech = one(TECHNOLOGIES.map((t) => t.id)),
  focus = one(MAP.countries.flatMap((c) => focusTree(c.id).map((f) => f.id)));
const MAX_COUNTRIES = Math.max(60, MAP.countries.length * 2);
const countries = arr(str, MAX_COUNTRIES),
  values = (keys: string[], max = 1e9) =>
    shape(Object.fromEntries(keys.map((k) => [k, num(max)])));
const project = { id: str, progress: num(), total: num(1e7, 0.01) };
export const countrySchema: Record<
  Exclude<keyof Country, "autoAssignCommanders">,
  Validator
> = {
  id: str,
  name: str,
  color: (v) => typeof v === "string" && /^#[\da-fA-F]{6}$/.test(v),
  flag: str,
  capital: province,
  leader: str,
  ideology,
  population: num(),
  science: num(10),
  treasury: num(),
  political: num(500),
  manpower: num(),
  mobilized: num(),
  casualties: num(),
  stability: num(100),
  warSupport: num(100),
  exhaustion: num(100),
  economy: one(["civilian", "partial", "war"]),
  conscription: one(["volunteer", "limited", "extensive"]),
  stock: values(["iron", "steel", "oil", "aluminum", "rubber", "fuel"]),
  equipment: values(Object.keys(EQUIPMENT)),
  production: arr(
    shapeWithOptionalField(
      { equipment, factories: num(100), efficiency: num(1) },
      "progress",
      num(1000),
    ),
    20,
  ),
  construction: arr(shape({ ...project, province, building }), 8),
  recruitment: arr(shape({ ...project, province, type: unit }), 6),
  tech: arr(tech, 40),
  research: arr(shape({ ...project, id: tech }), 3),
  focuses: arr(focus, 40),
  focus: nullable(shape({ ...project, id: focus })),
  relations: record(num(100, -100), MAX_COUNTRIES),
  wars: countries,
  allies: countries,
  access: countries,
  embargoes: countries,
  pacts: record(num(), MAX_COUNTRIES),
  justification: record(num(), MAX_COUNTRIES),
  claims: countries,
  subjectOf: nullable(str),
  capitulated: bool,
  victor: nullable(str),
  generals: arr(
    shapeWithOptionalField(
      {
        id: str,
        name: str,
        trait: one(["attack", "defense", "logistics"]),
        skill: num(6),
        xp: num(100),
      },
      "front",
      shape({
        target: str,
        stance: one(["defend", "attack"]),
        assignments: record(province, COMMANDER_CAPACITY),
      }),
    ),
    MAX_COMMANDERS,
  ),
  advisor: one(["industry", "science", "army"]),
  automation: shapeWithOptionalFields(
    {
      economy: bool,
      research: bool,
      recruitment: bool,
      operations: bool,
    },
    { air: bool, navy: bool },
  ),
  cabinet: shape({
    economy: one(["builder", "producer", "trader"]),
    military: one(["defender", "planner", "quartermaster"]),
    science: one(["institute", "engineers", "doctrine"]),
  }),
  decisions: record(num(), 30),
  parties: values(Object.keys(IDEOLOGIES), 100),
  agency: bool,
  agents: num(5),
  agentTraining: num(30),
  counterIntel: bool,
  missions: arr(
    shape({ ...project, target: str, type: one(Object.keys(MISSIONS)) }),
    5,
  ),
  intel: record(shape({ level: num(100), expires: num() }), MAX_COUNTRIES),
  air: shape({
    mission: one(["idle", "superiority", "support", "strategic"]),
    target: str,
    wings: arr(
      shape({
        id: str,
        name: str,
        model: one(Object.keys(AIRCRAFT)),
        count: num(100),
        size: num(100, 1),
        base: province,
        target: province,
        mission: one(Object.keys(AIR_MISSIONS)),
        readiness: num(100),
        experience: num(100),
      }),
      40,
    ),
  }),
  navy: shape({
    mission: one(["idle", "patrol", "raid"]),
    target: str,
    zone: one(Object.keys(SEA_ZONES)),
    ships: arr(
      shape({
        id: str,
        name: str,
        model: one(Object.keys(SHIPS)),
        health: num(100),
        experience: num(100),
        port: province,
        zone: one(Object.keys(SEA_ZONES)),
        mission: one(["idle", "patrol", "raid", "escort"]),
        aircraft: num(30),
        transit: num(30),
      }),
      120,
    ),
  }),
  history: arr(
    shape({ day: num(), treasury: num(), factories: num(), manpower: num() }),
    52,
  ),
};
const worldFields: Record<string, Validator> = {
  version: one([3]),
  player: str,
  mode: one(["historical", "alternative"]),
  difficulty: one(["easy", "normal", "hard"]),
  day: (v) => num(36500)(v) && Number.isInteger(v),
  hour: (v) => num(HOURS_PER_DAY - 1)(v) && Number.isInteger(v),
  seed: isUint32,
  serial: num(),
  tension: num(100),
  countries: record(
    shapeWithOptionalField(countrySchema, "autoAssignCommanders", bool),
    MAX_COUNTRIES,
  ),
  provinces: record(
    shape({
      id: province,
      owner: str,
      controller: str,
      resistance: num(100),
      compliance: num(100),
      damage: num(100),
      occupation: one(["civil", "garrison"]),
      buildings: values(Object.keys(BUILDINGS), 20),
    }),
    MAP.provinces.length,
  ),
  armies: arr(
    shapeWithOptionalField(
      {
        id: str,
        country: str,
        name: str,
        type: unit,
        province,
        strength: num(100.001),
        organization: num(100),
        morale: num(100),
        supply: num(1),
        experience: num(100),
        general: nullable(str),
        entrenchment: num(30),
        stance: one(["hold", "advance"]),
        support: arr(one(Object.keys(SUPPORT)), 3),
        route: arr(province, 500),
        move: nullable(
          (x) =>
            shape({ to: province, progress: num(), days: num(1000, 0.01) })(
              x,
            ) ||
            shape({
              to: province,
              progress: num(),
              days: num(1000, 0.01),
              kind: one(["paradrop", "transport"]),
            })(x),
        ),
      },
      "marchGroup",
      (v) => typeof v === "string" && safeKey(v),
    ),
    MAX_ARMIES,
  ),
  battles: arr(
    shape({
      id: str,
      province,
      attacker: str,
      defender: str,
      started: num(),
      attack: num(),
      defense: num(),
    }),
    500,
  ),
  trades: arr(
    shape({
      id: str,
      from: str,
      to: str,
      resource: one(["iron", "steel", "oil", "aluminum", "rubber", "fuel"]),
      amount: num(20, 0.01),
    }),
    400,
  ),
  fronts: arr(
    shape({
      id: str,
      country: str,
      provinces: arr(province, 20),
      armies: arr(str, MAX_ARMIES),
    }),
    80,
  ),
  plans: arr(
    shape({
      id: str,
      country: str,
      name: str,
      armies: arr(str, MAX_ARMIES),
      objectives: arr(province, 12),
      preparation: num(100),
      active: bool,
      stance: one(["careful", "balanced", "aggressive"]),
    }),
    80,
  ),
  conferences: arr(
    shape({
      id: str,
      defeated: str,
      participants: arr(str, MAX_COUNTRIES),
      points: record(num(), MAX_COUNTRIES),
      available: arr(province, MAP.provinces.length),
      awards: arr(
        shape({
          province,
          country: str,
          kind: one(["annex", "puppet", "liberate"]),
          cost: num(),
        }),
        MAP.provinces.length,
      ),
      round: num(100, 1),
      turn: num(MAX_COUNTRIES - 1),
      status: one(["open", "closed"]),
    }),
    100,
  ),
  warScore: record(record(num(1e7), MAX_COUNTRIES), MAX_COUNTRIES),
  events: arr(
    shapeWithOptionalField(
      {
        day: num(),
        text: str,
        kind: one(["info", "war", "economy", "politics"]),
      },
      "hour",
      (v) => num(HOURS_PER_DAY - 1)(v) && Number.isInteger(v),
    ),
    80,
  ),
  firedEvents: arr(str, 200),
};
const shipmentIdentity: Validator = (value) =>
  typeof value === "string" && safeKey(value);
const reinforcementCargo = shape({
  manpower: num(1e12),
  equipment: (value) =>
    object(value) &&
    Object.keys(value).length <= Object.keys(EQUIPMENT).length &&
    Object.entries(value).every(
      ([key, amount]) => Object.hasOwn(EQUIPMENT, key) && num(1e12)(amount),
    ),
});
const reinforcementState = shape({
  shipments: arr(
    shape({
      id: shipmentIdentity,
      country: shipmentIdentity,
      army: shipmentIdentity,
      unit,
      support: arr(one(Object.keys(SUPPORT)), 3),
      origin: province,
      province,
      destination: province,
      route: arr(province, 1),
      leg: nullable(
        shape({
          to: province,
          hours: num(10000, 0.01),
          progress: num(10000),
        }),
      ),
      loadingHours: num(1),
      status: one(["outbound", "returning"]),
      blocked: nullable(
        one(["route", "combat", "capacity", "depot", "supply"]),
      ),
      cargo: reinforcementCargo,
      createdHour: (value) =>
        num(MAX_CAMPAIGN_HOUR)(value) && Number.isSafeInteger(value),
    }),
    MAX_REINFORCEMENT_SHIPMENTS,
  ),
  ledger: record(
    shape({
      dispatched: reinforcementCargo,
      delivered: reinforcementCargo,
      returned: reinforcementCargo,
      lost: reinforcementCargo,
    }),
    MAX_COUNTRIES,
  ),
  lastDispatchHour: (value) =>
    num(MAX_CAMPAIGN_HOUR)(value) &&
    Number.isSafeInteger(value) &&
    (value as number) % HOURS_PER_DAY === 0,
});
const historicalEventId = one(
  HISTORICAL_EVENTS.map((definition) => definition.id),
);
const historicalDay: Validator = (value) =>
  num(36500)(value) && Number.isSafeInteger(value);
const historicalState = shape({
  pending: arr(
    shape({
      id: shipmentIdentity,
      eventId: historicalEventId,
      initiator: shipmentIdentity,
      recipient: shipmentIdentity,
      stage: one(["initiate", "respond"]),
      createdDay: historicalDay,
    }),
    HISTORICAL_EVENTS.length,
  ),
  resolved: arr(
    shape({
      eventId: historicalEventId,
      day: historicalDay,
      outcome: one(["accepted", "declined", "unavailable"]),
      by: shipmentIdentity,
    }),
    HISTORICAL_EVENTS.length,
  ),
});
const schema = shapeWithOptionalFields(worldFields, {
  historical: historicalState,
  commandState: isValidCommandState,
  rng: isValidRandomStreams,
  mapVersion: one(["world-1936-v1"]),
  reinforcements: reinforcementState,
  airNavalReports: arr(
    shape({
      country: str,
      day: (v) => num(36500)(v) && Number.isInteger(v),
      air: shape({
        flown: num(4000),
        combatLosses: num(4000),
        baseLosses: num(4000),
        reinforced: num(80),
        fuelSpent: num(),
        bombingDamage: num(),
        navalDamage: num(),
        engagements: (v) => num(40)(v) && Number.isInteger(v),
      }),
      navy: shape({
        active: (v) => num(120)(v) && Number.isInteger(v),
        combatDamage: num(12000),
        attritionDamage: num(12000),
        sunk: (v) => num(120)(v) && Number.isInteger(v),
        aircraftLost: num(3600),
        repaired: num(12000),
        fuelSpent: num(),
        engagements: (v) => num(120)(v) && Number.isInteger(v),
      }),
    }),
    MAX_COUNTRIES,
  ),
});

/** In-flight cargo may outlive its target, but it must remain fully paid and
 * geographically meaningful. Validate without repairing or settling the save. */
function validReinforcementReferences(w: World): boolean {
  const state = w.reinforcements;
  if (!state) return true;
  if (state.lastDispatchHour > worldHour(w)) return false;
  const close = (left: number, right: number) =>
    Math.abs(left - right) <=
    1e-8 + Number.EPSILON * Math.max(1, left, right) * 1024;
  const pending = new Map<string, ReinforcementCargo>();
  const identities = new Set<string>();
  const targets = new Set<string>();
  for (const shipment of state.shipments) {
    const target = `${shipment.country}:${shipment.army}`;
    if (
      identities.has(shipment.id) ||
      targets.has(target) ||
      !Object.hasOwn(w.countries, shipment.country) ||
      !Object.hasOwn(state.ledger, shipment.country) ||
      shipment.createdHour > state.lastDispatchHour ||
      shipment.createdHour % HOURS_PER_DAY !== 0 ||
      new Set(shipment.support).size !== shipment.support.length ||
      shipment.support.some(
        (support, i) => i > 0 && shipment.support[i - 1] > support,
      )
    )
      return false;
    identities.add(shipment.id);
    targets.add(target);
    const path = [shipment.province, ...shipment.route];
    if (
      [shipment.origin, shipment.destination, ...path].some(
        (id) => !Object.hasOwn(w.provinces, id),
      ) ||
      new Set(path).size !== path.length ||
      path.some(
        (id, i) =>
          i > 0 &&
          !GEOGRAPHY[path[i - 1]].neighbors.some(
            (edge) =>
              edge.id === id &&
              (edge.sea || isTraversableLandEdge(path[i - 1], id)),
          ),
      ) ||
      (shipment.leg &&
        (shipment.leg.to !== shipment.route[0] ||
          shipment.leg.progress >= shipment.leg.hours ||
          shipment.loadingHours > 0))
    )
      return false;
    const fraction = shipment.cargo.manpower / UNITS[shipment.unit].men;
    const needs = reinforcementRequirements(shipment.unit, shipment.support);
    if (
      fraction <= 0 ||
      fraction > MAX_REINFORCEMENT_FRACTION + 1e-12 ||
      Object.keys(shipment.cargo.equipment).length !==
        Object.keys(needs).length ||
      Object.entries(needs).some(
        ([key, amount]) =>
          !Object.hasOwn(shipment.cargo.equipment, key) ||
          !close(
            shipment.cargo.equipment[key as keyof typeof needs]!,
            amount * fraction,
          ),
      )
    )
      return false;
    const cargo = pending.get(shipment.country) ?? {
      manpower: 0,
      equipment: {},
    };
    cargo.manpower += shipment.cargo.manpower;
    for (const [key, amount] of Object.entries(shipment.cargo.equipment)) {
      const equipmentId = key as keyof typeof cargo.equipment;
      cargo.equipment[equipmentId] =
        (cargo.equipment[equipmentId] ?? 0) + amount;
    }
    pending.set(shipment.country, cargo);
  }
  for (const [country, ledger] of Object.entries(state.ledger)) {
    if (!Object.hasOwn(w.countries, country)) return false;
    const cargo = pending.get(country);
    if (
      !close(
        ledger.dispatched.manpower,
        ledger.delivered.manpower +
          ledger.returned.manpower +
          ledger.lost.manpower +
          (cargo?.manpower ?? 0),
      )
    )
      return false;
    for (const key of Object.keys(EQUIPMENT)) {
      const equipmentId = key as keyof typeof ledger.dispatched.equipment;
      if (
        !close(
          ledger.dispatched.equipment[equipmentId] ?? 0,
          (ledger.delivered.equipment[equipmentId] ?? 0) +
            (ledger.returned.equipment[equipmentId] ?? 0) +
            (ledger.lost.equipment[equipmentId] ?? 0) +
            (cargo?.equipment[equipmentId] ?? 0),
        )
      )
        return false;
    }
  }
  return true;
}
function validateWithRegions(
  value: unknown,
  regionIds: readonly string[],
  allowLegacyCommanderOverflow = false,
  requiredCountries: readonly string[] = MAP.countries.map(
    (country) => country.id,
  ),
): value is World {
  if (!schema(value)) return false;
  const w = value as World,
    ids = Object.keys(w.countries),
    has = (id: string) => ids.includes(id);
  if (w.rng && w.rng.intelligence !== w.seed) return false;
  if (w.historical) {
    const all = [...w.historical.pending, ...w.historical.resolved];
    if (new Set(all.map((item) => item.eventId)).size !== all.length)
      return false;
    if (
      w.historical.pending.some((item) => {
        const definition = historicalEvent(item.eventId)!;
        return (
          item.id !== historicalFocusId(definition.id) ||
          item.initiator !== definition.country ||
          !has(item.initiator) ||
          !has(item.recipient) ||
          item.createdDay > w.day ||
          !w.countries[item.initiator].focuses.includes(
            historicalFocusId(item.eventId),
          ) ||
          (item.stage === "initiate"
            ? item.recipient !== item.initiator
            : item.recipient !== definition.target ||
              ["war", "aid", "defense"].includes(definition.kind))
        );
      })
    )
      return false;
    if (
      w.historical.resolved.some((item) => {
        const definition = historicalEvent(item.eventId)!;
        return (
          !has(item.by) ||
          item.day > w.day ||
          !w.countries[definition.country]?.focuses.includes(
            historicalFocusId(item.eventId),
          ) ||
          (item.by !== definition.country && item.by !== definition.target)
        );
      })
    )
      return false;
  }

  if (
    w.airNavalReports &&
    (new Set(w.airNavalReports.map((report) => report.country)).size !==
      w.airNavalReports.length ||
      w.airNavalReports.some(
        (report) =>
          !has(report.country) ||
          report.day > w.day ||
          report.day !== w.airNavalReports![0].day,
      ))
  )
    return false;
  // Receipts may refer to completed or destroyed assets, but their issuer and
  // execution time must belong to this campaign. Never repair a corrupt ledger:
  // doing so could allow an already-paid command to execute again after loading.
  if (
    Object.hasOwn(w, "commandState") &&
    !isValidCommandState(w.commandState, ids, worldHour(w))
  )
    return false;
  if (
    !has(w.player) ||
    Object.keys(w.provinces).length !== regionIds.length ||
    regionIds.some((id) => !Object.hasOwn(w.provinces, id)) ||
    requiredCountries.some((id) => !has(id))
  )
    return false;
  if (
    Object.entries(w.countries).some(
      ([id, c]) =>
        id !== c.id ||
        !requiredCountries.some(
          (base) => id === base || id === `${base}-rebels`,
        ),
    )
  )
    return false;
  if (
    Object.entries(w.provinces).some(
      ([id, p]) => id !== p.id || !has(p.owner) || !has(p.controller),
    )
  )
    return false;
  if (
    w.reinforcements &&
    (regionIds.length !== MAP.provinces.length ||
      !validReinforcementReferences(w))
  )
    return false;
  const armiesById = new Map(w.armies.map((army) => [army.id, army]));
  const generalCounts = new Map<string, Map<string, number>>();
  for (const army of w.armies) {
    if (army.general === null) continue;
    let counts = generalCounts.get(army.country);
    if (!counts) generalCounts.set(army.country, (counts = new Map()));
    counts.set(army.general, (counts.get(army.general) ?? 0) + 1);
  }
  for (const c of Object.values(w.countries)) {
    const legacyCommanders =
      allowLegacyCommanderOverflow &&
      !Object.hasOwn(c, "autoAssignCommanders") &&
      c.generals.every((general) => !Object.hasOwn(general, "front"));
    if (
      new Set(c.generals.map((general) => general.id)).size !==
        c.generals.length ||
      c.generals.some((general) => {
        if (
          !legacyCommanders &&
          (generalCounts.get(c.id)?.get(general.id) ?? 0) > COMMANDER_CAPACITY
        )
          return true;
        if (!general.front) return false;
        if (!has(general.front.target) || general.front.target === c.id)
          return true;
        return Object.entries(general.front.assignments).some(
          ([id, provinceId]) => {
            const army = armiesById.get(id);
            return (
              !army ||
              army.country !== c.id ||
              army.general !== general.id ||
              !Object.hasOwn(w.provinces, provinceId)
            );
          },
        );
      })
    )
      return false;
    const regionRefs = [
      c.capital,
      ...c.construction.map((p) => p.province),
      ...c.recruitment.map((p) => p.province),
      ...c.air.wings.flatMap((a) => [a.base, a.target]),
      ...c.navy.ships.map((s) => s.port),
    ];
    if (regionRefs.some((id) => !Object.hasOwn(w.provinces, id))) return false;
    const allowedFocus = focusTree(c.id).map((f) => f.id);
    if (
      c.focuses.some((id) => !allowedFocus.includes(id)) ||
      (c.focus && !allowedFocus.includes(c.focus.id))
    )
      return false;
    const refs = [
      ...c.wars,
      ...c.allies,
      ...c.access,
      ...c.claims,
      ...c.embargoes,
      ...Object.keys(c.relations),
      ...Object.keys(c.pacts),
      ...Object.keys(c.justification),
      ...Object.keys(c.intel),
      ...c.missions.map((m) => m.target),
      c.air.target,
      c.navy.target,
      ...(c.subjectOf ? [c.subjectOf] : []),
      ...(c.victor ? [c.victor] : []),
    ];
    if (
      refs.some((id) => !has(id)) ||
      c.generals.length < 2 ||
      c.wars.includes(c.id) ||
      c.wars.some((id) => !w.countries[id].wars.includes(c.id))
    )
      return false;
    if (
      new Set(c.production.map((p) => p.equipment)).size !==
        c.production.length ||
      c.production.some(
        (line) =>
          !Number.isInteger(line.factories) ||
          (line.progress ?? 0) >= EQUIPMENT[line.equipment].cost,
      ) ||
      new Set(c.tech).size !== c.tech.length ||
      c.agents + c.missions.length > 5 ||
      c.air.wings.some(
        (a) =>
          a.count > a.size ||
          (a.mission !== "idle" &&
            !AIRCRAFT[a.model].missions.includes(a.mission)),
      ) ||
      c.navy.ships.some(
        (s) =>
          !GEOGRAPHY[s.port].port ||
          (s.model !== "carrier" && s.aircraft > 0) ||
          (s.model !== "submarine" && s.mission === "raid"),
      ) ||
      new Set(c.air.wings.map((a) => a.id)).size !== c.air.wings.length ||
      new Set(c.navy.ships.map((a) => a.id)).size !== c.navy.ships.length
    )
      return false;
  }
  if (
    new Set(w.armies.map((a) => a.id)).size !== w.armies.length ||
    w.armies.some(
      (a) =>
        !has(a.country) ||
        [a.province, ...a.route, ...(a.move ? [a.move.to] : [])].some(
          (id) => !Object.hasOwn(w.provinces, id),
        ) ||
        new Set(a.support).size !== a.support.length ||
        (a.general !== null &&
          !w.countries[a.country].generals.some((g) => g.id === a.general)),
    )
  )
    return false;
  if (
    w.trades.some((t) => !has(t.from) || !has(t.to)) ||
    w.battles.some(
      (b) =>
        !has(b.attacker) ||
        !has(b.defender) ||
        !Object.hasOwn(w.provinces, b.province),
    )
  )
    return false;
  if (
    w.fronts.some(
      (f) =>
        !has(f.country) ||
        f.provinces.length < 2 ||
        f.provinces.some((id) => !Object.hasOwn(w.provinces, id)),
    )
  )
    return false;
  if (
    w.plans.some(
      (p) =>
        !has(p.country) ||
        p.objectives.length === 0 ||
        p.objectives.some((id) => !Object.hasOwn(w.provinces, id)) ||
        new Set(p.armies).size !== p.armies.length ||
        p.armies.some(
          (id) => !w.armies.some((a) => a.id === id && a.country === p.country),
        ),
    )
  )
    return false;
  if (
    Object.entries(w.warScore).some(
      ([id, enemies]) => !has(id) || Object.keys(enemies).some((e) => !has(e)),
    )
  )
    return false;
  for (const q of w.conferences) {
    if (
      !has(q.defeated) ||
      q.participants.length === 0 ||
      q.participants.includes(q.defeated) ||
      new Set(q.participants).size !== q.participants.length ||
      q.participants.some((id) => !has(id) || !Object.hasOwn(q.points, id)) ||
      Object.keys(q.points).some((id) => !q.participants.includes(id)) ||
      !Number.isInteger(q.turn) ||
      q.turn >= q.participants.length ||
      q.awards.some((a) => !q.participants.includes(a.country))
    )
      return false;
    const regions = [...q.available, ...q.awards.map((a) => a.province)];
    if (regions.some((id) => !Object.hasOwn(w.provinces, id))) return false;
    if (new Set(regions).size !== regions.length) return false;
    if (
      q.status === "open" &&
      (!w.countries[q.defeated].capitulated ||
        regions.some((id) => w.provinces[id].owner !== q.defeated))
    )
      return false;
  }
  return true;
}
export function validateWorld(value: unknown): value is World {
  return validateWithRegions(
    value,
    MAP.provinces.map((p) => p.id),
  );
}

const legacyRegion = (p: (typeof MAP.provinces)[number]) =>
  (p as typeof p & { legacyRegion?: string }).legacyRegion ?? p.id;
const oldRegionIds = legacyEurope.regionalIds;
const isGlobalMap = () =>
  (MAP as { scenario?: string }).scenario === GLOBAL_MAP_VERSION;
const legacyCountriesFor = (regionIds: readonly string[]) =>
  regionIds === oldRegionIds || regionIds === legacyEurope.provinceIds
    ? legacyEurope.countryIds
    : MAP.countries.map((country) => country.id);

/** Old saves had no general capacity. Split only validated legacy groups;
 * modern, malformed commander orders must never be silently repaired. */
function migrateCommanderCapacity(value: unknown): unknown {
  if (
    !object(value) ||
    !object(value.countries) ||
    !Array.isArray(value.armies)
  )
    return value;
  const counts = new Map<string, Map<string, number>>();
  for (const army of value.armies) {
    if (
      !object(army) ||
      typeof army.country !== "string" ||
      typeof army.general !== "string"
    )
      continue;
    let country = counts.get(army.country);
    if (!country) counts.set(army.country, (country = new Map()));
    country.set(army.general, (country.get(army.general) ?? 0) + 1);
  }
  const legacyCountries = Object.values(value.countries).filter(
    (country) =>
      object(country) &&
      !Object.hasOwn(country, "autoAssignCommanders") &&
      Array.isArray(country.generals) &&
      country.generals.every(
        (general) => object(general) && !Object.hasOwn(general, "front"),
      ),
  );
  const overflowing = legacyCountries.some((country) => {
    if (
      !object(country) ||
      typeof country.id !== "string" ||
      !Array.isArray(country.generals)
    )
      return false;
    const sizes = counts.get(country.id);
    return country.generals.some(
      (general) =>
        object(general) &&
        typeof general.id === "string" &&
        (sizes?.get(general.id) ?? 0) > COMMANDER_CAPACITY,
    );
  });
  if (!overflowing) return value;
  const regionIds =
    object(value.provinces) &&
    Object.keys(value.provinces).length === oldRegionIds.length
      ? oldRegionIds
      : object(value.provinces) &&
          Object.keys(value.provinces).length ===
            legacyEurope.provinceIds.length
        ? legacyEurope.provinceIds
        : MAP.provinces.map((p) => p.id);
  if (
    !validateWithRegions(value, regionIds, true, legacyCountriesFor(regionIds))
  )
    throw new Error("Geçersiz eski komutan kaydı");
  const w = structuredClone(value);
  const used = new Set(
    Object.values(w.countries).flatMap((c) => c.generals.map((g) => g.id)),
  );
  for (const c of Object.values(w.countries)) {
    if (
      Object.hasOwn(c, "autoAssignCommanders") ||
      c.generals.some((g) => g.front)
    )
      continue;
    for (const general of [...c.generals]) {
      const members = w.armies.filter(
        (a) => a.country === c.id && a.general === general.id,
      );
      if (members.length <= COMMANDER_CAPACITY) continue;
      c.autoAssignCommanders = false;
      for (
        let i = COMMANDER_CAPACITY;
        i < members.length;
        i += COMMANDER_CAPACITY
      ) {
        if (c.generals.length >= MAX_COMMANDERS)
          throw new Error("Eski komutan kaydı kapasite sınırını aşıyor");
        let id: string;
        do {
          id = uid(w, "general");
        } while (used.has(id));
        used.add(id);
        c.generals.push({
          ...general,
          id,
          name: `${general.name.slice(0, 400)} · ${c.generals.length + 1}. komuta`,
        });
        for (const army of members.slice(i, i + COMMANDER_CAPACITY))
          army.general = id;
      }
    }
  }
  event(
    w,
    "Eski komutan grupları 12 tümen kapasitesine ayrıldı. Tümenler ve mevcut emirleri korundu; yeni komutanlara sınır atayabilirsin.",
  );
  return w;
}

/** Upgrade complete, validated regional saves; never fill holes in a damaged city save. */
function migrateCityRegions(value: unknown): unknown {
  if (
    !object(value) ||
    !object(value.provinces) ||
    Object.keys(value.provinces).length === MAP.provinces.length ||
    Object.keys(value.provinces).length === legacyEurope.provinceIds.length ||
    oldRegionIds.length === MAP.provinces.length
  )
    return value;
  if (
    Object.hasOwn(value, "mapVersion") ||
    !validateWithRegions(value, oldRegionIds, false, legacyEurope.countryIds)
  )
    throw new Error("Geçersiz eski bölge haritası");
  const w = structuredClone(value);
  const groups = new Map(
    oldRegionIds.map((id) => [
      id,
      MAP.provinces.filter((p) => legacyRegion(p) === id),
    ]),
  );
  const expanded: World["provinces"] = {};
  for (const [id, cities] of groups) {
    const old = w.provinces[id];
    for (const city of cities) {
      expanded[city.id] = {
        ...old,
        id: city.id,
        buildings: { ...old.buildings },
      };
      // Roads and rail now cover smaller sections of the same network. Fixed
      // installations keep their original city, preserving naval and air bases.
      if (city.id !== id)
        for (const b of Object.keys(BUILDINGS) as Building[])
          if (b !== "infra" && b !== "rail") expanded[city.id].buildings[b] = 0;
    }
    for (const b of ["civil", "military", "mine"] as const) {
      const total = old.buildings[b],
        whole = Math.floor(total);
      let weights = cities.map((p) =>
        b === "mine"
          ? p.resources.iron + p.resources.oil + p.resources.aluminum
          : p[b],
      );
      if (!weights.some((n) => n > 0))
        weights = cities.map((p) => p.population);
      if (!weights.some((n) => n > 0)) weights = cities.map(() => 1);
      const sum = weights.reduce((a, n) => a + n, 0);
      const exact = weights.map((n) => (whole * n) / sum);
      const allocated = exact.map(Math.floor);
      const priority = exact
        .map((n, i) => ({ i, remainder: n - allocated[i] }))
        .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
      for (
        let n = whole - allocated.reduce((a, b) => a + b, 0), i = 0;
        n > 0;
        n--, i++
      )
        allocated[priority[i % priority.length].i]++;
      for (let i = 0; i < cities.length; i++)
        expanded[cities[i].id].buildings[b] = allocated[i];
      expanded[id].buildings[b] += total - whole;
    }
  }
  w.provinces = expanded;
  const connected = (a: string, b: string) =>
    GEOGRAPHY[a].neighbors.some((n) => n.id === b);
  for (const a of w.armies) {
    const steps = [a.province, ...(a.move ? [a.move.to] : []), ...a.route];
    if (
      steps.some(
        (id, i) =>
          i > 0 &&
          id !== steps[i - 1] &&
          !(i === 1 && a.move?.kind === "paradrop") &&
          !connected(steps[i - 1], id),
      )
    ) {
      a.move = null;
      a.route = [];
    }
  }
  w.fronts = w.fronts.filter((f) =>
    f.provinces.every((id, i) => !i || connected(f.provinces[i - 1], id)),
  );
  w.battles = [];
  for (const q of w.conferences) {
    // A previously awarded region keeps its recipient, including all of its new
    // cities. Remaining purchasing power scales with the finer-grained map.
    const oldCost = (id: string) =>
      10 +
      GEOGRAPHY[id].vp * 2 +
      groups
        .get(id)!
        .reduce((n, p) => n + p.civil * 3 + p.military * 3 + p.dock * 2, 0);
    const cityCost = (id: string) => {
      const p = GEOGRAPHY[id];
      return 10 + p.vp * 2 + p.civil * 3 + p.military * 3 + p.dock * 2;
    };
    const previousBudget = q.available.reduce((n, id) => n + oldCost(id), 0);
    q.available = q.available.flatMap((id) => groups.get(id)!.map((p) => p.id));
    const newBudget = q.available.reduce((n, id) => n + cityCost(id), 0);
    if (previousBudget > 0)
      for (const id of q.participants)
        q.points[id] *= newBudget / previousBudget;
    q.awards = q.awards.flatMap((award) => {
      const cities = groups.get(award.province)!,
        cost = cities.reduce((n, p) => n + cityCost(p.id), 0);
      return cities.map((p) => ({
        ...award,
        province: p.id,
        cost: (award.cost * cityCost(p.id)) / cost,
      }));
    });
  }
  event(
    w,
    "Kayıt şehir sınırlarına aktarıldı. Topraklar ve fabrikalar korundu; değişen yollardaki hareket ve cephe emirlerini yeniden ver.",
  );
  return w;
}

/** Only a complete recognized Europe save may expand; never repair a damaged world save. */
function migrateGlobalMap(value: unknown): unknown {
  if (!isGlobalMap() || !object(value) || Object.hasOwn(value, "mapVersion"))
    return value;
  if (
    !object(value.provinces) ||
    Object.keys(value.provinces).length === MAP.provinces.length
  )
    return value;
  if (
    !validateWithRegions(
      value,
      legacyEurope.provinceIds,
      false,
      legacyEurope.countryIds,
    )
  )
    throw new Error("Geçersiz eski Avrupa haritası");
  return extendEuropeanCampaign(value);
}

export function encodeSave(w: World) {
  return JSON.stringify({
    format: "xarmy-europa-1936",
    version: 3,
    savedAt: new Date().toISOString(),
    world: w,
  });
}
export function migrateLegacy(value: unknown): World {
  if (
    !object(value) ||
    value.version !== 1 ||
    Object.hasOwn(value, "hour") ||
    Object.hasOwn(value, "commandState") ||
    !object(value.countries) ||
    !object(value.provinces) ||
    !Array.isArray(value.armies)
  )
    throw new Error("Geçersiz eski kayıt");
  const w = structuredClone(value) as unknown as World;
  const newEquipment = [
    "strategicBomber",
    "reconPlane",
    "transport",
    "carrierFighter",
    "destroyer",
    "battleship",
  ] as const;
  const newBuildings = ["mine", "airfield", "antiAir"] as const;
  for (const c of Object.values(w.countries)) {
    if (
      !object(c) ||
      !object(c.equipment) ||
      !object(c.air) ||
      !object(c.navy) ||
      ["automation", "cabinet", "decisions"].some((k) => Object.hasOwn(c, k)) ||
      Object.hasOwn(c.air, "wings") ||
      Object.hasOwn(c.navy, "ships") ||
      Object.hasOwn(c.navy, "zone") ||
      newEquipment.some((k) => Object.hasOwn(c.equipment, k))
    )
      throw new Error("Geçersiz eski ülke");
    c.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    c.cabinet = {
      economy: "builder",
      military: "defender",
      science: "institute",
    };
    c.decisions = {};
    for (const e of newEquipment) c.equipment[e] = 0;
    c.air.wings = [];
    c.navy.ships = [];
    c.navy.zone = "atlantic";
  }
  for (const p of Object.values(w.provinces)) {
    if (
      !object(p) ||
      !object(p.buildings) ||
      newBuildings.some((k) => Object.hasOwn(p.buildings, k))
    )
      throw new Error("Geçersiz eski bölge");
    p.buildings.mine = 0;
    p.buildings.airfield = Object.values(w.countries).some(
      (c) => c.capital === p.id,
    )
      ? 1
      : 0;
    p.buildings.antiAir = 0;
  }
  for (const a of w.armies) {
    if (!object(a) || Object.hasOwn(a, "support"))
      throw new Error("Geçersiz eski tümen");
    a.support = [];
  }
  if (["plans", "conferences", "warScore"].some((k) => Object.hasOwn(w, k)))
    throw new Error("Geçersiz eski sürüm");
  w.version = 3;
  w.hour = 0;
  w.plans = [];
  w.conferences = [];
  w.warScore = {};
  w.difficulty = "easy";
  const expanded = migrateGlobalMap(
    migrateCityRegions(migrateCommanderCapacity(w)),
  );
  if (!validateWorld(expanded)) throw new Error("Geçersiz eski sefer");
  for (const c of Object.values(expanded.countries)) {
    // Newly added global countries already own initialized, paid-for assets.
    if (!Object.hasOwn(value.countries, c.id)) continue;
    initializeAssets(expanded, c);
    quickAirOrder(expanded, c, c.air.mission, c.air.target);
    quickNavalOrder(expanded, c, c.navy.mission, c.navy.target);
  }
  return expanded;
}

/** Genuine daily saves start at midnight; never silently rewind an hourly save. */
function migrateDailyWorld(value: unknown): unknown {
  if (!object(value) || value.version !== 2 || Object.hasOwn(value, "hour"))
    throw new Error("Geçersiz günlük sefer kaydı");
  if (Object.hasOwn(value, "commandState")) {
    // The old protocol only emitted daily-boundary ticks. Preserve its ledger
    // exactly; accepting malformed old timestamps could change duplicate IDs.
    if (
      !isValidCommandState(value.commandState) ||
      value.commandState.receipts.some(
        (receipt) =>
          receipt.issuedTick % HOURS_PER_DAY !== 0 ||
          receipt.appliedTick % HOURS_PER_DAY !== 0,
      )
    )
      throw new Error("Geçersiz eski emir günlüğü");
  }
  return { ...structuredClone(value), version: 3, hour: 0 };
}
const MAX_SAVE_LENGTH = 4 * 1024 * 1024;
export function decodeSave(text: string): World {
  if (text.length > MAX_SAVE_LENGTH)
    throw new Error("Kayıt dosyası 4 MB sınırını aşıyor.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Kayıt dosyası geçerli JSON değil.");
  }
  if (
    !object(data) ||
    data.format !== "xarmy-europa-1936" ||
    ![1, 2, 3].includes(data.version as number)
  )
    throw new Error("Bu dosya bir Europa War kaydı değil.");
  let world: unknown = data.world;
  try {
    if (!object(world) || world.version !== data.version)
      throw new Error("Kayıt ve sefer sürümü uyuşmuyor");
    if (data.version === 1) world = migrateLegacy(world);
    else {
      if (data.version === 2) world = migrateDailyWorld(world);
      world = migrateGlobalMap(
        migrateCityRegions(migrateCommanderCapacity(world)),
      );
    }
  } catch {
    throw new Error("Eski kayıt bozuk; mevcut seferin değiştirilmedi.");
  }
  if (!validateWorld(world))
    throw new Error(
      "Bu kayıt eksik, bozuk veya farklı bir oyun sürümüne ait. Mevcut seferin değiştirilmedi.",
    );
  return world;
}
export const SAVE_SLOTS = [
  "slot-1",
  "slot-2",
  "slot-3",
  "auto-1",
  "auto-2",
] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
/** Native storage events only notify other tabs; this also refreshes this window. */
export const SAVE_CHANGE_EVENT = "xarmy-europa-save-change";
const key = (slot: SaveSlot) => `xarmy-europa-1936-v1:${slot}`;
export interface SaveSummary {
  slot: SaveSlot;
  label: string;
  valid: boolean;
}
// Retain metadata, never decoded worlds. One entry per supported slot bounds the
// cache; exact text comparison also detects edits made by another tab or tool.
const summaryCache = new Map<
  SaveSlot,
  { raw: string | null; summary: SaveSummary }
>();
export function saveLocal(slot: SaveSlot, w: World) {
  try {
    localStorage.setItem(key(slot), encodeSave(w));
  } catch {
    throw new Error(
      "Cihaz kaydı yapılamadı. Depolama iznini/boş alanı kontrol et veya JSON dosyası indir.",
    );
  }
  summaryCache.delete(slot);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SAVE_CHANGE_EVENT));
}
export function loadLocal(slot: SaveSlot): World {
  const raw = localStorage.getItem(key(slot));
  if (!raw) throw new Error("Bu kayıt yuvası boş.");
  return decodeSave(raw);
}
export function listSaves(): SaveSummary[] {
  return SAVE_SLOTS.map((slot) => {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key(slot));
    } catch {
      // A previous valid label must not conceal revoked storage access.
      summaryCache.delete(slot);
      return { slot, label: "Okunamayan kayıt", valid: false };
    }
    const cached = summaryCache.get(slot);
    if (cached && cached.raw === raw) return { ...cached.summary };
    let summary: SaveSummary;
    if (!raw) summary = { slot, label: "Boş yuva", valid: false };
    else {
      try {
        const w = decodeSave(raw);
        summary = {
          slot,
          label: `${w.countries[w.player].name} · ${w.day}. gün · ${hourLabel(worldHour(w))}`,
          valid: true,
        };
      } catch {
        summary = { slot, label: "Okunamayan kayıt", valid: false };
      }
    }
    if (raw === null || raw.length <= MAX_SAVE_LENGTH)
      summaryCache.set(slot, { raw, summary });
    else summaryCache.delete(slot); // Never retain arbitrarily large bad input.
    return { ...summary };
  });
}
