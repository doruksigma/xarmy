# Europa War 3D harita geometrisi

Bu katman mevcut `map-data.json` dosyasındaki 447 Avrupa hareket bölgesinin
SVG çokgenlerini gerçek, yüksekliği değişen Three.js üçgen geometrisine
çevirir. Yeni tarihsel sınır veya dünya atlası üretmez. Mevcut harita verisinin
tarihsel doğruluk sınırları 3D görünüm için de geçerlidir.

Kabartı, haritada dağ olarak işaretli bölgelerden türeyen, yumuşak geçişli
**prosedürel stratejik arazi gösterimidir**. Ölçülmüş yükseklik verisi (DEM),
uydu görüntüsü veya gerçek yükseklik ölçeği değildir. Aynı coğrafyada her
sefer aynı kabartı oluşturulur; kampanyanın rastgele sayı üreteci kullanılmaz.
Savaşın arazi etkileri mevcut simülasyon verisinden hesaplanır.

## Geometri ve seçim

- Kaynaktaki `M/L/Z` SVG halkaları aynen okunur; çok parçalı adalar, delikler
  ve delik içindeki adalar geometrik iç içelikle ayrılır. Desteklenmeyen eğri
  komutları sessizce farklı sınır üretmek yerine hata verir.
- Three.js `ShapeUtils.triangulateShape` ile üçgenlenen yüzey, uzun kenarları
  bölünerek yükseltilir. Bütün bölgeler aynı sürekli yükseklik alanını kullanır.
- Kara tek birleşik, indekssiz `BufferGeometry` içinde çizilir. Her üçgenin
  bölge kimliği ve her bölgenin köşe aralığı saklanır. Raycaster'ın gördüğü
  üçgen doğrudan seçilecek hareket bölgesini verir.
- Köşelerdeki `terrainType` özniteliği özgün kartografik shader'a orman,
  bataklık, çöl ve diğer arazi türlerini bildirir. Yüzey taramaları oynanış
  için yeni arazi oluşturmaz; kaynak türlerini görselleştirir.
- Ülke kontrolü veya harita modu değişince yalnız köşe renkleri değişir;
  arazi geometrisi yeniden kurulmaz. Sınır ve seçili bölge çizgileri aynı
  yükseklik fonksiyonunu kullanır.
- Varsayılan 16 birim kenar sınırı: **36.768 kara üçgeni, 110.304 köşe,
  33.862 sınır çizgisi köşesi**. En fazla 150.000 kara üçgenine izin verilir.
  Daha büyük kenar eşiği daha az üçgen üretir; coğrafi sınırları ve simülasyonu
  değiştirmez. Bu sayılar mevcut 447 bölgeli veri paketi içindir.
- Yükseltilmiş kara kenarını denize bağlayan ayrı kaya yüzeyi mevcut ülke
  konturlarından oluşturulur: 22.074 ek üçgen. Su düzlemi `y = −0,4` seviyesindedir.
  Bu yüzey kara tıklamasına katılmaz; ülke içindeki gömülü yüzler oyun sınırı
  veya hareket engeli oluşturmaz.
- Güncel siyasi sınır ve cephe çizimi ayrı, tek çizim çağrılı birleşik
  şerit geometrisidir. Aynı ülkenin iç eyalet çizgileriyle kıyılar ayrılır;
  savaş/kontrol değişimi bu katmanı yeniler, saat ve birlik hareketi yenilemez.
  Düz arazi kıyıları yaklaşık birim yüksekliğe indirilmiştir; dağ kabartısı
  korunur. Bütün model yerleşimleri yeni gerçek yüzeyden tekrar örneklenir.

## API

`strategy/map3d-geometry.ts` şu işlevleri sunar:

- `buildTerrain({ maxEdge })`: kara ve sınır geometrisi, bölge köşe aralıkları,
  üçgenlerin bölge kimlikleri ve kaynak temizleme işlevi.
- `heightAt(mapX, mapY)`: harita koordinatından deterministik arazi yüksekliği.
- `colorTerrain(terrain, provinceId, color)`: bir bölgenin rengini güncelleme.
- `provinceOutline(provinceId, lift)`: seçili bölgenin yükseltilmiş sınırı.
- `containsProvincePoint(provinceId, mapX, mapY)`: bina gibi görsel unsurları
  ilgili kara çokgeninin içine yerleştirmek için nokta kontrolü.

Dünya koordinatları `x = haritaX − 660`, `z = haritaY − 440`,
`y = heightAt(haritaX, haritaY)` şeklindedir.

## Kontroller

Altı geometri testi; bütün bölge aralıklarını, sonlu koordinatları, görünür
üçgenlerin gerçekten kendi bölgelerinde kalmasını, gerçek raycaster seçimini,
deniz boşluğunu, delik/ada alanlarını, renk güncellemesinin başka bölgeyi
etkilememesini ve tekrar üretimde deterministik sonucu denetler. Kalite
azaltıldığında üçgen sayısı düşer; bölge kimlikleri ve sınır yükseklikleri korunur.
Bu kontroller tek başına cihaz FPS ölçümü değildir.
