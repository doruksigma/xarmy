import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { POST as coach } from "./route";
import { POST as analyze } from "../lichess-analyze/route";

const payload = {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moveUci: "e2e4",
  score: 0.2,
  playerColor: "w",
};
function request() {
  return new Request("http://localhost/api/chess-coach", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
function providers(t: TestContext, lichess: unknown, gemini?: unknown) {
  for (const key of ["LICHESS_TOKEN", "GEMINI_API_KEY"]) {
    const previous = process.env[key];
    process.env[key] = "test-only-key";
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    calls++;
    const url = String(input);
    assert.ok(
      url.startsWith("https://lichess.org/") ||
        url.startsWith("https://generativelanguage.googleapis.com/"),
    );
    return Response.json(
      url.startsWith("https://lichess.org/") ? lichess : gemini,
    );
  });
  return () => calls;
}

test("Lichess response fields are read only when their types match", async (t) => {
  providers(t, { pvs: [{ cp: 30, mate: "3", moves: "e2e4 e7e5" }] });
  const response = await analyze(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.evalCp, 30);
  assert.equal(result.mate, null);
  assert.equal(result.bestMove, "e2e4");
  assert.deepEqual(result.raw, {
    pvs: [{ cp: 30, mate: "3", moves: "e2e4 e7e5" }],
  });
});

test("Malformed Lichess response shapes safely produce missing evaluation", async (t) => {
  for (const data of [
    null,
    [],
    { pvs: "wrong" },
    { pvs: [null] },
    { pvs: [{ cp: {}, mate: [], moves: 4 }] },
  ]) {
    await t.test(JSON.stringify(data), async (child) => {
      providers(child, data);
      const response = await analyze(request());
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.evalCp, null);
      assert.equal(result.mate, null);
      assert.equal(result.bestMove, null);
    });
  }
});

test("Coach joins text parts without rendering malformed provider objects", async (t) => {
  const calls = providers(
    t,
    { pvs: [{ cp: 150, moves: "d2d4" }] },
    {
      candidates: [
        {
          content: {
            parts: [
              { text: "Merkezi " },
              null,
              { text: {} },
              { text: "kontrol et." },
            ],
          },
        },
      ],
    },
  );
  const response = await coach(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.reason, "Merkezi kontrol et.");
  assert.equal(result.meta.lichessBestMove, "d2d4");
  assert.equal(calls(), 2);
});

test("Coach missing text keeps the existing explanation fallback", async (t) => {
  for (const data of [
    null,
    {},
    { candidates: [null] },
    { candidates: [{ content: { parts: "wrong" } }] },
  ]) {
    await t.test(JSON.stringify(data), async (child) => {
      providers(child, null, data);
      const response = await coach(request());
      assert.equal(response.status, 200);
      assert.equal((await response.json()).reason, "Açıklama üretilemedi.");
    });
  }
});

test("Both routes handle unknown thrown values without unsafe property access", async (t) => {
  providers(t, null, null);
  for (const error of [
    new Error("Provider unavailable"),
    null,
    "plain failure",
  ]) {
    t.mock.method(globalThis, "fetch", async () => {
      throw error;
    });
    const analyzed = await analyze(request());
    const coached = await coach(request());
    assert.equal(analyzed.status, 500);
    assert.equal(coached.status, 500);
    assert.equal(
      (await analyzed.json()).error,
      error instanceof Error ? error.message : "unknown error",
    );
    assert.equal(
      (await coached.json()).reason,
      `Sunucu hatası: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
});
