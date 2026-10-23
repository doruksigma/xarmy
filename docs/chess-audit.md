# Satranç işlev denetimi — 23 Ekim 2026

## Kapsam ve ilk sonuç

Satranç istemcisi, Stockfish bağlantısı, eğitmen/maç analizi, oda API'leri ve
yerel/Redis depolama kodu incelendi. `npm run test:chess` başlangıçta **95/95**
testten geçti. Bu sayı gerçek Stockfish oyun gücü ölçümü değildir: motorun
protokol sınırları, satranç kuralları, değerlendirme tutarlılığı ve oda işlemleri
için otomatik regresyon testleridir.

| Özellik                     | Doğrulama                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kötü / orta / güçlü botlar  | Derinlik 1 / 10; güçlü botta yapay derinlik sınırı yok, hamle başına 8 saniye hesap; UCI komutları ve yasal hamle denetimi test edildi.                |
| Eğitmenin güçlü önerisi     | Oynayan bot ayarından bağımsız tam güç analizi; öneri değiştirildiğinde eşit veya daha iyi ölçüm şartı test edildi.                                    |
| Hatanın açıklanması         | Oynanan/en iyi hamle aynı kökten ve aynı tamamlanan derinlikte ölçülür; vezir kaybı, matı kaçırma, mat tehdidi ve kısa Türkçe açıklamalar test edildi. |
| Analiz doğruluğu            | Ölçülemeyen konuma iyi not verilmez; siyahın değerlendirme yönü ve her iki oyuncunun hamle geçmişi test edildi.                                        |
| Mat yolu ve geçmişi oynatma | Yalnızca yasal ve sonu gerçekten mat olan varyant gösterilir; gerçek oyun durumu değişmez.                                                             |
| Satranç kuralları           | Yasal hamle, sıra, şah mat, tekrar, geçerken alma ve vezir dışı terfi test edildi; kurallar `chess.js` üzerinden uygulanır.                            |
| Altı haneli oda, iki oyuncu | Oda oluşturma/katılma, eşzamanlı katılım, dolu oda, sürüm çakışması, eski oda ve 24 saat süre sonu test edildi.                                        |
| Renk kurası                 | Sunucunun zarları eşitlikte yenilenir; tüm farklı zar sonuçlarında iki oyuncunun beyaz olma olasılığı eşit; karar kayıtlı kalır.                       |
| Oda güvenliği               | Oyuncu jetonları hash olarak saklanır; yetkisiz hamle/terk, eski sürüm ve çapraz kaynak yazma istekleri reddedilir.                                    |
| Yerel/Redis depolama        | Yerel kilit yarışları ve Redis compare-and-swap yarışları, bağlantı hataları ve iki desteklenen ortam değişkeni çifti test edildi.                     |
| Terk/çıkış/yeniden oyun     | İstemcide eski motor isteği iptal edilir, analiz ve oda oturumu temizlenir; sunucuda terk son ve tekrarlanabilir bir işlemdir.                         |

## Gerçek tarayıcı denetimi

`scripts/test-chess-browser.cjs`, üretim sunucusunda gerçek Stockfish WASM
işçilerini ve iki bağımsız tarayıcı oturumunu kullanır. Yalnızca localhost
adresinde çalışır; denetim için gerçek kullanıcı odaları oluşturmaz.

Denetimde **7/7 tarayıcı kontrol grubu geçti**, sayfa hatası oluşmadı:

- Üç zorluk seçeneği ve gerçek Stockfish'in her seviyede yasal hamle üretmesi.
- Maç sırasında maç sonu analizinin görünmemesi; terk sonrası gerçek
  açıklamaların tamamlanması, iki renk arasında geçiş ve geçmişe dönme.
- Mobil analiz görünümünde yatay taşma olmaması ve analizden çıkıp temiz
  bir maç başlatılması.
- Eğitmende zorluk seçiminin olmaması, güçlü öneri/açıklama, başka iyi hamle
  isteme ve önerilen hamleyi doğrudan oynama.
- İki bağımsız oturumda oda oluşturma/katılma, zıt renk kurası, üçüncü
  oyuncunun reddedilmesi ve yenileme sonrası aynı kuranın korunması.
- Dört yarım hamlelik gerçek online matın iki tahtaya da aktarılması,
  iki oyuncunun kendi renginden analize girmesi ve çıkışta oturumun temizlenmesi.
- Bekleyen odanın kapatılması ve bu odaya sonradan katılımın reddedilmesi.

Bu denetimde başarısız bir satranç mekaniği bulunmadığı için oyun kodu
değiştirilmedi. Tekrarlanabilir tarayıcı kontrolü ve bu denetim kaydı eklendi.

Çalıştırma:

```sh
npm run test:chess
npm run build
npm start
# Playwright modülü ve Chromium kurulu ortamda:
node scripts/test-chess-browser.cjs
```

## Sınırlar

- Vercel'deki gerçek Upstash bağlantısının güncel durumu yerel testlerle
  doğrulanamaz; Redis protokolü ve hataları test çiftleriyle sınandı.
- Bot seviyelerinin insanlara karşı Elo gücü ölçülmedi. Güçlü arama zamanla
  sınırlıdır; “sınırsız düşünme” veya her maç farklı açılış garantisi verilmez.
- Bot/eğitmen maçları sayfa yeniden yüklendiğinde otomatik geri yüklenmez.
  Çevrimiçi oda oturumu aynı sekmenin `sessionStorage` alanında tutulur;
  yeni cihazda veya farklı sekmede aynı özel oturum otomatik taşınmaz.
- Bu oyun için tam çevrimdışı paket kurulumu uygulanmış değil; Stockfish
  dosyaları yerel sunucudan sunulur, oda modu sunucu bağlantısı gerektirir.
