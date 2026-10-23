import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createWorld } from "./engine";
import { addArmy, GEOGRAPHY } from "./world";
import { resolveLandDay } from "./land";
import { encodeSave, decodeSave } from "./storage";

function groupFixture() {
  const w = createWorld("turkey");
  addArmy(w, w.player, w.countries.turkey.capital);
  const armies = w.armies.filter((a) => a.country === w.player).slice(0, 3);
  assert.equal(armies.length, 3);
  const origin = w.countries.turkey.capital;
  const target = GEOGRAPHY[origin].neighbors.find(
    (e) => !e.sea && w.provinces[e.id].controller === w.player,
  )!.id;
  for (const a of armies) {
    a.province = origin;
    a.organization = 100;
  }
  return { w, ids: armies.map((a) => a.id), origin, target };
}

test("Toplu hareket bütün seçili tümenlere ayrı rota verir; her biri hedefe ulaşır ve kayıt korunur", () => {
  const { w, ids, target } = groupFixture();
  const result = applyAction(w, {
    type: "moveGroup",
    armies: [...ids, ids[0]],
    to: target,
  });
  assert.equal(result.error, null);
  assert.ok(
    ids.every((id) => w.armies.find((a) => a.id === id)!.route.length === 0),
    "Kaynak dünya değişmez",
  );
  const group = result.world.armies.filter((a) => ids.includes(a.id));
  assert.ok(group.every((a) => a.route.at(-1) === target));
  assert.notEqual(
    group[0].route,
    group[1].route,
    "Önbellekteki rota birlikler arasında paylaşılmaz",
  );
  let current = decodeSave(encodeSave(result.world));
  for (
    let day = 0;
    day < 60 &&
    current.armies.some((a) => ids.includes(a.id) && a.province !== target);
    day++
  ) {
    current.day++;
    resolveLandDay(current);
  }
  assert.ok(
    current.armies
      .filter((a) => ids.includes(a.id))
      .every((a) => a.province === target),
  );
  assert.equal(current.armies.filter((a) => ids.includes(a.id)).length, 3);
});

test("Grupta emri alamayan birlik varsa hiçbir tümenin emri kısmen değişmez", () => {
  const { w, ids, target } = groupFixture();
  w.armies.find((a) => a.id === ids[2])!.organization = 2;
  const snapshot = structuredClone(w);
  const result = applyAction(w, { type: "moveGroup", armies: ids, to: target });
  assert.match(result.error!, /organizasyon/);
  assert.equal(result.world, w);
  assert.deepEqual(result.world, snapshot);
  for (const invalid of [
    [],
    [...ids, "deleted-unit"],
    [...ids, w.armies.find((a) => a.country !== w.player)!.id],
  ]) {
    const failure = applyAction(w, { type: "haltGroup", armies: invalid });
    assert.ok(failure.error);
    assert.equal(failure.world, w);
  }
});

test("Toplu dur emri tüm grubu plandan ayırır ve hem devam eden hem sıradaki hareketi iptal eder", () => {
  const { w, ids, origin, target } = groupFixture();
  w.fronts.push({
    id: "group-test-front",
    country: w.player,
    provinces: [origin, target],
    armies: ids,
  });
  for (const a of w.armies.filter((a) => ids.includes(a.id))) {
    a.move = { to: target, progress: 1, days: 5 };
    a.route = [origin];
    a.stance = "advance";
  }
  const result = applyAction(w, { type: "haltGroup", armies: ids });
  assert.equal(result.error, null);
  for (const a of result.world.armies.filter((a) => ids.includes(a.id))) {
    assert.equal(a.move, null);
    assert.deepEqual(a.route, []);
    assert.equal(a.stance, "hold");
  }
  assert.ok(
    result.world.fronts.every((f) => f.armies.every((id) => !ids.includes(id))),
  );
});

test("Hedefteki birlik grubu engellemez; Shift emri her tümenin kendi rota sonuna eklenir", () => {
  const { w, ids, origin, target } = groupFixture();
  w.armies.find((a) => a.id === ids[0])!.province = target;
  const moved = applyAction(w, { type: "moveGroup", armies: ids, to: target });
  assert.equal(moved.error, null);
  assert.deepEqual(moved.world.armies.find((a) => a.id === ids[0])!.route, []);
  const appended = applyAction(moved.world, {
    type: "moveGroup",
    armies: ids,
    to: origin,
    append: true,
  });
  assert.equal(appended.error, null);
  assert.deepEqual(appended.world.armies.find((a) => a.id === ids[0])!.route, [
    origin,
  ]);
  assert.deepEqual(appended.world.armies.find((a) => a.id === ids[1])!.route, [
    target,
    origin,
  ]);
});
