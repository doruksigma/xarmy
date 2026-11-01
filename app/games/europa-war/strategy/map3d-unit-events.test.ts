import assert from "node:assert/strict";
import { test } from "node:test";
import { declareWar } from "./diplomacy";
import { applyAction } from "./engine";
import { resolveLandDay } from "./land";
import { armyMapPosition } from "./map3d-visuals";
import { detectFormationCaptures, formationCombat } from "./map3d-unit-events";
import { addArmy, createWorld } from "./world";
import type { World } from "./types";

const origin = "germany-7";
const target = "poland-2";
const reserveProvince = "germany-5";

function campaign(count = 1) {
  const world = createWorld("germany", "historical", 1936, "normal");
  declareWar(world, "germany", "poland");
  world.armies = [];
  for (let i = 0; i < count; i++)
    addArmy(world, "germany", origin).organization = 100;
  addArmy(world, "poland", target).organization = 100;
  for (const province of Object.values(world.provinces)) {
    province.buildings.infra = 10;
    province.buildings.rail = 10;
    province.buildings.hub = 5;
  }
  const order = applyAction(world, {
    type: "moveGroup",
    armies: world.armies
      .filter((army) => army.country === "germany")
      .map((army) => army.id),
    to: target,
  });
  assert.equal(order.error, null);
  return order.world;
}

function nextDay(world: World) {
  const next = structuredClone(world);
  next.day++;
  resolveLandDay(next);
  return next;
}

test("A real resolved battle aims both formations at participating enemies", () => {
  const ordered = campaign();
  const orderedAttackers = ordered.armies.filter(
    (army) => army.country === "germany",
  );
  assert.equal(
    formationCombat(ordered, orderedAttackers),
    null,
    "An unexecuted order is not a battle",
  );
  const world = nextDay(ordered);
  const attacker = world.armies.find((army) => army.country === "germany")!;
  const defender = world.armies.find((army) => army.country === "poland")!;
  const attack = formationCombat(world, [attacker]);
  const defense = formationCombat(world, [defender]);
  assert.ok(world.battles.some((battle) => battle.province === target));
  assert.ok(attack && defense);
  assert.equal(attack.province, target);
  assert.equal(attack.battleId, defense.battleId);
  assert.deepEqual(attack.target, armyMapPosition(defender));
  assert.deepEqual(defense.target, armyMapPosition(attacker));
  assert.ok(attacker.strength < 100 && defender.strength < 100);
});

test("Same-country reserves and formations ordered elsewhere do not shoot", () => {
  const world = nextDay(campaign());
  const reserve = addArmy(world, "germany", origin);
  assert.equal(formationCombat(world, [reserve]), null);
  reserve.move = { to: reserveProvince, progress: 0.2, days: 5 };
  assert.equal(formationCombat(world, [reserve]), null);
  reserve.move = { to: "poland-0", progress: 0.2, days: 5 };
  assert.equal(
    formationCombat(world, [reserve]),
    null,
    "A different hostile destination is not this battle",
  );
  const enemyReserve = addArmy(world, "poland", "poland-0");
  assert.equal(formationCombat(world, [enemyReserve]), null);
});

test("A still-airborne paratrooper is not a participant in another division's battle", () => {
  const world = nextDay(campaign());
  const paratrooper = addArmy(world, "germany", reserveProvince, "paratrooper");
  paratrooper.move = { to: target, progress: 0.2, days: 4, kind: "paradrop" };
  assert.equal(formationCombat(world, [paratrooper]), null);
  paratrooper.move.progress = 4;
  assert.ok(
    formationCombat(world, [paratrooper]),
    "Arrived airborne attackers use the engine's contact rule",
  );
});

test("Halted attackers and retreated defenders stop firing despite a stale battle record", () => {
  const world = nextDay(campaign());
  const attacker = world.armies.find((army) => army.country === "germany")!;
  const defender = world.armies.find((army) => army.country === "poland")!;
  const halted = applyAction(world, { type: "halt", army: attacker.id }).world;
  assert.equal(
    formationCombat(halted, [
      halted.armies.find((army) => army.id === attacker.id)!,
    ]),
    null,
  );
  assert.equal(
    formationCombat(halted, [
      halted.armies.find((army) => army.id === defender.id)!,
    ]),
    null,
  );
  defender.province = "poland-0";
  assert.equal(formationCombat(world, [defender]), null);
  assert.equal(formationCombat(world, [attacker]), null);
});

test("Aim positions ignore unrelated hidden enemy reserves", () => {
  const world = nextDay(campaign());
  const attacker = world.armies.find((army) => army.country === "germany")!;
  const before = formationCombat(world, [attacker]);
  const hidden = addArmy(world, "poland", "poland-0");
  world.armies = [
    hidden,
    ...world.armies.filter((army) => army.id !== hidden.id),
  ];
  assert.deepEqual(formationCombat(world, [attacker]), before);
});

test("Withdrawing defenders march without firing but remain legitimate combat targets", () => {
  const world = nextDay(campaign());
  const attacker = world.armies.find((army) => army.country === "germany")!;
  const defender = world.armies.find((army) => army.country === "poland")!;
  defender.route = ["poland-0"];
  assert.ok(
    formationCombat(world, [defender]),
    "A queued order does not stop the stationary defender's firing",
  );
  defender.route = [];
  defender.move = { to: "poland-0", progress: 0.2, days: 5 };
  const snapshot = JSON.stringify(world);
  assert.equal(formationCombat(world, [defender]), null);
  assert.deepEqual(
    formationCombat(world, [attacker])?.target,
    armyMapPosition(defender),
    "The engine still exposes the withdrawing army to enemy fire",
  );
  assert.equal(JSON.stringify(world), snapshot);
});

test("Real engine combat produces one capture containing every arriving survivor", () => {
  let world = campaign(4);
  const initialIds = world.armies
    .filter((army) => army.country === "germany")
    .map((army) => army.id);
  const defender = world.armies.find((army) => army.country === "poland")!;
  defender.organization = 35;
  let captured = false;
  let hadCombat = false;
  for (let day = 0; day < 90; day++) {
    const previous = world;
    world = nextDay(previous);
    hadCombat ||= world.battles.length > 0;
    const captures = detectFormationCaptures(previous, world);
    if (world.provinces[target].controller !== "germany") {
      assert.deepEqual(captures, []);
      continue;
    }
    assert.equal(captures.length, 1);
    assert.equal(captures[0].province, target);
    assert.equal(captures[0].country, "germany");
    const arriving = world.armies.filter(
      (army) => initialIds.includes(army.id) && army.province === target,
    );
    assert.deepEqual(
      captures[0].armyIds.sort(),
      arriving.map((army) => army.id).sort(),
    );
    assert.ok(arriving.length > 1);
    assert.deepEqual(
      detectFormationCaptures(world, nextDay(world)),
      [],
      "Arrival is celebrated only once",
    );
    captured = true;
    break;
  }
  assert.ok(hadCombat && captured);
});

function capturePair() {
  const previous = nextDay(campaign());
  const current = structuredClone(previous);
  current.day++;
  const arriving = current.armies.find((army) => army.country === "germany")!;
  arriving.province = target;
  arriving.move = null;
  current.provinces[target].controller = "germany";
  return { previous, current, arriving };
}

test("A fast tank captures an undefended province on the first queued movement day", () => {
  const original = createWorld("germany");
  declareWar(original, "germany", "poland");
  original.armies = [];
  for (const province of Object.values(original.provinces)) {
    province.buildings.infra = 10;
    province.buildings.rail = 10;
    province.buildings.hub = 5;
  }
  original.countries.germany.stock.fuel = 1000;
  original.countries.germany.tech.push("engines");
  const tank = addArmy(original, "germany", origin, "lightTank");
  tank.organization = 100;
  tank.support = ["recon"];
  const ordered = applyAction(original, {
    type: "move",
    army: tank.id,
    to: target,
  });
  assert.equal(ordered.error, null);
  const previous = ordered.world;
  assert.equal(previous.armies[0].move, null);
  assert.equal(previous.armies[0].route[0], target);
  const current = nextDay(previous);
  assert.equal(current.armies[0].province, target);
  assert.equal(current.provinces[target].controller, "germany");
  const captures = detectFormationCaptures(previous, current);
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0].armyIds, [tank.id]);
  const unrelated = structuredClone(previous);
  unrelated.armies[0].route = [reserveProvince, target];
  assert.deepEqual(detectFormationCaptures(unrelated, current), []);
});

test("Initial, paused, backward, discontinuous and reset snapshots never celebrate", () => {
  const { previous, current } = capturePair();
  assert.equal(detectFormationCaptures(previous, current).length, 1);
  assert.deepEqual(detectFormationCaptures(null, current), []);
  for (const day of [previous.day, previous.day - 1, previous.day + 2])
    assert.deepEqual(
      detectFormationCaptures(previous, { ...current, day }),
      [],
    );
  assert.deepEqual(
    detectFormationCaptures(previous, {
      ...current,
      serial: previous.serial - 1,
    }),
    [],
  );
  assert.deepEqual(
    detectFormationCaptures(previous, { ...current, player: "poland" }),
    [],
  );
  assert.deepEqual(
    detectFormationCaptures(previous, createWorld("germany")),
    [],
  );
});

test("Diplomatic transfers, friendly arrivals and newly deployed units do not celebrate", () => {
  const { previous, current, arriving } = capturePair();
  const annexed = structuredClone(current);
  annexed.armies = structuredClone(previous.armies);
  assert.deepEqual(detectFormationCaptures(previous, annexed), []);
  const friendly = structuredClone(previous);
  friendly.provinces[target].controller = "germany";
  assert.deepEqual(detectFormationCaptures(friendly, current), []);
  const newlyDeployed = structuredClone(current);
  newlyDeployed.armies = [{ ...arriving, id: "newly-deployed" }];
  assert.deepEqual(detectFormationCaptures(previous, newlyDeployed), []);
  const unrelated = structuredClone(previous);
  unrelated.armies.find((army) => army.id === arriving.id)!.move = {
    to: reserveProvince,
    progress: 0,
    days: 3,
  };
  assert.deepEqual(detectFormationCaptures(unrelated, current), []);
});

test("Repeated visual reads do not mutate the world, orders, combat or RNG while paused", () => {
  const { previous, current } = capturePair();
  const before = JSON.stringify({ previous, current });
  const formation = previous.armies.filter(
    (army) => army.country === "germany",
  );
  const initial = formationCombat(previous, formation);
  for (let frame = 0; frame < 30; frame++) {
    assert.deepEqual(formationCombat(previous, formation), initial);
    detectFormationCaptures(previous, current);
    assert.deepEqual(detectFormationCaptures(current, current), []);
  }
  assert.equal(JSON.stringify({ previous, current }), before);
});
