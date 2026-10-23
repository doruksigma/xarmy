/* Exercise real Stockfish workers and two local HTTP room clients against a
   production build. Set CHESS_BASE_URL, CHESS_CHROMIUM, CHESS_ARTIFACT_DIR. */
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const base = process.env.CHESS_BASE_URL || "http://localhost:3000";
const output = process.env.CHESS_ARTIFACT_DIR || "/tmp/xarmy-chess-browser";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Room audit creates local test games; use a local server.",
);
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHESS_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const checks = [],
    errors = [],
    workers = [];
  let page;
  const passed = (check) => {
    checks.push(check);
    console.log(JSON.stringify({ passed: check }));
  };
  const makePage = async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    });
    const result = await context.newPage();
    result.on("pageerror", (error) => errors.push(error.message));
    result.on("worker", (worker) => workers.push(worker.url()));
    await result.goto(`${base}/games/chess`);
    await result
      .getByRole("button", { name: "♟ Botla oyna", exact: true })
      .waitFor();
    return result;
  };
  const move = async (target, from, to) => {
    await target
      .getByTestId("game-status")
      .filter({ hasText: "Sıra sende" })
      .waitFor();
    await target.locator(`[data-square="${from}"]`).click();
    await target.locator(`[data-square="${to}"]`).click();
  };
  const resign = async (target) => {
    await target
      .getByRole("button", { name: "Oyunu terk et", exact: true })
      .click();
    await target
      .getByRole("button", { name: "Evet, çık", exact: true })
      .click();
  };
  const exitReview = async (target) => {
    await target
      .getByRole("button", { name: "Analizden çık", exact: true })
      .click();
    await target.getByRole("button", { name: "Oyuna başla" }).waitFor();
    assert.equal(await target.getByTestId("chess-review-panel").count(), 0);
  };
  try {
    page = await makePage();
    assert.deepEqual(
      await page.getByLabel("Bot seviyesi").locator("option").allTextContents(),
      ["Güçlü", "Orta", "Kötü"],
    );
    await page.getByLabel("Bot seviyesi").selectOption("easy");
    await page.getByRole("button", { name: "Oyuna başla" }).click();
    await move(page, "e2", "e4");
    await page
      .getByTestId("game-status")
      .filter({ hasText: "Sıra sende" })
      .waitFor({ timeout: 30000 });
    await page
      .getByTestId("move-history")
      .getByRole("cell", { name: "e4", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByTestId("move-history")
        .getByRole("cell", { name: "—", exact: true })
        .count(),
      0,
    );
    assert.equal(await page.getByTestId("chess-review-panel").count(), 0);
    passed(
      "three difficulty choices; legal player move and real easy Stockfish reply; no in-game postmatch review",
    );

    await resign(page);
    await page.getByTestId("chess-review-panel").waitFor();
    await page
      .getByText("Analiz tamamlandı", { exact: true })
      .waitFor({ timeout: 90000 });
    await page.getByTestId("review-explanation").waitFor();
    assert.ok(
      (await page.getByTestId("review-explanation").textContent()).length > 15,
    );
    assert.doesNotMatch(
      await page.getByTestId("review-explanation").textContent(),
      /centipawn|derinlik|\bcp\b/i,
    );
    await page
      .getByRole("button", { name: "Başlangıç konumuna dön", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sonraki hamleyi incele", exact: true })
      .click();
    await page.getByRole("button", { name: "Siyah", exact: true }).click();
    await page
      .getByText("Siyah · Rakibinin hamleleri", { exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(output, "review-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await exitReview(page);
    passed(
      "resignation, real postgame explanations, both review colors, replay navigation, mobile fit and clean analysis exit",
    );

    for (const level of ["medium", "hard"]) {
      await page.getByLabel("Bot seviyesi").selectOption(level);
      await page.getByRole("button", { name: "♚ Siyah", exact: true }).click();
      await page.getByRole("button", { name: "Oyuna başla" }).click();
      await page
        .getByTestId("game-status")
        .filter({ hasText: "Sıra sende" })
        .waitFor({ timeout: 35000 });
      assert.equal(
        await page.getByTestId("move-history").getByRole("row").count(),
        2,
      );
      await resign(page);
      await exitReview(page);
    }
    passed(
      "medium and hard native workers return legal opening moves; new games reset the previous review",
    );

    await page
      .getByRole("button", { name: "✦ Yapay zekâ eğitmeni", exact: true })
      .click();
    assert.equal(await page.getByLabel("Bot seviyesi").count(), 0);
    await page.getByRole("button", { name: "♔ Beyaz", exact: true }).click();
    await page.getByRole("button", { name: "Oyuna başla" }).click();
    await page.getByTestId("trainer-best-move").waitFor({ timeout: 35000 });
    assert.ok(
      (await page.getByTestId("trainer-explanation").textContent()).length > 15,
    );
    await page
      .getByRole("button", { name: "Başka iyi hamle göster", exact: true })
      .click();
    await page.getByTestId("trainer-best-move").waitFor({ timeout: 45000 });
    await page
      .getByRole("button", { name: "Önerilen hamleyi oyna", exact: true })
      .click();
    await page
      .getByTestId("game-status")
      .filter({ hasText: "Sıra sende" })
      .waitFor({ timeout: 35000 });
    await resign(page);
    await exitReview(page);
    passed(
      "trainer has no weak-bot selector; measured explanation, alternate suggestion and play-suggestion actions work",
    );

    await page
      .getByRole("button", { name: "♚ Arkadaşınla oyna", exact: true })
      .click();
    await page
      .getByRole("button", { name: "+ Oda oluştur", exact: true })
      .click();
    await page
      .getByTestId("color-draw")
      .filter({ hasText: "katılınca" })
      .waitFor();
    const code = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("xarmy-chess-room")).code,
    );
    assert.match(code, /^\d{6}$/);
    const guest = await makePage();
    await guest
      .getByRole("button", { name: "♚ Arkadaşınla oyna", exact: true })
      .click();
    await guest.getByLabel("Arkadaşının oda numarası").fill(code);
    await guest
      .getByRole("button", { name: "Odaya katıl →", exact: true })
      .click();
    await page
      .getByTestId("color-draw")
      .filter({ hasText: "Kura sonucu" })
      .waitFor();
    await guest
      .getByTestId("color-draw")
      .filter({ hasText: "Kura sonucu" })
      .waitFor();
    const hostWhite =
      (await page.getByTestId("color-draw").locator("strong").textContent()) ===
      "Beyaz";
    assert.equal(
      await guest.getByTestId("color-draw").locator("strong").textContent(),
      hostWhite ? "Siyah" : "Beyaz",
    );
    const third = await guest.request.post(`${base}/api/chess/rooms/join`, {
      data: { code },
    });
    assert.equal(third.status(), 409);
    const drawBefore = await page.getByTestId("color-draw").textContent();
    await page.reload();
    await page
      .getByTestId("color-draw")
      .filter({ hasText: "Kura sonucu" })
      .waitFor();
    assert.equal(
      await page.getByTestId("color-draw").textContent(),
      drawBefore,
    );
    passed(
      "two independent clients create/join a room, receive opposite dice colors, reject a third player and restore the session",
    );

    const white = hostWhite ? page : guest,
      black = hostWhite ? guest : page;
    for (const [target, from, to] of [
      [white, "f2", "f3"],
      [black, "e7", "e5"],
      [white, "g2", "g4"],
      [black, "d8", "h4"],
    ])
      await move(target, from, to);
    await page.getByTestId("chess-review-panel").waitFor();
    await guest.getByTestId("chess-review-panel").waitFor();
    await white
      .getByText(
        "Sen beyaz taşlarla oynadın. İki tarafın hamlelerini de inceleyebilirsin.",
        { exact: true },
      )
      .waitFor();
    await black
      .getByText(
        "Sen siyah taşlarla oynadın. İki tarafın hamlelerini de inceleyebilirsin.",
        { exact: true },
      )
      .waitFor();
    assert.match(
      await white.getByTestId("game-status").textContent(),
      /Siyah kazandı.*Şah mat/,
    );
    assert.match(
      await black.getByTestId("game-status").textContent(),
      /Siyah kazandı.*Şah mat/,
    );
    await page
      .getByRole("button", { name: "Analizden çık", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Analizden çık", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("xarmy-chess-room")),
      null,
    );
    assert.equal(
      await guest.evaluate(() => sessionStorage.getItem("xarmy-chess-room")),
      null,
    );
    passed(
      "online moves synchronize; checkmate and reviews reach both colors; exiting clears both local sessions",
    );

    await page
      .getByRole("button", { name: "+ Oda oluştur", exact: true })
      .click();
    await page
      .getByTestId("color-draw")
      .filter({ hasText: "katılınca" })
      .waitFor();
    const cancelled = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("xarmy-chess-room")).code,
    );
    await page.getByRole("button", { name: "Odadan çık", exact: true }).click();
    await page.getByRole("button", { name: "Evet, çık", exact: true }).click();
    const rejected = await guest.request.post(`${base}/api/chess/rooms/join`, {
      data: { code: cancelled },
    });
    assert.equal(rejected.status(), 409);
    passed("cancelling a waiting room prevents later joins");
    assert.deepEqual(errors, []);
    assert.ok(
      workers.some((url) => url.endsWith("/stockfish/engine/stockfish.js")),
    );
    const result = {
      result: "passed",
      checks,
      pageErrors: errors,
      artifacts: output,
    };
    writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    if (page && !page.isClosed())
      await page
        .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
