# XARMY Europa War — 1936 seferi, ikinci sürüm

Rota: `/games/europa-war`. Tek oyunculu II. Dünya Savaşı dönemi stratejisi;
ülkeler, üretim, savaşlar ve kayıtlar cihazda çalışır. Bu sürüm, ayrıntıları
koruyarak yönetimi kolaylaştırır ve haritayı yeniler. HOI4 dosyaları veya
arayüzü kullanılmamıştır. İstenen 100 maddenin tamamının HOI4 derinliğinde
bittiği iddia edilmez; aşağıda çalışan karşılıklar ve sınırlar açıklanmıştır.

## Kolay oynama

1. Ülkeni, tarihsel/alternatif yönelimi ve zorluğu seç. Varsayılan **Kolay**.
2. **Komuta** ekranındaki önceliklerden birini uygula. Sanayi, araştırma/odak,
   eğitim ve hava/deniz için yardımcıları ayrı ayrı açabilirsin. Her biri gerçek
   kaynak harcar; istediğin anda kapatıp bütün ayarları elle yapabilirsin.
3. Üstteki ▶ ile zamanı ilerlet; boşlukla duraklat. 1–5× hızlar gerçek günlük
   hesapları çalıştırır. Sekme arka plana geçince zaman durur.
4. Haritadaki askerî sembolü seç, **Haritada hedef seç** düğmesine bas ve hedef
   bölgeyi seç. Savaş ilanı olmadan tarafsız toprağa saldırılamaz. Duraklatılmış
   oyunda emir bekler; bunu bildiren mesaj gösterilir.
5. Birçok tümeni yönetmek için Ordu bölümünden savunma hattı veya taarruz
   hedefleri çiz. Hazırlık %30'a ulaşınca planı başlat. Tekil dur/hareket emri
   o birliği otomatik plandan çıkarır.

Kolay mod oyuncunun kara muharebe gücüne %50 destek verir; AI oyuncuya karşı
savaş açmak ve saldırmak için daha yüksek üstünlük arar. Normal eşit koşuldur.
Zor modda oyuncunun kara muharebe gücü %15 azalır. AI kendi kaynaklarını kullanır;
zorluk bir kaynak hilesi değildir. Komuta ekranından mevcut seferde değiştirilebilir.
Yardımcı savaş ilanı, barış koşulları veya ideoloji değişikliği kararı vermez.

## Harita ve şehirler

- Natural Earth **1:50m** kıyı/sınır ayrıntısı; 29 başlangıç ülkesi ve **447 ayrı şehir bölgesi**;
  303 yeni şehir, kendi sınırı, komşulukları ve bağımsız kontrol durumuyla oynanır.
- Şehir ele geçirmek yalnızca o şehri değiştirir; komşuları ayrıca alınmalıdır.
  1.111 bağlantı gerçek bölge komşuluklarını ve açıkça belirtilen deniz yollarını izler.
  Başlangıç nüfusu, kaynaklar ve sanayi eski bölgelerden bölüştürülür; çoğaltılmaz.
- Siyasi, arazi, kara harekâtı, ikmal, hava ve deniz haritaları; arazi taramaları,
  dağ kabartıları, işgal deseni, şehir işaretleri, bağlantılar, birlik sayaçları,
  savaş işaretleri, savunma hatları ve taarruz okları.
- Şehir araması, tekerlek yakınlaştırması, sürükleme, dokunarak yakınlaştırma,
  ülkeye odaklanma, bütün haritayı gösterme ve tıklanabilir küçük harita.
- Eski 144 bölgenin kimlikleri korunur. Yeni şehir sınırları yolları değiştirir;
  eski kayıt yüklenirken mülkiyet ve tesisler taşınır, artık bitişik olmayan
  hareket/cephe emirleri temizlenir ve oyuncuya bildirilir.
- Modern coğrafya üzerine yaklaşık 1936 düzeltmeleri uygulanır. Tam tarihsel
  sınır/idarî eyalet doğruluğu, bütün mikrodevletler ve koloniler yoktur. Şehir
  koordinatları seçilmiş referans noktalarıdır. Kaynaklar ve yeniden üretim:
  [MAP-SOURCES.md](../scripts/europa-war/MAP-SOURCES.md).

## Savaşın düzeltilen davranışı

Komşu düşman bölgesine saldırı, sınırda çatışma başlatır; uzun yürüyüş süresinin
bitmesi beklenmez. Bölgeyi ele geçirmek için savunmayı kırmak ve ilerlemeyi
bitirmek gerekir. Saldıran ve savunan aynı günlük işlemde asker ve organizasyon
kaybeder. Çatışan birlikler aynı anda takviye/organizasyon yenileyerek bu kaybı
silemez. Ordu ekranında devam eden muharebeler, güç payı, asker sayısı,
organizasyon, ikmal ve ülkenin toplam kaybı görülebilir.

Donanma gerektiren deniz taşıması ile hava indirme ayrıdır. Yakıtı uçuşa yetmeyen
kanat üstünlük sağlayamaz; limanını/ikmal yolunu kaybeden filo deniz kontrolü
veremez. Tam ilhak, yenilen ülkenin yabancı topraklardaki işgallerini de bitirir.

## Çalışan sistemler ve sınırları

| İstek     | Çalışan karşılık                                                                                                                                                                                                                                   | Kalan ayrıntı / sınır                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–15      | Siyasi/askerî haritalar, şehir/bölge bilgisi, başkent ve zafer puanlı teslimiyet; arazi etkileri, nüfus/insan gücü, sanayi, kaynak, işgal/direniş                                                                                                  | Tam tarihsel sınırlar ve gerçek nehir geometrisi yok; şehir sınırları oyun için geometrik bölümlerdir, tarihsel idarî sınırlar değildir. Nüfus/başlangıç kuvvetleri yaklaşık oyun ölçeğinde. |
| 16–23     | Piyade, hafif/orta/ağır tank, topçulu piyade, motorize/mekanize, özel kuvvet, dağcı, paraşütçü; ekipman/teknoloji gerekleri                                                                                                                        | Tabur düzeyinde serbest tümen tasarımcısı yok.                                                                                                                                               |
| 24–28     | Altı uçak modeli, üs/menzil/yoğunluk/yakıtlı kanatlar; üstünlük, destek, stratejik bombardıman, keşif, nakliye, deniz saldırısı; kruvazör, muhrip, zırhlı, denizaltı, uçak gemisi; ayrı gemi hasarı, onarım, intikal, taşıyıcı uçakları            | Havacılık/deniz savaşı günlük bölgesel modeldir; gerçek mermi veya uçuş fiziği yok.                                                                                                          |
| 29–35     | Tecrübe, generaller, savunma hattı, çok tümenli hazırlanabilen taarruz planları; kuşatma/ikmal, moral, organizasyon, yakıt/yıpranma; topçu/istihkâm/lojistik/hastane/keşif desteği; tank ve destek ekipmanını da tüketen takviye                   | Çok katmanlı küresel cephe/ordu grubu editörü yok.                                                                                                                                           |
| 36–49     | İttifak, gerekçe, savaş, ateşkes, pakt, ticaret/geçiş, ilişki, yardım, ambargo, gerilim; katkı puanlı/sıralı çok taraflı barış konferansı, bölge talebi, ilhak/kukla/bağımsızlık; ilhak sonrası ülke kurma                                         | Barışın ayrıntılı tazminat/donanmaya el koyma ve küresel diplomasi seçenekleri yok.                                                                                                          |
| 50, 94–98 | Tehdit, kuvvet, ikmal, sınır boşluğu, ekonomik ihtiyaçla karar veren AI; diğer AI'larla savaş/barış/ittifak; dengeli üretim, araştırma, inşaat, ticaret, eğitim, hava/deniz görevleri; tarihsel/alternatif yönelim; üç zorluk                      | Planlama ufku sınırlı; bütün ülkelerin kapsamlı tarihsel denge ve küresel deniz istilası planları tamamlanmış değil.                                                                         |
| 51–65     | Sivil/askerî fabrika, tersane, maden, rafineri, sentetik tesis; demir/çelik/petrol/yakıt/alüminyum/kauçuk; üretim hattı/verimlilik, konvoy baskını/eskorttan etkilenen gerçek ticaret rotaları, demiryolu/ikmal/altyapı, ekonomi kanunları         | Küresel kaynak pazarı, serbest ekipman tasarımcısı ve denizaşırı koloniler yok.                                                                                                              |
| 66–75     | Önkoşullu, tarih ve ülke bonuslu araştırmalar; silah, tank, uçak, gemi, motor, radar/hava savunması, şifreleme/çözme ve üç doktrin; teknolojiyle yeni modeller; kabine araştırma bonusları                                                         | Her tarihsel ekipman modelinin ayrı adı/istatistiği ve tüm bilim kadrosu yok.                                                                                                                |
| 76–85     | Beş ideoloji, destek, kampanya/reform, seçim hesabı, istikrar/savaş desteği/yorgunluk, iç savaş; ortak odak ağacı ve Türkiye/Almanya/Fransa/Britanya/İtalya/SSCB için farklı etkili ek odaklar; üç kabine görevi; süreli maliyetli ulusal kararlar | Her ülkenin bütün tarihsel olay/parti/seçim takvimi yok. Odak ağaçları HOI4 ölçeğinde değil.                                                                                                 |
| 86–93     | Teşkilat, ajan eğitimi, keşif/sabotaj/propaganda/karşı casusluk/plan çalma/direniş/gizli diplomasi; koşullu darbe girişimi, yakalanma/kayıp olasılığı                                                                                              | Bölgesel ajan ağları ve ekipmanlı hazırlık aşamaları soyutlanır.                                                                                                                             |
| 99–100    | Üç manuel ve iki dönüşümlü otomatik kayıt; JSON içe/dışa aktarım; katı şema/referans denetimi; v1 1936 kayıt geçişi; duraklatma/hız/tarih/olay günlüğü                                                                                             | Eski 2025 senaryo kayıtları ayrı kalır; dönüştürülmez veya silinmez.                                                                                                                         |

Deniz havzaları: Atlantik, Kuzey/Arktik, Baltık, Akdeniz, Karadeniz. Düşmanın
İstanbul veya Danimarka geçidini tutması ilgili geçişi kapatır. Hazar'daki Bakü
okyanusa çıkış sayılmaz. Cebelitarık bu bölgesel haritada temsil edilmediği için
Atlantik–Akdeniz geçişi açık kabul edilir.

## Tarihsel yönelim

1936 başlangıcı; seçilmiş olaylar İspanya iç savaşı, Atatürk'ün vefatı ve İnönü'ye
geçiş, Avusturya krizi; Almanya–Polonya, Sovyetler–Finlandiya ve Almanya'nın
Danimarka/Fransa/SSCB savaş takvimlerini kapsar. Oyuncu adına otomatik savaş
ilan edilmez; başka bir AI oyuncuya saldırabilir. Sonuçlar garanti edilmez.
Türkiye'nin ek odakları Montrö, devletçilik, Karabük, Kayseri, Balkan diplomasisi,
tarafsızlık, millî savunma ve kooperatif yollarında farklı etkiler üretir.

## Çevrimdışı ve kayıt uyumluluğu

Sunucu, API anahtarı veya Upstash oyun hesabı yapmaz. Üretim sürümünde ilk
çevrimiçi açılışta service worker bu rotanın HTML/JS/CSS/font paketlerini cihaza
indirir. “Çevrimdışı kullanıma hazır” bildirimi geldikten sonra internet kapalıyken
yeniden açılabilir. İlk kez indirilmemiş site çevrimdışı açılamaz; tarayıcı verileri
silinirse yerel kayıtlar da silinir, bu nedenle JSON dışa aktarımı sunulur.

Yeni şema v2'dir. Önceki 1936 v1 seferleri kontrollü taşınır; eski stoklar gerçek
hava kanatlarına/gemilere aktarılırken çoğaltılmaz. 144 bölgeli kayıtlar 447
şehir bölgesine genişletilir; işgaller ve toplam tesis sayıları korunur. Hava ve
deniz üsleri eski şehirlerinde kalır. Eksik şehir içeren bozuk yeni kayıtlar
otomatik doldurulmaz. Eski yuva anahtarları korunur.
Bozuk dosya mevcut seferin yerini almaz. Diğer oyunların/API yanıtlarının önbelleği
alınmaz. Oyun tüm coğrafyasını yerel paketten yükler.

## Mimari ve doğrulama

`engine.ts` günlük deterministik simülasyonu ve atomik emirleri birleştirir.
`land`, `economy`, `diplomacy`, `politics`, `operations` yanında `airnaval`,
`military-assets`, `planning`, `conference`, `decisions`, `management` ve
`trade-routes` ayrı sistemlerdir. `CommandCenter` ayrıntılı `WarPanels` ve
`AdvancedPanels` üzerindeki kolay yönetim katmanıdır; ayrı/sahte oyun hesabı yoktur.

```sh
npm run test:europa
npm run test:chess
npm run test:battle
npm run build
npm start
# Playwright/Chromium bulunan geliştirme ortamında:
node scripts/test-europa-browser.cjs
```

Regresyonlar; sınır saldırısında iki taraflı hasar ve toparlanmanın durması,
hava indirmesi, yakıtsız hava/deniz, menzil/üs yoğunluğu, gemi intikali/onarımı,
konvoy/eskort, destek ve tank takviyesi, taarruz hazırlığı, katkılı barış ve yabancı
işgallerin iadesi, yardımcı/manuel yönetim, zorluk ve kayıt geçişini kapsar.
Uzun test 1936–1945 günlük seferini çalıştırır. Şehirlerin ayrı ele geçirilmesi,
447 bölgenin komşulukları ve eski harita kayıtlarının geçişi de sınanır. Tarayıcı testi masaüstü/mobil,
komuta yardımcıları, araştırma/odak, gerçek destek ekleme, uçak kurma/görevlendirme,
donanma emri, harita modları/arama/yakınlaştırma, cephe çizimi, kayıt/yükleme
ve ağ kapalıyken yeniden açılışı sınar.

Yerel doğrulama sonucu teslim raporunda belirtilir. Vercel'in canlı üretim durumu,
bütün cihazlarda performans veya HOI4 düzeyinde denge garantisi değildir.

## Bu sürümde doğrulananlar — 22 Ekim 2026

- `npm run test:europa`: **56/56**; 1936–1945 sonuna kadar 3.653 günlük sefer,
  şehirlerin ayrı ele geçirilmesi, iki taraflı çatışma kaybı, iç savaş ve eski
  kayıtların şehir haritasına geçişi dahil.
- `npm run test:chess`: **95/95**, `npm run test:battle`: **18/18**.
- `npm run build`: başarılı (Node 24). Eski tarayıcı uyumluluk verisi hakkında
  derlemeyi engellemeyen Browserslist uyarısı mevcut.
- Üretim sunucusunda Chromium: **18 kontrol**, sıfır sayfa hatası; gerçek
  Eskişehir bölgesini seçme, cephe çizme, destek/kanat/gemi emirleri, savunulan
  sınırda asker kaybı, mobil ekran ve çevrimdışı yeniden açılış dahil.
- Eski ve yeni haritanın her ana bölgesinde nüfus, fabrika, tersane ve tüm
  kaynak toplamları karşılaştırıldı; toplamlar aynı kaldı.

Şehir sınırları ve masaüstü/mobil ekran görüntüleri gerçek çalışan oyunda
incelendi. Bunlar yerel doğrulamalardır; Vercel üretim yayını ayrıca doğrulanmadı.
