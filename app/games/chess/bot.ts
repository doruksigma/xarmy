import { Chess } from "chess.js";
import {
  StockfishClient,
  type StockfishMoveResult,
  type StockfishPlaySearch,
} from "./stockfish-client";

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
  engine?: "Stockfish 17.1";
  error?: string;
}
export interface BotEngine {
  playMove(options: StockfishPlaySearch): Promise<StockfishMoveResult>;
}

// Every level uses the same unhandicapped engine. Only the two lower levels
// cap search depth. Hard searches freely until its per-move thinking time ends,
// rather than returning a move from an artificially restricted opening book.
export const BOT_LEVELS = {
  easy: { skillLevel: 20, depth: 1 },
  medium: { skillLevel: 20, depth: 10 },
  hard: { skillLevel: 20, movetime: 8_000 },
} satisfies Record<
  BotDifficulty,
  Pick<StockfishPlaySearch, "skillLevel" | "depth" | "movetime">
>;

export async function searchBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: {
    engine?: BotEngine;
    positionCommand?: string;
  } = {},
): Promise<{ move: string | null; depth: number; nodes: number }> {
  const game = new Chess(fen);
  if (game.isGameOver()) return { move: null, depth: 0, nodes: 0 };
  const limits = BOT_LEVELS[difficulty];
  if (!limits) throw new Error("Geçersiz bot seviyesi.");
  const owned = options.engine ? null : new StockfishClient();
  const engine = options.engine ?? owned!;
  try {
    const result = await engine.playMove({
      fen,
      positionCommand: options.positionCommand,
      ...limits,
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

/** Stockfish at the selected thinking depth, with no random-move fallback. */
export async function chooseBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: {
    engine?: BotEngine;
    positionCommand?: string;
  } = {},
): Promise<string | null> {
  return (await searchBotMove(fen, difficulty, options)).move;
}
