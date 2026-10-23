import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "./engine";
import { declareWar } from "./diplomacy";
import { resolveLandDay } from "./land";
import { planningDay } from "./planning";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { World } from "./types";

const origin = "germany-7",
  target = "poland-2",
  rear = "germany-5";

function campaign() {
  const w = createWorld("germany", "historical", 1936, "normal");
  declareWar(w, "germany", "poland");
  w.armies = [];
  for (let i = 0; i < 16; i++) {
    const army = addArmy(
      w,
      "germany",
      origin,
      i === 0 ? "lightTank" : "infantry",
    );
    army.organization = 100;
    if (i === 1) army.support = ["logistics", "recon"];
  }
  for (const p of Object.values(w.provinces)) {
    p.buildings.infra = 10;
    p.buildings.rail = 10;
    p.buildings.hub = 5;
  }
  w.countries.germany.stock.fuel = 1000;
  return w;
}

function ordered(w: World, to = target) {
  const result = applyAction(w, {
    type: "moveGroup",
    armies: w.armies.filter((a) => a.country === w.player).map((a) => a.id),
    to,
  });
  assert.equal(result.error, null);
  return result.world;
}

function advanceTogether(w: World, ids: string[], to = target, plan = false) {
  for (let day = 0; day < 90; day++) {
    w.day++;
    if (plan) planningDay(w);
    resolveLandDay(w);
    const armies = w.armies.filter((a) => ids.includes(a.id));
    const arrived = armies.filter((a) => a.province === to).length;
    assert.ok(
      arrived === 0 || arrived === ids.length,
      `Aynı toplu emirde önce ${arrived}, sonra kalan tümenler gitmemeli`,
    );
    if (arrived === ids.length) return;
    const advancing = armies.filter((a) => a.move?.to === to);
    if (advancing.length > 1) {
      const progress = advancing.map((a) => a.move!.progress / a.move!.days);
      assert.ok(
        Math.max(...progress) - Math.min(...progress) < 1e-9,
        "Grubun yürüyüş oranları birlikte ilerlemeli",
      );
    }
  }
  assert.fail("Toplu emir 90 günde tamamlanmalı");
}

for (const to of [target, rear])
  test(`Bir tank ve 15 piyade ${to === target ? "düşman" : "dost"} şehre aynı gün birlikte girer`, () => {
    const w = ordered(campaign(), to);
    const ids = w.armies.map((a) => a.id);
    advanceTogether(w, ids, to);
    assert.ok(w.armies.every((a) => a.move === null && !a.marchGroup));
    assert.equal(w.provinces[to].controller, "germany");
  });

test("16 tümen savunucuyla aynı gün savaşır, birlikte hasar alır ve birlikte ilerler", () => {
  const original = campaign();
  const ids = original.armies.map((a) => a.id);
  addArmy(original, "poland", target).organization = 35;
  const w = ordered(original);
  resolveLandDay(w);
  assert.ok(
    w.armies.filter((a) => ids.includes(a.id)).every((a) => a.strength < 100),
  );
  assert.ok(w.battles.some((b) => b.province === target));
  advanceTogether(w, ids);
  assert.ok(
    w.countries.germany.casualties > 0 && w.countries.poland.casualties > 0,
  );
});

test("Taarruz planında aynı şehirdeki 16 farklı hızlı tümen birlikte ilerler", () => {
  const w = campaign(),
    ids = w.armies.map((a) => a.id);
  w.plans.push({
    id: "convoy-plan",
    country: "germany",
    name: "Taarruz",
    armies: ids,
    objectives: [target],
    preparation: 100,
    active: true,
    stance: "aggressive",
  });
  assert.ok(w.armies.every((a) => !a.marchGroup));
  advanceTogether(w, ids, target, true);
});

test("Öncü birlik hedefi alınca tamamlanan planın yoldaki 16 tümeni birlikte kalır", () => {
  const w = campaign(),
    ids = w.armies.map((a) => a.id);
  w.plans.push({
    id: "completed-convoy",
    country: "germany",
    name: "Taarruz",
    armies: ids,
    objectives: [target],
    preparation: 100,
    active: true,
    stance: "aggressive",
  });
  // A separately ordered vanguard reaches the objective before the formation.
  const vanguard = addArmy(w, "germany", origin, "lightTank");
  vanguard.move = { to: target, progress: 0.9, days: 1 };
  planningDay(w);
  resolveLandDay(w);
  assert.equal(vanguard.province, target);
  assert.equal(w.provinces[target].controller, "germany");
  assert.ok(
    w.armies
      .filter((a) => ids.includes(a.id))
      .every((a) => a.province === origin),
  );
  planningDay(w);
  assert.equal(
    w.plans[0].active,
    false,
    "Alınmış hedef planı otomatik tamamlamalı",
  );
  advanceTogether(w, ids, target, true);
});

for (const kind of ["pause", "delete"] as const)
  test(`Planı ${kind === "pause" ? "durdurmak" : "silmek"} bütün üyelerin yürüyüşünü keser`, () => {
    const w = campaign(),
      ids = w.armies.map((a) => a.id);
    w.plans.push({
      id: "cancelled-convoy",
      country: "germany",
      name: "Taarruz",
      armies: ids,
      objectives: [target],
      preparation: 100,
      active: true,
      stance: "aggressive",
    });
    planningDay(w);
    resolveLandDay(w);
    const result = applyAction(w, {
      type: "plan",
      id: "cancelled-convoy",
      kind,
    });
    assert.equal(result.error, null);
    for (let day = 0; day < 4; day++) {
      planningDay(result.world);
      resolveLandDay(result.world);
    }
    assert.ok(
      result.world.armies.every(
        (a) => a.province === origin && !a.move && !a.route.length,
      ),
    );
  });

test("Ayrı verilen bireysel emirlerde tank piyadeden hızlı kalır", () => {
  let w = campaign();
  const tank = w.armies[0].id,
    infantry = w.armies[2].id;
  w.armies = w.armies.filter((a) => [tank, infantry].includes(a.id));
  for (const id of [tank, infantry]) {
    const result = applyAction(w, { type: "move", army: id, to: rear });
    assert.equal(result.error, null);
    w = result.world;
  }
  for (
    let day = 0;
    day < 20 && w.armies.find((a) => a.id === tank)!.province !== rear;
    day++
  )
    resolveLandDay(w);
  assert.equal(w.armies.find((a) => a.id === tank)!.province, rear);
  assert.equal(w.armies.find((a) => a.id === infantry)!.province, origin);
});

test("Yakıt ve ikmal eksikliği 16 kişilik grubu yavaşlatır ama kalıcı olarak durdurmaz", () => {
  const original = campaign();
  original.provinces[origin].buildings.infra = 0;
  original.provinces[origin].buildings.rail = 0;
  original.provinces[origin].buildings.hub = 0;
  original.countries.germany.stock.fuel = 0;
  const w = ordered(original);
  advanceTogether(
    w,
    w.armies.map((a) => a.id),
  );
  assert.ok(w.armies.every((a) => a.strength < 100));
  assert.equal(w.countries.germany.stock.fuel, 0);
});

test("Tek tümeni durdurmak gruptan ayırır; kalan 15 tümen onu beklemeden gider", () => {
  let w = ordered(campaign());
  const halted = w.armies[0].id,
    ids = w.armies.slice(1).map((a) => a.id);
  resolveLandDay(w);
  const result = applyAction(w, { type: "halt", army: halted });
  assert.equal(result.error, null);
  w = result.world;
  assert.equal(w.armies[0].marchGroup, undefined);
  advanceTogether(w, ids);
  assert.equal(w.armies.find((a) => a.id === halted)!.province, origin);
});

test("Yok olan veya muharebede tükenen üye grubun kalanını kilitlemez", () => {
  const w = ordered(campaign());
  const destroyed = w.armies[0],
    exhausted = w.armies[1];
  destroyed.strength = 0;
  exhausted.organization = 8;
  const ids = w.armies.slice(2).map((a) => a.id);
  addArmy(w, "poland", target).organization = 30;
  resolveLandDay(w);
  assert.ok(!w.armies.some((a) => a.id === destroyed.id));
  assert.equal(exhausted.move, null);
  assert.equal(exhausted.marchGroup, undefined);
  advanceTogether(w, ids);
});

test("Yürüyüş kaydı yeniden yüklenir; önceki kayıtlarda grup alanı zorunlu değildir", () => {
  const original = campaign();
  assert.ok(validateWorld(original));
  assert.deepEqual(decodeSave(encodeSave(original)), original);
  let w = ordered(original);
  resolveLandDay(w);
  const ids = w.armies.map((a) => a.id);
  const loaded = decodeSave(encodeSave(w));
  assert.deepEqual(loaded, w);
  w = loaded;
  advanceTogether(w, ids);
  const invalid = ordered(original);
  invalid.armies[0].marchGroup = "__proto__";
  assert.equal(validateWorld(invalid), false);
});

test("Aynı toplu emrin uzaktaki üyesi farklı yürüyüş ayağını bekletmez", () => {
  let w = campaign();
  const remote = w.armies.pop()!;
  remote.province = w.countries.germany.capital;
  assert.notEqual(remote.province, origin);
  assert.ok(!GEOGRAPHY[remote.province].neighbors.some((e) => e.id === target));
  w.armies.push(remote);
  w = ordered(w);
  const nearIds = w.armies.slice(0, -1).map((a) => a.id);
  advanceTogether(w, nearIds);
  assert.notEqual(w.armies.find((a) => a.id === remote.id)!.province, target);
});

test("Shift kuyruğu ve yeni hedef emri toplu yürüyüşü korur", () => {
  let w = ordered(campaign(), rear);
  const ids = w.armies.map((a) => a.id);
  resolveLandDay(w);
  const result = applyAction(w, {
    type: "moveGroup",
    armies: ids,
    to: origin,
    append: true,
  });
  assert.equal(result.error, null);
  w = result.world;
  assert.ok(
    w.armies.every((a) => a.route.at(-1) === origin && a.move?.to === rear),
  );
  advanceTogether(w, ids, rear);
  advanceTogether(w, ids, origin);
  w = ordered(w);
  resolveLandDay(w);
  const changed = applyAction(w, { type: "moveGroup", armies: ids, to: rear });
  assert.equal(changed.error, null);
  w = changed.world;
  assert.ok(w.armies.every((a) => a.move === null));
  advanceTogether(w, ids, rear);
});

test("Önceden ilerlemiş bir tümen gruba katılınca geriye sarılmaz, varışta üyelerini bekler", () => {
  let w = campaign();
  w.armies[0].move = { to: rear, days: 1, progress: 0.9 };
  w = ordered(w, rear);
  resolveLandDay(w);
  assert.ok(w.armies[0].move!.progress >= 0.9);
  assert.ok(w.armies.every((a) => a.province === origin));
  for (let day = 0; day < 30 && w.armies[0].province !== rear; day++) {
    resolveLandDay(w);
    assert.equal(new Set(w.armies.map((a) => a.province)).size, 1);
  }
  assert.ok(w.armies.every((a) => a.province === rear));
});
