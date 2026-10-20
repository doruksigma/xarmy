import { Chess } from "chess.js";
import {
  StockfishClient,
  type StockfishResult,
  type StockfishSearch,
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
  analyze(options: StockfishSearch): Promise<StockfishResult>;
}

// Every preset uses Stockfish's full skill. These limits change thinking time,
// not deliberate mistakes, randomized moves, or a reduced playing strength.
export const BOT_LEVELS = {
  easy: { depth: 14, movetime: 1_200 },
  medium: { depth: 18, movetime: 2_200 },
  hard: { depth: 20, movetime: 3_500 },
} satisfies Record<BotDifficulty, { depth: number; movetime: number }>;

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
    const result = await engine.analyze({
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

/** Full-strength Stockfish move, never a fallback to the old shallow search. */
export async function chooseBotMove(
  fen: string,
  difficulty: BotDifficulty = "hard",
  options: { engine?: BotEngine; positionCommand?: string } = {},
): Promise<string | null> {
  return (await searchBotMove(fen, difficulty, options)).move;
}
