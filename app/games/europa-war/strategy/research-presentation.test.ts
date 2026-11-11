import assert from "node:assert/strict";
import test from "node:test";
import { politicsDay } from "./politics";
import { TECHNOLOGIES } from "./catalog";
import { createWorld } from "./world";
import {
  researchDailyProgress,
  researchPositions,
  researchRemainingDays,
  researchStatus,
} from "./research-presentation";

test("Research forecast matches real daily progress for branch-specific cabinet bonuses", () => {
  for (const [cabinet, id, expectedBonus] of [
    ["institute", "weapons2", 0.1],
    ["engineers", "armor2", 0.25],
    ["engineers", "industry2", 0.25],
    ["engineers", "weapons2", 0],
    ["doctrine", "landDoctrine", 0.3],
    ["doctrine", "aviation2", 0],
  ] as const) {
    const world = createWorld("turkey");
    const country = world.countries.turkey;
    country.science = 0.2;
    country.advisor = "science";
    country.cabinet.science = cabinet;
    country.research = [{ id, progress: 10, total: 100 }];
    const rate = researchDailyProgress(country, id);
    assert.ok(Math.abs(rate - (1.35 + expectedBonus)) < 1e-9);
    const days = researchRemainingDays(country, country.research[0]);
    assert.equal(days, Math.ceil(90 / rate));
    politicsDay(world);
    assert.ok(Math.abs(country.research[0].progress - (10 + rate)) < 1e-9);
    country.research[0].progress = 100 - rate / 2;
    assert.equal(researchRemainingDays(country, country.research[0]), 1);
    politicsDay(world);
    assert.ok(country.tech.includes(id));
    assert.equal(country.research.length, 0);
  }
});

test("Research selection distinguishes known, active and cross-branch requirements", () => {
  const country = createWorld("turkey").countries.turkey;
  country.tech = ["armor1", "motorization"];
  country.research = [{ id: "armor2", total: 130, progress: 20 }];
  assert.equal(researchStatus(country, "armor1"), "completed");
  assert.equal(researchStatus(country, "armor2"), "working");
  assert.equal(researchStatus(country, "mechanization"), "locked");
  assert.equal(researchStatus(country, "engines"), "available");
  country.tech.push("armor2");
  assert.equal(researchStatus(country, "mechanization"), "available");
  assert.equal(researchStatus(country, "does-not-exist"), "locked");
});

test("Technology board keeps all dependencies left of their children and nodes do not overlap", () => {
  const positions = researchPositions(
    TECHNOLOGIES.map((technology) => technology.id),
  );
  const byId = new Map(positions.map((position) => [position.id, position]));
  assert.equal(
    new Set(positions.map((position) => `${position.x}:${position.y}`)).size,
    TECHNOLOGIES.length,
  );
  for (const technology of TECHNOLOGIES)
    for (const id of technology.requires)
      assert.ok(byId.get(id)!.x < byId.get(technology.id)!.x);
  assert.deepEqual(researchPositions([]), []);
  assert.equal(researchPositions(["armor3"])[0].x, 14);
});
