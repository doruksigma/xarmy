import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction, createWorld } from "./engine";
import { economyDay } from "./economy";
import { EQUIPMENT, TECHNOLOGIES, UNITS } from "./catalog";
import {
  canRecruitAt,
  recruitmentLocations,
  resolveRecruitmentProvince,
} from "./recruitment-location";
import { decodeSave, encodeSave } from "./storage";
import type { Equipment, UnitType } from "./types";

test("initial recruitment city is the capital, an explicit city survives unrelated map choices", () => {
  const world = createWorld("turkey");
  const initial = structuredClone(world);
  const capital = world.countries.turkey.capital;
  assert.equal(resolveRecruitmentProvince(world, null), capital);
  const other = recruitmentLocations(world).find((item) => !item.capital)!;
  assert.ok(other);
  assert.equal(resolveRecruitmentProvince(world, other.id), other.id);
  assert.equal(recruitmentLocations(world)[0].id, capital);
  assert.deepEqual(
    world,
    initial,
    "Looking at recruitment options must not mutate the campaign",
  );
});

test("every country with its own controlled capital defaults to that capital", () => {
  const world = createWorld("turkey");
  for (const country of Object.values(world.countries)) {
    if (!canRecruitAt(world, country.id, country.capital)) continue;
    assert.equal(
      resolveRecruitmentProvince(world, null, country.id),
      country.capital,
      country.name,
    );
    assert.equal(
      recruitmentLocations(world, country.id)[0].id,
      country.capital,
      country.name,
    );
  }
});

test("occupied, foreign, unknown and captured cities cannot become new training destinations", () => {
  const world = createWorld("turkey");
  const capital = world.countries.turkey.capital;
  const selected = recruitmentLocations(world).find(
    (item) => !item.capital,
  )!.id;
  world.provinces[selected].controller = "germany";
  assert.equal(resolveRecruitmentProvince(world, selected), capital);
  assert.equal(resolveRecruitmentProvince(world, "missing-province"), capital);
  const foreign = world.countries.germany.capital;
  world.provinces[foreign].controller = "turkey";
  assert.equal(
    canRecruitAt(world, "turkey", foreign),
    false,
    "Occupied foreign territory is not owned home territory",
  );
  assert.equal(resolveRecruitmentProvince(world, foreign), capital);
  assert.equal(
    recruitmentLocations(world).some(
      (item) => item.id === foreign || item.id === selected,
    ),
    false,
  );
  world.provinces[capital].controller = "germany";
  const fallback = resolveRecruitmentProvince(world, selected);
  assert.ok(fallback);
  assert.ok(canRecruitAt(world, "turkey", fallback));
  const reversed = structuredClone(world);
  reversed.provinces = Object.fromEntries(
    Object.entries(reversed.provinces).reverse(),
  );
  assert.equal(
    resolveRecruitmentProvince(reversed, selected),
    fallback,
    "Emergency fallback must not depend on object insertion order",
  );
  for (const province of Object.values(world.provinces))
    if (province.controller === "turkey") province.controller = "germany";
  assert.equal(resolveRecruitmentProvince(world, selected), null);
  assert.deepEqual(recruitmentLocations(world), []);
});

test("changing the preferred destination never rewrites existing queues; real completed troops appear in both chosen cities", () => {
  let world = createWorld("turkey");
  const capital = world.countries.turkey.capital;
  const secondCity = recruitmentLocations(world).find(
    (item) => !item.capital,
  )!.id;
  world.countries.turkey.equipment.rifle = 1000;
  const manpower = world.countries.turkey.manpower;
  const originalIds = new Set(world.armies.map((army) => army.id));
  const first = applyAction(world, {
    type: "recruit",
    unit: "infantry",
    province: resolveRecruitmentProvince(world, null)!,
  });
  assert.equal(first.error, null);
  world = first.world;
  const second = applyAction(world, {
    type: "recruit",
    unit: "infantry",
    province: resolveRecruitmentProvince(world, secondCity)!,
  });
  assert.equal(second.error, null);
  world = second.world;
  assert.deepEqual(
    world.countries.turkey.recruitment.map((item) => item.province),
    [capital, secondCity],
  );
  assert.equal(
    world.countries.turkey.manpower,
    manpower - 2 * UNITS.infantry.men,
  );
  assert.equal(
    world.countries.turkey.equipment.rifle,
    1000 - 2 * UNITS.infantry.equipment.rifle!,
  );
  world = decodeSave(encodeSave(world));
  for (let day = 0; day < UNITS.infantry.days; day++) economyDay(world);
  assert.equal(world.countries.turkey.recruitment.length, 0);
  const deployed = world.armies.filter(
    (army) => army.country === "turkey" && !originalIds.has(army.id),
  );
  assert.equal(deployed.length, 2);
  assert.deepEqual(
    deployed.map((army) => army.province).sort(),
    [capital, secondCity].sort(),
  );
  assert.ok(deployed.every((army) => army.type === "infantry"));
});

test("captured queued training stays at its original city and resumes only after control returns", () => {
  let world = createWorld("turkey");
  const capital = world.countries.turkey.capital;
  const result = applyAction(world, {
    type: "recruit",
    unit: "infantry",
    province: capital,
  });
  assert.equal(result.error, null);
  world = result.world;
  world.provinces[capital].controller = "germany";
  const fallback = resolveRecruitmentProvince(world, capital);
  assert.notEqual(fallback, capital);
  economyDay(world);
  assert.equal(world.countries.turkey.recruitment[0].progress, 0);
  assert.equal(world.countries.turkey.recruitment[0].province, capital);
  world.provinces[capital].controller = "turkey";
  economyDay(world);
  assert.equal(world.countries.turkey.recruitment[0].progress, 1);
});

test("every displayed troop type charges its own real training costs and keeps its type", () => {
  for (const type of Object.keys(UNITS) as UnitType[]) {
    const world = createWorld("turkey");
    const country = world.countries.turkey;
    country.tech = TECHNOLOGIES.map((technology) => technology.id);
    country.manpower = 100000;
    for (const equipment of Object.keys(EQUIPMENT) as Equipment[])
      country.equipment[equipment] = 1000;
    const before = structuredClone(country.equipment);
    const result = applyAction(world, {
      type: "recruit",
      unit: type,
      province: resolveRecruitmentProvince(world, null)!,
    });
    assert.equal(result.error, null, type);
    const trained = result.world.countries.turkey;
    assert.equal(trained.recruitment[0].type, type);
    assert.equal(trained.recruitment[0].total, UNITS[type].days);
    assert.equal(trained.manpower, 100000 - UNITS[type].men);
    for (const equipment of Object.keys(EQUIPMENT) as Equipment[])
      assert.equal(
        trained.equipment[equipment],
        before[equipment] - (UNITS[type].equipment[equipment] ?? 0),
        `${type}/${equipment}`,
      );
    trained.recruitment[0].progress = trained.recruitment[0].total - 1;
    const ids = new Set(result.world.armies.map((army) => army.id));
    economyDay(result.world);
    const spawned = result.world.armies.find(
      (army) => army.country === "turkey" && !ids.has(army.id),
    );
    assert.ok(spawned, type);
    assert.equal(spawned.type, type);
    assert.equal(spawned.province, country.capital);
  }
  assert.ok(UNITS.heavyTank.attack > UNITS.mediumTank.attack);
  assert.ok(UNITS.heavyTank.speed < UNITS.lightTank.speed);
  assert.ok(UNITS.motorized.speed > UNITS.infantry.speed);
  assert.ok(UNITS.artillery.attack > UNITS.infantry.attack);
  assert.equal(UNITS.infantry.fuel, 0);
});

test("the actual recruit command rechecks lost control, technology, resources and queue capacity", () => {
  const world = createWorld("turkey");
  const capital = world.countries.turkey.capital;
  assert.match(
    applyAction(world, {
      type: "recruit",
      unit: "heavyTank",
      province: capital,
    }).error!,
    /teknolojisini/,
  );
  const depleted = structuredClone(world);
  depleted.countries.turkey.equipment.rifle = 0;
  assert.match(
    applyAction(depleted, {
      type: "recruit",
      unit: "infantry",
      province: capital,
    }).error!,
    /gerekir/,
  );
  const captured = structuredClone(world);
  captured.provinces[capital].controller = "germany";
  assert.match(
    applyAction(captured, {
      type: "recruit",
      unit: "infantry",
      province: capital,
    }).error!,
    /kendi eyaletini/,
  );
  let queued = structuredClone(world);
  queued.countries.turkey.equipment.rifle = 1000;
  for (let i = 0; i < 6; i++) {
    const result = applyAction(queued, {
      type: "recruit",
      unit: "infantry",
      province: capital,
    });
    assert.equal(result.error, null);
    queued = result.world;
  }
  const snapshot = structuredClone(queued);
  const seventh = applyAction(queued, {
    type: "recruit",
    unit: "infantry",
    province: capital,
  });
  assert.match(seventh.error!, /en fazla 6/);
  assert.deepEqual(seventh.world, snapshot);
});
