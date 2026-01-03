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

type Phase = "ready" | "countdown" | "playing";

type Bot = {
  mesh: THREE.Mesh;
  hp: number;
  speed: number;
  atkCooldown: number;
  vel: THREE.Vector3; // knockback + smoothing
};

type MiniDot = { x: number; y: number; kind: "bot" | "target" };

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);

  const [hud, setHud] = useState({
    hp: 100,
    ammo: 30,
    score: 0,
    time: 0,
    zone: 0
  });

  const [mini, setMini] = useState<{
    dots: MiniDot[];
    zoneR: number;
    zoneDirDeg: number;
  }>({ dots: [], zoneR: 0, zoneDirDeg: 0 });

  // Refs (avoid per-frame state spam)
  const hudRef = useRef({ hp: 100, ammo: 30, score: 0, time: 0, zone: 0 });
  const phaseRef = useRef<Phase>("ready");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Countdown effect
  useEffect(() => {
    if (phase !== "countdown") return;

    let c = 3;
    setCount(c);

    const t = setInterval(() => {
      c -= 1;
      setCount(c);
      if (c <= 0) {
        clearInterval(t);
        setPhase("playing");
      }
    }, 800);

    return () => clearInterval(t);
  }, [phase]);

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
    scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x1b1330, 0.9));

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(8, 14, 6);
    scene.add(dir);

    const accent = new THREE.PointLight(0x6d5cff, 1.2, 40);
    accent.position.set(0, 8, 0);
    scene.add(accent);

    // ---------- Ground ----------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0b1020,
        roughness: 0.95,
        metalness: 0.05
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const grid = new THREE.GridHelper(200, 80, 0x253155, 0x141a33);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    // ---------- Obstacles ----------
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
    hip.position.y = 0.4;
    player.add(cyl, head, hip);
    player.position.set(0, 0, 0);
    scene.add(player);

    // ---------- Controls State ----------
    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
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

    const SPEED = 5.4;
    const SPRINT = 8.2;
    const JUMP = 5.8;
    const GRAVITY = 16.5;

    // ---------- Targets (shootable) ----------
    const targets: THREE.Mesh[] = [];
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a66,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.9,
      roughness: 0.35
    });

    function spawnTargetRandom() {
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 18), targetMat);
      const angle = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 12; // 10..22 geniş dağılım
      t.position.set(Math.cos(angle) * r, 0.45, Math.sin(angle) * r);
      scene.add(t);
      targets.push(t);
    }

    for (let i = 0; i < 10; i++) spawnTargetRandom();

    // ---------- ZONE (Battle Royale) ----------
    const zoneCenter = new THREE.Vector3(0, 0, 0);
    const ZONE_INITIAL = 22;
    let zoneRadius = ZONE_INITIAL;

    const zoneMin = 6.5;
    const zoneShrinkPerSec = 0.22;
    const zoneDps = 6;

    // geometry oluşturup SCALE ile küçült (memory leak yok)
    const zoneRingMat = new THREE.MeshBasicMaterial({
      color: 0x4f46e5,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });
    const zoneRing = new THREE.Mesh(
      new THREE.RingGeometry(ZONE_INITIAL - 0.08, ZONE_INITIAL + 0.08, 96),
      zoneRingMat
    );
    zoneRing.rotation.x = -Math.PI / 2;
    zoneRing.position.y = 0.02;
    scene.add(zoneRing);

    // ---------- BOTS ----------
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({
      color: 0x15202a,
      roughness: 0.55,
      metalness: 0.15,
      emissive: 0x00ffc6,
      emissiveIntensity: 0.22
    });

    function spawnBot() {
      const bot = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), botMat);
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 10;
      bot.position.set(Math.cos(a) * r, 0.95, Math.sin(a) * r);
      scene.add(bot);

      bots.push({
        mesh: bot,
        hp: 40,
        speed: 2.2 + Math.random() * 0.9,
        atkCooldown: 0,
        vel: new THREE.Vector3()
      });
    }

    for (let i = 0; i < 5; i++) spawnBot();

    // ---------- Shooting ----------
    const raycaster = new THREE.Raycaster();
    const muzzleFlash = new THREE.PointLight(0x9aa5ff, 0, 6);
    scene.add(muzzleFlash);

    function doScore(delta: number) {
      hudRef.current.score += delta;
    }
    function takeDamage(delta: number) {
      hudRef.current.hp = Math.max(0, hudRef.current.hp - delta);
    }

    function shoot() {
      // güvenli: sadece playing + pointer lock varken ateş
      if (phaseRef.current !== "playing") return;

      if (hudRef.current.ammo <= 0) return;
      hudRef.current.ammo -= 1;

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const shootables: THREE.Object3D[] = [...targets, ...bots.map((b) => b.mesh)];
      const hits = raycaster.intersectObjects(shootables, false);

      if (hits.length > 0) {
        const hitObj = hits[0].object as THREE.Mesh;

        // BOT hit?
        const bi = bots.findIndex((b) => b.mesh === hitObj);
        if (bi >= 0) {
          const b = bots[bi];
          b.hp -= 20;

          // hit flash
          const mat = b.mesh.material as THREE.MeshStandardMaterial;
          const prev = mat.emissiveIntensity;
          mat.emissiveIntensity = 0.9;
          setTimeout(() => {
            try {
              mat.emissiveIntensity = prev;
            } catch {}
          }, 80);

          // KNOCKBACK
          const knockDir = new THREE.Vector3()
            .subVectors(b.mesh.position, player.position)
            .setY(0)
            .normalize();

          const camForward = new THREE.Vector3();
          camera.getWorldDirection(camForward);
          camForward.y = 0;
          camForward.normalize();

          b.vel.add(knockDir.multiplyScalar(3.2)).add(camForward.multiplyScalar(1.6));

          if (b.hp <= 0) {
            scene.remove(b.mesh);
            bots.splice(bi, 1);
            doScore(25);
            setTimeout(() => spawnBot(), 700);
          } else {
            doScore(2);
          }
        } else {
          // Target hit?
          const ti = targets.indexOf(hitObj);
          if (ti >= 0) {
            scene.remove(hitObj);
            targets.splice(ti, 1);
            doScore(10);
            setTimeout(() => spawnTargetRandom(), 450);
          }
        }
      }

      // muzzle flash
      muzzleFlash.position.copy(camera.position);
      muzzleFlash.intensity = 2.2;
      setTimeout(() => (muzzleFlash.intensity = 0), 55);
    }

    // ---------- Pointer Lock ----------
    const canvas = renderer.domElement;

    function requestLock() {
      if (phaseRef.current !== "playing") return;
      canvas.requestPointerLock?.();
    }

    function onPointerLockChange() {
      const isLocked = document.pointerLockElement === canvas;
      setLocked(isLocked);
    }

    function onMouseMove(e: MouseEvent) {
      if (phaseRef.current !== "playing") return;
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
      if (phaseRef.current !== "playing") return;

      // lock yoksa önce lock iste (ilk tık boşa gitmesin)
      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      shoot();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (phaseRef.current !== "playing") return;

      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;

      if (e.code === "KeyR") hudRef.current.ammo = 30;
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

    // ✅ IMPORTANT: overlay tıklamasını React tarafında yapacağız.
    // canvas click listener KALDIRDIK (oyuna girememe bug'ını çözer)

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

    // ---------- Collision helpers ----------
    const playerRadius = 0.45;
    const botRadius = 0.42;
    const box3 = new THREE.Box3();

    function resolveAgainstObstacles(pos: THREE.Vector3, radius: number) {
      for (const box of obstacles) {
        box3.setFromObject(box);

        box3.min.x -= radius;
        box3.max.x += radius;
        box3.min.z -= radius;
        box3.max.z += radius;

        if (pos.y > box3.max.y + 0.2) continue;

        if (pos.x > box3.min.x && pos.x < box3.max.x && pos.z > box3.min.z && pos.z < box3.max.z) {
          const dxMin = Math.abs(pos.x - box3.min.x);
          const dxMax = Math.abs(box3.max.x - pos.x);
          const dzMin = Math.abs(pos.z - box3.min.z);
          const dzMax = Math.abs(box3.max.z - pos.z);

          const m = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (m === dxMin) pos.x = box3.min.x;
          else if (m === dxMax) pos.x = box3.max.x;
          else if (m === dzMin) pos.z = box3.min.z;
          else pos.z = box3.max.z;
        }
      }
    }

    // ---------- UI sync (throttle) ----------
    let hudAcc = 0;
    let miniAcc = 0;

    function syncHud(dt: number) {
      hudAcc += dt;
      if (hudAcc < 0.12) return;
      hudAcc = 0;
      setHud({ ...hudRef.current });
    }

    function syncMini(dt: number) {
      miniAcc += dt;
      if (miniAcc < 0.12) return;
      miniAcc = 0;

      const MAP_R = 30;
      const dots: MiniDot[] = [];

      for (const b of bots) {
        const dx = b.mesh.position.x - player.position.x;
        const dz = b.mesh.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= MAP_R) dots.push({ x: dx / MAP_R, y: dz / MAP_R, kind: "bot" });
      }

      for (const t of targets) {
        const dx = t.position.x - player.position.x;
        const dz = t.position.z - player.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= MAP_R) dots.push({ x: dx / MAP_R, y: dz / MAP_R, kind: "target" });
      }

      // Zone direction arrow: 0 = up (negative z), right = +x
      const zx = zoneCenter.x - player.position.x;
      const zz = zoneCenter.z - player.position.z;
      const ang = Math.atan2(zx, -zz);
      const zoneDirDeg = (ang * 180) / Math.PI;

      setMini({ dots, zoneR: zoneRadius, zoneDirDeg });
    }

    // ---------- Loop ----------
    const clock = new THREE.Clock();

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.033);

      // game over: durdur (AI + zone + timer)
      if (hudRef.current.hp <= 0) {
        renderer.render(scene, camera);
        syncHud(dt);
        syncMini(dt);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // time only in playing
      if (phaseRef.current === "playing") hudRef.current.time += dt;

      // look
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

      if (!onGround) vel.y -= GRAVITY * dt;

      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      player.position.y += vel.y * dt;

      // ground
      if (player.position.y < GROUND_Y) {
        player.position.y = GROUND_Y;
        vel.y = 0;
        onGround = true;
      }

      // player obstacles
      resolveAgainstObstacles(player.position, playerRadius);

      // -------- ZONE shrink + damage --------
      if (phaseRef.current === "playing") {
        zoneRadius = Math.max(zoneMin, zoneRadius - zoneShrinkPerSec * dt);

        // ring scale update (NO geometry recreate)
        const s = zoneRadius / ZONE_INITIAL;
        zoneRing.scale.setScalar(s);

        // player outside damage
        const dx = player.position.x - zoneCenter.x;
        const dz = player.position.z - zoneCenter.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > zoneRadius) takeDamage(zoneDps * dt);
      }
      hudRef.current.zone = zoneRadius;

      // -------- BOT AI + collisions + zone behavior --------
      if (phaseRef.current === "playing") {
        for (const b of bots) {
          b.atkCooldown = Math.max(0, b.atkCooldown - dt);

          // If bot outside zone, pull it inward strongly + take minor damage
          const bdx = b.mesh.position.x - zoneCenter.x;
          const bdz = b.mesh.position.z - zoneCenter.z;
          const bdist = Math.sqrt(bdx * bdx + bdz * bdz);
          if (bdist > zoneRadius) {
            // inward pull
            const pull = new THREE.Vector3(-bdx, 0, -bdz).normalize().multiplyScalar(3.2);
            b.vel.add(pull);
            // zone dmg (bot da acı çeksin)
            b.hp -= 12 * dt;
            if (b.hp <= 0) {
              scene.remove(b.mesh);
              const idx = bots.indexOf(b);
              if (idx >= 0) bots.splice(idx, 1);
              doScore(8); // zone'da öldü diye az puan
              setTimeout(() => spawnBot(), 650);
              continue;
            }
          }

          // chase direction
          const dirToPlayer = new THREE.Vector3(
            player.position.x - b.mesh.position.x,
            0,
            player.position.z - b.mesh.position.z
          );
          const dist = dirToPlayer.length();
          if (dist > 0.001) dirToPlayer.normalize();

          const moveSpeed = dist < 1.2 ? b.speed * 0.35 : b.speed;
          const chaseVel = dirToPlayer.multiplyScalar(moveSpeed);

          // knockback friction
          b.vel.multiplyScalar(THREE.MathUtils.lerp(1, 0.86, dt * 8));

          const vx = chaseVel.x + b.vel.x;
          const vz = chaseVel.z + b.vel.z;

          b.mesh.position.x += vx * dt;
          b.mesh.position.z += vz * dt;

          // bot obstacles collision (prevents wall phasing)
          resolveAgainstObstacles(b.mesh.position, botRadius);

          // face player (smooth a bit)
          const targetYaw = Math.atan2(
            player.position.x - b.mesh.position.x,
            player.position.z - b.mesh.position.z
          );
          // ESKİ HALİ:
// b.mesh.rotation.y = THREE.MathUtils.lerpAngle(b.mesh.rotation.y, targetYaw, 0.18);

// YENİ HALİ (Bunu kopyalayıp o satırın yerine yapıştırın):
          const angleDiff = ((targetYaw - b.mesh.rotation.y + Math.PI + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
            b.mesh.rotation.y += angleDiff * 0.18;

          // attack
          if (dist < 1.25 && b.atkCooldown === 0) {
            b.atkCooldown = 0.65;
            takeDamage(8);
          }
        }
      }

      // camera follow
      const headPos = new THREE.Vector3(
        player.position.x,
        player.position.y + PLAYER_HEIGHT * 0.78,
        player.position.z
      );

      const back = new THREE.Vector3(0, 0, 1)
        .applyEuler(new THREE.Euler(0, yaw, 0))
        .multiplyScalar(2.2);
      camera.position.set(headPos.x + back.x, headPos.y + 0.2, headPos.z + back.z);

      const lookAt = headPos
        .clone()
        .add(new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0)).multiplyScalar(8));
      camera.lookAt(lookAt);

      renderer.render(scene, camera);

      syncHud(dt);
      syncMini(dt);

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

      // dispose renderer
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // ✅ Overlay tık: oyuna girme fix'i burada
  const onOverlayClick = () => {
    if (phaseRef.current === "ready") {
      setPhase("countdown");
      return;
    }
  };

  const gameOver = hud.hp <= 0;

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      {/* Canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Crosshair */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="h-6 w-px bg-slate-200/70" />
          <div className="absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-slate-200/70" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-300/80" />
        </div>
      </div>

      {/* HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          ❤️ HP: <span className="font-semibold">{Math.round(hud.hp)}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🔫 Ammo: <span className="font-semibold">{hud.ammo}</span>{" "}
          <span className="text-slate-400">(R)</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🏆 Score: <span className="font-semibold">{hud.score}</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          ⏱️ Time: <span className="font-semibold">{hud.time.toFixed(0)}s</span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">
          🌀 Zone: <span className="font-semibold">{hud.zone.toFixed(1)}</span>
        </div>
      </div>

      {/* MINIMAP */}
      <div className="absolute top-3 right-3">
        <div className="relative h-[140px] w-[140px] rounded-2xl bg-slate-950/70 border border-slate-800 overflow-hidden">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700/60" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-700/60" />

          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow" />

          {mini.dots.map((d, i) => {
            const PAD = 10;
            const W = 140 - PAD * 2;
            const H = 140 - PAD * 2;
            const x = PAD + (d.x * 0.5 + 0.5) * W;
            const y = PAD + (d.y * 0.5 + 0.5) * H;
            const cls = d.kind === "bot" ? "bg-red-400" : "bg-indigo-300";

            return (
              <div
                key={i}
                className={`absolute h-2 w-2 rounded-full ${cls}`}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: "translate(-50%, -50%)"
                }}
              />
            );
          })}

          {/* zone direction arrow */}
          <div className="absolute left-1/2 top-1/2">
            <div
              style={{
                transform: `translate(-50%, -50%) rotate(${mini.zoneDirDeg}deg)`
              }}
            >
              <div
                style={{
                  borderLeft: "7px solid transparent",
                  borderRight: "7px solid transparent",
                  borderBottom: "12px solid rgba(79,70,229,0.9)",
                  filter: "drop-shadow(0 0 6px rgba(79,70,229,0.55))",
                  transform: "translateY(-46px)"
                }}
              />
            </div>
          </div>

          <div className="absolute bottom-2 left-2 text-[11px] text-slate-300 bg-slate-900/50 border border-slate-800 rounded-lg px-2 py-1">
            minimap
          </div>
        </div>
      </div>

      {/* Help bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <span className="text-slate-100 font-semibold">WASD</span> hareket •{" "}
          <span className="text-slate-100 font-semibold">SPACE</span> zıpla •{" "}
          <span className="text-slate-100 font-semibold">SHIFT</span> koş •{" "}
          <span className="text-slate-100 font-semibold">Mouse</span> bakış •{" "}
          <span className="text-slate-100 font-semibold">Sol tık</span> ateş/kilit •{" "}
          <span className="text-slate-100 font-semibold">R</span> doldur
        </div>

        <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          {locked ? (
            <span className="text-emerald-300">🟢 Kontrol aktif</span>
          ) : (
            <span className="text-indigo-300">🟣 Playing’de sol tık → kilit/ateş</span>
          )}
        </div>
      </div>

      {/* READY / COUNTDOWN OVERLAY (clickable -> fixes "oyuna giremiyorum") */}
      {(phase === "ready" || phase === "countdown") && (
        <button
          type="button"
          onClick={onOverlayClick}
          className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
        >
          <div className="text-center space-y-3 px-6">
            <div className="text-2xl font-extrabold text-slate-100">
              {phase === "ready" ? "Arenaya Hazır mısın?" : "Başlıyor..."}
            </div>

            {phase === "ready" && (
              <div className="text-slate-300 text-sm">
                Buraya tıkla → 3-2-1 → oyun başlasın
              </div>
            )}

            {phase === "countdown" && (
              <div className="text-6xl font-black text-indigo-300">{count}</div>
            )}

            <div className="text-xs text-slate-400">
              Zone daralır • Dışarıda hasar yersin • Kırmızı bot • Mor hedef
            </div>
          </div>
        </button>
      )}

      {/* GAME OVER */}
      {gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-3">
            <div className="text-4xl font-black text-red-300">GAME OVER</div>
            <div className="text-slate-200">
              Skor: <span className="font-bold">{hud.score}</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition"
            >
              Yeniden Başla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
