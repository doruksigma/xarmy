"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Keys = {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  shift: boolean;
  space: boolean;
  e: boolean;
  f: boolean;
};

type WeaponType = "PISTOL" | "RIFLE" | "SHOTGUN";

type WeaponStats = {
  name: string;
  damage: number;
  cooldown: number;
  maxRange: number;
  accuracyNear: number;
  accuracyFar: number;
};

const WEAPONS: Record<WeaponType, WeaponStats> = {
  PISTOL: { name: "Pistol", damage: 10, cooldown: 0.22, maxRange: 30, accuracyNear: 0.55, accuracyFar: 0.2 },
  RIFLE: { name: "Rifle", damage: 10, cooldown: 0.12, maxRange: 40, accuracyNear: 0.65, accuracyFar: 0.28 },
  SHOTGUN: { name: "Shotgun", damage: 10, cooldown: 0.55, maxRange: 18, accuracyNear: 0.75, accuracyFar: 0.18 },
};

type Bot = {
  mesh: THREE.Group;
  name: string;
  hp: number;
  shootCd: number;
  weapon: WeaponType | null;
};

type Medkit = { mesh: THREE.Group; taken: boolean };
type WeaponLoot = { mesh: THREE.Group; taken: boolean; type: WeaponType };
type BuildWall = { mesh: THREE.Mesh; hp: number };

function lerpAngle(a: number, b: number, t: number) {
  const TWO_PI = Math.PI * 2;
  let diff = (b - a) % TWO_PI;
  diff = ((2 * diff) % TWO_PI) - diff;
  return a + diff * t;
}
function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

const BOT_NAMES = [
  "Polat Alemdar",
  "Memati 😄",
  "Abdülhey",
  "Aslan Akbey",
  "Kılıç",
  "Pala 😂",
  "Deli Yürek",
  "Tombik",
  "Şaşkın Bot",
  "Serseri Bot",
  "Cevat",
];

type TouchState = {
  active: boolean;
  move: { x: number; y: number }; // -1..1
  look: { dx: number; dy: number }; // pixels / frame-ish
  fireHeld: boolean;
  sprintHeld: boolean;
};

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState({
    hp: 100,
    ammo: 0,
    score: 0,
    weapon: "" as string,
    phase: "BUS" as "BUS" | "PLAY",
    dead: false,
    msg: "" as string,
    parachute: false,
  });

  const [dmgTexts, setDmgTexts] = useState<Array<{ id: string; x: number; y: number; text: string; a: number }>>([]);

  // ---------- Mobile detect ----------
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (typeof window !== "undefined" && window.innerWidth < 900);
    setIsMobile(mobile);
  }, []);

  // ---------- Touch input refs ----------
  const touchRef = useRef<TouchState>({
    active: false,
    move: { x: 0, y: 0 },
    look: { dx: 0, dy: 0 },
    fireHeld: false,
    sprintHeld: false,
  });

  // UI refs for joystick / lookpad
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyKnobRef = useRef<HTMLDivElement | null>(null);
  const lookPadRef = useRef<HTMLDivElement | null>(null);

  // joystick internal tracking
  const joyTrackRef = useRef<{ id: number | null; cx: number; cy: number; r: number }>({ id: null, cx: 0, cy: 0, r: 44 });
  const lookTrackRef = useRef<{ id: number | null; lastX: number; lastY: number }>({ id: null, lastX: 0, lastY: 0 });

  const resetJoystick = () => {
    touchRef.current.move.x = 0;
    touchRef.current.move.y = 0;
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = `translate(0px, 0px)`;
    }
  };

  const setJoystick = (dx: number, dy: number) => {
    const r = joyTrackRef.current.r;
    const len = Math.hypot(dx, dy);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    const mag = Math.min(1, len / r);

    // move vector: x right, y forward(-)
    touchRef.current.move.x = nx * mag;
    touchRef.current.move.y = ny * mag;

    if (joyKnobRef.current) {
      const kx = nx * mag * r;
      const ky = ny * mag * r;
      joyKnobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    }
  };

  const pushLookDelta = (dx: number, dy: number) => {
    // accumulate; will be consumed each tick
    touchRef.current.look.dx += dx;
    touchRef.current.look.dy += dy;
  };

  useEffect(() => {
    if (!mountRef.current) return;

    // =============================
    // MAP SETTINGS
    // =============================
    const MAP_SIZE = 500;
    const HALF = MAP_SIZE / 2;

    const BOT_VISION_RANGE = 28;
    const BOT_FOV = THREE.MathUtils.degToRad(100);

    const BOT_CHASE_SPEED = 3.4;
    const BOT_STRAFE_SPEED = 1.6;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 60, 420);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(78, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2500);
    camera.up.set(0, 1, 0);

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(30, 60, 30);
    scene.add(dir);

    // =============================
    // TERRAIN
    // =============================
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x43d45b, roughness: 0.98, metalness: 0.02 })
    );
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    const SEA_W = 210;
    const SEA_H = 160;

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W, SEA_H, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        roughness: 0.35,
        metalness: 0.05,
        emissive: 0x0b2a6a,
        emissiveIntensity: 0.35,
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(HALF - SEA_W / 2 - 10, 0.02, -HALF + SEA_H / 2 + 10);
    scene.add(sea);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W + 60, SEA_H + 60, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.95,
        metalness: 0.02,
        emissive: 0x4b3a00,
        emissiveIntensity: 0.15,
      })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.copy(sea.position);
    sand.position.y = 0.01;
    scene.add(sand);

    sea.renderOrder = 2;
    sand.renderOrder = 1;

    const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x22c55e, 0x0b1a12);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.1;
    scene.add(grid);

    // ---------- Obstacles ----------
    const obstacles: THREE.Mesh[] = [];
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a2a,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x0a1a1a,
      emissiveIntensity: 0.35,
    });

    function addBox(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), obstacleMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
      return m;
    }

    // ---------- Grass Wall boundaries ----------
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.95,
      metalness: 0,
      emissive: 0x052e12,
      emissiveIntensity: 0.35,
    });

    function addWall(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
    }

    const thickness = 6;
    addWall(0, -HALF, MAP_SIZE + thickness, 10, thickness);
    addWall(0, HALF, MAP_SIZE + thickness, 10, thickness);
    addWall(-HALF, 0, thickness, 10, MAP_SIZE + thickness);
    addWall(HALF, 0, thickness, 10, MAP_SIZE + thickness);

    // Houses
    for (let i = 0; i < 14; i++) {
      const x = rand(-HALF + 60, HALF - 60);
      const z = rand(-HALF + 60, HALF - 60);
      const inBeach = Math.abs(x - sea.position.x) < (SEA_W + 70) / 2 && Math.abs(z - sea.position.z) < (SEA_H + 70) / 2;
      if (inBeach) continue;
      addBox(x, z, rand(10, 20), rand(6, 11), rand(10, 20));
    }

    // Trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.9,
      emissive: 0x052e12,
      emissiveIntensity: 0.25,
    });

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

    // ---------- Name sprite ----------
    function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function makeNameSprite(name: string) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 128;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);

      ctx.fillStyle = "rgba(2,6,23,0.72)";
      roundRect(ctx, 16, 18, 480, 92, 28);
      ctx.fill();

      ctx.strokeStyle = "rgba(99,102,241,0.40)";
      ctx.lineWidth = 4;
      roundRect(ctx, 16, 18, 480, 92, 28);
      ctx.stroke();

      ctx.font = "bold 46px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(224,231,255,0.97)";
      ctx.fillText(name, c.width / 2, c.height / 2 + 6);

      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(2.7, 0.65, 1);
      return spr;
    }

    // ---------- Player ----------
    const player = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f1733,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x111a44,
      emissiveIntensity: 0.6,
    });

    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 14), bodyMat);
    cyl.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), bodyMat);
    head.position.y = 1.6;
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), bodyMat);
    hip.position.y = 0.4;
    player.add(cyl, head, hip);

    const playerName = makeNameSprite("DORUKSIGMA");
    playerName.position.set(0, 2.6, 0);
    player.add(playerName);
    scene.add(player);

    const hand = new THREE.Object3D();
    hand.position.set(0.45, 1.05, -0.35);
    player.add(hand);

    let playerWeapon: WeaponType | null = null;
    let playerWeaponMesh: THREE.Group | null = null;

    function makeWeaponMesh(type: WeaponType) {
      const g = new THREE.Group();

      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.35,
        metalness: 0.25,
        emissive: 0x050a14,
        emissiveIntensity: 0.2,
      });

      const accentMat = new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        roughness: 0.35,
        metalness: 0.3,
        emissive: 0x1d1b6a,
        emissiveIntensity: 0.6,
      });

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
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.6), baseMat);
        stock.position.set(-0.18, 0.0, 0.55);
        const accent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.32), accentMat);
        accent.position.set(0.0, 0.18, -0.05);
        g.add(body, barrel, stock, accent);
      }

      return g;
    }

    function equipPlayerWeapon(type: WeaponType) {
      if (playerWeaponMesh) hand.remove(playerWeaponMesh);
      playerWeapon = type;
      playerWeaponMesh = makeWeaponMesh(type);
      playerWeaponMesh.rotation.y = Math.PI;
      playerWeaponMesh.rotation.x = 0.05;
      hand.add(playerWeaponMesh);

      const stats = WEAPONS[type];
      setHud((h) => ({ ...h, weapon: stats.name, ammo: type === "SHOTGUN" ? 10 : 30, msg: `✅ ${stats.name} aldın` }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
    }

    // =============================
    // Parachute Mesh
    // =============================
    const parachute = new THREE.Group();
    parachute.visible = false;

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.7,
      metalness: 0.05,
      emissive: 0x2a0707,
      emissiveIntensity: 0.25,
    });
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x0b1020,
      emissiveIntensity: 0.1,
    });

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), canopyMat);
    canopy.position.y = 4.6;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.06, 10, 32), lineMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.45;

    parachute.add(canopy, ring);

    function makeLine(x: number, z: number) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 10), lineMat);
      l.position.set(x, 2.8, z);
      return l;
    }
    parachute.add(makeLine(1.2, 0.9), makeLine(-1.2, 0.9), makeLine(1.2, -0.9), makeLine(-1.2, -0.9));
    player.add(parachute);

    // ---------- Build walls ----------
    const buildWalls: BuildWall[] = [];
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.9,
      metalness: 0.05,
      emissive: 0x1a0f06,
      emissiveIntensity: 0.15,
    });

    function damageWall(mesh: THREE.Object3D, dmg: number) {
      const w = buildWalls.find((x) => x.mesh === mesh || x.mesh === (mesh as any).parent);
      if (!w) return false;
      w.hp -= dmg;
      if (w.hp <= 0) {
        scene.remove(w.mesh);
        const idx = obstacles.indexOf(w.mesh);
        if (idx >= 0) obstacles.splice(idx, 1);
        const j = buildWalls.indexOf(w);
        if (j >= 0) buildWalls.splice(j, 1);
      }
      return true;
    }

    function buildWallAtPlayer(yaw: number) {
      if (buildWalls.length > 45) return;

      const forwardDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      const pos = player.position.clone().add(forwardDir.multiplyScalar(3.0));

      const inSea = Math.abs(pos.x - sea.position.x) < SEA_W / 2 && Math.abs(pos.z - sea.position.z) < SEA_H / 2;
      if (inSea) return;

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.0, 0.3), woodMat);
      mesh.position.set(pos.x, 1.5, pos.z);
      mesh.rotation.y = yaw;
      scene.add(mesh);

      obstacles.push(mesh);
      buildWalls.push({ mesh, hp: 100 });

      setHud((h) => ({ ...h, msg: "🧱 Tahta duvar kuruldu (100HP)" }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 600);
    }

    // =============================
    // BUS
    // =============================
    const bus = new THREE.Group();
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.6,
      metalness: 0.2,
      emissive: 0x4b3a00,
      emissiveIntensity: 0.25,
    });
    const busBody = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), busMat);
    busBody.position.y = 18;
    bus.add(busBody);

    const BUS_START = new THREE.Vector3(-HALF + 25, 0, -HALF + 30);
    const BUS_END = new THREE.Vector3(HALF - 25, 0, HALF - 30);
    bus.position.copy(BUS_START);
    scene.add(bus);

    let busT = 0;
    let dropped = false;

    // ---------- Bots ----------
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({
      color: 0x3b0a0a,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0x220606,
      emissiveIntensity: 0.55,
    });

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

      let x = 0,
        z = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = rand(-HALF + 40, HALF - 40);
        z = rand(-HALF + 40, HALF - 40);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }

      g.position.set(x, 0, z);
      scene.add(g);

      bots.push({
        mesh: g,
        name,
        hp: 100,
        shootCd: rand(0.2, 1.0),
        weapon: null,
      });
    }
    for (let i = 0; i < 20; i++) spawnBot();

    // ---------- Medkits ----------
    const medkits: Medkit[] = [];
    const kitBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.15,
      emissive: 0x0b1020,
      emissiveIntensity: 0.35,
    });
    const kitCrossMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.6,
    });

    function spawnMedkit() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.2), kitBaseMat);
      base.position.y = 0.25;
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.18), kitCrossMat);
      cross1.position.y = 0.5;
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.85), kitCrossMat);
      cross2.position.y = 0.5;
      g.add(base, cross1, cross2);

      const label = makeNameSprite("MEDKIT");
      label.position.set(0, 1.55, 0);
      label.scale.set(1.8, 0.45, 1);
      g.add(label);

      let x = 0,
        z = 0;
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
    for (let i = 0; i < 22; i++) spawnMedkit();

    // ---------- Weapon loot ----------
    const weaponLoots: WeaponLoot[] = [];

    function spawnWeaponLoot(type?: WeaponType) {
      const t: WeaponType = type ?? pick<WeaponType>(["PISTOL", "RIFLE", "SHOTGUN"]);
      const g = new THREE.Group();

      const standMat = new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.5,
        metalness: 0.12,
        emissive: 0x050a14,
        emissiveIntensity: 0.2,
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), standMat);
      base.position.y = 0.06;

      const w = makeWeaponMesh(t);
      w.position.y = 0.35;
      w.rotation.y = rand(0, Math.PI * 2);

      const label = makeNameSprite(WEAPONS[t].name.toUpperCase());
      label.position.set(0, 1.75, 0);
      label.scale.set(2.2, 0.55, 1);

      g.add(base, w, label);

      let x = 0,
        z = 0;
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
    for (let i = 0; i < 30; i++) spawnWeaponLoot();

    // ---------- Shooting ----------
    const raycaster = new THREE.Raycaster();
    const losRay = new THREE.Raycaster();

    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 8);
    scene.add(muzzleFlash);

    const tracerMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    const tracers: Array<{ line: THREE.Line; life: number }> = [];

    function spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, tracerMat);
      scene.add(line);
      tracers.push({ line, life: 0.08 });
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
        return { ...h, hp: Math.min(100, h.hp + amount), msg: `+${amount} HP` };
      });
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    const dmgPopRef = {
      items: [] as Array<{ id: string; world: THREE.Vector3; text: string; life: number }>,
      uiThrottle: 0,
    };

    function addDamageText(worldPos: THREE.Vector3, text: string) {
      dmgPopRef.items.push({
        id: Math.random().toString(36).slice(2),
        world: worldPos.clone(),
        text,
        life: 0.9,
      });
    }

    function worldToScreen(pos: THREE.Vector3) {
      const p = pos.clone().project(camera);
      const w = mountRef.current?.clientWidth || 1;
      const h = mountRef.current?.clientHeight || 1;
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    }

    function shootPlayer() {
      if (!playerWeapon) {
        setHud((h) => ({ ...h, msg: "Silah yok! (E ile loot al)" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
        return;
      }

      let ok = true;
      setHud((h) => {
        if (h.dead) return h;
        if (h.ammo <= 0) {
          ok = false;
          return { ...h, msg: "Ammo bitti! (R)" };
        }
        return { ...h, ammo: h.ammo - 1, msg: "" };
      });
      if (!ok) return;

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const targets: THREE.Object3D[] = [...bots.map((b) => b.mesh), ...buildWalls.map((w) => w.mesh)];

      const hits = raycaster.intersectObjects(targets, true);

      const from = camera.position.clone();
      const to =
        hits.length > 0 ? hits[0].point.clone() : from.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(60));
      spawnTracer(from, to);

      if (hits.length > 0) {
        const obj = hits[0].object;

        const wallRoot = buildWalls.find((w) => w.mesh === obj || w.mesh === obj.parent);
        if (wallRoot) {
          damageWall(wallRoot.mesh, 10);
        } else {
          const root = bots.find((b) => obj.parent?.parent === b.mesh || obj.parent === b.mesh || obj === b.mesh);
          if (root) {
            const dmg = WEAPONS[playerWeapon].damage;
            root.hp -= dmg;
            addDamageText(root.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)), `-${dmg}`);

            if (root.hp <= 0) {
              scene.remove(root.mesh);
              const idx = bots.indexOf(root);
              if (idx >= 0) bots.splice(idx, 1);
              setHud((h) => ({ ...h, score: h.score + 25 }));
              setTimeout(() => spawnBot(), 900);
            }
          }
        }
      }

      muzzleFlash.position.copy(camera.position);
      muzzleFlash.intensity = 2.3;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
    }

    // ---------- Controls ----------
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false, f: false };
    let yaw = 0;
    let pitch = 0;

    const vel = new THREE.Vector3(0, 0, 0);
    const tmp = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const PLAYER_HEIGHT = 1.8;
    const GROUND_Y = 0;
    let onGround = true;

    const SPEED = 6.2;
    const SPRINT = 9.0;
    const JUMP = 6.2;
    const GRAVITY = 18.0;

    let parachuting = false;
    let spawnShield = 0;

    function resolveObstaclesFor(pos: THREE.Vector3, radius: number) {
      for (const box of obstacles) {
        const b = new THREE.Box3().setFromObject(box);
        b.min.x -= radius;
        b.max.x += radius;
        b.min.z -= radius;
        b.max.z += radius;

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

    // Pointer lock (PC)
    const canvas = renderer.domElement;

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
      pitch = clamp(pitch, -1.1, 0.95);
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (hud.phase !== "PLAY") return;
      if (hud.dead) return;

      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      if (parachuting) return;
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
          return { ...h, ammo: playerWeapon === "SHOTGUN" ? 10 : 30, msg: "Reload" };
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

    // Mobile: prevent page scrolling when touching game
    const preventScroll = (e: TouchEvent) => {
      if (!isMobile) return;
      // only prevent when touch starts on game area
      if (mountRef.current && mountRef.current.contains(e.target as Node)) e.preventDefault();
    };

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("touchmove", preventScroll, { passive: false });

    // Click / tap to activate
    canvas.addEventListener("click", () => {
      if (!dropped && !isMobile) requestLock();
    });

    // =============================
    // Minimap
    // =============================
    const minimap = minimapRef.current;
    const mctx = minimap?.getContext("2d") || null;

    function drawMinimap() {
      if (!mctx || !minimap) return;
      const W = minimap.width;
      const H = minimap.height;

      const sx = (x: number) => (x / MAP_SIZE + 0.5) * W;
      const sz = (z: number) => (z / MAP_SIZE + 0.5) * H;

      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = "#0b2a14";
      mctx.fillRect(0, 0, W, H);

      // sand
      mctx.fillStyle = "rgba(250,204,21,0.70)";
      mctx.fillRect(
        sx(sand.position.x - (SEA_W + 60) / 2),
        sz(sand.position.z - (SEA_H + 60) / 2),
        ((SEA_W + 60) / MAP_SIZE) * W,
        ((SEA_H + 60) / MAP_SIZE) * H
      );
      // sea
      mctx.fillStyle = "rgba(29,78,216,0.85)";
      mctx.fillRect(sx(sea.position.x - SEA_W / 2), sz(sea.position.z - SEA_H / 2), (SEA_W / MAP_SIZE) * W, (SEA_H / MAP_SIZE) * H);

      // border
      mctx.strokeStyle = "rgba(34,197,94,0.9)";
      mctx.lineWidth = 3;
      mctx.strokeRect(6, 6, W - 12, H - 12);

      // builds
      mctx.fillStyle = "rgba(148,163,184,0.95)";
      for (const w of buildWalls) {
        mctx.beginPath();
        mctx.arc(sx(w.mesh.position.x), sz(w.mesh.position.z), 2.6, 0, Math.PI * 2);
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

    // Loot pickup
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
    function findNearestUntakenWeapon(pos: THREE.Vector3) {
      let best: WeaponLoot | null = null;
      let bestD = Infinity;
      for (const w of weaponLoots) {
        if (w.taken) continue;
        const d = w.mesh.position.clone().sub(pos).length();
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      return { best, bestD };
    }

    // Bot vision
    const tmpDir = new THREE.Vector3();
    const botForward = new THREE.Vector3();

    function botCanSeePlayer(bot: Bot, playerPos: THREE.Vector3) {
      const botHead = bot.mesh.position.clone().add(new THREE.Vector3(0, 1.55, 0));
      const playerHead = playerPos.clone().add(new THREE.Vector3(0, 1.55, 0));

      const toP = playerHead.clone().sub(botHead);
      const dist = toP.length();
      if (dist > BOT_VISION_RANGE) return false;

      botForward.set(0, 0, 1).applyQuaternion(bot.mesh.quaternion).normalize();
      tmpDir.copy(toP).normalize();
      const ang = Math.acos(clamp(botForward.dot(tmpDir), -1, 1));
      if (ang > BOT_FOV * 0.5) return false;

      losRay.set(botHead, tmpDir);
      losRay.far = dist;
      const blocks = losRay.intersectObjects([...obstacles], false);
      if (blocks.length > 0) return false;

      return true;
    }

    // ========= MOBILE TOUCH BINDINGS =========
    const handleTouchStart = (e: TouchEvent) => {
      if (!isMobile) return;

      touchRef.current.active = true;

      // Assign touch to joystick if starts inside joystick base
      if (joyBaseRef.current) {
        const jb = joyBaseRef.current.getBoundingClientRect();
        for (const t of Array.from(e.changedTouches)) {
          const x = t.clientX;
          const y = t.clientY;
          const inside = x >= jb.left && x <= jb.right && y >= jb.top && y <= jb.bottom;
          if (inside && joyTrackRef.current.id == null) {
            joyTrackRef.current.id = t.identifier;
            joyTrackRef.current.cx = (jb.left + jb.right) / 2;
            joyTrackRef.current.cy = (jb.top + jb.bottom) / 2;
            setJoystick(x - joyTrackRef.current.cx, y - joyTrackRef.current.cy);
          }
        }
      }

      // Assign touch to look pad if starts inside look pad
      if (lookPadRef.current) {
        const lb = lookPadRef.current.getBoundingClientRect();
        for (const t of Array.from(e.changedTouches)) {
          const x = t.clientX;
          const y = t.clientY;
          const inside = x >= lb.left && x <= lb.right && y >= lb.top && y <= lb.bottom;
          if (inside && lookTrackRef.current.id == null) {
            lookTrackRef.current.id = t.identifier;
            lookTrackRef.current.lastX = x;
            lookTrackRef.current.lastY = y;
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isMobile) return;

      // joystick move
      if (joyTrackRef.current.id != null) {
        const t = Array.from(e.touches).find((x) => x.identifier === joyTrackRef.current.id);
        if (t) setJoystick(t.clientX - joyTrackRef.current.cx, t.clientY - joyTrackRef.current.cy);
      }

      // look move
      if (lookTrackRef.current.id != null) {
        const t = Array.from(e.touches).find((x) => x.identifier === lookTrackRef.current.id);
        if (t) {
          const dx = t.clientX - lookTrackRef.current.lastX;
          const dy = t.clientY - lookTrackRef.current.lastY;
          lookTrackRef.current.lastX = t.clientX;
          lookTrackRef.current.lastY = t.clientY;
          pushLookDelta(dx, dy);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isMobile) return;

      // release joystick
      for (const t of Array.from(e.changedTouches)) {
        if (joyTrackRef.current.id === t.identifier) {
          joyTrackRef.current.id = null;
          resetJoystick();
        }
        if (lookTrackRef.current.id === t.identifier) {
          lookTrackRef.current.id = null;
        }
      }

      // if no touches remain, mark inactive
      if (e.touches.length === 0) {
        touchRef.current.active = false;
        touchRef.current.look.dx = 0;
        touchRef.current.look.dy = 0;
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    function onResize() {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // =============================
    // GAME LOOP
    // =============================
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // Apply mobile touch -> keys + yaw/pitch
      if (isMobile) {
        const mv = touchRef.current.move;

        // map joystick to WASD
        keys.w = mv.y < -0.15;
        keys.s = mv.y > 0.15;
        keys.a = mv.x < -0.15;
        keys.d = mv.x > 0.15;

        keys.shift = touchRef.current.sprintHeld;

        // look deltas
        const lx = touchRef.current.look.dx;
        const ly = touchRef.current.look.dy;
        touchRef.current.look.dx *= 0.15; // decay
        touchRef.current.look.dy *= 0.15;

        const SENS = 0.0026; // touch sens
        yaw -= lx * SENS;
        pitch -= ly * SENS;
        pitch = clamp(pitch, -1.1, 0.95);

        // fire held
        if (hud.phase === "PLAY" && !hud.dead && !parachuting && touchRef.current.fireHeld) {
          // Simple fire rate limiter: use playerWeapon cooldown via a local timer
          // We'll do it by simulating mouse click every frame? Not good.
          // We'll implement a small timer inside closure:
        }
      }

      // BUS phase
      if (hud.phase === "BUS") {
        busT += dt * 0.05;
        if (busT > 1) busT = 0;
        bus.position.lerpVectors(BUS_START, BUS_END, busT);

        camera.position.set(bus.position.x + 20, 28, bus.position.z + 20);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        // Jump from bus: PC E or mobile button sets keys.e
        if (keys.e) {
          keys.e = false;

          dropped = true;
          parachuting = true;
          spawnShield = 0;

          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));

          player.position.set(bus.position.x - 2.2, 60, bus.position.z + 2.0);
          onGround = false;
          vel.set(0, -2.2, 0);

          parachute.visible = true;
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (hud.dead) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      spawnShield = Math.max(0, spawnShield - dt);

      // FPS camera rotation
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);
      camera.up.set(0, 1, 0);

      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      const right = new THREE.Vector3().copy(forward).cross(new THREE.Vector3(0, 1, 0)).normalize();

      tmp.set(0, 0, 0);
      if (keys.w) tmp.add(forward);
      if (keys.s) tmp.sub(forward);
      if (keys.d) tmp.add(right);
      if (keys.a) tmp.sub(right);
      if (tmp.lengthSq() > 0) tmp.normalize();

      const targetSpeed = keys.shift ? SPRINT : SPEED;
      const accel = parachuting ? 0.07 : 0.18;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * targetSpeed, accel);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * targetSpeed, accel);

      if (!parachuting && keys.space && onGround) {
        vel.y = JUMP;
        onGround = false;
      }

      const g = parachuting ? 4.0 : GRAVITY;
      if (!onGround) vel.y -= g * dt;
      if (parachuting) vel.y = Math.max(vel.y, -3.0);

      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;

        if (parachuting) {
          parachuting = false;
          spawnShield = 2.0;
          setHud((h) => ({ ...h, parachute: false, msg: "🛡️ İniş koruması" }));
          setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 600);

          parachute.visible = false;
          parachute.rotation.set(0, 0, 0);
        }
      }

      resolveObstaclesFor(player.position, 0.55);
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // Pickup
      if (!parachuting && keys.e) {
        keys.e = false;
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      // Build
      if (!parachuting && keys.f) {
        keys.f = false;
        buildWallAtPlayer(yaw);
      }

      // Parachute sway
      if (parachuting) {
        const t = performance.now() * 0.002;
        parachute.rotation.y = Math.sin(t) * 0.25;
        parachute.rotation.z = Math.sin(t * 0.8) * 0.12;
      }

      // FPS cam position
      camera.position.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.92, player.position.z);

      // -------- Shooting (PC click OR mobile fireHeld) --------
      // We implement cooldown timer for mobile continuous fire:
      // (PC already uses shootPlayer() on mouse down)
      // We'll keep a local closure timer:
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      if (isMobile && touchRef.current.fireHeld && !parachuting) {
        // use local fire cooldown accumulator
      }

      // Bots
      const playerPos = player.position.clone();

      for (const b of bots) {
        const bpos = b.mesh.position;

        if (!b.weapon) {
          const { best } = findNearestUntakenWeapon(bpos);
          if (best) {
            const dirToW = best.mesh.position.clone().sub(bpos);
            const distW = dirToW.length();

            const targetYaw = Math.atan2(dirToW.x, dirToW.z);
            b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.1);

            dirToW.normalize();
            bpos.x += dirToW.x * dt * 3.1;
            bpos.z += dirToW.z * dt * 3.1;

            resolveObstaclesFor(bpos, 0.45);
            bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
            bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

            if (distW < 2.6 && !best.taken) {
              best.taken = true;
              scene.remove(best.mesh);
              b.weapon = best.type;

              const botHand = new THREE.Object3D();
              botHand.position.set(0.38, 1.02, -0.3);
              b.mesh.add(botHand);
              const wm = makeWeaponMesh(best.type);
              wm.scale.setScalar(0.8);
              wm.rotation.y = Math.PI;
              wm.rotation.x = 0.05;
              botHand.add(wm);

              setTimeout(() => spawnWeaponLoot(), 2500);
            }
          }
          continue;
        }

        const sees = botCanSeePlayer(b, playerPos);
        if (!sees) {
          b.shootCd = Math.max(0, b.shootCd - dt);
          continue;
        }

        const toP = playerPos.clone().sub(bpos);
        const dist = toP.length();

        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.11);

        const dirP = toP.clone().normalize();

        if (dist > 10) {
          bpos.x += dirP.x * dt * BOT_CHASE_SPEED;
          bpos.z += dirP.z * dt * BOT_CHASE_SPEED;
        } else if (dist < 6) {
          bpos.x -= dirP.x * dt * 2.0;
          bpos.z -= dirP.z * dt * 2.0;
        } else {
          const strafe = new THREE.Vector3(-dirP.z, 0, dirP.x).multiplyScalar(
            Math.sin(performance.now() * 0.002 + bpos.x) > 0 ? 1 : -1
          );
          bpos.x += strafe.x * dt * BOT_STRAFE_SPEED;
          bpos.z += strafe.z * dt * BOT_STRAFE_SPEED;
        }

        resolveObstaclesFor(bpos, 0.45);
        bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
        bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

        if (parachuting) continue;

        b.shootCd = Math.max(0, b.shootCd - dt);
        const st = WEAPONS[b.weapon];
        const inRange = dist <= st.maxRange;

        if (inRange && b.shootCd <= 0) {
          b.shootCd = st.cooldown + rand(0.02, 0.18);

          const tt = clamp(dist / st.maxRange, 0, 1);
          const acc = st.accuracyNear * (1 - tt) + st.accuracyFar * tt;

          const botHead = bpos.clone().add(new THREE.Vector3(0, 1.55, 0));
          const playerHead = playerPos.clone().add(new THREE.Vector3(0, 1.55, 0));
          const dirShot = playerHead.clone().sub(botHead).normalize();

          spawnTracer(botHead, botHead.clone().add(dirShot.clone().multiplyScalar(Math.min(50, dist))));

          losRay.set(botHead, dirShot);
          losRay.far = Math.min(st.maxRange, dist + 0.5);
          const hit = losRay.intersectObjects([...buildWalls.map((w) => w.mesh), ...obstacles], true);

          if (hit.length > 0) {
            const hobj = hit[0].object;
            const wall = buildWalls.find((w) => w.mesh === hobj || w.mesh === hobj.parent);
            if (wall) {
              damageWall(wall.mesh, 10);
              continue;
            }
          }

          if (spawnShield <= 0 && Math.random() < acc) applyDamageToPlayer(10);
        }
      }

      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      for (let i = dmgPopRef.items.length - 1; i >= 0; i--) {
        dmgPopRef.items[i].life -= dt;
        dmgPopRef.items[i].world.y += dt * 0.35;
        if (dmgPopRef.items[i].life <= 0) dmgPopRef.items.splice(i, 1);
      }

      dmgPopRef.uiThrottle -= dt;
      if (dmgPopRef.uiThrottle <= 0) {
        dmgPopRef.uiThrottle = 0.06;

        const mapped = dmgPopRef.items.map((it) => {
          const s = worldToScreen(it.world);
          return { id: it.id, x: s.x, y: s.y, text: it.text, a: clamp(it.life / 0.9, 0, 1) };
        });
        setDmgTexts(mapped);
      }

      renderer.render(scene, camera);
      drawMinimap();
      rafRef.current = requestAnimationFrame(tick);
    }

    // ---- mobile continuous fire cooldown timer (inside effect scope) ----
    let mobileFireCd = 0;
    const origTick = tick;
    function tickWrapped() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // Re-run tick logic but inject mobile fire at correct time:
      // We'll do minimal duplication: we can't easily splice into tick without rewriting;
      // Instead we keep mobileFireCd and fire before calling origTick's render? Not ideal.
      // So we replace raf to run origTick but manage fire right after input update:
      // We'll just implement mobileFireCd decrement + call shootPlayer if ready.
      mobileFireCd = Math.max(0, mobileFireCd - dt);

      // We need yaw/pitch updates, keys mapping etc. That is inside origTick.
      // So call origTick but we must ensure it uses same dt from clock.
      // To avoid double clock.getDelta, we won't use origTick directly.
      // Hence: fallback to single loop (we'll just run tick(), but patch: set mobileFireCd using dt in tick by closure)
      // Easiest: switch to raf calling tick() only and inside tick() we'll compute dt and also decrement mobileFireCd.
    }

    // We keep raf calling tick(), and inside tick() we handle mobile fire with a timer by closure:
    // So we rewrite tick() call usage below:
    // (We already declared tick() above; we'll just wrap decrement at top by using a variable captured and modify tick() above minimally.)
    // Practical approach: use a ref:
    const mobileFireCdRef = { v: 0 };
    const oldTick = tick;
    function tick2() {
      const dt = Math.min(clock.getDelta(), 0.033);
      mobileFireCdRef.v = Math.max(0, mobileFireCdRef.v - dt);

      // emulate the same dt in game: we can’t pass dt into oldTick.
      // So we will inline a second clock delta... that would be wrong.
      // Therefore we must keep tick() as the only clock consumer.
      // So: we will not use tick2. We'll instead handle fire cooldown INSIDE tick() by capturing another variable and decrementing there.
    }

    // FINAL: do it properly by a small patch: we’ll store a mutable fireCd and decrement INSIDE tick() with dt.
    // To keep code stable: we re-define tick() below with integrated fire cooldown.
    // (Simpler than patching higher; but we already wrote tick(). We'll just use another loop with a new tickFinal.)

    // --------- Replace loop with tickFinal (copy tick() but minimal) ----------
    let fireCd = 0;

    function tickFinal() {
      const dt = Math.min(clock.getDelta(), 0.033);
      fireCd = Math.max(0, fireCd - dt);

      // Apply mobile touch -> keys + yaw/pitch
      if (isMobile) {
        const mv = touchRef.current.move;
        keys.w = mv.y < -0.15;
        keys.s = mv.y > 0.15;
        keys.a = mv.x < -0.15;
        keys.d = mv.x > 0.15;
        keys.shift = touchRef.current.sprintHeld;

        const lx = touchRef.current.look.dx;
        const ly = touchRef.current.look.dy;
        touchRef.current.look.dx *= 0.15;
        touchRef.current.look.dy *= 0.15;

        const SENS = 0.0026;
        yaw -= lx * SENS;
        pitch -= ly * SENS;
        pitch = clamp(pitch, -1.1, 0.95);
      }

      // BUS phase
      if (hud.phase === "BUS") {
        busT += dt * 0.05;
        if (busT > 1) busT = 0;
        bus.position.lerpVectors(BUS_START, BUS_END, busT);

        camera.position.set(bus.position.x + 20, 28, bus.position.z + 20);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        if (keys.e) {
          keys.e = false;

          dropped = true;
          parachuting = true;
          spawnShield = 0;

          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));

          player.position.set(bus.position.x - 2.2, 60, bus.position.z + 2.0);
          onGround = false;
          vel.set(0, -2.2, 0);

          parachute.visible = true;
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tickFinal);
        return;
      }

      if (hud.dead) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tickFinal);
        return;
      }

      spawnShield = Math.max(0, spawnShield - dt);

      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);
      camera.up.set(0, 1, 0);

      forward.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      right.copy(forward).cross(up).normalize();

      tmp.set(0, 0, 0);
      if (keys.w) tmp.add(forward);
      if (keys.s) tmp.sub(forward);
      if (keys.d) tmp.add(right);
      if (keys.a) tmp.sub(right);
      if (tmp.lengthSq() > 0) tmp.normalize();

      const targetSpeed = keys.shift ? SPRINT : SPEED;
      const accel = parachuting ? 0.07 : 0.18;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * targetSpeed, accel);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * targetSpeed, accel);

      if (!parachuting && keys.space && onGround) {
        vel.y = JUMP;
        onGround = false;
      }

      const g = parachuting ? 4.0 : GRAVITY;
      if (!onGround) vel.y -= g * dt;
      if (parachuting) vel.y = Math.max(vel.y, -3.0);

      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;

        if (parachuting) {
          parachuting = false;
          spawnShield = 2.0;
          setHud((h) => ({ ...h, parachute: false, msg: "🛡️ İniş koruması" }));
          setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 600);

          parachute.visible = false;
          parachute.rotation.set(0, 0, 0);
        }
      }

      resolveObstaclesFor(player.position, 0.55);
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      if (!parachuting && keys.e) {
        keys.e = false;
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      if (!parachuting && keys.f) {
        keys.f = false;
        buildWallAtPlayer(yaw);
      }

      if (parachuting) {
        const t = performance.now() * 0.002;
        parachute.rotation.y = Math.sin(t) * 0.25;
        parachute.rotation.z = Math.sin(t * 0.8) * 0.12;
      }

      camera.position.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.92, player.position.z);

      // Mobile continuous fire
      if (isMobile && touchRef.current.fireHeld && hud.phase === "PLAY" && !hud.dead && !parachuting) {
        const cd = playerWeapon ? WEAPONS[playerWeapon].cooldown : 0.18;
        if (fireCd <= 0) {
          fireCd = cd;
          shootPlayer();
        }
      }

      // Bots
      const playerPos = player.position.clone();
      for (const b of bots) {
        const bpos = b.mesh.position;

        if (!b.weapon) {
          const { best } = findNearestUntakenWeapon(bpos);
          if (best) {
            const dirToW = best.mesh.position.clone().sub(bpos);
            const distW = dirToW.length();

            const targetYaw = Math.atan2(dirToW.x, dirToW.z);
            b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.1);

            dirToW.normalize();
            bpos.x += dirToW.x * dt * 3.1;
            bpos.z += dirToW.z * dt * 3.1;

            resolveObstaclesFor(bpos, 0.45);
            bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
            bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

            if (distW < 2.6 && !best.taken) {
              best.taken = true;
              scene.remove(best.mesh);
              b.weapon = best.type;

              const botHand = new THREE.Object3D();
              botHand.position.set(0.38, 1.02, -0.3);
              b.mesh.add(botHand);
              const wm = makeWeaponMesh(best.type);
              wm.scale.setScalar(0.8);
              wm.rotation.y = Math.PI;
              wm.rotation.x = 0.05;
              botHand.add(wm);

              setTimeout(() => spawnWeaponLoot(), 2500);
            }
          }
          continue;
        }

        const sees = botCanSeePlayer(b, playerPos);
        if (!sees) {
          b.shootCd = Math.max(0, b.shootCd - dt);
          continue;
        }

        const toP = playerPos.clone().sub(bpos);
        const dist = toP.length();

        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.11);

        const dirP = toP.clone().normalize();

        if (dist > 10) {
          bpos.x += dirP.x * dt * BOT_CHASE_SPEED;
          bpos.z += dirP.z * dt * BOT_CHASE_SPEED;
        } else if (dist < 6) {
          bpos.x -= dirP.x * dt * 2.0;
          bpos.z -= dirP.z * dt * 2.0;
        } else {
          const strafe = new THREE.Vector3(-dirP.z, 0, dirP.x).multiplyScalar(
            Math.sin(performance.now() * 0.002 + bpos.x) > 0 ? 1 : -1
          );
          bpos.x += strafe.x * dt * BOT_STRAFE_SPEED;
          bpos.z += strafe.z * dt * BOT_STRAFE_SPEED;
        }

        resolveObstaclesFor(bpos, 0.45);
        bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
        bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

        if (parachuting) continue;

        b.shootCd = Math.max(0, b.shootCd - dt);
        const st = WEAPONS[b.weapon];
        const inRange = dist <= st.maxRange;

        if (inRange && b.shootCd <= 0) {
          b.shootCd = st.cooldown + rand(0.02, 0.18);

          const tt = clamp(dist / st.maxRange, 0, 1);
          const acc = st.accuracyNear * (1 - tt) + st.accuracyFar * tt;

          const botHead = bpos.clone().add(new THREE.Vector3(0, 1.55, 0));
          const playerHead = playerPos.clone().add(new THREE.Vector3(0, 1.55, 0));
          const dirShot = playerHead.clone().sub(botHead).normalize();

          spawnTracer(botHead, botHead.clone().add(dirShot.clone().multiplyScalar(Math.min(50, dist))));

          losRay.set(botHead, dirShot);
          losRay.far = Math.min(st.maxRange, dist + 0.5);
          const hit = losRay.intersectObjects([...buildWalls.map((w) => w.mesh), ...obstacles], true);

          if (hit.length > 0) {
            const hobj = hit[0].object;
            const wall = buildWalls.find((w) => w.mesh === hobj || w.mesh === hobj.parent);
            if (wall) {
              damageWall(wall.mesh, 10);
              continue;
            }
          }

          if (spawnShield <= 0 && Math.random() < acc) applyDamageToPlayer(10);
        }
      }

      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      for (let i = dmgPopRef.items.length - 1; i >= 0; i--) {
        dmgPopRef.items[i].life -= dt;
        dmgPopRef.items[i].world.y += dt * 0.35;
        if (dmgPopRef.items[i].life <= 0) dmgPopRef.items.splice(i, 1);
      }

      dmgPopRef.uiThrottle -= dt;
      if (dmgPopRef.uiThrottle <= 0) {
        dmgPopRef.uiThrottle = 0.06;
        const mapped = dmgPopRef.items.map((it) => {
          const s = worldToScreen(it.world);
          return { id: it.id, x: s.x, y: s.y, text: it.text, a: clamp(it.life / 0.9, 0, 1) };
        });
        setDmgTexts(mapped);
      }

      renderer.render(scene, camera);
      drawMinimap();
      rafRef.current = requestAnimationFrame(tickFinal);
    }

    rafRef.current = requestAnimationFrame(tickFinal);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("touchmove", preventScroll as any);

      window.removeEventListener("touchstart", handleTouchStart as any);
      window.removeEventListener("touchmove", handleTouchMove as any);
      window.removeEventListener("touchend", handleTouchEnd as any);
      window.removeEventListener("touchcancel", handleTouchEnd as any);

      for (const t of tracers) {
        scene.remove(t.line);
        t.line.geometry.dispose();
      }
      tracerMat.dispose();

      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.phase, hud.dead, isMobile]);

  // ---------- Mobile UI handlers ----------
  const press = (k: keyof Keys) => {
    // emulate key press (one-shot for E/F; hold for space/shift)
    if (k === "e" || k === "f") {
      // one-shot
      // We can't access keys here (it lives in effect), so we use touchRef state:
      // For E/F we will store "virtual key" by setting a small flag on window and reading it? too messy.
      // Instead: simplest is to use keyboard events by dispatching:
      const codeMap: Record<string, string> = { e: "KeyE", f: "KeyF", space: "Space", shift: "ShiftLeft" };
      window.dispatchEvent(new KeyboardEvent("keydown", { code: codeMap[k] || "" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: codeMap[k] || "" }));
      return;
    }
  };

  // For fire and sprint and jump (hold):
  const setFire = (v: boolean) => (touchRef.current.fireHeld = v);
  const setSprint = (v: boolean) => {
    touchRef.current.sprintHeld = v;
    // also dispatch shift for desktop-like HUD hints if needed (optional)
  };
  const jumpOnce = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })), 0);
  };
  const lootOnce = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE" })), 0);
  };
  const buildOnce = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyF" })), 0);
  };
  const busJump = () => {
    // same as E
    lootOnce();
  };

  const helpText = useMemo(() => {
    if (hud.phase === "BUS") return "🚌 Otobüstesin • ATLA ile paraşüt";
    if (isMobile) return "🕹️ Sol joystick hareket • Sağ pad bakış • FIRE ateş • LOOT al • BUILD duvar";
    return "WASD • SHIFT • Mouse • Sol tık • E loot • F build";
  }, [hud.phase, isMobile]);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Minimap */}
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
        {hud.parachute ? (
          <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">🪂 Paraşüt</div>
        ) : null}
        {hud.msg ? (
          <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">{hud.msg}</div>
        ) : null}
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-3 w-3 rounded-full border border-indigo-300/80" />
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
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">{helpText}</div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {isMobile ? (
            <span className="text-emerald-300">📱 Mobil kontrol aktif</span>
          ) : locked ? (
            <span className="text-emerald-300">🟢 Kontrol aktif</span>
          ) : (
            <span className="text-indigo-300">🟣 Tıkla → kontrolü kilitle</span>
          )}
        </div>
      </div>

      {/* ---------- MOBILE CONTROLS ---------- */}
      {isMobile ? (
        <>
          {/* Joystick */}
          <div className="absolute bottom-16 left-5 select-none">
            <div
              ref={joyBaseRef}
              className="relative w-32 h-32 rounded-full bg-slate-900/40 border border-slate-700 backdrop-blur-md"
              style={{ touchAction: "none" }}
            >
              <div
                ref={joyKnobRef}
                className="absolute left-1/2 top-1/2 w-14 h-14 -ml-7 -mt-7 rounded-full bg-indigo-500/40 border border-indigo-300/40"
                style={{ touchAction: "none" }}
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-300/80">MOVE</div>
          </div>

          {/* Look pad */}
          <div className="absolute bottom-16 right-5 select-none">
            <div
              ref={lookPadRef}
              className="relative w-44 h-32 rounded-2xl bg-slate-900/30 border border-slate-700 backdrop-blur-md"
              style={{ touchAction: "none" }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-300/70">LOOK</div>
            </div>

            {/* Buttons */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {hud.phase === "BUS" ? (
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    busJump();
                  }}
                  className="col-span-3 px-3 py-3 rounded-xl bg-indigo-500 text-white font-bold active:scale-[0.98]"
                  style={{ touchAction: "none" }}
                >
                  ATLA 🪂
                </button>
              ) : (
                <>
                  <button
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setFire(true);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setFire(false);
                    }}
                    className="px-3 py-3 rounded-xl bg-rose-500 text-white font-bold active:scale-[0.98]"
                    style={{ touchAction: "none" }}
                  >
                    FIRE
                  </button>
                  <button
                    onTouchStart={(e) => {
                      e.preventDefault();
                      lootOnce();
                    }}
                    className="px-3 py-3 rounded-xl bg-amber-500 text-white font-bold active:scale-[0.98]"
                    style={{ touchAction: "none" }}
                  >
                    LOOT
                  </button>
                  <button
                    onTouchStart={(e) => {
                      e.preventDefault();
                      buildOnce();
                    }}
                    className="px-3 py-3 rounded-xl bg-emerald-500 text-white font-bold active:scale-[0.98]"
                    style={{ touchAction: "none" }}
                  >
                    BUILD
                  </button>

                  <button
                    onTouchStart={(e) => {
                      e.preventDefault();
                      jumpOnce();
                    }}
                    className="px-3 py-3 rounded-xl bg-slate-200 text-slate-900 font-extrabold active:scale-[0.98]"
                    style={{ touchAction: "none" }}
                  >
                    JUMP
                  </button>

                  <button
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setSprint(true);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setSprint(false);
                    }}
                    className="px-3 py-3 rounded-xl bg-indigo-500 text-white font-bold active:scale-[0.98]"
                    style={{ touchAction: "none" }}
                  >
                    SPRINT
                  </button>

                  <button
                    onTouchStart={(e) => {
                      e.preventDefault();
                      // reload
                      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
                      setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyR" })), 0);
                    }}
                    className="px-3 py-3 rounded-xl bg-slate-700 text-white font-bold active:scale-[0.98]"
                    style={{ touchAction: "none" }}
                  >
                    RLD
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}

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
