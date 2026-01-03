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
  e: boolean;
  f: boolean; // build
};

type WeaponType = "PISTOL" | "RIFLE" | "SHOTGUN";

type WeaponStats = {
  name: string;
  damage: number; // 10
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
  alive: boolean;
};

type Medkit = { mesh: THREE.Group; taken: boolean };
type WeaponLoot = { mesh: THREE.Group; taken: boolean; type: WeaponType };

type BuildWall = { mesh: THREE.Mesh; hp: number };

type Particle = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
};

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
  diff = ((2 * diff) % TWO_PI) - diff;
  return a + diff * t;
}

const BOT_NAMES = ["Polat Alemdar", "Memati 😄", "Abdülhey", "Aslan Akbey", "Kılıç", "Pala 😂", "Deli Yürek", "Tombik", "Şaşkın Bot", "Serseri Bot", "Cevat"];

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
    victory: false,
    msg: "" as string,
    parachute: false,
    kills: 0,
    totalBots: 20,
  });

  const [dmgTexts, setDmgTexts] = useState<Array<{ id: string; x: number; y: number; text: string; a: number }>>([]);

  useEffect(() => {
    if (!mountRef.current) return;

    // =============================
    // BASIC SETTINGS
    // =============================
    const MAP_SIZE = 500;
    const HALF = MAP_SIZE / 2;

    const SEA_W = 210;
    const SEA_H = 160;

    const MAX_BOTS = 20;

    // Bot Vision
    const BOT_VISION_RANGE = 28;
    const BOT_FOV = THREE.MathUtils.degToRad(100);

    const BOT_CHASE_SPEED = 3.4;
    const BOT_STRAFE_SPEED = 1.6;

    // =============================
    // AUDIO (WebAudio - no file)
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
        this.beep(360, 0.06, "square", 0.08);
        this.beep(220, 0.05, "triangle", 0.05);
      },
      hit() {
        this.beep(520, 0.05, "sawtooth", 0.06);
      },
      build() {
        this.beep(180, 0.09, "triangle", 0.06);
      },
      pickup() {
        this.beep(740, 0.06, "sine", 0.05);
        this.beep(980, 0.05, "sine", 0.04);
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
    // RENDERER / SCENE / CAMERA
    // =============================
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 60, 420);

    const camera = new THREE.PerspectiveCamera(78, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2500);
    camera.up.set(0, 1, 0);

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

    // =============================
    // COLLISION OPTIMIZATION (Box3 cache)
    // =============================
    const obstacles: THREE.Mesh[] = [];
    const tmpBox = new THREE.Box3();
    const tmpBox2 = new THREE.Box3();

    function cacheWorldBox(mesh: THREE.Object3D) {
      // Dünya bbox'u bir kez kaydet (static)
      // Mesh ise geometry bbox'u + matrixWorld ile güvenli
      const m = mesh as THREE.Mesh;
      if ((m as any).isMesh && m.geometry) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        m.updateMatrixWorld(true);
        const bb = new THREE.Box3().copy(m.geometry.boundingBox!);
        bb.applyMatrix4(m.matrixWorld);
        (m.userData as any)._bbox = bb;
      } else {
        // fallback
        const bb = new THREE.Box3().setFromObject(mesh);
        (mesh.userData as any)._bbox = bb;
      }
    }

    function addObstacle(mesh: THREE.Mesh) {
      obstacles.push(mesh);
      cacheWorldBox(mesh);
      return mesh;
    }

    function resolveObstaclesFor(pos: THREE.Vector3, radius: number) {
      for (const box of obstacles) {
        const cached = (box.userData as any)._bbox as THREE.Box3 | undefined;
        if (!cached) continue;

        // tmpBox = cached expanded by radius (no allocations)
        tmpBox.copy(cached);
        tmpBox.min.x -= radius;
        tmpBox.max.x += radius;
        tmpBox.min.z -= radius;
        tmpBox.max.z += radius;

        // Y check (cheap)
        if (pos.y > tmpBox.max.y + 0.2) continue;

        if (pos.x > tmpBox.min.x && pos.x < tmpBox.max.x && pos.z > tmpBox.min.z && pos.z < tmpBox.max.z) {
          const dxMin = Math.abs(pos.x - tmpBox.min.x);
          const dxMax = Math.abs(tmpBox.max.x - pos.x);
          const dzMin = Math.abs(pos.z - tmpBox.min.z);
          const dzMax = Math.abs(tmpBox.max.z - pos.z);

          const m = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (m === dxMin) pos.x = tmpBox.min.x;
          else if (m === dxMax) pos.x = tmpBox.max.x;
          else if (m === dzMin) pos.z = tmpBox.min.z;
          else pos.z = tmpBox.max.z;
        }
      }
    }

    // =============================
    // OBSTACLES
    // =============================
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
      addObstacle(m);
      return m;
    }

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
      addObstacle(m);
      return m;
    }

    const thickness = 6;
    addWall(0, -HALF, MAP_SIZE + thickness, 10, thickness);
    addWall(0, HALF, MAP_SIZE + thickness, 10, thickness);
    addWall(-HALF, 0, thickness, 10, MAP_SIZE + thickness);
    addWall(HALF, 0, thickness, 10, MAP_SIZE + thickness);

    for (let i = 0; i < 14; i++) {
      const x = rand(-HALF + 60, HALF - 60);
      const z = rand(-HALF + 60, HALF - 60);
      const inBeach = Math.abs(x - sea.position.x) < (SEA_W + 70) / 2 && Math.abs(z - sea.position.z) < (SEA_H + 70) / 2;
      if (inBeach) continue;
      addBox(x, z, rand(10, 20), rand(6, 11), rand(10, 20));
    }

    // Trees (no collision for perf)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, emissive: 0x052e12, emissiveIntensity: 0.25 });

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

    // =============================
    // NAME SPRITE
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

    // =============================
    // PLAYER
    // =============================
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

    const hand = new THREE.Object3D();
    hand.position.set(0.45, 1.05, -0.35);
    player.add(hand);

    scene.add(player);

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
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.6), baseMat);
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
      audio.pickup();
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
    }

    // =============================
    // PARACHUTE MESH
    // =============================
    const parachute = new THREE.Group();
    parachute.visible = false;

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.7, metalness: 0.05, emissive: 0x2a0707, emissiveIntensity: 0.25 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9, metalness: 0, emissive: 0x0b1020, emissiveIntensity: 0.1 });

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

    // =============================
    // BUILD WALLS (100 HP)
    // =============================
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

      // collision + cached bbox
      addObstacle(mesh);

      buildWalls.push({ mesh, hp: 100 });
      audio.build();

      setHud((h) => ({ ...h, msg: "🧱 Tahta duvar kuruldu (100HP)" }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 600);
    }

    // =============================
    // BUS (start from map begin)
    // =============================
    const bus = new THREE.Group();
    const busMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6, metalness: 0.2, emissive: 0x4b3a00, emissiveIntensity: 0.25 });
    const busBody = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), busMat);
    busBody.position.y = 18;
    bus.add(busBody);

    const BUS_START = new THREE.Vector3(-HALF + 25, 0, -HALF + 30);
    const BUS_END = new THREE.Vector3(HALF - 25, 0, HALF - 30);
    bus.position.copy(BUS_START);
    scene.add(bus);

    let busT = 0;
    let dropped = false;

    // =============================
    // BOTS
    // =============================
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({ color: 0x3b0a0a, roughness: 0.6, metalness: 0.1, emissive: 0x220606, emissiveIntensity: 0.55 });

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
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }

      g.position.set(x, 0, z);
      scene.add(g);

      bots.push({ mesh: g, name, hp: 100, shootCd: rand(0.2, 1.0), weapon: null, alive: true });
    }

    for (let i = 0; i < MAX_BOTS; i++) spawnBot();

    // =============================
    // MEDKITS
    // =============================
    const medkits: Medkit[] = [];
    const kitBaseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.15, emissive: 0x0b1020, emissiveIntensity: 0.35 });
    const kitCrossMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.2, emissive: 0x7f1d1d, emissiveIntensity: 0.6 });

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

    // =============================
    // WEAPON LOOT
    // =============================
    const weaponLoots: WeaponLoot[] = [];

    function spawnWeaponLoot(type?: WeaponType) {
      const t: WeaponType = type ?? pick<WeaponType>(["PISTOL", "RIFLE", "SHOTGUN"]);
      const g = new THREE.Group();

      const standMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.5, metalness: 0.12, emissive: 0x050a14, emissiveIntensity: 0.2 });
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
    for (let i = 0; i < 30; i++) spawnWeaponLoot();

    // =============================
    // PARTICLES (impact)
    // =============================
    const particles: Particle[] = [];
    const particleGeo = new THREE.SphereGeometry(0.06, 8, 8);

    const particleMatBot = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6, metalness: 0.1, emissive: 0x3a0a0a, emissiveIntensity: 0.4 });
    const particleMatWall = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.7, metalness: 0.05, emissive: 0x3a2a00, emissiveIntensity: 0.35 });
    const particleMatGround = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, metalness: 0.0, emissive: 0x0b1020, emissiveIntensity: 0.12 });

    function spawnImpactParticles(pos: THREE.Vector3, kind: "BOT" | "WALL" | "GROUND", intensity = 1) {
      const mat = kind === "BOT" ? particleMatBot : kind === "WALL" ? particleMatWall : particleMatGround;
      const count = Math.floor(6 * intensity);
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(particleGeo, mat);
        m.position.copy(pos);
        scene.add(m);
        const vel = new THREE.Vector3(rand(-1, 1), rand(0.6, 1.8), rand(-1, 1)).multiplyScalar(rand(0.6, 1.4));
        particles.push({ mesh: m, vel, life: rand(0.25, 0.45), maxLife: 0.45 });
      }
    }

    // =============================
    // SHOOTING / TRACERS / DAMAGE POP
    // =============================
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
        if (h.dead || h.victory) return h;
        const hp = Math.max(0, h.hp - dmg);
        if (hp <= 0) {
          // death sound once
          setTimeout(() => audio.death(), 0);
        }
        return { ...h, hp, dead: hp <= 0, msg: hp <= 0 ? "💀 GAME OVER" : h.msg };
      });
    }

    function healPlayer(amount: number) {
      setHud((h) => {
        if (h.dead || h.victory) return h;
        return { ...h, hp: Math.min(100, h.hp + amount), msg: `+${amount} HP` };
      });
      audio.pickup();
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    const dmgPopRef = {
      items: [] as Array<{ id: string; world: THREE.Vector3; text: string; life: number }>,
      uiThrottle: 0,
    };

    function addDamageText(worldPos: THREE.Vector3, text: string) {
      dmgPopRef.items.push({ id: Math.random().toString(36).slice(2), world: worldPos.clone(), text, life: 0.9 });
    }

    function worldToScreen(pos: THREE.Vector3) {
      const p = pos.clone().project(camera);
      const w = mountRef.current?.clientWidth || 1;
      const h = mountRef.current?.clientHeight || 1;
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    }

    function checkVictoryIfNeeded() {
      // alive bot count
      const alive = bots.filter((b) => b.alive).length;
      if (alive <= 0) {
        setHud((h) => {
          if (h.victory) return h;
          setTimeout(() => audio.victory(), 0);
          return { ...h, victory: true, msg: "🏆 VICTORY ROYALE!" };
        });
      }
    }

    function shootPlayer() {
      if (!playerWeapon) {
        setHud((h) => ({ ...h, msg: "Silah yok! (E ile loot al)" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
        return;
      }

      let ok = true;
      setHud((h) => {
        if (h.dead || h.victory) return h;
        if (h.ammo <= 0) {
          ok = false;
          return { ...h, msg: "Ammo bitti! (R)" };
        }
        return { ...h, ammo: h.ammo - 1, msg: "" };
      });
      if (!ok) return;

      audio.shoot();

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const targets: THREE.Object3D[] = [
        ...bots.filter((b) => b.alive).map((b) => b.mesh),
        ...buildWalls.map((w) => w.mesh),
      ];

      const hits = raycaster.intersectObjects(targets, true);

      const from = camera.position.clone();
      const to = hits.length > 0 ? hits[0].point.clone() : from.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(60));
      spawnTracer(from, to);

      if (hits.length > 0) {
        const obj = hits[0].object;
        const hitPoint = hits[0].point.clone();

        const wallRoot = buildWalls.find((w) => w.mesh === obj || w.mesh === obj.parent);
        if (wallRoot) {
          damageWall(wallRoot.mesh, 10);
          spawnImpactParticles(hitPoint, "WALL", 1);
          audio.hit();
        } else {
          const root = bots.find((b) => b.alive && (obj.parent?.parent === b.mesh || obj.parent === b.mesh || obj === b.mesh));
          if (root) {
            const dmg = WEAPONS[playerWeapon].damage; // 10
            root.hp -= dmg;
            addDamageText(root.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)), `-${dmg}`);
            spawnImpactParticles(hitPoint, "BOT", 1);
            audio.hit();

            if (root.hp <= 0) {
              root.alive = false;
              scene.remove(root.mesh);

              setHud((h) => ({ ...h, score: h.score + 25, kills: h.kills + 1 }));
              checkVictoryIfNeeded();
            }
          } else {
            spawnImpactParticles(hitPoint, "GROUND", 0.7);
          }
        }
      }

      muzzleFlash.position.copy(camera.position);
      muzzleFlash.intensity = 2.3;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
    }

    // =============================
    // CONTROLS
    // =============================
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
      if (hud.dead || hud.victory) return;

      audio.unlock(); // ✅ click ile audio unlock
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
      if (e.code === "Enter" && (hud.dead || hud.victory)) window.location.reload();
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
    // MINIMAP
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

      mctx.fillStyle = "rgba(250,204,21,0.70)";
      mctx.fillRect(
        sx(sand.position.x - (SEA_W + 60) / 2),
        sz(sand.position.z - (SEA_H + 60) / 2),
        ((SEA_W + 60) / MAP_SIZE) * W,
        ((SEA_H + 60) / MAP_SIZE) * H
      );

      mctx.fillStyle = "rgba(29,78,216,0.85)";
      mctx.fillRect(
        sx(sea.position.x - SEA_W / 2),
        sz(sea.position.z - SEA_H / 2),
        (SEA_W / MAP_SIZE) * W,
        (SEA_H / MAP_SIZE) * H
      );

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
    // LOOT PICKUP
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
          // respawn loot
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
    // BOT VISION
    // =============================
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

    // =============================
    // GAME LOOP
    // =============================
    let yaw = 0;
    let pitch = 0;

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const vel = new THREE.Vector3(0, 0, 0);
    const tmp = new THREE.Vector3();

    let parachuting = false;
    let spawnShield = 0;

    const PLAYER_HEIGHT = 1.8;
    const GROUND_Y = 0;
    let onGround = true;

    const SPEED = 6.2;
    const SPRINT = 9.0;
    const JUMP = 6.2;
    const GRAVITY = 18.0;

    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // BUS PHASE
      if (hud.phase === "BUS") {
        busT += dt * 0.05;
        if (busT > 1) busT = 0;

        bus.position.lerpVectors(BUS_START, BUS_END, busT);

        camera.position.set(bus.position.x + 20, 28, bus.position.z + 20);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        if (keys.e) {
          dropped = true;
          parachuting = true;
          spawnShield = 0;

          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));

          player.position.set(bus.position.x - 2.2, 60, bus.position.z + 2.0);
          onGround = false;
          vel.set(0, -2.2, 0);

          parachute.visible = true;
          audio.unlock();
          audio.beep(300, 0.1, "triangle", 0.05);
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // STOP updates if dead/victory (still render)
      if (hud.dead || hud.victory) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      spawnShield = Math.max(0, spawnShield - dt);

      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);

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

      // collision + clamp
      resolveObstaclesFor(player.position, 0.55);
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // pickup
      if (!parachuting && keys.e) {
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      // build
      if (!parachuting && keys.f) {
        keys.f = false;
        buildWallAtPlayer(yaw);
      }

      // parachute anim
      if (parachuting) {
        const t = performance.now() * 0.002;
        parachute.rotation.y = Math.sin(t) * 0.25;
        parachute.rotation.z = Math.sin(t * 0.8) * 0.12;
      }

      camera.position.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.92, player.position.z);

      // =============================
      // BOT AI
      // =============================
      const playerPos = player.position.clone();

      for (const b of bots) {
        if (!b.alive) continue;

        const bpos = b.mesh.position;

        // get weapon first
        if (!b.weapon) {
          const { best } = findNearestUntakenWeapon(bpos);
          if (best) {
            const dirToW = best.mesh.position.clone().sub(bpos);
            const distW = dirToW.length();

            const targetYaw = Math.atan2(dirToW.x, dirToW.z);
            b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.10);

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
          const strafe = new THREE.Vector3(-dirP.z, 0, dirP.x).multiplyScalar(Math.sin(performance.now() * 0.002 + bpos.x) > 0 ? 1 : -1);
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

          const t = clamp(dist / st.maxRange, 0, 1);
          const acc = st.accuracyNear * (1 - t) + st.accuracyFar * t;

          const botHead = bpos.clone().add(new THREE.Vector3(0, 1.55, 0));
          const playerHead = playerPos.clone().add(new THREE.Vector3(0, 1.55, 0));
          const dirShot = playerHead.clone().sub(botHead).normalize();

          spawnTracer(botHead, botHead.clone().add(dirShot.clone().multiplyScalar(Math.min(50, dist))));

          // wall blocks
          losRay.set(botHead, dirShot);
          losRay.far = Math.min(st.maxRange, dist + 0.5);
          const hit = losRay.intersectObjects([...buildWalls.map((w) => w.mesh), ...obstacles], true);

          if (hit.length > 0) {
            const h = hit[0].object;
            const wall = buildWalls.find((w) => w.mesh === h || w.mesh === h.parent);
            if (wall) {
              damageWall(wall.mesh, 10);
              spawnImpactParticles(hit[0].point, "WALL", 0.8);
              continue;
            }
          }

          if (spawnShield <= 0 && Math.random() < acc) {
            applyDamageToPlayer(10);
            spawnImpactParticles(playerHead, "GROUND", 0.6);
          }
        }
      }

      // =============================
      // tracers decay
      // =============================
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      // =============================
      // particles update
      // =============================
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

    rafRef.current = requestAnimationFrame(tick);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.phase, hud.dead, hud.victory]);

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
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">🧰 {hud.weapon ? hud.weapon : "Silahsız"}</div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🎯 Kills: <span className="font-semibold">{hud.kills}</span>/<span className="font-semibold">{hud.totalBots}</span>
        </div>

        {hud.parachute ? <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">🪂 Paraşüt</div> : null}
        {hud.msg ? <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-sm text-indigo-200">{hud.msg}</div> : null}
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
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {hud.phase === "BUS" ? (
            <>
              🚌 Otobüstesin • <span className="text-slate-100 font-semibold">E</span> ile atla (paraşüt)
            </>
          ) : (
            <>
              <span className="text-slate-100 font-semibold">WASD</span> hareket • <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
              <span className="text-slate-100 font-semibold">Mouse</span> bakış • <span className="text-slate-100 font-semibold">Sol tık</span> ateş •{" "}
              <span className="text-slate-100 font-semibold">E</span> loot • <span className="text-slate-100 font-semibold">F</span> build (duvar)
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
