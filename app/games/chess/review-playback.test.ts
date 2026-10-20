import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import type { MoveReview } from "./coach";
import { createMateLine } from "./review-playback";

function review(overrides: Partial<MoveReview>): MoveReview {
  return {
    fen: new Chess().fen(),
    afterFen: new Chess().fen(),
    playedMove: "e2e4",
    playedSan: "e4",
    bestMove: "e2e4",
    bestSan: "e4",
    scoreBefore: 0,
    scoreAfter: 0,
    scoreBeforeMate: null,
    scoreAfterMate: null,
    lossCp: 0,
    judgment: "good",
    explanation: "",
    betterExplanation: "",
    depth: 16,
    playedDepth: 16,
    quality: "complete",
    pv: [],
    playedPv: [],
    ...overrides,
  };
}

test("the bad move and opponent's actual mate can be replayed without changing the game", () => {
  const game = new Chess();
  game.move("f3");
  game.move("e5");
  const original = game.fen();
  const line = createMateLine(
    review({ fen: original, scoreAfterMate: -1, playedPv: ["g2g4", "d8h4"] }),
  );
  assert.ok(line);
  assert.deepEqual(line.moves, ["g4", "Qh4#"]);
  assert.equal(line.positions.length, 3);
  assert.equal(line.positions[0], original);
  assert.equal(new Chess(line.positions[1]).isCheckmate(), false);
  assert.equal(new Chess(line.positions[2]).isCheckmate(), true);
  assert.equal(game.fen(), original);
});

test("a missed mating move is shown from the best verified continuation", () => {
  const game = new Chess();
  ["f3", "e5", "g4"].forEach((move) => game.move(move));
  const line = createMateLine(
    review({ fen: game.fen(), scoreBeforeMate: 1, pv: ["d8h4"] }),
  );
  assert.ok(line);
  assert.deepEqual(line.moves, ["Qh4#"]);
  assert.equal(new Chess(line.positions.at(-1)!).isCheckmate(), true);
});

test("a score without a complete mating continuation never creates a fake demonstration", () => {
  assert.equal(
    createMateLine(review({ scoreAfterMate: -3, playedPv: ["e2e4"] })),
    null,
  );
  assert.equal(createMateLine(review({ scoreBeforeMate: 3, pv: [] })), null);
});

test("illegal engine moves and unmeasured results are never offered as a mating line", () => {
  assert.equal(
    createMateLine(review({ scoreAfterMate: -1, playedPv: ["e2e5"] })),
    null,
  );
  assert.equal(
    createMateLine(review({ quality: "unmeasured", scoreAfterMate: -1 })),
    null,
  );
  assert.equal(createMateLine(undefined), null);
});

test("ordinary positions do not show mate controls just because a variation exists", () => {
  assert.equal(createMateLine(review({ playedPv: ["e2e4", "e7e5"] })), null);
});
