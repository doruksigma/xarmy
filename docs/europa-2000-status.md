# Europa War — 2.000 satırlık şartnamenin kapsam ve aşama kaydı

Son inceleme: 10 Kasım 2026. İlk aşamanın başlangıç sürümü: `4d9b8af`.
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

## Gerçek takviye yükü ve doğrudan harekât kontrolleri — 10 Kasım 2026

Şartnamenin 04, 30, 41–43 ve 52–54 bölümlerindeki takviye muhasebesinin ilk
çalışan dilimi eklendi. Kara tümenlerinin eksik personel ve ekipmanı artık
depodan birliğe anında yazılmaz. Gün değişiminde uygun birlik için yük ayrılır;
birliğin gücü ancak yük gerçekten vardığında artar.

- `reinforcements.ts` başkentten, gerçek serbest personel ve ekipman stokunu
  bir kez düşerek sevkiyat oluşturur. Bir tümenin aynı anda tek takviye yükü
  olabilir. Tür ve destek bileşimi çıkışta sabitlenir; destek değiştirmek eski
  yükten yeni ekipman yaratmaz. Günlük temel oran önceki %0,4 sınırını korur;
  stok, eksik güç, ikmal, yol ve taşıma süresi fiilî teslimatı sınırlar.
- Yükleme ve taşıma aynı fiziksel düğüm/hat bütçesini paylaşır. Altyapı,
  demiryolu, ikmal merkezi ve hasar kapasiteyi etkiler. Ortak hattı kullanan
  müttefik ve ters yönlü yükler ayrı ayrı tam kapasite alamaz. Kullanılan
  oransal çözüm kapasiteyi aşmaz; kullanılmayan payı yeniden dağıtan tam akış
  optimizasyonu değildir. Kapasiteler soyut yük birimi/saat cinsindedir.
- Sevkiyat mevcut konumundan ilerler. Yol kesilince bekler veya geçerli
  alternatif bulur; hedef hareket ederse yeni konumuna yönelir. Çatışma ya da
  düşük ikmal teslimatı bekletir. Hedef kaybolur, taraf veya destek bileşimi
  değişirse kalan yük başkente geri taşınır. Ele geçirilen yük ve teslim olan
  ülkenin yükü kayıp hesabına geçer. Tam dolu depoya dönen yük için stok
  taşmasıyla sessiz kayıp oluşmaz; boş kapasite beklenir.
- `World.reinforcements` ülke başına ayrılan, teslim edilen, dönen ve kaybolan
  toplamları tutar; kalan fark gerçek yoldaki yüktür. Bireysel tarihçe sınırsız
  büyümez. Kayıtta yalnız sıradaki etap tutulur. Eski kayıtlarda alan eksik
  kalabilir; yeni kayıtlar miktar, bileşim, kimlik, saat, coğrafya ve denklik
  denetiminden geçer. Worker fark aktarımı bu durumu da taşır.
- **Ordu → Takviye sevkiyatları** serbest stok, yoldaki personel/ekipman,
  gerçek konum, hedef, etap ilerlemesi ve bekleme nedenini gösterir. Açılır
  ayrıntıda teslim/dönüş/kayıp toplamları ve altışarlı sevkiyat listesi vardır.

Bu aşama genel ikmal tüketiminin tamamı değildir. Günlük temel ikmal oranı,
ticaret/yardım, eğitim ve destek değişimi kendi mevcut hesaplarını kullanır.
Gerçek tren/kamyon/konvoy stok tahsisi, bütün yük türlerinin ortak kapasitesi,
yerel yakıt rezervleri ve modüler tümen tasarımcısı sonraki işlerdir. Birlikler
hâlâ güç yüzdesiyle temsil edildiğinden takviye ekipmanı kesirli olabilir.

**Kontrol ve görsel değişiklikler:** Haritadaki kendi birliğine dokunmak hedef
seçimini açar; sonraki şehir dokunuşu gerçek grup hareket emrini verir. Ordu
menüsü ve “Birlik ayrıntıları” inceleme/eğitim için kalır. Hava/Donanma görevleri
ayrı erişilebilir bölümlerde seçilen kuvvet, üs, görev ve hedefle tek emir
olarak uygulanır. Harita üzerindeki hava/deniz emir düğmeleri ilgili bölümü
açar. Uçak ve gemiler gerçek katalog türüne göre on ayrı özgün, örneklenmiş
model kullanır; nakliye/keşif, taktik/stratejik bombardıman, muhrip/zırhlı
siluetleri ayrılır. Bekleyen kuvvetler sahte çatışma üretmez.
Gemiler ve aynı üssü kullanan uçaklar dünya güncellemesinde hesaplanan ayrı
yerleşim noktaları kullanır; küçük denizlerde ölçek ve aralık mevcut güvenli
su alanına göre sınırlandırılır. Kare başına çarpışma çözümü eklenmez; mevcut
nesne/efekt sınırları ve örneklenmiş çizim yapısı korunur.

- Kara rotaları kıyı ve gerçek ortak bölge sınırlarından önceden üretilen
  koridorları izler. 1.974 aday kara bağlantısından 793'ü düz çizgi yerine
  kıyıyı dolanan yol kullanır; 144 sahte kara bağlantısı ayıklanır. Geçerli
  kara yolu varsa deniz kısayoluna tercih edilir. İstanbul–Çanakkale hareketi
  İzmit–Bursa–Balıkesir üzerinden tamamlanır. Üçüncü ülke geçişinde askerî
  erişim kuralları korunur; izin yokken sınırdan kestirme yapılmaz.
- Hareket süresi, 2D/3D birlik konumu ve hareket oku aynı koridor uzunluğunu
  kullanır. Coğrafi işlem oyun sırasında çalışmaz; küçük koridor tablosu ve
  önbellek kullanılır. 76.865 baytlık tabloyu geliştirmede Shapely 2.1 veya
  üzeriyle `python scripts/europa-war/build-land-corridors.py --check`
  doğrular; oyun Python veya Shapely gerektirmez. Coğrafya haritanın mevcut
  genelleştirilmiş sınırlarıdır;
  gerçek yol ağının veya bütün tarihsel sınırların eksiksiz modeli değildir.
- Eski imkânsız kara emirleri son hedefini koruyarak yeniden hesaplanır.
  Bağlantısız liman çiftleri deniz taşımacılığına çevrilir; Stettin–Königsberg,
  Kopenhag–Aarhus ve Liverpool–Belfast arasında ayrıca denetlenen deniz
  bağlantıları vardır. Bu yollar donanma/boğaz erişimine bağlıdır. Deniz
  intikalinin kayıtlı türü, yeniden yüklemede hareketin tekrar başlamasını önler.
- Hava/deniz görevleri gerçek günlük çözümde yakıt tüketir, uygun düşmana ve
  hedefe etki eder. Oyuncunun otomasyon tercihi korunur. Ele geçirilen ana
  limanın yerine aynı deniz bölgesindeki başka limanı seçmek de gerçek emir
  sayılır; “zaten aynı görev” denerek kilitlenmez.

**Doğrulama:** Koridor üreticisinin `--check` denetimi ve son
`npm run build` başarılı. Takviye için 29, manuel görev önizlemesi/gerçek
komut eşleşmesi için 7 ve son model/yerleşim için 20 odaklı kontrol geçti.
Genel turda **789 kontrolden 788'i** ilk çalıştırmada geçti. Kalan motor testi
birlikleri komşu olmayan şehirlerden gelmiş gibi yerleştiriyordu; geçersiz
rotanın artık onarılması bu eski varsayımı açığa çıkardı. Test gerçek
Breslau–Poznań/Kraków sınır geçişleriyle düzeltildi; motor dosyasındaki
**23 kısa kontrol yeniden çalıştırılıp 23/23 geçti**. Daha önce başarıyla
tamamlanan bir yıllık ve **3.653 günlük (1936–1945) tarihsel simülasyonlar**
test verisi değişikliği için tekrarlanmadı. Altı ülkenin 90 günlük savaş ve
kayıt devamlılığı senaryoları da genel turda geçti.

Üretim sunucusunda toplam **48/48** tarayıcı kabul kontrolü geçti: takviye
9, hava/deniz ve kıyı hareketi 20, referans arayüz 17, son 3D yerleşim 2.
JavaScript/konsol hatası kaydedilmedi. İki gerçek tümenin tek harita seçimiyle
İzmit–Bursa–Balıkesir üzerinden Çanakkale'ye varışı, tarafsız geçiş reddi,
AI kapalıyken elle verilen uçak/gemi görevleri, gerçek yakıt/tesis/gövde
sonuçları, çevrimdışı kayıt/yükleme ve 2D/3D deniz komutası bağlantıları
denendi. Masaüstü ve gerçek dokunma olayları kullanılan mobil emülasyonda
panel taşması olmadı; 320×640 ve 667×375 düzenleri de kontrol edildi.
Son masaüstü/mobil ekran görüntülerinde gemi ve uçak yığılması giderildi.
Kontroller Chromium/SwiftShader ile yapıldı; fiziksel telefon testi değildir.

Node/Linux yük denemesinde 3.680 tümen ve 3.680 ödenmiş sevkiyatın kaydı
3.096.037 UTF-8 baytla 4 MiB sınırının altında kaldı; yeniden yükleme ve
12 saatlik devam geçerliydi. İlk ayırma 32,13 ms, sonraki sevkiyat adımları
2,25–11,27 ms ölçüldü. Bu tek ortam ölçümü telefon FPS garantisi değildir.

Uzun sefer profili, kara bağlantısı anahtarlarının tekrar sıralanıp
birleştirilmesini gereksiz maliyet olarak gösterdi. Geçerli ve eski hatalı
bağlantılar başlangıçta `Map/Set` içine alındı. **826.281 bölge çiftinin** eski
hesapla eşitliği ve ilgili 34 kontrol geçti. 1.996. gündeki 1.109 tümen/
58 sevkiyat örneğinde, her sürüm için yedi dönüşümlü denemede toplam 168
saatlik kara adımı ölçüldü: medyan **5,24 → 4,22 ms**, p95 **8,76 → 8,14 ms**.
24 adım sonunda bütün dünya özeti birebir aynı ve kayıt geçerliydi. Ölçüm
Node/Linux'ta başka bir uzun test çalışırken yapıldı; tüm oyun veya telefon
FPS hızlanması olarak yorumlanmaz. Genel sefer turu önbellek öncesi aynı
kurallar üzerinde çalışır; bu son değişiklik ayrıca tam bağlantı eşdeğerliği
ve aynı sefer girdisiyle karşılaştırılmıştır.

## Referans ekrana göre stratejik harita ve komuta düzeni — 4 Kasım 2026

Kullanıcının son ekran referansına göre harita ve yönetim arayüzü yeniden
düzenlendi. Bu görsel aşama önceki günlük hava/deniz hesabı üzerinde çalışır;
2.000 satırlık kapsamın tamamlandığı anlamına gelmez.

- Masaüstünde harita genişliğini daraltan sol menü kaldırıldı; kaynaklar,
  tarih/hız ve gerçek yönetim düğmeleri iki dar üst şeritte toplandı.
  İstikrar, savaş desteği ve yakıt gerçek kampanya değerleriyle görünür.
  Yönetim penceresi haritanın üstünde açılır; Ordu penceresi iki sütuna
  yer verecek kadar geniştir. Mobilde yatay kaydırılabilen menü, tek sütunlu
  pencereler ve dokunmatik kontroller kullanılır.
- Yeni görünüm tercihi olmayan kullanıcı 2D siyasi haritayla başlar; kayıtlı
  3D tercihi korunur ve iki görünüm arasında geçiş yapılabilir. İlk harita ve
  oyuncu ülkesi değişikliği başkent çevresine odaklanır. Dünya görünümü,
  yakınlaştırma, sürükleme ve şehir araması kullanılmaya devam eder.
- 2D haritada gri-mavi deniz, soluk siyasi renkler, daha belirgin kabartma,
  büyük ülke adları ve ince şehir sınırları kullanılır. Kalın ülke ve savaş
  sınırları gerçek bölge kontrolünden türetilir; işgalden sonra değişir.
  Atanmış komutanların hedef sınırları renkli cephe şeritleriyle gösterilir.
  Atanmamış komutanlar için cephe üretilmez. 1.966 ortak bölge sınırı
  `scripts/europa-war/build-strategic-boundaries.cjs` ile harita verisinden
  önceden üretilir; tarayıcıda çokgen kesişimi hesaplanmaz. Kaynak haritanın
  SHA-256 özeti ve `--check` komutu verinin güncelliğini denetler. Sınır katmanı
  kontrol, savaş ve komutan emri değiştiğinde yenilenir. 448 KB kaynak JSON'un
  yüklenme maliyeti vardır; sıfır takılma veya fiziksel telefon FPS garantisi
  verilmez.
- Birlik kartları küçük askerî sayaçlara dönüştürüldü; tür, adet, organizasyon
  ve mevcut güç gerçek birliklerden gelir. Hareket ve taarruz okları gerçek
  rotaları kullanır. Şehir isimleri başkent/seçim kuralını korur.
- Komutanlar altta portreli bir sırada, gerçek tümen sayıları ve emir durumuyla
  görünür. Sınır seçimi, saldır/savun, otomatik atama ve 12 tümen sınırı aynı
  komutları kullanır. Portreler yerel SVG çizimleridir.
- Ordu penceresinde mevcut birlik türünün ekipmanları ve gerçek eğitim
  maliyeti, kâğıt görünümündeki temel savaş istatistikleriyle yan yana sunulur.
  Araştırma kilitleri, kaynak tüketimi, çıkış şehri ve eğitim kuyruğu işler.
  Bu hazır birlik türlerinin inceleme/eğitim ekranıdır; modüler tabur/alay
  tasarımcısının tamamlandığı iddia edilmez.

**Doğrulama:** Eğitim yeri/maliyeti, komutan ataması/emri/kaydı, hareket rotası,
kamera sınırı ve 3D kontrol yerleşimi için 53 mevcut kontrol; yeni sınır
katmanı için 6 kontrol geçti (**59/59**). Sınır üreticisinin `--check` denetimi
ve `npm run build` başarılı. `scripts/test-europa-reference-browser.cjs`
üretim sunucusunda **17/17** kabul kontrolünü tamamladı; JavaScript/konsol
hatası kaydedilmedi. Test sıradan doğrulanmış kampanyayı arayüzden içe aktarır,
gerçek kaynak tüketimini ve emirleri arayüzden kaydedilen dünyada denetler.

- 1440×900 ve 390×844 görünümlerinde başkent odağı, ülke/savaş/cephe sınırları,
  yakınlaştırma, harita kaydırma, eğitim, komutan saldırı emri ve ülke renkli
  hareket oku çalıştı. Oyuncu ülkesi değişince kamera yeni başkente odaklandı.
- 2D/3D geçişleri kampanyayı değiştirmedi; sayfa yenilemesinde kayıtlı 3D
  görünüm tercihi geri geldi. 320×640 ve 667×375 boyutlarında yatay taşma yok;
  Ordu penceresi kaydırılabilir ve kapatma düğmesi erişilebilir.
- İlk tarayıcı denemesinde masaüstü Ordu penceresi haritadan hedef seçimini
  engelliyordu. Harita emri başlatıldığında pencerenin kapanması düzeltildi
  ve tekrar testinde gerçek hedef rotasının kayda yazıldığı doğrulandı.

Ekran görüntüleri masaüstü, mobil ve kısa yatay görünüm için incelendi.
Kontroller Chromium/SwiftShader ve dokunmatik ekran emülasyonunda yapıldı;
fiziksel telefon performansı veya bütün oyunların kapsamlı testi değildir.

## Eşzamanlı hava/deniz hesabı ve günlük harekât raporu — 4 Kasım 2026

Şartnamenin 04–07, 55–64 ve 96–98 bölümlerindeki günlük savaş temeli ilerletildi.
`airnaval-resolution.ts` önce üs tahliyesi, gerçek stoktan takviye, tersane
onarımı ve yakıt tahsisini hazırlar; iki tarafın saldırısını aynı hazırlanmış
kuvvet durumundan hesaplar. Hasarlar toplandıktan sonra kayıp, batma ve geri
çekilme uygulanır. Ülke veya birlik listesinin sırası ilk vuruş avantajı vermez.

- Yakıtı gerçekten karşılanan kanatlar ve gemiler savaş gücü üretir. Yakıt veya
  uçak takviyesi yetersizse öncelik kalıcı varlık kimliğine göredir; mevcut hava
  görevlerinin donanmadan önce yakıt alması kuralı korunur. Yakıtsız, görevdeki
  gemi ateş edemez fakat denizde hedef olmaya devam eder. İntikaldeki veya
  dinlenen gemi bu günlük muharebeye katılmaz.
- Aynı günün bombardımanı karşı tarafın o gün için hesaplanan üs verimini
  geriye dönük değiştirmez. Geri çekilen denizaltı da o günün planlanmış saldırı
  hesabından silinmez. Birleşik hava/deniz hasarı geminin kalan gövdesini aşamaz;
  tek gemi bir kez batar ve güvertedeki kalan uçaklar gerçek kayba eklenir.
- Tersanelerin günlük toplam onarım kapasitesi baştan sabitlenir. Tamir edilen
  küçük hasarlı bir geminin kalan payı diğerlerine aktarılır; liste ilerledikçe
  yeni kapasite oluşmaz. Gerçek onarıma karşılık gelen çelik bir kez düşülür.
- **Hava / Deniz → Günlük harekât raporu** oyuncunun son tamamlanmış günündeki
  uçak kaybını, batan gemileri, yakıtı ve verdiği tesis hasarını gösterir.
  Açılır ayrıntılarda uçuş, çatışmaya katılım, üs/tahliye kaybı, takviye,
  gemilere verilen hava hasarı, alınan gövde hasarı, ikmalsizlik ve onarım vardır.
  Rapor gerçek çözümden gelir; düşman ülkenin raporu oyuncuya açılmaz.
- `World.airNavalReports` her ülke için yalnız son günlük özeti saklar; sınırsız
  geçmiş birikmez. Sayı/sınır, ülke, aynı gün, gelecek tarih ve yinelenen kayıt
  doğrulaması vardır. Raporu olmayan eski kayıt aynen açılır ve ilk gün
  hesabına kadar arayüz açıklama gösterir. Worker farkları ve kaydet/yükle
  devamlılığı raporu taşır; batmış geminin raporu kaybolmaz.

Sessiz Node 24/Linux ölçümünde 92 ülke ve 909 bölgeyle, her uygulama için
ısınma sonrası 56 günlük çağrı karşılaştırıldı. 100 kanat/155 gemili yükte eski
ve yeni medyan **1,66 / 1,50 ms**, p95 **4,95 / 5,87 ms**; dört ülkenin
40 kanat/120 gemi sınırına ulaştığı toplam 254 kanat/613 gemili yükte medyan
**19,05 / 2,94 ms**, p95 **32,46 / 11,93 ms** oldu. Değişen savaş kuralları
nedeniyle eski ve yeni sonuçların aynı olması beklenmez; bu eşit sonuçlu bir
hızlandırma veya telefon FPS ölçümü değildir. Her uygulamanın kendi tekrarları
aynı dünya özetini verdi, son kayıtları doğrulamadan geçti. Ölçüm raporu:
`/workspace/scratch/airnaval-resolution-audit.json`.

**Doğrulama:** 733 motor/kayıt/harita/AI kontrolü doğrulandı. İlk geniş
koşuda 732 test geçti; tek hata eski bir 3D efekt testinin yakıtı liste sırasına
göre alan gemiyi varsaymasıydı. Veri kimlikleri yeni sabit önceliğe uygun hale
getirilip her iki liste sırası için aynı sonuç istendi; ilgili 14 testin tamamı
yeniden geçti. Üretim kodunu bu beklentiye uyduran bir geri dönüş yapılmadı.
Altı farklı ülkeyle 90 günlük savaş/kayıt devamlılığı geniş koşuya dahildir;
bir yıllık ve 1936–1945 uzun sefer testleri bu çalıştırmanın dışında tutuldu.

`npm run build` geçti. `scripts/test-europa-airnaval-browser.cjs` üretim
sunucusunda **7/7 kabul kontrolünü** geçti; sayfa hatası yok. Gerçek worker'ın
gün sonu raporu, bütün kaydı ve indirilen JSON, aynı saatlerdeki motorla
birebir eşleşti. Ağ kapalıyken açık sayfada ikinci güne ilerleme ve kaydet/yükle,
düşman raporunun gösterilmemesi, kanat/gemi manuel emirleri ve hava yardımcısının
donanmayı kendiliğinden açmaması doğrulandı. Masaüstü ve 390 piksel dokunmatik
mobil emülasyonunda özet/ayrıntı/manuel kontrol ekranları görsel incelendi;
raporda yatay taşma yoktu. Bu, fiziksel telefon testi veya yeni bir çevrimdışı
ilk açılış doğrulaması değildir.

Yerel kanıtlar `/workspace/scratch/` altındaki `europa-airnaval-regression.log`,
`europa-airnaval-visual-regression.log`, `europa-airnaval-build.log` ve
`europa-airnaval-browser/report.json` dosyalarıdır.

**Kapsam sınırı:** Bu aşama günlük savaş çözümünü düzeltir. Saatler boyunca
geçerli ödenmiş görev/yerel yakıt defteri henüz yoktur; mevcut anlık destek
sorguları kalan yakıtı okumaya devam eder. 3D efekt bağdaştırıcısı hâlâ iki
anlık durumun net farkını kullanır; aynı günkü takviyenin kaybı gizleyebildiği
ve karma hasarın tek tek kaynağa ayrılamadığı durumlar için varlık bazlı olay
defteri sonraki bağımlılıktır. Fazlı deniz teması, gerçek taşıyıcı kanatları,
pilotlar ve genel sevkiyat/ikmal muhasebesi tamamlanmış sayılmaz.

## Sefer temposu, başkent savunması ve daha etkin AI — 4 Kasım 2026

Son kullanıcı önceliği doğrultusunda zaman ve kara muharebesi hızlandırıldı:

- 1× saat adımının beklemesi 300 ms'den **150 ms**'ye indi. 1×–5× aynı
  saatlik hesapları kullanır; worker bitmeden ikinci iş gönderilmez ve
  duraklamadan sonra birikmiş saatler topluca çalıştırılmaz. Gerçek ilerleme
  hızı hesaplama ve çizim yüküne de bağlıdır.
- Kara temasındaki karşılıklı güç ve organizasyon kaybı **3 kat** hızlandı.
  Yürüyüş, yakıt, ikmal, takviye ve dinlenme ayrı oranlarını korur. Kontrollü
  eşit piyade, üçe bir piyade, karma birlik ve tahkimatlı tank deneylerinde
  savaş kararı sırasıyla **242→83, 153→51, 152→51 ve 177→59 oyun saati**
  sürdü. Karma birlik savunmayı 51. saatte yendi, topçunun yürüyüşünü tamamlayıp
  57. saatte birlikte girdi; savaş bitişi anında şehir ışınlanarak alınmaz.
- Savaşan botlar cepheyi kolayda 24, normalde 12, çok zorda **6 oyun saati**
  aralıkla değerlendirir. Ülkelerin karar saatleri dağıtılır; haftalık ekonomi,
  araştırma ve diplomasi bütçesi her saat yeniden hesaplanmaz. Saldırılar
  komşu tümenlerin toplam gücüne göre seçilir; gelen takviyeler sayılarak
  savunmasız cepheler arasında dağıtılır. Oyuncunun emirleri bu AI tarafından
  değiştirilmez.
- Bot, elindeki tek tümen bile olsa, kontrol ettiği başkent için bir gerçek
  muhafız ayırır. Boş başkente ulaşabilen birlik geri çağrılır; yoksa stok ve
  insan gücü yeterliyken gerçek eğitim kuyruğu açılır. Muhafız gerçek savaşta
  kayıp verebilir veya çekilebilir; işgal edilmiş başkente ücretsiz asker
  doğmaz.
- Yeni seferde 92 yönetimin tamamı kendi başkentinde askerle başlar. Tam tümen
  kuramayan 20 küçük ülke mevcut seferber insan gücü ve orantılı tüfek bedeliyle
  düşük mevcutlu muhafız alır. Eski kayıtlara kendiliğinden asker eklenmez.
- Yeni sefer ekranının varsayılanı **Çok zor** oldu. Mevcut kaydın zorluğu
  korunur; Komuta → Oyun zorluğu bölümünden değiştirilebilir. Çok zordaki
  mevcut %15 oyuncu muharebe gücü azaltımı arayüzde açıkça gösterilir.

Sık taktik kararları eklerken denizaşırı cephelerde aynı başarısız ağırlıklı
rota aramasının tekrarlandığı bulundu. `ai-access.ts` karar turuna özel
erişim ağı ve deniz geçiş önbelleği kullanır; gerçek emirler yine ağırlıklı
rota ve ortak komut doğrulamasından geçer. Sonraki karar turunda işgal,
diplomasi ve donanma durumu yeniden okunur. Optimizasyon öncesi/sonrası
72 saatlik dünya özetleri aynı kaldı; ilk konuşlanmalar bölünerek geciktirilmez.

`node scripts/benchmark-europa-ai.cjs` iki kez tekrarlanan 72 saatlik çok zor
küresel savaşları ve 512 adaylı kopuk başkent durumunu ölçer. Node 24/Linux
ölçümünde bütün saatlik hesap için medyan / p95 süreleri 337 tümenle
**15,57 / 128,50 ms**, 589 tümenle **18,85 / 130,32 ms** oldu. Kopuk başkent
kararında **1,75 / 3,47 ms** ölçüldü. İlk gerçek hareket emirleri ve günlük
hesaplaşma hâlâ daha uzun sürebilir. Bunlar fiziksel cihaz FPS ölçümü veya
her donanımda aynı takvim hızı garantisi değildir.

**Doğrulama:** 719 motor/kayıt/harita/AI testi ve üretim derlemesi geçti.
Altı farklı ülkeyle 90 günlük savaş/kayıt devamlılığı buna dahildir; bir yıllık
ve 1936–1945 uzun sefer testleri bu çalıştırmanın dışında tutuldu. Yeni
`scripts/test-europa-tempo-browser.cjs` kabul betiğinde altı kontrol geçti,
sayfa hatası yok: yeni çok zor sefer, küçük ülkenin gerçek başkent muhafızı,
eski kolay/normal kaydın zorluğu, gerçek karşılıklı savaş kayıpları, 1×–5× ve
duraklatma, oyuncu emirlerinin korunması ve 390 piksel mobil hız kontrolleri.
Tarayıcıdan kaydedilen gerçek worker durumu aynı saat sayısındaki motorla
birebir eşleşti. 2D masaüstü/mobil ekran görüntüleri incelendi. Yerel raporlar
`/workspace/scratch/europa-tempo-regression.log`, `europa-tempo-build.log`
ve `europa-tempo-browser/report.json` altında; canlı site dağıtımı ayrıca
doğrulanmış sayılmaz.

Bu aşama şartnamenin özellikle 04–07, 41–43, 47–51 ve 91–94 bölümlerindeki
mevcut temel üzerinde ilerler. Tam 2.000 satırlık kapsamın tamamlandığı
anlamına gelmez; aşağıdaki kalan işler geçerlidir.

## Dünya 1936, doğrudan kuvvet yönetimi ve birlik görselleri — 4 Kasım 2026

Kullanıcının seçimiyle harita 1936 ülkeleri ve bağlı yönetimlere genişletildi:
92 oynanabilir yönetim, 909 şehir bölgesi, 11 deniz havzası. Eski Avrupa'nın
447 bölge kimliği ve aralarındaki yollar aynı mesafe ölçeğinde korundu.
Natural Earth kamu malı kıyıları üzerine senaryo atamaları kullanılır;
sınırlar, nüfuslar ve sanayi değerleri yaklaşık oyun verileridir. Çin'deki
bütün savaş ağaları ve küçük uluslararası yönetimler ayrı ülke değildir.
Ayrıntılı kaynaklar ve tekrar üretim komutu:
[WORLD-MAP-SOURCES.md](../scripts/europa-war/WORLD-MAP-SOURCES.md).

- Ordu panelinde birlik türü, gerçek maliyet/istatistik ve eğitim çıkış şehri
  birlikte seçilir. İlk konum başkenttir; haritada başka şehre dokunmak bunu
  değiştirmez. Verilmiş eğitim emirleri kendi çıkış yerlerini korur; işgal
  edilen çıkış şehirlerinde eğitim bekler.
- Hava / Deniz paneli kolay görünümde de açıktır. Kanatlar ve gemiler manuel
  yönetilir; hava ve donanma yardımcıları ayrı ve yeni seferde kapalıdır.
  Eski ortak otomasyon seçimi eski kayıtlarda anlamını korur. Hava menzili
  tarih çizgisinde kısa Pasifik mesafesini kullanır; kanal erişimi ve alternatif
  deniz yolları gerçek görev/ikmal hesaplarına bağlıdır.
- 3D asker, tank, top ve kamyonlar grubun gerçek türlerinden seçilir. Sırf
  tümen sayısı arttığı için grupta bulunmayan araç gösterilmez. Temsilî birlik
  etiketleri ortalama can ve organizasyonu gösterir. Uçakların çizim ölçeği
  küçültüldü; muharebe gücü görsel ölçekten bağımsızdır.
- Saat adımı 500 ms'den 300 ms'ye indirildi; 1×–5× aynı kuralları ve tek
  bekleyen worker düzenini kullanır. 3D kamera, küçük harita, su, kıyılar ve
  görünürlük dünya boyutuna uyar; arazi atlası uzun kenarda 4096 piksel ile
  sınırlıdır. Mikrodevletlerde bina sığmayan gerçek küçük alanlar şehir ışığı
  ve seçilebilir işaretle temsil edilir.
- 144 ve 447 bölgeli eski Avrupa kayıtları önce doğrulanır, sonra dünya
  senaryosuna genişletilir. Eski ordular, kuyruklar, ele geçirmeler ve verilen
  emirler korunur. Tamamlanmış ilhaklar geri alınmaz; açık barış konferanslarına
  yeni bölgeler ve bunların bütçesi eklenir. Eksik/bozuk dünya kaydı otomatik
  tamir edilmez. Dünya ölçeğinde tümen sayısı ve eğitim rezervasyonu ortak
  kayıt/simülasyon sınırına bağlıdır.

Bu aşama bütün 2.000 satırlık şartnamenin tamamlandığı anlamına gelmez.
Yeni ülkeler ortak yönetim mekaniklerini kullanır; her biri için ayrı yüksek
ayrıntılı model, özgün odak ağacı veya tam tarihsel envanter oluşturulmadı.
Fiziksel telefon ve Windows donanımında yüzde yüz akıcılık garantisi verilmez.

Dünya verisiyle üç gerçek 48 saatlik aktarım deneyi (barış, grup yürüyüşü,
yoğun çatışma; 317–637 başlangıç tümeni) fark aktarımını tam dünya kopyalarıyla
karşılaştırdı. Aynı durumun alıcıda eksiksiz yeniden kurulması doğrulandı;
JSON eşdeğer aktarım hacmi sırasıyla %89,11 / %89,10 / %75,86 azaldı.
Bu ölçüm ağ hızı veya FPS değildir. Üretim derlemesi, motor/kayıt/harita
regresyonları ve altı farklı ülkeyle 90 günlük savaş/kayıt devamlılığı geçti.
12 uçtan uca tarayıcı kontrolü; ABD/Japonya/Brezilya başlangıçları, gerçek
ücretli eğitim kuyrukları, manuel hava/deniz emirleri, bağımsız otomasyonun
kayıt/yüklemesi, worker saat eşdeğerliği, türlere bağlı modeller, can çubukları
ve 390 piksel dokunmatik arayüzü kapsadı. Bunlar Chromium masaüstü ve mobil
emülasyon kontrolleridir, fiziksel telefon/Windows FPS ölçümü değildir.
Son üretim derlemesinde ayrıca dört odaklı kontrol geçti: 390 pikselde
kaydırmadan gerçek ücretli eğitim; 3D uzak görünümde başkent etiketlerinde
sıfır çakışma ve yakınlaşınca etiketin geri gelmesi; ağ ve HTTP önbelleği
kapalıyken kayıt yükleme, yeni worker ile zaman ilerletme, küresel 2D/3D
atlasın açılması ve yeni Brezilya seferi başlatma. Test kodu:
`scripts/test-europa-world-controls-browser.cjs`; son odaklı tur için
`EUROPA_RECRUITMENT_OFFLINE_ONLY=1` kullanılır.
Komut, muharebe ve kayıt doğrulamaları ayrı çalıştırıldı; 1936–1945 uzun sefer testinin yeni dünya haritasındaki
tekrarı bu aşamanın doğrulama kapsamına dahil değildir.

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

## Saatlik fark aktarımı ve deterministik kayıt temeli — 4 Kasım 2026

Şartnamenin 06–07. bölümleri için simülasyonun sunuma aktarımı tamamlandı.
Bu aşama mevcut ülke modellerini, araştırmaları, komutanları ve manuel yönetim
seçeneklerini değiştirmez; kayıt ve saat ilerletme temelini geliştirir.

- `simulation-state.ts`: saat başı bütün dünyayı gönderme yerine değişen alanları
  taşıyan sürümlü fark protokolü. Kimlikli listelerde ekleme, silme ve sıralama
  korunur; değişmeyen ülke, bölge ve birliklerin ana iş parçacığındaki nesneleri
  yeniden oluşturulmaz. Farkın JSON eşdeğeri tam durumdan büyükse tam durum
  gönderilir. Fark üretimi ve paket boyutu ölçümü worker içinde yapılır.
- `simulation.ts` / `simulation.worker.ts`: protokol 2, istek/revizyon kimliği,
  kaynak ve sonuç saati birlikte kontrol edilir. Aynı anda yalnız bir saat
  hesaplanır; duraklatma, komut veya kayıt değiştirme önceki yanıtı geçersiz
  kılar. Bozuk fark, desteklenmeyen protokol veya uyuşmayan saat kampanyaya
  uygulanmaz; zaman durur ve tekrar başlatma geçerli durumdan yeniden eşitler.
  Farklar atomik ve salt veri olarak uygulanır; tehlikeli nesne anahtarları,
  yinelenen kimlikler, eksik dizi elemanları ve aşırı derinlik reddedilir.
- `rng.ts`: savaş, olay, AI ve istihbarat için dört bağımsız kayıtlı üreteç.
  Şu anda gerçek zar kullanan casusluk istihbarat akışını tüketir. Savaş ve AI
  kurallarına yalnız akışları kullanmış olmak için yeni rastgelelik eklenmedi.
  Grafik rastgeleliği bunlardan bağımsız kalır. Ülke ve casusluk görevleri
  kimliğe göre sıralanır; nesne eklenme sırası zarı başka ülkeye vermez.
- `storage.ts`: yeni seferlerde akışlar açıkça kaydedilir. Akışsız eski V1/V2/V3
  kayıtları değişmeden okunur; ilk zar sırasında eski sayısal dizinin devamından
  oluşturulur. Bozuk/kesirli/sınır dışı değerler ve eski tohumla tutarsız
  istihbarat durumu reddedilir. Eski eşzamanlı görevler için yeni kimlik sırası
  hangi görevin hangi zarı alacağını değiştirebilir; eski sayısal dizi korunur.
- `world-digest.ts`: nesne alanlarının eklenme sırasından bağımsız, dizi sırasına
  duyarlı `ew1` dünya parmak izi. Yeniden eşitlemede ve gün sınırında worker
  tarafından hesaplanır; her saatte ana iş parçacığını tam dünya taramasına
  zorlamaz. İki 32 bit denetim toplamıdır; kriptografik imza, kayıt özgünlüğü
  garantisi veya tam tekrar oynatma sistemi değildir.
- Komuta panelindeki kapalı **Simülasyon ölçümleri** bölümünde son kabul edilen
  saatin hesaplama/paket hazırlama süreleri, gönderilen ve tam durumun UTF-8 JSON
  eşdeğeri boyutları, son dünya özeti görülebilir. Boyutlar `postMessage` ikili
  aktarımının ölçülmüş bayt sayısı değildir. FPS ayrı bir çizim ölçümüdür.

**Otomatik doğrulama:** 14 dosyada 178 test geçti. Bunlara 100 saatlik fark
yeniden kurma, savaş ortasında kaydet/yükle sonrası aynı dünya özeti, 1×/5×
eşitliği, gerçek worker iletişimi, gecikmiş yanıtlar, V1/V2/V3 kayıt geçişleri,
casusluk sonuçları, komutlar, eşzamanlı kara hasarı ve çevrimdışı paket testleri
dahildir. Ayrıca bağımsız kontrolde 5.000 üretilmiş veri çifti yeniden kuruldu.

`npm run build` geçti. `scripts/test-europa-worker-browser.cjs` üretim
sunucusunda **14 tarayıcı kontrolünü** geçti: gerçek hareket/gün sınırı ve motor
eşitliği, ölçüm paneli, duraklatma/komut/yeni sefer/kayıt yarışları, bozuk saat
ve farkın atomik reddi, yeniden eşitleme, 390×844 dokunmatik kaydırma, gerçek
3D sahnede saat ilerletme ve önbellekten çevrimdışı worker başlatma. Sonuçta
sayfa hatası yoktu; ekran görüntüleri de incelendi. Mevcut kolay yönetimdeki
kapalı bölümleri testin gerçek kullanıcı yoluyla açması için eski test akışı
güncellendi. Uygulamanın yönetim tercihleri test için değiştirilmedi.

`node scripts/benchmark-europa-transfer.cjs` ile her biri 48 saatlik üç yükte
toplam **144 durum** ve dünya özeti motorla birebir eşleşti. Node 24/Linux
ölçümünde alıcı tarafındaki kopyalama+fark uygulama karşılaştırması:

| Senaryo | JSON eşdeğeri aktarım azalması | Fark alıcısı medyan | Tam dünya kopyası medyan |
| --- | ---: | ---: | ---: |
| Barış, 86 tümen | %91,31 | 0,43 ms | 2,15 ms |
| Grup hareketi, 86 tümen | %91,27 | 0,46 ms | 2,26 ms |
| Yük deneyi, 406 tümen ve 4 çatışma | %61,58 | 3,17 ms | 3,30 ms |

Yoğun savaşta alıcı p95 süresi 5,70 ms, tam kopyada 5,06 ms idi; her koşulda
daha hızlı işlem iddiası yoktur. Bunlar yerel Node ölçümleridir, gerçek telefon
FPS testi değildir. Tarayıcı dokunma denemesinde 44 kare ve 116,7 ms en uzun
kare aralığı gözlendi; takılmasızlık veya 60 FPS garantisi verilmez.
Tam raporlar çalışma ortamında `europa-foundation-tests.log`,
`europa-foundation-build.log`, `europa-foundation-browser/results.json` ve
`europa-transfer-benchmark.json` adlarıyla `/workspace/scratch/` altında.

**Kapsam sınırı:** Worker hâlâ her saat kendi dünyasını klonlayarak hesaplar;
otoritatif komut yürütme bütünüyle worker'a taşınmadı. Fark kabulü protokol/yapı
denetimidir; güvenilir aynı kaynak worker çıktısına her saatte dış kayıt şeması
yeniden uygulanmaz. Hava ve deniz çözümü hâlâ günlük mevcut kuralları kullanır;
bütün alanlarda eşzamanlı savaş, genel varlık muhasebesi, gerçek sevkiyat ve
paylaşılan ikmal kapasitesi bu aşamada tamamlanmış sayılmaz.

## 1–100 kapsamı: mevcut temel ve kalan işler

Dosya adları aksi belirtilmedikçe `app/games/europa-war/strategy/` altındadır.
Her satırdaki kapsam **kısmidir**; mevcut karşılık bulunmayan alt sistemler açıkça
belirtilir. Veri, hesap, oyuncu arayüzü, AI, 3D ve test tamamlığı birbirinin
yerine kullanılamaz.

| Bölümler / sistem | Mevcut çalışan temel ve kod karşılığı | Kalan ana bağımlılık veya kapsam |
| --- | --- | --- |
| 01–03 Hedef, kapsam, mimari | Tek oyunculu yerel kampanya; TypeScript alan modülleri, React arayüzü ve worker (`engine.ts`, `types.ts`). | Doğrulanmış HOI4 kaynak eşlemesi ve bütün katmanları kapsayan kabul ölçütleri tamamlanmadı. |
| 04–07 Dünya, komut, saat, worker | Kimlikli dünya, saatlik kara adımı ve eşzamanlı hasar, günlük ekonomi, atomik komutlar; kayıtlı ayrı RNG akışları, dönemsel dünya özeti, protokol 2 fark aktarımı ve tek bekleyen worker (`engine.ts`, `rng.ts`, `world-digest.ts`, `simulation-state.ts`, `simulation.ts`). | Genel varlık hareket defteri, tüm alt sistemlerde eşzamanlı çözüm ve komutların tamamen worker içinde yürütülmesi yok. Günlük stratejik ve saatlere dağıtılmış taktik AI emirleri ortak doğrulama yolundadır. |
| 08–10 Senaryo, tarih, coğrafya | 1936 başlangıcı, ülke/zorluk/tarihsel yönelim, 92 yönetim ve 909 hareket bölgesi; kara/deniz komşulukları (`map-data.json`, `world.ts`). | Ayrı 1939 senaryosu; kaynaklarıyla doğrulanmış küresel tarihsel sınırlar/karakterler; daha ayrıntılı eyalet–hareket bölgesi ve geçiş veri katmanları. |
| 11–12 3D arazi, şehir, tesis | Gerçek 3D arazi, su, şehir/tesis dekoru ve tekrarlı nesneler (`map3d-geometry.ts`, `map3d-scenery.ts`, `map3d-renderer.ts`). | Bütün coğrafyayı kapsayan ayrıntılı varlık seti, bölgesel varlık yükleme ve istenen tüm yüksek ayrıntı düzeyleri yok; mevcut modeller prosedüreldir. |
| 13–14 Kamera, seçim, harita modları | Kaydırma/yakınlaştırma, dokunma, şehir/birlik seçimi, küçük harita ve siyasi/askerî veri görünümleri (`WarMap3D.tsx`, `WarMap.tsx`, `useMapCamera.ts`). | Tam kutu seçimi ve şartnamedeki bütün tematik veri katmanları; yeni gözlem/ikmal modelleri tamamlandıkça bunlara bağlı kaplamalar. |
| 15–16 Birlik animasyonu, efektler | Temsilî asker/tank/top/kamyon, hareket, mevcut ve kısa sürede sonuçlanan gerçek çatışma efektleri, şehir ele geçirme gösterimi (`map3d-units.ts`, `map3d-unit-events.ts`). | Tüm hava/deniz/lojistik varlıklarının ayrı durumları ve özgün ses/uyarlanan atmosfer seti. Görsel efektler muharebe sonucunu belirlemez. |
| 17 Hava, mevsim, yerel saat | Mevcut görsel atmosfer ve saatli kampanya takvimi temelidir. | Bölgesel hava durumu, çamur/kar birikimi, iklim alışkanlığı ve boylama bağlı simülasyon saati yok. |
| 18 Yönetim arayüzü | Türkçe yönetim panelleri, komuta önerileri ve beş ayrı yardımcı yönetim seçeneği (`WarPanels.tsx`, `CommandCenter.tsx`, `management.ts`). | Genel arama, ayrıntılı neden/önizleme kapsamı, yapılandırılabilir bildirim/otomatik duraklama; inşaat/eğitim önizlemesi ve oyuncu emir geçmişi bu iterasyonda eklendi. |
| 19–22 Siyaset, yasalar, personel | İstikrar, savaş desteği/yorgunluğu, hükümet/partiler/kabine, ekonomi ve askerlik yasaları, eğitim için personel ayırma (`politics.ts`, `economy.ts`). | Ülkeye özgü parlamenter kurallar, kademeli seferberlik, ayrı yaralı/garnizon/taşıma havuzları ve gecikmeli personel dönüş muhasebesi. |
| 23–25 Odak, karar, ruh, kriz | Önkoşul/dışlama ve süreli odaklar, maliyetli kararlar, seçilmiş tarihsel olaylar, siyasi kriz/iç savaş (`catalog.ts`, `politics.ts`, `advanced-catalog.ts`). | Genel koşullu olay dili, süreli etki defteri, ulusal ruh/yönetim güç dengeleri ve kapsamlı olay zincirleri. |
| 26–28 İnşaat, kaynak, yakıt | Yapı kuyruğu, hasar/onarım, maden/rafineri/sentetik tesis, sınırlı kaynak ve yakıt üretimi/tüketimi (`economy.ts`, `economy-balance.ts`). | Ayrıntılı yapı yuvası ve onarım kapasitesi tahsisi, kömür/enerji/krom/tungsten modeli, yerel yakıt rezervleri. |
| 29–30 Üretim, stok, dönüşüm | Kapasiteye bağlı üretim hatları, verimlilik, tamamlanmamış üretim ilerlemesi ve tamamlanan ekipman ayrımı (`production.ts`). | Değişmez tasarım sürümleri, konuma/role göre depolar, modernizasyon ve dönüşüm muhasebesi. |
| 31–34 Ticaret, yardım, pazar, sanayi kuruluşları | Kaynak anlaşmaları, rotaya bağlı ticaret sonucu ve tek seferlik yardım (`economy.ts`, `diplomacy.ts`, `military-assets.ts`). | Sevkiyatta rezervasyon/teslimat, üretim lisansı, düzenli yardım, silah pazarı sözleşmeleri ve MIO uzmanlık/deneyim sistemi yok. |
| 35–36 Araştırma ve doktrin | Yuva/önkoşul/dönem cezası/ülke bonusu, araştırmayla model açılması; doktrin teknoloji olarak var (`politics.ts`, `catalog.ts`). | Deneyimle ilerleyen doktrin ustalığı, askerî gelenekler ve kurumlara bağlı ayrıntılı araştırma etkileri. |
| 37–40 Tasarımcılar ve ekipman | Sabit tank/uçak/gemi katalogları ve üretim maliyetleri (`catalog.ts`, `advanced-catalog.ts`, `production.ts`). | Modüler tasarımcılar, uyumluluk kuralları, sürümler/refit; gerçek tren, zırhlı tren, demiryolu topu ve konvoy stokları. |
| 41–43 Şablon, destek, eğitim | Sabit birlik türleri, gerçek ekipman tüketen destekler, eğitim kuyruğu; başkentten ayrılan ve fiziksel rotadan teslim edilen ücretli takviye yükleri (`planning.ts`, `economy.ts`, `reinforcements.ts`). | Tabur/alay şablonları, sürümler, bileşik istatistikler, erken konuşlanma ve sevkiyatlı eğitim. Takviye yükleri mevcut güç yüzdesi modeliyle çalışır. |
| 44–46 Komuta, karargâh, kaptan | General beceri/tecrübesi, 12 birlik sınırı, otomatik yeni komutan ve hedef sınır ataması (`commanders.ts`, `commander-roster.ts`). | Ordu grubu/tiyatro, sahra karargâhı, emir gücü, tümen komutanları, gemi kaptanları ve madalyalar. |
| 47–51 Hareket, cephe, savaş, kuşatma | Saatlik grup hareketi; arazi, mesafe ve mevcut ikmale göre maliyetli manuel/AI emir rotası, komutan sınır dağıtımı ve saldırı planı; hedef devlete özel saldır/savun, eşzamanlı hasar ve geri çekilme (`land.ts`, `land-movement-cost.ts`, `planning.ts`, `commanders.ts`). | Hava etkisi, stratejik demiryolu nakli, genişlik/rezerv/taktik/zırh/delme ve süreli geri çekilme. |
| 52–54 İkmal ve taşıma | Başkent bağlantısı, liman/deniz erişimi, yerel altyapı/hasar/yığılma; gerçek takviye yükleri için ortak tüketilen düğüm/hat kapasitesi ve teslim/dönüş/kayıp muhasebesi (`world.ts`, `reinforcements.ts`). | Günlük ikmal/ticaret/yardım ile aynı taşıma bütçesi, gerçek tren/kamyon/konvoy tahsisi, son kilometre ve yerel rezervler. Görsel trenler bağımsız dekor katmanıdır; yük defterinin yerine geçmez. |
| 55–58 Hava kuvvetleri | Stoktan kanat, üs yükü/menzil/hazırlık/yakıt, görevler, yakıtı ödenmiş kuvvetlerle eşzamanlı günlük kayıp/bombardıman ve paraşüt koşulları (`airnaval.ts`, `airnaval-resolution.ts`, `operations.ts`). | Pilot/tasarım sürümleri, tespit/temas/sorti evreleri, ayrıntılı görev bölgesi, bina bazlı hasar ve yükle paylaşılan nakliye kapasitesi. |
| 59–64 Donanma ve çıkarma | Tekil gemi, görev, intikal, yakıt, eşzamanlı günlük hasar, sabit bütçeli onarım, eskort/baskın ve taşıyıcı uçağı stoku (`airnaval.ts`, `airnaval-resolution.ts`, `military-assets.ts`). | Görev kuvveti hiyerarşisi, fazlı deniz muharebesi, mayınlar/antlaşmalar, gerçek taşıyıcı kanatları ve hazırlık/konvoy/yük tabanlı çıkarma. |
| 65–67 Diplomasi ve ittifak | Kabul hesabı, gerekçe, savaş, pakt, geçiş, yardım, ittifak ve barış (`diplomacy.ts`, `conference.ts`). | Süreçli teklifler, ittifak liderlik/kural/hedef/katkı varlığı, ortak tiyatrolar ve sahibi–denetleyicisi ayrı sefer kuvvetleri. |
| 68–70 İstihbarat ve savaş sisi | Ajan eğitimi, süreli operasyon/risk, sabotaj/propaganda/direniş ve süreli istihbarat seviyesi (`operations.ts`). | Bireysel ajan/ağ, seyahat ve hazırlık, kaynak rezervasyonu, işbirliği ve kategorili gözlem geçmişi; AI için oyuncuyla ortak eksik bilgi modeli yok. |
| 71–73 İşgal, bağlı devlet, iç savaş | Sahip/kontrol ayrımı, direniş/uyum/garnizon tüketimi, kukla/bağımsızlık ve gerçek iç savaş bölünmesi (`politics.ts`, `operations.ts`). | Ayrı iade edilebilir garnizon tahsisi, özerklik düzeyleri/sürgün, bölgesel sadakat, gönüllüler ve sınırlı sınır çatışmaları. |
| 74–75 Savaş kayıtları ve barış | VP/başkent etkili teslimiyet, katkı puanı ve çok taraflı bütçeli ilhak/kukla/serbest bırakma (`world.ts`, `conference.ts`). | Birinci sınıf savaş/blok/majör ülke kayıtları, olay bazlı katkı, kaynak hakkı, tazminat, gemi devri, kısıtlamalar ve süreli tahliye. |
| 76–77 Proje, bilim insanı, baskın | Normal araştırma, sabotaj ve sürekli bombardıman mevcut ortak temellerdir. | Ayrı araştırma tesisi/bilim insanı/prototip, tahsis edilmiş kuvvetle çok aşamalı baskın ve soyut stratejik silah sistemleri yok. |
| 78–82 Avrupa büyük güçleri ve Asya paketleri | Avrupa ülkeleri için genel ağaç; Almanya, Sovyetler, Britanya, Fransa ve İtalya ek odakları (`catalog.ts`). | Bölümlerde sayılan bütün ülkeler, parlamento/kurum rekabeti/özerklik/sürgün/birleşme içerikleri ve kaynaklı ülke paketleri tamamlanmadı. |
| 83–84 Türkiye ve Balkanlar | Türkiye sanayileşme, modernizasyon, Montrö, Balkan güvenliği ve tarafsızlık odakları (`catalog.ts`, `national.ts`). | Ayrıntılı iç gruplar, diplomatik boğaz rejimi, lisans/pazar bağlantıları ve ödüllerin inşaat/üretim/teslim süreçlerine dönüşmesi. Mevcut Montrö odağı tahkimat/ilişki etkisidir. |
| 85–90 Nordikler, diğer bölgeler, genel içerik | Haritada bulunan küçük ülkeler ortak ekonomi/araştırma/diplomasi/ordu döngüsünü kullanır (`map-data.json`, `catalog.ts`). | Eksik küçük tarihsel yönetimler, özgün bölgesel yollar, oluşturulabilir devletler, koşullu birleşme/bağımsızlık içerikleri ve kaynaklı envanter raporu. |
| 91–92 Stratejik/operasyonel AI | Haftaya dağıtılmış ekonomi/araştırma, 6/12/24 saatlik taktik kararlar, başkent muhafızı, toplam güce göre saldırı ve dağıtılmış takviye; geçici erişim ağı, ortak atomik komutlar (`ai.ts`, `ai-tactics.ts`, `ai-access.ts`, `commands.ts`). | Kalıcı hedef/histerezis, ayrıştırılmış karar puanı, ortak gözlem modeli, başarısızlıktan yeniden planlama ve birleşik çıkarma. Mevcut AI kesin düşman durumunu okuyabilir. |
| 93 Kayıt ve tekrar oynatma | V3 saatli kayıt, v1/v2 geçişi, boyut/şema/referans denetimi, yerel yuvalar ve IndexedDB otomatik kayıt (`storage.ts`, `storage-browser.ts`). | Tam komut günlüğü+snapshot replay, oyun/senaryo/içerik hash başlığı, içerik paketi doğrulaması. Sınırlı, doğrulanan komut makbuzları bu iterasyonda eklendi. |
| 94 Performans ve paketleme | Dört kalite seviyesi, instancing/görünürlük sınırları, FPS/geometri/doku ölçümü; saatlik worker fark aktarımı ve ayrı hesaplama/paket süreleri; çevrimdışı paket, WebGL kaybında 2D dönüş (`simulation-state.ts`, `SimulationMetrics.tsx`, `map3d-renderer.ts`, `offline-assets.ts`). | Otomatik WebGL geri yükleme, bölgesel varlık yükleme ve 10 yıllık bellek/perf değerlendirmesi. Üç yükte aktarım deneyi fiziksel cihaz testi veya 60 FPS garantisi değildir. |
| 95 Erişilebilirlik ve öğretici | Türkçe paneller, dokunma/klavye erişimi, sistem veya kullanıcı tercihli azaltılmış hareket (`WarMap3D.tsx`, `WarPanels.tsx`). | İngilizce/anahtarlı yerelleştirme, değiştirilebilir tuşlar, ayrıntılı UI ölçeği, ansiklopedi ve gerçek eylemlerle ilerleyen öğreticiler. |
| 96 Raporlar ve kampanya sonu | Ekonomik geçmiş grafikleri, olay günlüğü ve gerçek günlük hava/deniz kayıp–yakıt–hasar özeti (`WarPanels.tsx`, `AirNavalReport.tsx`, `types.ts`). | Aylık muhasebe raporu, birim/gemi tarihçesi, ölçülen kampanya hedefleri/başarımlar, zaman çizelgesi ve rapor dışa aktarımı. |
| 97–98 Değişmezler ve uçtan uca test | Motor, stok, savaş, AI, kayıt, worker ve harita regresyonları; çok ülkeyle 90 günlük ve 1936–1945 tarihsel kampanya testleri (`advanced.test.ts`, `campaign-scenarios.test.ts`, `engine.test.ts`, `simulation.test.ts`). | Saatlik kara ve kayıt regresyonları eklendi. Takviye sevkiyatı için kapasite, korunma ve kayıt testleri eklendi; genel kapasiteli ikmal/HQ/proje sistemlerinin bütünleşik kabulü tamamlanmadı. Genel property testleri ve fiziksel cihazlarda uzun sefer bellek/FPS profili ayrı iştir. |
| 99–100 Teslim ve referanslar | Bağımlılığa göre uygulama sırası bu belgede; özgün şartname değişmeden arşivlendi. | Sonraki modülleri ayrı kabul etme ve kaynakların bağımsız doğrulanması. Bütün özellikler tamamlandı veya canlıya dağıtıldı iddiası yok. |

## Sonraki bağımlılık sırası

1. Takviye yüklerinin rezervasyon/teslim/dönüş/kayıp ve ortak hat kapasitesi
   uygulandı. Sırada personel/ekipman sürümleri, eğitim/ticaret/yardım yükleri,
   gerçek taşıt stokları ve günlük ikmali aynı muhasebeye bağlamak var.
   Tasarımcılar ve HQ bu temeli atlayarak bağımsız ödül veya dekor olmamalı.
2. Ödenmiş görev katılımını ve varlık bazlı gerçek kayıp/hasar olaylarını
   kayda bağla; anlık destek sorguları ve 3D efektler aynı defteri kullansın.
   Eşzamanlı günlük hava/deniz hesabı, ayrı kayıtlı RNG akışları, dönemsel dünya
   özeti ve worker fark aktarımı uygulandı; bütün alanların sıralamadan bağımsız
   çözümü ve tam tekrar oynatma hâlâ ayrı iştir.

Bu kayıt yerel üretim derlemesi ve tarayıcı testlerinin sonucudur. Canlı
xarmygames.online dağıtımı bu çalışmada bağımsız doğrulanmadı.
