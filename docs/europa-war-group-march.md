# Toplu yürüyüş ve harita takılması

Karşılaştırma tabanı: `d39419c`.

## Yeniden üretilen sorun

Önceki testlerde aynı hızdaki üç piyade kullanılıyordu. Bir hafif tank ve
15 piyade ile verilen tek emirde bütün tümenlerin rotası atanmasına rağmen
hızlı tank önce varıyordu. Harita bu nedenle önce 1, sonra 15 tümen gösteriyordu.
Gerçek tarayıcıda savunması kırılan şehre girişte ikinci gün, dost şehre
yeniden yönlendirmede dördüncü gün bu ayrılma yeniden üretildi.

Yoğun bir yığılma ayrıca şehrin ikmal kapasitesini aşabilir. Bu, simülasyondaki
yavaş yürüyüştür; ana iş parçacığındaki ekran takılmasından ayrı incelenir.
Grup paneli düşük ikmalin hareketi yavaşlattığını ve ikmal/dağıtım seçeneklerini
açıklar. İkmal, yakıt ve yıpranma kuralları kaldırılmadı.

## Değişiklikler

- Aynı toplu emre veya etkin taarruz planına bağlı, aynı şehirden aynı yol
  bölümüne ilerleyen tümenler en yavaş üyenin temposunu paylaşır; şehre birlikte
  girerler. Farklı şehirlerdeki birlikler birbirlerini haritanın öbür ucunda
  beklemez. Tek tümen emirleri kendi hızlarını korur.
- Durdurulan, başka hedefe yönlendirilen, geri çekilen veya yok edilen üye
  eski grubu kilitlemez. Grup bilgisi kayıt dosyasında korunur; eski kayıtlar
  bu alan olmadan da yüklenebilir.
- Hedefi başka bir ordu ele geçirip taarruz planını otomatik tamamladığında da
  yoldaki grup birlikte varır. Planı oyuncunun durdurması veya silmesi ise
  bütün hareket emirlerini durdurur.
- Sabit SVG arka planı, kıyılar ve ülke sınırları her fare hareketinde veya
  oyun gününde yeniden oluşturulmaz. Eyalet çizimleri yalnızca görsel
  özellikleri değiştiğinde güncellenir. Fareyle şehirlerin üzerinden geçmek
  sabit haritayı ve birlik çizimlerini yeniden oluşturmuyor.
- Ülke kontrolü, renkler, işgal işaretleri, ikmal, birlikler, seçim ve klavye
  etkileşimi canlı kalır. Harita veya şehir sınırı kaldırılmadı.
- Otomatik kayıttan sonra kapalı kurulum ekranının kayıt listesi bütün dünyayı
  yeniden ayrıştırıp doğruluyordu. Bu gizli liste oyun sırasında artık kayıt
  bildirimlerine abone olmaz. Arşiv veya yeni sefer ekranı açıldığında kayıtlar
  yeniden okunur ve tam doğrulanır.
- Büyük otomatik kayıtları `JSON.stringify` ve eşzamanlı `localStorage`
  yazımıyla saklamak da ana iş parçacığını durduruyordu. Otomatik yuvalar
  artık yapılandırılmış sefer nesnesini asenkron IndexedDB işlemiyle saklar.
  Kayıt tamamlandı bildirimi yalnızca işlem gerçekten kalıcılaştığında gönderilir.
  Birbirini izleyen yazmalar sıraya alınır; hata sonraki kaydı engellemez.
- Üç manuel yuva ve JSON dışa aktarma korunur. IndexedDB'de henüz bulunmayan
  otomatik yuvalar için eski `localStorage` kayıtları okunur. Bozuk veya erişimi
  reddedilmiş yeni kayıt, eski kayıt gösterilerek gizlenmez. Başka sekmelerdeki
  değişiklikler arşive yansır. Yeni sefere geçiş ve oyunlar sayfasına dönüş,
  kaydın tamamlanmasını bekler; yazma hatasında mevcut sefer açık kalır.
  Kayıt/yükleme geçişinde zaman ve yeni emirler kilitlenir, durum ekranda
  gösterilir. Dosyadan yükleme de aynı geçiş kilidini kullanır; bekleyen bir
  yükleme yeni seferin üstüne yazamaz. Bu geçişler sırasında sekmeyi gizlemek,
  eski dünyayı yüklenen yuvaya yazmaz veya ikinci bir çıkış kaydı başlatmaz.
- Uzun kayıt/yenileme testi çevrimdışı paket hazırlığında ayrı bir hatayı
  ortaya çıkardı: Next.js, çalıştırılmış sayfa/layout betiklerini DOM'dan
  kaldırınca geç hazırlanan paket bu dosyaları atlıyordu. Paket listesi ilk
  DOM görüntüsünü, güncel DOM'u ve yüklenmiş yerel JS/CSS kaynaklarının tarayıcı
  kaydını birleştirir. Service worker'ın güncel HTML ile dosya listesini
  karşılaştıran doğrulaması korunur; eksik veya karışık sürüm kabul edilmez.

## Doğrulama

- Tam Europa test çalıştırması: **255/255 başarılı**; bunun 15'i bu düzeltmeye ait
  yeni toplu yürüyüş regresyonlarıdır. Eski kayıt, toplu savaş, taarruz planı,
  ayrı emir, Shift kuyruğu, yeniden hedefleme, düşük yakıt/ikmal ve kayıp üye
  durumları sınandı.
- Sonradan eklenen iki çevrimdışı dosya toplama regresyonu, mevcut service
  worker testleriyle birlikte **26/26 başarılı**. Karışık sürüm ve eksik
  dosya paketlerinin reddedilmesi de bu çalıştırmada doğrulandı.
- Genel oyun ekranı **18/18**, simülasyon worker'ı **8/8**, 16 tümenlik
  masaüstü/dokunmatik hareket **3/3** tarayıcı kontrolünden geçti.
- Asenkron kayıt tarayıcı senaryoları **10/10 başarılı**: büyük seferde
  otomatik kayıt, yeniden yükleme/dışa aktarma, eski yuvalar, bozuk/erişilemeyen
  kayıt, işlem iptali, başarısız çıkış, sekmeler arası değişiklikler, bekleyen
  yazmalar ve çevrimdışı yükleme kontrol edildi. Çevrimdışı dosya düzeltmesinden
  sonra worker'ın sekiz senaryosu da yeniden geçti.
- Üretim derlemesi ve TypeScript kontrolü başarılı. Son paket:
  `cXS8ZBVt8jhsC-6AGzKhW`.
- Bir hızlı tank ve 15 piyade ile gerçek saat üzerinden her gün gözlenen
  masaüstü/telefon senaryosunda ilk iki gün 16 birlik birlikte yürüdü; üçüncü
  gün 16'sı birlikte hedef şehre girdi. Yeni hedef, durdurma ve yeniden emir
  verme de kontrol edildi.

## Performans ölçümünün sınırları

`iMbRYp34bxIAKK9_Q5YID` paketinde Linux Chromium'da 4× CPU yavaşlatma ile aynı kamera hareketleri ve 2.000
tümenlik sefer ölçüldü. Bu fiziksel Windows/telefon veya 60 FPS testi değildir.

| İşlem                                                           |   Önce | Son tekrar |
| --------------------------------------------------------------- | -----: | ---------: |
| Fareyle kaydırma JavaScript işi                                 | 274 ms |     162 ms |
| Dokunarak kaydırma JavaScript işi                               | 121 ms |      81 ms |
| Otomatik kayıt yazma yolunda örneklenen ana iş parçacığı süresi | 180 ms |      40 ms |

İlk iki satır `d39419c` ile karşılaştırılır. Son satır gizli arşiv doğrulaması
kaldırıldıktan sonraki eşzamanlı kayıt ile IndexedDB yazımını karşılaştırır;
önce `setItem` + `JSON.stringify`, sonra `put` + transaction örnekleridir.
Otomatik kayıt sırasında JSON ayrıştırma, JSON metni üretme ve `localStorage`
yazımı kaldırıldı; IndexedDB'nin nesne kopyalama maliyeti sıfır değildir.

Bütün kamera ölçümleri iyileşmedi. Son tekrarda şehir üzerinde gezinirken
381 ms'lik yerleşim/çizim sıçraması görüldü. İlk IndexedDB koşusundaki 1.14
saniyelik React çizim sıçraması tekrarlanmadı; son büyük-sefer koşusundaki
en uzun görev 151 ms oldu. Büyük-sefer koşuları farklı sayıda oyun günü
ilerlediğinden toplam süreler eşit iş yükü/FPS karşılaştırması değildir.
Bu nedenle tamamen takılmasız çalışma iddiası yoktur.

Ölçüm kanıtları çalışma ortamında
`/workspace/scratch/europa-group-stutter/comparison-indexeddb-repeat.json`
ve ilgili `final-indexeddb-repeat` izlerinde bulunur.

## Yeniden çalıştırma

```sh
npm run test:europa
npm run build
npm start
# Playwright ve Chromium bulunan ortamda, sırayla:
node scripts/test-europa-convoy-browser.cjs
node scripts/test-europa-map-render-browser.cjs
node scripts/test-europa-autosave-browser.cjs
node scripts/test-europa-interactions.cjs
node scripts/test-europa-group-browser.cjs
node scripts/test-europa-war-browser.cjs
node scripts/test-europa-worker-browser.cjs
node scripts/test-europa-browser.cjs
```

Tarayıcı senaryoları kayıt içe aktarma, seçim, toplu emir, gerçek oyun saati
ve manuel kayıt akışını kullanır. Günlük gözlem, tarihin değiştiğini görünce
oyunun duraklat düğmesine basar; motor veya uygulama iç durumuna müdahale etmez.
