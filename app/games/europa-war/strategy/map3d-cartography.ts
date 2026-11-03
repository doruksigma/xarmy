import * as THREE from "three";
import { MAP } from "./world";
import {
  containsProvincePoint,
  heightAt,
  provincePolygons,
} from "./map3d-geometry";
import type { World } from "./types";

export { CARTOGRAPHIC_TERRAINS } from "./map3d-cartography-palette";

/** A cold engraved atlas surface, generated in the material's local space.
 * No texture downloads, simulation RNG or per-frame CPU texture uploads. */
export function configureCartographicTerrain(
  material: THREE.MeshStandardMaterial,
) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const terrainWash = { value: 0.07 };
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.cartographicWash = terrainWash;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float terrainType;
varying vec3 cartographicPosition;
varying float cartographicTerrain;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
cartographicPosition = position;
cartographicTerrain = terrainType;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float cartographicWash;
varying vec3 cartographicPosition;
varying float cartographicTerrain;
float atlasHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float atlasNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(atlasHash(i),atlasHash(i+vec2(1.,0.)),f.x),
             mix(atlasHash(i+vec2(0.,1.)),atlasHash(i+vec2(1.,1.)),f.x),f.y);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 atlas = cartographicPosition.xz;
float broad = atlasNoise(atlas*.043);
float detail = atlasNoise(atlas*.29);
float paper = atlasHash(floor(atlas*3.4));
float folds = 1.0-abs(atlasNoise(atlas*vec2(.108,.054)+broad*.9)*2.0-1.0);
float forest = 1.0-step(.4,abs(cartographicTerrain-3.));
float marsh = 1.0-step(.4,abs(cartographicTerrain-4.));
float desert = 1.0-step(.4,abs(cartographicTerrain-5.));
float mountain = smoothstep(7.,27.,cartographicPosition.y);
float grove = smoothstep(.36,.7,broad) * smoothstep(.28,.6,detail) * forest;
float ridge = smoothstep(.38,.88,folds) * mountain;
float grain = .76 + broad*.23 + detail*.085 + (paper-.5)*.024;
grain -= grove*.19 + mountain*(1.0-folds)*.18;
// Values below are linear-light colours, matching Three's vertex colour space.
// The political wash is deliberately weak: a black country must stay black,
// and supply/diplomacy overlays retain the meaning of their categorical hue.
vec3 wash = mix(vec3(.065,.084,.078),vec3(.19,.16,.11),desert);
wash = mix(wash,vec3(.028,.052,.039),forest*.7);
wash = mix(wash,vec3(.03,.06,.066),marsh*.7);
wash = mix(wash,vec3(.13,.15,.18),mountain*.55);
diffuseColor.rgb = mix(diffuseColor.rgb, wash, cartographicWash) * grain;
diffuseColor.rgb += vec3(.12,.145,.19)*ridge*.055;
// Broken snow crests expose the mountain chain rather than bleaching a whole
// province. This relief remains fixed when time, weather or ownership changes.
float snow = smoothstep(27.,36.,cartographicPosition.y+folds*3.0) * (.25+folds*.4);
diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.46,.51,.60),snow);`,
      );
  };
  material.customProgramCacheKey = () => "xarmy-original-night-cartography-v2";
  material.needsUpdate = true;
  return {
    setMode(mode: string) {
      terrainWash.value =
        mode === "terrain" ? 0.32 : mode === "political" ? 0.07 : 0;
    },
    dispose() {
      material.onBeforeCompile = previousCompile;
      material.customProgramCacheKey = previousKey;
      material.needsUpdate = true;
    },
  };
}

type Point = { x: number; y: number };
type GeographicEdge = { from: Point; to: Point; provinces: string[] };
export type PoliticalBoundary = GeographicEdge & {
  kind: "coast" | "country" | "front";
};
let geographicEdges: GeographicEdge[] | undefined;

/** The source province rings have differently split shared edges. Match exact
 * duplicates first, then sample across unmatched edges using a bounded index;
 * do not mistake every province border for a coastline or draw center links. */
function boundaryGeography(): GeographicEdge[] {
  if (geographicEdges) return geographicEdges;
  const cells = new Map<string, string[]>();
  const candidates = new Map<string, GeographicEdge>();
  const cellSize = 32;
  const pointKey = (p: Point) =>
    `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  for (const province of MAP.provinces) {
    for (const part of provincePolygons(province.id)) {
      const left = Math.floor(
        Math.min(...part.outer.map((p) => p.x)) / cellSize,
      );
      const right = Math.floor(
        Math.max(...part.outer.map((p) => p.x)) / cellSize,
      );
      const top = Math.floor(
        Math.min(...part.outer.map((p) => p.y)) / cellSize,
      );
      const bottom = Math.floor(
        Math.max(...part.outer.map((p) => p.y)) / cellSize,
      );
      for (let row = top; row <= bottom; row++)
        for (let col = left; col <= right; col++) {
          const key = `${col}:${row}`;
          const entries = cells.get(key) ?? [];
          if (!entries.includes(province.id)) entries.push(province.id);
          cells.set(key, entries);
        }
      for (const ring of [part.outer, ...part.holes])
        for (let i = 0; i < ring.length; i++) {
          const from = ring[i],
            to = ring[(i + 1) % ring.length];
          const key = [pointKey(from), pointKey(to)].sort().join("|");
          const found = candidates.get(key);
          if (found) {
            if (!found.provinces.includes(province.id))
              found.provinces.push(province.id);
          } else candidates.set(key, { from, to, provinces: [province.id] });
        }
    }
  }
  const at = (x: number, y: number, owner: string) =>
    (
      cells.get(`${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`) ?? []
    ).find((id) => id !== owner && containsProvincePoint(id, x, y));
  const edges: GeographicEdge[] = [];
  for (const edge of candidates.values()) {
    const dx = edge.to.x - edge.from.x,
      dy = edge.to.y - edge.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const steps = Math.ceil(length / 7);
    for (let step = 0; step < steps; step++) {
      const from = {
        x: edge.from.x + (dx * step) / steps,
        y: edge.from.y + (dy * step) / steps,
      };
      const to = {
        x: edge.from.x + (dx * (step + 1)) / steps,
        y: edge.from.y + (dy * (step + 1)) / steps,
      };
      const provinces = [...edge.provinces];
      if (provinces.length === 1) {
        const x = (from.x + to.x) / 2,
          y = (from.y + to.y) / 2;
        for (const side of [-1, 1]) {
          const neighbor = at(
            x - (dy / length) * 0.28 * side,
            y + (dx / length) * 0.28 * side,
            provinces[0],
          );
          if (neighbor && !provinces.includes(neighbor))
            provinces.push(neighbor);
        }
      }
      edges.push({ from, to, provinces });
    }
  }
  geographicEdges = edges;
  return edges;
}

export function politicalBoundarySegments(world: World): PoliticalBoundary[] {
  const result: PoliticalBoundary[] = [];
  for (const edge of boundaryGeography()) {
    const controllers = [
      ...new Set(
        edge.provinces
          .map((id) => world.provinces[id]?.controller)
          .filter((id): id is string => !!id),
      ),
    ];
    if (controllers.length === 0) continue;
    if (edge.provinces.length === 1) result.push({ ...edge, kind: "coast" });
    else if (controllers.length > 1) {
      const hostile = controllers.some((a) =>
        controllers.some((b) => world.countries[a]?.wars.includes(b)),
      );
      result.push({ ...edge, kind: hostile ? "front" : "country" });
    }
  }
  return result;
}

export interface PoliticalBorderStats {
  countrySegments: number;
  coastSegments: number;
  frontSegments: number;
  rebuilds: number;
  fingerprint: number;
}

/** One bounded batch: dark cartographic ink and a narrow national/frontier
 * accent. World-space ribbons remain visible on devices with 1px WebGL lines. */
export function createPoliticalBorders(
  scene: THREE.Scene,
  groundHeightAt: (x: number, y: number) => number = heightAt,
) {
  const group = new THREE.Group();
  group.name = "cartographic-political-borders";
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.94,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  group.add(mesh);
  scene.add(group);
  let signature = "",
    disposed = false;
  const stats: PoliticalBorderStats = {
    countrySegments: 0,
    coastSegments: 0,
    frontSegments: 0,
    rebuilds: 0,
    fingerprint: 0,
  };
  return {
    get stats(): Readonly<PoliticalBorderStats> {
      return stats;
    },
    update(world: World) {
      if (disposed) return;
      const next =
        MAP.provinces
          .map((p) => world.provinces[p.id]?.controller ?? "")
          .join("|") +
        ":" +
        Object.values(world.countries)
          .map((c) => `${c.id}:${c.wars.join(",")}`)
          .join("|");
      if (signature === next) return;
      signature = next;
      let fingerprint = 2166136261;
      for (let i = 0; i < next.length; i++)
        fingerprint = Math.imul(fingerprint ^ next.charCodeAt(i), 16777619);
      stats.fingerprint = fingerprint >>> 0;
      stats.rebuilds++;
      stats.countrySegments = stats.coastSegments = stats.frontSegments = 0;
      const positions: number[] = [],
        colors: number[] = [];
      const color = new THREE.Color();
      const ribbon = (
        edge: GeographicEdge,
        width: number,
        tint: number,
        lift: number,
      ) => {
        const dx = edge.to.x - edge.from.x,
          dz = edge.to.y - edge.from.y;
        const length = Math.hypot(dx, dz),
          nx = (-dz / length) * width,
          nz = (dx / length) * width;
        const corners = [
          [edge.from.x + nx, edge.from.y + nz],
          [edge.to.x + nx, edge.to.y + nz],
          [edge.to.x - nx, edge.to.y - nz],
          [edge.from.x - nx, edge.from.y - nz],
        ];
        color.setHex(tint);
        for (const index of [0, 1, 2, 0, 2, 3]) {
          const [x, z] = corners[index];
          positions.push(
            x - MAP.width / 2,
            groundHeightAt(x, z) + lift,
            z - MAP.height / 2,
          );
          colors.push(color.r, color.g, color.b);
        }
      };
      for (const edge of politicalBoundarySegments(world)) {
        if (edge.kind === "coast") {
          stats.coastSegments++;
          ribbon(edge, 0.64, 0x070d18, 0.18);
          ribbon(edge, 0.19, 0x34465c, 0.21);
        } else {
          if (edge.kind === "front") stats.frontSegments++;
          else stats.countrySegments++;
          ribbon(edge, 0.82, 0x080c12, 0.27);
          ribbon(edge, 0.18, edge.kind === "front" ? 0xbd6d62 : 0x47505f, 0.3);
        }
      }
      const geometry = new THREE.BufferGeometry()
        .setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        )
        .setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
