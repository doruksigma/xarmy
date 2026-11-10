import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, GEOGRAPHY, MAP } from "./world";
import { applyAction } from "./engine";
import { declareWar } from "./diplomacy";
import { resolveLandDay } from "./land";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { BUILDINGS } from "./catalog";
import europeanSave from "./fixtures/europe-v3-before-world.json";
import legacyEurope from "./legacy-europe-map.json";
import type { Building, World } from "./types";

const oldProvinceIds = new Set(legacyEurope.provinceIds);
const oldCities = MAP.provinces.filter((p) => oldProvinceIds.has(p.id));
const parents = legacyEurope.regionalIds;
function regionalFixture() {
  // A regional save predates world-map expansion. Starting with a fresh global
  // campaign would incorrectly give the old save new countries and colonies.
  const w = structuredClone(europeanSave.world) as unknown as World;
  for (const parent of parents) {
    const cities = oldCities.filter((p) => p.legacyRegion === parent);
    for (const b of Object.keys(BUILDINGS) as Building[]) {
      if (b === "infra" || b === "rail") continue;
      w.provinces[parent].buildings[b] = cities.reduce(
        (n, p) => n + w.provinces[p.id].buildings[b],
        0,
      );
    }
    for (const p of cities) if (p.id !== parent) delete w.provinces[p.id];
  }
  const region = (id: string) => GEOGRAPHY[id].legacyRegion;
  for (const a of w.armies) {
    a.province = region(a.province);
    if (a.move) a.move.to = region(a.move.to);
    a.route = a.route.map(region);
  }
  for (const c of Object.values(w.countries)) {
    c.capital = region(c.capital);
    for (const queued of [...c.construction, ...c.recruitment])
      queued.province = region(queued.province);
    for (const general of c.generals)
      if (general.front)
        for (const [army, province] of Object.entries(
          general.front.assignments,
        ))
          general.front.assignments[army] = region(province);
    for (const a of c.air.wings) {
      a.base = region(a.base);
      a.target = region(a.target);
    }
    for (const s of c.navy.ships) s.port = region(s.port);
  }
  for (const battle of w.battles) battle.province = region(battle.province);
  for (const front of w.fronts)
    front.provinces = [...new Set(front.provinces.map(region))];
  for (const plan of w.plans)
    plan.objectives = [...new Set(plan.objectives.map(region))];
  for (const conference of w.conferences) {
    conference.available = [...new Set(conference.available.map(region))];
    for (const award of conference.awards)
      award.province = region(award.province);
  }
  return w;
}
function totals(w: World) {
  return Object.fromEntries(
    legacyEurope.countryIds.map((id) => [
      id,
      Object.fromEntries(
        (Object.keys(BUILDINGS) as Building[])
          .filter((b) => b !== "infra" && b !== "rail")
          .map((b) => [
            b,
            Object.values(w.provinces)
              .filter((p) => oldProvinceIds.has(p.id) && p.owner === id)
              .reduce((n, p) => n + p.buildings[b], 0),
          ]),
      ),
    ]),
  );
}

test("Eski Avrupa'nın 447 şehrinin ayrı sınırları ve simetrik bağlantıları dünya haritasında korunur", () => {
  const w = createWorld("turkey");
  assert.equal(legacyEurope.countryIds.length, 29);
  assert.equal(Object.keys(europeanSave.world.provinces).length, 447);
  assert.equal(oldCities.length, 447);
  assert.equal(parents.length, 144);
  assert.equal(new Set(oldCities.map((p) => p.path)).size, 447);
  for (const p of oldCities) {
    assert.ok(p.path.startsWith("M") && p.path.endsWith("Z"));
    assert.ok(w.provinces[p.id]);
    assert.ok(GEOGRAPHY[p.legacyRegion]);
    assert.ok(p.neighbors.length > 0);
    // The archival atlas remains intact; runtime adjacency corrects old
    // across-water "land" edges, so check each graph against itself.
    for (const e of p.neighbors)
      assert.ok(
        MAP.provinces
          .find((other) => other.id === e.id)!
          .neighbors.some((back) => back.id === p.id && back.sea === e.sea),
      );
    for (const e of GEOGRAPHY[p.id].neighbors)
      assert.ok(
        GEOGRAPHY[e.id].neighbors.some(
          (back) => back.id === p.id && back.sea === e.sea,
        ),
      );
  }
  for (const country of legacyEurope.countryIds) {
    const cities = Object.values(w.provinces).filter(
      (p) => oldProvinceIds.has(p.id) && p.owner === country,
    );
    assert.equal(
      cities.reduce((n, p) => n + p.buildings.refinery, 0),
      1,
    );
    assert.equal(
      cities.reduce((n, p) => n + p.buildings.hub, 0),
      1,
    );
  }
});

test("Yeni şehri ele geçirmek aynı eski bölgenin diğer şehirlerini ele geçirmez", () => {
  let w = createWorld("germany");
  declareWar(w, "germany", "turkey");
  const target = MAP.provinces.find((p) => p.name === "Eskişehir")!;
  const source = target.neighbors.find(
    (e) => !e.sea && GEOGRAPHY[e.id].country === "turkey",
  )!.id;
  const sibling = MAP.provinces.find(
    (p) =>
      p.legacyRegion === target.legacyRegion &&
      p.id !== target.id &&
      p.id !== source,
  )!;
  assert.ok(sibling);
  const army = w.armies.find((a) => a.country === "germany")!;
  w.armies = [army];
  army.province = source;
  w.provinces[source].controller = "germany";
  const result = applyAction(w, { type: "move", army: army.id, to: target.id });
  assert.equal(result.error, null);
  w = result.world;
  for (
    let i = 0;
    i < 60 && w.provinces[target.id].controller !== "germany";
    i++
  ) {
    w.day++;
    resolveLandDay(w);
  }
  assert.equal(w.provinces[target.id].controller, "germany");
  assert.equal(w.provinces[sibling.id].controller, "turkey");
  assert.equal(w.provinces[target.id].owner, "turkey");
  assert.ok(validateWorld(w));
});

test("Eski 144 bölge önce Avrupa şehirlerine sonra dünya haritasına taşınır; işgal ve tesisler korunur", () => {
  const old = regionalFixture();
  assert.equal(Object.keys(old.countries).length, 29);
  assert.equal(Object.keys(old.provinces).length, 144);
  const p = old.provinces["turkey-0"];
  p.controller = "germany";
  p.resistance = 25;
  p.buildings.civil = 7;
  p.buildings.military = 3;
  p.buildings.mine = 2;
  const a = old.armies.find((a) => a.country === "turkey")!;
  a.province = "turkey-0";
  a.move = { to: "turkey-1", progress: 1, days: 5 };
  a.route = ["turkey-1"];
  const before = totals(old);
  const w = decodeSave(encodeSave(old));
  assert.equal(Object.keys(w.provinces).length, MAP.provinces.length);
  assert.deepEqual(totals(w), before);
  for (const p of oldCities.filter((p) => p.legacyRegion === "turkey-0")) {
    assert.equal(w.provinces[p.id].controller, "germany");
    assert.equal(w.provinces[p.id].resistance, 25);
  }
  assert.equal(w.armies.find((x) => x.id === a.id)!.move, null);
  assert.equal(w.provinces["turkey-0"].buildings.airfield, 1);
  assert.deepEqual(decodeSave(encodeSave(w)), w);
  const corrupt = JSON.parse(encodeSave(w));
  delete corrupt.world.provinces["turkey-city-0"];
  assert.throws(
    () => decodeSave(JSON.stringify(corrupt)),
    "Eksik şehirli bozuk yeni kayıt tamamlanmamalı",
  );
});

test("Canlı v1 biçimindeki 144 bölgeli sefer yeni hava/deniz ve şehir sistemine birlikte taşınır", () => {
  const old: Omit<World, "version"> & { version: number } = regionalFixture();
  old.version = 1;
  Reflect.deleteProperty(old, "hour");
  for (const k of ["difficulty", "plans", "conferences", "warScore"])
    Reflect.deleteProperty(old, k);
  for (const c of Object.values(old.countries)) {
    for (const a of c.air.wings) c.equipment[a.model] += a.count;
    for (const s of c.navy.ships) c.equipment[s.model] += 1;
    for (const k of ["automation", "cabinet", "decisions"])
      Reflect.deleteProperty(c, k);
    for (const k of [
      "strategicBomber",
      "reconPlane",
      "transport",
      "carrierFighter",
      "destroyer",
      "battleship",
    ])
      Reflect.deleteProperty(c.equipment, k);
    Reflect.deleteProperty(c.air, "wings");
    Reflect.deleteProperty(c.navy, "ships");
    Reflect.deleteProperty(c.navy, "zone");
  }
  for (const p of Object.values(old.provinces))
    for (const k of ["mine", "airfield", "antiAir"])
      Reflect.deleteProperty(p.buildings, k);
  for (const a of old.armies) Reflect.deleteProperty(a, "support");
  const w = decodeSave(
    JSON.stringify({ format: "xarmy-europa-1936", version: 1, world: old }),
  );
  assert.equal(Object.keys(w.provinces).length, MAP.provinces.length);
  assert.equal(w.version, 3);
  assert.equal(w.difficulty, "easy");
  assert.ok(w.countries.turkey.air.wings.length > 0);
  assert.ok(validateWorld(w));
});
