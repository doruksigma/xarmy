# Europa War donma düzeltmesi — 23 Ekim 2026

Bu çalışma tekrarlayan donmaları hedefler. Harita, şehir sınırları, grup emirleri,
oyun kuralları ve kayıt biçimi korunur.

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

## Yeniden doğrulama

Son doğrulamada 129 motor/oyun kuralı, 20 simülasyon ve 24 çevrimdışı test
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
