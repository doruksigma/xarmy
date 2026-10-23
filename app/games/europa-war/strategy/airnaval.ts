import { AIRCRAFT, AIR_MISSIONS, SEA_ZONES, SHIPS } from "./advanced-catalog";
import { EQUIPMENT } from "./catalog";
import {
  portZone,
  seaRoute,
  shipPower,
  shipOperational,
} from "./military-assets";
import {
  atWar,
  capacity,
  clamp,
  controlled,
  event,
  friendly,
  GEOGRAPHY,
  requireRule,
  uid,
} from "./world";
import type {
  Action,
  AirMission,
  AirModel,
  AirWing,
  Country,
  SeaZone,
  ShipModel,
  World,
} from "./types";

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
  if (
    !friendly(w, c.id, w.provinces[wing.base].controller) ||
    !w.provinces[wing.base].buildings.airfield
  )
    return 0;
  const distance = Math.hypot(
    GEOGRAPHY[wing.base].x - GEOGRAPHY[wing.target].x,
    GEOGRAPHY[wing.base].y - GEOGRAPHY[wing.target].y,
  );
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
      Math.hypot(
        GEOGRAPHY[a.target].x - GEOGRAPHY[province].x,
        GEOGRAPHY[a.target].y - GEOGRAPHY[province].y,
      ) < 180,
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
  if (a.type === "wing") {
    const wing = c.air.wings.find((x) => x.id === a.id);
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
      !["strategic", "naval"].includes(a.mission) ||
        atWar(w, c.id, t.controller),
      "Saldırı görevi düşman eyaletine yöneltilmeli.",
    );
    const distance = Math.hypot(
      GEOGRAPHY[base].x - GEOGRAPHY[a.target].x,
      GEOGRAPHY[base].y - GEOGRAPHY[a.target].y,
    );
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
  if (a.type === "disbandWing") {
    const wing = c.air.wings.find((x) => x.id === a.id);
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
  if (a.type === "ship") {
    const ship = c.navy.ships.find((s) => s.id === a.id);
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
    const home = controlled(w, c.id)
      .filter((p) => GEOGRAPHY[p.id].port && p.id !== "ussr-13")
      .sort((l, r) => (l.id === ship.port ? -1 : r.id === ship.port ? 1 : 0))
      .find((p) => seaRoute(w, c.id, ship.zone, portZone(p.id)));
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
  if (a.type === "carrierAircraft") {
    const ship = c.navy.ships.find(
      (s) => s.id === a.id && s.model === "carrier",
    );
    requireRule(
      ship && ship.mission === "idle" && !ship.transit,
      "Uçak yüklemek için uçak gemisini limana döndür.",
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
      airNavalAction(w, c, {
        type: "wing",
        id: wing.id,
        mission: wanted,
        target: wanted === "idle" ? wing.base : province,
      });
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
  let assigned = 0;
  for (const ship of c.navy.ships) {
    try {
      airNavalAction(w, c, {
        type: "ship",
        id: ship.id,
        zone,
        mission:
          mission === "raid" && ship.model !== "submarine" ? "escort" : mission,
      });
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
  // Snapshot opposed strength so country iteration order does not decide combat.
  const pressure: Record<string, number> = {};
  const loads = baseLoads(w);
  const powerCache = new Map<string, number>();
  const power = (id: string, province: string) => {
    const key = `${id}:${province}`;
    if (!powerCache.has(key))
      powerCache.set(
        key,
        regionalAirPower(w, id, province, "superiority", loads),
      );
    return powerCache.get(key)!;
  };
  for (const c of Object.values(w.countries))
    for (const wing of c.air.wings)
      pressure[wing.id] = c.wars.reduce(
        (n, id) => n + power(id, wing.target),
        0,
      );
  const sea = Object.fromEntries(
    Object.values(w.countries).map((c) => [
      c.id,
      Object.fromEntries(
        (Object.keys(SEA_ZONES) as SeaZone[]).map((z) => [
          z,
          shipPower(c, z, true, w),
        ]),
      ),
    ]),
  ) as Record<string, Record<SeaZone, number>>;
  for (const c of Object.values(w.countries)) {
    if (c.capitulated) {
      c.air.wings.forEach((a) => {
        a.mission = "idle";
      });
      c.navy.ships.forEach((s) => {
        s.mission = "idle";
      });
      continue;
    }
    for (const wing of c.air.wings) {
      if (!friendly(w, c.id, w.provinces[wing.base].controller)) {
        const safe = controlled(w, c.id).find((p) => p.buildings.airfield > 0);
        if (!safe) {
          wing.count = 0;
          continue;
        }
        wing.base = safe.id;
        wing.target = safe.id;
        wing.mission = "idle";
        wing.readiness *= 0.5;
        wing.count *= 0.8;
      }
      const replacement = Math.max(
        0,
        Math.min(2, wing.size - wing.count, c.equipment[wing.model]),
      );
      wing.count += replacement;
      c.equipment[wing.model] -= replacement;
      if (wing.mission === "idle") {
        wing.readiness = clamp(wing.readiness + 6);
        continue;
      }
      const controller = w.provinces[wing.target].controller;
      if (!friendly(w, c.id, controller) && !atWar(w, c.id, controller)) {
        wing.mission = "idle";
        continue;
      }
      const fuel = wing.count * AIRCRAFT[wing.model].fuel;
      const efficiency = wingEfficiency(w, c, wing, loads);
      if (efficiency <= 0 || c.stock.fuel < fuel) {
        wing.readiness = clamp(wing.readiness + 1);
        continue;
      }
      c.stock.fuel -= fuel;
      wing.readiness = clamp(wing.readiness + 0.5);
      wing.experience = clamp(wing.experience + 0.05);
      const enemy = pressure[wing.id],
        escort = power(c.id, wing.target);
      const interception = clamp((escort + 10) / (enemy + 10), 0.15, 1);
      const target = w.provinces[wing.target];
      const hostile = atWar(w, c.id, controller);
      const flak = hostile ? target.buildings.antiAir : 0;
      wing.count = Math.max(
        0,
        wing.count - Math.min(wing.count * 0.1, enemy * 0.0015 + flak * 0.015),
      );
      if (wing.mission === "strategic" && hostile) {
        target.damage = clamp(
          target.damage +
            (wing.count *
              (wing.model === "strategicBomber" ? 0.12 : 0.04) *
              efficiency *
              interception) /
              (1 + flak * 0.35 + target.buildings.radar * 0.15),
        );
      }
      if (wing.mission === "recon" && hostile)
        c.intel[controller] = {
          level: Math.max(
            c.intel[controller]?.level ?? 0,
            55 + Math.min(20, wing.count),
          ),
          expires: w.day + 14,
        };
      if (wing.mission === "naval" && hostile) {
        const fleet = w.countries[controller].navy.ships.filter(
          (s) =>
            s.zone === portZone(target.id) &&
            s.mission !== "idle" &&
            !s.transit,
        );
        for (const s of fleet)
          s.health = Math.max(
            0,
            s.health -
              (wing.count * efficiency * interception * 0.025) /
                Math.max(1, fleet.length),
          );
      }
    }
    c.air.wings = c.air.wings.filter(
      (a) => a.count > 0 || c.equipment[a.model] > 0,
    );
    for (const ship of c.navy.ships) {
      if (ship.transit) {
        ship.transit--;
        continue;
      }
      const d = SHIPS[ship.model];
      const hasPort =
        friendly(w, c.id, w.provinces[ship.port].controller) &&
        !!seaRoute(w, c.id, portZone(ship.port), ship.zone);
      if (!hasPort) {
        ship.health = Math.max(0, ship.health - 0.3);
        continue;
      }
      if (ship.mission === "idle") {
        const repair = Math.min(
          100 - ship.health,
          (capacity(w, c.id, "dock") * 1.5) /
            Math.max(
              1,
              c.navy.ships.filter((s) => s.mission === "idle" && s.health < 100)
                .length,
            ),
          c.stock.steel * 2,
        );
        ship.health += repair;
        c.stock.steel = Math.max(0, c.stock.steel - repair / 2);
        continue;
      }
      if (c.stock.fuel < d.fuel) continue;
      c.stock.fuel -= d.fuel;
      const opposition = c.wars.reduce((n, id) => n + sea[id][ship.zone], 0);
      const screens = c.navy.ships
        .filter((s) => s.zone === ship.zone && shipOperational(w, c, s))
        .reduce((n, s) => n + (SHIPS[s.model].antiSub * s.health) / 100, 0);
      const submarine = c.wars.reduce(
        (n, id) =>
          n +
          w.countries[id].navy.ships.filter(
            (s) =>
              s.zone === ship.zone &&
              s.mission === "raid" &&
              shipOperational(w, w.countries[id], s),
          ).length,
        0,
      );
      const loss =
        (opposition * 0.018) /
          d.armor /
          Math.max(
            1,
            c.navy.ships.filter(
              (s) => s.zone === ship.zone && s.mission !== "idle",
            ).length,
          ) +
        (ship.model !== "submarine" ? (submarine * 0.08) / (1 + screens) : 0);
      ship.health = clamp(ship.health - loss);
      if (opposition) ship.experience = clamp(ship.experience + 0.1);
      ship.aircraft = Math.max(0, ship.aircraft - loss * 0.04);
      if (ship.health < 30 && ship.health > 0) {
        const route = seaRoute(w, c.id, ship.zone, portZone(ship.port));
        if (route) {
          ship.zone = portZone(ship.port);
          ship.transit = (route.length - 1) * 3;
          ship.mission = "idle";
        }
      }
      if (!ship.health && c.id === w.player)
        event(
          w,
          `${ship.name}, ${SEA_ZONES[ship.zone].name} muharebesinde battı.`,
          "war",
        );
    }
    c.navy.ships = c.navy.ships.filter((s) => s.health > 0);
  }
}
