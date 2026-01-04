// app/games/chess/engine.worker.ts

// TypeScript type derdini bitirmek için require kullanıyoruz
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stockfish = require("stockfish");

const sf: any = Stockfish();

sf.onmessage = (e: any) => {
  const line = typeof e === "string" ? e : e?.data;
  (self as any).postMessage(line);
};

(self as any).onmessage = (e: MessageEvent) => {
  sf.postMessage(e.data);
};
