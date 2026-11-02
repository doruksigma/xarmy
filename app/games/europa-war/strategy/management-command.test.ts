import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCommand,
  executeCommand,
  executeCommandInPlace,
} from "./commands";
import { manage, managementDay } from "./management";
import { researchSlots } from "./politics";
import { EQUIPMENT } from "./catalog";
import { capacity, controlled, createWorld, GEOGRAPHY } from "./world";
import { portZone, seaRoute, shipOperational } from "./military-assets";
import { validateWorld } from "./storage";
import type { Action, AirModel, Equipment, ShipModel, World } from "./types";

function submitter(world: World, issuer = world.player) {
  return (action: Action) =>
    executeCommandInPlace(world, createCommand(world, action, issuer), issuer)
      .status !== "rejected";
}
function productionWorld() {
  const world = createWorld("turkey");
  const c = world.countries.turkey;
  c.treasury = 0;
  c.tech = [];
  for (const model of Object.keys(c.equipment) as Equipment[])
    c.equipment[model] = 0;
  for (const p of controlled(world, c.id)) {
    p.buildings.military = 0;
    p.buildings.dock = 0;
  }
  world.provinces[c.capital].buildings.military = 4;
  c.production = [
    { equipment: "artillery", factories: 5, efficiency: 0.7, progress: 0.3 },
    { equipment: "heavyTank", factories: 5, efficiency: 0.4, progress: 2.5 },
  ];
  return world;
}

test("Yardımcı yönetim reddedilen komutların dışında gizli kaynak veya tahsis değişikliği yapmaz", () => {
  const world = productionWorld();
  // Even a matching country summary must not hide a wing's differing order.
  world.countries.turkey.air.wings[0].mission = "superiority";
  const before = structuredClone(world),
    emitted: Action[] = [];
  for (const area of [
    "economy",
    "research",
    "recruitment",
    "operations",
  ] as const)
    manage(world, world.countries.turkey, area, (action) => {
      emitted.push(action);
      return false;
    });
  assert.ok(emitted.some((a) => a.type === "production"));
  assert.ok(emitted.some((a) => a.type === "research"));
  assert.ok(emitted.some((a) => a.type === "air"));
  assert.ok(emitted.some((a) => a.type === "navy"));
  assert.deepEqual(world, before);
});

function operationsWorld() {
  const world = createWorld("germany"),
    c = world.countries.germany;
  c.wars = ["poland"];
  world.countries.poland.wars = [c.id];
  // Give this wartime fixture a Polish-controlled Baltic port; the 1936
  // scenario keeps Danzig separate and has no Polish port by default.
  world.provinces["sweden-0"].controller = "poland";
  for (const model of Object.keys(c.equipment) as Equipment[])
    c.equipment[model] = 0;
  c.stock.fuel = 10000;
  world.provinces[c.capital].buildings.airfield = 3;
  c.air.wings = (
    [
      "fighter",
      "bomber",
      "strategicBomber",
      "reconPlane",
      "transport",
    ] as AirModel[]
  ).map((model) => ({
    id: `operation-${model}`,
    name: model,
    model,
    count: 8,
    size: 8,
    base: c.capital,
    target: c.capital,
    mission: "idle",
    readiness: 80,
    experience: 0,
  }));
  const port = controlled(world, c.id).find((p) => GEOGRAPHY[p.id].port)!.id,
    enemyPort = controlled(world, "poland").find(
      (p) => GEOGRAPHY[p.id].port,
    )!.id;
  c.navy.ships = (["ship", "submarine"] as ShipModel[]).map((model) => ({
    id: `operation-${model}`,
    name: model,
    model,
    health: 100,
    experience: 0,
    port,
    zone: portZone(enemyPort),
    mission: "idle",
    aircraft: 0,
    transit: 0,
  }));
  return world;
}

function operationOrders(world: World) {
  const attempts: { action: Action; accepted: boolean }[] = [];
  manage(world, world.countries[world.player], "operations", (action) => {
    const accepted = submitter(world)(action);
    attempts.push({ action, accepted });
    return accepted;
  });
  return attempts;
}

test("Doğru hava ve deniz emirleri haftalık tekrarlanmaz; özel kanatlar görevlerini korur", () => {
  const world = operationsWorld(),
    first = operationOrders(world),
    c = world.countries.germany;
  assert.ok(first.length > 0 && first.every((step) => step.accepted));
  assert.deepEqual(
    c.air.wings.map((wing) => wing.mission),
    ["superiority", "support", "strategic", "recon", "idle"],
  );
  assert.deepEqual(
    c.navy.ships.map((ship) => ship.mission),
    ["escort", "raid"],
  );
  // A ship already travelling to its intended zone has its order; reissuing
  // must not fail or charge fuel merely because transit has not finished yet.
  for (const ship of c.navy.ships) ship.transit = 2;
  const before = structuredClone(world);
  assert.deepEqual(operationOrders(world), []);
  assert.deepEqual(world, before, "No new receipt, order or resource change");
});

test("Bombardıman uçağı olmayan ülke avcılarını hava üstünlüğüne gönderir", () => {
  const world = operationsWorld();
  world.countries.germany.air.wings = world.countries.germany.air.wings.filter(
    (wing) => wing.model === "fighter",
  );
  const attempts = operationOrders(world),
    country = world.countries.germany;
  assert.ok(attempts.every((step) => step.accepted));
  assert.equal(country.air.mission, "superiority");
  assert.equal(country.air.wings[0].mission, "superiority");
  assert.equal(country.air.wings[0].target, world.countries.poland.capital);
  assert.deepEqual(operationOrders(world), []);
});

test("Denizaltısı olmayan ülke yüzey filosuna reddedilen baskın yerine devriye verir", () => {
  const world = operationsWorld();
  world.countries.germany.navy.ships =
    world.countries.germany.navy.ships.filter(
      (ship) => ship.model !== "submarine",
    );
  const attempts = operationOrders(world),
    country = world.countries.germany;
  assert.ok(attempts.every((step) => step.accepted));
  assert.equal(country.navy.mission, "patrol");
  assert.ok(country.navy.ships.every((ship) => ship.mission === "patrol"));
  assert.ok(country.navy.ships.every((ship) => ship.zone === "baltic"));
  assert.deepEqual(operationOrders(world), []);
});

test("Görev aynı kalsa da kaybedilen ikmal limanı erişilebilir kendi limanıyla değiştirilir", () => {
  const world = operationsWorld();
  operationOrders(world);
  const c = world.countries.germany,
    lostPort = c.navy.ships[0].port,
    beforeOrders = c.navy.ships.map((ship) => ({
      mission: ship.mission,
      zone: ship.zone,
    }));
  // Keep the target's existing first port/zone unchanged by capturing this
  // German port for a third country, outside the war.
  world.provinces[lostPort].controller = "france";
  assert.ok(c.navy.ships.every((ship) => !shipOperational(world, c, ship)));
  const attempts = operationOrders(world),
    current = world.countries.germany;
  assert.deepEqual(
    attempts.map((step) => step.action.type),
    ["navy"],
  );
  assert.ok(attempts[0].accepted);
  assert.deepEqual(
    current.navy.ships.map((ship) => ({
      mission: ship.mission,
      zone: ship.zone,
    })),
    beforeOrders,
  );
  assert.ok(
    current.navy.ships.every(
      (ship) =>
        ship.port !== lostPort &&
        world.provinces[ship.port].controller === current.id &&
        shipOperational(world, current, ship),
    ),
  );
  assert.deepEqual(operationOrders(world), []);
});

test("Boğaz kapanınca aynı görevdeki filo açık ikmal rotası olan limana bağlanır", () => {
  const world = operationsWorld();
  operationOrders(world);
  const c = world.countries.germany;
  for (const ship of c.navy.ships) ship.port = "germany-1";
  world.provinces["denmark-0"].controller = "poland";
  assert.equal(seaRoute(world, c.id, "north", "baltic"), null);
  const attempts = operationOrders(world),
    current = world.countries.germany;
  assert.deepEqual(
    attempts.map((step) => step.action.type),
    ["navy"],
  );
  assert.ok(attempts[0].accepted);
  assert.ok(
    current.navy.ships.every(
      (ship) =>
        portZone(ship.port) === "baltic" &&
        world.provinces[ship.port].controller === current.id &&
        shipOperational(world, current, ship),
    ),
  );
  assert.deepEqual(operationOrders(world), []);
});

test("İntikal eden geminin ikmal limanı ancak intikal bittikten sonra değiştirilir", () => {
  const world = operationsWorld();
  operationOrders(world);
  const c = world.countries.germany,
    lostPort = c.navy.ships[0].port;
  for (const ship of c.navy.ships) ship.transit = 1;
  world.provinces[lostPort].controller = "france";
  const before = structuredClone(world);
  assert.deepEqual(operationOrders(world), []);
  assert.deepEqual(world, before);
  for (const ship of c.navy.ships) ship.transit = 0;
  const attempts = operationOrders(world);
  assert.deepEqual(
    attempts.map((step) => step.action.type),
    ["navy"],
  );
  assert.ok(attempts[0].accepted);
  assert.ok(
    world.countries.germany.navy.ships.every((ship) => ship.port !== lostPort),
  );
});

test("Ülke emri değişmese de yeni oluşturulan kanat ve gemiye ilk görevleri verilir", () => {
  const world = operationsWorld();
  operationOrders(world);
  const before = world.countries.germany;
  before.equipment.bomber = 8;
  before.equipment.submarine = 1;
  const wingIds = new Set(before.air.wings.map((wing) => wing.id)),
    shipIds = new Set(before.navy.ships.map((ship) => ship.id)),
    attempts = operationOrders(world),
    c = world.countries.germany;
  assert.ok(attempts.every((step) => step.accepted));
  for (const type of ["createWing", "commission", "air", "navy"])
    assert.ok(attempts.some((step) => step.action.type === type));
  const newWing = c.air.wings.find((wing) => !wingIds.has(wing.id))!,
    newShip = c.navy.ships.find((ship) => !shipIds.has(ship.id))!;
  assert.equal(newWing.mission, "support");
  assert.equal(newWing.target, world.countries.poland.capital);
  assert.equal(newShip.mission, "raid");
  assert.equal(newShip.zone, "baltic");
  assert.deepEqual(operationOrders(world), []);
});

test("Yalnız özel kanat boşta kaldığında genel hava emri yerine gerekli kanat emri verilir", () => {
  const world = operationsWorld();
  operationOrders(world);
  const wing = world.countries.germany.air.wings.find(
    (candidate) => candidate.model === "reconPlane",
  )!;
  wing.mission = "idle";
  const attempts = operationOrders(world);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].action.type, "wing");
  assert.equal(attempts[0].accepted, true);
  assert.equal(
    world.countries.germany.air.wings.find(
      (candidate) => candidate.id === wing.id,
    )!.mission,
    "recon",
  );
});

test("Başkent değişince hava hedefleri; düşman değişince hava ve deniz hedefleri yenilenir", () => {
  const world = operationsWorld();
  operationOrders(world);
  const poland = world.countries.poland,
    nextCapital = controlled(world, poland.id).find(
      (p) => p.id !== poland.capital,
    )!.id;
  poland.capital = nextCapital;
  const capitalOrders = operationOrders(world);
  assert.ok(capitalOrders.some((step) => step.action.type === "air"));
  assert.ok(capitalOrders.every((step) => step.accepted));
  assert.ok(
    world.countries.germany.air.wings
      .filter((wing) => wing.mission !== "idle")
      .every((wing) => wing.target === nextCapital),
  );
  world.countries.germany.wars = ["netherlands"];
  world.countries.netherlands.wars = ["germany"];
  const targetOrders = operationOrders(world);
  assert.ok(targetOrders.some((step) => step.action.type === "air"));
  assert.ok(targetOrders.some((step) => step.action.type === "navy"));
  assert.ok(targetOrders.every((step) => step.accepted));
  assert.equal(world.countries.germany.air.target, "netherlands");
  assert.equal(world.countries.germany.navy.target, "netherlands");
  assert.ok(
    world.countries.germany.navy.ships.every((ship) => ship.zone === "north"),
  );
});

test("Aynı hedef ülkenin ilk kontrol edilen limanı değişirse filo yeni denize yönelir", () => {
  const world = operationsWorld();
  operationOrders(world);
  // Poland loses its original ports and gains a Black Sea port. Its country
  // identifier stays the same, but its desired naval theatre has changed.
  for (const p of controlled(world, "poland"))
    if (GEOGRAPHY[p.id].port) p.controller = "germany";
  world.provinces["romania-5"].controller = "poland";
  assert.ok(GEOGRAPHY["romania-5"].port);
  const attempts = operationOrders(world);
  assert.deepEqual(
    attempts.map((step) => step.action.type),
    ["navy"],
  );
  assert.ok(attempts[0].accepted);
  assert.ok(
    world.countries.germany.navy.ships.every((ship) => ship.zone === "black"),
  );
  assert.deepEqual(operationOrders(world), []);
});

test("Kıyısız hedef donanmanın seçili bölgesini kullanır; boş kuvvetlere gereksiz görev üretilmez", () => {
  const world = operationsWorld(),
    c = world.countries.germany;
  c.wars = ["hungary"];
  world.countries.hungary.wars = [c.id];
  c.navy.zone = "mediterranean";
  const attempts = operationOrders(world);
  assert.ok(attempts.every((step) => step.accepted));
  assert.ok(
    world.countries.germany.navy.ships.every(
      (ship) => ship.zone === "mediterranean",
    ),
  );
  assert.deepEqual(operationOrders(world), []);
  world.countries.germany.air.wings = [];
  world.countries.germany.navy.ships = [];
  assert.deepEqual(operationOrders(world), []);
});

test("Otomatik üretim artıştan önce tüm fazla tahsisleri azaltır ve ücretli işi korur", () => {
  const world = productionWorld();
  const before = structuredClone(world.countries.turkey);
  const submitted: {
    action: Action;
    previous: number;
    next: number;
    accepted: boolean;
  }[] = [];
  const sum = () =>
    world.countries.turkey.production
      .filter((line) => !EQUIPMENT[line.equipment].naval)
      .reduce((n, line) => n + line.factories, 0);
  manage(world, world.countries.turkey, "economy", (action) => {
    const previous = sum();
    const accepted = submitter(world)(action);
    submitted.push({ action, previous, next: sum(), accepted });
    return accepted;
  });
  const c = world.countries.turkey;
  const pool = Math.floor(capacity(world, c.id, "military"));
  assert.ok(submitted.length >= 3);
  assert.ok(submitted.every((s) => s.accepted));
  const increase = submitted.findIndex((s) => s.next > s.previous);
  assert.ok(
    increase >= 2,
    "Both surplus lines must shrink before new capacity is requested",
  );
  for (const step of submitted)
    assert.ok(step.next <= pool || step.next <= step.previous);
  assert.ok(sum() <= pool);
  const heavy = c.production.find((line) => line.equipment === "heavyTank")!;
  assert.equal(heavy.factories, 0);
  assert.equal(heavy.progress, 2.5);
  assert.equal(heavy.efficiency, 0.4);
  assert.equal(
    c.production.find((line) => line.equipment === "artillery")!.efficiency,
    0.7,
  );
  assert.equal(
    c.production.find((line) => line.equipment === "artillery")!.progress,
    0.3,
  );
  assert.deepEqual(c.stock, before.stock);
  assert.deepEqual(c.equipment, before.equipment);
  assert.ok(validateWorld(world));
});

test("Araştırılmamış eski üretim hattı durdurulabilir; yeni hat veya kapasite artışı açılamaz", () => {
  const world = productionWorld();
  const issuer = world.player;
  const increase: Action = {
    type: "production",
    equipment: "heavyTank",
    factories: 6,
  };
  assert.equal(
    executeCommandInPlace(world, createCommand(world, increase), issuer).status,
    "rejected",
  );
  assert.equal(
    submitter(world)({
      type: "production",
      equipment: "heavyTank",
      factories: 0,
    }),
    true,
  );
  const before = structuredClone(world);
  assert.equal(
    submitter(world)({
      type: "production",
      equipment: "heavyTank",
      factories: 1,
    }),
    false,
  );
  assert.equal(
    submitter(world)({
      type: "production",
      equipment: "mediumTank",
      factories: 1,
    }),
    false,
  );
  assert.deepEqual(world, before);
  assert.equal(
    world.countries.turkey.production.find(
      (line) => line.equipment === "heavyTank",
    )!.progress,
    2.5,
  );
});

test("Araştırma planı her işlemden sonra güncel ülkeyi okuyarak boş yuvalar kadar komut verir", () => {
  const world = createWorld("germany");
  const before = world.countries.germany;
  before.research = [];
  before.focus = null;
  before.political = 1000;
  const available = researchSlots(before),
    attempts: Action[] = [];
  manage(world, before, "research", (action) => {
    attempts.push(action);
    return submitter(world)(action);
  });
  const c = world.countries.germany;
  assert.equal(c.research.length, available);
  assert.equal(attempts.filter((a) => a.type === "research").length, available);
  assert.ok(c.focus);
  assert.equal(
    before.research.length,
    0,
    "Copy-on-write leaves an old country reference stale; manager must refresh it",
  );
  assert.equal(world.commandState!.cursors.germany, available + 1);
});

test("Harekât yardımcısı yeni kanattan sonra güncel 40-kanat sınırını görür", () => {
  const world = createWorld("turkey");
  const c = world.countries.turkey;
  for (const model of Object.keys(c.equipment) as Equipment[])
    c.equipment[model] = 0;
  const wing = c.air.wings[0];
  c.air.wings = Array.from({ length: 39 }, (_, i) => ({
    ...wing,
    id: `managed-wing-${i}`,
    count: 1,
    size: 1,
  }));
  c.equipment.fighter = 8;
  c.equipment.bomber = 8;
  const attempts: Action[] = [];
  manage(world, c, "operations", (action) => {
    attempts.push(action);
    return submitter(world)(action);
  });
  assert.equal(world.countries.turkey.air.wings.length, 40);
  assert.equal(attempts.filter((a) => a.type === "createWing").length, 1);
  assert.equal(world.countries.turkey.equipment.fighter, 0);
  assert.equal(world.countries.turkey.equipment.bomber, 8);
});

test("Erişilemeyen hava desteği ve konvoy baskını otomatik yönetimde kısmi görev değişikliği bırakmaz", () => {
  const world = createWorld("turkey");
  const c = world.countries.turkey;
  c.wars = ["germany"];
  world.countries.germany.wars = ["turkey"];
  for (const model of Object.keys(c.equipment) as Equipment[])
    c.equipment[model] = 0;
  c.air.wings = c.air.wings.filter((wing) => wing.model === "fighter");
  const port = controlled(world, c.id).find((p) => GEOGRAPHY[p.id].port)!.id;
  const targetPort = controlled(world, "germany").find(
    (p) => GEOGRAPHY[p.id].port,
  )!.id;
  c.navy.ships = [
    {
      id: "managed-surface",
      name: "Yüzey gemisi",
      model: "ship",
      health: 100,
      experience: 0,
      port,
      zone: portZone(targetPort),
      mission: "idle",
      aircraft: 0,
      transit: 0,
    },
    {
      id: "managed-sub",
      name: "Denizaltı",
      model: "submarine",
      health: 100,
      experience: 0,
      port,
      zone: portZone(port),
      mission: "idle",
      aircraft: 0,
      transit: 0,
    },
  ];
  c.stock.fuel = 0;
  const before = structuredClone(world),
    results: { type: string; accepted: boolean }[] = [];
  manage(world, c, "operations", (action) => {
    const accepted = submitter(world)(action);
    results.push({ type: action.type, accepted });
    return accepted;
  });
  assert.deepEqual(results, [
    { type: "air", accepted: false },
    { type: "navy", accepted: false },
  ]);
  assert.deepEqual(world, before);
});

test("Yardımcı plan tek atomik oyuncu emri olarak kaydedilir; tekrar maliyet doğurmaz", () => {
  const world = createWorld("turkey");
  const command = createCommand(world, { type: "autoPlan", area: "research" });
  const result = executeCommand(world, command, world.player);
  assert.equal(result.status, "applied");
  assert.ok(result.world.countries.turkey.research.length > 0);
  assert.ok(result.world.countries.turkey.focus);
  assert.equal(result.world.commandState!.receipts.length, 1);
  assert.equal(result.world.commandState!.receipts[0].action.type, "autoPlan");
  const before = structuredClone(result.world);
  assert.equal(
    executeCommandInPlace(result.world, command, world.player).status,
    "duplicate",
  );
  assert.deepEqual(result.world, before);
});

test("Haftalık yönetim her alan için aynı ülkenin güncel komut yolunu kullanır", () => {
  const world = createWorld("turkey");
  world.day = 7;
  world.countries.turkey.automation = {
    economy: true,
    research: true,
    recruitment: true,
    operations: true,
  };
  const calls: string[] = [];
  managementDay(world, (issuer, action) => {
    calls.push(issuer);
    return submitter(world, issuer)(action);
  });
  assert.ok(calls.length > 3);
  assert.ok(calls.every((issuer) => issuer === "turkey"));
  assert.ok(world.countries.turkey.research.length > 0);
  assert.ok(validateWorld(world));
});
