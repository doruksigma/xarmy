import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, createWorld } from "./engine";
import { applyCountryAction } from "./action-engine";
import { createCommand, executeCommand } from "./commands";
import { isValidAction } from "./command-types";
import { constructionSchedule, constructionWorkPerDay } from "./construction";
import { economyDay } from "./economy";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { capacity } from "./world";
import type { Action, World } from "./types";

function order(world: World, action: Action) {
  const result = applyAction(world, action);
  assert.equal(result.error, null);
  return result.world;
}

function fixture() {
  let world = createWorld("turkey", "alternative");
  world.countries.turkey.treasury = 10_000;
  for (const [province, building] of [
    ["turkey-0", "civil"],
    ["turkey-1", "military"],
    ["turkey-2", "fort"],
  ] as const) {
    world.provinces[province].buildings[building] = 0;
    world = order(world, { type: "build", province, building });
  }
  return world;
}

test("İnşaat önceliği yalnız komşu projeleri değiştirir, bütçe ve ilerlemeyi korur", () => {
  let world = fixture();
  const queue = world.countries.turkey.construction;
  queue.forEach((entry, index) => (entry.progress = index + 4));
  const before = structuredClone(world);
  const ids = queue.map((entry) => entry.id);
  world = order(world, {
    type: "prioritizeBuild",
    id: ids[2],
    direction: "up",
  });
  assert.deepEqual(
    world.countries.turkey.construction.map((q) => q.id),
    [ids[0], ids[2], ids[1]],
  );
  assert.equal(
    world.countries.turkey.treasury,
    before.countries.turkey.treasury,
  );
  for (const entry of world.countries.turkey.construction)
    assert.deepEqual(
      entry,
      before.countries.turkey.construction.find((q) => q.id === entry.id),
    );
  assert.deepEqual(before.countries.turkey.construction, queue);
  world = order(world, {
    type: "prioritizeBuild",
    id: ids[2],
    direction: "down",
  });
  assert.deepEqual(
    world.countries.turkey.construction,
    before.countries.turkey.construction,
  );
});

test("Sınır, olmayan proje ve başka ülkenin inşaatına öncelik emirleri atomik reddedilir", () => {
  const world = fixture();
  const queue = world.countries.turkey.construction;
  const before = structuredClone(world);
  for (const action of [
    { type: "prioritizeBuild", id: queue[0].id, direction: "up" },
    { type: "prioritizeBuild", id: queue[2].id, direction: "down" },
    { type: "prioritizeBuild", id: "missing-project", direction: "up" },
  ] as const) {
    assert.ok(applyAction(world, action).error);
    assert.deepEqual(world, before);
  }
  const foreign = applyCountryAction(world, "germany", {
    type: "prioritizeBuild",
    id: queue[1].id,
    direction: "up",
  });
  assert.ok(foreign.error);
  assert.deepEqual(world, before);
  assert.equal(
    isValidAction({
      type: "prioritizeBuild",
      id: queue[1].id,
      direction: "top",
    }),
    false,
  );
});

test("İşgal edilen ilk proje bekler; sıradaki yerli proje ilerler ve doğru kimlik silinir", () => {
  const world = fixture();
  const country = world.countries.turkey;
  const [blocked, active, waiting] = country.construction;
  blocked.progress = 3;
  active.progress = active.total - 0.01;
  world.provinces[blocked.province].controller = "bulgaria";
  const level = world.provinces[active.province].buildings[active.building];
  economyDay(world);
  assert.equal(blocked.progress, 3);
  assert.equal(waiting.progress, 0);
  assert.deepEqual(
    country.construction.map((q) => q.id),
    [blocked.id, waiting.id],
  );
  assert.equal(
    world.provinces[active.province].buildings[active.building],
    level + 1,
  );
  world.provinces[blocked.province].controller = country.id;
  economyDay(world);
  assert.ok(blocked.progress > 3);
  assert.equal(waiting.progress, 0);
});

test("Tüm projeler işgal altındaysa ilerleme ve yapı seviyeleri korunur", () => {
  const world = fixture();
  const country = world.countries.turkey;
  for (const entry of country.construction)
    world.provinces[entry.province].controller = "bulgaria";
  const queue = structuredClone(country.construction);
  const levels = queue.map(
    (q) => world.provinces[q.province].buildings[q.building],
  );
  economyDay(world);
  assert.deepEqual(country.construction, queue);
  assert.deepEqual(
    queue.map((q) => world.provinces[q.province].buildings[q.building]),
    levels,
  );
  assert.ok(
    constructionSchedule(world, country).every(
      (item) => item.state === "occupied" && item.days === null,
    ),
  );
});

test("Öncelik emri makbuzu ve sıra kayıt yüklemede korunur, tekrar emir yeniden sıralamaz", () => {
  const world = fixture();
  const id = world.countries.turkey.construction[1].id;
  const command = createCommand(world, {
    type: "prioritizeBuild",
    id,
    direction: "up",
  });
  const result = executeCommand(world, command, world.player);
  assert.equal(result.status, "applied");
  assert.ok(validateWorld(result.world));
  const loaded = decodeSave(encodeSave(result.world));
  assert.deepEqual(loaded, result.world);
  assert.equal(loaded.countries.turkey.construction[0].id, id);
  const duplicate = executeCommand(loaded, command, loaded.player);
  assert.equal(duplicate.status, "duplicate");
  assert.deepEqual(duplicate.world, loaded);
});

test("İnşaat tahmini gerçek günlük katsayıları ve proje başına gün yuvarlamasını kullanır", () => {
  const world = fixture();
  const country = world.countries.turkey;
  country.economy = "war";
  country.advisor = "industry";
  country.cabinet.economy = "builder";
  assert.ok(Math.abs(constructionWorkPerDay(country, 100) - 92.575) < 1e-9);
  assert.equal(constructionWorkPerDay(country, 0), 0.1);
  const [blocked, active, waiting] = country.construction;
  world.provinces[blocked.province].controller = "bulgaria";
  const rate = constructionWorkPerDay(
    country,
    capacity(world, country.id, "civil"),
  );
  active.progress = active.total - rate * 2.5;
  waiting.progress = waiting.total - rate * 1.5;
  const schedule = constructionSchedule(world, country);
  assert.deepEqual(
    schedule.map((item) => [item.entry.id, item.state, item.days]),
    [
      [blocked.id, "occupied", null],
      [active.id, "active", 3],
      [waiting.id, "waiting", 5],
    ],
  );
  const before = active.progress;
  economyDay(world);
  assert.ok(Math.abs(active.progress - before - rate) < 1e-9);
});
