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
    renderer.setClearColor(0x050712, 1);
    mountRef.current.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050712, 12, 90);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      500
    );

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.9);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(8, 14, 6);
    scene.add(dir);

    // Neon-ish accent light
    const accent = new THREE.PointLight(0x6d5cff, 1.2, 40);
    accent.position.set(0, 8, 0);
    scene.add(accent);

    // ---------- Ground ----------
    const groundGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0b1020,
      roughness: 0.95,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper (subtle)
    const grid = new THREE.GridHelper(200, 80, 0x253155, 0x141a33);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    // ---------- Obstacles (arena blocks) ----------
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x121a33,
      roughness: 0.6,
      metalness: 0.2,
      emissive: 0x1a2450,
      emissiveIntensity: 0.6
    });

    const obstacles: THREE.Mesh[] = [];
    function addBox(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), obstacleMat);
      m.position.set(x, y + sy / 2, z);
      scene.add(m);
      obstacles.push(m);
    }

    addBox(6, 0, -8, 6, 2, 6);
    addBox(-10, 0, -6, 5, 3, 5);
    addBox(-2, 0, 12, 8, 2, 4);
    addBox(12, 0, 10, 4, 4, 4);
    addBox(-14, 0, 10, 6, 2, 6);

    // ---------- Targets (shootable) ----------
    const targets: THREE.Mesh[] = [];
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a66,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.9,
      roughness: 0.35
    });

    function spawnTarget(i: number) {
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 18), targetMat);
      const angle = (i / 10) * Math.PI * 2;
      const r = 10 + (i % 3) * 4;
      t.position.set(Math.cos(angle) * r, 0.45, Math.sin(angle) * r);
      scene.add(t);
      targets.push(t);
    }
    for (let i = 0; i < 10; i++) spawnTarget(i);

    // ---------- Player (capsule-ish) ----------
    // We’ll render a capsule-like body (cylinder + spheres) for visuals only.
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

    // ---------- Controls State ----------
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
    let yaw = 0;   // left-right look
    let pitch = 0; // up-down look

    // Movement physics (simple)
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

    // ---------- Raycaster (shooting) ----------
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 6);
    scene.add(muzzleFlash);

    function shoot() {
      setHud((h) => {
        if (h.ammo <= 0) return h;
        return { ...h, ammo: h.ammo - 1 };
      });

      // From camera center
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object as THREE.Mesh;
        const idx = targets.indexOf(hitObj);
        if (idx >= 0) {
          // remove + respawn
          scene.remove(hitObj);
          targets.splice(idx, 1);
          setHud((h) => ({ ...h, score: h.score + 10 }));

          // respawn after short delay
          setTimeout(() => {
            spawnTarget(Math.floor(Math.random() * 10000));
          }, 450);
        }
      }

      // flash
      muzzleFlash.position.copy(camera.position);
      muzzleFlash.intensity = 2.2;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
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
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) shoot(); // left click
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;

      // reload
      if (e.code === "KeyR") {
        setHud((h) => ({ ...h, ammo: 30 }));
      }
      // unlock
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

    // ---------- Simple obstacle collision (very basic) ----------
    // We do a cheap “push out” by preventing player from entering each box’s XZ footprint.
    // Not perfect, but good enough for Phase 1 feel.
    const playerRadius = 0.45;

    function resolveObstacles() {
      for (const box of obstacles) {
        const b = new THREE.Box3().setFromObject(box);
        // expand in XZ by player radius
        b.min.x -= playerRadius;
        b.max.x += playerRadius;
        b.min.z -= playerRadius;
        b.max.z += playerRadius;

        // only check near ground heights
        if (player.position.y > b.max.y + 0.2) continue;

        if (
          player.position.x > b.min.x &&
          player.position.x < b.max.x &&
          player.position.z > b.min.z &&
          player.position.z < b.max.z
        ) {
          // push out: find nearest edge
          const dxMin = Math.abs(player.position.x - b.min.x);
          const dxMax = Math.abs(b.max.x - player.position.x);
          const dzMin = Math.abs(player.position.z - b.min.z);
          const dzMax = Math.abs(b.max.z - player.position.z);

          const m = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (m === dxMin) player.position.x = b.min.x;
          else if (m === dxMax) player.position.x = b.max.x;
          else if (m === dzMin) player.position.z = b.min.z;
          else player.position.z = b.max.z;
        }
      }
    }

    // ---------- Loop ----------
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // look direction
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // movement intent in camera yaw plane
      forward.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
      right.copy(forward).cross(up).normalize();

      tmp.set(0, 0, 0);
      if (keys.w) tmp.add(forward);
      if (keys.s) tmp.sub(forward);
      if (keys.d) tmp.add(right);
      if (keys.a) tmp.sub(right);

      if (tmp.lengthSq() > 0) tmp.normalize();

      const targetSpeed = keys.shift ? SPRINT : SPEED;
      // smooth acceleration
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

      // obstacle pushout
      resolveObstacles();

      // camera follow: 3rd-person close, but still “aim from camera”
      // Put camera at head height, slightly behind
      const headPos = new THREE.Vector3(
        player.position.x,
        player.position.y + PLAYER_HEIGHT * 0.78,
        player.position.z
      );

      // offset behind camera based on yaw/pitch
      const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, yaw, 0)).multiplyScalar(2.2);
      camera.position.set(headPos.x + back.x, headPos.y + 0.2, headPos.z + back.z);

      // look at a point forward from head
      const lookAt = headPos.clone().add(new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0)).multiplyScalar(8));
      camera.lookAt(lookAt);

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

      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      {/* Canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

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
