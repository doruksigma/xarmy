/* Production browser regression for real simulation workers and offline reloads.
   Run after npm run build && npm start. Playwright must be on NODE_PATH.
   Only the worker's outgoing results are held to exercise races; application
   state changes and save/load operations all use the public interface. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-worker-browser";
const saveKey = "xarmy-europa-1936-v1:slot-1";
const readyText = "Çevrimdışı kullanıma hazır · bu cihaz";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let page;
  const errors = [];
  const checks = [];
  const networkFailures = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    context.on("requestfailed", (request) => networkFailures.push({
      url: request.url(),
      type: request.resourceType(),
      error: request.failure()?.errorText,
    }));
    let workers = [];
    const attach = (nextPage) => {
      page = nextPage;
      page.on("worker", (worker) => workers.push(worker));
      page.on("pageerror", (error) => {
        if (!error.message.includes("EUROPA_WORKER_TEST_FAILURE"))
          errors.push(error.message);
      });
    };
    const passed = (check) => {
      checks.push(check);
      console.log(JSON.stringify({ passed: check }));
    };
    const waitUntil = async (predicate, description, timeout = 15000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out: ${description}`);
    };
    const start = () =>
      page.getByRole("button", { name: "Zamanı başlat", exact: true }).click();
    const pause = () =>
      page
        .getByRole("button", { name: "Zamanı duraklat", exact: true })
        .click();
    const date = () => page.locator('[data-testid="game-date"]').textContent();
    const waitForDateChange = (previous) =>
      page.waitForFunction(
        (value) =>
          document.querySelector('[data-testid="game-date"]')?.textContent !==
          value,
        previous,
        { timeout: 15000 },
      );
    const save = async () => {
      await page.locator('button[title="Kayıtlar"]').click();
      await page
        .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
        .first()
        .click();
      return page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        saveKey,
      );
    };
    const restore = async (snapshot) => {
      await page.locator('button[title="Kayıtlar"]').click();
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: "worker-race.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(snapshot)),
      });
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
    };
    const holdResults = async (worker) => {
      await worker.evaluate(() => {
        if (!self.__europaTestGate) {
          const send = self.postMessage.bind(self);
          const gate = { enabled: false, held: [], requests: 0, send };
          self.__europaTestGate = gate;
          self.addEventListener("message", ({ data }) => {
            if (data?.type === "advance") gate.requests++;
          });
          self.postMessage = (message, ...rest) => {
            if (gate.enabled && message?.type === "result")
              gate.held.push(message);
            else send(message, ...rest);
          };
        }
        self.__europaTestGate.enabled = true;
      });
    };
    const waitForHeldResult = async (worker) => {
      await waitUntil(
        () => worker.evaluate(() => self.__europaTestGate.held.length === 1),
        "the actual worker must compute and hold one day",
      );
    };
    const releaseResults = (worker) =>
      worker.evaluate(() => {
        const gate = self.__europaTestGate;
        gate.enabled = false;
        for (const result of gate.held.splice(0)) gate.send(result);
      });

    attach(await context.newPage());
    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await waitUntil(
      () => workers.length > 0,
      "a dedicated simulation worker must launch",
    );
    let worker = workers.at(-1);
    assert.equal(
      new URL(worker.url()).pathname,
      "/games/europa-war/simulation-worker.js",
      "The worker entry must remain inside the game's service-worker scope",
    );
    const initial = await save();
    const initialDate = await date();
    await start();
    await waitForDateChange(initialDate);
    await pause();
    assert.ok((await save()).world.day > initial.world.day);
    passed("real dedicated worker launches and advances the campaign");

    await holdResults(worker);
    await start();
    await waitForHeldResult(worker);
    const requestCount = await worker.evaluate(
      () => self.__europaTestGate.requests,
    );
    await page.waitForTimeout(450);
    assert.equal(
      await worker.evaluate(() => self.__europaTestGate.requests),
      requestCount,
    );
    await pause();
    const paused = await save();
    await releaseResults(worker);
    await page.waitForTimeout(450);
    assert.deepEqual((await save()).world, paused.world);
    passed("only one day is in flight and pause rejects its late result");

    await restore(initial);
    await holdResults(worker);
    await start();
    await waitForHeldResult(worker);
    await page.locator('button[title="Komuta"]').click();
    await page
      .getByLabel("Oyun zorluğu", { exact: true })
      .selectOption("normal");
    const commandDate = await date();
    // Remain running: pausing here would mask a lost-command race.
    await releaseResults(worker);
    await waitForDateChange(commandDate);
    await pause();
    assert.equal((await save()).world.difficulty, "normal");
    passed("an action during an in-flight day survives the stale worker reply");

    await holdResults(worker);
    await start();
    await waitForHeldResult(worker);
    const replacement = structuredClone(initial);
    replacement.world.day = 73;
    replacement.world.player = "germany";
    replacement.world.difficulty = "hard";
    await restore(replacement);
    const restored = await save();
    assert.equal(restored.world.day, 73);
    assert.equal(restored.world.player, "germany");
    await releaseResults(worker);
    await page.waitForTimeout(450);
    assert.deepEqual((await save()).world, restored.world);
    passed("loading another campaign rejects the previous campaign's late day");

    await holdResults(worker);
    await start();
    await waitForHeldResult(worker);
    await page.locator('button[title="Yeni sefer"]').click();
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    const reset = await save();
    assert.equal(reset.world.day, 0);
    await releaseResults(worker);
    await page.waitForTimeout(450);
    assert.deepEqual((await save()).world, reset.world);
    passed("starting a new campaign rejects the previous campaign's late day");

    await holdResults(worker);
    await start();
    await waitForHeldResult(worker);
    const beforeFailure = await save();
    await worker.evaluate(() => {
      setTimeout(() => {
        throw new Error("EUROPA_WORKER_TEST_FAILURE");
      }, 0);
    });
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .waitFor();
    await page
      .getByText(
        /Simülasyon çalıştırılamadı\. Zaman duraklatıldı; mevcut sefer korunuyor\./,
      )
      .waitFor();
    assert.deepEqual((await save()).world, beforeFailure.world);
    const workerCount = workers.length;
    const failureDate = await date();
    await start();
    await waitUntil(
      () => workers.length > workerCount,
      "retry must launch a replacement worker",
    );
    worker = workers.at(-1);
    await waitForDateChange(failureDate);
    await pause();
    const saved = await save();
    assert.ok(saved.world.day > beforeFailure.world.day);
    passed(
      "worker failure pauses without changing the saved world and retry recovers",
    );

    await page
      .getByText(readyText, { exact: true })
      .waitFor({ timeout: 60000 });
    const workerAssets = await worker.evaluate(() => {
      const location = new URL(self.location.href);
      const entry = location.searchParams.get("entry");
      return [...new Set([
        location.href,
        ...(entry ? [new URL(entry, location).href] : []),
        ...performance.getEntriesByType("resource").map((resource) => resource.name),
      ])];
    });
    const terrainUrl = await page
      .locator('[data-testid="terrain-overlay"]')
      .getAttribute("href");
    assert.ok(terrainUrl, "The map must use its local terrain image");
    const assets = [...workerAssets, new URL(terrainUrl, base).href];
    const cached = await page.evaluate(async (urls) => {
      return Promise.all(
        urls.map(async (url) => {
          const response = await caches.match(url);
          return { url, ok: response?.ok || false };
        }),
      );
    }, assets);
    assert.ok(
      cached.every((asset) => asset.ok),
      JSON.stringify(cached),
    );
    passed(
      "offline-ready includes the worker entry, imported chunks, and terrain image",
    );

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.clearBrowserCache");
    await context.setOffline(true);
    await page.close();
    workers = [];
    attach(await context.newPage());
    const offlineCdp = await context.newCDPSession(page);
    await offlineCdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Kayıtlı sefere devam et", { exact: true }).click();
    const label = `${saved.world.countries[saved.world.player].name} · ${saved.world.day}. gün`;
    await page
      .getByRole("button", { name: `${label} →`, exact: true })
      .first()
      .click();
    await waitUntil(
      () => workers.length > 0,
      "a fresh dedicated worker must launch offline",
    );
    const offlineDate = await date();
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await start();
    await waitForDateChange(offlineDate);
    await pause();
    const offline = await save();
    assert.ok(offline.world.day > saved.world.day);
    assert.equal(offline.world.player, saved.world.player);
    const bitmap = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const bitmap = await createImageBitmap(await response.blob());
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, terrainUrl);
    assert.ok(bitmap.width >= 1320 && bitmap.height >= 880);
    await page.screenshot({ path: path.join(output, "offline-worker.png") });
    passed(
      "fresh offline page loads its worker and terrain and continues the saved campaign",
    );
    assert.deepEqual(errors, []);
    const result = {
      result: "passed",
      checks,
      workerAssets,
      terrainUrl,
      terrainSize: bitmap,
      pageErrors: errors,
      artifacts: output,
    };
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    fs.writeFileSync(path.join(output, "failure.json"), JSON.stringify({
      error: error.message,
      checks,
      pageErrors: errors,
      networkFailures,
    }, null, 2));
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
