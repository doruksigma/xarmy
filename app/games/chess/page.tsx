"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

type Difficulty = "easy" | "medium" | "hard";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ✅ Stockfish 10 (Pure JS sürümü) CDN üzerinden en stabil çalışan sürümdür.
const STOCKFISH_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

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
  const [uciMove, setUciMove] = useState("e2e4");

  const gameRef = useRef(new Chess(START_FEN));
  const engineRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    setEngineStatus("booting");

    // ✅ Inline Worker: Dış dosyaya ihtiyaç duymaz
    const blobCode = `
      self.importScripts("${STOCKFISH_CDN_URL}");
      const engine = typeof self.Stockfish === "function" ? self.Stockfish() : null;
      
      if (engine) {
        engine.onmessage = (e) => {
          const msg = (typeof e === 'string') ? e : e.data;
          self.postMessage(msg);
        };
        self.onmessage = (e) => engine.postMessage(e.data);
        // Motor yüklendiğinde bir sinyal gönderelim
        self.postMessage("INTERNAL_LOADED");
      }
    `;

    const blob = new Blob([blobCode], { type: "application/javascript" });
    const w = new Worker(URL.createObjectURL(blob));
    engineRef.current = w;

    const onMsg = (e: MessageEvent) => {
      const msg = String(e.data || "");
      console.log("Stockfish Output:", msg); // Debug için

      if (msg === "INTERNAL_LOADED") {
        w.postMessage("uci");
        return;
      }
      if (msg.includes("uciok")) {
        w.postMessage("isready");
        return;
      }
      if (msg.includes("readyok")) {
        readyRef.current = true;
        setEngineStatus("ready");
        return;
      }
      if (msg.startsWith("bestmove")) {
        const best = msg.split(" ")[1];
        if (best && best !== "(none)") {
          applyEngineMove(best);
        }
        setThinking(false);
      }
    };

    w.addEventListener("message", onMsg);

    return () => {
      w.removeEventListener("message", onMsg);
      w.terminate();
      engineRef.current = null;
      readyRef.current = false;
    };
  }, []);

  function resetGame() {
    gameRef.current = new Chess(START_FEN);
    setFen(START_FEN);
    setThinking(false);
  }

  function applyUserMove(uci: string) {
    if (thinking || engineStatus !== "ready") return false;
    
    const g = gameRef.current;
    try {
      const move = g.move({
        from: uci.slice(0, 2) as any,
        to: uci.slice(2, 4) as any,
        promotion: uci.slice(4, 5) || "q",
      });

      if (move) {
        setFen(g.fen());
        return true;
      }
    } catch (e) {
      console.error("Geçersiz hamle:", uci);
    }
    return false;
  }

  function applyEngineMove(uci: string) {
    const g = gameRef.current;
    try {
      g.move({
        from: uci.slice(0, 2) as any,
        to: uci.slice(2, 4) as any,
        promotion: uci.slice(4, 5) || "q",
      });
      setFen(g.fen());
    } catch (e) {
      console.error("Motor hatalı hamle üretti:", uci);
    }
  }

  function requestBotMove() {
    if (!engineRef.current || !readyRef.current || thinking) return;

    setThinking(true);
    const w = engineRef.current;
    w.postMessage("stop");
    w.postMessage(`position fen ${gameRef.current.fen()}`);
    w.postMessage(`go depth ${depthByDifficulty(difficulty)}`);
  }

  function onPlayMove() {
    const ok = applyUserMove(uciMove.trim().toLowerCase());
    if (ok) {
      // Hamle başarılıysa 500ms sonra bot hamlesini iste
      setTimeout(requestBotMove, 500);
    } else {
      alert("Geçersiz hamle! Lütfen 'e2e4' gibi geçerli bir UCI hamlesi girin.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 bg-slate-950 min-h-screen text-white">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">Trophy Chess Bot</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${engineStatus === "ready" ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
            <p className="text-slate-400 text-xs uppercase font-bold tracking-widest">
              {engineStatus === "ready" ? "Motor Hazır" : "Yükleniyor..."}
            </p>
          </div>
        </div>
        <button onClick={resetGame} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold uppercase transition">
          Sıfırla
        </button>
      </div>

      <div className="mt-8 grid gap-6">
        {/* Durum Paneli */}
        <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-white/5 shadow-2xl">
          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500 font-bold uppercase">Sıra Kimde:</span>
            <span className="text-indigo-400 font-black uppercase">{gameRef.current.turn() === "w" ? "Beyaz (Sen)" : "Siyah (Bot)"}</span>
          </div>
          
          <div className="bg-black/40 p-3 rounded-xl font-mono text-[10px] text-slate-500 break-all border border-white/5">
            FEN: {fen}
          </div>
        </div>

        {/* Kontroller */}
        <div className="bg-slate-900 p-6 rounded-[2rem] border border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Zorluk Seviyesi</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-indigo-500"
              >
                <option value="easy">Kolay (Hızlı)</option>
                <option value="medium">Normal</option>
                <option value="hard">Zor (Derin Analiz)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hamleni Yaz (UCI)</label>
              <div className="flex gap-2">
                <input
                  value={uciMove}
                  onChange={(e) => setUciMove(e.target.value)}
                  className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 ring-indigo-500"
                  placeholder="e2e4"
                />
                <button
                  onClick={onPlayMove}
                  disabled={engineStatus !== "ready" || thinking}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 rounded-xl font-black uppercase text-xs transition-all shadow-lg shadow-emerald-900/20"
                >
                  {thinking ? "..." : "Oyna"}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={requestBotMove}
            disabled={engineStatus !== "ready" || thinking}
            className="w-full mt-4 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-xl shadow-indigo-900/20"
          >
            {thinking ? "Bot Düşünüyor..." : "Sadece Botu Oynat"}
          </button>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-slate-600 text-[10px] uppercase font-bold tracking-[0.2em]">
          Trophy Chess Engine v1.0 • Stockfish 10 Powered
        </p>
      </div>
    </div>
  );
}
