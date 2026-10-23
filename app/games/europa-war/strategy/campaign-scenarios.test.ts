import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, advanceDay } from "./engine";
import { declareWar } from "./diplomacy";
import { createWorld, GEOGRAPHY } from "./world";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import type { World } from "./types";

const scenarios: [
  string,
  string,
  World["mode"],
  World["difficulty"],
  number,
][] = [
  ["turkey", "bulgaria", "historical", "easy", 1936],
  ["germany", "poland", "alternative", "normal", 42],
  ["france", "germany", "historical", "hard", 123],
  ["italy", "yugoslavia", "alternative", "easy", 2026],
  ["ussr", "finland", "historical", "normal", 77],
  ["poland", "germany", "alternative", "hard", 998],
];

for (const [player, enemy, mode, difficulty, seed] of scenarios)
  test(`${player}: ${mode}/${difficulty} savaş, toplu emir ve 90 günlük kayıt devamlılığı`, () => {
    let world = createWorld(player, mode, seed, difficulty);
    declareWar(world, player, enemy);
    const border = Object.values(GEOGRAPHY).find(
      (p) =>
        world.provinces[p.id].controller === player &&
        p.neighbors.some(
          (e) => !e.sea && world.provinces[e.id].controller === enemy,
        ),
    )!;
    const target = border.neighbors.find(
      (e) => !e.sea && world.provinces[e.id].controller === enemy,
    )!.id;
    const ids = world.armies
      .filter((a) => a.country === player)
      .slice(0, 3)
      .map((a) => a.id);
    assert.ok(ids.length >= 2);
    const order = applyAction(world, {
      type: "moveGroup",
      armies: ids,
      to: target,
    });
    assert.equal(order.error, null);
    world = order.world;
    assert.ok(
      world.armies
        .filter((a) => ids.includes(a.id))
        .every((a) => a.route.at(-1) === target),
    );
    for (let day = 1; day <= 90; day++) {
      world = advanceDay(world);
      assert.equal(world.day, day);
      if (day % 7 === 0)
        assert.ok(validateWorld(world), `${player}, gün ${day}`);
      if (day % 30 === 0) {
        const restored = decodeSave(encodeSave(world));
        assert.deepEqual(restored, world);
        assert.deepEqual(
          advanceDay(restored),
          advanceDay(world),
          "Yüklenen savaş aynı sonraki günü üretmeli",
        );
        world = restored;
      }
    }
    assert.ok(validateWorld(world));
    // Winning is not assumed: defeats and capitulation must also remain saveable.
  });
