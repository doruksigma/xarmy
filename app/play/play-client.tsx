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
  accuracyNear: number; // hit chance near
  accuracyFar: number; // hit chance far
};

const WEAPONS: Record<WeaponType, WeaponStats> = {
  PISTOL: { name: "Pistol", damage: 2, cooldown: 0.28, maxRange: 28, accuracyNear: 0.28, accuracyFar: 0.08 },
  RIFLE: { name: "Rifle", damage: 2, cooldown: 0.14, maxRange: 40, accuracyNear: 0.38, accuracyFar: 0.12 },
  SHOTGUN: { name: "Shotgun", damage: 4, cooldown: 0.55, maxRange: 18, accuracyNear: 0.45, accuracyFar: 0.10 },
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
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 40, 360);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      2500
    );

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(30, 60, 30);
    scene.add(dir);

    // =============================
    // TERRAIN: Grass + Sand + Sea
    // =============================
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x166534, // ✅ daha yeşil
        roughness: 0.98,
        metalness: 0.02,
      })
    );
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    const SEA_W = 210;
    const SEA_H = 160;

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_W, SEA_H, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8, // ✅ mavi deniz
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
        color: 0xfacc15, // ✅ sarı kum
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

    // Grid (çok hafif)
    const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x22c55e, 0x0b1a12);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.10;
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
    addWall(0, -HALF, MAP_SIZE + thickness, 8, thickness);
    addWall(0, HALF, MAP_SIZE + thickness, 8, thickness);
    addWall(-HALF, 0, thickness, 8, MAP_SIZE + thickness);
    addWall(HALF, 0, thickness, 8, MAP_SIZE + thickness);

    // Houses
    for (let i = 0; i < 14; i++) {
      const x = rand(-HALF + 60, HALF - 60);
      const z = rand(-HALF + 60, HALF - 60);
      const inBeach =
        Math.abs(x - sea.position.x) < (SEA_W + 70) / 2 && Math.abs(z - sea.position.z) < (SEA_H + 70) / 2;
      if (inBeach) continue;
      addBox(x, z, rand(10, 20), rand(6, 11), rand(10, 20));
    }

    // Trees (visual)
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

    // Hand anchor + weapon mesh (visible in hand)
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
        // SHOTGUN
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
      // slight rotate to look like held
      playerWeaponMesh.rotation.y = Math.PI;
      playerWeaponMesh.rotation.x = 0.05;
      hand.add(playerWeaponMesh);

      const stats = WEAPONS[type];
      setHud((h) => ({ ...h, weapon: stats.name, ammo: type === "SHOTGUN" ? 10 : 30, msg: `✅ ${stats.name} aldın` }));
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
    }

    // ---------- Bus ----------
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
    bus.position.set(-HALF + 30, 0, -HALF + 40);
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

      // ✅ C5 yok
      const name = pick(BOT_NAMES);
      const label = makeNameSprite(name);
      label.position.set(0, 2.6, 0);
      g.add(label);

      // spawn avoid sea
      let x = 0, z = 0;
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
        hp: 60,
        shootCd: rand(0.2, 1.2),
        weapon: null, // ✅ bot da silahsız başlar
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

    // ✅ kitler biraz fazla
    for (let i = 0; i < 18; i++) spawnMedkit();

    // ---------- Weapon loot ----------
    const weaponLoots: WeaponLoot[] = [];

    function spawnWeaponLoot(type?: WeaponType) {
      const t: WeaponType = type ?? pick<WeaponType>(["PISTOL", "RIFLE", "SHOTGUN"]);
      const g = new THREE.Group();

      // ground stand
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

      // label
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

    // ✅ yerde silah bolca
    for (let i = 0; i < 28; i++) spawnWeaponLoot();

    // ---------- Shooting ----------
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 8);
    scene.add(muzzleFlash);

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

    function shootPlayer() {
      if (!playerWeapon) {
        setHud((h) => ({ ...h, msg: "Silah yok! (E ile loot al)" }));
        setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 800);
        return;
      }
      setHud((h) => {
        if (h.dead) return h;
        if (h.ammo <= 0) return { ...h, msg: "Ammo bitti! (R)" };
        return { ...h, ammo: h.ammo - 1, msg: "" };
      });

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const botMeshes = bots.map((b) => b.mesh);
      const hits = raycaster.intersectObjects(botMeshes, true);

      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const root = bots.find((b) => hitObj.parent?.parent === b.mesh || hitObj.parent === b.mesh || hitObj === b.mesh);
        if (root) {
          const dmg = WEAPONS[playerWeapon].damage;
          root.hp -= dmg * 10; // player güçlü vuruyor (oyun hissi)
          if (root.hp <= 0) {
            scene.remove(root.mesh);
            const idx = bots.indexOf(root);
            if (idx >= 0) bots.splice(idx, 1);
            setHud((h) => ({ ...h, score: h.score + 25 }));
            setTimeout(() => spawnBot(), 900);
          }
        }
      }

      muzzleFlash.position.copy(camera.position);
      muzzleFlash.intensity = 2.3;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
    }

    // ---------- Controls ----------
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false };
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

    // parachute state
    let parachuting = false;

    // ---------- Collision ----------
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

    // ---------- Pointer Lock ----------
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

      // üstten kamera için pitch’i daha sınırlı tutuyoruz
      pitch -= my * SENS;
      pitch = clamp(pitch, -0.55, 0.15);
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (hud.phase !== "PLAY") return;
      if (hud.dead) return;

      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      if (parachuting) return; // paraşütte ateş yok
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
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // ---------- Minimap ----------
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
      mctx.fillStyle = "rgba(250,204,21,0.70)";
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

    // ---------- Loot pickup ----------
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

    // ---------- Loop ----------
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // BUS phase
      if (hud.phase === "BUS") {
        busT += dt * 0.08;
        const bx = THREE.MathUtils.lerp(-HALF + 30, HALF - 30, (Math.sin(busT) + 1) / 2);
        const bz = THREE.MathUtils.lerp(-HALF + 60, HALF - 60, (Math.cos(busT * 0.9) + 1) / 2);
        bus.position.set(bx, 0, bz);

        // camera bus view
        camera.position.set(bus.position.x + 20, 28, bus.position.z + 20);
        camera.lookAt(bus.position.x, 18, bus.position.z);

        // ✅ E ile atla → paraşütle süzül
        if (keys.e) {
          dropped = true;
          parachuting = true;
          setHud((h) => ({ ...h, phase: "PLAY", parachute: true, msg: "🪂 Paraşüt açık" }));

          player.position.set(bus.position.x - 2.2, 60, bus.position.z + 2.0);
          onGround = false;
          vel.set(0, -2.2, 0); // yavaş düşüş başlangıcı
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // dead: freeze
      if (hud.dead) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // -------------------------
      // Movement
      // -------------------------
      // yaw/pitch
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      forward.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      right.copy(forward).cross(up).normalize();

      tmp.set(0, 0, 0);
      if (keys.w) tmp.add(forward);
      if (keys.s) tmp.sub(forward);
      if (keys.d) tmp.add(right);
      if (keys.a) tmp.sub(right);
      if (tmp.lengthSq() > 0) tmp.normalize();

      const targetSpeed = keys.shift ? SPRINT : SPEED;

      // paraşütte yatay kontrol daha yumuşak
      const accel = parachuting ? 0.07 : 0.18;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * targetSpeed, accel);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * targetSpeed, accel);

      // jump (paraşütte yok)
      if (!parachuting && keys.space && onGround) {
        vel.y = JUMP;
        onGround = false;
      }

      // gravity (paraşütte çok az)
      const g = parachuting ? 4.0 : GRAVITY;
      if (!onGround) vel.y -= g * dt;

      // paraşütte düşüş limit
      if (parachuting) vel.y = Math.max(vel.y, -3.0);

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

      // collisions + clamp
      resolveObstaclesFor(player.position, 0.55);
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // E pickup (play only)
      if (!parachuting && keys.e) {
        const gotKit = tryPickupMedkit();
        if (!gotKit) tryPickupWeapon();
      }

      // -------------------------
      // Camera (✅ üstten biraz)
      // -------------------------
      // üstten hissi: daha yüksek + daha uzak
      const headPos = new THREE.Vector3(player.position.x, player.position.y + PLAYER_HEIGHT * 0.85, player.position.z);

      const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(6.8);
      const upLift = 8.5; // ✅ daha üstten

      camera.position.set(headPos.x + back.x, headPos.y + upLift, headPos.z + back.z);

      // kameranın hedefi: biraz aşağı baksın
      const lookAt = headPos.clone().add(new THREE.Vector3(0, -0.2, -1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(6));
      camera.lookAt(lookAt);

      // -------------------------
      // Bot AI: silah yoksa loot’a gider
      // -------------------------
      const playerPos = player.position.clone();
      for (const b of bots) {
        const bpos = b.mesh.position;

        // bot silah yok: en yakın silaha koş
        if (!b.weapon) {
          const { best, bestD } = findNearestUntakenWeapon(bpos);
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

            // pickup
            if (distW < 2.6 && !best.taken) {
              best.taken = true;
              scene.remove(best.mesh);
              b.weapon = best.type;
              // bot elinde görsel (küçük)
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

        // bot silahlı: oyuncuya döner + orta mesafe atış
        const toP = playerPos.clone().sub(bpos);
        const dist = toP.length();

        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.08);

        // yaklaş / uzaklaş
        if (dist > 18) {
          toP.normalize();
          bpos.x += toP.x * dt * 2.8;
          bpos.z += toP.z * dt * 2.8;
        } else if (dist < 9) {
          toP.normalize();
          bpos.x -= toP.x * dt * 2.2;
          bpos.z -= toP.z * dt * 2.2;
        }

        resolveObstaclesFor(bpos, 0.45);
        bpos.x = clamp(bpos.x, -HALF + 2, HALF - 2);
        bpos.z = clamp(bpos.z, -HALF + 2, HALF - 2);

        // shoot mid range (paraşütte oyuncuyu vurmasın)
        if (parachuting) continue;

        b.shootCd = Math.max(0, b.shootCd - dt);

        const st = WEAPONS[b.weapon];
        const inRange = dist >= 10 && dist <= st.maxRange;

        if (inRange && b.shootCd <= 0) {
          b.shootCd = st.cooldown + rand(0.05, 0.25);

          const t = clamp(dist / st.maxRange, 0, 1);
          const acc = st.accuracyNear * (1 - t) + st.accuracyFar * t;

          if (Math.random() < acc) applyDamageToPlayer(st.damage);
        }
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
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.phase, hud.dead]);

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
        <div className="h-3 w-3 rounded-full border border-indigo-300/80" />
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
