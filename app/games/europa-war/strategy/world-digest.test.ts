import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceHour, advanceHours, createWorld } from "./engine";
import { decodeSave, encodeSave } from "./storage";
import { createCommand, executeCommand } from "./commands";
import { declareWar } from "./diplomacy";
import {
  fingerprintValue,
  fingerprintWorld,
  summarizeWorld,
} from "./world-digest";

test("world fingerprint is independent of object insertion order but preserves queue order", () => {
  const world = createWorld("turkey");
  const reordered = structuredClone(world);
  reordered.countries = Object.fromEntries(
    Object.entries(reordered.countries).reverse(),
  );
  reordered.provinces = Object.fromEntries(
    Object.entries(reordered.provinces).reverse(),
  );
  assert.equal(fingerprintWorld(world), fingerprintWorld(reordered));
  assert.notEqual(
    fingerprintValue(["move", "attack"]),
    fingerprintValue(["attack", "move"]),
  );
  assert.notEqual(
    fingerprintValue({ a: 1, b: 2 }),
    fingerprintValue({ a: 2, b: 1 }),
  );
});

test("diagnostic fingerprints are stable across serialization and never consume RNG", () => {
  const world = createWorld("germany", "alternative", 2147483647);
  const before = structuredClone(world);
  assert.equal(
    fingerprintWorld(world),
    fingerprintWorld(decodeSave(encodeSave(world))),
  );
  assert.deepEqual(summarizeWorld(world), {
    format: 1,
    tick: 0,
    digest: fingerprintWorld(world),
    countries: 29,
    provinces: 447,
    armies: world.armies.length,
    battles: 0,
  });
  assert.deepEqual(world, before);
  assert.equal(
    fingerprintValue({ x: undefined, y: -0 }),
    fingerprintValue({ y: 0 }),
  );
  assert.equal(
    fingerprintValue([undefined, , null]),
    fingerprintValue([null, null, null]),
  );
});

test("fingerprints distinguish value types, token boundaries, Unicode, and nested field changes", () => {
  const values: unknown[] = [
    null,
    false,
    true,
    0,
    "0",
    "",
    [],
    {},
    ["a", "bc"],
    ["ab", "c"],
    { "a:b": "c" },
    { a: "b:c" },
    "İstanbul",
    "Istanbul",
    "\u0000",
    "😀",
  ];
  assert.equal(new Set(values.map(fingerprintValue)).size, values.length);
  const world = createWorld("turkey");
  const initial = fingerprintWorld(world);
  const changed = structuredClone(world);
  changed.armies[0].organization -= 0.01;
  assert.notEqual(fingerprintWorld(changed), initial);
  changed.armies[0].organization += 0.01;
  changed.countries.turkey.treasury += 1;
  assert.notEqual(fingerprintWorld(changed), initial);
});

test("invalid diagnostic input fails explicitly, shared acyclic objects are accepted", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const invalid of [
    cycle,
    NaN,
    Infinity,
    -Infinity,
    1n,
    undefined,
    () => 1,
    new Date(),
    new Map(),
  ])
    assert.throws(() => fingerprintValue(invalid));
  let deep: unknown = 0;
  for (let i = 0; i < 70; i++) deep = { nested: deep };
  assert.throws(() => fingerprintValue(deep), /nesting/);
  const shared = { valid: true };
  assert.equal(
    fingerprintValue([shared, shared]),
    fingerprintValue([{ valid: true }, { valid: true }]),
  );
  assert.equal(
    fingerprintValue(JSON.parse('{"__proto__":{"x":1}}')),
    fingerprintValue({ ["__proto__"]: { x: 1 } }),
  );
});

test("hourly and batched simulation, same-tick commands, and save/load share checkpoint fingerprints", () => {
  let continuous = createWorld("turkey", "alternative", 1977);
  let resumed = decodeSave(encodeSave(continuous));
  for (let step = 0; step < 4; step++) {
    const action = {
      type: "commanderAutoAssign" as const,
      enabled: step % 2 === 0,
    };
    for (const which of ["continuous", "resumed"]) {
      const world = which === "continuous" ? continuous : resumed;
      const result = executeCommand(
        world,
        createCommand(world, action),
        world.player,
      );
      assert.equal(result.status, "applied");
      if (which === "continuous") continuous = result.world;
      else resumed = result.world;
    }
    continuous = advanceHours(continuous, 8);
    for (let i = 0; i < 8; i++) resumed = advanceHour(resumed);
    resumed = decodeSave(encodeSave(resumed));
    assert.equal(fingerprintWorld(continuous), fingerprintWorld(resumed));
  }
  assert.equal(summarizeWorld(resumed).tick, 32);
});

test("a mid-battle save continues to the identical world checkpoint after 100 hours", () => {
  let world = createWorld("germany", "historical", 7301, "normal");
  declareWar(world, "germany", "poland");
  const attacker = world.armies.find((army) => army.country === "germany")!;
  const defender = world.armies.find((army) => army.country === "poland")!;
  attacker.province = "germany-7";
  defender.province = "poland-2";
  attacker.general = defender.general = null;
  attacker.move = { to: defender.province, progress: 0, days: 100 };
  world = advanceHour(world);
  assert.ok(
    world.battles.length > 0,
    "The checkpoint must contain a real active battle",
  );
  assert.ok(
    world.armies.find((army) => army.id === attacker.id)!.strength <
      attacker.strength,
  );
  let restored = decodeSave(encodeSave(world));
  for (let hour = 1; hour < 100; hour++) {
    world = advanceHour(world);
    restored = advanceHour(restored);
    if (hour % 24 === 0)
      assert.equal(fingerprintWorld(world), fingerprintWorld(restored));
  }
  assert.equal(summarizeWorld(world).tick, 100);
  assert.equal(fingerprintWorld(world), fingerprintWorld(restored));
  assert.deepEqual(world, restored);
});
