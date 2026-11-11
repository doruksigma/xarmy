import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "./engine";
import { commanderAction, commanderBorders, commandersDay } from "./commanders";
import { resolveLandStep, routeTo } from "./land";
import { createMovementTimeEstimator } from "./land-movement-cost";
import { decodeSave, encodeSave } from "./storage";
import { addArmy, createWorld, GEOGRAPHY, MAP } from "./world";
import type { Army, World } from "./types";

const origin = "turkey-0",
  target = "turkey-city-30";
const shortcut = ["turkey-city-23", "turkey-city-22", "turkey-city-28", target];

function campaign(count = 1) {
  const world = createWorld("turkey", "alternative", 1936, "normal");
  world.armies = [];
  world.countries.turkey.autoAssignCommanders = true;
  world.countries.turkey.navy.ships = [];
  world.countries.france.access.push("turkey");
  // Use the real map and terrain. The transit grant makes Urfa the only
  // Turkish-held border point while preserving the Ankara–Urfa approaches.
  for (const province of Object.values(world.provinces)) {
    province.controller = "france";
    province.buildings.infra = 10;
    province.buildings.rail = province.buildings.hub = province.damage = 0;
  }
  for (const id of [origin, target]) world.provinces[id].controller = "turkey";
  world.provinces["turkey-city-31"].controller = "germany";
  for (let index = 0; index < count; index++)
    addArmy(world, "turkey", origin).organization = 100;
  return world;
}

function deploy(world: World, general = world.armies[0].general!) {
  commanderAction(world, world.countries.turkey, {
    type: "commanderDeploy",
    general,
    target: "germany",
  });
}

function pathCost(world: World, members: Army[], path: string[]) {
  const cost = createMovementTimeEstimator(world, members);
  return path.reduce(
    (total, to, index) =>
      total + cost(index ? path[index - 1] : origin, to, false),
    0,
  );
}

test("Commander deployment takes the faster real Ankara–Urfa detour and arrives sooner", () => {
  const world = campaign();
  const army = world.armies[0],
    seed = world.seed;
  assert.deepEqual(commanderBorders(world, "turkey", "germany"), [target]);
  deploy(world);
  assert.ok(army.route.length > shortcut.length);
  assert.ok(
    pathCost(world, [army], army.route) < pathCost(world, [army], shortcut),
  );
  assert.equal(world.seed, seed, "Routing consumes no campaign RNG");
  const slow = structuredClone(world);
  slow.armies[0].route = [...shortcut];
  const arrive = (state: World) => {
    for (let hour = 1; hour <= 24 * 100; hour++) {
      resolveLandStep(state, 1 / 24);
      if (state.armies[0].province === target) return hour;
    }
    assert.fail("The deployment must arrive through actual hourly movement");
  };
  assert.ok(arrive(world) < arrive(slow));
});

test("Border allocation uses travel time while retaining equal counts and settled assignments", () => {
  const world = campaign(12);
  world.provinces[target].controller = "france";
  world.provinces["turkey-city-31"].controller = "france";
  const slower = "turkey-city-34",
    faster = "turkey-city-0";
  for (const id of [slower, faster]) world.provinces[id].controller = "turkey";
  // With the real Marmara detour, Edirne has one more legal approach leg.
  // Give Erzincan genuinely poor approach infrastructure to preserve the
  // test's intended distinction between fewer borders and faster travel.
  for (const edge of GEOGRAPHY[slower].neighbors)
    if (!edge.sea) world.provinces[edge.id].buildings.infra = 2;
  for (const id of ["turkey-city-35", "bulgaria-city-3"])
    world.provinces[id].controller = "germany";
  const first = [...world.armies].sort((a, b) => a.id.localeCompare(b.id))[0];
  const fastPath = routeTo(world, first, faster, origin, world.armies)!;
  const slowPath = routeTo(world, first, slower, origin, world.armies)!;
  assert.ok(
    fastPath.length > slowPath.length,
    "Fewer legs would choose the other border",
  );
  assert.ok(
    pathCost(world, world.armies, fastPath) <
      pathCost(world, world.armies, slowPath),
  );
  deploy(world);
  const front = world.countries.turkey.generals.find(
    (g) => g.id === first.general,
  )!.front!;
  assert.equal(front.assignments[first.id], faster);
  for (const point of [slower, faster]) {
    const members = world.armies.filter(
      (army) => front.assignments[army.id] === point,
    );
    assert.equal(members.length, 6);
    const expected = routeTo(world, members[0], point, origin, members);
    assert.ok(
      members.every(
        (army) => JSON.stringify(army.route) === JSON.stringify(expected),
      ),
    );
  }
  const assignments = { ...front.assignments };
  commandersDay(world);
  assert.deepEqual(front.assignments, assignments);
});

test("Commander searches refresh infrastructure, damage and diplomatic access each update", () => {
  const world = campaign();
  const army = world.armies[0],
    bottleneck = "turkey-city-27";
  deploy(world);
  const original = [...army.route];
  assert.ok(original.includes(bottleneck));
  world.provinces[bottleneck].buildings.infra = 0;
  commandersDay(world);
  assert.ok(!army.route.includes(bottleneck));
  world.provinces[bottleneck].buildings.infra = 10;
  commandersDay(world);
  assert.deepEqual(army.route, original);
  world.provinces[bottleneck].damage = 100;
  commandersDay(world);
  assert.ok(!army.route.includes(bottleneck));
  world.provinces[bottleneck].damage = 0;
  world.provinces[bottleneck].controller = "italy";
  commandersDay(world);
  assert.ok(!army.route.includes(bottleneck));
  world.countries.italy.access.push("turkey");
  commandersDay(world);
  assert.deepEqual(army.route, original);
  world.countries.italy.access = [];
  commandersDay(world);
  assert.ok(!army.route.includes(bottleneck));
  world.provinces[bottleneck].controller = "france";
  world.countries.france.access = [];
  commandersDay(world);
  assert.deepEqual(army.route, []);
  assert.equal(army.move, null);
  assert.equal(army.marchGroup, undefined);
  world.countries.france.access.push("turkey");
  commandersDay(world);
  assert.deepEqual(army.route, original);
});

test("A disconnected weighted deployment is rejected atomically and never uses enemy transit", () => {
  const world = campaign();
  world.countries.france.access = [];
  for (const wartime of [false, true]) {
    if (wartime) {
      world.countries.turkey.wars.push("france");
      world.countries.france.wars.push("turkey");
    }
    const before = structuredClone(world);
    const result = applyAction(world, {
      type: "commanderDeploy",
      general: world.armies[0].general!,
      target: "germany",
    });
    assert.ok(result.error?.includes("güvenli kara yolu"));
    assert.equal(result.world, world);
    assert.deepEqual(world, before);
  }
});

test("Mixed commander formations keep a common route, active progress and simultaneous arrival after saving", () => {
  const world = campaign(6);
  world.armies[0].type = "lightTank";
  world.armies[1].type = "artillery";
  world.armies[2].support = ["logistics", "recon"];
  const action = {
    type: "commanderDeploy" as const,
    general: world.armies[0].general!,
    target: "germany",
  };
  const forward = applyAction(world, action),
    reverse = structuredClone(world);
  reverse.armies.reverse();
  const reversed = applyAction(reverse, action);
  assert.equal(forward.error, null);
  assert.equal(reversed.error, null);
  const ordered = (state: World) =>
    [...state.armies].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    ordered(forward.world).map((a) => a.route),
    ordered(reversed.world).map((a) => a.route),
  );
  assert.ok(
    forward.world.armies.every(
      (a) =>
        JSON.stringify(a.route) ===
        JSON.stringify(forward.world.armies[0].route),
    ),
  );
  assert.notEqual(forward.world.armies[0].route, forward.world.armies[1].route);
  resolveLandStep(forward.world, 1 / 24);
  const moves = forward.world.armies.map((army) => structuredClone(army.move));
  commandersDay(forward.world);
  assert.deepEqual(
    forward.world.armies.map((army) => army.move),
    moves,
    "Refreshing a route preserves progress on its current leg",
  );
  const loaded = decodeSave(encodeSave(forward.world));
  for (let hour = 0; hour < 24 * 100; hour++) {
    if (hour % 24 === 0) commandersDay(loaded);
    resolveLandStep(loaded, 1 / 24);
    assert.equal(new Set(loaded.armies.map((army) => army.province)).size, 1);
    if (loaded.armies[0].province === target) break;
  }
  assert.ok(
    loaded.armies.every((army) => army.province === target && !army.move),
  );
});

test("Equivalent commanders share searches only when their logistics movement profiles match", () => {
  const world = campaign(24);
  const first = world.armies.slice(0, 12),
    second = world.armies.slice(12);
  const normal = world.countries.turkey.generals.find(
    (g) => g.id === first[0].general,
  )!;
  const logistics = world.countries.turkey.generals.find(
    (g) => g.id === second[0].general,
  )!;
  normal.trait = "defense";
  logistics.trait = "logistics";
  // With infrastructure-scaled carrying capacity, use a mildly damaged
  // corridor where logistics still changes the fastest real approach.
  world.provinces["turkey-city-26"].buildings.infra = 6;
  world.provinces["turkey-city-26"].damage = 10;
  const ordinaryRoute = routeTo(world, first[0], target, origin, first);
  const logisticsRoute = routeTo(world, second[0], target, origin, second);
  assert.notDeepEqual(
    ordinaryRoute,
    logisticsRoute,
    "Logistics changes the fastest route through the damaged corridor",
  );
  for (const general of [normal, logistics])
    general.front = { target: "germany", stance: "defend", assignments: {} };
  commandersDay(world);
  assert.ok(
    first.every(
      (army) => JSON.stringify(army.route) === JSON.stringify(ordinaryRoute),
    ),
  );
  assert.ok(
    second.every(
      (army) => JSON.stringify(army.route) === JSON.stringify(logisticsRoute),
    ),
  );
  logistics.trait = "defense";
  commandersDay(world);
  assert.ok(
    second.every(
      (army) => JSON.stringify(army.route) === JSON.stringify(ordinaryRoute),
    ),
    "Trait changes invalidate the next update's profile cache",
  );
});

test("Equal-time commander routes are independent of adjacency and army iteration order", () => {
  const world = campaign(4);
  world.provinces[target].controller = "france";
  world.provinces["turkey-city-31"].controller = "france";
  world.provinces["turkey-city-18"].controller = "turkey";
  world.provinces["turkey-city-17"].controller = "germany";
  // Ankara–Çorum has two genuinely equal-time, connected plains approaches:
  // Kastamonu and Kırşehir. Their four leg lengths are below the same minimum
  // movement duration; the former Istanbul fixture relied on a sea shortcut.
  assert.equal(
    pathCost(world, world.armies, ["turkey-city-16", "turkey-city-18"]),
    pathCost(world, world.armies, ["turkey-city-23", "turkey-city-18"]),
  );
  const reversed = structuredClone(world),
    seed = world.seed;
  deploy(world);
  try {
    reversed.armies.reverse();
    for (const province of Object.values(GEOGRAPHY))
      province.neighbors.reverse();
    deploy(reversed);
  } finally {
    for (const province of Object.values(GEOGRAPHY))
      province.neighbors.reverse();
  }
  const routes = (state: World) =>
    [...state.armies]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((army) => army.route);
  assert.deepEqual(routes(world), routes(reversed));
  assert.equal(world.seed, seed);
  assert.equal(reversed.seed, seed);
});

test("Weighted commander marches keep idle, unassigned and other-target commanders isolated", () => {
  const world = campaign(25);
  const active = world.armies[0].general!;
  const other = world.armies[12].general!;
  const idle = world.armies[24];
  const reserve = addArmy(world, "turkey", origin);
  reserve.general = null;
  const otherGeneral = world.countries.turkey.generals.find(
    (g) => g.id === other,
  )!;
  const elsewhere = "turkey-city-34";
  world.provinces[elsewhere].controller = "turkey";
  world.provinces["turkey-city-35"].controller = "italy";
  commanderAction(world, world.countries.turkey, {
    type: "commanderDeploy",
    general: other,
    target: "italy",
  });
  const otherBefore = structuredClone(otherGeneral.front);
  deploy(world, active);
  commandersDay(world);
  assert.deepEqual(otherGeneral.front, otherBefore);
  assert.ok(
    world.armies
      .filter((a) => a.general === other)
      .every((a) => a.route.at(-1) === elsewhere),
  );
  for (let hour = 0; hour < 24; hour++) resolveLandStep(world, 1 / 24);
  for (const army of [idle, reserve]) {
    assert.equal(army.province, origin);
    assert.deepEqual(army.route, []);
    assert.equal(army.move, null);
    assert.equal(army.marchGroup, undefined);
  }
});

test("447-region commander routing shares world scans and weighted searches across equivalent generals", (t) => {
  assert.ok(MAP.provinces.length >= 447);
  const readsFor = (count: number) => {
    const world = campaign(count);
    for (const general of world.countries.turkey.generals) {
      general.trait = "defense";
      general.front = { target: "germany", stance: "defend", assignments: {} };
    }
    let armyReads = 0,
      graphReads = 0,
      generalReads = 0;
    world.armies = new Proxy(world.armies, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) armyReads++;
        return Reflect.get(target, property, receiver);
      },
    });
    world.countries.turkey.generals = new Proxy(
      world.countries.turkey.generals,
      {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property))
            generalReads++;
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const descriptors = Object.values(GEOGRAPHY).map(
      (province) =>
        [
          province,
          Object.getOwnPropertyDescriptor(province, "neighbors")!,
        ] as const,
    );
    try {
      for (const [province, descriptor] of descriptors)
        Object.defineProperty(province, "neighbors", {
          configurable: true,
          get() {
            graphReads++;
            return descriptor.value;
          },
        });
      commandersDay(world);
    } finally {
      for (const [province, descriptor] of descriptors)
        Object.defineProperty(province, "neighbors", descriptor);
    }
    assert.ok(
      armyReads < count * 8,
      `World armies read ${armyReads} times for ${count} members`,
    );
    assert.ok(
      graphReads < MAP.provinces.length * 4,
      `The same origin/formation must share a search: ${graphReads} graph reads`,
    );
    assert.ok(
      generalReads < world.countries.turkey.generals.length * 8,
      "Supply estimates must not rescan the commander roster per graph node",
    );
    assert.ok(world.armies.every((army) => army.route.at(-1) === target));
    return { armyReads, graphReads, generalReads };
  };
  const small = readsFor(240),
    large = readsFor(480);
  assert.ok(large.armyReads < small.armyReads * 2.2);
  assert.ok(large.graphReads < small.graphReads * 1.4);
  t.diagnostic(
    `240 members: ${JSON.stringify(small)}; 480 members: ${JSON.stringify(large)}`,
  );
});
