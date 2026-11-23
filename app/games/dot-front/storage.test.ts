import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { HEIGHT, WIDTH } from "./config";
import { createMatch } from "./engine";
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

test("all six maps retain full match snapshots in the existing IndexedDB namespace", async (context) => {
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
    state.cities[0].build = { kind: "heavy", elapsed: 5 };
    state.cities[0].repeat = true;
    state.cities[0].rally = { x: state.cities[1].x, y: state.cities[1].y };
    state.cities[4].capturing = 1;
    state.cities[4].progress = 4;
    assert.ok(validMatch(state), map);
    await saveMatch(state);
    const restored = await loadMatch();
    assert.ok(validMatch(restored), map);
    assert.deepEqual(restored, state, `${map} preserves exact state`);
  }
  assert.ok(db.names.every(name => name === "xarmy:dot-front:matches"));
  assert.equal(db.entries.size, 1);
  assert.ok(db.entries.has("current"));
});

test("unknown map IDs and layouts from another map are rejected rather than silently mapped to Valley", () => {
  const state = createMatch("normal", "strict-map", false, "valley");
  for (const map of ["river", "unknown", "__proto__", "", 3, null, undefined]) {
    assert.equal(validMatch({ ...state, map }), false, String(map));
  }
  for (const map of mapIds) {
    const saved = createMatch("normal", "wrong-layout", false, map);
    saved.cities.at(-1)!.x += 1;
    assert.equal(validMatch(saved), false, `${map} requires its exact city layout`);
  }
  const center = createMatch("normal", "center-layout", false, "center");
  assert.notDeepEqual(getMap("center").cities, getMap("valley").cities);
  center.cities = structuredClone(state.cities);
  assert.equal(validMatch(center), false);
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

test("legacy Valley version-one saves and settings retain their old layout and preference", async (context) => {
  const db = memoryDatabase();
  replaceGlobal(context, "indexedDB", db.factory);
  const legacy = createMatch("normal", "existing-valley-match", false);
  assert.equal(legacy.map, "valley");
  assert.deepEqual(legacy.cities.map(({ x, y }) => [x, y]), [
    [4.5, 13.5], [9.5, 6.5], [43.5, 16.5], [38.5, 23.5], [10.5, 19.5],
    [37.5, 10.5], [20.5, 8.5], [27.5, 21.5], [18.5, 23.5], [29.5, 6.5],
  ]);
  db.entries.set("current", JSON.parse(JSON.stringify(legacy)));
  const loaded = await loadMatch();
  assert.ok(validMatch(loaded));
  assert.deepEqual(loaded, legacy);

  const settings = memorySettings([["xarmy:dot-front:settings", JSON.stringify({ sound: true, difficulty: "hard" })]]);
  replaceGlobal(context, "localStorage", settings);
  assert.deepEqual(readSettings(), { sound: true, difficulty: "hard", map: "valley" });
  saveSettings({ ...readSettings(), map: "forest" });
  assert.deepEqual(readSettings(), { sound: true, difficulty: "hard", map: "forest" });
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
