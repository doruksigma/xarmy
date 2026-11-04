/* Public UI acceptance for simultaneous air/naval settlement and real reports.
 * Run against a fresh production build, with Playwright available on NODE_PATH.
 * EUROPA_FIXTURES_ONLY=1 validates the combat fixture without launching Chromium.
 * All imported campaigns use the ordinary validated save format; no app hooks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-airnaval";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".europa-airnaval-browser-"),
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
    const { createWorld } = require(path.join(strategy, "world.js"));
    const { advanceHours } = require(path.join(strategy, "engine.js"));
    const { declareWar } = require(path.join(strategy, "diplomacy.js"));
    const { AIRCRAFT, SHIPS } = require(
      path.join(strategy, "advanced-catalog.js"),
    );
    const { encodeSave, decodeSave, validateWorld } = require(
      path.join(strategy, "storage.js"),
    );
    const tick = (world) => world.day * 24 + world.hour;
    const ownReport = (world) =>
      world.airNavalReports?.find((entry) => entry.country === world.player);
    const simulateTo = (before, after) => {
      assert.ok(tick(after) >= tick(before) && tick(after) - tick(before) < 96);
      let expected = before;
      while (tick(expected) < tick(after))
        expected = advanceHours(
          expected,
          Math.min(24, tick(after) - tick(expected)),
        );
      return decodeSave(encodeSave(expected));
    };
    function fixture() {
      const world = createWorld("turkey", "historical", 1936, "hard");
      world.hour = 23;
      for (const c of Object.values(world.countries)) {
        c.air.wings = [];
        c.navy.ships = [];
        c.allies = [];
        c.wars = [];
        c.stock.fuel = 1000;
        c.stock.steel = 100;
        c.automation = {
          economy: false,
          research: false,
          recruitment: false,
          operations: false,
          air: false,
          navy: false,
        };
        for (const model of [...Object.keys(AIRCRAFT), ...Object.keys(SHIPS)])
          c.equipment[model] = 0;
      }
      for (const p of Object.values(world.provinces)) {
        p.damage = 0;
        p.buildings.dock = 0;
        p.buildings.antiAir = 0;
      }
      for (const id of ["turkey-1", "bulgaria-2"]) {
        world.provinces[id].buildings.airfield = 4;
        world.provinces[id].buildings.antiAir = 2;
      }
      world.provinces["turkey-1"].buildings.dock = 1;
      declareWar(world, "turkey", "bulgaria");
      const wing = (country, id, model, mission, count) => ({
        id,
        name: id,
        model,
        count,
        size: 100,
        base: country === "turkey" ? "turkey-1" : "bulgaria-2",
        target: country === "turkey" ? "bulgaria-2" : "turkey-1",
        mission,
        readiness: 100,
        experience: 0,
      });
      world.countries.turkey.air.wings = [
        wing("turkey", "tr-fighter", "fighter", "superiority", 98),
        wing("turkey", "tr-bomb", "strategicBomber", "strategic", 60),
        wing("turkey", "tr-naval", "bomber", "naval", 100),
      ];
      world.countries.bulgaria.air.wings = [
        wing("bulgaria", "bg-fighter", "fighter", "superiority", 80),
        wing("bulgaria", "bg-bomb", "strategicBomber", "strategic", 50),
        wing("bulgaria", "bg-naval", "bomber", "naval", 40),
      ];
      world.countries.turkey.equipment.fighter = 2;
      const ship = (country, id, model, health = 100, mission = "patrol") => ({
        id,
        name: id,
        model,
        health,
        mission,
        experience: 0,
        port: country === "turkey" ? "turkey-1" : "bulgaria-2",
        zone: "black",
        transit: 0,
        aircraft: model === "carrier" ? 20 : 0,
      });
      world.countries.turkey.navy.ships = [
        ship("turkey", "tr-cruiser", "ship"),
        ship("turkey", "tr-carrier", "carrier"),
        ship("turkey", "tr-fragile", "destroyer", 0.02),
        ship("turkey", "tr-repair-a", "ship", 99.5, "idle"),
        ship("turkey", "tr-repair-b", "ship", 50, "idle"),
      ];
      world.countries.bulgaria.navy.ships = [
        ship("bulgaria", "bg-battleship", "battleship"),
        ship("bulgaria", "bg-cruiser", "ship"),
        ship("bulgaria", "bg-submarine", "submarine", 100, "raid"),
      ];
      assert.ok(
        validateWorld(world),
        "Synthetic battle must pass the real save validator",
      );
      return decodeSave(encodeSave(world));
    }
    const initial = fixture();
    assert.equal(Object.hasOwn(initial, "airNavalReports"), false);
    const settled = advanceHours(initial, 1);
    assert.ok(validateWorld(settled));
    const daily = ownReport(settled);
    assert.ok(daily, "The daily engine must publish the real player report");
    assert.equal(daily.day, 1);
    const enemyReport = settled.airNavalReports.find(
      (entry) => entry.country === "bulgaria",
    );
    assert.ok(enemyReport?.air.combatLosses > 0);
    assert.ok(enemyReport?.navy.combatDamage > 0);
    for (const key of [
      "flown",
      "combatLosses",
      "fuelSpent",
      "bombingDamage",
      "navalDamage",
      "reinforced",
    ])
      assert.ok(daily.air[key] > 0, `Expected real air ${key}`);
    for (const key of [
      "active",
      "combatDamage",
      "sunk",
      "repaired",
      "fuelSpent",
    ])
      assert.ok(daily.navy[key] > 0, `Expected real navy ${key}`);
    assert.ok(
      daily.navy.repaired <= 1.5 + 1e-8,
      "One dock cannot create extra repair work",
    );
    assert.ok(
      !settled.countries.turkey.navy.ships.some((s) => s.id === "tr-fragile"),
    );
    assert.deepEqual(decodeSave(encodeSave(settled)), settled);
    samples.push({ fixtureReport: daily });
    pass(
      "A validated midnight fixture resolves real air, sea, bombing, sinking and bounded repair effects",
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
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      localStorage.setItem("xarmy-europa-map-view-v1", "2d");
      localStorage.setItem("xarmy-europa-3d-quality-v1", "low");
      localStorage.setItem("xarmy-europa-3d-motion-v1", "reduced");
    });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on("pageerror", (error) => errors.push(error.message));
    const close = async () => {
      for (const name of [
        "Komutan panelini kapat",
        "Yönetim panelini kapat",
        "Bildirimi kapat",
      ]) {
        const button = page.getByRole("button", { name, exact: true }).first();
        if (await button.isVisible()) await button.click();
      }
    };
    const tab = async (name) => {
      await close();
      await page.locator(`button[title="${name}"]`).click();
    };
    const pause = async () => {
      const button = page.getByRole("button", {
        name: "Zamanı duraklat",
        exact: true,
      });
      if (await button.isVisible()) await button.click();
    };
    const save = async () => {
      await pause();
      await tab("Kayıtlar");
      await page
        .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
        .first()
        .click();
      const world = decodeSave(
        await page.evaluate(() =>
          localStorage.getItem("xarmy-europa-1936-v1:slot-1"),
        ),
      );
      await close();
      return world;
    };
    const load = async (world) => {
      await pause();
      await tab("Kayıtlar");
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: "airnaval-campaign.json",
        mimeType: "application/json",
        buffer: Buffer.from(encodeSave(world)),
      });
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      await page.waitForFunction(
        (hour) =>
          Number(
            document
              .querySelector('[data-testid="game-date"]')
              ?.getAttribute("data-game-hour"),
          ) === hour,
        tick(world),
      );
      await close();
    };
    const screenshot = async (name) => {
      await page.getByTestId("air-naval-report").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, name + ".png") });
    };
    const checkReport = async (world) => {
      const entry = ownReport(world);
      assert.ok(entry);
      const panel = page.getByTestId("air-naval-report");
      assert.equal(await panel.count(), 1);
      assert.equal(
        await panel.getAttribute("data-report-country"),
        world.player,
      );
      assert.equal(
        Number(await panel.getAttribute("data-report-day")),
        entry.day,
      );
      assert.equal(
        await panel.getByTestId("air-naval-report-empty").count(),
        0,
      );
      const metrics = {
        "aircraft-losses":
          entry.air.combatLosses +
          entry.air.baseLosses +
          entry.navy.aircraftLost,
        "ships-sunk": entry.navy.sunk,
        "fuel-spent": entry.air.fuelSpent + entry.navy.fuelSpent,
        "bombing-damage": entry.air.bombingDamage,
        "air-flown": entry.air.flown,
        "air-engagements": entry.air.engagements,
        "air-combat-losses": entry.air.combatLosses,
        "air-base-losses": entry.air.baseLosses,
        "air-reinforced": entry.air.reinforced,
        "air-fuel": entry.air.fuelSpent,
        "air-naval-damage": entry.air.navalDamage,
        "navy-active": entry.navy.active,
        "navy-engagements": entry.navy.engagements,
        "navy-combat-damage": entry.navy.combatDamage,
        "navy-attrition-damage": entry.navy.attritionDamage,
        "carrier-aircraft-lost": entry.navy.aircraftLost,
        "navy-repaired": entry.navy.repaired,
        "navy-fuel": entry.navy.fuelSpent,
      };
      for (const [id, expected] of Object.entries(metrics))
        assert.equal(
          Number(
            await panel
              .getByTestId(`air-naval-metric-${id}`)
              .getAttribute("data-value"),
          ),
          expected,
          id,
        );
      assert.equal(
        await page
          .getByRole("region", {
            name: "Bulgaristan hava ve deniz günlük raporu",
            exact: true,
          })
          .count(),
        0,
      );
      assert.ok(
        !(await panel.locator('[data-report-country="bulgaria"]').count()),
      );
    };

    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }).click();
    await load(initial);
    await tab("Hava / Deniz");
    await page.getByTestId("air-naval-report-empty").waitFor();
    assert.match(
      await page.getByTestId("air-naval-report-empty").textContent(),
      /bir sonraki güne/,
    );
    assert.equal(
      await page.getByTestId("air-naval-metric-fuel-spent").count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("switch", {
          name: "Hava kuvvetlerini yapay zekâ yönetsin",
          exact: true,
        })
        .isChecked(),
      false,
    );
    assert.equal(
      await page
        .getByRole("switch", {
          name: "Deniz kuvvetlerini yapay zekâ yönetsin",
          exact: true,
        })
        .isChecked(),
      false,
    );
    await screenshot("before-first-report");
    pass(
      "An existing campaign has no invented report and keeps independent air/navy control disabled",
    );

    await close();
    await page.getByRole("button", { name: "1 kat hız", exact: true }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('[data-testid="game-date"]')
            ?.getAttribute("data-game-hour"),
        ) >= 24,
    );
    await pause();
    const current = await save();
    assert.deepEqual(current, simulateTo(initial, current));
    assert.ok(ownReport(current)?.navy.sunk > 0);
    assert.ok(ownReport(current)?.air.bombingDamage > 0);
    await tab("Hava / Deniz");
    await checkReport(current);
    await screenshot("daily-summary-desktop");
    await page.getByText("Görev ve kayıp ayrıntıları", { exact: true }).click();
    await checkReport(current);
    await page
      .getByTestId("air-naval-metric-navy-repaired")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "daily-breakdown-desktop.png"),
    });
    pass(
      "The real midnight worker report matches saved engine effects and exposes only the player's losses",
    );

    await context.setOffline(true);
    await load(current);
    await tab("Hava / Deniz");
    await checkReport(current);
    assert.equal(
      await page
        .getByTestId("air-naval-report")
        .locator("details")
        .getAttribute("open"),
      null,
    );
    pass(
      "Offline save/load preserves the actual daily report without expanding advanced details by default",
    );

    await close();
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      (nextDay) =>
        Number(
          document
            .querySelector('[data-testid="game-date"]')
            ?.getAttribute("data-game-hour"),
        ) >= nextDay,
      (current.day + 1) * 24,
    );
    await pause();
    const offline = await save();
    assert.deepEqual(offline, simulateTo(current, offline));
    assert.equal(ownReport(offline).day, offline.day);
    assert.ok(ownReport(offline).day > ownReport(current).day);
    await tab("Kayıtlar");
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "JSON dosyası indir", exact: true })
      .click();
    const exported = path.join(output, "offline-campaign.json");
    await (await downloaded).saveAs(exported);
    assert.deepEqual(decodeSave(fs.readFileSync(exported, "utf8")), offline);
    await tab("Hava / Deniz");
    await checkReport(offline);
    samples.push({ offlineReport: ownReport(offline) });
    pass(
      "With network disabled the loaded game continues through midnight and saves its new exact worker report",
    );
    await load(current);
    await tab("Hava / Deniz");

    await page
      .getByLabel("Yönetilecek hava kanadı", { exact: true })
      .selectOption("tr-fighter");
    await page.getByLabel("Görev", { exact: true }).selectOption("idle");
    let commanded = await save();
    assert.equal(
      commanded.countries.turkey.air.wings.find(
        (wing) => wing.id === "tr-fighter",
      ).mission,
      "idle",
    );
    assert.deepEqual(ownReport(commanded), ownReport(current));
    await tab("Hava / Deniz");
    await page.getByText(/Donanma ve deniz bölgeleri ·/).click();
    await page
      .getByLabel("Yönetilecek gemi", { exact: true })
      .selectOption("tr-cruiser");
    await page.getByRole("button", { name: "Eskort", exact: true }).click();
    commanded = await save();
    assert.equal(
      commanded.countries.turkey.navy.ships.find(
        (ship) => ship.id === "tr-cruiser",
      ).mission,
      "escort",
    );
    assert.deepEqual(ownReport(commanded), ownReport(current));
    await tab("Hava / Deniz");
    const air = page.getByRole("switch", {
      name: "Hava kuvvetlerini yapay zekâ yönetsin",
      exact: true,
    });
    const navy = page.getByRole("switch", {
      name: "Deniz kuvvetlerini yapay zekâ yönetsin",
      exact: true,
    });
    await air.check();
    assert.equal(await navy.isChecked(), false);
    const automatic = await save();
    assert.equal(automatic.countries.turkey.automation.air, true);
    assert.equal(automatic.countries.turkey.automation.navy, false);
    assert.equal(
      automatic.countries.turkey.navy.ships.find(
        (ship) => ship.id === "tr-cruiser",
      ).mission,
      "escort",
    );
    assert.deepEqual(ownReport(automatic), ownReport(current));
    await load(automatic);
    await tab("Hava / Deniz");
    assert.equal(await air.isChecked(), true);
    assert.equal(await navy.isChecked(), false);
    await air.uncheck();
    await page.getByTestId("air-navy-control").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "manual-controls-desktop.png"),
    });
    pass(
      "Manual wing and ship commands still work; enabling the air helper leaves the navy manual and the completed report unchanged",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await checkReport(automatic);
    await screenshot("daily-summary-mobile");
    const panel = page.getByTestId("air-naval-report");
    assert.ok(
      await panel.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.left >= 0 &&
          box.right <= innerWidth + 1 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
      "The daily report must fit the mobile panel without horizontal clipping",
    );
    await page.getByText("Görev ve kayıp ayrıntıları", { exact: true }).click();
    await page
      .getByTestId("air-naval-metric-navy-repaired")
      .scrollIntoViewIfNeeded();
    assert.ok(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(output, "daily-breakdown-mobile.png"),
    });
    await page.getByTestId("air-navy-control").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "manual-controls-mobile.png"),
    });
    pass(
      "At 390px the summary and full loss/repair breakdown fit the panel and remain accessible",
    );
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
