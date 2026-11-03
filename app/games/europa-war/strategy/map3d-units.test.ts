import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Army } from "./types";
import { INFANTRY_NECK_PIVOT } from "./map3d-land-models";
import { getUnitVisualResearch } from "./map3d-unit-research";
import {
  createUnitModels,
  MAX_UNIT_MINIATURES,
  MAX_UNIT_EFFECTS,
  UNIT_MODEL_SCALE,
  UNIT_LABEL_HEIGHT,
  unitDisplayLayout,
  type UnitFormation,
} from "./map3d-units";

const formation = (count: number, moving = false): UnitFormation => ({
  armies: Array.from(
    { length: count },
    (_, i) =>
      ({ id: `army-${i}`, type: i % 2 ? "heavyTank" : "infantry" }) as Army,
  ),
  position: new THREE.Vector3(25, 12, 30),
  angle: Math.PI / 4,
  moving,
  tint: 0xcb4848,
});
const settings = { quality: "medium" as const, distance: 450 };
const mesh = (scene: THREE.Scene, name: string) =>
  scene.getObjectByName(`unit-${name}`) as THREE.InstancedMesh;
const matrices = (scene: THREE.Scene, name: string) => {
  const m = mesh(scene, name);
  return Array.from(m.instanceMatrix.array.slice(0, m.count * 16));
};
const allMeshes = (scene: THREE.Scene) => {
  const result: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) result.push(object);
  });
  return result;
};
const sceneSnapshot = (scene: THREE.Scene) =>
  allMeshes(scene).map((m) => {
    return {
      name: m.name,
      count: m.count,
      matrix: Array.from(m.instanceMatrix.array.slice(0, m.count * 16)),
    };
  });

test("1/2/3/4/12 tümen, gerçek tipleri değiştirmeden tam istenen sayı sembollerini yakın ve uzak çizer", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  const cases = [
    { count: 1, kinds: ["infantry"], counts: [1, 0, 0, 0] },
    { count: 2, kinds: ["tank", "infantry"], counts: [1, 1, 0, 0] },
    {
      count: 3,
      kinds: ["artillery", "infantry", "tank"],
      counts: [1, 1, 1, 0],
    },
    {
      count: 4,
      kinds: ["truck", "infantry", "artillery", "tank"],
      counts: [1, 1, 1, 1],
    },
    {
      count: 12,
      kinds: ["truck", "infantry", "artillery", "tank"],
      counts: [1, 1, 1, 1],
    },
  ];
  for (const item of cases)
    for (const options of [
      settings,
      { quality: "low" as const, distance: 1800 },
    ]) {
      const group = formation(item.count),
        before = JSON.stringify(group);
      assert.deepEqual(
        unitDisplayLayout(item.count).map((s) => s.kind),
        item.kinds,
      );
      models.update([group], 100, options);
      assert.deepEqual(
        [
          models.stats.infantry,
          models.stats.tanks,
          models.stats.artillery,
          models.stats.trucks,
        ],
        item.counts,
      );
      assert.equal(JSON.stringify(group), before);
    }
  assert.equal(unitDisplayLayout(0).length, 0);
  assert.equal(unitDisplayLayout(NaN).length, 0);
  assert.equal(
    scene.children.filter((object) => object instanceof THREE.InstancedMesh)
      .length,
    22,
    "shared batches do not grow with army count",
  );
  for (const m of scene.children.filter(
    (object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh,
  )) {
    for (const name of ["position", "normal"])
      for (const value of m.geometry.getAttribute(name).array)
        assert.ok(Number.isFinite(value), m.name);
    assert.ok(m.geometry.getAttribute("position").count < 12000, m.name);
  }
  const bounds = mesh(scene, "infantry-head").geometry.boundingBox!;
  const fullHeight = (bounds.max.y + INFANTRY_NECK_PIVOT[1]) * UNIT_MODEL_SCALE;
  assert.ok(fullHeight > 10 && fullHeight < UNIT_LABEL_HEIGHT);
  models.dispose();
});

test("takviye geldiğinde mevcut semboller sabit tip yuvalarında kalır", () => {
  const all = unitDisplayLayout(4);
  for (const count of [1, 2, 3])
    for (const slot of unitDisplayLayout(count)) {
      const existing = all.find((s) => s.kind === slot.kind)!;
      assert.equal(slot.x, existing.x);
      assert.equal(slot.z, existing.z);
    }
});

test("her tür hareket animasyonu oynatır; hareketsiz durumda kendi kendine yürümez veya ateş etmez", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(4, true);
  models.update([group], 0, settings);
  const names = [
    "infantry-legs",
    "tank-treads",
    "vehicle-wheels",
    "truck-body",
  ];
  const before = names.map((name) => matrices(scene, name));
  models.update([group], 180, settings);
  names.forEach((name, i) =>
    assert.notDeepEqual(matrices(scene, name), before[i], name),
  );
  assert.equal(
    models.stats.muzzleFlashes +
      models.stats.shells +
      models.stats.impacts +
      models.stats.infantryTracers +
      models.stats.tankShells,
    0,
  );
  group.moving = false;
  models.update([group], 300, settings);
  const stationaryParts = () =>
    sceneSnapshot(scene).filter((part) => !part.name.includes("infantry-head"));
  const idle = stationaryParts();
  models.update([group], 550, settings);
  assert.deepEqual(stationaryParts(), idle);
  models.dispose();
});

test("gerçek çatışma tanımı tüfek ve tank tepkisini, top mermisi yayını, etkiyi ve kamyon desteğini açar", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(4);
  group.combat = { key: "battle-1", target: new THREE.Vector3(80, 12, 60) };
  const before = JSON.stringify(group);
  let flashes = 0,
    shellCount = 0,
    impacts = 0,
    maxHeight = -Infinity;
  let firstBarrel: number[] | undefined,
    barrelMoved = false;
  for (let tick = 0; tick < 100; tick++) {
    models.update([group], tick * 100, settings);
    flashes += models.stats.muzzleFlashes;
    shellCount += models.stats.shells;
    impacts += models.stats.impacts;
    const barrel = matrices(scene, "tank-barrel");
    if (firstBarrel && JSON.stringify(firstBarrel) !== JSON.stringify(barrel))
      barrelMoved = true;
    firstBarrel ??= barrel;
    assert.ok(
      mesh(scene, "support-crates").count > 0,
      "truck handles supplies only during an actual event",
    );
    const shells = mesh(scene, "artillery-shells");
    if (shells.count)
      maxHeight = Math.max(maxHeight, shells.instanceMatrix.array[13]);
  }
  assert.ok(flashes > 0 && shellCount > 0 && impacts > 0 && barrelMoved);
  assert.ok(
    maxHeight > 24,
    "shell rises above its source/target along a visible ballistic arc",
  );
  assert.equal(
    JSON.stringify(group),
    before,
    "effects cannot inflict damage or alter routes/army types",
  );
  group.combat = undefined;
  models.update([group], 10100, settings);
  assert.equal(
    models.stats.combatFormations +
      models.stats.muzzleFlashes +
      models.stats.shells +
      models.stats.impacts,
    0,
  );
  assert.equal(mesh(scene, "support-crates").count, 0);
  models.dispose();
});

test("duraklatma ve azaltılmış hareket yürüyüşü, taret tepkisini ve uçan mermileri dondurur", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(4, true);
  group.combat = {
    key: "battle-freeze",
    target: new THREE.Vector3(70, 12, 70),
  };
  for (let tick = 0; tick < 5; tick++)
    models.update([group], tick * 100, settings);
  const active = sceneSnapshot(scene);
  models.update([group], 900, { ...settings, paused: true });
  assert.deepEqual(sceneSnapshot(scene), active);
  models.update([group], 1900, { ...settings, paused: true });
  assert.deepEqual(sceneSnapshot(scene), active);
  models.update([group], 2400, { ...settings, reduced: true });
  assert.deepEqual(sceneSnapshot(scene), active);
  models.dispose();
});

test("tek piyadenin çatışması kısa flaş yerine iz mermisi, duruş, geri tepme ve isabet gösterir", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(1);
  const options = { quality: "low" as const, distance: 1000 };
  models.update([group], 0, options);
  const idle = matrices(scene, "infantry-body");
  group.combat = { key: "rifle-only", target: new THREE.Vector3(90, 12, 80) };
  const before = JSON.stringify(group);
  models.update([group], 500, options);
  assert.notDeepEqual(
    matrices(scene, "infantry-body"),
    idle,
    "rifleman braces to fire",
  );
  assert.equal(models.stats.muzzleFlashes, 1);
  const body = new THREE.Matrix4();
  mesh(scene, "infantry-body").getMatrixAt(0, body);
  const muzzle = new THREE.Vector3(0.37, 2.9, 1.97).applyMatrix4(body);
  const flash = new THREE.Matrix4();
  mesh(scene, "muzzle-flashes").getMatrixAt(0, flash);
  assert.ok(
    muzzle.distanceTo(new THREE.Vector3().setFromMatrixPosition(flash)) <
      0.00001,
    "flash is attached to the rifle after the actual brace/recoil transform",
  );
  models.update([group], 700, options);
  assert.equal(
    models.stats.muzzleFlashes,
    1,
    "flash survives a 200ms frame interval",
  );
  assert.equal(models.stats.infantryTracers, 1);
  const firstTrace = matrices(scene, "infantry-tracers");
  models.update([group], 1000, options);
  assert.equal(models.stats.muzzleFlashes, 0);
  assert.equal(
    models.stats.infantryTracers,
    1,
    "visible trace continues after muzzle flash",
  );
  assert.notDeepEqual(
    matrices(scene, "infantry-tracers"),
    firstTrace,
    "trace travels toward target",
  );
  assert.equal(
    models.stats.artillery + models.stats.shells + models.stats.tankShells,
    0,
  );
  models.update([group], 1500, options);
  models.update([group], 2000, options);
  assert.ok(models.stats.impacts > 0, "rifle hit raises a visible impact");
  assert.equal(
    JSON.stringify(group),
    before,
    "effects do not mutate armies or battle state",
  );
  models.dispose();
});

test("iki tümen tank mermisi ve piyade izi gösterir; duraklatma, azaltılmış hareket ve savaş sonu güvenlidir", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(2);
  group.combat = {
    key: "two-division-battle",
    target: new THREE.Vector3(110, 12, 70),
  };
  models.update([group], 0, settings);
  const barrel = new THREE.Matrix4(),
    flash = new THREE.Matrix4();
  mesh(scene, "tank-barrel").getMatrixAt(0, barrel);
  mesh(scene, "muzzle-flashes").getMatrixAt(0, flash);
  const muzzle = new THREE.Vector3(0, 2.3, 4.21).applyMatrix4(barrel);
  assert.ok(
    muzzle.distanceTo(new THREE.Vector3().setFromMatrixPosition(flash)) <
      0.00001,
    "tank flash follows rotated turret and recoil exactly",
  );
  models.update([group], 500, settings);
  assert.equal(models.stats.infantryTracers, 1);
  assert.equal(models.stats.tankShells, 1);
  assert.equal(
    models.stats.shells,
    0,
    "two-division group has no artillery symbol",
  );
  const firstShell = matrices(scene, "tank-shells");
  models.update([group], 1000, settings);
  assert.equal(models.stats.tankShells, 1);
  assert.notDeepEqual(matrices(scene, "tank-shells"), firstShell);
  const frozen = sceneSnapshot(scene);
  models.update([group], 1500, { ...settings, paused: true });
  assert.deepEqual(sceneSnapshot(scene), frozen);
  models.update([group], 2000, { ...settings, reduced: true });
  assert.deepEqual(sceneSnapshot(scene), frozen);
  models.update([group], 2500, settings);
  assert.deepEqual(
    sceneSnapshot(scene),
    frozen,
    "resuming does not consume paused time",
  );
  assert.equal(
    models.stats.tankShells,
    1,
    "tank shell lasts longer than a single slow frame",
  );
  models.update([group], 3000, settings);
  models.update([group], 3500, settings);
  models.update([group], 4000, settings);
  assert.equal(models.stats.tankShells, 0);
  assert.ok(models.stats.impacts > 0);
  group.combat = undefined;
  models.update([group], 4500, settings);
  assert.equal(
    models.stats.muzzleFlashes +
      models.stats.infantryTracers +
      models.stats.tankShells +
      models.stats.shells +
      models.stats.impacts,
    0,
  );
  for (const name of ["infantry-tracers", "tank-shells", "shell-impacts"])
    assert.equal(mesh(scene, name).visible, false);
  models.dispose();
});

test("uzun süredir açık haritada 2 FPS ile başlayan kısa savaş ilk iki çizimde top mermisini gösterir", () => {
  for (const idleFrames of [0, 73, 14_401]) {
    const scene = new THREE.Scene(),
      models = createUnitModels(scene),
      group = formation(4);
    let now = 1_000_000;
    models.update([], now, settings);
    for (let i = 0; i < idleFrames; i++)
      models.update([], (now += 500), settings);
    const key = `battle-${idleFrames}-${"Türkiye-Bulgaristan-1936-".repeat(40)}`;
    group.combat = { key, target: new THREE.Vector3(80, 12, 60) };
    models.update([group], (now += 500), settings);
    assert.equal(
      models.stats.muzzleFlashes,
      3,
      "all weapons fire on battle entry",
    );
    models.update([group], (now += 500), settings);
    assert.equal(
      models.stats.shells,
      1,
      "next 2-FPS frame must show the shell",
    );
    const initialShell = matrices(scene, "artillery-shells");
    models.update([group], (now += 500), settings);
    assert.equal(models.stats.shells, 1);
    assert.notDeepEqual(matrices(scene, "artillery-shells"), initialShell);
    const frozen = sceneSnapshot(scene);
    models.update([group], (now += 500), { ...settings, paused: true });
    assert.deepEqual(sceneSnapshot(scene), frozen);
    models.update([group], (now += 500), { ...settings, reduced: true });
    assert.deepEqual(sceneSnapshot(scene), frozen);
    group.combat = undefined;
    models.update([group], (now += 500), settings);
    assert.equal(models.stats.shells + models.stats.muzzleFlashes, 0);
    // Reusing the same ID after its battle disappeared must start fresh; an
    // abandoned per-battle clock would silently skip the first shot here.
    group.combat = { key, target: new THREE.Vector3(80, 12, 60) };
    models.update([group], (now += 500), settings);
    assert.equal(models.stats.muzzleFlashes, 3);
    models.update([group], (now += 500), settings);
    assert.equal(models.stats.shells, 1);
    models.dispose();
  }
});

test("eşzamanlı savaşlar hemen ateş eder fakat sonraki top atışları olay kimliğine göre ayrışır", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    a = formation(3),
    b = formation(3);
  a.combat = { key: "battle-A", target: new THREE.Vector3(80, 12, 60) };
  b.combat = { key: "battle-B", target: new THREE.Vector3(80, 12, 60) };
  models.update([a, b], 0, settings);
  assert.equal(models.stats.muzzleFlashes, 6);
  let separated = false;
  for (let tick = 1; tick <= 65; tick++) {
    models.update([a, b], tick * 100, settings);
    if (tick < 44) continue;
    const barrels = matrices(scene, "artillery-barrel");
    if (barrels.slice(0, 16).some((v, i) => v !== barrels[i + 16]))
      separated = true;
  }
  assert.ok(separated, "later recoil cycles must not remain synchronized");
  models.dispose();
});

test("yalnız gerçek ele geçirme olayı bayrağı yükseltir; pause ilerlemeyi korur ve olay bitince gösterim temizlenir", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(4);
  models.update([group], 0, settings);
  assert.equal(models.stats.captures, 0);
  group.capture = { key: "captured-town", progress: 0.05 };
  models.update([group], 100, settings);
  const rising = matrices(scene, "capture-flags");
  assert.equal(
    (mesh(scene, "capture-flags").material as THREE.Material).side,
    THREE.DoubleSide,
    "the capture cloth remains visible from either camera side",
  );
  assert.equal(models.stats.captures, 1);
  group.capture.progress = 0.5;
  models.update([group], 200, settings);
  assert.notDeepEqual(matrices(scene, "capture-flags"), rising);
  const held = sceneSnapshot(scene);
  group.capture.progress = 0.9;
  models.update([group], 900, { ...settings, paused: true });
  assert.deepEqual(sceneSnapshot(scene), held);
  group.capture = undefined;
  models.update([group], 1000, settings);
  assert.equal(models.stats.captures, 0);
  assert.equal(mesh(scene, "capture-poles").count, 0);
  assert.equal(mesh(scene, "capture-flags").count, 0);
  models.dispose();
});

test("dört farklı model kendi konumundaki eğimli araziye basar", () => {
  const scene = new THREE.Scene(),
    ground = (x: number, z: number) => 20 + x * 0.08 + z * 0.03,
    models = createUnitModels(scene, ground);
  models.update([formation(4)], 0, { ...settings, paused: true });
  const matrix = new THREE.Matrix4(),
    heights = new Set<number>();
  for (const name of [
    "infantry-body",
    "tank-hull",
    "truck-body",
    "artillery-base",
  ]) {
    mesh(scene, name).getMatrixAt(0, matrix);
    const [x, y, z] = matrix.elements.slice(12, 15);
    assert.ok(Math.abs(y - ground(x, z)) < 0.00001);
    heights.add(y);
  }
  assert.equal(heights.size, 4);
  models.dispose();
});

test("ülke rengi yalnız yamayı değiştirir; uzak LOD modelleri eksiltmez veya geometriyi yeniden yaratmaz", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(12);
  models.update([group], 0, settings);
  const ids = allMeshes(scene).map((m) => m.geometry.uuid),
    cloth = Array.from(
      mesh(scene, "infantry-body").geometry.getAttribute("color").array,
    );
  const color = Array.from(
    mesh(scene, "country-patches").instanceColor!.array.slice(0, 12),
  );
  group.tint = 0x2852cc;
  models.update([group], 100, { quality: "low", distance: 1800 });
  assert.equal(models.stats.detail, false);
  assert.equal(mesh(scene, "infantry-details").count, 0);
  assert.deepEqual(
    [
      models.stats.infantry,
      models.stats.tanks,
      models.stats.artillery,
      models.stats.trucks,
    ],
    [1, 1, 1, 1],
  );
  assert.equal(mesh(scene, "infantry-body").instanceColor, null);
  assert.deepEqual(
    Array.from(
      mesh(scene, "infantry-body").geometry.getAttribute("color").array,
    ),
    cloth,
  );
  assert.notDeepEqual(
    Array.from(
      mesh(scene, "country-patches").instanceColor!.array.slice(0, 12),
    ),
    color,
  );
  assert.deepEqual(
    allMeshes(scene).map((m) => m.geometry.uuid),
    ids,
  );
  models.dispose();
});

test("çok büyük savaşta modeller ve efektler kapasiteyi aşmaz; dispose her kaynağı bir kez bırakır", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(4);
  group.combat = { key: "large-battle", target: new THREE.Vector3(80, 12, 60) };
  group.capture = { key: "large-capture", progress: 0.2 };
  const groups = Array.from(
    { length: MAX_UNIT_MINIATURES / 4 + 5 },
    () => group,
  );
  models.update(groups, 0, { quality: "low", distance: 1500 });
  const meshes = allMeshes(scene),
    geometries = new Set(meshes.map((m) => m.geometry)),
    materials = new Set(meshes.map((m) => m.material as THREE.Material));
  let releasedGeometry = 0,
    releasedMaterial = 0;
  geometries.forEach((g) =>
    g.addEventListener("dispose", () => releasedGeometry++),
  );
  materials.forEach((m) =>
    m.addEventListener("dispose", () => releasedMaterial++),
  );
  assert.equal(
    models.stats.infantry + models.stats.vehicles,
    MAX_UNIT_MINIATURES,
  );
  assert.equal(models.stats.infantry, models.stats.tanks);
  assert.equal(models.stats.tanks, models.stats.artillery);
  assert.equal(models.stats.artillery, models.stats.trucks);
  for (const m of meshes) assert.ok(m.count <= m.instanceMatrix.count, m.name);
  for (const count of [
    models.stats.shells,
    models.stats.infantryTracers,
    models.stats.tankShells,
    models.stats.muzzleFlashes,
    models.stats.impacts,
    models.stats.captures,
  ])
    assert.ok(count <= MAX_UNIT_EFFECTS);
  models.update(groups, 250, { quality: "low", distance: 1500 });
  assert.equal(models.stats.infantryTracers, MAX_UNIT_EFFECTS);
  assert.equal(models.stats.tankShells, MAX_UNIT_EFFECTS);
  for (const m of meshes) assert.ok(m.count <= m.instanceMatrix.count, m.name);
  models.update([], 100, settings);
  assert.ok(meshes.every((m) => !m.visible));
  models.dispose();
  models.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(releasedGeometry, geometries.size);
  assert.equal(releasedMaterial, materials.size);
  assert.equal(models.stats.instances, 0);
});

test("Gerçek çatışma ışığı namlu ve mermiyle birlikte ilerler; duraklatma sabitler, temas bitince söner", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene, () => 12),
    group = formation(4);
  models.update([group], 0, { quality: "high", distance: 450 });
  assert.equal(
    models.stats.glows +
      models.stats.groundGlows +
      models.stats.dynamicLights +
      models.stats.headlights,
    0,
  );
  group.combat = {
    key: "night-battle",
    target: new THREE.Vector3(100, 12, 80),
  };
  models.update([group], 100, { quality: "high", distance: 450 });
  assert.equal(models.stats.muzzleFlashes, 3);
  assert.equal(models.stats.headlights, 2);
  assert.equal(models.stats.glows, 5);
  assert.equal(models.stats.groundGlows, 5);
  assert.equal(models.stats.dynamicLights, 2);
  models.update([group], 300, { quality: "high", distance: 450 });
  assert.ok(
    models.stats.infantryTracers > 0 &&
      models.stats.tankShells > 0 &&
      models.stats.shells > 0,
  );
  assert.ok(models.stats.glows > 5);
  const active = sceneSnapshot(scene);
  const stats = { ...models.stats };
  models.update([group], 1900, {
    quality: "high",
    distance: 450,
    paused: true,
  });
  assert.deepEqual(sceneSnapshot(scene), active);
  assert.deepEqual(models.stats, stats);
  models.update([group], 2900, {
    quality: "high",
    distance: 450,
    reduced: true,
  });
  assert.deepEqual(sceneSnapshot(scene), active);
  group.combat = undefined;
  models.update([group], 3000, { quality: "high", distance: 450 });
  assert.equal(
    models.stats.glows +
      models.stats.groundGlows +
      models.stats.dynamicLights +
      models.stats.headlights,
    0,
  );
  models.dispose();
});

test("Kamyon farları gerçek hareket/destekle açılır; durağan birlik veya yüklenen boş sahne ateş üretmez", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene, () => 12),
    group = formation(4, true);
  const before = JSON.stringify(group);
  models.update([group], 0, { quality: "low", distance: 450 });
  assert.equal(models.stats.headlights, 2);
  assert.equal(models.stats.glows, 2);
  assert.equal(models.stats.groundGlows, 2);
  assert.equal(models.stats.dynamicLights, 0);
  assert.equal(
    models.stats.muzzleFlashes +
      models.stats.infantryTracers +
      models.stats.tankShells +
      models.stats.shells,
    0,
  );
  assert.equal(JSON.stringify(group), before);
  const body = new THREE.Matrix4();
  mesh(scene, "truck-body").getMatrixAt(0, body);
  const lamp = new THREE.Vector3(-0.82, 1.61, 2.66).applyMatrix4(body);
  const matrix = new THREE.Matrix4();
  mesh(scene, "combat-glows").getMatrixAt(0, matrix);
  assert.ok(
    lamp.distanceTo(new THREE.Vector3().setFromMatrixPosition(matrix)) <
      0.00001,
  );
  models.update([], 100, { quality: "ultra", distance: 450 });
  assert.equal(models.stats.glows + models.stats.dynamicLights, 0);
  models.dispose();
});

test("araştırma her ülkenin dört modelini ayrı bankalardan seçer ve kumaşa doğrusal ulusal rengi uygular", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  const france = formation(4),
    germany = formation(4);
  france.armies = france.armies.map((army, i) => ({
    ...army,
    id: `france-${i}`,
  }));
  germany.armies = germany.armies.map((army, i) => ({
    ...army,
    id: `germany-${i}`,
  }));
  france.visual = getUnitVisualResearch({
    id: "france",
    tech: ["weapons1", "armor2", "motorization"],
  });
  germany.visual = getUnitVisualResearch({
    id: "germany",
    tech: ["weapons3", "armor1", "motorization", "mechanization"],
  });
  const before = JSON.stringify([france, germany]);
  models.update([france, germany], 0, { ...settings, paused: true });
  assert.deepEqual(models.stats.modelVariants, {
    infantry: [0, 1, 0, 1],
    tank: [0, 1, 1, 0],
    artillery: [0, 1, 0, 1],
    truck: [0, 1, 0, 1],
  });
  assert.equal(models.stats.modelBanks, 4);
  for (const [name, tier] of [
    ["infantry-body", 1],
    ["tank-hull", 2],
    ["truck-body", 1],
    ["artillery-base", 1],
    ["infantry-head", 1],
  ] as const)
    assert.equal(mesh(scene, `${name}-tier-${tier}`).count, 1);
  for (const [group, tier] of [
    [france, 1],
    [germany, 3],
  ] as const) {
    const expected = new THREE.Color(group.visual!.uniform);
    const body = mesh(scene, `infantry-body-tier-${tier}`);
    const fabric = body.geometry.getAttribute("unitUniform");
    assert.ok(fabric instanceof THREE.InstancedBufferAttribute);
    assert.equal(fabric.itemSize, 3);
    for (const [actual, value] of [
      [fabric.getX(0), expected.r],
      [fabric.getY(0), expected.g],
      [fabric.getZ(0), expected.b],
    ])
      assert.ok(Math.abs(actual - value) < 0.000001);
    assert.equal(
      body.instanceColor,
      null,
      "national cloth must not repaint skin, steel or rubber",
    );
  }
  assert.equal(
    JSON.stringify([france, germany]),
    before,
    "research visuals do not change equipment, health, paths or completed technology",
  );
  assert.equal(models.stats.muzzleFlashes + models.stats.shells, 0);
  models.dispose();
});

test("araştırma tamamlanınca görünüm değişir; tekrar görünür olan ülke banka/geometri üretmez ve kaynaklar bir kez bırakılır", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(4);
  group.visual = getUnitVisualResearch({ id: "turkey", tech: [] });
  models.update([group], 0, { ...settings, paused: true });
  const original = mesh(scene, "infantry-body");
  group.visual = getUnitVisualResearch({
    id: "turkey",
    tech: ["weapons3", "armor3", "motorization", "mechanization"],
  });
  models.update([group], 100, { ...settings, paused: true });
  assert.equal(original.visible, false);
  const researched = mesh(scene, "infantry-body-tier-3");
  assert.equal(researched.count, 1);
  assert.notDeepEqual(
    Array.from(original.geometry.getAttribute("position").array),
    Array.from(researched.geometry.getAttribute("position").array),
  );
  const retained = allMeshes(scene).map((part) => [
    part.uuid,
    part.geometry.uuid,
  ]);
  const resources = new Set(allMeshes(scene).map((part) => part.geometry));
  const releases = new Map([...resources].map((resource) => [resource, 0]));
  resources.forEach((resource) =>
    resource.addEventListener("dispose", () =>
      releases.set(resource, releases.get(resource)! + 1),
    ),
  );
  for (let frame = 0; frame < 10; frame++) {
    models.update(frame % 2 ? [group] : [], frame * 250 + 200, {
      ...settings,
      paused: true,
    });
    assert.deepEqual(
      allMeshes(scene).map((part) => [part.uuid, part.geometry.uuid]),
      retained,
      "panning across a country's edge must reuse all geometry and GPU buffers",
    );
  }
  assert.equal(
    models.stats.modelBanks,
    2,
    "only requested research tiers are created",
  );
  assert.ok([...releases.values()].every((count) => count === 0));
  models.dispose();
  models.dispose();
  assert.ok([...releases.values()].every((count) => count === 1));
  assert.equal(scene.children.length, 0);
});

test("dört araştırma bankası küçük başlar; karma büyük orduda toplam görünür model ve tampon yazımları sınırlıdır", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene);
  assert.equal(models.stats.modelBanks, 1);
  assert.equal(
    models.stats.modelCapacity,
    15 * 8,
    "do not preallocate four maximum-sized armies at startup",
  );
  const groups = Array.from(
    { length: MAX_UNIT_MINIATURES / 4 + 20 },
    (_, index) => {
      const group = formation(4),
        tier = (index % 4) as 0 | 1 | 2 | 3;
      group.armies = group.armies.map((army, i) => ({
        ...army,
        id: `tier-${index}-${i}`,
      }));
      group.visual = {
        infantry: tier,
        tank: tier,
        artillery: tier,
        truck: tier,
        uniform: 0x727a6d,
      };
      return group;
    },
  );
  models.update(groups, 0, { ...settings, paused: true });
  assert.equal(models.stats.modelBanks, 4);
  assert.equal(
    models.stats.infantry + models.stats.vehicles,
    MAX_UNIT_MINIATURES,
  );
  assert.deepEqual(models.stats.modelVariants.infantry, [192, 192, 192, 192]);
  assert.ok(
    models.stats.modelCapacity < MAX_UNIT_MINIATURES * 16,
    "tier banks reserve bounded geometric buckets, not four full scene capacities",
  );
  for (const part of allMeshes(scene)) {
    assert.ok(part.count <= part.instanceMatrix.count, part.name);
    const uniforms = part.geometry.getAttribute("unitUniform");
    if (uniforms) assert.ok(part.count <= uniforms.count, part.name);
    for (const value of part.instanceMatrix.array.slice(0, part.count * 16))
      assert.ok(Number.isFinite(value), part.name);
  }
  const capacity = models.stats.modelCapacity;
  const ids = allMeshes(scene).map((part) => part.uuid);
  models.update([], 1000, settings);
  assert.equal(
    models.stats.modelCapacity,
    capacity,
    "offscreen frames keep stable GPU buffers",
  );
  assert.deepEqual(
    allMeshes(scene).map((part) => part.uuid),
    ids,
  );
  assert.equal(
    models.stats.infantry + models.stats.vehicles + models.stats.idleHeads,
    0,
  );
  assert.ok(allMeshes(scene).every((part) => !part.visible));
  models.dispose();
});

test("nöbetçi yalnız boynunu yumuşakça çevirir; kimliğe bağlı hareket sıralamadan veya oyun RNG'sinden etkilenmez", () => {
  const scene = new THREE.Scene(),
    reordered = new THREE.Scene();
  const models = createUnitModels(scene),
    other = createUnitModels(reordered);
  const a = formation(1),
    b = formation(1);
  b.armies = b.armies.map((army) => ({ ...army, id: "another-sentry" }));
  b.position.x += 60;
  const groups = [a, b],
    before = JSON.stringify(groups);
  models.update(groups, 0, settings);
  other.update([b, a], 0, settings);
  const body = matrices(scene, "infantry-body"),
    legs = matrices(scene, "infantry-legs");
  const heads = matrices(scene, "infantry-head");
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error("idle updates must not consume randomness");
  };
  try {
    for (let frame = 1; frame <= 20; frame++) {
      models.update(groups, frame * 100, settings);
      other.update([b, a], frame * 100, settings);
      const samples = models.stats.headYawSamples;
      for (const sample of samples) {
        assert.ok(Math.abs(sample.yaw) <= 0.45);
        assert.equal(
          sample.yaw,
          other.stats.headYawSamples.find((item) => item.id === sample.id)!.yaw,
        );
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(models.stats.idleHeads, 2);
  assert.equal(models.stats.idleAnimating, true);
  assert.deepEqual(matrices(scene, "infantry-body"), body);
  assert.deepEqual(matrices(scene, "infantry-legs"), legs);
  assert.notDeepEqual(matrices(scene, "infantry-head"), heads);
  assert.notEqual(
    models.stats.headYawSamples[0].yaw,
    models.stats.headYawSamples[1].yaw,
  );
  const bodyTransform = new THREE.Matrix4(),
    headTransform = new THREE.Matrix4();
  mesh(scene, "infantry-body").getMatrixAt(0, bodyTransform);
  mesh(scene, "infantry-head").getMatrixAt(0, headTransform);
  assert.ok(
    new THREE.Vector3(...INFANTRY_NECK_PIVOT)
      .applyMatrix4(bodyTransform)
      .distanceTo(new THREE.Vector3().setFromMatrixPosition(headTransform)) <
      0.00001,
    "head rotates at its neck without drifting from torso",
  );
  assert.equal(JSON.stringify(groups), before);
  assert.equal(
    models.stats.glows + models.stats.muzzleFlashes + models.stats.shells,
    0,
  );
  models.dispose();
  other.dispose();
});

test("duraklatma, azaltılmış hareket ve gizli sekme nöbet başını dondurur; dönüşte beklenen süreyi animasyona eklemez", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(1);
  models.update([group], 0, settings);
  models.update([group], 200, settings);
  const frozen = sceneSnapshot(scene),
    yaw = models.stats.headYawSamples[0].yaw;
  assert.notEqual(yaw, 0);
  models.update([group], 5000, { ...settings, paused: true });
  assert.deepEqual(sceneSnapshot(scene), frozen);
  assert.equal(models.stats.idleAnimating, false);
  models.update([group], 15000, { ...settings, reduced: true });
  assert.deepEqual(sceneSnapshot(scene), frozen);
  models.update([group], 25000, settings);
  assert.equal(
    models.stats.headYawSamples[0].yaw,
    yaw,
    "first active frame ignores inactive wall time",
  );
  models.update([group], 25100, settings);
  assert.notEqual(models.stats.headYawSamples[0].yaw, yaw);
  const beforeHide = sceneSnapshot(scene);
  models.suspend();
  models.update([group], 90000, settings);
  assert.deepEqual(
    sceneSnapshot(scene),
    beforeHide,
    "tab return must not jump by the maximum timestep",
  );
  models.update([group], 90100, settings);
  assert.notDeepEqual(sceneSnapshot(scene), beforeHide);
  const farPose = sceneSnapshot(scene);
  models.update([group], 90200, { ...settings, distance: 1000 });
  assert.equal(models.stats.idleAnimating, false);
  assert.equal(mesh(scene, "infantry-head-details").count, 0);
  assert.deepEqual(
    matrices(scene, "infantry-head"),
    farPose.find((part) => part.name === "unit-infantry-head")!.matrix,
  );
  models.dispose();
});

test("yürüyüş, çatışma veya şehir ele geçirme sırasında baş ileri bakar; araştırma değişimi namlu konumunu bozmaz", () => {
  const scene = new THREE.Scene(),
    models = createUnitModels(scene),
    group = formation(1);
  models.update([group], 0, settings);
  models.update([group], 200, settings);
  assert.notEqual(models.stats.headYawSamples[0].yaw, 0);
  for (const event of ["moving", "capture", "combat"] as const) {
    group.moving = event === "moving";
    group.capture =
      event === "capture" ? { key: "test-capture", progress: 0.2 } : undefined;
    group.combat =
      event === "combat"
        ? { key: "test-fire", target: new THREE.Vector3(100, 12, 80) }
        : undefined;
    models.update([group], 400, settings);
    assert.equal(models.stats.headYawSamples[0].yaw, 0, event);
    assert.equal(models.stats.idleHeads, 0, event);
    assert.equal(models.stats.idleAnimating, false, event);
  }
  for (const tier of [0, 1, 2, 3] as const) {
    group.visual = {
      infantry: tier,
      artillery: tier,
      tank: tier,
      truck: tier,
      uniform: 0x727a6d,
    };
    models.update([group], 500, { ...settings, paused: true });
    const body = new THREE.Matrix4(),
      flash = new THREE.Matrix4();
    mesh(scene, `infantry-body${tier ? `-tier-${tier}` : ""}`).getMatrixAt(
      0,
      body,
    );
    mesh(scene, "muzzle-flashes").getMatrixAt(0, flash);
    const muzzle = new THREE.Vector3(0.37, 2.9, 1.97).applyMatrix4(body);
    assert.ok(
      muzzle.distanceTo(new THREE.Vector3().setFromMatrixPosition(flash)) <
        0.00001,
      `tier ${tier} retains the real rifle anchor`,
    );
  }
  models.dispose();
});
