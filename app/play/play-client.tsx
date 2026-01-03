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
};

type WeaponType = "PISTOL" | "RIFLE" | "SHOTGUN";

type WeaponStats = {
  name: string;
  damage: number;
  cooldown: number; // seconds
  maxRange: number;
  accuracyNear: number;
  accuracyFar: number;
  ammoMax: number;
};

const WEAPONS: Record<WeaponType, WeaponStats> = {
  PISTOL: { name: "Pistol", damage: 8, cooldown: 0.26, maxRange: 28, accuracyNear: 0.55, accuracyFar: 0.18, ammoMax: 18 },
  RIFLE: { name: "Rifle", damage: 6, cooldown: 0.12, maxRange: 42, accuracyNear: 0.62, accuracyFar: 0.22, ammoMax: 30 },
  SHOTGUN: { name: "Shotgun", damage: 14, cooldown: 0.65, maxRange: 18, accuracyNear: 0.65, accuracyFar: 0.12, ammoMax: 8 },
};

type Bot = {
  mesh: THREE.Group;
  name: string;
  hp: number;
  shootCd: number;
  weapon: WeaponType | null;
  weaponMesh?: THREE.Group | null;
};

type Medkit = { mesh: THREE.Group; taken: boolean };
type WeaponLoot = { mesh: THREE.Group; taken: boolean; type: WeaponType };

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
  "Kurtlar Vadisi NPC",
  "Kılıç Usta",
  "Bıyıklı Bot",
];

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

  ctx.strokeStyle = "rgba(99,102,241,0.35)";
  ctx.lineWidth = 4;
  roundRect(ctx, 16, 18, 480, 92, 28);
  ctx.stroke();

  ctx.font = "bold 44px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(224,231,255,0.97)";
  ctx.fillText(name, c.width / 2, c.height / 2 + 6);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.7, 0.65, 1);
  return spr;
}

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

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

  const hudRef = useRef(hud);
  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  useEffect(() => {
    if (!mountRef.current) return;

    // =============================
    // MAP SETTINGS
    // =============================
    const MAP_SIZE = 500;
    const HALF = MAP_SIZE / 2;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x061018, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x061018, 60, 600);

    // ---------- Camera (FPS) ----------
    const camera = new THREE.PerspectiveCamera(
      80,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.08,
      2500
    );

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x102035, 0.85);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(60, 120, 60);
    scene.add(dir);

    // =============================
    // TERRAIN: Grass + Sand + Sea
    // =============================
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x36c96a, // daha açık yeşil
        roughness: 0.98,
        metalness: 0.02,
      })
    );
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    const SEA_W = 220;
    const SEA_H = 170;

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W + 70, SEA_H + 70, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15, // kum sarı
        roughness: 0.95,
        metalness: 0.02,
        emissive: 0x4b3a00,
        emissiveIntensity: 0.12,
      })
    );
    sand.rotation.x = -Math.PI / 2;

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W, SEA_H, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8, // deniz mavi
        roughness: 0.28,
        metalness: 0.06,
        emissive: 0x0b2a6a,
        emissiveIntensity: 0.30,
      })
    );
    sea.rotation.x = -Math.PI / 2;

    // deniz bölgesi: sağ-üst köşe
    const seaCenterX = HALF - SEA_W / 2 - 12;
    const seaCenterZ = -HALF + SEA_H / 2 + 12;

    sand.position.set(seaCenterX, 0.01, seaCenterZ);
    sea.position.set(seaCenterX, 0.02, seaCenterZ);
    scene.add(sand);
    scene.add(sea);

    // Grid (çok hafif)
    const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x7cf0a6, 0x0a2020);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.08;
    scene.add(grid);

    // =============================
    // OBSTACLES + WALLS
    // =============================
    const obstacles: THREE.Mesh[] = [];
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a2a,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x081818,
      emissiveIntensity: 0.30,
    });

    function addBox(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), obstacleMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
      return m;
    }

    // Grass wall boundaries (map dışına çıkma yok)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1fb65a,
      roughness: 0.95,
      metalness: 0,
      emissive: 0x06401b,
      emissiveIntensity: 0.35,
    });

    function addWall(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
    }

    const thickness = 8;
    const wallH = 10;
    addWall(0, -HALF, MAP_SIZE + thickness, wallH, thickness);
    addWall(0, HALF, MAP_SIZE + thickness, wallH, thickness);
    addWall(-HALF, 0, thickness, wallH, MAP_SIZE + thickness);
    addWall(HALF, 0, thickness, wallH, MAP_SIZE + thickness);

    // Houses
    for (let i = 0; i < 16; i++) {
      const x = rand(-HALF + 70, HALF - 70);
      const z = rand(-HALF + 70, HALF - 70);

      const inBeach =
        Math.abs(x - seaCenterX) < (SEA_W + 80) / 2 && Math.abs(z - seaCenterZ) < (SEA_H + 80) / 2;
      if (inBeach) continue;

      addBox(x, z, rand(10, 22), rand(6, 12), rand(10, 22));
    }

    // Trees (visual)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.9,
      emissive: 0x052e12,
      emissiveIntensity: 0.20,
    });

    for (let i = 0; i < 220; i++) {
      const x = rand(-HALF + 25, HALF - 25);
      const z = rand(-HALF + 25, HALF - 25);

      const inSea = Math.abs(x - seaCenterX) < SEA_W / 2 && Math.abs(z - seaCenterZ) < SEA_H / 2;
      if (inSea) continue;

      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 5, 10), trunkMat);
      trunk.position.y = 2.5;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7.2, 12), leafMat);
      leaf.position.y = 7.3;
      g.add(trunk, leaf);
      g.position.set(x, 0, z);
      scene.add(g);
    }

    // =============================
    // PLAYER (logic only) + FPS viewmodel weapon
    // =============================
    const player = new THREE.Object3D();
    player.position.set(0, 0, 0);
    scene.add(player);

    const PLAYER_HEIGHT = 1.8;
    const GROUND_Y = 0;

    let playerWeapon: WeaponType | null = null;
    let playerWeaponMesh: THREE.Group | null = null;
    let playerCanShootAt = 0; // time cooldown
    let parachuting = false;

    function makeWeaponMesh(type: WeaponType) {
      const g = new THREE.Group();

      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.35,
        metalness: 0.25,
        emissive: 0x050a14,
        emissiveIntensity: 0.15,
      });

      const accentMat = new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        roughness: 0.35,
        metalness: 0.3,
        emissive: 0x1d1b6a,
        emissiveIntensity: 0.55,
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
      // camera viewmodel: silah kameraya takılı (FPS)
      if (playerWeaponMesh) camera.remove(playerWeaponMesh);
      playerWeapon = type;
      const w = makeWeaponMesh(type);
      w.rotation.y = Math.PI;
      w.rotation.x = 0.05;
      w.position.set(0.38, -0.32, -0.85); // sağ-alt, FPS hissi
      w.scale.setScalar(1.05);
      camera.add(w);
      playerWeaponMesh = w;

      const st = WEAPONS[type];
      setHud((h) => ({
        ...h,
        weapon: st.name,
        ammo: st.ammoMax,
        msg: `✅ ${st.name} aldın`,
      }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    // =============================
    // BUS (drop) — ışınlanma yok, paraşütle süzülme
    // =============================
    const bus = new THREE.Group();
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.6,
      metalness: 0.2,
      emissive: 0x4b3a00,
      emissiveIntensity: 0.22,
    });
    const busBody = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), busMat);
    busBody.position.y = 18;
    bus.add(busBody);
    bus.position.set(-HALF + 40, 0, -HALF + 40);
    scene.add(bus);

    let busT = 0;
    let dropped = false;

    // =============================
    // BOTS (20) + names
    // =============================
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({
      color: 0x3b0a0a,
      roughness: 0.65,
      metalness: 0.08,
      emissive: 0x220606,
      emissiveIntensity: 0.45,
    });

    function spawnBot() {
      const g = new THREE.Group();

      const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.08, 14), botMat);
      bc.position.y = 0.95;
      const bh = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 16), botMat);
      bh.position.y = 1.55;
      const bp = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), botMat);
      bp.position.y = 0.42;
      g.add(bc, bh, bp);

      const name = pick(BOT_NAMES);
      const label = makeNameSprite(name);
      label.position.set(0, 2.6, 0);
      g.add(label);

      let x = 0,
        z = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = rand(-HALF + 55, HALF - 55);
        z = rand(-HALF + 55, HALF - 55);
        const inSea = Math.abs(x - seaCenterX) < SEA_W / 2 && Math.abs(z - seaCenterZ) < SEA_H / 2;
        if (!inSea) break;
      }

      g.position.set(x, 0, z);
      scene.add(g);

      bots.push({
        mesh: g,
        name,
        hp: 70,
        shootCd: rand(0.2, 1.2),
        weapon: null,
        weaponMesh: null,
      });
    }

    for (let i = 0; i < 20; i++) spawnBot();

    // =============================
    // MEDKITS (bol) + WEAPON LOOT (bol)
    // =============================
    const medkits: Medkit[] = [];
    const kitBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.15,
      emissive: 0x0b1020,
      emissiveIntensity: 0.30,
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

      let x = 0,
        z = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = rand(-HALF + 55, HALF - 55);
        z = rand(-HALF + 55, HALF - 55);
        const inSea = Math.abs(x - seaCenterX) < SEA_W / 2 && Math.abs(z - seaCenterZ) < SEA_H / 2;
        if (!inSea) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);

      medkits.push({ mesh: g, taken: false });
    }

    for (let i = 0; i < 22; i++) spawnMedkit();

    const weaponLoots: WeaponLoot[] = [];

    function spawnWeaponLoot(type?: WeaponType) {
      const t: WeaponType = type ?? pick<WeaponType>(["PISTOL", "RIFLE", "SHOTGUN"]);
      const g = new THREE.Group();

      const standMat = new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.5,
        metalness: 0.12,
        emissive: 0x050a14,
        emissiveIntensity: 0.18,
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.12, 16), standMat);
      base.position.y = 0.06;

      const w = makeWeaponMesh(t);
      w.position.y = 0.35;
      w.rotation.y = rand(0, Math.PI * 2);
      w.scale.setScalar(0.9);

      const label = makeNameSprite(WEAPONS[t].name.toUpperCase());
      label.position.set(0, 1.75, 0);
      label.scale.set(2.2, 0.55, 1);

      g.add(base, w, label);

      let x = 0,
        z = 0;
      for (let tries = 0; tries < 50; tries++) {
        x = rand(-HALF + 55, HALF - 55);
        z = rand(-HALF + 55, HALF - 55);
        const inSea = Math.abs(x - seaCenterX) < SEA_W / 2 && Math.abs(z - seaCenterZ) < SEA_H / 2;
        if (!inSea) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);

      weaponLoots.push({ mesh: g, taken: false, type: t });
    }

    for (let i = 0; i < 34; i++) spawnWeaponLoot();

    // =============================
    // COLLISION (push-out)
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
    // SHOOTING + HIT POPUPS + TRACERS
    // =============================
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0xfff2a6, 0, 10);
    scene.add(muzzleFlash);

    // tracer pool (yellow lines)
    type Tracer = { line: THREE.Line; ttl: number };
    const tracers: Tracer[] = [];
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9 });

    function addTracer(from: THREE.Vector3, to: THREE.Vector3) {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, tracerMat);
      scene.add(line);
      tracers.push({ line, ttl: 0.08 });
    }

    // damage popups (2D overlay)
    type Popup = { id: number; text: string; pos: THREE.Vector3; ttl: number };
    const popups: Popup[] = [];
    let popupId = 1;

    function addPopup(text: string, worldPos: THREE.Vector3) {
      popups.push({ id: popupId++, text, pos: worldPos.clone(), ttl: 0.9 });
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

    function shootPlayer(now: number) {
      const h = hudRef.current;
      if (h.dead) return;
      if (h.phase !== "PLAY") return;
      if (parachuting) return;

      if (!playerWeapon) {
        setHud((s) => ({ ...s, msg: "Silah yok! (E ile loot al)" }));
        setTimeout(() => setHud((s) => ({ ...s, msg: "" })), 900);
        return;
      }

      const st = WEAPONS[playerWeapon];
      if (now < playerCanShootAt) return;
      playerCanShootAt = now + st.cooldown;

      // ammo
      if (hudRef.current.ammo <= 0) {
        setHud((s) => ({ ...s, msg: "Ammo bitti! (R)" }));
        setTimeout(() => setHud((s) => ({ ...s, msg: "" })), 800);
        return;
      }
      setHud((s) => ({ ...s, ammo: Math.max(0, s.ammo - 1), msg: "" }));

      // ray from camera center
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const botMeshes = bots.map((b) => b.mesh);
      const hits = raycaster.intersectObjects(botMeshes, true);

      // tracer
      const from = camera.getWorldPosition(new THREE.Vector3());
      const to = hits.length ? hits[0].point.clone() : from.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(80));
      addTracer(from, to);

      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const bot = bots.find((b) => hitObj.parent?.parent === b.mesh || hitObj.parent === b.mesh || hitObj === b.mesh);
        if (bot) {
          const dmg = st.damage;
          bot.hp -= dmg;
          addPopup(`-${dmg}`, hits[0].point);

          if (bot.hp <= 0) {
            scene.remove(bot.mesh);
            const idx = bots.indexOf(bot);
            if (idx >= 0) bots.splice(idx, 1);
            setHud((s) => ({ ...s, score: s.score + 25 }));
            // respawn
            setTimeout(() => {
              if (!hudRef.current.dead) spawnBot();
            }, 900);
          }
        }
      }

      // flash
      muzzleFlash.position.copy(from);
      muzzleFlash.intensity = 2.1;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
    }

    // =============================
    // CONTROLS (FPS)
    // =============================
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false };
    let yaw = 0; // left-right
    let pitch = 0; // up-down

    const vel = new THREE.Vector3(0, 0, 0);
    const tmp = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    let onGround = true;

    const SPEED = 6.0;
    const SPRINT = 9.0;
    const JUMP = 6.0;
    const GRAVITY = 18.0;

    // pointer lock
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

      // FPS: yukarı-aşağı serbest ama limitli
      pitch = clamp(pitch, -1.15, 0.95);
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (hudRef.current.phase !== "PLAY") return;
      if (hudRef.current.dead) return;

      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      shootPlayer(performance.now() / 1000);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;
      if (e.code === "KeyE") keys.e = true;

      if (e.code === "KeyR") {
        // reload only if weapon
        if (!playerWeapon) {
          setHud((s) => ({ ...s, msg: "Silah yok" }));
          setTimeout(() => setHud((s) => ({ ...s, msg: "" })), 700);
          return;
        }
        const st = WEAPONS[playerWeapon];
        setHud((s) => ({ ...s, ammo: st.ammoMax, msg: "Reload" }));
        setTimeout(() => setHud((s) => ({ ...s, msg: "" })), 600);
      }

      if (e.code === "Escape") document.exitPointerLock?.();
      if (e.code === "Enter" && hudRef.current.dead) window.location.reload();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = false;
      if (e.code === "KeyA") keys.a = false;
      if (e.code === "KeyS") keys.s = false;
      if (e.code === "KeyD") keys.d = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
      if (e.code === "Space") keys.space = false;
      if (e.code === "KeyE") keys.e = false;
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    canvas.addEventListener("click", () => {
      requestLock();
    });

    // resize
    function onResize() {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // overlay
      if (overlayRef.current) {
        overlayRef.current.width = w;
        overlayRef.current.height = h;
      }
    }
    window.addEventListener("resize", onResize);

    // init overlay size
    requestAnimationFrame(() => onResize());

    // =============================
    // MINIMAP
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
      mctx.fillStyle = "#0e6a2e";
      mctx.fillRect(0, 0, W, H);

      // sand
      mctx.fillStyle = "rgba(250,204,21,0.70)";
      mctx.fillRect(
        sx(sand.position.x - (SEA_W + 70) / 2),
        sz(sand.position.z - (SEA_H + 70) / 2),
        ((SEA_W + 70) / MAP_SIZE) * W,
        ((SEA_H + 70) / MAP_SIZE) * H
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
      mctx.strokeStyle = "rgba(34,197,94,0.95)";
      mctx.lineWidth = 3;
      mctx.strokeRect(6, 6, W - 12, H - 12);

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
          setTimeout(() => {
            if (!hudRef.current.dead) spawnMedkit();
          }, 2200);
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
          setTimeout(() => {
            if (!hudRef.current.dead) spawnWeaponLoot();
          }, 2500);
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
    // BOT WEAPON VISUAL
    // =============================
    function attachBotWeapon(bot: Bot, type: WeaponType) {
      if (bot.weaponMesh) {
        bot.mesh.remove(bot.weaponMesh);
        bot.weaponMesh = null;
      }
      const wm = makeWeaponMesh(type);
      wm.scale.setScalar(0.78);
      wm.rotation.y = Math.PI;
      wm.rotation.x = 0.05;
      wm.position.set(0.40, 1.05, -0.35);
      bot.mesh.add(wm);
      bot.weaponMesh = wm;
    }

    // =============================
    // OVERLAY DRAW (damage popups)
    // =============================
    function drawOverlay(dt: number) {
      const c = overlayRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, c.width, c.height);

      // damage popups
      ctx.save();
      ctx.font = "bold 22px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.ttl -= dt;
        p.pos.y += dt * 0.6; // yukarı süzülsün

        if (p.ttl <= 0) {
          popups.splice(i, 1);
          continue;
        }

        const v = p.pos.clone().project(camera);
        const x = (v.x * 0.5 + 0.5) * c.width;
        const y = (-v.y * 0.5 + 0.5) * c.height;

        const alpha = clamp(p.ttl / 0.9, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,215,0,0.95)";
        ctx.strokeStyle = "rgba(2,6,23,0.85)";
        ctx.lineWidth = 4;
        ctx.strokeText(p.text, x, y);
        ctx.fillText(p.text, x, y);
      }

      ctx.restore();
    }

    // =============================
    // LOOP
    // =============================
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);
      const now = performance.now() / 1000;

      // tracer update
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].ttl -= dt;
        if (tracers[i].ttl <= 0) {
          scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      // BUS phase: otobüs hareket + E ile atla (paraşüt)
      if (hudRef.current.phase === "BUS") {
        busT += dt * 0.08;
        const bx = THREE.MathUtils.lerp(-HALF + 40, HALF - 40, (Math.sin(busT) + 1) / 2);
        const bz = THREE.MathUtils.lerp(-HALF + 60, HALF - 60, (Math.cos(busT * 0.9) + 1) / 2);
        bus.position.set(bx, 0, bz);

        // kamera bus izlesin (sinema)
        camera.position.set(bus.position.x + 24, 34, bus.position.z + 24);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        if (keys.e && !dropped) {
          dropped = true;
          parachuting = true;
          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));
          player.position.set(bus.position.x - 2.2, 70, bus.position.z + 2.0);
          onGround = false;
          vel.set(0, -2.0, 0);
        }

        renderer.render(scene, camera);
        drawMinimap();
        drawOverlay(dt);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // DEAD: freeze
      if (hudRef.current.dead) {
        renderer.render(scene, camera);
        drawMinimap();
        drawOverlay(dt);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // FPS camera rotation from yaw/pitch
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // movement direction (yaw plane)
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

      // jump (paraşütte yok)
      if (!parachuting && keys.space && onGround) {
        vel.y = JUMP;
        onGround = false;
      }

      // gravity (paraşütte çok az)
      const g = parachuting ? 4.2 : GRAVITY;
      if (!onGround) vel.y -= g * dt;
      if (parachuting) vel.y = Math.max(vel.y, -3.2);

      // integrate
      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      // ground
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;

        if (parachuting) {
          parachuting = false;
          setHud((h) => ({ ...h, parachute: false, msg: "" }));
        }
      }

      // collision + clamp
      resolveObstaclesFor(player.position, 0.55);
      player.position.x = clamp(player.position.x, -HALF + 4, HALF - 4);
      player.position.z = clamp(player.position.z, -HALF + 4, HALF - 4);

      // pickup (E)
      if (!parachuting && keys.e) {
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      // set FPS camera position = head
      camera.position.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.92, player.position.z);

      // =============================
      // BOT AI
      // =============================
      const playerPos = player.position.clone();
      for (const b of bots) {
        const bpos = b.mesh.position;

        // bot silahsız: en yakın silaha koş
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
            bpos.x = clamp(bpos.x, -HALF + 4, HALF - 4);
            bpos.z = clamp(bpos.z, -HALF + 4, HALF - 4);

            if (distW < 2.6 && !best.taken) {
              best.taken = true;
              scene.remove(best.mesh);
              b.weapon = best.type;
              attachBotWeapon(b, best.type);
              b.shootCd = rand(0.2, 1.0);
              setTimeout(() => {
                if (!hudRef.current.dead) spawnWeaponLoot();
              }, 2500);
            }
          }
          continue;
        }

        // bot silahlı: oyuncuya döner + orta mesafe fight
        const toP = playerPos.clone().sub(bpos);
        const dist = toP.length();

        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.08);

        // yaklaş / uzaklaş (orta mesafe)
        if (dist > 22) {
          toP.normalize();
          bpos.x += toP.x * dt * 2.9;
          bpos.z += toP.z * dt * 2.9;
        } else if (dist < 10) {
          toP.normalize();
          bpos.x -= toP.x * dt * 2.4;
          bpos.z -= toP.z * dt * 2.4;
        } else {
          // hafif strafe
          const strafeDir = new THREE.Vector3(toP.z, 0, -toP.x).normalize();
          const side = Math.sin(now * 1.7 + bpos.x * 0.02) > 0 ? 1 : -1;
          bpos.x += strafeDir.x * dt * 1.4 * side;
          bpos.z += strafeDir.z * dt * 1.4 * side;
        }

        resolveObstaclesFor(bpos, 0.45);
        bpos.x = clamp(bpos.x, -HALF + 4, HALF - 4);
        bpos.z = clamp(bpos.z, -HALF + 4, HALF - 4);

        if (parachuting) continue;

        // shoot mid range
        b.shootCd = Math.max(0, b.shootCd - dt);
        const st = WEAPONS[b.weapon];

        const inRange = dist >= 10 && dist <= st.maxRange;
        if (inRange && b.shootCd <= 0) {
          b.shootCd = st.cooldown + rand(0.05, 0.25);

          const t = clamp(dist / st.maxRange, 0, 1);
          const acc = st.accuracyNear * (1 - t) + st.accuracyFar * t;

          // bot "ateş" tracer (isteğe bağlı küçük)
          const fromB = b.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          const toCam = camera.getWorldPosition(new THREE.Vector3()).clone();
          addTracer(fromB, toCam);

          if (Math.random() < acc) {
            applyDamageToPlayer(st.damage);
          }
        }
      }

      renderer.render(scene, camera);
      drawMinimap();
      drawOverlay(dt);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    // =============================
    // Cleanup
    // =============================
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Overlay canvas (damage popups) */}
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />

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
        <div className="h-3 w-3 rounded-full border border-amber-200/90" />
      </div>

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
              <span className="text-slate-100 font-semibold">E</span> loot al
            </>
          )}
        </div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {locked ? (
            <span className="text-emerald-300">🟢 Kontrol aktif</span>
          ) : (
            <span className="text-indigo-300">🟣 Tıkla → kontrolü kilitle</span>
          )}
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
