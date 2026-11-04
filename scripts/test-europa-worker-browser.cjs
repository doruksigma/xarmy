/* Production browser regression for real simulation workers and offline reloads.
   Run after npm run build && npm start. Playwright must be on NODE_PATH.
   Only the worker's outgoing results are held to exercise races; application
   state changes and save/load operations all use the public interface. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-worker-browser";
const tick = (world) => world.day * 24 + (world.hour ?? 0);
const saveKey = "xarmy-europa-1936-v1:slot-1";
const readyText = "Çevrimdışı kullanıma hazır · bu cihaz";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const root = path.resolve(__dirname, "..");
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".europa-worker-browser-"),
  );
  let browser, page;
  const errors = [];
  const checks = [];
  const networkFailures = [];
  const transfers = [];
  let mobilePan, threeDSmoke;
  try {
    // Compare the browser's actual accepted world with the production rules,
    // including movement, midnight settlement, RNG and checkpoint fingerprints.
    execFileSync(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc"),
        "--outDir",
        compiled,
        "--rootDir",
        root,
        "--module",
        "commonjs",
        "--target",
        "ES2022",
        "--moduleResolution",
        "node",
        "--resolveJsonModule",
        "--esModuleInterop",
        "--skipLibCheck",
        "--strict",
        "app/games/europa-war/strategy/engine.ts",
        "app/games/europa-war/strategy/storage.ts",
        "app/games/europa-war/strategy/world-digest.ts",
      ],
      { cwd: root, stdio: "pipe" },
    );
    const strategy = path.join(compiled, "app/games/europa-war/strategy");
    const engine = require(path.join(strategy, "engine.js"));
    const storage = require(path.join(strategy, "storage.js"));
    const { GEOGRAPHY } = require(path.join(strategy, "world.js"));
    const { fingerprintWorld } = require(
      path.join(strategy, "world-digest.js"),
    );
    const simulateTo = (world, targetTick) => {
      let next = world;
      assert.ok(targetTick >= tick(world) && targetTick - tick(world) < 240);
      while (tick(next) < targetTick)
        next = engine.advanceHours(next, Math.min(24, targetTick - tick(next)));
      return next;
    };
    browser = await chromium.launch({
      executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-rasterization",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    // Most races use the SVG map; one bounded 3D check covers accepted deltas
    // reaching the real renderer. Detailed models have a separate visual suite.
    await context.addInitScript(() => {
      localStorage.setItem("xarmy-europa-map-view-v1", "2d");
      localStorage.setItem("xarmy-europa-3d-quality-v1", "low");
      localStorage.setItem("xarmy-europa-3d-motion-v1", "reduced");
    });
    context.on("requestfailed", (request) =>
      networkFailures.push({
        url: request.url(),
        type: request.resourceType(),
        error: request.failure()?.errorText,
      }),
    );
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
    const observeResults = async (worker) => {
      await worker.evaluate(() => {
        if (!self.__europaTestGate) {
          const send = self.postMessage.bind(self);
          const gate = {
            enabled: false,
            held: [],
            requests: 0,
            observed: [],
            send,
          };
          self.__europaTestGate = gate;
          self.addEventListener("message", ({ data }) => {
            if (data?.type === "advance") gate.requests++;
          });
          self.postMessage = (message, ...rest) => {
            if (message?.type === "result") {
              gate.observed.push({
                protocol: message.protocol,
                baseTick: message.baseTick,
                nextTick: message.nextTick,
                kind: message.state?.kind,
                metrics: message.metrics,
                jsonEquivalentBytes: new TextEncoder().encode(
                  JSON.stringify(message.state),
                ).byteLength,
                summary: message.summary,
              });
              if (gate.observed.length > 512) gate.observed.shift();
            }
            if (gate.enabled && message?.type === "result")
              gate.held.push(message);
            else send(message, ...rest);
          };
        }
      });
    };
    const holdResults = async (worker) => {
      await observeResults(worker);
      await worker.evaluate(() => {
        self.__europaTestGate.enabled = true;
      });
    };
    const waitForHeldResult = async (worker) => {
      await waitUntil(
        () => worker.evaluate(() => self.__europaTestGate.held.length === 1),
        "the actual worker must compute and hold one hour",
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
    await observeResults(worker);
    const initialDate = await date();
    await start();
    await waitForDateChange(initialDate);
    await pause();
    const firstAdvanced = await save();
    assert.ok(tick(firstAdvanced.world) > tick(initial.world));
    assert.deepEqual(
      firstAdvanced.world,
      simulateTo(initial.world, tick(firstAdvanced.world)),
    );
    passed("real dedicated worker launches and advances the campaign");

    const movement = structuredClone(initial);
    movement.world.hour = 22;
    const moving = movement.world.armies.find(
      (army) =>
        army.country === movement.world.player &&
        GEOGRAPHY[army.province].neighbors.some(
          (edge) =>
            !edge.sea &&
            movement.world.provinces[edge.id].controller === army.country,
        ),
    );
    assert.ok(moving, "The scenario needs a friendly land movement fixture");
    const destination = GEOGRAPHY[moving.province].neighbors.find(
      (edge) =>
        !edge.sea &&
        movement.world.provinces[edge.id].controller === moving.country,
    ).id;
    const ordered = engine.applyAction(movement.world, {
      type: "move",
      army: moving.id,
      to: destination,
      stance: "hold",
    });
    assert.equal(ordered.error, null);
    movement.world = storage.decodeSave(storage.encodeSave(ordered.world));
    await restore(movement);
    await worker.evaluate(() => {
      self.__europaTestGate.observed = [];
    });
    await start();
    await waitUntil(
      async () =>
        Number(
          await page
            .locator('[data-testid="game-date"]')
            .getAttribute("data-game-hour"),
        ) >= 25,
      "movement must cross midnight through real worker transfers",
    );
    await pause();
    const movementAfter = await save();
    assert.deepEqual(
      movementAfter.world,
      simulateTo(movement.world, tick(movementAfter.world)),
    );
    const moved = movementAfter.world.armies.find(
      (army) => army.id === moving.id,
    );
    assert.ok(
      moved && (moved.move || moved.province !== moving.province),
      "The real army must move",
    );
    const observed = await worker.evaluate(
      () => self.__europaTestGate.observed,
    );
    assert.ok(
      observed.some((result) => result.nextTick === 24 && result.summary),
      "Midnight emits a deterministic checkpoint",
    );
    assert.ok(
      observed.some(
        (result) =>
          result.kind === "delta" &&
          result.metrics.payloadBytes < result.metrics.snapshotBytes * 0.5,
      ),
      "Ordinary hours must have a substantially smaller JSON-equivalent state payload",
    );
    for (const result of observed) {
      assert.equal(result.protocol, 2);
      assert.equal(result.nextTick, result.baseTick + 1);
      assert.equal(result.metrics.transport, result.kind);
      assert.equal(result.metrics.payloadBytes, result.jsonEquivalentBytes);
      assert.ok(result.metrics.payloadBytes <= result.metrics.snapshotBytes);
      if (result.summary)
        assert.equal(
          result.summary.digest,
          fingerprintWorld(simulateTo(movement.world, result.nextTick)),
        );
    }
    transfers.push(...observed);
    passed(
      "movement and midnight deltas exactly match the headless engine and world fingerprints",
    );
    await page.locator('button[title="Komuta"]').click();
    await page.getByText("Simülasyon ölçümleri", { exact: true }).click();
    const metrics = page.locator('[data-testid="simulation-metrics"]');
    await metrics.waitFor({ state: "visible" });
    assert.equal(
      Number(await metrics.getAttribute("data-tick")),
      tick(movementAfter.world),
    );
    assert.ok(
      Number(await metrics.getAttribute("data-payload-bytes")) <=
        Number(await metrics.getAttribute("data-snapshot-bytes")),
    );
    const checkpoint = page.locator('[data-testid="simulation-checkpoint"]');
    const checkpointTick = Number(await checkpoint.getAttribute("data-tick"));
    assert.ok(checkpointTick <= tick(movementAfter.world));
    assert.equal(
      await checkpoint.locator("code").textContent(),
      fingerprintWorld(simulateTo(movement.world, checkpointTick)),
    );
    await page.screenshot({
      path: path.join(output, "simulation-metrics.png"),
    });
    passed(
      "public simulation measurements display accepted transfer size and checkpoint without advancing time",
    );

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
    passed("only one hour is in flight and pause rejects its late result");

    await restore(initial);
    await holdResults(worker);
    await start();
    await waitForHeldResult(worker);
    await page.locator('button[title="Komuta"]').click();
    if (!(await page.getByLabel("Oyun zorluğu", { exact: true }).isVisible()))
      await page
        .locator("summary")
        .filter({ hasText: /^Oyun zorluğu$/ })
        .click();
    await page
      .getByLabel("Oyun zorluğu", { exact: true })
      .selectOption("normal");
    const commandDate = await date();
    // Remain running: pausing here would mask a lost-command race.
    await releaseResults(worker);
    await waitForDateChange(commandDate);
    await pause();
    assert.equal((await save()).world.difficulty, "normal");
    passed(
      "an action during an in-flight hour survives the stale worker reply",
    );

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
    passed(
      "loading another campaign rejects the previous campaign's late hour",
    );

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
    passed("starting a new campaign rejects the previous campaign's late hour");

    for (const corruption of ["tick", "patch"]) {
      const beforeCorruption = await save();
      await holdResults(worker);
      await start();
      await waitForHeldResult(worker);
      await worker.evaluate((kind) => {
        const gate = self.__europaTestGate;
        const result = gate.held.shift();
        gate.enabled = false;
        if (kind === "tick") result.nextTick++;
        else {
          result.state = {
            kind: "delta",
            patch: {
              kind: "object",
              removed: [],
              changes: JSON.parse(
                '{"__proto__":{"kind":"value","value":{"bad":true}}}',
              ),
            },
          };
          result.metrics.transport = "delta";
        }
        gate.send(result);
      }, corruption);
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      await page.getByText(/Simülasyon sonucu seferle uyuşmadı/).waitFor();
      assert.deepEqual((await save()).world, beforeCorruption.world);
      const count = workers.length;
      const beforeRetry = await date();
      await start();
      await waitUntil(
        () => workers.length > count,
        "a corrupt result must require a fresh worker",
      );
      worker = workers.at(-1);
      await waitForDateChange(beforeRetry);
      await pause();
      const retry = await save();
      assert.deepEqual(
        retry.world,
        simulateTo(beforeCorruption.world, tick(retry.world)),
      );
      passed(
        `corrupt ${corruption} result pauses atomically; retry resynchronizes the exact campaign`,
      );
    }

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
    let saved = await save();
    assert.ok(tick(saved.world) > tick(beforeFailure.world));
    passed(
      "worker failure pauses without changing the saved world and retry recovers",
    );

    const beforeMobile = saved;
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Yönetim panelini kapat", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Haritayı yakınlaştır", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Haritayı yakınlaştır", exact: true })
      .click();
    const mobileMap = page.locator('[data-testid="war-map"]');
    const beforePan = await mobileMap.getAttribute("viewBox");
    const bounds = await mobileMap.boundingBox();
    assert.ok(bounds && bounds.width > 100 && bounds.height > 100);
    const touch = await context.newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 2,
    });
    await page.evaluate(() => {
      const probe = {
        active: true,
        frames: 0,
        maxGapMs: 0,
        last: performance.now(),
      };
      self.__europaPanProbe = probe;
      function frame(now) {
        if (!probe.active) return;
        probe.frames++;
        probe.maxGapMs = Math.max(probe.maxGapMs, now - probe.last);
        probe.last = now;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const panDate = await date();
    await start();
    const x = Math.round(Math.min(340, bounds.x + bounds.width * 0.65));
    const y = Math.round(Math.min(680, bounds.y + bounds.height * 0.5));
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 12; step++) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * 5, y: y - step * 4 }],
      });
      await page.waitForTimeout(20);
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await waitForDateChange(panDate);
    await pause();
    await waitUntil(
      async () => (await mobileMap.getAttribute("viewBox")) !== beforePan,
      "touch drag must change the mobile map camera",
    );
    mobilePan = await page.evaluate(() => {
      const probe = self.__europaPanProbe;
      probe.active = false;
      return {
        frames: probe.frames,
        maxGapMs: probe.maxGapMs,
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(mobilePan.frames > 0);
    assert.ok(
      mobilePan.documentWidth <= mobilePan.viewport.width + 1,
      "Mobile layout must not overflow horizontally",
    );
    await page.screenshot({
      path: path.join(output, "mobile-touch-worker.png"),
    });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await page
      .getByRole("button", { name: "Yönetim panelini aç →", exact: true })
      .click();
    saved = await save();
    assert.deepEqual(
      saved.world,
      simulateTo(beforeMobile.world, tick(saved.world)),
      "Camera input must not change simulation results",
    );
    passed(
      "mobile touch camera remains functional while worker hours advance; frame samples recorded without an FPS guarantee",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });

    const before3D = saved;
    await observeResults(worker);
    await page
      .getByRole("button", { name: "Yönetim panelini kapat", exact: true })
      .click();
    await page.getByRole("button", { name: "3D arazi", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="war-map-3d"]')?.dataset.ready ===
        "true",
      null,
      { timeout: 120000 },
    );
    const canvas = page.getByTestId("war-map-3d");
    assert.equal(
      await page.getByLabel("Grafik kalitesi", { exact: true }).inputValue(),
      "low",
    );
    const firstFrame = Number(
      await canvas.getAttribute("data-rendered-frames"),
    );
    await start();
    await waitUntil(
      async () =>
        Number(
          await page
            .locator('[data-testid="game-date"]')
            .getAttribute("data-game-hour"),
        ) >=
        tick(before3D.world) + 3,
      "the 3D scene must consume several accepted worker hours",
      60000,
    );
    await pause();
    await page.waitForFunction(
      (frame) =>
        Number(
          document.querySelector('[data-testid="war-map-3d"]')?.dataset
            .renderedFrames,
        ) > frame,
      firstFrame,
      { timeout: 60000 },
    );
    threeDSmoke = await canvas.evaluate((element) => ({
      ready: element.dataset.ready,
      quality: element.dataset.quality,
      frames: Number(element.dataset.renderedFrames),
      triangles: Number(element.dataset.triangles),
      unitInstances: Number(element.dataset.unitInstances),
    }));
    assert.equal(threeDSmoke.ready, "true");
    assert.equal(threeDSmoke.quality, "low");
    assert.ok(threeDSmoke.triangles > 0 && threeDSmoke.unitInstances > 0);
    assert.equal(
      await page.getByTestId("war-map").count(),
      0,
      "3D must not fall back to SVG",
    );
    assert.ok(
      (await worker.evaluate(() => self.__europaTestGate.observed)).some(
        (result) => result.kind === "delta",
      ),
    );
    await page.screenshot({ path: path.join(output, "worker-delta-3d.png") });
    await page
      .getByRole("button", { name: "Yönetim panelini aç →", exact: true })
      .click();
    saved = await save();
    assert.deepEqual(
      saved.world,
      simulateTo(before3D.world, tick(saved.world)),
    );
    await page
      .getByRole("button", { name: "2D siyasi harita", exact: true })
      .click();
    await page.getByTestId("war-map").waitFor();
    assert.equal(await canvas.count(), 0);
    passed(
      "3D renderer accepts hourly deltas with real geometry and unchanged simulation results",
    );

    const offlineDetails = page.getByText(
      "Sefer bilgileri ve çevrimdışı durum",
      { exact: true },
    );
    if ((await offlineDetails.locator("..").getAttribute("open")) === null)
      await offlineDetails.click();
    await page
      .getByText(readyText, { exact: true })
      .waitFor({ timeout: 60000 });
    const workerAssets = await worker.evaluate(() => {
      const location = new URL(self.location.href);
      const entry = location.searchParams.get("entry");
      return [
        ...new Set([
          location.href,
          ...(entry ? [new URL(entry, location).href] : []),
          ...performance
            .getEntriesByType("resource")
            .map((resource) => resource.name),
        ]),
      ];
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
    const label = `${saved.world.countries[saved.world.player].name} · ${saved.world.day}. gün · ${String(saved.world.hour).padStart(2, "0")}:00`;
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
    assert.ok(tick(offline.world) > tick(saved.world));
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
      transfers,
      mobilePan,
      threeDSmoke,
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
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        {
          error: error.message,
          checks,
          pageErrors: errors,
          networkFailures,
        },
        null,
        2,
      ),
    );
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    fs.rmSync(compiled, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
