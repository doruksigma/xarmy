import * as THREE from "three";
import type { Army } from "./types";
import type { GraphicsQuality } from "./map3d-visuals";

/** Original procedural miniatures. Presentation scale is independent of troop strength. */
export const UNIT_MODEL_SCALE = 2.45;
export const UNIT_LABEL_HEIGHT = 13;
export const MAX_UNIT_MINIATURES = 3072;
export const MAX_UNIT_EFFECTS = 128;
export type UnitDisplayKind = "infantry" | "tank" | "artillery" | "truck";
export const UNIT_MODEL_FOOTPRINTS = {
  infantry: { halfWidth: 2.5, front: 2.8, rear: 2 },
  tank: { halfWidth: 5.1, front: 5.8, rear: 5.8 },
  artillery: { halfWidth: 3.05, front: 1.3, rear: 6.9 },
  truck: { halfWidth: 3.3, front: 6.8, rear: 6.6 },
} as const;
const INFANTRY_SLOT = { kind: "infantry", x: 5.3, z: -5.7 } as const;
const TANK_SLOT = { kind: "tank", x: 5.3, z: 4.3 } as const;
const ARTILLERY_SLOT = { kind: "artillery", x: -5.3, z: 4.3 } as const;
const TRUCK_SLOT = { kind: "truck", x: -5.3, z: -9.7 } as const;
export const UNIT_DISPLAY_LAYOUTS = {
  1: [INFANTRY_SLOT],
  2: [TANK_SLOT, INFANTRY_SLOT],
  3: [ARTILLERY_SLOT, INFANTRY_SLOT, TANK_SLOT],
  4: [TRUCK_SLOT, INFANTRY_SLOT, ARTILLERY_SLOT, TANK_SLOT],
} as const;
const EMPTY_LAYOUT: readonly { kind: UnitDisplayKind; x: number; z: number }[] =
  [];
/** Count-based strategic symbols; never change the actual division equipment/type. */
export function unitDisplayLayout(count: number) {
  const whole = Math.floor(count);
  return !Number.isFinite(whole) || whole <= 0
    ? EMPTY_LAYOUT
    : UNIT_DISPLAY_LAYOUTS[Math.min(4, whole) as 1 | 2 | 3 | 4];
}
export interface UnitFormation {
  armies: readonly Army[];
  position: THREE.Vector3;
  angle: number;
  moving: boolean;
  tint: number;
  combat?: { key: string; target: THREE.Vector3 };
  capture?: { key: string; progress: number };
}
export interface UnitModelOptions {
  quality: GraphicsQuality;
  paused?: boolean;
  reduced?: boolean;
  distance: number;
}
export interface UnitModelStats {
  infantry: number;
  vehicles: number;
  instances: number;
  detail: boolean;
  tanks: number;
  artillery: number;
  trucks: number;
  combatFormations: number;
  muzzleFlashes: number;
  shells: number;
  impacts: number;
  captures: number;
}

type XYZ = readonly [number, number, number];
const CLOTH = 0x666d49,
  CLOTH_LIGHT = 0x7c8056,
  HELMET = 0x485340,
  LEATHER = 0x58442f,
  METAL = 0x3d4440,
  SKIN = 0xbe9872,
  BOOT = 0x39352c,
  ARMOR = 0x626b48,
  TRACK = 0x353933,
  WOOD = 0x725039;

/** Static colored pieces are merged once, keeping each model to one draw batch. */
class ModelBuilder {
  private pieces: THREE.BufferGeometry[] = [];
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private euler = new THREE.Euler();
  private tint = new THREE.Color();
  add(
    source: THREE.BufferGeometry,
    color: number,
    position: XYZ = [0, 0, 0],
    rotation: XYZ = [0, 0, 0],
    scale: XYZ = [1, 1, 1],
  ) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    this.position.fromArray(position);
    this.quaternion.setFromEuler(this.euler.fromArray([...rotation, "XYZ"]));
    this.scale.fromArray(scale);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    geometry.applyMatrix4(this.matrix);
    this.tint.setHex(color);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = this.tint.r;
      colors[i * 3 + 1] = this.tint.g;
      colors[i * 3 + 2] = this.tint.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.pieces.push(geometry);
    return this;
  }
  box(size: XYZ, position: XYZ, color: number, rotation: XYZ = [0, 0, 0]) {
    return this.add(new THREE.BoxGeometry(...size), color, position, rotation);
  }
  softBox(size: XYZ, position: XYZ, color: number, radius = 0.07) {
    const [w, h, d] = size;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + radius, -h / 2 + radius);
    shape.lineTo(w / 2 - radius, -h / 2 + radius);
    shape.lineTo(w / 2 - radius, h / 2 - radius);
    shape.lineTo(-w / 2 + radius, h / 2 - radius);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, d - radius * 2),
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: radius,
      bevelThickness: radius,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -(d - radius * 2) / 2);
    return this.add(geometry, color, position);
  }
  cylinder(
    radius: number,
    height: number,
    position: XYZ,
    color: number,
    rotation: XYZ = [0, 0, 0],
    segments = 8,
  ) {
    return this.add(
      new THREE.CylinderGeometry(radius, radius, height, segments),
      color,
      position,
      rotation,
    );
  }
  sphere(radius: number, position: XYZ, color: number, scale: XYZ = [1, 1, 1]) {
    return this.add(
      new THREE.SphereGeometry(radius, 8, 6),
      color,
      position,
      [0, 0, 0],
      scale,
    );
  }
  rod(from: XYZ, to: XYZ, radius: number, color: number) {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      direction.length(),
      7,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      ),
    );
    return this.add(
      geometry,
      color,
      a.add(b).multiplyScalar(0.5).toArray() as [number, number, number],
    );
  }
  build() {
    const count = this.pieces.reduce(
      (n, p) => n + p.getAttribute("position").count,
      0,
    );
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "color"]) {
      const data = new Float32Array(count * 3);
      let offset = 0;
      for (const piece of this.pieces) {
        const attribute = piece.getAttribute(name);
        data.set(attribute.array, offset);
        offset += attribute.array.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(data, 3));
    }
    this.pieces.forEach((p) => p.dispose());
    this.pieces.length = 0;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function infantryBody() {
  const m = new ModelBuilder();
  m.softBox([1.35, 1.45, 0.72], [0, 2.55, 0], CLOTH);
  m.box([1.38, 0.13, 0.77], [0, 1.97, 0], LEATHER);
  m.softBox([0.97, 1.06, 0.43], [0, 2.62, -0.55], LEATHER);
  m.cylinder(0.17, 1.04, [0, 3.21, -0.58], CLOTH_LIGHT, [0, 0, Math.PI / 2]);
  m.cylinder(0.2, 0.29, [0, 3.32, 0], SKIN);
  m.sphere(0.43, [0, 3.73, 0.035], SKIN, [0.88, 1.06, 0.88]);
  m.add(
    new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    HELMET,
    [0, 3.94, 0],
  );
  m.cylinder(0.55, 0.09, [0, 3.94, 0], HELMET, [0, 0, 0], 12);
  m.sphere(0.09, [0, 3.7, 0.41], SKIN, [0.75, 1, 1.4]);
  for (const x of [-0.46, 0.46]) {
    m.softBox([0.33, 0.33, 0.22], [x, 2.13, 0.49], LEATHER, 0.035);
    m.box([0.12, 1.1, 0.08], [x * 0.85, 2.59, 0.43], LEATHER, [0, 0, x * 0.15]);
  }
  m.rod([0.7, 3.02, 0], [0.88, 2.56, 0.4], 0.23, CLOTH);
  m.rod([0.88, 2.56, 0.4], [0.4, 2.74, 0.71], 0.19, CLOTH);
  m.rod([-0.7, 3.02, 0], [-0.55, 2.52, 0.55], 0.23, CLOTH);
  m.rod([-0.55, 2.52, 0.55], [0.24, 2.71, 1.12], 0.18, CLOTH);
  m.sphere(0.15, [0.39, 2.74, 0.72], SKIN);
  m.sphere(0.15, [0.25, 2.74, 1.12], SKIN);
  // A long wood-stock service rifle, held with both hands; no floating weapon.
  m.softBox([0.17, 0.27, 0.72], [0.37, 2.77, 0.2], WOOD, 0.035);
  m.box([0.14, 0.16, 1.08], [0.37, 2.82, 0.9], WOOD);
  m.cylinder(0.065, 1.54, [0.37, 2.9, 1.2], METAL, [Math.PI / 2, 0, 0]);
  m.box([0.13, 0.21, 0.2], [0.37, 2.68, 0.69], METAL);
  return m.build();
}
function infantryLeg() {
  const m = new ModelBuilder();
  m.add(new THREE.CapsuleGeometry(0.21, 0.82, 2, 6), CLOTH, [0, -0.56, 0]);
  m.cylinder(0.17, 0.55, [0, -1.16, 0], CLOTH_LIGHT);
  m.softBox([0.46, 0.34, 0.74], [0, -1.48, 0.14], BOOT, 0.06);
  m.box([0.48, 0.08, 0.77], [0, -1.62, 0.14], 0x282b25);
  return m.build();
}
function infantryDetails() {
  const m = new ModelBuilder();
  for (const y of [2.32, 2.56, 2.8, 3.04])
    m.sphere(0.035, [0, y, 0.38], 0xc3bc8b);
  for (const x of [-0.15, 0.15])
    m.box([0.055, 0.035, 0.025], [x, 3.79, 0.4], 0x37372b);
  m.box([0.18, 0.12, 0.025], [0, 1.97, 0.41], 0x9f9b76);
  m.rod([-0.35, 3.94, 0.02], [-0.31, 3.48, 0.14], 0.027, LEATHER);
  m.rod([0.35, 3.94, 0.02], [0.31, 3.48, 0.14], 0.027, LEATHER);
  m.rod([-0.31, 3.48, 0.14], [0.31, 3.48, 0.14], 0.025, LEATHER);
  m.box([0.09, 0.11, 0.05], [0.37, 3.0, 1.89], METAL);
  m.rod([0.43, 2.94, 0.65], [0.55, 2.96, 0.65], 0.035, METAL);
  for (const z of [0.82, 1.26])
    m.box([0.17, 0.035, 0.08], [0.37, 2.99, z], METAL);
  return m.build();
}
function tankModel() {
  const m = new ModelBuilder();
  for (const x of [-1.52, 1.52])
    m.softBox([0.72, 1.17, 4.66], [x, 0.68, 0], TRACK, 0.23);
  m.softBox([2.85, 0.91, 4.35], [0, 1.31, -0.1], ARMOR, 0.2);
  m.box([2.52, 0.53, 1.04], [0, 1.67, 1.51], ARMOR, [-0.38, 0, 0]);
  m.box([2.5, 0.24, 1.2], [0, 1.8, -1.46], 0x555e3f);
  for (let x = -0.9; x <= 0.91; x += 0.3)
    m.box([0.1, 0.035, 0.83], [x, 1.95, -1.47], METAL);
  for (const x of [-1.08, 1.08]) m.sphere(0.12, [x, 1.67, 2.21], 0xd0c29c);
  return m.build();
}
function tankTurret() {
  const m = new ModelBuilder();
  m.add(
    new THREE.CylinderGeometry(0.98, 1.18, 0.77, 10),
    ARMOR,
    [0, 2.13, 0.12],
  );
  m.cylinder(0.41, 0.14, [-0.28, 2.59, -0.04], 0x78805b, [0, 0, 0], 10);
  m.box([0.78, 0.45, 0.43], [0, 2.22, 1.1], 0x515b3c);
  m.rod([0.65, 2.45, -0.4], [0.7, 3.55, -0.45], 0.022, METAL);
  return m.build();
}
function tankBarrel() {
  const m = new ModelBuilder();
  m.cylinder(0.13, 3.12, [0, 2.3, 2.55], METAL, [Math.PI / 2, 0, 0], 10);
  m.cylinder(0.19, 0.28, [0, 2.3, 4.07], METAL, [Math.PI / 2, 0, 0]);
  return m.build();
}
function truckModel() {
  const m = new ModelBuilder();
  m.box([2.12, 0.38, 4.82], [0, 0.93, -0.1], METAL);
  m.softBox([2.02, 1.58, 1.35], [0, 1.82, 0.87], ARMOR, 0.12);
  m.softBox([1.87, 0.77, 1.15], [0, 1.49, 1.98], ARMOR, 0.1);
  m.box([1.62, 0.57, 0.045], [0, 2.18, 1.58], 0x63868a);
  m.box([0.07, 0.65, 0.06], [0, 2.18, 1.61], METAL);
  for (const x of [-1.03, 1.03])
    m.box([0.03, 0.55, 0.64], [x, 2.16, 0.96], 0x63868a);
  m.box([1.4, 0.49, 0.08], [0, 1.48, 2.59], METAL);
  for (const x of [-0.55, -0.28, 0, 0.28, 0.55])
    m.box([0.045, 0.41, 0.1], [x, 1.48, 2.64], 0x9b9e83);
  for (const x of [-0.82, 0.82]) m.sphere(0.15, [x, 1.61, 2.6], 0xd8cb9e);
  m.box([2.28, 0.15, 0.22], [0, 1.03, 2.65], METAL);
  m.softBox([2.08, 1.6, 2.65], [0, 1.97, -1.23], 0x8a8966, 0.21);
  m.box([2.15, 0.4, 2.7], [0, 1.24, -1.23], LEATHER);
  for (const z of [-2.36, -1.3, -0.25])
    m.box([2.1, 0.055, 0.055], [0, 2.71, z], 0x686c4e);
  return m.build();
}
function artilleryModel() {
  const m = new ModelBuilder();
  for (const x of [-1.03, 1.03]) {
    m.rod([x * 0.45, 0.75, -0.1], [x, 0.19, -2.55], 0.12, ARMOR);
    m.box([0.4, 0.2, 0.44], [x, 0.13, -2.55], METAL);
  }
  m.cylinder(0.12, 2.2, [0, 0.69, 0], METAL, [0, 0, Math.PI / 2]);
  m.box([1.78, 1.29, 0.14], [0, 1.49, 0.3], ARMOR, [-0.12, 0, 0]);
  m.box([0.61, 0.52, 0.9], [0, 1.28, -0.45], 0x50593f);
  return m.build();
}
function artilleryBarrel() {
  const m = new ModelBuilder();
  m.cylinder(0.18, 3.3, [0, 1.68, 1.16], METAL, [Math.PI / 2 - 0.15, 0, 0], 10);
  m.cylinder(0.27, 0.34, [0, 1.93, 2.79], METAL, [Math.PI / 2 - 0.15, 0, 0]);
  return m.build();
}
function roadWheel() {
  const m = new ModelBuilder();
  m.cylinder(1, 0.45, [0, 0, 0], TRACK, [0, 0, Math.PI / 2], 10);
  for (const side of [-1, 1]) {
    m.cylinder(0.69, 0.05, [side * 0.25, 0, 0], ARMOR, [0, 0, Math.PI / 2], 10);
    m.cylinder(0.22, 0.07, [side * 0.29, 0, 0], METAL, [0, 0, Math.PI / 2], 6);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      m.box(
        [0.06, 0.55, 0.07],
        [side * 0.29, Math.cos(a) * 0.37, Math.sin(a) * 0.37],
        0x9b9c76,
        [a, 0, 0],
      );
    }
  }
  return m.build();
}
function tankTreads() {
  const m = new ModelBuilder();
  for (let z = -2.02; z < 1.9; z += 0.38)
    m.box([0.75, 0.07, 0.13], [0, 0, z], 0x686a4e);
  return m.build();
}
function supplyCrate() {
  const m = new ModelBuilder();
  m.softBox([0.8, 0.56, 0.65], [0, 0, 0], 0xa88b59, 0.045);
  for (const x of [-0.28, 0.28]) m.box([0.07, 0.6, 0.7], [x, 0, 0], LEATHER);
  m.box([0.27, 0.1, 0.02], [0, 0.03, 0.34], 0xe2d9ae);
  return m.build();
}
function flagPole() {
  const m = new ModelBuilder();
  m.cylinder(0.045, 4.7, [0, 2.35, 0], 0xb5ac89, [0, 0, 0], 6);
  m.sphere(0.1, [0, 4.75, 0], 0xd5b96b);
  return m.build();
}
const TANK_WHEEL_Z = [-1.72, -0.86, 0, 0.86, 1.72] as const;
const TRUCK_WHEEL_Z = [-1.65, -0.7, 1.55] as const;
const BATCH_NAMES = [
  "infantry-body",
  "infantry-legs",
  "tank-hull",
  "truck-body",
  "artillery-base",
  "infantry-details",
  "tank-turret",
  "tank-barrel",
  "artillery-barrel",
  "vehicle-wheels",
  "tank-treads",
  "support-crates",
  "capture-poles",
] as const;

/** Display symbols and effects consume actual event descriptors, never simulate damage. */
export function createUnitModels(
  scene: THREE.Scene,
  heightAtWorld?: (x: number, z: number) => number,
) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.83,
    metalness: 0.08,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const geometries = [
    infantryBody(),
    infantryLeg(),
    tankModel(),
    truckModel(),
    artilleryModel(),
    infantryDetails(),
    tankTurret(),
    tankBarrel(),
    artilleryBarrel(),
    roadWheel(),
    tankTreads(),
    supplyCrate(),
    flagPole(),
  ];
  const batches = geometries.map((geometry, i) => {
    const capacity =
      MAX_UNIT_MINIATURES * (i === 9 ? 10 : i === 1 || i === 10 ? 2 : 1);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `unit-${BATCH_NAMES[i]}`;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
  const accentGeometry = new THREE.BoxGeometry(0.11, 0.18, 0.24);
  const accents = new THREE.InstancedMesh(
    accentGeometry,
    accentMaterial,
    MAX_UNIT_MINIATURES,
  );
  accents.name = "unit-country-patches";
  const flagGeometry = new THREE.PlaneGeometry(1.65, 1.02, 4, 1);
  flagGeometry.translate(0.87, 4.03, 0);
  const flags = new THREE.InstancedMesh(
    flagGeometry,
    accentMaterial,
    MAX_UNIT_EFFECTS,
  );
  flags.name = "unit-capture-flags";
  for (const mesh of [accents, flags]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(mesh.instanceMatrix.count * 3),
      3,
    );
    scene.add(mesh);
  }
  const flashGeometry = new THREE.IcosahedronGeometry(1, 0),
    shellGeometry = new THREE.CapsuleGeometry(0.16, 0.68, 2, 6),
    impactGeometry = new THREE.IcosahedronGeometry(1, 1);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd48a,
    transparent: true,
    opacity: 0.93,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shellMaterial = new THREE.MeshBasicMaterial({ color: 0xf1d791 });
  const impactMaterial = new THREE.MeshBasicMaterial({
    color: 0xaaa18a,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const flashes = new THREE.InstancedMesh(
      flashGeometry,
      flashMaterial,
      MAX_UNIT_EFFECTS,
    ),
    shells = new THREE.InstancedMesh(
      shellGeometry,
      shellMaterial,
      MAX_UNIT_EFFECTS,
    ),
    impacts = new THREE.InstancedMesh(
      impactGeometry,
      impactMaterial,
      MAX_UNIT_EFFECTS,
    );
  flashes.name = "unit-muzzle-flashes";
  shells.name = "unit-artillery-shells";
  impacts.name = "unit-shell-impacts";
  for (const mesh of [flashes, shells, impacts]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
  }
  const overlayBatches = [accents, flags, flashes, shells, impacts];
  const transform = new THREE.Object3D(),
    parent = new THREE.Object3D(),
    color = new THREE.Color(),
    origin = new THREE.Vector3(),
    projectile = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const counts = new Uint32Array(batches.length);
  const stats: UnitModelStats = {
    infantry: 0,
    vehicles: 0,
    instances: 0,
    detail: false,
    tanks: 0,
    artillery: 0,
    trucks: 0,
    combatFormations: 0,
    muzzleFlashes: 0,
    shells: 0,
    impacts: 0,
    captures: 0,
  };
  const captures = new Map<string, { progress: number; frame: number }>();
  const combats = new Map<
    string,
    { startedAt: number; repeatOffset: number; frame: number }
  >();
  let disposed = false,
    clock = 0,
    lastNow = -1,
    frame = 0;
  const put = (
    batch: number,
    x: number,
    y: number,
    z: number,
    pitch = 0,
    yaw = 0,
    scale = 1,
  ) => {
    const index = counts[batch]++;
    transform.position.set(x, y, z);
    transform.rotation.set(pitch, yaw, 0);
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    transform.matrix.premultiply(parent.matrix);
    batches[batch].setMatrixAt(index, transform.matrix);
  };
  const point = (x: number, y: number, z: number, yaw = 0) =>
    origin
      .set(
        x * Math.cos(yaw) + z * Math.sin(yaw),
        y,
        -x * Math.sin(yaw) + z * Math.cos(yaw),
      )
      .applyMatrix4(parent.matrix);
  const flash = (
    x: number,
    y: number,
    z: number,
    yaw: number,
    size: number,
  ) => {
    if (stats.muzzleFlashes >= MAX_UNIT_EFFECTS) return;
    point(x, y, z, yaw);
    transform.position.copy(origin);
    transform.rotation.set(clock * 7, clock * 11, clock * 13);
    transform.scale.set(size, size * 0.68, size * 1.4);
    transform.updateMatrix();
    flashes.setMatrixAt(stats.muzzleFlashes++, transform.matrix);
  };
  return {
    get stats(): Readonly<UnitModelStats> {
      return stats;
    },
    update(
      formations: readonly UnitFormation[],
      now: number,
      options: UnitModelOptions,
    ) {
      if (disposed) return;
      if (lastNow >= 0 && !options.paused && !options.reduced)
        clock += Math.min(0.25, Math.max(0, now - lastNow) / 1000);
      lastNow = now;
      frame++;
      counts.fill(0);
      accents.count = 0;
      stats.infantry =
        stats.vehicles =
        stats.instances =
        stats.tanks =
        stats.artillery =
        stats.trucks =
        stats.combatFormations =
        stats.muzzleFlashes =
        stats.shells =
        stats.impacts =
        stats.captures =
          0;
      stats.detail = options.distance < (options.quality === "low" ? 340 : 720);
      let models = 0;
      for (let f = 0; f < formations.length; f++) {
        const formation = formations[f],
          layout = unitDisplayLayout(formation.armies.length);
        if (!layout.length || models + layout.length > MAX_UNIT_MINIATURES)
          continue;
        const combat =
          formation.combat &&
          Number.isFinite(formation.combat.target.x) &&
          Number.isFinite(formation.combat.target.y) &&
          Number.isFinite(formation.combat.target.z)
            ? formation.combat
            : undefined;
        let combatElapsed = 0,
          battleOffset = 0;
        if (combat) {
          stats.combatFormations++;
          let timing = combats.get(combat.key);
          if (!timing) {
            let seed = 0;
            for (let k = 0; k < combat.key.length; k++)
              seed = (seed * 31 + combat.key.charCodeAt(k)) >>> 0;
            timing = {
              startedAt: clock,
              repeatOffset: (Math.imul(seed, 0x9e3779b1) >>> 0) / 0xffffffff,
              frame,
            };
            combats.set(combat.key, timing);
          }
          timing.frame = frame;
          // A short battle must fire immediately even when the map has been
          // running for hours at low FPS. Only later shot periods are staggered.
          combatElapsed = Math.max(0, clock - timing.startedAt);
          battleOffset = timing.repeatOffset;
        }
        let captureProgress = -1;
        if (
          formation.capture &&
          formation.capture.progress >= 0 &&
          formation.capture.progress < 1
        ) {
          let capture = captures.get(formation.capture.key);
          if (!capture) {
            capture = { progress: formation.capture.progress, frame };
            captures.set(formation.capture.key, capture);
          }
          if (!options.paused && !options.reduced)
            capture.progress = formation.capture.progress;
          capture.frame = frame;
          captureProgress = capture.progress;
        }
        const sin = Math.sin(formation.angle),
          cos = Math.cos(formation.angle);
        for (let i = 0; i < layout.length; i++, models++) {
          const slot = layout[i],
            kind = slot.kind;
          parent.position.set(
            formation.position.x + slot.x * cos + slot.z * sin,
            formation.position.y,
            formation.position.z - slot.x * sin + slot.z * cos,
          );
          if (heightAtWorld)
            parent.position.y = heightAtWorld(
              parent.position.x,
              parent.position.z,
            );
          let modelAngle = formation.angle;
          if (combat && (kind === "infantry" || kind === "artillery"))
            modelAngle = Math.atan2(
              combat.target.x - parent.position.x,
              combat.target.z - parent.position.z,
            );
          const rally =
            captureProgress >= 0 ? Math.sin(captureProgress * Math.PI) : 0;
          parent.rotation.set(0, modelAngle, 0);
          parent.scale.setScalar(UNIT_MODEL_SCALE);
          parent.updateMatrix();
          const walk = formation.moving
            ? Math.sin(clock * 7.8 + f * 0.6 + i * 1.3)
            : 0;
          let badgeX = 0.93,
            badgeY = 2.92,
            badgeZ = 0.05,
            badgeYaw = 0,
            badgeScale = 1;
          if (kind === "infantry") {
            const shot = combatElapsed % (1.2 + battleOffset * 0.18),
              kick = combat ? Math.max(0, 1 - shot / 0.16) * 0.11 : 0;
            const bob =
              Math.abs(walk) * 0.055 + rally * Math.sin(clock * 9) * 0.04;
            put(0, 0, bob, -kick, -kick * 0.15);
            put(1, -0.36, 1.67, 0, walk * 0.37 + rally * 0.08);
            put(1, 0.36, 1.67, 0, -walk * 0.37 - rally * 0.08);
            if (stats.detail) put(5, 0, bob, -kick, -kick * 0.15);
            if (combat && shot < 0.075)
              flash(0.37, 2.9 + bob, 2 - kick, 0, 0.45);
            badgeY += bob;
            badgeZ -= kick;
            stats.infantry++;
          } else if (kind === "tank") {
            const shot = combatElapsed % (2.8 + battleOffset * 0.32),
              kick = combat ? Math.max(0, 1 - shot / 0.36) * 0.38 : 0;
            const bob = Math.abs(walk) * 0.026;
            const aim = combat
              ? Math.atan2(
                  combat.target.x - parent.position.x,
                  combat.target.z - parent.position.z,
                ) - modelAngle
              : rally * 0.17 * Math.sin(clock * 2);
            put(2, 0, bob, 0);
            put(6, 0, bob, 0, 0, aim);
            put(7, -Math.sin(aim) * kick, bob, -Math.cos(aim) * kick, 0, aim);
            for (let side = -1; side <= 1; side += 2) {
              for (let w = 0; w < TANK_WHEEL_Z.length; w++)
                put(
                  9,
                  side * 1.94,
                  0.66,
                  TANK_WHEEL_Z[w],
                  formation.moving ? clock * 7 : 0,
                  0,
                  0.42,
                );
              put(
                10,
                side * 1.52,
                1.27,
                formation.moving ? ((clock * 1.3) % 1) * 0.38 : 0,
              );
            }
            if (combat && shot < 0.12)
              flash(0, 2.3 + bob, 4.21 - kick, aim, 0.95);
            badgeX = 1.07 * Math.cos(aim) + 0.12 * Math.sin(aim);
            badgeZ = -1.07 * Math.sin(aim) + 0.12 * Math.cos(aim);
            badgeY = 2.22 + bob;
            badgeYaw = aim;
            badgeScale = 1.6;
            stats.tanks++;
            stats.vehicles++;
          } else if (kind === "artillery") {
            const shot = combatElapsed % (4.4 + battleOffset * 0.65),
              kick = combat ? Math.max(0, 1 - shot / 0.5) * 0.46 : 0;
            put(4, 0, 0, 0);
            put(8, 0, -kick * 0.15, -kick, -rally * 0.035);
            for (let side = -1; side <= 1; side += 2)
              put(
                9,
                side * 1.03,
                0.7,
                0,
                formation.moving ? clock * 5 : 0,
                0,
                0.67,
              );
            if (combat) {
              if (shot < 0.14)
                flash(0, 1.96 - kick * 0.15, 2.96 - kick, 0, 1.2);
              if (
                shot >= 0.14 &&
                shot < 1.65 &&
                stats.shells < MAX_UNIT_EFFECTS
              ) {
                point(0, 1.96, 2.96);
                const t = (shot - 0.14) / 1.51;
                const arc = Math.min(
                  20,
                  Math.max(6, origin.distanceTo(combat.target) * 0.18),
                );
                projectile.lerpVectors(origin, combat.target, t);
                projectile.y += 4 * t * (1 - t) * arc;
                direction.subVectors(combat.target, origin);
                direction.y += 4 * (1 - 2 * t) * arc;
                direction.normalize();
                transform.position.copy(projectile);
                transform.quaternion.setFromUnitVectors(up, direction);
                transform.scale.setScalar(1.3);
                transform.updateMatrix();
                shells.setMatrixAt(stats.shells++, transform.matrix);
              }
              if (
                shot >= 1.65 &&
                shot < 2.22 &&
                stats.impacts < MAX_UNIT_EFFECTS
              ) {
                const t = (shot - 1.65) / 0.57,
                  size = 1.4 + t * 4.5;
                transform.position.copy(combat.target);
                transform.position.y += 0.35 + t * 0.75;
                transform.rotation.set(0, clock, 0);
                transform.scale.set(size, 0.7 + t * 1.6, size);
                transform.updateMatrix();
                impacts.setMatrixAt(stats.impacts++, transform.matrix);
              }
            }
            badgeX = 0.92;
            badgeY = 1.5;
            badgeZ = 0.31;
            badgeScale = 1.6;
            stats.artillery++;
            stats.vehicles++;
          } else {
            const bob = formation.moving ? Math.sin(clock * 10) * 0.045 : 0;
            put(3, 0, bob, 0);
            for (let side = -1; side <= 1; side += 2)
              for (let w = 0; w < TRUCK_WHEEL_Z.length; w++)
                put(
                  9,
                  side * 1.1,
                  0.57,
                  TRUCK_WHEEL_Z[w],
                  formation.moving ? clock * 6 : 0,
                  0,
                  0.55,
                );
            if (combat || captureProgress >= 0) {
              const t = (clock * 0.42 + battleOffset) % 1,
                ease = t * t * (3 - 2 * t);
              put(
                11,
                1.75 * ease,
                1.65 - 1.32 * ease + Math.sin(t * Math.PI) * 0.32,
                -1.35,
                0,
                0.15 * Math.sin(clock * 2),
              );
            }
            badgeX = 1.06;
            badgeY = 1.73 + bob;
            badgeZ = 0.85;
            badgeScale = 1.6;
            stats.trucks++;
            stats.vehicles++;
          }
          transform.position.set(badgeX, badgeY, badgeZ);
          transform.rotation.set(0, badgeYaw, 0);
          transform.scale.set(badgeScale, badgeScale, badgeScale);
          transform.updateMatrix();
          transform.matrix.premultiply(parent.matrix);
          accents.setMatrixAt(accents.count, transform.matrix);
          accents.setColorAt(accents.count++, color.setHex(formation.tint));
        }
        if (captureProgress >= 0 && stats.captures < MAX_UNIT_EFFECTS) {
          parent.position.copy(formation.position);
          if (heightAtWorld)
            parent.position.y = heightAtWorld(
              parent.position.x,
              parent.position.z,
            );
          parent.rotation.set(0, formation.angle, 0);
          parent.scale.setScalar(UNIT_MODEL_SCALE);
          parent.updateMatrix();
          const rise = Math.min(1, captureProgress * 5),
            flutter =
              Math.sin(clock * 8) * 0.13 * Math.sin(captureProgress * Math.PI);
          put(12, 0, 0, 0);
          transform.position.set(0, -(1 - rise) * 2.8, 0);
          transform.rotation.set(0, flutter, 0);
          transform.scale.set(0.55 + 0.45 * rise, 1, 1);
          transform.updateMatrix();
          transform.matrix.premultiply(parent.matrix);
          flags.setMatrixAt(stats.captures, transform.matrix);
          flags.setColorAt(stats.captures++, color.setHex(formation.tint));
        }
      }
      for (const [key, value] of captures)
        if (value.frame !== frame) captures.delete(key);
      // Entries are bounded by the visible formation budget and expire as soon
      // as their actual battle is absent, including hidden or removed armies.
      for (const [key, value] of combats)
        if (value.frame !== frame) combats.delete(key);
      for (let i = 0; i < batches.length; i++) {
        batches[i].count = counts[i];
        batches[i].visible = counts[i] > 0;
        batches[i].instanceMatrix.needsUpdate = true;
        stats.instances += counts[i];
      }
      flags.count = stats.captures;
      flashes.count = stats.muzzleFlashes;
      shells.count = stats.shells;
      impacts.count = stats.impacts;
      for (const mesh of overlayBatches) {
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        stats.instances += mesh.count;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      captures.clear();
      combats.clear();
      stats.infantry =
        stats.vehicles =
        stats.instances =
        stats.tanks =
        stats.artillery =
        stats.trucks =
        stats.combatFormations =
        stats.muzzleFlashes =
        stats.shells =
        stats.impacts =
        stats.captures =
          0;
      for (const mesh of batches) {
        scene.remove(mesh);
        mesh.dispose();
      }
      for (const mesh of [accents, flags, flashes, shells, impacts]) {
        scene.remove(mesh);
        mesh.dispose();
      }
      for (const geometry of [
        ...geometries,
        accentGeometry,
        flagGeometry,
        flashGeometry,
        shellGeometry,
        impactGeometry,
      ])
        geometry.dispose();
      for (const m of [
        material,
        accentMaterial,
        flashMaterial,
        shellMaterial,
        impactMaterial,
      ])
        m.dispose();
    },
  };
}
