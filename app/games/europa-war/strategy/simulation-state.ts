import type { World } from "./types";
import { HOURS_PER_DAY, MAX_CAMPAIGN_HOUR, worldHour } from "./time";

/** Internal worker transport, deliberately independent of the save format. */
export const SIMULATION_PROTOCOL = 2 as const;
export type StatePatch =
  | { kind: "value"; value: unknown }
  | { kind: "object"; changes: Record<string, StatePatch>; removed: string[] }
  | { kind: "array"; changes: Record<string, StatePatch>; length: number }
  | { kind: "entities"; changes: Record<string, StatePatch>; order?: string[] };
export type StateTransfer =
  | { kind: "delta"; patch: StatePatch }
  | { kind: "snapshot"; world: World };
export interface TransferMetrics {
  payloadBytes: number;
  snapshotBytes: number;
  transport: StateTransfer["kind"];
}

export function checkedSimulationTick(world: World): number {
  if (
    !world ||
    !Number.isSafeInteger(world.day) ||
    world.day < 0 ||
    !Number.isSafeInteger(world.hour) ||
    world.hour < 0 ||
    world.hour >= HOURS_PER_DAY
  )
    throw new Error("Invalid simulation clock");
  const tick = worldHour(world);
  if (tick > MAX_CAMPAIGN_HOUR)
    throw new Error("Simulation clock limit exceeded");
  return tick;
}

const MAX_DEPTH = 32;
const MAX_NODES = 300_000;
const MAX_ARRAY = 20_000;
const safeKey = (key: string) =>
  key !== "__proto__" && key !== "prototype" && key !== "constructor";
const plain = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const own = (value: object, key: string) => Object.hasOwn(value, key);
const encoder = new TextEncoder();

/** Measured UTF-8 JSON-equivalent size; browser structured-clone wire size varies. */
export function statePayloadBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function entities(value: unknown[]): Map<string, unknown> | null {
  const items = new Map<string, unknown>();
  for (const item of value) {
    if (!plain(item) || typeof item.id !== "string" || !safeKey(item.id))
      return null;
    if (items.has(item.id)) return null;
    items.set(item.id, item);
  }
  return items;
}

/** Runs in the worker: advanceHour clones, so reference equality is insufficient. */
export function createStatePatch(
  before: unknown,
  after: unknown,
): StatePatch | null {
  if (Object.is(before, after)) return null;
  if (Array.isArray(before) && Array.isArray(after)) {
    const oldItems = entities(before),
      newItems = entities(after);
    if (oldItems && newItems) {
      const changes: Record<string, StatePatch> = {};
      for (const [id, item] of newItems) {
        const patch = oldItems.has(id)
          ? createStatePatch(oldItems.get(id), item)
          : { kind: "value" as const, value: item };
        if (patch) changes[id] = patch;
      }
      const order = [...newItems.keys()];
      const reordered =
        before.length !== after.length ||
        [...oldItems.keys()].some((id, i) => id !== order[i]);
      if (!reordered && !Object.keys(changes).length) return null;
      return { kind: "entities", changes, ...(reordered ? { order } : {}) };
    }
    const changes: Record<string, StatePatch> = {};
    after.forEach((item, i) => {
      const patch =
        i < before.length
          ? createStatePatch(before[i], item)
          : { kind: "value" as const, value: item };
      if (patch) changes[String(i)] = patch;
    });
    return before.length === after.length && !Object.keys(changes).length
      ? null
      : { kind: "array", changes, length: after.length };
  }
  if (plain(before) && plain(after)) {
    const changes: Record<string, StatePatch> = {};
    for (const key of Object.keys(after)) {
      if (!safeKey(key)) throw new Error("Unsafe simulation key");
      const patch = own(before, key)
        ? createStatePatch(before[key], after[key])
        : { kind: "value" as const, value: after[key] };
      if (patch) changes[key] = patch;
    }
    const removed = Object.keys(before).filter((key) => !own(after, key));
    return removed.length || Object.keys(changes).length
      ? { kind: "object", changes, removed }
      : null;
  }
  return { kind: "value", value: after };
}

type Budget = { remaining: number };
function visit(budget: Budget, depth: number) {
  if (depth > MAX_DEPTH || --budget.remaining < 0)
    throw new Error("Simulation patch limit exceeded");
}
function keys(
  value: Record<string, unknown>,
  expected: string[],
  optional: string[] = [],
) {
  if (
    expected.some((key) => !own(value, key)) ||
    Object.keys(value).some(
      (key) => !expected.includes(key) && !optional.includes(key),
    )
  )
    throw new Error("Malformed simulation patch");
}
function checkValue(value: unknown, budget: Budget, depth: number): void {
  visit(budget, depth);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY)
      throw new Error("Simulation array limit exceeded");
    for (let i = 0; i < value.length; i++) {
      if (!own(value, String(i))) throw new Error("Sparse simulation array");
      checkValue(value[i], budget, depth + 1);
    }
    return;
  }
  if (!plain(value)) throw new Error("Non-data simulation value");
  for (const [key, item] of Object.entries(value)) {
    if (!safeKey(key)) throw new Error("Unsafe simulation key");
    // Undefined optional object members are retained by structured clone and
    // omitted by saves; neither functions nor undefined array items are allowed.
    if (item !== undefined) checkValue(item, budget, depth + 1);
  }
}

function apply(
  before: unknown,
  patch: unknown,
  budget: Budget,
  depth: number,
): unknown {
  visit(budget, depth);
  if (!plain(patch)) throw new Error("Malformed simulation patch");
  if (patch.kind === "value") {
    keys(patch, ["kind", "value"]);
    if (patch.value !== undefined) checkValue(patch.value, budget, depth + 1);
    return patch.value;
  }
  if (!plain(patch.changes)) throw new Error("Missing simulation changes");
  const changes = patch.changes;
  for (const key of Object.keys(changes))
    if (!safeKey(key)) throw new Error("Unsafe simulation key");
  if (patch.kind === "object") {
    keys(patch, ["kind", "changes", "removed"]);
    if (!plain(before) || !Array.isArray(patch.removed))
      throw new Error("Object simulation base mismatch");
    const removed = patch.removed;
    if (
      removed.length > MAX_ARRAY ||
      new Set(removed).size !== removed.length ||
      removed.some(
        (key) =>
          typeof key !== "string" ||
          !safeKey(key) ||
          !own(before, key) ||
          own(changes, key),
      )
    )
      throw new Error("Invalid simulation removal");
    const next = { ...before };
    for (const key of removed) delete next[key as string];
    for (const [key, change] of Object.entries(changes)) {
      if (!own(before, key) && (!plain(change) || change.kind !== "value"))
        throw new Error("New simulation member requires a value");
      next[key] = apply(before[key], change, budget, depth + 1);
    }
    return next;
  }
  if (patch.kind === "array") {
    keys(patch, ["kind", "changes", "length"]);
    if (
      !Array.isArray(before) ||
      !Number.isSafeInteger(patch.length) ||
      (patch.length as number) < 0 ||
      (patch.length as number) > MAX_ARRAY
    )
      throw new Error("Array simulation base mismatch");
    const length = patch.length as number;
    const next = before.slice(0, length);
    for (const [key, change] of Object.entries(changes)) {
      const index = Number(key);
      if (
        !/^(0|[1-9][0-9]*)$/.test(key) ||
        !Number.isSafeInteger(index) ||
        index >= length
      )
        throw new Error("Invalid simulation array index");
      if (index >= before.length && (!plain(change) || change.kind !== "value"))
        throw new Error("New simulation item requires a value");
      const item = apply(before[index], change, budget, depth + 1);
      if (item === undefined)
        throw new Error("Undefined simulation array item");
      next[index] = item;
    }
    for (let i = before.length; i < length; i++)
      if (!own(next, String(i))) throw new Error("Sparse simulation array");
    return next;
  }
  if (patch.kind === "entities") {
    keys(patch, ["kind", "changes"], ["order"]);
    if (!Array.isArray(before))
      throw new Error("Entity simulation base mismatch");
    const previous = entities(before);
    if (!previous) throw new Error("Entity simulation base mismatch");
    const order = own(patch, "order") ? patch.order : [...previous.keys()];
    if (
      !Array.isArray(order) ||
      order.length > MAX_ARRAY ||
      order.some((id) => typeof id !== "string" || !safeKey(id)) ||
      new Set(order).size !== order.length
    )
      throw new Error("Invalid simulation entity order");
    const expected = new Set(order);
    if (Object.keys(changes).some((key) => !expected.has(key)))
      throw new Error("Simulation entity outside result order");
    return order.map((id: string) => {
      const old = previous.get(id);
      if (
        !previous.has(id) &&
        (!plain(changes[id]) || changes[id].kind !== "value")
      )
        throw new Error("Missing simulation entity");
      const item = own(changes, id)
        ? apply(old, changes[id], budget, depth + 1)
        : old;
      if (!plain(item) || item.id !== id)
        throw new Error("Simulation entity ID changed");
      return item;
    });
  }
  throw new Error("Unknown simulation patch kind");
}

/** Atomic and immutable: an invalid patch cannot modify the accepted campaign. */
export function applyStatePatch<T>(before: T, patch: unknown): T {
  return apply(before, patch, { remaining: MAX_NODES }, 0) as T;
}

export function createStateTransfer(
  before: World,
  after: World,
): {
  state: StateTransfer;
  metrics: TransferMetrics;
} {
  const snapshot: StateTransfer = { kind: "snapshot", world: after };
  const snapshotBytes = statePayloadBytes(snapshot);
  const patch = createStatePatch(before, after);
  if (!patch) throw new Error("Simulation did not advance");
  const delta: StateTransfer = { kind: "delta", patch };
  const deltaBytes = statePayloadBytes(delta);
  const state = deltaBytes < snapshotBytes ? delta : snapshot;
  return {
    state,
    metrics: {
      transport: state.kind,
      snapshotBytes,
      payloadBytes: state.kind === "delta" ? deltaBytes : snapshotBytes,
    },
  };
}

export function acceptStateTransfer(
  before: World,
  state: StateTransfer,
  baseTick: number,
  nextTick: number,
): World {
  if (
    !Number.isSafeInteger(baseTick) ||
    baseTick !== checkedSimulationTick(before) ||
    !Number.isSafeInteger(nextTick) ||
    nextTick !== baseTick + 1 ||
    nextTick > MAX_CAMPAIGN_HOUR
  )
    throw new Error("Simulation tick mismatch");
  if (!plain(state) || !["delta", "snapshot"].includes(state.kind))
    throw new Error("Unknown simulation transfer");
  keys(state, state.kind === "delta" ? ["kind", "patch"] : ["kind", "world"]);
  const next =
    state.kind === "delta" ? applyStatePatch(before, state.patch) : state.world;
  // The worker is trusted same-origin code, not an external save. Validate the
  // transfer and clock here without scanning every unchanged entity each hour.
  if (
    !plain(next) ||
    next.version !== before.version ||
    next.player !== before.player ||
    checkedSimulationTick(next) !== nextTick
  )
    throw new Error("Simulation result does not match its source");
  return next;
}
