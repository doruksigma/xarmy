"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

type Difficulty = "easy" | "medium" | "hard";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function depthByDifficulty(d: Difficulty) {
  if (d === "easy") return 2;
  if (d === "medium") return 8;
  return 13;
}

function createInlineStockfishWorker() {
  if (typeof window === "undefined") return null;

  // En stabil asm.js build (wasm değil) — CDN erişimi sorun çıkartmazsa çalışır.
  const CDN_PRIMARY =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
  const CDN_FALLBACK =
    "https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.js";

  const code = `
    // Inline worker: Stockfish'i importScripts ile yükler
    function send(msg){ try { self.postMessage(msg); } catch(e){} }

    // Hata yakalama
    self.onerror = function(e){
      send("SF_WORKER_ERROR::" + (e && e.message ? e.message : "unknown"));
    };

    let engine = null;

    function boot(url){
      try {
        importScripts(url);
        if (typeof self.Stockfish === "function") {
          engine = self.Stockfish();
        }
      } catch (e) {
        engine = null;
        send("SF_IMPORT_FAIL::" + url + "::" + (e && e.message ? e.message : String(e)));
      }
    }

    // Primary dene, olmazsa fallback
    boot("${CDN_PRIMARY}");
    if (!engine) boot("${CDN_FALLBACK}");

    if (!engine) {
      send("SF_INIT_FAILED");
    } else {
      send("SF_INIT_OK");

      engine.onmessage = function(e){
        const msg = (typeof e === "string") ? e : (e && e.data ? e.data : "");
        if (msg) send(msg);
      };

      self.onmessage = function(e){
        try { engine.postMessage(e.data); } catch(err){
          send("SF_ENGINE_POST_FAIL::" + (err && err.message ? err.message : String(err)));
        }
      };
    }
  `;

  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);

  // worker oluştu, blob url artık gerekmez
  URL.revokeObjectURL(url);

  return w;
}

export default function ChessPage() {
  const gameRef = useRef(new Chess(START_FEN));
  const engineRef = useRef<Worker | null>(null);

  const [fen, setFen] = useState(START_FEN);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [engineState, setEngineState] = useState<
    "off" | "booting" | "handshake" | "ready" | "failed"
  >("off");
  const [thinking, setThinking] = useState(false);

  const [log, setLog] = useState<string[]>([]);
  const [uciMove, setUciMove] = useState("e2e4");

  const pendingBestmoveRef = useRef(false);
  const uciOkRef = useRef(false);
  const readyOkRef = useRef(false);

  function pushLog(line: string) {
    setLog((p) => [line, ...p].slice(0, 40));
  }

  // Engine init
  useEffect(() => {
    setEngineState("booting");
    pushLog("INIT: creating stockfish worker…");

    const w = createInlineStockfishWorker();
    engineRef.current = w;

    if (!w) {
      setEngineState("failed");
      pushLog("ERROR: Worker cannot be created (window undefined?)");
      return;
    }

    const send = (msg: string) => {
      w.postMessage(msg);
      pushLog(">> " + msg);
    };

    const handshake = () => {
      setEngineState("handshake");
      uciOkRef.current = false;
      readyOkRef.current = false;

      // UCI handshake
      send("uci");
      // Bazı build’lerde uciok gecikebilir, isready’yi de at
      send("isready");
    };

    const onMsg = (e: MessageEvent) => {
      const msg = String(e.data || "");
      pushLog("SF: " + msg);

      if (msg === "SF_INIT_FAILED") {
        setEngineState("failed");
        return;
      }
      if (msg.startsWith("SF_IMPORT_FAIL::")) {
        // CDN importScripts hata (CSP/CORS)
        // dev ortamında açıkça görünsün
        return;
      }
      if (msg.startsWith("SF_WORKER_ERROR::")) {
        setEngineState("failed");
        return;
      }

      if (msg === "SF_INIT_OK") {
        handshake();
        return;
      }

      if (msg.includes("uciok")) {
        uciOkRef.current = true;
        // uciok geldi, tekrar isready
        send("isready");
        return;
      }

      if (msg.includes("readyok")) {
        readyOkRef.current = true;
        setEngineState("ready");
        return;
      }

      // Bestmove
      if (msg.startsWith("bestmove")) {
        const parts = msg.split(" ");
        const best = parts[1];
        pendingBestmoveRef.current = false;
        setThinking(false);

        if (best && best !== "(none)") {
          applyUciMove(best);
          pushLog("APPLY bestmove: " + best);
        }
        return;
      }
    };

    w.addEventListener("message", onMsg);

    // READY timeout (10 sn)
    const t = window.setTimeout(() => {
      if (!readyOkRef.current) {
        pushLog("TIMEOUT: Engine did not become ready. Likely CSP/CORS/CDN blocked.");
        setEngineState("failed");
      }
    }, 10000);

    return () => {
      window.clearTimeout(t);
      w.removeEventListener("message", onMsg);
      w.terminate();
      engineRef.current = null;
      setEngineState("off");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turn = useMemo(() => {
    return gameRef.current.turn() === "w" ? "White" : "Black";
  }, [fen]);

  function reset() {
    gameRef.current = new Chess(START_FEN);
    setFen(gameRef.current.fen());
    setThinking(false);
    pushLog("RESET game");
  }

  function applyUciMove(uci: string) {
    const g = gameRef.current;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.slice(4, 5);

    const mv = g.move({
      from,
      to,
      promotion: promo ? (promo as any) : undefined,
    });

    if (!mv) {
      pushLog("INVALID move: " + uci);
      return false;
    }
    setFen(g.fen());
    return true;
  }

  function playUserMove() {
    if (thinking) return;
    const ok = applyUciMove(uciMove.trim());
    if (!ok) return;

    // kullanıcı oynadı → bot iste
    requestBotMove();
  }

  function requestBotMove() {
    const w = engineRef.current;
    if (!w) return;

    if (engineState !== "ready") {
      pushLog("WARN: Engine not ready yet.");
      return;
    }
    if (thinking) return;

    const currentFen = gameRef.current.fen();
    const depth = depthByDifficulty(difficulty);

    setThinking(true);
    pendingBestmoveRef.current = true;

    // Temiz başlat (sağlam)
    w.postMessage("stop");
    pushLog(">> stop");
    w.postMessage("ucinewgame");
    pushLog(">> ucinewgame");
    w.postMessage("isready");
    pushLog(">> isready");
    w.postMessage(`position fen ${currentFen}`);
    pushLog(">> position fen " + currentFen);
    w.postMessage(`go depth ${depth}`);
    pushLog(">> go depth " + depth);

    // bestmove timeout (8 sn)
    window.setTimeout(() => {
      if (pendingBestmoveRef.current) {
        pendingBestmoveRef.current = false;
        setThinking(false);
        pushLog("TIMEOUT: bestmove did not arrive (engine stuck / blocked).");
      }
    }, 8000);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">♟️ Chess + Stockfish (Inline Worker)</h1>
          <p className="text-slate-400 text-sm">
            Engine:{" "}
            <span className="font-semibold">
              {engineState}
            </span>
            {thinking ? " • thinking…" : ""}
          </p>
          <p className="text-slate-500 text-xs mt-1 break-all">FEN: {fen}</p>
          <p className="text-slate-400 text-sm mt-2">Turn: {turn}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 transition"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-slate-300 text-sm">Difficulty:</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2"
            >
              <option value="easy">Easy (depth 2)</option>
              <option value="medium">Medium (depth 8)</option>
              <option value="hard">Hard (depth 13)</option>
            </select>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              value={uciMove}
              onChange={(e) => setUciMove(e.target.value)}
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2 w-28"
              placeholder="e2e4"
            />
            <button
              onClick={playUserMove}
              disabled={engineState !== "ready" || thinking}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              Oyna
            </button>
            <button
              onClick={requestBotMove}
              disabled={engineState !== "ready" || thinking}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
            >
              Bot Hamlesi
            </button>
          </div>

          <p className="text-slate-500 text-xs mt-3">
            Eğer engineState <b>ready</b> olmuyorsa: büyük ihtimalle CDN importScripts CSP/CORS yüzünden bloklanıyor.
            Log panelinde <code>SF_IMPORT_FAIL</code> veya <code>TIMEOUT</code> göreceksin.
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60">
          <h3 className="text-slate-100 font-semibold mb-2">Debug Log</h3>
          <div className="h-64 overflow-auto text-xs text-slate-300 whitespace-pre-wrap">
            {log.map((l, i) => (
              <div key={i} className="border-b border-slate-800 py-1">
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
