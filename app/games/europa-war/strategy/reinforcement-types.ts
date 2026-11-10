import type { Equipment, SupportType, UnitType } from "./types";

/** Paid personnel and equipment, kept outside the country's spendable stock. */
export interface ReinforcementCargo {
  manpower: number;
  equipment: Partial<Record<Equipment, number>>;
}
export interface ReinforcementLedger {
  dispatched: ReinforcementCargo;
  delivered: ReinforcementCargo;
  returned: ReinforcementCargo;
  lost: ReinforcementCargo;
}
export interface ReinforcementShipment {
  id: string;
  country: string;
  army: string;
  unit: UnitType;
  /** Frozen composition: editing support never turns old cargo into free equipment. */
  support: SupportType[];
  origin: string;
  province: string;
  destination: string;
  /** Only the planned next node (0–1 entries); reroute at each arrival. */
  route: string[];
  leg: { to: string; hours: number; progress: number } | null;
  /** Loading at the depot consumes at least one simulation hour. */
  loadingHours: number;
  status: "outbound" | "returning";
  blocked: null | "route" | "combat" | "capacity" | "depot" | "supply";
  cargo: ReinforcementCargo;
  createdHour: number;
}
export interface ReinforcementState {
  shipments: ReinforcementShipment[];
  ledger: Record<string, ReinforcementLedger>;
  /** Prevent repeated dispatch if the same boundary hour is resolved twice. */
  lastDispatchHour: number;
}
