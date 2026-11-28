import { HEIGHT, WIDTH, difficulty, dist, units } from "./config";
import type { Point } from "./config";
import type { City, Match, Unit } from "./engine";
import { commandUnit, recruitmentCity, setGroupStance, supply } from "./engine";
import { nearestOpen, passable, route, tileAt } from "./terrain";
import { isSupplied } from "./territory";

const strength = (group: Unit[]) => group.reduce((score, unit) => score + units[unit.kind].supply * (0.3 + 0.7 * unit.hp / units[unit.kind].hp), 0);
const near = (group: Unit[], point: Point, radius: number) => group.filter((unit) => dist(unit, point) <= radius);

function move(match: Match, unit: Unit, point: Point) {
  const goal = nearestOpen(point, match.map);
  if (unit.stance === "manual" && unit.order.mode === "move" && dist(unit.order.point, goal) < 0.6) return;
  if (unit.stance === "manual" && unit.order.mode === "hold" && dist(unit, goal) < 0.8) return;
  commandUnit(match, unit.id, { mode: "move", point: goal });
}

// Both teams use the same single minute-long recruitment clock. Only its
// current frontier city needs a unit choice; inactive city slots are not orders.
function chooseProduction(match: Match, red: Unit[]) {
  const city = recruitmentCity(match, 2);
  if (!city?.build) return;
  const { used, capacity } = supply(match, 2);
  const targets = match.cities.filter(candidate => candidate.owner !== 2);
  const target = targets.reduce<City | undefined>((best, candidate) =>
    !best || dist(city, candidate) < dist(city, best) ? candidate : best, undefined) ?? city;
  const samples = [city, target, { x: (city.x + target.x) / 2, y: (city.y + target.y) / 2 }];
  const forest = samples.reduce((sum, point) => sum + [-2, -1, 0, 1, 2]
    .filter(offset => tileAt({ x: point.x + offset, y: point.y + 1 }, match.map) === "forest").length, 0);
  const heavyCount = red.filter(unit => unit.kind === "heavy").length;
  city.build.kind = capacity - used >= 2 && red.length >= 4 &&
    heavyCount / Math.max(1, red.length + 1) < (forest >= 4 ? .14 : .24) ? "heavy" : "light";
}

function attackTarget(match: Match, unit: Unit, target: Unit) {
  if (unit.stance === "manual" && unit.order.mode === "attack" && unit.order.target === target.id) return;
  commandUnit(match, unit.id, { mode: "attack", target: target.id });
}

function suppliedExit(match: Match, unit: Unit): Point | null {
  // Supply queries share one territory flood fill. Search the closest reconnecting
  // edge, not an arbitrary rear city that can itself be surrounded.
  for (let radius = 1; radius <= 40; radius++) {
    let best: Point | null = null, score = Infinity;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const point = { x: Math.floor(unit.x) + dx + .5, y: Math.floor(unit.y) + dy + .5 };
      if (!passable(point, match.map) || !isSupplied(match, 2, point)) continue;
      const distance = dist(unit, point);
      if (distance < score) { best = point; score = distance; }
    }
    if (best) return best;
  }
  const rear = nearestOpen({ x: WIDTH - .5, y: unit.y }, match.map);
  return isSupplied(match, 2, rear) ? rear : null;
}

function operationTarget(match: Match, soldiers: Unit[], targets: City[], blue: Unit[], claimed: Set<number>, lane: number) {
  const inSector = targets.filter(city => !claimed.has(city.id) && Math.abs(city.y - (lane + .5) * HEIGHT / 5) < HEIGHT / 5);
  const unclaimed = targets.filter(city => !claimed.has(city.id));
  // With fewer remaining cities than sectors, share a real city objective rather
  // than recalling every spare sector toward one distant enemy raider.
  const candidates = inSector.length ? inSector : unclaimed.length ? unclaimed : targets;
  const score = (city: City) => {
    const closest = Math.min(...soldiers.map(unit => dist(unit, city)));
    const committed = soldiers.filter(unit => unit.stance === "manual" && unit.order.mode === "move" && dist(unit.order.point, city) < 1.5).length;
    return closest + strength(near(blue, city, 7)) * (match.difficulty === "easy" ? 1.5 : 3) - committed * 5 - city.progress * (city.capturing === 2 ? .5 : 0);
  };
  // Existing move destinations carry the operation through saves and decision
  // ticks. Two path probes per sector are enough to avoid unreachable objectives.
  for (const city of [...candidates].sort((a, b) => score(a) - score(b) || a.id - b.id).slice(0, 2)) {
    const approach = soldiers.reduce((a, b) => dist(a, city) < dist(b, city) ? a : b);
    if (route(approach, city, approach.kind, match.map).length) return city;
  }
  return undefined;
}

export function decide(match: Match) {
  if (match.result || (match.tutorial !== null && match.tutorial < 5) || match.elapsed + 1e-6 < match.nextAi) return;
  const options = difficulty[match.difficulty];
  match.nextAi = match.elapsed + options.period;
  const home = match.cities.filter(city => city.owner === 2);
  const red = match.units.filter(unit => unit.team === 2 && unit.hp > 0).sort((a, b) => a.id - b.id);
  const blue = match.units.filter(unit => unit.team === 1 && unit.hp > 0);
  chooseProduction(match, red);
  if (!red.length) return;
  const targets = match.cities.filter(city => city.owner !== 2);
  const reserved = new Set<number>(), claimed = new Set<number>();
  const defend: number[] = [];

  const pockets = red.filter(unit => unit.pocketed || !isSupplied(match, 2, unit));
  for (const unit of pockets) {
    const exit = suppliedExit(match, unit);
    if (exit) move(match, unit, exit);
    reserved.add(unit.id);
  }
  // One nearby outside soldier can reopen a severed trail while trapped soldiers
  // walk toward it. This remains a physical march; territory is never granted.
  const rescueBudget = Math.max(1, Math.floor(red.length / 10));
  let rescues = 0;
  for (const trapped of pockets) {
    if (rescues >= rescueBudget) break;
    const rescuer = red.filter(unit => !reserved.has(unit.id) && dist(unit, trapped) < 12 && isSupplied(match, 2, unit))
      .sort((a, b) => dist(a, trapped) - dist(b, trapped) || a.id - b.id)[0];
    if (!rescuer || strength(near(blue, trapped, 5)) > strength(near(red, trapped, 9)) * 1.4) continue;
    move(match, rescuer, trapped); reserved.add(rescuer.id); rescues++;
  }

  const threats = home.map(city => ({ city, enemies: near(blue, city, 5) }))
    .filter(item => item.city.capturing === 1 || item.enemies.length)
    .sort((a, b) => b.city.progress - a.city.progress || a.city.id - b.city.id);
  const defenseBudget = Math.max(1, Math.ceil(red.length * .3));
  let defending = 0;
  for (const { city, enemies } of threats) {
    if (!enemies.length || defending >= defenseBudget) continue;
    const responders = red.filter(unit => !reserved.has(unit.id) && dist(unit, city) < 23)
      .sort((a, b) => dist(a, city) - dist(b, city) || a.id - b.id);
    const need = strength(enemies) * (match.difficulty === "easy" ? 1 : 1.25);
    if (strength(responders) < need * .65 && city.capturing !== 1) continue;
    let assigned = 0;
    const target = [...enemies].sort((a, b) => a.hp / units[a.kind].hp - b.hp / units[b.kind].hp || a.id - b.id)[0];
    for (const unit of responders) {
      if (assigned >= need || defending >= defenseBudget) break;
      attackTarget(match, unit, target); reserved.add(unit.id);
      assigned += strength([unit]); defending++;
    }
  }

  // Withdrawal is reserved for badly damaged soldiers under immediate pressure.
  // Equal forces still attack; the previous near-parity retreat gate stalled
  // every map before a single city could be taken.
  for (const unit of red) {
    if (reserved.has(unit.id) || unit.hp / units[unit.kind].hp >= .28 || !near(blue, unit, 5).length) continue;
    const safe = home.filter(city => !near(blue, city, 6).length && isSupplied(match, 2, city))
      .sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id)[0];
    if (safe) { move(match, unit, { x: safe.x + (unit.id % 3 - 1), y: safe.y }); reserved.add(unit.id); }
  }

  const lanes: Unit[][] = Array.from({ length: 5 }, () => []);
  for (const unit of red) if (!reserved.has(unit.id)) lanes[Math.min(4, Math.max(0, Math.floor(unit.y / (HEIGHT / 5))))].push(unit);
  const offensiveRatio = match.difficulty === "easy" ? .6 : match.difficulty === "hard" ? .82 : .72;
  for (let lane = 0; lane < lanes.length; lane++) {
    const soldiers = lanes[lane]; if (!soldiers.length) continue;
    const goal = operationTarget(match, soldiers, targets, blue, claimed, lane);
    if (goal) claimed.add(goal.id);
    const origin = goal ?? blue.reduce<Unit | undefined>((best, unit) => !best || dist(soldiers[0], unit) < dist(soldiers[0], best) ? unit : best, undefined);
    if (!origin) { defend.push(...soldiers.map(unit => unit.id)); continue; }
    const ranked = [...soldiers].sort((a, b) => {
      const cost = (unit: Unit) => dist(unit, origin) + (1 - unit.hp / units[unit.kind].hp) * 8 - (unit.stance === "manual" ? 2 : 0);
      return cost(a) - cost(b) || a.id - b.id;
    });
    const attackCount = !home.length || !targets.length ? ranked.length : Math.max(1, Math.ceil(ranked.length * offensiveRatio));
    const attackers = ranked.slice(0, attackCount);
    defend.push(...ranked.slice(attackCount).map(unit => unit.id));
    const anchor = attackers.reduce((a, b) => dist(a, origin) < dist(b, origin) ? a : b);
    const contact = blue.filter(enemy => attackers.some(unit => dist(unit, enemy) < 7));
    const localRed = near(red, anchor, 10), localBlue = near(blue, anchor, 7);
    // Focus a real nearby opponent with several soldiers. Shared damage/health
    // still apply: this is coordination rather than a difficulty bonus.
    const focus = [...contact].sort((a, b) => {
      const votes = (target: Unit) => attackers.filter(unit => unit.order.mode === "attack" && unit.order.target === target.id).length;
      const score = (target: Unit) => dist(anchor, target) + target.hp / units[target.kind].hp * 2 - votes(target) * 3;
      return score(a) - score(b) || a.id - b.id;
    })[0];
    if (focus && strength(localBlue) > strength(localRed) * 1.9 * options.caution) {
      // An overwhelming defended point is held by reserves until reinforcements
      // arrive; other sectors continue their own operations without resetting.
      defend.push(...attackers.map(unit => unit.id));
      continue;
    }
    for (let index = 0; index < attackers.length; index++) {
      const unit = attackers[index];
      if (focus && dist(unit, focus) < 12) attackTarget(match, unit, focus);
      else if (goal) {
        // Distinct capture positions remain inside the city radius. Troops keep
        // their operation destination until it changes hands or combat intervenes.
        const angle = index * 2.3999632297;
        const radius = index ? .6 : 0;
        move(match, unit, { x: goal.x + Math.cos(angle) * radius, y: goal.y + Math.sin(angle) * radius });
      } else if (blue.length) attackTarget(match, unit, [...blue].sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id)[0]);
    }
  }
  setGroupStance(match, defend, "defend");
}
