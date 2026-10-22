import { AIRCRAFT, SEA_ZONES, SHIPS } from "./advanced-catalog";
import map from "./map-data.json";
import type {
  AirModel,
  Country,
  SeaZone,
  ShipModel,
  Warship,
  World,
} from "./types";

const geography = Object.fromEntries(map.provinces.map((p) => [p.id, p]));
/** Geographic sea basins; gates are checked using the current controller, not starting owner. */
export function portZone(province: string): SeaZone {
  // New city ports inherit their former region's sea basin.
  const original = geography[province]?.legacyRegion;
  if (original && original !== province) return portZone(original);
  const zones: Record<string, SeaZone> = {
    "turkey-1": "black",
    "turkey-2": "mediterranean",
    "turkey-5": "mediterranean",
    "turkey-6": "black",
    "germany-1": "north",
    "germany-8": "baltic",
    "germany-9": "baltic",
    "france-1": "north",
    "france-4": "mediterranean",
    "france-6": "atlantic",
    "france-8": "mediterranean",
    "uk-0": "north",
    "uk-3": "north",
    "uk-5": "north",
    "uk-6": "north",
    "ussr-1": "baltic",
    "ussr-5": "black",
    "ussr-9": "north",
    "ussr-10": "north",
    "denmark-0": "baltic",
    "denmark-1": "north",
    "denmark-2": "atlantic",
    "sweden-0": "baltic",
    "sweden-1": "north",
    "sweden-2": "baltic",
    "spain-1": "mediterranean",
    "spain-2": "mediterranean",
  };
  if (zones[province]) return zones[province];
  const p = geography[province];
  if (["romania", "bulgaria"].includes(p.country)) return "black";
  if (["italy", "greece", "albania", "yugoslavia"].includes(p.country))
    return "mediterranean";
  if (
    ["finland", "estonia", "latvia", "lithuania", "poland"].includes(p.country)
  )
    return "baltic";
  if (["norway", "netherlands", "belgium"].includes(p.country)) return "north";
  return "atlantic";
}
export function seaRoute(
  w: World,
  country: string,
  from: SeaZone,
  to: SeaZone,
): SeaZone[] | null {
  const queue: SeaZone[][] = [[from]],
    seen = new Set([from]);
  const hostileGate = (province: string) =>
    w.countries[country].wars.includes(w.provinces[province].controller);
  for (const path of queue) {
    const zone = path[path.length - 1];
    if (zone === to) return path;
    for (const next of SEA_ZONES[zone].neighbors) {
      if (seen.has(next)) continue;
      if ([zone, next].includes("black") && hostileGate("turkey-1")) continue;
      if ([zone, next].includes("baltic") && hostileGate("denmark-0")) continue;
      // Gibraltar lies outside this regional map; Atlantic–Mediterranean stays open.
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}
export function shipOperational(w: World, c: Country, s: Warship) {
  const port = w.provinces[s.port];
  return (
    !c.capitulated &&
    s.health > 0 &&
    s.mission !== "idle" &&
    !s.transit &&
    s.port !== "ussr-13" &&
    !!port &&
    (port.controller === c.id || c.allies.includes(port.controller)) &&
    c.stock.fuel >= SHIPS[s.model].fuel &&
    !!seaRoute(w, c.id, portZone(s.port), s.zone)
  );
}
export function shipPower(
  c: Country,
  zone?: SeaZone,
  activeOnly = false,
  w?: World,
) {
  return (
    c.navy.ships
      .filter(
        (s) =>
          (!zone || s.zone === zone) &&
          (!activeOnly ||
            (w
              ? shipOperational(w, c, s)
              : s.mission !== "idle" &&
                !s.transit &&
                c.stock.fuel >= SHIPS[s.model].fuel)),
      )
      .reduce(
        (n, s) =>
          n +
          (((SHIPS[s.model].power + s.aircraft * 0.8) * s.health) / 100) *
            (1 + s.experience * 0.002),
        0,
      ) *
    (c.tech.includes("naval2") ? 1.25 : 1) *
    (c.tech.includes("navalDoctrine") ? 1.2 : 1) *
    (c.stock.fuel > 0 ? 1 : 0.1)
  );
}
export function seaControl(w: World, country: string, zone: SeaZone) {
  const c = w.countries[country];
  const own =
    shipPower(c, zone, true, w) +
    c.allies.reduce(
      (n, id) => n + shipPower(w.countries[id], zone, true, w),
      0,
    );
  const enemy = c.wars.reduce(
    (n, id) => n + shipPower(w.countries[id], zone, true, w),
    0,
  );
  return own <= 0 ? 0 : own / (own + enemy);
}
export function seaEdgeOpen(
  w: World,
  country: string,
  from: string,
  to: string,
) {
  if ([from, to].includes("ussr-13")) return false; // Caspian port has no ocean outlet.
  const path = seaRoute(w, country, portZone(from), portZone(to));
  return !!path && path.every((z) => seaControl(w, country, z) >= 0.5);
}
export function initializeAssets(w: World, c: Country) {
  c.air.wings = [];
  c.navy.ships = [];
  const port = Object.values(w.provinces).find(
    (p) => p.controller === c.id && geography[p.id].port && p.id !== "ussr-13",
  )?.id;
  c.navy.zone = port ? portZone(port) : "atlantic";
  for (const model of Object.keys(AIRCRAFT) as AirModel[]) {
    const count = Math.min(100, Math.floor(c.equipment[model]));
    if (!count) continue;
    c.equipment[model] -= count;
    c.air.wings.push({
      id: `wing-${++w.serial}`,
      name: `${c.air.wings.length + 1}. ${AIRCRAFT[model].name} kanadı`,
      model,
      count,
      size: count,
      base: c.capital,
      target: c.capital,
      mission: "idle",
      readiness: 80,
      experience: 0,
    });
  }
  if (port)
    for (const model of Object.keys(SHIPS) as ShipModel[]) {
      const count = Math.min(
        120 - c.navy.ships.length,
        Math.floor(c.equipment[model]),
      );
      c.equipment[model] -= count;
      for (let i = 0; i < count; i++) {
        const aircraft =
          model === "carrier"
            ? Math.min(20, Math.floor(c.equipment.carrierFighter))
            : 0;
        c.equipment.carrierFighter -= aircraft;
        c.navy.ships.push({
          id: `ship-${++w.serial}`,
          name: `${SHIPS[model].name} ${c.navy.ships.length + 1}`,
          model,
          health: 100,
          experience: 0,
          port,
          zone: c.navy.zone,
          mission: "patrol",
          transit: 0,
          aircraft,
        });
      }
    }
}
