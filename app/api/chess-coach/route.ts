import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ✅ Vercel/Next: server-side çalışsın

export async function POST(req: Request) {
  try {
    const { fen, moveUci, moveSan, score, playerColor } = await req.json();

    const prompt = `
Sen profesyonel bir satranç öğretmenisin.
Aşağıdaki konumda Stockfish'in seçtiği hamleyi, 5. sınıf öğrencisine anlatır gibi açıkla.

KONUM (FEN): ${fen}
HAMLE (UCI): ${moveUci}
HAMLE (SAN): ${moveSan || "-"}
AVANTAJ SKORU (piyon birimi): ${score}

Kurallar:
- En fazla 2-3 cümle
- İnsan diliyle: merkez kontrolü, taş geliştirme, şah güvenliği, taktik (çatal/açmaz), piyon yapısı gibi gerekçeler
- Gereksiz teknik varyant yazma (uzun hamle dizisi yok)
- Türkçe yaz
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
