"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Keys = {
  w: boolean; a: boolean; s: boolean; d: boolean;
  shift: boolean; space: boolean; e: boolean; f: boolean;
};

type WeaponType = "PISTOL" | "RIFLE" | "SHOTGUN";

type WeaponStats = {
  name: string;
  damage: number;      // 10
  cooldown: number;    // seconds
  maxRange: number;
  accuracyNear: number;
  accuracyFar: number;
  ammo: number;
};

const WEAPONS: Record<WeaponType, WeaponStats> = {
  PISTOL:  { name: "Pistol",  damage: 10, cooldown: 0.22, maxRange: 30, accuracyNear: 0.55, accuracyFar: 0.20, ammo: 18 },
  RIFLE:   { name: "Rifle",   damage: 10, cooldown: 0.12, maxRange: 40, accuracyNear: 0.65, accuracyFar: 0.28, ammo: 30 },
  SHOTGUN: { name: "Shotgun", damage: 10, cooldown: 0.55, maxRange: 18, accuracyNear: 0.75, accuracyFar: 0.18, ammo: 8  },
};

type Bot = {
  mesh: THREE.Group;
  hp: number;
  weapon: WeaponType | null;
  shootCd: number;
  alive: boolean;
  hand?: THREE.Object3D;
};

type Medkit = { mesh: THREE.Group; taken: boolean };
type WeaponLoot = { mesh: THREE.Group; taken: boolean; type: WeaponType };
type BuildWall = { mesh: THREE.Mesh; hp: number; box: THREE.Box3 };

type Tracer = { line: THREE.Line; life: number; maxLife: number };
type DmgPop = { id: string; world: THREE.Vector3; text: string; life: number; maxLife: number };

const BOT_NAMES = [
  "Polat Alemdar", "Memati 😄", "Abdülhey", "Aslan Akbey", "Kılıç",
  "Pala 😂", "Deli Yürek", "Tombik", "Şaşkın Bot", "Serseri Bot", "Cevat",
];

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function rand(min: number, max: number) { return min + Math.random() * (max - min); }
function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

// ✅ THREE.MathUtils.lerpAngle YOK — kendi fonksiyonumuz
function lerpAngle(a: number, b: number, t: number) {
  const TWO_PI = Math.PI * 2;
  let diff = (b - a) % TWO_PI;
  diff = ((2 * diff) % TWO_PI) - diff; // shortest
  return a + diff * t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeNameSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);

  ctx.fillStyle = "rgba(2,6,23,0.72)";
  roundRect(ctx, 16, 18, 480, 92, 28);
  ctx.fill();

  ctx.strokeStyle = "rgba(99,102,241,0.40)";
  ctx.lineWidth = 4;
  roundRect(ctx, 16, 18, 480, 92, 28);
  ctx.stroke();

  ctx.font = "bold 44px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(224,231,255,0.97)";
  ctx.fillText(text, c.width / 2, c.height / 2 + 6);

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.7, 0.65, 1);
  return spr;
}

function makeWeaponMesh(type: WeaponType) {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.35, metalness: 0.25 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.35, metalness: 0.3, emissive: 0x1d1b6a, emissiveIntensity: 0.5 });

  if (type === "PISTOL") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.9), baseMat);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 0.28), baseMat);
    grip.position.set(-0.1, -0.28, 0.1);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), accentMat);
    sight.position.set(0.18, 0.18, 0.1);
    g.add(body, grip, sight);
  } else if (type === "RIFLE") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 1.7), baseMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10), baseMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.12, 0.0, -0.6);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.55), baseMat);
    stock.position.set(-0.18, 0.0, 0.7);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12), accentMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0.0, 0.18, -0.15);
    g.add(body, barrel, stock, scope);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 1.4), baseMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.25, 12), baseMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.12, 0.0, -0.45);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.6), baseMat);
    stock.position.set(-0.18, 0.0, 0.55);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.32), accentMat);
    accent.position.set(0.0, 0.18, -0.05);
    g.add(body, barrel, stock, accent);
  }
  return g;
}

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ✅ Damage pop ref: HOOK useEffect DIŞINDA olmalı (yoksa “Application error”)
  const dmgPopRef = useRef<{ items: DmgPop[]; uiThrottle: number }>({ items: [], uiThrottle: 0 });

  const [locked, setLocked] = useState(false);
  const [dmgTexts, setDmgTexts] = useState<Array<{ id: string; x: number; y: number; text: string; a: number }>>([]);

  const [hud, setHud] = useState({
    hp: 100,
    ammo: 0,
    score: 0,
    weapon: "",
    phase: "BUS" as "BUS" | "PLAY",
    parachute: false,
    msg: "",
    dead: false,
    kills: 0,
    totalBots: 20,
  });

  // ✅ USE EFFECT BAŞLANGICI (ARADIĞIN YER BURASI)
  useEffect(() => {
    const root = mountRef.current;
    if (!root) return;

    // -----------------------------
    // SETTINGS
    // -----------------------------
    const MAP_SIZE = 500;
    const HALF = MAP_SIZE / 2;

    const SEA_W = 210;
    const SEA_H = 160;

    const MAX_BOTS = 20;

    // Bot vision (çok uzaktan görmesin)
    const BOT_VISION_RANGE = 28;
    const BOT_FOV = THREE.MathUtils.degToRad(100);

    // Güvenlik: inişte anında can düşmesin diye
    // (botların iniş anı free damage yapmasını engelliyoruz)
    let landedAt = -999;

    // -----------------------------
    // RENDERER / SCENE / CAMERA
    // -----------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(root.clientWidth, root.clientHeight);
    renderer.setClearColor(0x050712, 1);
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 60, 420);

    const camera = new THREE.PerspectiveCamera(75, root.clientWidth / root.clientHeight, 0.1, 2500);

    // Lights
    scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(30, 60, 30);
    scene.add(dir);

    // -----------------------------
    // TERRAIN: grass + sand + sea
    // -----------------------------
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.98, metalness: 0.02 }) // açık yeşil
    );
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W, SEA_H, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.05, emissive: 0x0b2a6a, emissiveIntensity: 0.35 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(HALF - SEA_W / 2 - 10, 0.02, -HALF + SEA_H / 2 + 10);
    scene.add(sea);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W + 60, SEA_H + 60, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.95, metalness: 0.02, emissive: 0x4b3a00, emissiveIntensity: 0.15 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.copy(sea.position);
    sand.position.y = 0.01;
    scene.add(sand);

    // Border walls (çimen duvar)
    const obstacles: Array<{ mesh: THREE.Mesh; box: THREE.Box3 }> = [];
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.95, metalness: 0, emissive: 0x052e12, emissiveIntensity: 0.25 });

    function addObstacleBox(mesh: THREE.Mesh) {
      mesh.geometry.computeBoundingBox();
      const box = new THREE.Box3().setFromObject(mesh);
      obstacles.push({ mesh, box });
    }

    function addWall(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      addObstacleBox(m);
      return m;
    }

    const thickness = 6;
    addWall(0, -HALF, MAP_SIZE + thickness, 8, thickness);
    addWall(0, HALF, MAP_SIZE + thickness, 8, thickness);
    addWall(-HALF, 0, thickness, 8, MAP_SIZE + thickness);
    addWall(HALF, 0, thickness, 8, MAP_SIZE + thickness);

    // Houses
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x1b2a2a, roughness: 0.7, metalness: 0.1, emissive: 0x0a1a1a, emissiveIntensity: 0.25 });
    function addHouse(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), houseMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      addObstacleBox(m);
      return m;
    }
    for (let i = 0; i < 14; i++) {
      const x = rand(-HALF + 60, HALF - 60);
      const z = rand(-HALF + 60, HALF - 60);
      const inBeach = Math.abs(x - sea.position.x) < (SEA_W + 70) / 2 && Math.abs(z - sea.position.z) < (SEA_H + 70) / 2;
      if (!inBeach) addHouse(x, z, rand(10, 20), rand(6, 11), rand(10, 20));
    }

    // Trees (visual, no collision for perf)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, emissive: 0x052e12, emissiveIntensity: 0.15 });
    for (let i = 0; i < 160; i++) {
      const x = rand(-HALF + 20, HALF - 20);
      const z = rand(-HALF + 20, HALF - 20);
      const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
      if (inSea) continue;

      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 10), trunkMat);
      trunk.position.y = 2.5;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 12), leafMat);
      leaf.position.y = 7.2;
      g.add(trunk, leaf);
      g.position.set(x, 0, z);
      scene.add(g);
    }

    // -----------------------------
    // PLAYER
    // -----------------------------
    const player = new THREE.Group();
    const playerMat = new THREE.MeshStandardMaterial({ color: 0x0f1733, roughness: 0.35, metalness: 0.2, emissive: 0x111a44, emissiveIntensity: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 14), playerMat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), playerMat);
    head.position.y = 1.6;
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), playerMat);
    hip.position.y = 0.4;
    player.add(body, head, hip);

    const playerName = makeNameSprite("DORUKSIGMA");
    playerName.position.set(0, 2.6, 0);
    player.add(playerName);

    scene.add(player);

    // FPS view weapon (camera child)
    const viewWeapon = new THREE.Group();
    camera.add(viewWeapon);
    scene.add(camera);

    let playerWeapon: WeaponType | null = null;
    let playerWeaponMesh: THREE.Group | null = null;

    function equipPlayerWeapon(type: WeaponType) {
      playerWeapon = type;
      if (playerWeaponMesh) viewWeapon.remove(playerWeaponMesh);
      playerWeaponMesh = makeWeaponMesh(type);

      // FPS elde görünüm (sağ alt)
      playerWeaponMesh.position.set(0.35, -0.35, -0.75);
      playerWeaponMesh.rotation.set(0.05, Math.PI, 0);
      playerWeaponMesh.scale.setScalar(1.0);
      viewWeapon.add(playerWeaponMesh);

      const st = WEAPONS[type];
      setHud((h) => ({ ...h, weapon: st.name, ammo: st.ammo, msg: `✅ ${st.name} aldın` }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    // -----------------------------
    // BUS + PARACHUTE
    // -----------------------------
    const bus = new THREE.Group();
    const busMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6, metalness: 0.2, emissive: 0x4b3a00, emissiveIntensity: 0.25 });
    const busBody = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), busMat);
    busBody.position.y = 18;
    bus.add(busBody);
    bus.position.set(-HALF + 10, 0, -HALF + 20); // baştan başlasın
    scene.add(bus);

    let busAlpha = 0; // 0..1
    let dropped = false;
    let parachuting = false;

    // Parachute mesh
    const chute = new THREE.Group();
    const chuteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7, metalness: 0.05, emissive: 0x0f172a, emissiveIntensity: 0.15 });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), chuteMat);
    canopy.scale.set(1, 0.55, 1);
    canopy.position.set(0, 3.5, 0);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
    function makeLine(x: number, z: number) {
      const pts = [new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(x, 3.1, z)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(geo, lineMat);
    }
    chute.add(canopy, makeLine(1.4, 1.0), makeLine(-1.4, 1.0), makeLine(1.4, -1.0), makeLine(-1.4, -1.0));
    chute.visible = false;
    player.add(chute);

    // -----------------------------
    // LOOT: Weapons + Medkits
    // -----------------------------
    const weaponLoots: WeaponLoot[] = [];
    const medkits: Medkit[] = [];

    function spawnWeaponLoot(type?: WeaponType) {
      const t: WeaponType = type ?? pick<WeaponType>(["PISTOL", "RIFLE", "SHOTGUN"]);
      const g = new THREE.Group();
      const standMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.5, metalness: 0.12 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), standMat);
      base.position.y = 0.06;

      const w = makeWeaponMesh(t);
      w.position.y = 0.35;
      w.rotation.y = rand(0, Math.PI * 2);

      const label = makeNameSprite(WEAPONS[t].name.toUpperCase());
      label.position.set(0, 1.75, 0);
      label.scale.set(2.2, 0.55, 1);

      g.add(base, w, label);

      let x = 0, z = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = rand(-HALF + 45, HALF - 45);
        z = rand(-HALF + 45, HALF - 45);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }

      g.position.set(x, 0, z);
      scene.add(g);
      weaponLoots.push({ mesh: g, taken: false, type: t });
    }

    function spawnMedkit() {
      const g = new THREE.Group();
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.15 });
      const crossMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.2, emissive: 0x7f1d1d, emissiveIntensity: 0.35 });

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.2), baseMat);
      base.position.y = 0.25;
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.18), crossMat);
      cross1.position.y = 0.5;
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.85), crossMat);
      cross2.position.y = 0.5;
      g.add(base, cross1, cross2);

      const label = makeNameSprite("MEDKIT");
      label.position.set(0, 1.55, 0);
      label.scale.set(1.8, 0.45, 1);
      g.add(label);

      let x = 0, z = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = rand(-HALF + 45, HALF - 45);
        z = rand(-HALF + 45, HALF - 45);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);
      medkits.push({ mesh: g, taken: false });
    }

    // Loot amounts
    for (let i = 0; i < 28; i++) spawnWeaponLoot();
    for (let i = 0; i < 18; i++) spawnMedkit();

    // -----------------------------
    // BUILD WALLS (F)
    // -----------------------------
    const buildWalls: BuildWall[] = [];
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.95, metalness: 0.0 });

    function recomputeObstacleBoxes() {
      for (const o of obstacles) o.box.setFromObject(o.mesh);
      for (const w of buildWalls) w.box.setFromObject(w.mesh);
    }

    function addBuildWall(at: THREE.Vector3, yaw: number) {
      // Wall in front of player (2.5m)
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.3), woodMat);
      wall.position.copy(at);
      wall.position.y = 1.5;
      wall.rotation.y = yaw;
      scene.add(wall);

      const box = new THREE.Box3().setFromObject(wall);
      buildWalls.push({ mesh: wall, hp: 100, box });

      // also acts as obstacle
      // (we keep buildWalls separately + include in collision)
    }

    // -----------------------------
    // COLLISION HELPERS
    // -----------------------------
    function isInSea(x: number, z: number) {
      return Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
    }

    function resolveObstaclesFor(pos: THREE.Vector3, radius: number) {
      // normal obstacles
      for (const o of obstacles) {
        const b = o.box.clone();
        b.min.x -= radius; b.max.x += radius;
        b.min.z -= radius; b.max.z += radius;

        if (pos.y > b.max.y + 0.2) continue;
        if (pos.x > b.min.x && pos.x < b.max.x && pos.z > b.min.z && pos.z < b.max.z) {
          const dxMin = Math.abs(pos.x - b.min.x);
          const dxMax = Math.abs(b.max.x - pos.x);
          const dzMin = Math.abs(pos.z - b.min.z);
          const dzMax = Math.abs(b.max.z - pos.z);
          const m = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (m === dxMin) pos.x = b.min.x;
          else if (m === dxMax) pos.x = b.max.x;
          else if (m === dzMin) pos.z = b.min.z;
          else pos.z = b.max.z;
        }
      }

      // build walls
      for (const w of buildWalls) {
        const b = w.box.clone();
        b.min.x -= radius; b.max.x += radius;
        b.min.z -= radius; b.max.z += radius;

        if (pos.y > b.max.y + 0.2) continue;
        if (pos.x > b.min.x && pos.x < b.max.x && pos.z > b.min.z && pos.z < b.max.z) {
          const dxMin = Math.abs(pos.x - b.min.x);
          const dxMax = Math.abs(b.max.x - pos.x);
          const dzMin = Math.abs(pos.z - b.min.z);
          const dzMax = Math.abs(b.max.z - pos.z);
          const m = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (m === dxMin) pos.x = b.min.x;
          else if (m === dxMax) pos.x = b.max.x;
          else if (m === dzMin) pos.z = b.min.z;
          else pos.z = b.max.z;
        }
      }
    }

    // -----------------------------
    // BOTS
    // -----------------------------
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({ color: 0x3b0a0a, roughness: 0.6, metalness: 0.1, emissive: 0x220606, emissiveIntensity: 0.35 });

    function spawnBot() {
      const g = new THREE.Group();
      const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14), botMat);
      bc.position.y = 0.95;
      const bh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), botMat);
      bh.position.y = 1.55;
      const bp = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), botMat);
      bp.position.y = 0.4;
      g.add(bc, bh, bp);

      const name = pick(BOT_NAMES);
      const label = makeNameSprite(name);
      label.position.set(0, 2.6, 0);
      g.add(label);

      let x = 0, z = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = rand(-HALF + 40, HALF - 40);
        z = rand(-HALF + 40, HALF - 40);
        if (!isInSea(x, z)) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);

      bots.push({ mesh: g, hp: 100, weapon: null, shootCd: rand(0.2, 1.2), alive: true });
    }

    for (let i = 0; i < MAX_BOTS; i++) spawnBot();

    function findNearestUntakenWeapon(pos: THREE.Vector3) {
      let best: WeaponLoot | null = null;
      let bestD = Infinity;
      for (const w of weaponLoots) {
        if (w.taken) continue;
        const d = w.mesh.position.clone().sub(pos).length();
        if (d < bestD) { bestD = d; best = w; }
      }
      return { best, bestD };
    }

    // -----------------------------
    // SHOOTING + TRACERS + DAMAGE POP
    // -----------------------------
    const raycaster = new THREE.Raycaster();
    const tracers: Tracer[] = [];
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.95 });

    function worldToScreen(world: THREE.Vector3) {
      const v = world.clone().project(camera);
      const w = root.clientWidth;
      const h = root.clientHeight;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    }

    function addDmgPop(world: THREE.Vector3, text: string) {
      dmgPopRef.current.items.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        world: world.clone(),
        text,
        life: 0.9,
        maxLife: 0.9,
      });
    }

    function addTracer(from: THREE.Vector3, to: THREE.Vector3) {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, tracerMat);
      scene.add(line);
      tracers.push({ line, life: 0.08, maxLife: 0.08 });
    }

    function applyDamageToPlayer(dmg: number) {
      setHud((h) => {
        if (h.dead) return h;
        const hp = Math.max(0, h.hp - dmg);
        return { ...h, hp, dead: hp <= 0, msg: hp <= 0 ? "💀 GAME OVER" : h.msg };
      });
    }

    function healPlayer(amount: number) {
      setHud((h) => {
        if (h.dead) return h;
        const hp = Math.min(100, h.hp + amount);
        return { ...h, hp, msg: `+${amount} HP` };
      });
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    let shootCd = 0;

    function damageWall(mesh: THREE.Mesh, dmg: number) {
      const w = buildWalls.find((x) => x.mesh === mesh);
      if (!w) return;
      w.hp -= dmg;
      addDmgPop(mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)), `-${dmg}`);
      if (w.hp <= 0) {
        scene.remove(w.mesh);
        buildWalls.splice(buildWalls.indexOf(w), 1);
        recomputeObstacleBoxes();
      } else {
        // küçük kırmızımsı feedback
        (w.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x2a0a0a);
        setTimeout(() => (w.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000), 80);
      }
    }

    function shootPlayer() {
      if (!playerWeapon) {
        setHud((h) => ({ ...h, msg: "Silah yok! (E ile yerden al)" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
        return;
      }

      setHud((h) => {
        if (h.dead) return h;
        if (h.ammo <= 0) return { ...h, msg: "Ammo bitti! (R)" };
        return { ...h, ammo: h.ammo - 1, msg: "" };
      });

      const st = WEAPONS[playerWeapon];

      // ray from camera (FPS)
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const botMeshes = bots.filter((b) => b.alive).map((b) => b.mesh);
      const wallMeshes = buildWalls.map((w) => w.mesh);

      const hits = raycaster.intersectObjects([...botMeshes, ...wallMeshes], true);

      const from = camera.getWorldPosition(new THREE.Vector3());
      const to = hits[0]?.point ? hits[0].point.clone() : from.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(50));
      addTracer(from, to);

      if (hits.length > 0) {
        const hit = hits[0];

        // wall hit?
        const wallRoot = wallMeshes.find((m) => hit.object === m || hit.object.parent === m);
        if (wallRoot) {
          damageWall(wallRoot, st.damage);
          addDmgPop(hit.point.clone(), `-${st.damage}`);
          return;
        }

        // bot hit?
        const hitObj = hit.object;
        const rootBot = bots.find((b) => {
          if (!b.alive) return false;
          return hitObj === b.mesh || hitObj.parent === b.mesh || hitObj.parent?.parent === b.mesh;
        });

        if (rootBot) {
          rootBot.hp -= st.damage;
          addDmgPop(hit.point.clone(), `-${st.damage}`);
          if (rootBot.hp <= 0) {
            rootBot.alive = false;
            scene.remove(rootBot.mesh);
            setHud((h) => ({ ...h, score: h.score + 25, kills: h.kills + 1 }));
          }
        }
      }
    }

    // -----------------------------
    // CONTROLS
    // -----------------------------
    const canvas = renderer.domElement;
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false, f: false };

    let yaw = 0;
    let pitch = 0;

    const vel = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3();

    const SPEED = 6.2;
    const SPRINT = 9.0;
    const JUMP = 6.2;
    const GRAVITY = 18.0;

    const GROUND_Y = 0;
    let onGround = true;

    function requestLock() {
      canvas.requestPointerLock?.();
    }

    function onPointerLockChange() {
      setLocked(document.pointerLockElement === canvas);
    }

    function onMouseMove(e: MouseEvent) {
      if (document.pointerLockElement !== canvas) return;
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      const SENS = 0.0022;
      yaw -= mx * SENS;
      pitch -= my * SENS;
      pitch = clamp(pitch, -1.25, 1.15); // PUBG gibi yukarı/aşağı geniş
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (hud.phase !== "PLAY") return;
      if (hud.dead) return;

      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }

      // paraşütte ateş yok
      if (parachuting) return;

      if (shootCd > 0) return;
      if (playerWeapon) shootCd = WEAPONS[playerWeapon].cooldown;
      shootPlayer();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;
      if (e.code === "KeyE") keys.e = true;
      if (e.code === "KeyF") keys.f = true;

      if (e.code === "KeyR") {
        setHud((h) => {
          if (!playerWeapon) return { ...h, msg: "Silah yok" };
          return { ...h, ammo: WEAPONS[playerWeapon].ammo, msg: "Reload" };
        });
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 600);
      }

      if (e.code === "Escape") document.exitPointerLock?.();
      if (e.code === "Enter" && hud.dead) window.location.reload();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = false;
      if (e.code === "KeyA") keys.a = false;
      if (e.code === "KeyS") keys.s = false;
      if (e.code === "KeyD") keys.d = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
      if (e.code === "Space") keys.space = false;
      if (e.code === "KeyE") keys.e = false;
      if (e.code === "KeyF") keys.f = false;
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", () => {
      if (!dropped) requestLock();
    });

    function onResize() {
      const w = root.clientWidth;
      const h = root.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // -----------------------------
    // MINIMAP
    // -----------------------------
    const minimap = minimapRef.current;
    const mctx = minimap?.getContext("2d") || null;

    function drawMinimap() {
      if (!mctx || !minimap) return;
      const W = minimap.width;
      const H = minimap.height;

      const sx = (x: number) => ((x / MAP_SIZE) + 0.5) * W;
      const sz = (z: number) => ((z / MAP_SIZE) + 0.5) * H;

      mctx.clearRect(0, 0, W, H);
      // grass
      mctx.fillStyle = "#0b6a2a";
      mctx.fillRect(0, 0, W, H);

      // sand
      mctx.fillStyle = "rgba(250,204,21,0.75)";
      mctx.fillRect(
        sx(sand.position.x - (SEA_W + 60) / 2),
        sz(sand.position.z - (SEA_H + 60) / 2),
        ((SEA_W + 60) / MAP_SIZE) * W,
        ((SEA_H + 60) / MAP_SIZE) * H
      );

      // sea
      mctx.fillStyle = "rgba(29,78,216,0.85)";
      mctx.fillRect(
        sx(sea.position.x - SEA_W / 2),
        sz(sea.position.z - SEA_H / 2),
        (SEA_W / MAP_SIZE) * W,
        (SEA_H / MAP_SIZE) * H
      );

      // border
      mctx.strokeStyle = "rgba(34,197,94,0.9)";
      mctx.lineWidth = 3;
      mctx.strokeRect(6, 6, W - 12, H - 12);

      // build walls
      mctx.fillStyle = "rgba(139,92,246,0.9)";
      for (const w of buildWalls) {
        mctx.beginPath();
        mctx.arc(sx(w.mesh.position.x), sz(w.mesh.position.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }

      // medkits
      mctx.fillStyle = "rgba(34,197,94,0.95)";
      for (const k of medkits) {
        if (k.taken) continue;
        mctx.beginPath();
        mctx.arc(sx(k.mesh.position.x), sz(k.mesh.position.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }

      // weapons
      mctx.fillStyle = "rgba(250,204,21,0.95)";
      for (const w of weaponLoots) {
        if (w.taken) continue;
        mctx.beginPath();
        mctx.arc(sx(w.mesh.position.x), sz(w.mesh.position.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }

      // bots
      mctx.fillStyle = "rgba(244,63,94,0.92)";
      for (const b of bots) {
        if (!b.alive) continue;
        mctx.beginPath();
        mctx.arc(sx(b.mesh.position.x), sz(b.mesh.position.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }

      // player
      mctx.fillStyle = "rgba(99,102,241,0.95)";
      mctx.beginPath();
      mctx.arc(sx(player.position.x), sz(player.position.z), 4, 0, Math.PI * 2);
      mctx.fill();
    }

    // -----------------------------
    // PICKUPS (E)
    // -----------------------------
    function tryPickupMedkit() {
      for (const k of medkits) {
        if (k.taken) continue;
        const d = k.mesh.position.clone().sub(player.position).length();
        if (d < 3.0) {
          k.taken = true;
          scene.remove(k.mesh);
          healPlayer(35);
          setTimeout(() => spawnMedkit(), 2200);
          return true;
        }
      }
      return false;
    }

    function tryPickupWeapon() {
      for (const w of weaponLoots) {
        if (w.taken) continue;
        const d = w.mesh.position.clone().sub(player.position).length();
        if (d < 3.2) {
          w.taken = true;
          scene.remove(w.mesh);
          equipPlayerWeapon(w.type);
          setTimeout(() => spawnWeaponLoot(), 2500);
          return true;
        }
      }
      return false;
    }

    // -----------------------------
    // GAME LOOP
    // -----------------------------
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // BUS phase: bus moves across map
      if (hud.phase === "BUS") {
        busAlpha = clamp(busAlpha + dt * 0.06, 0, 1);
        const bx = THREE.MathUtils.lerp(-HALF + 10, HALF - 10, busAlpha);
        const bz = THREE.MathUtils.lerp(-HALF + 20, HALF - 20, 0.45 + 0.25 * Math.sin(busAlpha * Math.PI * 2));
        bus.position.set(bx, 0, bz);

        // camera bus view
        camera.position.set(bus.position.x + 16, 26, bus.position.z + 16);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        // E to drop with parachute
        if (keys.e && !dropped) {
          dropped = true;
          parachuting = true;
          chute.visible = true;

          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));

          // start above bus
          player.position.set(bus.position.x - 2.2, 60, bus.position.z + 2.0);
          vel.set(0, -2.2, 0);
          onGround = false;
          landedAt = -999;
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // dead: freeze + render only
      if (hud.dead) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Cooldowns
      shootCd = Math.max(0, shootCd - dt);

      // Movement directions from yaw
      forward.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      right.copy(forward).cross(up).normalize();

      tmp.set(0, 0, 0);
      if (keys.w) tmp.add(forward);
      if (keys.s) tmp.sub(forward);
      if (keys.d) tmp.add(right);
      if (keys.a) tmp.sub(right);
      if (tmp.lengthSq() > 0) tmp.normalize();

      const speed = keys.shift ? SPRINT : SPEED;
      const accel = parachuting ? 0.07 : 0.18;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * speed, accel);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * speed, accel);

      // jump (no jump while parachuting)
      if (!parachuting && keys.space && onGround) {
        vel.y = JUMP;
        onGround = false;
      }

      // gravity
      const g = parachuting ? 4.0 : GRAVITY;
      if (!onGround) vel.y -= g * dt;
      if (parachuting) vel.y = Math.max(vel.y, -3.0);

      // integrate
      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      // clamp map
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // avoid sea area (push out)
      if (isInSea(player.position.x, player.position.z)) {
        // simple push out toward center
        const dirOut = player.position.clone().sub(sea.position).setY(0).normalize();
        player.position.addScaledVector(dirOut, 2.0);
      }

      // ground
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;

        if (parachuting) {
          parachuting = false;
          chute.visible = false;
          setHud((h) => ({ ...h, parachute: false, msg: "" }));
          landedAt = clock.elapsedTime; // iniş zamanı
        }
      }

      // chute sway
      if (chute.visible) {
        chute.rotation.z = Math.sin(clock.elapsedTime * 5.0) * 0.12;
        chute.rotation.x = Math.cos(clock.elapsedTime * 4.0) * 0.08;
      }

      // collisions
      recomputeObstacleBoxes();
      resolveObstaclesFor(player.position, 0.55);

      // pickup E
      if (!parachuting && keys.e) {
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      // Build F (no build while parachuting)
      if (!parachuting && keys.f) {
        keys.f = false;
        const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
        const place = player.position.clone().add(dir.multiplyScalar(4.0));
        place.x = clamp(place.x, -HALF + 8, HALF - 8);
        place.z = clamp(place.z, -HALF + 8, HALF - 8);
        if (!isInSea(place.x, place.z)) {
          addBuildWall(place, yaw);
          recomputeObstacleBoxes();
          setHud((h) => ({ ...h, msg: "🧱 Duvar kuruldu" }));
          setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 650);
        }
      }

      // FPS Camera: head pos + yaw/pitch
      const headPos = new THREE.Vector3(player.position.x, player.position.y + 1.55, player.position.z);
      camera.position.copy(headPos);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // -----------------------------
      // BOT AI
      // -----------------------------
      const playerPos = player.position.clone();

      for (const b of bots) {
        if (!b.alive) continue;

        const bpos = b.mesh.position;
        const toP = playerPos.clone().sub(bpos);
        const dist = toP.length();

        // first: if no weapon -> go loot
        if (!b.weapon) {
          const { best } = findNearestUntakenWeapon(bpos);
          if (best) {
            const dirToW = best.mesh.position.clone().sub(bpos);
            const dW = dirToW.length();
            const targetYaw = Math.atan2(dirToW.x, dirToW.z);
            b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.12);

            dirToW.normalize();
            bpos.x += dirToW.x * dt * 3.1;
            bpos.z += dirToW.z * dt * 3.1;

            resolveObstaclesFor(bpos, 0.45);
            bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
            bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

            if (dW < 2.6 && !best.taken) {
              best.taken = true;
              scene.remove(best.mesh);
              b.weapon = best.type;

              // bot hand + weapon mesh
              b.hand = new THREE.Object3D();
              b.hand.position.set(0.38, 1.02, -0.3);
              b.mesh.add(b.hand);
              const wm = makeWeaponMesh(best.type);
              wm.scale.setScalar(0.8);
              wm.rotation.y = Math.PI;
              wm.rotation.x = 0.05;
              b.hand.add(wm);

              setTimeout(() => spawnWeaponLoot(), 2500);
            }
          }
          continue;
        }

        // Vision: bot çok uzaktan görmesin + fov
        if (dist > BOT_VISION_RANGE) continue;

        // FOV check
        const forwardBot = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, b.mesh.rotation.y, 0));
        const dirToPlayer = toP.clone().setY(0).normalize();
        const ang = Math.acos(clamp(forwardBot.dot(dirToPlayer), -1, 1));
        if (ang > BOT_FOV * 0.5) continue;

        // rotate to player
        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.10);

        // chase (bot bize doğru gelsin)
        if (dist > 12) {
          const d = toP.clone().setY(0).normalize();
          bpos.x += d.x * dt * 3.4;
          bpos.z += d.z * dt * 3.4;
        } else if (dist < 7) {
          // küçük geri kaçış (tam yüzümüze girmesin)
          const d = toP.clone().setY(0).normalize();
          bpos.x -= d.x * dt * 2.0;
          bpos.z -= d.z * dt * 2.0;
        }

        resolveObstaclesFor(bpos, 0.45);
        bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
        bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

        // bot shoot (iniş anında vurmasın + paraşütte vurmasın)
        if (parachuting) continue;
        if (clock.elapsedTime - landedAt < 2.0) continue; // inişten sonra 2 sn koruma

        b.shootCd = Math.max(0, b.shootCd - dt);

        const st = WEAPONS[b.weapon];
        const inRange = dist >= 10 && dist <= st.maxRange;

        if (inRange && b.shootCd <= 0) {
          b.shootCd = st.cooldown + rand(0.05, 0.25);

          const t = clamp(dist / st.maxRange, 0, 1);
          const acc = st.accuracyNear * (1 - t) + st.accuracyFar * t;

          if (Math.random() < acc) {
            applyDamageToPlayer(st.damage);
            addDmgPop(player.position.clone().add(new THREE.Vector3(0, 1.8, 0)), `-${st.damage}`);
          }
        }
      }

      // -----------------------------
      // Update tracers
      // -----------------------------
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.life -= dt;
        const a = clamp(t.life / t.maxLife, 0, 1);
        (t.line.material as THREE.LineBasicMaterial).opacity = 0.25 + 0.75 * a;
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      // -----------------------------
      // Damage pop update (UI throttle)
      // -----------------------------
      for (let i = dmgPopRef.current.items.length - 1; i >= 0; i--) {
        const it = dmgPopRef.current.items[i];
        it.life -= dt;
        it.world.y += dt * 0.45;
        if (it.life <= 0) dmgPopRef.current.items.splice(i, 1);
      }

      dmgPopRef.current.uiThrottle -= dt;
      if (dmgPopRef.current.uiThrottle <= 0) {
        dmgPopRef.current.uiThrottle = 0.06;
        const mapped = dmgPopRef.current.items.map((it) => {
          const s = worldToScreen(it.world);
          return { id: it.id, x: s.x, y: s.y, text: it.text, a: clamp(it.life / it.maxLife, 0, 1) };
        });
        setDmgTexts(mapped);
      }

      // death check (kesin)
      if (hud.hp <= 0) {
        setHud((h) => ({ ...h, dead: true }));
      }

      renderer.render(scene, camera);
      drawMinimap();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    // CLEANUP
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      for (const t of tracers) {
        scene.remove(t.line);
        t.line.geometry.dispose();
      }
      tracerMat.dispose();

      renderer.dispose();
      root.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.phase, hud.dead]);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={mountRef} className="absolute inset-0" />

      <canvas
        ref={minimapRef}
        width={240}
        height={240}
        className="absolute top-3 right-3 rounded-2xl border border-slate-800 bg-slate-950/70"
      />

      {/* HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          ❤️ HP: <span className="font-semibold">{hud.hp}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🔫 Ammo: <span className="font-semibold">{hud.ammo}</span> <span className="text-slate-400">(R)</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🏆 Score: <span className="font-semibold">{hud.score}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🧰 {hud.weapon ? hud.weapon : "Silahsız"}
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🎯 Kills: <span className="font-semibold">{hud.kills}</span>/<span className="font-semibold">{hud.totalBots}</span>
        </div>
        {hud.parachute ? (
          <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">
            🪂 Paraşüt
          </div>
        ) : null}
        {hud.msg ? (
          <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">
            {hud.msg}
          </div>
        ) : null}
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-2 w-2 rounded-full border border-yellow-300/80" />
      </div>

      {/* Damage texts */}
      {dmgTexts.map((d) => (
        <div
          key={d.id}
          className="absolute pointer-events-none font-extrabold text-yellow-300"
          style={{
            left: d.x,
            top: d.y,
            opacity: d.a,
            transform: "translate(-50%, -50%)",
            textShadow: "0 2px 14px rgba(0,0,0,0.75)",
          }}
        >
          {d.text}
        </div>
      ))}

      {/* Help */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {hud.phase === "BUS" ? (
            <>
              🚌 Otobüstesin • <span className="text-slate-100 font-semibold">E</span> ile atla (paraşüt)
            </>
          ) : (
            <>
              <span className="text-slate-100 font-semibold">WASD</span> hareket •{" "}
              <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
              <span className="text-slate-100 font-semibold">Mouse</span> bakış •{" "}
              <span className="text-slate-100 font-semibold">Sol tık</span> ateş •{" "}
              <span className="text-slate-100 font-semibold">E</span> loot •{" "}
              <span className="text-slate-100 font-semibold">F</span> build
            </>
          )}
        </div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {locked ? <span className="text-emerald-300">🟢 Kontrol aktif</span> : <span className="text-indigo-300">🟣 Tıkla → kontrolü kilitle</span>}
        </div>
      </div>

      {/* GAME OVER */}
      {hud.dead ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[min(520px,92vw)] rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-center">
            <div className="text-3xl font-extrabold text-slate-100">💀 GAME OVER</div>
            <div className="mt-2 text-slate-300">
              Skor: <span className="font-semibold text-indigo-300">{hud.score}</span>
            </div>
            <div className="mt-4 text-sm text-slate-400">
              Yeniden başlatmak için <span className="text-slate-100 font-semibold">ENTER</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition"
            >
              Yeniden Başla
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
