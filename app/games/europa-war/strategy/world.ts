import data from "./map-data.json";
import { initializeAssets, seaEdgeOpen, shipPower } from "./military-assets";
import { UNITS } from "./catalog";
import type { Army, Country, GameEvent, Terrain, World } from "./types";

export const MAP = data;
export const GEOGRAPHY = Object.fromEntries(
  data.provinces.map((p) => [p.id, { ...p, terrain: p.terrain as Terrain }]),
);
export const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));
export function requireRule(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(reason);
}
export function uid(w: World, prefix: string) {
  return `${prefix}-${++w.serial}`;
}
export function random(w: World) {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0;
  return w.seed / 4294967296;
}
export function dateOf(day: number) {
  return new Date(Date.UTC(1936, 0, 1 + day));
}
export function dateLabel(day: number) {
  return dateOf(day).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function event(
  w: World,
  text: string,
  kind: GameEvent["kind"] = "info",
) {
  w.events.unshift({ day: w.day, text, kind });
  w.events.length = Math.min(80, w.events.length);
}
export function controlled(w: World, c: string) {
  return Object.values(w.provinces).filter((p) => p.controller === c);
}
export function capacity(
  w: World,
  c: string,
  building: "civil" | "military" | "dock",
) {
  return controlled(w, c).reduce(
    (sum, p) =>
      sum +
      p.buildings[building] *
        (1 - p.damage / 150) *
        (p.owner === c ? 1 : 0.4 + p.compliance / 200),
    0,
  );
}
export function atWar(w: World, a: string, b: string) {
  return !!w.countries[a]?.wars.includes(b);
}
export function friendly(w: World, a: string, b: string) {
  return (
    a === b ||
    (!!w.countries[a] &&
      !!w.countries[b] &&
      !atWar(w, a, b) &&
      (w.countries[a].allies.includes(b) ||
        w.countries[b].access.includes(a) ||
        w.countries[b].subjectOf === a ||
        w.countries[a].subjectOf === b))
  );
}
export function navalPower(c: Country) {
  return shipPower(c);
}
export function seaOpen(w: World, country: string) {
  const c = w.countries[country];
  return (
    navalPower(c) > 0 &&
    c.wars.every(
      (id) =>
        navalPower(w.countries[id]) *
          (w.countries[id].navy.mission === "raid" ? 1 : 0.4) <=
        navalPower(c) * 1.25,
    )
  );
}
export function supplyNetwork(w: World, country: string) {
  const c = w.countries[country],
    visited = new Set<string>();
  if (!w.provinces[c.capital] || w.provinces[c.capital].controller !== country)
    return visited;
  const queue = [c.capital];
  visited.add(c.capital);
  for (let i = 0; i < queue.length; i++)
    for (const edge of GEOGRAPHY[queue[i]].neighbors) {
      if (
        visited.has(edge.id) ||
        !friendly(w, country, w.provinces[edge.id].controller) ||
        (edge.sea && !seaEdgeOpen(w, country, queue[i], edge.id))
      )
        continue;
      visited.add(edge.id);
      queue.push(edge.id);
    }
  return visited;
}
export function localSupply(
  w: World,
  c: string,
  province: string,
  network?: Set<string>,
) {
  if (!(network ?? supplyNetwork(w, c)).has(province)) return 0.08;
  const p = w.provinces[province];
  let troops = 0;
  for (const a of w.armies)
    if (a.province === province && friendly(w, c, a.country)) troops++;
  return clamp(
    ((0.4 +
      p.buildings.infra * 0.12 +
      p.buildings.rail * 0.08 +
      p.buildings.hub * 0.16) *
      (1 - p.damage / 140) *
      (w.countries[c].tech.includes("logistics") ? 1.2 : 1)) /
      Math.max(1, troops / 3),
    0.08,
    1,
  );
}
export function surrender(w: World, country: string) {
  const lands = Object.values(w.provinces).filter((p) => p.owner === country);
  const total = lands.reduce((n, p) => n + GEOGRAPHY[p.id].vp, 0);
  if (!total) return 100;
  const lost = lands
    .filter((p) => atWar(w, country, p.controller))
    .reduce((n, p) => n + GEOGRAPHY[p.id].vp, 0);
  return clamp(
    (100 * lost) / total +
      (atWar(w, country, w.provinces[w.countries[country].capital]?.controller)
        ? 20
        : 0),
  );
}
export function militaryPower(w: World, c: string) {
  return w.armies
    .filter((a) => a.country === c)
    .reduce(
      (n, a) =>
        n +
        (((UNITS[a.type].attack + UNITS[a.type].defense) * a.strength) / 100) *
          (0.3 + (0.7 * a.organization) / 100),
      0,
    );
}
export function changeRelation(w: World, a: string, b: string, amount: number) {
  w.countries[a].relations[b] = clamp(
    (w.countries[a].relations[b] ?? 0) + amount,
    -100,
    100,
  );
  w.countries[b].relations[a] = w.countries[a].relations[b];
}
export function addArmy(
  w: World,
  country: string,
  province: string,
  type: Army["type"] = "infantry",
): Army {
  const army: Army = {
    id: uid(w, "army"),
    country,
    province,
    type,
    name: `${w.armies.filter((a) => a.country === country).length + 1}. ${UNITS[type].name}`,
    strength: 100,
    organization: 85,
    morale: 80,
    supply: 1,
    experience: 0,
    general: null,
    entrenchment: 0,
    stance: "hold",
    route: [],
    move: null,
    support: [],
  };
  w.armies.push(army);
  return army;
}
export function createWorld(
  player: string,
  mode: World["mode"] = "historical",
  seed = 1936,
  difficulty: World["difficulty"] = "easy",
): World {
  requireRule(
    data.countries.some((c) => c.id === player),
    "Geçerli bir ülke seç.",
  );
  const w: World = {
    version: 2,
    player,
    mode,
    difficulty,
    day: 0,
    seed: seed >>> 0,
    serial: 0,
    tension: 12,
    countries: {},
    provinces: {},
    armies: [],
    battles: [],
    trades: [],
    fronts: [],
    plans: [],
    conferences: [],
    warScore: {},
    events: [],
    firedEvents: [],
  };
  for (const p of data.provinces)
    w.provinces[p.id] = {
      id: p.id,
      owner: p.country,
      controller: p.country,
      resistance: 0,
      compliance: 0,
      damage: 0,
      occupation: "civil",
      buildings: {
        civil: p.civil,
        military: p.military,
        dock: p.dock,
        infra: p.infra,
        rail: 1,
        hub: p.id === `${p.country}-0` ? 1 : 0,
        refinery: p.id === `${p.country}-0` ? 1 : 0,
        synthetic: 0,
        fort: 0,
        radar: 0,
        mine: 0,
        airfield: p.id === `${p.country}-0` ? 1 : 0,
        antiAir: 0,
      },
    };
  for (const d of data.countries) {
    const ideology = d.ideology as Country["ideology"];
    const major = d.industry >= 16;
    const c: Country = {
      id: d.id,
      name: d.name,
      flag: d.flag,
      color: d.color,
      capital: d.capital,
      leader: d.leader,
      ideology,
      population: d.population,
      science: d.science,
      treasury: 500 + d.industry * 25,
      political: 100,
      manpower: d.population * 0.015,
      mobilized: d.population * 0.015,
      casualties: 0,
      stability: d.id === "spain" ? 42 : 65,
      warSupport: 35,
      exhaustion: 0,
      economy: "civilian",
      conscription: "volunteer",
      stock: {
        iron: 100,
        steel: 140,
        oil: 80,
        aluminum: 80,
        rubber: 60,
        fuel: 300,
      },
      equipment: {
        rifle: 240,
        artillery: 36,
        truck: 40,
        lightTank: major ? 50 : 0,
        mediumTank: 0,
        heavyTank: 0,
        fighter: major ? 35 : 8,
        bomber: major ? 12 : 0,
        strategicBomber: 0,
        reconPlane: 0,
        transport: 0,
        carrierFighter: 0,
        destroyer: ["uk", "france", "italy"].includes(d.id) ? 4 : 0,
        battleship: ["uk", "france", "italy"].includes(d.id) ? 2 : 0,
        ship: ["uk", "france", "italy"].includes(d.id)
          ? 8
          : data.provinces.some((p) => p.country === d.id && p.port)
            ? 1
            : 0,
        submarine: major ? 2 : 0,
        carrier: d.id === "uk" ? 1 : 0,
      },
      production: [{ equipment: "rifle", factories: 1, efficiency: 0.45 }],
      construction: [],
      recruitment: [],
      tech: major
        ? ["armor1", "aviation1", "naval1", "motorization"]
        : ["aviation1"],
      research: [],
      focuses: [],
      focus: null,
      relations: {},
      wars: [],
      allies: [],
      access: [],
      embargoes: [],
      pacts: {},
      justification: {},
      claims: [],
      subjectOf: null,
      capitulated: false,
      victor: null,
      generals: [
        {
          id: `${d.id}-g1`,
          name:
            d.id === "turkey"
              ? "Fevzi Çakmak"
              : d.id === "germany"
                ? "Ludwig Beck"
                : d.id === "uk"
                  ? "Cyril Deverell"
                  : d.id === "france"
                    ? "Maurice Gamelin"
                    : d.id === "ussr"
                      ? "Mihail Tuhaçevski"
                      : "Genelkurmay Komutanı",
          trait: "defense",
          skill: 2,
          xp: 0,
        },
        {
          id: `${d.id}-g2`,
          name: "Harekât Komutanı",
          trait: "logistics",
          skill: 1,
          xp: 0,
        },
      ],
      advisor: "industry",
      automation: {
        economy: false,
        research: false,
        recruitment: false,
        operations: false,
      },
      cabinet: {
        economy: "builder",
        military: "defender",
        science: "institute",
      },
      decisions: {},
      parties: {
        democracy: 8,
        republic: 8,
        monarchy: 8,
        fascism: 8,
        communism: 8,
      },
      agency: false,
      agents: 0,
      agentTraining: 0,
      counterIntel: false,
      missions: [],
      intel: {},
      air: { mission: "idle", target: d.id, wings: [] },
      navy: { mission: "idle", target: d.id, ships: [], zone: "atlantic" },
      history: [],
    };
    c.parties[ideology] = 68;
    w.countries[c.id] = c;
    initializeAssets(w, c);
  }
  for (const c of Object.values(w.countries)) {
    for (const other of Object.values(w.countries))
      if (c !== other)
        c.relations[other.id] = c.ideology === other.ideology ? 20 : -5;
    const lands = controlled(w, c.id);
    const count = Math.min(
      lands.length * 2,
      Math.max(1, Math.floor(c.population / 5500000)),
    );
    // Initial formations are drawn from the mobilized pool; they are not free reinforcements.
    for (let i = 0; i < count; i++) {
      const type =
        i === count - 1 && c.tech.includes("armor1") ? "lightTank" : "infantry";
      if (c.manpower < UNITS[type].men) break;
      addArmy(w, c.id, lands[i % lands.length].id, type);
      c.manpower -= UNITS[type].men;
    }
  }
  w.countries.uk.allies = ["france"];
  w.countries.france.allies = ["uk"];
  w.countries.france.relations.uk = 60;
  w.countries.uk.relations.france = 60;
  event(
    w,
    "1 Ocak 1936. Avrupa yeniden silahlanıyor. Ülkenin geleceği verdiğin kararlara bağlı.",
    "politics",
  );
  return w;
}
