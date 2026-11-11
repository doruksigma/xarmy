import type { Building, Equipment, Ideology, Resource } from "./types";

export type NationalEffect =
  | {
      kind: "building";
      building: Building;
      amount: number;
      location?: "capital" | "port" | "lowest";
    }
  | { kind: "equipment"; equipment: Equipment; amount: number }
  | { kind: "stock"; resource: Resource; amount: number }
  | {
      kind:
        | "treasury"
        | "stability"
        | "warSupport"
        | "exhaustion"
        | "political"
        | "science";
      amount: number;
    }
  | { kind: "research"; technology: string; progress: number; ifKnown?: number }
  | { kind: "training"; experience: number; organization: number }
  | { kind: "party"; ideology: Ideology; amount: number }
  | { kind: "government"; ideology: Ideology; name?: string; leader?: string }
  | { kind: "uprising"; government: Ideology; opposition: Ideology }
  | { kind: "restoration"; name: string; leader: string };

export interface NationalProgramme {
  costs?: {
    treasury?: number;
    stock?: Partial<Record<Resource, number>>;
    equipment?: Partial<Record<Equipment, number>>;
  };
  requirements?: {
    independent?: boolean;
    peace?: boolean;
    ideologies?: Ideology[];
    minStability?: number;
    tech?: string[];
    civilWarVictory?: boolean;
    noCivilWar?: boolean;
  };
  effects: NationalEffect[];
}
