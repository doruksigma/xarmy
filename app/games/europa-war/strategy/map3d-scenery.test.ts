import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createScenery, type SceneryHouse } from "./map3d-scenery";
import {
  buildTerrain,
  containsProvincePoint,
  heightAt,
} from "./map3d-geometry";
import { createTerrainSurfaceSampler } from "./map3d-surface";
import { buildPlayerRailNetwork } from "./map3d-rail-network";
import { UNIT_DISPLAY_LAYOUTS, UNIT_MODEL_FOOTPRINTS } from "./map3d-units";
import { createWorld, GEOGRAPHY, MAP } from "./world";
import type { GraphicsQuality } from "./map3d-visuals";

function renderedHouses(
  scene: THREE.Scene,
  scenery: ReturnType<typeof createScenery>,
) {
  const bodies = scene.getObjectByName(
    "scenery-masonry",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  assert.equal(scenery.houses.length, scenery.stats.houses);
  const observed: Record<string, number> = {};
  const indices = new Set<number>();
  for (const house of scenery.houses) {
    assert.ok(house.instance >= 0 && house.instance < bodies.count);
    assert.ok(
      !indices.has(house.instance),
      "A body instance cannot stand in for multiple houses",
    );
    indices.add(house.instance);
    bodies.getMatrixAt(house.instance, matrix);
    matrix.decompose(position, rotation, scale);
    assert.ok(Math.abs(position.x + MAP.width / 2 - house.x) < 0.0001);
    assert.ok(Math.abs(position.z + MAP.height / 2 - house.z) < 0.0001);
    assert.ok(Math.abs(scale.x - house.width) < 0.0001);
    assert.ok(Math.abs(scale.z - house.depth) < 0.0001);
    assert.ok(Math.abs(scale.y - house.height) < 0.0001 && scale.y > 0.5);
    observed[house.province] = (observed[house.province] ?? 0) + 1;
  }
  assert.deepEqual(observed, scenery.stats.housesByProvince);
  assert.deepEqual(scenery.stats.emptyProvinces, []);
  assert.equal(Object.keys(observed).length, MAP.provinces.length);
  return bodies;
}

function verifyFootprint(house: SceneryHouse) {
  const province = GEOGRAPHY[house.province];
  const c = Math.cos(house.angle),
    s = Math.sin(house.angle);
  // Probe the actual overhanging roof, not only the building's center point.
  for (const px of [-0.55, -0.275, 0, 0.275, 0.55])
    for (const pz of [-0.55, -0.275, 0, 0.275, 0.55]) {
      const dx = px * house.width,
        dz = pz * house.depth;
      assert.ok(
        containsProvincePoint(
          house.province,
          house.x + c * dx + s * dz,
          house.z - s * dx + c * dz,
        ),
        `${house.province}: roof outside real land`,
      );
    }
  const halfX = (Math.abs(c) * house.width + Math.abs(s) * house.depth) * 0.55;
  const halfZ = (Math.abs(s) * house.width + Math.abs(c) * house.depth) * 0.55;
  for (const slot of UNIT_DISPLAY_LAYOUTS[4]) {
    const body = UNIT_MODEL_FOOTPRINTS[slot.kind];
    const dx = house.x - province.x + slot.x,
      dz = house.z - province.y + slot.z;
    const overlap =
      dx + halfX > -body.halfWidth &&
      dx - halfX < body.halfWidth &&
      dz + halfZ > -body.front &&
      dz - halfZ < body.rear;
    assert.ok(
      !overlap,
      `${house.province}: house intersects ${slot.kind} staging`,
    );
  }
}

test("Her kalite düzeyinde bütün illerde gerçek, karada duran binalar kalır", () => {
  const world = createWorld("turkey", "historical", 1936),
    before = structuredClone(world);
  const scene = new THREE.Scene(),
    scenery = createScenery(scene);
  const counts: number[] = [];
  for (const quality of [
    "low",
    "medium",
    "high",
    "ultra",
  ] as GraphicsQuality[]) {
    scenery.setQuality(quality);
    scenery.update(world);
    renderedHouses(scene, scenery);
    for (const house of scenery.houses) verifyFootprint(house);
    counts.push(scenery.stats.houses);
    for (const name of ["Edirne", "Ankara", "Lüksemburg"]) {
      const city = MAP.provinces.find((p) => p.name === name);
      if (city) assert.ok(scenery.stats.housesByProvince[city.id] >= 1, name);
    }
    scene.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      assert.ok(object.count <= object.instanceMatrix.count);
      for (let i = 0; i < object.count * 16; i++)
        assert.ok(Number.isFinite(object.instanceMatrix.array[i]));
    });
  }
  assert.ok(
    counts.every((count, index) => !index || count >= counts[index - 1]),
  );
  assert.ok(counts[3] > counts[0], "Quality still scales the scenery budget");
  assert.deepEqual(world, before);
  scenery.dispose();
});

test("29 ülkenin oyuncuya bağlı ray ağında dar şehirler tamamen boşalmaz", () => {
  const world = createWorld("turkey", "historical"),
    scene = new THREE.Scene(),
    scenery = createScenery(scene);
  scenery.setQuality("low");
  for (const country of Object.keys(world.countries)) {
    world.player = country;
    scenery.update(world);
    assert.deepEqual(scenery.stats.emptyProvinces, [], `Player ${country}`);
    renderedHouses(scene, scenery);
  }
  scenery.dispose();
});

test("Dar istasyon şehirlerinde bina çatısı tren ve ray koridorundan ayrı kalır", () => {
  const world = createWorld("belgium", "historical"),
    scene = new THREE.Scene(),
    scenery = createScenery(scene);
  for (const player of [
    "turkey",
    "france",
    "uk",
    "switzerland",
    "belgium",
    "netherlands",
  ]) {
    world.player = player;
    scenery.update(world);
    const edges = buildPlayerRailNetwork(world).edges;
    for (const house of scenery.houses) {
      const localEdges = edges.filter(
        (edge) => edge.from === house.province || edge.to === house.province,
      );
      if (!localEdges.length) continue;
      verifyFootprint(house);
      const c = Math.cos(house.angle),
        s = Math.sin(house.angle);
      for (const edge of localEdges)
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1],
            b = edge.points[i];
          const steps = Math.max(
            1,
            Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2),
          );
          for (let j = 0; j <= steps; j++) {
            const dx = a.x + ((b.x - a.x) * j) / steps - house.x;
            const dz = a.y + ((b.y - a.y) * j) / steps - house.z;
            const distance = Math.hypot(
              Math.max(0, Math.abs(c * dx - s * dz) - house.width * 0.55),
              Math.max(0, Math.abs(s * dx + c * dz) - house.depth * 0.55),
            );
            assert.ok(
              distance >= 1.62 - 1e-6,
              `${house.province}: roof overlaps railway bed`,
            );
          }
        }
    }
  }
  scenery.dispose();
});

test("Şehir merkezindeki dört kol biçimli dekoratif yollar silinir; tesisler korunur", () => {
  const scene = new THREE.Scene(),
    scenery = createScenery(scene);
  const world = createWorld("turkey", "historical");
  scenery.update(world);
  const bodies = renderedHouses(scene, scenery),
    color = new THREE.Color();
  for (let i = 0; i < bodies.count; i++) {
    bodies.getColorAt(i, color);
    assert.notEqual(
      color.getHex(),
      0x79756a,
      "An old decorative crossroad arm is still rendered",
    );
  }
  assert.equal(scenery.stats.streetBars, 0);
  for (const name of [
    "scenery-factory-roofs",
    "scenery-chimneys",
    "scenery-hangars",
  ])
    assert.ok(
      (scene.getObjectByName(name) as THREE.InstancedMesh).count > 0,
      name,
    );
  scenery.dispose();
});

test("Gün, tümen ve yabancı kontrol değişimleri şehir instance tamponlarını yenilemez", () => {
  const world = createWorld("turkey", "historical"),
    scene = new THREE.Scene(),
    scenery = createScenery(scene);
  scenery.update(world);
  const group = scene.getObjectByName("province-scenery")!;
  const versions = group.children.map(
    (child) => (child as THREE.InstancedMesh).instanceMatrix.version,
  );
  const count = scenery.stats.rebuilds;
  world.day += 3;
  world.countries.turkey.equipment.rifle += 100;
  world.armies[0].province = world.armies[1].province;
  world.provinces["ireland-city-0"].controller = "germany";
  world.provinces["ireland-city-0"].buildings.rail++;
  for (let i = 0; i < 20; i++) scenery.update(world);
  assert.equal(scenery.stats.rebuilds, count);
  assert.deepEqual(
    group.children.map(
      (child) => (child as THREE.InstancedMesh).instanceMatrix.version,
    ),
    versions,
  );
  // A disconnected captured pocket still has no visible tracks to clear.
  world.provinces["ireland-city-0"].controller = world.player;
  scenery.update(world);
  assert.equal(scenery.stats.rebuilds, count);
  world.provinces[world.countries[world.player].capital].buildings.rail = 0;
  scenery.update(world);
  assert.equal(scenery.stats.rebuilds, count + 1);
  world.provinces["turkey-0"].buildings.civil++;
  scenery.update(world);
  assert.equal(scenery.stats.rebuilds, count + 2);
  renderedHouses(scene, scenery);
  scenery.dispose();
});

test("Uzak atlas binaları çizmez, yakınlaşınca aynı şehirleri geri getirir; kaynaklar bir kez bırakılır", () => {
  const world = createWorld("turkey", "historical"),
    scene = new THREE.Scene(),
    scenery = createScenery(scene);
  scenery.update(world);
  const group = scene.getObjectByName("province-scenery")!,
    body = scene.getObjectByName("scenery-masonry") as THREE.InstancedMesh;
  const rebuilds = scenery.stats.rebuilds,
    bodyCount = body.count,
    houses = scenery.houses.slice(),
    snapshot = JSON.stringify(world);
  assert.equal(scenery.stats.emptyProvinces.length, 0);
  assert.equal(
    Object.keys(scenery.stats.housesByProvince).length,
    Object.keys(GEOGRAPHY).length,
  );
  scenery.updateLOD(2000);
  assert.equal(group.visible, false, "Continental atlas omits physical models");
  assert.ok(body.visible && body.count === bodyCount);
  assert.equal(scene.getObjectByName("scenery-urban-windows")!.visible, false);
  scenery.updateLOD(800);
  assert.equal(group.visible, true, "Regional view restores city silhouettes");
  assert.equal(scene.getObjectByName("scenery-urban-windows")!.visible, false);
  assert.equal(scene.getObjectByName("scenery-pines")!.visible, false);
  scenery.updateLOD(200);
  assert.equal(group.visible, true);
  assert.equal(scene.getObjectByName("scenery-urban-windows")!.visible, true);
  assert.equal(scene.getObjectByName("scenery-pines")!.visible, true);
  assert.equal(scenery.stats.rebuilds, rebuilds);
  assert.equal(body.count, bodyCount);
  assert.deepEqual(scenery.houses, houses);
  assert.equal(JSON.stringify(world), snapshot);
  let meshDisposals = 0,
    geometryDisposals = 0,
    materialDisposals = 0;
  const materials = new Set<THREE.Material>();
  for (const child of group.children as THREE.InstancedMesh[]) {
    child.addEventListener("dispose", () => meshDisposals++);
    child.geometry.addEventListener("dispose", () => geometryDisposals++);
    for (const material of Array.isArray(child.material)
      ? child.material
      : [child.material])
      materials.add(material);
  }
  for (const material of materials)
    material.addEventListener("dispose", () => materialDisposals++);
  assert.equal(
    group.children.length,
    13,
    "Buildings remain thirteen instanced batches",
  );
  scenery.dispose();
  scenery.dispose();
  scenery.update(world);
  assert.equal(meshDisposals, 13);
  assert.equal(geometryDisposals, 13);
  assert.equal(materialDisposals, materials.size);
  assert.equal(scene.children.length, 0);
  assert.equal(scenery.stats.houses, 0);
  assert.deepEqual(scenery.houses, []);
});

test("Binaların tabanı analitik yükseklik yerine çizilen arazi üçgeninin üstünde durur", () => {
  const terrain = buildTerrain({ maxEdge: 24 });
  const ground = createTerrainSurfaceSampler(terrain.geometry);
  const scene = new THREE.Scene(),
    scenery = createScenery(scene, ground);
  scenery.setQuality("low");
  scenery.update(createWorld("turkey", "historical"));
  const bodies = scene.getObjectByName(
    "scenery-masonry",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const surface = new THREE.Mesh(terrain.geometry, material);
  surface.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const probes = [...scenery.houses]
    .sort(
      (a, b) =>
        ground(b.x, b.z) -
        heightAt(b.x, b.z) -
        (ground(a.x, a.z) - heightAt(a.x, a.z)),
    )
    .slice(0, 20);
  assert.ok(
    ground(probes[0].x, probes[0].z) - heightAt(probes[0].x, probes[0].z) > 0.1,
    "Fixture must include terrain interpolation mismatch",
  );
  for (const house of probes) {
    ray.set(
      new THREE.Vector3(house.x - MAP.width / 2, 200, house.z - MAP.height / 2),
      new THREE.Vector3(0, -1, 0),
    );
    const intersection = ray.intersectObject(surface, false)[0];
    assert.ok(intersection, house.province);
    bodies.getMatrixAt(house.instance, matrix);
    const baseY = matrix.elements[13] - house.height / 2;
    assert.ok(
      baseY >= intersection.point.y - 0.0001,
      `${house.province}: buried building base`,
    );
    assert.ok(
      baseY < intersection.point.y + 3,
      `${house.province}: floating building base`,
    );
  }
  scenery.dispose();
  material.dispose();
  terrain.dispose();
});
