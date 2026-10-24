import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getMap } from "../../../lib/color-hide/maps";
import { shotAim, type AimAngles } from "../../../lib/color-hide/aim";
import type {
  MapDefinition,
  MapObject,
  Paint,
  PlayerView,
  RoomView,
} from "../../../lib/color-hide/types";

type Hooks = {
  onLook(yaw: number, pitch: number): void;
  onFire(aim?: AimAngles): void;
  onLock(locked: boolean): void;
  onError(message: string): void;
};
export type ColorHideScene = {
  update(room: RoomView): void;
  fire(): void;
  setCamera(mode: "first" | "third"): void;
  setQuality(low: boolean): void;
  setLook(yaw: number, pitch: number): void;
  dispose(): void;
};
type Actor = {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  gun: THREE.Group;
  colors: Record<keyof Paint, THREE.MeshStandardMaterial>;
  from: THREE.Vector3;
  to: THREE.Vector3;
  last: number;
  yaw: number;
  character: PlayerView["character"];
  view: PlayerView;
};
const clamp = THREE.MathUtils.clamp;
const seed = (n: number) => {
  const x = Math.sin(n * 91.733 + 17.91) * 43758.5453;
  return x - Math.floor(x);
};

/** Original procedural models. Physics and occluders come from the same map data
 * as the authoritative server; rendering never chooses a capture or a winner. */
export function createScene(
  container: HTMLElement,
  hooks: Hooks,
): ColorHideScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 150);
  camera.rotation.order = "YXZ";
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-label", "Color Hide 3D oyun alanı");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.tabIndex = 0;
  Object.assign(renderer.domElement.style, {
    width: "100%",
    height: "100%",
    display: "block",
    touchAction: "none",
    outline: "none",
  });
  container.appendChild(renderer.domElement);
  const hemisphere = new THREE.HemisphereLight(0xdaf1ff, 0x6b664c, 2.1);
  const sun = new THREE.DirectionalLight(0xffe5bf, 3.1);
  sun.position.set(-23, 36, 19);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -37,
    right: 37,
    top: 37,
    bottom: -37,
    near: 0.1,
    far: 100,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(hemisphere, sun, sun.target);
  const resources = {
    geometries: new Set<THREE.BufferGeometry>(),
    materials: new Set<THREE.Material>(),
    textures: new Set<THREE.Texture>(),
  };
  const geoCache = new Map<string, THREE.BufferGeometry>();
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const labelCache = new Map<string, THREE.MeshStandardMaterial>();
  const groundCache = new Map<string, THREE.MeshStandardMaterial>();
  function geo(key: string, factory: () => THREE.BufferGeometry) {
    let g = geoCache.get(key);
    if (!g) {
      g = factory();
      geoCache.set(key, g);
      resources.geometries.add(g);
    }
    return g;
  }
  const box = geo("box", () => new THREE.BoxGeometry(1, 1, 1));
  const round = geo("rounded", () => new RoundedBoxGeometry(1, 1, 1, 2, 0.13));
  const ball = geo("ball", () => new THREE.SphereGeometry(1, 12, 8));
  const cylinder = geo(
    "cylinder",
    () => new THREE.CylinderGeometry(1, 1, 1, 10),
  );
  const cone = geo("cone", () => new THREE.ConeGeometry(1, 1, 5));
  const torus = geo("torus", () => new THREE.TorusGeometry(1, 0.09, 6, 18));
  function material(color: string | number, roughness = 0.82, metalness = 0) {
    const key = `${color}:${roughness}:${metalness}`;
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      matCache.set(key, m);
      resources.materials.add(m);
    }
    return m;
  }
  function part(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const block = (
    p: THREE.Object3D,
    c: string | number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    smooth = false,
  ) => part(p, smooth ? round : box, material(c), x, y, z, w, h, d);
  let world = new THREE.Group();
  scene.add(world);
  let map: MapDefinition | null = null;
  let mapId: string | null = null;
  let worldMerged: THREE.BufferGeometry[] = [];
  let lastRoom: RoomView | null = null;
  let disposed = false,
    mode: "first" | "third" = "third",
    low = matchMedia("(pointer: coarse)").matches;
  let yaw = 0,
    pitch = 0.08,
    raf = 0,
    lastFrame = performance.now(),
    serverOffset = 0;
  let lastRound = -1,
    seenEvent = 0,
    recoil = 0,
    lastPhase = "",
    audio: AudioContext | null = null;
  let blackout = false,
    visible = !document.hidden;
  const actors = new Map<string, Actor>();
  const tmp = new THREE.Vector3(),
    camTarget = new THREE.Vector3(),
    desired = new THREE.Vector3(),
    forward = new THREE.Vector3();
  const black = new THREE.Color("#000000");
  const traces: { mesh: THREE.Mesh; age: number }[] = [];
  let confetti: THREE.InstancedMesh | null = null,
    confettiAge = 0;
  const confettiMatrix = new THREE.Object3D();
  const gunRig = new THREE.Group();
  const muzzle = new THREE.PointLight(0xffd18a, 0, 4);
  camera.add(gunRig, muzzle);
  scene.add(camera);
  gunRig.position.set(0.22, -0.27, -0.6);
  muzzle.position.set(0.23, -0.12, -1.1);

  function shotgun(parent: THREE.Group) {
    const g = new THREE.Group();
    parent.add(g);
    part(g, round, material("#31404d", 0.4, 0.65), 0, 0, 0, 0.16, 0.16, 0.52);
    part(
      g,
      cylinder,
      material("#6b8990", 0.32, 0.8),
      0,
      0.04,
      -0.36,
      0.047,
      0.58,
      0.047,
    ).rotation.x = Math.PI / 2;
    part(
      g,
      cylinder,
      material("#25333b", 0.45, 0.7),
      0,
      -0.04,
      -0.28,
      0.043,
      0.44,
      0.043,
    ).rotation.x = Math.PI / 2;
    part(g, round, material("#cc9a62"), 0, -0.01, -0.24, 0.13, 0.12, 0.2);
    part(g, round, material("#cc9a62"), 0, -0.035, 0.31, 0.11, 0.17, 0.32);
    part(
      g,
      round,
      material("#cc9a62"),
      0,
      -0.12,
      0.1,
      0.095,
      0.2,
      0.12,
    ).rotation.x = -0.3;
    part(
      g,
      box,
      material("#e2bf70", 0.5, 0.5),
      0,
      0.13,
      -0.5,
      0.025,
      0.04,
      0.03,
    );
    return g;
  }
  shotgun(gunRig);
  part(
    gunRig,
    round,
    material("#516a60"),
    -0.055,
    -0.14,
    0.3,
    0.14,
    0.18,
    0.34,
  );
  part(
    gunRig,
    round,
    material("#516a60"),
    -0.14,
    -0.1,
    -0.15,
    0.12,
    0.16,
    0.3,
  ).rotation.y = -0.3;
  gunRig.visible = false;

  function groundTexture(def: MapDefinition) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = def.ground;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const x = seed(i + 2) * 256,
        y = seed(i + 7) * 256;
      ctx.fillStyle = i % 2 ? "rgba(255,255,230,.055)" : "rgba(30,42,29,.055)";
      ctx.fillRect(x, y, seed(i + 11) * 3 + 1, seed(i + 17) * 3 + 1);
    }
    if (def.id === "forest") {
      ctx.strokeStyle = "rgba(32,60,29,.13)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 100; i++) {
        const x = seed(i * 3) * 256,
          y = seed(i * 7) * 256;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2, y - 5);
        ctx.stroke();
      }
    } else if (def.id === "school") {
      ctx.strokeStyle = "rgba(60,70,55,.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 256; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    resources.textures.add(tex);
    return tex;
  }
  function label(text: string, color = "#284c50", paper = "#efd99f") {
    const key = `${text}:${color}:${paper}`;
    const existing = labelCache.get(key);
    if (existing) return existing;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, 488, 104);
    ctx.fillStyle = color;
    ctx.font = "bold 47px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 66, 455);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    resources.textures.add(tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    resources.materials.add(mat);
    labelCache.set(key, mat);
    return mat;
  }
  function tree(parent: THREE.Group, o: MapObject) {
    const { x, z, width: w, height: h } = o;
    part(parent, cylinder, material(o.color), x, h / 2, z, w / 2, h, w / 2);
    for (const side of [-1, 1]) {
      const limb = part(
        parent,
        cylinder,
        material(o.color),
        x + side * 0.55,
        h * 0.74,
        z,
        0.17,
        1.8,
        0.17,
      );
      limb.rotation.z = side * -0.5;
    }
    const colors =
      mapId === "forest"
        ? ["#739957", "#648e55", "#86a65d"]
        : ["#6e9e82", "#8baa77", "#789b83"];
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      part(
        parent,
        ball,
        material(colors[i % 3]),
        x + Math.sin(a) * 1.25,
        h + 0.1 + (i % 2) * 0.55,
        z + Math.cos(a) * 1.1,
        1.5,
        1.35,
        1.5,
      );
    }
  }
  function wall(parent: THREE.Group, o: MapObject) {
    const { x, z, width: w, depth: d, height: h } = o,
      y = o.y ?? 0;
    block(parent, o.color, x, y + h / 2, z, w, h, d);
    if (h < 2 || y > 0 || w > 60 || d > 60) return;
    const wide = w > d;
    block(parent, "#f1e5cb", x, 0.12, z, w + 0.04, 0.24, d + 0.04);
    block(parent, "#f1e5cb", x, h - 0.12, z, w + 0.08, 0.16, d + 0.08);
    // Opaque decorative inset windows keep wall geometry and server occlusion
    // consistent. Only the actual gaps in the shared map are passages.
    const length = Math.max(w, d),
      count = Math.floor(length / 3);
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * 2.8;
      for (const side of [-1, 1]) {
        const px = x + (wide ? along : side * (w / 2 + 0.035));
        const pz = z + (wide ? side * (d / 2 + 0.035) : along);
        block(
          parent,
          "#eee2c9",
          px,
          2,
          pz,
          wide ? 1.35 : 0.08,
          1.35,
          wide ? 0.08 : 1.35,
        );
        block(
          parent,
          "#719eab",
          px + (!wide ? side * 0.05 : 0),
          2.05,
          pz + (wide ? side * 0.05 : 0),
          wide ? 1.13 : 0.035,
          1.1,
          wide ? 0.035 : 1.13,
        );
        block(
          parent,
          "#ded9c1",
          px + (!wide ? side * 0.08 : 0),
          2.05,
          pz + (wide ? side * 0.08 : 0),
          wide ? 0.045 : 0.025,
          1.1,
          wide ? 0.025 : 0.045,
        );
      }
    }
  }
  function object(parent: THREE.Group, o: MapObject) {
    const { x, z, width: w, depth: d, height: h } = o,
      base = o.y ?? 0;
    switch (o.kind) {
      case "tree":
        tree(parent, o);
        break;
      case "bush":
        for (let i = 0; i < 4; i++)
          part(
            parent,
            ball,
            material(i % 2 ? o.color : "#4f7d48"),
            x + (i % 2 ? 1 : -1) * w * 0.18,
            h * 0.45,
            z + (i < 2 ? 1 : -1) * d * 0.17,
            w * 0.36,
            h * 0.6,
            d * 0.38,
          );
        break;
      case "rock":
        block(parent, o.color, x, base + h / 2, z, w, h, d, true);
        block(
          parent,
          "#98a07c",
          x + w * 0.06,
          base + h - 0.09,
          z,
          w * 0.7,
          0.18,
          d * 0.7,
          true,
        );
        break;
      case "wall":
        wall(parent, o);
        break;
      case "roof":
        block(parent, o.color, x, base + h / 2, z, w, h, d, true);
        if (mapId !== "forest")
          for (let i = 0; i < Math.floor(w); i++)
            block(
              parent,
              "#86938b",
              x - w / 2 + i + 0.5,
              base + h + 0.015,
              z,
              0.055,
              0.035,
              d,
            );
        break;
      case "crate":
        block(parent, o.color, x, base + h / 2, z, w, h, d, true);
        for (const side of [-1, 1]) {
          block(
            parent,
            "#746d53",
            x + side * w * 0.32,
            h / 2,
            z,
            0.09,
            h + 0.03,
            d + 0.04,
          );
          block(
            parent,
            "#bba77d",
            x,
            h * 0.84,
            z + (side * d) / 2,
            w,
            0.11,
            0.06,
          );
        }
        break;
      case "car": {
        block(parent, o.color, x, 0.62, z, w, 0.65, d, true);
        block(
          parent,
          o.color,
          x,
          1.17,
          z + 0.15,
          w * 0.84,
          0.85,
          d * 0.53,
          true,
        );
        block(parent, "#b3d4db", x, 1.29, z - d * 0.21, w * 0.72, 0.48, 0.055);
        block(parent, "#809fae", x, 1.29, z + d * 0.3, w * 0.72, 0.48, 0.055);
        for (const s of [-1, 1]) {
          block(
            parent,
            "#9dbfcb",
            x + s * w * 0.425,
            1.28,
            z + 0.15,
            0.035,
            0.47,
            d * 0.36,
          );
          for (const t of [-1, 1]) {
            const wheel = part(
              parent,
              cylinder,
              material("#30404a"),
              x + s * w * 0.46,
              0.38,
              z + t * d * 0.31,
              0.37,
              0.25,
              0.37,
            );
            wheel.rotation.z = Math.PI / 2;
          }
          block(
            parent,
            "#fce9b0",
            x + s * w * 0.33,
            0.76,
            z - d / 2 - 0.01,
            0.32,
            0.19,
            0.03,
          );
          block(
            parent,
            "#d96962",
            x + s * w * 0.33,
            0.76,
            z + d / 2 + 0.01,
            0.3,
            0.15,
            0.03,
          );
        }
        block(parent, "#8a9b9d", x, 0.46, z - d / 2, w * 0.8, 0.12, 0.15);
        break;
      }
      case "desk":
        block(parent, o.color, x, h - 0.09, z, w, 0.18, d, true);
        for (const s of [-1, 1])
          for (const t of [-1, 1])
            block(
              parent,
              "#687980",
              x + s * (w / 2 - 0.16),
              h / 2 - 0.08,
              z + t * (d / 2 - 0.16),
              0.12,
              h - 0.18,
              0.12,
            );
        block(
          parent,
          "#e7dbb2",
          x - w * 0.2,
          h + 0.015,
          z,
          w * 0.3,
          0.025,
          d * 0.4,
        );
        block(
          parent,
          "#4e7e8c",
          x + w * 0.23,
          h + 0.055,
          z + 0.1,
          0.37,
          0.09,
          0.5,
        );
        break;
      case "locker":
        block(parent, o.color, x, h / 2, z, w, h, d, true);
        for (let i = 0; i < 3; i++) {
          block(
            parent,
            "#445c64",
            x + w / 2 + 0.02,
            h / 2,
            z + ((i - 1) * d) / 3,
            0.025,
            h * 0.9,
            0.018,
          );
          block(
            parent,
            "#d4dcc8",
            x + w / 2 + 0.04,
            h * 0.5,
            z + ((i - 1) * d) / 3 + 0.14,
            0.06,
            0.18,
            0.035,
          );
          for (let j = 0; j < 3; j++)
            block(
              parent,
              "#4b6972",
              x + w / 2 + 0.025,
              h * 0.8 - j * 0.08,
              z + ((i - 1) * d) / 3,
              0.035,
              0.035,
              d * 0.2,
            );
        }
        break;
      case "bench":
        block(parent, o.color, x, 0.58, z, w, 0.15, d, true);
        block(parent, o.color, x, 1.02, z + d * 0.43, w, 0.56, 0.15, true);
        for (const s of [-1, 1])
          block(
            parent,
            "#52635b",
            x + s * w * 0.35,
            0.29,
            z,
            0.16,
            0.58,
            d * 0.85,
          );
        break;
      case "lamp":
        part(parent, cylinder, material(o.color), x, h / 2, z, 0.12, h, 0.12);
        block(parent, o.color, x + 0.35, h - 0.03, z, 1, 0.12, 0.25, true);
        block(parent, "#f7e3ab", x + 0.7, h - 0.17, z, 0.65, 0.15, 0.4, true);
        break;
      case "sign": {
        const sign = part(
          parent,
          box,
          label(
            mapId === "forest"
              ? "RENK KORUSU"
              : mapId === "school"
                ? "XARMY OKULU"
                : x < 0
                  ? "RENK KAFE"
                  : "KÖŞE DÜKKÂN",
          ),
          x,
          base + h * 0.78,
          z,
          w,
          h * 0.35,
          d,
        );
        sign.receiveShadow = true;
        if (!base)
          for (const s of [-1, 1])
            block(
              parent,
              "#82775c",
              x + s * w * 0.32,
              h * 0.32,
              z,
              0.09,
              h * 0.64,
              0.09,
            );
        break;
      }
    }
  }

  function buildMap(def: MapDefinition) {
    scene.remove(world);
    for (const geometry of worldMerged) {
      geometry.dispose();
      resources.geometries.delete(geometry);
    }
    worldMerged = [];
    world = new THREE.Group();
    scene.add(world);
    map = def;
    mapId = def.id;
    scene.background = new THREE.Color(def.sky);
    scene.fog = new THREE.Fog(def.sky, 35, 105);
    let ground = groundCache.get(def.id);
    if (!ground) {
      ground = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: groundTexture(def),
        roughness: 1,
      });
      resources.materials.add(ground);
      groundCache.set(def.id, ground);
    }
    const staticGroup = new THREE.Group();
    part(staticGroup, box, ground, 0, -0.25, 0, 67, 0.5, 67);
    if (def.id === "city") {
      block(staticGroup, "#687b83", 0, 0.007, 0, 12, 0.012, 63);
      block(staticGroup, "#687b83", 0, 0.01, 0, 63, 0.012, 7);
      for (let z = -29; z < 29; z += 6)
        block(staticGroup, "#e9d8a0", 0, 0.025, z, 0.12, 0.01, 2.5);
      for (const x of [-7.2, 7.2])
        block(staticGroup, "#d5ccaf", x, 0.04, 0, 2.4, 0.08, 63);
      for (let x = -5; x < 6; x += 1.3)
        block(staticGroup, "#e7ddc5", x, 0.035, 21, 0.7, 0.015, 3.8);
    } else if (def.id === "school") {
      block(staticGroup, "#e2d8bc", 0, 0.015, -3, 11, 0.025, 54);
      block(staticGroup, "#b8a082", 18, 0.025, 8, 15.6, 0.03, 15.6);
      for (const x of [11, 25])
        block(staticGroup, "#ecdfbd", x, 0.05, 8, 0.07, 0.01, 13);
      for (const z of [1.5, 14.5])
        block(staticGroup, "#ecdfbd", 18, 0.05, z, 14, 0.01, 0.07);
      const ring = part(
        staticGroup,
        torus,
        material("#ecdfbd"),
        18,
        0.07,
        8,
        2,
        2,
        2,
      );
      ring.rotation.x = -Math.PI / 2;
      block(staticGroup, "#ecdfbd", 18, 0.05, 8, 14, 0.01, 0.07);
      // Courtyard hopscotch uses geometry rather than external assets.
      for (let i = 0; i < 5; i++)
        block(
          staticGroup,
          ["#e0b67c", "#9bbdaf", "#bc9db3"][i % 3],
          -2 + (i % 2) * 2,
          0.035,
          18 - i * 2,
          1.6,
          0.025,
          1.6,
        );
    } else {
      for (let z = -30; z < 30; z++)
        block(
          staticGroup,
          "#a49a6c",
          Math.sin(z * 0.1) * 2,
          0.006,
          z,
          4.4,
          0.012,
          1.05,
        );
      for (let x = -28; x < 29; x++)
        block(
          staticGroup,
          "#a49a6c",
          x,
          0.009,
          7 + Math.sin(x * 0.09) * 2,
          1.05,
          0.012,
          2.5,
        );
      for (let i = 0; i < 95; i++) {
        const x = seed(i * 5 + 3) * 59 - 29.5,
          z = seed(i * 7 + 4) * 59 - 29.5;
        if (Math.abs(x) < 5 || Math.abs(z - 7) < 4) continue;
        const c = i % 9 === 0 ? "#e0be79" : "#7ea15b";
        part(staticGroup, cone, material(c), x, 0.16, z, 0.08, 0.32, 0.08);
        if (i % 9 === 0)
          part(
            staticGroup,
            ball,
            material("#df9b7b"),
            x,
            0.32,
            z,
            0.15,
            0.08,
            0.15,
          );
      }
    }
    for (const o of def.objects) object(staticGroup, o);
    // Static detail is baked by material, dramatically reducing draw calls on
    // phones. The trees/windows/desks do not create per-frame JS objects.
    staticGroup.updateMatrixWorld(true);
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    staticGroup.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
      let geometry = node.geometry.clone();
      if (geometry.index) {
        const indexed = geometry;
        geometry = indexed.toNonIndexed();
        indexed.dispose();
      }
      geometry.applyMatrix4(node.matrixWorld);
      if (!groups.has(node.material)) groups.set(node.material, []);
      groups.get(node.material)!.push(geometry);
    });
    for (const [mat, geometries] of groups) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      resources.geometries.add(merged);
      worldMerged.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      world.add(mesh);
    }
    // A distant silhouette gives the finite arena a landscape, without adding
    // collision or hiding spots outside its explicit boundary.
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6,
        r = 47;
      const g = def.id === "forest" ? cone : box;
      const mountain = part(
        world,
        g,
        material(def.id === "forest" ? "#83a397" : "#a0b6b5"),
        Math.sin(a) * r,
        4 + seed(i) * 3,
        Math.cos(a) * r,
        6 + seed(i + 8) * 5,
        8 + seed(i) * 6,
        7,
      );
      mountain.castShadow = false;
    }
    applyQuality();
  }

  function makeActor(view: PlayerView): Actor {
    const root = new THREE.Group(),
      torso = new THREE.Group(),
      head = new THREE.Group();
    const leftArm = new THREE.Group(),
      rightArm = new THREE.Group(),
      leftLeg = new THREE.Group(),
      rightLeg = new THREE.Group();
    root.scale.setScalar(0.8);
    const colors = Object.fromEntries(
      Object.entries(view.paint).map(([key, value]) => {
        const m = new THREE.MeshStandardMaterial({
          color: value,
          roughness: 0.83,
        });
        resources.materials.add(m);
        return [key, m];
      }),
    ) as Actor["colors"];
    const soft = view.character === "robot" ? round : ball;
    torso.position.y = 1.02;
    root.add(torso);
    part(torso, round, colors.body, 0, 0.05, 0, 0.62, 0.64, 0.38);
    part(torso, round, colors.body, 0, 0.13, 0.24, 0.42, 0.45, 0.16);
    head.position.set(0, 0.62, 0);
    torso.add(head);
    part(
      head,
      soft,
      colors.head,
      0,
      0,
      0,
      view.character === "robot" ? 0.51 : 0.27,
      view.character === "robot" ? 0.46 : 0.28,
      view.character === "robot" ? 0.45 : 0.25,
    );
    for (const s of [-1, 1]) {
      part(
        head,
        ball,
        material("#f5f0d8"),
        s * 0.105,
        0.045,
        -0.224,
        0.068,
        0.09,
        0.033,
      );
      part(
        head,
        ball,
        material("#2e4145"),
        s * 0.105,
        0.04,
        -0.25,
        0.03,
        0.046,
        0.018,
      );
    }
    if (view.character === "fox") {
      for (const s of [-1, 1]) {
        const ear = part(
          head,
          cone,
          colors.head,
          s * 0.18,
          0.31,
          0.01,
          0.13,
          0.3,
          0.11,
        );
        ear.rotation.z = -s * 0.2;
      }
      part(
        head,
        cone,
        colors.head,
        0,
        -0.08,
        -0.27,
        0.11,
        0.13,
        0.11,
      ).rotation.x = -Math.PI / 2;
      const tail = part(
        torso,
        cone,
        colors.body,
        0,
        -0.15,
        0.46,
        0.13,
        0.45,
        0.13,
      );
      tail.rotation.x = 0.75;
    } else if (view.character === "scout") {
      part(head, cylinder, colors.head, 0, 0.24, 0, 0.3, 0.12, 0.28);
      part(head, ball, colors.head, 0, 0.29, 0.025, 0.24, 0.16, 0.22);
    } else {
      part(head, cylinder, colors.head, 0, 0.31, 0, 0.025, 0.19, 0.025);
      part(head, ball, colors.head, 0, 0.42, 0, 0.065, 0.065, 0.065);
      for (const s of [-1, 1])
        part(
          head,
          cylinder,
          colors.head,
          s * 0.29,
          0,
          0,
          0.075,
          0.1,
          0.075,
        ).rotation.z = Math.PI / 2;
    }
    for (const [group, side] of [
      [leftArm, -1],
      [rightArm, 1],
    ] as const) {
      group.position.set(side * 0.39, 0.22, 0);
      torso.add(group);
      part(group, round, colors.body, 0, -0.23, 0, 0.2, 0.48, 0.22);
      part(group, ball, colors.head, 0, -0.49, 0, 0.105, 0.13, 0.11);
    }
    for (const [group, side] of [
      [leftLeg, -1],
      [rightLeg, 1],
    ] as const) {
      group.position.set(side * 0.16, 0.78, 0);
      root.add(group);
      part(group, round, colors.legs, 0, -0.3, 0, 0.245, 0.62, 0.25);
      part(group, round, colors.legs, 0, -0.68, -0.065, 0.26, 0.2, 0.38);
    }
    const gun = shotgun(torso);
    gun.position.set(0.27, -0.05, -0.34);
    gun.visible = view.team === "seeker";
    scene.add(root);
    const position = view.position ?? { x: 0, y: 0, z: 0 };
    root.position.set(position.x, position.y, position.z);
    return {
      root,
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      gun,
      colors,
      from: root.position.clone(),
      to: root.position.clone(),
      last: performance.now(),
      yaw: view.yaw,
      character: view.character,
      view,
    };
  }
  function removeActor(actor: Actor) {
    scene.remove(actor.root);
    for (const m of Object.values(actor.colors)) {
      m.dispose();
      resources.materials.delete(m);
    }
  }
  function unlockAudio() {
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") void audio.resume().catch(() => {});
    } catch {
      /* Audio is optional; mobile browsers can deny activation. */
    }
  }
  function sound(kind: "shot" | "capture" | "win", gain = 1) {
    if (!audio || audio.state !== "running") return;
    const t = audio.currentTime;
    if (kind === "shot") {
      const duration = 0.16,
        buffer = audio.createBuffer(
          1,
          Math.ceil(audio.sampleRate * duration),
          audio.sampleRate,
        ),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] = (seed(i * 7 + seenEvent) * 2 - 1) * (1 - i / data.length);
      const source = audio.createBufferSource(),
        filter = audio.createBiquadFilter(),
        volume = audio.createGain();
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1900, t);
      filter.frequency.exponentialRampToValueAtTime(150, t + duration);
      volume.gain.setValueAtTime(0.23 * gain, t);
      volume.gain.exponentialRampToValueAtTime(0.001, t + duration);
      source.connect(filter).connect(volume).connect(audio.destination);
      source.start(t);
      source.stop(t + duration);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        volume.disconnect();
      };
    } else {
      const notes = kind === "win" ? [392, 494, 587, 784] : [640, 900];
      notes.forEach((frequency, i) => {
        const oscillator = audio!.createOscillator(),
          volume = audio!.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0, t + i * 0.11);
        volume.gain.linearRampToValueAtTime(0.1 * gain, t + i * 0.11 + 0.015);
        volume.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.24);
        oscillator.connect(volume).connect(audio!.destination);
        oscillator.start(t + i * 0.11);
        oscillator.stop(t + i * 0.11 + 0.25);
        oscillator.onended = () => {
          oscillator.disconnect();
          volume.disconnect();
        };
      });
    }
  }
  function startConfetti() {
    if (confetti) {
      scene.remove(confetti);
      confetti.dispose();
    }
    confetti = new THREE.InstancedMesh(box, material("#ffffff"), 100);
    confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    confetti.frustumCulled = false;
    for (let i = 0; i < 100; i++)
      confetti.setColorAt(
        i,
        new THREE.Color(["#f2c75e", "#8acdb7", "#dc8f9d", "#a4bdf4"][i % 4]),
      );
    scene.add(confetti);
    confettiAge = 0;
  }
  function update(room: RoomView) {
    if (disposed) return;
    const now = performance.now();
    serverOffset = room.serverTime - now;
    if (room.map !== mapId) buildMap(getMap(room.map));
    const own = room.players.find((p) => p.id === room.you);
    blackout =
      !!own &&
      own.team === "seeker" &&
      (room.phase === "hiding" || room.phase === "drawing");
    if (lastRound !== room.round) {
      lastRound = room.round;
      seenEvent = 0;
      recoil = 0;
      if (confetti) {
        scene.remove(confetti);
        confetti.dispose();
        confetti = null;
      }
    }
    const present = new Set(room.players.map((p) => p.id));
    for (const [id, actor] of actors)
      if (!present.has(id)) {
        removeActor(actor);
        actors.delete(id);
      }
    for (const player of room.players) {
      let actor = actors.get(player.id);
      if (actor && actor.character !== player.character) {
        removeActor(actor);
        actors.delete(player.id);
        actor = undefined;
      }
      if (!actor) {
        actor = makeActor(player);
        actors.set(player.id, actor);
      }
      actor.view = player;
      actor.from.copy(actor.root.position);
      if (player.position)
        actor.to.set(player.position.x, player.position.y, player.position.z);
      actor.last = now;
      actor.gun.visible = player.team === "seeker";
      for (const key of ["head", "body", "legs"] as const)
        actor.colors[key].color.set(player.paint[key]);
      actor.root.visible =
        !!player.position &&
        !blackout &&
        !(player.id === room.you && mode === "first");
      // Release transitions/teleports must not interpolate from a black room.
      if (
        !lastRoom ||
        lastRoom.phase !== room.phase ||
        actor.from.distanceTo(actor.to) > 10
      )
        actor.from.copy(actor.to);
    }
    for (const event of room.events) {
      if (event.id <= seenEvent) continue;
      seenEvent = event.id;
      if (blackout || room.serverTime - event.at > 1000) continue;
      if (event.type === "shot" && event.position && event.direction) {
        const self = event.playerId === room.you;
        if (self) {
          recoil = 1;
          muzzle.intensity = 1.5;
        }
        const distance = own?.position
          ? Math.hypot(
              event.position.x - own.position.x,
              event.position.z - own.position.z,
            )
          : 30;
        sound("shot", self ? 1 : Math.max(0.06, 1 - distance / 40) * 0.5);
        const trace = new THREE.Mesh(cylinder, material("#f9d385"));
        const direction = new THREE.Vector3(
          event.direction.x,
          event.direction.y,
          event.direction.z,
        ).normalize();
        const length = 4;
        trace.scale.set(0.015, length, 0.015);
        trace.position
          .set(event.position.x, event.position.y, event.position.z)
          .addScaledVector(direction, 2.8);
        trace.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction,
        );
        scene.add(trace);
        traces.push({ mesh: trace, age: 0 });
      } else if (
        event.type === "capture" &&
        (event.playerId === room.you || event.targetId === room.you)
      )
        sound("capture");
    }
    if (room.phase === "finished" && lastPhase !== "finished") {
      startConfetti();
      sound("win");
    }
    lastPhase = room.phase;
    lastRoom = room;
  }

  function resize() {
    const width = Math.max(1, container.clientWidth),
      height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5),
    );
    renderer.setSize(width, height, false);
  }
  function applyQuality() {
    renderer.shadowMap.enabled = !low;
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  // Camera collision uses the same AABBs as the server. A third-person camera
  // cannot pull back through a classroom wall to reveal the neighboring room.
  function cameraFraction(start: THREE.Vector3, end: THREE.Vector3) {
    if (!map) return 1;
    let fraction = 1;
    for (const o of map.objects) {
      if (!o.solid) continue;
      const min = [
        o.x - o.width / 2 - 0.16,
        (o.y ?? 0) - 0.16,
        o.z - o.depth / 2 - 0.16,
      ];
      const max = [
        o.x + o.width / 2 + 0.16,
        (o.y ?? 0) + o.height + 0.16,
        o.z + o.depth / 2 + 0.16,
      ];
      const from = [start.x, start.y, start.z],
        to = [end.x, end.y, end.z];
      let near = 0,
        far = fraction,
        intersects = true;
      for (let axis = 0; axis < 3; axis++) {
        const delta = to[axis] - from[axis];
        if (Math.abs(delta) < 0.00001) {
          if (from[axis] < min[axis] || from[axis] > max[axis]) {
            intersects = false;
            break;
          }
        } else {
          let a = (min[axis] - from[axis]) / delta,
            b = (max[axis] - from[axis]) / delta;
          if (a > b) [a, b] = [b, a];
          near = Math.max(near, a);
          far = Math.min(far, b);
          if (near > far) {
            intersects = false;
            break;
          }
        }
      }
      if (intersects && near >= 0 && near < fraction)
        fraction = Math.max(0, near - 0.035);
    }
    return fraction;
  }
  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (!visible) {
      lastFrame = now;
      return;
    }
    // Akıcı/mobile mode budgets rendering at ~30 FPS. Input, the server's
    // 20 Hz simulation and 10 Hz snapshots keep their independent clocks.
    // Keep lastFrame unchanged on skipped callbacks so animation dt measures
    // the actual interval between rendered frames rather than the rAF rate.
    if (low && now - lastFrame < 1000 / 30 - 0.5) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!lastRoom || !map) {
      renderer.render(scene, camera);
      return;
    }
    const own = actors.get(lastRoom.you);
    if (blackout) {
      renderer.setClearColor(black);
      renderer.clear();
      gunRig.visible = false;
      return;
    }
    scene.background =
      scene.background instanceof THREE.Color && scene.background.equals(black)
        ? new THREE.Color(map.sky)
        : scene.background;
    const serverNow = now + serverOffset;
    for (const actor of actors.values()) {
      const p = actor.view;
      actor.root.visible =
        !!p.position && !(p.id === lastRoom.you && mode === "first");
      actor.root.position.lerpVectors(
        actor.from,
        actor.to,
        clamp((now - actor.last) / 100, 0, 1),
      );
      const angle = p.id === lastRoom.you ? yaw : p.yaw;
      actor.root.rotation.y +=
        THREE.MathUtils.euclideanModulo(
          angle - actor.root.rotation.y + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      const crouch = p.crouching ? 0.5 : 1;
      actor.torso.position.y = THREE.MathUtils.damp(
        actor.torso.position.y,
        p.crouching ? 0.42 : 1.02,
        16,
        dt,
      );
      actor.head.rotation.x = p.pitch * -0.45;
      actor.head.position.y = THREE.MathUtils.damp(
        actor.head.position.y,
        p.crouching ? 0.4 : 0.62,
        16,
        dt,
      );
      actor.leftLeg.scale.y = actor.rightLeg.scale.y = crouch;
      actor.leftLeg.position.y = actor.rightLeg.position.y = 0.78 * crouch;
      const gait = p.moving ? Math.sin(now * 0.012) * 0.5 : 0;
      actor.leftLeg.rotation.x = gait;
      actor.rightLeg.rotation.x = -gait;
      actor.leftArm.rotation.x = p.team === "seeker" ? 1.1 : -gait * 0.8;
      actor.rightArm.rotation.x = p.team === "seeker" ? 0.9 : gait * 0.8;
      actor.torso.rotation.z = p.moving ? Math.sin(now * 0.012) * 0.025 : 0;
      if (p.reloadEndsAt > serverNow)
        actor.gun.rotation.x =
          Math.sin(((p.reloadEndsAt - serverNow) / 1800) * Math.PI) * 0.6;
      else actor.gun.rotation.x = 0;
    }
    if (own?.view.position) {
      const stanceHeight = own.view.crouching ? 0.82 : 1.42;
      camTarget.copy(own.root.position).y += stanceHeight;
      forward.set(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      if (mode === "first") camera.position.copy(camTarget);
      else {
        desired.copy(camTarget).addScaledVector(forward, -3.3);
        desired.x += Math.cos(yaw) * 0.6;
        desired.z -= Math.sin(yaw) * 0.6;
        desired.y += 0.45;
        camera.position
          .copy(camTarget)
          .lerp(desired, cameraFraction(camTarget, desired));
      }
      tmp.copy(camTarget).addScaledVector(forward, 30);
      camera.lookAt(tmp);
      gunRig.visible =
        mode === "first" &&
        own.view.team === "seeker" &&
        lastRoom.phase === "seeking";
      recoil = Math.max(0, recoil - dt * 6);
      gunRig.position.z = -0.6 + recoil * 0.11;
      gunRig.rotation.x =
        recoil * 0.12 +
        (own.view.reloadEndsAt > serverNow
          ? -0.45 *
            Math.sin(((own.view.reloadEndsAt - serverNow) / 1800) * Math.PI)
          : 0);
      gunRig.position.y =
        -0.27 + (own.view.moving ? Math.sin(now * 0.012) * 0.012 : 0);
      muzzle.intensity *= Math.exp(-dt * 24);
    }
    for (let i = traces.length - 1; i >= 0; i--) {
      traces[i].age += dt;
      if (traces[i].age > 0.07) {
        scene.remove(traces[i].mesh);
        traces.splice(i, 1);
      }
    }
    if (confetti && own) {
      confettiAge += dt;
      for (let i = 0; i < confetti.count; i++) {
        const age = (confettiAge + seed(i + 13) * 4) % 4;
        confettiMatrix.position.set(
          own.root.position.x +
            (seed(i + 2) - 0.5) * 10 +
            Math.sin(age + i) * 0.4,
          7 - age * 2,
          own.root.position.z + (seed(i + 3) - 0.5) * 10,
        );
        confettiMatrix.rotation.set(age * 2 + i, age + i, age * 3);
        confettiMatrix.scale.set(0.1, 0.035, 0.17);
        confettiMatrix.updateMatrix();
        confetti.setMatrixAt(i, confettiMatrix.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function fire() {
    const own = lastRoom?.players.find((p) => p.id === lastRoom?.you);
    if (
      !own?.position ||
      blackout ||
      !map ||
      lastRoom?.phase !== "seeking" ||
      own.team !== "seeker"
    )
      return;
    camera.getWorldDirection(tmp);
    const eyes = {
      ...own.position,
      y: own.position.y + (own.crouching ? 0.82 : 1.42),
    };
    const targets = [...actors.values()]
      .filter(
        (a) =>
          a.view.id !== own.id &&
          a.view.team === "hider" &&
          a.view.position !== null,
      )
      .map((a) => ({
        position: {
          x: a.root.position.x,
          y: a.root.position.y,
          z: a.root.position.z,
        },
        crouching: a.view.crouching,
      }));
    hooks.onFire(shotAim(camera.position, tmp, eyes, map.objects, targets));
  }

  let drag: { id: number; x: number; y: number } | null = null;
  const canvas = renderer.domElement;
  const onPointerDown = (event: PointerEvent) => {
    unlockAudio();
    // Pointer capture is invalid while the mouse is locked. Locked look already
    // receives movement events, so right clicks must not enter the drag path.
    if (document.pointerLockElement === canvas) {
      if (event.pointerType !== "touch" && event.button === 0) fire();
      canvas.focus({ preventScroll: true });
      event.preventDefault();
      return;
    }
    if (event.pointerType === "touch" || event.button === 2) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // A pointer cancelled during a lock/focus transition cannot start a drag.
        drag = null;
      }
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (canvas.requestPointerLock) {
      try {
        const result = canvas.requestPointerLock();
        if (result && typeof result.catch === "function")
          void result.catch(() => hooks.onLock(false));
      } catch {
        hooks.onLock(false);
      }
    }
    canvas.focus({ preventScroll: true });
  };
  const look = (dx: number, dy: number) => {
    yaw -= dx * 0.0025;
    pitch = clamp(pitch - dy * 0.0025, -1.2, 1.2);
    hooks.onLook(yaw, pitch);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (document.pointerLockElement === canvas)
      look(event.movementX, event.movementY);
    else if (drag?.id === event.pointerId) {
      look(event.clientX - drag.x, event.clientY - drag.y);
      drag.x = event.clientX;
      drag.y = event.clientY;
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) {
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    }
  };
  const onLock = () => hooks.onLock(document.pointerLockElement === canvas);
  const onContextMenu = (event: Event) => event.preventDefault();
  const onVisibility = () => {
    visible = !document.hidden;
    if (!visible) {
      drag = null;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    hooks.onError(
      "3D görüntü kesildi. Odaya yeniden bağlanmak için sayfayı yenile.",
    );
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("pointerlockchange", onLock);
  document.addEventListener("visibilitychange", onVisibility);
  // Buttons (including mobile fire) also activate browser audio, without making
  // a sound or a shot until the server acknowledges the actual game action.
  const onGesture = () => unlockAudio();
  document.addEventListener("pointerdown", onGesture);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  applyQuality();
  camera.position.set(0, 3, 28);
  camera.lookAt(0, 1, 0);
  raf = requestAnimationFrame(frame);
  return {
    update,
    fire,
    setCamera(value) {
      mode = value;
    },
    setQuality(value) {
      low = value;
      applyQuality();
    },
    setLook(nextYaw, nextPitch) {
      yaw = nextYaw;
      pitch = clamp(nextPitch, -1.2, 1.2);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      document.removeEventListener("pointerlockchange", onLock);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onGesture);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (audio) void audio.close().catch(() => {});
      confetti?.dispose();
      for (const g of resources.geometries) g.dispose();
      for (const m of resources.materials) m.dispose();
      for (const t of resources.textures) t.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      actors.clear();
    },
  };
}
