import assert from "node:assert/strict";
import { test } from "node:test";
import { declareWar } from "./diplomacy";
import { applyAction } from "./engine";
import { resolveLandStep } from "./land";
import { formationCombat } from "./map3d-unit-events";
import { validateWorld } from "./storage";
import { addArmy, createWorld } from "./world";
import type { UnitType, World } from "./types";

const origin = "germany-7";
const target = "poland-2";
const fixtures: {
  name: string;
  attackers: UnitType[];
  defenders: UnitType[];
  fort: number;
  captures: boolean;
}[] = [
  {
    name: "Eşit piyade kuvvetleri",
    attackers: ["infantry"],
    defenders: ["infantry"],
    fort: 0,
    captures: false,
  },
  {
    name: "Üçe bir piyade taarruzu",
    attackers: ["infantry", "infantry", "infantry"],
    defenders: ["infantry"],
    fort: 0,
    captures: true,
  },
  {
    name: "Tank, piyade ve topçu taarruzu",
    attackers: ["mediumTank", "infantry", "artillery"],
    defenders: ["infantry", "infantry"],
    fort: 0,
    captures: true,
  },
  {
    name: "Tahkimata karşı tank taarruzu",
    attackers: ["mediumTank", "mediumTank", "infantry"],
    defenders: ["infantry", "infantry"],
    fort: 3,
    captures: true,
  },
];

function campaign(fixture: (typeof fixtures)[number]) {
  const world = createWorld("germany", "historical", 1926, "normal");
  declareWar(world, "germany", "poland");
  world.armies = [];
  // Isolate land combat from reinforcements, commanders, aircraft and research.
  // Both sides receive the same readiness and capital-connected supply.
  for (const country of Object.values(world.countries)) {
    country.air.wings = [];
    country.navy.ships = [];
    country.tech = [];
    country.advisor = "science";
    country.cabinet.military = "quartermaster";
    country.manpower = 0;
    country.stock.fuel = 100_000;
    country.autoAssignCommanders = false;
  }
  world.countries.germany.capital = origin;
  world.countries.poland.capital = target;
  for (const province of Object.values(world.provinces)) {
    province.buildings.infra = 10;
    province.buildings.rail = 10;
    province.buildings.hub = 5;
    province.buildings.fort = 0;
  }
  world.provinces[target].buildings.fort = fixture.fort;
  const attackers = fixture.attackers.map(
    (type) => addArmy(world, "germany", origin, type).id,
  );
  const defenders = fixture.defenders.map(
    (type) => addArmy(world, "poland", target, type).id,
  );
  for (const army of world.armies) {
    army.strength = army.organization = army.morale = 100;
    army.general = null;
    army.supply = 1;
    army.entrenchment = 0;
  }
  const order = applyAction(world, {
    type: "moveGroup",
    armies: attackers,
    to: target,
  });
  assert.equal(order.error, null);
  // Neither belligerent receives player difficulty modifiers during the test.
  order.world.player = "turkey";
  assert.equal(validateWorld(order.world), true);
  return { world: order.world, attackers, defenders };
}

function nextHour(world: World) {
  world.hour = (world.hour ?? 0) + 1;
  if (world.hour === 24) {
    world.hour = 0;
    world.day++;
  }
  resolveLandStep(world, 1 / 24);
}

for (const fixture of fixtures)
  test(`${fixture.name}: savaş 1–4 oyun gününde karar verir; emir ve kayıplar gerçektir`, (t) => {
    const { world, attackers, defenders } = campaign(fixture);
    let decisionHour: number | null = null;
    for (let hour = 1; hour <= 96; hour++) {
      nextHour(world);
      if (hour === 1) {
        assert.equal(world.provinces[target].controller, "poland");
        assert.ok(world.armies.every((army) => army.strength < 100));
        assert.ok(world.armies.every((army) => army.organization > 90));
      }
      const stillDefending = world.armies.some(
        (army) => defenders.includes(army.id) && army.province === target,
      );
      const stillAttacking = world.armies.some(
        (army) =>
          attackers.includes(army.id) &&
          (army.move?.to === target || army.route.includes(target)),
      );
      if (!stillDefending || !stillAttacking) {
        decisionHour = hour;
        break;
      }
    }
    assert.ok(
      decisionHour !== null && decisionHour >= 24 && decisionHour <= 96,
      `${fixture.name}: karar saati ${decisionHour ?? "96 saatten uzun"}`,
    );
    // Beating the defenders does not teleport a slower artillery formation.
    // The remaining march is peaceful and must still finish as one group.
    let arrivalHour = decisionHour;
    const lossesAfterCombat = world.countries.germany.casualties;
    const force = world.armies.filter((army) => attackers.includes(army.id));
    if (fixture.captures)
      while (
        world.provinces[target].controller !== "germany" &&
        arrivalHour < 96
      ) {
        nextHour(world);
        arrivalHour++;
        assert.ok(world.battles.every((battle) => battle.province !== target));
        assert.equal(formationCombat(world, force), null);
        assert.equal(world.countries.germany.casualties, lossesAfterCombat);
      }
    assert.equal(
      world.provinces[target].controller,
      fixture.captures ? "germany" : "poland",
    );
    assert.ok(world.countries.germany.casualties > 0);
    assert.ok(world.countries.poland.casualties > 0);
    for (const army of force) {
      assert.equal(army.province, fixture.captures ? target : origin);
      assert.equal(army.move, null);
      assert.deepEqual(army.route, []);
    }
    if (fixture.attackers.includes("mediumTank"))
      assert.ok(world.countries.germany.stock.fuel < 100_000);
    assert.equal(validateWorld(world), true);
    t.diagnostic(
      `Savaş kararı: ${decisionHour} oyun saati; varış: ${fixture.captures ? arrivalHour : "taarruz durdu"}; taarruz kaybı: ${Math.round(world.countries.germany.casualties)}; savunma kaybı: ${Math.round(world.countries.poland.casualties)}.`,
    );
  });

test("Savunma erken çözülürse tümenler kalan yolu yürür; boş şehre ateş ve savaş hasarı sürmez", () => {
  const { world, attackers, defenders } = campaign(fixtures[1]);
  const defender = world.armies.find((army) => defenders.includes(army.id))!;
  defender.organization = 10.01;
  nextHour(world);
  assert.ok(
    world.armies.every(
      (army) => !defenders.includes(army.id) || army.province !== target,
    ),
  );
  assert.equal(world.provinces[target].controller, "poland");
  const force = world.armies.filter((army) => attackers.includes(army.id));
  assert.ok(force.every((army) => army.move?.to === target));
  assert.equal(formationCombat(world, force), null);
  const losses = world.countries.germany.casualties;
  const captured = () => world.provinces[target].controller === "germany";
  for (let hour = 0; hour < 96 && !captured(); hour++) {
    nextHour(world);
    assert.ok(world.battles.every((battle) => battle.province !== target));
    assert.equal(world.countries.germany.casualties, losses);
    assert.equal(formationCombat(world, force), null);
  }
  assert.equal(world.provinces[target].controller, "germany");
  assert.ok(force.every((army) => army.province === target && !army.move));
  assert.equal(validateWorld(world), true);
});
