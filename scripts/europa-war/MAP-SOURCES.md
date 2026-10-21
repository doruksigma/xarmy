# Europa 1936 harita kaynakları

Ana kaynak: Natural Earth, `ne_110m_admin_0_countries.geojson`.

- Kaynak deposu: https://github.com/nvkelso/natural-earth-vector
- Veri: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
- Lisans: **public domain / kamu malı**. https://www.naturalearthdata.com/about/terms-of-use/
- Natural Earth katkıcıları: Tom Patterson, Nathaniel Vaughn Kelso ve diğer katkıcılar.
- Kullanılan dosyanın SHA-256 değeri üretilen `map-data.json` içindeki `sourceSha256` alanındadır.

Bu kaynak güncel sınır geometrisidir; 1936 sınırlarının tarihsel veri seti değildir.
`generate-map.py` ülke geometrilerini birleştirerek Çekoslovakya, Yugoslavya ve
Avrupa Sovyetler Birliği'ni oluşturur. Polonya, Almanya, Doğu Prusya, Wilno ve
Karelya için elle belirlenmiş yaklaşık alan düzeltmeleri yapar. Bu sınırlar
bir tarih atlasının doğruluk düzeyinde değildir; bazı sınır ayrıntıları eksiktir.
Mikrodevletler, koloniler, Afrika ve Asya cepheleri kapsam dışındadır.

144 bölge, şehir merkezlerine göre geometrik bölümlerdir. Gerçek tarihsel eyalet
ve idarî bölge sınırları olarak sunulmamalıdır. Nehir özelliği, belirli bölgeler
üzerindeki geçiş cezasıdır; coğrafi nehir ağı değildir. Deniz bağlantıları oyun
rotalarıdır; ayrıntılı deniz bölgeleri veya boğaz denetimi simülasyonu değildir.

Harita, dokular, fontlar veya HOI4 oyun dosyaları kopyalanmadı. Harita JSON'u
uygulama paketine dahildir; oyunda harici coğrafi servis veya internet çağrısı yoktur.

Yeniden üretim (yalnızca geliştirme sırasında Python 3 ve Shapely gerekir):

```sh
python3 scripts/europa-war/generate-map.py /path/to/ne_110m_admin_0_countries.geojson
```

Normal `npm run build` bu scripti çalıştırmaz, ağ veya Python gerektirmez.
