"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Keys = {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  shift: boolean;
  space: boolean;
  e: boolean; // jump from bus / pickup
  f: boolean; // build
};

type WeaponType = "PISTOL" | "RIFLE" | "SHOTGUN";

type WeaponStats = {
  name: string;
  damage: number; // both player & bots
  cooldown: number; // seconds
  maxRange: number;
  accuracyNear: number; // hit chance near
  accuracyFar: number; // hit chance far
  ammoMax: number;
};

const WEAPONS: Record<WeaponType, WeaponStats> = {
  PISTOL: { name: "Pistol", damage: 10, cooldown: 0.22, maxRange: 28, accuracyNear: 0.55, accuracyFar: 0.22, ammoMax: 18 },
  RIFLE: { name: "Rifle", damage: 10, cooldown: 0.12, maxRange: 38, accuracyNear: 0.62, accuracyFar: 0.28, ammoMax: 30 },
  SHOTGUN: { name: "Shotgun", damage: 10, cooldown: 0.55, maxRange: 16, accuracyNear: 0.72, accuracyFar: 0.18, ammoMax: 8 },
};

type Bot = {
  mesh: THREE.Group;
  name: string;
  hp: number;
  shootCd: number;
  weapon: WeaponType | null;
  ammo: number;
  alive: boolean;
};

type Medkit = { mesh: THREE.Group; taken: boolean };
type WeaponLoot = { mesh: THREE.Group; taken: boolean; type: WeaponType };

type BuildWall = { mesh: THREE.Mesh; hp: number };

type Tracer = { line: THREE.Line; life: number; maxLife: number };
type Particle = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number };

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function lerpAngle(a: number, b: number, t: number) {
  const TWO_PI = Math.PI * 2;
  let diff = (b - a) % TWO_PI;
  diff = ((2 * diff) % TWO_PI) - diff; // shortest direction
  return a + diff * t;
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

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const [locked, setLocked] = useState(false);

  const [hud, setHud] = useState({
    hp: 100,
    ammo: 0,
    score: 0,
    kills: 0,
    totalBots: 20,
    weapon: "" as string,
    phase: "BUS" as "BUS" | "PLAY",
    dead: false,
    victory: false,
    msg: "" as string,
    parachute: false,
  });

  const hudRef = useRef(hud);
  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  const [dmgTexts, setDmgTexts] = useState<Array<{ id: string; x: number; y: number; text: string; a: number }>>([]);

  useEffect(() => {
    if (!mountRef.current) return;

    // =============================
    // MAP SETTINGS
    // =============================
    const MAP_SIZE = 500;
    const HALF = MAP_SIZE / 2;

    const SEA_W = 210;
    const SEA_H = 160;

    const MAX_BOTS = 20;

    // Bot perception (so they don't see too far)
    const BOT_VISION_RANGE = 26; // shorter = "uzaktan görmesin"
    const BOT_FOV = THREE.MathUtils.degToRad(95); // narrower FOV

    // Speeds
    const PLAYER_SPEED = 6.2;
    const PLAYER_SPRINT = 9.0;
    const PLAYER_JUMP = 6.2;
    const GRAVITY = 18.0;

    const BOT_CHASE_SPEED = 3.6;

    // Build
    const WALL_HP = 100;
    const WALL_COOLDOWN = 0.25;
    let buildCd = 0;

    // =============================
    // AUDIO (tiny WebAudio beeps)
    // =============================
    const audio = {
      ctx: null as AudioContext | null,
      unlocked: false,
      unlock() {
        if (this.unlocked) return;
        try {
          this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          this.unlocked = true;
        } catch {}
      },
      beep(freq: number, dur: number, type: OscillatorType, gain: number) {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.01);
      },
      shoot() {
        this.beep(360, 0.05, "square", 0.07);
        this.beep(220, 0.04, "triangle", 0.05);
      },
      hit() {
        this.beep(520, 0.045, "sawtooth", 0.05);
      },
      pickup() {
        this.beep(740, 0.05, "sine", 0.05);
        this.beep(980, 0.05, "sine", 0.04);
      },
      build() {
        this.beep(180, 0.08, "triangle", 0.055);
      },
      victory() {
        this.beep(660, 0.12, "sine", 0.06);
        this.beep(880, 0.12, "sine", 0.06);
        this.beep(990, 0.18, "sine", 0.06);
      },
      death() {
        this.beep(140, 0.16, "sawtooth", 0.07);
        this.beep(90, 0.22, "triangle", 0.06);
      },
    };

    // =============================
    // RENDERER
    // =============================
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x0b1020, 1);
    mountRef.current.appendChild(renderer.domElement);

    // =============================
    // SCENE
    // =============================
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1020, 60, 520);

    // =============================
    // CAMERA (FIRST PERSON)
    // =============================
    const camera = new THREE.PerspectiveCamera(80, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2500);

    // look state
    let yaw = 0;
    let pitch = 0;

    // =============================
    // LIGHTS
    // =============================
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1b1330, 0.95);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(40, 75, 25);
    scene.add(dir);

    // =============================
    // TERRAIN
    // =============================
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x3ddc6f, // açık yeşil
        roughness: 0.98,
        metalness: 0.02,
      })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W, SEA_H, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        roughness: 0.35,
        metalness: 0.05,
        emissive: 0x0b2a6a,
        emissiveIntensity: 0.3,
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(HALF - SEA_W / 2 - 10, 0.02, -HALF + SEA_H / 2 + 10);
    sea.renderOrder = 2;
    scene.add(sea);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W + 60, SEA_H + 60, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.95,
        metalness: 0.02,
        emissive: 0x4b3a00,
        emissiveIntensity: 0.12,
      })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.copy(sea.position);
    sand.position.y = 0.01;
    sand.renderOrder = 1;
    scene.add(sand);

    // =============================
    // Obstacles (houses + map walls)
    // =============================
    const obstacles: THREE.Mesh[] = [];
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a2a,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x0a1a1a,
      emissiveIntensity: 0.25,
    });

    function addBox(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), obstacleMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
      return m;
    }

    // Grass walls (map border)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0x052e12,
      emissiveIntensity: 0.25,
    });

    function addWall(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
    }

    const thickness = 6;
    addWall(0, -HALF, MAP_SIZE + thickness, 8, thickness);
    addWall(0, HALF, MAP_SIZE + thickness, 8, thickness);
    addWall(-HALF, 0, thickness, 8, MAP_SIZE + thickness);
    addWall(HALF, 0, thickness, 8, MAP_SIZE + thickness);

    // Houses
    for (let i = 0; i < 14; i++) {
      const x = rand(-HALF + 60, HALF - 60);
      const z = rand(-HALF + 60, HALF - 60);
      const inBeach = Math.abs(x - sea.position.x) < (SEA_W + 70) / 2 && Math.abs(z - sea.position.z) < (SEA_H + 70) / 2;
      if (inBeach) continue;
      addBox(x, z, rand(10, 20), rand(6, 11), rand(10, 20));
    }

    // Trees (visual)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.9,
      emissive: 0x052e12,
      emissiveIntensity: 0.2,
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

    // subtle grid
    const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x22c55e, 0x0b1a12);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.08;
    scene.add(grid);

    // =============================
    // Name sprite helper
    // =============================
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

      ctx.font = "bold 44px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(224,231,255,0.97)";
      ctx.fillText(name, c.width / 2, c.height / 2 + 6);

      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(2.7, 0.65, 1);
      return spr;
    }

    // =============================
    // Player (body only for world; camera is first-person)
    // =============================
    const player = new THREE.Group();
    const playerMat = new THREE.MeshStandardMaterial({
      color: 0x0f1733,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x111a44,
      emissiveIntensity: 0.6,
    });
    const pCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 14), playerMat);
    pCyl.position.y = 0.95;
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), playerMat);
    pHead.position.y = 1.6;
    const pHip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), playerMat);
    pHip.position.y = 0.4;
    player.add(pCyl, pHead, pHip);

    const playerName = makeNameSprite("DORUKSIGMA");
    playerName.position.set(0, 2.6, 0);
    player.add(playerName);

    scene.add(player);

    // weapon hand (first-person gun)
    const fpGun = new THREE.Group();
    scene.add(fpGun);

    let playerWeapon: WeaponType | null = null;
    let playerAmmo = 0;
    let playerShootCd = 0;

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
        emissiveIntensity: 0.55,
      });

      if (type === "PISTOL") {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 1.0), baseMat);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.28), baseMat);
        grip.position.set(-0.12, -0.30, 0.12);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.2), accentMat);
        sight.position.set(0.22, 0.2, 0.12);
        g.add(body, grip, sight);
      } else if (type === "RIFLE") {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 1.9), baseMat);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.55, 10), baseMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.12, 0.0, -0.7);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.6), baseMat);
        stock.position.set(-0.18, 0.0, 0.8);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.5, 12), accentMat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0.0, 0.18, -0.2);
        g.add(body, barrel, stock, scope);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 1.55), baseMat);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.32, 12), baseMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.12, 0.0, -0.5);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.65), baseMat);
        stock.position.set(-0.18, 0.0, 0.62);
        const accent = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.34), accentMat);
        accent.position.set(0.0, 0.18, -0.06);
        g.add(body, barrel, stock, accent);
      }
      return g;
    }

    function equipPlayerWeapon(type: WeaponType) {
      playerWeapon = type;
      playerAmmo = WEAPONS[type].ammoMax;
      // fp gun model
      fpGun.clear();
      const g = makeWeaponMesh(type);
      g.scale.setScalar(1.05);
      fpGun.add(g);

      setHud((h) => ({ ...h, weapon: WEAPONS[type].name, ammo: playerAmmo, msg: `✅ ${WEAPONS[type].name} aldın` }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
    }

    function unequipPlayerWeapon() {
      playerWeapon = null;
      playerAmmo = 0;
      fpGun.clear();
      setHud((h) => ({ ...h, weapon: "", ammo: 0 }));
    }

    // =============================
    // Bus + parachute
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
    scene.add(bus);

    // bus path: from map start to end (not half)
    bus.position.set(-HALF + 10, 0, -HALF + 20);
    const busStart = new THREE.Vector3(-HALF + 10, 0, -HALF + 20);
    const busEnd = new THREE.Vector3(HALF - 10, 0, HALF - 20);
    let busProgress = 0; // 0..1
    let dropped = false;
    let parachuting = false;

    // parachute model (simple)
    const parachute = new THREE.Group();
    const chuteMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.55, metalness: 0.05, emissive: 0x3a0a1f, emissiveIntensity: 0.25 });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), chuteMat);
    canopy.scale.set(1.2, 0.55, 1.2);
    canopy.position.y = 3.6;
    parachute.add(canopy);
    parachute.visible = false;
    player.add(parachute);

    // =============================
    // Loot: medkits + weapons
    // =============================
    const medkits: Medkit[] = [];
    const weaponLoots: WeaponLoot[] = [];

    const kitBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.15,
      emissive: 0x0b1020,
      emissiveIntensity: 0.25,
    });
    const kitCrossMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.55,
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

      let x = 0, z = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = rand(-HALF + 45, HALF - 45);
        z = rand(-HALF + 45, HALF - 45);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);
      medkits.push({ mesh: g, taken: false });
    }

    // more kits
    for (let i = 0; i < 18; i++) spawnMedkit();

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

      let x = 0, z = 0;
      for (let tries = 0; tries < 50; tries++) {
        x = rand(-HALF + 45, HALF - 45);
        z = rand(-HALF + 45, HALF - 45);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);

      weaponLoots.push({ mesh: g, taken: false, type: t });
    }

    for (let i = 0; i < 28; i++) spawnWeaponLoot();

    // =============================
    // Bots
    // =============================
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({
      color: 0x3b0a0a,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0x220606,
      emissiveIntensity: 0.5,
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

      // spawn avoid sea
      let x = 0, z = 0;
      for (let tries = 0; tries < 60; tries++) {
        x = rand(-HALF + 60, HALF - 60);
        z = rand(-HALF + 60, HALF - 60);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        const tooClosePlayer = player.position.distanceTo(new THREE.Vector3(x, 0, z)) < 25;
        if (!inSea && !tooClosePlayer) break;
      }

      g.position.set(x, 0, z);
      scene.add(g);

      bots.push({
        mesh: g,
        name,
        hp: 60,
        shootCd: rand(0.2, 1.2),
        weapon: null,
        ammo: 0,
        alive: true,
      });
    }

    for (let i = 0; i < MAX_BOTS; i++) spawnBot();

    // =============================
    // Build walls
    // =============================
    const buildWalls: BuildWall[] = [];
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.9,
      metalness: 0.05,
      emissive: 0x3a1a00,
      emissiveIntensity: 0.15,
    });

    function placeWall(at: THREE.Vector3, facingYaw: number) {
      // wall is thin plane-like box
      const geom = new THREE.BoxGeometry(4, 3, 0.35);
      const mesh = new THREE.Mesh(geom, woodMat);
      mesh.position.set(at.x, 1.5, at.z);
      mesh.rotation.y = facingYaw;
      scene.add(mesh);
      obstacles.push(mesh); // for collision
      buildWalls.push({ mesh, hp: WALL_HP });
      audio.build();
    }

    // =============================
    // Particles + damage pops (UI)
    // =============================
    const particles: Particle[] = [];

    function spawnImpactParticles(pos: THREE.Vector3) {
      const pMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.6,
        metalness: 0.05,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.25,
      });

      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pMat);
        m.position.copy(pos);
        scene.add(m);
        particles.push({
          mesh: m,
          vel: new THREE.Vector3(rand(-2.2, 2.2), rand(1.2, 4.0), rand(-2.2, 2.2)),
          life: rand(0.35, 0.65),
          maxLife: rand(0.35, 0.65),
        });
      }
    }

    const dmgPopRef = useRef({
      items: [] as Array<{ id: string; world: THREE.Vector3; text: string; life: number; maxLife: number }>,
      uiThrottle: 0,
    });

    function worldToScreen(p: THREE.Vector3) {
      const v = p.clone().project(camera);
      const el = renderer.domElement;
      return {
        x: (v.x * 0.5 + 0.5) * el.clientWidth,
        y: (-v.y * 0.5 + 0.5) * el.clientHeight,
      };
    }

    function addDamageText(world: THREE.Vector3, txt: string) {
      dmgPopRef.current.items.push({
        id: `${Date.now()}_${Math.random()}`,
        world: world.clone(),
        text: txt,
        life: 0.9,
        maxLife: 0.9,
      });
    }

    // =============================
    // Shooting (ray + tracer)
    // =============================
    const raycaster = new THREE.Raycaster();

    const tracers: Tracer[] = [];
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 });

    function spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
      const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      const line = new THREE.Line(geo, tracerMat);
      scene.add(line);
      tracers.push({ line, life: 0.06, maxLife: 0.06 });
    }

    function applyDamageToPlayer(dmg: number, hitPos?: THREE.Vector3) {
      const cur = hudRef.current;
      if (cur.dead || cur.victory) return;

      setHud((h) => {
        if (h.dead || h.victory) return h;
        const hp = Math.max(0, h.hp - dmg);
        const dead = hp <= 0;
        return { ...h, hp, dead, msg: dead ? "💀 GAME OVER" : h.msg };
      });

      if (hitPos) {
        addDamageText(hitPos, `-${dmg}`);
      }

      if (cur.hp - dmg <= 0) audio.death();
    }

    function healPlayer(amount: number) {
      const cur = hudRef.current;
      if (cur.dead || cur.victory) return;

      setHud((h) => {
        if (h.dead || h.victory) return h;
        const hp = Math.min(100, h.hp + amount);
        return { ...h, hp, msg: `+${amount} HP` };
      });
      audio.pickup();
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    function damageWall(mesh: THREE.Mesh, dmg: number) {
      const w = buildWalls.find((x) => x.mesh === mesh);
      if (!w) return;
      w.hp -= dmg;
      addDamageText(mesh.position.clone().add(new THREE.Vector3(0, 2.0, 0)), `-${dmg}`);
      spawnImpactParticles(mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)));

      if (w.hp <= 0) {
        scene.remove(mesh);
        // remove from obstacles
        const oi = obstacles.indexOf(mesh);
        if (oi >= 0) obstacles.splice(oi, 1);
        const wi = buildWalls.indexOf(w);
        if (wi >= 0) buildWalls.splice(wi, 1);
      }
    }

    function shootCommon(from: THREE.Vector3, dir: THREE.Vector3, shooter: "PLAYER" | "BOT", bot?: Bot) {
      // shooter must have weapon
      const cur = hudRef.current;
      if (cur.dead || cur.victory) return;

      const wType = shooter === "PLAYER" ? playerWeapon : bot?.weapon;
      if (!wType) return;
      const st = WEAPONS[wType];

      // trace
      raycaster.set(from, dir.normalize());
      raycaster.far = st.maxRange;

      const botMeshes = bots.filter((b) => b.alive).map((b) => b.mesh);
      const hits = raycaster.intersectObjects([...botMeshes, ...buildWalls.map((w) => w.mesh)], true);

      let hitPoint = from.clone().add(dir.clone().multiplyScalar(st.maxRange));
      if (hits.length > 0) hitPoint = hits[0].point.clone();

      spawnTracer(from, hitPoint);

      if (hits.length > 0) {
        const hitObj = hits[0].object;

        // wall?
        const wallMesh = buildWalls.map((w) => w.mesh).find((m) => hitObj === m || hitObj.parent === m);
        if (wallMesh) {
          damageWall(wallMesh, st.damage);
          audio.hit();
          return;
        }

        // bot hit?
        const rootBot = bots.find((b) => hitObj.parent?.parent === b.mesh || hitObj.parent === b.mesh || hitObj === b.mesh);
        if (rootBot && rootBot.alive && shooter === "PLAYER") {
          rootBot.hp -= st.damage;
          addDamageText(hits[0].point.clone(), `-${st.damage}`);
          spawnImpactParticles(hits[0].point.clone());
          audio.hit();

          if (rootBot.hp <= 0) {
            rootBot.alive = false;
            scene.remove(rootBot.mesh);
            setHud((h) => ({ ...h, score: h.score + 25, kills: h.kills + 1 }));
          }
          return;
        }

        // player hit? (bot shooting uses chance outside)
      }
    }

    function playerShoot() {
      const cur = hudRef.current;
      if (cur.dead || cur.victory) return;
      if (cur.phase !== "PLAY") return;
      if (parachuting) return;

      if (!playerWeapon) {
        setHud((h) => ({ ...h, msg: "Silah yok! (E ile yerden al)" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
        return;
      }
      if (playerAmmo <= 0) {
        setHud((h) => ({ ...h, msg: "Ammo bitti! (R)" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 700);
        return;
      }
      if (playerShootCd > 0) return;

      const st = WEAPONS[playerWeapon];
      playerShootCd = st.cooldown;
      playerAmmo -= 1;
      setHud((h) => ({ ...h, ammo: playerAmmo }));

      audio.shoot();

      // from camera center
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      // muzzle point slightly in front
      const from = camera.position.clone().add(dir.clone().multiplyScalar(0.6));
      shootCommon(from, dir, "PLAYER");
    }

    function botTryShoot(b: Bot, playerPos: THREE.Vector3) {
      if (!b.weapon) return;
      if (b.ammo <= 0) return;
      if (b.shootCd > 0) return;
      if (parachuting) return; // no shooting while player parachuting

      const st = WEAPONS[b.weapon];

      // aim direction to player head
      const target = playerPos.clone().add(new THREE.Vector3(0, 1.4, 0));
      const from = b.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const dir = target.clone().sub(from);
      const dist = dir.length();
      if (dist > st.maxRange) return;

      // accuracy by distance
      const t = clamp(dist / st.maxRange, 0, 1);
      const acc = st.accuracyNear * (1 - t) + st.accuracyFar * t;

      // also require player in FOV & vision
      // FOV check vs bot forward
      const botForward = new THREE.Vector3(0, 0, 1).applyQuaternion(b.mesh.quaternion);
      const toP = target.clone().sub(from).normalize();
      const ang = botForward.angleTo(toP);
      if (ang > BOT_FOV * 0.5) return;
      if (dist > BOT_VISION_RANGE) return;

      b.shootCd = st.cooldown + rand(0.03, 0.18);
      b.ammo -= 1;

      // always draw tracer
      shootCommon(from, dir.clone().normalize(), "BOT", b);

      // apply damage probabilistically (bots not aimbot)
      if (Math.random() < acc) {
        applyDamageToPlayer(st.damage, playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)));
      }
    }

    // =============================
    // Controls + movement
    // =============================
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false, f: false };

    const vel = new THREE.Vector3(0, 0, 0);
    const tmp = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const PLAYER_HEIGHT = 1.8;
    const GROUND_Y = 0;
    let onGround = true;

    // =============================
    // Collision resolve
    // =============================
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

    // =============================
    // Pickup helpers
    // =============================
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
          audio.pickup();
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

    // =============================
    // Pointer Lock + inputs
    // =============================
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

      const SENS = 0.0023;
      yaw -= mx * SENS;
      pitch -= my * SENS;

      // allow up/down like PUBG (but not flip)
      pitch = clamp(pitch, -1.25, 1.15);
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const cur = hudRef.current;
      if (cur.phase !== "PLAY") return;
      if (cur.dead || cur.victory) return;

      audio.unlock();

      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      playerShoot();
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
        const cur = hudRef.current;
        if (!playerWeapon) {
          setHud((h) => ({ ...h, msg: "Silah yok" }));
          setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 600);
          return;
        }
        playerAmmo = WEAPONS[playerWeapon].ammoMax;
        setHud((h) => ({ ...h, ammo: playerAmmo, msg: "Reload" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 500);
      }

      if (e.code === "Escape") document.exitPointerLock?.();
      if (e.code === "Enter") {
        const cur = hudRef.current;
        if (cur.dead || cur.victory) window.location.reload();
      }
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
      audio.unlock();
      if (!dropped) requestLock();
    });

    // =============================
    // Resize
    // =============================
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
    // Minimap
    // =============================
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
      mctx.fillStyle = "#0b2a14";
      mctx.fillRect(0, 0, W, H);

      // sand
      mctx.fillStyle = "rgba(250,204,21,0.72)";
      mctx.fillRect(
        sx(sand.position.x - (SEA_W + 60) / 2),
        sz(sand.position.z - (SEA_H + 60) / 2),
        ((SEA_W + 60) / MAP_SIZE) * W,
        ((SEA_H + 60) / MAP_SIZE) * H
      );

      // sea
      mctx.fillStyle = "rgba(29,78,216,0.9)";
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

      // walls (build)
      mctx.fillStyle = "rgba(180,83,9,0.9)";
      for (const w of buildWalls) {
        const x = sx(w.mesh.position.x);
        const z = sz(w.mesh.position.z);
        mctx.fillRect(x - 2, z - 2, 4, 4);
      }

      // kits
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

    // =============================
    // GAME LOOP
    // =============================
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);
      const cur = hudRef.current;

      // victory check
      if (!cur.victory && !cur.dead) {
        const aliveBots = bots.filter((b) => b.alive).length;
        if (aliveBots === 0 && cur.kills >= cur.totalBots) {
          setHud((h) => ({ ...h, victory: true, msg: "🏆 VICTORY ROYALE" }));
          audio.victory();
        }
      }

      // BUS phase
      if (cur.phase === "BUS") {
        // bus moves from start to end
        busProgress = Math.min(1, busProgress + dt * 0.03); // speed
        bus.position.lerpVectors(busStart, busEnd, busProgress);

        // camera bus view (follow)
        camera.position.set(bus.position.x + 20, 28, bus.position.z + 20);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        // press E to jump (parachute)
        if (keys.e && !dropped) {
          dropped = true;
          parachuting = true;
          parachute.visible = true;
          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));

          // start above bus; fall slowly
          player.position.set(bus.position.x - 2.2, 60, bus.position.z + 2.0);
          vel.set(0, -2.0, 0);
          onGround = false;

          // no gun at start
          unequipPlayerWeapon();
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // dead/victory freeze
      if (cur.dead || cur.victory) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // update cds
      if (playerShootCd > 0) playerShootCd = Math.max(0, playerShootCd - dt);
      if (buildCd > 0) buildCd = Math.max(0, buildCd - dt);

      // camera rotation from yaw/pitch
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // movement intent
      forward.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      right.copy(forward).cross(up).normalize();

      tmp.set(0, 0, 0);
      if (keys.w) tmp.add(forward);
      if (keys.s) tmp.sub(forward);
      if (keys.d) tmp.add(right);
      if (keys.a) tmp.sub(right);
      if (tmp.lengthSq() > 0) tmp.normalize();

      const targetSpeed = keys.shift ? PLAYER_SPRINT : PLAYER_SPEED;
      const accel = parachuting ? 0.07 : 0.18;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * targetSpeed, accel);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * targetSpeed, accel);

      // jump
      if (!parachuting && keys.space && onGround) {
        vel.y = PLAYER_JUMP;
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

      // ground collision
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;
        if (parachuting) {
          parachuting = false;
          parachute.visible = false;
          setHud((h) => ({ ...h, parachute: false, msg: "" }));
        }
      }

      // collision
      resolveObstaclesFor(player.position, 0.55);

      // clamp into map (just extra)
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // FIRST PERSON camera position at head
      const headPos = new THREE.Vector3(player.position.x, player.position.y + PLAYER_HEIGHT * 0.88, player.position.z);
      camera.position.copy(headPos);

      // FP gun follows camera (slightly right/down)
      fpGun.position.copy(camera.position);
      fpGun.quaternion.copy(camera.quaternion);
      fpGun.translateX(0.38);
      fpGun.translateY(-0.30);
      fpGun.translateZ(-0.65);

      // pickup
      if (!parachuting && keys.e) {
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      // build (F) – place wall in front of player
      if (!parachuting && keys.f && buildCd <= 0) {
        buildCd = WALL_COOLDOWN;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const at = player.position.clone().add(new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(4.0));
        // don't build in sea
        const inSea = Math.abs(at.x - sea.position.x) < SEA_W / 2 && Math.abs(at.z - sea.position.z) < SEA_H / 2;
        if (!inSea) {
          placeWall(at, yaw);
        }
      }

      // Bots
      const playerPos = player.position.clone();
      for (const b of bots) {
        if (!b.alive) continue;

        const bpos = b.mesh.position;

        // if bot has no weapon -> go find nearest weapon
        if (!b.weapon) {
          const { best } = findNearestUntakenWeapon(bpos);
          if (best) {
            const dirToW = best.mesh.position.clone().sub(bpos);
            const distW = dirToW.length();
            const targetYaw = Math.atan2(dirToW.x, dirToW.z);
            b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.12);

            dirToW.y = 0;
            if (dirToW.lengthSq() > 0) dirToW.normalize();
            bpos.x += dirToW.x * dt * BOT_CHASE_SPEED;
            bpos.z += dirToW.z * dt * BOT_CHASE_SPEED;

            resolveObstaclesFor(bpos, 0.45);
            bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
            bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

            if (distW < 2.6 && !best.taken) {
              best.taken = true;
              scene.remove(best.mesh);
              b.weapon = best.type;
              b.ammo = WEAPONS[best.type].ammoMax;
              setTimeout(() => spawnWeaponLoot(), 2500);
            }
          }
          continue;
        }

        // bot armed: perceive player (vision+FOV)
        const toP = playerPos.clone().sub(bpos);
        const dist = toP.length();

        // FOV check
        const botForward = new THREE.Vector3(0, 0, 1).applyQuaternion(b.mesh.quaternion);
        const toPN = toP.clone().normalize();
        const ang = botForward.angleTo(toPN);

        const canSee = dist <= BOT_VISION_RANGE && ang <= BOT_FOV * 0.5;

        // rotate towards player smoothly
        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.10);

        // chase if can see, otherwise wander slightly
        if (canSee) {
          toP.y = 0;
          if (toP.lengthSq() > 0) toP.normalize();
          bpos.x += toP.x * dt * BOT_CHASE_SPEED;
          bpos.z += toP.z * dt * BOT_CHASE_SPEED;
        } else {
          // tiny random drift
          bpos.x += Math.sin((Date.now() * 0.001 + bpos.x) * 0.7) * dt * 0.35;
          bpos.z += Math.cos((Date.now() * 0.001 + bpos.z) * 0.7) * dt * 0.35;
        }

        resolveObstaclesFor(bpos, 0.45);
        bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
        bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

        // cooldown tick
        b.shootCd = Math.max(0, b.shootCd - dt);

        // shoot if can see
        if (canSee) {
          botTryShoot(b, playerPos);
        }
      }

      // tracers update
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.life -= dt;
        const a = clamp(t.life / t.maxLife, 0, 1);
        (t.line.material as THREE.LineBasicMaterial).opacity = 0.95 * a;
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      // particles update
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.vel.y -= 6.5 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);

        const a = clamp(p.life / p.maxLife, 0, 1);
        p.mesh.scale.setScalar(0.8 * a);

        if (p.mesh.position.y < 0.02) {
          p.mesh.position.y = 0.02;
          p.vel.multiplyScalar(0.25);
        }

        if (p.life <= 0) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        }
      }

      // damage pop update
      for (let i = dmgPopRef.current.items.length - 1; i >= 0; i--) {
        const it = dmgPopRef.current.items[i];
        it.life -= dt;
        it.world.y += dt * 0.35;
        if (it.life <= 0) dmgPopRef.current.items.splice(i, 1);
      }

      // UI throttle for dmg texts
      dmgPopRef.current.uiThrottle -= dt;
      if (dmgPopRef.current.uiThrottle <= 0) {
        dmgPopRef.current.uiThrottle = 0.06;
        const mapped = dmgPopRef.current.items.map((it) => {
          const s = worldToScreen(it.world);
          return { id: it.id, x: s.x, y: s.y, text: it.text, a: clamp(it.life / it.maxLife, 0, 1) };
        });
        setDmgTexts(mapped);
      }

      // update HUD ammo if changed outside setHud
      if (cur.ammo !== playerAmmo) {
        setHud((h) => ({ ...h, ammo: playerAmmo }));
      }

      // end: render
      renderer.render(scene, camera);
      drawMinimap();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    // =============================
    // CLEANUP
    // =============================
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

      for (const p of particles) scene.remove(p.mesh);

      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
      try {
        audio.ctx?.close?.();
      } catch {}
    };
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Minimap */}
      <canvas ref={minimapRef} width={240} height={240} className="absolute top-3 right-3 rounded-2xl border border-slate-800 bg-slate-950/70" />

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
          🎯 Kills: <span className="font-semibold">{hud.kills}</span>/<span className="font-semibold">{hud.totalBots}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">🧰 {hud.weapon ? hud.weapon : "Silahsız"}</div>

        {hud.parachute ? <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">🪂 Paraşüt</div> : null}
        {hud.msg ? <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">{hud.msg}</div> : null}
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-3 w-3 rounded-full border border-yellow-300/80" />
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
              <span className="text-slate-100 font-semibold">WASD</span> hareket • <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
              <span className="text-slate-100 font-semibold">Mouse</span> bakış • <span className="text-slate-100 font-semibold">Sol tık</span> ateş •{" "}
              <span className="text-slate-100 font-semibold">E</span> loot • <span className="text-slate-100 font-semibold">F</span> build
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
            <button onClick={() => window.location.reload()} className="mt-5 px-5 py-2 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition">
              Yeniden Başla
            </button>
          </div>
        </div>
      ) : null}

      {/* VICTORY */}
      {hud.victory ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[min(560px,92vw)] rounded-2xl border border-emerald-700/40 bg-slate-950/80 p-6 text-center">
            <div className="text-4xl font-extrabold text-emerald-300">🏆 VICTORY ROYALE</div>
            <div className="mt-3 text-slate-200">
              Kills: <span className="font-semibold text-emerald-200">{hud.kills}</span> / {hud.totalBots}
            </div>
            <div className="mt-1 text-slate-300">
              Skor: <span className="font-semibold text-indigo-300">{hud.score}</span>
            </div>
            <div className="mt-4 text-sm text-slate-400">
              Yeniden başlatmak için <span className="text-slate-100 font-semibold">ENTER</span>
            </div>
            <button onClick={() => window.location.reload()} className="mt-5 px-5 py-2 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition">
              Yeni Maç
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
