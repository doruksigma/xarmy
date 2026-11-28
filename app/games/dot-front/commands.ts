import { HEIGHT, MAX_ROUTE_POINTS, WIDTH } from "./config";
import type { GroundKind, Point, Team } from "./config";
import { commandUnit, setGroupStance } from "./engine";
import type { Match, Order } from "./engine";
import { nearestOpen } from "./terrain";

/** Wire commands contain intent only; the authoritative match owns all outcomes. */
export type GameCommand =
  | { kind: "move"; ids: number[]; point: Point }
  | { kind: "order"; ids: number[]; order: Order }
  | { kind: "stance"; ids: number[]; stance: "attack" | "defend" }
  | { kind: "build"; city: number; unit: GroundKind }
  | { kind: "rally"; city: number; point: Point | null };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const point = (value: unknown): value is Point => record(value) &&
  typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y) &&
  value.x >= 0 && value.x <= WIDTH && value.y >= 0 && value.y <= HEIGHT;
const ids = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.length <= 600 &&
  Array.from(value).every(id) && new Set(value).size === value.length;

function isOrder(value: unknown): value is Order {
  if (!record(value)) return false;
  if (value.mode === "hold") return true;
  if (value.mode === "move") return point(value.point);
  if (value.mode === "attack") return id(value.target);
  return value.mode === "route" && Array.isArray(value.points) && value.points.length > 0 &&
    value.points.length <= MAX_ROUTE_POINTS && Array.from(value.points).every(point) && Number.isInteger(value.next) &&
    (value.next as number) >= 0 && (value.next as number) <= value.points.length;
}

/** Shape validation is deliberately separate from authorization against live state. */
export function isGameCommand(value: unknown): value is GameCommand {
  if (!record(value)) return false;
  if (value.kind === "build" || value.kind === "rally") {
    if (!Number.isSafeInteger(value.city) || (value.city as number) < 0) return false;
    return value.kind === "build" ? value.unit === "light" || value.unit === "heavy" : value.point === null || point(value.point);
  }
  if (!ids(value.ids)) return false;
  if (value.kind === "move") return point(value.point);
  if (value.kind === "order") return isOrder(value.order);
  return value.kind === "stance" && (value.stance === "attack" || value.stance === "defend");
}

/** Reject the entire command before applying anything, including mixed-team groups. */
export function canApplyGameCommand(match: Match, team: Team, cmd: GameCommand): boolean {
  if ((team !== 1 && team !== 2) || match.result || !isGameCommand(cmd)) return false;
  if (cmd.kind === "build" || cmd.kind === "rally") return match.cities.some(city => city.id === cmd.city && city.owner === team);
  const own = new Set(match.units.filter(unit => unit.team === team && unit.hp > 0).map(unit => unit.id));
  if (!cmd.ids.every(unit => own.has(unit))) return false;
  if (cmd.kind === "order" && cmd.order.mode === "attack") {
    const target = cmd.order.target;
    return match.units.some(unit => unit.id === target && unit.team !== team && unit.hp > 0);
  }
  return true;
}

/** Returns false for stale or unauthorized commands, with no partial mutation. */
export function applyGameCommand(match: Match, team: Team, cmd: GameCommand): boolean {
  if (!canApplyGameCommand(match, team, cmd)) return false;
  if (cmd.kind === "build" || cmd.kind === "rally") {
    const city = match.cities.find(city => city.id === cmd.city)!;
    if (cmd.kind === "rally") city.rally = cmd.point && nearestOpen(cmd.point, match.map);
    else {
      if (!city.build) city.build = { kind: cmd.unit, elapsed: 0 };
      else city.build.kind = cmd.unit;
      city.repeat = true;
    }
  } else if (cmd.kind === "stance") setGroupStance(match, cmd.ids, cmd.stance);
  else if (cmd.kind === "order") {
    for (const unit of cmd.ids) commandUnit(match, unit, cmd.order);
    if (match.tutorial === 1 && (cmd.order.mode === "move" || cmd.order.mode === "route")) match.tutorial = 2;
    if (match.tutorial === 4 && cmd.order.mode === "attack") match.tutorial = 5;
  } else {
    const requested = new Set(cmd.ids);
    const selected = match.units.filter(unit => requested.has(unit.id));
    const columns = Math.ceil(Math.sqrt(selected.length));
    selected.forEach((unit, index) => {
      const point = {
        x: cmd.point.x + index % columns - (columns - 1) / 2,
        y: cmd.point.y + Math.floor(index / columns) - (Math.ceil(selected.length / columns) - 1) / 2,
      };
      const destination = unit.kind === "aircraft" ? {
        x: Math.max(0, Math.min(WIDTH - .001, point.x)),
        y: Math.max(0, Math.min(HEIGHT - .001, point.y)),
      } : nearestOpen(point, match.map);
      commandUnit(match, unit.id, { mode: "move", point: destination });
    });
    if (match.tutorial === 1) match.tutorial = 2;
  }
  return true;
}
