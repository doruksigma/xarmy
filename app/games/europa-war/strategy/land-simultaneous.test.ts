import { test } from "node:test";
import assert from "node:assert/strict";
import { UNITS } from "./catalog";
import { declareWar } from "./diplomacy";
import {
  combatPower,
  LAND_COMBAT_TEMPO,
  resolveLandDay,
  resolveLandStep,
} from "./land";
import {
  addArmy,
  createWorld,
  GEOGRAPHY,
  localSupply,
  supplyNetwork,
} from "./world";
import type { World } from "./types";

function campaign() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  declareWar(world, "germany", "poland");
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.air.wings = [];
    country.tech = [];
    country.advisor = "science";
    country.casualties = 0;
  }
  for (const province of Object.values(world.provinces)) {
    province.buildings.infra = 10;
    province.buildings.rail = 10;
    province.buildings.hub = 5;
    province.buildings.fort = 0;
  }
  return world;
}

function normalized(world: World) {
  const copy = structuredClone(world);
  copy.armies.sort((left, right) => left.id.localeCompare(right.id));
  return copy;
}

for (const allied of [false, true])
  test(`Eşit güçte eşzamanlı şehir talepleri tamamlanır; ${allied ? "müttefik" : "düşman"} varışı son kontrole uyar`, () => {
    const world = campaign();
    const target = "poland-2";
    const germanOrigin = "germany-7";
    const frenchOrigin = GEOGRAPHY[target].neighbors.find(
      (edge) => !edge.sea && edge.id !== germanOrigin,
    )!.id;
    world.provinces[frenchOrigin].controller = "france";
    world.countries.france.capital = frenchOrigin;
    world.countries.germany.capital = germanOrigin;
    declareWar(world, "france", "poland");
    if (allied) {
      world.countries.germany.allies.push("france");
      world.countries.france.allies.push("germany");
    } else declareWar(world, "germany", "france");
    const german = addArmy(world, "germany", germanOrigin);
    const french = addArmy(world, "france", frenchOrigin);
    for (const army of world.armies) {
      army.general = null;
      army.strength = army.organization = army.morale = 100;
      army.supply = 1;
      army.move = { to: target, progress: 2, days: 2 };
    }
    assert.equal(
      combatPower(world, german, true, target),
      combatPower(world, french, true, target),
    );
    const reversed = structuredClone(world);
    reversed.armies.reverse();
    reversed.countries = Object.fromEntries(
      Object.entries(reversed.countries).reverse(),
    );
    resolveLandStep(world, 1 / 24);
    resolveLandStep(reversed, 1 / 24);
    assert.equal(world.provinces[target].controller, "france");
    assert.equal(french.province, target);
    assert.equal(german.province, allied ? target : germanOrigin);
    assert.equal(world.battles.length, 0);
    assert.deepEqual(normalized(world), normalized(reversed));
  });

test("Karşılıklı ölümcül saldırılar aynı başlangıçtan ateş eder; dizi ve ülke sırası sonucu değiştirmez", () => {
  const world = campaign();
  const attacker = addArmy(world, "germany", "germany-7");
  const defender = addArmy(world, "poland", "poland-2");
  for (const army of world.armies) {
    army.strength = 0.01;
    army.organization = army.morale = 100;
    army.general = null;
  }
  attacker.move = { to: defender.province, progress: 0, days: 100 };
  defender.move = { to: attacker.province, progress: 0, days: 100 };
  const reversed = structuredClone(world);
  reversed.armies.reverse();
  reversed.countries = Object.fromEntries(
    Object.entries(reversed.countries).reverse(),
  );
  resolveLandStep(world, 1 / 24);
  resolveLandStep(reversed, 1 / 24);
  assert.equal(world.armies.length, 0);
  assert.equal(world.battles.length, 2);
  assert.ok(
    world.battles.every((battle) => battle.attack > 0 && battle.defense > 0),
  );
  assert.equal(world.countries.germany.casualties, UNITS.infantry.men * 0.0001);
  assert.equal(world.countries.poland.casualties, UNITS.infantry.men * 0.0001);
  assert.deepEqual(normalized(world), normalized(reversed));
});

test("Birden fazla cephede savunan birlik bütün hasarı tek başlangıçtan alır", () => {
  const world = campaign();
  declareWar(world, "france", "poland");
  world.countries.germany.allies.push("france");
  world.countries.france.allies.push("germany");
  const german = addArmy(world, "germany", "germany-7");
  const french = addArmy(world, "france", "germany-7");
  const defender = addArmy(world, "poland", "poland-2");
  for (const army of world.armies) {
    army.organization = army.morale = 100;
    army.general = null;
    army.entrenchment = 0;
  }
  german.move = { to: defender.province, progress: 0, days: 100 };
  french.move = { to: defender.province, progress: 0, days: 100 };
  const reversed = structuredClone(world);
  reversed.armies.reverse();
  reversed.countries = Object.fromEntries(
    Object.entries(reversed.countries).reverse(),
  );
  resolveLandStep(world, 1 / 24);
  resolveLandStep(reversed, 1 / 24);
  assert.equal(world.battles.length, 2);
  assert.equal(world.battles[0].defense, world.battles[1].defense);
  const expectedLoss = world.battles.reduce(
    (sum, battle) =>
      sum +
      (Math.min(
        7,
        Math.max(0.15, (battle.attack / Math.max(1, battle.defense)) * 1.5),
      ) *
        LAND_COMBAT_TEMPO) /
        24,
    0,
  );
  assert.ok(Math.abs(defender.strength - (100 - expectedLoss)) < 1e-10);
  assert.deepEqual(normalized(world), normalized(reversed));
});

test("Saatlik kara adımı hareket, yakıt ve dinlenme oranlarını günün 24'te biri uygular", () => {
  const world = campaign();
  const army = addArmy(world, "germany", "germany-7", "lightTank");
  army.general = null;
  army.strength = 70;
  army.organization = army.morale = 50;
  army.move = { to: "germany-5", progress: 0, days: 100 };
  world.countries.germany.stock.fuel = 1000;
  // Timed replacement dispatch/delivery is covered through the actual engine
  // clock in reinforcement-engine.test.ts; this isolates continuous land rates.
  world.countries.germany.manpower = 0;
  for (const key of Object.keys(
    world.countries.germany.equipment,
  ) as (keyof typeof world.countries.germany.equipment)[])
    world.countries.germany.equipment[key] = 10000;
  const daily = structuredClone(world);
  resolveLandDay(daily);
  for (let hour = 0; hour < 24; hour++) resolveLandStep(world, 1 / 24);
  const expected = daily.armies[0],
    actual = world.armies[0];
  for (const field of [
    "strength",
    "organization",
    "morale",
    "entrenchment",
  ] as const)
    assert.ok(Math.abs(actual[field] - expected[field]) < 1e-8, field);
  assert.ok(Math.abs(actual.move!.progress - expected.move!.progress) < 1e-8);
  assert.ok(
    Math.abs(
      world.countries.germany.stock.fuel - daily.countries.germany.stock.fuel,
    ) < 1e-8,
  );
  assert.ok(
    Math.abs(
      world.countries.germany.manpower - daily.countries.germany.manpower,
    ) < 1e-8,
  );
});

test("Saatlik küçük kayıplar yuvarlanarak yok olmaz ve savaş tecrübesi süreyle ölçeklenir", () => {
  const world = campaign();
  const attacker = addArmy(world, "germany", "germany-7");
  const defender = addArmy(world, "poland", "poland-2");
  const general = world.countries.germany.generals[0];
  attacker.general = general.id;
  general.xp = 0;
  attacker.experience = 0;
  attacker.organization = defender.organization = 100;
  attacker.move = { to: defender.province, progress: 0, days: 100 };
  world.hour = 7;
  resolveLandStep(world, 1 / 24);
  assert.ok(world.countries.germany.casualties > 0);
  assert.equal(attacker.experience, 0.3 / 24);
  assert.equal(general.xp, 0.5 / 24);
  assert.equal(world.battles[0].started, world.day + 7 / 24);
});

test("Aynı adımda biten dost yürüyüşü daha önce çözülen cepheye erken savunma ateşi vermez", () => {
  const world = campaign();
  const attacker = addArmy(world, "germany", "germany-7");
  const defender = addArmy(world, "poland", "poland-2");
  const rear = GEOGRAPHY[defender.province].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === "poland",
  )!.id;
  const arriving = addArmy(world, "poland", rear);
  attacker.move = { to: defender.province, progress: 0, days: 100 };
  arriving.move = { to: defender.province, progress: 2, days: 2 };
  const reversed = structuredClone(world);
  reversed.armies.reverse();
  resolveLandStep(world, 1 / 24);
  resolveLandStep(reversed, 1 / 24);
  assert.equal(arriving.strength, 100);
  assert.equal(arriving.province, defender.province);
  assert.deepEqual(normalized(world), normalized(reversed));
});

test("Sıfır süreli adım hiçbir durumu değiştirmez; geçersiz süre reddedilir", () => {
  const world = campaign();
  const before = structuredClone(world);
  resolveLandStep(world, 0);
  assert.deepEqual(world, before);
  assert.throws(() => resolveLandStep(world, -1));
  assert.throws(() => resolveLandStep(world, Number.NaN));
});

test("Yeni başlayan geçerli yürüyüş ilk saatte yakıt tüketir, geçersiz rota tüketmez", () => {
  const world = campaign();
  const army = addArmy(world, "germany", "germany-7", "lightTank");
  army.route = ["germany-5"];
  army.move = null;
  const initial = world.countries.germany.stock.fuel;
  const invalid = structuredClone(world);
  invalid.armies[0].route = ["turkey-0"];
  resolveLandStep(world, 1 / 24);
  resolveLandStep(invalid, 1 / 24);
  assert.ok(world.armies[0].move!.progress > 0);
  assert.ok(
    Math.abs(
      world.countries.germany.stock.fuel -
        (initial - UNITS.lightTank.fuel / 24),
    ) < 1e-10,
  );
  assert.equal(invalid.countries.germany.stock.fuel, initial);
  assert.equal(invalid.armies[0].move, null);
});

test("Kesirli saat kayıpları ve hastane dönüşü kaybolmaz; yıpranma tecrübe vermez", () => {
  const world = campaign();
  const army = addArmy(world, "germany", "germany-7");
  army.strength = 0.0001;
  army.support = ["hospital"];
  army.experience = 0;
  world.provinces[world.countries.germany.capital].controller = "poland";
  const manpower = world.countries.germany.manpower;
  resolveLandStep(world, 1 / 24);
  assert.ok(
    Math.abs(
      world.countries.germany.casualties - UNITS.infantry.men * 0.000001,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      world.countries.germany.manpower -
        manpower -
        UNITS.infantry.men * 0.000001 * 0.2,
    ) < 1e-8,
  );
  assert.equal(army.experience, 0);
  assert.equal(world.armies.length, 0);
});

test("Önceden sayılan dost yığını yerel ikmalin mevcut hesabıyla aynıdır", () => {
  const world = campaign();
  world.countries.germany.allies.push("france");
  world.countries.france.allies.push("germany");
  for (let index = 0; index < 10; index++)
    addArmy(world, index % 2 ? "france" : "germany", "germany-7");
  addArmy(world, "poland", "germany-7");
  const network = supplyNetwork(world, "germany");
  assert.equal(
    localSupply(world, "germany", "germany-7", network, 10),
    localSupply(world, "germany", "germany-7", network),
  );
});
