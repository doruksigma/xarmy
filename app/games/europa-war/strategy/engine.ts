import { conferenceAction, conferencesDay } from "./conference";
import { managementAction, managementDay } from "./management";
import { detachArmy, planningAction, planningDay } from "./planning";
import { aiDay } from "./ai";
import { diplomaticAction } from "./diplomacy";
import { economyAction, economyDay } from "./economy";
import { resolveLandDay, routeTo } from "./land";
import { operationsAction, operationsDay } from "./operations";
import { politicsAction, politicsDay } from "./politics";
import { clamp, friendly, GEOGRAPHY, requireRule, uid } from "./world";
import type { Action, World } from "./types";
export { createWorld } from "./world";

export function applyAction(
  world: World,
  action: Action,
): { world: World; error: string | null } {
  // Commands are atomic. An invalid order never spends resources or partly changes a campaign.
  const w = structuredClone(world),
    c = w.countries[w.player];
  try {
    requireRule(
      !c.capitulated,
      "Ülken teslim oldu. Kayıt yükleyebilir veya yeni sefer başlatabilirsin.",
    );
    if (action.type === "difficulty") {
      requireRule(
        ["easy", "normal", "hard"].includes(action.value),
        "Geçerli zorluk seç.",
      );
      w.difficulty = action.value;
    } else if (action.type === "front") {
      requireRule(
        action.provinces.length >= 2 &&
          action.provinces.length <= 20 &&
          new Set(action.provinces).size === action.provinces.length,
        "Hat için 2–20 farklı komşu eyalet seç.",
      );
      requireRule(
        action.provinces.every(
          (id, i) =>
            w.provinces[id]?.controller === c.id &&
            (!i ||
              GEOGRAPHY[action.provinces[i - 1]].neighbors.some(
                (n) => n.id === id && !n.sea,
              )),
        ),
        "Savunma hattı kontrol ettiğin komşu kara eyaletlerinden geçmeli.",
      );
      requireRule(
        action.armies.length > 0 &&
          action.armies.every((id) =>
            w.armies.some((a) => a.id === id && a.country === c.id),
          ),
        "Hatta kendi tümenlerini ata.",
      );
      for (const id of action.armies) detachArmy(w, id);
      w.fronts = w.fronts.filter((f) => f.armies.length > 0);
      for (const army of w.armies)
        if (action.armies.includes(army.id)) {
          army.move = null;
          army.route = [];
        }
      w.fronts.push({
        id: uid(w, "front"),
        country: c.id,
        provinces: [...action.provinces],
        armies: [...new Set(action.armies)],
      });
    } else if (action.type === "deleteFront") {
      const front = w.fronts.find(
        (f) => f.id === action.id && f.country === c.id,
      );
      requireRule(front, "Cephe hattı bulunamadı.");
      for (const army of w.armies)
        if (front.armies.includes(army.id)) {
          army.move = null;
          army.route = [];
        }
      w.fronts = w.fronts.filter((f) => f !== front);
    } else if (
      action.type === "move" ||
      action.type === "halt" ||
      action.type === "moveGroup" ||
      action.type === "haltGroup" ||
      action.type === "general"
    ) {
      const ids =
        "armies" in action ? [...new Set(action.armies)] : [action.army];
      requireRule(ids.length > 0, "Emir vermek için en az bir tümen seç.");
      // All members receive one atomic order. Shared origins reuse pathfinding,
      // but each unit retains its own movement, supply and battle state.
      const routes = new Map<string, string[] | null>();
      for (const id of ids) {
        const a = w.armies.find((a) => a.id === id && a.country === c.id);
        requireRule(a, "Kendi ordularından birini seç.");
        if (action.type !== "general") detachArmy(w, a.id);
        if (action.type === "halt" || action.type === "haltGroup") {
          a.move = null;
          a.route = [];
          a.stance = "hold";
        }
        if (action.type === "general") {
          requireRule(
            action.general === null ||
              c.generals.some((g) => g.id === action.general),
            "Komutan bulunamadı.",
          );
          a.general = action.general;
        }
        if (action.type === "move" || action.type === "moveGroup") {
          requireRule(w.provinces[action.to], "Hedef eyalet bulunamadı.");
          const start = action.append
            ? (a.route.at(-1) ?? a.move?.to ?? a.province)
            : (a.move?.to ?? a.province);
          if (!routes.has(start))
            routes.set(start, routeTo(w, a, action.to, start));
          const route = routes.get(start);
          requireRule(
            route,
            `${a.name}: Uygun rota yok. Sınır için savaş/geçiş izni, deniz için donanma gerekir.`,
          );
          requireRule(
            route.length === 0 || a.organization >= 10,
            `${a.name}: Birliğin önce organizasyonunu toplaması gerekiyor.`,
          );
          a.route = action.append ? [...a.route, ...route] : [...route];
          a.stance = "advance";
        }
      }
    } else if (action.type === "diplomacy")
      diplomaticAction(w, c, action.target, action.kind);
    else
      requireRule(
        conferenceAction(w, c, action) ||
          managementAction(w, c, action) ||
          planningAction(w, c, action) ||
          economyAction(w, c, action) ||
          politicsAction(w, c, action) ||
          operationsAction(w, c, action),
        "İşlem tanınmadı.",
      );
    return { world: w, error: null };
  } catch (error) {
    return {
      world,
      error: error instanceof Error ? error.message : "İşlem tamamlanamadı.",
    };
  }
}
export function advanceDay(world: World): World {
  const w = structuredClone(world);
  w.day++;
  economyDay(w);
  politicsDay(w);
  operationsDay(w);
  aiDay(w);
  managementDay(w);
  planningDay(w);
  for (const front of w.fronts) {
    const points = front.provinces.filter((id) =>
      friendly(w, front.country, w.provinces[id].controller),
    );
    front.armies = front.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === front.country),
    );
    if (!points.length) continue;
    front.armies.forEach((id, i) => {
      const a = w.armies.find((a) => a.id === id)!;
      if (a.move || a.route.length) return;
      const to = points[i % points.length];
      if (a.province !== to) a.route = routeTo(w, a, to) ?? [];
    });
  }
  w.fronts = w.fronts.filter((f) => f.armies.length > 0);
  resolveLandDay(w);
  for (const p of w.plans)
    p.armies = p.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === p.country),
    );
  w.plans = w.plans.filter((p) => p.armies.length);
  for (const f of w.fronts)
    f.armies = f.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === f.country),
    );
  w.fronts = w.fronts.filter((f) => f.armies.length);
  conferencesDay(w);
  w.tension = clamp(w.tension - 0.002);
  return w;
}
