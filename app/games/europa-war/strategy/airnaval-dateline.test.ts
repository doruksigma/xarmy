import assert from "node:assert/strict";
import { test } from "node:test";
import {
  airNavalDay,
  airSupport,
  regionalAirPower,
  wingEfficiency,
} from "./airnaval";
import { declareWar } from "./diplomacy";
import { applyAction } from "./engine";
import { mapDeltaX, mapDistance } from "./geography-distance";
import { combatPower } from "./land";
import { createWorld, GEOGRAPHY, MAP } from "./world";
import type { AirMission, AirModel, World } from "./types";

/** Synthetic seam coordinates exercise the rules independently of map artwork.
 * Restore shared geometry even when an assertion fails; tests are synchronous. */
function atDateline(run: (width: number) => void) {
  const width = MAP.width;
  const ids = ["uk-0", "germany-0", "germany-1", "poland-2"];
  const original = ids.map((id) => ({
    id,
    x: GEOGRAPHY[id].x,
    y: GEOGRAPHY[id].y,
  }));
  MAP.width = Math.max(6_000, width);
  try {
    Object.assign(GEOGRAPHY["uk-0"], { x: 20, y: 400 });
    Object.assign(GEOGRAPHY["germany-0"], { x: MAP.width - 30, y: 400 });
    Object.assign(GEOGRAPHY["germany-1"], { x: MAP.width - 20, y: 400 });
    Object.assign(GEOGRAPHY["poland-2"], { x: MAP.width / 2, y: 400 });
    run(MAP.width);
  } finally {
    MAP.width = width;
    for (const point of original)
      Object.assign(GEOGRAPHY[point.id], { x: point.x, y: point.y });
  }
}

function airWorld() {
  const world = createWorld("uk", "historical", 1936, "normal");
  for (const country of Object.values(world.countries)) {
    country.air.wings = [];
    country.navy.ships = [];
    country.stock.fuel = 1_000;
  }
  declareWar(world, "uk", "germany");
  declareWar(world, "uk", "poland");
  world.provinces["uk-0"].buildings.airfield = 2;
  world.provinces["uk-0"].damage = 0;
  return world;
}

function wingAtSeam(
  world: World,
  model: AirModel,
  mission: AirMission,
  target = "germany-1",
) {
  world.countries.uk.equipment[model] = 20;
  const created = applyAction(world, {
    type: "createWing",
    model,
    base: "uk-0",
    count: 20,
  });
  assert.equal(created.error, null);
  world = created.world;
  const id = world.countries.uk.air.wings.at(-1)!.id;
  const ordered = applyAction(world, { type: "wing", id, target, mission });
  assert.equal(
    ordered.error,
    null,
    "A nearby target across the world seam must be reachable",
  );
  world = ordered.world;
  world.countries.uk.air.wings.find((wing) => wing.id === id)!.readiness = 100;
  return world;
}

test("Global distance chooses the short dateline path in both directions and keeps latitude distance", () => {
  atDateline((width) => {
    assert.equal(mapDeltaX(20, width - 20), -40);
    assert.equal(mapDeltaX(width - 20, 20), 40);
    assert.equal(mapDeltaX(200, 450), 250);
    assert.equal(mapDistance({ x: 20, y: 40 }, { x: width - 20, y: 70 }), 50);
    assert.equal(
      mapDistance({ x: 20, y: 40 }, { x: width - 20, y: 540 }),
      Math.hypot(40, 500),
    );
  });
});

test("Regional European maps do not gain an artificial left-to-right flight shortcut", () => {
  const original = MAP.width;
  try {
    MAP.width = 1320;
    assert.equal(mapDeltaX(20, 1300), 1280);
    assert.equal(mapDistance({ x: 20, y: 40 }, { x: 1300, y: 40 }), 1280);
  } finally {
    MAP.width = original;
  }
});

test("Manual fighter orders across the dateline produce operational local air superiority", () => {
  atDateline(() => {
    const world = wingAtSeam(airWorld(), "fighter", "superiority");
    const wing = world.countries.uk.air.wings[0];
    assert.ok(wingEfficiency(world, world.countries.uk, wing) > 0);
    assert.ok(regionalAirPower(world, "uk", "germany-1") > 0);
    const before = world.countries.uk.stock.fuel;
    airNavalDay(world);
    assert.ok(world.countries.uk.stock.fuel < before);
    assert.ok(wing.experience > 0);
  });
});

test("Manual bomber orders across the dateline apply actual enemy province damage", () => {
  atDateline(() => {
    const world = wingAtSeam(airWorld(), "bomber", "strategic");
    world.provinces["germany-1"].damage = 0;
    airNavalDay(world);
    assert.ok(world.provinces["germany-1"].damage > 0);
    assert.ok(world.countries.uk.stock.fuel < 1_000);
  });
});

test("A nearby mission area across the seam contributes to actual ground combat power", () => {
  atDateline(() => {
    const base = airWorld();
    const unsupported = structuredClone(base);
    // The mission marker stays at our base; the enemy battle is forty units
    // across the seam. Both coverage-radius and flight-range checks must wrap.
    const world = wingAtSeam(base, "bomber", "support", "uk-0");
    assert.ok(regionalAirPower(world, "uk", "germany-1", "support") > 0);
    assert.ok(airSupport(world, "uk", "germany-1") > 0);
    const attacker = world.armies.find((army) => army.country === "uk")!;
    const before = unsupported.armies.find((army) => army.id === attacker.id)!;
    assert.ok(
      combatPower(world, attacker, true, "germany-1") >
        combatPower(unsupported, before, true, "germany-1"),
    );
  });
});

test("Dateline wrapping still rejects middle-of-world targets without changing orders or fuel", () => {
  atDateline(() => {
    const world = wingAtSeam(airWorld(), "fighter", "superiority");
    const before = structuredClone(world);
    const result = applyAction(world, {
      type: "wing",
      id: world.countries.uk.air.wings[0].id,
      mission: "superiority",
      target: "poland-2",
    });
    assert.match(result.error!, /menzil/);
    assert.deepEqual(world, before);
    assert.deepEqual(result.world, before);
  });
});

test("Coverage across the dateline cannot extend a fighter's true flight range", () => {
  atDateline((width) => {
    GEOGRAPHY["germany-1"].x = width - 140;
    GEOGRAPHY["germany-0"].x = width - 300;
    const world = wingAtSeam(airWorld(), "fighter", "superiority");
    assert.ok(regionalAirPower(world, "uk", "germany-1") > 0);
    assert.equal(
      mapDistance(GEOGRAPHY["germany-1"], GEOGRAPHY["germany-0"]),
      160,
    );
    assert.equal(regionalAirPower(world, "uk", "germany-0"), 0);
  });
});
