"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

type Difficulty = "easy" | "medium" | "hard";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function depthByDifficulty(d: Difficulty) {
  if (d === "easy") return 2;
  if (d === "medium") return 8;
  return 13;
}

export default function ChessPage() {
  const [fen, setFen] = useState(START_FEN);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [engineStatus, setEngineStatus] = useState<"off" | "booting" | "ready" | "failed">("off");
  const [thinking, setThinking] = useState(false);

  const gameRef = useRef(new Chess(START_FEN));
  const engineRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);

  // Basit örnek move input (UCI: e2e4 gibi)
  const [uciMove, setUciMove] = useState("e2e4");

  useEffect(() => {
    // mount: engine init
    setEngineStatus("booting");
    const w = new Worker("/stockfish/stockfish-worker.js");
    engineRef.current = w;

    const send = (msg: string) => w.postMessage(msg);

    const onMsg = (e: MessageEvent) => {
      const msg = String(e.data || "");
      // İstersen debug:
      // console.log("SF:", msg);

      if (msg === "SF_INIT_FAILED") {
        setEngineStatus("failed");
        readyRef.current = false;
        return;
      }
      if (msg === "SF_INIT_OK") {
        // handshake başlat
        send("uci");
        send("isready");
        return;
      }
      if (msg.includes("uciok")) {
        // uci ok geldiyse ready bekle
        send("isready");
        return;
      }
      if (msg.includes("readyok")) {
        readyRef.current = true;
        setEngineStatus("ready");
        return;
      }

      // En kritik: bestmove yakala
      if (msg.startsWith("bestmove")) {
        const parts = msg.split(" ");
        const best = parts[1]; // örn "e2e4"
        if (best && best !== "(none)") {
          applyEngineMove(best);
        }
        setThinking(false);
      }
    };

    w.addEventListener("message", onMsg);

    // initial options (istersen)
    // Not: Skill Level 0..20 (10.0.2'de çalışır)
    // send("setoption name Skill Level value 10");

    return () => {
      w.removeEventListener("message", onMsg);
      w.terminate();
      engineRef.current = null;
      readyRef.current = false;
      setEngineStatus("off");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetGame() {
    gameRef.current = new Chess(START_FEN);
    setFen(gameRef.current.fen());
    setThinking(false);
  }

  function applyUserMove(uci: string) {
    const g = gameRef.current;
    if (thinking) return;

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.slice(4, 5); // q,r,b,n olabilir

    const move = g.move({ from, to, promotion: promo ? (promo as any) : undefined });
    if (!move) return false;

    setFen(g.fen());
    return true;
  }

  function applyEngineMove(uci: string) {
    const g = gameRef.current;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.slice(4, 5);

    const move = g.move({ from, to, promotion: promo ? (promo as any) : undefined });
    if (!move) return;

    setFen(g.fen());
  }

  function requestBotMove() {
    const w = engineRef.current;
    if (!w) return;
    if (!readyRef.current) return;
    if (thinking) return;

    setThinking(true);

    // önceki aramayı temizlemek iyi pratik
    w.postMessage("stop");
    w.postMessage("ucinewgame");
    w.postMessage("isready");

    const currentFen = gameRef.current.fen();
    w.postMessage(`position fen ${currentFen}`);

    const depth = depthByDifficulty(difficulty);
    w.postMessage(`go depth ${depth}`);
  }

  function onPlayMove() {
    const ok = applyUserMove(uciMove.trim());
    if (!ok) return;

    // user hamlesinden sonra bot istensin
    requestBotMove();
  }

  const turn = useMemo(() => {
    try {
      return gameRef.current.turn() === "w" ? "Beyaz" : "Siyah";
    } catch {
      return "-";
    }
  }, [fen]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">♟️ Satranç (Stockfish)</h1>
          <p className="text-slate-400 text-sm">
            Engine:{" "}
            <span className="font-semibold">
              {engineStatus === "ready" ? "Hazır" : engineStatus === "booting" ? "Başlatılıyor…" : engineStatus === "failed" ? "Başlatılamadı" : "Kapalı"}
            </span>
            {thinking ? " • düşünüyor…" : ""}
          </p>
          <p className="text-slate-500 text-xs mt-1">FEN: {fen}</p>
          <p className="text-slate-400 text-sm mt-2">Sıra: {turn}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={resetGame}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 transition"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-slate-300 text-sm">Zorluk:</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2"
          >
            <option value="easy">Easy (depth 2)</option>
            <option value="medium">Medium (depth 8)</option>
            <option value="hard">Hard (depth 13)</option>
          </select>

          <div className="flex items-center gap-2">
            <label className="text-slate-300 text-sm">Hamle (UCI):</label>
            <input
              value={uciMove}
              onChange={(e) => setUciMove(e.target.value)}
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2 w-28"
              placeholder="e2e4"
            />
            <button
              onClick={onPlayMove}
              disabled={engineStatus !== "ready" || thinking}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              Oyna
            </button>

            <button
              onClick={requestBotMove}
              disabled={engineStatus !== "ready" || thinking}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
            >
              Bot Hamlesi İste
            </button>
          </div>
        </div>

        <p className="text-slate-500 text-xs mt-3">
          Not: Bu örnekte taş sürükleme yok; sadece botun kesin çalıştığını doğrulamak için minimal kontrol var.
          İstersen bir sonraki adımda drag&drop + görsel tahta ekleyelim.
        </p>
      </div>
    </div>
  );
}
