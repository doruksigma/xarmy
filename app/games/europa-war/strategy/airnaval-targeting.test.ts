import assert from "node:assert/strict";
import { test } from "node:test";
import { airNavalDay, regionalAirPower, wingEfficiency } from "./airnaval";
import { applyAction } from "./engine";
import { AIRCRAFT } from "./advanced-catalog";
import { createWorld, GEOGRAPHY } from "./world";
import type { AirWing, Warship, World } from "./types";

const distance = (a: string, b: string) =>
  Math.hypot(GEOGRAPHY[a].x - GEOGRAPHY[b].x, GEOGRAPHY[a].y - GEOGRAPHY[b].y);

function emptyAirSeaWorld(): World {
  const world = createWorld("uk");
  for (const c of Object.values(world.countries)) {
    c.air.wings = [];
    c.navy.ships = [];
    c.stock.fuel = 0;
  }
  world.countries.uk.wars = ["germany"];
  world.countries.germany.wars = ["uk"];
  world.countries.uk.stock.fuel = 1000;
  return world;
}

function bomber(world: World, mission: AirWing["mission"], target: string) {
  const wing: AirWing = {
    id: "targeting-bomber",
    name: "Deniz hava grubu",
    model: "bomber",
    count: 20,
    size: 20,
    base: "uk-0",
    target,
    mission,
    readiness: 100,
    experience: 0,
  };
  world.countries.uk.air.wings.push(wing);
  return wing;
}

function cruiser(id: string, port: string, zone: Warship["zone"]): Warship {
  return {
    id,
    name: id,
    model: "ship",
    health: 100,
    experience: 0,
    port,
    zone,
    mission: "patrol",
    aircraft: 0,
    transit: 0,
  };
}

test("Bölgesel hava etkisi görev merkezinin ötesinde gerçek uçak menzilini aşamaz", () => {
  const world = createWorld("germany"),
    c = world.countries.germany,
    wing = c.air.wings.find((a) => a.model === "fighter")!;
  c.wars = ["poland", "ussr"];
  world.countries.poland.wars = [c.id];
  world.countries.ussr.wars = [c.id];
  c.stock.fuel = 1000;
  c.tech = c.tech.filter((id) => id !== "aviation3");
  c.air.wings = [wing];
  wing.mission = "superiority";
  wing.target = "poland-0";
  const outside = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === "ussr" &&
      distance(wing.target, p.id) < 180 &&
      distance(wing.base, p.id) > AIRCRAFT.fighter.range &&
      distance(wing.base, p.id) <= AIRCRAFT.fighter.range * 1.2,
  )!;
  assert.ok(outside);
  assert.ok(regionalAirPower(world, c.id, wing.target) > 0);
  assert.equal(regionalAirPower(world, c.id, outside.id), 0);
  c.tech.push("aviation3");
  assert.ok(regionalAirPower(world, c.id, outside.id) > 0);
});

test("İç kara eyaletine deniz saldırısı emri atomik olarak reddedilir", () => {
  const world = emptyAirSeaWorld(),
    wing = bomber(world, "idle", "uk-0"),
    before = structuredClone(world);
  assert.equal(GEOGRAPHY["germany-0"].port, false);
  assert.ok(distance(wing.base, "germany-0") < AIRCRAFT.bomber.range);
  const result = applyAction(world, {
    type: "wing",
    id: wing.id,
    mission: "naval",
    target: "germany-0",
  });
  assert.match(result.error!, /limanı/);
  assert.deepEqual(result.world, before);
  assert.deepEqual(world, before);
});

test("Gerçek limana deniz saldırısı yalnız hedef ülkedeki aynı denizin gemilerini vurur", () => {
  let world = emptyAirSeaWorld();
  const wing = bomber(world, "idle", "uk-0");
  world.countries.germany.navy.ships = [
    cruiser("enemy-north", "germany-1", "north"),
    cruiser("enemy-atlantic", "germany-1", "atlantic"),
  ];
  world.countries.uk.navy.ships = [cruiser("own", "uk-0", "north")];
  world.countries.uk.navy.ships[0].mission = "idle";
  world.countries.france.navy.ships = [cruiser("neutral", "france-1", "north")];
  const result = applyAction(world, {
    type: "wing",
    id: wing.id,
    mission: "naval",
    target: "germany-1",
  });
  assert.equal(result.error, null);
  world = result.world;
  airNavalDay(world);
  assert.ok(world.countries.germany.navy.ships[0].health < 100);
  assert.equal(world.countries.germany.navy.ships[1].health, 100);
  assert.equal(world.countries.uk.navy.ships[0].health, 100);
  assert.equal(world.countries.france.navy.ships[0].health, 100);
  assert.ok(world.countries.uk.stock.fuel < 1000);
});

test("Eski kayıttaki iç kara deniz görevi hayali Atlantik saldırısı veya yakıt kaybı yaratmaz", () => {
  const world = emptyAirSeaWorld(),
    wing = bomber(world, "naval", "germany-0");
  world.countries.germany.navy.ships = [
    cruiser("enemy", "germany-1", "atlantic"),
  ];
  assert.equal(wingEfficiency(world, world.countries.uk, wing), 0);
  airNavalDay(world);
  assert.equal(wing.mission, "idle");
  assert.equal(wing.experience, 0);
  assert.equal(world.countries.uk.stock.fuel, 1000);
  assert.equal(world.countries.germany.navy.ships[0].health, 100);
});

test("Ele geçirilen saldırı hedefi sonraki hesapta dost ateşi veya boş sorti üretmez", () => {
  for (const mission of ["strategic", "naval"] as const) {
    const world = emptyAirSeaWorld(),
      wing = bomber(world, mission, "germany-1"),
      target = world.provinces[wing.target];
    target.controller = "uk";
    target.damage = 0;
    world.countries.germany.navy.ships = [
      cruiser("enemy", "germany-1", "north"),
    ];
    // The captured port can no longer supply this enemy ship; a separate
    // German Baltic home keeps ordinary ship attrition out of this test.
    world.countries.germany.navy.ships[0].port = "germany-8";
    assert.equal(wingEfficiency(world, world.countries.uk, wing), 0);
    airNavalDay(world);
    assert.equal(wing.mission, "idle");
    assert.equal(wing.experience, 0);
    assert.equal(target.damage, 0);
    assert.equal(world.countries.uk.stock.fuel, 1000);
    assert.equal(world.countries.germany.navy.ships[0].health, 100);
  }
});

test("Tarafsız kalan hava görev alanı günlük hesap öncesinde bile askerî güç vermez", () => {
  const world = createWorld("germany"),
    c = world.countries.germany,
    wing = c.air.wings.find((a) => a.model === "fighter")!;
  c.stock.fuel = 1000;
  c.air.wings = [wing];
  c.wars = ["netherlands"];
  world.countries.netherlands.wars = [c.id];
  wing.target = "netherlands-0";
  wing.mission = "superiority";
  assert.ok(regionalAirPower(world, c.id, wing.target) > 0);
  c.wars = [];
  world.countries.netherlands.wars = [];
  assert.equal(regionalAirPower(world, c.id, wing.target), 0);
  airNavalDay(world);
  assert.equal(wing.mission, "idle");
});

test("Hareketsiz kayıt ve güç sorguları sorti, hasar veya yakıt tüketimi üretmez", () => {
  const world = emptyAirSeaWorld();
  bomber(world, "strategic", "germany-1");
  const before = structuredClone(world);
  for (let i = 0; i < 20; i++) {
    wingEfficiency(world, world.countries.uk, world.countries.uk.air.wings[0]);
    regionalAirPower(world, "uk", "germany-1", "strategic");
  }
  assert.deepEqual(world, before);
});
