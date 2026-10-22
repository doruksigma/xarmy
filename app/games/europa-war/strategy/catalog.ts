import type {
  Building,
  Equipment,
  Ideology,
  MissionType,
  Resource,
  Terrain,
  UnitType,
} from "./types";

export const RESOURCES: Record<Resource, string> = {
  iron: "Demir",
  steel: "Çelik",
  oil: "Petrol",
  aluminum: "Alüminyum",
  rubber: "Kauçuk",
  fuel: "Yakıt",
};
export const IDEOLOGIES: Record<Ideology, string> = {
  democracy: "Demokrasi",
  republic: "Cumhuriyet",
  monarchy: "Monarşi",
  fascism: "Faşizm",
  communism: "Komünizm",
};
export const TERRAINS: Record<
  Terrain,
  {
    name: string;
    attack: number;
    defense: number;
    speed: number;
    color: string;
  }
> = {
  plains: { name: "Ova", attack: 1, defense: 1, speed: 1, color: "#8e9a6b" },
  urban: {
    name: "Şehir",
    attack: 0.8,
    defense: 1.4,
    speed: 0.8,
    color: "#929797",
  },
  mountain: {
    name: "Dağ",
    attack: 0.55,
    defense: 1.7,
    speed: 0.45,
    color: "#a69a87",
  },
  forest: {
    name: "Orman",
    attack: 0.75,
    defense: 1.3,
    speed: 0.7,
    color: "#536f59",
  },
  marsh: {
    name: "Bataklık",
    attack: 0.6,
    defense: 1.3,
    speed: 0.5,
    color: "#6c9390",
  },
  desert: {
    name: "Kurak arazi",
    attack: 0.9,
    defense: 1,
    speed: 0.7,
    color: "#b9a379",
  },
};
type UnitDef = {
  name: string;
  symbol: string;
  men: number;
  attack: number;
  defense: number;
  speed: number;
  fuel: number;
  days: number;
  equipment: Partial<Record<Equipment, number>>;
  tech?: string;
};
export const UNITS: Record<UnitType, UnitDef> = {
  infantry: {
    name: "Piyade",
    symbol: "×",
    men: 9000,
    attack: 13,
    defense: 20,
    speed: 1,
    fuel: 0,
    days: 28,
    equipment: { rifle: 90 },
  },
  artillery: {
    name: "Topçu destekli piyade",
    symbol: "●",
    men: 8000,
    attack: 24,
    defense: 18,
    speed: 0.85,
    fuel: 0,
    days: 35,
    equipment: { rifle: 65, artillery: 24 },
  },
  motorized: {
    name: "Motorize piyade",
    symbol: "⊗",
    men: 9000,
    attack: 17,
    defense: 18,
    speed: 1.8,
    fuel: 1,
    days: 35,
    equipment: { rifle: 90, truck: 35 },
    tech: "motorization",
  },
  mechanized: {
    name: "Mekanize piyade",
    symbol: "▣",
    men: 8000,
    attack: 30,
    defense: 34,
    speed: 1.6,
    fuel: 1.5,
    days: 50,
    equipment: { rifle: 80, truck: 40, mediumTank: 15 },
    tech: "mechanization",
  },
  lightTank: {
    name: "Hafif tank",
    symbol: "▱",
    men: 5000,
    attack: 28,
    defense: 18,
    speed: 2,
    fuel: 1.5,
    days: 40,
    equipment: { rifle: 35, lightTank: 45 },
    tech: "armor1",
  },
  mediumTank: {
    name: "Orta tank",
    symbol: "▰",
    men: 6000,
    attack: 42,
    defense: 30,
    speed: 1.5,
    fuel: 2,
    days: 55,
    equipment: { rifle: 40, mediumTank: 45 },
    tech: "armor2",
  },
  heavyTank: {
    name: "Ağır tank",
    symbol: "▤",
    men: 6000,
    attack: 52,
    defense: 48,
    speed: 0.7,
    fuel: 3,
    days: 70,
    equipment: { rifle: 40, heavyTank: 35 },
    tech: "armor3",
  },
  special: {
    name: "Özel kuvvetler",
    symbol: "✦",
    men: 5000,
    attack: 22,
    defense: 26,
    speed: 1.25,
    fuel: 0,
    days: 55,
    equipment: { rifle: 65 },
    tech: "special",
  },
  mountain: {
    name: "Dağ komandoları",
    symbol: "△",
    men: 6000,
    attack: 18,
    defense: 26,
    speed: 1.1,
    fuel: 0,
    days: 45,
    equipment: { rifle: 70 },
    tech: "special",
  },
  paratrooper: {
    name: "Paraşütçü",
    symbol: "↧",
    men: 5000,
    attack: 18,
    defense: 17,
    speed: 1.1,
    fuel: 0,
    days: 60,
    equipment: { rifle: 65 },
    tech: "airborne",
  },
};
export const EQUIPMENT: Record<
  Equipment,
  {
    name: string;
    cost: number;
    inputs: Partial<Record<Resource, number>>;
    tech?: string;
    naval?: boolean;
  }
> = {
  rifle: { name: "Piyade silahları", cost: 1, inputs: { steel: 0.5 } },
  artillery: { name: "Saha topu", cost: 3, inputs: { steel: 1.5 } },
  truck: {
    name: "Kamyon",
    cost: 3,
    inputs: { steel: 1, rubber: 0.2 },
    tech: "motorization",
  },
  lightTank: {
    name: "Hafif tank",
    cost: 5,
    inputs: { steel: 2 },
    tech: "armor1",
  },
  mediumTank: {
    name: "Orta tank",
    cost: 8,
    inputs: { steel: 3 },
    tech: "armor2",
  },
  heavyTank: {
    name: "Ağır tank",
    cost: 12,
    inputs: { steel: 5 },
    tech: "armor3",
  },
  fighter: {
    name: "Avcı uçağı",
    cost: 7,
    inputs: { aluminum: 2, rubber: 0.3 },
    tech: "aviation1",
  },
  bomber: {
    name: "Taktik bombardıman uçağı",
    cost: 12,
    inputs: { aluminum: 3, steel: 1, rubber: 0.4 },
    tech: "aviation2",
  },
  strategicBomber: {
    name: "Stratejik bombardıman",
    cost: 22,
    inputs: { aluminum: 5, steel: 2, rubber: 0.8 },
    tech: "aviation3",
  },
  reconPlane: {
    name: "Keşif uçağı",
    cost: 6,
    inputs: { aluminum: 1.5, rubber: 0.2 },
    tech: "recon",
  },
  transport: {
    name: "Nakliye uçağı",
    cost: 14,
    inputs: { aluminum: 3, steel: 1 },
    tech: "airborne",
  },
  carrierFighter: {
    name: "Deniz avcısı",
    cost: 9,
    inputs: { aluminum: 2, rubber: 0.4 },
    tech: "carriers",
  },
  destroyer: {
    name: "Muhrip",
    cost: 90,
    inputs: { steel: 15 },
    tech: "naval1",
    naval: true,
  },
  battleship: {
    name: "Zırhlı",
    cost: 400,
    inputs: { steel: 70, aluminum: 5 },
    tech: "naval2",
    naval: true,
  },
  ship: {
    name: "Kruvazör",
    cost: 180,
    inputs: { steel: 30 },
    tech: "naval1",
    naval: true,
  },
  submarine: {
    name: "Denizaltı",
    cost: 90,
    inputs: { steel: 15 },
    tech: "submarines",
    naval: true,
  },
  carrier: {
    name: "Uçak gemisi",
    cost: 350,
    inputs: { steel: 65, aluminum: 12 },
    tech: "carriers",
    naval: true,
  },
};
export const BUILDINGS: Record<
  Building,
  { name: string; cost: number; work: number; max: number; description: string }
> = {
  civil: {
    name: "Sivil fabrika",
    cost: 180,
    work: 420,
    max: 12,
    description: "İnşaat kapasitesi ve vergi geliri sağlar.",
  },
  military: {
    name: "Askerî fabrika",
    cost: 150,
    work: 360,
    max: 12,
    description: "Silah, araç ve uçak üretim hattı kapasitesi.",
  },
  dock: {
    name: "Tersane",
    cost: 200,
    work: 500,
    max: 8,
    description: "Liman eyaletinde gemi üretir.",
  },
  infra: {
    name: "Altyapı / yol",
    cost: 70,
    work: 140,
    max: 5,
    description: "Kaynak çıkarma ve yerel ikmal artar.",
  },
  rail: {
    name: "Demiryolu",
    cost: 70,
    work: 180,
    max: 5,
    description: "Kara ikmali kapasitesini artırır.",
  },
  hub: {
    name: "İkmal merkezi",
    cost: 120,
    work: 240,
    max: 3,
    description: "Bağlantısı olan eyalette ikmal kapasitesini artırır.",
  },
  refinery: {
    name: "Rafineri / yakıt deposu",
    cost: 140,
    work: 300,
    max: 5,
    description: "Petrolü yakıta dönüştürür; depolama kapasitesi sağlar.",
  },
  synthetic: {
    name: "Sentetik tesis",
    cost: 160,
    work: 340,
    max: 5,
    description: "Her gün 3 kauçuk üretir.",
  },
  fort: {
    name: "Tahkimat",
    cost: 60,
    work: 160,
    max: 5,
    description: "Eyaletin savunmasını seviye başına %15 artırır.",
  },
  mine: {
    name: "Maden işletmesi",
    cost: 100,
    work: 220,
    max: 5,
    description:
      "Bölgedeki demir, petrol ve alüminyum çıkarımını seviye başına %25 artırır.",
  },
  airfield: {
    name: "Hava üssü",
    cost: 100,
    work: 200,
    max: 5,
    description:
      "Seviye başına 100 uçak kapasitesi. Üs aşırı dolarsa görev etkinliği düşer.",
  },
  antiAir: {
    name: "Uçaksavar bataryası",
    cost: 75,
    work: 180,
    max: 5,
    description:
      "Bombardıman hasarını azaltır ve saldıran uçaklara kayıp verdirir.",
  },
  radar: {
    name: "Radar istasyonu",
    cost: 100,
    work: 240,
    max: 3,
    description: "Hava tespitini ve bombardımana karşı savunmayı artırır.",
  },
};
export interface Technology {
  id: string;
  name: string;
  branch: string;
  year: number;
  days: number;
  requires: string[];
  description: string;
}
export const TECHNOLOGIES: Technology[] = [
  [
    "weapons1",
    "Modern piyade silahları",
    "Kara",
    1936,
    70,
    [],
    "Piyade saldırısı +%15.",
  ],
  [
    "weapons2",
    "Gelişmiş piyade silahları",
    "Kara",
    1939,
    110,
    ["weapons1"],
    "Piyade saldırısına ilave +%20.",
  ],
  [
    "weapons3",
    "Otomatik silahlar",
    "Kara",
    1942,
    140,
    ["weapons2"],
    "Piyade saldırısına ilave +%20.",
  ],
  [
    "armor1",
    "Hafif zırhlılar",
    "Zırh",
    1936,
    80,
    [],
    "Hafif tank üretimi ve tümenleri açılır.",
  ],
  [
    "armor2",
    "Orta tank tasarımı",
    "Zırh",
    1939,
    130,
    ["armor1"],
    "Orta tank üretimi ve tümenleri açılır.",
  ],
  [
    "armor3",
    "Ağır zırh",
    "Zırh",
    1941,
    160,
    ["armor2"],
    "Ağır tank üretimi ve tümenleri açılır.",
  ],
  [
    "engines",
    "Gelişmiş motorlar",
    "Zırh",
    1938,
    90,
    ["armor1"],
    "Motorlu birlik hızı +%20, yakıt tüketimi −%15.",
  ],
  [
    "motorization",
    "Motorize lojistik",
    "Kara",
    1936,
    70,
    [],
    "Kamyon ve motorize piyade açılır.",
  ],
  [
    "mechanization",
    "Mekanize piyade",
    "Kara",
    1941,
    150,
    ["motorization", "armor2"],
    "Mekanize tümen açılır.",
  ],
  [
    "special",
    "Özel kuvvet eğitimi",
    "Kara",
    1936,
    90,
    [],
    "Özel kuvvet ve dağ komandosu açılır.",
  ],
  [
    "airborne",
    "Hava indirme eğitimi",
    "Hava",
    1939,
    120,
    ["special", "aviation1"],
    "Paraşütçü ve hava indirme emri açılır.",
  ],
  [
    "aviation1",
    "Avcı tasarımı",
    "Hava",
    1936,
    80,
    [],
    "Avcı uçağı üretimi açılır.",
  ],
  [
    "aviation2",
    "Bombardıman tasarımı",
    "Hava",
    1937,
    100,
    ["aviation1"],
    "Taktik ve stratejik bombardıman görevleri açılır.",
  ],
  [
    "aviation3",
    "Gelişmiş uçak motoru",
    "Hava",
    1940,
    140,
    ["aviation2"],
    "Hava muharebesi etkinliği +%30.",
  ],
  [
    "recon",
    "Hava keşfi",
    "Hava",
    1938,
    80,
    ["aviation1"],
    "Hava üstünlüğü görevinde düşman istihbaratı artar.",
  ],
  [
    "naval1",
    "Modern tersaneler",
    "Deniz",
    1936,
    80,
    [],
    "Muharebe filosu üretimi açılır.",
  ],
  [
    "submarines",
    "Denizaltı harbi",
    "Deniz",
    1936,
    90,
    ["naval1"],
    "Denizaltı ve konvoy baskını açılır.",
  ],
  [
    "carriers",
    "Uçak gemileri",
    "Deniz",
    1938,
    160,
    ["naval1", "aviation1"],
    "Uçak gemileri açılır; deniz gücüne hava desteği sağlar.",
  ],
  [
    "naval2",
    "Deniz topçuluğu",
    "Deniz",
    1940,
    110,
    ["naval1"],
    "Deniz muharebesi gücü +%25.",
  ],
  [
    "industry1",
    "Takım tezgâhları",
    "Sanayi",
    1936,
    80,
    [],
    "Üretim hızı +%15.",
  ],
  [
    "industry2",
    "Seri üretim",
    "Sanayi",
    1939,
    120,
    ["industry1"],
    "Üretim hızı ilave +%20.",
  ],
  [
    "logistics",
    "Lojistik teşkilatı",
    "Sanayi",
    1937,
    90,
    [],
    "İkmal kapasitesi +%20.",
  ],
  [
    "radar",
    "Radar ve erken uyarı",
    "İstihbarat",
    1938,
    100,
    [],
    "Radar inşası ve hava tespit bonusu.",
  ],
  [
    "encryption",
    "Şifreleme",
    "İstihbarat",
    1936,
    90,
    [],
    "Karşı casusluk +%20.",
  ],
  [
    "decryption",
    "Şifre çözme",
    "İstihbarat",
    1938,
    110,
    ["encryption"],
    "Operasyon başarı olasılığı +%15.",
  ],
  [
    "landDoctrine",
    "Birleşik silah doktrini",
    "Doktrin",
    1936,
    110,
    [],
    "Kara saldırısı ve savunması +%15.",
  ],
  [
    "airDoctrine",
    "Hava harekât doktrini",
    "Doktrin",
    1937,
    110,
    ["aviation1"],
    "Hava muharebesi ve yakın destek +%20.",
  ],
  [
    "navalDoctrine",
    "Deniz harekât doktrini",
    "Doktrin",
    1937,
    110,
    ["naval1"],
    "Devriye ve konvoy koruması +%20.",
  ],
].map(([id, name, branch, year, days, requires, description]) => ({
  id,
  name,
  branch,
  year,
  days,
  requires,
  description,
})) as Technology[];
export interface Focus {
  id: string;
  name: string;
  branch: string;
  days: number;
  requires: string[];
  excludes?: string;
  effect:
    | "civil"
    | "military"
    | "science"
    | "army"
    | "diplomacy"
    | "stability"
    | "fuel"
    | "national"
    | Ideology;
  description: string;
}
export function focusTree(country: string): Focus[] {
  const titles: Record<string, [string, string, string]> = {
    turkey: ["Birinci Sanayi Planı", "Ordu Modernizasyonu", "Yurtta Sulh"],
    germany: ["Dört Yıllık Plan", "Zırhlı Birlikler", "Avrupa Diplomasisi"],
    france: ["Sanayi Seferberliği", "Savunma Doktrini", "Kolektif Güvenlik"],
    uk: ["İmparatorluk Sanayisi", "Yeniden Silahlanma", "Avrupa Dengesi"],
    italy: ["Sanayi Hamlesi", "Regio Esercito", "Akdeniz Politikası"],
    ussr: ["Beş Yıllık Plan", "Kızıl Ordu Reformu", "Kolektif Güvenlik"],
  };
  const t = titles[country] ?? [
    "Sanayileşme Planı",
    "Ordu Reformu",
    "Bölgesel Güvenlik",
  ];
  const common: Focus[] = [
    {
      id: "industry",
      name: t[0],
      branch: "Sanayi",
      days: 56,
      requires: [],
      effect: "civil",
      description: "Başkentte +2 sivil fabrika.",
    },
    {
      id: "railway",
      name:
        country === "turkey" ? "Anadolu Demiryolları" : "Ulusal Demiryolları",
      branch: "Sanayi",
      days: 56,
      requires: ["industry"],
      effect: "fuel",
      description: "Kontrol edilen eyaletlerde +1 demiryolu, +300 yakıt.",
    },
    {
      id: "science",
      name:
        country === "turkey" ? "Üniversite Reformu" : "Araştırma Enstitüleri",
      branch: "Sanayi",
      days: 70,
      requires: ["industry"],
      effect: "science",
      description: "Araştırma hızı +%15; ek araştırma yuvası.",
    },
    {
      id: "industry2",
      name:
        country === "turkey"
          ? "İkinci Sanayi Planı"
          : "Ağır Sanayi Yatırımları",
      branch: "Sanayi",
      days: 70,
      requires: ["railway"],
      effect: "military",
      description: "Başkentte +2 askerî fabrika.",
    },
    {
      id: "army",
      name: t[1],
      branch: "Ordu",
      days: 56,
      requires: [],
      effect: "army",
      description: "+120 piyade silahı; birlik organizasyonu toparlanır.",
    },
    {
      id: "arsenal",
      name:
        country === "turkey"
          ? "Kırıkkale Silah Sanayisi"
          : "Ulusal Silah Sanayisi",
      branch: "Ordu",
      days: 56,
      requires: ["army"],
      effect: "military",
      description: "Başkentte +2 askerî fabrika.",
    },
    {
      id: "officers",
      name: "Harp Akademileri",
      branch: "Ordu",
      days: 70,
      requires: ["army"],
      effect: "science",
      description: "Araştırma hızı +%15; ek araştırma yuvası.",
    },
    {
      id: "mobilize",
      name: "Seferberlik Hazırlığı",
      branch: "Ordu",
      days: 56,
      requires: ["arsenal"],
      effect: "army",
      description: "+120 piyade silahı ve organizasyon.",
    },
    {
      id: "diplomacy",
      name: t[2],
      branch: "Diplomasi",
      days: 56,
      requires: [],
      effect: "diplomacy",
      description: "Komşularla ilişkiler +20, dünya gerilimi −2.",
    },
    {
      id: "regional",
      name:
        country === "turkey"
          ? "Balkan ve Sadabat Diplomasisi"
          : "Bölgesel İşbirliği",
      branch: "Diplomasi",
      days: 70,
      requires: ["diplomacy"],
      effect: "diplomacy",
      description: "Komşularla ilişkiler +20; anlaşma kabulü kolaylaşır.",
    },
    {
      id: "stability",
      name: "Ulusal Birlik",
      branch: "Siyaset",
      days: 56,
      requires: [],
      effect: "stability",
      description: "İstikrar +15, siyasi güç +50.",
    },
    {
      id: "democratic",
      name: country === "turkey" ? "Çok Partili Hayat" : "Demokratik Reform",
      branch: "Siyaset",
      days: 90,
      requires: ["stability"],
      excludes: "authoritarian",
      effect: "democracy",
      description: "Demokrasiye geçiş; demokratik parti desteği artar.",
    },
    {
      id: "authoritarian",
      name: "Merkezî Yönetim",
      branch: "Siyaset",
      days: 90,
      requires: ["stability"],
      excludes: "democratic",
      effect: "republic",
      description: "Merkezî cumhuriyet yönetimi; siyasi destek artar.",
    },
  ];
  const national: Record<string, [string, string, string, string, string][]> = {
    turkey: [
      [
        "montreux",
        "Montrö ve Boğazların Güvenliği",
        "Diplomasi",
        "diplomacy",
        "İstanbul'a +2 tahkimat; komşularla +15 ilişki.",
      ],
      [
        "etatism",
        "Devletçilik ve Sümerbank",
        "Sanayi",
        "industry",
        "Ankara ve İzmir'e birer sivil fabrika; +150 hazine.",
      ],
      [
        "karabuk",
        "Karabük Demir Çelik",
        "Sanayi",
        "industry2",
        "Samsun'a +2 maden; +200 çelik.",
      ],
      [
        "kayseri",
        "Kayseri Tayyare Fabrikası",
        "Ordu",
        "arsenal",
        "Ankara'ya +1 hava üssü; 20 avcı ve havacılık araştırma temeli.",
      ],
      [
        "balkanPact",
        "Balkan Güvenlik Hattı",
        "Diplomasi",
        "regional",
        "Yunanistan, Romanya ve Yugoslavya ile +35 ilişki ve karşılıklı bir yıllık pakt.",
      ],
      [
        "neutrality",
        "Silahlı Tarafsızlık",
        "Diplomasi",
        "montreux",
        "+15 istikrar; ordunun organizasyonu toparlanır; sınır eyaletlerine tahkimat.",
      ],
      [
        "nationalDefense",
        "Millî Müdafaa Sanayisi",
        "Ordu",
        "mobilize",
        "Ankara'ya askerî fabrika, 30 top ve 30 kamyon.",
      ],
      [
        "cooperatives",
        "Köy Kalkınma Hamlesi",
        "Sanayi",
        "railway",
        "Bütün kendi eyaletlerinde +1 altyapı ve +10 istikrar.",
      ],
    ],
    germany: [
      [
        "autobahn",
        "Reichsautobahn",
        "Sanayi",
        "railway",
        "Kendi eyaletlerinde +1 altyapı; motorlu birlikler için 50 kamyon.",
      ],
      [
        "panzer",
        "Panzer Doktrini",
        "Ordu",
        "arsenal",
        "Hafif zırh ve kara doktrini; 45 hafif tank.",
      ],
      [
        "syntheticProgram",
        "Sentetik Yakıt Programı",
        "Sanayi",
        "industry2",
        "Başkentte +2 sentetik tesis, +1 rafineri.",
      ],
      [
        "submarineProgram",
        "Denizaltı Programı",
        "Ordu",
        "mobilize",
        "Denizaltı teknolojisi; limanda +2 tersane; 2 tamamlanmış denizaltı.",
      ],
    ],
    france: [
      [
        "maginot",
        "Doğu Tahkimatları",
        "Ordu",
        "army",
        "Almanya sınırındaki eyaletlere +3 tahkimat.",
      ],
      [
        "popularFront",
        "Toplumsal Uzlaşma",
        "Siyaset",
        "stability",
        "+20 istikrar; +150 hazine.",
      ],
      [
        "airModernization",
        "Hava Kuvvetlerini Yenile",
        "Ordu",
        "arsenal",
        "20 avcı; başkentte +2 uçaksavar ve hava üssü.",
      ],
    ],
    uk: [
      [
        "chainHome",
        "Kıyı Radar Ağı",
        "Ordu",
        "officers",
        "Radar teknolojisi ve kıyılarda +1 radar.",
      ],
      [
        "convoyProgram",
        "Atlantik Konvoyları",
        "Ordu",
        "army",
        "3 muhrip; limanda +2 tersane.",
      ],
      [
        "royalAir",
        "Hava Savunma Seferberliği",
        "Ordu",
        "arsenal",
        "30 avcı ve 10 taktik bombardıman uçağı.",
      ],
    ],
    italy: [
      [
        "mareNostrum",
        "Akdeniz Donanması",
        "Ordu",
        "army",
        "Limanlarda +1 tersane ve 2 kruvazör.",
      ],
      [
        "alpine",
        "Alp Savunması",
        "Ordu",
        "officers",
        "Özel kuvvet teknolojisi; dağ bölgelerinde +2 tahkimat.",
      ],
      [
        "autarky",
        "Kaynak Bağımsızlığı",
        "Sanayi",
        "industry2",
        "Başkentte +2 sentetik tesis ve +2 maden.",
      ],
    ],
    ussr: [
      [
        "industrialRelocation",
        "Sanayiyi Doğuya Taşı",
        "Sanayi",
        "industry2",
        "Doğudaki iki eyalette +2 askerî fabrika.",
      ],
      [
        "redArmor",
        "Kızıl Ordu Zırhlı Reformu",
        "Ordu",
        "arsenal",
        "Hafif zırh ve kara doktrini; 60 hafif tank.",
      ],
      [
        "deepBattle",
        "Derin Harekât Hazırlığı",
        "Ordu",
        "officers",
        "Lojistik ve motorize teknoloji; 60 kamyon; generallere tecrübe.",
      ],
    ],
  };
  return [
    ...common,
    ...(national[country] ?? []).map(
      ([id, name, branch, prerequisite, description]): Focus => ({
        id,
        name,
        branch,
        requires: [prerequisite],
        days: 70,
        effect: "national",
        description,
      }),
    ),
  ];
}
export const MISSIONS: Record<
  MissionType,
  { name: string; days: number; description: string }
> = {
  coup: {
    name: "Darbe hazırlığı",
    days: 90,
    description:
      "İstikrarı %40 altında, siyasi hareketinin desteği %25 üstünde olan hedefte iç savaş başlatmayı dener. İki boş ajan gerekir.",
  },
  intel: {
    name: "Askerî ve sanayi keşfi",
    days: 28,
    description: "180 gün boyunca ayrıntılı istihbarat sağlar.",
  },
  sabotage: {
    name: "Sanayi ve demiryolu sabotajı",
    days: 42,
    description: "Hedef başkentin üretimini ve ikmalini geçici azaltır.",
  },
  propaganda: {
    name: "Siyasi propaganda",
    days: 35,
    description: "Hedefin istikrarını azaltır, ideolojinize destek kazandırır.",
  },
  plans: {
    name: "Savaş planlarını ele geçir",
    days: 42,
    description: "90 gün boyunca hedefe karşı muharebe bonusu.",
  },
  resistance: {
    name: "Direnişi destekle",
    days: 35,
    description: "Hedefin işgal ettiği eyaletlerde direniş artar.",
  },
  diplomacy: {
    name: "Gizli diplomasi",
    days: 28,
    description: "İlişkileri +30 iyileştirir.",
  },
};
