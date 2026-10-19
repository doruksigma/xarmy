import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  analyzePlayedMove,
  analyzePosition,
  playAnalysisMove,
  type AnalysisOptions,
} from "./coach";

const SHALLOW: AnalysisOptions = {
  maxDepth: 1,
  timeMs: 1_500,
  maxNodes: 60_000,
};

test("coach gives a legal bounded opening hint and a legal principal variation", () => {
  const game = new Chess();
  const start = Date.now();
  const advice = analyzePosition(game.fen(), { timeMs: 100 });
  assert.ok(advice.bestMove);
  assert.equal(advice.pv[0], advice.bestMove);
  for (const notation of advice.pv) playAnalysisMove(game, notation);
  assert.ok(Date.now() - start < 3_000);
  assert.ok(advice.explanation.length > 20);
});

test("coach preserves immediate mate even with a tiny node budget", () => {
  const game = new Chess("7k/5K2/6Q1/8/8/8/8/8 w - - 0 1");
  const advice = analyzePosition(game.fen(), { maxNodes: 100, timeMs: 25 });
  assert.ok(advice.bestMove);
  playAnalysisMove(game, advice.bestMove);
  assert.equal(game.isCheckmate(), true);
  assert.match(advice.explanation, /şah mat/);
});

for (const [color, fen, move] of [
  ["white", "4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", "e4d5"],
  ["black", "4k3/8/8/4p3/3Q4/8/8/4K3 b - - 0 1", "e5d4"],
] as const) {
  test(`${color}: captures an available queen and keeps review scores in the mover's perspective`, () => {
    const advice = analyzePosition(fen, SHALLOW);
    assert.equal(advice.bestMove, move);
    const review = analyzePlayedMove(fen, move, SHALLOW);
    assert.equal(review.bestMove, move);
    assert.equal(review.judgment, "best");
    assert.equal(review.lossCp, 0);
    assert.equal(review.scoreBefore, review.scoreAfter);
    assert.ok(review.scoreAfter > 0, "the capturer keeps a pawn advantage");
    assert.match(review.betterExplanation, /vezir/);
  });
}

test("coach identifies a mate blunder and explains the actual mating reply", () => {
  const game = new Chess();
  game.move("f3");
  game.move("e5");
  const review = analyzePlayedMove(game.fen(), "g4", SHALLOW);
  assert.equal(review.judgment, "blunder");
  assert.ok(review.scoreAfter < -90_000);
  assert.match(review.explanation, /Qh4#.*şah mat/);
  assert.match(review.betterExplanation, /Qh4# matına izin vermiyor/);
  assert.notEqual(review.bestMove, review.playedMove);
});

test("coach explains the legal reply that captures a hanging queen", () => {
  const fen = "4k3/8/8/8/8/8/r7/3QK3 w - - 0 1";
  const review = analyzePlayedMove(fen, "d1a4", SHALLOW);
  assert.equal(review.judgment, "blunder");
  assert.ok(review.lossCp > 800);
  assert.match(review.explanation, /Rxa4.*a4.*vezir/);
  assert.match(review.betterExplanation, /vezir kaybını önlüyor/);
  const game = new Chess(review.afterFen);
  assert.equal(game.move("Rxa4").captured, "q");
});

test("a completed comparison never calls its selected best move a mistake", () => {
  const fen = "4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1";
  for (const maxNodes of [100, 1_000]) {
    const review = analyzePlayedMove(fen, "e4d5", {
      maxNodes,
      maxDepth: 5,
      timeMs: 80,
    });
    assert.equal(review.playedMove, review.bestMove);
    assert.equal(review.lossCp, 0);
    assert.equal(review.judgment, "best");
  }
});

test("promotion notation survives hints, replay, and move reviews", () => {
  const fen = "8/P6k/8/8/8/8/8/7K w - - 0 1";
  const advice = analyzePosition(fen, SHALLOW);
  assert.equal(advice.bestMove, "a7a8q");
  const review = analyzePlayedMove(fen, "a7a8q", SHALLOW);
  assert.equal(review.playedMove, "a7a8q");
  assert.equal(new Chess(review.afterFen).get("a8")?.type, "q");
  assert.match(review.betterExplanation, /vezir/);
});

test("finished positions give no suggestion; invalid input does not invent analysis", () => {
  for (const fen of [
    "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1",
    "7k/5K2/6Q1/8/8/8/8/8 b - - 0 1",
    "7k/8/8/8/8/8/8/K7 w - - 0 1",
  ])
    assert.equal(analyzePosition(fen).bestMove, null);
  assert.throws(() => analyzePosition("invalid"));
  assert.throws(() => analyzePlayedMove(new Chess().fen(), "e2e5"));
});
