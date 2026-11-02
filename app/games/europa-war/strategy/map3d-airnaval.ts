import * as THREE from "three";
import { MAP } from "./world";
import { formationSnapshotTransition } from "./map3d-unit-events";
import { createAirNavalGeometry } from "./map3d-airnaval-models";
import { navalPatrolPose } from "./map3d-naval-space";
import {
  airNavalPhase,
  airNavalUnits,
  detectAirNavalOutcomes,
  type AirNavalModel,
  type AirNavalOutcome,
  type AirNavalUnit,
} from "./map3d-airnaval-state";
import type { GraphicsQuality } from "./map3d-visuals";
import type { World } from "./types";

export interface AirNavalOptions {
  quality: GraphicsQuality;
  paused?: boolean;
  reduced?: boolean;
  camera?: THREE.Camera;
}
export interface AirNavalStats {
  aircraft: number;
  ships: number;
  movingAircraft: number;
  movingShips: number;
  airCombats: number;
  navalCombats: number;
  bombingRuns: number;
  effects: number;
  confirmedEvents: number;
  animationTime: number;
  positions: { id: string; x: number; y: number; z: number }[];
}
const MODELS: AirNavalModel[] = [
  "fighter",
  "bomber",
  "ship",
  "carrier",
  "submarine",
];
const CAPACITY = 160,
  EFFECT_CAPACITY = 64,
  EFFECT_DURATION = 4000;
const LIMITS = {
  low: [40, 48, 12],
  medium: [64, 80, 24],
  high: [96, 120, 40],
  ultra: [128, 160, 64],
} as const;
type Outcome = AirNavalOutcome & { began: number };
type Pose = { x: number; y: number; z: number; angle: number; bank: number };

/** Bounded instanced presentation. Neither frame animation nor model creation writes campaign state. */
export function createAirNavalVisuals(
  scene: THREE.Scene,
  heightAt: (x: number, y: number) => number,
) {
  const group = new THREE.Group();
  group.name = "air-naval-missions";
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.48,
    roughness: 0.56,
  });
  const pools = new Map(
    MODELS.map((model) => {
      const mesh = new THREE.InstancedMesh(
        createAirNavalGeometry(model),
        material,
        CAPACITY,
      );
      mesh.name = `mission-${model}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh);
      return [model, mesh] as const;
    }),
  );
  const linePositions = new Float32Array(EFFECT_CAPACITY * 6);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linePositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  lineGeometry.setDrawRange(0, 0);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffe6a0,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  const tracers = new THREE.LineSegments(lineGeometry, lineMaterial);
  tracers.frustumCulled = false;
  group.add(tracers);
  const impactGeometry = new THREE.SphereGeometry(1, 8, 6);
  const impactMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa34d,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
  });
  const impacts = new THREE.InstancedMesh(
    impactGeometry,
    impactMaterial,
    EFFECT_CAPACITY,
  );
  impacts.count = 0;
  impacts.frustumCulled = false;
  impacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(impacts);
  const wakeGeometry = new THREE.RingGeometry(0.6, 1, 16, 1, 0, Math.PI * 1.7);
  const wakeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd1eaf0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wakes = new THREE.InstancedMesh(wakeGeometry, wakeMaterial, CAPACITY);
  wakes.count = 0;
  wakes.frustumCulled = false;
  wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(wakes);
  const dummy = new THREE.Object3D(),
    tint = new THREE.Color(),
    baseTint = new THREE.Color(0xffffff);
  const frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4(),
    sphere = new THREE.Sphere();
  let previous: World | null = null,
    units: AirNavalUnit[] = [],
    outcomes: Outcome[] = [];
  let clock = 0,
    lastFrame: number | null = null,
    wasRunning = false,
    disposed = false;
  const counters: AirNavalStats = {
    aircraft: 0,
    ships: 0,
    movingAircraft: 0,
    movingShips: 0,
    airCombats: 0,
    navalCombats: 0,
    bombingRuns: 0,
    effects: 0,
    confirmedEvents: 0,
    animationTime: 0,
    positions: [],
  };

  function pose(unit: AirNavalUnit, engagement?: Outcome): Pose {
    const phase =
      unit.phase * Math.PI * 2 +
      (unit.active ? clock / (unit.airborne ? 4100 : 22000) : 0);
    let x: number,
      z: number,
      y: number,
      angle: number,
      bank = 0;
    if (unit.airborne && unit.active) {
      if (engagement) {
        const direction = unit.id === engagement.sourceId ? 1 : -1;
        x = engagement.to.x + Math.cos(phase) * 14;
        z = engagement.to.y + Math.sin(phase) * 10;
        angle = -phase + direction * 0.35;
      } else {
        const t = (1 - Math.cos(phase)) / 2;
        const dx = unit.target.x - unit.from.x,
          dz = unit.target.y - unit.from.y;
        const distance = Math.max(1, Math.hypot(dx, dz));
        x = unit.from.x + dx * t - (dz / distance) * Math.sin(phase) * 9;
        z = unit.from.y + dz * t + (dx / distance) * Math.sin(phase) * 9;
        if (distance < 2) {
          x += Math.cos(phase) * 16;
          z += Math.sin(phase) * 12;
        }
        angle = Math.atan2(
          -dx * Math.sin(phase) + (dz / distance) * Math.cos(phase) * 18,
          -dz * Math.sin(phase) - (dx / distance) * Math.cos(phase) * 18,
        );
      }
      y = heightAt(x, z) + 29 + Math.sin(phase * 2) * 3 + unit.phase * 7;
      bank = Math.sin(phase) * 0.18;
    } else if (unit.airborne) {
      x = unit.from.x + (unit.phase - 0.5) * 17;
      z = unit.from.y + 9 + unit.phase * 7;
      y = heightAt(x, z) + 1.6;
      angle = unit.phase * 0.7;
    } else {
      const patrol = navalPatrolPose(
        unit.seaZone!,
        unit.phase,
        airNavalPhase(unit.country),
        phase,
      );
      x = patrol.x;
      z = patrol.y;
      y = -0.25;
      angle = patrol.angle;
      bank = unit.active ? Math.sin(phase * 4) * 0.015 : 0;
    }
    return { x: x - MAP.width / 2, y, z: z - MAP.height / 2, angle, bank };
  }
  return {
    update(world: World) {
      if (disposed || world === previous) return;
      const transition = formationSnapshotTransition(previous, world);
      if (transition !== "step") outcomes = [];
      if (transition === "reset") {
        clock = 0;
        lastFrame = null;
        wasRunning = false;
      }
      const additions = detectAirNavalOutcomes(previous, world);
      outcomes = [
        ...outcomes,
        ...additions.map((outcome) => ({ ...outcome, began: clock })),
      ]
        .filter(
          (outcome) =>
            clock - outcome.began < EFFECT_DURATION &&
            world.countries[outcome.sourceCountry]?.wars.includes(
              outcome.targetCountry,
            ),
        )
        .slice(-EFFECT_CAPACITY);
      units = airNavalUnits(world, outcomes);
      previous = world;
    },
    animate(now: number, options: AirNavalOptions): boolean {
      if (disposed) return false;
      const running = !options.paused && !options.reduced;
      if (lastFrame !== null && running && wasRunning)
        clock += Math.max(0, Math.min(100, now - lastFrame));
      lastFrame = now;
      wasRunning = running;
      outcomes = outcomes.filter(
        (outcome) => clock - outcome.began < EFFECT_DURATION,
      );
      const [planeLimit, shipLimit, effectLimit] = LIMITS[options.quality];
      counters.aircraft =
        counters.ships =
        counters.movingAircraft =
        counters.movingShips =
        counters.airCombats =
        counters.navalCombats =
        counters.bombingRuns =
        counters.effects =
          0;
      counters.confirmedEvents = outcomes.length;
      counters.animationTime = clock;
      counters.positions = [];
      const poses = new Map<string, Pose>();
      const engagements = new Map<string, Outcome>();
      for (const outcome of outcomes) {
        engagements.set(outcome.sourceId, outcome);
        engagements.set(outcome.targetId, outcome);
      }
      const counts = new Map(MODELS.map((model) => [model, 0]));
      if (options.camera)
        frustum.setFromProjectionMatrix(
          projection.multiplyMatrices(
            options.camera.projectionMatrix,
            options.camera.matrixWorldInverse,
          ),
        );
      let wakeCount = 0;
      for (const unit of units) {
        if (
          unit.airborne
            ? counters.aircraft >= planeLimit
            : counters.ships >= shipLimit
        )
          continue;
        const position = pose(unit, engagements.get(unit.id));
        poses.set(unit.id, position);
        if (
          options.camera &&
          !frustum.intersectsSphere(
            sphere.set(
              new THREE.Vector3(position.x, position.y, position.z),
              42,
            ),
          )
        )
          continue;
        const mesh = pools.get(unit.model)!,
          index = counts.get(unit.model)!;
        if (index >= CAPACITY) continue;
        const scale = unit.scale * (unit.airborne && !unit.active ? 0.72 : 1);
        dummy.position.set(position.x, position.y, position.z);
        dummy.rotation.set(0, position.angle, position.bank);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        tint.set(unit.color).lerp(baseTint, 0.73);
        mesh.setColorAt(index, tint);
        counts.set(unit.model, index + 1);
        if (unit.airborne) {
          counters.aircraft++;
          if (unit.active) counters.movingAircraft++;
        } else {
          counters.ships++;
          if (unit.active) counters.movingShips++;
        }
        if (unit.active && counters.positions.length < 8)
          counters.positions.push({
            id: unit.id,
            x: position.x,
            y: position.y,
            z: position.z,
          });
        if (!unit.airborne && unit.active && wakeCount < CAPACITY) {
          dummy.position.set(
            position.x + Math.sin(position.angle) * 12 * scale,
            -0.32,
            position.z + Math.cos(position.angle) * 12 * scale,
          );
          dummy.rotation.set(-Math.PI / 2, 0, -position.angle);
          dummy.scale.set(5 * scale, 12 * scale, 1);
          dummy.updateMatrix();
          wakes.setMatrixAt(wakeCount++, dummy.matrix);
        }
      }
      for (const [model, mesh] of pools) {
        mesh.count = counts.get(model)!;
        mesh.castShadow = options.quality !== "low";
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      wakes.count = wakeCount;
      wakes.instanceMatrix.needsUpdate = true;
      let lineCount = 0,
        impactCount = 0;
      for (const outcome of outcomes.slice(0, effectLimit)) {
        const progress = Math.min(1, (clock - outcome.began) / EFFECT_DURATION);
        const source = poses.get(outcome.sourceId),
          target = poses.get(outcome.targetId);
        const land = outcome.kind === "bombing",
          air = outcome.kind === "dogfight" || outcome.kind === "flak";
        const x = outcome.to.x - MAP.width / 2,
          z = outcome.to.y - MAP.height / 2;
        const end = target ?? {
          x,
          y: land ? heightAt(outcome.to.x, outcome.to.y) + 1 : air ? 31 : 1,
          z,
        };
        const start = source ?? {
          x: x - (air ? 16 : 22),
          y: land || outcome.kind === "navalStrike" ? end.y + 32 : air ? 26 : 5,
          z: z - 8,
        };
        if (
          options.camera &&
          !frustum.intersectsSphere(
            sphere.set(new THREE.Vector3(end.x, end.y, end.z), 60),
          )
        )
          continue;
        counters.effects++;
        if (outcome.kind === "naval" || outcome.kind === "navalStrike")
          counters.navalCombats++;
        else if (land) counters.bombingRuns++;
        else counters.airCombats++;
        const t = Math.min(1, progress / 0.7),
          tail = Math.max(0, t - 0.12);
        const arc = outcome.kind === "naval" ? 9 : 0;
        const offset = lineCount++ * 6;
        for (const [index, along] of [tail, t].entries()) {
          linePositions[offset + index * 3] =
            start.x + (end.x - start.x) * along;
          linePositions[offset + index * 3 + 1] =
            start.y +
            (end.y - start.y) * along +
            Math.sin(along * Math.PI) * arc;
          linePositions[offset + index * 3 + 2] =
            start.z + (end.z - start.z) * along;
        }
        // A visible small impact marks the confirmed damage immediately, expanding after the tracer arrives.
        const radius =
          (0.75 + Math.min(1, progress / 0.7) * 3.4) * (1 - progress * 0.65);
        dummy.position.set(end.x, end.y, end.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(
          radius,
          radius * (outcome.kind === "naval" ? 2.7 : 1.3),
          radius,
        );
        dummy.updateMatrix();
        impacts.setMatrixAt(impactCount, dummy.matrix);
        impacts.setColorAt(
          impactCount++,
          tint.setHex(outcome.kind === "naval" ? 0xd4efff : 0xffd08c),
        );
      }
      lineGeometry.setDrawRange(0, lineCount * 2);
      lineGeometry.getAttribute("position").needsUpdate = true;
      impacts.count = impactCount;
      impacts.instanceMatrix.needsUpdate = true;
      if (impacts.instanceColor) impacts.instanceColor.needsUpdate = true;
      return (
        running &&
        (counters.movingAircraft > 0 ||
          counters.movingShips > 0 ||
          counters.effects > 0)
      );
    },
    stats(): Readonly<AirNavalStats> {
      return {
        ...counters,
        positions: counters.positions.map((position) => ({ ...position })),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      previous = null;
      units = [];
      outcomes = [];
      scene.remove(group);
      for (const mesh of pools.values()) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      impacts.dispose();
      impactGeometry.dispose();
      impactMaterial.dispose();
      wakes.dispose();
      wakeGeometry.dispose();
      wakeMaterial.dispose();
      group.clear();
    },
  };
}
