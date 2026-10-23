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
import { GEOGRAPHY, MAP, event } from "./world";
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
// Existing saves keep their exact shape; a coordinated march adds one validated field.
const shapeWithOptionalField = (
  fields: Record<string, Validator>,
  key: string,
  validator: Validator,
): Validator => {
  const original = shape(fields),
    extended = shape({ ...fields, [key]: validator });
  return (x) => original(x) || extended(x);
};
const province = one(Object.keys(GEOGRAPHY)),
  unit = one(Object.keys(UNITS)),
  equipment = one(Object.keys(EQUIPMENT)),
  building = one(Object.keys(BUILDINGS));
const ideology = one(Object.keys(IDEOLOGIES)),
  tech = one(TECHNOLOGIES.map((t) => t.id)),
  focus = one(MAP.countries.flatMap((c) => focusTree(c.id).map((f) => f.id)));
const countries = arr(str, 60),
  values = (keys: string[], max = 1e9) =>
    shape(Object.fromEntries(keys.map((k) => [k, num(max)])));
const project = { id: str, progress: num(), total: num(1e7, 0.01) };
export const countrySchema: Record<keyof Country, Validator> = {
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
    shape({ equipment, factories: num(100), efficiency: num(1) }),
    20,
  ),
  construction: arr(shape({ ...project, province, building }), 8),
  recruitment: arr(shape({ ...project, province, type: unit }), 6),
  tech: arr(tech, 40),
  research: arr(shape({ ...project, id: tech }), 3),
  focuses: arr(focus, 40),
  focus: nullable(shape({ ...project, id: focus })),
  relations: record(num(100, -100), 60),
  wars: countries,
  allies: countries,
  access: countries,
  embargoes: countries,
  pacts: record(num(), 60),
  justification: record(num(), 60),
  claims: countries,
  subjectOf: nullable(str),
  capitulated: bool,
  victor: nullable(str),
  generals: arr(
    shape({
      id: str,
      name: str,
      trait: one(["attack", "defense", "logistics"]),
      skill: num(6),
      xp: num(100),
    }),
    10,
  ),
  advisor: one(["industry", "science", "army"]),
  automation: shape({
    economy: bool,
    research: bool,
    recruitment: bool,
    operations: bool,
  }),
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
  intel: record(shape({ level: num(100), expires: num() }), 60),
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
  version: one([2]),
  player: str,
  mode: one(["historical", "alternative"]),
  difficulty: one(["easy", "normal", "hard"]),
  day: (v) => num(36500)(v) && Number.isInteger(v),
  seed: num(4294967295),
  serial: num(),
  tension: num(100),
  countries: record(shape(countrySchema), 60),
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
              kind: one(["paradrop"]),
            })(x),
        ),
      },
      "marchGroup",
      (v) => typeof v === "string" && safeKey(v),
    ),
    2500,
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
      armies: arr(str, 2500),
    }),
    80,
  ),
  plans: arr(
    shape({
      id: str,
      country: str,
      name: str,
      armies: arr(str, 2500),
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
      participants: arr(str, 60),
      points: record(num(), 60),
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
      turn: num(59),
      status: one(["open", "closed"]),
    }),
    100,
  ),
  warScore: record(record(num(1e7), 60), 60),
  events: arr(
    shape({
      day: num(),
      text: str,
      kind: one(["info", "war", "economy", "politics"]),
    }),
    80,
  ),
  firedEvents: arr(str, 200),
};
const schema = shape(worldFields);
function validateWithRegions(
  value: unknown,
  regionIds: readonly string[],
): value is World {
  if (!schema(value)) return false;
  const w = value as World,
    ids = Object.keys(w.countries),
    has = (id: string) => ids.includes(id);
  if (
    !has(w.player) ||
    Object.keys(w.provinces).length !== regionIds.length ||
    regionIds.some((id) => !Object.hasOwn(w.provinces, id)) ||
    MAP.countries.some((c) => !has(c.id))
  )
    return false;
  if (
    Object.entries(w.countries).some(
      ([id, c]) =>
        id !== c.id ||
        !MAP.countries.some((d) => id === d.id || id === `${d.id}-rebels`),
    )
  )
    return false;
  if (
    Object.entries(w.provinces).some(
      ([id, p]) => id !== p.id || !has(p.owner) || !has(p.controller),
    )
  )
    return false;
  for (const c of Object.values(w.countries)) {
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
        (a.general &&
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
const oldRegionIds = MAP.provinces
  .filter((p) => legacyRegion(p) === p.id)
  .map((p) => p.id);

/** Upgrade complete, validated regional saves; never fill holes in a damaged city save. */
function migrateCityRegions(value: unknown): unknown {
  if (
    !object(value) ||
    !object(value.provinces) ||
    Object.keys(value.provinces).length === MAP.provinces.length ||
    oldRegionIds.length === MAP.provinces.length
  )
    return value;
  if (!validateWithRegions(value, oldRegionIds))
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

export function encodeSave(w: World) {
  return JSON.stringify({
    format: "xarmy-europa-1936",
    version: 2,
    savedAt: new Date().toISOString(),
    world: w,
  });
}
export function migrateLegacy(value: unknown): World {
  if (
    !object(value) ||
    value.version !== 1 ||
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
  w.version = 2;
  w.plans = [];
  w.conferences = [];
  w.warScore = {};
  w.difficulty = "easy";
  const expanded = migrateCityRegions(w);
  if (!validateWorld(expanded)) throw new Error("Geçersiz eski sefer");
  for (const c of Object.values(expanded.countries)) {
    initializeAssets(expanded, c);
    quickAirOrder(expanded, c, c.air.mission, c.air.target);
    quickNavalOrder(expanded, c, c.navy.mission, c.navy.target);
  }
  return expanded;
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
    ![1, 2].includes(data.version as number)
  )
    throw new Error("Bu dosya bir Europa War kaydı değil.");
  let world: unknown = data.world;
  try {
    if (data.version === 1) world = migrateLegacy(world);
    else world = migrateCityRegions(world);
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
          label: `${w.countries[w.player].name} · ${w.day}. gün`,
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
