import { clamp, controlled, event, GEOGRAPHY, requireRule, uid } from "./world";
import type { Action, Country, PeaceConference, World } from "./types";

export function addWarScore(
  w: World,
  country: string,
  enemy: string,
  amount: number,
) {
  w.warScore[country] ??= {};
  w.warScore[country][enemy] = Math.min(
    1e7,
    (w.warScore[country][enemy] ?? 0) + amount,
  );
}
export function provincePrice(id: string) {
  const g = GEOGRAPHY[id];
  return 10 + g.vp * 2 + g.civil * 3 + g.military * 3 + g.dock * 2;
}
export function openConference(w: World, defeated: string) {
  const old = w.conferences.find(
    (q) => q.defeated === defeated && q.status === "open",
  );
  if (old) return old;
  const loser = w.countries[defeated];
  requireRule(loser.capitulated && loser.victor, "Ülke henüz teslim olmadı.");
  const provinces = Object.values(w.provinces).filter(
    (p) => p.owner === defeated,
  );
  const participants = loser.wars.filter(
    (id) =>
      !w.countries[id].capitulated &&
      (id === loser.victor ||
        (w.warScore[id]?.[defeated] ?? 0) > 0 ||
        provinces.some((p) => p.controller === id)),
  );
  if (!participants.includes(loser.victor)) participants.push(loser.victor);
  const contribution = (id: string) =>
    1 +
    (w.warScore[id]?.[defeated] ?? 0) +
    provinces
      .filter((p) => p.controller === id)
      .reduce((n, p) => n + GEOGRAPHY[p.id].vp, 0);
  participants.sort((a, b) => contribution(b) - contribution(a));
  const total = participants.reduce((n, id) => n + contribution(id), 0),
    budget = provinces.reduce((n, p) => n + provincePrice(p.id), 0);
  const conference: PeaceConference = {
    id: uid(w, "peace"),
    defeated,
    participants,
    points: Object.fromEntries(
      participants.map((id) => [
        id,
        Math.ceil((budget * contribution(id)) / total),
      ]),
    ),
    available: provinces.map((p) => p.id),
    awards: [],
    round: 1,
    turn: 0,
    status: "open",
  };
  w.conferences.push(conference);
  event(
    w,
    `${loser.name} barış konferansı açıldı. ${participants.map((id) => w.countries[id].name).join(", ")} savaş katkılarıyla söz sahibi.`,
    "politics",
  );
  return conference;
}
function advanceTurn(q: PeaceConference) {
  q.turn = (q.turn + 1) % q.participants.length;
  if (q.turn === 0) q.round++;
}
function settle(w: World, q: PeaceConference) {
  const loser = w.countries[q.defeated];
  const affected = new Set([
    ...q.available,
    ...q.awards.map((a) => a.province),
  ]);
  for (const p of Object.values(w.provinces))
    if (p.controller === loser.id && p.owner !== loser.id) {
      p.controller = p.owner;
      p.resistance = 0;
      affected.add(p.id);
    }
  for (const a of q.awards) {
    const p = w.provinces[a.province];
    p.owner = a.kind === "annex" ? a.country : loser.id;
    p.controller = p.owner;
    p.resistance = a.kind === "annex" ? 20 : 0;
    p.compliance = 0;
  }
  // Unclaimed regions remain independent; passing never silently gives away territory.
  for (const id of q.available) {
    w.provinces[id].controller = loser.id;
    w.provinces[id].resistance = 0;
  }
  for (const c of Object.values(w.countries)) {
    if (c.wars.includes(loser.id)) {
      c.pacts[loser.id] = w.day + 365;
      loser.pacts[c.id] = w.day + 365;
    }
    c.wars = c.wars.filter((id) => id !== loser.id);
    if (c.air.target === loser.id) c.air.mission = "idle";
  }
  loser.wars = [];
  loser.victor = null;
  const remaining = controlled(w, loser.id);
  loser.capitulated = remaining.length === 0;
  if (remaining.length) {
    loser.capital = remaining.some((p) => p.id === loser.capital)
      ? loser.capital
      : remaining.sort((a, b) => GEOGRAPHY[b.id].vp - GEOGRAPHY[a.id].vp)[0].id;
    const puppet = q.awards
      .filter((a) => a.kind === "puppet")
      .sort((a, b) => b.cost - a.cost)[0];
    loser.subjectOf = puppet?.country ?? null;
    if (puppet) {
      const master = w.countries[puppet.country];
      if (!master.allies.includes(loser.id)) master.allies.push(loser.id);
      if (!loser.allies.includes(master.id)) loser.allies.push(master.id);
    }
    loser.stability = 50;
    loser.political = Math.max(30, loser.political);
  } else loser.subjectOf = null;
  for (const a of w.armies) {
    if (!affected.has(a.province)) continue;
    const controller = w.provinces[a.province].controller;
    if (
      controller !== a.country &&
      !w.countries[controller].allies.includes(a.country)
    ) {
      const home = controlled(w, a.country)[0];
      if (home) a.province = home.id;
      a.move = null;
      a.route = [];
    }
  }
  q.status = "closed";
  w.tension = clamp(w.tension - 5);
  event(
    w,
    `${loser.name} barış antlaşması yürürlüğe girdi. ${q.awards.length} bölge karara bağlandı.`,
    "politics",
  );
}
function claim(
  w: World,
  q: PeaceConference,
  c: Country,
  province: string,
  kind: "annex" | "puppet" | "liberate",
) {
  requireRule(
    q.status === "open" && q.participants[q.turn] === c.id,
    "Konferansta henüz sıra sende değil.",
  );
  requireRule(
    q.available.includes(province),
    "Bu bölge konferansta kullanılabilir değil.",
  );
  requireRule(
    ["annex", "puppet", "liberate"].includes(kind),
    "Geçersiz barış koşulu.",
  );
  const cost = provincePrice(province);
  requireRule(
    q.points[c.id] >= cost,
    `Bu bölge için ${cost} konferans puanı gerekir. Daha küçük bir bölge seç veya pas geç.`,
  );
  const existing = q.awards.find((a) => a.kind === "puppet");
  requireRule(
    kind !== "puppet" || !existing || existing.country === c.id,
    "Bu devlet için başka bir ülkenin bağlı yönetimi kararlaştırıldı.",
  );
  requireRule(
    !(kind === "puppet" && q.awards.some((a) => a.kind === "liberate")) &&
      !(kind === "liberate" && existing),
    "Bağımsızlık ve bağlı yönetim aynı devlette birleştirilemez.",
  );
  q.points[c.id] -= cost;
  q.awards.push({ province, country: c.id, kind, cost });
  q.available = q.available.filter((id) => id !== province);
  advanceTurn(q);
  if (!q.available.length) settle(w, q);
}
function pass(w: World, q: PeaceConference) {
  // A limited negotiation budget is renewed each round, weighted by initial war contribution.
  const id = q.participants[q.turn],
    contribution = 1 + (w.warScore[id]?.[q.defeated] ?? 0);
  const total = q.participants.reduce(
    (n, p) => n + 1 + (w.warScore[p]?.[q.defeated] ?? 0),
    0,
  );
  const budget = [...q.available, ...q.awards.map((a) => a.province)].reduce(
    (n, p) => n + provincePrice(p),
    0,
  );
  q.points[id] += Math.max(
    10,
    Math.ceil((budget * 0.2 * contribution) / total),
  );
  advanceTurn(q);
  if (q.round > 25) settle(w, q);
}
export function conferenceAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "peaceClaim" || a.type === "peacePass") {
    const q = w.conferences.find(
      (q) => q.id === a.conference && q.status === "open",
    );
    requireRule(
      q && q.participants[q.turn] === c.id,
      "Açık konferans ve sana ait müzakere sırası gerekir.",
    );
    if (a.type === "peaceClaim") claim(w, q, c, a.province, a.kind);
    else pass(w, q);
    return true;
  }
  if (a.type === "release") {
    const t = w.countries[a.country];
    requireRule(
      t && t !== c && !t.wars.length,
      "Barışta olan başka bir ülke seç.",
    );
    const core = Object.values(w.provinces).filter(
      (p) =>
        GEOGRAPHY[p.id].country === t.id &&
        p.owner === c.id &&
        p.controller === c.id,
    );
    requireRule(
      core.length > 0,
      "Bu ülkenin kontrolünde olan tarihsel toprakları yok.",
    );
    requireRule(
      !w.conferences.some((q) => q.status === "open" && q.defeated === t.id),
      "Önce açık barış konferansını tamamla.",
    );
    for (const p of core) {
      p.owner = t.id;
      p.controller = t.id;
      p.resistance = 0;
      p.compliance = 0;
    }
    t.capitulated = false;
    t.victor = null;
    t.subjectOf = null;
    t.capital = core.some((p) => p.id === t.capital) ? t.capital : core[0].id;
    t.stability = 55;
    t.pacts[c.id] = w.day + 365;
    c.pacts[t.id] = w.day + 365;
    for (const army of w.armies.filter(
      (x) => x.country === c.id && core.some((p) => p.id === x.province),
    )) {
      const home = controlled(w, c.id)[0];
      if (home) army.province = home.id;
      army.move = null;
      army.route = [];
    }
    event(
      w,
      `${c.name}, ${t.name} ülkesinin bağımsızlığını yeniden tanıdı.`,
      "politics",
    );
    return true;
  }
  return false;
}
export function conferencesDay(w: World) {
  for (const q of w.conferences.filter((q) => q.status === "open")) {
    // At most one full AI round per day; never take the human's negotiation turn.
    for (let i = 0; i < q.participants.length && q.status === "open"; i++) {
      const c = w.countries[q.participants[q.turn]];
      if (c.id === w.player) break;
      const choices = q.available
        .filter((id) => provincePrice(id) <= q.points[c.id])
        .sort((a, b) => GEOGRAPHY[b].vp - GEOGRAPHY[a].vp);
      if (!choices.length) {
        pass(w, q);
        continue;
      }
      const puppet = q.awards.find((a) => a.kind === "puppet"),
        liberation = q.awards.some((a) => a.kind === "liberate");
      const kind =
        c.ideology === "democracy" && !puppet
          ? "liberate"
          : c.ideology === "communism" &&
              !liberation &&
              (!puppet || puppet.country === c.id)
            ? "puppet"
            : "annex";
      claim(w, q, c, choices[0], kind);
    }
  }
  if (w.conferences.length > 80)
    w.conferences = w.conferences
      .filter((q) => q.status === "open")
      .concat(w.conferences.filter((q) => q.status === "closed").slice(-40));
}
