import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { CAPTURE, CITY_PRODUCTION, HEIGHT, MAX_ROUTE_POINTS, STEP, WIDTH } from "./config";
import { commandUnit, createMatch, step } from "./engine";
import type { City, Unit } from "./engine";
import {
  defaults, loadMatch, migrateMatch, migrateV2Match, readSettings, readStats, recordResult, saveMatch, saveSettings, validMatch,
} from "./storage";
import { getMap, mapIds, passable } from "./terrain";
import type { MapId } from "./terrain";

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
  return {
    ...current,
    version: 2 as const,
    nextCommanderId: commanders.length + 1,
    commanders,
    units: current.units.map(unit => {
      const { stance, nextOrder, ...legacy } = unit;
      void stance; void nextOrder;
      return { ...legacy, commanderId: membership.get(unit.id)! };
    }),
    cities: current.cities.map(city => ({ ...city,
      progress: city.progress * 8 / CAPTURE,
      build: city.build ? { ...city.build, elapsed: city.build.elapsed * 10 / CITY_PRODUCTION } : null,
    })),
  };
}

test("published v2 saves migrate to individual soldiers while preserving identity, orders and timed progress percentages", async (context) => {
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
    assert.equal(migrated.version, 3); assert.equal(migrated.id, legacy.id); assert.equal(migrated.elapsed, legacy.elapsed);
    assert.equal(migrated.nextId, legacy.nextId); assert.equal(migrated.nextAi, legacy.nextAi);
    assert.equal(Object.hasOwn(migrated, "commanders"), false);
    assert.equal(Object.hasOwn(migrated, "nextCommanderId"), false);
    assert.deepEqual(migrated.report, legacy.report); assert.deepEqual(migrated.shortage, legacy.shortage);
    for (let i = 0; i < migrated.units.length; i++) {
      const { stance, nextOrder, ...unit }: Unit = migrated.units[i];
      const { commanderId, ...before } = legacy.units[i];
      assert.deepEqual(unit, before, "individual position, health, cooldown, path and order survive");
      assert.equal(stance, legacy.commanders.find(group => group.id === commanderId)!.autoFront ? "defend" : "manual");
      assert.equal(nextOrder, legacy.elapsed);
      assert.equal(Object.hasOwn(unit, "commanderId"), false);
    }
    assert.equal(migrated.cities[0].build!.elapsed, 27);
    assert.equal(migrated.cities[1].build!.elapsed, 57);
    assert.equal(migrated.cities[2].build!.elapsed, 60);
    assert.equal(migrated.cities[3].build, null);
    assert.equal(migrated.cities[4].progress, 12);
    for (let i = 0; i < migrated.cities.length; i++) {
      const before = legacy.cities[i];
      const next: City = migrated.cities[i];
      assert.deepEqual({ ...next, build: before.build, progress: before.progress }, before);
      if (before.build) assert.equal(next.build!.elapsed / 60, before.build.elapsed / 10);
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
    assert.ok(validMatch(state), map); assert.equal(state.version, 3);
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
