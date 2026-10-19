import { Chess, type Move, type PieceSymbol } from "chess.js";

export type BotDifficulty = "easy" | "medium" | "hard";

export interface BotRequest {
  fen: string;
  difficulty: BotDifficulty;
  requestId: number;
}

export interface BotResponse {
  move: string | null;
  requestId: number;
  error?: string;
}

const VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};

// Every search is bounded by both elapsed time and visited nodes. A worker keeps
// this calculation off the UI thread; terminating it also cancels pending work.
const LEVELS = {
  easy: { depth: 1, nodes: 600, timeMs: 120 },
  medium: { depth: 2, nodes: 3_500, timeMs: 400 },
  hard: { depth: 4, nodes: 14_000, timeMs: 1_100 },
} satisfies Record<
  BotDifficulty,
  { depth: number; nodes: number; timeMs: number }
>;

const MATE_SCORE = 100_000;
const SEARCH_EXHAUSTED = Symbol("search exhausted");

function uci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function movePriority(move: Move): number {
  if (move.san.endsWith("#")) return MATE_SCORE;
  const capture = move.captured
    ? 10 * VALUES[move.captured] - VALUES[move.piece]
    : 0;
  const promotion = move.promotion ? VALUES[move.promotion] : 0;
  return capture + promotion + (move.san.includes("+") ? 30 : 0);
}

function orderMoves(moves: Move[], preferred?: string): Move[] {
  return moves.sort((a, b) => {
    if (uci(a) === preferred) return -1;
    if (uci(b) === preferred) return 1;
    return movePriority(b) - movePriority(a) || uci(a).localeCompare(uci(b));
  });
}

// Scores are always from the side to move's perspective, as required by negamax.
function evaluate(game: Chess): number {
  let score = 0;
  let nonPawnMaterial = 0;
  const board = game.board();
  for (const rank of board) {
    for (const piece of rank) {
      if (piece && piece.type !== "p") nonPawnMaterial += VALUES[piece.type];
    }
  }
  for (let row = 0; row < 8; row += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[row][file];
      if (!piece) continue;
      const advance = piece.color === "w" ? 7 - row : row;
      const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - file);
      let positional = 0;
      if (piece.type === "p") positional = advance * 9 + center * 3;
      if (piece.type === "n") positional = center * 13;
      if (piece.type === "b") positional = center * 7;
      if (piece.type === "r") positional = advance * 2;
      if (piece.type === "q") positional = center * 3;
      if (piece.type === "k") {
        positional =
          nonPawnMaterial < 1_600 ? center * 12 : -center * 7 - advance * 5;
      }
      score +=
        (piece.color === "w" ? 1 : -1) * (VALUES[piece.type] + positional);
    }
  }
  return game.turn() === "w" ? score : -score;
}

/** Returns a legal UCI move, or null for a finished position. Invalid FEN throws. */
export function chooseBotMove(
  fen: string,
  difficulty: BotDifficulty = "medium",
): string | null {
  const limits = LEVELS[difficulty];
  if (!limits) throw new Error("Geçersiz bot seviyesi.");
  const deadline = Date.now() + limits.timeMs;
  const game = new Chess(fen);
  const rootMoves = orderMoves(game.moves({ verbose: true }));
  if (rootMoves.length === 0 || game.isDraw()) return null;

  // Preserve immediate wins even when a device cannot complete its first depth.
  const mate = rootMoves.find((move) => move.san.endsWith("#"));
  if (mate) return uci(mate);

  let nodes = 0;
  let bestMove = uci(rootMoves[0]);

  const search = (
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
  ): number => {
    nodes += 1;
    if (nodes > limits.nodes || Date.now() >= deadline) throw SEARCH_EXHAUSTED;
    if (
      game.isInsufficientMaterial() ||
      game.isThreefoldRepetition() ||
      game.isDrawByFiftyMoves()
    ) {
      return 0;
    }
    const moves = orderMoves(game.moves({ verbose: true }));
    if (moves.length === 0) return game.isCheck() ? -MATE_SCORE + ply : 0;
    if (depth === 0) return evaluate(game);

    let best = -Infinity;
    for (const move of moves) {
      game.move({ from: move.from, to: move.to, promotion: move.promotion });
      let score: number;
      try {
        score = -search(depth - 1, -beta, -alpha, ply + 1);
      } finally {
        game.undo();
      }
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  };

  // Only commit completed depths, so a timed out branch cannot bias the result.
  for (let depth = 1; depth <= limits.depth; depth += 1) {
    let iterationBest = bestMove;
    let iterationScore = -Infinity;
    let alpha = -Infinity;
    try {
      for (const move of orderMoves(rootMoves, bestMove)) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion });
        let score: number;
        try {
          score = -search(depth - 1, -Infinity, -alpha, 1);
        } finally {
          game.undo();
        }
        if (score > iterationScore) {
          iterationScore = score;
          iterationBest = uci(move);
        }
        alpha = Math.max(alpha, score);
      }
      bestMove = iterationBest;
      if (iterationScore >= MATE_SCORE - depth) break;
    } catch (error) {
      if (error !== SEARCH_EXHAUSTED) throw error;
      break;
    }
  }
  return bestMove;
}
