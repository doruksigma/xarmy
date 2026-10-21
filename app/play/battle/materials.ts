import * as THREE from "three";
import type { Quality } from "./types";

/** Original generated surface maps: no remote textures or asset dependencies. */
export function createMaterials(quality: Quality, seed: number) {
  const textures: THREE.Texture[] = [];
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let currentQuality = quality;
  const resolution = (q: Quality) =>
    q === "ultra" ? 2048 : q === "high" ? 1024 : 512;
  let size = resolution(quality);
  // Smooth, tileable value noise avoids a visible sinusoidal checkerboard.
  function noise(x: number, y: number, cells: number, salt: number) {
    const hash = (ix: number, iy: number) => {
      let n =
        Math.imul((((ix % cells) + cells) % cells) + 1, 374761393) ^
        Math.imul((((iy % cells) + cells) % cells) + 1, 668265263) ^
        seed ^
        salt;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy,
      u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
      THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u),
      v,
    );
  }
  function surface(
    kind: "earth" | "plaster" | "wood" | "rock" | "roof",
    base: number,
    repeat: number,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const color = new THREE.Color(base);
    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size);
    const heights = new Uint8Array(size * size);
    const rgb = [
      Math.round(color.r * 255),
      Math.round(color.g * 255),
      Math.round(color.b * 255),
    ];
    // Grain is authored in sRGB canvas space, with large-scale variation and
    // finer pits. Normal and roughness maps derive from the same surface.
    const c = new THREE.Color(base).convertLinearToSRGB();
    rgb[0] = c.r * 255;
    rgb[1] = c.g * 255;
    rgb[2] = c.b * 255;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const grain = random();
        let value = 0.9 + grain * 0.13;
        // Earth has fine mineral variation; large biome variation lives in world
        // coordinates, so the same large blotch never repeats across the ground.
        if (kind !== "earth")
          value += 0.06 * Math.sin(x * 0.033) * Math.sin(y * 0.021);
        if (kind === "wood")
          value +=
            0.12 * Math.sin(x * 0.2 + Math.sin(y * 0.007) * 4) +
            (x % Math.round(size / 5) < 3 ? -0.3 : 0);
        if (kind === "roof")
          value +=
            (y % Math.round(size / 12) < 4 ? -0.35 : 0) +
            0.1 * Math.sin((x * Math.PI) / (size / 12));
        if (kind === "rock")
          value += 0.16 * (noise((x / size) * 8, (y / size) * 8, 8, 541) - 0.5);
        const i = y * size + x;
        heights[i] = Math.max(0, Math.min(255, value * 145));
        for (let channel = 0; channel < 3; channel++)
          data.data[i * 4 + channel] = rgb[channel] * value;
        data.data[i * 4 + 3] = 255;
      }
    ctx.putImageData(data, 0, 0);
    const normalCanvas = document.createElement("canvas");
    const normalSize = Math.min(size, 512);
    normalCanvas.width = normalCanvas.height = normalSize;
    const nc = normalCanvas.getContext("2d")!;
    const normals = nc.createImageData(normalSize, normalSize);
    const roughCanvas = document.createElement("canvas");
    roughCanvas.width = roughCanvas.height = normalSize;
    const rc = roughCanvas.getContext("2d")!;
    const rough = rc.createImageData(normalSize, normalSize);
    const stride = size / normalSize;
    for (let y = 0; y < normalSize; y++)
      for (let x = 0; x < normalSize; x++) {
        const sx = Math.floor(x * stride),
          sy = Math.floor(y * stride),
          h = heights[sy * size + sx];
        const dx = heights[sy * size + ((sx + stride) % size)] - h;
        const dy = heights[((sy + stride) % size) * size + sx] - h;
        const i = (y * normalSize + x) * 4;
        normals.data[i] = 128 - dx * 1.2;
        normals.data[i + 1] = 128 - dy * 1.2;
        normals.data[i + 2] = 248;
        normals.data[i + 3] = 255;
        rough.data[i] = 205 + h * 0.18;
        rough.data[i + 1] = 185 + h * 0.2;
        rough.data[i + 2] = 0;
        rough.data[i + 3] = 255;
      }
    nc.putImageData(normals, 0, 0);
    rc.putImageData(rough, 0, 0);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const normalMap = new THREE.CanvasTexture(normalCanvas);
    const roughnessMap = new THREE.CanvasTexture(roughCanvas);
    for (const texture of [map, normalMap, roughnessMap]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.anisotropy = currentQuality === "ultra" ? 8 : 4;
      textures.push(texture);
    }
    return { map, normalMap, roughnessMap, aoMap: roughnessMap };
  }
  const earth = surface("earth", 0xc1bca1, 115);
  const stone = surface("plaster", 0xb7b4a2, 1);
  const wood = surface("wood", 0x70523a, 1);
  const rock = surface("rock", 0x7e8580, 2);
  const roof = surface("roof", 0x79574a, 2);
  // Original leaf cluster cutout, used on intersecting foliage cards. The
  // irregular outline gives light and wind a natural silhouette at low cost.
  const foliageCanvas = document.createElement("canvas");
  foliageCanvas.width = foliageCanvas.height = 256;
  const fc = foliageCanvas.getContext("2d")!;
  for (let branch = 0; branch < 12; branch++) {
    const angle = branch * 2.39996,
      reach = 60 + random() * 48;
    const ex = 128 + Math.cos(angle) * reach,
      ey = 128 + Math.sin(angle) * reach;
    fc.strokeStyle = "#625f3c";
    fc.lineWidth = 1.2;
    fc.beginPath();
    fc.moveTo(128, 128);
    fc.lineTo(ex, ey);
    fc.stroke();
    for (let leaf = 0; leaf < 22; leaf++) {
      const t = 0.15 + random() * 0.85;
      const x = 128 + (ex - 128) * t + (random() - 0.5) * 35;
      const y = 128 + (ey - 128) * t + (random() - 0.5) * 35;
      fc.fillStyle = `hsl(${72 + random() * 26}, ${26 + random() * 18}%, ${29 + random() * 22}%)`;
      fc.beginPath();
      fc.ellipse(
        x,
        y,
        4 + random() * 6,
        2.5 + random() * 3,
        angle + random(),
        0,
        Math.PI * 2,
      );
      fc.fill();
    }
  }
  const foliageMap = new THREE.CanvasTexture(foliageCanvas);
  foliageMap.colorSpace = THREE.SRGBColorSpace;
  textures.push(foliageMap);
  const mats = {
    ground: new THREE.MeshStandardMaterial({
      ...earth,
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.98,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    plaster: new THREE.MeshStandardMaterial({
      ...stone,
      color: 0xd7d0b8,
      roughness: 0.88,
      normalScale: new THREE.Vector2(0.2, 0.2),
    }),
    concrete: new THREE.MeshStandardMaterial({
      ...stone,
      color: 0x9ca6a2,
      roughness: 0.94,
      normalScale: new THREE.Vector2(0.4, 0.4),
    }),
    wood: new THREE.MeshStandardMaterial({
      ...wood,
      roughness: 0.85,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    roof: new THREE.MeshStandardMaterial({
      ...roof,
      roughness: 0.78,
      normalScale: new THREE.Vector2(0.7, 0.7),
    }),
    rock: new THREE.MeshStandardMaterial({
      ...rock,
      roughness: 0.94,
      normalScale: new THREE.Vector2(0.65, 0.65),
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x45525a,
      metalness: 0.72,
      roughness: 0.39,
    }),
    painted: new THREE.MeshStandardMaterial({
      color: 0x71847a,
      metalness: 0.45,
      roughness: 0.58,
    }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x7b4e36,
      metalness: 0.48,
      roughness: 0.75,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0xe2daca, roughness: 0.66 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x202b2f, roughness: 0.82 }),
    road: new THREE.MeshStandardMaterial({ color: 0x393c3b, roughness: 0.98 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xd4cfa3, roughness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({
      ...wood,
      color: 0x827362,
      roughness: 1,
    }),
    foliage: new THREE.MeshStandardMaterial({
      map: foliageMap,
      color: 0xd8e1c0,
      alphaTest: 0.45,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    grass: new THREE.MeshStandardMaterial({
      color: 0x9ba36b,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xb0d4d3,
      metalness: 0.1,
      roughness: 0.12,
      transparent: true,
      opacity: 0.3,
      transmission: 0,
      depthWrite: false,
    }),
    light: new THREE.MeshStandardMaterial({
      color: 0xffd7a1,
      emissive: 0xffad55,
      emissiveIntensity: 1.8,
      roughness: 0.4,
    }),
  };
  function setQuality(q: Quality) {
    if (q === currentQuality) return;
    currentQuality = q;
    const nextSize = resolution(q);
    if (nextSize === size) return;
    size = nextSize;
    state = seed >>> 0;
    const oldMaps = new Set<THREE.Texture>();
    const replace = (
      names: (keyof typeof mats)[],
      kind: "earth" | "plaster" | "wood" | "rock" | "roof",
      base: number,
      repeat: number,
    ) => {
      const maps = surface(kind, base, repeat);
      for (const name of names) {
        const material = mats[name];
        for (const field of [
          "map",
          "normalMap",
          "roughnessMap",
          "aoMap",
        ] as const) {
          if (material[field]) oldMaps.add(material[field]!);
          material[field] = maps[field];
        }
        material.needsUpdate = true;
      }
    };
    replace(["ground"], "earth", 0xc1bca1, 115);
    replace(["plaster", "concrete"], "plaster", 0xb7b4a2, 1);
    replace(["wood", "bark"], "wood", 0x70523a, 1);
    replace(["rock"], "rock", 0x7e8580, 2);
    replace(["roof"], "roof", 0x79574a, 2);
    for (const texture of oldMaps) {
      texture.dispose();
      const i = textures.indexOf(texture);
      if (i >= 0) textures.splice(i, 1);
    }
  }
  return {
    mats,
    textures,
    setQuality,
    dispose() {
      Object.values(mats).forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
