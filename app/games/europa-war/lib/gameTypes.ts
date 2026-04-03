export type UnitType = "infantry" | "tank" | "aircraft";

export type CountryId =
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

export interface Unit {
  id: string;
  type: UnitType;
  attack: number;
  defense: number;
  moveDays: number;
  cost: number;
  manpowerCost: number;
  ownerCountryId: CountryId;
}

export interface City {
  id: string;
  name: string;
  countryId: CountryId;
  ownerCountryId: CountryId;
  x: number;
  y: number;
  economy: number;
  factories: number;
  stationedUnits: Unit[];
}

export interface Country {
  id: CountryId;
  name: string;
  color: string;
  treasury: number;
  factories: number;
}
