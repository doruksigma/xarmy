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

// Stockfish's supported skill setting deliberately selects weaker continuations
// for the two learning opponents. Coach analysis separately always uses skill 20.
export const BOT_LEVELS = {
  easy: { skillLevel: 0, depth: 5, movetime: 400 },
  medium: { skillLevel: 8, depth: 12, movetime: 1_000 },
  hard: { skillLevel: 20, depth: 20, movetime: 3_500 },
} satisfies Record<
  BotDifficulty,
  { skillLevel: number; depth: number; movetime: number }
>;

export async function searchBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: { engine?: BotEngine; positionCommand?: string } = {},
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

/** Stockfish at the selected skill, never a fallback to the old local bot. */
export async function chooseBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: { engine?: BotEngine; positionCommand?: string } = {},
): Promise<string | null> {
  return (await searchBotMove(fen, difficulty, options)).move;
}
