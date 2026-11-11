/* Public-UI acceptance for unified settings and paginated national programmes.
 * Start a fresh production server first. Inputs are ordinary validated saves.
 * Native AudioParam/source instrumentation observes audio without app hooks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://127.0.0.1:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/europa-settings-browser";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

function observeNativeAudio() {
  const probe = (window.__europaSettingsAudio = {
    starts: 0,
    ended: 0,
    gains: [],
    params: new WeakMap(),
  });
  const setValue = AudioParam.prototype.setValueAtTime;
  AudioParam.prototype.setValueAtTime = function (value, time) {
    probe.params.set(this, value);
    return setValue.call(this, value, time);
  };
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;
  window.AudioContext = class extends Native {
    createGain() {
      const gain = super.createGain();
      probe.gains.push(gain);
      return gain;
    }
  };
  for (const prototype of [
    AudioScheduledSourceNode.prototype,
    AudioBufferSourceNode.prototype,
  ]) {
    const start = prototype.start;
    prototype.start = function (...args) {
      probe.starts++;
      this.addEventListener("ended", () => probe.ended++, { once: true });
      return start.apply(this, args);
    };
  }
}

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".settings-browser-"),
  );
  const checks = [],
    errors = [];
  let browser, page;
  const report = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
  const pass = (name) => {
    checks.push(name);
    report();
    console.log("PASS " + name);
  };
  try {
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
      ],
      { cwd: root, stdio: "pipe" },
    );
    const source = path.join(compiled, "app/games/europa-war/strategy");
    const { createWorld, MAP } = require(path.join(source, "world.js"));
    const { countryEvents, allCountryEvents, historicalEvent } = require(
      path.join(source, "historical-catalog.js"),
    );
    const { encodeSave, decodeSave, validateWorld } = require(
      path.join(source, "storage.js"),
    );
    const { applyAction, advanceHour } = require(
      path.join(source, "engine.js"),
    );
    const { pendingHistoricalDecision } = require(
      path.join(source, "historical-events.js"),
    );
    const { politicsDay } = require(path.join(source, "politics.js"));
    const { resolveLandDay } = require(path.join(source, "land.js"));
    const baseWorld = createWorld("germany", "alternative", 1936, "easy");
    baseWorld.countries.germany.political = 500;
    for (const c of Object.values(baseWorld.countries))
      c.automation = {
        economy: false,
        research: false,
        recruitment: false,
        operations: false,
        air: false,
        navy: false,
      };
    assert.ok(validateWorld(baseWorld));
    const eventCounts = new Map(
      MAP.countries.map((country) => [
        country.id,
        countryEvents(country.id).length,
      ]),
    );
    assert.ok([...eventCounts.values()].every((count) => count >= 100));
    assert.equal(
      new Set(allCountryEvents().map((event) => event.id)).size,
      allCountryEvents().length,
    );
    pass(
      "Every playable country has at least 100 distinct catalogue decisions and the saved fixture passes production validation",
    );

    const command = (world, action) => {
      const result = applyAction(world, action);
      assert.equal(result.error, null, result.error);
      return result.world;
    };
    const safe = (world) => {
      assert.ok(validateWorld(world));
      return decodeSave(encodeSave(world));
    };
    const civilFactories = (world) =>
      Object.values(world.provinces)
        .filter((province) => province.owner === "germany")
        .reduce((sum, province) => sum + province.buildings.civil, 0);
    const choice = (id, value = "accept") => ({
      type: "historicalChoice",
      id: "history-" + id,
      choice: value,
    });
    const prepareFocus = (world, id) => {
      const started = command(world, { type: "focus", id: "history-" + id });
      const near = structuredClone(started);
      near.hour = 23;
      near.countries.germany.focus.progress =
        near.countries.germany.focus.total - 1;
      return safe(near);
    };
    const workshopId = "national-germany-workshops";
    const workshopNear = prepareFocus(baseWorld, workshopId);
    const workshopPending = safe(advanceHour(workshopNear));
    assert.equal(
      pendingHistoricalDecision(workshopPending)?.eventId,
      workshopId,
    );
    const workshopAccepted = safe(command(workshopPending, choice(workshopId)));
    assert.equal(
      civilFactories(workshopAccepted),
      civilFactories(workshopPending) + 1,
    );
    assert.equal(
      workshopAccepted.countries.germany.treasury,
      workshopPending.countries.germany.treasury - 120,
    );
    assert.equal(
      workshopAccepted.countries.germany.stock.steel,
      workshopPending.countries.germany.stock.steel - 20,
    );

    // Build the imperial route through actual paid focus and decision commands.
    // Only remaining preparation time is shortened in these saved checkpoints.
    let imperial = structuredClone(baseWorld);
    imperial.countries.germany.treasury = 100000;
    for (const key of Object.keys(imperial.countries.germany.stock))
      imperial.countries.germany.stock[key] = 10000;
    for (const key of Object.keys(imperial.countries.germany.equipment))
      imperial.countries.germany.equipment[key] = 10000;
    for (const suffix of [
      "conservative-circle",
      "officers-pact",
      "dynastic-petition",
    ]) {
      const id = "national-germany-" + suffix;
      imperial = prepareFocus(imperial, id);
      politicsDay(imperial);
      imperial = command(imperial, choice(id));
    }
    const uprisingId = "national-germany-monarchist-uprising";
    const restorationId = "national-germany-restore-empire";
    const uprisingNear = prepareFocus(imperial, uprisingId);
    const uprisingPending = safe(advanceHour(uprisingNear));
    const uprisingAccepted = safe(command(uprisingPending, choice(uprisingId)));
    assert.equal(uprisingAccepted.player, "germany");
    assert.ok(
      uprisingAccepted.countries.germany.wars.includes("germany-rebels"),
    );
    assert.ok(
      uprisingAccepted.armies.some((army) => army.country === "germany-rebels"),
    );
    assert.ok(
      applyAction(uprisingAccepted, {
        type: "focus",
        id: "history-" + restorationId,
      }).error,
    );
    // A separate battle checkpoint represents all rebel provinces being occupied;
    // the real land engine must resolve capitulation before restoration is legal.
    const victory = structuredClone(uprisingAccepted);
    for (const province of Object.values(victory.provinces))
      if (province.owner === "germany-rebels") province.controller = "germany";
    resolveLandDay(victory);
    assert.equal(victory.countries["germany-rebels"].capitulated, true);
    const restorationNear = prepareFocus(victory, restorationId);
    pass(
      "Validated workshop and imperial-route checkpoints use paid commands; restoration requires the land engine to resolve a real rebel capitulation",
    );
    if (process.env.EUROPA_FIXTURES_ONLY === "1") return;
    for (const [device, viewport, mobile] of [
      ["desktop", { width: 1440, height: 900 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ]) {
      if (
        process.env.EUROPA_SETTINGS_DEVICE &&
        process.env.EUROPA_SETTINGS_DEVICE !== device
      )
        continue;
      // Separate device runs also isolate Chromium's software GPU resources.
      browser = await chromium.launch({
        executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      });
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: mobile ? "reduce" : "no-preference",
        serviceWorkers: "block",
      });
      await context.addInitScript(observeNativeAudio);
      page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("crash", () => errors.push(`${device}: Chromium page crashed`));
      page.on("pageerror", (error) =>
        errors.push(`${device}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`${device}: ${entry.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const noOverflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        );
      const screenshot = (name) =>
        page.screenshot({ path: path.join(output, `${device}-${name}.png`) });
      const pause = async () => {
        const stop = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await stop.isVisible()) await click(stop);
      };
      const closePanel = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
          "Bildirimi kapat",
        ]) {
          const button = page
            .getByRole("button", { name, exact: true })
            .first();
          if (await button.isVisible()) await click(button);
        }
      };
      const tab = async (name) => {
        await closePanel();
        await click(page.locator(`button[title="${name}"]`));
      };
      const load = async (world) => {
        await pause();
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "national-programmes.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        if (!(await page.getByTestId("historical-decision").isVisible()))
          await closePanel();
      };
      const save = async () => {
        await pause();
        await tab("Kayıtlar");
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        await page
          .getByText("Sefer bu cihaza kaydedildi.", { exact: true })
          .waitFor();
        const stored = await page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open("xarmy-europa-auto-v1", 1);
              request.onerror = () =>
                reject(new Error("Saved game database did not open"));
              request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction("saves", "readonly");
                const get = transaction.objectStore("saves").get("slot-1");
                get.onsuccess = () => resolve(JSON.stringify(get.result));
                get.onerror = () =>
                  reject(new Error("Manual slot was not readable"));
                transaction.oncomplete = () => db.close();
              };
            }),
        );
        return decodeSave(stored);
      };
      const loadSlot = async () => {
        await pause();
        await tab("Kayıtlar");
        await click(
          page.getByRole("button", { name: "Yükle", exact: true }).first(),
        );
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await closePanel();
      };
      const clock = async () =>
        Number(
          await page.getByTestId("game-date").getAttribute("data-game-hour"),
        );
      const complete = async (near, id) => {
        await load(near);
        const before = await clock();
        await click(
          page.getByRole("button", { name: "5 kat hız", exact: true }),
        );
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        const dialog = page.getByTestId("historical-decision");
        await dialog.waitFor();
        assert.equal(await clock(), before + 1);
        await page.waitForTimeout(200);
        assert.equal(await clock(), before + 1);
        assert.match(
          await dialog.innerText(),
          new RegExp(
            historicalEvent(id).title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
        );
        assert.ok(await dialog.getByTestId("historical-accept").isEnabled());
        assert.equal(
          await page.getByTestId("historical-reveal").count(),
          0,
          "Reduced animation settings skip typewriter reveal",
        );
        return dialog;
      };
      const focusCard = async (id) => {
        await tab("Odak / Olaylar");
        await click(
          page.getByRole("button", { name: "Kart listesi", exact: true }),
        );
        await page
          .getByLabel("Odak ara", { exact: true })
          .fill(historicalEvent(id).title);
        return page.locator(`[data-focus-id="history-${id}"]`);
      };
      const settings = () => page.getByTestId("game-settings");
      const chooseSetting = async (label, value) => {
        console.log(`SETTING ${device}: ${label} -> ${value}`);
        const control = settings().getByLabel(label, { exact: true });
        await control.scrollIntoViewIfNeeded();
        await control.selectOption(value);
        console.log(`SETTING DONE ${device}: ${label} -> ${value}`);
      };
      const openSettings = async (setup = false) => {
        await click(
          setup
            ? page.getByRole("button", {
                name: "Görüntü ve oyun ayarları",
                exact: true,
              })
            : page.getByRole("button", { name: "Oyun ayarları", exact: true }),
        );
        await settings().waitFor();
      };
      const closeSettings = async () => {
        await click(
          settings().getByRole("button", {
            name: "Ayarları kapat",
            exact: true,
          }),
        );
        await settings().waitFor({ state: "hidden" });
      };
      const preference = () =>
        page.evaluate(() => ({
          map: localStorage.getItem("xarmy-europa-map-view-v1"),
          quality: localStorage.getItem("xarmy-europa-3d-quality-v1"),
          viewpoint: localStorage.getItem("xarmy-europa-3d-view-v1"),
          motion: localStorage.getItem("xarmy-europa-3d-motion-v1"),
        }));

      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      if (
        device === "desktop" &&
        process.env.EUROPA_SETTINGS_SKIP_DESKTOP_RENDERER === "1"
      ) {
        await openSettings(true);
        await chooseSetting("Ayarlar: harita çizimi", "2d");
        await chooseSetting("Ayarlar: animasyonlar", "reduced");
        await closeSettings();
        await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
        await pause();
      } else {
        await openSettings(true);
        await chooseSetting("Ayarlar: grafik kalitesi", "low");
        await chooseSetting("Ayarlar: harita bakışı", "perspective");
        await chooseSetting("Ayarlar: animasyonlar", "reduced");
        await chooseSetting("Ayarlar: harita çizimi", "3d");
        assert.ok(await noOverflow());
        await screenshot("setup-settings");
        await closeSettings();
        await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
        await pause();
        await closePanel();
        const canvas = page.getByTestId("war-map-3d");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
        assert.equal(await canvas.getAttribute("data-quality"), "low");
        assert.equal(
          await canvas.getAttribute("data-viewpoint"),
          "perspective",
        );
        assert.equal(await canvas.getAttribute("data-animations"), "reduced");
        assert.equal(
          await page
            .getByTestId("command-map-shell")
            .getAttribute("data-reduced-motion"),
          "true",
        );
        pass(
          `${device}: setup settings reach a real 3D scene with the selected quality, camera and reduced animations`,
        );

        await openSettings();
        await chooseSetting("Ayarlar: grafik kalitesi", "medium");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .quality === "medium",
        );
        await chooseSetting("Ayarlar: harita bakışı", "strategic");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .viewpoint === "strategic",
        );
        await chooseSetting("Ayarlar: animasyonlar", "full");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .animations === "full",
        );
        await chooseSetting("Ayarlar: grafik kalitesi", "low");
        await chooseSetting("Ayarlar: animasyonlar", "reduced");
        await chooseSetting("Ayarlar: harita çizimi", "2d");
        await closeSettings();
        assert.equal(await canvas.count(), 0);
        pass(
          `${device}: campaign settings update the live renderer and can return safely from 3D to 2D`,
        );

        await page.reload({ waitUntil: "domcontentloaded" });
        await openSettings(true);
        assert.deepEqual(await preference(), {
          map: "2d",
          quality: "low",
          viewpoint: "strategic",
          motion: "reduced",
        });
        assert.equal(
          await settings()
            .getByLabel("Ayarlar: grafik kalitesi", { exact: true })
            .inputValue(),
          "low",
        );
        assert.equal(
          await settings()
            .getByLabel("Ayarlar: animasyonlar", { exact: true })
            .inputValue(),
          "reduced",
        );
        await page.keyboard.press("Escape");
        await settings().waitFor({ state: "hidden" });
        await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
        await pause();
        pass(
          `${device}: display settings survive reload and the native settings dialog closes with Escape`,
        );
      }

      if (
        !(
          device === "desktop" &&
          process.env.EUROPA_SETTINGS_START_AT === "imperial"
        )
      ) {
        await load(baseWorld);
        await tab("Odak / Olaylar");
        await click(
          page.getByRole("button", { name: "Kart listesi", exact: true }),
        );
        assert.equal(
          await page
            .getByTestId("national-catalog-count")
            .locator("strong")
            .innerText(),
          String(eventCounts.get("germany")),
        );
        assert.ok((await page.locator("[data-focus-id]").count()) <= 12);
        const firstIds = await page
          .locator("[data-focus-id]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.focusId));
        await click(
          page.getByRole("button", {
            name: "Odak sayfaları: sonraki sayfa",
            exact: true,
          }),
        );
        const nextIds = await page
          .locator("[data-focus-id]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.focusId));
        assert.ok(nextIds.length > 0 && nextIds.length <= 12);
        assert.ok(nextIds.every((id) => !firstIds.includes(id)));
        await page.getByLabel("Odak ara", { exact: true }).fill("Anschluss");
        assert.equal(
          await page.locator('[data-focus-id="history-anschluss"]').count(),
          1,
        );
        assert.equal(await page.locator("[data-focus-id]").count(), 1);
        await screenshot("searched-focus");
        pass(
          `${device}: national focus counts, twelve-card pagination and cross-page search show real catalogue entries`,
        );

        await click(
          page.getByRole("button", { name: "Tarihî olaylar", exact: true }),
        );
        await page
          .getByLabel("Olay ülkesi", { exact: true })
          .selectOption("germany");
        assert.ok((await page.locator("[data-event-id]").count()) <= 12);
        await page
          .getByLabel("Olay türü", { exact: true })
          .selectOption("national");
        const national = new Set(
          countryEvents("germany")
            .filter((event) => event.countrySpecific)
            .map((event) => event.id),
        );
        assert.equal(
          [...national].filter((id) => id.startsWith("national-germany-"))
            .length,
          50,
        );
        assert.match(
          await page.getByTestId("archive-result-count").innerText(),
          new RegExp(`/ ${national.size} olay`),
        );
        assert.ok(
          (
            await page
              .locator("[data-event-id]")
              .evaluateAll((nodes) => nodes.map((node) => node.dataset.eventId))
          ).every((id) => national.has(id)),
        );
        await page
          .getByLabel("Olay türü", { exact: true })
          .selectOption("alternative");
        assert.ok((await page.locator("[data-event-id]").count()) > 0);
        const alternatives = new Set(
          countryEvents("germany")
            .filter((event) => event.era === "alternative")
            .map((event) => event.id),
        );
        assert.ok(
          (
            await page
              .locator("[data-event-id]")
              .evaluateAll((nodes) => nodes.map((node) => node.dataset.eventId))
          ).every((id) => alternatives.has(id)),
        );
        await page.getByLabel("Olay türü", { exact: true }).selectOption("all");
        await page
          .getByLabel("Olay ülkesi", { exact: true })
          .selectOption("turkey");
        await page.getByLabel("Olay ara", { exact: true }).fill("Montrö");
        assert.ok(
          (await page.locator('[data-event-id="montreux-treaty"]').count()) ===
            1,
        );
        await page.getByLabel("Olay ara", { exact: true }).fill("");
        await page
          .getByLabel("Olay ülkesi", { exact: true })
          .selectOption("luxembourg");
        assert.match(
          await page.getByTestId("archive-result-count").innerText(),
          new RegExp(`/ ${eventCounts.get("luxembourg")} olay`),
        );
        assert.equal(await page.locator("[data-event-id]").count(), 12);
        assert.ok(await noOverflow());
        pass(
          `${device}: country, content-type and text filters search the full event archive without rendering thousands of cards`,
        );

        await load(baseWorld);
        const workshopCard = await focusCard(workshopId);
        await click(
          workshopCard.getByRole("button", { name: /^Odağı başlat/ }),
        );
        const paid = await save();
        assert.equal(
          paid.countries.germany.political,
          baseWorld.countries.germany.political -
            historicalEvent(workshopId).cost,
        );
        assert.equal(paid.countries.germany.focus.id, "history-" + workshopId);
        const workshopDialog = await complete(workshopNear, workshopId);
        assert.ok(await noOverflow());
        await screenshot("domestic-decision");
        await click(workshopDialog.getByTestId("historical-accept"));
        await workshopDialog.waitFor({ state: "hidden" });
        const built = await save();
        assert.equal(
          civilFactories(built),
          civilFactories(workshopPending) + 1,
        );
        assert.equal(
          built.countries.germany.treasury,
          workshopPending.countries.germany.treasury - 120,
        );
        assert.equal(
          built.countries.germany.stock.steel,
          workshopPending.countries.germany.stock.steel - 20,
        );
        assert.equal(
          built.historical.resolved.filter(
            (item) =>
              item.eventId === workshopId && item.outcome === "accepted",
          ).length,
          1,
        );
        pass(
          `${device}: a paid domestic focus completes on the real worker, pauses for its choice, spends treasury and steel, and constructs one actual civilian factory`,
        );

        await loadSlot();
        await tab("Odak / Olaylar");
        await click(
          page.getByRole("button", { name: "Tarihî olaylar", exact: true }),
        );
        await page
          .getByLabel("Olay ara", { exact: true })
          .fill(historicalEvent(workshopId).title);
        const archive = page.locator(`[data-event-id="${workshopId}"]`);
        assert.equal(await archive.count(), 1);
        assert.match(await archive.innerText(), /Kabul edildi/);
        assert.equal(await page.getByTestId("historical-decision").count(), 0);
        const reloaded = await save();
        assert.equal(civilFactories(reloaded), civilFactories(built));
        assert.equal(
          reloaded.historical.resolved.filter(
            (item) => item.eventId === workshopId,
          ).length,
          1,
        );
        await load(workshopPending);
        const declinedDialog = page.getByTestId("historical-decision");
        await declinedDialog.waitFor();
        await click(declinedDialog.getByTestId("historical-decline"));
        await declinedDialog.waitFor({ state: "hidden" });
        const declined = await save();
        assert.equal(civilFactories(declined), civilFactories(workshopPending));
        assert.equal(
          declined.countries.germany.treasury,
          workshopPending.countries.germany.treasury,
        );
        assert.equal(
          declined.countries.germany.stock.steel,
          workshopPending.countries.germany.stock.steel,
        );
        assert.ok(
          declined.historical.resolved.some(
            (item) =>
              item.eventId === workshopId && item.outcome === "declined",
          ),
        );
        pass(
          `${device}: accepted domestic results survive save and reload without duplication, while refusing preserves construction resources`,
        );
      }

      const uprisingDialog = await complete(uprisingNear, uprisingId);
      await click(uprisingDialog.getByTestId("historical-accept"));
      await uprisingDialog.waitFor({ state: "hidden" });
      const civilWar = await save();
      assert.equal(civilWar.player, "germany");
      assert.ok(civilWar.countries.germany.wars.includes("germany-rebels"));
      assert.ok(
        civilWar.armies.some((army) => army.country === "germany-rebels"),
      );
      assert.ok(
        Object.values(civilWar.provinces).some(
          (province) => province.owner === "germany-rebels",
        ),
      );
      const restorationCard = await focusCard(restorationId);
      assert.ok(
        await restorationCard
          .getByRole("button", { name: /^Odağı başlat/ })
          .isDisabled(),
      );
      assert.match(await restorationCard.innerText(), /barış dönemi|iç savaş/i);
      await screenshot("civil-war-blocked-restoration");
      pass(
        `${device}: the monarchist decision creates a separate hostile army and territory while imperial restoration remains locked during the civil war`,
      );

      const restorationDialog = await complete(restorationNear, restorationId);
      await click(restorationDialog.getByTestId("historical-accept"));
      await restorationDialog.waitFor({ state: "hidden" });
      const restored = await save();
      assert.equal(restored.countries.germany.name, "Alman İmparatorluğu");
      assert.equal(restored.countries.germany.leader, "II. Wilhelm");
      assert.equal(restored.countries.germany.ideology, "monarchy");
      assert.equal(
        restored.countries.germany.wars.includes("germany-rebels"),
        false,
      );
      assert.equal(
        Object.values(restored.provinces).some(
          (province) => province.owner === "germany-rebels",
        ),
        false,
      );
      await loadSlot();
      const restoredAgain = await save();
      assert.equal(restoredAgain.countries.germany.name, "Alman İmparatorluğu");
      assert.equal(
        restoredAgain.historical.resolved.filter(
          (item) => item.eventId === restorationId,
        ).length,
        1,
      );
      pass(
        `${device}: after a validated rebel-capitulation checkpoint the restoration decision changes the actual government, reunifies provinces and survives reload`,
      );

      await openSettings();
      const sounds = settings().getByTestId("sound-settings");
      await click(sounds.locator("summary"));
      const voice = sounds.getByLabel("Konuşmalı bildirimler", { exact: true });
      assert.equal(await voice.isChecked(), false);
      const localVoice = await page.evaluate(
        () =>
          typeof speechSynthesis !== "undefined" &&
          speechSynthesis
            .getVoices()
            .some(
              (voice) => voice.localService && /^tr(?:-|$)/i.test(voice.lang),
            ),
      );
      assert.equal(await voice.isDisabled(), !localVoice);
      await click(
        sounds.getByRole("button", { name: "Sesi dene", exact: true }),
      );
      await page.waitForFunction(() => window.__europaSettingsAudio.starts > 0);
      await click(sounds.getByLabel("Sesleri aç", { exact: true }));
      await page.waitForTimeout(600);
      const silent = await page.evaluate(() => {
        const p = window.__europaSettingsAudio;
        return {
          zero: p.gains.some((gain) => p.params.get(gain.gain) === 0),
          starts: p.starts,
          ended: p.ended,
        };
      });
      assert.ok(silent.zero);
      assert.equal(silent.starts, silent.ended);
      if (mobile) await page.setViewportSize({ width: 320, height: 640 });
      await sounds.scrollIntoViewIfNeeded();
      await screenshot("sound-settings");
      assert.ok(await noOverflow());
      await closeSettings();
      await openSettings();
      assert.equal(
        await settings()
          .getByTestId("sound-settings")
          .getByLabel("Sesleri aç", { exact: true })
          .isChecked(),
        false,
      );
      await closeSettings();
      assert.equal(
        await page.evaluate(() => window.__europaSettingsAudio.starts),
        silent.starts,
      );
      pass(
        `${device}: unified sound settings mute native audio, persist the choice and disable speech when no local Turkish voice exists`,
      );
      await context.close();
      page = null;
      await browser.close();
      browser = null;
    }
    assert.deepEqual(errors, []);
    report();
    console.log(
      JSON.stringify({
        passed: checks.length,
        report: path.join(output, "report.json"),
      }),
    );
  } catch (error) {
    errors.push(error.stack || String(error));
    report();
    if (page)
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
    fs.rmSync(compiled, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
