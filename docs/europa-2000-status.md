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

## İlk bağımlılık grubu: komut ve kayıt temeli

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
   görünümü. Komuta merkezinde ülkenin son 12 emri, tarih ve uygun emirlerde
   hedef şehir, tümen sayısı/ismi veya komutan adı gösterilir.
4. `storage.ts`: isteğe bağlı, sürümlü komut durumu için sıkı şema ve referans
   kontrolü; eski kayıtların korunması, yükleme sonrası tekrar emirle kaynak
   çoğaltılmaması. Sınırlı emir geçmişi tam kampanya tekrar oynatma sistemi değildir.

**İlk aşamanın sınırları:** Bu aşamada `advanceDay` günlük çalışıyordu;
`day * 24` yalnız gün sınırını numaralandırıyordu. AI emirleri ve saatlik kara
simülasyonu aşağıdaki devam çalışmalarında uygulanmıştır. Genel sevkiyat/varlık
hareket defteri, ayrı RNG akışları ve hava/deniz için eşzamanlı çözüm hâlâ açık
kapsamdır.

**Emir sözleşmesi:** Kimlik `ülke:sıra` biçimindedir. Ülke başına son uygulanan
sıra korunur; yalnız başarılı emir sırayı tüketir. Reddedilen emir değiştirilmemiş
seferi döndürür ve koşullar düzeltilince yeniden denenebilir. Aynı kimlik ve aynı
içerik ikinci kez uygulanmaz; farklı içerik çatışma olarak reddedilir. Son 64
makbuz ve toplam 128 Ki karakterlik eylem verisi tutulur (tek eylem en fazla
64 Ki karakter). Diğer ülkelerin emirleri öncelikle budanarak oyuncu ülkesinin
son 12 emrine yer ayrılır; toplam karakter sınırı her durumda korunur. Eski
makbuz silinse de ülkenin sıra sayacı silinmez. Günlük tam
replay değildir. `trustedActorCountryId` çağıran uygulamadan gelir, gelen emirden
alınmaz; bu yerel tek oyunculu protokol bir çevrimiçi kimlik doğrulama servisi
değildir. Önizleme sadece açıldığında, mevcut dünya kopyası üzerinde aynı
kurallarla çalışır; uygulama anındaki kontrolün yerine geçmez.

**Önceki aşamanın doğrulaması:** Tam regresyon 411/411, odaklı komut/kayıt çalışması 30/30
geçti. Üretim derlemesi ve TypeScript denetimi geçti. Gerçek Chromium'da
masaüstü (1440×1000) ve dokunmatik mobil görünüm (390×844) için 14 yeni
komut/önizleme/kayıt/worker kontrolü ile 8 mevcut komutan/sınır/taarruz/eğitim
kontrolü geçti; her iki pakette tarayıcı ve konsol hatası sıfır. Mobil sonuç
emülasyondur, fiziksel telefon veya donanım FPS garantisi değildir.

- Yeni tarayıcı kontrolü: `scripts/test-europa-command-protocol-browser.cjs`.
  Normal kayıt içe aktarma, gerçek butonlar ve dışa aktarılan yerel kayıtlar
  kullanılır; React durumuna gizli test erişimi eklenmez.
- Komutan regresyonu: `scripts/test-europa-commanders-browser.cjs`.
- Önceki aşamada lint yapılandırması onarıldı, fakat proje genelinde 46 hata
  kaldı. Aşağıdaki devam çalışmasında bu hatalar ve hook uyarıları giderildi.

## Devam çalışması: 46 lint hatası ve ortak AI emirleri

- Satranç API yanıtları `unknown` üzerinden doğrulanır; bozuk sağlayıcı
  yanıtları için regresyonlar eklendi. Worker iletişimi açık türlerle tanımlandı.
  Online odada aynı sürümün tekrarlanan yoklamaları seçili taşı sıfırlamaz.
- Europa harita callback bağımlılıkları düzeltildi. 3D sahne tek kez kurulur;
  kalite ve azaltılmış hareket değişimleri mevcut sahneye uygulanır. Color Hide
  renk eşitlemesi yalnız ilgili renk bileşenlerini izler.
- Kullanılmayan kod ve gereksiz `any` türleri temizlendi; site içi bağlantılar
  Next bağlantı bileşenine taşındı. Lint kuralları susturulmadı. Derlemede lint'i
  atlayan `ignoreDuringBuilds` ayarı kaldırıldı.
- AI araştırma, odak, ekonomi, diplomasi, asker eğitimi, komutan atama ve
  hareket emirleri artık oyuncuyla aynı doğrulanan ülke komutlarını kullanır.
  Kaynak maliyeti, yetki, önkoşul ve kapasite denetimleri atlanamaz. Aynı emir
  yeniden gönderildiğinde ekipman veya insan gücü ikinci kez harcanmaz.
- Yönetim yardımcısı üretim kapasitesini önce fazla hatlardan geri alır,
  ardından uygun hatlara tahsis eder. Araştırması bulunmayan mevcut bir hat
  azaltılabilir/durdurulabilir; yeni hat veya artış için teknoloji gerekir.
  Önceden ödenmiş üretim ilerlemesi korunur. Hava ve deniz görevleri de aynı
  uygunluk denetiminden geçer; reddedilen görev kısmi değişiklik bırakmaz.
- Worker için Immer ile yalnız değişen yolları kopyalayan atomik yürütme
  eklendi. Dış dünya kimliği korunur; ülke/birlik referansları emirlerden sonra
  yenilenir. Kullanıcıya açık değişmez API ve önizleme derin kopya yalıtımını
  korur. İç içe yardımcı planı tek dış emir olarak kaydedilir.
- Aynı başlangıç, hedef ve duruşa sahip AI birlikleri en fazla 512 tümenlik
  gruplarla emir alır; her tümenin bağımsız rotası ve muharebe durumu
  korunur. Düşük organizasyonla savunma hareketi yalnız dost rotadan geçebilir.
  Bütün dünya için gereksiz komutan temizliği ve ilgisiz birimleri taslak
  nesnesine dönüştüren aramalar azaltıldı.
- Yardımcı yönetim değişmeyen hava/deniz görevlerini tekrar yayımlamaz; yeni
  araçlar, yeni hedefler ve değişen başkentler emir almaya devam eder. Keşif ve
  stratejik bombardıman görevleri haftalık toplu emirle gereksiz yere
  sıfırlanmaz. İkmal limanını kaybeden veya boğazı kapanan gemiler, intikal
  tamamlanınca geçerli bir limana yeniden bağlanabilir.
- Toplu donanma emri liman listesini tek kez çıkarır; her gemi için yakıt,
  boğaz, rota ve intikal denetimi sürer. 24 gemilik regresyonda eyalet listesi
  iki kez taranır (hedef kıyı ve kendi limanları); gemi başına tekrarlanmaz.

Bu aşama günlük AI karar yolunu kapsadı. Saatlik takvim ve kara muharebesi
aşağıdaki yeni aşamada ele alındı; ortak savaş sisi/gözlem modeli hâlâ eksiktir.

**Bu aşamanın doğrulaması (2 Kasım 2026):** Europa 450/450, satranç 118/118,
Battle Royale 21/21 ve Color Hide 39/39 test geçti. Europa paketi 1936'dan
1945 sonuna uzanan 3.653 günlük tarihsel seferi ve ara kayıt doğrulamalarını da
çalıştırır. Proje genelinde ESLint hata/uyarı sayısı sıfırdır; üretim derlemesi
artık lint ve TypeScript denetimlerini de uygular.

Gerçek Chromium üzerinde 58 kontrol geçti: komut/önizleme/kayıt/worker 14,
komutan/sınır/emir 8, canlı harita katmanları ve kaydırma/yakınlaştırma 6,
3D WebGL/kalite/toplu hareket/ele geçirme/çevrimdışı devam/kurtarma 19,
satranç botu/analiz/iki istemcili oda/kurtarma 11. Tarayıcı paketlerinde hata
yoktur; harita ekran görüntüleri incelendi. Mobil ölçümler dokunmatik tarayıcı
emülasyonudur, fiziksel telefon testi değildir. Bu çalışmada 60 FPS veya tüm
cihazlarda takılmasız oynanış garantisi verilmez. Yeni atomik emirlerin CPU
maliyeti vardır; azaltılan gereksiz taramalar bütün seferlerde toplam sürenin
eski sürümden kısa olduğunu tek başına kanıtlamaz.

- `scripts/test-europa-command-protocol-browser.cjs`
- `scripts/test-europa-commanders-browser.cjs`
- `scripts/test-europa-map-render-browser.cjs` (güncel seçim alanı ve yeniden
  boyutlandırmadan sonra tekerlek/sürükleme kontrolü dahil)
- `scripts/test-europa-3d-browser.cjs` (`EUROPA_SKIP_PERF=1`; donanım karşılaştırması
  yapılmadan işlev kontrolleri çalıştırıldı)
- `scripts/test-chess-browser.cjs`

## Devam çalışması: gerçek saatlik kara simülasyonu

- `time.ts`, `engine.ts`: gün + saat tek bir mutlak oyun saatine çevrilir.
  `advanceHour` bir saat; `advanceDay` aynı kurallarla tam 24 saat ilerletir.
  Toplu hesap bir kez kopyalar; 1×/5× kuralları ve sonucu değiştirmez.
- Saatlik kara hareketi, grup yürüyüşü, yakıt, organizasyon, moral, siperlenme,
  takviye, yıpranma ve çatışma oranları günün 1/24'üyle hesaplanır. İlk yürüyüş
  saati de yakıt tüketir; geçersiz rota yakıt harcamaz. Kesirli personel kayıpları
  ve hastane dönüşleri kayıtta korunur, her saat sıfıra yuvarlanmaz.
- Aynı saatin bütün kara cepheleri, hazırlık aşamasından sonra tutarlı başlangıç
  durumundan ateş gücünü hesaplar. Hasarlar birlikte uygulanır; ardından geri
  çekilme ve kontrol değişimleri çözülür. Ölen birlik o saat için hesaplanmış
  ateşini kaybetmez. Ülke/birlik dizisinin sırası sonucu değiştirmez. Eşit işgal
  talepleri sabit ülke kimliğiyle çözülür; boş şehirde sonsuz bekleme oluşmaz.
- Gün sınırında sırasıyla ekonomi/üretim/personel, siyaset/araştırma, hava/deniz/
  istihbarat ve stratejik AI/yardımcı yönetim çalışır. Bu sınırda tamamlanan
  ekipman o saatki kara takviyesine katılabilir. Bu sistemler saatte bir gün
  ilerletilerek 24 kat hızlandırılmaz. Hava/deniz çözümü hâlâ günlüktür.
- `planningStep` hazırlığı süreye göre artırır/tüketir ve yürüyüşü sıfırlamaz.
  Aynı hedefin gücü ve rotası adım içinde tekrar hesaplanmaz; başka hedefe
  ayrılan birliğin desteği doğru düşülür. 1.000 tümenin ilk plan hesabı bu Node
  ortamındaki tek karşılaştırmada yaklaşık 2.597 ms → 9,7 ms oldu; bu genel
  kampanya/FPS karşılaştırması değildir.
- Yönetim yardımcısı bombardıman uçağı yoksa avcıları hava üstünlüğüne,
  denizaltısı yoksa yüzey filosunu devriyeye atar. Geçersiz görev yüzünden
  bütün kuvvetin boşta kalması düzeltildi; emirler ortak denetimden geçer.
- Worker 1× hızda hesaplama tamamlandıktan 500 ms sonra yeni saat başlatır;
  5× aralığı 100 ms'dir. Aynı anda tek istek, duraklatma, görünmeyen sekme ve
  eski yanıtları reddetme korunur; yetişemeyen cihazda oyun saati atlanmaz.
  Desteklenen son tarihte anlaşılır mesajla durur.
- Kayıt sürümü 3 gün ve saati saklar. Gerçek v1/v2 kayıtlar 00:00'a taşınır;
  eski komut kimlikleri ve ödenmiş maliyetler değişmez. Eksik/bozuk saat,
  sürüm uyuşmazlığı ve gelecek saatli emirler reddedilir. Yerel yuva anahtarları
  korunur. Aynı gün içindeki farklı saatlerde ve komutlardan sonra sekme
  gizlenirse son durum otomatik kayda alınır.
- Saat arayüzü, olaylar ve emir geçmişi saat gösterir. 3D yürüyüş ve kısa
  çatışma/ele geçirme efektleri saat adımlarını izler; geri tarihli yüklemede
  eski efektler oynatılmaz. Günlük kontrol noktalarıyla uyumluluk korunur.

**Son doğrulama (2 Kasım 2026):** Son kaynaklarla tam Europa paketi
**491/491** geçti; 370 günlük alternatif sefer ve 1936–1945 sonunu kapsayan
3.653 günlük / 87.672 saatlik tarihsel sefer dahildir. İlk tam koşudaki üç
eski kayıt etiketi beklentisi saatli biçime uyarlandı; değişen saat için önbellek
ve başarısız yazma kontrolleri genişletildi, ardından tam paket yeniden geçti.
Satranç **118/118**, Battle Royale **21/21**, Color Hide **39/39**: toplam
**669 otomatik test**. Üretim derlemesi, TypeScript ve proje genelinde ESLint
geçti; lint hata/uyarı sayısı sıfır.

Gerçek Chromium'da masaüstü ve dokunmatik mobil görünüm için **82 kontrol**
geçti; konsol/sayfa hatası yok:

- Saatlik simülasyon 14: gerçek worker, karşılıklı hasar, grup yürüyüşü,
  1×/5× aynı sonuç, duraklatma, ara saatte kayıt ve gece yarısı tek hesap.
- Komut/kayıt protokolü 14; komutan/sınır/saldır/savun/eğitim 8.
- Gerçek WebGL/3D 19: kalite, seçim, toplu emir, ele geçirme, çevrimdışı devam,
  WebGL kaybında 2D kurtarma ve başarısız renderer kurulumu sonrası toparlanma.
- Otomatik kayıt 10: 2.000 tümenlik IndexedDB kaydı, hata/bozuk veri,
  sekmeler arası bildirim, bekleyen yazma, çevrimdışı yeniden yükleme.
- Çatışma animasyonları 17: 1/2/4 tümen, piyade/tank/top ateşi, gerçek hasar,
  şehir alma, ateşin durması, kısa çatışmanın gösterimi, mobil 2D göstergesi.

Yeni paket `scripts/test-europa-hourly-browser.cjs`; ortak saat ilerletici
`scripts/europa-browser-clock.cjs`. Mevcut komut, komutan, 3D, otomatik kayıt
ve çatışma paketleri saatli kayıtlara uyarlandı. 3D paketi `EUROPA_SKIP_PERF=1`
ile işlevsel olarak çalıştırıldı. Mobil saat/kayıt ve masaüstü 3D ele geçirme
ekran görüntüleri incelendi; fiziksel telefon veya 60 FPS garantisi değildir.

**Performans sınırı:** 100 günlük / 2.400 saatlik Node savaş denemesinde
normal saat medyanı 4,60 ms, p95 7,74 ms; gece yarısı medyanı 18,32 ms,
maksimumu 60,09 ms ölçüldü. Bunlar paylaşılan geliştirme ortamında yalnız
simülasyon süreleridir; ekran çizimi, worker aktarımı ve fiziksel telefon
performansı dahil değildir. Artık günde 24 kara adımı yapıldığından toplam
hesap maliyeti eski günlük motordan yüksektir. Worker hâlâ tam sonuç dünyasını
aktarır; durum farkı aktarımı, ayrı RNG akışları ve tüm platformlar için sabit
noktalı aritmetik tamamlanmış değildir.

## 1–100 kapsamı: mevcut temel ve kalan işler

Dosya adları aksi belirtilmedikçe `app/games/europa-war/strategy/` altındadır.
Her satırdaki kapsam **kısmidir**; mevcut karşılık bulunmayan alt sistemler açıkça
belirtilir. Veri, hesap, oyuncu arayüzü, AI, 3D ve test tamamlığı birbirinin
yerine kullanılamaz.

| Bölümler / sistem | Mevcut çalışan temel ve kod karşılığı | Kalan ana bağımlılık veya kapsam |
| --- | --- | --- |
| 01–03 Hedef, kapsam, mimari | Tek oyunculu yerel kampanya; TypeScript alan modülleri, React arayüzü ve worker (`engine.ts`, `types.ts`). | Doğrulanmış HOI4 kaynak eşlemesi ve bütün katmanları kapsayan kabul ölçütleri tamamlanmadı. |
| 04–07 Dünya, komut, saat, worker | Kimlikli dünya, gerçek saatlik kara adımı ve eşzamanlı hasar, günlük ekonomik hesap, atomik komutlar, tek bekleyen worker (`world.ts`, `time.ts`, `engine.ts`, `simulation.ts`). | Ayrı RNG akışları, genel varlık hareket defteri, tüm alt sistemlerde eşzamanlı çözüm ve durum farkı aktarımı yok. Günlük AI emirleri ortak doğrulama yolundadır. |
| 08–10 Senaryo, tarih, coğrafya | 1936 başlangıcı, ülke/zorluk/tarihsel yönelim, 29 ülke ve 447 hareket bölgesi; kara/deniz komşulukları (`map-data.json`, `world.ts`). | Ayrı 1939 senaryosu; kaynaklarıyla doğrulanmış küresel tarihsel sınırlar/karakterler; daha ayrıntılı eyalet–hareket bölgesi ve geçiş veri katmanları. |
| 11–12 3D arazi, şehir, tesis | Gerçek 3D arazi, su, şehir/tesis dekoru ve tekrarlı nesneler (`map3d-geometry.ts`, `map3d-scenery.ts`, `map3d-renderer.ts`). | Bütün coğrafyayı kapsayan ayrıntılı varlık seti, bölgesel varlık yükleme ve istenen tüm yüksek ayrıntı düzeyleri yok; mevcut modeller prosedüreldir. |
| 13–14 Kamera, seçim, harita modları | Kaydırma/yakınlaştırma, dokunma, şehir/birlik seçimi, küçük harita ve siyasi/askerî veri görünümleri (`WarMap3D.tsx`, `WarMap.tsx`, `useMapCamera.ts`). | Tam kutu seçimi ve şartnamedeki bütün tematik veri katmanları; yeni gözlem/ikmal modelleri tamamlandıkça bunlara bağlı kaplamalar. |
| 15–16 Birlik animasyonu, efektler | Temsilî asker/tank/top/kamyon, hareket, mevcut ve kısa sürede sonuçlanan gerçek çatışma efektleri, şehir ele geçirme gösterimi (`map3d-units.ts`, `map3d-unit-events.ts`). | Tüm hava/deniz/lojistik varlıklarının ayrı durumları ve özgün ses/uyarlanan atmosfer seti. Görsel efektler muharebe sonucunu belirlemez. |
| 17 Hava, mevsim, yerel saat | Mevcut görsel atmosfer ve saatli kampanya takvimi temelidir. | Bölgesel hava durumu, çamur/kar birikimi, iklim alışkanlığı ve boylama bağlı simülasyon saati yok. |
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
| 47–51 Hareket, cephe, savaş, kuşatma | Saatlik rota/grup hareketi, hazırlık, hedef devlete özel saldır/savun, eşzamanlı kara hasarı ve geri çekilme (`land.ts`, `planning.ts`, `commanders.ts`). | Arazi maliyetli rota, stratejik demiryolu nakli, genişlik/rezerv/taktik/zırh/delme ve süreli geri çekilme. |
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
| 91–92 Stratejik/operasyonel AI | Haftaya dağıtılmış tehdit/ekonomi/araştırma, yerel güç ve ikmale göre saldırı/geri çekilme; oyuncuyla ortak atomik komutlar (`ai.ts`, `management.ts`, `commands.ts`). | Kalıcı hedef/histerezis, ayrıştırılmış karar puanı, ortak gözlem modeli, başarısızlıktan yeniden planlama ve birleşik çıkarma. Mevcut AI kesin düşman durumunu okuyabilir. |
| 93 Kayıt ve tekrar oynatma | V3 saatli kayıt, v1/v2 geçişi, boyut/şema/referans denetimi, yerel yuvalar ve IndexedDB otomatik kayıt (`storage.ts`, `storage-browser.ts`). | Tam komut günlüğü+snapshot replay, oyun/senaryo/içerik hash başlığı, içerik paketi doğrulaması. Sınırlı, doğrulanan komut makbuzları bu iterasyonda eklendi. |
| 94 Performans ve paketleme | Dört gerçek kalite seviyesi, instancing/görünürlük sınırları, FPS/geometri/doku ölçümü, worker ve çevrimdışı paket; WebGL kaybında 2D dönüş (`map3d-renderer.ts`, `offline-assets.ts`). | Otomatik WebGL geri yükleme, bölgesel varlık yükleme, saatlik sim maliyeti ve 10 yıllık bellek/perf değerlendirmesi. Ayardaki 60 FPS hedefi donanım garantisi değildir. |
| 95 Erişilebilirlik ve öğretici | Türkçe paneller, dokunma/klavye erişimi, sistem veya kullanıcı tercihli azaltılmış hareket (`WarMap3D.tsx`, `WarPanels.tsx`). | İngilizce/anahtarlı yerelleştirme, değiştirilebilir tuşlar, ayrıntılı UI ölçeği, ansiklopedi ve gerçek eylemlerle ilerleyen öğreticiler. |
| 96 Raporlar ve kampanya sonu | Ekonomik geçmiş grafikleri ve olay günlüğü (`WarPanels.tsx`, `types.ts`). | Aylık muhasebe raporu, birim/gemi tarihçesi, ölçülen kampanya hedefleri/başarımlar, zaman çizelgesi ve rapor dışa aktarımı. |
| 97–98 Değişmezler ve uçtan uca test | Motor, stok, savaş, AI, kayıt, worker ve harita regresyonları; çok ülkeyle 90 günlük ve 1936–1945 tarihsel kampanya testleri (`advanced.test.ts`, `campaign-scenarios.test.ts`, `engine.test.ts`, `simulation.test.ts`). | Saatlik kara ve kayıt regresyonları eklendi. Sevkiyat/kapasiteli ikmal/HQ/proje sistemleri henüz yok; bunların bütünleşik kabul testleri geçti denemez. Genel property testleri ve fiziksel cihazlarda uzun sefer bellek/FPS profili ayrı iştir. |
| 99–100 Teslim ve referanslar | Bağımlılığa göre uygulama sırası bu belgede; özgün şartname değişmeden arşivlendi. | Sonraki modülleri ayrı kabul etme ve kaynakların bağımsız doğrulanması. Bütün özellikler tamamlandı veya canlıya dağıtıldı iddiası yok. |

## Sonraki bağımlılık sırası

1. Saatlik temeli ayrı kayıtlı RNG akışları, doğrulanabilir dünya özeti ve
   worker durum farkı aktarımıyla tamamla; hava/deniz çözümünü de başlangıç
   görüntüsünden eşzamanlı işlemeye taşı.
2. Personel/ekipman sürümü, rezervasyon, sevkiyat ve paylaşılan ikmal kapasitesini
   ortak muhasebeye bağla. Tasarımcılar, HQ, hava/deniz harekâtı ve ülke paketleri
   bu temeli atlayarak bağımsız ödül veya dekor olarak eklenmemeli.

Bu kayıt yerel üretim derlemesi ve tarayıcı testlerinin sonucudur. Canlı
xarmygames.online dağıtımı bu çalışmada bağımsız doğrulanmadı.
