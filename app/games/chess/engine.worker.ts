// WebWorker (module) — Stockfish burada çalışır.
import Stockfish from "stockfish";

const engine = Stockfish(); // engine: { postMessage, onmessage } benzeri

const send = (m: any) => {
  // main thread'e string/obj iletebiliriz
  (self as any).postMessage(m);
};

// engine -> main
engine.onmessage = (e: any) => {
  const msg = typeof e === "string" ? e : e?.data;
  if (msg != null) send(String(msg));
};

// main -> engine
(self as any).onmessage = (e: MessageEvent) => {
  try {
    engine.postMessage(e.data);
  } catch (err: any) {
    send("SF_WORKER_POST_FAIL::" + (err?.message || "unknown"));
  }
};

// küçük bir sinyal
send("SF_WORKER_READY");
