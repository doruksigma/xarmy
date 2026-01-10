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
  - Yapılan Hamle: ${moveSan}
  - Bilgisayar Skoru (CP): ${score} 
  - Oyuncu Rengi: ${playerColor === 'w' ? 'Beyaz' : 'Siyah'}

  GÖREV:
  1. Hamleyi analiz et. Eğer skor çok düştüyse (hata/blunder), nedenini açıkla.
  2. Eğer hamle iyiyse, hangi stratejik avantaja (merkez kontrolü, rok hazırlığı, rakip zayıflığı vb.) hizmet ettiğini söyle.
  3. "Merhaba çocuklar" gibi giriş cümlelerini her seferinde tekrarlama, doğrudan analize gir.
  4. Analizi 1-2 kısa cümleyle sınırla. 
  5. Ciddi ama teşvik edici bir ton kullan. Teknik terimleri (açmaz, çatal, tempo) kullanmaktan çekinme ama kısaca açıkla.

  ÖRNEK TON:
  "Bu hamle merkezdeki e4 karesini kontrol ederek filin önünü açıyor, harika bir gelişim hamlesi!"
  "Dikkat! Bu hamle kaleni savunmasız bıraktı, rakibin 'çatal' atma şansı doğabilir."
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
            temperature: 0.5,
            maxOutputTokens: 120,
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
