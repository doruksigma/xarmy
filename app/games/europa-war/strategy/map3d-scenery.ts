import * as THREE from "three";
import { MAP } from "./world";
import {
  containsProvincePoint,
  heightAt,
  provincePolygons,
} from "./map3d-geometry";
import {
  buildPlayerRailNetwork,
  playerRailNetworkSignature,
} from "./map3d-rail-network";
import {
  GRAPHICS_QUALITY,
  visualRandom,
  visualSeed,
  type GraphicsQuality,
} from "./map3d-visuals";
import type { World } from "./types";
import { UNIT_DISPLAY_LAYOUTS, UNIT_MODEL_FOOTPRINTS } from "./map3d-units";
import { TRAIN_DIMENSIONS, TRAIN_WORLD_SCALE } from "./map3d-train-models";

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

export interface SceneryHouse {
  province: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  angle: number;
  /** Index of the actual rendered masonry instance, not a planned slot. */
  instance: number;
}

export interface SceneryStats {
  houses: number;
  housesByProvince: Readonly<Record<string, number>>;
  emptyProvinces: readonly string[];
  rebuilds: number;
  streetBars: number;
}
// All count layouts share fixed per-kind slots. Reserve the four actual body
// footprints at the renderer's idle yaw (PI), leaving gaps for narrow towns.
// Elevated gun barrels may overhang roofs; do not erase an entire city for them.
const STAGING = UNIT_DISPLAY_LAYOUTS[4].map((slot) => {
  const body = UNIT_MODEL_FOOTPRINTS[slot.kind];
  return {
    left: -slot.x - body.halfWidth - 0.1,
    right: -slot.x + body.halfWidth + 0.1,
    top: -slot.z - body.front - 0.1,
    bottom: -slot.z + body.rear + 0.1,
  };
});
// Staggered wards follow gently bending streets instead of repeating an
// identical square lattice in every province. They remain stable on reload.
const TOWN_SLOTS = Array.from({ length: 24 * 24 }, (_, i) => {
  const row = Math.floor(i / 24),
    col = i % 24;
  const x = (col - 11.5) * 3.4 + (row % 2) * 1.35;
  const z = (row - 11.5) * 3.7;
  return {
    dx: x + Math.sin(z * 0.13) * 2.2,
    dz: z + Math.sin(x * 0.12) * 1.1,
  };
}).sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz));
const RAIL_CLEARANCE =
  (TRAIN_DIMENSIONS.locomotive.width * TRAIN_WORLD_SCALE) / 2 + 0.33;

/** Exact segment-to-oriented-footprint distance avoids circular exclusion zones
 * swallowing narrow stations and towns while preserving the moving train lane. */
function railDistanceSquared(
  segment: RailSegment,
  x: number,
  z: number,
  width: number,
  depth: number,
  angle: number,
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const ax = (segment.x - x) * c - (segment.z - z) * s;
  const az = (segment.x - x) * s + (segment.z - z) * c;
  const dx = segment.dx * c - segment.dz * s;
  const dz = segment.dx * s + segment.dz * c;
  const hx = width / 2,
    hz = depth / 2;
  let near = 0,
    far = 1;
  for (const [origin, delta, half] of [
    [ax, dx, hx],
    [az, dz, hz],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(origin) > half) {
        near = Infinity;
        break;
      }
    } else {
      const a = (-half - origin) / delta,
        b = (half - origin) / delta;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
  }
  if (near <= far) return 0;
  const toBox = (px: number, pz: number) =>
    Math.max(0, Math.abs(px) - hx) ** 2 + Math.max(0, Math.abs(pz) - hz) ** 2;
  let distance = Math.min(toBox(ax, az), toBox(ax + dx, az + dz));
  for (const cx of [-hx, hx])
    for (const cz of [-hz, hz]) {
      const t = Math.max(
        0,
        Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / (segment.length2 || 1)),
      );
      distance = Math.min(
        distance,
        (cx - ax - dx * t) ** 2 + (cz - az - dz * t) ** 2,
      );
    }
  return distance;
}

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

/** Original European settlement kits. All details share thirteen instanced batches. */
export function createScenery(
  scene: THREE.Scene,
  groundHeightAt: (x: number, y: number) => number = heightAt,
) {
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
  // Warm windows are one shared emissive material per existing instanced batch,
  // not a light per house. They stay readable even in the moonlit close view.
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.03,
    emissive: 0xffbd6d,
    emissiveIntensity: 0.24,
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
        : [2, 3].includes(i)
          ? windowMaterial
          : i === 5
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
  const stats: SceneryStats = {
    houses: 0,
    housesByProvince: {},
    emptyProvinces: [],
    rebuilds: 0,
    streetBars: 0,
  };
  const houses: SceneryHouse[] = [];
  let quality: GraphicsQuality = "medium",
    current: World | null = null,
    signature = "",
    railSignature = "",
    railGeometrySignature = "";
  const railSegments = new Map<string, RailSegment[]>();
  const boundarySegments = new Map<string, RailSegment[]>();
  type Cottage = {
    x: number;
    z: number;
    width: number;
    depth: number;
    angle: number;
  };
  const fallbackSites = new Map<string, Cottage[]>();
  const fallbackCandidates = new Map<
    string,
    { x: number; z: number; distance: number }[]
  >();
  let disposed = false;
  function update(world: World) {
    if (disposed) return;
    current = world;
    const construction = new Set(
      Object.values(world.countries).flatMap((c) =>
        c.construction.map((q) => q.province),
      ),
    );
    const nextRailSignature = playerRailNetworkSignature(world);
    if (nextRailSignature !== railSignature) {
      railSignature = nextRailSignature;
      const edges = buildPlayerRailNetwork(world).edges;
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
    stats.rebuilds++;
    stats.houses = 0;
    houses.length = 0;
    const housesByProvince: Record<string, number> = {};
    stats.housesByProvince = housesByProvince;
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
      if (items[kind].length >= capacities[kind]) return undefined;
      const index = items[kind].length;
      items[kind].push({
        x: x - MAP.width / 2,
        z: z - MAP.height / 2,
        y: groundHeightAt(x, z) + sy / 2 + lift,
        sx,
        sy,
        sz,
        angle,
        color: tint,
      });
      return index;
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
      if (
        ![
          [0, 0],
          [-w / 2, -d / 2],
          [-w / 2, d / 2],
          [w / 2, -d / 2],
          [w / 2, d / 2],
        ].every(([dx, dz]) =>
          containsProvincePoint(id, x + dx * c + dz * s, z - dx * s + dz * c),
        )
      )
        return false;
      let segments = boundarySegments.get(id);
      if (!segments) {
        segments = [];
        for (const part of provincePolygons(id))
          for (const ring of [part.outer, ...part.holes]) {
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i],
                b = ring[(i + 1) % ring.length];
              const dx = b.x - a.x,
                dz = b.y - a.y;
              segments.push({
                x: a.x,
                z: a.y,
                dx,
                dz,
                length2: dx * dx + dz * dz,
              });
            }
          }
        boundarySegments.set(id, segments);
      }
      // Corner samples alone miss concave coastal bays and small enclosed
      // holes. No real boundary edge may enter the entire roof footprint.
      return segments.every(
        (segment) => railDistanceSquared(segment, x, z, w, d, angle) > 1e-10,
      );
    }
    for (const p of MAP.provinces) {
      const state = world.provinces[p.id];
      if (!state) continue;
      housesByProvince[p.id] = 0;
      const provinceHouses: SceneryHouse[] = [];
      function recordHouse(
        x: number,
        z: number,
        width: number,
        depth: number,
        height: number,
        angle: number,
        instance: number | undefined,
      ) {
        if (instance === undefined) return;
        const house = {
          province: p.id,
          x,
          z,
          width,
          depth,
          height,
          angle,
          instance,
        };
        houses.push(house);
        provinceHouses.push(house);
        housesByProvince[p.id]++;
        stats.houses++;
      }
      function separateHouse(
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
        return provinceHouses.every((house) => {
          const otherX =
            (Math.abs(Math.cos(house.angle)) * house.width +
              Math.abs(Math.sin(house.angle)) * house.depth) *
            0.55;
          const otherZ =
            (Math.abs(Math.sin(house.angle)) * house.width +
              Math.abs(Math.cos(house.angle)) * house.depth) *
            0.55;
          return (
            Math.abs(x - house.x) > halfX + otherX + 0.12 ||
            Math.abs(z - house.z) > halfZ + otherZ + 0.12
          );
        });
      }
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
      const orientation = random() * Math.PI;
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
        // Reserve the actual moving train corridor, not a house-sized circle.
        for (const segment of railSegments.get(p.id) ?? []) {
          if (
            railDistanceSquared(segment, x, z, width, depth, angle) <
            RAIL_CLEARANCE ** 2
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
        const height = urban ? 2.6 + random() * 2.3 : 1.4 + random() * 1.1;
        // Weathered slate masonry and subdued brick stay legible in moonlight
        // without turning settlements into bright beige patches on the atlas.
        const tint = [0x737d86, 0x82868a, 0x6d7b78, 0x827a75, 0x8c8d85][
          Math.floor(random() * 5)
        ];
        const roofTint = [0x655052, 0x535961, 0x685655, 0x48575f][
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
          !separateHouse(
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
        // Density may remove extra homes, never the first visible town cluster.
        if (keep > houseDensity && housesByProvince[p.id] >= 3) continue;
        const terrain = [
          groundHeightAt(point.x - width / 2, point.z - depth / 2),
          groundHeightAt(point.x + width / 2, point.z + depth / 2),
          groundHeightAt(point.x, point.z),
        ];
        const foundation = Math.min(
          2.2,
          Math.max(...terrain) - Math.min(...terrain) + 0.24,
        );
        const lift =
          Math.max(...terrain) - groundHeightAt(point.x, point.z) + 0.15;
        item(
          0,
          point.x,
          point.z,
          width + 0.13,
          foundation,
          depth + 0.13,
          0x69747d,
          orientation,
          lift - foundation,
        );
        const damaged = state.damage > 35 && i % 3 === 0;
        if (damaged) {
          const instance = item(
            0,
            point.x,
            point.z,
            width,
            height * 0.35,
            depth,
            0x4c535a,
            orientation,
            lift,
          );
          recordHouse(
            point.x,
            point.z,
            width,
            depth,
            height * 0.35,
            orientation,
            instance,
          );
          item(
            11,
            point.x + 0.2,
            point.z,
            width * 0.8,
            0.7,
            depth * 0.8,
            0x59656b,
            orientation,
            lift,
          );
          continue;
        }
        const instance = item(
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
        recordHouse(
          point.x,
          point.z,
          width,
          depth,
          height,
          orientation,
          instance,
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
          urban ? 0.55 : 0.8,
          depth,
          roofTint,
          orientation,
          lift + height,
        );
        if (hasChimney) {
          const chimneyPoint = {
            x: point.x + Math.cos(orientation) * width * 0.2,
            z: point.z - Math.sin(orientation) * width * 0.2,
          };
          item(
            0,
            chimneyPoint.x,
            chimneyPoint.z,
            0.31,
            1,
            0.31,
            0x705a57,
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
            0x4b535a,
            orientation,
            lift + height + 1.2,
          );
        }
      }
      if (housesByProvince[p.id] < 3) {
        // Narrow provinces often fall between the regular grid lines. Search
        // actual land, nearest the city first, and keep a small cottage cluster.
        // Results depend only on geography/visible rails, not quality or troops.
        if (!fallbackSites.has(p.id)) {
          const cottages: Cottage[] = [];
          let candidates = fallbackCandidates.get(p.id);
          if (!candidates) {
            candidates = [];
            for (const { outer } of provincePolygons(p.id)) {
              const left = Math.min(...outer.map((v) => v.x)),
                right = Math.max(...outer.map((v) => v.x));
              const top = Math.min(...outer.map((v) => v.y)),
                bottom = Math.max(...outer.map((v) => v.y));
              const cols = Math.min(
                144,
                Math.max(1, Math.ceil((right - left) / 0.35)),
              );
              const rows = Math.min(
                144,
                Math.max(1, Math.ceil((bottom - top) / 0.35)),
              );
              for (let row = 0; row < rows; row++)
                for (let col = 0; col < cols; col++) {
                  const x = left + ((col + 0.5) / cols) * (right - left);
                  const z = top + ((row + 0.5) / rows) * (bottom - top);
                  candidates.push({
                    x,
                    z,
                    distance: (x - p.x) ** 2 + (z - p.y) ** 2,
                  });
                }
            }
            candidates.sort((a, b) => a.distance - b.distance);
            fallbackCandidates.set(p.id, candidates);
          }
          for (const [width, depth] of [
            [1.45, 1.25],
            [1.1, 0.95],
          ]) {
            for (const { x, z } of candidates) {
              if (provinceHouses.length + cottages.length >= 3) break;
              for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
                const halfX =
                  (Math.abs(Math.cos(angle)) * width +
                    Math.abs(Math.sin(angle)) * depth) *
                  0.55;
                const halfZ =
                  (Math.abs(Math.sin(angle)) * width +
                    Math.abs(Math.cos(angle)) * depth) *
                  0.55;
                if (
                  !clearSite(x, z, width + 0.2, depth + 0.2, angle) ||
                  !separateHouse(x, z, width + 0.2, depth + 0.2, angle) ||
                  !footprint(p.id, x, z, width + 0.2, depth + 0.2, angle) ||
                  cottages.some(
                    (other) =>
                      Math.abs(x - other.x) <
                        halfX +
                          (Math.abs(Math.cos(other.angle)) * other.width +
                            Math.abs(Math.sin(other.angle)) * other.depth) *
                            0.55 +
                          0.2 &&
                      Math.abs(z - other.z) <
                        halfZ +
                          (Math.abs(Math.sin(other.angle)) * other.width +
                            Math.abs(Math.cos(other.angle)) * other.depth) *
                            0.55 +
                          0.2,
                  )
                )
                  continue;
                cottages.push({ x, z, width, depth, angle });
                break;
              }
            }
          }
          fallbackSites.set(p.id, cottages);
        }
        for (const cottage of fallbackSites.get(p.id) ?? []) {
          const { x, z, width, depth, angle } = cottage;
          const instance = item(0, x, z, width, 2.1, depth, 0x858b90, angle);
          recordHouse(x, z, width, depth, 2.1, angle, instance);
          item(2, x, z, width, 2.1, depth, 0x34484a, angle);
          item(1, x, z, width, 0.9, depth, 0x655052, angle, 2.1);
        }
      }
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
        item(10, x, z, 0.55, size * 0.9, 0.55, 0x4c4d48);
        item(
          pineTree ? 8 : 9,
          x,
          z,
          size,
          size * (pineTree ? 1.65 : 1.08),
          size,
          pineTree ? 0x344b43 : 0x4c6053,
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
              p.terrain === "desert" ? 0x8d8573 : 0x64717a,
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
            ? 0x50575d
            : i < state.buildings.military
              ? 0x6f7379
              : 0x7d868b,
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
            0x52646e,
            orientation,
            height,
          );
          item(5, point.x, point.z, 4.5, height, 4.2, 0x344e55, orientation);
          const chimneyPoint = {
            x: point.x + Math.cos(orientation) * 1.4,
            z: point.z - Math.sin(orientation) * 1.4,
          };
          item(6, chimneyPoint.x, chimneyPoint.z, 0.85, 6, 0.85, 0x745e59);
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
            0x454f57,
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
              0x999f9f,
              orientation,
              0.18,
            );
          }
        }
        const hangar = facility(-19, 4, 4.1, 6);
        if (hangar) {
          item(0, hangar.x, hangar.z, 4.1, 1.1, 6, 0x7c878d, orientation);
          item(12, hangar.x, hangar.z, 4.1, 1.9, 6, 0x596d77, orientation, 1.1);
          item(5, hangar.x, hangar.z, 4.1, 1.4, 6, 0x405354, orientation);
        }
      }
      if (state.buildings.dock > 0 && p.port) {
        const dock = facility(5, 15, 10, 3);
        if (dock) {
          item(0, dock.x, dock.z, 10, 0.55, 3, 0x626d73, orientation);
          item(0, dock.x, dock.z, 4, 2.1, 2.5, 0x858a8d, orientation, 0.55);
          item(1, dock.x, dock.z, 4, 0.9, 2.5, 0x53616a, orientation, 2.65);
          item(5, dock.x, dock.z, 4, 2.1, 2.5, 0x40565a, orientation, 0.55);
        }
      }
      if (state.buildings.refinery > 0)
        for (let i = 0; i < Math.min(3, state.buildings.refinery + 1); i++) {
          const tank = facility(-8 + i * 3.8, -13, 2.7, 2.7);
          if (tank) item(7, tank.x, tank.z, 2.7, 3.1, 2.7, 0x8e9ba3);
        }
      if (construction.has(p.id)) {
        const crane = facility(10, -10, 5, 1);
        if (crane) {
          item(0, crane.x, crane.z, 0.4, 8, 0.4, 0x9f8a5e);
          item(0, crane.x, crane.z, 5, 0.35, 0.35, 0x9f8a5e, orientation, 7.5);
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
    stats.emptyProvinces = Object.keys(housesByProvince).filter(
      (id) => housesByProvince[id] === 0,
    );
  }
  return {
    get stats(): Readonly<SceneryStats> {
      return stats;
    },
    get houses(): readonly SceneryHouse[] {
      return houses;
    },
    update,
    setQuality(value: GraphicsQuality) {
      quality = value;
      if (current) update(current);
    },
    updateLOD(distance: number) {
      // Continental views use terrain, boundaries and separate city lights.
      // Keep all settlement instances resident so zooming back restores every
      // city immediately, without rebuilding geometry or changing world data.
      group.visible = distance < 950;
      meshes[2].visible =
        meshes[3].visible =
        meshes[5].visible =
          distance < 520;
      meshes[6].visible = distance < 720;
      meshes[8].visible =
        meshes[9].visible =
        meshes[10].visible =
          distance < 760;
      meshes[11].visible = distance < 650;
      meshes[1].visible =
        meshes[4].visible =
        meshes[12].visible =
          distance < 950;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      meshes.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      material.dispose();
      roofMaterial.dispose();
      detailMaterial.dispose();
      windowMaterial.dispose();
      houses.length = 0;
      stats.houses = 0;
      stats.housesByProvince = {};
      stats.emptyProvinces = [];
      railSegments.clear();
      boundarySegments.clear();
      fallbackSites.clear();
      fallbackCandidates.clear();
      current = null;
    },
  };
}
