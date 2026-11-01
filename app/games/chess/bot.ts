import { Chess } from "chess.js";
import type { EngineStage } from "./engine-lifecycle";
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
export type BotResponse =
  | {
      kind?: undefined;
      move: string | null;
      requestId: number;
      depth?: number;
      engine?: "Stockfish 17.1";
      error?: string;
    }
  | { requestId: number; kind: "status"; stage: EngineStage };
export interface BotEngine {
  playMove(options: StockfishPlaySearch): Promise<StockfishMoveResult>;
}

// Every level searches freely at full skill. The user's selected level sets
// the per-move thinking budget, independently of the initial engine download.
export const BOT_LEVELS = {
  easy: { skillLevel: 20, movetime: 500 },
  medium: { skillLevel: 20, movetime: 1_000 },
  hard: { skillLevel: 20, movetime: 2_000 },
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

/** Stockfish at the selected thinking time, with no random-move fallback. */
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
