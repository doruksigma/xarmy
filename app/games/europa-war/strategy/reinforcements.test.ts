import assert from "node:assert/strict";
import { test } from "node:test";
import { UNITS } from "./catalog";
import { PRODUCTION_BALANCE } from "./economy-balance";
import {
  reinforcementCargoWeight,
  reinforcementNodeCapacity,
  reinforcementEdgeCapacity,
  reinforcementRoute,
  reserveReinforcements,
  resolveReinforcements,
} from "./reinforcements";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { Equipment, World } from "./types";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function setup(remote = false) {
  const w = createWorld("germany");
  w.armies = [];
  const c = w.countries.germany;
  c.manpower = 10000;
  c.equipment.rifle = 1000;
  c.autoAssignCommanders = false;
  const neighbor = GEOGRAPHY[c.capital].neighbors.find(
    (edge) => !edge.sea && w.provinces[edge.id].controller === c.id,
  )!.id;
  const army = addArmy(w, c.id, remote ? neighbor : c.capital);
  army.strength = 80;
  army.supply = 1;
  return { w, c, army, neighbor };
}
function eligible(w: World) {
  return new Set(w.armies.map((a) => a.id));
}
function tick(w: World, hours = 1, recipients = eligible(w)) {
  // Direct resolver tests isolate the transport step from new daily batches.
  // Engine tests independently exercise the actual advancing campaign clock.
  w.hour = 1;
  for (let i = 0; i < hours; i++) resolveReinforcements(w, recipients);
}
function balanced(w: World) {
  for (const [country, ledger] of Object.entries(w.reinforcements!.ledger)) {
    const shipments = w.reinforcements!.shipments.filter(
      (s) => s.country === country,
    );
    close(
      ledger.dispatched.manpower,
      ledger.delivered.manpower +
        ledger.returned.manpower +
        ledger.lost.manpower +
        shipments.reduce((sum, s) => sum + s.cargo.manpower, 0),
    );
    for (const equipment of Object.keys(
      w.countries[country].equipment,
    ) as Equipment[])
      close(
        ledger.dispatched.equipment[equipment] ?? 0,
        (ledger.delivered.equipment[equipment] ?? 0) +
          (ledger.returned.equipment[equipment] ?? 0) +
          (ledger.lost.equipment[equipment] ?? 0) +
          shipments.reduce(
            (sum, s) => sum + (s.cargo.equipment[equipment] ?? 0),
            0,
          ),
      );
  }
}

test("replacement freight follows the Marmara land corridor instead of the false Istanbul–Bursa sea shortcut", () => {
  const w = createWorld("turkey");
  const route = reinforcementRoute(w, "turkey", "turkey-1", "turkey-3");
  assert.deepEqual(route, ["turkey-city-13", "turkey-3"]);
  assert.equal(reinforcementEdgeCapacity(w, "turkey-1", "turkey-3"), 0);
});

test("paid cargo is reserved once, loads before delivery and cannot spend the same stock twice", () => {
  const { w, c, army } = setup();
  const other = addArmy(w, c.id, c.capital);
  other.strength = 80;
  c.equipment.rifle = UNITS.infantry.equipment.rifle! * 0.004;
  const men = c.manpower;
  reserveReinforcements(w, eligible(w));
  assert.equal(w.reinforcements!.shipments.length, 1);
  const paid = structuredClone(w.reinforcements!.shipments[0].cargo);
  close(c.manpower, men - paid.manpower);
  close(c.equipment.rifle, 0);
  assert.equal(army.strength, 80);
  reserveReinforcements(w, eligible(w));
  assert.equal(w.reinforcements!.shipments.length, 1);
  tick(w);
  assert.equal(army.strength, 80);
  tick(w);
  close(army.strength, 80.4);
  close(c.manpower, men - paid.manpower);
  close(c.equipment.rifle, 0);
  assert.equal(other.strength, 80);
  balanced(w);
});

test("scarce depot stock goes to the same recipient after army and country list reordering", () => {
  const { w, c } = setup();
  const second = addArmy(w, c.id, c.capital);
  second.strength = 80;
  c.equipment.rifle = UNITS.infantry.equipment.rifle! * 0.004;
  const reversed = structuredClone(w);
  reversed.armies.reverse();
  reversed.countries = Object.fromEntries(
    Object.entries(reversed.countries).reverse(),
  );
  reserveReinforcements(w, eligible(w));
  reserveReinforcements(reversed, eligible(reversed));
  assert.deepEqual(w.reinforcements, reversed.reinforcements);
  assert.equal(
    w.countries.germany.equipment.rifle,
    reversed.countries.germany.equipment.rifle,
  );
  assert.equal(
    w.countries.germany.manpower,
    reversed.countries.germany.manpower,
  );
});

test("local loading and travelling cargo share the same physical node budget", () => {
  const { w, c, army, neighbor } = setup(true);
  const local = addArmy(w, c.id, c.capital);
  local.strength = 80;
  reserveReinforcements(w, eligible(w));
  const moving = w.reinforcements!.shipments.find((s) => s.army === army.id)!;
  const loading = w.reinforcements!.shipments.find((s) => s.army === local.id)!;
  moving.loadingHours = 0;
  moving.leg = { to: neighbor, hours: 2, progress: 0 };
  for (const id of [c.capital, neighbor]) {
    Object.assign(w.provinces[id].buildings, { infra: 0, rail: 0, hub: 0 });
    w.provinces[id].damage = 50;
  }
  const capacity = reinforcementNodeCapacity(w, c.capital);
  tick(w);
  const moved =
    (moving.leg!.progress / moving.leg!.hours) *
    reinforcementCargoWeight(moving.cargo);
  const loaded =
    (1 - loading.loadingHours) * reinforcementCargoWeight(loading.cargo);
  assert.ok(moved > 0 && loaded > 0);
  close(moved + loaded, capacity);
  assert.ok(moved <= reinforcementEdgeCapacity(w, c.capital, neighbor) + 1e-10);
  assert.equal(moving.blocked, "capacity");
  assert.equal(loading.blocked, "capacity");
  balanced(w);
});

test("a fully damaged local depot cannot bypass handling capacity", () => {
  const { w, c, army } = setup();
  reserveReinforcements(w, eligible(w));
  w.provinces[c.capital].damage = 100;
  tick(w, 3);
  assert.equal(army.strength, 80);
  assert.equal(w.reinforcements!.shipments[0].loadingHours, 1);
  assert.equal(w.reinforcements!.shipments[0].blocked, "capacity");
  w.provinces[c.capital].damage = 0;
  tick(w, 2);
  close(army.strength, 80.4);
  balanced(w);
});

test("opposite allied shipments share one edge and allocation is independent of list order", () => {
  const { w, c, neighbor } = setup(true);
  const ally = w.countries.france;
  c.allies = [ally.id];
  ally.allies = [c.id];
  ally.capital = neighbor;
  w.provinces[neighbor].controller = ally.id;
  ally.manpower = 10000;
  ally.equipment.rifle = 1000;
  const other = addArmy(w, ally.id, c.capital);
  other.strength = 80;
  other.supply = 1;
  reserveReinforcements(w, eligible(w));
  assert.equal(w.reinforcements!.shipments.length, 2);
  for (const s of w.reinforcements!.shipments) {
    s.loadingHours = 0;
    s.leg = { to: s.route[0], hours: 2, progress: 0 };
  }
  for (const id of [c.capital, neighbor]) {
    Object.assign(w.provinces[id].buildings, { infra: 0, rail: 0, hub: 0 });
    w.provinces[id].damage = 50;
  }
  const reversed = structuredClone(w);
  reversed.armies.reverse();
  reversed.reinforcements!.shipments.reverse();
  reversed.countries = Object.fromEntries(
    Object.entries(reversed.countries).reverse(),
  );
  tick(w);
  tick(reversed);
  const progress = w.reinforcements!.shipments.reduce(
    (sum, s) =>
      sum +
      (s.leg!.progress / s.leg!.hours) * reinforcementCargoWeight(s.cargo),
    0,
  );
  close(progress, reinforcementEdgeCapacity(w, c.capital, neighbor));
  const byId = (world: World) =>
    [...world.reinforcements!.shipments].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  assert.deepEqual(byId(w), byId(reversed));
  balanced(w);
});

test("a severed route holds the same cargo and resumes after access returns", () => {
  const { w, c, army } = setup(true);
  reserveReinforcements(w, eligible(w));
  const paid = structuredClone(w.reinforcements!.shipments[0].cargo);
  const original = GEOGRAPHY[c.capital].neighbors.map(
    (edge) => [edge.id, w.provinces[edge.id].controller] as const,
  );
  for (const [id] of original) w.provinces[id].controller = "poland";
  tick(w, 3);
  assert.equal(w.reinforcements!.shipments[0].blocked, "route");
  assert.deepEqual(w.reinforcements!.shipments[0].cargo, paid);
  assert.equal(army.strength, 80);
  for (const [id, controller] of original)
    w.provinces[id].controller = controller;
  tick(w, 20);
  close(army.strength, 80.4);
  assert.equal(w.reinforcements!.shipments.length, 0);
  balanced(w);
});

test("cargo follows a moving target rather than giving strength at the abandoned destination", () => {
  const { w, c, army, neighbor } = setup(true);
  reserveReinforcements(w, eligible(w));
  tick(w, 2);
  const shipment = w.reinforcements!.shipments[0];
  assert.ok(shipment.leg);
  army.province = c.capital;
  for (let i = 0; i < 20 && shipment.province !== neighbor; i++) tick(w);
  assert.equal(shipment.province, neighbor);
  assert.equal(army.strength, 80);
  tick(w, 20);
  close(army.strength, 80.4);
  balanced(w);
});

for (const change of ["dead", "defected", "support"] as const)
  test(`a ${change} target returns its paid composition without transferring free strength`, () => {
    const { w, c, army, neighbor } = setup(true);
    reserveReinforcements(w, eligible(w));
    const shipment = w.reinforcements!.shipments[0];
    const paid = structuredClone(shipment.cargo);
    // This packet already reached a real friendly node before the change.
    shipment.province = neighbor;
    shipment.loadingHours = 0;
    shipment.route = [];
    const stock = c.equipment.rifle;
    if (change === "dead") w.armies = [];
    if (change === "defected") army.country = "france";
    if (change === "support") army.support = ["artillery"];
    tick(w);
    assert.equal(shipment.status, "returning");
    assert.equal(
      c.equipment.rifle,
      stock,
      "Distant cargo cannot teleport into the depot",
    );
    tick(w, 20);
    close(c.equipment.rifle, stock + paid.equipment.rifle!);
    assert.equal(army.strength, 80);
    assert.deepEqual(w.reinforcements!.ledger.germany.returned, paid);
    balanced(w);
  });

test("partial strength delivery returns only the unused paid remainder", () => {
  const { w, c, army } = setup();
  reserveReinforcements(w, eligible(w));
  const paid = structuredClone(w.reinforcements!.shipments[0].cargo);
  const stock = c.equipment.rifle;
  army.strength = 99.9;
  tick(w, 2);
  close(army.strength, 100);
  assert.equal(w.reinforcements!.shipments[0].status, "returning");
  close(
    w.reinforcements!.ledger.germany.delivered.manpower,
    UNITS.infantry.men * 0.001,
  );
  tick(w);
  close(c.equipment.rifle - stock, paid.equipment.rifle! * 0.75);
  balanced(w);
});

test("returning cargo waits for depot room and never overflows the stock clamp", () => {
  const { w, c } = setup();
  reserveReinforcements(w, eligible(w));
  const paid = structuredClone(w.reinforcements!.shipments[0].cargo);
  w.armies = [];
  c.equipment.rifle = PRODUCTION_BALANCE.equipmentStockLimit;
  tick(w, 3);
  assert.equal(w.reinforcements!.shipments[0].blocked, "depot");
  assert.deepEqual(w.reinforcements!.shipments[0].cargo, paid);
  c.equipment.rifle -= paid.equipment.rifle! / 2;
  tick(w);
  close(c.equipment.rifle, PRODUCTION_BALANCE.equipmentStockLimit);
  close(w.reinforcements!.shipments[0].cargo.manpower, paid.manpower / 2);
  c.equipment.rifle -= 1;
  tick(w);
  assert.equal(w.reinforcements!.shipments.length, 0);
  close(w.reinforcements!.ledger.germany.returned.manpower, paid.manpower);
  balanced(w);
});

test("a returning packet cannot unload in an ally-controlled capital", () => {
  const { w, c } = setup();
  reserveReinforcements(w, eligible(w));
  const shipment = w.reinforcements!.shipments[0];
  shipment.loadingHours = 0;
  w.armies = [];
  c.allies = ["france"];
  w.provinces[c.capital].controller = "france";
  const stock = c.equipment.rifle;
  tick(w);
  assert.equal(c.equipment.rifle, stock);
  assert.equal(shipment.blocked, "depot");
  w.provinces[c.capital].controller = c.id;
  tick(w);
  assert.equal(w.reinforcements!.shipments.length, 0);
  balanced(w);
});

test("captured cargo is lost once and its people are recorded as casualties", () => {
  const { w, c } = setup();
  reserveReinforcements(w, eligible(w));
  const paid = structuredClone(w.reinforcements!.shipments[0].cargo);
  const casualties = c.casualties;
  c.wars = ["poland"];
  w.provinces[c.capital].controller = "poland";
  tick(w, 3);
  assert.equal(w.reinforcements!.shipments.length, 0);
  assert.deepEqual(w.reinforcements!.ledger.germany.lost, paid);
  close(c.casualties, casualties + paid.manpower);
  balanced(w);
});

test("low supply and battle waiting are distinct and neither invents delivery", () => {
  const { w, army } = setup();
  reserveReinforcements(w, eligible(w));
  tick(w);
  army.supply = 0.1;
  tick(w, 1, new Set());
  assert.equal(w.reinforcements!.shipments[0].blocked, "supply");
  army.supply = 1;
  tick(w, 1, new Set());
  assert.equal(w.reinforcements!.shipments[0].blocked, "combat");
  assert.equal(army.strength, 80);
  tick(w);
  close(army.strength, 80.4);
  balanced(w);
});
