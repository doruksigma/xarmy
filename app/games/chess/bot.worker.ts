import { searchBotMove, type BotRequest, type BotResponse } from "./bot";
import { StockfishClient } from "./stockfish-client";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null;
  postMessage: (message: BotResponse) => void;
};
let engine: StockfishClient | undefined;
worker.onmessage = async ({ data }) => {
  try {
    engine ??= new StockfishClient();
    const result = await searchBotMove(data.fen, data.difficulty, {
      engine,
      positionCommand: data.positionCommand,
    });
    worker.postMessage({
      requestId: data.requestId,
      move: result.move,
      depth: result.depth,
      engine: "Stockfish 17.1",
    });
  } catch {
    engine?.terminate();
    engine = undefined;
    worker.postMessage({
      requestId: data.requestId,
      move: null,
      error: "Stockfish yüklenemedi veya hamle hesaplanamadı. Tekrar dene.",
    });
  }
};
