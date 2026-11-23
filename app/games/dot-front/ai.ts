import { RADIUS, difficulty, dist, units } from "./config";
import type { Point } from "./config";
import type { City, Match, Unit } from "./engine";
import { orderUnit, send, supply } from "./engine";
import { route, tileAt } from "./terrain";

const strength = (group: Unit[]) => group.reduce((score, unit) => score + units[unit.kind].supply * (0.3 + 0.7 * unit.hp / units[unit.kind].hp), 0);
const near = (group: Unit[], point: Point, radius: number) => group.filter((unit) => dist(unit, point) <= radius);
const center = (group: Unit[]): Point => ({
  x: group.reduce((total, unit) => total + unit.x, 0) / group.length,
  y: group.reduce((total, unit) => total + unit.y, 0) / group.length,
});

// Rebuild formations from physical proximity rather than counting distant soldiers
// as available strength. No hidden or non-serializable AI state is needed on resume.
function formations(army: Unit[], limit: number): Unit[][] {
  const remaining = [...army].sort((a, b) => a.id - b.id);
  const groups: Unit[][] = [];
  while (remaining.length) {
    const anchor = remaining.shift()!;
    const group = [anchor];
    remaining.sort((a, b) => dist(a, anchor) - dist(b, anchor) || a.id - b.id);
    while (remaining.length && group.length < limit && dist(remaining[0], anchor) <= 4.8) {
      group.push(remaining.shift()!);
    }
    groups.push(group);
  }
  return groups;
}

function moveGroup(match: Match, group: Unit[], point: Point) {
  // Retain paths already heading to the formation's destination. Repeated A*
  // searches are unnecessary while troops are still en route or capturing.
  const needsOrder = group.some((unit) => unit.order.mode === "move"
    ? dist(unit.order.point, point) > 3.2
    : unit.order.mode === "attack" || dist(unit, point) > 3.2) ||
    (group.every((unit) => unit.order.mode === "hold") && !group.some((unit) => dist(unit, point) <= RADIUS));
  if (needsOrder) send(group, point, match.map);
}

function attackGroup(match: Match, group: Unit[], target: Unit) {
  for (const unit of group) {
    if (unit.order.mode !== "attack" || unit.order.target !== target.id) {
      orderUnit(unit, { mode: "attack", target: target.id }, match.map);
    }
  }
}

function produce(match: Match, home: City[], red: Unit[], blue: Unit[]) {
  const { used, capacity } = supply(match, 2);
  let free = capacity - used - home.reduce((total, city) => total + (city.build ? units[city.build.kind].supply : 0), 0);
  let heavyCount = red.filter((unit) => unit.kind === "heavy").length + home.filter((city) => city.build?.kind === "heavy").length;
  let armySize = red.length + home.filter((city) => city.build).length;
  for (const city of home) {
    if (city.build || free < 1) continue;
    const target = match.cities.filter((other) => other.owner !== 2)
      .sort((a, b) => dist(city, a) - dist(city, b) || a.id - b.id)[0] ?? city;
    const sample = [city, target, { x: (city.x + target.x) / 2, y: (city.y + target.y) / 2 }];
    const forest = sample.reduce((total, point) => total + [-2, -1, 0, 1, 2]
      .filter((offset) => tileAt({ x: point.x + offset, y: point.y + 1 }, match.map) === "forest").length, 0);
    const heavyRatio = forest >= 4 ? 0.16 : 0.28;
    const heavy = free >= 2 && armySize >= 4 && heavyCount / Math.max(armySize, 1) < heavyRatio;
    city.build = { kind: heavy ? "heavy" : "light", elapsed: 0 };
    city.repeat = false;
    free -= heavy ? 2 : 1;
    if (heavy) heavyCount++;
    armySize++;
    // Fresh soldiers assemble locally; strategic decisions move them as a group.
    const safe = home.filter((other) => !near(blue, other, 5).length)
      .sort((a, b) => dist(city, a) - dist(city, b) || a.id - b.id)[0] ?? city;
    city.rally = { x: safe.x, y: safe.y };
  }
}

export function decide(match: Match) {
  if (match.result || (match.tutorial !== null && match.tutorial < 5) || match.elapsed < match.nextAi) return;
  const options = difficulty[match.difficulty];
  match.nextAi = match.elapsed + options.period;
  const home = match.cities.filter((city) => city.owner === 2);
  const red = match.units.filter((unit) => unit.team === 2 && unit.hp > 0);
  const blue = match.units.filter((unit) => unit.team === 1 && unit.hp > 0);
  produce(match, home, red, blue);
  if (!red.length) return;
  const groups = formations(red, options.gather + 4);
  const targets = match.cities.filter((city) => city.owner !== 2);
  const threats = home.map((city) => ({ city, power: strength(near(blue, city, 5)) }))
    .filter(({ city, power }) => power > 0 || city.capturing === 1)
    .sort((a, b) => b.city.progress - a.city.progress || b.power - a.power);
  const assigned = new Map<number, number>();
  const claimed = new Set<number>();
  if (threats.length && match.difficulty !== "easy") {
    groups.sort((a, b) => dist(center(a), threats[0].city) - dist(center(b), threats[0].city));
  }

  for (const group of groups) {
    const origin = center(group);
    const power = strength(group);
    const distances = new Map<number, number>();
    const travel = (city: City) => {
      let length = distances.get(city.id);
      if (length === undefined) {
        // Path cost makes bridges and mountain approaches matter to target choice.
        const path = route(group[0], city, "light", match.map);
        length = path.length ? path.reduce((cost, point, index) => index
          ? cost + dist(path[index - 1], point) * (tileAt(point, match.map) === "forest" ? 1 / units.light.forest : 1)
          : cost, 0) : dist(group[0], city) < 1 ? 0 : 1_000;
        distances.set(city.id, length);
      }
      return length;
    };
    const nearbyEnemies = near(blue, origin, 5.3);
    const enemyPower = strength(nearbyEnemies);
    const localPower = strength(near(red, origin, 5.5));
    const safeHomes = home.filter((city) => strength(near(blue, city, 5)) <= strength(near(red, city, 4)));
    if (home.length && enemyPower * options.caution > localPower * 1.15) {
      const refuge = [...(safeHomes.length ? safeHomes : home)].sort((a, b) =>
        travel(a) + strength(near(blue, a, 5)) * 5 - travel(b) - strength(near(blue, b, 5)) * 5 || a.id - b.id)[0];
      if (dist(origin, refuge) > 2) {
        moveGroup(match, group, refuge);
        continue;
      }
    }

    const defense = threats.find(({ city, power: threat }) =>
      (assigned.get(city.id) ?? 0) < threat * options.caution && travel(city) < (match.difficulty === "easy" ? 9 : 18));
    if (defense) {
      assigned.set(defense.city.id, (assigned.get(defense.city.id) ?? 0) + power);
      const target = near(blue, defense.city, 4.5).sort((a, b) => dist(origin, a) - dist(origin, b) || a.id - b.id)[0];
      if (target && dist(origin, target) <= 5 && localPower >= enemyPower * options.caution) {
        attackGroup(match, group, target);
      } else if (power >= defense.power * options.caution || dist(origin, defense.city) < 3.5) {
        moveGroup(match, group, defense.city);
      } else {
        // An isolated reinforcement joins the nearest friendly formation before defending.
        const helpers = groups.filter((other) => other !== group && other.length >= 2)
          .sort((a, b) => dist(origin, center(a)) - dist(origin, center(b)))[0];
        if (helpers) moveGroup(match, group, center(helpers));
        else {
          const assembly = safeHomes.filter((city) => city !== defense.city)
            .sort((a, b) => travel(a) - travel(b))[0];
          const recovery = targets.filter((city) => city.owner === 0 && !near(blue, city, 5).length)
            .sort((a, b) => travel(a) - travel(b))[0];
          moveGroup(match, group, assembly ?? recovery ?? defense.city);
        }
      }
      continue;
    }

    if (nearbyEnemies.length && localPower >= enemyPower * options.caution) {
      const target = [...nearbyEnemies].sort((a, b) => {
        const score = (unit: Unit) => dist(origin, unit) + (match.difficulty === "hard" ? unit.hp / units[unit.kind].hp : 0);
        return score(a) - score(b) || a.id - b.id;
      })[0];
      attackGroup(match, group, target);
      continue;
    }

    if (!targets.length) {
      const target = [...blue].sort((a, b) => dist(origin, a) - dist(origin, b) || a.id - b.id)[0];
      if (target) attackGroup(match, group, target);
      continue;
    }
    const ranked = targets.map((city) => ({
      city, power: strength(near(blue, city, 5)),
      score: travel(city) + (city.owner ? 8 : 0) + (claimed.has(city.id) ? 12 : 0) +
        strength(near(blue, city, 5)) * (match.difficulty === "easy" ? 2 : match.difficulty === "hard" ? 6 : 4),
    })).sort((a, b) => a.score - b.score || a.city.id - b.city.id);
    const goal = ranked.find((target) => !home.length || power >= target.power * options.caution) ?? ranked[0];
    const minimum = goal.city.owner === 0 ? 2 : options.gather;
    const { used, capacity } = supply(match, 2);
    const ready = !home.length || group.length >= minimum ||
      (used >= capacity && group.length >= 2 && power >= goal.power * options.caution);
    if (ready && (!home.length || power >= goal.power * options.caution)) {
      claimed.add(goal.city.id);
      moveGroup(match, group, goal.city);
    } else {
      // Rally at a safe frontline city, so distant recruits converge and later form
      // a real attacking group instead of borrowing the entire army's strength.
      const rally = [...(safeHomes.length ? safeHomes : home)].sort((a, b) =>
        dist(a, goal.city) - dist(b, goal.city) || a.id - b.id)[0];
      if (rally) moveGroup(match, group, rally);
    }
  }
}
