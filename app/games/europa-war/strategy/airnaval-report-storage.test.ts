import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceHour, advanceHours } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { acceptStateTransfer, createStateTransfer } from "./simulation-state";
import { fingerprintWorld } from "./world-digest";
import { createWorld } from "./world";
import type { AirNavalDailyReport, World } from "./types";

function report(country = "turkey"): AirNavalDailyReport {
  return {
    country,
    day: 1,
    air: {
      flown: 50,
      combatLosses: 0.75,
      baseLosses: 2,
      reinforced: 2,
      fuelSpent: 3,
      bombingDamage: 4,
      navalDamage: 1,
      engagements: 1,
    },
    navy: {
      active: 2,
      combatDamage: 4,
      attritionDamage: 0.3,
      sunk: 1,
      aircraftLost: 0.04,
      repaired: 0.75,
      fuelSpent: 1,
      engagements: 2,
    },
  };
}

test("old saves without an air/naval report remain exact and gain no invented battle history", () => {
  const old = createWorld("turkey");
  assert.equal(Object.hasOwn(old, "airNavalReports"), false);
  const restored = decodeSave(encodeSave(old));
  assert.equal(Object.hasOwn(restored, "airNavalReports"), false);
  assert.deepEqual(restored, old);
});

test("daily air/naval reports survive save/load and continue through the real engine", () => {
  const before = createWorld("turkey", "historical", 1936, "hard");
  before.hour = 23;
  const after = advanceHour(before);
  assert.equal(
    after.airNavalReports?.length,
    Object.keys(after.countries).length,
  );
  assert.ok(after.airNavalReports?.every((entry) => entry.day === 1));
  assert.ok(validateWorld(after));
  const restored = decodeSave(encodeSave(after));
  assert.deepEqual(restored, after);
  assert.equal(fingerprintWorld(restored), fingerprintWorld(after));
  assert.deepEqual(advanceHours(restored, 24), advanceHours(after, 24));
  const nextHour = advanceHour(after);
  assert.deepEqual(nextHour.airNavalReports, after.airNavalReports);
  const nextDay = advanceHours(after, 24);
  assert.equal(nextDay.airNavalReports?.length, after.airNavalReports?.length);
  assert.ok(nextDay.airNavalReports?.every((entry) => entry.day === 2));
});

test("worker deltas publish a new daily report exactly and retain it on unchanged hours", () => {
  const before = createWorld("germany");
  before.hour = 23;
  const after = advanceHour(before);
  const transfer = createStateTransfer(before, after);
  const accepted = acceptStateTransfer(before, transfer.state, 23, 24);
  assert.deepEqual(accepted, after);
  const next = advanceHour(after);
  const nextTransfer = createStateTransfer(after, next);
  const continued = acceptStateTransfer(accepted, nextTransfer.state, 24, 25);
  assert.deepEqual(continued, next);
  assert.equal(continued.airNavalReports, accepted.airNavalReports);
});

test("reports preserve real fractional losses after a wing or ship no longer exists", () => {
  const world = createWorld("turkey");
  world.day = 2;
  world.airNavalReports = [report()];
  world.countries.turkey.air.wings = [];
  world.countries.turkey.navy.ships = [];
  assert.ok(validateWorld(world));
  assert.deepEqual(
    decodeSave(encodeSave(world)).airNavalReports,
    world.airNavalReports,
  );
});

test("malformed, duplicate, future, mixed-day and oversized reports are rejected atomically", () => {
  const original = createWorld("turkey");
  original.day = 2;
  original.airNavalReports = [report(), report("germany")];
  const corruptions: ((world: World) => void)[] = [
    (world) => {
      world.airNavalReports!.push(report());
    },
    (world) => {
      world.airNavalReports![0].country = "unknown";
    },
    (world) => {
      world.airNavalReports![0].day = 3;
    },
    (world) => {
      world.airNavalReports![0].day = 1.5;
    },
    (world) => {
      world.airNavalReports![0].day = 2;
    },
    (world) => {
      world.airNavalReports![0].air.combatLosses = -1;
    },
    (world) => {
      world.airNavalReports![0].air.flown = NaN;
    },
    (world) => {
      world.airNavalReports![0].navy.fuelSpent = Infinity;
    },
    (world) => {
      world.airNavalReports![0].navy.active = 1.5;
    },
    (world) => {
      world.airNavalReports![0].air.engagements = 41;
    },
    (world) => {
      world.airNavalReports![0].navy.sunk = 121;
    },
    (world) => {
      Object.assign(world.airNavalReports![0].air, { extra: 1 });
    },
    (world) => {
      Reflect.deleteProperty(world.airNavalReports![0].air, "baseLosses");
    },
    (world) => {
      world.airNavalReports = Array.from({ length: 500 }, () => report());
    },
  ];
  for (const corrupt of corruptions) {
    const world = structuredClone(original);
    corrupt(world);
    const before = structuredClone(world);
    assert.equal(validateWorld(world), false);
    assert.throws(() =>
      decodeSave(
        JSON.stringify({ format: "xarmy-europa-1936", version: 3, world }),
      ),
    );
    assert.deepEqual(
      world,
      before,
      "validation must not repair or mutate the source",
    );
  }
  assert.ok(validateWorld(original));
});
