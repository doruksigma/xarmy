# Dot Front — mevcut siteyi koruyan güncelleme

Oyun adresi **`/games/dot-front`**. Mevcut Next.js 15 / React 19 / TypeScript uygulamasının kendi istemci bileşeni kullanılır. Ana sayfadaki Dot Front kartı zaten bulunduğundan yeni bir kart, ikinci bir rota veya iframe eklenmedi.

## Korunan yapı

Başlangıç revizyonu: `8a896ce019a8cbde5f39ba7622ae954b3ebe04d6`.

Ana sayfa (`app/page.tsx`, `app/home.module.css`), ortak yerleşim/stiller, Navbar/Footer, diğer oyunların kaynakları, API'ler, oyun listeleri ve dağıtım ayarları değiştirilmedi. Battle Royale, Color Hide 3D, Europa War, Satranç Arenası ve Nokta Cephesi mevcut yollarında kalır. Değişiklikler `app/games/dot-front/`, `scripts/test-dot-front.cjs` ve bu belgeyle sınırlıdır.

## Dot Front değişiklikleri

- Harita seçimi ve ön izlemeleri: Açık Ova, Yeşil Hat, Kızıl Vadi, Dağ Geçitleri, Çifte Cephe ve Merkez Üs. Her haritada 10 şehir, iki taraf için 2 başlangıç şehri ve simetrik yaklaşımlar vardır.
- Yol bulma, hareket, savaş, toplanma noktaları, AI ve kayıt doğrulaması seçili haritayı kullanır. Küresel bir “aktif harita” yoktur; farklı maçlar birbirinin arazisini değiştiremez.
- Engellerin köşelerinden geçiş engellenir. Geçersiz bir yol yeniden hesaplanır. Yakın birlikler, duvarlara itilmeden kararlı biçimde ayrışır.
- AI yakındaki birlikleri birlikte değerlendirir; uzaktaki ordunun gücü yerel çatışmaya eklenmez. Savunma, güvenli toplanma, geri çekilme ve şehirsizken şehir kazanma desteklenir. Can, hasar ve üretim değerleri zorlukla artırılmaz.
- Fare/dokunmatik seçim koordinatları, iki parmak hareketleri, oyun odağı, olay iptali ve kamera sınırları doğrulanır. Duraklatma penceresinde klavye odağı korunur.
- Sekme gizlendiğinde veya sayfadan ayrılırken maç duraklar ve kaydedilir. BFCache dönüşünde kullanıcı devam eder; eski RAF geri çağrıları ikinci bir döngü oluşturamaz.
- Öğreticide üretim adımı asker gerçekten tamamlanınca ilerler. AI, öğretici bitene kadar bekler.

## Eski kayıtlar

Özgün `valley` haritasının hücreleri ve şehir konumları aynen korunmuştur. Önceki sürümün Kızıl Vadi maçları aynı haritada açılır. Kayıt şeması sürümü ve `xarmy:dot-front:` ad alanı değiştirilmemiştir:

- IndexedDB: `xarmy:dot-front:matches`
- Ayarlar: `xarmy:dot-front:settings`

Eski ayarlarda harita alanı yoksa Kızıl Vadi seçilir. İlk kez oynayanlar Açık Ova ile başlar. `Devam Et` seçeneği ayarlardaki yeni seçim yerine kaydın haritasını yükler. `Tekrar Oyna` tamamlanan maçın haritasını ve zorluğunu korur. Depolama erişimi veya işlemi takılırsa zaman aşımı oluşur ve oyun kayıt hatasını bildirerek oynanabilir kalır.

Bağımsız prototipteki `dot-front:v1:*` kayıtları farklı bir biçimdir; bu güncelleme sitenin mevcut `xarmy:dot-front:` kayıtlarıyla uyumluluğu korur.

## Çalıştırma ve doğrulama

Mevcut projenin Node.js 24 gereksinimi ve npm kilit dosyası korunur. Yeni bağımlılık eklenmedi.

```sh
npm ci
npm run dev
npm run test:dot-front
npm exec tsc -- --noEmit --incremental false
npm run build
npm start
```

Dot Front test komutu, klasördeki tüm `*.test.ts` dosyalarını derleyip çalıştırır. 56 test; haritalarda bütün şehir çiftlerine iki birlik türünün erişimi, eski harita uyumluluğu, hareket/engeller/köprüler, savaş, ikmal, üretim, öğretici, AI kararları, altı haritada deterministik kayıt dönüşü, depolama hataları, sentetik fare/dokunmatik ve yaşam döngüsünü kapsar.

Son doğrulama sonuçları:

| Kontrol | Sonuç |
| --- | --- |
| `npm run test:dot-front` | 56 test başarılı |
| Tüm proje TypeScript kontrolü | Başarılı |
| `npm run build` | Başarılı; mevcut oyun rotaları ve 6 harita seçeneği üretim HTML'inde doğrulandı |
| `npm run test:chess` | 118 test başarılı |
| `npm run test:color-hide` | 39 test başarılı |
| `npm run test:battle` | 3 test dosyası başarılı |
| `npm run test:europa` | 96 test dosyası başarılı; değişmeyen `engine.test` yaklaşık 524 saniyede hâlâ çalıştığından görev kapsamında durduruldu. Tam paket başarılı olarak sayılmadı. |
| Koruma denetimi | Kapsam dışındaki 450 mevcut dosya başlangıç revizyonuyla byte-byte aynı |

Satranç/Color Hide testleri normal sandbox'ta bazı süreç/ağ kısıtlarına takıldı; aynı komutlar izin verilen ağ erişimiyle tekrar çalıştırılıp geçti. Bu amaçla oyun kaynakları veya testleri değiştirilmedi.

Canlı ana sayfa ve özgün Dot Front menüsü tarayıcıda salt okunur incelendi. Bu, yeni yerel sürümün tarayıcı testi değildir. Yeni sürümün gerçek telefon/tablet, ses, tam ekran ve tarayıcı IndexedDB kontrolleri yapılmış sayılmaz. Sentetik kontroller fiziksel cihaz testinin yerine geçmez. 5–15 dakika maç süresi denge hedefidir; insan oynanışıyla doğrulanması gerekir.

## Yayına alma

Bu değişiklik bir Next.js kaynak güncellemesidir. Statik bir yeni ana sayfayı sitenin üzerine kopyalamayın. Mevcut depoda değişiklikleri gözden geçirip normal `npm run build` / dağıtım akışını kullanın. Sitenin mevcut çevre değişkenleri, barındırma bağlantıları ve diğer oyun servisleri korunmalıdır.
