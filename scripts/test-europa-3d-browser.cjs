/* Real WebGL + campaign integration regression. No engine hooks run inside
   the browser. Fixtures are generated outside it and loaded using normal save
   import; commands and observations use the actual UI and manual save.
   Run against a local production build, with Playwright and Chromium installed.
   Optional EUROPA_BASE_URL, EUROPA_CHROMIUM, EUROPA_ARTIFACT_DIR, EUROPA_SKIP_PERF=1. */
const assert = require("node:assert/strict");
const { advanceClockHours } = require("./europa-browser-clock.cjs");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const {
  createWorld,
  addArmy,
  GEOGRAPHY,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-3d";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
mkdirSync(output, { recursive: true });

function fixture() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    country.air.wings = [];
    country.navy.ships = [];
    for (const general of country.generals) delete general.front;
  }
  declareWar(world, "turkey", "bulgaria");
  const origin = "turkey-city-0",
    target = "bulgaria-city-0";
  assert.ok(
    GEOGRAPHY[origin].neighbors.some((edge) => edge.id === target && !edge.sea),
  );
  const armies = Array.from({ length: 3 }, () =>
    addArmy(world, "turkey", origin),
  );
  for (const army of armies) army.organization = 100;
  for (const province of Object.values(world.provinces)) {
    if (!["turkey", "bulgaria"].includes(province.controller)) continue;
    province.buildings.infra = 20;
    province.buildings.rail = 20;
    province.buildings.hub = 20;
  }
  return {
    world: decodeSave(encodeSave(world)),
    origin,
    target,
    ids: armies.map((army) => army.id),
    general: armies[0].general,
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const checks = [],
    pageErrors = [],
    consoleErrors = [],
    consoleDiagnostics = [],
    failedRequests = [],
    performance = [];
  let activePage;
  const passed = (name) => {
    checks.push(name);
    console.log("PASS " + name);
  };
  try {
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 1000 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
      });
      await context.addInitScript(() => {
        window.__renderAuditLongTasks = [];
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__renderAuditLongTasks.push(entry.duration);
              if (window.__renderAuditLongTasks.length > 200)
                window.__renderAuditLongTasks.shift();
            }
          }).observe({ type: "longtask", buffered: true });
        } catch {
          /* Optional browser diagnostic, not a game capability. */
        }
      });
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) =>
        pageErrors.push(`${label}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") {
          consoleErrors.push(`${label}: ${entry.text()}`);
          consoleDiagnostics.push({
            label,
            text: entry.text(),
            location: entry.location(),
          });
        }
      });
      page.on("requestfailed", (request) =>
        failedRequests.push({
          label,
          url: request.url(),
          resourceType: request.resourceType(),
          error: request.failure()?.errorText,
        }),
      );
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const canvas = page.getByTestId("war-map-3d");
      const ready = async () => {
        await canvas.waitFor();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      };
      const pause = async () => {
        const control = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await control.count()) await click(control);
      };
      const closePanel = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
        ]) {
          const close = page.getByRole("button", { name, exact: true });
          if (await close.count()) await click(close);
        }
        const notice = page
          .getByTestId("map-order-notice")
          .getByRole("button", { name: "Bildirimi kapat", exact: true });
        if (await notice.count()) await click(notice);
      };
      const save = async (name) => {
        await pause();
        await closePanel();
        await click(page.locator('button[title="Kayıtlar"]'));
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        const world = await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1"))
              .world,
        );
        decodeSave(
          JSON.stringify({
            format: "xarmy-europa-1936",
            version: world.version,
            world,
          }),
        );
        if (name)
          writeFileSync(
            path.join(output, `${label}-${name}.json`),
            JSON.stringify(world),
          );
        await closePanel();
        return world;
      };
      const load = async (f) => {
        await pause();
        await closePanel();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "3d-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(f.world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await closePanel();
        await ready();
      };
      const focus = async (id) => {
        await closePanel();
        await page
          .getByLabel("Şehir bul", { exact: true })
          .fill(GEOGRAPHY[id].name);
        await click(
          page
            .getByRole("list", { name: "Şehir arama sonuçları" })
            .getByRole("button")
            .filter({ hasText: GEOGRAPHY[id].name })
            .first(),
        );
        await closePanel();
      };
      const point = async (dx = 0, dy = 0) => {
        const box = await canvas.boundingBox();
        assert.ok(box && box.width > 100 && box.height > 100);
        return {
          x: box.x + box.width / 2 + dx,
          y: box.y + box.height / 2 + dy,
        };
      };
      const tapCanvas = async (p, right = false) => {
        if (mobile && !right) await page.touchscreen.tap(p.x, p.y);
        else
          await page.mouse.click(p.x, p.y, {
            button: right ? "right" : "left",
          });
      };

      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await closePanel();
      await ready();
      assert.equal(
        await page
          .getByRole("button", { name: "3D arazi", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      const contextInfo = await canvas.evaluate((element) => {
        const gl = element.getContext("webgl2") || element.getContext("webgl");
        if (!gl) return null;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          version: gl.getParameter(gl.VERSION),
          renderer: ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        };
      });
      assert.ok(contextInfo?.version?.includes("WebGL"));
      passed(`${label}: default 3D scene creates a real WebGL context`);
      await page.screenshot({
        path: path.join(output, `${label}-initial.png`),
      });

      const beforeVisual = await save("before-quality");
      const quality = page.getByRole("combobox", {
        name: "Grafik kalitesi",
        exact: true,
      });
      const qualitySamples = [];
      for (const value of ["low", "medium", "high", "ultra", "medium"]) {
        console.log(`CHECK ${label}: graphics ${value}`);
        await quality.selectOption(value);
        await ready();
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              let frames = 5;
              const sample = () =>
                --frames ? requestAnimationFrame(sample) : resolve();
              requestAnimationFrame(sample);
            }),
        );
        qualitySamples.push(
          await canvas.evaluate((element) => ({
            ...element.dataset,
            bufferWidth: element.width,
            bufferHeight: element.height,
          })),
        );
      }
      writeFileSync(
        path.join(output, `${label}-graphics.json`),
        JSON.stringify({ contextInfo, qualitySamples }, null, 2),
      );
      await click(
        page.getByRole("button", { name: "2D siyasi harita", exact: true }),
      );
      await page.getByTestId("war-map").waitFor();
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await ready();
      assert.deepEqual(
        await save("after-quality"),
        beforeVisual,
        "Presentation and camera settings must not mutate the campaign",
      );
      passed(
        `${label}: all graphics qualities and 2D/3D switching preserve the entire paused campaign`,
      );

      const f = fixture();
      await load(f);
      await focus(f.target);
      await page.screenshot({
        path: path.join(output, `${label}-terrain.png`),
      });
      const selection = page.getByTestId("map3d-selection");
      const selectedText = await selection.textContent();
      let changed = false;
      for (const [dx, dy] of [
        [-80, 15],
        [-110, 45],
        [70, 45],
        [-45, -50],
      ]) {
        await tapCanvas(await point(dx, dy));
        const text = await selection.textContent();
        await closePanel();
        if (text && text !== selectedText) {
          changed = true;
          break;
        }
      }
      assert.ok(
        changed,
        "A real canvas raycast must select another visible land region",
      );
      await tapCanvas(await point());
      await page.waitForFunction(
        (name) =>
          document
            .querySelector('[data-testid="map3d-selection"]')
            ?.textContent.includes(name),
        GEOGRAPHY[f.target].name,
      );
      await closePanel();
      passed(
        `${label}: actual canvas picking selects visible province geometry`,
      );

      if (mobile) {
        const selectedBefore = await selection.textContent();
        const distanceBefore = Number(
          await canvas.getAttribute("data-camera-distance"),
        );
        assert.ok(
          distanceBefore > 0,
          "Renderer exposes actual camera distance for gesture diagnostics",
        );
        const session = await context.newCDPSession(page);
        const center = await point();
        const touches = (spread) => [
          {
            id: 1,
            x: center.x - spread,
            y: center.y + 40,
            radiusX: 4,
            radiusY: 4,
            force: 1,
          },
          {
            id: 2,
            x: center.x + spread,
            y: center.y + 40,
            radiusX: 4,
            radiusY: 4,
            force: 1,
          },
        ];
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: touches(35),
        });
        for (const spread of [45, 60, 80])
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: touches(spread),
          });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await page.waitForFunction(
          (before) =>
            Math.abs(
              Number(
                document.querySelector('[data-testid="war-map-3d"]').dataset
                  .cameraDistance,
              ) - before,
            ) > 1,
          distanceBefore,
        );
        assert.equal(
          await selection.textContent(),
          selectedBefore,
          "Pinch release must not select a province",
        );
        assert.equal(
          await page
            .getByRole("button", {
              name: "Yönetim panelini kapat",
              exact: true,
            })
            .count(),
          0,
        );
        await session.detach();
        await focus(f.target);
        passed(
          "mobile: real two-finger pinch changes camera distance without accidental province selection",
        );
      }

      await click(page.getByTestId(`commander-card-${f.general}`));
      await click(page.getByTestId("commander-deploy"));
      await click(page.getByTestId("commander-target-bulgaria"));
      assert.equal(
        await page.getByTestId("commander-defend").getAttribute("aria-pressed"),
        "true",
      );
      const deployed = await save("commander-3d");
      const general = deployed.countries.turkey.generals.find(
        (g) => g.id === f.general,
      );
      assert.equal(general.front.target, "bulgaria");
      assert.equal(Object.keys(general.front.assignments).length, 3);
      passed(
        `${label}: commander border deployment remains connected to the 3D campaign`,
      );

      // Reload the unassigned fixture so this manual order does not inherit a
      // previous commander route; all selection and movement below are real UI.
      await load(f);
      await focus(f.target);
      const formation = page
        .locator('[data-formation][data-country="turkey"]')
        .first();
      await click(formation);
      if (mobile) {
        await click(
          page.getByRole("button", {
            name: "Haritada hedef seç · 3 tümen",
            exact: true,
          }),
        );
        await closePanel();
        await tapCanvas(await point());
      } else {
        await closePanel();
        await tapCanvas(await point(), true);
      }
      let moved = await save("ordered");
      for (const id of f.ids) {
        const army = moved.armies.find((a) => a.id === id);
        assert.ok(
          army?.route.includes(f.target) || army?.move?.to === f.target,
          `${id} should receive the group order`,
        );
      }
      passed(
        `${label}: ${mobile ? "touch target selection" : "canvas right click"} orders every selected division`,
      );
      for (
        let i = 0;
        i < 16 &&
        !f.ids.every(
          (id) => moved.armies.find((a) => a.id === id)?.province === f.target,
        );
        i++
      ) {
        await advanceClockHours(page, 24);
        moved = await save(`day-${i + 1}`);
      }
      assert.equal(moved.provinces[f.target].controller, "turkey");
      assert.ok(
        f.ids.every(
          (id) => moved.armies.find((a) => a.id === id)?.province === f.target,
        ),
      );
      await focus(f.target);
      await page.screenshot({
        path: path.join(output, `${label}-captured.png`),
      });
      passed(
        `${label}: real simulation advances the ordered group and captures the target city`,
      );

      const producedLine = moved.countries.turkey.production.find(
        (line) => line.equipment === "rifle",
      );
      assert.ok(
        producedLine && producedLine.progress > 0,
        "Daily production should retain paid work below the next whole item",
      );
      await click(page.locator('button[title="Sanayi"]'));
      await page.getByTestId("production-progress-rifle").waitFor();
      assert.match(
        await page.getByTestId("production-progress-rifle").textContent(),
        /Biriken/,
      );
      await click(
        page
          .getByTestId("production-rifle")
          .getByRole("button", { name: /fabrika azalt/ }),
      );
      assert.match(
        await page.getByTestId("production-progress-rifle").textContent(),
        /duraklatıldı/,
      );
      const pausedProduction = await save("paused-production");
      const paidWork = pausedProduction.countries.turkey.production.find(
        (line) => line.equipment === "rifle",
      );
      assert.equal(paidWork.factories, 0);
      assert.equal(paidWork.progress, producedLine.progress);
      await click(page.locator('button[title="Kayıtlar"]'));
      await click(
        page.getByRole("button", { name: "Yükle", exact: true }).first(),
      );
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      assert.deepEqual(await save("restored-production"), pausedProduction);
      await click(page.locator('button[title="Sanayi"]'));
      await click(
        page
          .getByTestId("production-rifle")
          .getByRole("button", { name: /fabrika artır/ }),
      );
      await closePanel();
      passed(
        `${label}: production UI shows accumulated work; pausing and save/load preserve paid progress`,
      );

      performance.push({
        label,
        viewport,
        contextInfo,
        qualitySamples,
        fpsLabel: await page
          .getByRole("button", { name: "3D görüntü ölçümleri", exact: true })
          .textContent(),
        diagnostic: await canvas.evaluate((element) => ({
          ...element.dataset,
        })),
        longTasks: await page.evaluate(() => window.__renderAuditLongTasks),
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (!mobile) {
        await click(page.locator('button[title="Kayıtlar"]'));
        await page
          .getByText("Çevrimdışı kullanıma hazır · bu cihaz", { exact: true })
          .waitFor({ timeout: 60000 });
        const offlineBase = await save("offline-base");
        await context.setOffline(true);
        await page.reload({ waitUntil: "domcontentloaded" });
        await click(page.getByText("Kayıtlı sefere devam et", { exact: true }));
        await click(
          page.getByRole("button", { name: /Türkiye · \d+\. gün/ }).first(),
        );
        await ready();
        assert.deepEqual(await save("offline-restored"), offlineBase);
        const oldDate = await page.getByTestId("game-date").textContent();
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await page.waitForFunction(
          (old) =>
            document.querySelector('[data-testid="game-date"]')?.textContent !==
            old,
          oldDate,
        );
        await pause();
        await closePanel();
        await page.screenshot({
          path: path.join(output, "desktop-offline.png"),
        });
        await context.setOffline(false);
        passed(
          "desktop: cached 3D renderer and simulation resume from a saved campaign offline",
        );
      }
      const beforeLoss = await save("before-context-loss");
      const lost = await canvas.evaluate((element) => {
        const gl = element.getContext("webgl2") || element.getContext("webgl");
        const loss = gl?.getExtension("WEBGL_lose_context");
        if (!loss) return false;
        loss.loseContext();
        return true;
      });
      assert.equal(
        lost,
        true,
        "Test browser must support explicit context-loss simulation",
      );
      await page.getByTestId("war-map").waitFor();
      assert.deepEqual(await save("after-context-loss"), beforeLoss);
      passed(
        `${label}: WebGL context loss falls back to the usable 2D map without losing campaign state`,
      );
      if (!mobile) {
        await page.evaluate(() => {
          const OriginalObserver = window.ResizeObserver;
          const originalGetContext = HTMLCanvasElement.prototype.getContext;
          window.__map3dConstructorAudit = {
            allocated: false,
            released: false,
            threw: false,
          };
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            const result = originalGetContext.call(this, type, ...args);
            if (
              this.dataset.testid === "war-map-3d" &&
              result &&
              (type === "webgl2" || type === "webgl")
            ) {
              window.__map3dConstructorAudit.allocated = true;
              this.addEventListener(
                "webglcontextlost",
                () => {
                  window.__map3dConstructorAudit.released = true;
                },
                { once: true },
              );
            }
            return result;
          };
          window.ResizeObserver = new Proxy(OriginalObserver, {
            construct(target, args) {
              if (
                window.__map3dConstructorAudit.allocated &&
                !window.__map3dConstructorAudit.threw
              ) {
                window.__map3dConstructorAudit.threw = true;
                throw new Error(
                  "Deliberate one-shot renderer construction failure",
                );
              }
              return Reflect.construct(target, args);
            },
          });
          window.__restoreMap3dAudit = () => {
            window.ResizeObserver = OriginalObserver;
            HTMLCanvasElement.prototype.getContext = originalGetContext;
          };
        });
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await page.waitForFunction(
          () => window.__map3dConstructorAudit.released,
        );
        assert.deepEqual(
          await page.evaluate(() => window.__map3dConstructorAudit),
          { allocated: true, released: true, threw: true },
        );
        await page.evaluate(() => window.__restoreMap3dAudit());
        await page.getByTestId("war-map").waitFor();
        assert.deepEqual(await save("after-constructor-failure"), beforeLoss);
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await ready();
        passed(
          "desktop: failed 3D construction releases the allocated WebGL context; campaign survives and 3D can restart",
        );
        if (!process.env.EUROPA_SKIP_PERF) {
          // Short, isolated normal-motion sample. Functional checks use reduced
          // motion so software WebGL cost does not dominate every UI assertion.
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await click(
            page.getByRole("button", { name: "2D siyasi harita", exact: true }),
          );
          await click(
            page.getByRole("button", { name: "3D arazi", exact: true }),
          );
          await ready();
          const session = await context.newCDPSession(page);
          await session.send("Performance.enable");
          const cpuStart = await session.send("Performance.getMetrics");
          const sampleStart = Date.now();
          await page.waitForTimeout(5000);
          const cpuEnd = await session.send("Performance.getMetrics");
          const metric = (sample, name) =>
            sample.metrics.find((m) => m.name === name)?.value ?? 0;
          performance.push({
            label: "desktop-normal-motion",
            sampleMilliseconds: Date.now() - sampleStart,
            mainThreadTaskSeconds:
              metric(cpuEnd, "TaskDuration") - metric(cpuStart, "TaskDuration"),
            javascriptHeapBytes: metric(cpuEnd, "JSHeapUsedSize"),
            fpsLabel: await page
              .getByRole("button", {
                name: "3D görüntü ölçümleri",
                exact: true,
              })
              .textContent(),
            diagnostic: await canvas.evaluate((element) => ({
              ...element.dataset,
            })),
          });
          await session.detach();
        }
      }
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          result: "passed",
          checks,
          pageErrors,
          consoleErrors,
          consoleDiagnostics,
          failedRequests,
          performance,
          rendererNote:
            "Headless Chromium SwiftShader; these measurements do not establish physical device FPS.",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        result: "passed",
        checks,
        pageErrors,
        consoleErrors,
        artifacts: output,
      }),
    );
  } catch (error) {
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        {
          error: String(error),
          checks,
          pageErrors,
          consoleErrors,
          consoleDiagnostics,
          failedRequests,
          performance,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
