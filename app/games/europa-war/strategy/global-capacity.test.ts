import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ARMIES, hasArmyCapacity } from "./campaign-limits";
import { openConference } from "./conference";
import { economyDay } from "./economy";
import { applyAction } from "./engine";
import { startCivilWar } from "./politics";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { controlled, createWorld, MAP } from "./world";
import type { World } from "./types";

function fillArmies(world: World, count: number) {
  const template = world.armies.find((army) => army.country === world.player)!;
  world.armies = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template),
    id: `capacity-army-${index}`,
    general: null,
  }));
  const country = world.countries[world.player];
  country.manpower = 1_000_000;
  country.equipment.rifle = 10_000;
}

test("Another country's paid training reserves the final global army slot without charging a rejected recruit", () => {
  const world = createWorld("turkey");
  fillArmies(world, MAX_ARMIES - 1);
  world.countries.germany.recruitment.push({
    id: "foreign-reservation",
    province: world.countries.germany.capital,
    type: "infantry",
    progress: 0,
    total: 10,
  });
  const before = structuredClone(world);
  assert.equal(hasArmyCapacity(world), false);
  const result = applyAction(world, {
    type: "recruit",
    unit: "infantry",
    province: world.countries.turkey.capital,
  });
  assert.match(result.error ?? "", /kapasitesi/);
  assert.deepEqual(world, before);
  assert.deepEqual(result.world, before);
});

test("The final two paid formations deploy once and the full-capacity campaign round-trips", () => {
  let world = createWorld("turkey");
  fillArmies(world, MAX_ARMIES - 2);
  const action = {
    type: "recruit",
    unit: "infantry",
    province: world.countries.turkey.capital,
  } as const;
  for (let i = 0; i < 2; i++) {
    const result = applyAction(world, action);
    assert.equal(result.error, null);
    world = result.world;
  }
  const remainingManpower = world.countries.turkey.manpower;
  const rejected = applyAction(world, action);
  assert.match(rejected.error ?? "", /kapasitesi/);
  assert.equal(rejected.world.countries.turkey.manpower, remainingManpower);
  for (const queue of world.countries.turkey.recruitment) queue.total = 1;
  economyDay(world);
  assert.equal(world.armies.length, MAX_ARMIES);
  assert.equal(world.countries.turkey.recruitment.length, 0);
  const deployedIds = world.armies.slice(-2).map((army) => army.id);
  assert.equal(new Set(deployedIds).size, 2);
  assert.ok(
    world.armies
      .slice(-2)
      .every((army) => army.province === world.countries.turkey.capital),
  );
  economyDay(world);
  assert.equal(world.armies.length, MAX_ARMIES);
  assert.ok(validateWorld(world));
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Previously paid overflow training waits at 100% and survives loss of its deployment city", () => {
  const world = createWorld("turkey");
  fillArmies(world, MAX_ARMIES);
  const province = world.countries.turkey.capital;
  world.countries.turkey.recruitment.push({
    id: "paid-old-queue",
    province,
    type: "infantry",
    progress: 1,
    total: 1,
  });
  economyDay(world);
  assert.equal(world.armies.length, MAX_ARMIES);
  assert.equal(world.countries.turkey.recruitment[0].progress, 1);
  world.armies.pop();
  world.provinces[province].controller = "germany";
  economyDay(world);
  assert.equal(world.armies.length, MAX_ARMIES - 1);
  assert.equal(world.countries.turkey.recruitment.length, 1);
  world.provinces[province].controller = "turkey";
  economyDay(world);
  assert.equal(world.armies.length, MAX_ARMIES);
  assert.equal(world.countries.turkey.recruitment.length, 0);
});

test("A civil war cannot bypass the global reserve and destroy paid recruitment capacity", () => {
  const world = createWorld("turkey");
  fillArmies(world, MAX_ARMIES - 1);
  world.countries.turkey.recruitment.push({
    id: "reserved-before-revolt",
    province: world.countries.turkey.capital,
    type: "infantry",
    progress: 0,
    total: 1,
  });
  startCivilWar(world, "spain", true);
  assert.ok(world.countries["spain-rebels"]);
  assert.equal(world.armies.length, MAX_ARMIES - 1);
  economyDay(world);
  assert.equal(world.armies.length, MAX_ARMIES);
  assert.equal(world.countries.turkey.recruitment.length, 0);
});

test(
  "A global conference beyond participant 60 saves, loads and keeps its event within the text budget",
  {
    skip: MAP.countries.length < 62 ? "Requires the global atlas" : false,
  },
  () => {
    const world = createWorld("turkey");
    const loser = world.countries.poland;
    const participants = Object.keys(world.countries).filter(
      (id) => id !== loser.id,
    );
    loser.wars = [...participants];
    loser.capitulated = true;
    loser.victor = participants[0];
    for (const id of participants) {
      world.countries[id].wars = [loser.id];
      world.warScore[id] = { [loser.id]: 1 };
    }
    for (const province of controlled(world, loser.id))
      province.controller = participants[0];
    // Even maximal persisted names must not turn an ordinary game event into an invalid save.
    loser.name = "P".repeat(500);
    for (const id of participants.slice(0, 5))
      world.countries[id].name = "D".repeat(500);
    const conference = openConference(world, loser.id);
    assert.ok(conference.participants.length > 60);
    conference.turn = 60;
    assert.ok(world.events[0].text.length <= 500);
    assert.match(world.events[0].text, /ülke daha/);
    assert.ok(validateWorld(world));
    const loaded = decodeSave(encodeSave(world));
    assert.equal(loaded.conferences[0].turn, 60);
    assert.deepEqual(
      loaded.conferences[0].participants,
      conference.participants,
    );
  },
);
