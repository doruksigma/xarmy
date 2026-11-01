import * as THREE from "three";
import {
  buildGlobalRailNetwork,
  railNetworkSignature,
  railPointAt,
  type RailNetwork,
  type RailRoute,
} from "./map3d-rail-network";
import { containsProvincePoint, heightAt } from "./map3d-geometry";
import {
  createTrainModels,
  TRAIN_DIMENSIONS,
  TRAIN_WORLD_SCALE,
  type TrainPose,
} from "./map3d-train-models";
import type { GraphicsQuality } from "./map3d-visuals";
import { GEOGRAPHY, MAP } from "./world";
import type { World } from "./types";

/** Visual traffic only: these values never modify supply, inventory or game time. */
const LIMITS = {
  trains: { low: 6, medium: 12, high: 20, ultra: 32 },
  sleepers: 10000,
  stations: 96,
  hiddenDistance: 1400,
  sleeperDistance: 1000,
  speed: 4.2,
} as const;
export interface RailwayStats {
  /** Physically rendered province connections, not an inventory delivery count. */
  edges: number;
  trains: number;
  stations: number;
  omittedConnections: number;
  positions: Array<{ x: number; y: number; z: number }>;
  progress: number;
  countries: string[];
}
export interface RailwayAnimation {
  /** Campaign pause deliberately does not stop this ambient train animation. */
  paused: boolean;
  reduced: boolean;
  distance: number;
  /** World coordinates, matching OrbitControls.target (not map x/y). */
  focus?: { x: number; z: number };
}

type Part = { geometry: THREE.BufferGeometry; color: number };
/** One vertex-colored prototype per vehicle; details do not add per-train draws. */
function combine(parts: Part[]) {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color();
  for (const { geometry: original, color: tint } of parts) {
    const geometry = original.index ? original.toNonIndexed() : original;
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal");
    color.setHex(tint);
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    if (geometry !== original) geometry.dispose();
    original.dispose();
  }
  return new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))
    .setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
): Part {
  return { geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), color };
}
const RED = 0x853e30,
  WOOD = 0x997051;
function station() {
  const roof = new THREE.CylinderGeometry(2.5, 2.5, 5.3, 3)
    .rotateZ(Math.PI / 2)
    .rotateX(Math.PI / 2)
    .scale(1, 0.55, 1)
    .translate(0, 2.4, 0);
  const p: Part[] = [
    box(5.1, 0.3, 4, 0, 0.14, 0, 0x8c8f84),
    box(4.5, 2, 2.8, 0, 1.3, 0, 0xd3c1a0),
    { geometry: roof, color: RED },
  ];
  for (const z of [-1.41, 1.41]) {
    p.push(box(0.7, 1.3, 0.04, 0, 1, z, WOOD));
    for (const x of [-1.45, 1.45])
      p.push(box(0.6, 0.7, 0.04, x, 1.57, z, 0x607e82));
  }
  return combine(p);
}
const matrix = new THREE.Matrix4(),
  rotation = new THREE.Quaternion(),
  scale = new THREE.Vector3(),
  position = new THREE.Vector3();
const axisY = new THREE.Vector3(0, 1, 0);
function at(mapX: number, mapY: number, lift = 0) {
  return position.set(
    mapX - MAP.width / 2,
    heightAt(mapX, mapY) + lift,
    mapY - MAP.height / 2,
  );
}
function pose(x: number, y: number, heading: number, size = 1, lift = 0.13) {
  rotation.setFromAxisAngle(axisY, -heading);
  return matrix.compose(at(x, y, lift), rotation, scale.setScalar(size));
}

export function createRailways(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "capital-connected-railways";
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.22,
  });
  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0xaab8bb,
    metalness: 0.82,
    roughness: 0.3,
  });
  const gravel = new Uint8Array(64 * 64 * 4);
  let seed = 45139;
  for (let i = 0; i < gravel.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 75 + (seed >>> 24) * 0.42;
    gravel[i] = grain;
    gravel[i + 1] = grain * 0.95;
    gravel[i + 2] = grain * 0.85;
    gravel[i + 3] = 255;
  }
  const gravelTexture = new THREE.DataTexture(gravel, 64, 64);
  gravelTexture.wrapS = gravelTexture.wrapT = THREE.RepeatWrapping;
  gravelTexture.magFilter = THREE.LinearFilter;
  gravelTexture.generateMipmaps = true;
  gravelTexture.minFilter = THREE.LinearMipmapLinearFilter;
  gravelTexture.colorSpace = THREE.SRGBColorSpace;
  gravelTexture.needsUpdate = true;
  const ballastMaterial = new THREE.MeshStandardMaterial({
    map: gravelTexture,
    roughness: 1,
    bumpMap: gravelTexture,
    bumpScale: 0.07,
  });
  const sleeperMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b4431,
    roughness: 1,
  });
  const tracks = new THREE.Mesh(new THREE.BufferGeometry(), trackMaterial);
  tracks.name = "railway-steel-rails";
  tracks.receiveShadow = true;
  const ballast = new THREE.Mesh(new THREE.BufferGeometry(), ballastMaterial);
  ballast.name = "railway-gravel-ballast";
  ballast.receiveShadow = true;
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(
      0.31 * TRAIN_WORLD_SCALE,
      0.15 * TRAIN_WORLD_SCALE,
      2.12 * TRAIN_WORLD_SCALE,
    ),
    sleeperMaterial,
    LIMITS.sleepers,
  );
  sleepers.name = "railway-timber-sleepers";
  const stations = new THREE.InstancedMesh(
    station(),
    material,
    LIMITS.stations,
  );
  const trains = createTrainModels(group);
  for (const mesh of [sleepers, stations]) {
    mesh.count = 0;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.add(tracks, ballast);
  let quality: GraphicsQuality = "medium",
    disposed = false,
    oldSignature = "",
    windowSignature = "";
  let worldRef: World | undefined;
  let focus = { x: 0, z: 0 };
  let hasFocus = false;
  let network: RailNetwork = {
    edges: [],
    routes: [],
    stations: [],
    omittedConnections: 0,
  };
  let clock = 0,
    lastTime: number | undefined,
    wasAnimating = false,
    distance = 800;
  const stats: RailwayStats = {
    edges: 0,
    trains: 0,
    stations: 0,
    omittedConnections: 0,
    positions: [],
    progress: 0,
    countries: [],
  };

  function windowBounds() {
    const x = Math.round(focus.x / 80) * 80 + MAP.width / 2;
    const y = Math.round(focus.z / 80) * 80 + MAP.height / 2;
    const radius = Math.max(100, Math.ceil((distance * 0.45) / 80) * 80) + 80;
    return { x, y, radius, key: `${x}:${y}:${radius}:${quality}` };
  }
  function pointDistanceToEdge(
    x: number,
    y: number,
    edge: RailNetwork["edges"][number],
  ) {
    let nearest = Infinity;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1],
        b = edge.points[i],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      nearest = Math.min(
        nearest,
        Math.hypot(x - a.x - dx * t, y - a.y - dy * t),
      );
    }
    return nearest;
  }
  function refreshTrackWindow(force = false) {
    if (!worldRef) return;
    const bounds = windowBounds();
    if (force || bounds.key !== windowSignature) {
      windowSignature = bounds.key;
      buildTracks(worldRef);
    }
  }
  function buildTracks(world: World) {
    const bounds = windowBounds();
    const visibleEdges = network.edges.filter(
      (edge) => pointDistanceToEdge(bounds.x, bounds.y, edge) <= bounds.radius,
    );
    const segmentLength =
      quality === "low" ? 3 : quality === "medium" ? 2 : 1.3;
    const railPositions: number[] = [],
      railIndices: number[] = [];
    const bedPositions: number[] = [],
      bedIndices: number[] = [],
      bedUvs: number[] = [];
    let sleeperCount = 0;
    for (const edge of visibleEdges) {
      const points: Array<{ x: number; y: number }> = [edge.points[0]];
      for (let i = 1; i < edge.points.length; i++) {
        const a = edge.points[i - 1],
          b = edge.points[i];
        const pieces = Math.max(
          1,
          Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / segmentLength),
        );
        for (let j = 1; j <= pieces; j++)
          points.push({
            x: a.x + ((b.x - a.x) * j) / pieces,
            y: a.y + ((b.y - a.y) * j) / pieces,
          });
      }
      const frames = points.map((p, i) => {
        const a = points[Math.max(0, i - 1)],
          b = points[Math.min(points.length - 1, i + 1)];
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { nx: -(b.y - a.y) / length, ny: (b.x - a.x) / length };
      });
      // A continuous gravel shoulder, not disconnected decorative stripes.
      const bedStart = bedPositions.length / 3;
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          n = frames[i];
        for (const [offset, lift] of [
          [-1.35, 0.035],
          [-1.03, 0.16],
          [1.03, 0.16],
          [1.35, 0.035],
        ]) {
          const x = p.x + n.nx * offset * TRAIN_WORLD_SCALE,
            y = p.y + n.ny * offset * TRAIN_WORLD_SCALE;
          bedPositions.push(
            x - MAP.width / 2,
            heightAt(x, y) + lift * TRAIN_WORLD_SCALE,
            y - MAP.height / 2,
          );
          bedUvs.push(x * 0.22, y * 0.22);
        }
        if (i)
          for (let k = 0; k < 3; k++) {
            const a = bedStart + (i - 1) * 4 + k,
              b = a + 4;
            bedIndices.push(a, a + 1, b, a + 1, b + 1, b);
          }
      }
      // Solid steel rail cross-section: wide foot, narrow web and bright head.
      const profile = [
        [-0.13, 0.315],
        [-0.13, 0.34],
        [-0.045, 0.34],
        [-0.045, 0.4],
        [-0.09, 0.4],
        [-0.09, 0.46],
        [0.09, 0.46],
        [0.09, 0.4],
        [0.045, 0.4],
        [0.045, 0.34],
        [0.13, 0.34],
        [0.13, 0.315],
      ];
      for (const side of [-1, 1]) {
        const railStart = railPositions.length / 3;
        for (let i = 0; i < points.length; i++) {
          const p = points[i],
            n = frames[i];
          for (const [offset, lift] of profile) {
            const x = p.x + n.nx * (side * 0.75 + offset) * TRAIN_WORLD_SCALE,
              y = p.y + n.ny * (side * 0.75 + offset) * TRAIN_WORLD_SCALE;
            railPositions.push(
              x - MAP.width / 2,
              heightAt(x, y) + lift * TRAIN_WORLD_SCALE,
              y - MAP.height / 2,
            );
          }
          if (i)
            for (let k = 0; k < profile.length; k++) {
              const next = (k + 1) % profile.length,
                a = railStart + (i - 1) * profile.length,
                b = a + profile.length;
              railIndices.push(
                a + k,
                a + next,
                b + k,
                a + next,
                b + next,
                b + k,
              );
            }
        }
      }
      let carried = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!length) continue;
        for (
          let d = carried;
          d < length && sleeperCount < LIMITS.sleepers;
          d += 0.92 * TRAIN_WORLD_SCALE
        ) {
          sleepers.setMatrixAt(
            sleeperCount++,
            pose(
              a.x + ((b.x - a.x) * d) / length,
              a.y + ((b.y - a.y) * d) / length,
              Math.atan2(b.y - a.y, b.x - a.x),
              1,
              0.24 * TRAIN_WORLD_SCALE,
            ),
          );
        }
        carried =
          (carried -
            (length % (0.92 * TRAIN_WORLD_SCALE)) +
            0.92 * TRAIN_WORLD_SCALE) %
          (0.92 * TRAIN_WORLD_SCALE);
      }
    }
    tracks.geometry.dispose();
    tracks.geometry = new THREE.BufferGeometry()
      .setAttribute(
        "position",
        new THREE.Float32BufferAttribute(railPositions, 3),
      )
      .setIndex(railIndices);
    tracks.geometry.computeVertexNormals();
    tracks.geometry.computeBoundingSphere();
    ballast.geometry.dispose();
    ballast.geometry = new THREE.BufferGeometry()
      .setAttribute(
        "position",
        new THREE.Float32BufferAttribute(bedPositions, 3),
      )
      .setAttribute("uv", new THREE.Float32BufferAttribute(bedUvs, 2))
      .setIndex(bedIndices);
    ballast.geometry.computeVertexNormals();
    ballast.geometry.computeBoundingSphere();
    sleepers.count = sleeperCount;
    sleepers.instanceMatrix.needsUpdate = true;
    sleepers.computeBoundingSphere();
    let stationCount = 0;
    for (const entry of network.stations) {
      if (
        Math.hypot(entry.point.x - bounds.x, entry.point.y - bounds.y) >
        bounds.radius
      )
        continue;
      if (stationCount >= LIMITS.stations) break;
      let site: { x: number; y: number } | undefined;
      for (const offset of [
        [0, 5],
        [0, -5],
        [5, 0],
        [-5, 0],
        [5, 5],
        [-5, 5],
        [5, -5],
        [-5, -5],
        [0, 8],
        [0, -8],
        [8, 0],
        [-8, 0],
      ]) {
        const candidate = {
          x: entry.point.x + offset[0],
          y: entry.point.y + offset[1],
        };
        const onLand = [
          [-2.6, -2],
          [-2.6, 2],
          [2.6, -2],
          [2.6, 2],
        ].every(([x, y]) =>
          containsProvincePoint(
            entry.province,
            candidate.x + x,
            candidate.y + y,
          ),
        );
        const clearOfTracks = visibleEdges.every((edge) =>
          edge.points.slice(1).every((b, i) => {
            const a = edge.points[i],
              dx = b.x - a.x,
              dy = b.y - a.y;
            const t = Math.max(
              0,
              Math.min(
                1,
                ((candidate.x - a.x) * dx + (candidate.y - a.y) * dy) /
                  (dx * dx + dy * dy || 1),
              ),
            );
            return (
              Math.hypot(
                candidate.x - a.x - dx * t,
                candidate.y - a.y - dy * t,
              ) > 4.9
            );
          }),
        );
        if (onLand && clearOfTracks) {
          site = candidate;
          break;
        }
      }
      if (!site || !world.provinces[entry.province]) continue;
      stations.setMatrixAt(stationCount++, pose(site.x, site.y, 0));
    }
    stations.count = stationCount;
    stations.instanceMatrix.needsUpdate = true;
    stations.computeBoundingSphere();
    stats.edges = visibleEdges.length;
    stats.stations = stationCount;
    stats.omittedConnections = network.omittedConnections;
  }
  function placeTrains() {
    const visible = distance <= LIMITS.hiddenDistance;
    const minimumRoute =
      (TRAIN_DIMENSIONS.locomotive.length +
        TRAIN_DIMENSIONS.tender.length +
        0.25) *
        TRAIN_WORLD_SCALE +
      4;
    const bounds = windowBounds();
    const candidates = network.routes
      .map((route, index) => {
        const withTender = route.length >= minimumRoute;
        if (
          !withTender &&
          (!route.local ||
            route.length <
              TRAIN_DIMENSIONS.locomotive.length * TRAIN_WORLD_SCALE + 1)
        )
          return null;
        const maximumWagons = Math.max(
          0,
          Math.min(
            3,
            Math.floor(
              (route.length - minimumRoute) /
                ((TRAIN_DIMENSIONS.boxcar.length + 0.25) * TRAIN_WORLD_SCALE),
            ),
          ),
        );
        const fullLength =
          TRAIN_DIMENSIONS.locomotive.length +
          (withTender
            ? TRAIN_DIMENSIONS.tender.length + (maximumWagons + 1) * 0.25
            : 0) +
          maximumWagons * TRAIN_DIMENSIONS.boxcar.length;
        const rear =
          (fullLength - TRAIN_DIMENSIONS.locomotive.length / 2) *
            TRAIN_WORLD_SCALE +
          0.12;
        const span = Math.max(
          0.1,
          route.length - fullLength * TRAIN_WORLD_SCALE - 0.24,
        );
        const phase = ((clock * LIMITS.speed + index * span * 0.67) / span) % 2;
        const head = rear + (phase <= 1 ? phase : 2 - phase) * span;
        const point = railPointAt(route, head);
        const distanceToFocus = Math.hypot(
          point.x - MAP.width / 2 - focus.x,
          point.y - MAP.height / 2 - focus.z,
        );
        const onRenderedTrack =
          Math.hypot(point.x - bounds.x, point.y - bounds.y) <=
          bounds.radius - 42;
        return {
          route,
          index,
          maximumWagons,
          withTender,
          head,
          distanceToFocus,
          onRenderedTrack,
        };
      })
      .filter((value): value is NonNullable<typeof value> => !!value);
    const nearby = visible
      ? candidates
          .filter(
            (c) =>
              c.onRenderedTrack &&
              c.distanceToFocus <= Math.max(110, distance * 0.7),
          )
          .sort(
            (a, b) =>
              a.distanceToFocus - b.distanceToFocus || a.index - b.index,
          )
          .slice(0, LIMITS.trains[quality])
      : [];
    const count = nearby.length;
    stats.positions.length = 0;
    stats.countries.length = 0;
    const poses: TrainPose[] = [];
    for (let i = 0; i < count; i++) {
      const { route, maximumWagons, withTender, head } = nearby[i];
      const wagonCount = Math.min(quality === "low" ? 2 : 3, maximumWagons);
      const locoLength = TRAIN_DIMENSIONS.locomotive.length,
        tenderLength = TRAIN_DIMENSIONS.tender.length,
        wagonLength = TRAIN_DIMENSIONS.boxcar.length,
        gap = 0.25;
      const size = TRAIN_WORLD_SCALE;
      const cars: Array<{ kind: TrainPose["kind"]; offset: number }> = [
        { kind: "locomotive", offset: 0 },
      ];
      if (withTender)
        cars.push({
          kind: "tender",
          offset: (locoLength + tenderLength) / 2 + gap,
        });
      for (let j = 0; j < wagonCount; j++)
        cars.push({
          kind: j % 2 ? "flatcar" : "boxcar",
          offset:
            locoLength / 2 +
            tenderLength +
            gap * 2 +
            wagonLength / 2 +
            j * (wagonLength + gap),
        });
      for (const car of cars) {
        const d = head - car.offset * size,
          p = railPointAt(route, d);
        const length = TRAIN_DIMENSIONS[car.kind].length * size;
        const front = railPointAt(route, d + length * 0.4),
          back = railPointAt(route, d - length * 0.4);
        const pitch = Math.atan2(
          heightAt(front.x, front.y) - heightAt(back.x, back.y),
          length * 0.8,
        );
        poses.push({
          kind: car.kind,
          position: at(p.x, p.y, 0.46 * TRAIN_WORLD_SCALE).clone(),
          angle: -p.heading,
          pitch,
          scale: size,
          wheelPhase: -d / (TRAIN_DIMENSIONS.wheelRadius * size),
        });
      }
      const p = railPointAt(route, head),
        locomotivePosition = at(p.x, p.y, 0.46 * TRAIN_WORLD_SCALE);
      stats.countries.push(route.country ?? "");
      stats.positions.push({
        x: locomotivePosition.x,
        y: locomotivePosition.y,
        z: locomotivePosition.z,
      });
    }
    trains.update(poses, clock, { quality, paused: false, reduced: false });
    sleepers.visible =
      distance <= (quality === "low" ? 650 : LIMITS.sleeperDistance);
    stations.visible = visible;
    stats.trains = count;
    stats.progress = clock;
  }
  return {
    stats,
    update(world: World) {
      if (disposed) return;
      worldRef = world;
      if (!hasFocus) {
        const capital = GEOGRAPHY[world.countries[world.player].capital];
        focus = { x: capital.x - MAP.width / 2, z: capital.y - MAP.height / 2 };
        hasFocus = true;
      }
      const key = railNetworkSignature(world);
      if (key === oldSignature) return;
      oldSignature = key;
      network = buildGlobalRailNetwork(world);
      refreshTrackWindow(true);
      placeTrains();
    },
    setQuality(next: GraphicsQuality) {
      if (disposed) return;
      quality = next;
      refreshTrackWindow();
      for (const mesh of [stations])
        mesh.castShadow = next === "high" || next === "ultra";
      placeTrains();
    },
    animate(timeSeconds: number, options: RailwayAnimation) {
      if (disposed) return;
      const previousClock = clock,
        previousDistance = distance;
      const animating = !options.reduced;
      // Trains are ambient traffic even when the campaign is paused. Reduced
      // motion alone freezes this clock; background-tab gaps remain bounded.
      if (lastTime !== undefined && wasAnimating && animating)
        clock += Math.min(0.25, Math.max(0, timeSeconds - lastTime));
      lastTime = timeSeconds;
      wasAnimating = animating;
      distance = options.distance;
      const movedFocus =
        !!options.focus &&
        (options.focus.x !== focus.x || options.focus.z !== focus.z);
      if (
        options.focus &&
        Number.isFinite(options.focus.x) &&
        Number.isFinite(options.focus.z)
      )
        focus = { ...options.focus };
      refreshTrackWindow();
      if (
        clock !== previousClock ||
        distance !== previousDistance ||
        movedFocus
      )
        placeTrains();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      trains.dispose();
      for (const mesh of [sleepers, stations]) mesh.dispose();
      for (const mesh of [tracks, ballast, sleepers, stations])
        mesh.geometry.dispose();
      for (const m of [
        material,
        trackMaterial,
        ballastMaterial,
        sleeperMaterial,
      ])
        m.dispose();
      gravelTexture.dispose();
      stats.positions.length = 0;
      stats.countries.length = 0;
      stats.edges = stats.trains = stats.stations = 0;
    },
  };
}
