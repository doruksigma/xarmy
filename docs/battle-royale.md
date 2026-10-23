# XARMY Battle Royale

`/play`, ana menü açmadan uçuşla başlayan, tek oyunculu bir Three.js oyunudur. Bir oyuncu ve 23 bot aynı haritada hayatta kalmaya çalışır. Bu sürüm, eski tek dosyalı arena sahnesinin yerine ayrı dünya, render, model, hareket, ses ve yapay zekâ modülleri getirir.

## Çalışan sistemler

- 600 × 600 oyun alanı: kasaba, köy, askeri üs, fabrika, göl, nehir, köprü, kayalık geçit ve anahtarlı sığınak. Girilebilir binalar, iç mekân eşyaları, ağaçlar, çimenler, kayalar ve uzak dağ siluetleri.
- Üretilmiş PBR yüzeyler; normal, roughness ve yaklaşık AO haritaları; metal yüzey parametreleri. Ultra'da önemli yüzeylerin renk dokuları 2048 × 2048, High'da 1024, diğerlerinde 512 pikseldir. Normal/roughness haritaları 512 piksele kadar çıkar.
- Hareketli atmosfer, güneş/ay, kısa maçta görülebilen gece-gündüz geçişi, yağmur/sis/fırtına, rüzgârla hareket eden bitkiler, yumuşak gölgeler. High/Ultra göl yüzeyinde düzlemsel yansıma kullanır.
- Yedi farklı silah: AK-47, M4, SMG, keskin nişancı tüfeği, pompalı, tabanca ve makineli tüfek. Ayrı ateş hızı, geri tepme, saçılma, şarjör kapasitesi ve doldurma süresi; ADS, kafa vuruşu, dört nadirlik, beş takılabilir eklenti ve iki silah taşıma.
- El, sis ve flaş bombası; mermi izleri, kovanlar, çarpma parçacıkları, sesler, hasar ve vurulma yönü göstergeleri. Sis botların ateş hattını keser. Mermiler kamera ve namlu açısından engelleri kontrol eder.
- Uçaktan atlama, paraşüt, rastgele teçhizat, açılan sandıklar, yardım paketleri, anahtarla açılan sığınak, kırılabilir cam/kasa/variller.
- Hızlanma/yavaşlama, koşu ve dayanıklılık, kayma, eğilme, sürünme, zıplama, alçak engel aşma, omuz değiştirme ve kameranın duvarlara çarpmasını önleme.
- SUV, motosiklet ve buggy: gaz, geri vites, yönlendirme, fren, dönen tekerlekler, eğime uyum, çarpışma ve güvenli iniş. İki yönlü zipline, yerden vinçle binme ve havada ayrılma.
- Easy/Normal/Hard/Insane botlar: görüş açısı, görüş mesafesi, tepki gecikmesi ve isabet farkları; birbirleriyle savaşma, ihtiyaç duydukları eşyaları toplama, engel çevresinde yol bulma, siper/geri çekilme, sınırlı iyileştirme, doldurma ve güvenli alana gitme.
- Daralan alan, alan dışında hasar, kalan oyuncu sayısı, zafer/elenme, son çatışmanın konum tekrarı ve yeni maç. Tekrar, karakter konumlarını kaydeder; bütün mermi, parçacık ve animasyonları yeniden oynatmaz.
- Masaüstü ve dokunmatik kontroller; oyun içi grafik/zorluk/ses ayarları, duraklatma ve arenadan çıkış.

## Kontroller

| Kontrol        | İşlev                                                   |
| -------------- | ------------------------------------------------------- |
| WASD / fare    | Hareket / bakış                                         |
| Sol / sağ fare | Ateş / nişan                                            |
| Shift          | Koş                                                     |
| Space          | Uçaktan atla, zıpla, alçak engeli aş; araçta fren       |
| E              | Eşya al, sandık/sığınak aç, araca veya zipline'a bin/in |
| R              | Şarjör doldur                                           |
| 1 veya 2       | Taşınan iki silah arasında geç                          |
| C / Z / Ctrl   | Eğil / sürün / koşarken kay                             |
| Q              | Kamera omzunu değiştir                                  |
| G / B          | Bomba at / bomba türünü değiştir                        |
| H              | Sağlık çantası kullan                                   |
| O / Esc        | Oyun ayarları / duraklat ve fareyi bırak                |

Araçta W/S gaz/geri vites, A/D yönlendirme, Space fren, E inme için kullanılır. Tarayıcı, fare kilidi ve sesi ilk tıklamaya kadar sınırlayabilir. Dokunmatik ekranda joystick, bakış alanı ve eylem düğmeleri görünür.

## Kalite ve performans

Low/Medium/High/Ultra; çizim çözünürlüğünü, gölgeleri, doku boyutlarını, çimen/yağmur miktarını ve efektleri değiştirir. HDR desteği olan cihazlarda Medium ve üstünde bloom, High/Ultra'da SSAO çalışır. Ton eşleme, renk düzenleme ve FXAA görüntüyü tamamlar. HDR desteği olmayan cihazlar daha basit görüntü yolunu kullanır.

Tekrarlanan bitkiler instancing, sabit çevre parça ve malzemeye göre birleştirme, uzaktaki karakterler LOD kullanır. Parçacık ve ses sayısı sınırlıdır; bot kararları aralıklı hesaplanır. Hareket kısa alt adımlarla işlenir. Sekme gizlenince maç durur; yeni maçta önceki dünyanın dinleyicileri, sesleri ve grafik kaynakları temizlenir.

60 FPS hedefi gerçek ekran kartlarında ölçülmelidir. Bulut ortamındaki Chromium/SwiftShader yazılımsal çizimi, bir oyuncunun bilgisayarındaki GPU performansını temsil etmez. Bu sürüm için 60 FPS garantisi verilmez.

## Henüz tamamlanmayan ileri görsel aşama

Modeller, yüzeyler ve animasyonlar bu projede kodla üretilmiştir. Fotogrametri, lisanslı AAA karakter paketi, hareket yakalama, 4K sıkıştırılmış doku paketi ve sinema kalitesinde animasyonlar eklenmemiştir. Geometri ve kaplamalar önceki arenadan daha ayrıntılıdır; bu sürüm AAA görsel kaliteye ulaşıldığı iddiasında bulunmaz.

Gerçek screen-space reflection, hacimsel ışık/sis, ayrı contact-shadow geçişi ve GPU texture compression mevcut değildir. Bunların yerine gölde düzlemsel yansıma, atmosferik sis, yumuşak güneş gölgesi ve uygun kalite seviyelerinde SSAO kullanılır. Tam yıkılabilir bina sistemi, tutunmalı gelişmiş parkur, çok katlı bina navigasyonu ve fizik motoruyla süspansiyon/deformasyonlu araçlar sonraki aşamadır. Mevcut araç sistemi kinematiktir; kilitli sığınak kapısı açılır, bütün bina kapıları bağımsız açılır/yıkılır nesneler değildir.

## Doğrulama

Güncel işlev denetimi ve doğrulama sınırları: [`battle-audit.md`](battle-audit.md).

`npm run test:battle`: görüş/engel kontrolü, tepki gecikmesi, botların birbirleriyle çatışması, alan önceliği, engel çevresinde yol, iyileştirme/doldurma, mühimmat korunumu, hasar, alan kapanması, maç sonucu, araçlar, fren/çarpışma/iniş, zipline, oyuncuya ait eşyalarda takılmama ve acil paraşüt için 21 test.

`npm run build`: TypeScript ve üretim derlemesi. Tarayıcı kontrolleri ayrıca gerçek WebGL sahne açılışını ve oyun akışını sınar; düşük donanım performansı ayrı değerlendirilmelidir.

İlk sürümün geliştirmesinde 18 Battle Royale ve 95 mevcut satranç testi geçti; üretim derlemesi başarılı oldu. Gerçek Chromium/WebGL kontrolünde sahne açılışı, uçuş/iniş, ekipman toplama, hareket, kısa tıklamayla ateş, doldurma, ADS, bomba ve duraklat/devam et doğrulandı. Ayrı bir hızlandırılmış simülasyon kontrolünde GPU çizimleri atlanarak doğal elenme, sonuç ekranı, yeni maç tohumu ve önceki canvas temizliği doğrulandı; bu kontrol bir grafik performans ölçümü değildir.

Üretim sunucusunda mobil görünüm, grafik ayarları ve dokunmatik uçaktan atlama da tarayıcıda doğrulandı. Geliştirme amaçlı salt okunur durum görüntüleri üretim paketinde bulunmaz. Arenadan çıkış sitenin mevcut ana sayfasına döner.
