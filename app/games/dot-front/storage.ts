import { CAPTURE, CITY_PRODUCTION, HEIGHT, MAX_ROUTE_POINTS, WIDTH, difficulty, units } from "./config";
import type { Point } from "./config";
import type { Match, Order, Result, Unit } from "./engine";
import { getMap, mapIds, passable } from "./terrain";
import type { MapId } from "./terrain";

const prefix = "xarmy:dot-front:";
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => numeric(value) && Number.isSafeInteger(value);
const isMapId = (value: unknown): value is MapId => typeof value === "string" && (mapIds as readonly string[]).includes(value);
const point = (value: Point | null | undefined, map: MapId) => Boolean(value && numeric(value.x) && numeric(value.y) &&
  value.x < WIDTH && value.y < HEIGHT && passable(value, map));
const guidePoint = (value: Point | null | undefined) => Boolean(value && numeric(value.x) && numeric(value.y) &&
  value.x <= WIDTH && value.y <= HEIGHT);
const owner = (value: unknown) => [0, 1, 2].includes(Number(value)) && typeof value === "number";
const kind = (value: unknown) => value === "light" || value === "heavy";
const result = (value: unknown) => value === "won" || value === "lost" || value === "draw";
const stance = (value: unknown) => value === "attack" || value === "defend" || value === "manual";

const LEGACY_PRODUCTION = 10;
const LEGACY_CAPTURE = 8;
type LegacyCommander = {
  id: number; team: 1 | 2; leaderId: number; order: Order; autoFront: boolean; nextOrder: number;
};
type StoredUnit = Omit<Unit, "stance" | "nextOrder"> & {
  stance?: unknown; nextOrder?: unknown; commanderId?: unknown; independent?: unknown;
};
type StoredMatch = Omit<Match, "version" | "units"> & {
  version: number; units: StoredUnit[]; commanders?: LegacyCommander[]; nextCommanderId?: number;
};

function validVersion(value: unknown, version: 2 | 3): boolean {
  try {
    const m = value as StoredMatch;
    if (!m || m.version !== version || !isMapId(m.map) || typeof m.id !== "string" || !m.id ||
      !Object.hasOwn(difficulty, m.difficulty) || !numeric(m.elapsed) || !integer(m.nextId) || m.nextId < 1 ||
      (m.result !== null && !result(m.result)) || !(m.tutorial === null || (integer(m.tutorial) && m.tutorial <= 5)) ||
      !numeric(m.nextAi) || !Array.isArray(m.shortage) || m.shortage.length !== 2 || !m.shortage.every(numeric) ||
      !m.report || ![m.report.captured, m.report.killed, m.report.fallen].every(integer) ||
      !Array.isArray(m.cities) || !Array.isArray(m.units) || m.units.length > 600) return false;
    if (version === 3 && (Object.hasOwn(m, "commanders") || Object.hasOwn(m, "nextCommanderId"))) return false;
    if (version === 2 && (!Array.isArray(m.commanders) || m.commanders.length > 600 ||
      !integer(m.nextCommanderId) || m.nextCommanderId < 1)) return false;
    const layout = getMap(m.map).cities;
    if (m.cities.length !== layout.length) return false;
    const validPoint = (value: Point | null | undefined) => point(value, m.map);
    const validOrder = (order: Order | null | undefined) => Boolean(order && (
      order.mode === "hold" || (order.mode === "move" && validPoint(order.point)) ||
      (order.mode === "attack" && integer(order.target) && order.target >= 1 && order.target < m.nextId) ||
      (version === 3 && order.mode === "route" && Array.isArray(order.points) && order.points.length > 0 &&
        order.points.length <= MAX_ROUTE_POINTS && order.points.every(guidePoint) && integer(order.next) && order.next <= order.points.length)
    ));
    const ids = new Set<number>();
    const membership = new Map<number, StoredUnit[]>();
    for (const u of m.units) {
      if (!validPoint(u) || !integer(u.id) || u.id < 1 || u.id >= m.nextId || ids.has(u.id) || (u.team !== 1 && u.team !== 2) ||
        !kind(u.kind) || !numeric(u.hp) || u.hp <= 0 || u.hp > units[u.kind].hp ||
        !numeric(u.cooldown) || !numeric(u.replan) || typeof u.marked !== "boolean" ||
        !Array.isArray(u.path) || u.path.length > WIDTH * HEIGHT || !u.path.every(validPoint) ||
        !integer(u.waypoint) || u.waypoint > u.path.length || !validOrder(u.order)) return false;
      ids.add(u.id);
      if (version === 3) {
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
    return m.cities.every((c, i) => c.id === i && c.x === layout[i].x && c.y === layout[i].y &&
      owner(c.owner) && owner(c.capturing) && numeric(c.progress) && c.progress <= (version === 2 ? LEGACY_CAPTURE : CAPTURE) &&
      typeof c.repeat === "boolean" && (c.rally === null || validPoint(c.rally)) &&
      (c.build === null || (c.owner !== 0 && kind(c.build.kind) && numeric(c.build.elapsed) &&
        c.build.elapsed <= (version === 2 ? LEGACY_PRODUCTION : CITY_PRODUCTION))));
  } catch {
    return false;
  }
}

/** Accept the current runtime shape only; old save data must be migrated first. */
export function validMatch(value: unknown): value is Match {
  return validVersion(value, 3);
}

/** Validate the published v2 schema before removing its obsolete command layer.
 * Positions, health and orders survive; timed progress keeps its percentage. */
export function migrateV2Match(value: unknown): Match | null {
  if (!validVersion(value, 2)) return null;
  try {
    const legacy = structuredClone(value) as StoredMatch;
    const { commanders, nextCommanderId, ...record } = legacy;
    void nextCommanderId;
    const migrated = {
      ...record,
      version: 3,
      units: legacy.units.map(unit => {
        const { commanderId, ...soldier } = unit;
        const group = commanders!.find(commander => commander.id === commanderId)!;
        return { ...soldier, stance: group.autoFront ? "defend" : "manual", nextOrder: legacy.elapsed };
      }),
      cities: legacy.cities.map(city => ({ ...city,
        progress: city.progress * CAPTURE / LEGACY_CAPTURE,
        build: city.build ? { ...city.build, elapsed: city.build.elapsed * CITY_PRODUCTION / LEGACY_PRODUCTION } : null,
      })),
    };
    return validMatch(migrated) ? migrated : null;
  } catch { return null; }
}

export function migrateMatch(value: unknown): Match | null {
  return validMatch(value) ? structuredClone(value) : migrateV2Match(value);
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
  return migrateV2Match(saved) ?? saved;
}
export function saveMatch(match: Match) {
  if (!validMatch(match)) return Promise.reject(new Error("Invalid Dot Front match"));
  const snapshot = structuredClone(match);
  return transaction("readwrite", (store) => store.put(snapshot, "current"));
}

export type Settings = { sound: boolean; difficulty: Match["difficulty"]; map: MapId };
export const defaults: Settings = { sound: false, difficulty: "normal", map: "plains" };
export function readSettings(): Settings {
  const raw = localStorage.getItem(prefix + "settings");
  let value;
  try { value = JSON.parse(raw ?? "null"); } catch { return { ...defaults }; }
  if (!value || !Object.hasOwn(difficulty, value.difficulty) || typeof value.sound !== "boolean") return { ...defaults };
  // Existing installations had only Valley. Preserve that selection when their
  // pre-map-selector settings are read; new visitors start on the open plains.
  const map = !Object.hasOwn(value, "map") ? "valley" : isMapId(value.map) ? value.map : defaults.map;
  return { sound: value.sound, difficulty: value.difficulty, map };
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
