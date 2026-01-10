import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ✅ Vercel/Next: server-side çalışsın

export async function POST(req: Request) {
  try {
    const { fen, moveUci, moveSan, score, playerColor } = await req.json();

   // Prompt kısmını şu şekilde değiştirin:
const prompt = `
Sen dünya çapında tanınan bir satranç büyükustası ve aynı zamanda çocuklara satranç öğreten tecrübeli bir eğitmensin.
EK ANALİZ (Lichess):
- Hamle sınıflandırması: ${judgment}
- Lichess en iyi hamle: ${lichess.bestMove}


VERİLER:
- Konum (FEN): ${fen}
- Yapılan Hamle (SAN): ${moveSan}
- Bilgisayar Skoru (CP): ${score}
- Oyuncu Rengi: ${playerColor === 'w' ? 'Beyaz' : 'Siyah'}

BİLGİ:
- Skor, hamleden SONRAKI değerlendirmedir.
- Beyaz için skorun artması iyidir, düşmesi kötüdür.
- Siyah için skorun düşmesi iyidir, artması kötüdür.

GÖREV:
1. Hamleyi değerlendir.
2. Cevap 1 veya 2 TAM cümle olsun.
3. HER CÜMLEDE en az BİR SOMUT NEDEN belirt:
   - merkez kontrolü
   - taş geliştirme
   - şah güvenliği
   - tempo kazanımı
   - rakip tehdidi
4. "iyi", "standart", "mantıklı" gibi kelimeleri TEK BAŞINA kullanma.
   → mutlaka "ÇÜNKÜ ..." ile devam et.
5. Cümleyi ASLA yarım bırakma.
6. Giriş cümlesi kullanma, doğrudan analize başla.
7. Eğer hamle "blunder" veya "mistake" ise,
   Lichess'in önerdiği hamleyle KISA bir karşılaştırma yap.
  

TON:
Öğretici, net ve teşvik edici.

ÖRNEKLER:
"Bu hamle e4 karesini kontrol ettiği için filin gelişimini hızlandırıyor ve merkezde alan kazandırıyor."
"Dikkat! Bu hamle şah kanadını zayıflattığı için rakibin çatal tehdidi oluşturmasına izin veriyor."
`;


    // ✅ Gemini REST API (server-side)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reason: "Sunucuda GEMINI_API_KEY tanımlı değil." },
        { status: 500 }
      );
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 200,
          },
        }),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return NextResponse.json(
        { reason: "Gemini API hata verdi: " + errText.slice(0, 200) },
        { status: 500 }
      );
    }

    const data = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ||
      "Açıklama üretilemedi.";

    return NextResponse.json({ reason: text.trim() });
  } catch (e: any) {
    return NextResponse.json(
      { reason: "Sunucu hatası: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
