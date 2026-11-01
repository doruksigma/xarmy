# Komutanlarla sınır yönetimi

Sefer sırasında ekranın altındaki komutan portresine dokun. Her komutan en fazla
12 tümeni yönetir; portrede mevcut tümen sayısı ve sınır görevi görünür.

- **Yeni tümenleri otomatik komutana ata** açıksa eğitimden çıkan tümenler boş
  kontenjana atanır. Bütün komutanlar dolduğunda yeni, sınır görevi olmayan bir
  komutan oluşturulur. Seçenek açıldığında mevcut komutansız tümenler de atanır.
  Yeni seferlerde seçenek açıktır; eski kayıtların otomasyon tercihi değiştirilmez.
- **Sınırlara yerleştir**, yalnızca mevcut kara komşularını gösterir. Ülke
  bayrağına dokunmak tümenlere erişebildikleri sınır bölgeleri için dengeli
  yürüyüş emirleri verir. Birlikler ışınlanmaz; zamanın çalışması ve gerçek
  seyahat süresinin geçmesi gerekir. Kara bağlantısı olmayan birlikler varsa
  eksik bir emir uygulamak yerine açıklama gösterilir.
- Yerleşen komutan **Savun** emriyle başlar. Tümenler sınırda mevzilenir ve
  saldırıya uğradıklarında mevcut savaş sistemiyle savunur; düşman şehrine
  kendiliğinden ilerlemez.
- **Saldır**, o sınırdaki ülkeyle savaşta olmayı gerektirir. Tümenler yalnızca
  seçilen ülkenin kontrolündeki komşu şehirlere saldırır. Gerçek muharebe,
  organizasyon, ikmal, hasar ve şehir ele geçirme kuralları geçerlidir.
  Şehirler alındıkça cephe ilerler; başka savaşlara otomatik yardım gönderilmez.
- Sınır görevi olmayan yeni veya boşta komutan otomatik hareket emri vermez.
  **Sınır görevini kaldır** devam eden emirlerini durdurur. Yeniden sınır seçmek
  önceki görevi değiştirir ve tekrar savunmayla başlar.

Ordu panelinden komutanı elle değiştirmek mümkündür; dolu komutanlar yeni tümen
kabul etmez. Aktif bir komutanın tümenine doğrudan hareket, cephe veya taarruz
emri vermek o tümeni komutan otomasyonundan çıkarır. Böylece iki farklı emir
birbirini sürekli geçersiz kılmaz. İstenirse Ordu panelinden yeniden atanabilir.

Komutanlar, hedef ülke, emir ve otomatik atama seçimi manuel/otomatik kayıtta
saklanır. Eski kayıtlardaki 12'den büyük gruplar, birlikleri ve mevcut hareket
emirlerini kaybetmeden ayrı komutanlara bölünür. Yeni gruplara sınır görevi
otomatik kopyalanmaz.

## Doğrulama

`npm run test:europa`, yeni komutan kurallarını mevcut savaş, hareket, ekonomi,
diplomasi, kayıt ve uzun sefer testleriyle birlikte çalıştırır. Yeni testler
kapasite taşmasını, gerçek eğitim kuyruğunu, dengeli dağılımı, başka ülkeye
saldırmama kuralını, gerçek savaş kayıplarını, savunmaya dönüşü ve kayıt
uyumluluğunu denetler.

Üretim sunucusu açıkken ve Playwright/Chromium kurulu ortamda
`node scripts/test-europa-commanders-browser.cjs`, masaüstü ve dokunmatik mobil
görünümde gerçek arayüzden emir verme, kayıt/yükleme, şehir ele geçirme ve
yeni komutan oluşturma akışlarını denetler.

Bu değişiklikte Europa War'ın 280 birim/simülasyon testi geçti; buna on yıllık
sefer ve iç savaşta komutan emirlerinin isyancı ülkeye kopyalanmaması da dahildir.
Üretim derlemesinde 1440×1000 masaüstü ve 390×844 dokunmatik mobil görünümde
8 komutan akışı geçti. Karışık 16 tümenli grubun birlikte hareket etmesi ve
şehir alması da iki görünümde doğrulandı. Bunlar Chromium kontrolleridir;
fiziksel telefon üzerinde performans ölçümü değildir.
