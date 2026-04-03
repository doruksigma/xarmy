"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UnitType = "infantry" | "tank" | "aircraft";

type CountryId =
  | "turkey"
  | "greece"
  | "bulgaria"
  | "romania"
  | "serbia"
  | "hungary"
  | "germany"
  | "france"
  | "italy"
  | "spain";

type TerrainType = "plains" | "mountain" | "urban" | "coastal";

type PanelMode = "territory" | "country" | "economy" | "tech" | null;

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
  running: boolean;
  day: number;
  eventLog: string[];
  moveTasks: MoveTask[];
  gameOver: {
    winner: boolean;
    reason: string;
  } | null;
}

const SAVE_KEY = "europa-war-save-v2";

const COUNTRY_IDS: CountryId[] = [
  "spain",
  "france",
  "germany",
  "italy",
  "hungary",
  "serbia",
  "romania",
  "bulgaria",
  "greece",
  "turkey",
];

const EMPTY_UNITS: UnitCounts = {
  infantry: 0,
  tank: 0,
  aircraft: 0,
};

function makeRelations(self: CountryId): Record<CountryId, number> {
  return {
    turkey: self === "turkey" ? 100 : 0,
    greece: self === "greece" ? 100 : 0,
    bulgaria: self === "bulgaria" ? 100 : 0,
    romania: self === "romania" ? 100 : 0,
    serbia: self === "serbia" ? 100 : 0,
    hungary: self === "hungary" ? 100 : 0,
    germany: self === "germany" ? 100 : 0,
    france: self === "france" ? 100 : 0,
    italy: self === "italy" ? 100 : 0,
    spain: self === "spain" ? 100 : 0,
  };
}

const INITIAL_COUNTRIES: CountryState[] = [
  {
    id: "spain",
    name: "İspanya",
    color: "#eab308",
    treasury: 1100,
    baseFactories: 3,
    relations: makeRelations("spain"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "france",
    name: "Fransa",
    color: "#0ea5e9",
    treasury: 1300,
    baseFactories: 4,
    relations: makeRelations("france"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "germany",
    name: "Almanya",
    color: "#64748b",
    treasury: 1500,
    baseFactories: 5,
    relations: makeRelations("germany"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "italy",
    name: "İtalya",
    color: "#10b981",
    treasury: 1200,
    baseFactories: 3,
    relations: makeRelations("italy"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "hungary",
    name: "Macaristan",
    color: "#f97316",
    treasury: 900,
    baseFactories: 2,
    relations: makeRelations("hungary"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "serbia",
    name: "Sırbistan",
    color: "#a855f7",
    treasury: 850,
    baseFactories: 2,
    relations: makeRelations("serbia"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "romania",
    name: "Romanya",
    color: "#f59e0b",
    treasury: 950,
    baseFactories: 2,
    relations: makeRelations("romania"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "bulgaria",
    name: "Bulgaristan",
    color: "#22c55e",
    treasury: 850,
    baseFactories: 2,
    relations: makeRelations("bulgaria"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "greece",
    name: "Yunanistan",
    color: "#3b82f6",
    treasury: 900,
    baseFactories: 2,
    relations: makeRelations("greece"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "turkey",
    name: "Türkiye",
    color: "#ef4444",
    treasury: 1000,
    baseFactories: 3,
    relations: makeRelations("turkey"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
];

const INITIAL_TERRITORIES: Territory[] = [
  {
    id: "spain",
    name: "İspanya",
    originalOwnerId: "spain",
    ownerCountryId: "spain",
    economy: 8,
    factories: 2,
    terrain: "plains",
    neighbors: ["france"],
    units: { infantry: 6, tank: 1, aircraft: 1 },
    polygon:
      "M 60 330 L 170 300 L 220 330 L 210 395 L 140 430 L 80 410 L 50 370 Z",
    labelX: 135,
    labelY: 360,
  },
  {
    id: "france",
    name: "Fransa",
    originalOwnerId: "france",
    ownerCountryId: "france",
    economy: 10,
    factories: 2,
    terrain: "urban",
    neighbors: ["spain", "germany", "italy"],
    units: { infantry: 7, tank: 1, aircraft: 1 },
    polygon:
      "M 205 235 L 320 220 L 360 255 L 338 330 L 260 350 L 218 330 L 170 300 L 190 255 Z",
    labelX: 265,
    labelY: 285,
  },
  {
    id: "germany",
    name: "Almanya",
    originalOwnerId: "germany",
    ownerCountryId: "germany",
    economy: 11,
    factories: 3,
    terrain: "urban",
    neighbors: ["france", "italy", "hungary"],
    units: { infantry: 8, tank: 2, aircraft: 1 },
    polygon:
      "M 350 170 L 445 160 L 485 210 L 468 275 L 402 290 L 355 255 L 320 220 Z",
    labelX: 405,
    labelY: 220,
  },
  {
    id: "italy",
    name: "İtalya",
    originalOwnerId: "italy",
    ownerCountryId: "italy",
    economy: 9,
    factories: 2,
    terrain: "mountain",
    neighbors: ["france", "germany", "serbia"],
    units: { infantry: 6, tank: 1, aircraft: 1 },
    polygon:
      "M 320 305 L 380 300 L 420 340 L 410 395 L 370 455 L 345 430 L 360 380 L 325 350 Z",
    labelX: 372,
    labelY: 360,
  },
  {
    id: "hungary",
    name: "Macaristan",
    originalOwnerId: "hungary",
    ownerCountryId: "hungary",
    economy: 6,
    factories: 1,
    terrain: "plains",
    neighbors: ["germany", "serbia", "romania"],
    units: { infantry: 5, tank: 1, aircraft: 0 },
    polygon:
      "M 480 220 L 555 215 L 585 250 L 560 285 L 495 286 L 468 275 Z",
    labelX: 528,
    labelY: 250,
  },
  {
    id: "serbia",
    name: "Sırbistan",
    originalOwnerId: "serbia",
    ownerCountryId: "serbia",
    economy: 5,
    factories: 1,
    terrain: "mountain",
    neighbors: ["italy", "hungary", "bulgaria"],
    units: { infantry: 4, tank: 0, aircraft: 0 },
    polygon:
      "M 485 300 L 550 295 L 578 330 L 550 365 L 492 356 L 468 320 Z",
    labelX: 528,
    labelY: 330,
  },
  {
    id: "romania",
    name: "Romanya",
    originalOwnerId: "romania",
    ownerCountryId: "romania",
    economy: 7,
    factories: 1,
    terrain: "plains",
    neighbors: ["hungary", "bulgaria", "turkey"],
    units: { infantry: 5, tank: 1, aircraft: 0 },
    polygon:
      "M 585 210 L 685 205 L 710 255 L 675 300 L 610 292 L 560 285 Z",
    labelX: 636,
    labelY: 247,
  },
  {
    id: "bulgaria",
    name: "Bulgaristan",
    originalOwnerId: "bulgaria",
    ownerCountryId: "bulgaria",
    economy: 5,
    factories: 1,
    terrain: "plains",
    neighbors: ["serbia", "romania", "greece", "turkey"],
    units: { infantry: 4, tank: 0, aircraft: 0 },
    polygon:
      "M 575 315 L 652 308 L 680 343 L 650 382 L 575 380 L 548 345 Z",
    labelX: 615,
    labelY: 345,
  },
  {
    id: "greece",
    name: "Yunanistan",
    originalOwnerId: "greece",
    ownerCountryId: "greece",
    economy: 6,
    factories: 1,
    terrain: "coastal",
    neighbors: ["bulgaria", "turkey"],
    units: { infantry: 4, tank: 0, aircraft: 1 },
    polygon:
      "M 555 392 L 625 392 L 650 440 L 615 485 L 560 465 L 535 425 Z",
    labelX: 596,
    labelY: 437,
  },
  {
    id: "turkey",
    name: "Türkiye",
    originalOwnerId: "turkey",
    ownerCountryId: "turkey",
    economy: 10,
    factories: 2,
    terrain: "coastal",
    neighbors: ["romania", "bulgaria", "greece"],
    units: { infantry: 7, tank: 1, aircraft: 1 },
    polygon:
      "M 690 310 L 845 320 L 885 370 L 820 430 L 690 420 L 650 382 L 680 343 Z",
    labelX: 770,
    labelY: 367,
  },
];

const RESEARCH_BASE_DAYS: Record<UnitType, [number, number, number]> = {
  infantry: [20, 35, 50],
  tank: [24, 40, 56],
  aircraft: [26, 44, 60],
};

function cloneUnits(units: UnitCounts): UnitCounts {
  return {
    infantry: units.infantry,
    tank: units.tank,
    aircraft: units.aircraft,
  };
}

function sumUnits(units: UnitCounts): number {
  return units.infantry + units.tank + units.aircraft;
}

function getCountryName(id: CountryId, countries: CountryState[]): string {
  return countries.find((c) => c.id === id)?.name ?? id;
}

function getCountryColor(id: CountryId, countries: CountryState[]): string {
  return countries.find((c) => c.id === id)?.color ?? "#475569";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatDate(dayOffset: number): string {
  const date = new Date(2025, 0, 1);
  date.setDate(date.getDate() + dayOffset);
  return date.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function terrainDefenseBonus(terrain: TerrainType): number {
  if (terrain === "mountain") return 1.3;
  if (terrain === "urban") return 1.2;
  if (terrain === "coastal") return 1.1;
  return 1.0;
}

function tankTerrainBonus(terrain: TerrainType): number {
  if (terrain === "plains") return 1.25;
  if (terrain === "urban") return 0.9;
  if (terrain === "mountain") return 0.7;
  return 1.0;
}

function formatUnitType(type: UnitType): string {
  if (type === "infantry") return "Asker";
  if (type === "tank") return "Tank";
  return "Uçak";
}

function ownedTerritories(territories: Territory[], countryId: CountryId): Territory[] {
  return territories.filter((t) => t.ownerCountryId === countryId);
}

function totalEconomy(territories: Territory[], countryId: CountryId): number {
  return ownedTerritories(territories, countryId).reduce((s, t) => s + t.economy, 0);
}

function totalFactories(
  territories: Territory[],
  countries: CountryState[],
  countryId: CountryId
): number {
  const territoryFactories = ownedTerritories(territories, countryId).reduce(
    (s, t) => s + t.factories,
    0
  );
  const country = countries.find((c) => c.id === countryId);
  return territoryFactories + (country?.baseFactories ?? 0);
}

function dailyIncome(territories: Territory[], countryId: CountryId): number {
  const owned = ownedTerritories(territories, countryId);
  return owned.length * 25 + owned.reduce((s, t) => s + t.economy * 4 + t.factories * 6, 0);
}

function manpowerCap(territories: Territory[], countryId: CountryId): number {
  return totalEconomy(territories, countryId) * 4;
}

function usedManpower(
  territories: Territory[],
  moveTasks: MoveTask[],
  countryId: CountryId
): number {
  const stationed = ownedTerritories(territories, countryId).reduce(
    (sum, t) => sum + t.units.infantry + t.units.tank * 2 + t.units.aircraft * 2,
    0
  );
  const moving = moveTasks
    .filter((m) => m.ownerCountryId === countryId)
    .reduce(
      (sum, m) =>
        sum +
        m.payload.infantry +
        m.payload.tank * 2 +
        m.payload.aircraft * 2,
      0
    );
  return stationed + moving;
}

function canCountryStillLive(territories: Territory[], countryId: CountryId): boolean {
  return territories.some((t) => t.ownerCountryId === countryId);
}

function createInitialState(): SaveState {
  return {
    countries: INITIAL_COUNTRIES,
    territories: INITIAL_TERRITORIES,
    selectedCountryId: null,
    selectedTerritoryId: null,
    selectedTargetCountryId: null,
    panelMode: null,
    running: false,
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
  const [running, setRunning] = useState(false);
  const [day, setDay] = useState(0);
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
      running,
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
    running,
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
        setRunning(false);
        setDay(parsed.day);
        setEventLog(parsed.eventLog ?? []);
        setMoveTasks(parsed.moveTasks ?? []);
        setGameOver(parsed.gameOver ?? null);
      }
    } catch {
      // ignore broken saves
    }
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

  const playerEconomy = useMemo(() => {
    if (!selectedCountryId) return 0;
    return totalEconomy(territories, selectedCountryId);
  }, [territories, selectedCountryId]);

  const playerFactories = useMemo(() => {
    if (!selectedCountryId) return 0;
    return totalFactories(territories, countries, selectedCountryId);
  }, [territories, countries, selectedCountryId]);

  const playerIncome = useMemo(() => {
    if (!selectedCountryId) return 0;
    return dailyIncome(territories, selectedCountryId);
  }, [territories, selectedCountryId]);

  const playerCap = useMemo(() => {
    if (!selectedCountryId) return 0;
    return manpowerCap(territories, selectedCountryId);
  }, [territories, selectedCountryId]);

  const playerUsed = useMemo(() => {
    if (!selectedCountryId) return 0;
    return usedManpower(territories, moveTasks, selectedCountryId);
  }, [territories, moveTasks, selectedCountryId]);

  const ownedCount = useMemo(() => {
    if (!selectedCountryId) return 0;
    return territories.filter((t) => t.ownerCountryId === selectedCountryId).length;
  }, [territories, selectedCountryId]);

  function addLog(message: string) {
    setEventLog((prev) => [`${formatDate(day)} • ${message}`, ...prev].slice(0, 30));
  }

  function resetGame() {
    const state = createInitialState();
    setCountries(state.countries);
    setTerritories(state.territories);
    setSelectedCountryId(state.selectedCountryId);
    setSelectedTerritoryId(state.selectedTerritoryId);
    setSelectedTargetCountryId(state.selectedTargetCountryId);
    setPanelMode(state.panelMode);
    setRunning(state.running);
    setDay(state.day);
    setEventLog(state.eventLog);
    setMoveTasks(state.moveTasks);
    setMoveDraft(null);
    setGameOver(null);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
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
        running: false,
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
        addLog("Kayıt bulunamadı.");
        return;
      }
      const parsed = JSON.parse(raw) as SaveState;
      setCountries(parsed.countries);
      setTerritories(parsed.territories);
      setSelectedCountryId(parsed.selectedCountryId);
      setSelectedTerritoryId(parsed.selectedTerritoryId);
      setSelectedTargetCountryId(parsed.selectedTargetCountryId);
      setPanelMode(parsed.panelMode);
      setRunning(false);
      setDay(parsed.day);
      setEventLog(parsed.eventLog ?? []);
      setMoveTasks(parsed.moveTasks ?? []);
      setMoveDraft(null);
      setGameOver(parsed.gameOver ?? null);
    } catch {
      addLog("Kayıt yüklenemedi.");
    }
  }

  function selectStartingCountry(countryId: CountryId) {
    setSelectedCountryId(countryId);
    setSelectedTerritoryId(countryId);
    setSelectedTargetCountryId(null);
    setPanelMode("territory");
    addLog(`${getCountryName(countryId, countries)} seçildi.`);
  }

  function updateCountry(
    countryId: CountryId,
    updater: (country: CountryState) => CountryState
  ) {
    setCountries((prev) => prev.map((c) => (c.id === countryId ? updater(c) : c)));
  }

  function setRelationsBoth(a: CountryId, b: CountryId, delta: number) {
    setCountries((prev) =>
      prev.map((country) => {
        if (country.id !== a && country.id !== b) return country;
        const other = country.id === a ? b : a;
        return {
          ...country,
          relations: {
            ...country.relations,
            [other]: clamp(country.relations[other] + delta, -100, 100),
          },
        };
      })
    );
  }

  function addWar(a: CountryId, b: CountryId) {
    setCountries((prev) =>
      prev.map((c) => {
        if (c.id === a) return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, b])) };
        if (c.id === b) return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, a])) };
        return c;
      })
    );
  }

  function removeWar(a: CountryId, b: CountryId) {
    setCountries((prev) =>
      prev.map((c) => {
        if (c.id === a) return { ...c, atWarWith: c.atWarWith.filter((id) => id !== b) };
        if (c.id === b) return { ...c, atWarWith: c.atWarWith.filter((id) => id !== a) };
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

  function onTerritoryClick(territoryId: CountryId) {
    const clicked = territories.find((t) => t.id === territoryId);
    if (!clicked) return;

    if (moveDraft) {
      const source = territories.find((t) => t.id === moveDraft.sourceTerritoryId);
      if (!source) {
        setMoveDraft(null);
        return;
      }
      if (!source.neighbors.includes(clicked.id)) {
        addLog("Sadece komşu ülkelere hareket edebilirsin.");
        return;
      }
      if (
        moveDraft.infantry <= 0 &&
        moveDraft.tank <= 0 &&
        moveDraft.aircraft <= 0
      ) {
        addLog("Hareket için en az 1 birlik seç.");
        return;
      }
      if (
        moveDraft.infantry > source.units.infantry ||
        moveDraft.tank > source.units.tank ||
        moveDraft.aircraft > source.units.aircraft
      ) {
        addLog("Seçilen birlik sayısı kaynak bölgede yok.");
        return;
      }

      const attack = clicked.ownerCountryId !== source.ownerCountryId;
      const sourceOwner = countries.find((c) => c.id === source.ownerCountryId);
      if (attack && !sourceOwner?.atWarWith.includes(clicked.ownerCountryId)) {
        addLog("Saldırı için önce savaş ilan et.");
        return;
      }

      const maxMoveDays = Math.max(
        moveDraft.infantry > 0 ? 2 : 0,
        moveDraft.tank > 0 ? 3 : 0,
        moveDraft.aircraft > 0 ? 1 : 0,
        1
      );

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
          remainingDays: maxMoveDays,
          isAttack: attack,
        },
      ]);

      addLog(
        `${source.name} bölgesinden ${clicked.name} bölgesine birlik gönderildi.`
      );
      setMoveDraft(null);
      return;
    }

    setSelectedTerritoryId(territoryId);
    setPanelMode("territory");

    if (selectedCountryId && clicked.ownerCountryId !== selectedCountryId) {
      setSelectedTargetCountryId(clicked.ownerCountryId);
    }
  }

  function produceUnit(type: UnitType) {
    if (!selectedCountryId || !selectedTerritory || !playerCountry) return;
    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;

    const price =
      type === "infantry" ? 100 :
      type === "tank" ? 300 : 500;

    const manpowerCost =
      type === "infantry" ? 1 : 2;

    if (playerCountry.treasury < price) {
      addLog("Yeterli para yok.");
      return;
    }

    if (playerUsed + manpowerCost > playerCap) {
      addLog("Birlik kapasitesi dolu.");
      return;
    }

    updateCountry(selectedCountryId, (c) => ({
      ...c,
      treasury: c.treasury - price,
    }));

    setTerritories((prev) =>
      prev.map((t) =>
        t.id === selectedTerritory.id
          ? {
              ...t,
              units: {
                ...t.units,
                [type]: t.units[type] + 1,
              },
            }
          : t
      )
    );

    addLog(`${selectedTerritory.name} bölgesinde ${formatUnitType(type)} üretildi.`);
  }

  function buildFactory() {
    if (!selectedCountryId || !selectedTerritory || !playerCountry) return;
    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;

    const ownedFactoryCount = ownedTerritories(territories, selectedCountryId).reduce(
      (sum, t) => sum + t.factories,
      0
    );

    const cost = 500 + ownedFactoryCount * 250;

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

  function startResearch(type: UnitType) {
    if (!selectedCountryId || !playerCountry) return;
    if (playerCountry.activeResearch) {
      addLog("Aynı anda sadece 1 teknoloji araştırabilirsin.");
      return;
    }

    const currentLevel = playerCountry.tech[type];
    if (currentLevel >= 3) {
      addLog("Bu teknoloji maksimum seviyede.");
      return;
    }

    const baseDays = RESEARCH_BASE_DAYS[type][currentLevel];
    const actual = Math.max(5, Math.ceil(baseDays / Math.max(playerFactories, 1)));

    updateCountry(selectedCountryId, (c) => ({
      ...c,
      activeResearch: {
        category: type,
        level: currentLevel + 1,
        remainingDays: actual,
      },
    }));

    addLog(`${formatUnitType(type)} teknoloji araştırması başladı.`);
  }

  function improveRelations() {
    if (!selectedCountryId || !selectedTargetCountryId || !playerCountry) return;
    if (playerCountry.treasury < 100) {
      addLog("İlişki geliştirmek için 100 para gerekir.");
      return;
    }
    updateCountry(selectedCountryId, (c) => ({ ...c, treasury: c.treasury - 100 }));
    setRelationsBoth(selectedCountryId, selectedTargetCountryId, 10);
    addLog(
      `${getCountryName(selectedTargetCountryId, countries)} ile ilişkiler gelişti.`
    );
  }

  function insultCountry() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    setRelationsBoth(selectedCountryId, selectedTargetCountryId, -15);
    addLog(`${getCountryName(selectedTargetCountryId, countries)} ülkesine hakaret edildi.`);
  }

  function offerAlliance() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    const relation =
      countries.find((c) => c.id === selectedCountryId)?.relations[selectedTargetCountryId] ?? 0;
    const accepted = relation >= 40 || Math.random() < relation / 100 + 0.15;
    if (accepted) {
      addAlliance(selectedCountryId, selectedTargetCountryId);
      addLog(
        `${getCountryName(selectedTargetCountryId, countries)} müttefikliği kabul etti.`
      );
    } else {
      addLog(
        `${getCountryName(selectedTargetCountryId, countries)} müttefikliği reddetti.`
      );
    }
  }

  function declareWarAction() {
    if (!selectedCountryId || !selectedTargetCountryId) return;
    addWar(selectedCountryId, selectedTargetCountryId);
    addLog(
      `${getCountryName(selectedTargetCountryId, countries)} ülkesine savaş ilan edildi.`
    );
  }

  function offerPeace() {
    if (!selectedCountryId || !selectedTargetCountryId) return;

    const occupiedEnemyTerritories = territories.filter(
      (t) =>
        t.originalOwnerId === selectedTargetCountryId &&
        t.ownerCountryId === selectedCountryId
    ).length;

    const relation =
      countries.find((c) => c.id === selectedCountryId)?.relations[selectedTargetCountryId] ?? 0;

    const accepted = occupiedEnemyTerritories > 0 || relation > 20 || Math.random() < 0.35;

    if (accepted) {
      removeWar(selectedCountryId, selectedTargetCountryId);
      addLog(`${getCountryName(selectedTargetCountryId, countries)} barışı kabul etti.`);
    } else {
      addLog(`${getCountryName(selectedTargetCountryId, countries)} barışı reddetti.`);
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

  function airStrike() {
    if (
      !selectedCountryId ||
      !selectedTerritory ||
      !selectedTargetCountryId ||
      !playerCountry
    ) return;

    if (selectedTerritory.ownerCountryId !== selectedCountryId) return;
    if (!selectedTerritory.neighbors.includes(selectedTargetCountryId)) {
      addLog("Hava saldırısı sadece komşu ülkeye yapılabilir.");
      return;
    }
    if (!playerCountry.atWarWith.includes(selectedTargetCountryId)) {
      addLog("Hava saldırısı için savaş halinde olmalısın.");
      return;
    }
    if (selectedTerritory.units.aircraft <= 0) {
      addLog("Hava saldırısı için uçak yok.");
      return;
    }

    const target = territories.find((t) => t.id === selectedTargetCountryId);
    if (!target) return;

    const airTech = playerCountry.tech.aircraft;
    const damageRoll = 1 + airTech + Math.floor(Math.random() * 3);

    const tankDamage = Math.min(target.units.tank, Math.floor(damageRoll / 2));
    const infantryDamage = Math.min(
      target.units.infantry,
      damageRoll + Math.floor(Math.random() * 2)
    );

    setTerritories((prev) =>
      prev.map((t) =>
        t.id === target.id
          ? {
              ...t,
              units: {
                ...t.units,
                infantry: Math.max(0, t.units.infantry - infantryDamage),
                tank: Math.max(0, t.units.tank - tankDamage),
              },
            }
          : t
      )
    );

    addLog(
      `${selectedTerritory.name} bölgesinden ${target.name} bölgesine hava saldırısı yapıldı.`
    );
  }

  function resolveBattle(task: MoveTask, currentCountries: CountryState[], currentTerritories: Territory[]) {
    const attacker = currentCountries.find((c) => c.id === task.ownerCountryId);
    const defenderTerritory = currentTerritories.find((t) => t.id === task.toTerritoryId);
    if (!attacker || !defenderTerritory) return;

    const defenderCountry = currentCountries.find((c) => c.id === defenderTerritory.ownerCountryId);
    if (!defenderCountry) return;

    if (!task.isAttack || defenderTerritory.ownerCountryId === task.ownerCountryId) {
      setTerritories((prev) =>
        prev.map((t) =>
          t.id === task.toTerritoryId
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

    const attackerInfTech = attacker.tech.infantry;
    const attackerTankTech = attacker.tech.tank;
    const attackerAirTech = attacker.tech.aircraft;

    const defenderInfTech = defenderCountry.tech.infantry;
    const defenderTankTech = defenderCountry.tech.tank;
    const defenderAirTech = defenderCountry.tech.aircraft;

    const attackerAirSup =
      task.payload.aircraft > defenderTerritory.units.aircraft ? 1.15 : 1.0;
    const defenderAirSup =
      defenderTerritory.units.aircraft > task.payload.aircraft ? 1.12 : 1.0;

    const attackerPowerBase =
      task.payload.infantry * (3 + attackerInfTech) +
      task.payload.tank * (7 + attackerTankTech * 2) * tankTerrainBonus(defenderTerritory.terrain) +
      task.payload.aircraft * (6 + attackerAirTech * 2);

    const defenderPowerBase =
      defenderTerritory.units.infantry * (3 + defenderInfTech) +
      defenderTerritory.units.tank * (6 + defenderTankTech * 2) +
      defenderTerritory.units.aircraft * (5 + defenderAirTech * 2);

    const attackerFactoryBuff =
      1 + (ownedTerritories(currentTerritories, task.ownerCountryId).reduce((s, t) => s + t.factories, 0) / 100);

    const defenderFactoryBuff =
      1 + (defenderTerritory.factories / 10);

    const defenseTerrainBuff = terrainDefenseBonus(defenderTerritory.terrain);

    const attackerRoll = 0.9 + Math.random() * 0.35;
    const defenderRoll = 0.9 + Math.random() * 0.35;

    const attackerPower =
      attackerPowerBase * attackerAirSup * attackerFactoryBuff * attackerRoll;

    const defenderPower =
      defenderPowerBase * defenderAirSup * defenseTerrainBuff * defenderFactoryBuff * defenderRoll;

    const attackerWin = attackerPower >= defenderPower;

    if (attackerWin) {
      const remainingInf = Math.max(1, Math.floor(task.payload.infantry * 0.65));
      const remainingTank = Math.max(0, Math.floor(task.payload.tank * 0.75));
      const remainingAir = Math.max(0, Math.floor(task.payload.aircraft * 0.8));

      setTerritories((prev) =>
        prev.map((t) =>
          t.id === defenderTerritory.id
            ? {
                ...t,
                ownerCountryId: task.ownerCountryId,
                units: {
                  infantry: remainingInf,
                  tank: remainingTank,
                  aircraft: remainingAir,
                },
              }
            : t
        )
      );

      addLog(
        `${attacker.name}, ${defenderTerritory.name} bölgesini ele geçirdi.`
      );
    } else {
      const defenderInfLeft = Math.max(
        0,
        defenderTerritory.units.infantry - Math.floor(task.payload.infantry * 0.45)
      );
      const defenderTankLeft = Math.max(
        0,
        defenderTerritory.units.tank - Math.floor(task.payload.tank * 0.35)
      );
      const defenderAirLeft = Math.max(
        0,
        defenderTerritory.units.aircraft - Math.floor(task.payload.aircraft * 0.35)
      );

      setTerritories((prev) =>
        prev.map((t) =>
          t.id === defenderTerritory.id
            ? {
                ...t,
                units: {
                  infantry: defenderInfLeft,
                  tank: defenderTankLeft,
                  aircraft: defenderAirLeft,
                },
              }
            : t
        )
      );

      addLog(
        `${attacker.name} saldırısı ${defenderTerritory.name} önünde başarısız oldu.`
      );
    }
  }

  function checkGameOver(nextTerritories: Territory[], playerId: CountryId | null) {
    if (!playerId) return;

    const playerAlive = canCountryStillLive(nextTerritories, playerId);
    const playerOwnsAll = nextTerritories.every((t) => t.ownerCountryId === playerId);

    if (!playerAlive) {
      setGameOver({
        winner: false,
        reason: "Tüm topraklarını kaybettin.",
      });
      setRunning(false);
      return;
    }

    if (playerOwnsAll) {
      setGameOver({
        winner: true,
        reason: "Avrupa’daki tüm bölgeleri ele geçirdin.",
      });
      setRunning(false);
    }
  }

  function runAiStep(currentCountries: CountryState[], currentTerritories: Territory[]) {
    if (!selectedCountryId) return;

    let nextCountries = [...currentCountries];
    let nextTerritories = [...currentTerritories];
    const playerId = selectedCountryId;

    for (const aiCountry of nextCountries) {
      if (aiCountry.id === playerId) continue;
      if (!canCountryStillLive(nextTerritories, aiCountry.id)) continue;

      const relation = aiCountry.relations[playerId];
      const latestAi = nextCountries.find((c) => c.id === aiCountry.id)!;

      if (relation <= -35 && !latestAi.atWarWith.includes(playerId) && Math.random() < 0.22) {
        nextCountries = nextCountries.map((c) => {
          if (c.id === aiCountry.id) {
            return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, playerId])) };
          }
          if (c.id === playerId) {
            return { ...c, atWarWith: Array.from(new Set([...c.atWarWith, aiCountry.id])) };
          }
          return c;
        });
        addLog(`${aiCountry.name}, sana savaş ilan etti.`);
      }

      if (relation >= 50 && !latestAi.allies.includes(playerId) && Math.random() < 0.18) {
        nextCountries = nextCountries.map((c) => {
          if (c.id === aiCountry.id) {
            return { ...c, allies: Array.from(new Set([...c.allies, playerId])) };
          }
          if (c.id === playerId) {
            return { ...c, allies: Array.from(new Set([...c.allies, aiCountry.id])) };
          }
          return c;
        });
        addLog(`${aiCountry.name}, seninle müttefik oldu.`);
      }

      const aiTerritories = nextTerritories.filter((t) => t.ownerCountryId === aiCountry.id);
      const aiTreasury = nextCountries.find((c) => c.id === aiCountry.id)?.treasury ?? 0;
      if (aiTerritories.length > 0 && aiTreasury >= 100 && Math.random() < 0.5) {
        const targetTerritory = aiTerritories[Math.floor(Math.random() * aiTerritories.length)];
        nextCountries = nextCountries.map((c) =>
          c.id === aiCountry.id ? { ...c, treasury: c.treasury - 100 } : c
        );
        nextTerritories = nextTerritories.map((t) =>
          t.id === targetTerritory.id
            ? { ...t, units: { ...t.units, infantry: t.units.infantry + 1 } }
            : t
        );
      }

      const aiNow = nextCountries.find((c) => c.id === aiCountry.id)!;
      const source = nextTerritories.find(
        (t) =>
          t.ownerCountryId === aiCountry.id &&
          sumUnits(t.units) > 0 &&
          t.neighbors.some((n) => {
            const neighbor = nextTerritories.find((x) => x.id === n);
            return (
              neighbor &&
              neighbor.ownerCountryId !== aiCountry.id &&
              aiNow.atWarWith.includes(neighbor.ownerCountryId)
            );
          })
      );

      if (source) {
        const targetId = source.neighbors.find((n) => {
          const neighbor = nextTerritories.find((x) => x.id === n);
          return (
            neighbor &&
            neighbor.ownerCountryId !== aiCountry.id &&
            aiNow.atWarWith.includes(neighbor.ownerCountryId)
          );
        });

        if (targetId) {
          const sendInf = Math.max(1, Math.floor(source.units.infantry / 2));
          const sendTank = source.units.tank > 0 ? 1 : 0;
          const sendAir = source.units.aircraft > 0 ? 1 : 0;

          if (sendInf + sendTank + sendAir > 0) {
            nextTerritories = nextTerritories.map((t) =>
              t.id === source.id
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
                ownerCountryId: aiCountry.id,
                fromTerritoryId: source.id,
                toTerritoryId: targetId,
                payload: {
                  infantry: sendInf,
                  tank: sendTank,
                  aircraft: sendAir,
                },
                remainingDays: sendAir > 0 ? 1 : sendTank > 0 ? 3 : 2,
                isAttack: true,
              },
            ]);

            addLog(
              `${aiCountry.name}, ${source.name} bölgesinden saldırı başlattı.`
            );
          }
        }
      }

      if (!aiNow.activeResearch && Math.random() < 0.3) {
        const pick: UnitType[] = ["infantry", "tank", "aircraft"];
        const choice = pick[Math.floor(Math.random() * pick.length)];
        const current = aiNow.tech[choice];
        if (current < 3) {
          const factories = totalFactories(nextTerritories, nextCountries, aiCountry.id);
          const base = RESEARCH_BASE_DAYS[choice][current];
          const actual = Math.max(5, Math.ceil(base / Math.max(factories, 1)));
          nextCountries = nextCountries.map((c) =>
            c.id === aiCountry.id
              ? {
                  ...c,
                  activeResearch: {
                    category: choice,
                    level: current + 1,
                    remainingDays: actual,
                  },
                }
              : c
          );
        }
      }
    }

    setCountries(nextCountries);
    setTerritories(nextTerritories);
  }

  function tickOneDay() {
    const currentCountries = stateRef.current?.countries ?? countries;
    const currentTerritories = stateRef.current?.territories ?? territories;
    const currentTasks = stateRef.current?.moveTasks ?? moveTasks;
    const playerId = stateRef.current?.selectedCountryId ?? selectedCountryId;

    const nextDay = day + 1;
    setDay(nextDay);

    const afterEconomy = currentCountries.map((country) => {
      let nextCountry = {
        ...country,
        treasury: country.treasury + dailyIncome(currentTerritories, country.id),
      };

      if (nextCountry.activeResearch) {
        const remaining = nextCountry.activeResearch.remainingDays - 1;
        if (remaining <= 0) {
          const { category, level } = nextCountry.activeResearch;
          nextCountry = {
            ...nextCountry,
            tech: {
              ...nextCountry.tech,
              [category]: level,
            },
            activeResearch: null,
          };
          addLog(
            `${nextCountry.name} için ${formatUnitType(category)} teknoloji seviye ${level} tamamlandı.`
          );
        } else {
          nextCountry = {
            ...nextCountry,
            activeResearch: {
              ...nextCountry.activeResearch,
              remainingDays: remaining,
            },
          };
        }
      }

      return nextCountry;
    });

    setCountries(afterEconomy);

    const decremented = currentTasks.map((task) => ({
      ...task,
      remainingDays: task.remainingDays - 1,
    }));

    const arrivals = decremented.filter((task) => task.remainingDays <= 0);
    const stillMoving = decremented.filter((task) => task.remainingDays > 0);
    setMoveTasks(stillMoving);

    arrivals.forEach((task) => resolveBattle(task, afterEconomy, currentTerritories));

    const latestTerritories = stateRef.current?.territories ?? currentTerritories;
    checkGameOver(latestTerritories, playerId ?? null);

    if (nextDay % 5 === 0) {
      runAiStep(afterEconomy, latestTerritories);
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
        running: false,
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
            Avrupa haritasından bir ülkeye tıkla ve oyuna başla.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <svg viewBox="0 0 940 560" className="h-auto w-full">
              {territories.map((territory) => (
                <g key={territory.id}>
                  <path
                    d={territory.polygon}
                    fill={getCountryColor(territory.ownerCountryId, countries)}
                    stroke="#0f172a"
                    strokeWidth="3"
                    className="cursor-pointer transition-opacity hover:opacity-85"
                    onClick={() => selectStartingCountry(territory.id)}
                  />
                  <text
                    x={territory.labelX}
                    y={territory.labelY}
                    textAnchor="middle"
                    fontSize="15"
                    fill="white"
                    fontWeight="700"
                    style={{ pointerEvents: "none" }}
                  >
                    {territory.name}
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

  const relationToTarget =
    selectedCountryId && targetCountry
      ? countries.find((c) => c.id === selectedCountryId)?.relations[targetCountry.id] ?? 0
      : 0;

  const playerAtWarWithTarget =
    !!selectedCountryId &&
    !!selectedTargetCountryId &&
    (countries.find((c) => c.id === selectedCountryId)?.atWarWith.includes(selectedTargetCountryId) ??
      false);

  const canAirStrikeNow =
    !!selectedCountryId &&
    !!selectedTerritory &&
    !!selectedTargetCountryId &&
    selectedTerritory.ownerCountryId === selectedCountryId &&
    selectedTerritory.neighbors.includes(selectedTargetCountryId) &&
    selectedTerritory.units.aircraft > 0 &&
    playerAtWarWithTarget;

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
              Toprak: {ownedCount}/10
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
              .map((country) => (
                <button
                  key={country.id}
                  onClick={() => {
                    setSelectedTargetCountryId(country.id);
                    setPanelMode("country");
                  }}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: country.color }}
                >
                  {country.name}
                </button>
              ))}
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#08111f] p-3">
            <svg viewBox="0 0 940 560" className="h-auto w-full">
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
                    <circle cx={x} cy={y} r="10" fill={getCountryColor(task.ownerCountryId, countries)} />
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

              {territories.map((territory) => (
                <g key={territory.id}>
                  <path
                    d={territory.polygon}
                    fill={getCountryColor(territory.ownerCountryId, countries)}
                    stroke={
                      selectedTerritoryId === territory.id ? "#ffffff" : "#0f172a"
                    }
                    strokeWidth={selectedTerritoryId === territory.id ? 5 : 3}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                    onClick={() => onTerritoryClick(territory.id)}
                  />
                  <text
                    x={territory.labelX}
                    y={territory.labelY - 7}
                    textAnchor="middle"
                    fontSize="14"
                    fill="white"
                    fontWeight="800"
                    style={{ pointerEvents: "none" }}
                  >
                    {territory.name}
                  </text>
                  <text
                    x={territory.labelX}
                    y={territory.labelY + 11}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgba(255,255,255,0.95)"
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    A:{territory.units.infantry} T:{territory.units.tank} U:{territory.units.aircraft}
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
                <div>Sahip: {getCountryName(selectedTerritory.ownerCountryId, countries)}</div>
                <div>Arazi: {selectedTerritory.terrain}</div>
                <div>Ekonomi: {selectedTerritory.economy}</div>
                <div>Fabrika: {selectedTerritory.factories}</div>
                <div>
                  Birlikler — Asker: {selectedTerritory.units.infantry} / Tank:{" "}
                  {selectedTerritory.units.tank} / Uçak: {selectedTerritory.units.aircraft}
                </div>
              </div>

              {selectedTerritory.ownerCountryId === selectedCountryId && (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button
                      onClick={() => produceUnit("infantry")}
                      className="rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Asker bas (100)
                    </button>
                    <button
                      onClick={() => produceUnit("tank")}
                      className="rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Tank bas (300)
                    </button>
                    <button
                      onClick={() => produceUnit("aircraft")}
                      className="rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Uçak bas (500)
                    </button>
                    <button
                      onClick={buildFactory}
                      className="rounded-xl bg-amber-700 px-3 py-2 hover:bg-amber-800"
                    >
                      Fabrika kur
                    </button>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800 p-3">
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
                                  infantry: clamp(
                                    Number(e.target.value) || 0,
                                    0,
                                    selectedTerritory.units.infantry
                                  ),
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
                                  tank: clamp(
                                    Number(e.target.value) || 0,
                                    0,
                                    selectedTerritory.units.tank
                                  ),
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
                                  aircraft: clamp(
                                    Number(e.target.value) || 0,
                                    0,
                                    selectedTerritory.units.aircraft
                                  ),
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

          {panelMode === "country" && targetCountry && selectedCountryId && (
            <div>
              <h2 className="text-xl font-bold text-indigo-300">{targetCountry.name}</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>İlişki: {relationToTarget}</div>
                <div>Savaş: {playerAtWarWithTarget ? "Var" : "Yok"}</div>
                <div>
                  Müttefiklik:{" "}
                  {countries.find((c) => c.id === selectedCountryId)?.allies.includes(targetCountry.id)
                    ? "Müttefik"
                    : "Yok"}
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
                  İlişki geliştir (100)
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
                    Araştırma: {formatUnitType(playerCountry.activeResearch.category)} • Seviye{" "}
                    {playerCountry.activeResearch.level} • Kalan{" "}
                    {playerCountry.activeResearch.remainingDays} gün
                  </div>
                ) : (
                  <div>Aktif araştırma yok</div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {(["infantry", "tank", "aircraft"] as UnitType[]).map((type) => {
                  const level = playerCountry.tech[type];
                  const maxed = level >= 3;
                  const base = maxed ? 0 : RESEARCH_BASE_DAYS[type][level];
                  const actual = maxed ? 0 : Math.max(5, Math.ceil(base / Math.max(playerFactories, 1)));

                  return (
                    <div key={type} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="font-semibold text-white">
                        {formatUnitType(type)} • Seviye {level}/3
                      </div>
                      {!maxed ? (
                        <>
                          <div className="mt-1 text-sm text-slate-400">
                            Sonraki süre: {actual} gün
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
                        <div className="mt-2 text-sm text-emerald-300">
                          Maksimum seviye
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {panelMode === "economy" && playerCountry && selectedCountryId && (
            <div>
              <h2 className="text-xl font-bold text-amber-300">Ekonomi</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>Para: {playerCountry.treasury}</div>
                <div>Gelir/Gün: {playerIncome}</div>
                <div>Ekonomi: {playerEconomy}</div>
                <div>Toplam fabrika: {playerFactories}</div>
              </div>

              <div className="mt-4 space-y-2">
                {ownedTerritories(territories, selectedCountryId).map((territory) => (
                  <button
                    key={territory.id}
                    onClick={() => {
                      setSelectedTerritoryId(territory.id);
                      setPanelMode("territory");
                    }}
                    className="w-full rounded-xl bg-slate-800 px-3 py-2 text-left hover:bg-slate-700"
                  >
                    <div className="font-semibold text-white">{territory.name}</div>
                    <div className="text-xs text-slate-400">
                      Ekonomi: {territory.economy} • Fabrika: {territory.factories}
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
                Haritadan ülke alanına tıkla. Kendi bölgeni seçip birlik basabilir, hareket ettirebilir,
                düşman ülke seçip diplomasi yapabilirsin.
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
            {eventLog.map((item, index) => (
              <div
                key={`${item}-${index}`}
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
            <div className="text-4xl">
              {gameOver.winner ? "🏆" : "💀"}
            </div>
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
