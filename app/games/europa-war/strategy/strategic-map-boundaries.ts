import { MAP } from "./world";
import boundaries from "./strategic-map-boundaries.json";
import type { World } from "./types";

type Point = { x: number; y: number };
type Edge = { a: Point; b: Point; provinces: string[]; path: string };
type BoundaryGroup = {
  provinces: string[];
  path: string;
  kind: "country" | "hostile";
};
export type StrategicBorder = Edge & { kind: BoundaryGroup["kind"] };
export type CommandBoundary = {
  id: string;
  name: string;
  target: string;
  stance: "defend" | "attack";
  color: string;
  path: string;
  provinces: string[];
};
const FRONT_COLORS = ["#95ca79", "#a99be7", "#80c5dc", "#e5b971", "#d894ad"];

/** Geography is prepared offline from original SVG province polygons. The
 * browser classifies only 1,966 province pairs, never clips polygons or imports
 * Three.js. Static country outlines continue to supply the coast layer. */
function borderGroups(world: World): BoundaryGroup[] {
  const result: BoundaryGroup[] = [];
  for (const group of boundaries.groups) {
    const controllers = [
      ...new Set(
        group.provinces
          .map((id) => world.provinces[id]?.controller)
          .filter(Boolean),
      ),
    ];
    if (controllers.length < 2) continue;
    const hostile = controllers.some((a) =>
      controllers.some((b) => world.countries[a]?.wars.includes(b)),
    );
    result.push({ ...group, kind: hostile ? "hostile" : "country" });
  }
  return result;
}
const segmentCache = new Map<string, Edge[]>();
/** Exact immutable edge coordinates are exposed for geographic validation.
 * Rendering uses grouped paths directly and never expands these segments. */
export function strategicBoundarySegments(world: World): StrategicBorder[] {
  return borderGroups(world).flatMap((group) => {
    const key = `${group.provinces.join("|")}:${group.path}`;
    let edges = segmentCache.get(key);
    if (!edges) {
      edges = (group.path.match(/M[^M]+/g) ?? []).map((path) => {
        const [ax, ay, bx, by] = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        return {
          a: { x: ax, y: ay },
          b: { x: bx, y: by },
          provinces: group.provinces,
          path,
        };
      });
      segmentCache.set(key, edges);
    }
    return edges.map((edge) => ({ ...edge, kind: group.kind }));
  });
}
export const boundaryPath = (edges: readonly Edge[]) =>
  edges.map((edge) => edge.path).join("");

/** Only real, currently assigned player commanders expose battle-plan ribbons. */
export function commanderBoundaryPaths(
  world: World,
  groups = borderGroups(world),
): CommandBoundary[] {
  return world.countries[world.player].generals.flatMap((general, index) => {
    if (!general.front) return [];
    const target = general.front.target;
    const edges = groups.filter(
      (edge) =>
        edge.provinces.some(
          (id) => world.provinces[id].controller === world.player,
        ) &&
        edge.provinces.some((id) => world.provinces[id].controller === target),
    );
    if (!edges.length) return [];
    return [
      {
        id: general.id,
        name: general.name,
        target,
        stance: general.front.stance,
        color: FRONT_COLORS[index % FRONT_COLORS.length],
        path: edges.map((edge) => edge.path).join(""),
        provinces: [...new Set(edges.flatMap((edge) => edge.provinces))],
      },
    ];
  });
}
let lastSignature = "";
let lastOverlay:
  | {
      country: string;
      hostile: string;
      fronts: CommandBoundary[];
    }
  | undefined;
/** Rebuild SVG paths only on ownership, war, player or commander-order changes,
 * not every simulation hour, selection, hover or compositor pan. */
export function strategicMapOverlay(world: World) {
  const signature = JSON.stringify([
    world.player,
    MAP.provinces.map((p) => world.provinces[p.id].controller),
    Object.values(world.countries).map((c) => [c.id, c.wars]),
    world.countries[world.player].generals.map((g) => [
      g.id,
      g.name,
      g.front?.target,
      g.front?.stance,
    ]),
  ]);
  if (lastOverlay && signature === lastSignature) return lastOverlay;
  const groups = borderGroups(world);
  lastSignature = signature;
  lastOverlay = {
    country: groups
      .filter((group) => group.kind === "country")
      .map((group) => group.path)
      .join(""),
    hostile: groups
      .filter((group) => group.kind === "hostile")
      .map((group) => group.path)
      .join(""),
    fronts: commanderBoundaryPaths(world, groups),
  };
  return lastOverlay;
}
