import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createWorld } from "./world";
import { encodeSave, SAVE_CHANGE_EVENT, type SaveSlot } from "./storage";
import {
  listBrowserSaves,
  loadBrowserSave,
  saveAutomatic,
  saveBrowserSlot,
  SAVE_CHANNEL,
} from "./storage-browser";

// This deliberately small event-controlled adapter tests our queue and error
// boundary. The browser suite exercises the actual IndexedDB implementation.
class ControlledDatabase {
  records = new Map<string, unknown>();
  pending: { slot: string; value: unknown; transaction: IDBTransaction }[] = [];
  denied = false;
  onversionchange: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close() {}
  transaction(_store: string, mode: IDBTransactionMode) {
    if (this.denied) throw new Error("Denied");
    const transaction = {
      oncomplete: null,
      onabort: null,
      onerror: null,
      objectStore: () => ({
        put: (value: unknown, slot: string) => {
          assert.equal(mode, "readwrite");
          this.pending.push({
            slot,
            value: structuredClone(value),
            transaction: transaction as unknown as IDBTransaction,
          });
          return {};
        },
        openCursor: (slot: string) => {
          const request = {
            result: null,
            onsuccess: null,
          } as unknown as IDBRequest;
          queueMicrotask(() => {
            Object.defineProperty(request, "result", {
              value: this.records.has(slot)
                ? { value: structuredClone(this.records.get(slot)) }
                : null,
            });
            request.onsuccess?.call(request, new Event("success"));
            const tx = transaction as unknown as IDBTransaction;
            tx.oncomplete?.call(tx, new Event("complete"));
          });
          return request;
        },
      }),
    };
    return transaction;
  }
  finish(commit = true) {
    const pending = this.pending.shift();
    assert.ok(pending, "A queued save should have started");
    const tx = pending.transaction;
    if (commit) {
      this.records.set(pending.slot, pending.value);
      tx.oncomplete?.call(tx, new Event("complete"));
    } else tx.onabort?.call(tx, new Event("abort"));
  }
}

test("Cihaz kayıt kuyruğu tamamlanmayı, hata sonrası toparlanmayı ve eski kayıt sınırlarını korur", async (t) => {
  const globals = ["indexedDB", "localStorage", "window", "BroadcastChannel"];
  const originals = globals.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const db = new ControlledDatabase();
  const local = new Map<string, string>();
  const events = new EventTarget();
  let notifications = 0;
  const broadcasts: string[] = [];
  events.addEventListener(SAVE_CHANGE_EVENT, () => notifications++);
  const install = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, { value, configurable: true });
  install("indexedDB", {
    open: () => {
      const request = {
        result: db,
        onsuccess: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() =>
        request.onsuccess?.call(request, new Event("success")),
      );
      return request;
    },
  });
  const storage = {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: () => assert.fail("Device saves must not write localStorage"),
  };
  install("localStorage", storage);
  install("window", events);
  install(
    "BroadcastChannel",
    class {
      constructor(name: string) {
        assert.equal(name, SAVE_CHANNEL);
      }
      postMessage(value: { slot: string }) {
        broadcasts.push(value.slot);
      }
      close() {
        broadcasts.push("closed");
      }
    },
  );
  const key = (slot: SaveSlot) => `xarmy-europa-1936-v1:${slot}`;
  try {
    await t.test(
      "Yazmalar sırayla tamamlanır; okuma bekler, başarısız kayıt sonraki kaydı engellemez",
      async () => {
        const original = createWorld("turkey");
        const first = saveAutomatic("auto-1", {
          ...original,
          day: 14,
          hour: 7,
        });
        const second = saveAutomatic("auto-1", {
          ...original,
          day: 28,
          hour: 19,
        });
        const rejected = assert.rejects(second, /Cihaz kaydı yapılamadı/);
        let readDone = false;
        const read = loadBrowserSave("auto-1").then((w) => {
          readDone = true;
          return w;
        });
        await setImmediate();
        assert.equal(db.pending.length, 1);
        assert.equal(notifications, 0);
        assert.equal(readDone, false);
        db.finish();
        await first;
        await setImmediate();
        assert.equal(db.pending.length, 1);
        assert.equal(notifications, 1);
        assert.equal(readDone, false);
        db.finish(false);
        await rejected;
        const loaded = await read;
        assert.equal(loaded.day, 14);
        assert.equal(loaded.hour, 7);
        assert.equal(loaded.version, 3);
        assert.equal(
          notifications,
          1,
          "Abort must not announce a committed save",
        );
        const stringify = mock.method(JSON, "stringify");
        const third = saveAutomatic("auto-1", {
          ...original,
          day: 42,
          hour: 23,
        });
        await setImmediate();
        db.finish();
        await third;
        assert.equal(
          stringify.mock.callCount(),
          0,
          "Gameplay saving must not JSON-serialize the world",
        );
        stringify.mock.restore();
        const latest = await loadBrowserSave("auto-1");
        assert.equal(latest.day, 42);
        assert.equal(latest.hour, 23);
        assert.equal(
          (await listBrowserSaves()).find((save) => save.slot === "auto-1")
            ?.label,
          `${original.countries.turkey.name} · 42. gün · 23:00`,
        );
        assert.equal(notifications, 2);
        assert.deepEqual(broadcasts, ["auto-1", "closed", "auto-1", "closed"]);
      },
    );
    await t.test(
      "Yalnızca eksik otomatik yuva eski kayda döner; bozuk değer eski kayıtla gizlenmez",
      async () => {
        local.set(key("auto-2"), encodeSave(createWorld("turkey")));
        local.set(key("slot-1"), encodeSave(createWorld("turkey")));
        assert.equal((await loadBrowserSave("auto-2")).day, 0);
        db.records.set("auto-2", undefined);
        await assert.rejects(loadBrowserSave("auto-2"));
        const slots = await listBrowserSaves();
        assert.deepEqual(
          slots.find((s) => s.slot === "auto-2"),
          {
            slot: "auto-2",
            label: "Okunamayan kayıt",
            valid: false,
          },
        );
        assert.equal(slots.find((s) => s.slot === "slot-1")?.valid, true);
        assert.equal((await loadBrowserSave("slot-1")).day, 0);
      },
    );
    await t.test(
      "Elle kayıtlar IndexedDB'de tamamlanır; aynı yuvaya son çağrı kazanır ve diğer yuvalar ayrıdır",
      async () => {
        const original = createWorld("turkey");
        const first = saveBrowserSlot("slot-1", {
          ...original,
          day: 15,
          hour: 2,
        });
        const other = saveBrowserSlot("slot-2", {
          ...original,
          day: 20,
          hour: 6,
        });
        const last = saveBrowserSlot("slot-1", {
          ...original,
          day: 30,
          hour: 11,
        });
        let loaded = false;
        const read = loadBrowserSave("slot-1").then((world) => {
          loaded = true;
          return world;
        });
        await setImmediate();
        assert.equal(db.pending.length, 1);
        assert.equal(db.pending[0].slot, "slot-1");
        db.finish();
        await first;
        await setImmediate();
        assert.equal(db.pending[0].slot, "slot-2");
        assert.equal(loaded, false);
        db.finish();
        await other;
        await setImmediate();
        assert.equal(db.pending[0].slot, "slot-1");
        assert.equal(loaded, false);
        db.finish();
        await last;
        const latest = await read;
        assert.equal(latest.day, 30);
        assert.equal(latest.hour, 11);
        assert.equal((await loadBrowserSave("slot-2")).day, 20);
        assert.equal(
          (await listBrowserSaves()).find((save) => save.slot === "slot-1")
            ?.label,
          `${original.countries.turkey.name} · 30. gün · 11:00`,
        );
        assert.deepEqual(broadcasts.slice(-6), [
          "slot-1",
          "closed",
          "slot-2",
          "closed",
          "slot-1",
          "closed",
        ]);
      },
    );
    await t.test(
      "Elle kayıt JSON üretmeden yazılır; localStorage erişimi veya kotası gerektirmez",
      async () => {
        const original = createWorld("turkey");
        const get = mock.method(storage, "getItem", () => {
          throw new Error("Local storage quota or permission denied");
        });
        const stringify = mock.method(JSON, "stringify");
        try {
          const saved = saveBrowserSlot("slot-3", {
            ...original,
            day: 45,
            hour: 16,
          });
          await setImmediate();
          db.finish();
          await saved;
          assert.equal(
            stringify.mock.callCount(),
            0,
            "Manual IndexedDB writes must not serialize the world",
          );
          stringify.mock.restore();
          assert.equal((await loadBrowserSave("slot-3")).day, 45);
          const slots = await listBrowserSaves();
          assert.ok(
            slots
              .filter((slot) => slot.slot.startsWith("slot-"))
              .every((slot) => slot.valid),
          );
          assert.equal(
            get.mock.callCount(),
            0,
            "All five existing IndexedDB records must bypass legacy storage",
          );
        } finally {
          stringify.mock.restore();
          get.mock.restore();
        }
      },
    );
    await t.test(
      "Bozuk elle kayıt eski yerel kayıtla gizlenmez; yalnız gerçekten eksik yuva eski kayda döner",
      async () => {
        local.set(key("slot-2"), encodeSave(createWorld("turkey")));
        db.records.set("slot-2", undefined);
        await assert.rejects(loadBrowserSave("slot-2"));
        assert.deepEqual(
          (await listBrowserSaves()).find((slot) => slot.slot === "slot-2"),
          { slot: "slot-2", label: "Okunamayan kayıt", valid: false },
        );
        db.records.delete("slot-2");
        assert.equal((await loadBrowserSave("slot-2")).day, 0);
        assert.equal(
          (await listBrowserSaves()).find((slot) => slot.slot === "slot-2")
            ?.valid,
          true,
        );
      },
    );
    await t.test(
      "Başarısız elle kayıt önceki tamamlanmış yuvayı korur ve sonraki yazmayı engellemez",
      async () => {
        const before = notifications;
        const original = createWorld("turkey");
        const bad = saveBrowserSlot("slot-1", { ...original, day: 50 });
        const rejected = assert.rejects(bad, /Cihaz kaydı yapılamadı/);
        await setImmediate();
        db.finish(false);
        await rejected;
        assert.equal(notifications, before);
        assert.equal((await loadBrowserSave("slot-1")).day, 30);
        const good = saveBrowserSlot("slot-1", { ...original, day: 60 });
        await setImmediate();
        db.finish();
        await good;
        assert.equal((await loadBrowserSave("slot-1")).day, 60);
        assert.equal(notifications, before + 1);
      },
    );
    await t.test(
      "Veritabanı erişimi reddedilince hiçbir eski kayıt güncelmiş gibi gösterilmez",
      async () => {
        const before = notifications;
        db.denied = true;
        await assert.rejects(
          saveAutomatic("auto-2", createWorld("turkey")),
          /Cihaz kaydı yapılamadı/,
        );
        await assert.rejects(
          loadBrowserSave("auto-2"),
          /Cihaz kaydı okunamadı/,
        );
        await assert.rejects(
          loadBrowserSave("slot-1"),
          /Cihaz kaydı okunamadı/,
        );
        const slots = await listBrowserSaves();
        assert.ok(
          slots.every((s) => !s.valid && s.label === "Okunamayan kayıt"),
        );
        assert.equal(notifications, before);
      },
    );
  } finally {
    db.onversionchange?.();
    globals.forEach((key, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
    mock.restoreAll();
  }
});
