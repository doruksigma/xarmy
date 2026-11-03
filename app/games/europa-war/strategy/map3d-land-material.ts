import * as THREE from "three";
import { createFieldSurfaceTexture } from "./map3d-material-texture";

/** Cloth, armour, rubber and steel share draw batches, not their PBR response.
 * Surface values are baked into the original model's vertices once. */
export function createLandMaterial() {
  const surfaceTexture = createFieldSurfaceTexture();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.83,
    metalness: 0.08,
  });
  material.addEventListener("dispose", () => surfaceTexture.dispose());
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fieldSurfaceMap = { value: surfaceTexture };
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
varying vec3 fieldPosition;
varying vec3 fieldLocalNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
fieldSurface = unitSurface;
fieldCloth = unitCloth;
fieldUniform = unitUniform;
fieldPosition = position;
fieldLocalNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 fieldSurface;
varying float fieldCloth;
varying vec3 fieldUniform;
varying vec3 fieldPosition;
varying vec3 fieldLocalNormal;
uniform sampler2D fieldSurfaceMap;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float clothShade = clamp(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.145, 0.45, 1.6);
// Triplanar masks require no per-part UV seams. Mipmaps remove fine weave at distance.
vec3 fieldWeights = abs(normalize(fieldLocalNormal));
fieldWeights *= fieldWeights;
fieldWeights /= max(dot(fieldWeights, vec3(1.0)), 0.001);
vec3 fieldUV = fieldPosition * 0.7;
vec3 fieldMasks = texture2D(fieldSurfaceMap, fieldUV.yz).rgb * fieldWeights.x
                + texture2D(fieldSurfaceMap, fieldUV.xz).rgb * fieldWeights.y
                + texture2D(fieldSurfaceMap, fieldUV.xy).rgb * fieldWeights.z;
float weave = (fieldMasks.b - 0.5) * 0.13;
diffuseColor.rgb = mix(diffuseColor.rgb, fieldUniform * clothShade * (1.0 + weave), fieldCloth);
float fieldPatina = (fieldMasks.g - 0.5) * 0.13 + (fieldMasks.r - 0.5) * 0.025;
diffuseColor.rgb *= 1.0 + fieldPatina;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float surfaceGrain = (fieldMasks.r - 0.5) * 0.06 + (fieldMasks.g - 0.5) * 0.045;
roughnessFactor = clamp(fieldSurface.x + surfaceGrain, 0.08, 1.0);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = clamp(fieldSurface.y, 0.0, 1.0);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
// Modest model-only indirect fill keeps faces and equipment legible on the night map.
// This uses the existing shaded material; no extra scene lights or emissive bodies.
vec3 fieldWorldNormal = inverseTransformDirection(normal, viewMatrix);
vec3 fieldFill = mix(vec3(0.82, 0.88, 1.0), vec3(1.0, 0.95, 0.84), clamp(fieldWorldNormal.y * 0.5 + 0.5, 0.0, 1.0));
reflectedLight.indirectDiffuse += diffuseColor.rgb * fieldFill * 0.11 * (1.0 - metalnessFactor * 0.45);`,
      );
  };
  material.customProgramCacheKey = () => "xarmy-field-unit-surfaces-v3";
  return material;
}
