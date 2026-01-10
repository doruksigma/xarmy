import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fen } = await req.json();

    const token = process.env.LICHESS_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "LICHESS_TOKEN missing" },
        { status: 500 }
      );
    }

    // Lichess Cloud Eval
    const res = await fetch(
      "https://lichess.org/api/cloud-eval",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fen,
          multiPv: 1,
        }),
      }
    );

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: t }, { status: 500 });
    }

    const data = await res.json();

    const evalCp = data?.pvs?.[0]?.cp ?? null;
    const mate = data?.pvs?.[0]?.mate ?? null;
    const bestMove = data?.pvs?.[0]?.moves?.split(" ")[0] ?? null;

    return NextResponse.json({
      evalCp,
      mate,
      bestMove,
      raw: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "unknown error" },
      { status: 500 }
    );
  }
}
