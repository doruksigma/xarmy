import { test } from "node:test";
import assert from "node:assert/strict";
import { aiDay } from "./ai";
import { declareWar } from "./diplomacy";
import { resolveLandDay } from "./land";
import { tradeRoute } from "./trade-routes";
import { addArmy, clamp, createWorld, localSupply } from "./world";

test("Stacked divisions keep individual supply modifiers and refresh next day", () => {
  const w = createWorld("germany");
  w.armies = [];
  const c = w.countries.germany;
  c.generals[0].trait = "logistics";
  c.cabinet.military = "quartermaster";
  c.allies.push("austria");
  w.countries.austria.allies.push(c.id);
  const armies = Array.from({ length: 12 }, (_, i) => {
    const a = addArmy(w, i < 8 ? c.id : "austria", c.capital);
    if (i === 0) a.general = c.generals[0].id;
    if (i % 2 === 0) a.support.push("logistics");
    return a;
  });
  const expected = () =>
    armies.map((a) =>
      clamp(
        localSupply(w, a.country, a.province) *
          (a.general ? 1.15 : 1) *
          (a.support.includes("logistics") ? 1.2 : 1) *
          (w.countries[a.country].cabinet.military === "quartermaster"
            ? 1.1
            : 1),
        0,
        1,
      ),
    );
  const supplied = expected();
  resolveLandDay(w);
  assert.deepEqual(armies.map((a) => a.supply), supplied);

  w.provinces[c.capital].controller = "poland";
  const cutOff = expected();
  resolveLandDay(w);
  assert.deepEqual(armies.map((a) => a.supply), cutOff);
  assert.ok(armies[0].supply < supplied[0]);
});

test("Readiness work for a larger army stack grows linearly", () => {
  const readsFor = (size: number) => {
    const w = createWorld("germany");
    w.armies = [];
    for (let i = 0; i < size; i++) addArmy(w, "germany", "germany-0");
    let reads = 0;
    w.armies = new Proxy(w.armies, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads++;
        return Reflect.get(target, property, receiver);
      },
    });
    resolveLandDay(w);
    assert.equal(w.armies.length, size);
    return reads;
  };
  // Count array reads instead of elapsed time, so overloaded CI machines do
  // not fail this regression test. Per-division full scans grow quadratically.
  assert.ok(readsFor(240) < readsFor(120) * 3);
});

test("AI divisions reusing a route retain independent orders", () => {
  const w = createWorld("turkey");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const first = addArmy(w, "germany", "germany-0"),
    second = addArmy(w, "germany", "germany-0");
  w.day = (7 - (Object.keys(w.countries).indexOf("germany") % 7)) % 7;
  aiDay(w);
  assert.ok(first.route.length > 0);
  assert.deepEqual(first.route, second.route);
  assert.notEqual(first.route, second.route);
  first.route.shift();
  assert.equal(second.route.length, first.route.length + 1);
});

test("Trade searches reflect changed gates, embargoes and fleet fuel", () => {
  const w = createWorld("uk");
  const original = tradeRoute(w, "portugal", "uk");
  assert.ok(original);
  w.countries.portugal.embargoes.push("uk");
  assert.equal(tradeRoute(w, "portugal", "uk"), null);
  w.countries.portugal.embargoes = [];
  assert.deepEqual(tradeRoute(w, "portugal", "uk"), original);

  declareWar(w, "uk", "germany");
  const sea = tradeRoute(w, "portugal", "uk")!.seas[0];
  for (const ship of w.countries.germany.navy.ships) {
    ship.zone = sea;
    ship.mission = "raid";
    ship.transit = 0;
  }
  const raided = tradeRoute(w, "portugal", "uk")!;
  w.countries.germany.stock.fuel = 0;
  assert.ok(tradeRoute(w, "portugal", "uk")!.delivery > raided.delivery);

  // The next search cannot cross a province newly occupied by the enemy.
  w.provinces["denmark-0"].controller = "germany";
  const blocked = tradeRoute(w, "sweden", "uk");
  if (blocked) assert.ok(!blocked.provinces.includes("denmark-0"));
});
