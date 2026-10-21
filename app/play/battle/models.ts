import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Attachment, Rarity, WeaponId } from "./types";

// All meshes are original procedural assets. Static model regions are merged
// by material; geometry and materials are shared between combatants and loot.
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
const textures = new Set<THREE.Texture>();
const weaponTemplates = new Map<string, THREE.Group>();
const distantTemplates = new Map<string, THREE.Group>();
const regionTemplates = new Map<string, THREE.Group>();
const bakeGeometries = new Set<THREE.BufferGeometry>();

function geometry(key: string, create: () => THREE.BufferGeometry) {
  let value = geometries.get(key);
  if (!value) {
    value = create();
    geometries.set(key, value);
  }
  return value;
}

function surfaceTexture(kind: "cloth" | "steel") {
  const key = `surface-${kind}`;
  const existing = [...textures].find((t) => t.name === key);
  if (existing) return existing;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const data = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const weave =
        kind === "cloth"
          ? x % 4 < 2 !== y % 4 < 2
            ? 14
            : -14
          : Math.sin(y * 2.8) * 5;
      const noise = ((x * 31 + y * 59 + x * y * 7) % 29) - 14;
      const value = 225 + weave + noise;
      const i = (y * 128 + x) * 4;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
      data.data[i + 3] = 255;
    }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "cloth" ? 3 : 1, kind === "cloth" ? 3 : 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.add(texture);
  return texture;
}

function material(
  name: string,
  color: number,
  metalness = 0,
  roughness = 0.7,
  cloth = false,
  emissive = 0,
) {
  let result = materials.get(name);
  if (!result) {
    result = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      emissive,
      emissiveIntensity: emissive ? 1.1 : 0,
      map: cloth
        ? surfaceTexture("cloth")
        : metalness > 0.5
          ? surfaceTexture("steel")
          : null,
    });
    materials.set(name, result);
  }
  return result;
}

const M = () => ({
  steel: material("gunmetal", 0x28343b, 0.87, 0.31),
  dark: material("polymer", 0x20282b, 0.12, 0.7),
  edge: material("edge-steel", 0x65767a, 0.9, 0.24),
  wood: material("gun-wood", 0x724325, 0.06, 0.51),
  rubber: material("rubber", 0x141b1c, 0, 0.91),
  glass: material("optic", 0x18464b, 0.75, 0.12, false, 0x08201e),
  brass: material("brass", 0xb9a05a, 0.8, 0.26),
});

function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  bevel = 0.025,
) {
  const key = `box:${size.join()}:${bevel}`;
  return part(
    parent,
    geometry(
      key,
      () =>
        new RoundedBoxGeometry(
          ...size,
          2,
          Math.min(bevel, ...size.map((n) => n * 0.2)),
        ),
    ),
    mat,
    x,
    y,
    z,
  );
}
function cylinder(
  parent: THREE.Object3D,
  r: number,
  length: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = Math.PI / 2,
  r2 = r,
  segments = 12,
) {
  return part(
    parent,
    geometry(
      `cyl:${r}:${r2}:${length}:${segments}`,
      () => new THREE.CylinderGeometry(r, r2, length, segments),
    ),
    mat,
    x,
    y,
    z,
    rx,
  );
}
function sphere(
  parent: THREE.Object3D,
  r: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const mesh = part(
    parent,
    geometry(`sphere:${r}`, () => new THREE.SphereGeometry(r, 12, 10)),
    mat,
    x,
    y,
    z,
  );
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

/** Merge a static part while retaining material identity and hit semantics. */
function bake(
  source: THREE.Group,
  headshot = false,
  cacheKey?: string,
): THREE.Group {
  if (cacheKey && regionTemplates.has(cacheKey))
    return regionTemplates.get(cacheKey)!.clone();
  source.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geo = (
      object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone()
    ).applyMatrix4(object.matrixWorld);
    geo.deleteAttribute("uv2");
    const mat = object.material as THREE.Material;
    const list = buckets.get(mat) ?? [];
    list.push(geo);
    buckets.set(mat, list);
  });
  const result = new THREE.Group();
  for (const [mat, list] of buckets) {
    const combined = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!combined) continue;
    bakeGeometries.add(combined);
    const mesh = new THREE.Mesh(combined, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (headshot) mesh.userData.headshot = true;
    result.add(mesh);
  }
  if (cacheKey) {
    regionTemplates.set(cacheKey, result);
    return result.clone();
  }
  return result;
}

// At a distance, preserve the silhouette and material colors in a single draw
// per region instead of submitting all the operator's straps and armor pieces.
function bakeColored(source: THREE.Group, headshot = false): THREE.Group {
  source.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geo = (
      object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone()
    ).applyMatrix4(object.matrixWorld);
    geo.deleteAttribute("uv2");
    const color = (object.material as THREE.MeshStandardMaterial).color;
    const colors = new Float32Array(geo.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(geo);
  });
  const result = new THREE.Group();
  const merged = mergeGeometries(parts, false);
  parts.forEach((geo) => geo.dispose());
  if (!merged) return result;
  bakeGeometries.add(merged);
  const mat = material("distant-operator", 0xffffff, 0.12, 0.85);
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.headshot = headshot;
  result.add(mesh);
  return result;
}

export function createWeapon(
  id: WeaponId,
  attachments: Attachment[] = [],
): THREE.Group {
  const key = `${id}:${[...attachments].sort().join()}`;
  const existing = weaponTemplates.get(key);
  if (existing) return existing.clone();
  const g = new THREE.Group(),
    m = M();
  const pistol = id === "pistol",
    sniper = id === "sniper",
    shotgun = id === "shotgun",
    smg = id === "smg",
    ak = id === "ak47",
    lmg = id === "lmg";
  const barrelLength = pistol
    ? 0.18
    : sniper
      ? 0.59
      : shotgun
        ? 0.55
        : smg
          ? 0.26
          : ak
            ? 0.43
            : 0.4;
  const barrelZ = pistol
    ? -0.2
    : sniper
      ? -0.64
      : shotgun
        ? -0.6
        : smg
          ? -0.35
          : -0.5;
  const receiverLength = pistol ? 0.28 : smg ? 0.32 : lmg ? 0.55 : 0.43;
  const receiver = box(
    g,
    [pistol ? 0.072 : 0.085, pistol ? 0.09 : 0.12, receiverLength],
    m.steel,
    0,
    0.055,
    -0.1,
    0.018,
  );
  receiver.userData.surface = "metal";
  cylinder(
    g,
    pistol ? 0.022 : sniper ? 0.022 : 0.026,
    barrelLength,
    m.edge,
    0,
    0.065,
    barrelZ,
  );
  cylinder(g, 0.035, 0.055, m.steel, 0, 0.065, barrelZ - barrelLength / 2);
  cylinder(
    g,
    0.022,
    0.006,
    m.rubber,
    0,
    0.065,
    barrelZ - barrelLength / 2 - 0.03,
  );
  const grip = box(g, [0.067, 0.17, 0.085], m.dark, 0, -0.08, 0.015, 0.018);
  grip.rotation.x = 0.22;
  if (!pistol) {
    // Stock, rubber shoulder plate, top rail, trigger bow and charging handle.
    box(g, [0.066, 0.095, 0.21], ak ? m.wood : m.dark, 0, 0.015, 0.2);
    const stock = box(
      g,
      [0.074, 0.18, 0.13],
      ak ? m.wood : m.dark,
      0,
      -0.012,
      0.35,
    );
    stock.rotation.x = -0.14;
    box(g, [0.083, 0.18, 0.024], m.rubber, 0, -0.018, 0.42, 0.008);
    box(g, [0.048, 0.022, 0.31], m.edge, 0, 0.13, -0.12, 0.003);
    for (let i = 0; i < 6; i++)
      box(g, [0.068, 0.017, 0.013], m.dark, 0, 0.15, -0.25 + i * 0.046, 0.003);
    box(g, [0.125, 0.024, 0.045], m.steel, 0.038, 0.056, -0.05, 0.004);
    box(g, [0.025, 0.05, 0.018], m.edge, 0, 0.145, -0.48, 0.004);
    box(g, [0.045, 0.028, 0.04], m.dark, 0, 0.13, 0.07, 0.004);
    const fore = box(
      g,
      [0.095, shotgun ? 0.092 : 0.1, smg ? 0.16 : 0.23],
      ak ? m.wood : m.dark,
      0,
      0.018,
      shotgun ? -0.39 : -0.33,
      0.015,
    );
    for (let i = 0; i < 4; i++)
      box(
        g,
        [0.098, 0.009, 0.008],
        m.rubber,
        0,
        0.03,
        -0.25 - i * 0.034,
        0.001,
      );
    if (shotgun) cylinder(g, 0.024, 0.44, m.dark, 0, 0.008, -0.59);
    if (sniper) {
      cylinder(g, 0.035, 0.14, m.steel, 0.063, 0.06, 0.01, Math.PI / 2);
      box(
        g,
        [0.012, 0.16, 0.025],
        m.dark,
        -0.04,
        -0.07,
        -0.57,
        0.003,
      ).rotation.z = 0.18;
      box(
        g,
        [0.012, 0.16, 0.025],
        m.dark,
        0.04,
        -0.07,
        -0.57,
        0.003,
      ).rotation.z = -0.18;
    }
    if (lmg) {
      box(g, [0.17, 0.16, 0.15], m.dark, 0, -0.12, -0.13, 0.025);
      for (let i = 0; i < 6; i++)
        cylinder(
          g,
          0.009,
          0.08,
          m.brass,
          0.07,
          0.065,
          0.08 - i * 0.025,
          Math.PI / 2,
          undefined,
          8,
        );
      box(g, [0.12, 0.028, 0.15], m.steel, 0, 0.19, -0.1, 0.007);
    } else if (!shotgun) {
      const mag = box(
        g,
        [0.055, attachments.includes("magazine") ? 0.26 : 0.2, ak ? 0.1 : 0.08],
        m.dark,
        0,
        -0.105,
        -0.13,
        0.012,
      );
      mag.rotation.x = ak ? -0.23 : -0.06;
      for (let i = 0; i < 3; i++)
        box(
          g,
          [0.057, 0.012, 0.085],
          m.steel,
          0,
          -0.08 - i * 0.038,
          -0.135,
          0.002,
        );
    }
    // Trigger guard is a real open ring rather than a solid block.
    const guard = part(
      g,
      geometry(
        "trigger-guard",
        () => new THREE.TorusGeometry(0.036, 0.006, 5, 12, Math.PI * 1.7),
      ),
      m.steel,
      0,
      -0.073,
      -0.055,
      0,
      Math.PI / 2,
      0,
    );
    guard.scale.set(1, 1.12, 1);
    box(g, [0.012, 0.034, 0.012], m.dark, 0, -0.06, -0.052, 0.002).rotation.x =
      0.25;
    if (ak) cylinder(g, 0.014, 0.22, m.steel, 0, 0.105, -0.49);
    fore.userData.surface = "metal";
  } else {
    box(g, [0.025, 0.016, 0.016], m.edge, 0, 0.108, -0.22, 0.003);
    box(g, [0.045, 0.012, 0.016], m.edge, 0, 0.108, 0.02, 0.003);
    box(g, [0.075, 0.015, 0.095], m.edge, 0, -0.17, 0.035, 0.004);
  }
  if (sniper || attachments.includes("scope")) {
    box(g, [0.035, 0.065, 0.12], m.dark, 0, 0.165, -0.065, 0.008);
    cylinder(
      g,
      sniper ? 0.034 : 0.026,
      sniper ? 0.26 : 0.12,
      m.steel,
      0,
      0.21,
      -0.09,
    );
    cylinder(
      g,
      sniper ? 0.043 : 0.033,
      0.037,
      m.dark,
      0,
      0.21,
      sniper ? -0.23 : -0.16,
    );
    cylinder(
      g,
      sniper ? 0.035 : 0.026,
      0.004,
      m.glass,
      0,
      0.21,
      sniper ? -0.251 : -0.181,
    );
    cylinder(g, 0.025, 0.024, m.edge, 0.037, 0.21, -0.09, 0);
  }
  let muzzle = barrelZ - barrelLength / 2 - 0.035;
  if (attachments.includes("suppressor")) {
    cylinder(g, 0.043, 0.2, m.dark, 0, 0.065, muzzle - 0.09);
    for (let i = 0; i < 3; i++)
      cylinder(g, 0.045, 0.008, m.steel, 0, 0.065, muzzle - 0.03 - i * 0.045);
    muzzle -= 0.2;
  }
  if (attachments.includes("grip") && !pistol)
    box(g, [0.046, 0.13, 0.06], m.dark, 0, -0.095, -0.36, 0.014);
  if (attachments.includes("laser")) {
    box(g, [0.035, 0.037, 0.085], m.steel, 0.065, 0.018, -0.26, 0.008);
    sphere(
      g,
      0.008,
      material("laser-lens", 0xf24837, 0.1, 0.3, false, 0xb51c10),
      0.065,
      0.018,
      -0.31,
    );
  }
  const result = bake(g);
  result.name = `weapon-${id}`;
  result.userData.muzzle = new THREE.Vector3(0, 0.065, muzzle);
  result.userData.weapon = id;
  weaponTemplates.set(key, result);
  return result.clone();
}

export interface CharacterPose {
  speed: number;
  aim: boolean;
  crouch: boolean;
  prone: boolean;
  reload: number;
  recoil: number;
  airborne: boolean;
}
export function createCharacter(color: number, weapon: WeaponId) {
  const root = new THREE.Group();
  root.name = "tactical-operator";
  const body = new THREE.Group();
  const lod = new THREE.LOD();
  lod.addLevel(body, 0);
  root.add(lod);
  const cloth = material(`cloth-${color}`, color, 0, 0.94, true);
  const pants = material("operator-pants", 0x595d45, 0, 0.96, true);
  const armor = material("operator-armor", 0x353e35, 0.15, 0.67);
  const straps = material("operator-straps", 0x202924, 0, 0.9, true);
  const skin = material("operator-skin", 0xa97555, 0, 0.83);
  const boot = material("operator-boot", 0x383b2f, 0, 0.86);
  const steel = M().edge;
  const eye = material("operator-eyes", 0x111b18, 0, 0.38);
  const visor = material("operator-visor", 0x173e44, 0.7, 0.18);

  const torsoParts = new THREE.Group();
  box(torsoParts, [0.45, 0.49, 0.25], cloth, 0, 1.27, 0.012, 0.09);
  box(torsoParts, [0.35, 0.36, 0.075], armor, 0, 1.3, -0.145, 0.055);
  box(torsoParts, [0.29, 0.16, 0.045], armor, 0, 1.43, -0.18, 0.025);
  box(torsoParts, [0.4, 0.06, 0.26], straps, 0, 1.025, 0, 0.02);
  box(torsoParts, [0.07, 0.045, 0.027], steel, 0, 1.025, -0.146, 0.01);
  box(torsoParts, [0.34, 0.2, 0.27], pants, 0, 0.95, 0, 0.06);
  for (const side of [-1, 1]) {
    box(
      torsoParts,
      [0.061, 0.33, 0.045],
      straps,
      side * 0.155,
      1.38,
      -0.14,
      0.008,
    ).rotation.z = side * 0.06;
    for (let i = 0; i < 2; i++)
      box(
        torsoParts,
        [0.074, 0.13, 0.063],
        straps,
        side * (0.05 + i * 0.084),
        1.16,
        -0.19,
        0.012,
      );
    box(torsoParts, [0.08, 0.12, 0.1], straps, side * 0.24, 1.0, 0.01, 0.018);
  }
  // Backpack with straps and an external rolled sleeping mat.
  box(torsoParts, [0.3, 0.34, 0.16], pants, 0, 1.29, 0.22, 0.055);
  box(torsoParts, [0.19, 0.14, 0.056], straps, 0, 1.22, 0.324, 0.02);
  cylinder(
    torsoParts,
    0.067,
    0.3,
    straps,
    0,
    1.53,
    0.23,
    0,
    undefined,
    10,
  ).rotation.z = Math.PI / 2;
  box(torsoParts, [0.022, 0.26, 0.019], steel, 0.13, 1.35, 0.32, 0.004);
  const torso = bake(torsoParts, false, `torso-${color}`);
  body.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.61, 0);
  body.add(headPivot);
  const headParts = new THREE.Group();
  sphere(headParts, 0.14, skin, 0, 0.09, -0.015, 0.83, 1.19, 0.87);
  box(headParts, [0.18, 0.085, 0.16], straps, 0, 0.035, -0.06, 0.035);
  sphere(headParts, 0.02, skin, 0, 0.08, -0.145, 0.8, 1.25, 0.6);
  sphere(headParts, 0.16, armor, 0, 0.185, 0.0, 1, 0.67, 1.06);
  box(headParts, [0.25, 0.045, 0.105], armor, 0, 0.17, -0.1, 0.025);
  box(headParts, [0.22, 0.048, 0.042], visor, 0, 0.115, -0.142, 0.016);
  for (const side of [-1, 1]) {
    box(headParts, [0.035, 0.1, 0.06], straps, side * 0.138, 0.1, 0.015, 0.012);
    cylinder(
      headParts,
      0.033,
      0.025,
      armor,
      side * 0.15,
      0.1,
      0.015,
      0,
    ).rotation.z = Math.PI / 2;
  }
  cylinder(headParts, 0.011, 0.07, steel, 0.12, 0.035, -0.08, Math.PI / 3);
  sphere(headParts, 0.014, eye, 0.12, 0.006, -0.113);
  const head = bake(headParts, true, "operator-head");
  headPivot.add(head);

  function leg(side: number) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0.91, 0);
    body.add(hip);
    const thighParts = new THREE.Group();
    box(thighParts, [0.185, 0.34, 0.2], pants, 0, -0.15, 0, 0.055);
    box(
      thighParts,
      [0.072, 0.16, 0.13],
      pants,
      side * 0.095,
      -0.18,
      0.005,
      0.025,
    );
    const thigh = bake(thighParts, false, `thigh-${side}`);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.set(0, -0.33, 0);
    hip.add(knee);
    const shinParts = new THREE.Group();
    box(shinParts, [0.145, 0.32, 0.16], pants, 0, -0.14, 0, 0.045);
    box(shinParts, [0.13, 0.13, 0.052], armor, 0, -0.012, -0.095, 0.028);
    box(shinParts, [0.16, 0.045, 0.17], straps, 0, -0.1, 0, 0.009);
    box(shinParts, [0.17, 0.17, 0.25], boot, 0, -0.36, -0.047, 0.038);
    box(shinParts, [0.18, 0.035, 0.27], straps, 0, -0.435, -0.05, 0.008);
    for (let i = 0; i < 3; i++)
      box(
        shinParts,
        [0.11, 0.011, 0.011],
        pants,
        0,
        -0.3 - i * 0.026,
        -0.134,
        0.002,
      );
    knee.add(bake(shinParts, false, "operator-shin"));
    return { hip, knee };
  }
  const leftLeg = leg(-1),
    rightLeg = leg(1);
  function arm(side: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 1.46, 0);
    body.add(shoulder);
    const upperParts = new THREE.Group();
    box(upperParts, [0.17, 0.25, 0.18], cloth, 0, -0.11, 0, 0.05);
    box(upperParts, [0.12, 0.13, 0.13], armor, side * 0.065, -0.055, 0, 0.035);
    const upper = bake(upperParts, false, `upper-arm-${color}-${side}`);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.25, 0);
    shoulder.add(elbow);
    const foreParts = new THREE.Group();
    box(foreParts, [0.12, 0.23, 0.14], cloth, 0, -0.1, 0, 0.04);
    box(foreParts, [0.13, 0.09, 0.15], armor, 0, -0.012, 0, 0.025);
    box(foreParts, [0.115, 0.1, 0.135], straps, 0, -0.235, 0, 0.027);
    elbow.add(bake(foreParts, false, `forearm-${color}`));
    return { shoulder, elbow };
  }
  const leftArm = arm(-1),
    rightArm = arm(1);
  const hand = new THREE.Group();
  hand.position.set(0.25, 1.22, -0.38);
  body.add(hand);
  let gun = createWeapon(weapon);
  hand.add(gun);
  let distant: THREE.Group;
  const distantKey = `operator-${color}`;
  const storedDistant = distantTemplates.get(distantKey);
  if (storedDistant) distant = storedDistant.clone();
  else {
    const low = new THREE.Group();
    box(low, [0.43, 0.48, 0.25], cloth, 0, 1.27, 0, 0.065);
    box(low, [0.34, 0.35, 0.06], armor, 0, 1.3, -0.155, 0.04);
    box(low, [0.31, 0.32, 0.15], pants, 0, 1.29, 0.23, 0.04);
    box(low, [0.34, 0.22, 0.25], pants, 0, 0.95, 0, 0.045);
    for (const side of [-1, 1]) {
      box(low, [0.17, 0.67, 0.18], pants, side * 0.14, 0.54, 0, 0.035);
      box(low, [0.18, 0.16, 0.26], boot, side * 0.14, 0.21, -0.045, 0.03);
      const upper = box(
        low,
        [0.16, 0.29, 0.17],
        cloth,
        side * 0.3,
        1.34,
        -0.08,
        0.035,
      );
      upper.rotation.x = 0.9;
      const fore = box(
        low,
        [0.13, 0.26, 0.14],
        cloth,
        side * 0.23,
        1.2,
        -0.28,
        0.035,
      );
      fore.rotation.x = 1.2;
    }
    distant = bakeColored(low);
    const farHead = new THREE.Group();
    sphere(farHead, 0.145, skin, 0, 1.7, -0.015, 0.86, 1.12, 0.9);
    sphere(farHead, 0.16, armor, 0, 1.79, 0, 1, 0.65, 1.06);
    box(farHead, [0.22, 0.045, 0.04], visor, 0, 1.72, -0.14, 0.012);
    distant.add(bakeColored(farHead, true));
    distantTemplates.set(distantKey, distant);
    distant = distant.clone();
  }
  const distantHand = new THREE.Group();
  distantHand.position.copy(hand.position);
  distant.add(distantHand);
  function distantWeapon(id: WeaponId) {
    const key = `far-weapon-${id}`;
    let cached = distantTemplates.get(key);
    if (!cached) {
      cached = bakeColored(createWeapon(id));
      distantTemplates.set(key, cached);
    }
    return cached.clone();
  }
  let distantGun = distantWeapon(weapon);
  distantHand.add(distantGun);
  lod.addLevel(distant, 28, 0.12);
  let cycle = 0,
    smoothSpeed = 0,
    drawProgress = 1;
  const approach = (current: number, target: number, dt: number) =>
    THREE.MathUtils.lerp(current, target, 1 - Math.exp(-dt * 12));
  function update(dt: number, state: CharacterPose) {
    smoothSpeed = approach(smoothSpeed, state.speed, dt);
    cycle += dt * (3 + Math.min(smoothSpeed, 10) * 1.2);
    const moving = Math.min(smoothSpeed / 3, 1),
      run = smoothSpeed > 6;
    const stride = Math.sin(cycle) * (run ? 0.73 : 0.43) * moving;
    const reload = Math.max(0, Math.min(1, state.reload));
    drawProgress = Math.min(1, drawProgress + dt * 3.5);
    const drawOffset = Math.pow(1 - drawProgress, 2);
    body.position.y = approach(
      body.position.y,
      state.prone
        ? 0.42
        : state.crouch
          ? -0.34
          : -0.125 + Math.abs(Math.sin(cycle * 2)) * 0.027 * moving,
      dt,
    );
    body.rotation.x = approach(
      body.rotation.x,
      state.prone ? -Math.PI / 2 : state.airborne ? 0.12 : run ? 0.13 : 0,
      dt,
    );
    body.position.z = approach(body.position.z, state.prone ? 0.45 : 0, dt);
    torso.rotation.z = Math.sin(cycle) * 0.025 * moving;
    headPivot.rotation.x = state.prone ? Math.PI / 2 : state.aim ? -0.02 : 0.01;
    for (const [leg, step] of [
      [leftLeg, stride],
      [rightLeg, -stride],
    ] as const) {
      leg.hip.rotation.x = approach(
        leg.hip.rotation.x,
        state.prone
          ? -0.08
          : state.airborne
            ? -0.36
            : state.crouch
              ? -0.65 + step * 0.5
              : step,
        dt,
      );
      leg.knee.rotation.x = approach(
        leg.knee.rotation.x,
        state.prone
          ? 0.15
          : state.airborne
            ? 0.8
            : state.crouch
              ? 1.1
              : Math.max(0, -step) * 1.3,
        dt,
      );
    }
    rightArm.shoulder.rotation.x = approach(
      rightArm.shoulder.rotation.x,
      state.airborne
        ? 2.7
        : state.prone
          ? 0.5
          : 1.0 + state.recoil * 0.18 - reload * 0.45,
      dt,
    );
    rightArm.shoulder.rotation.z = approach(
      rightArm.shoulder.rotation.z,
      state.airborne ? -0.45 : -0.08,
      dt,
    );
    rightArm.elbow.rotation.x = 0.5;
    leftArm.shoulder.rotation.x = approach(
      leftArm.shoulder.rotation.x,
      state.airborne ? 2.7 : state.prone ? 0.5 : 0.95 - reload * 0.35,
      dt,
    );
    leftArm.shoulder.rotation.z = approach(
      leftArm.shoulder.rotation.z,
      state.airborne ? 0.45 : 0.58,
      dt,
    );
    leftArm.elbow.rotation.x = approach(
      leftArm.elbow.rotation.x,
      0.7 + Math.sin(reload * Math.PI) * 0.8,
      dt,
    );
    hand.position.y = approach(
      hand.position.y,
      (state.aim ? 1.3 : 1.22) -
        Math.sin(reload * Math.PI) * 0.13 -
        drawOffset * 0.32,
      dt,
    );
    hand.position.z = -0.38 + state.recoil * 0.045;
    hand.rotation.set(
      Math.sin(reload * Math.PI) * 0.5 - state.recoil * 0.045,
      Math.sin(cycle) * 0.008 * moving,
      -Math.sin(reload * Math.PI) * 0.38 - drawOffset * 0.6,
    );
    hand.visible = !state.airborne;
    distant.position.copy(body.position);
    distant.rotation.copy(body.rotation);
    distantHand.visible = hand.visible;
    distantHand.position.copy(hand.position);
    distantHand.rotation.copy(hand.rotation);
  }
  update(1, {
    speed: 0,
    aim: false,
    crouch: false,
    prone: false,
    reload: 0,
    recoil: 0,
    airborne: false,
  });
  return {
    root,
    head: headPivot,
    hand,
    update,
    equip(id: WeaponId, attachments: Attachment[] = []) {
      drawProgress = 0;
      hand.remove(gun);
      gun = createWeapon(id, attachments);
      hand.add(gun);
      distantHand.remove(distantGun);
      distantGun = distantWeapon(id);
      distantHand.add(distantGun);
    },
    dispose() {
      root.removeFromParent();
    },
  };
}

export function createParachute(): THREE.Group {
  const g = new THREE.Group();
  g.name = "ram-air-parachute";
  const green = material("chute-olive", 0x7d9160, 0, 0.9, true);
  const stripe = material("chute-stripe", 0xd3c6a4, 0, 0.9, true);
  const rope = material("chute-lines", 0xb8c5ba, 0, 0.9);
  for (let i = 0; i < 9; i++) {
    const rib = new THREE.Group();
    const canopy = box(
      rib,
      [0.48, 0.38, 1.7],
      i === 2 || i === 6 ? stripe : green,
      (i - 4) * 0.46,
      3.9 + Math.cos((i - 4) / 4) * 0.3,
      0,
      0.18,
    );
    canopy.rotation.z = -(i - 4) * 0.035;
    g.add(rib);
  }
  for (const side of [-1, 1])
    for (const z of [-0.65, 0.65])
      for (const x of [-1.8, -0.9, 0, 0.9, 1.8]) {
        const a = new THREE.Vector3(x, 4.0, z),
          b = new THREE.Vector3(side * 0.28, 1.5, 0);
        const length = a.distanceTo(b);
        const line = cylinder(
          g,
          0.008,
          length,
          rope,
          ...(a.clone().add(b).multiplyScalar(0.5).toArray() as [
            number,
            number,
            number,
          ]),
          0,
          0.008,
          5,
        );
        line.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          a.clone().sub(b).normalize(),
        );
      }
  return bake(g);
}

export function createPlane(): THREE.Group {
  const g = new THREE.Group(),
    m = M();
  const paint = material("aircraft-paint", 0x5b6659, 0.42, 0.49);
  const markings = material("aircraft-marking", 0xb8b79d, 0.28, 0.6);
  // Long ellipsoidal fuselage, swept wings, engines and vertical tail.
  sphere(g, 1, paint, 0, 0, 0, 1.1, 1.02, 6.5);
  sphere(g, 1, m.glass, 0, 0.64, -4.55, 0.78, 0.47, 1.3);
  for (const side of [-1, 1]) {
    const wing = box(g, [7.5, 0.18, 1.85], paint, side * 3.8, 0.12, 0.4, 0.07);
    wing.rotation.y = side * 0.16;
    const stabilizer = box(
      g,
      [2.5, 0.13, 0.9],
      paint,
      side * 1.55,
      0.75,
      4.7,
      0.04,
    );
    stabilizer.rotation.y = side * 0.25;
    for (const x of [2.3, 4.8]) {
      cylinder(
        g,
        0.46,
        2.05,
        paint,
        side * x,
        -0.25,
        -0.5,
        Math.PI / 2,
        0.38,
        16,
      );
      cylinder(g, 0.33, 0.06, m.rubber, side * x, -0.25, -1.56);
      cylinder(g, 0.12, 0.1, m.edge, side * x, -0.25, -1.61);
      const prop = new THREE.Group();
      prop.position.set(side * x, -0.25, -1.68);
      prop.name = "propeller";
      for (let k = 0; k < 4; k++)
        box(prop, [0.1, 1.05, 0.035], m.dark, 0, 0, 0, 0.008).rotation.z =
          (k * Math.PI) / 4;
      g.add(prop);
    }
    box(g, [0.03, 0.3, 1.3], markings, side * 1.08, 0.12, 1.5, 0.005);
  }
  const tail = box(g, [0.16, 2.6, 1.4], paint, 0, 1.5, 4.6, 0.06);
  tail.rotation.x = 0.22;
  box(g, [1.4, 0.05, 1.3], markings, 0, 1.03, 1.3, 0.005);
  return g;
}

export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xb6c0b9,
  rare: 0x4daef2,
  epic: 0xb67aed,
  legendary: 0xf0bd56,
};
export function createLoot(
  kind: string,
  rarity: Rarity,
  weapon: WeaponId = "m4",
): THREE.Group {
  const root = new THREE.Group();
  root.name = `loot-${kind}`;
  const m = M();
  const accent = material(
    `rarity-${rarity}`,
    RARITY_COLORS[rarity],
    0.4,
    0.35,
    false,
    RARITY_COLORS[rarity],
  );
  if (kind === "weapon") {
    const gun = createWeapon(weapon);
    gun.rotation.set(0, 0, Math.PI / 2);
    gun.position.set(0, 0.32, 0);
    root.add(gun);
  } else if (kind === "chest") {
    const shell = material("chest-shell", 0x45564b, 0.55, 0.53);
    box(root, [1.04, 0.48, 0.67], shell, 0, 0.25, 0, 0.06);
    const lid = new THREE.Group();
    lid.position.set(0, 0.48, 0.32);
    root.add(lid);
    box(lid, [1.06, 0.17, 0.69], shell, 0, 0.08, -0.32, 0.045);
    for (const x of [-0.38, 0.38]) {
      box(root, [0.075, 0.48, 0.69], m.edge, x, 0.25, 0, 0.012);
      box(lid, [0.075, 0.18, 0.71], m.edge, x, 0.08, -0.32, 0.014);
    }
    box(root, [0.19, 0.11, 0.035], accent, 0, 0.38, -0.35, 0.012);
    box(root, [0.35, 0.045, 0.025], m.dark, 0, 0.2, -0.35, 0.006);
    root.userData.lid = lid;
  } else if (kind === "medkit") {
    const red = material("medic-case", 0xc55c46, 0, 0.75, true);
    box(root, [0.46, 0.2, 0.32], red, 0, 0.15, 0, 0.045);
    box(root, [0.2, 0.014, 0.065], m.edge, 0, 0.26, 0, 0.003);
    box(root, [0.065, 0.015, 0.2], m.edge, 0, 0.26, 0, 0.003);
    box(root, [0.22, 0.028, 0.06], m.dark, 0, 0.16, -0.17, 0.005);
  } else if (kind === "armor") {
    box(root, [0.32, 0.4, 0.055], m.steel, 0, 0.25, 0, 0.045);
    box(root, [0.23, 0.075, 0.061], accent, 0, 0.36, 0, 0.014);
  } else if (kind === "key") {
    cylinder(root, 0.06, 0.012, m.brass, 0, 0.18, 0, 0, 0.06, 12);
    box(root, [0.045, 0.02, 0.18], m.brass, 0, 0.18, -0.13, 0.003);
    box(root, [0.09, 0.02, 0.035], m.brass, 0.023, 0.18, -0.19, 0.003);
  } else if (kind === "attachment") {
    cylinder(root, 0.045, 0.22, m.steel, 0, 0.17, 0);
    cylinder(root, 0.035, 0.012, m.glass, 0, 0.17, -0.12);
  } else {
    box(root, [0.28, 0.22, 0.18], m.dark, 0, 0.14, 0, 0.014);
    for (let i = 0; i < 5; i++)
      cylinder(
        root,
        0.014,
        0.12,
        m.brass,
        -0.09 + i * 0.045,
        0.27,
        0,
        0,
        0.009,
        8,
      );
  }
  const ring = part(
    root,
    geometry("loot-ring", () => new THREE.TorusGeometry(0.5, 0.012, 5, 40)),
    accent,
    0,
    0.035,
    0,
    Math.PI / 2,
  );
  ring.castShadow = false;
  return root;
}

/** Called once after every scene using these shared assets has been removed. */
export function disposeModels() {
  geometries.forEach((g) => g.dispose());
  bakeGeometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  geometries.clear();
  bakeGeometries.clear();
  materials.clear();
  textures.clear();
  weaponTemplates.clear();
  distantTemplates.clear();
  regionTemplates.clear();
}
