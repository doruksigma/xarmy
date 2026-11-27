import { difficulty, dist, units } from "./config";
import type { Point } from "./config";
import type { City, Match, Unit } from "./engine";
import { commandUnit, setGroupStance, supply } from "./engine";
import { nearestOpen, route, tileAt } from "./terrain";

const strength = (group: Unit[]) => group.reduce((score, unit) => score + units[unit.kind].supply * (0.3 + 0.7 * unit.hp / units[unit.kind].hp), 0);
const near = (group: Unit[], point: Point, radius: number) => group.filter((unit) => dist(unit, point) <= radius);

function move(match: Match, unit: Unit, point: Point) {
  const goal = nearestOpen(point, match.map);
  if (unit.stance === "manual" && unit.order.mode === "move" && dist(unit.order.point, goal) < 0.6) return;
  if (unit.stance === "manual" && unit.order.mode === "hold" && dist(unit, goal) < 0.8) return;
  commandUnit(match, unit.id, { mode: "move", point: goal });
}

// Player and AI cities share this same minute-long engine clock. Choosing a type
// cannot reset or advance production, add supply or change health.
function chooseProduction(match: Match, home: City[], red: Unit[]) {
  const { used, capacity } = supply(match, 2);
  const active = home.filter((city) => city.build);
  let free = capacity - used - active.reduce((sum, city) => sum + units[city.build!.kind].supply, 0);
  let heavyCount = red.filter((unit) => unit.kind === "heavy").length + active.filter((city) => city.build!.kind === "heavy").length;
  const plannedSize = red.length + active.length;
  const targets = match.cities.filter((city) => city.owner !== 2);
  for (const city of active) {
    const build = city.build!;
    free += units[build.kind].supply;
    if (build.kind === "heavy") heavyCount--;
    const target = targets.reduce<City | undefined>((best, candidate) => !best || dist(city, candidate) < dist(city, best) ? candidate : best, undefined) ?? city;
    const samples = [city, target, { x: (city.x + target.x) / 2, y: (city.y + target.y) / 2 }];
    const forest = samples.reduce((sum, point) => sum + [-2, -1, 0, 1, 2]
      .filter((offset) => tileAt({ x: point.x + offset, y: point.y + 1 }, match.map) === "forest").length, 0);
    const heavy = free >= 2 && red.length >= 4 && heavyCount / Math.max(1, plannedSize) < (forest >= 4 ? 0.14 : 0.24);
    build.kind = heavy ? "heavy" : "light";
    free -= units[build.kind].supply;
    if (heavy) heavyCount++;
  }
}

export function decide(match: Match) {
  if (match.result || (match.tutorial !== null && match.tutorial < 5) || match.elapsed + 1e-6 < match.nextAi) return;
  const options = difficulty[match.difficulty];
  match.nextAi = match.elapsed + options.period;
  const home = match.cities.filter((city) => city.owner === 2);
  const red = match.units.filter((unit) => unit.team === 2 && unit.hp > 0).sort((a, b) => a.id - b.id);
  const blue = match.units.filter((unit) => unit.team === 1 && unit.hp > 0);
  chooseProduction(match, home, red);
  if (!red.length) return;

  const targets = match.cities.filter((city) => city.owner !== 2);
  const cityPower = new Map(match.cities.map((city) => [city.id, strength(near(blue, city, 6))]));
  const threats = home.filter((city) => city.capturing === 1 || (cityPower.get(city.id) ?? 0) > 0)
    .sort((a, b) => b.progress - a.progress || a.id - b.id);
  const reserved = new Set<number>();
  const claimed = new Set<number>();
  const attack: number[] = [], defend: number[] = [];
  // Detachments are deliberately small. Most soldiers keep independent positions
  // along the full living-troop front, rather than gathering around one target.
  const detachmentBudget = home.length ? Math.max(1, Math.floor(red.length * 0.24)) : red.length;
  let detached = 0;

  // A threatened city draws its nearest available soldier, not the whole army.
  for (const city of threats) {
    if (detached >= detachmentBudget) break;
    const attackers = near(blue, city, 6);
    const nearby = red.filter((unit) => !reserved.has(unit.id) && dist(unit, city) < 18)
      .sort((a, b) => dist(a, city) - dist(b, city) || a.id - b.id);
    const unit = nearby[0];
    if (!unit || !attackers.length) continue;
    const enemyPower = strength(attackers), nearbyPower = strength(near(red, city, 8));
    if (enemyPower * options.caution > nearbyPower * 1.5 && city.capturing !== 1) continue;
    const target = attackers.sort((a, b) => dist(a, city) - dist(b, city) || a.id - b.id)[0];
    const dx = target.x - city.x, dy = target.y - city.y, length = Math.hypot(dx, dy) || 1;
    move(match, unit, { x: city.x + dx / length * 0.65, y: city.y + dy / length * 0.65 });
    reserved.add(unit.id); detached++;
  }

  for (const unit of red) {
    if (reserved.has(unit.id)) continue;
    const health = unit.hp / units[unit.kind].hp;
    const enemies = near(blue, unit, 6);
    const enemyPower = strength(enemies), localPower = strength(near(red, unit, 8));
    const outmatched = enemyPower * options.caution > localPower * 1.3;

    // Wounded soldiers can fall back separately; other lanes keep their orders.
    if (home.length && health < 0.4 && enemies.length && detached < detachmentBudget) {
      const refuge = home.filter((city) => !(cityPower.get(city.id) ?? 0))
        .sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id)[0];
      if (refuge) {
        move(match, unit, { x: refuge.x + (unit.id % 3 - 1), y: refuge.y });
        detached++; continue;
      }
    }

    const existingRaid = unit.stance === "manual" && unit.order.mode === "move"
      ? targets.find((city) => unit.order.mode === "move" && dist(unit.order.point, city) < 1)
      : unit.stance === "manual" && unit.order.mode === "hold" ? targets.find((city) => dist(unit, city) < 1) : undefined;
    if (existingRaid && detached < detachmentBudget && !claimed.has(existingRaid.id) &&
        (!home.length || (!outmatched && (cityPower.get(existingRaid.id) ?? 0) <= strength(near(red, existingRaid, 8))))) {
      claimed.add(existingRaid.id); detached++; continue;
    }

    // One target per raider keeps capture attempts spread over different cities.
    if (targets.length && detached < detachmentBudget && (!home.length || (!outmatched && health > 0.72))) {
      const candidates = targets.filter((city) => !claimed.has(city.id) &&
        (!home.length || (dist(unit, city) < 14 && Math.abs(unit.y - city.y) < 10)) &&
        (!home.length || (cityPower.get(city.id) ?? 0) < 0.1))
        .sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id).slice(0, 2);
      const target = candidates.find((city) => route(unit, city, unit.kind, match.map).length > 0);
      if (target) {
        move(match, unit, target); claimed.add(target.id); detached++; continue;
      }
    }

    if (!targets.length && blue.length) {
      const target = [...blue].sort((a, b) => dist(unit, a) - dist(unit, b) || a.id - b.id)[0];
      if (unit.order.mode !== "attack" || unit.order.target !== target.id) commandUnit(match, unit.id, { mode: "attack", target: target.id });
      continue;
    }
    // Interleaved reserves cover every latitude. There is no assembly gate or
    // leader radius before these independent soldiers advance.
    const reserve = unit.id % (match.difficulty === "easy" ? 3 : match.difficulty === "hard" ? 5 : 4) === 0;
    (health < 0.58 || outmatched || reserve ? defend : attack).push(unit.id);
  }
  // At most two full-front allocations per decision instead of one per soldier.
  setGroupStance(match, attack, "attack");
  setGroupStance(match, defend, "defend");
}
