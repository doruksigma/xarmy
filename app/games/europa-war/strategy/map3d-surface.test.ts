import assert from "node:assert/strict";
import test from "node:test";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import map from "./map-data.json";
import { buildTerrain, heightAt } from "./map3d-geometry";
import { createTerrainSurfaceSampler } from "./map3d-surface";

type Vertex = [number, number, number];

function makeGeometry(vertices: Vertex[], indices?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      vertices.flatMap(([x, height, y]) => [
        x - map.width / 2,
        height,
        y - map.height / 2,
      ]),
      3,
    ),
  );
  if (indices) geometry.setIndex(indices);
  return geometry;
}

function downwardProbe(geometry: BufferGeometry) {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  const ray = new Raycaster();
  mesh.updateMatrixWorld();
  return {
    height(x: number, y: number) {
      ray.set(
        new Vector3(x - map.width / 2, 1000, y - map.height / 2),
        new Vector3(0, -1, 0),
      );
      return ray.intersectObject(mesh)[0]?.point.y;
    },
    dispose: () => material.dispose(),
  };
}

function close(actual: number, expected: number, label = "height") {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${label}: ${actual} !== ${expected}`,
  );
}

test("yüzey örnekleyici indisli ve indissiz üçgen içlerini, köşeleri ve ortak kenarları tam yükseklikte örnekler", () => {
  const vertices: Vertex[] = [
    [100, 5, 100],
    [200, 15, 100],
    [200, 40, 200],
    [100, 20, 200],
  ];
  const indexed = makeGeometry(vertices, [0, 1, 2, 0, 2, 3]);
  const nonindexed = indexed.toNonIndexed();
  for (const geometry of [indexed, nonindexed]) {
    const surface = createTerrainSurfaceSampler(geometry);
    const probe = downwardProbe(geometry);
    for (const [x, y] of [
      [100, 100],
      [200, 100],
      [200, 200],
      [100, 200],
      [150, 150],
      [140, 110],
      [120, 170],
      [124, 130],
      [172, 175],
    ]) {
      const actual = probe.height(x, y);
      assert.notEqual(actual, undefined);
      close(surface(x, y), actual!, `${x},${y}`);
    }
    close(surface(150, 150), 22.5);
    probe.dispose();
    geometry.dispose();
  }
});

test("örtüşen yüzeylerde aşağı doğru ışın gibi en yüksek üçgeni seçer", () => {
  const geometry = makeGeometry([
    [100, 3, 100],
    [200, 3, 100],
    [100, 3, 200],
    [100, 9, 100],
    [200, 11, 100],
    [100, 13, 200],
  ]);
  const surface = createTerrainSurfaceSampler(geometry);
  const probe = downwardProbe(geometry);
  close(surface(120, 120), 10.2);
  close(surface(120, 120), probe.height(120, 120)!);
  probe.dispose();
  geometry.dispose();
});

test("çok büyük üçgenler sınırlı hücre çoğaltmasıyla yine doğru örneklenir", () => {
  const geometry = makeGeometry([
    [-10000, 2, -10000],
    [10000, 12, -10000],
    [-10000, 22, 10000],
  ]);
  const surface = createTerrainSurfaceSampler(geometry);
  const probe = downwardProbe(geometry);
  for (const [x, y] of [
    [0, 0],
    [-4500, 3250],
    [1700, -5000],
  ])
    close(surface(x, y), probe.height(x, y)!);
  probe.dispose();
  geometry.dispose();
});

test("delikler ve arazi dışı noktalar analitik alana döner, bozuk girişler sonlu kalır", () => {
  const ring = makeGeometry(
    [
      [100, 100, 100],
      [200, 100, 100],
      [200, 100, 200],
      [100, 100, 200],
      [125, 100, 125],
      [175, 100, 125],
      [175, 100, 175],
      [125, 100, 175],
    ],
    [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
  );
  const empty = new BufferGeometry();
  const degenerate = makeGeometry([
    [100, 0, 100],
    [100, 8, 100],
    [100, 12, 100],
    [NaN, 2, 0],
    [0, 0, Infinity],
    [0, NaN, 0],
  ]);
  const surface = createTerrainSurfaceSampler(ring);
  const probe = downwardProbe(ring);
  assert.equal(probe.height(150, 150), undefined);
  close(surface(150, 150), heightAt(150, 150));
  close(surface(110, 110), 100);
  for (const geometry of [ring, empty, degenerate]) {
    const sampler = createTerrainSurfaceSampler(geometry);
    for (const [x, y] of [
      [-2000, 3000],
      [NaN, 400],
      [600, Infinity],
    ])
      assert.ok(Number.isFinite(sampler(x, y)));
    close(sampler(-50, -50), heightAt(-50, -50));
    geometry.dispose();
  }
  probe.dispose();
});

test("örnekleyici geometriyi değiştirmez ve bölge rengi değişince yeniden kurulmaz", () => {
  const geometry = makeGeometry(
    [
      [100, 2, 100],
      [200, 4, 100],
      [100, 7, 200],
    ],
    [0, 1, 2],
  );
  geometry.setAttribute(
    "color",
    new Float32BufferAttribute(new Array(9).fill(1), 3),
  );
  const position = geometry.getAttribute("position");
  const positionSnapshot = Array.from(position.array);
  const index = geometry.getIndex()!;
  const indexSnapshot = Array.from(index.array);
  const surface = createTerrainSurfaceSampler(geometry);
  const before = surface(125, 125);
  const color = geometry.getAttribute("color");
  for (let i = 0; i < color.count; i++) color.setXYZ(i, 0.1, 0.2, 0.3);
  color.needsUpdate = true;
  assert.equal(surface(125, 125), before);
  assert.deepEqual(Array.from(position.array), positionSnapshot);
  assert.deepEqual(Array.from(index.array), indexSnapshot);
  assert.equal(geometry.getAttribute("position"), position);
  assert.equal(geometry.getIndex(), index);
  geometry.dispose();
});

for (const [quality, maxEdge] of (map.width > 2000
  ? [
      ["Low", 48],
      ["Medium", 32],
    ]
  : [
      ["Low", 24],
      ["Medium", 18],
    ]) as [string, number][]) {
  test(`${quality} gerçek arazi yüzeyi üçgen içi/kenar ve gömülen Türkiye raylarında raycast ile eşleşir`, () => {
    const terrain = buildTerrain({ maxEdge });
    const surface = createTerrainSurfaceSampler(terrain.geometry);
    const probe = downwardProbe(terrain.geometry);
    const position = terrain.geometry.getAttribute("position");
    let checked = 0;
    for (let vertex = 0; vertex < position.count; vertex += 3003) {
      for (const weights of [
        [1 / 3, 1 / 3, 1 / 3],
        [0.5, 0.5, 0],
      ]) {
        let x = 0,
          y = 0;
        for (let i = 0; i < 3; i++) {
          x += position.getX(vertex + i) * weights[i];
          y += position.getZ(vertex + i) * weights[i];
        }
        x += map.width / 2;
        y += map.height / 2;
        const actual = probe.height(x, y);
        // An isolated outer-edge ray may be numerically outside both neighboring
        // faces; all triangle centroids must have a real rendered hit.
        if (actual === undefined && weights[2] === 0) continue;
        assert.notEqual(actual, undefined);
        close(surface(x, y), actual!, `face ${vertex / 3}`);
        checked++;
      }
    }
    assert.ok(checked > 35);
    // Find the worst Turkish rail clearance in the current geographic frame.
    // Translating Europe onto the globe must not keep old absolute probe points.
    let buried: [number, number] = [0, 0],
      largestGap = -Infinity;
    for (let face = 0; face < terrain.faceProvinceIds.length; face++) {
      if (!terrain.faceProvinceIds[face].startsWith("turkey-")) continue;
      let x = 0,
        y = 0,
        height = 0;
      for (let i = 0; i < 3; i++) {
        x += position.getX(face * 3 + i) / 3;
        y += position.getZ(face * 3 + i) / 3;
        height += position.getY(face * 3 + i) / 3;
      }
      x += map.width / 2;
      y += map.height / 2;
      const gap = height - heightAt(x, y);
      if (gap > largestGap) {
        largestGap = gap;
        buried = [x, y];
      }
    }
    const actual = probe.height(buried[0], buried[1]);
    assert.notEqual(actual, undefined);
    close(surface(buried[0], buried[1]), actual!, "buried rail regression");
    assert.ok(
      actual! - heightAt(buried[0], buried[1]) > 1.4,
      "the source heightfield alone would leave the rail below the rendered terrain",
    );
    assert.equal(probe.height(10, 870), undefined);
    close(surface(10, 870), heightAt(10, 870));
    probe.dispose();
    terrain.dispose();
  });
}
