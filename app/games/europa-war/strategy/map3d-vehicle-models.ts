import * as THREE from "three";
import {
  DEFAULT_COUNTRY_MODEL_PROFILE,
  type NationalModelProfile,
  type TankModelProfile,
  type TruckModelProfile,
  type ArtilleryModelProfile,
} from "./map3d-national-profiles";
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

function tankProfileAtTier(
  tier: LandModelTier,
  profile: TankModelProfile,
): TankModelProfile {
  if (tier < 2 || !profile.variant) return profile;
  switch (profile.variant) {
    case "tiger1":
      return {
        ...profile,
        hull: "box",
        turret: "box",
        skirt: "none",
        hullWidth: profile.hullWidth * 1.12,
      };
    case "churchill":
      return {
        ...profile,
        hull: "box",
        turret: "box",
        skirt: "none",
        hullWidth: profile.hullWidth * 0.9,
      };
    case "somua_s35":
      return { ...profile, hull: "cast", turret: "compact", skirt: "full" };
    case "t34":
      return { ...profile, hull: "sloped", turret: "cast", skirt: "none" };
    case "m13_40":
      return {
        ...profile,
        hull: "riveted",
        turret: "box",
        skirt: "none",
        hullWidth: profile.hullWidth * 0.93,
      };
    case "lt38":
      return {
        ...profile,
        hull: "riveted",
        turret: "angular",
        skirt: "none",
        hullWidth: profile.hullWidth * 0.91,
      };
    case "strv_m42":
      return { ...profile, hull: "sloped", turret: "angular", skirt: "none" };
    case "t26":
    case "7tp":
    case "ctls":
      return {
        ...profile,
        hull: "riveted",
        turret: "compact",
        skirt: "none",
        hullWidth: profile.hullWidth * 0.87,
      };
  }
}

/** Recognition features sit within the existing track and wheel animation rig. */
function iconicHullDetails(model: ModelBuilder, profile: TankModelProfile) {
  switch (profile.variant) {
    case "tiger1":
      for (const side of [-1, 1]) {
        // The alternating overlapping road-wheel faces are characteristic of Tiger I.
        for (let wheel = 0; wheel < 8; wheel++) {
          const x = side * (wheel % 2 ? 2.015 : 1.94),
            z = -1.64 + wheel * 0.47;
          model.cylinder(
            0.48,
            0.07,
            [x, 0.66, z],
            PAINT,
            [0, 0, Math.PI / 2],
            12,
          );
          model.add(
            new THREE.CircleGeometry(0.12, 8),
            METAL,
            [x + side * 0.041, 0.66, z],
            [0, (side * Math.PI) / 2, 0],
          );
        }
        model.box([0.12, 0.24, 4.04], [side * 1.89, 1.39, 0], ARMOR);
        model.softBox(
          [0.46, 0.77, 0.2],
          [side * 0.82, 1.42, -2.18],
          PAINT,
          0.06,
        );
      }
      model.box([2.68, 0.42, 0.09], [0, 1.49, 2.16], ARMOR);
      model.box([0.49, 0.12, 0.07], [-0.67, 1.63, 2.23], DARK);
      break;
    case "churchill":
      for (const side of [-1, 1]) {
        model.add(
          sideProfile(
            [
              [-2.24, 0.42],
              [2.24, 0.42],
              [2.24, 1.46],
              [2.02, 1.8],
              [-2.04, 1.8],
              [-2.24, 1.53],
            ],
            0.55,
            0.008,
          ),
          ARMOR,
          [side * 1.79, 0, 0],
        );
        model.box([0.57, 0.11, 4.1], [side * 1.77, 1.86, -0.02], PAINT);
        model.softBox(
          [0.045, 0.62, 0.7],
          [side * 2.046, 1.12, -0.31],
          PAINT,
          0.015,
        );
        for (const z of [-1.82, -1.3, -0.78, -0.26, 0.26, 0.78, 1.3, 1.82])
          model.box([0.03, 0.11, 0.18], [side * 2.064, 0.47, z], TRACK);
      }
      break;
    case "somua_s35":
      model.ellipsoid(
        [1.38 * profile.hullWidth, 0.35, 1.64],
        [0, 1.5, 0.03],
        ARMOR,
        16,
      );
      for (const side of [-1, 1])
        model.softBox(
          [0.15, 0.64, 1.62],
          [side * 1.7, 0.97, -0.64],
          PAINT,
          0.06,
        );
      break;
    case "t34":
      for (const side of [-1, 1]) {
        model.cylinder(
          0.22,
          0.94,
          [side * 1.2, 1.88, -1.43],
          PAINT,
          [Math.PI / 2, 0, 0],
          10,
        );
        for (const z of [-1.72, -1.16])
          model.box([0.49, 0.06, 0.07], [side * 1.2, 2.09, z], METAL);
      }
      model.softBox([0.76, 0.18, 0.56], [-0.48, 1.72, 1.23], PAINT, 0.025);
      break;
    case "m13_40":
    case "lt38":
    case "t26":
    case "7tp":
    case "ctls":
      for (const x of [-0.96, -0.64, -0.32, 0, 0.32, 0.64, 0.96])
        for (const y of [1.15, 1.55])
          model.box([0.05, 0.05, 0.025], [x, y, 2.205], EDGE);
      if (profile.variant === "m13_40") {
        model.sphere(0.18, [0.61, 1.48, 2.13], PAINT);
        for (const x of [0.56, 0.66])
          model.rod([x, 1.48, 2.15], [x, 1.48, 2.31], 0.033, METAL);
      } else if (profile.variant === "7tp") {
        model.box([1.6, 0.38, 0.7], [0, 1.93, -1.45], ARMOR);
        for (let x = -0.64; x <= 0.65; x += 0.16)
          model.box([0.065, 0.03, 0.58], [x, 2.135, -1.45], DARK);
      } else if (profile.variant === "ctls") {
        model.softBox([0.65, 0.47, 0.59], [-0.57, 1.93, 0.7], ARMOR, 0.025);
        model.box([0.38, 0.12, 0.025], [-0.57, 2.02, 1.02], DARK);
      } else model.box([0.68, 0.3, 0.19], [-0.48, 1.73, 1.89], PAINT);
      break;
    case "strv_m42":
      for (const side of [-1, 1]) {
        model.softBox(
          [0.28, 0.31, 1.34],
          [side * 1.25, 1.82, -1.19],
          PAINT,
          0.035,
        );
        model.box(
          [0.53, 0.08, 0.6],
          [side * 0.65, 1.78, 1.2],
          ARMOR,
          [-0.38, 0, 0],
        );
      }
      break;
  }
}

function tankHull(tier: LandModelTier, profile: TankModelProfile) {
  profile = tankProfileAtTier(tier, profile);
  const variant = tier >= 2 ? profile.variant : undefined;
  const model = new ModelBuilder();
  for (const side of [-1, 1]) trackLoop(model, side * 1.52);
  const boxHull = profile.hull === "box" || profile.hull === "riveted";
  const rivetedHull = profile.hull === "riveted";
  const castHull = profile.hull === "cast";
  const deck = 1.66 + tier * 0.035;
  const hullLength = Math.min(1.015, profile.hullLength);
  const upperHull = sideProfile(
    [
      [-2.05, 0.65],
      [1.9, 0.65],
      [2.14, rivetedHull ? 1.53 : boxHull ? 1.48 : 1.12],
      [
        rivetedHull ? 1.92 : boxHull ? 1.78 : castHull ? 1.65 : 1.25,
        deck + 0.07,
      ],
      [-1.72, deck],
      [-2.12, boxHull ? 1.45 : 1.18],
    ].map(([z, y]) => [z * hullLength, y] as const),
    (2.65 + tier * 0.1) * profile.hullWidth,
    castHull ? 0.11 : 0.025,
  );
  if (variant === "t34" || variant === "strv_m42") {
    const positions = upperHull.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const taper = Math.max(
        0,
        Math.min(1, (positions.getY(index) - 1.08) / 0.7),
      );
      positions.setX(index, positions.getX(index) * (1 - taper * 0.23));
    }
    upperHull.computeVertexNormals();
  }
  model.add(upperHull, ARMOR);
  // Cast noses, welded glacis and riveted vertical plates have distinct profiles.
  if (castHull)
    model.add(
      new THREE.SphereGeometry(1, 12, 6),
      0x69724d,
      [0, 1.15, 1.93],
      [0, 0, 0],
      [1.18 * profile.hullWidth, 0.42, 0.29],
    );
  else if (boxHull) {
    model.box([2.34 * profile.hullWidth, 0.47, 0.08], [0, 1.23, 2.15], PAINT);
    model.box(
      [1.82, rivetedHull ? 0.35 : 0.18, rivetedHull ? 0.52 : 0.66],
      [0, deck + (rivetedHull ? 0.12 : 0.05), 0.83],
      ARMOR,
    );
  }
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
    if (profile.hull === "riveted" || (boxHull && tier === 0))
      for (const z of [-1.3, -0.8, -0.3, 0.2, 0.7, 1.2])
        model.box(
          [0.035, 0.055, 0.055],
          [side * (1.325 + tier * 0.05) * profile.hullWidth, 1.43, z],
          EDGE,
        );
    if (
      profile.skirt === "segmented" ||
      (profile.skirt === "full" && tier < 2)
    ) {
      model.box([0.11, 0.5, 2.9], [side * 1.84, 1.23, -0.11], PAINT);
      for (const z of [-1.15, -0.25, 0.65])
        model.box([0.03, 0.5, 0.035], [side * 1.91, 1.23, z], EDGE);
    }
    if (profile.skirt === "full" && tier >= 2) {
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
  if (variant) iconicHullDetails(model, profile);
  return model.build();
}

/** Welded turrets use planar sides and a tapered roof instead of a shared dome. */
function weldedTurret(
  width: number,
  length: number,
  top: number,
  box: boolean,
) {
  const outline = [
    [-0.68, -1],
    [0.68, -1],
    [1, -0.5],
    [1, 0.55],
    [0.64, 1],
    [-0.64, 1],
    [-1, 0.55],
    [-1, -0.5],
  ];
  const positions: number[] = [],
    indices: number[] = [];
  for (const level of [0, 1]) {
    const taper = level ? (box ? 0.97 : 0.73) : 1;
    for (const [x, z] of outline)
      positions.push(x * width * taper, level ? top : 1.96, z * length * taper);
  }
  for (let index = 0; index < 8; index++) {
    const next = (index + 1) % 8;
    indices.push(index, next, index + 8, next, next + 8, index + 8);
  }
  for (let index = 1; index < 7; index++)
    indices.push(0, index + 1, index, 8, index + 8, index + 9);
  for (let index = 0; index < indices.length; index += 3)
    [indices[index + 1], indices[index + 2]] = [
      indices[index + 2],
      indices[index + 1],
    ];
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function tankTurret(tier: LandModelTier, profile: TankModelProfile) {
  profile = tankProfileAtTier(tier, profile);
  const variant = tier >= 2 ? profile.variant : undefined;
  const model = new ModelBuilder();
  const compact = profile.turret === "compact";
  const cast = profile.turret === "cast" || compact;
  const light = variant === "t26" || variant === "7tp" || variant === "ctls";
  const tiger = variant === "tiger1";
  const width =
      (0.82 + tier * 0.1) *
      profile.turretWidth *
      (light
        ? 0.72
        : compact
          ? 0.84
          : tiger
            ? 1.12
            : variant === "churchill"
              ? 0.85
              : variant === "t34"
                ? 0.94
                : 1),
    length =
      (0.86 + tier * 0.1) *
      (light
        ? 0.73
        : compact
          ? 0.83
          : tiger
            ? 1.08
            : variant === "churchill"
              ? 0.82
              : 1),
    roof =
      2.62 + tier * 0.035 - (compact ? 0.09 : variant === "t34" ? 0.08 : 0);
  model.cylinder(0.73 + tier * 0.07, 0.14, [0, 1.87, 0], METAL, [0, 0, 0], 16);
  if (tiger || variant === "t26" || variant === "7tp") {
    model.add(
      new THREE.CylinderGeometry(1, 1, roof - 1.96, tiger ? 24 : 16),
      ARMOR,
      [variant === "t26" ? 0.1 : 0, (roof + 1.96) / 2, 0],
      [0, 0, 0],
      [width, 1, length],
    );
    if (tiger) {
      model.softBox([1.42, 0.42, 0.38], [0, 2.31, -length - 0.12], PAINT, 0.04);
      for (const side of [-1, 1])
        model.box([0.04, 0.4, 0.2], [side * width, 2.25, -0.24], METAL);
    }
    if (variant === "7tp")
      model.box([0.87, 0.38, 0.42], [0, 2.27, -length - 0.13], PAINT);
  } else if (variant === "ctls") {
    model.add(
      weldedTurret(width, length, roof - 0.06, true),
      ARMOR,
      [0.25, 0, 0],
    );
    model.box([0.35, 0.12, 0.08], [0.72, 2.43, 0.42], DARK);
  } else if (cast) {
    model.add(
      new THREE.SphereGeometry(
        1,
        compact ? 12 : 16,
        8,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ),
      ARMOR,
      [0, 1.94, 0],
      [0, 0, 0],
      [width, roof - 1.94, length],
    );
    model.cylinder(width, 0.19, [0, 2.0, 0], ARMOR, [0, 0, 0], 16);
  } else {
    model.add(
      weldedTurret(width, length, roof, profile.turret === "box"),
      ARMOR,
    );
    model.box(
      [width * 1.22, 0.035, length * 0.86],
      [0, roof + 0.012, -0.12],
      PAINT,
    );
    if (profile.turret === "box")
      for (const side of [-1, 1])
        for (const z of [-0.45, 0, 0.45])
          model.box([0.035, 0.045, 0.045], [side * width, 2.34, z], EDGE);
  }
  model.softBox(
    [
      tiger ? 1.64 : (0.96 + tier * 0.1) * (light ? 0.68 : compact ? 0.8 : 1),
      tiger ? 0.63 : 0.53,
      tiger ? 0.3 : 0.36,
    ],
    [0, 2.29, tiger ? 1.04 : compact ? 0.72 : 0.84],
    0x727b54,
    cast ? 0.14 : 0.025,
  );
  model.cylinder(0.31, 0.22, [0, 2.3, 1.0], ARMOR, [Math.PI / 2, 0, 0], 12);
  const cupolaX = tiger
    ? -0.5
    : variant === "somua_s35"
      ? -0.4
      : variant === "ctls"
        ? 0.4
        : -0.28;
  const cupolaZ = tiger ? -0.48 : variant === "somua_s35" ? -0.34 : -0.15;
  model.cylinder(
    tiger ? 0.28 : 0.31,
    tiger ? 0.27 : 0.17,
    [cupolaX, roof - 0.03, cupolaZ],
    PAINT,
    [0, 0, 0],
    12,
  );
  model.cylinder(
    0.26,
    0.055,
    [cupolaX, roof + 0.08, cupolaZ],
    ARMOR,
    [0, 0, 0],
    12,
  );
  model.rod(
    [cupolaX - 0.13, roof + 0.13, cupolaZ],
    [cupolaX + 0.1, roof + 0.13, cupolaZ],
    0.025,
    EDGE,
  );
  if (variant === "somua_s35")
    model.sphere(0.245, [cupolaX, roof + 0.095, cupolaZ], ARMOR, [1, 0.68, 1]);
  if (variant === "t34")
    model.cylinder(
      0.26,
      0.065,
      [0.34, roof + 0.01, -0.18],
      PAINT,
      [0, 0, 0],
      12,
    );
  if (variant === "strv_m42") {
    model.softBox([1.15, 0.43, 0.55], [0, 2.25, -length], ARMOR, 0.035);
    for (const side of [-1, 1])
      model.box([0.12, 0.37, 0.7], [side * width * 0.83, 2.34, 0.04], PAINT, [
        0,
        side * 0.18,
        side * 0.16,
      ]);
  }
  if (variant === "m13_40" || variant === "lt38")
    for (const side of [-1, 1])
      for (const z of [-0.5, -0.2, 0.1, 0.4])
        model.box([0.035, 0.045, 0.045], [side * width * 0.93, 2.47, z], EDGE);
  model.box([0.27, 0.09, 0.16], [0.31, roof - 0.04, 0.18], DARK);
  model.box([0.2, 0.03, 0.12], [0.31, roof + 0.02, 0.18], 0x536d74);
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

function canvasRoof(
  model: ModelBuilder,
  tier: LandModelTier,
  profile: TruckModelProfile,
) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.015, 1.52);
  shape.lineTo(1.015, 1.52);
  shape.lineTo(1.015, 2.4);
  if (profile.canvas === "round") {
    shape.quadraticCurveTo(1.015, 2.85, 0, 2.85);
    shape.quadraticCurveTo(-1.015, 2.85, -1.015, 2.4);
  } else if (profile.canvas === "ridge") {
    shape.lineTo(0.64, 2.7);
    shape.lineTo(0, 2.85);
    shape.lineTo(-0.64, 2.7);
    shape.lineTo(-1.015, 2.4);
  } else {
    shape.lineTo(1.015, 2.72);
    shape.lineTo(-1.015, 2.72);
    shape.lineTo(-1.015, 2.4);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2.52 * Math.min(1, profile.bedLength),
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
    const canvasZ = -2.54 + (z + 2.54) * Math.min(1, profile.bedLength);
    const edge = profile.canvas === "flat" ? 2.7 : 2.73;
    for (const side of [-1, 1]) {
      model.rod(
        [side * 1.04, 1.52, canvasZ],
        [side * 1.04, 2.4, canvasZ],
        0.018,
        0x686d4e,
      );
      model.rod(
        [side * 1.04, 2.4, canvasZ],
        [side * 0.74, edge, canvasZ],
        0.018,
        0x686d4e,
      );
    }
    if (profile.canvas === "ridge") {
      model.rod([-0.74, edge, canvasZ], [0, 2.87, canvasZ], 0.018, 0x949773);
      model.rod([0, 2.87, canvasZ], [0.74, edge, canvasZ], 0.018, 0x949773);
    } else
      model.rod([-0.74, edge, canvasZ], [0.74, edge, canvasZ], 0.018, 0x949773);
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

function truckBody(tier: LandModelTier, profile: TruckModelProfile) {
  const model = new ModelBuilder();
  const variant = tier >= 2 ? profile.variant : undefined;
  const forwardCab = variant
    ? variant === "bedford_ql" || variant === "fiat626"
    : profile.cab === "flatnose";
  const squareCab = variant === "zis5" || variant === "ford_aa";
  const hoodLength =
    profile.hoodLength *
    (variant === "ford_aa" ? 1.13 : variant === "praga_rv" ? 0.9 : 1);
  const hoodWidth =
    variant === "ford_aa"
      ? 1.38
      : variant === "zis5"
        ? 1.5
        : variant === "opel_blitz"
          ? 1.61
          : variant === "polski_fiat621"
            ? 1.57
            : 1.75;
  const cabFront = forwardCab ? 2.48 : 2.53 - 1.08 * hoodLength;
  const cabMiddle = (0.25 + cabFront) / 2;
  const roof = 2.64 + (profile.cabHeight - 1) * 0.7;
  const windshield = cabFront + 0.07;
  const bedLength = 2.6 * Math.min(1, profile.bedLength);
  model.box([1.72, 0.25, 4.92], [0, 0.84, -0.1], METAL);
  for (const side of [-1, 1]) {
    model.box([0.13, 0.24, 4.45], [side * 0.62, 0.67, -0.15], DARK);
    for (const z of [-1.65, -0.7, 1.55]) fender(model, side * 1.04, z);
  }
  // Bonnet cabs and forward-control cabs share the existing wheelbase.
  const cab = new THREE.Shape();
  cab.moveTo(-0.99, 1.04);
  cab.lineTo(0.99, 1.04);
  cab.lineTo(1.0, 2.22);
  if (squareCab) {
    cab.lineTo(1, roof - 0.08);
    cab.lineTo(-1, roof - 0.08);
    cab.lineTo(-1, 2.22);
  } else if (forwardCab && variant !== "fiat626") {
    cab.lineTo(0.9, roof);
    cab.lineTo(-0.9, roof);
    cab.lineTo(-1, 2.22);
  } else {
    cab.quadraticCurveTo(1, roof, 0.59, roof);
    cab.lineTo(-0.59, roof);
    cab.quadraticCurveTo(-1, roof, -1, 2.22);
  }
  cab.closePath();
  const cabGeometry = new THREE.ExtrudeGeometry(cab, {
    depth: cabFront - 0.25,
    bevelEnabled: true,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    bevelSegments: 1,
    curveSegments: 5,
    steps: 1,
  });
  cabGeometry.translate(0, 0, 0.25);
  model.add(cabGeometry, ARMOR);
  if (forwardCab)
    model.softBox([1.73, 0.85, 0.17], [0, 1.47, 2.53], PAINT, 0.035);
  if (!forwardCab)
    model.add(
      sideProfile(
        [
          [cabFront, 1.15],
          [2.53, 1.15],
          [2.53, variant === "ford_aa" ? 1.81 : 1.67],
          [2.28, variant === "opel_blitz" ? 1.94 : 1.83],
          [cabFront, squareCab ? 1.88 : 1.93],
        ],
        hoodWidth,
        squareCab ? 0.025 : 0.07,
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
      [side * 0.43, 2.21, windshield],
      0x63868a,
    );
    model.add(
      new THREE.PlaneGeometry(forwardCab ? 1.15 : 0.64, 0.51),
      0x63868a,
      [side * 1.05, 2.18, cabMiddle],
      [0, (side * Math.PI) / 2, 0],
    );
    model.box([0.027, 0.85, 0.045], [side * 1.06, 1.75, 0.33], 0x4f5c40);
    model.box([0.035, 0.055, 0.19], [side * 1.07, 1.85, cabMiddle - 0.2], EDGE);
    model.box(
      [0.27, 0.11, forwardCab ? 2.1 : 1.6],
      [side * 1.04, 0.98, cabMiddle - 0.2],
      PAINT,
    );
    model.rod(
      [side * 0.92, 2.16, cabFront - 0.03],
      [side * 1.23, 2.33, cabFront - 0.05],
      0.025,
      METAL,
    );
    model.softBox(
      [0.1, 0.25, 0.16],
      [side * 1.25, 2.35, cabFront - 0.05],
      EDGE,
      0.02,
    );
    model.box(
      [0.015, 0.18, 0.11],
      [side * 1.31, 2.35, cabFront - 0.05],
      0x536d74,
    );
    model.sphere(0.12, [side * 0.82, 1.61, 2.63], 0xd8cb9e, [1, 1, 0.75]);
    model.rod(
      [side * 0.83, 1.47, 2.52],
      [side * 0.83, 1.65, 2.51],
      0.035,
      METAL,
    );
    for (const z of [1.7, 1.86, 2.02, 2.18])
      model.box(
        [0.025, 0.19, 0.055],
        [side * (forwardCab ? 1.05 : hoodWidth / 2 + 0.035), 1.57, z],
        DARK,
      );
    model.box([0.32, 0.42, 0.055], [side * 0.97, 0.56, -2.24], TRACK);
    model.sphere(0.055, [side * 0.85, 1.28, -2.62], 0xa35f43);
  }
  model.box([0.055, 0.62, 0.04], [0, 2.19, windshield + 0.04], PAINT);
  for (const x of [-0.43, 0.43])
    model.rod(
      [x, 1.98, windshield + 0.04],
      [x + 0.17, 2.36, windshield + 0.04],
      0.015,
      METAL,
    );
  const grilleWidth =
    variant === "ford_aa"
      ? 0.8
      : variant === "opel_blitz"
        ? 0.96
        : variant === "zis5"
          ? 1.04
          : 1.27;
  const grilleHeight =
    variant === "ford_aa" || variant === "opel_blitz" || variant === "zis5"
      ? 0.71
      : variant === "fiat626"
        ? 0.67
        : 0.5;
  const grilleY = grilleHeight > 0.6 ? 1.56 : 1.48;
  model.softBox(
    [grilleWidth, grilleHeight, 0.09],
    [0, grilleY, 2.61],
    METAL,
    variant === "fiat626" ? 0.04 : 0.045,
  );
  if (
    variant === "bedford_ql" ||
    variant === "praga_rv" ||
    variant === "volvo_tlv" ||
    variant === "daf_trado"
  ) {
    for (const y of [1.29, 1.39, 1.49, 1.59, 1.69])
      model.box([1.15, 0.035, 0.1], [0, y, 2.65], EDGE);
  } else {
    for (
      let x = -grilleWidth * 0.4;
      x <= grilleWidth * 0.41;
      x += grilleWidth / 7
    )
      model.box([0.035, grilleHeight - 0.1, 0.1], [x, grilleY, 2.65], EDGE);
  }
  if (variant === "opel_blitz") {
    model.cylinder(0.12, 0.035, [0, 1.99, 2.57], EDGE, [Math.PI / 2, 0, 0], 12);
    model.box([0.44, 0.035, 0.035], [0, 1.99, 2.595], EDGE, [0, 0, 0.14]);
  } else if (variant === "bedford_ql") {
    model.cylinder(0.35, 0.09, [0, roof + 0.035, 1.25], PAINT, [0, 0, 0], 12);
    model.box([0.45, 0.045, 0.15], [0, roof + 0.1, 1.25], METAL);
  } else if (variant === "laffly_s20tl") {
    // Small obstacle rollers ahead of the axle are a Laffly recognition feature.
    for (const side of [-1, 1]) {
      model.cylinder(
        0.18,
        0.16,
        [side * 0.66, 0.43, 2.52],
        TRACK,
        [0, 0, Math.PI / 2],
        10,
      );
      model.rod(
        [side * 0.66, 0.43, 2.48],
        [side * 0.66, 0.84, 2.24],
        0.05,
        METAL,
      );
      model.cylinder(
        0.16,
        0.15,
        [side * 0.93, 0.39, 0.05],
        TRACK,
        [0, 0, Math.PI / 2],
        10,
      );
    }
  } else if (variant === "fiat626") {
    model.box([0.065, 0.7, 0.06], [0, 1.56, 2.7], PAINT);
    model.softBox([0.36, 0.14, 0.05], [0, 1.99, 2.59], EDGE, 0.035);
  } else if (variant === "polski_fiat621") {
    model.box([0.46, 0.11, 0.04], [0, 1.91, 2.64], PAINT);
    for (const side of [-1, 1])
      model.box([0.035, 0.55, 0.1], [side * 0.67, 1.55, 2.61], PAINT);
  } else if (variant === "daf_trado") {
    for (const side of [-1, 1]) {
      model.rod(
        [side * 1.21, 0.58, -1.65],
        [side * 1.21, 0.58, -0.7],
        0.09,
        PAINT,
      );
      model.cylinder(
        0.17,
        0.07,
        [side * 1.25, 0.58, -1.18],
        METAL,
        [0, 0, Math.PI / 2],
        10,
      );
    }
  }
  model.box([2.26, 0.15, 0.21], [0, 0.99, 2.64], METAL);
  model.box([0.5, 0.12, 0.025], [0, 1.08, 2.76], 0xb7b29a);
  if (!forwardCab)
    model.box(
      [0.035, 0.035, 2.53 - cabFront],
      [0, 1.96, (2.53 + cabFront) / 2],
      EDGE,
    );
  model.box([2.08, 0.22, bedLength], [0, 1.25, -2.54 + bedLength / 2], WOOD);
  if (tier === 0) {
    for (const side of [-1, 1]) {
      for (const y of [1.47, 1.69, 1.91])
        model.box([0.08, 0.15, 2.55], [side * 1.015, y, -1.24], WOOD);
      for (const z of [-2.43, -1.2, -0.05])
        model.box([0.1, 0.78, 0.09], [side * 1.03, 1.64, z], METAL);
    }
    for (const z of [-1.88, -0.66])
      model.softBox([1.52, 0.49, 0.79], [0, 1.62, z], 0x9a8058, 0.055);
  } else if (tier < 3 || variant) {
    canvasRoof(model, tier, profile);
    if (tier === 3)
      for (const side of [-1, 1]) {
        model.softBox(
          [0.31, 0.43, 0.34],
          [side * 0.68, 3.03, -0.5],
          PAINT,
          0.025,
        );
        model.rod(
          [side * 0.79, 3.27, -0.5],
          [side * 0.57, 3.27, -0.5],
          0.025,
          METAL,
        );
      }
  } else {
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
  const spareSide = profile.spare === "side";
  model.cylinder(
    0.36,
    0.16,
    spareSide ? [1.13, 1.79, -0.26] : [0, 2.13, -2.56],
    TRACK,
    spareSide ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
    12,
  );
  model.cylinder(
    0.19,
    0.19,
    spareSide ? [1.13, 1.79, -0.26] : [0, 2.13, -2.56],
    PAINT,
    spareSide ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
    10,
  );
  return model.build();
}

function artilleryBase(tier: LandModelTier, profile: ArtilleryModelProfile) {
  const model = new ModelBuilder();
  const variant = tier >= 2 ? profile.variant : undefined;
  const boxTrail =
    variant === "25pdr" || variant === "canon75" || variant === "cannone75_27";
  const trailSpread = boxTrail
    ? 0.31 * profile.trailWidth
    : Math.min(1.03, 0.88 + (profile.trailWidth - 0.92) * 0.94);
  model.cylinder(0.115, 2.16, [0, 0.69, 0], METAL, [0, 0, Math.PI / 2], 10);
  for (const side of [-1, 1]) {
    model.rod(
      [side * 0.28, 0.77, -0.05],
      [side * trailSpread, 0.2, -2.49],
      0.105,
      ARMOR,
    );
    model.rod(
      [side * 0.33, 0.59, -0.17],
      [side * (trailSpread - 0.07), 0.13, -2.44],
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
      [side * trailSpread, 0.1, -2.47],
    );
    model.rod(
      [side * 0.79, 0.69, -0.05],
      [side * 0.42, 1.45, -0.28],
      0.065,
      PAINT,
    );
  }
  const half = Math.min(
      1.065,
      (0.84 + tier * 0.075) *
        profile.shieldWidth *
        (variant === "canon75" ? 0.84 : variant === "skoda100" ? 0.92 : 1),
    ),
    top = Math.max(
      1.99,
      (2.06 + tier * 0.035) *
        profile.shieldHeight *
        (variant === "25pdr" ? 0.95 : variant === "bofors75" ? 1.04 : 1),
    );
  const shieldStyle =
    variant === "lefh18" || variant === "25pdr"
      ? "box"
      : variant === "zis3"
        ? "sloped"
        : profile.shield;
  const shield = new THREE.Shape();
  shield.moveTo(-half, 0.79);
  shield.lineTo(half, 0.79);
  if (shieldStyle === "split") {
    // Separate upper wings leave a clear vertical slot around the recoil axis.
    shield.lineTo(half, top - 0.12);
    shield.lineTo(half * 0.86, top);
    shield.lineTo(0.31, top);
    shield.lineTo(0.31, 1.41);
    shield.lineTo(-0.31, 1.41);
    shield.lineTo(-0.31, top);
    shield.lineTo(-half * 0.86, top);
    shield.lineTo(-half, top - 0.12);
  } else {
    const shoulder = shieldStyle === "box" ? 0.075 : 0.28;
    const upperWidth = shieldStyle === "box" ? 0.92 : 0.67;
    shield.lineTo(half, top - shoulder);
    shield.lineTo(half * upperWidth, top);
    shield.lineTo(-half * upperWidth, top);
    shield.lineTo(-half, top - shoulder);
    const aperture = new THREE.Path();
    aperture.absarc(0, 1.67, 0.245, 0, Math.PI * 2, true);
    shield.holes.push(aperture);
  }
  shield.closePath();
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
  if (variant === "25pdr") {
    // The circular ground platform and narrow box trail define the 25-pounder.
    model.add(
      new THREE.TorusGeometry(0.94, 0.055, 4, 20),
      METAL,
      [0, 0.09, -0.58],
      [Math.PI / 2, 0, 0],
    );
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = (spoke * Math.PI) / 4;
      model.rod(
        [0, 0.09, -0.58],
        [Math.cos(angle) * 0.91, 0.09, -0.58 + Math.sin(angle) * 0.91],
        0.027,
        PAINT,
      );
    }
    model.box([0.67, 0.22, 1.55], [0, 0.41, -1.62], ARMOR);
  } else if (variant === "lefh18") {
    model.cylinder(
      0.21,
      1.15,
      [0, 1.31, -0.32],
      PAINT,
      [Math.PI / 2, 0, 0],
      12,
    );
    for (const side of [-1, 1]) {
      model.box([0.22, 0.61, 0.12], [side * (half - 0.08), 0.68, 0.19], ARMOR);
      model.rod(
        [side * 0.28, 0.88, -0.5],
        [side * 0.76, 0.33, -2.13],
        0.085,
        PAINT,
      );
    }
  } else if (variant === "canon75" || variant === "cannone75_27") {
    model.box([0.64, 0.2, 1.95], [0, 0.43, -1.43], ARMOR);
    const wooden = variant === "canon75";
    for (const side of [-1, 1])
      for (let spoke = 0; spoke < (wooden ? 10 : 8); spoke++) {
        const angle = (spoke * Math.PI * 2) / (wooden ? 10 : 8);
        model.rod(
          [side * 1.23, 0.7, 0],
          [side * 1.23, 0.7 + Math.cos(angle) * 0.49, Math.sin(angle) * 0.49],
          0.012,
          wooden ? WOOD : PAINT,
        );
      }
    if (!wooden) model.box([0.8, 0.33, 0.1], [0, 0.62, 0.32], PAINT);
  } else if (variant === "zis3") {
    for (const side of [-1, 1]) {
      model.box([0.43, 0.43, 0.07], [side * 0.68, 1.98, 0.31], PAINT, [
        0,
        side * 0.12,
        0,
      ]);
      model.rod(
        [side * 0.2, 1.08, -0.4],
        [side * 0.66, 0.32, -2.14],
        0.055,
        METAL,
      );
    }
  } else if (variant === "skoda100") {
    model.cylinder(
      0.25,
      1.23,
      [0, 1.15, -0.45],
      ARMOR,
      [Math.PI / 2, 0, 0],
      12,
    );
    model.box([1.02, 0.31, 0.18], [0, 0.76, -1.94], PAINT);
  } else if (variant === "bofors75") {
    for (const side of [-1, 1]) {
      model.cylinder(
        0.105,
        0.76,
        [side * 0.31, 1.23, -0.55],
        PAINT,
        [Math.PI / 2, 0, 0],
        10,
      );
      model.box([0.25, 0.36, 0.1], [side * 0.77, 1.79, 0.34], ARMOR);
    }
  }
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

export type VehicleModelPart =
  | "tankHull"
  | "truckBody"
  | "artilleryBase"
  | "tankTurret"
  | "tankBarrel"
  | "artilleryBarrel"
  | "wheels"
  | "tracks";

/** Build only the requested batch so country banks can share rig-only parts. */
export function createVehicleModelGeometry(
  part: VehicleModelPart,
  tier: LandModelTier = 0,
  profile: NationalModelProfile = DEFAULT_COUNTRY_MODEL_PROFILE,
) {
  switch (part) {
    case "tankHull":
      return tankHull(tier, profile.tank);
    case "truckBody":
      return truckBody(tier, profile.truck);
    case "artilleryBase":
      return artilleryBase(tier, profile.artillery);
    case "tankTurret":
      return tankTurret(tier, profile.tank);
    case "tankBarrel":
      return tankBarrel(tier);
    case "artilleryBarrel":
      return artilleryBarrel(tier);
    case "wheels":
      return wheels();
    case "tracks":
      return tracks();
  }
}

/** Four research stages of original national silhouettes, sharing one rig. */
export function createVehicleModelGeometries(
  tier: LandModelTier,
  profile: NationalModelProfile = DEFAULT_COUNTRY_MODEL_PROFILE,
) {
  return {
    tankHull: tankHull(tier, profile.tank),
    truckBody: truckBody(tier, profile.truck),
    artilleryBase: artilleryBase(tier, profile.artillery),
    tankTurret: tankTurret(tier, profile.tank),
    tankBarrel: tankBarrel(tier),
    artilleryBarrel: artilleryBarrel(tier),
    wheels: wheels(),
    tracks: tracks(),
  };
}
