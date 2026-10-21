import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorld,
  GEOGRAPHY,
  supplyNetwork,
  dateLabel,
  localSupply,
} from "./world";
import { combatPower, resolveLandDay, routeTo } from "./land";

test("1936 senaryosu: geçerli başkentler, simetrik komşuluk ve sonlu insan gücü", () => {
  const w = createWorld("turkey");
  assert.equal(dateLabel(0), "1 Ocak 1936");
  assert.equal(Object.keys(w.countries).length, 29);
  for (const c of Object.values(w.countries)) {
    assert.ok(w.provinces[c.capital]);
    assert.ok(c.manpower >= 0);
    assert.ok(c.manpower <= c.mobilized);
  }
  for (const p of Object.values(GEOGRAPHY))
    for (const e of p.neighbors)
      assert.ok(
        GEOGRAPHY[e.id].neighbors.some((n) => n.id === p.id && n.sea === e.sea),
      );
});
test("Tarafsız topraklardan geçilemez; deniz geçişinde donanma gerekir", () => {
  const w = createWorld("uk"),
    army = w.armies.find((a) => a.country === "uk")!;
  army.province = "uk-0";
  assert.equal(routeTo(w, army, "france-1")?.at(-1), "france-1");
  w.countries.uk.equipment.ship = 0;
  w.countries.uk.equipment.submarine = 0;
  w.countries.uk.equipment.carrier = 0;
  assert.equal(routeTo(w, army, "france-1"), null);
  const t = w.armies.find((a) => a.country === "turkey")!;
  assert.equal(routeTo(w, t, "bulgaria-0"), null);
});
test("Başkent bağlantısı kesilince ikmal düşer", () => {
  const w = createWorld("turkey");
  assert.ok(supplyNetwork(w, "turkey").has("turkey-0"));
  w.provinces["turkey-0"].controller = "germany";
  assert.equal(supplyNetwork(w, "turkey").size, 0);
  assert.equal(localSupply(w, "turkey", "turkey-2"), 0.08);
});
test("İkmal ve organizasyon savaş gücünü gerçekten etkiler", () => {
  const w = createWorld("germany"),
    a = w.armies.find((a) => a.country === "germany")!;
  const full = combatPower(w, a, true, "poland-0");
  a.supply = 0.1;
  a.organization = 20;
  assert.ok(combatPower(w, a, true, "poland-0") < full * 0.3);
});
test("Aynı gündeki iki farklı ele geçirme birbirini silmez", () => {
  const w = createWorld("germany");
  w.countries.germany.wars = ["poland"];
  w.countries.poland.wars = ["germany"];
  w.armies = w.armies.filter((a) => a.country === "germany");
  for (const [i, p] of ["poland-2", "poland-1"].entries())
    w.armies[i].move = { to: p, progress: 10, days: 2 };
  resolveLandDay(w);
  assert.equal(w.provinces["poland-2"].controller, "germany");
  assert.equal(w.provinces["poland-1"].controller, "germany");
});

import { applyAction, advanceDay } from "./engine";
import { economyDay } from "./economy";
import { declareWar } from "./diplomacy";
import { politicsDay, startCivilWar } from "./politics";

test("Geçersiz emir atomiktir; hazine ve kuyruk değişmez", () => {
  const w = createWorld("turkey"),
    result = applyAction(w, {
      type: "build",
      building: "dock",
      province: "turkey-0",
    });
  assert.ok(result.error);
  assert.equal(result.world, w);
  assert.equal(w.countries.turkey.construction.length, 0);
});
test("Üretim mevcut çelikle sınırlıdır ve stoklar negatife inmez", () => {
  const w = createWorld("turkey");
  const c = w.countries.turkey;
  c.stock.steel = 0;
  c.stock.iron = 0;
  for (const p of Object.values(w.provinces))
    if (p.controller === "turkey") p.controller = "germany";
  const before = c.equipment.rifle;
  economyDay(w);
  assert.equal(c.equipment.rifle, before);
  assert.ok(c.stock.steel >= 0);
});
test("İnşaat ve asker eğitimi zaman alır; insan gücü ve silahı peşin tüketir", () => {
  let w = createWorld("turkey");
  const manpower = w.countries.turkey.manpower,
    rifles = w.countries.turkey.equipment.rifle;
  let r = applyAction(w, {
    type: "recruit",
    unit: "infantry",
    province: "turkey-0",
  });
  assert.equal(r.error, null);
  w = r.world;
  assert.equal(w.countries.turkey.manpower, manpower - 9000);
  assert.equal(w.countries.turkey.equipment.rifle, rifles - 90);
  const before = w.armies.length;
  for (let i = 0; i < 27; i++) economyDay(w);
  assert.equal(w.armies.length, before);
  economyDay(w);
  assert.equal(w.armies.length, before + 1);
});
test("Savaş gerekçesi ve saldırmazlık paktı doğrulanır", () => {
  let w = createWorld("turkey");
  assert.ok(
    applyAction(w, { type: "diplomacy", target: "bulgaria", kind: "war" })
      .error,
  );
  w = applyAction(w, {
    type: "diplomacy",
    target: "bulgaria",
    kind: "justify",
  }).world;
  w.day = 45;
  politicsDay(w);
  assert.ok(w.countries.turkey.claims.includes("bulgaria"));
  w.countries.turkey.pacts.bulgaria = 100;
  assert.ok(
    applyAction(w, { type: "diplomacy", target: "bulgaria", kind: "war" })
      .error,
  );
  w.countries.turkey.pacts.bulgaria = 0;
  w = applyAction(w, {
    type: "diplomacy",
    target: "bulgaria",
    kind: "war",
  }).world;
  assert.ok(w.countries.bulgaria.wars.includes("turkey"));
});
test("Araştırma önkoşulları çalışır ve tamamlanması üretimi açar", () => {
  let w = createWorld("turkey");
  assert.ok(applyAction(w, { type: "research", id: "armor2" }).error);
  w = applyAction(w, { type: "research", id: "armor1" }).world;
  for (let i = 0; i < 80; i++) politicsDay(w);
  assert.ok(w.countries.turkey.tech.includes("armor1"));
  w.countries.turkey.production = [];
  assert.equal(
    applyAction(w, { type: "production", equipment: "lightTank", factories: 1 })
      .error,
    null,
  );
});
test("İç savaş ayrı ülke ve topraklar oluşturur; yalnızca bildirim değildir", () => {
  const w = createWorld("spain");
  startCivilWar(w, "spain", true);
  assert.ok(w.countries["spain-rebels"]);
  assert.ok(
    Object.values(w.provinces).some((p) => p.controller === "spain-rebels"),
  );
  assert.ok(w.countries.spain.wars.includes("spain-rebels"));
});
test("Aynı kayıt ve aynı gün adımı deterministiktir, girdi değişmez", () => {
  const w = createWorld("turkey");
  const json = JSON.stringify(w);
  assert.deepEqual(advanceDay(w), advanceDay(w));
  assert.equal(JSON.stringify(w), json);
});
test("İttifak savunma savaşına katılır", () => {
  const w = createWorld("germany");
  declareWar(w, "germany", "france");
  assert.ok(w.countries.germany.wars.includes("uk"));
  assert.ok(w.countries.uk.wars.includes("germany"));
});

import {
  encodeSave,
  decodeSave,
  validateWorld,
  countrySchema,
} from "./storage";

test("Kayıt gidiş-dönüşü tüm seferi korur; bozuk referanslar ve sayılar reddedilir", () => {
  const w = createWorld("turkey");
  assert.ok(validateWorld(w));
  assert.deepEqual(decodeSave(encodeSave(w)), w);
  const broken = structuredClone(w);
  broken.armies[0].province = "missing";
  assert.equal(validateWorld(broken), false);
  const bad = structuredClone(w);
  bad.countries.turkey.treasury = Number.NaN;
  assert.equal(validateWorld(bad), false);
  assert.throws(() => decodeSave("{bad"));
  assert.throws(() =>
    decodeSave(
      JSON.stringify({ format: "xarmy-europa-1936", version: 1, world: {} }),
    ),
  );
});
test("Bir yıllık simülasyon: günlük stoklar, kayıt ve AI ülkeleri tutarlı kalır", () => {
  let w = createWorld("turkey", "alternative", 42);
  const start = w.countries.germany.treasury;
  for (let i = 0; i < 370; i++) w = advanceDay(w);
  assert.ok(w.countries.germany.tech.length > 4);
  assert.notEqual(w.countries.germany.treasury, start);
  assert.ok(validateWorld(w));
  assert.deepEqual(decodeSave(encodeSave(w)), w);
});

import { operationsDay } from "./operations";

test("İnşaat yalnızca yeterli iş tamamlanınca fabrikayı artırır", () => {
  let w = createWorld("turkey");
  const before = w.provinces["turkey-0"].buildings.civil;
  w = applyAction(w, {
    type: "build",
    building: "civil",
    province: "turkey-0",
  }).world;
  economyDay(w);
  assert.equal(w.provinces["turkey-0"].buildings.civil, before);
  for (let i = 0; i < 60; i++) economyDay(w);
  assert.equal(w.provinces["turkey-0"].buildings.civil, before + 1);
  assert.equal(w.countries.turkey.construction.length, 0);
});
test("Yoldayken geçiş izni kaldırılırsa ordu tarafsız ülkeye giremez", () => {
  const w = createWorld("uk"),
    a = w.armies.find((a) => a.country === "uk")!;
  a.province = "uk-0";
  a.move = { to: "france-1", progress: 10, days: 1 };
  w.countries.uk.allies = [];
  w.countries.france.allies = [];
  resolveLandDay(w);
  assert.equal(a.province, "uk-0");
  assert.equal(a.move, null);
});
test("Başkent ve yeterli zafer puanı kaybı teslimiyet; barış seçimi mülkiyeti değiştirir", () => {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  for (const p of Object.values(w.provinces))
    if (p.owner === "poland") p.controller = "germany";
  resolveLandDay(w);
  assert.equal(w.countries.poland.capitulated, true);
  assert.equal(w.countries.poland.victor, "germany");
  const result = applyAction(w, {
    type: "diplomacy",
    target: "poland",
    kind: "puppet",
  });
  assert.equal(result.error, null);
  assert.equal(result.world.countries.poland.subjectOf, "germany");
  assert.equal(result.world.provinces["poland-0"].controller, "poland");
  assert.ok(validateWorld(result.world));
});
test("Sabotaj gerçek tesis hasarı verir; ajan görevden döner", () => {
  const w = createWorld("turkey", "historical", 0),
    c = w.countries.turkey;
  c.agency = true;
  c.agents = 1;
  const result = applyAction(w, {
    type: "mission",
    target: "germany",
    mission: "sabotage",
  });
  assert.equal(result.error, null);
  const next = result.world;
  next.countries.turkey.missions[0].progress = 41;
  operationsDay(next);
  assert.equal(next.provinces["germany-0"].damage, 65);
  assert.equal(next.countries.turkey.agents, 1);
  assert.equal(next.countries.turkey.missions.length, 0);
});
test("Bombardıman yakıt tüketir ve düşmanın üretim tesislerini hasara uğratır", () => {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  w.countries.germany.air = { mission: "strategic", target: "poland" };
  const fuel = w.countries.germany.stock.fuel;
  operationsDay(w);
  assert.ok(w.countries.germany.stock.fuel < fuel);
  assert.ok(w.provinces["poland-0"].damage > 0);
});
test("Askerî danışman ve lojistik komutanı savaş / ikmal değerlerini değiştirir", () => {
  const w = createWorld("turkey"),
    a = w.armies.find((a) => a.country === "turkey")!,
    c = w.countries.turkey;
  const power = combatPower(w, a, true, "turkey-0");
  c.advisor = "army";
  assert.ok(combatPower(w, a, true, "turkey-0") > power);
  w.provinces[a.province].damage = 70;
  resolveLandDay(w);
  const supply = a.supply;
  a.general = c.generals[1].id;
  resolveLandDay(w);
  assert.ok(a.supply > supply);
});
test("Tarihsel simülasyon 1941 yılına ulaşır; krizler ve kayıt şeması tutarlı kalır", () => {
  let w = createWorld("turkey", "historical", 1936);
  for (let i = 0; i < 2050; i++) {
    w = advanceDay(w);
    if (i % 120 === 0)
      assert.ok(
        validateWorld(w),
        `Geçersiz kayıt, gün ${w.day}: ${Object.values(w.countries)
          .flatMap((c) =>
            Object.entries(countrySchema)
              .filter(([k, v]) => !v(c[k as keyof typeof c]))
              .map(
                ([k]) =>
                  c.id +
                  "." +
                  k +
                  ": " +
                  JSON.stringify(c[k as keyof typeof c]),
              ),
          )
          .join(";")}`,
      );
  }
  assert.ok(w.firedEvents.includes("germany-poland"));
  assert.ok(w.firedEvents.includes("germany-ussr"));
  assert.ok(w.countries["spain-rebels"]);
  assert.equal(w.countries.turkey.leader, "İsmet İnönü");
  assert.ok(validateWorld(w));
});

test("Çizilen savunma hattı birlikleri dağıtır; tekil emir birliği hattan ayırır", () => {
  let w = createWorld("turkey");
  const armies = w.armies
    .filter((a) => a.country === "turkey")
    .map((a) => a.id);
  const result = applyAction(w, {
    type: "front",
    provinces: ["turkey-0", "turkey-4"],
    armies,
  });
  assert.equal(result.error, null);
  w = advanceDay(result.world);
  assert.equal(w.fronts.length, 1);
  assert.equal(w.fronts[0].armies.length, armies.length);
  assert.ok(w.armies.find((a) => a.id === armies[1])?.move);
  w = applyAction(w, { type: "halt", army: armies[1] }).world;
  assert.equal(w.fronts[0].armies.length, 1);
  assert.ok(validateWorld(w));
});
