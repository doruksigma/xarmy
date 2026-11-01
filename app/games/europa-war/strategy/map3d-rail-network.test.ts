import assert from "node:assert/strict";
import { test } from "node:test";
import { containsProvincePoint } from "./map3d-geometry";
import {
  buildGlobalRailNetwork,
  buildRailNetwork,
  railNetworkSignature,
  railPointAt,
  roundRailCorners,
} from "./map3d-rail-network";
import { createWorld, friendly, GEOGRAPHY } from "./world";
import type { World } from "./types";

function isolate(world: World, ids: string[]) {
  for (const province of Object.values(world.provinces))
    province.buildings.rail = ids.includes(province.id) ? 1 : 0;
}

test("Başlangıç Türkiye demiryolu Ankara'ya bağlıdır; ülke içi güzergâhlar dünya verisini ve rastgele tohumu değiştirmez", () => {
  const world = createWorld("turkey");
  const before = JSON.stringify(world);
  const network = buildRailNetwork(world);
  assert.equal(JSON.stringify(world), before);
  assert.ok(network.edges.length > 0);
  assert.ok(network.routes.length > 0 && network.routes.length <= 10);
  const reached = new Set(
    network.edges.flatMap((edge) => [edge.from, edge.to]),
  );
  assert.equal(reached.size, network.edges.length + 1);
  assert.equal(
    new Set(network.stations.map((s) => s.province)).size,
    network.stations.length,
  );
  for (const route of network.routes) {
    assert.ok(route.ids.every((id) => reached.has(id)));
    assert.ok(route.length > 0);
    assert.ok(route.ids.length >= 2);
    assert.equal(new Set(route.ids).size, route.ids.length);
    const expected = [];
    for (let i = 1; i < route.ids.length; i++) {
      const from = route.ids[i - 1],
        to = route.ids[i];
      const edge = network.edges.find(
        (edge) =>
          (edge.from === from && edge.to === to) ||
          (edge.from === to && edge.to === from),
      );
      assert.ok(edge, `${from}→${to} must use an actual connected rail edge`);
      const part =
        edge.from === from ? edge.points : [...edge.points].reverse();
      expected.push(...(i === 1 ? part : part.slice(1)));
    }
    assert.deepEqual(
      route.points,
      expected,
      "Trains follow exactly the rendered track points",
    );
  }
  assert.ok(
    network.routes.some(
      (route) =>
        route.ids[0] !== world.countries.turkey.capital &&
        route.ids.at(-1) !== world.countries.turkey.capital,
    ),
  );
  assert.deepEqual(buildRailNetwork(world), network);
});

test("Tek bağlı ray tek güzergâh kalır; uzun rotalar bağlantı noktalarını atlamaz", () => {
  const world = createWorld("turkey");
  isolate(world, ["turkey-0", "turkey-city-16"]);
  const network = buildRailNetwork(world);
  assert.equal(network.routes.length, 1);
  assert.equal(network.routes[0].ids.length, 2);
  assert.deepEqual(
    new Set(network.routes[0].ids),
    new Set(["turkey-0", "turkey-city-16"]),
  );
});

test("Ray köşesi yumuşatılır; uçlar ve karayla sınırlı güvenli yol korunur", () => {
  const source = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const before = JSON.stringify(source);
  const curve = roundRailCorners(source, () => true);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(curve[0], source[0]);
  assert.deepEqual(curve.at(-1), source.at(-1));
  assert.ok(curve.length > 6 && curve.length <= 22);
  assert.ok(!curve.some((point) => point.x === 10 && point.y === 0));
  const headings = curve
    .slice(1)
    .map((point, index) =>
      Math.atan2(point.y - curve[index].y, point.x - curve[index].x),
    );
  for (let i = 1; i < headings.length; i++)
    assert.ok(Math.abs(headings[i] - headings[i - 1]) < 0.3);
  assert.deepEqual(
    roundRailCorners(source, () => false),
    source,
    "Unsafe coastal fillets retain their original waypoint",
  );
  assert.deepEqual(
    roundRailCorners(source, () => true),
    curve,
  );
  assert.deepEqual(
    roundRailCorners([], () => true),
    [],
  );
});

test("İstasyon yalnız başkentte veya bağlı ikmal merkezinde gösterilir", () => {
  const world = createWorld("turkey");
  isolate(world, ["turkey-0", "turkey-city-16"]);
  world.provinces["turkey-0"].buildings.hub = 0;
  world.provinces["turkey-city-16"].buildings.hub = 0;
  assert.deepEqual(
    buildRailNetwork(world).stations.map((s) => s.province),
    ["turkey-0"],
  );
  world.provinces["turkey-city-16"].buildings.hub = 1;
  assert.deepEqual(
    buildRailNetwork(world).stations.map((s) => s.province),
    ["turkey-0", "turkey-city-16"],
  );
  world.provinces["turkey-city-16"].buildings.rail = 0;
  assert.deepEqual(
    buildRailNetwork(world).stations.map((s) => s.province),
    ["turkey-0"],
  );
});

test("Her iki uçta ray gerekir; başkent veya aradaki ray silinince bağlı ağ güncellenir", () => {
  const world = createWorld("turkey");
  const first = buildRailNetwork(world).edges.find(
    (edge) => edge.from === world.countries.turkey.capital,
  )!;
  isolate(world, [first.from, first.to]);
  assert.equal(buildRailNetwork(world).edges.length, 1);
  world.provinces[first.to].buildings.rail = 0;
  assert.equal(buildRailNetwork(world).edges.length, 0);
  world.provinces[first.to].buildings.rail = 1;
  world.provinces[first.from].buildings.rail = 0;
  assert.deepEqual(buildRailNetwork(world).stations, []);
  assert.deepEqual(buildRailNetwork(world).routes, []);
});

test("Demiryolu erişim hakkına uyar; tarafsız veya düşman kontrolüne geçince bağlantı kalkar", () => {
  const world = createWorld("turkey");
  const first = buildRailNetwork(world).edges.find(
    (edge) => edge.from === world.countries.turkey.capital,
  )!;
  isolate(world, [first.from, first.to]);
  world.provinces[first.to].controller = "bulgaria";
  assert.equal(buildRailNetwork(world).edges.length, 0);
  world.countries.bulgaria.access.push("turkey");
  assert.equal(buildRailNetwork(world).edges.length, 1);
  world.countries.turkey.wars.push("bulgaria");
  world.countries.bulgaria.wars.push("turkey");
  assert.equal(buildRailNetwork(world).edges.length, 0);
  world.provinces[first.from].controller = "bulgaria";
  assert.equal(buildRailNetwork(world).stations.length, 0);
});

test("Dost ve raylı iki liman deniz bağlantısından demiryolu oluşturamaz", () => {
  const world = createWorld("turkey");
  const from = "turkey-2",
    to = "greece-0";
  assert.ok(
    GEOGRAPHY[from].neighbors.some((edge) => edge.id === to && edge.sea),
  );
  world.countries.turkey.capital = from;
  world.provinces[to].controller = "turkey";
  isolate(world, [from, to]);
  const network = buildRailNetwork(world);
  assert.deepEqual(network.edges, []);
  assert.deepEqual(network.routes, []);
  assert.deepEqual(
    network.stations.map((station) => station.province),
    [from],
  );
});

test("İstasyonlar gerçek bölge içinde; ray segmentleri kıyıda suya veya başka bölgeye kestirme yapmaz", () => {
  for (const country of ["turkey", "germany", "uk"]) {
    const world = createWorld(country);
    const network = buildRailNetwork(world);
    for (const station of network.stations)
      assert.ok(
        containsProvincePoint(
          station.province,
          station.point.x,
          station.point.y,
        ),
        station.province,
      );
    for (const edge of network.edges) {
      assert.ok(
        GEOGRAPHY[edge.from].neighbors.some((e) => e.id === edge.to && !e.sea),
      );
      assert.ok(world.provinces[edge.from].buildings.rail > 0);
      assert.ok(world.provinces[edge.to].buildings.rail > 0);
      for (let index = 1; index < edge.points.length; index++) {
        const a = edge.points[index - 1],
          b = edge.points[index];
        const samples = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25);
        for (let i = 0; i <= samples; i++) {
          const x = a.x + ((b.x - a.x) * i) / samples;
          const y = a.y + ((b.y - a.y) * i) / samples;
          assert.ok(
            containsProvincePoint(edge.from, x, y) ||
              containsProvincePoint(edge.to, x, y),
            `${edge.from}→${edge.to}: ${x},${y}`,
          );
        }
      }
    }
  }
});

test("Tren konumu mesafeyi uçlarda sınırlar, köşeleri izler ve sonlu yön üretir", () => {
  const route = {
    ids: ["a", "b"],
    points: [
      { x: 2, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 6 },
    ],
    length: 7,
  };
  assert.deepEqual(railPointAt(route, -100), { x: 2, y: 3, heading: 0 });
  assert.deepEqual(railPointAt(route, 2), { x: 4, y: 3, heading: 0 });
  assert.deepEqual(railPointAt(route, 5), { x: 6, y: 4, heading: Math.PI / 2 });
  assert.deepEqual(railPointAt(route, 100), {
    x: 6,
    y: 6,
    heading: Math.PI / 2,
  });
  for (const value of [NaN, Infinity, -Infinity, 0, 7]) {
    const point = railPointAt(route, value);
    assert.ok(
      Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.heading),
    );
  }
  for (const actual of buildRailNetwork(createWorld("turkey")).routes)
    for (let i = 0; i <= 20; i++) {
      const point = railPointAt(actual, (actual.length * i) / 20);
      assert.ok(
        actual.ids.some((id) => containsProvincePoint(id, point.x, point.y)),
      );
      assert.ok(Number.isFinite(point.heading));
    }
});

test("Küresel demiryolları diğer ülkeleri de içerir, fiziksel hatlar tekilleşir ve güzergâhlar adil dağıtılır", () => {
  const world = createWorld("turkey");
  const before = JSON.stringify(world);
  const network = buildGlobalRailNetwork(world);
  assert.equal(JSON.stringify(world), before);
  assert.ok(network.routes.length <= 64);
  assert.ok(network.edges.length < 1500);
  assert.ok(
    network.edges.reduce((sum, edge) => sum + edge.points.length, 0) < 20000,
  );
  assert.equal(
    new Set(network.edges.map((edge) => [edge.from, edge.to].sort().join(":")))
      .size,
    network.edges.length,
  );
  assert.equal(
    new Set(network.stations.map((station) => station.province)).size,
    network.stations.length,
  );
  const served = new Set(network.routes.map((route) => route.country));
  for (const id of Object.keys(world.countries)) {
    if (buildRailNetwork(world, id).routes.length)
      assert.ok(
        served.has(id),
        `${id} gets a route before secondary routes fill the budget`,
      );
  }
  assert.ok(served.has("turkey") && served.has("germany") && served.has("uk"));
  assert.equal(
    served.size,
    Object.keys(world.countries).length,
    "Every initial country has a valid long route or local station track",
  );
  for (const route of network.routes) {
    assert.ok(route.country);
    for (const id of route.ids) {
      assert.ok(world.provinces[id].buildings.rail > 0);
      assert.ok(friendly(world, route.country, world.provinces[id].controller));
    }
    const expected = [];
    if (route.local) {
      assert.equal(route.ids.length, 1);
      const edge = network.edges.find(
        (edge) =>
          edge.local && edge.from === route.ids[0] && edge.to === route.ids[0],
      );
      assert.ok(edge);
      assert.deepEqual(route.points, edge.points);
      continue;
    }
    for (let i = 1; i < route.ids.length; i++) {
      const from = route.ids[i - 1],
        to = route.ids[i];
      const edge = network.edges.find(
        (edge) =>
          (edge.from === from && edge.to === to) ||
          (edge.from === to && edge.to === from),
      );
      assert.ok(edge);
      const part =
        edge.from === from ? edge.points : [...edge.points].reverse();
      expected.push(...(i === 1 ? part : part.slice(1)));
    }
    assert.deepEqual(route.points, expected);
  }
  for (const edge of network.edges)
    for (let j = 1; j < edge.points.length; j++) {
      const a = edge.points[j - 1],
        b = edge.points[j];
      const samples = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.35),
      );
      for (let i = 0; i <= samples; i++) {
        const x = a.x + ((b.x - a.x) * i) / samples,
          y = a.y + ((b.y - a.y) * i) / samples;
        assert.ok(
          containsProvincePoint(edge.from, x, y) ||
            containsProvincePoint(edge.to, x, y),
          `${edge.from}/${edge.to} stays on its actual endpoint provinces`,
        );
      }
    }
});

test("Küresel ağ önbelleği oyuncu, gün, stok ve tümen değişimini dışarıda tutar; yabancı ray ve diplomasi değişimlerini izler", () => {
  const world = createWorld("turkey");
  const signature = railNetworkSignature(world),
    network = buildGlobalRailNetwork(world);
  world.day++;
  world.countries.turkey.treasury += 50;
  world.armies[0].province = world.armies[1].province;
  world.player = "germany";
  assert.equal(railNetworkSignature(world), signature);
  assert.equal(buildGlobalRailNetwork(world), network);
  world.provinces[world.countries.germany.capital].buildings.rail = 0;
  assert.notEqual(railNetworkSignature(world), signature);
  const changed = buildGlobalRailNetwork(world);
  assert.notEqual(changed, network);
  assert.ok(!changed.routes.some((route) => route.country === "germany"));
  const afterRail = railNetworkSignature(world);
  world.countries.france.capital = "france-1";
  assert.notEqual(railNetworkSignature(world), afterRail);
  const afterCapital = railNetworkSignature(world);
  world.countries.france.access.push("germany");
  assert.notEqual(railNetworkSignature(world), afterCapital);
});

test("Başka ülkenin şehirler arası hattı da geçiş iznine ve savaş durumuna uyar; aktif oyuncu değiştirilmez", () => {
  const world = createWorld("turkey");
  const edge = buildRailNetwork(world, "germany").edges.find(
    (edge) => edge.from === world.countries.germany.capital,
  )!;
  isolate(world, [edge.from, edge.to]);
  world.provinces[edge.to].controller = "poland";
  assert.ok(
    !buildGlobalRailNetwork(world).routes.some(
      (route) => route.country === "germany" && !route.local,
    ),
  );
  world.countries.poland.access.push("germany");
  assert.ok(
    buildGlobalRailNetwork(world).routes.some(
      (route) => route.country === "germany" && !route.local,
    ),
  );
  world.countries.germany.wars.push("poland");
  world.countries.poland.wars.push("germany");
  assert.ok(
    !buildGlobalRailNetwork(world).routes.some(
      (route) => route.country === "germany" && !route.local,
    ),
  );
  assert.equal(world.player, "turkey");
});

test("Tek eyalet ve ada başkentlerinde yerel istasyon hattının bütün genişliği gerçek karanın içindedir", () => {
  const world = createWorld("turkey");
  const before = JSON.stringify(world),
    network = buildGlobalRailNetwork(world);
  const local = network.routes.filter((route) => route.local);
  assert.deepEqual(local.map((route) => route.country).sort(), [
    "denmark",
    "estonia",
    "luxembourg",
  ]);
  for (const route of local) {
    assert.equal(route.ids.length, 1);
    assert.equal(route.ids[0], world.countries[route.country!].capital);
    assert.ok(world.provinces[route.ids[0]].buildings.rail > 0);
    assert.ok(route.length >= 11);
    const a = route.points[0],
      b = route.points.at(-1)!;
    const ux = (b.x - a.x) / route.length,
      uy = (b.y - a.y) / route.length;
    for (let along = 0; along <= route.length; along += 0.25)
      for (let across = -1.8; across <= 1.8; across += 0.2)
        assert.ok(
          containsProvincePoint(
            route.ids[0],
            a.x + ux * along - uy * across,
            a.y + uy * along + ux * across,
          ),
        );
    const edge = network.edges.find(
      (edge) => edge.local && edge.from === route.ids[0],
    );
    assert.ok(edge);
    assert.equal(
      edge.from,
      edge.to,
      "No fabricated neighbor or foreign crossing",
    );
  }
  assert.equal(JSON.stringify(world), before);
  world.provinces[world.countries.luxembourg.capital].buildings.rail = 0;
  assert.ok(
    !buildGlobalRailNetwork(world).routes.some(
      (route) => route.country === "luxembourg",
    ),
  );
});
