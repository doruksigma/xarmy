import assert from "node:assert/strict";
import { test } from "node:test";
import { aiDay } from "./ai";
import { commanderArmies, commandersDay } from "./commanders";
import { applyAction } from "./engine";
import { startCivilWar } from "./politics";
import { validateWorld } from "./storage";
import { controlled, createWorld } from "./world";

test("İç savaş yeni ülkeye eski komutanın dış sınır emrini ve otomatik atama tercihini kopyalamaz", () => {
  let w = createWorld("spain", "alternative");
  const lands = controlled(w, "spain");
  const armies = w.armies.filter((a) => a.country === "spain");
  assert.ok(armies.length >= 3);
  armies[0].province = lands[1].id;
  armies[1].province = lands[1].id;
  armies[2].province = lands[0].id;
  const generalId = armies[0].general!;
  const result = applyAction(w, {
    type: "commanderDeploy",
    general: generalId,
    target: "portugal",
  });
  assert.equal(result.error, null);
  w = result.world;
  const general = w.countries.spain.generals.find((g) => g.id === generalId)!;
  const parentSetting = w.countries.spain.autoAssignCommanders;
  startCivilWar(w, "spain", true);
  const rebels = w.countries["spain-rebels"];
  assert.ok(rebels);
  assert.equal(rebels.autoAssignCommanders, false);
  assert.ok(rebels.generals.every((g) => !g.front));
  assert.equal(w.countries.spain.autoAssignCommanders, parentSetting);
  assert.equal(general.front?.target, "portugal");
  assert.equal(general.front?.stance, "defend");
  for (const id of armies.slice(0, 2).map((a) => a.id)) {
    const transferred = w.armies.find((a) => a.id === id)!;
    assert.equal(transferred.country, rebels.id);
    assert.equal(transferred.general, null);
    assert.equal(transferred.move, null);
    assert.deepEqual(transferred.route, []);
    assert.equal(general.front?.assignments[id], undefined);
  }
  assert.ok(validateWorld(w));

  // The original commander still manages its own members. The independent
  // rebel AI can research and command its transferred divisions normally.
  commandersDay(w);
  const index = Object.keys(w.countries).indexOf(rebels.id);
  w.day = (7 - (index % 7)) % 7;
  aiDay(w);
  assert.ok(rebels.research.length > 0);
  const rebelArmies = w.armies.filter((a) => a.country === rebels.id);
  assert.ok(rebelArmies.length >= 2);
  assert.ok(rebelArmies.every((a) => a.general !== null));
  assert.ok(rebels.generals.every((g) => !g.front));
  for (const c of [w.countries.spain, rebels])
    assert.ok(
      c.generals.every((g) => commanderArmies(w, c.id, g.id).length <= 12),
    );
  assert.ok(validateWorld(w));
});
