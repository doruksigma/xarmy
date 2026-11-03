/* Night atlas regression using real WebGL/SVG and public UI only.
   Run against a production localhost server. Optional EUROPA_DEVICE=desktop|mobile,
   EUROPA_BASE_URL, EUROPA_CHROMIUM and EUROPA_ARTIFACT_DIR. Fixtures are generated
   outside the browser and imported as normal saves; no game engine hooks. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
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
const {
  createWorld,
  GEOGRAPHY,
} = require("../app/games/europa-war/strategy/world.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const { worldHour } = require("../app/games/europa-war/strategy/time.ts");
const {
  politicalCountryColor,
} = require("../app/games/europa-war/strategy/map3d-cartography-palette.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/workspace/scratch/europa-night-browser";
const requestedDevice = process.env.EUROPA_DEVICE;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
assert.ok(!requestedDevice || ["desktop", "mobile"].includes(requestedDevice));
fs.mkdirSync(output, { recursive: true });
function fixture() {
  const world = createWorld("turkey", "historical", 1936, "easy");
  world.hour = 10;
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
  for (const province of Object.values(world.provinces)) {
    province.buildings.rail = 0;
    province.damage = 0;
  }
  const capital = world.countries.turkey.capital;
  const neighbor = "turkey-city-16";
  assert.ok(
    GEOGRAPHY[capital].neighbors.some(
      (edge) => edge.id === neighbor && !edge.sea,
    ),
  );
  for (const id of [capital, neighbor]) {
    world.provinces[id].buildings.rail = 2;
    world.provinces[id].buildings.infra = 5;
  }
  return { world: decodeSave(encodeSave(world)), capital, neighbor };
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
    errors = [],
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
    ].filter(([device]) => !requestedDevice || requestedDevice === device)) {
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(60000);
      page.on("pageerror", (error) =>
        errors.push({ label, message: error.message }),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error")
          errors.push({
            label,
            message: entry.text(),
            location: entry.location(),
          });
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const canvas = page.getByTestId("war-map-3d");
      const stats = () =>
        canvas.evaluate((element) => ({ ...element.dataset }));
      const ready = () =>
        page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      const renderAfter = (frame) =>
        page.waitForFunction(
          (before) =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .renderedFrames,
            ) > before,
          frame,
        );
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.count()) await click(button);
      };
      const closePanel = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
        ]) {
          const button = page.getByRole("button", { name, exact: true });
          if (await button.count()) await click(button);
        }
      };
      const save = async () => {
        await pause();
        await closePanel();
        await click(page.locator('button[title="Kayıtlar"]'));
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
        await closePanel();
        return world;
      };
      const load = async (world) => {
        await pause();
        await closePanel();
        const previous = await canvas.elementHandle();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page
          .getByLabel("Sefer kayıt dosyası")
          .setInputFiles({
            name: "night-atlas.json",
            mimeType: "application/json",
            buffer: Buffer.from(encodeSave(world)),
          });
        await page.waitForFunction((element) => !element.isConnected, previous);
        await previous.dispose();
        await page.waitForFunction(
          (hour) =>
            Number(
              document
                .querySelector('[data-testid="game-date"]')
                ?.getAttribute("data-game-hour"),
            ) === hour,
          worldHour(world),
        );
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await closePanel();
        await ready();
      };
      const settleCamera = async () => {
        let previous = NaN;
        for (let attempt = 0; attempt < 60; attempt++) {
          await page.waitForTimeout(150);
          const distance = Number((await stats()).cameraDistance);
          if (
            Number.isFinite(previous) &&
            Math.abs(distance - previous) < 0.001
          )
            return distance;
          previous = distance;
        }
        throw new Error("Camera did not settle");
      };
      const screenshot = async (name) => {
        // Each call follows a successful renderAfter, so a resized drawing
        // buffer has actually been redrawn before Chromium captures it.
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await page.screenshot({
          path: path.join(output, `${label}-${name}.png`),
        });
        console.log(`SCREENSHOT ${label}-${name}.png`);
      };
      const focus = async (id, is3D = true) => {
        await closePanel();
        const frame = is3D ? Number((await stats()).renderedFrames) : 0;
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
        if (is3D) {
          await renderAfter(frame);
          await settleCamera();
        }
      };
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await closePanel();
      await ready();
      await pause();
      await page
        .getByLabel("Grafik kalitesi", { exact: true })
        .selectOption("low");
      const f = fixture();
      await load(f.world);
      const initial = await stats();
      assert.equal(initial.atlasStyle, "night");
      assert.ok(
        Number(initial.renderedFrames) > 0 && Number(initial.drawCalls) > 0,
      );
      const lights = JSON.parse(initial.nightCityLights);
      assert.ok(
        lights.cities > 0 &&
          lights.capitalCount > 0 &&
          lights.lights >= lights.cities,
      );
      assert.equal(
        lights.drawCalls,
        1,
        "All city lights must share one instanced draw call",
      );
      passed(
        `${label}: real WebGL night atlas and bounded city-light batch render`,
      );

      let frame = Number((await stats()).renderedFrames);
      await click(
        page.getByRole("button", { name: "Tüm haritayı göster", exact: true }),
      );
      await renderAfter(frame);
      const mapBox = await canvas.boundingBox();
      const fitDistance = mapBox.width / mapBox.height < 0.8 ? 1550 : 1100;
      await page.waitForFunction(
        (distance) =>
          Math.abs(
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .cameraDistance,
            ) - distance,
          ) < 0.01,
        fitDistance,
      );
      await settleCamera();
      assert.equal(
        Number((await stats()).trainCount),
        0,
        "Continental LOD hides detailed trains",
      );
      const labels = await page
        .locator(".map3d-country-label[data-map-country]")
        .evaluateAll((elements) =>
          elements
            .filter((element) => getComputedStyle(element).display !== "none")
            .map((element) => ({
              country: element.dataset.mapCountry,
              angle: Number(element.dataset.angle),
              text: element.textContent,
              events: getComputedStyle(element).pointerEvents,
            })),
        );
      assert.ok(
        labels.length >= (mobile ? 3 : 6),
        "Country names must remain visible at continental zoom",
      );
      if (!mobile) {
        for (const country of ["france", "germany"])
          assert.ok(
            labels.some((entry) => entry.country === country),
            `${country} must remain visible beside other continental labels`,
          );
      }
      assert.ok(
        labels.some((entry) => Math.abs(entry.angle) > 5),
        "Elongated countries must visibly rotate their names",
      );
      assert.ok(
        labels.every(
          (entry) =>
            entry.events === "none" &&
            entry.text === entry.text.toLocaleUpperCase("tr-TR"),
        ),
      );
      await screenshot("continental-night");
      samples.push({ label, view: "continental", labels, ...(await stats()) });
      passed(
        `${label}: public Fit renders rotated geographic country names and hides close-detail trains`,
      );

      await focus(f.world.countries.germany.capital);
      for (let zoom = 0; zoom < 2; zoom++) {
        frame = Number((await stats()).renderedFrames);
        await click(
          page.getByRole("button", {
            name: "Haritayı uzaklaştır",
            exact: true,
          }),
        );
        await renderAfter(frame);
      }
      await settleCamera();
      await screenshot("central-europe-night");

      const qualitySamples = [];
      for (const quality of ["high", "low"]) {
        frame = Number((await stats()).renderedFrames);
        await page
          .getByLabel("Grafik kalitesi", { exact: true })
          .selectOption(quality);
        await page.waitForFunction(
          (value) =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .quality === value,
          quality,
        );
        await renderAfter(frame);
        qualitySamples.push({
          quality,
          ...JSON.parse((await stats()).nightCityLights),
        });
      }
      assert.ok(qualitySamples[0].lights > qualitySamples[1].lights);
      assert.ok(
        qualitySamples.every(
          (sample) => sample.drawCalls === 1 && sample.cities === lights.cities,
        ),
      );
      samples.push({ label, qualitySamples });
      passed(
        `${label}: High/Low changes city-light density without adding draw calls`,
      );

      await focus(f.capital);
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .trainCount,
          ) > 0,
      );
      const nearby = await stats();
      assert.ok(Number(nearby.railEdges) > 0);
      assert.deepEqual(JSON.parse(nearby.trainCountries), ["turkey"]);
      assert.ok(
        JSON.parse(nearby.railProvinces).every(
          (id) => f.world.provinces[id].controller === "turkey",
        ),
      );
      await screenshot("ankara-night");
      samples.push({ label, view: "ankara", ...nearby });
      passed(
        `${label}: public Ankara search restores connected player trains after continental LOD`,
      );

      frame = Number((await stats()).renderedFrames);
      await page
        .getByLabel("Animasyonlar", { exact: true })
        .selectOption("full");
      await renderAfter(frame);
      const date = await page.getByTestId("game-date").textContent();
      const positions = (await stats()).trainPositions;
      await page.waitForFunction((before) => {
        const d = document.querySelector('[data-testid="war-map-3d"]')?.dataset;
        return d && Number(d.trainCount) > 0 && d.trainPositions !== before;
      }, positions);
      assert.equal(await page.getByTestId("game-date").textContent(), date);
      passed(
        `${label}: real trains continue moving while the campaign clock stays paused`,
      );

      await page
        .getByLabel("Animasyonlar", { exact: true })
        .selectOption("reduced");
      const selection = page.getByTestId("map3d-selection");
      const selectedBefore = await selection.textContent();
      const distanceBefore = Number((await stats()).cameraDistance);
      const center = await canvas.evaluate((element) => {
        const box = element.getBoundingClientRect();
        for (const row of [0.68, 0.58, 0.48, 0.38]) {
          for (const col of [0.5, 0.45, 0.55]) {
            const x = box.left + box.width * col,
              y = box.top + box.height * row;
            if (
              Array.from({ length: 33 }, (_, i) => x - 80 + i * 5).every(
                (px) => document.elementFromPoint(px, y) === element,
              )
            )
              return { x, y };
          }
        }
        return null;
      });
      assert.ok(center, "Gesture must hit the actual canvas, not its HUD");
      frame = Number((await stats()).renderedFrames);
      if (mobile) {
        const session = await context.newCDPSession(page);
        const touches = (spread) =>
          [1, 2].map((id) => ({
            id,
            x: center.x + (id === 1 ? -spread : spread),
            y: center.y,
            radiusX: 4,
            radiusY: 4,
            force: 1,
          }));
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
        await session.detach();
      } else {
        await page.mouse.move(center.x, center.y);
        await page.mouse.wheel(0, -180);
      }
      await renderAfter(frame);
      await page.waitForFunction(
        (before) =>
          Math.abs(
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .cameraDistance,
            ) - before,
          ) > 1,
        distanceBefore,
      );
      assert.equal(await selection.textContent(), selectedBefore);
      passed(
        `${label}: ${mobile ? "two-finger pinch" : "mouse-wheel zoom"} changes the real camera without accidental selection`,
      );

      await click(
        page.getByRole("button", { name: "2D siyasi harita", exact: true }),
      );
      const svg = page.getByTestId("war-map");
      await svg.waitFor();
      await page
        .getByRole("combobox", { name: "Harita görünümü", exact: true })
        .selectOption("political");
      await focus(f.world.countries.germany.capital, false);
      const germanProvince = page.locator(
        `[data-province="${f.world.countries.germany.capital}"]`,
      );
      assert.equal(
        await germanProvince.getAttribute("fill"),
        politicalCountryColor("germany", f.world.countries.germany.color),
      );
      assert.equal(
        await svg.locator("#sea-glow stop").last().getAttribute("stop-color"),
        "#050b19",
      );
      await focus(f.capital, false);
      const region = page.locator(`[data-province="${f.neighbor}"]`);
      await region.focus();
      await page.keyboard.press("Enter");
      assert.equal(await region.getAttribute("tabindex"), "0");
      assert.equal(
        await page.locator(`[data-city-label="${f.neighbor}"]`).count(),
        1,
      );
      const capitals = new Set(
        Object.values(f.world.countries).map((country) => country.capital),
      );
      const cityLabels = await svg
        .locator("[data-city-label]")
        .evaluateAll((elements) =>
          elements.map((element) => element.dataset.cityLabel),
        );
      assert.ok(
        cityLabels.every((id) => id === f.neighbor || capitals.has(id)),
      );
      assert.ok(
        (await svg.locator('circle[fill="url(#night-city-glow)"]').count()) > 0,
      );
      await closePanel();
      await screenshot("svg-night");
      passed(
        `${label}: SVG fallback shares the night palette and retains keyboard selection and capital-only city captions`,
      );

      assert.deepEqual(
        await save(),
        f.world,
        "Camera, quality, SVG fallback and ambient trains must not mutate the saved campaign",
      );
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await ready();
      assert.equal((await stats()).atlasStyle, "night");
      passed(
        `${label}: all presentation changes preserve the entire campaign and can return to 3D`,
      );
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors, samples }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, errors, output }));
  } catch (error) {
    const state =
      activePage && !activePage.isClosed()
        ? await activePage
            .evaluate(() => ({
              ...document.querySelector('[data-testid="war-map-3d"]')?.dataset,
            }))
            .catch(() => null)
        : null;
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { error: error.stack, checks, errors, state, samples },
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
