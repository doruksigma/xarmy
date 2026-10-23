# Europa War: savaşta ilerleme ve mekanik denetimi

23 Ekim 2026. Karşılaştırma tabanı `e4cfbd1`.

## Savaşta ilerlemeyi engelleyen hatalar

- **Yeni hedef eski saldırıyı iptal etmiyordu.** Rota artık tümenin gerçekten
  bulunduğu şehirden hesaplanıyor. Yeni yol aynı ilk adımı izliyorsa kazanılmış
  yürüyüş mesafesi korunuyor; farklı yöne emir verilirse eski adım iptal ediliyor.
  Shift ile hedef ekleme ve devam eden aynı hedefli hava indirmesi korunuyor.
- **Yıpranmış tümen boş düşman şehrinde kalıyordu.** Savunmasız şehre yürümek
  artık muharebe sayılmıyor; ikmal varsa birlik toparlanabiliyor. Savunucu
  kalmadığında yolculuğunu tamamlayan yaşayan tümen şehri ele geçirebiliyor.
  Gerçek muharebede düşük organizasyon ve ağır kayıp nedeniyle taarruzun durması
  devam ediyor ve oyuncuya hedef başına tek olay bildirimi veriliyor.
- **Yakıtsız ve ikmalsiz motorlu birlik hiç ilerleyemiyordu.** Eski günlük
  çıkarma/toplama hesabı toplam yol mesafesini her gün sıfırlayabiliyordu. İkmal
  ve yakıt artık o günkü pozitif hızı azaltıyor; birlik çok yavaş da olsa
  yürüyebiliyor. İkmalsiz ve organizasyonsuz oyuncu birliğine tamamen dost
  topraklardan çekilme izni veriliyor; yeni düşman taarruzunun eşiği korunuyor.
- Aynı gün yıpranmayla ölen düşman birliği, geri çekilme yolunu kapatmıyor.
- AI, cephe gerisinde ikmalsiz kaldığında komşu daha iyi ikmale ilerleyebiliyor.
  Kuvvet oranları ve zorluk bonusları değiştirilmedi.

## Ekrandaki durum

- Sıradaki emir, gerçek muharebe, savunma, yürüyüş, toparlanma ve plan hazırlığı
  ayrı açıklanıyor. Bekleyen taarruz planı yeni emir bekleyen birlik gibi
  gösterilmiyor. İkmal ve yakıt yetersizliği ayrıca belirtiliyor.
- Yol ilerlemesinin yüzdesi 100'ü aşmıyor. Bu değer dolsa da savunucu yenilmeden
  şehrin ele geçmeyeceği açıklanıyor.
- Telefonda hedef seçerken kapanan panel, başarılı emir ve duraklatma mesajını
  gizlemiyor. Haritada bildirimi kapatma, paneli açma ve zamanı ilerletme
  düğmeleri var. Bildirim şehir aramasını örtmeyecek şekilde aşağıda gösteriliyor;
  kullanıcı paneli kapatınca panelde zaten okunan eski mesaj temizleniyor.

## Diğer bulunan hatalar

- Fabrika veya tersane kaybından sonra mevcut üretim tahsislerini azaltmak ve
  kapatmak mümkün. Kapasiteyi aşan yeni artışlar yine reddediliyor.
- Uçak gemisine yükleme/boşaltma için güvenli liman ve doğru deniz bölgesi
  gerekiyor; işgal edilen limanda işlem yapılamıyor.
- Ticaret rotasının çıkış ve varış başkentleri de abluka kontrolüne tabi.
  Düşman kontrolündeki ihracat başkentinden teslimat veya ödeme yapılmıyor.
- Teslim olmuş bir konferans katılımcısı görüşmeleri sonsuza dek kilitlemiyor;
  yalnızca pas geçiyor. Bütün katılımcılar bu durumdaysa görüşme kapanıyor.
- İç savaşta taraf değiştiren birlikler eski devletin cephe ve taarruz
  atamalarından hemen ayrılıyor. Sadık birliklerin emirleri korunuyor.
- Keşif teknolojisinin açıklaması, açtığı keşif uçağı/göreviyle uyumlu hale getirildi.

## Kontrol kapsamı

| Alan | Sınanan durumlar |
| --- | --- |
| Kara hareketi ve savaş | Toplu saldırı, bütün tümenlerde hasar, savunucunun çekilmesi, birlikte ele geçirme, boş şehir, zayıf birlik, yeni hedef, Shift kuyruğu, iptal, dost geri çekilme, yakıt/ikmal yokluğu, aynı gün birden çok muharebe |
| Plan ve AI | Hazırlık, organizasyon toplama, ardışık iki hedefin alınması, manuel emrin plandan ayırması, güçlü cephede bekleme, açılan zayıf cepheye saldırı, daha iyi ikmale çekilme |
| Ekonomi ve araştırma | Mevcut bütün yapı/ekipman/birlik katalogları, 28 teknolojinin önkoşulları ve tamamlanması, araştırma→üretim→tank eğitimi zinciri, fabrika kaybı, ticaret rotası ve ödeme |
| Hava/deniz ve operasyon | Altı uçak modelinin dokuz görev birleşimi, gerçek yakıt tüketimi ve etkiler, menzil, eskort, denizaltı intikali, uçak gemisi limanı, mevcut casusluk senaryoları |
| Siyaset ve diplomasi | İç savaş, kabine/kararlar/odaklar, ittifak/pakt/geçiş, ambargo/yardım, konferans sırası/bütçesi ve teslim olan katılımcılar |
| Sefer, kayıt ve çevrimdışı | Altı oyuncu ülkesi, tarihsel/alternatif mod, üç zorluk, savaş sürerken kayıt gidiş-dönüşü ve deterministik devam; mevcut eski kayıt, worker, duraklatma ve çevrimdışı paket testleri |

Altı ülkeli ek senaryo Türkiye/Bulgaristan, Almanya/Polonya, Fransa/Almanya,
İtalya/Yugoslavya, SSCB/Finlandiya ve Polonya/Almanya savaşlarını kullanır.
90 gün boyunca haftalık dünya doğrulaması, her 30 günde kayıt yükleme ve sonraki
günün eşitliği denetlenir. Yenilgi ve teslimiyet de geçerli sonuçlardır;
testler bütün ülkelerin savaşı kazanmasını beklemez.

Bu denetim mevcut sistemleri ve belirtilen hata durumlarını kapsar. Bütün olası
tarihsel olay, çok taraflı diplomasi, aşırı kayıt büyüklüğü ve donanım
kombinasyonlarının hatasızlığına dair bir garanti değildir. Yeni bir HOI4
özelliği eklendiği veya önceki 100 maddelik kapsamın bütünü tamamlandığı iddia edilmez.

## Doğrulama sonucu — 23 Ekim 2026

- Ana otomatik test çalıştırması: **230/230** başarılı. Sonradan eklenen altı
  90 günlük sefer senaryosu ayrıca katı TypeScript derlemesiyle **6/6** başarılı;
  toplam **236 farklı otomatik test** geçti.
- Son üretim paketi üzerinde tarayıcı kontrolleri: savaş **5/5**, genel ekranlar
  **18/18**, toplu emirler **6/6**, worker/kayıt eşzamanlaması **8/8**, harita ve
  liste etkileşimleri **18/18**; toplam **55/55** başarılı. Tarayıcı hata kayıtları
  boş. Eski `e4cfbd1` paketinde üç savaş/geri bildirim regresyonu yeniden üretildi.
- `npm run build` başarılı. Doğrulanan üretim paketi kimliği:
  `60U7iufmL67UT8Rn5B2lc`.
- Yavaş fare tekerleği testinde üç DOM değerinin ayrı zamanlarda okunmasından
  doğan ölçüm yarışı düzeltildi. Gerçek tekerlek olayından 300 ms sonra bütün
  değerler birlikte örnekleniyor; kamera beklentileri gevşetilmedi.
- Masaüstü ve dokunmatik boyutlar Linux Chromium ile sınandı. Fiziksel telefon
  ve Windows donanımı üzerinde performans ölçümü yapılmadı; FPS veya bütün
  cihazlarda sıfır takılma garantisi verilmez. Vercel canlı dağıtımı bu raporda
  doğrulanmış değildir.

## Yeniden çalıştırma

```sh
npm run test:europa
npm run build
npm start
# Playwright ve Chromium bulunan ortamda:
node scripts/test-europa-war-browser.cjs
node scripts/test-europa-browser.cjs
node scripts/test-europa-group-browser.cjs
node scripts/test-europa-worker-browser.cjs
node scripts/test-europa-interactions.cjs
```

Savaş tarayıcı testi yalnızca kullanıcının erişebildiği kayıt içe aktarma,
emir verme, saat, şehir seçimi ve kayıt dışa aktarma akışını kullanır.
Oyuna test için hasar veya kaynak atlatan bir arka kapı eklenmedi.
`EUROPA_BASELINE=1` eski paketteki başarısız senaryoları raporlamak içindir;
normal doğrulamada kullanılmaz.
