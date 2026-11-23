import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { CITY_PRODUCTION, HEIGHT, STEP, WIDTH } from "./config";
import { createMatch, step } from "./engine";
import {
  defaults, loadMatch, readSettings, readStats, recordResult, saveMatch, saveSettings, validMatch,
} from "./storage";
import { getMap, mapIds, passable } from "./terrain";

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

test("all six large maps retain version-two match and commander snapshots in the existing namespace", async (context) => {
  const db = memoryDatabase();
  replaceGlobal(context, "indexedDB", db.factory);
  assert.deepEqual(mapIds, ["plains", "forest", "valley", "passes", "fronts", "center"]);
  for (const map of mapIds) {
    const state = createMatch("hard", `save-${map}`, false, map);
    state.elapsed = 12.5;
    state.nextAi = 15;
    state.shortage = [3, 0];
    state.units[0].hp -= 4;
    state.units[0].cooldown = 0.3;
    state.units[0].replan = 13;
    state.commanders[0].autoFront = true;
    state.commanders[0].nextOrder = 14;
    state.commanders[0].order = { mode: "move", point: { x: state.cities[1].x, y: state.cities[1].y } };
    state.cities[0].build = { kind: "heavy", elapsed: 5 };
    state.cities[0].repeat = true;
    state.cities[0].rally = { x: state.cities[1].x, y: state.cities[1].y };
    state.cities[4].capturing = state.cities[4].owner === 1 ? 2 : 1;
    state.cities[4].progress = 4;
    assert.ok(validMatch(state), map);
    assert.equal(state.version, 2);
    assert.equal(state.cities.length, 50);
    assert.equal(state.units.length, 50);
    await saveMatch(state);
    const restored = await loadMatch();
    assert.ok(validMatch(restored), map);
    assert.deepEqual(restored, state, `${map} preserves exact state`);
    const jsonRoundTrip: unknown = JSON.parse(JSON.stringify(restored));
    assert.ok(validMatch(jsonRoundTrip));
    assert.deepEqual(jsonRoundTrip, state, `${map} survives a JSON round-trip`);
    // A saved decision deadline and commander membership must drive the same
    // future state, not just look correct immediately after loading.
    for (let tick = 0; tick < 12; tick++) {
      step(state, STEP, [], () => {});
      step(jsonRoundTrip, STEP, [], () => {});
    }
    assert.deepEqual(jsonRoundTrip, state, `${map} continues deterministically`);
  }
  assert.ok(db.names.every(name => name === "xarmy:dot-front:matches"));
  assert.equal(db.entries.size, 1);
  assert.ok(db.entries.has("current"));
});

test("unknown map IDs and altered city layouts are rejected rather than silently mapped to Valley", () => {
  const state = createMatch("normal", "strict-map", false, "valley");
  for (const map of ["river", "unknown", "__proto__", "", 3, null, undefined]) {
    assert.equal(validMatch({ ...state, map }), false, String(map));
  }
  for (const map of mapIds) {
    const saved = createMatch("normal", "wrong-layout", false, map);
    saved.cities.at(-1)!.x += 1;
    assert.equal(validMatch(saved), false, `${map} requires its exact city layout`);
  }
  const incomplete = createMatch("normal", "center-layout", false, "center");
  incomplete.cities = incomplete.cities.slice(0, 10);
  assert.equal(validMatch(incomplete), false, "the old ten-city shape cannot be used in a large map");
});

test("saved unit positions, paths, orders and rallies are validated against their selected terrain", () => {
  let differentTerrainChecked = 0;
  for (const map of mapIds) {
    const state = createMatch("normal", `terrain-${map}`, false, map);
    const openHereBlockedInValley = Array.from({ length: WIDTH * HEIGHT }, (_, id) => ({
      x: id % WIDTH + 0.5, y: Math.floor(id / WIDTH) + 0.5,
    })).find(point => passable(point, map) && !passable(point, "valley"));
    if (openHereBlockedInValley) {
      Object.assign(state.units[0], openHereBlockedInValley);
      state.units[0].path = [{ ...openHereBlockedInValley }];
      state.units[0].order = { mode: "move", point: { ...openHereBlockedInValley } };
      state.cities[0].rally = { ...openHereBlockedInValley };
      assert.ok(validMatch(state), `${map} accepts its own open terrain`);
      differentTerrainChecked++;
    }
    const blocked = getMap(map).tiles.findIndex(tile => tile === "rock" || tile === "water");
    if (blocked < 0) continue;
    const invalid = { x: blocked % WIDTH + 0.5, y: Math.floor(blocked / WIDTH) + 0.5 };
    for (const apply of [
      () => Object.assign(state.units[0], invalid),
      () => { state.units[0].path = [invalid]; },
      () => { state.units[0].order = { mode: "move", point: invalid }; },
      () => { state.cities[0].rally = invalid; },
    ]) {
      const before = structuredClone(state);
      apply();
      assert.equal(validMatch(state), false, `${map} blocks non-walkable saved points`);
      Object.assign(state, before);
    }
  }
  assert.ok(differentTerrainChecked >= 3, "multiple new maps differ from the old global Valley terrain");
});

test("version-one matches are rejected without deleting old statistics or settings", async (context) => {
  const db = memoryDatabase();
  replaceGlobal(context, "indexedDB", db.factory);
  const legacy = { ...createMatch("normal", "existing-valley-match", false), version: 1 };
  db.entries.set("current", JSON.parse(JSON.stringify(legacy)));
  db.entries.set("result:won:completed-before-v2", 1);
  const loaded = await loadMatch();
  assert.equal(validMatch(loaded), false);
  assert.deepEqual(loaded, legacy);
  assert.deepEqual(db.entries.get("current"), legacy, "validation does not erase the previous save");
  assert.deepEqual(await readStats(), { won: 1, lost: 0, draw: 0 });
  await assert.rejects(saveMatch(legacy as never), /Invalid Dot Front match/);
  const current = createMatch("normal", "new-v2-match", false);
  await saveMatch(current);
  assert.deepEqual(await loadMatch(), current);
  assert.deepEqual(await readStats(), { won: 1, lost: 0, draw: 0 });

  const settings = memorySettings([["xarmy:dot-front:settings", JSON.stringify({ sound: true, difficulty: "hard" })]]);
  replaceGlobal(context, "localStorage", settings);
  assert.deepEqual(readSettings(), { sound: true, difficulty: "hard", map: "valley" });
  saveSettings({ ...readSettings(), map: "forest" });
  assert.deepEqual(readSettings(), { sound: true, difficulty: "hard", map: "forest" });
  assert.equal(settings.entries.size, 1);
});

test("commander save validation rejects orphans, mixed teams, oversized groups and invalid leaders", () => {
  const mutations: Array<(state: ReturnType<typeof createMatch>) => void> = [
    state => { state.units[0].commanderId = state.nextCommanderId++; },
    state => { state.commanders[0].leaderId = state.nextId; },
    state => { state.commanders[0].leaderId = state.units.find(unit => unit.team === 2)!.id; },
    state => { state.commanders[0].team = 2; },
    state => { state.commanders[1].id = state.commanders[0].id; },
    state => { state.commanders.pop(); },
    state => { state.nextCommanderId = state.commanders.at(-1)!.id; },
    state => { state.commanders[0].nextOrder = Infinity; },
    state => { state.commanders[0].nextOrder = state.elapsed + 1e6; },
    state => { state.commanders[0].autoFront = "yes" as never; },
    state => { state.commanders[0].order = { mode: "attack", target: state.nextId }; },
    state => {
      const first = state.commanders[0];
      const extra = state.units.find(unit => unit.team === first.team && unit.commanderId !== first.id)!;
      extra.commanderId = first.id;
    },
    state => {
      state.commanders.push({ ...state.commanders[0], id: state.nextCommanderId++ });
    },
  ];
  for (const mutate of mutations) {
    const state = createMatch("normal", "commander-validation", false, "plains");
    assert.ok(validMatch(state));
    mutate(state);
    assert.equal(validMatch(state), false, mutate.toString());
  }
});

test("dead attack targets can be restored for engine cleanup, while unit and commander identities stay valid", () => {
  const state = createMatch("normal", "dead-target", false, "plains");
  const removedId = state.nextId++;
  state.units[0].order = { mode: "attack", target: removedId };
  state.commanders[0].order = { mode: "attack", target: removedId };
  assert.ok(validMatch(state));
  state.cities[0].build = { kind: "light", elapsed: CITY_PRODUCTION + 0.1 };
  assert.equal(validMatch(state), false, "production cannot exceed the ten-second slot");
});

test("save limits support enlarged armies without accepting unbounded or duplicate unit records", () => {
  const state = createMatch("normal", "large-army", false, "plains");
  const template = state.units[0];
  for (let group = 0; group < 25; group++) {
    const commanderId = state.nextCommanderId++;
    const leaderId = state.nextId;
    state.commanders.push({ id: commanderId, team: 1, leaderId, order: { mode: "hold" }, autoFront: false, nextOrder: 0 });
    for (let member = 0; member < 10; member++) state.units.push({
      ...structuredClone(template), id: state.nextId++, commanderId,
    });
  }
  assert.equal(state.units.length, 300);
  assert.ok(validMatch(state));
  const overLimit = { ...state, units: Array.from({ length: 601 }, () => template) };
  assert.equal(validMatch(overLimit), false);
  state.units[1].id = state.units[0].id;
  assert.equal(validMatch(state), false);
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
