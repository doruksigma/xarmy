import { focusTree, IDEOLOGIES, TECHNOLOGIES } from "./catalog";
import { declareWar } from "./diplomacy";
import {
  addArmy,
  changeRelation,
  clamp,
  controlled,
  dateOf,
  event,
  GEOGRAPHY,
  random,
  requireRule,
  uid,
} from "./world";
import type { Action, Country, Ideology, World } from "./types";

export function researchSlots(c: Country) {
  return (
    1 +
    (c.population >= 20000000 ? 1 : 0) +
    (c.focuses.includes("science") || c.focuses.includes("officers") ? 1 : 0)
  );
}
export function researchDays(w: World, c: Country, id: string) {
  const t = TECHNOLOGIES.find((t) => t.id === id)!;
  return Math.round(
    t.days * (1 + Math.max(0, t.year - dateOf(w.day).getUTCFullYear()) * 0.5),
  );
}
function setIdeology(c: Country, ideology: Ideology) {
  c.ideology = ideology;
  for (const key of Object.keys(c.parties) as Ideology[])
    c.parties[key] = key === ideology ? 60 : 10;
  c.leader = `${IDEOLOGIES[ideology]} hükûmeti`;
}
export function politicsAction(w: World, c: Country, a: Action): boolean {
  if (a.type === "research") {
    const t = TECHNOLOGIES.find((t) => t.id === a.id);
    requireRule(t, "Teknoloji bulunamadı.");
    requireRule(
      !c.tech.includes(t.id) && !c.research.some((r) => r.id === t.id),
      "Bu teknoloji tamamlanmış veya araştırılıyor.",
    );
    requireRule(
      t.requires.every((id) => c.tech.includes(id)),
      "Önce bağlantılı önkoşul teknolojilerini tamamla.",
    );
    requireRule(
      c.research.length < researchSlots(c),
      "Boş araştırma yuvası yok.",
    );
    c.research.push({ id: t.id, progress: 0, total: researchDays(w, c, t.id) });
    return true;
  }
  if (a.type === "focus") {
    const f = focusTree(c.id).find((f) => f.id === a.id);
    requireRule(f, "Odak bulunamadı.");
    requireRule(!c.focus, "Önce etkin ulusal odağı tamamla.");
    requireRule(!c.focuses.includes(f.id), "Bu odak tamamlandı.");
    requireRule(
      f.requires.every((id) => c.focuses.includes(id)),
      "Önce önceki odakları tamamla.",
    );
    requireRule(
      !f.excludes || !c.focuses.includes(f.excludes),
      "Bu siyasi yol diğer tercihin nedeniyle kapandı.",
    );
    c.focus = { id: f.id, progress: 0, total: f.days };
    return true;
  }
  if (a.type === "advisor") {
    requireRule(
      ["industry", "science", "army"].includes(a.advisor),
      "Geçersiz danışman.",
    );
    requireRule(c.advisor !== a.advisor, "Bu danışman zaten görevde.");
    requireRule(c.political >= 40, "40 siyasi güç gerekir.");
    c.political -= 40;
    c.advisor = a.advisor;
    return true;
  }
  if (a.type === "reform") {
    requireRule(IDEOLOGIES[a.ideology], "Geçersiz siyasi yol.");
    requireRule(c.ideology !== a.ideology, "Bu yönetim zaten görevde.");
    requireRule(
      c.political >= 60,
      "Siyasi kampanya için 60 siyasi güç gerekir.",
    );
    c.political -= 60;
    c.stability = clamp(c.stability - 5);
    const target = c.parties[a.ideology] + 15,
      others = 100 - c.parties[a.ideology];
    for (const key of Object.keys(c.parties) as Ideology[])
      if (key !== a.ideology) c.parties[key] *= (100 - target) / others;
    c.parties[a.ideology] = target;
    if (target >= 55) {
      setIdeology(c, a.ideology);
      event(
        w,
        `${c.name}: siyasi reformla ${IDEOLOGIES[a.ideology]} yönetimi kuruldu.`,
        "politics",
      );
    }
    return true;
  }
  if (a.type === "occupation") {
    const p = w.provinces[a.province];
    requireRule(
      p && p.controller === c.id && p.owner !== c.id,
      "İşgal ettiğin bir eyalet seç.",
    );
    requireRule(
      ["civil", "garrison"].includes(a.policy),
      "Geçersiz işgal politikası.",
    );
    p.occupation = a.policy;
    return true;
  }
  return false;
}
export function startCivilWar(w: World, country: string, historical = false) {
  const c = w.countries[country],
    lands = controlled(w, country).filter((p) => p.owner === country);
  if (lands.length < 3 || c.capitulated || w.countries[`${country}-rebels`])
    return;
  const revolt = lands.filter((p, i) => i % 2 === 1);
  if (!revolt.length) return;
  const id = `${country}-rebels`,
    r = structuredClone(c);
  r.id = id;
  r.name = historical ? "İspanya Milliyetçileri" : `${c.name} Muhalefeti`;
  r.color = "#89705a";
  r.capital = revolt.find((p) => p.id === "spain-5")?.id ?? revolt[0].id;
  r.leader = historical ? "Milliyetçi askerî cunta" : "Muhalefet konseyi";
  r.ideology = historical
    ? "fascism"
    : c.ideology === "democracy"
      ? "republic"
      : "democracy";
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
      a.country = id;
      a.general = null;
      a.move = null;
      a.route = [];
    }
  if (!w.armies.some((a) => a.country === id) && r.manpower >= 9000) {
    addArmy(w, id, r.capital);
    r.manpower -= 9000;
  }
  c.stability = Math.max(c.stability, 35);
  c.claims.push(id);
  declareWar(w, id, country);
  event(w, `${c.name} içinde iç savaş başladı.`, "politics");
}
function focusComplete(w: World, c: Country) {
  const f = focusTree(c.id).find((f) => f.id === c.focus!.id)!;
  c.focuses.push(f.id);
  c.focus = null;
  const capital = w.provinces[c.capital];
  if (f.effect === "civil" || f.effect === "military") {
    if (capital.controller === c.id)
      capital.buildings[f.effect] = Math.min(
        12,
        capital.buildings[f.effect] + 2,
      );
  }
  if (f.effect === "science") c.science += 0.15;
  if (f.effect === "army") {
    c.equipment.rifle += 120;
    for (const a of w.armies.filter((a) => a.country === c.id))
      a.organization = clamp(a.organization + 20);
    c.warSupport = clamp(c.warSupport + 8);
  }
  if (f.effect === "stability") {
    c.stability = clamp(c.stability + 15);
    c.political = clamp(c.political + 50, 0, 500);
  }
  if (f.effect === "fuel") {
    c.stock.fuel += 300;
    for (const p of controlled(w, c.id))
      p.buildings.rail = Math.min(5, p.buildings.rail + 1);
  }
  if (f.effect === "diplomacy") {
    const neighbors = new Set(
      controlled(w, c.id).flatMap((p) =>
        GEOGRAPHY[p.id].neighbors.map((n) => w.provinces[n.id].controller),
      ),
    );
    for (const id of neighbors)
      if (id !== c.id) changeRelation(w, c.id, id, 20);
    w.tension = clamp(w.tension - 2);
  }
  if (f.effect in IDEOLOGIES) setIdeology(c, f.effect as Ideology);
  if (c.id === w.player)
    event(w, `${f.name} tamamlandı. ${f.description}`, "politics");
}
function history(w: World) {
  const date = dateOf(w.day).toISOString().slice(0, 10);
  const once = (id: string, on: string, run: () => void) => {
    if (date >= on && !w.firedEvents.includes(id)) {
      w.firedEvents.push(id);
      run();
    }
  };
  once("spanish-election", "1936-05-10", () => {
    const c = w.countries.spain;
    if (c.ideology === "democracy") c.leader = "Manuel Azaña";
  });
  once("ataturk", "1938-11-10", () => {
    const c = w.countries.turkey;
    if (c.leader === "Mustafa Kemal Atatürk") {
      c.leader = "İsmet İnönü";
      event(
        w,
        "Mustafa Kemal Atatürk hayatını kaybetti. Türkiye’de cumhurbaşkanlığı İsmet İnönü’ye geçti.",
        "politics",
      );
    }
  });
  if (w.mode !== "historical") return;
  once("spain-war", "1936-07-18", () => {
    if (w.countries.spain.stability < 70) startCivilWar(w, "spain", true);
    else
      event(
        w,
        "İspanya’da yüksek siyasi istikrar askerî ayaklanmayı önledi.",
        "politics",
      );
  });
  once("austria-pressure", "1938-03-12", () => {
    const g = w.countries.germany;
    if (!g.capitulated) {
      g.claims.push("austria");
      event(
        w,
        "Almanya, Avusturya üzerinde toprak talebi ilan etti. Diplomatik kriz büyüyor.",
        "politics",
      );
      w.tension = clamp(w.tension + 5);
    }
  });
  const wars: [string, string, string][] = [
    ["1939-09-01", "germany", "poland"],
    ["1939-11-30", "ussr", "finland"],
    ["1940-04-09", "germany", "denmark"],
    ["1940-05-10", "germany", "france"],
    ["1941-06-22", "germany", "ussr"],
  ];
  for (const [on, from, to] of wars)
    once(`${from}-${to}`, on, () => {
      const a = w.countries[from],
        b = w.countries[to];
      if (!a.claims.includes(to)) a.claims.push(to);
      if (
        a.id !== w.player &&
        !a.capitulated &&
        !b.capitulated &&
        !a.allies.includes(to) &&
        (a.pacts[to] ?? 0) <= w.day &&
        !a.subjectOf
      )
        declareWar(w, from, to);
      else
        event(
          w,
          `${a.name} için ${b.name} savaş gerekçesi hazır. Tarihsel kriz, mevcut diplomatik durumuna göre ilerliyor.`,
          "politics",
        );
    });
}
export function politicsDay(w: World) {
  for (const c of Object.values(w.countries)) {
    if (c.capitulated) continue;
    for (const q of c.research)
      q.progress += 1 + c.science + (c.advisor === "science" ? 0.15 : 0);
    for (const q of c.research.filter((q) => q.progress >= q.total)) {
      c.tech.push(q.id);
      if (c.id === w.player)
        event(
          w,
          `${TECHNOLOGIES.find((t) => t.id === q.id)!.name} araştırması tamamlandı.`,
        );
    }
    c.research = c.research.filter((q) => q.progress < q.total);
    if (c.focus) {
      c.focus.progress++;
      if (c.focus.progress >= c.focus.total) focusComplete(w, c);
    }
    for (const [target, day] of Object.entries(c.justification))
      if (day <= w.day) {
        if (!c.claims.includes(target)) c.claims.push(target);
        delete c.justification[target];
        if (c.id === w.player)
          event(w, `${w.countries[target].name} savaş gerekçesi hazır.`, "war");
      }
    c.exhaustion = clamp(c.exhaustion + (c.wars.length ? 0.018 : -0.12));
    c.warSupport = clamp(
      c.warSupport + (c.wars.length ? 0.015 : -0.01) - c.exhaustion * 0.0007,
    );
    c.stability = clamp(
      c.stability + (c.wars.length ? -0.005 : 0.01) - c.exhaustion * 0.0003,
    );
    if (w.day % 365 === 0 && c.ideology === "democracy") {
      const winner = (Object.keys(c.parties) as Ideology[]).sort(
        (a, b) => c.parties[b] - c.parties[a],
      )[0];
      if (c.parties[winner] > 50 && winner !== c.ideology)
        setIdeology(c, winner);
      c.stability = clamp(c.stability + 3);
      if (c.id === w.player)
        event(
          w,
          `Seçimler tamamlandı. ${IDEOLOGIES[winner]} partisi %${Math.round(c.parties[winner])} destekle önde.`,
          "politics",
        );
    }
    if (c.stability < 18 && w.day % 30 === 0) startCivilWar(w, c.id);
  }
  for (const p of Object.values(w.provinces))
    if (p.owner !== p.controller) {
      const c = w.countries[p.controller];
      const garrison = p.occupation === "garrison";
      const supported = garrison && c.manpower >= 8 && c.equipment.rifle >= 0.1;
      if (supported) {
        c.manpower -= 8;
        c.equipment.rifle -= 0.1;
      }
      p.resistance = clamp(
        p.resistance + (supported ? -0.35 : 0.13) - p.compliance * 0.002,
      );
      p.compliance = clamp(p.compliance + (garrison ? 0.015 : 0.08));
      if (p.resistance > 45) p.damage = clamp(p.damage + 0.6);
      if (
        p.resistance > 85 &&
        w.day % 14 === 0 &&
        !w.armies.some((a) => a.province === p.id && a.country === p.controller)
      ) {
        p.controller = p.owner;
        p.resistance = 0;
        const owner = w.countries[p.owner];
        owner.capitulated = false;
        owner.victor = null;
        owner.capital = controlled(w, owner.id).some(
          (q) => q.id === owner.capital,
        )
          ? owner.capital
          : p.id;
        if (!owner.wars.includes(c.id)) declareWar(w, owner.id, c.id);
        if (owner.manpower >= 9000) {
          addArmy(w, owner.id, p.id);
          owner.manpower -= 9000;
        }
        event(
          w,
          `${GEOGRAPHY[p.id].name} bölgesinde direniş yönetimi ele geçirdi.`,
          "war",
        );
      }
    }
  history(w);
}
