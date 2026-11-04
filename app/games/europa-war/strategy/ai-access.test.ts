import assert from "node:assert/strict";
import { test } from "node:test";
import { tacticalAccess } from "./ai-access";
import { runCountryTactics } from "./ai-tactics";
import { declareWar } from "./diplomacy";
import { routeTo } from "./land";
import { addArmy, createWorld, GEOGRAPHY } from "./world";

test("Overseas fronts cannot draw island reserves through a blocked sea or trigger repeated whole-world searches", () => {
  const w = createWorld("turkey", "historical", 1936, "hard");
  declareWar(w, "uk", "italy");
  const c = w.countries.uk;
  c.navy.ships = [];
  c.stock.fuel = 0;
  w.armies = [];
  const guard = addArmy(w, c.id, c.capital);
  const reserves = Array.from({ length: 24 }, () => {
    const army = addArmy(w, c.id, c.capital);
    army.strength = 90;
    return army;
  });
  const borders = Object.values(w.provinces).filter(
    (p) =>
      p.controller === c.id &&
      GEOGRAPHY[p.id].neighbors.some(
        (e) => !e.sea && w.provinces[e.id].controller === "italy",
      ),
  );
  assert.ok(
    borders.length > 0,
    "Fixture must retain actual overseas land fronts",
  );
  assert.ok(borders.every((p) => routeTo(w, reserves[0], p.id) === null));
  const descriptors = Object.entries(GEOGRAPHY).map(
    ([id, p]) =>
      [id, Object.getOwnPropertyDescriptor(p, "neighbors")!] as const,
  );
  let reads = 0;
  for (const [id, descriptor] of descriptors)
    Object.defineProperty(GEOGRAPHY[id], "neighbors", {
      configurable: true,
      get() {
        reads++;
        return descriptor.value;
      },
    });
  try {
    runCountryTactics(w, c.id);
    assert.ok(
      w.armies.every(
        (a) => a.province === c.capital && !a.move && a.route.length === 0,
      ),
    );
    assert.equal(w.armies.length, 25);
    assert.equal(w.armies.find((a) => a.id === guard.id)!.stance, "hold");
    assert.ok(
      reads < Object.keys(GEOGRAPHY).length,
      `A shared access graph should not repeatedly walk all 909 provinces (${reads} reads)`,
    );
  } finally {
    for (const [id, descriptor] of descriptors)
      Object.defineProperty(GEOGRAPHY[id], "neighbors", descriptor);
  }
});

test("A tactical pass evaluates the same naval gate once, including repeated failed crossings", () => {
  const w = createWorld("turkey");
  const c = w.countries.uk;
  c.allies = [];
  const from = Object.values(GEOGRAPHY).find(
    (p) => p.country === c.id && p.neighbors.some((e) => e.sea),
  )!;
  const to = from.neighbors.find((e) => e.sea)!.id;
  const original = c.navy.ships;
  let fleetReads = 0;
  Object.defineProperty(c.navy, "ships", {
    configurable: true,
    get() {
      fleetReads++;
      return [];
    },
  });
  try {
    const access = tacticalAccess(w, c.id);
    assert.equal(access.seaOpen(from.id, to), false);
    const firstCheck = fleetReads;
    assert.ok(firstCheck > 0);
    for (let i = 0; i < 200; i++)
      assert.equal(access.seaOpen(from.id, to), false);
    assert.equal(fleetReads, firstCheck);
    tacticalAccess(w, c.id).seaOpen(from.id, to);
    assert.ok(
      fleetReads > firstCheck,
      "A fresh pass must re-evaluate actual fleets",
    );
  } finally {
    Object.defineProperty(c.navy, "ships", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: original,
    });
  }
});

test("Friendly access agrees with validated movement and sees occupation changes on the next pass", () => {
  const w = createWorld("turkey");
  const c = w.countries.germany;
  const army = w.armies.find(
    (a) => a.country === c.id && a.province === c.capital,
  )!;
  const targets = Object.values(w.provinces)
    .filter((p) => p.controller === c.id)
    .slice(0, 10);
  const access = tacticalAccess(w, c.id);
  for (const target of targets)
    assert.equal(
      access.canReach(army.province, target.id),
      !!routeTo(w, army, target.id),
    );
  const occupied = targets.find((p) => p.id !== army.province)!;
  w.provinces[occupied.id].controller = "poland";
  assert.equal(
    tacticalAccess(w, c.id).canReach(army.province, occupied.id),
    false,
  );
});
