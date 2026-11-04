import assert from "node:assert/strict";
import { test } from "node:test";
import { AIRCRAFT } from "./advanced-catalog";
import { airNavalDay } from "./airnaval";
import { declareWar } from "./diplomacy";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { createWorld } from "./world";
import type { AirWing, Warship, World } from "./types";

function campaign() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  for (const c of Object.values(world.countries)) {
    c.air.wings = [];
    c.navy.ships = [];
    c.allies = [];
    c.wars = [];
    c.tech = [];
    c.stock.fuel = 1000;
    c.stock.steel = 100;
    for (const model of Object.keys(AIRCRAFT) as AirWing["model"][])
      c.equipment[model] = 0;
  }
  for (const p of Object.values(world.provinces)) {
    p.damage = 0;
    p.buildings.antiAir = p.buildings.radar = p.buildings.dock = 0;
  }
  for (const id of ["turkey-0", "turkey-1", "bulgaria-2"])
    world.provinces[id].buildings.airfield = 3;
  declareWar(world, "turkey", "bulgaria");
  return world;
}

function wing(
  world: World,
  country: "turkey" | "bulgaria",
  id: string,
  options: Partial<AirWing> = {},
) {
  const result: AirWing = {
    id,
    name: id,
    model: "strategicBomber",
    count: 100,
    size: 100,
    base: country === "turkey" ? "turkey-0" : "bulgaria-2",
    target: country === "turkey" ? "bulgaria-2" : "turkey-0",
    mission: "strategic",
    readiness: 100,
    experience: 0,
    ...options,
  };
  world.countries[country].air.wings.push(result);
  return result;
}

function ship(
  world: World,
  country: "turkey" | "bulgaria",
  id: string,
  options: Partial<Warship> = {},
) {
  const result: Warship = {
    id,
    name: id,
    model: "ship",
    health: 100,
    experience: 0,
    port: country === "turkey" ? "turkey-1" : "bulgaria-2",
    zone: "black",
    mission: "patrol",
    aircraft: 0,
    transit: 0,
    ...options,
  };
  world.countries[country].navy.ships.push(result);
  return result;
}

function report(world: World, country: string) {
  const result = world.airNavalReports?.find((r) => r.country === country);
  assert.ok(result, `Actual operations must produce a report for ${country}`);
  return result;
}

function canonical(world: World) {
  const result = structuredClone(world);
  for (const country of Object.values(result.countries)) {
    country.air.wings.sort((a, b) => a.id.localeCompare(b.id));
    country.navy.ships.sort((a, b) => a.id.localeCompare(b.id));
  }
  result.airNavalReports?.sort((a, b) => a.country.localeCompare(b.country));
  return result;
}

function permute(world: World) {
  const result = structuredClone(world);
  result.countries = Object.fromEntries(
    Object.entries(result.countries).reverse(),
  );
  for (const c of Object.values(result.countries)) {
    c.air.wings.reverse();
    c.navy.ships.reverse();
  }
  return result;
}

function close(actual: number, expected: number, message?: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    message ?? `${actual} != ${expected}`,
  );
}

test("Reciprocal airbase bombing uses the same pre-strike efficiency for both countries", () => {
  const first = campaign();
  wing(first, "turkey", "turkey-bomber");
  wing(first, "bulgaria", "bulgaria-bomber");
  assert.ok(validateWorld(first));
  const reversed = permute(first);
  airNavalDay(first);
  airNavalDay(reversed);
  assert.ok(first.provinces["turkey-0"].damage > 0);
  close(
    first.provinces["turkey-0"].damage,
    first.provinces["bulgaria-2"].damage,
  );
  assert.deepEqual(canonical(first), canonical(reversed));
  for (const country of ["turkey", "bulgaria"]) {
    assert.equal(report(first, country).air.flown, 100);
    assert.ok(report(first, country).air.fuelSpent > 0);
  }
  assert.ok(validateWorld(first));
});

test("Scarce fuel, replacement aircraft and repair stock allocation ignore asset array order", () => {
  const first = campaign();
  const c = first.countries.turkey;
  c.stock.fuel = 4;
  c.stock.steel = 0.5;
  c.equipment.fighter = 2;
  wing(first, "turkey", "fighter-a", {
    model: "fighter",
    mission: "superiority",
    target: "turkey-0",
    count: 98,
  });
  wing(first, "turkey", "fighter-b", {
    model: "fighter",
    mission: "superiority",
    target: "turkey-0",
  });
  ship(first, "turkey", "active-ship");
  ship(first, "turkey", "repair-a", { mission: "idle", health: 99.5 });
  ship(first, "turkey", "repair-b", { mission: "idle", health: 50 });
  first.provinces["turkey-1"].buildings.dock = 1;
  const reversed = permute(first);
  airNavalDay(first);
  airNavalDay(reversed);
  assert.deepEqual(canonical(first), canonical(reversed));
  const daily = report(first, "turkey");
  assert.equal(daily.air.reinforced, 2);
  assert.equal(first.countries.turkey.equipment.fighter, 0);
  assert.ok(first.countries.turkey.stock.fuel >= 0);
  close(
    daily.air.fuelSpent + daily.navy.fuelSpent,
    4 - first.countries.turkey.stock.fuel,
  );
  assert.ok(daily.air.fuelSpent + daily.navy.fuelSpent <= 4);
  close(daily.navy.repaired / 2, 0.5 - first.countries.turkey.stock.steel);
});

test("A fighter wing unaffordable after reinforcement creates no phantom interception", () => {
  const first = campaign();
  const c = first.countries.turkey;
  c.stock.fuel = 3.49;
  c.equipment.fighter = 2;
  wing(first, "turkey", "unfunded-fighters", {
    model: "fighter",
    mission: "superiority",
    target: "turkey-0",
    count: 98,
  });
  wing(first, "bulgaria", "funded-bombers");
  const withoutFighters = structuredClone(first);
  withoutFighters.countries.turkey.air.wings = [];
  airNavalDay(first);
  airNavalDay(withoutFighters);
  assert.equal(first.countries.turkey.air.wings[0].count, 100);
  assert.equal(first.countries.turkey.stock.fuel, 3.49);
  close(
    first.provinces["turkey-0"].damage,
    withoutFighters.provinces["turkey-0"].damage,
  );
  close(
    first.countries.bulgaria.air.wings[0].count,
    withoutFighters.countries.bulgaria.air.wings[0].count,
  );
  assert.equal(report(first, "turkey").air.flown, 0);
  assert.equal(report(first, "turkey").air.fuelSpent, 0);
});

test("Repair never reallocates a shrinking denominator into extra dock capacity or free steel", () => {
  for (const steel of [100, 0.1]) {
    const first = campaign();
    first.countries.turkey.stock.steel = steel;
    first.provinces["turkey-1"].buildings.dock = 1;
    ship(first, "turkey", "nearly-repaired", { mission: "idle", health: 99.5 });
    ship(first, "turkey", "badly-damaged", { mission: "idle", health: 50 });
    const reversed = permute(first);
    airNavalDay(first);
    airNavalDay(reversed);
    assert.deepEqual(canonical(first), canonical(reversed));
    const repair =
      first.countries.turkey.navy.ships.reduce((sum, s) => sum + s.health, 0) -
      149.5;
    assert.ok(repair > 0);
    assert.ok(repair <= Math.min(1.5, steel * 2) + 1e-9);
    close(steel - first.countries.turkey.stock.steel, repair / 2);
    close(report(first, "turkey").navy.repaired, repair);
  }
});

test("An aircraft-sunk carrier still makes its funded final naval exchange and loses its actual deck aircraft once", () => {
  const first = campaign();
  ship(first, "turkey", "fragile-carrier", {
    model: "carrier",
    health: 0.4,
    aircraft: 10,
  });
  ship(first, "bulgaria", "enemy-cruiser");
  wing(first, "bulgaria", "naval-strikers", {
    model: "bomber",
    mission: "naval",
    target: "turkey-1",
  });
  const reversed = permute(first);
  airNavalDay(first);
  airNavalDay(reversed);
  assert.deepEqual(canonical(first), canonical(reversed));
  assert.equal(first.countries.turkey.navy.ships.length, 0);
  assert.ok(
    first.countries.bulgaria.navy.ships[0].health < 100,
    "Simultaneous loss must not erase the carrier's valid final exchange",
  );
  const daily = report(first, "turkey").navy;
  assert.equal(daily.active, 1);
  assert.equal(daily.sunk, 1);
  close(daily.combatDamage, 0.4);
  assert.equal(daily.aircraftLost, 10);
  assert.equal(
    first.events.filter(
      (e) => e.text.includes("fragile-carrier") && e.text.includes("battı"),
    ).length,
    1,
  );
});

test("Several naval strikes and surface fire cap combined damage and report only one sinking", () => {
  const first = campaign();
  ship(first, "turkey", "victim", { health: 0.2 });
  ship(first, "bulgaria", "surface-attacker", { model: "battleship" });
  for (const id of ["strike-a", "strike-b"])
    wing(first, "bulgaria", id, {
      model: "bomber",
      mission: "naval",
      target: "turkey-1",
    });
  const reversed = permute(first);
  airNavalDay(first);
  airNavalDay(reversed);
  assert.deepEqual(canonical(first), canonical(reversed));
  assert.equal(first.countries.turkey.navy.ships.length, 0);
  close(report(first, "turkey").navy.combatDamage, 0.2);
  assert.equal(report(first, "turkey").navy.sunk, 1);
  assert.ok(report(first, "bulgaria").air.navalDamage > 0);
  assert.ok(report(first, "bulgaria").air.navalDamage <= 0.2);
  assert.equal(
    first.events.filter(
      (e) => e.text.includes("victim") && e.text.includes("battı"),
    ).length,
    1,
  );
});

test("A ship completing transit today cannot supply a same-day salvo or screening bonus", () => {
  const first = campaign();
  ship(first, "turkey", "arriving-destroyer", {
    model: "destroyer",
    transit: 1,
  });
  ship(first, "bulgaria", "patrolling-cruiser");
  airNavalDay(first);
  assert.equal(first.countries.turkey.navy.ships[0].transit, 0);
  assert.equal(first.countries.bulgaria.navy.ships[0].health, 100);
  assert.equal(
    first.airNavalReports?.find((r) => r.country === "turkey")?.navy.active ??
      0,
    0,
  );
  first.day++;
  airNavalDay(first);
  assert.ok(first.countries.bulgaria.navy.ships[0].health < 100);
  assert.equal(report(first, "turkey").navy.active, 1);
});

test("Idle, transiting and already sunk ships neither screen nor dilute the active fleet's damage", () => {
  const baseline = campaign();
  ship(baseline, "turkey", "turkish-patrol");
  ship(baseline, "bulgaria", "bulgarian-patrol");
  const withInactive = structuredClone(baseline);
  for (let i = 0; i < 20; i++)
    ship(withInactive, "bulgaria", `in-transit-${i}`, {
      model: "destroyer",
      transit: 1,
    });
  for (let i = 0; i < 10; i++)
    ship(withInactive, "bulgaria", `idle-${i}`, {
      model: "destroyer",
      mission: "idle",
    });
  ship(withInactive, "bulgaria", "already-sunk", { health: 0 });
  airNavalDay(baseline);
  airNavalDay(withInactive);
  for (const country of ["turkey", "bulgaria"]) {
    const id = baseline.countries[country].navy.ships[0].id;
    close(
      withInactive.countries[country].navy.ships.find((s) => s.id === id)!
        .health,
      baseline.countries[country].navy.ships[0].health,
    );
  }
  const daily = report(withInactive, "bulgaria").navy;
  assert.equal(daily.active, 1);
  assert.equal(daily.sunk, 0, "A preexisting wreck is not a new combat loss");
  assert.ok(
    !withInactive.countries.bulgaria.navy.ships.some(
      (s) => s.id === "already-sunk",
    ),
  );
});

test("A saved battle settlement resumes with the same stock, losses and latest daily report", () => {
  const first = campaign();
  wing(first, "turkey", "strategic-one");
  wing(first, "bulgaria", "interceptors", {
    model: "fighter",
    mission: "superiority",
    target: "bulgaria-2",
  });
  ship(first, "turkey", "patrol-one");
  ship(first, "bulgaria", "patrol-two");
  airNavalDay(first);
  const restored = decodeSave(encodeSave(first));
  assert.deepEqual(restored, first);
  first.day++;
  restored.day++;
  airNavalDay(first);
  airNavalDay(restored);
  assert.deepEqual(restored, first);
  assert.ok(first.airNavalReports!.every((r) => r.day === first.day));
  assert.equal(
    new Set(first.airNavalReports!.map((r) => r.country)).size,
    first.airNavalReports!.length,
  );
  assert.ok(validateWorld(first));
});
