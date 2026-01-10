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
  if (d === "easy") return 2;
  if (d === "medium") return 8;
  return 13;
}

/**
 * ✅ İNDİRMEDEN STOCKFISH (CSP/CORS dostu):
 * - Worker'ı SAME-ORIGIN blob'tan açar
 * - İçeride importScripts ile CDN stockfish.js çeker
 * - engine mesajlarını normalize edip dışarı aktarır
 */
function createStockfishWorker() {
  if (typeof window === "undefined") return null;

  const CDN_PRIMARY =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
  const CDN_FALLBACK =
    "https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.js";

  const code = `
    function send(m){ try{ self.postMessage(String(m)); }catch(e){} }

    self.onerror = function(e){
      send("SF_WORKER_ERROR::" + (e && e.message ? e.message : "unknown"));
    };

    let engine = null;

    function boot(url){
      try{
        importScripts(url);
        if (typeof self.Stockfish === "function") {
          engine = self.Stockfish();
          return true;
        }
      }catch(e){
        send("SF_IMPORT_FAIL::" + url + "::" + (e && e.message ? e.message : String(e)));
      }
      return false;
    }

    boot("${CDN_PRIMARY}") || boot("${CDN_FALLBACK}");

    if(!engine){
      send("SF_INIT_FAILED");
    } else {
      send("SF_INIT_OK");

      engine.onmessage = function(e){
        const msg = (typeof e === "string") ? e : (e && e.data ? e.data : "");
        if (msg) send(msg);
      };

      self.onmessage = function(e){
        try{
          engine.postMessage(e.data);
        }catch(err){
          send("SF_ENGINE_POST_FAIL::" + (err && err.message ? err.message : String(err)));
        }
      };
    }
  `;

  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  // URL.revokeObjectURL(url); // bazı ortamlarda erken revoke sorun çıkarabiliyor
  return w;
}

type EvalRow = { move: string; score: number; fenBefore: string };

export default function ChessPage() {
  const engineRef = useRef<Worker | null>(null);
  const taskRef = useRef<Task>(null);
  const lastScore = useRef<number>(0);

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

  const sf = (m: string) => {
    const w = engineRef.current;
    if (!w) return;
    w.postMessage(m);
  };

  const playMoveSound = () => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {}
  };

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

  // --- init engine once ---
  useEffect(() => {
    setMounted(true);

    const w = createStockfishWorker();
    engineRef.current = w;

    if (!w) {
      setIsReady(false);
      return;
    }

    let gotUciOk = false;
    let gotReadyOk = false;

    const onMsg = (e: MessageEvent) => {
      const msg =
        typeof e.data === "string"
          ? e.data
          : e.data?.data
          ? String(e.data.data)
          : String(e.data || "");

      if (msg === "SF_INIT_FAILED") {
        console.error("SF_INIT_FAILED");
        setIsReady(false);
        return;
      }
      if (msg.startsWith("SF_IMPORT_FAIL::")) {
        console.error(msg);
        // fallback denendi; init yine de fail olabilir, bekleyelim
        return;
      }
      if (msg.startsWith("SF_WORKER_ERROR::")) {
        console.error(msg);
        setIsReady(false);
        return;
      }
      if (msg.startsWith("SF_ENGINE_POST_FAIL::")) {
        console.error(msg);
        return;
      }

      if (msg === "SF_INIT_OK") {
        sf("uci");
        sf("isready");
        return;
      }

      // handshake
      if (msg.includes("uciok")) {
        gotUciOk = true;
        sf("isready");
        return;
      }
      if (msg.includes("readyok")) {
        gotReadyOk = true;
        setIsReady(true);
        return;
      }

      // bazı buildlerde banner/log gelir; handshake'i tekrar zorla
      if (!gotUciOk && msg.includes("Stockfish")) {
        sf("uci");
        sf("isready");
      }
      if (!gotReadyOk && msg.includes("id name")) {
        sf("isready");
      }

      // score stream
      if (msg.startsWith("info")) {
        const m = msg.match(/score cp (-?\\d+)/);
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

        if (currentTask === "eval") return;

        if (currentTask === "bot") {
          setFen((prevFen) => {
            const g = new Chess(prevFen);
            const fenBefore = prevFen;

            try {
              const m = g.move({ from, to, promotion: "q" });
              if (!m) return prevFen;

              playMoveSound();

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

    // Kick: bazen ilk mesaj kaçabilir, iki kez yolla (zararsız)
    sf("uci");
    sf("isready");
    setTimeout(() => {
      if (!gotReadyOk) {
        sf("uci");
        sf("isready");
      }
    }, 450);

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
        const move = g.move({ from: selected, to: square, promotion: "q" });
        if (move) {
          playMoveSound();
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
    if (diff < -2.0) return { label: "Blunder", color: "text-red-700", icon: "??" };
    if (diff < -0.5) return { label: "Hata", color: "text-orange-700", icon: "?" };
    if (diff > 1.0) return { label: "Harika", color: "text-blue-700", icon: "!!" };
    return { label: "İyi", color: "text-emerald-700", icon: "✓" };
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
              onClick={() => {
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

          {!isReady && (
            <p className="mt-6 text-xs text-slate-500">
              Eğer LOADING’de kalırsa: CDN erişimi veya CSP worker engeli olabilir.
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
                <div className="text-[10px] text-indigo-200 font-black uppercase tracking-widest mt-1">
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
                          : "text-slate-300"
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

            {/* ✅ classic yellow/brown board */}
            <div className="aspect-square grid grid-cols-8 grid-rows-8 border-8 border-amber-900 rounded-2xl overflow-hidden bg-amber-900 relative">
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
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#1d4ed8" />
                  </marker>
                  <line
                    x1={`${getCoords(hintMove.from).x}`}
                    y1={`${getCoords(hintMove.from).y}`}
                    x2={`${getCoords(hintMove.to).x}`}
                    y2={`${getCoords(hintMove.to).y}`}
                    stroke="#1d4ed8"
                    strokeWidth="2.8"
                    markerEnd="url(#arrowhead)"
                    opacity="0.92"
                  />
                </svg>
              )}

              {displayRanks.map((r, ri) =>
                displayFiles.map((f, fi) => {
                  const sq = `${f}${r}` as Square;
                  const p = game.get(sq);
                  const isDark = (ri + fi) % 2 === 1;

                  const base = isDark ? "bg-amber-700" : "bg-amber-200";
                  const hover = isDark ? "hover:bg-amber-600" : "hover:bg-amber-300";

                  return (
                    <button
                      key={sq}
                      onClick={() => onSquareClick(sq)}
                      className={`relative w-full h-full flex items-center justify-center text-4xl md:text-5xl transition-all
                        ${base} ${hover}
                        ${selected === sq ? "ring-4 ring-emerald-500 ring-inset" : ""}
                      `}
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
                    } py-4 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-2xl font-black uppercase text-xs`}
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
                  !lastBotFenBefore.current
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
                    <span className="text-[10px] font-black uppercase text-indigo-300 tracking-widest">
                      Öğretmen Notu
                    </span>
                    {lastBotMoveSan.current && (
                      <span className="ml-auto text-[10px] font-black text-slate-100 bg-black/20 px-2 py-1 rounded-lg">
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
            <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-6 italic text-center border-b border-white/5 pb-4">
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
                      <span className="text-[10px] text-slate-400 font-black w-6">
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
                      <span className={`text-[9px] font-black uppercase ${quality.color}`}>
                        {quality.label}
                      </span>
                      <span className={`text-[10px] font-black ${quality.color}`}>
                        {quality.icon}
                      </span>
                    </div>
                  </div>
                );
              })}

              {moveEvaluations.length === 0 && (
                <div className="text-center text-xs text-slate-400 mt-12">
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
