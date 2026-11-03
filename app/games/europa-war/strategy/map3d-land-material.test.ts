import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLandMaterial } from "./map3d-land-material";
import { createFieldSurfaceTexture } from "./map3d-material-texture";
import { createUnitModels } from "./map3d-units";
import type { Army } from "./types";

/** Use the installed renderer's actual source order, not a synthetic shader. */
function compileHook(material: THREE.MeshStandardMaterial) {
  const standard = THREE.ShaderLib.standard;
  const shader = {
    uniforms: THREE.UniformsUtils.clone(standard.uniforms),
    vertexShader: standard.vertexShader,
    fragmentShader: standard.fragmentShader,
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

test("Field surface masks are deterministic, bounded and mipmapped for distant models", () => {
  const first = createFieldSurfaceTexture(),
    second = createFieldSurfaceTexture();
  try {
    assert.equal(first.image.width, 128);
    assert.equal(first.image.height, 128);
    const pixels = first.image.data;
    assert.ok(pixels instanceof Uint8Array);
    assert.equal(pixels.byteLength, 64 * 1024);
    assert.notEqual(pixels, second.image.data);
    assert.deepEqual(pixels, second.image.data);
    for (let channel = 0; channel < 3; channel++) {
      const values = new Set<number>();
      let sum = 0;
      for (let index = channel; index < pixels.length; index += 4) {
        sum += pixels[index];
        values.add(pixels[index]);
      }
      const mean = sum / (128 * 128);
      assert.ok(values.size > 20, `Mask ${channel} contains real variation`);
      assert.ok(mean > 110 && mean < 145, `Mask ${channel} is centered`);
    }
    for (let index = 3; index < pixels.length; index += 4)
      assert.equal(pixels[index], 255);
    assert.equal(first.wrapS, THREE.RepeatWrapping);
    assert.equal(first.wrapT, THREE.RepeatWrapping);
    assert.equal(first.magFilter, THREE.LinearFilter);
    assert.equal(first.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(first.generateMipmaps, true);
    assert.equal(first.colorSpace, THREE.NoColorSpace);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("Field materials share their sampler across recompiles and own independent texture lifetimes", () => {
  const first = createLandMaterial(),
    second = createLandMaterial();
  const firstShader = compileHook(first),
    repeatedShader = compileHook(first),
    secondShader = compileHook(second);
  const firstTexture = firstShader.uniforms.fieldSurfaceMap
    .value as THREE.DataTexture;
  const secondTexture = secondShader.uniforms.fieldSurfaceMap
    .value as THREE.DataTexture;
  assert.equal(repeatedShader.uniforms.fieldSurfaceMap.value, firstTexture);
  assert.notEqual(secondTexture, firstTexture);
  let firstReleased = 0,
    secondReleased = 0;
  firstTexture.addEventListener("dispose", () => firstReleased++);
  secondTexture.addEventListener("dispose", () => secondReleased++);
  first.dispose();
  assert.equal(firstReleased, 1);
  assert.equal(secondReleased, 0, "Another renderer retains its texture");
  second.dispose();
  assert.equal(secondReleased, 1);
});

test("Surface shading integrates with the real Standard shader without replacing its lighting pipeline", () => {
  const material = createLandMaterial();
  try {
    const shader = compileHook(material);
    assert.equal(material.vertexColors, true);
    assert.equal(material.emissive.getHex(), 0);
    assert.equal(
      material.map,
      null,
      "Triplanar masks do not require per-part UVs",
    );
    for (const chunk of [
      "color_fragment",
      "roughnessmap_fragment",
      "metalnessmap_fragment",
      "normal_fragment_begin",
      "lights_fragment_begin",
      "lights_fragment_end",
      "tonemapping_fragment",
      "colorspace_fragment",
    ]) {
      assert.equal(
        shader.fragmentShader.split(`#include <${chunk}>`).length - 1,
        1,
        `The standard ${chunk} stage remains present once`,
      );
    }
    const masks = shader.fragmentShader.indexOf("vec3 fieldMasks =");
    assert.ok(
      masks > shader.fragmentShader.indexOf("#include <color_fragment>"),
    );
    assert.ok(
      masks < shader.fragmentShader.indexOf("#include <roughnessmap_fragment>"),
    );
    assert.ok(
      shader.fragmentShader.indexOf("reflectedLight.indirectDiffuse +=") >
        shader.fragmentShader.indexOf("#include <lights_fragment_end>"),
      "The model fill augments the computed light instead of being overwritten",
    );
    for (const attribute of ["unitSurface", "unitCloth", "unitUniform"])
      assert.match(
        shader.vertexShader,
        new RegExp(`attribute \\w+ ${attribute};`),
      );
    assert.ok(
      shader.uniforms.fieldSurfaceMap.value instanceof THREE.DataTexture,
    );
  } finally {
    material.dispose();
  }
});

test("Shared unit-model teardown releases the procedural texture once with all render batches", () => {
  const scene = new THREE.Scene();
  const models = createUnitModels(scene);
  assert.equal(models.stats.modelParts, 0);
  models.update(
    ["germany", "france"].map((country) => ({
      armies: Array.from(
        { length: 4 },
        (_, index) =>
          ({ id: `${country}-${index}`, country, type: "infantry" }) as Army,
      ),
      position: new THREE.Vector3(),
      angle: 0,
      moving: false,
      tint: 0xffffff,
      combat: { key: country, target: new THREE.Vector3(80, 0, 80) },
      capture: { key: country, progress: 0.2 },
    })),
    0,
    { quality: "medium", distance: 450 },
  );
  const batches = scene.children.filter(
    (object) =>
      object instanceof THREE.InstancedMesh &&
      object.name.startsWith("unit-") &&
      (object.material as THREE.Material)
        .customProgramCacheKey()
        .startsWith("xarmy-field-unit-"),
  ) as THREE.InstancedMesh[];
  assert.equal(batches.length, models.stats.modelParts);
  assert.ok(
    batches.length > 15,
    "both national model sets share one surface material",
  );
  const material = batches[0].material as THREE.MeshStandardMaterial;
  assert.ok(batches.every((batch) => batch.material === material));
  const texture = compileHook(material).uniforms.fieldSurfaceMap
    .value as THREE.DataTexture;
  let released = 0,
    materialReleased = 0;
  const geometries = new Map(batches.map((batch) => [batch.geometry, 0]));
  geometries.forEach((_, geometry) =>
    geometry.addEventListener("dispose", () =>
      geometries.set(geometry, geometries.get(geometry)! + 1),
    ),
  );
  material.addEventListener("dispose", () => materialReleased++);
  texture.addEventListener("dispose", () => released++);
  models.dispose();
  models.dispose();
  assert.equal(released, 1);
  assert.equal(materialReleased, 1);
  assert.ok([...geometries.values()].every((count) => count === 1));
  assert.equal(scene.children.length, 0);
});
