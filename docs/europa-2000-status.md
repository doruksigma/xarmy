# Europa War — 2.000 satırlık şartnamenin kapsam ve aşama kaydı

İnceleme tarihi: 2 Kasım 2026. Başlangıç sürümü: `4d9b8af`.
Bu belge yeni şartnamenin **100 bölümünü** aşağıdaki kesintisiz bölüm aralıklarıyla
izler. Mevcut çalışan temeller ile istenen ayrıntıların tamamlanması farklı
durumlardır; 100 bölümün tamamlandığı veya bütün kabul testlerinin geçtiği
iddia edilmez. Kod incelemesi, çalışma zamanı doğrulamasının yerini tutmaz.

## Kaynak ve doğrulama sınırı

- Kullanıcının TXT eki [europa-2000-spec.txt](europa-2000-spec.txt) olarak
  **baytları değiştirilmeden** saklandı: 205.525 bayt, 2.000 satır.
- SHA-256: `1fb06898fb17046990709a8c6da192f36d9bb76c47e40c6de4c65d8614febcb3`.
- Ekteki HTML çalıştırılmadan metin olarak incelendi. `prompt-data` JSON alanı
  çözüldüğünde TXT ile karakter karakter aynıdır; HTML arama, bölüm seçme,
  kopyalama ve TXT indirme arayüzüdür, ayrı bir oyun şartnamesi değildir.
- Bölüm 100'deki K01–K17 bağlantıları kullanıcı tarafından sağlanmıştır.
  Bu incelemede bağlantıların güncel içeriği bağımsız doğrulanmadı. Paket,
  yayımlanma tarihi ve güncelleme iddiaları doğrulanmış resmî kapsam sayılmaz;
  kaynak araştırması bekleyen içerik olarak tutulur. Şartnamedeki algoritma ve
  sayısal örnekler özgün tasarım önerileridir.
- [55 bölümlük önceki denetim](europa-expansion-status.md), kendi başlangıç
  sürümünün tarihsel kaydıdır ve burada değiştirilmez. Sonradan eklenen 3D
  sistemler yeni değerlendirmeye dahildir.

## Bu iterasyon: ilk bağımlılık grubu

Şartnamenin 99. bölümü önce komut, zaman, veri ve kayıt temelinde gerçek kod
değişikliği ve test ister. Bu iterasyonda bunun **komut ve kayıt** kısmı
uygulandı; bütün oyuncu emirleri bu yola bağlandı:

1. `action-engine.ts`: ülke kimliği açık olan, kopya durum üzerinde atomik
   çalışan alan komut dağıtıcısı; başarısız komut mevcut seferi değiştirmez.
2. `command-types.ts` ve `commands.ts`: çalışma zamanında biçim denetimi,
   emir kimliği/veren ülke/sıra/zaman, yetki kontrolü, tekrar uygulamayı önleme,
   aynı kimliğin başka içerikle kullanımını reddetme ve yapılandırılmış sonuç.
3. Kaynak değişimini ve uygunluk nedenini durum değiştirmeden hesaplayan
   önizleme; inşaat ve tümen eğitimi ekranında isteğe bağlı maliyet/uygunluk
   görünümü. Komuta merkezinde son 12 oyuncu emri, tarih ve uygun emirlerde
   hedef şehir, tümen sayısı/ismi veya komutan adı gösterilir.
4. `storage.ts`: isteğe bağlı, sürümlü komut durumu için sıkı şema ve referans
   kontrolü; eski kayıtların korunması, yükleme sonrası tekrar emirle kaynak
   çoğaltılmaması. Sınırlı emir geçmişi tam kampanya tekrar oynatma sistemi değildir.

**Açık sınırlar:** `advanceDay` hâlâ günlük çalışır. Komut zamanı için
`day * 24` kullanılması yalnız gün sınırını numaralandırır; saatlik hareket,
ekonomi veya muharebe çözümü uygulanmış değildir. AI ve yardımcı yönetimin
bütün kararları henüz komut zarfından geçmez. Genel sevkiyat/varlık hareket
defteri, farklı RNG akışları ve tüm muharebelerin eşzamanlı çözümü de bu
iterasyonun tamamlanmış çıktıları değildir.

**Emir sözleşmesi:** Kimlik `ülke:sıra` biçimindedir. Ülke başına son uygulanan
sıra korunur; yalnız başarılı emir sırayı tüketir. Reddedilen emir değiştirilmemiş
seferi döndürür ve koşullar düzeltilince yeniden denenebilir. Aynı kimlik ve aynı
içerik ikinci kez uygulanmaz; farklı içerik çatışma olarak reddedilir. Son 64
makbuz ve toplam 128 Ki karakterlik eylem verisi tutulur (tek eylem en fazla
64 Ki karakter); eski makbuz silinse de ülkenin sıra sayacı silinmez. Günlük tam
replay değildir. `trustedActorCountryId` çağıran uygulamadan gelir, gelen emirden
alınmaz; bu yerel tek oyunculu protokol bir çevrimiçi kimlik doğrulama servisi
değildir. Önizleme sadece açıldığında, mevcut dünya kopyası üzerinde aynı
kurallarla çalışır; uygulama anındaki kontrolün yerine geçmez.

**Doğrulama:** Son tam regresyon 411/411, odaklı komut/kayıt çalışması 30/30
geçti. Üretim derlemesi ve TypeScript denetimi geçti. Gerçek Chromium'da
masaüstü (1440×1000) ve dokunmatik mobil görünüm (390×844) için 14 yeni
komut/önizleme/kayıt/worker kontrolü ile 8 mevcut komutan/sınır/taarruz/eğitim
kontrolü geçti; her iki pakette tarayıcı ve konsol hatası sıfır. Mobil sonuç
emülasyondur, fiziksel telefon veya donanım FPS garantisi değildir.

- Yeni tarayıcı kontrolü: `scripts/test-europa-command-protocol-browser.cjs`.
  Normal kayıt içe aktarma, gerçek butonlar ve dışa aktarılan yerel kayıtlar
  kullanılır; React durumuna gizli test erişimi eklenmez.
- Komutan regresyonu: `scripts/test-europa-commanders-browser.cjs`.
- Lint yapılandırması derleme çıktısıyla bozulmuştu; geçerli ESLint 9 / Next
  uyumluluk yapılandırması ve doğrudan `@eslint/eslintrc` geliştirme bağımlılığı
  ile onarıldı. Değişen oyun dosyalarının lint denetimi temizdir. Proje genelinde
  `npm run lint` 46 mevcut hata nedeniyle hâlâ başarısızdır; bunlar başka oyunlar
  ve bu aşamada değiştirilmeyen modüllerdeki kullanılmayan değişkenler, `any`
  türleri ve bağlantı kurallarıdır. Genel lint geçti denmez. Üretim derlemesi
  mevcut proje ayarı gereği lint denetimini atlar; lint ayrıca çalıştırıldı.

## 1–100 kapsamı: mevcut temel ve kalan işler

Dosya adları aksi belirtilmedikçe `app/games/europa-war/strategy/` altındadır.
Her satırdaki kapsam **kısmidir**; mevcut karşılık bulunmayan alt sistemler açıkça
belirtilir. Veri, hesap, oyuncu arayüzü, AI, 3D ve test tamamlığı birbirinin
yerine kullanılamaz.

| Bölümler / sistem | Mevcut çalışan temel ve kod karşılığı | Kalan ana bağımlılık veya kapsam |
| --- | --- | --- |
| 01–03 Hedef, kapsam, mimari | Tek oyunculu yerel kampanya; TypeScript alan modülleri, React arayüzü ve worker (`engine.ts`, `types.ts`). | Doğrulanmış HOI4 kaynak eşlemesi ve bütün katmanları kapsayan kabul ölçütleri tamamlanmadı. |
| 04–07 Dünya, komut, saat, worker | Kimlikli dünya, tohumlu günlük adım, atomik komut temeli, tek bekleyen worker isteği (`world.ts`, `engine.ts`, `simulation.ts`); yeni komut işi yukarıda. | Saatlik takvim, eşzamanlı çözüm, ayrı RNG akışları, genel varlık hareket defteri, bütün AI kararlarının komut yoluna taşınması ve durum farkı aktarımı yok. |
| 08–10 Senaryo, tarih, coğrafya | 1936 başlangıcı, ülke/zorluk/tarihsel yönelim, 29 ülke ve 447 hareket bölgesi; kara/deniz komşulukları (`map-data.json`, `world.ts`). | Ayrı 1939 senaryosu; kaynaklarıyla doğrulanmış küresel tarihsel sınırlar/karakterler; daha ayrıntılı eyalet–hareket bölgesi ve geçiş veri katmanları. |
| 11–12 3D arazi, şehir, tesis | Gerçek 3D arazi, su, şehir/tesis dekoru ve tekrarlı nesneler (`map3d-geometry.ts`, `map3d-scenery.ts`, `map3d-renderer.ts`). | Bütün coğrafyayı kapsayan ayrıntılı varlık seti, bölgesel varlık yükleme ve istenen tüm yüksek ayrıntı düzeyleri yok; mevcut modeller prosedüreldir. |
| 13–14 Kamera, seçim, harita modları | Kaydırma/yakınlaştırma, dokunma, şehir/birlik seçimi, küçük harita ve siyasi/askerî veri görünümleri (`WarMap3D.tsx`, `WarMap.tsx`, `useMapCamera.ts`). | Tam kutu seçimi ve şartnamedeki bütün tematik veri katmanları; yeni gözlem/ikmal modelleri tamamlandıkça bunlara bağlı kaplamalar. |
| 15–16 Birlik animasyonu, efektler | Temsilî asker/tank/top/kamyon, hareket, mevcut ve kısa sürede sonuçlanan gerçek çatışma efektleri, şehir ele geçirme gösterimi (`map3d-units.ts`, `map3d-unit-events.ts`). | Tüm hava/deniz/lojistik varlıklarının ayrı durumları ve özgün ses/uyarlanan atmosfer seti. Görsel efektler muharebe sonucunu belirlemez. |
| 17 Hava, mevsim, yerel saat | Mevcut görsel atmosfer ve günlük tarih temelidir. | Bölgesel hava durumu, çamur/kar birikimi, iklim alışkanlığı ve boylama bağlı simülasyon saati yok. |
| 18 Yönetim arayüzü | Türkçe yönetim panelleri, komuta önerileri ve dört ayrı yardımcı yönetim seçeneği (`WarPanels.tsx`, `CommandCenter.tsx`, `management.ts`). | Genel arama, ayrıntılı neden/önizleme kapsamı, yapılandırılabilir bildirim/otomatik duraklama; inşaat/eğitim önizlemesi ve oyuncu emir geçmişi bu iterasyonda eklendi. |
| 19–22 Siyaset, yasalar, personel | İstikrar, savaş desteği/yorgunluğu, hükümet/partiler/kabine, ekonomi ve askerlik yasaları, eğitim için personel ayırma (`politics.ts`, `economy.ts`). | Ülkeye özgü parlamenter kurallar, kademeli seferberlik, ayrı yaralı/garnizon/taşıma havuzları ve gecikmeli personel dönüş muhasebesi. |
| 23–25 Odak, karar, ruh, kriz | Önkoşul/dışlama ve süreli odaklar, maliyetli kararlar, seçilmiş tarihsel olaylar, siyasi kriz/iç savaş (`catalog.ts`, `politics.ts`, `advanced-catalog.ts`). | Genel koşullu olay dili, süreli etki defteri, ulusal ruh/yönetim güç dengeleri ve kapsamlı olay zincirleri. |
| 26–28 İnşaat, kaynak, yakıt | Yapı kuyruğu, hasar/onarım, maden/rafineri/sentetik tesis, sınırlı kaynak ve yakıt üretimi/tüketimi (`economy.ts`, `economy-balance.ts`). | Ayrıntılı yapı yuvası ve onarım kapasitesi tahsisi, kömür/enerji/krom/tungsten modeli, yerel yakıt rezervleri. |
| 29–30 Üretim, stok, dönüşüm | Kapasiteye bağlı üretim hatları, verimlilik, tamamlanmamış üretim ilerlemesi ve tamamlanan ekipman ayrımı (`production.ts`). | Değişmez tasarım sürümleri, konuma/role göre depolar, modernizasyon ve dönüşüm muhasebesi. |
| 31–34 Ticaret, yardım, pazar, sanayi kuruluşları | Kaynak anlaşmaları, rotaya bağlı ticaret sonucu ve tek seferlik yardım (`economy.ts`, `diplomacy.ts`, `military-assets.ts`). | Sevkiyatta rezervasyon/teslimat, üretim lisansı, düzenli yardım, silah pazarı sözleşmeleri ve MIO uzmanlık/deneyim sistemi yok. |
| 35–36 Araştırma ve doktrin | Yuva/önkoşul/dönem cezası/ülke bonusu, araştırmayla model açılması; doktrin teknoloji olarak var (`politics.ts`, `catalog.ts`). | Deneyimle ilerleyen doktrin ustalığı, askerî gelenekler ve kurumlara bağlı ayrıntılı araştırma etkileri. |
| 37–40 Tasarımcılar ve ekipman | Sabit tank/uçak/gemi katalogları ve üretim maliyetleri (`catalog.ts`, `advanced-catalog.ts`, `production.ts`). | Modüler tasarımcılar, uyumluluk kuralları, sürümler/refit; gerçek tren, zırhlı tren, demiryolu topu ve konvoy stokları. |
| 41–43 Şablon, destek, eğitim | Sabit birlik türleri, gerçek ekipman tüketen destekler, eğitim kuyruğu ve ikmale bağlı takviye (`planning.ts`, `economy.ts`). | Tabur/alay şablonları, sürümler, bileşik istatistikler, erken konuşlanma ve gerçek sevkiyatlı eğitim/takviye. |
| 44–46 Komuta, karargâh, kaptan | General beceri/tecrübesi, 12 birlik sınırı, otomatik yeni komutan ve hedef sınır ataması (`commanders.ts`, `commander-roster.ts`). | Ordu grubu/tiyatro, sahra karargâhı, emir gücü, tümen komutanları, gemi kaptanları ve madalyalar. |
| 47–51 Hareket, cephe, savaş, kuşatma | Rota, birlikte hareket, hazırlık, hedef devlete özel saldır/savun, gerçek iki taraflı kayıp ve geri çekilme (`land.ts`, `planning.ts`, `commanders.ts`). | Arazi maliyetli rota, stratejik demiryolu nakli, saatlik sıra bağımsız çözüm, genişlik/rezerv/taktik/zırh/delme ve süreli geri çekilme. |
| 52–54 İkmal ve taşıma | Başkent bağlantısı, liman/deniz erişimi, yerel altyapı/hasar/yığılma etkileri; oyuncuya ait bağlı ağda görsel trenler (`world.ts`, `map3d-rail-network.ts`). | Ortak tüketilen kenar/düğüm kapasitesi, gerçek tren/kamyon/konvoy tahsisi, sevkiyatlar, son kilometre ve yerel rezervler. Görsel trenler bu hesapların yerine geçmez. |
| 55–58 Hava kuvvetleri | Stoktan kanat, üs yükü/menzil/hazırlık/yakıt, görevler, kayıp, bombardıman ve paraşüt koşulları (`airnaval.ts`, `operations.ts`). | Pilot/tasarım sürümleri, tespit/temas/sorti evreleri, ayrıntılı görev bölgesi, bina bazlı hasar ve yükle paylaşılan nakliye kapasitesi. |
| 59–64 Donanma ve çıkarma | Tekil gemi, görev, intikal, yakıt, hasar/onarım, eskort/baskın ve taşıyıcı uçağı stoku (`airnaval.ts`, `military-assets.ts`). | Görev kuvveti hiyerarşisi, fazlı deniz muharebesi, mayınlar/antlaşmalar, gerçek taşıyıcı kanatları ve hazırlık/konvoy/yük tabanlı çıkarma. |
| 65–67 Diplomasi ve ittifak | Kabul hesabı, gerekçe, savaş, pakt, geçiş, yardım, ittifak ve barış (`diplomacy.ts`, `conference.ts`). | Süreçli teklifler, ittifak liderlik/kural/hedef/katkı varlığı, ortak tiyatrolar ve sahibi–denetleyicisi ayrı sefer kuvvetleri. |
| 68–70 İstihbarat ve savaş sisi | Ajan eğitimi, süreli operasyon/risk, sabotaj/propaganda/direniş ve süreli istihbarat seviyesi (`operations.ts`). | Bireysel ajan/ağ, seyahat ve hazırlık, kaynak rezervasyonu, işbirliği ve kategorili gözlem geçmişi; AI için oyuncuyla ortak eksik bilgi modeli yok. |
| 71–73 İşgal, bağlı devlet, iç savaş | Sahip/kontrol ayrımı, direniş/uyum/garnizon tüketimi, kukla/bağımsızlık ve gerçek iç savaş bölünmesi (`politics.ts`, `operations.ts`). | Ayrı iade edilebilir garnizon tahsisi, özerklik düzeyleri/sürgün, bölgesel sadakat, gönüllüler ve sınırlı sınır çatışmaları. |
| 74–75 Savaş kayıtları ve barış | VP/başkent etkili teslimiyet, katkı puanı ve çok taraflı bütçeli ilhak/kukla/serbest bırakma (`world.ts`, `conference.ts`). | Birinci sınıf savaş/blok/majör ülke kayıtları, olay bazlı katkı, kaynak hakkı, tazminat, gemi devri, kısıtlamalar ve süreli tahliye. |
| 76–77 Proje, bilim insanı, baskın | Normal araştırma, sabotaj ve sürekli bombardıman mevcut ortak temellerdir. | Ayrı araştırma tesisi/bilim insanı/prototip, tahsis edilmiş kuvvetle çok aşamalı baskın ve soyut stratejik silah sistemleri yok. |
| 78–82 Avrupa büyük güçleri ve Asya paketleri | Avrupa ülkeleri için genel ağaç; Almanya, Sovyetler, Britanya, Fransa ve İtalya ek odakları (`catalog.ts`). | Bölümlerde sayılan bütün ülkeler, parlamento/kurum rekabeti/özerklik/sürgün/birleşme içerikleri ve kaynaklı ülke paketleri tamamlanmadı. |
| 83–84 Türkiye ve Balkanlar | Türkiye sanayileşme, modernizasyon, Montrö, Balkan güvenliği ve tarafsızlık odakları (`catalog.ts`, `national.ts`). | Ayrıntılı iç gruplar, diplomatik boğaz rejimi, lisans/pazar bağlantıları ve ödüllerin inşaat/üretim/teslim süreçlerine dönüşmesi. Mevcut Montrö odağı tahkimat/ilişki etkisidir. |
| 85–90 Nordikler, diğer bölgeler, genel içerik | Haritada bulunan küçük ülkeler ortak ekonomi/araştırma/diplomasi/ordu döngüsünü kullanır (`map-data.json`, `catalog.ts`). | Bütün dünya ülkeleri, özgün bölgesel yollar, oluşturulabilir devletler, koşullu birleşme/bağımsızlık içerikleri ve kaynaklı envanter raporu. |
| 91–92 Stratejik/operasyonel AI | Haftaya dağıtılmış tehdit/ekonomi/araştırma, yerel güç ve ikmale göre saldırı/geri çekilme (`ai.ts`, `management.ts`). | Kalıcı hedef/histerezis, ayrıştırılmış karar puanı, ortak gözlem modeli, başarısızlıktan yeniden planlama ve birleşik çıkarma. Mevcut AI kesin düşman durumunu okuyabilir. |
| 93 Kayıt ve tekrar oynatma | Sürüm/geçiş/boyut/şema/referans denetimi, yerel yuvalar ve IndexedDB otomatik kayıt (`storage.ts`, `storage-browser.ts`). | Tam komut günlüğü+snapshot replay, oyun/senaryo/içerik hash başlığı, içerik paketi doğrulaması. Sınırlı, doğrulanan komut makbuzları bu iterasyonda eklendi. |
| 94 Performans ve paketleme | Dört gerçek kalite seviyesi, instancing/görünürlük sınırları, FPS/geometri/doku ölçümü, worker ve çevrimdışı paket; WebGL kaybında 2D dönüş (`map3d-renderer.ts`, `offline-assets.ts`). | Otomatik WebGL geri yükleme, bölgesel varlık yükleme, saatlik sim maliyeti ve 10 yıllık bellek/perf değerlendirmesi. Ayardaki 60 FPS hedefi donanım garantisi değildir. |
| 95 Erişilebilirlik ve öğretici | Türkçe paneller, dokunma/klavye erişimi, sistem veya kullanıcı tercihli azaltılmış hareket (`WarMap3D.tsx`, `WarPanels.tsx`). | İngilizce/anahtarlı yerelleştirme, değiştirilebilir tuşlar, ayrıntılı UI ölçeği, ansiklopedi ve gerçek eylemlerle ilerleyen öğreticiler. |
| 96 Raporlar ve kampanya sonu | Ekonomik geçmiş grafikleri ve olay günlüğü (`WarPanels.tsx`, `types.ts`). | Aylık muhasebe raporu, birim/gemi tarihçesi, ölçülen kampanya hedefleri/başarımlar, zaman çizelgesi ve rapor dışa aktarımı. |
| 97–98 Değişmezler ve uçtan uca test | Motor, stok, savaş, AI, kayıt, worker ve harita regresyonları; çok ülkeyle 90 günlük kampanya testleri (`advanced.test.ts`, `campaign-scenarios.test.ts`, `simulation.test.ts`). | Yeni saatlik/sevkiyat/kapasiteli ikmal/HQ/proje sistemleri henüz yok; bunların bütünleşik kabul testleri geçti denemez. Genel property testleri ve 10 yıllık stres ölçümü de ayrı iştir. |
| 99–100 Teslim ve referanslar | Bağımlılığa göre uygulama sırası bu belgede; özgün şartname değişmeden arşivlendi. | Sonraki modülleri ayrı kabul etme ve kaynakların bağımsız doğrulanması. Bütün özellikler tamamlandı veya canlıya dağıtıldı iddiası yok. |

## Sonraki bağımlılık sırası

1. Aynı komut yolunu AI ve yardımcı yönetime taşı; performans bütçesini ölç.
2. Saatlik zaman geçişini sürümlü kayıt ve mevcut günlük API uyumuyla tasarla;
   tüm cephelerin başlangıç durumundan sıra bağımsız hasar çözümünü test et.
3. Personel/ekipman sürümü, rezervasyon, sevkiyat ve paylaşılan ikmal kapasitesini
   ortak muhasebeye bağla. Tasarımcılar, HQ, hava/deniz harekâtı ve ülke paketleri
   bu temeli atlayarak bağımsız ödül veya dekor olarak eklenmemeli.

Bu kayıt yerel üretim derlemesi ve tarayıcı testlerinin sonucudur. Canlı
xarmygames.online dağıtımı bu çalışmada bağımsız doğrulanmadı.
