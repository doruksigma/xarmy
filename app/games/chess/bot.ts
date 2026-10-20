import { Chess } from "chess.js";
import {
  StockfishClient,
  type StockfishMoveResult,
  type StockfishPlaySearch,
} from "./stockfish-client";
import { openingCandidates, randomChoice } from "./openings";

export type BotDifficulty = "easy" | "medium" | "hard";
export interface BotRequest {
  fen: string;
  difficulty: BotDifficulty;
  requestId: number;
  positionCommand?: string;
}
export interface BotResponse {
  move: string | null;
  requestId: number;
  depth?: number;
  engine?: "Stockfish 17.1" | "Başlangıç botu";
  error?: string;
}
export interface BotEngine {
  playMove(options: StockfishPlaySearch): Promise<StockfishMoveResult>;
}

// Beginner play is random; medium mixes mistakes with a very short search.
// Deep searches are reserved for hard play and independent coach analysis.
export const BOT_LEVELS = {
  easy: { skillLevel: 0, depth: 1, movetime: 50 },
  medium: { skillLevel: 0, depth: 2, movetime: 150 },
  hard: { skillLevel: 20, depth: 20, movetime: 3_500 },
} satisfies Record<
  BotDifficulty,
  { skillLevel: number; depth: number; movetime: number }
>;

export async function searchBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: {
    engine?: BotEngine;
    positionCommand?: string;
    random?: () => number;
  } = {},
): Promise<{ move: string | null; depth: number; nodes: number }> {
  const game = new Chess(fen);
  if (game.isGameOver()) return { move: null, depth: 0, nodes: 0 };
  const limits = BOT_LEVELS[difficulty];
  if (!limits) throw new Error("Geçersiz bot seviyesi.");
  const random = options.random ?? Math.random;
  const legal = game.moves({ verbose: true });
  // Beginner play intentionally misses tactics. It must not secretly ask a
  // master engine to choose the best move from almost the entire game tree.
  if (difficulty === "easy" || (difficulty === "medium" && random() < 0.3)) {
    const safe =
      difficulty === "medium"
        ? legal.filter((move) => {
            const after = new Chess(move.after);
            return !after.isAttacked(move.to, after.turn());
          })
        : legal;
    const move = randomChoice(safe.length ? safe : legal, random);
    return {
      move: `${move.from}${move.to}${move.promotion ?? ""}`,
      depth: 0,
      nodes: 0,
    };
  }
  const openings = difficulty === "hard" ? openingCandidates(fen) : [];
  const owned = options.engine ? null : new StockfishClient();
  const engine = options.engine ?? owned!;
  try {
    const result = await engine.playMove({
      fen,
      positionCommand: options.positionCommand,
      ...limits,
      ...(openings.length > 1
        ? { searchMoves: [randomChoice(openings, random)] }
        : {}),
    });
    const move = result.bestMove;
    if (!move || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
      throw new Error("Stockfish geçerli bir hamle döndürmedi.");
    game.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move[4],
    });
    return { move, depth: result.depth, nodes: result.nodes };
  } finally {
    owned?.terminate();
  }
}

/** Stockfish at the selected skill, never a fallback to the old local bot. */
export async function chooseBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: {
    engine?: BotEngine;
    positionCommand?: string;
    random?: () => number;
  } = {},
): Promise<string | null> {
  return (await searchBotMove(fen, difficulty, options)).move;
}
