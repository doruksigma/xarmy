import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceHour } from "./engine";
import { createWorld } from "./world";
import { worldHour } from "./time";
import { decodeSave, encodeSave } from "./storage";
import {
  acceptStateTransfer,
  applyStatePatch,
  createStatePatch,
  createStateTransfer,
  statePayloadBytes,
} from "./simulation-state";
import type { World } from "./types";

test("Saat farkı gerçek motorla eşittir; değişmeyen ülke ve bölge nesneleri korunur", () => {
  const before = createWorld("turkey", "alternative", 29);
  const frozen = structuredClone(before);
  const after = advanceHour(before);
  const { state, metrics } = createStateTransfer(before, after);
  assert.equal(state.kind, "delta");
  const accepted = acceptStateTransfer(
    before,
    state,
    worldHour(before),
    worldHour(after),
  );
  assert.deepEqual(accepted, after);
  assert.deepEqual(before, frozen);
  assert.equal(accepted.countries, before.countries);
  assert.equal(accepted.provinces, before.provinces);
  assert.equal(accepted.countries.turkey, before.countries.turkey);
  assert.ok(metrics.payloadBytes < metrics.snapshotBytes * 0.25);
  assert.equal(metrics.payloadBytes, statePayloadBytes(state));
});

test("Kayıt devamında gece yarısı ve emir defteri dahil 100 saatlik farklar tam dünya ile eşittir", () => {
  let local = decodeSave(encodeSave(createWorld("germany", "alternative", 41)));
  let worker = structuredClone(local);
  let deltas = 0;
  let transferred = 0,
    snapshots = 0;
  for (let hour = 0; hour < 100; hour++) {
    const next = advanceHour(worker);
    const { state, metrics } = createStateTransfer(worker, next);
    const accepted = acceptStateTransfer(
      local,
      state,
      worldHour(local),
      worldHour(next),
    );
    assert.deepEqual(accepted, next, `hour ${hour + 1}`);
    transferred += metrics.payloadBytes;
    snapshots += metrics.snapshotBytes;
    if (state.kind === "delta") deltas++;
    worker = next;
    local = accepted;
  }
  assert.equal(deltas, 100);
  assert.ok(transferred < snapshots * 0.35);
  assert.deepEqual(decodeSave(encodeSave(local)), worker);
});

test("Birlik ekleme, kayıp ve sıralama değişikliği kalan birliklerin kimliğini korur", () => {
  const before = {
    armies: [
      { id: "a", strength: 70 },
      { id: "b", strength: 90 },
      { id: "c", strength: 100 },
    ],
    nested: { orders: ["one", "two"], noChange: { value: 9 } },
  };
  const after = {
    armies: [
      { id: "c", strength: 100 },
      { id: "b", strength: 80 },
      { id: "d", strength: 100 },
    ],
    nested: { orders: ["one", "three", "four"], noChange: { value: 9 } },
  };
  const patch = createStatePatch(before, after);
  assert.ok(patch);
  const result = applyStatePatch(before, patch);
  assert.deepEqual(result, after);
  assert.equal(result.armies[0], before.armies[2]);
  assert.notEqual(result.armies[1], before.armies[1]);
  assert.equal(result.nested.noChange, before.nested.noChange);
  assert.equal(before.armies[1].strength, 90);
  const removed = { ...result, armies: [] };
  assert.deepEqual(
    applyStatePatch(result, createStatePatch(result, removed)),
    removed,
  );
});

test("Normal listelerin büyümesi, kısalması ve isteğe bağlı alanlar doğru aktarılır", () => {
  const cases: [unknown, unknown][] = [
    [
      [1, 2],
      [1, 3, 4],
    ],
    [[1, 2, 3], [1]],
    [[], ["a"]],
    [["a"], []],
    [
      { a: 1, b: { x: 2 } },
      { b: { x: 2 }, c: { id: "new", n: 5 } },
    ],
    [{ a: 1 }, { a: undefined }],
    [{ a: undefined }, {}],
    [
      [
        { id: "same", n: 1 },
        { id: "same", n: 2 },
      ],
      [{ id: "same", n: 4 }],
    ],
  ];
  for (const [before, after] of cases)
    assert.deepEqual(
      applyStatePatch(before, createStatePatch(before, after)),
      after,
    );
  assert.equal(createStatePatch({ a: [1, 2] }, { a: [1, 2] }), null);
});

test("Büyük fark tam görüntüye döner ve transfer tam görüntüden büyük olamaz", () => {
  const before = { day: 0, hour: 0, seed: 1, tension: 0 } as World;
  const after = { day: 1, hour: 1, seed: 2, tension: 1 } as World;
  const { state, metrics } = createStateTransfer(before, after);
  assert.equal(state.kind, "snapshot");
  assert.equal(metrics.payloadBytes, metrics.snapshotBytes);
  assert.deepEqual(state, { kind: "snapshot", world: after });
});

test("Eski saat, atlanan saat, başka sefer ve bozuk saat atomik reddedilir", () => {
  const before = createWorld("turkey");
  const snapshot = structuredClone(before);
  const after = advanceHour(before);
  const { state } = createStateTransfer(before, after);
  for (const [base, next] of [
    [1, 2],
    [0, 2],
    [-1, 0],
    [0, 0],
    [0.5, 1.5],
  ])
    assert.throws(() => acceptStateTransfer(before, state, base, next));
  for (const bad of [
    { ...after, player: "france" },
    { ...after, hour: 25 },
    { ...after, day: NaN },
    { ...after, hour: 1.5 },
  ])
    assert.throws(() =>
      acceptStateTransfer(before, { kind: "snapshot", world: bad }, 0, 1),
    );
  for (const bad of [
    { ...before, day: -1, hour: 24 },
    { ...before, hour: 24 },
    { ...before, day: 36_501 },
    { ...before, hour: NaN },
  ])
    assert.throws(() =>
      acceptStateTransfer(bad, state, worldHour(bad), worldHour(bad) + 1),
    );
  assert.deepEqual(before, snapshot);
});

test("Bozuk farklar eski dünyayı ve prototipleri değiştirmeden reddedilir", () => {
  const before = { a: { n: 1 }, list: [1], armies: [{ id: "a", n: 1 }] };
  const saved = structuredClone(before);
  const bad = [
    null,
    { kind: "unknown" },
    { kind: "object", changes: {}, removed: ["missing"] },
    {
      kind: "object",
      changes: { a: { kind: "value", value: 8 } },
      removed: ["a"],
    },
    {
      kind: "object",
      changes: { a: { kind: "value", value: NaN } },
      removed: [],
    },
    {
      kind: "object",
      changes: { a: { kind: "value", value: Infinity } },
      removed: [],
    },
    JSON.parse(
      '{"kind":"object","changes":{"__proto__":{"kind":"value","value":{"polluted":true}}},"removed":[]}',
    ),
    {
      kind: "object",
      changes: { a: { kind: "value", value: new Map() } },
      removed: [],
    },
    {
      kind: "object",
      changes: { list: { kind: "array", changes: {}, length: 4 } },
      removed: [],
    },
    {
      kind: "object",
      changes: {
        list: {
          kind: "array",
          changes: { "-1": { kind: "value", value: 4 } },
          length: 1,
        },
      },
      removed: [],
    },
    {
      kind: "object",
      changes: { armies: { kind: "entities", changes: {}, order: ["a", "a"] } },
      removed: [],
    },
    {
      kind: "object",
      changes: {
        armies: { kind: "entities", changes: {}, order: ["missing"] },
      },
      removed: [],
    },
    {
      kind: "object",
      changes: {
        armies: {
          kind: "entities",
          changes: { a: { kind: "value", value: { id: "other" } } },
        },
      },
      removed: [],
    },
  ];
  for (const patch of bad) {
    assert.throws(() => applyStatePatch(before, patch));
    assert.deepEqual(before, saved);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  }
});

test("Aşırı derin veya döngüsel değerler kilitlenmeden reddedilir", () => {
  const cycle: Record<string, unknown> = {};
  cycle.next = cycle;
  assert.throws(
    () => applyStatePatch({}, { kind: "value", value: cycle }),
    /limit/,
  );
  assert.throws(
    () =>
      applyStatePatch([], { kind: "array", changes: {}, length: 1_000_000 }),
    /mismatch/,
  );
});
