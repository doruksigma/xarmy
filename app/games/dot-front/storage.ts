import { CAPTURE, CITY_PRODUCTION, HEIGHT, MAX_ROUTE_POINTS, STARTING_MONEY, SUPPORT_PRODUCTION, WIDTH, difficulty, units } from "./config";
import type { GroundKind, Kind, Point } from "./config";
import { DEFAULT_SOUND_MIX } from "./audio-types";
import type { SoundMix } from "./audio-types";
import type { Match, Order, Result, Unit } from "./engine";
import { getMap, mapIds, passable } from "./terrain";
import type { MapId } from "./terrain";
import { advanceTerritory, createTerritory, isSupplied, TERRITORY_COLS, TERRITORY_ROWS } from "./territory";

const prefix = "xarmy:dot-front:";
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => numeric(value) && Number.isSafeInteger(value);
const isMapId = (value: unknown): value is MapId => typeof value === "string" && (mapIds as readonly string[]).includes(value);
const worldPoint = (value: Point | null | undefined) => Boolean(value && numeric(value.x) && numeric(value.y) &&
  value.x < WIDTH && value.y < HEIGHT);
const point = (value: Point | null | undefined, map: MapId) => worldPoint(value) && passable(value!, map);
const guidePoint = (value: Point | null | undefined) => Boolean(value && numeric(value.x) && numeric(value.y) &&
  value.x <= WIDTH && value.y <= HEIGHT);
const owner = (value: unknown) => [0, 1, 2].includes(Number(value)) && typeof value === "number";
const groundKind = (value: unknown): value is GroundKind => value === "light" || value === "heavy";
const kind = (value: unknown): value is Kind => groundKind(value) || value === "artillery" || value === "aircraft";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const result = (value: unknown) => value === "won" || value === "lost" || value === "draw";
const stance = (value: unknown) => value === "attack" || value === "defend" || value === "manual";
const denseEvery = <T>(values: T[], predicate: (value: T) => boolean) => {
  for (const value of values) if (!predicate(value)) return false;
  return true;
};

const LEGACY_PRODUCTION = 10;
const LEGACY_CAPTURE = 8;
type LegacyCommander = {
  id: number; team: 1 | 2; leaderId: number; order: Order; autoFront: boolean; nextOrder: number;
};
type StoredUnit = Omit<Unit, "stance" | "nextOrder" | "pocketed" | "pocketTime"> & {
  stance?: unknown; nextOrder?: unknown; commanderId?: unknown; independent?: unknown; pocketed?: unknown; pocketTime?: unknown;
};
type StoredMatch = Omit<Match, "version" | "units" | "territory" | "recruitment" | "economy" | "support"> & {
  version: number; units: StoredUnit[]; commanders?: LegacyCommander[]; nextCommanderId?: number; territory?: unknown; recruitment?: unknown; economy?: unknown; support?: unknown;
};
type VersionFiveMatch = Omit<Match, "version" | "economy" | "support"> & { version: 5; recruitment: [number, number] };

const blockedMasks = new Map<MapId, Uint8Array>();
function validTerritory(value: unknown, map: MapId): boolean {
  if (!value || typeof value !== "object") return false;
  const territory = value as { owners?: unknown; revision?: unknown };
  if (!Array.isArray(territory.owners) || territory.owners.length !== TERRITORY_COLS * TERRITORY_ROWS ||
    !integer(territory.revision) || territory.revision > 0x7fffffff) return false;
  let blocked = blockedMasks.get(map);
  if (!blocked) {
    blocked = Uint8Array.from(createTerritory(map).owners, owner => owner === 0 ? 1 : 0);
    blockedMasks.set(map, blocked);
  }
  // Sparse arrays and zero claims on passable cells are rejected as well.
  for (let index = 0; index < blocked.length; index++) {
    const value = territory.owners[index];
    if (blocked[index] ? value !== 0 : value !== 1 && value !== 2) return false;
  }
  return true;
}

function validVersion(value: unknown, version: 2 | 3 | 4 | 5 | 6 | 7): boolean {
  try {
    const m = value as StoredMatch;
    if (!m || m.version !== version || !isMapId(m.map) || typeof m.id !== "string" || !m.id ||
      !Object.hasOwn(difficulty, m.difficulty) || !numeric(m.elapsed) || !integer(m.nextId) || m.nextId < 1 ||
      (m.result !== null && !result(m.result)) || !(m.tutorial === null || (integer(m.tutorial) && m.tutorial <= 5)) ||
      !numeric(m.nextAi) || !Array.isArray(m.shortage) || m.shortage.length !== 2 || !denseEvery(m.shortage, numeric) ||
      !m.report || ![m.report.captured, m.report.killed, m.report.fallen].every(integer) ||
      !Array.isArray(m.cities) || !Array.isArray(m.units) || m.units.length > 600) return false;
    if (version === 7) {
      if (!Array.isArray(m.economy) || m.economy.length !== 2 || !denseEvery(m.economy, entry =>
        object(entry) && numeric(entry.money) && entry.money <= Number.MAX_SAFE_INTEGER &&
        numeric(entry.shortage) && entry.shortage <= m.elapsed + 1e-6)) return false;
      if (!Array.isArray(m.support) || m.support.length !== 2 || !denseEvery(m.support, entry =>
        object(entry) && numeric(entry.artillery) && entry.artillery <= SUPPORT_PRODUCTION &&
        numeric(entry.aircraft) && entry.aircraft <= SUPPORT_PRODUCTION)) return false;
    } else if (Object.hasOwn(m, "economy") || Object.hasOwn(m, "support")) return false;
    if (version >= 3 && (Object.hasOwn(m, "commanders") || Object.hasOwn(m, "nextCommanderId"))) return false;
    if (version >= 4 ? !validTerritory(m.territory, m.map) : Object.hasOwn(m, "territory")) return false;
    if (version === 5) {
      if (!Array.isArray(m.recruitment) || m.recruitment.length !== 2 ||
        !numeric(m.recruitment[0]) || m.recruitment[0] > CITY_PRODUCTION ||
        !numeric(m.recruitment[1]) || m.recruitment[1] > CITY_PRODUCTION) return false;
    } else if (Object.hasOwn(m, "recruitment")) return false;
    if (version === 2 && (!Array.isArray(m.commanders) || m.commanders.length > 600 ||
      !integer(m.nextCommanderId) || m.nextCommanderId < 1)) return false;
    const layout = getMap(m.map).cities;
    if (m.cities.length !== layout.length) return false;
    const validPoint = (value: Point | null | undefined) => point(value, m.map);
    const validOrder = (order: Order | null | undefined, flying = false) => Boolean(order && (
      order.mode === "hold" || (order.mode === "move" && (flying ? worldPoint(order.point) : validPoint(order.point))) ||
      (order.mode === "attack" && integer(order.target) && order.target >= 1 && order.target < m.nextId) ||
      (version >= 3 && order.mode === "route" && Array.isArray(order.points) && order.points.length > 0 &&
        order.points.length <= MAX_ROUTE_POINTS && denseEvery(order.points, guidePoint) && integer(order.next) && order.next <= order.points.length)
    ));
    const ids = new Set<number>();
    const membership = new Map<number, StoredUnit[]>();
    for (const u of m.units) {
      const flying = version === 7 && u?.kind === "aircraft";
      const validPosition = flying ? worldPoint : validPoint;
      if (!validPosition(u) || !integer(u.id) || u.id < 1 || u.id >= m.nextId || ids.has(u.id) || (u.team !== 1 && u.team !== 2) ||
        !(version === 7 ? kind(u.kind) : groundKind(u.kind)) || !numeric(u.hp) || u.hp <= 0 || u.hp > units[u.kind].hp ||
        !numeric(u.cooldown) || !numeric(u.replan) || typeof u.marked !== "boolean" ||
        !Array.isArray(u.path) || u.path.length > WIDTH * HEIGHT || !denseEvery(u.path, validPosition) ||
        !integer(u.waypoint) || u.waypoint > u.path.length || !validOrder(u.order, flying)) return false;
      ids.add(u.id);
      if (version >= 4) {
        if (typeof u.pocketed !== "boolean" || !numeric(u.pocketTime) || u.pocketTime > m.elapsed + 1e-6 ||
          (!u.pocketed && u.pocketTime !== 0) || (flying && (u.pocketed || u.pocketTime !== 0))) return false;
      } else if (Object.hasOwn(u, "pocketed") || Object.hasOwn(u, "pocketTime")) return false;
      if (version >= 3) {
        if (!stance(u.stance) || !numeric(u.nextOrder) || u.nextOrder > m.elapsed + 60 ||
          Object.hasOwn(u, "commanderId") || Object.hasOwn(u, "independent")) return false;
      } else {
        if (!integer(u.commanderId) || u.commanderId < 1 || u.commanderId >= m.nextCommanderId! ||
          Object.hasOwn(u, "stance") || Object.hasOwn(u, "nextOrder") || Object.hasOwn(u, "independent")) return false;
        const members = membership.get(u.commanderId) ?? [];
        members.push(u);
        if (members.length > 10) return false;
        membership.set(u.commanderId, members);
      }
    }
    if (version === 2) {
      const commanderIds = new Set<number>();
      for (const commander of m.commanders!) {
        if (!commander || !integer(commander.id) || commander.id < 1 || commander.id >= m.nextCommanderId! ||
          commanderIds.has(commander.id) || (commander.team !== 1 && commander.team !== 2) ||
          !integer(commander.leaderId) || !validOrder(commander.order) || typeof commander.autoFront !== "boolean" ||
          !numeric(commander.nextOrder) || commander.nextOrder > m.elapsed + 60 || Object.hasOwn(commander, "stance")) return false;
        const members = membership.get(commander.id);
        if (!members?.length || !members.every(unit => unit.team === commander.team) ||
          !members.some(unit => unit.id === commander.leaderId)) return false;
        commanderIds.add(commander.id);
      }
      if (commanderIds.size !== membership.size || [...membership.keys()].some(id => !commanderIds.has(id))) return false;
    }
    return [...m.cities].every((c, i) => c && c.id === i && c.x === layout[i].x && c.y === layout[i].y &&
      owner(c.owner) && owner(c.capturing) && numeric(c.progress) && c.progress <= (version === 2 ? LEGACY_CAPTURE : CAPTURE) &&
      typeof c.repeat === "boolean" && (c.rally === null || validPoint(c.rally)) &&
      (c.build === null || (c.owner !== 0 && groundKind(c.build.kind) && numeric(c.build.elapsed) &&
        c.build.elapsed <= (version === 2 ? LEGACY_PRODUCTION : CITY_PRODUCTION))));
  } catch {
    return false;
  }
}

/** Accept the current runtime shape only; old save data must be migrated first. */
export function validMatch(value: unknown): value is Match {
  return validVersion(value, 7);
}

function supportDefaults(): Pick<Match, "economy" | "support"> {
  return {
    economy: [{ money: STARTING_MONEY, shortage: 0 }, { money: STARTING_MONEY, shortage: 0 }],
    support: [{ artillery: 0, aircraft: 0 }, { artillery: 0, aircraft: 0 }],
  };
}

function initializeTerritory(legacy: StoredMatch, oldVersion: 2 | 3): Match | null {
  const { commanders, nextCommanderId, ...record } = legacy;
  void nextCommanderId;
  const migrated = {
    ...record,
    version: 7, ...supportDefaults(),
    territory: createTerritory(legacy.map),
    units: legacy.units.map(unit => {
      const { commanderId, ...soldier } = unit;
      const group = oldVersion === 2 ? commanders!.find(commander => commander.id === commanderId)! : null;
      return {
        ...soldier,
        stance: group ? (group.autoFront ? "defend" : "manual") : soldier.stance,
        nextOrder: oldVersion === 2 ? legacy.elapsed : soldier.nextOrder,
        pocketed: false, pocketTime: 0,
      };
    }),
    cities: legacy.cities.map(city => ({ ...city,
      progress: oldVersion === 2 ? city.progress * CAPTURE / LEGACY_CAPTURE : city.progress,
      build: city.build ? { ...city.build, elapsed: oldVersion === 2
        ? city.build.elapsed * CITY_PRODUCTION / LEGACY_PRODUCTION : city.build.elapsed } : null,
    })),
  } as Match;
  // Older versions did not store land history. Keep the original split and
  // claim only the current living army's footprint, never inferred past paths.
  advanceTerritory(migrated);
  for (const unit of migrated.units) unit.pocketed = !isSupplied(migrated, unit.team, unit);
  return validMatch(migrated) ? migrated : null;
}

/** Validate published v2 before discarding the obsolete command layer. */
export function migrateV2Match(value: unknown): Match | null {
  if (!validVersion(value, 2)) return null;
  try { return initializeTerritory(structuredClone(value) as StoredMatch, 2); }
  catch { return null; }
}

/** Version three already uses individual soldiers and the slow timing values. */
export function migrateV3Match(value: unknown): Match | null {
  if (!validVersion(value, 3)) return null;
  try { return initializeTerritory(structuredClone(value) as StoredMatch, 3); }
  catch { return null; }
}

/** Version four has authoritative territory and pocket timers; retain both. */
export function migrateV4Match(value: unknown): Match | null {
  if (!validVersion(value, 4)) return null;
  try { return { ...structuredClone(value) as Omit<Match, "version" | "economy" | "support">, version: 7, ...supportDefaults() }; }
  catch { return null; }
}

/** The previous shared clock was mirrored in one city per team. Keep that
 * city's saved progress; never duplicate one minute of work into 25 queues. */
export function migrateV5Match(value: unknown): Match | null {
  if (!validVersion(value, 5)) return null;
  try {
    const { recruitment, ...record } = structuredClone(value) as VersionFiveMatch;
    void recruitment;
    const migrated: Match = { ...record, version: 7, ...supportDefaults() };
    for (const team of [1, 2] as const) {
      const candidates = migrated.cities.filter(city => city.owner === team && city.build);
      const source = candidates.reduce<typeof candidates[number] | undefined>((best, city) =>
        !best || city.build!.elapsed > best.build!.elapsed ||
        city.build!.elapsed === best.build!.elapsed && city.id < best.id ? city : best, undefined);
      for (const city of candidates) if (city !== source) city.build!.elapsed = 0;
    }
    return migrated;
  } catch { return null; }
}

/** Version six already stores the complete ground war. New systems start now,
 * never by applying income, upkeep or support production to historical time. */
export function migrateV6Match(value: unknown): Match | null {
  if (!validVersion(value, 6)) return null;
  try {
    return { ...structuredClone(value) as Omit<Match, "version" | "economy" | "support">,
      version: 7, ...supportDefaults() };
  } catch { return null; }
}

export function migrateMatch(value: unknown): Match | null {
  if (validMatch(value)) return structuredClone(value);
  return migrateV6Match(value) ?? migrateV5Match(value) ?? migrateV4Match(value) ?? migrateV3Match(value) ?? migrateV2Match(value);
}

const STORAGE_TIMEOUT = 5000;

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => fail(new Error("Dot Front storage open timed out")), STORAGE_TIMEOUT);
    function fail(reason: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(reason ?? new Error("Dot Front storage unavailable"));
    }
    try {
      const request = indexedDB.open(prefix + "matches", 1);
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains("data")) request.result.createObjectStore("data");
        } catch (error) { fail(error); }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A blocked or timed-out open can still finish later. Close that handle
        // instead of leaking it or reviving an already rejected operation.
        if (settled) { db.close(); return; }
        settled = true;
        clearTimeout(timeout);
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error("Dot Front storage blocked"));
    } catch (error) { fail(error); }
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction | undefined;
      let settled = false;
      const timeout = setTimeout(() => {
        fail(new Error("Dot Front storage transaction timed out"));
        try { tx?.abort(); } catch { /* The browser may already have aborted it. */ }
      }, STORAGE_TIMEOUT);
      function fail(reason: unknown) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(reason ?? new Error("Dot Front storage transaction failed"));
      }
      try {
        tx = db.transaction("data", mode);
        tx.onabort = () => fail(tx?.error);
        tx.onerror = () => fail(tx?.error);
        const request = action(tx.objectStore("data"));
        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(request.result);
        };
      } catch (error) { fail(error); }
    });
  } finally {
    db.close();
  }
}

export async function loadMatch(): Promise<unknown> {
  const saved: unknown = await transaction("readonly", (store) => store.get("current"));
  // Leave invalid data intact so the client can show its existing invalid-save
  // notice. Merely opening the menu never overwrites the on-disk snapshot.
  return migrateMatch(saved) ?? saved;
}
export function saveMatch(match: Match) {
  if (!validMatch(match)) return Promise.reject(new Error("Invalid Dot Front match"));
  const snapshot = structuredClone(match);
  return transaction("readwrite", (store) => store.put(snapshot, "current"));
}

export type Settings = SoundMix & { sound: boolean; difficulty: Match["difficulty"]; map: MapId };
export const defaults: Settings = { sound: true, difficulty: "normal", map: "plains", ...DEFAULT_SOUND_MIX };
const volume = (value: unknown, fallback: number) => numeric(value) && value <= 1 ? value : fallback;
export function readSettings(): Settings {
  const raw = localStorage.getItem(prefix + "settings");
  let value: unknown;
  try { value = JSON.parse(raw ?? "null"); } catch { return { ...defaults }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaults };
  const settings = value as Record<string, unknown>;
  const validDifficulty = typeof settings.difficulty === "string" && Object.hasOwn(difficulty, settings.difficulty);
  // Existing installations had only Valley. Preserve that selection when their
  // pre-map-selector settings are read; new visitors start on the open plains.
  const legacyMap = !Object.hasOwn(settings, "map") && validDifficulty && typeof settings.sound === "boolean";
  const map = legacyMap ? "valley" : isMapId(settings.map) ? settings.map : defaults.map;
  return {
    sound: typeof settings.sound === "boolean" ? settings.sound : defaults.sound,
    difficulty: validDifficulty ? settings.difficulty as Match["difficulty"] : defaults.difficulty,
    map,
    masterVolume: volume(settings.masterVolume, defaults.masterVolume),
    ambienceVolume: volume(settings.ambienceVolume, defaults.ambienceVolume),
    effectsVolume: volume(settings.effectsVolume, defaults.effectsVolume),
  };
}
export function saveSettings(value: Settings) {
  localStorage.setItem(prefix + "settings", JSON.stringify(value));
}

export type Stats = Record<Result, number>;
export const emptyStats: Stats = { won: 0, lost: 0, draw: 0 };
export async function readStats(): Promise<Stats> {
  const keys = await transaction("readonly", (store) => store.getAllKeys());
  const stats = { ...emptyStats };
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const type = key.split(":")[1];
    if (key.startsWith("result:") && result(type)) stats[type]++;
  }
  return stats;
}
export function recordResult(match: Match) {
  if (!match.result) return Promise.resolve();
  return transaction("readwrite", (store) => store.put(1, "result:" + match.result + ":" + match.id));
}
