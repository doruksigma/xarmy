export type Terrain =
  | "plains"
  | "urban"
  | "mountain"
  | "forest"
  | "marsh"
  | "desert";
export type Ideology =
  | "democracy"
  | "republic"
  | "monarchy"
  | "fascism"
  | "communism";
export type Resource =
  | "iron"
  | "steel"
  | "oil"
  | "aluminum"
  | "rubber"
  | "fuel";
export type Equipment =
  | "rifle"
  | "artillery"
  | "truck"
  | "lightTank"
  | "mediumTank"
  | "heavyTank"
  | "fighter"
  | "bomber"
  | "ship"
  | "submarine"
  | "carrier";
export type UnitType =
  | "infantry"
  | "artillery"
  | "motorized"
  | "mechanized"
  | "lightTank"
  | "mediumTank"
  | "heavyTank"
  | "special"
  | "mountain"
  | "paratrooper";
export type Building =
  | "civil"
  | "military"
  | "dock"
  | "infra"
  | "rail"
  | "hub"
  | "refinery"
  | "synthetic"
  | "fort"
  | "radar";
export type MissionType =
  | "intel"
  | "sabotage"
  | "propaganda"
  | "plans"
  | "resistance"
  | "diplomacy";
export type Stock = Record<Resource, number>;
export type Arsenal = Record<Equipment, number>;
export interface Province {
  id: string;
  owner: string;
  controller: string;
  resistance: number;
  compliance: number;
  damage: number;
  buildings: Record<Building, number>;
  occupation: "civil" | "garrison";
}
export interface General {
  id: string;
  name: string;
  trait: "attack" | "defense" | "logistics";
  skill: number;
  xp: number;
}
export interface Production {
  equipment: Equipment;
  factories: number;
  efficiency: number;
}
export interface Project {
  id: string;
  progress: number;
  total: number;
}
export interface Construction extends Project {
  province: string;
  building: Building;
}
export interface Recruitment extends Project {
  province: string;
  type: UnitType;
}
export interface AgentMission extends Project {
  target: string;
  type: MissionType;
}
export interface Country {
  id: string;
  name: string;
  color: string;
  flag: string;
  capital: string;
  leader: string;
  ideology: Ideology;
  population: number;
  science: number;
  treasury: number;
  political: number;
  manpower: number;
  mobilized: number;
  casualties: number;
  stability: number;
  warSupport: number;
  exhaustion: number;
  economy: "civilian" | "partial" | "war";
  conscription: "volunteer" | "limited" | "extensive";
  stock: Stock;
  equipment: Arsenal;
  production: Production[];
  construction: Construction[];
  recruitment: Recruitment[];
  tech: string[];
  research: Project[];
  focuses: string[];
  focus: Project | null;
  relations: Record<string, number>;
  wars: string[];
  allies: string[];
  access: string[];
  embargoes: string[];
  pacts: Record<string, number>;
  justification: Record<string, number>;
  claims: string[];
  subjectOf: string | null;
  capitulated: boolean;
  victor: string | null;
  generals: General[];
  advisor: "industry" | "science" | "army";
  parties: Record<Ideology, number>;
  agency: boolean;
  agents: number;
  agentTraining: number;
  counterIntel: boolean;
  missions: AgentMission[];
  intel: Record<string, { level: number; expires: number }>;
  air: {
    mission: "idle" | "superiority" | "support" | "strategic";
    target: string;
  };
  navy: { mission: "idle" | "patrol" | "raid"; target: string };
  history: {
    day: number;
    treasury: number;
    factories: number;
    manpower: number;
  }[];
}
export interface Army {
  id: string;
  country: string;
  name: string;
  type: UnitType;
  province: string;
  strength: number;
  organization: number;
  morale: number;
  supply: number;
  experience: number;
  general: string | null;
  entrenchment: number;
  stance: "hold" | "advance";
  route: string[];
  move: { to: string; progress: number; days: number } | null;
}
export interface Battle {
  id: string;
  province: string;
  attacker: string;
  defender: string;
  started: number;
  attack: number;
  defense: number;
}
export interface Trade {
  id: string;
  from: string;
  to: string;
  resource: Resource;
  amount: number;
}
export interface Front {
  id: string;
  country: string;
  provinces: string[];
  armies: string[];
}
export interface GameEvent {
  day: number;
  text: string;
  kind: "info" | "war" | "economy" | "politics";
}
export interface World {
  version: 1;
  player: string;
  mode: "historical" | "alternative";
  day: number;
  seed: number;
  serial: number;
  tension: number;
  countries: Record<string, Country>;
  provinces: Record<string, Province>;
  armies: Army[];
  battles: Battle[];
  trades: Trade[];
  fronts: Front[];
  events: GameEvent[];
  firedEvents: string[];
}
export type Action =
  | { type: "front"; provinces: string[]; armies: string[] }
  | { type: "deleteFront"; id: string }
  | { type: "move"; army: string; to: string; append?: boolean }
  | { type: "halt"; army: string }
  | { type: "general"; army: string; general: string | null }
  | { type: "recruit"; unit: UnitType; province: string }
  | { type: "build"; building: Building; province: string }
  | { type: "cancelBuild"; id: string }
  | { type: "production"; equipment: Equipment; factories: number }
  | { type: "research"; id: string }
  | { type: "focus"; id: string }
  | { type: "economy"; law: Country["economy"] }
  | { type: "conscription"; law: Country["conscription"] }
  | { type: "advisor"; advisor: Country["advisor"] }
  | { type: "reform"; ideology: Ideology }
  | { type: "occupation"; province: string; policy: Province["occupation"] }
  | {
      type: "diplomacy";
      target: string;
      kind:
        | "improve"
        | "justify"
        | "war"
        | "alliance"
        | "pact"
        | "access"
        | "peace"
        | "embargo"
        | "aid"
        | "annex"
        | "puppet"
        | "liberate";
    }
  | { type: "trade"; target: string; resource: Resource; amount: number }
  | { type: "cancelTrade"; id: string }
  | { type: "air"; mission: Country["air"]["mission"]; target: string }
  | { type: "navy"; mission: Country["navy"]["mission"]; target: string }
  | { type: "paradrop"; army: string; to: string }
  | { type: "agency" }
  | { type: "trainAgent" }
  | { type: "counterIntel" }
  | { type: "mission"; target: string; mission: MissionType };
