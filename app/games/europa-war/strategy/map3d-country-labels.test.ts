import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countryLabelSignature,
  countryMapLabels,
  countryLabelsOverlap,
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

test("Elongated territories orient their labels geographically and survive save round trips", () => {
  const world = createWorld("turkey", "historical", 1936);
  const labels = countryMapLabels(world);
  assert.deepEqual(countryMapLabels(structuredClone(world)), labels);
  for (const label of labels) {
    assert.ok(Math.abs(Math.hypot(label.axisX, label.axisY) - 1) < 1e-9);
    assert.ok(Number.isFinite(label.span) && label.span >= 18);
    assert.ok(Number.isFinite(label.minorSpan) && label.minorSpan >= 14);
    assert.ok(label.axisX >= 0, "Text direction must remain readable");
  }
  const italy = labels.find((l) => l.country === "italy")!;
  const sweden = labels.find((l) => l.country === "sweden")!;
  const turkey = labels.find((l) => l.country === "turkey")!;
  assert.ok(italy.axisY > 0.5, "Italy follows its southeast peninsula");
  assert.ok(sweden.axisY < -0.5, "Sweden follows its northeast coast");
  assert.ok(Math.abs(turkey.axisY) < 0.25, "Anatolia reads west to east");
});

test("Rotated neighbouring labels reserve their ink, not empty bounding-box corners", () => {
  const a = { x: 0, y: 0, width: 100, height: 10, angle: Math.PI / 4 };
  const parallel = { ...a, x: -20, y: 20 };
  assert.equal(countryLabelsOverlap(a, parallel), false);
  assert.equal(countryLabelsOverlap(parallel, a), false);
  assert.equal(countryLabelsOverlap(a, { ...a, angle: -Math.PI / 4 }), true);
  assert.equal(countryLabelsOverlap(a, { ...a, width: 5, height: 2 }), true);
  const horizontal = { ...a, angle: 0 };
  assert.equal(
    countryLabelsOverlap(horizontal, { ...horizontal, y: 16 }),
    true,
    "Padding keeps nearby captions apart",
  );
  assert.equal(
    countryLabelsOverlap(horizontal, { ...horizontal, y: 16 }, 0),
    false,
  );
});
