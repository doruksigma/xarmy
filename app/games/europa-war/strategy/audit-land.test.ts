import { test } from "node:test";
import assert from "node:assert/strict";
import { declareWar } from "./diplomacy";
import { advanceDay, applyAction } from "./engine";
import { combatPower, resolveLandDay } from "./land";
import { planningDay } from "./planning";
import { addArmy, createWorld, GEOGRAPHY } from "./world";

function borderCampaign() {
  const w = createWorld("germany", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  w.armies = [];
  return w;
}

test("Ağır kayıplı tümen boş düşman şehrinde sonsuza dek yürüyüşte kalmaz", () => {
  const original = borderCampaign();
  const army = addArmy(original, "germany", "germany-7");
  army.strength = 12;
  army.organization = 20;
  // Capture must not depend on a reinforcement crossing the combat retreat threshold.
  original.countries.germany.manpower = 0;
  const order = applyAction(original, {
    type: "move",
    army: army.id,
    to: "poland-2",
  });
  assert.equal(order.error, null);
  const w = order.world;
  for (let day = 0; day < 10; day++) {
    w.day++;
    resolveLandDay(w);
  }
  const arrived = w.armies.find((a) => a.id === army.id)!;
  assert.equal(arrived.province, "poland-2");
  assert.equal(arrived.move, null);
  assert.equal(w.provinces["poland-2"].controller, "germany");
  assert.equal(arrived.strength, 12);
  assert.ok(arrived.organization > 20);
  assert.equal(w.battles.length, 0);
  assert.equal(original.provinces["poland-2"].controller, "poland");
});

test("Savunmasız düşman şehrine yürüyüş gerçek muharebe gibi takviyeyi durdurmaz", () => {
  const w = borderCampaign();
  const army = addArmy(w, "germany", "germany-7");
  army.strength = 70;
  army.organization = 50;
  army.route = ["poland-2"];
  const manpower = w.countries.germany.manpower;

  resolveLandDay(w);

  assert.equal(army.province, "germany-7", "Varış süresi yine tamamlanmalı");
  assert.ok(army.strength > 70);
  assert.ok(army.organization > 50);
  assert.ok(w.countries.germany.manpower < manpower);
  assert.equal(w.battles.length, 0);
});

test("İkmalsiz ve yakıtsız tank yavaşlayarak güvenli arka şehre ulaşır", () => {
  const original = borderCampaign();
  const army = addArmy(original, "germany", "germany-7", "lightTank");
  original.provinces[original.countries.germany.capital].controller = "poland";
  original.countries.germany.stock.fuel = 0;
  const order = applyAction(original, {
    type: "move",
    army: army.id,
    to: "germany-5",
  });
  assert.equal(order.error, null);
  const w = order.world;
  const moving = w.armies.find((a) => a.id === army.id)!;
  let previous = 0;
  for (let day = 0; day < 120 && moving.province !== "germany-5"; day++) {
    w.day++;
    resolveLandDay(w);
    assert.ok(moving.strength > 0);
    if (moving.move) {
      assert.ok(moving.move.progress > previous, "Yürüyüş her gün ilerlemeli");
      previous = moving.move.progress;
    }
  }
  assert.equal(moving.province, "germany-5");
  assert.equal(moving.move, null);
  assert.ok(moving.strength < 100, "İkmal kaybının yıpranması korunmalı");
  assert.equal(w.countries.germany.stock.fuel, 0);
});

test("Gün içinde yok olan birlik savunmacının tek geri çekilme yolunu kapatmaz", () => {
  const w = borderCampaign();
  const target = "poland-2";
  const exit = GEOGRAPHY[target].neighbors.find(
    (e) => !e.sea && w.provinces[e.id].controller === "poland",
  )!.id;
  for (const e of GEOGRAPHY[target].neighbors)
    w.provinces[e.id].controller = e.id === exit ? "poland" : "germany";
  const attacker = addArmy(w, "germany", "germany-7");
  attacker.move = { to: target, progress: 4, days: 2 };
  const defender = addArmy(w, "poland", target);
  defender.organization = 1;
  const dying = addArmy(w, "germany", exit);
  dying.strength = 0.1; // Cut off in enemy territory; lost in the readiness pass.

  resolveLandDay(w);

  assert.ok(!w.armies.some((a) => a.id === dying.id));
  assert.equal(w.armies.find((a) => a.id === defender.id)?.province, exit);
  assert.equal(defender.move, null);
  assert.deepEqual(defender.route, []);
  assert.ok(defender.organization >= 12);
  assert.equal(w.provinces[target].controller, "germany");
});

test("Gerçek günlük sefer döngüsünde toplu saldırı savunmayı yener ve bütün tümenler ilerler", () => {
  let w = borderCampaign();
  const ids = Array.from(
    { length: 3 },
    () => addArmy(w, "germany", "germany-7").id,
  );
  const defender = addArmy(w, "poland", "poland-2");
  defender.organization = 60;
  const result = applyAction(w, {
    type: "moveGroup",
    armies: ids,
    to: defender.province,
  });
  assert.equal(result.error, null);
  w = result.world;
  for (
    let day = 0;
    day < 30 &&
    ids.some(
      (id) => w.armies.find((a) => a.id === id)?.province !== "poland-2",
    );
    day++
  )
    w = advanceDay(w);
  assert.equal(w.provinces["poland-2"].controller, "germany");
  assert.ok(
    ids.every(
      (id) => w.armies.find((a) => a.id === id)?.province === "poland-2",
    ),
  );
  assert.ok(w.countries.poland.casualties > 0);
  assert.ok(w.countries.germany.casualties > 0);
});

test("Tükenen toplu saldırı durur, tek bildirim verir ve dinlenince yeniden emir alır", () => {
  let w = borderCampaign();
  const ids = Array.from({ length: 3 }, () => {
    const a = addArmy(w, "germany", "germany-7");
    a.organization = 10;
    return a.id;
  });
  for (let i = 0; i < 3; i++) {
    const defender = addArmy(w, "poland", "poland-2", "heavyTank");
    defender.organization = 100;
  }
  const order = applyAction(w, {
    type: "moveGroup",
    armies: ids,
    to: "poland-2",
  });
  assert.equal(order.error, null);
  w = order.world;

  resolveLandDay(w);

  for (const id of ids) {
    const a = w.armies.find((a) => a.id === id)!;
    assert.equal(a.province, "germany-7");
    assert.equal(a.move, null);
    assert.deepEqual(a.route, []);
    assert.ok(a.organization < 8);
  }
  const stopped = w.events.filter((e) =>
    e.text.includes("taarruzunda 3 tümen"),
  );
  assert.equal(stopped.length, 1, "Tümen başına bildirim yağmuru oluşmamalı");
  for (let day = 0; day < 10; day++) {
    w.day++;
    resolveLandDay(w);
  }
  assert.equal(
    w.events.filter((e) => e.text.includes("taarruzunda 3 tümen")).length,
    1,
  );
  const again = applyAction(w, {
    type: "moveGroup",
    armies: ids,
    to: "poland-2",
  });
  assert.equal(again.error, null);
  assert.ok(
    again.world.armies
      .filter((a) => ids.includes(a.id))
      .every((a) => a.route[0] === "poland-2"),
  );
});

function competingCapture(allied = false, secondArrived = true) {
  const w = createWorld("germany", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  declareWar(w, "ussr", "poland");
  if (allied) {
    w.countries.germany.allies.push("ussr");
    w.countries.ussr.allies.push("germany");
  }
  w.armies = [];
  const first = addArmy(w, "germany", "germany-7"),
    second = addArmy(w, "ussr", "poland-city-2");
  w.provinces[second.province].controller = second.country;
  first.move = { to: "poland-2", progress: 10, days: 2 };
  second.move = {
    to: "poland-2",
    progress: secondArrived ? 10 : 0,
    days: secondArrived ? 2 : 20,
  };
  return { w, first, second };
}

test("Aynı hedefteki tüm saldıran ve savunan tümenler birlikte savaşır", () => {
  const w = createWorld("germany", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const attackers = ["germany-7", "germany-7", "germany-8"].map((from) => {
    const a = addArmy(w, "germany", from);
    a.organization = 100;
    a.route = ["poland-2"];
    return a;
  });
  const defenders = Array.from({ length: 3 }, () => {
    const a = addArmy(w, "poland", "poland-2");
    a.organization = 100;
    return a;
  });
  const single = structuredClone(w);
  single.armies = single.armies.filter(
    (a) => a.id === attackers[0].id || a.country === "poland",
  );

  resolveLandDay(w);
  resolveLandDay(single);

  assert.equal(w.battles.length, 1);
  assert.equal(w.battles[0].attacker, "germany");
  assert.ok(w.battles[0].attack > single.battles[0].attack * 2.9);
  for (const a of [...attackers, ...defenders]) {
    assert.ok(a.strength < 100, `${a.id} muharebede kayıp vermeli`);
    assert.ok(a.organization < 100, `${a.id} organizasyon kaybetmeli`);
  }
  const loneAttacker = single.armies.find((a) => a.id === attackers[0].id)!;
  const loneDefender = single.armies.find((a) => a.id === defenders[0].id)!;
  assert.ok(attackers[0].strength > loneAttacker.strength);
  assert.ok(defenders[0].strength < loneDefender.strength);
});

test("Aynı gün önce alan tarafsız ülkenin toprağı ikinci saldırana geçmez", () => {
  const { w, first, second } = competingCapture();
  const origin = second.province;

  resolveLandDay(w);

  assert.equal(w.provinces["poland-2"].controller, first.country);
  assert.equal(first.province, "poland-2");
  assert.equal(second.province, origin);
  assert.equal(second.move, null);
  assert.deepEqual(second.route, []);
  assert.equal(w.warScore.ussr?.germany, undefined);
});

test("Aynı gün müttefikçe alınan hedefe varan ordu kontrolü değiştirmez", () => {
  const { w, first, second } = competingCapture(true);

  resolveLandDay(w);

  assert.equal(w.provinces["poland-2"].controller, first.country);
  assert.equal(second.province, "poland-2");
  assert.equal(second.move, null);
  assert.equal(w.provinces["poland-2"].damage, 10);
  assert.equal(w.warScore.ussr?.germany, undefined);
});

test("Müttefik hedefi ele geçirse de yetişmeyen ordu yürüyüşünü tamamlamalı", () => {
  const { w, first, second } = competingCapture(true, false);
  const origin = second.province;

  resolveLandDay(w);

  assert.equal(w.provinces["poland-2"].controller, first.country);
  assert.equal(second.province, origin);
  assert.equal(second.move?.to, "poland-2");
  assert.ok(second.move!.progress < second.move!.days);
});

test("Bir saldıran geri çekilse de aynı hedefteki diğer tümen savaşmayı sürdürür", () => {
  const w = createWorld("germany", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const enemy = addArmy(w, "poland", "poland-1"),
    retreating = addArmy(w, "germany", "germany-7"),
    continuing = addArmy(w, "germany", "germany-8");
  enemy.move = { to: retreating.province, progress: 0, days: 20 };
  retreating.organization = 9;
  retreating.move = { to: "poland-2", progress: 10, days: 2 };
  continuing.move = { to: "poland-2", progress: 10, days: 2 };

  resolveLandDay(w);

  assert.equal(retreating.move, null);
  assert.equal(continuing.province, "poland-2");
  assert.equal(w.provinces["poland-2"].controller, "germany");
});

test("Taarruz planı başka yere yürüyen tümeni saldırı desteği saymaz", () => {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const attacker = addArmy(w, "germany", "germany-7"),
    departing = addArmy(w, "germany", "germany-7", "heavyTank"),
    defender = addArmy(w, "poland", "poland-1");
  for (const a of w.armies) a.organization = 100;
  const rear = GEOGRAPHY[departing.province].neighbors.find(
    (e) => !e.sea && w.provinces[e.id].controller === "germany",
  )!.id;
  departing.route = [rear];
  w.plans = [
    {
      id: "audit-plan",
      country: "germany",
      name: "Kraków harekâtı",
      armies: [attacker.id, departing.id],
      objectives: ["poland-1"],
      preparation: 100,
      active: true,
      stance: "careful",
    },
  ];
  assert.ok(
    combatPower(w, attacker, true, defender.province) /
      combatPower(w, defender, false, defender.province) <
      1.35,
  );

  planningDay(w);

  assert.deepEqual(attacker.route, []);
  assert.deepEqual(departing.route, [rear]);
  // A division already attacking the same objective does provide support.
  departing.route = [defender.province];
  planningDay(w);
  assert.deepEqual(attacker.route, [defender.province]);
});

test("Planın geri çekilme ikmali başkent kaybından sonra yeniden değerlendirilir", () => {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const a = addArmy(w, "germany", "germany-7");
  a.organization = 10;
  a.supply = 0.1;
  w.plans = [
    {
      id: "retreat-plan",
      country: "germany",
      name: "Poznań harekâtı",
      armies: [a.id],
      objectives: ["poland-2"],
      preparation: 100,
      active: true,
      stance: "careful",
    },
  ];
  planningDay(w);
  assert.equal(a.route.length, 1);

  a.route = [];
  w.provinces[w.countries.germany.capital].controller = "poland";
  planningDay(w);
  assert.deepEqual(a.route, []);
});
