import assert from "node:assert/strict";
import { test } from "node:test";
import { UNITS } from "./catalog";
import { declareWar } from "./diplomacy";
import { advanceHour, advanceHours, applyAction } from "./engine";
import { resolveLandStep } from "./land";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { World } from "./types";

const close = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `Expected ${actual} to equal ${expected}`,
  );

function campaign(country = "turkey") {
  const world = createWorld(country, "historical", 1936, "normal");
  world.hour = 23;
  world.armies = [];
  world.fronts = [];
  world.plans = [];
  world.trades = [];
  for (const c of Object.values(world.countries)) {
    c.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
      air: false,
      navy: false,
    };
    c.production = [];
    c.recruitment = [];
    c.research = [];
    c.focus = null;
    c.air.wings = [];
    c.navy.ships = [];
    c.autoAssignCommanders = false;
    for (const general of c.generals) delete general.front;
  }
  const c = world.countries[country];
  c.manpower = 100000;
  c.equipment.rifle = 1000;
  const army = addArmy(world, country, c.capital);
  army.general = null;
  army.strength = 80;
  return { world, armyId: army.id, country };
}

function army(world: World, id: string) {
  return world.armies.find((a) => a.id === id)!;
}

test("Midnight reserves actual replacements; loading and arrival never debit their stock twice", () => {
  const fixture = campaign();
  const initial = fixture.world;
  const initialStock = initial.countries.turkey.equipment.rifle;
  const initialMen = initial.countries.turkey.manpower;
  let world = advanceHour(initial);
  assert.equal(world.day, 1);
  assert.equal(world.hour, 0);
  const shipment = world.reinforcements!.shipments.find(
    (s) => s.army === fixture.armyId,
  )!;
  assert.ok(shipment);
  assert.ok(shipment.cargo.manpower > 0);
  assert.ok(shipment.cargo.equipment.rifle! > 0);
  assert.equal(army(world, fixture.armyId).strength, 80);
  close(
    world.countries.turkey.equipment.rifle,
    initialStock - shipment.cargo.equipment.rifle!,
  );
  close(world.countries.turkey.manpower, initialMen - shipment.cargo.manpower);
  const paid = structuredClone(shipment.cargo);
  for (let i = 0; i < 12 && world.reinforcements!.shipments.length; i++)
    world = advanceHour(world);
  assert.equal(world.reinforcements!.shipments.length, 0);
  close(
    army(world, fixture.armyId).strength,
    80 + (paid.manpower / UNITS.infantry.men) * 100,
  );
  close(world.countries.turkey.manpower, initialMen - paid.manpower);
  close(
    world.countries.turkey.equipment.rifle,
    initialStock - paid.equipment.rifle!,
  );
  assert.deepEqual(world.reinforcements!.ledger.turkey.delivered, paid);
  assert.equal(initial.hour, 23, "Advancing must not mutate the source world");
  assert.equal(initial.reinforcements, undefined);
  assert.ok(validateWorld(world));
});

test("Rifles reserved for an existing division cannot also pay for a new training command", () => {
  const fixture = campaign();
  fixture.world.countries.turkey.equipment.rifle =
    UNITS.infantry.equipment.rifle!;
  const originalOrder = applyAction(fixture.world, {
    type: "recruit",
    unit: "infantry",
    province: fixture.world.countries.turkey.capital,
  });
  assert.equal(
    originalOrder.error,
    null,
    "The original stock funds exactly one training order",
  );
  const dispatched = advanceHour(fixture.world);
  const before = structuredClone(dispatched);
  assert.ok(
    dispatched.countries.turkey.equipment.rifle <
      UNITS.infantry.equipment.rifle!,
  );
  const rejected = applyAction(dispatched, {
    type: "recruit",
    unit: "infantry",
    province: dispatched.countries.turkey.capital,
  });
  assert.ok(
    rejected.error,
    "Paid cargo must be absent from spendable equipment",
  );
  assert.deepEqual(rejected.world, before);
  assert.deepEqual(dispatched, before);
});

test("Actual land contact holds paid arriving cargo and prevents a second dispatch", () => {
  const fixture = campaign("germany");
  const border = "germany-7";
  fixture.world.countries.germany.capital = border;
  army(fixture.world, fixture.armyId).province = border;
  let world = advanceHour(fixture.world);
  const paid = structuredClone(world.reinforcements!.shipments[0].cargo);
  const stock = world.countries.germany.equipment.rifle;
  declareWar(world, "germany", "poland");
  const enemy = addArmy(world, "poland", "poland-2");
  enemy.move = { to: border, progress: 0, days: 100 };
  enemy.organization = enemy.morale = 100;
  const defenderBefore = army(world, fixture.armyId).strength;
  // The first hour loads the packet; the next hour attempts local delivery.
  world = advanceHours(world, 2);
  assert.ok(world.battles.some((battle) => battle.province === border));
  assert.ok(army(world, fixture.armyId).strength < defenderBefore);
  const held = world.reinforcements!.shipments.find(
    (s) => s.army === fixture.armyId,
  )!;
  assert.ok(held);
  assert.equal(held.blocked, "combat");
  assert.deepEqual(held.cargo, paid);
  assert.equal(world.reinforcements!.ledger.germany.delivered.manpower, 0);
  close(world.countries.germany.equipment.rifle, stock);
});

test("In-flight replacement cargo survives engine batches and mid-route save/load exactly", () => {
  const fixture = campaign();
  const capital = fixture.world.countries.turkey.capital;
  const first = GEOGRAPHY[capital].neighbors.find(
    (edge) =>
      !edge.sea && fixture.world.provinces[edge.id].controller === "turkey",
  )!.id;
  const second = GEOGRAPHY[first].neighbors.find(
    (edge) =>
      !edge.sea &&
      edge.id !== capital &&
      fixture.world.provinces[edge.id].controller === "turkey",
  )!.id;
  army(fixture.world, fixture.armyId).province = second;
  const dispatched = advanceHour(fixture.world);
  assert.ok(dispatched.reinforcements!.shipments[0].route.length);
  const batched = advanceHours(dispatched, 24);
  let single = dispatched;
  for (let hour = 0; hour < 24; hour++) single = advanceHour(single);
  assert.deepEqual(single, batched);
  const midRoute = advanceHour(dispatched);
  assert.ok(midRoute.reinforcements!.shipments.length);
  const loaded = decodeSave(encodeSave(midRoute));
  assert.deepEqual(advanceHours(loaded, 23), batched);
  assert.ok(validateWorld(batched));
  assert.ok(validateWorld(loaded));
});

test("The no-army land branch still settles orphaned paid cargo at its owned depot", () => {
  const fixture = campaign();
  const world = advanceHour(fixture.world);
  const paid = structuredClone(world.reinforcements!.shipments[0].cargo);
  const men = world.countries.turkey.manpower;
  const rifles = world.countries.turkey.equipment.rifle;
  world.armies = [];
  world.hour = 1;
  for (let i = 0; i < 12 && world.reinforcements!.shipments.length; i++)
    resolveLandStep(world, 1 / 24);
  assert.equal(world.armies.length, 0);
  assert.equal(world.reinforcements!.shipments.length, 0);
  assert.deepEqual(world.reinforcements!.ledger.turkey.returned, paid);
  close(world.countries.turkey.manpower, men + paid.manpower);
  close(world.countries.turkey.equipment.rifle, rifles + paid.equipment.rifle!);
  assert.ok(validateWorld(world));
});
