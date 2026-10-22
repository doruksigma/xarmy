import type {
  AirMission,
  AirModel,
  Equipment,
  SeaZone,
  ShipModel,
  SupportType,
} from "./types";

export const AIRCRAFT: Record<
  AirModel,
  {
    name: string;
    range: number;
    attack: number;
    missions: AirMission[];
    fuel: number;
  }
> = {
  fighter: {
    name: "Avcı",
    range: 250,
    attack: 1,
    missions: ["superiority"],
    fuel: 0.035,
  },
  bomber: {
    name: "Taktik bombardıman",
    range: 360,
    attack: 0.25,
    missions: ["support", "strategic", "naval"],
    fuel: 0.07,
  },
  strategicBomber: {
    name: "Stratejik bombardıman",
    range: 680,
    attack: 0.3,
    missions: ["strategic"],
    fuel: 0.11,
  },
  reconPlane: {
    name: "Keşif",
    range: 450,
    attack: 0.08,
    missions: ["recon"],
    fuel: 0.025,
  },
  transport: {
    name: "Nakliye",
    range: 340,
    attack: 0,
    missions: ["transport"],
    fuel: 0.05,
  },
  carrierFighter: {
    name: "Deniz avcısı",
    range: 220,
    attack: 0.9,
    missions: ["superiority", "naval"],
    fuel: 0.04,
  },
};
export const AIR_MISSIONS: Record<AirMission, string> = {
  idle: "Üste bekle",
  superiority: "Hava üstünlüğü",
  support: "Kara birliklerini destekle",
  strategic: "Sanayiyi bombala",
  recon: "Keşif yap",
  transport: "Hava indirmeye hazırlan",
  naval: "Gemilere saldır",
};
export const SHIPS: Record<
  ShipModel,
  { name: string; power: number; armor: number; antiSub: number; fuel: number }
> = {
  ship: { name: "Kruvazör", power: 12, armor: 1.2, antiSub: 0.5, fuel: 0.5 },
  destroyer: { name: "Muhrip", power: 6, armor: 0.7, antiSub: 2.5, fuel: 0.25 },
  battleship: { name: "Zırhlı", power: 30, armor: 3, antiSub: 0.1, fuel: 1.2 },
  submarine: {
    name: "Denizaltı",
    power: 5,
    armor: 0.6,
    antiSub: 0,
    fuel: 0.15,
  },
  carrier: {
    name: "Uçak gemisi",
    power: 8,
    armor: 1.3,
    antiSub: 0.3,
    fuel: 0.8,
  },
};
export const SEA_ZONES: Record<
  SeaZone,
  { name: string; x: number; y: number; neighbors: SeaZone[] }
> = {
  atlantic: {
    name: "Atlantik",
    x: 230,
    y: 380,
    neighbors: ["north", "mediterranean"],
  },
  north: {
    name: "Kuzey Denizi",
    x: 520,
    y: 300,
    neighbors: ["atlantic", "baltic"],
  },
  baltic: { name: "Baltık Denizi", x: 720, y: 320, neighbors: ["north"] },
  mediterranean: {
    name: "Akdeniz",
    x: 650,
    y: 795,
    neighbors: ["atlantic", "black"],
  },
  black: { name: "Karadeniz", x: 1000, y: 625, neighbors: ["mediterranean"] },
};
export const SUPPORT: Record<
  SupportType,
  {
    name: string;
    description: string;
    equipment: Partial<Record<Equipment, number>>;
    tech?: string;
  }
> = {
  artillery: {
    name: "Destek topçusu",
    description: "Saldırı +%18. 12 top ve 10 tüfek.",
    equipment: { artillery: 12, rifle: 10 },
  },
  engineers: {
    name: "İstihkâm",
    description: "Savunma +%15; nehir geçiş cezasını yarıya indirir. 20 tüfek.",
    equipment: { rifle: 20 },
  },
  logistics: {
    name: "Lojistik",
    description: "Yerel ikmal +%20; yakıt tüketimi −%20. 15 kamyon.",
    equipment: { truck: 15 },
    tech: "logistics",
  },
  hospital: {
    name: "Sahra hastanesi",
    description:
      "Kayıpların %20’sini insan gücüne geri kazandırır. 10 kamyon, 15 tüfek.",
    equipment: { truck: 10, rifle: 15 },
    tech: "motorization",
  },
  recon: {
    name: "Keşif bölüğü",
    description: "Saldırı +%8, ilerleme hızı +%10. 10 kamyon.",
    equipment: { truck: 10 },
    tech: "motorization",
  },
};
export interface CabinetOption {
  id: string;
  name: string;
  description: string;
  bonus: number;
}
export function cabinetOptions(
  country: string,
  slot: "economy" | "military" | "science",
): CabinetOption[] {
  const names: Record<string, [string, string, string]> = {
    turkey: ["Celal Bayar", "Fevzi Çakmak", "İstanbul Üniversitesi"],
    germany: ["Hjalmar Schacht", "Ludwig Beck", "Kaiser Wilhelm Enstitüleri"],
    france: [
      "Vincent Auriol",
      "Maurice Gamelin",
      "Fransız araştırma kurumları",
    ],
    uk: ["Neville Chamberlain", "Cyril Deverell", "Cambridge Üniversitesi"],
    italy: ["Paolo Thaon di Revel", "Pietro Badoglio", "Roma Üniversitesi"],
    ussr: [
      "Grigori Ordjonikidze",
      "Mihail Tuhaçevski",
      "Sovyet Bilimler Akademisi",
    ],
  };
  const n = names[country] ?? [
    "Sanayi bakanlığı",
    "Genelkurmay",
    "Ulusal araştırma kurulu",
  ];
  return slot === "economy"
    ? [
        { id: "builder", name: n[0], description: "İnşaat +%15", bonus: 0.15 },
        {
          id: "producer",
          name: "Silahlanma kurulu",
          description: "Askerî üretim +%12",
          bonus: 0.12,
        },
        {
          id: "trader",
          name: "Ticaret heyeti",
          description: "İthalat maliyeti −%15",
          bonus: 0.15,
        },
      ]
    : slot === "military"
      ? [
          {
            id: "defender",
            name: n[1],
            description: "Kara savunması +%10",
            bonus: 0.1,
          },
          {
            id: "planner",
            name: "Harekât kurulu",
            description: "Taarruz hazırlığı iki kat hızlı",
            bonus: 1,
          },
          {
            id: "quartermaster",
            name: "İkmal başkanlığı",
            description: "Ordu ikmali +%10",
            bonus: 0.1,
          },
        ]
      : [
          {
            id: "institute",
            name: n[2],
            description: "Bütün araştırmalar +%10",
            bonus: 0.1,
          },
          {
            id: "engineers",
            name: "Mühendislik heyeti",
            description: "Sanayi ve zırh araştırmaları +%25",
            bonus: 0.25,
          },
          {
            id: "doctrine",
            name: "Harp akademisi",
            description: "Doktrin araştırmaları +%30",
            bonus: 0.3,
          },
        ];
}
