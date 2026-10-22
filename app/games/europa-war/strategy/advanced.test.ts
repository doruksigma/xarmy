import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceDay, applyAction } from "./engine";
import { createWorld, controlled, capacity, GEOGRAPHY } from "./world";
import { airNavalDay, regionalAirPower, wingEfficiency } from "./airnaval";
import { seaControl, seaRoute, portZone } from "./military-assets";
import { declareWar } from "./diplomacy";
import {
  conferenceAction,
  conferencesDay,
  openConference,
  provincePrice,
} from "./conference";
import { combatPower, resolveLandDay } from "./land";
import { planningDay } from "./planning";
import { economyDay } from "./economy";
import { politicsDay } from "./politics";
import { manage, managementDay } from "./management";
import { aiDay } from "./ai";
import { EQUIPMENT } from "./catalog";
import { tradeRoute } from "./trade-routes";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import type { Action, World } from "./types";

function order(w: World, action: Action) {
  const result = applyAction(w, action);
  assert.equal(result.error, null, `${action.type}: ${result.error}`);
  return result.world;
}

function defeatPoland() {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  declareWar(w, "ussr", "poland");
  const regions = controlled(w, "poland");
  for (const [i, p] of regions.entries())
    p.controller = i % 2 ? "ussr" : "germany";
  w.countries.poland.capitulated = true;
  w.countries.poland.victor = "germany";
  w.warScore.germany = { poland: 300 };
  w.warScore.ussr = { poland: 120 };
  w.armies = w.armies.filter((a) => a.country !== "poland");
  openConference(w, "poland");
  return w;
}

/** A genuine v1 shape, with deployed assets folded back into the old reserve-only model. */
function legacyFixture() {
  const old = JSON.parse(JSON.stringify(createWorld("turkey")));
  old.version = 1;
  delete old.difficulty;
  delete old.plans;
  delete old.conferences;
  delete old.warScore;
  const addedEquipment = [
    "strategicBomber",
    "reconPlane",
    "transport",
    "carrierFighter",
    "destroyer",
    "battleship",
  ];
  for (const c of Object.values(old.countries) as any[]) {
    for (const wing of c.air.wings) c.equipment[wing.model] += wing.count;
    for (const ship of c.navy.ships) c.equipment[ship.model] += 1;
    for (const key of addedEquipment) delete c.equipment[key];
    delete c.automation;
    delete c.cabinet;
    delete c.decisions;
    delete c.air.wings;
    delete c.navy.ships;
    delete c.navy.zone;
  }
  for (const p of Object.values(old.provinces) as any[]) {
    delete p.buildings.mine;
    delete p.buildings.airfield;
    delete p.buildings.antiAir;
  }
  for (const a of old.armies) delete a.support;
  return old;
}

test("Hava kanadı kurma ve dağıtma uçak çoğaltmaz; başarısız emir atomiktir", () => {
  let w = createWorld("turkey");
  w.countries.turkey.equipment.fighter = 15;
  const before = w.countries.turkey.air.wings.length;
  w = order(w, {
    type: "createWing",
    model: "fighter",
    count: 10,
    base: "turkey-0",
  });
  assert.equal(w.countries.turkey.equipment.fighter, 5);
  assert.equal(w.countries.turkey.air.wings.length, before + 1);
  const failed = applyAction(w, {
    type: "createWing",
    model: "fighter",
    count: 10,
    base: "turkey-0",
  });
  assert.ok(failed.error);
  assert.equal(failed.world, w);
  w = order(w, {
    type: "disbandWing",
    id: w.countries.turkey.air.wings.at(-1)!.id,
  });
  assert.equal(w.countries.turkey.equipment.fighter, 15);
});

test("Uçak modeli, tarafsızlık ve menzil gerçek görev kısıtlarıdır", () => {
  let w = createWorld("germany");
  const fighter = w.countries.germany.air.wings.find(
    (a) => a.model === "fighter",
  )!;
  assert.ok(
    applyAction(w, {
      type: "wing",
      id: fighter.id,
      mission: "strategic",
      target: "poland-0",
    }).error,
  );
  assert.ok(
    applyAction(w, {
      type: "wing",
      id: fighter.id,
      mission: "superiority",
      target: "poland-0",
    }).error,
  );
  declareWar(w, "germany", "poland");
  w = order(w, {
    type: "wing",
    id: fighter.id,
    mission: "superiority",
    target: "poland-0",
  });
  assert.equal(
    w.countries.germany.air.wings.find((a) => a.id === fighter.id)!.mission,
    "superiority",
  );
  declareWar(w, "germany", "turkey");
  assert.ok(
    applyAction(w, {
      type: "wing",
      id: fighter.id,
      mission: "superiority",
      target: "turkey-8",
    }).error,
  );
});

test("Üs yoğunluğu ve hasarı hava kanadının etkinliğini azaltır", () => {
  const w = createWorld("germany"),
    c = w.countries.germany;
  const a = c.air.wings.find((a) => a.model === "fighter")!;
  a.count = a.size = 100;
  const baseline = wingEfficiency(w, c, a);
  c.air.wings.push({ ...a, id: "extra-wing", count: 100, size: 100 });
  assert.ok(wingEfficiency(w, c, a) < baseline);
  w.provinces[a.base].damage = 80;
  assert.ok(wingEfficiency(w, c, a) < baseline / 2);
});

test("Gemi görevlendirmesi gemi stoğunu tüketir; intikal sürerken deniz gücü vermez", () => {
  let w = createWorld("turkey");
  w.countries.turkey.navy.ships = [];
  w.countries.turkey.equipment.destroyer = 1;
  w = order(w, { type: "commission", model: "destroyer", port: "turkey-2" });
  const ship = w.countries.turkey.navy.ships[0];
  assert.equal(w.countries.turkey.equipment.destroyer, 0);
  w = order(w, {
    type: "ship",
    id: ship.id,
    mission: "patrol",
    zone: "atlantic",
  });
  assert.ok(w.countries.turkey.navy.ships[0].transit > 0);
  assert.equal(seaControl(w, "turkey", "atlantic"), 0);
  assert.ok(
    applyAction(w, {
      type: "ship",
      id: ship.id,
      mission: "patrol",
      zone: "north",
    }).error,
  );
});

test("Boğazlar mevcut düşman denetimine göre geçişi kapatır", () => {
  const w = createWorld("uk");
  assert.ok(seaRoute(w, "uk", "mediterranean", "black"));
  declareWar(w, "uk", "turkey");
  assert.equal(seaRoute(w, "uk", "mediterranean", "black"), null);
  w.provinces["turkey-1"].controller = "uk";
  assert.ok(seaRoute(w, "uk", "mediterranean", "black"));
  declareWar(w, "uk", "denmark");
  assert.equal(seaRoute(w, "uk", "north", "baltic"), null);
});

test("Tarihsel limanlar doğru deniz havzasına bağlıdır", () => {
  assert.equal(portZone("ussr-5"), "black"); // Odessa
  assert.equal(portZone("france-4"), "mediterranean"); // Marseille
  assert.equal(portZone("germany-8"), "baltic"); // Stettin
  assert.equal(portZone("denmark-2"), "atlantic"); // Reykjavik
  assert.equal(portZone("ussr-9"), "north"); // Northern/Arctic sea abstraction
});

test("Yakıtı tükenen donanma deniz üstünlüğü sağlayamaz", () => {
  const w = createWorld("turkey"),
    c = w.countries.turkey;
  c.navy.ships.forEach((s) => {
    s.mission = "patrol";
    s.transit = 0;
    s.zone = "mediterranean";
  });
  assert.ok(seaControl(w, c.id, "mediterranean") > 0);
  c.stock.fuel = 0;
  assert.equal(seaControl(w, c.id, "mediterranean"), 0);
});

test("Limandaki gemi çelik tüketerek onarılır; uçak gemisi yüklemesi stoğu korur", () => {
  let w = createWorld("uk"),
    c = w.countries.uk;
  const carrier = c.navy.ships.find((s) => s.model === "carrier")!;
  carrier.mission = "idle";
  carrier.transit = 0;
  carrier.health = 55;
  c.equipment.carrierFighter = 20;
  w = order(w, { type: "carrierAircraft", id: carrier.id, count: 15 });
  c = w.countries.uk;
  assert.equal(c.equipment.carrierFighter, 5);
  const steel = c.stock.steel;
  airNavalDay(w);
  assert.ok(c.navy.ships.find((s) => s.id === carrier.id)!.health > 55);
  assert.ok(c.stock.steel < steel);
  w = order(w, { type: "carrierAircraft", id: carrier.id, count: 0 });
  assert.equal(w.countries.uk.equipment.carrierFighter, 20);
});

test("Konvoy eskortu deniz ticaretini korur; karadaki ticaret baskından etkilenmez", () => {
  const w = createWorld("uk"),
    uk = w.countries.uk,
    de = w.countries.germany;
  declareWar(w, "germany", "uk");
  uk.allies = [];
  uk.navy.ships = [];
  const route = tradeRoute(w, "portugal", "uk");
  assert.ok(route && route.seas.length);
  const sub = de.navy.ships.find((s) => s.model === "submarine")!;
  sub.zone = route.seas[0];
  sub.transit = 0;
  sub.mission = "raid";
  const raided = tradeRoute(w, "portugal", "uk")!;
  assert.ok(raided.delivery < 1);
  uk.navy.ships.push({
    ...sub,
    id: "escort-test",
    model: "destroyer",
    mission: "escort",
    port: "uk-0",
  });
  assert.ok(tradeRoute(w, "portugal", "uk")!.delivery > raided.delivery);
  const land = tradeRoute(w, "austria", "switzerland");
  assert.ok(land && land.seas.length === 0 && land.delivery === 1);
});

test("Destek topçusu ekipman tüketir ve saldırıyı artırır; eksik top emri reddedilir", () => {
  let w = createWorld("turkey");
  const army = w.armies.find((a) => a.country === "turkey")!;
  const initial = combatPower(w, army, true, "turkey-0");
  w.countries.turkey.equipment.artillery = 11;
  assert.ok(
    applyAction(w, { type: "support", army: army.id, support: "artillery" })
      .error,
  );
  w.countries.turkey.equipment.artillery = 20;
  w = order(w, { type: "support", army: army.id, support: "artillery" });
  const changed = w.armies.find((a) => a.id === army.id)!;
  changed.organization = army.organization;
  assert.equal(w.countries.turkey.equipment.artillery, 8);
  assert.ok(combatPower(w, changed, true, "turkey-0") > initial);
});

test("Tank tümeni tank olmadan takviye alamaz; tank ve destek topu birlikte tüketilir", () => {
  const w = createWorld("germany"),
    c = w.countries.germany;
  const a = w.armies.find((a) => a.country === c.id && a.type === "lightTank")!;
  a.province = c.capital;
  a.strength = 80;
  a.support = ["artillery"];
  w.armies = [a];
  c.equipment.lightTank = 0;
  c.equipment.artillery = 100;
  resolveLandDay(w);
  assert.equal(a.strength, 80);
  c.equipment.lightTank = 20;
  const tanks = c.equipment.lightTank,
    artillery = c.equipment.artillery;
  resolveLandDay(w);
  assert.ok(a.strength > 80);
  assert.ok(c.equipment.lightTank < tanks);
  assert.ok(c.equipment.artillery < artillery);
});

test("Taarruz hazırlık ister; manuel dur emri tümeni otomatik plandan çıkarır", () => {
  let w = createWorld("germany");
  const army = w.armies.find((a) => a.country === "germany")!;
  assert.ok(
    applyAction(w, {
      type: "offensive",
      armies: [army.id],
      objectives: ["poland-0"],
      stance: "balanced",
    }).error,
  );
  declareWar(w, "germany", "poland");
  w = order(w, {
    type: "offensive",
    armies: [army.id],
    objectives: ["poland-0"],
    stance: "balanced",
  });
  const id = w.plans[0].id;
  assert.ok(applyAction(w, { type: "plan", id, kind: "start" }).error);
  for (let day = 0; day < 30; day++) planningDay(w);
  w = order(w, { type: "plan", id, kind: "start" });
  assert.equal(w.plans[0].active, true);
  w = order(w, { type: "halt", army: army.id });
  assert.ok(w.plans.every((p) => !p.armies.includes(army.id)));
  assert.equal(w.armies.find((a) => a.id === army.id)!.move, null);
});

test("Aynı gün kaybedilen tümen plan kaydını bozamaz", () => {
  let w = createWorld("germany");
  declareWar(w, "germany", "poland");
  const army = w.armies.find((a) => a.country === "germany")!;
  w = order(w, {
    type: "offensive",
    armies: [army.id],
    objectives: ["poland-0"],
    stance: "balanced",
  });
  const doomed = w.armies.find((a) => a.id === army.id)!;
  doomed.strength = 0.1;
  doomed.province = "turkey-8"; // No friendly supply route; daily attrition removes it.

  w = advanceDay(w);
  assert.ok(!w.armies.some((a) => a.id === army.id));
  assert.ok(validateWorld(w));
});

test("Çok taraflı barışta katkı, sıra ve bütçe gerçek sınırlar; toplu ilhak baypas edemez", () => {
  let w = defeatPoland();
  const q = w.conferences[0];
  assert.equal(q.participants.length, 2);
  assert.ok(q.points.germany > q.points.ussr);
  assert.ok(
    applyAction(w, { type: "diplomacy", target: "poland", kind: "annex" })
      .error,
  );
  const province = q.available.find(
    (id) => provincePrice(id) <= q.points.germany,
  )!;
  const points = q.points.germany,
    owner = w.provinces[province].owner;
  w = order(w, {
    type: "peaceClaim",
    conference: q.id,
    province,
    kind: "annex",
  });
  assert.equal(
    w.conferences[0].points.germany,
    points - provincePrice(province),
  );
  assert.equal(
    w.provinces[province].owner,
    owner,
    "Ownership changes only when the agreement closes",
  );
  assert.ok(
    applyAction(w, {
      type: "peaceClaim",
      conference: q.id,
      province,
      kind: "annex",
    }).error,
  );
  assert.equal(w.conferences[0].participants[w.conferences[0].turn], "ussr");
  conferencesDay(w);
  assert.equal(w.conferences[0].participants[w.conferences[0].turn], "germany");
});

test("Barış konferansı tamamlanınca sınırlar, savaşlar ve yeniden bağımsızlık çalışır", () => {
  const w = defeatPoland();
  const q = w.conferences[0];
  for (let i = 0; i < 200 && q.status === "open"; i++) {
    const c = w.countries[q.participants[q.turn]];
    const province = q.available.find(
      (id) => provincePrice(id) <= q.points[c.id],
    );
    conferenceAction(
      w,
      c,
      province
        ? { type: "peaceClaim", conference: q.id, province, kind: "annex" }
        : { type: "peacePass", conference: q.id },
    );
  }
  assert.equal(q.status, "closed");
  assert.ok(q.awards.length > 0);
  for (const a of q.awards)
    assert.equal(w.provinces[a.province].owner, a.country);
  assert.deepEqual(w.countries.poland.wars, []);
  assert.ok(!w.countries.germany.wars.includes("poland"));
  assert.ok(validateWorld(w));
  const released = order(w, { type: "release", country: "poland" });
  assert.ok(controlled(released, "poland").length > 0);
  assert.equal(released.countries.poland.capitulated, false);
  assert.equal(released.countries.poland.subjectOf, null);
  assert.ok(validateWorld(released));
});

test("Kabine ve ulusal odaklar açıklanan gerçek ekonomik sonuçları üretir", () => {
  let w = createWorld("turkey");
  const political = w.countries.turkey.political;
  w = order(w, { type: "cabinet", slot: "economy", id: "producer" });
  assert.equal(w.countries.turkey.political, political - 35);
  const builder = structuredClone(w);
  builder.countries.turkey.cabinet.economy = "builder";
  economyDay(w);
  economyDay(builder);
  assert.ok(
    w.countries.turkey.equipment.rifle >
      builder.countries.turkey.equipment.rifle,
  );
  w.countries.turkey.focuses = ["industry"];
  w = order(w, { type: "focus", id: "etatism" });
  w.countries.turkey.focus!.progress = 69;
  const cash = w.countries.turkey.treasury,
    factories = w.provinces["turkey-2"].buildings.civil;
  politicsDay(w);
  assert.equal(w.countries.turkey.treasury, cash + 150);
  assert.equal(w.provinces["turkey-2"].buildings.civil, factories + 1);
  assert.ok(w.countries.turkey.focuses.includes("etatism"));
});

test("Yardımcı yönetim bütçe ve kapasite sınırlarına uyar; savaş veya rejim kararı vermez", () => {
  const w = createWorld("turkey"),
    c = w.countries.turkey;
  const ideology = c.ideology,
    wars = [...c.wars],
    cash = c.treasury;
  for (const area of [
    "economy",
    "research",
    "recruitment",
    "operations",
  ] as const)
    manage(w, c, area);
  assert.equal(c.ideology, ideology);
  assert.deepEqual(c.wars, wars);
  assert.ok(c.treasury <= cash && c.treasury >= 0);
  assert.ok(c.research.length > 0);
  assert.ok(c.focus);
  assert.ok(c.production.length > 0);
  assert.ok(validateWorld(w));
});

test("Ülke kararları kaynak tüketir ve bekleme süresince tekrarlanamaz", () => {
  let w = createWorld("turkey");
  const initial = w.countries.turkey.stability,
    cash = w.countries.turkey.treasury;
  w = order(w, { type: "decision", id: "publicWorks" });
  assert.equal(w.countries.turkey.stability, initial + 10);
  assert.equal(w.countries.turkey.treasury, cash - 150);
  const failed = applyAction(w, { type: "decision", id: "publicWorks" });
  assert.ok(failed.error);
  assert.equal(failed.world, w);
});

test("V1 kayıtları stokları çoğaltmadan taşınır; büyük yedekler kaybolmaz", () => {
  const old = legacyFixture();
  old.countries.turkey.equipment.fighter = 250.5;
  old.countries.turkey.equipment.ship = 150.25;
  const w = decodeSave(
    JSON.stringify({ format: "xarmy-europa-1936", version: 1, world: old }),
  );
  const c = w.countries.turkey;
  assert.equal(w.version, 2);
  assert.ok(validateWorld(w));
  assert.equal(
    c.equipment.fighter +
      c.air.wings
        .filter((a) => a.model === "fighter")
        .reduce((n, a) => n + a.count, 0),
    250.5,
  );
  assert.equal(
    c.equipment.ship + c.navy.ships.filter((s) => s.model === "ship").length,
    150.25,
  );
  assert.deepEqual(decodeSave(encodeSave(w)), w);
});

test("Bozuk eski kayıt, sahte kanat modeli ve başka ülkenin odağı reddedilir", () => {
  const old = legacyFixture();
  old.countries.turkey.air.wings = [];
  assert.throws(() =>
    decodeSave(
      JSON.stringify({ format: "xarmy-europa-1936", version: 1, world: old }),
    ),
  );
  const w = createWorld("turkey");
  const invalid = JSON.parse(encodeSave(w));
  invalid.world.countries.turkey.air.wings[0].model = "missing-model";
  assert.throws(() => decodeSave(JSON.stringify(invalid)));
  w.countries.turkey.focus = { id: "panzer", progress: 0, total: 70 };
  assert.equal(validateWorld(w), false);
});

test("Sınır saldırısı ilk günden iki tarafa hasar verir; çatışmada kayıplar takviyeyle silinmez", () => {
  let w = createWorld("germany", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  const from = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === "germany" &&
      p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "poland"),
  )!;
  const to = from.neighbors.find(
    (e) => !e.sea && GEOGRAPHY[e.id].country === "poland",
  )!.id;
  const attacker = w.armies.find((a) => a.country === "germany")!,
    defender = w.armies.find((a) => a.country === "poland")!;
  attacker.province = from.id;
  defender.province = to;
  attacker.type = defender.type = "infantry";
  attacker.organization = defender.organization = 100;
  attacker.strength = defender.strength = 100;
  w.armies = [attacker, defender];
  w = order(w, { type: "move", army: attacker.id, to });
  for (let day = 1; day <= 3; day++) {
    const before = w.armies.map((a) => a.strength);
    w.day = day;
    resolveLandDay(w);
    assert.equal(w.battles.length, 1);
    assert.ok(w.armies[0].strength < before[0], "saldıran da kayıp vermeli");
    assert.ok(
      w.armies[1].strength < before[1],
      "savunanın hasarı günlük iyileşmeyle silinmemeli",
    );
    assert.ok(w.armies[1].organization < 100);
  }
  assert.ok(w.countries.poland.casualties > 0);
  assert.equal(
    w.battles[0].started,
    1,
    "muharebe başlangıcı her gün sıfırlanmamalı",
  );
});

test("Kolay zorluk mevcut seferde çalışır ve kayda taşınır", () => {
  let w = createWorld("turkey", "historical", 10, "normal");
  const a = w.armies.find((a) => a.country === w.player)!;
  const baseline = combatPower(w, a, true, a.province);
  w = order(w, { type: "difficulty", value: "easy" });
  assert.equal(combatPower(w, a, true, a.province), baseline * 1.5);
  assert.equal(decodeSave(encodeSave(w)).difficulty, "easy");
  w = order(w, { type: "difficulty", value: "hard" });
  assert.ok(
    Math.abs(combatPower(w, a, true, a.province) - baseline * 0.85) < 1e-8,
  );
});

test("Yakıtı uçuşa yetmeyen kanat hava üstünlüğü veremez", () => {
  const w = createWorld("germany"),
    c = w.countries.germany,
    a = c.air.wings.find((a) => a.model === "fighter")!;
  a.mission = "superiority";
  a.target = a.base;
  c.stock.fuel = 0.001;
  assert.equal(regionalAirPower(w, c.id, a.target), 0);
  airNavalDay(w);
  assert.equal(regionalAirPower(w, c.id, a.target), 0);
  c.stock.fuel = 100;
  assert.ok(regionalAirPower(w, c.id, a.target) > 0);
});

test("İkmal limanını kaybeden filo deniz kontrolü sağlayamaz", () => {
  const w = createWorld("turkey"),
    c = w.countries.turkey,
    s = c.navy.ships[0];
  c.stock.fuel = 500;
  assert.ok(seaControl(w, c.id, s.zone) > 0);
  declareWar(w, "turkey", "bulgaria");
  w.provinces[s.port].controller = "bulgaria";
  assert.equal(seaControl(w, c.id, s.zone), 0);
});

test("Barış konferansında tam ilhak yenilen ülkenin yabancı işgallerini de sona erdirir", () => {
  let w = createWorld("germany");
  declareWar(w, "germany", "poland");
  for (const p of Object.values(w.provinces))
    if (p.owner === "poland") p.controller = "germany";
  w.provinces["germany-9"].controller = "poland";
  resolveLandDay(w);
  const q = w.conferences.find((q) => q.defeated === "poland")!;
  for (const province of [...q.available])
    w = order(w, {
      type: "peaceClaim",
      conference: q.id,
      province,
      kind: "annex",
    });
  assert.equal(w.provinces["germany-9"].controller, "germany");
  assert.equal(w.countries.poland.capitulated, true);
  assert.equal(controlled(w, "poland").length, 0);
  assert.equal(w.conferences.find((x) => x.id === q.id)!.status, "closed");
});

test("Deniz üzerindeki hava indirme donanma iznine takılmadan tamamlanır", () => {
  let w = createWorld("uk");
  const c = w.countries.uk;
  declareWar(w, "uk", "france");
  c.navy.ships = [];
  c.stock.fuel = 2000;
  c.tech.push("airborne");
  c.equipment.transport = 10;
  const army = w.armies.find((a) => a.country === "uk")!;
  army.type = "paratrooper";
  army.province = "uk-0";
  army.organization = 100;
  w.armies = w.armies.filter(
    (a) => a.id === army.id || a.province !== "france-1",
  );
  w = order(w, {
    type: "createWing",
    model: "transport",
    count: 10,
    base: "uk-0",
  });
  const transport = w.countries.uk.air.wings.find(
    (a) => a.model === "transport",
  )!;
  const fighter = w.countries.uk.air.wings.find((a) => a.model === "fighter")!;
  transport.readiness = fighter.readiness = 100;
  w = order(w, {
    type: "wing",
    id: transport.id,
    mission: "transport",
    target: "france-1",
  });
  w = order(w, {
    type: "wing",
    id: fighter.id,
    mission: "superiority",
    target: "france-1",
  });
  w = order(w, { type: "paradrop", army: army.id, to: "france-1" });
  assert.equal(
    decodeSave(encodeSave(w)).armies.find((a) => a.id === army.id)!.move!.kind,
    "paradrop",
  );
  for (let i = 0; i < 5; i++) resolveLandDay(w);
  assert.equal(w.armies.find((a) => a.id === army.id)!.province, "france-1");
  assert.equal(w.provinces["france-1"].controller, "uk");
});

test("AI üretimi görevdeki uçakları stok gibi sayar; kara ordusu için üretimi korur", () => {
  const w = createWorld("turkey"),
    c = w.countries.germany;
  const fighter = c.air.wings.find((a) => a.model === "fighter")!;
  fighter.count = fighter.size = 100;
  c.equipment.fighter = 0;
  c.equipment.rifle = 0;
  c.equipment.artillery = 0;
  manage(w, c, "economy");
  assert.equal(
    c.production.some((l) => l.equipment === "fighter"),
    false,
  );
  assert.ok(
    c.production.some((l) => l.equipment === "rifle" && l.factories > 0),
  );
  assert.ok(
    c.production
      .filter((l) => !EQUIPMENT[l.equipment].naval)
      .reduce((n, l) => n + l.factories, 0) <= capacity(w, c.id, "military"),
  );
});
