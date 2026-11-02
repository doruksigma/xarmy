import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createRailways } from "./map3d-railways";
import { TRAIN_WORLD_SCALE } from "./map3d-train-models";
import { buildPlayerRailNetwork } from "./map3d-rail-network";
import {
  buildTerrain,
  containsProvincePoint,
  heightAt,
} from "./map3d-geometry";
import { createTerrainSurfaceSampler } from "./map3d-surface";
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

test("Yabancı ülkeye bakıldığında onun rayları, istasyonları ve trenleri çizilmez", () => {
  const scene = new THREE.Scene(),
    railways = createRailways(scene),
    world = createWorld("turkey");
  const before = structuredClone(world);
  railways.update(world);
  railways.setQuality("ultra");
  for (const country of ["germany", "france"]) {
    const capital = GEOGRAPHY[world.countries[country].capital];
    railways.animate(0, {
      ...running,
      distance: 100,
      focus: { x: capital.x - MAP.width / 2, z: capital.y - MAP.height / 2 },
    });
    assert.deepEqual(railways.stats.countries, []);
    assert.deepEqual(railways.stats.provinces, []);
    assert.equal(railways.stats.trains, 0);
    assert.equal(railways.stats.stations, 0);
    const rails = scene.getObjectByName("railway-steel-rails") as THREE.Mesh;
    assert.equal(rails.geometry.getAttribute("position").count, 0);
  }
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

function corridorFixture() {
  const world = fixture();
  world.provinces["turkey-city-17"].buildings.rail = 1;
  world.provinces["turkey-city-16"].controller = "bulgaria";
  world.countries.turkey.allies.push("bulgaria");
  world.countries.bulgaria.access.push("turkey");
  return world;
}

test("Ele geçirilen kopuk raylı cep görünmez; kendi kesintisiz koridoru kurulunca gerçek geometriye katılır", () => {
  const world = corridorFixture(),
    scene = new THREE.Scene(),
    railways = createRailways(scene);
  railways.update(world);
  assert.equal(railways.stats.edges, 0);
  assert.equal(railways.stats.trains, 0);
  assert.ok(!railways.stats.provinces.includes("turkey-city-17"));
  const steel = scene.getObjectByName("railway-steel-rails") as THREE.Mesh;
  assert.equal(steel.geometry.getAttribute("position").count, 0);
  // Allied access is insufficient: the entire route must be player-controlled.
  world.provinces["turkey-city-16"].controller = "turkey";
  const before = structuredClone(world);
  railways.update(world);
  assert.equal(railways.stats.edges, 2);
  assert.ok(railways.stats.provinces.includes("turkey-city-17"));
  assert.deepEqual(railways.stats.countries, ["turkey"]);
  assert.ok(steel.geometry.getAttribute("position").count > 0);
  assert.deepEqual(world, before);
  world.provinces["turkey-city-16"].controller = "bulgaria";
  railways.update(world);
  assert.equal(railways.stats.edges, 0);
  assert.equal(railways.stats.trains, 0);
  assert.equal(steel.geometry.getAttribute("position").count, 0);
  railways.dispose();
});

test("Aynı şehirde birleşen fiziksel rayların uç kesitleri ortak noktaları paylaşır", () => {
  const world = corridorFixture();
  world.provinces["turkey-city-16"].controller = "turkey";
  const network = buildPlayerRailNetwork(world),
    junction = network.edges
      .find((e) => e.to === "turkey-city-16")!
      .points.at(-1)!;
  const scene = new THREE.Scene(),
    railways = createRailways(scene);
  railways.update(world);
  const mesh = scene.getObjectByName("railway-steel-rails") as THREE.Mesh;
  const positions = mesh.geometry.getAttribute("position"),
    counts = new Map<string, number>();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    if (
      Math.hypot(
        x + MAP.width / 2 - junction.x,
        z + MAP.height / 2 - junction.y,
      ) < 2.5
    ) {
      const key = [x, y, z].map((v) => v.toFixed(5)).join(":");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  assert.ok(
    [...counts.values()].filter((n) => n >= 2).length >= 24,
    "Bağlı iki rayın uçları fiziksel olarak birleşmiyor",
  );
  const before = railways.stats.provinces.slice().sort();
  railways.animate(0, {
    ...running,
    distance: 120,
    focus: { x: junction.x - MAP.width / 2, z: junction.y - MAP.height / 2 },
  });
  assert.deepEqual(railways.stats.provinces.slice().sort(), before);
  railways.animate(0.1, {
    ...running,
    distance: 240,
    focus: {
      x: junction.x - MAP.width / 2 + 81,
      z: junction.y - MAP.height / 2,
    },
  });
  assert.deepEqual(railways.stats.provinces.slice().sort(), before);
  assert.equal(railways.stats.edges, 2);
  railways.dispose();
});

test("Lokomotif şehir bağlantısından geçerken gövde yönü aniden sıçramaz", () => {
  const world = corridorFixture();
  world.provinces["turkey-city-16"].controller = "turkey";
  // Extend the real line to Samsun: the complete consist must fit before the
  // Kastamonu bend. The shorter three-city route starts the locomotive after
  // that bend and used to pass this test solely through terrain pitch changes.
  world.provinces["turkey-6"].buildings.rail = 1;
  const network = buildPlayerRailNetwork(world);
  assert.equal(network.routes.length, 1);
  const route = network.routes[0];
  const junction = network.edges
    .find((edge) => edge.to === "turkey-city-16")!
    .points.at(-1)!;
  const index = route.points.findIndex(
    (point) => Math.hypot(point.x - junction.x, point.y - junction.y) < 1e-6,
  );
  assert.ok(index > 0 && index < route.points.length - 1);
  const direction = (point: { x: number; y: number }) =>
    new THREE.Vector2(point.x - junction.x, point.y - junction.y).normalize();
  const incoming = direction(route.points[index - 1]);
  const outgoing = direction(route.points[index + 1]);
  const expectedTurn = Math.acos(
    THREE.MathUtils.clamp(-incoming.dot(outgoing), -1, 1),
  );
  assert.ok(
    expectedTurn > 0.3,
    "Fixture must contain a meaningful horizontal bend",
  );
  const before = new THREE.Vector2(junction.x, junction.y).addScaledVector(
    incoming,
    6,
  );
  const after = new THREE.Vector2(junction.x, junction.y).addScaledVector(
    outgoing,
    6,
  );
  const scene = new THREE.Scene(),
    // Isolate horizontal junction smoothing from decorative relief/pitch.
    railways = createRailways(scene, () => 0);
  railways.update(world);
  const mesh = scene.getObjectByName(
    "detailed-train-locomotive",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    angle = new THREE.Quaternion();
  let previous: THREE.Quaternion | undefined,
    total = 0,
    nearestBefore = Infinity,
    nearestAfter = Infinity;
  for (let frame = 0; frame <= 500; frame++) {
    railways.animate(frame / 10, { ...running, paused: true });
    assert.equal(mesh.count, 1);
    mesh.getMatrixAt(0, matrix);
    matrix.decompose(position, angle, scale);
    angle.normalize();
    nearestBefore = Math.min(
      nearestBefore,
      Math.hypot(
        position.x + MAP.width / 2 - before.x,
        position.z + MAP.height / 2 - before.y,
      ),
    );
    nearestAfter = Math.min(
      nearestAfter,
      Math.hypot(
        position.x + MAP.width / 2 - after.x,
        position.z + MAP.height / 2 - after.y,
      ),
    );
    if (previous) {
      const change = angle.angleTo(previous);
      assert.ok(change < 0.3, `Şehir geçişinde ani gövde dönüşü: ${change}`);
      total += change;
    }
    previous = angle.clone();
  }
  assert.ok(
    nearestBefore < 0.5 && nearestAfter < 0.5,
    "The locomotive must actually cross both sides of the junction",
  );
  assert.ok(
    total >= expectedTurn,
    "The body must follow the real horizontal turn, not merely change terrain pitch",
  );
  railways.dispose();
});

/** Independent truth for emitted geometry: intersect a vertical THREE.Ray with
 * the terrain's actual triangles. This deliberately does not use the production
 * surface sampler, its barycentric implementation, or the analytic heightfield. */
function terrainRayReference(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position"),
    index = geometry.getIndex();
  const cells = new Map<string, THREE.Triangle[]>(),
    cellSize = 24;
  const count = index?.count ?? position.count;
  for (let offset = 0; offset < count; offset += 3) {
    const indices = [0, 1, 2].map((i) =>
      index ? index.getX(offset + i) : offset + i,
    );
    const [a, b, c] = indices.map((i) =>
      new THREE.Vector3().fromBufferAttribute(position, i),
    );
    const triangle = new THREE.Triangle(a, b, c);
    const left = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
    const right = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
    const top = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
    const bottom = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
    for (let x = left; x <= right; x++)
      for (let z = top; z <= bottom; z++) {
        const key = `${x}:${z}`;
        let bucket = cells.get(key);
        if (!bucket) cells.set(key, (bucket = []));
        bucket.push(triangle);
      }
  }
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const intersection = new THREE.Vector3();
  return (x: number, z: number) => {
    ray.origin.set(x, 1e6, z);
    let highest = -Infinity;
    const bucket = cells.get(
      `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`,
    );
    for (const triangle of bucket ?? [])
      if (
        ray.intersectTriangle(
          triangle.a,
          triangle.b,
          triangle.c,
          false,
          intersection,
        )
      )
        highest = Math.max(highest, intersection.y);
    return highest;
  };
}

for (const maxEdge of [18, 24]) {
  test(`Gerçek ${maxEdge} birimlik arazi üçgenleri üzerinde Low ray yüzeyleri gömülmez; önbellek ve tren pozları korunur`, () => {
    const world = createWorld("turkey", "historical", 171);
    for (const province of Object.values(world.provinces))
      province.buildings.rail = province.controller === "turkey" ? 2 : 0;
    const before = structuredClone(world);
    const terrain = buildTerrain({ maxEdge });
    const independentHeight = terrainRayReference(terrain.geometry);
    const sample = createTerrainSurfaceSampler(terrain.geometry);
    let sampleCalls = 0;
    const scene = new THREE.Scene();
    const railways = createRailways(scene, (x, y) => {
      sampleCalls++;
      return sample(x, y);
    });
    try {
      const capital = GEOGRAPHY[world.countries.turkey.capital];
      const focus = {
        x: capital.x - MAP.width / 2,
        z: capital.y - MAP.height / 2,
      };
      const view = {
        paused: true,
        reduced: true,
        distance: 350 * Math.hypot(0.82, 0.68),
        focus,
      };
      railways.setQuality("low");
      railways.update(world);
      railways.animate(0, view);
      const steel = scene.getObjectByName("railway-steel-rails") as THREE.Mesh;
      const ballast = scene.getObjectByName(
        "railway-gravel-ballast",
      ) as THREE.Mesh;
      const geometry = steel.geometry,
        ballastGeometry = ballast.geometry;
      const positions = geometry.getAttribute("position"),
        indices = geometry.getIndex()!;
      assert.ok(
        railways.stats.edges > 20,
        "Test bütün Türkiye ağını kapsamalı",
      );
      assert.ok(
        positions.count > 1000 && positions.count < 100000,
        `Çelik geometri bütçesi: ${positions.count}`,
      );
      assert.ok(ballastGeometry.getAttribute("position").count < 100000);
      let tested = 0,
        misses = 0,
        buried = 0,
        minimumClearance = Infinity;
      let worstPoint = { mapX: 0, mapY: 0, steelY: 0, groundY: 0 };
      const check = (x: number, y: number, z: number) => {
        assert.ok([x, y, z].every(Number.isFinite));
        const ground = independentHeight(x, z);
        if (!Number.isFinite(ground)) {
          misses++;
          return;
        }
        tested++;
        const clearance = y - ground;
        if (clearance < minimumClearance) {
          minimumClearance = clearance;
          worstPoint = {
            mapX: x + MAP.width / 2,
            mapY: z + MAP.height / 2,
            steelY: y,
            groundY: ground,
          };
        }
        if (clearance < -0.001) buried++;
      };
      for (let i = 0; i < positions.count; i++)
        check(positions.getX(i), positions.getY(i), positions.getZ(i));
      // Vertices alone miss a terrain ridge cutting through a long steel face.
      const barycentric = [
        [1 / 3, 1 / 3],
        [0.5, 0],
        [0, 0.5],
        [0.5, 0.5],
        [0.25, 0.25],
        [0.25, 0.5],
        [0.5, 0.25],
      ];
      for (let face = 0; face < indices.count; face += 3) {
        const a = indices.getX(face),
          b = indices.getX(face + 1),
          c = indices.getX(face + 2);
        for (const [u, v] of barycentric) {
          const w = 1 - u - v;
          check(
            positions.getX(a) * u +
              positions.getX(b) * v +
              positions.getX(c) * w,
            positions.getY(a) * u +
              positions.getY(b) * v +
              positions.getY(c) * w,
            positions.getZ(a) * u +
              positions.getZ(b) * v +
              positions.getZ(c) * w,
          );
        }
      }
      assert.ok(
        tested > 20000 && tested > misses * 10,
        `Yetersiz arazi kontrolü: ${tested} isabet, ${misses} boşluk`,
      );
      assert.equal(
        buried,
        0,
        `${maxEdge}: ${buried}/${tested} çelik örneği gömülü; en düşük açıklık ${minimumClearance}; ${positions.count} köşe; ${JSON.stringify(worstPoint)}`,
      );
      assert.deepEqual(world, before);

      const unchangedCalls = sampleCalls;
      for (let frame = 1; frame <= 3; frame++)
        railways.animate(frame / 10, view);
      assert.equal(
        sampleCalls,
        unchangedCalls,
        "Duran aynı görünüm araziyi yeniden örneklememeli",
      );
      world.day++;
      world.countries.turkey.equipment.rifle += 30;
      const afterEconomy = structuredClone(world);
      railways.update(world);
      assert.equal(
        sampleCalls,
        unchangedCalls,
        "Ekonomi değişimi rayları yeniden örneklememeli",
      );
      railways.animate(0.4, {
        ...view,
        focus: { x: focus.x + 0.1, z: focus.z + 0.1 },
      });
      assert.equal(steel.geometry, geometry);
      assert.equal(ballast.geometry, ballastGeometry);
      assert.ok(
        sampleCalls - unchangedCalls <= 6 * 13,
        "Küçük kaydırmada yalnız görünür tren pozları örneklenebilir; raylar yeniden üretilemez",
      );
      const beforeBucketPan = sampleCalls;
      railways.animate(0.45, {
        ...view,
        focus: { x: focus.x + 90, z: focus.z },
      });
      assert.equal(
        steel.geometry,
        geometry,
        "Başka kamera bölmesinde aynı bütün hatlar görünüyorsa ray geometrisi korunmalı",
      );
      assert.equal(ballast.geometry, ballastGeometry);
      assert.ok(
        sampleCalls - beforeBucketPan <= 6 * 13,
        "Aynı hat seçimi tekrar arazi kırımı/dolgu hesabı yapmamalı",
      );
      assert.deepEqual(world, afterEconomy);

      const beforeChangedSelection = sampleCalls;
      const fullEdgeCount = railways.stats.edges;
      railways.animate(0.46, {
        ...view,
        focus: { x: focus.x + 330, z: focus.z },
      });
      assert.ok(railways.stats.edges < fullEdgeCount);
      railways.animate(0.47, view);
      assert.equal(railways.stats.edges, fullEdgeCount);
      assert.ok(
        sampleCalls - beforeChangedSelection < 10000,
        "Değişen pencere mevcut bağlantıların pahalı arazi uyumunu yeniden hesaplamamalı",
      );

      let trainGroundSamples = 0;
      for (let frame = 5; frame <= 25; frame++) {
        railways.animate(frame / 10, { ...view, reduced: false });
        assert.ok(railways.stats.trains > 0 && railways.stats.trains <= 6);
        for (const point of railways.stats.positions) {
          assert.ok([point.x, point.y, point.z].every(Number.isFinite));
          const ground = independentHeight(point.x, point.z);
          if (Number.isFinite(ground)) {
            trainGroundSamples++;
            assert.ok(
              point.y >= ground + 0.46 * TRAIN_WORLD_SCALE - 0.001,
              "Lokomotif çizilen araziye veya yerel demiryolu dolgusuna oturmalı",
            );
          }
        }
      }
      assert.ok(trainGroundSamples > 20);
      let steelDisposals = 0,
        ballastDisposals = 0;
      steel.geometry.addEventListener("dispose", () => steelDisposals++);
      ballast.geometry.addEventListener("dispose", () => ballastDisposals++);
      railways.dispose();
      railways.dispose();
      assert.equal(steelDisposals, 1);
      assert.equal(ballastDisposals, 1);
      assert.equal(scene.children.length, 0);
    } finally {
      railways.dispose();
      terrain.dispose();
    }
  });
}

test("Diyarbakır–Van arazi kırığında lokomotif ve vagon tekerlekleri yer altına girmez", () => {
  const world = createWorld("turkey", "historical", 171);
  world.countries.turkey.capital = "turkey-8";
  for (const province of Object.values(world.provinces))
    province.buildings.rail = ["turkey-8", "turkey-city-32"].includes(
      province.id,
    )
      ? 2
      : 0;
  const before = structuredClone(world);
  const terrain = buildTerrain({ maxEdge: 24 });
  const independentHeight = terrainRayReference(terrain.geometry);
  const scene = new THREE.Scene();
  const railways = createRailways(
    scene,
    createTerrainSurfaceSampler(terrain.geometry),
  );
  try {
    railways.setQuality("low");
    railways.update(world);
    const wheels = scene.getObjectByName(
      "detailed-train-spoked-wheels",
    ) as THREE.InstancedMesh;
    // Read the actual model's outer rim vertices, rather than assuming a wheel
    // radius/axle position that could diverge from the emitted model.
    const position = wheels.geometry.getAttribute("position");
    const uniqueRim = new Map<string, THREE.Vector3>();
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      if (Math.hypot(p.x, p.y) < 0.54) continue;
      uniqueRim.set(
        p
          .toArray()
          .map((n) => n.toFixed(6))
          .join(":"),
        p,
      );
    }
    assert.ok(uniqueRim.size >= 24);
    const matrix = new THREE.Matrix4(),
      point = new THREE.Vector3();
    let checked = 0,
      nearStep = 0,
      buried = 0,
      worst = 0;
    let worstPoint = { x: 0, y: 0, z: 0 };
    const focus = {
      x: 1009.6207 - MAP.width / 2,
      z: 737.8987 - MAP.height / 2,
    };
    for (let frame = 0; frame <= 300; frame++) {
      railways.animate(frame / 10, {
        paused: true,
        reduced: false,
        distance: 220,
        focus,
      });
      assert.ok(railways.stats.trains > 0);
      for (let instance = 0; instance < wheels.count; instance++) {
        wheels.getMatrixAt(instance, matrix);
        assert.ok(matrix.elements.every(Number.isFinite));
        const centerY = matrix.elements[13];
        for (const rim of uniqueRim.values()) {
          point.copy(rim).applyMatrix4(matrix);
          if (point.y > centerY + 0.0001) continue;
          const ground = independentHeight(point.x, point.z);
          if (!Number.isFinite(ground)) continue;
          checked++;
          if (Math.hypot(point.x - focus.x, point.z - focus.z) < 3) nearStep++;
          const depth = ground - point.y;
          if (depth > 0.001) buried++;
          if (depth > worst) {
            worst = depth;
            worstPoint = {
              x: point.x + MAP.width / 2,
              y: point.y,
              z: point.z + MAP.height / 2,
            };
          }
        }
      }
    }
    assert.ok(
      checked > 10000 && nearStep > 100,
      `Kırık üzerinde yeterli gerçek tekerlek örneği yok: ${checked}/${nearStep}`,
    );
    assert.equal(
      buried,
      0,
      `${buried} tekerlek noktası gömülü; derinlik ${worst}; ${JSON.stringify(worstPoint)}`,
    );
    assert.deepEqual(world, before);
  } finally {
    railways.dispose();
    terrain.dispose();
  }
});
