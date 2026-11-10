import { test } from "node:test";
import assert from "node:assert/strict";
import { SEA_ZONES } from "./advanced-catalog";
import { containsProvincePoint, provincePolygons } from "./map3d-geometry";
import { createAirNavalGeometry } from "./map3d-airnaval-models";
import {
  NAVAL_FOOTPRINT_RADIUS,
  NAVAL_MODEL_SCALE,
  navalFormationLayout,
  NAVAL_PRESENTATION,
  navalPatrolPose,
} from "./map3d-naval-space";
import map from "./map-data.json";
import type { SeaZone } from "./types";

const provinces = map.provinces.map((province) => {
  const rings = provincePolygons(province.id).flatMap((part) => [
    part.outer,
    ...part.holes,
  ]);
  const points = rings.flat();
  return {
    id: province.id,
    rings,
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
});
function onLand(x: number, y: number) {
  return provinces.some(
    (province) =>
      x >= province.minX &&
      x <= province.maxX &&
      y >= province.minY &&
      y <= province.maxY &&
      containsProvincePoint(province.id, x, y),
  );
}
function distanceToSegment(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const along = Math.max(
    0,
    Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(x - a.x - along * dx, y - a.y - along * dy);
}

test("Tüm dünya deniz bölgelerinin devriye, gövde ve dümen suyu diski gerçek kıyılardan uzaktadır", () => {
  for (const zone of Object.keys(SEA_ZONES) as SeaZone[]) {
    const anchor = SEA_ZONES[zone],
      layout = NAVAL_PRESENTATION[zone];
    const bound =
      layout.separation + layout.radius + NAVAL_FOOTPRINT_RADIUS * layout.scale;
    assert.equal(onLand(anchor.x, anchor.y), false, `${zone}: merkez karada`);
    assert.ok(
      Math.min(
        anchor.x,
        map.width - anchor.x,
        anchor.y,
        map.height - anchor.y,
      ) > bound,
      `${zone}: harita sınırı`,
    );
    // A water center farther from every polygon segment than this bound proves
    // the whole disk is water for ALL continuous phases, not only sampled frames.
    for (const province of provinces)
      for (const ring of province.rings)
        for (let index = 0; index < ring.length; index++)
          assert.ok(
            distanceToSegment(
              anchor.x,
              anchor.y,
              ring[index],
              ring[(index + 1) % ring.length],
            ) > bound,
            `${zone}: ${province.id} kıyısı devriye sınırı içinde`,
          );
  }
});

test("Filo yerleşimi yoğun filolarda bile bütün gövdeleri ve izleri suda ve birbirinden ayrı tutar", () => {
  for (const zone of Object.keys(SEA_ZONES) as SeaZone[])
    for (const count of [1, 4, 40, 160]) {
      const slots = navalFormationLayout(zone, count);
      assert.equal(slots.length, count);
      const presentation = NAVAL_PRESENTATION[zone];
      const waterRadius =
        presentation.separation +
        presentation.radius +
        NAVAL_FOOTPRINT_RADIUS * presentation.scale;
      const footprint =
        NAVAL_FOOTPRINT_RADIUS * presentation.scale * NAVAL_MODEL_SCALE;
      // A bound for every continuous animation phase, not only screenshot frames.
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        assert.ok(slot.scale > 0 && slot.scale <= 1);
        assert.ok(
          Math.hypot(slot.x, slot.y) +
            slot.patrolRadius +
            footprint * slot.scale <=
            waterRadius + 1e-9,
        );
        for (let j = 0; j < i; j++) {
          const other = slots[j];
          const closest =
            Math.hypot(slot.x - other.x, slot.y - other.y) -
            slot.patrolRadius -
            other.patrolRadius;
          assert.ok(
            closest > footprint * (slot.scale + other.scale),
            `${zone}: ${count} ships, ${i}/${j}`,
          );
        }
      }
      for (const index of new Set([
        0,
        Math.floor((count - 1) / 2),
        count - 1,
      ])) {
        const slot = slots[index];
        for (let frame = 0; frame < 8; frame++) {
          const pose = navalPatrolPose(
            zone,
            slot,
            (frame / 8) * Math.PI * 2,
            true,
          );
          assert.equal(onLand(pose.x, pose.y), false, `${zone}/${count}`);
          for (let edge = 0; edge < 8; edge++) {
            const angle = (edge / 8) * Math.PI * 2;
            assert.equal(
              onLand(
                pose.x + Math.cos(angle) * footprint * slot.scale,
                pose.y + Math.sin(angle) * footprint * slot.scale,
              ),
              false,
              `${zone}/${count}: ${frame}/${edge}`,
            );
          }
        }
        assert.deepEqual(
          navalPatrolPose(zone, slot, 0, false),
          navalPatrolPose(zone, slot, Math.PI, false),
          "Idle ships must not drift",
        );
      }
    }
});

test("Gerçek gemi geometrileri ve en büyük dümen suyu güvenlik zarfına sığar", () => {
  for (const model of [
    "carrier",
    "ship",
    "destroyer",
    "battleship",
    "submarine",
  ] as const) {
    const geometry = createAirNavalGeometry(model),
      positions = geometry.getAttribute("position"),
      scale = model === "battleship" ? 1.08 : model === "destroyer" ? 0.94 : 1;
    for (let index = 0; index < positions.count; index++) {
      // Include the maximum animated roll instead of trusting a flat footprint.
      for (const roll of [-0.015, 0.015]) {
        const x =
          positions.getX(index) * Math.cos(roll) -
          positions.getY(index) * Math.sin(roll);
        assert.ok(
          Math.hypot(x, positions.getZ(index)) * scale < NAVAL_FOOTPRINT_RADIUS,
        );
      }
    }
    geometry.dispose();
  }
  assert.ok((12 + 12) * 1.25 < NAVAL_FOOTPRINT_RADIUS);
});
