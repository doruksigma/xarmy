import { CAPTURE, CITY_PRODUCTION, FRONT_ATTACK_ADVANCE, FRONT_ATTACK_COMMIT_DISTANCE, FRONT_ATTACK_SEARCH, FRONT_INTERVAL, FRONT_REPLAN_DISTANCE, MAX_ROUTE_POINTS, GRACE, HEIGHT, POCKET_DAMAGE, POCKET_FIREPOWER, POCKET_GRACE, POCKET_SPEED, RADIUS, SUPPLY, WIDTH, dist, units } from "./config";
import type { Difficulty, Kind, Owner, Point, Team } from "./config";
import { clearShot, getMap, nearestOpen, passable, route, tileAt } from "./terrain";
import type { MapId } from "./terrain";
import { frontDirection, frontSlots } from "./front";
import { advanceTerritory, createTerritory, isSupplied, resolveEnclosures, territoryCell, territoryOwner } from "./territory";
import type { Territory } from "./territory";

export type Order =
  | { mode: "hold" }
  | { mode: "move"; point: Point }
  | { mode: "attack"; target: number }
  | { mode: "route"; points: Point[]; next: number };

export type Unit = Point & {
  id: number; team: Team; kind: Kind; hp: number; cooldown: number; stance: Stance | "manual"; nextOrder: number;
  pocketed: boolean; pocketTime: number;
  order: Order; path: Point[]; waypoint: number; replan: number; marked: boolean;
};
export type City = Point & {
  id: number; owner: Owner; capturing: Owner; progress: number; rally: Point | null;
  build: { kind: Kind; elapsed: number } | null; repeat: boolean;
};
export type Stance = "attack" | "defend";
export type Result = "won" | "lost" | "draw";
export type Match = {
  version: 6; id: string; difficulty: Difficulty; map: MapId; elapsed: number; nextId: number; territory: Territory;
  units: Unit[]; cities: City[]; shortage: [number, number]; nextAi: number;
  result: Result | null; report: { captured: number; killed: number; fallen: number };
  tutorial: number | null;
};
export type Flash = { from: Point; to: Point; team: Team; expires: number };

export function createMatch(difficulty: Difficulty, id: string, tutorial: boolean, map: MapId = "valley"): Match {
  const match: Match = {
    version: 6, id, difficulty, map, elapsed: 0, nextId: 1, territory: createTerritory(map),
    units: [], cities: getMap(map).cities.map((city, id) => ({
      ...city, id, capturing: 0, progress: 0, rally: null,
      build: city.owner ? { kind: "light", elapsed: 0 } : null, repeat: !!city.owner,
    })),
    shortage: [0, 0], nextAi: tutorial ? 45 : 2, result: null,
    report: { captured: 0, killed: 0, fallen: 0 }, tutorial: tutorial ? 0 : null,
  };
  for (const team of [1, 2] as const) {
    for (let index = 0; index < 25; index++) {
      const y = 2.5 + index * (HEIGHT - 5) / 24;
      const point = openSpawn(match, { x: WIDTH / 2 + (team === 1 ? -5 : 5), y });
      makeUnit(match, team, "light", point).nextOrder = FRONT_INTERVAL;
    }
  }
  advanceTerritory(match);
  updatePockets(match, 0);
  return match;
}

export function supply(match: Match, team: Team) {
  return {
    used: match.units.reduce((total, unit) => total + (unit.team === team ? units[unit.kind].supply : 0), 0),
    capacity: match.cities.filter((city) => city.owner === team).length * SUPPLY,
  };
}

function makeUnit(match: Match, team: Team, kind: Kind, point: Point): Unit {
  const unit: Unit = {
    ...point, id: match.nextId++, team, kind, hp: units[kind].hp, cooldown: 0,
    stance: "defend", nextOrder: match.elapsed,
    pocketed: false, pocketTime: 0,
    order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
  };
  match.units.push(unit);
  return unit;
}

function openSpawn(match: Match, origin: Point, team?: Team): Point {
  const center = nearestOpen(origin, match.map);
  for (let ring = 0; ring <= 8; ring++) for (let y = -ring; y <= ring; y++) for (let x = -ring; x <= ring; x++) {
    if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
    const point = { x: center.x + x, y: center.y + y };
    if (passable(point, match.map) && (!team || isSupplied(match, team, point)) &&
      match.units.every((unit) => dist(unit, point) > 0.5)) return point;
  }
  return center;
}

function spawn(match: Match, city: City, kind: Kind): Unit | undefined {
  if (!city.owner) return;
  // Captured cities may be connected by a very thin corridor. A new soldier
  // must not appear in an isolated enemy cell and die before its first order.
  const unit = makeUnit(match, city.owner, kind, openSpawn(match, city, city.owner));
  if (city.rally) commandUnit(match, unit.id, { mode: "move", point: city.rally });
  return unit;
}

/** Compatibility helper: nearest friendly slot on the living-army front. */
export function frontlinePoint(match: Match, team: Team, origin: Point): Point {
  const count = Math.max(25, match.units.filter((unit) => unit.team === team && unit.hp > 0).length);
  const slots = frontSlots(match, team, count);
  return slots.reduce((best, point) => dist(point, origin) < dist(best, origin) ? point : best,
    slots[0] ?? nearestOpen(origin, match.map));
}

function copyOrder(order: Order): Order {
  if (order.mode === "move") return { mode: "move", point: { x: order.point.x, y: order.point.y } };
  if (order.mode === "route") return { mode: "route", points: order.points.map((point) => ({ x: point.x, y: point.y })), next: order.next };
  return { ...order };
}

function validOrder(match: Match, team: Team, order: Order): boolean {
  const point = (value: Point) => Number.isFinite(value?.x) && Number.isFinite(value?.y) &&
    value.x >= 0 && value.y >= 0 && value.x <= WIDTH && value.y <= HEIGHT;
  if (order.mode === "move") return point(order.point);
  if (order.mode === "route") return Array.isArray(order.points) && order.points.length > 0 &&
    order.points.length <= MAX_ROUTE_POINTS && order.points.every(point) && Number.isInteger(order.next) &&
    order.next >= 0 && order.next <= order.points.length;
  if (order.mode === "attack") return match.units.some((unit) => unit.id === order.target && unit.team !== team && unit.hp > 0);
  return order.mode === "hold";
}

/** A direct order affects exactly one soldier and remains independent of automation. */
export function commandUnit(match: Match, id: number, order: Order): void {
  if (match.result) return;
  const unit = match.units.find((item) => item.id === id && item.hp > 0);
  if (!unit || !validOrder(match, unit.team, order)) return;
  unit.stance = "manual";
  unit.nextOrder = match.elapsed + FRONT_INTERVAL;
  orderUnit(unit, order.mode === "move" ? { mode: "move", point: nearestOpen(order.point, match.map) } : order, match.map);
}

/** Apply a stance in one batch, allocating the whole side once rather than per click. */
export function setGroupStance(match: Match, ids: readonly number[], stance: Stance): void {
  if (match.result || (stance !== "attack" && stance !== "defend")) return;
  const selected = new Set(ids), teams = new Set<Team>();
  for (const unit of match.units) {
    if (!selected.has(unit.id) || unit.hp <= 0) continue;
    if (unit.stance === stance) continue;
    unit.stance = stance;
    unit.nextOrder = match.elapsed;
    teams.add(unit.team);
  }
  for (const team of teams) autoFront(match, team);
}

export function setUnitStance(match: Match, id: number, stance: Stance): void {
  setGroupStance(match, [id], stance);
}

function uniqueTarget(match: Match, point: Point, occupied: Set<string>): Point {
  const center = nearestOpen(point, match.map);
  for (let ring = 0; ring <= 12; ring++) for (let y = -ring; y <= ring; y++) for (let x = -ring; x <= ring; x++) {
    if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
    const candidate = { x: center.x + x, y: center.y + y }, key = `${candidate.x}:${candidate.y}`;
    if (passable(candidate, match.map) && !occupied.has(key)) { occupied.add(key); return candidate; }
  }
  occupied.add(`${center.x}:${center.y}`);
  return center;
}

function attackDestination(match: Match, unit: Unit, friendly: Point, direction: Point): Point {
  // A short projection can land in a river or mountain and nearestOpen would
  // snap it back onto our own bank. Search beyond the obstacle for actual enemy
  // ground; A* then takes the soldier through a legal crossing to reach it.
  for (let distance = FRONT_ATTACK_ADVANCE; distance <= FRONT_ATTACK_SEARCH; distance += FRONT_ATTACK_ADVANCE) {
    const point = nearestOpen({ x: friendly.x + direction.x * distance, y: friendly.y + direction.y * distance }, match.map);
    const advance = (point.x - unit.x) * direction.x + (point.y - unit.y) * direction.y;
    if (advance >= FRONT_ATTACK_COMMIT_DISTANCE && territoryOwner(match, point) !== unit.team) return point;
  }
  const enemies = match.units.filter(other => other.team !== unit.team && other.hp > 0)
    .sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id);
  return nearestOpen(enemies[0] ?? { x: unit.x + direction.x * FRONT_ATTACK_ADVANCE, y: unit.y + direction.y * FRONT_ATTACK_ADVANCE }, match.map);
}

/** Allocate a unique target to each automated soldier across the entire front. */
function autoFront(match: Match, forceTeam?: Team) {
  if (forceTeam === undefined && match.tutorial !== null && match.tutorial < 5) return;
  for (const team of [1, 2] as const) {
    if (forceTeam !== undefined && forceTeam !== team) continue;
    // Existing destinations preserve lane order. New troops enter beside the
    // nearest existing lane instead of moving the whole line toward their city.
    const lane = (unit: Unit) => unit.order.mode === "move" ? unit.order.point.y : unit.y;
    const members = match.units.filter(unit => unit.team === team && unit.hp > 0 && unit.stance !== "manual")
      .sort((a, b) => lane(a) - lane(b) || a.id - b.id);
    if (!members.length || (forceTeam === undefined && !members.some(unit => match.elapsed + 1e-6 >= unit.nextOrder))) continue;
    const slots = frontSlots(match, team, members.length), occupied = new Set<string>();
    // Once an assault has a route, commit to that destination. Re-sampling a
    // growing captured corridor each second must not pull attackers backwards.
    const committed = new Set<number>();
    for (const unit of members) {
      if (unit.stance !== "attack" || unit.order.mode !== "move" || unit.waypoint >= unit.path.length ||
          dist(unit, unit.order.point) <= FRONT_ATTACK_COMMIT_DISTANCE) continue;
      committed.add(unit.id);
      occupied.add(`${unit.order.point.x}:${unit.order.point.y}`);
    }
    for (let index = 0; index < members.length; index++) {
      const unit = members[index];
      unit.nextOrder = match.elapsed + FRONT_INTERVAL;
      if (committed.has(unit.id)) continue;
      const friendly = slots[index];
      if (!friendly) continue;
      const candidate = unit.stance === "attack" ? attackDestination(match, unit, friendly, frontDirection(match, team, friendly)) : friendly;
      const goal = uniqueTarget(match, candidate, occupied);
      const oldGoal = unit.order.mode === "move" ? unit.order.point : null;
      if (oldGoal && dist(oldGoal, goal) <= FRONT_REPLAN_DISTANCE) continue;
      if (!oldGoal && dist(unit, goal) <= 0.4) continue;
      orderUnit(unit, { mode: "move", point: goal }, match.map);
    }
  }
}

function planRouteSegment(unit: Unit, map: MapId): boolean {
  if (unit.order.mode !== "route") return false;
  // At most 128 skipped segments: disconnected or duplicate destinations cannot
  // lock the simulation or shortcut later reachable drawn waypoints.
  let attempts = 0;
  while (unit.order.next < unit.order.points.length && attempts++ < MAX_ROUTE_POINTS) {
    const goal = nearestOpen(unit.order.points[unit.order.next], map);
    if (dist(unit, goal) < 1e-7) { unit.order.next++; continue; }
    unit.path = route(unit, goal, unit.kind, map);
    unit.waypoint = 0;
    if (unit.path.length) return true;
    unit.order.next++;
  }
  unit.order = { mode: "hold" }; unit.path = []; unit.waypoint = 0;
  return false;
}

export function orderUnit(unit: Unit, order: Order, map: MapId = "valley") {
  unit.order = copyOrder(order);
  unit.waypoint = 0;
  unit.replan = 0;
  unit.path = order.mode === "move" ? route(unit, order.point, unit.kind, map) : [];
  if (unit.order.mode === "route") planRouteSegment(unit, map);
}

export function send(group: Unit[], point: Point, map: MapId = "valley") {
  if (!group.length) return;
  for (const unit of group) unit.stance = "manual";
  const slots = [nearestOpen(point, map)];
  for (let radius = 1; slots.length < group.length && radius < 12; radius++) {
    const origin = slots[0];
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const candidate = { x: origin.x + x, y: origin.y + y };
        if (Math.max(Math.abs(x), Math.abs(y)) === radius && passable(candidate, map)) slots.push(candidate);
      }
    }
  }
  // Allocate close formation positions first so crossing paths stay short.
  const available = [...group];
  for (const slot of slots.slice(0, group.length)) {
    const best = available.reduce((closest, unit, index) =>
      dist(unit, slot) < dist(available[closest], slot) ? index : closest, 0);
    const [unit] = available.splice(best, 1);
    orderUnit(unit, { mode: "move", point: slot }, map);
  }
  for (const unit of available) orderUnit(unit, { mode: "move", point: slots[0] }, map);
}

class UnitIndex {
  private static readonly size = 3;
  private static readonly cols = Math.ceil(WIDTH / UnitIndex.size);
  private static readonly rows = Math.ceil(HEIGHT / UnitIndex.size);
  private buckets = new Map<number, Unit[]>();

  constructor(units: Unit[]) {
    for (const unit of units) {
      const key = Math.floor(unit.y / UnitIndex.size) * UnitIndex.cols + Math.floor(unit.x / UnitIndex.size);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(unit);
      else this.buckets.set(key, [unit]);
    }
  }

  nearby(point: Point, radius: number) {
    const found: Unit[] = [], squared = radius * radius;
    const minX = Math.max(0, Math.floor((point.x - radius) / UnitIndex.size));
    const maxX = Math.min(UnitIndex.cols - 1, Math.floor((point.x + radius) / UnitIndex.size));
    const minY = Math.max(0, Math.floor((point.y - radius) / UnitIndex.size));
    const maxY = Math.min(UnitIndex.rows - 1, Math.floor((point.y + radius) / UnitIndex.size));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const bucket = this.buckets.get(y * UnitIndex.cols + x);
        if (!bucket) continue;
        for (const unit of bucket) {
          const dx = unit.x - point.x, dy = unit.y - point.y;
          if (dx * dx + dy * dy <= squared) found.push(unit);
        }
      }
    }
    return found;
  }
}

// Check the complete segment, including very short corner crossings between
// two legal endpoints. Endpoint checks alone let displaced units clip rocks.
export function canTraverse(from: Point, to: Point, map: MapId = "valley"): boolean {
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite) || !passable(from, map) || !passable(to, map)) return false;
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  const endX = Math.floor(to.x);
  const endY = Math.floor(to.y);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const deltaX = sx ? Math.abs(1 / dx) : Infinity;
  const deltaY = sy ? Math.abs(1 / dy) : Infinity;
  let nextX = sx ? ((sx > 0 ? x + 1 : x) - from.x) / dx : Infinity;
  let nextY = sy ? ((sy > 0 ? y + 1 : y) - from.y) / dy : Infinity;
  while (x !== endX || y !== endY) {
    if (Math.abs(nextX - nextY) < 1e-10) {
      if (!passable({ x: x + sx, y }, map) || !passable({ x, y: y + sy }, map)) return false;
      x += sx;
      y += sy;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      x += sx;
      nextX += deltaX;
    } else {
      y += sy;
      nextY += deltaY;
    }
    if (!passable({ x, y }, map)) return false;
  }
  return true;
}

function walk(unit: Unit, dt: number, map: MapId) {
  const stats = units[unit.kind];
  const speed = stats.speed * (tileAt(unit, map) === "forest" ? stats.forest : 1) * (unit.pocketed ? POCKET_SPEED : 1);
  let remaining = speed * dt;
  while (remaining > 0) {
    const point = unit.path[unit.waypoint];
    if (!point) {
      if (unit.order.mode === "route") {
        unit.order.next++;
        if (planRouteSegment(unit, map)) continue;
        return;
      }
      if (unit.order.mode === "move") orderUnit(unit, { mode: "hold" }, map);
      return;
    }
    const length = dist(unit, point);
    if (length < 1e-9) { unit.waypoint++; continue; }
    const travel = Math.min(remaining, length);
    const next = { x: unit.x + (point.x - unit.x) * travel / length, y: unit.y + (point.y - unit.y) * travel / length };
    if (!canTraverse(unit, next, map)) {
      // Soft separation or an old saved waypoint may change the initial
      // approach. Rebuild through the current tile center rather than teleport.
      const goal = unit.order.mode === "move" ? unit.order.point :
        unit.order.mode === "route" ? unit.order.points[unit.order.next] : unit.path.at(-1);
      unit.path = goal ? route(unit, goal, unit.kind, map) : [];
      unit.waypoint = 0;
      unit.replan = 0;
      if (!unit.path.length) {
        if (unit.order.mode === "route") { unit.order.next++; planRouteSegment(unit, map); }
        else orderUnit(unit, { mode: "hold" }, map);
      }
      return;
    }
    unit.x = next.x;
    unit.y = next.y;
    remaining -= travel;
    if (travel >= length) unit.waypoint++;
  }
}

function separate(match: Match, dt: number) {
  const index = new UnitIndex(match.units);
  const displacement = new Map<number, number>();
  for (const unit of match.units) for (const other of index.nearby(unit, 1.2)) {
    if (other.id <= unit.id) continue;
    let dx = unit.x - other.x;
    let dy = unit.y - other.y;
    let length = Math.hypot(dx, dy);
    const minimum = (unit.kind === "heavy" ? 0.56 : 0.42) + (other.kind === "heavy" ? 0.56 : 0.42);
    if (length >= minimum) continue;
    if (length < 1e-9) {
      const angle = (unit.id * 2.399963 + other.id) % (Math.PI * 2);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      length = 1;
    }
    const amount = Math.min((minimum - Math.min(dist(unit, other), minimum)) / 2,
      dt * 0.15 - (displacement.get(unit.id) ?? 0), dt * 0.15 - (displacement.get(other.id) ?? 0));
    if (amount <= 1e-9) continue;
    const ox = dx / length * amount;
    const oy = dy / length * amount;
    const first = { x: unit.x + ox, y: unit.y + oy };
    const second = { x: other.x - ox, y: other.y - oy };
    // Units never become hard pathfinding obstacles: crowded bridges keep moving.
    if (canTraverse(unit, first, match.map)) {
      Object.assign(unit, first);
      displacement.set(unit.id, (displacement.get(unit.id) ?? 0) + amount);
    }
    if (canTraverse(other, second, match.map)) {
      Object.assign(other, second);
      displacement.set(other.id, (displacement.get(other.id) ?? 0) + amount);
    }
  }
}

function fight(match: Match, index: UnitIndex, dt: number, flashes: Flash[]) {
  const byId = new Map(match.units.map((unit) => [unit.id, unit]));
  const damage = new Map<number, number>();
  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    const stats = units[unit.kind];
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    let target = unit.order.mode === "attack" ? byId.get(unit.order.target) : undefined;
    if (unit.order.mode === "attack" && (!target || target.team === unit.team)) {
      orderUnit(unit, { mode: "hold" }, match.map);
      target = undefined;
    }
    const inRange = (other: Unit) => other.team !== unit.team && dist(unit, other) <= stats.range && clearShot(unit, other, match.map);
    let victim = target && inRange(target) ? target : undefined;
    if (!victim) {
      let closest = Infinity;
      for (const other of index.nearby(unit, stats.range)) {
        if (other.team === unit.team) continue;
        const squared = (other.x - unit.x) ** 2 + (other.y - unit.y) ** 2;
        if (squared > closest || (squared === closest && victim && other.id > victim.id) || !clearShot(unit, other, match.map)) continue;
        victim = other; closest = squared;
      }
    }
    if (victim && unit.cooldown <= 1e-6) {
      unit.cooldown = stats.cooldown;
      damage.set(victim.id, (damage.get(victim.id) ?? 0) + stats.damage * (unit.pocketed ? POCKET_FIREPOWER : 1));
      flashes.push({ from: { x: unit.x, y: unit.y }, to: { x: victim.x, y: victim.y }, team: unit.team, expires: match.elapsed + 0.18 });
    }
    if (target && !inRange(target)) {
      const endpoint = unit.path.at(-1);
      if (unit.replan <= match.elapsed && (!endpoint || unit.waypoint >= unit.path.length ||
          dist(endpoint, target) > stats.range || !clearShot(endpoint, target, match.map))) {
        const choices = [
          { x: target.x + 1, y: target.y }, { x: target.x - 1, y: target.y },
          { x: target.x, y: target.y + 1 }, { x: target.x, y: target.y - 1 }, target,
        ].map((point) => nearestOpen(point, match.map)).filter((point) => clearShot(point, target, match.map));
        choices.sort((a, b) => dist(a, unit) - dist(b, unit));
        unit.path = route(unit, choices[0] ?? target, unit.kind, match.map);
        unit.waypoint = 0;
        unit.replan = match.elapsed + 0.8 + (unit.id % 7) * 0.07;
      }
      walk(unit, dt, match.map);
    } else if (!target && !(victim && unit.stance !== "manual")) walk(unit, dt, match.map);
  }
  for (const unit of match.units) {
    unit.hp -= damage.get(unit.id) ?? 0;
  }
}

function captureCity(match: Match, city: City, owner: Team, captured: Set<number>) {
  if (city.owner === owner) return;
  captured.add(city.id);
  city.owner = owner;
  city.progress = 0;
  city.capturing = 0;
  city.build = { kind: "light", elapsed: 0 };
  city.repeat = true;
  city.rally = null;
  if (owner === 1) {
    match.report.captured++;
    if (match.tutorial === 2) match.tutorial = 3;
  }
}

function takeCities(match: Match, index: UnitIndex, dt: number, captured: Set<number>) {
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
    captureCity(match, city, contender, captured);
  }
}

function supplyAndBuild(match: Match, dt: number, captured: ReadonlySet<number>) {
  for (const team of [1, 2] as const) {
    const { used, capacity } = supply(match, team);
    let excess = used - capacity;
    match.shortage[team - 1] = excess > 0 ? match.shortage[team - 1] + dt : 0;
    for (const unit of match.units.filter((unit) => unit.team === team).sort((a, b) => b.id - a.id)) {
      unit.marked = excess > 0;
      if (!unit.marked) continue;
      excess -= units[unit.kind].supply;
      if (match.shortage[team - 1] + 1e-6 >= GRACE) unit.hp -= 3 * dt;
    }
    const ready: City[] = [];
    for (const city of match.cities) {
      if (city.owner !== team) continue;
      if (!city.build) city.build = { kind: "light", elapsed: 0 };
      city.repeat = true;
      if (captured.has(city.id) || !isSupplied(match, team, city)) continue;
      // Each city keeps its own minute. A completed soldier can wait for army
      // capacity, but disconnected cities cannot continue recruitment work.
      city.build.elapsed = Math.min(CITY_PRODUCTION, city.build.elapsed + dt);
      if (city.build.elapsed + 1e-6 >= CITY_PRODUCTION) {
        city.build.elapsed = CITY_PRODUCTION;
        ready.push(city);
      }
    }
    let current = used;
    ready.sort((a, b) => b.build!.elapsed - a.build!.elapsed || a.id - b.id);
    for (const city of ready) {
      const build = city.build!, cost = units[build.kind].supply;
      if (current + cost > capacity) continue;
      spawn(match, city, build.kind);
      current += cost;
      build.elapsed = 0;
      if (team === 1 && match.tutorial === 3) match.tutorial = 4;
    }
  }
  for (const city of match.cities) if (!city.owner) { city.build = null; city.repeat = false; }
}

function removeDead(match: Match) {
  const survivors: Unit[] = [];
  for (const unit of match.units) {
    if (unit.hp > 0) survivors.push(unit);
    else if (unit.team === 1) match.report.fallen++;
    else match.report.killed++;
  }
  // The removal is the only accounting boundary for combat, enclosure and
  // either kind of attrition. Later cleanup passes cannot count this dot again.
  match.units = survivors;
  const ids = new Set(match.units.map((unit) => unit.id));
  for (const unit of match.units) {
    if (unit.order.mode === "attack" && !ids.has(unit.order.target)) orderUnit(unit, { mode: "hold" }, match.map);
  }
}

function takeEnclosures(match: Match, capturedCities: Set<number>) {
  const captured = resolveEnclosures(match);
  if (!captured) return;
  // Land changes hands, never soldiers. Apply both teams' losses before the
  // common cleanup so simultaneous elimination can still produce a draw.
  for (const unit of match.units) {
    const cell = territoryCell(unit), owner = cell >= 0 ? captured[cell] : 0;
    if (!owner || owner === unit.team || unit.hp <= 0) continue;
    unit.hp = 0;
  }
  for (const city of match.cities) {
    const cell = territoryCell(city), owner = cell >= 0 ? captured[cell] : 0;
    if (owner === 1 || owner === 2) captureCity(match, city, owner, capturedCities);
  }
  removeDead(match);
}

/** Supply follows physically connected occupation; reconnection removes every penalty. */
function updatePockets(match: Match, dt: number) {
  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    if (isSupplied(match, unit.team, unit)) {
      unit.pocketed = false;
      unit.pocketTime = 0;
      continue;
    }
    const previous = unit.pocketed ? unit.pocketTime : 0;
    unit.pocketed = true;
    unit.pocketTime = previous + dt;
    const exposed = Math.max(0, unit.pocketTime - POCKET_GRACE) - Math.max(0, previous - POCKET_GRACE);
    unit.hp -= exposed * POCKET_DAMAGE;
  }
}

export function step(match: Match, dt: number, flashes: Flash[], decide: (match: Match) => void) {
  if (match.result || !Number.isFinite(dt) || dt <= 0) return;
  match.elapsed += dt;
  const captured = new Set<number>();
  takeEnclosures(match, captured);
  updatePockets(match, 0);
  autoFront(match);
  decide(match);
  fight(match, new UnitIndex(match.units), dt, flashes);
  removeDead(match);
  separate(match, dt);
  advanceTerritory(match);
  takeEnclosures(match, captured);
  updatePockets(match, dt);
  removeDead(match);
  takeCities(match, new UnitIndex(match.units), dt, captured);
  supplyAndBuild(match, dt, captured);
  // New troops occupy their real spawn footprint; no timers advance twice.
  advanceTerritory(match);
  takeEnclosures(match, captured);
  updatePockets(match, 0);
  removeDead(match);
  const survives = (team: Team) => match.cities.some((city) => city.owner === team) ||
    match.units.some((unit) => unit.team === team);
  const blue = survives(1);
  const red = survives(2);
  if (!blue || !red) match.result = blue ? "won" : red ? "lost" : "draw";
}
