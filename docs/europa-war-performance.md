# Europa War donma düzeltmesi — 23 Ekim 2026

Bu çalışma tekrarlayan donmaları hedefler. Harita, şehir sınırları, grup emirleri,
oyun kuralları ve kayıt biçimi korunur.

## Kalan kısa takılmalar için ek düzeltme

Karşılaştırma tabanı `8dd7873`. Sonraki incelemede kamera kesinleşirken
`clientWidth/clientHeight` okumalarının bütün SVG yerleşimini eşzamanlı
hesaplattığı görüldü. Boyutlar artık yalnızca `ResizeObserver` bildiriminden
alınır. İki parmak hareketinde ve aynı tekerlek hareketi içinde ekran konumu
tekrar ölçülmez; yeni hareket, kaydırma ve boyut değişimi ölçümü yeniler.

- Küçük haritanın 447 vektör bölgesi yerel Canvas ile tek PNG'ye çizilir.
  Oyuncu/düşman/müttefik/nötr renkleri aynı kaldığında gün veya kamera değişimi
  bu görseli yeniden üretmez. Bölge kontrolü ve diplomasi renkleri günceller.
  Yalnızca son görsel tutulur; Canvas kullanılamazsa vektör yedeği gösterilir.
- Şehir ve ülke sınırlarının kalınlığı kamera ölçeğiyle hesaplanır. Böylece
  tarayıcı her harekette binlerce köşe için `non-scaling-stroke` hesabı yapmaz.
  Klavyeyle odaklanan tek şehir, her yakınlıkta 3 piksel konturunu korur.
- Ülke etiketleri için şehirler tek geçişte gruplanır; birlik gruplarının
  konumları önceki grupları tekrar tekrar taramaz. Türkçe tarih biçimlendiricisi
  her çağrıda yeniden oluşturulmaz.
- Yavaş cihazdaki aralıklı tekerlek olayları 450 ms durulma aralığıyla
  birleştirilir. Görüntü ilk olayda hareket eder; bu süre yalnızca ağır SVG
  yenilemesinin zamanıdır. Görünür alan hazırlanan sınırı aşarsa geometri yine
  hemen yenilenir. Basılı parmak hareketi zamanlayıcıyla sonlandırılmaz.
- Worker kabul edilen son dünya durumunu tutar. Art arda günler yalnızca
  işlem kimliği ve revizyon gönderir; her gün bütün dünyayı ana iş parçacığında
  kopyalama kaldırılmıştır. Emir, yükleme, duraklat/devam veya worker'ın yeniden
  başlaması tam eşitleme gerektirir. Worker'dan dönen dünya hâlâ tamdır; eski
  sonuçları reddetme ve tek bekleyen gün kuralı korunur.

Bu değişiklikler şehir sınırlarını, seçimi, birlikleri, emirleri veya oyun
kurallarını azaltmaz. Ölçüm sırasında başka derleme ve tarayıcı testleri
çalıştırılmaz. Telefon testleri Chromium emülasyonudur; fiziksel cihaz veya
60 FPS doğrulaması değildir.

Doğrulama: **190/190 otomatik test**, üretim derlemesi ve TypeScript kontrolü
başarılı. **50 tarayıcı kontrolü** geçti: 18 kamera/etkileşim, 18 genel oyun,
6 toplu emir, 8 worker/çevrimdışı. Ekran boyutu ve telefon yönü değiştikten
sonra yakınlaştırma referansının sapması 2 CSS pikselin altında kaldı.
Küçük harita önbelleği gerçek rasterizasyon sayacıyla, klavye konturu üç
yakınlaştırma seviyesinde doğrulandı. Sayfa ve konsol hatası görülmedi;
masaüstü/telefon oyun görüntüleri incelendi. Son üretim paketinin kimliği
`m_jmYQEaEfmvdUarRN2lk`. Gerçek worker testi, veri gönderilmeden ilerleyen
ardışık günlerin `advanceDay` sonucuyla birebir eşitliğini ve farklı seferin
yeniden eşitlenmesini de doğrular.

Gün ilerlerken 2.000 tümenle kaydırmayı yeniden ölçmek için
`EUROPA_PHASES=running-pan` kullanılabilir. Bu faz gerçek sürükleme/dokunma
girdileri verir; başlatma, her sürükleme ve duraklatma süresini ayrı kaydeder.

Son ölçüm, Linux Chromium'da 4× CPU yavaşlatmayla 1440×1000 masaüstü ve
390×844, 2× piksel yoğunluklu telefon emülasyonunda yapıldı. 2.000 tümenle
oyun ilerlerken üç kaydırma boyunca gönderimler şöyleydi:

| Görünüm | Worker'a gönderim | Toplam gönderim süresi | İlk tam gönderimden sonraki toplam |
| --- | --- | --- | --- |
| Masaüstü | 1 tam dünya + 18 devam isteği | 26,8 ms | 5,8 ms |
| Telefon | 1 tam dünya + 11 devam isteği | 29,2 ms | 3,2 ms |

Bu ölçüm yalnızca ana iş parçacığından worker'a gönderimi kapsar. Geri dönen
verinin alınması ve arayüzün çizilmesi ayrıca iş yapar. Örnekler sırasıyla
19 ve 12 gün ilerledi; farklı uzunluktaki örneklerden FPS artışı çıkarılmaz.

Kamera ölçümleri aynı yönde iyileşmedi. Aşağıdaki değerler `8dd7873` ile son
paketin iz kaydı açık koşularındaki **en uzun ana iş parçacığı görevidir**:

| Hareket | Masaüstü önce → sonra | Telefon önce → sonra |
| --- | --- | --- |
| Fareyle kaydırma | 121 → 235 ms | 170 → 61 ms |
| Dokunarak kaydırma | 94 → 186 ms | 116 → 190 ms |
| Tekerlekle yakınlaştırma | 144 → 368 ms | 75 → 249 ms |
| İki parmakla yakınlaştırma | 368 → 88 ms | 84 → 175 ms |
| Küçük haritadan gezinme | 458 → 162 ms | 650 → 140 ms |

Son masaüstü paketinin ısınma beklemeli, iz kaydı kapalı tekrarında bu beş
değer sırasıyla 130, 186, 110, 110 ve 200 ms oldu. Bu tekrar farklı başlangıç
koşulları nedeniyle doğrudan eski paket karşılaştırması değildir. Sonuçlar
değişkendir ve bazı hareketlerde gerileme vardır; bütün kaydırmaların
hızlandığı veya donmanın tamamen giderildiği doğrulanmamıştır. Tekerlek fazı,
450 ms kesinleştirme ve 250 ms katman bırakma işlemlerini ölçüm dışında
bırakmamak için son girdiden sonra 800 ms gözlenir.

Ham karşılaştırma: çalışma ortamında
`/workspace/scratch/europa-microstalls/comparison.json`. Genel oyun ve toplu
emir kontrolleri bu çalışmanın önceki paketinde geçti; son kamera ve worker
değişikliklerinden sonra 18 etkileşim ve 8 worker/çevrimdışı kontrolü tekrar
çalıştırıldı.

## Değişiklikler

- Günlük ekonomi, AI ve muharebe hesabı gerçek bir Web Worker içinde çalışır.
  Aynı anda yalnızca bir gün hesaplanır; yavaş cihazda bekleyen günler birikmez.
  1–5× hız hedef hızdır, cihazın yetişemediği günler arayüzü kilitleyerek
  telafi edilmez.
- Emir verme, duraklatma, kayıt yükleme veya yeni sefere geçiş önceki hesabı
  geçersiz kılar. Eski worker sonucu yeni emri/kaydı ezemez. Worker hatasında
  saat durur ve mevcut sefer korunur; ağır hesap ana iş parçacığına taşınmaz.
- Bir konumdaki tümenler ikmal hesabını paylaşır; general ve destek bonusları
  ayrı uygulanır. AI aynı tur içinde savunma, sınır ve rota verilerini tekrar
  kullanır. Ticaret araması yalnızca bulunan yolu oluşturur.
- Sabit arazi dokuları, aynı vektör kaynağından oluşturulan şeffaf 2640×1760
  WebP katmanında tutulur (1.395.080 bayt). Ülke renkleri, şehir sınırları,
  işgal taraması, birlikler, seçim ve emir çizgileri canlı kalır. Türkiye
  görünümündeki SVG öğeleri **3.402 → 1.503** oldu.
- Çevrimdışı paket artık worker girişini, bağımlı kod parçalarını ve arazi
  görselini de içerir. Eksik güncelleme hazır sayılmaz; önceki tamamlanmış
  paket yeni paket tamamlanana kadar korunur. Worker, oyunun service worker
  kapsamındaki bir başlangıç adresinden yüklenir; böylece tarayıcının normal
  HTTP önbelleği boşken de çevrimdışı sefer ilerleyebilir. Bu paketleme kuralı
  yalnızca Europa War'a uygulanır.

Arazi kaynağı: `scripts/europa-war/terrain-source.tsx`. Harita veya doku
kaynağı değişirse `node scripts/europa-war/render-terrain.cjs` çalıştırılıp
üretilen görsel ve `strategy/map-assets.json` birlikte sürümlenmelidir.

## Hesaplama ölçümü

Aynı kayıt, tohum ve 180 günlük ilerleme, Node 24. Süreler tek günlük motor
hesabıdır; FPS veya tüm arayüz süresi değildir.

| Senaryo                            | Ortanca önce → sonra | %95 dilimi önce → sonra |
| ---------------------------------- | -------------------- | ----------------------- |
| İleri oyun, 489 başlangıç tümeni   | 29,28 → 20,41 ms     | 53,55 → 29,92 ms        |
| Büyük ordu, 1.956 başlangıç tümeni | 78,74 → 27,69 ms     | 185,69 → 55,22 ms       |

390 günlük tam dünya durumu ve 2.706 ticaret yolu önceki sürümle birebir
karşılaştırıldı; sonuçlar aynı kaldı.

## Tarayıcı ölçümü

Üretim derlemesi, Chromium, 1440×1000 görünüm. Uzun görev, ana iş parçacığını
50 ms'den fazla meşgul eden işlemdir. CDP ile 4× CPU yavaşlatmada 4 saniyelik
5× oyun hızı örneği (başlatma/durdurma dahil gerçek süre daha uzundur):

| Senaryo          | Uzun görev ortancası önce → sonra | En uzun görev önce → sonra |
| ---------------- | --------------------------------- | -------------------------- |
| Başlangıç seferi | 107 → 52 ms                       | 627 → 72 ms                |
| 2.000 tümen      | 373 → 88 ms                       | 584 → 120 ms               |

Başlangıçta 35 → 5 uzun görev, yoğun orduda 17 → 18 uzun görev görüldü;
özellikle görev süreleri kısaldı. Örnek boyunca başlangıç seferi 18 → 17 gün,
yoğun ordu 14 → 13 gün ilerledi. Yeni zamanlayıcı hesap bitmesini bekler.

İz kaydı açıkken 30 harita kaydırmasının ortanca iki-kare bekleme süresi
117,8 → 53,3 ms, toplam Paint süresi 158,1 → 68,6 ms oldu. Bu ölçüm FPS değildir.
İlk izsiz tekrar yeni sürümde 82,9 ms kaydırma ve başlangıç oyununda 431 ms'ye
kadar uzun görev gösterdi; sonraki izli tekrarda başlangıçta uzun görev yoktu.
Bu değişkenlik nedeniyle her cihazda donmanın tamamen bittiği veya 60 FPS
sağlandığı iddia edilmez. Yoğun ordu ve yavaşlatılmış CPU sonuçları asıl
karşılaştırmadır.

## İlk düzeltmenin doğrulaması (`d625982`)

İlk düzeltmede 129 motor/oyun kuralı, 20 simülasyon ve 24 çevrimdışı test
başarılı oldu (173 farklı test). Tam paket koşusu 171/171 geçti; ardından
eklenen iki worker adresi regresyonuyla ilgili simülasyon ve çevrimdışı
paketler yeniden derlenip çalıştırıldı. Üretim derlemesi ve TypeScript
kontrolü geçti.

Üretim paketinde 18 oyun ekranı, 6 toplu emir ve 8 worker/çevrimdışı tarayıcı
kontrolü geçti; sayfa hatası oluşmadı. Son paket ayrıca eski service worker
ve önbellekten güncellendi, farklı bir sunucu adresinin arkasından açıldı,
HTTP önbelleği temizlenip bağlantı kesildi: yeni sayfada simülasyon günü
ilerledi. Ayrı bir çevrimdışı kontrolde kayıtlı sefer de devam etti.
Harita görseli gerçek oyun ekranında incelendi.

```sh
npm run test:europa
npm run build
npm start
# Playwright ve Chromium bulunan ortamda, sırayla:
node scripts/test-europa-browser.cjs
node scripts/test-europa-group-browser.cjs
node scripts/test-europa-worker-browser.cjs
node scripts/test-europa-responsiveness.cjs
EUROPA_CPU_RATE=4 EUROPA_DURATION_MS=4000 EUROPA_PHASES=initial,large node scripts/test-europa-responsiveness.cjs
```

Performans ölçerken başka derleme/test/Chromium süreci çalıştırılmamalıdır.
Worker ve çevrimdışı hata testleri gerçek üretim paketiyle tekrar doğrulanır.

## İkinci inceleme: harita kaydırma ve yoğun arayüz

Karşılaştırma tabanı `d625982`, ayrı bir dizinde yeniden üretilmiş üretim
paketidir. Son paket aynı Chromium sürümünde, başka derleme veya tarayıcı
testi çalışmazken ölçüldü. CDP ile 4× CPU yavaşlatma kullanıldı; masaüstü
görünümü 1440×1000, telefon emülasyonu 390×844 ve 2× piksel yoğunluğudur.
Bu, fiziksel Windows bilgisayarı veya telefon üzerinde yapılmış ölçüm değildir.

Harita sürüklenirken React ağacını her harekette yeniden çizmek yerine,
kamera animasyon karesinde CSS dönüşümüyle ilerler. Görünen alanın çevresi
önceden hazırlanır; kenara yaklaşınca veya hareket bitince geometri yenilenir.
Grafik katmanı aynı hareket içinde tekrar tekrar kurulmaz. Basılı parmak
varken 120 ms zamanlayıcısı haritayı yeniden çizmez; son parmak bırakılınca
kamera kesinleştirilir. Fare düğmesine basıldığında bütün SVG'ye yayılan
imleç değişikliği de kaldırıldı.

Aşağıdaki toplamlar bir hareket dizisi boyunca ana iş parçacığındaki
`TaskDuration` değeridir. Sürükleme 30 hareket, iki parmak yakınlaştırma
12 adımdır; bekleme, giriş iletimi ve doğrulama nedeniyle bunlar kare süresi
veya FPS değildir. Uzun görev sınırı 50 ms'dir.

| Senaryo | Toplam ana iş süresi önce → sonra | Uzun görev sayısı | En uzun görev önce → sonra |
| --- | --- | --- | --- |
| Masaüstü, fareyle sürükleme | 3.905 → 1.440 ms | 19 → 4 | 129 → 121 ms |
| Masaüstü, tekerlekle yakınlaştırma | 1.722 → 1.449 ms | 9 → 7 | 152 → 144 ms |
| Masaüstü, iki parmak yakınlaştırma | 2.017 → 2.177 ms | 12 → 11 | 131 → 368 ms |
| Telefon görünümü, tek parmakla sürükleme | 2.034 → 825 ms | 4 → 2 | 121 → 116 ms |
| Telefon görünümü, iki parmak yakınlaştırma | 1.525 → 612 ms | 13 → 2 | 179 → 84 ms |
| Telefon görünümü, tekerlek girdisi | 865 → 683 ms | 4 → 3 | 60 → 75 ms |

Fareyle sürüklemede toplam ana iş yaklaşık %63, telefon görünümündeki
tek parmakla sürüklemede %59 azaldı. Her etkileşim aynı ölçüde iyileşmedi:
masaüstü iki parmak örneği toplamda daha yavaştı. Küçük haritada konum
değiştirme kontrolünde masaüstünde 458 ms, telefon görünümünde 650 ms tekil
görev görüldü. Önceki denemeler ve son paket arasında da dalgalanma vardı.
Bu sonuçlar tüm donmaların bittiği veya 60 FPS sağlandığı anlamına gelmez.

Kameranın çevresini hazır tutmanın bellek maliyeti vardır. Aynı sürüklemenin
sonunda canlı SVG öğeleri masaüstünde 1.729 → 2.804, telefon görünümünde
1.337 → 2.077 oldu. Son kamera örneklerinde JavaScript heap anlık değerleri
yaklaşık 8–23 MiB aralığındaydı. Bunlar çöp toplama zamanına bağlıdır;
en yüksek bellek kullanımı veya GPU belleği olarak yorumlanmamalıdır.

1.200 oyuncu tümeni ve beş büyük kayıtla arayüz ayrıca ölçüldü. İki birlik
listesi arama ve 40'ar satırlık sayfalarla bütün birliklere erişimi korur;
"Tüm tümenleri seç" 1.200 birliğin tamamını seçer. Kayıt özetleri değişmeyen
kayıtları tekrar çözmez, kayıt listesi her oyun günü yerine kayıt değişince
yenilenir.

| Arayüz işlemi | En uzun görev önce → sonra |
| --- | --- |
| Ordu sekmesini açma | 2.377 → 183 ms |
| 1.200 tümenin tamamını seçme | 3.543 → 220 ms |
| Beş kayıt varken zamanı ilerletme | 608 → 91 ms |
| Yönetim sekmeleri arasında geçiş | 3.476 → 108 ms |

Ordu ekranında 2.400 seçim kutusu yerine 80 kutu, toplam 14.183 yerine
3.706 DOM öğesi oluşturuldu. Kayıt ekranında 5,5 saniyelik çalışma isteği
sırasında JSON çözme 49 çağrı / 1.012 ms'den, otomatik kayıtlarla ilişkili
2 çağrı / 30 ms'ye indi; sefer 10 yerine 20 gün ilerledi. Başlatma/durdurma
ile birlikte ölçülen süre iki pakette de yaklaşık 6,6 saniyedir.

Son üretim paketinde gerçek fare ve CDP dokunma girdileriyle sürükleme yönü,
tekerlek altında dünya noktasının korunması, iki parmak yakınlaştırma,
küçük haritada tıklama/klavye, tüm birlikleri seçme ve beş kayıt yuvasıyla
zamanın ilerlemesi doğrulandı. Sayfa hatası oluşmadı. Performans betiği
ana iş parçacığı izini, CPU profilini, uzun görevleri ve bellek anlık
değerlerini seçilen çıktı dizinine yazar.

İkinci turda motor, simülasyon, çevrimdışı paket ve kayıt testleri birlikte
**183/183** geçti. Genel oyun, toplu birlik, worker ve yeni harita/liste
etkileşim paketlerinde **45 tarayıcı kontrol grubu** geçti. Son basılı-parmak
düzeltmesinden sonra ilgili 13 etkileşim grubu yeniden doğrulandı.

```sh
EUROPA_CPU_RATE=4 EUROPA_PROFILE=1 EUROPA_PHASES=pan,camera EUROPA_ARTIFACT_DIR=/tmp/europa-desktop node scripts/test-europa-responsiveness.cjs
EUROPA_CPU_RATE=4 EUROPA_MOBILE=1 EUROPA_PROFILE=1 EUROPA_PHASES=camera EUROPA_ARTIFACT_DIR=/tmp/europa-mobile node scripts/test-europa-responsiveness.cjs
EUROPA_CPU_RATE=4 EUROPA_INSTRUMENT=1 EUROPA_PROFILE=1 EUROPA_DURATION_MS=5500 EUROPA_PHASES=army,saves EUROPA_ARTIFACT_DIR=/tmp/europa-large-ui node scripts/test-europa-responsiveness.cjs
```
