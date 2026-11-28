import { units } from "./config";
import type { Kind, Point, Team } from "./config";
import type { Match, Unit } from "./engine";
import { clearShot } from "./terrain";

type SoundView = { width: number; height: number; x: number; y: number; scale: number };
export type CombatSound = { kind: Kind; from: Point; impact?: Point; team: Team; to?: Point; targetId?: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const finitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);
const copyPoint = (point: Point): Point => ({ x: point.x, y: point.y });
const MAX_EVENTS = 32;

/** CSS viewport coordinates keep pan/falloff independent of canvas pixel density.
 * Nearby offscreen combat remains audible; far-offscreen sources reach silence.
 */
export function spatialSound(point: Point, view: SoundView): { pan: number; distance: number } {
  if (!finitePoint(point) || ![view.width, view.height, view.x, view.y, view.scale].every(Number.isFinite) ||
      view.width <= 0 || view.height <= 0 || view.scale <= 0) return { pan: 0, distance: 1 };
  const dx = point.x * view.scale + view.x - view.width / 2;
  const dy = point.y * view.scale + view.y - view.height / 2;
  const radius = Math.hypot(view.width, view.height) * .65;
  return {
    pan: clamp(dx / (view.width / 2), -1, 1),
    distance: clamp(Math.hypot(dx, dy) / radius, 0, 1),
  };
}

type Target = { id: number; point: Point; distance: number; removed: boolean };
function likelyTarget(previous: Match, next: Match, before: Unit, after: Unit,
  oldUnits: ReadonlyMap<number, Unit>, newUnits: ReadonlyMap<number, Unit>): Target | undefined {
  const rangeSquared = units[after.kind].range ** 2;
  const candidate = (id: number): Target | undefined => {
    const old = oldUnits.get(id), current = newUnits.get(id);
    let found: Target | undefined;
    // Test matching frames, never a ray between positions from different times.
    // A target that moved out of range may still have been hit earlier in this
    // short snapshot interval; both endpoints are conservative available evidence.
    for (const [source, target] of [[after, current], [before, old]] as const) {
      if (!target || target.hp <= 0 || target.team === source.team || !finitePoint(target)) continue;
      if ((source.kind === "artillery" || source.kind === "aircraft") && target.kind === "aircraft") continue;
      const squared = (target.x - source.x) ** 2 + (target.y - source.y) ** 2;
      if (squared > rangeSquared || (found && squared >= found.distance) ||
        (source.kind !== "aircraft" && target.kind !== "aircraft" && !clearShot(source, target, next.map))) continue;
      found = { id, point: copyPoint(target), distance: squared, removed: Boolean(old && !current) };
    }
    return found;
  };
  // Explicit attack intent has priority over opportunistic fire, as in combat.
  // If that live target survives, a nearby unrelated disappearance is not an impact.
  for (const order of [after.order, before.order]) {
    if (order.mode === "attack") {
      const target = candidate(order.target);
      if (target) return target;
    }
  }
  let closest: Target | undefined;
  const consider = (id: number) => {
    const target = candidate(id);
    if (target && (!closest || target.distance < closest.distance ||
        (target.distance === closest.distance && target.id < closest.id))) closest = target;
  };
  for (const target of next.units) if (target.team !== after.team) consider(target.id);
  for (const target of previous.units) if (target.team !== after.team && !newUnits.has(target.id)) consider(target.id);
  return closest;
}

/** Reconstruct at most one recent shot per surviving source for online guests.
 * Cooldown resets are shooting evidence; health loss, recruitment and map/camera
 * changes are not. Long gaps are intentionally silent instead of replaying a backlog.
 */
export function combatSoundsBetween(previous: Match, next: Match): readonly CombatSound[] {
  const delta = next.elapsed - previous.elapsed;
  if (previous.id !== next.id || previous.map !== next.map || previous.result || next.result ||
      !Number.isFinite(delta) || delta <= 0 || delta > 4) return [];
  const oldUnits = new Map(previous.units.map(unit => [unit.id, unit]));
  const newUnits = new Map(next.units.map(unit => [unit.id, unit]));
  const events: CombatSound[] = [];
  for (const after of [...next.units].sort((a, b) => a.id - b.id)) {
    const before = oldUnits.get(after.id);
    if (!before || before.team !== after.team || before.kind !== after.kind || before.hp <= 0 || after.hp <= 0 ||
        !finitePoint(before) || !finitePoint(after) || !Number.isFinite(before.cooldown) || before.cooldown < 0 ||
        !Number.isFinite(after.cooldown) || after.cooldown <= 0 || after.cooldown > units[after.kind].cooldown + 1e-6) continue;
    const expected = Math.max(0, before.cooldown - delta);
    if (after.cooldown <= expected + .1) continue;
    const target = likelyTarget(previous, next, before, after, oldUnits, newUnits);
    const event: CombatSound = { kind: after.kind, from: copyPoint(after), team: after.team };
    if (target) { event.to = copyPoint(target.point); event.targetId = target.id; }
    if (target && (after.kind !== "light" || target.removed)) event.impact = copyPoint(target.point);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }
  return events;
}
