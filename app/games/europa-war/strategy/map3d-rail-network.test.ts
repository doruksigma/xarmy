import assert from "node:assert/strict";
import { test } from "node:test";
import { containsProvincePoint } from "./map3d-geometry";
import {
  buildPlayerRailNetwork,
  cartographicRailSeams,
  findRailSeamRepairs,
  railEdgeContainsPoint,
  buildRailNetwork,
  playerRailNetworkSignature,
  railPointAt,
  roundRailCorners,
} from "./map3d-rail-network";
import { createWorld, GEOGRAPHY } from "./world";
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

test("Müttefik ve geçiş izni olan yabancı raylar da gizlidir; yalnız doğrudan kontrol bağlantıyı açar", () => {
  const world = createWorld("turkey");
  const first = buildRailNetwork(world).edges.find(
    (edge) => edge.from === world.countries.turkey.capital,
  )!;
  isolate(world, [first.from, first.to]);
  world.provinces[first.to].controller = "bulgaria";
  assert.equal(buildRailNetwork(world).edges.length, 0);
  world.countries.bulgaria.access.push("turkey");
  world.countries.turkey.allies.push("bulgaria");
  world.countries.bulgaria.subjectOf = "turkey";
  assert.equal(buildRailNetwork(world).edges.length, 0);
  world.countries.turkey.wars.push("bulgaria");
  world.countries.bulgaria.wars.push("turkey");
  assert.equal(buildRailNetwork(world).edges.length, 0);
  world.provinces[first.to].controller = "turkey";
  assert.equal(buildRailNetwork(world).edges.length, 1);
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
            railEdgeContainsPoint(edge, { x, y }),
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

test("Canlı ağ yalnız oyuncunun başkentine bağlı kendi raylarını gösterir; yerel süs hatları yoktur", () => {
  const world = createWorld("turkey"),
    before = JSON.stringify(world),
    network = buildPlayerRailNetwork(world);
  assert.equal(JSON.stringify(world), before);
  assert.ok(network.routes.length > 0);
  for (const edge of network.edges) {
    assert.equal(world.provinces[edge.from].controller, world.player);
    assert.equal(world.provinces[edge.to].controller, world.player);
    assert.notEqual(edge.from, edge.to);
    assert.ok(!edge.local);
  }
  for (const route of network.routes) {
    assert.equal(route.country, world.player);
    assert.ok(!route.local);
  }
  isolate(world, ["turkey-0"]);
  assert.deepEqual(buildPlayerRailNetwork(world).edges, []);
  assert.deepEqual(buildPlayerRailNetwork(world).routes, []);
  const tiny = createWorld("luxembourg");
  assert.deepEqual(buildPlayerRailNetwork(tiny).edges, []);
  assert.deepEqual(buildPlayerRailNetwork(tiny).routes, []);
});

test("İşgal edilen kopuk cep gizli kalır; koridor ele geçirilince bağlanır, kaybedilince kesilir ve geri alınınca açılır", () => {
  const world = createWorld("turkey"),
    capital = "turkey-0",
    corridor = "turkey-city-16",
    pocket = "turkey-city-17";
  isolate(world, [capital, corridor, pocket]);
  world.provinces[corridor].controller = "bulgaria";
  world.provinces[pocket].controller = "bulgaria";
  world.provinces[pocket].buildings.hub = 1;
  const isolatedSignature = playerRailNetworkSignature(world);
  world.provinces[pocket].controller = "turkey";
  assert.equal(playerRailNetworkSignature(world), isolatedSignature);
  assert.equal(buildPlayerRailNetwork(world).edges.length, 0);
  assert.ok(
    !buildPlayerRailNetwork(world).stations.some(
      (station) => station.province === pocket,
    ),
  );
  world.countries.bulgaria.access.push("turkey");
  world.countries.turkey.allies.push("bulgaria");
  assert.equal(playerRailNetworkSignature(world), isolatedSignature);
  world.provinces[corridor].controller = "turkey";
  const connectedSignature = playerRailNetworkSignature(world);
  assert.notEqual(connectedSignature, isolatedSignature);
  assert.equal(buildPlayerRailNetwork(world).edges.length, 2);
  assert.ok(
    buildPlayerRailNetwork(world).stations.some(
      (station) => station.province === pocket,
    ),
  );
  world.provinces[corridor].controller = "bulgaria";
  assert.equal(playerRailNetworkSignature(world), isolatedSignature);
  assert.equal(buildPlayerRailNetwork(world).routes.length, 0);
  world.provinces[corridor].controller = "turkey";
  assert.equal(playerRailNetworkSignature(world), connectedSignature);
  world.provinces[corridor].buildings.rail = 0;
  assert.equal(buildPlayerRailNetwork(world).edges.length, 0);
  world.provinces[corridor].buildings.rail = 1;
  assert.equal(playerRailNetworkSignature(world), connectedSignature);
  world.provinces[capital].controller = "bulgaria";
  assert.deepEqual(buildPlayerRailNetwork(world).edges, []);
  assert.deepEqual(buildPlayerRailNetwork(world).stations, []);
});

test("Oyuncu ağının önbelleği gün, stok, tümen ve yabancı değişimlerden etkilenmez", () => {
  const world = createWorld("turkey"),
    network = buildPlayerRailNetwork(world),
    signature = playerRailNetworkSignature(world);
  world.day++;
  world.countries.turkey.treasury += 100;
  world.armies[0].province = world.armies[1].province;
  world.countries.france.capital = "france-1";
  world.provinces["france-0"].controller = "germany";
  world.provinces["germany-0"].buildings.rail = 0;
  world.countries.bulgaria.access.push("turkey");
  assert.equal(playerRailNetworkSignature(world), signature);
  assert.equal(buildPlayerRailNetwork(world), network);
  world.player = "germany";
  assert.notEqual(playerRailNetworkSignature(world), signature);
});

test("Şehir kavşaklarında bütün hat uçları aynı kesin koordinatı kullanır", () => {
  const world = createWorld("turkey"),
    network = buildPlayerRailNetwork(world),
    anchors = new Map<string, { x: number; y: number }>();
  for (const edge of network.edges)
    for (const [id, point] of [
      [edge.from, edge.points[0]],
      [edge.to, edge.points.at(-1)!],
    ] as const) {
      if (anchors.has(id)) assert.deepEqual(point, anchors.get(id));
      else anchors.set(id, point);
    }
  for (const station of network.stations)
    assert.deepEqual(station.point, anchors.get(station.province));
});

test("Yalnız 0,15 birime kadar bitişik yuvarlama yarıkları onarılır; geniş su, delik ve üçüncü bölge doldurulmaz", () => {
  const a0 = { x: 5, y: 0 },
    a1 = { x: 5, y: 10 };
  const make = (gap: number, adjacent = true, blocked = () => false) =>
    cartographicRailSeams(
      a0,
      a1,
      { x: 5 + gap, y: 10 },
      { x: 5 + gap, y: 0 },
      {
        adjacent,
        landA: (p) => p.x <= 5 && p.y >= 0 && p.y <= 10,
        landB: (p) => p.x >= 5 + gap && p.y >= 0 && p.y <= 10,
        blocked,
      },
    );
  const seams = make(0.1);
  assert.equal(seams.length, 1);
  assert.ok(seams[0].maxGap <= 0.15);
  assert.deepEqual(make(0.151), []);
  assert.deepEqual(make(2), []);
  assert.deepEqual(make(0.1, false), []);
  assert.deepEqual(
    make(0.1, true, () => true),
    [],
  );
  assert.deepEqual(findRailSeamRepairs("turkey-2", "greece-0"), []);
  assert.deepEqual(findRailSeamRepairs("turkey-0", "germany-0"), []);
  const blockers = [
    [
      { x: 4.9, y: 1.9 },
      { x: 5.2, y: 1.9 },
      { x: 5.2, y: 2.1 },
      { x: 4.9, y: 2.1 },
    ],
    [
      { x: 5.02, y: 1.9 },
      { x: 5.08, y: 1.9 },
      { x: 5.08, y: 2.1 },
      { x: 5.02, y: 2.1 },
    ],
    [
      { x: 5, y: 1.9 },
      { x: 5.1, y: 1.9 },
      { x: 5.1, y: 2.1 },
      { x: 5, y: 2.1 },
    ],
    [
      { x: 5, y: 0 },
      { x: 5.1, y: 0 },
      { x: 5.1, y: 10 },
      { x: 5, y: 10 },
    ],
  ];
  for (const blocker of blockers)
    assert.deepEqual(
      cartographicRailSeams(
        a0,
        a1,
        { x: 5.1, y: 10 },
        { x: 5.1, y: 0 },
        {
          adjacent: true,
          landA: (p) => p.x <= 5,
          landB: (p) => p.x >= 5.1,
          blockers: [blocker],
        },
      ),
      [],
      "A thin third-province stripe or hole between probe locations rejects the entire repair",
    );
  const ankaraKonya = findRailSeamRepairs("turkey-0", "turkey-4");
  assert.ok(
    ankaraKonya.length > 0 && ankaraKonya.every((seam) => seam.maxGap < 0.04),
  );
});

test("Tallinn–Tartu sayısal sınır yarığı bağlanır; gerçek güzergâh yalnız kara veya belirtilen dar onarım şeridindedir", () => {
  const world = createWorld("estonia");
  isolate(world, ["estonia-0", "estonia-1"]);
  const network = buildPlayerRailNetwork(world);
  assert.equal(network.edges.length, 1);
  assert.equal(network.repairedConnections, 1);
  assert.ok(network.edges[0].seams?.length);
  assert.ok(
    network.edges[0].seams!.every((seam) => seam.maxGap <= 0.15 + 1e-9),
  );
  const edge = network.edges[0];
  for (let j = 1; j < edge.points.length; j++) {
    const a = edge.points[j - 1],
      b = edge.points[j],
      samples = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.01);
    for (let i = 0; i <= samples; i++)
      assert.ok(
        railEdgeContainsPoint(edge, {
          x: a.x + ((b.x - a.x) * i) / samples,
          y: a.y + ((b.y - a.y) * i) / samples,
        }),
      );
  }
});
