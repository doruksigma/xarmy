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
  "Cevat",
  "Kılıç",
  "Pala 😂",
  "Deli Yürek",
  "Kurtlar Vadisi",
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
  });

  useEffect(() => {
    if (!mountRef.current) return;

    // =============================
    // MAP SETTINGS (USER REQUEST)
    // =============================
    const MAP_SIZE = 500; // total width/height
    const HALF = MAP_SIZE / 2; // 250

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 25, 260);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1500
    );

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.9);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(30, 60, 30);
    scene.add(dir);

    const accent = new THREE.PointLight(0x6d5cff, 1.4, 140);
    accent.position.set(0, 24, 0);
    scene.add(accent);

    // ---------- Ground (grass-ish) ----------
    const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a2a14, // koyu çimen
      roughness: 0.98,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // subtle grid
    const grid = new THREE.GridHelper(MAP_SIZE, 100, 0x2ea043, 0x0d1b12);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.18;
    scene.add(grid);

    // ---------- Obstacles (collision list) ----------
    const obstacles: THREE.Mesh[] = [];

    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a2a,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x0a1a1a,
      emissiveIntensity: 0.4,
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
    addWall(0, -HALF, MAP_SIZE + thickness, 8, thickness); // north
    addWall(0, HALF, MAP_SIZE + thickness, 8, thickness); // south
    addWall(-HALF, 0, thickness, 8, MAP_SIZE + thickness); // west
    addWall(HALF, 0, thickness, 8, MAP_SIZE + thickness); // east

    // ---------- Houses (simple) ----------
    for (let i = 0; i < 10; i++) {
      const x = rand(-HALF + 40, HALF - 40);
      const z = rand(-HALF + 40, HALF - 40);
      const w = rand(10, 18);
      const d = rand(10, 18);
      const h = rand(6, 10);
      addBox(x, z, w, h, d);
    }

    // ---------- Trees (simple cylinders+cones, no collision for perf) ----------
    const trees: THREE.Group[] = [];
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.9,
      emissive: 0x052e12,
      emissiveIntensity: 0.25,
    });

    function addTree(x: number, z: number) {
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

    for (let i = 0; i < 120; i++) {
      addTree(rand(-HALF + 20, HALF - 20), rand(-HALF + 20, HALF - 20));
    }

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

      // chip bg
      ctx.fillStyle = "rgba(2,6,23,0.70)";
      roundRect(ctx, 16, 18, 480, 92, 28);
      ctx.fill();

      // border
      ctx.strokeStyle = "rgba(99,102,241,0.35)";
      ctx.lineWidth = 4;
      roundRect(ctx, 16, 18, 480, 92, 28);
      ctx.stroke();

      // text
      ctx.font = "bold 54px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(224,231,255,0.96)";
      ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 6);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(2.4, 0.6, 1);
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
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 16), bodyMat);
    hip.position.y = 0.40;
    player.add(cyl, head, hip);

    const playerName = makeNameSprite("DORUKSIGMA");
    playerName.position.set(0, 2.55, 0);
    player.add(playerName);

    player.position.set(0, 0, 0);
    scene.add(player);

    // ---------- Bus (moving) ----------
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
      emissiveIntensity: 0.6,
    });

    function spawnBot() {
      const g = new THREE.Group();

      const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14), botMat);
      bc.position.y = 0.95;
      const bh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), botMat);
      bh.position.y = 1.55;
      const bp = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), botMat);
      bp.position.y = 0.40;

      g.add(bc, bh, bp);

      const name = pick(BOT_NAMES);
      const label = makeNameSprite(name);
      label.position.set(0, 2.55, 0);
      g.add(label);

      // spawn within bounds
      g.position.set(rand(-HALF + 30, HALF - 30), 0, rand(-HALF + 30, HALF - 30));
      scene.add(g);

      bots.push({ mesh: g, name, hp: 60, cooldown: rand(0.2, 1.2) });
    }

    for (let i = 0; i < 20; i++) spawnBot(); // user asked 20

    // ---------- Shooting ----------
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 8);
    scene.add(muzzleFlash);

    function applyDamageToPlayer(dmg: number) {
      setHud((h) => {
        const hp = Math.max(0, h.hp - dmg);
        return { ...h, hp };
      });
    }

    function shoot() {
      setHud((h) => {
        if (h.ammo <= 0) return h;
        return { ...h, ammo: h.ammo - 1 };
      });

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const botMeshes = bots.map((b) => b.mesh);
      const hits = raycaster.intersectObjects(botMeshes, true);

      if (hits.length > 0) {
        // find root bot group
        const hitObj = hits[0].object;
        const root = bots.find((b) => hitObj.parent?.parent === b.mesh || hitObj.parent === b.mesh || hitObj === b.mesh);

        if (root) {
          root.hp -= 20;
          if (root.hp <= 0) {
            scene.remove(root.mesh);
            const idx = bots.indexOf(root);
            if (idx >= 0) bots.splice(idx, 1);
            setHud((h) => ({ ...h, score: h.score + 25 }));
            // respawn after a sec
            setTimeout(() => spawnBot(), 800);
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

    // ---------- Very simple obstacle collision ----------
    const playerRadius = 0.55;

    function resolveObstaclesFor(pos: THREE.Vector3, radius: number) {
      for (const box of obstacles) {
        const b = new THREE.Box3().setFromObject(box);
        b.min.x -= radius;
        b.max.x += radius;
        b.min.z -= radius;
        b.max.z += radius;

        // y ignored mostly
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
      if (e.code === "KeyE") keys.e = false;
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // start lock on click (also used to "drop")
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

      // bg
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = "#06121a";
      mctx.fillRect(0, 0, W, H);

      // grass tint
      mctx.fillStyle = "rgba(34,197,94,0.12)";
      mctx.fillRect(0, 0, W, H);

      // border
      mctx.strokeStyle = "rgba(34,197,94,0.85)";
      mctx.lineWidth = 3;
      mctx.strokeRect(6, 6, W - 12, H - 12);

      const sx = (x: number) => ((x / MAP_SIZE) + 0.5) * W;
      const sz = (z: number) => ((z / MAP_SIZE) + 0.5) * H;

      // obstacles as gray points
      mctx.fillStyle = "rgba(148,163,184,0.55)";
      for (const o of obstacles) {
        // only houses; skip walls (too many)
        if ((o.material as THREE.MeshStandardMaterial).color.getHex() === 0x1b2a2a) {
          mctx.fillRect(sx(o.position.x) - 2, sz(o.position.z) - 2, 4, 4);
        }
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

    // ---------- Loop ----------
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // phase BUS: bus moves; press E to drop (or click)
      if (hud.phase === "BUS") {
        busT += dt * 0.08;
        const bx = THREE.MathUtils.lerp(-HALF + 30, HALF - 30, (Math.sin(busT) + 1) / 2);
        const bz = THREE.MathUtils.lerp(-HALF + 60, HALF - 60, (Math.cos(busT * 0.9) + 1) / 2);
        bus.position.set(bx, 0, bz);

        // camera follows bus (cinematic)
        camera.position.set(bus.position.x + 16, 22, bus.position.z + 16);
        camera.lookAt(bus.position.x, 10, bus.position.z);

        if (keys.e) {
          dropped = true;
          setHud((h) => ({ ...h, phase: "PLAY" }));

          // ✅ NO TELEPORT TO GROUND: drop from height
          player.position.set(bus.position.x - 2.2, 22, bus.position.z + 2.0);
          onGround = false;
          vel.set(0, 0, 0);
        }

        renderer.render(scene, camera);
        drawMinimap();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // PLAY camera look
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

      // ground
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;
      }

      // collision + boundaries (NO EXIT)
      resolveObstaclesFor(player.position, playerRadius);
      player.position.x = clamp(player.position.x, -HALF + 2, HALF - 2);
      player.position.z = clamp(player.position.z, -HALF + 2, HALF - 2);

      // camera follow (3rd person close)
      const headPos = new THREE.Vector3(player.position.x, player.position.y + PLAYER_HEIGHT * 0.78, player.position.z);
      const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(2.3);
      camera.position.set(headPos.x + back.x, headPos.y + 0.25, headPos.z + back.z);

      const lookAt = headPos
        .clone()
        .add(new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0)).multiplyScalar(10));
      camera.lookAt(lookAt);

      // bot AI: move + shoot at player
      const playerPos = player.position.clone();
      for (const b of bots) {
        const toP = playerPos.clone().sub(b.mesh.position);
        const dist = toP.length();

        // face player smoothly
        const targetYaw = Math.atan2(toP.x, toP.z);
        b.mesh.rotation.y = lerpAngle(b.mesh.rotation.y, targetYaw, 0.08);

        // move toward player (simple)
        if (dist > 8) {
          toP.normalize();
          b.mesh.position.x += toP.x * dt * 2.6;
          b.mesh.position.z += toP.z * dt * 2.6;
          resolveObstaclesFor(b.mesh.position, 0.45);
        }

        // clamp bots inside map
        b.mesh.position.x = clamp(b.mesh.position.x, -HALF + 2, HALF - 2);
        b.mesh.position.z = clamp(b.mesh.position.z, -HALF + 2, HALF - 2);

        // shoot if close enough
        b.cooldown = Math.max(0, b.cooldown - dt);
        if (dist < 22 && b.cooldown <= 0) {
          b.cooldown = rand(0.35, 0.85);

          // simple hit chance (far less accurate)
          const hitChance = dist < 10 ? 0.35 : dist < 16 ? 0.18 : 0.08;
          if (Math.random() < hitChance) applyDamageToPlayer(2);
        }
      }

      // render + minimap
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
  }, [hud.phase]);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      {/* Canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Minimap (colorful) */}
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
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="h-3 w-3 rounded-full border border-indigo-300/80" />
      </div>

      {/* Help / Phase */}
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
              <span className="text-slate-100 font-semibold">R</span> doldur
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
    </div>
  );
}
