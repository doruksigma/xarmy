import { test } from "node:test";
import assert from "node:assert/strict";
import { declareWar } from "./diplomacy";
import { combatPower, resolveLandDay } from "./land";
import { planningDay } from "./planning";
import { addArmy, createWorld, GEOGRAPHY } from "./world";

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
