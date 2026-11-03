import * as THREE from "three";

/** Cloth, armour, rubber and steel share draw batches, not their PBR response.
 * Surface values are baked into the original model's vertices once. */
export function createLandMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.83,
    metalness: 0.08,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec2 unitSurface;
varying vec2 fieldSurface;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
fieldSurface = unitSurface;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 fieldSurface;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(fieldSurface.x, 0.08, 1.0);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = clamp(fieldSurface.y, 0.0, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => "xarmy-field-unit-surfaces-v1";
  return material;
}
