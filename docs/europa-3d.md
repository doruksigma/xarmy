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

## Grafik ve maliyet

Telefonlarda ilk ayar **Düşük**, masaüstünde **Orta**. Düşük/Orta/Yüksek/Ultra
seçenekleri piksel yoğunluğunu, gölgeyi ve dekor yoğunluğunu değiştirir.
Tercih cihazda saklanır. Düşükte duraklatılmış harita ihtiyaç üzerine çizilir;
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

Evler, ormanlar, piyade ve tanklar kodla üretilmiş küçük strateji modelleridir.
Sanayi yapıları mevcut bina sayılarına, hasarlı görünüm bölge hasarına ve
vinçler gerçek inşaat kuyruğuna bağlıdır. Birlik konumu simülasyonun ilerleme
değerinden yumuşatılır; bu animasyon varış veya fetih hesabı yapmaz. Savaş
işaretleri gerçek muharebelere bağlıdır. Uçak/gemi işaretleri mevcut görev
durumunu temsil eder; ayrıntılı model veya fizik simülasyonu değildir.

Aynı konum ve hareket hedefini paylaşan tümenler `×N` sayılı tek görsel
grupta gösterilir. Bu gösterim askerleri birleştirmez; grup emri her tümenin
kendi hareket ve savaş kaydında uygulanır.

Bu aşama; tam dünya haritası, yeni saatlik savaş motoru, karargâh/kolordu
zinciri, modüler tasarımcılar, ortak kapasiteli lojistik akışı veya yüksek
çözünürlüklü sanat varlıkları üretmiş sayılmaz. Tam kapsamın başlangıç
durumu ve aşama sonuçları [durum belgesinde](europa-expansion-status.md).
