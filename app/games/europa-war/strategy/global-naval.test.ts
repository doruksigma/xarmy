import assert from "node:assert/strict";
import { test } from "node:test";
import { SEA_ZONES } from "./advanced-catalog";
import { applyAction } from "./engine";
import { portZone, seaRoute } from "./military-assets";
import { decodeSave, encodeSave } from "./storage";
import { createWorld, MAP } from "./world";
import type { SeaZone } from "./types";

test("Every global sea basin has reciprocal connections and a route through open world seas", () => {
  const world = createWorld("turkey");
  const zones = Object.keys(SEA_ZONES) as SeaZone[];
  assert.equal(zones.length, 11);
  for (const zone of zones) {
    const basin = SEA_ZONES[zone];
    assert.ok(
      basin.x > 0 && basin.x < MAP.width && basin.y > 0 && basin.y < MAP.height,
      zone,
    );
    for (const neighbor of basin.neighbors)
      assert.ok(
        SEA_ZONES[neighbor].neighbors.includes(zone),
        `${zone} -> ${neighbor}`,
      );
    for (const target of zones)
      assert.ok(
        seaRoute(world, "turkey", zone, target),
        `${zone} -> ${target}`,
      );
  }
});

test("World atlas assigns opposite American and Russian ocean coasts to their actual basins", () => {
  const ports = MAP.provinces.filter((province) => province.port);
  for (const province of ports)
    assert.ok(Object.hasOwn(SEA_ZONES, portZone(province.id)), province.id);
  const usa = ports.filter((province) => province.country === "usa");
  assert.ok(
    usa.some((province) => portZone(province.id) === "northPacific"),
    "USA Pacific port",
  );
  assert.ok(
    usa.some(
      (province) =>
        portZone(province.id) === "atlantic" ||
        portZone(province.id) === "caribbean",
    ),
    "USA Atlantic/Gulf port",
  );
  const soviet = ports.filter((province) => province.country === "ussr");
  assert.ok(
    soviet.some((province) => portZone(province.id) === "northPacific"),
    "Vladivostok must not be an Atlantic port",
  );
  assert.ok(soviet.some((province) => portZone(province.id) === "baltic"));
});

for (const { gate, from, to } of [
  { gate: "egypt-2", from: "mediterranean", to: "indian" },
  { gate: "usa-global-panama-canal", from: "caribbean", to: "northPacific" },
] as { gate: string; from: SeaZone; to: SeaZone }[])
  test(`A hostile ${gate} closes only the canal shortcut; the cape route remains usable`, () => {
    const world = createWorld("turkey");
    assert.ok(world.provinces[gate], "Global canal province must exist");
    assert.deepEqual(seaRoute(world, "turkey", from, to), [from, to]);
    world.provinces[gate].controller = "germany";
    world.countries.turkey.wars.push("germany");
    world.countries.germany.wars.push("turkey");
    const route = seaRoute(world, "turkey", from, to);
    assert.ok(route && route.length > 2);
    world.provinces[gate].controller = "turkey";
    assert.deepEqual(seaRoute(world, "turkey", from, to), [from, to]);
  });

test("Global fleet orders consume transit fuel, take time and survive save/load", () => {
  let world = createWorld("uk");
  const ship = world.countries.uk.navy.ships.find((ship) => !ship.transit)!;
  assert.ok(ship);
  world.countries.uk.stock.fuel = 1000;
  const result = applyAction(world, {
    type: "ship",
    id: ship.id,
    mission: "patrol",
    zone: "northPacific",
  });
  assert.equal(result.error, null);
  world = result.world;
  const moved = world.countries.uk.navy.ships.find(
    (item) => item.id === ship.id,
  )!;
  assert.equal(moved.zone, "northPacific");
  assert.ok(moved.transit > 0);
  assert.ok(world.countries.uk.stock.fuel < 1000);
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});
