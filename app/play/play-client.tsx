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
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// shortest-angle lerp (THREE.MathUtils.lerpAngle yok)
function lerpAngle(a: number, b: number, t: number) {
  const TWO_PI = Math.PI * 2;
  let diff = (b - a) % TWO_PI;
  diff = ((2 * diff) % TWO_PI) - diff; // shortest direction
  return a + diff * t;
}

// Damage text sprite (canvas -> texture)
function makeDamageSprite(text: string, color = "#fbbf24") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // glow
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.6, 0.8, 1);

  return { sprite: spr, texture: tex, material: mat };
}

type DamageFx = {
  obj: THREE.Object3D;
  life: number;
  vy: number;
};

type Bot = {
  mesh: THREE.Group;
  hp: number;
  name: string;
  nameSprite: THREE.Sprite;
  cooldown: number;
};

const BOT_NAMES = [
  "Polat Alemdar",
  "Memati",
  "Abdülhey",
  "Ceku",
  "Çakır",
  "Süleyman Çakır",
  "Ercüment",
  "Tuncay Kantarcı",
  "Kurtlar Vadisi NPC",
  "Dayı",
  "Karahanlı",
  "TestDunya Pro",
  "Kavala Kaçkını",
  "Edirne Aslanı",
  "Kırkpınar Şampiyonu",
  "Kahveci Boss",
  "Sıcak Kahve Yol Bende",
  "Yapay Zeka Botu",
  "Sigma Doruk",
  "Mini Boss"
];

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState({ hp: 100, ammo: 30, score: 0 });

  useEffect(() => {
    if (!mountRef.current) return;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x071019, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071019, 40, 360);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(
      70,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1200
    );

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1a2a22, 1.0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(18, 28, 16);
    scene.add(dir);

    const accent = new THREE.PointLight(0x6d5cff, 0.9, 90);
    accent.position.set(0, 16, 0);
    scene.add(accent);

    // ---------- MAP ----------
    // Ölçek 500 (HALF = 250)
    const MAP = 500;
    const HALF = MAP / 2;

    // --- Ground (açık yeşil) ---
    const groundGeo = new THREE.PlaneGeometry(MAP, MAP, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x6ee7b7, // açık yeşile yakın, daha aydınlık
      roughness: 0.95,
      metalness: 0.03
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- Sand zone (sarı) ---
    const sandGeo = new THREE.PlaneGeometry(180, 140, 1, 1);
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // sarı kum
      roughness: 1.0,
      metalness: 0.02
    });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(HALF - 140, 0.01, HALF - 110);
    scene.add(sand);

    // --- Water zone (mavi) ---
    const waterGeo = new THREE.PlaneGeometry(220, 160, 1, 1);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb, // mavi deniz
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.75
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(HALF - 170, 0.02, HALF - 260);
    scene.add(water);

    // subtle grid
    const grid = new THREE.GridHelper(MAP, 80, 0x2b6b55, 0x1b3a2c);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.20;
    scene.add(grid);

    // ---------- Boundary "grass wall" ----------
    const wallH = 6;
    const wallT = 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a, // çimen duvar yeşili
      roughness: 0.95
    });
    function addWall(x: number, z: number, sx: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, wallH, sz), wallMat);
      m.position.set(x, wallH / 2, z);
      scene.add(m);
      return m;
    }
    // 4 duvar
    addWall(0, -HALF + wallT / 2, MAP, wallT);
    addWall(0, HALF - wallT / 2, MAP, wallT);
    addWall(-HALF + wallT / 2, 0, wallT, MAP);
    addWall(HALF - wallT / 2, 0, wallT, MAP);

    // ---------- Obstacles (evler/ağaçlar gibi bloklar) ----------
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x164e63,
      roughness: 0.7,
      metalness: 0.05,
      emissive: 0x0b2a33,
      emissiveIntensity: 0.4
    });

    const obstacles: THREE.Mesh[] = [];
    function addBox(x: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), obstacleMat);
      m.position.set(x, sy / 2, z);
      scene.add(m);
      obstacles.push(m);
    }

    // Rastgele “ev” blokları
    for (let i = 0; i < 18; i++) {
      const x = THREE.MathUtils.randFloat(-HALF + 30, HALF - 30);
      const z = THREE.MathUtils.randFloat(-HALF + 30, HALF - 30);
      const sx = THREE.MathUtils.randFloat(6, 16);
      const sz = THREE.MathUtils.randFloat(6, 16);
      const sy = THREE.MathUtils.randFloat(3, 7);
      addBox(x, z, sx, sy, sz);
    }

    // Ağaçlar (silindir + küre)
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 1 });
    const treeLeafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 1 });

    function addTree(x: number, z: number) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 10), treeTrunkMat);
      trunk.position.set(x, 2, z);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 14), treeLeafMat);
      leaf.position.set(x, 5.0, z);
      scene.add(trunk, leaf);
      // trunk’u obstacle gibi sayalım ki içine girilmesin (basit)
      obstacles.push(trunk as any);
    }

    for (let i = 0; i < 45; i++) {
      const x = THREE.MathUtils.randFloat(-HALF + 20, HALF - 20);
      const z = THREE.MathUtils.randFloat(-HALF + 20, HALF - 20);
      addTree(x, z);
    }

    // ---------- Player (capsule-ish) ----------
    const player = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x111a44,
      emissiveIntensity: 0.55
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

    // ---------- Weapon (elde görünen basit model) ----------
    const gun = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      roughness: 0.35,
      metalness: 0.25,
      emissive: 0x0b1220,
      emissiveIntensity: 0.25
    });
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.16), gunMat);
    gunBody.position.set(0.0, 0.0, 0.0);
    const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.06), gunMat);
    gunBarrel.position.set(-0.42, 0.0, 0.0);
    gun.add(gunBody, gunBarrel);
    // silahı kameraya yakın “elde” göstermek için ayrı bir parent kullanacağız
    scene.add(gun);

    // ---------- Controls State ----------
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
    let yaw = 0;
    let pitch = 0;

    // Movement physics (simple)
    const vel = new THREE.Vector3(0, 0, 0);
    const tmp = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const PLAYER_HEIGHT = 1.8;
    const GROUND_Y = 0;
    let onGround = true;

    const SPEED = 6.0;
    const SPRINT = 9.0;
    const JUMP = 6.0;
    const GRAVITY = 18.0;

    // ---------- Raycaster (shooting) ----------
    const raycaster = new THREE.Raycaster();

    // tracer + damage fx
    const fx: DamageFx[] = [];

    function spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
      const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
      const mat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 }); // SARİ
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      fx.push({ obj: line, life: 0.06, vy: 0 });
    }

    function spawnDamageText(pos: THREE.Vector3, dmg: number) {
      const { sprite, texture, material } = makeDamageSprite(`-${dmg}`, "#fbbf24");
      sprite.position.copy(pos);
      sprite.position.y += 1.1;
      scene.add(sprite);

      // küçük cleanup hook
      (sprite as any).__tex = texture;
      (sprite as any).__mat = material;

      fx.push({ obj: sprite, life: 0.75, vy: 1.6 });
    }

    // ---------- Bots ----------
    const bots: Bot[] = [];

    function makeNameSprite(name: string) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.font = "700 44px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#e2e8f0";
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = 10;
      ctx.fillText(name, 256, 64);

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(3.2, 0.8, 1);
      return spr;
    }

    function spawnBot(i: number) {
      const b = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.4,
        metalness: 0.15,
        emissive: 0x0b1220,
        emissiveIntensity: 0.3
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14), m);
      body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), m);
      head.position.y = 1.55;
      const hip = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), m);
      hip.position.y = 0.40;
      b.add(body, head, hip);

      // random spawn
      const x = THREE.MathUtils.randFloat(-HALF + 40, HALF - 40);
      const z = THREE.MathUtils.randFloat(-HALF + 40, HALF - 40);
      b.position.set(x, 0, z);
      scene.add(b);

      const name = BOT_NAMES[i % BOT_NAMES.length];
      const nameSprite = makeNameSprite(name);
      nameSprite.position.set(0, 2.6, 0);
      b.add(nameSprite);

      bots.push({ mesh: b, hp: 100, name, nameSprite, cooldown: THREE.MathUtils.randFloat(0.4, 1.2) });
    }

    // 20 bot istersen burada sayıyı artırabilirsin (şimdilik 12)
    for (let i = 0; i < 12; i++) spawnBot(i);

    // bot hitboxes
    const botHitMeshes: THREE.Object3D[] = [];

    // bot “target list” güncelle
    function rebuildBotHitList() {
      botHitMeshes.length = 0;
      for (const b of bots) botHitMeshes.push(b.mesh);
    }
    rebuildBotHitList();

    // ---------- Shooting ----------
    function shoot() {
      setHud((h) => {
        if (h.ammo <= 0) return h;
        return { ...h, ammo: h.ammo - 1 };
      });

      // aim center
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      // tracer (camera'dan ileri)
      const from = camera.position.clone();
      const dir = raycaster.ray.direction.clone().normalize();
      const to = from.clone().add(dir.multiplyScalar(80));
      spawnTracer(from, to);

      // hit bots
      const hits = raycaster.intersectObjects(botHitMeshes, true);
      if (hits.length) {
        // parent group (bot)
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !bots.find((b) => b.mesh === obj)) obj = obj.parent;
        const bot = bots.find((b) => b.mesh === obj);
        if (bot) {
          const dmg = THREE.MathUtils.randInt(18, 45); // -40 gibi gelsin
          bot.hp -= dmg;

          // damage number at hit point
          spawnDamageText(hits[0].point, dmg);

          if (bot.hp <= 0) {
            // bot ölür -> kaldır
            scene.remove(bot.mesh);
            const idx = bots.indexOf(bot);
            if (idx >= 0) bots.splice(idx, 1);
            rebuildBotHitList();
            setHud((h) => ({ ...h, score: h.score + 50 }));
          }
        }
      }
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

      // PUBG pitch limit
      const MIN_PITCH = -Math.PI / 3; // yukarı
      const MAX_PITCH = Math.PI / 4;  // aşağı
      pitch = clamp(pitch, MIN_PITCH, MAX_PITCH);
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      // shoot
      shoot();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;

      if (e.code === "KeyR") setHud((h) => ({ ...h, ammo: 30 }));
      if (e.code === "Escape") document.exitPointerLock?.();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = false;
      if (e.code === "KeyA") keys.a = false;
      if (e.code === "KeyS") keys.s = false;
      if (e.code === "KeyD") keys.d = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
      if (e.code === "Space") keys.space = false;
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", requestLock);

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

    // ---------- Obstacle collision (basic pushout) ----------
    const playerRadius = 0.55;

    function resolveObstaclesFor(pos: THREE.Vector3) {
      for (const box of obstacles) {
        const b = new THREE.Box3().setFromObject(box);
        b.min.x -= playerRadius;
        b.max.x += playerRadius;
        b.min.z -= playerRadius;
        b.max.z += playerRadius;

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

    // ---------- Loop ----------
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // küçük su animasyonu
      waterMat.opacity = 0.72 + Math.sin(clock.elapsedTime * 1.2) * 0.03;

      // movement intent in yaw plane
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

      // boundary clamp (harita dışına çıkma yok)
      player.position.x = clamp(player.position.x, -HALF + 6, HALF - 6);
      player.position.z = clamp(player.position.z, -HALF + 6, HALF - 6);

      // obstacle pushout
      resolveObstaclesFor(player.position);

      // player body turns towards camera yaw (PUBG hissi)
      player.rotation.y = lerpAngle(player.rotation.y, yaw, 0.12);

      // ---------- PUBG CAMERA ----------
      // Kamera arkada + üstte, pitch/yaw ile kontrol
      const CAMERA_DISTANCE = 6.8;
      const CAMERA_HEIGHT = 2.9;

      const camDir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      ).normalize();

      const camPos = player.position
        .clone()
        .add(camDir.clone().multiplyScalar(-CAMERA_DISTANCE));

      camPos.y += CAMERA_HEIGHT;

      camera.position.copy(camPos);
      camera.lookAt(player.position.x, player.position.y + 1.5, player.position.z);

      // ---------- Gun (elde görünür) ----------
      // Silahı kameranın sağ altına “screen-space” gibi yerleştiriyoruz (basit)
      const gunOffset = new THREE.Vector3(0.55, -0.55, -1.25);
      gun.position.copy(camera.position);
      gun.quaternion.copy(camera.quaternion);
      gun.position.add(gunOffset.applyQuaternion(camera.quaternion));
      gun.rotation.z = -0.08;

      // ---------- Bots: orta mesafe yaklaşır + bakar ----------
      for (const b of bots) {
        const toP = player.position.clone().sub(b.mesh.position);
        const dist = toP.length();

        // orta mesafe: 10-22 arası yürüsün
        if (dist > 12 && dist < 60) {
          toP.normalize();
          b.mesh.position.add(toP.multiplyScalar(dt * 2.2));
          // basit obstacle pushout
          resolveObstaclesFor(b.mesh.position);
          // map clamp
          b.mesh.position.x = clamp(b.mesh.position.x, -HALF + 6, HALF - 6);
          b.mesh.position.z = clamp(b.mesh.position.z, -HALF + 6, HALF - 6);
        }

        // bot yüzünü oyuncuya yumuşak çevir
        const dirToP = player.position.clone().sub(b.mesh.position);
        const targetYaw = Math.atan2(dirToP.x, dirToP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.08);

        // (istersen sonra: botlar da ateş etsin / can azaltsın)
      }

      // ---------- FX update (tracer + damage text) ----------
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.life -= dt;
        if (f.vy !== 0) f.obj.position.y += f.vy * dt;
        // fade for line
        const mat = (f.obj as any).material as THREE.Material | undefined;
        if (mat && (mat as any).opacity !== undefined) {
          (mat as any).opacity = clamp((f.life / 0.06), 0, 1);
        }

        if (f.life <= 0) {
          // dispose
          if (f.obj instanceof THREE.Line) {
            const g = f.obj.geometry as THREE.BufferGeometry;
            const m = f.obj.material as THREE.Material;
            g.dispose();
            m.dispose();
          }
          if (f.obj instanceof THREE.Sprite) {
            const spr: any = f.obj;
            if (spr.__tex) spr.__tex.dispose?.();
            if (spr.__mat) spr.__mat.dispose?.();
          }
          scene.remove(f.obj);
          fx.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
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
      canvas.removeEventListener("click", requestLock);

      // dispose
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-8 h-8 flex items-center justify-center">
          <div className="w-[2px] h-6 bg-slate-200/70" />
          <div className="w-6 h-[2px] bg-slate-200/70 absolute" />
        </div>
      </div>

      {/* HUD */}
      <div className="absolute top-3 left-3 flex gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          ❤️ HP: <span className="font-semibold">{hud.hp}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🔫 Ammo: <span className="font-semibold">{hud.ammo}</span> <span className="text-slate-400">(R)</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🏆 Score: <span className="font-semibold">{hud.score}</span>
        </div>
      </div>

      {/* Help / Lock overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <span className="text-slate-100 font-semibold">WASD</span> hareket •{" "}
          <span className="text-slate-100 font-semibold">SPACE</span> zıpla •{" "}
          <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
          <span className="text-slate-100 font-semibold">Mouse</span> bakış •{" "}
          <span className="text-slate-100 font-semibold">Sol tık</span> ateş •{" "}
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
    </div>
  );
}
