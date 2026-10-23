import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "./engine";
import { createWorld, GEOGRAPHY } from "./world";
import { declareWar } from "./diplomacy";
import { airNavalDay, regionalAirPower } from "./airnaval";
import { AIRCRAFT } from "./advanced-catalog";
import { validateWorld } from "./storage";
import { resolveLandDay } from "./land";
import type { AirWing, World } from "./types";

function war() {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  w.countries.germany.stock.fuel = 1000;
  return w;
}

function wing(w: World, model: AirWing["model"], base = "germany-0"): AirWing {
  return {
    id: `audit-wing-${++w.serial}`,
    name: "Denetim kanadı",
    model,
    base,
    target: base,
    mission: "idle",
    count: 10,
    size: 10,
    readiness: 100,
    experience: 0,
  };
}

test("Bombardıman emri yalnızca avcı eskortu ulaşabiliyorsa başarı sayılmaz ve hiçbir kanadın emrini değiştirmez", () => {
  const w = war(),
    c = w.countries.germany;
  c.allies.push("portugal");
  w.countries.portugal.allies.push(c.id);
  c.air.wings = [wing(w, "fighter"), wing(w, "bomber", "portugal-0")];
  const target = GEOGRAPHY["poland-0"];
  for (const a of c.air.wings) {
    const distance = Math.hypot(
      GEOGRAPHY[a.base].x - target.x,
      GEOGRAPHY[a.base].y - target.y,
    );
    assert.equal(distance <= AIRCRAFT[a.model].range, a.model === "fighter");
  }
  assert.ok(validateWorld(w));
  const before = structuredClone(w);
  const result = applyAction(w, {
    type: "air",
    mission: "strategic",
    target: "poland",
  });
  assert.ok(result.error);
  assert.equal(result.world, w);
  assert.deepEqual(w, before);
});

test("Stratejik bombardıman uçağı kara desteği yapamıyorsa avcıyla birlikte sahte destek emri oluşturmaz", () => {
  const w = war(),
    c = w.countries.germany;
  c.air.wings = [wing(w, "fighter"), wing(w, "strategicBomber")];
  const result = applyAction(w, {
    type: "air",
    mission: "support",
    target: "poland",
  });
  assert.match(result.error ?? "", /uygun bir bombardıman/);
  assert.equal(result.world, w);
  assert.ok(c.air.wings.every((a) => a.mission === "idle"));
});

test("Uygun taktik bombardıman ve avcı birlikte gerçek kara desteği ve eskort üretir", () => {
  const w = war();
  w.countries.germany.air.wings = [wing(w, "fighter"), wing(w, "bomber")];
  const result = applyAction(w, {
    type: "air",
    mission: "support",
    target: "poland",
  });
  assert.equal(result.error, null);
  const c = result.world.countries.germany;
  assert.equal(
    c.air.wings.find((a) => a.model === "bomber")!.mission,
    "support",
  );
  assert.equal(
    c.air.wings.find((a) => a.model === "fighter")!.mission,
    "superiority",
  );
  assert.ok(regionalAirPower(result.world, c.id, "poland-0", "support") > 0);
  assert.ok(
    regionalAirPower(result.world, c.id, "poland-0", "superiority") > 0,
  );
  const fuel = c.stock.fuel;
  airNavalDay(result.world);
  assert.ok(c.stock.fuel < fuel);
  assert.ok(validateWorld(result.world));
});

test("İntikaldeki denizaltının yerine eskortu görevlendirmek baskın sayılmaz; intikal bitince baskın çalışır", () => {
  const w = war(),
    c = w.countries.germany;
  c.navy.ships = [
    {
      id: "audit-sub",
      name: "Denizaltı",
      model: "submarine",
      health: 100,
      experience: 0,
      port: "germany-8",
      zone: "baltic",
      mission: "idle",
      aircraft: 0,
      transit: 1,
    },
    {
      id: "audit-escort",
      name: "Eskort",
      model: "ship",
      health: 100,
      experience: 0,
      port: "germany-8",
      zone: "baltic",
      mission: "idle",
      aircraft: 0,
      transit: 0,
    },
  ];
  assert.ok(validateWorld(w));
  const before = structuredClone(w);
  const failed = applyAction(w, {
    type: "navy",
    mission: "raid",
    target: "poland",
  });
  assert.ok(failed.error);
  assert.equal(failed.world, w);
  assert.deepEqual(w, before);
  airNavalDay(w);
  const result = applyAction(w, {
    type: "navy",
    mission: "raid",
    target: "poland",
  });
  assert.equal(result.error, null);
  assert.equal(result.world.countries.germany.navy.ships[0].mission, "raid");
  assert.equal(result.world.countries.germany.navy.ships[1].mission, "escort");
  assert.ok(validateWorld(result.world));
});

test("İkmalsiz bekleyen birlik yıpranır ama savaş tecrübesi veya general terfisi kazanmaz", () => {
  const w = createWorld("germany"),
    c = w.countries.germany;
  const army = w.armies.find((a) => a.country === c.id)!;
  w.armies = [army];
  // A neutral country has not granted access: this saved position has no
  // connection to German supplies and no active combat order.
  army.province = "turkey-0";
  army.move = null;
  army.route = [];
  army.general = c.generals[0].id;
  const general = c.generals[0];
  general.skill = 2;
  general.xp = 49.8;
  const before = {
    strength: army.strength,
    experience: army.experience,
    casualties: c.casualties,
  };
  resolveLandDay(w);
  assert.ok(army.supply < 0.25);
  assert.ok(army.strength < before.strength);
  assert.ok(c.casualties > before.casualties);
  assert.equal(army.experience, before.experience);
  assert.equal(general.xp, 49.8);
  assert.equal(general.skill, 2);
});

test("Gerçek sınır muharebesi tümen tecrübesi ve general terfisi kazandırmayı sürdürür", () => {
  const w = war(),
    c = w.countries.germany;
  const origin = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === c.id &&
      p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "poland"),
  )!;
  const destination = origin.neighbors.find(
    (e) => !e.sea && GEOGRAPHY[e.id].country === "poland",
  )!.id;
  const attacker = w.armies.find((a) => a.country === c.id)!;
  const defender = w.armies.find((a) => a.country === "poland")!;
  w.armies = [attacker, defender];
  attacker.province = origin.id;
  attacker.route = [destination];
  attacker.move = null;
  attacker.general = c.generals[0].id;
  defender.province = destination;
  defender.route = [];
  defender.move = null;
  const general = c.generals[0];
  general.skill = 2;
  general.xp = 49.8;
  const experience = attacker.experience;
  resolveLandDay(w);
  assert.ok(w.battles.length > 0);
  assert.ok(attacker.experience > experience);
  assert.equal(general.skill, 3);
  assert.equal(general.xp, 0);
});
