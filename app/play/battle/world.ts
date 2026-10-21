import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { createMaterials } from "./materials";
import type { Collider, Location, Quality, Surface, Weather } from "./types";

export const MAP_SIZE = 600;
const HALF = MAP_SIZE / 2;
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createWorld(
  scene: THREE.Scene,
  quality: Quality,
  seed: number,
) {
  const root = new THREE.Group();
  root.name = "Cinder Coast";
  scene.add(root);
  const {
    mats,
    textures,
    setQuality: setMaterialQuality,
    dispose: disposeMaterials,
  } = createMaterials(quality, seed);
  type MatName = keyof typeof mats;
  const colliders: Collider[] = [];
  const lootSpawns: THREE.Vector3[] = [];
  const locations: Location[] = [
    { name: "Kıyı Kasabası", x: 0, z: 0, radius: 75 },
    { name: "Çamlık Köyü", x: -135, z: -110, radius: 48 },
    { name: "Kuzey Üssü", x: -130, z: 125, radius: 47 },
    { name: "Dökümhane", x: 140, z: 85, radius: 50 },
    { name: "Ayna Gölü", x: 160, z: -125, radius: 65 },
    { name: "Eski Sığınak", x: 70, z: 190, radius: 27 },
    { name: "Kaya Geçidi", x: -220, z: -5, radius: 45 },
  ];
  let rng = seed >>> 0;
  const random = () => {
    rng = (Math.imul(1664525, rng) + 1013904223) | 0;
    return (rng >>> 0) / 4294967296;
  };
  const range = (a: number, b: number) => a + random() * (b - a);
  const geometries = new Set<THREE.BufferGeometry>();
  const ownGeometry = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.add(g);
    return g;
  };
  const unitBox = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const batches = new Map<
    string,
    { material: MatName; geometry: THREE.BufferGeometry[] }
  >();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const p = new THREE.Vector3(),
    s = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);

  function fieldNoise(x: number, z: number) {
    const hash = (ix: number, iz: number) => {
      let n = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const ix = Math.floor(x),
      iz = Math.floor(z),
      fx = x - ix,
      fz = z - iz;
    const u = fx * fx * (3 - 2 * fx),
      v = fz * fz * (3 - 2 * fz);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
      THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u),
      v,
    );
  }
  function rawHeight(x: number, z: number) {
    const rolling =
      Math.sin(x * 0.019) * Math.cos(z * 0.017) * 4.5 +
      Math.sin(x * 0.041 + z * 0.025) * 1.7;
    const edge = smooth(185, 280, Math.hypot(x * 0.85, z));
    let height =
      rolling + edge * (16 + 24 * Math.pow(Math.sin(x * 0.026 + z * 0.012), 2));
    // A shallow lake and a river channel leading toward the eastern shore.
    const lake = Math.sqrt(((x - 160) / 63) ** 2 + ((z + 125) / 47) ** 2);
    height = THREE.MathUtils.lerp(-4.2, height, smooth(0.74, 1.16, lake));
    const riverZ = -75 + Math.sin(x * 0.019) * 10;
    if (x > 75 && x < 300)
      height = THREE.MathUtils.lerp(
        -2.8,
        height,
        smooth(4, 12, Math.abs(z - riverZ)),
      );
    for (const loc of locations) {
      if (loc.name === "Ayna Gölü" || loc.name === "Kaya Geçidi") continue;
      const target = loc.name === "Eski Sığınak" ? 5 : 0;
      const influence =
        1 -
        smooth(
          loc.radius * 0.88,
          loc.radius + 18,
          Math.hypot(x - loc.x, z - loc.z),
        );
      height = THREE.MathUtils.lerp(height, target, influence);
    }
    return height;
  }
  const bridge = { x: 101, z: -65.6, w: 13, d: 37, y: 3.1 };
  function heightAt(x: number, z: number) {
    if (
      Math.abs(x - bridge.x) < bridge.w / 2 &&
      Math.abs(z - bridge.z) < bridge.d / 2
    )
      return bridge.y;
    // Water is shallow enough to cross; players stand on its bed, not a fake platform.
    return rawHeight(x, z);
  }
  function batch(
    geometry: THREE.BufferGeometry,
    material: MatName,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    yaw = 0,
  ) {
    matrix.compose(
      p.set(x, y, z),
      quaternion.setFromAxisAngle(Y, yaw),
      s.set(sx, sy, sz),
    );
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.applyMatrix4(matrix);
    const key = `${Math.floor((x + HALF) / 100)},${Math.floor((z + HALF) / 100)},${material}`;
    let entry = batches.get(key);
    if (!entry) {
      entry = { material, geometry: [] };
      batches.set(key, entry);
    }
    entry.geometry.push(copy);
  }
  function collider(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    surface: Surface,
    mesh?: THREE.Object3D,
    health?: number,
  ) {
    const object = mesh ?? new THREE.Mesh(unitBox, proxyMaterial);
    if (!mesh) {
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      object.visible = false;
      root.add(object);
    }
    object.updateMatrixWorld(true);
    const item: Collider = {
      box: new THREE.Box3(
        new THREE.Vector3(x - sx / 2, y - sy / 2, z - sz / 2),
        new THREE.Vector3(x + sx / 2, y + sy / 2, z + sz / 2),
      ),
      object,
      surface,
      health,
    };
    object.userData.collider = item;
    colliders.push(item);
    return item;
  }
  function box(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: MatName,
    solid = false,
    surface: Surface = "stone",
  ) {
    batch(unitBox, material, x, y, z, sx, sy, sz);
    if (solid) collider(x, y, z, sx, sy, sz, surface);
  }
  function destructible(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: MatName,
    surface: Surface,
    hp: number,
  ) {
    const mesh = new THREE.Mesh(unitBox, mats[material]);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    collider(x, y, z, sx, sy, sz, surface, mesh, hp);
    return mesh;
  }
  function pointLoot(x: number, z: number, y = heightAt(x, z)) {
    lootSpawns.push(new THREE.Vector3(x, y + 0.3, z));
  }

  // Sculpted land: fine silhouette, continuously varying biomes, triplanar-like
  // vertex tint on a repeated physically based surface map.
  const segments = quality === "low" ? 110 : quality === "medium" ? 150 : 210;
  const terrain = ownGeometry(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segments, segments),
  );
  terrain.rotateX(-Math.PI / 2);
  const pos = terrain.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      y = rawHeight(x, z);
    pos.setY(i, y);
    const slope =
      Math.abs(rawHeight(x + 2, z) - y) + Math.abs(rawHeight(x, z + 2) - y);
    if (y < 0.05 && Math.hypot(x - 160, z + 125) < 80) color.setHex(0xb2aa7e);
    else if (slope > 3 || y > 19) color.setHex(0x8a8b80);
    else {
      color.setHex(0x73834e);
      color.lerp(
        new THREE.Color(0x9f9870),
        smooth(0.4, 0.76, fieldNoise(x * 0.026, z * 0.026)),
      );
    }
    const variation = 0.86 + 0.22 * fieldNoise(x * 0.07 + 91, z * 0.07 - 37);
    color.multiplyScalar(variation);
    color.toArray(colors, i * 3);
  }
  terrain.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const land = new THREE.Mesh(terrain, mats.ground);
  land.receiveShadow = true;
  root.add(land);
  // A non-playable distant landscape hides the finite square map edge while
  // keeping all navigation/collision work inside the 600 m battle area.
  const horizon = ownGeometry(new THREE.PlaneGeometry(2400, 2400, 96, 96));
  horizon.rotateX(-Math.PI / 2);
  const hp = horizon.attributes.position,
    hc = new Float32Array(hp.count * 3);
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i),
      z = hp.getZ(i),
      distance = Math.max(Math.abs(x), Math.abs(z));
    const mountains =
      smooth(310, 750, distance) *
      (25 + fieldNoise(x * 0.003, z * 0.003) * 125);
    hp.setY(i, rawHeight(x, z) + mountains - 0.25);
    color
      .setHex(0x75836b)
      .multiplyScalar(0.83 + 0.2 * fieldNoise(x * 0.01, z * 0.01));
    color.toArray(hc, i * 3);
  }
  const horizonIndices: number[] = [];
  for (let row = 0; row < 96; row++)
    for (let col = 0; col < 96; col++) {
      const a = row * 97 + col;
      if (
        Math.abs(hp.getX(a) + 12.5) < HALF &&
        Math.abs(hp.getZ(a) + 12.5) < HALF
      )
        continue;
      horizonIndices.push(a, a + 97, a + 1, a + 1, a + 97, a + 98);
    }
  horizon.setIndex(horizonIndices);
  horizon.setAttribute("color", new THREE.BufferAttribute(hc, 3));
  horizon.computeVertexNormals();
  const backdrop = new THREE.Mesh(horizon, mats.ground);
  root.add(backdrop);

  // Roads conform to the terrain instead of hovering above hills.
  function road(ax: number, az: number, bx: number, bz: number, width = 8) {
    const length = Math.hypot(bx - ax, bz - az),
      count = Math.ceil(length / 3);
    const sideX = ((-(bz - az) / length) * width) / 2,
      sideZ = (((bx - ax) / length) * width) / 2;
    const vertices: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        x = THREE.MathUtils.lerp(ax, bx, t),
        z = THREE.MathUtils.lerp(az, bz, t);
      for (const sign of [-1, 1]) {
        const rx = x + sideX * sign,
          rz = z + sideZ * sign;
        vertices.push(rx, heightAt(rx, rz) + 0.065, rz);
        uv.push(sign < 0 ? 0 : 1, (t * length) / 8);
      }
      if (i < count) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = ownGeometry(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mats.road);
    mesh.receiveShadow = true;
    root.add(mesh);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let d = 4; d < length; d += 10) {
      const t = d / length,
        x = THREE.MathUtils.lerp(ax, bx, t),
        z = THREE.MathUtils.lerp(az, bz, t);
      batch(
        unitBox,
        "paint",
        x,
        heightAt(x, z) + 0.085,
        z,
        0.14,
        0.025,
        3.5,
        yaw,
      );
    }
  }
  road(0, -78, 0, 78, 9);
  road(-80, 0, 80, 0, 9);
  road(-15, 60, -130, 125);
  road(-60, -35, -135, -110, 6);
  road(65, 20, 140, 85);
  road(60, 0, 101, -48);
  road(101, -84, 140, -170, 7);
  road(0, 80, 70, 190, 6);

  // Open interiors use separately segmented walls: doors and windows are real
  // holes, and every blocking slab shares the same collision and raycast shape.
  const cylinder = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  function house(
    x: number,
    z: number,
    w: number,
    d: number,
    kind: "town" | "cabin" | "warehouse",
    alternate = false,
  ) {
    const y = rawHeight(x, z),
      h = kind === "warehouse" ? 6.5 : 4.6,
      wall: MatName =
        kind === "cabin"
          ? "wood"
          : kind === "warehouse"
            ? "concrete"
            : "plaster";
    const floor = y + 0.14;
    box(x, y + 0.025, z, w + 0.5, 0.18, d + 0.5, "concrete");
    const door = kind === "warehouse" ? 4 : 2.1;
    const front = z + d / 2,
      back = z - d / 2;
    for (const sign of [-1, 1])
      box(
        x + (sign * (w + door)) / 4,
        y + h / 2,
        front,
        (w - door) / 2,
        h,
        0.32,
        wall,
        true,
      );
    box(x, y + h - 0.6, front, door, 1.2, 0.32, wall, true);
    // Rear windows are framed with open central panes.
    box(x, y + 0.65, back, w, 1.3, 0.3, wall, true);
    box(x, y + h - 0.6, back, w, 1.2, 0.3, wall, true);
    for (const offset of [-w / 2 + 0.8, 0, w / 2 - 0.8])
      box(x + offset, y + h / 2, back, 1.6, h, 0.3, wall, true);
    for (const sign of [-1, 1]) {
      box(x + (sign * w) / 2, y + 0.65, z, 0.3, 1.3, d, wall, true);
      box(x + (sign * w) / 2, y + h - 0.6, z, 0.3, 1.2, d, wall, true);
      for (const oz of [-d / 2 + 0.7, 0, d / 2 - 0.7])
        box(x + (sign * w) / 2, y + h / 2, z + oz, 0.3, h, 1.4, wall, true);
      for (const oz of [-d / 4, d / 4]) {
        box(
          x + sign * (w / 2 + 0.16),
          y + 1.28,
          z + oz,
          0.52,
          0.15,
          d / 2 - 1.3,
          "trim",
        );
        box(
          x + sign * (w / 2 + 0.16),
          y + h - 1.17,
          z + oz,
          0.45,
          0.13,
          d / 2 - 1.3,
          "trim",
        );
      }
    }
    // Two breakable panes; other windows stay open for combat sightlines.
    for (const sign of [-1, 1])
      destructible(
        x + (sign * w) / 4,
        y + 2.35,
        back,
        w / 2 - 1.6,
        1.85,
        0.045,
        "glass",
        "glass",
        12,
      );
    box(
      x,
      y + h + 0.12,
      z,
      w + 0.8,
      0.25,
      d + 0.8,
      kind === "warehouse" ? "metal" : "dark",
      true,
    );
    if (kind !== "warehouse") {
      // A pitched tile roof, eaves and ridge, not a single flat box.
      const rise = Math.min(2.1, w * 0.15),
        length = Math.hypot(w / 2 + 0.7, rise),
        angle = Math.atan2(rise, w / 2 + 0.7);
      for (const sign of [-1, 1]) {
        const roofGeo = new THREE.BoxGeometry(length, 0.2, d + 1.3);
        roofGeo.rotateZ(sign * angle);
        batch(
          roofGeo,
          alternate ? "metal" : "roof",
          x - sign * (w / 4 + 0.35),
          y + h + rise / 2,
          z,
        );
        roofGeo.dispose();
      }
      box(x, y + h + rise + 0.04, z, 0.35, 0.3, d + 1.5, "roof");
      box(x - w * 0.3, y + h + 1.1, z - d * 0.22, 0.9, 2.2, 0.9, "concrete");
      box(x - w * 0.3, y + h + 2.3, z - d * 0.22, 1.2, 0.18, 1.2, "dark");
    }
    // Recessed entrance, lintel, steps, wall lamps and a wood door swung open.
    for (const sign of [-1, 1])
      box(
        x + sign * (door / 2 + 0.13),
        y + 1.55,
        front + 0.18,
        0.18,
        3.1,
        0.2,
        "trim",
      );
    box(x, y + 3.13, front + 0.18, door + 0.35, 0.18, 0.2, "trim");
    box(x, y + 0.05, front + 0.8, door + 0.7, 0.1, 1.3, "concrete");
    destructible(
      x - door / 2 + 0.1,
      y + 1.4,
      front + door / 2,
      0.15,
      2.8,
      door,
      kind === "warehouse" ? "metal" : "wood",
      kind === "warehouse" ? "metal" : "wood",
      kind === "warehouse" ? 140 : 65,
    );
    box(x + door / 2 + 0.6, y + 2.85, front + 0.28, 0.28, 0.4, 0.25, "dark");
    box(x + door / 2 + 0.6, y + 2.85, front + 0.43, 0.2, 0.25, 0.03, "light");
    // Furniture and shelving visible through the open doors/windows.
    box(x - w * 0.25, floor + 0.9, z - d * 0.12, w * 0.28, 0.15, 1.6, "wood");
    for (const ox of [-0.9, 0.9])
      for (const oz of [-0.55, 0.55])
        box(
          x - w * 0.25 + ox,
          floor + 0.42,
          z - d * 0.12 + oz,
          0.12,
          0.85,
          0.12,
          "metal",
        );
    box(
      x + w * 0.3,
      floor + 1.5,
      z - d * 0.3,
      1.7,
      3,
      0.55,
      "dark",
      true,
      "wood",
    );
    for (let shelf = 0; shelf < 4; shelf++) {
      box(
        x + w * 0.3,
        floor + 0.35 + shelf * 0.7,
        z - d * 0.3 + 0.32,
        1.8,
        0.1,
        0.65,
        "wood",
      );
      for (let n = 0; n < 3; n++)
        box(
          x + w * 0.3 - 0.55 + n * 0.5,
          floor + 0.6 + shelf * 0.7,
          z - d * 0.3 + 0.35,
          0.3,
          0.4,
          0.4,
          "painted",
        );
    }
    if (kind !== "warehouse") {
      box(
        x + w * 0.2,
        floor + 0.4,
        z + d * 0.1,
        2.4,
        0.6,
        1.1,
        "painted",
        true,
      );
      box(
        x + w * 0.2,
        floor + 0.85,
        z + d * 0.1 - 0.5,
        2.4,
        0.9,
        0.18,
        "painted",
      );
    }
    pointLoot(x, z, floor);
    pointLoot(x - w * 0.3, z - d * 0.32, floor);
  }
  for (const x of [-48, -23, 23, 48])
    for (const z of [-35, 35]) house(x, z, x % 2 ? 13 : 15, 14, "town", x > 0);
  house(-38, 67, 19, 12, "warehouse");
  house(35, -65, 20, 14, "warehouse");
  for (const [ox, oz] of [
    [-21, -15],
    [12, -22],
    [-15, 19],
    [23, 17],
  ])
    house(-135 + ox, -110 + oz, 12, 11, "cabin");
  house(-143, 115, 21, 15, "warehouse");
  house(-114, 145, 15, 12, "warehouse");
  house(128, 76, 25, 21, "warehouse");
  house(157, 110, 20, 16, "warehouse");

  // Urban details: raised kerbs, bollards, cable poles, benches, planters.
  for (const sign of [-1, 1]) {
    box(sign * 6, 0.16, 0, 0.35, 0.32, 140, "concrete");
    box(0, 0.16, sign * 6, 140, 0.32, 0.35, "concrete");
    for (let z = -65; z <= 65; z += 26) {
      batch(cylinder, "metal", sign * 8, 3.5, z, 0.12, 7, 0.12);
      box(sign * 7.3, 6.9, z, 1.5, 0.1, 0.15, "metal");
      box(sign * 6.6, 6.8, z, 0.5, 0.08, 0.4, "light");
      batch(cylinder, "dark", sign * 7.8, 0.6, z + 6, 0.16, 1.2, 0.16);
    }
  }
  for (const x of [-12, 12])
    for (const z of [-12, 12]) {
      box(x, 0.5, z, 2.8, 1, 2.8, "concrete", true);
      box(x, 1.03, z, 2.4, 0.05, 2.4, "ground");
    }
  for (let i = 0; i < 12; i++) {
    const x = range(-68, 68),
      z = i % 2 ? -17 : 17;
    destructible(x, 0.65, z, 1.25, 1.3, 1.25, "wood", "wood", 65);
    for (const side of [-0.48, 0.48])
      box(x + side, 0.65, z + 0.64, 0.1, 1.3, 0.055, "metal");
    pointLoot(x + 2, z);
  }
  // Fracturable low concrete walls provide cover with the same destructible
  // collision used by windows, doors and supply props.
  for (const [x, z] of [
    [-62, 17],
    [61, -18],
    [-102, 134],
    [146, 53],
  ]) {
    const y = rawHeight(x, z);
    for (let panel = 0; panel < 3; panel++)
      destructible(
        x + panel * 1.65,
        y + 0.7,
        z,
        1.6,
        1.4,
        0.3,
        "concrete",
        "stone",
        140,
      );
  }
  // Industrial silhouettes: silos, external pipe racks, steel tanks and stacks.
  const sphere = ownGeometry(new THREE.SphereGeometry(1, 12, 8));
  for (let i = 0; i < 4; i++) {
    const x = 113 + i * 9,
      z = 112;
    batch(cylinder, "metal", x, 7, z, 3.1, 14, 3.1);
    batch(sphere, "metal", x, 14, z, 3.1, 1, 3.1);
    collider(x, 7, z, 6.2, 14, 6.2, "metal");
    for (let y = 1; y < 13; y += 3) {
      const torus = new THREE.TorusGeometry(3.16, 0.08, 5, 16);
      torus.rotateX(Math.PI / 2);
      batch(torus, "rust", x, y, z);
      torus.dispose();
    }
  }
  for (const x of [156, 168]) {
    batch(cylinder, "concrete", x, 15, 62, 1.7, 30, 1.7);
    batch(cylinder, "rust", x, 23, 62, 1.74, 2, 1.74);
    collider(x, 15, 62, 3.4, 30, 3.4, "stone");
  }
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.CylinderGeometry(0.35, 0.35, 33, 8);
    pipe.rotateZ(Math.PI / 2);
    batch(pipe, "metal", 143, 4 + i * 0.9, 99);
    pipe.dispose();
  }
  // Supply containers have ribs and open ends, providing genuine cover.
  for (const [x, z] of [
    [-112, 111],
    [-122, 94],
    [165, 85],
  ]) {
    box(x, 1.5, z - 2.8, 8, 3, 0.18, "painted", true, "metal");
    box(x - 4, 1.5, z, 0.2, 3, 5.6, "painted", true, "metal");
    box(x + 4, 1.5, z, 0.2, 3, 5.6, "painted", true, "metal");
    box(x, 3.05, z, 8.2, 0.2, 5.8, "metal", true, "metal");
    for (let rib = -3.5; rib <= 3.5; rib += 0.7)
      box(x + rib, 1.5, z - 2.92, 0.07, 3, 0.06, "metal");
    pointLoot(x, z);
  }
  // Helipad, fenced army perimeter with a deliberate gate, sandbag cover.
  box(-143, 0.06, 143, 18, 0.1, 18, "road");
  box(-146, 0.13, 143, 0.4, 0.03, 10, "paint");
  box(-140, 0.13, 143, 0.4, 0.03, 10, "paint");
  box(-143, 0.13, 143, 6, 0.03, 0.4, "paint");
  for (let i = 0; i < 20; i++) {
    const x = -168 + i * 4;
    if (x > -132 && x < -120) continue;
    batch(cylinder, "metal", x, 1.5, 88, 0.08, 3, 0.08);
    box(x, 0.8, 88, 3.9, 1.4, 0.12, "metal", true, "metal");
  }
  for (const [x, z] of [
    [-103, 134],
    [-158, 101],
    [83, 183],
  ])
    for (let i = 0; i < 6; i++) {
      batch(
        sphere,
        "wood",
        x + (i % 3) * 1.1,
        0.4 + Math.floor(i / 3) * 0.65 + rawHeight(x, z),
        z,
        0.7,
        0.4,
        0.5,
      );
    }

  // Bunker tunnel and cave formed from separate walls and a vaulted ceiling.
  const by = rawHeight(70, 190);
  box(70, by + 2.2, 183, 18, 4.4, 0.8, "concrete", true);
  box(61, by + 2.2, 191, 0.8, 4.4, 16, "concrete", true);
  box(79, by + 2.2, 191, 0.8, 4.4, 16, "concrete", true);
  box(65, by + 2.2, 199, 8, 4.4, 0.8, "concrete", true);
  box(77, by + 2.2, 199, 4, 4.4, 0.8, "concrete", true);
  box(70, by + 4.5, 191, 19, 1, 17, "rock", true);
  box(71, by + 3.1, 198.5, 1.2, 0.13, 0.2, "light");
  for (let i = 0; i < 5; i++)
    box(64 + i * 2.5, by + 0.7, 186, 1.4, 1.4, 1.4, "metal", true, "metal");
  // The only entrance is a key-operated steel shutter. Its collider follows
  // the opening animation, so a locked room really blocks movement and shots.
  const gate = new THREE.Group();
  gate.position.set(72, by + 1.75, 199);
  gate.userData.locked = true;
  root.add(gate);
  const gatePanel = new THREE.Mesh(unitBox, mats.metal);
  gatePanel.scale.set(5.2, 3.5, 0.4);
  gatePanel.castShadow = gatePanel.receiveShadow = true;
  gate.add(gatePanel);
  for (let rib = -2; rib <= 2; rib += 0.5) {
    const strip = new THREE.Mesh(unitBox, mats.dark);
    strip.position.set(rib, 0, 0.24);
    strip.scale.set(0.075, 3.45, 0.07);
    gate.add(strip);
  }
  const reader = new THREE.Mesh(unitBox, mats.light);
  reader.position.set(2, 0, 0.28);
  reader.scale.set(0.18, 0.3, 0.05);
  gate.add(reader);
  const gateCollider = collider(
    72,
    by + 1.75,
    199,
    5.2,
    3.5,
    0.4,
    "metal",
    gate,
  );
  let gateOpen = 0;
  const gateLocation = new THREE.Vector3(72, by, 200);
  pointLoot(70, 192, by);
  pointLoot(76, 187, by);
  // Rocky passage has a traversable opening, not a solid mountain box.
  for (let i = 0; i < 9; i++) {
    const angle = (i / 8) * Math.PI;
    batch(
      sphere,
      "rock",
      -220 + Math.cos(angle) * 7,
      rawHeight(-220, -5) + Math.sin(angle) * 7,
      -5,
      3.3,
      3.2,
      9,
    );
  }
  collider(-227, rawHeight(-220, -5) + 2.5, -5, 4, 5, 18, "stone");
  collider(-213, rawHeight(-220, -5) + 2.5, -5, 4, 5, 18, "stone");
  pointLoot(-220, -7);

  // River crossing: deck, steel trusses, supports and walkable approach ramps.
  box(bridge.x, bridge.y - 0.3, bridge.z, bridge.w, 0.6, bridge.d, "concrete");
  for (const side of [-1, 1]) {
    box(
      bridge.x + side * (bridge.w / 2 - 0.2),
      bridge.y + 0.75,
      bridge.z,
      0.25,
      1.5,
      bridge.d,
      "metal",
      true,
      "metal",
    );
    for (let z = bridge.z - 16; z <= bridge.z + 16; z += 8) {
      box(bridge.x + side * 6, bridge.y + 2.8, z, 0.25, 5.6, 0.3, "metal");
      batch(cylinder, "concrete", bridge.x + side * 4, -0.2, z, 0.5, 6, 0.5);
    }
  }
  for (const sign of [-1, 1]) {
    const approachZ = bridge.z + sign * (bridge.d / 2 + 5);
    const rise = bridge.y - rawHeight(bridge.x, approachZ + sign * 5);
    const rampGeo = new THREE.BoxGeometry(bridge.w, 0.2, Math.hypot(10, rise));
    rampGeo.rotateX(sign * Math.atan2(rise, 10));
    batch(rampGeo, "road", bridge.x, bridge.y - rise / 2, approachZ);
    rampGeo.dispose();
  }

  // Thousands of batched blades and foliage clusters, never thousands of draws.
  const treeCount = 210;
  const trunks = new THREE.InstancedMesh(cylinder, mats.bark, treeCount);
  const rockGeo = ownGeometry(new THREE.IcosahedronGeometry(1, 2));
  const branchCards = [0, Math.PI / 3, (Math.PI * 2) / 3].map((angle) => {
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateY(angle);
    return g;
  });
  const leafGeo = ownGeometry(mergeGeometries(branchCards)!);
  branchCards.forEach((g) => g.dispose());
  const leaves = new THREE.InstancedMesh(leafGeo, mats.foliage, treeCount * 8);
  trunks.castShadow = true;
  leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  let tree = 0;
  const treeSites: THREE.Vector3[] = [];
  while (tree < treeCount) {
    const x = range(-275, 275),
      z = range(-275, 275),
      y = rawHeight(x, z);
    if (
      y < -1 ||
      (Math.abs(x) < 76 && Math.abs(z) < 80) ||
      locations.some(
        (l) =>
          l.name !== "Kaya Geçidi" &&
          Math.hypot(x - l.x, z - l.z) < l.radius + 7,
      )
    )
      continue;
    const h = range(6, 12),
      radius = range(0.28, 0.48);
    matrix.compose(
      p.set(x, y + h * 0.43, z),
      quaternion.identity(),
      s.set(radius, h * 0.86, radius),
    );
    trunks.setMatrixAt(tree, matrix);
    for (let crown = 0; crown < 8; crown++) {
      const a = crown * 2.39996,
        spread = crown < 5 ? 0.18 : 0.08;
      matrix.compose(
        p.set(
          x + Math.cos(a) * h * spread,
          y + h * (0.58 + crown * 0.055),
          z + Math.sin(a) * h * spread,
        ),
        quaternion.setFromEuler(
          new THREE.Euler(range(-0.4, 0.4), random() * 6, range(-0.4, 0.4)),
        ),
        s.set(h * 0.28, h * 0.24, h * 0.28),
      );
      leaves.setMatrixAt(tree * 8 + crown, matrix);
      leaves.setColorAt(
        tree * 8 + crown,
        new THREE.Color().setRGB(
          0.72 + random() * 0.25,
          0.78 + random() * 0.2,
          0.62 + random() * 0.23,
        ),
      );
    }
    for (const sign of [-1, 1]) {
      const branch = cylinder.clone();
      branch.scale(radius * 0.55, h * 0.37, radius * 0.55);
      branch.rotateZ(sign * 0.5);
      batch(branch, "bark", x - sign * h * 0.09, y + h * 0.65, z);
      branch.dispose();
    }
    collider(x, y + h / 2, z, radius * 2, h, radius * 2, "wood");
    treeSites.push(new THREE.Vector3(x, y, z));
    tree++;
  }
  root.add(trunks, leaves);
  const grassGeo = ownGeometry(new THREE.BufferGeometry());
  grassGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.13, 0, 0, 0.13, 0, 0, 0.04, 0.8, 0.04, 0, 0, -0.13, 0, 0, 0.13, 0.04,
        0.65, 0.04,
      ],
      3,
    ),
  );
  grassGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1],
      2,
    ),
  );
  grassGeo.computeVertexNormals();
  const grassCount = 6000,
    grasses = new THREE.InstancedMesh(grassGeo, mats.grass, grassCount);
  grasses.receiveShadow = true;
  let blade = 0;
  while (blade < grassCount) {
    const x = range(-275, 275),
      z = range(-275, 275),
      y = rawHeight(x, z);
    if (
      y < -0.3 ||
      (Math.abs(x) < 78 && Math.abs(z) < 82) ||
      locations.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius)
    )
      continue;
    matrix.compose(
      p.set(x, y, z),
      quaternion.setFromAxisAngle(Y, random() * 6.28),
      s.setScalar(range(0.7, 1.7)),
    );
    grasses.setMatrixAt(blade++, matrix);
  }
  root.add(grasses);
  const wind = { value: 0 };
  for (const material of [mats.foliage, mats.grass]) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = wind;
      shader.vertexShader =
        `uniform float windTime;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 windOrigin = instanceMatrix[3].xyz;\ntransformed.x += sin(windTime * 1.4 + windOrigin.x * 0.13 + windOrigin.z * 0.09) * max(position.y,0.0) * 0.11;\n#endif`,
        );
    };
  }
  const rockCount = 125;
  const rocks = new THREE.InstancedMesh(rockGeo, mats.rock, rockCount);
  rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < rockCount; i++) {
    let x = range(-280, 280),
      z = range(-280, 280);
    while (locations.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 8)) {
      x = range(-280, 280);
      z = range(-280, 280);
    }
    const y = rawHeight(x, z),
      r = range(1.1, 4.2);
    matrix.compose(
      p.set(x, y + r * 0.4, z),
      quaternion.setFromEuler(
        new THREE.Euler(range(-0.3, 0.3), random() * 6, range(-0.3, 0.3)),
      ),
      s.set(r, r * 0.75, r * 0.9),
    );
    rocks.setMatrixAt(i, matrix);
    collider(x, y + r * 0.45, z, r * 1.6, r * 1.1, r * 1.6, "stone");
  }
  root.add(rocks);

  // Small cover clusters are destructible and remain individually addressable.
  for (let i = 0; i < 18; i++) {
    const site = locations[i % 4],
      x = site.x + range(-site.radius * 0.7, site.radius * 0.7),
      z = site.z + range(-site.radius * 0.7, site.radius * 0.7),
      y = rawHeight(x, z);
    const mesh = new THREE.Mesh(cylinder, mats.rust);
    mesh.position.set(x, y + 0.75, z);
    mesh.scale.set(0.55, 1.5, 0.55);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    collider(x, y + 0.75, z, 1.1, 1.5, 1.1, "metal", mesh, 45);
  }
  // Extra natural loot sites avoid placing everything inside one settlement.
  for (const l of locations)
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5,
        x = l.x + Math.cos(a) * l.radius * 0.7,
        z = l.z + Math.sin(a) * l.radius * 0.7;
      if (rawHeight(x, z) > -1) pointLoot(x, z);
    }

  for (const entry of batches.values()) {
    const merged = mergeGeometries(entry.geometry, false);
    entry.geometry.forEach((g) => g.dispose());
    if (!merged) continue;
    ownGeometry(merged);
    const mesh = new THREE.Mesh(merged, mats[entry.material]);
    mesh.castShadow = entry.material !== "light";
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  batches.clear();

  // Reflective water for high presets; low/medium use the same animated normal
  // surface without an extra scene render. No screen-space reflections claimed.
  const normalData = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      normalData[i] = 128 + Math.sin(x * 0.23 + y * 0.16) * 38;
      normalData[i + 1] = 128 + Math.cos(y * 0.29 - x * 0.11) * 38;
      normalData[i + 2] = 235;
      normalData[i + 3] = 255;
    }
  const waterNormal = new THREE.DataTexture(normalData, 128, 128);
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.needsUpdate = true;
  textures.push(waterNormal);
  const waterGeometry = ownGeometry(new THREE.PlaneGeometry(142, 111));
  const water = new Water(waterGeometry, {
    textureWidth: quality === "ultra" ? 512 : 256,
    textureHeight: quality === "ultra" ? 512 : 256,
    waterNormals: waterNormal,
    sunDirection: new THREE.Vector3(0.5, 0.75, 0.3),
    sunColor: 0xffedce,
    waterColor: 0x3b7778,
    distortionScale: 1.5,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(160, -1.15, -125);
  root.add(water);
  const simpleWaterMat = new THREE.MeshStandardMaterial({
    color: 0x527f7d,
    metalness: 0.5,
    roughness: 0.18,
    transparent: true,
    opacity: 0.85,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.22, 0.22),
  });
  const simpleWater = new THREE.Mesh(waterGeometry, simpleWaterMat);
  simpleWater.rotation.copy(water.rotation);
  simpleWater.position.copy(water.position);
  root.add(simpleWater);
  // River plane is intentionally under the sloping banks: terrain clips it.
  const riverGeo = ownGeometry(new THREE.PlaneGeometry(240, 25));
  const river = new THREE.Mesh(riverGeo, simpleWaterMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(190, -1.15, -70);
  root.add(river);

  let currentQuality = quality;
  function setQuality(q: Quality) {
    currentQuality = q;
    setMaterialQuality(q);
    grasses.count =
      q === "low" ? 1100 : q === "medium" ? 2600 : q === "high" ? 4400 : 6000;
    leaves.castShadow = q !== "low";
    grasses.receiveShadow = q !== "low";
    water.visible = q === "high" || q === "ultra";
    simpleWater.visible = !water.visible;
  }
  setQuality(quality);
  return {
    colliders,
    lootSpawns,
    locations,
    heightAt,
    lockedPrompt(position: THREE.Vector3) {
      return gate.userData.locked && position.distanceTo(gateLocation) < 4
        ? "E · Sığınağı anahtarla aç"
        : "";
    },
    unlockNearest(position: THREE.Vector3) {
      if (!gate.userData.locked || position.distanceTo(gateLocation) >= 4)
        return false;
      gate.userData.locked = false;
      return true;
    },
    update(_dt: number, time: number, player: THREE.Vector3, weather: Weather) {
      if (!gate.userData.locked && gateOpen < 1) {
        gateOpen = Math.min(1, gateOpen + _dt * 0.65);
        gate.position.y = by + 1.75 + gateOpen * 3.7;
        gateCollider.box.min.y = by + gateOpen * 3.7;
        gateCollider.box.max.y = by + 3.5 + gateOpen * 3.7;
      }
      wind.value = time * (weather === "storm" ? 2 : 1);
      water.material.uniforms.time.value = time * 0.45;
      waterNormal.offset.set((time * 0.008) % 1, (time * 0.004) % 1);
      // Hide distant thin grass before fragment work; tree silhouettes remain.
      grasses.visible = player.y < 75;
      // Quality presets reduce shadow work without changing gameplay obstacles.
      trunks.castShadow = currentQuality !== "low";
    },
    setQuality,
    dispose() {
      scene.remove(root);
      for (const geometry of geometries) geometry.dispose();
      water.material.dispose();
      simpleWaterMat.dispose();
      proxyMaterial.dispose();
      // Water's reflection target is not exposed by the upstream object. It is
      // released together with the owning renderer on match teardown.
      disposeMaterials();
    },
  };
}
