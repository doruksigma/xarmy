import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createWorld } from "./engine";
import { applyCountryAction } from "./action-engine";
import {
  createCommand,
  executeCommand,
  previewAction,
  previewCommand,
  commandTick,
} from "./commands";
import {
  COMMAND_HISTORY_MAX_CHARS,
  COMMAND_RECEIPT_LIMIT,
  canonicalAction,
  isValidAction,
  isValidCommandState,
} from "./command-types";
import type { Action } from "./types";

function buildFixture() {
  const world = createWorld("turkey");
  world.countries.turkey.treasury = 10_000;
  const action: Action = {
    type: "build",
    building: "civil",
    province: world.countries.turkey.capital,
  };
  return { world, action, command: createCommand(world, action) };
}

test("Komut tekrarında inşaat ve maliyet yalnız bir kez uygulanır; girdi ve eski dünya korunur", () => {
  const { world, action, command } = buildFixture();
  const original = structuredClone(world);
  const result = executeCommand(world, command, world.player);
  assert.equal(result.status, "applied");
  assert.deepEqual(world, original);
  assert.equal(world.commandState, undefined);
  assert.equal(
    result.world.countries.turkey.construction.length,
    world.countries.turkey.construction.length + 1,
  );
  assert.ok(
    result.world.countries.turkey.treasury < world.countries.turkey.treasury,
  );
  const duplicate = executeCommand(result.world, command, world.player);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.world, result.world);
  assert.equal(result.world.commandState!.cursors.turkey, 1);
  assert.equal(
    isValidCommandState(
      result.world.commandState,
      Object.keys(world.countries),
      0,
    ),
    true,
  );
  action.building = "military";
  command.action = { type: "agency" };
  assert.equal(result.world.commandState!.receipts[0].action.type, "build");
});

test("Aynı kimliğin farklı içerik veya tarihle gönderilmesi çatışmadır; anahtar sırası sonucu değiştirmez", () => {
  const { world, command } = buildFixture();
  const first = executeCommand(world, command, world.player);
  const reordered = {
    ...command,
    action: {
      province: world.countries.turkey.capital,
      building: "civil",
      type: "build",
    },
  };
  assert.equal(
    executeCommand(first.world, reordered, world.player).status,
    "duplicate",
  );
  const conflicting = executeCommand(
    first.world,
    { ...command, action: { type: "agency" } },
    world.player,
  );
  assert.equal(conflicting.code, "CONFLICT");
  assert.equal(conflicting.world, first.world);
  assert.equal(
    executeCommand(first.world, { ...command, issuedTick: 24 }, world.player)
      .code,
    "CONFLICT",
  );
});

test("Sıra atlama ve gelecek tarih reddedilir; günlük sınır etiketi saatlik çözümleme yapmaz", () => {
  const { world, command } = buildFixture();
  assert.equal(
    executeCommand(world, { ...command, commandId: "turkey:2" }, world.player)
      .code,
    "OUT_OF_ORDER",
  );
  assert.equal(
    executeCommand(world, { ...command, issuedTick: 24 }, world.player).code,
    "FUTURE_TICK",
  );
  assert.equal(
    executeCommand(world, { ...command, issuedTick: 1 }, world.player).code,
    "INVALID_COMMAND",
  );
  world.day = 7;
  assert.equal(commandTick(world), 168);
  const issued = createCommand(world, { type: "difficulty", value: "easy" });
  const applied = executeCommand(world, issued, world.player);
  assert.equal(applied.world.day, 7);
  assert.equal(applied.world.commandState!.receipts[0].appliedTick, 168);
});

test("Güvenilir aktörle uyuşmayan ülke ve başka ülkenin tümeni üzerinden emir verilemez", () => {
  const world = createWorld("turkey");
  const foreign = world.armies.find((a) => a.country === "germany")!;
  const forged = createCommand(
    world,
    { type: "halt", army: foreign.id },
    "germany",
  );
  assert.equal(
    executeCommand(world, forged, world.player).code,
    "UNAUTHORIZED",
  );
  const stolenArmy = createCommand(world, { type: "halt", army: foreign.id });
  const denied = executeCommand(world, stolenArmy, world.player);
  assert.equal(denied.code, "RULE_REJECTED");
  assert.equal(denied.world, world);
  const missing = createCommand(world, { type: "agency" }, "missing");
  assert.equal(
    executeCommand(world, missing, "missing").code,
    "UNKNOWN_ISSUER",
  );
});

test("Ülke adına yetkili işlem kendi kaynağını kullanır ve oyuncu kimliğini değiştirmez", () => {
  const world = createWorld("turkey");
  world.countries.germany.treasury = 10_000;
  const command = createCommand(
    world,
    {
      type: "build",
      building: "civil",
      province: world.countries.germany.capital,
    },
    "germany",
  );
  const result = executeCommand(world, command, "germany");
  assert.equal(result.status, "applied");
  assert.equal(result.world.player, "turkey");
  assert.equal(
    result.world.countries.turkey.treasury,
    world.countries.turkey.treasury,
  );
  assert.ok(
    result.world.countries.germany.treasury < world.countries.germany.treasury,
  );
  assert.equal(result.world.commandState!.cursors.germany, 1);
  assert.equal(result.world.commandState!.cursors.turkey, undefined);
  const difficulty = createCommand(
    result.world,
    { type: "difficulty", value: "hard" },
    "germany",
  );
  assert.equal(
    executeCommand(result.world, difficulty, "germany").code,
    "RULE_REJECTED",
  );
});

test("Başarısız emir kaynak, sıra, rastgelelik ve seri numarasına dokunmaz; düzelince aynı emir denenebilir", () => {
  const { world, command } = buildFixture();
  world.countries.turkey.treasury = 0;
  const before = structuredClone(world);
  const rejected = executeCommand(world, command, world.player);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.world, world);
  assert.deepEqual(world, before);
  assert.equal(
    createCommand(world, { type: "agency" }).commandId,
    command.commandId,
  );
  world.countries.turkey.treasury = 10_000;
  assert.equal(executeCommand(world, command, world.player).status, "applied");
});

test("Önizleme gerçek inşaat maliyetini aynı kurallarla hesaplar, dünya ve geçmişe dokunmaz", () => {
  const { world, command } = buildFixture();
  const before = structuredClone(world);
  const preview = previewCommand(world, command, world.player);
  assert.equal(preview.eligible, true);
  assert.equal(preview.code, "READY");
  assert.ok(preview.deltas.treasury < 0);
  assert.deepEqual(world, before);
  const result = executeCommand(world, command, world.player);
  assert.equal(
    result.world.countries.turkey.treasury - world.countries.turkey.treasury,
    preview.deltas.treasury,
  );
  const saved = structuredClone(result.world);
  const duplicate = previewCommand(result.world, command, world.player);
  assert.equal(duplicate.code, "DUPLICATE");
  assert.equal(duplicate.deltas.treasury, 0);
  assert.deepEqual(result.world, saved);
});

test("Önizleme siyasi güç, personel ve ekipman maliyetlerini gerçek sonuçla eşleştirir", () => {
  const world = createWorld("turkey");
  const c = world.countries.turkey;
  c.economy = "civilian";
  c.political = 100;
  const law: Action = { type: "economy", law: "partial" };
  assert.equal(previewAction(world, law).deltas.political, -50);
  c.manpower = 1_000_000;
  c.equipment.rifle = 100_000;
  c.treasury = 10_000;
  const recruit: Action = {
    type: "recruit",
    unit: "infantry",
    province: c.capital,
  };
  const preview = previewAction(world, recruit);
  assert.equal(preview.eligible, true);
  const result = executeCommand(
    world,
    createCommand(world, recruit),
    world.player,
  );
  assert.equal(result.status, "applied");
  assert.equal(
    result.world.countries.turkey.manpower - c.manpower,
    preview.deltas.manpower,
  );
  assert.equal(
    result.world.countries.turkey.equipment.rifle - c.equipment.rifle,
    preview.deltas.equipment.rifle,
  );
  assert.ok(preview.deltas.manpower < 0);
});

test("Önizleme sonrası kaybolan kaynak ve erişim yürütmede tekrar kontrol edilir", () => {
  const { world, command } = buildFixture();
  assert.equal(previewCommand(world, command, world.player).eligible, true);
  world.countries.turkey.treasury = 0;
  const failed = executeCommand(world, command, world.player);
  assert.equal(failed.code, "RULE_REJECTED");
  assert.equal(failed.world, world);
  const army = world.armies.find((a) => a.country === world.player)!;
  army.province = "turkey-0";
  army.organization = 100;
  world.countries.bulgaria.access.push("turkey");
  const march = createCommand(world, {
    type: "move",
    army: army.id,
    to: "bulgaria-0",
  });
  assert.equal(previewCommand(world, march, world.player).eligible, true);
  world.countries.bulgaria.access = [];
  assert.equal(
    executeCommand(world, march, world.player).code,
    "RULE_REJECTED",
  );
  assert.equal(world.commandState, undefined);
});

test("Geçmiş sınırından çıkarılan eski emir imleç sayesinde tekrar uygulanamaz", () => {
  const { world, command } = buildFixture();
  let current = executeCommand(world, command, world.player).world;
  for (let i = 0; i < COMMAND_RECEIPT_LIMIT + 2; i++) {
    const next = createCommand(current, {
      type: "difficulty",
      value: i % 2 ? "easy" : "normal",
    });
    const result = executeCommand(current, next, current.player);
    assert.equal(result.status, "applied");
    current = result.world;
  }
  assert.equal(current.commandState!.receipts.length, COMMAND_RECEIPT_LIMIT);
  assert.ok(
    !current.commandState!.receipts.some(
      (r) => r.commandId === command.commandId,
    ),
  );
  const stale = executeCommand(current, command, current.player);
  assert.equal(stale.code, "STALE");
  assert.equal(stale.world, current);
  assert.equal(current.countries.turkey.construction.length, 1);
});

test("Büyük toplu emirlerde geçmiş toplam metin bütçesi de sınırlıdır", () => {
  let world = createWorld("turkey");
  const army = world.armies.find((a) => a.country === world.player)!;
  army.id = "a".repeat(80);
  const first = createCommand(world, {
    type: "haltGroup",
    armies: Array(700).fill(army.id),
  });
  for (let i = 0; i < 4; i++) {
    const command = createCommand(world, first.action);
    const result = executeCommand(world, command, world.player);
    assert.equal(result.status, "applied");
    world = result.world;
  }
  assert.equal(world.commandState!.receipts.length, 2);
  assert.ok(
    world.commandState!.receipts.reduce(
      (n, r) => n + canonicalAction(r.action).length,
      0,
    ) <= COMMAND_HISTORY_MAX_CHARS,
  );
  assert.equal(world.commandState!.cursors.turkey, 4);
  assert.equal(executeCommand(world, first, world.player).code, "STALE");
});

test("Bozuk eylemler motor çalışmadan reddedilir; bilinmeyen alan, NaN, dev dizi ve prototip engellenir", () => {
  const world = createWorld("turkey");
  const base = createCommand(world, { type: "agency" });
  const invalid = [
    null,
    {},
    { type: "unknown" },
    { type: "agency", extra: true },
    { type: "production", equipment: "rifle", factories: NaN },
    { type: "production", equipment: "rifle", factories: Infinity },
    { type: "production", equipment: "rifle", factories: -1 },
    { type: "production", equipment: "rifle", factories: 1.5 },
    { type: "move", army: "__proto__", to: "turkey-0" },
    { type: "move", army: "army-1", to: "turkey-0", append: "yes" },
    { type: "haltGroup", armies: Array(2501).fill("army-1") },
    { type: "haltGroup", armies: Array(1000).fill("a".repeat(80)) },
    { type: "economy", law: "free" },
    Object.assign(Object.create({ unwanted: true }), { type: "agency" }),
  ];
  const before = structuredClone(world);
  for (const action of invalid) {
    assert.equal(isValidAction(action), false);
    const result = executeCommand(world, { ...base, action }, world.player);
    assert.equal(result.code, "INVALID_COMMAND");
    assert.equal(result.world, world);
    assert.equal(previewAction(world, action).eligible, false);
  }
  for (const invalidEnvelope of [
    { ...base, extra: true },
    { ...base, commandId: "turkey:01" },
    { ...base, commandId: "germany:1" },
    { ...base, commandId: "turkey:9007199254740992" },
  ])
    assert.equal(
      executeCommand(world, invalidEnvelope, world.player).code,
      "INVALID_COMMAND",
    );
  assert.deepEqual(world, before);
});

test("Eski applyAction davranışı ve günlük olmayan eski kayıt şekli korunur", () => {
  const { world, action } = buildFixture();
  const legacy = applyAction(world, action);
  assert.equal(legacy.error, null);
  assert.equal(legacy.world.commandState, undefined);
  const explicit = applyCountryAction(world, world.player, action);
  assert.deepEqual(explicit.world, legacy.world);
  const absent = applyCountryAction(world, "missing", action);
  assert.ok(absent.error);
  assert.equal(absent.world, world);
});

test("Toplu emir reddedilince önceki üyelerin rotası ve komut kaydı kısmen değişmez", () => {
  const world = createWorld("turkey");
  const own = world.armies.find((a) => a.country === world.player)!;
  own.route = ["turkey-1"];
  const foreign = world.armies.find((a) => a.country !== world.player)!;
  const before = structuredClone(world);
  const command = createCommand(world, {
    type: "haltGroup",
    armies: [own.id, foreign.id],
  });
  const result = executeCommand(world, command, world.player);
  assert.equal(result.status, "rejected");
  assert.equal(result.world, world);
  assert.deepEqual(world, before);
});

test("Emir geçmişi hedef şehri, grup sayısını ve verildiği andaki birlik adını korur", () => {
  const world = createWorld("turkey");
  const armies = world.armies
    .filter((army) => army.country === world.player)
    .slice(0, 2);
  for (const army of armies) {
    army.province = "turkey-0";
    army.organization = 100;
  }
  const action: Action = {
    type: "moveGroup",
    armies: armies.map((army) => army.id),
    to: "turkey-1",
  };
  const result = executeCommand(
    world,
    createCommand(world, action),
    world.player,
  );
  assert.equal(result.status, "applied");
  assert.match(result.world.commandState!.receipts[0].summary, /2 tümen →/);
  const move: Action = { type: "move", army: armies[0].id, to: "turkey-1" };
  const next = executeCommand(
    result.world,
    createCommand(result.world, move),
    world.player,
  );
  assert.equal(next.status, "applied");
  const recorded = next.world.commandState!.receipts.at(-1)!.summary;
  assert.ok(recorded.includes(armies[0].name));
  next.world.armies.find((army) => army.id === armies[0].id)!.name = "Yeni ad";
  assert.equal(next.world.commandState!.receipts.at(-1)!.summary, recorded);
  armies[0].name = "A".repeat(500);
  const longName = executeCommand(
    world,
    createCommand(world, move),
    world.player,
  );
  assert.equal(longName.status, "applied");
  assert.ok(
    isValidCommandState(
      longName.world.commandState,
      Object.keys(world.countries),
      0,
    ),
  );
});
