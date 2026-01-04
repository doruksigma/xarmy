// app/games/chess/engine.worker.ts
import Stockfish from "stockfish";

// stockfish() worker-like bir nesne döndürür: postMessage/onmessage
const sf: any = Stockfish();

// Stockfish -> UI
sf.onmessage = (e: any) => {
  const line = typeof e === "string" ? e : e?.data;
  (self as any).postMessage(line);
};

// UI -> Stockfish
(self as any).onmessage = (e: MessageEvent) => {
  sf.postMessage(e.data);
};
