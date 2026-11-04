import { test } from "node:test";
import assert from "node:assert/strict";
import { SEA_ZONES } from "./advanced-catalog";
import { containsProvincePoint, provincePolygons } from "./map3d-geometry";
import { createAirNavalGeometry } from "./map3d-airnaval-models";
import { airNavalPhase } from "./map3d-airnaval-state";
import {
  NAVAL_FOOTPRINT_RADIUS,
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

test("Her ülkenin tüm devriye evrelerinde gövde ve dümen suyu örnekleri yalnızca suda kalır", () => {
  for (const zone of Object.keys(SEA_ZONES) as SeaZone[])
    for (const country of map.countries)
      for (const unitPhase of [0, 1])
        for (let frame = 0; frame < 24; frame++) {
          const pose = navalPatrolPose(
            zone,
            unitPhase,
            airNavalPhase(country.id),
            (frame / 24) * Math.PI * 2,
          );
          assert.equal(onLand(pose.x, pose.y), false, `${zone}/${country.id}`);
          for (let edge = 0; edge < 8; edge++) {
            const angle = (edge / 8) * Math.PI * 2,
              footprint =
                NAVAL_FOOTPRINT_RADIUS * NAVAL_PRESENTATION[zone].scale;
            assert.equal(
              onLand(
                pose.x + Math.cos(angle) * footprint,
                pose.y + Math.sin(angle) * footprint,
              ),
              false,
              `${zone}/${country.id}: ${frame}/${edge}`,
            );
          }
        }
});

test("Gerçek gemi geometrileri ve en büyük dümen suyu güvenlik zarfına sığar", () => {
  for (const model of ["carrier", "ship", "submarine"] as const) {
    const geometry = createAirNavalGeometry(model),
      positions = geometry.getAttribute("position"),
      scale = model === "ship" ? 1.25 : 1;
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
