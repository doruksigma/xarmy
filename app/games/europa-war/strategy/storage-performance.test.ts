import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "./world";
import {
  decodeSave,
  encodeSave,
  listSaves,
  loadLocal,
  saveLocal,
  SAVE_CHANGE_EVENT,
  SAVE_SLOTS,
} from "./storage";

class MemoryStorage implements Storage {
  entries = new Map<string, string>();
  failRead = false;
  failWrite = false;
  get length() {
    return this.entries.size;
  }
  key(i: number) {
    return [...this.entries.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.failRead) throw new Error("Storage access denied");
    return this.entries.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrite) throw new Error("Quota exceeded");
    this.entries.set(k, v);
  }
  removeItem(k: string) {
    this.entries.delete(k);
  }
  clear() {
    this.entries.clear();
  }
}
const slotKey = (slot: string) => `xarmy-europa-1936-v1:${slot}`;
function storageFixture(
  run: (storage: MemoryStorage, events: EventTarget) => void,
) {
  const oldStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage(),
    events = new EventTarget();
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: events,
    configurable: true,
  });
  listSaves(); // A fresh empty store also invalidates any previous test's slot text.
  try {
    run(storage, events);
  } finally {
    if (oldStorage)
      Object.defineProperty(globalThis, "localStorage", oldStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    mock.restoreAll();
  }
}

test("Beş dolu kayıt yuvası değişmedikçe listeleme seferleri tekrar çözümlemez", () =>
  storageFixture((storage) => {
    const w = createWorld("turkey"),
      raw = encodeSave(w);
    for (const slot of SAVE_SLOTS) storage.setItem(slotKey(slot), raw);
    const parse = mock.method(JSON, "parse");
    const first = listSaves();
    assert.ok(first.every((s) => s.valid));
    assert.equal(parse.mock.callCount(), 5);
    first[0].label = "Changed by caller";
    for (let i = 0; i < 100; i++) {
      const summaries = listSaves();
      assert.equal(summaries[0].label, "Türkiye · 0. gün · 00:00");
      assert.ok(summaries.every((s) => s.valid));
    }
    assert.equal(
      parse.mock.callCount(),
      5,
      "Sabit yuvalarda tekrar JSON ayrıştırma/doğrulama yapılmamalı",
    );
    w.day = 14;
    storage.setItem(slotKey("auto-1"), encodeSave(w));
    assert.equal(
      listSaves().find((s) => s.slot === "auto-1")!.label,
      "Türkiye · 14. gün · 00:00",
    );
    assert.equal(
      parse.mock.callCount(),
      6,
      "Yalnızca değişen yuva tekrar doğrulanmalı",
    );
    w.hour = 9;
    storage.setItem(slotKey("auto-1"), encodeSave(w));
    assert.equal(
      listSaves().find((s) => s.slot === "auto-1")!.label,
      "Türkiye · 14. gün · 09:00",
    );
    assert.equal(
      parse.mock.callCount(),
      7,
      "Aynı gün içindeki saat değişimi yalnızca ilgili yuvayı yeniden doğrulamalı",
    );
    for (let i = 0; i < 100; i++)
      assert.equal(
        listSaves().find((s) => s.slot === "auto-1")!.label,
        "Türkiye · 14. gün · 09:00",
      );
    assert.equal(parse.mock.callCount(), 7);
  }));

test("Önbellek dışarıdan değişen ve silinen kayıtları algılar; yükleme ve içe aktarma doğrulamayı atlamaz", () =>
  storageFixture((storage) => {
    const w = createWorld("turkey");
    saveLocal("slot-1", w);
    assert.equal(listSaves()[0].valid, true);
    const parse = mock.method(JSON, "parse");
    assert.equal(loadLocal("slot-1").day, 0);
    assert.equal(loadLocal("slot-1").day, 0);
    assert.equal(
      parse.mock.callCount(),
      2,
      "Her yükleme bağımsız olarak doğrulanmalı",
    );
    const invalid = JSON.parse(encodeSave(w));
    invalid.world.armies[0].strength = -1;
    const badRaw = JSON.stringify(invalid);
    storage.setItem(slotKey("slot-1"), badRaw);
    assert.deepEqual(listSaves()[0], {
      slot: "slot-1",
      label: "Okunamayan kayıt",
      valid: false,
    });
    assert.throws(() => loadLocal("slot-1"));
    assert.throws(() => decodeSave(badRaw));
    w.day = 20;
    storage.setItem(slotKey("slot-1"), encodeSave(w));
    assert.equal(listSaves()[0].label, "Türkiye · 20. gün · 00:00");
    storage.removeItem(slotKey("slot-1"));
    assert.deepEqual(listSaves()[0], {
      slot: "slot-1",
      label: "Boş yuva",
      valid: false,
    });
  }));

test("Depolama erişimi kalkınca önbellekteki geçerli etiket gösterilmez", () =>
  storageFixture((storage) => {
    saveLocal("slot-1", createWorld("turkey"));
    assert.ok(listSaves()[0].valid);
    storage.failRead = true;
    assert.ok(
      listSaves().every((s) => !s.valid && s.label === "Okunamayan kayıt"),
    );
    storage.failRead = false;
    const parse = mock.method(JSON, "parse");
    assert.ok(listSaves()[0].valid);
    assert.equal(
      parse.mock.callCount(),
      1,
      "Erişim geri geldiğinde içerik yeniden doğrulanmalı",
    );
  }));

test("Aynı pencerenin kayıt bildirimi ancak başarılı yazmadan sonra gelir", () =>
  storageFixture((storage, events) => {
    const w = createWorld("turkey");
    let notifications = 0;
    const days: number[] = [];
    const hours: number[] = [];
    events.addEventListener(SAVE_CHANGE_EVENT, () => {
      notifications++;
      const saved = loadLocal("slot-1");
      days.push(saved.day);
      hours.push(saved.hour);
      assert.equal(
        listSaves()[0].label,
        `Türkiye · ${days.at(-1)}. gün · ${String(hours.at(-1)).padStart(2, "0")}:00`,
      );
    });
    saveLocal("slot-1", w);
    w.day = 7;
    w.hour = 13;
    saveLocal("slot-1", w);
    assert.equal(notifications, 2);
    assert.deepEqual(days, [0, 7]);
    assert.deepEqual(hours, [0, 13]);
    storage.failWrite = true;
    w.day = 8;
    w.hour = 4;
    assert.throws(() => saveLocal("slot-1", w), /Cihaz kaydı yapılamadı/);
    assert.equal(notifications, 2);
    const committed = loadLocal("slot-1");
    assert.equal(committed.day, 7);
    assert.equal(committed.hour, 13);
    assert.equal(listSaves()[0].label, "Türkiye · 7. gün · 13:00");
  }));
