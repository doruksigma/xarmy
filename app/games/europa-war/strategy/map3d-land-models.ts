import * as THREE from "three";

/** Original merged WWII miniatures; all articulated anchors use model-local units. */
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

type Surface = readonly [roughness: number, metalness: number];
const FABRIC: Surface = [0.94, 0];
const PAINTED_STEEL: Surface = [0.66, 0.24];
const STEEL: Surface = [0.39, 0.72];
const GLASS: Surface = [0.18, 0.15];
const RUBBER: Surface = [0.94, 0.015];
const clothColors = new Set([
  CLOTH,
  CLOTH_LIGHT,
  0x4e5740,
  0x596344,
  0x8a8966,
  0x686c4e,
  0x686d4e,
  0x949773,
]);
const glassColors = new Set([0x63868a, 0x536d74, 0xd0c29c, 0xd8cb9e]);
const bareSteelColors = new Set([
  METAL,
  0x747e70,
  0x9b9e83,
  0x9b9d72,
  0x92967a,
  0x929878,
  0x9b9f7a,
  0x87906b,
  0xa7aa83,
  0x989c7d,
  0xb5ac89,
  0x747b62,
]);
function surfaceFor(color: number, fallback: Surface): Surface {
  if (clothColors.has(color)) return FABRIC;
  if (glassColors.has(color)) return GLASS;
  if (bareSteelColors.has(color)) return STEEL;
  if (color === SKIN) return [0.82, 0];
  if (
    color === LEATHER ||
    color === WOOD ||
    color === 0xa88b59 ||
    color === 0x554a38
  )
    return [0.87, 0];
  if (
    color === TRACK ||
    color === BOOT ||
    color === 0x282b25 ||
    color === 0x343d31
  )
    return RUBBER;
  if (color === HELMET || color === ARMOR) return PAINTED_STEEL;
  return fallback;
}

/** Static colored pieces are merged once, keeping each model to one draw batch. */
class ModelBuilder {
  constructor(private readonly defaultSurface: Surface = PAINTED_STEEL) {}
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
    const surface = new Float32Array(count * 2);
    const [roughness, metalness] = surfaceFor(color, this.defaultSurface);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = this.tint.r;
      colors[i * 3 + 1] = this.tint.g;
      colors[i * 3 + 2] = this.tint.b;
      surface[i * 2] = roughness;
      surface[i * 2 + 1] = metalness;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("unitSurface", new THREE.BufferAttribute(surface, 2));
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
  profile(
    points: readonly (readonly [number, number])[],
    depth: number,
    position: XYZ,
    color: number,
  ) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], index) =>
      index ? shape.lineTo(x, y) : shape.moveTo(x, y),
    );
    shape.closePath();
    const bevel = Math.min(0.03, depth / 3);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -(depth - bevel * 2) / 2);
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
    for (const name of ["position", "normal", "color", "unitSurface"]) {
      const size = name === "unitSurface" ? 2 : 3;
      const data = new Float32Array(count * size);
      let offset = 0;
      for (const piece of this.pieces) {
        const attribute = piece.getAttribute(name);
        data.set(attribute.array, offset);
        offset += attribute.array.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    this.pieces.forEach((p) => p.dispose());
    this.pieces.length = 0;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function infantryBody() {
  const m = new ModelBuilder(FABRIC);
  // Tapered field jacket with sloped shoulders, rather than a rectangular torso.
  m.profile(
    [
      [-0.65, -0.695],
      [0.65, -0.695],
      [0.58, 0.42],
      [0.4, 0.695],
      [-0.4, 0.695],
      [-0.58, 0.42],
    ],
    0.72,
    [0, 2.55, 0],
    CLOTH,
  );
  m.box([0.045, 1.1, 0.035], [0, 2.56, 0.38], 0x4e5740);
  for (const side of [-1, 1]) {
    m.box([0.29, 0.23, 0.05], [side * 0.32, 2.88, 0.38], CLOTH_LIGHT);
    m.box([0.31, 0.045, 0.065], [side * 0.32, 3.01, 0.39], 0x596344);
    m.box([0.23, 0.13, 0.07], [side * 0.22, 3.22, 0.26], CLOTH_LIGHT, [
      0,
      0,
      side * -0.45,
    ]);
  }
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
  // Bedroll straps, mess tin, canteen and entrenching tool make the silhouette
  // legible from the strategic camera without texture or extra draw calls.
  for (const side of [-1, 1]) {
    m.box([0.085, 0.96, 0.06], [side * 0.32, 2.64, -0.775], LEATHER);
    m.box([0.1, 0.32, 0.05], [side * 0.31, 3.18, -0.72], LEATHER);
  }
  m.softBox([0.35, 0.47, 0.2], [-0.66, 2.12, -0.38], 0x536153, 0.045);
  m.cylinder(0.067, 0.08, [-0.66, 2.395, -0.38], METAL);
  m.softBox([0.34, 0.24, 0.16], [0.49, 2.35, -0.72], 0x747e70, 0.03);
  m.rod([0.68, 2.73, -0.43], [0.68, 2.08, -0.44], 0.045, WOOD);
  m.profile(
    [
      [-0.16, 0.15],
      [0.16, 0.15],
      [0.13, -0.09],
      [0, -0.2],
      [-0.13, -0.09],
    ],
    0.035,
    [0.68, 1.96, -0.44],
    METAL,
  );
  m.box([0.07, 0.17, 0.09], [0.79, 2.17, 0.15], LEATHER);
  return m.build();
}
function infantryLeg() {
  const m = new ModelBuilder(FABRIC);
  m.add(new THREE.CapsuleGeometry(0.21, 0.82, 2, 6), CLOTH, [0, -0.56, 0]);
  m.cylinder(0.17, 0.55, [0, -1.16, 0], CLOTH_LIGHT);
  m.softBox([0.46, 0.34, 0.74], [0, -1.48, 0.14], BOOT, 0.06);
  m.box([0.48, 0.08, 0.77], [0, -1.62, 0.14], 0x282b25);
  m.box([0.038, 0.83, 0.018], [0.18, -0.54, 0.11], 0x525b40);
  for (const y of [-1.03, -1.14, -1.25])
    m.box([0.22, 0.025, 0.018], [0, y, 0.176], 0x656e50);
  m.box([0.21, 0.08, 0.035], [0, -1.43, 0.5], 0x554a38);
  return m.build();
}
function infantryDetails() {
  const m = new ModelBuilder(FABRIC);
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
  m.rod([0.39, 2.72, 0.15], [0.39, 2.54, 1.36], 0.018, LEATHER);
  for (const side of [-1, 1]) {
    m.rod(
      [side * 0.18, 2.96, 0.404],
      [side * 0.45, 2.96, 0.404],
      0.012,
      0xa1a278,
    );
    m.box([0.2, 0.035, 0.015], [side * 0.32, 2.79, 0.414], 0x949773);
    m.sphere(0.024, [side * 0.31, 2.13, 0.61], 0x9c9871);
  }
  m.add(new THREE.CircleGeometry(0.049, 8), 0x1e2522, [0.37, 2.9, 1.972]);
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
  // Broad fenders, low stowage and an exposed rear drive deck distinguish the
  // hull from its independently rotating turret and recoiling barrel.
  for (const side of [-1, 1]) {
    m.box([0.5, 0.075, 4.35], [side * 1.57, 1.36, -0.04], 0x727954);
    m.softBox([0.37, 0.37, 1.08], [side * 1.26, 1.79, -1.31], 0x596247, 0.055);
    m.box([0.038, 0.045, 0.58], [side * 1.46, 1.86, -1.28], METAL);
    m.rod(
      [side * 0.68, 1.36, -2.06],
      [side * 0.68, 2.14, -2.06],
      0.11,
      0x514a3c,
    );
    m.cylinder(0.14, 0.075, [side * 0.68, 2.17, -2.06], 0x292f2b);
    m.box([0.18, 0.17, 0.08], [side * 0.87, 1.13, 2.23], METAL);
    m.rod(
      [side * 0.95, 1.95, -0.98],
      [side * 1.18, 2.0, -0.77],
      0.035,
      0x9b9d72,
    );
    for (const z of [-1.63, -0.73, 0.17, 1.07])
      m.box([0.055, 0.055, 0.09], [side * 1.445, 1.54, z], 0x92967a);
  }
  m.box([0.76, 0.15, 0.49], [-0.48, 1.91, 0.78], 0x49523b, [-0.2, 0, 0]);
  m.box([0.41, 0.075, 0.085], [-0.48, 2.0, 1.01], 0x202c2c);
  m.cylinder(0.105, 0.28, [0.69, 1.62, 1.93], METAL, [Math.PI / 2, 0, 0]);
  m.box([0.76, 0.27, 0.11], [0, 1.2, -2.3], 0x343c32);
  for (let x = -0.28; x <= 0.3; x += 0.14)
    m.box([0.075, 0.3, 0.12], [x, 1.2, -2.3], 0x6d7450);
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
  m.cylinder(0.48, 0.2, [-0.28, 2.63, -0.04], ARMOR, [0, 0, 0], 10);
  m.cylinder(0.39, 0.055, [-0.28, 2.757, -0.04], 0x7c8363, [0, 0, 0], 10);
  m.rod([-0.42, 2.8, -0.06], [-0.14, 2.8, -0.06], 0.025, METAL);
  for (const side of [-1, 1]) {
    m.box([0.065, 0.13, 0.43], [side * 0.99, 2.28, 0.07], 0x414d3b);
    m.box([0.03, 0.06, 0.28], [side * 1.025, 2.3, 0.07], 0x1f2c2b);
    m.rod(
      [side * 0.93, 2.46, -0.42],
      [side * 0.93, 2.46, -0.03],
      0.025,
      0x9b9b78,
    );
    m.box([0.07, 0.16, 0.2], [side * 0.46, 2.25, 1.27], 0x8c9271);
  }
  m.softBox([0.73, 0.35, 0.23], [0.12, 2.22, -1.03], 0x716f50, 0.04);
  m.box([0.68, 0.035, 0.05], [0.12, 2.43, -1.06], METAL);
  m.box([0.19, 0.08, 0.29], [0.4, 2.57, 0.23], 0x3d4b3a);
  m.box([0.14, 0.035, 0.16], [0.4, 2.63, 0.23], 0x202b2b);
  return m.build();
}
function tankBarrel() {
  const m = new ModelBuilder();
  m.cylinder(0.13, 3.12, [0, 2.3, 2.55], METAL, [Math.PI / 2, 0, 0], 10);
  m.cylinder(0.19, 0.28, [0, 2.3, 4.07], METAL, [Math.PI / 2, 0, 0]);
  m.cylinder(0.23, 0.82, [0, 2.3, 1.44], 0x69714e, [Math.PI / 2, 0, 0], 10);
  m.cylinder(0.155, 0.12, [0, 2.3, 2.12], 0x747b62, [Math.PI / 2, 0, 0], 10);
  m.add(new THREE.CircleGeometry(0.115, 10), 0x111b1c, [0, 2.3, 4.212]);
  m.box([0.026, 0.11, 0.12], [-0.187, 2.3, 4.07], 0x182320);
  m.box([0.026, 0.11, 0.12], [0.187, 2.3, 4.07], 0x182320);
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
  // Rounded canvas roof, tied folds, mirrors and running boards keep a proper
  // military cargo-truck profile. Headlight centers stay fixed for lighting.
  for (const side of [-1, 1]) {
    m.box([0.27, 0.1, 1.9], [side * 1.06, 1.05, 0.78], 0x505945);
    m.box([0.04, 0.65, 0.035], [side * 1.06, 1.91, 0.29], 0x48553e);
    m.box([0.035, 0.055, 0.2], [side * 1.075, 1.86, 0.71], 0x989c7d);
    m.rod([side * 1.01, 2.18, 1.42], [side * 1.23, 2.33, 1.42], 0.025, METAL);
    m.softBox([0.11, 0.28, 0.19], [side * 1.25, 2.36, 1.42], 0x89928b, 0.025);
    m.box([0.015, 0.2, 0.12], [side * 1.312, 2.36, 1.42], 0x536d74);
    m.softBox([0.2, 0.45, 0.52], [side * 0.95, 1.03, -0.2], 0x4d5942, 0.035);
    for (const z of [-2.32, -1.82, -1.32, -0.82, -0.32]) {
      m.rod(
        [side * 1.044, 2.62, z],
        [side * 1.06, 1.47, z + 0.12],
        0.025,
        0x686d4e,
      );
      m.box([0.035, 0.075, 0.065], [side * 1.065, 1.42, z + 0.1], 0xc2b68b);
    }
    m.rod([side * 0.92, 0.87, -2.2], [side * 0.92, 0.6, -2.2], 0.035, METAL);
    m.box([0.35, 0.43, 0.06], [side * 0.92, 0.56, -2.17], 0x343d31);
    m.box([0.12, 0.1, 0.07], [side * 0.87, 1.29, -2.62], 0x925b42);
  }
  m.box([2.08, 0.55, 0.08], [0, 1.58, -2.6], 0x66714b);
  for (const x of [-0.68, 0, 0.68])
    m.box([0.06, 0.51, 0.1], [x, 1.58, -2.61], 0x929574);
  m.box([1.3, 0.16, 0.08], [0, 0.94, -2.64], METAL);
  m.box([0.52, 0.13, 0.035], [0, 1.1, 2.744], 0xb7b29a);
  for (const x of [-0.42, 0.42])
    m.rod([x, 1.9, 1.623], [x + 0.15, 2.3, 1.623], 0.015, 0x262f29);
  m.box([1.88, 0.065, 1.37], [0, 2.66, 0.9], 0x79805b);
  m.cylinder(0.12, 0.43, [0.83, 1.94, 2.27], 0x29372a);
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
  m.box([1.64, 0.13, 0.17], [0, 2.08, 0.23], 0x78815a, [-0.12, 0, 0]);
  m.box([0.28, 0.21, 0.035], [0.45, 1.82, 0.368], 0x26382e, [-0.12, 0, 0]);
  for (const side of [-1, 1]) {
    m.rod(
      [side * 0.75, 0.67, -0.08],
      [side * 0.45, 1.51, -0.2],
      0.065,
      0x6f7952,
    );
    m.box([0.085, 0.09, 0.035], [side * 0.74, 1.48, 0.397], 0x9b9f7a);
    m.box([0.085, 0.09, 0.035], [side * 0.74, 1.85, 0.352], 0x9b9f7a);
    m.rod(
      [side * 0.77, 0.23, -1.58],
      [side * 1.0, 0.23, -2.44],
      0.04,
      0x929878,
    );
  }
  m.cylinder(
    0.19,
    0.16,
    [-0.48, 1.19, -0.28],
    0x87906b,
    [0, 0, Math.PI / 2],
    10,
  );
  m.add(
    new THREE.TorusGeometry(0.24, 0.028, 5, 12),
    0xa7aa83,
    [-0.59, 1.19, -0.28],
    [0, Math.PI / 2, 0],
  );
  m.rod([-0.6, 0.99, -0.28], [-0.6, 1.39, -0.28], 0.022, METAL);
  m.rod([-0.6, 1.19, -0.48], [-0.6, 1.19, -0.08], 0.022, METAL);
  m.box([0.27, 0.1, 0.37], [0, 1.62, -0.62], 0x3f4e3a);
  m.box([0.25, 0.08, 0.14], [0, 1.7, -0.7], 0x262f2a);
  m.rod([-0.2, 1.59, -0.7], [-0.36, 1.82, -0.7], 0.04, METAL);
  m.cylinder(0.12, 0.28, [-0.36, 1.84, -0.6], 0x313c32, [Math.PI / 2, 0, 0]);
  return m.build();
}
function artilleryBarrel() {
  const m = new ModelBuilder();
  m.cylinder(0.18, 3.3, [0, 1.68, 1.16], METAL, [Math.PI / 2 - 0.15, 0, 0], 10);
  m.cylinder(0.27, 0.34, [0, 1.93, 2.79], METAL, [Math.PI / 2 - 0.15, 0, 0]);
  m.cylinder(
    0.24,
    1.28,
    [0, 1.65, 0.23],
    0x69744d,
    [Math.PI / 2 - 0.15, 0, 0],
    10,
  );
  for (const x of [-0.21, 0.21])
    m.cylinder(0.08, 1.17, [x, 1.5, 0.4], 0x7b8463, [Math.PI / 2 - 0.15, 0, 0]);
  m.softBox([0.48, 0.32, 0.4], [0, 1.49, -0.47], 0x424d39, 0.06);
  m.cylinder(0.24, 0.09, [0, 1.93, 2.81], 0x27322b, [Math.PI / 2 - 0.15, 0, 0]);
  m.add(
    new THREE.CircleGeometry(0.15, 10),
    0x141f20,
    [0, 1.956, 2.961],
    [-0.15, 0, 0],
  );
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
  for (let z = -2.02; z < 1.9; z += 0.38) {
    m.box([0.75, 0.07, 0.13], [0, 0, z], 0x686a4e);
    m.box([0.18, 0.06, 0.14], [0, 0.055, z], 0x85876c);
  }
  return m.build();
}
function supplyCrate() {
  const m = new ModelBuilder([0.9, 0]);
  m.softBox([0.8, 0.56, 0.65], [0, 0, 0], 0xa88b59, 0.045);
  for (const x of [-0.28, 0.28]) m.box([0.07, 0.6, 0.7], [x, 0, 0], LEATHER);
  m.box([0.27, 0.1, 0.02], [0, 0.03, 0.34], 0xe2d9ae);
  return m.build();
}
function flagPole() {
  const m = new ModelBuilder(STEEL);
  m.cylinder(0.045, 4.7, [0, 2.35, 0], 0xb5ac89, [0, 0, 0], 6);
  m.sphere(0.1, [0, 4.75, 0], 0xd5b96b);
  return m.build();
}

/** Stable batch order: runtime animation addresses these thirteen articulated
 * parts by index. Every caller owns/disposes its returned geometries. */
export function createLandModelGeometries(): THREE.BufferGeometry[] {
  const parts = [
    ["infantry-body", infantryBody],
    ["infantry-legs", infantryLeg],
    ["tank-hull", tankModel],
    ["truck-body", truckModel],
    ["artillery-base", artilleryModel],
    ["infantry-details", infantryDetails],
    ["tank-turret", tankTurret],
    ["tank-barrel", tankBarrel],
    ["artillery-barrel", artilleryBarrel],
    ["vehicle-wheels", roadWheel],
    ["tank-treads", tankTreads],
    ["support-crates", supplyCrate],
    ["capture-poles", flagPole],
  ] as const;
  return parts.map(([name, build]) => {
    const geometry = build();
    geometry.name = name;
    return geometry;
  });
}
