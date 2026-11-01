/* Verify the requested 0.5/1/2-second budgets with the actual production bot
   worker and Stockfish WASM. Initial download is deliberately excluded from
   search timing via the real worker's thinking status. No engine mocks.
   Set CHESS_BASE_URL, CHESS_CHROMIUM, CHESS_ARTIFACT_DIR if needed. */
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");

const base = process.env.CHESS_BASE_URL || "http://localhost:3000";
const output = process.env.CHESS_ARTIFACT_DIR || "/tmp/xarmy-chess-timing";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHESS_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [];
  const workerUrls = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("worker", (worker) => workerUrls.push(worker.url()));
    await page.goto(`${base}/games/chess`);
    await page.getByLabel("Bot seviyesi").selectOption("easy");
    await page.getByRole("button", { name: "♚ Siyah", exact: true }).click();
    await page
      .getByRole("button", { name: "Oyuna başla", exact: true })
      .click();
    await page
      .getByTestId("game-status")
      .filter({ hasText: "Sıra sende" })
      .waitFor({ timeout: 60000 });
    const workerUrl = workerUrls.find((url) =>
      url.includes("/_next/static/chunks/"),
    );
    assert.ok(workerUrl, "UI must load the actual compiled bot worker");
    const results = await page.evaluate(
      async ({ workerUrl, fen }) => {
        // Next's production bundle is a classic worker using importScripts
        // internally, even though the source entry is an ES module.
        const worker = new Worker(workerUrl);
        const measurements = [];
        try {
          for (const [difficulty, expectedMs] of [
            ["easy", 500],
            ["medium", 1000],
            ["hard", 2000],
          ]) {
            const requestId = measurements.length + 100;
            const result = await new Promise((resolve, reject) => {
              let thinkingAt;
              const timeout = setTimeout(
                () => reject(new Error(`${difficulty}: no result`)),
                30000,
              );
              worker.onerror = (event) => {
                clearTimeout(timeout);
                reject(new Error(event.message));
              };
              worker.onmessage = ({ data }) => {
                if (data.requestId !== requestId) return;
                if (data.kind === "status") {
                  if (data.stage === "thinking") thinkingAt = performance.now();
                  return;
                }
                clearTimeout(timeout);
                if (data.error || !data.move || thinkingAt === undefined) {
                  reject(
                    new Error(
                      data.error || "Missing real search status or move",
                    ),
                  );
                  return;
                }
                resolve({
                  difficulty,
                  expectedMs,
                  elapsedMs: performance.now() - thinkingAt,
                  move: data.move,
                  depth: data.depth,
                });
              };
              worker.postMessage({
                requestId,
                difficulty,
                fen,
                positionCommand: "position startpos",
              });
            });
            measurements.push(result);
          }
        } finally {
          worker.terminate();
        }
        return measurements;
      },
      { workerUrl, fen: new Chess().fen() },
    );
    for (const result of results) {
      const board = new Chess();
      assert.ok(
        board.move({
          from: result.move.slice(0, 2),
          to: result.move.slice(2, 4),
          promotion: result.move[4],
        }),
      );
      // Scheduling and WASM overhead vary by host. These bounds catch the old
      // depth-only quick returns and the former hard preset's eight seconds.
      assert.ok(
        result.elapsedMs >= result.expectedMs * 0.6,
        `${result.difficulty} returned too soon: ${result.elapsedMs}ms`,
      );
      assert.ok(
        result.elapsedMs <= result.expectedMs + 3000,
        `${result.difficulty} exceeded its search budget: ${result.elapsedMs}ms`,
      );
    }
    assert.deepEqual(errors, []);
    writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ passed: true, results, errors }, null, 2),
    );
    console.log(JSON.stringify({ passed: true, results, errors }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
