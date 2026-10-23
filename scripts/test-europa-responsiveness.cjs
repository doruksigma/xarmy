/* Run against a production server with other CPU-heavy tasks stopped.
   NODE_PATH=<playwright modules> node scripts/test-europa-responsiveness.cjs
   Optional: EUROPA_CPU_RATE=4, EUROPA_PROFILE=1, EUROPA_DURATION_MS=10000,
   EUROPA_PHASES=startup,pan,initial,large,battle, EUROPA_SAVE_FIXTURE=<save/world>.
   This reports main-thread long tasks and rendering cost, not a pass/fail FPS target.
   Campaign fixtures use the public save-file import control. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
};
const {
  createWorld,
  addArmy,
  GEOGRAPHY,
} = require("../app/games/europa-war/strategy/world.ts");
const {
  advanceDay,
  applyAction,
} = require("../app/games/europa-war/strategy/engine.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-responsiveness";
const rate = Number(process.env.EUROPA_CPU_RATE || 1);
const duration = Number(process.env.EUROPA_DURATION_MS || 10000);
const phases = new Set(
  (process.env.EUROPA_PHASES || "startup,pan,initial,large,battle,late").split(
    ",",
  ),
);
const profiling = process.env.EUROPA_PROFILE === "1";
const results = [];
fs.mkdirSync(output, { recursive: true });
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ||
    0;
  return {
    count: sorted.length,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    maxMs: at(1),
  };
}
function record(result) {
  results.push(result);
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ cpuRate: rate, results }, null, 2),
  );
  console.log(JSON.stringify(result));
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__responsiveness = { longtasks: [], frames: [], recording: false };
      new PerformanceObserver((list) => {
        window.__responsiveness.longtasks.push(
          ...list
            .getEntries()
            .map((entry) => ({
              start: entry.startTime,
              duration: entry.duration,
            })),
        );
      }).observe({ type: "longtask", buffered: true });
      let previous;
      const frame = (now) => {
        if (window.__responsiveness.recording && previous !== undefined)
          window.__responsiveness.frames.push(now - previous);
        previous = now;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map(
          ({ name, value }) => [name, value],
        ),
      );
    async function measure(name, action) {
      await page.evaluate(() => {
        window.__responsiveness.longtasks = [];
        window.__responsiveness.frames = [];
        window.__responsiveness.recording = true;
      });
      const events = [];
      const collect = ({ value }) => events.push(...value);
      if (profiling) {
        cdp.on("Tracing.dataCollected", collect);
        await cdp.send("Tracing.start", {
          categories: "devtools.timeline,blink.user_timing",
          options: "record-as-much-as-possible",
        });
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
      }
      const before = await metrics();
      const start = performance.now();
      const extra = await action();
      const elapsedMs = performance.now() - start;
      const after = await metrics();
      // Let the observer deliver the last completed task.
      await page.waitForTimeout(50);
      const observed = await page.evaluate(() => {
        window.__responsiveness.recording = false;
        return window.__responsiveness;
      });
      let trace;
      if (profiling) {
        const { profile } = await cdp.send("Profiler.stop");
        fs.writeFileSync(
          path.join(output, `${name}.cpuprofile`),
          JSON.stringify(profile),
        );
        await new Promise(async (resolve, reject) => {
          cdp.once("Tracing.tracingComplete", resolve);
          try {
            await cdp.send("Tracing.end");
          } catch (error) {
            reject(error);
          }
        });
        cdp.off("Tracing.dataCollected", collect);
        fs.writeFileSync(
          path.join(output, `${name}.trace.json`),
          JSON.stringify({ traceEvents: events }),
        );
        const renderer = events.find(
          (event) =>
            event.name === "thread_name" &&
            event.args?.name === "CrRendererMain",
        );
        trace = {};
        for (const event of events) {
          if (
            renderer &&
            event.pid === renderer.pid &&
            event.tid === renderer.tid &&
            event.ph === "X" &&
            [
              "Paint",
              "Layerize",
              "Layout",
              "PrePaint",
              "UpdateLayoutTree",
              "FunctionCall",
            ].includes(event.name)
          ) {
            trace[event.name] =
              (trace[event.name] || 0) + (event.dur || 0) / 1000;
          }
        }
      }
      record({
        phase: name,
        elapsedMs,
        ...extra,
        longtasks: {
          ...distribution(observed.longtasks.map((entry) => entry.duration)),
          blockingMs: observed.longtasks.reduce(
            (sum, entry) => sum + Math.max(0, entry.duration - 50),
            0,
          ),
        },
        frames: distribution(observed.frames),
        mainThreadMs: Object.fromEntries(
          [
            "TaskDuration",
            "ScriptDuration",
            "LayoutDuration",
            "RecalcStyleDuration",
          ].map((key) => [key, (after[key] - before[key]) * 1000]),
        ),
        ...(trace ? { traceMs: trace } : {}),
      });
    }
    await page.goto(
      `${process.env.EUROPA_BASE_URL || "http://localhost:3000"}/games/europa-war`,
      { waitUntil: "domcontentloaded" },
    );
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await page.locator('[data-testid="game-date"]').waitFor();
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await page.waitForTimeout(500);
    if (phases.has("startup")) {
      const startup = await page.evaluate(
        () => window.__responsiveness.longtasks,
      );
      record({
        phase: "startup",
        longtasks: distribution(startup.map((entry) => entry.duration)),
      });
    }
    if (phases.has("pan")) {
      await measure("paused-pan", async () => {
        const timings = await page.evaluate(async () => {
          const svg = document.querySelector('[data-testid="war-map"]');
          const timings = [];
          for (let index = 0; index < 30; index++) {
            const start = performance.now();
            svg.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: index % 2 ? "ArrowLeft" : "ArrowRight",
                bubbles: true,
              }),
            );
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            timings.push(performance.now() - start);
          }
          return timings;
        });
        return {
          twoFramePan: distribution(timings),
          svgNodes: await page.locator('[data-testid="war-map"] *').count(),
        };
      });
    }
    async function importWorld(world) {
      const encoded = encodeSave(world);
      decodeSave(encoded); // Fixtures must satisfy the normal game save validator.
      await page.locator('button[title="Kayıtlar"]').click();
      await page
        .getByLabel("Sefer kayıt dosyası")
        .setInputFiles({
          name: "responsiveness.json",
          mimeType: "application/json",
          buffer: Buffer.from(encoded),
        });
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Başkentime git", exact: true })
        .click();
      await page.waitForTimeout(300);
    }
    async function simulation(name, world) {
      await importWorld(world);
      await page
        .getByRole("button", { name: "5 kat hız", exact: true })
        .click();
      const initialDate = await page
        .locator('[data-testid="game-date"]')
        .textContent();
      await measure(name, async () => {
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .click();
        await page.waitForTimeout(duration);
        await page
          .getByRole("button", { name: "Zamanı duraklat", exact: true })
          .click();
        const finalDate = await page
          .locator('[data-testid="game-date"]')
          .textContent();
        assert.notEqual(
          finalDate,
          initialDate,
          "The campaign clock must advance",
        );
        return {
          initialArmies: world.armies.length,
          initialDay: world.day,
          initialDate,
          finalDate,
        };
      });
    }
    if (phases.has("initial"))
      await simulation("initial-5x", createWorld("turkey"));
    if (phases.has("large")) {
      const world = createWorld("turkey");
      const countries = Object.keys(world.countries);
      while (world.armies.length < 2000) {
        const country = countries[world.armies.length % countries.length];
        addArmy(world, country, world.countries[country].capital);
      }
      await simulation("large-5x", world);
    }
    if (phases.has("late") && process.env.EUROPA_SAVE_FIXTURE) {
      const raw = JSON.parse(
        fs.readFileSync(process.env.EUROPA_SAVE_FIXTURE, "utf8"),
      );
      await simulation("late-5x", raw.world || raw);
    }
    if (phases.has("battle")) {
      let world = createWorld("germany", "historical", 1936, "normal");
      declareWar(world, "germany", "poland");
      const source = Object.values(GEOGRAPHY).find(
        (province) =>
          province.country === "germany" &&
          province.neighbors.some(
            (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
          ),
      );
      const destination = source.neighbors.find(
        (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
      ).id;
      const attacker = world.armies.find((army) => army.country === "germany");
      const defender = world.armies.find((army) => army.country === "poland");
      attacker.province = source.id;
      defender.province = destination;
      attacker.type = defender.type = "infantry";
      attacker.organization = defender.organization = 100;
      world.armies = [attacker, defender];
      world = applyAction(world, {
        type: "move",
        army: attacker.id,
        to: destination,
      }).world;
      for (let day = 0; day < 10 && world.battles.length === 0; day++)
        world = advanceDay(world);
      assert.ok(
        world.battles.length,
        "Battle fixture must contain a live battle",
      );
      await importWorld(world);
      await measure("paused-battle", () =>
        page.waitForTimeout(Math.min(duration, 5000)),
      );
      await page.addStyleTag({
        content: '[data-testid="war-map"] * {animation:none!important}',
      });
      await measure("paused-battle-no-animation", () =>
        page.waitForTimeout(Math.min(duration, 5000)),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: "completed",
        cpuRate: rate,
        artifacts: output,
        pageErrors: errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
