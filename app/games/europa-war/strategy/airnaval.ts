import { AIRCRAFT, SEA_ZONES, SHIPS } from "./advanced-catalog";
import { resolveAirNavalDay } from "./airnaval-resolution";
import { current, isDraft } from "immer";
import { mapDistance } from "./geography-distance";
import { portZone, seaRoute } from "./military-assets";
import {
  atWar,
  clamp,
  controlled,
  friendly,
  GEOGRAPHY,
  requireRule,
  uid,
} from "./world";
import type {
  Action,
  AirMission,
  AirWing,
  Country,
  Province,
  Warship,
  World,
} from "./types";

/** Read IDs without creating drafts for every unrelated asset. current() also
 * includes assets created earlier in the same transaction. */
function findAsset(assets: AirWing[], id: string): AirWing | undefined;
function findAsset(assets: Warship[], id: string): Warship | undefined;
function findAsset(
  assets: (AirWing | Warship)[],
  id: string,
): AirWing | Warship | undefined {
  const values = isDraft(assets) ? current(assets) : assets;
  const index = values.findIndex((asset) => asset.id === id);
  return index < 0 ? undefined : assets[index];
}
function navalHomePorts(w: World, country: string): Province[] {
  return controlled(w, country).filter(
    (p) => GEOGRAPHY[p.id].port && p.id !== "ussr-13",
  );
}
function orderWing(
  w: World,
  c: Country,
  a: Extract<Action, { type: "wing" }>,
  wing: AirWing | undefined,
) {
  requireRule(wing && w.provinces[a.target], "Kanat ve hedef eyalet seç.");
  requireRule(
    a.mission === "idle" || AIRCRAFT[wing.model].missions.includes(a.mission),
    "Bu uçak modeli seçtiğin görevi yapamaz.",
  );
  const base = a.base ?? wing.base,
    p = w.provinces[base],
    t = w.provinces[a.target];
  requireRule(
    p && friendly(w, c.id, p.controller) && p.buildings.airfield > 0,
    "Kullanılabilir hava üssü gerekli.",
  );
  requireRule(
    a.mission === "idle" ||
      friendly(w, c.id, t.controller) ||
      atWar(w, c.id, t.controller),
    "Tarafsız ülkeye askerî görev veremezsin.",
  );
  requireRule(
    !["strategic", "naval"].includes(a.mission) || atWar(w, c.id, t.controller),
    "Saldırı görevi düşman eyaletine yöneltilmeli.",
  );
  requireRule(
    a.mission !== "naval" || GEOGRAPHY[a.target].port,
    "Deniz saldırısı için düşman limanı seç.",
  );
  const distance = mapDistance(GEOGRAPHY[base], GEOGRAPHY[a.target]);
  requireRule(
    a.mission === "idle" ||
      distance <=
        AIRCRAFT[wing.model].range * (c.tech.includes("aviation3") ? 1.2 : 1),
    "Hedef menzil dışında. Daha yakın bir hava üssüne taşı.",
  );
  if (wing.base !== base) wing.readiness = Math.max(0, wing.readiness - 30);
  wing.base = base;
  wing.target = a.target;
  wing.mission = a.mission;
  return true;
}
function orderShip(
  w: World,
  c: Country,
  a: Extract<Action, { type: "ship" }>,
  ship: Warship | undefined,
  homePorts?: readonly Province[],
) {
  requireRule(
    ship &&
      SEA_ZONES[a.zone] &&
      ["idle", "patrol", "raid", "escort"].includes(a.mission),
    "Geçerli gemi, deniz bölgesi ve görev seç.",
  );
  requireRule(
    a.mission !== "raid" || ship.model === "submarine",
    "Konvoy baskınını denizaltıya ver.",
  );
  requireRule(!ship.transit, "Gemi hâlâ intikal ediyor.");
  // Ownership cannot change during a bulk naval order. Reuse the eligible
  // port list, while checking each ship's current route and remaining fuel.
  const ports = homePorts ?? navalHomePorts(w, c.id);
  const preferred = ports.find((p) => p.id === ship.port);
  const home =
    preferred && seaRoute(w, c.id, ship.zone, portZone(preferred.id))
      ? preferred
      : ports.find(
          (p) =>
            p !== preferred && seaRoute(w, c.id, ship.zone, portZone(p.id)),
        );
  requireRule(
    home,
    "Gemiye açık bir ikmal limanı gerekiyor. Düşmanın tuttuğu boğazı kontrol et.",
  );
  const to = a.mission === "idle" ? portZone(home.id) : a.zone;
  const path = seaRoute(w, c.id, ship.zone, to);
  requireRule(
    path,
    "Boğaz düşman kontrolünde; bu deniz bölgesine geçiş kapalı.",
  );
  const fuel = (path.length - 1) * 10 * SHIPS[ship.model].fuel;
  requireRule(c.stock.fuel >= fuel, "İntikal için yeterli yakıt yok.");
  c.stock.fuel -= fuel;
  ship.port = home.id;
  ship.zone = to;
  ship.mission = a.mission;
  ship.transit = (path.length - 1) * 3;
  return true;
}

function baseLoads(w: World) {
  const loads: Record<string, number> = {};
  for (const c of Object.values(w.countries))
    for (const a of c.air.wings) loads[a.base] = (loads[a.base] ?? 0) + a.count;
  return loads;
}
export function wingEfficiency(
  w: World,
  c: Country,
  wing: AirWing,
  loads?: Record<string, number>,
) {
  const controller = w.provinces[wing.target].controller,
    hostile = atWar(w, c.id, controller);
  if (
    !friendly(w, c.id, w.provinces[wing.base].controller) ||
    !w.provinces[wing.base].buildings.airfield ||
    (wing.mission !== "idle" &&
      ((!friendly(w, c.id, controller) && !hostile) ||
        (["strategic", "naval"].includes(wing.mission) && !hostile) ||
        (wing.mission === "naval" && !GEOGRAPHY[wing.target].port)))
  )
    return 0;
  const distance = mapDistance(GEOGRAPHY[wing.base], GEOGRAPHY[wing.target]);
  if (
    distance >
    AIRCRAFT[wing.model].range * (c.tech.includes("aviation3") ? 1.2 : 1)
  )
    return 0;
  const atBase = (loads ?? baseLoads(w))[wing.base] ?? 0;
  const congestion = Math.min(
    1,
    (w.provinces[wing.base].buildings.airfield * 100) / Math.max(1, atBase),
  );
  return (
    ((congestion * wing.readiness) / 100) *
    (c.stock.fuel >= wing.count * AIRCRAFT[wing.model].fuel && !c.capitulated
      ? 1
      : 0) *
    (1 - w.provinces[wing.base].damage / 150)
  );
}
export function regionalAirPower(
  w: World,
  country: string,
  province: string,
  mission: AirMission = "superiority",
  loads?: Record<string, number>,
) {
  const c = w.countries[country];
  const relevant = c.air.wings.filter(
    (a) =>
      a.mission === mission &&
      mapDistance(GEOGRAPHY[a.target], GEOGRAPHY[province]) < 180 &&
      // The regional mission radius cannot extend an aircraft's flight range.
      // Ground support, interception and paradrops need reach to the actual
      // affected province, not only to the nearby assigned mission marker.
      mapDistance(GEOGRAPHY[a.base], GEOGRAPHY[province]) <=
        AIRCRAFT[a.model].range * (c.tech.includes("aviation3") ? 1.2 : 1),
  );
  if (!relevant.length) return 0;
  loads ??= baseLoads(w);
  return (
    relevant.reduce(
      (n, a) =>
        n +
        a.count *
          wingEfficiency(w, c, a, loads) *
          (mission === "superiority" ? AIRCRAFT[a.model].attack : 1) *
          (1 + a.experience * 0.002),
      0,
    ) *
    (c.tech.includes("airDoctrine") ? 1.2 : 1) *
    (c.tech.includes("aviation3") ? 1.3 : 1)
  );
}
export function airSupport(w: World, country: string, province: string) {
  const c = w.countries[country];
  const enemy = c.wars.reduce(
    (n, id) => n + regionalAirPower(w, id, province),
    0,
  );
  const escort = regionalAirPower(w, country, province);
  return (
    Math.min(0.35, regionalAirPower(w, country, province, "support") * 0.006) *
    clamp((escort + 10) / (enemy + 10), 0.15, 1)
  );
}
export function airNavalAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "createWing") {
    const d = AIRCRAFT[a.model],
      p = w.provinces[a.base];
    requireRule(
      d && p && friendly(w, c.id, p.controller) && p.buildings.airfield > 0,
      "Kendi veya müttefikinin hava üssünü seç.",
    );
    requireRule(
      Number.isInteger(a.count) && a.count >= 1 && a.count <= 100,
      "Bir kanat 1–100 uçaktan oluşur.",
    );
    requireRule(
      c.air.wings.length < 40 && c.equipment[a.model] >= a.count,
      "Yeterli yedek uçak yok veya 40 kanat sınırına ulaştın.",
    );
    c.equipment[a.model] -= a.count;
    c.air.wings.push({
      id: uid(w, "wing"),
      name: `${c.air.wings.length + 1}. ${d.name} kanadı`,
      model: a.model,
      count: a.count,
      size: a.count,
      base: a.base,
      target: a.base,
      mission: "idle",
      readiness: 55,
      experience: 0,
    });
    return true;
  }
  if (a.type === "wing")
    return orderWing(w, c, a, findAsset(c.air.wings, a.id));
  if (a.type === "disbandWing") {
    const wing = findAsset(c.air.wings, a.id);
    requireRule(
      wing && friendly(w, c.id, w.provinces[wing.base].controller),
      "Uçakların üsse güvenle dönebilmesi gerekir.",
    );
    c.equipment[wing.model] += wing.count;
    c.air.wings = c.air.wings.filter((x) => x !== wing);
    return true;
  }
  if (a.type === "commission") {
    requireRule(
      SHIPS[a.model] &&
        a.port !== "ussr-13" &&
        w.provinces[a.port]?.controller === c.id &&
        GEOGRAPHY[a.port].port,
      "Kontrol ettiğin bir liman seç.",
    );
    requireRule(
      c.equipment[a.model] >= 1 && c.navy.ships.length < 120,
      "En az bir tamamlanmış gemi gerekir; filo sınırı 120 gemi.",
    );
    c.equipment[a.model]--;
    c.navy.ships.push({
      id: uid(w, "ship"),
      model: a.model,
      name: `${SHIPS[a.model].name} ${c.navy.ships.length + 1}`,
      health: 100,
      experience: 0,
      port: a.port,
      zone: portZone(a.port),
      mission: "idle",
      aircraft: 0,
      transit: 0,
    });
    return true;
  }
  if (a.type === "ship")
    return orderShip(w, c, a, findAsset(c.navy.ships, a.id));
  if (a.type === "carrierAircraft") {
    const ship = findAsset(c.navy.ships, a.id);
    requireRule(
      ship &&
        ship.model === "carrier" &&
        ship.mission === "idle" &&
        !ship.transit &&
        friendly(w, c.id, w.provinces[ship.port].controller) &&
        ship.zone === portZone(ship.port),
      "Uçak yüklemek veya boşaltmak için uçak gemisini güvenli bir limana döndür.",
    );
    requireRule(
      Number.isInteger(a.count) && a.count >= 0 && a.count <= 30,
      "Uçak gemisi en fazla 30 deniz avcısı taşıyabilir.",
    );
    const delta = a.count - ship.aircraft;
    requireRule(
      c.equipment.carrierFighter >= delta,
      "Yeterli yedek deniz avcısı yok.",
    );
    c.equipment.carrierFighter -= delta;
    ship.aircraft = a.count;
    return true;
  }
  return false;
}
/** Convenience order retains detailed wings and ships; it never creates equipment. */
export function quickAirOrder(
  w: World,
  c: Country,
  mission: Country["air"]["mission"],
  target: string,
) {
  const province = w.countries[target].capital;
  let assigned = 0;
  for (const wing of c.air.wings) {
    const wanted =
      mission === "idle"
        ? "idle"
        : AIRCRAFT[wing.model].missions.includes(mission)
          ? mission
          : wing.model === "fighter"
            ? "superiority"
            : "idle";
    try {
      orderWing(
        w,
        c,
        {
          type: "wing",
          id: wing.id,
          mission: wanted,
          target: wanted === "idle" ? wing.base : province,
        },
        wing,
      );
      // Escorts can accompany a mission, but do not make an unreachable
      // bombardment/support order successful on their own.
      if (wanted === mission && wing.count >= 1) assigned++;
    } catch {
      /* Out-of-range wings keep their previous orders. */
    }
  }
  return assigned;
}
export function quickNavalOrder(
  w: World,
  c: Country,
  mission: Country["navy"]["mission"],
  target: string,
) {
  const coast = controlled(w, target).find((p) => GEOGRAPHY[p.id].port);
  const zone = coast ? portZone(coast.id) : c.navy.zone;
  const homePorts = navalHomePorts(w, c.id);
  let assigned = 0;
  for (const ship of c.navy.ships) {
    try {
      orderShip(
        w,
        c,
        {
          type: "ship",
          id: ship.id,
          zone,
          mission:
            mission === "raid" && ship.model !== "submarine"
              ? "escort"
              : mission,
        },
        ship,
        homePorts,
      );
      // Escorting surface ships cannot stand in for an unavailable submarine
      // when the player specifically requested a convoy raid.
      if (ship.mission === mission) assigned++;
    } catch {
      /* Each ship respects straits, fuel and transit. */
    }
  }
  return assigned;
}
export function airNavalDay(w: World) {
  resolveAirNavalDay(w, wingEfficiency);
}
