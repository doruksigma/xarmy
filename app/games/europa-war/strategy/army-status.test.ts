import { test } from "node:test";
import assert from "node:assert/strict";
import { armyMovementWarnings, armyStatus } from "./army-status";
import { applyAction } from "./engine";
import { declareWar } from "./diplomacy";
import { resolveLandDay } from "./land";
import { addArmy, createWorld } from "./world";

function battle() {
  const w = createWorld("germany");
  declareWar(w, "germany", "poland");
  w.armies = [];
  const attacker = addArmy(w, "germany", "germany-7");
  const defender = addArmy(w, "poland", "poland-2");
  attacker.organization = defender.organization = 100;
  return { w, attacker, defender };
}

test("Gerçek saldırı emri sırada, çatışmada ve iptal edildiğinde farklı durum gösterir", () => {
  const { w, attacker, defender } = battle();
  const ordered = applyAction(w, {
    type: "move",
    army: attacker.id,
    to: defender.province,
  });
  assert.equal(ordered.error, null);
  const moving = ordered.world.armies.find((a) => a.id === attacker.id)!;
  assert.equal(armyStatus(ordered.world, moving).label, "Emir bekliyor");
  resolveLandDay(ordered.world);
  assert.equal(armyStatus(ordered.world, moving).label, "Çatışıyor");
  assert.equal(
    armyStatus(
      ordered.world,
      ordered.world.armies.find((a) => a.id === defender.id)!,
    ).label,
    "Savunuyor",
  );
  const stopped = applyAction(ordered.world, { type: "halt", army: moving.id });
  assert.equal(stopped.error, null);
  assert.equal(
    armyStatus(
      stopped.world,
      stopped.world.armies.find((a) => a.id === moving.id)!,
    ).label,
    "Hazır",
  );
});

test("Hazırlık, planı başlatma, toparlanma ve hedef kaybı emir bekleme sebebini gösterir", () => {
  const { w, attacker, defender } = battle();
  const ordered = applyAction(w, {
    type: "offensive",
    armies: [attacker.id],
    objectives: [defender.province],
    stance: "careful",
  });
  assert.equal(ordered.error, null);
  const current = ordered.world;
  const army = current.armies.find((a) => a.id === attacker.id)!;
  assert.equal(armyStatus(current, army).label, "Hazırlanıyor");
  current.plans[0].preparation = 40;
  assert.equal(armyStatus(current, army).label, "Plan hazır");
  const active = applyAction(current, {
    type: "plan",
    id: current.plans[0].id,
    kind: "start",
  }).world;
  const unit = active.armies.find((a) => a.id === army.id)!;
  assert.equal(armyStatus(active, unit).label, "Plan bekliyor");
  unit.organization = 20;
  assert.equal(armyStatus(active, unit).label, "Toparlanıyor");
  active.provinces[defender.province].controller = "germany";
  assert.equal(armyStatus(active, unit).label, "Hedef kalmadı");
});

test("Yürüyen yakıtsız ve ikmalsiz tank için iki gerçek yavaşlama nedeni birlikte gösterilir", () => {
  const { w, attacker, defender } = battle();
  attacker.type = "lightTank";
  attacker.move = { to: defender.province, progress: 0.1, days: 5 };
  attacker.supply = 0.1;
  w.countries.germany.stock.fuel = 0;
  assert.equal(armyStatus(w, attacker).label, "İlerliyor");
  assert.equal(armyMovementWarnings(w, attacker).length, 2);
  attacker.supply = 0.8;
  w.countries.germany.stock.fuel = 100;
  assert.deepEqual(armyMovementWarnings(w, attacker), []);
});
