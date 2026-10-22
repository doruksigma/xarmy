import { EQUIPMENT, UNITS } from "./catalog";
import { SUPPORT } from "./advanced-catalog";
import { combatPower, routeTo } from "./land";
import {
  atWar,
  clamp,
  friendly,
  GEOGRAPHY,
  localSupply,
  requireRule,
  uid,
} from "./world";
import type { Action, Army, Country, Equipment, World } from "./types";

export function equipmentNeeds(a: Army): Partial<Record<Equipment, number>> {
  const needs = { ...UNITS[a.type].equipment };
  for (const id of a.support)
    for (const [e, n] of Object.entries(SUPPORT[id].equipment))
      needs[e as Equipment] = (needs[e as Equipment] ?? 0) + n;
  return needs;
}
export function detachArmy(w: World, id: string) {
  for (const f of w.fronts) f.armies = f.armies.filter((x) => x !== id);
  for (const p of w.plans) p.armies = p.armies.filter((x) => x !== id);
}
export function planningAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "support") {
    const army = w.armies.find((x) => x.country === c.id && x.id === a.army),
      d = SUPPORT[a.support];
    requireRule(army && d, "Kendi tümenini ve destek bölüğünü seç.");
    requireRule(
      !army.move && localSupply(w, c.id, army.province) >= 0.4,
      "Destek değişimi için tümeni durdur ve ikmal bağlantısı kur.",
    );
    if (a.remove) {
      requireRule(army.support.includes(a.support), "Bu destek tümeninde yok.");
      army.support = army.support.filter((s) => s !== a.support);
      for (const [e, n] of Object.entries(d.equipment))
        c.equipment[e as Equipment] += ((n * army.strength) / 100) * 0.5;
    } else {
      requireRule(
        !army.support.includes(a.support) && army.support.length < 3,
        "Bir tümene en fazla üç farklı destek bölüğü ekleyebilirsin.",
      );
      requireRule(
        !d.tech || c.tech.includes(d.tech),
        "Önce gerekli destek teknolojisini araştır.",
      );
      for (const [e, n] of Object.entries(d.equipment))
        requireRule(
          c.equipment[e as Equipment] >= n,
          `${n} ${EQUIPMENT[e as Equipment].name} gerekir.`,
        );
      for (const [e, n] of Object.entries(d.equipment))
        c.equipment[e as Equipment] -= n;
      army.support.push(a.support);
    }
    army.organization = Math.max(0, army.organization - 15);
    return true;
  }
  if (a.type === "offensive") {
    requireRule(
      a.armies.length > 0 &&
        new Set(a.armies).size === a.armies.length &&
        a.armies.every((id) =>
          w.armies.some((x) => x.id === id && x.country === c.id),
        ),
      "Taarruza kendi tümenlerini ata.",
    );
    requireRule(
      a.objectives.length > 0 &&
        a.objectives.length <= 12 &&
        new Set(a.objectives).size === a.objectives.length &&
        a.objectives.every(
          (id) => w.provinces[id] && atWar(w, c.id, w.provinces[id].controller),
        ),
      "Savaşta olduğun ülkeden 1–12 farklı hedef eyalet seç.",
    );
    requireRule(
      ["careful", "balanced", "aggressive"].includes(a.stance),
      "Geçersiz taarruz yaklaşımı.",
    );
    for (const id of a.armies) {
      detachArmy(w, id);
      const army = w.armies.find((x) => x.id === id)!;
      army.move = null;
      army.route = [];
    }
    w.plans = w.plans.filter((p) => p.armies.length);
    w.plans.push({
      id: uid(w, "plan"),
      country: c.id,
      name: `${GEOGRAPHY[a.objectives.at(-1)!].name} harekâtı`,
      armies: [...a.armies],
      objectives: [...a.objectives],
      preparation: 0,
      active: false,
      stance: a.stance,
    });
    return true;
  }
  if (a.type === "plan") {
    const plan = w.plans.find((p) => p.id === a.id && p.country === c.id);
    requireRule(plan, "Harekât planı bulunamadı.");
    if (a.kind === "start") {
      requireRule(plan.preparation >= 30, "Hazırlık en az %30 olmalı.");
      plan.active = true;
    } else {
      for (const army of w.armies.filter((x) => plan.armies.includes(x.id))) {
        army.move = null;
        army.route = [];
      }
      plan.active = false;
      if (a.kind === "delete") w.plans = w.plans.filter((p) => p !== plan);
    }
    return true;
  }
  return false;
}
function nextStep(w: World, a: Army, to: string) {
  const queue = [[a.province]],
    seen = new Set([a.province]);
  for (const path of queue) {
    const last = path.at(-1)!;
    if (last === to) return path[1];
    for (const e of GEOGRAPHY[last].neighbors) {
      if (e.sea || seen.has(e.id)) continue;
      if (
        !friendly(w, a.country, w.provinces[e.id].controller) &&
        !atWar(w, a.country, w.provinces[e.id].controller)
      )
        continue;
      seen.add(e.id);
      queue.push([...path, e.id]);
    }
  }
}
export function planningDay(w: World) {
  for (const p of w.plans) {
    p.armies = p.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === p.country),
    );
    const c = w.countries[p.country],
      armies = w.armies.filter((a) => p.armies.includes(a.id));
    if (!armies.length || c.capitulated) {
      p.active = false;
      continue;
    }
    if (!p.active) {
      const readiness =
        armies.reduce((n, a) => n + (a.supply * a.organization) / 100, 0) /
        armies.length;
      p.preparation = clamp(
        p.preparation + readiness * (c.cabinet.military === "planner" ? 4 : 2),
      );
      continue;
    }
    const targets = p.objectives.filter((id) =>
      atWar(w, p.country, w.provinces[id].controller),
    );
    if (!targets.length) {
      p.active = false;
      continue;
    }
    for (const a of armies) {
      if (a.move || a.route.length) continue;
      if (a.organization < 25 || a.supply < 0.25 || a.strength < 30) {
        const rear = GEOGRAPHY[a.province].neighbors
          .filter(
            (e) =>
              !e.sea && friendly(w, a.country, w.provinces[e.id].controller),
          )
          .sort(
            (l, r) =>
              localSupply(w, a.country, r.id) - localSupply(w, a.country, l.id),
          )[0];
        if (rear && localSupply(w, a.country, rear.id) > a.supply)
          a.route = [rear.id];
        continue;
      }
      const step = nextStep(w, a, targets[0]);
      if (!step) continue;
      if (atWar(w, a.country, w.provinces[step].controller)) {
        const def = w.armies
          .filter((x) => x.province === step && atWar(w, a.country, x.country))
          .reduce((n, x) => n + combatPower(w, x, false, step), 0);
        const attack = armies
          .filter(
            (x) =>
              GEOGRAPHY[x.province].neighbors.some(
                (e) => !e.sea && e.id === step,
              ) && x.organization >= 25,
          )
          .reduce((n, x) => n + combatPower(w, x, true, step), 0);
        if (
          attack / Math.max(1, def) <
          { careful: 1.35, balanced: 0.95, aggressive: 0.6 }[p.stance]
        )
          continue;
      }
      a.route = routeTo(w, a, step) ?? [];
      a.stance = "advance";
    }
    p.preparation = Math.max(0, p.preparation - 0.3);
  }
  w.plans = w.plans.filter((p) => p.armies.length);
}
