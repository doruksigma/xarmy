/* Run against a production server with other CPU-heavy tasks stopped.
   NODE_PATH=<playwright modules> node scripts/test-europa-responsiveness.cjs
   Optional: EUROPA_CPU_RATE=4, EUROPA_PROFILE=1, EUROPA_DURATION_MS=10000,
   EUROPA_PHASES=startup,pan,camera,army,saves,initial,large,battle,
   EUROPA_SAVE_FIXTURE=<save/world>, EUROPA_INSTRUMENT=1, EUROPA_MOBILE=1.
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
const instrumenting = process.env.EUROPA_INSTRUMENT === "1";
const mobile = process.env.EUROPA_MOBILE === "1";
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
    JSON.stringify({ cpuRate: rate, mobile, results }, null, 2),
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
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      ...(mobile
        ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : {}),
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((instrumenting) => {
      window.__responsiveness = { longtasks: [], frames: [], recording: false };
      new PerformanceObserver((list) => {
        window.__responsiveness.longtasks.push(
          ...list.getEntries().map((entry) => ({
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
      if (instrumenting) {
        window.__responsiveness.operations = [];
        const wrap = (object, key, name) => {
          const original = object[key];
          object[key] = function (...args) {
            const start = performance.now();
            const result = original.apply(this, args);
            if (window.__responsiveness.recording)
              window.__responsiveness.operations.push({
                name,
                duration: performance.now() - start,
                characters: typeof result === "string" ? result.length : 0,
              });
            return result;
          };
        };
        wrap(JSON, "parse", "JSON.parse");
        wrap(JSON, "stringify", "JSON.stringify");
        wrap(window, "structuredClone", "structuredClone");
        wrap(Storage.prototype, "getItem", "Storage.getItem");
        wrap(Storage.prototype, "setItem", "Storage.setItem");
        wrap(Worker.prototype, "postMessage", "Worker.postMessage");
      }
    }, instrumenting);
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
        window.__responsiveness.operations = [];
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
      const operations = {};
      for (const operation of observed.operations || []) {
        const summary = (operations[operation.name] ||= {
          count: 0,
          totalMs: 0,
          maxMs: 0,
          characters: 0,
        });
        summary.count++;
        summary.totalMs += operation.duration;
        summary.maxMs = Math.max(summary.maxMs, operation.duration);
        summary.characters += operation.characters;
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
        rendererMemory: {
          jsHeapBytes: after.JSHeapUsedSize,
          domNodes: after.Nodes,
          eventListeners: after.JSEventListeners,
        },
        ...(trace ? { traceMs: trace } : {}),
        ...(instrumenting ? { operations } : {}),
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
    if (phases.has("camera")) {
      if (mobile) {
        const closePanel = page.getByRole("button", {
          name: "Yönetim panelini kapat",
          exact: true,
        });
        if (await closePanel.isVisible()) await closePanel.click();
      }
      const map = page.locator('[data-testid="war-map"]');
      const camera = () =>
        map.evaluate((element) => {
          const { x, y, width, height } = element.viewBox.baseVal;
          return { x, y, width, height };
        });
      const settle = () => page.waitForTimeout(450);
      const focus = async () => {
        await page
          .getByRole("button", { name: "Başkentime git", exact: true })
          .click();
        await settle();
      };
      await focus();
      await measure("pointer-pan", async () => {
        const initial = await camera();
        const box = await map.boundingBox();
        assert.ok(box, "The map must have a viewport");
        const x = box.x + box.width * 0.55;
        const y = box.y + box.height * 0.55;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 130, y + 70, { steps: 30 });
        await page.mouse.up();
        await settle();
        const final = await camera();
        assert.ok(
          final.x < initial.x,
          "Dragging right must move the camera west",
        );
        assert.ok(
          final.y < initial.y,
          "Dragging down must move the camera north",
        );
        return { initial, final };
      });
      await focus();
      await measure("touch-pan", async () => {
        const initial = await camera();
        const box = await map.boundingBox();
        const x = box.x + box.width * 0.4,
          y = box.y + box.height * 0.4;
        const dx = Math.min(100, box.width * 0.22),
          dy = Math.min(80, box.height * 0.18);
        const point = (fraction) => [
          {
            id: 1,
            x: x + dx * fraction,
            y: y + dy * fraction,
            radiusX: 5,
            radiusY: 5,
          },
        ];
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: point(0),
        });
        for (let step = 1; step <= 30; step++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: point(step / 30),
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await settle();
        const final = await camera();
        assert.ok(
          final.x < initial.x && final.y < initial.y,
          "Dragging a touch right/down must move the viewport west/north",
        );
        return { initial, final, svgNodes: await map.locator("*").count() };
      });
      await focus();
      await measure("wheel-zoom", async () => {
        const initial = await camera();
        const box = await map.boundingBox();
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const worldPoint = () =>
          map.evaluate((element, p) => {
            const projected = new DOMPoint(p.x, p.y).matrixTransform(
              element.getScreenCTM().inverse(),
            );
            return { x: projected.x, y: projected.y };
          }, point);
        const anchor = await worldPoint();
        await page.mouse.move(point.x, point.y);
        for (let step = 0; step < 6; step++) await page.mouse.wheel(0, -35);
        await settle();
        const final = await camera();
        const finalAnchor = await worldPoint();
        assert.ok(final.width < initial.width, "Wheel up must zoom in");
        assert.ok(
          Math.hypot(finalAnchor.x - anchor.x, finalAnchor.y - anchor.y) < 2,
          "Wheel zoom must retain the world point beneath the cursor",
        );
        return { initial, final, anchor, finalAnchor };
      });
      await focus();
      await measure("touch-pinch", async () => {
        const initial = await camera();
        const box = await map.boundingBox();
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        const points = (spread) => [
          { id: 1, x: x - spread, y, radiusX: 5, radiusY: 5 },
          { id: 2, x: x + spread, y, radiusX: 5, radiusY: 5 },
        ];
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: points(55),
        });
        for (let step = 1; step <= 12; step++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: points(55 + step * 4),
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await settle();
        const final = await camera();
        assert.ok(
          final.width < initial.width,
          "Spreading two touches must zoom in",
        );
        return { initial, final };
      });
      await measure("minimap-navigation", async () => {
        const initial = await camera();
        const minimap = page.getByRole("button", {
          name: "Küçük haritada konuma git",
          exact: true,
        });
        const box = await minimap.boundingBox();
        await minimap.click({
          position: { x: box.width * 0.35, y: box.height * 0.45 },
        });
        await settle();
        const final = await camera();
        assert.ok(
          Math.hypot(final.x - initial.x, final.y - initial.y) > 20,
          "Clicking the minimap must move the viewport",
        );
        await minimap.press("Enter");
        await settle();
        const capital = await camera();
        assert.ok(
          Math.hypot(capital.x - final.x, capital.y - final.y) > 20,
          "Minimap keyboard activation must return to the capital",
        );
        return { initial, final, capital };
      });
      if (!mobile)
        await measure("province-hover", async () => {
          const points = await map.evaluate(
            (element, provinces) => {
              const matrix = element.getScreenCTM();
              const viewport = element.getBoundingClientRect();
              return provinces
                .flatMap((province) => {
                  const point = new DOMPoint(
                    province.x,
                    province.y,
                  ).matrixTransform(matrix);
                  if (
                    point.x <= viewport.left ||
                    point.x >= viewport.right ||
                    point.y <= viewport.top ||
                    point.y >= viewport.bottom
                  )
                    return [];
                  const hit = document
                    .elementFromPoint(point.x, point.y)
                    ?.closest("[data-province]");
                  return hit ? [{ x: point.x, y: point.y }] : [];
                })
                .slice(0, 20);
            },
            Object.values(GEOGRAPHY).map(({ x, y }) => ({ x, y })),
          );
          assert.ok(
            points.length > 1,
            "Hover probe needs multiple visible province targets",
          );
          for (const point of points) {
            await page.mouse.move(point.x, point.y);
            await page.waitForTimeout(20);
          }
          await page.mouse.move(5, 5);
          return { visibleProvinceTargets: points.length };
        });
      await page.screenshot({ path: path.join(output, "camera.png") });
    }
    async function importWorld(world) {
      const encoded = encodeSave(world);
      decodeSave(encoded); // Fixtures must satisfy the normal game save validator.
      await page.locator('button[title="Kayıtlar"]').click();
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
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
    if (phases.has("army") || phases.has("saves")) {
      const world = createWorld("turkey", "historical", 1936, "normal");
      const ownCount = Number(process.env.EUROPA_OWN_ARMIES || 1200);
      let own = world.armies.filter(
        (army) => army.country === world.player,
      ).length;
      while (own++ < ownCount)
        addArmy(world, world.player, world.countries[world.player].capital);
      world.day = 13;
      await importWorld(world);
      if (phases.has("army")) {
        await measure("army-tab", async () => {
          await page.locator('button[title="Ordu"]').click();
          return {
            ownArmies: ownCount,
            domNodes: await page.locator("*").count(),
            mountedCheckboxes: await page.getByRole("checkbox").count(),
          };
        });
        await measure("army-select-all", async () => {
          await page
            .getByRole("button", { name: "Tüm tümenleri seç", exact: true })
            .first()
            .click();
          const selection = await page
            .locator('[data-testid="army-selection-count"]')
            .textContent();
          assert.ok(
            selection.includes(String(ownCount)),
            "Select all must include every unit, including unmounted rows",
          );
          return {
            ownArmies: ownCount,
            selection,
            domNodes: await page.locator("*").count(),
          };
        });
        await importWorld(world);
      }
      if (phases.has("saves")) {
        await page.locator('button[title="Kayıtlar"]').click();
        await measure("save-three-large-slots", async () => {
          const buttons = page.getByRole("button", {
            name: "Bu yuvaya kaydet",
            exact: true,
          });
          for (let index = 0; index < 3; index++)
            await buttons.nth(index).click();
          return {
            ownArmies: ownCount,
            saveCharacters: encodeSave(world).length,
          };
        });
        await page.locator('button[title="Komuta"]').click();
        await page
          .getByRole("button", { name: "5 kat hız", exact: true })
          .click();
        const date = await page
          .locator('[data-testid="game-date"]')
          .textContent();
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .click();
        await page.waitForFunction(
          (date) =>
            document.querySelector('[data-testid="game-date"]').textContent !==
            date,
          date,
        );
        await page
          .getByRole("button", { name: "Zamanı duraklat", exact: true })
          .click();
        world.day = 27;
        await importWorld(world);
        await page
          .getByRole("button", { name: "5 kat hız", exact: true })
          .click();
        await page.locator('button[title="Kayıtlar"]').click();
        await measure("filled-saves-running", async () => {
          const initialDate = await page
            .locator('[data-testid="game-date"]')
            .textContent();
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
            "Campaign with filled saves must advance",
          );
          const savedSlots = await page.evaluate(
            () =>
              Object.keys(localStorage).filter((key) =>
                key.startsWith("xarmy-europa-1936-v1:"),
              ).length,
          );
          assert.equal(
            savedSlots,
            5,
            "Manual saves and both alternating autosaves must exist",
          );
          return { initialDate, finalDate, savedSlots, ownArmies: ownCount };
        });
      }
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
        mobile,
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
