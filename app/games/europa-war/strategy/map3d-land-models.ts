import * as THREE from "three";

/** Original merged WWII miniatures; all articulated anchors use model-local units. */
type XYZ = readonly [number, number, number];
export type LandModelTier = 0 | 1 | 2 | 3;
export const INFANTRY_NECK_PIVOT = [0, 3.32, 0] as const;
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
    const cloth = new Float32Array(count);
    const [roughness, metalness] = surfaceFor(color, this.defaultSurface);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = this.tint.r;
      colors[i * 3 + 1] = this.tint.g;
      colors[i * 3 + 2] = this.tint.b;
      surface[i * 2] = roughness;
      surface[i * 2 + 1] = metalness;
      cloth[i] = clothColors.has(color) ? 1 : 0;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("unitSurface", new THREE.BufferAttribute(surface, 2));
    geometry.setAttribute("unitCloth", new THREE.BufferAttribute(cloth, 1));
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
    for (const name of [
      "position",
      "normal",
      "color",
      "unitSurface",
      "unitCloth",
    ]) {
      const size = name === "unitSurface" ? 2 : name === "unitCloth" ? 1 : 3;
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

function infantryBody(tier: LandModelTier) {
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
  m.softBox(
    [0.76 + tier * 0.07, 0.85 + tier * 0.07, 0.38],
    [0, 2.62, -0.55],
    LEATHER,
  );
  m.cylinder(0.17, 1.04, [0, 3.21, -0.58], CLOTH_LIGHT, [0, 0, Math.PI / 2]);
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
  m.box(
    [0.13, 0.21 + tier * 0.1, 0.2 + tier * 0.08],
    [0.37, 2.68 - tier * 0.05, 0.69],
    METAL,
  );
  if (tier >= 1) m.box([0.18, 0.15, 0.46], [0.37, 2.86, 0.62], METAL);
  if (tier >= 2) {
    m.cylinder(
      0.11,
      0.65,
      [0.37, 2.9, 1.43],
      0x515e4a,
      [Math.PI / 2, 0, 0],
      10,
    );
    for (const z of [1.23, 1.43, 1.63])
      m.box([0.025, 0.055, 0.06], [0.482, 2.9, z], 0x19251f);
    m.softBox([0.46, 0.6, 0.2], [-0.46, 2.69, -0.69], 0x48553d, 0.04);
    m.rod([-0.49, 2.95, -0.69], [-0.49, 3.25, -0.69], 0.017, METAL);
  }
  if (tier === 3) {
    m.cylinder(0.21, 0.2, [0.37, 2.52, 0.72], METAL, [0, 0, Math.PI / 2], 12);
    m.rod([0.28, 2.86, 1.59], [0.2, 2.63, 1.24], 0.025, METAL);
    m.rod([0.46, 2.86, 1.59], [0.54, 2.63, 1.24], 0.025, METAL);
    for (const x of [-0.58, -0.36])
      m.sphere(0.085, [x, 2.18, 0.6], 0x525f45, [0.8, 1.45, 0.8]);
  }
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
  for (const side of [-1, 1]) {
    m.rod(
      [side * 0.44, 2.13, 0.37],
      [side * 0.54, 2.43, 0.35],
      0.021,
      0x596344,
    );
    m.rod(
      [side * 0.48, 2.76, 0.34],
      [side * 0.27, 2.62, 0.38],
      0.018,
      CLOTH_LIGHT,
    );
  }
  if (tier === 0)
    m.profile(
      [
        [-0.58, 0.13],
        [0.58, 0.13],
        [0.63, -0.2],
        [-0.63, -0.2],
      ],
      0.64,
      [0, 1.94, 0],
      CLOTH,
    );
  return m.build();
}
function infantryLeg(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  m.add(new THREE.CapsuleGeometry(0.21, 0.82, 2, 6), CLOTH, [0, -0.56, 0]);
  m.cylinder(0.17, 0.55, [0, -1.16, 0], CLOTH_LIGHT);
  m.softBox([0.46, 0.34, 0.74], [0, -1.48, 0.14], BOOT, 0.06);
  m.box([0.48, 0.08, 0.77], [0, -1.62, 0.14], 0x282b25);
  m.box([0.038, 0.83, 0.018], [0.18, -0.54, 0.11], 0x525b40);
  for (const y of [-1.03, -1.14, -1.25])
    m.box([0.22, 0.025, 0.018], [0, y, 0.176], 0x656e50);
  m.box([0.21, 0.08, 0.035], [0, -1.43, 0.5], 0x554a38);
  for (const y of [-0.37, -0.69, -0.83])
    m.rod([-0.13, y, 0.15], [0.13, y + 0.06, 0.14], 0.018, CLOTH_LIGHT);
  if (tier >= 2)
    m.profile(
      [
        [-0.15, 0.15],
        [0.15, 0.15],
        [0.12, -0.15],
        [-0.12, -0.15],
      ],
      0.04,
      [0, -0.82, 0.2],
      CLOTH,
    );
  return m.build();
}
function infantryDetails(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  for (const y of [2.32, 2.56, 2.8, 3.04])
    m.sphere(0.035, [0, y, 0.38], 0xc3bc8b);
  m.box([0.18, 0.12, 0.025], [0, 1.97, 0.41], 0x9f9b76);
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
  if (tier >= 1)
    for (const side of [-1, 1]) {
      m.box([0.16, 0.13, 0.025], [side * 0.49, 3.06, 0.22], CLOTH_LIGHT);
      m.rod(
        [side * 0.15, 2.32, 0.396],
        [side * 0.45, 2.39, 0.39],
        0.012,
        0x949773,
      );
    }
  return m.build();
}
function tankModel(tier: LandModelTier) {
  const m = new ModelBuilder();
  for (const x of [-1.52, 1.52])
    m.softBox([0.72, 1.17, 4.66], [x, 0.68, 0], TRACK, 0.23);
  m.softBox(
    [2.35 + tier * 0.16, 0.91, 4.05 + tier * 0.1],
    [0, 1.31, -0.1],
    ARMOR,
    tier === 0 ? 0.07 : 0.18,
  );
  m.box(
    [2.1 + tier * 0.14, 0.36 + tier * 0.055, 1.04],
    [0, 1.67, 1.51],
    ARMOR,
    [-0.12 - tier * 0.1, 0, 0],
  );
  if (tier === 0)
    for (const side of [-1, 1])
      for (const z of [-1.55, -1.15, -0.75, -0.35, 0.05, 0.45, 0.85, 1.25])
        m.box([0.035, 0.065, 0.065], [side * 1.185, 1.54, z], 0x92967a);
  if (tier >= 2) {
    for (const side of [-1, 1])
      m.box([0.15, 0.58, 3.2], [side * 1.51, 1.39, -0.17], 0x5b6547);
    m.softBox([1.43, 0.17, 0.8], [0, 1.94, 0.67], 0x74805a, 0.04);
  }
  if (tier === 3)
    for (const side of [-1, 1]) {
      m.box([0.1, 0.75, 3.86], [side * 1.82, 0.92, -0.03], ARMOR);
      for (const z of [-1.45, -0.72, 0, 0.72, 1.45])
        m.box([0.025, 0.72, 0.035], [side * 1.878, 0.93, z], 0x89916e);
    }
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
function tankTurret(tier: LandModelTier) {
  const m = new ModelBuilder();
  if (tier < 2)
    m.add(
      new THREE.CylinderGeometry(
        0.65 + tier * 0.22,
        0.78 + tier * 0.27,
        0.77,
        tier === 0 ? 8 : 12,
      ),
      ARMOR,
      [0, 2.13, 0.12],
    );
  else {
    m.profile(
      [
        [-1.06, -0.36],
        [1.06, -0.36],
        [0.89, 0.34],
        [-0.89, 0.34],
      ],
      1.8,
      [0, 2.13, 0.12],
      ARMOR,
    );
    if (tier === 3)
      m.box([1.77, 0.35, 0.29], [0, 2.2, 1.05], 0x78805b, [-0.17, 0, 0]);
  }
  m.cylinder(0.41, 0.14, [-0.28, 2.59, -0.04], 0x78805b, [0, 0, 0], 10);
  m.box([0.78, 0.45, 0.43], [0, 2.22, 1.1], 0x515b3c);
  m.rod([0.65, 2.45, -0.4], [0.7, 3.55, -0.45], 0.022, METAL);
  m.cylinder(0.48, 0.2, [-0.28, 2.63, -0.04], ARMOR, [0, 0, 0], 10);
  m.cylinder(0.39, 0.055, [-0.28, 2.757, -0.04], 0x7c8363, [0, 0, 0], 10);
  m.rod([-0.42, 2.8, -0.06], [-0.14, 2.8, -0.06], 0.025, METAL);
  const sideMount = tier === 0 ? 0.67 : tier === 1 ? 0.85 : 0.99;
  for (const side of [-1, 1]) {
    m.box([0.065, 0.13, 0.43], [side * sideMount, 2.28, 0.07], 0x414d3b);
    m.box(
      [0.03, 0.06, 0.28],
      [side * (sideMount + 0.035), 2.3, 0.07],
      0x1f2c2b,
    );
    m.rod(
      [side * (sideMount - 0.06), 2.46, -0.42],
      [side * (sideMount - 0.06), 2.46, -0.03],
      0.025,
      0x9b9b78,
    );
    m.box([0.07, 0.16, 0.2], [side * 0.46, 2.25, 1.27], 0x8c9271);
  }
  const rearMount = tier === 0 ? -0.72 : tier === 1 ? -0.96 : -1.03;
  m.softBox([0.73, 0.35, 0.23], [0.12, 2.22, rearMount], 0x716f50, 0.04);
  m.box([0.68, 0.035, 0.05], [0.12, 2.43, rearMount - 0.03], METAL);
  m.box([0.19, 0.08, 0.29], [0.4, 2.57, 0.23], 0x3d4b3a);
  m.box([0.14, 0.035, 0.16], [0.4, 2.63, 0.23], 0x202b2b);
  return m.build();
}
function tankBarrel(tier: LandModelTier) {
  const m = new ModelBuilder();
  m.cylinder(
    0.085 + tier * 0.027,
    3.12,
    [0, 2.3, 2.55],
    METAL,
    [Math.PI / 2, 0, 0],
    10,
  );
  m.cylinder(0.19, 0.28, [0, 2.3, 4.07], METAL, [Math.PI / 2, 0, 0]);
  m.cylinder(0.23, 0.82, [0, 2.3, 1.44], 0x69714e, [Math.PI / 2, 0, 0], 10);
  m.cylinder(0.155, 0.12, [0, 2.3, 2.12], 0x747b62, [Math.PI / 2, 0, 0], 10);
  m.add(new THREE.CircleGeometry(0.115, 10), 0x111b1c, [0, 2.3, 4.212]);
  m.box([0.026, 0.11, 0.12], [-0.187, 2.3, 4.07], 0x182320);
  m.box([0.026, 0.11, 0.12], [0.187, 2.3, 4.07], 0x182320);
  if (tier >= 2) m.box([0.44, 0.29, 0.27], [0, 2.3, 4.04], 0x566245);
  if (tier === 3) {
    m.box([0.035, 0.13, 0.17], [-0.223, 2.3, 4.04], 0x182320);
    m.box([0.035, 0.13, 0.17], [0.223, 2.3, 4.04], 0x182320);
  }
  return m.build();
}
function truckModel(tier: LandModelTier) {
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
  if (tier === 0) {
    for (const side of [-1, 1]) {
      m.box([0.08, 0.63, 2.65], [side * 1.04, 1.65, -1.23], WOOD);
      for (const z of [-2.36, -1.3, -0.25])
        m.box([0.09, 0.83, 0.09], [side * 1.04, 1.69, z], METAL);
    }
    for (const z of [-1.94, -0.7])
      m.softBox([1.42, 0.53, 0.85], [0, 1.65, z], 0x9a8058, 0.04);
  } else if (tier < 3) {
    m.softBox([2.08, 1.6, 2.65], [0, 1.97, -1.23], 0x8a8966, 0.21);
    if (tier === 2) {
      m.cylinder(
        0.19,
        1.8,
        [0, 2.74, -2.16],
        CLOTH_LIGHT,
        [0, 0, Math.PI / 2],
        10,
      );
      m.softBox([0.46, 0.48, 0.25], [-0.7, 1.7, -2.56], ARMOR, 0.035);
    }
  } else {
    for (const side of [-1, 1]) {
      m.box([0.15, 1.18, 2.59], [side * 1.0, 1.87, -1.23], ARMOR, [
        0,
        0,
        side * -0.13,
      ]);
      m.softBox([0.48, 1.04, 2.34], [side * 1.06, 0.62, -1.22], TRACK, 0.15);
      for (const z of [-2.19, -1.86, -1.53, -1.2, -0.87, -0.54, -0.21])
        m.box([0.5, 0.07, 0.13], [side * 1.06, 1.17, z], 0x69714f);
    }
    m.box([1.82, 0.92, 0.14], [0, 1.85, -2.48], ARMOR);
    m.box([1.82, 0.33, 0.16], [0, 2.39, -0.03], ARMOR);
  }
  m.box([2.15, 0.4, 2.7], [0, 1.24, -1.23], LEATHER);
  if (tier === 1 || tier === 2)
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
    if (tier === 1 || tier === 2)
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
function artilleryModel(tier: LandModelTier) {
  const m = new ModelBuilder();
  for (const x of [-1.03, 1.03]) {
    m.rod([x * 0.45, 0.75, -0.1], [x, 0.19, -2.55], 0.12, ARMOR);
    m.box([0.4, 0.2, 0.44], [x, 0.13, -2.55], METAL);
  }
  m.cylinder(0.12, 2.2, [0, 0.69, 0], METAL, [0, 0, Math.PI / 2]);
  if (tier === 0)
    m.box([1.26, 0.81, 0.14], [0, 1.45, 0.3], ARMOR, [-0.12, 0, 0]);
  else
    m.profile(
      [
        [-0.86, -0.6],
        [0.86, -0.6],
        [0.86, 0.3],
        [0.56, 0.6],
        [-0.56, 0.6],
        [-0.86, 0.3],
      ],
      0.14,
      [0, 1.49, 0.3],
      ARMOR,
    );
  if (tier >= 2)
    for (const side of [-1, 1])
      m.box([0.35, 0.85, 0.12], [side * 0.97, 1.27, 0.26], ARMOR, [
        0,
        side * 0.2,
        0,
      ]);
  if (tier === 3) m.box([1.55, 0.3, 0.16], [0, 0.76, 0.32], 0x79815e);
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
function artilleryBarrel(tier: LandModelTier) {
  const m = new ModelBuilder();
  m.cylinder(
    0.105 + tier * 0.03,
    3.3,
    [0, 1.68, 1.16],
    METAL,
    [Math.PI / 2 - 0.15, 0, 0],
    10,
  );
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
  if (tier >= 2)
    m.softBox([0.55, 0.39, 0.48], [0, 1.51, -0.45], 0x4e5c3f, 0.045);
  if (tier === 3)
    m.cylinder(0.11, 1.42, [0, 1.39, 0.41], 0x8a936c, [
      Math.PI / 2 - 0.15,
      0,
      0,
    ]);
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

/** Head geometry is local to the anatomical neck pivot, independent of the
 * jacket/rifle recoil batch. It may yaw without dragging the rifle or hands. */
function infantryHead(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  m.cylinder(0.18, 0.28, [0, 0, 0], SKIN, [0, 0, 0], 10);
  m.add(
    new THREE.SphereGeometry(0.43, 12, 9),
    SKIN,
    [0, 0.41, 0.035],
    [0, 0, 0],
    [0.88, 1.06, 0.88],
  );
  m.profile(
    [
      [-0.22, 0.1],
      [0.22, 0.1],
      [0.17, -0.13],
      [-0.17, -0.13],
    ],
    0.14,
    [0, 0.16, 0.24],
    SKIN,
  );
  m.sphere(0.085, [0, 0.38, 0.414], SKIN, [0.76, 1.18, 1.44]);
  for (const side of [-1, 1])
    m.sphere(0.083, [side * 0.374, 0.36, 0.015], SKIN, [0.52, 1.08, 0.72]);
  if (tier === 0) {
    m.cylinder(0.455, 0.23, [0, 0.77, -0.015], CLOTH, [0, 0, 0], 12);
    m.add(
      new THREE.CylinderGeometry(0.47, 0.5, 0.065, 12),
      CLOTH_LIGHT,
      [0, 0.66, 0.05],
    );
    m.softBox([0.53, 0.045, 0.38], [0, 0.67, 0.3], BOOT, 0.02);
  } else {
    const radius = tier === 1 ? 0.51 : tier === 3 ? 0.52 : 0.5;
    m.add(
      new THREE.SphereGeometry(radius, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      tier === 3 ? CLOTH : HELMET,
      [0, 0.62, 0],
    );
    m.cylinder(
      tier === 1 ? 0.58 : tier === 3 ? 0.56 : 0.55,
      0.075,
      [0, 0.62, 0],
      tier === 3 ? CLOTH_LIGHT : HELMET,
      [0, 0, 0],
      12,
    );
    if (tier >= 2)
      for (const side of [-1, 1])
        m.box(
          [0.07, 0.19, 0.43],
          [side * 0.43, 0.56, -0.09],
          tier === 3 ? CLOTH : HELMET,
          [0, 0, side * 0.13],
        );
  }
  return m.build();
}
function infantryHeadDetails(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  for (const side of [-1, 1]) {
    m.box([0.104, 0.025, 0.033], [side * 0.15, 0.48, 0.387], 0x574935, [
      0,
      0,
      side * -0.08,
    ]);
    m.box([0.045, 0.034, 0.025], [side * 0.15, 0.445, 0.41], 0x272b23);
    m.box([0.074, 0.017, 0.018], [side * 0.15, 0.419, 0.403], 0x9d7959);
    if (tier >= 1)
      m.rod(
        [side * 0.35, 0.62, 0.02],
        [side * 0.31, 0.16, 0.14],
        0.027,
        LEATHER,
      );
  }
  m.rod([-0.095, 0.2, 0.377], [0.095, 0.2, 0.377], 0.015, 0x8b644f);
  if (tier >= 1) m.rod([-0.31, 0.16, 0.14], [0.31, 0.16, 0.14], 0.025, LEATHER);
  if (tier === 3)
    for (const side of [-1, 1]) {
      m.rod(
        [side * 0.31, 0.7, 0.38],
        [side * 0.24, 1.02, 0.12],
        0.018,
        CLOTH_LIGHT,
      );
      m.rod(
        [side * 0.24, 1.02, 0.12],
        [side * 0.24, 0.84, -0.36],
        0.018,
        CLOTH_LIGHT,
      );
    }
  return m.build();
}

/** The first thirteen slots retain their historical animation indices. Head
 * parts append slots13/14; every caller owns all returned geometry buffers. */
export function createLandModelGeometries(
  tier: LandModelTier = 0,
): THREE.BufferGeometry[] {
  const parts = [
    ["infantry-body", () => infantryBody(tier)],
    ["infantry-legs", () => infantryLeg(tier)],
    ["tank-hull", () => tankModel(tier)],
    ["truck-body", () => truckModel(tier)],
    ["artillery-base", () => artilleryModel(tier)],
    ["infantry-details", () => infantryDetails(tier)],
    ["tank-turret", () => tankTurret(tier)],
    ["tank-barrel", () => tankBarrel(tier)],
    ["artillery-barrel", () => artilleryBarrel(tier)],
    ["vehicle-wheels", roadWheel],
    ["tank-treads", tankTreads],
    ["support-crates", supplyCrate],
    ["capture-poles", flagPole],
    ["infantry-head", () => infantryHead(tier)],
    ["infantry-head-details", () => infantryHeadDetails(tier)],
  ] as const;
  return parts.map(([name, build]) => {
    const geometry = build();
    geometry.name = name;
    return geometry;
  });
}
