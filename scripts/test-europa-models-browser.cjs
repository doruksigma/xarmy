/* Focused production-browser regression for actual 3D soldiers, scenery and
   supply-rail trains. Browser observations use rendered diagnostics and UI
   saves; fixture generation is outside the browser. No engine hooks.
   Optional EUROPA_BASE_URL, EUROPA_CHROMIUM, EUROPA_ARTIFACT_DIR. */
const assert = require("node:assert/strict");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
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
  dateLabel,
  MAP,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-models";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
mkdirSync(output, { recursive: true });
function fixture() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  world.armies = [];
  for (const c of Object.values(world.countries)) {
    c.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    c.air.wings = [];
    c.navy.ships = [];
    for (const general of c.generals) delete general.front;
  }
  declareWar(world, "turkey", "bulgaria");
  for (const p of Object.values(world.provinces)) {
    p.buildings.rail = 0;
    p.damage = 0;
  }
  const capital = world.countries.turkey.capital;
  const railNeighbor = "turkey-city-16";
  assert.ok(
    GEOGRAPHY[capital].neighbors.some((e) => e.id === railNeighbor && !e.sea),
  );
  world.provinces[capital].buildings.rail = 2;
  world.provinces[railNeighbor].buildings.rail = 2;
  const origin = "turkey-city-0",
    target = "bulgaria-city-0";
  const group = Array.from({ length: 3 }, () =>
    addArmy(world, "turkey", origin),
  );
  addArmy(world, "turkey", capital, "lightTank");
  addArmy(world, "turkey", capital, "infantry");
  for (const a of world.armies) a.organization = 100;
  return {
    world: decodeSave(encodeSave(world)),
    capital,
    railNeighbor,
    origin,
    target,
    ids: group.map((a) => a.id),
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
    failedRequests = [],
    samples = [];
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
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(30000);
      page.on("pageerror", (e) =>
        pageErrors.push({ label, message: e.message }),
      );
      page.on("console", (e) => {
        if (e.type() === "error")
          consoleErrors.push({
            label,
            message: e.text(),
            location: e.location(),
          });
      });
      page.on("requestfailed", (r) =>
        failedRequests.push({
          label,
          url: r.url(),
          error: r.failure()?.errorText,
        }),
      );
      const click = (l) => (mobile ? l.tap() : l.click());
      const canvas = page.getByTestId("war-map-3d");
      const ready = () =>
        page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      const stats = () =>
        canvas.evaluate((el) => ({
          ...el.dataset,
          trainPositions: JSON.parse(el.dataset.trainPositions || "[]"),
          trainCountries: JSON.parse(el.dataset.trainCountries || "[]"),
        }));
      const pause = async () => {
        const b = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await b.count()) await click(b);
      };
      const close = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
        ]) {
          const b = page.getByRole("button", { name, exact: true });
          if (await b.count()) await click(b);
        }
        const notice = page
          .getByTestId("map-order-notice")
          .getByRole("button", { name: "Bildirimi kapat", exact: true });
        if (await notice.count()) await click(notice);
      };
      const save = async (name) => {
        await pause();
        await close();
        await click(page.locator('button[title="Kayıtlar"]'));
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        const w = await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1"))
              .world,
        );
        decodeSave(
          JSON.stringify({ format: "xarmy-europa-1936", version: 2, world: w }),
        );
        if (name)
          writeFileSync(
            path.join(output, label + "-" + name + ".json"),
            JSON.stringify(w),
          );
        await close();
        return w;
      };
      const load = async (f) => {
        await pause();
        await close();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "model-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(f.world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await close();
        await ready();
      };
      const focus = async (id, zoom = 0) => {
        await close();
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
        await close();
        for (let i = 0; i < zoom; i++)
          await click(
            page.getByRole("button", {
              name: "Haritayı yakınlaştır",
              exact: true,
            }),
          );
        if (zoom >= 4)
          await page.waitForFunction(
            () =>
              Number(
                document.querySelector('[data-testid="war-map-3d"]').dataset
                  .cameraDistance,
              ) < 85,
          );
        await ready();
      };
      const screenshot = async (name) =>
        page.screenshot({
          path: path.join(output, label + "-" + name + ".png"),
        });
      await page.goto(base + "/games/europa-war", {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await close();
      await ready();
      const f = fixture();
      const capitalFixture = structuredClone(f);
      capitalFixture.world.armies = capitalFixture.world.armies.filter(
        (a) => a.province === f.capital,
      );
      const borderFixture = structuredClone(f);
      borderFixture.world.armies = borderFixture.world.armies.filter(
        (a) => a.province === f.origin,
      );
      writeFileSync(
        path.join(output, label + "-fixture-metadata.json"),
        JSON.stringify(
          { capital: f.capital, railNeighbor: f.railNeighbor, group: f.ids },
          null,
          2,
        ),
      );
      await load(capitalFixture);
      await focus(f.capital, 4);
      await screenshot("ankara-close");
      const near = await stats();
      assert.equal(
        Number(near.railEdges),
        1,
        "Only the two equipped adjacent capital provinces form a supply rail edge",
      );
      assert.equal(
        Number(near.trainCount),
        1,
        "Exactly one actual locomotive is rendered for the isolated supply route",
      );
      assert.equal(near.trainPositions.length, 1);
      assert.ok(
        Number(near.unitInstances) >= 2,
        "Near capital must render both infantry and tank instances",
      );
      assert.equal(Number(near.infantryModels), 1);
      assert.equal(Number(near.vehicleModels), 1);
      assert.equal(near.modelDetail, "true");
      samples.push({ label, view: "capital-close", ...near });
      await load(borderFixture);
      await focus(f.origin, 4);
      await screenshot("infantry-close");
      assert.ok(
        Number((await stats()).infantryModels) === 3,
        "Three near infantry divisions must render together",
      );
      passed(
        label +
          ": close-up infantry, tank, detailed scenery and one real supply train render in WebGL",
      );
      const beforeQuality = await save("before-quality");
      for (const value of ["low", "medium", "high", "ultra", "low"]) {
        await page
          .getByRole("combobox", { name: "Grafik kalitesi", exact: true })
          .selectOption(value);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const sample = await stats();
        assert.ok(
          Number(sample.drawCalls) > 0 && Number(sample.drawCalls) < 180,
          "Instanced model/rail draw calls must remain bounded",
        );
        assert.ok(
          Number(sample.triangles) < 800000,
          "Procedural detail remains within the intended scene budget",
        );
        samples.push({ label, view: "quality-" + value, ...sample });
      }
      assert.deepEqual(
        await save("after-quality"),
        beforeQuality,
        "Changing model detail cannot mutate the simulation",
      );
      passed(
        label +
          ": all quality levels preserve the world and keep model rendering bounded",
      );
      if (!mobile) {
        await load(capitalFixture);
        // Recreate via public view controls so matchMedia is read as normal motion.
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await click(
          page.getByRole("button", { name: "2D siyasi harita", exact: true }),
        );
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await ready();
        await focus(f.capital, 4);
        const pausedWorld = await save("ambient-paused-before");
        const pausedDate = await page.getByTestId("game-date").textContent();
        await page.waitForTimeout(350);
        const ambientStart = await stats();
        const waitForTrainMovement = (positions) =>
          page.waitForFunction((before) => {
            const d = document.querySelector(
              '[data-testid="war-map-3d"]',
            )?.dataset;
            return (
              d &&
              JSON.stringify(JSON.parse(d.trainPositions || "[]")) !== before
            );
          }, JSON.stringify(positions));
        await waitForTrainMovement(ambientStart.trainPositions);
        const ambientMiddle = await stats();
        await page.waitForTimeout(1100);
        const ambientEnd = await stats();
        assert.notDeepEqual(
          ambientEnd.trainPositions,
          ambientMiddle.trainPositions,
          "Low-quality paused trains must keep moving without new UI interactions",
        );
        assert.ok(
          Number(ambientEnd.renderedFrames) >
            Number(ambientStart.renderedFrames) + 1,
        );
        assert.doesNotMatch(
          await page
            .getByRole("button", { name: "3D görüntü ölçümleri", exact: true })
            .textContent(),
          /Durağan/,
        );
        assert.equal(
          await page.getByTestId("game-date").textContent(),
          pausedDate,
        );
        assert.deepEqual(
          await save("ambient-paused-after"),
          pausedWorld,
          "Ambient trains must not change any campaign state while paused",
        );
        await screenshot("ambient-train-paused");
        samples.push({
          label,
          view: "ambient-paused-low",
          before: ambientStart,
          after: ambientEnd,
        });
        passed(
          "desktop: Low-quality trains move continuously while paused without advancing or mutating the campaign",
        );

        const trainStart = (await stats()).trainPositions;
        const oldDay = await page.getByTestId("game-date").textContent();
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await waitForTrainMovement(trainStart);
        await page.waitForFunction(
          (old) =>
            document.querySelector('[data-testid="game-date"]')?.textContent !==
            old,
          oldDay,
        );
        await pause();
        const advanced = await save("train-running");
        assert.ok(advanced.day > pausedWorld.day);
        passed(
          "desktop: trains also move while the actual simulation clock advances",
        );

        // Reduced-motion remains the explicit accessibility exception. Recreate
        // through public view controls so constructor-time media settings apply.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await click(
          page.getByRole("button", { name: "2D siyasi harita", exact: true }),
        );
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await ready();
        await focus(f.capital, 4);
        await page.waitForTimeout(350);
        const stopped = await stats();
        await page.waitForTimeout(1200);
        const stillStopped = await stats();
        assert.deepEqual(stillStopped.trainPositions, stopped.trainPositions);
        assert.equal(
          stillStopped.renderedFrames,
          stopped.renderedFrames,
          "Reduced-motion paused scene should stop drawing after it settles",
        );
        passed(
          "desktop: reduced-motion freezes train positions and settles to on-demand rendering",
        );

        // Keep the train isolated from army miniatures for a readable asset
        // review; units are preserved and exercised in the other fixtures.
        const trainOnly = structuredClone(capitalFixture);
        trainOnly.world.armies = [];
        await load(trainOnly);
        await focus(f.capital, 4);
        await screenshot("train-close");
        samples.push({
          label,
          view: "isolated-train-close",
          ...(await stats()),
        });

        const wholeCountry = structuredClone(f);
        for (const province of Object.values(wholeCountry.world.provinces))
          province.buildings.rail = province.controller === "turkey" ? 2 : 0;
        await load(wholeCountry);
        await click(
          page.getByRole("button", { name: "Başkentime git", exact: true }),
        );
        await page.waitForFunction(
          () =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .cameraDistance,
            ) > 300,
        );
        const network = await stats();
        assert.ok(Number(network.railEdges) > 1);
        assert.ok(Number(network.trainCount) > 0);
        await screenshot("country-rail-network");
        samples.push({ label, view: "country-rail-network", ...network });
        passed(
          "desktop: the actual capital-connected country rail network renders multiple links and trains",
        );

        const foreignWorld = structuredClone(f);
        const startingWorld = createWorld(
          "turkey",
          "historical",
          1936,
          "normal",
        );
        for (const province of Object.values(foreignWorld.world.provinces))
          province.buildings.rail =
            startingWorld.provinces[province.id].buildings.rail;
        await load(foreignWorld);
        await page
          .getByRole("combobox", { name: "Grafik kalitesi", exact: true })
          .selectOption("high");
        const beforeForeignViews = await save("foreign-before");
        for (const country of ["germany", "france"]) {
          const capital = foreignWorld.world.countries[country].capital;
          await focus(capital);
          for (let i = 0; i < 2; i++)
            await click(
              page.getByRole("button", {
                name: "Haritayı uzaklaştır",
                exact: true,
              }),
            );
          await page.waitForFunction(
            () =>
              Number(
                document.querySelector('[data-testid="war-map-3d"]')?.dataset
                  .cameraDistance,
              ) > 350,
          );
          await page.waitForFunction(
            (country) =>
              JSON.parse(
                document.querySelector('[data-testid="war-map-3d"]')?.dataset
                  .trainCountries || "[]",
              ).includes(country),
            country,
          );
          const foreign = await stats();
          assert.equal(
            foreign.trainPositions.length,
            foreign.trainCountries.length,
          );
          assert.ok(Number(foreign.railEdges) > 1);
          const index = foreign.trainCountries.indexOf(country);
          assert.ok(index >= 0 && country !== foreignWorld.world.player);
          const locomotive = foreign.trainPositions[index];
          const mapX = locomotive.x + MAP.width / 2,
            mapY = locomotive.z + MAP.height / 2;
          assert.ok(
            Math.hypot(
              mapX - GEOGRAPHY[capital].x,
              mapY - GEOGRAPHY[capital].y,
            ) < 450,
            "The rendered foreign locomotive must actually be near the requested country's view",
          );
          await screenshot(`${country}-rail-network`);
          samples.push({ label, view: `${country}-rail-network`, ...foreign });
          const nearest = Object.values(foreignWorld.world.provinces)
            .filter((p) => p.controller === country)
            .sort(
              (a, b) =>
                Math.hypot(GEOGRAPHY[a.id].x - mapX, GEOGRAPHY[a.id].y - mapY) -
                Math.hypot(GEOGRAPHY[b.id].x - mapX, GEOGRAPHY[b.id].y - mapY),
            )[0];
          await focus(nearest.id, 1);
          await page.waitForFunction(
            (country) =>
              JSON.parse(
                document.querySelector('[data-testid="war-map-3d"]')?.dataset
                  .trainCountries || "[]",
              ).includes(country),
            country,
          );
          await screenshot(`${country}-train-close`);
        }
        await focus(f.capital, 4);
        const returnedArmies = await stats();
        assert.ok(Number(returnedArmies.infantryModels) >= 1);
        assert.equal(Number(returnedArmies.vehicleModels), 1);
        await screenshot("armies-after-foreign-pan");
        assert.deepEqual(
          await save("foreign-after"),
          beforeForeignViews,
          "Panning to foreign trains cannot alter the country's armies or any campaign state",
        );
        passed(
          "desktop: actual German and French locomotives and rail networks render when panning abroad, preserving all armies and the full world",
        );
        await page
          .getByRole("combobox", { name: "Grafik kalitesi", exact: true })
          .selectOption("low");
        const cut = structuredClone(capitalFixture);
        cut.world.provinces[f.capital].buildings.rail = 0;
        cut.world.provinces[f.railNeighbor].buildings.rail = 0;
        await load(cut);
        await focus(f.capital, 4);
        let state = await stats();
        assert.equal(Number(state.railEdges), 0);
        assert.equal(Number(state.trainCount), 0);
        assert.deepEqual(state.trainPositions, []);
        await screenshot("rail-cut");
        const occupied = structuredClone(capitalFixture);
        occupied.world.provinces[f.capital].controller = "bulgaria";
        await load(occupied);
        await focus(f.capital, 4);
        state = await stats();
        assert.equal(Number(state.railEdges), 0);
        assert.equal(Number(state.trainCount), 0);
        passed(
          "desktop: removing rail facilities or enemy capital occupation removes the unsupported train network",
        );
      }
      await load(f);
      await focus(f.target);
      await click(
        page.locator('[data-formation^="turkey:' + f.origin + ':"]').first(),
      );
      if (mobile) {
        await click(
          page.getByRole("button", {
            name: "Haritada hedef seç · 3 tümen",
            exact: true,
          }),
        );
        await close();
      } else await close();
      const box = await canvas.boundingBox();
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      if (mobile) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y, { button: "right" });
      let moved = await save("ordered");
      for (const id of f.ids) {
        const a = moved.armies.find((a) => a.id === id);
        assert.ok(
          a.route.includes(f.target) || a.move?.to === f.target,
          "All selected divisions keep their tactical order with the new models",
        );
      }
      for (
        let i = 0;
        i < 12 &&
        !f.ids.every(
          (id) => moved.armies.find((a) => a.id === id)?.province === f.target,
        );
        i++
      ) {
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await page.waitForFunction(
          (old) =>
            document.querySelector('[data-testid="game-date"]')?.textContent !==
            old,
          dateLabel(moved.day),
        );
        await pause();
        moved = await save();
      }
      assert.equal(moved.provinces[f.target].controller, "turkey");
      assert.ok(
        f.ids.every(
          (id) => moved.armies.find((a) => a.id === id)?.province === f.target,
        ),
      );
      await focus(f.target, 4);
      assert.ok(Number((await stats()).infantryModels) >= 3);
      await screenshot("group-captured");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      passed(
        label +
          ": all three divisions still move together, capture the target and fit the responsive layout",
      );
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
          failedRequests,
          samples,
          rendererNote:
            "Actual headless Chromium WebGL via SwiftShader; mobile is touch emulation, not a physical-device benchmark.",
          hiddenTabValidation:
            "Not verified: native headless tabs remain document.visibilityState=visible. No synthetic visibility overrides are used.",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({ result: "passed", checks, artifacts: output }),
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
          failedRequests,
          samples,
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
