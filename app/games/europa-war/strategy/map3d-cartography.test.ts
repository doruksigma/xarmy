import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createWorld, MAP } from "./world";
import { buildTerrain } from "./map3d-geometry";
import {
  CARTOGRAPHIC_TERRAINS,
  configureCartographicTerrain,
  createPoliticalBorders,
  politicalBoundarySegments,
} from "./map3d-cartography";
import {
  NIGHT_COUNTRY_COLORS,
  politicalCountryColor,
} from "./map3d-cartography-palette";

test("Gece atlası bütün ülkeleri kapsar ve yeni ülke renklerini geçerli, ayırt edilebilir biçimde gösterir", () => {
  for (const country of MAP.countries) {
    assert.ok(Object.hasOwn(NIGHT_COUNTRY_COLORS, country.id));
    const css = politicalCountryColor(country.id, country.color);
    assert.match(css, /^#[\da-f]{6}$/i);
    assert.ok(new THREE.Color(css).getHSL({ h: 0, s: 0, l: 0 }).l < 0.4);
  }
  const rebel = politicalCountryColor("new-republic", "#d9b3b3");
  assert.match(rebel, /^#[\da-f]{6}$/i);
  assert.equal(rebel, politicalCountryColor("new-republic", "#d9b3b3"));
  assert.notEqual(rebel, politicalCountryColor("new-republic", "#9bd9b3"));
  for (const invalid of ["", "garbage", "#zzzzzz"])
    assert.match(
      politicalCountryColor("new-republic", invalid),
      /^#[\da-f]{6}$/i,
    );
  assert.match(politicalCountryColor("__proto__", "#b69"), /^#[\da-f]{6}$/i);
});

test("Gece kaplaması tematik harita rengini yıkamaz ve malzeme kancalarını temizler", () => {
  const material = new THREE.MeshStandardMaterial();
  let previousCalls = 0;
  const previousCompile = () => {
    previousCalls++;
  };
  const previousKey = () => "original-material-key";
  material.onBeforeCompile = previousCompile;
  material.customProgramCacheKey = previousKey;
  const layer = configureCartographicTerrain(material);
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>",
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.equal(previousCalls, 1);
  const wash = shader.uniforms.cartographicWash;
  layer.setMode("terrain");
  const terrainWash = wash.value;
  layer.setMode("political");
  assert.ok(wash.value > 0 && wash.value < terrainWash);
  for (const mode of ["supply", "diplomacy", "air", "naval"]) {
    layer.setMode(mode);
    assert.equal(wash.value, 0, "Categorical overlays retain their base hue");
  }
  layer.dispose();
  assert.equal(material.onBeforeCompile, previousCompile);
  assert.equal(material.customProgramCacheKey, previousKey);
  material.dispose();
});

test("Arazi kaplaması bütün seçilebilir üçgenlerde doğru gerçek arazi türünü taşır", () => {
  const terrain = buildTerrain({ maxEdge: 32 });
  const kinds = terrain.geometry.getAttribute("terrainType");
  assert.equal(kinds.count, terrain.geometry.getAttribute("position").count);
  for (const province of MAP.provinces) {
    const range = terrain.provinceVertexRanges.get(province.id)!;
    for (let index = range.start; index < range.start + range.count; index++)
      assert.equal(
        kinds.getX(index),
        CARTOGRAPHIC_TERRAINS[
          province.terrain as keyof typeof CARTOGRAPHIC_TERRAINS
        ].index,
      );
  }
  terrain.dispose();
});

test("Siyasi çizgiler ortak ülke içindeki şehir sınırlarını kalınlaştırmaz; ele geçirme ve savaş cepheyi değiştirir", () => {
  const world = createWorld("turkey", "historical", 1936);
  const before = structuredClone(world);
  const initial = politicalBoundarySegments(world);
  assert.ok(initial.some((edge) => edge.kind === "coast"));
  assert.ok(initial.some((edge) => edge.kind === "country"));
  for (const edge of initial.filter((edge) => edge.kind !== "coast"))
    assert.ok(
      new Set(edge.provinces.map((id) => world.provinces[id].controller)).size >
        1,
    );
  const countryEdge = initial.find((edge) => edge.kind === "country")!;
  const [a, b] = [
    ...new Set(
      countryEdge.provinces.map((id) => world.provinces[id].controller),
    ),
  ];
  world.countries[a].wars.push(b);
  world.countries[b].wars.push(a);
  const atWar = politicalBoundarySegments(world);
  assert.ok(
    atWar.some(
      (edge) =>
        edge.kind === "front" &&
        edge.from === countryEdge.from &&
        edge.to === countryEdge.to,
    ),
  );
  for (const province of Object.values(world.provinces))
    province.controller = "turkey";
  assert.ok(
    politicalBoundarySegments(world).every((edge) => edge.kind === "coast"),
  );
  assert.deepEqual(
    initial,
    politicalBoundarySegments(before),
    "Geography and source world remain reusable",
  );
});

test("Sınır tamponu saat, birlik ve seçim değişimlerinde korunur; gerçek kontrol değişiminde yenilenir", () => {
  const world = createWorld("turkey", "historical", 1936);
  const scene = new THREE.Scene();
  const borders = createPoliticalBorders(scene, () => 2);
  borders.update(world);
  const stats = { ...borders.stats };
  const mesh = scene.getObjectByName("cartographic-political-borders")!
    .children[0] as THREE.Mesh;
  const original = mesh.geometry;
  world.hour++;
  world.armies[0].organization -= 1;
  borders.update(world);
  assert.equal(mesh.geometry, original);
  assert.deepEqual(borders.stats, stats);
  world.provinces["turkey-0"].controller = "germany";
  borders.update(world);
  assert.notEqual(borders.stats.fingerprint, stats.fingerprint);
  assert.equal(borders.stats.rebuilds, stats.rebuilds + 1);
  assert.notEqual(mesh.geometry, original);
  assert.ok(borders.stats.countrySegments > stats.countrySegments);
  const positions = mesh.geometry.getAttribute("position");
  assert.ok(positions.count < 300_000, "Bounded batched geometry");
  for (const value of positions.array) assert.ok(Number.isFinite(value));
  for (let index = 0; index < positions.count; index++)
    assert.ok(positions.getY(index) > 2);
  borders.dispose();
  assert.equal(scene.children.length, 0);
  borders.update(world);
  assert.equal(scene.children.length, 0);
});
