import * as THREE from "three";
import type {
  Actor,
  Attachment,
  Collider,
  Difficulty,
  GameCommand,
  GameController,
  HudState,
  Loot,
  Phase,
  Quality,
  Rarity,
  Surface,
  TouchInput,
  WeaponId,
  Weather,
} from "./types";
import {
  WEAPONS,
  RARITY_COLORS,
  RARITY_MULTIPLIER,
  applyDamage,
  advanceFall,
  matchOutcome,
  randomGenerator,
  reloadMagazine,
  zoneAt,
  zoneDamage,
} from "./rules";
import { createWorld, MAP_SIZE } from "./world";
import {
  createCharacter,
  createLoot,
  createParachute,
  createPlane,
  disposeModels,
} from "./models";
import { createRendering } from "./rendering";
import { createAudio } from "./audio";
import { createTraversal } from "./traversal";
import { BOT_DIFFICULTY, createBotBrain, segmentBlocked } from "./ai";

type Rig = ReturnType<typeof createCharacter>;
type Inventory = {
  id: WeaponId;
  rarity: Rarity;
  ammo: number;
  reserve: number;
};
type Particle = {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  life: number;
  max: number;
  kind: "trace" | "spark" | "smoke" | "casing";
};
type Grenade = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  timer: number;
  kind: "frag" | "smoke" | "flash";
};
type ReplayFrame = {
  time: number;
  actors: {
    id: number;
    position: THREE.Vector3;
    yaw: number;
    alive: boolean;
  }[];
};
const UP = new THREE.Vector3(0, 1, 0);
const BOT_COUNT = 23;

export function createGame(
  container: HTMLElement,
  onHud: (state: HudState) => void,
  options: { quality: Quality; difficulty: Difficulty; seed?: number },
): GameController {
  const seed = options.seed ?? Date.now();
  const random = randomGenerator(seed);
  let quality = options.quality,
    difficulty = options.difficulty;
  const scene = new THREE.Scene();
  const cleanupOnFailure: (() => void)[] = [];
  try {
    const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 1500);
    const rendering = createRendering(container, scene, camera, quality);
    cleanupOnFailure.push(() => rendering.dispose());
    const world = createWorld(scene, quality, seed);
    cleanupOnFailure.push(() => world.dispose());
    const audio = createAudio();
    cleanupOnFailure.push(() => audio.dispose());
    const traversal = createTraversal(scene, world);
    cleanupOnFailure.push(() => traversal.dispose());
    const canvas = rendering.renderer.domElement;
    canvas.setAttribute("aria-label", "3D Battle Royale oyun dünyası");
    canvas.tabIndex = 0;
    const actor = (id: number, x: number, z: number): Actor => ({
      id,
      name: id === 0 ? "Sen" : `Operatör ${String(id).padStart(2, "0")}`,
      position: new THREE.Vector3(x, world.heightAt(x, z), z),
      yaw: random() * Math.PI * 2,
      hp: 100,
      armor: id === 0 ? 50 : 45,
      weapon: "pistol",
      ammo: 12,
      reserve: 72,
      alive: true,
      crouched: false,
      speed: 0,
    });
    const player = actor(0, -120, 32);
    player.position.y = 100;
    player.yaw = 0;
    const actors: Actor[] = [player];
    const rigs = new Map<number, Rig>();
    const playerRig = createCharacter(0x435c56, "pistol");
    rigs.set(0, playerRig);
    scene.add(playerRig.root);
    const botWeapons: WeaponId[] = [
      "ak47",
      "m4",
      "smg",
      "shotgun",
      "pistol",
      "lmg",
      "sniper",
    ];
    function safePoint(index: number): THREE.Vector3 {
      if (world.lootSpawns.length) {
        for (let j = 0; j < world.lootSpawns.length; j++) {
          const p =
            world.lootSpawns[(index + j) % world.lootSpawns.length].clone();
          p.y = world.heightAt(p.x, p.z);
          if (!blocked(p, 0.5, 1.8)) return p;
        }
      }
      return new THREE.Vector3(
        (random() - 0.5) * 360,
        0,
        (random() - 0.5) * 360,
      );
    }
    for (let i = 1; i <= BOT_COUNT; i++) {
      const spawn = safePoint(
        Math.floor(random() * Math.max(1, world.lootSpawns.length)),
      );
      const bot = actor(i, spawn.x, spawn.z);
      bot.weapon = botWeapons[i % botWeapons.length];
      bot.ammo = WEAPONS[bot.weapon].magazine;
      bot.reserve = 160;
      actors.push(bot);
      const rig = createCharacter(
        [0x665746, 0x47575f, 0x696e48, 0x534d50][i % 4],
        bot.weapon,
      );
      rigs.set(i, rig);
      scene.add(rig.root);
    }
    const brains = actors
      .slice(1)
      .map((a) => createBotBrain(a, difficulty, seed + a.id * 397));
    const plane = createPlane();
    scene.add(plane);
    const parachute = createParachute();
    playerRig.root.add(parachute);
    parachute.visible = false;
    const loot: Loot[] = [],
      lootMeshes = new Map<number, THREE.Group>();
    let nextLoot = 0;
    const inventory: Inventory[] = [
      { id: "pistol", rarity: "common", ammo: 12, reserve: 72 },
    ];
    let slot = 0;
    const attachments = new Set<Attachment>();
    let phase: Phase = "plane",
      elapsed = 0,
      combatTime = 0,
      weather: Weather = "clear",
      paused = false,
      disposed = false;
    let yaw = 0,
      pitch = -0.18,
      vertical = 0,
      stamina = 100,
      onGround = false,
      emergencyChute = false,
      prone = false,
      slideTime = 0,
      shoulder = 1;
    let recoil = 0,
      hit = 0,
      damageDirection: number | null = null,
      damageTimer = 0,
      aim = false;
    let cooldown = 0,
      reloadTime = 0,
      reloadTotal = 0,
      medkits = 2,
      grenadeCount = 3,
      grenadeKind: "frag" | "smoke" | "flash" = "frag";
    let kills = 0,
      notice = "ALTITUDE / Uçuş başladı",
      noticeTime = 6,
      prompt = "",
      endTime = 0,
      killerId = -1,
      killerName = "";
    let hudClock = 0,
      stepClock = 0,
      airdropClock = 75,
      replayClock = 0,
      snapshotClock = 0,
      flashTime = 0;
    let frame = 0,
      lastTime = performance.now(),
      fps = 0,
      fpsFrames = 0,
      fpsElapsed = 0,
      needsRender = true,
      renderedPaused = false;
    const velocity = new THREE.Vector3(),
      keys = new Set<string>();
    const input: TouchInput = {
      x: 0,
      y: 0,
      lookX: 0,
      lookY: 0,
      fire: false,
      aim: false,
      sprint: false,
    };
    let lastFire = false,
      mouseFire = false,
      mouseAim = false;
    const botCooldown = new Map<number, number>(),
      botReload = new Map<number, number>(),
      botHeal = new Map<number, number>();
    const botMedkits = new Map(actors.slice(1).map((a) => [a.id, 1]));
    const feed: string[] = [],
      history: ReplayFrame[] = [],
      particles: Particle[] = [],
      grenades: Grenade[] = [],
      smokeAreas: {
        position: THREE.Vector3;
        life: number;
        mesh: THREE.Mesh;
      }[] = [];
    const labels: {
      id: number;
      position: THREE.Vector3;
      value: number;
      headshot: boolean;
      life: number;
    }[] = [];
    let labelId = 0;
    const raycaster = new THREE.Raycaster();
    const flashLight = new THREE.PointLight(0xffb366, 0, 12, 2);
    scene.add(flashLight);
    const zoneMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 70, 128, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x789ae0,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    scene.add(zoneMesh);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.003, 4, 128),
      new THREE.MeshBasicMaterial({
        color: 0xaed1ff,
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    const impactGeometry = new THREE.IcosahedronGeometry(0.065, 0),
      smokeGeometry = new THREE.SphereGeometry(0.28, 6, 5),
      casingGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.1, 5);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc16d }),
      dustMaterial = new THREE.MeshBasicMaterial({
        color: 0xb9ae98,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      casingMaterial = new THREE.MeshStandardMaterial({
        color: 0xc4a066,
        metalness: 0.8,
        roughness: 0.3,
      });
    const traceMaterial = new THREE.LineBasicMaterial({
      color: 0xffdc9a,
      transparent: true,
      opacity: 0.8,
    });

    function blocked(
      position: THREE.Vector3,
      radius: number,
      height: number,
    ): boolean {
      return world.colliders.some(
        (c) =>
          !c.destroyed &&
          position.y < c.box.max.y - 0.12 &&
          position.y + height > c.box.min.y + 0.1 &&
          position.x > c.box.min.x - radius &&
          position.x < c.box.max.x + radius &&
          position.z > c.box.min.z - radius &&
          position.z < c.box.max.z + radius,
      );
    }
    function support(position: THREE.Vector3, previousY: number): number {
      let y = world.heightAt(position.x, position.z);
      for (const c of world.colliders)
        if (
          !c.destroyed &&
          c.box.max.y <= previousY + 0.4 &&
          c.box.max.y > y &&
          position.x > c.box.min.x - 0.2 &&
          position.x < c.box.max.x + 0.2 &&
          position.z > c.box.min.z - 0.2 &&
          position.z < c.box.max.z + 0.2
        )
          y = c.box.max.y;
      return y;
    }
    function announce(text: string, seconds = 3) {
      notice = text;
      noticeTime = seconds;
    }
    function addLoot(
      position: THREE.Vector3,
      kind: Loot["kind"],
      weapon?: WeaponId,
      rarity: Rarity = "common",
      attachment?: Attachment,
    ) {
      const item: Loot = {
        id: nextLoot++,
        position: position.clone(),
        kind,
        weapon,
        rarity,
        attachment,
        taken: false,
      };
      item.position.y =
        Math.max(position.y, world.heightAt(position.x, position.z)) + 0.15;
      loot.push(item);
      const mesh = createLoot(kind, rarity, weapon);
      mesh.position.copy(item.position);
      scene.add(mesh);
      lootMeshes.set(item.id, mesh);
      return item;
    }
    const rarities: Rarity[] = [
      "common",
      "common",
      "common",
      "rare",
      "rare",
      "epic",
      "legendary",
    ];
    for (let i = 0; i < 135; i++) {
      const p = safePoint(i * 7 + Math.floor(random() * 15));
      p.x += (random() - 0.5) * 2;
      p.z += (random() - 0.5) * 2;
      const kind: Loot["kind"] = [
        "weapon",
        "ammo",
        "medkit",
        "armor",
        "chest",
        "attachment",
        "weapon",
      ][i % 7] as Loot["kind"];
      addLoot(
        p,
        kind,
        botWeapons[i % 7],
        rarities[Math.floor(random() * rarities.length)],
        (["scope", "suppressor", "laser", "grip", "magazine"] as Attachment[])[
          i % 5
        ],
      );
    }
    addLoot(safePoint(3), "key", undefined, "legendary");
    addLoot(
      new THREE.Vector3(70, world.heightAt(70, 192) + 0.3, 192),
      "chest",
      "sniper",
      "legendary",
    );
    let hasKey = false;
    function syncInventory() {
      const w = inventory[slot];
      w.ammo = player.ammo;
      w.reserve = player.reserve;
    }
    function equip(w: Inventory) {
      player.weapon = w.id;
      player.ammo = w.ammo;
      player.reserve = w.reserve;
      playerRig.equip(w.id, [...attachments]);
      reloadTime = 0;
      cooldown = 0.25;
    }
    function pickup(who: Actor, item: Loot) {
      if (
        item.taken ||
        !who.alive ||
        who.position.distanceTo(item.position) > 4.2
      )
        return;
      if (who.id !== 0 && (item.kind === "key" || item.kind === "attachment"))
        return;
      if (item.kind === "chest") {
        if (who.id === 0) {
          item.taken = true;
          const mesh = lootMeshes.get(item.id);
          if (mesh?.userData.lid) mesh.userData.lid.rotation.x = -1.8;
          addLoot(
            item.position.clone().add(new THREE.Vector3(1, 0, 0)),
            "weapon",
            item.weapon ?? "m4",
            item.rarity,
          );
          addLoot(
            item.position.clone().add(new THREE.Vector3(-1, 0, 0)),
            "armor",
          );
          announce("Sandık açıldı · Ekipmanları E ile al.");
          return;
        }
        item.kind = "weapon";
      }
      if (item.kind === "medkit") {
        if (who.id === 0) {
          medkits++;
          announce("Sağlık çantası alındı · H ile kullan.");
        } else botMedkits.set(who.id, (botMedkits.get(who.id) ?? 0) + 1);
      } else if (item.kind === "armor")
        who.armor = Math.min(100, who.armor + 50);
      else if (item.kind === "ammo") who.reserve += 60;
      else if (item.kind === "key" && who.id === 0) {
        hasKey = true;
        announce("Sığınak anahtarı bulundu.");
      } else if (item.kind === "attachment" && who.id === 0) {
        attachments.add(item.attachment ?? "grip");
        playerRig.equip(player.weapon, [...attachments]);
        announce("Silah eklentisi takıldı.");
      } else if (item.kind === "weapon" && item.weapon) {
        if (who.id === 0) {
          syncInventory();
          const entry = {
            id: item.weapon,
            rarity: item.rarity,
            ammo: WEAPONS[item.weapon].magazine,
            reserve: 90,
          };
          if (inventory.length < 2) {
            inventory.push(entry);
            slot = inventory.length - 1;
          } else {
            addLoot(
              player.position.clone(),
              "weapon",
              player.weapon,
              inventory[slot].rarity,
            );
            inventory[slot] = entry;
          }
          equip(entry);
          announce(`${WEAPONS[item.weapon].name} alındı.`);
        } else {
          who.weapon = item.weapon;
          who.ammo = WEAPONS[who.weapon].magazine;
          who.reserve += 60;
          rigs.get(who.id)?.equip(who.weapon);
        }
      }
      item.taken = true;
      const mesh = lootMeshes.get(item.id);
      if (mesh) mesh.visible = false;
    }
    function capacity(who: Actor) {
      return (
        WEAPONS[who.weapon].magazine +
        (who.id === 0 && attachments.has("magazine") ? 15 : 0)
      );
    }
    function beginReload(who: Actor) {
      if (who.ammo >= capacity(who) || who.reserve <= 0) return;
      if (who.id === 0) {
        if (reloadTime) return;
        reloadTime = reloadTotal = WEAPONS[who.weapon].reload;
        audio.reload();
      } else if (!botReload.has(who.id))
        botReload.set(who.id, WEAPONS[who.weapon].reload);
    }
    function hitActor(
      target: Actor,
      damage: number,
      source: Actor | null,
      headshot = false,
    ) {
      if (!target.alive || (target.id === 0 && phase !== "combat")) return;
      const after = applyDamage(target.hp, target.armor, damage);
      target.hp = after.hp;
      target.armor = after.armor;
      if (source?.id === 0) {
        hit = headshot ? 2 : 1;
        audio.impact("metal", headshot);
        labels.push({
          id: labelId++,
          position: target.position.clone().add(new THREE.Vector3(0, 1.9, 0)),
          value: Math.round(damage),
          headshot,
          life: 0.75,
        });
      }
      if (target.id === 0) {
        damageTimer = 0.7;
        if (source)
          damageDirection =
            Math.atan2(
              source.position.x - player.position.x,
              source.position.z - player.position.z,
            ) - yaw;
        else damageDirection = 0;
      }
      if (target.hp <= 0) {
        target.alive = false;
        const text = `${source?.name ?? "Fırtına"} → ${target.name}`;
        feed.unshift(text);
        feed.splice(5);
        if (source?.id === 0 && target.id !== 0) {
          kills++;
          announce("RAKİP ELENDİ");
        }
        if (target.id === 0) {
          killerId = source?.id ?? -1;
          killerName = source?.name ?? "Güvenli alan dışında kaldın";
          finish("defeated");
        } else {
          addLoot(
            target.position,
            "weapon",
            target.weapon,
            random() > 0.8 ? "epic" : "rare",
          );
          const rig = rigs.get(target.id)!;
          rig.root.rotation.z = Math.PI / 2;
          rig.root.position.y =
            world.heightAt(target.position.x, target.position.z) + 0.35;
        }
      }
    }
    function finish(outcome: "victory" | "defeated") {
      if (phase === outcome) return;
      phase = outcome;
      endTime = elapsed;
      replayClock = Math.max(0, elapsed - 4);
      mouseFire = false;
      input.fire = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    function trace(from: THREE.Vector3, to: THREE.Vector3) {
      if (particles.length > 150) return;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        traceMaterial,
      );
      scene.add(line);
      particles.push({
        mesh: line,
        velocity: new THREE.Vector3(),
        life: 0.07,
        max: 0.07,
        kind: "trace",
      });
    }
    function impact(point: THREE.Vector3, surface: Surface, amount = 5) {
      for (let i = 0; i < amount && particles.length < 180; i++) {
        const mesh = new THREE.Mesh(
          surface === "metal" ? impactGeometry : smokeGeometry,
          surface === "metal" ? sparkMaterial : dustMaterial,
        );
        mesh.position.copy(point);
        scene.add(mesh);
        particles.push({
          mesh,
          velocity: new THREE.Vector3(
            (random() - 0.5) * 4,
            random() * 4,
            (random() - 0.5) * 4,
          ),
          life: 0.3 + random() * 0.4,
          max: 0.7,
          kind: surface === "metal" ? "spark" : "smoke",
        });
      }
    }
    function destruct(c: Collider, damage: number, point: THREE.Vector3) {
      if (c.health === undefined || c.destroyed) return;
      c.health -= damage;
      if (c.health <= 0) {
        c.destroyed = true;
        c.object.visible = false;
        impact(point, c.surface, 12);
        if (c.surface === "metal")
          audio.explosion(player.position.distanceTo(point));
      }
    }
    function shootRay(
      source: Actor,
      origin: THREE.Vector3,
      direction: THREE.Vector3,
      damage: number,
      range: number,
    ): void {
      raycaster.set(origin, direction);
      raycaster.far = range;
      let closest = range,
        hitPoint = origin.clone().addScaledVector(direction, range),
        wall: Collider | undefined,
        victim: Actor | undefined,
        head = false;
      for (const c of world.colliders) {
        if (c.destroyed) continue;
        const p = raycaster.ray.intersectBox(c.box, new THREE.Vector3());
        if (p) {
          const dist = origin.distanceTo(p);
          if (dist < closest) {
            closest = dist;
            hitPoint = p;
            wall = c;
          }
        }
      }
      for (const other of actors) {
        if (
          other.id === source.id ||
          !other.alive ||
          (other.id === 0 && phase !== "combat")
        )
          continue;
        const h = other.id === 0 && prone ? 0.7 : other.crouched ? 1.25 : 1.75;
        for (const [cy, radius, hs] of [
          [h - 0.12, 0.25, true],
          [h * 0.52, 0.47, false],
        ] as [number, number, boolean][]) {
          const p = raycaster.ray.intersectSphere(
            new THREE.Sphere(
              other.position.clone().add(new THREE.Vector3(0, cy, 0)),
              radius,
            ),
            new THREE.Vector3(),
          );
          if (p) {
            const dist = origin.distanceTo(p);
            if (dist < closest) {
              closest = dist;
              hitPoint = p;
              victim = other;
              head = hs;
              wall = undefined;
            }
          }
        }
      }
      if (victim) {
        const falloff = Math.max(0.45, 1 - (closest / range) * 0.4);
        hitActor(victim, damage * falloff * (head ? 2.1 : 1), source, head);
        impact(hitPoint, "soil", 3);
      } else if (wall) {
        destruct(wall, damage, hitPoint);
        impact(hitPoint, wall.surface);
      }
      trace(origin, hitPoint);
    }
    function shotEffect(who: Actor) {
      const position = who.position
        .clone()
        .add(
          new THREE.Vector3(
            -Math.sin(who.yaw) * 0.8,
            1.35,
            -Math.cos(who.yaw) * 0.8,
          ),
        );
      if (who.id === 0) {
        flashLight.position.copy(position);
        flashLight.intensity = 9;
        recoil = 1;
        const casing = new THREE.Mesh(casingGeometry, casingMaterial);
        casing.position.copy(position);
        scene.add(casing);
        particles.push({
          mesh: casing,
          velocity: new THREE.Vector3(Math.cos(yaw) * 2, 2, -Math.sin(yaw) * 2),
          life: 0.7,
          max: 0.7,
          kind: "casing",
        });
      }
      audio.shot(
        who.weapon,
        who.position.distanceTo(player.position),
        who.id === 0 && attachments.has("suppressor"),
      );
    }
    function shootPlayer() {
      if (
        phase !== "combat" ||
        paused ||
        traversal.active() ||
        reloadTime > 0 ||
        cooldown > 0 ||
        !player.alive
      )
        return;
      const spec = WEAPONS[player.weapon];
      if (player.ammo <= 0) {
        beginReload(player);
        return;
      }
      player.ammo--;
      cooldown = spec.interval;
      shotEffect(player);
      const origin = player.position
        .clone()
        .add(
          new THREE.Vector3(0, prone ? 0.65 : player.crouched ? 1.15 : 1.5, 0),
        );
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const aimPoint = raycaster.ray.at(spec.range, new THREE.Vector3());
      // Converge the muzzle on the camera's first visible contact. A separate
      // muzzle trace still blocks shots when a third-person camera peeks around cover.
      let nearest = spec.range;
      for (const c of world.colliders) {
        if (c.destroyed) continue;
        const p = raycaster.ray.intersectBox(c.box, new THREE.Vector3());
        if (p && camera.position.distanceTo(p) < nearest) {
          nearest = camera.position.distanceTo(p);
          aimPoint.copy(p);
        }
      }
      for (const other of actors) {
        if (!other.id || !other.alive) continue;
        const p = raycaster.ray.intersectSphere(
          new THREE.Sphere(
            other.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
            0.65,
          ),
          new THREE.Vector3(),
        );
        if (p && camera.position.distanceTo(p) < nearest) {
          nearest = camera.position.distanceTo(p);
          aimPoint.copy(p);
        }
      }
      const direction = aimPoint.sub(origin).normalize();
      const spread =
        spec.spread *
        (aim ? 0.28 : 1) *
        (attachments.has("grip") ? 0.7 : 1) *
        (slideTime > 0 ? 1.6 : 1);
      for (let i = 0; i < spec.pellets; i++) {
        const shot = direction
          .clone()
          .add(
            new THREE.Vector3(
              (random() - 0.5) * spread,
              (random() - 0.5) * spread,
              (random() - 0.5) * spread,
            ),
          )
          .normalize();
        shootRay(
          player,
          origin,
          shot,
          spec.damage * RARITY_MULTIPLIER[inventory[slot].rarity],
          spec.range,
        );
      }
      pitch = Math.min(
        0.9,
        pitch + spec.recoil * (attachments.has("grip") ? 0.65 : 1),
      );
      yaw += (random() - 0.5) * spec.recoil * 0.35;
    }
    function smokeBlocks(a: THREE.Vector3, b: THREE.Vector3) {
      const dir = b.clone().sub(a),
        length = dir.length();
      dir.normalize();
      const ray = new THREE.Ray(a, dir);
      return smokeAreas.some((s) => {
        const p = ray.intersectSphere(
          new THREE.Sphere(s.position, 6),
          new THREE.Vector3(),
        );
        return p && p.distanceTo(a) < length;
      });
    }
    function botShoot(who: Actor, target: Actor) {
      if (
        (botCooldown.get(who.id) ?? 0) > 0 ||
        botReload.has(who.id) ||
        phase !== "combat" ||
        smokeBlocks(who.position, target.position)
      )
        return;
      if (who.ammo <= 0) {
        beginReload(who);
        return;
      }
      const distance = who.position.distanceTo(target.position),
        spec = WEAPONS[who.weapon];
      if (distance > spec.range) return;
      const from = who.position
          .clone()
          .add(new THREE.Vector3(0, who.crouched ? 1.1 : 1.5, 0)),
        to = target.position
          .clone()
          .add(new THREE.Vector3(0, target.crouched ? 0.8 : 1.1, 0));
      if (segmentBlocked(from, to, world.colliders)) return;
      who.ammo--;
      botCooldown.set(who.id, spec.interval * (1.1 + random() * 0.7));
      shotEffect(who);
      const accuracy =
        BOT_DIFFICULTY[difficulty].accuracy * Math.max(0.3, 1 - distance / 350);
      if (random() > accuracy)
        to.add(
          new THREE.Vector3(
            (random() > 0.5 ? 1 : -1) * (1 + random() * 2),
            random() * 2,
            (random() - 0.5) * 3,
          ),
        );
      const direction = to.sub(from).normalize();
      shootRay(
        who,
        from,
        direction,
        spec.damage * (spec.pellets > 1 ? 3 : 1),
        spec.range,
      );
    }
    function throwGrenade() {
      if (phase !== "combat" || grenadeCount <= 0) return;
      grenadeCount--;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({
          color: grenadeKind === "frag" ? 0x596143 : 0x8e9691,
          metalness: 0.7,
          roughness: 0.55,
        }),
      );
      mesh.position.copy(player.position).add(new THREE.Vector3(0, 1.5, 0));
      scene.add(mesh);
      const dir = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.max(0.3, Math.sin(pitch) + 0.35),
        -Math.cos(yaw) * Math.cos(pitch),
      ).normalize();
      grenades.push({
        mesh,
        velocity: dir.multiplyScalar(20),
        timer: 2.7,
        kind: grenadeKind,
      });
    }
    function detonate(g: Grenade) {
      const p = g.mesh.position;
      if (g.kind === "frag") {
        audio.explosion(player.position.distanceTo(p));
        impact(p, "metal", 28);
        for (const a of actors) {
          const d = a.position.distanceTo(p);
          if (
            d < 12 &&
            !segmentBlocked(
              p.clone().add(new THREE.Vector3(0, 0.25, 0)),
              a.position.clone().add(new THREE.Vector3(0, 1, 0)),
              world.colliders,
            )
          )
            hitActor(a, 125 * (1 - d / 12), player);
        }
        for (const c of world.colliders)
          if (!c.destroyed && c.box.distanceToPoint(p) < 8) destruct(c, 150, p);
      } else if (g.kind === "smoke") {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({
            color: 0xaeb7b5,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
          }),
        );
        mesh.position.copy(p).add(new THREE.Vector3(0, 2, 0));
        mesh.scale.set(6, 4, 6);
        scene.add(mesh);
        smokeAreas.push({ position: mesh.position.clone(), life: 15, mesh });
      } else {
        audio.explosion(player.position.distanceTo(p));
        if (
          player.position.distanceTo(p) < 22 &&
          !segmentBlocked(
            p,
            player.position
              .clone()
              .add(
                new THREE.Vector3(
                  0,
                  prone ? 0.5 : player.crouched ? 1 : 1.5,
                  0,
                ),
              ),
            world.colliders,
          )
        )
          flashTime = 2.8;
        for (const a of actors)
          if (
            a.id &&
            a.alive &&
            a.position.distanceTo(p) < 24 &&
            !segmentBlocked(
              p,
              a.position
                .clone()
                .add(new THREE.Vector3(0, a.crouched ? 1 : 1.5, 0)),
              world.colliders,
            )
          )
            botCooldown.set(a.id, 4);
      }
      scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      (g.mesh.material as THREE.Material).dispose();
    }
    let airdrop: {
      mesh: THREE.Group;
      canopy: THREE.Group;
      position: THREE.Vector3;
    } | null = null;
    function dropAirdrop() {
      const z = zoneAt(combatTime),
        angle = random() * Math.PI * 2,
        r = random() * z.radius * 0.65;
      const position = new THREE.Vector3(
        Math.cos(angle) * r,
        95,
        Math.sin(angle) * r,
      );
      const mesh = createLoot("chest", "legendary", "lmg"),
        canopy = createParachute();
      mesh.add(canopy);
      scene.add(mesh);
      airdrop = { mesh, canopy, position };
      announce("YARDIM PAKETİ · Paraşütle inen sandığı takip et.", 6);
    }
    function nearestLoot() {
      let nearest: Loot | undefined,
        dist = 3.7;
      for (const item of loot) {
        if (item.taken) continue;
        const d = player.position.distanceTo(item.position);
        if (d < dist) {
          dist = d;
          nearest = item;
        }
      }
      return nearest;
    }
    function land() {
      phase = "combat";
      onGround = true;
      vertical = 0;
      parachute.visible = false;
      announce("İniş tamamlandı · Ekipman topla, alanı takip et.", 6);
      for (const [dx, dz, kind, weapon] of [
        [2, 1, "weapon", "m4"],
        [-2, 1, "armor", undefined],
        [0, -2, "ammo", undefined],
      ] as [number, number, Loot["kind"], WeaponId | undefined][]) {
        const p = player.position.clone().add(new THREE.Vector3(dx, 0, dz));
        if (!blocked(p, 0.4, 1)) addLoot(p, kind, weapon, "rare");
      }
    }
    function jumpFromPlane() {
      if (phase !== "plane") return;
      phase = "drop";
      parachute.visible = true;
      playerRig.root.visible = true;
      plane.visible = true;
      vertical = -8;
      announce("PARAŞÜT AÇIK · WASD ile iniş yönünü seç.", 8);
    }
    function capturePointer() {
      audio.unlock();
      if (phase === "victory" || phase === "defeated") return;
      canvas.focus({ preventScroll: true });
      paused = false;
      if (!matchMedia("(pointer: coarse)").matches)
        try {
          const result = canvas.requestPointerLock();
          if (result) result.catch(() => undefined);
        } catch {
          /* Touch and pointer-lock-denied environments still support drag-to-look. */
        }
    }
    function command(action: GameCommand) {
      if (action === "pause") {
        paused = !paused;
        mouseFire = false;
        mouseAim = false;
        clearInput();
        if (paused && document.pointerLockElement === canvas)
          document.exitPointerLock();
        return;
      }
      if (paused || phase === "victory" || phase === "defeated") return;
      audio.unlock();
      if (traversal.active() && !["interact", "shoulder"].includes(action))
        return;
      if (action === "jump") {
        if (phase === "plane") {
          jumpFromPlane();
          return;
        }
        if (phase === "combat" && onGround) {
          prone = false;
          player.crouched = false;
          vertical = 7.2;
          onGround = false;
          const ahead = player.position
            .clone()
            .add(
              new THREE.Vector3(-Math.sin(yaw) * 1.5, 0, -Math.cos(yaw) * 1.5),
            );
          const cover = world.colliders.find(
            (c) =>
              !c.destroyed &&
              c.box.distanceToPoint(ahead) < 0.7 &&
              c.box.max.y - player.position.y < 1.6 &&
              c.box.max.y > player.position.y + 0.3,
          );
          if (cover) {
            player.position.y = cover.box.max.y + 0.12;
            player.position.x = ahead.x;
            player.position.z = ahead.z;
            vertical = 3;
            announce("Engel aşıldı", 1);
          }
        }
      } else if (action === "interact") {
        if (phase === "plane") jumpFromPlane();
        else if (phase === "combat") {
          if (traversal.interact(player)) {
            velocity.set(0, 0, 0);
            vertical = 0;
            prone = false;
            player.crouched = false;
            reloadTime = 0;
            mouseFire = false;
            input.fire = false;
            playerRig.root.visible = traversal.active() !== "vehicle";
            return;
          }
          if (world.lockedPrompt(player.position)) {
            if (!hasKey)
              announce("Kilitli sığınak · Haritada altın anahtarı bul.");
            else if (world.unlockNearest(player.position)) {
              hasKey = false;
              announce("Sığınak açıldı · Değerli ekipmanlar içeride.");
            }
            return;
          }
          const item = nearestLoot();
          if (item) pickup(player, item);
        }
      } else if (action === "reload") beginReload(player);
      else if (action === "crouch") {
        player.crouched = !player.crouched;
        prone = false;
      } else if (action === "prone") {
        prone = !prone;
        player.crouched = false;
      } else if (
        action === "slide" &&
        onGround &&
        velocity.length() > 5 &&
        stamina > 20
      ) {
        slideTime = 0.8;
        stamina -= 20;
        player.crouched = true;
      } else if (action === "shoulder") shoulder *= -1;
      else if (action === "weapon" && inventory.length > 1) {
        syncInventory();
        slot = (slot + 1) % inventory.length;
        equip(inventory[slot]);
      } else if (action === "heal" && medkits > 0 && player.hp < 100) {
        medkits--;
        player.hp = Math.min(100, player.hp + 45);
        announce("Sağlık yenilendi");
      } else if (action === "grenade") throwGrenade();
      else if (action === "grenadeType")
        grenadeKind =
          grenadeKind === "frag"
            ? "smoke"
            : grenadeKind === "smoke"
              ? "flash"
              : "frag";
    }
    const commandKeys: Record<string, GameCommand> = {
      Space: "jump",
      KeyE: "interact",
      KeyR: "reload",
      KeyC: "crouch",
      KeyZ: "prone",
      ControlLeft: "slide",
      KeyQ: "shoulder",
      Digit1: "weapon",
      Digit2: "weapon",
      KeyH: "heal",
      KeyG: "grenade",
      KeyB: "grenadeType",
    };
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.matches("input,select,textarea,button"))
        return;
      if (e.code === "Escape") {
        if (!paused) command("pause");
        return;
      }
      if (
        e.code in commandKeys ||
        ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (!e.repeat && commandKeys[e.code]) command(commandKeys[e.code]);
      keys.add(e.code);
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.code);
    }
    function onMove(e: MouseEvent) {
      if (
        document.pointerLockElement === canvas ||
        (e.buttons !== 0 && e.target === canvas)
      ) {
        yaw -= e.movementX * 0.0022;
        pitch = THREE.MathUtils.clamp(
          pitch - e.movementY * 0.0022,
          -1.05,
          1.05,
        );
      }
    }
    function down(e: MouseEvent) {
      if (e.button === 2) {
        mouseAim = true;
        e.preventDefault();
      }
      if (e.button === 0) {
        mouseFire = true;
        capturePointer();
        // Sample press edges immediately: quick taps must not disappear between
        // slow rendered frames. Holding an automatic weapon continues in update.
        shootPlayer();
        lastFire = true;
      }
    }
    function up(e: MouseEvent) {
      if (e.button === 0) {
        mouseFire = false;
        lastFire = false;
      }
      if (e.button === 2) mouseAim = false;
    }
    function contextMenu(e: Event) {
      e.preventDefault();
    }
    function clearInput() {
      keys.clear();
      mouseFire = false;
      mouseAim = false;
      Object.assign(input, {
        x: 0,
        y: 0,
        fire: false,
        aim: false,
        sprint: false,
        lookX: 0,
        lookY: 0,
      });
    }
    function blur() {
      clearInput();
      if (phase === "plane" || phase === "combat" || phase === "drop")
        paused = true;
    }
    function visibility() {
      if (document.hidden) blur();
    }
    function lockChange() {
      if (document.pointerLockElement !== canvas) {
        clearInput();
        if (phase === "combat") paused = true;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", up);
    window.addEventListener("blur", blur);
    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("contextmenu", contextMenu);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", lockChange);
    // Rendering owns target resizing. Only invalidate the paused image here;
    // allocating its shadow/post-processing targets twice causes extra stalls.
    const resizeObserver = new ResizeObserver(() => {
      needsRender = true;
    });
    resizeObserver.observe(container);
    cleanupOnFailure.push(() => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("blur", blur);
      canvas.removeEventListener("mousedown", down);
      canvas.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerlockchange", lockChange);
    });

    function updatePlayer(dt: number) {
      yaw -= input.lookX * 0.003;
      pitch = THREE.MathUtils.clamp(pitch - input.lookY * 0.003, -1.05, 1.05);
      input.lookX = 0;
      input.lookY = 0;
      const previousHeading = player.yaw;
      if (!traversal.active()) player.yaw = yaw;
      aim =
        (mouseAim || input.aim) && phase === "combat" && !traversal.active();
      const dx =
        (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + input.x;
      const dz =
        (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0) + input.y;
      if (
        phase === "combat" &&
        traversal.update(dt, player, {
          forward: -dz,
          steer: dx,
          brake: keys.has("Space"),
        })
      ) {
        yaw += player.yaw - previousHeading;
        playerRig.root.visible = traversal.active() !== "vehicle";
        velocity.set(0, 0, 0);
        vertical = 0;
        onGround = false;
        emergencyChute = false;
        parachute.visible = false;
        stamina = Math.min(100, stamina + 12 * dt);
        return;
      }
      const direction = new THREE.Vector3(
        Math.cos(yaw) * dx + Math.sin(yaw) * dz,
        0,
        -Math.sin(yaw) * dx + Math.cos(yaw) * dz,
      );
      if (direction.length() > 1) direction.normalize();
      const sprint =
        (keys.has("ShiftLeft") || keys.has("ShiftRight") || input.sprint) &&
        stamina > 0 &&
        direction.length() > 0.2 &&
        !aim &&
        !prone;
      stamina = THREE.MathUtils.clamp(
        stamina + (sprint ? -19 : 12) * dt,
        0,
        100,
      );
      let speed = prone
        ? 1.6
        : player.crouched
          ? 2.8
          : aim
            ? 3.2
            : sprint
              ? 9.2
              : 5.5;
      slideTime = Math.max(0, slideTime - dt);
      if (slideTime > 0) {
        speed = 11;
        direction.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      }
      if (phase === "plane") {
        plane.position.set(-180 + elapsed * 18, 100, 32);
        plane.rotation.y = -Math.PI / 2;
        player.position.copy(plane.position);
        playerRig.root.visible = false;
        if (elapsed > 12) jumpFromPlane();
        return;
      }
      if (phase === "drop") {
        speed = 13;
        vertical = -9;
        parachute.visible = true;
      }
      const accel = 1 - Math.exp(-dt * (onGround ? 12 : 4));
      velocity.x = THREE.MathUtils.lerp(velocity.x, direction.x * speed, accel);
      velocity.z = THREE.MathUtils.lerp(velocity.z, direction.z * speed, accel);
      const before = player.position.clone(),
        height = prone ? 0.7 : player.crouched ? 1.25 : 1.8;
      player.position.x = THREE.MathUtils.clamp(
        player.position.x + velocity.x * dt,
        -MAP_SIZE / 2 + 3,
        MAP_SIZE / 2 - 3,
      );
      if (blocked(player.position, 0.36, height)) {
        player.position.x = before.x;
        velocity.x = 0;
      }
      player.position.z = THREE.MathUtils.clamp(
        player.position.z + velocity.z * dt,
        -MAP_SIZE / 2 + 3,
        MAP_SIZE / 2 - 3,
      );
      if (blocked(player.position, 0.36, height)) {
        player.position.z = before.z;
        velocity.z = 0;
      }
      const ground = support(player.position, before.y);
      if (phase !== "drop") {
        const fall = advanceFall(
          vertical,
          dt,
          player.position.y - ground,
          emergencyChute,
        );
        vertical = fall.velocity;
        emergencyChute = fall.parachute;
      }
      player.position.y += vertical * dt;
      // Sweep the head against ceilings; an upward jump must not pass through a roof.
      if (vertical > 0) {
        for (const c of world.colliders) {
          if (c.destroyed || before.y + height > c.box.min.y + 0.02) continue;
          if (
            player.position.x + 0.36 <= c.box.min.x ||
            player.position.x - 0.36 >= c.box.max.x ||
            player.position.z + 0.36 <= c.box.min.z ||
            player.position.z - 0.36 >= c.box.max.z
          )
            continue;
          if (player.position.y + height >= c.box.min.y) {
            player.position.y = c.box.min.y - height - 0.01;
            vertical = 0;
          }
        }
      }
      if (player.position.y <= ground) {
        player.position.y = ground;
        if (phase === "drop") land();
        onGround = true;
        vertical = 0;
        emergencyChute = false;
      } else onGround = false;
      if (phase !== "drop") parachute.visible = emergencyChute;
      player.speed = Math.hypot(velocity.x, velocity.z);
      stepClock -= dt;
      if (onGround && player.speed > 1 && stepClock <= 0) {
        const surface: Surface = world.locations.some(
          (l) =>
            Math.hypot(l.x - player.position.x, l.z - player.position.z) <
            l.radius * 0.65,
        )
          ? "stone"
          : "soil";
        audio.step(surface, sprint);
        stepClock = sprint ? 0.29 : 0.43;
      }
      cooldown = Math.max(0, cooldown - dt);
      if (reloadTime > 0) {
        reloadTime = Math.max(0, reloadTime - dt);
        if (reloadTime === 0)
          Object.assign(
            player,
            reloadMagazine(player.ammo, player.reserve, capacity(player)),
          );
      }
      const firing = mouseFire || input.fire;
      if (firing && (WEAPONS[player.weapon].automatic || !lastFire))
        shootPlayer();
      lastFire = firing;
    }
    function updateCamera(dt: number) {
      const eye = player.position
        .clone()
        .add(
          new THREE.Vector3(0, prone ? 0.8 : player.crouched ? 1.45 : 1.9, 0),
        );
      const forward = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      let desired = eye
        .clone()
        .addScaledVector(
          forward,
          phase === "plane"
            ? -24
            : traversal.active() === "vehicle"
              ? -9
              : aim
                ? -1.8
                : -5.6,
        )
        .addScaledVector(
          right,
          phase === "plane" ? 15 : shoulder * (aim ? 0.5 : 1.05),
        );
      if (phase === "plane") {
        desired.y += 11;
        camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
        camera.lookAt(
          player.position.clone().add(new THREE.Vector3(30, -25, -35)),
        );
      } else if (
        phase === "defeated" &&
        elapsed - endTime < 4 &&
        history.length
      ) {
        replayClock += dt;
        const sample =
          history.find((f) => f.time >= replayClock) ??
          history[history.length - 1];
        for (const a of sample.actors) {
          const rig = rigs.get(a.id);
          if (rig) {
            rig.root.position.copy(a.position);
            rig.root.rotation.set(0, a.yaw, 0);
            rig.root.visible = a.alive;
          }
        }
        const killer = sample.actors.find((a) => a.id === killerId),
          victim = sample.actors[0];
        if (killer && victim) {
          desired = killer.position
            .clone()
            .add(
              new THREE.Vector3(
                Math.sin(killer.yaw) * 4,
                2.4,
                Math.cos(killer.yaw) * 4,
              ),
            );
          camera.position.lerp(desired, 1 - Math.exp(-dt * 8));
          camera.lookAt(
            victim.position.clone().add(new THREE.Vector3(0, 1, 0)),
          );
        } else camera.lookAt(eye);
      } else {
        const dir = desired.clone().sub(eye),
          distance = dir.length();
        raycaster.set(eye, dir.normalize());
        let nearest = distance;
        for (const c of world.colliders) {
          if (c.destroyed || c === traversal.occupiedCollider()) continue;
          const p = raycaster.ray.intersectBox(c.box, new THREE.Vector3());
          if (p && p.distanceTo(eye) < nearest) {
            nearest = p.distanceTo(eye);
            desired = eye
              .clone()
              .addScaledVector(dir, Math.max(0.25, nearest - 0.2));
          }
        }
        camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
        camera.lookAt(eye.clone().addScaledVector(forward, 120));
      }
      const fov = aim
        ? player.weapon === "sniper"
          ? 25
          : attachments.has("scope")
            ? 36
            : 48
        : 68;
      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        fov,
        1 - Math.exp(-dt * 12),
      );
      camera.updateProjectionMatrix();
    }
    function emitHud() {
      const zone = zoneAt(combatTime),
        near = nearestLoot();
      prompt =
        phase === "plane"
          ? "E · Uçaktan atla"
          : traversal.prompt(player) ||
            world.lockedPrompt(player.position) ||
            (near
              ? `E · ${near.kind === "weapon" ? WEAPONS[near.weapon ?? "pistol"].name : near.kind === "chest" ? "Sandığı aç" : near.kind === "armor" ? "Zırh al" : near.kind === "medkit" ? "Sağlık çantası" : near.kind === "ammo" ? "Mühimmat al" : near.kind === "key" ? "Anahtarı al" : "Eklentiyi tak"}`
              : "");
      const width = container.clientWidth,
        height = container.clientHeight;
      const damageLabels = labels.map((l) => {
        const p = l.position.clone().project(camera);
        return {
          id: l.id,
          x: (p.x * 0.5 + 0.5) * width,
          y: (-p.y * 0.5 + 0.5) * height,
          value: l.value,
          headshot: l.headshot,
        };
      });
      const location =
        world.locations.find(
          (l) =>
            Math.hypot(player.position.x - l.x, player.position.z - l.z) <
            l.radius,
        )?.name ?? "Vahşi arazi";
      const state: HudState = {
        phase,
        hp: Math.ceil(player.hp),
        armor: Math.ceil(player.armor),
        stamina: Math.round(stamina),
        ammo: player.ammo,
        reserve: player.reserve,
        weapon: WEAPONS[player.weapon].name,
        weaponId: player.weapon,
        rarity: inventory[slot].rarity,
        kills,
        alive: actors.filter((a) => a.alive).length,
        fps: Math.round(fps),
        zone,
        heading: ((-THREE.MathUtils.radToDeg(yaw) % 360) + 360) % 360,
        location,
        elapsed: combatTime,
        prompt,
        notice: noticeTime > 0 ? notice : "",
        reloading: reloadTime ? reloadTime / reloadTotal : 0,
        hit,
        damageDirection: damageTimer > 0 ? damageDirection : null,
        aiming: aim,
        parachute: parachute.visible,
        locked: document.pointerLockElement === canvas,
        paused,
        weather,
        attachments: [...attachments],
        grenades: grenadeCount,
        grenadeType:
          grenadeKind === "frag"
            ? "El bombası"
            : grenadeKind === "smoke"
              ? "Sis bombası"
              : "Flaş bombası",
        medkits,
        damageLabels,
        feed: [...feed],
        playerX: player.position.x,
        playerZ: player.position.z,
        killer: killerName,
        replay: phase === "defeated" && elapsed - endTime < 4,
      };
      onHud(state);
      container.dataset.phase = phase;
      container.dataset.ready = "true";
    }
    function tick(now: number) {
      if (disposed) return;
      const raw = (now - lastTime) / 1000;
      lastTime = now;
      const pauseChanged = paused !== renderedPaused;
      // A paused world is a still image. Keep its last frame instead of drawing
      // shadows, water reflections and post-processing behind the settings UI.
      // Resize and quality changes request one fresh frame without advancing time.
      if (paused && !needsRender && !pauseChanged) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const frameDelta = Math.min(0.25, Math.max(0.001, raw));
      fpsFrames++;
      fpsElapsed += Math.max(0, raw);
      if (fpsElapsed >= 0.5) {
        fps = fpsFrames / fpsElapsed;
        fpsFrames = 0;
        fpsElapsed = 0;
      }
      const steps = Math.ceil(frameDelta / 0.05);
      const dt = frameDelta / steps;
      for (let step = 0; step < steps && !paused; step++) {
        elapsed += dt;
        noticeTime -= dt;
        hit = Math.max(0, hit - dt * 5);
        recoil = Math.max(0, recoil - dt * 8);
        damageTimer -= dt;
        flashTime = Math.max(0, flashTime - dt);
        if (player.alive && phase !== "victory") updatePlayer(dt);
        if (phase === "combat") {
          combatTime += dt;
          weather = (["clear", "rain", "fog", "storm"] as Weather[])[
            Math.floor(combatTime / 85) % 4
          ];
          const zone = zoneAt(combatTime);
          zoneMesh.scale.set(zone.radius, 1, zone.radius);
          zoneMesh.position.set(zone.x, 30, zone.z);
          ring.scale.setScalar(zone.radius);
          ring.position.set(zone.x, 0.45, zone.z);
          for (const a of actors) {
            if (!a.alive) continue;
            const damage = zoneDamage(zone, a.position.x, a.position.z, dt);
            if (damage) hitActor(a, damage, null);
          }
          for (const [id, t] of botCooldown)
            botCooldown.set(id, Math.max(0, t - dt));
          for (const [id, t] of botReload) {
            if (t <= dt) {
              const a = actors[id];
              Object.assign(a, reloadMagazine(a.ammo, a.reserve, capacity(a)));
              botReload.delete(id);
            } else botReload.set(id, t - dt);
          }
          for (let i = 0; i < brains.length; i++) {
            const a = actors[i + 1];
            if (!a.alive) continue;
            brains[i].update(dt, {
              actors,
              loot,
              colliders: world.colliders,
              zone,
              heightAt: world.heightAt,
              time: combatTime,
              shoot: botShoot,
              pickup,
              reload: beginReload,
              heal: (who) => {
                if (
                  (botHeal.get(who.id) ?? 0) > combatTime ||
                  (botMedkits.get(who.id) ?? 0) <= 0
                )
                  return;
                botMedkits.set(who.id, (botMedkits.get(who.id) ?? 0) - 1);
                who.hp = Math.min(100, who.hp + 35);
                botHeal.set(who.id, combatTime + 18);
              },
            });
          }
          airdropClock -= dt;
          if (airdropClock <= 0 && !airdrop) {
            dropAirdrop();
            airdropClock = 85;
          }
          const outcome = matchOutcome(
            player.alive,
            actors.slice(1).filter((a) => a.alive).length,
          );
          if (outcome !== "combat") finish(outcome);
          snapshotClock -= dt;
          if (snapshotClock <= 0) {
            snapshotClock = 0.1;
            history.push({
              time: elapsed,
              actors: actors.map((a) => ({
                id: a.id,
                position: a.position.clone(),
                yaw: a.yaw,
                alive: a.alive,
              })),
            });
            while (history.length > 55) history.shift();
          }
        }
        for (const a of actors) {
          if (!a.alive) continue;
          const rig = rigs.get(a.id)!;
          rig.root.position.copy(a.position);
          rig.root.rotation.y = a.yaw;
          rig.update(dt, {
            speed: a.speed,
            aim: a.id === 0 ? aim : false,
            crouch: a.crouched,
            prone: a.id === 0 && prone,
            reload:
              a.id === 0
                ? reloadTime / reloadTotal || 0
                : botReload.has(a.id)
                  ? 0.5
                  : 0,
            recoil:
              a.id === 0
                ? recoil
                : (botCooldown.get(a.id) ?? 0) > 0.05
                  ? 0.5
                  : 0,
            airborne: a.id === 0 && !onGround,
          });
        }
        plane.position.x += dt * 20;
        if (plane.position.x > 450) plane.visible = false;
        for (const item of loot) {
          const mesh = lootMeshes.get(item.id);
          if (!mesh || item.taken || item.kind === "chest") continue;
          mesh.rotation.y += dt * 0.5;
          mesh.position.y =
            item.position.y + Math.sin(elapsed * 2 + item.id) * 0.08;
          mesh.visible =
            player.position.distanceToSquared(item.position) < 160 * 160;
        }
        if (airdrop) {
          airdrop.position.y -= dt * 6;
          airdrop.mesh.position.copy(airdrop.position);
          const ground = world.heightAt(airdrop.position.x, airdrop.position.z);
          if (airdrop.position.y <= ground + 0.3) {
            const p = airdrop.position.clone();
            scene.remove(airdrop.mesh);
            addLoot(p, "chest", "lmg", "legendary");
            airdrop = null;
          }
        }
        for (let i = grenades.length - 1; i >= 0; i--) {
          const g = grenades[i];
          g.timer -= dt;
          g.velocity.y -= 15 * dt;
          const before = g.mesh.position.clone();
          g.mesh.position.addScaledVector(g.velocity, dt);
          const ground =
            world.heightAt(g.mesh.position.x, g.mesh.position.z) + 0.15;
          if (g.mesh.position.y < ground) {
            g.mesh.position.y = ground;
            g.velocity.y = Math.abs(g.velocity.y) * 0.35;
            g.velocity.x *= 0.65;
            g.velocity.z *= 0.65;
          }
          if (blocked(g.mesh.position, 0.1, 0.2)) {
            g.mesh.position.copy(before);
            g.velocity.x *= -0.4;
            g.velocity.z *= -0.4;
          }
          if (g.timer <= 0) {
            detonate(g);
            grenades.splice(i, 1);
          }
        }
        for (let i = smokeAreas.length - 1; i >= 0; i--) {
          const s = smokeAreas[i];
          s.life -= dt;
          (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
            0.65,
            s.life / 4,
          );
          if (s.life <= 0) {
            scene.remove(s.mesh);
            s.mesh.geometry.dispose();
            (s.mesh.material as THREE.Material).dispose();
            smokeAreas.splice(i, 1);
          }
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life -= dt;
          p.mesh.position.addScaledVector(p.velocity, dt);
          if (p.kind === "casing" || p.kind === "spark")
            p.velocity.y -= 10 * dt;
          if (p.kind === "smoke") p.mesh.scale.multiplyScalar(1 + dt * 2);
          if (p.life <= 0) {
            scene.remove(p.mesh);
            if (p.kind === "trace") (p.mesh as THREE.Line).geometry.dispose();
            particles.splice(i, 1);
          }
        }
        for (let i = labels.length - 1; i >= 0; i--) {
          labels[i].life -= dt;
          labels[i].position.y += dt * 0.45;
          if (labels[i].life <= 0) labels.splice(i, 1);
        }
        flashLight.intensity *= Math.exp(-dt * 22);
        world.update(dt, elapsed, player.position, weather);
        audio.ambient(weather);
      }
      updateCamera(paused ? 0 : frameDelta);
      rendering.render(
        paused ? 0 : frameDelta,
        elapsed,
        player.position,
        weather,
      );
      needsRender = false;
      renderedPaused = paused;
      container.style.setProperty(
        "--flash-opacity",
        String(Math.min(0.9, flashTime / 2)),
      );
      hudClock -= frameDelta;
      if (hudClock <= 0 || pauseChanged) {
        hudClock = 0.1;
        emitHud();
      }
      frame = requestAnimationFrame(tick);
    }
    camera.position.copy(player.position).add(new THREE.Vector3(15, 12, 25));
    rendering.resize();
    emitHud();
    frame = requestAnimationFrame(tick);
    // Read-only snapshots make browser smoke checks observable without providing
    // production cheats or mutable hooks into the simulation.
    if (process.env.NODE_ENV !== "production")
      Object.defineProperty(container, "battleSnapshot", {
        configurable: true,
        value: () => ({
          phase,
          paused,
          traversal: traversal.active(),
          elapsed: combatTime,
          aiming: aim,
          grenades: grenadeCount,
          stamina,
          fps,
          player: {
            position: player.position.toArray(),
            hp: player.hp,
            weapon: player.weapon,
            ammo: player.ammo,
          },
          bots: actors.slice(1).map((a) => ({
            id: a.id,
            hp: a.hp,
            position: a.position.toArray(),
          })),
          loot: loot
            .filter((l) => !l.taken)
            .map((l) => ({ kind: l.kind, position: l.position.toArray() })),
          drawCalls: rendering.renderer.info.render.calls,
          triangles: rendering.renderer.info.render.triangles,
        }),
      });
    return {
      command,
      touch(value) {
        if (value.fire && !input.fire) {
          shootPlayer();
          lastFire = true;
        } else if (value.fire === false) lastFire = false;
        if (value.lookX) input.lookX += value.lookX;
        if (value.lookY) input.lookY += value.lookY;
        const { lookX: _x, lookY: _y, ...rest } = value;
        Object.assign(input, rest);
      },
      setQuality(q) {
        quality = q;
        rendering.setQuality(q);
        world.setQuality(q);
        needsRender = true;
      },
      setDifficulty(d) {
        difficulty = d;
        brains.forEach((b) => b.setDifficulty(d));
      },
      setVolume(v) {
        audio.setVolume(v);
      },
      capturePointer,
      dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("blur", blur);
        canvas.removeEventListener("mousedown", down);
        canvas.removeEventListener("contextmenu", contextMenu);
        document.removeEventListener("visibilitychange", visibility);
        document.removeEventListener("pointerlockchange", lockChange);
        audio.dispose();
        traversal.dispose();
        world.dispose();
        rigs.forEach((r) => r.dispose());
        disposeModels();
        const geometries = new Set<THREE.BufferGeometry>(),
          materials = new Set<THREE.Material>();
        scene.traverse((o) => {
          if (
            o instanceof THREE.Mesh ||
            o instanceof THREE.Line ||
            o instanceof THREE.Points
          ) {
            geometries.add(o.geometry);
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              materials.add(m);
          }
        });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        rendering.dispose();
        delete (container as HTMLElement & { battleSnapshot?: unknown })
          .battleSnapshot;
        delete container.dataset.ready;
      },
    };
  } catch (error) {
    for (const cleanup of cleanupOnFailure.reverse()) {
      try {
        cleanup();
      } catch {
        /* Continue releasing the other owners. */
      }
    }
    scene.traverse((object) => {
      if (
        !(
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.Points
        )
      )
        return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
    disposeModels();
    delete container.dataset.ready;
    throw error;
  }
}
