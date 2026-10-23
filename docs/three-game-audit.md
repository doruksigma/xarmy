# Üç oyun denetimi — 23 Ekim 2026

Bu çalışma Satranç, Battle Royale ve Europa War'ın mevcut uygulamalarını
denetler. Özellikle telefon ve Windows'ta Europa War haritasını kaydırırken
bildirilen takılmalar araştırılmıştır. Önceki geniş özellik listelerinin
tamamının uygulanmış olduğu veya her cihazda sorunsuz çalıştığı iddia edilmez.

## Europa War

- Harita hareketi, her fare/dokunma olayında bütün SVG ağacını yeniden
  oluşturmadan işlenir. Kamera durunca veya hazır geometri sınırına yaklaşınca
  görünür bölgeler güncellenir. Yakındaki bölgeler önceden çizilir; şehir
  sınırları, birlikler ve emirler korunur.
- İki ayrı birlik listesinde sayfa başına 40 satır gösterilir. Arama ve
  sayfalar arasında seçim korunur; tüm orduyu seçmek ve toplu emir vermek
  yalnızca görünen sayfayla sınırlı değildir.
- Kayıt özetleri her oyun gününde yeniden okunmaz. Başarılı kayıt ve diğer
  sekmelerden gelen değişiklikler ekranı yeniler. Değişmeyen kayıt özetleri
  önbellekten gelir; kayıt yükleme ve içe aktarma tam doğrulama yapmaya devam
  eder.
- Uygun bombardıman uçağı veya denizaltı bulunmayan bazı emirler yanlışlıkla
  başarılı sayılıyordu; artık reddedilir. İkmalsizlik kayıpları savaş
  tecrübesi kazandırmaz.

Motor, kayıt, simülasyon ve çevrimdışı paket kontrolleri: **183/183 geçti**.
Üretim tarayıcı kontrolleri: **45 grup geçti** (18 genel oyun, 6 toplu birlik,
8 worker/çevrimdışı, 13 kamera ve liste etkileşimi). Son kamera değişikliğinden
sonra ilgili 13 grup yeniden geçti; sayfa ve konsol hatası yoktu. Masaüstü
sürükleme/tekerlek, telefon boyutunda tek parmak/pinch, hareket sırasında
harita kapsamı, doğru şehir seçimi ve 96 tümenin tamamına gerçek hareket ve
taarruz emri verilmesi doğrulandı.
Kural denetimi ve sınırlar: [Europa raporu](europa-rule-audit-round2.md).
Ölçüm yöntemi ve sonuçlar: [Performans raporu](europa-war-performance.md).

## Satranç

**95/95 otomatik test ve 7/7 gerçek tarayıcı kontrol grubu geçti.**
Üç bot seviyesi, güçlü eğitmen, maç sonu analiz/tekrar, mobil görünüm,
çıkış ve iki oturumla oda/renk kurası/mat akışı sınandı. Bu denetimde
başarısız satranç mekaniği bulunmadığı için oyun kodu değiştirilmedi.

Oda akışı yerel sunucuda sınandı. Vercel'deki gerçek Upstash bağlantısı bu
ortamdan doğrulanmadı. Ayrıntılar: [Satranç raporu](chess-audit.md).

## Battle Royale

Duraklatılmış sahnenin gereksiz çizimi, uçuşta arka plana geçince oyunun
devam etmesi, botların alamayacakları eşyaları takip etmesi ve yüksekten
düşerken paraşütün tekrar kapanması düzeltildi. Flaş bombasının botlara
duvar arkasından etki etmesi ve oyuncunun kendi elenmesinin öldürme sayısına
eklenmesi de düzeltildi.

Motor testleri **21/21**, gerçek WebGL tarayıcı denetimi **6/6 grup**, ayrı
hızlandırılmış maç bitişi/yeniden başlatma denetimi **1/1 grup** geçti.
Tarayıcı sayfa hatası oluşmadı. Mekanik bazında otomatik test, tarayıcı
kontrolü ve yalnızca kaynak incelemesi ayrımı
[Battle Royale raporunda](battle-audit.md) belirtilmiştir.

## Tekrarlanabilir kontroller

```sh
npm run test:chess
npm run test:battle
npm run test:europa
npm run build
npm start
# Playwright ve Chromium kurulu ortamda, sırayla:
node scripts/test-chess-browser.cjs
node scripts/test-europa-browser.cjs
node scripts/test-europa-group-browser.cjs
node scripts/test-europa-worker-browser.cjs
node scripts/test-europa-interactions.cjs
node scripts/test-battle-browser.cjs
BATTLE_LIFECYCLE_ONLY=1 node scripts/test-battle-browser.cjs
```

Performans profilleri ayrı, başka derleme/test/tarayıcı yükü olmadan alınır.
Telefon boyutu ve CPU yavaşlatması gerçek telefon donanımının yerine geçmez;
cihaza bağlı kalan takılmalar ve 60 FPS hedefi ayrıca ölçülmelidir.
