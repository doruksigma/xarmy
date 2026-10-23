import { portZone, seaRoute, shipOperational } from "./military-assets";
import { GEOGRAPHY } from "./world";
import type { SeaZone, World } from "./types";

// Map topology is fixed; preserve the existing land-first BFS order without
// copying and sorting every province's neighbors for every trade each day.
const neighbors = Object.fromEntries(
  Object.entries(GEOGRAPHY).map(([id, p]) => [
    id,
    [...p.neighbors].sort((a, b) => Number(a.sea) - Number(b.sea)),
  ]),
);
const ports = Object.fromEntries(
  Object.keys(GEOGRAPHY).map((id) => [id, portZone(id)]),
);

export function tradeRoute(
  w: World,
  from: string,
  to: string,
): { provinces: string[]; seas: SeaZone[]; delivery: number } | null {
  const buyer = w.countries[to],
    seller = w.countries[from];
  if (
    !buyer ||
    !seller ||
    buyer.wars.includes(from) ||
    seller.embargoes.includes(to) ||
    buyer.embargoes.includes(from)
  )
    return null;
  const queue = [seller.capital],
    seen = new Set(queue),
    previous = new Map<string, { province: string; seas: SeaZone[] }>(),
    seaPaths = new Map<string, SeaZone[] | null>();
  for (const province of queue) {
    if (province === buyer.capital) {
      const provinces = [province],
        legs: SeaZone[][] = [];
      let step = previous.get(province);
      while (step) {
        provinces.push(step.province);
        legs.push(step.seas);
        step = previous.get(step.province);
      }
      provinces.reverse();
      const seas = [...new Set(legs.reverse().flat())];
      let delivery = 1;
      for (const zone of seas) {
        const raiders = buyer.wars
          .flatMap((id) =>
            w.countries[id].navy.ships.filter((s) =>
              shipOperational(w, w.countries[id], s),
            ),
          )
          .filter((s) => s.zone === zone && s.mission === "raid" && !s.transit)
          .reduce((n, s) => n + s.health / 100, 0);
        const escorts = [buyer, ...buyer.allies.map((id) => w.countries[id])]
          .flatMap((c) => c.navy.ships.filter((s) => shipOperational(w, c, s)))
          .filter(
            (s) =>
              s.zone === zone &&
              ["patrol", "escort"].includes(s.mission) &&
              !s.transit,
          )
          .reduce(
            (n, s) =>
              n + ((s.model === "destroyer" ? 2 : 0.5) * s.health) / 100,
            0,
          );
        delivery *= Math.max(0.15, 1 - (raiders * 0.15) / (1 + escorts));
      }
      return {
        provinces,
        seas,
        delivery,
      };
    }
    for (const edge of neighbors[province]) {
      if (seen.has(edge.id)) continue;
      const controller = w.provinces[edge.id].controller;
      if (
        buyer.wars.includes(controller) ||
        seller.wars.includes(controller) ||
        w.countries[controller].embargoes.includes(to)
      )
        continue;
      let seas: SeaZone[] = [];
      if (edge.sea) {
        if ([province, edge.id].includes("ussr-13")) continue;
        const fromZone = ports[province],
          toZone = ports[edge.id],
          key = `${fromZone}:${toZone}`;
        if (!seaPaths.has(key))
          seaPaths.set(key, seaRoute(w, to, fromZone, toZone));
        const route = seaPaths.get(key);
        if (!route) continue;
        seas = route;
      }
      seen.add(edge.id);
      previous.set(edge.id, { province, seas });
      queue.push(edge.id);
    }
  }
  return null;
}
