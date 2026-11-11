import {
  applyNationalProgramme,
  nationalProgrammeProblem,
} from "./national-event-effects";
import {
  historicalEvent,
  historicalFocusId,
  type HistoricalEventDefinition,
} from "./historical-catalog";
import {
  atWar,
  changeRelation,
  clamp,
  controlled,
  dateOf,
  event,
  friendly,
  militaryPower,
  requireRule,
} from "./world";
import { declareWar } from "./diplomacy";
import { detachArmy } from "./planning";
import type { Action, Country, Equipment, World } from "./types";
import type { HistoricalDecision } from "./historical-types";

export { HISTORICAL_EVENTS } from "./historical-catalog";
export type {
  HistoricalDecision,
  HistoricalResolution,
  HistoricalState,
} from "./historical-types";

export function pendingHistoricalDecision(w: World, country = w.player) {
  if (w.countries[country]?.capitulated) return undefined;
  return w.historical?.pending.find(
    (decision) => decision.recipient === country,
  );
}
const state = (w: World) => (w.historical ??= { pending: [], resolved: [] });
const definitionForFocus = (id: string) =>
  id.startsWith("history-") ? historicalEvent(id.slice(8)) : undefined;
export function historicalEventHandled(w: World, eventId: string) {
  return (
    !!w.historical?.pending.some((item) => item.eventId === eventId) ||
    !!w.historical?.resolved.some((item) => item.eventId === eventId) ||
    Object.values(w.countries).some(
      (country) => country.focus?.id === historicalFocusId(eventId),
    )
  );
}
function currentConditions(
  w: World,
  definition: HistoricalEventDefinition,
): string | null {
  const c = w.countries[definition.country],
    t = definition.target ? w.countries[definition.target] : undefined;
  if (!c || c.capitulated || (c.subjectOf && definition.kind !== "domestic"))
    return "Girişimi bağımsız ve teslim olmamış bir ülke yönetmeli.";
  if (w.provinces[c.capital]?.controller !== c.id)
    return "Önce başkentinin kontrolünü geri almalısın.";
  for (const excluded of definition.excludes ?? []) {
    if (
      w.historical?.resolved.some(
        (item) => item.eventId === excluded && item.outcome === "accepted",
      ) ||
      w.historical?.pending.some((item) => item.eventId === excluded) ||
      c.focus?.id === historicalFocusId(excluded)
    )
      return "Bu yol daha önce seçtiğin veya hazırladığın siyasi seçenekle bağdaşmıyor.";
  }
  for (const required of definition.requires) {
    if (
      required.startsWith("history-") &&
      !w.historical?.resolved.some(
        (item) =>
          item.eventId === required.slice(8) && item.outcome === "accepted",
      )
    )
      return "Önceki tarihî girişimi kabul ederek tamamlamalısın.";
    if (!required.startsWith("history-") && !c.focuses.includes(required))
      return "Önce bağlantılı ulusal odağı tamamlamalısın.";
  }
  if (definition.kind === "domestic") {
    if (!definition.domestic)
      return "Bu ulusal programın uygulama tanımı eksik.";
    return nationalProgrammeProblem(w, c, definition.domestic);
  }

  if (definition.target && (!t || t.capitulated))
    return "Hedef ülke bağımsız yönetimiyle sahada olmalı; teslim olmuş ülkeye bu olay uygulanamaz.";
  if (t && atWar(w, c.id, t.id))
    return "İki ülke savaş halindeyken bu diplomatik karar uygulanamaz.";
  if (t && t.subjectOf)
    return "Hedef başka bir devlete bağlı; bu diplomatik girişim kullanılamaz.";
  if (t && definition.kind === "war") {
    if (c.allies.includes(t.id))
      return "Müttefikine bu kararla savaş ilan edemezsin.";
    if ((c.pacts[t.id] ?? 0) > w.day || (t.pacts[c.id] ?? 0) > w.day)
      return "Saldırmazlık paktı veya ateşkes bitmeden harekât başlatılamaz.";
  }
  if (t && ["annex", "territory"].includes(definition.kind)) {
    if (c.wars.length || t.wars.length)
      return "Toprak devri için her iki ülke de barışta olmalı.";
    if (
      w.conferences.some(
        (q) =>
          q.status === "open" &&
          (q.defeated === c.id ||
            q.defeated === t.id ||
            q.participants.includes(c.id) ||
            q.participants.includes(t.id)),
      )
    )
      return "Önce açık barış konferansını tamamla.";
    const lands = Object.values(w.provinces).filter((p) => p.owner === t.id);
    if (
      !lands.length ||
      lands.some((p) => p.controller !== t.id) ||
      controlled(w, t.id).some((p) => p.owner !== t.id)
    )
      return "Hedef ülkenin toprakları işgal altında; barışçıl devir uygulanamaz.";
  }
  if (
    definition.id === "munich" &&
    (w.provinces["czechoslovakia-city-1"]?.owner !== "czechoslovakia" ||
      w.provinces["czechoslovakia-city-1"]?.controller !== "czechoslovakia")
  )
    return "Liberec artık Çekoslovakya yönetiminde değil.";
  if (
    t &&
    ["pact", "alliance", "conference"].includes(definition.kind) &&
    (c.wars.some((id) => t.allies.includes(id)) ||
      t.wars.some((id) => c.allies.includes(id)))
  )
    return "Mevcut savaşlar ve ittifaklar bu anlaşmayla çelişiyor.";
  if (definition.id === "lend-lease") {
    if (c.equipment.rifle < 100 || c.equipment.truck < 20)
      return "Yardım için mevcut depoda 100 tüfek ve 20 kamyon gerekir.";
    if (t && (t.equipment.rifle > 1e9 - 100 || t.equipment.truck > 1e9 - 20))
      return "Alıcı ülkenin ekipman deposunda yer yok.";
    if (c.embargoes.includes(t!.id) || t!.embargoes.includes(c.id))
      return "Ambargo yürürlükteyken yardım gönderilemez.";
  }
  if (t && definition.kind === "annex") {
    if (
      c.population + t.population > 1e9 ||
      c.manpower + t.manpower > 1e9 ||
      c.mobilized + t.mobilized > 1e9 ||
      c.treasury + t.treasury > 1e9
    )
      return "Birleşme mevcut nüfus veya hazine kapasitesini aşar.";
    if (
      Object.keys(c.equipment).some(
        (key) =>
          c.equipment[key as Equipment] + t.equipment[key as Equipment] > 1e9,
      ) ||
      Object.keys(c.stock).some(
        (key) =>
          c.stock[key as keyof typeof c.stock] +
            t.stock[key as keyof typeof c.stock] >
          1e9,
      )
    )
      return "Birleşme mevcut depo kapasitesini aşar.";
    if (
      c.air.wings.length + t.air.wings.length > 40 ||
      c.navy.ships.length + t.navy.ships.length > 120
    )
      return "Birleşme hava kanadı veya donanma yönetim kapasitesini aşar.";
  }
  return null;
}
/** Extra event conditions. Generic focus prerequisites/cost are enforced by politicsAction. */
export function historicalFocusAvailability(
  w: World,
  c: Country,
  eventId: string,
): string | null {
  const definition = historicalEvent(eventId);
  if (!definition || c.id !== definition.country)
    return "Bu tarihî odak bu ülkeye ait değil.";
  if (
    w.historical?.resolved.some((item) => item.eventId === eventId) ||
    w.historical?.pending.some((item) => item.eventId === eventId)
  )
    return "Bu olay zaten hazırlandı veya karara bağlandı.";
  if (
    w.mode === "historical" &&
    dateOf(w.day).toISOString().slice(0, 10) < definition.date
  )
    return `Tarihsel modda ${definition.date} tarihinden itibaren hazırlanabilir.`;
  return currentConditions(w, definition);
}
export function historicalDecisionView(w: World, decision: HistoricalDecision) {
  const definition = historicalEvent(decision.eventId)!;
  const respondent = decision.stage === "respond";
  const annex = definition.kind === "annex",
    territorial = definition.kind === "territory";
  return {
    title: definition.title,
    description: respondent
      ? `${w.countries[decision.initiator].name}, ${definition.title} kapsamında bir teklif gönderdi. ${annex ? "Kabul edersen ülkenin toprakları ve silahlı kuvvetleri teklif eden ülkeye katılacak; bağımsız yönetimin sona erecek." : territorial ? "Kabul edersen Liberec bölgesi Almanya'ya devredilecek; diğer toprakların sende kalacak." : definition.effectText} Karar senin.`
      : definition.description,
    acceptLabel: respondent
      ? annex
        ? "Katılmayı kabul et"
        : territorial
          ? "Liberec'in devrini kabul et"
          : "Anlaşmayı kabul et"
      : definition.acceptLabel,
    declineLabel: respondent
      ? annex || territorial
        ? "Hayır, egemenliğimizi koru"
        : "Teklifi reddet"
      : definition.declineLabel,
    effectText: definition.effectText,
    declineText: respondent
      ? "Teklif reddedilir; ilişki 20 azalır. Otomatik savaş veya toprak kaybı olmaz."
      : definition.declineText,
    blockedReason: currentConditions(w, definition),
  };
}
function finish(
  w: World,
  decision: HistoricalDecision,
  outcome: "accepted" | "declined" | "unavailable",
  by: string,
) {
  const s = state(w);
  s.pending = s.pending.filter((item) => item.id !== decision.id);
  if (!s.resolved.some((item) => item.eventId === decision.eventId))
    s.resolved.push({ eventId: decision.eventId, day: w.day, outcome, by });
}
/** Diplomatic unification only. Prerequisites exclude wars/occupation/conferences.
 * Preserve unit IDs and all paid shipment ledgers; old-country cargo is settled
 * by the logistics resolver as loss after government dissolution. */
function annex(w: World, c: Country, target: Country) {
  const territory = new Set(controlled(w, target.id).map((p) => p.id));
  for (const id of territory) {
    const p = w.provinces[id];
    p.owner = c.id;
    p.controller = c.id;
    p.resistance = 0;
    p.compliance = 100;
  }
  for (const army of w.armies.filter((a) => a.country === target.id)) {
    detachArmy(w, army.id);
    army.country = c.id;
    army.general = null;
    army.move = null;
    army.route = [];
    army.stance = "hold";
    delete army.marchGroup;
    if (!territory.has(army.province)) army.province = c.capital;
  }
  for (const army of w.armies) {
    if (territory.has(army.province) && !friendly(w, army.country, c.id)) {
      const home = controlled(w, army.country)[0];
      if (home) army.province = home.id;
      army.move = null;
      army.route = [];
    }
  }
  for (const general of target.generals) delete general.front;
  w.fronts = w.fronts.filter(
    (front) => front.country !== target.id && front.armies.length >= 1,
  );
  w.plans = w.plans.filter(
    (plan) => plan.country !== target.id && plan.armies.length >= 1,
  );
  w.battles = w.battles.filter(
    (battle) => battle.attacker !== target.id && battle.defender !== target.id,
  );
  w.trades = w.trades.filter(
    (trade) => trade.from !== target.id && trade.to !== target.id,
  );
  for (const other of Object.values(w.countries)) {
    other.wars = other.wars.filter((id) => id !== target.id);
    other.allies = other.allies.filter((id) => id !== target.id);
    other.access = other.access.filter((id) => id !== target.id);
    if (other.subjectOf === target.id) other.subjectOf = c.id;
  }
  c.population += target.population;
  c.manpower += target.manpower;
  c.mobilized += target.mobilized;
  c.treasury += target.treasury;
  target.population = 0;
  target.manpower = 0;
  target.mobilized = 0;
  target.treasury = 0;
  for (const key of Object.keys(c.equipment) as Equipment[]) {
    c.equipment[key] += target.equipment[key];
    target.equipment[key] = 0;
  }
  for (const key of Object.keys(c.stock) as (keyof typeof c.stock)[]) {
    c.stock[key] += target.stock[key];
    target.stock[key] = 0;
  }
  for (const wing of target.air.wings) {
    wing.mission = "idle";
    c.air.wings.push(wing);
  }
  for (const ship of target.navy.ships) {
    ship.mission = "idle";
    c.navy.ships.push(ship);
  }
  target.air.wings = [];
  target.navy.ships = [];
  target.air.mission = "idle";
  target.navy.mission = "idle";
  target.capitulated = true;
  target.victor = null;
  target.subjectOf = null;
  target.wars = [];
  target.allies = [];
  target.access = [];
  target.focus = null;
  target.research = [];
  target.recruitment = [];
  target.construction = [];
  target.production = [];
  target.missions = [];
  w.tension = clamp(w.tension + 10);
}
function effect(w: World, definition: HistoricalEventDefinition) {
  const c = w.countries[definition.country],
    t = definition.target ? w.countries[definition.target] : undefined;
  if (definition.kind === "domestic") {
    applyNationalProgramme(w, c, definition.domestic!);
    return;
  }
  if (definition.kind === "annex") annex(w, c, t!);
  if (definition.kind === "territory") {
    const p = w.provinces["czechoslovakia-city-1"];
    p.owner = c.id;
    p.controller = c.id;
    p.resistance = 10;
    p.compliance = 0;
    for (const army of w.armies.filter(
      (a) => a.province === p.id && a.country !== c.id,
    )) {
      army.province = w.countries[army.country].capital;
      army.move = null;
      army.route = [];
    }
    w.tension = clamp(w.tension + 6);
  }
  if (definition.kind === "war") {
    if (!c.claims.includes(t!.id)) c.claims.push(t!.id);
    declareWar(w, c.id, t!.id);
  }
  if (definition.kind === "pact") {
    c.pacts[t!.id] = Math.max(c.pacts[t!.id] ?? 0, w.day + 730);
    t!.pacts[c.id] = Math.max(t!.pacts[c.id] ?? 0, w.day + 730);
    changeRelation(w, c.id, t!.id, 20);
  }
  if (definition.kind === "alliance") {
    if (!c.allies.includes(t!.id)) c.allies.push(t!.id);
    if (!t!.allies.includes(c.id)) t!.allies.push(c.id);
    changeRelation(w, c.id, t!.id, 25);
  }
  if (definition.kind === "conference") {
    for (const country of [c, t!]) {
      country.stability = clamp(country.stability + 8);
      country.exhaustion = clamp(country.exhaustion - 10);
    }
    changeRelation(w, c.id, t!.id, 25);
    if (definition.id === "yalta") w.tension = clamp(w.tension - 5);
  }
  if (definition.id === "rhineland") {
    for (const id of ["germany-2", "germany-city-21"]) {
      const p = w.provinces[id];
      if (p.controller === c.id)
        p.buildings.fort = Math.min(5, p.buildings.fort + 1);
    }
    c.warSupport = clamp(c.warSupport + 8);
    w.tension = clamp(w.tension + 5);
  }
  if (definition.id === "montreux-treaty") {
    for (const id of ["turkey-1", "turkey-city-2"]) {
      const p = w.provinces[id];
      if (p.controller === c.id)
        p.buildings.fort = Math.min(5, p.buildings.fort + 1);
    }
    for (const id of ["ussr", "uk", "france"]) changeRelation(w, c.id, id, 15);
    w.tension = clamp(w.tension - 3);
  }
  if (definition.id === "atlantic-charter") {
    c.stability = clamp(c.stability + 5);
    t!.stability = clamp(t!.stability + 5);
  }
  if (definition.id === "lend-lease") {
    c.equipment.rifle -= 100;
    c.equipment.truck -= 20;
    t!.equipment.rifle += 100;
    t!.equipment.truck += 20;
    changeRelation(w, c.id, t!.id, 25);
  }
}
function aiAccepts(w: World, decision: HistoricalDecision) {
  const definition = historicalEvent(decision.eventId)!;
  if (currentConditions(w, definition)) return false;
  if (decision.stage === "initiate")
    return (
      w.mode === "historical" ||
      definition.kind !== "war" ||
      militaryPower(w, decision.initiator) >
        militaryPower(w, definition.target!) * 1.2
    );
  const from = w.countries[decision.initiator],
    recipient = w.countries[decision.recipient];
  if (definition.kind === "annex" || definition.kind === "territory")
    return (
      militaryPower(w, from.id) >= militaryPower(w, recipient.id) * 1.25 &&
      recipient.stability < 85
    );
  return (recipient.relations[from.id] ?? 0) > -50;
}
function choose(w: World, decision: HistoricalDecision, accept: boolean) {
  const definition = historicalEvent(decision.eventId)!;
  if (!accept) {
    if (decision.stage === "respond")
      changeRelation(w, decision.initiator, decision.recipient, -20);
    finish(w, decision, "declined", decision.recipient);
    event(
      w,
      `${definition.title}: ${w.countries[decision.recipient].name} girişimi reddetti.`,
      "politics",
    );
    return;
  }
  requireRule(
    !currentConditions(w, definition),
    currentConditions(w, definition) ?? "Bu tarihî karar artık uygulanamaz.",
  );
  if (
    decision.stage === "initiate" &&
    definition.target &&
    !["war", "aid"].includes(definition.kind)
  ) {
    decision.stage = "respond";
    decision.recipient = definition.target;
    decision.createdDay = w.day;
    event(
      w,
      `${definition.title}: ${w.countries[decision.initiator].name} teklifi ${w.countries[decision.recipient].name} yönetimine gönderdi.`,
      "politics",
    );
    return;
  }
  effect(w, definition);
  finish(w, decision, "accepted", decision.recipient);
  event(
    w,
    `${definition.title}: karar yürürlüğe girdi. ${definition.effectText}`,
    "politics",
  );
}
export function resolveHistoricalAI(w: World) {
  // A proposal needs at most an initiator and a recipient choice. Human choices
  // remain pending even when pure simulation APIs are advanced without a UI.
  for (let pass = 0; pass < 2; pass++)
    for (const decision of [...(w.historical?.pending ?? [])]) {
      if (
        w.countries[decision.recipient]?.capitulated ||
        w.countries[decision.initiator]?.capitulated
      ) {
        finish(w, decision, "unavailable", decision.recipient);
        continue;
      }
      if (decision.recipient === w.player) continue;
      if (!w.historical?.pending.some((item) => item.id === decision.id))
        continue;
      if (currentConditions(w, historicalEvent(decision.eventId)!)) {
        finish(w, decision, "unavailable", decision.recipient);
        continue;
      }
      choose(w, decision, aiAccepts(w, decision));
    }
}
export function historicalAction(w: World, c: Country, a: Action): boolean {
  if (a.type !== "historicalChoice") return false;
  const decision = w.historical?.pending.find(
    (item) => item.id === a.id && item.recipient === c.id,
  );
  requireRule(
    decision,
    "Bu ülkeye ait bekleyen tarihî karar bulunamadı veya karar zaten uygulandı.",
  );
  choose(w, decision, a.choice === "accept");
  resolveHistoricalAI(w);
  return true;
}
export function completeHistoricalFocus(
  w: World,
  c: Country,
  id: string,
): boolean {
  const definition = definitionForFocus(id);
  if (!definition) return false;
  if (c.id !== definition.country) return true;
  if (
    w.historical?.pending.some((p) => p.eventId === definition.id) ||
    w.historical?.resolved.some((r) => r.eventId === definition.id)
  )
    return true;
  state(w).pending.push({
    id: historicalFocusId(definition.id),
    eventId: definition.id,
    initiator: c.id,
    recipient: c.id,
    stage: "initiate",
    createdDay: w.day,
  });
  event(
    w,
    `${definition.title}: hazırlık tamamlandı, karar bekleniyor.`,
    "politics",
  );
  resolveHistoricalAI(w);
  return true;
}
