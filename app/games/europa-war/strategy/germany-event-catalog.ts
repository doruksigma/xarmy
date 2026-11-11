import type { HistoricalEventDefinition } from "./historical-catalog";
import type { NationalProgramme } from "./national-event-types";
import {
  b,
  e,
  n,
  r,
  row,
  s,
  t,
  nationalCostText,
  nationalEffectText,
  type Chapter,
} from "./national-event-catalog";

/** Authored German chapters. Historical institutions are reference material;
 * the proposed decisions and alternate outcomes are explicitly game scenarios. */
const GERMAN_CHAPTERS: readonly Chapter[] = [
  {
    id: "imperial",
    title: "Almanya · İmparatorluk Yolu",
    events: [
      row(
        "conservative-circle",
        "Muhafazakâr Muhalefet Çevresi",
        "Rejime karşı muhafazakâr çevrelerle gizli görüşmeler yap. Bu yol anayasal muhalefet yolunu kapatır.",
        [
          { kind: "party", ideology: "monarchy", amount: 8 },
          n("stability", -4),
        ],
        { treasury: 70 },
      ),
      row(
        "officers-pact",
        "Subaylar Arasında Mutabakat",
        "Muhalif kurmayları bir araya getir; mevcut tümenlere eğitim ve muhalefete destek sağla.",
        [t(4, 3), { kind: "party", ideology: "monarchy", amount: 6 }],
        { treasury: 100, equipment: { rifle: 8 } },
      ),
      row(
        "dynastic-petition",
        "Hohenzollern Dönüş Bildirisi",
        "Hanedanın dönüşünü savunan bir bildiri hazırla. Bildiri henüz hükûmeti değiştirmez.",
        [
          { kind: "party", ideology: "monarchy", amount: 12 },
          n("stability", -6),
        ],
        { treasury: 110 },
      ),
      row(
        "monarchist-uprising",
        "Monarşist Ayaklanma",
        "Monarşist tarafın yönetimini üstlen. Mevcut rejime bağlı kuvvetler ülkenin bir bölümünde ayrı yönetim kuracak; iç savaşı gerçekten kazanman gerekecek.",
        [{ kind: "uprising", government: "monarchy", opposition: "fascism" }],
        { treasury: 160 },
        {
          independent: true,
          peace: true,
          noCivilWar: true,
          ideologies: ["fascism", "republic", "democracy"],
        },
      ),
      row(
        "restore-empire",
        "Alman İmparatorluğu'nun Yeniden Kuruluşu",
        "İç savaşta rakip yönetimi yendikten sonra imparatorluğu ilan et. Bu karar savaş bitmeden kullanılamaz.",
        [
          {
            kind: "restoration",
            name: "Alman İmparatorluğu",
            leader: "II. Wilhelm",
          },
          n("stability", 8),
        ],
        { treasury: 130 },
        { civilWarVictory: true, independent: true, peace: true },
      ),
      row(
        "imperial-charter",
        "İmparatorluk Anayasası",
        "Yeni yönetimin yetkilerini ve devlet kurumlarının çalışma usulünü belirle.",
        [n("stability", 7), n("political", 20)],
        { treasury: 120 },
        { ideologies: ["monarchy"] },
      ),
      row(
        "federal-council",
        "Eyaletler Konseyi",
        "Eyalet temsilcilerini imparatorluk yönetiminde bir araya getir.",
        [n("stability", 5), b("infra")],
        { treasury: 150, stock: { steel: 15 } },
        { ideologies: ["monarchy"] },
      ),
      row(
        "imperial-reconstruction",
        "İç Savaş Sonrası İmar",
        "İç savaşın ardından sivil üretim ve halkın toparlanmasına kaynak ayır.",
        [b("civil"), n("exhaustion", -10)],
        { treasury: 190, stock: { steel: 25 } },
        { ideologies: ["monarchy"] },
      ),
      row(
        "imperial-officers",
        "İmparatorluk Kurmay Akademisi",
        "Yeni yönetimin subay eğitimini ortak bir programa bağla.",
        [t(7, 8), n("science", 0.025)],
        { treasury: 150 },
        { ideologies: ["monarchy"] },
      ),
      row(
        "imperial-settlement",
        "İmparatorlukta Sivil Uzlaşma",
        "Hanedan yönetimi ile sivil kurumlar arasında kalıcı uzlaşmayı finanse et.",
        [n("stability", 8), n("exhaustion", -8), n("political", 25)],
        { treasury: 180 },
        { ideologies: ["monarchy"] },
      ),
    ],
  },
  {
    id: "constitutional",
    title: "Almanya · Anayasal Yol",
    events: [
      row(
        "constitutional-opposition",
        "Anayasal Muhalefet Masası",
        "Sivil muhalefetin temsilcilerini ortak reform programında buluştur. Bu yol hanedan ayaklanmasını kapatır.",
        [
          { kind: "party", ideology: "democracy", amount: 10 },
          n("stability", -3),
        ],
        { treasury: 85 },
      ),
      row(
        "civic-petitions",
        "Sivil Haklar Dilekçeleri",
        "Hukukçu ve belediye temsilcilerinin reform taleplerini topluma duyur.",
        [
          { kind: "party", ideology: "democracy", amount: 10 },
          n("political", 15),
        ],
        { treasury: 95 },
      ),
      row(
        "trade-union-dialogue",
        "Sendikalarla Diyalog",
        "Çalışma yaşamında sivil temsil için müzakere başlat.",
        [
          n("stability", 5),
          { kind: "party", ideology: "democracy", amount: 8 },
        ],
        { treasury: 110 },
      ),
      row(
        "constitutional-transition",
        "Anayasal Geçiş Mutabakatı",
        "İstikrarlı ve barış içindeki ülkeyi parlamenter demokrasiye geçir. Bu alternatif senaryo, tarihî Almanya'da gerçekleşmiş bir geçiş değildir.",
        [
          {
            kind: "government",
            ideology: "democracy",
            name: "Almanya Cumhuriyeti",
            leader: "Anayasal koalisyon",
          },
          n("stability", -8),
        ],
        { treasury: 160 },
        { independent: true, peace: true, minStability: 55, noCivilWar: true },
      ),
      row(
        "civilian-cabinet",
        "Sivil Kabinenin Kuruluşu",
        "Yeni parlamenter yönetimin bakanlıklarını uyumlu bir takvime bağla.",
        [n("political", 35), n("stability", 4)],
        { treasury: 125 },
        { ideologies: ["democracy"] },
      ),
      row(
        "parliamentary-budget",
        "Parlamentonun Bütçe Yetkisi",
        "Savunma ve altyapı bütçesini açık müzakerelerle düzenle.",
        [n("stability", 6), b("infra")],
        { treasury: 150, stock: { steel: 12 } },
        { ideologies: ["democracy"] },
      ),
      row(
        "federal-election-offices",
        "Eyalet Seçim Büroları",
        "Eyaletlerde sivil idarenin güvenini ve işleyişini güçlendir.",
        [n("stability", 7), n("political", 20)],
        { treasury: 140 },
        { ideologies: ["democracy"] },
      ),
      row(
        "civil-science",
        "Üniversite Özerkliği",
        "Üniversitelerin araştırma kadrolarını sivil bütçeyle destekle.",
        [n("science", 0.045), n("stability", 3)],
        { treasury: 170 },
        { ideologies: ["democracy"] },
      ),
      row(
        "republican-defense",
        "Cumhuriyet Savunma Kurulu",
        "Sivil denetim altında ordu eğitimini ve savunma stokunu geliştir.",
        [t(5, 6), e("rifle", 40)],
        { treasury: 140, stock: { steel: 15 } },
        { ideologies: ["democracy"] },
      ),
      row(
        "democratic-reconciliation",
        "Demokratik Uzlaşma",
        "Geçiş döneminin yorgunluğunu azaltıp sivil kurumlara güveni pekiştir.",
        [n("stability", 9), n("exhaustion", -10)],
        { treasury: 180 },
        { ideologies: ["democracy"] },
      ),
    ],
  },
  {
    id: "german-industry",
    title: "Almanya · Sanayi Kurulları",
    events: [
      row(
        "ruhr-engineers",
        "Ruhr Mühendisler Kurulu",
        "Ruhr'daki sanayi geleneğinden yararlanan mühendisleri ulusal üretim programına al; yeni yatırım kontrolündeki uygun bölgede uygulanır.",
        [b("civil"), n("science", 0.01)],
        { treasury: 155, stock: { steel: 20 } },
      ),
      row(
        "reichsbahn-renewal",
        "Reichsbahn Yenileme Planı",
        "Devlet demiryolu işletmesinin teknik birikimiyle ray yatırımı yap.",
        [b("rail"), e("truck", 5)],
        { treasury: 145, stock: { steel: 25 } },
      ),
      row(
        "salzgitter-plan",
        "Salzgitter Maden Etüdü",
        "Maden işletme planını ülke içindeki uygun sahada uygula; bu olay ayrı bir tarihî şehir mülkiyeti yaratmaz.",
        [b("mine"), s("iron", 35)],
        { treasury: 155, stock: { steel: 15 } },
      ),
      row(
        "reichswerke-contract",
        "Reichswerke Üretim Sözleşmesi",
        "Devlet ağır sanayisinin üretim sözleşmesini askerî tesis yatırımına dönüştür.",
        [b("military")],
        { treasury: 195, stock: { steel: 30 } },
      ),
      row(
        "leuna-fuel",
        "Leuna Yakıt Programı",
        "Sentetik yakıt çalışmalarını yeni tesis yatırımıyla destekle.",
        [b("synthetic"), s("fuel", 35)],
        { treasury: 210, stock: { steel: 25 } },
      ),
      row(
        "autobahn-freight",
        "Ana Yollarda Yük Taşımacılığı",
        "Ana yol ağının yük trafiğine uygun altyapısını genişlet.",
        [b("infra"), e("truck", 15)],
        { treasury: 175, stock: { steel: 20, rubber: 8 } },
      ),
      row(
        "bosch-components",
        "Hassas Motor Parçaları",
        "Hassas parçaların kalite kontrolünü motor araştırmasına aktar.",
        [r("engines", 45)],
        { treasury: 145, stock: { steel: 15 } },
        { tech: ["armor1"] },
      ),
      row(
        "rheinmetall-contract",
        "Rheinmetall Topçu Sözleşmesi",
        "Topçu ekipmanı için çelik ve bütçe tahsis et.",
        [e("artillery", 25)],
        { treasury: 175, stock: { steel: 40 } },
      ),
      row(
        "industrial-dispersal",
        "Dağıtılmış Alman Sanayisi",
        "Üretim riskini azaltmak için yeni sivil tesisi uygun bir iç bölgeye dağıt.",
        [b("civil"), b("antiAir")],
        { treasury: 225, stock: { steel: 35 } },
      ),
      row(
        "german-standards",
        "Alman Ölçü ve Kalite Kurulu",
        "Sanayi kurullarının sonuçlarını araştırma katsayısına ve seri üretim bilgisine aktar.",
        [n("science", 0.035), r("industry2", 35)],
        { treasury: 180 },
        { tech: ["industry1"] },
      ),
    ],
  },
  {
    id: "german-armor",
    title: "Almanya · Zırhlı Tasarımlar",
    events: [
      row(
        "panzer-training",
        "Panzer Eğitim Heyeti",
        "Zırhlı birliklerin eğitim yöntemlerini mevcut tümenlerle dene.",
        [t(5, 5), s("fuel", 30)],
        { treasury: 105 },
      ),
      row(
        "panzer-ii-order",
        "Panzer II Tedarik Çizgisi",
        "Hafif tank sınıfını temsil eden yeni ekipman partisini depoya al.",
        [e("lightTank", 15)],
        { treasury: 145, stock: { steel: 30, oil: 10 } },
        { tech: ["armor1"] },
      ),
      row(
        "panzer-iii-study",
        "Panzer III Tasarım Çalışması",
        "Orta tank araştırmasına mühendislik kaynağı ayır.",
        [r("armor2", 45)],
        { treasury: 145, stock: { steel: 20 } },
        { tech: ["armor1"] },
      ),
      row(
        "opel-blitz-order",
        "Opel Blitz Kara İkmali",
        "Motorlu ikmal için kamyon stokunu artır; araçları mevcut birimlere ordu menüsünden ayır.",
        [e("truck", 35)],
        { treasury: 150, stock: { steel: 25, rubber: 12 } },
      ),
      row(
        "panzer-iv-order",
        "Panzer IV Üretim Partisi",
        "Araştırılmış orta tank sınıfında yeni bir parti sipariş et.",
        [e("mediumTank", 18)],
        { treasury: 185, stock: { steel: 40, oil: 15 } },
        { tech: ["armor2"] },
      ),
      row(
        "stug-assault",
        "StuG Destek Topçusu Programı",
        "Taarruz topu yaklaşımını topçu ve orta tank ekipmanıyla temsil et.",
        [e("artillery", 18), e("mediumTank", 5)],
        { treasury: 190, stock: { steel: 40 } },
        { tech: ["armor2"] },
      ),
      row(
        "henschel-heavy",
        "Henschel Ağır Zırh Denemesi",
        "Ağır tank araştırmasını yeni prototiplerle ilerlet.",
        [r("armor3", 50)],
        { treasury: 190, stock: { steel: 30 } },
        { tech: ["armor2"] },
      ),
      row(
        "tiger-order",
        "Tiger Ağır Tank Siparişi",
        "Ağır zırh araştırması bittikten sonra ağır tank ekipmanı tedarik et.",
        [e("heavyTank", 12)],
        { treasury: 240, stock: { steel: 55, oil: 20 } },
        { tech: ["armor3"] },
      ),
      row(
        "panzergrenadier-school",
        "Panzergrenadier Okulu",
        "Motorlu piyadeyi zırhlı araçlarla birleştiren mekanizasyon araştırmasını destekle.",
        [r("mechanization", 45), e("truck", 10)],
        { treasury: 190, stock: { steel: 20, rubber: 8 } },
        { tech: ["motorization", "armor2"] },
      ),
      row(
        "armored-staff-exercise",
        "Zırhlı Kolordu Tatbikatı",
        "Zırhlı programının sonuçlarını gerçek tümen eğitimine dönüştür.",
        [t(10, 12), s("fuel", 60)],
        { treasury: 210, equipment: { rifle: 10 }, stock: { oil: 15 } },
      ),
    ],
  },
  {
    id: "german-air-sea",
    title: "Almanya · Hava ve Deniz",
    events: [
      row(
        "messerschmitt-design",
        "Messerschmitt Deneme Heyeti",
        "Avcı tasarım bilgisini değerlendiren uçak alımını bütçelendir.",
        [e("fighter", 15)],
        { treasury: 155, stock: { aluminum: 25, rubber: 8 } },
        { tech: ["aviation1"] },
      ),
      row(
        "junkers-study",
        "Junkers Taktik Bombardıman Çalışması",
        "Bombardıman araştırmasını sanayi denemeleriyle destekle.",
        [r("aviation2", 45)],
        { treasury: 145, stock: { aluminum: 15 } },
        { tech: ["aviation1"] },
      ),
      row(
        "flak-network",
        "Flak Savunma Düzeni",
        "Hava saldırılarına karşı yeni uçaksavar mevzileri kur.",
        [b("antiAir"), e("artillery", 6)],
        { treasury: 150, stock: { steel: 25 } },
      ),
      row(
        "german-radar",
        "Freya Erken Uyarı Araştırması",
        "Radar ve erken uyarı çalışmalarını deneylerle ilerlet.",
        [r("radar", 45)],
        { treasury: 145 },
      ),
      row(
        "luftwaffe-staff",
        "Hava Kurmay Harekât Okulu",
        "Hava birliklerinin ortak doktrinini geliştir.",
        [r("airDoctrine", 45), s("fuel", 40)],
        { treasury: 155 },
        { tech: ["aviation1"] },
      ),
      row(
        "kiel-dockyards",
        "Kiel Tersane Heyeti",
        "Kiel tersanecilik birikimini kontrolündeki uygun limanda yeni kapasiteye dönüştür.",
        [b("dock", "port")],
        { treasury: 200, stock: { steel: 35 } },
      ),
      row(
        "uboat-school",
        "U-Boot Tasarım Okulu",
        "Denizaltı tasarım ve savaş araştırmasını ilerlet.",
        [r("submarines", 45)],
        { treasury: 160, stock: { steel: 20 } },
        { tech: ["naval1"] },
      ),
      row(
        "fleet-gunnery",
        "Donanma Atış Denemeleri",
        "Deniz topçuluğu araştırması için mühimmat ve mühendislik bütçesi ayır.",
        [r("naval2", 45)],
        { treasury: 175, stock: { steel: 25 } },
        { tech: ["naval1"] },
      ),
      row(
        "plan-z-study",
        "Plan Z Tersane Etüdü",
        "Büyük filo hedefinin ilk adımı olarak ikinci tersane kapasitesini finanse et; bu karar bedelsiz filo oluşturmaz.",
        [b("dock", "port"), s("fuel", 60)],
        { treasury: 240, stock: { steel: 40 } },
      ),
      row(
        "joint-air-sea",
        "Hava–Deniz Harekât Eşgüdümü",
        "Donanma doktrini ve havacılık yakıt rezervini ortak planla.",
        [r("navalDoctrine", 45), s("fuel", 80)],
        { treasury: 190 },
        { tech: ["naval1"] },
      ),
    ],
  },
];

export function germanProgrammes(): HistoricalEventDefinition[] {
  return GERMAN_CHAPTERS.flatMap((chapter) =>
    chapter.events.map((template, index) => {
      const id = `national-germany-${template.id}`;
      const domestic: NationalProgramme = {
        costs: template.costs,
        requirements: { independent: true, ...template.requirements },
        effects: template.effects,
      };
      return {
        id,
        country: "germany",
        title: template.title,
        description: `${template.brief} Almanya'ya özel alternatif senaryo; tarihî bir sonucun kendiliğinden gerçekleşmesi değildir.`,
        date: "1936-01-01",
        cost:
          template.id === "monarchist-uprising"
            ? 100
            : template.id === "restore-empire"
              ? 80
              : 30 + index * 5,
        days: template.id === "monarchist-uprising" ? 28 : 14 + index * 3,
        requires: index
          ? [`history-national-germany-${chapter.events[index - 1].id}`]
          : [],
        excludes:
          chapter.id === "imperial"
            ? ["national-germany-constitutional-opposition"]
            : chapter.id === "constitutional"
              ? ["national-germany-conservative-circle"]
              : [],
        kind: "domestic" as const,
        branch: chapter.title,
        era: "alternative" as const,
        countrySpecific: true,
        acceptLabel:
          template.id === "monarchist-uprising"
            ? "Ayaklanmayı başlat; iç savaşa gir"
            : template.id === "restore-empire"
              ? "Alman İmparatorluğu'nu ilan et"
              : "Planı uygula",
        declineLabel: "Hayır, bu yoldan vazgeç",
        effectText: `${template.effects.map(nationalEffectText).join("; ")}. ${nationalCostText(template.costs)}`,
        declineText:
          "Olay kapanır; hazırlık için harcanan siyasi güç geri verilmez. Uygulama bütçesi harcanmaz; bu olayın devamı açılmaz.",
        domestic,
      };
    }),
  );
}
