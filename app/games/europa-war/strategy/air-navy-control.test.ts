import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCommand,
  executeCommand,
  executeCommandInPlace,
} from "./commands";
import {
  activeAutomationCount,
  effectiveAutomationEnabled,
  managementDay,
} from "./management";
import { decodeSave, encodeSave } from "./storage";
import { createWorld } from "./world";
import type { Action, World } from "./types";

function order(world: World, action: Action) {
  const result = executeCommand(
    world,
    createCommand(world, action),
    world.player,
  );
  assert.equal(result.status, "applied", result.message);
  return result.world;
}
function weekly(world: World) {
  world.day = 7;
  const attempts: Action[] = [];
  managementDay(world, (issuer, action) => {
    attempts.push(action);
    return (
      executeCommandInPlace(world, createCommand(world, action, issuer), issuer)
        .status === "applied"
    );
  });
  return attempts;
}

test("New campaigns keep both air and navy decisions manual until separately enabled", () => {
  const world = createWorld("germany");
  assert.equal(
    effectiveAutomationEnabled(world.countries.germany, "air"),
    false,
  );
  assert.equal(
    effectiveAutomationEnabled(world.countries.germany, "navy"),
    false,
  );
  assert.equal(activeAutomationCount(world.countries.germany), 0);
  const air = structuredClone(world.countries.germany.air);
  const navy = structuredClone(world.countries.germany.navy);
  assert.deepEqual(weekly(world), []);
  assert.deepEqual(world.countries.germany.air, air);
  assert.deepEqual(world.countries.germany.navy, navy);
});

for (const area of ["air", "navy"] as const)
  test(`Enabling ${area} cannot change the other force's manual orders or consume its reserves`, () => {
    let world = createWorld("germany");
    const other = area === "air" ? "navy" : "air";
    const model = area === "air" ? "destroyer" : "fighter";
    world.countries.germany.equipment.fighter = 20;
    world.countries.germany.equipment.destroyer = 2;
    const before = structuredClone(world.countries.germany[other]);
    const reserves = world.countries.germany.equipment[model];
    world = order(world, { type: "automation", area, enabled: true });
    assert.equal(
      effectiveAutomationEnabled(world.countries.germany, area),
      true,
    );
    assert.equal(
      effectiveAutomationEnabled(world.countries.germany, other),
      false,
    );
    assert.equal(activeAutomationCount(world.countries.germany), 1);
    assert.deepEqual(world.countries.germany[other], before);
    assert.equal(world.countries.germany.equipment[model], reserves);
    weekly(world);
    assert.deepEqual(world.countries.germany[other], before);
    assert.equal(world.countries.germany.equipment[model], reserves);
    assert.deepEqual(decodeSave(encodeSave(world)), world);
  });

test("Disabling the air assistant preserves later explicit player orders across weekly planning", () => {
  let world = createWorld("germany");
  world = order(world, { type: "automation", area: "air", enabled: true });
  world = order(world, { type: "automation", area: "air", enabled: false });
  const wing = world.countries.germany.air.wings.find(
    (wing) => wing.model === "fighter",
  )!;
  world = order(world, {
    type: "wing",
    id: wing.id,
    target: wing.base,
    mission: "superiority",
  });
  const air = structuredClone(world.countries.germany.air);
  assert.deepEqual(weekly(world), []);
  assert.deepEqual(world.countries.germany.air, air);
});

test("Legacy combined opt-in survives loading and a separate air opt-out leaves navy enabled", () => {
  let world = createWorld("germany");
  delete world.countries.germany.automation.air;
  delete world.countries.germany.automation.navy;
  world.countries.germany.automation.operations = true;
  world = decodeSave(encodeSave(world));
  assert.equal(
    effectiveAutomationEnabled(world.countries.germany, "air"),
    true,
  );
  assert.equal(
    effectiveAutomationEnabled(world.countries.germany, "navy"),
    true,
  );
  assert.equal(activeAutomationCount(world.countries.germany), 2);
  world = order(world, { type: "automation", area: "air", enabled: false });
  const air = structuredClone(world.countries.germany.air);
  const attempts = weekly(world);
  assert.equal(
    effectiveAutomationEnabled(world.countries.germany, "air"),
    false,
  );
  assert.equal(
    effectiveAutomationEnabled(world.countries.germany, "navy"),
    true,
  );
  assert.ok(
    !attempts.some((action) =>
      ["air", "wing", "createWing"].includes(action.type),
    ),
  );
  assert.deepEqual(world.countries.germany.air, air);
  assert.equal(activeAutomationCount(world.countries.germany), 1);
});

test("One-time force planning never opts the player into future automatic decisions", () => {
  let world = createWorld("germany");
  world = order(world, { type: "autoPlan", area: "air" });
  assert.equal(activeAutomationCount(world.countries.germany), 0);
  assert.deepEqual(weekly(world), []);
});

test("Legacy combined automation commands explicitly update both force preferences", () => {
  let world = createWorld("germany");
  world = order(world, {
    type: "automation",
    area: "operations",
    enabled: true,
  });
  assert.equal(activeAutomationCount(world.countries.germany), 2);
  world = order(world, {
    type: "automation",
    area: "operations",
    enabled: false,
  });
  assert.equal(activeAutomationCount(world.countries.germany), 0);
  assert.deepEqual(weekly(world), []);
});
