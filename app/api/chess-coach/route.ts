// app/api/chess-coach/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Payload = {
  fen: string;
  moveUci: string;
  moveSan?: string | null;
  score: number; // pawn units (örn 0.35)
  playerColor: "w" | "b";
};

type LichessEval = {
  evalCp: number | null;
  mate: number | null;
  bestMove: string | null;
};

async function fetchLichessCloudEval(fen: string): Promise<LichessEval> {
  const token = process.env.LICHESS_TOKEN;
  if (!token) return { evalCp: null, mate: null, bestMove: null };

  const url =
    "https://lichess.org/api/cloud-eval?fen=" +
    encodeURIComponent(fen) +
    "&multiPv=1";

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!r.ok) return { evalCp: null, mate: null, bestMove: null };

  const data: any = await r.json();
  const pv0 = data?.pvs?.[0];

  const evalCp: number | null = typeof pv0?.cp === "number" ? pv0.cp : null;
  const mate: number | null = typeof pv0?.mate === "number" ? pv0.mate : null;
  const bestMove: string | null =
    typeof pv0?.moves === "string" ? pv0.moves.split(" ")[0] : null;

  return { evalCp, mate, bestMove };
}

function classifyJudgment(diffCpAbs: number): "ok" | "inaccuracy" | "mistake" | "blunder" {
  if (diffCpAbs >= 300) return "blunder";
  if (diffCpAbs >= 150) return "mistake";
  if (diffCpAbs >= 60) return "inaccuracy";
  return "ok";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const { fen, moveUci, moveSan, score, playerColor } = body;

    if (!fen || !moveUci || !playerColor) {
      return NextResponse.json({ reason: "Eksik veri (fen/moveUci/playerColor)." }, { status: 400 });
    }

    const lichess = await fetchLichessCloudEval(fen);

    const scoreCpFromStockfish = Math.round((score || 0) * 100);
    const diffCpAbs =
      lichess.evalCp === null ? 0 : Math.abs(lichess.evalCp - scoreCpFromStockfish);

    const judgment =
      lichess.evalCp === null ? "ok" : classifyJudgment(diffCpAbs);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reason: "Sunucuda GEMINI_API_KEY tanımlı değil." }, { status: 500 });
    }

    const prompt = `
Sen dünya çapında tanınan bir satranç büyükustası ve aynı zamanda çocuklara satranç öğreten tecrübeli bir eğitmensin.

EK ANALİZ (Lichess):
- Hamle sınıflandırması: ${judgment}
- Lichess en iyi hamle: ${lichess.bestMove ?? "yok"}

VERİLER:
- Konum (FEN): ${fen}
- Yapılan Hamle (UCI): ${moveUci}
- Yapılan Hamle (SAN): ${moveSan ?? "?"}
- Bilgisayar Skoru (CP): ${scoreCpFromStockfish}
- Oyuncu Rengi: ${playerColor === "w" ? "Beyaz" : "Siyah"}

KURALLAR:
- Cevap 2–3 TAM cümle olsun.
- HER cümlede en az 1 somut neden olsun (merkez, gelişim, şah güvenliği, tempo, tehdit).
- "iyi/standart" tek başına yazma → mutlaka "çünkü ..." ile bağla.
- Giriş cümlesi yok, doğrudan analize gir.
- Eğer judgment = blunder veya mistake ise, Lichess önerisi ile 1 kısa karşılaştırma yap.

TON:
Net, öğretici, teşvik edici.
`.trim();

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 180 },
        }),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return NextResponse.json(
        { reason: "Gemini API hata verdi: " + errText.slice(0, 250) },
        { status: 500 }
      );
    }

    const data: any = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ||
      "Açıklama üretilemedi.";

    return NextResponse.json({
      reason: text.trim(),
      meta: {
        judgment,
        lichessBestMove: lichess.bestMove,
        lichessEvalCp: lichess.evalCp,
        stockfishCp: scoreCpFromStockfish,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { reason: "Sunucu hatası: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
