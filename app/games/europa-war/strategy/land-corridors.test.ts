import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import corridors from "./land-corridors.json";
import {
  corridorLength,
  isTraversableLandEdge,
  movementLegPath,
  remainingCorridor,
} from "./land-corridors";
import { resolveLandStep, routeTo } from "./land";
import { armyMapPosition } from "./map3d-visuals";
import { movementRoutes } from "./movement-routes";
import { portZone } from "./military-assets";
import { addArmy, createWorld, GEOGRAPHY, MAP, supplyNetwork } from "./world";

const istanbul = "turkey-1",
  canakkale = "turkey-city-2",
  izmit = "turkey-city-13";
function fixture() {
  const world = createWorld("turkey", "alternative", 1936, "normal");
  world.armies = [];
  world.countries.turkey.autoAssignCommanders = false;
  world.countries.turkey.navy.ships = [];
  for (const province of Object.values(world.provinces))
    province.buildings.infra = 10;
  const army = addArmy(world, "turkey", istanbul);
  army.general = null;
  return { world, army };
}

test("Corridors are generated from this exact offline atlas, with finite reversible endpoints", () => {
  const source = readFileSync("app/games/europa-war/strategy/map-data.json");
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    corridors.sourceSha256,
  );
  for (const key of Object.keys(corridors.curved)) {
    const [from, to] = key.split("|");
    const path = movementLegPath(from, to)!;
    assert.ok(path && path.length > 2, key);
    assert.deepEqual(path[0], { x: GEOGRAPHY[from].x, y: GEOGRAPHY[from].y });
    assert.deepEqual(path.at(-1), { x: GEOGRAPHY[to].x, y: GEOGRAPHY[to].y });
    assert.ok(path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.deepEqual(movementLegPath(to, from), [...path].reverse());
    assert.equal(movementLegPath(from, to), path, "Shared paths are cached");
  }
});

test("Istanbul reaches Canakkale through Izmit and Bursa instead of walking over Marmara", () => {
  const { world, army } = fixture();
  assert.equal(isTraversableLandEdge(istanbul, "turkey-3"), false);
  assert.equal(isTraversableLandEdge("turkey-city-1", "turkey-city-3"), false);
  assert.equal(movementLegPath(istanbul, "turkey-3"), null);
  const route = routeTo(world, army, canakkale)!;
  assert.equal(route[0], izmit);
  assert.ok(route.includes("turkey-3") && route.includes("turkey-city-3"));
  assert.equal(route.at(-1), canakkale);
  for (let i = 0; i < route.length; i++)
    assert.ok(isTraversableLandEdge(i ? route[i - 1] : istanbul, route[i]));
  army.route = route;
  let hours = 0;
  while (army.province !== canakkale && hours++ < 360)
    resolveLandStep(world, 1 / 24);
  assert.equal(
    army.province,
    canakkale,
    `Army must arrive without getting stuck (${hours} hours)`,
  );
});

test("An obsolete saved sea-shortcut order keeps its destination and reroutes on the next hour", () => {
  const { world, army } = fixture();
  army.move = { to: "turkey-3", progress: 0.5, days: 1 };
  army.route = ["turkey-city-3", canakkale];
  resolveLandStep(world, 1 / 24);
  assert.equal(army.move?.to, izmit);
  assert.equal(army.route.at(-1), canakkale);
  assert.ok(Number.isFinite(army.move?.days));
});

test("Coastal detours obey neutral transit permission and supply cannot cross a phantom border", () => {
  const { world, army } = fixture();
  for (const province of Object.values(world.provinces))
    province.controller = "germany";
  for (const id of [istanbul, "turkey-3", "turkey-city-3", canakkale])
    world.provinces[id].controller = "turkey";
  world.provinces[izmit].controller = "france";
  world.countries.turkey.capital = istanbul;
  assert.equal(routeTo(world, army, canakkale), null);
  assert.ok(!supplyNetwork(world, "turkey").has("turkey-3"));
  world.countries.france.access.push("turkey");
  assert.deepEqual(routeTo(world, army, canakkale), [
    izmit,
    "turkey-3",
    "turkey-city-3",
    canakkale,
  ]);
  assert.ok(supplyNetwork(world, "turkey").has(canakkale));
  world.countries.france.access = [];
  assert.equal(routeTo(world, army, canakkale), null);
});

test("Curved coastal march markers and arrows follow the same remaining corridor", () => {
  const { world, army } = fixture();
  const to = "turkey-city-1";
  const path = movementLegPath(istanbul, to)!;
  assert.ok(
    path.length > 2,
    "Thrace route must pass the real Bosphorus shore crossing",
  );
  const direct = Math.hypot(
    GEOGRAPHY[to].x - GEOGRAPHY[istanbul].x,
    GEOGRAPHY[to].y - GEOGRAPHY[istanbul].y,
  );
  assert.ok(corridorLength(path) > direct);
  const before = structuredClone(world);
  for (const ratio of [0.25, 0.5, 0.75]) {
    army.move = { to, progress: ratio, days: 1 };
    const expected = remainingCorridor(path, ratio);
    assert.deepEqual(armyMapPosition(army), expected[0]);
    const arrow = movementRoutes(world, [army.id])[0];
    assert.deepEqual(arrow.points, expected);
    assert.equal(arrow.color, world.countries.turkey.color);
  }
  assert.equal(world.seed, before.seed);
  army.move = { to: "turkey-3", progress: 0.5, days: 1 };
  assert.deepEqual(armyMapPosition(army), {
    x: GEOGRAPHY[istanbul].x,
    y: GEOGRAPHY[istanbul].y,
  });
  assert.equal(
    movementRoutes(world).length,
    0,
    "Do not draw old impossible water shortcuts before repair",
  );
});

test("Disconnected Japanese island ports remain usable sea transports gated by naval control", () => {
  const world = createWorld("japan", "alternative", 1936);
  world.armies = [];
  world.countries.japan.autoAssignCommanders = false;
  const army = addArmy(world, "japan", "japan-6");
  army.general = null;
  assert.equal(isTraversableLandEdge("japan-6", "japan-8"), false);
  assert.equal(
    GEOGRAPHY["japan-6"].neighbors.find((e) => e.id === "japan-8")?.sea,
    true,
  );
  const ships = world.countries.japan.navy.ships;
  world.countries.japan.navy.ships = [];
  assert.equal(routeTo(world, army, "japan-8"), null);
  world.countries.japan.navy.ships = ships;
  assert.ok(ships.length);
  for (const ship of ships) {
    ship.port = "japan-6";
    ship.zone = portZone("japan-6");
    ship.mission = "patrol";
    ship.transit = 0;
  }
  assert.deepEqual(routeTo(world, army, "japan-8"), ["japan-8"]);
});

test("All retained land edges have a geographic corridor and major mainland countries remain connected", () => {
  for (const province of Object.values(GEOGRAPHY))
    for (const edge of province.neighbors)
      if (!edge.sea)
        assert.ok(
          isTraversableLandEdge(province.id, edge.id),
          `${province.id} → ${edge.id}`,
        );
  const reach = (country: string, raw: boolean) => {
    const all = new Map(MAP.provinces.map((p) => [p.id, p]));
    const start = MAP.countries.find((c) => c.id === country)!.capital;
    const seen = new Set([start]),
      queue = [start];
    for (const id of queue)
      for (const edge of (raw ? all.get(id)! : GEOGRAPHY[id]).neighbors)
        if (
          !edge.sea &&
          !seen.has(edge.id) &&
          all.get(edge.id)?.country === country
        ) {
          seen.add(edge.id);
          queue.push(edge.id);
        }
    return seen;
  };
  for (const country of ["turkey", "france", "poland", "ussr"])
    assert.deepEqual(reach(country, false), reach(country, true), country);
  assert.equal(
    reach("germany", false).has("germany-9"),
    false,
    "East Prussia needs Polish access or sea transport",
  );
  assert.equal(
    reach("uk", false).has("uk-7"),
    false,
    "Belfast is not on Great Britain",
  );
});

test("Reviewed domestic port connections preserve access to East Prussia, Jutland and Northern Ireland", () => {
  for (const [country, from, to] of [
    ["germany", "germany-8", "germany-9"],
    ["denmark", "denmark-0", "denmark-1"],
    ["uk", "uk-2", "uk-7"],
  ]) {
    const world = createWorld(country, "alternative", 1936);
    world.armies = [];
    world.countries[country].autoAssignCommanders = false;
    world.countries[country].allies = [];
    const army = addArmy(world, country, from);
    army.general = null;
    assert.equal(
      GEOGRAPHY[from].neighbors.find((edge) => edge.id === to)?.sea,
      true,
    );
    assert.equal(
      GEOGRAPHY[to].neighbors.find((edge) => edge.id === from)?.sea,
      true,
    );
    const ships = world.countries[country].navy.ships;
    world.countries[country].navy.ships = [];
    assert.equal(routeTo(world, army, to), null, country);
    world.countries[country].navy.ships = ships;
    assert.ok(ships.length);
    // Denmark's initial fleet can contain one vessel. This route crosses two
    // sea zones, so the fixture needs a patrol in each rather than free access.
    if (ships.length === 1)
      ships.push({ ...ships[0], id: `domestic-escort-${country}` });
    world.countries[country].stock.fuel = 10000;
    for (const [index, ship] of ships.entries()) {
      ship.port = from;
      ship.zone = portZone(index % 2 ? to : from);
      ship.mission = "patrol";
      ship.transit = 0;
    }
    assert.deepEqual(routeTo(world, army, to), [to], country);
  }
});

test("Legacy land legs reclassified as sea reroute once and retain transport timing after save/load", async () => {
  const { encodeSave, decodeSave } = await import("./storage");
  const { movementLegDays } = await import("./land-movement-cost");
  const world = createWorld("japan", "alternative", 1936);
  world.armies = [];
  world.countries.japan.autoAssignCommanders = false;
  const army = addArmy(world, "japan", "japan-6");
  army.general = null;
  for (const ship of world.countries.japan.navy.ships) {
    ship.port = "japan-6";
    ship.zone = portZone("japan-6");
    ship.mission = "patrol";
    ship.transit = 0;
  }
  army.move = { to: "japan-8", days: 1, progress: 0.1 };
  army.route = ["japan-7"];
  resolveLandStep(world, 1 / 24);
  assert.equal(army.move?.kind, "transport");
  assert.equal(
    army.move?.days,
    movementLegDays(world, army, "japan-6", "japan-8", true),
  );
  assert.equal(army.route.at(-1), "japan-7");
  const loaded = decodeSave(encodeSave(world));
  const saved = loaded.armies.find((a) => a.id === army.id)!;
  assert.equal(saved.move?.kind, "transport");
  const progress = saved.move!.progress;
  resolveLandStep(loaded, 1 / 24);
  assert.ok(
    saved.move!.progress > progress,
    "New transport must not restart every hour",
  );
});
