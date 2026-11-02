import * as THREE from "three";
import type { AirNavalModel } from "./map3d-airnaval-state";

type XYZ = readonly [number, number, number];
/** Original colored geometry, merged once per silhouette rather than dozens of draw calls per vehicle. */
class Builder {
  pieces: THREE.BufferGeometry[] = [];
  add(
    source: THREE.BufferGeometry,
    color: number,
    position: XYZ = [0, 0, 0],
    scale: XYZ = [1, 1, 1],
    rotation: XYZ = [0, 0, 0],
  ) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    const tint = new THREE.Color(color),
      colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = tint.r;
      colors[index + 1] = tint.g;
      colors[index + 2] = tint.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.pieces.push(geometry);
  }
  box(size: XYZ, position: XYZ, color: number) {
    this.add(new THREE.BoxGeometry(...size), color, position);
  }
  ellipsoid(size: XYZ, position: XYZ, color: number) {
    this.add(new THREE.SphereGeometry(1, 12, 8), color, position, size);
  }
  cylinder(
    radius: number,
    length: number,
    position: XYZ,
    color: number,
    rotation: XYZ = [0, 0, 0],
  ) {
    this.add(
      new THREE.CylinderGeometry(radius, radius, length, 10),
      color,
      position,
      [1, 1, 1],
      rotation,
    );
  }
  outline(
    points: [number, number][],
    thickness: number,
    y: number,
    color: number,
  ) {
    const shape = new THREE.Shape();
    points.forEach(([x, z], index) =>
      index ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
    );
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    this.add(geometry, color, [0, y - thickness / 2, 0]);
  }
  build() {
    const count = this.pieces.reduce(
      (sum, piece) => sum + piece.getAttribute("position").count,
      0,
    );
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "color"]) {
      const data = new Float32Array(count * 3);
      let offset = 0;
      for (const piece of this.pieces) {
        const values = piece.getAttribute(name).array;
        data.set(values, offset);
        offset += values.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(data, 3));
    }
    this.pieces.forEach((piece) => piece.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function aircraft(bomber: boolean) {
  const m = new Builder(),
    olive = 0x929b79,
    dark = 0x424a43,
    alloy = 0xc0c5b5,
    glass = 0x547785;
  const length = bomber ? 10.5 : 7.7,
    span = bomber ? 14 : 9.5;
  m.ellipsoid([bomber ? 1.6 : 1.2, 1.05, length], [0, 0, 0], olive);
  m.outline(
    [
      [-span, 0.6],
      [-2, -2.1],
      [2, -2.1],
      [span, 0.6],
      [span - 1, 3],
      [-span + 1, 3],
    ],
    0.36,
    -0.1,
    olive,
  );
  m.outline(
    [
      [-4.5, length - 2],
      [0, length - 4],
      [4.5, length - 2],
      [4.1, length],
      [-4.1, length],
    ],
    0.28,
    0.35,
    alloy,
  );
  m.ellipsoid([0.88, 0.8, bomber ? 2.3 : 1.7], [0, 0.95, -2], glass);
  for (const z of [-3, -1.8, -0.7])
    m.box([1.55, 0.13, 0.12], [0, 1.7, z], dark);
  m.box([0.28, 3.1, 2.8], [0, 1.7, length - 1.8], dark);
  const engines = bomber ? [-8, -4.8, 4.8, 8] : [0];
  for (const x of engines) {
    const z = bomber ? -2.2 : -length + 0.5;
    m.ellipsoid([0.7, 0.7, 2], [x, -0.15, z], dark);
    m.cylinder(0.24, 0.55, [x, -0.15, z - 2], alloy, [Math.PI / 2, 0, 0]);
    m.box([3.3, 0.16, 0.15], [x, -0.15, z - 2.3], 0x353934);
    m.box([0.16, 3.3, 0.15], [x, -0.15, z - 2.3], 0x353934);
  }
  for (const x of [-span * 0.7, span * 0.7]) {
    m.box([1.8, 0.045, 2.4], [x, 0.13, 1.3], alloy);
    m.cylinder(0.11, 2.2, [x * 0.6, -0.05, -2], dark, [Math.PI / 2, 0, 0]);
  }
  if (bomber) {
    m.ellipsoid([1.1, 0.7, 1.7], [0, 0.3, -length + 0.7], glass);
    m.ellipsoid([0.9, 0.6, 0.9], [0, 1.1, 2.8], dark);
    m.cylinder(0.12, 3, [0, 1.2, 4.6], dark, [Math.PI / 2, 0, 0]);
  }
  return m.build();
}
function vessel(model: "ship" | "carrier" | "submarine") {
  const m = new Builder(),
    steel = 0x7e8990,
    dark = 0x38444a,
    deck = 0xb0a182;
  const carrier = model === "carrier",
    submarine = model === "submarine";
  const length = carrier ? 25 : submarine ? 15 : 19,
    beam = carrier ? 5.6 : submarine ? 2.1 : 3.5;
  m.outline(
    [
      [0, -length],
      [-beam, -length * 0.6],
      [-beam, length * 0.7],
      [-beam * 0.5, length],
      [beam * 0.5, length],
      [beam, length * 0.7],
      [beam, -length * 0.6],
    ],
    submarine ? 1.8 : 2.7,
    0.7,
    dark,
  );
  if (submarine) {
    m.ellipsoid([beam, 1.1, length * 0.9], [0, 1, 0], steel);
    m.box([1.7, 2.2, 4.6], [0, 2.4, -1.2], dark);
    m.cylinder(0.18, 3, [0, 4.7, -1.5], steel);
    m.box([4.8, 0.22, 1.1], [0, 0.4, length - 3], dark);
    m.cylinder(0.22, 3.4, [0, 2.1, -6], steel, [Math.PI / 2, 0, 0]);
  } else if (carrier) {
    m.box([11.8, 0.9, 45], [0, 2.8, 0], deck);
    m.box([0.32, 0.08, 40], [-1, 3.3, 0], 0xf3edd7);
    for (const z of [-18, -13, -8, -3, 2, 7, 12, 17])
      m.box([2.5, 0.09, 0.25], [2.5, 3.3, z], 0xeae1c7);
    m.box([2.8, 4.1, 9], [4.2, 4.6, 2], steel);
    m.box([3.2, 1, 4], [4, 7.2, -0.7], dark);
    m.cylinder(0.2, 5.5, [4.2, 9.8, 2], steel);
    for (const z of [-12, 0, 11]) {
      m.box([0.6, 0.5, 3.4], [-3.2, 3.6, z], steel);
      m.box([3.2, 0.2, 0.8], [-3.2, 3.7, z], steel);
    }
  } else {
    m.outline(
      [
        [0, -length + 0.7],
        [-beam + 0.3, -length * 0.55],
        [-beam + 0.3, length - 2],
        [beam - 0.3, length - 2],
        [beam - 0.3, -length * 0.55],
      ],
      0.5,
      2.2,
      deck,
    );
    m.box([4.5, 3, 8.5], [0, 3.8, 0], steel);
    m.box([3.2, 2.2, 3.4], [0, 6, -2], dark);
    m.box([3.9, 0.6, 3.6], [0, 7.4, -2.2], steel);
    for (const z of [1.6, 5]) {
      m.cylinder(0.8, 3.5, [0, 5.6, z], steel);
      m.cylinder(0.85, 0.35, [0, 7.4, z], dark);
    }
    m.cylinder(0.17, 6.5, [0, 9, -2], dark);
    m.box([4.4, 0.2, 0.2], [0, 10, -2], dark);
    for (const [z, direction] of [
      [-11, -1],
      [-6.5, -1],
      [11, 1],
    ] as const) {
      m.cylinder(1.4, 1.2, [0, 3.1, z], steel);
      for (const x of [-0.55, 0.55])
        m.cylinder(0.2, 5.2, [x, 3.5, z + direction * 3], dark, [
          Math.PI / 2,
          0,
          0,
        ]);
    }
    for (const side of [-1, 1])
      for (const z of [-7, -3, 3, 7])
        m.box([0.14, 0.8, 2.8], [side * 3.2, 3, z], steel);
  }
  return m.build();
}
export function createAirNavalGeometry(
  model: AirNavalModel,
): THREE.BufferGeometry {
  return model === "fighter" || model === "bomber"
    ? aircraft(model === "bomber")
    : vessel(model);
}
