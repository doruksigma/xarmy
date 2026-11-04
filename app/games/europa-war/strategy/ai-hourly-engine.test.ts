import assert from "node:assert/strict";
import { test } from "node:test";
import { declareWar } from "./diplomacy";
import { advanceHour, advanceHours, applyAction } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { addArmy, createWorld, GEOGRAPHY } from "./world";

function activeWar() {
  const world = createWorld("turkey", "historical", 1936, "hard");
  declareWar(world, "germany", "poland");
  world.armies = world.armies.filter(
    (army) => !["germany", "poland"].includes(army.country),
  );
  const guard = addArmy(world, "germany", world.countries.germany.capital);
  addArmy(world, "poland", world.countries.poland.capital);
  const attackers = Array.from({ length: 3 }, () =>
    addArmy(world, "germany", "germany-7"),
  );
  const defender = addArmy(world, "poland", "poland-2");
  for (const army of [guard, ...attackers, defender]) {
    army.general = null;
    army.organization = army.morale = 100;
    army.supply = 1;
  }
  return { world, guard: guard.id, attackers: attackers.map((a) => a.id) };
}

test("hard AI issues real attack orders within six game hours without a weekly boundary", () => {
  const { world, guard, attackers } = activeWar();
  const snapshot = structuredClone(world);
  const after = advanceHours(world, 6);
  assert.equal(after.day, 0);
  assert.deepEqual(world, snapshot);
  const field = after.armies.filter((a) => attackers.includes(a.id));
  assert.equal(field.length, 3);
  assert.ok(
    field.every((a) => a.move || a.route.length),
    "the hourly engine must execute the AI's actual movement orders",
  );
  const reserved = after.armies.find((a) => a.id === guard)!;
  assert.equal(reserved.province, after.countries.germany.capital);
  assert.equal(reserved.move, null);
  assert.deepEqual(reserved.route, []);
  assert.ok(validateWorld(after));
});

test("frequent AI decisions never recall the player's capital division or replace their order", () => {
  const { world } = activeWar();
  const capital = world.countries.turkey.capital;
  const army = world.armies.find(
    (a) => a.country === "turkey" && a.province === capital,
  )!;
  const target = GEOGRAPHY[capital].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === "turkey",
  )!.id;
  const result = applyAction(world, {
    type: "move",
    army: army.id,
    to: target,
  });
  assert.equal(result.error, null);
  const after = advanceHours(result.world, 6);
  const moving = after.armies.find((a) => a.id === army.id)!;
  assert.ok(moving.province === target || moving.move?.to === target);
  if (moving.move) assert.ok(moving.move.progress > 0);
  assert.ok(validateWorld(after));
});

test("hard war tactics resume deterministically from an intra-day save and across daily settlement", () => {
  const initial = activeWar().world;
  const beforeSave = advanceHours(initial, 5);
  const restored = decodeSave(encodeSave(beforeSave));
  let individual = restored;
  for (let hour = 0; hour < 24; hour++) individual = advanceHour(individual);
  const batched = advanceHours(beforeSave, 24);
  assert.deepEqual(individual, batched);
  assert.equal(batched.day, 1);
  assert.equal(batched.hour, 5);
  assert.equal(batched.difficulty, "hard");
  assert.ok(validateWorld(batched));
});
