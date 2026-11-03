import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceHour, applyAction } from "./engine";
import { TECHNOLOGIES } from "./catalog";
import { decodeSave, encodeSave } from "./storage";
import { addArmy, createWorld, MAP } from "./world";
import { visibleFormations } from "./map3d-visuals";
import {
  COUNTRY_UNIFORM_COLORS,
  DEFAULT_UNIFORM_COLOR,
  TECH_VISUAL_UPGRADES,
  UNIT_VISUAL_KINDS,
  getUnitVisualResearch,
  getUnitVisualResearchGuide,
  getVisibleUnitVisualResearch,
  type UnitVisualCountry,
  type VisualResearchTier,
} from "./map3d-unit-research";

test("Completed weapons and armour change only their corresponding visual families", () => {
  const country = { id: "france", tech: [] as string[] };
  const baseline = getUnitVisualResearch(country);
  for (const tier of [1, 2, 3] as const) {
    country.tech = [`weapons${tier}`];
    assert.deepEqual(getUnitVisualResearch(country), {
      ...baseline,
      infantry: tier,
      artillery: tier,
    });
    country.tech = [`armor${tier}`];
    assert.deepEqual(getUnitVisualResearch(country), {
      ...baseline,
      tank: tier,
    });
  }
  country.tech = [
    "weapons3",
    "weapons1",
    "weapons2",
    "weapons1",
    "armor3",
    "armor1",
  ];
  const before = structuredClone(country);
  assert.deepEqual(getUnitVisualResearch(country), {
    ...baseline,
    infantry: 3,
    artillery: 3,
    tank: 3,
  });
  assert.deepEqual(
    country,
    before,
    "The derivation must not sort or change saved technology",
  );
});

test("Motor engines cannot upgrade an unmotorized country and mechanization needs no invented engine prerequisite", () => {
  const cases: [string[], VisualResearchTier][] = [
    [[], 0],
    [["engines"], 0],
    [["mechanization"], 0],
    [["engines", "mechanization"], 0],
    [["motorization"], 1],
    [["motorization", "engines"], 2],
    [["motorization", "mechanization"], 3],
    [["mechanization", "engines", "motorization"], 3],
  ];
  for (const [tech, expected] of cases)
    assert.equal(
      getUnitVisualResearch({ id: "turkey", tech }).truck,
      expected,
      tech.join(","),
    );
});

test("Every national palette is available, isolated from map colours, and unknown or rebel countries are safe", () => {
  for (const country of MAP.countries) {
    assert.ok(Object.hasOwn(COUNTRY_UNIFORM_COLORS, country.id), country.id);
    const uniform = getUnitVisualResearch({ id: country.id, tech: [] }).uniform;
    assert.ok(Number.isInteger(uniform) && uniform >= 0 && uniform <= 0xffffff);
  }
  assert.notEqual(COUNTRY_UNIFORM_COLORS.france, COUNTRY_UNIFORM_COLORS.uk);
  assert.notEqual(COUNTRY_UNIFORM_COLORS.germany, COUNTRY_UNIFORM_COLORS.ussr);
  assert.notEqual(
    COUNTRY_UNIFORM_COLORS.netherlands,
    COUNTRY_UNIFORM_COLORS.france,
  );
  assert.equal(
    getUnitVisualResearch({ id: "france-rebels", tech: [] }).uniform,
    COUNTRY_UNIFORM_COLORS.france,
  );
  for (const id of ["unknown-country", "__proto__", "constructor", ""])
    assert.equal(
      getUnitVisualResearch({ id, tech: [] }).uniform,
      DEFAULT_UNIFORM_COLOR,
    );
});

test("Real research orders and midnight completion drive all visual upgrades; queue and near-complete progress do not", () => {
  let world = createWorld("turkey", "alternative", 1936);
  const c = world.countries.turkey;
  c.tech = [];
  c.research = [];
  c.science = 0;
  c.advisor = "army";
  c.automation.research = false;
  const technologies = [
    "weapons1",
    "weapons2",
    "weapons3",
    "armor1",
    "armor2",
    "armor3",
    "motorization",
    "engines",
    "mechanization",
  ];
  for (const id of technologies) {
    const before = getUnitVisualResearch(world.countries.turkey);
    const original = structuredClone(world);
    const result = applyAction(world, { type: "research", id });
    assert.equal(result.error, null, id);
    world = result.world;
    assert.equal(world.countries.turkey.research[0].id, id);
    assert.deepEqual(
      getUnitVisualResearch(world.countries.turkey),
      before,
      `${id}: queued`,
    );
    assert.deepEqual(
      getUnitVisualResearch(original.countries.turkey),
      before,
      "Old snapshots stay unchanged",
    );
    const project = world.countries.turkey.research[0];
    project.progress = project.total - 0.5;
    world.hour = 22;
    world = advanceHour(world);
    assert.equal(world.hour, 23);
    assert.deepEqual(
      getUnitVisualResearch(world.countries.turkey),
      before,
      `${id}: nearly complete`,
    );
    const neighboursBefore = getUnitVisualResearch(world.countries.france);
    world = advanceHour(world);
    assert.equal(world.hour, 0);
    assert.ok(world.countries.turkey.tech.includes(id));
    const after = getUnitVisualResearch(world.countries.turkey);
    assert.notDeepEqual(after, before, `${id}: actual midnight completion`);
    assert.deepEqual(
      getUnitVisualResearch(world.countries.france),
      neighboursBefore,
      "Research belongs to its issuing country",
    );
    assert.deepEqual(
      getUnitVisualResearch(original.countries.turkey),
      before,
      "Rolling back uses the old completed tech only",
    );
  }
  const final = getUnitVisualResearch(world.countries.turkey);
  for (const kind of UNIT_VISUAL_KINDS) assert.equal(final[kind], 3);
});

test("Save/load, legacy daily saves, unrelated research and missing research fields cannot invent an upgrade", () => {
  const world = createWorld("turkey", "alternative", 1936);
  world.countries.turkey.tech = [
    "weapons1",
    "armor2",
    "motorization",
    "engines",
  ];
  const expected = getUnitVisualResearch(world.countries.turkey);
  const serialized = encodeSave(world);
  assert.deepEqual(
    getUnitVisualResearch(decodeSave(serialized).countries.turkey),
    expected,
  );
  const old: Omit<typeof world, "version" | "hour"> & {
    version: number;
    hour?: number;
  } = structuredClone(world);
  old.version = 2;
  delete old.hour;
  for (const event of old.events) delete event.hour;
  const loaded = decodeSave(
    JSON.stringify({ format: "xarmy-europa-1936", version: 2, world: old }),
  );
  assert.deepEqual(getUnitVisualResearch(loaded.countries.turkey), expected);
  const changed = structuredClone(world.countries.turkey);
  changed.tech.push("radar", "industry1", "airDoctrine", "not-a-technology");
  changed.research = [{ id: "weapons3", total: 140, progress: 140 }];
  assert.deepEqual(getUnitVisualResearch(changed), expected);
  for (const tech of [undefined, null, "weapons3", {}]) {
    const empty = { id: "turkey", tech } as unknown as UnitVisualCountry;
    const state = getUnitVisualResearch(empty);
    for (const kind of UNIT_VISUAL_KINDS) assert.equal(state[kind], 0);
  }
  assert.equal(
    getUnitVisualResearch({ id: "turkey", tech: [] }).tank,
    0,
    "Loading an older snapshot removes later visual tiers",
  );
  assert.deepEqual(
    world,
    JSON.parse(serialized).world,
    "Reading visual state does not add save fields or mutate the world",
  );
});

test("Guide and upgrade descriptions use real catalogue technology names and truthful shared artillery prerequisites", () => {
  const country = { id: "turkey", tech: ["weapons1", "motorization"] };
  const entries = getUnitVisualResearchGuide(country);
  assert.equal(entries.length, 4);
  assert.equal(
    entries.find((entry) => entry.kind === "artillery")!.next!.id,
    "weapons2",
  );
  const truck = entries.find((entry) => entry.kind === "truck")!;
  assert.equal(truck.next!.id, "engines");
  assert.deepEqual(truck.next!.requirements, [
    { id: "armor1", name: "Hafif zırhlılar", complete: false },
  ]);
  for (const entry of entries) {
    const technology = TECHNOLOGIES.find(
      (technology) => technology.id === entry.next!.id,
    )!;
    assert.equal(entry.next!.name, technology.name);
    assert.deepEqual(
      entry.next!.requirements.map((requirement) => requirement.id),
      technology.requires,
    );
  }
  for (const id of Object.keys(TECH_VISUAL_UPGRADES))
    assert.ok(TECHNOLOGIES.some((technology) => technology.id === id));
  assert.match(TECH_VISUAL_UPGRADES.weapons1, /ortak silah modernizasyonu/);
  const complete = getUnitVisualResearchGuide({
    id: "turkey",
    tech: TECHNOLOGIES.map((technology) => technology.id),
  });
  assert.ok(complete.every((entry) => entry.tier === 3 && entry.next === null));
});

test("Observed enemy models reveal known hardware only; live intelligence and alliances govern research disclosure", () => {
  const world = createWorld("turkey", "alternative", 1936);
  world.armies = [];
  const enemy = world.countries.germany;
  enemy.tech = [
    "weapons3",
    "armor3",
    "motorization",
    "engines",
    "mechanization",
  ];
  const hidden = addArmy(world, enemy.id, enemy.capital);
  assert.ok(
    !visibleFormations(world).flat().includes(hidden),
    "The renderer never receives undisclosed armies",
  );
  const border = addArmy(world, enemy.id, world.countries.turkey.capital);
  assert.ok(visibleFormations(world).flat().includes(border));
  const base = getUnitVisualResearch({ id: enemy.id, tech: [] });
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [border]),
    base,
    "Seeing infantry does not reveal its country's advanced research",
  );
  border.type = "mediumTank";
  assert.deepEqual(getVisibleUnitVisualResearch(world, [border]), {
    ...base,
    tank: 2,
  });
  const observedMechanized = { ...border, type: "mechanized" as const };
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [border, observedMechanized]),
    { ...base, tank: 2, truck: 3 },
  );
  const queued = structuredClone(enemy);
  enemy.tech = [];
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [border]),
    { ...base, tank: 2 },
    "Observed hardware does not disappear when hidden technology changes",
  );
  enemy.tech = queued.tech;
  world.countries.turkey.intel.germany = { level: 50, expires: world.day + 1 };
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [border]),
    getUnitVisualResearch(enemy),
  );
  world.day++;
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [border]),
    { ...base, tank: 2 },
    "Expired intelligence cannot retain cached enemy upgrades",
  );
  world.countries.turkey.allies.push(enemy.id);
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [border]),
    getUnitVisualResearch(enemy),
  );
  world.countries.turkey.allies = [];
  assert.deepEqual(getVisibleUnitVisualResearch(world, [border]), {
    ...base,
    tank: 2,
  });
  const own = addArmy(world, world.player, world.countries.turkey.capital);
  world.countries.turkey.tech = ["weapons2"];
  assert.deepEqual(
    getVisibleUnitVisualResearch(world, [own]),
    getUnitVisualResearch(world.countries.turkey),
  );
  assert.equal(
    getVisibleUnitVisualResearch(world, []).uniform,
    DEFAULT_UNIFORM_COLOR,
  );
});
