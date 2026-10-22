import { portZone, seaRoute, shipOperational } from "./military-assets";
import { GEOGRAPHY } from "./world";
import type { SeaZone, World } from "./types";

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
  const paths = [
      {
        province: seller.capital,
        provinces: [seller.capital],
        seas: [] as SeaZone[],
      },
    ],
    seen = new Set([seller.capital]);
  for (const path of paths) {
    if (path.province === buyer.capital) {
      let delivery = 1;
      for (const zone of new Set(path.seas)) {
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
        provinces: path.provinces,
        seas: [...new Set(path.seas)],
        delivery,
      };
    }
    for (const edge of [...GEOGRAPHY[path.province].neighbors].sort(
      (a, b) => Number(a.sea) - Number(b.sea),
    )) {
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
        if ([path.province, edge.id].includes("ussr-13")) continue;
        const route = seaRoute(
          w,
          to,
          portZone(path.province),
          portZone(edge.id),
        );
        if (!route) continue;
        seas = route;
      }
      seen.add(edge.id);
      paths.push({
        province: edge.id,
        provinces: [...path.provinces, edge.id],
        seas: [...path.seas, ...seas],
      });
    }
  }
  return null;
}
