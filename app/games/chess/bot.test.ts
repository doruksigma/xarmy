import assert from "node:assert/strict";
import test from "node:test";
import { Chess, type Square } from "chess.js";
import { chooseBotMove, type BotDifficulty } from "./bot";

function applyUci(game: Chess, move: string | null) {
  assert.ok(move, "Expected a legal move");
  return game.move({
    from: move.slice(0, 2) as Square,
    to: move.slice(2, 4) as Square,
    promotion: move[4],
  });
}

for (const difficulty of ["easy", "medium", "hard"] satisfies BotDifficulty[]) {
  test(`${difficulty}: returns a legal opening move within a bounded search`, () => {
    const game = new Chess();
    const start = Date.now();
    applyUci(game, chooseBotMove(game.fen(), difficulty));
    assert.equal(game.turn(), "b");
    assert.ok(Date.now() - start < 5_000);
  });

  test(`${difficulty}: takes an available checkmate`, () => {
    const game = new Chess("7k/5K2/6Q1/8/8/8/8/8 w - - 0 1");
    applyUci(game, chooseBotMove(game.fen(), difficulty));
    assert.equal(game.isCheckmate(), true);
  });

  test(`${difficulty}: captures a hanging queen`, () => {
    const game = new Chess("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1");
    const move = chooseBotMove(game.fen(), difficulty);
    assert.equal(move, "e4d5");
    assert.equal(applyUci(game, move).captured, "q");
  });

  test(`${difficulty}: evaluates captures from black's perspective`, () => {
    const game = new Chess("4k3/8/8/4p3/3Q4/8/8/4K3 b - - 0 1");
    const move = chooseBotMove(game.fen(), difficulty);
    assert.equal(move, "e5d4");
    assert.equal(applyUci(game, move).captured, "q");
  });
}

test("returns null for checkmate, stalemate, and insufficient material", () => {
  for (const fen of [
    "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1",
    "7k/5K2/6Q1/8/8/8/8/8 b - - 0 1",
    "7k/8/8/8/8/8/8/K7 w - - 0 1",
  ]) {
    assert.equal(chooseBotMove(fen), null);
  }
});

test("includes promotion in UCI output", () => {
  const game = new Chess("8/P6k/8/8/8/8/8/7K w - - 0 1");
  const move = chooseBotMove(game.fen(), "easy");
  assert.equal(move, "a7a8q");
  assert.equal(applyUci(game, move).promotion, "q");
});

test("rejects invalid FEN instead of inventing a move", () => {
  assert.throws(() => chooseBotMove("invalid"));
});
