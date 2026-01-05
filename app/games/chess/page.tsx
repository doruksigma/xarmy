"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

type Mode = "bot" | "p2p";

type MoveEval = {
  move: string;
  score: number; // eval (pawn units, e.g. 0.35)
  fenBefore: string;
  fenAfter: string;
};

type P2PMsg =
  | {
      type: "init";
      fen: string;
      hostColor: Color;
      guestColor: Color;
      initialTime: number | null; // online süresiz => null
      difficulty: "easy" | "medium" | "hard";
    }
  | {
      type: "move";
      from: Square;
      to: Square;
      promotion?: "q";
      san: string;
      fenBefore: string;
      fenAfter: string;
    }
  | { type: "reset" };

function gen5() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function pieceToChar(p: { type: PieceSymbol; color: Color }) {
  const map: any = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  return map[p.color][p.type];
}

type PeerCtor = new (id?: string, options?: any) => any;

export default function ChessPage() {
  // =====================
  // SSR SAFE MOUNT
  // =====================
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // =====================
  // AUDIO (click sound)
  // =====================
  const audioCtx = useRef<AudioContext | null>(null);
  const playMoveSound = () => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.085);
    } catch {}
  };

  // =====================
  // STOCKFISH (npm package, dynamic import) ✅ FIX
  // =====================
  const engineRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // task routing
  const taskRef = useRef<"none" | "hint" | "botmove" | "analysis">("none");
  const lastScore = useRef<number>(0);

  // post-game analysis
  const analysisActiveRef = useRef(false);
  const analysisIndexRef = useRef(-1);
  const analysisDepthRef = useRef(14);

  const [postAnalyzing, setPostAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ i: number; n: number }>({ i: 0, n: 0 });

  const movesRef = useRef<MoveEval[]>([]);
  const setMoves = (updater: (prev: MoveEval[]) => MoveEval[]) => {
    setMoveEvaluations((prev) => {
      const next = updater(prev);
      movesRef.current = next;
      return next;
    });
  };

  const initEngineOnce = useRef(false);
  useEffect(() => {
    if (initEngineOnce.current) return;
    initEngineOnce.current = true;

    (async () => {
      try {
        const mod = await import("stockfish");
        const factory = (mod as any).default ?? (mod as any);
        const engine = factory(); // engine-like object with postMessage/onmessage
        engineRef.current = engine;

        engine.onmessage = (event: any) => {
          const raw = typeof event === "string" ? event : event?.data;
          const msg = String(raw || "");

          if (msg === "uciok") {
            // ok
          }
          if (msg === "readyok") {
            setIsReady(true);
            return;
          }

          // score parse
          if (msg.startsWith("info") && msg.includes("score cp")) {
            const m = msg.match(/score cp (-?\d+)/);
            if (m) lastScore.current = parseInt(m[1], 10) / 100;
          }

          if (!msg.startsWith("bestmove")) return;
          const best = msg.split(" ")[1];
          if (!best || best === "(none)") return;

          const from = best.slice(0, 2) as Square;
          const to = best.slice(2, 4) as Square;

          // 1) Hint
          if (taskRef.current === "hint") {
            setHintMove({ from, to });
            setHintLoading(false);
            taskRef.current = "none";
            return;
          }

          // 2) Bot move
          if (taskRef.current === "botmove") {
            taskRef.current = "none";
            applyMoveFromEngine(from, to);
            return;
          }

          // 3) Post-game analysis step
          if (taskRef.current === "analysis" && analysisActiveRef.current) {
            const idx = analysisIndexRef.current;
            const list = movesRef.current;

            if (idx >= 0 && idx < list.length) {
              const scoreForPos = lastScore.current;

              setMoves((prev) => {
                if (!prev[idx]) return prev;
                const copy = [...prev];
                copy[idx] = { ...copy[idx], score: scoreForPos };
                return copy;
              });

              setAnalysisProgress((p) => ({ i: Math.min(p.i + 1, p.n), n: p.n }));

              const nextIdx = idx + 1;
              analysisIndexRef.current = nextIdx;

              setTimeout(() => {
                const cur = movesRef.current;
                if (nextIdx >= cur.length) {
                  analysisActiveRef.current = false;
                  taskRef.current = "none";
                  setPostAnalyzing(false);
                  setAnalysisDone(true);
                  setP2pStatus("Maç analizi tamamlandı ✅");
                  return;
                }

                const fenToEval = cur[nextIdx]?.fenAfter;
                if (!fenToEval) {
                  analysisActiveRef.current = false;
                  taskRef.current = "none";
                  setPostAnalyzing(false);
                  setAnalysisDone(true);
                  setP2pStatus("Maç analizi tamamlandı ✅");
                  return;
                }

                analysisActiveRef.current = true;
                taskRef.current = "analysis";
                analysisIndexRef.current = nextIdx;

                engineRef.current?.postMessage(`position fen ${fenToEval}`);
                engineRef.current?.postMessage(`go depth ${analysisDepthRef.current}`);
              }, 0);
            }
            return;
          }
        };

        engine.postMessage("uci");
        engine.postMessage("isready");
      } catch (e) {
        console.error("Stockfish init failed", e);
        setIsReady(false);
      }
    })();
  }, []);

  // =====================
  // P2P (PeerJS dynamic import)
  // =====================
  const PeerCtorRef = useRef<PeerCtor | null>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const isHostRef = useRef(false);

  const [p2pStatus, setP2pStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const mod = await import("peerjs");
        PeerCtorRef.current = (mod as any).default;
      } catch (e) {
        console.error("peerjs load failed", e);
      }
    })();
  }, []);

  function ensurePeer(id: string) {
    if (peerRef.current) return peerRef.current;

    const Peer = PeerCtorRef.current;
    if (!Peer) {
      setP2pStatus("PeerJS yükleniyor...");
      return null;
    }

    const p = new Peer(id);
    peerRef.current = p;
    return p;
  }

  function cleanupP2P() {
    try {
      connRef.current?.close?.();
    } catch {}
    try {
      peerRef.current?.destroy?.();
    } catch {}
    connRef.current = null;
    peerRef.current = null;
    isHostRef.current = false;
  }

  function handleP2PData(data: any) {
    const msg = data as P2PMsg;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;

    if (msg.type === "init") {
      safeResetGame(msg.fen);
      setDifficulty(msg.difficulty);

      setInitialTime(null);
      setWhiteTime(0);
      setBlackTime(0);

      setPlayerColor(msg.guestColor);
      setSelectionStep("game");
      setP2pStatus("Oyun başladı! (Süresiz)");
      return;
    }

    if (msg.type === "move") {
      playMoveSound();
      setFen(msg.fenAfter);

      setMoves((prev) => [
        ...prev,
        { move: msg.san, score: 0, fenBefore: msg.fenBefore, fenAfter: msg.fenAfter },
      ]);

      setThinking(false);
      return;
    }

    if (msg.type === "reset") {
      safeResetGame();
      setP2pStatus("Rakip oyunu sıfırladı.");
      return;
    }
  }

  // =====================
  // UI / GAME STATE
  // =====================
  const [mode, setMode] = useState<Mode | null>(null);
  const [lobbyStep, setLobbyStep] = useState<"mode" | "room">("mode");
  const [myCode, setMyCode] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [selectionStep, setSelectionStep] = useState<"color" | "time" | "game">("color");
  const [playerColor, setPlayerColor] = useState<Color | null>(null);
  const [initialTime, setInitialTime] = useState<number | null>(null);

  const [fen, setFen] = useState(START_FEN);
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);

  const [thinking, setThinking] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [timeWinner, setTimeWinner] = useState<string | null>(null);

  const [moveEvaluations, setMoveEvaluations] = useState<MoveEval[]>([]);
  useEffect(() => {
    movesRef.current = moveEvaluations;
  }, [moveEvaluations]);

  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintCount, setHintCount] = useState(0);

  const game = useMemo(() => {
    const base =
      reviewIndex !== null && moveEvaluations[reviewIndex]
        ? moveEvaluations[reviewIndex].fenBefore
        : fen;
    return new Chess(base);
  }, [fen, reviewIndex, moveEvaluations]);

  const displayRanks = playerColor === "b" ? [...ranks].reverse() : ranks;
  const displayFiles = playerColor === "b" ? [...files].reverse() : files;

  const isGameOver = game.isGameOver() || !!timeWinner;

  function safeResetGame(startFen?: string) {
    const f = startFen || START_FEN;

    setFen(f);
    setMoveEvaluations([]);
    movesRef.current = [];
    setReviewIndex(null);

    setHintMove(null);
    setHintLoading(false);
    setHintCount(0);

    setSelected(null);
    setThinking(false);
    setTimeWinner(null);

    setPostAnalyzing(false);
    setAnalysisDone(false);
    setAnalysisProgress({ i: 0, n: 0 });

    analysisActiveRef.current = false;
    analysisIndexRef.current = -1;
    taskRef.current = "none";
    lastScore.current = 0;
  }

  // =====================
  // Engine options (difficulty)
  // =====================
  useEffect(() => {
    if (!isReady || !engineRef.current) return;
    const skill = { easy: 0, medium: 10, hard: 20 }[difficulty];
    // stockfish.js supports this uci option
    engineRef.current.postMessage(`setoption name Skill Level value ${skill}`);
  }, [difficulty, isReady]);

  // =====================
  // Bot move request (IMPORTANT: drive with "go")
  // =====================
  function requestBotMove(currentFen: string) {
    if (!isReady || !engineRef.current) return;

    // ensure position
    engineRef.current.postMessage(`position fen ${currentFen}`);

    // time/depth config
    const cfg = {
      easy: { depth: 6 },
      medium: { depth: 10 },
      hard: { depth: 14 },
    }[difficulty];

    taskRef.current = "botmove";
    engineRef.current.postMessage(`go depth ${cfg.depth}`);
  }

  function applyMoveFromEngine(from: Square, to: Square) {
    setFen((prev) => {
      const g = new Chess(prev);
      const fenBefore = prev;
      try {
        const mv = g.move({ from, to, promotion: "q" });
        const fenAfter = g.fen();

        playMoveSound();
        setMoves((p) => [
          ...p,
          { move: mv.san, score: lastScore.current, fenBefore, fenAfter },
        ]);

        return fenAfter;
      } catch {
        return prev;
      } finally {
        setThinking(false);
      }
    });
  }

  // =====================
  // Bot loop (not in p2p)
  // =====================
  useEffect(() => {
    if (mode !== "bot") return;
    if (selectionStep !== "game") return;
    if (!playerColor) return;
    if (!isReady) return;
    if (reviewIndex !== null) return;
    if (timeWinner) return;
    if (game.isGameOver()) return;

    // bot plays when turn != playerColor
    if (game.turn() !== playerColor) {
      setThinking(true);
      const t = setTimeout(() => requestBotMove(fen), 250);
      return () => clearTimeout(t);
    }
  }, [mode, selectionStep, playerColor, isReady, reviewIndex, timeWinner, game, fen]);

  // =====================
  // Hint (online in-game disabled; allowed post-game review)
  // =====================
  const getHint = (targetFen?: string) => {
    const overNow = game.isGameOver() || !!timeWinner;

    // ✅ online oynarken oyun içi ipucu yok
    if (mode === "p2p" && !overNow) return;

    if (!isReady || !engineRef.current) return;
    if (hintCount >= 5) return;

    if (!targetFen) setHintCount((c) => c + 1);

    setHintLoading(true);
    taskRef.current = "hint";

    const currentFen = targetFen || fen;
    engineRef.current.postMessage(`position fen ${currentFen}`);
    engineRef.current.postMessage("go depth 12");
  };

  // =====================
  // Online post-game analysis
  // =====================
  useEffect(() => {
    if (!isReady) return;
    if (mode !== "p2p") return;
    if (!isGameOver) return;
    if (analysisDone || postAnalyzing) return;
    if (movesRef.current.length === 0) return;

    setPostAnalyzing(true);
    setP2pStatus("Maç bitti. Stockfish analiz ediyor...");

    const n = movesRef.current.length;
    setAnalysisProgress({ i: 0, n });

    analysisActiveRef.current = true;
    taskRef.current = "analysis";
    analysisIndexRef.current = 0;

    const fenToEval = movesRef.current[0]?.fenAfter;
    if (!fenToEval) {
      analysisActiveRef.current = false;
      taskRef.current = "none";
      setPostAnalyzing(false);
      setAnalysisDone(true);
      return;
    }

    engineRef.current?.postMessage(`position fen ${fenToEval}`);
    engineRef.current?.postMessage(`go depth ${analysisDepthRef.current}`);
  }, [isReady, mode, isGameOver, analysisDone, postAnalyzing]);

  // =====================
  // Timer (online: initialTime null)
  // =====================
  useEffect(() => {
    let interval: any;

    if (
      selectionStep === "game" &&
      initialTime &&
      !game.isGameOver() &&
      !timeWinner
    ) {
      interval = setInterval(() => {
        if (game.turn() === "w") setWhiteTime((t) => (t <= 1 ? 0 : t - 1));
        else setBlackTime((t) => (t <= 1 ? 0 : t - 1));
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [selectionStep, initialTime, game, timeWinner]);

  useEffect(() => {
    if (!initialTime) return;
    if (timeWinner) return;
    if (selectionStep !== "game") return;
    if (whiteTime === 0) setTimeWinner("Siyah Kazandı");
    if (blackTime === 0) setTimeWinner("Beyaz Kazandı");
  }, [whiteTime, blackTime, initialTime, timeWinner, selectionStep]);

  // =====================
  // Scoring labels
  // =====================
  const getMoveQuality = (current: number, prev: number, isWhite: boolean) => {
    const diff = isWhite ? current - prev : prev - current;
    if (diff < -2.5) return { label: "Blunder", puan: 0, color: "text-red-500" };
    if (diff < -0.8) return { label: "Hata", puan: 0, color: "text-orange-500" };
    if (diff > 1.2) return { label: "Harika", puan: 10, color: "text-blue-400" };
    return { label: "İyi", puan: 5, color: "text-emerald-400" };
  };

  const totalScore = useMemo(() => {
    return moveEvaluations.reduce((sum, mv, i) => {
      const isWhite = i % 2 === 0;
      const isPlayerMove =
        (isWhite && playerColor === "w") || (!isWhite && playerColor === "b");
      if (!isPlayerMove) return sum;
      const prevScore = i === 0 ? 0 : moveEvaluations[i - 1].score;
      return sum + getMoveQuality(mv.score, prevScore, isWhite).puan;
    }, 0);
  }, [moveEvaluations, playerColor]);

  // =====================
  // Board interaction
  // =====================
  function onSquareClick(square: Square) {
    if (
      selectionStep !== "game" ||
      !playerColor ||
      game.turn() !== playerColor ||
      thinking ||
      game.isGameOver() ||
      reviewIndex !== null ||
      timeWinner
    )
      return;

    setHintMove(null);

    if (selected) {
      const gCopy = new Chess(fen);
      const fenBefore = fen;

      try {
        const mv = gCopy.move({ from: selected, to: square, promotion: "q" });
        if (!mv) {
          setSelected(null);
          return;
        }

        const fenAfter = gCopy.fen();
        playMoveSound();
        setFen(fenAfter);

        setMoves((p) => [
          ...p,
          { move: mv.san, score: mode === "p2p" ? 0 : lastScore.current, fenBefore, fenAfter },
        ]);

        setSelected(null);

        // bot: immediately request response
        if (mode === "bot") {
          // give engine a tiny breath, then go
          setThinking(true);
          setTimeout(() => requestBotMove(fenAfter), 200);
        }

        // p2p: send move
        if (mode === "p2p" && connRef.current?.open) {
          const msg: P2PMsg = {
            type: "move",
            from: selected,
            to: square,
            promotion: "q",
            san: mv.san,
            fenBefore,
            fenAfter,
          };
          connRef.current.send(msg);
        }

        return;
      } catch {
        // fallthrough to selection update
      }
    }

    const piece = game.get(square);
    if (piece && piece.color === playerColor) setSelected(square);
    else setSelected(null);
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getCoords = (square: Square) => {
    const fArr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rArr = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const f = fArr.indexOf(square[0]);
    const r = rArr.indexOf(square[1]);
    let x = f * 12.5 + 6.25;
    let y = r * 12.5 + 6.25;
    if (playerColor === "b") {
      x = 100 - x;
      y = 100 - y;
    }
    return { x, y };
  };

  // =========================
  // LOBBY: MODE
  // =========================
  if (selectionStep === "color" && lobbyStep === "mode") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-white">
        <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/5 w-full max-w-md shadow-2xl">
          <h1 className="text-3xl font-black italic uppercase mb-6 tracking-tighter text-center">
            TROPHY CHESS
          </h1>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => {
                cleanupP2P();
                setMyCode("");
                setJoinCode("");
                setP2pStatus("");
                setMode("bot");
                setLobbyStep("mode");
                setSelectionStep("color");
              }}
              className="py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 font-black uppercase text-xs tracking-widest"
            >
              🤖 Bot ile Oyna (Stockfish)
            </button>

            <button
              onClick={() => {
                cleanupP2P();
                setMyCode("");
                setJoinCode("");
                setP2pStatus("");
                setMode("p2p");
                setLobbyStep("room");
              }}
              className="py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black uppercase text-xs tracking-widest"
            >
              🧑‍🤝‍🧑 Online (P2P)
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-400 text-center">
            Online: süresiz • oyun içi ipucu yok • maç bitince Stockfish analiz.
          </p>

          {!isReady && (
            <p className="mt-3 text-xs text-amber-300 text-center">
              Stockfish hazırlanıyor... (bot birazdan aktif olur)
            </p>
          )}
        </div>
      </div>
    );
  }

  // =========================
  // LOBBY: ROOM (P2P)
  // =========================
  if (selectionStep === "color" && lobbyStep === "room" && mode === "p2p") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-white">
        <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/5 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black uppercase italic tracking-widest text-indigo-400">
              Online Eşleşme
            </h2>
            <button
              onClick={() => {
                cleanupP2P();
                setMyCode("");
                setJoinCode("");
                setP2pStatus("");
                setLobbyStep("mode");
              }}
              className="text-xs font-black uppercase text-slate-400 hover:text-white"
            >
              Geri
            </button>
          </div>

          <button
            onClick={() => {
              cleanupP2P();

              const code = gen5();
              setMyCode(code);
              setP2pStatus("Kod oluşturuldu. Rakip bekleniyor...");
              isHostRef.current = true;

              const p = ensurePeer(code);
              if (!p) return;

              p.on("open", () => setP2pStatus(`Hazır. Kod: ${code}`));

              // ✅ allow exactly one opponent; if another tries, reject
              p.on("connection", (c: any) => {
                if (connRef.current) {
                  try { c.close?.(); } catch {}
                  return;
                }

                connRef.current = c;
                setP2pStatus("Rakip bağlandı. Oyun başlatılıyor...");

                c.on("data", (d: any) => handleP2PData(d));
                c.on("close", () => {
                  connRef.current = null;
                  setP2pStatus("Bağlantı koptu.");
                });
                c.on("error", () => setP2pStatus("Bağlantı hatası."));

                const colors: Color[] = Math.random() < 0.5 ? ["w", "b"] : ["b", "w"];
                const hostColor = colors[0];
                const guestColor = colors[1];

                setPlayerColor(hostColor);

                setInitialTime(null);
                setWhiteTime(0);
                setBlackTime(0);

                safeResetGame(START_FEN);

                const initMsg: P2PMsg = {
                  type: "init",
                  fen: START_FEN,
                  hostColor,
                  guestColor,
                  initialTime: null,
                  difficulty,
                };

                c.send(initMsg);
                setSelectionStep("game");
                setP2pStatus("Oyun başladı! (Süresiz)");
              });

              p.on("error", (e: any) => setP2pStatus("Peer hata: " + (e?.type || "unknown")));
            }}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-black uppercase text-xs tracking-widest"
          >
            ✅ Oda Oluştur (5 Haneli Kod)
          </button>

          <div className="mt-6">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              5 Haneli Kod ile Bağlan
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="Örn: 48219"
                className="flex-1 bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 font-mono text-lg outline-none"
              />
              <button
                onClick={() => {
                  const code = joinCode.trim();
                  if (code.length !== 5) {
                    setP2pStatus("Kod 5 hane olmalı.");
                    return;
                  }

                  cleanupP2P();
                  isHostRef.current = false;
                  setP2pStatus("Bağlanıyor...");

                  const myId = "g" + gen5() + "-" + Math.random().toString(16).slice(2, 8);
                  const p = ensurePeer(myId);
                  if (!p) return;

                  p.on("open", () => {
                    const c = p.connect(code, { reliable: true });
                    connRef.current = c;

                    c.on("open", () => {
                      setP2pStatus("Bağlandı. Başlatma bekleniyor...");
                      c.on("data", (d: any) => handleP2PData(d));
                      c.on("close", () => {
                        connRef.current = null;
                        setP2pStatus("Bağlantı koptu.");
                      });
                      c.on("error", () => setP2pStatus("Bağlantı hatası."));
                    });

                    c.on("error", () => setP2pStatus("Bağlantı hatası."));
                  });

                  p.on("error", (e: any) => setP2pStatus("Peer hata: " + (e?.type || "unknown")));
                }}
                className="px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black uppercase text-xs tracking-widest"
              >
                BAĞLAN
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400">
            {myCode ? (
              <>
                Oda kodun: <span className="font-mono text-white">{myCode}</span>
              </>
            ) : (
              "Oda oluştur veya kodla bağlan."
            )}
          </div>

          {p2pStatus && (
            <div className="mt-3 text-xs text-slate-300 bg-slate-950/60 border border-white/5 rounded-2xl p-3">
              {p2pStatus}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================
  // BOT FLOW: COLOR
  // =========================
  if (selectionStep === "color") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="bg-slate-900 p-12 rounded-[3rem] border border-white/5 text-center shadow-2xl w-full max-w-sm">
          <h1 className="text-4xl font-black text-white italic uppercase mb-10 tracking-tighter">
            X-CHESS
          </h1>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setMode("bot");
                setPlayerColor("w");
                safeResetGame(START_FEN);
                setSelectionStep("time");
              }}
              className="p-8 bg-white/5 hover:bg-white/10 rounded-3xl border border-white/5 transition-all flex flex-col items-center gap-3"
            >
              <span className="text-6xl text-white">♔</span>
              <span className="text-[10px] font-black uppercase text-slate-400">
                Beyaz
              </span>
            </button>

            <button
              onClick={() => {
                setMode("bot");
                setPlayerColor("b");
                safeResetGame(START_FEN);
                setSelectionStep("time");
              }}
              className="p-8 bg-white/5 hover:bg-white/10 rounded-3xl border border-white/5 transition-all flex flex-col items-center gap-3"
            >
              <span className="text-6xl text-white">♚</span>
              <span className="text-[10px] font-black uppercase text-slate-400">
                Siyah
              </span>
            </button>
          </div>

          <button
            onClick={() => {
              cleanupP2P();
              setMode(null);
              setLobbyStep("mode");
              setSelectionStep("color");
            }}
            className="mt-6 w-full py-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 rounded-2xl font-black uppercase text-xs transition-all border border-indigo-500/20"
          >
            🧑‍🤝‍🧑 Online Modu Aç
          </button>

          {!isReady && (
            <p className="mt-3 text-xs text-amber-300">
              Stockfish hazırlanıyor... (bot birazdan aktif)
            </p>
          )}
        </div>
      </div>
    );
  }

  // =========================
  // BOT FLOW: TIME
  // =========================
  if (selectionStep === "time") {
    const opts = [
      { l: "1 DK", v: 60 },
      { l: "3 DK", v: 180 },
      { l: "5 DK", v: 300 },
      { l: "10 DK", v: 600 },
      { l: "SÜRESİZ", v: null },
    ];

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
        <div className="bg-slate-900 p-12 rounded-[3rem] border border-white/5 text-center shadow-2xl w-full max-w-sm">
          <h2 className="text-2xl font-black uppercase mb-8 italic tracking-widest text-indigo-400">
            Tempo Seç
          </h2>

          <div className="grid grid-cols-1 gap-2">
            {opts.map((o) => (
              <button
                key={o.l}
                onClick={() => {
                  setInitialTime(o.v);
                  if (o.v) {
                    setWhiteTime(o.v);
                    setBlackTime(o.v);
                  } else {
                    setWhiteTime(0);
                    setBlackTime(0);
                  }
                  setSelectionStep("game");

                  // if player is black, bot should open (white) after screen loads
                  if (mode === "bot" && playerColor === "b") {
                    setThinking(true);
                    setTimeout(() => requestBotMove(START_FEN), 250);
                  }
                }}
                className="py-4 bg-white/5 hover:bg-indigo-600 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const winnerText =
    timeWinner ||
    (game.isCheckmate()
      ? game.turn() === "b"
        ? "BEYAZ KAZANDI"
        : "SİYAH KAZANDI"
      : "BERABERE");

  // =========================
  // GAME UI
  // =========================
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col items-center font-sans selection:bg-indigo-500/30 text-white">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">
                X-CHESS
              </h1>

              {!isGameOver && mode !== "p2p" && (
                <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-white/5">
                  {(["easy", "medium", "hard"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setDifficulty(lvl)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                        difficulty === lvl
                          ? "bg-indigo-500 text-white"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {lvl === "easy" ? "KOLAY" : lvl === "medium" ? "NORMAL" : "ZOR"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 flex justify-between items-center p-4 rounded-2xl bg-slate-950 border border-white/5">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                RAKİP {mode === "p2p" ? "(ONLINE • SÜRESİZ)" : "(BOT)"}
              </span>
              {initialTime && playerColor && (
                <span className="text-xl font-mono font-black">
                  {formatTime(playerColor === "w" ? blackTime : whiteTime)}
                </span>
              )}
            </div>

            <div
              className={`aspect-square grid grid-cols-8 grid-rows-8 border-8 border-slate-800 rounded-2xl overflow-hidden bg-slate-800 relative shadow-2xl ${
                isGameOver ? "opacity-30" : ""
              }`}
            >
              {hintMove && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-50"
                  viewBox="0 0 100 100"
                >
                  <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
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

            <div className="mt-4 flex justify-between items-center p-4 rounded-2xl bg-slate-950 border border-white/5">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                SEN
              </span>
              {initialTime && playerColor && (
                <span className="text-xl font-mono font-black">
                  {formatTime(playerColor === "w" ? whiteTime : blackTime)}
                </span>
              )}
            </div>

            {isGameOver && (
              <div className="absolute inset-0 flex items-center justify-center z-[100] bg-black/80 backdrop-blur-md rounded-[2.5rem] p-6">
                <div className="bg-slate-900 p-10 rounded-[3rem] border-2 border-indigo-500/30 text-center shadow-2xl w-full max-w-sm">
                  <div className="relative mb-6 flex justify-center items-center gap-3">
                    <span className="text-7xl animate-bounce">🏆</span>
                    <div className="text-left">
                      <p className="text-[10px] font-black text-slate-500 uppercase">
                        Toplam Skor
                      </p>
                      <p className="text-4xl font-black">
                        {totalScore} <span className="text-xs">Puan</span>
                      </p>
                    </div>
                  </div>

                  <h2 className="text-2xl font-black uppercase italic mb-4 tracking-tighter text-indigo-400">
                    {winnerText}
                  </h2>

                  {mode === "p2p" && (
                    <div className="mb-6 text-xs text-slate-300 bg-slate-950/60 border border-white/5 rounded-2xl p-3">
                      {postAnalyzing
                        ? `Stockfish analiz ediyor... (${analysisProgress.i}/${analysisProgress.n})`
                        : analysisDone
                        ? "Analiz tamamlandı ✅"
                        : "Analiz başlatılıyor..."}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (mode === "p2p" && connRef.current?.open) {
                        connRef.current.send({ type: "reset" } as P2PMsg);
                      }
                      window.location.reload();
                    }}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs transition-all"
                  >
                    Yeniden Başlat
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-4">
              {reviewIndex !== null ? (
                <button
                  onClick={() => {
                    setReviewIndex(null);
                    setHintMove(null);
                  }}
                  className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs transition-all"
                >
                  İncelemeyi Kapat
                </button>
              ) : (
                <>
                  {/* ✅ Online modda oyun içi ipucu yok */}
                  {!isGameOver && mode !== "p2p" && (
                    <button
                      onClick={() => getHint()}
                      disabled={thinking || hintLoading || hintCount >= 5}
                      className={`flex-1 py-4 text-white rounded-2xl font-black uppercase text-xs shadow-lg transition-all ${
                        hintCount >= 5
                          ? "bg-slate-800 opacity-50"
                          : "bg-blue-600 hover:bg-blue-500"
                      }`}
                    >
                      {hintLoading ? "..." : `💡 İPUCU (${5 - hintCount}/5)`}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (mode === "p2p" && connRef.current?.open) {
                        connRef.current.send({ type: "reset" } as P2PMsg);
                      }
                      window.location.reload();
                    }}
                    className={`${isGameOver ? "hidden" : "w-32"} py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-black uppercase text-xs`}
                  >
                    Sıfırla
                  </button>
                </>
              )}
            </div>

            {!isReady && (
              <div className="mt-4 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                Stockfish hazır değil. Bot birkaç saniye içinde aktif olur.
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-96 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 flex-1 flex flex-col shadow-xl min-h-[500px]">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 italic text-center border-b border-white/5 pb-4 tracking-[0.2em]">
              {isGameOver ? "🏆 MAÇ RAPORU" : "HAMLE GEÇMİŞİ"}
            </h2>

            {mode === "p2p" && isGameOver && !analysisDone && (
              <div className="mb-4 text-[11px] text-slate-300 bg-slate-950/60 border border-white/5 rounded-2xl p-3">
                {postAnalyzing
                  ? `Stockfish analiz ediyor... (${analysisProgress.i}/${analysisProgress.n})`
                  : "Analiz başlatılıyor..."}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {moveEvaluations.map((evalData, i) => {
                const isWhite = i % 2 === 0;
                const prevEval = i === 0 ? 0 : moveEvaluations[i - 1].score;
                const quality = isGameOver
                  ? getMoveQuality(evalData.score, prevEval, isWhite)
                  : null;

                const isPlayerMove =
                  (isWhite && playerColor === "w") || (!isWhite && playerColor === "b");

                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (!isGameOver) return;
                      setReviewIndex(i);
                      setHintMove(null);
                      // ✅ maç sonrası incelemede ipucu serbest (online dahil)
                      getHint(moveEvaluations[i].fenBefore);
                    }}
                    className={`flex flex-col p-4 rounded-2xl transition-all border ${
                      isGameOver ? "cursor-pointer hover:bg-slate-800" : "cursor-default"
                    } ${
                      reviewIndex === i
                        ? "border-blue-500 bg-blue-500/10"
                        : "bg-slate-950/50 border-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-600 font-black">
                          {Math.floor(i / 2) + 1}.
                        </span>
                        <span className={`font-bold ${isWhite ? "text-white" : "text-indigo-300"}`}>
                          {evalData.move}
                        </span>
                      </div>

                      {quality && (
                        <span className={`text-[9px] font-black uppercase ${quality.color}`}>
                          {quality.label}
                        </span>
                      )}
                    </div>

                    {quality && isPlayerMove && quality.puan > 0 && (
                      <div className="mt-2 text-[10px] font-black text-slate-500">
                        +{quality.puan} Puan
                      </div>
                    )}

                    {mode === "p2p" && isGameOver && !analysisDone && (
                      <div className="mt-2 text-[10px] font-black text-slate-500">
                        Analiz bekleniyor...
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {mode === "p2p" && (
              <div className="mt-4 text-[11px] text-slate-400 bg-slate-950/50 border border-white/5 rounded-2xl p-3">
                Online durum: {p2pStatus || "Bağlı"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
