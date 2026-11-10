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

type AircraftModel =
  | "fighter"
  | "bomber"
  | "strategicBomber"
  | "transport"
  | "reconPlane";
type VesselModel =
  | "ship"
  | "destroyer"
  | "battleship"
  | "carrier"
  | "submarine";

/** Each catalog role gets a recognizable period silhouette, rather than a
 * scaled copy of the same four-engine aircraft. All parts remain one mesh. */
function aircraft(model: AircraftModel) {
  const m = new Builder(),
    olive = 0x7f8c6b,
    light = 0xa5ac8b,
    dark = 0x343e3b,
    alloy = 0xc0c5b5,
    glass = 0x557f91;
  const heavy = model === "strategicBomber",
    transport = model === "transport",
    bomber = model === "bomber",
    recon = model === "reconPlane",
    twin = bomber || transport,
    length = heavy ? 11.6 : transport ? 10.2 : bomber ? 9.8 : recon ? 7 : 7.7,
    span = heavy ? 15 : transport ? 13 : bomber ? 12 : recon ? 10.2 : 9.5,
    radius = heavy ? 1.55 : transport ? 1.75 : bomber ? 1.3 : 1.05;
  m.ellipsoid([radius, transport ? 1.35 : 1.05, length], [0, 0, 0], olive);
  // A pale underside, spinner and sculpted tapered wing make heading legible.
  m.ellipsoid([radius * 0.89, 0.35, length * 0.91], [0, -0.8, 0], alloy);
  m.outline(
    [
      [-span, 0.7],
      [-2, -2.7],
      [2, -2.7],
      [span, 0.7],
      [span - 0.7, 2.3],
      [3, 3.1],
      [-3, 3.1],
      [-span + 0.7, 2.3],
    ],
    0.3,
    recon ? 0.9 : -0.1,
    olive,
  );
  for (const side of [-1, 1]) {
    // Panel seams and separate control surfaces, merged with the wing.
    m.box(
      [span * 0.38, 0.045, 0.08],
      [side * span * 0.64, recon ? 1.08 : 0.08, 1.8],
      dark,
    );
    m.box(
      [0.09, 0.045, 1.65],
      [side * span * 0.45, recon ? 1.08 : 0.08, 0.7],
      light,
    );
    m.box(
      [1.5, 0.045, 1.6],
      [side * span * 0.73, recon ? 1.1 : 0.1, 0.6],
      alloy,
    );
  }
  const tailSpan = heavy ? 5.2 : transport ? 5 : 4.1;
  m.outline(
    [
      [-tailSpan, length - 1.8],
      [0, length - 4.1],
      [tailSpan, length - 1.8],
      [tailSpan - 0.6, length - 0.1],
      [-tailSpan + 0.6, length - 0.1],
    ],
    0.25,
    0.4,
    light,
  );
  // Vertical rudder: trapezoid instead of the old rectangular slab.
  const tail = new THREE.Shape();
  tail.moveTo(-length + 3.2, 0.3);
  tail.lineTo(-length + 2.5, 3.5);
  tail.lineTo(-length + 1.1, 3.6);
  tail.lineTo(-length + 0.1, 0.3);
  tail.closePath();
  const fin = new THREE.ExtrudeGeometry(tail, {
    depth: 0.25,
    bevelEnabled: false,
  });
  fin.rotateY(Math.PI / 2);
  m.add(fin, olive, [-0.125, 0, 0]);
  m.box([0.28, 1.3, 0.1], [0, 1.7, length - 1.2], light);
  m.ellipsoid(
    [radius * 0.76, 0.78, transport ? 1.6 : 1.95],
    [0, 0.92, transport ? -6.5 : -2.4],
    glass,
  );
  const cockpitZ = transport ? -6.5 : -2.4;
  for (const z of [-1, 0.1, 1.2])
    m.box([radius * 1.5, 0.1, 0.1], [0, 1.6, cockpitZ + z], dark);
  m.box([0.09, 0.13, 2.7], [0, 1.65, cockpitZ], dark);
  const engines = heavy ? [-9, -4.8, 4.8, 9] : twin ? [-4.8, 4.8] : [0];
  for (const x of engines) {
    const z = heavy || twin ? -2.2 : -length + 0.8;
    m.ellipsoid([0.72, 0.75, 2.2], [x, -0.15, z], dark);
    m.cylinder(0.75, 0.38, [x, -0.15, z - 1.6], olive, [Math.PI / 2, 0, 0]);
    m.ellipsoid([0.32, 0.32, 0.6], [x, -0.15, z - 2.2], alloy);
    m.box([3.4, 0.14, 0.12], [x, -0.15, z - 2.3], dark);
    m.box([0.14, 3.4, 0.12], [x, -0.15, z - 2.3], dark);
    for (const side of [-1, 1])
      for (const exhaust of [0, 0.5, 1])
        m.box(
          [0.14, 0.16, 0.28],
          [x + side * 0.68, -0.1, z + exhaust],
          0x61503b,
        );
  }
  if (bomber || heavy) {
    // Glazed bombardier's nose, dorsal turret and enclosed bomb-bay doors.
    m.ellipsoid([radius * 0.82, 0.7, 1.7], [0, 0.25, -length + 1], glass);
    m.ellipsoid([0.85, 0.7, 0.9], [0, 1.2, 2.8], glass);
    m.cylinder(0.1, 2.8, [0, 1.5, 4.6], dark, [Math.PI / 2, 0, 0]);
    m.box([0.08, 0.08, 4], [0, -1.1, 1.2], dark);
    if (heavy) {
      m.ellipsoid([0.8, 0.6, 1.1], [0, 0.2, length - 1], glass);
      for (const x of [-0.3, 0.3])
        m.cylinder(0.09, 1.8, [x, 0.2, length + 0.2], dark, [
          Math.PI / 2,
          0,
          0,
        ]);
    }
  } else if (transport) {
    // Civil-derived fuselage windows and cargo door; no bomber turrets/guns.
    for (const side of [-1, 1]) {
      for (const z of [-3.9, -2.6, -1.3, 0, 1.3, 2.6, 3.9])
        m.box([0.08, 0.42, 0.55], [side * 1.67, 0.45, z], glass);
      m.box([0.08, 1.4, 1.7], [side * 1.45, -0.1, 5.1], light);
    }
  } else if (recon) {
    m.box([0.9, 0.35, 0.8], [0, -1.05, 1], dark);
    m.cylinder(0.2, 0.2, [0, -1.3, 1], glass);
    for (const side of [-1, 1])
      m.add(
        new THREE.BoxGeometry(0.1, 2.1, 0.1),
        dark,
        [side * 2.7, 0, 0.8],
        [1, 1, 1],
        [0, 0, side * 0.75],
      );
  } else {
    for (const x of [-3, -2.5, 2.5, 3])
      m.cylinder(0.08, 1.5, [x, -0.05, -2.6], dark, [Math.PI / 2, 0, 0]);
    m.ellipsoid([0.55, 0.36, 2.2], [0, -1.3, 0.5], alloy);
  }
  // Radio antenna and small contrasting navigation lamps are geometry only.
  m.cylinder(0.065, 1.4, [0, 1.7, 0.7], dark);
  m.ellipsoid([0.17, 0.1, 0.22], [-span + 0.4, 0.15, 1.3], 0xaa5148);
  m.ellipsoid([0.17, 0.1, 0.22], [span - 0.4, 0.15, 1.3], 0x6d9c80);
  return m.build();
}
function vessel(model: VesselModel) {
  const m = new Builder(),
    steel = 0x8b969a,
    shade = 0x65737b,
    dark = 0x354249,
    deck = 0xaba18b;
  const carrier = model === "carrier",
    submarine = model === "submarine",
    destroyer = model === "destroyer",
    battleship = model === "battleship";
  const length = carrier
      ? 25
      : submarine
        ? 15
        : destroyer
          ? 17
          : battleship
            ? 24
            : 19,
    beam = carrier
      ? 5.6
      : submarine
        ? 2.1
        : destroyer
          ? 2.45
          : battleship
            ? 4.3
            : 3.5;
  const hull: [number, number][] = [
    [0, -length],
    [-beam * 0.65, -length * 0.83],
    [-beam, -length * 0.4],
    [-beam, length * 0.65],
    [-beam * 0.5, length],
    [beam * 0.5, length],
    [beam, length * 0.65],
    [beam, -length * 0.4],
    [beam * 0.65, -length * 0.83],
  ];
  m.outline(hull, submarine ? 1.5 : 2.5, 0.6, dark);
  m.outline(
    hull.map(([x, z]) => [x * 0.96, z * 0.98]),
    0.4,
    submarine ? 1.35 : 1.95,
    steel,
  );
  if (submarine) {
    m.ellipsoid([beam * 0.86, 0.85, length * 0.91], [0, 1.1, 0], shade);
    m.ellipsoid([0.95, 1.15, 2.4], [0, 2.2, -1.2], dark);
    m.box([1.55, 0.15, 3.5], [0, 3.25, -1.3], steel);
    m.cylinder(0.16, 2.6, [0, 4.2, -1.6], steel);
    m.box([0.55, 0.17, 0.18], [0.2, 5.45, -1.6], dark);
    m.cylinder(0.12, 1.7, [0, 3.8, -0.2], dark);
    for (const z of [-length + 4, length - 3])
      m.box([5, 0.2, 1.05], [0, 0.25, z], dark);
    m.cylinder(0.2, 3.5, [0, 2.25, -6], steel, [Math.PI / 2, 0, 0]);
    m.cylinder(0.65, 0.5, [0, 1.8, -4.6], shade);
    for (const side of [-1, 1])
      for (const z of [-10, -8, -6, 4, 6, 8, 10])
        m.box([0.07, 0.12, 0.65], [side * 1.8, 1.2, z], dark);
  } else if (carrier) {
    m.box([11.8, 0.75, 45], [0, 2.65, 0], deck);
    for (const x of [-5.25, 5.25])
      m.box([0.12, 0.05, 42], [x, 3.06, 0], 0xe5dfc8);
    m.box([0.25, 0.06, 40], [-0.8, 3.06, 0], 0xf3edd7);
    for (const z of [-17, -12, -7, -2, 3, 8, 13, 18])
      m.box([2.4, 0.06, 0.2], [2.5, 3.06, z], 0xeae1c7);
    // Elevator outlines and arrestor cables make the deck read as a carrier.
    for (const z of [-10, 10]) m.box([4.3, 0.04, 3.7], [-0.8, 3.05, z], shade);
    for (const z of [11, 13, 15])
      m.box([8.2, 0.07, 0.075], [-0.5, 3.1, z], dark);
    m.box([2.6, 3.3, 8], [4.1, 4.45, 1], steel);
    m.box([3, 0.85, 4], [4, 6.5, -1], dark);
    m.box([3.1, 0.35, 4.2], [4, 7.1, -1], steel);
    for (const z of [-2.3, -1.3, -0.3])
      m.box([3.15, 0.3, 0.45], [4, 6.65, z], 0x344f5a);
    m.cylinder(0.15, 4.7, [4.1, 9, 0.8], shade);
    m.box([3.3, 1.15, 0.15], [4.1, 10.7, 0.8], dark);
    for (const z of [-12, -3, 7]) {
      m.ellipsoid([0.3, 0.3, 1.8], [-3.3, 3.4, z], steel);
      m.box([3, 0.13, 0.8], [-3.3, 3.5, z], shade);
      m.box([0.12, 0.75, 0.7], [-3.3, 3.8, z + 1], shade);
    }
    for (const side of [-1, 1])
      for (const z of [-16, -5, 5, 15])
        m.cylinder(0.45, 0.65, [side * 5.5, 2.3, z], dark);
  } else {
    m.outline(
      hull.map(([x, z]) => [x * 0.89, z * 0.95]),
      0.4,
      2.25,
      deck,
    );
    m.box([beam * 1.2, 2, length * 0.49], [0, 3.2, 0], shade);
    m.box([beam, 2, 3.4], [0, 5, -3.1], steel);
    m.box([beam * 1.25, 0.6, 3.6], [0, 6.3, -3.1], dark);
    m.box([beam * 1.4, 0.3, 3.9], [0, 6.75, -3.1], steel);
    // Bridge windows, stepped mast and fire-control rangefinder.
    m.box([beam * 1.27, 0.3, 0.08], [0, 6.25, -4.92], 0x35515c);
    m.cylinder(0.14, battleship ? 6 : 4.8, [0, 8, -2.2], shade);
    m.box([beam * 1.45, 0.2, 0.2], [0, 8.8, -2.2], dark);
    m.box([2.3, 0.45, 0.7], [0, 6, -6.1], dark);
    for (const z of destroyer ? [0.8, 4] : [1.2, 5.5]) {
      m.cylinder(destroyer ? 0.65 : 0.9, 3, [0, 4.8, z], steel);
      m.cylinder(destroyer ? 0.7 : 0.95, 0.4, [0, 6.5, z], dark);
    }
    const turrets: [number, number][] = battleship
      ? [
          [-15, -1],
          [-9.6, -1],
          [10.2, 1],
          [15.5, 1],
        ]
      : destroyer
        ? [
            [-10.5, -1],
            [10, 1],
          ]
        : [
            [-11, -1],
            [-6.8, -1],
            [11, 1],
          ];
    for (const [z, direction] of turrets) {
      const radius = battleship ? 1.7 : destroyer ? 0.8 : 1.3;
      m.cylinder(radius, 0.6, [0, 2.8, z], dark);
      m.box([radius * 1.7, 1.1, radius * 1.85], [0, 3.4, z], steel);
      const barrels = battleship
        ? [-0.7, 0, 0.7]
        : destroyer
          ? [0]
          : [-0.45, 0.45];
      for (const x of barrels)
        m.cylinder(
          battleship ? 0.19 : 0.13,
          battleship ? 6.1 : 4.1,
          [x, 3.65, z + direction * (battleship ? 3.7 : 2.5)],
          dark,
          [Math.PI / 2, 0, 0],
        );
    }
    if (destroyer) {
      for (const z of [2.8, 6.5]) {
        m.cylinder(0.7, 0.6, [0, 3.2, z], dark);
        for (const x of [-0.5, 0, 0.5])
          m.cylinder(0.16, 2.2, [x, 3.7, z], shade, [Math.PI / 2, 0, 0]);
      }
    }
    for (const side of [-1, 1]) {
      for (const z of [-6, 2, 7]) {
        m.ellipsoid([0.45, 0.35, 1.6], [side * (beam - 0.65), 3, z], deck);
        m.box([0.06, 0.5, 1.9], [side * (beam - 0.2), 2.65, z], steel);
      }
      for (const z of [-11, -8, 8, 11])
        m.box([0.08, 0.25, 0.35], [side * beam * 0.91, 1.85, z], dark);
    }
  }
  return m.build();
}
export function createAirNavalGeometry(
  model: AirNavalModel,
): THREE.BufferGeometry {
  return [
    "fighter",
    "bomber",
    "strategicBomber",
    "transport",
    "reconPlane",
  ].includes(model)
    ? aircraft(model as AircraftModel)
    : vessel(model as VesselModel);
}
