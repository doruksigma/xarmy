import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { cityLightSites, createCityLights } from "./map3d-city-lights";
import { containsProvincePoint } from "./map3d-geometry";
import { createWorld, MAP } from "./world";
import type { GraphicsQuality } from "./map3d-visuals";

test("Gece şehir ışıkları gerçek kara üzerindeki her şehri kapsar ve her kalitede tek çizim grubuyla sınırlıdır", () => {
  const sites = cityLightSites();
  const anchors = sites.filter((site) => site.tier === 0);
  assert.equal(anchors.length, MAP.provinces.length);
  assert.equal(
    new Set(anchors.map((site) => site.province)).size,
    MAP.provinces.length,
  );
  for (const site of sites) {
    assert.ok(Number.isFinite(site.x + site.y));
    assert.ok(
      containsProvincePoint(site.province, site.x, site.y),
      site.province,
    );
  }
  assert.equal(
    cityLightSites(),
    sites,
    "Static geography shares its bounded immutable cache",
  );
  const scene = new THREE.Scene();
  const lights = createCityLights(scene, () => 12);
  const mesh = scene.getObjectByName("night-city-lights") as THREE.Mesh<
    THREE.InstancedBufferGeometry,
    THREE.ShaderMaterial
  >;
  assert.ok(mesh);
  const positions = mesh.geometry.getAttribute("cityPosition");
  assert.equal(positions.count, sites.length);
  for (let i = 0; i < positions.count; i++) {
    assert.ok(
      Math.abs(positions.getY(i) - 13.4) < 0.0001,
      "Uses the actual terrain sampler",
    );
    assert.ok(
      Math.abs(positions.getX(i) + MAP.width / 2 - sites[i].x) < 0.0001,
    );
    assert.ok(
      Math.abs(positions.getZ(i) + MAP.height / 2 - sites[i].y) < 0.0001,
    );
  }
  const counts: number[] = [];
  for (const quality of [
    "low",
    "medium",
    "high",
    "ultra",
  ] as GraphicsQuality[]) {
    lights.setQuality(quality);
    const stats = lights.stats();
    assert.equal(stats.cities, MAP.provinces.length);
    assert.equal(stats.drawCalls, 1);
    assert.ok(
      stats.lights >= MAP.provinces.length &&
        stats.lights <= MAP.provinces.length * 4,
    );
    assert.equal(mesh.geometry.instanceCount, stats.lights);
    counts.push(stats.lights);
  }
  assert.equal(counts[0], MAP.provinces.length);
  assert.ok(counts.every((count, i) => !i || count > counts[i - 1]));
  assert.equal(
    scene.children.length,
    1,
    "No point lights or per-city mesh objects",
  );
  lights.dispose();
});

test("Saat, gizli düşman verisi ve kamera şehir ışıklarını yeniden kurmaz veya seferin RNG'sini değiştirmez", () => {
  const world = createWorld("turkey", "historical", 1936);
  const before = structuredClone(world);
  const scene = new THREE.Scene();
  const lights = createCityLights(scene, () => 0);
  lights.update(world);
  const mesh = scene.getObjectByName("night-city-lights") as THREE.Mesh<
    THREE.InstancedBufferGeometry,
    THREE.ShaderMaterial
  >;
  const originalPosition = mesh.geometry.getAttribute("cityPosition");
  const originalStrength = Array.from(
    mesh.geometry.getAttribute("cityStrength").array,
  );
  const uploads = lights.stats().uploads;
  for (const distance of [0, 140, 350, 1100, 10000, NaN])
    lights.updateView(distance);
  assert.ok(Number.isFinite(mesh.material.uniforms.viewScale.value));
  assert.deepEqual(world, before);
  const changed = structuredClone(world);
  changed.hour = 12;
  changed.provinces["germany-0"].damage = 100;
  changed.provinces["germany-0"].buildings.military = 20;
  const changedBefore = structuredClone(changed);
  lights.update(changed);
  assert.equal(lights.stats().uploads, uploads);
  assert.equal(mesh.geometry.getAttribute("cityPosition"), originalPosition);
  assert.deepEqual(
    Array.from(mesh.geometry.getAttribute("cityStrength").array),
    originalStrength,
  );
  assert.deepEqual(
    changed,
    changedBefore,
    "Visual updates must not change world or RNG",
  );
  const capital = cityLightSites().findIndex(
    (site) => site.province === "turkey-0" && site.tier === 0,
  );
  const replacement = cityLightSites().findIndex(
    (site) => site.province === "turkey-1" && site.tier === 0,
  );
  changed.countries.turkey.capital = "turkey-1";
  const previousStrength = mesh.geometry
    .getAttribute("cityStrength")
    .getX(capital);
  lights.update(changed);
  assert.equal(lights.stats().uploads, uploads + 1);
  assert.ok(
    mesh.geometry.getAttribute("cityStrength").getX(capital) < previousStrength,
  );
  assert.equal(
    mesh.geometry.getAttribute("cityStrength").getX(replacement),
    previousStrength,
  );
  lights.dispose();
});

test("Gece ışıkları tekrar tekrar güvenle temizlenir; kapalı sahne yeniden veri yüklemez", () => {
  const scene = new THREE.Scene();
  const lights = createCityLights(scene, () => 0);
  const mesh = scene.getObjectByName("night-city-lights") as THREE.Mesh<
    THREE.InstancedBufferGeometry,
    THREE.ShaderMaterial
  >;
  let geometries = 0,
    materials = 0;
  mesh.geometry.addEventListener("dispose", () => geometries++);
  mesh.material.addEventListener("dispose", () => materials++);
  lights.dispose();
  lights.dispose();
  const uploads = lights.stats().uploads;
  lights.update(createWorld("turkey"));
  lights.setQuality("ultra");
  lights.updateView(900);
  assert.equal(lights.stats().uploads, uploads);
  assert.equal(lights.stats().lights, 0);
  assert.equal(lights.stats().drawCalls, 0);
  assert.equal(scene.children.length, 0);
  assert.equal(geometries, 1);
  assert.equal(materials, 1);
});
