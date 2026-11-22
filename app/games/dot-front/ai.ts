import { difficulty, dist, units } from "./config";
import type { City, Match, Unit } from "./engine";
import { orderUnit, send, supply } from "./engine";
import { route, tileAt } from "./terrain";

const strength = (group: Unit[]) => group.reduce((score, unit) => score + units[unit.kind].supply * (0.3 + 0.7 * unit.hp / units[unit.kind].hp), 0);
const near = (group: Unit[], point: City | Unit, radius: number) => group.filter((unit) => dist(unit, point) <= radius);
const squadOrder = (group: Unit[], city: City) => {
  const ready = group.filter((unit) => unit.order.mode !== "move" || dist(unit.order.point, city) > 3);
  if (ready.length) send(ready, city);
};

export function decide(match: Match) {
  if (match.elapsed < match.nextAi) return;
  const options = difficulty[match.difficulty];
  match.nextAi = match.elapsed + options.period;
  const home = match.cities.filter((city) => city.owner === 2);
  const red = match.units.filter((unit) => unit.team === 2);
  const blue = match.units.filter((unit) => unit.team === 1);
  const { used, capacity } = supply(match, 2);
  let free = capacity - used - home.reduce((total, city) => total + (city.build?.kind === "heavy" ? 2 : city.build ? 1 : 0), 0);
  for (const city of home) {
    if (city.build || free < 1) continue;
    const forest = [0, 1, -1, 2, -2].filter((offset) => tileAt({ x: city.x + offset, y: city.y + 1 }) === "forest").length;
    const heavy = free >= 2 && forest < 2 && red.filter((unit) => unit.kind === "heavy").length * 3 <= red.length;
    city.build = { kind: heavy ? "heavy" : "light", elapsed: 0 };
    free -= heavy ? 2 : 1;
  }
  if (!red.length) return;
  const origin = red.reduce((a, b) => a.id < b.id ? a : b);
  const distances = new Map<number, number>();
  const travel = (city: City) => {
    const existing = distances.get(city.id);
    if (existing !== undefined) return existing;
    const length = route(origin, city, "light").length || 100;
    distances.set(city.id, length);
    return length;
  };
  const threatened = home.filter((city) => near(blue, city, 4).length || city.capturing === 1)
    .sort((a, b) => b.progress - a.progress || travel(a) - travel(b))[0];
  if (threatened) {
    const attackers = near(blue, threatened, 5);
    if (strength(red) >= strength(attackers) * options.caution || home.length === 1) {
      squadOrder(red, threatened);
      return;
    }
  }
  const targets = match.cities.filter((city) => city.owner !== 2).map((city) => ({
    city, power: strength(near(blue, city, 5)),
    score: travel(city) + (city.owner ? 8 : 0) + strength(near(blue, city, 5)) * 4,
  })).sort((a, b) => a.score - b.score);
  const goal = targets.find(({ city, power }) =>
    !home.length || (strength(red) >= power * options.caution && (!city.owner || red.length >= options.gather)));
  if (goal) {
    squadOrder(red, goal.city);
  } else if (home.length) {
    const rally = home.filter((city) => city !== threatened).sort((a, b) => travel(a) - travel(b))[0] ?? home[0];
    squadOrder(red, rally);
  }
  if (!targets.length && blue.length) {
    const target = blue.reduce((a, b) => dist(a, origin) < dist(b, origin) ? a : b);
    for (const unit of red) {
      if (unit.order.mode !== "attack" || unit.order.target !== target.id) orderUnit(unit, { mode: "attack", target: target.id });
    }
  }
}
