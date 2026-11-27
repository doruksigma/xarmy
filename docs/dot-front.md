# Dot Front — kalıcı cephe, kuşatma ve yavaş taktik savaş

Oyun adresi **`/games/dot-front`**. Mevcut Next.js / React / TypeScript uygulamasının istemci bileşeni HTML5 Canvas kullanır. Maç tamamen tarayıcıda hesaplanır; oyun sunucusu, üyelik, çok oyunculu mod veya harici yapay zekâ hizmeti gerektirmez.

## Oynanış

- Altı haritanın her biri **144 × 90 hücre** ve **50 şehir** içerir. Oyuncu ve yapay zekâ maça **25'er şehir** ve **25'er hafif askerle** başlar.
- Askerler başlangıçta sınır boyunca farklı konumlara yayılır. **Komutan sistemi yoktur.** Her asker ayrı seçilebilir; Shift, seçim kutusu veya tümünü seçme ile birden fazla askere birlikte emir verilebilir.
- **Saldırı** askerleri cephe boyunca farklı konumlara dağıtarak rakip yönüne ilerletir. **Savunma** onları kendi taraflarındaki ayrı sınır konumlarına yerleştirir; uzak düşmanların peşine düşmez. Tek askere verilen hareket, saldırı, konum koruma veya çizili rota emri diğer askerleri değiştirmez.
- Görünen **cephe, kalıcı arazi kontrolünü** gösterir. Yaşayan askerler fiziksel olarak bulundukları yarım hücrelik alanları ele geçirir; uzak şehirlerin sahipliği cepheyi değiştirmez. Asker geri çekilince kazanılmış toprak silinmez, rakip o alana girerek geri alır. Aynı alanı iki taraf aynı anda tutuyorsa mevcut sahiplik korunur. Dağ ve su üzerinden kontrol damgalanmaz; köprüler geçiş sağlar. Askerler sınırda ortak bir noktaya yığılmayacak biçimde farklı hedeflere yayılır.
- **Rota çiz** ile haritada bir ok çizilebilir. Askerler çizilen ara noktaları sırayla izler; araziyi dikkate alan A* yol bulma dağ ve suyu aşmalarını engeller. Rota en fazla 128 kılavuz nokta taşır. Çizgi engelli alandan geçerse gerçek hareket hedefi geçilebilir alana uyarlanır. Çizilen ok, sıradaki nokta ve tamamlanmamış hareket kaydedilir.
- Her sahip olunan şehir, ikmal uygunsa **60 oyun saniyesinde** bir asker üretir. Hafif ve ağır türlerin üretim süresi aynıdır; tür seçimi mevcut ilerlemeyi sıfırlamaz. Varsayılan 1× hızda bu süre bir gerçek dakikadır.
- Hız seçenekleri **0,5×, 1×, 2× ve 3×**’tir; başlangıç **1×** olur. Seçilen çarpan simülasyonu ve oyun saatini birlikte etkiler. 1× altında temel hareket ve savaş belirgin biçimde yavaşlatılmıştır: hafif asker saniyede **0,4 hücre**, ağır asker **0,25 hücre** ilerler. Hafif saldırısı **3 saniyede 4 hasar**, ağır saldırısı **4,5 saniyede 10 hasar** verir. Şehir ele geçirmek **24 saniye** sürer. Oyun saatini topluca yavaşlatmak yerine hareket ve savaş değerleri ayarlanmıştır.
- **Kuşatma:** Bir askerin tuttuğu alan, kendi takımının arka harita kenarına dost arazi üzerinden bağlanmıyorsa asker kuşatılmış sayılır. Çevrili bir şehir bu bağlantının yerini tutmaz. Kuşatılmış birliklerin hızı normalin **%75’i**, hasarı **%65’i** olur. **20 saniyelik** kurtulma süresinden sonra saniyede **1,25 can** kaybederler; koridor açılınca sayaç ve ceza durumu sıfırlanır. Aynı biçimde bağlantısı kesilen şehirlerin üretimi, ilerlemesini kaybetmeden bekler.
- Her şehir 5 ikmal sağlar; başlangıç kapasitesi takım başına 125'tir. Hafif asker 1, ağır asker 2 ikmal kullanır. İkmal dolduğunda üretim bekler. Şehir kaybıyla kapasite aşılırsa 15 saniyelik toparlanma süresinden sonra kararlı biçimde seçilmiş fazla birlikler can kaybeder.
- Orman hareketi yavaşlatır; ağır birlik daha çok etkilenir. Dağ/kaya ve su geçilemez; köprüler geçiş sağlar. Engellerin köşelerinden geçilmez ve dağların arkasından ateş edilmez.
- Rakibin hem yaşayan askerleri hem şehirleri kalmadığında maç kazanılır. Şehirsiz bir ordu şehir ele geçirerek devam edebilir. İki taraf aynı simülasyon adımında tamamen yok olursa beraberlik gösterilir.

## Mevcut site

Dot Front'un mevcut kartı ve rotası kullanılır. Ana sayfa, diğer oyunlar, ortak yerleşim, oyun listeleri, diğer oyunların servisleri ve barındırma ayarları değiştirilmez. Bu güncellemedeki değişiklikler `app/games/dot-front/` ve bu belgeyle sınırlıdır. Yeni çalışma zamanı bağımlılığı eklenmez. Oyun ve bu belge dışındaki 453 izlenen dosyanın yayın öncesi `f310127` ana dal sürümüyle birebir aynı olduğu doğrulanmıştır; EnglishMeter gizlilik sayfaları ve ortak altbilgi de korunur.

## Kayıtlar

Güncel maç şeması **sürüm 4**'tür. Her askerin kendi emri, saldırı/savunma/elle yönetim tutumu, sonraki otomatik emir zamanı, kuşatma durumu ve kuşatma süresi saklanır. Konumlar, can, tür, saldırı bekleme süreleri, gerçek yol ve rota ilerlemesi; şehir sahiplikleri, üretim ve ele geçirme ilerlemesi; ikmal sayaçları, maç süresi, zorluk, harita ve AI karar zamanı kayda dahildir. Komutan, grup üyeliği veya lider alanı bulunmaz.

**Kalıcı arazi kontrolü de kaydedilir:** 288 × 180 yarım hücrenin her birinde geçilemez alan, mavi veya kırmızı kontrol bilgisi ve alan güncelleme sayacı bulunur. Kaydı yüklemek kazanılmış toprakları başlangıç çizgisine sıfırlamaz. İkmal bağlantısı, kaydedilmiş arazi kontrolünden yeniden hesaplanır; türetilmiş bağlantı önbelleği kaydedilmez.

**Yayındaki sürüm 3 maçları dönüştürülerek devam eder.** Bu eski biçimde arazi kontrol geçmişi bulunmadığından eski hareketlerden hayali bir toprak kazanımı çıkarılmaz. Yeni kontrol alanı başlangıçtaki iki taraflı paylaşım ve yalnızca askerlerin şu anda gerçekten tuttuğu alanlarla kurulur. Askerlerin kimlikleri, konumları, canları, emirleri, tutumları, yolları, şehir sahiplikleri, tüm eski sayaçlar ve maç süresi aynen korunur. Yeni kuşatma durumu bu başlangıç alanından hesaplanır; geçmişe dönük kuşatma süresi veya hasarı eklenmez.

**Sürüm 2 maçları da dönüştürülebilir.** Önce eski şema, komutan üyelikleri dahil bütünüyle doğrulanır; bozuk veriden yeni maç üretilmez. Eski komutan alanları kaldırılır; otomatik sınırda olan grubun askerleri Savunma, elle emir verilmiş grubunkiler elle yönetim tutumuyla devam eder. Üretim ve ele geçirme yüzdeleri korunur: eski 10 saniyelik üretimde 5 saniye, yeni 60 saniyelik üretimde 30 saniyeye; eski 8 saniyelik ele geçirmede 4 saniye, yeni 24 saniyelik ele geçirmede 12 saniyeye dönüşür. Arazi, sürüm 3 gibi başlangıç paylaşımı ve mevcut asker konumlarından kurulur.

Dönüşüm yalnızca eski sürüm yüklenirken uygulanır. Sürüm 4 yeniden yüklenince sayaçlar tekrar çarpılmaz ve toprak yeniden oluşturulmaz. Menüde kaydı okumak eski kaydı diskte değiştirmez; bir sonraki normal kayıt yeni şemayı yazar. Eksik/bozuk arazi dizileri, engelli hücrelerde kontrol iddiaları, geçersiz sahiplikler, sayaçlar ve kuşatma süreleri reddedilir.

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

Test çalıştırıcısı oyun klasöründeki bütün `*.test.ts` dosyalarını derleyip çalıştırır. Testler harita erişimini, fiziksel hareketi, saldırı/savunmayı, yayılmayı, canlı cepheyi, tek asker seçimini, çizili rotaları, yavaş savaş değerlerini, 60 saniyelik üretimi, ikmali, kayıt doğrulamasını, kalıcı araziyi, kuşatmayı, sürüm 2/3 dönüşümlerini ve depolama hatalarını kapsar. Kayıt testleri denetimli IndexedDB/localStorage taklitleri kullanır; gerçek tarayıcı testi ayrıca raporlanır.

Bu güncellemede **120 otomatik test geçti**. Proje genelinde TypeScript kontrolü ve üretim derlemesi başarılıdır. Testler fiziksel işgalin kalıcılığını, rakibin aynı bölgeye gelerek geri almasını, kapalı kuşatmayı, ikmal koridorunun yeniden açılmasını, üretimin ilerlemesini koruyarak beklemesini ve 0,5×/1×/2×/3× zamanlamasını kapsar. Yapay zekâ altı haritada dörder oyun dakikası simüle edildi; her haritada gerçek ateş, düşman kayıpları ve düşman toprağının işgali doğrulandı. Ölçümde beş haritada ilave şehir aldı. Önceki yayındaki gerçek sürüm 3 motorundan alınan altı maç kaydı da mevcut alanları korunarak dönüştürüldü.

Yerel üretim sunucusunda Chromium ile masaüstü ve 390 piksel telefon benzetiminde tek asker seçimi, fare/dokunmatik rota çizimi, emirler, duraklatma, gerçek IndexedDB kaydından devam ve yeniden oynama denendi. Ayrı kuşatma senaryosunda 20 saniyelik süreden sonra can kaybı, yalıtılmış şehirde üretimin durması, kayıt sonrası bölge/sayaçların korunması ve koridor açılınca cezaların kalkması doğrulandı. Dört hızın gerçek zamanla oranı da tarayıcıda ölçüldü.

768 × 1024 tablet benzetiminde, gerçek üretimle oluşmuş **250 asker ve 3× hızla** beş saniyelik ölçümde ortalama kare aralığı **16,72 ms** (yaklaşık 60 kare/saniye), yüzde 95 dilimi **16,7 ms** oldu. Yatay taşma veya JavaScript hatası görülmedi. Bu kısa yerel ölçüm bütün cihazlarda performans garantisi değildir. Fiziksel telefon/tablet, ses, tam ekran ve uzun maçların insan oynanışıyla denge testi bu güncellemede ayrıca yapılmadı.

## Yayına alma

Bu teslim bir **Next.js kaynak güncellemesidir**. Mevcut Git deposunun ve barındırma bağlantısının normal derleme/dağıtım akışı kullanılır. Sitenin çevre değişkenleri ve diğer oyun servisleri korunmalıdır; yeni bir statik ana sayfa mevcut sitenin üzerine kopyalanmamalıdır.
