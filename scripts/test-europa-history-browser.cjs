/* Historical decisions and offline audio acceptance through public controls.
 * Requires a fresh production server. Fixtures use the ordinary save format;
 * audio instrumentation only observes native browser nodes, never app state.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { advanceClockHours } = require("./europa-browser-clock.cjs");

const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/europa-history-browser";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

function observeAudio() {
  const probe = (window.__europaAudio = {
    contexts: [],
    gains: [],
    starts: 0,
    ended: 0,
    stops: 0,
    notes: [],
  });
  const frequencies = new WeakMap();
  probe.parameters = frequencies;
  const setValue = window.AudioParam.prototype.setValueAtTime;
  window.AudioParam.prototype.setValueAtTime = function (value, at) {
    frequencies.set(this, value);
    return setValue.call(this, value, at);
  };
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;
  class ObservedContext extends Native {
    constructor(...args) {
      super(...args);
      probe.contexts.push(this);
    }
    createGain() {
      const node = super.createGain();
      probe.gains.push(node);
      return node;
    }
  }
  window.AudioContext = ObservedContext;
  if (window.webkitAudioContext) window.webkitAudioContext = ObservedContext;
  const prototype = window.AudioScheduledSourceNode.prototype;
  const start = prototype.start;
  const stop = prototype.stop;
  prototype.start = function (...args) {
    probe.starts++;
    if (this.frequency)
      probe.notes.push(frequencies.get(this.frequency) ?? this.frequency.value);
    this.addEventListener("ended", () => probe.ended++, { once: true });
    return start.apply(this, args);
  };
  const bufferStart = window.AudioBufferSourceNode.prototype.start;
  window.AudioBufferSourceNode.prototype.start = function (...args) {
    probe.starts++;
    this.addEventListener("ended", () => probe.ended++, { once: true });
    return bufferStart.apply(this, args);
  };
  prototype.stop = function (...args) {
    probe.stops++;
    return stop.apply(this, args);
  };
}

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".history-browser-"),
  );
  const checks = [],
    errors = [],
    audioSamples = [];
  let browser, page;
  const report = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors, audioSamples }, null, 2),
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
    const { createWorld } = require(path.join(source, "world.js"));
    const { focusTree, TECHNOLOGIES } = require(
      path.join(source, "catalog.js"),
    );
    const { createCommand, executeCommand } = require(
      path.join(source, "commands.js"),
    );
    const { applyAction, advanceHour } = require(
      path.join(source, "engine.js"),
    );
    const { HISTORICAL_EVENTS } = require(
      path.join(source, "historical-catalog.js"),
    );
    const { pendingHistoricalDecision } = require(
      path.join(source, "historical-events.js"),
    );
    const { encodeSave, decodeSave, validateWorld } = require(
      path.join(source, "storage.js"),
    );
    const anschluss = HISTORICAL_EVENTS.find(
      (event) => event.id === "anschluss",
    );
    assert.ok(anschluss, "The event catalog must contain Anschluss");
    const focus = focusTree("germany").find(
      (item) => item.id === `history-${anschluss.id}`,
    );
    assert.ok(focus);
    const tick = (world) => world.day * 24 + world.hour;
    const safe = (world) => {
      assert.ok(
        validateWorld(world),
        "Fixture must pass the production save validator",
      );
      return decodeSave(encodeSave(world));
    };
    function fixture() {
      const world = createWorld("germany", "alternative", 1936, "easy");
      world.day = Math.ceil(
        (Date.parse(anschluss.date + "T00:00:00Z") -
          Date.parse("1936-01-01T00:00:00Z")) /
          86400000,
      );
      world.countries.germany.political = 300;
      world.countries.germany.focus = null;
      for (const country of Object.values(world.countries)) {
        country.automation = {
          economy: false,
          research: false,
          recruitment: false,
          operations: false,
          air: false,
          navy: false,
        };
      }
      const prerequisites = new Set();
      const collect = (id) => {
        if (prerequisites.has(id)) return;
        prerequisites.add(id);
        focusTree("germany")
          .find((item) => item.id === id)
          ?.requires.forEach(collect);
      };
      focus.requires.forEach(collect);
      world.countries.germany.focuses = [...prerequisites];
      world.historical = {
        pending: [],
        resolved: [
          { eventId: "rhineland", day: 0, outcome: "accepted", by: "germany" },
        ],
      };
      return safe(world);
    }
    const ready = fixture();
    const started = applyAction(ready, { type: "focus", id: focus.id });
    assert.equal(started.error, null, started.error);
    const near = structuredClone(started.world);
    near.countries.germany.focus.progress =
      near.countries.germany.focus.total - 1;
    near.hour = 23;
    safe(near);
    const finished = advanceHour(near);
    assert.ok(pendingHistoricalDecision(finished));
    safe(finished);
    const austrianSource = structuredClone(finished);
    austrianSource.player = "austria";
    const request = {
      type: "historicalChoice",
      id: `history-${anschluss.id}`,
      choice: "accept",
    };
    const austrianOffer = executeCommand(
      austrianSource,
      createCommand(austrianSource, request, "germany"),
      "germany",
    );
    assert.equal(austrianOffer.status, "applied", austrianOffer.message);
    assert.equal(
      pendingHistoricalDecision(austrianOffer.world)?.stage,
      "respond",
    );
    safe(austrianOffer.world);
    pass(
      "Validated paid-focus and near-completion campaigns generate a real pending historical decision",
    );
    if (process.env.EUROPA_FIXTURES_ONLY === "1") return;

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
    for (const [device, viewport, mobile] of [
      ["desktop", { width: 1440, height: 900 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ]) {
      if (
        process.env.EUROPA_HISTORY_DEVICE &&
        process.env.EUROPA_HISTORY_DEVICE !== device
      )
        continue;
      const audioOnly =
        process.env.EUROPA_HISTORY_AUDIO_ONLY === "all" ||
        process.env.EUROPA_HISTORY_AUDIO_ONLY === device;
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: mobile ? "reduce" : "no-preference",
        serviceWorkers: "block",
      });
      await context.addInitScript(observeAudio);
      page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (error) =>
        errors.push(`${device}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`${device}: ${entry.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const audio = () =>
        page.evaluate(() => {
          const probe = window.__europaAudio;
          return {
            contexts: probe.contexts.length,
            states: probe.contexts.map((context) => context.state),
            starts: probe.starts,
            ended: probe.ended,
            stops: probe.stops,
            gains: probe.gains.map((node) => node.gain.value),
            scheduledGains: probe.gains.map((node) =>
              probe.parameters.get(node.gain),
            ),
            notes: [...probe.notes],
          };
        });
      const clock = async () =>
        Number(
          await page.getByTestId("game-date").getAttribute("data-game-hour"),
        );
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.isVisible()) await click(button);
      };
      const close = async () => {
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
        await close();
        await click(page.locator(`button[title="${name}"]`));
      };
      const load = async (world) => {
        await pause();
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "history.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        if (!(await page.getByTestId("historical-decision").isVisible()))
          await close();
      };
      const save = async () => {
        await pause();
        await tab("Kayıtlar");
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        const world = decodeSave(
          await page.evaluate(() =>
            localStorage.getItem("xarmy-europa-1936-v1:slot-1"),
          ),
        );
        await close();
        return world;
      };
      const screenshot = (name) =>
        page.screenshot({ path: path.join(output, `${device}-${name}.png`) });
      const noOverflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        );
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByLabel("Komuta edeceğin ülke").waitFor();
      assert.equal((await audio()).starts, 0);
      pass(
        `${device}: loading the game produces no sound before a user gesture`,
      );
      await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
      await pause();
      await close();
      await page.waitForFunction(() => window.__europaAudio.starts > 0);
      pass(
        `${device}: starting a campaign unlocks native Web Audio and plays a start cue`,
      );

      if (!audioOnly) {
        await load(ready);
        await tab("Odak / Olaylar");
        const card = page.locator(`[data-focus-id="${focus.id}"]`);
        await card.scrollIntoViewIfNeeded();
        await screenshot("focus-tree");
        await click(card.getByRole("button", { name: /başlat/i }));
        const paid = await save();
        assert.equal(
          paid.countries.germany.political,
          ready.countries.germany.political - focus.cost,
        );
        assert.equal(paid.countries.germany.focus.id, focus.id);
        pass(
          `${device}: easy-mode focus tree starts Anschluss and charges its real diplomatic cost once`,
        );

        const poor = structuredClone(ready);
        poor.countries.germany.political = 0;
        await load(poor);
        await tab("Odak / Olaylar");
        await page
          .locator(`[data-focus-id="${focus.id}"]`)
          .scrollIntoViewIfNeeded();
        assert.ok(
          await page
            .locator(`[data-focus-id="${focus.id}"]`)
            .getByRole("button", { name: /başlat/i })
            .isDisabled(),
        );
        const locked = structuredClone(ready);
        locked.countries.germany.focuses = [];
        locked.historical.resolved = [];
        await load(locked);
        await tab("Odak / Olaylar");
        assert.ok(
          await page
            .locator(`[data-focus-id="${focus.id}"]`)
            .getByRole("button", { name: /başlat/i })
            .isDisabled(),
        );
        pass(
          `${device}: insufficient points and missing prerequisites disable historical focus commands`,
        );

        const research = structuredClone(ready);
        research.hour = 23;
        const technology = TECHNOLOGIES.find(
          (item) =>
            !research.countries.germany.tech.includes(item.id) &&
            item.requires.every((id) =>
              research.countries.germany.tech.includes(id),
            ),
        );
        assert.ok(technology);
        research.countries.germany.research = [
          { id: technology.id, progress: 99, total: 100 },
        ];
        await load(safe(research));
        const completionBefore = (await audio()).notes.filter(
          (note) => note === 880,
        ).length;
        await advanceClockHours(page, 1, 1);
        await page.waitForFunction(
          (before) =>
            window.__europaAudio.notes.filter((note) => note === 880).length >
            before,
          completionBefore,
        );
        assert.ok(
          (await save()).countries.germany.tech.includes(technology.id),
        );
        pass(
          `${device}: a real completed research changes technology and plays its completion motif`,
        );

        await load(near);
        await click(
          page.getByRole("button", { name: "5 kat hız", exact: true }),
        );
        const soundBefore = (await audio()).starts;
        const keysBefore = (await audio()).notes.filter(
          (note) => note === 650,
        ).length;
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        const dialog = page.getByTestId("historical-decision");
        await dialog.waitFor();
        assert.equal(await clock(), tick(near) + 1);
        await page.waitForTimeout(650);
        assert.equal(await clock(), tick(near) + 1);
        assert.ok((await audio()).starts > soundBefore);
        assert.ok(await dialog.getByTestId("historical-accept").isEnabled());
        assert.ok(await dialog.getByTestId("historical-decline").isEnabled());
        if (!mobile) {
          assert.ok(
            (await audio()).notes.filter((note) => note === 650).length >
              keysBefore,
          );
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
          assert.ok(await dialog.isVisible());
          assert.equal(await page.getByTestId("historical-reveal").count(), 0);
          const stoppedKeys = (await audio()).notes.filter(
            (note) => note === 650,
          ).length;
          await page.waitForTimeout(200);
          assert.equal(
            (await audio()).notes.filter((note) => note === 650).length,
            stoppedKeys,
          );
          await page.keyboard.press("Tab");
          assert.ok(
            await dialog.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          );
        }
        await screenshot("decision");
        await click(dialog.getByTestId("historical-decline"));
        await dialog.waitFor({ state: "hidden" });
        const declined = await save();
        assert.equal(
          declined.provinces[declined.countries.austria.capital].owner,
          "austria",
        );
        assert.ok(
          declined.historical.resolved.some(
            (item) =>
              item.eventId === anschluss.id && item.outcome === "declined",
          ),
        );
        pass(
          `${device}: real worker completion pauses at exactly one hour, plays the dossier sound and honors declining annexation`,
        );

        await load(finished);
        await page.getByTestId("historical-decision").waitFor();
        await click(page.getByTestId("historical-accept"));
        await page
          .getByTestId("historical-decision")
          .waitFor({ state: "hidden" });
        const accepted = await save();
        assert.equal(
          accepted.provinces[accepted.countries.austria.capital].owner,
          "germany",
        );
        assert.ok(accepted.countries.austria.capitulated);
        assert.ok(
          accepted.historical.resolved.some(
            (item) =>
              item.eventId === anschluss.id && item.outcome === "accepted",
          ),
        );
        await load(accepted);
        assert.equal(await page.getByTestId("historical-decision").count(), 0);
        assert.deepEqual(await save(), accepted);
        pass(
          `${device}: accepting Anschluss changes ownership and reload preserves the decision without applying it twice`,
        );

        await load(austrianOffer.world);
        await page.getByTestId("historical-decision").waitFor();
        assert.ok(await page.getByTestId("historical-accept").isEnabled());
        await click(page.getByTestId("historical-decline"));
        const sovereign = await save();
        assert.equal(sovereign.player, "austria");
        assert.equal(sovereign.countries.austria.capitulated, false);
        assert.equal(
          sovereign.provinces[sovereign.countries.austria.capital].owner,
          "austria",
        );
        assert.ok(
          sovereign.historical.resolved.some(
            (item) =>
              item.eventId === anschluss.id &&
              item.outcome === "declined" &&
              item.by === "austria",
          ),
        );
        pass(
          `${device}: a human Austria receives the demand and can keep independence by refusing`,
        );

        await load(austrianOffer.world);
        await page.getByTestId("historical-decision").waitFor();
        const defeatBefore = (await audio()).notes.filter(
          (note) => note === 165,
        ).length;
        await click(page.getByTestId("historical-accept"));
        await page
          .getByTestId("historical-decision")
          .waitFor({ state: "hidden" });
        await page.waitForFunction(
          (before) =>
            window.__europaAudio.notes.filter((note) => note === 165).length >
            before,
          defeatBefore,
        );
        const annexed = await save();
        assert.equal(annexed.countries.austria.capitulated, true);
        assert.equal(
          annexed.provinces[annexed.countries.austria.capital].owner,
          "germany",
        );
        assert.ok(
          annexed.historical.resolved.some(
            (item) =>
              item.eventId === anschluss.id &&
              item.outcome === "accepted" &&
              item.by === "austria",
          ),
        );
        pass(
          `${device}: a human Austria may also accept, with actual annexation, a defeat motif and a recorded result`,
        );

        await tab("Odak / Olaylar");
        await click(page.getByRole("button", { name: /^Tarihî olaylar$/i }));
        assert.match(
          await page.locator('[data-event-id="anschluss"]').innerText(),
          /Kabul edildi/,
        );
        await screenshot("event-archive");
        assert.ok(await noOverflow());
        pass(
          `${device}: the separate historical event archive remains readable without page overflow`,
        );
      }

      await load(ready);
      await tab("Komuta");
      const settings = page.getByTestId("sound-settings");
      await settings.scrollIntoViewIfNeeded();
      await click(settings.locator("summary"));
      const enabled = settings.getByLabel("Sesleri aç", { exact: true });
      assert.ok(await enabled.isChecked());
      await enabled.scrollIntoViewIfNeeded();
      await screenshot("sound-settings");
      assert.ok(await noOverflow());
      await click(enabled);
      await page.waitForTimeout(600);
      const muted = (await audio()).starts;
      // Chrome may leave gain.value at its last rendered quantum after every
      // source disconnects. Observe the actual native AudioParam zero command
      // and node lifetime, then verify later public actions start no sources.
      const silenced = await audio();
      assert.ok(silenced.scheduledGains.some((value) => value === 0));
      assert.equal(silenced.starts, silenced.ended);
      await click(settings.locator("summary"));
      await tab("Odak / Olaylar");
      await click(page.getByRole("button", { name: /^Tarihî olaylar$/i }));
      await click(page.getByRole("button", { name: /^Odak ağacı$/i }));
      await page.waitForTimeout(350);
      assert.equal((await audio()).starts, muted);
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("xarmy-europa-audio-v1")).enabled,
        ),
        false,
      );
      pass(
        `${device}: muting silences active audio, prevents new UI cues and persists the preference`,
      );

      if (mobile) {
        await page.setViewportSize({ width: 320, height: 640 });
        await load(finished);
        await page.getByTestId("historical-decision").waitFor();
        assert.equal(await page.getByTestId("historical-reveal").count(), 0);
        assert.ok(await noOverflow());
        await screenshot("decision-320");
        await click(page.getByTestId("historical-decline"));
        assert.ok(await noOverflow());
        pass(
          `${device}: reduced-motion 320px dialog reveals all text immediately and keeps both decisions accessible`,
        );
      }
      await save();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByLabel("Komuta edeceğin ülke").waitFor();
      assert.equal((await audio()).starts, 0);
      await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
      await pause();
      assert.equal((await audio()).starts, 0);
      await page.getByTestId("sound-settings").scrollIntoViewIfNeeded();
      await click(page.getByTestId("sound-settings").locator("summary"));
      assert.equal(
        await page
          .getByTestId("sound-settings")
          .getByLabel("Sesleri aç", { exact: true })
          .isChecked(),
        false,
      );
      pass(
        `${device}: reloading and starting another campaign respect the saved mute preference`,
      );
      audioSamples.push({ device, final: await audio() });
      report();
      await context.close();
      page = null;
    }
    assert.deepEqual(errors, []);
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
