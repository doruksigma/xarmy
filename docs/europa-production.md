# Tam adet üretim ve biriken iş

Sanayi panelindeki üretim hatları artık depoya kesirli yeni ekipman eklemez.
Her hattın ayrı birikmiş üretim puanı bulunur. Ekipmanın maliyeti kadar puan
tamamlanınca bir tam ekipman depoya girer; kalan iş sonraki güne taşınır.

## Hesaplama

`productionPlan` hem arayüz tahmininin hem de `applyProduction` tarafından
uygulanan günlük üretimin ortak hesaplayıcısıdır. Tahmin dünya durumunu
değiştirmez.

Günlük çalışma puanı:

```
etkin fabrika × temel çıktı × verimlilik × ekonomi yasası
× sanayi danışmanı × ekonomi bakanı × sanayi teknolojileri
```

Temel çıktı şu anda fabrika başına **3 puan/gün**dür. Günlük verimlilik artışı
0,002, normal üst sınır 0,95'tir. Bunlar
`strategy/economy-balance.ts` içindeki Europa War denge değerleridir; tarihsel
ölçüm veya HOI4 formülü değildir. Ekipman maliyetleri ve girdileri `catalog.ts`
içindedir.

Örneğin ek bonus olmadan 2 fabrika ve 0,80 verimlilik 4,8 puan üretir.
Saha topunun maliyeti 3 puan olduğundan depoya 1 top eklenir ve hatta 1,8 puan
kalır. Saha topunun 1,5 çelik girdisi üzerinden o gün toplam 2,4 çelik tüketilir.

Biriken iş **malzemesi ödenmiş** iştir: girdi tüketimi o gün yapılan yeni
işin ekipman maliyetine oranıyla hesaplanır. Önceki günün işi tamamlanırken
malzeme ikinci kez alınmaz. Tamamlanan ekipman ile kalan işin temsil ettiği
malzeme, tüketilen toplam malzemeye eşittir.

## Kapasite, öncelik ve duraklatma

- Askerî fabrikalar ile tersaneler ayrı ortak havuzlardan gelir. Hatlar mevcut
  sıra önceliğiyle kapasite alır; aynı fabrika iki hatta tekrar verilmez.
- İşgal veya yapı hasarı etkin kapasiteyi azaltabilir. Panelde **etkin/atanan**
  kapasite ayrı gösterilir. Fabrika kaybından sonra mevcut tahsisleri azaltmak
  ve yeniden düzenlemek mümkündür.
- Malzeme hatlara aynı sıra içinde ayrılır. İlk hattın harcadığı çelik ikinci
  hatta yeniden sayılmaz. Eksik kaynak yalnızca karşılanabilen işi ilerletir.
- Bir hattın fabrika sayısını sıfıra indirmek, ücretli birikimi varsa hattı
  duraklatır. Kaynak ve ilerleme kaybolmaz; yeniden fabrika atayınca devam eder.
  Hiç birikimi olmayan boş hat kaldırılır.
- Depo sınırı 100.000'dir. Yeni tam ekipmana yer kalmadığında üretim malzeme
  tüketmeden durur; daha önce ödenmiş birikim korunur.
- Yapay zekâ aynı günlük üretim hesabını kullanır. Yardımcı yönetim fabrika
  tahsislerini değiştirdiğinde hat birikimlerini korur. İç savaşta biriken iş
  kopyalanmaz; mevcut stok paylaşımı gibi iki taraf arasında bölüşülür.

Sanayi paneli biriken puanı, ekipman maliyetini, mevcut stokla tamamlanabilecek
tam adedi ve günlük işi gösterir. Tahmin **mevcut stok** içindir; sonraki günün
kaynak çıkarımı, ticareti, işgali veya hasar değişikliği sonucu değiştirebilir.

## Kayıt uyumluluğu ve kapsam

`Production.progress` isteğe bağlı kayıt alanıdır. Eski kayıtta bulunmuyorsa
sıfır kabul edilir. Negatif, maliyete eşit/ondan büyük birikim veya kesirli
fabrika tahsisi reddedilir. Devam eden iş normal kayıt/yüklemeyle korunur.

Eski kayıtlardaki kesirli ekipman değerleri silinmez veya yuvarlanmaz. Mevcut
takviye, yıpranma ve iç savaş hesaplarının stok üzerindeki kesirli işlemleri de
bu değişikliğin kapsamı dışında kalır. Garanti edilen kural, **yeni üretimin
yalnızca tamamlanmış tam adet eklemesidir**; bütün stok muhasebesinin tam sayıya
dönüştürüldüğü veya kapsamlı sevkiyat defteri kurulduğu iddia edilmez.

## Testler

Yeni `production-foundation.test.ts` dosyasındaki **13 test**; tam üretim ve
birikim, önceden ödenmiş malzeme, ortak kapasite, kaynak kıtlığı, depo sınırı,
fabrikasız hattın tamamlanmaması, duraklatma/devam, yapay zekâ tahsisleri,
kayıttan aynı sonuçla devam, eski kesirli stoklar, iç savaş korunumu ve bozuk
kayıtları denetler. İlgili mevcut ekonomi, teknoloji ve komutan kayıt testleriyle
birlikte **123/123 hedefli test geçti**. Bütün simülasyon testleri
`npm run test:europa` komutuyla çalışır.
