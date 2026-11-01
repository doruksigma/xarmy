# Europa War genişleme şartnamesi — denetim ve aşama sonuçları

Denetim tarihi: 1 Kasım 2026. İncelenen başlangıç sürümü: `2818ab5`.
Bu belge kullanıcının 55 bölümlük yeni şartnamesini mevcut kodla karşılaştırır;
bir uygulama vaadi veya bütün mekaniklerin tamamlandığına dair rapor değildir.
İlk uygulama aşaması aşağıdaki **1. aşama** bölümünde ayrıca raporlanır.
55 satırlı tablo başlangıç sürümünün denetimidir; güncel aşama sonucuyla
karıştırılmamalıdır.

## Doğrulanan mimari

- `package.json`: Next.js 15.5.9, React 19, TypeScript 5.7 ve Three.js 0.170.
  Three.js başka oyunlarda kullanılıyor; başlangıç Europa haritası `WarMap.tsx`
  içinde SVG'dir. Mevcut kabartma dokusu gerçek 3D arazi değildir.
- `engine.ts`: `applyAction` kopya durum üzerinde atomik emir doğrular;
  `advanceDay` ekonomi, siyaset, operasyon, AI, planlama, komutan, kara savaşı
  ve konferans işlemlerini birleştirir. Temel adım bir **gündür**, saat değildir.
- `types.ts`, `catalog.ts`, `advanced-catalog.ts`, `map-data.json`: açık türler,
  birim/ekipman/teknoloji kataloğu ve 29 ülke / 447 hareket bölgesi.
- `simulation.ts`, `simulation-worker.ts`, `useSimulation.ts`: tek bekleyen
  worker isteği, duraklatma/komut revizyonu, arka plan sekmesi kontrolü;
  ardışık günlerde worker'a tam dünya tekrar gönderilmez. Sonuçta tam anlık
  dünya döner; henüz genel amaçlı durum farkı protokolü yoktur.
- `storage.ts`, `storage-browser.ts`, `useSaveSlots.ts`: şema/referans denetimi,
  eski kayıt geçişleri, JSON içe/dışa aktarım, IndexedDB otomatik kayıtları.
  `offline-*` dosyaları yalnız bu oyunun içeriklerini önbelleğe alır.
- `WarPanels.tsx`, `AdvancedPanels.tsx`, `CommandCenter.tsx`, `CommanderBar.tsx`:
  çalışan Türkçe yönetim panelleri; 12 tümenli komutanlar ve hedefe bağlı emirler.

Tarihsel veri sınırı: [MAP-SOURCES.md](../scripts/europa-war/MAP-SOURCES.md)
modern Natural Earth geometrisini, yaklaşık 1936 düzeltmelerini ve oyun için
oluşturulan şehir bölgelerini açıkça belgeler. Bunlar doğrulanmış tarihsel
idarî sınırlar değildir. Mevcut harita Avrupa odaklıdır; küresel 1936/1939
sınırları ve bütün dünya ülkeleri henüz bulunmaz. Nüfus, kuvvet, tesis ve kaynak
rakamlarının oyun dengesi niteliği ayrı bir veri kökeni şemasına taşınmalıdır.

## 55 bölümün katman bazında durumu

**V**: çalışan bir temel var; bölümün bütün ayrıntıları tamamlandı demek değildir.
**K**: kısmi/soyut bir karşılık var. **Y**: bu katman henüz yok.
**—**: doğrudan uygulanabilir değil. **T**: ilgili mevcut regresyon testi var;
şartnamenin bütün kabul ölçütlerini kapsadığı anlamına gelmez.
“3D” sütunu gerçek üç boyutlu gösterimi değerlendirir; mevcut SVG simgeleri
bu sütunda tamamlanmış sayılmaz. Bu denetimde testler tekrar çalıştırılmadı.

| No / sistem | Veri | Hesap | Oyuncu arayüzü | AI | 3D | Test | Mevcut karşılık ve açık kalan temel fark |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Temel döngü | V | V | V | K | Y | T | İnşaat→üretim→eğitim→savaş→işgal→barış bağlıdır; tasarım sürümleri/yerel ekipman dağılımı zinciri yok. |
| 2 Teknik mimari | V | V | V | K | Y | T | Türlü, modüler motor ve worker var; AI bazı alanları doğrudan değiştirir, tüm kararlar tek komut kapısından geçmez. |
| 3 Dünya ve kaynak tutarlılığı | K | K | K | K | Y | T | Sahip/kontrol ayrı; hava/deniz varlıkları depodan düşer. Eyalet/hareket bölgesi tam ayrımı, sevkiyat defteri ve her stok hareketi için kayıt yok. |
| 4 Zaman ve determinizm | K | K | V | K | — | T | Tohumlu günlük motor, duraklatma ve 1–5× var. Saatlik/günlük/haftalık ayrım ve bütün muharebelerde küresel eşzamanlı hasar yok. |
| 5 Kampanya ve kurallar | K | K | V | K | — | T | 1936, ülke, zorluk, tarihsel/alternatif yönelim ve dört yardımcı var. Ayrı 1939 veri paketi ve kapsamlı kural seçimi yok. |
| 6 Tarihsel harita | K | K | V | K | Y | T | 447 bağımsız bölge, kara/deniz kenarı, geçit denetimi var. Küresel ve kaynaklı tarihsel sınır/nehir/boğaz katmanları eksik. |
| 7 Gerçek 3D arazi | K | Y | Y | — | Y | Y | SVG coğrafyası ve arazi atlası var; yükseklikli mesh, parça LOD, 3D şehir/liman ve su yok. |
| 8 Kamera/seçim | V | V | V | — | Y | T | Pan, yakınlaştırma, dokunma, klavye, küçük harita, gruplu sayaç var. Dönüşlü 3D kamera ve tam kutu seçimi yok. |
| 9 3D birlik animasyonu | K | K | K | — | Y | Y | Hareket/çatışma durumu simülasyonda var; özgün 3D birlikler ve durum makinesiyle animasyon yok. |
| 10 Hava/gece/ses | Y | Y | Y | Y | Y | Y | Bölgesel hava, biriken çamur, simülasyon gecesi ve uyarlanan müzik/ses sistemi yok. |
| 11 Hükûmet/siyasi güç | V | V | V | K | — | T | Lider, ideoloji destekleri, kabine, danışman, reform, istikrar/savaş desteği var; ülkeye özel parlamenter güç dengesi sınırlı. |
| 12 Yasalar | K | K | V | K | — | T | Ekonomi/askerlik yasaları maliyetli ve etkilidir. Kademeli seferberlik, ticaret yasası ve tam karşılaştırma ekranı yok. |
| 13 Odak/karar/olay | V | V | V | K | — | T | Önkoşul/dışlama, süre, sonuç, karar bekleme süresi, seçilmiş tarihsel olaylar var; koşullu veri güdümlü genel olay dili eksik. |
| 14 İnsan gücü | K | K | K | K | — | T | Eğitim rezervasyonu, aktif kuvvet, kayıp, sıhhiye geri dönüşü var. Ayrı yaralı/taşıma/garnizon personel hesapları ve gecikmeli takviye yok. |
| 15 İnşaat/onarım | K | K | V | K | Y | T | 13 yapı türü, kuyruk, kıyı koşulu, hasarlı kapasite var. Kullanıcı onarım önceliği ve bütün yeni yapı türleri yok; onarım otomatik günlük soyutlamadır. |
| 16 Kaynak/yakıt | K | K | V | K | Y | T | Demir, çelik, petrol, yakıt, alüminyum, kauçuk ve tüketiciler var. Krom/tungsten, günlük kaynak kapasitesi ve tümen yerel yakıt rezervi yok. |
| 17 Üretim/stok | K | K | V | V | Y | T | Fabrika/tersane tahsisi, kaynak tüketimi, verim ve kapasite kısıtı var. Başlangıç kodu kesirli ekipman stoklar; üretim ilerlemesi/tam ürün ayrımı ve sürüm dönüşümü yok. |
| 18 Ticaret/silah pazarı | K | K | V | K | Y | T | Kaynak anlaşmaları, rotaya bağlı teslimat, ambargo, tek seferlik yardım var. Silah ilanı, sevkiyattaki ekipman, lisans ve düzenli yardım yok. |
| 19 Sanayi kuruluşları | Y | Y | Y | Y | — | Y | Kabine sanayi bonusları kuruluş deneyimi, tasarım sürümü veya uzmanlık ağacı değildir. |
| 20 Araştırma/doktrin | V | K | V | V | — | T | Önkoşul, yuva, dönem cezası, ülke bonusu ve model açma var. Doktrinler normal teknoloji gibi araştırılır; deneyimle geçiş sistemi yok. |
| 21 Tank tasarımcısı | K | Y | Y | Y | Y | Y | Sabit hafif/orta/ağır tank modelleri var; modüler şasi/kule/motor/zırh, ağırlık ve tasarım sürümleri yok. |
| 22 Uçak/gemi tasarımcısı | K | Y | Y | Y | Y | Y | Sabit uçak ve gemi kataloğu var. Modüler tasarım, adlandırılmış sürüm, gövde uyumu ve modernizasyon kuyruğu yok. |
| 23 Tümen tasarımcısı | K | K | K | K | Y | T | Sabit birlik sınıfları ve beş destek türü gerçek stok tüketir. Tabur/alay şablonu, genişlik/sertlik/zırh bileşimi yok. |
| 24 Eğitim/takviye | K | K | V | V | Y | T | İnsan/ekipman ayırma, süreli eğitim, ikmale bağlı takviye, otomatik komutan ataması var. Erken konuşlanma, öncelik ve merkez kapasitesi yok. |
| 25 Komuta zinciri/karargâh | K | K | V | K | Y | T | 12 tümenli general, beceri/tecrübe, hedef sınırı, saldır/savun var. Ordu grubu, mareşal, hareketli karargâh, komuta gücü ve esaret yok. |
| 26 Doktrin/özel kuvvet | K | K | K | K | Y | T | Üç doktrin teknolojisi, dağcı/özel/paraşütçü koşulları var. Doktrin ustalığı, ordu ruhu ve özel kuvvet kapasitesi yok. |
| 27 Hareket/ulaşım | V | K | V | K | Y | T | Geçiş/deniz kontrolü, rota, ilerleme, grup yürüyüşü ve yeniden denetim var. Ağırlıklı rota maliyeti ve stratejik demiryolu nakli yok. |
| 28 Cephe/plan | V | K | V | K | Y | T | Çizilebilir savunma/taarruz, hazırlık, manuel emir önceliği ve hedef ülke komutanı var. Tehdit/ikmale göre çok eksenli plan ve saldırganlık tercihleri eksik. |
| 29 Kara muharebesi | K | K | V | K | Y | T | Gerçek iki taraflı kayıp; arazi, komuta, organizasyon, moral, ikmal, hava etkileri var. Yumuşak/sert saldırı, yarma, zırh/delme ve saatlik hasar modeli yok. |
| 30 Genişlik/taktik/yıpranma | K | K | K | K | Y | T | Siper, nehir, tahkimat, arazi ve ikmal yıpranması var. Savaş genişliği, yedek katılımı, taktik karşılığı ve demiryolu topu yok. |
| 31 İkmal ağı | K | K | K | K | Y | T | Başkent/liman bağlantısı, yerel altyapı/merkez ve yığılma etkileri var. Ortak kenar kapasitesi, tren/kamyon havuzu ve darboğaz akışı yok. |
| 32 Kuşatma/geri çekilme | K | K | K | K | Y | T | Kopukluk ve deniz erişimi, güvenli komşuya çekilme ve kaçamayan birlik kaybı var. Yerel rezerv ve süreli geri çekilme evreleri yok. |
| 33 Hava üsleri/görevler | V | K | V | K | Y | T | Kanat, üs, menzil, doluluk, yakıt, hazır olma, deneyim, altı görev var. Ayrı hava bölgesi geometrisi, gece/hava/tarama evreleri ve lojistik baskın eksik. |
| 34 Donanma | V | K | V | K | Y | T | Bireysel gemi, havza, görev, intikal, hasar/onarım, taşıyıcı uçak var. Amiral/kaptan, görev kuvveti, mayın ve tespit-vurucu güç ayrımı yok. |
| 35 Deniz/hava indirme | K | K | K | K | Y | T | Deniz kenarı/boğaz denetimi, ticaret rotası, uygun nakliye uçaklı paraşüt var. Konvoy havuzu, hazırlıklı çıkarma planı, mayın/rota kısıtı yok. |
| 36 Diplomasi | V | K | V | K | — | T | Gerekçe, savaş, ateşkes, ilişki, pakt, geçiş, ittifak, yardım, ambargo, kabul hesabı var. Ayrı üs hakkı, ültimatom zamanlaması ve bütün gerekçe ayrıntıları eksik. |
| 37 İttifak stratejisi | K | K | K | K | — | T | Müttefik listesi ve savunma katılımı var. Liderlik, ortak hedef, talep edilen katkı, keşif/araştırma paylaşımı ve devredilmiş ordu yok. |
| 38 İstihbarat | K | K | V | K | Y | T | Teşkilat, ajan sayısı/eğitimi, süreli görev, risk ve istihbarat avantajı var. Bireysel ajan ağı/uzmanlık, kurtarma ve AI için eşit savaş sisi yok. |
| 39 İşgal/direniş | V | K | V | K | Y | T | Sahip/kontrol ayrımı, uyum, direniş, üretim kaybı, garnizon politikası/personel/tüfek tüketimi var. Ayrı garnizon havuzu/şablonu ve ayrıntılı yasa ailesi yok. |
| 40 Bağlı/sürgün devlet | K | K | K | K | — | T | Kukla/ilhak/bağımsızlık ve subjectOf ilişkisi var. Özerklik seviyeleri, sürgün hükümeti ve bunlara bağlı katkı/geri dönüş yok. |
| 41 İç savaş/gönüllü/sınır savaşı | K | K | K | K | Y | T | İç savaş bölünmesi, siyasi kriz/darbe ve varlık bölüşümü var. Bölgesel sadakat modeli, gönüllü birlik ve sınırlı sınır çatışması yok. |
| 42 Katkı/teslim/barış | V | K | V | K | — | T | Zafer puanlı teslimiyet, katkı puanı ve çok taraflı talepler var. Kaynak hakkı, sanayi tazminatı, donanma devri ve askerî kısıtlama yok. |
| 43 Özel proje/bilim insanı | Y | Y | Y | Y | Y | Y | Normal teknoloji/araştırma danışmanı özel tesis, prototip veya bilim insanı tahsisi değildir. |
| 44 Stratejik baskın | K | K | K | K | Y | T | Sabotaj ve sürekli bombardıman hedef kapasitesini etkiler. Ayrı hazırlık/unsur tahsisli baskın, çok aşamalı sonuç ve esir kurtarma yok. |
| 45 Ülke içerikleri | K | K | K | K | Y | T | Avrupa ülkeleri ve altı büyük ülkeye ek odaklar var. Dünya ülkeleri, ayrıntılı tarih kaynaklı içerik paketleri ve bütün alternatif yollar yok. |
| 46 Türkiye | K | K | V | K | Y | T | Devletçilik, sanayi, Montrö, Balkan diplomasisi, tarafsızlık ve askerî odaklar var. Şartnamedeki ayrıntılı iç denge ve kaynaklı içerik paketi tamamlanmış değil. |
| 47 AI karar yapısı | K | K | K | K | — | T | Haftalara dağıtılmış tehdit/ekonomi/araştırma/yerel kuvvet değerlendirmesi var. Kalıcı hedef/kararlılık, eksik bilgi modeli ve puanlı karar günlüğü yok. |
| 48 AI somut davranışları | K | K | K | K | Y | T | Stoktan üretim/eğitim, yakıtlı görev, zayıf cephe değerlendirmesi, ikmal inşası var. Birleşik çıkarma, kuşatma yardım planı ve ayrıntılı açıklama eksik. |
| 49 Arayüz/açıklamalar | V | K | V | K | Y | T | Türkçe paneller, olaylar, şehir arama, altı harita modu, erişilebilir tuşlar var. Genel arama, İngilizce yerelleştirme, olay bazlı otomatik duraklama eksik. |
| 50 Kayıt/içerik | V | V | V | V | — | T | Şema, kimlik, boyut denetimi, yerel yuvalar, IndexedDB, geçiş ve dışa aktarım var. İçerik paketi kimlik/bağımlılık doğrulaması yok. |
| 51 Performans/kalite | V | K | K | — | Y | T | Worker, görünüm culling, önbellekli harita, sınırlı otomatik kayıt var. Gerçek3D kalite katmanları, WebGL toparlanması ve 3D GPU ölçümleri yok. |
| 52 Öğretici/rapor/hedef | K | K | K | K | — | T | Komuta önerileri, görev açıklamaları, ekonomik geçmiş ve olay günlüğü var. Eylemle ilerleyen öğretici, aylık rapor ve kampanya hedefleri yok. |
| 53 Değişmezler/testler | K | K | — | K | Y | T | Geniş motor/kayıt/hareket/AI testleri ve uzun günlük sefer mevcut. Şartnamedeki yeni saatlik/sevkiyat/kapasiteli ikmal/3D değişmezleri henüz kapsanmıyor. |
| 54 Uygulama/tamamlanma | V | K | K | K | Y | T | Mevcut bağlı kampanya korunmalı; bu tablo yeni kapsamı ayırır. Bir panelin açılması bütün mekanik ailesinin tamamlandığı sayılmaz. |
| 55 Uçtan uca kabul | K | K | K | K | Y | T | Mevcut Türkiye seferinin çoğu yönetim adımı bağlıdır. Serbest tümen/ekipman tasarımı, karargâh, saatlik savaş ve gerçek3D dahil tam senaryo henüz geçemez. |

## Önce çözülmesi gereken bağımlılıklar

1. **Varlık muhasebesi ve üretim:** hat başına tamamlanmamış üretim puanını
   tamamlanmış ekipmandan ayır; kapasite/öncelik paylaşımını ve eski kayıt
   geçişini sınayan testleri ekle. Sonra sevkiyat, tasarım sürümleri ve dönüşüm
   aynı muhasebe üzerinden kurulabilir. “Stok tam sayı” değişikliği tek başına
   personel/ekipman kayıpları ve tüm eski kesirli stokları çözmüş sayılmaz.
2. **Zaman modeli:** saatlik hareket/savaş ile günlük ekonomi ayrılmadan
   saate benzeyen tarih yazısı eklemek saatlik simülasyon değildir. Geçiş;
   sürümlü kayıt, günlük API uyumu, eşzamanlı hasar, belirli komut sıralaması
   ve hızdan bağımsız sonuç testleriyle yapılmalıdır.
3. **3D sunum:** mevcut bölge kimliklerini, seçimleri, komutanları ve savaş
   sonuçlarını kullanan ayrı sahne kur; kalite/kamera durumu simülasyon tohumu
   veya savaş verisini değiştirmesin. Önce çalışan veri bağlantısı, WebGL
   hata dönüşü, dokunma, kaynak temizliği ve gerçek tarayıcı ölçümü gerekir.
4. **Senaryo/coğrafya:** 1939 için yalnız tarih değiştirilmemeli. Yeni veri
   paketiyle ülke/sınır/ordu/savaş farkları, tarihsel kaynak ve açık inceleme
   etiketleri gerekir. Mevcut Avrupa haritasını dünya haritası diye sunma.
5. **Ekipman ve ikmal:** tasarımcılar için sürümlü ekipman kimlikleri, tümen
   envanteri, sevkiyat rezervasyonu; ayrıntılı lojistik için ortak kenar
   kapasitesi ve yerel rezerv gerekir. Mevcut `strength` yüzdesi bütün bu
   ayrımların yerine geçmez.
6. **AI ve açıklama:** ortak komut doğrulamasını, sınırlı istihbaratı ve karar
   kayıtlarını yaygınlaştır; sonra hedef kararlılığı ve çok cepheli planlar
   ekle. Oyuncunun sınıra atamadığı komutanları bağımsız AI yardımına katma.

## Kanıt ve doğrulama sınırı

Başlangıç kodunda ilgili test aileleri: `engine.test.ts`, `advanced.test.ts`,
`audit-*.test.ts`, `group-*.test.ts`, `commander-*.test.ts`,
`city-regions.test.ts`, `simulation.test.ts`, `storage-*.test.ts`,
`offline*.test.ts`, `performance-regression.test.ts` ve
`scripts/test-europa-*.cjs`. Önceki teslimde 280 Europa testi ve gerçek
üretim tarayıcı kontrolleri raporlanmıştır; **bu belge yeni bir test çalıştırma
sonucu değildir**. Yeni geliştirmelerden sonra geçen/başarısız/çalıştırılmayan
kontroller ayrıca raporlanmalıdır. Önceki SVG performans ölçümleri yeni bir
3D sahnede 60 FPS garantisi oluşturmaz.

## 1. aşama — gerçek 3D sunum ve üretim muhasebesi

Bu aşama 55 bölümün tamamını bitirmez. Özellikle 3–5, 17–18, 27–29, 49–51
ve 53–55 başlıklarındaki mevcut temel üzerine aşağıdaki somut parçaları ekler.

### Eklenen ve bağlı çalışan parçalar

- **3D harita:** Three.js arazi mesh'i, sürekli prosedürel kabartı, kıyı
  yüzeyi, mevcut 447 bölge sınırı ve gerçek üçgen üzerinden bölge seçimi.
  Bunlar ölçülmüş DEM veya yeni tarihsel atlas değildir.
- **Sefer bağlantısı:** aynı World, ülke kontrolü, altı harita modu, komutan
  emri, grup seçimi, sağ tık/hedef seçme hareketi, simülasyon ilerlemesine bağlı
  temsilî piyade/tank hareketi ve gerçek muharebe işaretleri. Grafik kamera
  durumu ve görsel rastgelelik savaş hesabına veya sefer tohumuna karışmaz.
- **Görsel yerleşim:** instanced küçük evler, ağaçlar ve mevcut binalara
  bağlı sanayi/liman/havaalanı/rafineri temsilleri; bölge hasarı ve inşaat
  kuyruğuna bağlı hasarlı yapılar ve vinçler. Profesyonel sanat varlıkları,
  yüksek çözünürlüklü doku paketi veya tam animasyon kütüphanesi değildir.
- **Kamera/uyumluluk:** pan, zoom, orbit, dokunmatik iki parmak, şehir arama,
  başkente/seçili tümenlere gitme, dört kalite, uzak ayrıntı azaltma, sekme
  gizlenince çizimi durdurma ve kaynak temizliği. WebGL hatasında aynı sefer
  2D görünümde devam eder. Gecikmeli 3D dosyaları çevrimdışı pakete katılır.
- **Üretim:** depoya yalnız tamamlanmış tam adet ekipman eklenir. Önceden
  kaynakları tüketilmiş iş hat üzerinde birikir ve kaydedilir. Bütün hatlar
  ortak askerî fabrika/tersane kapasitesini ve stokları sırayla paylaşır.
  UI tahmini ve günlük motor aynı hesaplayıcıyı kullanır.
- **Korunum:** hat duraklatma, AI kapasite tahsisi, kayıt/yükleme ve iç savaş
  kalan işi korur; kapasite veya kaynaklar iki kez kullanılamaz. Eski kesirli
  stoklar silinmez. Takviye/onarım gibi diğer tüketicilerin kesirli muhasebesi
  bu aşamada bütünleşik, adetli bir envanter modeline geçirilmiş değildir.

Kontroller ve kapsam: [3D kullanım belgesi](europa-3d.md),
[geometri kaynağı](europa-3d-geometry.md),
[üretim formülü ve kayıt uyumluluğu](europa-production.md).

### Bu aşamanın çözmediği temel işler

- Saatlik hareket/savaş ile günlük ekonomi ayrımı ve sürümlü saatlik kayıt.
- Kaynakları doğrulanmış dünya haritası, dünya ülkeleri ve ayrı 1939 başlangıcı.
- Modüler ekipman/tümen tasarımı, tasarım sürümleri, yeniden donatım ve sevkiyat.
- Hareketli karargâh/ordu grubu/kolordu zinciri ve kapasite sınırları.
- Ortak kenar kapasiteli ikmal, tren/kamyon/konvoy havuzları ve rezerv muhasebesi.
- AI için eşit eksik bilgi, kalıcı stratejik hedefler ve açıklanabilir karar kaydı.
- Şartnamedeki bütün siyasi, diplomatik, içerik ve özel proje ayrıntıları.

Bu işler yalnız düğme, tarih etiketi veya dekor eklenerek tamamlanmış
sayılmamıştır; başlangıç tablosundaki ilgili kısmi/eksik durumlar devam eder.

### Doğrulama sonuçları — 1 Kasım 2026

- `npm run test:europa`: **304/304** test geçti. Üretim korunumuna, 3D
  geometri/seçime ve görsel işlemlerin simülasyonu değiştirmemesine yönelik
  yeni testler bu koşuya dahildir.
- Son çevrimdışı paket düzeltmesinden sonra **24/24 çevrimdışı test** ayrıca
  geçti. v4 paketi site ikonunu da saklar; başarısız güncelleme önceki
  kullanılabilir paketi silmez. Europa açıkken diğer oyunlara ait gizli
  gezinme bağlantıları önceden yüklenmez; başka sayfalardaki davranış korunur.
- `npm run build`: son kaynaklarla üretim derlemesi ve TypeScript denetimi geçti.
- `test-europa-browser.cjs`: **18/18** mevcut 2D oyun kontrolü geçti;
  araştırma, odak, savaş kayıpları, hava/deniz görevleri, kayıt ve çevrimdışı
  devam dahil. Bu test açıkça korunmuş 2D görünümü kullanır.
- `test-europa-commanders-browser.cjs`: **8/8** masaüstü/mobil kontrol geçti;
  12+1 otomatik atama, eşit sınır dağıtımı, hedef ülkeye saldırı, savunma,
  görevsiz komutanın bağımsız kalması ve kayıt/yükleme dahil.
- `test-europa-3d-browser.cjs`: son üretim sürümünde **19/19** kontrol geçti,
  **sıfır sayfa istisnası ve sıfır konsol hatası**. Gerçek WebGL, dört kalite,
  seferin tam veri eşitliği, gerçek yüzey seçimi, iki parmak zoom, üç tümenin
  masaüstü ve mobil emirle birlikte ilerleyip şehri ele geçirmesi, üretim
  ilerlemesi, çevrimdışı 3D açılış/devam, bağlam kaybı ve yarıda kesilen 3D
  başlatmanın kaynak temizliği denetlendi. Hatalar filtrelenmedi.
- `git diff --cached --check`: temiz.

Tarayıcı testleri yerel üretim sunucusu üzerinde, Chromium WebGL2/SwiftShader
ile 1440×1000 masaüstü ve 390×844 dokunmatik mobil boyutlarında çalıştı.
Masaüstünde başlangıç sahnesi 15 çizim çağrısı; kaliteye göre yaklaşık
83.621–145.937 çizilen üçgen bildirdi. Ayrı 5 saniyelik normal animasyon
örneğinde yazılımsal renderer **3 FPS**, ana iş parçacığı görev süresi
yaklaşık 0,067 saniye ve JS heap yaklaşık 46,7 MB ölçüldü. Kurulum/kalite
geçişlerinde daha uzun işler vardır; bu kısa örnek başlangıç gecikmesini
veya bütün oyun yüklerini temsil etmez. **Fiziksel telefon/Windows GPU'sunda
60 FPS doğrulanmış değildir.** İşlev kontrolleri azaltılmış hareket
tercihiyle, aynı gerçek WebGL sahnesi üzerinde yapılmıştır.

Gerçek cihaz, uzun süreli 3D büyük ordu/GPU profili ve canlı dağıtım doğrulaması
bu sonuçların kapsamında değildir. Şartnamedeki bütün mekaniklerin uçtan uca
kabulü, yukarıda belirtilen eksik sistemler tamamlanmadan geçilmiş sayılamaz.
