import { current, isDraft } from "immer";
import { declareWar } from "./diplomacy";
import { detachArmy } from "./planning";
import { hasArmyCapacity } from "./campaign-limits";
import { addArmy, controlled, event } from "./world";
import type { Country, Ideology, World } from "./types";

export function startCivilWar(
  w: World,
  country: string,
  historical = false,
  rebelIdeology?: Ideology,
) {
  const c = w.countries[country],
    lands = controlled(w, country).filter((p) => p.owner === country);
  if (
    lands.length < 3 ||
    c.capitulated ||
    country.endsWith("-rebels") ||
    w.countries[`${country}-rebels`]
  )
    return;
  const revolt = lands.filter((p, i) => i % 2 === 1);
  if (!revolt.length) return;
  const id = `${country}-rebels`,
    r = structuredClone(isDraft(c) ? current(c) : c);
  r.id = id;
  r.name = historical ? "İspanya Milliyetçileri" : `${c.name} Muhalefeti`;
  r.color = "#89705a";
  r.capital = revolt.find((p) => p.id === "spain-5")?.id ?? revolt[0].id;
  r.leader = historical ? "Milliyetçi askerî cunta" : "Muhalefet konseyi";
  r.ideology =
    rebelIdeology ??
    (historical
      ? "fascism"
      : c.ideology === "democracy"
        ? "republic"
        : "democracy");
  r.population = Math.round((c.population * revolt.length) / lands.length);
  c.population -= r.population;
  r.manpower = c.manpower * 0.4;
  c.manpower *= 0.6;
  r.mobilized = c.mobilized * 0.4;
  c.mobilized *= 0.6;
  r.treasury = c.treasury * 0.4;
  c.treasury *= 0.6;
  for (const resource of Object.keys(c.stock) as (keyof Country["stock"])[]) {
    r.stock[resource] *= 0.4;
    c.stock[resource] *= 0.6;
  }
  for (const e of Object.keys(c.equipment) as (keyof Country["equipment"])[]) {
    r.equipment[e] *= 0.4;
    c.equipment[e] *= 0.6;
  }
  // Partial equipment is material-backed value too: cloning a production
  // line must not duplicate the resources already invested in it.
  for (let i = 0; i < c.production.length; i++) {
    const progress = c.production[i].progress;
    if (progress === undefined) continue;
    r.production[i].progress = progress * 0.4;
    c.production[i].progress = progress * 0.6;
  }
  r.wars = [];
  r.allies = [];
  r.access = [];
  r.justification = {};
  r.pacts = {};
  r.claims = [country];
  r.subjectOf = null;
  r.research = [];
  r.focus = null;
  r.focuses = [];
  r.construction = [];
  r.recruitment = [];
  r.missions = [];
  r.history = [];
  r.automation = {
    economy: false,
    research: false,
    recruitment: false,
    operations: false,
  };
  // The new country's AI must choose its own fronts. Cloning the loyalist
  // commander's foreign assignment would override rebel orders every day.
  r.autoAssignCommanders = false;
  for (const general of r.generals) delete general.front;
  r.air.wings = [];
  r.navy.ships = [];
  for (const wing of [...c.air.wings])
    if (revolt.some((p) => p.id === wing.base)) {
      r.air.wings.push(wing);
      c.air.wings = c.air.wings.filter((a) => a !== wing);
    }
  for (const ship of [...c.navy.ships])
    if (revolt.some((p) => p.id === ship.port)) {
      r.navy.ships.push(ship);
      c.navy.ships = c.navy.ships.filter((a) => a !== ship);
    }
  r.air.target = id;
  r.air.mission = "idle";
  r.navy.target = id;
  r.navy.mission = "idle";

  r.stability = 50;
  r.warSupport = 70;
  r.parties = {
    democracy: 8,
    republic: 8,
    monarchy: 8,
    fascism: 8,
    communism: 8,
  };
  r.parties[r.ideology] = 68;
  w.countries[id] = r;
  for (const other of Object.values(w.countries))
    if (other.id !== id) {
      other.relations[id] = -10;
      r.relations[other.id] = -10;
    }
  for (const p of revolt) {
    p.owner = id;
    p.controller = id;
    p.resistance = 0;
  }
  for (const a of w.armies)
    if (a.country === country && revolt.some((p) => p.id === a.province)) {
      // A formation changing sides must stop obeying its former government's
      // front and offensive orders, including before the next daily cleanup.
      detachArmy(w, a.id);
      a.country = id;
      a.general = null;
      a.move = null;
      a.route = [];
    }
  w.fronts = w.fronts.filter((f) => f.armies.length > 0);
  w.plans = w.plans.filter((p) => p.armies.length > 0);
  if (
    !w.armies.some((a) => a.country === id) &&
    r.manpower >= 9000 &&
    hasArmyCapacity(w)
  ) {
    addArmy(w, id, r.capital);
    r.manpower -= 9000;
  }
  c.stability = Math.max(c.stability, 35);
  c.claims.push(id);
  declareWar(w, id, country);
  event(w, `${c.name} içinde iç savaş başladı.`, "politics");
}
