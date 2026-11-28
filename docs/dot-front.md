# Dot Front — kalıcı cephe, kuşatma ve yavaş taktik savaş

Oyun adresi **`/games/dot-front`**. Mevcut Next.js / React / TypeScript uygulamasının istemci bileşeni HTML5 Canvas kullanır. Bot maçı tamamen tarayıcıda hesaplanır. Ayrıca oda koduyla iki kişilik çevrim içi maç açılabilir; bu modda simülasyonu odayı açan kişinin tarayıcısı çalıştırır. Üyelik veya harici yapay zekâ hizmeti gerekmez.

## Oynanış

- Altı haritanın her biri **144 × 90 hücre** ve **50 şehir** içerir. Oyuncu ve yapay zekâ maça **25'er şehir** ve **25'er hafif askerle** başlar.
- Askerler başlangıçta sınır boyunca farklı konumlara yayılır. **Komutan sistemi yoktur.** Her asker ayrı seçilebilir; Shift, seçim kutusu veya tümünü seçme ile birden fazla askere birlikte emir verilebilir.
- **Saldırı** askerleri cephe boyunca farklı konumlara dağıtarak rakip yönüne ilerletir. **Savunma** onları kendi taraflarındaki ayrı sınır konumlarına yerleştirir; uzak düşmanların peşine düşmez. Tek askere verilen hareket, saldırı, konum koruma veya çizili rota emri diğer askerleri değiştirmez.
- Görünen **cephe, kalıcı arazi kontrolünü** gösterir. Yaşayan askerler fiziksel olarak bulundukları yarım hücrelik alanları ele geçirir; uzak şehirlerin sahipliği cepheyi değiştirmez. Asker geri çekilince kazanılmış toprak silinmez, rakip o alana girerek geri alır. Aynı alanı iki taraf aynı anda tutuyorsa mevcut sahiplik korunur. Dağ ve su üzerinden kontrol damgalanmaz; köprüler geçiş sağlar. Askerler sınırda ortak bir noktaya yığılmayacak biçimde farklı hedeflere yayılır.
- **Rota çiz** ile haritada bir ok çizilebilir. Askerler çizilen ara noktaları sırayla izler; araziyi dikkate alan A* yol bulma dağ ve suyu aşmalarını engeller. Rota en fazla 128 kılavuz nokta taşır. Çizgi engelli alandan geçerse gerçek hareket hedefi geçilebilir alana uyarlanır. Çizilen ok, sıradaki nokta ve tamamlanmamış hareket kaydedilir.
- **Takım başına 60 oyun saniyesinde toplam bir asker** gelir. Takviyenin kaynağı, gerçek cepheye en yakın ve ikmal bağlantısı açık şehirdir; diğer şehirler aynı anda asker çıkarmaz. Takımın tek üretim sayacı kaynak şehir değişince korunur. Hafif/ağır seçimi şehir bazında tutulur ve seçilen kaynağın türü üretilir. Tür seçimi ilerlemeyi sıfırlamaz. Varsayılan 1× hızda bu süre bir gerçek dakikadır.
- Hız seçenekleri **0,5×, 1×, 2× ve 3×**’tir; başlangıç **1×** olur. Seçilen çarpan simülasyonu ve oyun saatini birlikte etkiler. 1× altında temel hareket ve savaş belirgin biçimde yavaşlatılmıştır: hafif asker saniyede **0,4 hücre**, ağır asker **0,25 hücre** ilerler. Hafif saldırısı **3 saniyede 4 hasar**, ağır saldırısı **4,5 saniyede 10 hasar** verir. Şehir ele geçirmek **24 saniye** sürer. Oyun saatini topluca yavaşlatmak yerine hareket ve savaş değerleri ayarlanmıştır.
- **Kuşatma:** Bir askerin tuttuğu alan, kendi takımının arka harita kenarına dost arazi üzerinden bağlanmıyorsa asker kuşatılmış sayılır. Çevrili bir şehir bu bağlantının yerini tutmaz. Kuşatılmış birliklerin hızı normalin **%75’i**, hasarı **%65’i** olur. **20 saniyelik** kurtulma süresinden sonra saniyede **1,25 can** kaybederler; koridor açılınca sayaç ve ceza durumu sıfırlanır. Bağlantısı kesilen şehir takviye kaynağı olamaz; başka uygun şehir seçilir. Hiç uygun şehir yoksa takım üretimi ilerlemesini kaybetmeden bekler.
- Her şehir 5 ikmal sağlar; başlangıç kapasitesi takım başına 125'tir. Hafif asker 1, ağır asker 2 ikmal kullanır. İkmal dolduğunda üretim bekler. Şehir kaybıyla kapasite aşılırsa 15 saniyelik toparlanma süresinden sonra kararlı biçimde seçilmiş fazla birlikler can kaybeder.
- Orman hareketi yavaşlatır; ağır birlik daha çok etkilenir. Dağ/kaya ve su geçilemez; köprüler geçiş sağlar. Engellerin köşelerinden geçilmez ve dağların arkasından ateş edilmez.
- Rakibin hem yaşayan askerleri hem şehirleri kalmadığında maç kazanılır. Şehirsiz bir ordu şehir ele geçirerek devam edebilir. İki taraf aynı simülasyon adımında tamamen yok olursa beraberlik gösterilir.

## Mevcut site

Dot Front'un mevcut kartı ve rotası kullanılır. Ana sayfa, diğer oyunlar, ortak yerleşim, oyun listeleri ve diğer oyunların servisleri korunur. Çevrim içi odalar Dot Front'a ait API ve depolama alanını kullanır; mevcut satranç odalarının kayıtlarıyla karışmaz. EnglishMeter gizlilik sayfaları ve ortak altbilgi korunur.

## Çevrim içi odalar

İki kişi **altı haneli oda koduyla** aynı maça girer. Odayı açan mavi, katılan kırmızı tarafı yönetir. Simülasyonu oda sahibinin tarayıcısı hesaplar; katılanın emirleri ve sıkıştırılmış maç görüntüleri aynı site üzerindeki HTTP uçlarıyla aktarılır. WebSocket veya sürekli çalışan bir oyun sunucusu eklenmez. Bu, arkadaşlar arasında oynanmak üzere ev sahibinin simülasyonuna güvenen bir modeldir; değiştirilmiş bir ev sahibi istemcisine karşı hile koruması sağlamaz.

Maçı başlatma, devam ettirme ve hız seçimi oda sahibindedir; iki oyuncu da duraklatabilir. Sekme gizlenmesi, bağlantının kopması veya sekiz saniyeden uzun haber alınamaması maçı duraklatır. İki oyuncu yeniden hazır olduğunda oda sahibi açıkça devam ettirir; eksik süre topluca simüle edilmez. Başlamış maçtan ayrılmak veya teslim olmak rakibi kazandırır. Oda sahipliği diğer oyuncuya aktarılmaz. Odalar iki saat sonra sona erer.

Oda verileri mevcut Redis bağlantısıyla, ayrı `xarmy:dot-front:room:` ad alanında tutulur. Desteklenen ortam değişkeni çiftleri `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` veya `KV_REST_API_URL` / `KV_REST_API_TOKEN`'dır. Üretimde ortak Redis deposu gereklidir; tek makinedeki geliştirme için dosya deposu kullanılabilir. Gizli anahtarlar tarayıcıya gönderilmez. Çevrim içi maçlar bot maçının yerel **Devam Et** kaydının yerine yazılmaz.

## Kayıtlar

Güncel maç şeması **sürüm 5**'tir. Her askerin kendi emri, saldırı/savunma/elle yönetim tutumu, sonraki otomatik emir zamanı, kuşatma durumu ve kuşatma süresi saklanır. Konumlar, can, tür, saldırı bekleme süreleri, gerçek yol ve rota ilerlemesi; şehir sahiplikleri, ele geçirme ilerlemesi ve üretilecek tür; iki takımın ayrı 0–60 saniyelik üretim sayaçları; ikmal sayaçları, maç süresi, zorluk, harita ve AI karar zamanı kayda dahildir. Şehirde görünen üretim saati yalnızca etkin kaynak şehrin takım sayacını yansıtır. Komutan, grup üyeliği veya lider alanı bulunmaz.

**Kalıcı arazi kontrolü de kaydedilir:** 288 × 180 yarım hücrenin her birinde geçilemez alan, mavi veya kırmızı kontrol bilgisi ve alan güncelleme sayacı bulunur. Kaydı yüklemek kazanılmış toprakları başlangıç çizgisine sıfırlamaz. İkmal bağlantısı, kaydedilmiş arazi kontrolünden yeniden hesaplanır; türetilmiş bağlantı önbelleği kaydedilmez.

**Yayındaki sürüm 4 maçları dönüştürülerek devam eder.** Kaydedilmiş arazi kontrolü, kuşatma süreleri, askerler, emirler, yollar, şehir ele geçirme ilerlemesi ve diğer maç alanları aynen korunur. Yalnızca eski paralel şehir üretimleri yeni takım üretimine uyarlanır: her takımın kendi şehirlerindeki en ileri üretim saati alınır; saatler toplanmaz. Diğer şehir saatleri sıfırlanır ve yeni kaynak şehir takım sayacını gösterir. Şehirlerin hafif/ağır tercihleri korunur. Uygun kaynak yoksa takım sayacı hazır durumda bekler. Böylece eski kaydı açmak aynı anda 25 asker üretmez.

**Sürüm 3 maçları da dönüştürülebilir.** Bu eski biçimde arazi kontrol geçmişi bulunmadığından eski hareketlerden hayali bir toprak kazanımı çıkarılmaz. Yeni kontrol alanı başlangıçtaki iki taraflı paylaşım ve yalnızca askerlerin şu anda gerçekten tuttuğu alanlarla kurulur. Askerlerin kimlikleri, konumları, canları, emirleri, tutumları, yolları, şehir sahiplikleri ve maç süresi korunur; şehir üretimleri yukarıdaki tek takım sayacına birleştirilir. Yeni kuşatma durumu bu başlangıç alanından hesaplanır; geçmişe dönük kuşatma süresi veya hasarı eklenmez.

**Sürüm 2 maçları da dönüştürülebilir.** Önce eski şema, komutan üyelikleri dahil bütünüyle doğrulanır; bozuk veriden yeni maç üretilmez. Eski komutan alanları kaldırılır; otomatik sınırda olan grubun askerleri Savunma, elle emir verilmiş grubunkiler elle yönetim tutumuyla devam eder. Önce sürelerin yüzdeleri çevrilir: eski 10 saniyelik üretimde 5 saniye, 60 saniyelik ölçekte 30 saniyeye; eski 8 saniyelik ele geçirmede 4 saniye, 24 saniyelik ele geçirmede 12 saniyeye dönüşür. Ardından takım başına en ileri üretim saati yeni ortak sayaca aktarılır. Arazi, sürüm 3 gibi başlangıç paylaşımı ve mevcut asker konumlarından kurulur.

Dönüşüm yalnızca eski sürüm yüklenirken uygulanır. Sürüm 5 yeniden yüklenince sayaçlar tekrar çarpılmaz, şehir saatleri yeniden birleştirilmez ve toprak yeniden oluşturulmaz. Menüde kaydı okumak eski kaydı diskte değiştirmez; bir sonraki normal kayıt yeni şemayı yazar. Eksik/bozuk arazi dizileri, engelli hücrelerde kontrol iddiaları, geçersiz sahiplikler, eksik/fazla takım sayaçları ve geçersiz kuşatma süreleri reddedilir.

Sürüm 1'in küçük haritası ve farklı şehir yerleşimi uyumsuzdur; bu kayıtlar açık bir uyarıyla reddedilir. Bozuk veya uyumsuz kayıt doğrulaması istatistikleri ya da ayarları silmez.

Depolama adları korunur:

- IndexedDB: `xarmy:dot-front:matches`, nesne deposu `data`, güncel maç anahtarı `current`.
- Tamamlanan maçlar: aynı depodaki `result:*` anahtarları.
- Ayarlar: localStorage içindeki `xarmy:dot-front:settings`.

Bot maçı yaklaşık 15 saniyede bir ve sekme gizlenince kayıt alır. Gizli sekmede maç duraklar; geri dönünce birikmiş süre uygulanmaz ve kullanıcı devam eder. IndexedDB açılışı ve işlemleri zaman aşımıyla korunur. Depolama kullanılamadığında bot maçı oynanabilir kalır, arayüz kayıt hatasını bildirir. Tamamlanan bot sonuçları maç kimliğiyle yalnızca bir kez sayılır.

## Çalıştırma ve doğrulama

Mevcut Node.js 24 gereksinimi ve npm kilit dosyası kullanılır.

```sh
npm ci
npm run dev
npm run test:dot-front
npm run test:dot-front-online
npm exec tsc -- --noEmit --incremental false
npm run build
npm start
```

Test çalıştırıcısı oyun klasöründeki bütün `*.test.ts` dosyalarını derleyip çalıştırır. Testler harita erişimini, fiziksel hareketi, saldırı/savunmayı, yayılmayı, canlı cepheyi, tek asker seçimini, çizili rotaları, yavaş savaş değerlerini, takım başına 60 saniyelik takviyeyi, ikmali, kayıt doğrulamasını, kalıcı araziyi, kuşatmayı, sürüm 2/3/4 dönüşümlerini ve depolama hatalarını kapsar. Kayıt testleri denetimli IndexedDB/localStorage taklitleri kullanır; gerçek tarayıcı testi ayrıca raporlanır. Çevrim içi testler ayrı komutla da çalıştırılabilir.

Kayıt değişikliğinde **25 kayıt testi geçti**. Önceki yayındaki gerçek sürüm 4 motorundan 250 askerlik kayıt ve sürüm 3 motorundan altı haritanın 90–98 askerlik kayıtları sürüm 5'e dönüştürüldü. Asker kimlikleri, konumları, emirleri, ele geçirme ilerlemesi ve sürüm 4 arazi/kuşatma verisi korundu; yalnızca üretim saatleri yukarıdaki kuralla birleştirildi. Kaydet/yükle sonrası aynı simülasyon adımları birebir aynı durumu verdi. Hazır bekleyen 50 eski şehir kuyruğunun ilk saniyede yalnızca iki toplam takviye ürettiği doğrulandı.

Son doğrulamada **161 oyun/istemci testi, 29 oda/depolama testi ve mevcut satranç oyununun 118 testi geçti**. Proje genelinde TypeScript kontrolü ve Next.js üretim derlemesi başarılıdır. Oda testleri yetkilendirmeyi, aynı anda katılmayı, tekrar gönderilen emirleri, eski durum paketlerini, yanlış takım emirlerini, bağlantı durumlarının yarışmasını ve teslim olma sonucunun korunmasını kapsar.

Yerel üretim sunucusunda iki ayrı Chromium oturumuyla oda kurma → kodla katılma → başlatma → kırmızı oyuncunun dokunarak tek asker seçip rota çizmesi → ortak duraklatma/hız → 60 oyun saniyesinde takım başına yalnızca bir asker → oyuncu ve oda sahibi sayfasını yenileme → bağlantıyı kesip geri açma → teslim olma → bot kaydına dönme akışı geçti. Üçüncü oyuncunun dolu odaya katılması ve rakibin askerine emir göndermesi reddedildi. Telefon benzetimi 390 piksel genişlikte taşma göstermedi; JavaScript çalışma hatası görülmedi. Çevrim içi maç botun yerel kaydını değiştirmedi.

Telefon kontrolü tarayıcı benzetimidir; fiziksel cihaz, farklı operatör ağları ve uzun maçların insan oynanışıyla denge testi bu güncellemede ayrıca yapılmadı. Oda aktarımı HTTP üzerinden yaklaşık yarım saniyelik aralıklarla çalışır; gerçek bağlantı gecikmesi oyuncuların ağına bağlıdır.

## Yayına alma

Bu teslim bir **Next.js kaynak güncellemesidir**. Mevcut Git deposunun ve barındırma bağlantısının normal derleme/dağıtım akışı kullanılır. Sitenin çevre değişkenleri ve diğer oyun servisleri korunmalıdır; yeni bir statik ana sayfa mevcut sitenin üzerine kopyalanmamalıdır.
