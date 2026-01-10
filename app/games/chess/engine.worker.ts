/* eslint-disable no-restricted-globals */
// WebWorker (module) — Stockfish burada çalışır.

import Stockfish from "stockfish";

// stockfish paketi browser tarafında Worker-friendly API döndürür:
// Stockfish() -> engine benzeri (postMessage/onmessage)
const engine: any = (Stockfish as any)();

function send(msg: string) {
  (self as any).postMessage(msg);
}

// Stockfish -> dışarı
engine.onmessage = (e: any) => {
  const msg = typeof e === "string" ? e : e?.data;
  if (msg) send(String(msg));
};

// dışarı -> Stockfish
(self as any).onmessage = (e: MessageEvent) => {
  try {
    engine.postMessage(e.data);
  } catch (err: any) {
    send("SF_WORKER_POST_FAIL::" + (err?.message || "unknown"));
  }
};

// boot ping
send("SF_WORKER_UP");
