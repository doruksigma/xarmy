import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { CAPTURE, CITY_PRODUCTION, HEIGHT, MAX_ROUTE_POINTS, STEP, WIDTH } from "./config";
import { commandUnit, createMatch, step } from "./engine";
import type { City, Match, Unit } from "./engine";
import {
  defaults, loadMatch, migrateMatch, migrateV2Match, migrateV3Match, migrateV4Match, migrateV5Match, readSettings, readStats, recordResult, saveMatch, saveSettings, validMatch,
} from "./storage";
import { getMap, mapIds, passable } from "./terrain";
import type { MapId } from "./terrain";
import { advanceTerritory, createTerritory, isSupplied, TERRITORY_COLS, TERRITORY_ROWS, territoryOwner } from "./territory";

function replaceGlobal(context: TestContext, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function memorySettings(initial: [string, string][] = []) {
  const entries = new Map(initial);
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  };
}

function memoryDatabase(stallTransactions = false) {
  const entries = new Map<IDBValidKey, unknown>();
  const names: string[] = [];
  let closed = 0;
  let aborted = 0;
  const database = {
    objectStoreNames: { contains: (name: string) => name === "data" },
    close() { closed++; },
    transaction() {
      const transaction = {
        error: null,
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        abort() { aborted++; transaction.onabort?.(); },
        objectStore() {
          const perform = <T>(action: () => T) => {
            const request: { result?: T } = {};
            if (!stallTransactions) queueMicrotask(() => {
              request.result = action();
              transaction.oncomplete?.();
            });
            return request;
          };
          return {
            get: (key: IDBValidKey) => perform(() => structuredClone(entries.get(key))),
            put: (value: unknown, key: IDBValidKey) => perform(() => {
              entries.set(key, structuredClone(value));
              return key;
            }),
            getAllKeys: () => perform(() => [...entries.keys()]),
          };
        },
      };
      return transaction;
    },
  };
  const factory = {
    open(name: string) {
      names.push(name);
      const request = { result: database, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  return { entries, names, database, factory, get closed() { return closed; }, get aborted() { return aborted; } };
}

function versionTwoMatch(map: MapId = "valley") {
  const current = createMatch("hard", `existing-v2-${map}`, false, map);
  const commanders: Array<{ id: number; team: 1 | 2; leaderId: number; order: typeof current.units[number]["order"]; autoFront: boolean; nextOrder: number }> = [];
  const membership = new Map<number, number>();
  for (const team of [1, 2] as const) {
    const army = current.units.filter(unit => unit.team === team);
    for (let start = 0; start < army.length; start += 10) {
      const id = commanders.length + 1;
      commanders.push({ id, team, leaderId: army[start].id, order: { mode: "hold" }, autoFront: true, nextOrder: 4 });
      for (const unit of army.slice(start, start + 10)) membership.set(unit.id, id);
    }
  }
  const { territory, ...record } = current;
  void territory;
  return {
    ...record,
    version: 2 as const,
    nextCommanderId: commanders.length + 1,
    commanders,
    units: current.units.map(unit => {
      const { stance, nextOrder, pocketed, pocketTime, ...legacy } = unit;
      void stance; void nextOrder; void pocketed; void pocketTime;
      return { ...legacy, commanderId: membership.get(unit.id)! };
    }),
    cities: current.cities.map(city => ({ ...city,
      progress: city.progress * 8 / CAPTURE,
      build: city.build ? { ...city.build, elapsed: city.build.elapsed * 10 / CITY_PRODUCTION } : null,
    })),
  };
}

function assertCityTimers(migrated: Match, cities: City[], scale = 1) {
  assert.equal(Object.hasOwn(migrated, "recruitment"), false);
  for (const city of migrated.cities) {
    const before = cities.find(prior => prior.id === city.id)!;
    assert.deepEqual(city.build, before.build && { ...before.build, elapsed: before.build.elapsed * scale },
      "each city's own type and elapsed progress survives independently");
  }
}

test("published v2 saves retain soldiers and each city's production and capture percentages", async (context) => {
  const db = memoryDatabase();
  replaceGlobal(context, "indexedDB", db.factory);
  db.entries.set("result:won:existing-result", 1);
  assert.equal(CITY_PRODUCTION, 60); assert.equal(CAPTURE, 24);
  for (const map of mapIds) {
    const legacy = versionTwoMatch(map);
    legacy.elapsed = 27; legacy.nextAi = 32; legacy.shortage = [6, 0];
    legacy.report = { captured: 3, killed: 8, fallen: 2 };
    legacy.units[0].hp -= 4; legacy.units[0].cooldown = 0.3; legacy.units[0].replan = 28;
    const target = legacy.units.find(unit => unit.team === 2)!;
    legacy.units[0].order = { mode: "attack", target: target.id };
    legacy.commanders[0].order = { mode: "attack", target: target.id };
    legacy.commanders[0].autoFront = false; legacy.commanders[0].nextOrder = 28;
    legacy.cities[0].build = { kind: "light", elapsed: 4.5 };
    legacy.cities[1].build = { kind: "heavy", elapsed: 9.5 };
    legacy.cities[2].build = { kind: "light", elapsed: 10 };
    legacy.cities[3].build = null;
    legacy.cities[4].capturing = 2; legacy.cities[4].progress = 4;
    const original = structuredClone(legacy);
    assert.equal(validMatch(legacy), false, "the current guard does not advertise an unmigrated record");
    db.entries.set("current", structuredClone(legacy));
    const migrated = await loadMatch();
    assert.ok(validMatch(migrated), map);
    assert.equal(migrated.version, 6); assert.equal(migrated.id, legacy.id); assert.equal(migrated.elapsed, legacy.elapsed);
    assert.equal(migrated.nextId, legacy.nextId); assert.equal(migrated.nextAi, legacy.nextAi);
    assert.equal(Object.hasOwn(migrated, "commanders"), false);
    assert.equal(Object.hasOwn(migrated, "nextCommanderId"), false);
    assert.deepEqual(migrated.report, legacy.report); assert.deepEqual(migrated.shortage, legacy.shortage);
    for (let i = 0; i < migrated.units.length; i++) {
      const { stance, nextOrder, pocketed, pocketTime, ...unit }: Unit = migrated.units[i];
      assert.equal(pocketTime, 0); assert.equal(pocketed, !isSupplied(migrated, unit.team, unit));
      const { commanderId, ...before } = legacy.units[i];
      assert.deepEqual(unit, before, "individual position, health, cooldown, path and order survive");
      assert.equal(stance, legacy.commanders.find(group => group.id === commanderId)!.autoFront ? "defend" : "manual");
      assert.equal(nextOrder, legacy.elapsed);
      assert.equal(Object.hasOwn(unit, "commanderId"), false);
    }
    assertCityTimers(migrated, legacy.cities, 6);
    assert.equal(migrated.cities[4].progress, 12);
    for (let i = 0; i < migrated.cities.length; i++) {
      const before = legacy.cities[i];
      const next: City = migrated.cities[i];
      assert.deepEqual({ ...next, build: before.build, progress: before.progress }, before);
      assert.equal(next.progress / 24, before.progress / 8);
    }
    assert.deepEqual(legacy, original, "migration does not mutate input");
    assert.deepEqual(db.entries.get("current"), original, "reading does not overwrite stored data");
    await saveMatch(migrated);
    assert.deepEqual(await loadMatch(), migrated, "progress conversion happens once");
    assert.deepEqual(migrateMatch(migrated), migrated);
  }
  assert.deepEqual(await readStats(), { won: 1, lost: 0, draw: 0 });
});

function versionThreeMatch(map: MapId = "plains") {
  const current = createMatch("normal", `existing-v3-${map}`, false, map);
  const { territory, ...record } = current;
  void territory;
  return {
    ...record, version: 3 as const,
    units: current.units.map(unit => {
      const { pocketed, pocketTime, ...soldier } = unit;
      void pocketed; void pocketTime;
      return soldier;
    }),
  };
}

test("v3 records preserve soldiers and all city clocks while initializing only current territory", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  for (const map of mapIds) {
    const legacy = versionThreeMatch(map);
    legacy.elapsed = 93; legacy.nextAi = 98;
    const soldier = legacy.units[0];
    const destination = legacy.cities.find(city => city.owner === 2)!;
    soldier.x = destination.x; soldier.y = destination.y;
    // This advanced position is all the historical territory evidence v3 has.
    soldier.stance = "manual"; soldier.nextOrder = 94;
    soldier.order = { mode: "hold" }; soldier.path = []; soldier.waypoint = 0;
    legacy.cities[0].build = { kind: "heavy", elapsed: 31.5 };
    legacy.cities[1].capturing = 2; legacy.cities[1].progress = 12;
    const before = structuredClone(legacy);
    const restored = migrateV3Match(legacy);
    assert.ok(restored && validMatch(restored), map);
    assert.equal(restored.version, 6);
    const { territory, units: restoredUnits, cities: restoredCities, version, ...fields } = restored;
    void version;
    const { units: priorUnits, cities: priorCities, version: priorVersion, ...priorFields } = legacy;
    void priorVersion;
    assert.deepEqual(fields, priorFields, "existing v3 fields are retained");
    assertCityTimers(restored, priorCities);
    assert.deepEqual(restoredCities, priorCities);
    assert.deepEqual(restoredUnits.map(unit => {
      const { pocketed, pocketTime, ...prior } = unit;
      assert.equal(pocketTime, 0, "no invented prior encirclement damage");
      assert.equal(pocketed, !isSupplied(restored, unit.team, unit));
      return prior;
    }), priorUnits);
    assert.equal(territoryOwner(restored, soldier), 1, "current occupied footprint becomes controlled land");
    const expected = { ...restored, territory: createTerritory(map) };
    advanceTerritory(expected);
    assert.deepEqual(territory, expected.territory, "initial split plus current footprints is the only reconstruction");
    const distant = legacy.cities.filter(city => city.owner === 2 && Math.hypot(city.x-soldier.x,city.y-soldier.y)>10)[0];
    assert.equal(territoryOwner(restored, distant), 2, "past travel or city ownership does not invent land claims");
    assert.deepEqual(legacy, before);
    db.entries.set("current", structuredClone(legacy));
    assert.deepEqual(await loadMatch(), restored);
    assert.deepEqual(db.entries.get("current"), before);
    await saveMatch(restored); assert.deepEqual(await loadMatch(), restored);
  }
});

test("corrupt v3 data is rejected before territory reconstruction", () => {
  const legacy = versionThreeMatch();
  assert.equal(migrateV3Match({ ...legacy, territory: createTerritory(legacy.map) }), null);
  assert.equal(migrateV3Match({ ...legacy, version: 4 }), null);
  assert.equal(migrateV3Match({ ...legacy, units: legacy.units.map((unit,index) => index ? unit : { ...unit, stance: "invalid" }) }), null);
  assert.equal(migrateV3Match({ ...legacy, units: legacy.units.map((unit,index) => index ? unit : { ...unit, pocketed: false, pocketTime: 0 }) }), null);
  const damaged = structuredClone(legacy); damaged.cities[0].build!.elapsed = 60.1;
  assert.equal(migrateV3Match(damaged), null);
});

function versionFourMatch(map: MapId = "plains") {
  return { ...createMatch("hard", `existing-v4-${map}`, false, map), version: 4 as const };
}

test("v4 migration preserves exact territory, pockets, routes, identity and every city production clock", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  for (const map of mapIds) {
    const legacy = versionFourMatch(map);
    legacy.elapsed = 120; legacy.nextAi = 124; legacy.shortage = [2.5, 0];
    const soldier = legacy.units[0];
    const target = legacy.cities.find(city => city.owner === 2)!;
    soldier.x = target.x; soldier.y = target.y;
    soldier.stance = "manual"; soldier.nextOrder = 121;
    soldier.order = { mode: "route", points: [{ x: soldier.x, y: soldier.y }, { x: WIDTH, y: HEIGHT }], next: 1 };
    soldier.path = []; soldier.waypoint = 0; soldier.cooldown = 1.25;
    advanceTerritory(legacy);
    soldier.pocketed = true; soldier.pocketTime = 19.75;
    for (const city of legacy.cities) city.build = { kind: city.id % 2 ? "heavy" : "light", elapsed: city.owner === 1 ? 35.5 : 48.125 };
    legacy.cities[0].build!.elapsed = 59.25;
    legacy.cities[1].capturing = 2; legacy.cities[1].progress = 17;
    const before = structuredClone(legacy);
    assert.equal(validMatch(legacy), false);
    const migrated = migrateV4Match(legacy); assert.ok(migrated && validMatch(migrated));
    assertCityTimers(migrated, legacy.cities);
    const { version, ...fields } = migrated;
    const { version: oldVersion, ...oldFields } = legacy;
    void version; void oldVersion;
    assert.deepEqual(fields, oldFields, "territory history and pocket clocks are not reconstructed or advanced");
    assert.deepEqual(legacy, before, "migration does not change the old in-memory record");
    db.entries.set("current", structuredClone(legacy));
    assert.deepEqual(await loadMatch(), migrated); assert.deepEqual(db.entries.get("current"), before);
    await saveMatch(migrated); assert.deepEqual(await loadMatch(), migrated, "v6 does not repeat legacy clock conversion");
  }
});

test("v4 migration keeps each paused city timer when its supply connection is cut", () => {
  const legacy = versionFourMatch();
  for (const city of legacy.cities) if (city.owner === 1) city.build = { kind: "heavy", elapsed: 46.5 };
  legacy.territory.owners = legacy.territory.owners.map(owner => owner ? 2 : 0);
  legacy.territory.revision++;
  const migrated = migrateV4Match(legacy); assert.ok(migrated && validMatch(migrated));
  assertCityTimers(migrated, legacy.cities);
  assert.ok(migrated.cities.filter(city => city.owner === 1).every(city => !isSupplied(migrated, 1, city) && city.build?.elapsed === 46.5));
});

test("corrupted v4 records are rejected before version conversion and remain intact in storage", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const mutations: Array<(legacy: ReturnType<typeof versionFourMatch>) => void> = [
    legacy => { legacy.territory.owners.pop(); },
    legacy => { legacy.territory.revision = Infinity; },
    legacy => { legacy.units[0].pocketed = false; legacy.units[0].pocketTime = 1; },
    legacy => { legacy.cities[0].build!.elapsed = 60.01; },
    legacy => { legacy.units[0].order = { mode: "route", points: [], next: 0 }; },
    legacy => { Object.assign(legacy, { recruitment: [0, 0] }); },
  ];
  for (const mutate of mutations) {
    const legacy = versionFourMatch(); mutate(legacy);
    assert.equal(migrateV4Match(legacy), null, mutate.toString());
    db.entries.set("current", structuredClone(legacy));
    assert.deepEqual(await loadMatch(), legacy);
    assert.deepEqual(db.entries.get("current"), legacy);
    await assert.rejects(saveMatch(legacy as never), /Invalid Dot Front match/);
  }
});

function versionFiveMatch(map: MapId = "plains") {
  const legacy = { ...createMatch("normal", `existing-v5-${map}`, false, map), version: 5 as const,
    recruitment: [37.5, 58.25] as [number, number] };
  for (const team of [1, 2] as const) {
    const source = legacy.cities.filter(city => city.owner === team)[2];
    source.build = { kind: team === 1 ? "heavy" : "light", elapsed: legacy.recruitment[team - 1] };
  }
  return legacy;
}

test("v5 migration preserves only the saved source progress and every other simulation field", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  for (const map of mapIds) {
    const legacy = versionFiveMatch(map);
    legacy.elapsed = 120; legacy.nextAi = 125;
    legacy.units[0].pocketed = true; legacy.units[0].pocketTime = 12.5;
    legacy.units[0].stance = "manual";
    legacy.units[0].order = { mode: "route", points: [{ x: WIDTH, y: HEIGHT }], next: 0 };
    const before = structuredClone(legacy), migrated = migrateV5Match(legacy);
    assert.ok(migrated && validMatch(migrated));
    const { recruitment, version, ...fields } = legacy;
    void recruitment; void version;
    assert.deepEqual(migrated, { ...fields, version: 6 }, "positions, routes, pockets, territory and city clocks remain exact");
    assert.equal(Object.hasOwn(migrated, "recruitment"), false);
    assert.equal(migrated.cities.filter(city => (city.build?.elapsed ?? 0) > 0).length, 2);
    db.entries.set("current", before);
    assert.deepEqual(await loadMatch(), migrated); assert.deepEqual(db.entries.get("current"), before);
    await saveMatch(migrated); assert.deepEqual(await loadMatch(), migrated);
    assert.deepEqual(legacy, before);
  }
});

test("v5 inconsistent display queues keep one deterministic source and do not invent a city for an unassigned shared timer", () => {
  const legacy = versionFiveMatch();
  for (const city of legacy.cities) if (city.owner === 1) city.build = { kind: "heavy", elapsed: 60 };
  for (const city of legacy.cities) if (city.owner === 2) city.build = { kind: "light", elapsed: 0 };
  legacy.recruitment = [60, 52.25];
  const migrated = migrateV5Match(legacy); assert.ok(migrated);
  const retained = migrated.cities.filter(city => (city.build?.elapsed ?? 0) > 0);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].id, legacy.cities.find(city => city.owner === 1)!.id);
  assert.equal(retained[0].build!.elapsed, 60);
  assert.ok(migrated.cities.filter(city => city.owner === 2).every(city => city.build?.elapsed === 0));
});

test("v5 migration validates the old two-timer schema while v6 rejects obsolete shared clocks", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const state = createMatch("normal", "recruitment-validation", false, "plains");
  for (const recruitment of [undefined, null, 1, [], [0], [0, 0, 0], [-1, 0], [0, 60.001],
    [NaN, 0], [0, Infinity], ["1", 0], Array(2), new Float64Array(2)]) {
    assert.equal(validMatch({ ...state, recruitment }), false);
    const legacy = { ...versionFiveMatch(), recruitment };
    assert.equal(migrateV5Match(legacy), null);
    db.entries.set("current", structuredClone(legacy));
    assert.deepEqual(await loadMatch(), legacy, "bad old data remains available for an explicit recovery warning");
  }
  assert.equal(validMatch({ ...state, recruitment: [60, 17.125] }), false);
  assert.ok(migrateV5Match({ ...versionFiveMatch(), recruitment: [60, 17.125] }));
  const invalidCity = versionFiveMatch(); invalidCity.cities[0].build!.elapsed = 60.1;
  assert.equal(migrateV5Match(invalidCity), null);
  const invalidTerritory = versionFiveMatch(); invalidTerritory.territory.owners.pop();
  assert.equal(migrateV5Match(invalidTerritory), null);
  assert.equal(migrateV3Match({ ...versionThreeMatch(), recruitment: [0, 0] }), null);
  assert.equal(migrateV2Match({ ...versionTwoMatch(), recruitment: [0, 0] }), null);
});

test("sparse stored city, route, path and supply arrays are rejected before the simulation can read missing entries", () => {
  const mutations: Array<(record: Match) => void> = [
    record => { delete record.cities[0]; },
    record => { record.shortage = Array(2) as [number, number]; },
    record => { record.units[0].path = Array(1); },
    record => { record.units[0].order = { mode: "route", points: Array(1), next: 0 }; },
  ];
  for (const mutate of mutations) {
    const record = createMatch("normal", "sparse-record", false, "plains");
    mutate(record); assert.equal(validMatch(record), false, mutate.toString());
  }
});

test("independent v4 city queues resume exactly and each completed city produces its own reinforcement", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const legacy = versionFourMatch();
  for (const city of legacy.cities) city.build = { kind: "light", elapsed: 60 };
  for (const unit of legacy.units) { unit.stance = "manual"; unit.order = { mode: "hold" }; }
  const state = migrateV4Match(legacy); assert.ok(state);
  assertCityTimers(state, legacy.cities);
  assert.equal(state.units.length, 50);
  await saveMatch(state);
  const restored = await loadMatch(); assert.ok(validMatch(restored));
  assert.deepEqual(restored, state);
  for (let tick = 0; tick < 20; tick++) { step(state, STEP, [], () => {}); step(restored, STEP, [], () => {}); }
  assert.equal(state.units.length, 100, "50 independently completed and supplied cities each produce one soldier");
  assert.deepEqual(restored, state);
  assert.ok(validMatch(restored));
});

test("v5 source progress is never duplicated into a burst from all cities on resume", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const legacy = versionFiveMatch();
  legacy.recruitment = [60, 60];
  for (const city of legacy.cities) if (city.build?.elapsed) city.build.elapsed = 60;
  for (const unit of legacy.units) { unit.stance = "manual"; unit.order = { mode: "hold" }; }
  const state = migrateV5Match(legacy); assert.ok(state);
  await saveMatch(state); const restored = await loadMatch(); assert.ok(validMatch(restored));
  for (let tick = 0; tick < 20; tick++) { step(state, STEP, [], () => {}); step(restored, STEP, [], () => {}); }
  assert.equal(state.units.length, 52, "only the two previously active cities were ready immediately");
  assert.deepEqual(restored, state); assert.ok(validMatch(restored));
  assert.ok(state.cities.every(city => (city.build?.elapsed ?? 0) < 1.01));
});

test("malformed v2 records fail old-schema validation before commander data is discarded", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const mutations: Array<(legacy: ReturnType<typeof versionTwoMatch>) => void> = [
    legacy => { legacy.cities[0].build = { kind: "light", elapsed: 10.01 }; },
    legacy => { legacy.cities[0].progress = 8.01; },
    legacy => { legacy.units[0].hp = 0; },
    legacy => { legacy.units[0].commanderId = legacy.nextCommanderId++; },
    legacy => { legacy.units[1].id = legacy.units[0].id; },
    legacy => { legacy.commanders[0].leaderId = legacy.nextId; },
    legacy => { legacy.commanders[0].leaderId = legacy.units.find(unit => unit.team === 2)!.id; },
    legacy => { legacy.commanders[0].team = 2; },
    legacy => { legacy.commanders[1].id = legacy.commanders[0].id; },
    legacy => { legacy.commanders.pop(); },
    legacy => { legacy.nextCommanderId = legacy.commanders.at(-1)!.id; },
    legacy => { legacy.commanders[0].nextOrder = legacy.elapsed + 100; },
    legacy => { legacy.commanders[0].autoFront = "yes" as never; },
    legacy => { legacy.units[10].commanderId = legacy.units[0].commanderId; },
    legacy => { legacy.cities[0].x += 1; },
    legacy => { legacy.units[0].order = { mode: "route", points: [{ x: 10, y: 10 }], next: 0 }; },
  ];
  for (const mutate of mutations) {
    const legacy = versionTwoMatch(); mutate(legacy);
    assert.equal(migrateV2Match(legacy), null, mutate.toString());
    db.entries.set("current", structuredClone(legacy));
    const loaded = await loadMatch();
    assert.equal(validMatch(loaded), false); assert.deepEqual(loaded, legacy);
  }
  assert.equal(migrateV2Match({ ...versionTwoMatch(), version: 1 }), null);
  assert.equal(migrateV2Match({ ...versionTwoMatch(), version: 4 }), null);
});

test("individual manual routes and stance deadlines round-trip with exact deterministic continuation", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const state = createMatch("normal", "route-resume", false, "plains");
  const unit = state.units[1];
  const points = [{ x: unit.x, y: unit.y }, { x: unit.x + 2, y: unit.y }, { x: unit.x + 3, y: unit.y + 2 }];
  commandUnit(state, unit.id, { mode: "route", points, next: 0 });
  for (let tick = 0; tick < 20; tick++) step(state, STEP, [], () => {});
  assert.equal(unit.stance, "manual"); assert.equal(unit.order.mode, "route");
  await saveMatch(state);
  const loaded = await loadMatch(); assert.ok(validMatch(loaded)); assert.deepEqual(loaded, state);
  for (let tick = 0; tick < 80; tick++) { step(state, STEP, [], () => {}); step(loaded, STEP, [], () => {}); }
  assert.deepEqual(loaded, state);
});

test("all six maps save a commander-free current shape in the existing namespace", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  for (const map of mapIds) {
    const state = createMatch("normal", `round-trip-${map}`, false, map);
    assert.ok(validMatch(state), map); assert.equal(state.version, 6);
    assert.equal(state.cities.length, 50); assert.equal(state.units.length, 50);
    assert.equal(Object.hasOwn(state, "commanders"), false);
    await saveMatch(state); const restored = await loadMatch();
    assert.ok(validMatch(restored)); assert.deepEqual(restored, state);
    const jsonRoundTrip: unknown = JSON.parse(JSON.stringify(restored)); assert.ok(validMatch(jsonRoundTrip));
    for (let tick = 0; tick < 12; tick++) { step(state, STEP, [], () => {}); step(jsonRoundTrip, STEP, [], () => {}); }
    assert.deepEqual(jsonRoundTrip, state, map);
  }
  assert.ok(db.names.every(name => name === "xarmy:dot-front:matches"));
  assert.equal(db.entries.size, 1); assert.ok(db.entries.has("current"));
});

test("unknown maps, changed city layouts and blocked physical coordinates are rejected", () => {
  const current = createMatch("normal", "strict", false, "valley");
  for (const map of ["river", "unknown", "__proto__", "", 3, null, undefined]) assert.equal(validMatch({ ...current, map }), false);
  for (const map of mapIds) {
    const state = createMatch("normal", `terrain-${map}`, false, map);
    const wrongCity = structuredClone(state); wrongCity.cities.at(-1)!.x += 1;
    assert.equal(validMatch(wrongCity), false);
    assert.equal(validMatch({ ...state, cities: state.cities.slice(0, 10) }), false);
    const blocked = getMap(map).tiles.findIndex(tile => tile === "rock" || tile === "water");
    const invalid = { x: blocked % WIDTH + 0.5, y: Math.floor(blocked / WIDTH) + 0.5 };
    assert.equal(passable(invalid, map), false);
    for (const apply of [
      () => Object.assign(state.units[0], invalid),
      () => { state.units[0].path = [invalid]; },
      () => { state.units[0].order = { mode: "move", point: invalid }; },
      () => { state.cities[0].rally = invalid; },
    ]) {
      const before = structuredClone(state); apply(); assert.equal(validMatch(state), false); Object.assign(state, before);
    }
    state.units[0].order = { mode: "route", points: [invalid], next: 0 };
    assert.ok(validMatch(state), "drawn guides may cross obstacles; actual movement still uses passable routes");
  }
});

test("current soldier validation rejects obsolete commander fields, invalid stances, timers and route data", () => {
  const mutations: Array<(state: ReturnType<typeof createMatch>) => void> = [
    state => { state.units[0].stance = "unknown" as never; },
    state => { state.units[0].nextOrder = Infinity; },
    state => { state.units[0].nextOrder = state.elapsed + 61; },
    state => { state.units[0].nextOrder = -1; },
    state => { Object.assign(state.units[0], { commanderId: 1 }); },
    state => { Object.assign(state.units[0], { independent: true }); },
    state => { Object.assign(state, { commanders: [] }); },
    state => { Object.assign(state, { nextCommanderId: 1 }); },
    state => { state.units[0].order = { mode: "attack", target: state.nextId }; },
    state => { state.units[0].order = { mode: "route", points: [], next: 0 }; },
    state => { state.units[0].order = { mode: "route", points: Array.from({ length: MAX_ROUTE_POINTS + 1 }, () => ({ x: 1, y: 1 })), next: 0 }; },
    state => { state.units[0].order = { mode: "route", points: [{ x: WIDTH + .01, y: 1 }], next: 0 }; },
    state => { state.units[0].order = { mode: "route", points: [{ x: 1, y: HEIGHT + .01 }], next: 0 }; },
    state => { state.units[0].order = { mode: "route", points: [{ x: NaN, y: 1 }], next: 0 }; },
    state => { state.units[0].order = { mode: "route", points: [{ x: 1, y: 1 }], next: 2 }; },
    state => { state.units[0].order = { mode: "route", points: [{ x: 1, y: 1 }], next: .5 }; },
  ];
  for (const mutate of mutations) {
    const state = createMatch("normal", "validation", false, "plains"); assert.ok(validMatch(state));
    mutate(state); assert.equal(validMatch(state), false, mutate.toString());
  }
  const edges = createMatch("normal", "edge-guides", false, "plains");
  edges.units[0].order = { mode: "route", points: [{ x: WIDTH, y: HEIGHT }], next: 1 };
  assert.ok(validMatch(edges), "a completed guide and canvas edge positions can be resumed safely");
});

test("dead attack targets can be restored for cleanup but production and capture timers remain bounded", () => {
  const state = createMatch("normal", "dead-target", false, "plains");
  state.units[0].order = { mode: "attack", target: state.nextId++ }; assert.ok(validMatch(state));
  state.cities[0].build = { kind: "light", elapsed: CITY_PRODUCTION + .1 }; assert.equal(validMatch(state), false);
  state.cities[0].build.elapsed = CITY_PRODUCTION;
  state.cities[0].progress = CAPTURE + .1; assert.equal(validMatch(state), false);
});

test("save limits support larger independent armies without accepting unbounded or duplicate units", () => {
  const state = createMatch("normal", "large-army", false, "plains"), template = state.units[0];
  while (state.units.length < 300) state.units.push({ ...structuredClone(template), id: state.nextId++ });
  assert.ok(validMatch(state));
  assert.equal(validMatch({ ...state, units: Array.from({ length: 601 }, () => template) }), false);
  state.units[1].id = state.units[0].id; assert.equal(validMatch(state), false);
});

test("incompatible v1 records remain intact and do not erase statistics or settings", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const legacy = { ...createMatch("normal", "old-v1", false), version: 1 };
  db.entries.set("current", structuredClone(legacy)); db.entries.set("result:won:completed-before-v2", 1);
  const loaded = await loadMatch(); assert.equal(validMatch(loaded), false); assert.deepEqual(loaded, legacy);
  assert.deepEqual(db.entries.get("current"), legacy); assert.deepEqual(await readStats(), { won: 1, lost: 0, draw: 0 });
  await assert.rejects(saveMatch(legacy as never), /Invalid Dot Front match/);
  const current = createMatch("normal", "new-v3-match", false); await saveMatch(current);
  assert.deepEqual(await loadMatch(), current); assert.deepEqual(await readStats(), { won: 1, lost: 0, draw: 0 });
  const settings = memorySettings([["xarmy:dot-front:settings", JSON.stringify({ sound: true, difficulty: "hard" })]]);
  replaceGlobal(context, "localStorage", settings);
  assert.deepEqual(readSettings(), { sound: true, difficulty: "hard", map: "valley" });
  saveSettings({ ...readSettings(), map: "forest" }); assert.equal(readSettings().map, "forest");
  assert.equal(settings.entries.size, 1);
});

test("territory snapshots reject wrong lengths, blocked claims, sparse data and invalid revisions", () => {
  const state = createMatch("normal", "territory-validation", false, "plains");
  const blocked = state.territory.owners.findIndex(owner => owner === 0);
  const open = state.territory.owners.findIndex(owner => owner !== 0);
  assert.equal(state.territory.owners.length, TERRITORY_COLS * TERRITORY_ROWS);
  assert.ok(blocked >= 0 && open >= 0);
  const mutations: Array<(record: typeof state) => void> = [
    value => { value.territory.owners.pop(); },
    value => { value.territory.owners.push(1); },
    value => { value.territory.owners[blocked] = 1; },
    value => { value.territory.owners[open] = 0; },
    value => { value.territory.owners[open] = 3; },
    value => { value.territory.owners[open] = NaN; },
    value => { value.territory.owners[open] = "1" as never; },
    value => { delete value.territory.owners[open]; },
    value => { value.territory.revision = -1; },
    value => { value.territory.revision = .5; },
    value => { value.territory.revision = Infinity; },
    value => { value.territory.revision = 0x80000000; },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(state); mutate(malformed);
    assert.equal(validMatch(malformed), false, mutate.toString());
  }
  assert.equal(validMatch({ ...state, territory: null }), false);
  state.territory.revision = 0x7fffffff; assert.ok(validMatch(state));
});

test("pocket flags and timers reject impossible values without losing real grace-period progress", () => {
  const state = createMatch("normal", "pocket-validation", false, "plains");
  state.elapsed = 30;
  const mutations: Array<(unit: Unit) => void> = [
    unit => { unit.pocketed = "yes" as never; },
    unit => { unit.pocketTime = -1; },
    unit => { unit.pocketTime = Infinity; },
    unit => { unit.pocketed = true; unit.pocketTime = 30.1; },
    unit => { unit.pocketed = false; unit.pocketTime = 1; },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(state); mutate(malformed.units[0]);
    assert.equal(validMatch(malformed), false, mutate.toString());
  }
  state.units[0].pocketed = true; state.units[0].pocketTime = 19.75;
  assert.ok(validMatch(state));
});

test("a saved completed enclosure resumes with the same land and city transfer and removes soldiers without switching their team", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const state = createMatch("normal", "pocket-resume", false, "plains");
  for (const unit of state.units) commandUnit(state, unit.id, { mode: "hold" });
  state.elapsed = 30;
  const trapped = state.units[0];
  const red = state.units.find(unit => unit.team === 2)!;
  const destination = state.cities.find(city => city.x === 21.5 && city.y === 26.5)!;
  assert.equal(destination.owner, 1);
  state.units = [trapped, red];
  trapped.x = destination.x; trapped.y = destination.y;
  red.x = 100.5; red.y = 80.5;
  for (let index = 0; index < state.territory.owners.length; index++) {
    if (!state.territory.owners[index]) continue;
    const x = (index % TERRITORY_COLS + .5) / 2, y = (Math.floor(index / TERRITORY_COLS) + .5) / 2;
    state.territory.owners[index] = Math.abs(x - trapped.x) < 2 && Math.abs(y - trapped.y) < 2 ? 1 : 2;
  }
  state.territory.revision++;
  destination.build = { kind: "heavy", elapsed: 28 };
  destination.rally = { x: trapped.x + 1, y: trapped.y };
  destination.capturing = 2; destination.progress = 5;
  assert.equal(isSupplied(state, 1, trapped), false);
  trapped.pocketed = true; trapped.pocketTime = 19.75;
  await saveMatch(state);
  const restored = await loadMatch(); assert.ok(validMatch(restored));
  assert.deepEqual(restored, state);
  assert.equal(restored.units.find(unit => unit.id === trapped.id)!.team, 1, "loading does not mutate legacy soldiers");
  for (let tick = 0; tick < 20; tick++) { step(state, STEP, [], () => {}); step(restored, STEP, [], () => {}); }
  assert.deepEqual(restored, state, "derived connectivity can rebuild without changing the saved simulation");
  assert.equal(state.units.some(unit => unit.id === trapped.id), false, "the soldier dies instead of changing teams");
  assert.equal(trapped.team, 1);
  assert.equal(territoryOwner(state, trapped), 2);
  assert.equal(destination.owner, 2); assert.equal(destination.progress, 0); assert.equal(destination.capturing, 0);
  assert.equal(destination.rally, null); assert.equal(state.report.fallen, 1);
  await saveMatch(restored); assert.deepEqual(await loadMatch(), restored, "the resolved enclosure remains resolved after another reload");
  assert.ok(validMatch(restored));
});

test("disconnected supply timers resume exactly when neither side has a grounded enclosure", async (context) => {
  const db = memoryDatabase(); replaceGlobal(context, "indexedDB", db.factory);
  const state = createMatch("normal", "ungrounded-supply-resume", false, "plains");
  const blue = state.units.find(unit => unit.team === 1)!, red = state.units.find(unit => unit.team === 2)!;
  state.units = [blue, red]; state.elapsed = 30;
  for (const unit of state.units) commandUnit(state, unit.id, { mode: "hold" });
  blue.x = 100.5; blue.y = 80.5; red.x = 40.5; red.y = 80.5;
  state.territory.owners = state.territory.owners.map(owner => owner === 1 ? 2 : owner === 2 ? 1 : 0);
  state.territory.revision++;
  assert.equal(isSupplied(state, 1, blue), false); assert.equal(isSupplied(state, 2, red), false);
  blue.pocketed = true; blue.pocketTime = 19.75;
  const beforeHp = blue.hp;
  await saveMatch(state); const restored = await loadMatch(); assert.ok(validMatch(restored));
  assert.deepEqual(restored, state);
  for (let tick = 0; tick < 20; tick++) { step(state, STEP, [], () => {}); step(restored, STEP, [], () => {}); }
  assert.deepEqual(restored, state);
  assert.ok(Math.abs(state.units.find(unit => unit.id === blue.id)!.hp - (beforeHp - 1.25 * .75)) < 1e-6,
    "an unresolved supply interruption keeps its existing grace timer rather than restarting it on load");
  assert.ok(validMatch(restored));
});

test("new settings default to Plains and invalid stored map data safely falls back", (context) => {
  const settings = memorySettings();
  replaceGlobal(context, "localStorage", settings);
  assert.deepEqual(readSettings(), { sound: false, difficulty: "normal", map: "plains" });
  for (const map of mapIds) {
    saveSettings({ sound: true, difficulty: "easy", map });
    assert.equal(readSettings().map, map);
  }
  settings.setItem("xarmy:dot-front:settings", JSON.stringify({ sound: true, difficulty: "hard", map: "unknown" }));
  assert.deepEqual(readSettings(), { sound: true, difficulty: "hard", map: "plains" });
  settings.setItem("xarmy:dot-front:settings", "{broken");
  const recovered = readSettings();
  assert.deepEqual(recovered, defaults);
  recovered.map = "valley";
  assert.equal(defaults.map, "plains");
});

test("saving captures the current state immediately and completed results stay idempotent", async (context) => {
  const db = memoryDatabase();
  replaceGlobal(context, "indexedDB", db.factory);
  const state = createMatch("normal", "immutable-snapshot", false, "plains");
  const hp = state.units[0].hp;
  const saving = saveMatch(state);
  state.units[0].hp = 1;
  await saving;
  const saved = await loadMatch();
  assert.ok(validMatch(saved));
  assert.equal(saved.units[0].hp, hp);
  state.result = "won";
  await recordResult(state);
  await recordResult(state);
  assert.deepEqual(await readStats(), { won: 1, lost: 0, draw: 0 });
  assert.ok(db.closed >= 5);
});

test("a stalled IndexedDB open times out and closes a late successful connection", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let closed = 0;
  const request = { result: { close() { closed++; } }, onsuccess: null as (() => void) | null };
  replaceGlobal(context, "indexedDB", { open: () => request });
  const rejected = assert.rejects(loadMatch(), /storage open timed out/);
  context.mock.timers.tick(5000);
  await rejected;
  request.onsuccess?.();
  assert.equal(closed, 1);
});

test("a stalled IndexedDB transaction times out, aborts and releases its database", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const db = memoryDatabase(true);
  replaceGlobal(context, "indexedDB", db.factory);
  const rejected = assert.rejects(loadMatch(), /storage transaction timed out/);
  await new Promise<void>(resolve => setImmediate(resolve));
  context.mock.timers.tick(5000);
  await rejected;
  assert.equal(db.aborted, 1);
  assert.equal(db.closed, 1);
});

test("storage denial rejects predictably so the client can keep the game playable", async (context) => {
  replaceGlobal(context, "indexedDB", { open() { throw new Error("permission denied"); } });
  await assert.rejects(loadMatch(), /permission denied/);
  await assert.rejects(saveMatch(createMatch("normal", "denied", false)), /permission denied/);
  await assert.rejects(saveMatch({ ...createMatch("normal", "bad-map", false), map: "unknown" } as never), /Invalid Dot Front match/);
});
