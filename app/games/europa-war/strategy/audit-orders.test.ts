import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "./engine";
import { addArmy, createWorld, GEOGRAPHY, localSupply } from "./world";
import { declareWar } from "./diplomacy";
import { airNavalDay, regionalAirPower } from "./airnaval";
import { AIRCRAFT } from "./advanced-catalog";
import { validateWorld } from "./storage";
import { resolveLandDay, routeTo } from "./land";
import { planningDay } from "./planning";
import { aiDay } from "./ai";
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

function attackingOrder() {
  const w = war();
  const origin = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === "germany" &&
      p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "poland") &&
      p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "germany"),
  )!;
  const target = origin.neighbors.find(
    (e) => !e.sea && GEOGRAPHY[e.id].country === "poland",
  )!.id;
  const rear = origin.neighbors.find(
    (e) => !e.sea && GEOGRAPHY[e.id].country === "germany",
  )!.id;
  const army = w.armies.find((a) => a.country === "germany")!;
  army.province = origin.id;
  army.organization = 100;
  army.move = { to: target, progress: 2, days: 8 };
  army.route = [];
  w.armies = [army];
  return { w, army, origin: origin.id, target, rear };
}

test("İkmalsiz ve organizasyonsuz tümen saldırmak yerine dost şehre çekilebilir", () => {
  const { w, army, rear, target } = attackingOrder();
  army.organization = 0;
  army.supply = 0.1;
  army.move = null;
  const blocked = applyAction(w, { type: "move", army: army.id, to: target });
  assert.match(blocked.error ?? "", /organizasyon/);
  assert.equal(blocked.world, w);
  const result = applyAction(w, { type: "move", army: army.id, to: rear });
  assert.equal(result.error, null);
  const retreating = result.world.armies.find((a) => a.id === army.id)!;
  assert.deepEqual(retreating.route, [rear]);
  for (let day = 0; day < 30 && retreating.province !== rear; day++) {
    result.world.day++;
    resolveLandDay(result.world);
  }
  assert.equal(retreating.province, rear);
});

test("İkmalsiz birliğin dost geri çekilme emri sürmekte olan düşman saldırısını iptal eder", () => {
  const { w, army, rear, target } = attackingOrder();
  army.organization = 0;
  army.supply = 0.1;
  const result = applyAction(w, { type: "move", army: army.id, to: rear });
  assert.equal(result.error, null);
  assert.equal(result.world.armies[0].move, null);
  assert.deepEqual(result.world.armies[0].route, [rear]);
  const appended = applyAction(w, {
    type: "move",
    army: army.id,
    to: rear,
    append: true,
  });
  assert.ok(
    appended.error,
    "Dost hedef eklemek bitkin tümenin eski saldırısını geçerli kılmamalı",
  );
  assert.equal(w.armies[0].move?.to, target);
});

test("Saldıran tümeni bulunduğu şehre yönlendirmek eski saldırıyı hemen iptal eder", () => {
  const { w, army, origin } = attackingOrder();
  army.organization = 5;
  const before = structuredClone(w);
  const result = applyAction(w, { type: "move", army: army.id, to: origin });
  assert.equal(
    result.error,
    null,
    "Bulunduğu şehirde kalmak yeni harekât organizasyonu gerektirmez",
  );
  assert.equal(result.world.armies[0].move, null);
  assert.deepEqual(result.world.armies[0].route, []);
  assert.deepEqual(w, before);
  resolveLandDay(result.world);
  assert.equal(result.world.armies[0].province, origin);
  assert.equal(result.world.battles.length, 0);
});

test("Yeni geri bölge emri düşman şehrinin ele geçirilmesini beklemeden saldırıyı değiştirir", () => {
  const { w, army, origin, rear, target } = attackingOrder();
  const result = applyAction(w, { type: "move", army: army.id, to: rear });
  assert.equal(result.error, null);
  const redirected = result.world.armies[0];
  assert.equal(redirected.move, null);
  assert.deepEqual(redirected.route, [rear]);
  assert.equal(redirected.province, origin);
  resolveLandDay(result.world);
  assert.notEqual(result.world.armies[0].move?.to, target);
  assert.equal(result.world.provinces[target].controller, "poland");
  for (let day = 0; day < 30 && redirected.province !== rear; day++)
    resolveLandDay(result.world);
  assert.equal(redirected.province, rear);
});

test("Aynı yürüyüş ayağını tekrar vermek ilerlemeyi korur; yeni hedef kuyruğu doğru yerden sürer", () => {
  const { w, army, origin, rear } = attackingOrder();
  const beyond =
    GEOGRAPHY[rear].neighbors.find(
      (e) =>
        !e.sea &&
        e.id !== origin &&
        GEOGRAPHY[e.id].country === "germany" &&
        routeTo(w, army, e.id)?.[0] === rear,
    )?.id ?? rear;
  army.move = { to: rear, progress: 1.75, days: 8 };
  let current = w;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = applyAction(current, {
      type: "move",
      army: army.id,
      to: beyond,
    });
    assert.equal(result.error, null);
    const active = result.world.armies[0];
    assert.deepEqual(active.move, army.move);
    assert.deepEqual(active.route, routeTo(w, army, beyond)!.slice(1));
    current = result.world;
  }
});

test("Shift ile eklenen geri dönüş devam eden saldırının yerine geçmez", () => {
  const { w, army, origin, target } = attackingOrder();
  const result = applyAction(w, {
    type: "move",
    army: army.id,
    to: origin,
    append: true,
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.world.armies[0].move, army.move);
  assert.equal(result.world.armies[0].move?.to, target);
  assert.deepEqual(result.world.armies[0].route, [origin]);
});

test("Toplu yeni emir hareket halindeki ve hedefteki tümeni birlikte yeniden yönlendirir", () => {
  const { w, army, rear } = attackingOrder();
  const settled = {
    ...structuredClone(army),
    id: "audit-settled",
    province: rear,
    move: null,
  };
  w.armies.push(settled);
  const result = applyAction(w, {
    type: "moveGroup",
    armies: [army.id, settled.id],
    to: rear,
  });
  assert.equal(result.error, null);
  assert.ok(result.world.armies.every((a) => a.move === null));
  assert.deepEqual(result.world.armies[0].route, [rear]);
  assert.deepEqual(result.world.armies[1].route, []);
});

test("Saldırı planından manuel yönlendirilen birlik eski taarruza geri çekilmez", () => {
  const { w, army, rear, target } = attackingOrder();
  w.plans.push({
    id: "audit-active-plan",
    name: "Denetim",
    country: "germany",
    armies: [army.id],
    objectives: [target],
    preparation: 100,
    active: true,
    stance: "aggressive",
  });
  const result = applyAction(w, { type: "move", army: army.id, to: rear });
  assert.equal(result.error, null);
  planningDay(result.world);
  assert.equal(result.world.armies[0].move, null);
  assert.deepEqual(result.world.armies[0].route, [rear]);
  assert.ok(result.world.plans.every((p) => !p.armies.includes(army.id)));
});

test("Sürmekte olan hava indirmesinin aynı hedefi yeniden seçilince uçuş ilerlemesi kaybolmaz", () => {
  const { w, army } = attackingOrder();
  army.type = "paratrooper";
  const target = Object.values(GEOGRAPHY).find(
    (p) => p.country === "poland" && routeTo(w, army, p.id) === null,
  )!.id;
  army.move = { to: target, progress: 1, days: 3, kind: "paradrop" };
  army.organization = 5;
  assert.equal(
    routeTo(w, army, target),
    null,
    "İndirme hedefi kara yoluyla erişilebilir olmamalı",
  );
  const result = applyAction(w, {
    type: "move",
    army: army.id,
    to: target,
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.world.armies[0].move, army.move);
  assert.deepEqual(result.world.armies[0].route, []);
});

test("Geçersiz toplu yön değişimi eski hareketleri ve cephe atamalarını kısmen iptal etmez", () => {
  const { w, army, origin, rear } = attackingOrder();
  const exhausted = {
    ...structuredClone(army),
    id: "audit-exhausted",
    organization: 2,
  };
  w.armies.push(exhausted);
  w.fronts.push({
    id: "audit-front",
    country: "germany",
    provinces: [origin, rear],
    armies: [army.id, exhausted.id],
  });
  const before = structuredClone(w);
  const result = applyAction(w, {
    type: "moveGroup",
    armies: [army.id, exhausted.id],
    to: rear,
  });
  assert.match(result.error ?? "", /organizasyon/);
  assert.equal(result.world, w);
  assert.deepEqual(w, before);
});

test("Düşük organizasyonlu taarruz planı toparlanır ve ardışık iki şehri aldıktan sonra tamamlanır", () => {
  const { w, army, target } = attackingOrder();
  const second = GEOGRAPHY[target].neighbors.find(
    (e) =>
      !e.sea &&
      GEOGRAPHY[e.id].country === "poland" &&
      e.id !== w.countries.poland.capital,
  )!.id;
  army.move = null;
  army.organization = 10;
  army.supply = localSupply(w, army.country, army.province);
  w.plans = [
    {
      id: "audit-two-cities",
      name: "İki şehir",
      country: army.country,
      armies: [army.id],
      objectives: [target, second],
      preparation: 100,
      active: true,
      stance: "balanced",
    },
  ];
  planningDay(w);
  assert.ok(
    army.route.every((id) => w.provinces[id].controller === army.country),
    "Hazırlıksız birlik iyileşmeye çekilebilir ama hemen saldırmamalı",
  );
  let firstCaptured = false;
  for (let day = 0; day < 120 && w.plans[0].active; day++) {
    w.day++;
    resolveLandDay(w);
    firstCaptured ||= w.provinces[target].controller === army.country;
    planningDay(w);
  }
  assert.ok(firstCaptured);
  assert.equal(w.provinces[second].controller, army.country);
  assert.equal(army.province, second);
  assert.equal(w.plans[0].active, false);
});

test("Yapay zekâ cephe gerisinde ikmalsiz kalan tümeni komşu sağlıklı ikmale taşır", () => {
  const w = createWorld("turkey", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const origin = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === "germany" &&
      p.neighbors.every((e) => GEOGRAPHY[e.id].country !== "poland") &&
      p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "germany"),
  )!;
  const army = addArmy(w, "germany", origin.id);
  const p = w.provinces[origin.id];
  p.buildings.infra = 0;
  p.buildings.rail = 0;
  p.buildings.hub = 0;
  p.damage = 100;
  army.organization = 15;
  army.supply = localSupply(w, army.country, army.province);
  assert.ok(army.supply < 0.25);
  const index = Object.keys(w.countries).indexOf(army.country);
  w.day = (7 - (index % 7)) % 7;
  aiDay(w);
  assert.equal(
    army.route.length,
    1,
    "Yakın düşman yokken de ikmalden kaçış emri verilmeli",
  );
  assert.ok(localSupply(w, army.country, army.route[0]) > army.supply);
  for (let day = 0; day < 200 && army.province === origin.id; day++)
    resolveLandDay(w);
  assert.notEqual(army.province, origin.id);
  resolveLandDay(w);
  assert.ok(army.supply >= 0.25);
});

test("Yapay zekâ güçlü cepheye sonuçsuz saldırmaz; açılan zayıf komşu cepheye ilerler", () => {
  const w = createWorld("turkey", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const origin = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === "germany" &&
      p.neighbors.filter((e) => !e.sea && GEOGRAPHY[e.id].country === "poland")
        .length >= 2,
  )!;
  const enemyCities = origin.neighbors
    .filter((e) => !e.sea && GEOGRAPHY[e.id].country === "poland")
    .map((e) => e.id);
  const army = addArmy(w, "germany", origin.id);
  army.organization = 100;
  for (const province of enemyCities) {
    for (let division = 0; division < 4; division++) {
      const defender = addArmy(w, "poland", province, "heavyTank");
      defender.organization = 100;
    }
  }
  const index = Object.keys(w.countries).indexOf(army.country);
  w.day = (7 - (index % 7)) % 7;
  aiDay(w);
  assert.deepEqual(
    army.route,
    [],
    "Tek piyade güçlü savunma hattına zorla saldırmamalı",
  );
  const flank = enemyCities[0];
  w.armies = w.armies.filter(
    (a) => a.country !== "poland" || a.province !== flank,
  );
  w.day += 7;
  aiDay(w);
  assert.deepEqual(army.route, [flank]);
  assert.equal(army.stance, "advance");
});

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
