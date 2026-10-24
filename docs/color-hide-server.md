# Color Hide 3D sunucusu

Color Hide, Three.js istemcisi ve ayrı bir Node.js / WebSocket sunucusundan oluşur.
Bu gerçek çok oyunculu bağlantıdır: her tarayıcı kendi kimliğiyle aynı sunucunun
odasına bağlanır. Tarayıcı yalnızca hareket tuşlarını ve nişan yönünü gönderir.
20 Hz sunucu simülasyonu hareketi, çarpışmayı, ateşi, şarjörü, yakalamayı,
60 saniye saklanmayı ve 10 dakika aramayı hesaplar; kişiye özel durumları 10 Hz
ile dağıtır. Saklanma aşamasındaki ebeye diğer oyuncuların konumları gönderilmez.

## Yerelde çalıştırma

Node.js 24 kullanılır. İki terminal açın:

```sh
npm ci
npm run color-hide:server
```

```sh
npm run dev
```

`http://localhost:3000/games/color-hide` adresinde iki ayrı tarayıcı profili veya
cihaz kullanın. Oda kodunu diğer oyuncuya verin. Varsayılan sunucu portu 3001'dir.
Geliştirme istemcisi aynı makinenin 3001 portuna bağlanır. Yerel ağdaki telefonlar
kullanılacaksa `COLOR_HIDE_ALLOWED_ORIGINS` değerine bilgisayarın LAN adresini
(tam köken: örneğin `http://192.168.1.20:3000`) ekleyin; tarayıcı sunucu adresi de
aynı bilgisayara ulaşmalıdır. WebSocket portunun yerel güvenlik duvarında açık
olması gerekir. Bu adres yalnızca örnektir.

## Vercel + ücretsiz WebSocket barındırma

Vercel'in Next.js işlevleri bu sürekli çalışan WebSocket sunucusunu barındırmaz.
Mevcut siteyi, satranç Redis bağlantısını ve diğer oyunları taşımayın.

Kurulum bağlantısı: [Render'da ücretsiz sunucuyu oluştur](https://render.com/deploy?repo=https://github.com/doruksigma/xarmy).
Render hesabınıza giriş yaptıktan sonra depodaki Blueprint'i seçip ücretsiz
servisi oluşturun. Sunucu adresi bu işlemden sonra belli olur.

1. GitHub'daki güncel `doruksigma/xarmy` deposundan Render'da bir **Blueprint**
   oluşturun. Kökteki `render.yaml`, `xarmy-color-hide` adlı ücretsiz Node web
   servisini tanımlar. Ayrıca aynı build/start komutlarıyla elle Web Service
   oluşturabilirsiniz.
2. Servisin verdiği gerçek HTTPS adresinde `/healthz` yolunu açın; `ok: true`
   yanıtı gelmelidir. Adresin başındaki `https://` yerine `wss://` kullanarak
   WebSocket adresini elde edin. Örnek: `wss://SERVISINIZ.onrender.com`.
3. Vercel'deki **xarmy** projesine şu genel ortam değişkenini ekleyin:
   `NEXT_PUBLIC_COLOR_HIDE_SERVER_URL=wss://SERVISINIZ.onrender.com`.
   Bu değer gizli anahtar değildir. İstemci derlenirken yerleştirildiği için
   değişiklikten sonra Vercel'de **Redeploy** çalıştırın.
4. Render'daki `COLOR_HIDE_ALLOWED_ORIGINS` varsayılan olarak
   `https://xarmygames.online,https://www.xarmygames.online` değerindedir.
   Başka önizleme alan adını test edecekseniz tam kökenini virgülle ekleyin.
   `*` kullanmayın. HTTPS oyun sayfası için güvenli `wss://` bağlantısı gereklidir.
5. Canlı sitede iki farklı cihazdan aynı kodla katılın. Oyuncuları hazır yapıp
   turu başlatın. Zar, saklanma sayacı ve renkler iki cihazda aynı ilerlemelidir.

Bu depo sunucuyu çalıştırma ve dağıtma yapılandırmasını içerir; Render hesabında
servis oluşturulduğu veya Vercel değişkeninin ayarlandığı anlamına gelmez.
Ücretsiz planın kota ve uygunluk koşulları barındırma sağlayıcısına bağlıdır.
Ücretsiz servis boşta uyuyabilir; ilk bağlantı uyanmasını bekleyebilir. Sunucu
uyuduğunda, yeniden başladığında veya yeni sürüm dağıtıldığında bellekteki odalar
kaybolur. Yeni oda açılabilir; sefer/kullanıcı verisi kaydedilmez. Aktif oyunlar
sırasında dağıtım yapmayın. Bu sürüm tek sunucu örneği içindir; yük dengeleyiciyle
birden fazla örneğe ölçeklemek için kalıcı oda yönlendirme altyapısı gerekir.

## Sunucu ayarları ve sınırlar

- `PORT`: platformun atadığı port; yerelde 3001.
- `COLOR_HIDE_ALLOWED_ORIGINS`: tam HTTP/HTTPS kökenlerinin virgüllü listesi.
  Varsayılan yalnızca `http://localhost:3000,http://127.0.0.1:3000`.
- Oda başına 2–5 oyuncu; varsayılan en fazla 100 oda / 300 açık bağlantı.
- Yeniden bağlanma için 20 saniye; sonra oyuncu çıkarılır, sahiplik aktarılır.
- 256 bit rastgele oturum anahtarı yalnızca o oyuncuya gönderilir. Oda kodu
  arkadaş daveti içindir, kimlik doğrulama anahtarı değildir.
- 8 KiB mesaj sınırı, giriş/eylem hız sınırları, bozuk çerçeve sınırı, Origin
  kontrolü, sunucu tarafında hız/duvar/atış/süre doğrulaması uygulanır.
- Bu önlemler istemcinin doğrudan ışınlanma veya yakalama sonucu yazmasını önler.
  Hiçbir tarayıcı oyunu için tüm hilelerin veya otomatik nişanın engellendiği
  iddia edilmez. Arama aşamasında görüntülenmesi gereken oyuncu konumları
  istemciye iletilir.
- Oda oturum anahtarlarını veya WebSocket mesaj içeriklerini genel günlüğe
  yazmayın. Sunucu `/healthz` yanıtında oyuncu veya oda kimliği yayımlamaz.

## Doğrulama

```sh
npm run test:color-hide
npm run color-hide:build
npm run build
```

Birim testleri kuralları yapay bir saatle doğrular. WebSocket entegrasyon
senaryoları gerçek TCP bağlantıları açar; beş oyuncu ve altıncı oyuncu reddi,
oylama, özel karartma, hareket/boyama senkronizasyonu, yakalama, tur sonucu,
tekrar oynama, yeniden bağlanma, ayrılma ve protokol sınırlarını kontrol eder.
Test saatinin enjeksiyonu yalnızca süreç içi test API'sidir; ağdan süreyi
hızlandıran veya oyuncu konumunu değiştiren bir geliştirme uç noktası yoktur.
