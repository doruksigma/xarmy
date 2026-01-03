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

type Bot = {
  mesh: THREE.Group;
  name: string;
  hp: number;
  cooldown: number;
};

type Medkit = {
  mesh: THREE.Group;
  taken: boolean;
};

function lerpAngle(a: number, b: number, t: number) {
  const TWO_PI = Math.PI * 2;
  let diff = (b - a) % TWO_PI;
  diff = ((2 * diff) % TWO_PI) - diff;
  return a + diff * t;
}

const BOT_BASE = [
  "Polat Alemdar",
  "Memati 😄",
  "Abdülhey",
  "Aslan Akbey",
  "Cevat",
  "Kılıç",
  "Pala 😂",
  "Deli Yürek",
  "Tombik",
  "Şaşkın Bot",
  "Serseri Bot",
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

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState({
    hp: 100,
    ammo: 30,
    score: 0,
    weapon: "Rifle",
    phase: "BUS" as "BUS" | "PLAY",
    dead: false,
    msg: "" as string,
  });

  useEffect(() => {
    if (!mountRef.current) return;

    // =============================
    // MAP SETTINGS
    // =============================
    const MAP_SIZE = 500;
    const HALF = MAP_SIZE / 2; // 250

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 35, 320);

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

    const accent = new THREE.PointLight(0x6d5cff, 1.3, 180);
    accent.position.set(0, 24, 0);
    scene.add(accent);

    // =============================
    // TERRAIN: Grass + Sand + Sea
    // =============================
    // Grass base
    const grassGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x14532d, // daha yeşil çimen
      roughness: 0.98,
      metalness: 0.02,
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    // Sea region (right-top quadrant)
    const SEA_W = 210;
    const SEA_H = 160;
    const seaGeo = new THREE.PlaneGeometry(SEA_W, SEA_H, 1, 1);
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // mavi deniz
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0x0b2a6a,
      emissiveIntensity: 0.35,
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(HALF - SEA_W / 2 - 10, 0.02, -HALF + SEA_H / 2 + 10);
    scene.add(sea);

    // Sand strip around sea (beach)
    const sandGeo = new THREE.PlaneGeometry(SEA_W + 60, SEA_H + 60, 1, 1);
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // sarı kum
      roughness: 0.95,
      metalness: 0.02,
      emissive: 0x4b3a00,
      emissiveIntensity: 0.15,
    });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.copy(sea.position);
    sand.position.y = 0.01;
    scene.add(sand);

    // Keep sea above sand visually
    sea.renderOrder = 2;
    sand.renderOrder = 1;

    // Grid helper
    const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x22c55e, 0x0b1a12);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.12;
    scene.add(grid);

    // ---------- Obstacles (collision list) ----------
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

    // ---------- Grass wall boundaries (no exit) ----------
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

    // ---------- Houses ----------
    for (let i = 0; i < 12; i++) {
      const x = rand(-HALF + 60, HALF - 60);
      const z = rand(-HALF + 60, HALF - 60);

      // avoid placing inside sea/sand rectangle
      const inBeach =
        Math.abs(x - sea.position.x) < (SEA_W + 70) / 2 && Math.abs(z - sea.position.z) < (SEA_H + 70) / 2;
      if (inBeach) continue;

      const w = rand(10, 20);
      const d = rand(10, 20);
      const h = rand(6, 11);
      addBox(x, z, w, h, d);
    }

    // ---------- Trees (visual only) ----------
    const trees: THREE.Group[] = [];
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.9,
      emissive: 0x052e12,
      emissiveIntensity: 0.25,
    });

    function addTree(x: number, z: number) {
      // avoid sea region
      const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
      if (inSea) return;

      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 10), trunkMat);
      trunk.position.y = 2.5;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 12), leafMat);
      leaf.position.y = 7.2;
      g.add(trunk, leaf);
      g.position.set(x, 0, z);
      scene.add(g);
      trees.push(g);
    }

    for (let i = 0; i < 140; i++) addTree(rand(-HALF + 20, HALF - 20), rand(-HALF + 20, HALF - 20));

    // ---------- Name Sprite helper ----------
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
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 6);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
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

    player.position.set(0, 0, 0);
    scene.add(player);

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
    busBody.position.y = 10;
    bus.add(busBody);
    bus.position.set(-HALF + 20, 0, -HALF + 40);
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

      // ✅ name format: "Polat Alemdar • C5"
      const name = `${pick(BOT_BASE)} • C5`;
      const label = makeNameSprite(name);
      label.position.set(0, 2.6, 0);
      g.add(label);

      // spawn (avoid sea)
      let x = 0,
        z = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = rand(-HALF + 30, HALF - 30);
        z = rand(-HALF + 30, HALF - 30);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }

      g.position.set(x, 0, z);
      scene.add(g);

      bots.push({ mesh: g, name, hp: 60, cooldown: rand(0.2, 1.2) });
    }

    for (let i = 0; i < 20; i++) spawnBot();

    // ---------- Medkits (loot) ----------
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

      // label small
      const label = makeNameSprite("MEDKIT");
      label.position.set(0, 1.55, 0);
      label.scale.set(1.8, 0.45, 1);
      g.add(label);

      // spawn (avoid sea)
      let x = 0,
        z = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = rand(-HALF + 40, HALF - 40);
        z = rand(-HALF + 40, HALF - 40);
        const inSea = Math.abs(x - sea.position.x) < SEA_W / 2 && Math.abs(z - sea.position.z) < SEA_H / 2;
        if (!inSea) break;
      }
      g.position.set(x, 0, z);
      scene.add(g);

      medkits.push({ mesh: g, taken: false });
    }

    for (let i = 0; i < 10; i++) spawnMedkit();

    // ---------- Shooting ----------
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 8);
    scene.add(muzzleFlash);

    function applyDamageToPlayer(dmg: number) {
      setHud((h) => {
        if (h.dead) return h;
        const hp = Math.max(0, h.hp - dmg);
        return {
          ...h,
          hp,
          dead: hp <= 0,
          msg: hp <= 0 ? "💀 GAME OVER" : h.msg,
        };
      });
    }

    function healPlayer(amount: number) {
      setHud((h) => {
        if (h.dead) return h;
        const hp = Math.min(100, h.hp + amount);
        return { ...h, hp, msg: `+${amount} HP` };
      });
      // message fade
      setTimeout(() => setHud((h) => ({ ...h, msg: "" })), 900);
    }

    function shoot() {
      setHud((h) => {
        if (h.dead) return h;
        if (h.ammo <= 0) return { ...h, msg: "Ammo bitti!" };
        return { ...h, ammo: h.ammo - 1, msg: "" };
      });

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const botMeshes = bots.map((b) => b.mesh);
      const hits = raycaster.intersectObjects(botMeshes, true);

      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const root = bots.find((b) => hitObj.parent?.parent === b.mesh || hitObj.parent === b.mesh || hitObj === b.mesh);
        if (root) {
          root.hp -= 20;
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
      muzzleFlash.intensity = 2.4;
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

    // ---------- Collision ----------
    const playerRadius = 0.55;

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
      pitch -= my * SENS;

      const limit = Math.PI / 2 - 0.05;
      pitch = Math.max(-limit, Math.min(limit, pitch));
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (hud.phase !== "PLAY") return;
      if (hud.dead) return;

      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      shoot();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;
      if (e.code === "KeyE") keys.e = true;

      if (e.code === "KeyR") setHud((h) => ({ ...h, ammo: 30, msg: "Reload" }));
      if (e.code === "Escape") document.exitPointerLock?.();
      if (e.code === "Enter" && hud.dead) {
        // quick restart
        window.location.reload();
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
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    canvas.addEventListener("click", () => {
      if (!dropped) requestLock();
    });

    // ---------- Resize ----------
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

      // background (grass)
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = "#0b2a14";
      mctx.fillRect(0, 0, W, H);

      // beach / sea rectangles (same placement as 3D)
      const sx = (x: number) => ((x / MAP_SIZE) + 0.5) * W;
      const sz = (z: number) => ((z / MAP_SIZE) + 0.5) * H;

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
      mctx.strokeStyle = "rgba(34,197,94,0.85)";
      mctx.lineWidth = 3;
      mctx.strokeRect(6, 6, W - 12, H - 12);

      // houses (gray)
      mctx.fillStyle = "rgba(148,163,184,0.55)";
      for (const o of obstacles) {
        if ((o.material as THREE.MeshStandardMaterial).color.getHex() === 0x1b2a2a) {
          mctx.fillRect(sx(o.position.x) - 2, sz(o.position.z) - 2, 4, 4);
        }
      }

      // medkits (green)
      mctx.fillStyle = "rgba(34,197,94,0.95)";
      for (const k of medkits) {
        if (k.taken) continue;
        mctx.beginPath();
        mctx.arc(sx(k.mesh.position.x), sz(k.mesh.position.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }

      // bots (red)
      mctx.fillStyle = "rgba(244,63,94,0.92)";
      for (const b of bots) {
        mctx.beginPath();
        mctx.arc(sx(b.mesh.position.x), sz(b.mesh.position.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }

      // player (blue)
      mctx.fillStyle = "rgba(99,102,241,0.95)";
      mctx.beginPath();
      mctx.arc(sx(player.position.x), sz(player.position.z), 4, 0, Math.PI * 2);
      mctx.fill();
    }

    // ---------- Loot pickup (E) ----------
    function tryPickupMedkit() {
      for (const k of medkits) {
        if (k.taken) continue;
        const d = k.mesh.position.clone().sub(player.position).length();
        if (d < 3.0) {
          k.taken = true;
          scene.remove(k.mesh);
          healPlayer(35);
          // respawn later
          setTimeout(() => spawnMedkit(), 2500);
          return;
        }
      }
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

        camera.position.set(bus.position.x + 16, 22, bus.position.z + 16);
        camera.lookAt(bus.position.x, 10, bus.position.z);

        if (keys.e) {
          dropped = true;
          setHud((h) => ({ ...h, phase: "PLAY", msg: "" }));
          player.position.set(bus.position.x - 2.2, 22, bus.position.z + 2.0); // ✅ jump drop
          onGround = false;
          vel.set(0, 0, 0);
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // if dead: freeze gameplay, keep render
      if (hud.dead) {
        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // PLAY camera look
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

      const targetSpeed = keys.shift ? 9.0 : 6.2;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * targetSpeed, 0.18);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * targetSpeed, 0.18);

      // jump
      if (keys.space && onGround) {
        vel.y = 6.2;
        onGround = false;
      }

      // gravity
      if (!onGround) vel.y -= 18.0 * dt;

      // integrate
      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      // ground
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;
      }

      // collision + clamp
      resolveObstaclesFor(player.position, 0.55);
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // medkit pickup
      if (keys.e) tryPickupMedkit();

      // camera follow
      const headPos = new THREE.Vector3(player.position.x, player.position.y + PLAYER_HEIGHT * 0.78, player.position.z);
      const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(2.3);
      camera.position.set(headPos.x + back.x, headPos.y + 0.25, headPos.z + back.z);
      const lookAt = headPos
        .clone()
        .add(new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0)).multiplyScalar(10));
      camera.lookAt(lookAt);

      // ==========================
      // Bot AI shooting range tuning
      // middle distance: 8..35
      // ==========================
      const playerPos = player.position.clone();
      for (const b of bots) {
        const toP = playerPos.clone().sub(b.mesh.position);
        const dist = toP.length();

        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.08);

        // move if too far, retreat if too close
        if (dist > 16) {
          toP.normalize();
          b.mesh.position.x += toP.x * dt * 2.7;
          b.mesh.position.z += toP.z * dt * 2.7;
          resolveObstaclesFor(b.mesh.position, 0.45);
        } else if (dist < 7) {
          toP.normalize();
          b.mesh.position.x -= toP.x * dt * 2.2;
          b.mesh.position.z -= toP.z * dt * 2.2;
          resolveObstaclesFor(b.mesh.position, 0.45);
        }

        b.mesh.position.x = clamp(b.mesh.position.x, -HALF + 2, HALF - 2);
        b.mesh.position.z = clamp(b.mesh.position.z, -HALF + 2, HALF - 2);

        // shoot mid-range
        b.cooldown = Math.max(0, b.cooldown - dt);
        const inRange = dist >= 8 && dist <= 35;
        if (inRange && b.cooldown <= 0) {
          b.cooldown = rand(0.35, 0.9);

          // accuracy drops with distance
          // dist 8 -> 0.35 ; dist 35 -> 0.08
          const acc = clamp(0.42 - (dist - 8) * 0.012, 0.08, 0.35);

          if (Math.random() < acc) applyDamageToPlayer(2);
        }
      }

      renderer.render(scene, camera);
      drawMinimap();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    // ---------- Cleanup ----------
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
          🧰 {hud.weapon}
        </div>

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
              🚌 Otobüstesin • <span className="text-slate-100 font-semibold">E</span> ile atla • tıkla kilitle
            </>
          ) : (
            <>
              <span className="text-slate-100 font-semibold">WASD</span> hareket •{" "}
              <span className="text-slate-100 font-semibold">SPACE</span> zıpla •{" "}
              <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
              <span className="text-slate-100 font-semibold">Mouse</span> bakış •{" "}
              <span className="text-slate-100 font-semibold">Sol tık</span> ateş •{" "}
              <span className="text-slate-100 font-semibold">R</span> doldur •{" "}
              <span className="text-slate-100 font-semibold">E</span> medkit al
            </>
          )}
        </div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {locked ? <span className="text-emerald-300">🟢 Kontrol aktif</span> : <span className="text-indigo-300">🟣 Tıkla → kontrolü kilitle</span>}
        </div>
      </div>

      {/* GAME OVER overlay */}
      {hud.dead ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[min(520px,92vw)] rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-center">
            <div className="text-3xl font-extrabold text-slate-100">💀 GAME OVER</div>
            <div className="mt-2 text-slate-300">Skor: <span className="font-semibold text-indigo-300">{hud.score}</span></div>
            <div className="mt-4 text-sm text-slate-400">Yeniden başlatmak için <span className="text-slate-100 font-semibold">ENTER</span></div>
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
