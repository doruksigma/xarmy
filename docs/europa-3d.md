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

## Görsel veri neyi temsil ediyor?

447 bölgenin mevcut çokgenleri gerçek yükseklikli mesh üzerinde kullanılır.
Kabartı prosedüreldir; DEM, uydu haritası veya doğrulanmış yeni bir tarihsel
atlas değildir. [Geometri belgesi](europa-3d-geometry.md) kaynağı açıklar.

Evler, ormanlar, piyade ve araçlar kodla üretilmiş strateji minyatürleridir.
Piyadeler daha büyük ölçekte miğfer, tüfek, kemer, çanta ve bot ayrıntıları
taşır; tank, kamyon ve top ayrı modeller kullanır. Ülke rengi üniformanın
tamamını değiştirmek yerine küçük işaretlerde gösterilir. Şehirlerde eğimli
çatılar, pencereler, kapılar, bacalar ve sokak blokları bulunur.
Sanayi yapıları mevcut bina sayılarına, hasarlı görünüm bölge hasarına ve
vinçler gerçek inşaat kuyruğuna bağlıdır. Birlik konumu simülasyonun ilerleme
değerinden yumuşatılır; bu animasyon varış veya fetih hesabı yapmaz. Savaş
işaretleri gerçek muharebelere bağlıdır. Uçak/gemi işaretleri mevcut görev
durumunu temsil eder; ayrıntılı model veya fizik simülasyonu değildir.

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
