# Color Hide 3D görsel geliştirmeleri

Bu aşama mevcut orman, şehir ve okul haritalarını geliştirir; yeni harita veya
farklı yakalama kuralları eklemez. Bütün görseller projede kodla oluşturulur.

- Ahşap, taş, duvar ve kumaş için paylaşılan 256 × 256 renk ve yüzey kabartma
  dokuları. Renk değiştiren karakter parçaları aynı boya değerlerini kullanır.
- Renk geçişli gökyüzü, güneş diski ve detaylı modda yavaş hareket eden bulutlar.
  Bulutlar tek instanced çizimde 35 küçük parçadan oluşur. Akıcı modda kapalıdır;
  oyun alanının üstünde oldukları için saklanma veya atış sonuçlarını etkilemezler.
- Pencerelerde çerçeve/söve, duvar alt kuşakları, sınıflarda yazılı tahtalar,
  şehirde kaldırım derzleri ve gider kapakları, otomobil jantları.
- Orman patikalarında 160 düz yaprak detayı; bu parçalar ayağın altında kalır ve
  ek siper oluşturmaz. Statik yüzeyler malzemeye göre birleştirilir.
- Boyanabilir çanta kapakları, askılar, yüz ayrıntıları ve kumaş dokulu karakterler.

Sunucunun ortak çarpışma haritası değiştirilmez. Süreler, gizli konumların
gönderilmemesi, hareket, atış ve kazanan kararı sunucuda kalır. Yeni atmosfer
kaynakları oda kapanırken temizlenir; yüzey dokuları karakterler arasında
aynı sahne içinde paylaşılır. Sahne yeniden açıldığında kaynaklar yeniden
oluşturulur. Yeni gölge ışığı eklenmez.

Sahne API'si ses kapatma ve 0,4–2,0 arası bakış hassasiyeti ayarlarını destekler.
Ses kapalıyken ses bağlamı oluşturulmaz; açık bağlam askıya alınır. Sesi açtıktan
sonraki kullanıcı dokunuşu tarayıcı sesini yeniden etkinleştirir.

Bu geliştirme fotogerçekçi veya AAA kalitede hazır model paketi değildir;
stilize Three.js sahnesidir. Gerçek telefon/ekran kartı için FPS garantisi yoktur.
`tsc --noEmit` kontrolü geçti; üretim ekranı ve çok oyunculu kontrol sonuçları
[ana doğrulama raporunda](visual-upgrade.md) bulunur.
