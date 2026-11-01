# Kullanıcı şartnamesi — 1 Kasım 2026

Bu belge istenen hedef kapsamıdır; tamamlanma raporu değildir. Uygulama durumu
[durum matrisinde](europa-expansion-status.md) ayrı tutulur.

EUROPA WAR — TAM KAPSAMLI 3D BÜYÜK STRATEJİ OYUNU
PROJE: xarmygames.online
MOD: YALNIZCA TEK OYUNCULU
TASARIM VE UYGULAMA ŞARTNAMESİ

Sen kıdemli oyun mimarı, büyük strateji oyunu tasarımcısı, 3D grafik programcısı, simülasyon geliştiricisi ve yapay zekâ mühendisi olarak çalışıyorsun.

Görevin, Europa War içerisinde aşağıda açıklanan sistemleri gerçek kod, gerçek oyun verisi, çalışan arayüz ve birbirine bağlı simülasyon olarak uygulamak.

Hedef; Hearts of Iron IV ana oyununun ve büyük genişlemelerinin kapsadığı mekanik ailelerini örnek alan, kendi tasarımına sahip, ayrıntılı bir 3D dünya haritasında oynanan tarihsel büyük strateji oyunudur.

Oyuncu bir ülkeyi yönetir. Diğer ülkeler yapay zekâ tarafından yönetilir. Oyun hesaplamaları oyuncunun cihazında çalışır. Tek oyunculu kampanya için hesap açmak veya sürekli internet bağlantısı zorunlu değildir; ilk yükleme ve indirilen içeriklerin çevrimdışı kullanılabilirliği ayrıca yönetilir.

Bu metindeki formüller, süreler, kapasiteler ve eşikler Europa War için önerilen başlangıç denge değerleridir. Bunları HOI4’ün birebir formülleri veya doğrulanmış tarihsel sayılar olarak sunma. Bütün denge değerlerini merkezi yapılandırmalardan ayarlanabilir hale getir.

HOI4’ün kodunu, görsellerini, müziğini, arayüz çizimlerini veya olay metinlerini kullanmak yerine özgün içerik üret. Tarihsel veriler ile oyun dengesi amacıyla belirlenen değerleri ayrı alanlarda tut.

Özellikleri yalnızca menü adı veya açıklama metni olarak oluşturma. Her mekanik için oyuncu eylemi, koşul kontrolü, maliyet, zaman içindeki değişim, sonuç, yapay zekâ davranışı ve test bulunmalı.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. OYUNUN TEMEL DÖNGÜSÜ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncunun temel döngüsü şu şekilde çalışmalı:

Ülkenin durumunu incele → siyasi ve ekonomik öncelik seç → inşaat ve araştırma başlat → ekipman üret → birlik eğit → diplomatik ortamı değerlendir → harekât planla → savaşı ve ikmali yönet → kayıpları tamamla → ele geçirilen bölgeleri yönet → barış şartlarını belirle.

Bu aşamalar birbirinden bağımsız mini oyunlar olmayacak.

Örneğin oyuncu daha ağır bir tank tasarladığında tankın üretim maliyeti ve yakıt ihtiyacı artacak. Aynı fabrika sayısıyla daha az tank tamamlanacak. Tümenlerin ekipman açığı büyüyebilecek. Yakıt ithalatı gerekiyorsa ticaret ve konvoy ihtiyacı ortaya çıkacak. Konvoy kayıpları yaşanırsa tank birliklerinin hareket ve savaş kapasitesi etkilenecek.

Oyuncu bütün bu zinciri arayüzden takip edebilmeli. “Tank tümenim neden zayıf?” sorusunun cevabı; ekipman eksikliği, yakıt yetersizliği, deneyim, arazi ve ikmal etkileri ayrı gösterilerek açıklanmalı.

Oyunda bedelsiz ve sonuçsuz karar bulunmamalı. Güçlü bir tercih başka bir alanda maliyet, gecikme, risk veya fırsat kaybı oluşturmalı.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. MEVCUT PROJEYE BAĞLANMA VE TEKNİK MİMARİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Önce repository içindeki paketleri, oyun rotasını, harita verilerini, arayüzü, kayıt yapısını ve mevcut simülasyon akışını incele. Kullanılan teknolojiyi dosyalardan doğrula; site adresinden framework tahmini yapma.

Mimariyi beş ana katmanda düzenle:

Simülasyon çekirdeği; ülkelerin, birliklerin, savaşların ve ekonominin gerçek durumunu hesaplar.

İçerik katmanı; senaryoları, ülkeleri, teknolojileri, ekipmanları, odakları ve olayları veri dosyalarında tutar.

Komut katmanı; oyuncunun ve yapay zekânın emirlerini aynı kurallarla doğrular ve uygular.

Sunum katmanı; 3D sahneyi, animasyonları, sesleri, haritayı ve arayüzü üretir.

Kayıt ve test katmanı; kampanyayı saklar, veri uyumluluğunu denetler ve simülasyonun doğruluğunu ölçer.

TypeScript kullanılıyorsa bütün sistemlerin açık tipleri olsun. Serbest metinle eşleşen dağınık durumlar yerine tanımlı kimlikler, enum veya union türleri kullan.

Three.js tabanlı bir çözüm seçildiğinde React Three Fiber kullanımı mevcut yapıyla uyumuna göre belirlensin. Paket sürümlerini mevcut kilit dosyası ve güncel resmî belgelerle doğrula.

Her karede bütün oyun durumunu React üzerinden yeniden işleme. Arayüz yalnızca ilgili veri değişikliklerine abone olsun. Büyük simülasyon işleri uygun olduğunda Web Worker içinde çalışsın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. DÜNYA VERİSİ VE KAYNAK TUTARLILIĞI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dünyayı ülke, eyalet, hareket bölgesi, hava bölgesi ve deniz bölgesi olarak farklı katmanlarda modelle.

Eyalet; nüfus, sanayi, kaynaklar ve işgal yönetiminin temel idari birimidir.

Hareket bölgesi; tümenlerin bulunduğu, komşuluk üzerinden hareket ettiği ve kara savaşlarının gerçekleştiği daha küçük alandır.

Hava bölgesi; uçak görevlerinin ve hava üstünlüğünün hesaplandığı geniş alandır.

Deniz bölgesi; deniz görevleri, konvoy rotaları ve deniz çatışmalarının hesaplandığı alandır.

Her bölgenin sahibi ile fiilî kontrol edeni farklı alanlar olsun. Savaş sırasında kontrol değişebilir; resmî sahiplik barış düzenlemesiyle değişebilir. Hak iddiası ve çekirdek toprak statüsü ayrıca tutulmalı.

Ekipmanlar ülke deposunda, sevkiyatta, eğitimde, cephede veya onarımda bulunabilir. Aynı tank iki konumda birden sayılamaz.

Her kaynak değişikliği gerekçeli bir işlem kaydı oluştursun. Üretim, teslimat, muharebe kaybı, ele geçirme, dönüşüm ve anlaşma teslimatı ayrı işlem türleri olsun.

İnsan gücü, yakıt, ekipman, fabrika tahsisi ve konvoy kapasitesi için negatif değer veya çift kullanım oluştuğunda testler hata versin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. ZAMAN, DURAKLATMA VE DETERMINİSTİK SİMÜLASYON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Simülasyonun temel adımı bir oyun saati olsun. Grafik çizimi bu saatten bağımsız çalışsın.

1x–5x hız seçenekleri gerçek saniyede işlenen oyun saati miktarını değiştirsin. Yüksek hız, savaş formüllerini veya günlük üretim miktarını değiştirmesin.

Duraklatıldığında dünya zamanı ilerlemesin. Oyuncu yönetim emirleri verebilsin; bu emirler tanımlı komut sınırlarında uygulansın. İnşaat, eğitim, araştırma ve savaş ilerlemesi duraklatma sırasında artmasın.

Saatlik işlemler hareket, savaş, uçuş görevleri, yakıt tüketimi ve kritik ikmal değişikliklerini kapsasın.

Günlük işlemler üretim, inşaat, araştırma, insan gücü takviyesi, istikrar değişimleri ve ekonomik raporları kapsasın.

Haftalık ve aylık işlemler uzun vadeli yapay zekâ planlaması, strateji değişimi, nüfus ve kapsamlı raporları kapsasın.

Savaşların aynı saat içindeki hasarlarını önce hesapla, ardından birlikte uygula. Ülkelerin kayıt sırası savaş sonucunda avantaj yaratmasın.

Rastgele sonuçlar kayıtlı bir başlangıç tohumu ve kayıtlı üreteç durumu üzerinden üretilecek. Grafik efektleri ayrı rastgelelik kullanacak. Kamera hareketi veya efekt sayısı savaş sonucunu değiştirmeyecek.

Aynı kayıt ve aynı komut dizisi aynı simülasyon sonucunu üretmeli.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. YENİ KAMPANYA VE OYUN KURALLARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Yeni oyun ekranında senaryo, ülke, zorluk, tarihsel yapay zekâ davranışı ve kampanya kuralları seçilebilsin.

1936 ve 1939 başlangıçları ayrı veri paketleri olsun. İkinci senaryo yalnızca tarihin değiştirildiği aynı dünya olmamalı; sınırlar, savaşlar, ordular, ekipmanlar ve diplomatik ilişkiler senaryoya göre kurulmalı.

Ülke seçim ekranında ülkenin güçlük seviyesi, sanayi durumu, insan gücü, kaynak ihtiyacı, siyasi sorunları ve başlangıç hedefleri anlaşılır biçimde gösterilsin.

Tarihsel modda ülkeler tarihsel eğilimlere öncelik versin; ancak imkânsızlaşmış koşullarda kör biçimde aynı kararı uygulamasın.

Alternatif tarih modunda siyasi yollar ve ittifaklar değişebilsin. Bu değişimler sebepli kararlarla gerçekleşsin; ülkeler her hafta rastgele ideoloji değiştirmesin.

Oyuncu ekonomik yönetimi, üretimi, hava kuvvetlerini veya cephe kontrolünü yardımcılara devredebilsin. Yetkilendirilen sistemin hangi kararı neden aldığı görülebilsin.

Kampanya hedef yılına ulaşılması otomatik olarak bütün oyunu bitirmesin. Sonuç ekranından sonra devam seçeneği sunulsun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. TARİHSEL HARİTA VE COĞRAFİ DOĞRULUK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Harita gerçek dünya coğrafyasını temel alsın. Tarihsel sınırları modern ülke sınırlarından otomatik olarak türetme.

Kıyılar, adalar, boğazlar, geçitler, nehirler ve sınırlar için ayrı coğrafi katmanlar kullan. Kaynağı doğrulanmamış tarihsel alanları veri incelemesi gerektiren kayıtlar olarak işaretle.

Hareket bölgelerinin komşuluk bilgisi yalnızca görsel yakınlığa göre kurulmasın. Denizle ayrılan iki kara parçası normal kara komşusu sayılmamalı.

Her bağlantı kara, nehir geçişi, boğaz geçişi, deniz nakli veya geçilemez sınır türü taşısın.

Harita geometrisinde delikler, çok parçalı adalar ve tarih değiştirme çizgisi gibi durumlar desteklensin. Bir bölgenin tıklanabilir alanı görünen sınırıyla uyumlu olsun.

Boğazlardan geçiş; kontrol, savaş ilişkisi ve diplomatik erişim kurallarına bağlı olsun.

Bir kontrol değişikliği gerçekleştiğinde ilgili sınırlar, cepheler, ikmal rotaları, ekonomik erişim ve harita rengi olay üzerinden güncellensin. Bunun için bütün dünya geometrisini yeniden üretme.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. GERÇEK 3D ARAZİ VE HARİTA GÖRÜNÜMÜ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Harita düz bir görsele eklenmiş hareketli simgelerden oluşmasın. Arazi gerçek yükseklikli bir mesh, şehirler ve birlikler üç boyutlu nesneler olsun.

Dünya yüzeyini parçalara böl. Her parçanın farklı ayrıntı seviyeleri bulunsun. Kamera yakınındaki parçalar daha ayrıntılı, uzaktakiler daha sade çizilsin.

Dağ yüksekliklerini okunabilir stratejik ölçeğe dönüştür. Görsel kabartı birlik simgelerini ve sınırları tamamen örtmesin.

Arazi materyalleri ova, orman, çöl, kar, kayalık ve şehir dokuları arasında yumuşak geçiş yapsın. Aynı dokunun büyük ölçekte tekrarı belirgin görünmesin.

Denizde derinliğe bağlı renk, yüzey hareketi, kıyı köpüğü ve gemi izi olsun. Yansıma ve dalga ayrıntısı grafik kalitesiyle değişsin.

Şehir yoğunluğu nüfus ve yapılaşma verisinden türesin. Sanayi bölgelerinde fabrika yapıları, limanlarda iskele ve depolar, hava üslerinde pist ve hangarlar görünsün.

Şehir görselleri her oyun yüklemesinde rastgele yer değiştirmesin; bölge kimliğine bağlı görsel tohumla tutarlı oluşturulsun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. KAMERA, HARİTA SEÇİMİ VE OKUNABİLİRLİK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sol tık seçsin, boş alanda sürükleme kutu seçimi oluştursun, sağ tık seçili birliklere bağlama uygun emir versin.

Fare tekerleği yakınlaştırmayı değiştirsin. Orta tuş veya tanımlı kombinasyon kamera dönüşünü sağlasın. WASD ve isteğe bağlı kenar kaydırma desteklensin.

Arayüz üzerindeki tıklama haritaya geçmesin. Diplomasi panelindeki bir düğme yanlışlıkla arkadaki orduya emir vermesin.

Uzak görünümde ülke isimleri, sınırlar, büyük cepheler ve toplulaştırılmış ordu işaretleri öne çıksın.

Orta görünümde eyaletler, şehirler, ikmal bağlantıları ve tümen simgeleri belirginleşsin.

Yakın görünümde 3D modeller, yollar, yapılar ve yerel efektler görünür hale gelsin.

Birbirinin üstüne gelen birlik işaretleri kümelensin; tıklanınca açılan seçim listesiyle ayrıştırılsın.

Savaş, ikmal sorunu veya diplomatik olay bildirimi tıklandığında kamera ilgili alana yumuşak biçimde gitsin. Kamera oyuncunun komutu olmadan sürekli başka cephelere atlamasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. 3D BİRLİKLER VE ANİMASYONLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Her tümen için binlerce ayrı asker çizmek yerine sınırlı sayıda temsilî model kullan. Tümenin gerçek asker sayısı simülasyonda, temsilî modelleri görsel katmanda bulunsun.

Piyade yürürken adım animasyonu, motorize birliklerde araç hareketi, tanklarda palet ve tekerlek dönüşü göster.

Tank kulesi hedef yönüne dönebilsin. Ateş sırasında namlu geri tepmesi, kısa ışık, duman ve ses oluşsun.

Topçu birlikleri mevzilenme ve ateş etme durumlarını ayırsın. Uçaklar kalkış, görev, dönüş ve iniş durumlarına; gemiler seyir, çatışma, hasar ve liman durumlarına sahip olsun.

Animasyon durumları bekleme, hareket, saldırı, savunma, geri çekilme ve ikmal olarak tanımlansın. Bir model aynı anda hem koşma hem hareketsiz ateş animasyonu oynatmasın.

Görsel merminin hedefe değmesi savaş hasarını hesaplamasın. Savaş motorunun doğruladığı olay, uygun animasyonu ve efekti tetiklesin.

Düşük grafik ayarında model ve efekt sayısı azalabilir; tümenin gerçek gücü ve savaş sonucu aynı kalmalı.

Model bulunmadığında çalışır ve anlaşılır bir temsilî 3D varlık kullan; hangi varlıkların sonradan özgün sanat üretimine ihtiyaç duyduğu proje kayıtlarında açıkça bulunsun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. HAVA DURUMU, GECE-GÜNDÜZ VE SES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hava durumu iklim bölgesi, mevsim ve önceki hava durumuna göre gelişsin. Komşu bölgeler arasında tamamen kopuk rastgele hava geçişleri oluşmasın.

Yağmur, kar, çamur, sıcaklık ve fırtına ayrı değerler taşısın. Yağmur durduğu anda çamur etkisi sıfırlanmasın; kuruma süresi olsun.

Görsel kar kalınlığı ve çamur görünümü simülasyondaki arazi koşullarına bağlı olsun.

Yerel gece-gündüz durumu coğrafi konuma göre hesaplanabilsin. Oyuncu okunabilirlik için sabit gündüz görünümü seçtiğinde simülasyondaki gece etkileri devam etsin.

Gece şehir ışıkları ve kısa süreli patlama aydınlatmaları kullan. Her patlama için pahalı bir dinamik ışık oluşturmak yerine sınırlı ışık havuzu kullan.

Ses; kamera konumu, uzaklık ve yakınlaştırma düzeyine göre değişsin. Dünya görünümündeyken yüzlerce silah sesi üst üste çalmasın.

Müzik barış, hazırlık, savaş ve kriz durumlarına yumuşak geçiş yapsın. Arayüz, ortam, müzik ve savaş sesleri ayrı ayarlanabilsin.

Parlama, ekran sarsıntısı ve yoğun efektler için erişilebilirlik seçenekleri sun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. ÜLKE YÖNETİMİ, SİYASİ GÜÇ VE HÜKÜMET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Her ülkenin siyasi gücü, istikrarı, savaş desteği, hükümeti, ideolojik destek dağılımı, ulusal etkileri ve yürürlükteki yasaları olsun.

Siyasi güç zaman içinde kazanılan karar kapasitesidir. Bakan atama, yasa değişikliği, diplomatik girişim ve bazı kararlar bunu tüketir.

İstikrar iç düzeni ve yönetim kapasitesini; savaş desteği halkın savaş yükünü kabul etmesini temsil etsin. İkisi aynı değişken olmasın.

Uzun savaşlar, kayıplar, bombardıman, kaynak sıkıntısı ve siyasi krizler bu değerleri etkileyebilir. Etkiler nedenleriyle birlikte gösterilsin.

Hükümet ekranında lider, danışmanlar, ekonomi sorumluları ve askerî kadro görülsün. Atamalar belirli bonuslar sağlarken siyasi maliyet veya başka bir fırsattan vazgeçme gerektirsin.

İdeoloji değişimi tek düğmeyle anında gerçekleşmesin. Destek artışı, olaylar, seçimler, reform süreci veya iç savaş gibi geçiş mekanizmaları olsun.

Bütün ülkelerde aynı siyasi sorunlar kullanılmasın. Parlamento desteği, parti içi dengeler, asker-sivil rekabeti ve koalisyon yönetimi ülke verisiyle etkinleşen sistemler olsun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12. EKONOMİ, TİCARET VE ASKERLİK YASALARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ekonomi yasaları sivil tüketim ihtiyacını, askerî dönüşüm kapasitesini ve inşaat önceliklerini etkilesin.

Savaş ekonomisine geçiş daha fazla fabrikayı savaş için kullanılabilir hale getirirken siyasi şart, savaş desteği veya dünya gerilimi koşulu gerektirebilsin.

Askerlik yasaları erişilebilir insan gücünü belirlesin. Daha geniş seferberlik iş gücü, eğitim kalitesi veya üretim üzerinde maliyet oluşturabilsin.

Yeni yasa seçildiğinde insan gücü bir anda tamamen hazır havuza eklenmesin. Seferberlik süresi boyunca kademeli erişim sağlansın.

Ticaret yasaları kaynakların iç kullanım ve dış erişim oranını, araştırma etkileşimini ve diplomatik sonuçları etkilesin.

Yasa ekranında mevcut ve yeni yasanın etkilerini karşılaştır. “Daha fazla asker” gibi genel açıklama yerine insan gücü artışı, geçiş süresi ve üretim etkisi ayrı gösterilsin.

Yapay zekâ savaşa hazırlanırken yasalarını önceden değerlendirsin; barış zamanı gereksiz en yüksek seferberlik düzeyinde kalmasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13. ULUSAL ODAKLAR, KARARLAR VE OLAYLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ulusal odak ağacını ön koşulları olan yönlü bir grafik olarak kur. Her odak kimlik, açıklama, süre, başlangıç koşulu, devam koşulu, tamamlanma etkisi ve yapay zekâ tercih ağırlığı taşısın.

Oyuncu bir odak seçtiğinde zaman ilerledikçe tamamlanma yüzdesi artsın. Birbiriyle çelişen siyasi yollar açık biçimde işaretlensin.

Bir odak fabrika, araştırma bonusu, diplomatik teklif, ulusal etki veya yeni karar açabilir. Sonuçlar ilgili gerçek sistemlere uygulanmalı.

Odakla açılan “yeni fabrika” gerçekten inşaat ve sanayi kapasitesine yansısın. Açılan savaş hedefi diplomasi kurallarından geçsin.

Kararlar daha kısa ve duruma bağlı eylemler olsun. Her kararın maliyeti, süresi, tekrar kullanılma koşulu ve bekleme süresi bulunsun.

Süreli görevler başarılabilecek somut hedef taşısın: belirli tarihe kadar demiryolu kurmak, ordunun ekipman açığını azaltmak veya diplomatik destek sağlamak gibi.

Olay motoru tarih, koşul ve önceki olaylara göre çalışsın. Aynı olayın yanlışlıkla tekrar ödül vermesi engellensin.

Veri dosyalarındaki etkileri güvenli, sınırlı bir kural sistemiyle yorumla. Olay içeriğini çalıştırılabilir rastgele JavaScript olarak değerlendirme.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14. NÜFUS VE İNSAN GÜCÜ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Toplam nüfus, askerliğe uygun potansiyel, seferber edilen havuz, eğitimdeki personel, aktif askerler ve garnizon personeli ayrı tutulsun.

Bir tümen eğitimine personel ayrıldığında aynı kişiler başka bir tümenin eğitimine tekrar atanamasın.

Muharebe kayıplarını geri dönebilecek yaralılar ve kalıcı personel kaybı gibi soyut kategorilerle işle. Sıhhiye desteği uygun geri dönüş oranını ve deneyim kaybını etkileyebilsin.

Takviye bir anda cephede belirmesin. Personel aktarımı için süre ve erişilebilir ikmal bağlantısı hesaba katılsın.

İşgal edilen çekirdek olmayan bölgelerin nüfusuna tam erişim verilmesin. Yönetim biçimi, uyum, özerklik ve ülkeye özgü kurallar erişimi belirlesin.

Ordunun küçültülmesi veya seferberliğin azaltılması durumunda personelin sivil yaşama dönüşü tanımlı süreçle gerçekleşsin.

İnsan gücü ekranında yalnız toplam sayı değil, personelin nerede kullanıldığı ve hangi cephelerde açık bulunduğu gösterilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
15. İNŞAAT, FABRİKALAR VE ONARIM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sivil fabrika, askerî fabrika, tersane, altyapı, demiryolu, liman, hava üssü, ikmal merkezi, radar, tahkimat, uçaksavar, rafineri, yakıt deposu ve araştırma tesisi ayrı yapı türleri olsun.

Eyaletlerin yapı kapasitesi ve bazı yapılar için coğrafi koşulları bulunsun. Kıyısı olmayan eyalette tersane veya deniz üssü kurulamasın.

Oyuncu inşaat kuyruğunu önceliklendirsin. Kullanılabilir sivil fabrikalar tüketim, ticaret ve diğer yükümlülüklerden sonra projelere dağıtılsın.

Başlangıç formülü:

Günlük ilerleme =
atanan sivil fabrika
× fabrika başına inşaat puanı
× altyapı etkisi
× ülke inşaat etkisi
× bölgesel koşul etkisi.

Örneğin 8 fabrika, 5 temel puan, 1,20 altyapı ve 1,10 ülke katsayısıyla günde 52,8 puan sağlar.

Tamamlanma tarihi mevcut ilerleme hızından tahmin edilsin; hız değişince güncellensin.

Bombardıman veya çatışma nedeniyle hasarlanan yapı tam kapasite çalışmasın. Onarım kuyruğu üretim kapasitesini aşamalı geri kazandırsın.

3D haritada şantiye, tamamlanmış bina ve hasarlı bina durumları ayırt edilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
16. KAYNAKLAR, PETROL VE YAKIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Temel sanayi kaynakları olarak çelik, alüminyum, tungsten, krom ve kauçuğu; yakıt ekonomisinin girdisi olarak petrolü kullan.

Ek kaynaklar ancak açık tüketici ve oynanış gerekçesiyle sisteme bağlansın. Kullanılmayan dekoratif kaynak göstergeleri oluşturma.

Sanayi kaynaklarını günlük erişilebilir üretim kapasitesi olarak modellemek ile stoklanabilir ürünleri birbirinden ayır. Petrol, yakıt ve tamamlanmış ekipmanın stok mantığı açık olsun.

Bir ülkenin kaynak erişimi kontrol ettiği üretim, ithalat, ihracat yükümlülükleri, işgal verimi ve taşımacılık kayıplarından hesaplanmalı.

Petrol uygun rafinaj kapasitesi ve teknolojiyle yakıta dönüşsün. Sentetik tesislerin üretimi ayrı maliyet ve verim kuralları taşısın.

Yakıt tank, kamyon, uçak, gemi ve tatbikat kullanımından tüketilsin. Kullanım türleri farklı oranlar gerektirsin.

Ülke yakıtı ile birliklerin yerel yakıt rezervini ayır. Ülkede yakıt bulunması kuşatılmış tank tümeninin otomatik yakıt alması anlamına gelmesin.

Yakıt ekranı stok, günlük üretim, günlük tüketim ve mevcut kullanım devam ederse tahmini dayanma süresini göstersin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
17. ÜRETİM HATLARI VE EKİPMAN STOKLARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncu bir ekipman tasarımı seçerek üretim hattı kursun. Hatta askerî fabrika veya gemi üretiminde tersane atasın.

Fabrika tahsislerinin toplamı kullanılabilir kapasiteyi aşamasın. Hasar veya işgal nedeniyle kapasite azalınca tanımlı öncelik kuralı devreye girsin.

Başlangıç üretim formülü:

Günlük üretim puanı =
fabrika sayısı
× temel fabrika çıktısı
× hat verimliliği
× kaynak yeterlilik katsayısı
× sanayi etkileri.

10 fabrika, 4,5 temel çıktı, 0,80 verimlilik ve 0,90 kaynak yeterliliğinde günlük 32,4 puan üretir.

Ekipman maliyeti 12 puansa 2 ekipman tamamlanır; 8,4 puan sonraki güne taşınır. Kesirli ekipman stoklara eklenmez.

Hat verimliliği zaman içinde büyüsün. Benzer tasarıma geçiş ile tamamen farklı ürün sınıfına geçiş farklı uyum maliyetleri oluştursun.

Kaynaklar önceliklere göre dağıtılsın. Aynı çelik kapasitesini iki üretim hattına tam miktarda vermek mümkün olmasın.

Eski ekipmanlar depoda kalabilir, düşük öncelikli birliklere verilebilir, pazara sunulabilir veya uygun tasarımlara dönüştürülebilir.

Dönüşüm işlemi mevcut ekipmanı, üretim süresini ve gereken ek malzemeyi tüketerek yeni varyant oluşturmalı.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
18. TİCARET, SİLAH PAZARI VE ASKERÎ YARDIM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kaynak ticaretinde satıcı, alıcı, miktar, karşılık, taşıma yolu ve anlaşma koşulları tanımlansın.

Anlaşma imzalanması teslimatın garanti olduğu anlamına gelmesin. Deniz rotası, konvoy kapasitesi, ambargo ve savaş durumu her teslimat döneminde değerlendirilsin.

Uluslararası silah pazarında ülkeler stoklarındaki uygun ekipmanları satışa çıkarabilsin. Alıcı ekipman miktarı ve endüstriyel ödeme yükünü görsün.

Ödeme sivil sanayi katkısı üzerinden kurulursa alıcının ayırdığı kapasite ile satıcının elde ettiği katkı aynı işlem kaydıyla eşleşsin.

Satılan ekipman satıcı deposundan sevkiyata aktarılır; teslim edilirse alıcı deposuna geçer. Taşıma sırasında kaybedilen ekipman ayrıca raporlanır.

Askerî yardım anlaşmaları tek seferlik, düzenli veya üretim payına bağlı olabilsin. Yetersiz stokta anlaşmanın nasıl davranacağı açıkça tanımlansın.

Lisanslı üretim, yabancı tasarımın belirli koşullarla yerel fabrikalarda üretilmesini sağlasın. Lisans erişimi, maliyet, süre ve teknoloji farkına bağlı verim etkisi bulunsun.

Yapay zekâ satarken kendi savaş ihtiyacını; alırken üretim açığı, teslim süresi ve taşıma riskini değerlendirsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
19. ASKERÎ SANAYİ KURULUŞLARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ülkelerin tank, uçak, gemi, topçu veya piyade ekipmanında uzmanlaşan sanayi kuruluşları olsun.

Oyuncu araştırma veya üretim tasarımını uygun kuruluşa bağlayabilsin. Kuruluş çalıştıkça deneyim kazansın ve uzmanlık seçenekleri açsın.

Bir kuruluş ucuz seri üretime, diğeri yüksek performansa, bir başkası güvenilirlik veya menzile odaklanabilsin.

Seçimler gerçek ödünleşimler yaratsın. Daha güçlü top üretim maliyetini artırabilir; daha iyi standardizasyon bakım ve dönüşüm süresini azaltabilir.

Kuruluşun yeni yeteneği mevcut bütün ekipmanların özelliklerini açıklamasız biçimde anında değiştirmesin. Tasarım sürümleri hangi kuruluş etkileriyle üretildiklerini saklasın.

Arayüz, aynı ekipmanın farklı kuruluşlarla maliyet ve performans karşılaştırmasını göstersin.

Yapay zekâ yalnız en yüksek saldırı değerini değil, ülkesinin sanayi ve kaynak kapasitesini dikkate alarak kuruluş seçsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
20. ARAŞTIRMA, TEKNOLOJİ VE DOKTRİN AYRIMI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Araştırma ağacında piyade ekipmanı, topçu, zırhlılar, uçaklar, gemiler, sanayi, mühendislik, elektronik, radar, şifreleme ve ilgili destek teknolojileri bulunsun.

Her teknolojinin ön koşulları, temel maliyeti, tarih seviyesi ve açtığı içerik tanımlansın.

Araştırma yuvaları sınırlı olsun. Oyuncu bir teknoloji seçtiğinde ilgili yuvada ilerleme başlasın.

Döneminden ileri araştırma daha fazla süre gerektirebilir. Bu ceza teknoloji farkıyla hesaplanmalı ve ekranda gösterilmeli.

Teknoloji paylaşımı, araştırma kuruluşları ve ulusal etkiler süreyi değiştirebilsin.

Yeni silah teknolojisi açılması mevcut tüfekleri otomatik olarak yeni modele dönüştürmesin. Yeni modelin üretimi, dağıtımı ve eski ekipmanın kullanım politikası ayrıca yönetilsin.

Doktrinler teknolojiyle aynı şey değildir. Doktrinler ordunun eğitimini, komuta alışkanlığını ve savaş yaklaşımını temsil etsin.

Doktrin geliştirme için deneyim, eğitim, savaş tecrübesi ve uygulama süreci kullan. Bir doktrin değişikliği bütün ordunun aynı saat içinde kusursuz biçimde yeni taktiğe geçmesine yol açmasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
21. TANK TASARIMCISI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncu şasi seçtikten sonra kule, ana silah, motor, süspansiyon, zırh düzeni, telsiz ve uygun yardımcı modülleri yerleştirsin.

Her modül maliyet, ağırlık, kaynak, güvenilirlik ve savaş istatistiklerine katkı sağlasın.

Ağır top daha yüksek delme veya saldırı sağlayabilir; fakat daha büyük kule, daha ağır şasi veya daha güçlü motor gerektirebilir.

Zırh artırıldığında ağırlık ve üretim maliyeti artsın. Motor gücü yeterli değilse hız düşsün.

Motor geliştirmeleri hız kazandırırken yakıt tüketimi ve güvenilirlik üzerinde denge maliyeti oluşturabilsin.

Şasi kapasitesini aşan tasarım geçerli sayılamasın. Hatanın nedeni “yük kapasitesi aşıldı” gibi açık gösterilsin.

Hafif keşif tankı, ana muharebe tankı, tank avcısı, kundağı motorlu topçu, uçaksavar ve uygun özel destek araçları rol olarak ayrışsın.

Tasarım ekranında yalnız savaş değerleri değil, belirli fabrika sayısıyla aylık tahmini üretim ve tümen başına yakıt yükü gösterilsin.

3D önizleme seçilen kule, top ve gövde sınıfını mümkün olduğu ölçüde yansıtsın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
22. UÇAK VE GEMİ TASARIMCILARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Uçak tasarımında gövde, motor, silah, bomba yükü, yakıt kapasitesi, savunma ve görev modülleri bulunsun.

Ağırlık ile motor kapasitesini birlikte değerlendir. Ağır silah ve yakıt yükü menzil, çeviklik, hız ve görev etkinliği üzerinde ödünleşim oluştursun.

Avcı, önleyici, yakın hava desteği, deniz saldırısı, taktik bombardıman, stratejik bombardıman, keşif ve nakliye rolleri geçerli modül kombinasyonlarına bağlı olsun.

Uçak gemisinde görev yapabilen tasarımlar gerekli uygunluk özelliğini taşısın.

Gemi tasarımında gövde, motor, ana batarya, ikincil silahlar, torpido, uçaksavar, radar, sonar, zırh ve görev modülleri kullan.

Denizaltı, muhrip, kruvazör, büyük savaş gemisi ve uçak gemisi sınıflarının modül kuralları farklı olsun.

Bir gemiye her sistemin en güçlüsünü koymak en iyi çözüm olmasın. Maliyet, hız, menzil, görünürlük ve yakıt yükü gerçek karşılık oluştursun.

Mevcut geminin modernizasyonu tersane kapasitesi ve zaman gerektirsin. Büyük gövde değişiklikleri ile küçük elektronik güncellemeleri aynı maliyete sahip olmasın.

Oyuncu tasarımları isimlendirebilsin, sürümleyebilsin ve üretime bağlayabilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
23. TÜMEN TASARIMCISI VE DESTEK BİRLİKLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tümen şablonu; muharebe taburları, alay düzeni, tümen destekleri ve uygun alay desteklerinden oluşsun.

Piyade, süvari, motorize, mekanize, tank, topçu, tanksavar, uçaksavar, roket topçusu ve özel kuvvet taburları desteklensin.

Destekler mühendislik, keşif, lojistik, sıhhiye, haberleşme, bakım, güvenlik ve role uygun ateş desteğini kapsasın.

İnsan gücü ve ekipman gereksinimleri toplanarak hesaplansın. Organizasyon uygun ağırlıklarla; saldırı ve savunma katkıları görevlerine göre birleştirilsin.

Hız en yavaş zorunlu muharebe unsuru ve ekipman yeterliliğiyle sınırlandırılsın. Tank eklemek piyade ağırlıklı tümeni otomatik olarak hızlı yapmasın.

Zırh ve delme değerlerini yalnız en güçlü tek taburun değeriyle belirleme. Güçlü unsurun katkısı ile tümenin genel yapısını birleştiren ayarlanabilir formül kullan.

Savaş genişliği, ikmal ihtiyacı ve yakıt kullanımı şablondan türesin.

Oyuncu bir tabur eklerken değişen değerleri ve gereken toplam ekipmanı hemen görsün.

Şablon değişikliği sahadaki tümenlere uygulandığında yeni ihtiyaçlar takviye sistemine girsin. Eksik araçlar veya personel kendiliğinden oluşmasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
24. EĞİTİM, KONUŞLANDIRMA VE TAKVİYE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Yeni tümen için şablon, eğitim merkezi, adet ve ekipman önceliği seçilsin.

İnsan gücü ayrılır, ekipman depodan tahsis edilir ve eğitim ilerler. Eksik ekipman hangi eğitim aşamasını ne kadar etkiliyor açık olsun.

Oyuncu yeterli koşullarda erken konuşlandırma yapabilsin; bunun eğitim ve savaş etkinliği maliyeti bulunsun.

Konuşlandırma yalnız uygun dost bölgelere ve tanımlı erişim kurallarına göre yapılsın. Kuşatılmış uzak bölgelere yeni tümen anında yerleştirilemesin.

Tatbikat deneyim ve doktrin uygulaması sağlarken yakıt, ekipman yıpranması ve hazırlık maliyeti oluştursun.

Cephedeki tümenlerin önceliği elit, normal veya düşük gibi seviyelerle ayarlanabilsin. Takviye dağıtımında öncelik, ulaşılabilirlik ve ihtiyaç birlikte değerlendirilsin.

Organizasyon, mevcut personel oranı, ekipman yeterliliği ve deneyim ayrı göstergeler olsun.

Tam personelli fakat ekipmansız bir tümen ile ekipmanı tam fakat yorgun bir tümen farklı davranmalı.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
25. KOMUTA ZİNCİRİ, KARARGÂHLAR VE SUBAYLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tümenler ordulara, ordular ordu gruplarına ve savaş alanlarına bağlanabilsin.

Generaller saldırı, savunma, planlama ve lojistik becerileri taşısın. Mareşal ve general etkileri aynı bonusun sınırsız tekrarına dönüşmesin.

Komuta kapasitesini aşan büyüklükte ordularda koordinasyon cezası oluşsun.

Karargâh harita üzerinde konumlanabilsin. Etkisi ulaşılabilirlik, mesafe, haberleşme ve komuta kapasitesine göre yakın birliklere yayılsın.

Cepheye yakın karargâh daha güçlü yerel koordinasyon sağlayabilir; ancak kuşatılma ve komutanın esir düşmesi riski taşısın.

Karargâhın yeri değişirken geçici komuta etkisi ve taşınma süresi uygulansın.

Komuta gücüyle kullanılan yetenekler süre, maliyet, kapsam ve yan etki taşısın. Acil savunma veya zorlanmış taarruz bedelsiz genel güçlendirme olmasın.

Tümen komutanları ve gemi kaptanları başarı kaydı tutabilsin, deneyim kazanabilsin ve uygun koşullarda üst görevlere terfi edebilsin.

Madalyalar tarihçeye bağlı ödüller olsun. Aynı başarıdan sınırsız ödül üretilemesin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
26. DOKTRİNLER, ORDU RUHU VE ÖZEL KUVVETLER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kara doktrinleri hareketli savaş, yoğun ateş desteği, planlı taarruz ve geniş insan gücü kullanımı gibi farklı stratejik yaklaşımlar sunsun.

Her yaklaşım yalnız saldırı bonusu vermesin; plan hazırlığı, ikmal ihtiyacı, takviye, organizasyon, gece operasyonu veya birlik türleri üzerinde farklılık oluştursun.

Hava doktrinleri avcı kontrolü, kara desteği, stratejik hava harekâtı ve deniz desteği arasında seçimler getirsin.

Deniz doktrinleri büyük filo muharebesi, ticaret baskını ve uçak gemisi ağırlıklı yaklaşımı farklılaştırsın.

Ordunun yeni doktrindeki ustalığı eğitim ve savaş deneyimiyle artsın. Doktrin değişiminin geçiş maliyeti olsun.

Ordu, hava kuvveti ve donanma ruhları komuta kültürünü temsil eden sınırlı seçimler olsun.

Dağcı, deniz piyadesi ve paraşütçü gibi özel kuvvetler özel eğitim kapasitesi gerektirsin. Bütün orduyu hiçbir maliyet olmadan özel kuvvet yapmak mümkün olmasın.

Özel kuvvet geliştirmeleri görevlerine uygun kazanım sağlasın; dağcı birlikler her arazide bütün diğer birliklerden üstün olmasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
27. HAREKET, YOL BULMA VE STRATEJİK NAKLİYE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncu hedef verdiğinde rota hareket bölgelerinin bağlantı grafiğinden hesaplansın.

Rota maliyeti mesafe, arazi, hava, altyapı, geçiş hakkı, düşman tehdidi ve birlik türüne bağlı olsun.

Yol bulma sistemi kara hareketi ile deniz naklini ayırsın. Denizi geçmek için liman, taşıma kapasitesi ve uygun deniz rotası gereksin.

Stratejik demiryolu nakli normal yürüyüşten hızlı olsun; ancak hazırlık, organizasyon ve demiryolu kapasitesi açısından maliyet taşısın.

Birlik hareketi başlangıç, rota, hedef ve ilerleme bilgisi taşısın. Görsel model bu ilerlemeyi yumuşak biçimde gösterirken gerçek konum kurallı eşiklerde güncellensin.

Rota üzerindeki bölge düşman eline geçerse yeniden değerlendirme yapılsın. Birlik kapalı sınırdan veya geçersiz bağlantıdan devam etmesin.

Komşu düşman bölgesine verilen sağ tık, savaş ilişkisi varsa saldırı emrine dönüşsün. Tarafsız ülkeye tıklamak otomatik savaş ilanı üretmesin.

Varış tahmininde hızın hangi sebeplerle değiştiği görülebilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
28. CEPHE ÇİZGİLERİ VE HAREKÂT PLANLARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncu ordu seçip sınır üzerinde cephe tanımlasın. Cephe geometrik bir çizgi olmanın yanında gerçek sınır bağlantılarından oluşsun.

Tümen dağıtımı düşman tehdidi, savunma arazisi, stratejik hedefler, ikmal kapasitesi ve mevcut konum üzerinden yapılsın.

Gereksiz sürekli yer değiştirmeyi önlemek için mevcut mevzide kalmaya değer veren bir kararlılık maliyeti kullan.

Oyuncu genel taarruz hattı, dar yarma ekseni, geri savunma hattı ve bölge güvenliği emri verebilsin.

Plan hazırlığı yalnız görevine ulaşmış, uygun durumda ve hazırlık yapabilen birliklerde biriksin. Sürekli hareket eden birlik aynı hızda planlama avantajı kazanmasın.

Taarruzun temkinli, dengeli veya saldırgan uygulanması seçilebilsin. Bu seçim tahmini güç oranı, kayıp toleransı ve ikmal risk eşiklerini değiştirsin.

Cephe yarıldığında yeni hatlar oluşsun. Kuşatma veya coğrafi kopma durumunda cephe alt parçalara ayrılabilsin.

Tanklar dar geçişte anlamsız biçimde bütün cepheye dağılmasın; uygun yarma noktalarında yoğunlaştırılabilsin.

Elle verilen emrin otomatik cephe yöneticisi tarafından hemen tersine çevrilmesini önlemek için emir önceliği tanımla.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
29. KARA MUHAREBESİNİN HESAPLANMASI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Savaş başladığında saldıranlar, savunanlar, yedekler, saldırı yönleri, arazi, nehir geçişleri ve hava desteğiyle bir muharebe kaydı oluştur.

Her tümenin yumuşak hedef saldırısı, sert hedef saldırısı, savunma, yarma, zırh, delme, organizasyon, dayanıklılık ve ekipman yeterliliği değerlendirilsin.

Hedefin sertlik oranına göre temel saldırı:

A = yumuşak saldırı × (1 − hedef sertliği)
  + sert hedef saldırısı × hedef sertliği.

Sonra gerçek personel ve ekipman durumu, arazi, ikmal, komuta ve diğer etkiler uygulanarak etkili saldırı bulunsun.

Savunan hedefin savunması; saldıran hedefin karşı ateşe dayanımında yarma değeri kullanılsın.

Örnek hasar baskısı:

H = 0,10 × min(A, D) + 0,40 × max(A − D, 0).

Buradaki D uygun savunma değeridir. Katsayılar ayarlanabilir denge değerleridir.

H doğrudan ölen asker sayısı değildir. Organizasyon hasarı ile personel ve ekipman hasarı ayrı katsayılarla hesaplanır.

Zırh ve delme etkileşimi kademeli olsun. Küçük bir eşik farkı sınırsız güç sıçraması yaratmasın.

Bütün tarafların aynı saatlik hasarını önce hesapla, ardından birlikte uygula.

Savaş ekranı nihai sonucu etkileyen katsayıları açılabilir ayrıntıyla göstersin. Oyuncu yalnız kırmızı veya yeşil bir sayı görmesin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
30. SAVAŞ GENİŞLİĞİ, TAKTİKLER VE YIPRANMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Her arazi türü aynı anda etkili savaşabilecek birlik genişliği belirlesin.

Birden fazla uygun yönden saldırı kullanılabilir genişliği artırabilir; fakat sınırsız tümen yığılması sınırsız etkinlik vermesin.

Genişliği aşan birlikler yedekte beklesin veya tanımlı aşırı yığılma cezasına tabi olsun. Yedekten katılım haberleşme, doktrin ve koşullara bağlı gerçekleşsin.

Generaller mevcut arazi, keşif bilgisi, birlik yapısı ve doktrine göre taktik seçsin. Karşı taktik sistemi mutlak garanti değil avantaj oluştursun.

Tahkimat, siperlenme, nehir geçişi, şehir, dağ ve orman etkileri ayrı uygulanmalı.

Siperlenme uygun bölgede zamanla büyüsün; sürekli hareket eden birlik aynı mevzi avantajını taşımasın.

Muharebe dışı yıpranma ikmal, hava, arazi, ekipman güvenilirliği ve tatbikattan doğabilsin.

Birden fazla cezanın birleşimi kontrolsüz negatif istatistik üretmesin. Alt-üst sınırlar ve aynı etkinin tekrar uygulanmasını engelleyen kurallar olsun.

Demiryolu topları ray erişimi, menzil, mühimmatın soyut ikmal yükü ve konuşlanma süresiyle bölgesel destek versin. Haritada her yere anında etki edemesin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
31. GERÇEK İKMAL AĞI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

İkmali başkent, uygun ana depolar, yerel üretim, demiryolları, ikmal merkezleri, limanlar ve son kilometre taşımacılığından oluşan kapasiteli bir ağ olarak kur.

Bir merkezin haritada bulunması tek başına yeterli değildir. Kaynağa ulaşan rota ve rota kapasitesi bulunmalıdır.

Demiryolu seviyesi, hasar, tren yeterliliği, liman kapasitesi ve konvoy kayıpları taşınabilir miktarı etkilesin.

Aynı demiryolu kapasitesi birden fazla orduya ayrı ayrı tam kapasite olarak sayılmasın. Talepler ortak kapasiteyi paylaşsın.

İkmal merkezinden tümenlere dağıtım mesafe, arazi, hava ve motorize dağıtım seviyesine bağlı olsun.

Motorize dağıtım menzili ve kapasiteyi artırırken kamyon ve yakıt tüketsin. Kamyon açığında belirtilen fayda gerçekleşmesin.

Yeni ele geçirilen demiryolları ve merkezler onarım, uyarlama veya hazırlık süresinden sonra tam çalışsın.

İkmal haritasında yalnız renk değil darboğazın yeri de gösterilsin: yetersiz liman, hasarlı hat, eksik tren, aşırı birlik yoğunluğu gibi.

Oyuncu bir tümenin ikmal kaynağına kadar olan rotasını görüntüleyebilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
32. KUŞATMA, GERİ ÇEKİLME VE TESLİM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kara bağlantısı kesilen tümeni hemen tamamen ikmalsiz sayma. Deniz, hava ve yerel kaynak erişimini ayrıca kontrol et.

Kuşatma askeri bağlantının; ikmalsizlik ise gerçek teslimat yetersizliğinin sonucu olarak ayrı değerlendirilsin.

Birliklerin sınırlı yerel rezervi olsun. İkmal kesildiğinde rezerv tüketilsin; tümen aynı saatte bütün savaş gücünü kaybetmesin.

Rezervler azaldıkça organizasyon yenilenmesi, hareket, savaş etkinliği ve yıpranma kademeli etkilensin.

Organizasyonu çöken birlik güvenli geri çekilme rotası arasın. Hedef bölgenin erişimi ve kapasitesi kontrol edilsin.

Geri çekilen birlik normal saldırı emrindeki gibi davranmasın. Hareket, yeniden örgütlenme ve takip baskısı kuralları olsun.

Kaçış imkânı kalmayan ve savaşma kapasitesini kaybeden birlikler tanımlı teslim kurallarıyla savaş dışı kalsın.

Ele geçirilen ekipman miktarı gerçek mevcut stokla sınırlı olsun. Surrender olayı yoktan ekipman üretmesin.

Yapay zekâ kuşatma riskini yalnız çember kapandıktan sonra değil, geri bağlantı daralırken değerlendirsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
33. HAVA ÜSLERİ VE HAVA GÖREVLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Uçaklar hava kanatları halinde hava üslerine atanabilsin. Her üs kapasite, hasar, ikmal ve yakıt durumu taşısın.

Hava bölgesine görev atarken menzil kapsamı hesaplanmalı. Bölgenin yalnız küçük kısmına ulaşabilen uçak tam etkinlik göstermesin.

Hava üstünlüğü, önleme, yakın hava desteği, stratejik bombardıman, lojistik saldırı, deniz saldırısı, liman saldırısı, keşif ve hava ikmali ayrı görevler olsun.

Görev etkinliği hazır uçak sayısı, menzil, üs yoğunluğu, hava, gece, yakıt, pilot deneyimi ve düşman savunmalarından etkilensin.

Savaşta tespit ile çatışma ayrışsın. Aynı bölgede bulunmak bütün uçakların her saat birbirini bulduğu anlamına gelmesin.

Kara desteği gerçek muharebelere bağlansın ve muharebe kapasitesiyle sınırlandırılsın.

Lojistik saldırılar tren, kamyon ve ikmal altyapısına etki ederek kara savaşını dolaylı değiştirsin.

Uçak kayıpları stok ve üretimle tamamlanmalı. Pilot deneyimi kayıplardan etkilenebilsin.

Haritadaki uçak animasyonları gerçek görev yoğunluğunu temsil etsin; ekranda uçak görmek kesin sayısal istihbarat sağlamasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
34. DONANMA, GÖREV KUVVETLERİ VE DENİZ SAVAŞI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Donanma filolar ve görev kuvvetlerinden oluşsun. Görev kuvvetine amiral, gemilere kaptan atanabilsin.

Devriye, vurucu kuvvet, konvoy koruma, konvoy baskını, mayın döşeme, mayın tarama, kıyı desteği ve limana dönüş görevleri bulunsun.

Devriye düşmanı tespit etmeye çalışsın. Limanda bekleyen vurucu kuvvet tespit edilen hedefe menzil, yakıt ve hazırlık koşulları uygunsa çıksın.

Deniz savaşında konumlanma, hız, tespit, görünürlük, koruma gemileri, büyük gemiler, torpidolar, denizaltı karşıtı savaş ve uçaksavar ayrı rol oynasın.

Muhrip ve kruvazörlerin koruma görevi büyük gemilerin maruz kaldığı riski değiştirsin. En pahalı gemilerden oluşan filo otomatik en iyi filo olmasın.

Uçak gemisi etkinliği güverte kapasitesi, uçak hazırlığı, hava, eskort ve görev koşullarına bağlı olsun.

Gemiler hasar durumuna ve oyuncunun çatışma isteğine göre geri çekilmeyi değerlendirsin.

Onarım liman ve tersane kapasitesi tüketsin. Hasarlı filo yeni savaşlara girebilir; ancak bunun riski açık gösterilsin.

Bir geminin batması taşıdığı ekipman, kaptan ve görev kuvveti düzeninde ilgili sonuçları oluştursun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
35. DENİZ ROTALARI, ÇIKARMA VE PARAŞÜT HAREKÂTI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ticaret, ikmal ve birlik taşımaları deniz bölgelerinden geçen gerçek rotalara bağlansın.

Oyuncu tehlikeli deniz bölgelerini kısıtlayabilsin. Alternatif rota daha uzun veya daha fazla konvoy gerektiriyorsa maliyet gösterilsin.

Mayınlar geçiş riskini ve deniz kontrolünü etkilesin. Tarama görevi zaman ve uygun gemi kapasitesi gerektirsin.

Deniz çıkarmasında başlangıç limanı, hedef kıyı, atanmış tümenler, hazırlık süresi ve taşıma ihtiyacı tanımlansın.

Harekât başlamadan önce ilgili deniz bölgelerinde yeterli operasyon güvenliği, konvoy kapasitesi ve erişim kontrol edilsin.

Çıkarma birlikleri kıyıya ulaştığında amfibi çatışma gerçekleşsin. Liman ele geçirilmemişse uzun süreli ikmal sınırlı olsun.

Geçici liman desteği sınırlı kapasite ve süreyle çalışsın; kalıcı büyük limanın yerini bedelsiz tutmasın.

Paraşüt harekâtında uygun birlik, nakliye uçağı, menzil, hava koşulları ve yeterli hava güvenliği gereksin.

İnişten sonra paraşütçüler normal ikmal kurallarına tabi olsun. Uzak başkente tek atlayış bütün ülkenin otomatik yenilgisine dönüşmesin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
36. DİPLOMASİ, SAVAŞ HEDEFLERİ VE DÜNYA GERİLİMİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Diplomatik işlemler ilişki geliştirme, saldırmazlık, garanti, geçiş hakkı, üs erişimi, ticaret, ambargo, ittifak teklifi, yardım, savaş çağrısı ve barış girişimini kapsasın.

Her işlem için uygunluk, maliyet, süre ve karşı tarafın kabul hesabı bulunsun.

Kabul değerlendirmesi ortak tehdit, ilişkiler, askerî güç, ideolojik yakınlık, ekonomik bağımlılık, devam eden savaşlar ve stratejik çıkarlar üzerinden yapılsın.

Oyuncu kabulün temel olumlu ve olumsuz nedenlerini görebilsin. Gizli istihbarat gerektiren bilgiler kesin sayı olarak açıklanmasın.

Savaş hedefi oluşturma siyasi koşul ve hazırlık gerektirsin. Ültimatomlar cevap süresi taşısın.

Dünya gerilimi savaş, ilhak, saldırgan talepler ve diplomatik krizlerle değişsin. Etkinin kaynağı olay kaydında tutulmalı.

Garanti veya ittifak yükümlülüğü savaşa katılımı etkilesin; bütün ülkeler her savaşta otomatik aynı davranışı göstermesin.

Aynı iki ülke arasında çelişen savaş ve barış durumları oluşmasını engelleyen tutarlılık denetimleri olsun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
37. İTTİFAK YÖNETİMİ VE ORTAK STRATEJİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

İttifak yalnız aynı renkte gösterilen ülkelerden oluşmasın. Liderlik, üyelik koşulları, kurallar, ortak hedefler ve katkı beklentileri bulunsun.

İttifak hedefleri belirli bölgeleri savunmak, deniz yolunu açmak, bir üyeyi kurtarmak veya sanayi kapasitesini artırmak gibi ölçülebilir koşullar taşısın.

Hedef başarıları ittifakın koordinasyon kapasitesi veya paylaşım imkânlarını geliştirebilsin.

Araştırma paylaşımı, istihbarat paylaşımı, üs erişimi ve lojistik iş birliği ayrı anlaşma türleri olsun.

Ortak savaş alanı tanımlandığında yapay zekâ üyelerinden asker, uçak veya donanma katkısı talep edilebilsin.

Bir ülkenin birliği müttefik kontrolüne devredildiğinde sahiplik, ekipman sorumluluğu ve emir yetkisi açık kalsın.

İttifak liderliği değişimi ve üyelikten ayrılma siyasi ve askerî sonuçlar doğursun.

Müttefik yapay zekâ kendi savunmasını tamamen boşaltıp bütün ordusunu oyuncuya göndermesin. Katkı, kapasite ve yerel tehdit üzerinden belirlensin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
38. İSTİHBARAT, AJANLAR VE ŞİFRE ÇÖZME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncu istihbarat teşkilatı kurabilsin. Geliştirmeler sanayi zamanı, siyasi kaynak veya personel kapasitesi gerektirsin.

Ajanlar uzmanlık, deneyim, görev ve risk bilgisi taşısın. Ağ kurma, karşı istihbarat, askerî bilgi toplama, sanayi bilgisi, direniş desteği ve işbirliği hazırlığı gibi görevleri olsun.

İstihbarat ağı zamanla güçlensin. Ajan çekilmesi veya karşı istihbarat baskısı ağı zayıflatabilsin.

Operasyonlar hazırlık, gerekli ağ gücü, personel, ekipman maliyeti, süre ve başarı riski taşısın.

Ajan yakalanması olasılık ve görev koşullarına bağlı olsun. Kurtarma girişimleri ayrı operasyon olarak çalışsın.

Şifre çözme kalıcı bir “düşmanı tamamen görme” özelliği olmasın. Hazırlık ve kullanım zamanlaması olan avantaj sağlasın.

Ekonomi, kara, hava ve deniz istihbaratı ayrı doğruluk seviyeleri taşısın. Düşman tümen sayısı düşük istihbaratta aralık olarak gösterilsin.

Savaş sisi hem oyuncuya hem yapay zekâya uygulansın. Yapay zekâ görünmeyen düşman ordularının gerçek konumunu doğrudan kullanmasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
39. İŞGAL, DİRENİŞ VE UYUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bir bölge ele geçirildiğinde bütün sanayi ve kaynakları hemen tam verimle çalışmasın.

Direniş; yönetim baskısı, savaş durumu, dış destek, yerel koşullar ve garnizon yeterliliğine göre gelişsin.

Uyum; zaman, istikrar, yönetim yaklaşımı ve olaylarla değişsin. Direniş ile uyum birbirinin basit ters yüzdesi olmasın.

İşgal yasaları sanayi erişimi, insan gücü, direniş riski ve garnizon yükü arasında seçim yaratsın.

Garnizonlar ayrı insan gücü ve ekipman ihtiyacı taşısın. Haritada her bölge için ayrı tümen yönetme zorunluluğu olmadan idari dağıtım yapılabilsin.

Garnizon ekipmanı eksikse beklenen güvenlik etkisi gerçekleşmesin. Direniş üretim aksaması, altyapı hasarı ve ikmal sorunları oluşturabilsin.

Askerî polis ve uygun güvenlik birlikleri ihtiyaçları etkileyebilsin.

İşbirlikçi yönetim hazırlığı uygun koşullarda işgal yönetimini kolaylaştırsın; fakat savaş öncesi tek operasyonla bütün ülke koşulsuz teslim olmasın.

İşgal ekranı her bölgenin sağladığı faydayı ve yarattığı maliyeti birlikte göstersin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
40. BAĞLI DEVLETLER, ÖZERKLİK VE SÜRGÜN HÜKÜMETLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bağlı devletlerde dış politika özgürlüğü, sanayi yükümlülüğü, kaynak erişimi ve askerî katkı düzeyleri olsun.

Özerklik ticaret, yardım, savaş katkısı, siyasi kararlar ve anlaşmalarla değişsin.

Daha fazla doğrudan denetim fayda sağlayabilir; ancak siyasi maliyet ve yerel tepki oluşturabilsin.

Bağlı devlet birlikleri ile doğrudan ülke ordusuna ait birlikler ayrı sahiplik kaydı taşısın.

Bağımsızlık girişimi uygun koşullarda diplomatik kriz, müzakere veya savaş doğurabilsin.

Ülkesi işgal edilen hükümet uygun müttefik desteğiyle sürgünde devam edebilsin.

Sürgün hükümeti meşruiyet, dış destek, sınırlı personel ve ülkesini kurtarma hedefi taşısın.

Sürgün birlikleri ve pilotları gerçek personel ve ekipman kaynaklarıyla oluşturulsun.

Ülke kurtarıldığında yönetimin geri dönmesi, bölgesel kontrol ve ittifak ilişkileri tutarlı biçimde güncellensin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
41. İÇ SAVAŞ, GÖNÜLLÜLER VE SINIR ÇATIŞMALARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

İç savaş başlarken toprak, personel, stok, donanma ve fabrikalar tanımlı sadakat kurallarıyla bölüşülsün.

Her iki tarafın toplam başlangıç kaynakları eski ülkenin kaynaklarını açıklamasız aşmasın.

Bölünme yalnız siyasi destek yüzdesine göre rastgele harita boyama olmasın. Bölgesel destek, ordu bağlılığı ve olay zinciri etkili olsun.

Yabancı ülkeler koşullara bağlı gönüllü birlik, hava desteği veya ekipman yardımı sağlayabilsin.

Gönüllü birliklerin kime ait olduğu ve kim tarafından yönetildiği açık olsun. Görev bitince geri dönüş süreci gerçekleşsin.

Sınır çatışmaları tam ölçekli savaştan farklı, sınırlı alan ve katılım kuralları taşısın.

Çatışmanın genişleyip genişlemeyeceği sonuçlara ve siyasi kararlara bağlı olsun.

İç savaş ve sınırlı çatışma sonuçları ulusal odaklara, diplomasiye ve askerî deneyime bağlansın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
42. SAVAŞ KATKISI, KAPİTÜLASYON VE BARIŞ KONFERANSI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bir savaş kaydı taraflar, hedefler, katılımlar, başlangıç nedeni ve mevcut durumu saklasın.

Savaş katkısı işgal, etkili muharebe, lojistik destek, deniz ve hava katkısı gibi tanımlı unsurlardan oluşsun.

Gereksiz asker kaybı yüksek puan kazanmanın en verimli yolu olmasın.

Teslim değerlendirmesi zafer noktaları, kontrol kaybı, siyasi koşullar ve devam etme kapasitesine bağlı olsun. Başkent kaybı tek başına her ülkede otomatik teslim yaratmasın.

Bir ülkenin teslimi ile bütün ittifakın savaşı bitirmesi farklı durumlar olsun.

Barış konferansında toprak, bağlı devlet, bağımsız devlet, kaynak hakkı, sanayi tazminatı, donanma devri ve askerî kısıtlama gibi talepler bulunabilsin.

Her talebin puan maliyeti ve uygunluk koşulu olsun. Aynı toprak iki ülkeye kesin olarak verilemesin.

Çatışan talepler açık teklif ve çözüm kurallarıyla değerlendirilsin. Yapay zekâ coğrafi bütünlük, hedef, güvenlik ve maliyeti dikkate alsın.

Anlaşma kabul edildiğinde mülkiyet, kontrol, askerî erişim, birliklerin geri dönüşü, ticaret ve işgal yönetimi birlikte güncellensin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
43. ÖZEL PROJELER, BİLİM İNSANLARI VE PROTOTİPLER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Standart araştırmadan ayrı olarak kara, hava, deniz, elektronik ve stratejik araştırma tesisleri oluştur.

Her tesiste kapasite ve uzman bilim insanı ataması olsun.

Özel proje için ön koşul, bilimsel birikim, altyapı, sanayi taahhüdü ve araştırma aşamaları bulunsun.

Aşamalar teorik çalışma, prototip, deneme ve uygulanabilir tasarım olarak ilerleyebilsin.

Bilim insanı uzmanlığı ilerleme hızını ve bazı seçenekleri etkilesin. Aynı bilim insanı aynı anda sınırsız tesiste çalışamasın.

Deneme sonuçları kayıtlı rastgelelik üzerinden oluşsun. Kayıt yükleme aynı denemeyi sürekli farklı sonuç üretmeye zorlamasın.

Projeler gelişmiş radar, jet teknolojisi, gelişmiş deniz sistemleri, deneysel zırhlılar, roketler ve stratejik silah teknolojileri gibi soyut oyun içeriklerini açabilsin.

Bir proje tamamlandığında ilgili ürün doğrudan sınırsız stok yaratmasın. Üretim, tesis ve kullanım koşulları ayrıca gereksin.

Stratejik ve nükleer içerikler yalnız soyut oyun kuralları, maliyetler, diplomatik sonuçlar ve harita etkileriyle temsil edilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
44. STRATEJİK BASKINLAR VE ÖZEL HAREKÂTLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Baskınlar normal sürekli bombardımandan farklı, belirli hedefe yönelik hazırlanan oyun operasyonları olsun.

Hedef araştırma tesisi, liman, askerî altyapı veya oyun içi esir kurtarma görevi olabilir.

Operasyon ekranında uygun birlik, uçak veya deniz unsuru; hazırlık süresi; istihbarat; beklenen etki; başarısızlık ve kayıp riski gösterilsin.

Başarı değerlendirmesi hazırlık, görev uygunluğu, istihbarat, hava koşulları ve savunma düzeyinden türesin.

Sonuç tam başarı, kısmi başarı, başarısızlık veya görevden vazgeçme gibi durumlar taşısın.

Başarılı baskın hedefin gerçek kapasitesini süreli veya onarılabilir biçimde etkilesin. Yalnız haber metni üretmesin.

Kaybedilen uçak, personel ve ekipman gerçek stoklardan düşsün.

Stratejik saldırılar diplomatik ve siyasi etkiler oluşturabilsin; her güçlü silah tek hamlede koşulsuz savaş kazandırmasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
45. ÜLKELERE ÖZGÜ İÇERİK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Her ülkenin ortak sistemlere erişimi olsun; özgünlük farklı renk veya isimle sınırlı kalmasın.

Büyük ülkeler için sanayi, kara, hava, deniz, diplomasi ve alternatif siyasi yolları birleştiren ayrıntılı içerik paketleri oluştur.

Almanya için yeniden yapılanma, kaynak darboğazları, farklı siyasi yollar ve kıtasal strateji; Sovyetler için iç siyasi denge, sanayi yerleşimi, ordu reformu ve geniş coğrafyada lojistik öne çıksın.

Britanya için deniz yolları, uzak bölgeler ve ittifak koordinasyonu; Fransa için siyasi birlik, savunma hazırlığı ve yenilgi sonrası farklı yönetim yolları işlenebilsin.

ABD için sanayi dönüşümü, iç siyasi onay ve farklı cephelere güç aktarımı; İtalya için kara-deniz dengesi, yönetim çekişmeleri ve bölgesel strateji kurulsun.

Japonya için kara-deniz öncelik rekabeti, kaynak bağımlılığı ve ada savaşları; Çin’deki farklı yönetimler için birleşme, yerel güçler, dış yardım ve direniş yolları oluştur.

Polonya, Balkanlar, Baltıklar, İskandinav ülkeleri, Benelüks, İberya, Orta Avrupa, Ortadoğu, Güney Asya, Güney Amerika ve Pasifik ülkeleri bölgesel içerik paketleriyle desteklensin.

Avustralya, Siyam, Endonezya, Filipinler, Çekoslovakya, İran, Irak, Afganistan, Hindistan, Brezilya, Arjantin, Şili ve diğer oynanabilir ülkelerin yerel sorunları veri tabanlı mekaniklerle ifade edilsin.

Bu temalar Europa War için içerik tasarımıdır. Tek tek tarihsel olay, lider, sınır ve başlangıç sayıları güvenilir kaynaklarla doğrulanmalı.

Genel odak ağacı kullanan ülkeler de anlamlı ekonomi, diplomasi ve savunma seçeneklerine sahip olsun.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
46. TÜRKİYE İÇİN AYRINTILI OYNANIŞ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Türkiye içerik paketinde sanayileşme, demiryolu geliştirme, ordunun modernizasyonu, iç siyasi denge ve bölgesel diplomasi birbirine bağlansın.

Oyuncu sınırlı sanayi kapasitesini piyade modernizasyonu, topçu, hava savunması, küçük donanma, altyapı veya ağır sanayi arasında paylaştırsın.

Sanayileşme yolu yalnız ücretsiz fabrika ödüllerinden oluşmasın. İnşaat süresi, dış teknik iş birliği, kaynak erişimi ve savunmaya ayrılmayan kapasite maliyeti bulunsun.

Boğazlar, geçiş kuralları ve diplomatik baskı açısından özel bölge sistemiyle temsil edilsin. Oyuncunun kararları ticaret, güvenlik ve büyük devletlerle ilişkilerini etkilesin.

Balkan iş birliği yolu ortak savunma, ticaret ve diplomatik güven üretirken saldırgan bölgesel yol gerilim, savaş hazırlığı ve işgal maliyetleri yaratsın.

Tarafsızlık pasif bekleyiş olmasın. Ticaret, silah satışı, denge diplomasisi ve savunma hazırlığıyla oynanabilsin.

Alternatif yönetim yolları siyasi destek ve olay zincirleri gerektirsin. Yönetim değişikliği yalnız bayrak ve ülke adının değişmesiyle sınırlı kalmasın.

Edirne çevresindeki sınır savunması, İstanbul ve boğaz güvenliği, iç bölgelere uzanan demiryolları ve doğudaki arazi koşulları farklı askerî kararlar doğursun.

Bu bölgelere ait sayısal değerler tarihsel veri ve oyun dengesi alanlarında ayrı saklansın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
47. YAPAY ZEKÂNIN KARAR SİSTEMİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Yapay zekâyı tek rastgele karar fonksiyonu olarak kurma. Stratejik, ekonomik, diplomatik, operasyonel ve yerel taktik katmanlara ayır.

Stratejik katman ülkenin temel hedefini seçsin: savunma, sanayileşme, ittifak arayışı, kaynak güvenliği veya sınırlı genişleme.

Ekonomik katman bu hedefe göre fabrika, üretim, ticaret ve araştırma önceliği oluştursun.

Operasyonel katman cepheleri, yedekleri, çıkarma planlarını, hava desteğini ve ikmal hazırlığını yönetsin.

Yerel katman hareket, saldırı, geri çekilme ve takviye emirlerini versin.

Bir hedefin değeri; stratejik yarar, tahmini başarı, kayıp maliyeti, ikmal riski ve diplomatik sonuçlarla hesaplanabilsin.

Örnek değerlendirme:

Hedef puanı =
stratejik değer
+ beklenen kazanım
− tahmini askerî kayıp
− ikmal riski
− savunmasız kalma maliyeti.

Yapay zekâ eksik istihbaratı belirsizlik olarak taşısın. Düşman gücünü düşük kesinlikte görüyorsa daha geniş risk aralığı kullansın.

Kararlar sürekli ileri-geri değişmesin. Strateji değişimi için fark eşiği, bekleme süresi ve mevcut yatırım maliyeti hesaba katılsın.

Zorluk öncelikle planlama kalitesi, tepki süresi ve hata toleransıyla değişsin. Ek avantaj kullanılıyorsa oyuncuya açıkça gösterilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
48. YAPAY ZEKÂNIN SOMUT DAVRANIŞLARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ekipman açığı artan ülke yeni tümen eğitimini sınırlayıp mevcut ordunun tamamlanmasına ağırlık verebilsin.

Yakıtı azalan ülke gereksiz tatbikatı ve donanma faaliyetini azaltabilsin.

İkmali zayıf cephede bütün tümenleri aynı bölgeye yığmak yerine dağılımı ve altyapıyı düzeltsin.

Saldırmadan önce tümen hazırlığı, hedefin değeri, tahmini düşman gücü ve geri bağlantı güvenliği kontrol edilsin.

Kuşatma tehlikesindeki birlikler uygun geri hatlara çekilsin. Kuşatılmış müttefiki kurtarmak için başarılı olma ihtimali olan yardım planı üretilebilsin.

Deniz çıkarması hazırlayan ülke liman, konvoy, deniz görevi ve hava desteğini aynı operasyon kapsamında hazırlasın.

Yeni ele geçirilen büyük cephelerde ilerleme hızını ikmal yetişmesine göre ayarlasın.

Barış görüşmesinde erişilemeyen dağınık toprakları sırf puanı var diye tercih etmesin.

Savaş dışındaki küçük ülkeler de araştırma, üretim, diplomasi ve bölgesel güvenlik kararları alsın.

Her önemli yapay zekâ kararının geliştirici ekranında gerekçesi ve değerlendirme puanları görülebilsin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
49. ARAYÜZ, BİLDİRİMLER VE AÇIKLAMALAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Üst çubukta tarih, hız, siyasi güç, istikrar, savaş desteği, insan gücü, sanayi, yakıt ve askerî deneyim gösterilsin.

Ana yönetim ekranları ülke, inşaat, üretim, ticaret, araştırma, ordu, hava, donanma, diplomasi, istihbarat, işgal ve kayıt olarak ayrışsın.

Bir bilgi balonu yalnız kısa tanım değil, değerin oluşumunu gösterebilsin. Oyuncu fabrika çıktısının temel değerini, bonuslarını ve cezalarını inceleyebilsin.

Siyasi, arazi, ikmal, hava, deniz, kaynak, sanayi, altyapı, işgal, direniş, diplomasi ve istihbarat harita modları gerçek veriden beslensin.

Bildirimler önem seviyesine göre sınıflansın. Araştırma tamamlanması, savaş ilanı ve büyük kuşatma aynı dikkat düzeyinde sunulmasın.

Oyuncu hangi olaylarda otomatik duraklatma istediğini ayarlayabilsin.

Bir emir uygulanamıyorsa “başarısız” yerine nedeni ve çözüm yolu gösterilsin: menzil yetersiz, ekipman eksik, geçiş hakkı yok veya liman kapasitesi yetersiz gibi.

Arama sistemi ülke, şehir, eyalet, birlik, teknoloji ve olay bulabilsin.

Türkçe ve İngilizce metinler yerelleştirme anahtarlarından gelsin. Renk körlüğüne uygun işaretler, arayüz ölçeği ve klavye erişimi desteklensin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
50. KAYIT, DEVAM ETME VE İÇERİK PAKETLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kayıt; tarih, dünya durumu, emirler, savaşlar, sevkiyatlar, stoklar, üretim, araştırma, olay bayrakları, rastgele üreteç durumu ve yapay zekâ planlarını içersin.

3D nesnelerin kendisini kaydetmek yerine görsel sahneyi yeniden kurmaya yetecek simülasyon verisini sakla.

IndexedDB gibi uygun yerel depolama kullan. Otomatik kayıt atomik işlem mantığıyla çalışsın; yarım kalan kayıt geçerli kampanya gibi görünmesin.

Kayıt sürümü, oyun sürümü ve içerik paketi kimlikleri bulunsun. Uyumlu veri geçişleri açık dönüşüm fonksiyonlarıyla yapılsın.

Oyuncu kayıt dosyasını dışa ve içe aktarabilsin. İçe aktarılan veriyi şema, boyut ve kimlik tutarlılığı açısından doğrula.

Kota yetersizliği, depolama izni sorunu veya bozuk kayıt anlaşılır biçimde bildirilsin.

Tek kayıtlı meydan okuma modu desteklenebilir; fakat yerel tarayıcı kaydını değiştirilemez güvenlik sistemi gibi sunma.

Ülke, teknoloji, odak, olay ve ekipman paketleri veri odaklı olsun. Paketler eksik referans, döngüsel ön koşul veya geçersiz başlangıç verisi içeriyorsa doğrulayıcı bunu yakalasın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
51. PERFORMANS VE GRAFİK KALİTESİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Düşük, orta, yüksek ve ultra ayarlar gerçek grafik maliyetlerini değiştirsin: çözünürlük ölçeği, gölge, parçacık, ağaç yoğunluğu, model ayrıntısı ve su kalitesi.

Düşük ayarda simülasyon kuralları değişmesin. Bir savaşın sonucu grafik düzeyine bağlı olmamalı.

Tekrarlanan ağaç, bina ve araçlarda uygun örnekleme yöntemleri kullan. Görüş dışında kalan nesneleri çizme.

Animasyonlu karakterleri uzaklık ve görünürlüğe göre güncelle. Uzak tümenler için tam iskelet animasyonu zorunlu olmasın.

Harita parçalarını ve büyük modelleri gerektiğinde yükle. İlk açılışta bütün dünyanın en ayrıntılı varlıklarını indirme.

Yol bulma ve ikmal hesaplarını yalnız gerekli değişikliklerde yenile. Her görüntü karesinde bütün dünya için yeniden hesaplama yapma.

Worker ile ana iş parçacığı arasında her saat bütün dünya verisini kopyalamak yerine gerekli değişiklikleri ve sınırlı anlık görüntüleri aktar.

Orta kalite masaüstünde 60 FPS hedefi tanımla; fakat başarıyı ölçmeden garanti etme. Kare süresi, simülasyon saat süresi, bellek, çizim çağrısı ve yükleme boyutunu raporla.

Yüksek hızda bilgisayar yetişemediğinde simülasyon adımlarını atlamak yerine gerçek ilerleme hızını kontrollü azalt.

WebGL bağlam kaybı ve görünür olmayan sekme davranışı için toparlanma kuralları bulunmalı.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
52. ÖĞRETİCİ, RAPORLAR VE KAMPANYA HEDEFLERİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Öğretici gerçek oyun sistemleri üzerinde çalışsın. Oyuncuya yalnız okuma metni göstermek yerine bir fabrika kurdur, üretim hattı açtır, tümen eğittir ve ikmal sorunu çözdür.

Adımlar oyuncunun tamamladığı eylemlerle ilerlesin. Yanlış panelde kaldığında ilgili hedefi açıklasın.

İleri öğreticiler tank tasarımı, cephe planı, hava desteği, deniz çıkarması, casusluk ve barış konferansını kapsasın.

Aylık ülke raporu üretim, kayıplar, stok değişimi, inşaat ve savaş gelişmelerini özetlesin.

Muharebe geçmişi hangi ordunun nerede ve hangi koşullarda başarı sağladığını gösteren kayıtlar tutsun.

Ülkeye özgü hedefler yalnız dünya fethetmeye dayanmasın. Bağımsız kalmak, sanayileşmek, müttefik kurtarmak, ticaret gücü oluşturmak veya belirli bölgeyi savunmak da başarı sayılabilsin.

Kampanya sonunda toprak değişimi, sanayi gelişimi, kayıplar, diplomasi ve büyük olayları zaman çizelgesinde göster.

Başarımlar ve meydan okumalar tek oyunculu kayıt kuralları içinde doğrulansın.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
53. TESTLER VE DEĞİŞMEZ KURALLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Testleri yalnız ekranın açılmasına göre kurma. Ekonomi, savaş, diplomasi ve kayıt sonuçlarını doğrula.

Üretim testi: Belirli fabrika, verimlilik ve kaynak değerleri tam beklenen ekipmanı ve kesirli üretim kalıntısını oluşturmalı.

Kaynak testi: Aynı kaynak veya fabrika kapasitesi iki farklı işte çifte kullanılamamalı.

Ticaret testi: Sevkiyattaki ekipman satıcı ve alıcı deposunda aynı anda bulunamamalı.

Hareket testi: Kara tümeni geçiş hakkı olmayan sınırdan veya uygun taşıma olmadan denizden geçememeli.

Savaş testi: Aynı başlangıç ve rastgele üreteç durumu aynı sonucu üretmeli. Tarafların kayıt sırası sonucu değiştirmemeli.

İkmal testi: Tek bir demiryolunun kapasitesi bütün tüketicilere paylaştırıldığında toplam kapasiteyi aşmamalı.

Kuşatma testi: Kara bağlantısı kesilip deniz ikmali açık kaldığında birlik tamamen ikmalsiz sayılmamalı.

Eğitim testi: Yeni tümen personel ve ekipman havuzlarını doğru miktarda kullanmalı.

İç savaş testi: Bölünen tarafların toplam varlığı açıklanmış değişimler dışında önceki ülkenin varlığını aşmamalı.

Barış testi: Bir bölge aynı anlaşmada iki ayrı nihai sahibin mülkü olamamalı.

Kayıt testi: Devam eden savaşın ortasında kaydet ve yükle; sonraki saatler aynı komutlarla aynı sonucu vermeli.

Grafik testi: Kalite değişimi ve kamera hareketi simülasyon sonucunu etkilememeli.

Yapay zekâ testi: Ülke kendi stoklarının, erişim haklarının ve istihbarat sınırlarının dışına çıkan emir verememeli.

Uzun kampanya testi: Yıllarca hızlandırılmış simülasyonda negatif stok, sahipsiz birlik, sonsuz olay döngüsü veya sürekli artan bellek oluşmamalı.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
54. UYGULAMA SIRASI VE TAMAMLANMA TANIMI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sistemleri bağımlılık sırasıyla çalışan oyun akışlarına bağla.

Önce ülke seçimi, gerçek harita, zaman, komut işleme ve kayıt ile küçük ama uçtan uca oynanabilir dünya oluştur.

Ardından inşaat, kaynak, üretim, eğitim, hareket, ikmal, savaş ve kontrol değişimini aynı kampanyada birleştir.

Sonra diplomasi, araştırma, hava, deniz, işgal, teslim ve barış düzenlemesini bu akışa bağla.

Tasarımcılar, sanayi kuruluşları, istihbarat, özel projeler, karargâhlar, ayrıntılı ittifaklar ve ülke içerikleri aynı çekirdeği kullansın.

Her aşama gerçek arayüz, simülasyon, yapay zekâ kullanımı ve test içermeli. Bir panelin açılması mekanik tamamlandı anlamına gelmez.

Özellik durumlarını veri, hesaplama, oyuncu arayüzü, yapay zekâ, 3D gösterim ve test başlıklarında ayrı takip et.

Bir sistemi tamamlandı olarak işaretlemek için şu zincir çalışmalı:

Oyuncu karar verir → koşullar doğrulanır → maliyet uygulanır → zaman içinde sonuç oluşur → başka sistemler etkilenir → arayüz doğru sonucu gösterir → kayıt sonrası aynı durum devam eder.

Teknik kontroller mevcut projeye uygun typecheck, lint, birim testleri, entegrasyon testleri ve üretim derlemesini kapsasın.

Başarılı olarak bildirilen kontroller gerçekten çalıştırılmış olmalı. Çalıştırılamayan kontrolün durumu açıkça belirtilmeli.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
55. UÇTAN UCA KABUL SENARYOSU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oyuncu Türkiye ile 1936 kampanyasını başlatır.

Ülke durumunu inceler, sanayileşme odağı seçer ve bir eyalette askerî fabrika inşaatı başlatır.

Mevcut fabrikalarını piyade ekipmanı ve topçuya dağıtır. Kaynak açığını ticaretle karşılar.

Bir tümen şablonu oluşturur. Gereken personel ve ekipmanı ayırarak eğitim başlatır.

Yeni teknoloji araştırır, gelişmiş ekipman tasarımını üretime alır ve eski-yeni ekipman dağıtımını yönetir.

Eğitilen tümeni haritaya konuşlandırır. Bir orduya ve komutana bağlar, karargâh yerini seçer.

Diplomatik koşulları değerlendirir, uygun savaş hedefini hazırlar ve cephe planı oluşturur.

Hava desteği atar, ikmal merkezlerini ve demiryolu kapasitesini kontrol eder.

Taarruzu başlatır. Savaş sonucu gerçek tümen istatistikleri, arazi, komuta, ikmal ve hava etkileriyle hesaplanır.

İlerleyen ordu ikmal sınırına geldiğinde etkinliği düşer. Oyuncu takviye, onarım veya hareket planı değişikliğiyle sorunu çözer.

Bir düşman birliği çevrelendiğinde bağlantıları, yerel rezervi ve kaçış imkânı değerlendirilir.

Ele geçirilen bölgede kontrol değişir; üretim erişimi, direniş, garnizon ve cepheler güncellenir.

Savaş sonuçlandığında barış talepleri gerçek puan ve uygunluk kurallarıyla uygulanır.

Oyuncu oyunu kaydeder, yeniden yükler ve ülkesini aynı tarih, aynı stoklar, aynı birlikler ve aynı devam eden süreçlerle yönetmeye devam eder.

Bütün bunlar okunabilir bir arayüz, gerçek 3D harita, durumla uyumlu animasyonlar, ölçülmüş performans ve test edilmiş simülasyon üzerinde çalışır.

EUROPA WAR’IN TAMAMLANMA ÖLÇÜTÜ; ÇOK SAYIDA ÖZELLİK ADI DEĞİL, BU SİSTEMLERİN AYNI KAMPANYADA BİRBİRİNİ GERÇEKTEN ETKİLEMESİDİR.