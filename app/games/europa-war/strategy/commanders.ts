import {
  assignAvailableCommander,
  COMMANDER_CAPACITY,
  createCommander,
} from "./commander-roster";
import { current, isDraft } from "immer";
import { atWar, event, friendly, GEOGRAPHY, requireRule } from "./world";
import type { Action, Army, Country, General, World } from "./types";

export { COMMANDER_CAPACITY } from "./commander-roster";

export function commanderArmies(
  w: World,
  country: string,
  general: string,
): Army[] {
  if (!isDraft(w.armies))
    return w.armies.filter(
      (a) => a.country === country && a.general === general,
    );
  const list = current(w.armies);
  const result: Army[] = [];
  for (let index = 0; index < list.length; index++)
    if (list[index].country === country && list[index].general === general)
      result.push(w.armies[index]);
  return result;
}

export function commanderBorders(
  w: World,
  country: string,
  target: string,
): string[] {
  if (
    country === target ||
    !w.countries[target] ||
    w.countries[target].capitulated
  )
    return [];
  return Object.values(w.provinces)
    .filter(
      (p) =>
        p.controller === country &&
        GEOGRAPHY[p.id].neighbors.some(
          (edge) => !edge.sea && w.provinces[edge.id]?.controller === target,
        ),
    )
    .map((p) => p.id)
    .sort();
}

export function commanderTargets(w: World, country: string): Country[] {
  const targets = new Set<string>();
  for (const p of Object.values(w.provinces)) {
    if (p.controller !== country) continue;
    for (const edge of GEOGRAPHY[p.id].neighbors) {
      const target = w.provinces[edge.id]?.controller;
      if (
        !edge.sea &&
        target &&
        target !== country &&
        !w.countries[target]?.capitulated
      )
        targets.add(target);
    }
  }
  return [...targets]
    .map((id) => w.countries[id])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

function stop(army: Army) {
  army.move = null;
  army.route = [];
  army.stance = "hold";
  delete army.marchGroup;
}

function detachPlans(w: World, army: Army) {
  for (const front of w.fronts)
    front.armies = front.armies.filter((id) => id !== army.id);
  for (const plan of w.plans)
    plan.armies = plan.armies.filter((id) => id !== army.id);
  delete army.marchGroup;
}

function recall(w: World, c: Country, general: General) {
  for (const army of commanderArmies(w, c.id, general.id)) stop(army);
  delete general.front;
}

/** One friendly-land BFS per shared origin, reused across all assigned borders. */
function routing(w: World, country: string) {
  const searches = new Map<string, Map<string, string | null>>();
  return (from: string, to: string): string[] | null => {
    if (from === to) return [];
    let previous = searches.get(from);
    if (!previous) {
      previous = new Map([[from, null]]);
      searches.set(from, previous);
      const queue = [from];
      for (let i = 0; i < queue.length; i++)
        for (const edge of GEOGRAPHY[queue[i]].neighbors) {
          if (
            edge.sea ||
            previous.has(edge.id) ||
            !friendly(w, country, w.provinces[edge.id].controller)
          )
            continue;
          previous.set(edge.id, queue[i]);
          queue.push(edge.id);
        }
    }
    if (!previous.has(to)) return null;
    const path = [to];
    while (previous.get(path[0]) !== from) path.unshift(previous.get(path[0])!);
    return path;
  };
}
type Routing = ReturnType<typeof routing>;

function defenseStrengths(w: World) {
  const strengths = new Map<string, number>();
  for (const army of w.armies) {
    const key = `${army.country}:${army.province}`;
    strengths.set(
      key,
      (strengths.get(key) ?? 0) + army.strength * army.organization,
    );
  }
  return strengths;
}

function assignments(
  armies: Army[],
  points: string[],
  previous: Record<string, string>,
  route: Routing,
): Record<string, string> {
  const candidates = armies.map((army) => ({
    army,
    options: points
      .map((id) => ({ id, path: route(army.province, id) }))
      .filter(
        (option): option is { id: string; path: string[] } =>
          option.path !== null,
      ),
  }));
  // Allocate constrained components first. In a connected country all points
  // receive either floor(n/points) or ceil(n/points) divisions.
  candidates.sort(
    (a, b) =>
      a.options.length - b.options.length || a.army.id.localeCompare(b.army.id),
  );
  const counts = new Map<string, number>();
  const result: Record<string, string> = {};
  for (const { army, options } of candidates) {
    options.sort(
      (a, b) =>
        (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) ||
        Number(b.id === army.province) - Number(a.id === army.province) ||
        Number(b.id === previous[army.id]) -
          Number(a.id === previous[army.id]) ||
        a.path.length - b.path.length ||
        a.id.localeCompare(b.id),
    );
    if (!options.length) continue;
    const point = options[0].id;
    result[army.id] = point;
    counts.set(point, (counts.get(point) ?? 0) + 1);
  }
  return result;
}

function setRoute(army: Army, path: string[], group: string) {
  // Repeated front updates must not restart a march or its combat progress.
  if (army.move && army.move.kind !== "paradrop" && path[0] === army.move.to)
    army.route = path.slice(1);
  else {
    army.move = null;
    army.route = [...path];
  }
  if (army.move || army.route.length) army.marchGroup = group;
  else delete army.marchGroup;
}

function distribute(
  w: World,
  c: Country,
  general: General,
  strict: boolean,
  route: Routing,
  strengths = defenseStrengths(w),
) {
  const front = general.front!;
  const armies = commanderArmies(w, c.id, general.id);
  const points = commanderBorders(w, c.id, front.target);
  if (!points.length) {
    if (strict)
      throw new Error(
        "Yalnızca kara sınırı bulunan bir ülkeye yerleşebilirsin.",
      );
    recall(w, c, general);
    return;
  }
  const next = assignments(armies, points, front.assignments, route);
  if (strict)
    requireRule(
      armies.every((a) => next[a.id]),
      "Bazı tümenlerin bu sınıra güvenli kara yolu yok. Önce onları ülkenin bağlı topraklarına getir.",
    );
  front.assignments = next;
  const attacking = front.stance === "attack" && atWar(w, c.id, front.target);
  if (!attacking) front.stance = "defend";
  for (const army of armies) {
    const destination = next[army.id];
    if (!destination) {
      stop(army);
      continue;
    }
    const pending = [...(army.move ? [army.move.to] : []), ...army.route];
    const hostile = pending.find((id) =>
      atWar(w, c.id, w.provinces[id].controller),
    );
    const safe = pending.every(
      (id) =>
        friendly(w, c.id, w.provinces[id].controller) ||
        (attacking && w.provinces[id].controller === front.target),
    );
    if (!safe || (hostile && !attacking)) stop(army);
    // Keep an active attack on THIS target. Nobody gets pulled away to assist
    // a different general or war, even when the country has several enemies.
    if (attacking && hostile && safe) {
      if (army.organization >= 10 && army.strength >= 20) continue;
      stop(army);
    }
    if (army.province !== destination) {
      setRoute(
        army,
        route(army.province, destination) ?? [],
        `commander-${general.id}`,
      );
      army.stance = "hold";
      continue;
    }
    stop(army);
    if (
      !attacking ||
      army.organization < 25 ||
      army.strength < 30 ||
      army.supply < 0.25
    )
      continue;
    const targets = GEOGRAPHY[army.province].neighbors.filter(
      (edge) => !edge.sea && w.provinces[edge.id].controller === front.target,
    );
    targets.sort((a, b) => {
      return (
        (strengths.get(`${front.target}:${a.id}`) ?? 0) -
          (strengths.get(`${front.target}:${b.id}`) ?? 0) ||
        GEOGRAPHY[b.id].vp - GEOGRAPHY[a.id].vp ||
        a.id.localeCompare(b.id)
      );
    });
    if (targets[0]) {
      army.route = [targets[0].id];
      army.marchGroup = `commander-${general.id}`;
      army.stance = "advance";
    }
  }
}

export function cleanupCommanders(w: World) {
  const armies = new Map(w.armies.map((a) => [a.id, a]));
  for (const c of Object.values(w.countries))
    for (const general of c.generals) {
      const front = general.front;
      if (!front) continue;
      if (
        c.capitulated ||
        !w.countries[front.target] ||
        w.countries[front.target].capitulated
      ) {
        recall(w, c, general);
        continue;
      }
      for (const [id, point] of Object.entries(front.assignments)) {
        const army = armies.get(id);
        if (
          !army ||
          army.country !== c.id ||
          army.general !== general.id ||
          w.provinces[point]?.controller !== c.id
        )
          delete front.assignments[id];
      }
      if (front.stance === "attack" && !atWar(w, c.id, front.target)) {
        front.stance = "defend";
        for (const army of commanderArmies(w, c.id, general.id))
          if (
            [...(army.move ? [army.move.to] : []), ...army.route].some(
              (id) => !friendly(w, c.id, w.provinces[id].controller),
            )
          )
            stop(army);
      }
    }
}

export function commandersDay(w: World) {
  cleanupCommanders(w);
  const strengths = defenseStrengths(w);
  for (const c of Object.values(w.countries)) {
    if (c.capitulated || !c.generals.some((g) => g.front)) continue;
    const route = routing(w, c.id);
    for (const general of c.generals)
      if (general.front) distribute(w, c, general, false, route, strengths);
  }
}

export function assignCommander(
  w: World,
  c: Country,
  army: Army,
  id: string | null,
) {
  const previous = c.generals.find((g) => g.id === army.general);
  const general = c.generals.find((g) => g.id === id);
  requireRule(id === null || general, "Komutan bulunamadı.");
  requireRule(
    !general ||
      commanderArmies(w, c.id, general.id).filter((a) => a.id !== army.id)
        .length < COMMANDER_CAPACITY,
    "Bir komutana en fazla 12 tümen bağlanabilir.",
  );
  if (previous?.front) delete previous.front.assignments[army.id];
  if (previous?.front || general?.front) {
    detachPlans(w, army);
    stop(army);
  }
  army.general = id;
  if (general?.front) distribute(w, c, general, false, routing(w, c.id));
}

export function commanderAction(w: World, c: Country, action: Action): boolean {
  if (action.type === "commanderAutoAssign") {
    requireRule(
      typeof action.enabled === "boolean",
      "Otomatik atama seçimini belirt.",
    );
    c.autoAssignCommanders = action.enabled;
    if (action.enabled)
      for (const army of w.armies) {
        if (army.country !== c.id || army.general) continue;
        const general = assignAvailableCommander(w, c, army);
        if (general.front) {
          detachPlans(w, army);
          stop(army);
        }
      }
    if (action.enabled) commandersDay(w);
    return true;
  }
  if (action.type === "commanderCreate") {
    createCommander(w, c);
    return true;
  }
  if (
    !["commanderDeploy", "commanderStance", "commanderRecall"].includes(
      action.type,
    )
  )
    return false;
  if (!("general" in action)) return false;
  const general = c.generals.find((g) => g.id === action.general);
  requireRule(general, "Kendi komutanlarından birini seç.");
  const armies = commanderArmies(w, c.id, general.id);
  if (action.type === "commanderRecall") {
    recall(w, c, general);
    return true;
  }
  if (action.type === "commanderDeploy") {
    requireRule(armies.length > 0, "Önce bu komutana tümen ata.");
    requireRule(
      commanderBorders(w, c.id, action.target).length > 0,
      "Yalnızca kara sınırı bulunan bir ülkeye yerleşebilirsin.",
    );
    for (const army of armies) {
      detachPlans(w, army);
      stop(army);
    }
    general.front = {
      target: action.target,
      stance: "defend",
      assignments: {},
    };
    distribute(w, c, general, true, routing(w, c.id));
    event(
      w,
      `${general.name}, ${w.countries[action.target].name} sınırına dağılıyor. Emir: savun.`,
    );
    return true;
  }
  if (action.type === "commanderStance") {
    requireRule(general.front, "Önce komutanı bir ülkenin sınırına yerleştir.");
    requireRule(
      ["defend", "attack"].includes(action.stance),
      "Saldır veya savun emri seç.",
    );
    requireRule(
      action.stance !== "attack" || atWar(w, c.id, general.front.target),
      "Saldırmak için seçilen ülkeyle savaşta olmalısın. Diplomasi panelinden savaş ilan edebilirsin.",
    );
    general.front.stance = action.stance;
    distribute(w, c, general, false, routing(w, c.id));
    return true;
  }
  return false;
}
