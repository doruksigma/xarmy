import * as THREE from "three";
import type { GraphicsQuality } from "./map3d-visuals";

export const MAX_COMBAT_GLOWS = 256;
export const MAX_GROUND_GLOWS = 128;
export const COMBAT_LIGHT_BUDGET = {
  low: 0,
  medium: 0,
  high: 2,
  ultra: 4,
} as const;
export type CombatGlowKind = "muzzle" | "projectile" | "impact" | "headlamp";

/** Presentation light pool: callers supply positions from an actual shot or
 * moving truck. No shadow maps, canvas textures, simulation state or timers. */
export function createCombatLighting(
  scene: THREE.Scene,
  groundHeightAt?: (x: number, z: number) => number,
) {
  const group = new THREE.Group();
  group.name = "unit-combat-lighting";
  const build = (ground: boolean, capacity: number) => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    if (ground) geometry.rotateX(-Math.PI / 2);
    const tint = new Float32Array(capacity * 3);
    const strength = new Float32Array(capacity);
    geometry.setAttribute(
      "glowTint",
      new THREE.InstancedBufferAttribute(tint, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "glowStrength",
      new THREE.InstancedBufferAttribute(strength, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const material = new THREE.ShaderMaterial({
      vertexShader: `
attribute vec3 glowTint;
attribute float glowStrength;
varying vec2 glowUV;
varying vec3 tint;
varying float strength;
void main(){
  glowUV = uv * 2.0 - 1.0;
  tint = glowTint;
  strength = glowStrength;
  ${
    ground
      ? "gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);"
      : `vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += position.xy * length(instanceMatrix[0].xyz);
  gl_Position = projectionMatrix * center;`
  }
}`,
      fragmentShader: `
varying vec2 glowUV;
varying vec3 tint;
varying float strength;
void main(){
  float radius = dot(glowUV, glowUV);
  if(radius > 1.0) discard;
  float halo = exp(-radius * ${ground ? "3.5" : "5.0"}) * ${ground ? "0.22" : "0.38"};
  float core = exp(-radius * 55.0) * ${ground ? "0.0" : "0.75"};
  float alpha = (halo + core) * strength * (1.0 - smoothstep(0.7, 1.0, radius));
  gl_FragColor = vec4(tint, alpha);
  #include <colorspace_fragment>
}`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = ground ? "unit-ground-glows" : "unit-combat-glows";
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = ground ? 3 : 5;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return { mesh, geometry, material, tint, strength };
  };
  const halos = build(false, MAX_COMBAT_GLOWS);
  const ground = build(true, MAX_GROUND_GLOWS);
  const batches = [halos, ground];
  const lights = Array.from({ length: 4 }, (_, i) => {
    const light = new THREE.PointLight(0xffbc6b, 0, 48, 2);
    light.name = `unit-combat-light-${i}`;
    light.castShadow = false;
    light.visible = false;
    group.add(light);
    return light;
  });
  const lightScores = new Float32Array(lights.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const stats = { glows: 0, groundGlows: 0, dynamicLights: 0, headlights: 0 };
  let budget = 0,
    disposed = false;
  scene.add(group);
  const write = (
    batch: typeof halos,
    index: number,
    size: number,
    power: number,
  ) => {
    transform.scale.setScalar(size);
    transform.updateMatrix();
    batch.mesh.setMatrixAt(index, transform.matrix);
    batch.tint[index * 3] = color.r;
    batch.tint[index * 3 + 1] = color.g;
    batch.tint[index * 3 + 2] = color.b;
    batch.strength[index] = power;
  };
  return {
    stats,
    begin(quality: GraphicsQuality, distance: number) {
      if (disposed) return;
      const configured = COMBAT_LIGHT_BUDGET[quality];
      budget = distance < 900 ? configured : 0;
      stats.glows =
        stats.groundGlows =
        stats.dynamicLights =
        stats.headlights =
          0;
      lightScores.fill(0);
      // Shader light count depends only on quality, never on the flash cycle
      // or crossing a zoom boundary. Far lights remain pooled at zero power.
      for (let i = 0; i < lights.length; i++) {
        lights[i].visible = i < configured;
        lights[i].intensity = 0;
      }
    },
    emit(
      position: THREE.Vector3,
      size: number,
      power: number,
      kind: CombatGlowKind,
    ) {
      if (
        disposed ||
        stats.glows >= MAX_COMBAT_GLOWS ||
        !Number.isFinite(position.x + position.y + position.z + size + power) ||
        size <= 0 ||
        power <= 0
      )
        return;
      color.setHex(
        kind === "headlamp"
          ? 0xffe4ae
          : kind === "projectile"
            ? 0xffe9a9
            : kind === "impact"
              ? 0xff963e
              : 0xffc773,
      );
      transform.position.copy(position);
      transform.rotation.set(0, 0, 0);
      write(halos, stats.glows++, size, power);
      if (kind === "headlamp") stats.headlights++;
      // Ground patches are a cheap local illumination alternative on mobile.
      // The same terrain sampler as unit placement keeps them above the ground.
      if (
        kind !== "projectile" &&
        groundHeightAt &&
        stats.groundGlows < MAX_GROUND_GLOWS
      ) {
        const height = groundHeightAt(position.x, position.z);
        if (Number.isFinite(height)) {
          transform.position.set(position.x, height + 0.25, position.z);
          write(
            ground,
            stats.groundGlows++,
            size * (kind === "impact" ? 2.8 : 3.2),
            power * 0.8,
          );
        }
      }
      if (!budget) return;
      const score =
        power *
        (kind === "impact"
          ? 12
          : kind === "muzzle"
            ? 10
            : kind === "projectile"
              ? 3
              : 0.6);
      let weakest = 0;
      for (let i = 1; i < budget; i++)
        if (lightScores[i] < lightScores[weakest]) weakest = i;
      if (score <= lightScores[weakest]) return;
      lightScores[weakest] = score;
      const light = lights[weakest];
      light.position.copy(position);
      light.color.copy(color);
      light.intensity =
        (kind === "headlamp" ? 70 : kind === "projectile" ? 140 : 650) * power;
      light.distance =
        kind === "headlamp" ? 24 : kind === "projectile" ? 30 : 48;
    },
    finish() {
      if (disposed) return;
      halos.mesh.count = stats.glows;
      ground.mesh.count = stats.groundGlows;
      for (const batch of batches) {
        batch.mesh.visible = batch.mesh.count > 0;
        batch.mesh.instanceMatrix.needsUpdate = true;
        batch.geometry.getAttribute("glowTint").needsUpdate = true;
        batch.geometry.getAttribute("glowStrength").needsUpdate = true;
      }
      stats.dynamicLights = 0;
      for (const light of lights)
        if (light.visible && light.intensity > 0) stats.dynamicLights++;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stats.glows =
        stats.groundGlows =
        stats.dynamicLights =
        stats.headlights =
          0;
      for (const batch of batches) {
        batch.mesh.dispose();
        batch.geometry.dispose();
        batch.material.dispose();
      }
      for (const light of lights) light.dispose();
      group.clear();
      scene.remove(group);
    },
  };
}
