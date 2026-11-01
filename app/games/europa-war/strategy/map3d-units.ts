import * as THREE from "three";
import type { Army } from "./types";
import type { GraphicsQuality } from "./map3d-visuals";

/** Original procedural miniatures. Presentation scale is independent of troop strength. */
export const UNIT_MODEL_SCALE = 2.45;
export const UNIT_LABEL_HEIGHT = 13;
export const MAX_UNIT_MINIATURES = 3072;
export interface UnitFormation {
  armies: readonly Army[];
  position: THREE.Vector3;
  angle: number;
  moving: boolean;
  tint: number;
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
  for (const x of [-1.52, 1.52]) {
    m.softBox([0.72, 1.17, 4.66], [x, 0.68, 0], TRACK, 0.23);
    for (const z of [-1.72, -0.86, 0, 0.86, 1.72]) {
      m.cylinder(
        0.42,
        0.1,
        [x + Math.sign(x) * 0.38, 0.66, z],
        ARMOR,
        [0, 0, Math.PI / 2],
        10,
      );
      m.cylinder(0.14, 0.12, [x + Math.sign(x) * 0.43, 0.66, z], METAL, [
        0,
        0,
        Math.PI / 2,
      ]);
    }
    for (let z = -2.03; z <= 2.1; z += 0.38)
      m.box([0.75, 0.07, 0.13], [x, 1.27, z], 0x464b3b);
  }
  m.softBox([2.85, 0.91, 4.35], [0, 1.31, -0.1], ARMOR, 0.2);
  m.box([2.52, 0.53, 1.04], [0, 1.67, 1.51], ARMOR, [-0.38, 0, 0]);
  m.box([2.5, 0.24, 1.2], [0, 1.8, -1.46], 0x555e3f);
  for (let x = -0.9; x <= 0.91; x += 0.3)
    m.box([0.1, 0.035, 0.83], [x, 1.95, -1.47], METAL);
  m.add(
    new THREE.CylinderGeometry(0.98, 1.18, 0.77, 10),
    ARMOR,
    [0, 2.13, 0.12],
  );
  m.cylinder(0.41, 0.14, [-0.28, 2.59, -0.04], 0x78805b, [0, 0, 0], 10);
  m.box([0.78, 0.45, 0.43], [0, 2.22, 1.1], 0x515b3c);
  m.cylinder(0.13, 3.12, [0, 2.3, 2.55], METAL, [Math.PI / 2, 0, 0], 10);
  m.cylinder(0.19, 0.28, [0, 2.3, 4.07], METAL, [Math.PI / 2, 0, 0]);
  m.rod([0.65, 2.45, -0.4], [0.7, 3.55, -0.45], 0.022, METAL);
  for (const x of [-1.08, 1.08]) m.sphere(0.12, [x, 1.67, 2.21], 0xd0c29c);
  return m.build();
}
function truckModel() {
  const m = new ModelBuilder();
  m.box([2.12, 0.38, 4.82], [0, 0.93, -0.1], METAL);
  for (const x of [-1.1, 1.1])
    for (const z of [-1.65, -0.7, 1.55]) {
      m.cylinder(0.55, 0.38, [x, 0.57, z], 0x30352d, [0, 0, Math.PI / 2], 10);
      m.cylinder(0.22, 0.4, [x, 0.57, z], ARMOR, [0, 0, Math.PI / 2]);
    }
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
    m.cylinder(0.67, 0.3, [x, 0.7, 0], TRACK, [0, 0, Math.PI / 2], 12);
    m.cylinder(0.49, 0.32, [x, 0.7, 0], ARMOR, [0, 0, Math.PI / 2], 10);
    m.cylinder(0.15, 0.35, [x, 0.7, 0], METAL, [0, 0, Math.PI / 2]);
    m.rod([x * 0.45, 0.75, -0.1], [x, 0.19, -2.55], 0.12, ARMOR);
    m.box([0.4, 0.2, 0.44], [x, 0.13, -2.55], METAL);
  }
  m.cylinder(0.12, 2.2, [0, 0.69, 0], METAL, [0, 0, Math.PI / 2]);
  m.box([1.78, 1.29, 0.14], [0, 1.49, 0.3], ARMOR, [-0.12, 0, 0]);
  m.cylinder(0.18, 3.3, [0, 1.68, 1.16], METAL, [Math.PI / 2 - 0.15, 0, 0], 10);
  m.cylinder(0.27, 0.34, [0, 1.93, 2.79], METAL, [Math.PI / 2 - 0.15, 0, 0]);
  m.box([0.61, 0.52, 0.9], [0, 1.28, -0.45], 0x50593f);
  return m.build();
}

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
  });
  const geometries = [
    infantryBody(),
    infantryLeg(),
    tankModel(),
    truckModel(),
    artilleryModel(),
    infantryDetails(),
  ];
  const batches = geometries.map((geometry, i) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      MAX_UNIT_MINIATURES * (i === 1 ? 2 : 1),
    );
    mesh.name = [
      "3D piyade üniforması ve tüfek",
      "3D hareketli bacaklar",
      "3D paletli tanklar",
      "3D nakliye kamyonları",
      "3D sahra topları",
      "3D yakın üniforma ayrıntıları",
    ][i];
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Shared instance bounds span the whole campaign; per-formation LOD is handled below.
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
  accents.name = "3D ülke armaları";
  accents.count = 0;
  accents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  accents.frustumCulled = false;
  scene.add(accents);
  const transform = new THREE.Object3D(),
    parent = new THREE.Object3D(),
    color = new THREE.Color();
  const counts = new Uint32Array(batches.length);
  const stats: UnitModelStats = {
    infantry: 0,
    vehicles: 0,
    instances: 0,
    detail: false,
  };
  let disposed = false;
  const put = (
    batch: number,
    x: number,
    y: number,
    z: number,
    swing = 0,
    scale = 1,
  ) => {
    const index = counts[batch]++;
    transform.position.set(x, y, z);
    transform.rotation.set(swing, 0, 0);
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    transform.matrix.premultiply(parent.matrix);
    batches[batch].setMatrixAt(index, transform.matrix);
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
      counts.fill(0);
      accents.count = 0;
      stats.infantry = stats.vehicles = stats.instances = 0;
      stats.detail = options.distance < (options.quality === "low" ? 340 : 720);
      let models = 0;
      for (
        let f = 0;
        f < formations.length && models < MAX_UNIT_MINIATURES;
        f++
      ) {
        const formation = formations[f];
        if (!formation.armies.length) continue;
        const representatives = Math.min(
          formation.armies.length,
          options.distance > 1150
            ? 1
            : options.quality === "low" && options.distance > 500
              ? 2
              : 3,
        );
        const sin = Math.sin(formation.angle),
          cos = Math.cos(formation.angle);
        for (
          let i = 0;
          i < representatives && models < MAX_UNIT_MINIATURES;
          i++, models++
        ) {
          const army =
            formation.armies[
              Math.floor((i * formation.armies.length) / representatives)
            ];
          const infantry =
            army.type === "infantry" ||
            army.type === "special" ||
            army.type === "mountain" ||
            army.type === "paratrooper";
          const spacing = infantry ? 3.1 : 5.7;
          const dx =
            (i - (representatives - 1) / 2) * spacing * UNIT_MODEL_SCALE;
          const dz =
            representatives === 3 && i === 1
              ? -spacing * UNIT_MODEL_SCALE * 0.55
              : 0;
          parent.position.set(
            formation.position.x + dx * cos + dz * sin,
            formation.position.y,
            formation.position.z - dx * sin + dz * cos,
          );
          if (heightAtWorld)
            parent.position.y = heightAtWorld(
              parent.position.x,
              parent.position.z,
            );
          parent.rotation.set(0, formation.angle, 0);
          parent.scale.setScalar(UNIT_MODEL_SCALE);
          parent.updateMatrix();
          if (infantry) {
            const walking =
              formation.moving && !options.paused && !options.reduced;
            const phase = walking
              ? Math.sin(now * 0.0078 + f * 0.6 + i * 1.3)
              : 0;
            put(0, 0, Math.abs(phase) * 0.055, 0);
            put(1, -0.36, 1.67, 0, phase * 0.37);
            put(1, 0.36, 1.67, 0, -phase * 0.37);
            if (stats.detail) put(5, 0, Math.abs(phase) * 0.055, 0);
            transform.position.set(0.93, 2.92 + Math.abs(phase) * 0.055, 0.05);
            transform.scale.set(1, 1, 1);
            stats.infantry++;
          } else {
            const batch =
              army.type === "artillery"
                ? 4
                : army.type === "motorized" || army.type === "mechanized"
                  ? 3
                  : 2;
            const scale =
              army.type === "heavyTank"
                ? 1.17
                : army.type === "lightTank"
                  ? 0.86
                  : 1;
            put(batch, 0, 0, 0, 0, scale);
            transform.position.set(
              batch === 2 ? 1.07 * scale : 1.06,
              batch === 2 ? 2.22 * scale : 1.73,
              batch === 2 ? 0.12 : 0.85,
            );
            transform.scale.set(1.4, 2.1, 2.2);
            stats.vehicles++;
          }
          transform.rotation.set(0, 0, 0);
          transform.updateMatrix();
          transform.matrix.premultiply(parent.matrix);
          accents.setMatrixAt(accents.count, transform.matrix);
          accents.setColorAt(accents.count++, color.setHex(formation.tint));
        }
      }
      for (let i = 0; i < batches.length; i++) {
        batches[i].count = counts[i];
        batches[i].visible = counts[i] > 0;
        batches[i].instanceMatrix.needsUpdate = true;
        stats.instances += counts[i];
      }
      accents.visible = accents.count > 0;
      accents.instanceMatrix.needsUpdate = true;
      if (accents.instanceColor) accents.instanceColor.needsUpdate = true;
      stats.instances += accents.count;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of batches) {
        scene.remove(mesh);
        mesh.dispose();
      }
      scene.remove(accents);
      accents.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      accentGeometry.dispose();
      material.dispose();
      accentMaterial.dispose();
    },
  };
}
