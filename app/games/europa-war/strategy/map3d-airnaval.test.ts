import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { airNavalDay } from "./airnaval";
import { SEA_ZONES } from "./advanced-catalog";
import { createAirNavalVisuals } from "./map3d-airnaval";
import { createAirNavalGeometry } from "./map3d-airnaval-models";
import {
  airNavalUnits,
  detectAirNavalOutcomes,
  type AirNavalModel,
} from "./map3d-airnaval-state";
import { createWorld, GEOGRAPHY, MAP } from "./world";
import type { AirWing, Equipment, Warship, World } from "./types";

function wing(
  id: string,
  base: string,
  target: string,
  mission: AirWing["mission"] = "superiority",
  model: AirWing["model"] = "fighter",
): AirWing {
  return {
    id,
    name: id,
    base,
    target,
    mission,
    model,
    count: 20,
    size: 20,
    readiness: 100,
    experience: 0,
  };
}
function ship(id: string, port: string): Warship {
  return {
    id,
    name: id,
    model: "ship",
    port,
    zone: "black",
    mission: "patrol",
    transit: 0,
    health: 100,
    aircraft: 0,
    experience: 0,
  };
}
function battle() {
  const before = createWorld("turkey");
  before.hour = 23;
  for (const country of Object.values(before.countries)) {
    country.air.wings = [];
    country.navy.ships = [];
    country.stock.fuel = 10000;
    country.intel = {};
    country.allies = [];
    for (const equipment of Object.keys(country.equipment) as Equipment[])
      country.equipment[equipment] = 0;
  }
  const turkey = before.countries.turkey,
    bulgaria = before.countries.bulgaria;
  turkey.wars = ["bulgaria"];
  bulgaria.wars = ["turkey"];
  before.provinces["turkey-0"].buildings.airfield = 3;
  before.provinces["bulgaria-2"].buildings.airfield = 3;
  turkey.air.wings = [
    wing("own-fighter", "turkey-0", "bulgaria-2"),
    wing(
      "own-bomber",
      "turkey-0",
      "bulgaria-2",
      "strategic",
      "strategicBomber",
    ),
  ];
  bulgaria.air.wings = [wing("enemy-fighter", "bulgaria-2", "bulgaria-2")];
  turkey.navy.ships = [ship("own-ship", "turkey-1")];
  bulgaria.navy.ships = [ship("enemy-ship", "bulgaria-2")];
  return before;
}
function settle(before: World) {
  const after = structuredClone(before);
  after.day++;
  after.hour = 0;
  airNavalDay(after);
  return after;
}

test("Uçak mini modelleri küçülür; kanadın gerçek gücü ve askerî özellikleri değişmez", () => {
  const world = battle(),
    original = structuredClone(world);
  const units = airNavalUnits(world).filter((unit) => unit.airborne);
  assert.equal(units.find((unit) => unit.id === "own-fighter")?.scale, 0.55);
  assert.equal(units.find((unit) => unit.id === "own-bomber")?.scale, 0.62);
  assert.deepEqual(world, original);
});

test("Tarih çizgisinden geçen uçak kısa Pasifik yolunda kalır, tüm haritayı aşmaz", () => {
  const originalWidth = MAP.width;
  const base = GEOGRAPHY["turkey-0"],
    target = GEOGRAPHY["bulgaria-2"];
  const oldBase = { x: base.x, y: base.y },
    oldTarget = { x: target.x, y: target.y };
  const scene = new THREE.Scene(),
    visuals = createAirNavalVisuals(scene, () => 0);
  try {
    MAP.width = Math.max(MAP.width, 5400);
    Object.assign(base, { x: MAP.width - 20, y: 800 });
    Object.assign(target, { x: 20, y: 800 });
    const world = battle();
    world.countries.turkey.air.wings = [
      wing("dateline-visual", base.id, target.id),
    ];
    world.countries.bulgaria.air.wings = [];
    visuals.update(world);
    for (let frame = 0; frame < 90; frame++) {
      visuals.animate(frame * 200, { quality: "low" });
      const aircraft = visuals
        .stats()
        .positions.find((position) => position.id === "dateline-visual");
      assert.ok(aircraft);
      const x = aircraft.x + MAP.width / 2;
      assert.ok(x >= 0 && x < MAP.width);
      assert.ok(x < 60 || x > MAP.width - 60, `plane crossed inland: ${x}`);
    }
  } finally {
    MAP.width = originalWidth;
    Object.assign(base, oldBase);
    Object.assign(target, oldTarget);
    visuals.dispose();
  }
});

test("Ardışık üretilen filo kimlikleri aynı devriye noktasına yığılmaz; kayıt ve sefer rastgeleliği korunur", () => {
  const world = battle();
  const turkey = world.countries.turkey;
  turkey.air.wings = [194, 195, 196].map((id) =>
    wing(`wing-${id}`, "turkey-0", "bulgaria-2"),
  );
  turkey.navy.ships = [197, 198].map((id) => ship(`ship-${id}`, "turkey-1"));
  const original = structuredClone(world);
  const units = airNavalUnits(world);
  for (const prefix of ["wing-", "ship-"]) {
    const phases = units
      .filter((unit) => unit.id.startsWith(prefix))
      .map((unit) => unit.phase);
    assert.ok(phases.length >= 2);
    for (let i = 0; i < phases.length; i++) {
      assert.ok(phases[i] >= 0 && phases[i] < 1);
      for (let j = i + 1; j < phases.length; j++) {
        const distance = Math.abs(phases[i] - phases[j]);
        assert.ok(
          Math.min(distance, 1 - distance) > 0.05,
          `${prefix} formation phases should not cluster`,
        );
      }
    }
  }
  assert.deepEqual(airNavalUnits(structuredClone(world)), units);
  assert.deepEqual(world, original);
});

test("Gerçek hava ve deniz çözümü hasar verdiğinde görünür it dalaşı, bombardıman ve gemi isabetleri üretilir", () => {
  const before = battle(),
    after = settle(before);
  const original = structuredClone({ before, after });
  const outcomes = detectAirNavalOutcomes(before, after);
  for (const kind of ["dogfight", "bombing", "naval"])
    assert.ok(
      outcomes.some((event) => event.kind === kind && event.loss > 0),
      kind,
    );
  for (const event of outcomes.filter((outcome) => outcome.kind === "naval"))
    assert.deepEqual(event.to, { x: SEA_ZONES.black.x, y: SEA_ZONES.black.y });
  assert.deepEqual({ before, after }, original);
  assert.deepEqual(detectAirNavalOutcomes(before, after), outcomes);
});

test("Komut, duraklama, geri yükleme ve kopuk zaman atlamaları sahte savaş efekti üretmez", () => {
  const before = battle(),
    after = settle(before);
  assert.deepEqual(detectAirNavalOutcomes(null, after), []);
  assert.deepEqual(detectAirNavalOutcomes(before, before), []);
  const command = structuredClone(after);
  command.day = before.day;
  command.hour = before.hour;
  assert.deepEqual(detectAirNavalOutcomes(before, command), []);
  assert.deepEqual(detectAirNavalOutcomes(after, before), []);
  after.day += 20;
  assert.deepEqual(detectAirNavalOutcomes(before, after), []);
});

test("İkmal limanı veya boğaz kaybının yıpranması deniz muharebesi sayılmaz", () => {
  const before = battle();
  before.countries.turkey.air.wings = [];
  before.countries.bulgaria.air.wings = [];
  before.countries.turkey.navy.ships[0].port = "turkey-2";
  const after = structuredClone(before);
  after.day++;
  after.hour = 0;
  after.provinces["turkey-1"].controller = "bulgaria";
  airNavalDay(after);
  assert.ok(after.countries.turkey.navy.ships[0].health < 100);
  assert.ok(
    !detectAirNavalOutcomes(before, after).some(
      (event) => event.targetId === "own-ship",
    ),
  );
});

test("Yakıtı olmayan düşman gemisine gerçek hava saldırısı görünür; ilgisiz yıpranma görünmez", () => {
  const before = battle();
  before.countries.turkey.air.wings = [
    wing("naval-bomber", "turkey-0", "bulgaria-2", "naval", "bomber"),
  ];
  before.countries.bulgaria.air.wings = [];
  before.countries.turkey.navy.ships = [];
  before.countries.bulgaria.stock.fuel = 0;
  assert.ok(
    detectAirNavalOutcomes(before, settle(before)).some(
      (event) => event.kind === "navalStrike",
    ),
  );
});

test("Önceki geminin tükettiği ortak yakıt, son gemiye sahte deniz ateşi yazmaz", () => {
  const before = battle();
  before.countries = Object.fromEntries([
    ["turkey", before.countries.turkey],
    ...Object.entries(before.countries).filter(([id]) => id !== "turkey"),
  ]);
  const turkey = before.countries.turkey,
    bulgaria = before.countries.bulgaria;
  turkey.air.wings = [];
  turkey.navy.ships.push(ship("fuel-starved-second", "turkey-1"));
  turkey.stock.fuel = 0.5;
  bulgaria.air.wings = [
    wing("enemy-naval-bomber", "bulgaria-2", "turkey-1", "naval", "bomber"),
  ];
  const after = settle(before);
  const second = after.countries.turkey.navy.ships.find(
    (item) => item.id === "fuel-starved-second",
  )!;
  assert.ok(second.health < 100);
  assert.equal(second.experience, 0);
  const outcome = detectAirNavalOutcomes(before, after).find(
    (item) => item.targetId === second.id,
  );
  assert.equal(outcome?.kind, "navalStrike");
  assert.equal(outcome?.sourceId, "enemy-naval-bomber");
});

test("Uzak gizli düşman hangarları ve donanmaları gösterilmez; istihbarat süresi dolunca gizlenir", () => {
  const world = battle();
  world.countries.germany.air.wings = [
    wing("hidden-plane", "germany-0", "germany-0", "idle"),
  ];
  world.countries.germany.navy.ships = [
    { ...ship("hidden-ship", "germany-1"), zone: "north", mission: "idle" },
  ];
  assert.ok(!airNavalUnits(world).some((unit) => unit.country === "germany"));
  world.countries.turkey.intel.germany = { level: 80, expires: world.day + 1 };
  assert.equal(
    airNavalUnits(world).filter((unit) => unit.country === "germany").length,
    2,
  );
  world.day++;
  assert.ok(!airNavalUnits(world).some((unit) => unit.country === "germany"));
  const observed = airNavalUnits(world).find(
    (unit) => unit.id === "enemy-fighter",
  );
  if (observed)
    assert.deepEqual(
      observed.from,
      observed.target,
      "Temas uzaktaki üssün konumunu açmaz",
    );
});

test("Gerçek gemi teması yalnız ortak deniz bölgesindeki operasyonel düşmanı gösterir", () => {
  const world = battle();
  assert.ok(airNavalUnits(world).some((unit) => unit.id === "enemy-ship"));
  world.countries.bulgaria.navy.ships[0].zone = "atlantic";
  assert.ok(!airNavalUnits(world).some((unit) => unit.id === "enemy-ship"));
});

test("Özgün uçak ve gemi modelleri sonlu detaylı geometrilere sahiptir", () => {
  for (const kind of [
    "fighter",
    "bomber",
    "ship",
    "carrier",
    "submarine",
  ] as AirNavalModel[]) {
    const geometry = createAirNavalGeometry(kind);
    const positions = geometry.getAttribute("position");
    assert.ok(positions.count > 500, kind);
    assert.equal(geometry.getAttribute("color").count, positions.count);
    assert.ok(Array.from(positions.array).every(Number.isFinite));
    assert.ok(geometry.boundingSphere!.radius > 8);
    geometry.dispose();
  }
});

test("Sahne duraklatılınca veya azaltılmış hareket seçilince araçlar ve isabetler donar; havuzlar temizlenir", () => {
  const world = battle(),
    after = settle(world),
    scene = new THREE.Scene();
  const visuals = createAirNavalVisuals(scene, () => 0);
  const saved = structuredClone({ world, after });
  visuals.update(world);
  visuals.animate(0, { quality: "high" });
  visuals.update(after);
  visuals.animate(100, { quality: "high" });
  assert.ok(visuals.stats().aircraft > 0 && visuals.stats().ships > 0);
  assert.ok(
    visuals.stats().airCombats > 0 &&
      visuals.stats().navalCombats > 0 &&
      visuals.stats().bombingRuns > 0,
  );
  const frozen = visuals.stats();
  visuals.animate(700, { quality: "high", paused: true });
  assert.deepEqual(visuals.stats(), frozen);
  visuals.animate(1300, { quality: "high", reduced: true });
  assert.deepEqual(visuals.stats(), frozen);
  visuals.animate(1400, { quality: "high" });
  assert.deepEqual(
    visuals.stats(),
    frozen,
    "Devam ilk karesinde duraklama süresini animasyona eklemez",
  );
  visuals.animate(1500, { quality: "high" });
  assert.notDeepEqual(visuals.stats().positions, frozen.positions);
  for (let frame = 0; frame < 45; frame++)
    visuals.animate(1500 + frame * 100, { quality: "high" });
  assert.equal(visuals.stats().effects, 0);
  assert.deepEqual({ world, after }, saved);
  visuals.dispose();
  visuals.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(visuals.animate(9999, { quality: "high" }), false);
});

test("Her çizimden önce saatlik anlık görüntü gelmesi düşük FPS'te animasyon saatini sıfırlamaz", () => {
  let world = battle();
  world.hour = 1;
  const scene = new THREE.Scene(),
    visuals = createAirNavalVisuals(scene, () => 0);
  visuals.update(world);
  visuals.animate(0, { quality: "high" });
  const initial = visuals.stats();
  for (let frame = 1; frame <= 6; frame++) {
    world = structuredClone(world);
    world.hour++;
    visuals.update(world);
    visuals.animate(frame * 1000, { quality: "high" });
  }
  assert.ok(visuals.stats().animationTime > initial.animationTime);
  assert.notDeepEqual(visuals.stats().positions, initial.positions);
  const frozen = visuals.stats();
  for (let frame = 7; frame <= 8; frame++) {
    world = structuredClone(world);
    world.hour++;
    visuals.update(world);
    visuals.animate(frame * 1000, { quality: "high", paused: true });
    assert.equal(visuals.stats().animationTime, frozen.animationTime);
    assert.deepEqual(visuals.stats().positions, frozen.positions);
  }
  visuals.dispose();
});

test("Düşük kalite miniatur ve efekt havuzlarını sınırlar, oyuncunun araçları önce seçilir", () => {
  const world = battle();
  const first = world.countries.turkey.air.wings[0];
  world.countries.turkey.air.wings = Array.from({ length: 80 }, (_, index) => ({
    ...first,
    id: `own-wing-${index}`,
  }));
  world.provinces[first.base].buildings.airfield = 20;
  const vessel = world.countries.turkey.navy.ships[0];
  world.countries.turkey.navy.ships = Array.from(
    { length: 80 },
    (_, index) => ({ ...vessel, id: `own-ship-${index}` }),
  );
  const scene = new THREE.Scene(),
    visuals = createAirNavalVisuals(scene, () => 0);
  visuals.update(world);
  visuals.animate(0, { quality: "low", paused: true });
  assert.equal(visuals.stats().aircraft, 40);
  assert.equal(visuals.stats().ships, 48);
  assert.ok(
    visuals.stats().positions.every((entry) => entry.id.startsWith("own-")),
  );
  assert.ok(
    visuals
      .stats()
      .positions.every((entry) => Number.isFinite(entry.x + entry.y + entry.z)),
  );
  visuals.dispose();
  assert.equal(GEOGRAPHY[first.target].country, "bulgaria");
});
