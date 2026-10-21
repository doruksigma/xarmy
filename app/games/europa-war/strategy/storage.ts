import {
  BUILDINGS,
  EQUIPMENT,
  IDEOLOGIES,
  MISSIONS,
  TECHNOLOGIES,
  UNITS,
  focusTree,
} from "./catalog";
import { GEOGRAPHY, MAP } from "./world";
import type { Country, World } from "./types";

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
const province = one(Object.keys(GEOGRAPHY)),
  unit = one(Object.keys(UNITS)),
  equipment = one(Object.keys(EQUIPMENT)),
  building = one(Object.keys(BUILDINGS));
const ideology = one(Object.keys(IDEOLOGIES)),
  tech = one(TECHNOLOGIES.map((t) => t.id)),
  focus = one(focusTree("turkey").map((f) => f.id));
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
    11,
  ),
  construction: arr(shape({ ...project, province, building }), 8),
  recruitment: arr(shape({ ...project, province, type: unit }), 6),
  tech: arr(tech, 40),
  research: arr(shape({ ...project, id: tech }), 3),
  focuses: arr(focus, 20),
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
  }),
  navy: shape({ mission: one(["idle", "patrol", "raid"]), target: str }),
  history: arr(
    shape({ day: num(), treasury: num(), factories: num(), manpower: num() }),
    52,
  ),
};
const schema = shape({
  version: one([1]),
  player: str,
  mode: one(["historical", "alternative"]),
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
    shape({
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
      route: arr(province, 500),
      move: nullable(
        shape({ to: province, progress: num(), days: num(1000, 0.01) }),
      ),
    }),
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
  events: arr(
    shape({
      day: num(),
      text: str,
      kind: one(["info", "war", "economy", "politics"]),
    }),
    80,
  ),
  firedEvents: arr(str, 200),
});
export function validateWorld(value: unknown): value is World {
  if (!schema(value)) return false;
  const w = value as World,
    ids = Object.keys(w.countries),
    has = (id: string) => ids.includes(id);
  if (
    !has(w.player) ||
    Object.keys(w.provinces).length !== MAP.provinces.length ||
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
      c.agents + c.missions.length > 5
    )
      return false;
  }
  if (
    new Set(w.armies.map((a) => a.id)).size !== w.armies.length ||
    w.armies.some(
      (a) =>
        !has(a.country) ||
        (a.general &&
          !w.countries[a.country].generals.some((g) => g.id === a.general)),
    )
  )
    return false;
  if (
    w.trades.some((t) => !has(t.from) || !has(t.to)) ||
    w.battles.some((b) => !has(b.attacker) || !has(b.defender))
  )
    return false;
  if (w.fronts.some((f) => !has(f.country) || f.provinces.length < 2))
    return false;
  return true;
}
export function encodeSave(w: World) {
  return JSON.stringify({
    format: "xarmy-europa-1936",
    version: 1,
    savedAt: new Date().toISOString(),
    world: w,
  });
}
export function decodeSave(text: string): World {
  if (text.length > 4 * 1024 * 1024)
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
    data.version !== 1 ||
    !validateWorld(data.world)
  )
    throw new Error(
      "Bu kayıt eksik, bozuk veya farklı bir oyun sürümüne ait. Mevcut seferin değiştirilmedi.",
    );
  return data.world;
}
export const SAVE_SLOTS = [
  "slot-1",
  "slot-2",
  "slot-3",
  "auto-1",
  "auto-2",
] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
const key = (slot: SaveSlot) => `xarmy-europa-1936-v1:${slot}`;
export function saveLocal(slot: SaveSlot, w: World) {
  try {
    localStorage.setItem(key(slot), encodeSave(w));
  } catch {
    throw new Error(
      "Cihaz kaydı yapılamadı. Depolama iznini/boş alanı kontrol et veya JSON dosyası indir.",
    );
  }
}
export function loadLocal(slot: SaveSlot): World {
  const raw = localStorage.getItem(key(slot));
  if (!raw) throw new Error("Bu kayıt yuvası boş.");
  return decodeSave(raw);
}
export function listSaves() {
  return SAVE_SLOTS.map((slot) => {
    try {
      const raw = localStorage.getItem(key(slot));
      if (!raw) return { slot, label: "Boş yuva", valid: false };
      const w = decodeSave(raw);
      return {
        slot,
        label: `${w.countries[w.player].name} · ${w.day}. gün`,
        valid: true,
      };
    } catch {
      return { slot, label: "Okunamayan kayıt", valid: false };
    }
  });
}
