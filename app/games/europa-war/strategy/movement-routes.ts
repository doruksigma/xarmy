import { GEOGRAPHY } from "./world";
import { visibleFormations } from "./map3d-visuals";
import { movementLegPath, remainingCorridor } from "./land-corridors";
import type { Army, World } from "./types";

export const MAX_MOVEMENT_ARROWS = 256;
const MAX_ROUTE_WAYPOINTS = 16;
export interface MovementPoint {
  x: number;
  y: number;
}
export interface MovementRoute {
  id: string;
  country: string;
  color: string;
  count: number;
  selected: boolean;
  kind: "march" | "planned" | "draft" | "front" | "offensive";
  from: string;
  to: string;
  points: MovementPoint[];
}
function countryTint(color: string): string {
  if (/^#[\da-f]{6}$/i.test(color)) return color;
  if (/^#[\da-f]{3}$/i.test(color))
    return "#" + [...color.slice(1)].map((value) => value + value).join("");
  return "#b6bfa5";
}
function cleanPoints(points: MovementPoint[]) {
  return points.filter(
    (p, i) =>
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      (!i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.001),
  );
}

/** Arrows disclose exactly the same current formations as the map. Only the
 * player's own route queue is displayed; sight of an enemy does not reveal
 * that enemy's future orders. No state, movement progress or RNG is written. */
export function movementRoutes(
  world: World,
  selectedIds: readonly string[] = [],
  draft: readonly string[] = [],
  includeOperations = false,
): MovementRoute[] {
  const selected = new Set(selectedIds);
  const groups = new Map<
    string,
    { armies: Army[]; path: string[]; selected: boolean }
  >();
  for (const formation of visibleFormations(world)) {
    for (const army of formation) {
      if (
        army.strength <= 0 ||
        !world.countries[army.country] ||
        !GEOGRAPHY[army.province]
      )
        continue;
      const own = army.country === world.player;
      if (!army.move && !(own && selected.has(army.id) && army.route.length))
        continue;
      const path = [
        army.province,
        ...(army.move ? [army.move.to] : []),
        ...(own ? army.route : []),
      ]
        .filter(
          (id, index, all) =>
            Boolean(GEOGRAPHY[id]) && (!index || id !== all[index - 1]),
        )
        .slice(0, MAX_ROUTE_WAYPOINTS);
      if (path.length < 2) continue;
      const key = JSON.stringify([
        army.country,
        Boolean(army.move),
        army.move?.kind,
        path,
      ]);
      const group = groups.get(key);
      if (group) {
        group.armies.push(army);
        group.selected ||= selected.has(army.id);
      } else
        groups.set(key, {
          armies: [army],
          path,
          selected: selected.has(army.id),
        });
    }
  }
  const routes: MovementRoute[] = [];
  for (const [id, group] of groups) {
    const army = group.armies[0];
    // Average progress along the corridor, not the average coordinates of units
    // on opposite sides of a bend (which would put the arrow back in the sea).
    const progress = group.armies.reduce(
      (sum, unit) =>
        sum +
        (unit.move
          ? Math.max(
              0,
              Math.min(
                0.94,
                unit.move.progress / Math.max(0.01, unit.move.days),
              ),
            )
          : 0) /
          group.armies.length,
      0,
    );
    const raw: MovementPoint[] = [];
    let lastTo = army.province;
    for (let index = 1; index < group.path.length; index++) {
      const leg = movementLegPath(
        group.path[index - 1],
        group.path[index],
        index === 1 && army.move?.kind === "paradrop",
      );
      if (!leg) break;
      raw.push(
        ...(index === 1 ? remainingCorridor(leg, progress) : leg.slice(1)),
      );
      lastTo = group.path[index];
    }
    const points = cleanPoints(raw);
    if (points.length < 2) continue;
    routes.push({
      id,
      country: army.country,
      color: countryTint(world.countries[army.country].color),
      count: group.armies.length,
      selected: group.selected,
      kind: army.move ? "march" : "planned",
      from: army.province,
      to: lastTo,
      points,
    });
  }
  // The 2D map has its own labelled operation layer. The 3D ribbon batch also
  // needs saved plans/fronts, even while their divisions are stationary.
  if (includeOperations) {
    const own = new Map(
      world.armies
        .filter((army) => army.country === world.player && army.strength > 0)
        .map((army) => [army.id, army]),
    );
    for (const operation of [
      ...world.fronts
        .filter((front) => front.country === world.player)
        .map((front) => ({
          ...front,
          kind: "front" as const,
          path: front.provinces,
        })),
      ...world.plans
        .filter((plan) => plan.country === world.player)
        .map((plan) => ({
          ...plan,
          kind: "offensive" as const,
          path: plan.objectives,
        })),
    ]) {
      const members = [...new Set(operation.armies)]
        .map((id) => own.get(id))
        .filter((army) => army !== undefined);
      if (!members.length) continue;
      const path = (
        operation.kind === "offensive"
          ? [members[0].province, ...operation.path]
          : operation.path
      ).filter((id) => Boolean(GEOGRAPHY[id]));
      const points = cleanPoints(
        path.map((id) => ({ x: GEOGRAPHY[id].x, y: GEOGRAPHY[id].y })),
      );
      if (points.length < 2) continue;
      routes.push({
        id: `operation-${operation.id}`,
        country: world.player,
        color: countryTint(world.countries[world.player].color),
        count: members.length,
        selected: members.some((army) => selected.has(army.id)),
        kind: operation.kind,
        from: path[0],
        to: path.at(-1)!,
        points,
      });
    }
  }
  routes.sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) ||
      Number(b.country === world.player) - Number(a.country === world.player) ||
      a.id.localeCompare(b.id),
  );
  const draftPath = draft
    .filter((id) => Boolean(GEOGRAPHY[id]))
    .slice(0, MAX_ROUTE_WAYPOINTS);
  const draftPoints = cleanPoints(
    draftPath.map((id) => ({ x: GEOGRAPHY[id].x, y: GEOGRAPHY[id].y })),
  );
  if (draftPoints.length > 1)
    routes.unshift({
      id: "draft",
      country: world.player,
      color: countryTint(world.countries[world.player].color),
      count: 0,
      selected: true,
      kind: "draft",
      from: draftPath[0],
      to: draftPath.at(-1)!,
      points: draftPoints,
    });
  return routes.slice(0, MAX_MOVEMENT_ARROWS);
}

/** A true triangle at the final destination, shortened on tiny remaining legs. */
export function movementArrowHead(
  points: readonly MovementPoint[],
  size = 7,
): MovementPoint[] {
  if (points.length < 2) return [];
  const tip = points.at(-1)!,
    previous = points.at(-2)!;
  const dx = tip.x - previous.x,
    dy = tip.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return [];
  const reach = Math.min(length * 0.75, Math.max(0.1, size));
  const ux = dx / length,
    uy = dy / length;
  const x = tip.x - ux * reach,
    y = tip.y - uy * reach;
  return [
    { ...tip },
    { x: x - uy * reach * 0.48, y: y + ux * reach * 0.48 },
    { x: x + uy * reach * 0.48, y: y - ux * reach * 0.48 },
  ];
}
