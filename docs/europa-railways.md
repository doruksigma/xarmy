# Europa War: oyuncunun bağlı demiryolları ve hareketli trenleri

3D harita yalnızca **oyuncunun kontrol ettiği ve kendi başkentine kesintisiz bağlı olan mevcut demiryollarını** gösterir. Başka ülkelerin rayları, trenleri ve istasyonları gizlidir. İttifak veya askerî geçiş izni bu görsel ağı genişletmez.

Bu çalışma yeni bir tren kapasitesi, vagon envanteri veya teslimat simülasyonu eklemez. İkmal, stok ve üretim hesapları strateji motorunda kalır; çizim `World` durumunu veya simülasyon rastgeleliğini değiştirmez.

## Bağlantı ve ele geçirilen bölgeler

- Başkent oyuncunun kontrolünde olmalı ve ray altyapısı bulunmalıdır. Bir bağlantının iki eyaletinde de `buildings.rail > 0` gerekir; güzergâhın bütün eyaletleri oyuncunun kontrolünde olmalıdır.
- Ele geçirilen bir bölgedeki mevcut ray, ancak oyuncunun kesintisiz kendi koridoru üzerinden başkente bağlanınca görünür. Kopuk işgal cepleri veya arada müttefik toprak bulunan hatlar görünmez.
- Koridorun kaybı veya ray altyapısının kaldırılması kesilen kolun fiziksel raylarını, istasyonlarını ve trenlerini kaldırır. Sırf tren göstermek için dekoratif yerel istasyon yolu oluşturulmaz.
- Deniz komşulukları ray olmaz. Bağlantılar iki uç eyaletin gerçek çokgenleri içinde tutulur; kıyı girintileri ve delikler kontrol edilir. Güvenli kara güzergâhı bulunamayan bağlantı çizilmez ve `omittedConnections` içinde sayılır.
- Başkente bağlı ağın uzak uçları arasında uzun güzergâhlar seçilir. İç köşeler ancak oluşturulan eğrinin bütün parçaları karada kalıyorsa yumuşatılır. Trenler ve raylar aynı yol noktalarını kullanır.

## Çok dar sayısal sınır aralıkları

Ham harita çokgenlerinin yuvarlanması nedeniyle oluşan çok dar aralıklar yalnız önceden tanımlanmış **kara komşuları** arasında düzeltilebilir. Aday sınır parçaları en az 1,5 harita birimi boyunca örtüşmeli, yönleri neredeyse paralel olmalı (normalize çapraz çarpım oranı en fazla 0,01) ve aralarındaki açıklık hiçbir uçta **0,15 harita birimini aşmamalıdır**. Aralığın karşılıklı taraflarında gerçekten iki komşunun karası bulunması gerekir.

Düzeltme yalnız hesaplanan dar dörtgen şeritte geçerlidir; kıyılara genel genişletme payı uygulanmaz. Şeridin herhangi bir iç bölümü kaynak çokgenlerdeki bir delikle veya üçüncü bir eyaletin dış çokgeniyle kesişirse aday reddedilir. Bu kontrol birkaç örnek noktayla sınırlı değildir; sınır kesişimleri, içeride kalan noktalar ve ortak kenarlı/aynı şekilli örtüşmeler de kontrol edilir. Deniz komşuluğu, geniş su açıklığı veya başka bölgeden geçen kestirme yol bu yöntemle açılmaz.

Doğrulanmış şeritler `edge.seams` içinde `{ polygon, maxGap }` olarak tutulur. `network.repairedConnections`, en az bir böyle şerit gerektiren bağlantı sayısını bildirir. Merkez çizgisi doğrulaması yalnız gerçek kara veya o bağlantıya kayıtlı şeritleri kabul eder. Harita çokgenleri, ülke kontrolü ve oyun içindeki ray altyapısı değiştirilmez. Ankara–Konya ve Tallinn–Tartu bağlantılarındaki sayısal aralıklar bu sınırlar içinde doğrulanmıştır.

## Ray birleşimleri ve grafikler

Raylar çizgi yerine ayak, gövde ve baş kısmı bulunan fiziksel çelik kesitlerdir. Altlarında sürekli, dokulu çakıl yatağı ve sık ahşap traversler bulunur. Aynı şehirde birleşen hatların uç kesitleri ortak yön ve aynı fiziksel noktaları kullanır; her parçanın kendi yönüne göre bitip aralarında boşluk bırakması önlenir. Keskin dönüşlerde genişleme sınırlandırılır. Kamera penceresi tek tek kısa çizgileri kesmez; bütün bağlantıları pay bırakarak seçer.

Araziye oturtma, kaynak yükseklik formülünü değil gerçekten çizilen arazi üçgenlerinin yüzeyini örnekler. Böylece düşük ayrıntıdaki büyük arazi üçgenleri rayları örtemez. Üçgen kırımlarını geçen ray parçaları yalnız gerektiğinde bölünür: en fazla 6 geçiş, bağlantı başına ilk nokta sayısının en fazla 8 katı ve 4.096 nokta sınırı vardır. Ray genişliği boyunca ölçülen arazi ve kısa parçalardaki yüzey kırımları yerel, düz bir ray yatağına uydurulur; bütün ağ keyfî olarak yükseltilmez. Ortak şehir düğümleri aynı yatay ve düşey uç noktalarını korur.

Çelik raylar, çakıl yatağının üstü, traversler ve trenlerin konum/eğim hesabı aynı önbelleğe alınmış ray yüksekliğini kullanır. Bağlantı başına en fazla dört kalite profili önbellekte tutulur; ağ değiştiğinde temizlenir. Kamera penceresine eklenen veya çıkarılan bir hat, diğer hatların arazi uyumunu yeniden hesaplatmaz. Bu profil 24 birimlik mekânsal bölmelerle sorgulanır; kare başına arazi üçgeni taraması veya ray geometrisi üretimi yapılmaz. Harita geometrisi değiştiğinde yeni yüzey örnekleyicisi oluşturulur; yalnız renk değişimi gerektirmez.

Buharlı lokomotifte yuvarlak kazan, kazan bantları, baca, kabin camları, ön lamba, ön ızgara, borular, kırmızı ispitli çelik tekerlekler ve hareketli biyeller bulunur. Kömür tenderi, kapalı ahşap vagon ve yük taşıyan açık vagon ayrı modellerdir. Gövdeler, tekerlekler ve biyeller sınırlı sayıda instanced çizimle üretilir. Buhar en fazla 128 parçacıktır.

Trenler, ray açıklığı, traversler ve ray yatağı birlikte **1,2 ölçek** kullanır. Kısa hatta daha az vagon seçilir; tekerlekleri raydan ayıracak orantısız küçültme yapılmaz. Uygun uzun hatlarda 2–3 yük vagonu, daha kısa hatlarda daha kısa diziler kullanılır. Araçlar arazinin eğimini izler. Gövde yönü vagonun ön ve arka aksları arasındaki doğrultudan hesaplanır; şehir bağlantısında aniden dönmez. Tekerlek ve biyel hareketi gidiş/dönüş yönüne bağlıdır.

Başkent ve bağlı ikmal merkezlerindeki istasyonlar rayları kapatmayacak kara noktalarına yerleştirilir. Tanklar, piyadeler ve diğer oyun sistemleri demiryolu çiziminden bağımsız kalır.

## Kamera, bütçe ve animasyon

Yakındaki tren bütçesi Düşük/Orta/Yüksek/Ultra için en fazla **6/12/20/32**'dir. Bu sınır yalnız uygun oyuncu güzergâhlarına uygulanır; başka ülkeden tren getirilmez. `stats.countries` ve `stats.positions` gerçekten çizilen lokomotifleri aynı sırada bildirir. `stats.provinces`, o görünümde üretilmiş bağlı fiziksel hatların uç eyaletlerini içerir.

Fiziksel ray geometrisi kamera çevresinde pay bırakılan bir görünüm penceresiyle sınırlanır. Küçük kamera hareketleri geometriyi yeniden üretmez; konum bölmesi veya uzaklık kademesi değişse bile aynı bütün hatlar ve istasyonlar görünüyorsa geometri korunur. Görünür hat/istasyon seçimi, kalite veya bağlı ağ değiştiğinde yenilenir. Çizilen travers sayısı en fazla 10.000, istasyon sayısı 96'dır. Uzak görünümde trenler gizlenir, uygun ray geometrisi kalır. `stats.edges` o anda üretilmiş bütün fiziksel bağlantıların sayısıdır.

Trenler **sefer duraklatıldığında da hareket etmeyi sürdürür**. Bu ortam animasyonu oyun tarihini veya kaynakları ilerletmez. Yalnız azaltılmış hareket tercihi animasyonu dondurur; gizli tarayıcı sekmesinde ana çizim döngüsü durur. Sekmeye dönüşte büyük zaman farkı sınırlandırılır. Yol sonlarında diziler ışınlanmadan aynı hat üzerinde geri hareket eder.

Önbellek, oyuncunun gerçek bağlı yolları, istasyonları ve güzergâhları değiştiğinde yenilenir. Başka ülkelerdeki değişiklikler, kopuk bir cebin ele geçirilmesi, gün, stok ve tümen hareketleri görünür bağlı ağı değiştirmiyorsa fiziksel ray geometrisini yeniden oluşturmaz.

## Doğrulama

`map3d-rail-network.test.ts` kara geometrisini, güvenli eğrileri, deniz yasağını, kesin oyuncu kontrolünü, ele geçirilen bölgenin kesintisiz bağlantısını, önbelleği ve dünya durumunun korunmasını doğrular. Sayısal aralık testleri 0,15 sınırını, deniz/komşuluk reddini, örnek noktalar arasında kalan ince engelleri ve şeritle aynı kenarları paylaşan üçüncü bölge/delik örtüşmelerini de sınar.

`map3d-railways.test.ts` gerçek THREE sahnesinde fiziksel ray/çakıl geometrisini, birleşen uç kesitlerini, sabit tekerlek açıklığını, sefer duraklatılmışken tam gidiş/dönüş hareketini, azaltılmış hareketi, hat kaybını, kalite sınırlarını, kamera önbelleğini ve kaynakların bırakılmasını doğrular. Ankara → Kastamonu → Sinop koridorunda kopuk işgal cebinin görünmediği, koridor ele geçirilince gerçek geometriye katıldığı ve tekrar kaybedilince kaldırıldığı test edilir. Yabancı ülkeye bakıldığında ona ait ray, istasyon veya tren çizilmediği ayrıca kontrol edilir.

Gerçek 18 ve 24 birimlik arazi ağları üzerinde, üretilmiş çelik rayların köşeleri ve üçgen içleri bağımsız aşağı yönlü ışın–üçgen kesişimiyle denetlenir. Testler tren tekerleklerini, yerel ray yatağını, geometri bütçesini ve aynı görünümde yeniden örnekleme yapılmamasını da kontrol eder; bu yoğun doğrulama oyun çalışırken yürütülmez.
