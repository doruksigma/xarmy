import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommand, executeCommand } from "./commands";
import {
  canonicalAction,
  COMMAND_ACTION_MAX_CHARS,
  COMMAND_HISTORY_MAX_CHARS,
  COMMAND_RECEIPT_LIMIT,
  COMMAND_SUMMARY_MAX_CHARS,
  isValidAction,
  type CommandReceipt,
  type CommandState,
} from "./command-types";
import { advanceDay } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { createWorld, GEOGRAPHY, MAP } from "./world";
import type { Action, Country, Province, World } from "./types";

function order(world: World, action: Action, issuer = world.player) {
  const command = createCommand(world, action, issuer);
  const result = executeCommand(world, command, issuer);
  assert.equal(result.status, "applied", result.message);
  assert.ok(result.world.commandState);
  return { command, world: result.world };
}

function journalWorld() {
  const world = createWorld("turkey", "historical", 1936);
  world.day = 4;
  return order(world, {
    type: "recruit",
    unit: "infantry",
    province: "turkey-0",
  }).world;
}

function assertCorrupt(world: World) {
  assert.equal(validateWorld(world), false);
  assert.throws(() => decodeSave(encodeSave(world)), /bozuk|eksik/);
}

test("Eski v2 kayıt aynen yüklenir; emir geçmişi olmayan sefere alan eklenmez", () => {
  const world = createWorld("turkey", "historical", 1936);
  assert.equal(Object.hasOwn(world, "commandState"), false);
  const loaded = decodeSave(encodeSave(world));
  assert.deepEqual(loaded, world);
  assert.equal(Object.hasOwn(loaded, "commandState"), false);
  const invalid = { ...world, unknownProtocol: {} };
  assert.equal(validateWorld(invalid), false);
  assert.throws(() => decodeSave(encodeSave(invalid)));
});

test("Boş emir geçmişi ve budanmış ülke sayaçları değiştirilmeden saklanır", () => {
  const world = createWorld("turkey");
  for (const cursors of [{}, { turkey: 71, germany: 25 }] as Record<
    string,
    number
  >[]) {
    world.commandState = { version: 1, cursors, receipts: [] };
    assert.ok(validateWorld(world));
    const loaded = decodeSave(encodeSave(world));
    assert.deepEqual(loaded, world);
    const next = createCommand(loaded, {
      type: "commanderAutoAssign",
      enabled: true,
    });
    assert.equal(next.commandId, `turkey:${(cursors.turkey ?? 0) + 1}`);
  }
});

test("Kayıt dönüşünden sonra aynı asker alım emri insan gücünü ve silahları ikinci kez tüketmez", () => {
  const original = createWorld("turkey", "historical", 2936);
  const { command, world } = order(original, {
    type: "recruit",
    unit: "infantry",
    province: "turkey-0",
  });
  assert.ok(
    world.countries.turkey.manpower < original.countries.turkey.manpower,
  );
  assert.ok(
    world.countries.turkey.equipment.rifle <
      original.countries.turkey.equipment.rifle,
  );
  const loaded = decodeSave(encodeSave(world));
  assert.deepEqual(loaded, world);
  assert.equal(
    JSON.stringify(loaded.commandState),
    JSON.stringify(world.commandState),
  );
  const duplicate = executeCommand(loaded, command, "turkey");
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.world, loaded);
  assert.equal(duplicate.world.countries.turkey.recruitment.length, 1);
  assert.deepEqual(
    duplicate.world.countries.turkey.equipment,
    world.countries.turkey.equipment,
  );
  assert.equal(
    duplicate.world.countries.turkey.manpower,
    world.countries.turkey.manpower,
  );
  const conflict = executeCommand(
    loaded,
    {
      ...command,
      action: { type: "commanderAutoAssign", enabled: true },
    },
    "turkey",
  );
  assert.equal(conflict.code, "CONFLICT");
  assert.equal(conflict.world, loaded);
  assert.equal(createCommand(loaded, { type: "agency" }).commandId, "turkey:2");
});

test("Emir kaydı RNG tohumu ve sonraki günlerin deterministik sonucunu korur", () => {
  const world = journalWorld();
  let loaded = decodeSave(encodeSave(world));
  assert.equal(loaded.seed, world.seed);
  let uninterrupted = world;
  for (let day = 0; day < 4; day++) {
    uninterrupted = advanceDay(uninterrupted);
    loaded = advanceDay(loaded);
  }
  assert.deepEqual(loaded, uninterrupted);
  assert.deepEqual(
    loaded.commandState!.receipts.filter(
      (receipt) => receipt.issuerCountryId === world.player,
    ),
    world.commandState!.receipts,
    "Diğer ülkelerin yeni emirleri oyuncunun yakın emir geçmişini silmez",
  );
});

test("Birden çok ülkenin emir sıra sayacı ayrı korunur", () => {
  let world = createWorld("turkey");
  world = order(
    world,
    { type: "commanderAutoAssign", enabled: true },
    "germany",
  ).world;
  world = order(
    world,
    { type: "commanderAutoAssign", enabled: false },
    "turkey",
  ).world;
  world = order(
    world,
    { type: "commanderAutoAssign", enabled: false },
    "germany",
  ).world;
  const loaded = decodeSave(encodeSave(world));
  assert.equal(loaded.player, "turkey");
  assert.deepEqual(loaded.commandState?.cursors, { germany: 2, turkey: 1 });
  assert.deepEqual(loaded.commandState, world.commandState);
  assert.equal(
    createCommand(loaded, { type: "agency" }, "germany").commandId,
    "germany:3",
  );
});

test("64 kayıt sınırından silinen eski emir, yükleme sonrasında yeniden uygulanamaz", () => {
  let world = createWorld("turkey");
  const first = createCommand(world, {
    type: "commanderAutoAssign",
    enabled: true,
  });
  for (let index = 0; index < COMMAND_RECEIPT_LIMIT + 3; index++) {
    world = order(world, {
      type: "commanderAutoAssign",
      enabled: index % 2 === 0,
    }).world;
  }
  assert.equal(world.commandState?.receipts.length, COMMAND_RECEIPT_LIMIT);
  assert.ok(
    !world.commandState?.receipts.some(
      (receipt) => receipt.commandId === first.commandId,
    ),
  );
  const loaded = decodeSave(encodeSave(world));
  const stale = executeCommand(loaded, first, "turkey");
  assert.equal(stale.code, "STALE");
  assert.equal(stale.world, loaded);
  assert.equal(loaded.commandState?.cursors.turkey, COMMAND_RECEIPT_LIMIT + 3);
  assert.equal(
    createCommand(loaded, { type: "agency" }).commandId,
    `turkey:${COMMAND_RECEIPT_LIMIT + 4}`,
  );
});

test("Yok olmuş tümenin tarihsel emri geçerli kalır; geçmiş emir canlı varlık referansı değildir", () => {
  const initial = createWorld("turkey");
  const army = initial.armies.find((army) => army.country === "turkey")!;
  const { world } = order(initial, { type: "halt", army: army.id });
  world.armies = world.armies.filter((candidate) => candidate.id !== army.id);
  assert.ok(validateWorld(world));
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Bozuk günlük şeması veya bilinmeyen alan eski kayıt biçimi gibi kabul edilmez", () => {
  const invalidStates: unknown[] = [
    null,
    [],
    {},
    { version: 2, cursors: {}, receipts: [] },
    { version: 1, cursors: {}, receipts: [], replay: true },
    { version: 1, cursors: {}, receipts: "not-an-array" },
    { version: 1, cursors: [], receipts: [] },
  ];
  for (const invalid of invalidStates) {
    const world = createWorld("turkey");
    world.commandState = invalid as CommandState;
    assertCorrupt(world);
  }
  const world = journalWorld();
  Object.assign(world.commandState!.receipts[0], { ignored: "must reject" });
  assertCorrupt(world);
});

test("Geçersiz ülke, sıra ve komut kimliği kayıt yüklenirken reddedilir", () => {
  const cases: ((state: CommandState) => void)[] = [
    (state) => {
      state.cursors.turkey = -1;
    },
    (state) => {
      state.cursors.turkey = 1.5;
    },
    (state) => {
      state.cursors.turkey = Number.MAX_SAFE_INTEGER + 1;
    },
    (state) => {
      state.cursors.missing_country = 1;
    },
    (state) => {
      Object.defineProperty(state.cursors, "__proto__", {
        value: 1,
        enumerable: true,
      });
    },
    (state) => {
      delete state.cursors.turkey;
    },
    (state) => {
      state.receipts[0].sequence = 1.5;
    },
    (state) => {
      state.receipts[0].sequence = Number.MAX_SAFE_INTEGER + 1;
    },
    (state) => {
      state.receipts[0].commandId = "germany:1";
    },
    (state) => {
      state.receipts[0].commandId = "turkey:01";
    },
    (state) => {
      state.receipts[0].commandId = "turkey:2";
      state.receipts[0].sequence = 2;
    },
    (state) => {
      state.receipts.push(structuredClone(state.receipts[0]));
    },
    (state) => {
      state.receipts[0].issuerCountryId = "missing_country";
      state.receipts[0].commandId = "missing_country:1";
      state.cursors.missing_country = 1;
    },
  ];
  for (const mutate of cases) {
    const world = journalWorld();
    mutate(world.commandState!);
    assertCorrupt(world);
  }
});

test("Gelecekteki, ters sıralı ve kesirli emir zamanları yüklenmez", () => {
  const cases: ((receipt: CommandReceipt) => void)[] = [
    (receipt) => {
      receipt.issuedTick = 120;
    },
    (receipt) => {
      receipt.appliedTick = 120;
    },
    (receipt) => {
      receipt.issuedTick = 72;
      receipt.appliedTick = 48;
    },
    (receipt) => {
      receipt.issuedTick = -24;
    },
    (receipt) => {
      receipt.appliedTick = 0.5;
    },
    (receipt) => {
      receipt.issuedTick = 1;
    },
    (receipt) => {
      receipt.appliedTick = Number.MAX_SAFE_INTEGER + 1;
    },
  ];
  for (const mutate of cases) {
    const world = journalWorld();
    mutate(world.commandState!.receipts[0]);
    assertCorrupt(world);
  }
});

test("Eksik veya bilinmeyen emir alanı, enum ve uzun özet kayda sokulamaz", () => {
  const malformed: unknown[] = [
    { type: "unknown" },
    { type: "recruit", unit: "infantry" },
    { type: "recruit", unit: "laser", province: "turkey-0" },
    { type: "recruit", unit: "infantry", province: "turkey-0", free: true },
    { type: "commanderAutoAssign", enabled: "yes" },
    { type: "trade", target: "germany", resource: "oil", amount: null },
    { type: "haltGroup", armies: ["army-1", 12] },
    { type: "halt", army: "__proto__" },
  ];
  for (const action of malformed) {
    const world = journalWorld();
    world.commandState!.receipts[0].action = action as Action;
    assertCorrupt(world);
  }
  const world = journalWorld();
  world.commandState!.receipts[0].summary = "x".repeat(
    COMMAND_SUMMARY_MAX_CHARS + 1,
  );
  assertCorrupt(world);
});

test("Günlük kayıt sayısı, tek emir ve toplam emir metni bellek sınırları doğrulanır", () => {
  const world = journalWorld();
  const original = world.commandState!.receipts[0];
  world.commandState!.receipts = Array.from(
    { length: COMMAND_RECEIPT_LIMIT + 1 },
    (_, index) => ({
      ...structuredClone(original),
      sequence: index + 1,
      commandId: `turkey:${index + 1}`,
    }),
  );
  world.commandState!.cursors.turkey = COMMAND_RECEIPT_LIMIT + 1;
  assertCorrupt(world);

  const group = (count: number): Action => ({
    type: "haltGroup",
    armies: Array.from(
      { length: count },
      (_, index) => `army-${String(index).padStart(4, "0")}-${"x".repeat(70)}`,
    ),
  });
  const oversized = group(1000);
  assert.ok(canonicalAction(oversized).length > COMMAND_ACTION_MAX_CHARS);
  const single = journalWorld();
  single.commandState!.receipts[0].action = oversized;
  assertCorrupt(single);

  const valid = group(500);
  assert.ok(isValidAction(valid));
  assert.ok(canonicalAction(valid).length * 4 > COMMAND_HISTORY_MAX_CHARS);
  const aggregate = journalWorld();
  aggregate.commandState!.receipts = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(original),
    action: valid,
    sequence: index + 1,
    commandId: `turkey:${index + 1}`,
  }));
  aggregate.commandState!.cursors.turkey = 4;
  assertCorrupt(aggregate);
});

function regionalWorld() {
  const world = createWorld("turkey");
  for (const id of Object.keys(world.provinces))
    if (GEOGRAPHY[id].legacyRegion !== id) delete world.provinces[id];
  for (const army of world.armies)
    army.province = GEOGRAPHY[army.province].legacyRegion;
  for (const country of Object.values(world.countries)) {
    for (const wing of country.air.wings) {
      wing.base = GEOGRAPHY[wing.base].legacyRegion;
      wing.target = GEOGRAPHY[wing.target].legacyRegion;
    }
    for (const ship of country.navy.ships)
      ship.port = GEOGRAPHY[ship.port].legacyRegion;
  }
  return world;
}

test("Eski bölge kaydını şehir sınırlarına taşımak emir günlüğünü silmez", () => {
  const { command, world } = order(regionalWorld(), {
    type: "commanderAutoAssign",
    enabled: true,
  });
  const loaded = decodeSave(encodeSave(world));
  assert.equal(Object.keys(loaded.provinces).length, MAP.provinces.length);
  assert.deepEqual(loaded.commandState, world.commandState);
  assert.equal(executeCommand(loaded, command, "turkey").world, loaded);
  world.commandState!.receipts[0].appliedTick = 24;
  assert.throws(() => decodeSave(encodeSave(world)));
});

test("Eski komutan kapasitesi taşınırken emir günlüğü korunur ve bozuk günlük onarılmaz", () => {
  const world = createWorld("turkey");
  const country = world.countries.turkey;
  delete country.autoAssignCommanders;
  const original = world.armies.find((army) => army.country === "turkey")!;
  world.armies = world.armies.filter((army) => army.country !== "turkey");
  for (let index = 0; index < 13; index++)
    world.armies.push({
      ...structuredClone(original),
      id: `legacy-command-army-${index}`,
      general: country.generals[0].id,
    });
  world.commandState = { version: 1, cursors: { turkey: 17 }, receipts: [] };
  const loaded = decodeSave(encodeSave(world));
  assert.deepEqual(loaded.commandState, world.commandState);
  assert.ok(loaded.countries.turkey.generals.length > country.generals.length);
  world.commandState.cursors.turkey = -1;
  assert.throws(() => decodeSave(encodeSave(world)));
});

test("V1 sürüm etiketi yeni emir günlüğünün doğrulamasını atlatamaz", () => {
  const old = JSON.parse(JSON.stringify(createWorld("turkey")));
  old.version = 1;
  delete old.difficulty;
  delete old.plans;
  delete old.conferences;
  delete old.warScore;
  for (const country of Object.values(old.countries) as Country[]) {
    for (const wing of country.air.wings)
      country.equipment[wing.model] += wing.count;
    for (const ship of country.navy.ships) country.equipment[ship.model] += 1;
    for (const equipment of [
      "strategicBomber",
      "reconPlane",
      "transport",
      "carrierFighter",
      "destroyer",
      "battleship",
    ])
      Reflect.deleteProperty(country.equipment, equipment);
    Reflect.deleteProperty(country, "automation");
    Reflect.deleteProperty(country, "cabinet");
    Reflect.deleteProperty(country, "decisions");
    Reflect.deleteProperty(country.air, "wings");
    Reflect.deleteProperty(country.navy, "ships");
    Reflect.deleteProperty(country.navy, "zone");
  }
  for (const province of Object.values(old.provinces) as Province[]) {
    Reflect.deleteProperty(province.buildings, "mine");
    Reflect.deleteProperty(province.buildings, "airfield");
    Reflect.deleteProperty(province.buildings, "antiAir");
  }
  for (const army of old.armies) delete army.support;
  const save = () =>
    JSON.stringify({ format: "xarmy-europa-1936", version: 1, world: old });
  const loaded = decodeSave(save());
  assert.ok(validateWorld(loaded));
  assert.equal(Object.hasOwn(loaded, "commandState"), false);
  for (const state of [
    { version: 1, cursors: {}, receipts: [] },
    { broken: true },
  ]) {
    old.commandState = state;
    assert.throws(() =>
      decodeSave(
        JSON.stringify({
          format: "xarmy-europa-1936",
          version: 1,
          world: old,
        }),
      ),
    );
  }
});
