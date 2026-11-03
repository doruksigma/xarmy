import { TECHNOLOGIES } from "./catalog";
import type { Army, Country, World } from "./types";

export type VisualResearchTier = 0 | 1 | 2 | 3;
export type UnitVisualKind = "infantry" | "tank" | "artillery" | "truck";
export interface UnitVisualResearch {
  infantry: VisualResearchTier;
  tank: VisualResearchTier;
  artillery: VisualResearchTier;
  truck: VisualResearchTier;
  /** Absolute cloth colour; independent of political map and selection tints. */
  uniform: number;
}
export type UnitVisualCountry = Pick<Country, "id" | "tech">;

/** Original subdued palettes inspired by period uniforms, not exact replicas. */
export const COUNTRY_UNIFORM_COLORS: Readonly<Record<string, number>> =
  Object.freeze({
    turkey: 0x8a805d,
    germany: 0x727a6d,
    france: 0x667684,
    uk: 0x827752,
    italy: 0x7a8473,
    ussr: 0x707348,
    poland: 0x8c8160,
    czechoslovakia: 0x787d58,
    yugoslavia: 0x777653,
    spain: 0x8a805d,
    portugal: 0x7c8063,
    romania: 0x8b805d,
    hungary: 0x7f7a56,
    bulgaria: 0x7b7852,
    greece: 0x8c855f,
    albania: 0x807455,
    austria: 0x828577,
    switzerland: 0x6e7b6c,
    belgium: 0x8b7e60,
    netherlands: 0x64785f,
    luxembourg: 0x737b69,
    denmark: 0x7b806e,
    norway: 0x7f8981,
    sweden: 0x7a8172,
    finland: 0x8a9497,
    estonia: 0x79816c,
    latvia: 0x79795a,
    lithuania: 0x7b7d5b,
    ireland: 0x71805d,
  });
export const DEFAULT_UNIFORM_COLOR = 0x7b7860;
export const UNIT_VISUAL_KINDS: readonly UnitVisualKind[] = [
  "infantry",
  "tank",
  "artillery",
  "truck",
];
export const UNIT_VISUAL_LABELS: Readonly<Record<UnitVisualKind, string>> = {
  infantry: "Piyade",
  tank: "Tank",
  artillery: "Topçu",
  truck: "İkmal kamyonu",
};
export const UNIT_VISUAL_STAGE_LABELS: Readonly<
  Record<UnitVisualKind, readonly [string, string, string, string]>
> = {
  infantry: [
    "Kasket ve ahşap dipçik",
    "Çelik miğfer",
    "Gelişmiş saha teçhizatı",
    "Tam destek teçhizatı",
  ],
  tank: [
    "Perçinli erken zırhlı",
    "Eğimli hafif zırhlı",
    "Orta tank ve ek zırh",
    "Ağır tank ve yan etekler",
  ],
  artillery: [
    "Küçük kalkanlı sahra topu",
    "Şekilli kalkanlı sahra topu",
    "Geniş kalkan ve mekanizma",
    "Güçlendirilmiş geri tepme sistemi",
  ],
  truck: [
    "Açık ahşap kasa",
    "Brandalı ikmal kamyonu",
    "Brandalı ve ek yüklü kamyon",
    "Zırhlı yarı paletli taşıyıcı",
  ],
};
const TECH_STAGES: Readonly<Record<UnitVisualKind, readonly string[]>> = {
  infantry: ["weapons1", "weapons2", "weapons3"],
  tank: ["armor1", "armor2", "armor3"],
  // The existing game has one weapons-modernisation tree, not a separate
  // artillery unlock. This changes its visual representation only.
  artillery: ["weapons1", "weapons2", "weapons3"],
  truck: ["motorization", "engines", "mechanization"],
};

function completedTechnologies(
  country: UnitVisualCountry,
): ReadonlySet<string> {
  return new Set(Array.isArray(country?.tech) ? country.tech : []);
}

/** Derived on demand from completed technology. Never persisted or date-based. */
export function getUnitVisualResearch(
  country: UnitVisualCountry,
): UnitVisualResearch {
  const completed = completedTechnologies(country);
  const highest = (ids: readonly string[]): VisualResearchTier => {
    for (let index = ids.length - 1; index >= 0; index--)
      if (completed.has(ids[index])) return (index + 1) as VisualResearchTier;
    return 0;
  };
  const id =
    typeof country?.id === "string" ? country.id.replace(/-rebels$/, "") : "";
  return {
    infantry: highest(TECH_STAGES.infantry),
    tank: highest(TECH_STAGES.tank),
    artillery: highest(TECH_STAGES.artillery),
    truck: completed.has("motorization") ? highest(TECH_STAGES.truck) : 0,
    uniform: Object.hasOwn(COUNTRY_UNIFORM_COLORS, id)
      ? COUNTRY_UNIFORM_COLORS[id]
      : DEFAULT_UNIFORM_COLOR,
  };
}

/** Accept one already-disclosed formation from visibleFormations. An observed
 * enemy's hardware does not disclose its country's unobserved research tree. */
export function getVisibleUnitVisualResearch(
  world: World,
  armies: readonly Pick<Army, "country" | "type">[],
): UnitVisualResearch {
  const id = armies[0]?.country ?? "";
  const country = world.countries[id];
  const observer = world.countries[world.player];
  const profile = { id, tech: [] as string[] };
  if (
    country &&
    (id === world.player ||
      observer?.allies.includes(id) ||
      observer?.intel[id]?.expires > world.day)
  )
    return getUnitVisualResearch(country);
  const visible = getUnitVisualResearch(profile);
  for (const army of armies) {
    if (army.country !== id) continue;
    if (army.type === "heavyTank") visible.tank = 3;
    else if (army.type === "mediumTank")
      visible.tank = Math.max(visible.tank, 2) as VisualResearchTier;
    else if (army.type === "lightTank")
      visible.tank = Math.max(visible.tank, 1) as VisualResearchTier;
    if (army.type === "mechanized") visible.truck = 3;
    else if (army.type === "motorized")
      visible.truck = Math.max(visible.truck, 1) as VisualResearchTier;
  }
  return visible;
}

/** Shown next to the real research actions; these are visual changes, not new bonuses. */
export const TECH_VISUAL_UPGRADES: Readonly<Record<string, string>> = {
  weapons1:
    "Piyadeye çelik miğfer, topçuya şekilli kalkan görünümü eklenir. Topçu görünümü ortak silah modernizasyonunu izler.",
  weapons2:
    "Piyadeye saha telsizi ve havalandırmalı silah gövdesi; topçuya geniş kalkan ve gelişmiş mekanizma görünümü eklenir.",
  weapons3:
    "Piyadeye kaplamalı miğfer, tamburalı şarjör ve katlanmış ayaklık; topçuya ek geri tepme silindiri görünümü eklenir.",
  armor1:
    "Tank modeli eğimli gövdeli, geniş yuvarlak kuleli hafif zırhlı görünümüne geçer.",
  armor2:
    "Tank modeline köşeli kule, ek zırh plakaları ve namlu freni görünümü eklenir.",
  armor3:
    "Tank modeline geniş gövde, yan etekler ve kalın namlu görünümü eklenir.",
  motorization:
    "Kamyon modelinin ahşap kasasına branda eklenir; tamamlanmış ileri motor teknolojileri de görünümüne uygulanır.",
  engines:
    "Motorize lojistik de tamamlandıysa kamyon modeline rulo branda ve ek yük görünümü eklenir.",
  mechanization:
    "Motorize lojistik de tamamlandıysa ikmal modeli zırhlı arka gövdeli, yarı paletli taşıyıcı görünümüne geçer.",
};

export interface UnitVisualResearchGuideEntry {
  kind: UnitVisualKind;
  label: string;
  tier: VisualResearchTier;
  stage: string;
  next: null | {
    id: string;
    name: string;
    requirements: { id: string; name: string; complete: boolean }[];
  };
}

export function getUnitVisualResearchGuide(
  country: UnitVisualCountry,
): UnitVisualResearchGuideEntry[] {
  const visual = getUnitVisualResearch(country);
  const completed = completedTechnologies(country);
  return UNIT_VISUAL_KINDS.map((kind) => {
    const tier = visual[kind];
    const nextId = TECH_STAGES[kind][tier];
    const next = TECHNOLOGIES.find((technology) => technology.id === nextId);
    return {
      kind,
      label: UNIT_VISUAL_LABELS[kind],
      tier,
      stage: UNIT_VISUAL_STAGE_LABELS[kind][tier],
      next: next
        ? {
            id: next.id,
            name: next.name,
            requirements: next.requires.map((id) => ({
              id,
              name:
                TECHNOLOGIES.find((technology) => technology.id === id)?.name ??
                id,
              complete: completed.has(id),
            })),
          }
        : null,
    };
  });
}
