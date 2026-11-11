import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, addArmy } from "./world";
import { MAX_ARMIES } from "./campaign-limits";
import { allCountryEvents, historicalFocusId } from "./historical-catalog";
import { reserveReinforcements, resolveReinforcements } from "./reinforcements";
import {
  decodeSave,
  encodeSave,
  MAX_SAVE_BYTES,
  validateWorld,
} from "./storage";

test("Azami tümen ve ücretli sevkiyatlar bütün ulusal olay geçmişiyle sekiz MiB içinde yüklenir", (context) => {
  const w = createWorld("germany");
  w.armies = [];
  const c = w.countries.germany;
  c.autoAssignCommanders = false;
  c.manpower = 100000000;
  for (const key of Object.keys(c.equipment) as (keyof typeof c.equipment)[])
    c.equipment[key] = 100000;
  for (let i = 0; i < MAX_ARMIES; i++) {
    const army = addArmy(
      w,
      c.id,
      c.capital,
      i % 3 === 0 ? "heavyTank" : i % 3 === 1 ? "mechanized" : "infantry",
    );
    army.strength = 70;
    army.supply = 1;
    army.support = ["artillery", "engineers", "logistics"];
    army.general = null;
  }
  reserveReinforcements(w, new Set(w.armies.map((army) => army.id)));
  assert.equal(w.reinforcements!.shipments.length, MAX_ARMIES);
  // Synthetic complete decision archive. Declines avoid impossible mutually
  // exclusive accepted outcomes while exercising every persisted identifier.
  w.historical = { pending: [], resolved: [] };
  for (const definition of allCountryEvents()) {
    w.countries[definition.country].focuses.push(
      historicalFocusId(definition.id),
    );
    w.historical.resolved.push({
      eventId: definition.id,
      day: 0,
      outcome: "declined",
      by: definition.country,
    });
  }
  assert.ok(validateWorld(w));
  const raw = encodeSave(w),
    bytes = Buffer.byteLength(raw);
  assert.ok(
    bytes > 4 * 1024 * 1024,
    `stress fixture must exercise previous limit: ${bytes}`,
  );
  assert.ok(bytes <= MAX_SAVE_BYTES, `bounded save budget exceeded: ${bytes}`);
  const loaded = decodeSave(raw);
  assert.equal(loaded.armies.length, MAX_ARMIES);
  assert.equal(loaded.reinforcements!.shipments.length, MAX_ARMIES);
  assert.deepEqual(loaded.historical, w.historical);
  loaded.hour = 1;
  resolveReinforcements(loaded, new Set(loaded.armies.map((army) => army.id)));
  assert.ok(validateWorld(loaded));
  assert.equal(decodeSave(encodeSave(loaded)).armies.length, MAX_ARMIES);
  context.diagnostic(
    JSON.stringify({
      armies: MAX_ARMIES,
      shipments: w.reinforcements!.shipments.length,
      resolutions: w.historical.resolved.length,
      bytes,
      limit: MAX_SAVE_BYTES,
    }),
  );
});

test("Sekiz MiB üstündeki ASCII ve çok baytlı kayıtlar JSON ayrıştırmadan reddedilir", () => {
  assert.throws(() => decodeSave("x".repeat(MAX_SAVE_BYTES + 1)), /8 MiB/);
  const multibyte = "€".repeat(Math.floor(MAX_SAVE_BYTES / 3) + 1);
  assert.ok(multibyte.length < MAX_SAVE_BYTES);
  assert.throws(() => decodeSave(multibyte), /8 MiB/);
});
