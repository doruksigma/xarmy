import { openConference } from "./conference";
import {
  atWar,
  changeRelation,
  clamp,
  controlled,
  event,
  militaryPower,
  requireRule,
} from "./world";
import type { Country, World } from "./types";

function enterWar(a: Country, b: Country) {
  a.wars.push(b.id);
  b.wars.push(a.id);
  a.allies = a.allies.filter((id) => id !== b.id);
  b.allies = b.allies.filter((id) => id !== a.id);
  a.access = a.access.filter((id) => id !== b.id);
  b.access = b.access.filter((id) => id !== a.id);
  delete a.pacts[b.id];
  delete b.pacts[a.id];
}

export function declareWar(w: World, from: string, to: string) {
  const a = w.countries[from],
    b = w.countries[to];
  if (a.capitulated || b.capitulated || atWar(w, from, to)) return;
  enterWar(a, b);
  a.warSupport = clamp(a.warSupport + 15);
  b.warSupport = clamp(b.warSupport + 25);
  changeRelation(w, from, to, -100);
  w.tension = clamp(w.tension + 12);
  event(w, `${a.name}, ${b.name} ülkesine savaş ilan etti.`, "war");
  // Defensive alliances are honored, without recursive alliance loops.
  for (const id of b.allies)
    if (id !== from && !w.countries[id].capitulated && !atWar(w, from, id)) {
      enterWar(a, w.countries[id]);
      event(
        w,
        `${w.countries[id].name}, müttefiki ${b.name} yanında savaşa katıldı.`,
        "war",
      );
    }
}
export function peace(w: World, a: string, b: string) {
  const ca = w.countries[a],
    cb = w.countries[b];
  ca.wars = ca.wars.filter((id) => id !== b);
  cb.wars = cb.wars.filter((id) => id !== a);
  for (const p of Object.values(w.provinces))
    if (
      (p.owner === a && p.controller === b) ||
      (p.owner === b && p.controller === a)
    ) {
      p.controller = p.owner;
      p.resistance = 0;
    }
  for (const army of w.armies)
    if (
      (army.country === a && w.provinces[army.province].controller === b) ||
      (army.country === b && w.provinces[army.province].controller === a)
    ) {
      const own = controlled(w, army.country)[0];
      if (own) army.province = own.id;
      army.move = null;
      army.route = [];
    }
  ca.pacts[b] = w.day + 365;
  cb.pacts[a] = w.day + 365;
  ca.exhaustion *= 0.6;
  cb.exhaustion *= 0.6;
  changeRelation(w, a, b, 25);
  event(
    w,
    `${ca.name} ile ${cb.name} arasında ateşkes imzalandı. İşgal edilen topraklar iade edildi.`,
    "war",
  );
}
export function diplomaticAcceptance(w: World, from: string, to: string) {
  const a = w.countries[from],
    b = w.countries[to];
  const sharedThreat = a.wars.some((id) => b.wars.includes(id));
  return (
    (b.relations[from] ?? 0) +
    (a.ideology === b.ideology ? 15 : 0) +
    (sharedThreat ? 30 : 0) +
    (a.subjectOf === to || b.subjectOf === from ? 50 : 0)
  );
}
export function diplomaticAction(
  w: World,
  c: Country,
  target: string,
  kind: string,
) {
  const t = w.countries[target];
  requireRule(t && t !== c, "Başka bir ülke seç.");
  const settlement = ["annex", "puppet", "liberate"].includes(kind);
  if (settlement) {
    if (t.capitulated && t.victor) {
      const conference = openConference(w, t.id);
      requireRule(
        conference.participants.length === 1,
        "Bu savaşın birden fazla galibi var. Barış konferansında katkı puanlarınla bölge talep et.",
      );
      conference.status = "closed";
    }
    if (kind === "liberate")
      requireRule(
        t.subjectOf === c.id || (t.victor === c.id && t.capitulated),
        "Yalnızca sana bağlı veya sana teslim olmuş bir ülkeyi serbest bırakabilirsin.",
      );
    else
      requireRule(
        t.capitulated && t.victor === c.id,
        "Bu koşulu ancak ülke sana teslim olduktan sonra belirleyebilirsin.",
      );
    for (const other of Object.values(w.countries))
      other.wars = other.wars.filter((id) => id !== t.id);
    t.wars = [];
    for (const p of Object.values(w.provinces))
      if (p.owner === t.id) {
        if (kind === "annex") {
          p.owner = c.id;
          p.controller = c.id;
          p.resistance = 30;
        } else {
          p.controller = t.id;
          p.resistance = 0;
        }
      }
    for (const p of Object.values(w.provinces))
      if (p.controller === t.id && p.owner !== t.id) {
        p.controller = p.owner;
        p.resistance = 0;
      }
    for (const army of w.armies) {
      const controller = w.provinces[army.province].controller;
      if (
        (army.country === t.id || w.provinces[army.province].owner === t.id) &&
        controller !== army.country &&
        !w.countries[controller].allies.includes(army.country)
      ) {
        const home = controlled(w, army.country)[0];
        if (home) army.province = home.id;
        army.move = null;
        army.route = [];
      }
    }
    if (kind === "annex") {
      t.subjectOf = null;
      t.capitulated = true;
      t.victor = null;
    } else {
      t.capitulated = false;
      t.subjectOf = kind === "puppet" ? c.id : null;
      t.victor = null;
      t.stability = 50;
      t.manpower = Math.max(t.manpower, 10000);
      t.political = 50;
      if (kind === "puppet") {
        if (!c.allies.includes(t.id)) c.allies.push(t.id);
        if (!t.allies.includes(c.id)) t.allies.push(c.id);
        changeRelation(w, c.id, t.id, 70);
      }
    }
    event(
      w,
      `${t.name}: ${kind === "annex" ? "ilhak koşulları yürürlüğe girdi" : kind === "puppet" ? "bağlı devlet yönetimi kuruldu" : "bağımsızlık tanındı"}.`,
      "politics",
    );
    return;
  }
  requireRule(
    !t.capitulated,
    "Bu ülke teslim olmuş. Barış koşullarını kullan.",
  );
  if (kind === "improve") {
    requireRule(c.political >= 15, "15 siyasi güç gerekir.");
    c.political -= 15;
    changeRelation(w, c.id, t.id, 18);
    return;
  }
  if (kind === "justify") {
    requireRule(!atWar(w, c.id, t.id), "Zaten savaş halindesin.");
    requireRule(
      !c.claims.includes(t.id) && !c.justification[t.id],
      "Bu hedef için gerekçe zaten hazır veya hazırlanıyor.",
    );
    requireRule(c.political >= 40, "40 siyasi güç gerekir.");
    c.political -= 40;
    c.justification[t.id] = w.day + 45;
    w.tension = clamp(w.tension + 2);
    return;
  }
  if (kind === "war") {
    requireRule(!atWar(w, c.id, t.id), "Zaten savaş halindesin.");
    requireRule(
      c.claims.includes(t.id),
      "Önce savaş gerekçesi hazırla (45 gün).",
    );
    requireRule(
      (c.pacts[t.id] ?? 0) <= w.day,
      "Saldırmazlık paktı veya ateşkes henüz bitmedi.",
    );
    requireRule(!c.allies.includes(t.id), "Müttefikine savaş ilan edemezsin.");
    requireRule(!c.subjectOf, "Bağlı devlet bağımsız savaş ilan edemez.");
    declareWar(w, c.id, t.id);
    return;
  }
  if (kind === "peace") {
    requireRule(atWar(w, c.id, t.id), "Bu ülkeyle savaşta değilsin.");
    requireRule(
      t.exhaustion > 25 ||
        militaryPower(w, c.id) > militaryPower(w, t.id) * 1.7 ||
        c.exhaustion > 65,
      "Karşı taraf henüz ateşkesi kabul etmiyor. Yorgunluk veya askerî üstünlük gerekir.",
    );
    peace(w, c.id, t.id);
    return;
  }
  requireRule(!atWar(w, c.id, t.id), "Savaş sürerken bu anlaşma yapılamaz.");
  if (kind === "alliance" || kind === "pact" || kind === "access") {
    requireRule(c.political >= 25, "25 siyasi güç gerekir.");
    requireRule(
      diplomaticAcceptance(w, c.id, t.id) >= (kind === "alliance" ? 55 : 35),
      "Karşı taraf kabul etmiyor. İlişkileri iyileştir veya ortak tehdit oluştur.",
    );
    requireRule(
      !c.wars.some((id) => t.allies.includes(id)) &&
        !t.wars.some((id) => c.allies.includes(id)),
      "Mevcut ittifaklar ve savaşlar bu anlaşmayla çelişiyor.",
    );
    if (kind === "alliance") {
      requireRule(!c.allies.includes(t.id), "İttifak zaten var.");
      c.allies.push(t.id);
      t.allies.push(c.id);
    }
    if (kind === "pact") {
      requireRule((c.pacts[t.id] ?? 0) <= w.day, "Pakt zaten yürürlükte.");
      c.pacts[t.id] = w.day + 365;
      t.pacts[c.id] = w.day + 365;
    }
    if (kind === "access") {
      requireRule(!t.access.includes(c.id), "Geçiş izni zaten var.");
      t.access.push(c.id);
    }
    c.political -= 25;
    event(
      w,
      `${c.name} — ${t.name}: ${kind === "alliance" ? "savunma ittifakı" : kind === "pact" ? "bir yıllık saldırmazlık paktı" : "askerî geçiş izni"} imzalandı.`,
      "politics",
    );
    return;
  }
  if (kind === "embargo") {
    if (c.embargoes.includes(t.id))
      c.embargoes = c.embargoes.filter((id) => id !== t.id);
    else {
      c.embargoes.push(t.id);
      changeRelation(w, c.id, t.id, -20);
    }
    return;
  }
  if (kind === "aid") {
    requireRule(
      c.treasury >= 100 && c.equipment.rifle >= 30,
      "Yardım için 100 hazine ve 30 piyade silahı gerekir.",
    );
    c.treasury -= 100;
    c.equipment.rifle -= 30;
    t.treasury += 100;
    t.equipment.rifle += 30;
    changeRelation(w, c.id, t.id, 20);
    return;
  }
  requireRule(false, "Bilinmeyen diplomatik işlem.");
}
