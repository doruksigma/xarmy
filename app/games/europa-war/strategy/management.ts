import { AIRCRAFT, cabinetOptions, SHIPS } from "./advanced-catalog";
import {
  BUILDINGS,
  EQUIPMENT,
  focusTree,
  TECHNOLOGIES,
  UNITS,
} from "./catalog";
import { airNavalAction, quickAirOrder, quickNavalOrder } from "./airnaval";
import { economyAction } from "./economy";
import { politicsAction, researchSlots } from "./politics";
import {
  capacity,
  controlled,
  dateOf,
  event,
  GEOGRAPHY,
  localSupply,
  requireRule,
} from "./world";
import type {
  Action,
  AirModel,
  Country,
  Equipment,
  ShipModel,
  World,
} from "./types";

export const AUTOMATION = {
  economy: "Sanayi ve tedarik",
  research: "Araştırma ve ulusal odak",
  recruitment: "Tümen eğitimi",
  operations: "Hava ve deniz görevleri",
};
export function manage(
  w: World,
  c: Country,
  area: keyof Country["automation"],
) {
  const attempt = (action: Action) => {
    try {
      return (
        economyAction(w, c, action) ||
        politicsAction(w, c, action) ||
        airNavalAction(w, c, action)
      );
    } catch {
      return false;
    }
  };
  const lands = controlled(w, c.id),
    armies = w.armies.filter((a) => a.country === c.id);
  if (!lands.length) return;
  if (area === "research") {
    const priority = c.wars.length
      ? ["landDoctrine", "weapons1", "logistics", "industry1", "aviation2"]
      : ["industry1", "weapons1", "motorization", "logistics", "aviation2"];
    const options = TECHNOLOGIES.filter(
      (t) =>
        !c.tech.includes(t.id) &&
        !c.research.some((r) => r.id === t.id) &&
        t.requires.every((id) => c.tech.includes(id)) &&
        t.year <= dateOf(w.day).getUTCFullYear() + 1,
    ).sort(
      (a, b) =>
        (priority.includes(a.id) ? priority.indexOf(a.id) : 100) -
          (priority.includes(b.id) ? priority.indexOf(b.id) : 100) ||
        a.year - b.year,
    );
    while (c.research.length < researchSlots(c) && options.length)
      attempt({ type: "research", id: options.shift()!.id });
    if (!c.focus) {
      // Political ideology changes always remain a human decision.
      const f = focusTree(c.id).find(
        (f) =>
          ![
            "democracy",
            "republic",
            "fascism",
            "communism",
            "monarchy",
          ].includes(f.effect) &&
          !c.focuses.includes(f.id) &&
          f.requires.every((id) => c.focuses.includes(id)) &&
          (!f.excludes || !c.focuses.includes(f.excludes)),
      );
      if (f) attempt({ type: "focus", id: f.id });
    }
  }
  if (area === "economy") {
    const goals: Partial<Record<Equipment, number>> = {
      rifle: Math.max(200, armies.length * 40),
      artillery: 50,
      fighter: 40,
      bomber: 25,
      truck: 40,
      lightTank: 50,
      mediumTank: 60,
      strategicBomber: 15,
      transport: 8,
      reconPlane: 8,
      carrierFighter: c.navy.ships.some((s) => s.model === "carrier") ? 30 : 0,
      destroyer: 3,
      submarine: 3,
      ship: 2,
      battleship: 1,
      carrier: 1,
    };
    for (const naval of [false, true]) {
      const pool = Math.floor(capacity(w, c.id, naval ? "dock" : "military"));
      const choices = (Object.keys(goals) as Equipment[]).filter(
        (e) =>
          !!EQUIPMENT[e].naval === naval &&
          (!EQUIPMENT[e].tech || c.tech.includes(EQUIPMENT[e].tech!)) &&
          (goals[e] ?? 0) > 0 &&
          !(e === "lightTank" && c.tech.includes("armor2")),
      );
      const old = c.production.filter(
        (l) => !!EQUIPMENT[l.equipment].naval === naval,
      );
      const allocations: Partial<Record<Equipment, number>> = {};
      for (let i = 0; i < pool; i++) {
        const ranked = choices
          // Use the same per-line limit as manual production orders and saves.
          // Large wartime industries can exceed 100 factories in total; put
          // the remainder on other eligible lines instead of corrupting saves.
          .filter((e) => (allocations[e] ?? 0) < 100)
          .map((e) => {
            const deployed =
              c.air.wings
                .filter((a) => a.model === e)
                .reduce((n, a) => n + a.count, 0) +
              c.navy.ships.filter((s) => s.model === e).length;
            return {
              e,
              score:
                (goals[e]! - c.equipment[e] - deployed) /
                goals[e]! /
                (1 + (allocations[e] ?? 0)),
            };
          })
          .sort((a, b) => b.score - a.score);
        if (!ranked.length) break;
        const e = ranked[0].e;
        allocations[e] = (allocations[e] ?? 0) + 1;
      }
      c.production = c.production.filter(
        (l) => !!EQUIPMENT[l.equipment].naval !== naval,
      );
      for (const [equipment, factories] of Object.entries(allocations))
        c.production.push({
          equipment: equipment as Equipment,
          factories,
          efficiency:
            old.find((l) => l.equipment === equipment)?.efficiency ?? 0.2,
        });
    }
    if (!c.construction.length && c.treasury > 230) {
      const weak = armies.find(
        (a) =>
          a.supply < 0.7 &&
          w.provinces[a.province].controller === c.id &&
          w.provinces[a.province].buildings.rail < 5,
      );
      const building = weak
        ? "rail"
        : c.stock.rubber < 20
          ? "synthetic"
          : c.wars.length
            ? "military"
            : "civil";
      const p = weak
        ? w.provinces[weak.province]
        : lands
            .filter((p) => p.buildings[building] < BUILDINGS[building].max)
            .sort((a, b) => a.damage - b.damage)[0];
      if (p) attempt({ type: "build", building, province: p.id });
    }
  }
  if (
    area === "recruitment" &&
    c.recruitment.length < 2 &&
    armies.length < Math.max(3, lands.length * 2)
  ) {
    const safe = lands.find(
      (p) => p.owner === c.id && localSupply(w, c.id, p.id) > 0.4,
    );
    const type = (Object.keys(UNITS) as (keyof typeof UNITS)[])
      .filter(
        (id) =>
          ![
            "heavyTank",
            "paratrooper",
            "special",
            "mechanized",
            "mountain",
          ].includes(id) &&
          (!UNITS[id].tech || c.tech.includes(UNITS[id].tech!)) &&
          c.manpower >= UNITS[id].men &&
          Object.entries(UNITS[id].equipment).every(
            ([e, n]) => c.equipment[e as Equipment] >= n * 1.3,
          ),
      )
      .sort((a, b) => UNITS[b].attack - UNITS[a].attack)[0];
    if (safe && type)
      attempt({ type: "recruit", unit: type, province: safe.id });
  }
  if (area === "operations") {
    const base = lands.find((p) => p.buildings.airfield > 0),
      port = lands.find((p) => GEOGRAPHY[p.id].port);
    if (base)
      for (const model of Object.keys(AIRCRAFT) as AirModel[])
        if (c.equipment[model] >= 8 && c.air.wings.length < 40)
          attempt({
            type: "createWing",
            model,
            base: base.id,
            count: Math.min(50, Math.floor(c.equipment[model])),
          });
    if (port)
      for (const model of Object.keys(SHIPS) as ShipModel[])
        if (c.equipment[model] >= 1)
          attempt({ type: "commission", model, port: port.id });
    const target = c.wars
      .filter((id) => !w.countries[id].capitulated)
      .sort(
        (a, b) =>
          Math.hypot(
            GEOGRAPHY[c.capital].x - GEOGRAPHY[w.countries[a].capital].x,
            GEOGRAPHY[c.capital].y - GEOGRAPHY[w.countries[a].capital].y,
          ) -
          Math.hypot(
            GEOGRAPHY[c.capital].x - GEOGRAPHY[w.countries[b].capital].x,
            GEOGRAPHY[c.capital].y - GEOGRAPHY[w.countries[b].capital].y,
          ),
      )[0];
    quickAirOrder(w, c, target ? "support" : "idle", target ?? c.id);
    quickNavalOrder(w, c, target ? "raid" : "patrol", target ?? c.id);
    for (const wing of c.air.wings) {
      if (target && ["strategicBomber", "reconPlane"].includes(wing.model))
        attempt({
          type: "wing",
          id: wing.id,
          target: w.countries[target].capital,
          mission: wing.model === "reconPlane" ? "recon" : "strategic",
        });
    }
  }
}
export function managementAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "automation" || a.type === "autoPlan") {
    requireRule(
      Object.hasOwn(AUTOMATION, a.area),
      "Geçersiz otomatik yönetim alanı.",
    );
    if (a.type === "automation") {
      c.automation[a.area] = a.enabled;
      if (a.enabled) manage(w, c, a.area);
    } else manage(w, c, a.area);
    event(
      w,
      `${AUTOMATION[a.area]}: ${a.type === "autoPlan" ? "mevcut kaynaklarla plan uygulandı" : a.enabled ? "yardımcı yönetimi açıldı" : "manuel yönetime geçildi"}.`,
    );
    return true;
  }
  if (a.type === "cabinet") {
    requireRule(
      ["economy", "military", "science"].includes(a.slot),
      "Geçerli kabine görevi seç.",
    );
    requireRule(
      cabinetOptions(c.id, a.slot).some((o) => o.id === a.id),
      "Danışman bulunamadı.",
    );
    requireRule(
      c.cabinet[a.slot] !== a.id && c.political >= 35,
      "Atama için farklı bir danışman ve 35 siyasi güç gerekir.",
    );
    c.political -= 35;
    c.cabinet[a.slot] = a.id;
    return true;
  }
  return false;
}
export function managementDay(w: World) {
  const c = w.countries[w.player];
  if (c.capitulated || w.day % 7 !== 0) return;
  for (const area of Object.keys(AUTOMATION) as (keyof Country["automation"])[])
    if (c.automation[area]) manage(w, c, area);
}

export interface Advice {
  id: string;
  title: string;
  reason: string;
  tab:
    | "army"
    | "economy"
    | "research"
    | "politics"
    | "operations"
    | "diplomacy";
  action?: Action;
}
export function advice(w: World): Advice[] {
  const c = w.countries[w.player],
    out: Advice[] = [],
    own = w.armies.filter((a) => a.country === c.id);
  const cut = own.filter((a) => a.supply < 0.35);
  if (cut.length)
    out.push({
      id: "supply",
      title: `${cut.length} tümenin ikmali zayıf`,
      reason:
        "Başkente açık bir yol kur veya birlikleri güvenli bölgeye çek. Bağlantı yokken yeni depo tek başına yeterli olmaz.",
      tab: "army",
    });
  const peace = w.conferences.find(
    (q) => q.status === "open" && q.participants[q.turn] === c.id,
  );
  if (peace)
    out.push({
      id: "peace",
      title: "Barış görüşmelerinde sıra sende",
      reason: `${w.countries[peace.defeated].name} için bölge talep et, bağlı yönetim kur veya bağımsızlık tanı.`,
      tab: "diplomacy",
    });
  if (c.research.length < researchSlots(c))
    out.push({
      id: "research",
      title: "Boş araştırma yuvası",
      reason:
        "Güncel teknoloji ordunu ve üretimini geliştirir. Yardımcı mevcut ihtiyaçlarına göre seçim yapabilir.",
      tab: "research",
      action: { type: "autoPlan", area: "research" },
    });
  if (!c.focus)
    out.push({
      id: "focus",
      title: "Ulusal odak seç",
      reason: "Sanayi, güvenlik veya siyasi gelecek için bir yol belirle.",
      tab: "politics",
    });
  const free =
    Math.floor(capacity(w, c.id, "military")) -
    c.production
      .filter((l) => !EQUIPMENT[l.equipment].naval)
      .reduce((n, l) => n + l.factories, 0);
  if (free > 0)
    out.push({
      id: "production",
      title: `${free} askerî fabrika boşta`,
      reason:
        "Mevcut stoklara göre üretim dağıt; silah ve takviye eksiklerini kapat.",
      tab: "economy",
      action: { type: "autoPlan", area: "economy" },
    });
  if (c.stock.fuel < 70)
    out.push({
      id: "fuel",
      title: "Yakıt azalıyor",
      reason:
        "Gereksiz uçuş ve seferleri durdur; petrol ithalatı veya rafineri planla.",
      tab: "economy",
    });
  if (c.stability < 35)
    out.push({
      id: "stability",
      title: "Ülkede huzursuzluk var",
      reason:
        "Halkın desteğini artır. Çok düşük istikrar iç savaşa yol açabilir.",
      tab: "politics",
      action: { type: "decision", id: "publicWorks" },
    });
  if (!out.length)
    out.push({
      id: "ready",
      title: "Ülken hazır",
      reason:
        "Zamanı ilerlet. Araştırma, eğitim ve inşaatlar gün geçtikçe tamamlanır.",
      tab: "army",
    });
  return out;
}
