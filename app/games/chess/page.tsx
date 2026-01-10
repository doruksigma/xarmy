"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

function createStockfishWorker() {
  if (typeof window === "undefined") return null;

  // asm.js build (WASM değil) -> daha az baş ağrıtır
  const stockfishURL =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

  const code = `
    try {
      self.importScripts("${stockfishURL}");
      if (typeof self.Stockfish === 'function') {
        const engine = self.Stockfish();

        engine.onmessage = (e) => {
          // bazı buildler string, bazıları {data:"..."} döner
          const msg = (typeof e === 'string') ? e : (e && e.data ? e.data : e);
          self.postMessage(msg);
        };

        self.onmessage = (e) => {
          engine.postMessage(e.data);
        };

        self.postMessage("SF_INIT_OK");
      } else {
        self.postMessage("SF_INIT_FAILED");
      }
    } catch (e) {
      self.postMessage("SF_INIT_FAILED::" + (e && e.message ? e.message : String(e)));
    }
  `;

  const blob = new Blob([code], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function pieceToChar(p: { type: PieceSymbol; color: Color }) {
  const map: any = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  return map[p.color][p.type];
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

type EvalRow = {
  move: string; // SAN
  score: number; // pawn units
  fenBefore: string;
};

export default function ChessPage() {
  const engine = useRef<Worker | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  // ✅ engine'in iki farklı işi var: bot hamlesi veya ipucu (internal task)
  const isInternalTask = useRef(false);

  const [fen, setFen] = useState(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  );
  const [mounted, setMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium"
  );

  const [playerColor, setPlayerColor] = useState<Color | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  const [moveEvaluations, setMoveEvaluations] = useState<EvalRow[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(
    null
  );
  const [hintLoading, setHintLoading] = useState(false);

  // ✅ Stockfish skor cache
  const lastScore = useRef<number>(0);

  // ✅ Teacher / AI explanation state
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  // ✅ bot hamlesi için son bilgi (buton "neden?" için)
  const lastBotMoveUci = useRef<string | null>(null);
  const lastBotMoveSan = useRef<string | null>(null);
  const lastBotFenBefore = useRef<string | null>(null);
  const lastBotScore = useRef<number>(0);

  const game = useMemo(() => {
    const currentFen =
      reviewIndex !== null ? moveEvaluations[reviewIndex]?.fenBefore : fen;
    return new Chess(currentFen || fen);
  }, [fen, reviewIndex, moveEvaluations]);

  const displayRanks = playerColor === "b" ? [...ranks].reverse() : ranks;
  const displayFiles = playerColor === "b" ? [...files].reverse() : files;

  const playMoveSound = () => {
    try {
      if (!audioCtx.current)
        audioCtx.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  };

  // ✅ AI explanation call
  async function fetchExplanation(payload: {
    fen: string;
    moveUci: string;
    moveSan?: string | null;
    score: number;
    playerColor: Color;
  }) {
    setExplainLoading(true);
    setExplanation("🎓 Öğretmen hamleyi açıklıyor...");

    try {
      const res = await fetch("/api/chess-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setExplanation(data?.reason || "Açıklama üretilemedi.");
    } catch (e) {
      setExplanation("Açıklama alınamadı (API hatası).");
    } finally {
      setExplainLoading(false);
    }
  }

  // ✅ Stockfish init + message handler
  useEffect(() => {
    setMounted(true);

    const w = createStockfishWorker();
    if (!w) return;
    engine.current = w;

    // handshake
    w.postMessage("uci");
    w.postMessage("isready");

    w.onmessage = (e) => {
      // ✅ önemli: her şeyi string'e normalize et
      const raw = e.data;
      const msg =
        typeof raw === "string" ? raw : raw?.data ?? String(raw ?? "");

      // init signals
      if (msg === "SF_INIT_OK") {
        // tekrar handshake
        w.postMessage("uci");
        w.postMessage("isready");
        return;
      }
      if (msg.startsWith("SF_INIT_FAILED")) {
        setIsReady(false);
        return;
      }

      // ready
      if (msg === "readyok") {
        setIsReady(true);
        return;
      }
      if (msg.includes("uciok")) {
        w.postMessage("isready");
        return;
      }

      // ✅ score updates
      if (msg.startsWith("info")) {
        // cp score
        const scoreMatch = msg.match(/score cp (-?\d+)/);
        if (scoreMatch) {
          lastScore.current = parseInt(scoreMatch[1], 10) / 100;

          // son satırın skorunu güncelle (isteğe bağlı)
          setMoveEvaluations((prev) => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...copy[copy.length - 1],
              score: lastScore.current,
            };
            return copy;
          });
        }
        return;
      }

      // ✅ bestmove
      if (msg.startsWith("bestmove")) {
        const moveUci = msg.split(" ")[1];
        if (!moveUci || moveUci === "(none)") {
          if (!isInternalTask.current) setThinking(false);
          setHintLoading(false);
          return;
        }

        const from = moveUci.slice(0, 2) as Square;
        const to = moveUci.slice(2, 4) as Square;

        if (isInternalTask.current) {
          // ipucu / analiz ok
          setHintMove({ from, to });
          setHintLoading(false);
          return;
        }

        // ✅ bot hamlesi uygula
        setFen((prevFen) => {
          const g = new Chess(prevFen);
          const fenBefore = prevFen;

          try {
            const m = g.move({ from, to, promotion: "q" });
            if (!m) return prevFen;

            playMoveSound();

            // maç listesine ekle
            setMoveEvaluations((prevEval) => [
              ...prevEval,
              { move: m.san, score: lastScore.current, fenBefore },
            ]);

            // ✅ "neden?" butonu için bot hamlesini kaydet
            lastBotMoveUci.current = moveUci;
            lastBotMoveSan.current = m.san;
            lastBotFenBefore.current = fenBefore;
            lastBotScore.current = lastScore.current;

            // bot hamle yaptı -> eski açıklamayı tut veya temizle (isteğe bağlı)
            // setExplanation(null);

            return g.fen();
          } catch {
            return prevFen;
          } finally {
            setThinking(false);
          }
        });

        return;
      }
    };

    return () => w.terminate();
  }, []);

  // ✅ Bot hamlesi otomatik tetik
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
      isInternalTask.current = false;

      const depths = { easy: 2, medium: 8, hard: 14 };
      const depth = depths[difficulty];

      // küçük gecikme daha stabil (UI click vs)
      setTimeout(() => {
        engine.current?.postMessage("stop");
        engine.current?.postMessage("ucinewgame");
        engine.current?.postMessage(`position fen ${fen}`);
        engine.current?.postMessage(`go depth ${depth}`);
      }, 450);
    }
  }, [fen, isReady, game, difficulty, reviewIndex, gameStarted, playerColor]);

  // ✅ Hint request
  const getHint = (targetFen?: string) => {
    if (!isReady) return;
    setHintLoading(true);
    isInternalTask.current = true;

    const currentFen = targetFen || fen;
    engine.current?.postMessage("stop");
    engine.current?.postMessage(`position fen ${currentFen}`);
    engine.current?.postMessage("go depth 15");
  };

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
      const gCopy = new Chess(fen);
      const fenBefore = fen;
      try {
        const move = gCopy.move({
          from: selected,
          to: square,
          promotion: "q",
        });

        if (move) {
          playMoveSound();
          setFen(gCopy.fen());

          // listeye ekle (ilk skor: son known)
          setMoveEvaluations((prev) => [
            ...prev,
            { move: move.san, score: lastScore.current, fenBefore },
          ]);

          setSelected(null);

          // kullanıcı hamlesinden sonra motoru kısa bir eval için tetikle (isteğe bağlı)
          isInternalTask.current = false;
          engine.current?.postMessage("stop");
          engine.current?.postMessage(`position fen ${gCopy.fen()}`);
          engine.current?.postMessage("go depth 10");

          return;
        }
      } catch {}
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) setSelected(square);
    else setSelected(null);
  }

  const getCoords = (square: Square) => {
    const f = files.indexOf(square[0] as any);
    const r = ranks.indexOf(square[1] as any);
    let x = f * 12.5 + 6.25;
    let y = r * 12.5 + 6.25;
    if (playerColor === "b") {
      x = 100 - x;
      y = 100 - y;
    }
    return { x, y };
  };

  const getMoveQuality = (current: number, prev: number, isWhite: boolean) => {
    const diff = isWhite ? current - prev : prev - current;
    if (diff < -2.0)
      return {
        label: "Blunder",
        color: "text-red-500",
        icon: "??",
        bg: "bg-red-500/10",
      };
    if (diff < -0.5)
      return {
        label: "Hata",
        color: "text-orange-500",
        icon: "?",
        bg: "bg-orange-500/10",
      };
    if (diff > 1.0)
      return {
        label: "Harika",
        color: "text-blue-400",
        icon: "!!",
        bg: "bg-blue-400/10",
      };
    return {
      label: "İyi",
      color: "text-emerald-400",
      icon: "✓",
      bg: "bg-emerald-400/10",
    };
  };

  if (!mounted) return null;

  // Start screen
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="bg-slate-900 p-12 rounded-[3rem] border border-white/5 text-center shadow-2xl max-w-sm w-full">
          <h1 className="text-4xl font-black text-white italic uppercase mb-3 tracking-tighter">
            X-CHESS
          </h1>

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
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all flex flex-col items-center gap-3 group"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">
                ♔
              </span>
              <span className="text-[10px] font-black uppercase text-slate-400">
                Beyaz
              </span>
            </button>

            <button
              onClick={() => {
                setPlayerColor("b");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all flex flex-col items-center gap-3 group"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">
                ♚
              </span>
              <span className="text-[10px] font-black uppercase text-slate-400">
                Siyah
              </span>
            </button>
          </div>

          {!isReady && (
            <p className="mt-6 text-xs text-slate-500">
              Eğer burada takılı kalıyorsa: CSP / CDN engeli vardır. (Vercel
              headers)
            </p>
          )}
        </div>
      </div>
    );
  }

  const isGameOver = new Chess(fen).isGameOver();

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col items-center font-sans selection:bg-indigo-500/30">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8">
        {/* BOARD */}
        <div className="flex-1 relative">
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-white/5 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <div className="flex flex-col">
                <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                  X-CHESS
                </h1>
                <span className="text-[10px] text-indigo-400 font-black uppercase mt-1 tracking-widest">
                  {reviewIndex !== null ? "● Analiz Modu" : "Canlı Maç"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${
                    isReady ? "text-emerald-400" : "text-orange-400"
                  }`}
                >
                  {isReady ? "ENGINE READY" : "ENGINE LOADING"}
                </span>

                {!isGameOver && (
                  <div className="flex gap-2 bg-slate-950 p-1 rounded-xl">
                    {(["easy", "medium", "hard"] as const).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setDifficulty(lvl)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                          difficulty === lvl
                            ? "bg-indigo-500 text-white"
                            : "text-slate-500"
                        }`}
                      >
                        {lvl === "easy"
                          ? "Kolay"
                          : lvl === "medium"
                          ? "Orta"
                          : "Zor"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              className={`aspect-square grid grid-cols-8 grid-rows-8 border-8 border-slate-800 rounded-2xl overflow-hidden bg-slate-800 relative shadow-2xl ${
                reviewIndex !== null ? "ring-4 ring-blue-500/50" : ""
              }`}
            >
              {hintMove && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-50"
                  viewBox="0 0 100 100"
                >
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#3b82f6" />
                  </marker>
                  <line
                    x1={`${getCoords(hintMove.from).x}`}
                    y1={`${getCoords(hintMove.from).y}`}
                    x2={`${getCoords(hintMove.to).x}`}
                    y2={`${getCoords(hintMove.to).y}`}
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    markerEnd="url(#arrowhead)"
                    opacity="0.9"
                  />
                </svg>
              )}

              {displayRanks.map((r, ri) =>
                displayFiles.map((f, fi) => {
                  const square = `${f}${r}` as Square;
                  const p = game.get(square);
                  const isDark = (ri + fi) % 2 === 1;

                  return (
                    <button
                      key={square}
                      onClick={() => onSquareClick(square)}
                      className={`relative w-full h-full flex items-center justify-center text-4xl md:text-5xl transition-all ${
                        isDark ? "bg-slate-800" : "bg-slate-700"
                      } ${
                        selected === square
                          ? "bg-indigo-500/40 ring-4 ring-indigo-500 ring-inset"
                          : "hover:bg-slate-600"
                      }`}
                    >
                      <span className="select-none pointer-events-none drop-shadow-lg z-10">
                        {p ? pieceToChar(p) : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* ACTIONS */}
            <div className="mt-6 flex gap-4">
              {reviewIndex !== null ? (
                <button
                  onClick={() => {
                    setReviewIndex(null);
                    setHintMove(null);
                  }}
                  className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs border border-white/5"
                >
                  İncelemeyi Kapat
                </button>
              ) : (
                <>
                  {!isGameOver && (
                    <button
                      onClick={() => getHint()}
                      disabled={thinking || hintLoading || !isReady}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg disabled:opacity-50"
                    >
                      💡 İpucu Al
                    </button>
                  )}
                  <button
                    onClick={() => window.location.reload()}
                    className={`${
                      isGameOver ? "flex-1" : "w-32"
                    } py-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl font-black uppercase text-xs border border-red-500/20 transition-all`}
                  >
                    Sıfırla
                  </button>
                </>
              )}
            </div>

            {/* ✅ NEW: "Neden bu hamle?" + Teacher panel */}
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
                disabled={
                  explainLoading ||
                  !lastBotMoveUci.current ||
                  !lastBotFenBefore.current ||
                  !playerColor
                }
                className="w-full py-4 rounded-2xl font-black uppercase text-xs border border-indigo-500/20
                           bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 transition-all
                           disabled:opacity-50"
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
                      <span className="ml-auto text-[10px] font-black text-slate-300 bg-black/20 px-2 py-1 rounded-lg">
                        {lastBotMoveSan.current} •{" "}
                        {lastBotScore.current >= 0 ? "+" : ""}
                        {lastBotScore.current.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-200 italic leading-relaxed">
                    “{explanation}”
                  </p>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setExplanation(null)}
                      className="px-3 py-2 rounded-xl bg-slate-950/50 text-slate-200 text-[10px] font-black uppercase hover:bg-slate-800 transition"
                    >
                      Kapat
                    </button>

                    <button
                      onClick={() => {
                        const moveUci = lastBotMoveUci.current;
                        const fenBefore = lastBotFenBefore.current;
                        if (!moveUci || !fenBefore || !playerColor) return;
                        fetchExplanation({
                          fen: fenBefore,
                          moveUci,
                          moveSan: lastBotMoveSan.current,
                          score: lastBotScore.current,
                          playerColor,
                        });
                      }}
                      disabled={explainLoading}
                      className="ml-auto px-3 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                      {explainLoading ? "Analiz..." : "Yenile"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MOVES PANEL */}
        <div className="w-full lg:w-96 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 flex-1 flex flex-col shadow-xl min-h-[500px]">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 italic text-center border-b border-white/5 pb-4">
              MAÇ ANALİZİ
            </h2>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {moveEvaluations.map((evalData, i) => {
                const isWhite = i % 2 === 0;
                const prevEval = i === 0 ? 0 : moveEvaluations[i - 1].score;
                const quality = getMoveQuality(
                  evalData.score,
                  prevEval,
                  isWhite
                );

                return (
                  <div
                    key={i}
                    onClick={() => {
                      setReviewIndex(i);
                      setHintMove(null);
                      getHint(moveEvaluations[i].fenBefore);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer group ${
                      reviewIndex === i
                        ? "ring-2 ring-blue-500 bg-blue-500/10"
                        : "bg-slate-950/50 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-600 font-black w-4">
                        {Math.floor(i / 2) + 1}.
                      </span>
                      <span
                        className={`font-bold ${
                          isWhite ? "text-white" : "text-indigo-300"
                        }`}
                      >
                        {evalData.move}
                      </span>
                    </div>

                    {quality && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-black uppercase ${quality.color}`}
                        >
                          {quality.label}
                        </span>
                        <span
                          className={`text-[10px] font-black ${quality.color}`}
                        >
                          {quality.icon}
                        </span>
                      </div>
                    )}
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
