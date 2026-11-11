import * as THREE from "three";
import { MAP } from "./world";
import { heightAt } from "./map3d-geometry";
import {
  movementRoutes,
  movementArrowHead,
  type MovementPoint,
  type MovementRoute,
} from "./movement-routes";
import type { World } from "./types";

export const MAX_MOVEMENT_ARROW_VERTICES = 60000;
type ArrowSummary = Pick<
  MovementRoute,
  "country" | "color" | "count" | "selected" | "kind" | "from" | "to"
>;
export interface MovementArrowStats {
  routes: number;
  heads: number;
  vertices: number;
  rebuilds: number;
  arrows: ArrowSummary[];
}

/** One vertex-coloured ribbon batch, rebuilt only when disclosed routes change.
 * The surface sampler is the actual rendered terrain, not independent physics. */
export function createMovementArrows(
  scene: THREE.Scene,
  groundHeightAt = heightAt,
) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = "country-movement-arrows";
  mesh.renderOrder = 5;
  scene.add(mesh);
  const stats: MovementArrowStats = {
    routes: 0,
    heads: 0,
    vertices: 0,
    rebuilds: 0,
    arrows: [],
  };
  let signature = "",
    disposed = false;
  const tint = new THREE.Color();
  return {
    get stats(): Readonly<MovementArrowStats> {
      return stats;
    },
    update(
      world: World,
      selectedIds: readonly string[] = [],
      draft: readonly string[] = [],
    ) {
      if (disposed) return;
      const routes = movementRoutes(world, selectedIds, draft, true);
      const next = JSON.stringify(routes);
      if (next === signature) return;
      signature = next;
      const positions: number[] = [],
        colors: number[] = [];
      stats.arrows = [];
      stats.heads = 0;
      for (const route of routes) {
        const ownPositions: number[] = [],
          ownColors: number[] = [];
        const add = (p: MovementPoint, lift: number) => {
          ownPositions.push(
            p.x - MAP.width / 2,
            groundHeightAt(p.x, p.y) + lift,
            p.y - MAP.height / 2,
          );
          ownColors.push(tint.r, tint.g, tint.b);
        };
        const ribbon = (width: number, lift: number, color: string) => {
          tint.set(color);
          for (let index = 1; index < route.points.length; index++) {
            const a = route.points[index - 1],
              b = route.points[index];
            const dx = b.x - a.x,
              dy = b.y - a.y,
              length = Math.hypot(dx, dy);
            if (length < 0.001) continue;
            const nx = (-dy / length) * width,
              ny = (dx / length) * width;
            const steps = Math.min(48, Math.max(1, Math.ceil(length / 7)));
            for (let step = 0; step < steps; step++) {
              if (
                route.kind !== "march" &&
                route.kind !== "front" &&
                step % 3 === 2
              )
                continue;
              const t = step / steps,
                u = (step + 1) / steps;
              const points = [
                { x: a.x + dx * t + nx, y: a.y + dy * t + ny },
                { x: a.x + dx * u + nx, y: a.y + dy * u + ny },
                { x: a.x + dx * u - nx, y: a.y + dy * u - ny },
                { x: a.x + dx * t - nx, y: a.y + dy * t - ny },
              ];
              for (const point of [0, 1, 2, 0, 2, 3]) add(points[point], lift);
            }
          }
        };
        const operation = route.kind === "front" || route.kind === "offensive";
        const width = operation
          ? route.selected
            ? 2.5
            : 1.8
          : route.selected
            ? 1.35
            : 0.95;
        const headSize = operation ? 13 : route.selected ? 8 : 6.5;
        const head = movementArrowHead(route.points, headSize);
        if (route.kind !== "front" && head.length < 3) continue;
        // This batch does not write depth. Draw the complete outline first so
        // the longer outline head cannot paint a crossbar over the shaft.
        ribbon(width + 0.65, 1.15, route.selected ? "#d8dfdf" : "#080e19");
        tint.set(route.selected ? "#d8dfdf" : "#080e19");
        if (route.kind !== "front")
          for (const point of movementArrowHead(route.points, headSize + 1.5))
            add(point, 1.25);
        ribbon(width, 1.23, route.color);
        tint.set(route.color);
        if (route.kind !== "front") for (const point of head) add(point, 1.33);
        if (
          (positions.length + ownPositions.length) / 3 >
          MAX_MOVEMENT_ARROW_VERTICES
        )
          continue;
        positions.push(...ownPositions);
        colors.push(...ownColors);
        if (route.kind !== "front") stats.heads++;
        stats.arrows.push({
          country: route.country,
          color: route.color,
          count: route.count,
          selected: route.selected,
          kind: route.kind,
          from: route.from,
          to: route.to,
        });
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.computeBoundingSphere();
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      stats.routes = stats.arrows.length;
      stats.vertices = positions.length / 3;
      stats.rebuilds++;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      stats.routes = stats.heads = stats.vertices = 0;
      stats.arrows = [];
    },
  };
}
