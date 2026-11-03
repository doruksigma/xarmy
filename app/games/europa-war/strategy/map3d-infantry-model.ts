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

// The figure is roughly seven heads tall. Cloth is a continuous curved surface;
// straps, seams and equipment sit on that surface instead of forming its anatomy.
export function infantryBody(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  m.loft(
    [
      [1.72, 0.48, 0.29, 0, -0.015],
      [1.81, 0.5, 0.3],
      [1.99, 0.47, 0.275],
      [2.18, 0.435, 0.25],
      [2.34, 0.45, 0.265, 0, -0.005],
      [2.58, 0.485, 0.29, 0, -0.015],
      [2.82, 0.51, 0.31, 0, -0.025],
      [3.02, 0.535, 0.285, 0, -0.025],
      [3.12, 0.46, 0.235],
      [3.23, 0.23, 0.17],
      [3.28, 0.16, 0.145],
    ],
    CLOTH,
    16,
  );
  // Jacket placket, turned collar and gently rolled pocket flaps.
  m.ribbon(
    [
      [0, 1.78, 0.298],
      [0, 2.17, 0.258],
      [0, 2.56, 0.285],
      [0, 2.98, 0.28],
      [0, 3.15, 0.2],
    ],
    0.035,
    0x4e5740,
  );
  for (const side of [-1, 1]) {
    m.ribbon(
      [
        [side * 0.15, 3.29, 0.13],
        [side * 0.25, 3.16, 0.215],
        [side * 0.14, 3.04, 0.295],
      ],
      0.13,
      CLOTH_LIGHT,
    );
    for (const [y, halfWidth, height, z] of [
      [2.84, 0.145, 0.13, 0.256],
      [1.96, 0.16, 0.15, 0.25],
    ]) {
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
    LEATHER,
    16,
  );
  // Leather suspenders bend over shoulders and down the back of the tunic.
  for (const side of [-1, 1]) {
    m.ribbon(
      [
        [side * 0.32, 2.2, 0.23],
        [side * 0.3, 2.58, 0.264],
        [side * 0.33, 2.92, 0.24],
        [side * 0.35, 3.13, 0.12],
        [side * 0.34, 3.15, -0.16],
        [side * 0.27, 2.8, -0.32],
        [side * 0.25, 2.23, -0.25],
      ],
      0.074,
      LEATHER,
    );
    const x = side * 0.34;
    m.loft(
      [
        [2.16, 0.112, 0.07, x, 0.32],
        [2.19, 0.14, 0.09, x, 0.33],
        [2.4, 0.14, 0.09, x, 0.33],
        [2.45, 0.11, 0.075, x, 0.33],
      ],
      LEATHER,
      8,
    );
    m.ribbon(
      [
        [x - 0.115, 2.39, 0.41],
        [x, 2.34, 0.428],
        [x + 0.115, 2.39, 0.41],
      ],
      0.07,
      0x6a5136,
      [0, 1, 0],
    );
  }
  // A canvas knapsack with leather fastening and a rolled blanket.
  const packDepth = 0.18 + tier * 0.012;
  m.loft(
    [
      [2.34, 0.26, packDepth * 0.75, 0, -0.41],
      [2.4, 0.33, packDepth, 0, -0.42],
      [2.89, 0.33, packDepth, 0, -0.42],
      [3.02, 0.26, packDepth * 0.72, 0, -0.42],
    ],
    0x8a8966,
    12,
  );
  m.ellipsoid([0.37, 0.125, 0.14], [0, 3.055, -0.42], CLOTH_LIGHT, 12);
  for (const x of [-0.22, 0.22]) {
    m.ribbon(
      [
        [x, 2.34, -0.54],
        [x, 2.55, -0.61 - tier * 0.01],
        [x, 2.88, -0.61 - tier * 0.01],
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
      [0.48, 3.02, -0.015, 0.2, 0.21],
      [0.61, 2.91, 0.04, 0.215, 0.21],
      [0.7, 2.69, 0.16, 0.18, 0.18],
      [0.69, 2.57, 0.29, 0.17, 0.17],
      [0.58, 2.61, 0.43, 0.16, 0.16],
      [0.47, 2.69, 0.54, 0.12, 0.12],
    ],
    CLOTH,
    12,
  );
  m.limb(
    [
      [-0.48, 3.02, -0.015, 0.2, 0.21],
      [-0.61, 2.9, 0.04, 0.21, 0.21],
      [-0.61, 2.66, 0.18, 0.18, 0.18],
      [-0.52, 2.52, 0.33, 0.17, 0.17],
      [-0.29, 2.56, 0.59, 0.165, 0.16],
      [-0.04, 2.64, 0.85, 0.14, 0.14],
      [0.19, 2.71, 1.03, 0.115, 0.115],
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

export function infantryLeg(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  // Full length trousers narrow naturally through the knee into boot gaiters.
  m.loft(
    [
      [-1.25, 0.137, 0.14, 0, 0.01],
      [-1.15, 0.15, 0.16],
      [-1.01, 0.158, 0.17, 0.008, -0.01],
      [-0.89, 0.175, 0.18, 0.01, 0.015],
      [-0.78, 0.18, 0.195, 0.006, 0.035],
      [-0.64, 0.175, 0.18, 0, 0.02],
      [-0.44, 0.215, 0.215],
      [-0.18, 0.235, 0.24, 0, -0.01],
      [0.08, 0.225, 0.225],
    ],
    CLOTH,
    12,
  );
  m.loft(
    [
      [-1.43, 0.155, 0.17, 0, 0.025],
      [-1.29, 0.16, 0.17],
      [-1.12, 0.155, 0.16],
      [-1.05, 0.16, 0.165],
    ],
    tier >= 2 ? LEATHER : CLOTH_LIGHT,
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
  for (const y of [-1.14, -1.24, -1.34])
    m.ribbon(
      [
        [-0.075, y, 0.148],
        [0, y - 0.022, 0.174],
        [0.075, y, 0.148],
      ],
      0.02,
      tier >= 2 ? 0x6a5136 : 0x686d4e,
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

export function infantryDetails(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
  for (const [y, z] of [
    [2.4, 0.274],
    [2.61, 0.3],
    [2.82, 0.291],
    [3.01, 0.27],
  ])
    m.ellipsoid([0.022, 0.022, 0.009], [0, y, z], 0xb5ac89, 6);
  m.softBox([0.145, 0.095, 0.024], [0, 2.18, 0.278], 0x9f9b76, 0.014);
  m.box([0.08, 0.043, 0.026], [0, 2.18, 0.294], LEATHER);
  for (const side of [-1, 1]) {
    m.ellipsoid([0.016, 0.016, 0.008], [side * 0.34, 2.35, 0.432], 0x9c9871, 6);
    m.ellipsoid([0.018, 0.018, 0.008], [side * 0.275, 2.88, 0.31], 0xb5ac89, 6);
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

/** Head and helmet stay local to [0, 3.32, 0], independent of the rifle. */
export function infantryHead(tier: LandModelTier) {
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
  if (tier === 0) {
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

export function infantryHeadDetails(tier: LandModelTier) {
  const m = new ModelBuilder(FABRIC);
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
    if (tier >= 1)
      m.ribbon(
        [
          [side * 0.26, 0.53, 0.01],
          [side * 0.22, 0.34, 0.07],
          [side * 0.16, 0.14, 0.13],
          [side * 0.08, 0.115, 0.18],
        ],
        0.022,
        LEATHER,
      );
  }
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
  m.ellipsoid([0.057, 0.022, 0.018], [0, 0.153, 0.184], SKIN, 8);
  if (tier >= 1)
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
  if (tier === 3) {
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
