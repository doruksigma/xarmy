import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommand, executeCommandInPlace } from "./commands";
import { declareWar } from "./diplomacy";
import { easyCommanderGuide, easyPresentationPreference } from "./easy-play";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { Action, World } from "./types";

function command(world: World, action: Action) {
  const result = executeCommandInPlace(
    world,
    createCommand(world, action),
    world.player,
  );
  assert.equal(result.status, "applied", result.message);
}

function assignedWorld() {
  const world = createWorld("turkey");
  command(world, { type: "commanderAutoAssign", enabled: true });
  return world;
}

test("Kolay sunum varsayılandır; görünüm tercihi oyun dünyasını değiştirmez", () => {
  const world = createWorld("turkey", "alternative", 44, "hard"),
    before = structuredClone(world);
  assert.equal(easyPresentationPreference(null), true);
  assert.equal(easyPresentationPreference("easy"), true);
  assert.equal(easyPresentationPreference("advanced"), false);
  assert.equal(easyPresentationPreference("outdated-value"), true);
  easyCommanderGuide(world);
  assert.deepEqual(world, before);
});

test("Rehber yalnız kendi birliklerini sayar ve silinmiş komutandan geçerli komutana döner", () => {
  const world = assignedWorld(),
    guide = easyCommanderGuide(world, "deleted-commander");
  assert.ok(guide.selected);
  assert.ok(
    world.countries.turkey.generals.some(
      (general) => general.id === guide.selected!.id,
    ),
  );
  assert.equal(
    guide.total,
    world.armies.filter((army) => army.country === "turkey").length,
  );
  assert.equal(guide.unassigned, 0);
  assert.ok(guide.members > 0);
  assert.equal(
    easyCommanderGuide(createWorld("germany"), guide.selected!.id).country.id,
    "germany",
  );
});

test("Rehber ataması mevcut ve yeni tümenleri gerçek komutanlara en fazla 12 olarak bağlar", () => {
  const world = createWorld("turkey");
  world.countries.turkey.autoAssignCommanders = false;
  world.armies = [];
  for (let index = 0; index < 25; index++)
    addArmy(world, world.player, "turkey-0");
  assert.equal(easyCommanderGuide(world).unassigned, 25);
  command(world, { type: "commanderAutoAssign", enabled: true });
  let guide = easyCommanderGuide(world);
  assert.equal(guide.unassigned, 0);
  assert.equal(guide.total, 25);
  assert.ok([...guide.counts.values()].every((count) => count <= 12));
  addArmy(world, world.player, "turkey-0");
  guide = easyCommanderGuide(world);
  assert.equal(guide.total, 26);
  assert.equal(guide.unassigned, 0);
  assert.ok([...guide.counts.values()].every((count) => count <= 12));
});

test("Rehber yalnız kara komşularını önerir; konuşlandırma savaş açmaz", () => {
  const world = assignedWorld();
  let guide = easyCommanderGuide(world);
  assert.ok(guide.neighbors.some((country) => country.id === "bulgaria"));
  assert.ok(!guide.neighbors.some((country) => country.id === "germany"));
  for (const country of guide.neighbors)
    assert.ok(
      Object.values(world.provinces).some(
        (province) =>
          province.controller === "turkey" &&
          GEOGRAPHY[province.id].neighbors.some(
            (edge) =>
              !edge.sea && world.provinces[edge.id].controller === country.id,
          ),
      ),
    );
  assert.equal(guide.canAttack, false);
  command(world, {
    type: "commanderDeploy",
    general: guide.selected!.id,
    target: "bulgaria",
  });
  guide = easyCommanderGuide(world, guide.selected!.id);
  assert.equal(guide.deployedTarget!.id, "bulgaria");
  assert.equal(guide.selected!.front!.stance, "defend");
  assert.equal(guide.canAttack, false);
  assert.ok(!world.countries.turkey.wars.includes("bulgaria"));
  declareWar(world, "turkey", "bulgaria");
  guide = easyCommanderGuide(world, guide.selected!.id);
  assert.equal(guide.canAttack, true);
  command(world, {
    type: "commanderStance",
    general: guide.selected!.id,
    stance: "attack",
  });
  assert.equal(
    easyCommanderGuide(world, guide.selected!.id).selected!.front!.stance,
    "attack",
  );
});

test("Reddedilen sınır değişikliği uygulanan cepheyi veya rehber aşamasını değiştirmez", () => {
  const world = assignedWorld(),
    general = easyCommanderGuide(world).selected!.id;
  command(world, { type: "commanderDeploy", general, target: "bulgaria" });
  const before = structuredClone(world);
  const result = executeCommandInPlace(
    world,
    createCommand(world, {
      type: "commanderDeploy",
      general,
      target: "germany",
    }),
    world.player,
  );
  assert.equal(result.status, "rejected");
  assert.deepEqual(world, before);
  assert.equal(
    easyCommanderGuide(world, general).deployedTarget!.id,
    "bulgaria",
  );
});

test("Bağlantısız tümenin konuşlandırılması reddedilir; rehber başarı varsaymaz", () => {
  const world = assignedWorld(),
    general = easyCommanderGuide(world).selected!.id;
  world.provinces["denmark-2"].controller = "turkey";
  const isolated = world.armies.find(
    (army) => army.country === "turkey" && army.general === general,
  )!;
  isolated.province = "denmark-2";
  const before = structuredClone(world);
  const result = executeCommandInPlace(
    world,
    createCommand(world, {
      type: "commanderDeploy",
      general,
      target: "bulgaria",
    }),
    world.player,
  );
  assert.equal(result.status, "rejected");
  assert.deepEqual(world, before);
  assert.equal(easyCommanderGuide(world, general).deployedTarget, undefined);
});

test("Boş ordu, kara komşusu olmayan ülke ve teslimiyet gerçek eylem koşullarını kapatır", () => {
  const world = createWorld("turkey");
  world.armies = [];
  assert.equal(easyCommanderGuide(world).canDeploy, false);
  for (const province of Object.values(world.provinces))
    if (province.controller === "turkey") province.controller = "france";
  world.provinces["france-8"].controller = "turkey";
  world.countries.turkey.capital = "france-8";
  addArmy(world, "turkey", "france-8");
  command(world, { type: "commanderAutoAssign", enabled: true });
  const guide = easyCommanderGuide(world);
  assert.equal(guide.neighbors.length, 0);
  assert.equal(guide.canDeploy, false);
  assert.equal(guide.canAttack, false);
  world.countries.turkey.capitulated = true;
  assert.equal(easyCommanderGuide(world).canDeploy, false);
});
