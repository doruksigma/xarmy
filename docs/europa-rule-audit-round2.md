# Europa War mekanik denetimi — ikinci tur

Bu denetim, mevcut tek oyunculu oyunun çalışan kurallarını inceler. Harita,
arayüz ve kayıt performansı ayrı çalışmada ölçülür. Önceki 100 maddelik
isteğin sınırları [ilk denetimde](europa-war-audit.md) geçerliliğini korur;
bu rapor bütün tarihsel senaryoların veya HOI4 ayrıntı düzeyinin tamamlandığı
anlamına gelmez.

## Düzeltilen işlevler

- Toplu bombardıman emrinde hedefe yalnızca avcılar erişebiliyorsa oyun bunu
  başarılı bombardıman sayıyordu. Avcıların eskort görevi artık istenen ana
  görevin yerine geçmez; uygun bombardıman kanadı ulaşamıyorsa emir açıklamayla
  reddedilir ve önceki uçuş emirleri korunur.
- Stratejik bombardıman uçakları kara desteği yapamamasına rağmen genel destek
  emrinin uçak koşulunu karşılıyordu. Kontrol artık uçak modelinin gerçekten
  yapabildiği göreve bakar.
- Denizaltı intikaldeyken yalnızca yüzey gemilerine eskort verilmesi, başarılı
  konvoy baskını sayılıyordu. Baskın için en az bir denizaltının emri alması
  gerekir; intikal tamamlandığında baskın ve eskort birlikte atanabilir.
- İkmalsizlikten yıpranan birlikler çatışmadan tecrübe kazanıyor ve generallerini
  terfi ettirebiliyordu. Yıpranma hâlâ asker/organizasyon kaybı yaratır; savaş
  tecrübesi ve komutan tecrübesi yalnızca gerçek muharebede kazanılır.
- İki araştırma odağının ayrı ayrı ek yuva vaat eden açıklamaları düzeltildi.
  Mevcut kural korunur: iki odak da hız bonusu verir; ortak ek yuva ilk
  tamamlananla açılır ve ülkeye göre toplam üst sınır üçtür.

Yeni `audit-orders.test.ts` senaryoları başarısız emirlerin kaynakları ve eski
emirleri değiştirmediğini; başarılı hava görevinin gerçek destek/üstünlük gücü
üretip yakıt tükettiğini; denizaltının intikalden sonra baskına başladığını
ve yıpranmanın muharebe tecrübesi vermediğini kontrol eder.

## Test sonucu

- `npm run test:europa`: **183/183 geçti**, başarısız veya atlanan test yok.
  Komut önce testleri ve bağlı motor modüllerini TypeScript strict modunda
  derledi; mevcut motor, simülasyon, çevrimdışı paket ve kayıt testlerini de
  çalıştırdı.
- Yeni altı mekanik testi ayrı çalıştırıldığında **6/6 geçti**. Aynı testler
  `d625982` sürümünün hava/deniz, operasyon ve kara savaşı kodlarıyla
  çalıştırıldığında dört hata senaryosu başarısız, iki olumlu kontrol başarılı
  oldu. Böylece regresyonların önceki hataları gerçekten yakaladığı doğrulandı.
- Araştırma odaklarının değişikliği açıklama düzeyindedir; yuva kuralları veya
  kayıt şeması genişletilmedi.

## Kontrol kapsamı

| Sistem                | Doğrulanan temel davranışlar                                                                                                        | Kapsam sınırı                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Harita ve kara ordusu | 447 ayrı şehir, komşuluk, grup hareketi, tüm birliklere hasar, geri çekilme, ikmal ve teslimiyet                                    | Tarihsel idarî sınırlar yaklaşık; her ülke/cephe için denge çalışması yapılmadı.                 |
| Ekonomi ve üretim     | 13 yapı, 17 ekipman hattı, 10 birlik türü, kaynak tüketimi, eğitim/inşaat süreleri, ticaret ve seferberlik                          | Bütün tesis/teknoloji birleşimleri ayrı ayrı oynanmadı.                                          |
| Diplomasi ve barış    | Gerekçe, savaş, savunma ittifakı, pakt, tek yönlü geçiş, ambargo, yardım, ateşkes, katkı/sıra/bütçe kullanan konferans, bağımsızlık | Çok taraflı bütün kombinasyonlar sınanmadı; küresel diplomasi simülasyonu değil.                 |
| Araştırma ve siyaset  | Önkoşullar, araştırma tamamlanması ve açılışlar, kabine, karar maliyeti/bekleme süresi, siyasi reform, odak etkileri ve iç savaş    | Her ülkeye özel kapsamlı olay/odak ağacı ve bütün tarihsel lider değişimleri mevcut değil.       |
| Hava ve deniz         | Kanat/gemi kurma, üs/menzil/model kısıtları, yakıt, bombardıman, üstünlük, hava indirme, boğaz, intikal, onarım, konvoy/eskort      | Günlük bölgesel model kullanılır; bütün görev birleşimleri ayrı muharebede denenmedi.            |
| Casusluk              | Teşkilat, ajan eğitimi, karşı casusluk, şifreleme etkisi ve yedi operasyon türünün sonuçları                                        | Yakalanma oranları için geniş istatistiksel denge testi yok.                                     |
| AI ve sefer bütünlüğü | Üretim/araştırma/askerî kararlar kaynak ve ikmal kurallarına bağlı; tarihsel uzun sefer ve kayıt geçerliliği denetimi               | Her AI kararının en iyi strateji olduğu veya her zorluk/ülkenin eşit dengelendiği iddia edilmez. |

Motor testleri `npm run test:europa` ile çalışır. Tarayıcıyla doğrulama,
üretim derlemesi üzerinde ayrı test paketleriyle yapılır; yalnızca motor
testi geçmesi ekranın veya yayındaki sürümün doğrulandığı anlamına gelmez.
