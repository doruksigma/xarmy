import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "./engine";
import { declareWar, peace } from "./diplomacy";
import { economyDay, CONSCRIPTION } from "./economy";
import { intelChance, operationsDay } from "./operations";
import { politicsDay } from "./politics";
import { BUILDINGS, EQUIPMENT, MISSIONS, TECHNOLOGIES, UNITS } from "./catalog";
import { createWorld, controlled, friendly } from "./world";
import { validateWorld } from "./storage";
import type {
  Action,
  Building,
  Equipment,
  MissionType,
  Resource,
  UnitType,
  World,
} from "./types";

function order(w: World, action: Action) {
  const result = applyAction(w, action);
  assert.equal(result.error, null, `${action.type}: ${result.error}`);
  return result.world;
}

function rejected(w: World, action: Action) {
  const before = JSON.stringify(w);
  const result = applyAction(w, action);
  assert.ok(result.error, `${action.type} should be rejected`);
  assert.equal(result.world, w);
  assert.equal(JSON.stringify(w), before);
}

function coupWorld() {
  const w = createWorld("germany", "alternative", 0);
  w.countries.germany.agency = true;
  w.countries.germany.agents = 2;
  w.countries.france.stability = 30;
  w.countries.france.parties = {
    democracy: 46,
    republic: 8,
    monarchy: 8,
    communism: 8,
    fascism: 30,
  };
  return w;
}

test("Savunma savaşına katılan müttefik saldırganla çelişen anlaşmalarını bitirir", () => {
  const w = createWorld("germany");
  const attacker = w.countries.germany,
    defender = w.countries.uk;
  attacker.allies.push("uk");
  defender.allies.push("germany");
  attacker.access.push("uk");
  defender.access.push("germany");
  attacker.pacts.uk = defender.pacts.germany = 365;
  declareWar(w, "germany", "france");
  assert.ok(attacker.wars.includes("uk"));
  assert.ok(defender.wars.includes("germany"));
  assert.ok(!attacker.allies.includes("uk"));
  assert.ok(!defender.allies.includes("germany"));
  assert.ok(!attacker.access.includes("uk"));
  assert.ok(!defender.access.includes("germany"));
  assert.equal(attacker.pacts.uk, undefined);
  assert.equal(defender.pacts.germany, undefined);
  assert.equal(friendly(w, "germany", "uk"), false);
  assert.ok(validateWorld(w));
});

test("Darbe için gereken iki boş ajana karşı casusluk ajanı dahil edilmez", () => {
  const w = coupWorld();
  w.countries.germany.counterIntel = true;
  rejected(w, { type: "mission", target: "france", mission: "coup" });
  w.countries.germany.agents = 3;
  const next = order(w, { type: "mission", target: "france", mission: "coup" });
  assert.equal(next.countries.germany.missions.length, 1);
  assert.equal(next.countries.germany.counterIntel, true);
});

test("Başarılı darbe desteklenen siyasi hareketin iç savaşını başlatır", () => {
  const w = order(coupWorld(), {
    type: "mission",
    target: "france",
    mission: "coup",
  });
  w.countries.germany.missions[0].progress = MISSIONS.coup.days - 1;
  operationsDay(w);
  const rebels = w.countries["france-rebels"];
  assert.ok(rebels);
  assert.equal(rebels.ideology, "fascism");
  assert.ok(rebels.wars.includes("france"));
  assert.ok(controlled(w, rebels.id).length > 0);
  assert.equal(w.countries.germany.agents, 2);
  assert.equal(w.countries.germany.missions.length, 0);
  assert.ok(validateWorld(w));
});

test("Ateşkes karşılıklı işgalleri iade eder, yabancı orduları evlerine taşır ve pakt kurar", () => {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  w.day = 50;
  w.provinces["poland-0"].controller = "germany";
  w.provinces["germany-0"].controller = "poland";
  const german = w.armies.find((a) => a.country === "germany")!;
  const polish = w.armies.find((a) => a.country === "poland")!;
  german.province = "poland-0";
  polish.province = "germany-0";
  german.move = { to: "poland-1", progress: 0, days: 10 };
  german.route = ["poland-2"];
  peace(w, "germany", "poland");
  assert.equal(w.provinces["poland-0"].controller, "poland");
  assert.equal(w.provinces["germany-0"].controller, "germany");
  assert.equal(w.provinces[german.province].controller, "germany");
  assert.equal(w.provinces[polish.province].controller, "poland");
  assert.equal(german.move, null);
  assert.deepEqual(german.route, []);
  assert.ok(!w.countries.germany.wars.includes("poland"));
  assert.ok(!w.countries.poland.wars.includes("germany"));
  assert.equal(w.countries.germany.pacts.poland, 415);
  assert.equal(w.countries.poland.pacts.germany, 415);
  assert.ok(validateWorld(w));
});

test("Geçiş izni tek yönlüdür; pakt ve ittifak karşılıklıdır ve yinelenen emir ücret almaz", () => {
  let w = createWorld("turkey");
  w.countries.turkey.political = 200;
  w.countries.bulgaria.relations.turkey = 60;
  w = order(w, { type: "diplomacy", target: "bulgaria", kind: "access" });
  assert.equal(friendly(w, "turkey", "bulgaria"), true);
  assert.equal(friendly(w, "bulgaria", "turkey"), false);
  rejected(w, { type: "diplomacy", target: "bulgaria", kind: "access" });
  w = order(w, { type: "diplomacy", target: "bulgaria", kind: "pact" });
  assert.equal(w.countries.turkey.pacts.bulgaria, 365);
  assert.equal(w.countries.bulgaria.pacts.turkey, 365);
  rejected(w, { type: "diplomacy", target: "bulgaria", kind: "pact" });
  w = order(w, { type: "diplomacy", target: "bulgaria", kind: "alliance" });
  assert.equal(friendly(w, "bulgaria", "turkey"), true);
  assert.equal(w.countries.turkey.political, 125);
  rejected(w, { type: "diplomacy", target: "bulgaria", kind: "alliance" });
});

test("Dış yardım hazine ve silahı aktarır; yetersiz yardım hiçbir kaynağı değiştirmez", () => {
  let w = createWorld("turkey");
  const donor = {
    money: w.countries.turkey.treasury,
    rifles: w.countries.turkey.equipment.rifle,
  };
  const recipient = {
    money: w.countries.bulgaria.treasury,
    rifles: w.countries.bulgaria.equipment.rifle,
  };
  w = order(w, { type: "diplomacy", target: "bulgaria", kind: "aid" });
  assert.equal(w.countries.turkey.treasury, donor.money - 100);
  assert.equal(w.countries.bulgaria.treasury, recipient.money + 100);
  assert.equal(w.countries.turkey.equipment.rifle, donor.rifles - 30);
  assert.equal(w.countries.bulgaria.equipment.rifle, recipient.rifles + 30);
  w.countries.turkey.equipment.rifle = 29;
  rejected(w, { type: "diplomacy", target: "bulgaria", kind: "aid" });
});

test("Ticaret gerçek stok ve ödeme aktarır; ambargo akışı durdurur ve kaldırılınca yeniden başlatır", () => {
  let w = createWorld("turkey");
  w.countries.bulgaria.stock.rubber = 1000;
  w = order(w, {
    type: "trade",
    target: "bulgaria",
    resource: "rubber",
    amount: 5,
  });
  rejected(w, {
    type: "trade",
    target: "bulgaria",
    resource: "rubber",
    amount: 5,
  });
  const delivery = (expected: number) => {
    const baseline = structuredClone(w);
    baseline.trades = [];
    economyDay(baseline);
    economyDay(w);
    for (const [country, sign] of [
      ["turkey", 1],
      ["bulgaria", -1],
    ] as const) {
      assert.ok(
        Math.abs(
          w.countries[country].stock.rubber -
            baseline.countries[country].stock.rubber -
            expected * sign,
        ) < 1e-8,
      );
      assert.ok(
        Math.abs(
          w.countries[country].treasury -
            baseline.countries[country].treasury +
            expected * 2 * sign,
        ) < 1e-8,
      );
    }
  };
  delivery(5);
  w = order(w, { type: "diplomacy", target: "bulgaria", kind: "embargo" });
  delivery(0);
  w = order(w, { type: "diplomacy", target: "bulgaria", kind: "embargo" });
  delivery(5);
  w = order(w, { type: "cancelTrade", id: w.trades[0].id });
  assert.equal(w.trades.length, 0);
});

test("Kaybedilen şehirdeki inşaat durur; iptal kalan işin bedelinin yalnızca %75'ini iade eder", () => {
  let w = order(createWorld("turkey"), {
    type: "build",
    building: "civil",
    province: "turkey-0",
  });
  const project = w.countries.turkey.construction[0];
  project.progress = project.total / 2;
  w.provinces[project.province].controller = "bulgaria";
  economyDay(w);
  assert.equal(project.progress, project.total / 2);
  const money = w.countries.turkey.treasury;
  w = order(w, { type: "cancelBuild", id: project.id });
  assert.equal(
    w.countries.turkey.treasury,
    money + BUILDINGS.civil.cost * 0.375,
  );
  assert.equal(w.countries.turkey.construction.length, 0);
  rejected(w, { type: "cancelBuild", id: project.id });
});

test("Seferberlik yalnızca yeni nüfus payını ekler ve aynı kanun tekrar insan gücü vermez", () => {
  let w = createWorld("turkey");
  const original = w.countries.turkey;
  const additional =
    original.population * CONSCRIPTION.limited.fraction - original.mobilized;
  w = order(w, { type: "conscription", law: "limited" });
  assert.equal(w.countries.turkey.manpower, original.manpower + additional);
  assert.equal(w.countries.turkey.mobilized, original.mobilized + additional);
  rejected(w, { type: "conscription", law: "limited" });
  rejected(w, { type: "conscription", law: "volunteer" });
});

test("Siyasi kampanya destek toplamını korur ve çoğunlukta hükûmeti değiştirir", () => {
  let w = createWorld("turkey", "alternative");
  w.countries.turkey.political = 500;
  for (let i = 0; i < 3; i++) {
    w = order(w, { type: "reform", ideology: "democracy" });
    assert.equal(w.countries.turkey.ideology, "republic");
    assert.ok(
      Math.abs(
        Object.values(w.countries.turkey.parties).reduce((a, b) => a + b, 0) -
          100,
      ) < 1e-8,
    );
  }
  w = order(w, { type: "reform", ideology: "democracy" });
  assert.equal(w.countries.turkey.ideology, "democracy");
  assert.equal(w.countries.turkey.parties.democracy, 60);
  assert.equal(w.countries.turkey.political, 260);
  rejected(w, { type: "reform", ideology: "democracy" });
});

test("Siyasi odak seçimi hükûmeti değiştirir ve karşıt yolu kapatır", () => {
  let w = createWorld("turkey", "alternative");
  w.countries.turkey.focuses = ["stability"];
  w = order(w, { type: "focus", id: "democratic" });
  w.day = 1;
  w.countries.turkey.focus!.progress = 89;
  politicsDay(w);
  assert.equal(w.countries.turkey.ideology, "democracy");
  assert.equal(w.countries.turkey.focus, null);
  assert.ok(w.countries.turkey.focuses.includes("democratic"));
  rejected(w, { type: "focus", id: "authoritarian" });
});

test("Ajan eğitimi 30 günde biter ve karşı casusluk son ajanı operasyondan ayırır", () => {
  let w = createWorld("turkey");
  w = order(w, { type: "agency" });
  const money = w.countries.turkey.treasury;
  w = order(w, { type: "trainAgent" });
  assert.equal(w.countries.turkey.treasury, money - 80);
  rejected(w, { type: "trainAgent" });
  for (let i = 0; i < 29; i++) operationsDay(w);
  assert.equal(w.countries.turkey.agents, 0);
  operationsDay(w);
  assert.equal(w.countries.turkey.agents, 1);
  w = order(w, { type: "counterIntel" });
  rejected(w, { type: "mission", target: "germany", mission: "intel" });
  w = order(w, { type: "counterIntel" });
  w = order(w, { type: "mission", target: "germany", mission: "intel" });
  assert.equal(w.countries.turkey.agents, 0);
});

test("Şifre çözme başarıyı artırır; şifreleme ve karşı casusluk birlikte azaltır", () => {
  const w = createWorld("turkey"),
    actor = w.countries.turkey,
    target = w.countries.germany;
  actor.tech = [];
  target.tech = [];
  assert.equal(intelChance(actor, target), 0.55);
  actor.tech.push("decryption");
  assert.ok(Math.abs(intelChance(actor, target) - 0.7) < 1e-8);
  target.tech.push("encryption");
  target.counterIntel = true;
  assert.ok(Math.abs(intelChance(actor, target) - 0.3) < 1e-8);
});

for (const mission of [
  "intel",
  "plans",
  "propaganda",
  "resistance",
  "diplomacy",
] as MissionType[])
  test(`${MISSIONS[mission].name}: başarılı operasyon gerçek hedef durumunu değiştirir`, () => {
    let w = createWorld("turkey", "alternative", 0);
    w.countries.turkey.agency = true;
    w.countries.turkey.agents = 1;
    if (mission === "resistance")
      w.provinces["poland-0"].controller = "germany";
    const before = structuredClone(w.countries.germany);
    w = order(w, { type: "mission", target: "germany", mission });
    assert.equal(w.countries.turkey.agents, 0);
    const operation = w.countries.turkey.missions[0];
    operation.progress = operation.total - 1;
    operationsDay(w);
    const actor = w.countries.turkey,
      target = w.countries.germany;
    assert.equal(actor.agents, 1);
    assert.equal(actor.missions.length, 0);
    if (mission === "intel" || mission === "plans") {
      assert.equal(actor.intel.germany.level, mission === "plans" ? 90 : 65);
      assert.equal(
        actor.intel.germany.expires,
        w.day + (mission === "plans" ? 90 : 180),
      );
    }
    if (mission === "propaganda") {
      assert.equal(target.stability, before.stability - 8);
      assert.equal(
        target.parties[actor.ideology],
        before.parties[actor.ideology] + 10,
      );
      assert.ok(
        Math.abs(
          Object.values(target.parties).reduce((a, b) => a + b, 0) - 100,
        ) < 1e-8,
      );
    }
    if (mission === "resistance")
      assert.equal(w.provinces["poland-0"].resistance, 25);
    if (mission === "diplomacy") {
      assert.equal(target.relations.turkey, before.relations.turkey + 30);
      assert.equal(actor.relations.germany, target.relations.turkey);
    }
    assert.ok(validateWorld(w));
  });

for (const building of Object.keys(BUILDINGS) as Building[])
  test(`${BUILDINGS[building].name}: ücretli inşaat günlük çalışmayla tamamlanır`, () => {
    let w = createWorld("turkey", "alternative");
    const province = building === "dock" ? "turkey-2" : "turkey-0";
    w.provinces[province].buildings[building] = 0;
    if (building === "radar")
      rejected(w, { type: "build", building, province });
    w.countries.turkey.tech = TECHNOLOGIES.map((t) => t.id);
    const treasury = w.countries.turkey.treasury;
    w = order(w, { type: "build", building, province });
    assert.equal(
      w.countries.turkey.treasury,
      treasury - BUILDINGS[building].cost,
    );
    economyDay(w);
    assert.equal(w.provinces[province].buildings[building], 0);
    assert.ok(w.countries.turkey.construction[0].progress > 0);
    for (let i = 0; i < 500 && w.countries.turkey.construction.length; i++) {
      w.day++;
      economyDay(w);
    }
    assert.equal(w.countries.turkey.construction.length, 0);
    assert.equal(w.provinces[province].buildings[building], 1);
    assert.ok(validateWorld(w));
  });

for (const unit of Object.keys(UNITS) as UnitType[])
  test(`${UNITS[unit].name}: eğitim kaynak tüketir ve gerçek tümenle tamamlanır`, () => {
    let w = createWorld("turkey", "alternative");
    const def = UNITS[unit];
    w.countries.turkey.production = [];
    for (const key of Object.keys(EQUIPMENT) as Equipment[])
      w.countries.turkey.equipment[key] = 1000;
    if (def.tech) {
      w.countries.turkey.tech = [];
      rejected(w, { type: "recruit", unit, province: "turkey-0" });
    }
    w.countries.turkey.tech = TECHNOLOGIES.map((t) => t.id);
    const men = w.countries.turkey.manpower;
    const ids = new Set(w.armies.map((a) => a.id));
    w = order(w, { type: "recruit", unit, province: "turkey-0" });
    assert.equal(w.countries.turkey.manpower, men - def.men);
    for (const [equipment, amount] of Object.entries(def.equipment))
      assert.equal(
        w.countries.turkey.equipment[equipment as Equipment],
        1000 - amount,
      );
    for (let i = 0; i < def.days - 1; i++) {
      w.day++;
      economyDay(w);
    }
    assert.equal(w.armies.length, ids.size);
    w.day++;
    economyDay(w);
    const deployed = w.armies.filter((a) => !ids.has(a.id));
    assert.equal(deployed.length, 1);
    assert.equal(deployed[0].type, unit);
    assert.equal(deployed[0].country, "turkey");
    assert.equal(deployed[0].province, "turkey-0");
    assert.equal(deployed[0].strength, 100);
    assert.equal(w.countries.turkey.recruitment.length, 0);
    assert.ok(validateWorld(w));
  });

for (const equipment of Object.keys(EQUIPMENT) as Equipment[])
  test(`${EQUIPMENT[equipment].name}: üretim kaynak tüketerek kullanılabilir stok oluşturur`, () => {
    let w = createWorld("turkey", "alternative");
    const def = EQUIPMENT[equipment];
    w.countries.turkey.production = [];
    w.provinces["turkey-2"].buildings.dock = 1;
    w.countries.turkey.equipment[equipment] = 0;
    for (const resource of Object.keys(w.countries.turkey.stock) as Resource[])
      w.countries.turkey.stock[resource] = 10000;
    if (def.tech) {
      w.countries.turkey.tech = [];
      rejected(w, { type: "production", equipment, factories: 1 });
    }
    w.countries.turkey.tech = TECHNOLOGIES.map((t) => t.id);
    w = order(w, { type: "production", equipment, factories: 1 });
    const baseline = structuredClone(w);
    baseline.countries.turkey.production = [];
    economyDay(baseline);
    economyDay(w);
    const produced = w.countries.turkey.equipment[equipment];
    assert.ok(produced > 0);
    for (const [resource, amount] of Object.entries(def.inputs)) {
      const used =
        baseline.countries.turkey.stock[resource as Resource] -
        w.countries.turkey.stock[resource as Resource];
      assert.ok(Math.abs(used - produced * amount) < 1e-8);
    }
    for (
      let i = 0;
      i < 1000 && w.countries.turkey.equipment[equipment] < 1;
      i++
    ) {
      w.day++;
      economyDay(w);
    }
    assert.ok(w.countries.turkey.equipment[equipment] >= 1);
    assert.ok(w.countries.turkey.production[0].efficiency > 0.2);
    assert.ok(validateWorld(w));
  });
