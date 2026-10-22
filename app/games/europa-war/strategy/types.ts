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
  | "strategicBomber"
  | "reconPlane"
  | "transport"
  | "carrierFighter"
  | "ship"
  | "destroyer"
  | "battleship"
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
  | "radar"
  | "mine"
  | "airfield"
  | "antiAir";
export type MissionType =
  | "intel"
  | "sabotage"
  | "propaganda"
  | "plans"
  | "resistance"
  | "diplomacy"
  | "coup";
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
  automation: {
    economy: boolean;
    research: boolean;
    recruitment: boolean;
    operations: boolean;
  };
  cabinet: { economy: string; military: string; science: string };
  decisions: Record<string, number>;
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
    wings: AirWing[];
  };
  navy: {
    mission: "idle" | "patrol" | "raid";
    target: string;
    ships: Warship[];
    zone: SeaZone;
  };
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
  move: {
    to: string;
    progress: number;
    days: number;
    kind?: "paradrop";
  } | null;
  support: SupportType[];
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
  version: 2;
  player: string;
  mode: "historical" | "alternative";
  difficulty: "easy" | "normal" | "hard";
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
  plans: OffensivePlan[];
  conferences: PeaceConference[];
  warScore: Record<string, Record<string, number>>;
  events: GameEvent[];
  firedEvents: string[];
}
export type AirModel =
  | "fighter"
  | "bomber"
  | "strategicBomber"
  | "reconPlane"
  | "transport"
  | "carrierFighter";
export type AirMission =
  | "idle"
  | "superiority"
  | "support"
  | "strategic"
  | "recon"
  | "transport"
  | "naval";
export type ShipModel =
  | "ship"
  | "destroyer"
  | "battleship"
  | "submarine"
  | "carrier";
export type SeaZone =
  | "atlantic"
  | "north"
  | "baltic"
  | "mediterranean"
  | "black";
export type SupportType =
  | "artillery"
  | "engineers"
  | "logistics"
  | "hospital"
  | "recon";
export interface AirWing {
  id: string;
  name: string;
  model: AirModel;
  count: number;
  size: number;
  base: string;
  target: string;
  mission: AirMission;
  readiness: number;
  experience: number;
}
export interface Warship {
  id: string;
  name: string;
  model: ShipModel;
  health: number;
  experience: number;
  port: string;
  zone: SeaZone;
  mission: "idle" | "patrol" | "raid" | "escort";
  aircraft: number;
  transit: number;
}
export interface OffensivePlan {
  id: string;
  country: string;
  name: string;
  armies: string[];
  objectives: string[];
  preparation: number;
  active: boolean;
  stance: "careful" | "balanced" | "aggressive";
}
export interface PeaceConference {
  id: string;
  defeated: string;
  participants: string[];
  points: Record<string, number>;
  available: string[];
  awards: {
    province: string;
    country: string;
    kind: "annex" | "puppet" | "liberate";
    cost: number;
  }[];
  round: number;
  turn: number;
  status: "open" | "closed";
}
export type Action =
  | { type: "difficulty"; value: World["difficulty"] }
  | { type: "automation"; area: keyof Country["automation"]; enabled: boolean }
  | { type: "autoPlan"; area: keyof Country["automation"] }
  | { type: "support"; army: string; support: SupportType; remove?: boolean }
  | {
      type: "offensive";
      armies: string[];
      objectives: string[];
      stance: OffensivePlan["stance"];
    }
  | { type: "plan"; id: string; kind: "start" | "pause" | "delete" }
  | { type: "createWing"; model: AirModel; count: number; base: string }
  | {
      type: "wing";
      id: string;
      mission: AirMission;
      target: string;
      base?: string;
    }
  | { type: "disbandWing"; id: string }
  | { type: "commission"; model: ShipModel; port: string }
  | { type: "ship"; id: string; mission: Warship["mission"]; zone: SeaZone }
  | { type: "carrierAircraft"; id: string; count: number }
  | {
      type: "peaceClaim";
      conference: string;
      province: string;
      kind: "annex" | "puppet" | "liberate";
    }
  | { type: "peacePass"; conference: string }
  | { type: "release"; country: string }
  | { type: "cabinet"; slot: keyof Country["cabinet"]; id: string }
  | { type: "decision"; id: string; target?: string }
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
