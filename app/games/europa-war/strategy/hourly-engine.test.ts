import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceDay, advanceHour, advanceHours, applyAction } from "./engine";
import { createWorld, GEOGRAPHY } from "./world";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { HOURS_PER_DAY, MAX_CAMPAIGN_HOUR, hourLabel, worldHour } from "./time";
import type { Action, World } from "./types";

function order(w: World, action: Action): World {
  const result = applyAction(w, action);
  assert.equal(result.error, null);
  return result.world;
}

test("Saatlik takvim gün sınırında ekonomiyi ve iş kuyruklarını yalnız bir kez ilerletir", () => {
  let w = createWorld("turkey");
  w = order(w, { type: "build", building: "civil", province: "turkey-0" });
  w = order(w, { type: "research", id: "weapons1" });
  w = order(w, { type: "recruit", unit: "infantry", province: "turkey-0" });
  const initial = structuredClone(w);
  const before = structuredClone(w.countries.turkey);
  w = advanceHours(w, 23);
  assert.equal(worldHour(w), 23);
  assert.equal(w.day, 0);
  assert.equal(hourLabel(worldHour(w)), "23:00");
  assert.equal(w.countries.turkey.treasury, before.treasury);
  assert.deepEqual(w.countries.turkey.construction, before.construction);
  assert.deepEqual(w.countries.turkey.research, before.research);
  assert.deepEqual(w.countries.turkey.recruitment, before.recruitment);
  const midnight = advanceHour(w);
  assert.equal(worldHour(midnight), HOURS_PER_DAY);
  assert.equal(midnight.day, 1);
  assert.equal(midnight.hour, 0);
  assert.ok(
    midnight.countries.turkey.construction[0].progress >
      before.construction[0].progress,
  );
  assert.ok(
    midnight.countries.turkey.research[0].progress >
      before.research[0].progress,
  );
  assert.ok(
    midnight.countries.turkey.recruitment[0].progress >
      before.recruitment[0].progress,
  );
  const one = advanceHour(midnight);
  assert.deepEqual(
    one.countries.turkey.construction,
    midnight.countries.turkey.construction,
  );
  assert.deepEqual(
    one.countries.turkey.research,
    midnight.countries.turkey.research,
  );
  assert.deepEqual(
    one.countries.turkey.recruitment,
    midnight.countries.turkey.recruitment,
  );
  assert.equal(initial.day, 0);
  assert.equal(initial.hour, 0);
  assert.ok(validateWorld(one));
});

test("Birlikler gün değişmeden saatlik mesafe alır, grup tümenleri birlikte ilerler", () => {
  let w = createWorld("turkey");
  const armies = w.armies.filter((a) => a.country === "turkey").slice(0, 2);
  const origin = w.countries.turkey.capital;
  const destination = GEOGRAPHY[origin].neighbors.find(
    (e) => !e.sea && w.provinces[e.id].controller === "turkey",
  )!.id;
  for (const army of armies) {
    army.province = origin;
    army.general = null;
  }
  w = order(w, {
    type: "moveGroup",
    armies: armies.map((a) => a.id),
    to: destination,
  });
  const before = structuredClone(w);
  const next = advanceHour(w);
  assert.deepEqual(w, before, "Saat hesaplaması kaynak dünyayı değiştirmemeli");
  const moved = next.armies.filter((a) => armies.some((b) => b.id === a.id));
  assert.equal(next.day, 0);
  for (const army of moved) {
    assert.ok(army.move);
    assert.equal(army.province, origin);
    assert.ok(army.move.progress > 0 && army.move.progress < army.move.days);
  }
  assert.ok(
    Math.abs(
      moved[0].move!.progress / moved[0].move!.days -
        moved[1].move!.progress / moved[1].move!.days,
    ) < 1e-10,
  );
});

test("24 saatlik toplu adım, tek tek saatler ve günlük uyumluluk API'si aynı dünyayı verir", () => {
  const initial = createWorld("turkey", "alternative", 7331);
  initial.hour = 13;
  const snapshot = structuredClone(initial);
  let individual = initial;
  for (let i = 0; i < HOURS_PER_DAY; i++) individual = advanceHour(individual);
  assert.deepEqual(advanceDay(initial), individual);
  assert.deepEqual(advanceHours(initial, HOURS_PER_DAY), individual);
  assert.deepEqual(initial, snapshot);
  assert.equal(individual.hour, 13);
  assert.equal(individual.day, 1);
});

test("Yüz oyun saati ve ara saatte yüklenen kayıt aynı sonucu ve geçerli dünyayı üretir", () => {
  let uninterrupted = createWorld("turkey", "historical", 91);
  uninterrupted = advanceHours(uninterrupted, 17);
  let restored = decodeSave(encodeSave(uninterrupted));
  for (let i = 17; i < 100; i++) {
    uninterrupted = advanceHour(uninterrupted);
    restored = advanceHour(restored);
  }
  assert.deepEqual(restored, uninterrupted);
  assert.equal(worldHour(restored), 100);
  assert.ok(validateWorld(restored));
});

test("Geçersiz veya tarih sınırını aşan saat isteği kaynak duruma dokunmaz", () => {
  const w = createWorld("turkey");
  const snapshot = structuredClone(w);
  for (const hours of [-1, 0.5, 25, Infinity, NaN])
    assert.throws(() => advanceHours(w, hours));
  assert.deepEqual(w, snapshot);
  assert.deepEqual(advanceHours(w, 0), w);
  w.day = 36500;
  w.hour = 23;
  assert.equal(worldHour(w), MAX_CAMPAIGN_HOUR);
  assert.throws(() => advanceHour(w), /tarih sınırı/);
  assert.equal(worldHour(w), MAX_CAMPAIGN_HOUR);
});
