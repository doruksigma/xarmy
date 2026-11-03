import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "./engine";
import { applyCountryAction } from "./action-engine";
import { TERRAINS, UNITS } from "./catalog";
import { nextLandStep, resolveLandDay, resolveLandStep, routeTo } from "./land";
import {
  createMovementTimeEstimator,
  movementLegDays,
  movementProgressRate,
} from "./land-movement-cost";
import { planningDay } from "./planning";
import { decodeSave, encodeSave } from "./storage";
import { addArmy, createWorld, GEOGRAPHY, MAP } from "./world";
import type { Army } from "./types";

const origin = "turkey-0",
  target = "turkey-city-30";
const mountainShortcut = [
  "turkey-city-23",
  "turkey-city-22",
  "turkey-city-28",
  target,
];

function campaign() {
  const world = createWorld("turkey", "alternative", 1936, "normal");
  world.armies = [];
  world.countries.turkey.autoAssignCommanders = false;
  world.countries.turkey.navy.ships = [];
  for (const province of Object.values(world.provinces)) {
    province.buildings.infra = 10;
    province.buildings.rail = province.buildings.hub = province.damage = 0;
  }
  const army = addArmy(world, "turkey", origin);
  army.organization = 100;
  return { world, army };
}

function pathCost(
  cost: ReturnType<typeof createMovementTimeEstimator>,
  from: string,
  path: string[],
) {
  return path.reduce(
    (total, to, index) =>
      total +
      cost(
        index ? path[index - 1] : from,
        to,
        GEOGRAPHY[index ? path[index - 1] : from].neighbors.find(
          (edge) => edge.id === to,
        )!.sea,
      ),
    0,
  );
}

test("The real Ankara–Urfa route avoids the slower four-leg mountain shortcut", () => {
  const { world, army } = campaign();
  const before = structuredClone(world);
  const route = routeTo(world, army, target)!;
  const cost = createMovementTimeEstimator(world, [army]);
  assert.ok(
    route.length > mountainShortcut.length,
    "The fastest route need not have the fewest borders",
  );
  assert.ok(
    pathCost(cost, origin, route) < pathCost(cost, origin, mountainShortcut),
  );
  assert.equal(
    route.filter((id) => GEOGRAPHY[id].terrain === "mountain").length,
    1,
  );
  assert.deepEqual(
    world,
    before,
    "Searching consumes no campaign RNG, fuel or state",
  );
  assert.equal(routeTo(world, army, "not-a-province"), null);
});

test("Infrastructure damage and control changes change the next search without a stale cache", () => {
  const { world, army } = campaign();
  const route = routeTo(world, army, target)!;
  const bottleneck = "turkey-city-27";
  assert.ok(route.includes(bottleneck));
  world.provinces[bottleneck].buildings.infra = 0;
  const lowInfrastructure = routeTo(world, army, target)!;
  assert.ok(!lowInfrastructure.includes(bottleneck));
  world.provinces[bottleneck].buildings.infra = 10;
  assert.deepEqual(routeTo(world, army, target), route);
  world.provinces[bottleneck].damage = 100;
  assert.ok(!routeTo(world, army, target)!.includes(bottleneck));
  world.provinces[bottleneck].damage = 0;
  world.provinces[bottleneck].controller = "france";
  assert.ok(!routeTo(world, army, target)!.includes(bottleneck));
  world.countries.france.access.push("turkey");
  assert.deepEqual(routeTo(world, army, target), route);
  world.countries.france.access = [];
  assert.ok(!routeTo(world, army, target)!.includes(bottleneck));
});

function corridor() {
  const result = campaign();
  for (const province of Object.values(result.world.provinces))
    province.controller = "germany";
  for (const id of [origin, "turkey-city-22"])
    result.world.provinces[id].controller = "turkey";
  result.world.provinces["turkey-city-23"].controller = "france";
  return result;
}

test("Neutral transit needs access or alliance; war allows the hostile endpoint but no uncaptured transit", () => {
  const { world, army } = corridor();
  const to = "turkey-city-22",
    border = "turkey-city-23";
  assert.equal(routeTo(world, army, to), null);
  world.countries.france.access.push("turkey");
  assert.deepEqual(routeTo(world, army, to), [border, to]);
  world.countries.france.access = [];
  world.countries.turkey.allies.push("france");
  assert.deepEqual(routeTo(world, army, to), [border, to]);
  world.countries.turkey.allies = [];
  world.countries.turkey.wars.push("france");
  world.countries.france.wars.push("turkey");
  assert.deepEqual(routeTo(world, army, border), [border]);
  assert.equal(routeTo(world, army, to), null);
  assert.equal(world.provinces[border].controller, "france");
});

test("Shared formulas preserve terrain, sea, engine, recon and post-consumption fuel timing", () => {
  const { world, army } = campaign();
  const to = GEOGRAPHY[origin].neighbors.find((edge) => !edge.sea)!.id;
  for (const type of Object.keys(UNITS) as Army["type"][]) {
    army.type = type;
    army.support = ["recon"];
    world.countries.turkey.tech = ["engines"];
    for (const sea of [false, true]) {
      const distance = Math.hypot(
        GEOGRAPHY[to].x - GEOGRAPHY[origin].x,
        GEOGRAPHY[to].y - GEOGRAPHY[origin].y,
      );
      const legacy =
        Math.max(2, distance / 18) /
        (UNITS[type].speed *
          1.1 *
          TERRAINS[GEOGRAPHY[to].terrain].speed *
          (sea ? 0.5 : 1) *
          (UNITS[type].fuel ? 1.2 : 1));
      assert.equal(movementLegDays(world, army, origin, to, sea), legacy);
    }
  }
  army.type = "motorized";
  army.support = [];
  world.countries.turkey.tech = [];
  world.countries.turkey.stock.fuel = UNITS.motorized.fuel / 24;
  army.route = [to];
  const duration = movementLegDays(world, army, origin, to, false);
  resolveLandStep(world, 1 / 24);
  assert.equal(world.countries.turkey.stock.fuel, 0);
  assert.equal(army.move!.days, duration);
  assert.ok(
    Math.abs(
      army.move!.progress - movementProgressRate(army.supply, 0.3) / 24,
    ) < 1e-12,
  );
  const emptyFuelCost = createMovementTimeEstimator(world, [army])(
    origin,
    to,
    false,
  );
  world.countries.turkey.stock.fuel = 100;
  const suppliedCost = createMovementTimeEstimator(world, [army])(
    origin,
    to,
    false,
  );
  assert.ok(Math.abs(emptyFuelCost * 0.3 - suppliedCost) < 1e-12);
});

test("Sixteen mixed-speed units choose one order-independent route and arrive together after save/load", () => {
  const { world, army } = campaign();
  army.type = "lightTank";
  for (let index = 1; index < 16; index++) {
    const member = addArmy(
      world,
      "turkey",
      origin,
      index === 1 ? "artillery" : "infantry",
    );
    if (index % 3 === 0) member.support = ["logistics", "recon"];
  }
  const ids = world.armies.map((army) => army.id);
  const forward = applyAction(world, {
    type: "moveGroup",
    armies: ids,
    to: target,
  });
  const reversed = applyAction(world, {
    type: "moveGroup",
    armies: [...ids].reverse(),
    to: target,
  });
  assert.equal(forward.error, null);
  assert.equal(reversed.error, null);
  const routes = forward.world.armies.map((army) => army.route);
  assert.ok(
    routes.every(
      (route) => JSON.stringify(route) === JSON.stringify(routes[0]),
    ),
  );
  assert.deepEqual(
    reversed.world.armies.map((army) => army.route),
    routes,
  );
  assert.notEqual(routes[0], routes[1]);
  const ai = applyCountryAction({ ...world, player: "france" }, "turkey", {
    type: "moveGroup",
    armies: ids,
    to: target,
  });
  assert.equal(ai.error, null);
  assert.deepEqual(
    ai.world.armies.map((army) => army.route),
    routes,
    "AI uses the same command path and costs",
  );
  const loaded = decodeSave(encodeSave(forward.world));
  assert.deepEqual(
    loaded.armies.map((army) => army.route),
    routes,
  );
  for (let day = 0; day < 120 && loaded.armies[0].province !== target; day++) {
    loaded.day++;
    resolveLandDay(loaded);
    assert.equal(
      new Set(loaded.armies.map((army) => army.province)).size,
      1,
      "No single tank departs or captures ahead of the formation",
    );
  }
  assert.ok(
    loaded.armies.every(
      (army) => army.province === target && army.move === null,
    ),
  );
});

test("Append searches begin at each actual queued endpoint; revoking transit stops the current leg", () => {
  const { world, army } = corridor();
  const border = "turkey-city-23",
    to = "turkey-city-22";
  world.countries.france.access.push("turkey");
  const first = applyAction(world, { type: "move", army: army.id, to: border });
  assert.equal(first.error, null);
  const appended = applyAction(first.world, {
    type: "move",
    army: army.id,
    to,
    append: true,
  });
  assert.equal(appended.error, null);
  const moving = appended.world.armies[0];
  assert.deepEqual(moving.route, [border, to]);
  resolveLandStep(appended.world, 1 / 24);
  assert.equal(moving.move!.to, border);
  assert.deepEqual(moving.route, [to]);
  appended.world.countries.france.access = [];
  resolveLandStep(appended.world, 1 / 24);
  assert.equal(moving.province, origin);
  assert.equal(moving.move, null);
  assert.deepEqual(moving.route, []);
  assert.equal(routeTo(appended.world, moving, to), null);
});

test("Naval transit remains gated and strategic plans cannot invent sea shortcuts", () => {
  const world = createWorld("uk", "alternative", 1936);
  world.armies = [];
  world.countries.uk.allies = [];
  world.countries.france.access.push("uk");
  const army = addArmy(world, "uk", "uk-0");
  assert.deepEqual(routeTo(world, army, "france-1"), ["france-1"]);
  assert.equal(nextLandStep(world, army, "france-1"), undefined);
  army.route = ["france-1"];
  resolveLandStep(world, 1 / 24);
  assert.equal(army.move!.to, "france-1");
  world.countries.uk.navy.ships = [];
  assert.equal(routeTo(world, army, "france-1"), null);
  resolveLandStep(world, 1 / 24);
  assert.equal(army.move, null);
  assert.equal(army.province, "uk-0");
});

test("Offensive plans use weighted lookahead but issue only the currently legal adjacent hostile step", () => {
  const { world, army } = campaign();
  world.provinces[target].controller = "france";
  world.countries.turkey.wars.push("france");
  world.countries.france.wars.push("turkey");
  const expected = routeTo(world, army, target)!;
  assert.ok(expected.length > mountainShortcut.length);
  assert.equal(nextLandStep(world, army, target), expected[0]);
  world.plans.push({
    id: "terrain-plan",
    country: "turkey",
    name: "İlerleme",
    armies: [army.id],
    objectives: [target],
    preparation: 100,
    active: true,
    stance: "aggressive",
  });
  planningDay(world);
  assert.deepEqual(army.route, [expected[0]]);

  const isolated = corridor();
  isolated.world.provinces["turkey-city-22"].controller = "france";
  isolated.world.countries.turkey.wars.push("france");
  isolated.world.countries.france.wars.push("turkey");
  assert.equal(routeTo(isolated.world, isolated.army, "turkey-city-22"), null);
  assert.equal(
    nextLandStep(isolated.world, isolated.army, "turkey-city-22"),
    "turkey-city-23",
  );
  isolated.world.plans.push({
    id: "hostile-plan",
    country: "turkey",
    name: "İlerleme",
    armies: [isolated.army.id],
    objectives: ["turkey-city-22"],
    preparation: 100,
    active: true,
    stance: "aggressive",
  });
  planningDay(isolated.world);
  assert.deepEqual(isolated.army.route, ["turkey-city-23"]);
  isolated.army.route = [];
  isolated.world.provinces["turkey-city-23"].controller = "germany";
  planningDay(isolated.world);
  assert.deepEqual(
    isolated.army.route,
    [],
    "A new neutral controller invalidates the old strategic search",
  );
});

test("Equal-cost choices stay deterministic when adjacency and group iteration order change", () => {
  const { world, army } = campaign();
  const cost = createMovementTimeEstimator(world, [army]);
  assert.equal(
    pathCost(cost, origin, ["turkey-city-14", "turkey-city-13", "turkey-1"]),
    pathCost(cost, origin, ["turkey-city-12", "turkey-3", "turkey-1"]),
    "The fixture contains two genuinely equal-time approaches",
  );
  const first = routeTo(world, army, "turkey-1");
  const seed = world.seed;
  try {
    for (const province of Object.values(GEOGRAPHY))
      province.neighbors.reverse();
    assert.deepEqual(routeTo(world, army, "turkey-1"), first);
  } finally {
    for (const province of Object.values(GEOGRAPHY))
      province.neighbors.reverse();
  }
  assert.equal(world.seed, seed);
});

test("447-province routing scans large formations linearly, not once per graph edge", () => {
  assert.ok(MAP.provinces.length >= 447);
  const readsFor = (size: number) => {
    const { world, army } = campaign();
    for (const province of Object.values(world.provinces))
      province.controller = "turkey";
    world.armies = Array.from(
      { length: size },
      (_, index) =>
        ({
          ...army,
          id: `route-member-${index}`,
          support: index % 2 ? [] : ["recon"],
        }) as Army,
    );
    let reads = 0;
    world.armies = new Proxy(world.armies, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads++;
        return Reflect.get(target, property, receiver);
      },
    });
    assert.ok(
      routeTo(world, world.armies[0], "germany-0", origin, world.armies),
    );
    assert.ok(
      reads < size * 8,
      "No graph-node iteration may rescan the complete formation",
    );
    return reads;
  };
  assert.ok(readsFor(480) < readsFor(240) * 2.2);
});
