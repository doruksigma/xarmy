import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Payload = {
  fen: string;
  moveUci: string;
  moveSan?: string | null;
  score: number; // pawn units (örn 0.35)
  playerColor: "w" | "b"; // kullanıcı rengi
};

type LichessEval = {
  evalCp: number | null; // centipawn
  mate: number | null;
  bestMove: string | null; // uci
};

async function fetchLichessCloudEval(fen: string): Promise<LichessEval> {
  const token = process.env.LICHESS_TOKEN;
  if (!token) {
    // token yoksa Lichess'i pas geçeceğiz
    return { evalCp: null, mate: null, bestMove: null };
  }

  // Lichess cloud eval endpointi: GET ile query daha stabil
  const url =
    "https://lichess.org/api/cloud-eval?fen=" +
    encodeURIComponent(fen) +
    "&multiPv=1";

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    // Next.js server fetch cache kapansın:
    cache: "no-store",
  });

  if (!r.ok) {
    // Lichess rate-limit vs -> sessizce düş
    return { evalCp: null, mate: null, bestMove: null };
  }

  const data: any = await r.json();
  const pv0 = data?.pvs?.[0];

  const evalCp: number | null =
    typeof pv0?.cp === "number" ? pv0.cp : null;
  const mate: number | null =
    typeof pv0?.mate === "number" ? pv0.mate : null;

  const bestMove: string | null =
    typeof pv0?.moves === "string" ? pv0.moves.split(" ")[0] : null;

  return { evalCp, mate, bestMove };
}

// Basit bir sınıflandırma: scoreCp farkına göre
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

    // 1) Lichess eval (opsiyonel)
    const lichess = await fetchLichessCloudEval(fen);

    // Stockfish skorunu cp'ye çevir (pawn -> cp)
    const scoreCpFromStockfish = Math.round((score || 0) * 100);

    // Lichess cp varsa farkı hesapla
    const diffCpAbs =
      lichess.evalCp === null ? 0 : Math.abs(lichess.evalCp - scoreCpFromStockfish);

    const judgment =
      lichess.evalCp === null ? "ok" : classifyJudgment(diffCpAbs);

    // 2) Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reason: "Sunucuda GEMINI_API_KEY tanımlı değil." },
        { status: 500 }
      );
    }

    // Prompt
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

BİLGİ:
- Skor hamleden SONRAKI değerlendirmedir.
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
4. "iyi", "standart", "mantıklı" gibi kelimeleri TEK BAŞINA kullanma → mutlaka "çünkü ..." ile devam et.
5. Cümleyi ASLA yarım bırakma.
6. Giriş cümlesi kullanma, doğrudan analize başla.
7. Eğer hamle "blunder" veya "mistake" ise, Lichess'in önerdiği hamleyle KISA bir karşılaştırma yap.

TON:
Öğretici, net ve teşvik edici.
`;

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

    const data: any = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .join("") || "Açıklama üretilemedi.";

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
