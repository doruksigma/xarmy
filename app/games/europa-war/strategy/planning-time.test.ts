import assert from "node:assert/strict";
import { test } from "node:test";
import { declareWar } from "./diplomacy";
import { combatPower } from "./land";
import { planningDay, planningStep } from "./planning";
import { addArmy, createWorld, GEOGRAPHY } from "./world";

function plannedWorld(active = false) {
  const world = createWorld("germany");
  declareWar(world, "germany", "poland");
  world.armies = [];
  addArmy(world, "germany", "germany-7");
  addArmy(world, "germany", "germany-7", "lightTank");
  world.plans.push({
    id: "hourly-plan",
    country: "germany",
    name: "Sınır harekâtı",
    armies: world.armies.map((army) => army.id),
    objectives: ["poland-2"],
    preparation: 50,
    active,
    stance: "balanced",
  });
  return world;
}

for (const planner of [false, true])
  test(`24 saatlik plan hazırlığı günlük miktarı korur${planner ? " (planlamacı kabine)" : ""}`, () => {
    const hourly = plannedWorld();
    if (planner) hourly.countries.germany.cabinet.military = "planner";
    hourly.armies[0].supply = 0.5;
    hourly.armies[1].organization = 60;
    const daily = structuredClone(hourly);
    planningDay(daily);
    for (let hour = 0; hour < 24; hour++) planningStep(hourly, 1 / 24);
    assert.ok(
      Math.abs(hourly.plans[0].preparation - daily.plans[0].preparation) < 1e-9,
    );
    assert.ok(hourly.plans[0].preparation > 50);
    assert.ok(hourly.armies.every((army) => !army.move && !army.route.length));
  });

test("Saatlik aktif plan hazırlık tüketimini hızlandırmaz, yürüyüşü sıfırlamaz", () => {
  const hourly = plannedWorld(true);
  for (const army of hourly.armies) {
    army.move = { to: "poland-2", progress: 0.75, days: 4 };
    army.route = ["poland-0"];
  }
  const daily = structuredClone(hourly),
    beforeArmies = structuredClone(hourly.armies);
  planningDay(daily);
  for (let hour = 0; hour < 24; hour++) planningStep(hourly, 1 / 24);
  assert.ok(Math.abs(hourly.plans[0].preparation - 49.7) < 1e-9);
  assert.ok(
    Math.abs(hourly.plans[0].preparation - daily.plans[0].preparation) < 1e-9,
  );
  assert.deepEqual(hourly.armies, beforeArmies);
});

test("Saatlik plan alınan şehrin ardından yeni hedefe emir verir ve rota dizilerini paylaşmaz", () => {
  const world = plannedWorld(true),
    firstTarget = "poland-2",
    nextTarget = GEOGRAPHY[firstTarget].neighbors.find(
      (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
    )!.id;
  world.plans[0].objectives.push(nextTarget);
  planningStep(world, 1 / 24);
  assert.ok(world.armies.every((army) => army.route[0] === firstTarget));
  assert.notEqual(world.armies[0].route, world.armies[1].route);
  world.provinces[firstTarget].controller = "germany";
  for (const army of world.armies) {
    army.province = firstTarget;
    army.move = null;
    army.route = [];
  }
  planningStep(world, 1 / 24);
  assert.ok(world.armies.every((army) => army.route[0] === nextTarget));
  assert.notEqual(world.armies[0].route, world.armies[1].route);
  assert.equal(world.plans[0].active, true);
  world.provinces[nextTarget].controller = "germany";
  const issued = structuredClone(world.armies);
  planningStep(world, 1 / 24);
  assert.equal(world.plans[0].active, false);
  assert.deepEqual(
    world.armies,
    issued,
    "Hedef alınırken mevcut yürüyüş korunur",
  );
});

test("Sıfır veya geçersiz zaman adımı plan hazırlığını ve emirleri değiştirmez", () => {
  const world = plannedWorld(true),
    before = structuredClone(world);
  for (const elapsed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    planningStep(world, elapsed);
  assert.deepEqual(world, before);
});

test("Saatlik plan hazırlığı 100 sınırında, tüketim 0 sınırında kalır", () => {
  const world = plannedWorld();
  world.plans[0].preparation = 99.99;
  planningStep(world, 1 / 24);
  assert.equal(world.plans[0].preparation, 100);
  world.plans[0].active = true;
  world.plans[0].preparation = 0.001;
  planningStep(world, 1 / 24);
  assert.equal(world.plans[0].preparation, 0);
});

test("Başka hedefe gönderilen tümen ortak saldırı hesabından çıkarılır; sonraki saatte yeni emir görülür", () => {
  const world = plannedWorld(true);
  world.armies = [];
  const first = addArmy(world, "germany", "germany-8"),
    diverted = addArmy(world, "germany", "germany-7", "heavyTank"),
    waiting = addArmy(world, "germany", "germany-8"),
    target = "poland-2";
  world.plans[0].armies = [first.id, diverted.id, waiting.id];
  world.plans[0].objectives = ["poland-city-4"];
  // Keep this attack-support regression on two explicit corridors. Weighted
  // routing may otherwise prefer a different friendly approach to the front.
  const corridor = new Set([
    "germany-8",
    "germany-7",
    "poland-1",
    target,
    "poland-city-4",
  ]);
  for (const province of Object.values(world.provinces))
    if (!corridor.has(province.id)) province.controller = "france";
  world.countries.germany.capital = first.province;
  const damagedRear = world.provinces[diverted.province];
  damagedRear.buildings.infra =
    damagedRear.buildings.rail =
    damagedRear.buildings.hub =
      0;
  damagedRear.damage = 100;
  const defenders = Array.from({ length: 8 }, () =>
    addArmy(world, "poland", target),
  );
  // The line is viable only if the heavy division supports this target.
  const targetDefense =
      (combatPower(world, first, true, target) +
        combatPower(world, waiting, true, target) +
        combatPower(world, diverted, true, target) / 2) /
      0.95,
    fullDefense = defenders.reduce(
      (sum, army) => sum + combatPower(world, army, false, target),
      0,
    );
  assert.ok(targetDefense > 0 && targetDefense < fullDefense);
  for (const defender of defenders)
    defender.strength = (100 * targetDefense) / fullDefense;
  planningStep(world, 1 / 24);
  assert.deepEqual(first.route, [target]);
  assert.deepEqual(diverted.route, ["poland-1"]);
  assert.deepEqual(
    waiting.route,
    [],
    "Başka cepheye giden tank destek sayılmamalı",
  );
  diverted.route = [target];
  planningStep(world, 1 / 24);
  assert.deepEqual(
    waiting.route,
    [target],
    "Yeni destek emri eski önbelleğe takılmamalı",
  );
});
