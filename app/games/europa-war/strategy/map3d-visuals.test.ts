import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceDay } from "./engine";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import {
  armyMapPosition,
  GRAPHICS_QUALITY,
  visibleFormations,
  visualRandom,
  visualSeed,
} from "./map3d-visuals";

test("3D sahne rastgeleliği ve kalite hesapları kayıtlı dünyanın sonucunu değiştirmez", () => {
  const world = createWorld("turkey", "historical", 90210);
  const before = structuredClone(world);
  for (const quality of Object.values(GRAPHICS_QUALITY)) {
    assert.ok(quality.pixelRatio > 0);
    for (const army of world.armies) {
      armyMapPosition(army);
      const random = visualRandom(visualSeed(army.id));
      for (let i = 0; i < 50; i++) random();
    }
    visibleFormations(world);
  }
  assert.deepEqual(world, before);
  assert.deepEqual(advanceDay(world), advanceDay(before));
});

test("3D sahne uzak gizli birlikleri göstermez; ittifak ve süreli istihbarat görünürlüğü açar", () => {
  const world = createWorld("turkey", "historical");
  world.armies = [];
  const own = addArmy(world, "turkey", world.countries.turkey.capital);
  const secret = addArmy(world, "germany", world.countries.germany.capital);
  const ally = addArmy(world, "france", world.countries.france.capital);
  const ids = () =>
    visibleFormations(world)
      .flat()
      .map((a) => a.id)
      .sort();
  assert.deepEqual(ids(), [own.id]);
  world.countries.turkey.allies.push("france");
  assert.deepEqual(ids(), [own.id, ally.id].sort());
  world.countries.turkey.intel.germany = { level: 40, expires: world.day + 3 };
  assert.ok(ids().includes(secret.id));
  world.day += 3;
  assert.ok(!ids().includes(secret.id));
});

test("Sınır komşuluğundaki görülebilir düşman 3D işaretinde yer alır", () => {
  const world = createWorld("turkey", "historical");
  world.armies = [];
  const edge = Object.values(GEOGRAPHY).find(
    (p) =>
      world.provinces[p.id].controller === "bulgaria" &&
      p.neighbors.some((n) => world.provinces[n.id].controller === "turkey"),
  )!;
  const seen = addArmy(world, "bulgaria", edge.id);
  assert.ok(
    visibleFormations(world)
      .flat()
      .some((a) => a.id === seen.id),
  );
});

test("Aynı bölgede farklı hedeflere yürüyen 3D oluşumlar tek hareketmiş gibi birleşmez", () => {
  const world = createWorld("turkey", "historical");
  world.armies = [];
  const origin = world.countries.turkey.capital;
  const targets = GEOGRAPHY[origin].neighbors.filter((e) => !e.sea).slice(0, 2);
  assert.equal(targets.length, 2);
  const units = Array.from({ length: 3 }, () =>
    addArmy(world, "turkey", origin),
  );
  units[0].move = { to: targets[0].id, progress: 0.5, days: 2 };
  units[1].move = { to: targets[1].id, progress: 0.5, days: 2 };
  assert.equal(visibleFormations(world).length, 3);
  units[2].move = { ...units[0].move };
  assert.deepEqual(
    visibleFormations(world)
      .map((g) => g.length)
      .sort(),
    [1, 2],
  );
});

test("3D tümen yürüyüşü simülasyon ilerlemesini kullanır ve kontrol değişiminden önce hedefe varmaz", () => {
  const world = createWorld("turkey", "historical");
  const army = world.armies.find((a) => a.country === "turkey")!;
  const from = GEOGRAPHY[army.province];
  const to = GEOGRAPHY[from.neighbors.find((e) => !e.sea)!.id];
  army.move = { to: to.id, days: 4, progress: 2 };
  const original = structuredClone(army);
  assert.deepEqual(armyMapPosition(army), {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  });
  assert.deepEqual(army, original);
  army.move.progress = 100;
  const near = armyMapPosition(army);
  assert.ok(Math.hypot(near.x - to.x, near.y - to.y) > 0);
  army.move = null;
  army.province = to.id;
  assert.deepEqual(armyMapPosition(army), { x: to.x, y: to.y });
});
