import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createCombatLighting,
  MAX_COMBAT_GLOWS,
  MAX_GROUND_GLOWS,
} from "./map3d-combat-lighting";

const pointLights = (scene: THREE.Scene) => {
  const result: THREE.PointLight[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.PointLight) result.push(object);
  });
  return result;
};
const batch = (scene: THREE.Scene, name: string) =>
  scene.getObjectByName(name) as THREE.InstancedMesh;
const positionAt = (mesh: THREE.InstancedMesh, index = 0) => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
};

test("Combat glow follows actual supplied muzzle/projectile positions and samples the terrain", () => {
  const scene = new THREE.Scene();
  const lighting = createCombatLighting(scene, (x, z) => x * 0.1 + z * 0.2);
  const muzzle = new THREE.Vector3(10, 14, 20);
  const projectile = new THREE.Vector3(20, 22, 30);
  lighting.begin("low", 450);
  lighting.emit(muzzle, 5, 1, "muzzle");
  lighting.emit(projectile, 3, 0.8, "projectile");
  lighting.finish();
  assert.deepEqual(lighting.stats, {
    glows: 2,
    groundGlows: 1,
    dynamicLights: 0,
    headlights: 0,
  });
  assert.deepEqual(positionAt(batch(scene, "unit-combat-glows")), muzzle);
  assert.deepEqual(
    positionAt(batch(scene, "unit-combat-glows"), 1),
    projectile,
  );
  assert.deepEqual(
    positionAt(batch(scene, "unit-ground-glows")),
    new THREE.Vector3(10, 5.25, 20),
  );
  assert.ok(
    pointLights(scene).every((light) => !light.visible && !light.castShadow),
  );
  const material = batch(scene, "unit-combat-glows")
    .material as THREE.ShaderMaterial;
  assert.equal(material.blending, THREE.AdditiveBlending);
  assert.equal(material.toneMapped, false);
  assert.equal(material.depthWrite, false);
  lighting.dispose();
});

test("High/Ultra illuminate surfaces with only 2/4 pooled shadowless lights and prioritize shots", () => {
  const scene = new THREE.Scene();
  const lighting = createCombatLighting(scene);
  const point = new THREE.Vector3(10, 8, 12);
  const ids = pointLights(scene).map((light) => light.uuid);
  for (const [quality, expected] of [
    ["medium", 0],
    ["high", 2],
    ["ultra", 4],
  ] as const) {
    lighting.begin(quality, 450);
    for (let i = 0; i < 30; i++)
      lighting.emit(point.set(i, 8, 12), 4, 0.55, "headlamp");
    lighting.emit(point.set(100, 10, 100), 7, 1.2, "muzzle");
    lighting.finish();
    assert.equal(lighting.stats.dynamicLights, expected);
    const enabled = pointLights(scene).filter(
      (light) => light.visible && light.intensity > 0,
    );
    assert.equal(enabled.length, expected);
    assert.ok(
      enabled.every((light) => !light.castShadow && light.distance > 0),
    );
    if (expected)
      assert.ok(
        enabled.some(
          (light) => light.position.equals(point) && light.intensity > 500,
        ),
      );
    assert.deepEqual(
      pointLights(scene).map((light) => light.uuid),
      ids,
    );
  }
  lighting.begin("ultra", 1800);
  lighting.emit(point, 7, 1.2, "muzzle");
  lighting.finish();
  assert.equal(lighting.stats.dynamicLights, 0);
  assert.equal(lighting.stats.glows, 1);
  lighting.dispose();
});

test("Glow batches remain bounded in mass battles, reject invalid events, and clear without stale light", () => {
  const scene = new THREE.Scene();
  const lighting = createCombatLighting(scene, () => 0);
  lighting.begin("ultra", 500);
  for (let i = 0; i < 2000; i++)
    lighting.emit(new THREE.Vector3(i, 8, 10), 5, 1, "impact");
  lighting.finish();
  assert.equal(lighting.stats.glows, MAX_COMBAT_GLOWS);
  assert.equal(lighting.stats.groundGlows, MAX_GROUND_GLOWS);
  assert.equal(pointLights(scene).length, 4);
  assert.ok(lighting.stats.dynamicLights <= 4);
  lighting.begin("high", 500);
  lighting.emit(new THREE.Vector3(NaN, 0, 0), 5, 1, "impact");
  lighting.emit(new THREE.Vector3(), -1, 1, "muzzle");
  lighting.finish();
  assert.deepEqual(lighting.stats, {
    glows: 0,
    groundGlows: 0,
    dynamicLights: 0,
    headlights: 0,
  });
  assert.equal(batch(scene, "unit-combat-glows").visible, false);
  assert.equal(batch(scene, "unit-ground-glows").visible, false);
  // Configured light visibility stays constant between flash cycles: no shader churn.
  assert.equal(pointLights(scene).filter((light) => light.visible).length, 2);
  assert.ok(pointLights(scene).every((light) => light.intensity === 0));
  lighting.dispose();
});

test("Illumination resources are owned once and disposal cannot leave light in the scene", () => {
  const scene = new THREE.Scene();
  const lighting = createCombatLighting(scene, () => 0);
  let geometryCount = 0,
    materialCount = 0;
  for (const name of ["unit-combat-glows", "unit-ground-glows"]) {
    const mesh = batch(scene, name);
    mesh.geometry.addEventListener("dispose", () => geometryCount++);
    (mesh.material as THREE.Material).addEventListener(
      "dispose",
      () => materialCount++,
    );
  }
  lighting.begin("ultra", 400);
  lighting.emit(new THREE.Vector3(0, 10, 0), 8, 1.2, "impact");
  lighting.finish();
  lighting.dispose();
  lighting.dispose();
  lighting.begin("ultra", 400);
  lighting.emit(new THREE.Vector3(0, 10, 0), 8, 1.2, "impact");
  lighting.finish();
  assert.equal(scene.children.length, 0);
  assert.equal(geometryCount, 2);
  assert.equal(materialCount, 2);
  assert.equal(lighting.stats.glows + lighting.stats.dynamicLights, 0);
});
