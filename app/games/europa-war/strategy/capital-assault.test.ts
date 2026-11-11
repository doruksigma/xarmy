import assert from "node:assert/strict";
import { test } from "node:test";
import { declareWar } from "./diplomacy";
import { advanceHour, advanceHours, applyAction } from "./engine";
import { decodeSave, encodeSave } from "./storage";
import {
  addArmy,
  createWorld,
  GEOGRAPHY,
  localSupply,
  surrender,
} from "./world";
import type { World } from "./types";

function capitalAssault(targetCountry: string, count: number, fort = 0) {
  const world = createWorld("germany", "historical", 1936, "hard");
  declareWar(world, "germany", targetCountry);
  world.armies = [];
  // Isolate the requested siege, but keep the defender's real hourly AI,
  // retreats, capital-reserve orders, combat and capture machinery enabled.
  // No country has spare stock to create a second defending division.
  for (const country of Object.values(world.countries)) {
    country.capitulated =
      country.id !== "germany" && country.id !== targetCountry;
    country.air.wings = [];
    country.navy.ships = [];
    country.production = [];
    country.autoAssignCommanders = false;
    country.manpower = 0;
  }
  const target = world.countries[targetCountry].capital;
  const origin = GEOGRAPHY[target].neighbors.find((edge) => !edge.sea)!.id;
  // This is an established attacking bridgehead with the atlas' original
  // infrastructure. Supply is connected, never forcibly set to100%.
  world.provinces[origin].controller = "germany";
  world.countries.germany.capital = origin;
  world.provinces[target].buildings.fort = fort;
  const attackers = Array.from({ length: count }, () => {
    const army = addArmy(world, "germany", origin);
    army.general = null;
    army.strength = army.organization = army.morale = 100;
    return army.id;
  });
  const guard = addArmy(world, targetCountry, target);
  guard.general = null;
  guard.strength = guard.organization = guard.morale = 100;
  guard.entrenchment = 30;
  const order = applyAction(world, {
    type: "moveGroup",
    armies: attackers,
    to: target,
  });
  assert.equal(order.error, null);
  return {
    world: order.world,
    origin,
    target,
    targetCountry,
    attackers,
    guard: guard.id,
  };
}

for (const [country, count, fort] of [
  ["poland", 12, 0],
  ["poland", 14, 0],
  ["austria", 14, 3],
] as const)
  test(`${count} hazır tümen ${country} başkentindeki tek muhafızı yener ve yürüyerek işgal eder (tahkimat${fort})`, (t) => {
    const fixture = capitalAssault(country, count, fort);
    const beforeSurrender = surrender(fixture.world, country);
    let world = advanceHour(fixture.world);
    const first = world.armies.filter((army) =>
      fixture.attackers.includes(army.id),
    );
    assert.equal(first.length, count);
    assert.ok(
      first.every(
        (army) => army.strength < 100 && army.move?.to === fixture.target,
      ),
    );
    assert.ok(
      first.every((army) => army.supply >= 0.25),
      "Connected standard formations must not immediately starve",
    );
    assert.ok(
      world.armies.find((army) => army.id === fixture.guard)!.strength < 100,
    );
    assert.equal(
      world.provinces[fixture.target].controller,
      country,
      "Victory does not teleport the attackers",
    );
    let hours = 1;
    while (
      hours < 14 * 24 &&
      world.provinces[fixture.target].controller !== "germany"
    ) {
      world = advanceHours(world, 24);
      hours += 24;
    }
    assert.equal(world.provinces[fixture.target].controller, "germany");
    assert.equal(
      world.armies.filter((army) => fixture.attackers.includes(army.id)).length,
      count,
    );
    assert.ok(
      world.armies
        .filter((army) => fixture.attackers.includes(army.id))
        .every((army) => army.province === fixture.target),
    );
    assert.ok(surrender(world, country) > beforeSurrender);
    assert.deepEqual(decodeSave(encodeSave(world)), world);
    t.diagnostic(
      `${count} tümen, ${country}: ${hours} oyun saati; başlangıç ikmali${Math.round(first[0].supply * 100)}%.`,
    );
  });

test("Tek piyade, aynı başkentte mevzilenmiş eşit muhafızı otomatik yenemez", () => {
  const fixture = capitalAssault("poland", 1);
  let world = fixture.world;
  for (let day = 0; day < 7; day++) world = advanceHours(world, 24);
  assert.equal(world.provinces[fixture.target].controller, "poland");
  const attacker = world.armies.find((army) =>
    fixture.attackers.includes(army.id),
  )!;
  assert.equal(attacker.province, fixture.origin);
  assert.equal(attacker.move, null);
  assert.ok(attacker.strength < 100);
  assert.equal(world.countries.poland.capitulated, false);
});

test("Son başkent düşünce gerçek zafer puanı teslimiyeti ve barış konferansını tetikler", () => {
  const fixture = capitalAssault("luxembourg", 12);
  let world = fixture.world;
  for (const province of Object.values(world.provinces))
    if (province.owner === "luxembourg" && province.id !== fixture.target)
      province.controller = "germany";
  assert.ok(surrender(world, "luxembourg") < 80);
  for (let day = 0; day < 14 && !world.countries.luxembourg.capitulated; day++)
    world = advanceHours(world, 24);
  assert.equal(world.provinces[fixture.target].controller, "germany");
  assert.equal(world.countries.luxembourg.capitulated, true);
  assert.equal(world.countries.luxembourg.victor, "germany");
  assert.ok(
    world.conferences.some(
      (conference) => conference.defeated === "luxembourg",
    ),
  );
  assert.ok(!world.armies.some((army) => army.country === "luxembourg"));
});

test("İkmal kapasitesi altyapıya bağlı kalır; aşırı yığınlar ve bağlantısız ordular hâlâ kısıtlanır", () => {
  const fixture = capitalAssault("poland", 14);
  const world: World = fixture.world;
  const original = localSupply(world, "germany", fixture.origin);
  assert.ok(original >= 0.25 && original < 1);
  const province = world.provinces[fixture.origin];
  province.buildings.infra = 0;
  province.buildings.rail = 0;
  province.buildings.hub = 0;
  assert.ok(localSupply(world, "germany", fixture.origin) < 0.25);
  province.buildings.infra = 3;
  province.buildings.rail = 1;
  province.damage = 100;
  assert.ok(localSupply(world, "germany", fixture.origin) < 0.25);
  province.damage = 0;
  assert.ok(
    localSupply(world, "germany", fixture.origin, undefined, 50) < 0.25,
  );
  world.provinces[world.countries.germany.capital].controller = "poland";
  assert.equal(localSupply(world, "germany", fixture.origin), 0.08);
});
