import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createRailways } from "./map3d-railways";
import { TRAIN_WORLD_SCALE, TRAIN_DIMENSIONS } from "./map3d-train-models";
import { buildGlobalRailNetwork } from "./map3d-rail-network";
import { containsProvincePoint, heightAt } from "./map3d-geometry";
import { createWorld, GEOGRAPHY, MAP } from "./world";

function fixture() {
  const world = createWorld("turkey", "historical", 171);
  for (const province of Object.values(world.provinces))
    province.buildings.rail = 0;
  world.provinces["turkey-0"].buildings.rail = 1;
  world.provinces["turkey-city-16"].buildings.rail = 1;
  return world;
}
const running = { paused: false, reduced: false, distance: 650 };

test("Demiryolu görseli gerçek bağlantı üzerinde ilerler, araziyi izler ve dünyayı değiştirmez", () => {
  const world = fixture(),
    before = structuredClone(world),
    scene = new THREE.Scene();
  const railways = createRailways(scene);
  railways.update(world);
  assert.equal(railways.stats.edges, 1);
  assert.equal(railways.stats.trains, 1);
  railways.animate(0, running);
  const start = structuredClone(railways.stats.positions);
  for (let i = 1; i <= 40; i++) {
    railways.animate(i / 10, running);
    for (const p of railways.stats.positions) {
      assert.ok([p.x, p.y, p.z].every(Number.isFinite));
      const x = p.x + MAP.width / 2,
        y = p.z + MAP.height / 2;
      assert.ok(
        containsProvincePoint("turkey-0", x, y) ||
          containsProvincePoint("turkey-city-16", x, y),
      );
      assert.ok(
        Math.abs(p.y - heightAt(x, y) - 0.46 * TRAIN_WORLD_SCALE) < 1e-9,
      );
    }
  }
  assert.notDeepEqual(railways.stats.positions, start);
  assert.deepEqual(world, before);
  railways.dispose();
});

test("Sefer duraklatıldığında ortam trenleri dolaşmaya devam eder; azaltılmış hareket dondurur", () => {
  const railways = createRailways(new THREE.Scene());
  railways.update(fixture());
  railways.animate(0, running);
  railways.animate(0.1, running);
  const start = structuredClone(railways.stats.positions),
    progress = railways.stats.progress;
  railways.animate(0.2, { ...running, paused: true });
  railways.animate(0.3, { ...running, paused: true });
  assert.ok(railways.stats.progress > progress);
  assert.notDeepEqual(railways.stats.positions, start);
  const reducedStart = structuredClone(railways.stats.positions),
    reducedProgress = railways.stats.progress;
  railways.animate(0.4, { ...running, reduced: true });
  railways.animate(30, { ...running, reduced: true });
  assert.equal(railways.stats.progress, reducedProgress);
  assert.deepEqual(railways.stats.positions, reducedStart);
  railways.animate(30.1, running);
  assert.equal(railways.stats.progress, reducedProgress);
  railways.animate(30.2, running);
  assert.ok(railways.stats.progress > reducedProgress);
  railways.dispose();
});

test("Bütün yerel rayların kaldırılması veya başkent kaybı görünür treni anında kaldırır", () => {
  const world = fixture(),
    railways = createRailways(new THREE.Scene());
  railways.update(world);
  assert.equal(railways.stats.trains, 1);
  world.provinces["turkey-city-16"].buildings.rail = 0;
  world.provinces["turkey-0"].buildings.rail = 0;
  railways.update(world);
  assert.equal(railways.stats.trains, 0);
  assert.deepEqual(railways.stats.positions, []);
  world.provinces["turkey-city-16"].buildings.rail = 1;
  world.provinces["turkey-0"].buildings.rail = 1;
  railways.update(world);
  assert.equal(railways.stats.trains, 1);
  world.provinces["turkey-0"].controller = "germany";
  railways.update(world);
  assert.equal(railways.stats.edges, 0);
  assert.equal(railways.stats.trains, 0);
  railways.dispose();
});

test("Kalite tren bütçesini sınırlar, uzak LOD gerçek çizilen sayıyı raporlar", () => {
  const railways = createRailways(new THREE.Scene());
  railways.update(createWorld("turkey", "historical"));
  railways.setQuality("ultra");
  railways.animate(0, running);
  assert.ok(railways.stats.trains > 0 && railways.stats.trains <= 32);
  railways.setQuality("low");
  assert.ok(railways.stats.trains > 0 && railways.stats.trains <= 6);
  const visible = railways.stats.trains;
  railways.animate(0.1, { ...running, distance: 1500 });
  assert.equal(railways.stats.trains, 0);
  assert.deepEqual(railways.stats.positions, []);
  assert.ok(railways.stats.edges > 0);
  railways.animate(0.2, running);
  assert.equal(railways.stats.trains, visible);
  railways.dispose();
});

test("Gün, stok ve ekonomi değişimleri ray geometrisini yeniden üretmez; kaynaklar bırakılır", () => {
  const scene = new THREE.Scene(),
    world = fixture(),
    railways = createRailways(scene);
  railways.update(world);
  const group = scene.getObjectByName("capital-connected-railways")!;
  const tracks = group.getObjectByName("railway-steel-rails") as THREE.Mesh;
  const geometry = tracks.geometry;
  world.day++;
  world.countries.turkey.equipment.rifle += 30;
  railways.update(world);
  assert.equal(tracks.geometry, geometry);
  let instanceDisposals = 0;
  const instances: THREE.InstancedMesh[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) instances.push(child);
  });
  for (const mesh of instances)
    mesh.addEventListener("dispose", () => instanceDisposals++);
  let disposed = 0;
  geometry.addEventListener("dispose", () => disposed++);
  railways.dispose();
  railways.dispose();
  assert.equal(disposed, 1);
  assert.equal(instanceDisposals, instances.length);
  assert.ok(instances.length >= 6 && instances.length <= 12);
  assert.equal(scene.children.length, 0);
  assert.equal(railways.stats.trains, 0);
  assert.deepEqual(railways.stats.positions, []);
});

test("Tren düşük kalitede duraklatılmış seferde tam gidiş dönüş döngülerini sıçramadan tamamlar", () => {
  const railways = createRailways(new THREE.Scene());
  railways.update(fixture());
  railways.setQuality("low");
  const options = { ...running, paused: true };
  railways.animate(0, options);
  let previous = { ...railways.stats.positions[0] };
  let positive = 0,
    negative = 0;
  const start = { ...previous };
  let farthest = 0;
  for (let i = 1; i <= 400; i++) {
    railways.animate(i / 10, options);
    const point = railways.stats.positions[0];
    const step = Math.hypot(point.x - previous.x, point.z - previous.z);
    assert.ok(step <= 0.421, `Döngüde ışınlanma: ${step}`);
    farthest = Math.max(
      farthest,
      Math.hypot(point.x - start.x, point.z - start.z),
    );
    if (point.x > previous.x + 0.001) positive++;
    if (point.x < previous.x - 0.001) negative++;
    previous = { ...point };
  }
  assert.ok(positive > 20 && negative > 20);
  assert.ok(farthest > 3.3);
  assert.ok(railways.stats.progress > 39);
  const before = { ...railways.stats.positions[0] };
  railways.animate(1000, options);
  assert.ok(
    Math.hypot(
      railways.stats.positions[0].x - before.x,
      railways.stats.positions[0].z - before.z,
    ) <= 1.051,
  );
  railways.dispose();
});

test("Fiziksel çelik raylar, sürekli çakıl yatağı ve traversler sonlu geometriyle sınırlı çizilir", () => {
  const scene = new THREE.Scene(),
    railways = createRailways(scene);
  railways.update(fixture());
  const steel = scene.getObjectByName("railway-steel-rails") as THREE.Mesh;
  const ballast = scene.getObjectByName("railway-gravel-ballast") as THREE.Mesh;
  const sleepers = scene.getObjectByName(
    "railway-timber-sleepers",
  ) as THREE.InstancedMesh;
  assert.ok(steel instanceof THREE.Mesh && ballast instanceof THREE.Mesh);
  assert.ok(steel.geometry.getIndex()!.count > 100);
  assert.ok(ballast.geometry.getAttribute("uv").count > 10);
  assert.ok(sleepers.count > 20 && sleepers.count <= 10000);
  assert.ok(
    (ballast.material as THREE.MeshStandardMaterial).map instanceof
      THREE.DataTexture,
  );
  for (const mesh of [steel, ballast]) {
    assert.ok(
      [...mesh.geometry.getAttribute("position").array].every(Number.isFinite),
    );
    assert.ok(
      [...mesh.geometry.getAttribute("normal").array].every(Number.isFinite),
    );
  }
  // The ballast must face the camera from above, rather than rendering only its underside.
  const normals = ballast.geometry.getAttribute("normal");
  assert.ok(
    Array.from({ length: normals.count }, (_, i) => normals.getY(i)).every(
      (y) => y > 0,
    ),
  );
  const texture = (ballast.material as THREE.MeshStandardMaterial).map!;
  let textureDisposals = 0;
  texture.addEventListener("dispose", () => textureDisposals++);
  railways.dispose();
  assert.equal(textureDisposals, 1);
});

test("Kısa hatta daha az vagon kullanılır; lokomotif ve tekerlekler sabit ray açıklığını korur", () => {
  const scene = new THREE.Scene(),
    railways = createRailways(scene);
  railways.update(fixture());
  railways.animate(0, running);
  const locomotive = scene.getObjectByName(
    "detailed-train-locomotive",
  ) as THREE.InstancedMesh;
  const tender = scene.getObjectByName(
    "detailed-train-tender",
  ) as THREE.InstancedMesh;
  const boxcar = scene.getObjectByName(
    "detailed-train-boxcar",
  ) as THREE.InstancedMesh;
  const flatcar = scene.getObjectByName(
    "detailed-train-flatcar",
  ) as THREE.InstancedMesh;
  assert.equal(locomotive.count, 1);
  assert.equal(tender.count, 1);
  assert.equal(boxcar.count + flatcar.count, 2);
  const matrix = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  for (const mesh of [locomotive, tender, boxcar, flatcar]) {
    mesh.getMatrixAt(0, matrix);
    matrix.decompose(p, q, scale);
    assert.ok(
      scale.distanceTo(new THREE.Vector3().setScalar(TRAIN_WORLD_SCALE)) < 1e-6,
    );
  }
  const wheels = scene.getObjectByName(
    "detailed-train-spoked-wheels",
  ) as THREE.InstancedMesh;
  wheels.getMatrixAt(0, matrix);
  const left = new THREE.Vector3().setFromMatrixPosition(matrix);
  wheels.getMatrixAt(1, matrix);
  const right = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(Math.abs(left.distanceTo(right) - 1.5 * TRAIN_WORLD_SCALE) < 1e-4);
  railways.dispose();
});

test("Kamera yabancı ülkeye çevrildiğinde o ülkenin gerçek trenleri çizilir ve dünya değişmez", () => {
  const scene = new THREE.Scene(),
    railways = createRailways(scene),
    world = createWorld("turkey");
  const before = structuredClone(world);
  railways.update(world);
  railways.setQuality("ultra");
  for (const country of ["germany", "france", "turkey"]) {
    const capital = GEOGRAPHY[world.countries[country].capital];
    railways.animate(0, {
      ...running,
      distance: 550,
      focus: { x: capital.x - MAP.width / 2, z: capital.y - MAP.height / 2 },
    });
    assert.ok(
      railways.stats.countries.includes(country),
      `Kamera ${country} üzerindeyken kendi trenleri yok: ${railways.stats.countries}`,
    );
    assert.equal(
      railways.stats.countries.length,
      railways.stats.positions.length,
    );
    assert.ok(railways.stats.trains <= 32);
    assert.ok(railways.stats.edges > 0);
  }
  railways.animate(0.1, { ...running, distance: 1600 });
  assert.deepEqual(railways.stats.countries, []);
  assert.deepEqual(world, before);
  railways.dispose();
});

test("Küçük kamera hareketleri geometriyi korur; başka ülkenin görünüm penceresi bir kez yenilenir", () => {
  const scene = new THREE.Scene(),
    railways = createRailways(scene),
    world = createWorld("turkey");
  railways.update(world);
  railways.animate(0, { ...running, distance: 500, focus: { x: 100, z: 100 } });
  const track = scene.getObjectByName("railway-steel-rails") as THREE.Mesh;
  const original = track.geometry;
  railways.animate(0.1, {
    ...running,
    distance: 500,
    focus: { x: 101, z: 101 },
  });
  assert.equal(track.geometry, original);
  railways.animate(0.2, {
    ...running,
    distance: 500,
    focus: { x: -300, z: -300 },
  });
  assert.notEqual(track.geometry, original);
  const foreign = track.geometry;
  railways.animate(0.3, {
    ...running,
    distance: 500,
    focus: { x: -301, z: -301 },
  });
  assert.equal(track.geometry, foreign);
  railways.dispose();
});

test("Başlangıçtaki 29 ülkenin tamamında kamerayla görülebilen gerçek tren bulunur", () => {
  const world = createWorld("turkey"),
    railways = createRailways(new THREE.Scene());
  railways.update(world);
  railways.setQuality("ultra");
  assert.equal(Object.keys(world.countries).length, 29);
  for (const country of Object.values(world.countries)) {
    const capital = GEOGRAPHY[country.capital];
    railways.animate(0, {
      ...running,
      distance: 550,
      focus: { x: capital.x - MAP.width / 2, z: capital.y - MAP.height / 2 },
    });
    assert.ok(
      railways.stats.countries.includes(country.id),
      `${country.id} tren göstermiyor`,
    );
  }
  railways.dispose();
});

test("Lüksemburg'da kısa yerel hatta sabit açıklıklı yalnız lokomotif fiziksel uçları aşmadan manevra yapar", () => {
  const world = createWorld("turkey"),
    scene = new THREE.Scene(),
    railways = createRailways(scene);
  const network = buildGlobalRailNetwork(world),
    route = network.routes.find((r) => r.country === "luxembourg")!;
  assert.equal(route.local, true);
  assert.ok(
    route.length >= TRAIN_DIMENSIONS.locomotive.length * TRAIN_WORLD_SCALE + 1,
  );
  assert.ok(
    route.length <
      (TRAIN_DIMENSIONS.locomotive.length + TRAIN_DIMENSIONS.tender.length) *
        TRAIN_WORLD_SCALE,
  );
  railways.update(world);
  railways.setQuality("ultra");
  const capital = GEOGRAPHY[world.countries.luxembourg.capital];
  const options = {
    ...running,
    paused: true,
    distance: 100,
    focus: { x: capital.x - MAP.width / 2, z: capital.y - MAP.height / 2 },
  };
  const mesh = scene.getObjectByName(
    "detailed-train-locomotive",
  ) as THREE.InstancedMesh;
  mesh.geometry.computeBoundingBox();
  assert.ok(
    mesh.geometry.boundingBox!.max.x <= TRAIN_DIMENSIONS.locomotive.length / 2,
  );
  assert.ok(
    mesh.geometry.boundingBox!.min.x >= -TRAIN_DIMENSIONS.locomotive.length / 2,
  );
  const matrix = new THREE.Matrix4(),
    point = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    quaternion = new THREE.Quaternion();
  const start = route.points[0],
    end = route.points.at(-1)!,
    dx = end.x - start.x,
    dy = end.y - start.y;
  let previous: (typeof railways.stats.positions)[number] | undefined,
    travel = 0;
  for (let frame = 0; frame <= 60; frame++) {
    railways.animate(frame / 10, options);
    const index = railways.stats.countries.indexOf("luxembourg");
    assert.ok(index >= 0);
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(point, quaternion, scale);
    assert.ok(
      scale.distanceTo(new THREE.Vector3().setScalar(TRAIN_WORLD_SCALE)) < 1e-6,
    );
    const vertices = mesh.geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(matrix);
      const along =
        ((point.x + MAP.width / 2 - start.x) * dx +
          (point.z + MAP.height / 2 - start.y) * dy) /
        route.length;
      assert.ok(
        along >= -1e-4 && along <= route.length + 1e-4,
        `Lokomotif ray dışına taşıyor: ${along}`,
      );
    }
    const current = railways.stats.positions[index];
    if (previous)
      travel += Math.hypot(current.x - previous.x, current.z - previous.z);
    previous = { ...current };
  }
  assert.ok(travel > 10);
  railways.dispose();
});
