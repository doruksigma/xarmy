import { RADIUS, difficulty, dist, units } from "./config";
import type { Point } from "./config";
import type { City, Commander, Match, Unit } from "./engine";
import { commandCommander, commanderLeader, commanderMembers, supply } from "./engine";
import { route, tileAt } from "./terrain";

const strength = (group: Unit[]) => group.reduce((score, unit) => score + units[unit.kind].supply * (0.3 + 0.7 * unit.hp / units[unit.kind].hp), 0);
const near = (group: Unit[], point: Point, radius: number) => group.filter((unit) => dist(unit, point) <= radius);

function moveCommander(match: Match, commander: Commander, members: Unit[], point: Point) {
  const sameDestination = commander.order.mode === "move" && dist(commander.order.point, point) < 1.5;
  const arrived = members.some((unit) => dist(unit, point) <= RADIUS);
  if (sameDestination && (arrived || members.some((unit) => unit.order.mode === "move"))) return;
  if (commander.order.mode === "hold" && arrived && !commander.autoFront) return;
  commandCommander(match, commander.id, { mode: "move", point: { x: point.x, y: point.y } });
}

function holdCommander(match: Match, commander: Commander) {
  if (commander.order.mode !== "hold" || commander.autoFront) commandCommander(match, commander.id, { mode: "hold" });
}

function attackCommander(match: Match, commander: Commander, target: Unit) {
  if (commander.order.mode !== "attack" || commander.order.target !== target.id || commander.autoFront) {
    commandCommander(match, commander.id, { mode: "attack", target: target.id });
  }
}

// Every owned city already runs the same ten-second automatic cycle as the
// player's cities. AI only chooses its unit type; it never resets/advances time.
function chooseProduction(match: Match, home: City[], red: Unit[]) {
  const { used, capacity } = supply(match, 2);
  const active = home.filter((city) => city.build);
  let free = capacity - used - active.reduce((total, city) => total + units[city.build!.kind].supply, 0);
  let heavyCount = red.filter((unit) => unit.kind === "heavy").length + active.filter((city) => city.build!.kind === "heavy").length;
  const plannedSize = red.length + active.length;
  const targets = match.cities.filter((city) => city.owner !== 2);
  for (const city of active) {
    const build = city.build!;
    free += units[build.kind].supply;
    if (build.kind === "heavy") heavyCount--;
    const target = [...targets].sort((a, b) => dist(city, a) - dist(city, b) || a.id - b.id)[0] ?? city;
    const samples = [city, target, { x: (city.x + target.x) / 2, y: (city.y + target.y) / 2 }];
    const forest = samples.reduce((total, point) => total + [-2, -1, 0, 1, 2]
      .filter((offset) => tileAt({ x: point.x + offset, y: point.y + 1 }, match.map) === "forest").length, 0);
    const ratio = forest >= 4 ? 0.14 : 0.24;
    const heavy = free >= 2 && red.length >= 4 && heavyCount / Math.max(1, plannedSize) < ratio;
    build.kind = heavy ? "heavy" : "light";
    free -= units[build.kind].supply;
    if (heavy) heavyCount++;
  }
}

export function decide(match: Match) {
  if (match.result || (match.tutorial !== null && match.tutorial < 5) || match.elapsed < match.nextAi) return;
  const options = difficulty[match.difficulty];
  match.nextAi = match.elapsed + options.period;
  const home = match.cities.filter((city) => city.owner === 2);
  const red = match.units.filter((unit) => unit.team === 2 && unit.hp > 0);
  const blue = match.units.filter((unit) => unit.team === 1 && unit.hp > 0);
  chooseProduction(match, home, red);
  if (!red.length) return;

  // Commander membership is durable engine state. Do not split formations or
  // reassign recruits merely because their current positions happen to be close.
  const squads = match.commanders.filter((commander) => commander.team === 2).flatMap((commander) => {
    const leader = commanderLeader(match, commander.id);
    if (!leader) return [];
    const members = commanderMembers(match, commander.id);
    return [{ commander, leader, members, assembled: near(members, leader, 8) }];
  });
  const targets = match.cities.filter((city) => city.owner !== 2);
  const cityPower = new Map(match.cities.map((city) => [city.id, strength(near(blue, city, 8))]));
  const threats = home.map((city) => ({ city, power: cityPower.get(city.id)! }))
    .filter(({ city, power }) => power > 0 || city.capturing === 1)
    .sort((a, b) => b.city.progress - a.city.progress || b.power - a.power);
  const safeHomes = home.filter((city) => (cityPower.get(city.id) ?? 0) <= strength(near(red, city, 7)));
  const assigned = new Map<number, number>();
  const claimed = new Set<number>();
  const distances = new Map<string, number>();
  const { used, capacity } = supply(match, 2);
  if (threats.length && match.difficulty !== "easy") {
    squads.sort((a, b) => dist(a.leader, threats[0].city) - dist(b.leader, threats[0].city) || a.commander.id - b.commander.id);
  }

  for (const { commander, leader, members, assembled } of squads) {
    const power = strength(assembled);
    let searches = 0;
    const travel = (city: City) => {
      const key = `${commander.id}:${city.id}`;
      const cached = distances.get(key);
      if (cached !== undefined) return cached;
      // The large map has 50 cities. Score cheaply first; at most four candidate
      // routes per commander are inspected during an entire decision, cached here.
      if (searches >= 4) return dist(leader, city) + 4;
      searches++;
      const path = route(leader, city, leader.kind, match.map);
      const length = path.length ? path.reduce((cost, point, index) => index
        ? cost + dist(path[index - 1], point) * (tileAt(point, match.map) === "forest" ? 1 / units[leader.kind].forest : 1)
        : cost, 0) : dist(leader, city) < 1 ? 0 : 10_000;
      distances.set(key, length);
      return length;
    };
    const localEnemies = near(blue, leader, 8);
    const enemyPower = strength(localEnemies);
    const localPower = strength(near(red, leader, 9));
    const nearestSafe = [...(safeHomes.length ? safeHomes : home)]
      .sort((a, b) => dist(leader, a) + (cityPower.get(a.id) ?? 0) * 5 - dist(leader, b) - (cityPower.get(b.id) ?? 0) * 5 || a.id - b.id)
      .slice(0, 2).sort((a, b) => travel(a) - travel(b))[0];

    if (nearestSafe && enemyPower * options.caution > localPower * 1.15 && dist(leader, nearestSafe) > 2) {
      moveCommander(match, commander, members, nearestSafe);
      continue;
    }

    const defense = threats.filter(({ city, power: threat }) =>
      (assigned.get(city.id) ?? 0) < threat * options.caution && dist(leader, city) < (match.difficulty === "easy" ? 18 : 30))
      .sort((a, b) => dist(leader, a.city) - dist(leader, b.city))[0];
    if (defense) {
      const target = near(blue, defense.city, 7).sort((a, b) => dist(leader, a) - dist(leader, b) || a.id - b.id)[0];
      if (target && dist(leader, target) <= 8 && localPower >= enemyPower * options.caution && assembled.length >= 2) {
        assigned.set(defense.city.id, (assigned.get(defense.city.id) ?? 0) + power);
        attackCommander(match, commander, target);
        continue;
      }
      if (power >= defense.power * options.caution && assembled.length >= 2) {
        assigned.set(defense.city.id, (assigned.get(defense.city.id) ?? 0) + power);
        moveCommander(match, commander, members, defense.city);
        continue;
      }
      // Distant recruits are not counted as present combat strength. Keep the
      // commander intact at a safe assembly point while followers catch up.
      if (nearestSafe && dist(nearestSafe, defense.city) > 5) {
        moveCommander(match, commander, members, nearestSafe);
        continue;
      }
    }

    if (localEnemies.length && localPower >= enemyPower * options.caution && assembled.length >= 2) {
      const target = [...localEnemies].sort((a, b) => {
        const score = (unit: Unit) => dist(leader, unit) + (match.difficulty === "hard" ? unit.hp / units[unit.kind].hp : 0);
        return score(a) - score(b) || a.id - b.id;
      })[0];
      attackCommander(match, commander, target);
      continue;
    }
    if (!targets.length) {
      const target = [...blue].sort((a, b) => dist(leader, a) - dist(leader, b) || a.id - b.id)[0];
      if (target) attackCommander(match, commander, target);
      continue;
    }

    // Strong defenders make neighboring, weakly defended cities more attractive;
    // separate commanders can attack distinct flanks instead of one giant blob.
    const candidates = targets.map((city) => ({ city, power: cityPower.get(city.id) ?? 0 }))
      .sort((a, b) => {
        const score = ({ city, power: defenders }: typeof a) => dist(leader, city) + (claimed.has(city.id) ? 18 : 0) +
          defenders * (match.difficulty === "easy" ? 2 : match.difficulty === "hard" ? 5 : 3) -
          (city.capturing === 2 ? city.progress : 0);
        return score(a) - score(b) || a.city.id - b.city.id;
      }).slice(0, match.difficulty === "easy" ? 2 : 4)
      .map((candidate) => ({ ...candidate, cost: travel(candidate.city) + candidate.power * options.caution * 3 +
        (claimed.has(candidate.city.id) ? 18 : 0) - (candidate.city.capturing === 2 ? candidate.city.progress : 0) }))
      .sort((a, b) => a.cost - b.cost || a.city.id - b.city.id);
    const goal = candidates.find((candidate) => !home.length || power >= candidate.power * options.caution) ?? candidates[0];
    const minimum = goal.city.owner === 0 ? 2 : options.gather;
    const ready = !home.length || assembled.length >= minimum ||
      (used >= capacity && assembled.length >= 2 && power >= goal.power * options.caution);
    if (ready && (!home.length || power >= goal.power * options.caution)) {
      claimed.add(goal.city.id);
      moveCommander(match, commander, members, goal.city);
    } else {
      const assembly = [...(safeHomes.length ? safeHomes : home)]
        .sort((a, b) => dist(a, goal.city) + dist(leader, a) * 0.25 - dist(b, goal.city) - dist(leader, b) * 0.25 || a.id - b.id)[0];
      if (assembly && dist(leader, assembly) > 2) moveCommander(match, commander, members, assembly);
      else holdCommander(match, commander);
    }
  }
}
