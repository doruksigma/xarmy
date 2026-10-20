import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  analyzePlayedMove,
  analyzePosition,
  playAnalysisMove,
  reviewPositions,
  type CoachEngine,
  type CoachSearch,
  type CoachSearchResult,
  type EngineScore,
} from "./coach";

const opening = new Chess().fen();
const cp = (value: number): EngineScore => ({ type: "cp", value });
const mate = (value: number): EngineScore => ({ type: "mate", value });
function result(
  bestMove: string,
  score: EngineScore | null,
  depth = 16,
  pv = [bestMove],
): CoachSearchResult {
  return { bestMove, score, depth, pv };
}
function engineWith(...responses: CoachSearchResult[]) {
  const calls: CoachSearch[] = [];
  const engine: CoachEngine = {
    async analyze(request) {
      calls.push(request);
      const response = responses.shift();
      assert.ok(response, "an unexpected engine search was requested");
      return response;
    },
  };
  return { engine, calls };
}

test("varied hints choose a different verified good move at the same depth", async () => {
  const calls: CoachSearch[] = [];
  const engine: CoachEngine = {
    analyze: async (request) => {
      calls.push(request);
      return result(
        request.searchMoves?.[0] ?? "e2e4",
        cp(request.searchMoves ? 30 : 40),
        18,
      );
    },
  };
  const advice = await analyzePosition(opening, {
    engine,
    vary: true,
    random: () => 0,
  });
  assert.notEqual(advice.bestMove, "e2e4");
  assert.equal(advice.scoreCp, 30);
  assert.equal(advice.depth, 18);
  assert.equal(calls[1].depth, calls[0].depth);
  assert.equal(advice.pv[0], advice.bestMove);
  assert.ok(advice.explanation.includes(advice.bestSan!));
});

test("variety never recommends a losing or shallower alternative", async () => {
  for (const shallow of [false, true]) {
    const engine: CoachEngine = {
      analyze: async (request) =>
        result(
          request.searchMoves?.[0] ?? "e2e4",
          cp(request.searchMoves && !shallow ? -300 : 40),
          request.searchMoves && shallow ? 10 : 18,
        ),
    };
    const advice = await analyzePosition(opening, {
      engine,
      vary: true,
      random: () => 0,
    });
    assert.equal(advice.bestMove, "e2e4");
  }
});

test("requesting another hint excludes the previously recommended alternative", async () => {
  const engine: CoachEngine = {
    analyze: async (request) =>
      result(request.searchMoves?.[0] ?? "e2e4", cp(40), 18),
  };
  const advice = await analyzePosition(opening, {
    engine,
    vary: true,
    excludeMove: "c2c4",
    random: () => 0,
  });
  assert.notEqual(advice.bestMove, "c2c4");
});

test("hint uses the engine's searched move, legal PV, depth and mate/CP score", async () => {
  const { engine, calls } = engineWith(
    result("e2e4", cp(31), 18, ["e2e4", "e7e5", "g1f3"]),
  );
  const advice = await analyzePosition(opening, { engine });
  assert.equal(advice.bestMove, "e2e4");
  assert.equal(advice.scoreCp, 31);
  assert.equal(advice.scoreMate, null);
  assert.equal(advice.depth, 18);
  assert.equal(advice.quality, "complete");
  assert.equal(calls[0].depth, 18);
  assert.equal(calls[0].movetime, 3_000);
  const game = new Chess();
  for (const move of advice.pv) playAnalysisMove(game, move);
  assert.match(advice.explanation, /e4.*d5.*merkez/);
  assert.doesNotMatch(advice.explanation, /Stockfish|derinlik|puan|0\.31/);
});

test("best and played are searched from the SAME root, mover perspective, and depth", async () => {
  const { engine, calls } = engineWith(
    result("e2e4", cp(40)),
    result("d2d4", cp(-260)),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(review.lossCp, 300);
  assert.equal(review.judgment, "blunder");
  assert.equal(review.scoreBefore, 40);
  assert.equal(review.scoreAfter, -260);
  assert.equal(review.depth, review.playedDepth);
  assert.equal(calls[0].fen, calls[1].fen);
  assert.equal(calls[0].positionCommand, calls[1].positionCommand);
  assert.equal(calls[1].depth, calls[0].depth);
  assert.deepEqual(calls[1].searchMoves, ["d2d4"]);
  assert.doesNotMatch(
    review.explanation + review.betterExplanation,
    /derinlik|puan|3\.00|0\.40|2\.60/,
  );
});

test("black's score is not inverted or treated as the room host's score", async () => {
  const game = new Chess();
  game.move("e4");
  const { engine, calls } = engineWith(
    result("e7e5", cp(20)),
    result("c7c5", cp(-190)),
  );
  const review = await analyzePlayedMove(game.fen(), "c5", {
    engine,
    moves: ["e4"],
  });
  assert.equal(review.lossCp, 210);
  assert.equal(review.judgment, "blunder");
  assert.equal(review.scoreBefore, 20);
  assert.equal(review.scoreAfter, -190);
  assert.equal(calls[0].positionCommand, "position startpos moves e2e4");
  assert.equal(calls[1].positionCommand, calls[0].positionCommand);
});

for (const [loss, expected] of [
  [25, "good"],
  [26, "inaccuracy"],
  [75, "inaccuracy"],
  [76, "mistake"],
  [175, "mistake"],
  [176, "blunder"],
] as const) {
  test(`${loss} centipawn loss is classified as ${expected}, not generic praise`, async () => {
    const { engine } = engineWith(
      result("e2e4", cp(50)),
      result("d2d4", cp(50 - loss)),
    );
    const review = await analyzePlayedMove(opening, "d4", { engine });
    assert.equal(review.judgment, expected);
    assert.equal(review.lossCp, loss);
  });
}

test("a selected best move uses one measured search and has no invented loss", async () => {
  const { engine, calls } = engineWith(result("e2e4", cp(32)));
  const review = await analyzePlayedMove(opening, "e4", { engine });
  assert.equal(calls.length, 1);
  assert.equal(review.judgment, "best");
  assert.equal(review.lossCp, 0);
  assert.equal(review.scoreBefore, review.scoreAfter);
});

test("a shallower played search reruns unrestricted best at the SAME completed depth", async () => {
  const { engine, calls } = engineWith(
    result("e2e4", cp(50), 16),
    result("d2d4", cp(-200), 14),
    result("e2e4", cp(20), 14),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(calls[2].depth, 14);
  assert.equal(calls[2].searchMoves, undefined);
  assert.equal(review.depth, 14);
  assert.equal(review.playedDepth, 14);
  assert.equal(review.quality, "limited");
  assert.equal(review.lossCp, 220);
});

test("failure to reach a comparable deep score produces unmeasured, never good", async () => {
  const { engine } = engineWith(
    result("e2e4", cp(10), 16),
    result("d2d4", cp(10), 5),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(review.judgment, "unmeasured");
  assert.equal(review.quality, "unmeasured");
  assert.equal(review.lossCp, null);
  assert.match(review.explanation, /güvenilir bir hüküm verilemiyor/);
});

test("an unscored or depth-zero best move is not labeled best or good", async () => {
  for (const response of [result("e2e4", null), result("e2e4", cp(0), 0)]) {
    const { engine } = engineWith(response);
    const review = await analyzePlayedMove(opening, "e4", { engine });
    assert.equal(review.judgment, "unmeasured");
    assert.equal(review.lossCp, null);
  }
});

test("allowing forced mate is a blunder with mate distance, not fake centipawns", async () => {
  const game = new Chess();
  game.move("f3");
  game.move("e5");
  const { engine } = engineWith(
    result("e2e4", cp(-40)),
    result("g2g4", mate(-1), 16, ["g2g4", "d8h4"]),
  );
  const review = await analyzePlayedMove(game.fen(), "g4", {
    engine,
    moves: ["f3", "e5"],
  });
  assert.equal(review.judgment, "blunder");
  assert.equal(review.scoreAfter, null);
  assert.equal(review.scoreAfterMate, -1);
  assert.equal(review.lossCp, null);
  assert.match(review.explanation, /şahı savunmasız/);
  assert.deepEqual(review.playedPv, ["g2g4", "d8h4"]);
  assert.match(review.explanation, /Qh4#.*şah mat/);
});

test("missing a forced win is measured separately from material evaluation", async () => {
  const fen = "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1";
  const { engine } = engineWith(
    result("g6g7", mate(1)),
    result("g6g5", cp(900)),
  );
  const review = await analyzePlayedMove(fen, "Qg5", { engine });
  assert.equal(review.judgment, "blunder");
  assert.equal(review.scoreBeforeMate, 1);
  assert.equal(review.scoreBefore, null);
  assert.equal(review.lossCp, null);
  assert.match(review.explanation, /zorunlu mat fırsatını kaçırıyor/);
  assert.match(review.explanation, /Qg7#.*hemen şah mat/);
  assert.match(review.betterExplanation, /şah mat/);
});

test("a slower forced mate is distinguished from throwing the win away", async () => {
  const fen = "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1";
  const { engine } = engineWith(
    result("g6g7", mate(1)),
    result("g6g5", mate(5)),
  );
  const review = await analyzePlayedMove(fen, "Qg5", { engine });
  assert.equal(review.judgment, "inaccuracy");
  assert.equal(review.lossCp, null);
  assert.match(review.explanation, /matı gereksiz yere uzatıyor/);
});

test("a discovered better played line does not become a negative CP loss", async () => {
  const { engine } = engineWith(result("e2e4", cp(20)), result("d2d4", cp(30)));
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(review.lossCp, 0);
  assert.equal(review.judgment, "good");
});

test("hanging queen explanation names the verified capture and continuation", async () => {
  const fen = "4k3/8/8/8/8/8/r7/3QK3 w - - 0 1";
  const { engine } = engineWith(
    result("d1a1", cp(400)),
    result("d1a4", cp(-480), 16, ["d1a4", "a2a4"]),
  );
  const review = await analyzePlayedMove(fen, "Qa4", { engine });
  assert.equal(review.lossCp, 880);
  assert.match(review.explanation, /Rxa4.*a4.*vezir/);
});

test("promotion survives engine output, PV, SAN and review replay", async () => {
  const fen = "8/P6k/8/8/8/8/8/7K w - - 0 1";
  const { engine } = engineWith(result("a7a8q", cp(900)));
  const review = await analyzePlayedMove(fen, "a7a8q", { engine });
  assert.equal(review.playedMove, "a7a8q");
  assert.equal(new Chess(review.afterFen).get("a8")?.type, "q");
  assert.match(review.betterExplanation, /vezir/);
});

test("review positions keep BOTH colors, absolute ply and complete UCI history", () => {
  const positions = reviewPositions(["f3", "e5", "g4", "Qh4#"]);
  assert.deepEqual(
    positions.map((p) => p.color),
    ["w", "b", "w", "b"],
  );
  assert.deepEqual(
    positions.map((p) => p.ply),
    [0, 1, 2, 3],
  );
  assert.deepEqual(positions[3].moves, ["f2f3", "e7e5", "g2g4"]);
  assert.throws(() => reviewPositions(["e4", "e4"]));
});

test("custom starting FEN and history are sent intact to the engine", async () => {
  const startFen = "4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1";
  const game = new Chess(startFen);
  game.move("exd5");
  const { engine, calls } = engineWith(result("e8f8", cp(-100), 18));
  await analyzePosition(game.fen(), { engine, startFen, moves: ["e4d5"] });
  assert.equal(calls[0].positionCommand, `position fen ${startFen} moves e4d5`);
});

test("known repeated/drawn and checkmated positions never request invented analysis", async () => {
  const { engine, calls } = engineWith();
  const moves = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];
  const game = new Chess();
  moves.forEach((move) => game.move(move));
  assert.equal(game.isThreefoldRepetition(), true);
  assert.equal(
    (await analyzePosition(game.fen(), { engine, moves })).bestMove,
    null,
  );
  assert.equal(
    (await analyzePosition("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", { engine }))
      .bestMove,
    null,
  );
  assert.equal(calls.length, 0);
});

test("invalid input, inconsistent history and illegal engine results surface errors", async () => {
  const { engine } = engineWith(result("e2e5", cp(0)));
  await assert.rejects(analyzePosition("invalid", { engine }));
  await assert.rejects(
    analyzePosition(opening, { engine, moves: ["e4"] }),
    /geçmişi/,
  );
  await assert.rejects(analyzePlayedMove(opening, "e5", { engine }));
  await assert.rejects(analyzePosition(opening, { engine }));
});

test("a shallower unrestricted search reruns the forced played move at its completed depth", async () => {
  const { engine, calls } = engineWith(
    result("e2e4", cp(50), 14),
    result("d2d4", cp(-200), 16),
    result("d2d4", cp(-180), 14),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(calls[2].depth, 14);
  assert.deepEqual(calls[2].searchMoves, ["d2d4"]);
  assert.equal(review.depth, review.playedDepth);
  assert.equal(review.lossCp, 230);
  assert.equal(review.quality, "limited");
});

test("a changing search horizon that never aligns remains unmeasured", async () => {
  const { engine } = engineWith(
    result("e2e4", cp(50), 16),
    result("d2d4", cp(50), 15),
    result("e2e4", cp(50), 14),
    result("d2d4", cp(50), 13),
    result("e2e4", cp(50), 12),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.notEqual(review.depth, review.playedDepth);
  assert.equal(review.judgment, "unmeasured");
  assert.equal(review.lossCp, null);
});

test("nonfinite engine metadata never receives a measured hint or positive verdict", async () => {
  for (const response of [
    result("e2e4", cp(Number.NaN)),
    result("e2e4", cp(0), Number.NaN),
  ]) {
    const hintEngine = engineWith(response);
    const advice = await analyzePosition(opening, {
      engine: hintEngine.engine,
    });
    assert.equal(advice.quality, "unmeasured");
    assert.ok(Number.isFinite(advice.depth));
    const reviewEngine = engineWith(response);
    const review = await analyzePlayedMove(opening, "e4", {
      engine: reviewEngine.engine,
    });
    assert.equal(review.judgment, "unmeasured");
    assert.equal(review.lossCp, null);
  }
});

test("black allowing a forced mate is judged from black's own position", async () => {
  const game = new Chess();
  game.move("e4");
  const { engine, calls } = engineWith(
    result("e7e5", cp(-30)),
    result("f7f6", mate(-3), 16, ["f7f6", "d1h5"]),
  );
  const review = await analyzePlayedMove(game.fen(), "f6", {
    engine,
    moves: ["e4"],
  });
  assert.equal(review.judgment, "blunder");
  assert.equal(review.scoreBefore, -30);
  assert.equal(review.scoreAfterMate, -3);
  assert.equal(review.scoreAfter, null);
  assert.equal(review.lossCp, null);
  assert.match(review.explanation, /rakibe zorunlu mat yolu/);
  assert.match(review.explanation, /Qh5\+.*mat saldırısını/);
  assert.equal(calls[1].positionCommand, "position startpos moves e2e4");
});

test("already lost mates distinguish faster defeat from losing a non-mated position", async () => {
  const { engine } = engineWith(
    result("e2e4", mate(-6)),
    result("d2d4", mate(-2)),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(review.judgment, "mistake");
  assert.equal(review.lossCp, null);
  assert.match(review.explanation, /zaten mat ağı.*daha erken mat/);
});

test("a best move discovered during horizon alignment receives one consistent result", async () => {
  const { engine } = engineWith(
    result("e2e4", cp(50), 16),
    result("d2d4", cp(30), 14),
    result("d2d4", cp(40), 14),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(review.bestMove, "d2d4");
  assert.equal(review.judgment, "best");
  assert.equal(review.lossCp, 0);
  assert.equal(review.scoreBefore, review.scoreAfter);
  assert.equal(review.depth, review.playedDepth);
});

test("engine failures surface errors without reverting to a weak local evaluator", async () => {
  const engine: CoachEngine = {
    analyze: async () => {
      throw new Error("Stockfish unavailable");
    },
  };
  await assert.rejects(
    analyzePosition(opening, { engine }),
    /Stockfish unavailable/,
  );
  await assert.rejects(
    analyzePlayedMove(opening, "e4", { engine }),
    /Stockfish unavailable/,
  );
});

test("short explanations name the queen blunder and retain both legal continuation branches", async () => {
  const game = new Chess();
  ["e4", "e5", "Nf3"].forEach((move) => game.move(move));
  const { engine } = engineWith(
    result("b8c6", cp(-39), 16, ["b8c6", "f1b5"]),
    result("d8h4", cp(-644), 16, ["d8h4", "f3h4", "d7d5"]),
  );
  const review = await analyzePlayedMove(game.fen(), "Qh4", { engine });
  assert.equal(review.judgment, "blunder");
  assert.equal(review.lossCp, 605);
  assert.match(review.explanation, /Qh4.*vezir.*saldırısına/);
  assert.match(review.explanation, /Nxh4.*h4.*vezir/);
  assert.match(review.betterExplanation, /Nc6.*atı? taşını geliştiriyor/);
  assert.deepEqual(review.playedPv, ["d8h4", "f3h4", "d7d5"]);
  assert.deepEqual(review.pv, ["b8c6", "f1b5"]);
  for (const explanation of [review.explanation, review.betterExplanation]) {
    assert.ok(explanation.length < 230, explanation);
    assert.doesNotMatch(
      explanation,
      /Stockfish|derinlik|puan|centipawn|\d[,.]\d/,
    );
  }
});

test("unmeasured guidance stays short and never displays search internals", async () => {
  const { engine } = engineWith(
    result("e2e4", cp(10), 16),
    result("d2d4", cp(10), 5),
  );
  const review = await analyzePlayedMove(opening, "d4", { engine });
  assert.equal(review.judgment, "unmeasured");
  assert.match(review.explanation, /iyi veya kötü diye etiketlemiyorum/);
  assert.doesNotMatch(
    review.explanation + review.betterExplanation,
    /Stockfish|derinlik|puan|katman|16|5/,
  );
});

test("best-move and hint explanations teach the idea without score and depth text", async () => {
  const { engine } = engineWith(result("g1f3", cp(30), 18, ["g1f3", "d7d5"]));
  const review = await analyzePlayedMove(opening, "Nf3", { engine });
  assert.equal(review.judgment, "best");
  assert.match(review.explanation, /en iyi seçenek/);
  assert.match(review.betterExplanation, /geliştiriyor.*merkez/);
  assert.doesNotMatch(
    review.explanation + review.betterExplanation,
    /Stockfish|derinlik|puan|0\.30/,
  );
});
