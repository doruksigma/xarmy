import { conferenceAction } from "./conference";
import {
  assignCommander,
  cleanupCommanders,
  commanderAction,
} from "./commanders";
import { managementAction } from "./management";
import { detachArmy, planningAction } from "./planning";
import { diplomaticAction } from "./diplomacy";
import { economyAction } from "./economy";
import { routeTo } from "./land";
import { operationsAction } from "./operations";
import { politicsAction } from "./politics";
import { friendly, GEOGRAPHY, requireRule, uid } from "./world";
import { Immer, current, isDraft } from "immer";
import { isValidAction } from "./command-types";
import type { Action, World } from "./types";

const transactions = new Immer({ autoFreeze: false });

/** Shared rules mutate only a transaction draft. The issuer never changes the human player. */
export function dispatchCountryAction(
  w: World,
  issuerCountryId: string,
  action: Action,
): void {
  requireRule(
    isValidAction(action),
    "Emir biçimi veya parametreleri geçersiz.",
  );
  const c = Object.hasOwn(w.countries, issuerCountryId)
    ? w.countries[issuerCountryId]
    : undefined;
  requireRule(c, "Emri veren ülke bulunamadı.");
  requireRule(
    !c.capitulated,
    "Ülken teslim oldu. Kayıt yükleyebilir veya yeni sefer başlatabilirsin.",
  );
  if (action.type === "difficulty") {
    requireRule(
      issuerCountryId === w.player,
      "Yalnız oyuncu zorluğu değiştirebilir.",
    );
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
    const plainArmies = isDraft(w.armies) ? current(w.armies) : w.armies;
    const armyIndices = new Map(
      plainArmies.map((army, index) => [army.id, index]),
    );
    const marchGroup =
      action.type === "moveGroup" && ids.length > 1
        ? uid(w, "march")
        : undefined;
    for (const id of ids) {
      const index = armyIndices.get(id);
      const a =
        index !== undefined && plainArmies[index].country === c.id
          ? w.armies[index]
          : undefined;
      requireRule(a, "Kendi ordularından birini seç.");
      if (action.type !== "general") detachArmy(w, a.id);
      if (action.type === "halt" || action.type === "haltGroup") {
        a.move = null;
        a.route = [];
        a.stance = "hold";
      }
      if (action.type === "general") {
        assignCommander(w, c, a, action.general);
      }
      if (action.type === "move" || action.type === "moveGroup") {
        requireRule(w.provinces[action.to], "Hedef eyalet bulunamadı.");
        const start = action.append
          ? (a.route.at(-1) ?? a.move?.to ?? a.province)
          : a.province;
        const continuingDrop =
          !action.append &&
          a.move?.kind === "paradrop" &&
          a.move.to === action.to;
        if (!continuingDrop && !routes.has(start))
          routes.set(start, routeTo(w, a, action.to, start));
        const route = continuingDrop ? [] : routes.get(start);
        requireRule(
          route,
          `${a.name}: Uygun rota yok. Sınır için savaş/geçiş izni, deniz için donanma gerekir.`,
        );
        const defensive = action.stance === "hold";
        requireRule(
          !defensive ||
            route.every((id) => friendly(w, c.id, w.provinces[id].controller)),
          "Savunma hareketi yalnız dost topraklardan geçebilir.",
        );
        const continuing =
          !action.append &&
          (continuingDrop || (a.move !== null && route[0] === a.move.to));
        const remaining =
          continuing && !continuingDrop ? route.slice(1) : route;
        const supplyRetreat =
          !action.append &&
          a.supply < 0.25 &&
          route.every((id) =>
            friendly(w, a.country, w.provinces[id].controller),
          );
        requireRule(
          remaining.length === 0 ||
            a.organization >= 10 ||
            supplyRetreat ||
            defensive,
          `${a.name}: Birliğin önce organizasyonunu toplaması gerekiyor.`,
        );
        if (action.append) a.route = [...a.route, ...route];
        else {
          // A replacement order begins at the unit's actual location. Keep
          // progress only when its next leg is still the requested path;
          // redirecting out of combat must not wait for the old city to fall.
          if (!continuing) a.move = null;
          a.route = [...remaining];
        }
        a.stance = action.stance ?? "advance";
        if (
          marchGroup &&
          a.move?.kind !== "paradrop" &&
          (a.move || a.route.length)
        )
          a.marchGroup = marchGroup;
      }
    }
  } else if (action.type === "diplomacy")
    diplomaticAction(w, c, action.target, action.kind);
  else
    requireRule(
      commanderAction(w, c, action) ||
        conferenceAction(w, c, action) ||
        managementAction(
          w,
          c,
          action,
          (nested) =>
            tryCountryActionInPlace(w, issuerCountryId, nested).error === null,
        ) ||
        planningAction(w, c, action) ||
        economyAction(w, c, action) ||
        politicsAction(w, c, action) ||
        operationsAction(w, c, action),
      "İşlem tanınmadı.",
    );
  // Local order handlers already detach/reassign their own armies. Only changes
  // to international relations or territory can invalidate unrelated fronts;
  // daily simulation also performs the full cleanup at its normal boundaries.
  if (["diplomacy", "peaceClaim", "peacePass", "release"].includes(action.type))
    cleanupCommanders(w);
}

/** Copy only changed paths; publish nothing on failure, including nested macro actions. */
export function transactWorldInPlace(
  world: World,
  apply: (draft: World) => void,
): { world: World; error: string | null } {
  try {
    // An autoPlan runs inside an outer command draft. Snapshot it before creating
    // a nested savepoint; this prevents draft proxies escaping into the live world.
    const base = isDraft(world) ? current(world) : world;
    const next = transactions.produce(base, (draft) => {
      apply(draft);
    });
    Object.assign(world, next);
    return { world, error: null };
  } catch (error) {
    return {
      world,
      error: error instanceof Error ? error.message : "İşlem tamamlanamadı.",
    };
  }
}

export function tryCountryActionInPlace(
  world: World,
  issuerCountryId: string,
  action: Action,
): { world: World; error: string | null } {
  return transactWorldInPlace(world, (draft) =>
    dispatchCountryAction(draft, issuerCountryId, action),
  );
}

/** Legacy immutable callers retain fully isolated results, including untouched branches. */
export function applyCountryAction(
  world: World,
  issuerCountryId: string,
  action: Action,
): { world: World; error: string | null } {
  const result = tryCountryActionInPlace(
    structuredClone(world),
    issuerCountryId,
    action,
  );
  return result.error ? { world, error: result.error } : result;
}
