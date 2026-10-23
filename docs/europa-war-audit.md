# Europa War işlev denetimi — 23 Ekim 2026

Bu rapor `/games/europa-war` içindir. 1936 seferinin motoru, kayıtları ve üretim
sürümündeki arayüzü denetlendi. **125 motor testi geçti**; bunların 69'u bu
denetimde eklendi. Testler çalışan mekanikleri doğrular; istenen 100 özelliğin
her olası koşulda veya HOI4 ayrıntı düzeyinde tamamlandığı anlamına gelmez.

## Bu denetimde düzeltilenler

| Sorun                                                                        | Sonuç ve doğrulama                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yakınlaşınca tüm şehir adlarının görünmesi                                   | Her ölçekte yalnızca başkentler ve seçili şehir adlandırılır. Başka şehir seçilince öncekinin etiketi kalkar. Altı harita modu, üç yakınlaştırma seviyesi ve mobil ekran sınandı.                                                 |
| Birlik simgesinin yalnızca bir tümen seçmesi                                 | Simge bulunduğu yerdeki bütün kendi tümenlerini seçer. Shift ile başka grup eklenir; listede kutularla özel grup veya birlik adına tıklayarak tek tümen seçilir.                                                                  |
| Tek birliğe hareket/savunma emri                                             | Toplu emir, seçili tümenlerin hepsine tek işlemde uygulanır. Üç tümenin varışı, ayrı rota durumları, Shift ile rota ekleme, toplu durdurma ve kayıt gidiş-dönüşü sınandı. Geçersiz grup emri kısmen uygulanmaz; engel bildirilir. |
| İlk saldıran geri çekilince diğerlerinin muharebesinin atlanması             | Grupta kalan sağlam tümenler savaşa devam eder. Üç saldıran ve üç savunanın tamamının asker ve organizasyon kaybı motor ve tarayıcıda doğrulandı.                                                                                 |
| Aynı gün iki ülkenin aynı şehri alırken tarafsız/müttefik mülkiyetini ezmesi | Her çatışma öncesi güncel denetim kontrol edilir. Müttefik toprağına giriş kontrolü değiştirmez; izinsiz tarafsız giriş durur.                                                                                                    |
| Başka hedefe yürüyen tümenin taarruz desteği sayılması                       | Plan, uygun ve aynı hedefe yönelen kuvvetleri hesaba katar. Yanlış güç hesabıyla verilen saldırı emri için regresyon eklendi.                                                                                                     |
| Savunma savaşına katılan ülkenin saldırganla ittifak/geçiş/paktının kalması  | Yeni savaşan tarafların çelişen anlaşmaları temizlenir.                                                                                                                                                                           |
| Karşı casusluktaki ajanın darbe için boş sayılması                           | Darbenin iki boş ajan koşulu ayrılmış ajanı hesaba katmaz.                                                                                                                                                                        |
| Darbenin sponsorundan farklı ideolojide isyan başlatması                     | Başarılı operasyon desteklenen siyasi hareketin iç savaşını başlatır.                                                                                                                                                             |
| Oyunlar bağlantısının `/games` 404 üretmesi                                  | Eski bağlantı, oyun bağlantılarının bulunduğu ana sayfaya yönlendirilir.                                                                                                                                                          |

## 100 maddelik isteğin denetim kapsamı

“Test edildi” aşağıdaki somut davranışları ifade eder. Her ulusal odak,
diplomatik kombinasyon veya tarihsel olay ayrı ayrı oynanmış değildir.
İşlevlerin uygulama sınırları [ana teknik belgede](europa-war.md) açıklanır.

| İstek maddeleri | Doğrulanan davranış                                                                                                                                                                       | Kalan sınır / bağımsız doğrulanmayan ayrıntı                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1–7, 15         | 29 ülke, 447 bağımsız şehir poligonu, komşuluklar, seçme/arama/yakınlaştırma, ayrı ele geçirme, başkent/zafer puanı ve teslimiyet                                                         | Sınırlar yaklaşık 1936 uyarlamasıdır; şehirler gerçek tarihsel idarî sınırlar değildir.                                    |
| 8–14            | Arazi, ikmal/kuşatma etkileri, nüfus ve kaynak verileri, tesisler, boğazlar, işgal/direniş; eski haritadan kayıt geçişi                                                                   | Gerçek nehir geometrisi ve bütün tarihsel nüfus/ekonomi değerleri yok. Her arazi-birlik birleşimi ayrı test edilmedi.      |
| 16–23           | On kara birliğinin tamamında teknoloji koşulu, ekipman/insan gücü tüketimi, gerçek eğitim süresi ve konuşlanma; hava indirmesi                                                            | Her birliğin bütün muharebe istatistikleri için ayrı denge çalışması yapılmadı.                                            |
| 24–28           | Kanat kurma/dağıtma, model/menzil/üs/yakıt koşulları, bombardıman, gemi görevi/intikal/onarım, taşıyıcı uçakları, konvoy/eskort                                                           | Bölgesel günlük model; bütün hava ve deniz görev kombinasyonları ayrı ayrı denenmedi.                                      |
| 29–35           | General ve destek etkileri, tecrübe/organizasyon/ikmal hesabı, cephe çizme, taarruz hazırlığı, birlikte savaşma, geri çekilme ve takviye tüketimi                                         | Serbest tabur tasarımcısı ve çok katmanlı küresel ordu grubu editörü yok.                                                  |
| 36–49           | Anlaşma yönleri/tekrar reddi, gerekçe/savaş, savunma ittifakı, ateşkes ve askerlerin dönüşü, yardımda stok korunumu, ticaret/ambargo, katkılı konferans/ilhak/kukla/bağımsızlık           | Her çok taraflı diplomatik durum ayrı sınanmadı; tazminat ve donanmaya el koyma yok.                                       |
| 50, 94–98       | Kaynak kullanan bağımsız AI, tarihsel/alternatif yönelim, güç/ikmal değerlendirmesi, zorluk, otomatik yönetim; 1936–1945 boyunca 3.653 günlük tutarlılık testi                            | AI'nın her stratejik tercihi veya bütün ülkelerin oyun dengesi garanti edilmez. Küresel deniz istilası planlaması sınırlı. |
| 51–65           | On üç yapının tamamı günlük inşaatla biter; on yedi ekipman hattı girdileri tüketerek kullanılabilir stok üretir. İnşaat iptali/işgalde durma, kanunlar ve teslim edilen ticaret sınandı. | Her yapının bütün dolaylı etkileri ayrı ayrı sınanmadı. Küresel kaynak pazarı ve ekipman tasarımcısı yok.                  |
| 66–75           | Araştırma önkoşulu/tamamlanma ve yeni ekipman/birlik açılması; kabine etkileri                                                                                                            | Bütün araştırma hız formülleri ve her teknolojinin tamamlanışı ayrı test edilmedi.                                         |
| 76–85           | Siyasi reform ve parti toplamları, ideoloji değiştiren/karşı yolu kilitleyen odak, kabine, ulusal karar maliyeti/bekleme süresi, iç savaş ve tarihsel akış                                | Her ülkenin kapsamlı odak/seçim/olay takvimi yok; bütün odaklar ayrı senaryoda tamamlanmadı.                               |
| 86–93           | Ajan eğitimi/ayrılması, karşı casusluk, şifreleme etkisi, keşif/plan/sabotaj/propaganda/direniş/gizli diplomasi/darbe sonuçları                                                           | Yakalanma olasılıklarının istatistiksel dağılımı ve bütün başarısızlık dalları ayrı örneklenmedi.                          |
| 99–100          | Yerel kayıt/yükleme, bozuk kayıt reddi, v1 ve 144→447 geçişi, zaman/tarih, duraklatma, çevrimdışı yeniden açılış                                                                          | İlk açılışta çevrimdışı paket indirilmiş olmalı; farklı tarayıcı/depolama kotaları ayrı denenmedi.                         |

## Performans değişiklikleri

- Şehir etiketi yerleştirme yalnızca başkentler ve seçim için yapılır.
- Ekran dışında kalan bölge şekilleri, arazi ayrıntıları ve birlik simgeleri
  oluşturulmaz; sabit arazi bileşenleri yeniden kullanılabilir. Kamera tekrar
  döndüğünde sınırlar ve tıklama alanları geri gelir. Tam haritada 447 bölgenin
  tamamının tekrar oluştuğu tarayıcıda doğrulandı.
- İkmal ağı haritada yalnızca gerektiğinde hesaplanır. Planlama ve AI geri
  çekilme kararlarında ülke başına aynı ağ tekrar kullanılabilir; sonraki
  hesapta başkent kaybı gibi değişiklikler yeniden değerlendirilir.
- Birlik grupları oluşturulurken her eklemede dizinin tamamı kopyalanmaz.
  Ortak başlangıçlı grup emirleri rota hesabını paylaşır, tümen durumları ayrıdır.

Ölçüm komutu: `node scripts/benchmark-europa-map.cjs` (üretim sunucusu ve
Playwright/Chromium gerekir). 1440×1000 ekranda aynı Türkiye görünümünde
SVG öğeleri **6.620 → 3.402** (yaklaşık %49 azalma), görünen şehir etiketleri
**147 → 9** oldu. Aynı kaydırma örneğinde ortanca süre **87,3 → 84,5 ms**,
%95 dilimi **108,5 → 105,6 ms** ölçüldü; zaman kazancı öğe sayısındaki azalmaya
kıyasla sınırlı. Pan ölçümü iki animasyon karesi bekleyen 60 klavye kaydırması
kullanır; bu değer FPS değildir. Paralel tarayıcı/test yükü süreleri etkiler.
60 FPS veya her cihazda aynı hız garanti edilmez.

## Tekrar çalıştırma

```sh
npm run test:europa
npm run build
npm start
# Playwright modülünün erişilebilir olduğu ortamda, sırayla:
node scripts/test-europa-browser.cjs
node scripts/test-europa-group-browser.cjs
node scripts/benchmark-europa-map.cjs
```

Motor testi bütün `strategy/*.test.ts` dosyalarını otomatik bulur. Tarayıcı
kontrolleri üretim paketi üzerinde gerçek tıklama/dokunma, kayıt içe aktarma,
oyun saatini ilerletme ve tekrar kaydedilen durumu inceleme yoluyla çalışır.
Oyuna test için kaynak/hasar atlatan bir arka kapı eklenmedi.

Son üretim derlemesinde iki tarayıcı paketi toplam 24 kontrol grubunu geçti.
Yeni grup/harita paketinde hem sayfa istisnaları hem konsol hata listesi boştu.
Bunlar yerel üretim paketi sonuçlarıdır; Vercel canlı yayını ve farklı cihazların
performansı bu raporla doğrulanmış sayılmaz.
