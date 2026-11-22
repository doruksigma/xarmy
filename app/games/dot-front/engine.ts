import { CAPTURE, GRACE, RADIUS, SUPPLY, dist, units } from "./config";
import type { Difficulty, Kind, Owner, Point, Team } from "./config";
import { cities, clearShot, nearestOpen, passable, route, tileAt } from "./terrain";

export type Order =
  | { mode: "hold" }
  | { mode: "move"; point: Point }
  | { mode: "attack"; target: number };

export type Unit = Point & {
  id: number; team: Team; kind: Kind; hp: number; cooldown: number;
  order: Order; path: Point[]; waypoint: number; replan: number; marked: boolean;
};
export type City = Point & {
  id: number; owner: Owner; capturing: Owner; progress: number; rally: Point | null;
  build: { kind: Kind; elapsed: number } | null; repeat: boolean;
};
export type Result = "won" | "lost" | "draw";
export type Match = {
  version: 1; id: string; difficulty: Difficulty; map: "valley"; elapsed: number; nextId: number;
  units: Unit[]; cities: City[]; shortage: [number, number]; nextAi: number;
  result: Result | null; report: { captured: number; killed: number; fallen: number };
  tutorial: number | null;
};
export type Flash = { from: Point; to: Point; team: Team; expires: number };

export function createMatch(difficulty: Difficulty, id: string, tutorial: boolean): Match {
  const match: Match = {
    version: 1, id, difficulty, map: "valley", elapsed: 0, nextId: 1,
    units: [], cities: cities.map((city, id) => ({
      ...city, id, capturing: 0, progress: 0, rally: null, build: null, repeat: false,
    })),
    shortage: [0, 0], nextAi: tutorial ? 45 : 2, result: null,
    report: { captured: 0, killed: 0, fallen: 0 }, tutorial: tutorial ? 0 : null,
  };
  for (const city of [match.cities[0], match.cities[2]]) {
    spawn(match, city, "light");
    spawn(match, city, "light");
    spawn(match, city, "light");
    spawn(match, city, "heavy");
  }
  return match;
}

export function supply(match: Match, team: Team) {
  return {
    used: match.units.reduce((total, unit) => total + (unit.team === team ? units[unit.kind].supply : 0), 0),
    capacity: match.cities.filter((city) => city.owner === team).length * SUPPLY,
  };
}

function spawn(match: Match, city: City, kind: Kind) {
  if (!city.owner) return;
  const spots = [
    { x: city.x - 1, y: city.y }, { x: city.x, y: city.y + 1 },
    { x: city.x + 1, y: city.y }, { x: city.x, y: city.y - 1 },
    { x: city.x - 0.65, y: city.y + 0.65 }, { x: city.x + 0.65, y: city.y + 0.65 },
    { x: city.x + 0.65, y: city.y - 0.65 }, { x: city.x - 0.65, y: city.y - 0.65 },
  ];
  const point = spots.find((spot) => passable(spot) && match.units.every((unit) => dist(unit, spot) > 0.35))
    ?? nearestOpen(city);
  const unit: Unit = {
    ...point, id: match.nextId++, team: city.owner, kind, hp: units[kind].hp, cooldown: 0,
    order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
  };
  match.units.push(unit);
  if (city.rally) orderUnit(unit, { mode: "move", point: city.rally });
}

export function orderUnit(unit: Unit, order: Order) {
  unit.order = order;
  unit.waypoint = 0;
  unit.replan = 0;
  unit.path = order.mode === "move" ? route(unit, order.point, unit.kind) : [];
}

export function send(group: Unit[], point: Point) {
  const slots = [nearestOpen(point)];
  for (let radius = 1; slots.length < group.length && radius < 12; radius++) {
    const origin = slots[0];
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const candidate = { x: origin.x + x, y: origin.y + y };
        if (Math.max(Math.abs(x), Math.abs(y)) === radius && passable(candidate)) slots.push(candidate);
      }
    }
  }
  // Allocate close formation positions first so crossing paths stay short.
  const available = [...group];
  for (const slot of slots.slice(0, group.length)) {
    const best = available.reduce((closest, unit, index) =>
      dist(unit, slot) < dist(available[closest], slot) ? index : closest, 0);
    const [unit] = available.splice(best, 1);
    orderUnit(unit, { mode: "move", point: slot });
  }
  for (const unit of available) orderUnit(unit, { mode: "move", point: slots[0] });
}

class UnitIndex {
  private buckets = new Map<string, Unit[]>();

  constructor(units: Unit[]) {
    for (const unit of units) {
      const key = this.key(unit.x, unit.y);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(unit);
      else this.buckets.set(key, [unit]);
    }
  }

  private key(x: number, y: number) {
    return Math.floor(x / 3) + ":" + Math.floor(y / 3);
  }

  nearby(point: Point, radius: number) {
    const found: Unit[] = [];
    for (let y = point.y - radius; y <= point.y + radius + 3; y += 3) {
      for (let x = point.x - radius; x <= point.x + radius + 3; x += 3) {
        const bucket = this.buckets.get(this.key(x, y));
        if (bucket) found.push(...bucket);
      }
    }
    return found.filter((unit) => dist(unit, point) <= radius);
  }
}

function walk(unit: Unit, dt: number) {
  const point = unit.path[unit.waypoint];
  if (!point) {
    if (unit.order.mode === "move") orderUnit(unit, { mode: "hold" });
    return;
  }
  const stats = units[unit.kind];
  const speed = stats.speed * (tileAt(unit) === "forest" ? stats.forest : 1);
  const length = dist(unit, point);
  const fraction = length ? Math.min(1, speed * dt / length) : 1;
  unit.x += (point.x - unit.x) * fraction;
  unit.y += (point.y - unit.y) * fraction;
  if (fraction === 1) unit.waypoint++;
}

function fight(match: Match, index: UnitIndex, dt: number, flashes: Flash[]) {
  const byId = new Map(match.units.map((unit) => [unit.id, unit]));
  const damage = new Map<number, number>();
  for (const unit of match.units) {
    const stats = units[unit.kind];
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    const target = unit.order.mode === "attack" ? byId.get(unit.order.target) : undefined;
    if (unit.order.mode === "attack" && (!target || target.team === unit.team)) orderUnit(unit, { mode: "hold" });
    const inRange = (other: Unit) => other.team !== unit.team && dist(unit, other) <= stats.range && clearShot(unit, other);
    const victim = target && inRange(target) ? target : index.nearby(unit, stats.range)
      .filter(inRange).sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id)[0];
    if (victim && unit.cooldown <= 1e-6) {
      unit.cooldown = stats.cooldown;
      damage.set(victim.id, (damage.get(victim.id) ?? 0) + stats.damage);
      flashes.push({ from: { x: unit.x, y: unit.y }, to: { x: victim.x, y: victim.y }, team: unit.team, expires: match.elapsed + 0.18 });
    }
    if (target && !inRange(target)) {
      const endpoint = unit.path.at(-1);
      if (unit.replan <= match.elapsed && (!endpoint || unit.waypoint >= unit.path.length ||
          dist(endpoint, target) > stats.range || !clearShot(endpoint, target))) {
        const choices = [
          { x: target.x + 1, y: target.y }, { x: target.x - 1, y: target.y },
          { x: target.x, y: target.y + 1 }, { x: target.x, y: target.y - 1 }, target,
        ].map(nearestOpen).filter((point) => clearShot(point, target));
        choices.sort((a, b) => dist(a, unit) - dist(b, unit));
        unit.path = route(unit, choices[0] ?? target, unit.kind);
        unit.waypoint = 0;
        unit.replan = match.elapsed + 0.8 + (unit.id % 7) * 0.07;
      }
      walk(unit, dt);
    } else if (!target) walk(unit, dt);
  }
  for (const unit of match.units) {
    unit.hp -= damage.get(unit.id) ?? 0;
    if (damage.has(unit.id) && unit.hp <= 0 && unit.team === 2) match.report.killed++;
  }
}

function takeCities(match: Match, index: UnitIndex, dt: number) {
  for (const city of match.cities) {
    let blue = false;
    let red = false;
    for (const unit of index.nearby(city, RADIUS)) {
      if (unit.team === 1) blue = true;
      else red = true;
    }
    if (blue && red) continue;
    const contender = blue ? 1 : red ? 2 : 0;
    if (!contender || contender === city.owner) {
      city.capturing = 0;
      city.progress = 0;
      continue;
    }
    if (city.capturing !== contender) city.progress = 0;
    city.capturing = contender;
    city.progress += dt;
    if (city.progress + 1e-6 < CAPTURE) continue;
    city.owner = contender;
    city.progress = 0;
    city.capturing = 0;
    city.build = null;
    city.repeat = false;
    city.rally = null;
    if (contender === 1) {
      match.report.captured++;
      if (match.tutorial === 2) match.tutorial = 3;
    }
  }
}

function supplyAndBuild(match: Match, dt: number) {
  for (const team of [1, 2] as const) {
    const { used, capacity } = supply(match, team);
    let excess = used - capacity;
    let current = used;
    match.shortage[team - 1] = excess > 0 ? match.shortage[team - 1] + dt : 0;
    for (const unit of match.units.filter((unit) => unit.team === team).sort((a, b) => b.id - a.id)) {
      unit.marked = excess > 0;
      if (!unit.marked) continue;
      excess -= units[unit.kind].supply;
      if (match.shortage[team - 1] + 1e-6 >= GRACE) unit.hp -= 3 * dt;
    }
    for (const city of match.cities) {
      if (city.owner !== team || !city.build) continue;
      const stats = units[city.build.kind];
      if (current + stats.supply > capacity) continue;
      city.build.elapsed += dt;
      if (city.build.elapsed + 1e-6 < stats.build) continue;
      spawn(match, city, city.build.kind);
      current += stats.supply;
      city.build = city.repeat ? { kind: city.build.kind, elapsed: 0 } : null;
    }
  }
}

function removeDead(match: Match) {
  match.report.fallen += match.units.filter((unit) => unit.hp <= 0 && unit.team === 1).length;
  match.units = match.units.filter((unit) => unit.hp > 0);
  const ids = new Set(match.units.map((unit) => unit.id));
  for (const unit of match.units) {
    if (unit.order.mode === "attack" && !ids.has(unit.order.target)) orderUnit(unit, { mode: "hold" });
  }
}

export function step(match: Match, dt: number, flashes: Flash[], decide: (match: Match) => void) {
  if (match.result) return;
  match.elapsed += dt;
  decide(match);
  fight(match, new UnitIndex(match.units), dt, flashes);
  removeDead(match);
  takeCities(match, new UnitIndex(match.units), dt);
  supplyAndBuild(match, dt);
  removeDead(match);
  const survives = (team: Team) => match.cities.some((city) => city.owner === team) ||
    match.units.some((unit) => unit.team === team);
  const blue = survives(1);
  const red = survives(2);
  if (!blue || !red) match.result = blue ? "won" : red ? "lost" : "draw";
}
