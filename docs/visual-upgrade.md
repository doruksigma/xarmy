# Oyun görünümü ve kullanım güncellemesi — 31 Ekim 2026

Bu sürüm dört mevcut oyuna ve oyun seçme ekranına odaklanır. Sınırsız özellik
listesinin veya AAA bir konsol oyununun tamamlandığı iddiası değildir. Var olan
savaş, satranç, kayıt ve çok oyunculu kuralları korunarak aşağıdaki işlevler eklenir.

## Tamamlanan değişiklikler

- Ana sayfa: dört oyuna doğrudan giriş sağlayan, özgün SVG çizimli oyun kartları;
  telefonlarda açılabilen gezinme menüsü. Kart çizimleri oyun içi ekran görüntüsü
  olarak sunulmaz. Ana sayfa bir 3D sahne yüklemez.
- [Battle Royale](battle-visual-upgrade.md): paylaşılan tabela dokuları, cephe
  geometrisi, asfalt/metal yüzey ayrıntıları, kalite ve mesafeye göre azaltılan
  eğrelti otları, taşlar ve kıyı bitkileri.
- [Color Hide](color-hide-visuals.md): yüzey dokuları, gökyüzü/bulutlar, bina ve
  karakter ayrıntıları. Oyun içi **Ayarlar** penceresinde görüntü kalitesi,
  kamera, ses ve bakış hassasiyeti seçilir; tercihler cihazda saklanır. Pencere
  açıkken karakter hareket etmez, çevrim içi tur ve sayaç devam eder. Esc ile
  kapanır; klavye odağı pencere içinde kalır. Mevcut üç harita korunur.
- [Europa War](europa-visual-upgrade.md): arazi ve birlik durumu görünüm
  seçenekleri, seçili tümenlere odaklanma, güç/organizasyon çubukları ve gerçek
  emirlerden hesaplanan ilerleme/çatışma göstergeleri. Başkentler ve seçilen
  şehir dışındaki şehir adları açılmaz.
- Satranç: **Tahta görünümü** penceresinde Zümrüt/Ceviz/Gece temaları, kare
  koordinatları ve taş animasyonu seçimi. Tercihler cihazda saklanır. Cihazın
  hareketi azaltma tercihi dikkate alınır; analiz sırasında taş animasyonu
  kapalı kalır ve tahta boyutu değişmez.

## Doğrulama

- Satranç: 95/95; Battle Royale: 21/21; Europa War: 257/257;
  Color Hide motor/harita/gerçek WebSocket: 39/39. Toplam **412 test başarılı**.
- TypeScript, Next.js üretim derlemesi ve bağımsız WebSocket sunucusu derlemesi
  başarılı. Sunucu adresi Vercel'deki mevcut ortam değişkeninden alınır;
  yerel test adresi kaynak koda gömülmez.
- Tarayıcı doğrulama betiği: `scripts/test-visual-upgrade-browser.cjs`.
  Gerçek Chromium, Three.js/WebGL ve iki bağımsız WebSocket istemcisi kullanır;
  oyun zamanı, konumları ve çizim motoru taklit edilmez.
- Ayrı tarayıcı koşularında dört oyun bağlantısı, mobil menü, satranç tema ve
  koordinat/animasyon kalıcılığı, tahta geometrisinin sabit kalması, azaltılmış
  hareket desteği, Europa katmanları/ordu odağı ve Battle kalite geçişleri
  doğrulandı. Color Hide ayarları ve odadan çıkış ayrıca yeniden kontrol edildi;
  ayarlar sayfa yenileme ve odaya geri bağlanmada korundu.
- Gerçek uçaktan atlama, paraşütle iniş, yerde hareket ve yüksek kalite çizimi;
  mobil Europa haritasında panel kapalıyken katman düğmelerinin kullanımı
  ayrıca geçti. Bu odaklı koşulda tarayıcı veya shader hatası görülmedi.
- Color Hide son maç döngüsü: **5/5** odaklı kontrol geçti. Normal 60 saniye
  saklanma sonrasında gerçek nişan/atışla yakalama, zafer, fare kilidinin
  bırakılması, tekrar oynama, şehir/okul oylaması ve odadan ayrılma doğrulandı.
  Tarayıcı ve shader hatası yok. Orman, şehir, okul, tahta, harita ve galerinin
  gerçek çizimlerinden ekran görüntüleri incelendi.

Yazılımsal WebGL ve dokunmatik tarayıcı emülasyonu fiziksel Windows/telefon
donanımındaki FPS ölçümü değildir. 60 FPS veya başka bir oyundan belirli bir
kat daha iyi grafik garantisi verilmez. Fotogrametri, hareket yakalama, lisanslı
AAA model paketleri veya yeni ray tracing altyapısı bu sürümde eklenmemiştir.

## Tekrar çalıştırma

```sh
npm run test:chess
npm run test:battle
npm run test:europa
npm run test:color-hide
npm run color-hide:build
NEXT_PUBLIC_COLOR_HIDE_SERVER_URL=ws://127.0.0.1:3001 npm run build
```

Yerel üretim istemcisini `npm start`, oda sunucusunu `npm run color-hide:server`
ile ayrı terminallerde başlatın. Playwright/Chromium kurulu ortamda tarayıcı
betiğini çalıştırın. Canlı dağıtımda `wss://` sunucu adresi kullanılır;
[barındırma rehberi](color-hide-server.md) geçerlidir.

Odaklı tekrarlar:

```sh
VISUAL_COLOR_ONLY=1 node scripts/test-visual-upgrade-browser.cjs
VISUAL_SCENERY_ONLY=1 node scripts/test-visual-upgrade-browser.cjs
COLOR_HIDE_END_ONLY=1 node scripts/test-color-hide-browser.cjs
```
