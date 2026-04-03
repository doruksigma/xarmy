"use client";

import { useEffect, useMemo, useState } from "react";

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

type PanelMode = "city" | "country" | "economy" | "tech" | null;

interface Unit {
  id: string;
  type: UnitType;
  ownerCountryId: CountryId;
  attack: number;
  defense: number;
  moveDays: number;
  cost: number;
  manpowerCost: number;
}

interface MovingUnit {
  unit: Unit;
  fromCityId: string;
  toCityId: string;
  remainingDays: number;
}

interface City {
  id: string;
  name: string;
  countryId: CountryId;
  ownerCountryId: CountryId;
  x: number;
  y: number;
  economy: number;
  factories: number;
  stationedUnits: Unit[];
  neighbors: string[];
}

interface ResearchState {
  category: UnitType;
  level: number;
  remainingDays: number;
}

interface Country {
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

const COUNTRY_IDS: CountryId[] = [
  "turkey",
  "greece",
  "bulgaria",
  "romania",
  "serbia",
  "hungary",
  "germany",
  "france",
  "italy",
  "spain",
];

function createRelations(self: CountryId): Record<CountryId, number> {
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

const INITIAL_COUNTRIES: Country[] = [
  {
    id: "turkey",
    name: "Türkiye",
    color: "#ef4444",
    treasury: 1000,
    baseFactories: 3,
    relations: createRelations("turkey"),
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
    relations: createRelations("greece"),
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
    relations: createRelations("bulgaria"),
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
    relations: createRelations("romania"),
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
    relations: createRelations("serbia"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "hungary",
    name: "Macaristan",
    color: "#f97316",
    treasury: 850,
    baseFactories: 2,
    relations: createRelations("hungary"),
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
    relations: createRelations("germany"),
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
    relations: createRelations("france"),
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
    relations: createRelations("italy"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
  {
    id: "spain",
    name: "İspanya",
    color: "#eab308",
    treasury: 1100,
    baseFactories: 3,
    relations: createRelations("spain"),
    tech: { infantry: 0, tank: 0, aircraft: 0 },
    activeResearch: null,
    atWarWith: [],
    allies: [],
  },
];

const INITIAL_CITIES: City[] = [
  {
    id: "edirne",
    name: "Edirne",
    countryId: "turkey",
    ownerCountryId: "turkey",
    x: 77,
    y: 52,
    economy: 5,
    factories: 1,
    stationedUnits: [],
    neighbors: ["istanbul", "sofia"],
  },
  {
    id: "istanbul",
    name: "İstanbul",
    countryId: "turkey",
    ownerCountryId: "turkey",
    x: 84,
    y: 57,
    economy: 10,
    factories: 2,
    stationedUnits: [],
    neighbors: ["edirne", "ankara", "athens"],
  },
  {
    id: "ankara",
    name: "Ankara",
    countryId: "turkey",
    ownerCountryId: "turkey",
    x: 92,
    y: 67,
    economy: 8,
    factories: 1,
    stationedUnits: [],
    neighbors: ["istanbul"],
  },
  {
    id: "athens",
    name: "Atina",
    countryId: "greece",
    ownerCountryId: "greece",
    x: 72,
    y: 69,
    economy: 6,
    factories: 1,
    stationedUnits: [],
    neighbors: ["istanbul", "thessaloniki"],
  },
  {
    id: "thessaloniki",
    name: "Selanik",
    countryId: "greece",
    ownerCountryId: "greece",
    x: 71,
    y: 60,
    economy: 5,
    factories: 1,
    stationedUnits: [],
    neighbors: ["athens", "sofia"],
  },
  {
    id: "sofia",
    name: "Sofya",
    countryId: "bulgaria",
    ownerCountryId: "bulgaria",
    x: 68,
    y: 54,
    economy: 5,
    factories: 1,
    stationedUnits: [],
    neighbors: ["edirne", "thessaloniki", "bucharest", "belgrade"],
  },
  {
    id: "bucharest",
    name: "Bükreş",
    countryId: "romania",
    ownerCountryId: "romania",
    x: 72,
    y: 45,
    economy: 7,
    factories: 1,
    stationedUnits: [],
    neighbors: ["sofia", "budapest"],
  },
  {
    id: "belgrade",
    name: "Belgrad",
    countryId: "serbia",
    ownerCountryId: "serbia",
    x: 62,
    y: 51,
    economy: 5,
    factories: 1,
    stationedUnits: [],
    neighbors: ["sofia", "budapest", "rome"],
  },
  {
    id: "budapest",
    name: "Budapeşte",
    countryId: "hungary",
    ownerCountryId: "hungary",
    x: 59,
    y: 43,
    economy: 6,
    factories: 1,
    stationedUnits: [],
    neighbors: ["belgrade", "bucharest", "munich"],
  },
  {
    id: "munich",
    name: "Münih",
    countryId: "germany",
    ownerCountryId: "germany",
    x: 47,
    y: 35,
    economy: 8,
    factories: 2,
    stationedUnits: [],
    neighbors: ["budapest", "berlin", "rome", "paris"],
  },
  {
    id: "berlin",
    name: "Berlin",
    countryId: "germany",
    ownerCountryId: "germany",
    x: 49,
    y: 26,
    economy: 10,
    factories: 2,
    stationedUnits: [],
    neighbors: ["munich", "paris"],
  },
  {
    id: "paris",
    name: "Paris",
    countryId: "france",
    ownerCountryId: "france",
    x: 31,
    y: 34,
    economy: 10,
    factories: 2,
    stationedUnits: [],
    neighbors: ["berlin", "munich", "madrid"],
  },
  {
    id: "rome",
    name: "Roma",
    countryId: "italy",
    ownerCountryId: "italy",
    x: 47,
    y: 56,
    economy: 8,
    factories: 2,
    stationedUnits: [],
    neighbors: ["munich", "belgrade"],
  },
  {
    id: "madrid",
    name: "Madrid",
    countryId: "spain",
    ownerCountryId: "spain",
    x: 18,
    y: 48,
    economy: 8,
    factories: 2,
    stationedUnits: [],
    neighbors: ["paris"],
  },
];

const RESEARCH_BASE_DAYS: Record<UnitType, [number, number, number]> = {
  infantry: [20, 35, 50],
  tank: [20, 35, 50],
  aircraft: [20, 35, 50],
};

let unitCounter = 1;

function getCountryById(countries: Country[], id: CountryId): Country {
  const found = countries.find((c) => c.id === id);
  if (!found) throw new Error(`Country not found: ${id}`);
  return found;
}

function getCityById(cities: City[], id: string): City {
  const found = cities.find((c) => c.id === id);
  if (!found) throw new Error(`City not found: ${id}`);
  return found;
}

function getControlledCities(cities: City[], countryId: CountryId): City[] {
  return cities.filter((c) => c.ownerCountryId === countryId);
}

function getTotalEconomy(cities: City[], countryId: CountryId): number {
  return getControlledCities(cities, countryId).reduce((sum, c) => sum + c.economy, 0);
}

function getTotalFactories(cities: City[], countries: Country[], countryId: CountryId): number {
  const cityFactories = getControlledCities(cities, countryId).reduce(
    (sum, c) => sum + c.factories,
    0
  );
  return cityFactories + getCountryById(countries, countryId).baseFactories;
}

function getDailyIncome(cities: City[], countryId: CountryId): number {
  return getControlledCities(cities, countryId).length * 20;
}

function getManpowerCap(cities: City[], countryId: CountryId): number {
  return getTotalEconomy(cities, countryId) * 2;
}

function getUsedManpower(cities: City[], movingUnits: MovingUnit[], countryId: CountryId): number {
  const stationed = cities
    .flatMap((c) => c.stationedUnits)
    .filter((u) => u.ownerCountryId === countryId)
    .reduce((sum, u) => sum + u.manpowerCost, 0);

  const moving = movingUnits
    .filter((m) => m.unit.ownerCountryId === countryId)
    .reduce((sum, m) => sum + m.unit.manpowerCost, 0);

  return stationed + moving;
}

function createUnit(type: UnitType, ownerCountryId: CountryId, techLevel: number): Unit {
  const defs: Record<
    UnitType,
    { attack: number; defense: number; moveDays: number; cost: number; manpowerCost: number }
  > = {
    infantry: {
      attack: 3 + techLevel,
      defense: 3 + techLevel,
      moveDays: 2,
      cost: 100,
      manpowerCost: 1,
    },
    tank: {
      attack: 6 + techLevel * 2,
      defense: 4 + techLevel,
      moveDays: 3,
      cost: 300,
      manpowerCost: 2,
    },
    aircraft: {
      attack: 7 + techLevel * 2,
      defense: 2 + techLevel,
      moveDays: 2,
      cost: 500,
      manpowerCost: 2,
    },
  };

  const d = defs[type];

  return {
    id: `unit-${unitCounter++}`,
    type,
    ownerCountryId,
    attack: d.attack,
    defense: d.defense,
    moveDays: d.moveDays,
    cost: d.cost,
    manpowerCost: d.manpowerCost,
  };
}

function formatUnitLabel(type: UnitType): string {
  if (type === "infantry") return "Asker";
  if (type === "tank") return "Tank";
  return "Uçak";
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

function clampRelation(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

export default function EuropaWarClient() {
  const [countries, setCountries] = useState<Country[]>(INITIAL_COUNTRIES);
  const [cities, setCities] = useState<City[]>(INITIAL_CITIES);
  const [selectedCountryId, setSelectedCountryId] = useState<CountryId | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedTargetCountryId, setSelectedTargetCountryId] = useState<CountryId | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [running, setRunning] = useState(false);
  const [day, setDay] = useState(0);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [movingUnits, setMovingUnits] = useState<MovingUnit[]>([]);
  const [selectedMovingUnitId, setSelectedMovingUnitId] = useState<string | null>(null);

  const playerCountry = selectedCountryId
    ? countries.find((c) => c.id === selectedCountryId) ?? null
    : null;

  const selectedCity = selectedCityId
    ? cities.find((c) => c.id === selectedCityId) ?? null
    : null;

  const targetCountry = selectedTargetCountryId
    ? countries.find((c) => c.id === selectedTargetCountryId) ?? null
    : null;

  const playerEconomy = useMemo(() => {
    if (!selectedCountryId) return 0;
    return getTotalEconomy(cities, selectedCountryId);
  }, [cities, selectedCountryId]);

  const playerFactories = useMemo(() => {
    if (!selectedCountryId) return 0;
    return getTotalFactories(cities, countries, selectedCountryId);
  }, [cities, countries, selectedCountryId]);

  const playerIncome = useMemo(() => {
    if (!selectedCountryId) return 0;
    return getDailyIncome(cities, selectedCountryId);
  }, [cities, selectedCountryId]);

  const playerManpowerCap = useMemo(() => {
    if (!selectedCountryId) return 0;
    return getManpowerCap(cities, selectedCountryId);
  }, [cities, selectedCountryId]);

  const playerUsedManpower = useMemo(() => {
    if (!selectedCountryId) return 0;
    return getUsedManpower(cities, movingUnits, selectedCountryId);
  }, [cities, movingUnits, selectedCountryId]);

  function addLog(message: string): void {
    setEventLog((prev) => [`${formatDate(day)} • ${message}`, ...prev].slice(0, 24));
  }

  function selectCountry(countryId: CountryId): void {
    setSelectedCountryId(countryId);
    setSelectedCityId(null);
    setSelectedTargetCountryId(null);
    setPanelMode(null);
    addLog(`${getCountryById(INITIAL_COUNTRIES, countryId).name} seçildi.`);
  }

  function updateOneCountry(countryId: CountryId, updater: (country: Country) => Country): void {
    setCountries((prev) => prev.map((c) => (c.id === countryId ? updater(c) : c)));
  }

  function setRelationBoth(a: CountryId, b: CountryId, delta: number): void {
    setCountries((prev) =>
      prev.map((country) => {
        if (country.id !== a && country.id !== b) return country;
        const other = country.id === a ? b : a;
        return {
          ...country,
          relations: {
            ...country.relations,
            [other]: clampRelation(country.relations[other] + delta),
          },
        };
      })
    );
  }

  function declareWar(a: CountryId, b: CountryId): void {
    setCountries((prev) =>
      prev.map((country) => {
        if (country.id === a) {
          return {
            ...country,
            atWarWith: Array.from(new Set([...country.atWarWith, b])),
          };
        }
        if (country.id === b) {
          return {
            ...country,
            atWarWith: Array.from(new Set([...country.atWarWith, a])),
          };
        }
        return country;
      })
    );
  }

  function makePeace(a: CountryId, b: CountryId): void {
    setCountries((prev) =>
      prev.map((country) => {
        if (country.id === a) {
          return { ...country, atWarWith: country.atWarWith.filter((id) => id !== b) };
        }
        if (country.id === b) {
          return { ...country, atWarWith: country.atWarWith.filter((id) => id !== a) };
        }
        return country;
      })
    );
  }

  function addAlliance(a: CountryId, b: CountryId): void {
    setCountries((prev) =>
      prev.map((country) => {
        if (country.id === a) {
          return { ...country, allies: Array.from(new Set([...country.allies, b])) };
        }
        if (country.id === b) {
          return { ...country, allies: Array.from(new Set([...country.allies, a])) };
        }
        return country;
      })
    );
  }

  function onCityClick(cityId: string): void {
    const clickedCity = getCityById(cities, cityId);

    if (selectedMovingUnitId) {
      const sourceCity = cities.find((c) => c.stationedUnits.some((u) => u.id === selectedMovingUnitId));
      const movingUnit = cities
        .flatMap((c) => c.stationedUnits)
        .find((u) => u.id === selectedMovingUnitId);

      if (!sourceCity || !movingUnit) {
        setSelectedMovingUnitId(null);
        return;
      }

      if (!sourceCity.neighbors.includes(clickedCity.id)) {
        addLog("Sadece komşu şehirlere hareket edebilirsin.");
        return;
      }

      setCities((prev) =>
        prev.map((city) =>
          city.id === sourceCity.id
            ? {
                ...city,
                stationedUnits: city.stationedUnits.filter((u) => u.id !== movingUnit.id),
              }
            : city
        )
      );

      setMovingUnits((prev) => [
        ...prev,
        {
          unit: movingUnit,
          fromCityId: sourceCity.id,
          toCityId: clickedCity.id,
          remainingDays: movingUnit.moveDays,
        },
      ]);

      addLog(
        `${formatUnitLabel(movingUnit.type)} ${sourceCity.name} şehrinden ${clickedCity.name} şehrine hareket etti.`
      );
      setSelectedMovingUnitId(null);
      return;
    }

    setSelectedCityId(cityId);
    setSelectedTargetCountryId(null);
    setPanelMode("city");
  }

  function onCountryButtonClick(countryId: CountryId): void {
    if (!selectedCountryId || countryId === selectedCountryId) return;
    setSelectedTargetCountryId(countryId);
    setSelectedCityId(null);
    setPanelMode("country");
  }

  function produceUnit(type: UnitType): void {
    if (!selectedCountryId || !playerCountry || !selectedCity) return;
    if (selectedCity.ownerCountryId !== selectedCountryId) return;

    const techLevel = playerCountry.tech[type];
    const unit = createUnit(type, selectedCountryId, techLevel);

    if (playerCountry.treasury < unit.cost) {
      addLog("Yeterli para yok.");
      return;
    }

    if (playerUsedManpower + unit.manpowerCost > playerManpowerCap) {
      addLog("Yeterli asker kapasitesi yok.");
      return;
    }

    updateOneCountry(selectedCountryId, (country) => ({
      ...country,
      treasury: country.treasury - unit.cost,
    }));

    setCities((prev) =>
      prev.map((city) =>
        city.id === selectedCity.id
          ? { ...city, stationedUnits: [...city.stationedUnits, unit] }
          : city
      )
    );

    addLog(
      `${selectedCity.name} şehrinde ${formatUnitLabel(type)} üretildi.`
    );
  }

  function buildFactory(cityId: string): void {
    if (!selectedCountryId || !playerCountry) return;
    const ownedFactories = getControlledCities(cities, selectedCountryId).reduce(
      (sum, city) => sum + city.factories,
      0
    );
    const cost = 500 + ownedFactories * 250;

    if (playerCountry.treasury < cost) {
      addLog("Yeni fabrika için para yetmiyor.");
      return;
    }

    updateOneCountry(selectedCountryId, (country) => ({
      ...country,
      treasury: country.treasury - cost,
    }));

    setCities((prev) =>
      prev.map((city) =>
        city.id === cityId ? { ...city, factories: city.factories + 1 } : city
      )
    );

    addLog(`${getCityById(cities, cityId).name} şehrine yeni fabrika kuruldu.`);
  }

  function startResearch(type: UnitType): void {
    if (!selectedCountryId || !playerCountry) return;
    if (playerCountry.activeResearch) {
      addLog("Aynı anda sadece 1 teknoloji araştırabilirsin.");
      return;
    }

    const currentLevel = playerCountry.tech[type];
    if (currentLevel >= 3) {
      addLog("Bu teknoloji maksimum seviyeye ulaştı.");
      return;
    }

    const baseDays = RESEARCH_BASE_DAYS[type][currentLevel];
    const actualDays = Math.max(5, Math.ceil(baseDays / Math.max(1, playerFactories)));

    updateOneCountry(selectedCountryId, (country) => ({
      ...country,
      activeResearch: {
        category: type,
        level: currentLevel + 1,
        remainingDays: actualDays,
      },
    }));

    addLog(
      `${formatUnitLabel(type)} teknoloji seviye ${currentLevel + 1} araştırması başladı.`
    );
  }

  function improveRelations(): void {
    if (!selectedCountryId || !selectedTargetCountryId || !playerCountry || !targetCountry) return;

    if (playerCountry.treasury < 100) {
      addLog("İlişki geliştirmek için 100 para gerekiyor.");
      return;
    }

    updateOneCountry(selectedCountryId, (country) => ({
      ...country,
      treasury: country.treasury - 100,
    }));

    setRelationBoth(selectedCountryId, selectedTargetCountryId, 10);
    addLog(`${targetCountry.name} ile ilişkiler gelişti.`);
  }

  function insultCountry(): void {
    if (!selectedCountryId || !selectedTargetCountryId || !targetCountry) return;
    setRelationBoth(selectedCountryId, selectedTargetCountryId, -15);
    addLog(`${targetCountry.name} ülkesine hakaret edildi.`);
  }

  function offerAlliance(): void {
    if (!selectedCountryId || !selectedTargetCountryId || !targetCountry) return;
    const relation = getCountryById(countries, selectedCountryId).relations[selectedTargetCountryId];
    const accepted = relation >= 40 || Math.random() < relation / 100 + 0.15;

    if (accepted) {
      addAlliance(selectedCountryId, selectedTargetCountryId);
      addLog(`${targetCountry.name} müttefikliği kabul etti.`);
    } else {
      addLog(`${targetCountry.name} müttefikliği reddetti.`);
    }
  }

  function doDeclareWar(): void {
    if (!selectedCountryId || !selectedTargetCountryId || !targetCountry) return;
    declareWar(selectedCountryId, selectedTargetCountryId);
    addLog(`${targetCountry.name} ülkesine savaş ilan edildi.`);
  }

  function offerPeace(): void {
    if (!selectedCountryId || !selectedTargetCountryId || !targetCountry) return;

    const occupiedEnemyCities = cities.filter(
      (city) =>
        city.countryId === selectedTargetCountryId && city.ownerCountryId === selectedCountryId
    ).length;

    const relation = getCountryById(countries, selectedCountryId).relations[selectedTargetCountryId];
    const accepted = occupiedEnemyCities > 0 || relation > 20 || Math.random() < 0.35;

    if (accepted) {
      makePeace(selectedCountryId, selectedTargetCountryId);
      addLog(`${targetCountry.name} barışı kabul etti.`);
    } else {
      addLog(`${targetCountry.name} barışı reddetti.`);
    }
  }

  function handleArrival(arrival: MovingUnit, countriesSnapshot: Country[], citiesSnapshot: City[]): void {
    const attackerId = arrival.unit.ownerCountryId;
    const targetCity = getCityById(citiesSnapshot, arrival.toCityId);
    const defenderId = targetCity.ownerCountryId;

    if (attackerId === defenderId) {
      setCities((prev) =>
        prev.map((city) =>
          city.id === targetCity.id
            ? { ...city, stationedUnits: [...city.stationedUnits, arrival.unit] }
            : city
        )
      );
      return;
    }

    const attackerCountry = getCountryById(countriesSnapshot, attackerId);
    const isAtWar = attackerCountry.atWarWith.includes(defenderId);

    if (!isAtWar) {
      setCities((prev) =>
        prev.map((city) =>
          city.id === arrival.fromCityId
            ? { ...city, stationedUnits: [...city.stationedUnits, arrival.unit] }
            : city
        )
      );
      addLog("Savaş olmadığı için birlik geri döndü.");
      return;
    }

    const attackScore = arrival.unit.attack + randomInt(5);
    const defenseScore =
      targetCity.stationedUnits.reduce((sum, unit) => sum + unit.defense, 0) + randomInt(5) + 2;

    if (attackScore >= defenseScore) {
      setCities((prev) =>
        prev.map((city) =>
          city.id === targetCity.id
            ? {
                ...city,
                ownerCountryId: attackerId,
                stationedUnits: [arrival.unit],
              }
            : city
        )
      );

      addLog(
        `${getCountryById(countriesSnapshot, attackerId).name}, ${targetCity.name} şehrini ele geçirdi.`
      );
    } else {
      addLog(
        `${getCountryById(countriesSnapshot, attackerId).name} saldırısı ${targetCity.name} önünde başarısız oldu.`
      );
    }
  }

  function runAI(countriesSnapshot: Country[], citiesSnapshot: City[]): void {
    if (!selectedCountryId) return;

    let workingCountries = countriesSnapshot;
    let workingCities = citiesSnapshot;
    const player = getCountryById(workingCountries, selectedCountryId);

    for (const aiCountry of workingCountries) {
      if (aiCountry.id === selectedCountryId) continue;

      const relation = aiCountry.relations[player.id];

      if (relation <= -40 && !aiCountry.atWarWith.includes(player.id) && Math.random() < 0.2) {
        workingCountries = workingCountries.map((country) => {
          if (country.id === aiCountry.id) {
            return { ...country, atWarWith: Array.from(new Set([...country.atWarWith, player.id])) };
          }
          if (country.id === player.id) {
            return { ...country, atWarWith: Array.from(new Set([...country.atWarWith, aiCountry.id])) };
          }
          return country;
        });
        addLog(`${aiCountry.name}, sana savaş ilan etti.`);
      }

      if (relation >= 50 && !aiCountry.allies.includes(player.id) && Math.random() < 0.2) {
        workingCountries = workingCountries.map((country) => {
          if (country.id === aiCountry.id) {
            return { ...country, allies: Array.from(new Set([...country.allies, player.id])) };
          }
          if (country.id === player.id) {
            return { ...country, allies: Array.from(new Set([...country.allies, aiCountry.id])) };
          }
          return country;
        });
        addLog(`${aiCountry.name}, seninle müttefik oldu.`);
      }

      const aiOwnedCities = workingCities.filter((city) => city.ownerCountryId === aiCountry.id);
      const latestAi = getCountryById(workingCountries, aiCountry.id);

      if (aiOwnedCities.length > 0 && latestAi.treasury >= 100 && Math.random() < 0.45) {
        const city = aiOwnedCities[randomInt(aiOwnedCities.length)];
        const unit = createUnit("infantry", aiCountry.id, latestAi.tech.infantry);

        if (latestAi.treasury >= unit.cost) {
          workingCountries = workingCountries.map((country) =>
            country.id === aiCountry.id
              ? { ...country, treasury: country.treasury - unit.cost }
              : country
          );

          workingCities = workingCities.map((c) =>
            c.id === city.id ? { ...c, stationedUnits: [...c.stationedUnits, unit] } : c
          );
        }
      }

      const latestAiWarState = getCountryById(workingCountries, aiCountry.id);
      if (latestAiWarState.atWarWith.includes(player.id)) {
        const source = workingCities.find(
          (city) =>
            city.ownerCountryId === aiCountry.id &&
            city.stationedUnits.length > 0 &&
            city.neighbors.some((neighborId) => getCityById(workingCities, neighborId).ownerCountryId !== aiCountry.id)
        );

        if (source) {
          const enemyNeighbor = source.neighbors
            .map((id) => getCityById(workingCities, id))
            .find((city) => city.ownerCountryId !== aiCountry.id);

          if (enemyNeighbor) {
            const unit = source.stationedUnits[0];

            workingCities = workingCities.map((city) =>
              city.id === source.id
                ? { ...city, stationedUnits: city.stationedUnits.slice(1) }
                : city
            );

            setMovingUnits((prev) => [
              ...prev,
              {
                unit,
                fromCityId: source.id,
                toCityId: enemyNeighbor.id,
                remainingDays: unit.moveDays,
              },
            ]);

            addLog(
              `${aiCountry.name}, ${source.name} şehrinden ${enemyNeighbor.name} şehrine birlik gönderdi.`
            );
          }
        }
      }
    }

    setCountries(workingCountries);
    setCities(workingCities);
  }

  function tickOneDay(): void {
    const countriesSnapshot = countries;
    const citiesSnapshot = cities;

    setDay((prev) => prev + 1);

    const updatedCountries = countriesSnapshot.map((country) => {
      let nextCountry: Country = {
        ...country,
        treasury: country.treasury + getDailyIncome(citiesSnapshot, country.id),
      };

      if (nextCountry.activeResearch) {
        const remaining = nextCountry.activeResearch.remainingDays - 1;

        if (remaining <= 0) {
          const category = nextCountry.activeResearch.category;
          const level = nextCountry.activeResearch.level;
          nextCountry = {
            ...nextCountry,
            tech: {
              ...nextCountry.tech,
              [category]: level,
            },
            activeResearch: null,
          };
          addLog(`${nextCountry.name} için ${formatUnitLabel(category)} teknolojisi seviye ${level} tamamlandı.`);
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

    setCountries(updatedCountries);

    const moved = movingUnits.map((item) => ({
      ...item,
      remainingDays: item.remainingDays - 1,
    }));

    const arrivals = moved.filter((item) => item.remainingDays <= 0);
    const staying = moved.filter((item) => item.remainingDays > 0);

    setMovingUnits(staying);
    arrivals.forEach((arrival) => handleArrival(arrival, updatedCountries, citiesSnapshot));

    if ((day + 1) % 5 === 0) {
      runAI(updatedCountries, citiesSnapshot);
    }
  }

  useEffect(() => {
    if (!running || !selectedCountryId) return;

    const timer = setInterval(() => {
      tickOneDay();
    }, 1000);

    return () => clearInterval(timer);
  }, [running, selectedCountryId, day, countries, cities, movingUnits]);

  if (!selectedCountryId) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-extrabold text-indigo-300">🌍 Europa War</h1>
          <p className="mt-3 text-slate-400">
            Avrupa’daki bir ülkeyi seç ve oyuna başla.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {countries.map((country) => (
              <button
                key={country.id}
                onClick={() => selectCountry(country.id)}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-slate-600 hover:bg-slate-800"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">{country.name}</h2>
                  <span
                    className="inline-block h-4 w-4 rounded-full"
                    style={{ backgroundColor: country.color }}
                  />
                </div>
                <div className="mt-3 text-sm text-slate-400">
                  Başlangıç Para: {country.treasury}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Başlangıç Fabrika: {country.baseFactories}
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const relationToTarget =
    selectedCountryId && targetCountry
      ? getCountryById(countries, selectedCountryId).relations[targetCountry.id]
      : 0;

  const factoryBuildCost =
    selectedCountryId
      ? 500 +
        getControlledCities(cities, selectedCountryId).reduce(
          (sum, city) => sum + city.factories,
          0
        ) * 250
      : 500;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
              {formatDate(day)}
            </div>
            <button
              onClick={() => setRunning((prev) => !prev)}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
            >
              {running ? "Durdur" : "Başlat"}
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
              Kapasite: {playerUsedManpower}/{playerManpowerCap}
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

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {countries
              .filter((country) => country.id !== selectedCountryId)
              .map((country) => (
                <button
                  key={country.id}
                  onClick={() => onCountryButtonClick(country.id)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: country.color }}
                >
                  {country.name}
                </button>
              ))}
          </div>

          <div className="relative h-[640px] overflow-hidden rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_center,_#0f172a,_#020617)]">
            <svg className="absolute inset-0 h-full w-full pointer-events-none">
              {cities.flatMap((city) =>
                city.neighbors.map((neighborId) => {
                  const neighbor = cities.find((c) => c.id === neighborId);
                  if (!neighbor) return null;
                  if (city.id > neighbor.id) return null;

                  return (
                    <line
                      key={`${city.id}-${neighbor.id}`}
                      x1={`${city.x}%`}
                      y1={`${city.y}%`}
                      x2={`${neighbor.x}%`}
                      y2={`${neighbor.y}%`}
                      stroke="rgba(148,163,184,0.25)"
                      strokeWidth="2"
                    />
                  );
                })
              )}
            </svg>

            {movingUnits.map((moving) => {
              const fromCity = cities.find((c) => c.id === moving.fromCityId);
              const toCity = cities.find((c) => c.id === moving.toCityId);
              if (!fromCity || !toCity) return null;

              const totalDays = moving.unit.moveDays;
              const progressed = totalDays - moving.remainingDays;
              const ratio = totalDays <= 0 ? 1 : progressed / totalDays;

              const x = fromCity.x + (toCity.x - fromCity.x) * ratio;
              const y = fromCity.y + (toCity.y - fromCity.y) * ratio;

              return (
                <div
                  key={`moving-${moving.unit.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-bold text-white"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  {formatUnitLabel(moving.unit.type)} • {moving.remainingDays}g
                </div>
              );
            })}

            {cities.map((city) => {
              const owner = getCountryById(countries, city.ownerCountryId);

              return (
                <button
                  key={city.id}
                  onClick={() => onCityClick(city.id)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-3 py-2 text-center text-xs font-bold text-white shadow-lg transition hover:scale-105 ${
                    selectedCityId === city.id ? "ring-4 ring-white/30" : ""
                  }`}
                  style={{
                    left: `${city.x}%`,
                    top: `${city.y}%`,
                    backgroundColor: owner.color,
                    borderColor: city.ownerCountryId === selectedCountryId ? "#ffffff" : "#111827",
                    minWidth: 80,
                  }}
                >
                  <div>{city.name}</div>
                  <div className="text-[10px] opacity-80">{city.stationedUnits.length} birlik</div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          {panelMode === "city" && selectedCity && (
            <div>
              <h2 className="text-xl font-bold text-indigo-300">{selectedCity.name}</h2>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>Sahip: {getCountryById(countries, selectedCity.ownerCountryId).name}</div>
                <div>Ekonomi: {selectedCity.economy}</div>
                <div>Fabrika: {selectedCity.factories}</div>
                <div>Komşular: {selectedCity.neighbors.length}</div>
              </div>

              {selectedCity.ownerCountryId === selectedCountryId && (
                <>
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={() => produceUnit("infantry")}
                      className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Asker bas (100)
                    </button>
                    <button
                      onClick={() => produceUnit("tank")}
                      className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Tank bas (300)
                    </button>
                    <button
                      onClick={() => produceUnit("aircraft")}
                      className="w-full rounded-xl bg-slate-800 px-3 py-2 hover:bg-slate-700"
                    >
                      Uçak bas (500)
                    </button>
                  </div>

                  <div className="mt-5">
                    <h3 className="mb-2 font-semibold text-slate-200">Şehirdeki Birlikler</h3>
                    <div className="space-y-2">
                      {selectedCity.stationedUnits.length === 0 && (
                        <div className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-400">
                          Birlik yok
                        </div>
                      )}

                      {selectedCity.stationedUnits.map((unit) => (
                        <button
                          key={unit.id}
                          onClick={() =>
                            setSelectedMovingUnitId((prev) => (prev === unit.id ? null : unit.id))
                          }
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                            selectedMovingUnitId === unit.id
                              ? "border-indigo-400 bg-indigo-500/10"
                              : "border-slate-700 bg-slate-800"
                          }`}
                        >
                          <div className="font-semibold">
                            {formatUnitLabel(unit.type)}
                          </div>
                          <div className="text-xs text-slate-400">
                            Saldırı: {unit.attack} • Savunma: {unit.defense} • Hareket: {unit.moveDays} gün
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedMovingUnitId && (
                      <div className="mt-3 rounded-xl bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
                        Birlik seçildi. Şimdi komşu bir şehre tıkla.
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedCity.ownerCountryId !== selectedCountryId && (
                <div className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  Bu şehir başka bir ülkeye ait.
                </div>
              )}
            </div>
          )}

          {panelMode === "country" && targetCountry && selectedCountryId && (
            <div>
              <h2 className="text-xl font-bold text-indigo-300">{targetCountry.name}</h2>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>İlişki: {relationToTarget}</div>
                <div>
                  Savaş durumu:{" "}
                  {getCountryById(countries, selectedCountryId).atWarWith.includes(targetCountry.id)
                    ? "Savaştasınız"
                    : "Barış"}
                </div>
                <div>
                  Müttefiklik:{" "}
                  {getCountryById(countries, selectedCountryId).allies.includes(targetCountry.id)
                    ? "Müttefik"
                    : "Yok"}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <button
                  onClick={doDeclareWar}
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
              </div>
            </div>
          )}

          {panelMode === "tech" && playerCountry && (
            <div>
              <h2 className="text-xl font-bold text-emerald-300">Teknoloji</h2>

              <div className="mt-3 rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300">
                {playerCountry.activeResearch ? (
                  <div>
                    Araştırma: {formatUnitLabel(playerCountry.activeResearch.category)} Seviye{" "}
                    {playerCountry.activeResearch.level} • Kalan:{" "}
                    {playerCountry.activeResearch.remainingDays} gün
                  </div>
                ) : (
                  <div>Aktif araştırma yok</div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {(["infantry", "tank", "aircraft"] as UnitType[]).map((type) => {
                  const level = playerCountry.tech[type];
                  const nextLevel = level + 1;
                  const base = level < 3 ? RESEARCH_BASE_DAYS[type][level] : 0;
                  const actual = level < 3 ? Math.max(5, Math.ceil(base / Math.max(1, playerFactories))) : 0;

                  return (
                    <div key={type} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="font-semibold text-white">
                        {formatUnitLabel(type)} • Seviye {level}/3
                      </div>
                      {level < 3 ? (
                        <>
                          <div className="mt-1 text-sm text-slate-400">
                            Sonraki seviye: {nextLevel} • Süre: {actual} gün
                          </div>
                          <button
                            onClick={() => startResearch(type)}
                            disabled={!!playerCountry.activeResearch}
                            className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
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

          {panelMode === "economy" && playerCountry && selectedCountryId && (
            <div>
              <h2 className="text-xl font-bold text-amber-300">Ekonomi</h2>

              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div>Para: {playerCountry.treasury}</div>
                <div>Günlük gelir: {playerIncome}</div>
                <div>Toplam fabrika: {playerFactories}</div>
                <div>Yeni fabrika maliyeti: {factoryBuildCost}</div>
              </div>

              <div className="mt-4 space-y-2">
                {getControlledCities(cities, selectedCountryId).map((city) => (
                  <button
                    key={city.id}
                    onClick={() => buildFactory(city.id)}
                    className="w-full rounded-xl bg-slate-800 px-3 py-2 text-left hover:bg-slate-700"
                  >
                    <div className="font-semibold text-white">{city.name}</div>
                    <div className="text-xs text-slate-400">
                      Fabrika: {city.factories}
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
                Haritadan şehir seç, ya da üstteki ülke butonlarından diplomasi yap.
              </p>
              <div className="mt-4 rounded-xl bg-slate-800 px-3 py-3 text-sm text-slate-300">
                Seçili ülke: {playerCountry?.name}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
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
    </main>
  );
}
