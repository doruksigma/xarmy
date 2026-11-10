/* Public-UI acceptance for the compact strategic-map command interface.
 * Import ordinary validated campaigns; exercise real controls and save outputs.
 * Run after a production build. EUROPA_FIXTURES_ONLY=1 skips Chromium.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-reference";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });
(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".europa-reference-browser-"),
  );
  const checks = [],
    errors = [],
    samples = [];
  let browser, page;
  const report = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors, samples }, null, 2),
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
    const strategy = path.join(compiled, "app/games/europa-war/strategy");
    const { createWorld, addArmy, GEOGRAPHY, MAP } = require(
      path.join(strategy, "world.js"),
    );
    const { applyAction } = require(path.join(strategy, "engine.js"));
    const { declareWar } = require(path.join(strategy, "diplomacy.js"));
    const { UNITS } = require(path.join(strategy, "catalog.js"));
    const { encodeSave, decodeSave, validateWorld } = require(
      path.join(strategy, "storage.js"),
    );
    let world = createWorld("germany", "historical", 1936, "hard");
    const country = world.countries.germany;
    for (const c of Object.values(world.countries)) {
      c.automation = {
        economy: false,
        research: false,
        recruitment: false,
        operations: false,
        air: false,
        navy: false,
      };
      c.autoAssignCommanders = false;
      for (const general of c.generals) delete general.front;
    }
    world.armies = world.armies.filter(
      (a) => !["germany", "poland"].includes(a.country),
    );
    world.fronts = [];
    world.plans = [];
    country.recruitment = [];
    country.tech = [...new Set([...country.tech, "armor1", "armor2"])];
    country.manpower = Math.max(country.manpower, 100000);
    for (const [equipment, amount] of Object.entries(
      UNITS.mediumTank.equipment,
    ))
      country.equipment[equipment] = amount * 10;
    declareWar(world, "germany", "poland");
    const border = Object.values(world.provinces)
      .filter(
        (p) =>
          p.controller === "germany" &&
          GEOGRAPHY[p.id].neighbors.some(
            (e) => !e.sea && world.provinces[e.id].controller === "poland",
          ),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    assert.ok(border.length > 1);
    const general = country.generals[0].id;
    const types = ["infantry", "mediumTank", "artillery", "motorized"];
    for (let i = 0; i < 10; i++) {
      const army = addArmy(
        world,
        "germany",
        border[i % border.length].id,
        types[i % types.length],
      );
      army.general = general;
      army.organization = 100;
    }
    const enemyProvinces = [
      ...new Set(
        border.flatMap((p) =>
          GEOGRAPHY[p.id].neighbors
            .filter(
              (e) => !e.sea && world.provinces[e.id].controller === "poland",
            )
            .map((e) => e.id),
        ),
      ),
    ];
    for (const province of enemyProvinces)
      addArmy(world, "poland", province, "infantry");
    const reserve = addArmy(world, "germany", country.capital, "infantry");
    reserve.general = null;
    reserve.organization = 100;
    const destination = GEOGRAPHY[country.capital].neighbors.find(
      (e) => !e.sea && world.provinces[e.id].controller === "germany",
    ).id;
    const deployed = applyAction(world, {
      type: "commanderDeploy",
      general,
      target: "poland",
    });
    assert.equal(deployed.error, null);
    world = decodeSave(encodeSave(deployed.world));
    assert.ok(validateWorld(world));
    assert.equal(
      world.countries.germany.generals.find((g) => g.id === general).front
        .target,
      "poland",
    );
    assert.deepEqual(decodeSave(encodeSave(world)), world);
    pass(
      "The reference-map fixture has a real commander front, distinct units and a valid paid-training inventory",
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
        "--disable-gpu-rasterization",
      ],
    });
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 900 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      // Do not set map-view: this tests the new default rather than forcing it.
      await context.addInitScript(() => {
        localStorage.setItem("xarmy-europa-3d-quality-v1", "low");
        localStorage.setItem("xarmy-europa-3d-motion-v1", "reduced");
      });
      page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.on("pageerror", (error) =>
        errors.push(`${label}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error")
          errors.push(`${label} console: ${entry.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
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
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.isVisible()) await click(button);
      };
      const save = async () => {
        await pause();
        await tab("Kayıtlar");
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        const saved = decodeSave(
          await page.evaluate(() =>
            localStorage.getItem("xarmy-europa-1936-v1:slot-1"),
          ),
        );
        await close();
        return saved;
      };
      const load = async (state) => {
        await pause();
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "reference-campaign.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(state)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .waitFor();
        await close();
      };
      const screenshot = (name) =>
        page.screenshot({ path: path.join(output, `${label}-${name}.png`) });
      const noOverflow = async () =>
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${label}: no page horizontal overflow`,
        );
      const focus = async (id) => {
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
        await page.waitForTimeout(350);
      };
      const view = async () =>
        (await page.getByTestId("war-map").getAttribute("viewBox"))
          .split(" ")
          .map(Number);
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByLabel("Komuta edeceğin ülke").selectOption("germany");
      await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
      await page.getByTestId("game-date").waitFor();
      await pause();
      await close();
      await page.getByTestId("war-map").waitFor();
      await page.waitForFunction(
        (width) =>
          Number(
            document
              .querySelector('[data-testid="war-map"]')
              ?.getAttribute("viewBox")
              ?.split(" ")[2],
          ) <
          width / 2,
        MAP.width,
      );
      const initialView = await view();
      assert.ok(
        GEOGRAPHY[country.capital].x >= initialView[0] &&
          GEOGRAPHY[country.capital].x <= initialView[0] + initialView[2],
      );
      assert.ok(
        GEOGRAPHY[country.capital].y >= initialView[1] &&
          GEOGRAPHY[country.capital].y <= initialView[1] + initialView[3],
      );
      await noOverflow();
      if (mobile)
        for (const name of ["Zamanı başlat", "1 kat hız", "5 kat hız"]) {
          const box = await page
            .getByRole("button", { name, exact: true })
            .boundingBox();
          assert.ok(
            box.width >= 44 && box.height >= 44,
            `${name} must retain a 44px touch target`,
          );
          assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
        }
      await screenshot("initial-command-map");
      pass(
        `${label}: a new campaign opens the regional political map with its capital visible and compact controls`,
      );

      if (!mobile) {
        const other = createWorld("turkey");
        await load(other);
        await page.waitForTimeout(400);
        const importedView = await view(),
          capital = GEOGRAPHY[other.countries.turkey.capital];
        assert.ok(
          capital.x >= importedView[0] &&
            capital.x <= importedView[0] + importedView[2],
        );
        assert.ok(
          capital.y >= importedView[1] &&
            capital.y <= importedView[1] + importedView[3],
        );
        pass(
          "Importing a different country refocuses its real capital instead of retaining the previous country's camera",
        );
      }
      await load(world);
      await page.getByTestId("strategic-country-borders").waitFor();
      assert.ok(
        (await page.getByTestId("strategic-hostile-borders").getAttribute("d"))
          .length > 0,
      );
      const front = page.locator(`[data-strategic-front="${general}"]`);
      await front.waitFor({ state: "attached" });
      assert.equal(await front.getAttribute("data-target-country"), "poland");
      const snapshot = await save();
      assert.deepEqual(snapshot, world);
      await screenshot("front-and-unit-counters");
      pass(
        `${label}: political boundaries, hostile boundaries and commander fronts correspond to the imported campaign`,
      );

      const map = page.getByTestId("war-map");
      const beforeZoom = await view();
      await click(
        page.getByRole("button", { name: "Haritayı yakınlaştır", exact: true }),
      );
      await page.waitForTimeout(350);
      assert.ok((await view())[2] < beforeZoom[2]);
      await map.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(350);
      assert.notEqual((await view())[0], beforeZoom[0]);
      if (!mobile) {
        const rect = await map.boundingBox();
        const beforePan = await view();
        await page.mouse.move(
          rect.x + rect.width * 0.62,
          rect.y + rect.height * 0.55,
        );
        await page.mouse.down();
        await page.mouse.move(
          rect.x + rect.width * 0.72,
          rect.y + rect.height * 0.62,
          { steps: 8 },
        );
        await page.mouse.up();
        await page.waitForTimeout(350);
        assert.notEqual((await view())[0], beforePan[0]);
      }
      await click(
        page.getByRole("button", { name: "Başkentime git", exact: true }),
      );
      await page.waitForTimeout(350);
      pass(
        `${label}: zoom, keyboard panning and capital reset remain functional`,
      );

      const mapBeforePanel = await map.boundingBox();
      await tab("Ordu");
      await page.getByTestId("army-recruitment").waitFor();
      const mapAfterPanel = await map.boundingBox();
      assert.equal(
        mapAfterPanel.width,
        mapBeforePanel.width,
        "The map must not shrink when a floating panel opens",
      );
      await click(
        page.getByRole("button", {
          name: "Birlik türünü değiştir",
          exact: true,
        }),
      );
      await click(
        page.getByRole("button", { name: "Orta tank seç", exact: true }),
      );
      assert.equal(
        await page
          .getByLabel("Birliklerin çıkacağı şehir", { exact: true })
          .inputValue(),
        country.capital,
      );
      assert.match(
        await page.getByTestId("recruitment-unit-stats").textContent(),
        /Orta tank/,
      );
      await page
        .getByTestId("army-recruitment")
        .locator("header")
        .scrollIntoViewIfNeeded();
      await screenshot("army-workbench");
      if (mobile) {
        await page
          .getByTestId("recruitment-unit-stats")
          .scrollIntoViewIfNeeded();
        await screenshot("army-specifications");
      }
      await noOverflow();
      await click(page.getByRole("button", { name: /^Eğitime başla ·/ }));
      await page.getByTestId("recruitment-queue-item").waitFor();
      const recruited = await save();
      assert.equal(recruited.countries.germany.recruitment.length, 1);
      assert.equal(
        recruited.countries.germany.recruitment[0].type,
        "mediumTank",
      );
      assert.equal(
        recruited.countries.germany.recruitment[0].province,
        country.capital,
      );
      assert.equal(
        recruited.countries.germany.manpower,
        world.countries.germany.manpower - UNITS.mediumTank.men,
      );
      for (const [id, amount] of Object.entries(UNITS.mediumTank.equipment))
        assert.equal(
          recruited.countries.germany.equipment[id],
          world.countries.germany.equipment[id] - amount,
        );
      pass(
        `${label}: the army workbench trains the selected tank at the capital and deducts real equipment and manpower`,
      );

      await close();
      await click(page.getByTestId(`commander-card-${general}`));
      await page.getByTestId("commander-panel").waitFor();
      await click(page.getByTestId("commander-attack"));
      assert.equal(
        await page.getByTestId("commander-attack").getAttribute("aria-pressed"),
        "true",
      );
      await screenshot("commander-orders");
      await noOverflow();
      const commanded = await save();
      assert.equal(
        commanded.countries.germany.generals.find((g) => g.id === general).front
          .stance,
        "attack",
      );
      pass(
        `${label}: the portrait dock opens real commander orders and changes only its assigned Polish front stance`,
      );

      await focus(country.capital);
      await click(page.locator(`[data-army="${reserve.id}"]`));
      await page.getByTestId("map-target-selection").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Yönetim panelini kapat", exact: true })
          .isVisible(),
        false,
        "Map order mode must expose the search and target map on every viewport",
      );
      await page
        .getByLabel("Şehir bul", { exact: true })
        .fill(GEOGRAPHY[destination].name);
      await click(
        page
          .getByRole("list", { name: "Şehir arama sonuçları" })
          .getByRole("button")
          .filter({ hasText: GEOGRAPHY[destination].name })
          .first(),
      );
      await close();
      const moved = await save();
      assert.equal(
        moved.armies.find((a) => a.id === reserve.id).route.at(-1),
        destination,
      );
      const arrow = page.locator(
        '[data-movement-route][data-country="germany"][data-selected="true"]',
      );
      assert.ok(await arrow.count());
      assert.equal(
        await arrow.first().getAttribute("data-color"),
        world.countries.germany.color,
      );
      await screenshot("manual-movement-arrow");
      pass(
        `${label}: selecting a real counter and map target writes a movement order with a country-colored arrow`,
      );

      await close();
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await page.getByTestId("war-map-3d").waitFor();
      await page.waitForTimeout(600);
      await screenshot("3d-retained");
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("xarmy-europa-map-view-v1"),
        ),
        "3d",
      );
      if (!mobile) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByTestId("war-map-3d").waitFor();
        await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
        await pause();
        await close();
        await load(moved);
        await page.getByTestId("war-map-3d").waitFor();
      }
      await click(
        page.getByRole("button", { name: "2D siyasi harita", exact: true }),
      );
      await page.getByTestId("war-map").waitFor();
      await noOverflow();
      assert.deepEqual(await save(), moved);
      pass(
        `${label}: 3D/2D switching preserves the campaign and leaves controls reachable`,
      );
      if (mobile) {
        for (const size of [
          { width: 320, height: 640 },
          { width: 667, height: 375 },
        ]) {
          await page.setViewportSize(size);
          await tab("Ordu");
          await page.getByTestId("army-recruitment").waitFor();
          await noOverflow();
          const dismiss = await page
            .getByRole("button", {
              name: "Yönetim panelini kapat",
              exact: true,
            })
            .boundingBox();
          assert.ok(
            dismiss &&
              dismiss.x >= 0 &&
              dismiss.y >= 0 &&
              dismiss.x + dismiss.width <= size.width + 1 &&
              dismiss.y + dismiss.height <= size.height + 1,
          );
          await screenshot(`army-${size.width}x${size.height}`);
          await close();
        }
        pass(
          "Narrow portrait and short landscape keep the floating army window, scrolling and close control accessible",
        );
      }
      samples.push({
        device: label,
        initialView,
        trainedType: "mediumTank",
        assignedFront: "poland",
        reserve: reserve.id,
        destination,
      });
      await context.close();
      page = null;
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
