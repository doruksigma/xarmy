import {
  alternatePolicies,
  nationalPolicies,
  SCENARIO_COUNTRY_IDS,
} from "./national-event-catalog";
import { germanProgrammes } from "./germany-event-catalog";
import type { NationalProgramme } from "./national-event-types";

/** Curated, playable diplomatic decisions; dates describe the historical reference.
 * The campaign's choices can produce different outcomes. No external art/assets. */
export interface HistoricalEventDefinition {
  id: string;
  country: string;
  target?: string;
  title: string;
  description: string;
  date: string;
  cost: number;
  days: number;
  requires: string[];
  kind:
    | "annex"
    | "territory"
    | "war"
    | "pact"
    | "alliance"
    | "defense"
    | "aid"
    | "conference"
    | "domestic";
  branch?: string;
  era?: "historical" | "policy" | "alternative";
  countrySpecific?: boolean;
  /** Event IDs, unlike requires which contains history-prefixed focus IDs. */
  excludes?: string[];
  domestic?: NationalProgramme;
  acceptLabel: string;
  declineLabel: string;
  effectText: string;
  declineText: string;
}
const entry = (
  value: Omit<HistoricalEventDefinition, "declineLabel" | "declineText">,
): HistoricalEventDefinition => ({
  ...value,
  declineLabel: "Hayır, bu girişimden vazgeç",
  declineText:
    "Bu olay kapatılır; diplomasi hazırlığı için harcanan siyasi güç geri verilmez. Toprak veya savaş durumu değişmez.",
});
const CURATED_EVENTS: readonly HistoricalEventDefinition[] = [
  entry({
    id: "rhineland",
    country: "germany",
    title: "Ren Bölgesi'nin Yeniden Askerîleştirilmesi",
    description:
      "Ren bölgesine birlik ve tahkimat yerleştirme hazırlığı tamamlandı. Bu adım Avrupa'daki gerilimi yükseltecek. Planı uygulayalım mı?",
    date: "1936-03-07",
    cost: 50,
    days: 35,
    requires: [],
    kind: "defense",
    acceptLabel: "Ren planını uygula",
    effectText:
      "Köln ve Aachen'de +1 tahkimat, +8 savaş desteği; dünya gerilimi +5.",
  }),
  entry({
    id: "anschluss",
    country: "germany",
    target: "austria",
    title: "Anschluss: Avusturya Krizi",
    description:
      "Avusturya'nın Almanya'ya katılması için diplomatik hazırlık tamamlandı. Viyana'ya ilhak talebini gönderelim mi? Avusturya yönetimi teklifi kabul edebilir veya reddedebilir.",
    date: "1938-03-12",
    cost: 100,
    days: 70,
    requires: ["history-rhineland"],
    kind: "annex",
    acceptLabel: "Avusturya'ya ilhak talebini gönder",
    effectText:
      "Kabul edilirse Avusturya'nın kontrolündeki kendi toprakları, birlikleri ve mevcut depoları Almanya'ya katılır. Gerilim +10. Ret otomatik savaş başlatmaz.",
  }),
  entry({
    id: "munich",
    country: "germany",
    target: "czechoslovakia",
    title: "Münih Görüşmeleri",
    description:
      "Südet krizi için diplomatik heyet hazır. Mevcut haritada Liberec bölgesinin devri talep edilecek; Çekoslovakya'nın geri kalanı bağımsız kalacak.",
    date: "1938-09-30",
    cost: 80,
    days: 56,
    requires: ["history-anschluss"],
    kind: "territory",
    acceptLabel: "Liberec için devir talebini sun",
    effectText:
      "Kabul edilirse yalnız Liberec Almanya'ya geçer, dünya gerilimi +6. Ret ilişkiyi düşürür, savaş başlatmaz.",
  }),
  entry({
    id: "molotov",
    country: "germany",
    target: "ussr",
    title: "Molotov–Ribbentrop Paktı",
    description:
      "Berlin ve Moskova arasında karşılıklı saldırmazlık anlaşması için taslak hazır. Bu karar gizli bir toprak paylaşımı gerçekleştirmez.",
    date: "1939-08-23",
    cost: 75,
    days: 35,
    requires: [],
    kind: "pact",
    acceptLabel: "Saldırmazlık paktını öner",
    effectText:
      "Karşı taraf kabul ederse iki yıllık karşılıklı saldırmazlık paktı ve +20 ilişki.",
  }),
  entry({
    id: "danzig",
    country: "germany",
    target: "poland",
    title: "Polonya Krizi",
    description:
      "Polonya'ya yönelik harekât hazırlığı tamamlandı. Savaşı başlatmak savunma ittifaklarını da devreye sokacaktır. Son karar senin.",
    date: "1939-09-01",
    cost: 100,
    days: 56,
    requires: ["history-munich"],
    kind: "war",
    acceptLabel: "Polonya harekâtını başlat",
    effectText:
      "Polonya ve onu savunan müttefikleriyle gerçek savaş başlar; gerilim +12. Aktif saldırmazlık paktı veya ittifak varsa bu seçenek kullanılamaz.",
  }),
  entry({
    id: "weserubung",
    country: "germany",
    target: "denmark",
    title: "Weserübung: Danimarka Harekâtı",
    description:
      "Kuzey deniz yolları için Danimarka'ya yönelik plan hazırlandı. Harekâtı başlatmak diplomatik bir bildirim değil, gerçek savaş ilanıdır.",
    date: "1940-04-09",
    cost: 75,
    days: 35,
    requires: [],
    kind: "war",
    acceptLabel: "Danimarka harekâtını başlat",
    effectText:
      "Danimarka ve savunma müttefiklerine savaş ilan edilir; gerilim +12.",
  }),
  entry({
    id: "barbarossa",
    country: "germany",
    target: "ussr",
    title: "Barbarossa Harekâtı",
    description:
      "Sovyetler Birliği'ne karşı harekât planı tamamlandı. Yakıt, ikmal ve ordunun hazırlığı savaşın sonucunu belirleyecek.",
    date: "1941-06-22",
    cost: 125,
    days: 70,
    requires: [],
    kind: "war",
    acceptLabel: "Doğu harekâtını başlat",
    effectText:
      "Sovyetler Birliği ve savunma müttefikleriyle savaş başlar; gerilim +12. Yürürlükteki paktı bu karar kendiliğinden bozmaz.",
  }),
  entry({
    id: "winter-war",
    country: "ussr",
    target: "finland",
    title: "Kış Savaşı Krizi",
    description:
      "Finlandiya sınırı için askerî seçenek masada. Harekât emri verelim mi, yoksa diplomatik gerilimi düşürelim mi?",
    date: "1939-11-30",
    cost: 90,
    days: 35,
    requires: [],
    kind: "war",
    acceptLabel: "Finlandiya harekâtını başlat",
    effectText:
      "Finlandiya ve savunma müttefikleriyle savaş başlar; arazi, kış ve mevcut ikmal kuralları geçerlidir.",
  }),
  entry({
    id: "montreux-treaty",
    country: "turkey",
    title: "Montrö Boğazlar Düzeni",
    description:
      "Boğazların güvenliği için diplomatik görüşmeler tamamlandı. İstanbul ve Çanakkale savunmasını güçlendiren düzeni yürürlüğe koyalım mı?",
    date: "1936-07-20",
    cost: 60,
    days: 35,
    requires: [],
    kind: "defense",
    acceptLabel: "Boğazlar güvenlik düzenini uygula",
    effectText:
      "İstanbul ve Çanakkale'ye +1 tahkimat; Sovyetler Birliği, Birleşik Krallık ve Fransa ile +15 ilişki; gerilim −3.",
  }),
  entry({
    id: "saadabad",
    country: "turkey",
    target: "iran",
    title: "Sadabat Paktı",
    description:
      "İran ile sınır güvenliği ve saldırmazlık görüşmeleri tamamlandı. Anlaşma önerisini Tahran'a gönderelim mi?",
    date: "1937-07-08",
    cost: 60,
    days: 35,
    requires: [],
    kind: "pact",
    acceptLabel: "Sadabat anlaşmasını öner",
    effectText:
      "İran kabul ederse iki yıllık karşılıklı saldırmazlık paktı ve +20 ilişki.",
  }),
  entry({
    id: "albania",
    country: "italy",
    target: "albania",
    title: "Arnavutluk Ültimatomu",
    description:
      "Tiran'a İtalya'ya katılma talebi sunmak için hazırlık tamamlandı. Arnavutluk bunu kabul edebilir veya bağımsızlığını savunabilir.",
    date: "1939-04-07",
    cost: 90,
    days: 35,
    requires: [],
    kind: "annex",
    acceptLabel: "Tiran'a katılma talebini gönder",
    effectText:
      "Kabul halinde Arnavutluk toprakları, birlikleri ve mevcut depoları İtalya'ya geçer; gerilim +10. Ret kendiliğinden savaş başlatmaz.",
  }),
  entry({
    id: "polish-guarantee",
    country: "uk",
    target: "poland",
    title: "Polonya'nın Güvenliği",
    description:
      "Polonya ile karşılıklı savunma anlaşması için görüşmeler hazır. Kabul edilen ittifak, saldırıya uğrayan tarafı savunmak için savaşa girmeyi gerektirir.",
    date: "1939-03-31",
    cost: 70,
    days: 35,
    requires: [],
    kind: "alliance",
    acceptLabel: "Savunma anlaşmasını öner",
    effectText:
      "Polonya kabul ederse karşılıklı askerî ittifak ve +25 ilişki. Savaş ilanlarında mevcut savunma ittifakı kuralları uygulanır.",
  }),
  entry({
    id: "atlantic-charter",
    country: "uk",
    target: "usa",
    title: "Atlantik Bildirisi",
    description:
      "Atlantik iş birliği için siyasi taslak hazır. Karşılıklı diplomatik güven ve saldırmazlık düzeni önerelim mi?",
    date: "1941-08-14",
    cost: 60,
    days: 35,
    requires: [],
    kind: "pact",
    acceptLabel: "Atlantik iş birliğini öner",
    effectText:
      "ABD kabul ederse iki yıllık saldırmazlık paktı, +20 ilişki ve iki ülkede +5 istikrar.",
  }),
  entry({
    id: "lend-lease",
    country: "usa",
    target: "ussr",
    title: "Ödünç Verme ve Kiralama Yardımı",
    description:
      "Sovyetler Birliği için bir askerî yardım paketi hazırlandı. Teslimat mevcut depolardan yapılır; ekipman yoktan oluşturulmaz.",
    date: "1941-11-07",
    cost: 50,
    days: 35,
    requires: [],
    kind: "aid",
    acceptLabel: "100 tüfek ve 20 kamyon gönder",
    effectText:
      "ABD depolarından 100 tüfek ve 20 kamyon Sovyetler Birliği'ne aktarılır; +25 ilişki. Bu karar anlık diplomatik yardım sistemini kullanır.",
  }),
  entry({
    id: "tehran",
    country: "ussr",
    target: "uk",
    title: "Tahran Konferansı",
    description:
      "Birleşik Krallık ile savaşın yürütülmesi ve diplomatik koordinasyon konusunda bir konferans gündemi hazırlandı.",
    date: "1943-11-28",
    cost: 60,
    days: 35,
    requires: [],
    kind: "conference",
    acceptLabel: "Konferans mutabakatını öner",
    effectText:
      "Kabul edilirse iki ülkeye +8 istikrar, −10 savaş yorgunluğu ve +25 karşılıklı ilişki. Topraklar kendiliğinden paylaşılmaz.",
  }),
  entry({
    id: "yalta",
    country: "ussr",
    target: "usa",
    title: "Yalta Konferansı",
    description:
      "Savaş sonrası görüşmeler için konferans çağrısı hazır. Mevcut egemenlikler ve barış konferansı hakları korunarak diplomatik uzlaşma aranacak.",
    date: "1945-02-04",
    cost: 75,
    days: 35,
    requires: [],
    kind: "conference",
    acceptLabel: "Yalta görüşmelerini öner",
    effectText:
      "Kabul edilirse iki ülkeye +8 istikrar, −10 savaş yorgunluğu ve +25 ilişki; dünya gerilimi −5. Hiçbir ülke otomatik bölünmez.",
  }),
];
export const HISTORICAL_EVENTS: readonly HistoricalEventDefinition[] =
  CURATED_EVENTS.map((event) => ({
    ...event,
    branch: "Tarihî Diplomasi",
    era: "historical",
    countrySpecific: true,
  }));
const countries = new Map<string, readonly HistoricalEventDefinition[]>();
const eventIndex = new Map(HISTORICAL_EVENTS.map((event) => [event.id, event]));
/** Stable per-country arrays: daily AI/focus checks never scan the world catalog. */
export function countryEvents(
  country: string,
): readonly HistoricalEventDefinition[] {
  const cached = countries.get(country);
  if (cached) return cached;
  const definitions = [
    ...HISTORICAL_EVENTS.filter((event) => event.country === country),
    ...nationalPolicies(country),
    ...alternatePolicies(country),
    ...(country === "germany" ? germanProgrammes() : []),
  ];
  countries.set(country, definitions);
  for (const definition of definitions)
    eventIndex.set(definition.id, definition);
  return definitions;
}
let allEvents: readonly HistoricalEventDefinition[] | undefined;
export function allCountryEvents(): readonly HistoricalEventDefinition[] {
  return (allEvents ??= SCENARIO_COUNTRY_IDS.flatMap((country) =>
    countryEvents(country),
  ));
}
export function historicalEvent(
  id: string,
): HistoricalEventDefinition | undefined {
  const found = eventIndex.get(id);
  if (found) return found;
  if (!id.startsWith("national-")) return undefined;
  // Scenario IDs are simple lowercase tokens. Unknown/rebel countries keep
  // existing generic focuses and cannot forge another country's event IDs.
  const country = id.slice(9).split("-")[0];
  if (!SCENARIO_COUNTRY_IDS.includes(country)) return undefined;
  countryEvents(country);
  return eventIndex.get(id);
}
export const historicalFocusId = (id: string) => `history-${id}`;
