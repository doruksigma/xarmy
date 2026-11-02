// WebWorker (module) — Stockfish burada çalışır.
import Stockfish from "stockfish";

type EngineMessage = string | { data: unknown };
interface UciEngine {
  postMessage(message: unknown): void;
  onmessage: ((event: EngineMessage) => void) | null;
}
interface WorkerScope {
  postMessage(message: string): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}
const engine = Stockfish() as UciEngine;
const worker = self as unknown as WorkerScope;

const send = (m: string) => {
  worker.postMessage(m);
};

// engine -> main
engine.onmessage = (e: EngineMessage) => {
  const msg = typeof e === "string" ? e : e?.data;
  if (msg != null) send(String(msg));
};

// main -> engine
worker.onmessage = (e: MessageEvent<unknown>) => {
  try {
    engine.postMessage(e.data);
  } catch (err: unknown) {
    send(
      "SF_WORKER_POST_FAIL::" +
        (err instanceof Error ? err.message : "unknown"),
    );
  }
};

// küçük bir sinyal
send("SF_WORKER_READY");
