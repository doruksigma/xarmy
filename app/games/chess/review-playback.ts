import { Chess } from "chess.js";
import type { MoveReview } from "./coach";

export type MateLine = {
  key: string;
  moves: string[];
  uci: string[];
  positions: string[];
};

/** Only offer a mating demonstration when every move is legal and ends in mat. */
export function createMateLine(
  review: MoveReview | undefined,
): MateLine | null {
  if (!review || review.quality === "unmeasured") return null;
  const candidates: string[][] = [];
  if (review.scoreAfterMate !== null) candidates.push(review.playedPv);
  if (review.scoreBeforeMate !== null) candidates.push(review.pv);
  for (const variation of candidates) {
    const board = new Chess(review.fen);
    const moves: string[] = [];
    const uci: string[] = [];
    const positions = [board.fen()];
    try {
      for (const notation of variation) {
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(notation)) break;
        const move = board.move({
          from: notation.slice(0, 2),
          to: notation.slice(2, 4),
          promotion: notation[4],
        });
        moves.push(move.san);
        uci.push(notation);
        positions.push(board.fen());
        if (board.isCheckmate()) break;
      }
      if (moves.length && board.isCheckmate()) {
        return { key: `${review.fen}|${uci.join(" ")}`, moves, uci, positions };
      }
    } catch {
      // A truncated or illegal PV is never presented as a complete mating line.
    }
  }
  return null;
}
