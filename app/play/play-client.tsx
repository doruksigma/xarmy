"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Keys = { w: boolean; a: boolean; s: boolean; d: boolean; shift: boolean; space: boolean; e: boolean };

type WeaponType = "Pistol" | "Rifle" | "Shotgun";
type WeaponDef = { type: WeaponType; name: string; ammoMax: number; fireRate: number; damage: number; spread: number };

const WEAPONS: WeaponDef[] = [
  { type: "Pistol", name: "🔫 Tabanca", ammoMax: 18, fireRate: 4.5, damage: 9, spread: 0.012 },
  { type: "Rifle", name: "🪖 Tüfek", ammoMax: 30, fireRate: 10, damage: 6, spread: 0.010 },
  { type: "Shotgun", name: "💥 Pompalı", ammoMax: 8, fireRate: 1.4, damage: 4, spread: 0.060 } // pellet ile çarpan
];

const BOT_NAMES = [
  "Polat Alemdar", "Memati", "Abdülhey", "Pala", "Candan", "Kurtlar Vadisi Botu",
  "Tombik Ayı", "Kedi Komando", "Recep İvedik", "Zeki Müren", "Süper Mario",
  "Gandalf", "Çaycı Hüseyin", "Ekmek Teknesi", "Deli Yürek", "Kara Murat",
  "Şahin K", "Darth Vader", "SpongeBob", "Yılmaz", "Ezel"
];

type LootItem = {
  id: string;
  mesh: THREE.Mesh;
  weapon: WeaponDef;
  ammo: number;
};

type Bot = {
  id: string;
  name: string;
  mesh: THREE.Group;
  hp: number;
  weapon: WeaponDef;
  ammo: number;
  cooldown: number; // seconds
  roamAngle: number;
  roamTimer: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
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

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState({
    hp: 100,
    ammo: 30,
    score: 0,
    weaponName: "🪖 Tüfek",
    phase: "BUS" as "BUS" | "PLAY",
    killFeed: "" as string
  });

  // HUD’u daha az re-render yapmak için (performans)
  const hudRef = useRef(hud);
  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  useEffect(() => {
    if (!mountRef.current) return;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 40, 220);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      800
    );

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.85);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(30, 50, 20);
    scene.add(dir);

    const accent = new THREE.PointLight(0x6d5cff, 1.2, 80);
    accent.position.set(0, 18, 0);
    scene.add(accent);

    // ---------- Map size ----------
    const MAP_SIZE = 520; // geniş harita
    const HALF = MAP_SIZE / 2;

    // ---------- Ground ----------
    const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x071022,
      roughness: 0.95,
      metalness: 0.02
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const grid = new THREE.GridHelper(MAP_SIZE, 120, 0x253155, 0x141a33);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.17;
    scene.add(grid);

    // ---------- Obstacles (evler + kayalar) ----------
    const obstacles: THREE.Mesh[] = [];

    const houseMat = new THREE.MeshStandardMaterial({
      color: 0x121a33,
      roughness: 0.65,
      metalness: 0.12,
      emissive: 0x0f1533,
      emissiveIntensity: 0.55
    });

    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x1a2450,
      roughness: 0.8,
      metalness: 0.05,
      emissive: 0x121a33,
      emissiveIntensity: 0.35
    });

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x0d162f,
      roughness: 0.95,
      metalness: 0.02
    });

    function addObstacleMesh(m: THREE.Mesh) {
      scene.add(m);
      obstacles.push(m);
      return m;
    }

    function makeHouse(x: number, z: number, w: number, h: number, d: number) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), houseMat);
      base.position.set(x, h / 2, z);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.65, Math.max(1.3, h * 0.7), 4), roofMat);
      roof.position.set(x, h + Math.max(0.7, h * 0.35), z);
      roof.rotation.y = rand(0, Math.PI);

      addObstacleMesh(base);
      scene.add(roof);
    }

    function makeRock(x: number, z: number) {
      const s = rand(1.1, 3.4);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      m.position.set(x, s * 0.45, z);
      m.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      addObstacleMesh(m);
    }

    // Köy alanları
    for (let i = 0; i < 10; i++) {
      const cx = rand(-HALF * 0.65, HALF * 0.65);
      const cz = rand(-HALF * 0.65, HALF * 0.65);
      const count = Math.floor(rand(2, 6));
      for (let k = 0; k < count; k++) {
        makeHouse(cx + rand(-18, 18), cz + rand(-18, 18), rand(6, 12), rand(3.5, 6.5), rand(6, 12));
      }
    }

    // Kayalar
    for (let i = 0; i < 55; i++) {
      makeRock(rand(-HALF * 0.9, HALF * 0.9), rand(-HALF * 0.9, HALF * 0.9));
    }

    // ---------- Trees (orman) ----------
    const trees: THREE.Group[] = [];
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1d13, roughness: 1.0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x0b3a2a, roughness: 0.9, metalness: 0.0, emissive: 0x041b12, emissiveIntensity: 0.35 });

    function makeTree(x: number, z: number) {
      const g = new THREE.Group();
      const trunkH = rand(2.2, 5.2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, trunkH, 8), trunkMat);
      trunk.position.y = trunkH / 2;

      const crownCount = Math.floor(rand(2, 4));
      for (let i = 0; i < crownCount; i++) {
        const s = rand(1.4, 2.8);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leafMat);
        crown.position.set(rand(-0.4, 0.4), trunkH * 0.65 + i * 0.85, rand(-0.4, 0.4));
        g.add(crown);
      }

      g.add(trunk);
      g.position.set(x, 0, z);
      g.rotation.y = rand(0, Math.PI * 2);
      scene.add(g);
      trees.push(g);
    }

    // Orman dağılımı
    for (let i = 0; i < 240; i++) {
      const x = rand(-HALF * 0.95, HALF * 0.95);
      const z = rand(-HALF * 0.95, HALF * 0.95);
      // köy merkezlerine çok yaklaşmasın
      if (Math.abs(x) < 18 && Math.abs(z) < 18) continue;
      makeTree(x, z);
    }

    // ---------- Player ----------
    const player = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f1733,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x111a44,
      emissiveIntensity: 0.6
    });

    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14), bodyMat);
    cyl.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), bodyMat);
    head.position.y = 1.55;
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), bodyMat);
    hip.position.y = 0.40;
    player.add(cyl, head, hip);
    player.position.set(0, 0, 0);
    scene.add(player);

    // ---------- Bus (otobüs) ----------
    const bus = new THREE.Group();
    const busBodyMat = new THREE.MeshStandardMaterial({ color: 0x101a33, roughness: 0.35, metalness: 0.2, emissive: 0x1a2450, emissiveIntensity: 0.6 });
    const busGlassMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.15, metalness: 0.6, emissive: 0x0b1020, emissiveIntensity: 0.4 });

    const busBody = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.3, 2.8), busBodyMat);
    busBody.position.y = 1.6;
    const busCab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 2.8), busBodyMat);
    busCab.position.set(3.2, 1.5, 0);

    const busGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.6), busGlassMat);
    busGlass.position.set(3.2, 1.8, 0);

    bus.add(busBody, busCab, busGlass);
    bus.position.set(-HALF + 30, 18, -HALF + 50);
    scene.add(bus);

    let phase: "BUS" | "PLAY" = "BUS";
    let busT = 0;
    let dropped = false;

    // ---------- Controls State ----------
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false };
    let yaw = 0;
    let pitch = 0;

    // Movement
    const vel = new THREE.Vector3(0, 0, 0);
    const tmp = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const PLAYER_HEIGHT = 1.8;
    const GROUND_Y = 0;
    let onGround = true;

    const SPEED = 5.4;
    const SPRINT = 8.2;
    const JUMP = 5.8;
    const GRAVITY = 16.5;

    // ---------- Weapons ----------
    let currentWeapon: WeaponDef = WEAPONS.find(w => w.type === "Rifle")!;
    let ammo = currentWeapon.ammoMax;

    function setWeapon(w: WeaponDef, a: number) {
      currentWeapon = w;
      ammo = clamp(a, 0, w.ammoMax);
      setHud((h) => ({ ...h, weaponName: w.name, ammo }));
    }

    // ---------- Raycaster / shooting ----------
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 8);
    scene.add(muzzleFlash);

    let shootCooldown = 0; // seconds

    function applyDamageToPlayer(dmg: number) {
      setHud((h) => {
        const nhp = Math.max(0, h.hp - dmg);
        return { ...h, hp: nhp };
      });
    }

    function shootFromCamera() {
      if (phase !== "PLAY") return;
      if (shootCooldown > 0) return;
      if (ammo <= 0) {
        // boş feedback (basit)
        muzzleFlash.intensity = 0.4;
        setTimeout(() => (muzzleFlash.intensity = 0), 40);
        return;
      }

      // fire rate
      shootCooldown = 1 / currentWeapon.fireRate;

      // ammo düş
      ammo -= 1;
      setHud((h) => ({ ...h, ammo }));

      // spread
      const sx = (Math.random() - 0.5) * currentWeapon.spread;
      const sy = (Math.random() - 0.5) * currentWeapon.spread;

      raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);

      // botlara vur
      const botMeshes = bots.map((b) => b.mesh);
      const hits = raycaster.intersectObjects(botMeshes, true);
      if (hits.length > 0) {
        const hit = hits[0].object;
        const bot = bots.find((b) => b.mesh === hit || b.mesh.children.includes(hit as any) || b.mesh.getObjectById(hit.id));
        if (bot) {
          bot.hp -= currentWeapon.damage;
          if (bot.hp <= 0) {
            // öldü
            bot.hp = 0;
            scene.remove(bot.mesh);
            deadBotIds.add(bot.id);

            setHud((h) => ({
              ...h,
              score: h.score + 25,
              killFeed: `🎯 ${bot.name} düştü (+25)`
            }));
            setTimeout(() => setHud((h) => ({ ...h, killFeed: "" })), 900);
          }
        }
      }

      // flash
      muzzleFlash.position.copy(camera.position);
      muzzleFlash.intensity = 2.2;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
    }

    // ---------- Loot (silahlar yerde, rastgele) ----------
    const loot: LootItem[] = [];
    const lootMat = new THREE.MeshStandardMaterial({ color: 0x1b2a66, emissive: 0x4f46e5, emissiveIntensity: 0.9, roughness: 0.35 });

    function spawnLootOne(id: string) {
      const w = pick(WEAPONS);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.35), lootMat);
      box.position.set(rand(-HALF * 0.92, HALF * 0.92), 0.22, rand(-HALF * 0.92, HALF * 0.92));
      box.rotation.y = rand(0, Math.PI * 2);
      scene.add(box);

      loot.push({
        id,
        mesh: box,
        weapon: w,
        ammo: w.ammoMax
      });
    }

    // Haritaya 45 loot at
    for (let i = 0; i < 45; i++) spawnLootOne(`loot_${i}`);

    function tryPickupLoot() {
      // E ile yakınındaki loot’u al
      const p = player.position;
      let best: LootItem | null = null;
      let bestD = 9999;

      for (const it of loot) {
        const d = it.mesh.position.distanceTo(p);
        if (d < 2.3 && d < bestD) {
          best = it;
          bestD = d;
        }
      }
      if (!best) return;

      // al
      setWeapon(best.weapon, best.ammo);
      scene.remove(best.mesh);
      const idx = loot.indexOf(best);
      if (idx >= 0) loot.splice(idx, 1);

      setHud((h) => ({ ...h, killFeed: `📦 Aldın: ${best!.weapon.name}` }));
      setTimeout(() => setHud((h) => ({ ...h, killFeed: "" })), 900);
    }

    // ---------- Bots (20 adet, isimli, ateş eden) ----------
    const bots: Bot[] = [];
    const deadBotIds = new Set<string>();

    const botMat = new THREE.MeshStandardMaterial({
      color: 0x0e1a3a,
      roughness: 0.4,
      metalness: 0.15,
      emissive: 0x1a2450,
      emissiveIntensity: 0.55
    });

    function createBot(i: number) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.05, 12), botMat);
      body.position.y = 0.9;
      const headb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14), botMat);
      headb.position.y = 1.5;
      g.add(body, headb);

      g.position.set(rand(-HALF * 0.75, HALF * 0.75), 0, rand(-HALF * 0.75, HALF * 0.75));
      scene.add(g);

      const w = pick(WEAPONS);
      const b: Bot = {
        id: `bot_${i}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        mesh: g,
        hp: 40,
        weapon: w,
        ammo: w.ammoMax,
        cooldown: rand(0.2, 1.0),
        roamAngle: rand(0, Math.PI * 2),
        roamTimer: rand(1.5, 4.0)
      };
      bots.push(b);
    }

    for (let i = 0; i < 20; i++) createBot(i);

    // Botlar ateş eder: line-of-sight + cooldown
    const botRay = new THREE.Raycaster();
    function botShoot(bot: Bot) {
      if (bot.ammo <= 0) {
        bot.ammo = bot.weapon.ammoMax; // basit reload
        return;
      }
      bot.ammo -= 1;

      // bot yönü -> oyuncu
      const from = bot.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const to = player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const dirv = to.clone().sub(from).normalize();

      // spread
      dirv.x += (Math.random() - 0.5) * bot.weapon.spread * 1.8;
      dirv.y += (Math.random() - 0.5) * bot.weapon.spread * 1.2;
      dirv.z += (Math.random() - 0.5) * bot.weapon.spread * 1.8;
      dirv.normalize();

      botRay.set(from, dirv);

      // önce engel var mı?
      const block = botRay.intersectObjects(obstacles, false);
      const hitPlayerDist = from.distanceTo(to);

      if (block.length > 0 && block[0].distance < hitPlayerDist) {
        return; // arada duvar var
      }

      // vurma olasılığı: çok yakında daha yüksek
      const dist = from.distanceTo(to);
      const baseHit = dist < 12 ? 0.65 : dist < 25 ? 0.35 : 0.18;
      if (Math.random() < baseHit) {
        applyDamageToPlayer(bot.weapon.damage);
      }
    }

    // ---------- Zone (daha büyük) ----------
    const zoneCenter = new THREE.Vector3(0, 0, 0);
    const ZONE_INITIAL = 120; // büyüttük
    const ZONE_MIN = 22;
    let zoneRadius = ZONE_INITIAL;

    // ring görselini DISPOSE yapmadan scale ile büyüt-küçült
    const ringBaseRadius = ZONE_INITIAL;
    const zoneRingMat = new THREE.MeshBasicMaterial({ color: 0x4f46e5, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    const zoneRing = new THREE.Mesh(new THREE.RingGeometry(ringBaseRadius - 0.35, ringBaseRadius + 0.35, 128), zoneRingMat);
    zoneRing.rotation.x = -Math.PI / 2;
    zoneRing.position.y = 0.03;
    scene.add(zoneRing);

    // shrink daha yavaş
    let zoneShrinkTimer = 0;

    function isOutsideZone(pos: THREE.Vector3) {
      const dx = pos.x - zoneCenter.x;
      const dz = pos.z - zoneCenter.z;
      return Math.sqrt(dx * dx + dz * dz) > zoneRadius;
    }

    // ---------- Pointer Lock ----------
    const canvas = renderer.domElement;

    function requestLock() {
      canvas.requestPointerLock?.();
    }
    function onPointerLockChange() {
      const isLocked = document.pointerLockElement === canvas;
      setLocked(isLocked);
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

      // oyuna giriş + lock
      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      shootFromCamera();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;
      if (e.code === "KeyE") keys.e = true;

      // reload
      if (e.code === "KeyR") {
        ammo = currentWeapon.ammoMax;
        setHud((h) => ({ ...h, ammo }));
      }

      if (e.code === "Escape") {
        document.exitPointerLock?.();
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

    // ---------- Collision (basit push-out) ----------
    const playerRadius = 0.45;

    // Box3 cache (GC azalt)
    const box3 = new THREE.Box3();

    function resolveObstaclesFor(posObj: THREE.Object3D, radius: number) {
      for (const box of obstacles) {
        box3.setFromObject(box);
        box3.min.x -= radius;
        box3.max.x += radius;
        box3.min.z -= radius;
        box3.max.z += radius;

        // y yüksekliği çok önemli değil (düz zemin)
        if (
          posObj.position.x > box3.min.x &&
          posObj.position.x < box3.max.x &&
          posObj.position.z > box3.min.z &&
          posObj.position.z < box3.max.z
        ) {
          const dxMin = Math.abs(posObj.position.x - box3.min.x);
          const dxMax = Math.abs(box3.max.x - posObj.position.x);
          const dzMin = Math.abs(posObj.position.z - box3.min.z);
          const dzMax = Math.abs(box3.max.z - posObj.position.z);

          const m = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (m === dxMin) posObj.position.x = box3.min.x;
          else if (m === dxMax) posObj.position.x = box3.max.x;
          else if (m === dzMin) posObj.position.z = box3.min.z;
          else posObj.position.z = box3.max.z;
        }
      }
    }

    // ---------- Init HUD weapon ----------
    setWeapon(currentWeapon, ammo);

    // ---------- Loop ----------
    const clock = new THREE.Clock();
    let uiTimer = 0;

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // cooldown
      shootCooldown = Math.max(0, shootCooldown - dt);

      // phase BUS: otobüs ilerlesin, oyuncu otobüste dursun; E ile in
      if (phase === "BUS") {
        busT += dt * 0.06; // hız
        const pathX = THREE.MathUtils.lerp(-HALF + 40, HALF - 40, busT);
        const pathZ = THREE.MathUtils.lerp(-HALF + 60, HALF - 60, busT);
        bus.position.set(pathX, 18, pathZ);
        bus.rotation.y = Math.atan2(HALF - 40 - (-HALF + 40), HALF - 60 - (-HALF + 60)) + Math.PI * 0.5;

        // oyuncu otobüste
        player.position.set(bus.position.x - 1.5, 18, bus.position.z);

        // kamera “bus cam” hissi
        yaw += dt * 0.08;

        const camPos = bus.position.clone().add(new THREE.Vector3(8, 5, 8));
        camera.position.lerp(camPos, 0.15);
        camera.lookAt(bus.position.clone().add(new THREE.Vector3(0, -2, 0)));

        // otomatik 4 saniye sonra veya E ile drop
        if (!dropped) {
          const autoDrop = busT > 0.08; // ~1.3-1.5s
          if (keys.e || autoDrop) {
            dropped = true;
            phase = "PLAY";
            setHud((h) => ({ ...h, phase: "PLAY" }));
            // oyuncuyu yere yakın bir yere indir
            player.position.set(bus.position.x - 2.2, 0, bus.position.z + 2.0);
          }
        }

        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // ---- GAME OVER ----
      if (hudRef.current.hp <= 0) {
        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // look direction
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

      const targetSpeed = keys.shift ? SPRINT : SPEED;
      vel.x = THREE.MathUtils.lerp(vel.x, tmp.x * targetSpeed, 0.18);
      vel.z = THREE.MathUtils.lerp(vel.z, tmp.z * targetSpeed, 0.18);

      // jump
      if (keys.space && onGround) {
        vel.y = JUMP;
        onGround = false;
      }

      // gravity
      if (!onGround) vel.y -= GRAVITY * dt;

      // integrate
      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      // ground collision
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;
      }

      // obstacles
      resolveObstaclesFor(player, playerRadius);

      // Loot pickup
      if (keys.e) {
        tryPickupLoot();
        keys.e = false; // tek basış gibi
      }

      // Zone shrink
      zoneShrinkTimer += dt;
      if (zoneShrinkTimer > 0.25 && zoneRadius > ZONE_MIN) {
        zoneShrinkTimer = 0;
        zoneRadius = Math.max(ZONE_MIN, zoneRadius - 0.12); // daha yavaş shrink
        zoneRing.scale.setScalar(zoneRadius / ringBaseRadius);
      }

      // Zone damage
      if (isOutsideZone(player.position)) {
        // 0.5 saniyede bir hasar (UI timer ile)
        uiTimer += dt;
        if (uiTimer > 0.5) {
          uiTimer = 0;
          applyDamageToPlayer(3);
        }
      }

      // Camera follow
      const headPos = new THREE.Vector3(player.position.x, player.position.y + PLAYER_HEIGHT * 0.78, player.position.z);
      const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(2.2);
      camera.position.set(headPos.x + back.x, headPos.y + 0.2, headPos.z + back.z);
      const lookAt = headPos.clone().add(new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0)).multiplyScalar(8));
      camera.lookAt(lookAt);

      // Loot anim (hafif dönsün)
      for (const it of loot) {
        it.mesh.rotation.y += dt * 1.2;
        it.mesh.position.y = 0.22 + Math.sin((performance.now() / 1000) * 2 + it.mesh.position.x * 0.1) * 0.03;
      }

      // Bot AI + shooting
      for (const b of bots) {
        if (deadBotIds.has(b.id)) continue;

        // botlar zone dışına çıktıysa içeri it + hasar
        const outside = isOutsideZone(b.mesh.position);
        if (outside) {
          // içeri doğru çek
          const dirIn = zoneCenter.clone().sub(b.mesh.position).setY(0).normalize();
          b.mesh.position.add(dirIn.multiplyScalar(dt * 3.0));
          b.hp -= dt * 4; // zone hasarı
          if (b.hp <= 0) {
            b.hp = 0;
            scene.remove(b.mesh);
            deadBotIds.add(b.id);
            setHud((h) => ({ ...h, score: h.score + 15, killFeed: `☠️ ${b.name} zone’da gitti (+15)` }));
            setTimeout(() => setHud((h) => ({ ...h, killFeed: "" })), 900);
            continue;
          }
        }

        // oyuncuya yönel
        const toP = player.position.clone().sub(b.mesh.position);
        const dist = toP.length();
        const dirToP = toP.normalize();

        // hareket: yakında strafing, uzakta yaklaş
        b.roamTimer -= dt;
        if (b.roamTimer <= 0) {
          b.roamTimer = rand(1.2, 3.2);
          b.roamAngle = rand(-Math.PI, Math.PI);
        }

        let moveDir = new THREE.Vector3(0, 0, 0);
        if (dist > 14) {
          moveDir = dirToP.clone();
        } else {
          // strafing + biraz geri
          const side = new THREE.Vector3(-dirToP.z, 0, dirToP.x);
          moveDir = side.multiplyScalar(Math.sin(b.roamAngle)).add(dirToP.clone().multiplyScalar(-0.25)).normalize();
        }

        const botSpeed = dist > 25 ? 4.2 : 3.2;
        b.mesh.position.add(moveDir.multiplyScalar(dt * botSpeed));

        // bot collision
        resolveObstaclesFor(b.mesh, 0.38);

        // bot yüzünü oyuncuya çevir (yumuşak)
        const targetYaw = Math.atan2(dirToP.x, dirToP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.08);

        // shoot
        b.cooldown = Math.max(0, b.cooldown - dt);
        if (dist < 45 && b.cooldown <= 0) {
          b.cooldown = 1 / b.weapon.fireRate + rand(0.02, 0.09);
          botShoot(b);
        }
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    }

    // start in BUS
    setHud((h) => ({ ...h, phase: "BUS" }));
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

      // dispose
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  const phaseLabel = hud.phase === "BUS" ? "🚌 Otobüstesin — E ile atla" : "🏁 Arena";

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Crosshair */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-7 w-7 rounded-full border border-slate-200/25 relative">
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200/50" />
        </div>
      </div>

      {/* HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          {phaseLabel}
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          ❤️ HP: <span className="font-semibold">{hud.hp}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          {hud.weaponName} • Ammo: <span className="font-semibold">{hud.ammo}</span>{" "}
          <span className="text-slate-400">(R)</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🏆 Score: <span className="font-semibold">{hud.score}</span>
        </div>
      </div>

      {/* Kill feed */}
      {hud.killFeed ? (
        <div className="absolute top-3 right-3 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          {hud.killFeed}
        </div>
      ) : null}

      {/* Help */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <span className="text-slate-100 font-semibold">WASD</span> hareket •{" "}
          <span className="text-slate-100 font-semibold">SPACE</span> zıpla •{" "}
          <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
          <span className="text-slate-100 font-semibold">Mouse</span> bakış •{" "}
          <span className="text-slate-100 font-semibold">Sol tık</span> ateş •{" "}
          <span className="text-slate-100 font-semibold">E</span> loot al •{" "}
          <span className="text-slate-100 font-semibold">R</span> doldur
        </div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {locked ? (
            <span className="text-emerald-300">🟢 Kontrol aktif</span>
          ) : (
            <span className="text-indigo-300">🟣 Tıkla → kontrolü kilitle</span>
          )}
        </div>
      </div>

      {/* Game over */}
      {hud.hp <= 0 ? (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="max-w-md w-[92%] rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-center">
            <div className="text-2xl font-extrabold text-slate-100">💀 Game Over</div>
            <div className="mt-2 text-slate-300">Skor: <span className="font-semibold">{hud.score}</span></div>
            <div className="mt-4 text-sm text-slate-400">Sayfayı yenileyip tekrar dene.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
