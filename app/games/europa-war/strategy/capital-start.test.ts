import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/europe-v3-before-world.json";
import { MAX_ARMIES } from "./campaign-limits";
import { UNITS } from "./catalog";
import { advanceHours } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { createWorld, MAP } from "./world";

test("every 1936 country starts with a funded formation in its own capital", () => {
  const world = createWorld("turkey", "historical", 1936, "hard");
  assert.equal(Object.keys(world.countries).length, 92);
  assert.ok(world.armies.length < MAX_ARMIES);
  for (const country of Object.values(world.countries)) {
    const armies = world.armies.filter((army) => army.country === country.id);
    assert.ok(
      armies.some(
        (army) => army.province === country.capital && army.strength > 0,
      ),
      `${country.id} needs a living capital formation`,
    );
    const deployed = armies.reduce(
      (total, army) => total + (UNITS[army.type].men * army.strength) / 100,
      0,
    );
    assert.ok(
      Math.abs(country.manpower + deployed - country.mobilized) < 1e-7,
      `${country.id} must not receive free deployed manpower`,
    );
    assert.ok(country.manpower >= 0);
    assert.ok(country.equipment.rifle >= 0);
  }
  assert.ok(validateWorld(world));
});

test("microstate guards spend their actual available manpower and proportional rifles", () => {
  const world = createWorld("vatican");
  for (const [id, soldiers] of [
    ["vatican", 15],
    ["andorra", 60],
    ["monaco", 330],
    ["luxembourg", 4500],
    ["iceland", 1800],
  ] as const) {
    const country = world.countries[id];
    const armies = world.armies.filter((army) => army.country === id);
    assert.equal(armies.length, 1, id);
    const guard = armies[0];
    assert.equal(guard.province, country.capital, id);
    assert.equal(guard.type, "infantry");
    assert.ok(Math.abs((guard.strength * 9000) / 100 - soldiers) < 1e-7);
    assert.ok(guard.strength > 0 && guard.strength < 100);
    assert.equal(country.manpower, 0);
    assert.equal(country.equipment.rifle, 240 - soldiers / 100);
    assert.equal(guard.name, `${soldiers} kişilik başkent muhafızı`);
  }
  // Existing fully equipped starting divisions retain their former count and
  // reserve-stock semantics, rather than paying for their equipment a second time.
  const turkey = world.countries.turkey;
  const regulars = world.armies.filter((army) => army.country === turkey.id);
  assert.equal(regulars.length, 2);
  assert.ok(regulars.every((army) => army.strength === 100));
  assert.equal(turkey.manpower, turkey.mobilized - 18_000);
  assert.equal(turkey.equipment.rifle, 240);
});

test("starting deployment follows the designated capital rather than province array order", () => {
  const scenario = MAP.countries.find((country) => country.id === "turkey")!;
  const originalCapital = scenario.capital;
  try {
    scenario.capital = "turkey-1";
    const world = createWorld("turkey");
    const army = world.armies.find((unit) => unit.country === "turkey");
    assert.equal(world.countries.turkey.capital, "turkey-1");
    assert.equal(army?.province, "turkey-1");
  } finally {
    scenario.capital = originalCapital;
  }
});

test("an understrength guard survives peaceful hours and save/load without becoming a free division", () => {
  const start = createWorld("vatican", "historical", 1936, "hard");
  const guardId = start.armies.find((army) => army.country === "vatican")!.id;
  const next = advanceHours(advanceHours(start, 24), 24);
  const guard = next.armies.find((army) => army.id === guardId);
  assert.ok(guard);
  assert.equal(guard.province, next.countries.vatican.capital);
  assert.equal(guard.move, null);
  assert.ok(guard.supply >= 0.25);
  assert.ok(guard.strength > 0 && guard.strength < 1);
  const country = next.countries.vatican;
  assert.ok(
    Math.abs(
      country.manpower + (guard.strength * 9000) / 100 - country.mobilized,
    ) < 1e-7,
  );
  const restored = decodeSave(encodeSave(next));
  assert.deepEqual(
    restored.armies.find((army) => army.id === guardId),
    guard,
  );
  assert.ok(validateWorld(restored));
});

test("loading an existing campaign does not silently replace missing old capital armies", () => {
  assert.equal(
    fixture.world.armies.filter((army) => army.country === "luxembourg").length,
    0,
  );
  const restored = decodeSave(JSON.stringify(fixture));
  assert.equal(
    restored.armies.filter((army) => army.country === "luxembourg").length,
    0,
  );
  assert.equal(
    restored.countries.luxembourg.manpower,
    fixture.world.countries.luxembourg.manpower,
  );
  assert.equal(
    restored.countries.luxembourg.equipment.rifle,
    fixture.world.countries.luxembourg.equipment.rifle,
  );
});
