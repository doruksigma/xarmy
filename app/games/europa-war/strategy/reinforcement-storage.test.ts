import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceHour, advanceHours } from "./engine";
import { reserveReinforcements } from "./reinforcements";
import { acceptStateTransfer, createStateTransfer } from "./simulation-state";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { fingerprintWorld } from "./world-digest";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { World } from "./types";

function campaign() {
  const world = createWorld("germany", "historical", 1936, "hard");
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.autoAssignCommanders = false;
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
      air: false,
      navy: false,
    };
  }
  const country = world.countries.germany;
  const neighbor = GEOGRAPHY[country.capital].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === country.id,
  )!;
  assert.ok(neighbor);
  const army = addArmy(world, country.id, neighbor.id);
  army.strength = 60;
  army.supply = 1;
  country.manpower = 10000;
  country.equipment.rifle = 1000;
  return world;
}
function fixture() {
  const world = campaign();
  reserveReinforcements(world, new Set(world.armies.map((army) => army.id)));
  assert.equal(world.reinforcements?.shipments.length, 1);
  assert.ok(
    validateWorld(world),
    "the real reservation must form a valid save",
  );
  return world;
}

test("legacy saves without reinforcement shipments retain their exact shape and no invented cargo", () => {
  const world = createWorld("turkey");
  assert.equal(Object.hasOwn(world, "reinforcements"), false);
  const restored = decodeSave(encodeSave(world));
  assert.equal(Object.hasOwn(restored, "reinforcements"), false);
  assert.deepEqual(restored, world);
});

test("paid reinforcement cargo and partial route progress survive a save and continue identically", () => {
  const initial = fixture();
  const world = advanceHours(initial, 2);
  assert.equal(world.reinforcements?.shipments.length, 1);
  assert.ok(world.reinforcements!.shipments[0].leg);
  assert.ok(validateWorld(world));
  const restored = decodeSave(encodeSave(world));
  assert.deepEqual(restored, world);
  assert.equal(fingerprintWorld(restored), fingerprintWorld(world));
  assert.deepEqual(advanceHours(restored, 24), advanceHours(world, 24));
});

test("worker deltas introduce the paid shipment state and carry later cargo progress without duplication", () => {
  const before = campaign();
  before.hour = 23;
  const after = advanceHour(before);
  assert.ok(after.reinforcements?.shipments.length);
  const transfer = createStateTransfer(before, after);
  const accepted = acceptStateTransfer(before, transfer.state, 23, 24);
  assert.deepEqual(accepted, after);
  assert.ok(validateWorld(accepted));
  const next = advanceHour(after);
  const following = createStateTransfer(after, next);
  assert.deepEqual(
    acceptStateTransfer(accepted, following.state, 24, 25),
    next,
  );
  assert.deepEqual(advanceHours(accepted, 8), advanceHours(after, 8));
});

test("a pending shipment may outlive its target or its old access rights until the next settlement", () => {
  const original = fixture();
  for (const change of [
    (world: World) => {
      world.armies = [];
    },
    (world: World) => {
      world.armies[0].country = "france";
      world.armies[0].general = null;
    },
    (world: World) => {
      world.armies[0].support = ["artillery"];
    },
    (world: World) => {
      const shipment = world.reinforcements!.shipments[0];
      world.provinces[shipment.province].controller = "poland";
    },
    (world: World) => {
      world.reinforcements!.shipments[0].blocked = "supply";
    },
  ]) {
    const world = structuredClone(original);
    change(world);
    assert.ok(validateWorld(world));
    assert.deepEqual(decodeSave(encodeSave(world)), world);
    assert.ok(validateWorld(advanceHour(world)));
  }
});

test("malformed shipment identity, geography, composition, timestamps and cargo are rejected without repair", () => {
  const original = fixture();
  const corruptions: ((world: World) => void)[] = [
    (world) => {
      world.reinforcements!.shipments.push(
        structuredClone(world.reinforcements!.shipments[0]),
      );
    },
    (world) => {
      const second = structuredClone(world.reinforcements!.shipments[0]);
      second.id = "reinforcement-duplicate-target";
      world.reinforcements!.shipments.push(second);
    },
    (world) => {
      world.reinforcements!.shipments[0].id = "__proto__";
    },
    (world) => {
      world.reinforcements!.shipments[0].country = "unknown";
    },
    (world) => {
      world.reinforcements!.shipments[0].origin = "unknown";
    },
    (world) => {
      world.reinforcements!.shipments[0].destination = "unknown";
    },
    (world) => {
      const shipment = world.reinforcements!.shipments[0];
      shipment.route = [shipment.province];
    },
    (world) => {
      const shipment = world.reinforcements!.shipments[0];
      shipment.destination = world.countries.japan.capital;
      shipment.route = [shipment.destination];
    },
    (world) => {
      world.reinforcements!.shipments[0].createdHour = 24;
    },
    (world) => {
      world.reinforcements!.shipments[0].createdHour = 0.5;
    },
    (world) => {
      world.reinforcements!.lastDispatchHour = 24;
    },
    (world) => {
      world.reinforcements!.lastDispatchHour = 1;
    },
    (world) => {
      world.reinforcements!.shipments[0].cargo.manpower = -1;
    },
    (world) => {
      world.reinforcements!.shipments[0].cargo.manpower = 0;
    },
    (world) => {
      world.reinforcements!.shipments[0].cargo.equipment.rifle = NaN;
    },
    (world) => {
      world.reinforcements!.shipments[0].cargo.equipment.rifle = Infinity;
    },
    (world) => {
      world.reinforcements!.shipments[0].cargo.equipment.rifle! += 1;
    },
    (world) => {
      world.reinforcements!.shipments[0].cargo.equipment.truck = 0.1;
    },
    (world) => {
      Reflect.deleteProperty(
        world.reinforcements!.shipments[0].cargo.equipment,
        "rifle",
      );
    },
    (world) => {
      Object.assign(world.reinforcements!.shipments[0].cargo.equipment, {
        unknown: 1,
      });
    },
    (world) => {
      world.reinforcements!.shipments[0].unit = "artillery";
    },
    (world) => {
      world.reinforcements!.shipments[0].support = ["engineers", "engineers"];
    },
    (world) => {
      world.reinforcements!.shipments[0].support = ["logistics", "artillery"];
    },
    (world) => {
      world.reinforcements!.shipments[0].loadingHours = 1.1;
    },
    (world) => {
      Object.assign(world.reinforcements!.shipments[0], { extra: true });
    },
    (world) => {
      Object.assign(world.reinforcements!, { extra: true });
    },
    (world) => {
      Object.assign(world.reinforcements!.shipments[0], { blocked: "unknown" });
    },
  ];
  for (const corrupt of corruptions) {
    const world = structuredClone(original);
    corrupt(world);
    const snapshot = structuredClone(world);
    assert.equal(validateWorld(world), false);
    assert.throws(() => decodeSave(encodeSave(world)));
    assert.deepEqual(world, snapshot);
  }
  assert.ok(validateWorld(original));
});

test("shipment legs reject completed, negative, mismatched and non-finite progress", () => {
  const original = fixture();
  const shipment = original.reinforcements!.shipments[0];
  shipment.loadingHours = 0;
  shipment.leg = { to: shipment.route[0], hours: 5, progress: 2 };
  assert.ok(validateWorld(original));
  for (const corrupt of [
    (world: World) => {
      world.reinforcements!.shipments[0].leg!.progress = 5;
    },
    (world: World) => {
      world.reinforcements!.shipments[0].leg!.progress = -1;
    },
    (world: World) => {
      world.reinforcements!.shipments[0].leg!.hours = 0;
    },
    (world: World) => {
      world.reinforcements!.shipments[0].leg!.hours = Infinity;
    },
    (world: World) => {
      world.reinforcements!.shipments[0].leg!.to = shipment.province;
    },
    (world: World) => {
      world.reinforcements!.shipments[0].loadingHours = 0.5;
    },
  ]) {
    const world = structuredClone(original);
    corrupt(world);
    assert.equal(validateWorld(world), false);
    assert.throws(() => decodeSave(encodeSave(world)));
  }
});

test("a freight save cannot claim a false land connection across the Marmara Sea", () => {
  const world = fixture();
  const shipment = world.reinforcements!.shipments[0];
  shipment.province = "turkey-1";
  shipment.destination = "turkey-3";
  shipment.route = ["turkey-3"];
  shipment.loadingHours = 0;
  shipment.leg = { to: "turkey-3", hours: 5, progress: 1 };
  assert.equal(validateWorld(world), false);
  assert.throws(() => decodeSave(encodeSave(world)));
});

test("shipment accounting rejects an unpaid cargo or inconsistent delivered, returned and lost totals", () => {
  const original = fixture();
  for (const corrupt of [
    (world: World) => {
      delete world.reinforcements!.ledger.germany;
    },
    (world: World) => {
      world.reinforcements!.ledger.unknown = structuredClone(
        world.reinforcements!.ledger.germany,
      );
    },
    (world: World) => {
      world.reinforcements!.ledger.germany.dispatched.manpower += 1;
    },
    (world: World) => {
      world.reinforcements!.ledger.germany.delivered.manpower += 1;
    },
    (world: World) => {
      world.reinforcements!.ledger.germany.returned.equipment.rifle = 1;
    },
    (world: World) => {
      world.reinforcements!.ledger.germany.lost.equipment.truck = 1;
    },
    (world: World) => {
      world.reinforcements!.shipments = [];
    },
    (world: World) => {
      const cargo = world.reinforcements!.shipments[0].cargo;
      cargo.manpower *= 2;
      cargo.equipment.rifle! *= 2;
      world.reinforcements!.ledger.germany.dispatched = structuredClone(cargo);
    },
  ]) {
    const world = structuredClone(original);
    corrupt(world);
    assert.equal(validateWorld(world), false);
    assert.throws(() => decodeSave(encodeSave(world)));
  }
});
