# Europa War: 3D demiryolları ve hareketli trenler

3D harita **bütün ülkelerin mevcut demiryolu altyapısını** ve gerçek ray güzergâhlarında hareket eden temsili trenleri gösterir. Başlangıçtaki 29 ülkenin tamamında çizilebilen tren bulunur. Bu çalışma yeni bir tren kapasitesi, vagon envanteri veya teslimat simülasyonu eklemez. İkmal, stok ve üretim hesapları strateji motorunda kalır; çizim `World` durumunu veya simülasyon rastgeleliğini değiştirmez.

Güzergâh geometrisi eyalet komşuluklarından ve oyundaki altyapıdan türetilir; doğrulanmış tarihsel bir demiryolu atlası değildir.

## Gerçek hatlar ve yerel istasyon yolları

- Her ülkenin kendi başkentinden erişilebilen demiryolu ağı hesaplanır. Şehirler arası bağlantının iki eyaletinde de `buildings.rail > 0` gerekir. Kendi, müttefik veya geçiş izni bulunan dost topraklar kullanılabilir; savaş geçişi kapatır.
- Deniz komşulukları ray olmaz. Bağlantılar iki uç eyaletin gerçek çokgenleri içinde tutulur; kıyı girintileri ve delikler kontrol edilir. Güvenli kara güzergâhı bulunamayan bağlantı çizilmez ve `omittedConnections` içinde sayılır.
- Aynı ağacın uzak uçları arasında uzun güzergâhlar seçilir. İç köşeler ancak oluşturulan eğrinin bütün parçaları karada kalıyorsa yumuşatılır. Trenler ve raylar aynı yol noktalarını kullanır.
- Ülkeler arasında paylaşılan fiziksel raylar tekilleştirilir. En fazla 64 güzergâh, her uygun ülkeye önce bir güzergâh verilecek şekilde dağıtılır.
- Şehirler arası bağlantısı bulunmayan fakat başkentinde gerçek demiryolu bulunan ülkelerde, başkent eyaletinin içinde kalan yerel istasyon yolu kullanılabilir. Başlangıçta Danimarka, Estonya ve Lüksemburg bu duruma örnektir. Bunlar sahte komşuluk veya yeni oyun altyapısı oluşturmaz; ray yatağının tam genişliği gerçek karada kalır.
- Lüksemburg'un 11,5 birimlik yerel yolunda, diğer ülkelerle aynı ölçek ve ray açıklığına sahip yalnız lokomotif kısa manevra yapar. Ülkenin haritası genişletilmez ve tren enine küçültülmez.
- İşgal, demiryolu yıkımı ve geçiş hakkı değişimleri güzergâhları yeniden hesaplatır. Kesilen şehirler arası yol kaldırılır; geride raylı bir başkent kalırsa yerel istasyon trafiği sürebilir. Rayı bulunmayan veya erişilebilir başkenti olmayan ülkede tren çizilmez.

## Grafikler ve ölçek

Buharlı lokomotifte yuvarlak kazan, kazan bantları, baca, kabin camları, ön lamba, ön ızgara, borular, kırmızı ispitli çelik tekerlekler ve hareketli biyeller bulunur. Kömür tenderi, kapalı ahşap vagon ve yük taşıyan açık vagon ayrı modellerdir. Gövdeler, tekerlekler ve biyeller sınırlı sayıda instanced çizimle üretilir. Buhar en fazla 128 parçacıktır.

Trenler, ray açıklığı, traversler ve ray yatağı birlikte **1,2 ölçek** kullanır. Kısa hatta daha az vagon seçilir; tekerlekleri raydan ayıracak orantısız küçültme yapılmaz. Uygun uzun hatlarda 2–3 yük vagonu, daha kısa hatlarda daha kısa diziler kullanılır. Araçlar arazinin eğimini izler; tekerlek ve biyel hareketi gidiş/dönüş yönüne bağlıdır.

Raylar çizgi yerine ayak, gövde ve baş kısmı bulunan fiziksel çelik kesitlerdir. Altlarında sürekli, dokulu çakıl yatağı ve sık ahşap traversler bulunur. Başkent ve bağlı ikmal merkezlerindeki istasyonlar rayları kapatmayacak kara noktalarına yerleştirilir.

## Görsel bütçe, kamera ve zaman

Yakındaki tren bütçesi Düşük/Orta/Yüksek/Ultra için en fazla **6/12/20/32**'dir. Ülkeler oyuncu ülkesine göre elenmez; kameraya yakın gerçek lokomotif konumları seçilir. Kamera başka ülkeye taşındığında o ülkenin trenleri görünür. `stats.countries` ve `stats.positions` gerçekten çizilen lokomotifleri aynı sırada bildirir.

Fiziksel ray geometrisi kamera çevresinde pay bırakılan bir görünüm penceresiyle sınırlanır. Küçük kamera hareketleri geometriyi yeniden üretmez; yalnız konum bölmesi, uzaklık kademesi, kalite veya gerçek ağ değişince yenilenir. Çizilen travers sayısı en fazla 10.000, istasyon sayısı 96'dır. Uzak görünümde trenler gizlenir, uygun ray geometrisi kalır. `stats.edges` o anda üretilmiş fiziksel hat sayısıdır.

Trenler **sefer duraklatıldığında da hareket etmeyi sürdürür**. Bu ortam animasyonu oyun tarihini veya kaynakları ilerletmez. Yalnız azaltılmış hareket tercihi tren animasyonunu dondurur; gizli tarayıcı sekmesinde ana çizim döngüsü durur. Sekmeye dönüşte büyük zaman farkı sınırlandırılır. Yol sonlarında diziler ışınlanmadan aynı hat üzerinde geri hareket eder.

Ağ önbelleği bütün ülkelerin başkentlerini, ittifaklarını, geçiş izinlerini, savaşlarını ve bağlılık durumlarını, ayrıca eyalet kontrolünü ve ray/merkez altyapısını içerir. Oyuncu seçimi, gün, stok ve tümen hareketleri ağ geometrisini değiştirmez.

## Doğrulama

`map3d-rail-network.test.ts` kara geometrisini, güvenli eğrileri, deniz yasağını, erişimi, küresel tekilleştirme/adil güzergâh dağılımını, yerel yolların tam genişliğini ve dünya durumunun korunmasını doğrular.

`map3d-railways.test.ts` gerçek THREE sahnesinde fiziksel ray/çakıl geometrisini, sabit tekerlek açıklığını, sefer duraklatılmışken tam gidiş/dönüş hareketini, azaltılmış hareketi, kesilen altyapıyı, kalite sınırlarını, kamera önbelleğini ve kaynakların bırakılmasını doğrular. Ayrıca 29 ülkenin tamamında kamerayla görünür tren bulunduğunu ve Lüksemburg lokomotifinin bütün gerçek geometri noktalarının manevra boyunca hattın fiziksel uçlarını aşmadığını kontrol eder.
