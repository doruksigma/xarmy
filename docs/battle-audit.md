# Battle Royale işlev denetimi — 23 Ekim 2026

Kapsam: `/play`, `app/play/battle/*`, masaüstü ve dokunmatik oyun arayüzü.
Bu rapor mevcut mekanikleri denetler; önceki AAA görsel hedeflerinin tamamının
uygulandığı anlamına gelmez. Ayrıntılı özellik ve sınırlar
[`battle-royale.md`](battle-royale.md) dosyasındadır.

## Düzeltilen sorunlar

- Duraklatılan oyun, her karede gölgeleri, su yansımasını ve görüntü efektlerini
  yeniden hesaplıyordu. Artık son görüntü korunur; kalite veya pencere boyutu
  değişince bir kez yeniden çizilir. Duraklatma değişikliği HUD'a hemen iletilir.
  Yinelenen render hedefi boyutlandırması da kaldırıldı.
- Sekme uçuş sırasında arka plana alınınca maç durmuyordu. Uçuş, paraşüt ve
  çatışma aşamaları artık odak kaybında durur; oyuncu kendisi devam eder.
- Botlar kendilerinin alamadığı dürbün/eklenti nesnelerini hedefleyip tekrar
  tekrar aynı yere dönebiliyordu. Oyuncuya ait anahtar ve eklentileri artık
  loot hedefi seçmezler; kullanabildikleri silah, mühimmat, zırh ve sağlık
  eşyalarını toplamaya devam ederler.
- Yüksekten düşüşte acil paraşüt açılması düşme hızını azaltıyor, fakat sonraki
  karede açılma koşulu bozulduğu için paraşüt kapanıyordu. Açılmış paraşüt iniş
  boyunca açık kalır, yere temas edince kapanır. Normal zıplama değişmez.
- Flaş bombası botlara duvarın arkasından etki edebiliyordu. Botlara da görüş
  hattı kontrolü eklendi; oyuncunun kontrolü ayak yerine göz yüksekliğini
  kullanır. Oyuncunun kendi bombasıyla elenmesi artık eleme sayısını artırmaz.
  Bu iki bomba düzeltmesi kaynak incelemesiyle doğrulandı; tam patlama senaryosu
  için doğrudan tarayıcı regresyonu henüz çalıştırılmadı.

## Mekanikler ve doğrulama kapsamı

| Sistem           | İncelenen davranış                                                                                       | Kanıt / sınır                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Silahlar         | Yedi ayrı hasar, hız, şarjör, menzil, saçılma ve doldurma profili; iki silah taşıma                      | Silah profilleri ve mühimmat korunumu motor testinde; ateş, doldurma ve ADS tarayıcı senaryosunda                        |
| Hasar            | Zırhın kalan payı, can kaybı, kafa vuruşu, menzil düşüşü, namlu/kamera engeli                            | Hasar hesabı motor testinde; ışın/hitbox ve engel yolları kaynak incelemesinde                                           |
| Bombalar         | El/sis/flaş; parçacık, alan hasarı ve sisin bot ateşini engellemesi                                      | Sis seçme/atma tarayıcı senaryosunda; tüm hedef ve engel birleşimleri tek tek görsel olarak sınanmadı                    |
| Loot             | Silah, mühimmat, zırh, sağlık, sandık, eklenti, anahtar, yardım paketi                                   | İniş teçhizatını alma tarayıcı senaryosunda; sandık/anahtar/airdrop yolları kaynak incelemesinde                         |
| Hareket          | Koşu, dayanıklılık, kayma, eğilme, sürünme, zıplama, engel aşma, omuz/kamera çarpışması                  | Kaynak incelemesi; kamera ve bütün arazi birleşimleri için kapsamlı donanım testi yapılmadı                              |
| Paraşüt          | Başlangıç uçuşu/iniş ve yüksek düşüşte acil açılma                                                       | Tarayıcı uçuş/iniş senaryosu; uzun düşüş ve normal zıplama motor regresyonları                                           |
| Araçlar          | SUV, motosiklet, buggy, gaz/fren/geri vites, çarpışma ve güvenli iniş                                    | Üç araç ve ince duvar çarpışması motor testinde; fizik kinematiktir                                                      |
| Zipline          | Yerden binme, iki yönlü taşıma, ayrılınca düşme                                                          | Motor testinde                                                                                                           |
| Botlar           | Dört zorluk, görüş açısı/menzili/engel, tepki, rakip seçimi, siper, takip/kaçış, loot, doldurma/iyileşme | Görüş, duvar, tepki, botlar arası çatışma, alan önceliği, yol bulma ve tüketilebilir eşyalar motor testinde              |
| Daralan alan     | Bekleme, kesintisiz küçülme, son kapanış ve dışarıda hasar                                               | Motor testinde                                                                                                           |
| Maç döngüsü      | Zafer/elenme, konum tekrarı, yeni maç, çıkış                                                             | Sonuç kuralı motor testinde; hızlandırılmış ayrı tarayıcı senaryosu doğal maç bitişi ve yeniden başlatmayı sınar         |
| Grafikler        | Low/Medium/High/Ultra, PBR, atmosfer, gölge, yansıma, görüntü efektleri                                  | Üretim WebGL senaryosu dört kaliteyi ve yeniden çizimi sınar; gerçek GPU'larda 60 FPS doğrulanmadı                       |
| Ses              | Silah, çarpma, adım, ortam; ses seviyesi                                                                 | Kontrol bağlantıları kaynak incelemesinde, ses sürgüsü tarayıcı senaryosunda; işitsel kalite otomatik testle doğrulanmaz |
| HUD / mobil      | Can, zırh, mühimmat, kalan rakip, alan, mini harita, FPS, dokunmatik eylemler                            | Üretim arayüz ve mobil taşma/ayar/atlama senaryoları                                                                     |
| Kaynak temizliği | Dinleyici, animasyon döngüsü, dünya, ses ve canvas temizliği                                             | Kaynak incelemesi ve yeni maç/çıkış tarayıcı senaryoları                                                                 |

## Test komutları

23 Ekim 2026 çalıştırmasında `npm run test:battle`: **21/21 geçti**;
test dosyaları sıkı TypeScript kontrolüyle yeniden derlendi.

Son üretim derlemesinde tarayıcı doğrulaması da tamamlandı:

- Gerçek WebGL ile **6/6 grup geçti**: sahne açılışı, dört kalite ve zorluk
  seçeneği, ses, duraklatılmış sahnenin yeniden boyutlandırılması, arka planda
  uçuşun durması, paraşütle iniş, ekipman toplama, gerçek fare girişiyle ateş,
  doldurma, ADS, sis bombası, duraklat/devam, çıkış ve mobil dokunmatik atlama.
- GPU çizimleri atlanan ayrı hızlandırılmış koşuda **1/1 grup geçti**:
  doğal maç bitişi, sonuç ekranı, yeni maçta 100 can ve tek canvas ile temiz
  başlangıç. Bu koşu üretim oyun durumunu değiştiren bir test kancası kullanmaz.
- İki koşuda da yakalanan JavaScript sayfa hatası **0**. Masaüstü 920×650 ve
  mobil 390×844 ekran görüntüleri incelendi; yatay taşma kontrolü geçti.
- Tarayıcılar test sonunda kapatıldı. WebGL yazılım çizicisiyle çalıştırıldığı
  için bu sonuçlar gerçek ekran kartlarında FPS veya 60 FPS garantisi vermez.

Ateş/doldurma kontrolü M4 adını ve dolu 30 mermilik şarjörü birlikte bekler,
gerçek fareyle ateş eder ve şarjörün yeniden 30'a dolmasını doğrular.

```sh
npm run test:battle
npm run build
npm start
# Playwright ve Chromium bulunan ortamda; diğer performans testleriyle eşzamanlı çalıştırma:
node scripts/test-battle-browser.cjs
BATTLE_LIFECYCLE_ONLY=1 node scripts/test-battle-browser.cjs
```

İkinci tarayıcı koşusu zamanı hızlandırır ve GPU çizimlerini atlar. Bu yalnızca
maç yaşam döngüsü testidir; görsel kalite veya FPS kanıtı olarak kullanılmaz.
İlk koşu gerçek WebGL çizimlerini kullanır. Üretim koduna durum değiştiren
veya hile sağlayan test kancaları eklenmez.

## Açık kalan kapsam

Fotogrametri, hareket yakalama, 4K sıkıştırılmış doku paketi, gerçek SSR,
hacimsel ışık/sis, ayrı contact-shadow geçişi, tam bina yıkımı, gelişmiş tutunmalı
parkur ve çok katlı bina navigasyonu mevcut sürümde tamamlanmış değildir.
Kamera tekrarında konum/yön kayıtları gösterilir; bütün mermi ve efektler
birebir yeniden oynatılmaz. Bu sınırlar çalışmayan bir düğmeyle gizlenmez.
