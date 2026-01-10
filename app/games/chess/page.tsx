"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function depthByDifficulty(d: Difficulty) {
  if (d === "easy") return 2;
  if (d === "medium") return 8;
  return 13;
}

/**
 * ✅ STOCKFISH'i İNDİRMEDEN:
 * - CDN script'i bir Blob Worker içine importScripts ile alır
 * - Böylece cross-origin "worker create" engellerini aşar
 */
function createStockfishWorker() {
  if (typeof window === "undefined") return null;

  const CDN_PRIMARY =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
  const CDN_FALLBACK =
    "https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.js";

  const code = `
    function send(m){ try{ self.postMessage(m); }catch(e){} }

    self.onerror = function(e){
      send("SF_WORKER_ERROR::" + (e && e.message ? e.message : "unknown"));
    };

    let engine = null;

    function boot(url){
      try{
        importScripts(url);
        if (typeof self.Stockfish === "function") engine = self.Stockfish();
      }catch(e){
        send("SF_IMPORT_FAIL::" + url + "::" + (e && e.message ? e.message : String(e)));
      }
    }

    boot("${CDN_PRIMARY}");
    if(!engine) boot("${CDN_FALLBACK}");

    if(!engine){
      send("SF_INIT_FAILED");
    } else {
      send("SF_INIT_OK");

      engine.onmessage = function(e){
        const msg = (typeof e === "string") ? e : (e && e.data ? e.data : "");
        if (msg) send(msg);
      };

      self.onmessage = function(e){
        try{ engine.postMessage(e.data); }
        catch(err){ send("SF_ENGINE_POST_FAIL::" + (err && err.message ? err.message : String(err))); }
      };
    }
  `;

  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  // URL.revokeObjectURL(url); // bazı ortamlarda erken revoke sorun çıkarabiliyor
  return w;
}

type Task = "bot" | "hint" | "eval" | null;

export default function ChessPage() {
  const engine = useRef<Worker | null>(null);
  const taskRef = useRef<Task>(null);

  const audioCtx = useRef<AudioContext | null>(null);

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

  // Teacher explanation
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  // Bot hafızası (why button için)
  const lastBotMoveUci = useRef<string | null>(null);
  const lastBotMoveSan = useRef<string | null>(null);
  const lastBotFenBefore = useRef<string | null>(null);
  const lastBotScore = useRef<number>(0);

  // son görülen eval (pawn units)
  const lastScore = useRef<number>(0);

  const game = useMemo(() => {
    const currentFen =
      reviewIndex !== null ? moveEvaluations[reviewIndex]?.fenBefore : fen;
    return new Chess(currentFen || fen);
  }, [fen, reviewIndex, moveEvaluations]);

  const displayRanks = playerColor === "b" ? [...ranks].reverse() : ranks;
  const displayFiles = playerColor === "b" ? [...files].reverse() : files;

  const sf = (m: string) => engine.current?.postMessage(m);

  // ✅ Audio: tarayıcı kısıtını aşmak için user gesture anında resume
  const ensureAudio = useCallback(() => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      if (audioCtx.current.state === "suspended") audioCtx.current.resume();
    } catch {}
  }, []);

  const playMoveSound = useCallback(() => {
    try {
      ensureAudio();
      const ctx = audioCtx.current;
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, [ensureAudio]);

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
    } catch {
      setExplanation("Açıklama alınamadı (API hatası).");
    } finally {
      setExplainLoading(false);
    }
  }

  // --- mount ---
  useEffect(() => setMounted(true), []);

  // --- init engine once ---
  useEffect(() => {
    const w = createStockfishWorker();
    engine.current = w;

    if (!w) {
      setIsReady(false);
      return;
    }

    const onMsg = (e: MessageEvent) => {
      // bazı sürümler e.data değil e.data.data vb dönebiliyor
      const raw = (e as any)?.data;
      const msg =
        typeof raw === "string"
          ? raw
          : typeof raw?.data === "string"
          ? raw.data
          : String(raw ?? "");

      if (msg === "SF_INIT_FAILED" || msg.startsWith("SF_WORKER_ERROR::")) {
        setIsReady(false);
        return;
      }

      if (msg === "SF_INIT_OK") {
        // ✅ sadece init/oyun başlangıcında ucinewgame
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

      // ✅ score stream
      if (msg.startsWith("info")) {
        const m = msg.match(/score cp (-?\d+)/);
        if (m) {
          lastScore.current = parseInt(m[1], 10) / 100;

          // ✅ eval task açıkken son hamlenin skorunu canlı güncelle
          if (taskRef.current === "eval") {
            setMoveEvaluations((prev) => {
              if (!prev.length) return prev;
              const copy = [...prev];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                score: lastScore.current,
              };
              return copy;
            });
          }
        }
        return;
      }

      // ✅ bestmove
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
        const promo =
          moveUci.length > 4 ? (moveUci[4].toLowerCase() as any) : "q"; // ✅ promotion fix

        // ✅ HINT: sadece ok çiz
        if (currentTask === "hint") {
          setHintMove({ from, to });
          setHintLoading(false);
          return;
        }

        // ✅ EVAL: hamle uygulama yok
        if (currentTask === "eval") {
          return;
        }

        // ✅ BOT: hamleyi uygula + hamle sonrası eval iste
        if (currentTask === "bot") {
          setFen((prevFen) => {
            const g = new Chess(prevFen);
            if (g.isGameOver()) return prevFen;

            const fenBefore = prevFen;

            try {
              const m = g.move({ from, to, promotion: promo });
              if (!m) return prevFen;

              playMoveSound();

              // hamleyi listeye ekle; score henüz "tam doğru" olmayabilir,
              // hemen ardından eval isteyip son elemanı güncelleyeceğiz.
              setMoveEvaluations((p) => [
                ...p,
                { move: m.san, score: null, fenBefore },
              ]);

              lastBotMoveUci.current = moveUci;
              lastBotMoveSan.current = m.san;
              lastBotFenBefore.current = fenBefore;

              const nextFen = g.fen();

              // ✅ hamleden sonra yeni pozisyonu analiz ettir -> score doğru pozisyona yazılır
              lastBotScore.current = lastScore.current; // fallback (hızlı gösterim)
              taskRef.current = "eval";
              sf("stop");
              sf(`position fen ${nextFen}`);
              sf("go depth 10");

              return nextFen;
            } catch {
              return prevFen;
            } finally {
              setThinking(false);
            }
          });
        }

        return;
      }
    };

    w.addEventListener("message", onMsg);

    // Kick
    sf("uci");
    sf("isready");

    return () => {
      w.removeEventListener("message", onMsg);
      w.terminate();
      engine.current = null;
    };
  }, [playMoveSound]);

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
        sf(`position fen ${fen}`);
        sf(`go depth ${depth}`);
      }, 250);

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
    sf("go depth 15");
  };

  const requestEvalOnly = (targetFen: string) => {
    if (!isReady) return;
    taskRef.current = "eval";
    sf("stop");
    sf(`position fen ${targetFen}`);
    sf("go depth 10");
  };

  function onSquareClick(square: Square) {
    if (
      !gameStarted ||
      !playerColor ||
      thinking ||
      game.isGameOver() ||
      reviewIndex !== null // ✅ analiz modunda kilit
    )
      return;

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

          // oyuncu hamlesi: score şimdilik null, eval ile doldur
          setMoveEvaluations((p) => [
            ...p,
            { move: move.san, score: null, fenBefore },
          ]);

          setSelected(null);

          // ✅ oyuncu hamlesinden sonra eval
          requestEvalOnly(g.fen());
          return;
        }
      } catch {}
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) setSelected(square);
    else setSelected(null);
  }

  // ✅ Hint oku için: siyah seçilince koordinatları ters çevir
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

  const getMoveQuality = (
    current: number | null,
    prev: number | null,
    isWhite: boolean
  ) => {
    if (current === null || prev === null)
      return { label: "Analiz", color: "text-slate-500", icon: "●" };

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
          <h1 className="text-4xl font-black text-white italic uppercase mb-3">
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
                ensureAudio();
                setPlayerColor("w");
                setGameStarted(true);
                setExplanation(null);
                setHintMove(null);
                setReviewIndex(null);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5"
            >
              <div className="text-5xl">♔</div>
              <div className="text-[10px] font-black uppercase text-slate-400 mt-2">
                Beyaz
              </div>
            </button>

            <button
              onClick={() => {
                ensureAudio();
                setPlayerColor("b");
                setGameStarted(true);
                setExplanation(null);
                setHintMove(null);
                setReviewIndex(null);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5"
            >
              <div className="text-5xl">♚</div>
              <div className="text-[10px] font-black uppercase text-slate-400 mt-2">
                Siyah
              </div>
            </button>
          </div>

          {!isReady && (
            <p className="mt-6 text-xs text-slate-500">
              LOADING’de kalırsa: CDN importScripts engeli olabilir. (Bazı ağlar/CDN
              bloklanabilir.)
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
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-white/5 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-black text-white italic uppercase">
                  X-CHESS
                </h1>
                <div className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mt-1">
                  {reviewIndex !== null ? "● Analiz Modu" : "Canlı Maç"}{" "}
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
                      {lvl === "easy" ? "Kolay" : lvl === "medium" ? "Orta" : "Zor"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ✅ classic yellow/brown board */}
            <div className="aspect-square grid grid-cols-8 grid-rows-8 border-8 border-amber-900 rounded-2xl overflow-hidden bg-amber-900 relative">
              {hintMove && playerColor && (
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

                  const base = isDark ? "bg-amber-800" : "bg-amber-200";
                  const hover = isDark ? "hover:bg-amber-700" : "hover:bg-amber-300";

                  return (
                    <button
                      key={sq}
                      onClick={() => onSquareClick(sq)}
                      className={`relative w-full h-full flex items-center justify-center
                        text-3xl sm:text-4xl md:text-5xl transition-all
                        ${base} ${hover}
                        ${selected === sq ? "ring-4 ring-emerald-500 ring-inset" : ""}
                      `}
                      aria-label={sq}
                    >
                      <span
                        className="select-none pointer-events-none"
                        style={{
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

            {/* WHY BUTTON */}
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
