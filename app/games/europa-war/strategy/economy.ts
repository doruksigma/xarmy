import { tradeRoute } from "./trade-routes";
import { BUILDINGS, EQUIPMENT, UNITS } from "./catalog";
import {
  addArmy,
  atWar,
  capacity,
  clamp,
  controlled,
  event,
  GEOGRAPHY,
  requireRule,
  uid,
} from "./world";
import type { Action, Country, Equipment, Resource, World } from "./types";

export const ECONOMIES = {
  civilian: { name: "Sivil ekonomi", construction: 1, output: 1, tax: 1 },
  partial: {
    name: "Kısmi seferberlik",
    construction: 0.85,
    output: 1.25,
    tax: 0.9,
  },
  war: { name: "Savaş ekonomisi", construction: 0.7, output: 1.6, tax: 0.75 },
};
export const CONSCRIPTION = {
  volunteer: { name: "Gönüllü ordu", fraction: 0.015 },
  limited: { name: "Sınırlı zorunlu hizmet", fraction: 0.035 },
  extensive: { name: "Genel seferberlik", fraction: 0.065 },
};
export function economyAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "build") {
    const p = w.provinces[a.province],
      def = BUILDINGS[a.building];
    requireRule(
      p && p.controller === c.id,
      "İnşaat için kontrol ettiğin bir eyalet seç.",
    );
    requireRule(def, "Geçersiz yapı.");
    requireRule(
      a.building !== "dock" || GEOGRAPHY[p.id].port,
      "Tersane için liman gerekir.",
    );
    requireRule(
      a.building !== "radar" || c.tech.includes("radar"),
      "Önce radar teknolojisini araştır.",
    );
    const queued = c.construction.filter(
      (q) => q.province === p.id && q.building === a.building,
    ).length;
    requireRule(
      p.buildings[a.building] + queued < def.max,
      "Bu yapının eyaletteki üst sınırına ulaştın.",
    );
    requireRule(
      c.construction.length < 8,
      "İnşaat kuyruğunda en fazla 8 proje olabilir.",
    );
    requireRule(c.treasury >= def.cost, `${def.cost} hazine gerekir.`);
    c.treasury -= def.cost;
    c.construction.push({
      id: uid(w, "build"),
      province: p.id,
      building: a.building,
      progress: 0,
      total: def.work,
    });
    return true;
  }
  if (a.type === "cancelBuild") {
    const q = c.construction.find((q) => q.id === a.id);
    requireRule(q, "İnşaat bulunamadı.");
    c.treasury +=
      BUILDINGS[q.building].cost * (1 - q.progress / q.total) * 0.75;
    c.construction = c.construction.filter((x) => x !== q);
    return true;
  }
  if (a.type === "production") {
    const def = EQUIPMENT[a.equipment];
    requireRule(def, "Geçersiz ekipman.");
    requireRule(
      Number.isInteger(a.factories) && a.factories >= 0 && a.factories <= 100,
      "Geçersiz fabrika sayısı.",
    );
    requireRule(
      !def.tech || c.tech.includes(def.tech),
      "Bu ekipman için teknoloji araştırması gerekir.",
    );
    const line = c.production.find((p) => p.equipment === a.equipment);
    const used = c.production
      .filter(
        (p) =>
          p.equipment !== a.equipment &&
          !!EQUIPMENT[p.equipment].naval === !!def.naval,
      )
      .reduce((n, p) => n + p.factories, 0);
    requireRule(
      // Losing factories can leave several existing allocations over capacity.
      // Let the player reduce them one at a time without permitting expansion.
      a.factories <= (line?.factories ?? 0) ||
        used + a.factories <=
          Math.floor(capacity(w, c.id, def.naval ? "dock" : "military")),
      def.naval
        ? "Yeterli boş tersane yok."
        : "Yeterli boş askerî fabrika yok.",
    );
    if (line) line.factories = a.factories;
    else if (a.factories)
      c.production.push({
        equipment: a.equipment,
        factories: a.factories,
        efficiency: 0.2,
      });
    c.production = c.production.filter((p) => p.factories > 0);
    return true;
  }
  if (a.type === "recruit") {
    const def = UNITS[a.unit];
    requireRule(def, "Geçersiz birlik.");
    requireRule(
      w.provinces[a.province]?.controller === c.id &&
        w.provinces[a.province].owner === c.id,
      "Eğitim için işgal altında olmayan kendi eyaletini seç.",
    );
    requireRule(
      !def.tech || c.tech.includes(def.tech),
      "Önce bu birliğin teknolojisini araştır.",
    );
    requireRule(
      c.recruitment.length < 6,
      "Aynı anda en fazla 6 tümen eğitilebilir.",
    );
    requireRule(
      c.manpower >= def.men,
      `${def.men.toLocaleString("tr-TR")} insan gücü gerekir.`,
    );
    for (const [key, value] of Object.entries(def.equipment))
      requireRule(
        c.equipment[key as Equipment] >= value,
        `${value} ${EQUIPMENT[key as Equipment].name} gerekir.`,
      );
    c.manpower -= def.men;
    for (const [key, value] of Object.entries(def.equipment))
      c.equipment[key as Equipment] -= value;
    c.recruitment.push({
      id: uid(w, "recruit"),
      province: a.province,
      type: a.unit,
      progress: 0,
      total: def.days,
    });
    return true;
  }
  if (a.type === "economy") {
    requireRule(ECONOMIES[a.law], "Geçersiz ekonomi kanunu.");
    requireRule(c.economy !== a.law, "Bu kanun zaten yürürlükte.");
    requireRule(c.political >= 50, "50 siyasi güç gerekir.");
    requireRule(
      a.law !== "war" || c.wars.length > 0 || c.warSupport >= 60,
      "Savaş ekonomisi için savaşta olmalı veya %60 savaş desteğine ulaşmalısın.",
    );
    c.political -= 50;
    c.economy = a.law;
    c.stability = clamp(c.stability - 4);
    return true;
  }
  if (a.type === "conscription") {
    requireRule(CONSCRIPTION[a.law], "Geçersiz askerlik kanunu.");
    requireRule(
      CONSCRIPTION[a.law].fraction > CONSCRIPTION[c.conscription].fraction,
      "Yalnızca daha kapsamlı bir seferberliğe geçebilirsin.",
    );
    requireRule(c.political >= 60, "60 siyasi güç gerekir.");
    requireRule(
      a.law !== "extensive" || c.wars.length > 0 || c.warSupport >= 55,
      "Genel seferberlik için savaş veya %55 savaş desteği gerekir.",
    );
    c.political -= 60;
    c.conscription = a.law;
    c.stability = clamp(c.stability - 8);
    const target = c.population * CONSCRIPTION[a.law].fraction;
    c.manpower += Math.max(0, target - c.mobilized);
    c.mobilized = Math.max(target, c.mobilized);
    return true;
  }
  if (a.type === "trade") {
    const seller = w.countries[a.target];
    requireRule(
      seller && seller !== c && !seller.capitulated,
      "Geçerli bir ticaret ortağı seç.",
    );
    requireRule(
      ["iron", "steel", "oil", "aluminum", "rubber", "fuel"].includes(
        a.resource,
      ),
      "Geçersiz kaynak.",
    );
    requireRule(
      Number.isFinite(a.amount) && a.amount > 0 && a.amount <= 20,
      "Günlük miktar 1–20 arasında olmalı.",
    );
    requireRule(
      !atWar(w, c.id, seller.id) &&
        !seller.embargoes.includes(c.id) &&
        !c.embargoes.includes(seller.id),
      "Savaş veya ambargo ticareti engelliyor.",
    );
    requireRule(
      (seller.relations[c.id] ?? 0) > -30,
      "Ticaret için ilişkiler −30 üstünde olmalı.",
    );
    requireRule(
      seller.stock[a.resource] >= a.amount * 3,
      "Ortağın bu kaynaktan yeterli fazlası yok.",
    );
    requireRule(
      !w.trades.some(
        (t) =>
          t.from === seller.id && t.to === c.id && t.resource === a.resource,
      ),
      "Bu kaynak için anlaşma zaten var.",
    );
    w.trades.push({
      id: uid(w, "trade"),
      from: seller.id,
      to: c.id,
      resource: a.resource,
      amount: a.amount,
    });
    return true;
  }
  if (a.type === "cancelTrade") {
    const t = w.trades.find((t) => t.id === a.id);
    requireRule(t && (t.to === c.id || t.from === c.id), "Anlaşma bulunamadı.");
    w.trades = w.trades.filter((t) => t.id !== a.id);
    return true;
  }
  return false;
}
export function economyDay(w: World) {
  for (const c of Object.values(w.countries)) {
    if (c.capitulated) continue;
    const provinces = controlled(w, c.id),
      civil = capacity(w, c.id, "civil"),
      law = ECONOMIES[c.economy];
    const upkeep =
      w.armies.filter((a) => a.country === c.id).length * 0.35 +
      c.navy.ships.length * 0.1 +
      c.agents * 0.2;
    c.treasury = clamp(
      c.treasury + civil * 0.75 * law.tax * (0.6 + c.stability / 250) - upkeep,
      0,
      1000000,
    );
    if (c.treasury === 0) c.stability = clamp(c.stability - 0.15);
    c.political = clamp(c.political + 0.8 * (0.5 + c.stability / 200), 0, 500);
    for (const p of provinces) {
      const yieldRate =
        (0.7 + p.buildings.infra * 0.1) *
        (1 + p.buildings.mine * 0.25) *
        (1 - p.damage / 150) *
        (p.owner === c.id ? 1 : 0.35 + p.compliance / 200);
      for (const r of ["iron", "oil", "aluminum"] as const)
        c.stock[r] += GEOGRAPHY[p.id].resources[r] * yieldRate * 0.25;
      c.stock.rubber += p.buildings.synthetic * 3;
      const steel = Math.min(
        c.stock.iron / 2,
        (p.buildings.civil + p.buildings.military) * 0.65,
      );
      c.stock.iron -= steel * 2;
      c.stock.steel += steel;
      const fuel = Math.min(c.stock.oil, p.buildings.refinery * 3);
      c.stock.oil -= fuel;
      c.stock.fuel += fuel * 4;
      p.damage = clamp(p.damage - 0.4); // Repairs are deliberately gradual, including sabotage damage.
    }
    c.stock.fuel = Math.min(
      c.stock.fuel,
      500 + provinces.reduce((n, p) => n + p.buildings.refinery * 300, 0),
    );
    let availableMilitary = capacity(w, c.id, "military"),
      availableDock = capacity(w, c.id, "dock");
    for (const line of c.production) {
      const def = EQUIPMENT[line.equipment];
      let factories = Math.min(
        line.factories,
        def.naval ? availableDock : availableMilitary,
      );
      if (def.naval) availableDock -= factories;
      else availableMilitary -= factories;
      let amount =
        (factories *
          3 *
          line.efficiency *
          law.output *
          (c.advisor === "industry" ? 1.1 : 1) *
          (c.cabinet.economy === "producer" ? 1.12 : 1) *
          (1 +
            (c.tech.includes("industry1") ? 0.15 : 0) +
            (c.tech.includes("industry2") ? 0.2 : 0))) /
        def.cost;
      for (const [r, needed] of Object.entries(def.inputs))
        amount = Math.min(amount, c.stock[r as Resource] / needed);
      for (const [r, needed] of Object.entries(def.inputs))
        c.stock[r as Resource] = Math.max(
          0,
          c.stock[r as Resource] - amount * needed,
        );
      c.equipment[line.equipment] += amount;
      if (factories && amount > 0)
        line.efficiency = clamp(line.efficiency + 0.002, 0, 0.95);
    }
    const build = c.construction[0];
    if (build && w.provinces[build.province].controller === c.id) {
      build.progress += Math.max(
        0.1,
        civil *
          law.construction *
          (c.advisor === "industry" ? 1.15 : 1) *
          (c.cabinet.economy === "builder" ? 1.15 : 1),
      );
      if (build.progress >= build.total) {
        const p = w.provinces[build.province];
        p.buildings[build.building] = Math.min(
          BUILDINGS[build.building].max,
          p.buildings[build.building] + 1,
        );
        c.construction.shift();
        if (c.id === w.player)
          event(
            w,
            `${GEOGRAPHY[p.id].name}: ${BUILDINGS[build.building].name} tamamlandı.`,
            "economy",
          );
      }
    }
    for (const q of c.recruitment)
      if (w.provinces[q.province].controller === c.id) q.progress++;
    for (const q of c.recruitment.filter((q) => q.progress >= q.total)) {
      addArmy(w, c.id, q.province, q.type);
      if (c.id === w.player)
        event(w, `${UNITS[q.type].name} eğitimi tamamlandı.`);
    }
    c.recruitment = c.recruitment.filter((q) => q.progress < q.total);
    for (const r of Object.keys(c.stock) as Resource[])
      c.stock[r] = clamp(c.stock[r], 0, 100000);
    for (const r of Object.keys(c.equipment) as Equipment[])
      c.equipment[r] = clamp(c.equipment[r], 0, 100000);
    if (w.day % 7 === 0) {
      c.history.push({
        day: w.day,
        treasury: c.treasury,
        factories: civil + capacity(w, c.id, "military"),
        manpower: c.manpower,
      });
      if (c.history.length > 52) c.history.shift();
    }
  }
  for (const t of w.trades) {
    const seller = w.countries[t.from],
      buyer = w.countries[t.to];
    if (
      seller.capitulated ||
      buyer.capitulated ||
      atWar(w, t.from, t.to) ||
      seller.embargoes.includes(t.to) ||
      buyer.embargoes.includes(t.from)
    )
      continue;
    const route = tradeRoute(w, t.from, t.to);
    if (!route) continue;
    const price = buyer.cabinet.economy === "trader" ? 1.7 : 2;
    const amount = Math.min(
      t.amount * route.delivery,
      seller.stock[t.resource],
      buyer.treasury / price,
      100000 - buyer.stock[t.resource],
    );
    seller.stock[t.resource] -= amount;
    buyer.stock[t.resource] += amount;
    buyer.treasury -= amount * price;
    seller.treasury += amount * price;
  }
}
