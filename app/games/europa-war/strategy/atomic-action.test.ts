import { test } from "node:test";
import assert from "node:assert/strict";
import { controlled, createWorld, GEOGRAPHY } from "./world";
import { commanderArmies } from "./commanders";
import { detachArmy } from "./planning";
import {
  applyCountryAction,
  transactWorldInPlace,
  tryCountryActionInPlace,
} from "./action-engine";
import {
  createCommand,
  executeCommand,
  executeCommandInPlace,
  previewAction,
} from "./commands";
import {
  canonicalAction,
  COMMAND_RECEIPT_LIMIT,
  isValidAction,
  isValidCommandState,
} from "./command-types";
import { decodeSave, encodeSave } from "./storage";
import type { Action } from "./types";

test("Makbuz boyutu anahtar sırasından bağımsızdır ve kaçış karakterlerini sayar", () => {
  const actions: Action[] = [
    { to: "turkey-0", type: "moveGroup", armies: ["b", "a"], stance: "hold" },
    { type: "front", armies: ["x", "y"], provinces: ["one", "two"] },
    { type: "commanderAutoAssign", enabled: false },
  ];
  for (const action of actions) {
    assert.ok(isValidAction(action));
    assert.equal(JSON.stringify(action).length, canonicalAction(action).length);
  }
  const escaped: Action = {
    type: "move",
    army: 'quoted"army\\name\n',
    to: "turkey-0",
  };
  assert.equal(isValidAction(escaped), false);
  assert.equal(JSON.stringify(escaped).length, canonicalAction(escaped).length);
});

test("Taslak aramaları önceki değişiklikleri ve yeni birlikleri görür, canlı kayıtları döndürür", () => {
  const world = createWorld("turkey");
  const general = world.countries.turkey.generals[0].id;
  const original = world.armies.find((army) => army.country === "turkey")!;
  const addedId = `${original.id}-draft`;
  const result = transactWorldInPlace(world, (draft) => {
    draft.provinces["turkey-0"].controller = "germany";
    draft.provinces["germany-0"].controller = "turkey";
    const territories = controlled(draft, "turkey");
    assert.ok(!territories.some((province) => province.id === "turkey-0"));
    const captured = territories.find(
      (province) => province.id === "germany-0",
    )!;
    assert.ok(captured);
    captured.resistance = 17;
    assert.equal(draft.provinces["germany-0"].resistance, 17);

    for (const army of draft.armies)
      if (army.country === "turkey") army.general = null;
    draft.armies.push({
      ...structuredClone(original),
      id: addedId,
      general,
      marchGroup: "draft-group",
    });
    const assigned = commanderArmies(draft, "turkey", general);
    assert.deepEqual(
      assigned.map((army) => army.id),
      [addedId],
    );
    assigned[0].organization = 19;
    assert.equal(draft.armies.at(-1)!.organization, 19);
    detachArmy(draft, addedId);
    assert.equal(draft.armies.at(-1)!.marchGroup, undefined);
  });
  assert.equal(result.error, null);
  assert.equal(world.provinces["germany-0"].resistance, 17);
  assert.equal(world.armies.at(-1)!.organization, 19);
  assert.equal(world.armies.at(-1)!.marchGroup, undefined);
  assert.deepEqual(structuredClone(world), world);
});

function bomberFixture() {
  const world = createWorld("turkey");
  const c = world.countries.turkey;
  c.equipment.bomber = 20;
  assert.equal(
    tryCountryActionInPlace(world, "turkey", {
      type: "createWing",
      model: "bomber",
      count: 20,
      base: c.capital,
    }).error,
    null,
  );
  const wing = world.countries.turkey.air.wings.find(
    (candidate) => candidate.model === "bomber",
  )!;
  wing.mission = "support";
  wing.target = wing.base;
  world.countries.turkey.wars.push("uk");
  world.countries.uk.wars.push("turkey");
  return world;
}

test("Yerinde emir: hava görevi önce kanatları değiştirse bile ret bütün yazmaları geri alır", () => {
  const world = bomberFixture();
  const country = world.countries.turkey;
  const wings = country.air.wings;
  const original = structuredClone(world);
  const action: Action = { type: "air", mission: "support", target: "uk" };
  const result = executeCommandInPlace(
    world,
    createCommand(world, action),
    "turkey",
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.code, "RULE_REJECTED");
  assert.match(result.message, /ulaşamıyor/);
  assert.equal(result.world, world);
  assert.equal(world.countries.turkey, country);
  assert.equal(world.countries.turkey.air.wings, wings);
  assert.deepEqual(world, original);
  assert.equal(createCommand(world, { type: "agency" }).commandId, "turkey:1");
});

test("Yerinde ve değişmez yürütücü aynı kuralları, harcamayı ve makbuzu üretir", () => {
  const initial = createWorld("turkey");
  const live = structuredClone(initial);
  const action: Action = {
    type: "build",
    building: "civil",
    province: initial.countries.turkey.capital,
  };
  const command = createCommand(initial, action);
  const immutable = executeCommand(initial, command, "turkey");
  const mutable = executeCommandInPlace(live, command, "turkey");
  assert.equal(immutable.status, "applied");
  assert.equal(mutable.status, "applied");
  assert.equal(mutable.world, live);
  assert.notEqual(immutable.world, initial);
  assert.deepEqual(mutable.world, immutable.world);
  immutable.world.countries.germany.treasury = -1;
  assert.notEqual(initial.countries.germany.treasury, -1);
  assert.equal(initial.commandState, undefined);
});

test("Başarı yalnız değişen yolları kopyalar; canlı dünya donmaz ve Proxy içermez", () => {
  const world = createWorld("turkey");
  const turkey = world.countries.turkey;
  const germany = world.countries.germany;
  const command = createCommand(world, {
    type: "build",
    building: "civil",
    province: turkey.capital,
  });
  assert.equal(
    executeCommandInPlace(world, command, "turkey").status,
    "applied",
  );
  assert.notEqual(world.countries.turkey, turkey);
  assert.equal(world.countries.germany, germany);
  assert.equal(Object.isFrozen(world.countries.turkey), false);
  world.countries.turkey.treasury += 1;
  assert.deepEqual(structuredClone(world), world);
  assert.deepEqual(decodeSave(encodeSave(world)), world);
  const legacy = applyCountryAction(world, "turkey", {
    type: "commanderAutoAssign",
    enabled: false,
  });
  assert.equal(legacy.error, null);
  assert.notEqual(legacy.world.countries.germany, world.countries.germany);
});

test("İç içe yardımcı emirleri tek makbuz/sıra kullanır ve önizleme kaynak tüketmez", () => {
  const world = createWorld("turkey");
  const before = structuredClone(world);
  const action: Action = { type: "autoPlan", area: "research" };
  assert.equal(previewAction(world, action).eligible, true);
  assert.deepEqual(world, before);
  const command = createCommand(world, action);
  const result = executeCommandInPlace(world, command, "turkey");
  assert.equal(result.status, "applied", result.message);
  assert.ok(world.countries.turkey.research.length > 0);
  assert.ok(world.countries.turkey.focus);
  assert.equal(world.commandState?.cursors.turkey, 1);
  assert.equal(world.commandState?.receipts.length, 1);
  assert.equal(world.commandState?.receipts[0].action.type, "autoPlan");
  assert.equal(
    executeCommandInPlace(world, command, "turkey").status,
    "duplicate",
  );
  assert.equal(createCommand(world, { type: "agency" }).commandId, "turkey:2");
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Başarısız iç işlem dış işlemin önceki yazmalarını korur, dış hata hepsini geri alır", () => {
  const world = bomberFixture();
  const before = structuredClone(world);
  const outer = transactWorldInPlace(world, (draft) => {
    draft.countries.turkey.treasury += 7;
    const failed = tryCountryActionInPlace(draft, "turkey", {
      type: "air",
      mission: "support",
      target: "uk",
    });
    assert.ok(failed.error);
    assert.equal(
      draft.countries.turkey.treasury,
      before.countries.turkey.treasury + 7,
    );
    assert.deepEqual(
      draft.countries.turkey.air.wings,
      before.countries.turkey.air.wings,
    );
    const good = tryCountryActionInPlace(draft, "turkey", {
      type: "commanderAutoAssign",
      enabled: false,
    });
    assert.equal(good.error, null);
    throw new Error("Outer transaction failed");
  });
  assert.match(outer.error!, /Outer transaction failed/);
  assert.deepEqual(world, before);
  assert.deepEqual(structuredClone(world), before);
});

test("Savunma hareketi düşük organizasyonla dost bölgeye çekilir, düşman toprağına geçmez", () => {
  const world = createWorld("turkey");
  const army = world.armies.find(
    (candidate) => candidate.country === "turkey",
  )!;
  army.province = "turkey-0";
  army.organization = 0;
  const defensive: Action = {
    type: "move",
    army: army.id,
    to: "turkey-1",
    stance: "hold",
  };
  const moved = executeCommandInPlace(
    world,
    createCommand(world, defensive),
    "turkey",
  );
  assert.equal(moved.status, "applied", moved.message);
  assert.equal(
    world.armies.find((candidate) => candidate.id === army.id)!.stance,
    "hold",
  );
  world.countries.turkey.wars.push("bulgaria");
  world.countries.bulgaria.wars.push("turkey");
  const border = Object.values(world.provinces).find(
    (province) =>
      province.controller === "turkey" &&
      GEOGRAPHY[province.id].neighbors.some(
        (edge) =>
          !edge.sea && world.provinces[edge.id].controller === "bulgaria",
      ),
  )!;
  world.armies.find((candidate) => candidate.id === army.id)!.province =
    border.id;
  const enemy = GEOGRAPHY[border.id].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === "bulgaria",
  )!.id;
  const before = structuredClone(world);
  const hostile: Action = {
    type: "move",
    army: army.id,
    to: enemy,
    stance: "hold",
  };
  const rejected = executeCommandInPlace(
    world,
    createCommand(world, hostile),
    "turkey",
  );
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.message, /dost toprak/);
  assert.deepEqual(world, before);
});

test("AI emir yağmuru oyuncunun son makbuzlarını silmez; bellek ve sıra doğrulaması korunur", () => {
  const world = createWorld("turkey");
  const command = createCommand(world, {
    type: "build",
    building: "civil",
    province: world.countries.turkey.capital,
  });
  assert.equal(
    executeCommandInPlace(world, command, "turkey").status,
    "applied",
  );
  const playerReceipt = structuredClone(world.commandState!.receipts[0]);
  for (let index = 0; index < 100; index++) {
    const issuer = ["germany", "france", "italy"][index % 3];
    const next = createCommand(
      world,
      { type: "commanderAutoAssign", enabled: false },
      issuer,
    );
    assert.equal(executeCommandInPlace(world, next, issuer).status, "applied");
  }
  assert.equal(world.commandState!.receipts.length, COMMAND_RECEIPT_LIMIT);
  assert.deepEqual(world.commandState!.receipts[0], playerReceipt);
  assert.ok(
    isValidCommandState(
      world.commandState,
      Object.keys(world.countries),
      world.day * 24,
    ),
  );
  assert.equal(
    executeCommandInPlace(world, command, "turkey").status,
    "duplicate",
  );
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});
