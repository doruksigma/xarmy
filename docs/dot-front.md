# Dot Front — yavaş taktik savaş ve canlı cephe

Oyun adresi **`/games/dot-front`**. Mevcut Next.js / React / TypeScript uygulamasının istemci bileşeni HTML5 Canvas kullanır. Maç tamamen tarayıcıda hesaplanır; oyun sunucusu, üyelik, çok oyunculu mod veya harici yapay zekâ hizmeti gerektirmez.

## Oynanış

- Altı haritanın her biri **144 × 90 hücre** ve **50 şehir** içerir. Oyuncu ve yapay zekâ maça **25'er şehir** ve **25'er hafif askerle** başlar.
- Askerler başlangıçta sınır boyunca farklı konumlara yayılır. **Komutan sistemi yoktur.** Her asker ayrı seçilebilir; Shift, seçim kutusu veya tümünü seçme ile birden fazla askere birlikte emir verilebilir.
- **Saldırı** askerleri cephe boyunca farklı konumlara dağıtarak rakip yönüne ilerletir. **Savunma** onları kendi taraflarındaki ayrı sınır konumlarına yerleştirir; uzak düşmanların peşine düşmez. Tek askere verilen hareket, saldırı, konum koruma veya çizili rota emri diğer askerleri değiştirmez.
- Görünen **canlı cephe**, yaşayan askerlerin konumlarından hesaplanır; şehir sahipliğinden bağımsızdır. Askerlerin küçük hareketleri de çizgiye yansır. Askerlerin sınırdaki hedefleri ortak bir noktaya yığılmayacak şekilde dağıtılır. Şehir ele geçirme ve ikmal sahipliği ayrı kurallarla devam eder.
- **Rota çiz** ile haritada bir ok çizilebilir. Askerler çizilen ara noktaları sırayla izler; araziyi dikkate alan A* yol bulma dağ ve suyu aşmalarını engeller. Rota en fazla 128 kılavuz nokta taşır. Çizgi engelli alandan geçerse gerçek hareket hedefi geçilebilir alana uyarlanır. Çizilen ok, sıradaki nokta ve tamamlanmamış hareket kaydedilir.
- Her sahip olunan şehir, ikmal uygunsa **60 oyun saniyesinde** bir asker üretir. Hafif ve ağır türlerin üretim süresi aynıdır; tür seçimi mevcut ilerlemeyi sıfırlamaz. Varsayılan 1× hızda bu süre bir gerçek dakikadır.
- Hareket ve savaş belirgin biçimde yavaşlatılmıştır: hafif asker saniyede **0,4 hücre**, ağır asker **0,25 hücre** ilerler. Hafif saldırısı **3 saniyede 4 hasar**, ağır saldırısı **4,5 saniyede 10 hasar** verir. Şehir ele geçirmek **24 saniye** sürer. Oyun saatini topluca yavaşlatmak yerine hareket ve savaş değerleri ayarlanmıştır.
- Her şehir 5 ikmal sağlar; başlangıç kapasitesi takım başına 125'tir. Hafif asker 1, ağır asker 2 ikmal kullanır. İkmal dolduğunda üretim bekler. Şehir kaybıyla kapasite aşılırsa 15 saniyelik toparlanma süresinden sonra kararlı biçimde seçilmiş fazla birlikler can kaybeder.
- Orman hareketi yavaşlatır; ağır birlik daha çok etkilenir. Dağ/kaya ve su geçilemez; köprüler geçiş sağlar. Engellerin köşelerinden geçilmez ve dağların arkasından ateş edilmez.
- Rakibin hem yaşayan askerleri hem şehirleri kalmadığında maç kazanılır. Şehirsiz bir ordu şehir ele geçirerek devam edebilir. İki taraf aynı simülasyon adımında tamamen yok olursa beraberlik gösterilir.

## Mevcut site

Dot Front'un mevcut kartı ve rotası kullanılır. Ana sayfa, diğer oyunlar, ortak yerleşim, oyun listeleri, diğer oyunların servisleri ve barındırma ayarları değiştirilmez. Bu güncellemedeki değişiklikler `app/games/dot-front/` ve bu belgeyle sınırlıdır. Yeni çalışma zamanı bağımlılığı eklenmez. Yayın öncesinde deponun `dea67e3` sürümündeki yeni EnglishMeter gizlilik sayfaları ve ortak altbilgi değişikliği de çalışma kopyasına alınarak korunmuştur.

## Kayıtlar

Güncel maç şeması **sürüm 3**'tür. Bu biçimde komutan, grup üyeliği veya lider alanı bulunmaz. Her askerin kendi emri, saldırı/savunma/elle yönetim tutumu ve sonraki otomatik emir zamanı saklanır. Konumlar, can, tür, saldırı bekleme süreleri, gerçek yol ve rota ilerlemesi; şehir sahiplikleri, üretim ve ele geçirme ilerlemesi; ikmal sayaçları, maç süresi, zorluk, harita ve AI karar zamanı kayda dahildir. Canlı cephe, kayıtlı asker konumlarından yeniden hesaplanır.

**Yayındaki sürüm 2 maçları dönüştürülerek devam eder.** Önce eski şema, komutan üyelikleri dahil bütünüyle doğrulanır; bozuk veriden yeni maç üretilmez. Dönüşümde eski komutan alanları kaldırılır. Otomatik sınırda olan eski grupların askerleri Savunma, elle emir verilenlerin askerleri elle yönetim tutumuyla devam eder. Kimlikler, konumlar, canlar, yollar, asker emirleri, şehir sahipliği ve maç süresi korunur.

Tamamlanma yüzdeleri korunur: eski 10 saniyelik üretimde 5 saniye, yeni 60 saniyelik üretimde 30 saniyeye dönüşür. Eski 8 saniyelik ele geçirmede 4 saniye, yeni 24 saniyelik ele geçirmede 12 saniyeye dönüşür. Dönüşüm yalnızca sürüm 2 yüklenirken uygulanır; sürüm 3 yeniden yüklenince sayaçlar tekrar çarpılmaz. Menüde yalnızca kaydı okumak eski kaydı diskte değiştirmez; bir sonraki normal kayıt yeni şemayı yazar.

Sürüm 1'in küçük haritası ve farklı şehir yerleşimi uyumsuzdur; bu kayıtlar açık bir uyarıyla reddedilir. Bozuk veya uyumsuz kayıt doğrulaması istatistikleri ya da ayarları silmez.

Depolama adları korunur:

- IndexedDB: `xarmy:dot-front:matches`, nesne deposu `data`, güncel maç anahtarı `current`.
- Tamamlanan maçlar: aynı depodaki `result:*` anahtarları.
- Ayarlar: localStorage içindeki `xarmy:dot-front:settings`.

Oyun yaklaşık 15 saniyede bir ve sekme gizlenince kayıt alır. Gizli sekmede maç duraklar; geri dönünce birikmiş süre uygulanmaz ve kullanıcı devam eder. IndexedDB açılışı ve işlemleri zaman aşımıyla korunur. Depolama kullanılamadığında maç oynanabilir kalır, arayüz kayıt hatasını bildirir. Tamamlanan sonuçlar maç kimliğiyle yalnızca bir kez sayılır.

## Çalıştırma ve doğrulama

Mevcut Node.js 24 gereksinimi ve npm kilit dosyası kullanılır.

```sh
npm ci
npm run dev
npm run test:dot-front
npm exec tsc -- --noEmit --incremental false
npm run build
npm start
```

Test çalıştırıcısı oyun klasöründeki bütün `*.test.ts` dosyalarını derleyip çalıştırır. Testler harita erişimini, fiziksel hareketi, saldırı/savunmayı, yayılmayı, canlı cepheyi, tek asker seçimini, çizili rotaları, yavaş savaş değerlerini, 60 saniyelik üretimi, ikmali, kayıt doğrulamasını, sürüm 2 dönüşümünü ve depolama hatalarını kapsar. Kayıt testleri denetimli IndexedDB/localStorage taklitleri kullanır; gerçek tarayıcı testi ayrıca raporlanır.

Bu güncellemede **90 otomatik test geçti**. Proje genelinde TypeScript kontrolü ve üretim derlemesi başarılıdır. Altı haritanın erişilebilirliği, 60 saniyelik üretim, tek asker emirleri, canlı cephe dağılımı ve kayıt dönüşümü otomatik testlerle doğrulandı. Ayrıca önceki yayındaki `8303ef7` motorunun ürettiği altı gerçek sürüm 2 maç kaydı yeni şemaya başarıyla dönüştürüldü.

Yerel üretim sunucusunda Chromium ile masaüstü ve 390 piksel telefon görünümünde tek asker seçimi, fareyle ve dokunarak rota çizme, saldırı/savunma, bütün orduyu sınıra yayma, duraklatma, gerçek IndexedDB kaydından devam, 60 saniyelik üretim göstergesi, hız seçimi, teslim olma ve yeniden oynama kontrol edildi. Yatay taşma veya JavaScript hatası görülmedi. 768 × 1024 tablet benzetiminde gerçek simülasyondan alınan **229 askerle** üç saniyelik ölçümde ortalama kare aralığı **17,04 ms** (yaklaşık 59 kare/saniye), yüzde 95 dilimi **16,8 ms** oldu.

Bu ölçümler fiziksel telefon/tablet testi veya bütün cihazlarda performans garantisi değildir. Ses, tam ekran ve uzun maçların insan oynanışıyla denge testi bu güncellemede ayrıca yapılmadı.

## Yayına alma

Bu teslim bir **Next.js kaynak güncellemesidir**. Mevcut Git deposunun ve barındırma bağlantısının normal derleme/dağıtım akışı kullanılır. Sitenin çevre değişkenleri ve diğer oyun servisleri korunmalıdır; yeni bir statik ana sayfa mevcut sitenin üzerine kopyalanmamalıdır.
