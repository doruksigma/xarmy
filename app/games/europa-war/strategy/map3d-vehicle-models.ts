import * as THREE from "three";
import {
  ModelBuilder,
  type LandModelTier,
  type XYZ,
  ARMOR,
  CLOTH_LIGHT,
  LEATHER,
  METAL,
  TRACK,
  WOOD,
} from "./map3d-model-builder";

const EDGE = 0x92967a;
const DARK = 0x283129;
const PAINT = 0x747b54;

/** Extruded side silhouette; points describe Z/Y and depth runs across X. */
function sideProfile(
  points: readonly (readonly [number, number])[],
  width: number,
  bevel = 0.035,
) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) =>
    i ? shape.lineTo(-z, y) : shape.moveTo(-z, y),
  );
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function hollowBarrel(
  model: ModelBuilder,
  from: XYZ,
  to: XYZ,
  rearRadius: number,
  mouthRadius: number,
  color: number,
) {
  const start = new THREE.Vector3(...from),
    end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start),
    length = direction.length();
  const bore = mouthRadius * 0.63;
  const geometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(bore, -length / 2),
      new THREE.Vector2(rearRadius, -length / 2),
      new THREE.Vector2(mouthRadius, length / 2 - 0.055),
      new THREE.Vector2(mouthRadius * 1.08, length / 2),
      new THREE.Vector2(bore, length / 2),
      new THREE.Vector2(bore, -length / 2),
    ],
    12,
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
  );
  model.add(
    geometry,
    color,
    start.add(end).multiplyScalar(0.5).toArray() as XYZ,
  );
}

function trackLoop(model: ModelBuilder, x: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.65, -0.52);
  shape.lineTo(1.65, -0.52);
  shape.absarc(1.65, 0, 0.52, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-1.65, 0.52);
  shape.absarc(-1.65, 0, 0.52, Math.PI / 2, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.moveTo(-1.65, -0.34);
  hole.absarc(-1.65, 0, 0.34, -Math.PI / 2, -Math.PI * 1.5, true);
  hole.lineTo(1.65, 0.34);
  hole.absarc(1.65, 0, 0.34, Math.PI / 2, -Math.PI / 2, true);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.64,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -0.32);
  geometry.rotateY(Math.PI / 2);
  model.add(geometry, TRACK, [x, 0.65, 0]);
}

function tankHull(tier: LandModelTier) {
  const model = new ModelBuilder();
  for (const side of [-1, 1]) trackLoop(model, side * 1.52);
  model.add(
    sideProfile(
      [
        [-2.05, 0.65],
        [1.9, 0.65],
        [2.14, 1.12],
        [1.45, 1.73 + tier * 0.035],
        [-1.72, 1.66],
        [-2.12, 1.18],
      ],
      2.65 + tier * 0.1,
      0.065,
    ),
    ARMOR,
  );
  // Sloped glacis, cast transmission nose and separate drive deck.
  model.add(
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI),
    0x69724d,
    [0, 1.02, 1.93],
    [0, 0, 0],
    [1.18, 0.31, 0.29],
  );
  model.softBox([2.38, 0.17, 1.18], [0, 1.72, -1.37], 0x535f41, 0.055);
  for (let x = -0.9; x < 0.91; x += 0.18)
    model.box([0.065, 0.045, 0.8], [x, 1.83, -1.38], METAL);
  for (const side of [-1, 1]) {
    model.add(
      sideProfile(
        [
          [-2.12, 1.18],
          [-1.81, 1.36],
          [1.85, 1.36],
          [2.12, 1.17],
          [1.88, 1.24],
          [-1.82, 1.24],
        ],
        0.48,
        0.012,
      ),
      PAINT,
      [side * 1.57, 0, 0],
    );
    for (const z of [-1.72, -0.86, 0, 0.86, 1.72]) {
      model.rod(
        [side * 1.57, 0.75, z],
        [side * 1.82, 0.56, z + 0.18],
        0.08,
        METAL,
      );
      model.box([0.61, 0.085, 0.16], [side * 1.52, 0.115, z], 0x72765b);
    }
    model.softBox(
      [0.35, 0.35, 1.08],
      [side * 1.32, 1.78, -1.3],
      0x626c4c,
      0.045,
    );
    model.rod(
      [side * 1.34, 1.95, -1.7],
      [side * 1.34, 1.95, -0.87],
      0.032,
      EDGE,
    );
    model.rod(
      [side * 0.83, 1.05, -2.13],
      [side * 0.83, 1.83, -2.13],
      0.1,
      METAL,
    );
    model.cylinder(0.125, 0.05, [side * 0.83, 1.87, -2.13], DARK);
    model.sphere(0.115, [side * 1.02, 1.5, 2.18], 0xd0c29c);
    model.rod(
      [side * 1.13, 1.39, 2.07],
      [side * 0.92, 1.7, 2.05],
      0.025,
      METAL,
    );
    model.add(new THREE.TorusGeometry(0.105, 0.03, 4, 10), METAL, [
      side * 0.86,
      0.91,
      2.245,
    ]);
    if (tier === 0)
      for (const z of [-1.3, -0.8, -0.3, 0.2, 0.7, 1.2])
        model.box([0.03, 0.055, 0.055], [side * 1.36, 1.43, z], EDGE);
    if (tier >= 2) {
      model.box([0.11, 0.5, 2.9], [side * 1.59, 1.23, -0.11], PAINT);
      for (const z of [-1.15, -0.25, 0.65])
        model.box([0.03, 0.5, 0.035], [side * 1.66, 1.23, z], EDGE);
    }
    if (tier === 3) {
      model.box([0.08, 0.58, 3.7], [side * 1.83, 0.91, -0.12], ARMOR);
      for (const z of [-1.45, -0.55, 0.35, 1.25])
        model.box([0.03, 0.58, 0.035], [side * 1.88, 0.91, z], PAINT);
    }
  }
  model.softBox([0.64, 0.12, 0.5], [-0.55, 1.78, 0.8], PAINT, 0.04);
  model.box([0.39, 0.08, 0.09], [-0.55, 1.89, 0.97], DARK);
  model.cylinder(0.1, 0.33, [0.6, 1.43, 1.94], METAL, [Math.PI / 2, 0, 0]);
  model.box([0.7, 0.24, 0.12], [0, 1.12, -2.27], METAL);
  for (const x of [-0.23, 0, 0.23])
    model.box([0.13, 0.25, 0.13], [x, 1.12, -2.28], PAINT);
  return model.build();
}

function tankTurret(tier: LandModelTier) {
  const model = new ModelBuilder();
  const width = 0.82 + tier * 0.1,
    length = 0.86 + tier * 0.1;
  model.cylinder(0.73 + tier * 0.07, 0.14, [0, 1.87, 0], METAL, [0, 0, 0], 16);
  model.add(
    new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    ARMOR,
    [0, 1.94, 0],
    [0, 0, 0],
    [width, 0.68 + tier * 0.035, length],
  );
  model.cylinder(width, 0.19, [0, 2.0, 0], ARMOR, [0, 0, 0], 16);
  model.softBox(
    [0.96 + tier * 0.1, 0.53, 0.36],
    [0, 2.29, 0.84],
    0x727b54,
    0.14,
  );
  model.cylinder(0.31, 0.22, [0, 2.3, 1.0], ARMOR, [Math.PI / 2, 0, 0], 12);
  model.cylinder(
    0.31,
    0.17,
    [-0.28, 2.59 + tier * 0.03, -0.15],
    PAINT,
    [0, 0, 0],
    12,
  );
  model.cylinder(
    0.26,
    0.055,
    [-0.28, 2.7 + tier * 0.03, -0.15],
    ARMOR,
    [0, 0, 0],
    12,
  );
  model.rod(
    [-0.41, 2.75 + tier * 0.03, -0.15],
    [-0.18, 2.75 + tier * 0.03, -0.15],
    0.025,
    EDGE,
  );
  model.box([0.27, 0.09, 0.16], [0.31, 2.58, 0.18], DARK);
  model.box([0.2, 0.03, 0.12], [0.31, 2.64, 0.18], 0x536d74);
  model.rod(
    [width * 0.64, 2.43, -0.37],
    [width * 0.64, 3.42 + tier * 0.1, -0.37],
    0.016,
    METAL,
  );
  for (const side of [-1, 1]) {
    model.rod(
      [side * width * 0.84, 2.24, -0.43],
      [side * width * 0.94, 2.24, 0.2],
      0.025,
      EDGE,
    );
    model.softBox(
      [0.17, 0.28, 0.6],
      [side * width, 2.13, -0.28],
      0x68734e,
      0.035,
    );
    if (tier >= 1)
      model.rod(
        [side * 0.55, 2.25, -length * 0.85],
        [side * 0.55, 2.48, -length * 0.85],
        0.03,
        EDGE,
      );
  }
  if (tier >= 2)
    model.softBox(
      [0.82, 0.32, 0.31],
      [0, 2.18, -length * 0.96],
      0x747650,
      0.06,
    );
  if (tier === 3) {
    model.rod([0.28, 2.63, -0.35], [0.28, 2.94, -0.35], 0.045, METAL);
    model.cylinder(0.055, 0.74, [0.28, 2.96, -0.01], METAL, [
      Math.PI / 2,
      0,
      0,
    ]);
  }
  return model.build();
}

function tankBarrel(tier: LandModelTier) {
  const model = new ModelBuilder();
  hollowBarrel(
    model,
    [0, 2.3, 0.98],
    [0, 2.3, 4.21],
    0.16 + tier * 0.02,
    0.105 + tier * 0.025,
    METAL,
  );
  model.cylinder(0.23, 0.8, [0, 2.3, 1.4], PAINT, [Math.PI / 2, 0, 0], 12);
  model.cylinder(0.18, 0.1, [0, 2.3, 2.03], EDGE, [Math.PI / 2, 0, 0], 12);
  if (tier >= 2) {
    model.box([0.42, 0.1, 0.3], [0, 2.47, 3.98], PAINT);
    model.box([0.42, 0.1, 0.3], [0, 2.13, 3.98], PAINT);
    for (const side of [-1, 1])
      model.box([0.055, 0.25, 0.055], [side * 0.19, 2.3, 3.86], METAL);
  }
  return model.build();
}

function fender(model: ModelBuilder, x: number, z: number) {
  const points: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const angle = (i * Math.PI) / 10;
    points.push([Math.cos(angle) * 0.7, Math.sin(angle) * 0.7]);
  }
  for (let i = 10; i >= 0; i--) {
    const angle = (i * Math.PI) / 10;
    points.push([Math.cos(angle) * 0.6, Math.sin(angle) * 0.6]);
  }
  model.add(sideProfile(points, 0.42, 0), PAINT, [x, 0.57, z]);
}

function canvasRoof(model: ModelBuilder, tier: LandModelTier) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.015, 1.52);
  shape.lineTo(1.015, 1.52);
  shape.lineTo(1.015, 2.4);
  shape.quadraticCurveTo(1.015, 2.85, 0, 2.85);
  shape.quadraticCurveTo(-1.015, 2.85, -1.015, 2.4);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2.52,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -2.54);
  model.add(geometry, 0x8a8966);
  for (const z of [-2.4, -1.65, -0.9, -0.15]) {
    for (const side of [-1, 1]) {
      model.rod([side * 1.04, 1.52, z], [side * 1.04, 2.4, z], 0.018, 0x686d4e);
      model.rod([side * 1.04, 2.4, z], [side * 0.74, 2.73, z], 0.018, 0x686d4e);
    }
    model.rod([-0.74, 2.73, z], [0.74, 2.73, z], 0.018, 0x949773);
  }
  if (tier >= 2) {
    model.cylinder(
      0.18,
      1.7,
      [0, 2.97, -2.09],
      CLOTH_LIGHT,
      [0, 0, Math.PI / 2],
      10,
    );
    for (const x of [-0.5, 0.5])
      model.box([0.075, 0.38, 0.26], [x, 2.97, -2.09], LEATHER);
  }
}

function truckBody(tier: LandModelTier) {
  const model = new ModelBuilder();
  model.box([1.72, 0.25, 4.92], [0, 0.84, -0.1], METAL);
  for (const side of [-1, 1]) {
    model.box([0.13, 0.24, 4.45], [side * 0.62, 0.67, -0.15], DARK);
    for (const z of [-1.65, -0.7, 1.55]) fender(model, side * 1.04, z);
  }
  // Curved period cab roof, tapered cowl and long rounded hood.
  const cab = new THREE.Shape();
  cab.moveTo(-0.99, 1.04);
  cab.lineTo(0.99, 1.04);
  cab.lineTo(1.0, 2.22);
  cab.quadraticCurveTo(1, 2.64, 0.59, 2.64);
  cab.lineTo(-0.59, 2.64);
  cab.quadraticCurveTo(-1, 2.64, -1, 2.22);
  cab.closePath();
  const cabGeometry = new THREE.ExtrudeGeometry(cab, {
    depth: 1.22,
    bevelEnabled: true,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    bevelSegments: 2,
    curveSegments: 5,
    steps: 1,
  });
  cabGeometry.translate(0, 0, 0.25);
  model.add(cabGeometry, ARMOR);
  model.add(
    sideProfile(
      [
        [1.45, 1.15],
        [2.53, 1.15],
        [2.53, 1.67],
        [2.28, 1.83],
        [1.45, 1.93],
      ],
      1.75,
      0.07,
    ),
    PAINT,
  );
  for (const side of [-1, 1]) {
    model.profile(
      [
        [-0.37, -0.25],
        [0.37, -0.25],
        [0.34, 0.24],
        [-0.34, 0.24],
      ],
      0.025,
      [side * 0.43, 2.21, 1.52],
      0x63868a,
    );
    model.add(
      new THREE.PlaneGeometry(0.64, 0.51),
      0x63868a,
      [side * 1.05, 2.18, 0.84],
      [0, (side * Math.PI) / 2, 0],
    );
    model.box([0.027, 0.85, 0.045], [side * 1.06, 1.75, 0.33], 0x4f5c40);
    model.box([0.035, 0.055, 0.19], [side * 1.07, 1.85, 0.64], EDGE);
    model.box([0.27, 0.11, 1.6], [side * 1.04, 0.98, 0.61], PAINT);
    model.rod(
      [side * 0.92, 2.16, 1.44],
      [side * 1.23, 2.33, 1.42],
      0.025,
      METAL,
    );
    model.softBox([0.1, 0.25, 0.16], [side * 1.25, 2.35, 1.42], EDGE, 0.02);
    model.box([0.015, 0.18, 0.11], [side * 1.31, 2.35, 1.42], 0x536d74);
    model.sphere(0.12, [side * 0.82, 1.61, 2.63], 0xd8cb9e, [1, 1, 0.75]);
    model.rod(
      [side * 0.83, 1.47, 2.52],
      [side * 0.83, 1.65, 2.51],
      0.035,
      METAL,
    );
    for (const z of [1.7, 1.86, 2.02, 2.18])
      model.box([0.025, 0.19, 0.055], [side * 0.91, 1.57, z], DARK);
    model.box([0.32, 0.42, 0.055], [side * 0.97, 0.56, -2.24], TRACK);
    model.sphere(0.055, [side * 0.85, 1.28, -2.62], 0xa35f43);
  }
  model.box([0.055, 0.62, 0.04], [0, 2.19, 1.56], PAINT);
  for (const x of [-0.43, 0.43])
    model.rod([x, 1.98, 1.56], [x + 0.17, 2.36, 1.56], 0.015, METAL);
  model.softBox([1.27, 0.5, 0.09], [0, 1.48, 2.61], METAL, 0.045);
  for (let x = -0.51; x < 0.53; x += 0.17)
    model.box([0.04, 0.39, 0.1], [x, 1.48, 2.65], EDGE);
  model.box([2.26, 0.15, 0.21], [0, 0.99, 2.64], METAL);
  model.box([0.5, 0.12, 0.025], [0, 1.08, 2.76], 0xb7b29a);
  model.box([0.035, 0.035, 1.04], [0, 1.96, 2.01], EDGE);
  model.box([2.08, 0.22, 2.6], [0, 1.25, -1.24], WOOD);
  if (tier === 0) {
    for (const side of [-1, 1]) {
      for (const y of [1.47, 1.69, 1.91])
        model.box([0.08, 0.15, 2.55], [side * 1.015, y, -1.24], WOOD);
      for (const z of [-2.43, -1.2, -0.05])
        model.box([0.1, 0.78, 0.09], [side * 1.03, 1.64, z], METAL);
    }
    for (const z of [-1.88, -0.66])
      model.softBox([1.52, 0.49, 0.79], [0, 1.62, z], 0x9a8058, 0.055);
  } else if (tier < 3) canvasRoof(model, tier);
  else {
    for (const side of [-1, 1]) {
      model.box([0.14, 1.2, 2.5], [side * 0.99, 1.92, -1.23], PAINT, [
        0,
        0,
        side * -0.13,
      ]);
      model.add(
        sideProfile(
          [
            [-1.1, -0.36],
            [0.86, -0.36],
            [1.1, 0],
            [0.86, 0.38],
            [-1.1, 0.38],
            [-1.29, 0],
          ],
          0.36,
          0.035,
        ),
        TRACK,
        [side * 1.06, 0.66, -1.24],
      );
      for (const z of [-2.25, -1.9, -1.55, -1.2, -0.85, -0.5])
        model.box([0.4, 0.07, 0.15], [side * 1.06, 1.08, z], EDGE);
    }
    model.box([1.88, 1.0, 0.12], [0, 1.86, -2.48], ARMOR);
    model.box([1.88, 0.28, 0.15], [0, 2.38, -0.03], PAINT);
    model.softBox([0.48, 0.52, 0.3], [-0.66, 1.91, -2.5], ARMOR, 0.04);
  }
  model.box([2.08, 0.55, 0.075], [0, 1.57, -2.58], ARMOR);
  for (const x of [-0.7, 0, 0.7])
    model.box([0.065, 0.55, 0.09], [x, 1.57, -2.62], EDGE);
  return model.build();
}

function artilleryBase(tier: LandModelTier) {
  const model = new ModelBuilder();
  model.cylinder(0.115, 2.16, [0, 0.69, 0], METAL, [0, 0, Math.PI / 2], 10);
  for (const side of [-1, 1]) {
    model.rod(
      [side * 0.28, 0.77, -0.05],
      [side * 1.03, 0.2, -2.49],
      0.105,
      ARMOR,
    );
    model.rod(
      [side * 0.33, 0.59, -0.17],
      [side * 0.96, 0.13, -2.44],
      0.045,
      EDGE,
    );
    model.add(
      sideProfile(
        [
          [-0.22, -0.06],
          [0.17, -0.06],
          [0.1, 0.21],
          [-0.17, 0.26],
        ],
        0.38,
        0.015,
      ),
      METAL,
      [side * 1.03, 0.1, -2.47],
    );
    model.rod(
      [side * 0.79, 0.69, -0.05],
      [side * 0.42, 1.45, -0.28],
      0.065,
      PAINT,
    );
  }
  const half = 0.84 + tier * 0.075,
    top = 2.06 + tier * 0.035;
  const shield = new THREE.Shape();
  shield.moveTo(-half, 0.79);
  shield.lineTo(half, 0.79);
  shield.lineTo(half, top - 0.28);
  shield.lineTo(half * 0.67, top);
  shield.lineTo(-half * 0.67, top);
  shield.lineTo(-half, top - 0.28);
  shield.closePath();
  const aperture = new THREE.Path();
  aperture.absarc(0, 1.67, 0.245, 0, Math.PI * 2, true);
  shield.holes.push(aperture);
  const shieldGeometry = new THREE.ExtrudeGeometry(shield, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 6,
  });
  model.add(shieldGeometry, ARMOR, [0, 0, 0.18]);
  for (const side of [-1, 1]) {
    model.box([0.05, 0.86, 0.045], [side * half * 0.76, 1.34, 0.34], PAINT);
    for (const y of [0.96, 1.26, 1.58, 1.86])
      model.box([0.045, 0.045, 0.03], [side * half * 0.78, y, 0.378], EDGE);
    if (tier >= 2)
      model.box([0.18, 0.72, 0.1], [side * (half + 0.04), 1.2, 0.25], PAINT);
  }
  model.softBox([0.54, 0.39, 0.84], [0, 1.2, -0.46], PAINT, 0.06);
  model.cylinder(0.31, 0.18, [0, 1.32, -0.31], METAL, [0, 0, Math.PI / 2], 12);
  model.add(
    new THREE.TorusGeometry(0.24, 0.027, 5, 12),
    EDGE,
    [-0.55, 1.21, -0.39],
    [0, Math.PI / 2, 0],
  );
  model.rod([-0.55, 0.99, -0.39], [-0.55, 1.43, -0.39], 0.018, METAL);
  model.rod([-0.55, 1.21, -0.61], [-0.55, 1.21, -0.17], 0.018, METAL);
  model.rod([-0.28, 1.4, -0.66], [-0.38, 1.78, -0.66], 0.035, METAL);
  model.cylinder(0.075, 0.33, [-0.38, 1.78, -0.55], METAL, [Math.PI / 2, 0, 0]);
  model.softBox([0.33, 0.12, 0.4], [-0.54, 0.86, -1.12], LEATHER, 0.035);
  if (tier >= 1)
    model.softBox([0.34, 0.32, 0.65], [0.57, 0.4, -1.15], 0x7e7653, 0.035);
  if (tier === 3) model.box([1.85, 0.25, 0.12], [0, 0.71, 0.27], PAINT);
  return model.build();
}

function artilleryBarrel(tier: LandModelTier) {
  const model = new ModelBuilder();
  hollowBarrel(
    model,
    [0, 1.49, -0.4],
    [0, 1.96, 2.96],
    0.17 + tier * 0.025,
    0.13 + tier * 0.025,
    METAL,
  );
  model.rod([0, 1.48, -0.51], [0, 1.68, 0.91], 0.23, PAINT);
  for (const side of [-1, 1]) {
    model.rod(
      [side * 0.21, 1.34, -0.39],
      [side * 0.21, 1.55, 1.09],
      0.07,
      EDGE,
    );
    model.rod(
      [side * 0.21, 1.55, 1.09],
      [side * 0.21, 1.62, 1.57],
      0.044,
      METAL,
    );
  }
  model.softBox(
    [0.45 + tier * 0.035, 0.37, 0.4],
    [0, 1.45, -0.52],
    METAL,
    0.065,
  );
  model.box([0.22, 0.13, 0.12], [0.31, 1.45, -0.52], EDGE);
  if (tier >= 2) {
    model.rod([0, 1.2, -0.4], [0, 1.45, 1.25], 0.1, PAINT);
    model.box([0.45, 0.075, 0.28], [0, 2.13, 2.72], METAL, [-0.14, 0, 0]);
    model.box([0.45, 0.075, 0.28], [0, 1.75, 2.72], METAL, [-0.14, 0, 0]);
  }
  return model.build();
}

function wheels() {
  const model = new ModelBuilder();
  const tyre = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.67, -0.2),
      new THREE.Vector2(0.87, -0.22),
      new THREE.Vector2(0.98, -0.14),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(0.98, 0.14),
      new THREE.Vector2(0.87, 0.22),
      new THREE.Vector2(0.67, 0.2),
      new THREE.Vector2(0.67, -0.2),
    ],
    12,
  );
  model.add(tyre, TRACK, [0, 0, 0], [0, 0, Math.PI / 2]);
  for (const side of [-1, 1]) {
    model.cylinder(
      0.66,
      0.045,
      [side * 0.21, 0, 0],
      PAINT,
      [0, 0, Math.PI / 2],
      12,
    );
    model.cylinder(
      0.21,
      0.065,
      [side * 0.25, 0, 0],
      METAL,
      [0, 0, Math.PI / 2],
      8,
    );
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      model.add(
        new THREE.CircleGeometry(0.075, 5),
        DARK,
        [side * 0.25, Math.cos(angle) * 0.44, Math.sin(angle) * 0.44],
        [0, (side * Math.PI) / 2, 0],
      );
      model.add(
        new THREE.CircleGeometry(0.035, 5),
        EDGE,
        [side * 0.28, Math.cos(angle) * 0.28, Math.sin(angle) * 0.28],
        [0, (side * Math.PI) / 2, 0],
      );
    }
  }
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI * 2) / 10;
    model.box(
      [0.32, 0.045, 0.16],
      [0, Math.cos(angle) * 0.99, Math.sin(angle) * 0.99],
      0x484d3c,
      [angle, 0, 0],
    );
  }
  return model.build();
}

function tracks() {
  const model = new ModelBuilder();
  for (let z = -2.02; z < 1.9; z += 0.38) {
    model.box([0.73, 0.07, 0.19], [0, 0, z], 0x697258);
    model.box([0.77, 0.055, 0.045], [0, 0.058, z], EDGE);
    model.box([0.14, 0.1, 0.09], [0, -0.07, z], METAL);
  }
  return model.build();
}

/** Four original period-inspired silhouettes, sharing the existing rig contract. */
export function createVehicleModelGeometries(tier: LandModelTier) {
  return {
    tankHull: tankHull(tier),
    truckBody: truckBody(tier),
    artilleryBase: artilleryBase(tier),
    tankTurret: tankTurret(tier),
    tankBarrel: tankBarrel(tier),
    artilleryBarrel: artilleryBarrel(tier),
    wheels: wheels(),
    tracks: tracks(),
  };
}
