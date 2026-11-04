import assert from "node:assert/strict";
import { test } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import {
  fitMapDistance,
  mapCameraFar,
  terrainAtlasSize,
} from "./map-camera-bounds";
import map from "./map-data.json";
import assets from "./map-assets.json";

for (const [width, height] of [
  [1320, 880],
  [5400, 3300],
]) {
  test(`${width}×${height} atlas fits desktop and portrait 3D cameras without cutting continents`, () => {
    for (const aspect of [0.3, 390 / 844, 1, 16 / 9, 3]) {
      const distance = fitMapDistance(width, height, aspect);
      const camera = new PerspectiveCamera(
        42,
        aspect,
        0.5,
        mapCameraFar(width, height),
      );
      for (const slope of [
        [0, 0.98, 0.22],
        [0, 0.82, 0.68],
      ]) {
        camera.position
          .set(...(slope as [number, number, number]))
          .normalize()
          .multiplyScalar(distance);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        for (const x of [-width / 2, width / 2])
          for (const z of [-height / 2, height / 2]) {
            const point = new Vector3(x, 0, z).project(camera);
            assert.ok(
              Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1,
              `${aspect}: ${point.toArray()}`,
            );
            assert.ok(
              point.z > -1 && point.z < 1,
              "The far plane must include both map edges",
            );
          }
      }
    }
  });
}

test("global atlas texture stays within 4096 pixels with its geographic aspect ratio", () => {
  assert.deepEqual(terrainAtlasSize(1320, 880), { width: 2640, height: 1760 });
  const world = terrainAtlasSize(5400, 3300);
  assert.equal(world.width, 4096);
  assert.equal(world.height, 2503);
  assert.ok(Math.abs(world.width / world.height - 5400 / 3300) < 0.001);
  assert.ok(world.width * world.height * 4 < 42 * 1024 * 1024);
});

test("the shipped terrain overlay is regenerated for the active map extent", () => {
  assert.deepEqual(
    { width: assets.terrain.width, height: assets.terrain.height },
    terrainAtlasSize(map.width, map.height),
    "Regenerate render-terrain.cjs after changing the geographic projection",
  );
});
