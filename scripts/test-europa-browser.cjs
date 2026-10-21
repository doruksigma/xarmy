/* Integration checks against a running production server (npm run build && npm start).
   Requires Playwright in Node's module path and an installed Chromium executable. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const map = require("../app/games/europa-war/strategy/map-data.json");
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-browser";
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    await page.screenshot({ path: path.join(output, "scenario.png") });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await page
      .getByText("Çevrimdışı kullanıma hazır · bu cihaz", { exact: true })
      .waitFor({ timeout: 45000 });
    assert.equal(
      await page.locator('[data-testid="game-date"]').textContent(),
      "1 Ocak 1936",
    );
    await page.locator('button[title="Araştırma"]').click();
    await page
      .getByRole("button", { name: "Araştır · 70 temel gün" })
      .first()
      .click();
    await page.locator('button[title="Siyaset"]').click();
    await page
      .getByRole("button", { name: "Odağı seç · 56 gün" })
      .first()
      .click();
    await page.locator('button[title="Ordu"]').click();
    await page
      .getByRole("button", { name: "Tüm tümenler için savunma hattı çiz" })
      .click();
    for (const id of ["turkey-0", "turkey-4"]) {
      const region = map.provinces.find((p) => p.id === id);
      const point = await page
        .locator('[data-testid="war-map"]')
        .evaluate((el, p) => {
          const screen = new DOMPoint(p.x, p.y - 15).matrixTransform(
            el.getScreenCTM(),
          );
          return { x: screen.x, y: screen.y };
        }, region);
      await page.mouse.click(point.x, point.y);
    }
    await page.getByRole("button", { name: "Hattı kaydet ve dağıt" }).click();
    await page.getByRole("button", { name: "5 kat hız" }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="game-date"]').textContent !==
        "1 Ocak 1936",
    );
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    await page.locator('button[title="Kayıtlar"]').click();
    await page
      .getByRole("button", { name: "Bu yuvaya kaydet" })
      .first()
      .click();
    const state = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1")).world,
    );
    assert.equal(state.fronts.length, 1);
    assert.equal(state.fronts[0].provinces.length, 2);
    assert.equal(state.countries.turkey.research.length, 1);
    assert.ok(state.countries.turkey.focus);
    await page
      .getByRole("button", { name: "Yükle", exact: true })
      .first()
      .click();
    await page.screenshot({ path: path.join(output, "campaign.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, "mobile-panel.png") });
    await page.getByRole("button", { name: "Yönetim panelini kapat" }).click();
    await page.screenshot({ path: path.join(output, "mobile-map.png") });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const svg = page.locator('[data-testid="war-map"]'),
      box = await svg.boundingBox();
    const before = await svg.getAttribute("viewBox");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.mouse.wheel(0, -150);
    await page.waitForFunction(
      (old) =>
        document
          .querySelector('[data-testid="war-map"]')
          .getAttribute("viewBox") !== old,
      before,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    await page.getByText("Kayıtlı sefere devam et", { exact: true }).click();
    await page
      .getByRole("button", { name: /Türkiye · \d+\. gün/ })
      .first()
      .click();
    const restoredDate = await page
      .locator('[data-testid="game-date"]')
      .textContent();
    assert.notEqual(restoredDate, "1 Ocak 1936");
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      (old) =>
        document.querySelector('[data-testid="game-date"]').textContent !== old,
      restoredDate,
    );
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    await page.screenshot({ path: path.join(output, "offline.png") });
    assert.deepEqual(errors, []);
    assert.ok(
      !requests.some((url) =>
        /upstash|lichess|api\/.*europa|tiles\.|openstreetmap/i.test(url),
      ),
    );
    console.log(
      JSON.stringify({
        result: "passed",
        checks: [
          "country selection",
          "research",
          "national focus",
          "draw and assign front",
          "daily clock",
          "manual save/load",
          "mobile panel close",
          "map zoom",
          "offline reload and continued simulation",
        ],
        pageErrors: errors,
        screenshots: output,
      }),
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
