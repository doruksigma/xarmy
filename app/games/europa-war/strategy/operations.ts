import { MISSIONS } from "./catalog";
import {
  atWar,
  changeRelation,
  clamp,
  controlled,
  event,
  GEOGRAPHY,
  navalPower,
  random,
  requireRule,
} from "./world";
import type { Action, Country, World } from "./types";

export function airPower(c: Country) {
  return (
    (Math.floor(c.equipment.fighter) + Math.floor(c.equipment.bomber) * 0.2) *
    (c.tech.includes("aviation3") ? 1.3 : 1) *
    (c.tech.includes("airDoctrine") ? 1.2 : 1) *
    (c.stock.fuel > 0 ? 1 : 0.1)
  );
}
export function intelChance(c: Country, t: Country) {
  return clamp(
    0.55 +
      (c.tech.includes("decryption") ? 0.15 : 0) -
      (t.tech.includes("encryption") ? 0.2 : 0) -
      (t.counterIntel ? 0.2 : 0),
    0.1,
    0.9,
  );
}
export function operationsAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "air" || a.type === "navy") {
    requireRule(w.countries[a.target], "Geçersiz hedef.");
    requireRule(
      [
        "idle",
        ...(a.type === "air"
          ? ["superiority", "support", "strategic"]
          : ["patrol", "raid"]),
      ].includes(a.mission),
      "Geçersiz görev.",
    );
    requireRule(
      a.mission === "idle" || a.target === c.id || atWar(w, c.id, a.target),
      "Görev hedefi kendi ülken veya savaştığın ülke olmalı.",
    );
    if (a.type === "air") {
      requireRule(
        a.mission === "idle" || c.equipment.fighter + c.equipment.bomber >= 1,
        "Kullanılabilir uçak yok.",
      );
      requireRule(
        !["support", "strategic"].includes(a.mission) ||
          c.equipment.bomber >= 1,
        "Bombardıman uçağı gerekir.",
      );
      c.air = { mission: a.mission, target: a.target };
    } else {
      requireRule(
        a.mission === "idle" || navalPower(c) > 0,
        "Kullanılabilir donanma yok.",
      );
      requireRule(
        a.mission !== "raid" || c.equipment.submarine >= 1,
        "Konvoy baskını için denizaltı gerekir.",
      );
      c.navy = { mission: a.mission, target: a.target };
    }
    return true;
  }
  if (a.type === "paradrop") {
    const army = w.armies.find((x) => x.id === a.army && x.country === c.id);
    requireRule(
      army?.type === "paratrooper" && c.tech.includes("airborne"),
      "Hava indirme eğitimi ve paraşütçü tümen gerekir.",
    );
    const target = w.provinces[a.to];
    requireRule(
      target && atWar(w, c.id, target.controller),
      "Düşman eyaleti seç.",
    );
    requireRule(
      !army.move && army.organization >= 70,
      "Tümen hareketsiz ve organizasyonu en az 70 olmalı.",
    );
    requireRule(
      c.air.mission === "superiority" &&
        c.air.target === target.controller &&
        airPower(c) > airPower(w.countries[target.controller]) * 1.4,
      "Hedef ülkede hava üstünlüğü görevi ve en az %40 güç üstünlüğü gerekir.",
    );
    requireRule(
      c.equipment.bomber >= 5 && c.stock.fuel >= 40,
      "Nakliye için 5 bombardıman uçağı ve 40 yakıt gerekir.",
    );
    requireRule(
      Math.hypot(
        GEOGRAPHY[army.province].x - GEOGRAPHY[a.to].x,
        GEOGRAPHY[army.province].y - GEOGRAPHY[a.to].y,
      ) < 220,
      "Hava indirme menzili aşıldı.",
    );
    c.stock.fuel -= 40;
    army.organization -= 30;
    army.route = [];
    army.move = { to: a.to, progress: 0, days: 2 };
    return true;
  }
  if (a.type === "agency") {
    requireRule(!c.agency, "Teşkilat zaten kurulu.");
    requireRule(c.treasury >= 200, "200 hazine gerekir.");
    c.treasury -= 200;
    c.agency = true;
    return true;
  }
  if (a.type === "trainAgent") {
    requireRule(c.agency, "Önce istihbarat teşkilatını kur.");
    requireRule(
      c.agents + c.missions.length < 5 && !c.agentTraining,
      "En fazla 5 ajan; aynı anda tek ajan eğitilir.",
    );
    requireRule(c.treasury >= 80, "80 hazine gerekir.");
    c.treasury -= 80;
    c.agentTraining = 30;
    return true;
  }
  if (a.type === "counterIntel") {
    requireRule(c.agency, "Önce istihbarat teşkilatını kur.");
    requireRule(
      c.counterIntel || c.agents >= 1,
      "Karşı casusluk için boşta bir ajan gerekir.",
    );
    c.counterIntel = !c.counterIntel;
    return true;
  }
  if (a.type === "mission") {
    const target = w.countries[a.target],
      mission = MISSIONS[a.mission];
    requireRule(
      target && target !== c && !target.capitulated && mission,
      "Geçerli görev ve hedef seç.",
    );
    requireRule(
      c.agency && c.agents > (c.counterIntel ? 1 : 0),
      "Operasyon için boşta bir ajan gerekir.",
    );
    requireRule(c.treasury >= 60, "Operasyon için 60 hazine gerekir.");
    requireRule(
      a.mission !== "resistance" ||
        controlled(w, target.id).some((p) => p.owner !== target.id),
      "Hedefin işgal ettiği bir bölge yok.",
    );
    c.treasury -= 60;
    c.agents--;
    c.missions.push({
      id: `mission-${++w.serial}`,
      target: target.id,
      type: a.mission,
      progress: 0,
      total: mission.days,
    });
    return true;
  }
  return false;
}
export function operationsDay(w: World) {
  for (const c of Object.values(w.countries)) {
    if (c.capitulated) continue;
    if (c.agentTraining > 0 && !--c.agentTraining) {
      c.agents++;
      if (c.id === w.player) event(w, "Ajan eğitimi tamamlandı.");
    }
    for (const mission of c.missions) {
      if (++mission.progress < mission.total) continue;
      const t = w.countries[mission.target];
      if (t.capitulated) {
        c.agents++;
        continue;
      }
      const success = random(w) < intelChance(c, t);
      if (success) {
        if (mission.type === "intel" || mission.type === "plans")
          c.intel[t.id] = {
            level: mission.type === "plans" ? 90 : 65,
            expires: w.day + (mission.type === "plans" ? 90 : 180),
          };
        if (mission.type === "sabotage")
          w.provinces[t.capital].damage = clamp(
            w.provinces[t.capital].damage + 65,
          );
        if (mission.type === "propaganda") {
          t.stability = clamp(t.stability - 8);
          const old = t.parties[c.ideology],
            next = clamp(old + 10);
          for (const key of Object.keys(
            t.parties,
          ) as (keyof Country["parties"])[])
            if (key !== c.ideology)
              t.parties[key] *= (100 - next) / Math.max(1, 100 - old);
          t.parties[c.ideology] = next;
        }
        if (mission.type === "resistance")
          for (const p of controlled(w, t.id))
            if (p.owner !== t.id) p.resistance = clamp(p.resistance + 25);
        if (mission.type === "diplomacy") changeRelation(w, c.id, t.id, 30);
        c.agents++;
        if (c.id === w.player)
          event(w, `${t.name}: ${MISSIONS[mission.type].name} başarılı.`);
      } else {
        changeRelation(w, c.id, t.id, -12);
        if (random(w) > 0.45) c.agents++;
        if (c.id === w.player)
          event(
            w,
            `${t.name}: operasyon başarısız; ajan yakalanmış veya geri çekilmiş olabilir.`,
          );
      }
    }
    c.missions = c.missions.filter((m) => m.progress < m.total);
    if (c.air.mission !== "idle" && c.stock.fuel >= 2) {
      c.stock.fuel -= Math.min(
        c.stock.fuel,
        2 + c.equipment.fighter * 0.015 + c.equipment.bomber * 0.03,
      );
      const t = w.countries[c.air.target];
      if (t && atWar(w, c.id, t.id)) {
        const opposition =
          t.air.mission !== "idle" ? airPower(t) : airPower(t) * 0.25;
        const loss = opposition * 0.003;
        c.equipment.fighter = Math.max(0, c.equipment.fighter - loss);
        if (c.air.mission === "strategic" && c.equipment.bomber >= 1) {
          const p = w.provinces[t.capital];
          const superiority = clamp(
            airPower(c) / Math.max(1, opposition),
            0.2,
            1.5,
          );
          p.damage = clamp(
            p.damage +
              (c.equipment.bomber * 0.05 * superiority) /
                (1 + p.buildings.radar * 0.5),
          );
          c.equipment.bomber = Math.max(
            0,
            c.equipment.bomber -
              (p.buildings.radar * 0.03 + opposition * 0.001),
          );
        }
        if (
          c.tech.includes("recon") &&
          c.air.mission === "superiority" &&
          (!c.intel[t.id] || c.intel[t.id].level < 50)
        )
          c.intel[t.id] = { level: 50, expires: w.day + 14 };
      }
    }
    if (c.navy.mission !== "idle" && navalPower(c) > 0 && c.stock.fuel >= 2) {
      c.stock.fuel -= 2;
      const t = w.countries[c.navy.target];
      if (t && atWar(w, c.id, t.id) && t.navy.mission !== "idle") {
        const loss = navalPower(t) * 0.0006;
        c.equipment.ship = Math.max(0, c.equipment.ship - loss);
        c.equipment.submarine = Math.max(0, c.equipment.submarine - loss * 0.4);
        c.equipment.carrier = Math.max(0, c.equipment.carrier - loss * 0.1);
      }
    }
    if (c.subjectOf && !w.countries[c.subjectOf].capitulated) {
      const tribute = Math.min(c.treasury, 2);
      c.treasury -= tribute;
      w.countries[c.subjectOf].treasury += tribute;
    }
  }
}
