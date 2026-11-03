import * as THREE from "three";
import { MAP } from "./world";
import {
  containsProvincePoint,
  heightAt,
  provincePolygons,
} from "./map3d-geometry";
import {
  visualRandom,
  visualSeed,
  type GraphicsQuality,
} from "./map3d-visuals";
import type { World } from "./types";

export interface CityLightSite {
  readonly province: string;
  readonly x: number;
  readonly y: number;
  readonly tier: number;
}

const CLUSTERS: Record<GraphicsQuality, number> = {
  low: 1,
  medium: 2,
  high: 3,
  ultra: 4,
};
let siteCache: readonly CityLightSite[] | undefined;

/** Geography only: these are decorative settlements, not intelligence about
 * power production, hidden factories or enemy units. Never use campaign RNG. */
export function cityLightSites(): readonly CityLightSite[] {
  if (siteCache) return siteCache;
  const tiers: CityLightSite[][] = [[], [], [], []];
  for (const province of MAP.provinces) {
    let anchor = { x: province.x, y: province.y };
    if (!containsProvincePoint(province.id, anchor.x, anchor.y)) {
      const part = provincePolygons(province.id)
        .slice()
        .sort((a, b) => b.outer.length - a.outer.length)[0];
      if (!part) continue;
      const left = Math.min(...part.outer.map((p) => p.x));
      const right = Math.max(...part.outer.map((p) => p.x));
      const top = Math.min(...part.outer.map((p) => p.y));
      const bottom = Math.max(...part.outer.map((p) => p.y));
      const candidates: { x: number; y: number }[] = [];
      for (let row = 0; row < 15; row++)
        for (let column = 0; column < 15; column++) {
          const x = left + ((column + 0.5) / 15) * (right - left);
          const y = top + ((row + 0.5) / 15) * (bottom - top);
          if (containsProvincePoint(province.id, x, y))
            candidates.push({ x, y });
        }
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - province.x, a.y - province.y) -
          Math.hypot(b.x - province.x, b.y - province.y),
      );
      if (!candidates.length) continue;
      anchor = candidates[0];
    }
    tiers[0].push({ province: province.id, ...anchor, tier: 0 });
    const random = visualRandom(visualSeed(`city-night:${province.id}`));
    for (let tier = 1; tier < tiers.length; tier++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = random() * Math.PI * 2;
        const radius = (1.6 + random() * 2.6) * (1 + tier * 0.16);
        const x = anchor.x + Math.cos(angle) * radius;
        const y = anchor.y + Math.sin(angle) * radius;
        if (!containsProvincePoint(province.id, x, y)) continue;
        tiers[tier].push({ province: province.id, x, y, tier });
        break;
      }
    }
  }
  siteCache = Object.freeze(tiers.flat().map((site) => Object.freeze(site)));
  return siteCache;
}

/** One instanced billboard batch. No dynamic lights, texture downloads or
 * screen-sized post-processing pass; all animation is deliberately absent. */
export function createCityLights(
  scene: THREE.Scene,
  groundHeightAt: (x: number, y: number) => number = heightAt,
) {
  const sites = cityLightSites();
  const cityCount = sites.filter((site) => site.tier === 0).length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex()!.clone());
  geometry.setAttribute("position", quad.getAttribute("position").clone());
  geometry.setAttribute("uv", quad.getAttribute("uv").clone());
  quad.dispose();
  const positions = new Float32Array(sites.length * 3);
  const strengths = new Float32Array(sites.length);
  const sizes = new Float32Array(sites.length);
  for (let index = 0; index < sites.length; index++) {
    const site = sites[index];
    positions[index * 3] = site.x - MAP.width / 2;
    positions[index * 3 + 1] = groundHeightAt(site.x, site.y) + 1.4;
    positions[index * 3 + 2] = site.y - MAP.height / 2;
  }
  geometry.setAttribute(
    "cityPosition",
    new THREE.InstancedBufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "cityStrength",
    new THREE.InstancedBufferAttribute(strengths, 1),
  );
  geometry.setAttribute(
    "citySize",
    new THREE.InstancedBufferAttribute(sizes, 1),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: { viewScale: { value: 1 } },
    vertexShader: `
attribute vec3 cityPosition;
attribute float cityStrength;
attribute float citySize;
uniform float viewScale;
varying vec2 glowUV;
varying float glowStrength;
void main() {
  glowUV = uv * 2.0 - 1.0;
  glowStrength = cityStrength;
  vec4 center = modelViewMatrix * vec4(cityPosition, 1.0);
  center.xy += position.xy * citySize * viewScale;
  gl_Position = projectionMatrix * center;
}`,
    fragmentShader: `
varying vec2 glowUV;
varying float glowStrength;
void main() {
  float radius = dot(glowUV, glowUV);
  if (radius > 1.0) discard;
  float halo = exp(-radius * 5.5) * 0.18;
  float core = exp(-radius * 75.0) * 0.78;
  float alpha = (halo + core) * glowStrength * (1.0 - smoothstep(0.65, 1.0, radius));
  vec3 amber = vec3(1.0, 0.52, 0.16);
  vec3 ivory = vec3(1.0, 0.89, 0.63);
  gl_FragColor = vec4(mix(amber, ivory, exp(-radius * 45.0)), alpha);
  #include <colorspace_fragment>
}`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "night-city-lights";
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  let disposed = false;
  let quality: GraphicsQuality = "medium";
  let signature = "";
  let capitalCount = 0;
  let uploads = 0;
  const recolor = (capitals: Set<string>) => {
    capitalCount = 0;
    for (let index = 0; index < sites.length; index++) {
      const site = sites[index];
      const capital = capitals.has(site.province);
      if (capital && site.tier === 0) capitalCount++;
      strengths[index] = site.tier === 0 ? (capital ? 0.95 : 0.64) : 0.3;
      sizes[index] = site.tier === 0 ? (capital ? 10.5 : 7) : 4.5;
    }
    geometry.getAttribute("cityStrength").needsUpdate = true;
    geometry.getAttribute("citySize").needsUpdate = true;
    uploads++;
  };
  const setCount = () => {
    const tiers = CLUSTERS[quality];
    geometry.instanceCount = sites.findIndex((site) => site.tier >= tiers);
    if (geometry.instanceCount < 0) geometry.instanceCount = sites.length;
  };
  recolor(new Set(MAP.countries.map((country) => country.capital)));
  setCount();
  return {
    update(world: World) {
      if (disposed) return;
      const capitals = new Set(
        Object.values(world.countries).map((country) => country.capital),
      );
      const next = [...capitals].sort().join("|");
      if (next === signature) return;
      signature = next;
      recolor(capitals);
    },
    setQuality(value: GraphicsQuality) {
      if (disposed || quality === value) return;
      quality = value;
      setCount();
    },
    updateView(distance: number) {
      if (disposed) return;
      material.uniforms.viewScale.value = THREE.MathUtils.clamp(
        (Number.isFinite(distance) ? distance : 750) / 750,
        0.18,
        1.65,
      );
    },
    stats() {
      return {
        cities: cityCount,
        lights: disposed ? 0 : geometry.instanceCount,
        capitalCount,
        uploads,
        drawCalls: disposed ? 0 : 1,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
