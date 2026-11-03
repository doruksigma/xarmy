import * as THREE from "three";

/** Original merged WWII miniatures; all articulated anchors use model-local units. */
export type XYZ = readonly [number, number, number];
/** Elliptical cross section: height, half width/depth and optional center offset. */
export type LoftRing = readonly [number, number, number, number?, number?];
export type LimbRing = readonly [number, number, number, number, number];
export type LandModelTier = 0 | 1 | 2 | 3;
export const INFANTRY_NECK_PIVOT = [0, 3.32, 0] as const;
export const CLOTH = 0x666d49,
  CLOTH_LIGHT = 0x7c8056,
  HELMET = 0x485340,
  LEATHER = 0x58442f,
  METAL = 0x3d4440,
  SKIN = 0xbe9872,
  BOOT = 0x39352c,
  ARMOR = 0x626b48,
  TRACK = 0x353933,
  WOOD = 0x725039;

export type Surface = readonly [roughness: number, metalness: number];
export const FABRIC: Surface = [0.94, 0];
export const PAINTED_STEEL: Surface = [0.66, 0.24];
export const STEEL: Surface = [0.39, 0.72];
export const GLASS: Surface = [0.18, 0.15];
export const RUBBER: Surface = [0.94, 0.015];
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
  0x9f9b76,
  0x9c9871,
]);
function surfaceFor(color: number, fallback: Surface): Surface {
  if (clothColors.has(color)) return FABRIC;
  if (glassColors.has(color)) return GLASS;
  if (bareSteelColors.has(color)) return STEEL;
  if ([SKIN, 0x9d7959, 0xa7805c, 0x8b644f, 0x574935, 0x34352b].includes(color))
    return [0.82, 0];
  if (
    color === LEATHER ||
    color === WOOD ||
    color === 0x6a5136 ||
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
  if ([HELMET, ARMOR, 0x596247, 0x536153, 0x48553d].includes(color))
    return PAINTED_STEEL;
  return fallback;
}

/** Static colored pieces are merged once, keeping each model to one draw batch. */
export class ModelBuilder {
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
  ellipsoid(size: XYZ, position: XYZ, color: number, segments = 12) {
    return this.add(
      new THREE.SphereGeometry(
        1,
        segments,
        Math.max(3, Math.ceil(segments / 2)),
      ),
      color,
      position,
      [0, 0, 0],
      size,
    );
  }
  /** Smooth shared normals across elliptical rings, with separate flat end caps. */
  loft(rings: readonly LoftRing[], color: number, segments = 12) {
    const centers = rings.map(
      ([y, rx, rz, x = 0, z = 0]) => [x, y, z, rx, rz] as const,
    );
    return this.sweep(centers, color, segments, false);
  }
  /** Curved cloth sleeves/trousers follow their anatomical centerline. */
  limb(rings: readonly LimbRing[], color: number, segments = 10) {
    return this.sweep(rings, color, segments, true);
  }
  private sweep(
    rings: readonly LimbRing[],
    color: number,
    segments: number,
    follow: boolean,
  ) {
    const vertices: number[] = [],
      indices: number[] = [];
    const centers = rings.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const tangent = new THREE.Vector3(),
      across = new THREE.Vector3(),
      depth = new THREE.Vector3();
    for (let row = 0; row < rings.length; row++) {
      const center = centers[row],
        [, , , rx, rz] = rings[row];
      if (follow) {
        tangent
          .copy(centers[Math.min(row + 1, rings.length - 1)])
          .sub(centers[Math.max(row - 1, 0)])
          .normalize();
        across.crossVectors(tangent, new THREE.Vector3(0, 0, 1));
        if (across.lengthSq() < 0.01)
          across.crossVectors(tangent, new THREE.Vector3(1, 0, 0));
        across.normalize();
        depth.crossVectors(across, tangent).normalize();
      } else {
        across.set(1, 0, 0);
        depth.set(0, 0, 1);
      }
      for (let column = 0; column < segments; column++) {
        const angle = (column / segments) * Math.PI * 2;
        const v = center
          .clone()
          .addScaledVector(across, Math.cos(angle) * rx)
          .addScaledVector(depth, Math.sin(angle) * rz);
        vertices.push(v.x, v.y, v.z);
        if (row > 0) {
          const a = (row - 1) * segments + column,
            b = (row - 1) * segments + ((column + 1) % segments);
          const c = row * segments + column,
            d = row * segments + ((column + 1) % segments);
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    // Duplicate cap vertices so the garment sides retain uninterrupted shading.
    for (const row of [0, rings.length - 1]) {
      const start = vertices.length / 3;
      vertices.push(...centers[row].toArray());
      for (let column = 0; column < segments; column++) {
        const offset = (row * segments + column) * 3;
        vertices.push(...vertices.slice(offset, offset + 3));
      }
      for (let column = 0; column < segments; column++) {
        const a = start + 1 + column,
          b = start + 1 + ((column + 1) % segments);
        if (row === 0) indices.push(start, a, b);
        else indices.push(start, b, a);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return this.add(geometry, color);
  }
  /** A flat leather/canvas ribbon draped over a curved garment. */
  ribbon(
    points: readonly XYZ[],
    width: number,
    color: number,
    across: XYZ = [1, 0, 0],
  ) {
    const vertices: number[] = [],
      indices: number[] = [];
    const half = new THREE.Vector3(...across)
      .normalize()
      .multiplyScalar(width / 2);
    points.forEach((p, index) => {
      const center = new THREE.Vector3(...p);
      vertices.push(
        ...center.clone().sub(half).toArray(),
        ...center.add(half).toArray(),
      );
      if (index > 0) {
        const a = (index - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        indices.push(a + 1, a + 2, a, a + 3, a + 2, a + 1);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    // Separate the two ribbon sides before computing normals; shared opposite
    // winding would cancel the normals and turn straps black under lighting.
    const sided = geometry.toNonIndexed();
    geometry.dispose();
    sided.computeVertexNormals();
    return this.add(sided, color);
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
