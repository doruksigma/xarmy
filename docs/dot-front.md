# Dot Front — kalıcı cephe, kuşatma ve yavaş taktik savaş

Oyun adresi **`/games/dot-front`**. Mevcut Next.js / React / TypeScript uygulamasının istemci bileşeni HTML5 Canvas kullanır. Bot maçı tamamen tarayıcıda hesaplanır. Ayrıca oda koduyla iki kişilik çevrim içi maç açılabilir; bu modda simülasyonu odayı açan kişinin tarayıcısı çalıştırır. Üyelik veya harici yapay zekâ hizmeti gerekmez.

## Oynanış

- Altı haritanın her biri **144 × 90 hücre** ve **50 şehir** içerir. Oyuncu ve yapay zekâ maça **25'er şehir** ve **25'er hafif orduyla** başlar. Her tam güçlü nokta **10.000 asker** temsil eder; başlangıç kuvveti taraf başına **250.000 askerdir**.
- Ordu hasar aldıkça sayısal gücü azalır: mevcut asker sayısı, can oranının 10.000 ile çarpılıp yukarı yuvarlanmasıdır. Hafif ve ağır orduların tam gücü aynı kişiyi temsil eder; farklı can/hasar değerleri ve savaş hızı korunur. **Tek tek orduların altında sayı gösterilmez; seçmek de bu etiketleri geri getirmez.** Sağ üstte iki tarafın bütün yaşayan askerleri ve ölenleri bulunur; kayıplar hem hayatta kalan orduların kısmi kayıplarını hem tamamen yok edilen orduları içerir. Yeni üretim kayıp sayısını azaltmaz. Çatışma, kuşatma ve ikmal kaynaklı ölümler yalnız bir kez sayılır.
- **Sınırdaki Cephe etiketleri bölgesel toplamları gösterir.** Harita üzerinde sabit 24 × 24 hücrelik bölümlerde, gerçek cephe çizgisine en fazla 12 hücre yakınlıktaki her yaşayan ordu yalnız bir en yakın bölüme sayılır. Mavi ve kırmızı toplamlar mevcut cana göre ayrı hesaplanır; gerideki birlikler yalnız sağ üstteki genel toplama dahildir. Kamera hareketi bölgesel sayıları değiştirmez; ordu hareketi, hasar, kayıp ve yeni cephe geometrisi değiştirir. Etiket yalnız görünür sınır parçasının yanında çizilir; telefon görünümü bir bölümün merkezini içermese de görünür parça için toplam gösterilir. Küçük ekranda çakışan etiketler seyreltilir. Bu gösterim ordulara emir vermez, araziyi veya kaydı değiştirmez.
- Sayılar mevcut can ve kayıtlı ordu kayıp sayaçlarından türetilir; 10.000 ayrı oyun varlığı oluşturulmaz, kayıt/ağ şeması sürüm 6 kalır. Eski kayıtlar aynı ordular ve can değerleriyle açılır. Önceki sürümlerde kayda hiç geçmemiş kırmızı ikmal kapasitesi ölümleri geçmişe dönük tahmin edilmez; yeni sürüm bunları da sayar.
- Harita düz renklerle çizilir: arazi `#a4c242`, orman `#38802f`, su `#2997f9`, kaya `#8c9089` ve koyu kaya içi `#6e736d`; cephe çizgisi siyahtır (`#000000`). Şehirler sarı (`#ffff00`) daire ve sahiplik halkasıyla, askerler büyük mavi (`#3700ff`)/kırmızı (`#ff0000`) noktalarla gösterilir; ağır birliklerin dış halkası vardır. Takım rengi arazi renginin üstüne boyanmaz; bağlantısız bölgeler taramayla belirtilir. Görsel değişim mevcut arazi yollarını veya kayıtlardaki bölge sahipliğini değiştirmez. Tabletlerde çizim çözünürlüğü ve harita önbelleklerinin boyutu sınırlandırılır; değişmeyen mini harita tekrar çizilmez.
- Askerler başlangıçta sınır boyunca farklı konumlara yayılır. **Komutan sistemi yoktur.** Her asker ayrı seçilebilir; Shift, seçim kutusu veya tümünü seçme ile birden fazla askere birlikte emir verilebilir.
- **Saldırı** askerleri cephe boyunca farklı konumlara dağıtarak rakip yönüne ilerletir. **Savunma** onları kendi taraflarındaki ayrı sınır konumlarına yerleştirir; uzak düşmanların peşine düşmez. Tek askere verilen hareket, saldırı, konum koruma veya çizili rota emri diğer askerleri değiştirmez.
- Görünen **cephe, kalıcı arazi kontrolünü** gösterir. Yaşayan askerler fiziksel olarak bulundukları yarım hücrelik alanları ele geçirir; uzak şehirlerin sahipliği cepheyi değiştirmez. Asker geri çekilince kazanılmış toprak silinmez; rakip o alana girerek veya tamamlanmış kuşatmayla geri alır. Aynı alanı iki taraf aynı anda tutuyorsa mevcut sahiplik korunur. Dağ ve su üzerinden kontrol damgalanmaz; köprüler geçiş sağlar. Askerler sınırda ortak bir noktaya yığılmayacak biçimde farklı hedeflere yayılır.
- **Rota çiz** ile haritada bir ok çizilebilir. Askerler çizilen ara noktaları sırayla izler; araziyi dikkate alan A* yol bulma dağ ve suyu aşmalarını engeller. Rota en fazla 128 kılavuz nokta taşır. Çizgi engelli alandan geçerse gerçek hareket hedefi geçilebilir alana uyarlanır. Çizilen ok, sıradaki nokta ve tamamlanmamış hareket kaydedilir.
- **Sahip olunan her şehir 60 oyun saniyesinde 10.000 kişilik bir ordu üretir.** Her şehrin kendi üretim sayacı ve hafif/ağır tercihi vardır; 25 bağlı şehir, kapasite uygunsa bir dakikada 25 ordu (250.000 asker) çıkarabilir. Tür değiştirmek o şehrin ilerlemesini sıfırlamaz. Şehir ele geçirildiğinde eski tür, üretim süresi ve toplanma noktası sıfırlanır; yeni sahibin üretimi sonraki simülasyon adımlarında başlar. Varsayılan 1× hızda 60 oyun saniyesi bir gerçek dakikadır.
- Hız seçenekleri **0,5×, 1×, 2× ve 3×**’tir; başlangıç **1×** olur. Seçilen çarpan simülasyonu ve oyun saatini birlikte etkiler. 1× altında temel hareket ve savaş belirgin biçimde yavaşlatılmıştır: hafif asker saniyede **0,4 hücre**, ağır asker **0,25 hücre** ilerler. Hafif saldırısı **3 saniyede 4 hasar**, ağır saldırısı **4,5 saniyede 10 hasar** verir. Şehir ele geçirmek **24 saniye** sürer. Oyun saatini topluca yavaşlatmak yerine hareket ve savaş değerleri ayarlanmıştır.
- **Tamamlanmış kuşatma:** Dost bir arazi parçasının kendi arka sınırına bağlantısı, kendi arka bölgesine bağlı düşman toprağıyla kesilmişse bu kapalı bölge bir sonraki simülasyon adımında kuşatan tarafa geçer. Bölgedeki şehirler de el değiştirir; eski yerel üretim ve şehir emirleri sıfırlanır. İçeride kalan rakip askerleri ölür ve haritadan kaldırılır; hiçbir asker taraf değiştirmez. Kendi arka sınırına ulaşan açık dost koridor kuşatmayı önler. Üst veya alt harita kenarına dayanmak tek başına koruma sağlamaz. Yalnız doğal engellerle ayrılmış başlangıç adaları düşmana devredilmez. İki taraf da kendi arka sınırından kopmuşsa gelişigüzel bir kazanan seçilmez. Tamamlanmış kuşatma için ayrıca bekleme süresi yoktur.
- **İkmal bağlantısının kesilmesi:** Tamamlanmış çevreleme oluşmasa bile asker kendi arka harita kenarına dost arazi üzerinden bağlanamıyorsa ikmalsiz kalabilir. Bu ayrı durumda hızı normalin **%75’i**, hasarı **%65’i** olur; **20 saniye** sonra saniyede **1,25 can** kaybetmeye başlar. Koridor açılınca sayaç ve ceza sıfırlanır. Bağlantısı kesilen şehrin kendi üretim saati mevcut değerinde durur; bağlantı açılınca devam eder. Diğer bağlı şehirler üretimlerini sürdürür.
- Her şehir 5 ikmal sağlar; başlangıç kapasitesi takım başına 125'tir. Hafif asker 1, ağır asker 2 ikmal kullanır. Kapasite doluyken bağlı şehirlerin üretim saatleri 60 saniyeye kadar ilerler; hazır asker kapasite açılana kadar şehirde bekler. Aynı anda hazır olan şehirler kapasiteyi aşmadan sırayla asker çıkarır. Şehir kaybıyla kapasite aşılırsa 15 saniyelik toparlanma süresinden sonra kararlı biçimde seçilmiş fazla birlikler can kaybeder.
- Orman hareketi yavaşlatır; ağır birlik daha çok etkilenir. Dağ/kaya ve su geçilemez; köprüler geçiş sağlar. Engellerin köşelerinden geçilmez ve dağların arkasından ateş edilmez.
- Rakibin hem yaşayan askerleri hem şehirleri kalmadığında maç kazanılır. Şehirsiz bir ordu şehir ele geçirerek devam edebilir. İki taraf aynı simülasyon adımında tamamen yok olursa beraberlik gösterilir.

## Mevcut site

Dot Front'un mevcut kartı ve `/games/dot-front` rotası kullanılır. İstenen eski **Nokta Cephesi** oyununun `/dots-of-war.html` dosyası, ana sayfa kartı ve yalnız ona ait çizim/stiller kaldırılır. Ana sayfanın oyun sayısı altıdan beşe güncellenir; Dot Front kartı şehir başına üretimi ve çevrim içi modu anlatır. Diğer dört oyun, ortak yerleşim, servisler, EnglishMeter gizlilik sayfaları ve altbilgi korunur. Çevrim içi odalar Dot Front'a ait API ve depolama alanını kullanır; mevcut satranç odalarının kayıtlarıyla karışmaz.

## Çevrim içi odalar

İki kişi **altı haneli oda koduyla** aynı maça girer. Odayı açan mavi, katılan kırmızı tarafı yönetir. Simülasyonu oda sahibinin tarayıcısı hesaplar; katılanın emirleri ve sıkıştırılmış maç görüntüleri aynı site üzerindeki HTTP uçlarıyla aktarılır. WebSocket veya sürekli çalışan bir oyun sunucusu eklenmez. Bu, arkadaşlar arasında oynanmak üzere ev sahibinin simülasyonuna güvenen bir modeldir; değiştirilmiş bir ev sahibi istemcisine karşı hile koruması sağlamaz.

Maçı başlatma, devam ettirme ve hız seçimi oda sahibindedir; iki oyuncu da duraklatabilir. Sekme gizlenmesi, bağlantının kopması veya sekiz saniyeden uzun haber alınamaması maçı duraklatır. İki oyuncu yeniden hazır olduğunda oda sahibi açıkça devam ettirir; eksik süre topluca simüle edilmez. Başlamış maçtan ayrılmak veya teslim olmak rakibi kazandırır. Oda sahipliği diğer oyuncuya aktarılmaz. Odalar iki saat sonra sona erer.

Güncel şehir üretimini kullanmak için iki oyuncu da yayın sonrasında oyun sayfasını yenilemelidir. Yeni durum paketleri yalnız sürüm 6 ile kabul edilir. Sunucuda zaten kayıtlı olan geçerli sürüm 5 oda durumu, kimlik doğrulamasından sonra bir kez sürüm 6'ya yükseltilir ve oda duraklatılır; oyuncular yenilendikten sonra oda sahibi devam ettirir. Bu özel dönüşüm yeni gelen eski host paketlerini kabul etmez ve sürüm 2/3/4 ağ kayıtlarına uygulanmaz.

Oda verileri mevcut Redis bağlantısıyla, ayrı `xarmy:dot-front:room:` ad alanında tutulur. Desteklenen ortam değişkeni çiftleri `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` veya `KV_REST_API_URL` / `KV_REST_API_TOKEN`'dır. Üretimde ortak Redis deposu gereklidir; tek makinedeki geliştirme için dosya deposu kullanılabilir. Gizli anahtarlar tarayıcıya gönderilmez. Çevrim içi maçlar bot maçının yerel **Devam Et** kaydının yerine yazılmaz.

## Kayıtlar

Güncel maç şeması **sürüm 6**'dır. Her askerin kendi emri, saldırı/savunma/elle yönetim tutumu, sonraki otomatik emir zamanı, ikmal kesintisi durumu ve süresi saklanır. Eski `pocketed` / `pocketTime` alan adları kayıt uyumluluğu için korunur. Konumlar, can, tür, saldırı bekleme süreleri, gerçek yol ve rota ilerlemesi; şehir sahiplikleri, ele geçirme ilerlemesi, üretilecek tür ve her şehrin ayrı 0–60 saniyelik üretim saati; ikmal sayaçları, maç süresi, zorluk, harita ve AI karar zamanı kayda dahildir. Ortak takım üretim sayacı `recruitment` kaldırılmıştır. Komutan, grup üyeliği veya lider alanı bulunmaz.

**Kalıcı arazi kontrolü de kaydedilir:** 288 × 180 yarım hücrenin her birinde geçilemez alan, mavi veya kırmızı kontrol bilgisi ve alan güncelleme sayacı bulunur. Kaydı yüklemek kazanılmış toprakları başlangıç çizgisine sıfırlamaz. İkmal bağlantısı, kaydedilmiş arazi kontrolünden yeniden hesaplanır; türetilmiş bağlantı önbelleği kaydedilmez.

Eski bir kaydı okumak kendi başına araziyi değiştirmez veya asker silmez. Maç devam ettirilince güncel kuşatma kuralı uygulanır: kayıtta tamamlanmış bir çevreleme varsa bölge ve şehirleri devredilir, içindeki kuşatılmış askerler kaldırılır. Bu sonuç normal kayda ve çevrim içi durum paketine yansır.

**Sürüm 5 maçları dönüştürülerek devam eder.** Eski sistemde takımın ortak saati yalnız etkin kaynak şehirde gösteriliyordu. O şehrin kaydedilmiş ilerlemesi korunur; diğer şehirler sıfırdan kendi sürelerini doldurmaya başlar. Ortak süre 25 şehre çoğaltılmaz. Eski kayıtta bir takımın birden fazla pozitif şehir saati varsa en ileri olanı, eşitlikte en küçük şehir kimliği korunur. Hiçbir şehirde görünmeyen, yalnız eski ortak sayaçta duran süre için yeni bir kaynak şehir uydurulmaz. Şehir türleri, asker kimlikleri, emirler, yollar, kuşatma ve arazi verisi değişmez.

**Sürüm 4 maçlarının bağımsız şehir saatleri aynen korunur.** Arazi kontrolü, ikmal kesintisi süreleri, askerler, emirler, yollar, ele geçirme ilerlemesi ve diğer maç alanları da korunur; şehir saatleri birleştirilmez veya sıfırlanmaz.

**Sürüm 3 maçları da dönüştürülebilir.** Bu eski biçimde arazi kontrol geçmişi bulunmadığından eski hareketlerden hayali bir toprak kazanımı çıkarılmaz. Yeni kontrol alanı başlangıçtaki iki taraflı paylaşım ve yalnızca askerlerin şu anda gerçekten tuttuğu alanlarla kurulur. Askerlerin kimlikleri, konumları, canları, emirleri, tutumları, yolları, şehir sahiplikleri, bağımsız üretim saatleri ve maç süresi korunur. Yeni ikmal durumu bu başlangıç alanından hesaplanır; geçmişe dönük kesinti süresi veya hasarı eklenmez.

**Sürüm 2 maçları da dönüştürülebilir.** Önce eski şema, komutan üyelikleri dahil bütünüyle doğrulanır; bozuk veriden yeni maç üretilmez. Eski komutan alanları kaldırılır; otomatik sınırda olan grubun askerleri Savunma, elle emir verilmiş grubunkiler elle yönetim tutumuyla devam eder. Her şehrin süre yüzdesi ayrı çevrilir: eski 10 saniyelik üretimde 5 saniye, 60 saniyelik ölçekte 30 saniyeye; eski 8 saniyelik ele geçirmede 4 saniye, 24 saniyelik ele geçirmede 12 saniyeye dönüşür. Arazi, sürüm 3 gibi başlangıç paylaşımı ve mevcut asker konumlarından kurulur.

Dönüşüm yalnızca eski sürüm yüklenirken uygulanır. Sürüm 6 yeniden yüklenince sayaçlar tekrar çarpılmaz, şehir saatleri değiştirilmez ve toprak yeniden oluşturulmaz. Menüde yerel kaydı okumak eski kaydı diskte değiştirmez; bir sonraki normal kayıt yeni şemayı yazar. Eksik/bozuk arazi dizileri, engelli hücrelerde kontrol iddiaları, geçersiz sahiplikler, sınır dışı şehir saatleri ve geçersiz ikmal kesintisi süreleri reddedilir. Sürüm 6 kaydında eski ortak takım sayacı bulunması da reddedilir.

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
npm run test:chess
npm exec tsc -- --noEmit --incremental false
npm run build
npm start
```

Test çalıştırıcısı oyun klasöründeki bütün `*.test.ts` dosyalarını derleyip çalıştırır. Testler harita erişimini, fiziksel hareketi, saldırı/savunmayı, yayılmayı, canlı cepheyi, tek asker seçimini, çizili rotaları, yavaş savaş değerlerini, her şehrin bağımsız 60 saniyelik üretimini, ikmali, kayıt doğrulamasını, kalıcı araziyi, kuşatmayı, sürüm 2/3/4/5 dönüşümlerini ve depolama hatalarını kapsar. Kayıt testleri denetimli IndexedDB/localStorage taklitleri kullanır; gerçek tarayıcı testi ayrıca raporlanır. Çevrim içi testler ayrı komutla da çalıştırılabilir.

Sürüm 6 değişikliğinin **41 kayıt ve paketleme testi geçti**; bu iki test dosyasının katı TypeScript derlemesi başarılıdır. Gerçek sürüm 3 motorundan altı haritanın 90–98 askerlik kayıtları, sürüm 4'ten 250 askerlik kayıt ve sürüm 5'ten iki kuşatma/koridor kaydı dönüştürüldü. Kimlikler, konumlar, emirler, mevcut arazi ve şehir saatleri korundu; aynı adımlarla devam eden kopyalar birebir aynı sonucu verdi. Sürüm 4'ün hazır 50 şehir kuyruğu 50 asker üretebildi; sürüm 5'in yalnız iki etkin şehir kuyruğu iki asker üretti. Canlı ağ paketinin eski sürüm 5'i reddettiği, yalnız kayıtlı oda yardımcısının doğrulanmış sürüm 5'i dönüştürdüğü ve bozuk/eski diğer biçimleri reddettiği doğrulandı.

Önceki şehir başına üretim güncellemesinde **203 oyun/istemci testi, 32 oda/depolama testi ve mevcut satranç oyununun 118 testi geçti** (toplam 353). O sürümün Next.js üretim derlemesi, proje genelindeki TypeScript ve lint kontrolü başarılıydı. Oda testleri kayıtlı sürüm 5'in kimlik doğrulamasından sonra tek seferlik yükseltilmesini, eski host paketlerinin reddini ve yeni sürümle devam etmeyi de kapsar.

Şehir başına üretim sürümünün yerel sunucusunda iki ayrı Chromium oturumuyla oda kurma, kodla katılma, kırmızı oyuncunun dokunarak rota çizmesi, ortak duraklatma/hız, sayfa yenileme, bağlantı kesilip geri gelmesi, teslim olma ve bot kaydına dönme akışı geçti. **60. oyun saniyesinde 50 şehrin her biri bir asker noktası üretti; her tarafın ordu sayısı 25'ten 50'ye çıktı.** Üçüncü oyuncunun dolu odaya katılması ve rakibin askerine emir göndermesi reddedildi. 390 piksel telefon benzetiminde taşma veya JavaScript hatası görülmedi; çevrim içi maç botun yerel kaydını değiştirmedi.

Şehir başına üretim sürümünün ayrı tarayıcı kontrolünde kapalı cepte asker ölümü ve şehir/arazi devri, aynı sonucun IndexedDB üzerinden tekrar açılması, açık koridorun korunması, dört hızın gerçek süre oranları, gizlenen sekmenin durması, altı haritanın 50 şehir/50 asker noktasıyla başlaması ve sayfa içi tam ekran alternatifi geçti. Canvas piksel verisinde düz renkler doğrulandı. Ana sayfada beş oyun bağlantısı korundu; eski Nokta Cephesi kartı kaldırıldı ve `/dots-of-war.html` 404 döndürüyor.

**Önceki 10.000 kişilik ordu güncellemesi:** 217 oyun/istemci ve 32 oda/depolama testi geçti. Next.js üretim derlemesi, TypeScript ve lint başarılıydı. Bu testler kısmi kayıpları, hafif/ağır orduların aynı kişi sayısını temsil etmesini, kayıp sayımının tek noktada yapılmasını, yeni üretimin kayıpları silmemesini ve yerel kayıt/online paketlerde aynı sayıların korunmasını kapsar. Diğer oyunların kaynakları değiştirilmedi; satranç testlerinin yukarıdaki 118 sonucu daha önceki teslimdendir.

Önceki ordu güncellemesinin tarayıcı kontrolünde başlangıçta iki tarafın 250.000 asker göstermesi, harita etiketlerinin 10.000 olması ve tablonun sağ üstte bulunması doğrulandı. Hasarlı kayıt 235.000/15.000 ile 222.500/27.500 yaşayan/ölen sayılarını verdi; IndexedDB Devam Et aynı sonucu korudu. Gerçek kapalı cepte 10.000 kişinin kaybı bir kez sayıldı; sonuç tablosu da aynı sayıları gösterdi. 390 piksel dokunmatik görünümde taşma ve JavaScript hatası görülmedi. Fiziksel tablet ve Safari testi yapılmadı.

Önceki ordu güncellemesinde iki ayrı Chromium oturumunda online oda/katılma, kırmızı oyuncunun dokunarak tek ordu seçip rota çizmesi, ortak duraklatma/3× hız, sayfa yenileme, bağlantı kesintisi, teslim olma ve bot kaydına dönme yeniden geçti. 60. saniyede bütün şehirlerden gelen 50 yeni orduyla her iki istemcinin tablosu taraf başına 500.000 asker gösterdi. Online görünümde yerel taraf ayrıca “Sen” etiketiyle belirtilir.

**Cephe toplamları güncellemesi:** 232 oyun/istemci ve 32 oda/depolama testi geçti (264 toplam); Next.js üretim derlemesi, TypeScript ve lint başarılıdır. 13 yeni hesaplama testi altı haritada tekil sayımı, en yakın sınır bölümünü, menzil sınırını, can/hareket/yeni birlik değişimlerini, kesik cepheleri ve önbellek kullanımını doğrular. Renderer testleri seçili ordular dahil tekil sayıların çizilmemesini, bölgesel toplamları ve dar ekranda görünür cephe parçasına yerleşmeyi kapsar.

Güncel Chromium üretim sunucusu kontrolünde mavi genel toplam 35.000 iken sınırdaki 25.000'in gösterildiği ve 10.000 kişilik arka ordunun yalnız genel toplamda kaldığı doğrulandı. Kırmızı cephe ve genel toplam 17.500 olarak eşleşti. Seçim, yakınlaştırma, sayfa içi tam ekran, IndexedDB Devam Et ve 390 × 844 / 844 × 390 dokunmatik yön değişimleri geçti; yatay taşma veya JavaScript hatası görülmedi. İki ayrı online oturumda bölgesel etiketler ve sağ üst toplamlar görünür kaldı; oda/katılma, tek ordu rotası, 60 saniyelik üretim, duraklatma, bağlantı kesintisi, yenileme, sonuç ve bot kaydına dönme yeniden geçti. Fiziksel tablet ve Safari denenmedi.

Telefon kontrolü tarayıcı benzetimidir; fiziksel cihaz, farklı operatör ağları ve uzun maçların insan oynanışıyla denge testi bu güncellemede ayrıca yapılmadı. Oda aktarımı HTTP üzerinden yaklaşık yarım saniyelik aralıklarla çalışır; gerçek bağlantı gecikmesi oyuncuların ağına bağlıdır.

## Tablet performansı ve değişen dosyalar

Dokunmatik cihazlarda Canvas çözünürlüğü en fazla 1× piksel oranı ve 1,5 milyon piksel ile sınırlıdır; çizim 30 kare/saniyeyi, mini harita yaklaşık 10 güncellemeyi hedefler. Sabit simülasyon adımları çizimden ayrıdır. Bir karede en fazla altı adım ve bekleyen işe göre 8–24 ms işlem bütçesi kullanılır; ertelenen simülasyon süresi sonraki karelere taşınır. Duraklatılan maçta yeniden çizim döngüsü uyur; devam, pencere boyutu veya yeni online durum onu uyandırır.

İki haritanın arazi raster önbelleği yaklaşık 27 MB yerine 1,7 MB tutar. Kamera dışındaki raster alanları çizilmez; değişmeyen mini harita ve sınır yolları yeniden oluşturulmaz. Cephe yalnız değişen satır/sütunlarda güncellenir, uzaklık alanları gerektiğinde hesaplanır. İkmal ve yakın asker aramaları daha az geçici dizi oluşturur. Online paketleme 51.840 arazi hücresini RLE öncesinde gereksiz yere klonlamaz; yeniden gönderilecek paket hâlâ bağımsız bir kopyadır.

Önceki tablet güncellemesinde aynı Chromium ortamında 1024 × 768 dokunmatik tablet, cihaz piksel oranı 2, **4× işlemci yavaşlatması** ve 3× oyun hızıyla yapılan 10 saniyelik karşılaştırma (şehir başına üretim sürümünün yeni ölçümü değildir):

| Başlangıç ordusu | Önce çizim FPS | Sonra çizim FPS | Önce / sonra kare aralığı p95 |
| --- | ---: | ---: | ---: |
| 50 asker | 10,2 | 28,3 | 145 / 50 ms |
| 250 asker | 4,3 | 16,6 | 307 / 84 ms |

Her iki sürüm aynı başlangıç kayıtlarını ve saldırı emirlerini kullandı; savaş boyunca asker kayıpları devam etti. Yeni sürüm başlangıçtaki 250 askeri topluca silerek hız kazanmadı. Ana Canvas bu senaryoda 1980 × 1086 yerine 990 × 543 piksel çiziyor. Zorlayıcı 250 asker/3× ölçümünde hâlâ 30 FPS ve tam 3× zamanlama sağlanamadı (yaklaşık 10 gerçek saniyede 27 oyun saniyesi); bütün tabletlerde kesintisiz performans garantisi verilmez. Aynı 250 asker ve 4× işlemci yavaşlatmasıyla varsayılan 1× hızda yaklaşık 22,8 çizim FPS ve 10 gerçek saniyede 10 oyun saniyesi ölçüldü. Ölçüm fiziksel tablet veya Safari testi değildir.

Şehir başına üretim sürümü ayrıca aynı 1024 × 768 / DPR 2 / 4× işlemci yavaşlatması koşullarında ölçüldü. 3× oyun hızındaki 10 saniyelik koşuda 50 askerle başlayan senaryo **29,1 FPS**, 250 askerle başlayan senaryo **24,7 FPS** verdi; kare aralığı p95 sırasıyla 48,6 ve 68 ms oldu. Her ikisinde yaklaşık 10 gerçek saniyede 30 oyun saniyesi ilerledi. Savaş devam ettiği için ölçüm sonunda asker sayıları 39 ve 191'di; sonuçlar sabit 250 asker veya bütün tabletler için garanti değildir. Canvas 990 × 543 piksel kaldı, sayfa taşması ve JavaScript hatası görülmedi. Toplu 60. saniye üretimi ayrıca iki oturumlu tarayıcı maçında doğrulandı.

10.000 kişilik ordu etiketleri ve yeni tabloyla aynı 4× işlemci yavaşlatmalı tablet benzetimi tekrarlandı: 50 orduyla başlayan 3× senaryo **29,2 FPS**, 250 orduyla başlayan senaryo **23,2 FPS** verdi (10 saniyelik ölçüm; kare aralığı p95 49,1 / 81,8 ms). Maç yaklaşık 30 oyun saniyesi ilerledi; çatışmalarda kayıplar sürdü. Canvas 990 × 543 piksel kaldı, taşma ve JavaScript hatası olmadı. Bunlar fiziksel tablet ölçümü veya her cihazda sabit FPS garantisi değildir.

Güncel bölgesel cephe etiketleriyle aynı 1024 × 768 dokunmatik / DPR 2 / 4× işlemci yavaşlatması / 3× oyun hızı senaryoları **28,9 FPS** (50 başlangıç ordusu) ve **22,9 FPS** (250 başlangıç ordusu) verdi. 10 gerçek saniyede yaklaşık 30 oyun saniyesi ilerledi; ordu kayıpları sürdü. Kare aralığı p95 49,8 / 70,6 ms, Canvas 990 × 543 piksel; taşma veya JavaScript hatası yok. Bölgesel hesaplama cephe geometrisini önbelleğe alır ve birlik başına yalnız yakın sınır parçalarını tarar; tüm arazi veya bütün cephe her karede her asker için taranmaz. Fiziksel cihaz performansı ayrıca ölçülmedi.

Cephe toplamları güncellemesi yalnız `app/games/dot-front/front-strength.ts` ve testleri, renderer/testleri, ortak oyun sözlüğü ve bu belgeyi değiştirir. Sağ üstteki ortak tablo “Toplam asker” başlığını kullanır. Oyun motoru, kayıt şeması, online uçlar, ana sayfa ve diğer oyun dosyaları değişmez. Önceki teslimde kaldırılan `public/dots-of-war.html` geri eklenmez. Yeni çalışma zamanı bağımlılığı veya varlık indirmesi yoktur; diğer dört oyun ve ortak yerleşim korunur.

## Yayına alma

Bu teslim bir **Next.js kaynak güncellemesidir**. Mevcut Git deposunun ve barındırma bağlantısının normal derleme/dağıtım akışı kullanılır. Sitenin çevre değişkenleri ve diğer oyun servisleri korunmalıdır; yeni bir statik ana sayfa mevcut sitenin üzerine kopyalanmamalıdır.
