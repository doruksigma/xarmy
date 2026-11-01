import * as THREE from "three";
import { MAP } from "./world";
import {
  containsProvincePoint,
  heightAt,
  provincePolygons,
} from "./map3d-geometry";
import {
  buildGlobalRailNetwork,
  railNetworkSignature,
} from "./map3d-rail-network";
import {
  GRAPHICS_QUALITY,
  visualRandom,
  visualSeed,
  type GraphicsQuality,
} from "./map3d-visuals";
import type { World } from "./types";

type Item = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  angle: number;
  color: number;
};

type RailSegment = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length2: number;
};
// Idle formations face south. This reserves all 1–3 representative layouts,
// including heavy tanks at scale 2.45, renderer offsets and a small safety gap.
// Rear corners remain available to small towns whose province is very narrow.
const STAGING = [
  { left: -22, right: 22, top: -12.8, bottom: 7.7 },
  { left: -8, right: 8, top: 7.7, bottom: 15.2 },
] as const;
const TOWN_SLOTS = Array.from({ length: 24 * 24 }, (_, i) => ({
  dx: ((i % 24) - 11.5) * 3.15,
  dz: (Math.floor(i / 24) - 11.5) * 3.15,
})).sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz));

/** Merge prototypes once, without adding a mesh/draw call for every window. */
function merge(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [],
    normals: number[] = [];
  for (const source of parts) {
    const geometry = source.index ? source.toNonIndexed() : source;
    positions.push(...geometry.getAttribute("position").array);
    normals.push(...geometry.getAttribute("normal").array);
    if (geometry !== source) geometry.dispose();
    source.dispose();
  }
  return new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
}
function pane(
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  angle: number,
) {
  return new THREE.PlaneGeometry(w, h).rotateY(angle).translate(x, y, z);
}
function gabledRoof() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, -0.5);
  shape.lineTo(0, 0.5);
  shape.lineTo(0.55, -0.5);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 1.1,
    bevelEnabled: false,
  }).translate(0, 0, -0.55);
}
function windows(urban: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const rows = urban ? [-0.24, 0.08, 0.4] : [0.12];
  const columns = urban ? [-0.32, 0, 0.32] : [-0.28, 0.28];
  for (const z of [-0.506, 0.506]) {
    for (const y of rows)
      for (const x of columns) {
        // Two panes leave a visible masonry mullion between them.
        for (const offset of [-0.042, 0.042])
          parts.push(
            pane(
              0.065,
              urban ? 0.14 : 0.21,
              x + offset,
              y,
              z,
              z < 0 ? Math.PI : 0,
            ),
          );
      }
    parts.push(pane(0.16, 0.34, 0, -0.33, z, z < 0 ? Math.PI : 0));
  }
  for (const x of [-0.506, 0.506])
    for (const y of rows)
      for (const z of [-0.24, 0.24])
        parts.push(
          pane(
            0.13,
            urban ? 0.14 : 0.21,
            x,
            y,
            z,
            x < 0 ? -Math.PI / 2 : Math.PI / 2,
          ),
        );
  return merge(parts);
}
function factoryRoof() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.25, 0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(0.5, -0.5);
    shape.closePath();
    parts.push(
      new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
        .scale(1 / 3, 1, 1)
        .translate((i - 1) / 3, 0, -0.5),
    );
  }
  return merge(parts);
}
function factoryDetails() {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.506, 0.506]) {
    for (let i = -2; i <= 2; i++)
      parts.push(pane(0.14, 0.23, i * 0.18, 0.19, z, z < 0 ? Math.PI : 0));
    parts.push(pane(0.3, 0.47, -0.16, -0.26, z, z < 0 ? Math.PI : 0));
  }
  for (const x of [-0.506, 0.506])
    for (let i = -2; i <= 2; i++)
      parts.push(
        pane(0.14, 0.23, x, 0.19, i * 0.18, x < 0 ? -Math.PI / 2 : Math.PI / 2),
      );
  return merge(parts);
}
function pine() {
  return merge([
    new THREE.ConeGeometry(0.5, 0.62, 7).translate(0, -0.19, 0),
    new THREE.ConeGeometry(0.39, 0.62, 7).translate(0, 0.05, 0),
    new THREE.ConeGeometry(0.25, 0.52, 7).translate(0, 0.24, 0),
  ]);
}
function broadleaf() {
  return merge([
    new THREE.IcosahedronGeometry(0.49, 1).scale(1, 0.82, 1),
    new THREE.IcosahedronGeometry(0.3, 0).translate(-0.24, -0.12, 0.11),
    new THREE.IcosahedronGeometry(0.28, 0).translate(0.24, -0.04, -0.16),
  ]);
}
function chimney() {
  return merge([
    new THREE.CylinderGeometry(0.32, 0.5, 1, 8),
    new THREE.CylinderGeometry(0.41, 0.41, 0.09, 8).translate(0, 0.43, 0),
    new THREE.CylinderGeometry(0.44, 0.44, 0.04, 8).translate(0, -0.18, 0),
  ]);
}
function storageTank() {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -0.5),
      new THREE.Vector2(0.49, -0.5),
      new THREE.Vector2(0.49, 0.33),
      new THREE.Vector2(0.46, 0.41),
      new THREE.Vector2(0.34, 0.47),
      new THREE.Vector2(0, 0.5),
    ],
    12,
  );
}
function hangarRoof() {
  return new THREE.CylinderGeometry(
    0.5,
    0.5,
    1,
    12,
    1,
    false,
    Math.PI / 2,
    Math.PI,
  )
    .rotateX(Math.PI / 2)
    .scale(1, 2, 1)
    .translate(0, -0.5, 0);
}

/** Original miniature town kits. All details share thirteen instanced batches. */
export function createScenery(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "province-scenery";
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.87,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
  });
  const detailMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.51,
    metalness: 0.08,
  });
  // body, house roof, village windows, city windows, factory roof/details,
  // chimney, tanks, conifers, broadleaf, trunks, rocks, hangar arches.
  const geometries = [
    new THREE.BoxGeometry(1, 1, 1),
    gabledRoof(),
    windows(false),
    windows(true),
    factoryRoof(),
    factoryDetails(),
    chimney(),
    storageTank(),
    pine(),
    broadleaf(),
    new THREE.CylinderGeometry(0.25, 0.42, 1, 6),
    new THREE.IcosahedronGeometry(0.55, 0),
    hangarRoof(),
  ];
  const capacities = [
    20000, 8000, 8000, 2000, 1600, 2400, 4000, 2400, 2600, 2200, 5000, 5000,
    500,
  ];
  const meshes = geometries.map((geometry, i) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      [1, 4, 12].includes(i)
        ? roofMaterial
        : [2, 3, 5].includes(i)
          ? detailMaterial
          : material,
      capacities[i],
    );
    mesh.name = `scenery-${["masonry", "roofs", "village-windows", "urban-windows", "factory-roofs", "factory-windows", "chimneys", "tanks", "pines", "leafy-trees", "trunks", "rocks", "hangars"][i]}`;
    mesh.count = 0;
    mesh.castShadow = ![2, 3, 5, 8, 9].includes(i);
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  });
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  let quality: GraphicsQuality = "medium",
    current: World | null = null,
    signature = "",
    railSignature = "",
    railGeometrySignature = "";
  const railSegments = new Map<string, RailSegment[]>();
  const fallbackSites = new Map<string, { x: number; z: number } | null>();
  function update(world: World) {
    current = world;
    const construction = new Set(
      Object.values(world.countries).flatMap((c) =>
        c.construction.map((q) => q.province),
      ),
    );
    const nextRailSignature = railNetworkSignature(world);
    if (nextRailSignature !== railSignature) {
      railSignature = nextRailSignature;
      const edges = buildGlobalRailNetwork(world).edges;
      const visibleSignature = edges
        .map(
          (edge) =>
            `${edge.from}:${edge.to}:${edge.points.map((point) => `${point.x},${point.y}`).join(";")}`,
        )
        .join("|");
      if (visibleSignature !== railGeometrySignature) {
        railGeometrySignature = visibleSignature;
        railSegments.clear();
        fallbackSites.clear();
        for (const edge of edges) {
          const segments = edge.points.slice(1).map((point, index) => {
            const from = edge.points[index],
              dx = point.x - from.x,
              dz = point.y - from.y;
            return { x: from.x, z: from.y, dx, dz, length2: dx * dx + dz * dz };
          });
          for (const id of [edge.from, edge.to])
            railSegments.set(id, [
              ...(railSegments.get(id) ?? []),
              ...segments,
            ]);
        }
      }
    }
    const nextSignature =
      quality +
      railGeometrySignature +
      MAP.provinces
        .map((p) => {
          const s = world.provinces[p.id];
          return `${p.id}:${s.buildings.civil},${s.buildings.military},${s.buildings.airfield},${s.buildings.dock},${s.buildings.refinery},${s.damage > 35},${s.damage > 50},${construction.has(p.id)}`;
        })
        .join("|");
    if (nextSignature === signature) return;
    signature = nextSignature;
    const items: Item[][] = geometries.map(() => []);
    const density = GRAPHICS_QUALITY[quality].scenery;
    const houseDensity = 0.42 + density * 0.58;
    function item(
      kind: number,
      x: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      tint: number,
      angle = 0,
      lift = 0,
    ) {
      if (items[kind].length >= capacities[kind]) return;
      items[kind].push({
        x: x - MAP.width / 2,
        z: z - MAP.height / 2,
        y: heightAt(x, z) + sy / 2 + lift,
        sx,
        sy,
        sz,
        angle,
        color: tint,
      });
    }
    function footprint(
      id: string,
      x: number,
      z: number,
      w: number,
      d: number,
      angle = 0,
    ) {
      const c = Math.cos(angle),
        s = Math.sin(angle);
      return [
        [0, 0],
        [-w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
      ].every(([dx, dz]) =>
        containsProvincePoint(id, x + dx * c + dz * s, z - dx * s + dz * c),
      );
    }
    for (const p of MAP.provinces) {
      const state = world.provinces[p.id];
      if (!state) continue;
      const random = visualRandom(visualSeed(p.id));
      const urban = p.terrain === "urban";
      const homes = Math.min(
        34,
        Math.ceil(
          Math.min(
            20,
            3 + Math.floor(p.population / 170000) + (urban ? 5 : 0),
          ) * 1.65,
        ),
      );
      const orientation = random() > 0.5 ? Math.PI / 2 : 0;
      const rotate = (dx: number, dz: number) => ({
        x: p.x + Math.cos(orientation) * dx + Math.sin(orientation) * dz,
        z: p.y - Math.sin(orientation) * dx + Math.cos(orientation) * dz,
      });
      function clearSite(
        x: number,
        z: number,
        width: number,
        depth: number,
        angle = 0,
      ) {
        const halfX =
          (Math.abs(Math.cos(angle)) * width +
            Math.abs(Math.sin(angle)) * depth) /
          2;
        const halfZ =
          (Math.abs(Math.sin(angle)) * width +
            Math.abs(Math.cos(angle)) * depth) /
          2;
        const dx = x - p.x,
          dz = z - p.y;
        if (
          STAGING.some(
            (area) =>
              dx + halfX > area.left &&
              dx - halfX < area.right &&
              dz + halfZ > area.top &&
              dz - halfZ < area.bottom,
          )
        )
          return false;
        // The train is less than two units wide. Only its real path plus a
        // modest 1.8-unit corridor is reserved; no wide city exclusion zone.
        const radius = Math.hypot(width, depth) / 2 + 1.8;
        for (const segment of railSegments.get(p.id) ?? []) {
          const t = Math.max(
            0,
            Math.min(
              1,
              ((x - segment.x) * segment.dx + (z - segment.z) * segment.dz) /
                (segment.length2 || 1),
            ),
          );
          if (
            (x - segment.x - segment.dx * t) ** 2 +
              (z - segment.z - segment.dz * t) ** 2 <
            radius * radius
          )
            return false;
        }
        return true;
      }
      // Search a wider ring of real land slots so a rejected coast/rail/staging
      // slot does not remove a house from the town's intended population budget.
      let landSlots = 0;
      for (let i = 0; i < TOWN_SLOTS.length && landSlots < homes; i++) {
        const slot = TOWN_SLOTS[i],
          point = rotate(
            slot.dx + (random() - 0.5) * 0.2,
            slot.dz + (random() - 0.5) * 0.2,
          );
        const width = (urban ? 1.8 : 1.45) + random() * 0.55;
        const depth = width * (0.85 + random() * 0.25);
        const height = urban ? 3.5 + random() * 3.4 : 1.8 + random() * 1.3;
        const tint = [0xcbbf9d, 0xc3b6a0, 0xb5b5a4, 0xc3a78d, 0xd5c7ad][
          Math.floor(random() * 5)
        ];
        const roofTint = [0x805644, 0x6b6256, 0x76534b, 0x555f61][
          Math.floor(random() * 4)
        ];
        const keep = random(),
          hasChimney = random() > 0.45;
        if (
          !clearSite(
            point.x,
            point.z,
            width + 0.35,
            depth + 0.35,
            orientation,
          ) ||
          !footprint(
            p.id,
            point.x,
            point.z,
            width + 0.35,
            depth + 0.35,
            orientation,
          )
        )
          continue;
        landSlots++;
        if (keep > houseDensity) continue;
        const terrain = [
          heightAt(point.x - width / 2, point.z - depth / 2),
          heightAt(point.x + width / 2, point.z + depth / 2),
          heightAt(point.x, point.z),
        ];
        const foundation = Math.min(
          2.2,
          Math.max(...terrain) - Math.min(...terrain) + 0.24,
        );
        const lift = Math.max(...terrain) - heightAt(point.x, point.z) + 0.15;
        item(
          0,
          point.x,
          point.z,
          width + 0.13,
          foundation,
          depth + 0.13,
          0x8e8979,
          orientation,
          lift - foundation,
        );
        const damaged = state.damage > 35 && i % 3 === 0;
        if (damaged) {
          item(
            0,
            point.x,
            point.z,
            width,
            height * 0.35,
            depth,
            0x625a4c,
            orientation,
            lift,
          );
          item(
            11,
            point.x + 0.2,
            point.z,
            width * 0.8,
            0.7,
            depth * 0.8,
            0x777164,
            orientation,
            lift,
          );
          continue;
        }
        item(
          0,
          point.x,
          point.z,
          width,
          height,
          depth,
          tint,
          orientation,
          lift,
        );
        item(
          urban ? 3 : 2,
          point.x,
          point.z,
          width,
          height,
          depth,
          0x34484a,
          orientation,
          lift,
        );
        item(
          1,
          point.x,
          point.z,
          width,
          urban ? 0.8 : 1.1,
          depth,
          roofTint,
          orientation,
          lift + height,
        );
        if (hasChimney) {
          const chimneyPoint = rotate(slot.dx + 0.35, slot.dz + 0.24);
          item(
            0,
            chimneyPoint.x,
            chimneyPoint.z,
            0.31,
            1,
            0.31,
            0x8e6c59,
            orientation,
            lift + height + 0.25,
          );
          item(
            0,
            chimneyPoint.x,
            chimneyPoint.z,
            0.4,
            0.12,
            0.4,
            0x615b50,
            orientation,
            lift + height + 1.2,
          );
        }
      }
      if (!landSlots) {
        // Very narrow provinces can have a legal rear pocket between the regular
        // grid lines. Keep one normal-sized village cottage when it really fits.
        // This bounded fallback only runs when all regular town slots failed.
        if (!fallbackSites.has(p.id)) {
          fallbackSites.set(p.id, null);
          const boundary = provincePolygons(p.id).flatMap((part) => part.outer);
          if (boundary.length) {
            const left = Math.max(
              p.x - 38,
              Math.min(...boundary.map((v) => v.x)),
            );
            const right = Math.min(
              p.x + 38,
              Math.max(...boundary.map((v) => v.x)),
            );
            const top = Math.max(
              p.y - 38,
              Math.min(...boundary.map((v) => v.y)),
            );
            const bottom = Math.min(
              p.y + 38,
              Math.max(...boundary.map((v) => v.y)),
            );
            let found = false;
            for (let row = 0; row < 96 && !found; row++)
              for (let col = 0; col < 96 && !found; col++) {
                const x = left + ((col + 0.5) / 96) * (right - left);
                const z = top + ((row + 0.5) / 96) * (bottom - top);
                if (
                  !clearSite(x, z, 1.65, 1.45) ||
                  !footprint(p.id, x, z, 1.65, 1.45)
                )
                  continue;
                fallbackSites.set(p.id, { x, z });
                found = true;
              }
          }
        }
        const cottage = fallbackSites.get(p.id);
        if (cottage) {
          item(0, cottage.x, cottage.z, 1.45, 2.1, 1.25, 0xcbbf9d);
          item(2, cottage.x, cottage.z, 1.45, 2.1, 1.25, 0x34484a);
          item(1, cottage.x, cottage.z, 1.45, 0.9, 1.25, 0x805644, 0, 2.1);
        }
      }
      for (const angle of [orientation, orientation + Math.PI / 2])
        if (footprint(p.id, p.x, p.y, 0.6, urban ? 23 : 15, angle))
          item(0, p.x, p.y, 0.6, 0.055, urban ? 23 : 15, 0x79756a, angle, 0.05);

      // Sparse orchard edges as well as layered forest groups make cities feel settled.
      const trees =
        p.terrain === "forest"
          ? 34
          : p.terrain === "mountain"
            ? 15
            : urban
              ? 5
              : 4;
      for (let i = 0; i < trees; i++) {
        const angle = random() * Math.PI * 2,
          radius = 16 + random() * (p.terrain === "forest" ? 22 : 15);
        const x = p.x + Math.cos(angle) * radius,
          z = p.y + Math.sin(angle) * radius;
        const size = 2.1 + random() * 1.7,
          pineTree = p.terrain === "mountain" || random() > 0.42;
        if (
          random() > density ||
          !clearSite(x, z, size, size) ||
          !footprint(p.id, x, z, size, size)
        )
          continue;
        item(10, x, z, 0.55, size * 0.9, 0.55, 0x6f5c45);
        item(
          pineTree ? 8 : 9,
          x,
          z,
          size,
          size * (pineTree ? 1.65 : 1.08),
          size,
          pineTree ? 0x3b6447 : 0x526f40,
          0,
          size * 0.5,
        );
      }
      if (p.terrain === "mountain" || p.terrain === "desert")
        for (let i = 0; i < 9; i++) {
          const x = p.x + (random() - 0.5) * 35,
            z = p.y + (random() - 0.5) * 35;
          const size = 1.4 + random() * 2.6;
          if (
            random() <= density &&
            clearSite(x, z, size, size) &&
            footprint(p.id, x, z, size, size)
          )
            item(
              11,
              x,
              z,
              size,
              size * 0.55,
              size * 0.8,
              p.terrain === "desert" ? 0xb39b70 : 0x7a8178,
              random() * 4,
              -0.2,
            );
        }

      function facility(dx: number, dz: number, width: number, depth: number) {
        for (const factor of [1.8, 1.4, 1, 0.8, 0.55, 0.3]) {
          const point = rotate(dx * factor, dz * factor);
          if (
            clearSite(
              point.x,
              point.z,
              width + 0.4,
              depth + 0.4,
              orientation,
            ) &&
            footprint(
              p.id,
              point.x,
              point.z,
              width + 0.4,
              depth + 0.4,
              orientation,
            )
          )
            return point;
        }
        return null;
      }
      for (
        let i = 0;
        i < Math.min(4, state.buildings.military + state.buildings.civil);
        i++
      ) {
        const point = facility(
          11 + (i % 2) * 5.7,
          9 + Math.floor(i / 2) * 5.8,
          4.5,
          4.2,
        );
        if (!point) continue;
        const height = state.damage > 50 ? 1 : 2.7;
        item(
          0,
          point.x,
          point.z,
          4.5,
          height,
          4.2,
          state.damage > 50
            ? 0x605c53
            : i < state.buildings.military
              ? 0x8c8070
              : 0x999282,
          orientation,
        );
        if (state.damage <= 50) {
          item(
            4,
            point.x,
            point.z,
            4.5,
            1.15,
            4.2,
            0x6c7776,
            orientation,
            height,
          );
          item(5, point.x, point.z, 4.5, height, 4.2, 0x344e55, orientation);
          const chimneyPoint = {
            x: point.x + Math.cos(orientation) * 1.4,
            z: point.z - Math.sin(orientation) * 1.4,
          };
          item(6, chimneyPoint.x, chimneyPoint.z, 0.85, 6, 0.85, 0x916e59);
        }
      }
      if (state.buildings.airfield > 0) {
        const runway = facility(-14, 2, 2.2, 23);
        if (runway) {
          item(
            0,
            runway.x,
            runway.z,
            2.2,
            0.07,
            23,
            0x575d56,
            orientation,
            0.1,
          );
          for (let i = -4; i <= 4; i++) {
            const dx = Math.sin(orientation) * i * 2.25,
              dz = Math.cos(orientation) * i * 2.25;
            item(
              0,
              runway.x + dx,
              runway.z + dz,
              0.13,
              0.018,
              0.95,
              0xc5c6b0,
              orientation,
              0.18,
            );
          }
        }
        const hangar = facility(-19, 4, 4.1, 6);
        if (hangar) {
          item(0, hangar.x, hangar.z, 4.1, 1.1, 6, 0x989b8b, orientation);
          item(12, hangar.x, hangar.z, 4.1, 1.9, 6, 0x7c8781, orientation, 1.1);
          item(5, hangar.x, hangar.z, 4.1, 1.4, 6, 0x405354, orientation);
        }
      }
      if (state.buildings.dock > 0 && p.port) {
        const dock = facility(5, 15, 10, 3);
        if (dock) {
          item(0, dock.x, dock.z, 10, 0.55, 3, 0x8f8267, orientation);
          item(0, dock.x, dock.z, 4, 2.1, 2.5, 0xb0a48a, orientation, 0.55);
          item(1, dock.x, dock.z, 4, 0.9, 2.5, 0x6c6a5d, orientation, 2.65);
          item(5, dock.x, dock.z, 4, 2.1, 2.5, 0x40565a, orientation, 0.55);
        }
      }
      if (state.buildings.refinery > 0)
        for (let i = 0; i < Math.min(3, state.buildings.refinery + 1); i++) {
          const tank = facility(-8 + i * 3.8, -13, 2.7, 2.7);
          if (tank) item(7, tank.x, tank.z, 2.7, 3.1, 2.7, 0xb4b8ac);
        }
      if (construction.has(p.id)) {
        const crane = facility(10, -10, 5, 1);
        if (crane) {
          item(0, crane.x, crane.z, 0.4, 8, 0.4, 0xd7ad53);
          item(0, crane.x, crane.z, 5, 0.35, 0.35, 0xd7ad53, orientation, 7.5);
          item(0, crane.x, crane.z, 0.15, 3.4, 0.15, 0x5c6460, 0, 4.2);
        }
      }
    }
    meshes.forEach((mesh, kind) => {
      mesh.count = items[kind].length;
      for (let i = 0; i < mesh.count; i++) {
        const p = items[kind][i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.rotation.set(0, p.angle, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setHex(p.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }
  return {
    update,
    setQuality(value: GraphicsQuality) {
      quality = value;
      if (current) update(current);
    },
    updateLOD(distance: number) {
      meshes[2].visible =
        meshes[3].visible =
        meshes[5].visible =
          distance < 950;
      meshes[6].visible = distance < 1400;
      meshes[8].visible =
        meshes[9].visible =
        meshes[10].visible =
          distance < 1350;
      meshes[11].visible = distance < 1050;
      meshes[1].visible =
        meshes[4].visible =
        meshes[12].visible =
          distance < 1800;
    },
    dispose() {
      scene.remove(group);
      meshes.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      material.dispose();
      roofMaterial.dispose();
      detailMaterial.dispose();
    },
  };
}
