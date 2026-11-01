import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Army, UnitType } from "./types";
import {
  createUnitModels,
  MAX_UNIT_MINIATURES,
  UNIT_MODEL_SCALE,
  UNIT_LABEL_HEIGHT,
  type UnitFormation,
} from "./map3d-units";

const army = (type: UnitType, id: string = type): Army =>
  ({ id, type }) as Army;
const formation = (types: UnitType[], moving = false): UnitFormation => ({
  armies: types.map((type, i) => army(type, `${type}-${i}`)),
  position: new THREE.Vector3(25, 12, 30),
  angle: Math.PI / 4,
  moving,
  tint: 0xcb4848,
});
const settings = { quality: "medium" as const, distance: 450 };

test("3D birlikler gerçek tümen türlerine göre ayrılır; kalabalık tek bir asker olarak çizilmez", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  const groups = [
    formation(["infantry", "infantry", "infantry"]),
    formation(["lightTank", "motorized", "artillery"]),
  ];
  const before = JSON.stringify(groups);
  models.update(groups, 100, settings);
  assert.equal(models.stats.infantry, 3);
  assert.equal(models.stats.vehicles, 3);
  assert.equal(
    scene.children.length,
    7,
    "all miniatures use only seven shared draw batches",
  );
  const meshes = scene.children as THREE.InstancedMesh[];
  assert.equal(
    meshes[1].count,
    6,
    "each infantry miniature has two independently animated legs",
  );
  assert.equal(meshes[2].count, 1);
  assert.equal(meshes[3].count, 1);
  assert.equal(meshes[4].count, 1);
  assert.equal(
    JSON.stringify(groups),
    before,
    "rendering does not change campaign formations",
  );
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute("position");
    for (const value of positions.array) assert.ok(Number.isFinite(value));
    assert.ok(positions.count < 12000, `${mesh.name}: bounded source mesh`);
  }
  const bodyBounds = meshes[0].geometry.boundingBox!;
  assert.ok(
    bodyBounds.max.y * UNIT_MODEL_SCALE < UNIT_LABEL_HEIGHT,
    "labels clear the helmet",
  );
  assert.ok(
    bodyBounds.max.y * UNIT_MODEL_SCALE > 10,
    "infantry is substantially larger than the old capsule figure",
  );
  models.dispose();
});

test("yürüme gerçek hareket durumunu izler; duraklatma ve azaltılmış hareket animasyonu sabitler", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  const group = formation(["infantry"], true);
  const legs = scene.children[1] as THREE.InstancedMesh;
  models.update([group], 0, settings);
  const first = Array.from(legs.instanceMatrix.array.slice(0, 32));
  models.update([group], 120, settings);
  assert.notDeepEqual(
    Array.from(legs.instanceMatrix.array.slice(0, 32)),
    first,
  );
  models.update([group], 300, { ...settings, paused: true });
  const paused = Array.from(legs.instanceMatrix.array.slice(0, 32));
  models.update([group], 800, { ...settings, paused: true });
  assert.deepEqual(Array.from(legs.instanceMatrix.array.slice(0, 32)), paused);
  models.update([group], 900, { ...settings, reduced: true });
  assert.deepEqual(Array.from(legs.instanceMatrix.array.slice(0, 32)), paused);
  models.dispose();
});

test("dağılan askerlerin her biri kendi ayak konumundaki eğimli araziye oturur", () => {
  const scene = new THREE.Scene();
  const ground = (x: number, z: number) => 20 + x * 0.08 + z * 0.03;
  const models = createUnitModels(scene, ground);
  models.update([formation(["infantry", "infantry", "infantry"])], 0, {
    ...settings,
    paused: true,
  });
  const body = scene.children[0] as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const heights = new Set<number>();
  for (let i = 0; i < body.count; i++) {
    body.getMatrixAt(i, matrix);
    const [x, y, z] = matrix.elements.slice(12, 15);
    assert.ok(Math.abs(y - ground(x, z)) < 0.00001);
    heights.add(y);
  }
  assert.equal(heights.size, 3);
  models.dispose();
});

test("ülke rengi üniformayı boyamaz; yakın ayrıntı LOD'u kaynakları yeniden oluşturmaz", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  const group = formation(["infantry"]);
  const meshes = scene.children as THREE.InstancedMesh[];
  const ids = meshes.map((mesh) => mesh.geometry.uuid);
  const clothColors = Array.from(
    meshes[0].geometry.getAttribute("color").array,
  );
  models.update([group], 1, settings);
  assert.equal(models.stats.detail, true);
  const accentBefore = Array.from(meshes[6].instanceColor!.array.slice(0, 3));
  group.tint = 0x2852cc;
  models.update([group], 2, { quality: "low", distance: 1400 });
  assert.equal(models.stats.detail, false);
  assert.equal(meshes[5].count, 0);
  assert.equal(meshes[0].instanceColor, null);
  assert.deepEqual(
    Array.from(meshes[0].geometry.getAttribute("color").array),
    clothColors,
  );
  assert.notDeepEqual(
    Array.from(meshes[6].instanceColor!.array.slice(0, 3)),
    accentBefore,
  );
  assert.deepEqual(
    meshes.map((mesh) => mesh.geometry.uuid),
    ids,
  );
  models.dispose();
});

test("büyük ordular sabit örnek sınırını aşmaz; tekrar dispose tüm geometri ve materyalleri bir kez bırakır", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  const group = formation(["infantry"]);
  const groups = Array.from({ length: MAX_UNIT_MINIATURES + 5 }, () => group);
  const meshes = scene.children as THREE.InstancedMesh[];
  const geometries = new Set(meshes.map((mesh) => mesh.geometry));
  const materials = new Set(
    meshes.map((mesh) => mesh.material as THREE.Material),
  );
  let releasedGeometry = 0,
    releasedMaterial = 0;
  geometries.forEach((g) =>
    g.addEventListener("dispose", () => releasedGeometry++),
  );
  materials.forEach((m) =>
    m.addEventListener("dispose", () => releasedMaterial++),
  );
  models.update(groups, 100, { quality: "low", distance: 1500 });
  assert.equal(models.stats.infantry, MAX_UNIT_MINIATURES);
  for (const mesh of meshes) assert.ok(mesh.count <= mesh.instanceMatrix.count);
  models.dispose();
  models.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(releasedGeometry, geometries.size);
  assert.equal(releasedMaterial, materials.size);
});
