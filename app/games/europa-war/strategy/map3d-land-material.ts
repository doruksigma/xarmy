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
attribute float unitCloth;
attribute vec3 unitUniform;
varying vec2 fieldSurface;
varying float fieldCloth;
varying vec3 fieldUniform;
varying vec3 fieldPosition;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
fieldSurface = unitSurface;
fieldCloth = unitCloth;
fieldUniform = unitUniform;
fieldPosition = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 fieldSurface;
varying float fieldCloth;
varying vec3 fieldUniform;
varying vec3 fieldPosition;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float clothShade = clamp(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.145, 0.45, 1.6);
float weave = sin(fieldPosition.x * 92.0) * sin(fieldPosition.y * 110.0) * 0.024;
diffuseColor.rgb = mix(diffuseColor.rgb, fieldUniform * clothShade * (1.0 + weave), fieldCloth);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float surfaceGrain = sin(dot(fieldPosition, vec3(93.1, 57.7, 81.3))) * 0.018;
roughnessFactor = clamp(fieldSurface.x + surfaceGrain, 0.08, 1.0);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = clamp(fieldSurface.y, 0.0, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => "xarmy-field-unit-surfaces-v2";
  return material;
}
