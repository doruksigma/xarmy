"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

type Difficulty = "easy" | "medium" | "hard";
type Task = "bot" | "hint" | "eval" | null;

type EvalRow = {
  move: string; // SAN
  score: number; // pawn units (white perspective)
  fenBefore: string;
};

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
  return 14;
}

/**
 * ✅ Stockfish'i indirmeden çalıştırmanın doğru yolu:
 * - Worker'ı blob ile SAME-ORIGIN yap
 * - cdnjs'den stockfish.wasm.js import et
 * - WASM dosyasını blob relative değil, TAM URL ile locateFile üzerinden ver
 *
 * cdnjs dosyaları:
 * - stockfish.wasm.js
 * - stockfish.wasm
 */
function createStockfishWorker() {
  if (typeof window === "undefined") return null;

  const BASE = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/";
  const STOCKFISH_WASM_JS = BASE + "stockfish.wasm.js";
  const STOCKFISH_WASM = BASE + "stockfish.wasm";

  const code = `
    function send(m){ try{ self.postMessage(m); }catch(e){} }

    // ✅ kritik: wasm dosyasını blob-relative aramasın diye override
    self.Module = {
      locateFile: function(path){
        // stockfish.wasm gibi çağırır
        if (path && path.endsWith(".wasm")) return "${STOCKFISH_WASM}";
        return "${BASE}" + path;
      }
    };

    self.onerror = function(e){
      send("SF_WORKER_ERROR::" + (e && e.message ? e.message : "unknown"));
    };

    let engine = null;

    try{
      importScripts("${STOCKFISH_WASM_JS}");

      // build'e göre Stockfish() var
      if (typeof self.Stockfish === "function") {
        engine = self.Stockfish();
      }
    }catch(e){
      send("SF_IMPORT_FAIL::" + (e && e.message ? e.message : String(e)));
    }

    if(!engine){
      send("SF_INIT_FAILED");
    } else {
      send("SF_INIT_OK");

      engine.onmessage = function(e){
        // bazen string, bazen {data:"..."}
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
  // revoke bazen erken olursa sıkıntı → dokunmuyoruz
  return w;
}

export default function ChessPage() {
  const engine = useRef<Worker | null>(null);
  const taskRef = useRef<Task>(null);

  const lastScore = useRef<number>(0); // pawn units
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

  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  // Teacher
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const lastBotMoveUci = useRef<string | null>(null);
  const lastBotMoveSan = useRef<string | null>(null);
  const lastBotFenBefore = useRef<string | null>(null);
  const lastBotScore = useRef<number>(0);

  const game = useMemo(() => {
    const currentFen = reviewIndex !== null ? moveEvaluations[reviewIndex]?.fenBefore : fen;
    return new Chess(currentFen || fen);
  }, [fen, reviewIndex, moveEvaluations]);

  const displayRanks = playerColor === "b" ? [...ranks].reverse() : ranks;
  const displayFiles = playerColor === "b" ? [...files].reverse() : files;

  const sf = (m: string) => engine.current?.postMessage(m);

  const ensureAudio = useCallback(async () => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtx.current.state === "suspended") await audioCtx.current.resume();
    } catch {}
  }, []);

  const playMoveSound = useCallback(() => {
    try {
      if (!audioCtx.current) return;
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, []);

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

  // init engine once
  useEffect(() => {
    setMounted(true);

    const w = createStockfishWorker();
    if (!w) {
      setIsReady(false);
      return;
    }
    engine.current = w;

    const onMsg = (e: MessageEvent) => {
      const msg = String(e.data ?? "");

      if (msg === "SF_INIT_FAILED" || msg.startsWith("SF_IMPORT_FAIL::") || msg.startsWith("SF_WORKER_ERROR::")) {
        console.error(msg);
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
        const mate = msg.match(/score mate (-?\d+)/);
        if (mate) {
          // mate varsa kaba bir büyük sayı ile temsil
          const m = parseInt(mate[1], 10);
          lastScore.current = m > 0 ? 99 : -99;
          return;
        }
        const cp = msg.match(/score cp (-?\d+)/);
        if (cp) {
          lastScore.current = parseInt(cp[1], 10) / 100;
        }
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
        const promo = moveUci.length >= 5 ? (moveUci[4].toLowerCase() as any) : "q";

        if (currentTask === "hint") {
          setHintMove({ from, to });
          setHintLoading(false);
          return;
        }

        if (currentTask === "eval") return;

        if (currentTask === "bot") {
          setFen((prevFen) => {
            const g = new Chess(prevFen);
            if (g.isGameOver()) return prevFen;

            const fenBefore = prevFen;

            try {
              const m = g.move({ from, to, promotion: promo });
              if (!m) return prevFen;

              playMoveSound();

              // ✅ bot hamlesini logla
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

    // kick
    sf("uci");
    sf("isready");

    return () => {
      w.removeEventListener("message", onMsg);
      w.terminate();
      engine.current = null;
    };
  }, [playMoveSound]);

  // bot auto move
  useEffect(() => {
    if (
      gameStarted &&
      playerColor &&
      game.turn() !== playerColor &&
      !game.isGameOver() &&
      isReady &&
      reviewIndex === null &&
      !thinking
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
  }, [fen, isReady, gameStarted, playerColor, difficulty, reviewIndex, game, thinking]);

  const getHint = (targetFen?: string) => {
    if (!isReady) return;
    setHintLoading(true);
    setHintMove(null);
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

          // sadece eval
          requestEvalOnly(g.fen());
          return;
        }
      } catch {}
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) setSelected(square);
    else setSelected(null);
  }

  const getMoveQuality = (current: number, prev: number, isWhiteMove: boolean) => {
    const diff = isWhiteMove ? current - prev : prev - current;
    if (diff < -2.0) return { label: "Blunder", color: "text-red-500", icon: "??" };
    if (diff < -0.6) return { label: "Hata", color: "text-orange-500", icon: "?" };
    if (diff > 1.2) return { label: "Harika", color: "text-blue-400", icon: "!!" };
    return { label: "İyi", color: "text-emerald-400", icon: "✓" };
  };

  if (!mounted) return null;

  // Start screen
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="bg-slate-900 p-12 rounded-[3rem] border border-white/5 text-center shadow-2xl max-w-sm w-full">
          <h1 className="text-4xl font-black text-white italic uppercase mb-3 tracking-tighter">X-CHESS</h1>

          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">
            Engine:{" "}
            <span className={isReady ? "text-emerald-400" : "text-orange-400"}>
              {isReady ? "READY" : "LOADING"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={async () => {
                await ensureAudio();
                setPlayerColor("w");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all flex flex-col items-center gap-3 group"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">♔</span>
              <span className="text-[10px] font-black uppercase text-slate-400">Beyaz</span>
            </button>

            <button
              onClick={async () => {
                await ensureAudio();
                setPlayerColor("b");
                setGameStarted(true);
              }}
              className="p-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all flex flex-col items-center gap-3 group"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">♚</span>
              <span className="text-[10px] font-black uppercase text-slate-400">Siyah</span>
            </button>
          </div>

          {!isReady && (
            <p className="mt-6 text-xs text-slate-500">
              Eğer LOADING’de kalırsa: Konsolda SF_IMPORT_FAIL var mı bak.
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
                  {thinking ? " • bot düşünüyor…" : ""}
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
                          difficulty === lvl ? "bg-indigo-500 text-white" : "text-slate-500"
                        }`}
                      >
                        {lvl === "easy" ? "Kolay" : lvl === "medium" ? "Orta" : "Zor"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* BOARD */}
            <div className="aspect-square grid grid-cols-8 grid-rows-8 border-8 border-amber-950 rounded-2xl overflow-hidden bg-amber-900 relative shadow-2xl">
              {hintMove && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-50" viewBox="0 0 100 100">
                  <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb" />
                  </marker>
                  {(() => {
                    const s = getPos(hintMove.from);
                    const e = getPos(hintMove.to);
                    return (
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={e.x}
                        y2={e.y}
                        stroke="#2563eb"
                        strokeWidth="2.8"
                        markerEnd="url(#arrowhead)"
                        opacity="0.92"
                      />
                    );
                  })()}
                </svg>
              )}

              {reviewIndex !== null && <div className="absolute inset-0 z-40 bg-black/10 pointer-events-none" />}

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
                      className={`relative w-full h-full flex items-center justify-center transition-all
                        ${base} ${hover}
                        ${selected === sq ? "ring-4 ring-emerald-500 ring-inset z-20" : ""}
                      `}
                    >
                      <span
                        className="select-none pointer-events-none drop-shadow-md text-3xl sm:text-4xl md:text-5xl"
                        style={{ textShadow: "0 2px 0 rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.25)" }}
                      >
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
                      {hintLoading ? "💡 İpucu aranıyor…" : "💡 İpucu Al"}
                    </button>
                  )}
                  <button
                    onClick={() => window.location.reload()}
                    className={`${isGameOver ? "flex-1" : "w-32"} py-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl font-black uppercase text-xs border border-red-500/20 transition-all`}
                  >
                    Sıfırla
                  </button>
                </>
              )}
            </div>

            {/* WHY */}
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
                disabled={explainLoading || !lastBotMoveUci.current || !lastBotFenBefore.current || !playerColor}
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
                        {lastBotMoveSan.current} • {(lastBotScore.current >= 0 ? "+" : "") + lastBotScore.current.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 italic leading-relaxed">“{explanation}”</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MOVES PANEL */}
        <div className="w-full lg:w-96 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 flex-1 flex flex-col shadow-xl min-h-[520px]">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 italic text-center border-b border-white/5 pb-4">
              MAÇ ANALİZİ
            </h2>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {moveEvaluations.map((ev, i) => {
                const isWhiteMove = i % 2 === 0;
                const prev = i === 0 ? 0 : moveEvaluations[i - 1].score;
                const q = getMoveQuality(ev.score, prev, isWhiteMove);

                return (
                  <div
                    key={i}
                    onClick={() => {
                      setReviewIndex(i);
                      setHintMove(null);
                      getHint(moveEvaluations[i].fenBefore);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer group ${
                      reviewIndex === i ? "ring-2 ring-blue-500 bg-blue-500/10" : "bg-slate-950/50 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-600 font-black w-6">
                        {Math.floor(i / 2) + 1}.
                      </span>
                      <span className={`font-bold ${isWhiteMove ? "text-white" : "text-indigo-300"}`}>
                        {ev.move}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase ${q.color}`}>{q.label}</span>
                      <span className={`text-[10px] font-black ${q.color}`}>{q.icon}</span>
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
