import { HEIGHT, WIDTH, difficulty, units } from "./config";
import type { Point } from "./config";
import type { Match, Result } from "./engine";
import { getMap, mapIds, passable } from "./terrain";
import type { MapId } from "./terrain";

const prefix = "xarmy:dot-front:";
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown) => numeric(value) && Number.isSafeInteger(value);
const isMapId = (value: unknown): value is MapId => typeof value === "string" && (mapIds as readonly string[]).includes(value);
const point = (value: Point | null | undefined, map: MapId) => Boolean(value && numeric(value.x) && numeric(value.y) &&
  value.x < WIDTH && value.y < HEIGHT && passable(value, map));
const owner = (value: unknown) => [0, 1, 2].includes(Number(value)) && typeof value === "number";
const kind = (value: unknown) => value === "light" || value === "heavy";
const result = (value: unknown) => value === "won" || value === "lost" || value === "draw";

export function validMatch(value: unknown): value is Match {
  try {
    const m = value as Match;
    if (!m || m.version !== 1 || !isMapId(m.map) || typeof m.id !== "string" || !m.id ||
      !Object.hasOwn(difficulty, m.difficulty) || !numeric(m.elapsed) || !integer(m.nextId) || m.nextId < 1 ||
      (m.result !== null && !result(m.result)) || !(m.tutorial === null || (integer(m.tutorial) && m.tutorial <= 5)) ||
      !numeric(m.nextAi) || !Array.isArray(m.shortage) || m.shortage.length !== 2 || !m.shortage.every(numeric) ||
      !m.report || ![m.report.captured, m.report.killed, m.report.fallen].every(integer) ||
      !Array.isArray(m.cities) || !Array.isArray(m.units) || m.units.length > 220) return false;
    const layout = getMap(m.map).cities;
    if (m.cities.length !== layout.length) return false;
    const validPoint = (value: Point | null | undefined) => point(value, m.map);
    const ids = new Set<number>();
    for (const u of m.units) {
      if (!validPoint(u) || !integer(u.id) || u.id < 1 || u.id >= m.nextId || ids.has(u.id) || (u.team !== 1 && u.team !== 2) ||
        !kind(u.kind) || !numeric(u.hp) || u.hp <= 0 || u.hp > units[u.kind].hp ||
        !numeric(u.cooldown) || !numeric(u.replan) || typeof u.marked !== "boolean" ||
        !Array.isArray(u.path) || u.path.length > WIDTH * HEIGHT || !u.path.every(validPoint) ||
        !integer(u.waypoint) || u.waypoint > u.path.length || !u.order) return false;
      ids.add(u.id);
      if (u.order.mode !== "hold" && !(u.order.mode === "move" && validPoint(u.order.point)) &&
          !(u.order.mode === "attack" && integer(u.order.target) && u.order.target >= 1)) return false;
    }
    return m.cities.every((c, i) => c.id === i && c.x === layout[i].x && c.y === layout[i].y &&
      owner(c.owner) && owner(c.capturing) && numeric(c.progress) && c.progress <= 8 &&
      typeof c.repeat === "boolean" && (c.rally === null || validPoint(c.rally)) &&
      (c.build === null || (c.owner !== 0 && kind(c.build.kind) && numeric(c.build.elapsed) &&
        c.build.elapsed <= units[c.build.kind].build)));
  } catch {
    return false;
  }
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

export const loadMatch = (): Promise<unknown> => transaction("readonly", (store) => store.get("current"));
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
