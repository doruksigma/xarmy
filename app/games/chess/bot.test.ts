import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  BOT_LEVELS,
  chooseBotMove,
  searchBotMove,
  type BotDifficulty,
  type BotEngine,
} from "./bot";
import type { StockfishPlaySearch } from "./stockfish-client";

function engine(move: string, seen?: StockfishPlaySearch[]): BotEngine {
  return {
    playMove: async (options) => {
      seen?.push(options);
      return {
        bestMove: move,
        depth: options.depth,
        nodes: 123456,
      };
    },
  };
}
for (const difficulty of ["easy", "medium", "hard"] satisfies BotDifficulty[]) {
  test(`${difficulty}: delegates the selected Stockfish skill and search budget`, async () => {
    const seen: StockfishPlaySearch[] = [];
    const result = await searchBotMove(new Chess().fen(), difficulty, {
      engine: engine("e2e4", seen),
      positionCommand: "position startpos",
    });
    assert.equal(result.move, "e2e4");
    assert.equal(result.depth, BOT_LEVELS[difficulty].depth);
    assert.equal(result.nodes, 123456);
    assert.equal(seen[0].positionCommand, "position startpos");
    assert.deepEqual(seen[0], {
      fen: new Chess().fen(),
      positionCommand: "position startpos",
      ...BOT_LEVELS[difficulty],
    });
  });
}
test("stronger presets give more search time and depth", () => {
  assert.deepEqual(
    [BOT_LEVELS.easy.skillLevel, BOT_LEVELS.medium.skillLevel, BOT_LEVELS.hard.skillLevel],
    [0, 8, 20],
  );
  assert.ok(BOT_LEVELS.easy.depth < BOT_LEVELS.medium.depth);
  assert.ok(BOT_LEVELS.medium.depth < BOT_LEVELS.hard.depth);
  assert.ok(BOT_LEVELS.easy.movetime < BOT_LEVELS.hard.movetime);
});
test("black preserves the complete position history for repetition and legality", async () => {
  const game = new Chess();
  game.move("e4");
  const seen: StockfishPlaySearch[] = [];
  const move = await chooseBotMove(game.fen(), "hard", {
    engine: engine("e7e5", seen),
    positionCommand: "position startpos moves e2e4",
  });
  assert.equal(move, "e7e5");
  assert.equal(seen[0].fen, game.fen());
  assert.equal(seen[0].positionCommand, "position startpos moves e2e4");
});
test("promotions are preserved and invalid engine moves never silently fall back", async () => {
  const fen = "7k/P7/8/8/8/8/8/7K w - - 0 1";
  assert.equal(
    await chooseBotMove(fen, "hard", { engine: engine("a7a8q") }),
    "a7a8q",
  );
  await assert.rejects(
    chooseBotMove(new Chess().fen(), "hard", { engine: engine("e2e5") }),
  );
  await assert.rejects(
    chooseBotMove(new Chess().fen(), "hard", { engine: engine("badmove") }),
  );
});
test("finished games do not request a bot move, invalid FEN still fails", async () => {
  const noSearch: BotEngine = {
    playMove: async () => {
      throw new Error("unexpected search");
    },
  };
  assert.equal(
    await chooseBotMove("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", "hard", {
      engine: noSearch,
    }),
    null,
  );
  assert.equal(
    await chooseBotMove("7k/8/8/8/8/8/8/K7 w - - 0 1", "hard", {
      engine: noSearch,
    }),
    null,
  );
  await assert.rejects(chooseBotMove("invalid", "hard", { engine: noSearch }));
});
test("engine failures stay visible instead of using a weak substitute", async () => {
  await assert.rejects(
    chooseBotMove(new Chess().fen(), "hard", {
      engine: {
        playMove: async () => {
          throw new Error("offline");
        },
      },
    }),
    /offline/,
  );
});
