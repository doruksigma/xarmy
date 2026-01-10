"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

type Difficulty = "easy" | "medium" | "hard";
type Task = "bot" | "hint" | "eval" | null;

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

function pieceToChar(p: { type: PieceSymbol; color: Color }) {
  const map: any = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  return map[p.color][p.type];
}

function depthByDifficulty(d: Difficulty) {
  if (d === "easy") return 6;
  if (d === "medium") return 10; // ✅ istek: bot depth 10
  return 14;
}

function isPromotionMove(g: Chess, from: Square, to: Square) {
  const pc = g.get(from);
  if (!pc || pc.type !== "p") return false;
  if (pc.color === "w" && to[1] === "8") return true;
  if (pc.color === "b" && to[1] === "1") return true;
  return false;
}

/**
 * ✅ İNDİRMEDEN STOCKFISH (CDN + Blob Worker)
 * - stockfish-mv.wasm paketi: stockfish.worker.js + stockfish.wasm içerir.
 * - Blob içinde importScripts ile aynı origin gibi çalışır; Vercel'de de stabil.
 */
function createStockfishWorker() {
  if (typeof window === "undefined") return null;

  // Worker-ready WASM build
  const STOCKFISH_WORKER_URL =
    "https://cdn.jsdelivr.net/npm/stockfish-mv.wasm/stockfish.worker.js";

  const code = `
    function send(m){ try{ self.postMessage(m); }catch(e){} }

    self.onerror = function(e){
      send("SF_WORKER_ERROR::" + (e && e.message ? e.message : "unknown"));
    };

    try {
      importScripts("${STOCKFISH_WORKER_URL}");
      // Bu import, kendi içinde onmessage handler kurar (UCI worker)
      send("SF_INIT_OK");
    } catch (e) {
      send("SF_INIT_FAILED::" + (e && e.message ? e.message : String(e)));
    }
  `;

  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  // URL.revokeObjectURL(url); // hemen revoke bazı ortamlarda sıkıntı çıkarabiliyor
  return w;
}

type EvalRow = { move: string; score: number; fenBefore: string };

export default function ChessPage() {
  const engineRef = useRef<Worker | null>(null);
  const taskRef = useRef<Task>(null);
  const lastScore = useRef<number>(0); // pawn units

  const [mounted, setMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [thinking, setThinking] = useState(false);

  const [fen, setFen] = useState(START_FEN);
  const [playerColor, setPlayerColor] = useState<Color | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  const [selected, setSelected] = useState<Square | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [moveEvaluations, setMoveEvaluations] = useState<EvalRow[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(
    null
  );
  const [hintLoading, setHintLoading] = useState(false);

  // promotion modal
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoFrom, setPromoFrom] = useState<Square | null>(null);
  const [promoTo, setPromoTo] = useState<Square | null>(null);

  // Teacher explanation (opsiyonel)
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const lastBotMoveUci = useRef<string | null>(null);
  const lastBotMoveSan = useRef<string | null>(null);
  const lastBotFenBefore = useRef<string | null>(null);
  const lastBotScore = useRef<number>(0);

  const sf = (m: string) => engineRef.current?.postMessage(m);

  const game = useMemo(() => {
    const currentFen =
      reviewIndex !== null ? moveEvaluations[reviewIndex]?.fenBefore : fen;
    return new Chess(currentFen || fen);
  }, [fen, reviewIndex, moveEvaluations]);

  const displayRanks = playerColor === "b" ? [...ranks].reverse() : ranks;
  const displayFiles = playerColor === "b" ? [...files].reverse() : files;

  // ✅ Arrow coords fix (black side too)
  const getPos = (sq: Square) => {
    let f = files.indexOf(sq[0] as any);
    let r = ranks.indexOf(sq[1] as any);
    if (playerColor === "b") {
      f = 7 - f;
      r = 7 - r;
    }
    return { x: f * 12.5 + 6.25, y: r * 12.5 + 6.25 };
  };

  // --- init engine once ---
  useEffect(() => {
    setMounted(true);

    const w = createStockfishWorker();
    if (!w) {
      setIsReady(false);
      return;
    }
    engineRef.current = w;

    const onMsg = (e: MessageEvent) => {
      const msg = typeof e.data === "string" ? e.data : String(e.data ?? "");
      // console.log("SF:", msg);

      if (msg.startsWith("SF_INIT_FAILED")) {
        setIsReady(false);
        return;
      }

      if (msg.startsWith("SF_WORKER_ERROR::")) {
        setIsReady(false);
        return;
      }

      if (msg === "SF_INIT_OK") {
        sf("uci");
        sf("isready");
        return;
      }

      if (msg.includes("uciok")) {
        sf("isready");
        return;
      }

      if (msg.includes("readyok")) {
        setIsReady(true);
        return;
      }

      // score stream
      if (msg.startsWith("info")) {
        // Stockfish sends cp in centipawns
        const m = msg.match(/score cp (-?\d+)/);
        if (m) lastScore.current = parseInt(m[1], 10) / 100;
        return;
      }

      // bestmove
      if (msg.startsWith("bestmove")) {
        const moveUci = msg.split(" ")[1];
        const currentTask = taskRef.current;
        taskRef.current = null;

        if (!moveUci || moveUci === "(none)") {
          if (currentTask === "bot") setThinking(false);
          if (currentTask === "hint") setHintLoading(false);
          return;
        }

        const from = moveUci.slice(0, 2) as Square;
        const to = moveUci.slice(2, 4) as Square;

        if (currentTask === "hint") {
          setHintMove({ from, to });
          setHintLoading(false);
          return;
        }

        if (currentTask === "eval") {
          return;
        }

        if (currentTask === "bot") {
          setFen((prevFen) => {
            const g = new Chess(prevFen);
            if (g.isGameOver()) return prevFen;
            const fenBefore = prevFen;

            try {
              const m = g.move({ from, to, promotion: "q" });
              if (!m) return prevFen;

              setMoveEvaluations((p) => [
                ...p,
                { move: m.san, score: lastScore.current, fenBefore },
              ]);

              lastBotMoveUci.current = moveUci;
              lastBotMoveSan.current = m.san;
              lastBotFenBefore.current = fenBefore;
              lastBotScore.current = lastScore.current;

              return g.fen();
            } catch {
              return prevFen;
            } finally {
              setThinking(false);
            }
          });
        }
      }
    };

    w.addEventListener("message", onMsg);

    // Kick
    sf("uci");
    sf("isready");

    return () => {
      w.removeEventListener("message", onMsg);
      w.terminate();
      engineRef.current = null;
    };
  }, []);

  // --- bot auto move ---
  useEffect(() => {
    if (
      gameStarted &&
      playerColor &&
      game.turn() !== playerColor &&
      !game.isGameOver() &&
      isReady &&
      reviewIndex === null
    ) {
      setThinking(true);
      taskRef.current = "bot";

      const depth = depthByDifficulty(difficulty);

      const t = setTimeout(() => {
        sf("stop");
        sf("ucinewgame");
        sf(`position fen ${fen}`);
        sf(`go depth ${depth}`); // ✅ bot depth
      }, 200);

      return () => clearTimeout(t);
    }
  }, [fen, isReady, gameStarted, playerColor, difficulty, reviewIndex, game]);

  // --- hint ---
  const getHint = (targetFen?: string) => {
    if (!isReady) return;
    setHintLoading(true);
    taskRef.current = "hint";

    const currentFen = targetFen || fen;
    sf("stop");
    sf(`position fen ${currentFen}`);
    sf("go depth 12");
  };

  const requestEvalOnly = (targetFen: string) => {
    if (!isReady) return;
    taskRef.current = "eval";
    sf("stop");
    sf(`position fen ${targetFen}`);
    sf("go depth 10");
  };

  async function fetchExplanation(payload: {
    fen: string;
    moveUci: string;
    moveSan?: string | null;
    score: number;
    playerColor: Color;
  }) {
    setExplainLoading(true);
    setExplanation("🎓 Öğretmen açıklıyor...");

    try {
      const res = await fetch("/api/chess-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setExplanation(data?.reason || "Açıklama üretilemedi.");
    } catch {
      setExplanation("Açıklama alınamadı (API hatası).");
    } finally {
      setExplainLoading(false);
    }
  }

  function onSquareClick(square: Square) {
    if (
      !gameStarted ||
      !playerColor ||
      game.turn() !== playerColor ||
      thinking ||
      game.isGameOver() ||
      reviewIndex !== null
    )
      return;

    setHintMove(null);

    if (selected) {
      const g = new Chess(fen);
      const fenBefore = fen;

      try {
        // ✅ promotion modal
        if (isPromotionMove(g, selected, square)) {
          setPromoFrom(selected);
          setPromoTo(square);
          setPromoOpen(true);
          return;
        }

        const move = g.move({ from: selected, to: square, promotion: "q" });
        if (move) {
          setFen(g.fen());
          setMoveEvaluations((p) => [
            ...p,
            { move: move.san, score: lastScore.current, fenBefore },
          ]);
          setSelected(null);

          requestEvalOnly(g.fen());
          return;
        }
      } catch {}
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) setSelected(square);
    else setSelected(null);
  }

  function applyPromotion(piece: "q" | "r" | "b" | "n") {
    if (!promoFrom || !promoTo) {
      setPromoOpen(false);
      return;
    }

    const g = new Chess(fen);
    const fenBefore = fen;

    try {
      const mv = g.move({ from: promoFrom, to: promoTo, promotion: piece });
      if (mv) {
        setFen(g.fen());
        setMoveEvaluations((p) => [...p, { move: mv.san, score: lastScore.current, fenBefore }]);
        setSelected(null);
        requestEvalOnly(g.fen());
      }
    } catch {
      // ignore
    } finally {
      setPromoOpen(false);
      setPromoFrom(null);
      setPromoTo(null);
    }
  }

  const getMoveQuality = (current: number, prev: number, isWhite: boolean) => {
    const diff = isWhite ? current - prev : prev - current;
    if (diff < -2.0) return { label: "Blunder", color: "text-red-400", icon: "??" };
    if (diff < -0.6) return { label: "Hata", color: "text-orange-400", icon: "?" };
    if (diff > 1.2) return { label: "Harika", color: "text-blue-300", icon: "!!" };
    return { label: "İyi", color: "text-emerald-300", icon: "✓" };
  };

  if (!mounted) return null;

  // Start screen
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-white/5 text-center max-w-sm w-full">
          <h1 className="text-4xl font-black text-white italic uppercase mb-3">X-CHESS</h1>

          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">
            Engine:{" "}
            <span className={isReady ? "text-emerald-400" : "text-orange-400"}>
              {isReady ? "READY" : "LOADING"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setPlayerColor("w");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5"
            >
              <div className="text-5xl">♔</div>
              <div className="text-[10px] font-black uppercase text-slate-400 mt-2">Beyaz</div>
            </button>

            <button
              onClick={() => {
                setPlayerColor("b");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5"
            >
              <div className="text-5xl">♚</div>
              <div className="text-[10px] font-black uppercase text-slate-400 mt-2">Siyah</div>
            </button>
          </div>

          {!isReady && (
            <p className="mt-6 text-xs text-slate-500">
              LOADING’de kalırsa: network/CSP engeli olabilir. (Worker CDN importScripts)
            </p>
          )}
        </div>
      </div>
    );
  }

  const isGameOver = new Chess(fen).isGameOver();

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8">
        {/* BOARD */}
        <div className="flex-1">
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-white/5 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-black text-white italic uppercase">X-CHESS</h1>
                <div className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mt-1">
                  {reviewIndex !== null ? "● Analiz Modu" : "Canlı Maç"} {thinking ? " • bot düşünüyor…" : ""}
                </div>
              </div>

              {!isGameOver && (
                <div className="flex gap-2 bg-slate-950 p-1 rounded-xl">
                  {(["easy", "medium", "hard"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setDifficulty(lvl)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                        difficulty === lvl ? "bg-indigo-500 text-white" : "text-slate-400"
                      }`}
                    >
                      {lvl === "easy" ? "Kolay" : lvl === "medium" ? "Orta" : "Zor"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ✅ classic yellow/brown board */}
            <div className="aspect-square grid grid-cols-8 grid-rows-8 border-8 border-amber-950 rounded-2xl overflow-hidden bg-amber-950 relative">
              {/* ✅ analysis mode lock overlay */}
              {reviewIndex !== null && (
                <div className="absolute inset-0 z-40 bg-black/20 pointer-events-auto" />
              )}

              {hintMove && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-50" viewBox="0 0 100 100">
                  <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb" />
                  </marker>
                  {(() => {
                    const start = getPos(hintMove.from);
                    const end = getPos(hintMove.to);
                    return (
                      <line
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="#2563eb"
                        strokeWidth="2.8"
                        markerEnd="url(#arrowhead)"
                        opacity="0.92"
                      />
                    );
                  })()}
                </svg>
              )}

              {displayRanks.map((r, ri) =>
                displayFiles.map((f, fi) => {
                  const sq = `${f}${r}` as Square;
                  const p = game.get(sq);
                  const isDark = (ri + fi) % 2 === 1;

                  const base = isDark ? "bg-amber-900" : "bg-amber-100";
                  const hover = isDark ? "hover:bg-amber-800" : "hover:bg-amber-200";

                  return (
                    <button
                      key={sq}
                      onClick={() => onSquareClick(sq)}
                      className={`relative w-full h-full flex items-center justify-center
                        text-3xl sm:text-4xl md:text-5xl transition-all
                        ${base} ${hover}
                        ${selected === sq ? "ring-4 ring-emerald-500 ring-inset" : ""}
                      `}
                    >
                      <span
                        className="select-none pointer-events-none"
                        style={{
                          textShadow: "0 2px 0 rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.30)",
                        }}
                      >
                        {p ? pieceToChar(p) : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex gap-4">
              {reviewIndex !== null ? (
                <button
                  onClick={() => {
                    setReviewIndex(null);
                    setHintMove(null);
                  }}
                  className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs"
                >
                  İncelemeyi Kapat
                </button>
              ) : (
                <>
                  {!isGameOver && (
                    <button
                      onClick={() => getHint()}
                      disabled={thinking || hintLoading || !isReady}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs disabled:opacity-50"
                    >
                      {hintLoading ? "💡 İpucu aranıyor…" : "💡 İpucu Al"}
                    </button>
                  )}
                  <button
                    onClick={() => window.location.reload()}
                    className={`${
                      isGameOver ? "flex-1" : "w-32"
                    } py-4 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl font-black uppercase text-xs`}
                  >
                    Sıfırla
                  </button>
                </>
              )}
            </div>

            {/* WHY BUTTON (opsiyonel / api varsa) */}
            <div className="mt-4">
              <button
                onClick={() => {
                  const moveUci = lastBotMoveUci.current;
                  const fenBefore = lastBotFenBefore.current;
                  if (!moveUci || !fenBefore || !playerColor) {
                    setExplanation("Önce bot bir hamle yapsın 🙂");
                    return;
                  }
                  fetchExplanation({
                    fen: fenBefore,
                    moveUci,
                    moveSan: lastBotMoveSan.current,
                    score: lastBotScore.current,
                    playerColor,
                  });
                }}
                disabled={explainLoading || !lastBotMoveUci.current || !lastBotFenBefore.current}
                className="w-full py-4 rounded-2xl font-black uppercase text-xs border border-indigo-500/20
                           bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
              >
                🎓 Neden bu hamle?
              </button>

              {explanation && (
                <div className="mt-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🎓</span>
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">
                      Öğretmen Notu
                    </span>
                    {lastBotMoveSan.current && (
                      <span className="ml-auto text-[10px] font-black text-slate-200 bg-black/20 px-2 py-1 rounded-lg">
                        {lastBotMoveSan.current} •{" "}
                        {(lastBotScore.current >= 0 ? "+" : "") + lastBotScore.current.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 italic leading-relaxed">“{explanation}”</p>
                </div>
              )}
            </div>

            {/* PROMOTION MODAL */}
            {promoOpen && (
              <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4">
                <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/10 p-6">
                  <div className="text-white font-black text-lg mb-2">Terfi Seç</div>
                  <div className="text-slate-400 text-xs mb-5">
                    Piyon son sıraya geldi. Hangi taş?
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {([
                      { id: "q", label: "Vezir" },
                      { id: "r", label: "Kale" },
                      { id: "b", label: "Fil" },
                      { id: "n", label: "At" },
                    ] as const).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => applyPromotion(p.id)}
                        className="py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-xs"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setPromoOpen(false);
                      setPromoFrom(null);
                      setPromoTo(null);
                    }}
                    className="mt-4 w-full py-3 rounded-2xl bg-red-500/10 text-red-300 hover:bg-red-500/20 font-black text-xs"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MOVES */}
        <div className="w-full lg:w-96">
          <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 shadow-xl min-h-[520px]">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 italic text-center border-b border-white/5 pb-4">
              MAÇ ANALİZİ
            </h2>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
              {moveEvaluations.map((m, i) => {
                const isWhite = i % 2 === 0;
                const prevEval = i === 0 ? 0 : moveEvaluations[i - 1].score;
                const quality = getMoveQuality(m.score, prevEval, isWhite);

                return (
                  <div
                    key={i}
                    onClick={() => {
                      setReviewIndex(i);
                      setHintMove(null);
                      getHint(m.fenBefore);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer
                      ${reviewIndex === i ? "ring-2 ring-blue-500 bg-blue-500/10" : "bg-slate-950/50 hover:bg-slate-800"}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-500 font-black w-6">{Math.floor(i / 2) + 1}.</span>
                      <span className={`font-bold ${i % 2 === 0 ? "text-white" : "text-indigo-200"}`}>{m.move}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase ${quality.color}`}>{quality.label}</span>
                      <span className={`text-[10px] font-black ${quality.color}`}>{quality.icon}</span>
                    </div>
                  </div>
                );
              })}

              {moveEvaluations.length === 0 && (
                <div className="text-center text-xs text-slate-500 mt-12">
                  Henüz hamle yok. Başla ve hamle yap 🙂
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
