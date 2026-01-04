"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

function createStockfishWorker() {
  if (typeof window === "undefined") return null;
  // engine.worker.ts ile aynı klasörde olmalı
  return new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

function sq(file: typeof files[number], rank: typeof ranks[number]) {
  return `${file}${rank}` as Square;
}

function pieceToChar(p: { type: PieceSymbol; color: Color }) {
  const map: Record<Color, Record<PieceSymbol, string>> = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  return map[p.color][p.type];
}

export default function XChess() {
  const engine = useRef<Worker | null>(null);

  const [fen, setFen] = useState(() => new Chess().fen());
  const game = useMemo(() => new Chess(fen), [fen]);

  const [mounted, setMounted] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [thinking, setThinking] = useState(false);

  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<Square>>(new Set());

  // =========================
  // 1) Engine init
  // =========================
  useEffect(() => {
    setMounted(true);

    const w = createStockfishWorker();
    if (!w) return;

    engine.current = w;

    // Debug istersen aç:
    // console.log("Stockfish: starting...");

    w.onmessage = (e) => {
      const line = String(e.data || "");

      // Debug istersen aç:
      // console.log("SF:", line);

      if (line === "uciok") {
        w.postMessage("isready");
      }

      if (line === "readyok") {
        setIsEngineReady(true);

        // performans ayarı (isteğe bağlı)
        w.postMessage("setoption name Threads value 2");
        w.postMessage("setoption name Hash value 64");
        w.postMessage("ucinewgame");
      }

      if (line.startsWith("bestmove")) {
        const uci = line.split(" ")[1];

        if (!uci || uci === "(none)") {
          setThinking(false);
          return;
        }

        const from = uci.slice(0, 2) as Square;
        const to = uci.slice(2, 4) as Square;
        const promotion = uci.length > 4 ? uci[4] : "q";

        setFen((prevFen) => {
          const g = new Chess(prevFen);
          try {
            g.move({ from, to, promotion });
            return g.fen();
          } catch {
            return prevFen;
          } finally {
            setThinking(false);
          }
        });
      }
    };

    // UCI handshake başlat
    w.postMessage("uci");

    return () => {
      w.terminate();
      engine.current = null;
    };
  }, []);

  // =========================
  // 2) Bot move trigger (Black)
  // =========================
  useEffect(() => {
    if (!isEngineReady) return;
    if (!engine.current) return;

    const g = new Chess(fen);
    if (g.isGameOver()) return;

    if (g.turn() === "b") {
      setThinking(true);

      engine.current.postMessage("ucinewgame");
      engine.current.postMessage(`position fen ${g.fen()}`);

      // “go” tek seferde ver
      engine.current.postMessage("go depth 12"); // istersen 18 yap
    }
  }, [fen, isEngineReady]);

  // =========================
  // Helpers
  // =========================
  function recomputeTargets(from: Square | null) {
    if (!from) {
      setLegalTargets(new Set());
      return;
    }
    const moves = game.moves({ square: from, verbose: true }) as Array<{ to: Square }>;
    setLegalTargets(new Set(moves.map((m) => m.to)));
  }

  function reset() {
    const g = new Chess();
    setFen(g.fen());
    setSelected(null);
    setLegalTargets(new Set());
    setThinking(false);
    // engine varsa oyun sıfırlandığını söyle
    if (engine.current && isEngineReady) {
      engine.current.postMessage("ucinewgame");
      engine.current.postMessage(`position fen ${g.fen()}`);
    }
  }

  // =========================
  // Click-to-move (White)
  // =========================
  function onSquareClick(square: Square) {
    if (game.turn() !== "w") return;
    if (game.isGameOver()) return;
    if (thinking) return;

    const piece = game.get(square);

    // 1) seçim yoksa: sadece beyaz taş seç
    if (!selected) {
      if (piece && piece.color === "w") {
        setSelected(square);
        recomputeTargets(square);
      }
      return;
    }

    // 2) aynı kareye basınca seçim iptal
    if (selected === square) {
      setSelected(null);
      setLegalTargets(new Set());
      return;
    }

    // 3) hamle dene
    try {
      const gCopy = new Chess(fen);
      const moved = gCopy.move({ from: selected, to: square, promotion: "q" });

      if (moved) {
        setFen(gCopy.fen());
        setSelected(null);
        setLegalTargets(new Set());
        return;
      }
    } catch {}

    // 4) hamle olmadıysa: başka beyaz taş seçilebilir
    if (piece && piece.color === "w") {
      setSelected(square);
      recomputeTargets(square);
    } else {
      setSelected(null);
      setLegalTargets(new Set());
    }
  }

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-4 flex items-center justify-center">
      <div className="w-full max-w-3xl bg-slate-900 border border-white/10 rounded-[2.5rem] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">
              X-Chess
            </h1>

            <p
              className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                thinking ? "text-orange-400 animate-pulse" : "text-emerald-400"
              }`}
            >
              {game.turn() === "w"
                ? "● Senin Sıran"
                : thinking
                ? "○ Bot Düşünüyor..."
                : isEngineReady
                ? "○ Bot Sırası"
                : "○ Motor Yükleniyor..."}
            </p>

            <p className="text-[10px] text-slate-400 mt-1">
              Taş seç → hedef kareye tıkla.
            </p>
          </div>

          <button
            onClick={reset}
            className="bg-white/5 hover:bg-red-500/20 text-slate-300 text-[10px] font-black px-5 py-2.5 rounded-2xl transition border border-white/10"
          >
            SIFIRLA
          </button>
        </div>

        <div className="mx-auto w-full max-w-[500px] aspect-square rounded-2xl overflow-hidden border-[6px] border-slate-800 shadow-2xl">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {ranks.map((r, ri) =>
              files.map((f, fi) => {
                const square = sq(f, r);
                const isDark = (ri + fi) % 2 === 1;
                const p = game.get(square);
                const isSelected = selected === square;
                const isTarget = legalTargets.has(square);

                return (
                  <button
                    key={square}
                    onClick={() => onSquareClick(square)}
                    className={`relative w-full h-full flex items-center justify-center text-4xl md:text-5xl ${
                      isDark ? "bg-slate-800" : "bg-slate-700"
                    } ${isSelected ? "bg-emerald-900/50 ring-4 ring-emerald-400 ring-inset" : ""}`}
                    style={{ cursor: "pointer" }}
                    aria-label={`square-${square}`}
                  >
                    {isTarget && <span className="absolute w-3 h-3 rounded-full bg-emerald-400/40" />}
                    <span className="select-none leading-none">{p ? pieceToChar(p) : ""}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-slate-800/40 p-5 rounded-3xl border border-white/5 text-center text-white font-bold">
            Stockfish (local)
          </div>
          <div className="bg-slate-800/40 p-5 rounded-3xl border border-white/5 text-center text-emerald-400 font-bold uppercase">
            {game.isGameOver() ? "BİTTİ" : "CANLI"}
          </div>
        </div>
      </div>
    </div>
  );
}
