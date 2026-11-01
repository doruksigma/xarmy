import * as THREE from "three";
import type { GraphicsQuality } from "./map3d-visuals";

export type TrainKind = "locomotive" | "tender" | "boxcar" | "flatcar";
export interface TrainPose {
  position: THREE.Vector3;
  angle: number;
  pitch?: number;
  kind: TrainKind;
  scale: number;
  wheelPhase: number;
}
export const TRAIN_DIMENSIONS = {
  locomotive: { length: 8, width: 2.2, height: 3.5 },
  tender: { length: 4.8, width: 2.05, height: 2.6 },
  boxcar: { length: 5.8, width: 2.1, height: 3.0 },
  flatcar: { length: 5.8, width: 2.1, height: 2.5 },
  gauge: 1.5,
  wheelRadius: 0.55,
} as const;
export const TRAIN_WORLD_SCALE = 1.2;
export const MAX_TRAIN_VEHICLES = 160;
export const MAX_TRAIN_SMOKE = 128;
export interface TrainModelOptions {
  quality: GraphicsQuality;
  paused?: boolean;
  reduced?: boolean;
}
export interface TrainModelStats {
  vehicles: number;
  locomotives: number;
  wheels: number;
  rods: number;
  smoke: number;
}
type XYZ = readonly [number, number, number];
const CHARCOAL = 0x283238,
  IRON = 0x505c60,
  STEEL = 0xb1b6af,
  BRASS = 0xcaa253,
  RED = 0x984336,
  GREEN = 0x405c51,
  GLASS = 0x8fb8bc,
  WOOD = 0xa77749,
  DARK_WOOD = 0x6a4935;

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

function torus(
  m: ModelBuilder,
  radius: number,
  tube: number,
  at: XYZ,
  color: number,
  axis: "x" | "z" = "z",
) {
  m.add(
    new THREE.TorusGeometry(radius, tube, 5, 16),
    color,
    at,
    axis === "x" ? [0, Math.PI / 2, 0] : [0, 0, 0],
  );
}
function couplers(m: ModelBuilder, half: number, width: number) {
  for (const side of [-1, 1]) {
    m.box([0.38, 0.16, 0.19], [side * (half - 0.2), 0.72, 0], IRON);
    torus(m, 0.1, 0.035, [side * (half - 0.04), 0.72, 0], STEEL, "x");
    for (const z of [-width * 0.31, width * 0.31]) {
      m.cylinder(0.08, 0.24, [side * (half - 0.26), 0.8, z], IRON, [
        0,
        0,
        Math.PI / 2,
      ]);
      m.cylinder(
        0.14,
        0.06,
        [side * (half - 0.12), 0.8, z],
        CHARCOAL,
        [0, 0, Math.PI / 2],
        10,
      );
    }
  }
}
function chassis(
  m: ModelBuilder,
  length: number,
  width: number,
  color: number,
) {
  m.softBox([length, 0.26, width], [0, 0.98, 0], color, 0.06);
  for (const z of [-0.5, 0.5])
    m.box([length - 0.2, 0.18, 0.12], [0, 0.75, z], IRON);
}
function locomotiveModel() {
  const m = new ModelBuilder();
  chassis(m, 6.95, 1.89, RED);
  // Round pressure vessel, smoke box, metal bands and the actual forward headlight.
  m.cylinder(0.79, 4.34, [0.55, 1.84, 0], CHARCOAL, [0, 0, Math.PI / 2], 18);
  m.cylinder(0.81, 0.22, [2.79, 1.84, 0], 0x20292e, [0, 0, Math.PI / 2], 18);
  for (const x of [-1.38, -0.35, 0.7, 1.75])
    torus(m, 0.8, 0.035, [x, 1.84, 0], x === -0.35 ? BRASS : IRON, "x");
  torus(m, 0.76, 0.045, [2.92, 1.84, 0], STEEL, "x");
  m.cylinder(0.28, 0.08, [2.94, 1.84, 0], CHARCOAL, [0, 0, Math.PI / 2]);
  m.rod([3, 1.64, 0], [3, 2.04, 0], 0.035, BRASS);
  m.rod([3, 1.84, -0.2], [3, 1.84, 0.2], 0.035, BRASS);
  m.cylinder(0.25, 0.25, [2.97, 2.36, 0], BRASS, [0, 0, Math.PI / 2], 12);
  m.cylinder(0.19, 0.03, [3.11, 2.36, 0], 0xffe7ae, [0, 0, Math.PI / 2], 12);
  m.add(
    new THREE.CylinderGeometry(0.3, 0.21, 0.81, 12),
    CHARCOAL,
    [2.04, 2.98, 0],
  );
  m.cylinder(0.34, 0.09, [2.04, 3.43, 0], IRON, [0, 0, 0], 12);
  m.cylinder(0.27, 0.25, [-0.66, 2.63, 0], CHARCOAL);
  m.sphere(0.29, [-0.66, 2.77, 0], BRASS, [1, 0.76, 1]);
  m.add(new THREE.CylinderGeometry(0.13, 0.27, 0.3, 10), BRASS, [0.6, 2.78, 0]);
  m.rod([0.35, 2.91, 0], [0.86, 2.91, 0], 0.035, IRON);
  // Cab has framed window openings, interior floor and a curved sheet-metal roof.
  m.box([1.83, 0.78, 1.85], [-2.4, 1.47, 0], GREEN);
  for (const z of [-0.94, 0.94]) {
    for (const x of [-3.25, -2.35, -1.49])
      m.box([0.09, 1.14, 0.11], [x, 2.43, z], GREEN);
    m.box([1.85, 0.11, 0.12], [-2.38, 3.02, z], GREEN);
    m.box([0.75, 0.81, 0.025], [-2.82, 2.45, z], GLASS);
    m.box([0.71, 0.81, 0.025], [-1.92, 2.45, z], 0x648f95);
    m.box([1.85, 0.07, 0.13], [-2.38, 2.0, z], BRASS);
    m.rod([-3.2, 1.18, z * 1.1], [-3.2, 2.45, z * 1.1], 0.035, STEEL);
    for (let y = 0.35; y < 1.2; y += 0.29)
      m.box([0.55, 0.07, 0.31], [-3.02, y, z], IRON);
    m.box([4.72, 0.11, 0.25], [0.66, 1.11, z], IRON);
    m.rod([-1.22, 2.06, z * 0.98], [2.58, 2.06, z * 0.98], 0.033, BRASS);
    for (const x of [-1.15, 0.2, 1.55, 2.5])
      m.rod([x, 1.82, z * 0.74], [x, 2.07, z * 0.98], 0.026, STEEL);
    m.cylinder(0.19, 0.92, [2.31, 0.76, z * 0.73], CHARCOAL, [
      0,
      0,
      Math.PI / 2,
    ]);
    m.rod([1.76, 0.77, z * 0.79], [2.77, 0.77, z * 0.79], 0.053, STEEL);
    m.box([0.55, 0.24, 0.03], [-2.38, 1.49, z * 1.02], BRASS);
    for (const x of [-2.52, -2.39, -2.26])
      m.box([0.055, 0.12, 0.04], [x, 1.49, z * 1.045], CHARCOAL);
  }
  m.box([0.1, 0.92, 1.77], [-3.3, 2.42, 0], GREEN);
  m.box([0.11, 0.67, 0.78], [-3.36, 2.46, 0], GLASS);
  const roof = new THREE.CylinderGeometry(
    1.08,
    1.08,
    2.15,
    16,
    1,
    false,
    0,
    Math.PI,
  );
  roof.rotateZ(Math.PI / 2).scale(1, 0.28, 1);
  m.add(roof, CHARCOAL, [-2.38, 3.04, 0]);
  m.box([0.49, 0.06, 0.52], [-2.4, 3.36, 0], IRON);
  // Slatted wedge pilot is open, rather than a featureless block.
  for (let i = -5; i <= 5; i++)
    m.rod([3.12, 0.86, i * 0.15], [3.88, 0.25, i * 0.2], 0.04, RED);
  m.rod([3.88, 0.25, -1.03], [3.88, 0.25, 1.03], 0.05, STEEL);
  m.box([0.22, 0.2, 2.1], [3.17, 0.92, 0], RED);
  // Repeated rivets are baked into this single geometry, never separate draw calls.
  for (const side of [-1, 1])
    for (let x = -3.1; x <= 3.1; x += 0.42)
      m.add(new THREE.IcosahedronGeometry(0.038, 0), BRASS, [
        x,
        1,
        side * 0.96,
      ]);
  couplers(m, 4, 1.9);
  return m.build();
}
function tenderModel() {
  const m = new ModelBuilder();
  chassis(m, 4.05, 1.91, RED);
  m.softBox([3.65, 1.15, 1.82], [0, 1.65, 0], GREEN, 0.08);
  m.box([3.76, 0.12, 1.92], [0, 2.22, 0], IRON);
  m.box([3.4, 0.08, 1.5], [0, 2.27, 0], CHARCOAL);
  for (let x = -1.4; x <= 1.4; x += 0.41)
    for (let z = -0.55; z <= 0.56; z += 0.36) {
      const h = 0.12 + 0.06 * Math.cos(x * 9 + z * 3);
      m.add(
        new THREE.IcosahedronGeometry(0.24, 0),
        (Math.round(x * 20) + Math.round(z * 20)) & 1 ? 0x242a2c : 0x353c3b,
        [x, 2.31 + h / 2, z],
        [x, 0.4, z],
        [1, h / 0.24, 0.9],
      );
    }
  for (const z of [-0.95, 0.95]) {
    m.box([3.45, 0.06, 0.035], [0, 1.77, z], BRASS);
    for (const x of [-1.67, -0.56, 0.56, 1.67])
      m.box([0.07, 1.01, 0.065], [x, 1.66, z], IRON);
    for (let x = -1.65; x < 1.7; x += 0.3)
      m.add(new THREE.IcosahedronGeometry(0.032, 0), STEEL, [x, 1.2, z]);
  }
  m.cylinder(0.29, 0.09, [-1.5, 2.36, 0], BRASS, [0, 0, 0], 10);
  for (let y = 0.38; y < 1.9; y += 0.32)
    m.rod([-2.05, y, -0.31], [-2.05, y, 0.31], 0.036, STEEL);
  couplers(m, 2.4, 1.9);
  return m.build();
}
function boxcarModel() {
  const m = new ModelBuilder();
  chassis(m, 5.08, 1.95, IRON);
  m.box([4.63, 1.56, 1.82], [0, 1.96, 0], WOOD);
  for (const z of [-0.94, 0.94]) {
    for (let x = -2.2; x <= 2.21; x += 0.42)
      m.box([0.025, 1.48, 0.03], [x, 1.97, z], DARK_WOOD);
    for (const x of [-2.3, 2.3]) m.box([0.1, 1.63, 0.1], [x, 1.95, z], IRON);
    m.box([1.42, 1.48, 0.1], [0.04, 1.96, z * 1.03], 0x8f613e);
    for (const y of [1.28, 2.64]) m.box([4.65, 0.07, 0.08], [0, y, z], IRON);
    for (const x of [-0.66, 0.72])
      m.box([0.08, 1.47, 0.14], [x, 1.96, z * 1.035], IRON);
    m.rod([-0.6, 1.29, z * 1.06], [0.65, 2.6, z * 1.06], 0.035, STEEL);
    m.box([0.11, 0.24, 0.06], [0.42, 1.9, z * 1.075], BRASS);
    m.box([0.5, 0.28, 0.03], [-1.5, 1.86, z * 1.04], 0xd3bd8e);
    for (const x of [-2.1, 2.1]) m.box([0.4, 0.11, 0.2], [x, 0.56, z], IRON);
  }
  const roof = new THREE.CylinderGeometry(
    1.04,
    1.04,
    4.9,
    16,
    1,
    false,
    0,
    Math.PI,
  );
  roof.rotateZ(Math.PI / 2).scale(1, 0.24, 1);
  m.add(roof, 0x636e6c, [0, 2.73, 0]);
  for (const x of [-2.37, 2.37]) {
    m.box([0.06, 1.56, 1.83], [x, 1.96, 0], DARK_WOOD);
    for (let y = 1.3; y < 2.7; y += 0.27)
      m.rod([x * 1.035, y, -0.3], [x * 1.035, y, 0.3], 0.032, STEEL);
  }
  couplers(m, 2.9, 1.9);
  return m.build();
}
function flatcarModel() {
  const m = new ModelBuilder();
  chassis(m, 5.06, 1.97, IRON);
  m.box([4.88, 0.14, 1.87], [0, 1.18, 0], DARK_WOOD);
  for (const side of [-1, 1]) {
    m.box([4.82, 0.48, 0.095], [0, 1.49, side * 0.98], WOOD);
    for (let x = -2.27; x < 2.3; x += 0.76)
      m.box([0.08, 0.66, 0.1], [x, 1.5, side], IRON);
    for (const y of [1.34, 1.56])
      m.box([4.8, 0.02, 0.03], [0, y, side * 1.035], DARK_WOOD);
  }
  for (const x of [-2.37, 2.37]) m.box([0.1, 0.46, 1.97], [x, 1.49, 0], WOOD);
  for (const [x, z, size] of [
    [-1.45, -0.35, 0.86],
    [-1.45, 0.46, 0.62],
    [0.06, -0.23, 1.12],
    [1.38, 0.08, 0.96],
  ] as const) {
    m.softBox(
      [size, size * 0.82, size],
      [x, 1.29 + size * 0.41, z],
      x > 0 ? 0xb99b68 : 0x9e8054,
      0.035,
    );
    for (const dx of [-size * 0.35, size * 0.35])
      m.box(
        [0.045, size * 0.83, size + 0.025],
        [x + dx, 1.29 + size * 0.41, z],
        DARK_WOOD,
      );
    m.box([size + 0.02, 0.05, 0.05], [x, 1.35 + size * 0.82, z], DARK_WOOD);
  }
  m.cylinder(0.3, 0.68, [1.57, 2.1, 0.06], 0x63766a, [Math.PI / 2, 0, 0]);
  for (const x of [-1.48, 0.08, 1.4])
    m.rod([x, 1.45, -1.02], [x, 2.4, 0], 0.022, LEATHER_COLOR);
  for (const x of [-1.48, 0.08, 1.4])
    m.rod([x, 2.4, 0], [x, 1.45, 1.02], 0.022, LEATHER_COLOR);
  couplers(m, 2.9, 1.9);
  return m.build();
}
const LEATHER_COLOR = 0x66583f;
const ENGINE_AXLES = [-2.5, -0.95, 0.6, 2.15] as const;
const TENDER_AXLES = [-1.25, 1.25] as const;
const FREIGHT_AXLES = [-1.72, 1.72] as const;
function wheelModel() {
  const m = new ModelBuilder();
  // A real open steel rim: 96 triangles, rather than two expensive toruses.
  const vertices: number[] = [];
  const quad = (a: XYZ, b: XYZ, c: XYZ, d: XYZ) =>
    vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      b = ((i + 1) * Math.PI) / 6;
    const outerA: XYZ = [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.08],
      outerB: XYZ = [Math.cos(b) * 0.55, Math.sin(b) * 0.55, 0.08];
    const innerA: XYZ = [Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0.08],
      innerB: XYZ = [Math.cos(b) * 0.46, Math.sin(b) * 0.46, 0.08];
    const oa: XYZ = [outerA[0], outerA[1], -0.08],
      ob: XYZ = [outerB[0], outerB[1], -0.08];
    const ia: XYZ = [innerA[0], innerA[1], -0.08],
      ib: XYZ = [innerB[0], innerB[1], -0.08];
    quad(outerA, outerB, innerB, innerA);
    quad(ob, oa, ia, ib);
    quad(outerB, outerA, oa, ob);
    quad(innerA, innerB, ib, ia);
  }
  const rim = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  rim.computeVertexNormals();
  m.add(rim, 0x586268);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    m.box(
      [0.4, 0.065, 0.15],
      [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0],
      RED,
      [0, 0, a],
    );
  }
  m.cylinder(0.135, 0.21, [0, 0, 0], BRASS, [Math.PI / 2, 0, 0], 6);
  m.box([0.27, 0.24, 0.13], [-0.19, -0.16, 0], RED);
  for (const side of [-1, 1])
    m.cylinder(
      0.065,
      0.08,
      [0.17, 0, side * 0.14],
      STEEL,
      [Math.PI / 2, 0, 0],
      4,
    );
  return m.build();
}
function rodModel() {
  const m = new ModelBuilder();
  m.softBox([4.75, 0.11, 0.075], [-0.175, 0, 0], STEEL, 0.025);
  for (const x of ENGINE_AXLES) {
    m.cylinder(0.09, 0.08, [x, 0, 0], BRASS, [Math.PI / 2, 0, 0], 6);
    m.cylinder(0.045, 0.11, [x, 0, 0], IRON, [Math.PI / 2, 0, 0], 5);
  }
  return m.build();
}
export function createTrainModelGeometries() {
  return {
    locomotive: locomotiveModel(),
    tender: tenderModel(),
    boxcar: boxcarModel(),
    flatcar: flatcarModel(),
    wheel: wheelModel(),
    rods: rodModel(),
  };
}

/** Bounded instanced display models. Rail topology, clock and vehicle poses remain caller-owned. */
export function createTrainModels(parent: THREE.Object3D) {
  const geometries = createTrainModelGeometries();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.71,
    metalness: 0.27,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.5,
  });
  const kinds: TrainKind[] = ["locomotive", "tender", "boxcar", "flatcar"];
  const bodies = kinds.map((kind) => {
    const mesh = new THREE.InstancedMesh(
      geometries[kind],
      material,
      MAX_TRAIN_VEHICLES,
    );
    mesh.name = `detailed-train-${kind}`;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh);
    return mesh;
  });
  const wheels = new THREE.InstancedMesh(
    geometries.wheel,
    wheelMaterial,
    MAX_TRAIN_VEHICLES * 8,
  );
  const rods = new THREE.InstancedMesh(
    geometries.rods,
    wheelMaterial,
    MAX_TRAIN_VEHICLES * 2,
  );
  for (const [mesh, name] of [
    [wheels, "detailed-train-spoked-wheels"],
    [rods, "detailed-train-side-rods"],
  ] as const) {
    mesh.name = name;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh);
  }
  const textureData = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5),
        index = (y * 32 + x) * 4;
      textureData[index] =
        textureData[index + 1] =
        textureData[index + 2] =
          255;
      textureData[index + 3] = Math.round(Math.max(0, 1 - r * r) ** 2 * 255);
    }
  const smokeTexture = new THREE.DataTexture(
    textureData,
    32,
    32,
    THREE.RGBAFormat,
  );
  smokeTexture.needsUpdate = true;
  smokeTexture.magFilter = THREE.LinearFilter;
  smokeTexture.minFilter = THREE.LinearFilter;
  const smokeGeometry = new THREE.BufferGeometry();
  const smokePositions = new THREE.BufferAttribute(
    new Float32Array(MAX_TRAIN_SMOKE * 3),
    3,
  );
  smokePositions.setUsage(THREE.DynamicDrawUsage);
  smokeGeometry.setAttribute("position", smokePositions);
  smokeGeometry.setDrawRange(0, 0);
  const smokeMaterial = new THREE.PointsMaterial({
    color: 0xe2ded0,
    map: smokeTexture,
    size: 1.45,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
  smoke.name = "detailed-train-steam";
  smoke.frustumCulled = false;
  parent.add(smoke);
  const root = new THREE.Object3D(),
    part = new THREE.Object3D(),
    yaw = new THREE.Quaternion(),
    pitch = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0),
    Z = new THREE.Vector3(0, 0, 1),
    puff = new THREE.Vector3();
  const counts = new Uint16Array(4);
  const stats: TrainModelStats = {
    vehicles: 0,
    locomotives: 0,
    wheels: 0,
    rods: 0,
    smoke: 0,
  };
  let disposed = false;
  function place(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    spin = 0,
  ) {
    part.position.set(x, y, z);
    part.rotation.set(0, 0, spin);
    part.scale.setScalar(1);
    part.updateMatrix();
    part.matrix.premultiply(root.matrix);
    mesh.setMatrixAt(index, part.matrix);
  }
  return {
    get stats(): Readonly<TrainModelStats> {
      return stats;
    },
    update(
      poses: readonly TrainPose[],
      timeSeconds: number,
      options: TrainModelOptions,
    ) {
      if (disposed) return;
      counts.fill(0);
      stats.vehicles =
        stats.locomotives =
        stats.wheels =
        stats.rods =
        stats.smoke =
          0;
      for (let i = 0; i < poses.length && i < MAX_TRAIN_VEHICLES; i++) {
        const pose = poses[i],
          type =
            pose.kind === "locomotive"
              ? 0
              : pose.kind === "tender"
                ? 1
                : pose.kind === "boxcar"
                  ? 2
                  : 3;
        if (!Number.isFinite(pose.scale) || pose.scale <= 0) continue;
        root.position.copy(pose.position);
        yaw.setFromAxisAngle(Y, pose.angle);
        pitch.setFromAxisAngle(Z, pose.pitch ?? 0);
        root.quaternion.copy(yaw).multiply(pitch);
        root.scale.setScalar(pose.scale);
        root.updateMatrix();
        bodies[type].setMatrixAt(counts[type]++, root.matrix);
        stats.vehicles++;
        const axles =
          type === 0 ? ENGINE_AXLES : type === 1 ? TENDER_AXLES : FREIGHT_AXLES;
        for (let axle = 0; axle < axles.length; axle++)
          for (let side = -1; side <= 1; side += 2)
            place(
              wheels,
              stats.wheels++,
              axles[axle],
              TRAIN_DIMENSIONS.wheelRadius,
              side * TRAIN_DIMENSIONS.gauge * 0.5,
              pose.wheelPhase,
            );
        if (type === 0) {
          stats.locomotives++;
          for (let side = -1; side <= 1; side += 2)
            place(
              rods,
              stats.rods++,
              Math.cos(pose.wheelPhase) * 0.17,
              TRAIN_DIMENSIONS.wheelRadius + Math.sin(pose.wheelPhase) * 0.17,
              side * 0.93,
            );
          const puffs = options.quality === "low" ? 2 : 4;
          for (let j = 0; j < puffs && stats.smoke < MAX_TRAIN_SMOKE; j++) {
            const age = (timeSeconds * 0.65 + j / puffs + i * 0.13) % 1;
            puff
              .set(
                2.04 - age * 1.9,
                3.48 + age * 3.2,
                Math.sin(age * 3 + i) * age * 0.3,
              )
              .applyMatrix4(root.matrix);
            smokePositions.setXYZ(stats.smoke++, puff.x, puff.y, puff.z);
          }
        }
      }
      for (let i = 0; i < bodies.length; i++) {
        bodies[i].count = counts[i];
        bodies[i].visible = counts[i] > 0;
        bodies[i].instanceMatrix.needsUpdate = true;
      }
      wheels.count = stats.wheels;
      rods.count = stats.rods;
      wheels.visible = stats.wheels > 0;
      rods.visible = stats.rods > 0;
      wheels.instanceMatrix.needsUpdate =
        rods.instanceMatrix.needsUpdate = true;
      smokeGeometry.setDrawRange(0, stats.smoke);
      smoke.visible = stats.smoke > 0;
      smokePositions.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stats.vehicles =
        stats.locomotives =
        stats.wheels =
        stats.rods =
        stats.smoke =
          0;
      for (const mesh of bodies) {
        parent.remove(mesh);
        mesh.dispose();
      }
      parent.remove(wheels, rods, smoke);
      wheels.dispose();
      rods.dispose();
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      material.dispose();
      wheelMaterial.dispose();
      smokeGeometry.dispose();
      smokeMaterial.dispose();
      smokeTexture.dispose();
    },
  };
}
