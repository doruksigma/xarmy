# Dot Front — büyük haritalar ve komutan grupları

Oyun adresi **`/games/dot-front`**. Oyun mevcut Next.js / React / TypeScript uygulamasının istemci bileşeninde, HTML5 Canvas ile çalışır. Simülasyon kullanıcının tarayıcısındadır; oyun sunucusu, üyelik, çok oyunculu mod veya harici yapay zekâ hizmeti kullanılmaz.

## Bu sürümün oynanışı

- Altı harita bulunur: Açık Ova, Yeşil Hat, Kızıl Vadi, Dağ Geçitleri, Çifte Cephe ve Merkez Üs. Haritalar **144 × 90 hücredir**; önceki 48 × 30 haritaların her eksende üç katı büyüklüğündedir.
- Her haritada **50 şehir** vardır. Oyuncu ve yapay zekâ maça **25'er şehirle** başlar; başlangıçta tarafsız şehir yoktur. Şehirlerin ele geçirilmesi, üretimi ve ikmal katkısı sahiplik değiştikçe güncellenir.
- Her tarafın başlangıç ordusu **25 hafif askerdir**. Askerler **10 + 10 + 5** kişilik üç komutan grubuna ayrılır. Bir komutan grubu en fazla 10 yaşayan asker içerir; lider de bu grubun gerçek bir askeridir.
- Ordular maça arka şehirlerde değil, kendi taraflarındaki **sınır hattında** başlar. Komutan veya asker seçimi bütün mangayı seçer. Komutan kartı kamerayı o mangaya taşır. Yeni asker en yakın boş yeri olan komutana katılıp yanına yürür; bütün komutanlar doluysa yeni komutan kurulur. Lider düşerse yaşayan bir üye komutayı devralır.
- **Otomatik Sınır** seçeneği mangayı kendi tarafındaki cepheye götürür. Ele geçirilen şehirler sınır hedefini değiştirir. Elle hareket, saldırı veya konum koruma emri otomatik sınır seçeneğini kapatır; kullanıcı yeniden açabilir.
- Komutan grupları hareket, saldırı ve konumu koruma emirlerini taşır. Otomatik cephe davranışı, grubun emri ve bir sonraki karar zamanı maç kaydının parçasıdır. Askerler yine ayrı konum, can, saldırı bekleme süresi ve yola sahip oyun varlıklarıdır.
- Sahip olunan şehirler başlangıçtan itibaren otomatik ve tekrarlı üretim yapar. Bir üretim yuvası **10 saniyede** bir asker tamamlar; hafif ve ağır türlerin üretim süresi aynıdır. İkmal yetersizse üretim bekler.
- Her şehir **5 ikmal** verir. Başlangıç kapasitesi takım başına **125**, bütün haritanın toplam kapasitesi **250** puandır. Hafif asker 1, ağır asker 2 puan kullanır. Şehir kaybıyla kapasite aşılırsa 15 saniyelik toparlanma süresinden sonra kararlı biçimde seçilen fazla birlikler can kaybeder.
- Açık alan, orman, geçilemez dağ/kaya, su ve köprüler hareketi etkiler. Ağır birlikler ormanda daha çok yavaşlar. Yol bulma seçili haritayı kullanır; geçilemez köşelerden hareket ve dağların arkasından ateş engellenir.
- Zafer için rakibin hem yaşayan ordusunun hem şehirlerinin kalmaması gerekir. Şehirsiz bir ordu şehir ele geçirerek mücadeleye devam edebilir; aynı adımda iki taraf tamamen yok olursa sonuç beraberliktir.

## Mevcut sitenin korunması

İlk inceleme revizyonu: `8a896ce019a8cbde5f39ba7622ae954b3ebe04d6`.

Dot Front'un mevcut kartı ve rotası kullanılır. Yeni bir ana sayfa, ikinci oyun rotası veya iframe eklenmez. Bu görevdeki kaynak değişiklikleri `app/games/dot-front/`, Dot Front test çalıştırıcısı ve bu belgeyle sınırlıdır. Ortak site yerleşimi, diğer oyunların kaynakları ve servisleri, oyun listeleri ve dağıtım ayarları bu oyun için değiştirilmez.

## Kayıt sürümü ve eski maçlar

Yeni maç şeması **sürüm 2**'dir. Büyük haritalar, yeni şehir yerleşimleri ve komutan üyelikleri nedeniyle sürüm 1 maçları bu simülasyonda güvenilir biçimde sürdürülemez. Eski bir maç bulunduğunda `Devam Et` için kabul edilmez; kullanıcıya yeni maç başlatması gerektiği bildirilir. Eski ordu ve şehirler yeni haritaya sessizce taşınmaz.

Depolama adları korunur:

- IndexedDB veritabanı: `xarmy:dot-front:matches`, nesne deposu: `data`.
- Güncel maç anahtarı: `current`.
- Tamamlanmış maç istatistikleri: aynı nesne deposundaki `result:*` anahtarları.
- Ayarlar: localStorage içindeki `xarmy:dot-front:settings`.

Sürüm doğrulaması eski kaydı veya istatistikleri silmez. Yeni bir maçın kaydedilmesi yalnızca güncel maç alanını değiştirir; önceki sonuç kayıtları ve ayarlar korunur. Ayarlarda harita alanı bulunmuyorsa önceki tercih olan Kızıl Vadi seçilir; ilk kez oynayanlar Açık Ova ile başlar. Bu tercih uyumluluğu, eski maçın yeni haritaya dönüştürüldüğü anlamına gelmez.

Sürüm 2 kaydında harita ve zorluk, askerlerin konumu/canı/türü/emri/yolu, şehir sahipliği, üretim ve ele geçirme ilerlemesi, toplanma noktaları, ikmal ve saldırı zamanlayıcıları, maç süresi, komutan kimlikleri, liderler, üyelikler, grup emirleri, otomatik cephe seçeneği ve karar zamanları saklanır. Her asker tam bir komutan grubuna ait olmalı; grubun lideri ve bütün üyeleri aynı takımdan olmalıdır. Bozuk kimlikler, 10 kişiyi aşan gruplar, geçilemez konumlar ve seçili haritaya uymayan şehir dizileri reddedilir.

Kayıt yaklaşık 15 saniyede bir ve sekme gizlendiğinde alınır. Sekme değişimi maçı duraklatır; dönüşte birikmiş süre simülasyona uygulanmaz. IndexedDB açılışı ve işlemleri için zaman aşımı bulunur. Depolama kullanılamasa da maç oynanabilir; kayıt hatası arayüzde bildirilir. Sonuçlar maç kimliğiyle tekrar sayılmayacak şekilde saklanır.

## Çalıştırma ve kontroller

Mevcut projenin Node.js 24 gereksinimi ve npm kilit dosyası kullanılır. Dot Front için yeni çalışma zamanı bağımlılığı gerekmez.

```sh
npm ci
npm run dev
npm run test:dot-front
npm exec tsc -- --noEmit --incremental false
npm run build
npm start
```

Dot Front test komutu, oyun klasöründeki bütün `*.test.ts` dosyalarını derleyip çalıştırır. Testler harita erişilebilirliğini, hareketi, savaş ve ele geçirmeyi, üretim/ikmali, komutan gruplarını, kayıt doğrulamasını, altı haritada deterministik kayıt dönüşünü, sürüm 1'in güvenli reddini ve depolama hatalarını kapsar. Kayıt testleri IndexedDB ve localStorage için denetimli taklitler kullanır; gerçek tarayıcı depolama testi yerine geçmez.

Bu sürümün doğrulama sonuçları:

- `npm run test:dot-front`: **71 test başarılı**. Altı haritadaki AI simülasyonları 60–180 saniyeyi kapsar; iki ordunun çatışması ve şehir ele geçirme doğrulanır.
- Tüm proje TypeScript kontrolü ve `npm run build`: başarılı. Dot Front rotası üretim derlemesinde 21,7 kB, ilk yükleme 128 kB olarak raporlandı.
- Yerel üretim çıktısı, gerçek Chromium motorunda 1440 piksel masaüstü ve 390 piksel dokunmatik telefon benzetimiyle kontrol edildi: başlangıç şehir/asker sayıları, komutan seçimi, hareket, otomatik sınır, 10 saniyelik üretim, gerçek IndexedDB kaydından devam, duraklatma, teslim olma ve tekrar oynama geçti. Bu akışlarda yakalanan JavaScript hatası yoktu; sayfa yatay taşmadı.
- 768 piksel tablet benzetiminde 2× hızla 47 saniyelik simülasyona ulaşıldı: 209 yaşayan asker ve 22 komutan vardı, sayfa taşmadı ve yakalanan JavaScript hatası olmadı. Son 2,5 saniyelik örneklemde ortalama kare aralığı 16,67 ms ölçüldü; bu sunucudaki Chromium ölçümü fiziksel cihaz performansı garantisi değildir.
- Önceki yayın revizyonu `297e924` ile karşılaştırmada Dot Front klasörü ve bu belge dışındaki **451 mevcut dosyada değişiklik yok**.

Telefon/tablet benzetimi fiziksel cihaz testi değildir. Gerçek telefon/tablet, ses, tam ekran ve uzun maçların insan oynanışıyla dengesi doğrulanmış sayılmaz. Önceki sürümdeki diğer oyun testleri bu sürümde tekrar çalıştırılmadı; bu oyunların kaynakları değişmedi.

## Yayına alma

Bu teslim bir **Next.js kaynak güncellemesidir**. Yeni bir statik ana sayfayı mevcut sitenin üzerine kopyalamayın. Mevcut depodaki değişiklikleri inceleyip normal `npm run build` ve barındırma akışını kullanın. Sitenin çevre değişkenleri, barındırma bağlantıları ve diğer oyun servisleri korunmalıdır.
