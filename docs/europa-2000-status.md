# Europa War — 2.000 satırlık şartnamenin kapsam ve aşama kaydı

Son inceleme: 3 Kasım 2026. İlk aşamanın başlangıç sürümü: `4d9b8af`.
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

## Devam çalışması: stratejik atlas, hava/deniz görünümü ve kolay yönetim

- `map3d-cartography.ts`, `map3d-geometry.ts`: özgün prosedürel yüzey,
  orman/dağ dokusu, alçaltılmış kıyı kabartısı ve güncel kontrole bağlı belirgin
  ülke/cephe sınırları. Sınır geometrisi saat ilerlediğinde yeniden kurulmaz.
- `map3d-country-labels.ts`, `WarMap3D.tsx`: ülkenin bağlantılı topraklarına
  yerleşen, yakınlaştırmaya göre seyrekleşen ülke adları; üstten stratejik ve
  eğimli yakın kamera arasında geçiş. Kamera geçişi yakınlaştırmayı veya seferi
  değiştirmez. Başkent ve seçili şehir isimleri, 447 bölgenin seçimi korunur.
- `map3d-scenery.ts`: tekrarlanan kare yerleşimler yerine kıvrımlı, şaşırtmalı
  şehir dokuları; daha alçak taş/arduvaz yapılar. Bütün kalite seviyelerinde
  her bölgeye bina ve ray/birlik alanını koruyan yerleşim devam eder.
- `map3d-airnaval*.ts`: ayrı avcı/bombardıman/yüzey gemisi/uçak gemisi/denizaltı
  modelleri; gerçek görevlerden hareket, doğrulanmış hasardan kısa çatışma ve
  isabet gösterimi. Kayıt yüklemek veya ikmal yıpranması ateş efekti üretmez.
  Uzak gizli araçlar ve görünmeyen düşman üsleri açığa çıkarılmaz. Temsili
  devriye yolları ayrı bir fiziksel konum veya yeni hasar hesabı değildir.
- `map3d-naval-space.ts`: ortak deniz merkezleri ve gövde/su izi dahil
  kıyıyı aşmayan devriye alanları. Coğrafi sınır denetimleri testte yapılır;
  kare başına poligon taraması eklenmez. Saatlik görüntü güncellemelerinin
  düşük FPS'de uçak/gemi animasyonunu sürekli sıfırlaması da giderildi.
  Ardışık kimlikli filoların aynı görsel evrede üst üste yığılması, seferin
  rastgelelik akışına dokunmayan deterministik evre dağılımıyla düzeltildi.
- `airnaval.ts`: hava etkisi artık etkilediği bölgenin gerçek menzilini de
  doğrular. İç bölgeye deniz saldırısı reddedilir; eski geçersiz görev yakıt
  veya hasar üretmeden durur. Ele geçirilen/tarafsız hale gelen hedefe
  saldırı devam etmez.
- `EasyCommandGuide.tsx`, `easy-play.ts`, `CommandCenter.tsx`: varsayılan
  kolay yönetim, gerçek komutan → kara komşusu sınırı → savun/saldır zinciri.
  Otomatik atama 12 tümen sınırına uyar; sınır görevi savaş ilan etmez.
  Reddedilen emir başarı sayılmaz. Ayrıntılı ekranlar korunur; görünüm
  değişimi zorluğu, kaydı veya kaynakları değiştirmez. Yardımcı yönetimin
  isteğe bağlı maliyet/uygunluk önizlemesi ve hava/deniz emir kısayolları vardır.

**Bu çalışmanın motor doğrulaması:** Tam Europa regresyonu **521/521** geçti;
1936–1945 seferi ve düzeltilmiş demiryolu dönüş testi buna dahildir. Sonradan
eklenen düşük FPS, açık deniz sınırı ve görsel evre düzeltmeleri, ilgili
hava/deniz görsel paketinde **15/15** testle ayrıca doğrulandı. Bu iki sayı
örtüşen testleri de içerir; yeni testlerin tamamının uzun regresyon içinde tekrar çalıştırıldığı
anlamına gelmez. Satranç **118/118**, Battle Royale **21/21**, Color Hide
**39/39** geçti. Son kaynaklarla üretim derlemesi, TypeScript ve lint geçti.

**Tarayıcı doğrulaması:** `test-europa-theater-browser.cjs` ile atlas, kolay
komuta ve gerçek hava/deniz sonuçları için **22/22** kontrol geçti.
`test-europa-3d-browser.cjs` son derlemede **10 masaüstü + 9 mobil** kontrolü
tamamladı; mobil bölüm ayrı tekrar koşusunda doğrulandı. Birlik etiketine denk
gelen sabit pinch koordinatları yerine, iki parmağın da gerçek canvas alanına
bastığı DOM hit-test ile doğrulanır. Kasıtlı WebGL kaybından sonraki tek yeniden
açılış adımında yazılımsal çizim için 90 saniyelik tıklama süresi tanınır;
sefer eşitliği ve kaynak temizliği kontrolleri korunur.
`test-europa-commanders-browser.cjs` masaüstü/mobil **8/8** geçti. İlk koşudaki
gün sonu zaman aşımı aynı kayıtla temiz tarayıcıda tekrarlanmadı; motor hesabı
ayrıca 59 ms ölçüldü ve oyunun 20 saniyelik koruma süresi değiştirilmedi.
Bu koşular Chromium/SwiftShader ve mobil emülasyon kullanır; 3D performans
örneklemesi atlandı, fiziksel telefon veya 60 FPS sonucu iddia edilmez.
Son görsel evre düzeltmesinden sonra `EUROPA_THEATER_ONLY=1` ile gerçek
hareket, gün sonu hasarı/efektleri, duraklatma, azaltılmış hareket ve kayıt
yükleme kontrolleri ayrıca **10/10** geçti. Son masaüstü ve mobil çatışma
ekranları görsel olarak incelendi; tarayıcı/konsol hatası bildirilmedi.

**Kapsam sınırı:** Coğrafya mevcut Avrupa veri paketidir; HOI4 harita dosyaları
kopyalanmamıştır ve doğrulanmış yeni dünya/1939 atlası oluşturulmamıştır.
Hava/deniz sonuçları günlük hesaplanır. Ortak savaş sisi, tam savaş olay
defteri, eşzamanlı saatlik hava/deniz çözümü, modüler tasarımcılar ve aşağıdaki
tabloda belirtilen diğer açık işler bu aşamada tamamlanmış sayılmaz.

## Devam çalışması: karanlık gece atlası — 3 Kasım 2026

- `map3d-cartography-palette.ts`, `map3d-cartography.ts`: 2D/3D ortak,
  düşük doygunluklu özgün siyasi renkler; soğuk orman dokusu, koyu arazi
  katmanları ve prosedürel karlı dağ sırtları. Siyasi renklerin kimliği ve
  askerî/ikmal katmanlarının anlamı korunur. Bu bir mevsim veya hava motoru
  değildir; mevcut coğrafya ve tarihsel senaryo verileri değiştirilmez.
- `map3d-renderer.ts`, `WarMap.tsx`, harita stilleri: lacivert deniz/ufuk,
  düşük kontrastlı su hareketi, soğuk ortam ışığı ve açık renk başkent işaretleri.
  2D harita da aynı gece paletini ve tek ortak şehir ışığı gradyanını kullanır.
  Harita seçimi, şehir seçimi ve mevcut katmanlar aynı sefer üzerinde çalışır.
- `map3d-country-labels.ts`: ülke adları, kontrol edilen en büyük bağlantılı
  kara parçasının uzun eksenine göre yerleşir ve döner. 3D etiketler ekran
  genişliğine göre ölçeklenir; çakışma ve yakın görünüm elemesi uygulanır.
  Eğimli yazıların boş kutu köşeleri komşu ülkeyi gizlemez; gerçek döndürülmüş
  dikdörtgen kesişimi ve dört adımlı yazı küçültmesi kullanılır. Geniş görünümde
  Fransa adının Almanya tarafından gereksiz gizlenmesi böylece giderildi.
  Ülke adları için kamera–odak uzaklığı 300 birimin üzerinde olmalıdır.
- `map3d-city-lights.ts`: **447 şehir** için arazi üzerinde sıcak ışık
  çekirdekleri, başlangıçtaki **29 başkent** için daha güçlü vurgu.
  Düşük/Orta/Yüksek/Ultra ayarlarında mevcut veriyle sırasıyla
  **447 / 893 / 1.338 / 1.783** ışık örneği tek instanced çizim çağrısında
  çizilir. Şehir başına en fazla 1/2/3/4 örnek vardır; kıyı dışında kalan
  ek noktalar eklenmez. Harici doku, dinamik noktasal ışık, tam ekran bloom
  veya ışık başına zamanlayıcı kullanılmaz. Coğrafya önbelleklidir;
  kamera hareketi yalnız shader boyutunu, kalite yalnız örnek sayısını değiştirir.
  Başkent yeri değişmedikçe saatlik dünya güncellemesi ışık tamponlarını yenilemez.
- `map3d-scenery.ts`, `map3d-railways.ts`: kıta görünümünde minyatür kalabalığı
  azaltılır. Yerleşimler 950 birim ve üzerinde, ray/istasyon/trenler 850 birimin
  üzerinde gizlenir. Pencere ve tesis ayrıntıları 520, kayalar 650, bacalar 720,
  ağaçlar 760 birimin altında görünür; traversler Düşükte en fazla 520, diğer
  ayarlarda 620 birime kadar çizilir. Birimler kamera–odak mesafesidir.
  Yakınlaştırmada yerleşim örnekleri yeniden oluşturulmaz; bütün bölgelerdeki
  bina verisi ve oyuncunun başkentine bağlı ray görünürlük kuralı korunur.

**Simülasyon ve kapsam:** Bu gece teması `World`, savaş hasarı, üretim, tarih
veya sefer RNG akışını değiştirmez. Şehir ışıkları bilinen coğrafyadır;
gizli düşman hasarı, altyapısı veya askerleri ışık üzerinden açığa çıkarılmaz.
Işıklar sefer saatine bağlı bir gece/gündüz sistemi değildir. Mevcut Avrupa
çokgenleri kullanılır; HOI4 harita dosyaları veya görselleri eklenmemiştir.
Bu görsel aşama, 2.000 satırlık şartnamenin aşağıdaki açık mekaniklerini
tamamlanmış hale getirmez. Hava/deniz hasar hesabı hâlâ günlüktür.

**Bu aşamanın doğrulaması:** Geometri, yüzey, görsel bütçeler, yerleşimler,
raylar, kartografya, ülke etiketleri, şehir ışıkları, hava/deniz gösterimi ve
birlik olaylarını kapsayan **88/88** odaklı test geçti. Görsel incelemede bulunan
etiket çakışması düzeltmesinden sonra ilgili etiket paketi **5/5** olarak yeniden
geçti; bu sayı önceki paketteki dört testi de içerir. Son kaynaklarla üretim
derlemesi, TypeScript ve lint başarılı.

Gerçek Chromium'da `test-europa-night-browser.cjs` ile masaüstü ve dokunmatik
mobil boyutta **16/16** kontrol geçti. Gerçek WebGL çizimi, Fransa/Almanya
etiketleri, kaliteye bağlı tek çizimlik ışık bütçesi, kıta/şehir LOD geçişi,
oyuncunun bağlı trenleri, duraklatılmış seferde tren hareketi, tekerlek/pinch,
2D dönüş, klavye seçimi ve bütün kayıt dünyasının değişmezliği doğrulandı.
`test-europa-map-render-browser.cjs` ayrıca **6/6** kontrolle gerçek ele geçirme,
renk/sahip/işgal/birlik güncellemesi, diplomasi ve ikmal katmanlarını doğruladı.
`test-europa-theater-browser.cjs` yalnız hava/deniz bölümünde ayrıca
**10/10** masaüstü/mobil kontrolü geçti: gerçek görev hareketi, uçak kaybı,
gemi hasarı, bombardıman etkisi, duraklatma/azaltılmış hareket ve içe aktarılan
kayda sahte çatışma eklenmemesi. Üç tarayıcı paketinin toplam **32** kontrolünde
konsol veya sayfa hatası yok. Masaüstü ve mobil kıta/Orta Avrupa/Ankara/2D ve
hava-deniz çatışması ekran görüntüleri incelendi.

Bu tarayıcı koşusunda Düşük kıta görünümü **9 çizim çağrısı / 84.316 üçgen**,
Ankara yakın görünümü bir trenle **32 çağrı / 381.802 üçgen** gösterdi.
Bunlar yazılımsal WebGL ortamının çizim sayılarıdır; fiziksel telefonda 60 FPS
ölçümü değildir.
Bu aşamada uzun 1936–1945 seferi ve diğer oyunların tam regresyonları yeniden
çalıştırılmadı; yukarıdaki sonuçları önceki aşamaya aittir.

## Devam çalışması: askerî simgeler, ülke okları ve çatışma ışığı — 3 Kasım 2026

- `MilitaryIcon.tsx`, `military-symbols.ts`: komuta, ordu, ekonomi, diplomasi,
  araştırma, harekât, kayıt ve kamera araçları için ortak 50 özgün SVG simge.
  2D birlik sayaçları, 3D birlik/başkent etiketleri aynı çizim ailesine bağlandı;
  Türkçe metinler ve erişilebilir kontrol adları korundu. HOI4'ün simge,
  arayüz veya model dosyaları kullanılmadı.
- `movement-routes.ts`, `map3d-movement-arrows.ts`, `WarMap.tsx`: yürüyen
  görünür birlikler seçilmeden de ülke renginde, son hedefe dönük ok taşır.
  Aynı ülke ve rotadaki tümenler sayılı tek okta birleşir. Oyuncunun seçili
  bekleyen rotası kesiklidir; hareket iptal/varışında ok kaldırılır. Düşman
  görünürlüğü mevcut birlik görünürlüğünü izler, yabancı ülkenin gelecekteki
  emir kuyruğu gösterilmez. En fazla 256 rota, rota başına 16 konum ve 3D'de
  60.000 vertex sınırı vardır. Tek mesh arazi yüzeyini izler; değişmeyen rota
  verisi geometriyi yeniden kurmaz.
- `map3d-land-models.ts`, `map3d-land-material.ts`: piyade giysi/teçhizatı,
  tank zırhı/palet/taret parçaları, top siperi/mekanizması ve kamyon kabin/
  branda ayrıntıları yeniden modellendi. Mevcut 13 hareketli parça grubu,
  namlu konumları ve bina açıklığı sınırları korundu. Ortak geometriler toplam
  20.010 vertex, en büyük grup 4.128 vertex içerir. Kumaş, zırh, çelik, lastik
  ve cam aynı PBR malzemesinde farklı roughness/metalness vertex değerleri
  kullanır; parça başına yeni malzeme çizim çağrıları eklenmez.
- `map3d-combat-lighting.ts`, `map3d-units.ts`: gerçek kara muharebesinin
  namlu, mermi ve isabet konumlarında ışık halkası; namlu/isabet altında
  çizilen araziye oturan ışık lekesi. Hareketli veya çatışmaya destek veren
  kamyonlar iki far taşır. Düşük/Orta ayarda gerçek noktasal ışık yoktur;
  Yüksek en fazla 2, Ultra 4 ortak gölgesiz ışık kullanır. Kamera uzaklığı
  900 ve üzerindeyken noktasal ışıkların gücü sıfırlanır. İki instanced
  grupta en fazla 256 halka ve 128 arazi lekesi çizilir. Atış bittiğinde
  eski ışıklar temizlenir; ışık sayısı atış döngüsüyle shader derlemesi
  tetikleyecek şekilde değişmez.
- `map3d-scenery.ts`: mevcut köy/şehir pencere gruplarına ortak sıcak
  emissive malzeme eklendi; malzemenin temizliği sahne yaşam döngüsüne
  bağlandı. Önceki aşamadaki 447 şehir ışığı, kalite/LOD bütçeleri ve
  oyuncunun başkentine bağlı demiryolu görünürlüğü korunur.

**Simülasyon ve kapsam:** Yeni oklar ve ışıklar `World` veya sefer RNG'sine
yazmaz; ek hasar, hareket, kaynak tüketimi veya fetih üretmez. Piyade/tank/
top/kamyon için 1/2/3/4+ tümen gösterim kuralı korunur; görsel model tipi
gerçek birliğin ekipmanını değiştirmez. Kamyon destek aracıdır. Modeller
kodla üretilen strateji minyatürleridir; taranmış AAA varlık, yeni 2K/4K
doku paketi veya bütün 2.000 satırlık şartnamenin tamamlanması değildir.
Bu aşama, aşağıdaki mekanik eksikleri kapatmış sayılmaz.

**Bu aşamanın odaklı doğrulaması:** 16 test dosyası birlikte sıkı TypeScript
derlemesinden geçti. Birleşik görsel regresyonda **136/136** test geçti;
başarısız, atlanan veya iptal edilen test yok, süre 109,564 saniye.
Paket geometri, yüzey, modeller, birlik/çatışma olayları, ışık, rota,
yerleşim, demiryolu, kartografya, etiket ve hava/deniz görsellerini kapsar.
Gizli düşman rotası/gelecek emirleri, Dünya/RNG değişmezliği,
yön/iptal/grup sayısı, model yüzey öznitelikleri, ışık bütçesi ve GPU
kaynak temizliği denetlendi. Gerçek shader bağlantısı ve görsel kalibrasyon
aşağıdaki tarayıcı doğrulamasına aittir.

- Derleme kaydı: `/workspace/scratch/europa-military-review-compile.log`.
- Test kaydı: `/workspace/scratch/europa-military-review-tests.log`.
- Bağımsız kaynak incelemesi: `/workspace/scratch/europa-military-review-inspection.log`.

Gerçek oyun görüntüsünde ok başının koyu dış çizgisinin renkli gövdeyi kestiği
görüldü. Dış çizgi önce, renkli gövde ve baş sonra çizilecek şekilde düzeltildi.
Bu son değişiklikten sonra odaklı ok paketi **7/7** geçti; yeni test seçili ve
seçili olmayan okun birleşimindeki son çizilen üçgen rengini denetler. Testin
eski çizim sırasında başarısız olduğu da doğrulandı. Bu 7 test, yukarıdaki
136 sonuca eklenerek toplam gösterilmez; altı test aynı kapsamdadır.
Kayıtlar: `/workspace/scratch/europa-military-arrows-neck-fix-tests.log` ve
`/workspace/scratch/europa-military-arrows-neck-old-order-regression.log`.

**Bu aşamanın üretim derlemesi:** Son kaynaklarla üretim derlemesi,
TypeScript, lint ve statik sayfa üretimi başarılı (çıkış kodu 0); üretim
sunucusu HTTP 200 döndürüyor.

**Bu aşamanın tarayıcı doğrulaması:** Üretim sunucusunda gerçek Chromium/WebGL
ile 1440×1000 masaüstü ve 390×844 dokunmatik mobil emülasyonunda **19 farklı
kontrol grubu** geçti; JavaScript/konsol hatası yok. İlk koşudaki dört masaüstü
model kontrolü korundu; aynı adlı iki düğme nedeniyle belirsiz kalan test
seçicisi düzeltildikten sonra diğer kontroller yeniden çalıştırıldı. Birleşik
rapor `/workspace/scratch/europa-military-browser/combined-report.json`.

- 1/2/3/4 tümen için doğru model bileşimi; SVG menü/zaman simgeleri.
- Ülke renginde gruplu oklar, gizli düşman bilgisinin saklanması, 2D/3D uyumu.
- Seçimi temizleyince hareketin sürmesi, gerçek dur emriyle dört tümenin
  durması; bir saatlik gerçek simülasyonda dört tümenin birlikte varması.
- Gerçek karşılıklı kayıplarla piyade, tank ve top mermilerinin aynı anda
  parlaması; arazi ışığı ve iki kamyon farı. Yakalanan karede 8 ışık halkası,
  4 arazi lekesi; Yüksek ayarda 2 gerçek noktasal ışık.
- Duraklatma/azaltılmış hareket, kalite değişimi ve görünümün kayıtlı dünyayı
  değiştirmemesi; barış durumu içeren kayıt yüklenince bütün eski atış ve
  ışıkların temizlenmesi.

Test ortamı SwiftShader yazılımsal çizim kullanır; fiziksel telefon FPS ölçümü
yapılmadı. Önceki aşamanın 32 tarayıcı kontrolü ve 521 testlik tam regresyonu
bu çalışma için yeniden çalıştırılmış gibi sayılmaz.

**Son görsel kontrol:** Ok birleşimi düzeltmesiyle üretim derlemesi yeniden
başarıyla alındı (`europa-military-build-final.log`). Yeniden başlatılan üretim
sunucusunda 3 odaklı tarayıcı kontrolü daha geçti, hata yok. Yüksek ayarda
gerçek kamera sürükleme hareketiyle asker/tank/top/kamyon önden ve yandan
incelendi; kamera ve kalite değişimi sonrasında bütün kayıt eşit kaldı.
Düzeltilmiş okların renkli gövde/baş birleşimi ekran görüntüsünde kesintisiz.
Bu tekrar kontrolleri 19 farklı kontrol grubuna eklenip yeni kapsam sayılmaz.
Rapor: `/workspace/scratch/europa-military-final/report.json`.
Görüntüler: `desktop-four-models-oblique-high.png` ve
`desktop-country-movement-arrow.png`, aynı rapor klasöründe.

## Devam çalışması: araştırma modelleri, bağımsız baş hareketi ve manuel kolay yönetim — 3 Kasım 2026

- `map3d-unit-research.ts`: görünüm ülkenin tamamlanmış teknolojilerinden
  türetilir. Piyade/topçu `weapons1/2/3`, tank `armor1/2/3`, kamyon önce
  `motorization` ardından `engines` veya `mechanization` ile değişir.
  Kuyrukta araştırma, araştırma ilerlemesi veya tarih tek başına kademe
  açmaz; kayıt/yeniden yükleme için ayrı bir görünüm ilerlemesi saklanmaz.
  Kendi/müttefik/aktif istihbaratlı ülkelerde tamamlanmış araştırma profili,
  diğer görünen yabancılarda yalnız gözlenen birlik tipi kullanılır.
  Böylece gizli araştırma modeli üzerinden açıklanmaz. Bütün 29 başlangıç
  ülkesine kumaş paleti, isyancı ülkelere ana ülke tonu ve bilinmeyen ülkeye
  güvenli varsayılan ton tanımlanır.
- `map3d-land-models.ts`: her aileye temel dâhil dört özgün geometri kademesi;
  kıyafet/başlık/tüfek/çanta, tank zırhı/tareti, top siperi ve kamyon gövdesi
  birbirinden ayrılır. İlk 13 parça indeksine boyun merkezine yerleştirilen
  baş ve baş ayrıntısı eklenir. Her kademede 15 parça, sırasıyla
  **21.156 / 22.344 / 23.388 / 24.408 vertex** vardır; en büyük tek parça
  **4.332 vertex**. Mevcut ayak, namlu, şehir açıklığı ve etiket yüksekliği
  sınırları korunur. `unitCloth` maskesi, ten/metal/camı üniforma renginden
  ayırır; PBR malzemesine hafif prosedürel kumaş/yüzey ayrıntısı eklenir.
- `map3d-units.ts`: kademeler gerektiğinde oluşturulan, en fazla dört ortak
  geometri grubunda tutulur. Kamera dışına çıkıp dönen ülke için yeniden
  geometri/GPU tahsisi yapılmaz; örnek tamponları ihtiyaçla sınırlı boyut
  basamaklarında büyür. Görünür minyatür sınırı 3.072 kalır. Duran piyade
  başları kimliğe bağlı farklı evrelerde boyun çevresinde bakınır; gövde ve
  tüfek döndürülmez. Yürüyüş, çatışma ve ele geçirme başı mevcut harekete
  döndürür. Duraklatma/azaltılmış hareket/gizli sekme geçişinde kare
  zamanlaması sıfırlanır; bekleme süresi devam edildiğinde animasyona eklenmez.
- `map3d-renderer.ts`: görünür oluşumlara araştırma profili bağlanır; duraklatılmış
  Düşük ayarda görünür tren yoksa mevcut ihtiyaç üzerine çizim korunur.
  Baş hareketi için yeni bir sürekli döngü açılmaz. Şehir halkası, çatışma
  halkası/arazi lekesi ve ortak sıcak pencere malzemesi ölçülü güçlendirilir;
  şehir, halo ve 0/0/2/4 gerçek çatışma ışığı bütçeleri artmaz.
- `SimpleManagement.tsx`, `CommandCenter.tsx`, istemci ve kolay rehber:
  Tümen eğit/Yapı inşa et/Teknoloji seç/Diplomasi yap kısayolları gerçek
  paneli açar; kendiliğinden kaynak harcamaz veya emir vermez. İnşaat
  kısayolu kontrol edilen uygun bölgeyi seçer. Yardımcı ayarları başlangıçta
  kapalı bölümde, açık yardımcı sayısı ise görünür kalır; kolay görünüm
  kayıtlı otomasyon tercihlerini değiştirmez. Siyaset/hava/deniz tam görünümde,
  gelişmiş ordu araçları ve tam araştırma ağacı açılabilir ayrıntılarda korunur.
- `UnitResearchGuide.tsx`, `WarPanels.tsx`: kademe ve sonraki gerçek
  araştırma/önkoşul açıklaması yanında manuel araştırma düğmesi bulunur.
  Düğme mevcut doğrulanan araştırma komutunu uygular; eksik önkoşul,
  süren araştırma ve dolu yuva durumlarında devre dışıdır. Topçu görünümü
  ortak silah modernizasyonunu izler; yeni topçu teknolojisi eklenmez.
- Gerçek ekran incelemesinde bulunan 2D harita simgesi boyutlandırması
  düzeltildi: haritayı kaplayan SVG kuralı artık yalnız ana harita tuvaline
  uygulanır. Katman düğmeleri ve birlik sayaçlarının simgeleri kendi küçük
  boyutlarını korur.

**Simülasyon ve kapsam:** Görsel profil, üniforma ve baş hareketi Dünya/RNG
verisini, donanım stoku veya savaş gücünü değiştirmez. Bir grubun 1/2/3/4+
tümen için sembolik piyade/tank/top/kamyon bileşimi korunur. Araştırmanın
oyun etkileri mevcut teknoloji kurallarından gelir; görünüm fazladan bonus
üretmez. Modeller prosedürel strateji minyatürleridir; AAA varlık paketi veya
2.000 satırlık bütün mekaniklerin tamamlanması olarak raporlanmaz.

**Bu aşamanın odaklı doğrulaması:** Son kaynaklarla 18 test dosyası sıkı
TypeScript derlemesinden, **159/159** test birleşik koşudan geçti. Başarısız,
atlanan veya iptal edilen test yok; süre 37,909 saniye. Değişen/yeni 17
Europa TypeScript/TSX dosyası, testler dâhil, kapsamlı yerel lint denetiminden
geçti. Paket; yeni araştırma/görünürlük, dört kademe, baş hareketi ve kaynak
yaşam döngüsünü mevcut görsel/kolay rehber testleriyle birlikte doğrular.

Gerçek dokuz araştırma emri ve gün sınırında tamamlanması, bitmemiş kuyruğun
görünümü değiştirmemesi, kayıt/eski kayıt/geri dönüş, istihbarat süresinin
bitmesi, değişmeyen namlu/yerleşim sınırları, bağımsız baş dönüşü,
duraklatma/azaltılmış hareket/gizli sekme dönüşünde atlama olmaması,
kamera dışına on kez çıkıp dönmede aynı model geometrilerinin yeniden
kullanılması ve GPU kaynaklarının tek kez bırakılması kapsanır. Manuel
panel eylemleri ayrıca aşağıdaki gerçek tarayıcı koşusuna tabidir.

- Derleme: `/workspace/scratch/europa-research-review-compile.log`.
- Testler: `/workspace/scratch/europa-research-review-tests.log`.
- Lint: `/workspace/scratch/europa-research-review-lint.log`.
- Bağımsız inceleme: `/workspace/scratch/europa-research-review-design.log`.

Önceki aşamaların 136 test/19 tarayıcı kontrolü kendi tarihsel kaydıdır;
bu sayıların üzerine eklenerek toplam gösterilmez.

**Bu aşamanın üretim derlemesi:** `npm run build` son kaynaklarla başarılı;
Next.js bütün sayfaları derledi, tip ve lint denetimleri geçti. Kayıt:
`/workspace/scratch/europa-research-build-final.log`.

**Tarayıcı doğrulaması:** Chromium/SwiftShader ile 1440×1000 masaüstü ve
390×844 dokunmatik mobil emülasyonunda **10 benzersiz kontrol grubu geçti**;
katkı veren koşularda uygulama/tarayıcı konsol hatası yok. Bunlar tek kesintisiz
koşu değil, tamamlanmış grupların ayrı koşulardan birleştirilmesidir.
Masaüstü araştırma düğmesi, yalnız simge CSS'i değiştirilmeden önce geçti;
aynı akış mobilde son üretim derlemesinde tekrar geçti. Son masaüstü
arayüz kontrolü düzeltilen simge boyutlarını da doğruladı.

Kapsam: gerçek saatle araştırma tamamlanması, bekleyen araştırmanın modeli
erken değiştirmemesi, dört ileri model, bağımsız baş hareketi ve donması,
manuel seçimlerde tam kayıt eşitliği, kayıtlı yardımcı tercihlerinin korunması,
gerçek karşılıklı hasarla ateş/ışık gösterimi ve yeni kayıtla efekt temizliği.
High malzeme/gölge ve gerçek çatışma ışıkları da çizildi. Sürekli High çizimde
yazılımsal ekran yakalama geciktiği için son çatışma görüntüsü gerçek Low
muharebesi duraklatılıp azaltılmış hareket ve High seçilerek alındı; görünüm
değişikliğinin kayıt durumunu değiştirmediği doğrulandı.

- Betik: `scripts/test-europa-research-models-browser.cjs`.
- Birleşik kanıt: `/workspace/scratch/europa-research-models-browser/combined-report.json`.
- Model görüntüsü: `/workspace/scratch/europa-research-models-browser/desktop-upgraded-models-high.png`.
- Çatışma görüntüsü: `/workspace/scratch/europa-research-models-browser/desktop-upgraded-combat-high-paused.png`.
- Mobil görüntüsü: `/workspace/scratch/europa-research-models-browser/mobile-upgraded-combat-lights.png`.

Fiziksel telefon/Windows FPS ölçümü ve uzun 1936–1945 sefer regresyonu bu
odaklı görsel çalışmayla yapılmış sayılmaz. Canlı dağıtım bağımsız doğrulanmadı.

## Referans model ve maliyetli rota aşaması — 3 Kasım 2026

Bu aşamanın başlangıcı `d4c427c` sürümüdür. Bölüm 15'teki kara modeli
ayrıntıları ve bölüm 47'deki rota maliyeti üzerinde çalışıldı; bütün
2.000 satırın tamamlandığı anlamına gelmez.

- Kara minyatürleri sürekli kıvrımlı kumaş, anatomik yüz/eller, dönem başlıkları
  ve donanımla yeniden şekillendirildi. PBR yüzeylere özgün, mip seviyeli
  küçük bir maske eklendi. Dört araştırma aşaması, bağımsız baş hareketi,
  namlu/ayak eksenleri ve instanced çizim korunur. Resimlerdeki hazır
  modellerin birebir kopyası veya 2K/4K doku seti değildir.
- Telefonda bakış/grafik/animasyon kontrolleri açılır **Görünüm ayarları**
  alanına taşındı. Oyuncunun yönetim tercihlerini ve sefer durumunu değiştirmez.
- `land-movement-cost.ts` gerçek saatlik hareketin mevcut süre, arazi,
  birlik hızı, keşif desteği, motor, ikmal ve yakıt formüllerini ortaklaştırır.
  `land.ts` artık en az kenarlı rota yerine tahmini en kısa hareket süreli
  Dijkstra rotasını seçer. Altyapı/hasar/yığılma, mevcut yerel ikmal hesabı
  üzerinden maliyete yansır. Tahmin, gelecekteki yakıt ve işgali garanti etmez.
- Aynı başlangıçtaki grup için en yavaş üye dikkate alınır; bütün birlikler
  ortak yolu alır. Erişim, savaş ve deniz geçişi kuralları korunur. Oyuncu ve
  AI emirleri aynı doğrulayıcıyı kullanır. Savaş planları aynı maliyet hesabıyla
  ileriyi değerlendirebilir, fakat gerçek emir yalnız yasal ilk adımı verir.
- `commanders.ts` sınır yerleştirme dağıtıcısının ayrı BFS araması korunmuştur.
  Bu nedenle bütün AI/sınır planlaması maliyetli rotaya geçti denemez.
  Hava durumu maliyeti, stratejik demiryolu taşımacılığı, gerçek sevkiyat ve
  kapasiteli ikmal bu aşamada eklenmedi.

**Kod doğrulaması:** Son kaynaklarla 19 dosyadaki 164 görsel/animasyon/araştırma
testi geçti. Rota değişikliği için ayrıca 10 yeni test ve 90 mevcut hareket,
komut, AI ve savaş planı regresyonu geçti. Bu grupların kapsamları ayrıdır;
önceki aşamaların sayılarıyla toplanmaz. Yeni geometrinin okunabilirlik
kontrolünde, eski büyük başa göre konmuş 10 birimlik alt sınır doğal baş
oranıyla uyumlu 9,5 birime indirildi; etiket üst sınırı ve ayrı anatomi,
namlu, ayak, yüzey normali ve geometri bütçesi kontrolleri korunur.

- Görsel testler: `/workspace/scratch/europa-wwii-visual-tests-final.log`.
- Rota testleri: `/workspace/scratch/europa-weighted-routing-tests.log` ve
  `/workspace/scratch/europa-weighted-routing-regression.log`.
- `npm run build`: başarılı; tam tip/lint ve üretim sayfaları kontrol edildi.
  Kayıt: `/workspace/scratch/europa-wwii-build.log`.

**Gerçek tarayıcı doğrulaması:** Son üretim derlemesinde Chromium/SwiftShader
ile 1440×1000 masaüstü ve 390×844 dokunmatik mobil emülasyonunda dört kontrol
grubu geçti; uygulama/konsol hatası yok. Temel ve ileri araştırma modelleri
aynı kamerada karşılaştırıldı, masaüstünde yakın Low/High görüntüleri incelendi.
Mobil aç/kapat kontrolleri ve bütün sunum değişikliklerinde tam sefer kaydı
eşit kaldı. Masaüstünde dört saldıran tümenin gerçek karşılıklı hasarı,
tüfek/tank/top ışıkları, kamyon farları ve yeni kayıtla efekt temizliği doğrulandı.
High çatışma görüntüsü, gerçek Low muharebesi duraklatılıp azaltılmış hareket
seçilerek alındı; sürekli High çizimde performans ölçümü değildir.

- Betik: `scripts/test-europa-wwii-reference-browser.cjs`.
- Sonuç: `/workspace/scratch/europa-wwii-reference-browser/report.json`.
- Yakın model: `/workspace/scratch/europa-wwii-reference-browser/desktop-tier3-closeup-high.png`.
- Çatışma: `/workspace/scratch/europa-wwii-reference-browser/desktop-upgraded-combat-high-paused.png`.
- Mobil: `/workspace/scratch/europa-wwii-reference-browser/mobile-tier3-same-camera-low.png`.

Bu koşu fiziksel telefon/Windows FPS testi, tam 1936–1945 sefer testi veya
canlı site dağıtım doğrulaması değildir. Önceki aşamaların tarayıcı sayıları
bu aşamanın sayısına eklenmez.

## Ulusal modeller ve komutan rota devamı — 3 Kasım 2026

Başlangıç sürümü `1e60ae0`. Kullanıcının son ülke ve üniforma referanslarıyla
bölüm 15; komutan sınır yerleşimiyle bölüm 47 ilerletildi. Bu çalışma bütün
2.000 satırın tamamlandığını veya HOI4 modellerinin kopyalandığını söylemez.

- 29 ülkenin biçim profili: miğfer/şapka, kaput, yaka, kayış, sırt çantası,
  çizme; tank gövdesi/kulesi, kamyon kabini/brandası ve top kalkanı.
- Yeni referanslar: Alman atkısı, büyük çanta ve silindirik teçhizat kutusu;
  Britanya atkı/kayışları; Fransız mavi kaput ve Adrian; Sovyet bej kışlık
  kaput, kürk yaka ve uşanka; İtalyan M33; Türk haki kaput ve siperli şapka;
  İsveç gri-yeşil üniforma. Bunlar özgün, oyun ölçeğine uygun geometrilerdir.
- İleri araştırma görünümü için 10 tank, 10 kamyon ve 7 top tasarım referansı.
  Tiger I, Churchill, Somua S35, T-34, M13/40, LT vz. 38, Stridsvagn m/42,
  Türkiye için T-26, Polonya için 7TP ve Hollanda Doğu Hint Adaları CTLS.
  Büyük ülkelerin tanınan kamyon ve top aileleri de ayrılır. Küçük ülkelerde
  paylaşılan tasarım aileleri arayüzde açıkça belirtilir; tarihsel üretim veya
  tam envanter doğruluğu iddiası değildir. Araç imzaları 2–3. görsel kademede
  belirir; tamamlanmış teknoloji ve mevcut istihbarat kuralları korunur.
- Yalnız ihtiyaç duyulan geometri parçaları oluşturulur; gerçekten aynı
  parçalar paylaşılır. Boşta önbellek 64 parça / 180.000 vertex / 4.096 örnek
  yuvasıyla sınırlıdır. Aktif görünümün 3.072 minyatür ve 128 efekt sınırı,
  baş hareketi, namlu eksenleri ve sahne kapanışında temizleme korunur.
  İncelemede bulunan aktif tamponların yalnız büyümesi sorunu da düzeltildi:
  binlerce birlikten birkaç birliğe geçişte aşırı kapasite hemen, daha küçük
  düşüşlerde 30 güncelleme sonrası küçülür.
- MIT lisanslı Muster M40 kabuğunun seçili geometrik formülü uyarlanmıştır.
  Tam oyun varlıkları içe aktarılmadı. [Kaynak incelemesi](europa-national-assets.md),
  sabit kaynak sürümü ve tam MIT bildirimi eklenmiştir; bildirim `v5`
  çevrimdışı pakete de indirilir.
- Komutan sınır dağıtıcısı artık mevcut arazi/ikmal/mesafe/hız maliyetini
  kullanır. Dengeli sınır dağıtımı, mevcut konum/atama önceliği, 12 tümen
  sınırı, hedef ülke yalıtımı ve boş komutanın hareketsizliği korunur.
  Aynı ülke ve hareket profilleri ortak arama kullanır; her kenarda bütün
  ordular taranmaz. Önbellek tek emir/gün işlemiyle sınırlıdır; sonraki
  işlem kontrol/erişim/hasar/ikmal değişikliklerini yeniden değerlendirir.

**Komutan doğrulaması:** Yeni 9 rota testi dâhil 14 dosyada **136/136** test
geçti. Bu koşu uzun 3.653 günlük kampanya testini de içerir. 447 bölge/240 ve
480 birlik regresyonunda ordu okumaları 1.200 → 2.400, komşuluk okumaları
848 → 888 oldu. Gerçek saatlik Ankara–Urfa varışı, karışık tümen grupları,
eşzamanlılık, kayıt, erişim ve komutan yalıtımı doğrulandı. Kayıt:
`/workspace/scratch/europa-commander-regression.log`.

**Çevrimdışı doğrulama:** Lisans bildiriminin indirilmesi, çevrimdışı okunması,
indirme başarısızlığında hazır sayılmaması ve eski tamamlanmış paketin korunması
dâhil mevcut paket/varlık grubunda **26/26** test geçti.

**Son model doğrulaması:** Son kaynaklarla 20 dosyada **177/177** görsel,
model, animasyon, araştırma ve arayüz davranışı testi geçti. Bu grubun içindeki
52 odaklı test; 29 ülke × dört kademenin gerçek geometri farklarını, ortak
parça anahtarlarının aynı tamponları üretmesini, bütün ileri araç varyantlarını,
namlu/ayak eksenlerini, normal/boyut/vertex sınırlarını, üniforma ayrıntılarını
ve tampon büyüme/küçülme/tek seferlik temizliğini kapsar. 52 sayısı 177'ye
eklenmez. Büyük orduları sekiz ülkede gezip yalnız sekiz birlik bırakma
regresyonunda aktif örnek kapasitesi önceki 135.168 yuvada kalmak yerine
ilk duraklatılmış güncellemede en çok 384 yuvaya iner.

- Görsel test kaydı: `/workspace/scratch/europa-national-visual-tests-final.log`.
- `npm run build`: tam tip/lint ve üretim derlemesi başarılı;
  `/workspace/scratch/europa-national-build-final.log`.
- Gerçek üretim sürümü, Chromium/SwiftShader ile 1440×1000 masaüstü ve
  390×844 dokunmatik mobil emülasyonunda **30/30** tarayıcı kontrolünden geçti;
  uygulama/konsol hatası yok. Masaüstünde 10 ülke, mobilde Türkiye ve Almanya
  temel/ileri kademelerde aynı sabit perspektif kamera ve şehir izdüşümüyle
  karşılaştırıldı. Ulusal araştırma açıklamaları ve tam sefer kaydı eşitliği
  kontrol edildi. Kamera eylemsizliği karşılaştırmaları bozmaması için ortak
  public odak/yakınlaştırma kontrolleri kullanıldı ve son kare beklendi.
- İsyancıların ana ülke modelini devralması, başka ülkenin araştırmasının
  oyuncu görünümünü değiştirmemesi, boşta baş hareketi/duraklatma/azaltılmış
  hareket, mobil ayar paneli ve yatay taşma yokluğu geçti.
- Dört saldıranın gerçek karşılıklı hasarıyla tüfek/tank/top ışıkları ve kamyon
  farları görüldü; barışçıl kayıt yüklenince eski efektlerin temizlendiği
  doğrulandı. High çatışma görüntüsü gerçek Low muharebesi duraklatılıp
  azaltılmış hareket seçilerek alındı; sürekli High FPS ölçümü değildir.
- Betik: `scripts/test-europa-national-models-browser.cjs`.
- Rapor: `/workspace/scratch/europa-national-models-browser/report.json`.
- Görsel inceleme: `desktop-germany-tier3-high.png`,
  `desktop-upgraded-combat-high-paused.png`, `mobile-turkey-tier3-same-camera.png`
  (aynı rapor klasöründe). Önceki deneme koşuları son sayılara eklenmez.

Hava maliyeti, stratejik demiryolu nakli, kapasiteli gerçek sevkiyat, bütün
ülkeler için kaynakla doğrulanmış birebir envanter ve yüksek çözünürlüklü hazır
karakter/animasyon setleri bu aşamada tamamlanmadı. Fiziksel telefon veya
Windows donanımında 60 FPS garantisi verilmez.

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
| 47–51 Hareket, cephe, savaş, kuşatma | Saatlik grup hareketi; arazi, mesafe ve mevcut ikmale göre maliyetli manuel/AI emir rotası, komutan sınır dağıtımı ve saldırı planı; hedef devlete özel saldır/savun, eşzamanlı hasar ve geri çekilme (`land.ts`, `land-movement-cost.ts`, `planning.ts`, `commanders.ts`). | Hava etkisi, stratejik demiryolu nakli, genişlik/rezerv/taktik/zırh/delme ve süreli geri çekilme. |
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
