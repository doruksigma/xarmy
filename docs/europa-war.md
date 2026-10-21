# XARMY Europa War — 1936 seferi

Bu değişiklik, eski 2025 ülke ele geçirme oyununu, 1 Ocak 1936 başlangıçlı,
bağlantılı büyük strateji mekanikleri olan bir sürümle değiştirir. Rota:
`/games/europa-war`. Oyun tek oyunculu; bütün ülkeleri yerel simülasyon yönetir.

**100 maddelik isteğin tamamı HOI4 derinliğinde bitmiş değildir.** Aşağıdaki
sistemler çalışan kod ve arayüzle uygulanmıştır; tarihsel veri doğruluğu ve
özellikle hava/deniz modelinin ayrıntısı için kalan iş açıkça ayrılmıştır.

## Oynama

Ülke ve tarihsel/alternatif yönelim seç, seferi başlat. Başlangıç duraklatılmıştır.
Bir araştırma, ulusal odak, inşaat ve üretim planı seç; üst çubuktaki ▶ ile zamanı
ilerlet. Boşluk duraklatır/devam ettirir; 1–5× hızlar gerçek günlük hesapları çalıştırır.
Sekme arka plana geçtiğinde sefer durur; duvar saatiyle kaçırılan günler hesaplanmaz.

Haritayı sürükle ve tekerlekle yakınlaştır. Bölgeye tıkla: nüfus, arazi, tesis,
kaynak, ikmal ve işgal bilgisi. Askerî sembole tıkla: birlik yönetimi. Hedef seç
emri, erişilebilir topraklarda rota hesaplar. Shift ile mevcut rotaya hedef eklenir.
Savaş ilanı olmadan tarafsız sınıra girilemez. Savunma hattı, komşu kendi
eyaletlerine sırayla tıklanarak çizilir; atanmış tümenler hat boyunca dağılır.
Tekil hareket/dur emri o birliği otomatik hat yönetiminden çıkarır.

Savaş gerekçesi 45 gün sürer. Saldırmazlık paktı yürürlükteyken savaş açılamaz.
Başkent kaybı ve kaybedilen zafer puanları teslimiyete etki eder. Zaferden sonra
ilhak, bağlı devlet veya bağımsızlık kararı gerçek mülkiyet/ittifak durumunu değiştirir.

## Uygulanan sistemler ve sınırları

| İstek maddeleri | Çalışan karşılık                                                                                                                                                                                                           | Kalan ayrıntı / sınır                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4             | 29 ülke, 144 bölge, yerel siyasi harita, şehirler, renkler, ülke seçimi, zoom/pan                                                                                                                                          | Sınırlar yaklaşık; tüm tarihsel idarî eyaletler, mikrodevletler ve koloniler yok. Ülke işaretlerinin tümü 1936 bayrakları değildir.                                                          |
| 5–7             | Bölge kontrolü, başkent bonuslu zafer puanları, %80 eşiğinde teslimiyet                                                                                                                                                    | Şehir, stratejik bölgenin merkezi; şehir içinde ayrı taktik savaş yok.                                                                                                                       |
| 8–11            | Ova, şehir, dağ, orman, bataklık, kurak arazi; hareket/savaş etkileri; nüfus, kanunla sınırlı insan gücü; altyapı/sanayi                                                                                                   | Nüfus ve asker sayıları oyun ölçeğinde yaklaşık. Gerçek 1936 askerî düzeni yeniden oluşturulmuş değil.                                                                                       |
| 12–15           | Demir, petrol, çelik, alüminyum, kauçuk, yakıt; liman/deniz geçişi; direniş, garnizon, ayaklanma; ayrıntılı panel                                                                                                          | Bağımsız boğaz denetimi, küresel ticaret güzergâhları ve gerçek nehir ağı henüz yok.                                                                                                         |
| 16–23           | Piyade, üç tank sınıfı, topçulu piyade, motorize/mekanize, özel kuvvet, dağcı, paraşütçü; teknoloji ve ekipman gereksinimleri                                                                                              | Topçu ayrı destek bölüğü şablonu değil. Ayrıntılı tabur/tümen tasarımcısı yok.                                                                                                               |
| 24–28           | Avcı kayıpları, hava üstünlüğü/yakın destek/stratejik bombardıman; muharebe filosu, denizaltı, uçak gemisi; baskın ve deniz üstünlüğü                                                                                      | Taktik/stratejik bombardıman ortak uçak stoğu kullanır. Ayrı muhrip/zırhlı sınıfları, uçak kanatları, deniz bölgesi haritası ve tekil gemi hasarı henüz yok.                                 |
| 29–35           | Birlik tecrübesi, komutan beceri/tecrübe/özellikleri, savunma hattı çizimi, rota okları, kuşatma, organizasyon, moral, yakıt ve yıpranma                                                                                   | Birlik ekipmanı tümen kurulumunda tüketilir; savaş takviyesi şu anda tüfek/insan gücüyle modellenir. Tam tank/top takviye lojistiği ve çok ordulu taarruz planı editörü kalan iş.            |
| 36–49           | İlişki puanları, savunma ittifakı, süreli gerekçe, savaş, ateşkes, pakt, ticaret, geçiş izni, bağlı devlet/ilhak/bağımsızlık, ambargo, yardım, gerilim                                                                     | Barış, ateşkes ve galibin üç sonucu arasında seçimdir; çok taraflı, puan harcayarak bölge dağıtılan konferans yok. İlhak edilmiş ülkeyi sonradan yeniden kurma henüz yok.                    |
| 50, 94–98       | Kaynak, kuvvet oranı, tehdit, ikmal ve cephe boşluklarını değerlendiren AI; inşaat/üretim/araştırma/ticaret/ordu; diğer AI ülkeleriyle savaş/ittifak/ateşkes; iki yönelim                                                  | AI sınırlı planlama ufkuna sahip. Çok yıllı küresel plan, kapsamlı deniz istilası AI'sı ve tarihsel denge incelemesi tamamlanmadı.                                                           |
| 51–65           | Sivil/askerî fabrika/tersane; demir çıkarma, demir→çelik, petrol→yakıt, alüminyum, sentetik kauçuk; ithalat/ihracat; maliyetli üretim, verimlilik; inşaat kuyruğu; yol/demiryolu/ikmal merkezi; ekonomi kanunları          | Madenler bölge verisinden üretir; ayrı maden inşaatı yok. Ekipman modeli seçimi sınıf/teknoloji düzeyinde; üretim tasarımcısı yok.                                                           |
| 66–75           | 28 teknoloji: silah/zırh/motor, avcı/bombardıman/keşif, denizaltı/uçak gemisi, radar/şifreleme/şifre çözme, üç doktrin; önkoşullar, tarih cezası, ülke bilim bonusu, araştırma yuvaları                                    | Radar aynı yapıda hava savunmasını da soyutlar. Ayrı keşif uçağı modeli ve isimli bilim insanı kadrosu yok.                                                                                  |
| 76–85           | Beş siyasi yönelim, destek oranları, maliyetli kampanya/reform, yıllık demokratik seçim hesabı, istikrar/yorgunluk, liderler, danışman etkileri; 13 dallanan ulusal odak; Türkiye'ye özgü adlar; düşük istikrarda iç savaş | Büyük ülkelerin odak adları farklı; birçok etki ortak. Her ülkeye özgü kapsamlı tarihsel odak ağacı, tam seçim takvimi, ayrı darbe/kriz karar zinciri ve isimli kabine sistemi tamamlanmadı. |
| 86–93           | Teşkilat, ajan eğitimi, keşif, sabotaj, propaganda, karşı casusluk, plan çalma, direniş desteği, gizli diplomasi; gerçek başarı/başarısızlık ve ajan kaybı                                                                 | Bölge bazlı ajan ağları ve operasyon hazırlık ekipmanı soyutlanmıştır.                                                                                                                       |
| 99–100          | 3 manuel + 2 dönüşümlü otomatik kayıt, JSON içe/dışa aktarım, şema kontrolü; duraklat/1–5×/tarih/olay günlüğü                                                                                                              | Eski 2025 kayıtları silinmez, yeni senaryoya dönüştürülmez.                                                                                                                                  |

## Tarihsel yönelim

Tarih 1936'da başlar. Seçilmiş olaylar İspanya iç savaşı, Atatürk'ün vefatı ve
İnönü'ye geçiş, Avusturya krizi; Almanya–Polonya, Sovyetler–Finlandiya,
Almanya–Danimarka/Fransa/Sovyetler savaş tarihlerini kapsar. Oyuncunun yönettiği
ülkeye otomatik saldırı emri verilmez; AI'da pakt, ittifak, bağlılık ve teslimiyet
kontrol edilir. Oyuncuya karşı başka bir AI'nın tarihsel saldırısı gerçekleşebilir.
İspanya yüksek istikrarla iç savaşı önleyebilir. Tarihsel mod sonuçları garanti etmez.
Alternatif mod, güce ve çıkarlara göre AI savaş gerekçesi ve savaş kararı kullanır.
Bu, II. Dünya Savaşı'nın tüm tarihsel olaylarını simüle ettiği iddiası değildir.

## Çevrimdışı çalışma

Oyun sunucu/API anahtarı, Upstash veya ağ bağlantısı kullanarak hesap yapmaz.
Üretim sürümünde ilk çevrimiçi açılış, service worker ile bu sayfanın HTML'ini ve
aynı origin altındaki sabit Next.js JS/CSS/font paketlerini cihaza indirir.
“Çevrimdışı kullanıma hazır” yazısı geldikten sonra internet kapalıyken sayfa yeniden
açılabilir. İlk kez hiç indirilmemiş bir web sitesi çevrimdışı açılamaz. Tarayıcı
site verilerini silerse paket ve yerel kayıtlar da silinir; JSON yedeği taşınabilirdir.

İndirme tamamlanmadan çalışan HTML kopyası değiştirilmez. Diğer oyunlar, hesaplar,
API yanıtları ve harici kaynaklar önbelleğe alınmaz. Eski paket dosyaları güncelleme
geçişlerinde çalışan eski HTML'in bağımlılıklarını korumak için tutulur.

## Mimari ve test

- `world.ts`: yerel senaryo, coğrafya, ikmal ağı, kapasite, ilişkiler.
- `engine.ts`: atomik emirler; tek günlük deterministik dünya işlemi.
- `land.ts`, `economy.ts`, `diplomacy.ts`, `politics.ts`, `operations.ts`, `ai.ts`: bağlı sistemler.
- `storage.ts`: şema, sınırlar, kimlik/referans denetimi; bozuk kayıt mevcut seferin yerini almaz.
- `WarMap.tsx`: SVG harita ve gerçek birlik/hat/rota/muharebe durumları.
- `WarPanels.tsx`: Türkçe yönetim panelleri; bütün eylemler engine emirlerini kullanır.

```sh
npm run test:europa
npm run test:chess
npm run test:battle
npm run build
```

Europa testi 1936–1941 günlük simülasyonunu; kaynak ve insan gücü hesaplarını,
tarafsızlık/deniz sınırlarını, ikmal kesilmesini, eşzamanlı ele geçirmeyi, inşaatı,
araştırmayı, iç savaşı, sabotajı, bombardımanı, teslimiyet/barışı, savunma hattını
ve bozuk kayıt reddini denetler. Tarayıcı testi aşağıdaki script ile yerel üretim
sunucusunda çalışır. Playwright ve Chromium geliştirme ortamında bulunmalıdır.

```sh
npm start
# Ayrı terminalde, Playwright node çözümleme yolunda iken:
node scripts/test-europa-browser.cjs
```

Bu sürüm için masaüstü/mobil görsel kontrol ve çevrimdışı yeniden açılış sonucu
çalışma raporunda belirtilir. Sabit FPS veya HOI4 düzeyinde denge garantisi verilmez.

## Bu sürümde doğrulananlar (21 Ekim 2026)

- Node.js 24.19.0 üzerinde `npm run build` başarılı.
- `npm run test:europa`: **23/23**; 1936–1941 simülasyonu dahil.
- Mevcut satranç testleri **95/95**, Battle Royale testleri **18/18** geçti.
- Chromium + Playwright ile yerel üretim sürümünde 1440×1000 ve 390×844 görünüm kontrol edildi.
- Ülke seçimi, araştırma ve ulusal odak başlatma; haritaya cephe çizip tümen atama;
  zamanı ilerletme; manuel kayıt/yükleme; mobil panel kapatma ve harita yakınlaştırma geçti.
- Tarayıcı ağı kapatılıp sayfa yeniden yüklendi; yerel kayıt açıldı ve simülasyon
  çevrimdışı devam etti. Tarayıcı `pageerror` sayısı: **0**.
- Görsel incelemede mobil üst çubuk çakışması giderildi. Bu kontrol fiziksel bir
  telefonda performans veya bütün donanımlarda kare hızı garantisi değildir.
- Bu yerel doğrulamalar Vercel üretim dağıtımının canlı durumunu doğrulamaz.
