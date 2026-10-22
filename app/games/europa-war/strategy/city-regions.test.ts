import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, GEOGRAPHY, MAP } from "./world";
import { applyAction } from "./engine";
import { declareWar } from "./diplomacy";
import { resolveLandDay } from "./land";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { BUILDINGS } from "./catalog";
import type { Building, World } from "./types";

const parents = MAP.provinces.filter((p) => p.id === p.legacyRegion);
function regionalFixture() {
  const w = createWorld("turkey");
  for (const parent of parents) {
    const cities = MAP.provinces.filter((p) => p.legacyRegion === parent.id);
    for (const b of Object.keys(BUILDINGS) as Building[]) {
      if (b === "infra" || b === "rail") continue;
      w.provinces[parent.id].buildings[b] = cities.reduce(
        (n, p) => n + w.provinces[p.id].buildings[b],
        0,
      );
    }
    for (const p of cities) if (p.id !== parent.id) delete w.provinces[p.id];
  }
  for (const a of w.armies) a.province = GEOGRAPHY[a.province].legacyRegion;
  for (const c of Object.values(w.countries)) {
    for (const a of c.air.wings) {
      a.base = GEOGRAPHY[a.base].legacyRegion;
      a.target = GEOGRAPHY[a.target].legacyRegion;
    }
    for (const s of c.navy.ships) s.port = GEOGRAPHY[s.port].legacyRegion;
  }
  return w;
}
function totals(w: World) {
  return Object.fromEntries(
    Object.keys(w.countries).map((id) => [
      id,
      Object.fromEntries(
        (Object.keys(BUILDINGS) as Building[])
          .filter((b) => b !== "infra" && b !== "rail")
          .map((b) => [
            b,
            Object.values(w.provinces)
              .filter((p) => p.owner === id)
              .reduce((n, p) => n + p.buildings[b], 0),
          ]),
      ),
    ]),
  );
}

test("447 şehrin ayrı sınırı, kontrolü ve simetrik bağlantısı vardır; yeni şehirler bedava başkent tesisleri vermez", () => {
  const w = createWorld("turkey");
  assert.equal(MAP.provinces.length, 447);
  assert.equal(parents.length, 144);
  assert.equal(new Set(MAP.provinces.map((p) => p.path)).size, 447);
  for (const p of MAP.provinces) {
    assert.ok(p.path.startsWith("M") && p.path.endsWith("Z"));
    assert.ok(w.provinces[p.id]);
    assert.ok(GEOGRAPHY[p.legacyRegion]);
    assert.ok(p.neighbors.length > 0);
    for (const e of p.neighbors)
      assert.ok(
        GEOGRAPHY[e.id].neighbors.some(
          (back) => back.id === p.id && back.sea === e.sea,
        ),
      );
  }
  for (const c of MAP.countries) {
    const cities = Object.values(w.provinces).filter((p) => p.owner === c.id);
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

test("144 bölgeli kayıt 447 şehre taşınır; işgal ve tesisler korunur, eski uzun yol temizlenir", () => {
  const old = regionalFixture();
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
  assert.equal(Object.keys(w.provinces).length, 447);
  assert.deepEqual(totals(w), before);
  for (const p of MAP.provinces.filter((p) => p.legacyRegion === "turkey-0")) {
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
  const old: any = regionalFixture();
  old.version = 1;
  for (const k of ["difficulty", "plans", "conferences", "warScore"])
    delete old[k];
  for (const c of Object.values(old.countries) as any[]) {
    for (const a of c.air.wings) c.equipment[a.model] += a.count;
    for (const s of c.navy.ships) c.equipment[s.model] += 1;
    for (const k of ["automation", "cabinet", "decisions"]) delete c[k];
    for (const k of [
      "strategicBomber",
      "reconPlane",
      "transport",
      "carrierFighter",
      "destroyer",
      "battleship",
    ])
      delete c.equipment[k];
    delete c.air.wings;
    delete c.navy.ships;
    delete c.navy.zone;
  }
  for (const p of Object.values(old.provinces) as any[])
    for (const k of ["mine", "airfield", "antiAir"]) delete p.buildings[k];
  for (const a of old.armies) delete a.support;
  const w = decodeSave(
    JSON.stringify({ format: "xarmy-europa-1936", version: 1, world: old }),
  );
  assert.equal(Object.keys(w.provinces).length, 447);
  assert.equal(w.version, 2);
  assert.equal(w.difficulty, "easy");
  assert.ok(w.countries.turkey.air.wings.length > 0);
  assert.ok(validateWorld(w));
});
