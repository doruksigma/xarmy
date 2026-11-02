import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commandTick,
  createCommand,
  executeCommand,
  executeCommandInPlace,
} from "./commands";
import { isValidProtocolCommand } from "./command-types";
import { advanceDay } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { MAX_CAMPAIGN_HOUR, worldHour } from "./time";
import { createWorld } from "./world";
import type { World } from "./types";

function dailySnapshot(world: World) {
  const old: Omit<World, "version" | "hour"> & {
    version: number;
    hour?: number;
  } = structuredClone(world);
  old.version = 2;
  delete old.hour;
  for (const event of old.events) delete event.hour;
  return old;
}

function envelope(world: unknown, version: number) {
  return JSON.stringify({ format: "xarmy-europa-1936", version, world });
}

function paidDailyWorld() {
  const world = createWorld("turkey");
  world.day = 7;
  const command = createCommand(world, {
    type: "recruit",
    unit: "infantry",
    province: world.countries.turkey.capital,
  });
  const result = executeCommand(world, command, world.player);
  assert.equal(result.status, "applied", result.message);
  return { world: result.world, command };
}

test("Saat ortası kayıt yükleme emir saatlerini, kaynakları ve deterministik devamı korur", () => {
  const source = createWorld("turkey", "alternative", 1936);
  source.day = 2;
  source.hour = 9;
  const command = createCommand(source, {
    type: "recruit",
    unit: "infantry",
    province: source.countries.turkey.capital,
  });
  source.hour = 13; // Delayed commands retain their issue hour and use live costs.
  const result = executeCommand(source, command, source.player);
  assert.equal(result.status, "applied", result.message);
  const world = result.world,
    loaded = decodeSave(encodeSave(world)),
    receipt = loaded.commandState!.receipts[0];
  assert.equal(receipt.issuedTick, 57);
  assert.equal(receipt.appliedTick, 61);
  assert.equal(loaded.hour, 13);
  assert.deepEqual(loaded, world);
  const before = structuredClone(loaded);
  assert.equal(
    executeCommandInPlace(loaded, command, loaded.player).status,
    "duplicate",
  );
  assert.deepEqual(loaded, before);
  const continued = advanceDay(loaded);
  assert.equal(continued.hour, 13);
  assert.equal(worldHour(continued), worldHour(world) + 24);
  assert.deepEqual(continued, advanceDay(world));
});

test("V2 günlük kayıt gece yarısına taşınır; eski emir kimliği ve saatleri değişmeden kalır", () => {
  const { world, command } = paidDailyWorld(),
    old = dailySnapshot(world),
    before = structuredClone(old),
    loaded = decodeSave(envelope(old, 2));
  assert.equal(loaded.version, 3);
  assert.equal(loaded.day, 7);
  assert.equal(loaded.hour, 0);
  assert.equal(commandTick(loaded), 168);
  assert.deepEqual(loaded.commandState, world.commandState);
  assert.deepEqual(loaded.countries, world.countries);
  assert.deepEqual(dailySnapshot(loaded), before);
  assert.equal(
    executeCommandInPlace(loaded, command, loaded.player).status,
    "duplicate",
  );
  loaded.hour = 1;
  const next = createCommand(loaded, {
    type: "commanderAutoAssign",
    enabled: false,
  });
  assert.equal(next.commandId, "turkey:2");
  assert.equal(next.issuedTick, 169);
  assert.equal(
    executeCommandInPlace(loaded, next, loaded.player).status,
    "applied",
  );
  assert.deepEqual(decodeSave(encodeSave(loaded)), loaded);
});

test("Emir günlüğü olmayan gerçek V2 kayıt için yeni günlük veya kaynak üretilmez", () => {
  const old = dailySnapshot(createWorld("germany"));
  old.day = 15;
  old.countries.germany.production[0].progress = 0.25;
  const loaded = decodeSave(envelope(old, 2));
  assert.equal(loaded.hour, 0);
  assert.equal(Object.hasOwn(loaded, "commandState"), false);
  assert.deepEqual(dailySnapshot(loaded), old);
});

test("Günlük kayıt sürümü modern saati veya bozuk eski emir zamanını gizleyemez", () => {
  const { world } = paidDailyWorld();
  for (const hour of [0, 7, null, "0"])
    assert.throws(() =>
      decodeSave(envelope({ ...dailySnapshot(world), hour }, 2)),
    );
  for (const mutate of [
    (w: ReturnType<typeof dailySnapshot>) => {
      w.commandState!.receipts[0].issuedTick = 1;
    },
    (w: ReturnType<typeof dailySnapshot>) => {
      w.commandState!.receipts[0].appliedTick = 169;
    },
    (w: ReturnType<typeof dailySnapshot>) => {
      w.commandState!.receipts[0].appliedTick = 192;
    },
  ]) {
    const old = dailySnapshot(world);
    mutate(old);
    assert.throws(() => decodeSave(envelope(old, 2)));
  }
});

test("V3 eksik, kesirli veya sınır dışı saatleri onarmadan reddeder", () => {
  const world = createWorld("turkey");
  const absent = structuredClone(world);
  Reflect.deleteProperty(absent, "hour");
  assert.equal(validateWorld(absent), false);
  assert.throws(() => decodeSave(envelope(absent, 3)));
  for (const hour of [-1, 24, 0.5, null, "7", Number.NaN]) {
    const invalid = { ...world, hour };
    assert.equal(validateWorld(invalid), false);
    assert.throws(() => decodeSave(envelope(invalid, 3)));
  }
  for (const hour of [0, 1, 23]) {
    const valid = { ...world, hour };
    assert.ok(validateWorld(valid));
    assert.deepEqual(decodeSave(encodeSave(valid)), valid);
  }
});

test("Kayıt zarfı ve dünya sürümü uyuşmak zorundadır", () => {
  const current = createWorld("turkey"),
    daily = dailySnapshot(current);
  for (const version of [1, 2])
    assert.throws(() => decodeSave(envelope(current, version)));
  for (const version of [1, 3])
    assert.throws(() => decodeSave(envelope(daily, version)));
});

test("Aynı günün gelecekteki saati ve kampanya saat sınırını aşan emir uygulanmaz", () => {
  const world = createWorld("turkey");
  world.day = 12;
  world.hour = 8;
  const command = createCommand(world, { type: "difficulty", value: "easy" });
  assert.equal(
    executeCommand(
      world,
      { ...command, issuedTick: command.issuedTick + 1 },
      world.player,
    ).code,
    "FUTURE_TICK",
  );
  world.day = 36500;
  world.hour = 23;
  const last = createCommand(world, command.action);
  assert.equal(last.issuedTick, MAX_CAMPAIGN_HOUR);
  assert.ok(isValidProtocolCommand(last));
  assert.equal(
    isValidProtocolCommand({ ...last, issuedTick: MAX_CAMPAIGN_HOUR + 1 }),
    false,
  );
  const applied = executeCommand(world, last, world.player);
  assert.equal(applied.status, "applied");
  assert.ok(validateWorld(applied.world));
  assert.deepEqual(decodeSave(encodeSave(applied.world)), applied.world);
});

test("Eski olayların saatsiz biçimi korunur; yeni olay saatleri katı doğrulanır", () => {
  const world = createWorld("turkey");
  world.day = 5;
  world.hour = 14;
  world.events = [
    { day: 1, text: "Eski günlük olay", kind: "info" },
    { day: 5, hour: 14, text: "Saatlik olay", kind: "info" },
  ];
  assert.deepEqual(decodeSave(encodeSave(world)), world);
  for (const hour of [-1, 24, 1.5, "2", null]) {
    const invalid = structuredClone(world);
    Object.assign(invalid.events[1], { hour });
    assert.equal(validateWorld(invalid), false);
    assert.throws(() => decodeSave(envelope(invalid, 3)));
  }
});
