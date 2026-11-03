import * as THREE from "three";
import {
  buildPlayerRailNetwork,
  playerRailNetworkSignature,
  railPointAt,
  type RailNetwork,
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
  hiddenDistance: 850,
  sleeperDistance: 620,
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
  /** Endpoints of the physical connected edges actually built in this view. */
  provinces: string[];
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
const RED = 0x655052,
  WOOD = 0x625b53;
function station() {
  const roof = new THREE.CylinderGeometry(2.5, 2.5, 5.3, 3)
    .rotateZ(Math.PI / 2)
    .rotateX(Math.PI / 2)
    .scale(1, 0.55, 1)
    .translate(0, 2.4, 0);
  const p: Part[] = [
    box(5.1, 0.3, 4, 0, 0.14, 0, 0x586770),
    box(4.5, 2, 2.8, 0, 1.3, 0, 0x858b90),
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
export function createRailways(
  scene: THREE.Scene,
  groundHeightAt: (mapX: number, mapY: number) => number = heightAt,
) {
  type FittedSegment = {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    ah: number;
    bh: number;
  };
  const fittedSegments = new Map<string, FittedSegment[]>();
  type FittedPath = {
    edge: RailNetwork["edges"][number];
    points: Array<{ x: number; y: number }>;
    frames: Array<{ nx: number; ny: number }>;
    heights: number[];
  };
  // At most four quality profiles per edge in the current network. Camera
  // windows reuse these immutable fits; topology changes clear the whole cache.
  const fittedPaths = new Map<string, FittedPath>();
  function railHeightAt(x: number, y: number) {
    let nearest = Infinity,
      height: number | undefined;
    for (const segment of fittedSegments.get(
      `${Math.floor(x / 24)}:${Math.floor(y / 24)}`,
    ) ?? []) {
      const dx = segment.bx - segment.ax,
        dy = segment.by - segment.ay;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - segment.ax) * dx + (y - segment.ay) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      const separation =
        (x - segment.ax - dx * t) ** 2 + (y - segment.ay - dy * t) ** 2;
      if (separation < nearest) {
        nearest = separation;
        height = segment.ah + (segment.bh - segment.ah) * t;
      }
    }
    return nearest < 1e-4 && height !== undefined
      ? height
      : groundHeightAt(x, y);
  }
  function at(mapX: number, mapY: number, lift = 0, fitted = false) {
    return position.set(
      mapX - MAP.width / 2,
      (fitted ? railHeightAt(mapX, mapY) : groundHeightAt(mapX, mapY)) + lift,
      mapY - MAP.height / 2,
    );
  }
  function pose(
    x: number,
    y: number,
    heading: number,
    size = 1,
    lift = 0.13,
    fitted = false,
  ) {
    rotation.setFromAxisAngle(axisY, -heading);
    return matrix.compose(
      at(x, y, lift, fitted),
      rotation,
      scale.setScalar(size),
    );
  }
  const group = new THREE.Group();
  group.name = "capital-connected-railways";
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.22,
  });
  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0x758691,
    metalness: 0.65,
    roughness: 0.5,
  });
  const gravel = new Uint8Array(64 * 64 * 4);
  let seed = 45139;
  for (let i = 0; i < gravel.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 45 + (seed >>> 24) * 0.24;
    gravel[i] = grain;
    gravel[i + 1] = grain * 1.03;
    gravel[i + 2] = grain * 1.08;
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
    color: 0x494d50,
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
  stations.name = "railway-stations";
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
    windowSignature = "",
    builtSelection = "";
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
    provinces: [],
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
    const visibleStations = network.stations.filter(
      (entry) =>
        Math.hypot(entry.point.x - bounds.x, entry.point.y - bounds.y) <=
        bounds.radius,
    );
    const selection = `${quality}:${visibleEdges.map((edge) => `${edge.from}>${edge.to}`).join(",")}:${visibleStations.map((entry) => entry.province).join(",")}`;
    // Moving to another camera bucket can still show exactly the same complete
    // network. Reuse its fitted mesh rather than resampling terrain while panning.
    if (selection === builtSelection) return;
    builtSelection = selection;
    // A shared node has one physical cross-section. Per-edge endpoint normals
    // would leave the two offset rails separated even at the same city anchor.
    const nodeDirections = new Map<string, Array<{ x: number; y: number }>>();
    for (const edge of network.edges) {
      const ends = [
        [edge.from, edge.points[0], edge.points[1]],
        [edge.to, edge.points.at(-1)!, edge.points.at(-2)!],
      ] as const;
      for (const [id, a, b] of ends) {
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const values = nodeDirections.get(id) ?? [];
        values.push({ x: (b.x - a.x) / length, y: (b.y - a.y) / length });
        nodeDirections.set(id, values);
      }
    }
    const sharedTangents = new Map<
      string,
      { x: number; y: number; stretch: number }
    >();
    for (const [id, directions] of nodeDirections) {
      if (directions.length < 2) continue;
      let a = directions[0],
        b = directions[1],
        opposition = Infinity;
      for (let i = 0; i < directions.length; i++)
        for (let j = i + 1; j < directions.length; j++) {
          const dot =
            directions[i].x * directions[j].x +
            directions[i].y * directions[j].y;
          if (dot < opposition) {
            opposition = dot;
            a = directions[i];
            b = directions[j];
          }
        }
      const length = Math.hypot(a.x - b.x, a.y - b.y) || 1,
        x = (a.x - b.x) / length,
        y = (a.y - b.y) / length;
      const stretch = Math.min(
        1.7,
        1 / Math.max(0.35, Math.abs(x * a.x + y * a.y)),
      );
      sharedTangents.set(id, { x, y, stretch });
    }
    const segmentLength =
      quality === "low" ? 3 : quality === "medium" ? 2 : 1.3;
    const railPositions: number[] = [],
      railIndices: number[] = [];
    const bedPositions: number[] = [],
      bedIndices: number[] = [],
      bedUvs: number[] = [];
    let sleeperCount = 0;
    fittedSegments.clear();
    const paths = visibleEdges.map((edge) => {
      const pathKey = `${quality}:${edge.from}>${edge.to}`;
      const cached = fittedPaths.get(pathKey);
      if (cached) return { ...cached, heights: cached.heights.slice() };
      let points: Array<{ x: number; y: number }> = [edge.points[0]];
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
      const makeFrames = () =>
        points.map((_p, i) => {
          const a = points[Math.max(0, i - 1)],
            b = points[Math.min(points.length - 1, i + 1)];
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          let nx = -(b.y - a.y) / length,
            ny = (b.x - a.x) / length;
          const endpoint =
            i === 0 ? edge.from : i === points.length - 1 ? edge.to : null;
          const shared = endpoint ? sharedTangents.get(endpoint) : undefined;
          if (shared) {
            const sign = -shared.y * nx + shared.x * ny < 0 ? -1 : 1;
            nx = -shared.y * shared.stretch * sign;
            ny = shared.x * shared.stretch * sign;
          }
          return { nx, ny };
        });
      let frames = makeFrames();
      // Terrain is a piecewise-planar mesh. Its creases can rise through the
      // interior of a long rail strip even when both end vertices are grounded.
      // Refine only those spans, on the unchanged validated centerline. Work is
      // bounded and happens with the cached track window, never per frame.
      const maximumPoints = Math.min(4096, points.length * 8);
      if (groundHeightAt !== heightAt) {
        for (let pass = 0; pass < 6 && points.length < maximumPoints; pass++) {
          const refined: typeof points = [points[0]];
          let added = 0;
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
              b = points[i];
            const na = frames[i - 1],
              nb = frames[i];
            let needsSplit = false;
            for (const offset of [
              -1.35, -1.03, -0.88, -0.75, -0.62, 0.62, 0.75, 0.88, 1.03, 1.35,
            ]) {
              const ax = a.x + na.nx * offset * TRAIN_WORLD_SCALE;
              const ay = a.y + na.ny * offset * TRAIN_WORLD_SCALE;
              const bx = b.x + nb.nx * offset * TRAIN_WORLD_SCALE;
              const by = b.y + nb.ny * offset * TRAIN_WORLD_SCALE;
              const ah = groundHeightAt(ax, ay),
                bh = groundHeightAt(bx, by);
              for (const t of [0.25, 0.5, 0.75]) {
                if (
                  groundHeightAt(ax + (bx - ax) * t, ay + (by - ay) * t) -
                    (ah + (bh - ah) * t) >
                  0.04
                ) {
                  needsSplit = true;
                  break;
                }
              }
              if (needsSplit) break;
            }
            if (needsSplit && points.length + added < maximumPoints) {
              refined.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              added++;
            }
            refined.push(b);
          }
          if (!added) break;
          points = refined;
          frames = makeFrames();
        }
      }
      const heights = points.map((p, i) =>
        groundHeightAt === heightAt
          ? heightAt(p.x, p.y)
          : Math.max(
              ...[-1.03, -0.88, -0.75, -0.62, 0, 0.62, 0.75, 0.88, 1.03].map(
                (offset) =>
                  groundHeightAt(
                    p.x + frames[i].nx * offset * TRAIN_WORLD_SCALE,
                    p.y + frames[i].ny * offset * TRAIN_WORLD_SCALE,
                  ),
              ),
            ),
      );
      if (groundHeightAt !== heightAt) {
        // A rail bed is level across its gauge. Fit short local embankments to
        // measured terrain steps; never raise the entire network. Both adjacent
        // rows share any required correction so no triangle clips a crease.
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            na = frames[i - 1],
            nb = frames[i];
          let correction = 0;
          for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
            for (const offset of [
              -1.03, -0.88, -0.75, -0.62, 0, 0.62, 0.75, 0.88, 1.03,
            ]) {
              const x =
                a.x +
                (b.x - a.x) * t +
                (na.nx + (nb.nx - na.nx) * t) * offset * TRAIN_WORLD_SCALE;
              const y =
                a.y +
                (b.y - a.y) * t +
                (na.ny + (nb.ny - na.ny) * t) * offset * TRAIN_WORLD_SCALE;
              correction = Math.max(
                correction,
                groundHeightAt(x, y) -
                  (heights[i - 1] + (heights[i] - heights[i - 1]) * t) -
                  0.04,
              );
            }
          }
          heights[i - 1] += correction;
          heights[i] += correction;
        }
      }
      const path = { edge, points, frames, heights };
      fittedPaths.set(pathKey, path);
      return { ...path, heights: heights.slice() };
    });
    // Every branch at the same node uses the same fitted vertical anchor too.
    const nodeHeights = new Map<string, number>();
    for (const { edge, heights } of paths) {
      nodeHeights.set(
        edge.from,
        Math.max(nodeHeights.get(edge.from) ?? -Infinity, heights[0]),
      );
      nodeHeights.set(
        edge.to,
        Math.max(nodeHeights.get(edge.to) ?? -Infinity, heights.at(-1)!),
      );
    }
    for (const { edge, points, heights } of paths) {
      heights[0] = nodeHeights.get(edge.from)!;
      heights[heights.length - 1] = nodeHeights.get(edge.to)!;
      if (groundHeightAt === heightAt) continue;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        const segment = {
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
          ah: heights[i - 1],
          bh: heights[i],
        };
        for (
          let x = Math.floor(Math.min(a.x, b.x) / 24);
          x <= Math.floor(Math.max(a.x, b.x) / 24);
          x++
        )
          for (
            let y = Math.floor(Math.min(a.y, b.y) / 24);
            y <= Math.floor(Math.max(a.y, b.y) / 24);
            y++
          ) {
            const key = `${x}:${y}`,
              bucket = fittedSegments.get(key) ?? [];
            bucket.push(segment);
            fittedSegments.set(key, bucket);
          }
      }
    }
    for (const { points, frames, heights } of paths) {
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
            (Math.abs(offset) > 1.03 || groundHeightAt === heightAt
              ? groundHeightAt(x, y)
              : heights[i]) +
              lift * TRAIN_WORLD_SCALE,
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
              (groundHeightAt === heightAt
                ? groundHeightAt(x, y)
                : heights[i]) +
                lift * TRAIN_WORLD_SCALE,
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
              true,
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
    for (const entry of visibleStations) {
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
    stats.provinces = [
      ...new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to])),
    ];
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
    const candidates = (visible ? network.routes : [])
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
          railHeightAt(front.x, front.y) - railHeightAt(back.x, back.y),
          length * 0.8,
        );
        poses.push({
          kind: car.kind,
          position: at(p.x, p.y, 0.46 * TRAIN_WORLD_SCALE, true).clone(),
          // A rigid carriage follows its axle chord through a junction; using
          // one segment heading would snap its entire body at the city anchor.
          angle: -Math.atan2(front.y - back.y, front.x - back.x),
          pitch,
          scale: size,
          wheelPhase: -d / (TRAIN_DIMENSIONS.wheelRadius * size),
        });
      }
      const p = railPointAt(route, head),
        locomotivePosition = at(p.x, p.y, 0.46 * TRAIN_WORLD_SCALE, true);
      stats.countries.push(route.country ?? "");
      stats.positions.push({
        x: locomotivePosition.x,
        y: locomotivePosition.y,
        z: locomotivePosition.z,
      });
    }
    trains.update(poses, clock, { quality, paused: false, reduced: false });
    // Hide physical transport details in the continental atlas. The connected
    // network and traffic clock stay intact; a near zoom restores the current
    // traffic positions rather than rebuilding routes or restarting trains.
    tracks.visible = ballast.visible = visible;
    sleepers.visible =
      visible && distance <= (quality === "low" ? 520 : LIMITS.sleeperDistance);
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
      const key = playerRailNetworkSignature(world);
      if (key === oldSignature) return;
      oldSignature = key;
      network = buildPlayerRailNetwork(world);
      builtSelection = "";
      fittedPaths.clear();
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
      fittedSegments.clear();
      fittedPaths.clear();
      stats.positions.length = 0;
      stats.countries.length = 0;
      stats.provinces.length = 0;
      stats.edges = stats.trains = stats.stations = 0;
    },
  };
}
