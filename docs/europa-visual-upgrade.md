# Europa War: harita okunabilirliği

Bu güncelleme savaş kurallarını ve kayıt dosyalarını değiştirmez. Haritada
verilen emirlerin durumunu okumayı kolaylaştırır.

- **Kabartma** düğmesi dağ/orman zemin dokusunu açıp kapatır. Kapalıyken sade
  siyasi harita, ülke ve şehir sınırları ile bütün seçilebilir bölgeler korunur.
  Kara harekâtı ve ikmal modlarında açık kabartmanın yoğunluğu azaltılır; taktik
  renkler daha net görünür.
- **Birlik durumu** düğmesi kendi birliklerinin mevcut güç çubuğunu ve yakın
  görünümde ilerleme/çatışma/ikmal uyarısını gösterir. Seçili birliklerin durumu
  uzak görünümde de okunabilir. Yeşil çubuk organizasyon, mavi çubuk mevcut
  güçtür. Sayılar gerçek tümen durumlarından hesaplanır; çatışan tümenler
  ilerliyor sayısına dahil edilmez.
- **Seçili tümenlere git** düğmesi seçili birliklerin bulunduğu bölgeleri
  kameraya sığdırır. Birlik seçilmediyse devre dışıdır.
- İki görünüm tercihi cihazda saklanır. Depolamaya izin verilmese de düğmeler
  çalışır. Başkentler ve seçili şehir dışındaki şehir isimleri açılmaz.
- Tümen kartlarının seçili çerçevesi, gölge plakası ve iki ayrı durum çubuğu
  daha net ayrılır. Her kart için SVG filtre çalıştırmak yerine basit geometri
  kullanılır. Muharebe simgeleri görünür alanla sınırlandırılır ve yakınlaştırmada
  okunabilir boyutta kalır. En fazla 12 görünür muharebe nabız animasyonu alır;
  dokunmatik ve azaltılmış hareket tercihinde animasyon kapalıdır.

Mevcut harita dokusu tek raster katman olarak kalır; yeni ağaç/dağ SVG kümeleri
eklenmez. Kamera sürükleme döngüsüne React durum güncellemesi veya yeni ikmal
hesabı eklenmez. Cihaz başına FPS garantisi verilmez.
