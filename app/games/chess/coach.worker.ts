import {
  analyzePlayedMove,
  analyzePosition,
  reviewPositions,
  type CoachRequest,
  type CoachResponse,
} from "./coach";
import { StockfishClient } from "./stockfish-client";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CoachRequest>) => void) | null;
  postMessage: (message: CoachResponse) => void;
};

let engine: StockfishClient | undefined;
worker.onmessage = async ({ data }) => {
  try {
    engine ??= new StockfishClient();
    await engine.ready;
    if (data.kind === "hint") {
      worker.postMessage({
        kind: "hint",
        requestId: data.requestId,
        advice: await analyzePosition(data.fen, {
          engine,
          startFen: data.startFen,
          moves: data.moves,
          vary: true,
          excludeMove: data.excludeMove,
        }),
      });
      return;
    }
    // Replay every ply before emitting results, then reuse one strong engine for
    // both players. Hosting an online room never determines who gets reviewed.
    const positions = reviewPositions(data.moves, data.startFen);
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      const review = await analyzePlayedMove(position.fen, position.notation, {
        engine,
        startFen: data.startFen,
        moves: position.moves,
      });
      worker.postMessage({
        kind: "progress",
        requestId: data.requestId,
        completed: index + 1,
        total: positions.length,
        review: { ...review, ply: position.ply },
      });
    }
    worker.postMessage({ kind: "complete", requestId: data.requestId });
  } catch {
    engine?.terminate();
    engine = undefined;
    worker.postMessage({
      kind: "error",
      requestId: data.requestId,
      error:
        "Stockfish analizi tamamlanamadı. Motor veya hamle geçmişi doğrulanamadı; yeniden dene.",
    });
  } finally {
    if (data.kind === "review") {
      engine?.terminate();
      engine = undefined;
    }
  }
};
