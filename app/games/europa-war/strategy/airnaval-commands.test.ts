import { test } from "node:test";
import assert from "node:assert/strict";
import { airNavalAction, quickNavalOrder } from "./airnaval";
import { transactWorldInPlace } from "./action-engine";
import { portZone } from "./military-assets";
import { controlled, createWorld, GEOGRAPHY } from "./world";

test("Toplu donanma emri tekil emirlerle aynı yakıt, liman ve intikal sonucunu verir", () => {
  for (const fuel of [0, 20, 100000]) {
    const world = createWorld("turkey");
    const country = world.countries.turkey;
    const ports = controlled(world, "turkey").filter(
      (p) => GEOGRAPHY[p.id].port,
    );
    assert.ok(ports.length >= 2);
    const original = country.navy.ships[0];
    country.navy.ships = Array.from({ length: 4 }, (_, index) => ({
      ...original,
      id: `naval-comparison-${index}`,
      port: ports[index % 2].id,
      zone: portZone(ports[index % 2].id),
      transit: index === 2 ? 3 : 0,
    }));
    country.stock.fuel = fuel;
    const expected = structuredClone(world);
    const coast = controlled(expected, "germany").find(
      (p) => GEOGRAPHY[p.id].port,
    )!;
    let expectedAssigned = 0;
    for (const ship of expected.countries.turkey.navy.ships) {
      try {
        airNavalAction(expected, expected.countries.turkey, {
          type: "ship",
          id: ship.id,
          zone: portZone(coast.id),
          mission: "patrol",
        });
        expectedAssigned++;
      } catch {
        // Transit and insufficient fuel reject this ship without spending.
      }
    }
    let actualAssigned = -1;
    const transaction = transactWorldInPlace(world, (draft) => {
      actualAssigned = quickNavalOrder(
        draft,
        draft.countries.turkey,
        "patrol",
        "germany",
      );
    });
    assert.equal(transaction.error, null);
    assert.equal(actualAssigned, expectedAssigned);
    assert.deepEqual(world, expected);
    for (const [index, ship] of world.countries.turkey.navy.ships.entries())
      assert.equal(ship.port, ports[index % 2].id);
  }
});

test("Aynı işlemde oluşturulan hava ve deniz araçlarına canlı kimlikleriyle emir verilir", () => {
  const world = createWorld("turkey");
  const port = controlled(world, "turkey").find(
    (p) => GEOGRAPHY[p.id].port,
  )!.id;
  const result = transactWorldInPlace(world, (draft) => {
    const country = draft.countries.turkey;
    country.equipment.fighter = 10;
    country.equipment.destroyer = 1;
    airNavalAction(draft, country, {
      type: "createWing",
      model: "fighter",
      count: 10,
      base: country.capital,
    });
    const wing = country.air.wings.at(-1)!;
    airNavalAction(draft, country, {
      type: "wing",
      id: wing.id,
      mission: "superiority",
      target: country.capital,
    });
    assert.equal(wing.mission, "superiority");
    airNavalAction(draft, country, {
      type: "commission",
      model: "destroyer",
      port,
    });
    const ship = country.navy.ships.at(-1)!;
    airNavalAction(draft, country, {
      type: "ship",
      id: ship.id,
      mission: "patrol",
      zone: portZone(port),
    });
    assert.equal(ship.mission, "patrol");
    assert.throws(() =>
      airNavalAction(draft, country, {
        type: "carrierAircraft",
        id: ship.id,
        count: 0,
      }),
    );
  });
  assert.equal(result.error, null);
  assert.equal(world.countries.turkey.air.wings.at(-1)!.mission, "superiority");
  assert.equal(world.countries.turkey.navy.ships.at(-1)!.mission, "patrol");
  assert.deepEqual(structuredClone(world), world);
});

test("Toplu filo emri liman listesini her gemi için bütün haritadan yeniden çıkarmaz", () => {
  const world = createWorld("turkey");
  const country = world.countries.turkey;
  const original = country.navy.ships[0];
  country.navy.ships = Array.from({ length: 24 }, (_, index) => ({
    ...original,
    id: `fleet-scan-${index}`,
    transit: 0,
  }));
  country.stock.fuel = 100000;
  let enumerations = 0;
  world.provinces = new Proxy(world.provinces, {
    ownKeys(target) {
      enumerations++;
      return Reflect.ownKeys(target);
    },
  });
  assert.equal(quickNavalOrder(world, country, "patrol", "turkey"), 24);
  // Once for the destination coast, once for eligible supply ports, independent of fleet size.
  assert.equal(enumerations, 2);
});
