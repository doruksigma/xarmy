import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ✅ Vercel/Next: server-side çalışsın

export async function POST(req: Request) {
  try {
    const { fen, moveUci, moveSan, score, playerColor } = await req.json();

   // Prompt kısmını şu şekilde değiştirin:
const prompt = `
Sen dünya çapında tanınan bir satranç büyükustası ve aynı zamanda çocuklara satranç öğreten tecrübeli bir eğitmensin.

VERİLER:
- Konum (FEN): ${fen}
- Yapılan Hamle (SAN): ${moveSan}
- Bilgisayar Skoru (CP, piyon birimi): ${score}
- Oyuncu Rengi: ${playerColor === 'w' ? 'Beyaz' : 'Siyah'}

BİLGİ:
- Skor, hamleden SONRAKI değerlendirmedir.
- Beyaz için skorun artması iyidir, düşmesi kötüdür.
- Siyah için skorun düşmesi iyidir, artması kötüdür.

GÖREV:
1. Hamleyi değerlendir.
2. Eğer bu hamle belirgin bir hata veya blunder ise, nedenini açıkla.
3. Eğer hamle iyiyse, hangi stratejik amaca hizmet ettiğini söyle
   (merkez kontrolü, taş geliştirme, şah güvenliği, tempo kazanımı vb.).
4. Teknik terimleri (ör. açmaz, çatal, tempo) kullanabilirsin ama kısaca açıkla.
5. Giriş cümlesi kullanma, doğrudan analize başla.
6. Cevap en az 1, en fazla 2 TAM cümle olsun.
7. Cümleyi ASLA yarım bırakma. Eksik ifade kullanma.

TON:
Ciddi, öğretici ve teşvik edici.

ÖRNEK:
"Bu hamle merkezde alan kazanarak filin gelişimini hızlandırıyor ve uzun vadeli bir plan kuruyor."
"Dikkat! Bu hamle şah kanadını zayıflattı, rakibin taktik şansı artabilir."
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
