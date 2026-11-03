import * as THREE from "three";
import {
  ModelBuilder,
  type LandModelTier,
  type XYZ,
  CLOTH,
  CLOTH_LIGHT,
  HELMET,
  LEATHER,
  METAL,
  SKIN,
  BOOT,
  WOOD,
  FABRIC,
} from "./map3d-model-builder";
import type { InfantryModelProfile } from "./map3d-national-profiles";
import { createM40HelmetShell } from "./map3d-helmet-shell";

// Accessories keep their own cloth/fur colors instead of inheriting coat dye.
const FUR = 0x706d60;
function scarfColor(profile: InfantryModelProfile) {
  return profile.helmet === "adrian"
    ? 0x8d9677
    : profile.helmet === "brodie"
      ? 0x68704f
      : 0x777d78;
}

// The figure is roughly seven heads tall. Cloth is a continuous curved surface;
// straps, seams and equipment sit on that surface instead of forming its anatomy.
export function infantryBody(
  tier: LandModelTier,
  profile?: InfantryModelProfile,
) {
  const m = new ModelBuilder(FABRIC);
  const battledress = profile?.tunic === "battledress";
  const capote = profile?.tunic === "capote";
  const blouse = profile?.tunic === "gymnastiorka";
  const winter = profile?.headwear === "ushanka";
  const sleeve = winter ? 1.08 : 1;
  const hem = profile
    ? 2.18 -
      (2.18 - (capote ? 1.21 : battledress ? 1.97 : 1.68)) * profile.coatLength
    : 1.72;
  if (battledress) {
    // High-waisted trousers fill the space below the short battledress blouse.
    // This section stays with the torso while the two thighs articulate below.
    m.loft(
      [
        [1.7, 0.46, 0.265],
        [1.81, 0.46, 0.28],
        [2.16, 0.43, 0.25],
      ],
      CLOTH,
      16,
    );
  }
  m.loft(
    [
      [
        hem,
        capote ? (winter ? 0.62 : 0.59) : battledress ? 0.46 : 0.48,
        capote ? (winter ? 0.36 : 0.34) : 0.29,
        0,
        -0.015,
      ],
      [hem + (2.18 - hem) * 0.22, capote ? 0.565 : 0.5, capote ? 0.33 : 0.3],
      [hem + (2.18 - hem) * 0.62, capote ? 0.51 : 0.47, 0.275],
      [2.18, 0.435, 0.25],
      [
        2.34,
        blouse || battledress || winter ? 0.49 : 0.45,
        winter ? 0.29 : 0.265,
        0,
        -0.005,
      ],
      [
        2.58,
        winter ? 0.535 : blouse ? 0.515 : 0.485,
        winter ? 0.315 : 0.29,
        0,
        -0.015,
      ],
      [
        2.82,
        winter ? 0.55 : blouse ? 0.53 : 0.51,
        winter ? 0.335 : 0.31,
        0,
        -0.025,
      ],
      [3.02, winter ? 0.555 : 0.535, winter ? 0.31 : 0.285, 0, -0.025],
      [3.12, 0.46, 0.235],
      [3.23, 0.23, 0.17],
      [3.28, 0.16, 0.145],
    ],
    CLOTH,
    16,
  );
  // Jacket placket, turned collar and gently rolled pocket flaps.
  m.ribbon(
    blouse
      ? [
          [0, 2.74, 0.295],
          [0, 2.98, 0.28],
          [0, 3.15, 0.2],
        ]
      : [
          [0, hem + 0.06, capote ? 0.342 : 0.298],
          [0, 2.17, 0.258],
          [0, 2.56, 0.285],
          [0, 2.98, 0.28],
          [0, 3.15, 0.2],
        ],
    0.035,
    0x4e5740,
  );
  if (profile?.collar === "stand") {
    m.loft(
      [
        [3.17, 0.205, 0.175],
        [3.29, 0.18, 0.16],
      ],
      CLOTH_LIGHT,
      12,
    );
  }
  if (winter) {
    m.loft(
      [
        [3.12, 0.26, 0.21],
        [3.24, 0.235, 0.195],
        [3.3, 0.2, 0.17],
      ],
      FUR,
      12,
    );
    for (const side of [-1, 1])
      m.ribbon(
        [
          [side * 0.17, 3.24, 0.2],
          [side * 0.27, 3.1, 0.27],
          [side * 0.14, 2.96, 0.325],
        ],
        0.14,
        FUR,
      );
  }
  if (profile?.scarf) {
    const color = scarfColor(profile);
    // The lower wrap overlaps the head-local scarf around the neck pivot.
    m.loft(
      [
        [3.14, 0.22, 0.19],
        [3.25, 0.19, 0.17],
        [3.32, 0.17, 0.15],
      ],
      color,
      12,
    );
    m.profile(
      [
        [-0.23, 0.17],
        [0.22, 0.17],
        [0.14, -0.03],
        [-0.025, -0.25],
      ],
      0.035,
      [0, 3.04, 0.255],
      color,
    );
    m.ribbon(
      [
        [-0.14, 3.18, 0.28],
        [-0.06, 3.02, 0.29],
        [-0.025, 2.83, 0.28],
      ],
      0.019,
      0x626b5c,
    );
  }
  if (profile?.chestCanister) {
    // Fluted gas-mask canister slung across the upper chest, behind the rifle.
    m.ribbon(
      [
        [-0.36, 3.13, 0.15],
        [-0.33, 2.99, 0.3],
        [-0.35, 2.82, 0.43],
      ],
      0.045,
      LEATHER,
    );
    m.cylinder(0.09, 0.52, [-0.17, 2.84, 0.4], HELMET, [0, 0, Math.PI / 2], 12);
    for (const x of [-0.42, -0.27, -0.07, 0.08])
      m.cylinder(0.098, 0.016, [x, 2.84, 0.4], HELMET, [0, 0, Math.PI / 2], 8);
    m.box([0.075, 0.025, 0.12], [0.06, 2.935, 0.4], METAL);
  }
  if (capote) {
    // The overlapping front and flared knee-length skirts remain cloth surfaces.
    m.ribbon(
      [
        [0.16, hem + 0.04, 0.32],
        [0.17, 1.6, 0.31],
        [0.15, 2.16, 0.255],
        [0.2, 2.85, 0.27],
      ],
      0.075,
      CLOTH_LIGHT,
    );
    for (const side of [-1, 1]) {
      m.ribbon(
        [
          [side * 0.46, hem + 0.1, 0.22],
          [side * 0.39, 1.65, 0.235],
          [side * 0.33, 2.03, 0.225],
        ],
        0.025,
        0x4e5740,
      );
    }
  }
  for (const side of [-1, 1]) {
    if (profile?.collar !== "stand")
      m.ribbon(
        [
          [side * 0.15, 3.29, 0.13],
          [side * (profile?.collar === "open" ? 0.29 : 0.25), 3.16, 0.215],
          [side * 0.14, profile?.collar === "open" ? 2.94 : 3.04, 0.295],
        ],
        0.13,
        CLOTH_LIGHT,
      );
    for (const [y, halfWidth, height, z] of [
      [2.84, 0.145, 0.13, 0.256],
      [1.96, 0.16, 0.15, 0.25],
    ]) {
      if ((battledress || blouse || capote) && y < 2.2) continue;
      if (capote && y > 2.2) continue;
      m.loft(
        [
          [y - height, halfWidth * 0.8, 0.025, side * 0.275, z],
          [y - height * 0.6, halfWidth, 0.042, side * 0.275, z],
          [y + height * 0.65, halfWidth, 0.042, side * 0.275, z],
          [y + height, halfWidth * 0.95, 0.025, side * 0.275, z],
        ],
        CLOTH_LIGHT,
        8,
      );
      m.ribbon(
        [
          [side * 0.275 - halfWidth, y + height * 0.64, z + 0.04],
          [side * 0.275, y + height * 0.35, z + 0.052],
          [side * 0.275 + halfWidth, y + height * 0.64, z + 0.04],
        ],
        0.045,
        CLOTH,
        [0, 1, 0],
      );
    }
    // Shoulder seams and folds follow the rounded sleeve rather than floating.
    m.ribbon(
      [
        [side * 0.34, 3.15, 0.11],
        [side * 0.52, 3.08, 0.09],
        [side * 0.62, 2.98, 0.06],
      ],
      0.075,
      CLOTH_LIGHT,
      [0, 0, 1],
    );
  }
  m.loft(
    [
      [2.12, 0.452, 0.268],
      [2.235, 0.45, 0.267],
    ],
    battledress ? CLOTH_LIGHT : LEATHER,
    16,
  );
  // Leather suspenders bend over shoulders and down the back of the tunic.
  for (const side of [-1, 1]) {
    const strapColor = battledress ? CLOTH_LIGHT : LEATHER;
    const crossed = profile?.webbing === "cross";
    if (profile?.webbing !== "belt")
      m.ribbon(
        [
          [side * (crossed ? -0.32 : 0.32), 2.2, 0.23],
          [side * (crossed ? -0.1 : 0.3), 2.58, 0.29],
          [side * (crossed ? 0.18 : 0.33), 2.92, 0.29],
          [side * 0.35, 3.13, 0.12],
          [side * 0.34, 3.15, -0.16],
          [side * 0.27, 2.8, -0.32],
          [side * (crossed ? -0.25 : 0.25), 2.23, -0.25],
        ],
        battledress ? 0.1 : 0.074,
        strapColor,
      );
    const x = side * 0.34;
    m.loft(
      [
        [battledress ? 2.07 : 2.16, battledress ? 0.13 : 0.112, 0.07, x, 0.32],
        [
          battledress ? 2.11 : 2.19,
          battledress ? 0.165 : 0.14,
          battledress ? 0.12 : 0.09,
          x,
          0.33,
        ],
        [
          battledress ? 2.47 : 2.4,
          battledress ? 0.165 : 0.14,
          battledress ? 0.12 : 0.09,
          x,
          0.33,
        ],
        [battledress ? 2.51 : 2.45, battledress ? 0.14 : 0.11, 0.075, x, 0.33],
      ],
      strapColor,
      8,
    );
    m.ribbon(
      [
        [x - 0.115, battledress ? 2.47 : 2.39, battledress ? 0.45 : 0.41],
        [x, battledress ? 2.42 : 2.34, battledress ? 0.465 : 0.428],
        [x + 0.115, battledress ? 2.47 : 2.39, battledress ? 0.45 : 0.41],
      ],
      0.07,
      battledress ? CLOTH : 0x6a5136,
      [0, 1, 0],
    );
  }
  // A canvas knapsack with leather fastening and a rolled blanket.
  const packWidth = profile?.packWidth ?? 1;
  const packExpansion = Math.max(0, packWidth - 1);
  const packDepth = 0.18 + tier * 0.012 + packExpansion * 0.25;
  const roll = profile?.pack === "roll";
  m.loft(
    [
      [
        roll ? 2.25 : 2.34 - packExpansion * 1.2,
        (roll ? 0.15 : 0.26) * packWidth,
        packDepth * 0.75,
        0,
        -0.41,
      ],
      [2.4, (roll ? 0.21 : 0.33) * packWidth, packDepth, 0, -0.42],
      [2.89, (roll ? 0.21 : 0.33) * packWidth, packDepth, 0, -0.42],
      [
        roll ? 3.09 : 3.02 + packExpansion * 0.6,
        (roll ? 0.15 : 0.26) * packWidth,
        packDepth * 0.72,
        0,
        -0.42,
      ],
    ],
    0x8a8966,
    12,
  );
  if (profile?.pack === "blanket") {
    m.limb(
      [
        [-0.42, 2.26, -0.4, 0.12, 0.12],
        [-0.43, 2.74, -0.44, 0.13, 0.13],
        [-0.31, 3.05, -0.43, 0.13, 0.13],
        [0, 3.13, -0.42, 0.13, 0.13],
        [0.31, 3.05, -0.43, 0.13, 0.13],
        [0.43, 2.74, -0.44, 0.13, 0.13],
        [0.42, 2.26, -0.4, 0.12, 0.12],
      ],
      CLOTH_LIGHT,
      10,
    );
  } else if (!roll) {
    m.ellipsoid(
      [0.37 * packWidth, 0.125, 0.14],
      [0, 3.055 + packExpansion * 0.6, -0.42],
      CLOTH_LIGHT,
      12,
    );
  }
  for (const x of [-0.22, 0.22]) {
    m.ribbon(
      [
        [x, 2.34, -0.54],
        [x, 2.55, -0.43 - packDepth],
        [x, 2.88, -0.43 - packDepth],
        [x, 3.07, -0.56],
        [x, 3.16, -0.43],
      ],
      0.055,
      LEATHER,
    );
  }
  m.ellipsoid([0.14, 0.21, 0.095], [-0.47, 2.12, -0.2], 0x536153, 10);
  m.cylinder(0.045, 0.07, [-0.47, 2.35, -0.2], METAL);
  m.ellipsoid([0.16, 0.105, 0.07], [0.28, 2.52, -0.63], 0x747e70, 10);
  m.rod([0.5, 2.69, -0.27], [0.5, 2.1, -0.29], 0.03, WOOD);
  m.profile(
    [
      [-0.11, 0.1],
      [0.11, 0.1],
      [0.1, -0.08],
      [0, -0.17],
      [-0.1, -0.08],
    ],
    0.025,
    [0.5, 1.99, -0.29],
    METAL,
  );
  // Sleeves taper from deltoid to elbow to cuff, with continuous round elbows.
  m.limb(
    [
      [0.48, 3.02, -0.015, 0.2 * sleeve, 0.21 * sleeve],
      [0.61, 2.91, 0.04, 0.215 * sleeve, 0.21 * sleeve],
      [0.7, 2.69, 0.16, 0.18 * sleeve, 0.18 * sleeve],
      [0.69, 2.57, 0.29, 0.17 * sleeve, 0.17 * sleeve],
      [0.58, 2.61, 0.43, 0.16 * sleeve, 0.16 * sleeve],
      [0.47, 2.69, 0.54, 0.12 * sleeve, 0.12 * sleeve],
    ],
    CLOTH,
    12,
  );
  m.limb(
    [
      [-0.48, 3.02, -0.015, 0.2 * sleeve, 0.21 * sleeve],
      [-0.61, 2.9, 0.04, 0.21 * sleeve, 0.21 * sleeve],
      [-0.61, 2.66, 0.18, 0.18 * sleeve, 0.18 * sleeve],
      [-0.52, 2.52, 0.33, 0.17 * sleeve, 0.17 * sleeve],
      [-0.29, 2.56, 0.59, 0.165 * sleeve, 0.16 * sleeve],
      [-0.04, 2.64, 0.85, 0.14 * sleeve, 0.14 * sleeve],
      [0.19, 2.71, 1.03, 0.115 * sleeve, 0.115 * sleeve],
    ],
    CLOTH,
    12,
  );
  m.limb(
    [
      [0.5, 2.66, 0.51, 0.126, 0.126],
      [0.45, 2.7, 0.56, 0.123, 0.123],
    ],
    CLOTH_LIGHT,
    10,
  );
  m.limb(
    [
      [0.12, 2.69, 0.98, 0.122, 0.122],
      [0.2, 2.72, 1.04, 0.116, 0.116],
    ],
    CLOTH_LIGHT,
    10,
  );
  hand(m, [0.43, 2.735, 0.61], false);
  hand(m, [0.31, 2.755, 1.1], true);
  rifle(m, tier);
  if (tier >= 1) {
    m.loft(
      [
        [1.98, 0.14, 0.065, -0.5, -0.02],
        [2.08, 0.17, 0.1, -0.5, -0.02],
        [2.32, 0.16, 0.09, -0.5, -0.02],
      ],
      0x8a8966,
      8,
    );
  }
  if (tier >= 2) {
    m.loft(
      [
        [2.4, 0.11, 0.1, -0.29, -0.64],
        [2.77, 0.13, 0.1, -0.29, -0.64],
        [2.83, 0.1, 0.08, -0.29, -0.64],
      ],
      0x48553d,
      8,
    );
    m.rod([-0.3, 2.81, -0.64], [-0.3, 3.22, -0.64], 0.012, METAL);
  }
  if (tier === 3) {
    for (const x of [-0.39, -0.19])
      m.ellipsoid([0.055, 0.1, 0.055], [x, 2.35, 0.45], HELMET, 8);
  }
  return m.build();
}

function hand(m: ModelBuilder, p: XYZ, support: boolean) {
  const [x, y, z] = p;
  m.ellipsoid([0.105, 0.095, 0.13], p, SKIN, 10);
  m.ellipsoid(
    [0.055, 0.045, 0.09],
    [x + (support ? -0.07 : 0.065), y + 0.065, z - 0.015],
    SKIN,
    8,
  );
  for (let i = 0; i < 3; i++) {
    m.ellipsoid(
      [0.027, 0.057, 0.064],
      [x + (i - 1) * 0.055, y - 0.025, z + 0.08],
      SKIN,
      6,
    );
  }
}

function rifle(m: ModelBuilder, tier: LandModelTier) {
  // Stock profile is drawn in the z/y plane; barrel endpoints match firing FX.
  const shape = new THREE.Shape();
  const outline = [
    [-0.16, 2.61],
    [-0.17, 2.86],
    [0.14, 2.88],
    [0.48, 2.82],
    [1.35, 2.82],
    [1.35, 2.91],
    [0.45, 2.93],
    [0.12, 2.95],
    [-0.18, 2.94],
  ];
  outline.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const stock = new THREE.ExtrudeGeometry(shape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.015,
    bevelSegments: 2,
    steps: 1,
  });
  m.add(stock, WOOD, [0.435, 0, 0], [0, -Math.PI / 2, 0]);
  m.cylinder(0.039, 1.54, [0.37, 2.9, 1.2], METAL, [Math.PI / 2, 0, 0], 10);
  m.cylinder(0.055, 0.33, [0.37, 2.9, 0.55], METAL, [Math.PI / 2, 0, 0], 8);
  m.softBox(
    [0.1, 0.12 + tier * 0.048, 0.19 + tier * 0.035],
    [0.37, 2.74 - tier * 0.024, 0.71],
    METAL,
    0.02,
  );
  if (tier >= 1)
    m.softBox([0.13, 0.12, 0.34], [0.37, 2.89, 0.65], METAL, 0.025);
  if (tier >= 2) {
    m.cylinder(0.073, 0.68, [0.37, 2.9, 1.4], METAL, [Math.PI / 2, 0, 0], 10);
    for (const z of [1.17, 1.34, 1.51, 1.68])
      m.box([0.016, 0.035, 0.055], [0.445, 2.9, z], 0x19251f);
  }
  if (tier === 3) {
    m.cylinder(0.14, 0.13, [0.37, 2.64, 0.74], METAL, [0, 0, Math.PI / 2], 12);
    m.rod([0.31, 2.87, 1.63], [0.25, 2.68, 1.28], 0.018, METAL);
    m.rod([0.43, 2.87, 1.63], [0.49, 2.68, 1.28], 0.018, METAL);
  }
}

export function infantryLeg(
  tier: LandModelTier,
  profile?: InfantryModelProfile,
) {
  const m = new ModelBuilder(FABRIC);
  const jackboots = profile?.boots === "jackboots";
  const puttees = profile?.boots === "puttees";
  const breeches = profile?.tunic === "gymnastiorka";
  // Full length trousers narrow naturally through the knee into boot gaiters.
  m.loft(
    [
      [-1.25, 0.137, 0.14, 0, 0.01],
      [-1.15, 0.15, 0.16],
      [-1.01, 0.158, 0.17, 0.008, -0.01],
      [-0.89, 0.175, 0.18, 0.01, 0.015],
      [-0.78, 0.18, 0.195, 0.006, 0.035],
      [-0.64, 0.175, 0.18, 0, 0.02],
      [-0.44, breeches ? 0.245 : 0.215, 0.215],
      [-0.18, breeches ? 0.26 : 0.235, 0.24, 0, -0.01],
      [0.08, 0.225, 0.225],
    ],
    CLOTH,
    12,
  );
  m.loft(
    [
      [-1.43, 0.155, 0.17, 0, 0.025],
      [-1.29, 0.16, 0.17],
      [
        jackboots ? -0.92 : -1.12,
        jackboots ? 0.177 : 0.155,
        jackboots ? 0.185 : 0.16,
      ],
      [
        jackboots ? -0.8 : puttees ? -0.91 : -1.05,
        jackboots ? 0.19 : 0.16,
        jackboots ? 0.2 : 0.165,
      ],
    ],
    profile
      ? jackboots
        ? BOOT
        : CLOTH_LIGHT
      : tier >= 2
        ? LEATHER
        : CLOTH_LIGHT,
    12,
  );
  // The leather instep flows into a round toe; a thin sole sets exact foot contact.
  m.loft(
    [
      [-1.62, 0.19, 0.295, 0, 0.12],
      [-1.55, 0.185, 0.29, 0, 0.12],
      [-1.45, 0.175, 0.25, 0, 0.105],
      [-1.35, 0.15, 0.17, 0, 0.035],
    ],
    BOOT,
    12,
  );
  m.loft(
    [
      [-1.66, 0.193, 0.3, 0, 0.12],
      [-1.615, 0.195, 0.302, 0, 0.12],
    ],
    0x282b25,
    12,
  );
  m.ribbon(
    [
      [0.173, -0.13, 0.155],
      [0.167, -0.4, 0.142],
      [0.14, -0.63, 0.14],
      [0.146, -0.82, 0.159],
      [0.124, -1.02, 0.125],
    ],
    0.014,
    0x596344,
    [0, 0, 1],
  );
  for (const y of jackboots
    ? [-0.84]
    : puttees
      ? [-0.98, -1.06, -1.14, -1.22, -1.3, -1.38]
      : [-1.14, -1.24, -1.34])
    m.ribbon(
      [
        [-0.075, y, 0.148],
        [0, y - 0.022, 0.174],
        [0.075, y, 0.148],
      ],
      0.02,
      profile
        ? jackboots
          ? LEATHER
          : 0x686d4e
        : tier >= 2
          ? 0x6a5136
          : 0x686d4e,
      [0, 1, 0],
    );
  for (const y of [-1.42, -1.48])
    m.ribbon(
      [
        [-0.055, y, 0.265],
        [0.055, y - 0.015, 0.265],
      ],
      0.012,
      0x554a38,
      [0, 1, 0],
    );
  return m.build();
}

export function infantryDetails(
  tier: LandModelTier,
  profile?: InfantryModelProfile,
) {
  const m = new ModelBuilder(FABRIC);
  const capote = profile?.tunic === "capote";
  const battledress = profile?.tunic === "battledress";
  for (const [y, z] of [
    [2.4, 0.274],
    [2.61, 0.3],
    [2.82, 0.291],
    [3.01, 0.27],
  ]) {
    if (profile?.tunic === "gymnastiorka" && y < 2.82) continue;
    if (battledress && y < 3.01) continue;
    for (const x of capote ? [-0.12, 0.12] : [0])
      m.ellipsoid([0.022, 0.022, 0.009], [x, y, z], 0xb5ac89, 6);
  }
  m.softBox([0.145, 0.095, 0.024], [0, 2.18, 0.278], 0x9f9b76, 0.014);
  m.box([0.08, 0.043, 0.026], [0, 2.18, 0.294], LEATHER);
  for (const side of [-1, 1]) {
    m.ellipsoid(
      [0.016, 0.016, 0.008],
      [side * 0.34, battledress ? 2.44 : 2.35, battledress ? 0.467 : 0.432],
      0x9c9871,
      6,
    );
    if (!capote)
      m.ellipsoid(
        [0.018, 0.018, 0.008],
        [side * 0.275, 2.88, 0.31],
        0xb5ac89,
        6,
      );
    if (tier >= 1)
      m.box([0.09, 0.035, 0.015], [side * 0.53, 3.07, 0.115], 0x949773, [
        0,
        0,
        side * -0.35,
      ]);
  }
  m.box([0.045, 0.075, 0.038], [0.37, 2.965, 1.87], METAL);
  m.rod([0.4, 2.94, 0.6], [0.5, 2.92, 0.6], 0.022, METAL);
  m.ellipsoid([0.031, 0.031, 0.031], [0.51, 2.92, 0.6], METAL, 6);
  for (const z of [0.82, 1.23])
    m.box([0.145, 0.025, 0.045], [0.37, 2.948, z], METAL);
  m.ribbon(
    [
      [0.4, 2.68, 0.07],
      [0.4, 2.51, 0.6],
      [0.4, 2.57, 1.13],
      [0.4, 2.8, 1.37],
    ],
    0.035,
    LEATHER,
    [1, 0, 0],
  );
  m.add(new THREE.CircleGeometry(0.029, 8), 0x1e2522, [0.37, 2.9, 1.972]);
  return m.build();
}

/** A steel shell with a raised brow and lower rear skirt, rather than a flat brim. */
function helmetShell(
  m: ModelBuilder,
  rings: readonly (readonly [number, number, number, number?, number?])[],
  width: number,
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const segments = 24;
  rings.forEach(([y, rx, rz, brow = 0, skirt = 0], row) => {
    for (let col = 0; col < segments; col++) {
      const angle = (col / segments) * Math.PI * 2;
      const front = Math.sin(angle);
      vertices.push(
        Math.cos(angle) * rx * width,
        y + Math.max(0, front) * brow - Math.max(0, -front) * skirt,
        front * rz - 0.025,
      );
      if (row) {
        const a = (row - 1) * segments + col;
        const b = (row - 1) * segments + ((col + 1) % segments);
        const c = row * segments + col;
        const d = row * segments + ((col + 1) % segments);
        indices.push(a, c, b, b, c, d);
      }
    }
  });
  const top = vertices.length / 3;
  vertices.push(0, rings[rings.length - 1][0], -0.025);
  for (let col = 0; col < segments; col++) {
    indices.push(
      top,
      (rings.length - 1) * segments + ((col + 1) % segments),
      (rings.length - 1) * segments + col,
    );
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  m.add(shell, HELMET);
}

function nationalHelmet(m: ModelBuilder, profile: InfantryModelProfile) {
  const width = profile.helmetWidth;
  switch (profile.helmet) {
    case "brodie":
      // The shallow British bowl sits inside a wide, almost horizontal brim.
      helmetShell(
        m,
        [
          [0.505, 0.383, 0.397],
          [0.519, 0.385, 0.399],
          [0.544, 0.282, 0.29],
          [0.617, 0.26, 0.27],
          [0.699, 0.204, 0.216],
          [0.746, 0.115, 0.122],
          [0.761, 0.012, 0.015],
        ],
        width,
      );
      break;
    case "adrian": {
      helmetShell(
        m,
        [
          [0.5, 0.327, 0.376, 0.015, 0.015],
          [0.517, 0.328, 0.377, 0.015, 0.015],
          [0.55, 0.264, 0.297],
          [0.65, 0.243, 0.274],
          [0.738, 0.185, 0.218],
          [0.78, 0.085, 0.12],
          [0.787, 0.012, 0.015],
        ],
        width,
      );
      // Adrian's pressed steel comb follows the crown from brow to rear.
      const crest = new THREE.Shape();
      const outline = [
        [-0.29, 0.65],
        [-0.2, 0.79],
        [-0.08, 0.848],
        [0.1, 0.851],
        [0.24, 0.755],
        [0.28, 0.65],
        [0.18, 0.731],
        [0, 0.798],
        [-0.17, 0.743],
      ];
      outline.forEach(([z, y], i) =>
        i ? crest.lineTo(z, y) : crest.moveTo(z, y),
      );
      crest.closePath();
      const geometry = new THREE.ExtrudeGeometry(crest, {
        depth: 0.042,
        bevelEnabled: false,
        steps: 1,
      });
      m.add(geometry, HELMET, [0.021, 0, -0.025], [0, -Math.PI / 2, 0]);
      break;
    }
    case "stahlhelm":
      m.add(createM40HelmetShell(width), HELMET);
      break;
    case "dutch":
      // A deep M34 bowl and low rear lip distinguish it from the German flare.
      helmetShell(
        m,
        [
          [0.416, 0.291, 0.331, 0.126, 0.035],
          [0.433, 0.293, 0.334, 0.123, 0.031],
          [0.535, 0.267, 0.296, 0.029, 0.021],
          [0.67, 0.263, 0.282],
          [0.78, 0.205, 0.226],
          [0.835, 0.106, 0.124],
          [0.846, 0.012, 0.015],
        ],
        width,
      );
      break;
    case "ssh":
      helmetShell(
        m,
        [
          [0.466, 0.297, 0.319, 0.077, 0.029],
          [0.483, 0.297, 0.319, 0.071, 0.026],
          [0.575, 0.282, 0.302, 0.015, 0.008],
          [0.687, 0.25, 0.27],
          [0.777, 0.176, 0.194],
          [0.817, 0.078, 0.09],
          [0.823, 0.012, 0.015],
        ],
        width,
      );
      break;
    case "m33":
      helmetShell(
        m,
        [
          [0.485, 0.278, 0.302, 0.054, 0.016],
          [0.501, 0.282, 0.307, 0.05, 0.016],
          [0.59, 0.266, 0.288],
          [0.686, 0.227, 0.246],
          [0.76, 0.158, 0.177],
          [0.791, 0.069, 0.085],
          [0.795, 0.012, 0.015],
        ],
        width,
      );
      break;
    case "m26":
      helmetShell(
        m,
        [
          [0.46, 0.331, 0.337, 0.066, 0.014],
          [0.477, 0.334, 0.34, 0.062, 0.012],
          [0.541, 0.28, 0.297, 0.025, 0.008],
          [0.65, 0.262, 0.279],
          [0.744, 0.193, 0.209],
          [0.786, 0.089, 0.109],
          [0.794, 0.012, 0.015],
        ],
        width,
      );
      break;
  }
}

function nationalHeadwear(m: ModelBuilder, profile: InfantryModelProfile) {
  const width = profile.helmetWidth;
  if (profile.headwear === "ushanka") {
    m.loft(
      [
        [0.47, 0.23 * width, 0.22],
        [0.57, 0.25 * width, 0.24],
        [0.71, 0.245 * width, 0.235],
        [0.78, 0.18 * width, 0.17],
        [0.8, 0.065 * width, 0.065],
      ],
      CLOTH_LIGHT,
      16,
    );
    // Downturned fur earflaps and the folded forehead flap define an ushanka.
    for (const side of [-1, 1]) {
      const x = side * 0.227 * width;
      m.loft(
        [
          [0.165, 0.036, 0.075, x, -0.015],
          [0.22, 0.061, 0.13, x, -0.025],
          [0.49, 0.065, 0.145, x, -0.025],
          [0.6, 0.052, 0.11, x, -0.025],
        ],
        FUR,
        10,
      );
    }
    m.loft(
      [
        [0.26, 0.2 * width, 0.05, 0, -0.18],
        [0.53, 0.24 * width, 0.065, 0, -0.17],
      ],
      FUR,
      12,
    );
    m.loft(
      [
        [0.49, 0.21 * width, 0.055, 0, 0.185],
        [0.55, 0.235 * width, 0.068, 0, 0.185],
        [0.65, 0.21 * width, 0.057, 0, 0.18],
      ],
      FUR,
      12,
    );
  } else if (profile.headwear === "peaked") {
    m.loft(
      [
        [0.495, 0.222 * width, 0.217],
        [0.56, 0.231 * width, 0.224],
      ],
      CLOTH_LIGHT,
      16,
    );
    m.loft(
      [
        [0.55, 0.231 * width, 0.224],
        [0.65, 0.27 * width, 0.255, 0, 0.022],
        [0.707, 0.257 * width, 0.24, 0, 0.026],
        [0.732, 0.15 * width, 0.16, 0, 0.018],
      ],
      CLOTH,
      16,
    );
    m.ellipsoid([0.232 * width, 0.02, 0.147], [0, 0.505, 0.211], BOOT, 12);
    m.ribbon(
      [
        [-0.185 * width, 0.535, 0.13],
        [-0.13 * width, 0.53, 0.204],
        [0, 0.524, 0.235],
        [0.13 * width, 0.53, 0.204],
        [0.185 * width, 0.535, 0.13],
      ],
      0.022,
      LEATHER,
      [0, 1, 0],
    );
    m.ellipsoid([0.027, 0.035, 0.012], [0, 0.617, 0.275], 0xb5ac89, 8);
  } else {
    nationalHelmet(m, profile);
  }
  if (profile.scarf) {
    const mouthCover = profile.helmet !== "adrian";
    m.loft(
      [
        [-0.04, 0.165, 0.15],
        [0.035, 0.18, 0.165],
        [0.115, 0.2, 0.19, 0, 0.015],
        [
          mouthCover ? 0.235 : 0.145,
          mouthCover ? 0.185 : 0.18,
          mouthCover ? 0.205 : 0.18,
          0,
          0.02,
        ],
      ],
      scarfColor(profile),
      16,
    );
    m.ribbon(
      [
        [-0.15, 0.055, 0.12],
        [0, 0.075, 0.205],
        [0.15, 0.1, 0.12],
      ],
      0.019,
      0x626b5c,
      [0, 1, 0],
    );
  }
}

/** Head and helmet stay local to [0, 3.32, 0], independent of the rifle. */
export function infantryHead(
  tier: LandModelTier,
  profile?: InfantryModelProfile,
) {
  const m = new ModelBuilder(FABRIC);
  m.loft(
    [
      [-0.12, 0.115, 0.105],
      [0.035, 0.12, 0.11],
      [0.14, 0.135, 0.12, 0, 0.025],
    ],
    SKIN,
    12,
  );
  // Jaw, cheekbones, temples and cranial crown form one smooth oval head.
  m.loft(
    [
      [0.09, 0.09, 0.11, 0, 0.06],
      [0.14, 0.14, 0.145, 0, 0.045],
      [0.23, 0.18, 0.165, 0, 0.035],
      [0.33, 0.21, 0.185, 0, 0.025],
      [0.43, 0.215, 0.19, 0, 0.015],
      [0.54, 0.197, 0.177],
      [0.62, 0.145, 0.135, 0, -0.01],
      [0.65, 0.055, 0.06, 0, -0.015],
    ],
    SKIN,
    16,
  );
  m.loft(
    [
      [0.25, 0.043, 0.034, 0, 0.247],
      [0.29, 0.044, 0.051, 0, 0.26],
      [0.33, 0.031, 0.044, 0, 0.25],
      [0.42, 0.022, 0.023, 0, 0.216],
    ],
    SKIN,
    8,
  );
  for (const side of [-1, 1])
    m.ellipsoid([0.036, 0.067, 0.042], [side * 0.214, 0.335, 0.008], SKIN, 8);
  if (profile) {
    nationalHeadwear(m, profile);
  } else if (tier === 0) {
    m.loft(
      [
        [0.5, 0.225, 0.23],
        [0.55, 0.25, 0.244],
        [0.65, 0.245, 0.235, 0, -0.025],
        [0.7, 0.15, 0.15, -0.035, -0.035],
      ],
      CLOTH,
      16,
    );
    m.loft(
      [
        [0.5, 0.23, 0.235],
        [0.535, 0.235, 0.24],
      ],
      CLOTH_LIGHT,
      16,
    );
    m.ellipsoid([0.23, 0.021, 0.15], [0, 0.515, 0.22], BOOT, 12);
  } else {
    const brim = tier === 1 ? 0.365 : tier === 2 ? 0.32 : 0.33;
    const color = tier === 3 ? CLOTH : HELMET;
    m.loft(
      [
        [0.505, brim, brim * 1.08, 0, -0.015],
        [0.535, brim * 0.98, brim * 1.06, 0, -0.015],
        [0.57, 0.282, 0.31, 0, -0.015],
        [0.64, 0.27, 0.295, 0, -0.015],
        [0.73, 0.22, 0.24, 0, -0.02],
        [0.79, 0.12, 0.14, 0, -0.025],
        [0.806, 0.012, 0.015, 0, -0.025],
      ],
      color,
      20,
    );
    m.loft(
      [
        [0.502, brim, brim * 1.08, 0, -0.015],
        [0.518, brim + 0.008, brim * 1.08 + 0.008, 0, -0.015],
        [0.531, brim * 0.985, brim * 1.064, 0, -0.015],
      ],
      tier === 3 ? CLOTH_LIGHT : 0x596247,
      20,
    );
    if (tier >= 2) {
      // A sloping rear skirt gives later helmets a distinct steel-pot silhouette.
      m.ribbon(
        [
          [-0.285, 0.51, -0.13],
          [-0.25, 0.455, -0.24],
          [0, 0.435, -0.32],
          [0.25, 0.455, -0.24],
          [0.285, 0.51, -0.13],
        ],
        0.08,
        color,
        [0, 1, 0],
      );
    }
  }
  return m.build();
}

export function infantryHeadDetails(
  tier: LandModelTier,
  profile?: InfantryModelProfile,
) {
  const m = new ModelBuilder(FABRIC);
  const chinstrap = profile
    ? (profile.headwear === undefined || profile.headwear === "helmet") &&
      !profile.scarf
    : tier >= 1;
  const coveredMouth = profile?.scarf && profile.helmet !== "adrian";
  for (const side of [-1, 1]) {
    // Small recessed eyes, brow ridges and lids avoid a painted cartoon face.
    m.ellipsoid(
      [0.047, 0.017, 0.016],
      [side * 0.085, 0.385, 0.203],
      0x9d7959,
      8,
    );
    m.ellipsoid(
      [0.031, 0.009, 0.009],
      [side * 0.085, 0.386, 0.217],
      0x34352b,
      8,
    );
    m.ellipsoid(
      [0.05, 0.014, 0.021],
      [side * 0.086, 0.416, 0.205],
      0xa7805c,
      8,
    );
    m.ribbon(
      [
        [side * 0.042, 0.429, 0.221],
        [side * 0.085, 0.432, 0.222],
        [side * 0.13, 0.42, 0.204],
      ],
      0.009,
      0x574935,
      [0, 1, 0],
    );
    m.ellipsoid(
      [0.012, 0.036, 0.019],
      [side * 0.242, 0.335, 0.018],
      0x9d7959,
      6,
    );
    if (chinstrap)
      m.ribbon(
        [
          [side * 0.26 * (profile?.helmetWidth ?? 1), 0.53, 0.01],
          [side * 0.22, 0.34, 0.07],
          [side * 0.16, 0.14, 0.13],
          [side * 0.08, 0.115, 0.18],
        ],
        0.022,
        LEATHER,
      );
  }
  if (!coveredMouth)
    m.ribbon(
      [
        [-0.065, 0.207, 0.2],
        [0, 0.199, 0.215],
        [0.065, 0.207, 0.2],
      ],
      0.012,
      0x8b644f,
      [0, 1, 0],
    );
  if (!profile?.scarf)
    m.ellipsoid([0.057, 0.022, 0.018], [0, 0.153, 0.184], SKIN, 8);
  if (chinstrap)
    m.ribbon(
      [
        [-0.08, 0.115, 0.18],
        [0, 0.105, 0.192],
        [0.08, 0.115, 0.18],
      ],
      0.022,
      LEATHER,
      [0, 1, 0],
    );
  if (tier === 3 && !profile) {
    for (const x of [-0.17, 0, 0.17])
      m.ribbon(
        [
          [x, 0.54, 0.3],
          [x, 0.69, 0.23],
          [x * 0.7, 0.79, 0.06],
          [x, 0.73, -0.19],
          [x, 0.55, -0.32],
        ],
        0.012,
        CLOTH_LIGHT,
      );
    m.ribbon(
      [
        [-0.255, 0.64, -0.09],
        [-0.21, 0.73, 0.02],
        [0, 0.796, 0.04],
        [0.21, 0.73, 0.02],
        [0.255, 0.64, -0.09],
      ],
      0.012,
      CLOTH_LIGHT,
      [0, 0, 1],
    );
  }
  return m.build();
}
