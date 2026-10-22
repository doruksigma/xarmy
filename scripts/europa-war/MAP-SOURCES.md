# Europa 1936 harita kaynakları

Ana kaynak: Natural Earth, `ne_50m_admin_0_countries.geojson`.

- Kaynak deposu: https://github.com/nvkelso/natural-earth-vector
- Veri: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
- Lisans: **public domain / kamu malı**. https://www.naturalearthdata.com/about/terms-of-use/
- Natural Earth katkıcıları: Tom Patterson, Nathaniel Vaughn Kelso ve diğer katkıcılar.
- Kullanılan dosyanın SHA-256 değeri üretilen `map-data.json` içindeki `sourceSha256` alanındadır.

Bu kaynak güncel sınır geometrisidir; 1936 sınırlarının tarihsel veri seti değildir.
`generate-map.py` ülke geometrilerini birleştirerek Çekoslovakya, Yugoslavya ve
Avrupa Sovyetler Birliği'ni oluşturur. Polonya, Almanya, Doğu Prusya, Wilno ve
Karelya için elle belirlenmiş yaklaşık alan düzeltmeleri yapar. Bu sınırlar
bir tarih atlasının doğruluk düzeyinde değildir; bazı sınır ayrıntıları eksiktir.
Mikrodevletler, koloniler, Afrika ve Asya cepheleri kapsam dışındadır.

447 şehir bölgesi, şehir merkezlerine göre geometrik bölümlerdir. Gerçek tarihsel eyalet
ve idarî bölge sınırları olarak sunulmamalıdır. Nehir özelliği, belirli bölgeler
üzerindeki geçiş cezasıdır; coğrafi nehir ağı değildir. Deniz bağlantıları oyun
rotalarıdır. Beş geniş deniz havzası, İstanbul ve Danimarka geçitlerinin mevcut
denetimiyle çalışan geçiş denetimi vardır; tam küresel deniz coğrafyası değildir.

Harita, dokular, fontlar veya HOI4 oyun dosyaları kopyalanmadı. Harita JSON'u
uygulama paketine dahildir; oyunda harici coğrafi servis veya internet çağrısı yoktur.

Yeniden üretim (yalnızca geliştirme sırasında Python 3 ve Shapely gerekir):

```sh
python3 scripts/europa-war/generate-map.py /path/to/ne_50m_admin_0_countries.geojson
```

Normal `npm run build` bu scripti çalıştırmaz, ağ veya Python gerektirmez.

## İkinci sürüm

`scenario-topology.json`, eski 144 bölgenin kimliklerini, limanlarını ve deniz
bağlantılarını tanımlar. `urban-centers.json`, 303 ek şehrin elle derlenmiş
ad/boylam/enlem noktalarını içerir. Üretici her eski bölgeyi bu şehirler etrafında
böler; sonuçta **447 bağımsız sınır ve kontrol bölgesi** oluşur. Kara komşuluğu
yeni poligonlardan hesaplanır; eski kenarlar aradaki şehirleri atlayan kestirmeler
oluşturmaz. Kopuk adalar açıkça deniz bağlantısı alır.

Yaklaşık 1936 ülke çizgisinin dışında kalan merkezler en yakın ilgili bölgenin
içine taşınır; bu yüzden her nokta kesin tarihsel koordinat iddiası taşımaz.
Nüfus, fabrika ve kaynak toplamları bölüştürülerek korunur. Yeni şehirler otomatik
başkent tesisi veya liman almaz; ayrı adalarda gereken deniz bağlantıları hariçtir.
Harita yakınlaştırıldıkça şehir sınırları/adları görünür; her şehir aranabilir,
seçilebilir, tahkim edilebilir ve ayrı ele geçirilebilir.

`legacyRegion` alanı eski 144 bölgeli kayıtları taşımak içindir. Mülkiyet ve
kontrol alt şehirlere aktarılır; toplam sanayi korunur. Artık komşu olmayan eski
hareket/cephe emirleri silinir ve kayıt yüklenirken bildirim gösterilir.
