# Europa War — 3D görünümün kullanımı ve sınırları

Harita aynı seferin iki sunumuna sahiptir: **3D arazi** ve **2D siyasi harita**.
Görünümü değiştirmek zamanı ilerletmez, orduyu taşımaz ve savaşın hesabını
değiştirmez. Üstteki harita modu iki görünümde de siyasi, askerî, arazi,
ikmal, hava ve deniz renklerini seçer.

## Kontroller

- Haritayı sürükle: kaydır. Tekerlek veya iki parmak: yakınlaştır/uzaklaştır.
- Orta fare tuşuyla sürükle veya iki parmakla döndür: kamerayı döndür.
- Şehre dokun/tıkla: aynı bölge bilgi panelini aç. Başkent adları sürekli,
  diğer şehir adı yalnız seçildiğinde gösterilir; şehir araması kamerayı taşır.
- Birlik işaretine tıkla: o konum ve hareket hedefindeki birlik grubunu seç.
  Shift ile ekle veya Shift+sürükle ile kendi tümenlerini kutu içine al.
- Seçili tümenlerle hedefe sağ tıkla: mevcut hareket doğrulamasından geçen
  grup emri ver. Telefonda ordu panelindeki hedef seçme emrini kullan.
- Sol alt kamera düğmeleri: yakınlaş, uzaklaş, başkente git, tüm harita ve
  seçili tümenlere git. Odak haritadayken WASD/oklar kaydırır; Home sıfırlar.
- Alttaki komutan portreleri, 12 tümen sınırı ve hedef ülkeye özel sınır
  yerleşimi aynı sefer komutlarını kullanır.
- **Animasyonlar:** Otomatik cihazın hareket tercihine uyar; Açık hareketi
  etkinleştirir; Azaltılmış sabit görünüm kullanır. Tercih cihazda saklanır.
- Telefonda bakış, grafik ve animasyon seçenekleri **Görünüm ayarları**
  düğmesinin içindedir. Açıp kapatmak haritayı veya seferi sıfırlamaz;
  masaüstünde bu üç seçenek doğrudan görünür.
- Normal **1×** hızda her oyun saati için hesaplama bitiminden sonra **500 ms**
  beklenir; bir gün 24 saatlik gerçek adımdan oluşur ve en az **12 saniye** sürer. 2–5×
  aynı taban hızın çarpanlarıdır. Hesaplama süresi buna eklenebilir; yavaş
  cihazlarda kaçırılan saatler biriktirilip peş peşe işletilmez.

## Grafik ve maliyet

Telefonlarda ilk ayar **Düşük**, masaüstünde **Orta**. Düşük/Orta/Yüksek/Ultra
seçenekleri piksel yoğunluğunu, gölgeyi ve dekor yoğunluğunu değiştirir.
Tercih cihazda saklanır. Düşükte duraklatılmış harita, görünür tren yoksa ihtiyaç üzerine çizilir;
gizlenen sekmede çizim döngüsü durur. Diğer ayarlardaki 60 FPS çizim tavanı,
donanımda ölçülmüş 60 FPS garantisi değildir.

Arazi ve sınırlar birleşik geometridir. Ev, ağaç, tesis ve temsilî birlik
parçaları instanced çizilir; uzak görünümde küçük ayrıntılar gizlenir.
Renk güncellemeleri araziyi yeniden üretmez. Sahne, grafik tamponları,
dinleyiciler ve animasyon döngüsü görünüm kapatılırken temizlenir. WebGL
başlatılamaz veya bağlam kaybolursa aynı sefer 2D görünümde korunur.

Seçili grafik ayarı ve kamera sefer kaydına katılmaz. Çevrimdışı paket
hazırlanırken gecikmeli 3D modülü de yüklenir; hazır bildirimi gelmeden
çevrimdışı kullanımın tamamlandığı varsayılmamalıdır.

## Referanslara göre yenilenen kara modelleri — 3 Kasım 2026

Piyadenin tunik, omuz, dirsek, pantolon ve bot yüzeyleri artık oval kesitlerden
oluşan sürekli geometriler kullanır. Yüzde çene, burun, kulak, kaş ve göz
kapakları; başlıkta siperlik veya çelik miğfer kenarı; teçhizatta omuz üzerinden
geçen kayışlar, cepler, matara, çanta ve tüfeği tutan eller bulunur.
Baş mevcut boyun ekseninde bağımsız döner; silahın ateş çıkışı ve ayakların
zemin teması değişmez. Tamamlanan araştırmalar dört model aşamasını seçer.

Tanklarda eğimli zırh gövdesi, yuvarlatılmış taret, açık palet halkası ve
namlu içi; kamyonlarda kıvrımlı kabin/kaput, çamurluk ve kumaş tente;
toplarda katmanlı kalkan, beşik, geri tepme düzeneği ve ayrık destek ayakları
kullanılır. İleri araştırmalar araç gövdelerini ve teçhizatı değiştirir;
mekanize ulaşım aşaması arka paletli taşıyıcı gösterir.

Kumaş, boyalı zırh, çıplak metal, deri ve cam aynı PBR malzemesinde farklı
pürüzlülük/metallik değerleri taşır. Özgün 128×128 RGBA yüzey maskesi,
üç eksende örneklenen ince doku, kumaş örgüsü ve yüzey değişimi ekler.
Mip seviyeleri uzak yüzeylerde titreşimi azaltır. Bu dosya fotoğraf dokusu
veya 2K/4K varlık değildir; temel belleği 64 KiB'dir, her render görünümü
tek kopya paylaşır ve kapanırken bırakır. Model yüzeylerine eklenen hafif
dolaylı ışık, karanlık haritada yüz ve donanım ayrıntılarının okunmasını sağlar.

Kaynaklar `map3d-model-builder.ts`, `map3d-infantry-model.ts`,
`map3d-vehicle-models.ts`, `map3d-land-material.ts` ve
`map3d-material-texture.ts` içindedir. Bunlar referans resimlerden esinlenerek
kodla oluşturulmuş özgün minyatürlerdir; resimlerdeki hazır 3D dosyaların
veya oyunun modellerinin birebir aktarımı değildir. Ayrıntı sınırı, kaynak
temizliği ve gerçek oyun görüntüsü ayrı ayrı doğrulanır.

## Görsel veri neyi temsil ediyor?

447 bölgenin mevcut çokgenleri gerçek yükseklikli mesh üzerinde kullanılır.
Kabartı prosedüreldir; DEM, uydu haritası veya doğrulanmış yeni bir tarihsel
atlas değildir. [Geometri belgesi](europa-3d-geometry.md) kaynağı açıklar.

Evler, ormanlar, piyade ve araçlar kodla üretilmiş strateji minyatürleridir.
Piyadeler daha büyük ölçekte miğfer, tüfek, kemer, çanta ve bot ayrıntıları
taşır; tank, kamyon ve top ayrı modeller kullanır. Siyasi ülke rengi küçük
birlik işaretlerinde, dönemden esinlenen ulusal ton ise kumaşta gösterilir.
Şehirlerde eğimli
çatılar, pencereler, kapılar, bacalar ve sokak blokları bulunur.
Sanayi yapıları mevcut bina sayılarına, hasarlı görünüm bölge hasarına ve
vinçler gerçek inşaat kuyruğuna bağlıdır. Birlik konumu simülasyonun ilerleme
değerinden yumuşatılır; bu animasyon varış veya fetih hesabı yapmaz. Savaş
işaretleri gerçek muharebelere bağlıdır. Hava ve deniz modellerinin görev,
hareket ve hasar bağlantısı aşağıda açıklanır.

Aynı konum ve hareket hedefini paylaşan tümenler sayılı tek seçim işaretinde
toplanır. Bir tümen piyadeyle, iki tümen piyade ve tankla, üç tümen
piyade, tank ve topla; dört veya daha fazlası piyade, tank, top ve kamyonla
temsil edilir. Bu dört tip sayıyı anlatan simgelerdir; grubun gerçek ekipman
ve birlik türlerini değiştirmez. Uzakta ve Düşükte de aynı tipler korunur,
yalnız küçük geometri ayrıntıları azaltılır. Bu gösterim askerleri birleştirmez; grup emri
her tümenin kendi hareket ve savaş kaydında uygulanır. Görüş dışında kalan
birlik modelleri çizime hazırlanmaz; temsilî model sayısı 3.072 ile sınırlıdır.

Yalnız oyuncunun kontrol ettiği, kendi başkentine kesintisiz kara demiryoluyla
bağlanan bölgelerin rayları, istasyonları ve trenleri gösterilir. Müttefik
bölgesi veya askerî geçiş izni bu görünürlük için yeterli değildir. Ele
geçirilen kopuk bölge, aradaki raylı koridor da kontrol altına alındığında
bağlanır; bağlantı kaybedilince yeniden gizlenir. Dekoratif yerel hatla
bağlantısız bir bölgeye tren eklenmez.

Büyük buharlı lokomotif ve yük vagonları; ortak şehir düğümlerinde birleşen
çelik rayları, traversleri ve çakıl yatağını izler. Ray, tren, birlik ve bina
yüksekliği ekranda çizilen arazi üçgenlerinden örneklenir; farklı ayrıntı
düzeylerindeki araziye gömülerek kopuk görünmeleri önlenir. Trenler sefer duraklatılsa
da hareket eder; azaltılmış hareket tercihinde durur. Bu hareket sefer
tarihini veya kaynaklarını değiştirmez. Kurallar ve bütçeler
[demiryolu belgesinde](europa-railways.md) açıklanır.

Şehirlerin ortasındaki bağımsız artı biçimli yol çubukları kaldırılmıştır.
Her geçerli bölge, Düşük dâhil bütün ayarlarda en az bir gerçek bina örneği
alır. Binalar kara sınırları, görünen ray koridoru ve birliklerin kompakt
gövde alanları gözetilerek yerleştirilir.

Yürüyen piyadenin adımları, tank paletleri, kamyon tekerlekleri ve çekilen top
ayrı hareket eder. Yalnız gerçek muharebeye katılan gruplarda namlu alevi,
geri tepme, piyade iz mermisi, tank mermisi, top mermisi yayı ve isabet
etkileri gösterilir; kamyon destek
animasyonu kullanır. İlk atış savaşın başlamasına bağlıdır; kısa muharebe
önceki animasyon döngüsünün bitmesini beklemez. Gerçek düşman şehrine varıp
kontrolü değiştiren grup kısa bir toparlanma ve bayrak kaldırma animasyonu
oynatır. Duraklatma ve azaltılmış hareket bu birlik animasyonlarını dondurur. Kayıt yüklemek veya
barışla toprak devretmek ele geçirme animasyonu başlatmaz. Bunlar mevcut
savaş sonuçlarını görselleştirir; ilave hasar, cephane veya fetih hesabı yapmaz.

Atış saati yalnız çizilen karelerde başlar; hazırlık güncellemeleri ilk atışı
tüketmez. Bir saat içinde sonuçlanan gerçek muharebenin kısa gösterimi **Son çatışma**
etiketi taşır ve ardından birlik güncel konumuna geçer. Bu gösterim yalnız
gerçek temas/kayıp kanıtıyla hayatta kalan katılımcılara uygulanır; boş şehir,
yüklenen kayıt, yıpranma veya yedek birlikler için çatışma uydurulmaz. Yeni emir
ve yeni savaş eski gösterimi iptal eder. Azaltılmış hareket, geçmiş gösterimi
kaldırıp güncel konumu gösterir. Canlı savaşlar **Çatışma** etiketi taşır.

Saatlik kara savaş motoru ve eski kayıt geçişi sonraki çalışmada eklendi;
kapsamı [güncel durum belgesinde](europa-2000-status.md) açıklanır.
Bu görsel katman; tam dünya haritası, karargâh/kolordu
zinciri, modüler tasarımcılar, ortak kapasiteli lojistik akışı veya yüksek
çözünürlüklü sanat varlıkları üretmiş sayılmaz. Tam kapsamın başlangıç
durumu ve aşama sonuçları [durum belgesinde](europa-expansion-status.md).

## Stratejik atlas ve kolay yönetim

Varsayılan kamera **Stratejik** üst görünümüdür. **Harita bakışı → Yakın
görünüm** minyatürleri eğimli kamerayla gösterir; seçim, harita kaydırma,
yakınlaştırma ve bütün emirler iki bakışta da aynıdır. Bakış tercihi cihazda
saklanır, sefer sonucunu değiştirmez.

Yeni kartografik yüzey, orman lekeleri, dağ taramaları ve yüzey dokusunu
prosedürel olarak çizer. Ülke sınırları ve savaş cepheleri eyaletin güncel
kontrolünden türetilir; kontrol değişmedikçe geometrileri yeniden kurulmaz.
Geniş görünümde ülke adları en büyük bağlantılı toprak parçasına yerleşir,
birbirinin üstüne gelenler gizlenir. Başkent ve seçili şehir adları korunur.
Kıyı kabartısı alçaltılmış, şehirlerde birbirinin kopyası kare yerleşimler
yerine farklı açılarda sokak dokuları kullanılmıştır. Bu özgün çizim HOI4
görsellerini veya oyun dosyalarını içermez; coğrafi veri hâlâ mevcut Avrupa
haritasıdır, yeni dünya atlası değildir.

**Kolay yönetim**, komutan → komşu sınır → savun/saldır adımlarını gösterir.
**Tüm ayrıntılar** ile diğer yönetim araçlarına erişim korunur. Bu tercih
rakip zorluğunu değiştirmez ve kendiliğinden kaynak harcamaz. İsteğe bağlı
yönetim yardımcıları oyuncunun açtığı alanlarda gerçek komutları uygular.
Hava/deniz haritalarında kuvvet özeti ve ilgili emir ekranına kısayol bulunur.

## Gece atlası

3 Kasım 2026 görünümü, koyu lacivert deniz ve ufuk, soğuk arazi ışığı,
düşük doygunluklu ülke renkleri ve sıcak şehir ışıklarını birlikte kullanır.
Almanya kömür tonunda, Fransa mavi, İtalya yeşil ve Türkiye bordo tonunda
gösterilir. 2D ve 3D siyasi haritalar aynı özgün ülke paletini paylaşır;
askerî ve ikmal katmanlarının bilgi renkleri ayrı kalır. Arazi shader'ındaki
orman kümeleri, dağ sırtları ve kırık kar çizgileri prosedüreldir; yeni
ölçülmüş yükseklik verisi veya mevsim/hava simülasyonu değildir. Deniz
dalgaları düşük kontrastlıdır; azaltılmış hareket tercihi hareketlerini durdurur.

Beyaz ülke adları en büyük bağlantılı toprak parçasının uzun eksenine göre
döner ve kullanılabilir genişliğe göre ölçeklenir. 3D görünümde çakışan veya
ekran dışında kalan ülke adları gizlenir; kamera uzaklığı 300 birim ve altına
indiğinde yakın şehir görünümüne yer açarlar. Başkent yıldızları ile başkent
ve seçili şehir adlarının mevcut seçimi korunur.

Gece ışıkları mevcut **447 şehir** konumundan üretilir; başlangıçtaki
**29 başkent** daha belirgin çekirdek taşır. Küçük ışık kümeleri kendi bölge
çokgenlerinin içinde kalır ve çizilen arazi yüksekliğine oturur. Bunlar
her ülkenin bilinen yerleşim coğrafyasını gösterir; düşman fabrikalarının,
birliklerinin veya bombardıman hasarının istihbarat göstergesi değildir.
Saat ve gizli hasar değişiklikleri ışıkları değiştirmez; başkent taşınırsa
başkent vurgusu yeni konuma geçer. Bu sürekli gece teması, seferin gün/gece
hesabını değiştirmez.

| 3D grafik ayarı | Mevcut coğrafyada ışık örneği | Şehir başına üst sınır |
| --- | ---: | ---: |
| Düşük | 447 | 1 |
| Orta | 893 | 2 |
| Yüksek | 1.338 | 3 |
| Ultra | 1.783 | 4 |

Dar kıyılarda ek küme noktası için uygun kara yoksa o örnek eklenmez; şehir
çekirdeği korunur. Bütün ışıklar tek instanced çizim çağrısını paylaşır.
Harici doku, noktasal ışık kaynağı, tam ekran bloom geçişi veya ışık başına
animasyon döngüsü eklenmez. Geometri bir kez hazırlanır; yakınlaştırma yalnız
boyut uniform'unu, kalite yalnız çizilen örnek sayısını değiştirir. Görsel
dağılımın deterministik rastgeleliği seferin `World` verisine veya RNG
akışına dokunmaz. 2D görünüm aynı sıcak etkiyi ortak bir SVG gradyanıyla verir.

Geniş atlası sade tutmak için kamera–odak uzaklığı **950 birim ve üzerinde**
bütün yerleşim minyatürleri gizlenir; şehir ışıkları ve harita verisi kalır.
Yaklaşınca mevcut örnekler yeniden görünür, bina geometrisi tekrar kurulmaz.
Pencere/tesis ayrıntıları 520, kayalar 650, bacalar 720, ağaçlar 760 birimin
altında gösterilir. Ray, istasyon ve trenler 850 birimin üzerinde gizlenir;
travers sınırı Düşükte 520, diğer ayarlarda 620 birimdir. Bunlar kamera
koordinatlarıdır, kilometre veya ikmal menzili değildir. Oyuncuya ait bağlı
demiryolu görünürlük kuralı ve gerçek sefer hesapları değişmez. Bu çizim
bütçeleri fiziksel telefonda ölçülmüş FPS sonucu anlamına gelmez.

## Askerî simgeler, ilerleme okları ve yakın çatışma ışığı

Komuta, ordu, sanayi, diplomasi, araştırma, harekât, kayıt ve kamera
kontrollerinde 50 özgün SVG askerî simgeden oluşan ortak set kullanılır. 2D birlik sayaçları
ve 3D başkent/birlik etiketleri aynı simge ailesini paylaşır. Türkçe etiketler,
düğmelerin erişilebilir adları ve klavye ile seçme davranışı korunur. Bu
çizimler başka bir oyunun arayüz veya görsel dosyalarından alınmamıştır.

Yürüyen görünür birliklerin rotaları, birlik seçilmese de **kendi ülkelerinin
renginde** okla gösterilir. Ok mevcut ilerleme konumundan başlar ve son hedefi
gösterir. Aynı ülke, başlangıç ve rota kuyruğuna sahip tümenler tek okta
toplanır; farklı hedefler ayrı kalır. Oyuncunun seçili, henüz hareket etmeyen
rotası kesikli çizilir. Varış veya iptal sonrası yürüyüş oku kaldırılır.
Görünmeyen düşmanlar için ok oluşturulmaz; görünen yabancı birliklerde yalnız
mevcut hareket gösterilir, sonraki emir kuyruğu açıklanmaz.

2D ve 3D aynı rota verisini kullanır. 3D oklar çizilen arazi yüksekliğini
izleyen tek renkli-vertex mesh içinde toplanır. En fazla **256 rota**, rota
başına **16 konum**, toplam **60.000 vertex** çizilir; seçili rotalar ve oyuncu
rotaları önceliklidir. Aynı veri tekrar geldiğinde geometri yeniden kurulmaz.
Bu oklar hareket emri, süre veya şehir ele geçirme hesabı yapmaz.

Yakın görünümde piyadenin eğimli omuzları, miğferi, yüzü, tüfek askısı,
matara ve küreği; tankın eğimli zırhı, paletleri, kapakları, periskopları,
egzozu ve namlusu; topun siperi, tekerlekleri, mekanizması ve geri tepme
silindirleri; kamyonun kabini, aynaları, silecekleri, basamakları, çamurlukları
ve branda bağları ayrı geometri ayrıntıları taşır. Animasyonun ilk 13 parça
indeksine bağımsız baş ve baş ayrıntısı eklenir; toplam **15 ortak parça
grubu** kullanılır. Araştırma kademelerine göre model geometrileri değişir;
her asker için ayrı mesh veya malzeme oluşturulmaz. Kumaş, boyalı zırh,
çıplak çelik, lastik ve cam için roughness/metalness vertex verileri aynı
PBR malzemesi içinde farklı yüzey tepkileri verir. Ülke üniforması yalnız
kumaş maskesine uygulanır; ten, silah, metal ve deri ayrıntıları korunur.
Bunlar kodla üretilmiş strateji minyatürleridir; taranmış AAA modeller, yeni
2K/4K dokular veya iskelet animasyonu varlıkları değildir.

Gerçek kara çatışmasının namlu, hareketli mermi ve isabet konumlarına sıcak
ışık halkaları bağlanır. Namlu/isabet altında araziye oturan ışık lekesi
bulunur. Hareket eden veya gerçek çatışmaya destek veren kamyonun iki farı
yanar; kamyon yeni bir silah ya da hasar kaynağı kazanmaz. Mevcut çatışma,
geri tepme ve ele geçirme zamanlaması, duraklatma ve azaltılmış hareket
kuralları korunur.

| Kalite | Aynı anda gerçek noktasal çatışma ışığı |
| --- | ---: |
| Düşük / Orta | 0; ışık halkası ve arazi lekesi |
| Yüksek | En fazla 2 |
| Ultra | En fazla 4 |

Noktasal ışıklar gölge üretmez; 900 birim ve üzerindeki kamera uzaklığında
güçleri sıfırlanır. En fazla **256 ışık halkası** ve **128 arazi lekesi** iki
instanced grupta tutulur. Işık nesneleri tekrar kullanılır; atışlar arasında
shader ışık sayısı değiştirilmez. Ortadan kalkan çatışma ışığı sonraki karede
temizlenir. Bunlar sefer dünyasına veya RNG akışına yazmaz, gerçek hasarı
artırmaz ve tam ekran bloom efekti gerektirmez.

Mevcut 447 şehir ışığına ek olarak yakın görünümde evlerin pencere/kapı
panelleri ortak sıcak emissive malzemeyle görünür. Yeni şehir veya ev başına
noktasal ışık eklenmez; mevcut yerleşim yoğunluğu ve uzaklık elemesi korunur.
Bu bütçeler telefon veya masaüstünde ölçülmüş 60 FPS garantisi değildir.

## Araştırmaya bağlı modeller ve manuel kolay yönetim

Birliklerin görünümü, ülkenin **tamamlanmış araştırmalarından** türetilir.
Araştırmayı sıraya koymak veya takvimde ileri bir yıla gelmek modeli
kendiliğinden yükseltmez. Kayda yeni bir görünüm ilerlemesi yazılmaz; kayıt
tekrar yüklenince tamamlanmış teknolojilerden aynı görünüm elde edilir.

| Model ailesi | Görünüm kademesini ilerleten mevcut araştırmalar |
| --- | --- |
| Piyade | `weapons1` → `weapons2` → `weapons3` |
| Topçu | Piyadeyle ortak silah modernizasyonu; aynı üç teknoloji |
| Tank | `armor1` → `armor2` → `armor3` |
| İkmal kamyonu | Önce `motorization`; ardından `engines` veya daha ileri `mechanization` |

Her aile temel model dâhil dört görünüm kademesi taşır. Üst kademe daha
belirgin teçhizat, zırh, taret, top siperi veya araç gövdesi ayrıntıları
kullanır. Artık **29 ulusal profil** miğfer, ceket/kaput, kayış, çanta, çizme,
tank gövdesi ve kulesi, kamyon kabini ve top kalkanı biçimlerini de seçer.
Aynı kumaş rengi kullanıldığında da ülkelerin model bileşimleri ayrılır.

Son referanslarda Alman atkı/çanta/teçhizat kutusu, Britanya atkısı, Fransız
Adrian ve mavi kaput, Sovyet uşanka/kürk yaka/bej kaput, İtalyan M33, Türk
haki kaput/siperli şapka ve İsveç gri-yeşil üniforma kullanılır. Aşağıdaki
araç adları, 2–3. görünüm kademelerinde açılan tasarım esinlerini belirtir;
bunlar yeni üretim hattı veya değiştirilmiş savaş değerleri değildir.

| Ülke | Tank görünüm esini | Kamyon görünüm esini |
| --- | --- | --- |
| Almanya | Tiger I | Opel Blitz |
| Birleşik Krallık | Churchill | Bedford QL |
| Fransa | Somua S35 | Laffly S20 TL |
| Sovyetler Birliği | T-34 | ZiS-5 |
| İtalya | M13/40 | Fiat 626 |
| Çekoslovakya | LT vz. 38 | Praga RV |
| İsveç | Stridsvagn m/42 | Volvo TLV |
| Türkiye | İthal T-26 | İthal Ford AA |
| Polonya | 7TP | Polski Fiat 621 |
| Hollanda | CTLS; Doğu Hint Adaları bağlamı | DAF Trado |

Toplarda leFH 18, QF 25-pounder, Canon de 75, ZiS-3, Cannone 75/27,
Škoda 100 mm ve Bofors 75 mm tasarım aileleri bulunur. Diğer ülkelerin
paylaştığı tasarım ailesi arayüzde açıkça yazılır; her ülkenin bütün tarihsel
envanterini içerdiği iddia edilmez.

Modellerin 15 hareketli parça indeksi korunur. Her ülke/kademe için bütün
parçaları önceden üretmek yerine yalnız görünür parçalar oluşturulur;
geometrisi gerçekten aynı parçalar ülke ve kademe arasında paylaşılır.
Örnek tamponları ihtiyaca göre büyür. Kullanılmayan parçaların önbelleği,
eski kullanımlar önce bırakılarak **64 parça / 180.000 vertex / 4.096 örnek
yuvası** sınırlarının hepsinde tutulur. Aktif parçalar bu boşta önbellek
sınırından ayrı, görünür **3.072 minyatür / 128 efekt** sınırına tabidir.
Aktif fakat çok seyrekleşen tamponlar da küçültülür: ordu ölçeğinden birkaç
birliğe düşüşte ilk güncellemede, daha ılımlı azalmada 30 ardışık güncelleme
sonrasında. Böylece duraklatılmış düşük kalitede yeni kare gerekmeksizin
aşırı kapasite geri alınır; küçük kaydırmalar tamponları sürekli yenilemez.
Yakın kaydırmalarda önbellekte kalan model yeniden üretilmez; çok uzak
bölgeye dönülürken atılmış parça tekrar oluşturulabilir. Ülke kimlikleri
sabit katalogla sınırlandırılır; isyancılar ana profili, bilinmeyen kimlikler
tek yedek modeli kullanır. Kaynaklar sahne kapanışında serbest bırakılır.

Mekanizasyonun mevcut önkoşulları korunur; görünüm için yeni bir
motor araştırması şartı uydurulmaz. Yeni topçu araştırması ya da ek savaş
bonusu eklenmez. Araştırma panelindeki **Birliklerin görünümü** bölümü mevcut
kademeyi, sonraki gerçek teknoloji adını ve önkoşullarını açıklar. Kartın
**Araştırmayı başlat** düğmesi tam teknoloji ağacıyla aynı doğrulanan emri
uygular. Önkoşul eksikse, araştırma sürüyorsa veya yuvalar doluysa düğme
durumu nedenini gösterir. Diğer araştırmalar ve doktrinler açılabilir tam
ağaçta korunur.

Ülkeler dönemden esinlenen farklı biçim ve kumaş tonları taşır; bunlar siyasi
harita renginden ve seçim işaretinden bağımsızdır. Kendi ülken, müttefikler
ve süresi dolmamış istihbarat kapsamındaki ülkeler tamamlanmış araştırmalarını
yansıtır. İstihbaratı bulunmayan görünen yabancı birliklerde yalnız gözlenen
hafif/orta/ağır tank veya motorize/mekanize birlik tipi kullanılır; ülkenin
gizli silah araştırmaları model üzerinden açıklanmaz. Ulusal kimlik, gizli
araştırma kademesinden bağımsızdır. Görünmeyen birlikler çizilmez.

M40 miğfer kabuğu, MIT lisanslı Muster arşivinin belirtilen kaynak sürümünden
hafifletilerek uyarlanmıştır. Diğer geometriler bu projede oluşturulmuştur.
[Kaynak ve lisans incelemesi](europa-national-assets.md) hangi bölümün gerçekten
alındığını belgeler. MIT bildirimi çevrimdışı pakete de katılır; paket protokolü
`v5` olur. Bu modeller HOI4 oyun dosyaları veya görsellerdeki hazır modellerin
birebir kopyaları değildir.

Duran piyadelerin başı, boyun çevresinde birbirinden farklı yavaş hareketlerle
sağa ve sola bakar. Gövde ve tüfek yerinde kalır; yürüyüş, ateş ve ele geçirme
sırasında baş mevcut hareketi izler. Duraklatma ve azaltılmış hareket baş
hareketini dondurur. Devam ettirince beklenen süre animasyona eklenmez.
Uzak görünümde küçük baş hareketi hesaplanmaz. Bu görsel hareket askerlerin
konumunu, görüşünü, hedefini veya savaş sonucunu değiştirmez.

Şehir ışık halkaları, ev pencereleri ve çatışma ışığı daha okunur olacak
şekilde güçlendirilmiştir. Işık sayısı, boyutu, 0/0/2/4 noktasal çatışma
ışığı bütçesi ve şehirlerin tek çizim grubu korunur; her eve ayrı ışık
oluşturulmaz.

**Kolay yönetim** komuta ekranında dört açık başlangıç sunar: **Tümen eğit**,
**Yapı inşa et**, **Teknoloji seç**, **Diplomasi yap**. Bunlar ilgili paneli
açar; kaynak harcamaz, birliği otomatik eğitmez veya araştırmayı seçmez.
İnşaat kısayolu oyuncunun kontrol ettiği seçili bölgeyi, başkentini veya
uygun ilk bölgesini açar. Ardından yapı ve emir oyuncu tarafından seçilir.

Komutan/sınır/savun/saldır adımları korunur. Siyaset, hava ve deniz harekâtı
**Tüm ayrıntılar** görünümünde erişilebilir. Kolay görünüm fazla öneri ve
geçmiş panellerini kapatır; oyun mekaniğini veya zorluğunu değiştirmez.
Yönetim yardımcısı ayarları başlangıçta kapalı bir bölümde tutulur; önceden
açılmış yardımcılar dürüstçe gösterilir. Kolay görünüme geçmek yardımcıları
açmaz veya kapatmaz. Yeni oyundaki manuel tercihler ve kayıtlı otomasyon
ayarları korunur.

## Hava ve deniz görevlerinin görünümü

Avcı, bombardıman, yüzey savaş gemisi, uçak gemisi ve denizaltı için özgün,
birleştirilmiş geometriler kullanılır. Bir uçak modeli bir gerçek filoyu temsil
eder; uçak sayısı kadar nesne oluşturulmaz. Gemiler gerçek filo kayıtlarından
üretilir. Görüş alanı elemesi, kaliteye göre model/efekt sınırları ve ortak
instanced tamponlar çizim yükünü sınırlar.

Aktif uçaklar atanmış görev bölgelerinde uçar, gemiler atanmış deniz bölgesinde
hareket eder ve su izi bırakır. Simülasyon ayrı bir gemi rotası/koordinatı
tutmadığı için denizdeki izler temsili görev devriyeleridir. Hasar ve sonuç
hesaplamazlar. Gizli düşman üsleri uçuş yolu üzerinden açığa çıkarılmaz;
uzak bilinmeyen filolar görünmez. Bu mevcut görünürlük kurallarının devamıdır,
yeni ve tam bir savaş sisi/istihbarat sistemi değildir.

Gerçek gün sınırındaki uçak kaybı, bombardıman hasarı ve gemi hasarıyla
doğrulanan olaylar kısa hava çatışması, bomba, top mermisi ve su isabeti
gösterimleri oluşturur. Yükleme, aynı saatte verilen emir veya kopan ikmal
nedeniyle yıpranma kendi başına bir çatışma gösterimi başlatmaz. Görüntüdeki
hareket ve efektler duraklatma/azaltılmış hareket sırasında ilerlemez.
Hava/deniz hasar çözümü hâlâ günlüktür; bu çalışma saatlik, eşzamanlı bir hava
ve deniz motoru ya da tam muharebe olay defteri eklemez.

Beş deniz bölgesinin ortak 2D/3D merkezleri açık suya yerleştirilmiştir.
Devriye alanı, geminin bütün gövdesi ve su iziyle birlikte kıyıların içinde
kalacak şekilde sınırlandırılır; Baltık ve Karadeniz'de model ölçeği buna
uyarlanır. Bu sınırlar coğrafi poligonlarla test edilir, her karede kıyı
araması yapılmaz. Saatlik dünya güncellemeleri animasyon saatini sıfırlamaz;
düşük kare hızında da hareket devam eder. Duraklatıp devam etmek, beklenen
süreyi animasyona birden eklemez.

Arka arkaya oluşturulan filo/gemi kimlikleri birbirine yakın animasyon
evrelerine yığılmaz. Görsel evre karıştırması yükleme sonrası deterministiktir;
seferin rastgelelik akışını tüketmez veya savaş sonuçlarını değiştirmez.
