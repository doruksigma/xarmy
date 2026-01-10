// app/api/lichess-analyze/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fen } = (await req.json()) as { fen?: string };

    if (!fen) {
      return NextResponse.json({ error: "fen missing" }, { status: 400 });
    }

    const token = process.env.LICHESS_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "LICHESS_TOKEN missing" }, { status: 500 });
    }

    // ✅ Lichess Cloud Eval aslında GET ile query param ister; POST da bazen çalışmayabilir.
    // En sağlam: GET çağırmak.
    const url =
      "https://lichess.org/api/cloud-eval?fen=" +
      encodeURIComponent(fen) +
      "&multiPv=1";

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: t.slice(0, 500) }, { status: 500 });
    }

    const data: any = await res.json();

    const pv0 = data?.pvs?.[0];
    const evalCp = typeof pv0?.cp === "number" ? pv0.cp : null;
    const mate = typeof pv0?.mate === "number" ? pv0.mate : null;
    const bestMove =
      typeof pv0?.moves === "string" ? pv0.moves.split(" ")[0] : null;

    return NextResponse.json({
      evalCp,
      mate,
      bestMove,
      raw: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}
