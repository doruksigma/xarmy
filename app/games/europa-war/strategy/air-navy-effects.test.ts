import assert from "node:assert/strict";
import { test } from "node:test";
import { airNavalDay, airSupport, regionalAirPower } from "./airnaval";
import { createCommand, executeCommand } from "./commands";
import { declareWar } from "./diplomacy";
import { economyDay } from "./economy";
import { combatPower, resolveLandStep } from "./land";
import { seaControl } from "./military-assets";
import { tradeRoute } from "./trade-routes";
import { capacity, createWorld } from "./world";
import type { Action, AirMission, AirModel, ShipModel, World } from "./types";

function campaign(player = "uk") {
  const world = createWorld(player, "historical", 1936, "normal");
  for (const country of Object.values(world.countries)) {
    country.air.wings = [];
    country.navy.ships = [];
    country.stock.fuel = 1_000;
  }
  return world;
}

function order(world: World, issuer: string, action: Action) {
  const result = executeCommand(
    world,
    createCommand(world, action, issuer),
    issuer,
  );
  assert.equal(result.status, "applied", result.message);
  return result.world;
}

function deployWing(
  world: World,
  country: string,
  model: AirModel,
  base: string,
  target: string,
  mission: AirMission,
  count = 40,
) {
  world.countries[country].equipment[model] = count;
  world = order(world, country, { type: "createWing", model, base, count });
  assert.equal(
    world.countries[country].equipment[model],
    0,
    "Deployed aircraft must leave reserve stock",
  );
  const id = world.countries[country].air.wings.at(-1)!.id;
  world = order(world, country, { type: "wing", id, mission, target });
  // Isolate mission mechanics from the independent daily readiness recovery.
  world.countries[country].air.wings.find((wing) => wing.id === id)!.readiness =
    100;
  return { world, id };
}

function deployShip(
  world: World,
  country: string,
  model: ShipModel,
  port: string,
  mission: "raid" | "escort" | "patrol",
) {
  world.countries[country].equipment[model] = 1;
  world = order(world, country, { type: "commission", model, port });
  assert.equal(world.countries[country].equipment[model], 0);
  const id = world.countries[country].navy.ships.at(-1)!.id;
  world = order(world, country, { type: "ship", id, mission, zone: "north" });
  assert.equal(world.countries[country].navy.ships.at(-1)!.transit, 0);
  return { world, id };
}

test("Manually ordered close air support changes actual ground power and enemy casualties", () => {
  let world = campaign("germany");
  declareWar(world, "germany", "poland");
  const attacker = world.armies.find((army) => army.country === "germany")!;
  const defender = world.armies.find((army) => army.country === "poland")!;
  attacker.province = "germany-7";
  defender.province = "poland-2";
  attacker.general = defender.general = null;
  attacker.move = { to: defender.province, progress: 0, days: 100 };
  const unsupported = structuredClone(world);
  ({ world } = deployWing(
    world,
    "germany",
    "bomber",
    "germany-0",
    "poland-2",
    "support",
  ));
  const power = combatPower(unsupported, attacker, true, "poland-2");
  assert.ok(
    combatPower(
      world,
      world.armies.find((a) => a.id === attacker.id)!,
      true,
      "poland-2",
    ) > power,
  );
  assert.ok(airSupport(world, "germany", "poland-2") > 0);
  resolveLandStep(unsupported, 1 / 24);
  resolveLandStep(world, 1 / 24);
  assert.ok(
    world.armies.find((a) => a.id === defender.id)!.strength <
      unsupported.armies.find((a) => a.id === defender.id)!.strength,
  );
});

test("Idle, unready and unfuelled aircraft cannot give a manual ground-support bonus", () => {
  let world = campaign("germany");
  declareWar(world, "germany", "poland");
  const deployment = deployWing(
    world,
    "germany",
    "bomber",
    "germany-0",
    "poland-2",
    "support",
  );
  world = deployment.world;
  const id = deployment.id;
  assert.ok(airSupport(world, "germany", "poland-2") > 0);
  const dry = structuredClone(world);
  dry.countries.germany.stock.fuel = 0;
  assert.equal(airSupport(dry, "germany", "poland-2"), 0);
  const unready = structuredClone(world);
  unready.countries.germany.air.wings[0].readiness = 0;
  assert.equal(airSupport(unready, "germany", "poland-2"), 0);
  world = order(world, "germany", {
    type: "wing",
    id,
    mission: "idle",
    target: "germany-0",
  });
  assert.equal(airSupport(world, "germany", "poland-2"), 0);
});

test("Manual strategic bombing damages real factories; fighter protection lowers both damage and surviving bombers", () => {
  let world = campaign();
  declareWar(world, "uk", "germany");
  world.provinces["germany-1"].damage = 0;
  world.provinces["germany-1"].buildings.military = 5;
  world.provinces["germany-1"].buildings.antiAir = 0;
  ({ world } = deployWing(
    world,
    "uk",
    "bomber",
    "uk-0",
    "germany-1",
    "strategic",
  ));
  const withoutInterception = structuredClone(world);
  const beforeCapacity = capacity(world, "germany", "military");
  ({ world } = deployWing(
    world,
    "germany",
    "fighter",
    "germany-0",
    "germany-1",
    "superiority",
    80,
  ));
  assert.ok(regionalAirPower(world, "germany", "germany-1") > 0);
  airNavalDay(withoutInterception);
  airNavalDay(world);
  assert.ok(world.provinces["germany-1"].damage > 0);
  assert.ok(
    world.provinces["germany-1"].damage <
      withoutInterception.provinces["germany-1"].damage,
  );
  assert.ok(capacity(world, "germany", "military") < beforeCapacity);
  assert.ok(
    world.countries.uk.air.wings[0].count <
      withoutInterception.countries.uk.air.wings[0].count,
  );
  assert.ok(world.countries.uk.stock.fuel < 1_000);
});

test("Manual submarine raids reduce real import delivery and escorts restore part of it", () => {
  let world = campaign();
  declareWar(world, "uk", "germany");
  world.countries.norway.stock.oil = 1_000;
  world.countries.uk.stock.oil = 0;
  world.countries.uk.treasury = 1_000;
  world = order(world, "uk", {
    type: "trade",
    target: "norway",
    resource: "oil",
    amount: 20,
  });
  const baseline = structuredClone(world);
  assert.ok(tradeRoute(world, "norway", "uk")!.seas.includes("north"));
  for (let i = 0; i < 4; i++)
    ({ world } = deployShip(
      world,
      "germany",
      "submarine",
      "germany-1",
      "raid",
    ));
  const raided = structuredClone(world);
  const raidedDelivery = tradeRoute(raided, "norway", "uk")!.delivery;
  assert.ok(raidedDelivery < 1);
  for (let i = 0; i < 3; i++)
    ({ world } = deployShip(world, "uk", "destroyer", "uk-0", "escort"));
  const escortedDelivery = tradeRoute(world, "norway", "uk")!.delivery;
  assert.ok(escortedDelivery > raidedDelivery);
  assert.ok(escortedDelivery < 1);
  assert.ok(
    seaControl(world, "uk", "north") > seaControl(raided, "uk", "north"),
  );
  economyDay(baseline);
  economyDay(raided);
  economyDay(world);
  assert.ok(raided.countries.uk.stock.oil < world.countries.uk.stock.oil);
  assert.ok(world.countries.uk.stock.oil < baseline.countries.uk.stock.oil);
});

test("Manual surface patrols cause real mutual ship damage and require fuel", () => {
  let world = campaign();
  declareWar(world, "uk", "germany");
  ({ world } = deployShip(world, "uk", "ship", "uk-0", "patrol"));
  ({ world } = deployShip(world, "germany", "ship", "germany-1", "patrol"));
  const dry = structuredClone(world);
  dry.countries.uk.stock.fuel = dry.countries.germany.stock.fuel = 0;
  assert.equal(seaControl(dry, "uk", "north"), 0);
  airNavalDay(dry);
  assert.equal(dry.countries.uk.navy.ships[0].health, 100);
  assert.equal(dry.countries.germany.navy.ships[0].health, 100);
  airNavalDay(world);
  assert.ok(world.countries.uk.navy.ships[0].health < 100);
  assert.ok(world.countries.germany.navy.ships[0].health < 100);
  assert.ok(world.countries.uk.stock.fuel < 1_000);
  assert.ok(world.countries.germany.stock.fuel < 1_000);
});
