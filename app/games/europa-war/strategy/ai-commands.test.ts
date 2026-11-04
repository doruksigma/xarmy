import assert from "node:assert/strict";
import { test } from "node:test";
import { aiDay } from "./ai";
import { createCommand, executeCommandInPlace } from "./commands";
import { commanderArmies } from "./commanders";
import { declareWar } from "./diplomacy";
import { advanceDay } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { World } from "./types";

function countryTurn(world: World, country: string) {
  // Isolate one country's scheduled decisions while retaining valid geography.
  for (const candidate of Object.values(world.countries))
    if (
      candidate.id !== world.player &&
      candidate.id !== country &&
      candidate.id !== "poland"
    )
      candidate.capitulated = true;
  world.day = (7 - (Object.keys(world.countries).indexOf(country) % 7)) % 7;
}

test("AI research, focus, construction, production and recruitment use country-owned command receipts", () => {
  const world = createWorld("turkey", "historical", 1936);
  countryTurn(world, "germany");
  const originalPlayer = structuredClone(world.countries.turkey);
  aiDay(world);
  const receipts = world.commandState!.receipts.filter(
    (receipt) => receipt.issuerCountryId === "germany",
  );
  for (const type of ["research", "focus", "build", "production", "recruit"])
    assert.ok(
      receipts.some((receipt) => receipt.action.type === type),
      `Missing ${type} receipt`,
    );
  assert.equal(world.player, "turkey");
  assert.deepEqual(world.countries.turkey, originalPlayer);
  assert.ok(validateWorld(world));
});

test("Repeating an actual AI recruitment receipt cannot spend equipment or manpower twice", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  aiDay(world);
  const receipt = world.commandState!.receipts.find(
    (record) =>
      record.issuerCountryId === "germany" && record.action.type === "recruit",
  )!;
  assert.ok(receipt);
  const before = structuredClone(world);
  const result = executeCommandInPlace(
    world,
    {
      commandId: receipt.commandId,
      issuerCountryId: receipt.issuerCountryId,
      issuedTick: receipt.issuedTick,
      action: receipt.action,
    },
    "germany",
  );
  assert.equal(result.status, "duplicate");
  assert.equal(result.world, world);
  assert.deepEqual(world, before);
});

test("AI cannot recruit, change conscription or commission equipment from empty stocks", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  const country = world.countries.germany;
  country.manpower = 0;
  country.political = 0;
  country.treasury = 0;
  for (const id of Object.keys(
    country.equipment,
  ) as (keyof typeof country.equipment)[])
    country.equipment[id] = 0;
  for (const id of Object.keys(country.stock) as (keyof typeof country.stock)[])
    country.stock[id] = 0;
  const conscription = country.conscription;
  aiDay(world);
  const current = world.countries.germany;
  assert.equal(current.recruitment.length, 0);
  assert.equal(current.conscription, conscription);
  assert.equal(current.manpower, 0);
  assert.equal(current.treasury, 0);
  assert.ok(Object.values(current.equipment).every((amount) => amount >= 0));
  assert.ok(Object.values(current.stock).every((amount) => amount >= 0));
  assert.ok(
    !world.commandState!.receipts.some(
      (record) =>
        record.issuerCountryId === "germany" &&
        ["recruit", "conscription", "commission"].includes(record.action.type),
    ),
  );
});

test("AI creates a commander only after the preferred roster fills and assigns only the waiting division", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  const country = world.countries.germany;
  country.generals = country.generals.slice(0, 1);
  country.autoAssignCommanders = false;
  const generalId = country.generals[0].id;
  world.armies = world.armies.filter((army) => army.country !== "germany");
  const ids: string[] = [];
  for (let index = 0; index < 13; index++) {
    const army = addArmy(world, "germany", country.capital);
    army.general = index < 12 ? generalId : null;
    ids.push(army.id);
  }
  aiDay(world);
  const current = world.countries.germany;
  assert.equal(current.autoAssignCommanders, false);
  assert.equal(current.generals.length, 2);
  assert.equal(commanderArmies(world, "germany", generalId).length, 12);
  assert.equal(
    commanderArmies(world, "germany", current.generals[1].id).length,
    1,
  );
  assert.ok(
    world.armies
      .filter((army) => ids.slice(0, 12).includes(army.id))
      .every((army) => army.general === generalId),
  );
  assert.ok(
    world.commandState!.receipts.some(
      (record) => record.action.type === "commanderCreate",
    ),
  );
  assert.ok(
    world.commandState!.receipts.some(
      (record) =>
        record.action.type === "general" && record.action.army === ids[12],
    ),
  );
  assert.ok(validateWorld(world));
});

test("AI tactical retreat is a validated friendly move even with very low organization", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  declareWar(world, "germany", "poland");
  world.armies = [];
  const origin = Object.values(GEOGRAPHY).find(
    (province) =>
      province.country === "germany" &&
      province.neighbors.some(
        (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
      ) &&
      province.neighbors.some(
        (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "germany",
      ),
  )!;
  const army = addArmy(world, "germany", origin.id);
  army.organization = 5;
  army.supply = 1;
  aiDay(world);
  const moved = world.armies.find((candidate) => candidate.id === army.id)!;
  assert.ok(moved.route.length > 0);
  assert.equal(moved.stance, "hold");
  assert.ok(
    moved.route.every((id) => world.provinces[id].controller === "germany"),
  );
  assert.ok(
    world.commandState!.receipts.some(
      (record) =>
        record.action.type === "move" &&
        record.action.army === army.id &&
        record.action.stance === "hold",
    ),
  );
});

test("AI cached roster counts preserve unit preferences and every commander's twelve-division limit", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  const country = world.countries.germany;
  country.autoAssignCommanders = false;
  country.generals = country.generals.slice(0, 2);
  const [infantryGeneral, specialistGeneral] = country.generals.map(
    (general) => general.id,
  );
  world.armies = [];
  const specialistIds = [0, 1].map(
    () => addArmy(world, "germany", country.capital, "artillery").id,
  );
  const infantryIds = Array.from(
    { length: 12 },
    () => addArmy(world, "germany", country.capital).id,
  );
  specialistIds.push(
    ...Array.from(
      { length: 10 },
      () => addArmy(world, "germany", country.capital, "artillery").id,
    ),
  );
  const waitingId = addArmy(world, "germany", country.capital).id;
  aiDay(world);
  const current = world.countries.germany;
  assert.equal(current.generals.length, 3);
  for (const army of world.armies) {
    if (infantryIds.includes(army.id))
      assert.equal(army.general, infantryGeneral);
    if (specialistIds.includes(army.id))
      assert.equal(army.general, specialistGeneral);
    if (army.id === waitingId)
      assert.equal(army.general, current.generals[2].id);
  }
  for (const general of current.generals)
    assert.ok(commanderArmies(world, country.id, general.id).length <= 12);
  assert.ok(validateWorld(world));
});

test("AI command sequences survive save/load and deterministic daily continuation without proxies", () => {
  let first = createWorld("turkey", "alternative", 2026);
  for (let day = 0; day < 8; day++) first = advanceDay(first);
  assert.ok(
    first.commandState && Object.keys(first.commandState.cursors).length > 1,
  );
  let second = decodeSave(encodeSave(first));
  assert.deepEqual(structuredClone(first), first);
  for (let day = 0; day < 7; day++) {
    first = advanceDay(first);
    second = advanceDay(second);
  }
  assert.deepEqual(second, first);
  assert.ok(validateWorld(first));
  assert.deepEqual(decodeSave(encodeSave(first)), first);
  const command = createCommand(
    first,
    { type: "commanderAutoAssign", enabled: false },
    "germany",
  );
  assert.equal(
    command.commandId,
    `germany:${first.commandState!.cursors.germany + 1}`,
  );
});

test("Countries outside their weekly turn issue no commands", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  world.day++;
  const before = structuredClone(world.countries.germany);
  aiDay(world);
  assert.deepEqual(world.countries.germany, before);
  assert.equal(world.commandState?.cursors.germany, undefined);
});

test("A large AI stack receives bounded formation orders per front with independent unit routes", () => {
  const world = createWorld("turkey");
  countryTurn(world, "germany");
  declareWar(world, "germany", "poland");
  world.armies = [];
  const guard = addArmy(world, "germany", world.countries.germany.capital);
  const ids: string[] = [];
  for (let index = 0; index < 128; index++)
    ids.push(addArmy(world, "germany", "germany-0").id);
  aiDay(world);
  const moves = world.commandState!.receipts.filter(
    (receipt) =>
      receipt.issuerCountryId === "germany" &&
      ["move", "moveGroup"].includes(receipt.action.type),
  );
  assert.ok(moves.length > 1 && moves.length < 16);
  assert.ok(moves.every((move) => move.action.type === "moveGroup"));
  const ordered = moves.flatMap((move) =>
    move.action.type === "moveGroup" ? move.action.armies : [],
  );
  assert.deepEqual([...ordered].sort(), [...ids].sort());
  assert.equal(new Set(ordered).size, ids.length);
  assert.deepEqual(world.armies.find((a) => a.id === guard.id)!.route, []);
  const armies = world.armies.filter((army) => ids.includes(army.id));
  assert.ok(armies.every((army) => army.route.length > 0));
  assert.equal(
    new Set(armies.map((army) => army.marchGroup)).size,
    moves.length,
  );
  const cohort = armies.filter((a) => a.marchGroup === armies[0].marchGroup);
  assert.ok(cohort.length > 1);
  assert.notEqual(cohort[0].route, cohort[1].route);
  assert.deepEqual(cohort[0].route, cohort[1].route);
  assert.ok(validateWorld(world));
});

test("An AI declaration of war refreshes threat before deploying the same turn's rear divisions", () => {
  const world = createWorld("turkey", "alternative", 1936);
  countryTurn(world, "germany");
  world.day += 98;
  world.armies = [];
  const guard = addArmy(world, "germany", world.countries.germany.capital);
  for (let index = 0; index < 8; index++)
    addArmy(world, "germany", "germany-0", "heavyTank");
  world.countries.germany.claims.push("poland");
  world.countries.germany.relations.poland = -80;
  world.countries.germany.political = 500;
  aiDay(world);
  assert.ok(world.countries.germany.wars.includes("poland"));
  assert.ok(
    world.commandState!.receipts.some(
      (receipt) =>
        receipt.action.type === "diplomacy" && receipt.action.kind === "war",
    ),
  );
  assert.ok(
    world.armies
      .filter((army) => army.country === "germany" && army.id !== guard.id)
      .every((army) => army.route.length > 0),
  );
  assert.deepEqual(world.armies.find((a) => a.id === guard.id)!.route, []);
  assert.ok(
    world.commandState!.receipts.some(
      (receipt) => receipt.action.type === "moveGroup",
    ),
  );
});
