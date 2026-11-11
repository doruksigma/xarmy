import atlas from "./map-data.json";
import type { HistoricalEventDefinition } from "./historical-catalog";
import type { NationalEffect, NationalProgramme } from "./national-event-types";
import type { Building, Equipment, Resource } from "./types";

/** These are playable policy proposals, not claims that 9,200 historical
 * incidents occurred. Each country gets the same transparent policy toolkit;
 * country-specific alternate-history chapters are separately marked. */
type Template = {
  id: string;
  title: string;
  brief: string;
  effects: NationalEffect[];
  costs?: NationalProgramme["costs"];
  requirements?: NationalProgramme["requirements"];
};
type Chapter = { id: string; title: string; events: Template[] };
const b = (
  building: Building,
  location: "capital" | "port" | "lowest" = "lowest",
): NationalEffect => ({ kind: "building", building, amount: 1, location });
const s = (resource: Resource, amount: number): NationalEffect => ({
  kind: "stock",
  resource,
  amount,
});
const e = (equipment: Equipment, amount: number): NationalEffect => ({
  kind: "equipment",
  equipment,
  amount,
});
const n = (
  kind:
    | "treasury"
    | "stability"
    | "warSupport"
    | "exhaustion"
    | "political"
    | "science",
  amount: number,
): NationalEffect => ({ kind, amount });
const r = (technology: string, progress: number): NationalEffect => ({
  kind: "research",
  technology,
  progress,
  ifKnown: 0.01,
});
const t = (experience: number, organization = 0): NationalEffect => ({
  kind: "training",
  experience,
  organization,
});
const row = (
  id: string,
  title: string,
  brief: string,
  effects: NationalEffect[],
  costs?: NationalProgramme["costs"],
  requirements?: NationalProgramme["requirements"],
): Template => ({ id, title, brief, effects, costs, requirements });

const CHAPTERS: readonly Chapter[] = [
  {
    id: "industry",
    title: "Ulusal Sanayi",
    events: [
      row(
        "workshops",
        "Yerel Atölyelerin Birleştirilmesi",
        "Küçük işletmeleri ortak bir sivil üretim tesisinde birleştir.",
        [b("civil")],
        { treasury: 120, stock: { steel: 20 } },
      ),
      row(
        "machine-tools",
        "Takım Tezgâhı Denemeleri",
        "Yerli tezgâh denemelerine mühendis ve hammadde ayır.",
        [r("industry1", 35)],
        { treasury: 70, stock: { iron: 12 } },
      ),
      row(
        "arsenal",
        "Devlet Silah Atölyesi",
        "Askerî üretim için ayrı bir tesis kur.",
        [b("military")],
        { treasury: 150, stock: { steel: 25 } },
      ),
      row(
        "shift",
        "Gönüllü Ek Vardiya Anlaşması",
        "İşçi temsilcileriyle ücret karşılığında üretim takvimi üzerinde uzlaş.",
        [n("stability", 3), s("steel", 35)],
        { treasury: 95 },
      ),
      row(
        "repair-shops",
        "Makine Onarım Merkezleri",
        "Yol ve sanayi onarım atölyelerini ortak altyapıya bağla.",
        [b("infra"), e("truck", 5)],
        { treasury: 110, stock: { steel: 15 } },
      ),
      row(
        "dispersal",
        "Üretimin Taşraya Dağıtılması",
        "Yeni tesis için sanayisi en az gelişmiş güvenli bölgelerden birini seç.",
        [b("civil")],
        { treasury: 180, stock: { steel: 25 } },
      ),
      row(
        "quality",
        "Silah Kabul Heyeti",
        "Hatalı parçaları ayıran bir kabul heyetiyle silah deposunu tamamla.",
        [e("rifle", 45), e("artillery", 5)],
        { treasury: 100, stock: { steel: 20 } },
      ),
      row(
        "assembly",
        "Montaj Hattı Denemesi",
        "Tezgâh bilgisini seri üretim deneylerine aktar.",
        [r("industry2", 45)],
        { treasury: 110, stock: { steel: 20 } },
        { tech: ["industry1"] },
      ),
      row(
        "reserve-plant",
        "Yedek Üretim Tesisi",
        "Seferberlikte kullanılmak üzere ikinci bir askerî üretim sahası hazırla.",
        [b("military"), n("stability", -2)],
        { treasury: 190, stock: { steel: 30 } },
      ),
      row(
        "standards",
        "Ulusal Sanayi Standardı",
        "Sanayi planının sonuçlarını teknik eğitime ve üretim rezervine aktar.",
        [n("science", 0.025), s("steel", 50), n("stability", 3)],
        { treasury: 150 },
      ),
    ],
  },
  {
    id: "resources",
    title: "Kaynak ve Enerji",
    events: [
      row(
        "survey",
        "Maden Arama Heyeti",
        "Jeologları maden sahalarına gönder ve işletme altyapısını genişlet.",
        [b("mine")],
        { treasury: 100, stock: { steel: 10 } },
      ),
      row(
        "iron-reserve",
        "Demir Stok Programı",
        "Bütçeyle satın alınan demiri stratejik depoya ayır.",
        [s("iron", 90)],
        { treasury: 85 },
      ),
      row(
        "smelter",
        "Yeni Döküm Partisi",
        "Demir ve bütçe ayırarak çelik rezervi oluştur.",
        [s("steel", 70)],
        { treasury: 70, stock: { iron: 90 } },
      ),
      row(
        "fuel-depot",
        "Acil Yakıt Deposu",
        "Eğitim ve ulaşım için ayrılmış yakıt stoğunu büyüt.",
        [s("fuel", 100)],
        { treasury: 95, stock: { oil: 30 } },
      ),
      row(
        "refinery",
        "Rafineri Yatırımı",
        "Petrolün yakıta çevrilmesi için yeni rafineri kur.",
        [b("refinery")],
        { treasury: 160, stock: { steel: 25 } },
      ),
      row(
        "aluminum",
        "Havacılık Alüminyumu",
        "Uçak sanayisi için işlenmiş alüminyum satın al.",
        [s("aluminum", 70)],
        { treasury: 110 },
      ),
      row(
        "rubber",
        "Kauçuk Tedarik Sözleşmesi",
        "Motorlu araçlar için kauçuk stokuna kaynak ayır.",
        [s("rubber", 55)],
        { treasury: 100 },
      ),
      row(
        "synthetic",
        "Sentetik Kaynak Tesisi",
        "Dış tedarike bağımlılığı azaltacak sentetik üretim tesisini kur.",
        [b("synthetic")],
        { treasury: 190, stock: { steel: 30 } },
      ),
      row(
        "oil-reserve",
        "Petrol İhtiyatı",
        "Gelecek harekâtların petrol gereksinimi için devlet alımı yap.",
        [s("oil", 100), n("stability", -1)],
        { treasury: 150 },
      ),
      row(
        "balanced-reserve",
        "Dengeli Savaş Rezervi",
        "Tek kaynağa yığılmadan sanayi ve ulaşım depolarını birlikte tamamla.",
        [s("steel", 35), s("fuel", 60), s("rubber", 20)],
        { treasury: 160, stock: { iron: 25 } },
      ),
    ],
  },
  {
    id: "transport",
    title: "Ulaşım ve İkmal",
    events: [
      row(
        "capital-roads",
        "Başkent Bağlantı Yolları",
        "Başkent çevresindeki ana yolları güçlendir.",
        [b("infra", "capital")],
        { treasury: 95, stock: { steel: 10 } },
      ),
      row(
        "rail-survey",
        "Demiryolu Etüdü",
        "Demiryolu bağlantısı zayıf bir bölgeye ilk ray yatırımını yap.",
        [b("rail")],
        { treasury: 100, stock: { steel: 20 } },
      ),
      row(
        "warehouse",
        "Bölgesel İkmal Merkezi",
        "Cephe gerisine malzeme dağıtan yeni bir merkez kur.",
        [b("hub")],
        { treasury: 140, stock: { steel: 15 } },
      ),
      row(
        "motor-pool",
        "Devlet Kamyon Havuzu",
        "Kara ikmalinde kullanılmak üzere kamyon satın al.",
        [e("truck", 25)],
        { treasury: 110, stock: { steel: 20, rubber: 10 } },
      ),
      row(
        "dispatch",
        "Sevkiyat Planlama Bürosu",
        "Sevkiyat planlarını lojistik araştırmasıyla ortaklaştır.",
        [r("logistics", 35)],
        { treasury: 75 },
      ),
      row(
        "bridges",
        "Köprü Güçlendirme Programı",
        "Ağır yük taşıyan yolların altyapısını yenile.",
        [b("infra"), s("fuel", 25)],
        { treasury: 135, stock: { steel: 20 } },
      ),
      row(
        "junctions",
        "Demiryolu Kavşakları",
        "İkinci bir bölgedeki ray kapasitesini genişlet.",
        [b("rail")],
        { treasury: 125, stock: { steel: 25 } },
      ),
      row(
        "ambulance",
        "Tahliye ve Sağlık Araçları",
        "Cephe gerisi araçlarını ve dinlenme planlarını hazırla.",
        [e("truck", 15), n("exhaustion", -6)],
        { treasury: 120, stock: { steel: 10, rubber: 8 } },
      ),
      row(
        "forward-depot",
        "İleri Bölge Depoları",
        "Ana dağıtım merkezine ek bir ikmal merkezi kur.",
        [b("hub"), s("fuel", 35)],
        { treasury: 180, stock: { steel: 20 } },
      ),
      row(
        "transport-drill",
        "Birleşik Sevkiyat Tatbikatı",
        "Orduya araç, yakıt ve sevkiyat tecrübesi kazandır.",
        [t(3, 5), e("truck", 10), s("fuel", 40)],
        { treasury: 130, stock: { rubber: 6 } },
      ),
    ],
  },
  {
    id: "army",
    title: "Kara Kuvvetleri",
    events: [
      row(
        "rifle-schools",
        "Piyade Silah Okulları",
        "Yeni tüfekleri eğitim birliklerine teslim et.",
        [e("rifle", 60), t(2)],
        { treasury: 95, stock: { steel: 18 } },
      ),
      row(
        "field-exercise",
        "Saha Manevraları",
        "Mevcut tümenleri kısa bir müşterek eğitime al.",
        [t(5, 8), n("warSupport", 2)],
        { treasury: 90, stock: { fuel: 15 } },
      ),
      row(
        "gun-battery",
        "Sahra Topçusu Alımı",
        "Topçu birlikleri için yeni malzeme partisi sipariş et.",
        [e("artillery", 16)],
        { treasury: 110, stock: { steel: 24 } },
      ),
      row(
        "light-armor",
        "Hafif Zırh Denemeleri",
        "İlk zırhlı araç programının araştırmasını destekle.",
        [r("armor1", 35)],
        { treasury: 95, stock: { steel: 15 } },
      ),
      row(
        "motor-school",
        "Motorlu Birlik Okulu",
        "Piyadenin araçlarla hareketini araştıran bir eğitim grubu kur.",
        [r("motorization", 35), e("truck", 8)],
        { treasury: 110, stock: { rubber: 5 } },
      ),
      row(
        "staff-college",
        "Kurmay Harp Oyunu",
        "Birleşik silah taktiklerini masa başında ve sahada sına.",
        [r("landDoctrine", 35), t(3)],
        { treasury: 115 },
      ),
      row(
        "mountain-school",
        "Zorlu Arazi Eğitim Kampı",
        "Özel kuvvetler için arazi eğitimi araştırmasını ilerlet.",
        [r("special", 35)],
        { treasury: 100, equipment: { rifle: 10 } },
      ),
      row(
        "medium-armor",
        "Orta Tank Prototipi",
        "Hafif tank bilgisini daha ağır tasarımlara aktar.",
        [r("armor2", 40)],
        { treasury: 140, stock: { steel: 25 } },
        { tech: ["armor1"] },
      ),
      row(
        "field-reserve",
        "Saha Ekipman İhtiyatı",
        "Gelecekteki kayıplar için silah ve top stoğunu artır.",
        [e("rifle", 75), e("artillery", 12)],
        { treasury: 155, stock: { steel: 35 } },
      ),
      row(
        "combined-maneuvers",
        "Müşterek Kara Tatbikatı",
        "Kara planının sonunda tümenleri hazırlık tatbikatına al.",
        [t(8, 10), n("warSupport", 4)],
        { treasury: 150, stock: { fuel: 25 }, equipment: { rifle: 8 } },
      ),
    ],
  },
  {
    id: "air",
    title: "Hava Savunması",
    events: [
      row(
        "airstrip",
        "Askerî Hava Meydanı",
        "Hava kanatlarının konuşlanması için alan aç.",
        [b("airfield")],
        { treasury: 140, stock: { steel: 20 } },
      ),
      row(
        "fighter-desk",
        "Avcı Uçağı Tasarım Masası",
        "Yerli avcı uçağı çizimlerini deneylere dönüştür.",
        [r("aviation1", 35)],
        { treasury: 105, stock: { aluminum: 12 } },
      ),
      row(
        "aa-posts",
        "Uçaksavar Mevzileri",
        "Hava saldırılarına karşı koruyucu tesis kur.",
        [b("antiAir")],
        { treasury: 100, stock: { steel: 15 } },
      ),
      row(
        "observers",
        "Gözlem ve Erken Uyarı",
        "Radar ve tespit yöntemlerinin araştırmasını destekle.",
        [r("radar", 35)],
        { treasury: 100 },
      ),
      row(
        "fighter-batch",
        "İlk Avcı Uçağı Partisi",
        "Tamamlanmış tasarımdan uçak sipariş et; kanatları ordu menüsünden kurabilirsin.",
        [e("fighter", 12)],
        { treasury: 145, stock: { aluminum: 20, rubber: 8 } },
        { tech: ["aviation1"] },
      ),
      row(
        "recon-desk",
        "Keşif Havacılığı Bürosu",
        "Harita ve fotoğraf keşfi için uçak araştırmasını ilerlet.",
        [r("recon", 35)],
        { treasury: 115 },
        { tech: ["aviation1"] },
      ),
      row(
        "bomber-desk",
        "Taktik Bombardıman Çalışması",
        "Mevcut havacılık bilgisiyle bombardıman tasarımını destekle.",
        [r("aviation2", 40)],
        { treasury: 130, stock: { aluminum: 15 } },
        { tech: ["aviation1"] },
      ),
      row(
        "air-doctrine",
        "Hava Harekât Okulu",
        "Kanatların birlikte savaşması için doktrin çalışmasına kaynak ayır.",
        [r("airDoctrine", 40)],
        { treasury: 125 },
        { tech: ["aviation1"] },
      ),
      row(
        "reserve-airfield",
        "Yedek Hava Üssü",
        "Bir hava üssü daha geliştirerek konuşlanma kapasitesini artır.",
        [b("airfield"), s("fuel", 60)],
        { treasury: 175, stock: { steel: 20 } },
      ),
      row(
        "air-defense-network",
        "Entegre Hava Savunma Ağı",
        "Araştırılmış radarları hava savunmasına bağla.",
        [b("radar"), b("antiAir")],
        { treasury: 210, stock: { steel: 25 } },
        { tech: ["radar"] },
      ),
    ],
  },
  {
    id: "science",
    title: "Bilim ve Eğitim",
    events: [
      row(
        "technical-school",
        "Teknik Öğretmen Programı",
        "Yeni teknik öğretmenler için bütçe ayır.",
        [n("science", 0.025)],
        { treasury: 95 },
      ),
      row(
        "scholarship",
        "Mühendislik Bursları",
        "Öğrencilere burs ve laboratuvar desteği sağla.",
        [n("science", 0.02), n("stability", 2)],
        { treasury: 110 },
      ),
      row(
        "cipher-school",
        "Şifreleme Okulu",
        "Kamu haberleşmesi için şifreleme yöntemlerini araştır.",
        [r("encryption", 35)],
        { treasury: 95 },
      ),
      row(
        "testing-lab",
        "Malzeme Test Laboratuvarı",
        "Sanayi testlerinde kullanılacak ortak bir laboratuvar kur.",
        [n("science", 0.025), s("steel", 15)],
        { treasury: 125 },
      ),
      row(
        "apprentices",
        "Usta–Çırak Seferberliği",
        "Sivil iş gücünü uygulamalı eğitime al.",
        [n("science", 0.015), n("stability", 4)],
        { treasury: 100 },
      ),
      row(
        "engines-lab",
        "Motor Deney İstasyonu",
        "Zırhlı motor prototiplerini ayrı bir laboratuvarda sına.",
        [r("engines", 40)],
        { treasury: 130, stock: { steel: 15 } },
        { tech: ["armor1"] },
      ),
      row(
        "decoding",
        "Şifre Çözümleme Grubu",
        "Şifreleme bilgisini çözümleme araştırmasına aktar.",
        [r("decryption", 40)],
        { treasury: 140 },
        { tech: ["encryption"] },
      ),
      row(
        "institute",
        "Ulusal Araştırma Enstitüsü",
        "Uzun vadeli araştırma için kalıcı kadro kur.",
        [n("science", 0.04), n("stability", -1)],
        { treasury: 180 },
      ),
      row(
        "engineers-reserve",
        "Yedek Mühendis Kadrosu",
        "Araştırma kurullarına yeni teknisyenler yetiştir.",
        [n("science", 0.025), e("truck", 5)],
        { treasury: 145, stock: { rubber: 3 } },
      ),
      row(
        "open-science",
        "Bilimsel Yayın Kurulu",
        "Araştırma sonuçlarını ülke içindeki kurumlar arasında paylaş.",
        [n("science", 0.035), n("stability", 3)],
        { treasury: 165 },
      ),
    ],
  },
  {
    id: "civil",
    title: "Halk ve Dayanıklılık",
    events: [
      row(
        "food",
        "Gıda Dağıtım Kurulu",
        "Temel gıda sevkiyatına bütçe ayırarak halkın güvenini artır.",
        [n("stability", 5)],
        { treasury: 70 },
      ),
      row(
        "health",
        "Gezici Sağlık Ekipleri",
        "Yorgun bölgelere sağlık ve dinlenme desteği götür.",
        [n("exhaustion", -6), n("stability", 2)],
        { treasury: 90 },
      ),
      row(
        "shelters",
        "Sivil Sığınak Düzeni",
        "Başkentteki savunma tesislerini sivil korumayla birleştir.",
        [b("fort", "capital"), n("stability", 2)],
        { treasury: 120, stock: { steel: 15 } },
      ),
      row(
        "housing",
        "İşçi Konutlarına Ulaşım",
        "Konut bölgelerinin altyapısını üretim sahalarına bağla.",
        [b("infra"), n("stability", 3)],
        { treasury: 145, stock: { steel: 12 } },
      ),
      row(
        "veterans",
        "Gazi ve Aile Fonu",
        "Savaştan etkilenen ailelere bütçeden destek ver.",
        [n("exhaustion", -8), n("stability", 3)],
        { treasury: 120 },
      ),
      row(
        "labor",
        "İş Güvenliği Uzlaşması",
        "Fabrikalarda güvenlik ve çalışma koşulları için uzlaşma sağla.",
        [n("stability", 6), n("warSupport", -2)],
        { treasury: 105 },
      ),
      row(
        "evacuation",
        "Sivil Tahliye Planı",
        "Tahliye araçlarını ve yerel koordinasyonu önceden hazırla.",
        [e("truck", 12), n("exhaustion", -5)],
        { treasury: 120, stock: { steel: 10, rubber: 5 } },
      ),
      row(
        "volunteers",
        "Sivil Gönüllü Ağı",
        "Yerel gönüllüleri ülke savunmasına destek için örgütle.",
        [n("warSupport", 6), n("stability", 2)],
        { treasury: 110 },
      ),
      row(
        "relief",
        "Yeniden Toparlanma Fonu",
        "Yorgunluğu azaltmak için ikinci bir yardım bütçesi aç.",
        [n("exhaustion", -12), n("stability", 3)],
        { treasury: 155 },
      ),
      row(
        "social-contract",
        "Ulusal Dayanışma Sözleşmesi",
        "Sivil programın sonuçlarını kalıcı toplumsal güvene dönüştür.",
        [n("stability", 8), n("warSupport", 3)],
        { treasury: 170 },
      ),
    ],
  },
  {
    id: "governance",
    title: "Yönetim ve Uzlaşma",
    events: [
      row(
        "audit",
        "Kamu Hesaplarının Denetimi",
        "Devlet hesaplarını denetleyerek karar alma güvenini artır.",
        [n("political", 20), n("stability", 2)],
        { treasury: 65 },
      ),
      row(
        "local-councils",
        "Yerel Danışma Meclisleri",
        "Yerel temsilcileri idari kararlara dahil et.",
        [n("stability", 5)],
        { treasury: 85 },
      ),
      row(
        "civil-service",
        "Memur Eğitim Programı",
        "Devlet kadrolarını daha tutarlı idare için eğit.",
        [n("political", 25), n("science", 0.01)],
        { treasury: 95 },
      ),
      row(
        "budget",
        "Açık Bütçe Görüşmeleri",
        "Bütçe üzerindeki gerilimi açık görüşmelerle azalt.",
        [n("stability", 4), n("political", 15)],
        { treasury: 90 },
      ),
      row(
        "mediation",
        "İşçi ve İşveren Arabuluculuğu",
        "Üretimi aksatan anlaşmazlıkları müzakere masasına taşı.",
        [n("stability", 5), n("exhaustion", -3)],
        { treasury: 105 },
      ),
      row(
        "public-radio",
        "Kamu Bilgilendirme Radyosu",
        "Devlet kararlarını halka düzenli biçimde duyur.",
        [n("warSupport", 5), n("political", 15)],
        { treasury: 110 },
      ),
      row(
        "regional-congress",
        "Bölgesel Kalkınma Kongresi",
        "Taşra yatırımlarını ortak bir sivil tesis etrafında topla.",
        [b("civil"), n("stability", 2)],
        { treasury: 200, stock: { steel: 20 } },
      ),
      row(
        "legal-review",
        "Olağanüstü Yetkilerin İncelenmesi",
        "İdari yetkileri gözden geçirerek toplumsal güveni artır.",
        [n("stability", 6), n("warSupport", -3)],
        { treasury: 100 },
      ),
      row(
        "cabinet-workshop",
        "Kabine Koordinasyon Toplantısı",
        "Bakanlıklar arasındaki öncelikleri ortak bir takvime bağla.",
        [n("political", 35), n("science", 0.01)],
        { treasury: 135 },
      ),
      row(
        "national-charter",
        "Ulusal İdare Mutabakatı",
        "Yerel yönetim ve merkez arasında kalıcı bir çalışma düzeni kur.",
        [n("stability", 7), n("political", 20)],
        { treasury: 155 },
      ),
    ],
  },
  {
    id: "security",
    title: "Güvenlik ve Savunma",
    events: [
      row(
        "capital-guard",
        "Başkent Savunma Planı",
        "Başkentteki tahkimatı ve muhafız malzemesini tamamla.",
        [b("fort", "capital"), e("rifle", 15)],
        { treasury: 100, stock: { steel: 15 } },
      ),
      row(
        "reserve-officers",
        "Yedek Subay Semineri",
        "Mevcut birliklere komuta eğitimi ver.",
        [t(4, 3)],
        { treasury: 85 },
      ),
      row(
        "communications",
        "Güvenli Muhabere Çalışması",
        "Askerî haberleşmenin şifreleme araştırmasını destekle.",
        [r("encryption", 25), e("truck", 4)],
        { treasury: 95 },
      ),
      row(
        "district-depots",
        "Bölge Savunma Depoları",
        "Yerel savunma depolarına piyade malzemesi ayır.",
        [e("rifle", 40), s("fuel", 20)],
        { treasury: 105, stock: { steel: 12 } },
      ),
      row(
        "defense-works",
        "Savunma Hattı İnşası",
        "Tahkimatı düşük bir bölgede yeni savunma çalışması başlat.",
        [b("fort")],
        { treasury: 125, stock: { steel: 20 } },
      ),
      row(
        "emergency-drill",
        "Acil Durum Tatbikatı",
        "Komuta ve yerel idarenin birlikte hareket etmesini sına.",
        [t(3, 6), n("stability", 2)],
        { treasury: 100 },
      ),
      row(
        "field-signals",
        "Saha Muhabere Araçları",
        "İleri karargâhlara araç ve yakıt ayır.",
        [e("truck", 15), s("fuel", 30)],
        { treasury: 120, stock: { steel: 10, rubber: 6 } },
      ),
      row(
        "defense-industry",
        "Savunma Sanayisi Yedeği",
        "Uzun süreli savunma için askerî üretim kapasitesini genişlet.",
        [b("military")],
        { treasury: 185, stock: { steel: 30 } },
      ),
      row(
        "prepared-reserves",
        "Hazır İhtiyat Birlikleri",
        "Tümenlerin eğitim ve örgütlenme durumunu iyileştir.",
        [t(6, 8), e("artillery", 6)],
        { treasury: 135, stock: { steel: 12 } },
      ),
      row(
        "security-council",
        "Ulusal Güvenlik Kurulu",
        "Savunma planını sivil yönetimle ortaklaştır.",
        [n("warSupport", 5), n("stability", 4), n("political", 15)],
        { treasury: 145 },
      ),
    ],
  },
];

const NAVAL: Chapter = {
  id: "naval",
  title: "Denizcilik",
  events: [
    row(
      "dock",
      "Tersane Yatırımı",
      "Kontrolündeki bir limanda gemi üretimi kapasitesi kur.",
      [b("dock", "port")],
      { treasury: 165, stock: { steel: 30 } },
    ),
    row(
      "design",
      "Gemi Tasarım Kurulu",
      "Modern gemi inşası araştırmasına kaynak ayır.",
      [r("naval1", 35)],
      { treasury: 110 },
    ),
    row(
      "port-rail",
      "Liman Demiryolu Bağlantısı",
      "Limanın ikmal altyapısını güçlendir.",
      [b("rail", "port")],
      { treasury: 125, stock: { steel: 20 } },
    ),
    row(
      "naval-fuel",
      "Donanma Yakıt Rezervi",
      "Deniz görevlerine ayrılabilecek yakıt satın al.",
      [s("fuel", 120)],
      { treasury: 140, stock: { oil: 25 } },
    ),
    row(
      "submarine-design",
      "Denizaltı Tasarım Denemesi",
      "Modern tersane bilgisini denizaltı araştırmasına aktar.",
      [r("submarines", 40)],
      { treasury: 140, stock: { steel: 15 } },
      { tech: ["naval1"] },
    ),
    row(
      "escort-design",
      "Deniz Harekât Okulu",
      "Deniz görevlerinin doktrinini geliştir.",
      [r("navalDoctrine", 40)],
      { treasury: 135 },
      { tech: ["naval1"] },
    ),
    row(
      "port-defense",
      "Liman Savunması",
      "Ana deniz üssünü hava saldırılarına karşı güçlendir.",
      [b("antiAir", "port"), b("fort", "port")],
      { treasury: 180, stock: { steel: 25 } },
    ),
    row(
      "gunnery",
      "Deniz Topçuluğu Denemeleri",
      "Büyük gemi silahlarının araştırmasını destekle.",
      [r("naval2", 40)],
      { treasury: 150, stock: { steel: 20 } },
      { tech: ["naval1"] },
    ),
    row(
      "dock-expansion",
      "Tersane Havuzunun Genişletilmesi",
      "İkinci tersane yatırımıyla gemi üretimine yer aç.",
      [b("dock", "port")],
      { treasury: 210, stock: { steel: 35 } },
    ),
    row(
      "carrier-studies",
      "Deniz Havacılığı Etüdü",
      "Tersane ve avcı bilgisiyle uçak gemisi araştırmasını ilerlet.",
      [r("carriers", 45)],
      { treasury: 180, stock: { steel: 20, aluminum: 15 } },
      { tech: ["naval1", "aviation1"] },
    ),
  ],
};
const INLAND: Chapter = {
  id: "inland",
  title: "İç Bölge Ulaşımı",
  events: [
    row(
      "freight-yard",
      "İç Bölge Yük Sahası",
      "Denize çıkışı olmayan ülke için kara yük sahasını geliştir.",
      [b("hub")],
      { treasury: 145, stock: { steel: 18 } },
    ),
    row(
      "customs-road",
      "Gümrük Yolu İyileştirmesi",
      "Sınır ticaretinin kullanabileceği kara altyapısını güçlendir.",
      [b("infra")],
      { treasury: 110, stock: { steel: 12 } },
    ),
    row(
      "cargo-trucks",
      "Kara Kargo Filosu",
      "İç bölge taşımacılığına kamyon sipariş et.",
      [e("truck", 20)],
      { treasury: 110, stock: { steel: 15, rubber: 8 } },
    ),
    row(
      "depot-fuel",
      "Kara Taşımacılığı Yakıtı",
      "Uzun kara güzergâhları için yakıt stoku ayır.",
      [s("fuel", 100)],
      { treasury: 130, stock: { oil: 20 } },
    ),
    row(
      "rail-works",
      "Yük Demiryolu İmalatı",
      "Ray kapasitesini artırarak kara bağlantılarını güçlendir.",
      [b("rail")],
      { treasury: 135, stock: { steel: 25 } },
    ),
    row(
      "route-desk",
      "İç Hat Planlama Masası",
      "Uzun kara taşımacılığı için lojistik araştırmasını ilerlet.",
      [r("logistics", 40)],
      { treasury: 115 },
    ),
    row(
      "depot-defense",
      "İkmal Sahası Savunması",
      "İç bölge depolarının çevresine tahkimat ve uçaksavar kur.",
      [b("fort"), b("antiAir")],
      { treasury: 180, stock: { steel: 25 } },
    ),
    row(
      "motor-tests",
      "Uzun Yol Motor Denemeleri",
      "Zırhlı motorların dayanıklılık araştırmasına destek ver.",
      [r("engines", 40)],
      { treasury: 140, stock: { steel: 15 } },
      { tech: ["armor1"] },
    ),
    row(
      "freight-hub",
      "Merkezî Yük Dağıtım Tesisi",
      "İkinci bir ikmal merkezini ulusal dağıtıma kat.",
      [b("hub"), e("truck", 8)],
      { treasury: 180, stock: { steel: 20 } },
    ),
    row(
      "inland-reserve",
      "İç Bölge Stratejik İhtiyatı",
      "Kara taşımacılığı ve savunma malzemesini birlikte stokla.",
      [e("truck", 15), e("rifle", 35), s("fuel", 50)],
      { treasury: 175, stock: { steel: 20, rubber: 8 } },
    ),
  ],
};

const BUILDING_NAMES: Record<Building, string> = {
  civil: "sivil fabrika",
  military: "askerî fabrika",
  dock: "tersane",
  infra: "altyapı",
  rail: "demiryolu",
  hub: "ikmal merkezi",
  refinery: "rafineri",
  synthetic: "sentetik tesis",
  fort: "tahkimat",
  radar: "radar",
  mine: "maden",
  airfield: "hava üssü",
  antiAir: "uçaksavar",
};
const RESOURCE_NAMES: Record<Resource, string> = {
  iron: "demir",
  steel: "çelik",
  oil: "petrol",
  aluminum: "alüminyum",
  rubber: "kauçuk",
  fuel: "yakıt",
};
const EQUIPMENT_NAMES: Record<Equipment, string> = {
  rifle: "tüfek",
  artillery: "top",
  truck: "kamyon",
  lightTank: "hafif tank",
  mediumTank: "orta tank",
  heavyTank: "ağır tank",
  fighter: "avcı",
  bomber: "bombardıman uçağı",
  strategicBomber: "stratejik bombardıman uçağı",
  reconPlane: "keşif uçağı",
  transport: "nakliye uçağı",
  carrierFighter: "deniz avcısı",
  ship: "gemilik ekipman",
  destroyer: "muhrip ekipmanı",
  battleship: "zırhlı ekipmanı",
  submarine: "denizaltı ekipmanı",
  carrier: "uçak gemisi ekipmanı",
};
const TECH_NAMES: Record<string, string> = {
  industry1: "Takım tezgâhları",
  industry2: "Seri üretim",
  armor1: "Hafif zırhlılar",
  armor2: "Orta tank tasarımı",
  armor3: "Ağır zırh",
  engines: "Gelişmiş motorlar",
  motorization: "Motorize lojistik",
  mechanization: "Mekanize piyade",
  special: "Özel kuvvet eğitimi",
  logistics: "Lojistik teşkilatı",
  landDoctrine: "Birleşik silah doktrini",
  airDoctrine: "Hava harekât doktrini",
  navalDoctrine: "Deniz harekât doktrini",
  aviation1: "Avcı tasarımı",
  aviation2: "Bombardıman tasarımı",
  aviation3: "Gelişmiş uçak motoru",
  recon: "Hava keşfi",
  radar: "Radar ve erken uyarı",
  encryption: "Şifreleme",
  decryption: "Şifre çözme",
  naval1: "Modern tersaneler",
  naval2: "Deniz topçuluğu",
  submarines: "Denizaltı harbi",
  carriers: "Uçak gemileri",
};
const IDEOLOGY_NAMES = {
  monarchy: "monarşi",
  democracy: "demokrasi",
  republic: "cumhuriyet",
  fascism: "faşizm",
  communism: "komünizm",
};
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v}`;
export function nationalEffectText(effect: NationalEffect): string {
  switch (effect.kind) {
    case "building":
      return `${effect.location === "capital" ? "Başkentte" : effect.location === "port" ? "Kontrol edilen uygun bir limanda" : "Kontrol edilen uygun bir bölgede"} ${signed(effect.amount)} ${BUILDING_NAMES[effect.building]}`;
    case "equipment":
      return `Depoya ${signed(effect.amount)} ${EQUIPMENT_NAMES[effect.equipment]}`;
    case "stock":
      return `Stoka ${signed(effect.amount)} ${RESOURCE_NAMES[effect.resource]}`;
    case "research":
      return `${TECH_NAMES[effect.technology] ?? effect.technology} araştırmasına +${effect.progress} gün${effect.ifKnown ? `; teknoloji zaten tamamlandıysa bunun yerine araştırma katsayısı +${effect.ifKnown}` : ""}`;
    case "training":
      return `Mevcut tümenlere +${effect.experience} tecrübe, +${effect.organization} organizasyon`;
    case "party":
      return `${IDEOLOGY_NAMES[effect.ideology]} desteği ${signed(effect.amount)}`;
    case "government":
      return `Yönetim ${IDEOLOGY_NAMES[effect.ideology]} olur${effect.name ? `; ülke adı ${effect.name}` : ""}${effect.leader ? `; lider ${effect.leader}` : ""}`;
    case "uprising":
      return `${IDEOLOGY_NAMES[effect.government]} tarafını yönetirsin; ${IDEOLOGY_NAMES[effect.opposition]} yanlıları toprak ve orduyla ayrı bir taraf kurar; gerçek iç savaş başlar`;
    case "restoration":
      return `İç savaş kazanıldıktan sonra ${effect.name} kurulur; lider ${effect.leader}; yönetim monarşi olur`;
    default:
      return `${({ treasury: "Hazine", stability: "İstikrar", warSupport: "Savaş desteği", exhaustion: "Savaş yorgunluğu", political: "Siyasi güç", science: "Araştırma katsayısı" } as Record<string, string>)[effect.kind]} ${signed(effect.amount)}`;
  }
}
export function nationalCostText(costs: NationalProgramme["costs"]): string {
  const parts: string[] = [];
  if (costs?.treasury) parts.push(`${costs.treasury} hazine`);
  for (const [key, amount] of Object.entries(costs?.stock ?? {}))
    parts.push(`${amount} ${RESOURCE_NAMES[key as Resource]}`);
  for (const [key, amount] of Object.entries(costs?.equipment ?? {}))
    parts.push(`${amount} ${EQUIPMENT_NAMES[key as Equipment]}`);
  return parts.length
    ? `Kabulde harcanır: ${parts.join(", ")}.`
    : "Kabulde ek malzeme maliyeti yok.";
}

const countryInfo = new Map(atlas.countries.map((c) => [c.id, c]));
const coastal = new Set(
  atlas.provinces.filter((p) => p.port).map((p) => p.country),
);
export const SCENARIO_COUNTRY_IDS: readonly string[] = atlas.countries.map(
  (c) => c.id,
);
export function nationalPolicies(country: string): HistoricalEventDefinition[] {
  const info = countryInfo.get(country);
  if (!info) return [];
  const chapters = [...CHAPTERS, coastal.has(country) ? NAVAL : INLAND];
  return chapters.flatMap((chapter) =>
    chapter.events.map((template, index) => {
      const id = `national-${country}-${template.id}`;
      const domestic: NationalProgramme = {
        costs: template.costs,
        requirements: template.requirements,
        effects: template.effects,
      };
      return {
        id,
        country,
        title: template.title,
        description: `${info.name} için ulusal program: ${template.brief} Bu bir oyuncu politikasıdır; gerçekleşmiş bir tarihî olay iddiası değildir.`,
        date: "1936-01-01",
        cost: 20 + index * 5,
        days: 14 + index * 3,
        requires: index
          ? [`history-national-${country}-${chapter.events[index - 1].id}`]
          : [],
        kind: "domestic" as const,
        branch: chapter.title,
        era: "policy" as const,
        countrySpecific: false,
        acceptLabel: "Programı uygula",
        declineLabel: "Hayır, programdan vazgeç",
        effectText: `${template.effects.map(nationalEffectText).join("; ")}. ${nationalCostText(template.costs)}`,
        declineText:
          "Program kapanır; hazırlık için harcanan siyasi güç geri verilmez. Uygulama bütçesi ve malzemeler harcanmaz; bağlı sonraki programlar açılmaz.",
        domestic,
      };
    }),
  );
}

/** Minor states with fewer than three regions cannot be partitioned into a
 * playable civil war. Their alternate chapter explicitly uses a peaceful
 * transition and never advertises a fictitious revolt. */
export function alternatePolicies(
  country: string,
): HistoricalEventDefinition[] {
  const info = countryInfo.get(country);
  if (!info || country === "germany") return [];
  const canSplit =
    atlas.provinces.filter((p) => p.country === country).length >= 3;
  const monarchy = [
    row(
      "royal-convention",
      "Monarşist Kurultay",
      "Hanedan yanlılarını ortak bir siyasi programda buluştur. Cumhuriyetçi muhalefet yolu kapanır.",
      [{ kind: "party", ideology: "monarchy", amount: 15 }, n("stability", -3)],
      { treasury: 75 },
    ),
    row(
      "royal-transition",
      canSplit ? "Monarşist İç Savaş" : "Monarşiye Barışçıl Geçiş",
      canSplit
        ? "Monarşist yönetimi üstlen; eski yönetime bağlı ayrı bir taraf ve gerçek iç savaş oluşur."
        : "Bölünemeyecek kadar küçük ülkede istikrarlı bir barışçıl yönetim geçişi uygula.",
      canSplit
        ? [
            {
              kind: "uprising",
              government: "monarchy",
              opposition:
                info.ideology === "monarchy"
                  ? "republic"
                  : (info.ideology as
                      | "democracy"
                      | "republic"
                      | "fascism"
                      | "communism"),
            },
          ]
        : [
            {
              kind: "government",
              ideology: "monarchy",
              leader: "Ulusal hanedan konseyi",
            },
            n("stability", -8),
          ],
      { treasury: 140 },
      {
        independent: true,
        peace: true,
        noCivilWar: true,
        ...(canSplit ? {} : { minStability: 55 }),
      },
    ),
    row(
      "royal-settlement",
      "Monarşist Yönetimin Tescili",
      canSplit
        ? "Rakip yönetimi yenmeden tescil yapılamaz; iç savaş zaferinden sonra monarşist kurumları yerleştir."
        : "Barışçıl geçişin ardından yeni yönetimin kurumlarını düzenle.",
      [
        {
          kind: "government",
          ideology: "monarchy",
          leader: "Ulusal hanedan konseyi",
        },
        n("stability", 6),
      ],
      { treasury: 120 },
      {
        ideologies: ["monarchy"],
        peace: true,
        ...(canSplit ? { civilWarVictory: true } : {}),
      },
    ),
    row(
      "royal-charter",
      "Hanedan ve Meclis Mutabakatı",
      "Yeni monarşide sivil kurumlar ve yönetim arasında çalışma düzeni kur.",
      [n("stability", 6), n("political", 25)],
      { treasury: 125 },
      { ideologies: ["monarchy"] },
    ),
    row(
      "royal-reconstruction",
      "Monarşist İmar Fonu",
      "Yeni yönetimin sivil üretim ve toplumsal toparlanma programını başlat.",
      [b("civil"), n("exhaustion", -10)],
      { treasury: 185, stock: { steel: 25 } },
      { ideologies: ["monarchy"] },
    ),
  ];
  const republic = [
    row(
      "civic-front",
      "Cumhuriyetçi Muhalefet Cephesi",
      "Cumhuriyetçi örgütleri ortak reform programına çağır. Monarşist kurultay yolu kapanır.",
      [{ kind: "party", ideology: "republic", amount: 15 }, n("stability", -3)],
      { treasury: 75 },
    ),
    row(
      "civic-transition",
      canSplit ? "Cumhuriyetçi İç Savaş" : "Cumhuriyete Barışçıl Geçiş",
      canSplit
        ? "Cumhuriyetçi yönetimi üstlen; eski yönetime bağlı ayrı bir taraf ve gerçek iç savaş oluşur."
        : "Küçük ülkede bölünme yaratmadan istikrarlı bir barışçıl yönetim geçişi uygula.",
      canSplit
        ? [
            {
              kind: "uprising",
              government: "republic",
              opposition:
                info.ideology === "republic"
                  ? "monarchy"
                  : (info.ideology as
                      | "democracy"
                      | "monarchy"
                      | "fascism"
                      | "communism"),
            },
          ]
        : [
            {
              kind: "government",
              ideology: "republic",
              leader: "Kurucu meclis",
            },
            n("stability", -8),
          ],
      { treasury: 140 },
      {
        independent: true,
        peace: true,
        noCivilWar: true,
        ...(canSplit ? {} : { minStability: 55 }),
      },
    ),
    row(
      "civic-assembly",
      "Kurucu Meclis",
      canSplit
        ? "İç savaş zaferinden sonra cumhuriyetin kurumlarını kur; savaş sürerken ilan yapılamaz."
        : "Barışçıl geçişin ardından kurucu meclisin kurumlarını yerleştir.",
      [
        { kind: "government", ideology: "republic", leader: "Kurucu meclis" },
        n("stability", 6),
      ],
      { treasury: 120 },
      {
        ideologies: ["republic"],
        peace: true,
        ...(canSplit ? { civilWarVictory: true } : {}),
      },
    ),
    row(
      "civic-schools",
      "Cumhuriyetin Teknik Okulları",
      "Yeni yönetimin kamu eğitimini teknik araştırmayla birleştir.",
      [n("science", 0.035), n("stability", 3)],
      { treasury: 140 },
      { ideologies: ["republic"] },
    ),
    row(
      "civic-reconciliation",
      "Cumhuriyetçi Uzlaşma Fonu",
      "Toplumsal toparlanma ve sivil yatırımı birlikte finanse et.",
      [b("civil"), n("exhaustion", -10)],
      { treasury: 185, stock: { steel: 25 } },
      { ideologies: ["republic"] },
    ),
  ];
  return [
    { id: "royal", title: "Alternatif · Monarşi", events: monarchy },
    { id: "civic", title: "Alternatif · Cumhuriyet", events: republic },
  ].flatMap((chapter) =>
    chapter.events.map((template, index) => ({
      id: `national-${country}-${template.id}`,
      country,
      title: template.title,
      description: `${info.name}: ${template.brief} Bu seçenek alternatif bir oyun senaryosudur; yaşanmış tarihî olay değildir.`,
      date: "1936-01-01",
      cost: index === 1 ? 90 : 30 + index * 10,
      days: index === 1 ? 28 : 14 + index * 4,
      requires: index
        ? [`history-national-${country}-${chapter.events[index - 1].id}`]
        : [],
      excludes: [
        `national-${country}-${chapter.id === "royal" ? "civic-front" : "royal-convention"}`,
      ],
      kind: "domestic" as const,
      branch: chapter.title,
      era: "alternative" as const,
      countrySpecific: false,
      acceptLabel:
        index === 1 && canSplit
          ? "Ayaklanmayı başlat; iç savaşa gir"
          : "Siyasi programı uygula",
      declineLabel: "Hayır, bu yoldan vazgeç",
      effectText: `${template.effects.map(nationalEffectText).join("; ")}. ${nationalCostText(template.costs)}`,
      declineText:
        "Olay kapanır; hazırlık siyasi gücü geri verilmez. Kabul bütçesi harcanmaz ve bu yolun devamı açılmaz.",
      domestic: {
        effects: template.effects,
        costs: template.costs,
        requirements: { independent: true, ...template.requirements },
      },
    })),
  );
}

export { b, s, e, n, r, t, row };
export type { Template, Chapter };
