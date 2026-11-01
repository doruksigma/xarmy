# Satranç motoru başlatma ve dağıtım denetimi — 1 Kasım 2026

## Tekrarlanan dağıtım hatası

Bot ve eğitmen aynı yerel Stockfish 17.1 WASM motorunu kullanır. Motorun
`public/stockfish/engine/` dizini Git'e eklenmez; kilit dosyasındaki npm
dağıtımından üretilir. Önceden bunu yalnızca npm `predev` ve `prebuild`
kancaları yapıyordu. Temiz bir kopyada doğrudan `next build` çalıştıran bir
barındırma ayarı bu kancaları atlayabiliyordu. Next yapılandırması başarıyla
yüklendiği halde motor dosyaları oluşmuyordu. Böyle bir dağıtımda hem bot hem
analiz motoru eksik dosyalarla karşılaşır.

Bu eksik üretim yolu, gerçek Next yapılandırma yükleyicisiyle geçici, temiz
proje dizinlerinde tekrarlandı. Canlı sitenin hatasının aynı nedenden
kaynaklandığı ayrıca doğrulanmış değildir.

## Değişiklik

Etkin `next.config.js`, motor hazırlığını doğrudan çağırır. Böylece npm
kancalarına ek olarak Next build/dev/start yapılandırmasının yüklenmesi de
dosyaları hazırlar. Europa War'ın özel worker derleme kuralı korunur.

Hazırlık kodu:

- Kurulu paketin beklenen 17.1.0 sürümü olduğunu kontrol eder.
- Tek iş parçacıklı lite JS dosyasını ve aynı paket adını taşıyan WASM eşini
  birlikte seçer; tüm kaynak dosyaları mevcut olmadan yayımlamaya başlamaz.
- Boş dosyaları ve geçersiz WASM başlığını reddeder.
- Hedefteki dosyaları kaynakla byte byte karşılaştırır; doğru dosyaları
  yeniden yazmaz, eksik veya eski dosyaları yeniler.
- Her dosyayı geçici bir dosyadan atomik yeniden adlandırmayla yayımlar;
  tekrarlanan yapılandırma yüklemeleri yarım yazılmış dosya oluşturmaz.
- GPL lisansı, yazar listesi, mevcut kaynak bağlantıları ve sunulan
  `/stockfish/engine/stockfish.js` ile `.wasm` adreslerini korur.

## Yavaş bağlantıda tekrar üretilen başlatma hatası

Önbelleği boş mobil Chromium oturumunda gerçek üretim motorunun ağ hızı
75 KiB/sn ile sınırlandı. CDP ağı yalnızca sayfada değil, iç içe çalışan bot ve
Stockfish işçilerinde de sınırlar; motor dosyası veya hamle sonucu taklit edilmez.
Önceki sürümde JS ve WASM istekleri HTTP 200 dönmesine rağmen yaklaşık 7 MB'lık
WASM indirmesi bitmeden, 60,6 saniyede başlatma hatası oluştu. Bot sıfır hamlede
kaldı. Aynı motor, bağlantı sınırı olmadan bot ve analiz sonuçları üretebiliyordu.

Motor indirme/başlatma sınırı artık 240 saniye. Arayüz işçisinin başlatma sınırı
255 saniye; böylece iç motorun hatayı bildirmesine de zaman kalır. İşçiler motor
hazır olduğunda isteğe özel bir durum mesajı gönderir. Ancak bu mesajdan sonra
mevcut hamle/öneri hesaplama sınırı başlar. Maç analizinin ilk hamlesi ve sonraki
hamleleri için mevcut ayrı sınırlar korunur. Başlatma süresini uzatmak botun
düşünme süresini veya gücünü değiştirmez.

Bot, eğitmen ve maç analizi yükleme sırasında “Satranç motoru hazırlanıyor…”
yazar. Eski isteklere ait veya tekrarlanan durum mesajları zaman aşımını
uzatamaz. Hata, iptal, mod değişimi ve kapanışta zamanlayıcılar ve çalışan
işçiler temizlenir. Hiç yüklenmeyen motor hâlâ süre sonunda hata verir;
kullanıcı yeniden deneyebilir.

## Kontroller

```sh
node --test scripts/prepare-stockfish.test.cjs
npm run prepare:stockfish
npm run test:chess
```

Beş regresyon kontrolü düzeltmeden önce başarısız, düzeltmeden sonra başarılı:

1. Temiz dizinde doğrudan Next production build yapılandırması dosyaları üretir.
2. Temiz dizinde Next development yapılandırması dosyaları üretir.
3. Temiz dizinde Next production start yapılandırması dosyaları üretir.
4. Tekrar yükleme dosya zamanlarını değiştirmez; eski JS ve kayıp WASM onarılır.
5. Eksik kurulu dağıtım sessizce geçmez ve kısmi motor paketi oluşturmaz.

Bu testler npm kancalarını çağırmadan Next'in gerçek yapılandırma yükleyicisini
kullanır. Üretim dosyalarını silmez, geçici dizinlerini temizler ve Europa'nın
worker derleme kuralının korunduğunu da denetler.

Motor yaşam döngüsü testleri, eski 60/75 saniye sınırlarından sonra tamamlanan
bir indirmeyle hem hamle hem analiz üretimini, hiç hazır olmayan motorun süre
sonunda reddedilmesini, indirme sırasında iptali ve takılan hesaplamanın eski
kısa sınırla durdurulmasını ayrıca denetler.

Yeni üretim derlemesinin sonuçları:

- `npm run test:chess`: **104/104** başarılı.
- Npm hazırlık kancası olmadan doğrudan `next build`: başarılı; tüm uygulamanın
  tip kontrolü ve üretim paketlemesi tamamlandı.
- Üretim Chromium testleri: **7/7** temel oyun/analiz/online oda akışı ve
  **4/4** indirme hatası, tekrar deneme ve yükleme sırasında çıkış kontrolü.
- 390×844 dokunmatik mobil tarayıcı emülasyonu: **5/5** gerçek bot, eğitmen ve
  maç analizi akışı başarılı. Bu, fiziksel telefon donanım testi değildir.
- Aynı 75 KiB/sn ağ sınırıyla üç ayrı soğuk başlangıç: **3/3** başarılı.
  Gerçek WASM transferleri 73,3–73,8 saniye sürdü. Bot yasal hamle yaptı;
  eğitmen yaklaşık 83,6 saniyede ölçülmüş öneri üretti; maç analizi tamamlandı.
  Üçünde de hazırlık ve hesaplama aşamaları görüldü; tarayıcı hatası oluşmadı.

Yerel üretim sunucusu açıkken, Playwright ve Chromium bulunan bir ortamda:

```sh
node scripts/test-chess-browser.cjs
node scripts/test-chess-slow-browser.cjs
```

Yavaş bağlantı testi gerçek dosyaları indirir; her senaryo yaklaşık iki dakika
sürer. `CHESS_SLOW_CASES=bot`, `coach` veya `review` tek senaryo seçer.
`CHESS_ARTIFACT_DIR` rapor ve ekran görüntüsü dizinini belirler.

Mevcut yerel üretim sürümünde gerçek Chromium işçileriyle ayrıca doğrulandı:

- Ham Stockfish işçisi `uciok` ve `readyok` gönderip yasal `d2d4` hamlesini üretti.
- Next'in derlediği bot işçisi aynı başlangıç konumunda yasal hamle üretti.
- Next'in derlediği eğitmen işçisi `e4` önerisini, değerlendirmesini, hamle
  dizisini ve Türkçe açıklamasını üretti.
- Bu üç kontrolde tarayıcı sayfa hatası oluşmadı.

Bu sonuçlar bütün cihazların performansını veya canlı dağıtımın güncel
durumunu garanti etmez. Canlı siteye düzeltmenin yansıması için yeni bir
dağıtım gerekir; bu değişiklik kendi başına canlı dağıtım yapmaz.
