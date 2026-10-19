import { Chess } from "chess.js";
import {
  analyzePlayedMove,
  analyzePosition,
  playAnalysisMove,
  type CoachRequest,
  type CoachResponse,
} from "./coach";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CoachRequest>) => void) | null;
  postMessage: (message: CoachResponse) => void;
};

worker.onmessage = ({ data }) => {
  try {
    if (data.kind === "hint") {
      worker.postMessage({
        kind: "hint",
        requestId: data.requestId,
        advice: analyzePosition(data.fen),
      });
      return;
    }
    // Validate the complete replay before emitting partial results. Ply remains
    // the absolute zero-based index even when only one player's moves are analyzed.
    const game = data.startFen ? new Chess(data.startFen) : new Chess();
    const positions = data.moves
      .map((notation, ply) => {
        const fen = game.fen();
        const color = game.turn();
        playAnalysisMove(game, notation);
        return { fen, notation, ply, color };
      })
      .filter(
        (position) => !data.playerColor || position.color === data.playerColor,
      );
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      const review = analyzePlayedMove(position.fen, position.notation);
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
    worker.postMessage({
      kind: "error",
      requestId: data.requestId,
      error:
        "Analiz tamamlanamadı. Konum veya hamle geçmişi geçersiz olabilir; yeniden dene.",
    });
  }
};
