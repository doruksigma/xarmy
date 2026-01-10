"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

type Difficulty = "easy" | "medium" | "hard";
type EvalRow = { move: string; score: number | null; fenBefore: string };

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

function depthLabel(d: Difficulty) {
  if (d === "easy") return "Kolay";
  if (d === "medium") return "Orta";
  return "Zor";
}

function clampText(s: string) {
  return String(s || "").slice(0, 4000);
}

export default function ChessPage() {
  const audioCtx = useRef<AudioContext | null>(null);

  const [mounted, setMounted] = useState(false);

  // Oyun durumu
  const [fen, setFen] = useState(START_FEN);
  const [playerColor, setPlayerColor] = useState<Color | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [thinking, setThinking] = useState(false);

  // Analiz geçmişi
  const [moveEvaluations, setMoveEvaluations] = useState<EvalRow[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  // Hint
  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(
    null
  );
  const [hintLoading, setHintLoading] = useState(false);

  // Öğretmen
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  // Bot hafızası
  const lastBotMoveUci = useRef<string | null>(null);
  const lastBotMoveSan = useRef<string | null>(null);
  const lastBotFenBefore = useRef<string | null>(null);
  const lastBotScore = useRef<number | null>(null);

  const game = useMemo(() => {
    const currentFen =
      reviewIndex !== null ? moveEvaluations[reviewIndex]?.fenBefore : fen;
    return new Chess(currentFen || fen);
  }, [fen, reviewIndex, moveEvaluations]);

  const displayRanks = playerColor === "b" ? [...ranks].reverse() : ranks;
  const displayFiles = playerColor === "b" ? [...files].reverse() : files;

  useEffect(() => {
    setMounted(true);
  }, []);

  const ensureAudio = useCallback(async () => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      if (audioCtx.current.state === "suspended") {
        await audioCtx.current.resume();
      }
    } catch {}
  }, []);

  const playMoveSound = useCallback(() => {
    try {
      if (!audioCtx.current) return;
      const ctx = audioCtx.current;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.11);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    } catch {}
  }, []);

  // Lichess (best move + eval)
  const getLichessMove = useCallback(
    async (targetFen: string) => {
      const res = await fetch("/api/lichess-bestmove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: targetFen, difficulty }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error("lichess-bestmove failed: " + t.slice(0, 200));
      }

      const data = await res.json();
      return {
        bestMoveUci:
          typeof data?.bestMoveUci === "string" ? data.bestMoveUci : null,
        evalCp: typeof data?.evalCp === "number" ? data.evalCp : null,
      } as { bestMoveUci: string | null; evalCp: number | null };
    },
    [difficulty]
  );

  const fetchExplanation = useCallback(
    async (payload: {
      fen: string;
      moveUci: string;
      moveSan?: string | null;
      score: number;
      playerColor: Color;
    }) => {
      setExplainLoading(true);
      setExplanation("🎓 Öğretmen hamleyi analiz ediyor...");

      try {
        const res = await fetch("/api/chess-coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        setExplanation(clampText(data?.reason || "Açıklama üretilemedi."));
      } catch {
        setExplanation("Bağlantı hatası oluştu.");
      } finally {
        setExplainLoading(false);
      }
    },
    []
  );

  // SVG ok koordinatı (siyah ters çevirme dahil)
  const getPos = useCallback(
    (sq: Square) => {
      let f = files.indexOf(sq[0] as any);
      let r = ranks.indexOf(sq[1] as any);
      if (playerColor === "b") {
        f = 7 - f;
        r = 7 - r;
      }
      return { x: f * 12.5 + 6.25, y: r * 12.5 + 6.25 };
    },
    [playerColor]
  );

  // Bot hamlesi (Stockfish yok, Lichess var)
  useEffect(() => {
    if (!gameStarted || !playerColor) return;
    if (reviewIndex !== null) return;
    if (thinking) return;

    const gNow = new Chess(fen);
    if (gNow.isGameOver()) return;
    if (gNow.turn() === playerColor) return; // sıra oyuncuda

    let cancelled = false;

    const t = setTimeout(async () => {
      setThinking(true);
      setHintMove(null);

      try {
        const { bestMoveUci, evalCp } = await getLichessMove(fen);
        if (cancelled) return;

        // oyuncunun bir önceki hamlesinin skorunu bot verisiyle doldur
        const scorePawn = evalCp !== null ? evalCp / 100 : 0;
        setMoveEvaluations((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          // en son kayıt oyuncu hamlesiyse (çoğunlukla) onun skorunu güncelle
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            score: scorePawn,
          };
          return copy;
        });

        if (!bestMoveUci || bestMoveUci === "(none)") return;

        const from = bestMoveUci.slice(0, 2) as Square;
        const to = bestMoveUci.slice(2, 4) as Square;
        const promo =
          bestMoveUci.length >= 5 ? bestMoveUci[4].toLowerCase() : undefined;

        setFen((prevFen) => {
          const gg = new Chess(prevFen);
          if (gg.isGameOver()) return prevFen;

          const fenBefore = prevFen;
          const m = gg.move({
            from,
            to,
            promotion:
              promo === "q" || promo === "r" || promo === "b" || promo === "n"
                ? (promo as any)
                : "q",
          });

          if (!m) return prevFen;

          playMoveSound();

          setMoveEvaluations((p) => [
            ...p,
            { move: m.san, score: scorePawn, fenBefore },
          ]);

          lastBotMoveUci.current = bestMoveUci;
          lastBotMoveSan.current = m.san;
          lastBotFenBefore.current = fenBefore;
          lastBotScore.current = scorePawn;

          return gg.fen();
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setThinking(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    fen,
    gameStarted,
    playerColor,
    reviewIndex,
    thinking,
    getLichessMove,
    playMoveSound,
  ]);

  // Hint (Lichess best move)
  const getHint = useCallback(async () => {
    if (!gameStarted || !playerColor) return;
    if (reviewIndex !== null) return;

    setHintLoading(true);
    setHintMove(null);

    try {
      const { bestMoveUci } = await getLichessMove(fen);
      if (!bestMoveUci || bestMoveUci === "(none)") return;

      const from = bestMoveUci.slice(0, 2) as Square;
      const to = bestMoveUci.slice(2, 4) as Square;
      setHintMove({ from, to });
    } catch (e) {
      console.error(e);
    } finally {
      setHintLoading(false);
    }
  }, [fen, gameStarted, playerColor, reviewIndex, getLichessMove]);

  function onSquareClick(square: Square) {
    if (!gameStarted || !playerColor) return;
    if (thinking) return;
    if (reviewIndex !== null) return;
    if (game.isGameOver()) return;
    if (game.turn() !== playerColor) return;

    setHintMove(null);

    if (selected) {
      const g = new Chess(fen);
      const fenBefore = fen;

      try {
        const move = g.move({ from: selected, to: square, promotion: "q" });
        if (move) {
          playMoveSound();
          setFen(g.fen());

          // skor bot gelince dolacak
          setMoveEvaluations((p) => [
            ...p,
            { move: move.san, score: null, fenBefore },
          ]);

          setSelected(null);
          return;
        }
      } catch {}
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) setSelected(square);
    else setSelected(null);
  }

  const getMoveQuality = (
    current: number | null,
    prev: number | null,
    isWhiteMove: boolean
  ) => {
    if (current === null || prev === null) {
      return { label: "Analiz", color: "text-slate-500", icon: "●" };
    }
    // beyaz hamlesi: current-prev kötüleşirse negatif
    const diff = isWhiteMove ? current - prev : prev - current;

    if (diff < -2.0) return { label: "Blunder", color: "text-red-400", icon: "??" };
    if (diff < -0.6) return { label: "Hata", color: "text-orange-400", icon: "?" };
    if (diff > 1.2) return { label: "Harika", color: "text-blue-300", icon: "!!" };
    return { label: "İyi", color: "text-emerald-300", icon: "✓" };
  };

  if (!mounted) return null;

  // START SCREEN
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-white/5 text-center max-w-sm w-full shadow-2xl">
          <h1 className="text-4xl font-black text-white italic uppercase mb-3">
            X-CHESS
          </h1>

          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">
            Engine: <span className="text-emerald-400">LICHESS CLOUD</span>
          </div>

          <div className="flex gap-2 bg-slate-950 p-1 rounded-xl mb-8 justify-center">
            {(["easy", "medium", "hard"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setDifficulty(lvl)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                  difficulty === lvl ? "bg-indigo-500 text-white" : "text-slate-400"
                }`}
              >
                {depthLabel(lvl)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={async () => {
                await ensureAudio();
                setPlayerColor("w");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5"
            >
              <div className="text-5xl">♔</div>
              <div className="text-[10px] font-black uppercase text-slate-400 mt-2">
                Beyaz
              </div>
            </button>

            <button
              onClick={async () => {
                await ensureAudio();
                setPlayerColor("b");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5"
            >
              <div className="text-5xl">♚</div>
              <div className="text-[10px] font-black uppercase text-slate-400 mt-2">
                Siyah
              </div>
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-500">
            Stockfish yok. Bot ve ipucu Lichess Cloud Eval ile gelir.
          </p>
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
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-white/5 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-black text-white italic uppercase">
                  X-CHESS
                </h1>
                <div className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mt-1">
                  {reviewIndex !== null ? "● Analiz Modu" : "Canlı Maç"}
                  {thinking ? " • bot düşünüyor…" : ""}
                </div>
              </div>

              {!isGameOver && (
                <div className="flex gap-2 bg-slate-950 p-1 rounded-xl">
                  {(["easy", "medium", "hard"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setDifficulty(lvl)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                        difficulty === lvl
                          ? "bg-indigo-500 text-white"
                          : "text-slate-400"
                      }`}
                    >
                      {depthLabel(lvl)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* classic yellow/brown board */}
            <div className="relative">
              <div className="aspect-square grid grid-cols-8 grid-rows-8 border-8 border-amber-950 rounded-2xl overflow-hidden bg-amber-950 relative">
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
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb" />
                    </marker>

                    {(() => {
                      const a = getPos(hintMove.from);
                      const b = getPos(hintMove.to);
                      return (
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
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
                    const hover = isDark
                      ? "hover:bg-amber-800"
                      : "hover:bg-amber-200";

                    const selectedRing =
                      selected === sq ? "ring-4 ring-emerald-500 ring-inset" : "";

                    return (
                      <button
                        key={sq}
                        onClick={() => onSquareClick(sq)}
                        className={`relative w-full h-full flex items-center justify-center transition-all
                          ${base} ${hover} ${selectedRing}
                        `}
                      >
                        <span
                          className="select-none pointer-events-none text-3xl sm:text-4xl md:text-5xl"
                          style={{
                            // taşlar daha net
                            textShadow:
                              "0 2px 0 rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.30)",
                          }}
                        >
                          {p ? pieceToChar(p) : ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Analiz modunda kilit overlay */}
              {reviewIndex !== null && (
                <div className="absolute inset-0 rounded-2xl bg-black/20 pointer-events-none" />
              )}
            </div>

            <div className="mt-6 flex gap-4">
              {reviewIndex !== null ? (
                <button
                  onClick={() => {
                    setReviewIndex(null);
                    setHintMove(null);
                    setSelected(null);
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
                      disabled={thinking || hintLoading}
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

            {/* WHY BUTTON */}
            <div className="mt-4">
              <button
                onClick={() => {
                  const moveUci = lastBotMoveUci.current;
                  const fenBefore = lastBotFenBefore.current;
                  const score = lastBotScore.current;

                  if (!moveUci || !fenBefore || !playerColor || score === null) {
                    setExplanation("Önce bot bir hamle yapsın 🙂");
                    return;
                  }

                  fetchExplanation({
                    fen: fenBefore,
                    moveUci,
                    moveSan: lastBotMoveSan.current,
                    score,
                    playerColor,
                  });
                }}
                disabled={
                  explainLoading ||
                  !lastBotMoveUci.current ||
                  !lastBotFenBefore.current ||
                  lastBotScore.current === null
                }
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
                    {lastBotMoveSan.current && lastBotScore.current !== null && (
                      <span className="ml-auto text-[10px] font-black text-slate-200 bg-black/20 px-2 py-1 rounded-lg">
                        {lastBotMoveSan.current} •{" "}
                        {(lastBotScore.current >= 0 ? "+" : "") +
                          lastBotScore.current.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 italic leading-relaxed">
                    “{explanation}”
                  </p>
                </div>
              )}
            </div>
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
                const prev = i === 0 ? null : moveEvaluations[i - 1].score;
                const isWhiteMove = i % 2 === 0;
                const q = getMoveQuality(m.score, prev, isWhiteMove);

                return (
                  <div
                    key={i}
                    onClick={() => {
                      setReviewIndex(i);
                      setHintMove(null);
                      setSelected(null);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer
                      ${
                        reviewIndex === i
                          ? "ring-2 ring-blue-500 bg-blue-500/10"
                          : "bg-slate-950/50 hover:bg-slate-800"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-500 font-black w-6">
                        {Math.floor(i / 2) + 1}.
                      </span>
                      <span
                        className={`font-bold ${
                          i % 2 === 0 ? "text-white" : "text-indigo-200"
                        }`}
                      >
                        {m.move}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase ${q.color}`}>
                        {q.label}
                      </span>
                      <span className={`text-[10px] font-black ${q.color}`}>
                        {q.icon}
                      </span>
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

            {reviewIndex !== null && (
              <div className="mt-4 text-xs text-slate-500">
                Analiz modunda tahtadan hamle yapılamaz.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
