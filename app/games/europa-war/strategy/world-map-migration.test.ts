import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/europe-v3-before-world.json";
import legacy from "./legacy-europe-map.json";
import { createWorld, MAP } from "./world";
import { advanceHours } from "./engine";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import type { World } from "./types";

function oldWorld(): World {
  return structuredClone(fixture.world) as unknown as World;
}
function readOld(world = oldWorld()) {
  return decodeSave(JSON.stringify({ ...fixture, world }));
}

test("1936 world starts with complete countries, capitals, dependencies and valid military assets", () => {
  assert.equal(MAP.countries.length, 92);
  assert.equal(MAP.provinces.length, 909);
  const w = createWorld("usa");
  assert.equal(w.mapVersion, "world-1936-v1");
  assert.ok(validateWorld(w));
  for (const c of Object.values(w.countries)) {
    assert.equal(w.provinces[c.capital].controller, c.id, c.id);
    assert.ok(Number.isFinite(c.manpower) && c.manpower >= 0, c.id);
    assert.equal(c.automation.air, false);
    assert.equal(c.automation.navy, false);
    if (c.subjectOf) {
      assert.ok(w.countries[c.subjectOf]);
      assert.ok(w.countries[c.subjectOf].allies.includes(c.id));
    }
  }
  assert.equal(w.provinces["egypt-2"].controller, "uk");
  assert.equal(w.provinces["usa-global-panama-canal"].controller, "usa");
  for (const player of [
    "usa",
    "japan",
    "brazil",
    "china",
    "australia",
    "iceland",
  ]) {
    const game = createWorld(player);
    assert.equal(game.player, player);
    if (player !== "iceland")
      assert.ok(
        game.armies.some((a) => a.country === player),
        player,
      );
    assert.ok(validateWorld(advanceHours(game, 24)), player);
  }
});

test("actual European save expands without moving old troops or changing paid queues and occupied cities", () => {
  const before = oldWorld();
  assert.equal(Object.keys(before.provinces).length, 447);
  const after = readOld(before);
  assert.ok(validateWorld(after));
  assert.equal(Object.keys(after.provinces).length, 909);
  assert.equal(after.day, before.day);
  assert.equal(after.hour, before.hour);
  assert.equal(after.seed, before.seed);
  assert.deepEqual(after.rng, before.rng);
  assert.deepEqual(after.commandState, before.commandState);
  for (const id of legacy.provinceIds)
    assert.deepEqual(after.provinces[id], before.provinces[id], id);
  for (const army of before.armies)
    assert.deepEqual(
      after.armies.find((a) => a.id === army.id),
      army,
    );
  for (const id of legacy.countryIds) {
    for (const key of [
      "equipment",
      "stock",
      "construction",
      "recruitment",
      "research",
      "tech",
      "production",
      "generals",
      "automation",
      "air",
      "navy",
    ] as const)
      assert.deepEqual(
        after.countries[id][key],
        before.countries[id][key],
        `${id}/${key}`,
      );
  }
  assert.equal(after.provinces["denmark-2"].controller, "denmark");
  assert.equal(after.countries.iceland.capitulated, true);
  const ids = [
    ...after.armies.map((a) => a.id),
    ...Object.values(after.countries).flatMap((c) =>
      [...c.air.wings, ...c.navy.ships].map((a) => a.id),
    ),
  ];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(decodeSave(encodeSave(after)), after);
  assert.ok(validateWorld(advanceHours(after, 24)));
});

test("completed annexation stays completed when overseas provinces are added", () => {
  const before = oldWorld();
  const loser = before.countries.france;
  loser.capitulated = true;
  loser.victor = null;
  for (const p of Object.values(before.provinces))
    if (p.owner === loser.id) p.owner = p.controller = "germany";
  before.armies = before.armies.filter((a) => a.country !== loser.id);
  const after = readOld(before);
  const overseas = MAP.provinces.filter(
    (p) => p.country === "france" && !legacy.provinceIds.includes(p.id),
  );
  assert.ok(overseas.length > 0);
  for (const p of overseas) {
    assert.equal(after.provinces[p.id].owner, "germany");
    assert.equal(after.provinces[p.id].controller, "germany");
  }
  assert.ok(after.countries.france.capitulated);
  assert.ok(validateWorld(after));
});

test("ongoing peace conference includes expanded land and its settlement budget", () => {
  const before = oldWorld();
  before.countries.france.capitulated = true;
  before.countries.france.victor = "germany";
  const owned = Object.values(before.provinces).filter(
    (p) => p.owner === "france",
  );
  for (const p of owned) p.controller = "germany";
  before.conferences.push({
    id: "old-peace",
    defeated: "france",
    participants: ["germany"],
    points: { germany: 100 },
    available: owned.map((p) => p.id),
    awards: [],
    round: 1,
    turn: 0,
    status: "open",
  });
  const after = readOld(before);
  const q = after.conferences[0];
  assert.ok(q.available.length > owned.length);
  assert.ok(q.points.germany > 100);
  assert.equal(q.turn, 0);
  for (const p of Object.values(after.provinces).filter(
    (p) => p.owner === "france",
  )) {
    assert.equal(p.controller, "germany");
    assert.ok(q.available.includes(p.id));
  }
  assert.ok(validateWorld(after));
});

test("partial world saves and incomplete old saves are rejected rather than silently regenerated", () => {
  const broken = createWorld("turkey");
  delete broken.provinces["usa-0"];
  assert.throws(() => decodeSave(encodeSave(broken)));
  const old = oldWorld();
  delete old.provinces["turkey-city-0"];
  assert.throws(() => readOld(old));
  const marked = oldWorld();
  marked.mapVersion = "world-1936-v1";
  assert.throws(() => readOld(marked));
});
