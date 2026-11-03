/** Original, period-inspired silhouettes. These are game art directions, not
 * claims that every country manufactured or fielded a particular tank or gun.
 * Shared equipment families reflect imported equipment as well as local design. */
export interface InfantryModelProfile {
  readonly helmet:
    | "stahlhelm"
    | "brodie"
    | "adrian"
    | "ssh"
    | "m33"
    | "dutch"
    | "m26";
  readonly cap: "field" | "side" | "peaked";
  readonly headwear?: "helmet" | "ushanka" | "peaked";
  readonly scarf?: boolean;
  readonly chestCanister?: boolean;
  readonly tunic: "tunic" | "battledress" | "capote" | "gymnastiorka";
  readonly collar: "stand" | "open" | "fall";
  readonly webbing: "belt" | "cross" | "suspenders";
  readonly boots: "jackboots" | "puttees" | "gaiters";
  readonly pack: "square" | "roll" | "blanket";
  readonly helmetWidth: number;
  readonly coatLength: number;
  readonly packWidth: number;
}
export interface TankModelProfile {
  /** Recognizable reference silhouette used from visual research tier two. */
  readonly variant?:
    | "tiger1"
    | "churchill"
    | "somua_s35"
    | "t34"
    | "m13_40"
    | "lt38"
    | "strv_m42"
    | "t26"
    | "7tp"
    | "ctls";
  readonly modelName?: string;
  readonly hull: "sloped" | "box" | "cast" | "riveted";
  readonly turret: "cast" | "angular" | "box" | "compact";
  readonly hullWidth: number;
  readonly hullLength: number;
  readonly turretWidth: number;
  readonly skirt: "full" | "segmented" | "none";
}
export interface TruckModelProfile {
  readonly variant?:
    | "opel_blitz"
    | "bedford_ql"
    | "laffly_s20tl"
    | "zis5"
    | "fiat626"
    | "praga_rv"
    | "volvo_tlv"
    | "ford_aa"
    | "polski_fiat621"
    | "daf_trado";
  readonly modelName?: string;
  readonly cab: "bonnet" | "flatnose";
  readonly hoodLength: number;
  readonly cabHeight: number;
  readonly bedLength: number;
  readonly canvas: "round" | "ridge" | "flat";
  readonly spare: "side" | "rear";
}
export interface ArtilleryModelProfile {
  readonly variant?:
    | "lefh18"
    | "25pdr"
    | "canon75"
    | "zis3"
    | "cannone75_27"
    | "skoda100"
    | "bofors75";
  readonly modelName?: string;
  readonly shield: "sloped" | "box" | "split";
  readonly shieldWidth: number;
  readonly shieldHeight: number;
  readonly wheelRadius: number;
  readonly trailWidth: number;
}
export interface NationalModelProfile {
  readonly id: string;
  readonly label: string;
  readonly infantry: InfantryModelProfile;
  readonly tank: TankModelProfile;
  readonly truck: TruckModelProfile;
  readonly artillery: ArtilleryModelProfile;
}

type InfantryCut = Pick<
  InfantryModelProfile,
  "helmet" | "cap" | "tunic" | "collar" | "webbing" | "boots" | "pack"
>;
type EquipmentFamily =
  | "german"
  | "british"
  | "french"
  | "soviet"
  | "italian"
  | "czech"
  | "nordic";
const INFANTRY_CUTS: Readonly<Record<EquipmentFamily | "dutch", InfantryCut>> =
  {
    german: {
      helmet: "stahlhelm",
      cap: "side",
      tunic: "tunic",
      collar: "fall",
      webbing: "suspenders",
      boots: "jackboots",
      pack: "square",
    },
    british: {
      helmet: "brodie",
      cap: "field",
      tunic: "battledress",
      collar: "open",
      webbing: "cross",
      boots: "gaiters",
      pack: "square",
    },
    french: {
      helmet: "adrian",
      cap: "side",
      tunic: "capote",
      collar: "fall",
      webbing: "belt",
      boots: "puttees",
      pack: "blanket",
    },
    soviet: {
      helmet: "ssh",
      cap: "peaked",
      tunic: "gymnastiorka",
      collar: "stand",
      webbing: "belt",
      boots: "jackboots",
      pack: "roll",
    },
    italian: {
      helmet: "m33",
      cap: "side",
      tunic: "tunic",
      collar: "open",
      webbing: "cross",
      boots: "puttees",
      pack: "blanket",
    },
    czech: {
      helmet: "m26",
      cap: "field",
      tunic: "tunic",
      collar: "stand",
      webbing: "suspenders",
      boots: "puttees",
      pack: "square",
    },
    nordic: {
      helmet: "m26",
      cap: "field",
      tunic: "tunic",
      collar: "fall",
      webbing: "cross",
      boots: "jackboots",
      pack: "roll",
    },
    dutch: {
      helmet: "dutch",
      cap: "peaked",
      tunic: "capote",
      collar: "stand",
      webbing: "suspenders",
      boots: "gaiters",
      pack: "square",
    },
  };
const EQUIPMENT: Readonly<
  Record<
    EquipmentFamily,
    {
      index: number;
      hull: TankModelProfile["hull"];
      turret: TankModelProfile["turret"];
      skirt: TankModelProfile["skirt"];
      cab: TruckModelProfile["cab"];
      canvas: TruckModelProfile["canvas"];
      spare: TruckModelProfile["spare"];
      shield: ArtilleryModelProfile["shield"];
    }
  >
> = {
  german: {
    index: 0,
    hull: "box",
    turret: "angular",
    skirt: "full",
    cab: "bonnet",
    canvas: "ridge",
    spare: "side",
    shield: "split",
  },
  british: {
    index: 1,
    hull: "box",
    turret: "box",
    skirt: "full",
    cab: "flatnose",
    canvas: "round",
    spare: "rear",
    shield: "box",
  },
  french: {
    index: 2,
    hull: "cast",
    turret: "compact",
    skirt: "full",
    cab: "bonnet",
    canvas: "round",
    spare: "side",
    shield: "sloped",
  },
  soviet: {
    index: 3,
    hull: "sloped",
    turret: "cast",
    skirt: "none",
    cab: "bonnet",
    canvas: "flat",
    spare: "rear",
    shield: "split",
  },
  italian: {
    index: 4,
    hull: "riveted",
    turret: "compact",
    skirt: "none",
    cab: "flatnose",
    canvas: "ridge",
    spare: "side",
    shield: "box",
  },
  czech: {
    index: 5,
    hull: "riveted",
    turret: "angular",
    skirt: "segmented",
    cab: "bonnet",
    canvas: "ridge",
    spare: "rear",
    shield: "sloped",
  },
  nordic: {
    index: 6,
    hull: "box",
    turret: "angular",
    skirt: "none",
    cab: "flatnose",
    canvas: "flat",
    spare: "rear",
    shield: "sloped",
  },
};

/** References guide recognizable shapes, not equipment inventories. Countries
 * sharing another family's art explicitly show that shared design reference. */
const ICONIC_EQUIPMENT: Readonly<
  Record<
    EquipmentFamily,
    {
      country: string;
      label: string;
      tank: readonly [NonNullable<TankModelProfile["variant"]>, string];
      truck: readonly [NonNullable<TruckModelProfile["variant"]>, string];
      artillery: readonly [
        NonNullable<ArtilleryModelProfile["variant"]>,
        string,
      ];
    }
  >
> = {
  german: {
    country: "germany",
    label: "Alman",
    tank: ["tiger1", "Tiger I"],
    truck: ["opel_blitz", "Opel Blitz"],
    artillery: ["lefh18", "10,5 cm leFH 18"],
  },
  british: {
    country: "uk",
    label: "Britanya",
    tank: ["churchill", "Churchill"],
    truck: ["bedford_ql", "Bedford QL"],
    artillery: ["25pdr", "QF 25-pounder"],
  },
  french: {
    country: "france",
    label: "Fransız",
    tank: ["somua_s35", "Somua S35"],
    truck: ["laffly_s20tl", "Laffly S20 TL"],
    artillery: ["canon75", "Canon de 75 modèle 1897"],
  },
  soviet: {
    country: "ussr",
    label: "Sovyet",
    tank: ["t34", "T-34"],
    truck: ["zis5", "ZiS-5"],
    artillery: ["zis3", "ZiS-3"],
  },
  italian: {
    country: "italy",
    label: "İtalyan",
    tank: ["m13_40", "M13/40"],
    truck: ["fiat626", "Fiat 626"],
    artillery: ["cannone75_27", "Cannone da 75/27"],
  },
  czech: {
    country: "czechoslovakia",
    label: "Çekoslovak",
    tank: ["lt38", "LT vz. 38"],
    truck: ["praga_rv", "Praga RV"],
    artillery: ["skoda100", "Škoda 100 mm vz. 14/19"],
  },
  nordic: {
    country: "sweden",
    label: "İsveç",
    tank: ["strv_m42", "Stridsvagn m/42"],
    truck: ["volvo_tlv", "Volvo TLV"],
    artillery: ["bofors75", "Bofors 75 mm m/02"],
  },
};

const COUNTRY_VEHICLE_REFERENCES: Readonly<
  Record<
    string,
    {
      tank: readonly [NonNullable<TankModelProfile["variant"]>, string];
      truck: readonly [NonNullable<TruckModelProfile["variant"]>, string];
    }
  >
> = {
  turkey: { tank: ["t26", "ithal T-26"], truck: ["ford_aa", "ithal Ford AA"] },
  poland: {
    tank: ["7tp", "7TP"],
    truck: ["polski_fiat621", "Polski Fiat 621"],
  },
  netherlands: {
    tank: ["ctls", "CTLS (Hollanda Doğu Hint Adaları)"],
    truck: ["daf_trado", "DAF Trado"],
  },
};

function national(
  id: string,
  label: string,
  infantry: keyof typeof INFANTRY_CUTS,
  equipment: EquipmentFamily,
  cut: 0 | 1 | 2 | 3 | 4,
  tailoring: Partial<InfantryModelProfile> = {},
): NationalModelProfile {
  const family = EQUIPMENT[equipment];
  const iconic = ICONIC_EQUIPMENT[equipment];
  const nationalReference = Object.hasOwn(COUNTRY_VEHICLE_REFERENCES, id)
    ? COUNTRY_VEHICLE_REFERENCES[id]
    : undefined;
  const modelName = (name: string) =>
    id === iconic.country
      ? name
      : `ortak ${iconic.label} tasarım ailesi / ${name}`;
  // Five deliberately separated cuts per family; no save data, random seed or
  // arbitrary country string can create additional geometry variants.
  const shape = family.index * 5 + cut;
  return Object.freeze({
    id,
    label,
    infantry: Object.freeze({
      ...INFANTRY_CUTS[infantry],
      headwear: "helmet",
      scarf: false,
      chestCanister: false,
      helmetWidth: 0.94 + cut * 0.035,
      coatLength: 1.08 - cut * 0.04,
      packWidth: 0.92 + cut * 0.04,
      ...tailoring,
    }),
    tank: Object.freeze({
      variant: nationalReference?.tank[0] ?? iconic.tank[0],
      modelName: nationalReference?.tank[1] ?? modelName(iconic.tank[1]),
      hull: family.hull,
      turret: family.turret,
      skirt: family.skirt,
      hullWidth: 0.94 + cut * 0.035,
      hullLength: 0.95 + cut * 0.016,
      turretWidth: 1.08 - cut * 0.04,
    }),
    truck: Object.freeze({
      variant: nationalReference?.truck[0] ?? iconic.truck[0],
      modelName: nationalReference?.truck[1] ?? modelName(iconic.truck[1]),
      cab: family.cab,
      canvas: family.canvas,
      spare: family.spare,
      hoodLength: 0.92 + cut * 0.04,
      cabHeight: 1.08 - shape * 0.005,
      bedLength: 0.94 + cut * 0.035,
    }),
    artillery: Object.freeze({
      variant: iconic.artillery[0],
      modelName: modelName(iconic.artillery[1]),
      shield: family.shield,
      shieldWidth: 0.94 + (shape % 7) * 0.02,
      shieldHeight: 0.94 + Math.floor(shape / 7) * 0.03,
      wheelRadius: 1,
      trailWidth: 0.92 + cut * 0.04,
    }),
  });
}

/** Each country keeps its own cut even when its equipment shares a family. */
export const COUNTRY_MODEL_PROFILES: Readonly<
  Record<string, NationalModelProfile>
> = Object.freeze({
  turkey: national("turkey", "Türkiye", "german", "british", 1, {
    cap: "peaked",
    headwear: "peaked",
    tunic: "capote",
    coatLength: 1.1,
    collar: "stand",
    boots: "puttees",
    webbing: "belt",
    pack: "roll",
  }),
  germany: national("germany", "Almanya", "german", "german", 0, {
    scarf: true,
    chestCanister: true,
    packWidth: 1.12,
  }),
  france: national("france", "Fransa", "french", "french", 0, {
    scarf: true,
    pack: "square",
    packWidth: 1.1,
  }),
  uk: national("uk", "Birleşik Krallık", "british", "british", 0, {
    scarf: true,
  }),
  italy: national("italy", "İtalya", "italian", "italian", 0),
  ussr: national("ussr", "Sovyetler Birliği", "soviet", "soviet", 0, {
    headwear: "ushanka",
    tunic: "capote",
    coatLength: 1.12,
  }),
  poland: national("poland", "Polonya", "czech", "british", 2, {
    helmet: "ssh",
    cap: "peaked",
    collar: "fall",
    boots: "gaiters",
    pack: "blanket",
  }),
  czechoslovakia: national(
    "czechoslovakia",
    "Çekoslovakya",
    "czech",
    "czech",
    0,
  ),
  yugoslavia: national("yugoslavia", "Yugoslavya", "french", "french", 3, {
    tunic: "tunic",
    collar: "stand",
    webbing: "cross",
  }),
  spain: national("spain", "İspanya", "german", "soviet", 1, {
    cap: "side",
    tunic: "tunic",
    boots: "puttees",
    webbing: "belt",
  }),
  portugal: national("portugal", "Portekiz", "british", "british", 4, {
    tunic: "tunic",
    collar: "stand",
    boots: "puttees",
    pack: "roll",
  }),
  romania: national("romania", "Romanya", "dutch", "czech", 1, {
    tunic: "tunic",
    boots: "puttees",
    pack: "blanket",
  }),
  hungary: national("hungary", "Macaristan", "german", "czech", 2, {
    collar: "stand",
    webbing: "cross",
    pack: "roll",
  }),
  bulgaria: national("bulgaria", "Bulgaristan", "german", "czech", 3, {
    cap: "peaked",
    collar: "stand",
    boots: "puttees",
    webbing: "belt",
  }),
  greece: national("greece", "Yunanistan", "italian", "italian", 1, {
    helmet: "adrian",
    tunic: "capote",
    collar: "stand",
    webbing: "belt",
  }),
  albania: national("albania", "Arnavutluk", "italian", "italian", 2, {
    cap: "peaked",
    collar: "stand",
    webbing: "belt",
    pack: "roll",
  }),
  austria: national("austria", "Avusturya", "german", "german", 1, {
    collar: "stand",
    pack: "blanket",
  }),
  switzerland: national("switzerland", "İsviçre", "german", "french", 4, {
    tunic: "capote",
    collar: "stand",
    webbing: "cross",
    boots: "gaiters",
  }),
  belgium: national("belgium", "Belçika", "french", "french", 1, {
    tunic: "tunic",
    collar: "stand",
    webbing: "suspenders",
  }),
  netherlands: national("netherlands", "Hollanda", "dutch", "nordic", 2),
  luxembourg: national("luxembourg", "Lüksemburg", "french", "french", 2, {
    tunic: "tunic",
    webbing: "cross",
    boots: "gaiters",
    pack: "square",
  }),
  denmark: national("denmark", "Danimarka", "nordic", "german", 3, {
    tunic: "capote",
    collar: "stand",
    boots: "gaiters",
    pack: "square",
  }),
  norway: national("norway", "Norveç", "nordic", "nordic", 1, {
    tunic: "capote",
    boots: "gaiters",
    pack: "blanket",
  }),
  sweden: national("sweden", "İsveç", "nordic", "nordic", 0),
  finland: national("finland", "Finlandiya", "german", "german", 2, {
    tunic: "capote",
    collar: "stand",
    webbing: "cross",
    pack: "roll",
  }),
  estonia: national("estonia", "Estonya", "british", "soviet", 2, {
    tunic: "tunic",
    collar: "stand",
    boots: "jackboots",
    pack: "roll",
  }),
  latvia: national("latvia", "Letonya", "german", "soviet", 3, {
    cap: "peaked",
    collar: "stand",
    webbing: "cross",
    pack: "blanket",
  }),
  lithuania: national("lithuania", "Litvanya", "german", "czech", 4, {
    collar: "stand",
    webbing: "belt",
    boots: "gaiters",
    pack: "roll",
  }),
  ireland: national("ireland", "İrlanda", "german", "british", 3, {
    tunic: "tunic",
    collar: "open",
    webbing: "cross",
    boots: "gaiters",
    pack: "blanket",
  }),
});

export const DEFAULT_COUNTRY_MODEL_PROFILE: NationalModelProfile =
  Object.freeze({
    id: "default",
    label: "Standart",
    infantry: Object.freeze({
      ...INFANTRY_CUTS.british,
      helmetWidth: 1,
      coatLength: 1,
      packWidth: 1,
    }),
    tank: Object.freeze({
      hull: "sloped",
      turret: "cast",
      hullWidth: 1,
      hullLength: 1,
      turretWidth: 1,
      skirt: "full",
    }),
    truck: Object.freeze({
      cab: "bonnet",
      hoodLength: 1,
      cabHeight: 1,
      bedLength: 1,
      canvas: "round",
      spare: "rear",
    }),
    artillery: Object.freeze({
      shield: "sloped",
      shieldWidth: 1,
      shieldHeight: 1,
      wheelRadius: 1,
      trailWidth: 1,
    }),
  });

export const NATIONAL_MODEL_PROFILE_IDS: readonly string[] = Object.freeze([
  DEFAULT_COUNTRY_MODEL_PROFILE.id,
  ...Object.keys(COUNTRY_MODEL_PROFILES),
]);

/** Never use an unchecked country string as a model/cache key. */
export function getCountryModelProfile(id?: string): NationalModelProfile {
  const canonical = typeof id === "string" ? id.replace(/-rebels$/, "") : "";
  return Object.hasOwn(COUNTRY_MODEL_PROFILES, canonical)
    ? COUNTRY_MODEL_PROFILES[canonical]
    : DEFAULT_COUNTRY_MODEL_PROFILE;
}

const HELMET_LABELS: Record<InfantryModelProfile["helmet"], string> = {
  stahlhelm: "etekli çelik miğfer",
  brodie: "geniş kenarlı miğfer",
  adrian: "tepeli miğfer",
  ssh: "yuvarlak çelik miğfer",
  m33: "kompakt çelik miğfer",
  dutch: "yüksek kubbeli miğfer",
  m26: "sığ kubbeli miğfer",
};
const TUNIC_LABELS: Record<InfantryModelProfile["tunic"], string> = {
  tunic: "saha ceketi",
  battledress: "kısa saha ceketi",
  capote: "uzun kaput",
  gymnastiorka: "dik yakalı gömlek",
};
const HULL_LABELS: Record<TankModelProfile["hull"], string> = {
  sloped: "eğimli gövde",
  box: "düz zırhlı gövde",
  cast: "yuvarlatılmış gövde",
  riveted: "perçinli gövde",
};
const TURRET_LABELS: Record<TankModelProfile["turret"], string> = {
  cast: "yuvarlak kule",
  angular: "açılı kule",
  box: "köşeli kule",
  compact: "kompakt kule",
};

/** Describes reference cues, explicitly separating the advanced appearance so
 * the guide never promises a Tiger silhouette before its visual research tier. */
export function getNationalModelDescription(
  profile: NationalModelProfile,
  kind: "infantry" | "tank" | "truck" | "artillery",
): string {
  if (kind === "infantry") {
    const uniform = profile.infantry;
    const headwear =
      uniform.headwear === "ushanka"
        ? "kulaklıklı kürk başlık"
        : uniform.headwear === "peaked"
          ? "siperlikli asker kasketi"
          : HELMET_LABELS[uniform.helmet];
    const coat =
      uniform.headwear === "ushanka"
        ? "kışlık kaput"
        : TUNIC_LABELS[uniform.tunic];
    const equipment = [
      uniform.scarf ? "atkı" : "",
      uniform.packWidth > 1.08 ? "geniş sırt çantası" : "",
      uniform.chestCanister ? "göğüste silindirik teçhizat kutusu" : "",
    ].filter(Boolean);
    return `${headwear} ve ${coat}${equipment.length ? `; ${equipment.join(", ")}` : ""}`;
  }
  const advanced = profile[kind].modelName
    ? `; ileri görünüm: ${profile[kind].modelName} esintili`
    : "";
  if (kind === "tank")
    return `${HULL_LABELS[profile.tank.hull]} ve ${TURRET_LABELS[profile.tank.turret]}${advanced}`;
  if (kind === "truck")
    return `${profile.truck.cab === "bonnet" ? "uzun kaputlu" : "kısa burunlu"} kabin, ${profile.truck.spare === "side" ? "yan" : "arka"} yedek teker${advanced}`;
  return `${profile.artillery.shield === "split" ? "iki parçalı" : profile.artillery.shield === "box" ? "düz" : "eğimli"} top kalkanı ve ayrık kundak${advanced}`;
}
