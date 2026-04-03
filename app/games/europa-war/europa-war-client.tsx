"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UnitType = "infantry" | "tank" | "aircraft";
type TerrainType = "plains" | "mountain" | "urban" | "coastal" | "forest";
type PanelMode = "territory" | "country" | "economy" | "tech" | null;

type CountryId =
  | "iceland"
  | "ireland"
  | "uk"
  | "portugal"
  | "spain"
  | "france"
  | "belgium"
  | "netherlands"
  | "luxembourg"
  | "germany"
  | "denmark"
  | "norway"
  | "sweden"
  | "finland"
  | "estonia"
  | "latvia"
  | "lithuania"
  | "poland"
  | "czechia"
  | "slovakia"
  | "austria"
  | "switzerland"
  | "italy"
  | "slovenia"
  | "croatia"
  | "bosnia"
  | "serbia"
  | "montenegro"
  | "albania"
  | "northmacedonia"
  | "greece"
  | "hungary"
  | "romania"
  | "bulgaria"
  | "moldova"
  | "ukraine"
  | "belarus"
  | "turkey";

type UnitCounts = Record<UnitType, number>;

interface ResearchState {
  category: UnitType;
  level: number;
  remainingDays: number;
}

interface CountryState {
  id: CountryId;
  name: string;
  color: string;
  treasury: number;
  baseFactories: number;
  relations: Record<CountryId, number>;
  tech: Record<UnitType, number>;
  activeResearch: ResearchState | null;
  atWarWith: CountryId[];
  allies: CountryId[];
}

interface Territory {
  id: CountryId;
  name: string;
  originalOwnerId: CountryId;
  ownerCountryId: CountryId;
  economy: number;
  factories: number;
  terrain: TerrainType;
  neighbors: CountryId[];
  units: UnitCounts;
  polygon: string;
  labelX: number;
  labelY: number;
}

interface MoveTask {
  id: string;
  ownerCountryId: CountryId;
  fromTerritoryId: CountryId;
  toTerritoryId: CountryId;
  payload: UnitCounts;
  remainingDays: number;
  isAttack: boolean;
}

interface MoveDraft {
  sourceTerritoryId: CountryId;
  infantry: number;
  tank: number;
  aircraft: number;
}

interface SaveState {
  countries: CountryState[];
  territories: Territory[];
  selectedCountryId: CountryId | null;
  selectedTerritoryId: CountryId | null;
  selectedTargetCountryId: CountryId | null;
  panelMode: PanelMode;
  day: number;
  eventLog: string[];
  moveTasks: MoveTask[];
  gameOver: { winner: boolean; reason: string } | null;
}

const SAVE_KEY = "europa-war-save-v3";

const EMPTY_UNITS: UnitCounts = {
  infantry: 0,
  tank: 0,
  aircraft: 0,
};

const COUNTRY_ORDER: CountryId[] = [
  "iceland",
  "ireland",
  "uk",
  "portugal",
  "spain",
  "france",
  "belgium",
  "netherlands",
  "luxembourg",
  "germany",
  "denmark",
  "norway",
  "sweden",
  "finland",
  "estonia",
  "latvia",
  "lithuania",
  "poland",
  "czechia",
  "slovakia",
  "austria",
  "switzerland",
  "italy",
  "slovenia",
  "croatia",
  "bosnia",
  "serbia",
  "montenegro",
  "albania",
  "northmacedonia",
  "greece",
  "hungary",
  "romania",
  "bulgaria",
  "moldova",
  "ukraine",
  "belarus",
  "turkey",
];

function rect(x: number, y: number, w: number, h: number): string {
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

function poly(points: Array<[number, number]>): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M ${first[0]} ${first[1]} ` + rest.map((p) => `L ${p[0]} ${p[1]}`).join(" ") + " Z";
}

function makeRelations(self: CountryId): Record<CountryId, number> {
  const result = {} as Record<CountryId, number>;
  for (const id of COUNTRY_ORDER) {
    result[id] = id === self ? 100 : 0;
  }
  return result;
}

function cloneUnits(u: UnitCounts): UnitCounts {
  return {
    infantry: u.infantry,
    tank: u.tank,
    aircraft: u.aircraft,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sumUnits(u: UnitCounts): number {
  return u.infantry + u.tank + u.aircraft;
}

function formatDate(dayOffset: number): string {
  const d = new Date(2025, 0, 1);
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function unitLabel(type: UnitType): string {
  if (type === "infantry") return "Asker";
  if (type === "tank") return "Tank";
  return "Uçak";
}

function terrainDefenseBonus(t: TerrainType): number {
  if (t === "mountain") return 1.3;
  if (t === "urban") return 1.18;
  if (t === "forest") return 1.12;
  if (t === "coastal") return 1.06;
  return 1.0;
}

function tankTerrainBonus(t: TerrainType): number {
  if (t === "plains") return 1.2;
  if (t === "urban") return 0.9;
  if (t === "mountain") return 0.7;
  if (t === "forest") return 0.82;
  return 1.0;
}

const INITIAL_COUNTRIES: CountryState[] = [
  { id: "iceland", name: "İzlanda", color: "#60a5fa", treasury: 120, baseFactories: 1, relations: makeRelations("iceland"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "ireland", name: "İrlanda", color: "#22c55e", treasury: 130, baseFactories: 1, relations: makeRelations("ireland"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "uk", name: "Birleşik Krallık", color: "#3b82f6", treasury: 230, baseFactories: 3, relations: makeRelations("uk"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "portugal", name: "Portekiz", color: "#f59e0b", treasury: 140, baseFactories: 1, relations: makeRelations("portugal"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "spain", name: "İspanya", color: "#eab308", treasury: 220, baseFactories: 2, relations: makeRelations("spain"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "france", name: "Fransa", color: "#0ea5e9", treasury: 260, baseFactories: 3, relations: makeRelations("france"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "belgium", name: "Belçika", color: "#f97316", treasury: 120, baseFactories: 1, relations: makeRelations("belgium"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "netherlands", name: "Hollanda", color: "#fb7185", treasury: 120, baseFactories: 1, relations: makeRelations("netherlands"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "luxembourg", name: "Lüksemburg", color: "#06b6d4", treasury: 80, baseFactories: 0, relations: makeRelations("luxembourg"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "germany", name: "Almanya", color: "#64748b", treasury: 320, baseFactories: 4, relations: makeRelations("germany"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "denmark", name: "Danimarka", color: "#ef4444", treasury: 120, baseFactories: 1, relations: makeRelations("denmark"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "norway", name: "Norveç", color: "#0f766e", treasury: 150, baseFactories: 1, relations: makeRelations("norway"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "sweden", name: "İsveç", color: "#2563eb", treasury: 180, baseFactories: 2, relations: makeRelations("sweden"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "finland", name: "Finlandiya", color: "#94a3b8", treasury: 160, baseFactories: 1, relations: makeRelations("finland"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "estonia", name: "Estonya", color: "#14b8a6", treasury: 90, baseFactories: 0, relations: makeRelations("estonia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "latvia", name: "Letonya", color: "#059669", treasury: 90, baseFactories: 0, relations: makeRelations("latvia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "lithuania", name: "Litvanya", color: "#16a34a", treasury: 95, baseFactories: 0, relations: makeRelations("lithuania"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "poland", name: "Polonya", color: "#dc2626", treasury: 210, baseFactories: 2, relations: makeRelations("poland"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "czechia", name: "Çekya", color: "#b45309", treasury: 120, baseFactories: 1, relations: makeRelations("czechia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "slovakia", name: "Slovakya", color: "#84cc16", treasury: 110, baseFactories: 1, relations: makeRelations("slovakia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "austria", name: "Avusturya", color: "#991b1b", treasury: 130, baseFactories: 1, relations: makeRelations("austria"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "switzerland", name: "İsviçre", color: "#be123c", treasury: 110, baseFactories: 1, relations: makeRelations("switzerland"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "italy", name: "İtalya", color: "#10b981", treasury: 220, baseFactories: 2, relations: makeRelations("italy"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "slovenia", name: "Slovenya", color: "#22d3ee", treasury: 90, baseFactories: 0, relations: makeRelations("slovenia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "croatia", name: "Hırvatistan", color: "#f43f5e", treasury: 100, baseFactories: 1, relations: makeRelations("croatia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "bosnia", name: "Bosna", color: "#1d4ed8", treasury: 85, baseFactories: 0, relations: makeRelations("bosnia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "serbia", name: "Sırbistan", color: "#7c3aed", treasury: 105, baseFactories: 1, relations: makeRelations("serbia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "montenegro", name: "Karadağ", color: "#c2410c", treasury: 75, baseFactories: 0, relations: makeRelations("montenegro"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "albania", name: "Arnavutluk", color: "#111827", treasury: 75, baseFactories: 0, relations: makeRelations("albania"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "northmacedonia", name: "K. Makedonya", color: "#facc15", treasury: 75, baseFactories: 0, relations: makeRelations("northmacedonia"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "greece", name: "Yunanistan", color: "#3b82f6", treasury: 140, baseFactories: 1, relations: makeRelations("greece"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "hungary", name: "Macaristan", color: "#f97316", treasury: 115, baseFactories: 1, relations: makeRelations("hungary"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "romania", name: "Romanya", color: "#f59e0b", treasury: 160, baseFactories: 1, relations: makeRelations("romania"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "bulgaria", name: "Bulgaristan", color: "#22c55e", treasury: 110, baseFactories: 1, relations: makeRelations("bulgaria"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "moldova", name: "Moldova", color: "#65a30d", treasury: 75, baseFactories: 0, relations: makeRelations("moldova"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "ukraine", name: "Ukrayna", color: "#2563eb", treasury: 240, baseFactories: 2, relations: makeRelations("ukraine"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "belarus", name: "Belarus", color: "#15803d", treasury: 150, baseFactories: 1, relations: makeRelations("belarus"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
  { id: "turkey", name: "Türkiye", color: "#ef4444", treasury: 190, baseFactories: 2, relations: makeRelations("turkey"), tech: { infantry: 0, tank: 0, aircraft: 0 }, activeResearch: null, atWarWith: [], allies: [] },
];

const INITIAL_TERRITORIES: Territory[] = [
  { id: "iceland", name: "İzlanda", originalOwnerId: "iceland", ownerCountryId: "iceland", economy: 2, factories: 0, terrain: "coastal", neighbors: [], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(40, 70, 70, 35), labelX: 75, labelY: 92 },
  { id: "ireland", name: "İrlanda", originalOwnerId: "ireland", ownerCountryId: "ireland", economy: 3, factories: 0, terrain: "coastal", neighbors: ["uk"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(130, 180, 45, 70), labelX: 152, labelY: 217 },
  { id: "uk", name: "B.Krallık", originalOwnerId: "uk", ownerCountryId: "uk", economy: 6, factories: 1, terrain: "coastal", neighbors: ["ireland", "france", "belgium", "netherlands"], units: { infantry: 4, tank: 0, aircraft: 1 }, polygon: poly([[190, 130], [245, 120], [270, 170], [260, 240], [220, 265], [185, 230], [178, 170]]), labelX: 225, labelY: 193 },
  { id: "portugal", name: "Portekiz", originalOwnerId: "portugal", ownerCountryId: "portugal", economy: 3, factories: 0, terrain: "coastal", neighbors: ["spain"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(150, 360, 40, 85), labelX: 170, labelY: 405 },
  { id: "spain", name: "İspanya", originalOwnerId: "spain", ownerCountryId: "spain", economy: 7, factories: 1, terrain: "plains", neighbors: ["portugal", "france"], units: { infantry: 4, tank: 0, aircraft: 0 }, polygon: poly([[190, 330], [285, 315], [340, 340], [330, 420], [250, 450], [180, 425]]), labelX: 255, labelY: 384 },
  { id: "france", name: "Fransa", originalOwnerId: "france", ownerCountryId: "france", economy: 8, factories: 1, terrain: "urban", neighbors: ["spain", "uk", "belgium", "luxembourg", "germany", "switzerland", "italy"], units: { infantry: 5, tank: 0, aircraft: 0 }, polygon: poly([[295, 245], [385, 235], [430, 280], [415, 350], [345, 375], [280, 340], [270, 285]]), labelX: 352, labelY: 304 },
  { id: "belgium", name: "Belçika", originalOwnerId: "belgium", ownerCountryId: "belgium", economy: 3, factories: 0, terrain: "urban", neighbors: ["uk", "france", "netherlands", "luxembourg", "germany"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(410, 225, 28, 28), labelX: 424, labelY: 243 },
  { id: "netherlands", name: "Hollanda", originalOwnerId: "netherlands", ownerCountryId: "netherlands", economy: 3, factories: 0, terrain: "coastal", neighbors: ["uk", "belgium", "germany"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(432, 190, 30, 34), labelX: 447, labelY: 209 },
  { id: "luxembourg", name: "Lük.", originalOwnerId: "luxembourg", ownerCountryId: "luxembourg", economy: 1, factories: 0, terrain: "urban", neighbors: ["france", "belgium", "germany"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(438, 255, 18, 18), labelX: 447, labelY: 267 },
  { id: "germany", name: "Almanya", originalOwnerId: "germany", ownerCountryId: "germany", economy: 10, factories: 2, terrain: "urban", neighbors: ["france", "belgium", "netherlands", "luxembourg", "denmark", "poland", "czechia", "austria", "switzerland"], units: { infantry: 6, tank: 1, aircraft: 0 }, polygon: poly([[465, 185], [560, 180], [590, 230], [575, 325], [515, 345], [455, 300], [450, 240]]), labelX: 523, labelY: 255 },
  { id: "denmark", name: "Danimarka", originalOwnerId: "denmark", ownerCountryId: "denmark", economy: 3, factories: 0, terrain: "coastal", neighbors: ["germany", "norway", "sweden"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(520, 135, 38, 30), labelX: 539, labelY: 153 },
  { id: "norway", name: "Norveç", originalOwnerId: "norway", ownerCountryId: "norway", economy: 4, factories: 0, terrain: "mountain", neighbors: ["denmark", "sweden", "finland"], units: { infantry: 3, tank: 0, aircraft: 0 }, polygon: poly([[470, 40], [535, 25], [560, 65], [550, 150], [520, 180], [485, 145], [460, 85]]), labelX: 515, labelY: 104 },
  { id: "sweden", name: "İsveç", originalOwnerId: "sweden", ownerCountryId: "sweden", economy: 5, factories: 1, terrain: "forest", neighbors: ["denmark", "norway", "finland"], units: { infantry: 3, tank: 0, aircraft: 0 }, polygon: poly([[565, 55], [625, 48], [650, 95], [640, 190], [600, 220], [565, 175], [560, 105]]), labelX: 607, labelY: 132 },
  { id: "finland", name: "Finlandiya", originalOwnerId: "finland", ownerCountryId: "finland", economy: 4, factories: 0, terrain: "forest", neighbors: ["norway", "sweden", "estonia"], units: { infantry: 3, tank: 0, aircraft: 0 }, polygon: poly([[660, 55], [730, 50], [760, 110], [742, 205], [690, 215], [655, 165], [648, 100]]), labelX: 708, labelY: 132 },
  { id: "estonia", name: "Estonya", originalOwnerId: "estonia", ownerCountryId: "estonia", economy: 2, factories: 0, terrain: "forest", neighbors: ["finland", "latvia"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(720, 210, 45, 24), labelX: 742, labelY: 225 },
  { id: "latvia", name: "Letonya", originalOwnerId: "latvia", ownerCountryId: "latvia", economy: 2, factories: 0, terrain: "forest", neighbors: ["estonia", "lithuania", "belarus"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(718, 238, 52, 26), labelX: 744, labelY: 254 },
  { id: "lithuania", name: "Litvanya", originalOwnerId: "lithuania", ownerCountryId: "lithuania", economy: 2, factories: 0, terrain: "forest", neighbors: ["latvia", "poland", "belarus"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(715, 268, 55, 28), labelX: 742, labelY: 286 },
  { id: "poland", name: "Polonya", originalOwnerId: "poland", ownerCountryId: "poland", economy: 7, factories: 1, terrain: "plains", neighbors: ["germany", "lithuania", "belarus", "ukraine", "slovakia", "czechia"], units: { infantry: 5, tank: 0, aircraft: 0 }, polygon: poly([[595, 230], [700, 225], [730, 295], [700, 355], [618, 348], [575, 295]]), labelX: 650, labelY: 288 },
  { id: "czechia", name: "Çekya", originalOwnerId: "czechia", ownerCountryId: "czechia", economy: 3, factories: 0, terrain: "urban", neighbors: ["germany", "poland", "slovakia", "austria"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(560, 350, 55, 24), labelX: 587, labelY: 366 },
  { id: "slovakia", name: "Slovakya", originalOwnerId: "slovakia", ownerCountryId: "slovakia", economy: 3, factories: 0, terrain: "plains", neighbors: ["czechia", "poland", "austria", "hungary", "ukraine"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(618, 350, 55, 22), labelX: 645, labelY: 365 },
  { id: "austria", name: "Avusturya", originalOwnerId: "austria", ownerCountryId: "austria", economy: 3, factories: 0, terrain: "mountain", neighbors: ["germany", "czechia", "slovakia", "hungary", "slovenia", "italy", "switzerland"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(540, 380, 80, 28), labelX: 580, labelY: 398 },
  { id: "switzerland", name: "İsviçre", originalOwnerId: "switzerland", ownerCountryId: "switzerland", economy: 3, factories: 0, terrain: "mountain", neighbors: ["france", "germany", "austria", "italy"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(470, 360, 52, 28), labelX: 496, labelY: 378 },
  { id: "italy", name: "İtalya", originalOwnerId: "italy", ownerCountryId: "italy", economy: 7, factories: 1, terrain: "mountain", neighbors: ["france", "switzerland", "austria", "slovenia", "croatia"], units: { infantry: 4, tank: 0, aircraft: 0 }, polygon: poly([[500, 410], [570, 410], [605, 450], [590, 520], [555, 570], [520, 550], [535, 490], [495, 455]]), labelX: 553, labelY: 485 },
  { id: "slovenia", name: "Slovenya", originalOwnerId: "slovenia", ownerCountryId: "slovenia", economy: 2, factories: 0, terrain: "mountain", neighbors: ["austria", "italy", "croatia", "hungary"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(624, 388, 28, 18), labelX: 638, labelY: 401 },
  { id: "croatia", name: "Hırvat.", originalOwnerId: "croatia", ownerCountryId: "croatia", economy: 3, factories: 0, terrain: "coastal", neighbors: ["slovenia", "italy", "hungary", "bosnia", "serbia"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: poly([[655, 390], [700, 388], [715, 418], [690, 452], [660, 446], [646, 415]]), labelX: 680, labelY: 418 },
  { id: "bosnia", name: "Bosna", originalOwnerId: "bosnia", ownerCountryId: "bosnia", economy: 2, factories: 0, terrain: "mountain", neighbors: ["croatia", "serbia", "montenegro"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(700, 420, 34, 28), labelX: 717, labelY: 438 },
  { id: "serbia", name: "Sırbistan", originalOwnerId: "serbia", ownerCountryId: "serbia", economy: 3, factories: 0, terrain: "plains", neighbors: ["croatia", "bosnia", "hungary", "romania", "bulgaria", "montenegro", "northmacedonia"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(738, 395, 45, 48), labelX: 760, labelY: 421 },
  { id: "montenegro", name: "Karadağ", originalOwnerId: "montenegro", ownerCountryId: "montenegro", economy: 1, factories: 0, terrain: "mountain", neighbors: ["bosnia", "serbia", "albania"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(720, 452, 24, 20), labelX: 732, labelY: 466 },
  { id: "albania", name: "Arnavut.", originalOwnerId: "albania", ownerCountryId: "albania", economy: 1, factories: 0, terrain: "mountain", neighbors: ["montenegro", "northmacedonia", "greece"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(750, 470, 25, 28), labelX: 762, labelY: 486 },
  { id: "northmacedonia", name: "K.Mak.", originalOwnerId: "northmacedonia", ownerCountryId: "northmacedonia", economy: 1, factories: 0, terrain: "mountain", neighbors: ["serbia", "albania", "greece", "bulgaria"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(782, 456, 32, 26), labelX: 798, labelY: 472 },
  { id: "greece", name: "Yunanistan", originalOwnerId: "greece", ownerCountryId: "greece", economy: 4, factories: 0, terrain: "coastal", neighbors: ["albania", "northmacedonia", "bulgaria", "turkey"], units: { infantry: 3, tank: 0, aircraft: 0 }, polygon: poly([[785, 490], [835, 486], [865, 520], [845, 565], [790, 548], [772, 515]]), labelX: 818, labelY: 527 },
  { id: "hungary", name: "Macaristan", originalOwnerId: "hungary", ownerCountryId: "hungary", economy: 3, factories: 0, terrain: "plains", neighbors: ["austria", "slovenia", "croatia", "serbia", "romania", "slovakia"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(626, 382, 58, 26), labelX: 655, labelY: 399 },
  { id: "romania", name: "Romanya", originalOwnerId: "romania", ownerCountryId: "romania", economy: 5, factories: 1, terrain: "plains", neighbors: ["hungary", "serbia", "bulgaria", "moldova", "ukraine"], units: { infantry: 3, tank: 0, aircraft: 0 }, polygon: poly([[690, 350], [770, 345], [806, 385], [790, 440], [735, 445], [690, 405]]), labelX: 748, labelY: 392 },
  { id: "bulgaria", name: "Bulgaristan", originalOwnerId: "bulgaria", ownerCountryId: "bulgaria", economy: 3, factories: 0, terrain: "plains", neighbors: ["serbia", "northmacedonia", "greece", "romania", "turkey"], units: { infantry: 2, tank: 0, aircraft: 0 }, polygon: rect(800, 430, 58, 34), labelX: 829, labelY: 450 },
  { id: "moldova", name: "Moldova", originalOwnerId: "moldova", ownerCountryId: "moldova", economy: 1, factories: 0, terrain: "plains", neighbors: ["romania", "ukraine"], units: { infantry: 1, tank: 0, aircraft: 0 }, polygon: rect(808, 355, 24, 44), labelX: 820, labelY: 378 },
  { id: "ukraine", name: "Ukrayna", originalOwnerId: "ukraine", ownerCountryId: "ukraine", economy: 8, factories: 1, terrain: "plains", neighbors: ["poland", "slovakia", "romania", "moldova", "belarus", "turkey"], units: { infantry: 5, tank: 0, aircraft: 0 }, polygon: poly([[780, 245], [950, 240], [1000, 310], [985, 415], [905, 440], [830, 405], [790, 340]]), labelX: 895, labelY: 333 },
  { id: "belarus", name: "Belarus", originalOwnerId: "belarus", ownerCountryId: "belarus", economy: 4, factories: 0, terrain: "forest", neighbors: ["latvia", "lithuania", "poland", "ukraine"], units: { infantry: 3, tank: 0, aircraft: 0 }, polygon: poly([[770, 220], [850, 215], [875, 270], [845, 330], [790, 320], [750, 270]]), labelX: 810, labelY: 270 },
  { id: "turkey", name: "Türkiye", originalOwnerId: "turkey", ownerCountryId: "turkey", economy: 7, factories: 1, terrain: "coastal", neighbors: ["greece", "bulgaria", "ukraine"], units: { infantry: 4, tank: 0, aircraft: 0 }, polygon: poly([[875, 470], [1065, 472], [1110, 520], [1045, 565], [900, 550], [855, 505]]), labelX: 985, labelY: 520 },
];

const RESEARCH_BASE_DAYS: Record<UnitType, [number, number, number]> = {
  infantry: [22, 38, 56],
  tank: [28, 46, 68],
  aircraft: [32, 52, 75],
};

function initialState(): SaveState {
  return {
    countries: INITIAL_COUNTRIES,
    territories: INITIAL_TERRITORIES,
    selectedCountryId: null,
    selectedTerritoryId: null,
    selectedTargetCountryId: null,
    panelMode: null,
    day: 0,
    eventLog: [],
    moveTasks: [],
    gameOver: null,
  };
}

export default function EuropaWarClient() {
  const [countries, setCountries] = useState<CountryState[]>(INITIAL_COUNTRIES);
  const [territories, setTerritories] = useState<Territory[]>(INITIAL_TERRITORIES);
  const [selectedCountryId, setSelectedCountryId] = useState<CountryId | null>(null);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<CountryId | null>(null);
  const [selectedTargetCountryId, setSelectedTargetCountryId] = useState<CountryId | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [day, setDay] = useState(0);
  const [running, setRunning] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [moveTasks, setMoveTasks] = useState<MoveTask[]>([]);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: boolean; reason: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  const stateRef = useRef<SaveState | null>(null);

  useEffect(() => {
    stateRef.current = {
      countries,
      territories,
      selectedCountryId,
      selectedTerritoryId,
      selectedTargetCountryId,
      panelMode,
      day,
      eventLog,
      moveTasks,
      gameOver,
    };
  }, [
    countries,
    territories,
    selectedCountryId,
    selectedTerritoryId,
    selectedTargetCountryId,
    panelMode,
    day,
    eventLog,
    moveTasks,
    gameOver,
  ]);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveState;
        setCountries(parsed.countries);
        setTerritories(parsed.territories);
        setSelectedCountryId(parsed.selectedCountryId);
        setSelectedTerritoryId(parsed.selectedTerritoryId);
        setSelectedTargetCountryId(parsed.selectedTargetCountryId);
        setPanelMode(parsed.panelMode);
        setDay(parsed.day);
        setEventLog(parsed.eventLog ?? []);
        setMoveTasks(parsed.moveTasks ?? []);
        setGameOver(parsed.gameOver ?? null);
      }
    } catch {}
  }, []);

  const playerCountry = selectedCountryId
    ? countries.find((c) => c.id === selectedCountryId) ?? null
    : null;

  const selectedTerritory = selectedTerritoryId
    ? territories.find((t) => t.id === selectedTerritoryId) ?? null
    : null;

  const targetCountry = selectedTargetCountryId
    ? countries.find((c) => c.id === selectedTargetCountryId) ?? null
    : null;

  const ownedTerritories = useMemo(() => {
    if (!selectedCountryId) return [];
    return territories.filter((t) => t.ownerCountryId === selectedCountryId);
  }, [territories, selectedCountryId]);

  const playerEconomy = useMemo(() => {
    return ownedTerritories.reduce((s, t) => s + t.economy, 0);
  }, [ownedTerritories]);

  const playerFactories = useMemo(() => {
    if (!playerCountry) return 0;
    return ownedTerritories.reduce((s, t) => s + t.factories, 0) + playerCountry.baseFactories;
  }, [ownedTerritories, playerCountry]);

  const playerIncome = useMemo(() => {
    if (!selectedCountryId) return 0;
    const territoriesCount = ownedTerritories.length;
    const eco = ownedTerritories.reduce((s, t) => s + t.economy, 0);
    const fac = ownedTerritories.reduce((s, t) => s + t.factories, 0) + (playerCountry?.baseFactories ?? 0);
    return Math.floor(territoriesCount * 2 + eco * 0.35 + fac * 1.2);
  }, [ownedTerritories, playerCountry, selectedCountryId]);

  const playerCap = useMemo(() => {
    if (!selectedCountryId) return 0;
    const eco = ownedTerritories.reduce((s, t) => s + t.economy, 0);
    const fac = ownedTerritories.reduce((s, t) => s + t.factories, 0) + (playerCountry?.baseFactories ?? 0);
    return eco * 2 + fac * 2;
  }, [ownedTerritories, playerCountry, selectedCountryId]);

  const playerUsed = useMemo(() => {
    if (!selectedCountryId) return 0;
    const stationed = ownedTerritories.reduce(
      (sum, t) => sum + t.units.infantry + t.units.tank * 2 + t.units.aircraft * 2,
      0
    );
    const moving = moveTasks
      .filter((m) => m.ownerCountryId === selectedCountryId)
      .reduce(
        (sum, m) =>
          sum + m.payload.infantry + m.payload.tank * 2 + m.payload.aircraft * 2,
        0
      );
    return stationed + moving;
  }, [ownedTerritories, moveTasks, selectedCountryId]);

  const productionDiscount = useMemo(() => {
    return Math.min(playerFactories * 0.025, 0.35);
  }, [playerFactories]);

  const relationToTarget =
    selectedCountryId && selectedTargetCountryId
      ? countries.find((c) => c.id === selectedCountryId)?.relations[selectedTargetCountryId] ?? 0
      : 0;

  const warWithTarget =
    !!selectedCountryId &&
    !!selectedTargetCountryId &&
    (countries.find((c) => c.id === selectedCountryId)?.atWarWith.includes(selectedTargetCountryId) ?? false);

  function addLog(message: string) {
    setEventLog((prev) => [`${formatDate(day)} • ${message}`, ...prev].slice(0, 32));
  }

  function getCountryName(id: CountryId) {
    return countries.find((c) => c.id === id)?.name ?? id;
  }

  function getCountryColor(id: CountryId) {
    return countries.find((c) => c.id === id)?.color ?? "#64748b";
  }

  function saveGame() {
    try {
      const payload: SaveState = {
        countries,
        territories,
        selectedCountryId,
        selectedTerritoryId,
        selectedTargetCountryId,
        panelMode,
        day,
        eventLog,
        moveTasks,
        gameOver,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      addLog("Oyun kaydedildi.");
    } catch {
      addLog("Kayıt başarısız.");
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        addLog("Kayıt yok.");
        return;
      }
      const parsed = JSON.parse(raw) as SaveState;
      setCountries(parsed.countries);
      setTerritories(parsed.territories);
      setSelectedCountryId(parsed.selectedCountryId);
      setSelectedTerritoryId(parsed.selectedTerritoryId);
      setSelectedTargetCountryId(parsed.selectedTargetCountryId);
      setPanelMode(parsed.panelMode);
      setDay(parsed.day);
      setEventLog(parsed.eventLog ?? []);
      setMoveTasks(parsed.moveTasks ?? []);
      setMoveDraft(null);
      setGameOver(parsed.gameOver ?? null);
      setRunning(false);
    } catch {
      addLog("Kayıt yüklenemedi.");
    }
  }

  function resetGame() {
    const s = initialState();
    setCountries(s.countries);
    setTerritories(s.territories);
    setSelectedCountryId(s.selectedCountryId);
    setSelectedTerritoryId(s.selectedTerritoryId);
    setSelectedTargetCountryId(s.selectedTargetCountryId);
    setPanelMode(s.panelMode);
    setDay(s.day);
    setEventLog(s.eventLog);
    setMoveTasks(s.moveTasks);
    setMoveDraft(null);
    setGameOver(null);
    setRunning(false);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
  }

  function selectStartingCountry(countryId: CountryId) {
    setSelectedCountryId(countryId);
    setSelectedTerritoryId(countryId);
    setSelectedTargetCountryId(null);
    setPanelMode("territory");
    addLog(`${getCountryName(countryId)} seçildi.`);
  }

  function updateCountry(id: CountryId, updater: (c: CountryState) => CountryState) {
    setCountries((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }

  function setRelationsBoth(a: CountryId, b: CountryId, delta: number) {
    setCountries((prev) =>
      prev.map((c) => {
        if (c.id !== a && c.id !== b) return c;
        const other = c.id === a ? b : a;
        return {
          ...c,
          relations: {
            ...c.relations,
            [other]: clamp(c.relations[other] + delta, -100, 100),
          },
        };
      })
    );
  }

  function declareWar(a: CountryId, b: CountryId) {
    setCountries((prev) =>
      prev.map((c) => {
        if (c.id === a) return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, b])) };
        if (c.id === b) return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, a])) };
        return c;
      })
    );
  }

  function makePeace(a: CountryId, b: CountryId) {
    setCountries((prev) =>
      prev.map((c) => {
        if (c.id === a) return { ...c, atWarWith: c.atWarWith.filter((x) => x !== b) };
        if (c.id === b) return { ...c, atWarWith: c.atWarWith.filter((x) => x !== a) };
        return c;
      })
    );
  }

  function addAlliance(a: CountryId, b: CountryId) {
    setCountries((prev) =>
      prev.map((c) => {
        if (c.id === a) return { ...c, allies: Array.from(new Set([...c.allies, b])) };
        if (c.id === b) return { ...c, allies: Array.from(new Set([...c.allies, a])) };
        return c;
      })
    );
  }

  function onTerritoryClick(id: CountryId) {
    const clicked = territories.find((t) => t.id === id);
    if (!clicked) return;

    if (moveDraft) {
      const source = territories.find((t) => t.id === moveDraft.sourceTerritoryId);
      if (!source) {
        setMoveDraft(null);
        return;
      }

      if (!source.neighbors.includes(clicked.id)) {
        addLog("Sadece komşu ülkeye hareket edebilirsin.");
        return;
      }

      if (
        moveDraft.infantry + moveDraft.tank + moveDraft.aircraft <= 0
      ) {
        addLog("Hareket için birlik seç.");
        return;
      }

      if (
        moveDraft.infantry > source.units.infantry ||
        moveDraft.tank > source.units.tank ||
        moveDraft.aircraft > source.units.aircraft
      ) {
        addLog("Kaynak ülkede yeterli birlik yok.");
        return;
      }

      const attack = clicked.ownerCountryId !== source.ownerCountryId;
      if (
        attack &&
        !countries.find((c) => c.id === source.ownerCountryId)?.atWarWith.includes(clicked.ownerCountryId)
      ) {
        addLog("Saldırı için önce savaş ilan et.");
        return;
      }

      const moveDays =
        moveDraft.aircraft > 0 ? 1 : moveDraft.tank > 0 ? 3 : 2;

      setTerritories((prev) =>
        prev.map((t) =>
          t.id === source.id
            ? {
                ...t,
                units: {
                  infantry: t.units.infantry - moveDraft.infantry,
                  tank: t.units.tank - moveDraft.tank,
                  aircraft: t.units.aircraft - moveDraft.aircraft,
                },
              }
            : t
        )
      );

      setMoveTasks((prev) => [
        ...prev,
        {
          id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ownerCountryId: source.ownerCountryId,
          fromTerritoryId: source.id,
          toTerritoryId: clicked.id,
          payload: {
            infantry: moveDraft.infantry,
            tank: moveDraft.tank,
            aircraft: moveDraft.aircraft,
          },
          remainingDays: moveDays,
          isAttack: attack,
        },
      ]);

      addLog(`${source.name} → ${clicked.name} hareketi başlatıldı.`);
      setMoveDraft(null);
      return;
    }

    setSelectedTerritoryId(id);
    setPanelMode("territory");

    if (selectedCountryId && clicked.ownerCountryId !== selectedCountryId) {
      setSelectedTargetCountryId(clicked.ownerCountryId);
    }
  }

  function startMoveMode() {
    if (!selectedCountryId || !selectedTerritory) return;
    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;
    setMoveDraft({
      sourceTerritoryId: selectedTerritory.id,
      infantry: 0,
      tank: 0,
      aircraft: 0,
    });
  }

  function cancelMoveMode() {
    setMoveDraft(null);
  }

  function unitCost(type: UnitType) {
    const base = type === "infantry" ? 35 : type === "tank" ? 95 : 120;
    return Math.ceil(base * (1 - productionDiscount));
  }

  function unitManpower(type: UnitType) {
    return type === "infantry" ? 1 : 2;
  }

  function canProduce(type: UnitType) {
    if (!playerCountry) return false;
    if (type === "tank" && playerFactories < 6) return false;
    if (type === "aircraft" && playerFactories < 9) return false;
    return true;
  }

  function produceUnit(type: UnitType) {
    if (!selectedCountryId || !selectedTerritory || !playerCountry) return;
    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;

    if (!canProduce(type)) {
      addLog(
        type === "tank"
          ? "Tank için en az toplam 6 fabrika lazım."
          : type === "aircraft"
          ? "Uçak için en az toplam 9 fabrika lazım."
          : "Üretim yapılamadı."
      );
      return;
    }

    const cost = unitCost(type);
    const manpower = unitManpower(type);

    if (playerCountry.treasury < cost) {
      addLog("Yeterli para yok.");
      return;
    }

    if (playerUsed + manpower > playerCap) {
      addLog("Birlik kapasitesi dolu.");
      return;
    }

    updateCountry(selectedCountryId, (c) => ({
      ...c,
      treasury: c.treasury - cost,
    }));

    setTerritories((prev) =>
      prev.map((t) =>
        t.id === selectedTerritory.id
          ? { ...t, units: { ...t.units, [type]: t.units[type] + 1 } }
          : t
      )
    );

    addLog(`${selectedTerritory.name} bölgesinde ${unitLabel(type)} üretildi.`);
  }

  function buildFactory() {
    if (!selectedCountryId || !selectedTerritory || !playerCountry) return;
    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;

    const ownedFactoryCount = ownedTerritories.reduce((s, t) => s + t.factories, 0);
    const cost = 110 + ownedFactoryCount * 22;

    if (playerCountry.treasury < cost) {
      addLog("Fabrika için para yetmiyor.");
      return;
    }

    updateCountry(selectedCountryId, (c) => ({
      ...c,
      treasury: c.treasury - cost,
    }));

    setTerritories((prev) =>
      prev.map((t) =>
        t.id === selectedTerritory.id ? { ...t, factories: t.factories + 1 } : t
      )
    );

    addLog(`${selectedTerritory.name} bölgesine yeni fabrika kuruldu.`);
  }

  function researchDays(type: UnitType, currentLevel: number) {
    const base = RESEARCH_BASE_DAYS[type][currentLevel];
    return Math.max(5, Math.ceil(base / (1 + playerFactories * 0.16)));
  }

  function startResearch(type: UnitType) {
    if (!selectedCountryId || !playerCountry) return;
    if (playerCountry.activeResearch) {
      addLog("Aynı anda sadece 1 araştırma yapılabilir.");
      return;
    }
    const currentLevel = playerCountry.tech[type];
    if (currentLevel >= 3) {
      addLog("Bu teknoloji maksimum seviyede.");
      return;
    }

    updateCountry(selectedCountryId, (c) => ({
      ...c,
      activeResearch: {
        category: type,
        level: currentLevel + 1,
        remainingDays: researchDays(type, currentLevel),
      },
    }));

    addLog(`${unitLabel(type)} teknolojisi araştırılmaya başlandı.`);
  }

  function improveRelations() {
    if (!selectedCountryId || !selectedTargetCountryId || !playerCountry) return;
    if (playerCountry.treasury < 40) {
      addLog("İlişki geliştirmek için 40 para gerekli.");
      return;
    }

    updateCountry(selectedCountryId, (c) => ({
      ...c,
      treasury: c.treasury - 40,
    }));
    setRelationsBoth(selectedCountryId, selectedTargetCountryId, 10);
    addLog(`${getCountryName(selectedTargetCountryId)} ile ilişkiler gelişti.`);
  }

  function insultCountry() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    setRelationsBoth(selectedCountryId, selectedTargetCountryId, -15);
    addLog(`${getCountryName(selectedTargetCountryId)} ülkesine hakaret edildi.`);
  }

  function offerAlliance() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    const relation = countries.find((c) => c.id === selectedCountryId)?.relations[selectedTargetCountryId] ?? 0;
    const accepted = relation >= 45 || Math.random() < relation / 100 + 0.12;
    if (accepted) {
      addAlliance(selectedCountryId, selectedTargetCountryId);
      addLog(`${getCountryName(selectedTargetCountryId)} müttefikliği kabul etti.`);
    } else {
      addLog(`${getCountryName(selectedTargetCountryId)} müttefikliği reddetti.`);
    }
  }

  function declareWarAction() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    declareWar(selectedCountryId, selectedTargetCountryId);
    addLog(`${getCountryName(selectedTargetCountryId)} ülkesine savaş ilan edildi.`);
  }

  function offerPeace() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    const occupied = territories.filter(
      (t) =>
        t.originalOwnerId === selectedTargetCountryId &&
        t.ownerCountryId === selectedCountryId
    ).length;

    const relation = countries.find((c) => c.id === selectedCountryId)?.relations[selectedTargetCountryId] ?? 0;
    const accepted = occupied > 0 || relation > 25 || Math.random() < 0.28;

    if (accepted) {
      makePeace(selectedCountryId, selectedTargetCountryId);
      addLog(`${getCountryName(selectedTargetCountryId)} barışı kabul etti.`);
    } else {
      addLog(`${getCountryName(selectedTargetCountryId)} barışı reddetti.`);
    }
  }

  function airStrike() {
    if (!selectedCountryId || !selectedTerritory || !selectedTargetCountryId || !playerCountry) return;
    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;
    if (!selectedTerritory.neighbors.includes(selectedTargetCountryId)) {
      addLog("Hava saldırısı için komşu ülke seçmelisin.");
      return;
    }
    if (!warWithTarget) {
      addLog("Hava saldırısı için savaş halinde olmalısın.");
      return;
    }
    if (selectedTerritory.units.aircraft <= 0) {
      addLog("Bu bölgede uçak yok.");
      return;
    }

    const airTech = playerCountry.tech.aircraft;
    const damage = 1 + airTech + Math.floor(Math.random() * 2);
    const target = territories.find((t) => t.id === selectedTargetCountryId);
    if (!target) return;

    setTerritories((prev) =>
      prev.map((t) =>
        t.id === target.id
          ? {
              ...t,
              units: {
                infantry: Math.max(0, t.units.infantry - damage),
                tank: Math.max(0, t.units.tank - Math.floor(damage / 2)),
                aircraft: Math.max(0, t.units.aircraft - (Math.random() < 0.35 ? 1 : 0)),
              },
            }
          : t
      )
    );

    addLog(`${selectedTerritory.name} bölgesinden ${target.name} bölgesine hava saldırısı yapıldı.`);
  }

  function resolveMove(task: MoveTask, countriesSnap: CountryState[], territoriesSnap: Territory[]) {
    const attacker = countriesSnap.find((c) => c.id === task.ownerCountryId);
    const target = territoriesSnap.find((t) => t.id === task.toTerritoryId);
    if (!attacker || !target) return;

    if (!task.isAttack || target.ownerCountryId === task.ownerCountryId) {
      setTerritories((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                units: {
                  infantry: t.units.infantry + task.payload.infantry,
                  tank: t.units.tank + task.payload.tank,
                  aircraft: t.units.aircraft + task.payload.aircraft,
                },
              }
            : t
        )
      );
      return;
    }

    const defender = countriesSnap.find((c) => c.id === target.ownerCountryId);
    if (!defender) return;

    const attackerPower =
      task.payload.infantry * (3 + attacker.tech.infantry) +
      task.payload.tank * (8 + attacker.tech.tank * 2) * tankTerrainBonus(target.terrain) +
      task.payload.aircraft * (6 + attacker.tech.aircraft * 2);

    const defenderPower =
      target.units.infantry * (3 + defender.tech.infantry) +
      target.units.tank * (7 + defender.tech.tank * 2) +
      target.units.aircraft * (5 + defender.tech.aircraft * 2);

    const airAdvA = task.payload.aircraft > target.units.aircraft ? 1.12 : 1.0;
    const airAdvD = target.units.aircraft > task.payload.aircraft ? 1.08 : 1.0;
    const terrainBuff = terrainDefenseBonus(target.terrain);

    const finalAttack = attackerPower * airAdvA * (0.9 + Math.random() * 0.35);
    const finalDefense = defenderPower * airAdvD * terrainBuff * (0.92 + Math.random() * 0.33);

    const attackerWins = finalAttack >= finalDefense;

    if (attackerWins) {
      const survivors: UnitCounts = {
        infantry: Math.max(1, Math.floor(task.payload.infantry * 0.62)),
        tank: Math.max(0, Math.floor(task.payload.tank * 0.72)),
        aircraft: Math.max(0, Math.floor(task.payload.aircraft * 0.8)),
      };

      setTerritories((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                ownerCountryId: task.ownerCountryId,
                units: survivors,
              }
            : t
        )
      );

      addLog(`${attacker.name}, ${target.name} bölgesini ele geçirdi.`);
    } else {
      const defenderRemain: UnitCounts = {
        infantry: Math.max(0, target.units.infantry - Math.floor(task.payload.infantry * 0.5)),
        tank: Math.max(0, target.units.tank - Math.floor(task.payload.tank * 0.35)),
        aircraft: Math.max(0, target.units.aircraft - Math.floor(task.payload.aircraft * 0.25)),
      };

      setTerritories((prev) =>
        prev.map((t) =>
          t.id === target.id ? { ...t, units: defenderRemain } : t
        )
      );

      addLog(`${attacker.name} saldırısı ${target.name} önünde durduruldu.`);
    }
  }

  function alive(territoriesList: Territory[], countryId: CountryId) {
    return territoriesList.some((t) => t.ownerCountryId === countryId);
  }

  function checkGameOver(nextTerritories: Territory[]) {
    if (!selectedCountryId) return;

    if (!alive(nextTerritories, selectedCountryId)) {
      setGameOver({ winner: false, reason: "Tüm topraklarını kaybettin." });
      setRunning(false);
      return;
    }

    if (nextTerritories.every((t) => t.ownerCountryId === selectedCountryId)) {
      setGameOver({ winner: true, reason: "Avrupa’daki tüm bölgeleri ele geçirdin." });
      setRunning(false);
    }
  }

  function runAi(countriesSnap: CountryState[], territoriesSnap: Territory[]) {
    if (!selectedCountryId) return;

    let nextCountries = [...countriesSnap];
    let nextTerritories = [...territoriesSnap];
    const playerId = selectedCountryId;

    for (const ai of nextCountries) {
      if (ai.id === playerId) continue;
      if (!alive(nextTerritories, ai.id)) continue;

      const relation = ai.relations[playerId];
      const aiOwned = nextTerritories.filter((t) => t.ownerCountryId === ai.id);
      const aiFac =
        aiOwned.reduce((s, t) => s + t.factories, 0) + ai.baseFactories;
      const aiIncome = Math.floor(
        aiOwned.length * 2 +
          aiOwned.reduce((s, t) => s + t.economy, 0) * 0.35 +
          aiFac * 1.2
      );

      if (relation <= -35 && !ai.atWarWith.includes(playerId) && Math.random() < 0.18) {
        nextCountries = nextCountries.map((c) => {
          if (c.id === ai.id) return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, playerId])) };
          if (c.id === playerId) return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, ai.id])) };
          return c;
        });
        addLog(`${ai.name}, sana savaş ilan etti.`);
      }

      if (relation >= 50 && !ai.allies.includes(playerId) && Math.random() < 0.12) {
        nextCountries = nextCountries.map((c) => {
          if (c.id === ai.id) return { ...c, allies: Array.from(new Set([...c.allies, playerId])) };
          if (c.id === playerId) return { ...c, allies: Array.from(new Set([...c.allies, ai.id])) };
          return c;
        });
        addLog(`${ai.name}, seninle müttefik oldu.`);
      }

      const aiNow = nextCountries.find((c) => c.id === ai.id)!;
      const discount = Math.min(aiFac * 0.025, 0.35);
      const infCost = Math.ceil(35 * (1 - discount));

      if (aiNow.treasury >= infCost && Math.random() < 0.42 && aiOwned.length > 0) {
        const buildTarget = aiOwned[Math.floor(Math.random() * aiOwned.length)];
        nextCountries = nextCountries.map((c) =>
          c.id === ai.id ? { ...c, treasury: c.treasury - infCost } : c
        );
        nextTerritories = nextTerritories.map((t) =>
          t.id === buildTarget.id
            ? { ...t, units: { ...t.units, infantry: t.units.infantry + 1 } }
            : t
        );
      }

      const aiWarTargetTerritory = aiOwned.find((t) =>
        t.neighbors.some((n) => {
          const neigh = nextTerritories.find((x) => x.id === n);
          return neigh && neigh.ownerCountryId !== ai.id && aiNow.atWarWith.includes(neigh.ownerCountryId);
        })
      );

      if (aiWarTargetTerritory) {
        const targetId = aiWarTargetTerritory.neighbors.find((n) => {
          const neigh = nextTerritories.find((x) => x.id === n);
          return neigh && neigh.ownerCountryId !== ai.id && aiNow.atWarWith.includes(neigh.ownerCountryId);
        });

        if (targetId) {
          const sendInf = Math.max(1, Math.floor(aiWarTargetTerritory.units.infantry / 2));
          const sendTank = aiWarTargetTerritory.units.tank > 0 ? 1 : 0;
          const sendAir = aiWarTargetTerritory.units.aircraft > 0 ? 1 : 0;

          if (sendInf + sendTank + sendAir > 0) {
            nextTerritories = nextTerritories.map((t) =>
              t.id === aiWarTargetTerritory.id
                ? {
                    ...t,
                    units: {
                      infantry: t.units.infantry - sendInf,
                      tank: t.units.tank - sendTank,
                      aircraft: t.units.aircraft - sendAir,
                    },
                  }
                : t
            );

            setMoveTasks((prev) => [
              ...prev,
              {
                id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                ownerCountryId: ai.id,
                fromTerritoryId: aiWarTargetTerritory.id,
                toTerritoryId: targetId,
                payload: { infantry: sendInf, tank: sendTank, aircraft: sendAir },
                remainingDays: sendAir > 0 ? 1 : sendTank > 0 ? 3 : 2,
                isAttack: true,
              },
            ]);

            addLog(`${ai.name}, ${aiWarTargetTerritory.name} üzerinden saldırı başlattı.`);
          }
        }
      }

      if (!aiNow.activeResearch && Math.random() < 0.22) {
        const choices: UnitType[] = ["infantry", "tank", "aircraft"];
        const pick = choices[Math.floor(Math.random() * choices.length)];
        const currentLevel = aiNow.tech[pick];
        if (currentLevel < 3) {
          const base = RESEARCH_BASE_DAYS[pick][currentLevel];
          const days = Math.max(5, Math.ceil(base / (1 + aiFac * 0.16)));
          nextCountries = nextCountries.map((c) =>
            c.id === ai.id
              ? {
                  ...c,
                  activeResearch: {
                    category: pick,
                    level: currentLevel + 1,
                    remainingDays: days,
                  },
                }
              : c
          );
        }
      }

      // small passive economic effect to stop AI from stalling
      nextCountries = nextCountries.map((c) =>
        c.id === ai.id ? { ...c, treasury: c.treasury + Math.max(0, Math.floor(aiIncome * 0.05)) } : c
      );
    }

    setCountries(nextCountries);
    setTerritories(nextTerritories);
  }

  function tickOneDay() {
    const snapCountries = stateRef.current?.countries ?? countries;
    const snapTerritories = stateRef.current?.territories ?? territories;
    const snapTasks = stateRef.current?.moveTasks ?? moveTasks;

    setDay((d) => d + 1);

    const nextCountries = snapCountries.map((c) => {
      const owned = snapTerritories.filter((t) => t.ownerCountryId === c.id);
      const fac = owned.reduce((s, t) => s + t.factories, 0) + c.baseFactories;
      const income = Math.floor(
        owned.length * 2 + owned.reduce((s, t) => s + t.economy, 0) * 0.35 + fac * 1.2
      );

      let next = { ...c, treasury: c.treasury + income };

      if (next.activeResearch) {
        const rem = next.activeResearch.remainingDays - 1;
        if (rem <= 0) {
          const { category, level } = next.activeResearch;
          next = {
            ...next,
            tech: {
              ...next.tech,
              [category]: level,
            },
            activeResearch: null,
          };
          addLog(`${next.name} için ${unitLabel(category)} teknoloji seviye ${level} tamamlandı.`);
        } else {
          next = {
            ...next,
            activeResearch: {
              ...next.activeResearch,
              remainingDays: rem,
            },
          };
        }
      }

      return next;
    });

    setCountries(nextCountries);

    const moved = snapTasks.map((m) => ({ ...m, remainingDays: m.remainingDays - 1 }));
    const arrivals = moved.filter((m) => m.remainingDays <= 0);
    const staying = moved.filter((m) => m.remainingDays > 0);
    setMoveTasks(staying);

    arrivals.forEach((task) => resolveMove(task, nextCountries, snapTerritories));

    const maybeLatestTerritories = stateRef.current?.territories ?? snapTerritories;
    checkGameOver(maybeLatestTerritories);

    if ((day + 1) % 5 === 0) {
      runAi(nextCountries, maybeLatestTerritories);
    }
  }

  useEffect(() => {
    if (!running || !selectedCountryId || gameOver) return;
    const timer = setInterval(() => {
      tickOneDay();
    }, 1000);
    return () => clearInterval(timer);
  }, [running, selectedCountryId, gameOver, day]);

  useEffect(() => {
    if (!mounted || !selectedCountryId) return;
    try {
      const payload: SaveState = {
        countries,
        territories,
        selectedCountryId,
        selectedTerritoryId,
        selectedTargetCountryId,
        panelMode,
        day,
        eventLog,
        moveTasks,
        gameOver,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {}
  }, [
    mounted,
    countries,
    territories,
    selectedCountryId,
    selectedTerritoryId,
    selectedTargetCountryId,
    panelMode,
    day,
    eventLog,
    moveTasks,
    gameOver,
  ]);

  if (!selectedCountryId) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-extrabold text-indigo-300">🌍 Europa War</h1>
          <p className="mt-3 text-slate-400">
            Daha geniş Avrupa haritası, daha yavaş ekonomi, daha etkili fabrika sistemi.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <svg viewBox="0 0 1160 620" className="h-auto w-full">
              {territories.map((t) => (
                <g key={t.id}>
                  <path
                    d={t.polygon}
                    fill={getCountryColor(t.ownerCountryId)}
                    stroke="#0f172a"
                    strokeWidth="2.5"
                    className="cursor-pointer transition-opacity hover:opacity-85"
                    onClick={() => selectStartingCountry(t.id)}
                  />
                  <text
                    x={t.labelX}
                    y={t.labelY}
                    textAnchor="middle"
                    fontSize="11"
                    fill="white"
                    fontWeight="700"
                    style={{ pointerEvents: "none" }}
                  >
                    {t.name}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={loadGame}
              className="rounded-xl bg-slate-800 px-4 py-2 hover:bg-slate-700"
            >
              Kayıt Yükle
            </button>
            <button
              onClick={resetGame}
              className="rounded-xl bg-rose-700 px-4 py-2 hover:bg-rose-800"
            >
              Sıfırla
            </button>
          </div>
        </div>
      </main>
    );
  }

  const canAirStrikeNow =
    !!selectedCountryId &&
    !!selectedTerritory &&
    !!selectedTargetCountryId &&
    selectedTerritory.ownerCountryId === selectedCountryId &&
    selectedTerritory.neighbors.includes(selectedTargetCountryId) &&
    selectedTerritory.units.aircraft > 0 &&
    warWithTarget;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
              {formatDate(day)}
            </div>
            <button
              onClick={() => setRunning((v) => !v)}
              disabled={!!gameOver}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
            >
              {running ? "Durdur" : "Başlat"}
            </button>
            <button
              onClick={saveGame}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            >
              Kaydet
            </button>
            <button
              onClick={loadGame}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            >
              Yükle
            </button>
            <button
              onClick={resetGame}
              className="rounded-xl bg-rose-700 px-4 py-2 text-sm hover:bg-rose-800"
            >
              Yeni Oyun
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="rounded-xl bg-slate-800 px-3 py-2">
              Para: {playerCountry?.treasury ?? 0}
            </div>
            <div className="rounded-xl bg-slate-800 px-3 py-2">
              Gelir/Gün: {playerIncome}
            </div>
            <div className="rounded-xl bg-slate-800 px-3 py-2">
              Ekonomi: {playerEconomy}
            </div>
            <div className="rounded-xl bg-slate-800 px-3 py-2">
              Fabrika: {playerFactories}
            </div>
            <div className="rounded-xl bg-slate-800 px-3 py-2">
              Toprak: {ownedTerritories.length}/{territories.length}
            </div>
            <div className="rounded-xl bg-slate-800 px-3 py-2">
              Kapasite: {playerUsed}/{playerCap}
            </div>

            <button
              onClick={() => setPanelMode("tech")}
              className="rounded-xl bg-emerald-600 px-3 py-2 hover:bg-emerald-700"
            >
              Teknoloji
            </button>
            <button
              onClick={() => setPanelMode("economy")}
              className="rounded-xl bg-amber-600 px-3 py-2 hover:bg-amber-700"
            >
              Ekonomi
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {countries
              .filter((c) => c.id !== selectedCountryId)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedTargetCountryId(c.id);
                    setPanelMode("country");
                  }}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: c.color }}
                >
                  {c.name}
                </button>
              ))}
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#08111f] p-3">
            <svg viewBox="0 0 1160 620" className="h-auto w-full">
              {moveTasks.map((task) => {
                const from = territories.find((t) => t.id === task.fromTerritoryId);
                const to = territories.find((t) => t.id === task.toTerritoryId);
                if (!from || !to) return null;
                const total = task.payload.aircraft > 0 ? 1 : task.payload.tank > 0 ? 3 : 2;
                const ratio = clamp((total - task.remainingDays) / total, 0, 1);
                const x = from.labelX + (to.labelX - from.labelX) * ratio;
                const y = from.labelY + (to.labelY - from.labelY) * ratio;

                return (
                  <g key={task.id}>
                    <line
                      x1={from.labelX}
                      y1={from.labelY}
                      x2={to.labelX}
                      y2={to.labelY}
                      stroke="rgba(255,255,255,0.18)"
                      strokeDasharray="5 4"
                    />
                    <circle cx={x} cy={y} r="10" fill={getCountryColor(task.ownerCountryId)} />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize="9"
                      fill="white"
                      fontWeight="700"
                    >
                      {task.remainingDays}
                    </text>
                  </g>
                );
              })}

              {territories.map((t) => (
                <g key={t.id}>
                  <path
                    d={t.polygon}
                    fill={getCountryColor(t.ownerCountryId)}
                    stroke={selectedTerritoryId === t.id ? "#ffffff" : "#0f172a"}
                    strokeWidth={selectedTerritoryId === t.id ? 4 : 2.5}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                    onClick={() => onTerritoryClick(t.id)}
                  />
                  <text
                    x={t.labelX}
                    y={t.labelY - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fill="white"
                    fontWeight="800"
                    style={{ pointerEvents: "none" }}
                  >
                    {t.name}
                  </text>
                  <text
                    x={t.labelX}
                    y={t.labelY + 10}
                    textAnchor="middle"
                    fontSize="9"
                    fill="rgba(255,255,255,0.95)"
                    fontWeight="700"
                    style={{ pointerEvents: "none" }}
                  >
                    A:{t.units.infantry} T:{t.units.tank} U:{t.units.aircraft}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          {panelMode === "territory" && selectedTerritory && (
            <div>
              <h2 className="text-xl font-bold text-indigo-300">{selectedTerritory.name}</h2>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>Sahip: {getCountryName(selectedTerritory.ownerCountryId)}</div>
                <div>Arazi: {selectedTerritory.terrain}</div>
                <div>Ekonomi: {selectedTerritory.economy}</div>
                <div>Fabrika: {selectedTerritory.factories}</div>
                <div>
                  Birlikler — Asker: {selectedTerritory.units.infantry} / Tank: {selectedTerritory.units.tank} / Uçak: {selectedTerritory.units.aircraft}
                </div>
              </div>

              {selectedTerritory.ownerCountryId === selectedCountryId && (
                <>
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={() => produceUnit("infantry")}
                      className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Asker bas ({unitCost("infantry")})
                    </button>
                    <button
                      onClick={() => produceUnit("tank")}
                      className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Tank bas ({unitCost("tank")}) — min 6 fabrika
                    </button>
                    <button
                      onClick={() => produceUnit("aircraft")}
                      className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Uçak bas ({unitCost("aircraft")}) — min 9 fabrika
                    </button>
                    <button
                      onClick={buildFactory}
                      className="w-full rounded-xl bg-amber-700 px-3 py-2 hover:bg-amber-800"
                    >
                      Fabrika kur
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-800 p-3">
                    <div className="font-semibold text-white">Hareket / Saldırı</div>

                    {!moveDraft || moveDraft.sourceTerritoryId !== selectedTerritory.id ? (
                      <button
                        onClick={startMoveMode}
                        className="mt-3 w-full rounded-xl bg-indigo-600 px-3 py-2 hover:bg-indigo-700"
                      >
                        Hareket modu aç
                      </button>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Asker</label>
                            <input
                              type="number"
                              min={0}
                              max={selectedTerritory.units.infantry}
                              value={moveDraft.infantry}
                              onChange={(e) =>
                                setMoveDraft({
                                  ...moveDraft,
                                  infantry: clamp(Number(e.target.value) || 0, 0, selectedTerritory.units.infantry),
                                })
                              }
                              className="w-full rounded-lg bg-slate-900 px-2 py-2 text-sm outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Tank</label>
                            <input
                              type="number"
                              min={0}
                              max={selectedTerritory.units.tank}
                              value={moveDraft.tank}
                              onChange={(e) =>
                                setMoveDraft({
                                  ...moveDraft,
                                  tank: clamp(Number(e.target.value) || 0, 0, selectedTerritory.units.tank),
                                })
                              }
                              className="w-full rounded-lg bg-slate-900 px-2 py-2 text-sm outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Uçak</label>
                            <input
                              type="number"
                              min={0}
                              max={selectedTerritory.units.aircraft}
                              value={moveDraft.aircraft}
                              onChange={(e) =>
                                setMoveDraft({
                                  ...moveDraft,
                                  aircraft: clamp(Number(e.target.value) || 0, 0, selectedTerritory.units.aircraft),
                                })
                              }
                              className="w-full rounded-lg bg-slate-900 px-2 py-2 text-sm outline-none"
                            />
                          </div>
                        </div>

                        <div className="rounded-xl bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
                          Şimdi komşu ülkeye tıkla.
                        </div>

                        <button
                          onClick={cancelMoveMode}
                          className="w-full rounded-xl bg-slate-700 px-3 py-2 hover:bg-slate-600"
                        >
                          Hareketi iptal et
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedTerritory.ownerCountryId !== selectedCountryId && (
                <div className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  Bu bölge başka bir ülkeye ait.
                </div>
              )}
            </div>
          )}

          {panelMode === "country" && targetCountry && (
            <div>
              <h2 className="text-xl font-bold text-indigo-300">{targetCountry.name}</h2>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>İlişki: {relationToTarget}</div>
                <div>Savaş: {warWithTarget ? "Var" : "Yok"}</div>
                <div>
                  Müttefiklik: {selectedCountryId && countries.find((c) => c.id === selectedCountryId)?.allies.includes(targetCountry.id) ? "Müttefik" : "Yok"}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <button
                  onClick={declareWarAction}
                  className="w-full rounded-xl bg-rose-600 px-3 py-2 hover:bg-rose-700"
                >
                  Savaş ilan et
                </button>
                <button
                  onClick={offerAlliance}
                  className="w-full rounded-xl bg-emerald-600 px-3 py-2 hover:bg-emerald-700"
                >
                  Müttefik ol
                </button>
                <button
                  onClick={improveRelations}
                  className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                >
                  İlişki geliştir (40)
                </button>
                <button
                  onClick={insultCountry}
                  className="w-full rounded-xl bg-orange-600 px-3 py-2 hover:bg-orange-700"
                >
                  Hakaret et
                </button>
                <button
                  onClick={offerPeace}
                  className="w-full rounded-xl bg-cyan-600 px-3 py-2 hover:bg-cyan-700"
                >
                  Barış teklif et
                </button>
                <button
                  onClick={airStrike}
                  disabled={!canAirStrikeNow}
                  className="w-full rounded-xl bg-sky-600 px-3 py-2 hover:bg-sky-700 disabled:opacity-40"
                >
                  Hava saldırısı
                </button>
              </div>
            </div>
          )}

          {panelMode === "tech" && playerCountry && (
            <div>
              <h2 className="text-xl font-bold text-emerald-300">Teknoloji</h2>

              <div className="mt-3 rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300">
                {playerCountry.activeResearch ? (
                  <div>
                    Araştırma: {unitLabel(playerCountry.activeResearch.category)} • Seviye {playerCountry.activeResearch.level} • Kalan {playerCountry.activeResearch.remainingDays} gün
                  </div>
                ) : (
                  <div>Aktif araştırma yok</div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {(["infantry", "tank", "aircraft"] as UnitType[]).map((type) => {
                  const level = playerCountry.tech[type];
                  const maxed = level >= 3;

                  return (
                    <div key={type} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="font-semibold text-white">
                        {unitLabel(type)} • Seviye {level}/3
                      </div>
                      {!maxed ? (
                        <>
                          <div className="mt-1 text-sm text-slate-400">
                            Sonraki süre: {researchDays(type, level)} gün
                          </div>
                          <button
                            onClick={() => startResearch(type)}
                            disabled={!!playerCountry.activeResearch}
                            className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Araştır
                          </button>
                        </>
                      ) : (
                        <div className="mt-2 text-sm text-emerald-300">Maksimum seviye</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {panelMode === "economy" && playerCountry && (
            <div>
              <h2 className="text-xl font-bold text-amber-300">Ekonomi</h2>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>Para: {playerCountry.treasury}</div>
                <div>Günlük gelir: {playerIncome}</div>
                <div>Toplam ekonomi: {playerEconomy}</div>
                <div>Toplam fabrika: {playerFactories}</div>
                <div>Üretim indirimi: %{Math.round(productionDiscount * 100)}</div>
                <div>Kapasite katkısı: +{playerFactories * 2}</div>
              </div>

              <div className="mt-4 space-y-2">
                {ownedTerritories.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTerritoryId(t.id);
                      setPanelMode("territory");
                    }}
                    className="w-full rounded-xl bg-slate-800 px-3 py-2 text-left hover:bg-slate-700"
                  >
                    <div className="font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-slate-400">
                      Ekonomi: {t.economy} • Fabrika: {t.factories}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {panelMode === null && (
            <div>
              <h2 className="text-xl font-bold text-indigo-300">Kontrol Paneli</h2>
              <p className="mt-3 text-sm text-slate-400">
                Haritadan ülkeye tıkla. Kendi bölgeni seçip asker bas, fabrika kur, komşu ülkelere saldır veya diplomasi yap.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-bold text-slate-100">Olay Günlüğü</h2>
          <div className="space-y-2">
            {eventLog.length === 0 && (
              <div className="text-sm text-slate-400">Henüz olay yok.</div>
            )}
            {eventLog.map((item, i) => (
              <div
                key={`${item}-${i}`}
                className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center">
            <div className="text-4xl">{gameOver.winner ? "🏆" : "💀"}</div>
            <h2 className="mt-4 text-3xl font-extrabold text-white">
              {gameOver.winner ? "Zafer!" : "Yenildin"}
            </h2>
            <p className="mt-3 text-slate-300">{gameOver.reason}</p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={resetGame}
                className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-700"
              >
                Yeni Oyun
              </button>
              <button
                onClick={loadGame}
                className="rounded-xl bg-slate-800 px-5 py-3 font-semibold hover:bg-slate-700"
              >
                Kaydı Yükle
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
