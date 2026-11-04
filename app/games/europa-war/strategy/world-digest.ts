import { worldHour } from "./time";
import type { World } from "./types";

/**
 * Versioned, deterministic diagnostic fingerprint of JSON-compatible state.
 * This is a pair of independent 32-bit checksums, not a cryptographic signature
 * or proof of save-file authenticity. Object insertion order is irrelevant;
 * array order is significant because queues and command order affect the game.
 *
 * Stream typed, length-delimited tokens instead of building a second serialized
 * world. Do not cache by object identity: the simulation mutates its cloned world.
 */
export function fingerprintValue(value: unknown): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const ancestors = new Set<object>();
  const write = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      first = Math.imul(first ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
      second = ((second << 13) | (second >>> 19)) >>> 0;
    }
  };
  const string = (text: string) => {
    write(`s${text.length}:`);
    write(text);
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > 64) throw new Error("World fingerprint exceeds nesting limit");
    if (item === null) {
      write("n;");
      return;
    }
    if (typeof item === "string") {
      string(item);
      return;
    }
    if (typeof item === "boolean") {
      write(item ? "t;" : "f;");
      return;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item))
        throw new Error("World fingerprint requires finite numbers");
      // JSON/save round trips normalize negative zero to zero as well.
      write(`d${item};`);
      return;
    }
    if (typeof item !== "object")
      throw new Error("World fingerprint requires JSON-compatible data");
    if (ancestors.has(item)) throw new Error("World fingerprint found a cycle");
    const prototype = Object.getPrototypeOf(item);
    if (
      !Array.isArray(item) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      throw new Error("World fingerprint requires plain objects");
    ancestors.add(item);
    if (Array.isArray(item)) {
      write(`a${item.length}[`);
      for (let i = 0; i < item.length; i++) visit(item[i] ?? null, depth + 1);
      write("]");
    } else {
      const record = item as Record<string, unknown>;
      // Optional absent/undefined fields serialize identically in a save.
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      write(`o${keys.length}{`);
      for (const key of keys) {
        string(key);
        visit(record[key], depth + 1);
      }
      write("}");
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `ew1:${hex(first)}${hex(second)}`;
}

/** Run off the rendering path, e.g. in the worker at daily checkpoints. */
export function fingerprintWorld(world: World): string {
  return fingerprintValue(world);
}

export function summarizeWorld(world: World) {
  return {
    format: 1 as const,
    tick: worldHour(world),
    digest: fingerprintWorld(world),
    countries: Object.keys(world.countries).length,
    provinces: Object.keys(world.provinces).length,
    armies: world.armies.length,
    battles: world.battles.length,
  };
}
