import * as THREE from "three";
import type { Army, UnitType } from "./types";
import type { GraphicsQuality } from "./map3d-visuals";
import { createCombatLighting } from "./map3d-combat-lighting";
import {
  createLandModelGeometry,
  landModelGeometryKey,
  LAND_MODEL_PART_NAMES,
  INFANTRY_NECK_PIVOT,
} from "./map3d-land-models";
import {
  getCountryModelProfile,
  type NationalModelProfile,
} from "./map3d-national-profiles";
import type {
  UnitVisualResearch,
  VisualResearchTier,
} from "./map3d-unit-research";
import { createLandMaterial } from "./map3d-land-material";

/** Original procedural miniatures. Presentation scale is independent of troop strength. */
export const UNIT_MODEL_SCALE = 2.45;
export const UNIT_LABEL_HEIGHT = 13;
export const MAX_UNIT_MINIATURES = 3072;
export const MAX_UNIT_EFFECTS = 128;
/** Idle geometry survives nearby pans, while distant historical views are evicted. */
export const MAX_IDLE_UNIT_MODEL_PARTS = 64;
export const MAX_IDLE_UNIT_MODEL_VERTICES = 180000;
export const MAX_IDLE_UNIT_MODEL_CAPACITY = 4096;
export const UNIT_MODEL_BUFFER_SHRINK_DELAY = 30;
export type UnitDisplayKind = "infantry" | "tank" | "artillery" | "truck";
export const UNIT_MODEL_FOOTPRINTS = {
  infantry: { halfWidth: 2.5, front: 2.8, rear: 2 },
  tank: { halfWidth: 5.1, front: 5.8, rear: 5.8 },
  artillery: { halfWidth: 3.05, front: 1.3, rear: 6.9 },
  truck: { halfWidth: 3.3, front: 6.8, rear: 6.6 },
} as const;
const INFANTRY_SLOT = { kind: "infantry", x: 5.3, z: -5.7 } as const;
const TANK_SLOT = { kind: "tank", x: 5.3, z: 4.3 } as const;
const ARTILLERY_SLOT = { kind: "artillery", x: -5.3, z: 4.3 } as const;
const TRUCK_SLOT = { kind: "truck", x: -5.3, z: -9.7 } as const;
const UNIT_KIND: Record<UnitType, UnitDisplayKind> = {
  infantry: "infantry",
  special: "infantry",
  mountain: "infantry",
  paratrooper: "infantry",
  lightTank: "tank",
  mediumTank: "tank",
  heavyTank: "tank",
  artillery: "artillery",
  motorized: "truck",
  mechanized: "truck",
};
const UNIT_KIND_MASK: Record<UnitDisplayKind, number> = {
  infantry: 1,
  tank: 2,
  artillery: 4,
  truck: 8,
};
/** Shared footprint templates; scenery reserves the largest four-family space. */
export const UNIT_DISPLAY_LAYOUTS = {
  1: [INFANTRY_SLOT],
  2: [TANK_SLOT, INFANTRY_SLOT],
  3: [ARTILLERY_SLOT, INFANTRY_SLOT, TANK_SLOT],
  4: [TRUCK_SLOT, INFANTRY_SLOT, ARTILLERY_SLOT, TANK_SLOT],
} as const;
/** Fixed slots retain visual continuity when another real type joins the stack. */
const TYPED_UNIT_LAYOUTS: readonly (readonly {
  kind: UnitDisplayKind;
  x: number;
  z: number;
}[])[] = Array.from({ length: 16 }, (_, mask) => {
  if (!mask) return [];
  const lead =
    mask & 8
      ? TRUCK_SLOT
      : mask & 4
        ? ARTILLERY_SLOT
        : mask & 2
          ? TANK_SLOT
          : INFANTRY_SLOT;
  return [
    lead,
    ...[INFANTRY_SLOT, ARTILLERY_SLOT, TANK_SLOT].filter(
      (slot) => slot !== lead && (mask & UNIT_KIND_MASK[slot.kind]) !== 0,
    ),
  ];
});
export function unitDisplayKind(type: UnitType): UnitDisplayKind {
  return UNIT_KIND[type] ?? "infantry";
}
/** One representative per actual family, never invented vehicles from headcount.
 * All sixteen layouts are shared: scanning the visible stack allocates no arrays.
 */
export function unitDisplayLayout(armies: readonly Pick<Army, "type">[]) {
  let mask = 0;
  for (const army of armies) {
    mask |= UNIT_KIND_MASK[unitDisplayKind(army.type)];
    if (mask === 15) break;
  }
  return TYPED_UNIT_LAYOUTS[mask];
}
export interface UnitFormation {
  armies: readonly Army[];
  position: THREE.Vector3;
  angle: number;
  moving: boolean;
  tint: number;
  visual?: UnitVisualResearch;
  combat?: { key: string; target: THREE.Vector3 };
  capture?: { key: string; progress: number };
}
export interface UnitModelOptions {
  quality: GraphicsQuality;
  paused?: boolean;
  reduced?: boolean;
  distance: number;
}
export interface UnitModelStats {
  infantry: number;
  vehicles: number;
  instances: number;
  detail: boolean;
  tanks: number;
  artillery: number;
  trucks: number;
  combatFormations: number;
  muzzleFlashes: number;
  infantryTracers: number;
  tankShells: number;
  shells: number;
  impacts: number;
  captures: number;
  glows: number;
  groundGlows: number;
  dynamicLights: number;
  headlights: number;
  idleHeads: number;
  idleAnimating: boolean;
  headYawSamples: { id: string; tier: VisualResearchTier; yaw: number }[];
  modelVariants: Record<UnitDisplayKind, number[]>;
  modelBanks: number;
  modelCapacity: number;
  modelParts: number;
  modelVertices: number;
  modelIdleParts: number;
  modelIdleVertices: number;
  modelIdleCapacity: number;
  modelProfiles: Record<string, number>;
}

const TANK_WHEEL_Z = [-1.72, -0.86, 0, 0.86, 1.72] as const;
const TRUCK_WHEEL_Z = [-1.65, -0.7, 1.55] as const;
const BATCH_NAMES = LAND_MODEL_PART_NAMES;

/** Display symbols and effects consume actual event descriptors, never simulate damage. */
export function createUnitModels(
  scene: THREE.Scene,
  heightAtWorld?: (x: number, z: number) => number,
) {
  const material = createLandMaterial();
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  type PartBatch = {
    key: string;
    part: number;
    tier: VisualResearchTier;
    profile?: NationalModelProfile;
    mesh: THREE.InstancedMesh;
    count: number;
    need: number;
    lastUsed: number;
    underusedUpdates: number;
  };
  type Bank = {
    tier: VisualResearchTier;
    profile?: NationalModelProfile;
    needs: Uint32Array;
    parts: (PartBatch | undefined)[];
  };
  const parts = new Map<string, PartBatch>();
  const requested = new Map<string, Bank>();
  const profileFor = (formation: UnitFormation) => {
    const profile = getCountryModelProfile(
      formation.visual?.profile ?? formation.armies[0]?.country,
    );
    return profile.id === "default" ? undefined : profile;
  };
  const bankKey = (tier: VisualResearchTier, profile?: NationalModelProfile) =>
    `${profile?.id ?? "default"}:${tier}`;
  const requestBank = (
    tier: VisualResearchTier,
    profile?: NationalModelProfile,
  ): Bank => {
    const key = bankKey(tier, profile);
    let bank = requested.get(key);
    if (!bank) {
      bank = {
        tier,
        profile,
        needs: new Uint32Array(BATCH_NAMES.length),
        parts: [],
      };
      requested.set(key, bank);
    }
    return bank;
  };
  const makeBatch = (
    geometry: THREE.BufferGeometry,
    tier: VisualResearchTier,
    part: number,
    capacity: number,
    profile?: NationalModelProfile,
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `unit-${BATCH_NAMES[part]}${tier ? `-tier-${tier}` : ""}${profile ? `-${profile.id}` : ""}`;
    mesh.userData.unitModel = {
      part,
      tier,
      profile: profile?.id ?? "default",
      key: landModelGeometryKey(part, tier, profile),
    };
    mesh.count = 0;
    mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(
      "unitUniform",
      new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const removePart = (part: PartBatch) => {
    scene.remove(part.mesh);
    part.mesh.visible = false;
    part.mesh.count = 0;
    part.mesh.dispose();
    part.mesh.geometry.dispose();
    parts.delete(part.key);
  };
  const capacityFor = (need: number) =>
    2 ** Math.ceil(Math.log2(Math.max(8, need)));
  const reserveParts = () => {
    for (const part of parts.values()) part.count = part.need = 0;
    for (const bank of requested.values()) {
      for (let index = 0; index < bank.needs.length; index++) {
        const need = bank.needs[index];
        if (!need) continue;
        const key = landModelGeometryKey(index, bank.tier, bank.profile);
        let part = parts.get(key);
        if (!part) {
          part = {
            key,
            part: index,
            tier: bank.tier,
            profile: bank.profile,
            mesh: makeBatch(
              createLandModelGeometry(index, bank.tier, bank.profile),
              bank.tier,
              index,
              capacityFor(need),
              bank.profile,
            ),
            count: 0,
            need: 0,
            lastUsed: frame,
            underusedUpdates: 0,
          };
          parts.set(key, part);
        }
        part.need += need;
        part.lastUsed = frame;
        bank.parts[index] = part;
      }
    }
    for (const part of parts.values()) {
      const old = part.mesh;
      const capacity = old.instanceMatrix.count;
      const target = capacityFor(part.need);
      const underused = part.need > 0 && capacity > Math.max(64, target * 4);
      const severelyUnderused =
        part.need > 0 && capacity > Math.max(256, target * 16);
      part.underusedUpdates = underused ? part.underusedUpdates + 1 : 0;
      if (
        part.need <= capacity &&
        !severelyUnderused &&
        part.underusedUpdates < UNIT_MODEL_BUFFER_SHRINK_DELAY
      )
        continue;
      // Reclaim severe army-to-sentry drops immediately: paused low-quality
      // views may not draw again. Moderate drops wait for sustained low demand
      // so small camera changes keep their buffers. Growth remains immediate.
      part.underusedUpdates = 0;
      // Each batch owns its instance attributes. Dispose old GPU storage only
      // after cloning the static shape into the next capacity bucket.
      const geometry = old.geometry.clone();
      scene.remove(old);
      old.visible = false;
      old.count = 0;
      old.dispose();
      old.geometry.dispose();
      part.mesh = makeBatch(
        geometry,
        part.tier,
        part.part,
        capacityFor(part.need),
        part.profile,
      );
    }
    const idle = [...parts.values()]
      .filter((part) => !part.need)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let idleCount = idle.length;
    let idleVertices = idle.reduce(
      (sum, part) => sum + part.mesh.geometry.getAttribute("position").count,
      0,
    );
    let idleCapacity = idle.reduce(
      (sum, part) => sum + part.mesh.instanceMatrix.count,
      0,
    );
    for (const part of idle) {
      if (
        idleCount <= MAX_IDLE_UNIT_MODEL_PARTS &&
        idleVertices <= MAX_IDLE_UNIT_MODEL_VERTICES &&
        idleCapacity <= MAX_IDLE_UNIT_MODEL_CAPACITY
      )
        break;
      idleCount--;
      idleVertices -= part.mesh.geometry.getAttribute("position").count;
      idleCapacity -= part.mesh.instanceMatrix.count;
      removePart(part);
    }
  };
  const tierFor = (
    formation: UnitFormation,
    kind: UnitDisplayKind,
  ): VisualResearchTier => {
    const value = formation.visual?.[kind];
    return value === 1 || value === 2 || value === 3 ? value : 0;
  };
  let currentBank: Bank;
  const uniform = new THREE.Color(0x666d49);
  const accentGeometry = new THREE.BoxGeometry(0.11, 0.18, 0.24);
  const accents = new THREE.InstancedMesh(
    accentGeometry,
    accentMaterial,
    MAX_UNIT_MINIATURES,
  );
  accents.name = "unit-country-patches";
  const flagGeometry = new THREE.PlaneGeometry(1.65, 1.02, 4, 1);
  flagGeometry.translate(0.87, 4.03, 0);
  const flags = new THREE.InstancedMesh(
    flagGeometry,
    accentMaterial,
    MAX_UNIT_EFFECTS,
  );
  flags.name = "unit-capture-flags";
  for (const mesh of [accents, flags]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(mesh.instanceMatrix.count * 3),
      3,
    );
    scene.add(mesh);
  }
  const lighting = createCombatLighting(scene, heightAtWorld);
  const flashGeometry = new THREE.IcosahedronGeometry(1, 0),
    tracerGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 5),
    shellGeometry = new THREE.CapsuleGeometry(0.16, 0.68, 2, 6),
    impactGeometry = new THREE.IcosahedronGeometry(1, 1);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd48a,
    transparent: true,
    opacity: 0.93,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe4a1,
    toneMapped: false,
  });
  const impactMaterial = new THREE.MeshBasicMaterial({
    color: 0xaaa18a,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const flashes = new THREE.InstancedMesh(
      flashGeometry,
      flashMaterial,
      MAX_UNIT_EFFECTS,
    ),
    tracers = new THREE.InstancedMesh(
      tracerGeometry,
      shellMaterial,
      MAX_UNIT_EFFECTS,
    ),
    tankShells = new THREE.InstancedMesh(
      shellGeometry,
      shellMaterial,
      MAX_UNIT_EFFECTS,
    ),
    shells = new THREE.InstancedMesh(
      shellGeometry,
      shellMaterial,
      MAX_UNIT_EFFECTS,
    ),
    impacts = new THREE.InstancedMesh(
      impactGeometry,
      impactMaterial,
      MAX_UNIT_EFFECTS,
    );
  flashes.name = "unit-muzzle-flashes";
  tracers.name = "unit-infantry-tracers";
  tankShells.name = "unit-tank-shells";
  shells.name = "unit-artillery-shells";
  impacts.name = "unit-shell-impacts";
  for (const mesh of [flashes, tracers, tankShells, shells, impacts]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
  }
  const overlayBatches = [
    accents,
    flags,
    flashes,
    tracers,
    tankShells,
    shells,
    impacts,
  ];
  const transform = new THREE.Object3D(),
    weaponMount = new THREE.Object3D(),
    parent = new THREE.Object3D(),
    color = new THREE.Color(),
    origin = new THREE.Vector3(),
    projectile = new THREE.Vector3(),
    destination = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const stats: UnitModelStats = {
    infantry: 0,
    vehicles: 0,
    instances: 0,
    detail: false,
    tanks: 0,
    artillery: 0,
    trucks: 0,
    combatFormations: 0,
    muzzleFlashes: 0,
    infantryTracers: 0,
    tankShells: 0,
    shells: 0,
    impacts: 0,
    captures: 0,
    glows: 0,
    groundGlows: 0,
    dynamicLights: 0,
    headlights: 0,
    idleHeads: 0,
    idleAnimating: false,
    headYawSamples: [],
    modelVariants: {
      infantry: [0, 0, 0, 0],
      tank: [0, 0, 0, 0],
      artillery: [0, 0, 0, 0],
      truck: [0, 0, 0, 0],
    },
    modelBanks: 0,
    modelCapacity: 0,
    modelParts: 0,
    modelVertices: 0,
    modelIdleParts: 0,
    modelIdleVertices: 0,
    modelIdleCapacity: 0,
    modelProfiles: {},
  };
  const captures = new Map<string, { progress: number; frame: number }>();
  const combats = new Map<
    string,
    { startedAt: number; repeatOffset: number; frame: number }
  >();
  const idleHeads = new Map<
    string,
    { yaw: number; phase: number; frame: number }
  >();
  const headTransform = new THREE.Object3D();
  let wasActive = false;
  let disposed = false,
    clock = 0,
    lastNow = -1,
    frame = 0,
    effectScale = 1;
  const put = (
    batch: number,
    x: number,
    y: number,
    z: number,
    pitch = 0,
    yaw = 0,
    scale = 1,
  ) => {
    const part = currentBank.parts[batch]!;
    const index = part.count++;
    transform.position.set(x, y, z);
    transform.rotation.set(pitch, yaw, 0);
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    transform.matrix.premultiply(parent.matrix);
    part.mesh.setMatrixAt(index, transform.matrix);
    const fabric = part.mesh.geometry.getAttribute(
      "unitUniform",
    ) as THREE.InstancedBufferAttribute;
    fabric.setXYZ(index, uniform.r, uniform.g, uniform.b);
  };
  const point = (x: number, y: number, z: number, yaw = 0) =>
    origin
      .set(
        x * Math.cos(yaw) + z * Math.sin(yaw),
        y,
        -x * Math.sin(yaw) + z * Math.cos(yaw),
      )
      .applyMatrix4(parent.matrix);
  const flashAtOrigin = (size: number) => {
    if (stats.muzzleFlashes >= MAX_UNIT_EFFECTS) return;
    transform.position.copy(origin);
    transform.rotation.set(clock * 7, clock * 11, clock * 13);
    transform.scale
      .set(size, size * 0.68, size * 1.4)
      .multiplyScalar(effectScale);
    transform.updateMatrix();
    flashes.setMatrixAt(stats.muzzleFlashes++, transform.matrix);
    lighting.emit(origin, size * effectScale * 5, 1.15, "muzzle");
  };
  const flash = (
    x: number,
    y: number,
    z: number,
    yaw: number,
    size: number,
  ) => {
    point(x, y, z, yaw);
    flashAtOrigin(size);
  };
  // Bounded, pooled projectiles make one/two-division battles readable too.
  // They are presentation only: all damage remains in the campaign simulation.
  const flight = (
    mesh: THREE.InstancedMesh,
    index: number,
    target: THREE.Vector3,
    t: number,
    arc: number,
    width: number,
    length: number,
    targetHeight = 0,
  ) => {
    destination.copy(target).y += targetHeight;
    projectile.lerpVectors(origin, destination, t);
    projectile.y += 4 * t * (1 - t) * arc;
    direction.subVectors(destination, origin);
    direction.y += 4 * (1 - 2 * t) * arc;
    direction.normalize();
    transform.position.copy(projectile);
    transform.quaternion.setFromUnitVectors(up, direction);
    transform.scale.set(width, length, width).multiplyScalar(effectScale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    lighting.emit(projectile, width * effectScale * 2.1, 0.8, "projectile");
  };
  const impact = (target: THREE.Vector3, t: number, size: number) => {
    if (stats.impacts >= MAX_UNIT_EFFECTS) return;
    transform.position.copy(target).y += 0.35 + t * 0.75;
    transform.rotation.set(0, clock, 0);
    transform.scale.set(size, 0.7 + t * 1.6, size).multiplyScalar(effectScale);
    transform.updateMatrix();
    impacts.setMatrixAt(stats.impacts++, transform.matrix);
    lighting.emit(
      transform.position,
      size * effectScale * 4,
      1.3 * (1 - t),
      "impact",
    );
  };
  return {
    get stats(): Readonly<UnitModelStats> {
      return stats;
    },
    update(
      formations: readonly UnitFormation[],
      now: number,
      options: UnitModelOptions,
    ) {
      if (disposed) return;
      const active = !options.paused && !options.reduced;
      const elapsed =
        lastNow >= 0 && wasActive && active
          ? Math.min(0.25, Math.max(0, now - lastNow) / 1000)
          : 0;
      clock += elapsed;
      lastNow = now;
      wasActive = active;
      frame++;
      lighting.begin(options.quality, options.distance);
      accents.count = 0;
      stats.infantry =
        stats.vehicles =
        stats.instances =
        stats.tanks =
        stats.artillery =
        stats.trucks =
        stats.combatFormations =
        stats.muzzleFlashes =
        stats.infantryTracers =
        stats.tankShells =
        stats.shells =
        stats.impacts =
        stats.captures =
          0;
      stats.detail = options.distance < (options.quality === "low" ? 340 : 720);
      stats.idleHeads = 0;
      stats.idleAnimating = false;
      stats.headYawSamples.length = 0;
      for (const counts of Object.values(stats.modelVariants)) counts.fill(0);
      requested.clear();
      stats.modelProfiles = {};
      let reserved = 0,
        poles = 0;
      for (const formation of formations) {
        const layout = unitDisplayLayout(formation.armies);
        if (!layout.length || reserved + layout.length > MAX_UNIT_MINIATURES)
          continue;
        reserved += layout.length;
        for (const slot of layout) {
          const need = requestBank(
            tierFor(formation, slot.kind),
            profileFor(formation),
          ).needs;
          if (slot.kind === "infantry") {
            need[0]++;
            need[1] += 2;
            need[13]++;
            if (stats.detail) {
              need[5]++;
              need[14]++;
            }
          } else if (slot.kind === "tank") {
            need[2]++;
            need[6]++;
            need[7]++;
            need[9] += 10;
            need[10] += 2;
          } else if (slot.kind === "artillery") {
            need[4]++;
            need[8]++;
            need[9] += 2;
          } else {
            need[3]++;
            need[9] += 6;
            if (formation.combat || formation.capture) need[11]++;
          }
        }
        if (
          formation.capture &&
          formation.capture.progress >= 0 &&
          formation.capture.progress < 1 &&
          poles++ < MAX_UNIT_EFFECTS
        )
          requestBank(0).needs[12]++;
      }
      reserveParts();
      effectScale = THREE.MathUtils.clamp(
        Number.isFinite(options.distance) ? options.distance / 420 : 1,
        1,
        2,
      );
      let models = 0;
      for (let f = 0; f < formations.length; f++) {
        const formation = formations[f],
          layout = unitDisplayLayout(formation.armies);
        if (!layout.length || models + layout.length > MAX_UNIT_MINIATURES)
          continue;
        const combat =
          formation.combat &&
          Number.isFinite(formation.combat.target.x) &&
          Number.isFinite(formation.combat.target.y) &&
          Number.isFinite(formation.combat.target.z)
            ? formation.combat
            : undefined;
        let combatElapsed = 0,
          battleOffset = 0;
        if (combat) {
          stats.combatFormations++;
          let timing = combats.get(combat.key);
          if (!timing) {
            let seed = 0;
            for (let k = 0; k < combat.key.length; k++)
              seed = (seed * 31 + combat.key.charCodeAt(k)) >>> 0;
            timing = {
              startedAt: clock,
              repeatOffset: (Math.imul(seed, 0x9e3779b1) >>> 0) / 0xffffffff,
              frame,
            };
            combats.set(combat.key, timing);
          }
          timing.frame = frame;
          // A short battle must fire immediately even when the map has been
          // running for hours at low FPS. Only later shot periods are staggered.
          combatElapsed = Math.max(0, clock - timing.startedAt);
          battleOffset = timing.repeatOffset;
        }
        let captureProgress = -1;
        if (
          formation.capture &&
          formation.capture.progress >= 0 &&
          formation.capture.progress < 1
        ) {
          let capture = captures.get(formation.capture.key);
          if (!capture) {
            capture = { progress: formation.capture.progress, frame };
            captures.set(formation.capture.key, capture);
          }
          if (!options.paused && !options.reduced)
            capture.progress = formation.capture.progress;
          capture.frame = frame;
          captureProgress = capture.progress;
        }
        const sin = Math.sin(formation.angle),
          cos = Math.cos(formation.angle);
        for (let i = 0; i < layout.length; i++, models++) {
          const slot = layout[i],
            kind = slot.kind;
          const tier = tierFor(formation, kind);
          const profile = profileFor(formation);
          currentBank = requested.get(bankKey(tier, profile))!;
          const profileId = profile?.id ?? "default";
          stats.modelProfiles[profileId] =
            (stats.modelProfiles[profileId] ?? 0) + 1;
          uniform.setHex(
            Number.isFinite(formation.visual?.uniform)
              ? formation.visual!.uniform
              : 0x666d49,
          );
          stats.modelVariants[kind][tier]++;
          parent.position.set(
            formation.position.x + slot.x * cos + slot.z * sin,
            formation.position.y,
            formation.position.z - slot.x * sin + slot.z * cos,
          );
          if (heightAtWorld)
            parent.position.y = heightAtWorld(
              parent.position.x,
              parent.position.z,
            );
          let modelAngle = formation.angle;
          if (combat && (kind === "infantry" || kind === "artillery"))
            modelAngle = Math.atan2(
              combat.target.x - parent.position.x,
              combat.target.z - parent.position.z,
            );
          const rally =
            captureProgress >= 0 ? Math.sin(captureProgress * Math.PI) : 0;
          parent.rotation.set(0, modelAngle, 0);
          parent.scale.setScalar(UNIT_MODEL_SCALE);
          parent.updateMatrix();
          const walk = formation.moving
            ? Math.sin(clock * 7.8 + f * 0.6 + i * 1.3)
            : 0;
          let badgeX = 0.93,
            badgeY = 2.92,
            badgeZ = 0.05,
            badgeYaw = 0,
            badgeScale = 1;
          if (kind === "infantry") {
            const shot = combatElapsed % (1.2 + battleOffset * 0.18),
              kick = combat ? Math.max(0, 1 - shot / 0.34) * 0.25 : 0;
            const bob =
              Math.abs(walk) * 0.055 + rally * Math.sin(clock * 9) * 0.04;
            const stance = combat ? -0.18 : 0,
              pitch = (combat ? 0.045 : 0) - kick * 0.22;
            put(0, 0, bob + stance, -kick, pitch);
            put(
              1,
              -0.36,
              1.67,
              combat ? 0.12 : 0,
              walk * 0.37 + rally * 0.08 + (combat ? -0.13 : 0),
            );
            put(
              1,
              0.36,
              1.67,
              combat ? -0.16 : 0,
              -walk * 0.37 - rally * 0.08 + (combat ? 0.13 : 0),
            );
            if (stats.detail) put(5, 0, bob + stance, -kick, pitch);
            const identity =
              formation.armies.find(
                (army) => unitDisplayKind(army.type) === "infantry",
              )?.id ?? `formation-${f}`;
            let idle = idleHeads.get(identity);
            if (!idle) {
              let hash = 2166136261;
              for (let c = 0; c < identity.length; c++)
                hash = Math.imul(hash ^ identity.charCodeAt(c), 16777619);
              idle = {
                yaw: 0,
                phase: ((hash >>> 0) / 0xffffffff) * Math.PI * 2,
                frame,
              };
              idleHeads.set(identity, idle);
            }
            idle.frame = frame;
            const watching =
              !formation.moving && !combat && captureProgress < 0;
            if (!watching) idle.yaw = 0;
            else {
              stats.idleHeads++;
              if (active && options.distance < 950) {
                const targetYaw = Math.sin(clock * 0.68 + idle.phase) * 0.45;
                idle.yaw +=
                  (targetYaw - idle.yaw) * (1 - Math.exp(-elapsed * 3.5));
                stats.idleAnimating = true;
              }
            }
            // Head yaw is local to the neck, then inherits the same stance and
            // recoil transform as the torso. Rifle/muzzle transforms stay intact.
            weaponMount.position.set(0, bob + stance, -kick);
            weaponMount.rotation.set(pitch, 0, 0);
            weaponMount.scale.setScalar(1);
            weaponMount.updateMatrix();
            headTransform.position.fromArray(INFANTRY_NECK_PIVOT);
            headTransform.rotation.set(0, idle.yaw, 0);
            headTransform.scale.setScalar(1);
            headTransform.updateMatrix();
            headTransform.matrix
              .premultiply(weaponMount.matrix)
              .premultiply(parent.matrix);
            for (const part of stats.detail ? [13, 14] : [13]) {
              const headPart = currentBank.parts[part]!;
              const index = headPart.count++;
              headPart.mesh.setMatrixAt(index, headTransform.matrix);
              (
                headPart.mesh.geometry.getAttribute(
                  "unitUniform",
                ) as THREE.InstancedBufferAttribute
              ).setXYZ(index, uniform.r, uniform.g, uniform.b);
            }
            if (stats.headYawSamples.length < 8)
              stats.headYawSamples.push({ id: identity, tier, yaw: idle.yaw });
            if (combat) {
              // Match the actual rifle muzzle after the body's brace/recoil transform.
              weaponMount.position.set(0, bob + stance, -kick);
              weaponMount.rotation.set(pitch, 0, 0);
              weaponMount.scale.setScalar(1);
              weaponMount.updateMatrix();
              origin
                .set(0.37, 2.9, 1.97)
                .applyMatrix4(weaponMount.matrix)
                .applyMatrix4(parent.matrix);
              if (shot < 0.24) flashAtOrigin(0.85);
              if (
                shot >= 0.04 &&
                shot < 0.7 &&
                stats.infantryTracers < MAX_UNIT_EFFECTS
              )
                flight(
                  tracers,
                  stats.infantryTracers++,
                  combat.target,
                  (shot - 0.04) / 0.66,
                  0.35,
                  1.6,
                  THREE.MathUtils.clamp(
                    origin.distanceTo(combat.target) * 0.14,
                    3,
                    9,
                  ),
                  2.8,
                );
              if (shot >= 0.7 && shot < 1.05)
                impact(
                  combat.target,
                  (shot - 0.7) / 0.35,
                  0.8 + (shot - 0.7) * 4,
                );
            }
            badgeY += bob + stance;
            badgeZ -= kick;
            stats.infantry++;
          } else if (kind === "tank") {
            const shot = combatElapsed % (2.8 + battleOffset * 0.32),
              kick = combat ? Math.max(0, 1 - shot / 0.55) * 0.55 : 0;
            const bob = Math.abs(walk) * 0.026;
            const aim = combat
              ? Math.atan2(
                  combat.target.x - parent.position.x,
                  combat.target.z - parent.position.z,
                ) - modelAngle
              : rally * 0.17 * Math.sin(clock * 2);
            put(2, 0, bob, 0);
            put(6, 0, bob, 0, 0, aim);
            put(7, -Math.sin(aim) * kick, bob, -Math.cos(aim) * kick, 0, aim);
            for (let side = -1; side <= 1; side += 2) {
              for (let w = 0; w < TANK_WHEEL_Z.length; w++)
                put(
                  9,
                  side * 1.94,
                  0.66,
                  TANK_WHEEL_Z[w],
                  formation.moving ? clock * 7 : 0,
                  0,
                  0.42,
                );
              put(
                10,
                side * 1.52,
                1.27,
                formation.moving ? ((clock * 1.3) % 1) * 0.38 : 0,
              );
            }
            if (combat) {
              point(0, 2.3 + bob, 4.21 - kick, aim);
              if (shot < 0.28) flashAtOrigin(1.45);
              if (
                shot >= 0.08 &&
                shot < 1.2 &&
                stats.tankShells < MAX_UNIT_EFFECTS
              )
                flight(
                  tankShells,
                  stats.tankShells++,
                  combat.target,
                  (shot - 0.08) / 1.12,
                  2.5,
                  2.1,
                  2.3,
                  0.8,
                );
              if (shot >= 1.2 && shot < 1.85)
                impact(
                  combat.target,
                  (shot - 1.2) / 0.65,
                  1.5 + (shot - 1.2) * 5,
                );
            }
            badgeX = 1.07 * Math.cos(aim) + 0.12 * Math.sin(aim);
            badgeZ = -1.07 * Math.sin(aim) + 0.12 * Math.cos(aim);
            badgeY = 2.22 + bob;
            badgeYaw = aim;
            badgeScale = 1.6;
            stats.tanks++;
            stats.vehicles++;
          } else if (kind === "artillery") {
            const shot = combatElapsed % (4.4 + battleOffset * 0.65),
              kick = combat ? Math.max(0, 1 - shot / 0.5) * 0.46 : 0;
            put(4, 0, 0, 0);
            put(8, 0, -kick * 0.15, -kick, -rally * 0.035);
            for (let side = -1; side <= 1; side += 2)
              put(
                9,
                side * 1.03,
                0.7,
                0,
                formation.moving ? clock * 5 : 0,
                0,
                0.67,
              );
            if (combat) {
              if (shot < 0.28)
                flash(0, 1.96 - kick * 0.15, 2.96 - kick, 0, 1.5);
              if (
                shot >= 0.14 &&
                shot < 1.65 &&
                stats.shells < MAX_UNIT_EFFECTS
              ) {
                point(0, 1.96 - kick * 0.15, 2.96 - kick);
                const t = (shot - 0.14) / 1.51;
                const arc = Math.min(
                  20,
                  Math.max(6, origin.distanceTo(combat.target) * 0.18),
                );
                projectile.lerpVectors(origin, combat.target, t);
                projectile.y += 4 * t * (1 - t) * arc;
                direction.subVectors(combat.target, origin);
                direction.y += 4 * (1 - 2 * t) * arc;
                direction.normalize();
                transform.position.copy(projectile);
                transform.quaternion.setFromUnitVectors(up, direction);
                transform.scale.setScalar(1.3 * effectScale);
                transform.updateMatrix();
                shells.setMatrixAt(stats.shells++, transform.matrix);
                lighting.emit(projectile, 5 * effectScale, 0.95, "projectile");
              }
              if (
                shot >= 1.65 &&
                shot < 2.22 &&
                stats.impacts < MAX_UNIT_EFFECTS
              ) {
                const t = (shot - 1.65) / 0.57,
                  size = 1.4 + t * 4.5;
                transform.position.copy(combat.target);
                transform.position.y += 0.35 + t * 0.75;
                transform.rotation.set(0, clock, 0);
                transform.scale.set(size, 0.7 + t * 1.6, size);
                transform.updateMatrix();
                impacts.setMatrixAt(stats.impacts++, transform.matrix);
                lighting.emit(
                  transform.position,
                  size * effectScale * 4,
                  1.5 * (1 - t),
                  "impact",
                );
              }
            }
            badgeX = 0.92;
            badgeY = 1.5;
            badgeZ = 0.31;
            badgeScale = 1.6;
            stats.artillery++;
            stats.vehicles++;
          } else {
            const bob = formation.moving ? Math.sin(clock * 10) * 0.045 : 0;
            put(3, 0, bob, 0);
            if (formation.moving || combat) {
              for (const side of [-1, 1]) {
                point(side * 0.82, 1.61 + bob, 2.66);
                lighting.emit(origin, 3.4 * effectScale, 0.55, "headlamp");
              }
            }
            for (let side = -1; side <= 1; side += 2)
              for (let w = 0; w < TRUCK_WHEEL_Z.length; w++)
                put(
                  9,
                  side * 1.1,
                  0.57,
                  TRUCK_WHEEL_Z[w],
                  formation.moving ? clock * 6 : 0,
                  0,
                  0.55,
                );
            if (combat || captureProgress >= 0) {
              const t = (clock * 0.42 + battleOffset) % 1,
                ease = t * t * (3 - 2 * t);
              put(
                11,
                1.75 * ease,
                1.65 - 1.32 * ease + Math.sin(t * Math.PI) * 0.32,
                -1.35,
                0,
                0.15 * Math.sin(clock * 2),
              );
            }
            badgeX = 1.06;
            badgeY = 1.73 + bob;
            badgeZ = 0.85;
            badgeScale = 1.6;
            stats.trucks++;
            stats.vehicles++;
          }
          transform.position.set(badgeX, badgeY, badgeZ);
          transform.rotation.set(0, badgeYaw, 0);
          transform.scale.set(badgeScale, badgeScale, badgeScale);
          transform.updateMatrix();
          transform.matrix.premultiply(parent.matrix);
          accents.setMatrixAt(accents.count, transform.matrix);
          accents.setColorAt(accents.count++, color.setHex(formation.tint));
        }
        if (captureProgress >= 0 && stats.captures < MAX_UNIT_EFFECTS) {
          parent.position.copy(formation.position);
          if (heightAtWorld)
            parent.position.y = heightAtWorld(
              parent.position.x,
              parent.position.z,
            );
          parent.rotation.set(0, formation.angle, 0);
          parent.scale.setScalar(UNIT_MODEL_SCALE);
          parent.updateMatrix();
          const rise = Math.min(1, captureProgress * 5),
            flutter =
              Math.sin(clock * 8) * 0.13 * Math.sin(captureProgress * Math.PI);
          currentBank = requested.get(bankKey(0))!;
          put(12, 0, 0, 0);
          transform.position.set(0, -(1 - rise) * 2.8, 0);
          transform.rotation.set(0, flutter, 0);
          transform.scale.set(0.55 + 0.45 * rise, 1, 1);
          transform.updateMatrix();
          transform.matrix.premultiply(parent.matrix);
          flags.setMatrixAt(stats.captures, transform.matrix);
          flags.setColorAt(stats.captures++, color.setHex(formation.tint));
        }
      }
      for (const [key, value] of captures)
        if (value.frame !== frame) captures.delete(key);
      // Entries are bounded by the visible formation budget and expire as soon
      // as their actual battle is absent, including hidden or removed armies.
      for (const [key, value] of combats)
        if (value.frame !== frame) combats.delete(key);
      for (const [key, idle] of idleHeads)
        if (idle.frame !== frame) idleHeads.delete(key);
      stats.modelBanks = requested.size;
      stats.modelParts = parts.size;
      stats.modelCapacity =
        stats.modelVertices =
        stats.modelIdleParts =
        stats.modelIdleVertices =
        stats.modelIdleCapacity =
          0;
      for (const part of parts.values()) {
        const mesh = part.mesh;
        mesh.count = part.count;
        mesh.visible = mesh.count > 0;
        if (mesh.visible) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.geometry.getAttribute("unitUniform").needsUpdate = true;
        }
        const vertices = mesh.geometry.getAttribute("position").count;
        stats.instances += part.count;
        stats.modelCapacity += mesh.instanceMatrix.count;
        stats.modelVertices += vertices;
        if (!part.need) {
          stats.modelIdleParts++;
          stats.modelIdleVertices += vertices;
          stats.modelIdleCapacity += mesh.instanceMatrix.count;
        }
      }
      lighting.finish();
      stats.glows = lighting.stats.glows;
      stats.groundGlows = lighting.stats.groundGlows;
      stats.dynamicLights = lighting.stats.dynamicLights;
      stats.headlights = lighting.stats.headlights;
      stats.instances += stats.glows + stats.groundGlows;
      flags.count = stats.captures;
      flashes.count = stats.muzzleFlashes;
      tracers.count = stats.infantryTracers;
      tankShells.count = stats.tankShells;
      shells.count = stats.shells;
      impacts.count = stats.impacts;
      for (const mesh of overlayBatches) {
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        stats.instances += mesh.count;
      }
    },
    /** Reset frame timing after a hidden tab without advancing any visual clock. */
    suspend() {
      lastNow = -1;
      wasActive = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lighting.dispose();
      stats.glows =
        stats.groundGlows =
        stats.dynamicLights =
        stats.headlights =
          0;
      captures.clear();
      idleHeads.clear();
      stats.idleHeads = 0;
      stats.idleAnimating = false;
      stats.headYawSamples.length = 0;
      stats.modelBanks =
        stats.modelCapacity =
        stats.modelParts =
        stats.modelVertices =
        stats.modelIdleParts =
        stats.modelIdleVertices =
        stats.modelIdleCapacity =
          0;
      stats.modelProfiles = {};
      for (const counts of Object.values(stats.modelVariants)) counts.fill(0);
      combats.clear();
      stats.infantry =
        stats.vehicles =
        stats.instances =
        stats.tanks =
        stats.artillery =
        stats.trucks =
        stats.combatFormations =
        stats.muzzleFlashes =
        stats.infantryTracers =
        stats.tankShells =
        stats.shells =
        stats.impacts =
        stats.captures =
          0;
      for (const part of [...parts.values()]) removePart(part);
      requested.clear();
      for (const mesh of overlayBatches) {
        scene.remove(mesh);
        mesh.dispose();
      }
      for (const geometry of [
        accentGeometry,
        flagGeometry,
        flashGeometry,
        tracerGeometry,
        shellGeometry,
        impactGeometry,
      ])
        geometry.dispose();
      for (const m of [
        material,
        accentMaterial,
        flashMaterial,
        shellMaterial,
        impactMaterial,
      ])
        m.dispose();
    },
  };
}
