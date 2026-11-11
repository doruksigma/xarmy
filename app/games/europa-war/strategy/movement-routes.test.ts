import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { addArmy, createWorld, GEOGRAPHY, MAP } from "./world";
import {
  movementRoutes,
  movementArrowHead,
  MAX_MOVEMENT_ARROWS,
} from "./movement-routes";
import {
  createMovementArrows,
  MAX_MOVEMENT_ARROW_VERTICES,
} from "./map3d-movement-arrows";

function fixture() {
  const world = createWorld("turkey", "historical", 1936);
  world.armies = [];
  const from = world.countries.turkey.capital;
  const to = GEOGRAPHY[from].neighbors.find((edge) => !edge.sea)!.id;
  const army = addArmy(world, "turkey", from);
  army.move = { to, progress: 1, days: 4 };
  return { world, army, from, to };
}

test("3D keeps a twelve-division operation and its defence line visible while stationary without disclosing enemy plans", () => {
  const { world, army, from, to } = fixture();
  army.move = null;
  for (let i = 1; i < 12; i++) addArmy(world, world.player, from);
  const armies = world.armies.map((unit) => unit.id);
  world.fronts = [
    { id: "test-front", country: world.player, armies, provinces: [from, to] },
  ];
  world.plans = [
    {
      id: "test-plan",
      country: world.player,
      armies,
      objectives: [to],
      name: "Grup harekâtı",
      active: false,
      preparation: 30,
      stance: "balanced",
    },
  ];
  world.plans.push({
    ...world.plans[0],
    id: "enemy-secret",
    country: "germany",
  });
  const before = structuredClone(world);
  assert.equal(
    movementRoutes(world, armies).length,
    0,
    "2D's own labelled operation layer is not duplicated",
  );
  const routes = movementRoutes(world, armies, [], true);
  assert.equal(routes.length, 2);
  assert.ok(
    routes.every(
      (route) =>
        route.count === 12 && route.selected && route.country === world.player,
    ),
  );
  assert.deepEqual(
    new Set(routes.map((route) => route.kind)),
    new Set(["front", "offensive"]),
  );
  const scene = new THREE.Scene();
  const renderer = createMovementArrows(scene, () => 0);
  renderer.update(world, armies);
  assert.equal(renderer.stats.routes, 2);
  assert.equal(
    renderer.stats.heads,
    1,
    "Defence line has no offensive arrowhead",
  );
  assert.ok(
    renderer.stats.vertices > 0 &&
      renderer.stats.vertices <= MAX_MOVEMENT_ARROW_VERTICES,
  );
  const rebuilds = renderer.stats.rebuilds;
  renderer.update(world, armies);
  assert.equal(renderer.stats.rebuilds, rebuilds);
  assert.deepEqual(world, before);
  world.fronts = [];
  world.plans = [];
  renderer.update(world, armies);
  assert.equal(
    renderer.stats.routes,
    0,
    "Deleting an operation removes its ribbon",
  );
  renderer.dispose();
});

test("Unselected marching divisions share a country-coloured progress arrow; campaign and RNG stay unchanged", () => {
  const { world, army, from, to } = fixture();
  for (let index = 1; index < 16; index++) {
    const unit = addArmy(world, "turkey", from);
    unit.move = { ...army.move! };
  }
  const before = structuredClone(world);
  const arrows = movementRoutes(world);
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0].count, 16);
  assert.equal(arrows[0].selected, false);
  assert.equal(arrows[0].color, world.countries.turkey.color);
  assert.equal(arrows[0].kind, "march");
  assert.ok(
    Math.abs(
      arrows[0].points[0].x -
        (GEOGRAPHY[from].x * 0.75 + GEOGRAPHY[to].x * 0.25),
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      arrows[0].points[0].y -
        (GEOGRAPHY[from].y * 0.75 + GEOGRAPHY[to].y * 0.25),
    ) < 1e-9,
  );
  assert.deepEqual(arrows[0].points.at(-1), {
    x: GEOGRAPHY[to].x,
    y: GEOGRAPHY[to].y,
  });
  assert.deepEqual(world, before);
  assert.equal(movementRoutes(world, [army.id])[0].count, 16);
  assert.equal(movementRoutes(world, [army.id])[0].selected, true);
});

test("Different destinations stay separate and marching cancellation or arrival removes the arrow", () => {
  const { world, army, from, to } = fixture();
  const other = addArmy(world, "turkey", from);
  const elsewhere = GEOGRAPHY[from].neighbors.find(
    (edge) => !edge.sea && edge.id !== to,
  )!.id;
  other.move = { to: elsewhere, progress: 0, days: 1 };
  assert.deepEqual(
    movementRoutes(world)
      .map((route) => route.to)
      .sort(),
    [to, elsewhere].sort(),
  );
  army.move = null;
  assert.equal(movementRoutes(world).length, 1);
  other.province = elsewhere;
  other.move = null;
  assert.deepEqual(movementRoutes(world), []);
  other.route = [from];
  assert.deepEqual(
    movementRoutes(world),
    [],
    "Queued idle plans only show for selected own divisions",
  );
  assert.equal(movementRoutes(world, [other.id])[0].kind, "planned");
});

test("Foreign arrows obey formation visibility and disclose no queued future order", () => {
  const { world } = fixture();
  const origin = world.countries.germany.capital;
  const to = GEOGRAPHY[origin].neighbors.find((edge) => !edge.sea)!.id;
  const secret = addArmy(world, "germany", origin);
  secret.move = { to, progress: 0.3, days: 1 };
  secret.route = [
    world.countries.france.capital,
    world.countries.spain.capital,
  ];
  assert.ok(
    !movementRoutes(world, [secret.id]).some(
      (route) => route.country === "germany",
    ),
  );
  world.countries.turkey.intel.germany = { level: 40, expires: world.day + 2 };
  const disclosed = movementRoutes(world).find(
    (route) => route.country === "germany",
  )!;
  assert.equal(disclosed.points.length, 2);
  assert.equal(disclosed.to, to);
  assert.equal(disclosed.color, world.countries.germany.color);
  assert.notEqual(disclosed.color, world.countries.turkey.color);
  world.day += 2;
  assert.ok(
    !movementRoutes(world).some((route) => route.country === "germany"),
  );
  world.countries.turkey.allies.push("germany");
  assert.ok(movementRoutes(world).some((route) => route.country === "germany"));
});

test("Arrowheads terminate at destinations and cannot point backwards on tiny final legs", () => {
  for (const end of [
    { x: 10, y: 0 },
    { x: -10, y: 3 },
    { x: 0.01, y: -0.02 },
  ]) {
    const head = movementArrowHead([{ x: 0, y: 0 }, end], 8);
    assert.equal(head.length, 3);
    assert.deepEqual(head[0], end);
    const middle = {
      x: (head[1].x + head[2].x) / 2,
      y: (head[1].y + head[2].y) / 2,
    };
    assert.ok((end.x - middle.x) * end.x + (end.y - middle.y) * end.y > 0);
    assert.ok(Math.hypot(middle.x, middle.y) < Math.hypot(end.x, end.y));
  }
  assert.deepEqual(
    movementArrowHead([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ]),
    [],
  );
});

test("3D ribbon follows supplied surface, uses real country colours and caches unchanged geometry", () => {
  const { world, army } = fixture();
  const scene = new THREE.Scene();
  const surface = (x: number, y: number) => x * 0.01 + y * 0.02;
  const renderer = createMovementArrows(scene, surface);
  const before = structuredClone(world);
  renderer.update(world);
  assert.equal(renderer.stats.routes, 1);
  assert.equal(renderer.stats.heads, 1);
  const mesh = scene.getObjectByName(
    "country-movement-arrows",
  ) as THREE.Mesh<THREE.BufferGeometry>;
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute("position");
  const colors = geometry.getAttribute("color");
  assert.ok(positions.count > 6);
  assert.ok(positions.count <= MAX_MOVEMENT_ARROW_VERTICES);
  const expected = new THREE.Color(world.countries.turkey.color);
  let tinted = 0;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index) + MAP.width / 2,
      y = positions.getZ(index) + MAP.height / 2;
    const lift = positions.getY(index) - surface(x, y);
    assert.ok(lift > 1 && lift < 1.4);
    if (
      Math.abs(colors.getX(index) - expected.r) < 1e-6 &&
      Math.abs(colors.getY(index) - expected.g) < 1e-6 &&
      Math.abs(colors.getZ(index) - expected.b) < 1e-6
    )
      tinted++;
  }
  assert.ok(tinted > 3);
  world.hour++;
  renderer.update(world);
  assert.equal(mesh.geometry, geometry);
  assert.equal(renderer.stats.rebuilds, 1);
  renderer.update(world, [army.id]);
  assert.notEqual(mesh.geometry, geometry);
  assert.equal(renderer.stats.arrows[0].selected, true);
  assert.deepEqual({ ...world, hour: before.hour }, before);
  army.move = null;
  renderer.update(world);
  assert.equal(renderer.stats.routes, 0);
  assert.equal(mesh.geometry.getAttribute("position").count, 0);
  let geometryDisposals = 0,
    materialDisposals = 0;
  mesh.geometry.addEventListener("dispose", () => geometryDisposals++);
  (mesh.material as THREE.Material).addEventListener(
    "dispose",
    () => materialDisposals++,
  );
  renderer.dispose();
  renderer.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.ok(!scene.getObjectByName("country-movement-arrows"));
  renderer.update(world);
  assert.equal(renderer.stats.vertices, 0);
});

test("Many formations and draft paths stay inside bounded arrow and geometry budgets", () => {
  const { world } = fixture();
  world.armies = [];
  for (const origin of MAP.provinces) {
    const target = origin.neighbors.find((edge) => !edge.sea);
    if (!target) continue;
    const army = addArmy(world, "turkey", origin.id);
    army.move = { to: target.id, progress: 0, days: 1 };
    army.route = MAP.provinces.slice(0, 12).map((p) => p.id);
  }
  const draft = MAP.provinces.slice(0, 30).map((p) => p.id);
  const routes = movementRoutes(world, [], draft);
  assert.equal(routes.length, MAX_MOVEMENT_ARROWS);
  assert.equal(routes[0].kind, "draft");
  assert.ok(routes[0].points.length <= 16);
  const scene = new THREE.Scene();
  const renderer = createMovementArrows(scene, () => 0);
  renderer.update(world, [], draft);
  assert.ok(renderer.stats.routes > 0);
  assert.ok(renderer.stats.routes <= MAX_MOVEMENT_ARROWS);
  assert.ok(renderer.stats.vertices <= MAX_MOVEMENT_ARROW_VERTICES);
  assert.equal(renderer.stats.heads, renderer.stats.routes);
  renderer.dispose();
});

test("The arrowhead neck stays country-coloured instead of an outline crossbar", () => {
  const { world, army } = fixture();
  const scene = new THREE.Scene();
  const renderer = createMovementArrows(scene, () => 0);
  const expected = new THREE.Color(world.countries.turkey.color);
  for (const selected of [false, true]) {
    const ids = selected ? [army.id] : [];
    const route = movementRoutes(world, ids)[0];
    const headSize = selected ? 8 : 6.5;
    const head = movementArrowHead(route.points, headSize);
    const outline = movementArrowHead(route.points, headSize + 1.5);
    // The centreline between the two head bases belongs to the coloured shaft.
    // A later-drawn outline head must not mask it with a dark or white stripe.
    const sample = new THREE.Vector3(
      (head[1].x + head[2].x + outline[1].x + outline[2].x) / 4 - MAP.width / 2,
      0,
      (head[1].y + head[2].y + outline[1].y + outline[2].y) / 4 -
        MAP.height / 2,
    );
    renderer.update(world, ids);
    const mesh = scene.getObjectByName(
      "country-movement-arrows",
    ) as THREE.Mesh<THREE.BufferGeometry>;
    const positions = mesh.geometry.getAttribute("position");
    const colors = mesh.geometry.getAttribute("color");
    const triangle = new THREE.Triangle();
    let lastCoveredVertex = -1;
    for (let index = 0; index < positions.count; index += 3) {
      for (const [offset, vertex] of [
        triangle.a,
        triangle.b,
        triangle.c,
      ].entries())
        vertex.set(
          positions.getX(index + offset),
          0,
          positions.getZ(index + offset),
        );
      if (triangle.containsPoint(sample)) lastCoveredVertex = index;
    }
    assert.ok(lastCoveredVertex >= 0, "The shaft covers its neck centreline");
    for (const [actual, intended] of [
      [colors.getX(lastCoveredVertex), expected.r],
      [colors.getY(lastCoveredVertex), expected.g],
      [colors.getZ(lastCoveredVertex), expected.b],
    ])
      assert.ok(
        Math.abs(actual - intended) < 1e-6,
        `${selected ? "Selected" : "Unselected"} arrow neck retains country colour`,
      );
  }
  renderer.dispose();
});
