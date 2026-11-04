# Dünya 1936 senaryosunun coğrafi kaynakları

`world-scenario.json`, 1 Ocak 1936 için oynanabilir devletleri, bağımlı
yönetimleri, ülke başına şehirleri ve modern kaynak alanlarının hangi yönetime
bağlanacağını açıkça listeler. `generate-world-map.py`, bu listeyi kamu malı
Natural Earth kıyı geometrisiyle birleştirir. Harita oyun paketindedir; oyun
sırasında coğrafi servis, Python veya internet bağlantısı kullanılmaz.

## Kaynak ve kapsam

- Natural Earth `ne_50m_admin_0_countries.geojson`, 242 kaynak alanı.
- Depo: https://github.com/nvkelso/natural-earth-vector
- Veri: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
- Lisans: kamu malı; https://www.naturalearthdata.com/about/terms-of-use/
- Katkıcılar: Tom Patterson, Nathaniel Vaughn Kelso ve diğer Natural Earth katkıcıları.
- Kullanılan kaynak dosyanın SHA-256 değeri:
  `3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb`.
- Antarktika (`ATA`) dışındaki bütün kaynak alanları bir yönetime atanır.
  Güneyde −65°, kuzeyde 85° enlemleri arasındaki dünya kapsanır.
- Küçük adalar ve mikrodevletler gerçek konumlarında tutulur. Ekran altı
  ölçekteki isimsiz kıyı kayalarının bir bölümü çizim maliyetini sınırlamak için
  elenir; hiçbir ülke daha kolay seçilmesi için büyük bir sahte poligona çevrilmez.

## Tarihsel doğruluk sınırları

Natural Earth **güncel kıyı ve sınır geometrisidir**; bu dosya tarihsel 1936
idarî sınırları sağlayan bir atlas değildir. `world-scenario.json` bağımsız
ülkeler, manda yönetimleri, himaye devletleri ve koloniler arasında açık bir
oyun ayrımı yapar. Kanada, Avustralya, Yeni Zelanda ve Güney Afrika ayrı
dominyonlar; Britanya Hindistanı, Malaya, Fransız Hindiçini, Hollanda Doğu
Hint Adaları ve Filipinler bağımlı yönetimler olarak oynanır. Afrika'nın
bağımsız olmayan bölgeleri dönemin yönetici ülkesine bağlıdır.

Mançukuo, Tibet, Sincan, Tannu Tuva, Newfoundland/Labrador, Güney Sahalin,
Kuriller, İspanyol Fas'ı ve Aden için üreticide açıkça görünen **yaklaşık**
alan kesimleri uygulanır. Çin'in savaş ağaları tek tek modellenmez. Süveyş
bölgesi Mısır mülkiyetinde Britanya denetimiyle başlar. Panama Kanal Bölgesi
ABD'nin ayrı küçük bölgesidir. Cebelitarık mevcut İspanya geometrisinden
yerel bir kıyı kesimiyle ayrılır. Bu çizgiler kesin ölçülmüş tarihsel sınır
olarak sunulmamalıdır; bazı küçük uluslararası yönetimler ayrı devlet değildir.

Şehir bölgeleri şehir noktaları etrafındaki geometrik kontrol alanlarıdır;
gerçek tarihsel vilayet sınırları değildir. Tarihsel nüfus ve sanayi değerleri
oyun ölçeğinde yaklaşık başlangıç değerleridir. Deniz kenarları, limanlar,
kaynaklar ve arazi türleri stratejik oynanış için basitleştirilmiştir.

## Eski Avrupa kayıtları

`europe-1936-base.json` önceki 447 bölgeli Avrupa geometrisinin değişmez
kopyasıdır. Eski bölge kimlikleri ve aralarındaki bağlantılar korunur.
Koordinatlar yalnızca `(2325, 286)` kadar taşınır; eski yürüyüş mesafesi
ölçeği değişmez. İzlanda'nın yeni senaryo kimliği `iceland` olurken
`denmark-2` ve `denmark-city-3` bölge kimlikleri korunur. Kayıt taşıma kodu
eski oyuncu mülkiyetini korur; yeni kampanyalar 1936 başlangıcını kullanır.

Dünya izdüşümü: `x = (boylam + 180) × 15`,
`y = (85 − enlem) × 22`; boyut `5400 × 3300`.

## Yeniden üretim

Python 3 ve Shapely 2 gerekir. Kaynak veriyi yukarıdaki adresten geliştirme
ortamına indirdikten sonra:

```sh
python3 scripts/europa-war/generate-world-map.py \
  /path/to/ne_50m_admin_0_countries.geojson \
  /path/to/world-map-data.json
```

Üretici ülke/bölge kimliklerini, başkentleri, eski bağlantıların korunmasını,
çift yönlü komşuluğu, kaynak kapsamını, sınırları ve bölge çakışmalarını
doğrular. Aynı dizine `world-map-data-report.json` yazar. Bu rapor veri
özetini, kaynak ve çıktı özetlerini, bağımlı devletleri ve çizim nokta sayısını
içerir. Normal uygulama derlemesi üreticiyi çalıştırmaz.

Harita, doku veya model üretiminde HOI4 oyun dosyaları kullanılmaz.
