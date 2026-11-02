import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countryLabelSignature,
  countryMapLabels,
} from "./map3d-country-labels";
import { createWorld, GEOGRAPHY } from "./world";

test("Political labels stay on controlled city anchors and never mutate the campaign", () => {
  const world = createWorld("turkey", "historical", 1936);
  const before = structuredClone(world);
  const labels = countryMapLabels(world);
  assert.equal(new Set(labels.map((l) => l.country)).size, labels.length);
  assert.equal(labels.length, Object.keys(world.countries).length);
  for (const label of labels) {
    assert.equal(world.provinces[label.province].controller, label.country);
    assert.equal(label.x, GEOGRAPHY[label.province].x);
    assert.ok(label.provinces > 0);
  }
  assert.deepEqual(world, before);
});

test("Ownership and names invalidate labels, hourly movement does not", () => {
  const world = createWorld("turkey", "historical", 1936);
  const signature = countryLabelSignature(world);
  world.hour = 5;
  world.armies.reverse();
  assert.equal(countryLabelSignature(world), signature);
  for (const province of Object.values(world.provinces)) {
    if (province.controller === "bulgaria") province.controller = "turkey";
  }
  assert.notEqual(countryLabelSignature(world), signature);
  assert.ok(!countryMapLabels(world).some((l) => l.country === "bulgaria"));
  const captured = countryLabelSignature(world);
  world.countries.turkey.name = "Yeni yönetim";
  assert.notEqual(countryLabelSignature(world), captured);
  assert.equal(
    countryMapLabels(world).find((l) => l.country === "turkey")?.name,
    "Yeni yönetim",
  );
});

test("Separated occupied territory cannot drag the home label into the sea", () => {
  const world = createWorld("turkey", "historical", 1936);
  const home = countryMapLabels(world).find((l) => l.country === "turkey")!;
  const remote = world.countries.uk.capital;
  world.provinces[remote].controller = "turkey";
  const label = countryMapLabels(world).find((l) => l.country === "turkey")!;
  assert.equal(label.province, home.province);
  assert.notEqual(label.province, remote);
});
