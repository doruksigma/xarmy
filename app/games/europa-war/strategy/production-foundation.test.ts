import { createCommand, executeCommandInPlace } from "./commands";
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "./engine";
import { EQUIPMENT } from "./catalog";
import { manage } from "./management";
import { startCivilWar } from "./politics";
import { applyProduction, productionPlan } from "./production";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { createWorld, GEOGRAPHY } from "./world";
import type { Equipment, Resource } from "./types";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

function factoryWorld(military = 2, docks = 1) {
  const world = createWorld("turkey");
  const country = world.countries.turkey;
  country.production = [];
  country.advisor = "army";
  country.cabinet.economy = "builder";
  country.economy = "civilian";
  country.tech = [];
  for (const resource of Object.keys(country.stock) as Resource[])
    country.stock[resource] = 1000;
  for (const equipment of Object.keys(country.equipment) as Equipment[])
    country.equipment[equipment] = 0;
  const provinces = Object.values(world.provinces).filter(
    (province) => province.controller === country.id,
  );
  for (const province of provinces) {
    province.damage = 0;
    province.buildings.military = 0;
    province.buildings.dock = 0;
  }
  world.provinces[country.capital].buildings.military = military;
  const port = provinces.find((province) => GEOGRAPHY[province.id].port)!;
  port.buildings.dock = docks;
  return { world, country };
}

test("Üretim tahmini durumu değiştirmez; tam ekipman ve kaynakla ödenmiş kalan iş aynı planı izler", () => {
  const { world, country } = factoryWorld();
  country.production = [
    { equipment: "artillery", factories: 2, efficiency: 0.8 },
  ];
  const before = JSON.stringify(world);
  const [plan] = productionPlan(world, country);
  assert.equal(JSON.stringify(world), before);
  near(plan.work, 4.8);
  assert.equal(plan.completed, 1);
  near(plan.progress, 1.8);
  near(plan.inputs.steel!, 2.4);
  applyProduction(world, country);
  assert.equal(country.equipment.artillery, 1);
  near(country.production[0].progress!, 1.8);
  near(country.stock.steel, 997.6);
  applyProduction(world, country);
  assert.equal(country.equipment.artillery, 3);
  near(country.production[0].progress!, 0.612);
  // Completed items plus the retained work account for every consumed input.
  near(
    1000 - country.stock.steel,
    (country.equipment.artillery + country.production[0].progress! / 3) * 1.5,
  );
});

test("Önceden ödenmiş üretim ilerlemesi tamamlanırken kaynak ikinci kez tüketilmez", () => {
  const { world, country } = factoryWorld(1);
  country.production = [
    { equipment: "artillery", factories: 1, efficiency: 0.2, progress: 2.4 },
  ];
  country.stock.steel = 0.3;
  applyProduction(world, country);
  assert.equal(country.equipment.artillery, 1);
  near(country.production[0].progress!, 0);
  near(country.stock.steel, 0);
});

test("Askerî fabrikalar ve tersaneler kendi ortak kapasitesini hat önceliğine göre paylaşır", () => {
  const { world, country } = factoryWorld(3, 2);
  country.production = [
    { equipment: "rifle", factories: 2, efficiency: 0.5 },
    { equipment: "artillery", factories: 2, efficiency: 0.5 },
    { equipment: "destroyer", factories: 3, efficiency: 0.5 },
  ];
  const plan = productionPlan(world, country);
  assert.deepEqual(
    plan.map((line) => line.allocatedFactories),
    [2, 2, 3],
  );
  assert.deepEqual(
    plan.map((line) => line.activeFactories),
    [2, 1, 2],
  );
  near(plan[0].work, 3);
  near(plan[1].work, 1.5);
  near(plan[2].work, 3);
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 3);
  assert.equal(country.equipment.artillery, 0);
  assert.equal(country.equipment.destroyer, 0);
  near(country.production[1].progress!, 1.5);
  near(country.production[2].progress!, 3);
});

test("Kıt çelik iki hatta yeniden harcanmaz; yeni ekipman tamamlanmadan depoya girmez", () => {
  const { world, country } = factoryWorld(4);
  country.production = [
    { equipment: "rifle", factories: 2, efficiency: 1 },
    { equipment: "artillery", factories: 2, efficiency: 1 },
  ];
  country.stock.steel = 0.4;
  const plan = productionPlan(world, country);
  near(plan[0].work, 0.8);
  near(plan[1].work, 0);
  assert.equal(plan[1].blocked, "resources");
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 0);
  assert.equal(country.equipment.artillery, 0);
  near(country.production[0].progress!, 0.8);
  near(country.stock.steel, 0);
});

test("Fabrika kaybı ücretli yarım ürünü silmez veya fabrikasız tamamlamaz", () => {
  const { world, country } = factoryWorld(0);
  country.production = [
    { equipment: "rifle", factories: 1, efficiency: 0.2, progress: 0.9 },
  ];
  const beforeSteel = country.stock.steel;
  assert.equal(productionPlan(world, country)[0].blocked, "capacity");
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 0);
  near(country.production[0].progress!, 0.9);
  near(country.stock.steel, beforeSteel);
  world.provinces[country.capital].buildings.military = 1;
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 1);
  near(country.production[0].progress!, 0.5);
});

test("Yuvarlama toleransı duraklatılmış veya fabrikasız hattı kendiliğinden tamamlamaz", () => {
  for (const factories of [0, 1]) {
    const { world, country } = factoryWorld(0);
    const progress = 1 - 5e-10;
    country.production = [
      { equipment: "rifle", factories, efficiency: 0.2, progress },
    ];
    assert.ok(validateWorld(world));
    applyProduction(world, country);
    assert.equal(country.equipment.rifle, 0);
    assert.equal(country.production[0].progress, progress);
    assert.equal(country.stock.steel, 1000);
  }
});

test("Dolu depoda yeni üretim kaynak tüketmez; son tam ürün kapasitesi aşılmaz", () => {
  const { world, country } = factoryWorld(2);
  country.production = [
    { equipment: "rifle", factories: 2, efficiency: 1, progress: 0.8 },
  ];
  country.equipment.rifle = 99999;
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 100000);
  near(country.production[0].progress!, 0);
  near(country.stock.steel, 999.9);
  assert.equal(productionPlan(world, country)[0].blocked, "storage");
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 100000);
  near(country.stock.steel, 999.9);
  // Legacy fractional stocks cannot fit a newly completed whole item.
  country.equipment.rifle = 99999.5;
  country.production[0].progress = 0.4;
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 99999.5);
  near(country.production[0].progress!, 0.4);
  near(country.stock.steel, 999.9);
});

test("Fabrika tahsisini sıfırlamak ücretli işi duraklatır; yeniden tahsis aynı işten devam eder", () => {
  const initial = factoryWorld(2);
  let world = initial.world;
  initial.country.production = [
    { equipment: "rifle", factories: 1, efficiency: 0.3, progress: 0.7 },
  ];
  const paused = applyAction(world, {
    type: "production",
    equipment: "rifle",
    factories: 0,
  });
  assert.equal(paused.error, null);
  world = paused.world;
  let country = world.countries.turkey;
  assert.equal(country.production.length, 1);
  assert.equal(country.production[0].factories, 0);
  assert.equal(productionPlan(world, country)[0].blocked, "paused");
  applyProduction(world, country);
  near(country.production[0].progress!, 0.7);
  near(country.stock.steel, 1000);
  const resumed = applyAction(world, {
    type: "production",
    equipment: "rifle",
    factories: 1,
  });
  assert.equal(resumed.error, null);
  world = resumed.world;
  country = world.countries.turkey;
  near(country.production[0].progress!, 0.7);
  near(country.production[0].efficiency, 0.3);
  applyProduction(world, country);
  assert.equal(country.equipment.rifle, 1);
  near(country.production[0].progress!, 0.6);
});

test("Yapay zekâ yeni tahsislerinde aynı modelin ilerlemesini ve devre dışı ürünün ücretli işini korur", () => {
  const { world } = factoryWorld(2, 0);
  let country = world.countries.turkey;
  country.production = [
    { equipment: "rifle", factories: 1, efficiency: 0.6, progress: 0.4 },
    { equipment: "heavyTank", factories: 1, efficiency: 0.4, progress: 2.5 },
  ];
  manage(
    world,
    country,
    "economy",
    (action) =>
      executeCommandInPlace(
        world,
        createCommand(world, action, country.id),
        country.id,
      ).status !== "rejected",
  );
  country = world.countries.turkey;
  const rifle = country.production.find((line) => line.equipment === "rifle")!;
  const tank = country.production.find(
    (line) => line.equipment === "heavyTank",
  )!;
  assert.ok(rifle.factories > 0);
  near(rifle.progress!, 0.4);
  near(rifle.efficiency, 0.6);
  assert.equal(tank.factories, 0);
  near(tank.progress!, 2.5);
  near(tank.efficiency, 0.4);
  assert.ok(validateWorld(world));
});

test("Üretimin ortasında kayıt/yükleme aynı sonraki ekipmanı, işi ve kaynakları üretir", () => {
  const { world, country } = factoryWorld(3, 1);
  country.production = [
    { equipment: "artillery", factories: 2, efficiency: 0.3 },
    { equipment: "rifle", factories: 1, efficiency: 0.2 },
    { equipment: "destroyer", factories: 1, efficiency: 0.4 },
  ];
  for (let day = 0; day < 5; day++) applyProduction(world, country);
  assert.ok(validateWorld(world));
  const loaded = decodeSave(encodeSave(world));
  assert.deepEqual(loaded, world);
  for (let day = 0; day < 20; day++) {
    applyProduction(world, country);
    applyProduction(loaded, loaded.countries.turkey);
  }
  assert.deepEqual(loaded, world);
  assert.ok(validateWorld(world));
});

test("Eski kaydın kesirli deposu eksiltilmez; sonraki üretim yalnız tam adet ekler", () => {
  const { world, country } = factoryWorld(2);
  country.production = [{ equipment: "rifle", factories: 2, efficiency: 0.5 }];
  country.equipment.rifle = 13.375;
  const loaded = decodeSave(encodeSave(world));
  const legacyCountry = loaded.countries.turkey;
  assert.equal(legacyCountry.equipment.rifle, 13.375);
  assert.equal(legacyCountry.production[0].progress, undefined);
  applyProduction(loaded, legacyCountry);
  assert.equal(legacyCountry.equipment.rifle, 16.375);
  assert.ok(validateWorld(loaded));
});

test("İç savaş ücretli üretim ilerlemesini kopyalamaz; iki tarafın toplam işi ve stokları korunur", () => {
  const world = createWorld("spain", "alternative");
  const country = world.countries.spain;
  country.production = [
    { equipment: "rifle", factories: 2, efficiency: 0.5, progress: 0.8 },
    { equipment: "artillery", factories: 1, efficiency: 0.3, progress: 2.5 },
  ];
  const oldProgress = country.production.map((line) => line.progress!);
  const oldStock = { ...country.stock };
  const oldEquipment = { ...country.equipment };
  startCivilWar(world, country.id, true);
  const rebels = world.countries["spain-rebels"];
  assert.ok(rebels);
  for (let index = 0; index < oldProgress.length; index++) {
    near(country.production[index].progress!, oldProgress[index] * 0.6);
    near(rebels.production[index].progress!, oldProgress[index] * 0.4);
    near(
      country.production[index].progress! + rebels.production[index].progress!,
      oldProgress[index],
    );
  }
  for (const resource of Object.keys(oldStock) as Resource[])
    near(country.stock[resource] + rebels.stock[resource], oldStock[resource]);
  for (const equipment of Object.keys(oldEquipment) as Equipment[])
    near(
      country.equipment[equipment] + rebels.equipment[equipment],
      oldEquipment[equipment],
    );
  assert.ok(validateWorld(world));
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Kayıt doğrulaması geçersiz üretim kalıntısını ve kesirli fabrika tahsisini reddeder", () => {
  for (const progress of [-1, NaN, Infinity, EQUIPMENT.artillery.cost, 900]) {
    const { world, country } = factoryWorld();
    country.production = [
      { equipment: "artillery", factories: 1, efficiency: 0.2, progress },
    ];
    assert.equal(validateWorld(world), false, `progress=${progress}`);
    assert.throws(() => decodeSave(encodeSave(world)));
  }
  const { world, country } = factoryWorld();
  country.production = [
    { equipment: "artillery", factories: 0.5, efficiency: 0.2 },
  ];
  assert.equal(validateWorld(world), false);
});
