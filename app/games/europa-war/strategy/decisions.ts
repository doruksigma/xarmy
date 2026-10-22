import {
  atWar,
  changeRelation,
  clamp,
  controlled,
  event,
  GEOGRAPHY,
  requireRule,
} from "./world";
import type { Action, Country, World } from "./types";

export const DECISIONS = {
  publicWorks: {
    name: "Halka destek programı",
    text: "150 hazine, 25 siyasi güç → +10 istikrar. 90 günde bir.",
    days: 90,
    money: 150,
    political: 25,
  },
  warBonds: {
    name: "Savaş tahvili çıkar",
    text: "Savaşta: 40 siyasi güç, −5 istikrar → +300 hazine. 180 günde bir.",
    days: 180,
    money: 0,
    political: 40,
  },
  relief: {
    name: "Savaş mağdurlarına yardım",
    text: "200 hazine, 20 siyasi güç → −15 savaş yorgunluğu, +4 istikrar. 120 günde bir.",
    days: 120,
    money: 200,
    political: 20,
  },
  propaganda: {
    name: "Savunma kampanyası",
    text: "80 hazine, 30 siyasi güç → +10 savaş desteği. 90 günde bir.",
    days: 90,
    money: 80,
    political: 30,
  },
  crisisTalks: {
    name: "Kriz görüşmeleri",
    text: "50 siyasi güç → hedefle +25 ilişki, dünya gerilimi −3. Savaş sürerken kullanılamaz. 90 günde bir.",
    days: 90,
    money: 0,
    political: 50,
  },
};
export function decisionAction(w: World, c: Country, a: Action): boolean {
  if (a.type !== "decision") return false;
  const d = DECISIONS[a.id as keyof typeof DECISIONS];
  requireRule(
    d && (c.decisions[a.id] ?? 0) <= w.day,
    "Bu karar henüz kullanılamıyor.",
  );
  requireRule(
    c.treasury >= d.money && c.political >= d.political,
    "Karar için yeterli hazine veya siyasi güç yok.",
  );
  requireRule(
    a.id !== "warBonds" || c.wars.length > 0,
    "Savaş tahvili için savaşta olmalısın.",
  );
  if (a.id === "crisisTalks") {
    requireRule(
      a.target &&
        a.target !== c.id &&
        w.countries[a.target] &&
        !atWar(w, c.id, a.target) &&
        !w.countries[a.target].capitulated,
      "Barışta olduğun bir ülke seç.",
    );
    changeRelation(w, c.id, a.target, 25);
    w.tension = clamp(w.tension - 3);
  }
  c.treasury -= d.money;
  c.political -= d.political;
  c.decisions[a.id] = w.day + d.days;
  if (a.id === "publicWorks") c.stability = clamp(c.stability + 10);
  if (a.id === "warBonds") {
    c.stability = clamp(c.stability - 5);
    c.treasury += 300;
  }
  if (a.id === "relief") {
    c.exhaustion = clamp(c.exhaustion - 15);
    c.stability = clamp(c.stability + 4);
  }
  if (a.id === "propaganda") c.warSupport = clamp(c.warSupport + 10);
  event(w, `${c.name}: ${d.name} uygulandı.`, "politics");
  return true;
}
export function nationalFocus(w: World, c: Country, id: string) {
  const lands = controlled(w, c.id),
    capital = w.provinces[c.capital];
  const grantTech = (...ids: string[]) => {
    for (const id of ids) if (!c.tech.includes(id)) c.tech.push(id);
    c.research = c.research.filter((q) => !c.tech.includes(q.id));
  };
  const build = (
    province: string,
    type: keyof typeof capital.buildings,
    count: number,
    max: number,
  ) => {
    const p = w.provinces[province];
    if (p?.controller === c.id)
      p.buildings[type] = Math.min(max, p.buildings[type] + count);
  };
  const port = lands.find((p) => GEOGRAPHY[p.id].port)?.id;
  if (id === "montreux") {
    build("turkey-1", "fort", 2, 5);
    for (const t of ["greece", "bulgaria", "ussr", "romania"])
      changeRelation(w, c.id, t, 15);
  }
  if (id === "etatism") {
    build("turkey-0", "civil", 1, 12);
    build("turkey-2", "civil", 1, 12);
    c.treasury += 150;
  }
  if (id === "karabuk") {
    build("turkey-6", "mine", 2, 5);
    c.stock.steel += 200;
  }
  if (id === "kayseri") {
    build(c.capital, "airfield", 1, 5);
    c.equipment.fighter += 20;
    grantTech("aviation1");
  }
  if (id === "balkanPact")
    for (const t of ["greece", "romania", "yugoslavia"])
      if (!atWar(w, c.id, t) && !w.countries[t].capitulated) {
        changeRelation(w, c.id, t, 35);
        c.pacts[t] = w.day + 365;
        w.countries[t].pacts[c.id] = w.day + 365;
      }
  if (id === "neutrality") {
    c.stability = clamp(c.stability + 15);
    for (const a of w.armies.filter((a) => a.country === c.id))
      a.organization = clamp(a.organization + 20);
    for (const p of lands)
      if (
        GEOGRAPHY[p.id].neighbors.some(
          (n) => w.provinces[n.id].controller !== c.id,
        )
      )
        build(p.id, "fort", 1, 5);
  }
  if (id === "nationalDefense") {
    build(c.capital, "military", 1, 12);
    c.equipment.artillery += 30;
    c.equipment.truck += 30;
  }
  if (["cooperatives", "autobahn"].includes(id)) {
    for (const p of lands) build(p.id, "infra", 1, 5);
    if (id === "autobahn") c.equipment.truck += 50;
    else c.stability = clamp(c.stability + 10);
  }
  if (["panzer", "redArmor"].includes(id)) {
    grantTech("armor1", "landDoctrine");
    c.equipment.lightTank += id === "panzer" ? 45 : 60;
  }
  if (["syntheticProgram", "autarky"].includes(id)) {
    build(c.capital, "synthetic", 2, 5);
    build(
      c.capital,
      id === "autarky" ? "mine" : "refinery",
      id === "autarky" ? 2 : 1,
      5,
    );
  }
  if (id === "submarineProgram") {
    grantTech("naval1", "submarines");
    if (port) build(port, "dock", 2, 8);
    c.equipment.submarine += 2;
  }
  if (id === "maginot")
    for (const p of lands)
      if (
        GEOGRAPHY[p.id].neighbors.some(
          (n) => GEOGRAPHY[n.id].country === "germany",
        )
      )
        build(p.id, "fort", 3, 5);
  if (id === "popularFront") {
    c.stability = clamp(c.stability + 20);
    c.treasury += 150;
  }
  if (id === "airModernization") {
    c.equipment.fighter += 20;
    build(c.capital, "antiAir", 2, 5);
    build(c.capital, "airfield", 1, 5);
  }
  if (id === "chainHome") {
    grantTech("radar");
    for (const p of lands.filter((p) => GEOGRAPHY[p.id].port))
      build(p.id, "radar", 1, 3);
  }
  if (id === "convoyProgram") {
    c.equipment.destroyer += 3;
    if (port) build(port, "dock", 2, 8);
  }
  if (id === "royalAir") {
    c.equipment.fighter += 30;
    c.equipment.bomber += 10;
  }
  if (id === "mareNostrum") {
    for (const p of lands.filter((p) => GEOGRAPHY[p.id].port))
      build(p.id, "dock", 1, 8);
    c.equipment.ship += 2;
  }
  if (id === "alpine") {
    grantTech("special");
    for (const p of lands.filter((p) => GEOGRAPHY[p.id].terrain === "mountain"))
      build(p.id, "fort", 2, 5);
  }
  if (id === "industrialRelocation")
    for (const p of [...lands]
      .sort((a, b) => GEOGRAPHY[b.id].x - GEOGRAPHY[a.id].x)
      .slice(0, 2))
      build(p.id, "military", 2, 12);
  if (id === "deepBattle") {
    grantTech("logistics", "motorization");
    c.equipment.truck += 60;
    for (const g of c.generals) g.skill = Math.min(6, g.skill + 1);
  }
}
