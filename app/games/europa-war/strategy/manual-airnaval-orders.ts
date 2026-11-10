import { AIRCRAFT, SEA_ZONES, SHIPS } from "./advanced-catalog";
import { wingEfficiency } from "./airnaval";
import { mapDistance } from "./geography-distance";
import { portZone, seaRoute } from "./military-assets";
import { atWar, friendly, GEOGRAPHY } from "./world";
import type {
  AirMission,
  AirWing,
  Country,
  SeaZone,
  Warship,
  World,
} from "./types";

/** Read-only forecasts for the exact order the player is about to submit.
 * Actual commands still revalidate atomically against the current world. */
export function previewAirOrder(
  w: World,
  country: Country,
  wing: AirWing,
  order: { base: string; target: string; mission: AirMission },
) {
  const base = w.provinces[order.base];
  const target = w.provinces[order.target];
  const model = AIRCRAFT[wing.model];
  const range = model.range * (country.tech.includes("aviation3") ? 1.2 : 1);
  const distance =
    base && target ? mapDistance(GEOGRAPHY[base.id], GEOGRAPHY[target.id]) : 0;
  let error: string | null = null;
  if (
    !base ||
    !friendly(w, country.id, base.controller) ||
    base.buildings.airfield <= 0
  )
    error = "Kullanılabilir bir hava üssü seç.";
  else if (!target) error = "Hedef bölge seç.";
  else if (order.mission !== "idle" && !model.missions.includes(order.mission))
    error = "Bu uçak modeli seçilen görevi yapamaz.";
  else if (
    order.mission !== "idle" &&
    !friendly(w, country.id, target.controller) &&
    !atWar(w, country.id, target.controller)
  )
    error =
      "Bu bölge tarafsız. Kendi veya müttefik bölgeni ya da savaştığın ülkeyi seç.";
  else if (
    ["strategic", "naval"].includes(order.mission) &&
    !atWar(w, country.id, target.controller)
  )
    error = "Saldırı görevi için savaştığın ülkenin bir bölgesini seç.";
  else if (order.mission === "naval" && !GEOGRAPHY[target.id].port)
    error = "Gemilere saldırmak için düşman limanı seç.";
  else if (order.mission !== "idle" && distance > range)
    error = "Hedef menzil dışında. Daha yakın üs veya hedef seç.";
  const projected = {
    ...wing,
    ...order,
    readiness:
      wing.readiness -
      (wing.base === order.base ? 0 : Math.min(30, wing.readiness)),
  };
  const fuelPerDay = order.mission === "idle" ? 0 : wing.count * model.fuel;
  const baseLoads: Record<string, number> = {};
  const warnings: string[] = [];
  if (!error && order.mission !== "idle") {
    for (const c of Object.values(w.countries))
      for (const item of c.air.wings) {
        const location =
          c.id === country.id && item.id === wing.id ? order.base : item.base;
        baseLoads[location] = (baseLoads[location] ?? 0) + item.count;
      }
    if (wing.count < 1)
      warnings.push("Uçak sayısı yetersiz; yedek uçak üretimi gerekiyor.");
    if (country.stock.fuel < fuelPerDay)
      warnings.push(
        "Günlük görev için yakıt eksik. Emir kaydedilir fakat yakıt gelmeden uçuş yapılamaz.",
      );
    if (wing.base !== order.base)
      warnings.push(
        "Üs değişimi hazırlığı 30 puan azaltır; zaman ilerledikçe toparlanır.",
      );
    const load = baseLoads[order.base] ?? wing.count;
    if (load > base!.buildings.airfield * 100)
      warnings.push("Üs kapasitesi aşılıyor; görev verimi düşer.");
  }
  return {
    error,
    warnings,
    distance,
    range,
    fuelPerDay,
    efficiency:
      error || order.mission === "idle"
        ? 0
        : wingEfficiency(w, country, projected, baseLoads),
  };
}

export function previewNavalOrder(
  w: World,
  country: Country,
  ship: Warship,
  order: { zone: SeaZone; mission: Warship["mission"] },
) {
  let error: string | null = null;
  if (!SEA_ZONES[order.zone]) error = "Geçerli bir deniz bölgesi seç.";
  else if (ship.transit > 0)
    error = `Gemi intikal ediyor: ${ship.transit} oyun günü kaldı.`;
  else if (order.mission === "raid" && ship.model !== "submarine")
    error = "Konvoy baskını için denizaltı seç.";
  const ports = Object.values(w.provinces).filter(
    (p) =>
      p.controller === country.id && GEOGRAPHY[p.id].port && p.id !== "ussr-13",
  );
  const preferred = ports.find((p) => p.id === ship.port);
  const home =
    preferred && seaRoute(w, country.id, ship.zone, portZone(preferred.id))
      ? preferred
      : ports.find(
          (p) =>
            p !== preferred &&
            seaRoute(w, country.id, ship.zone, portZone(p.id)),
        );
  const zone =
    order.mission === "idle" && home ? portZone(home.id) : order.zone;
  const route = SEA_ZONES[zone]
    ? seaRoute(w, country.id, ship.zone, zone)
    : null;
  const transitDays = route ? (route.length - 1) * 3 : 0;
  const transitFuel = route
    ? (route.length - 1) * 10 * SHIPS[ship.model].fuel
    : 0;
  if (!error && !home)
    error =
      "Gemiye açık bir ikmal limanı gerekiyor. Düşmanın tuttuğu boğazı kontrol et.";
  if (!error && !route)
    error =
      "Bu deniz bölgesine geçiş kapalı; boğaz kontrolünü değiştir veya başka bölge seç.";
  if (!error && country.stock.fuel < transitFuel)
    error = "İntikal için yakıt yetersiz.";
  const fuelPerDay = order.mission === "idle" ? 0 : SHIPS[ship.model].fuel;
  const warnings: string[] = [];
  if (!error && order.mission !== "idle") {
    if (country.stock.fuel - transitFuel < fuelPerDay)
      warnings.push(
        "İntikalden sonra günlük görev yakıtı kalmıyor; görev yakıt gelene kadar bekler.",
      );
    if (ship.health < 35)
      warnings.push(
        "Gövde ağır hasarlı. Limanda onarmak gemiyi kaybetme riskini azaltır.",
      );
  }
  return {
    error,
    warnings,
    home: home?.id ?? null,
    zone,
    route,
    transitDays,
    transitFuel,
    fuelPerDay,
  };
}

/** A lost home port still needs a real rebase even if mission and sea match. */
export function navalOrderMatches(
  ship: Warship,
  mission: Warship["mission"],
  destination: { zone: SeaZone; home: string | null },
) {
  return (
    ship.mission === mission &&
    ship.zone === destination.zone &&
    ship.port === destination.home
  );
}
