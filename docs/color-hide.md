# Color Hide 3D

Yeni oyun adresi: `/games/color-hide`. Ana sayfada ayrı oyun kartı bulunur.
Mevcut satranç, Battle Royale ve Europa War kodlarına bağımlı değildir.

## Bu sürüm

- Gerçek WebSocket bağlantısıyla oda oluşturma, altı karakterli kodla katılma,
  2–5 oyuncu, oyuncu adı ve üç karakter seçimi.
- Orman, şehir ve okul: ortak sunucu/istemci çarpışma verileriyle özgün Three.js
  haritaları, geçilebilir kapılar, odalar, saklanılabilir çalılar ve siperler.
- Oyuncu başına bir harita oyu; eşitlikte rastgele seçim. Herkes hazır olduğunda
  oda sahibi turu başlatır. İlk ebe sunucudaki kriptografik rastgele seçimle,
  bütün katılımcılara eşit olasılık verilerek belirlenir; ekranda zar animasyonu vardır.
- 60 saniye saklanma. Baş, gövde ve bacaklar ayrı boyanabilir. Ebe siyah ekranda
  bekler; sunucu diğer oyuncuların konumlarını ve bakışlarını bu oyuncuya göndermez.
- 10 dakika arama. Sunucu hareketi, duvarları, atış yönünü, menzili, şarjörü,
  yeniden doldurmayı, yakalamayı ve kazananı belirler. Yakalanan oyuncu ebe olur;
  ebeler birbirini yakalayamaz. Aynı oyuncuya ikinci yakalama yazılmaz.
- Tur sonu, sağ kalanlar, yakalama/saklanma istatistikleri, konfeti ve ses.
  Tekrar oynama lobiye döner; harita yeniden oylanır ve ebe yeniden seçilir.
- Bağlantı kesilince 20 saniye geri bağlanma hakkı; oda sahipliği aktarımı,
  oyuncu ayrılması ve ebe kalmaması durumlarının yönetimi.

Oyuncak odası, fabrika, kar, çöl, lunapark, dev mutfak ve uzay istasyonu bu
ilk üç haritalı sürüme dahil değildir. Harita menüsünde çalışmayan seçenekler yoktur.

## Kontroller

| İşlem          | Bilgisayar                                                               | Telefon                  |
| -------------- | ------------------------------------------------------------------------ | ------------------------ |
| Hareket        | WASD                                                                     | Sol yön tuşları          |
| Bakış          | Sahneye tıkla, fareyi hareket ettir; sağ tuşla sürükle de kullanılabilir | Sahneyi sürükle          |
| Koşma          | Shift basılı                                                             | Koş basılı               |
| Zıplama        | Boşluk                                                                   | Zıpla                    |
| Eğilme/kalkma  | C                                                                        | Eğil / Kalk              |
| Kamera         | V veya kamera düğmesi                                                    | Kamera düğmesi           |
| Ateş           | Fare kilitliyken sol tık                                                 | Ateş düğmesi             |
| Doldurma       | R                                                                        | Doldur                   |
| Boyama         | Saklanma sırasında Boyan                                                 | Saklanma sırasında Boyan |
| Fareyi bırakma | Esc                                                                      | Gerekmez                 |

Boyama 60 saniyenin sonunda kilitlenir; seçilen kamuflaj tur sonuna kadar kalır.
Tur sırasında çıkış düğmesi odadan ayrılır. Aynı sekmede sayfayı yenilemek kısa
yeniden bağlanma aralığında oyuncuyu geri getirir. Oyun oturumları kalıcı hesap değildir.

## Grafik ve performans

Statik sahne parçaları materyallere göre birleştirilir. Geometri ve materyaller
paylaşılır; mobilde piksel oranı ve gölgeler düşürülür. Akıcı mod çizimi en fazla
30 kare/saniye ile sınırlar; bu bir ölçülmüş FPS garantisi değildir. Detaylı
mod tarayıcının çizim hızını kullanır. Oyuncular 10 Hz sunucu durumları arasında yumuşatılır;
20 Hz hareket simülasyonu sunucudadır. Gizli sekmede çizim/hareket girişi durur.
Odayı kapatma sırasında çizim döngüsü, GPU kaynakları ve olay dinleyicileri temizlenir.

Karakterler, çevre, silah ve sesler kodla oluşturulmuş özgün stilize varlıklardır.
Harici ücretli model veya doku gerektirmez. Fiziksel telefon/Windows donanımında
FPS garantisi verilmez; gecikme sunucu bölgesine ve bağlantıya bağlıdır.

## Sunucuyu açma ve test

[Ücretsiz sunucu ve Vercel kurulumu](color-hide-server.md).
Render servisi oluşturulup Vercel'e adresi eklenmeden canlı sitede online odalar
açılamaz. Yapılandırılmamış istemci yerel/sahte oda oluşturarak bunu gizlemez.

```sh
npm run test:color-hide
npm run color-hide:server
# Ayrı terminal:
npm run dev
# Playwright/Chromium olan ortamda:
node scripts/test-color-hide-browser.cjs
```

Motor/sunucu testleri zaman ve kuralları kontrollü saatle; tarayıcı senaryosu
ise farklı gerçek istemciler, gerçek WebSocket bağlantısı ve normal oyun
kontrolleriyle doğrular. Üretim ağına konum veya zaman değiştiren test uç noktası eklenmez.

Motor, harita, nişan ve gerçek WebSocket testleri: **39/39 başarılı**.
Mevcut oyunların regresyon testleri: satranç **95/95**, Battle Royale **21/21**,
Europa War **257/257**. Üretim Next.js derlemesi ve ayrı sunucu derlemesi başarılı.
Çoklu oyuncudan gelen sıfır zamanlı komutların zıplamayı tüketmesi ve üçüncü
şahıs nişangâhının yakın hedeflerde sapması için özel regresyonlar bulunur.

Chromium tarayıcı kontrolleri ayrı koşularda yapıldı:

- Beş bağımsız istemcide oda kapasitesi, eşit ebe seçimi sonucunun paylaşılması,
  gerçek 60 saniyelik karartma, hareket/boyama senkronizasyonu, mobil hareket,
  eğilme/zıplama, kamera, yakalama ve şarjör doldurma kontrolleri geçti.
- Bağlantı yenileme sonrası bakış/hareket yönünü koruma ve dokunmatik ateşle
  turu kazanma: **2/2** başarılı.
- Fare kilidinde sağ tıklama, son yakalama/zafer, otomatik fare bırakma/tekrar
  oynama, şehir ve okul oylaması/çizimi/ayrılma: **5/5** başarılı; bu son
  koşuda tarayıcı çalışma zamanı hatası yok.

Genel beş istemcili tarayıcı senaryosu tek koşuda baştan sona tamamlanmış olarak
raporlanmaz. Bu koşunun bulduğu fare kilidi hataları düzeltildikten sonra ilgili
akışlar yukarıdaki ayrı kontrollerle yeniden doğrulandı. Mobil kontroller Chromium
dokunmatik emülasyonunda denendi; fiziksel telefonlarda ayrıca kontrol edilmelidir.

Odaklı tarayıcı kontrolleri aynı sunucu/istemci kurulumunda tekrar çalıştırılabilir:

```sh
COLOR_HIDE_RESUME_ONLY=1 node scripts/test-color-hide-browser.cjs
COLOR_HIDE_END_ONLY=1 node scripts/test-color-hide-browser.cjs
```
