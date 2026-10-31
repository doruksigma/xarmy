# Battle Royale çevre ayrıntıları — Ekim 2026

Bu güncelleme mevcut arazi, bina içleri, PBR aydınlatma ve çatışma sisteminin
üzerine çevre ayrıntısı ekler. Oyun kuralları veya haritanın engelleri değişmez.

- Kasaba binalarında üç boyutlu panjurlar ve yağmur boruları bulunur. Kasaba,
  köy, üs ve fabrika için Türkçe tabelalar tek bir yerel doku atlasını paylaşır;
  her tabela ayrı bir doku veya çizim çağrısı oluşturmaz.
- Asfaltta taş agregası ve ince çatlaklar; metal ve boyalı metalde çizik ve
  fırçalama izleri renk, normal ve pürüzlülük haritalarıyla görünür.
- Ağaç diplerinde eğimli yaprak geometrili eğrelti otları ve küçük taşlar,
  göl kıyısında sazlar bulunur. Bitkiler mevcut rüzgâr hareketine katılır.
- Yeni yer örtüsü 100 metrelik hücrelerde instancing kullanır. Kalite ayarı
  yoğunluğu değiştirir; uzak ve havadan bakışta gereksiz ayrıntılar gizlenir.
  Görünürlük değerlendirmesi saniyede en fazla beş kez yapılır.
- Dekorasyonun ayrı rastgele sayı üreteci vardır. Aynı maç tohumu için mevcut
  engel, ganimet ve doğma yerlerinin sırası korunur.

Ek yüzey haritaları en fazla 512 × 512, tabela atlası 1024 × 512 pikseldir.
Geometri, doku ve instancing kaynakları maç kapanınca temizlenir. Yeni bitkiler
gölge haritasına ek çizim yapmaz; düşük ayarda gölge alımı da kapanır.

Varlıklar özgün olarak kodla üretilir; harici model veya internetten yüklenen
doku gerektirmez. Bu, AAA kalite veya belirli bir cihazda FPS garantisi değildir.

Doğrulama: `npx tsc --noEmit`, `npm run test:battle` ve üretim derlemesi.
Görsel değerlendirme gerçek oyun kamerasından yapılmalıdır; yazılımsal WebGL
çizimi fiziksel ekran kartı veya telefon performansını temsil etmez.
