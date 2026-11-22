import { HEIGHT, WIDTH, difficulty, units } from "./config";
import type { Point } from "./config";
import type { Match, Result } from "./engine";
import { cities, passable } from "./terrain";

const prefix = "xarmy:dot-front:";
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown) => numeric(value) && Number.isInteger(value);
const point = (value: Point | null | undefined) => Boolean(value && numeric(value.x) && numeric(value.y) &&
  value.x < WIDTH && value.y < HEIGHT && passable(value));
const owner = (value: unknown) => [0, 1, 2].includes(Number(value)) && typeof value === "number";
const kind = (value: unknown) => value === "light" || value === "heavy";
const result = (value: unknown) => value === "won" || value === "lost" || value === "draw";

export function validMatch(value: unknown): value is Match {
  try {
    const m = value as Match;
    if (!m || m.version !== 1 || m.map !== "valley" || typeof m.id !== "string" || !m.id ||
      !Object.hasOwn(difficulty, m.difficulty) || !numeric(m.elapsed) || !integer(m.nextId) || m.nextId < 1 ||
      (m.result !== null && !result(m.result)) || !(m.tutorial === null || (integer(m.tutorial) && m.tutorial <= 5)) ||
      !numeric(m.nextAi) || !Array.isArray(m.shortage) || m.shortage.length !== 2 || !m.shortage.every(numeric) ||
      !m.report || ![m.report.captured, m.report.killed, m.report.fallen].every(integer) ||
      !Array.isArray(m.cities) || m.cities.length !== cities.length || !Array.isArray(m.units) || m.units.length > 220) return false;
    const ids = new Set<number>();
    for (const u of m.units) {
      if (!point(u) || !integer(u.id) || u.id >= m.nextId || ids.has(u.id) || (u.team !== 1 && u.team !== 2) ||
        !kind(u.kind) || !numeric(u.hp) || u.hp <= 0 || u.hp > units[u.kind].hp ||
        !numeric(u.cooldown) || !numeric(u.replan) || typeof u.marked !== "boolean" ||
        !Array.isArray(u.path) || u.path.length > WIDTH * HEIGHT || !u.path.every(point) ||
        !integer(u.waypoint) || u.waypoint > u.path.length || !u.order) return false;
      ids.add(u.id);
      if (u.order.mode !== "hold" && !(u.order.mode === "move" && point(u.order.point)) &&
          !(u.order.mode === "attack" && integer(u.order.target))) return false;
    }
    return m.cities.every((c, i) => c.id === i && c.x === cities[i].x && c.y === cities[i].y &&
      owner(c.owner) && owner(c.capturing) && numeric(c.progress) && c.progress <= 8 &&
      typeof c.repeat === "boolean" && (c.rally === null || point(c.rally)) &&
      (c.build === null || (c.owner !== 0 && kind(c.build.kind) && numeric(c.build.elapsed) &&
        c.build.elapsed <= units[c.build.kind].build)));
  } catch {
    return false;
  }
}

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(prefix + "matches", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("data", mode);
      const request = action(tx.objectStore("data"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const loadMatch = (): Promise<unknown> => transaction("readonly", (store) => store.get("current"));
export function saveMatch(match: Match) {
  const snapshot = structuredClone(match);
  return transaction("readwrite", (store) => store.put(snapshot, "current"));
}

export type Settings = { sound: boolean; difficulty: Match["difficulty"] };
export const defaults: Settings = { sound: false, difficulty: "normal" };
export function readSettings(): Settings {
  const value = JSON.parse(localStorage.getItem(prefix + "settings") ?? "null");
  return value && Object.hasOwn(difficulty, value.difficulty) && typeof value.sound === "boolean" ? value : defaults;
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
