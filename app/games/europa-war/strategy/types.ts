import type { HistoricalState } from "./historical-types";
import type { CommandState } from "./command-types";
import type { RandomStreams } from "./rng";
import type { ReinforcementState } from "./reinforcement-types";

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
  /** No front means this commander issues no automatic movement orders. */
  front?: {
    target: string;
    stance: "defend" | "attack";
    assignments: Record<string, string>;
  };
}
export interface Production {
  equipment: Equipment;
  factories: number;
  efficiency: number;
  /** Material-backed work toward the next whole item. Missing in legacy saves. */
  progress?: number;
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
  autoAssignCommanders?: boolean;
  advisor: "industry" | "science" | "army";
  automation: {
    economy: boolean;
    research: boolean;
    recruitment: boolean;
    operations: boolean;
    /** Separate opt-in helpers; absent legacy fields inherit operations. */
    air?: boolean;
    navy?: boolean;
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
  /** Explicit group order; only members on the same ground leg march together. */
  marchGroup?: string;
  route: string[];
  move: {
    to: string;
    progress: number;
    days: number;
    kind?: "paradrop" | "transport";
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
  /** Absent only in events retained from a pre-hourly save. */
  hour?: number;
  text: string;
  kind: "info" | "war" | "economy" | "politics";
}
/** Actual daily effects, not projected combat odds. Only the latest settlement
 * is kept, with at most one aggregate per country. Fractional aircraft counts
 * retain the existing abstract loss/replacement model. */
export interface AirNavalDailyReport {
  country: string;
  day: number;
  air: {
    flown: number;
    combatLosses: number;
    baseLosses: number;
    reinforced: number;
    fuelSpent: number;
    bombingDamage: number;
    navalDamage: number;
    /** Number of participating wings encountering fighters or ground AA. */
    engagements: number;
  };
  navy: {
    active: number;
    combatDamage: number;
    attritionDamage: number;
    sunk: number;
    aircraftLost: number;
    repaired: number;
    fuelSpent: number;
    /** Number of ships exchanging fire or hit by naval strikes. */
    engagements: number;
  };
}
export interface World {
  /** Recorded only after a protocol command succeeds. */
  commandState?: CommandState;
  historical?: HistoricalState;
  version: 3;
  /** Missing only on saves created before the global scenario. */
  mapVersion?: "world-1936-v1";
  player: string;
  mode: "historical" | "alternative";
  difficulty: "easy" | "normal" | "hard";
  day: number;
  hour: number;
  /** Legacy intelligence state; mirrors rng.intelligence when streams exist. */
  seed: number;
  /** Absent only on pre-stream saves; initialized lazily on the first draw. */
  rng?: RandomStreams;
  serial: number;
  tension: number;
  countries: Record<string, Country>;
  provinces: Record<string, Province>;
  armies: Army[];
  battles: Battle[];
  /** Absent in legacy saves and before the first daily air/naval settlement. */
  airNavalReports?: AirNavalDailyReport[];
  /** Paid ground replacements in transit; absent in saves predating logistics. */
  reinforcements?: ReinforcementState;
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
  | "black"
  | "southAtlantic"
  | "northPacific"
  | "southPacific"
  | "indian"
  | "caribbean"
  | "arctic";
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
  | { type: "commanderAutoAssign"; enabled: boolean }
  | { type: "commanderDeploy"; general: string; target: string }
  | { type: "commanderStance"; general: string; stance: "defend" | "attack" }
  | { type: "commanderRecall"; general: string }
  | { type: "commanderCreate" }
  | {
      type: "commanderOrder";
      general: string;
      kind: "move" | "front" | "offensive" | "halt";
      provinces: string[];
      stance?: OffensivePlan["stance"];
    }
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
  | {
      type: "move";
      army: string;
      to: string;
      append?: boolean;
      stance?: "hold" | "advance";
    }
  | {
      type: "moveGroup";
      armies: string[];
      to: string;
      append?: boolean;
      stance?: "hold" | "advance";
    }
  | { type: "halt"; army: string }
  | { type: "haltGroup"; armies: string[] }
  | { type: "general"; army: string; general: string | null }
  | { type: "recruit"; unit: UnitType; province: string }
  | { type: "build"; building: Building; province: string }
  | { type: "cancelBuild"; id: string }
  | { type: "production"; equipment: Equipment; factories: number }
  | { type: "research"; id: string }
  | { type: "focus"; id: string }
  | { type: "historicalChoice"; id: string; choice: "accept" | "decline" }
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
