import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import boundaries from "./strategic-map-boundaries.json";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld } from "./world";
import {
  boundaryPath,
  commanderBoundaryPaths,
  strategicBoundarySegments,
  strategicMapOverlay,
} from "./strategic-map-boundaries";

test("Strategic borders follow actual controllers; domestic city lines never become national borders", () => {
  const w = createWorld("turkey");
  const before = structuredClone(w);
  const edges = strategicBoundarySegments(w);
  const border = edges.find((edge) => edge.kind === "country")!;
  assert.ok(border);
  for (const edge of edges)
    assert.ok(
      new Set(edge.provinces.map((id) => w.provinces[id].controller)).size > 1,
    );
  assert.deepEqual(w, before);
  const [a, b] = border.provinces;
  w.provinces[b].controller = w.provinces[a].controller;
  assert.ok(
    !strategicBoundarySegments(w).some(
      (edge) => edge.a === border.a && edge.b === border.b,
    ),
  );
});

test("A war changes only the geographic shared border into a hostile boundary", () => {
  const w = createWorld("turkey");
  const edge = strategicBoundarySegments(w).find(
    (e) =>
      e.provinces.some((id) => w.provinces[id].controller === "turkey") &&
      e.provinces.some((id) => w.provinces[id].controller === "bulgaria"),
  )!;
  assert.ok(edge);
  w.countries.turkey.wars = ["bulgaria"];
  w.countries.bulgaria.wars = ["turkey"];
  assert.ok(
    strategicBoundarySegments(w).some(
      (e) => e.a === edge.a && e.b === edge.b && e.kind === "hostile",
    ),
  );
  assert.ok(!boundaryPath([edge]).includes("NaN"));
});

test("Unassigned commanders draw no invented fronts; target and stance come from their real order", () => {
  const w = createWorld("turkey");
  assert.deepEqual(commanderBoundaryPaths(w), []);
  const general = w.countries.turkey.generals[0];
  general.front = { target: "bulgaria", stance: "defend", assignments: {} };
  const fronts = commanderBoundaryPaths(w);
  assert.equal(fronts.length, 1);
  assert.equal(fronts[0].id, general.id);
  assert.equal(fronts[0].target, "bulgaria");
  assert.equal(fronts[0].stance, "defend");
  assert.ok(fronts[0].path.length > 0);
  assert.ok(
    fronts[0].provinces.every((id) =>
      ["turkey", "bulgaria"].includes(w.provinces[id].controller),
    ),
  );
  general.front.target = "japan";
  assert.deepEqual(commanderBoundaryPaths(w), []);
});

test("Overlay geometry is reused for time/unit changes and refreshed for actual control, war or front orders", () => {
  const w = createWorld("turkey");
  const initial = strategicMapOverlay(w);
  assert.equal(strategicMapOverlay(w), initial);
  w.hour = 1;
  w.armies[0].organization -= 1;
  assert.equal(strategicMapOverlay(w), initial);
  w.countries.turkey.wars = ["bulgaria"];
  const war = strategicMapOverlay(w);
  assert.notEqual(war, initial);
  assert.ok(war.hostile.length > initial.hostile.length);
  w.countries.turkey.generals[0].front = {
    target: "bulgaria",
    stance: "defend",
    assignments: {},
  };
  const front = strategicMapOverlay(w);
  assert.notEqual(front, war);
  assert.equal(front.fronts.length, 1);
  const own = front.fronts[0].provinces.find(
    (id) => w.provinces[id].controller === "turkey",
  )!;
  w.provinces[own].controller = "bulgaria";
  const occupied = strategicMapOverlay(w);
  assert.notEqual(occupied, front);
  assert.notEqual(
    occupied.country + occupied.hostile,
    front.country + front.hostile,
  );
});

test("The precomputed boundary asset records the exact current source geography", () => {
  const source = readFileSync(
    resolve(process.cwd(), "app/games/europa-war/strategy/map-data.json"),
  );
  assert.equal(
    boundaries.sourceSha256,
    createHash("sha256").update(source).digest("hex"),
  );
  const world = createWorld("turkey");
  assert.ok(boundaries.groups.length > 1000);
  for (const group of boundaries.groups) {
    assert.ok(group.provinces.length >= 2);
    assert.equal(new Set(group.provinces).size, group.provinces.length);
    assert.ok(group.provinces.every((id) => world.provinces[id]));
    assert.match(group.path, /^M[-\d.,L]+/);
    assert.ok(!group.path.includes("NaN"));
  }
});

test("Three-province junctions detect a war between any pair of actual controllers", () => {
  const w = createWorld("turkey");
  const group = boundaries.groups.find(
    (entry) => entry.provinces.length === 3,
  )!;
  assert.ok(group);
  for (const [index, country] of ["turkey", "bulgaria", "greece"].entries()) {
    w.provinces[group.provinces[index]].controller = country;
    w.countries[country].wars = [];
  }
  w.countries.bulgaria.wars = ["greece"];
  w.countries.greece.wars = ["bulgaria"];
  assert.ok(
    strategicBoundarySegments(w).some(
      (edge) =>
        edge.provinces.length === 3 &&
        edge.provinces.every((id) => group.provinces.includes(id)) &&
        edge.kind === "hostile",
    ),
  );
});
