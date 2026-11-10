import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "./engine";
import { declareWar } from "./diplomacy";
import {
  previewAirOrder,
  previewNavalOrder,
  navalOrderMatches,
} from "./manual-airnaval-orders";
import { AIRCRAFT, SHIPS } from "./advanced-catalog";
import { createWorld, GEOGRAPHY } from "./world";
import { portZone } from "./military-assets";
import type { Action, AirMission, World } from "./types";

function campaign() {
  let w = createWorld("germany");
  const c = w.countries.germany;
  c.air.wings = [];
  c.navy.ships = [];
  c.equipment.bomber = 30;
  c.equipment.destroyer = 1;
  c.stock.fuel = 1000;
  w.provinces[c.capital].buildings.airfield = 2;
  const wing = applyAction(w, {
    type: "createWing",
    model: "bomber",
    count: 10,
    base: c.capital,
  });
  assert.equal(wing.error, null);
  w = wing.world;
  const commission = applyAction(w, {
    type: "commission",
    model: "destroyer",
    port: "germany-1",
  });
  assert.equal(commission.error, null);
  w = commission.world;
  w.countries.germany.air.wings[0].readiness = 100;
  return w;
}

test("Manual air drafts are read-only and the exact composite order commits base, target and mission together", () => {
  const w = campaign();
  declareWar(w, "germany", "poland");
  const c = w.countries.germany,
    wing = c.air.wings[0];
  w.provinces["germany-7"].buildings.airfield = 1;
  const draft = {
    base: "germany-7",
    target: "poland-2",
    mission: "support" as const,
  };
  const before = structuredClone(w);
  const preview = previewAirOrder(w, c, wing, draft);
  assert.equal(preview.error, null);
  assert.equal(preview.fuelPerDay, wing.count * AIRCRAFT.bomber.fuel);
  assert.ok(preview.warnings.some((message) => message.includes("30 puan")));
  assert.deepEqual(w, before);
  const result = applyAction(w, { type: "wing", id: wing.id, ...draft });
  assert.equal(result.error, null);
  const assigned = result.world.countries.germany.air.wings[0];
  assert.equal(assigned.base, draft.base);
  assert.equal(assigned.target, draft.target);
  assert.equal(assigned.mission, "support");
  assert.equal(assigned.readiness, 70);
  assert.equal(w.countries.germany.air.wings[0].mission, "idle");
});

test("Air preview blocks unsupported, neutral, non-port, out-of-range and unavailable-base orders exactly like commands", () => {
  const w = campaign();
  declareWar(w, "germany", "poland");
  declareWar(w, "germany", "ussr");
  const c = w.countries.germany,
    wing = c.air.wings[0];
  for (const draft of [
    { base: c.capital, target: c.capital, mission: "superiority" },
    {
      base: c.capital,
      target: w.countries.austria.capital,
      mission: "support",
    },
    { base: c.capital, target: c.capital, mission: "strategic" },
    { base: c.capital, target: w.countries.poland.capital, mission: "naval" },
    { base: c.capital, target: w.countries.ussr.capital, mission: "strategic" },
    { base: w.countries.poland.capital, target: c.capital, mission: "idle" },
  ] as { base: string; target: string; mission: AirMission }[]) {
    assert.ok(previewAirOrder(w, c, wing, draft).error, JSON.stringify(draft));
    assert.ok(
      applyAction(w, { type: "wing", id: wing.id, ...draft }).error,
      JSON.stringify(draft),
    );
  }
});

test("Air forecast separates valid saved missions from unfunded flights and accounts for the new base load", () => {
  const w = campaign(),
    c = w.countries.germany,
    wing = c.air.wings[0];
  const base = "germany-7";
  w.provinces[base].buildings.airfield = 1;
  c.air.wings.push({
    ...wing,
    id: "crowded-wing",
    base,
    count: 100,
    size: 100,
  });
  const draft = { base, target: base, mission: "support" as const };
  let preview = previewAirOrder(w, c, wing, draft);
  assert.equal(preview.error, null);
  assert.ok(preview.warnings.some((message) => message.includes("kapasitesi")));
  assert.ok(Math.abs(preview.efficiency - (100 / 110) * 0.7) < 1e-8);
  c.stock.fuel = 0;
  preview = previewAirOrder(w, c, wing, draft);
  assert.equal(
    preview.error,
    null,
    "unfunded order can be saved but cannot fly",
  );
  assert.equal(preview.efficiency, 0);
  assert.ok(
    preview.warnings.some((message) => message.includes("yakıt eksik")),
  );
  assert.equal(
    applyAction(w, { type: "wing", id: wing.id, ...draft }).error,
    null,
  );
});

test("Naval preview and real order agree on route, paid transit, mission and days", () => {
  const w = campaign(),
    c = w.countries.germany,
    ship = c.navy.ships[0];
  const draft = { zone: "atlantic" as const, mission: "escort" as const };
  const before = structuredClone(w);
  const preview = previewNavalOrder(w, c, ship, draft);
  assert.equal(preview.error, null);
  assert.ok(preview.route && preview.route.length > 1);
  assert.equal(preview.fuelPerDay, SHIPS.destroyer.fuel);
  assert.deepEqual(w, before);
  const result = applyAction(w, { type: "ship", id: ship.id, ...draft });
  assert.equal(result.error, null);
  const changed = result.world.countries.germany;
  assert.equal(changed.stock.fuel, c.stock.fuel - preview.transitFuel);
  assert.equal(changed.navy.ships[0].transit, preview.transitDays);
  assert.equal(changed.navy.ships[0].zone, "atlantic");
  assert.equal(changed.navy.ships[0].mission, "escort");
});

test("Naval preview explains invalid roles, transit lock, fuel shortage, closed straits and unavailable ports", () => {
  const check = (w: World, draft: Extract<Action, { type: "ship" }>) => {
    const c = w.countries.germany,
      ship = c.navy.ships[0];
    assert.ok(previewNavalOrder(w, c, ship, draft).error);
    assert.ok(applyAction(w, draft).error);
  };
  let w = campaign(),
    ship = w.countries.germany.navy.ships[0];
  check(w, { type: "ship", id: ship.id, zone: ship.zone, mission: "raid" });
  ship.transit = 2;
  check(w, { type: "ship", id: ship.id, zone: ship.zone, mission: "patrol" });
  ship.transit = 0;
  w.countries.germany.stock.fuel = 0;
  check(w, { type: "ship", id: ship.id, zone: "atlantic", mission: "patrol" });
  w = campaign();
  ship = w.countries.germany.navy.ships[0];
  declareWar(w, "germany", "turkey");
  check(w, { type: "ship", id: ship.id, zone: "black", mission: "patrol" });
  for (const p of Object.values(w.provinces))
    if (p.controller === "germany" && GEOGRAPHY[p.id].port)
      p.controller = "poland";
  check(w, { type: "ship", id: ship.id, zone: ship.zone, mission: "idle" });
});

test("Local naval orders remain possible without fuel but warn that the daily mission is unfunded", () => {
  const w = campaign(),
    c = w.countries.germany,
    ship = c.navy.ships[0];
  c.stock.fuel = 0;
  const preview = previewNavalOrder(w, c, ship, {
    zone: portZone(ship.port),
    mission: "patrol",
  });
  assert.equal(preview.error, null);
  assert.equal(preview.transitFuel, 0);
  assert.ok(preview.warnings.some((message) => message.includes("yakıt")));
  assert.equal(
    applyAction(w, {
      type: "ship",
      id: ship.id,
      zone: ship.zone,
      mission: "patrol",
    }).error,
    null,
  );
});

test("A captured home port does not disable a real same-sea rebase and repair order", () => {
  const w = campaign(),
    country = w.countries.germany,
    ship = country.navy.ships[0];
  const alternate = Object.values(w.provinces).find(
    (p) =>
      p.id !== ship.port &&
      GEOGRAPHY[p.id].port &&
      portZone(p.id) === ship.zone,
  );
  assert.ok(alternate);
  // A previously captured port is still a legitimate owned replacement base.
  alternate.controller = country.id;
  for (const p of Object.values(w.provinces))
    if (
      p.controller === country.id &&
      GEOGRAPHY[p.id].port &&
      p.id !== alternate.id &&
      p.id !== ship.port
    )
      p.controller = "poland";
  declareWar(w, "germany", "poland");
  w.provinces[ship.port].controller = "poland";
  ship.mission = "idle";
  ship.health = 60;
  const order = { zone: ship.zone, mission: "idle" as const };
  const preview = previewNavalOrder(w, country, ship, order);
  assert.equal(preview.error, null);
  assert.equal(preview.zone, ship.zone);
  assert.notEqual(preview.home, ship.port);
  assert.equal(
    navalOrderMatches(ship, "idle", preview),
    false,
    "both Apply and Return must remain usable for the changed home",
  );
  const result = applyAction(w, { type: "ship", id: ship.id, ...order });
  assert.equal(result.error, null);
  const rebased = result.world.countries.germany.navy.ships[0];
  assert.equal(rebased.port, preview.home);
  assert.equal(rebased.zone, ship.zone);
  assert.equal(rebased.transit, 0);
  assert.equal(result.world.provinces[rebased.port].controller, country.id);
  assert.equal(navalOrderMatches(rebased, "idle", preview), true);
});
