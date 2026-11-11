import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction, advanceHour } from "./engine";
import { commanderArmies } from "./commanders";
import { createCommand, executeCommand } from "./commands";
import { isValidAction } from "./command-types";
import { declareWar } from "./diplomacy";
import { resolveLandDay } from "./land";
import { planningStep } from "./planning";
import { decodeSave, encodeSave } from "./storage";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { Action, World } from "./types";

function fixture(count = 13, origin = "germany-0") {
  const world = createWorld("germany");
  world.armies = [];
  world.countries.germany.autoAssignCommanders = true;
  for (let index = 0; index < count; index++) {
    const army = addArmy(world, "germany", origin);
    army.organization = 100;
    army.supply = 1;
  }
  const general =
    world.armies[0]?.general ?? world.countries.germany.generals[0].id;
  const target = GEOGRAPHY[origin].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === "germany",
  )!.id;
  return { world, general, origin, target };
}

function apply(world: World, action: Action) {
  const result = applyAction(world, action);
  assert.equal(result.error, null);
  return result.world;
}

test("Komutan hareketi canlı 12 üyeyi çözer, diğer komutanı korur ve tüm üyeler hedefe yürür", () => {
  const { world, general, target } = fixture(11);
  const command = createCommand(world, {
    type: "commanderOrder",
    general,
    kind: "move",
    provinces: [target],
  });
  const twelfth = addArmy(world, "germany", world.countries.germany.capital);
  const other = addArmy(world, "germany", world.countries.germany.capital);
  assert.equal(twelfth.general, general);
  assert.notEqual(other.general, general);
  const beforeOther = structuredClone(other);
  const result = executeCommand(world, command, world.player);
  assert.equal(result.status, "applied");
  const members = commanderArmies(result.world, "germany", general);
  assert.equal(members.length, 12);
  assert.ok(members.every((army) => army.route.at(-1) === target));
  assert.equal(new Set(members.map((army) => army.marchGroup)).size, 1);
  assert.ok(members[0].marchGroup);
  assert.notEqual(members[0].route, members[1].route);
  assert.deepEqual(
    result.world.armies.find((army) => army.id === other.id),
    beforeOther,
  );
  assert.match(result.world.commandState!.receipts[0].summary, /12 tümen/);
  const saved = decodeSave(encodeSave(result.world));
  for (let day = 0; day < 90; day++) {
    if (
      commanderArmies(saved, "germany", general).every(
        (army) => army.province === target,
      )
    )
      break;
    saved.day++;
    resolveLandDay(saved);
  }
  assert.equal(commanderArmies(saved, "germany", general).length, 12);
  assert.ok(
    commanderArmies(saved, "germany", general).every(
      (army) => army.province === target,
    ),
  );
});

test("Komutanın çizilmiş rotası bütün aşamaları içerir ve sınır otomasyonunu üyeleri ayırmadan değiştirir", () => {
  const { world: source, general, origin, target } = fixture();
  const deployed = apply(source, {
    type: "commanderDeploy",
    general,
    target: "poland",
  });
  assert.ok(
    deployed.countries.germany.generals.find((g) => g.id === general)!.front,
  );
  const destination = GEOGRAPHY[target].neighbors.find(
    (edge) =>
      !edge.sea &&
      edge.id !== origin &&
      deployed.provinces[edge.id].controller === "germany",
  )!.id;
  const world = apply(deployed, {
    type: "commanderOrder",
    general,
    kind: "move",
    provinces: [target, destination],
  });
  assert.equal(
    world.countries.germany.generals.find((g) => g.id === general)!.front,
    undefined,
  );
  const members = commanderArmies(world, "germany", general);
  assert.equal(members.length, 12);
  assert.ok(
    members.every(
      (army) =>
        army.route.includes(target) && army.route.at(-1) === destination,
    ),
  );
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Son hedef veya tek üye erişemiyorsa komutan emrinin tamamı atomik geri alınır", () => {
  const { world, general, target } = fixture();
  const deployed = apply(world, {
    type: "commanderDeploy",
    general,
    target: "poland",
  });
  for (const provinces of [
    [target, "japan-0"],
    [target, "unknown-province"],
  ]) {
    const before = structuredClone(deployed);
    const result = applyAction(deployed, {
      type: "commanderOrder",
      general,
      kind: "move",
      provinces,
    });
    assert.ok(result.error);
    assert.equal(result.world, deployed);
    assert.deepEqual(result.world, before);
  }
  const member = commanderArmies(deployed, "germany", general).at(-1)!;
  member.organization = 1;
  member.supply = 1;
  const before = structuredClone(deployed);
  const rejected = applyAction(deployed, {
    type: "commanderOrder",
    general,
    kind: "move",
    provinces: [target],
  });
  assert.match(rejected.error!, /organizasyon/);
  assert.deepEqual(rejected.world, before);
});

test("Çizilmiş savunma hattı 12 üyeyi eşit dağıtır, komutanı korur ve diğer orduyu hareket ettirmez", () => {
  const { world: source, general, origin, target } = fixture();
  const other = structuredClone(source.armies.at(-1)!);
  let world = apply(source, {
    type: "commanderOrder",
    general,
    kind: "front",
    provinces: [origin, target],
  });
  assert.equal(world.fronts.length, 1);
  assert.equal(world.fronts[0].armies.length, 12);
  assert.equal(commanderArmies(world, "germany", general).length, 12);
  world = advanceHour(world);
  const members = commanderArmies(world, "germany", general);
  assert.equal(
    members.filter(
      (army) => army.move?.to === target || army.route.at(-1) === target,
    ).length,
    6,
  );
  assert.equal(
    members.filter(
      (army) => army.province === origin && !army.move && !army.route.length,
    ).length,
    6,
  );
  const untouched = world.armies.find((army) => army.id === other.id)!;
  assert.equal(untouched.province, other.province);
  assert.equal(untouched.move, null);
  assert.deepEqual(untouched.route, []);
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("12 tümenli taarruz hazırlanır, birlikte saldırır ve hedef şehri gerçekten ele geçirir", () => {
  const { world: source, general } = fixture(13, "germany-7");
  declareWar(source, "germany", "poland");
  const defender = addArmy(source, "poland", "poland-2");
  defender.strength = 15;
  defender.organization = 20;
  let world = apply(source, {
    type: "commanderOrder",
    general,
    kind: "offensive",
    provinces: ["poland-2"],
    stance: "aggressive",
  });
  assert.equal(world.plans.length, 1);
  assert.equal(world.plans[0].armies.length, 12);
  assert.equal(world.plans[0].active, false);
  assert.equal(world.plans[0].stance, "aggressive");
  assert.equal(commanderArmies(world, "germany", general).length, 12);
  assert.ok(
    applyAction(world, { type: "plan", id: world.plans[0].id, kind: "start" })
      .error,
  );
  for (let day = 0; day < 20; day++) planningStep(world, 1);
  assert.ok(world.plans[0].preparation >= 30);
  world = apply(world, { type: "plan", id: world.plans[0].id, kind: "start" });
  planningStep(world, 1 / 24);
  assert.ok(
    commanderArmies(world, "germany", general).every(
      (army) => army.route[0] === "poland-2",
    ),
  );
  const otherId = source.armies[12].id;
  for (
    let day = 0;
    day < 90 && world.provinces["poland-2"].controller !== "germany";
    day++
  ) {
    world.day++;
    planningStep(world, 1);
    resolveLandDay(world);
  }
  assert.equal(world.provinces["poland-2"].controller, "germany");
  assert.equal(
    world.armies.find((army) => army.id === otherId)!.province,
    "germany-7",
  );
  assert.equal(world.armies.find((army) => army.id === otherId)!.move, null);
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Dur emri yalnız seçilen komutanın yürüyüşlerini ve plan üyeliğini kaldırır", () => {
  const { world: source, general, target, origin } = fixture(24);
  const otherGeneral = source.armies[12].general!;
  let world = apply(source, {
    type: "commanderOrder",
    general: otherGeneral,
    kind: "front",
    provinces: [origin, target],
  });
  const otherFront = structuredClone(world.fronts[0]);
  world = apply(world, {
    type: "commanderOrder",
    general,
    kind: "move",
    provinces: [target],
  });
  const stopped = apply(world, {
    type: "commanderOrder",
    general,
    kind: "halt",
    provinces: [],
  });
  assert.ok(
    commanderArmies(stopped, "germany", general).every(
      (army) =>
        army.move === null && army.route.length === 0 && army.stance === "hold",
    ),
  );
  assert.equal(commanderArmies(stopped, "germany", general).length, 12);
  assert.deepEqual(stopped.fronts, [otherFront]);
  assert.deepEqual(decodeSave(encodeSave(stopped)), stopped);
});

test("Tek tümeni elle yönlendirmek diğer 11 tümenin operasyonunu bozmaz", () => {
  const { world: source, general, origin, target } = fixture();
  let world = apply(source, {
    type: "commanderOrder",
    general,
    kind: "front",
    provinces: [origin, target],
  });
  const selected = commanderArmies(world, "germany", general)[0];
  const beforeOthers = structuredClone(
    world.armies.filter((army) => army.id !== selected.id),
  );
  world = apply(world, { type: "move", army: selected.id, to: target });
  assert.equal(world.fronts[0].armies.length, 11);
  assert.ok(!world.fronts[0].armies.includes(selected.id));
  assert.deepEqual(
    world.armies.filter((army) => army.id !== selected.id),
    beforeOthers,
  );
  assert.equal(
    world.armies.find((army) => army.id === selected.id)!.route.at(-1),
    target,
  );
});

test("Boş, yabancı ve 12 üzeri komutan kadrosu; uygunsuz hedefler ve bozuk protokol reddedilir", () => {
  const { world, general, target } = fixture();
  const foreignGeneral = world.countries.poland.generals[0].id;
  const valid = {
    type: "commanderOrder",
    general,
    kind: "move",
    provinces: [target],
  } as const;
  for (const value of [
    { ...valid, general: foreignGeneral },
    { ...valid, general: "missing-general" },
    { ...valid, provinces: [] },
    { ...valid, provinces: [target, target] },
    { ...valid, kind: "halt" },
    { ...valid, kind: "front", provinces: [target] },
    { ...valid, kind: "offensive", provinces: [target] },
    { ...valid, armies: [world.armies[0].id] },
    { ...valid, stance: "aggressive" },
  ]) {
    const result = executeCommand(
      world,
      createCommand(world, value as Action),
      world.player,
    );
    assert.equal(result.status, "rejected");
    assert.equal(result.world, world);
  }
  assert.equal(
    isValidAction({ ...valid, kind: "offensive", stance: "balanced" }),
    true,
  );
  assert.equal(
    isValidAction({ ...valid, kind: "offensive", stance: "unknown" }),
    false,
  );
  world.armies[12].general = general;
  const overCapacity = applyAction(world, { ...valid, provinces: [target] });
  assert.match(overCapacity.error!, /12/);
  const empty = fixture(0);
  assert.match(
    applyAction(empty.world, {
      type: "commanderOrder",
      general: empty.general,
      kind: "halt",
      provinces: [],
    }).error!,
    /tümen ata/,
  );
});

test("Komutan operasyon makbuzu kayıttan sonra tekrar uygulanmaz ve yetkisiz ülke emri reddedilir", () => {
  const { world, general, origin, target } = fixture();
  const command = createCommand(world, {
    type: "commanderOrder",
    general,
    kind: "front",
    provinces: [origin, target],
  });
  const rejected = executeCommand(world, command, "poland");
  assert.equal(rejected.code, "UNAUTHORIZED");
  const first = executeCommand(world, command, "germany");
  assert.equal(first.status, "applied");
  const loaded = decodeSave(encodeSave(first.world));
  const repeated = executeCommand(loaded, command, "germany");
  assert.equal(repeated.status, "duplicate");
  assert.equal(repeated.world, loaded);
  assert.equal(loaded.fronts.length, 1);
  assert.equal(loaded.fronts[0].armies.length, 12);
});
