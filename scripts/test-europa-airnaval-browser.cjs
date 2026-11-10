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
const { advanceClockHours } = require("./europa-browser-clock.cjs");

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
  let browser,
    page,
    touch = false;
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
    const { createWorld, GEOGRAPHY } = require(path.join(strategy, "world.js"));
    const { advanceHours, applyAction } = require(
      path.join(strategy, "engine.js"),
    );
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
      world.provinces["turkey-city-13"].buildings.airfield = 4;
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
    const landInitial = createWorld("turkey", "historical", 1936, "hard");
    for (const c of Object.values(landInitial.countries)) {
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
    const marchers = landInitial.armies
      .filter((army) => army.country === "turkey" && army.type === "infantry")
      .slice(0, 2);
    assert.equal(marchers.length, 2);
    const marcher = marchers[0];
    const marchIds = marchers.map((army) => army.id);
    for (const army of marchers) {
      army.province = "turkey-1";
      army.general = null;
      army.route = [];
      army.move = null;
    }
    // One visible stack proves that one selection commands both formations.
    landInitial.armies = landInitial.armies.filter(
      (army) => army.country !== "turkey" || marchIds.includes(army.id),
    );
    landInitial.countries.turkey.navy.ships = [];
    const destination = "turkey-city-2";
    const planned = applyAction(landInitial, {
      type: "moveGroup",
      armies: marchIds,
      to: destination,
    });
    assert.equal(planned.error, null);
    const landRoute = planned.world.armies.find(
      (army) => army.id === marcher.id,
    ).route;
    assert.equal(landRoute.at(-1), destination);
    assert.equal(
      landRoute[0],
      "turkey-city-13",
      "Istanbul must enter the connected Izmit corridor instead of jumping across Marmara to Bursa",
    );
    assert.ok(
      landRoute.includes("turkey-3") && landRoute.includes("turkey-city-3"),
    );
    let landArrival = planned.world;
    let arrivalHours = 0;
    while (
      landArrival.armies.some(
        (army) => marchIds.includes(army.id) && army.province !== destination,
      ) &&
      arrivalHours < 720
    ) {
      landArrival = advanceHours(landArrival, 24);
      arrivalHours += 24;
    }
    for (const id of marchIds)
      assert.equal(
        landArrival.armies.find((army) => army.id === id)?.province,
        destination,
      );
    assert.ok(validateWorld(landInitial) && validateWorld(landArrival));
    samples.push({
      coastalRoute: [marcher.province, ...landRoute],
      arrivalHours,
    });
    pass(
      "The real route planner and hourly engine reach Canakkale through connected land with no navy or Marmara shortcut",
    );
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
    page.on("console", (entry) => {
      if (entry.type() === "error") errors.push(entry.text());
    });
    const activate = (locator) => (touch ? locator.tap() : locator.click());
    const close = async () => {
      for (const name of [
        "Komutan panelini kapat",
        "Yönetim panelini kapat",
        "Bildirimi kapat",
      ]) {
        const button = page.getByRole("button", { name, exact: true }).first();
        if (await button.isVisible()) await activate(button);
      }
    };
    const tab = async (name) => {
      await close();
      await activate(page.locator(`button[title="${name}"]`));
    };
    const pause = async () => {
      const button = page.getByRole("button", {
        name: "Zamanı duraklat",
        exact: true,
      });
      if (await button.isVisible()) await activate(button);
    };
    const save = async () => {
      await pause();
      await tab("Kayıtlar");
      await activate(
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
    const focusCity = async (id) => {
      await close();
      await page
        .getByLabel("Şehir bul", { exact: true })
        .fill(GEOGRAPHY[id].name);
      await activate(
        page
          .getByRole("list", { name: "Şehir arama sonuçları" })
          .getByRole("button")
          .filter({ hasText: GEOGRAPHY[id].name })
          .first(),
      );
      await close();
    };
    const checkLandControls = async (device) => {
      await load(landInitial);
      await focusCity("turkey-1");
      await activate(page.locator(`[data-army="${marcher.id}"]`));
      await page.getByTestId("map-target-selection").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Yönetim panelini kapat", exact: true })
          .isVisible(),
        false,
      );
      await page
        .getByLabel("Şehir bul", { exact: true })
        .fill(GEOGRAPHY[destination].name);
      await activate(
        page
          .getByRole("list", { name: "Şehir arama sonuçları" })
          .getByRole("button")
          .filter({ hasText: GEOGRAPHY[destination].name })
          .first(),
      );
      const ordered = await save();
      for (const id of marchIds)
        assert.deepEqual(
          ordered.armies.find((army) => army.id === id).route,
          landRoute,
        );
      assert.ok(
        await page
          .locator('[data-movement-route][data-country="turkey"]')
          .count(),
      );
      await page.screenshot({
        path: path.join(output, `${device}-coastal-order.png`),
      });
      pass(
        `${device}: selecting a two-division map stack then Canakkale orders every division along connected land and displays its real arrow`,
      );
      for (let elapsed = 0; elapsed < arrivalHours; elapsed += 24) {
        await advanceClockHours(page, Math.min(24, arrivalHours - elapsed), 5);
      }
      const arrived = await save();
      for (const id of marchIds) {
        const unit = arrived.armies.find((army) => army.id === id);
        assert.equal(unit.province, destination);
        assert.equal(unit.move, null);
        assert.deepEqual(unit.route, []);
      }
      assert.ok(validateWorld(arrived));
      await focusCity(destination);
      await page.screenshot({
        path: path.join(output, `${device}-coastal-arrival.png`),
      });
      pass(
        `${device}: the running worker brings both divisions along the coastal detour without a navy or teleport`,
      );

      await load(landInitial);
      await focusCity("turkey-1");
      await activate(page.locator(`[data-army="${marcher.id}"]`));
      await page
        .getByLabel("Şehir bul", { exact: true })
        .fill(GEOGRAPHY["greece-0"].name);
      await activate(
        page
          .getByRole("list", { name: "Şehir arama sonuçları" })
          .getByRole("button")
          .filter({ hasText: GEOGRAPHY["greece-0"].name })
          .first(),
      );
      await page
        .getByText(/Uygun rota yok/)
        .first()
        .waitFor();
      const refused = await save();
      assert.equal(
        refused.armies.find((army) => army.id === marcher.id).province,
        "turkey-1",
      );
      assert.deepEqual(
        refused.armies.find((army) => army.id === marcher.id).route,
        [],
      );
      pass(
        `${device}: a neutral foreign target is refused with a route explanation and cannot move the army`,
      );
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
    await page.getByTestId("naval-control-tab").click();
    assert.equal(
      await page
        .getByRole("switch", {
          name: "Deniz kuvvetlerini yapay zekâ yönetsin",
          exact: true,
        })
        .isChecked(),
      false,
    );
    await page.getByTestId("air-control-tab").click();
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
    await page.getByTestId("apply-air-order").click();
    let commanded = await save();
    assert.equal(
      commanded.countries.turkey.air.wings.find(
        (wing) => wing.id === "tr-fighter",
      ).mission,
      "idle",
    );
    assert.deepEqual(ownReport(commanded), ownReport(current));
    await tab("Hava / Deniz");
    await page.getByTestId("naval-control-tab").click();
    await page
      .getByLabel("Yönetilecek gemi", { exact: true })
      .selectOption("tr-cruiser");
    await page
      .getByLabel("Deniz görevi", { exact: true })
      .selectOption("escort");
    await page.getByTestId("apply-naval-order").click();
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
    await page.getByTestId("naval-control-tab").click();
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
    await page.getByTestId("naval-control-tab").click();
    assert.equal(await navy.isChecked(), false);
    await page.getByTestId("air-control-tab").click();
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

    await context.setOffline(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await checkLandControls("desktop");
    await load(current);
    await close();
    await page
      .getByRole("combobox", { name: "Harita görünümü", exact: true })
      .selectOption("naval");
    await page.getByTestId("map-theater-orders").click();
    assert.equal(
      await page.getByTestId("naval-control-tab").getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(
      await page.getByLabel("Yönetilecek gemi", { exact: true }).isVisible(),
    );
    await close();
    pass(
      "The 2D naval map shortcut opens the actual fleet command form directly",
    );
    await page.getByRole("button", { name: "3D arazi", exact: true }).click();
    await page.getByTestId("war-map-3d").waitFor();
    await page
      .getByRole("button", { name: "3D görüntü ölçümleri", exact: true })
      .filter({ hasText: /Durağan|FPS/ })
      .waitFor();
    await page
      .getByRole("combobox", { name: "Harita görünümü", exact: true })
      .selectOption("air");
    await focusCity("turkey-1");
    await page.waitForTimeout(700);
    await page.screenshot({
      path: path.join(output, "desktop-air-models.png"),
    });
    await page
      .getByRole("combobox", { name: "Harita görünümü", exact: true })
      .selectOption("naval");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(output, "desktop-naval-models.png"),
    });
    await page
      .getByRole("button", { name: "Deniz emirlerini aç", exact: true })
      .click();
    assert.equal(
      await page.getByTestId("naval-control-tab").getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(
      await page.getByLabel("Yönetilecek gemi", { exact: true }).isVisible(),
    );
    pass(
      "The 3D air and naval views render the campaign and their fleet shortcut opens actual naval commands",
    );
    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await mobileContext.addInitScript(() => {
      localStorage.setItem("xarmy-europa-map-view-v1", "2d");
      localStorage.setItem("xarmy-europa-3d-quality-v1", "low");
      localStorage.setItem("xarmy-europa-3d-motion-v1", "reduced");
    });
    page = await mobileContext.newPage();
    page.setDefaultTimeout(45000);
    page.on("pageerror", (error) => errors.push(`mobile: ${error.message}`));
    page.on("console", (entry) => {
      if (entry.type() === "error") errors.push(`mobile: ${entry.text()}`);
    });
    touch = true;
    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await activate(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
    const manualStart = structuredClone(initial);
    for (const wing of manualStart.countries.turkey.air.wings)
      wing.mission = "idle";
    for (const ship of manualStart.countries.turkey.navy.ships)
      ship.mission = "idle";
    assert.ok(validateWorld(manualStart));
    await load(manualStart);
    await tab("Hava / Deniz");
    await page
      .getByLabel("Yönetilecek hava kanadı", { exact: true })
      .selectOption("tr-fighter");
    await page.getByLabel("Görev", { exact: true }).selectOption("superiority");
    await page
      .getByLabel("Hedef bölge", { exact: true })
      .selectOption("bulgaria-2");
    assert.equal(
      await page.getByTestId("current-air-order").getAttribute("data-mission"),
      "idle",
    );
    const uncommitted = await save();
    assert.equal(
      uncommitted.countries.turkey.air.wings.find(
        (wing) => wing.id === "tr-fighter",
      ).mission,
      "idle",
    );
    pass(
      "Touch mobile draft fields do not silently change missions before the explicit apply action",
    );

    await tab("Hava / Deniz");
    await page
      .getByLabel("Yönetilecek hava kanadı", { exact: true })
      .selectOption("tr-fighter");
    await page.getByLabel("Görev", { exact: true }).selectOption("superiority");
    await page
      .getByLabel("Hedef bölge", { exact: true })
      .selectOption("bulgaria-2");
    await activate(page.getByTestId("apply-air-order"));
    assert.equal(
      await page.getByTestId("current-air-order").getAttribute("data-mission"),
      "superiority",
    );
    await page
      .getByLabel("Yönetilecek hava kanadı", { exact: true })
      .selectOption("tr-bomb");
    await page
      .getByLabel("Hava üssü", { exact: true })
      .selectOption("turkey-city-13");
    await page.getByLabel("Görev", { exact: true }).selectOption("strategic");
    await page
      .getByLabel("Hedef bölge", { exact: true })
      .selectOption("bulgaria-2");
    await activate(page.getByTestId("apply-air-order"));
    await page.getByTestId("manual-air-orders").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "touch-mobile-air-order.png"),
    });
    await activate(page.getByTestId("naval-control-tab"));
    await page
      .getByLabel("Yönetilecek gemi", { exact: true })
      .selectOption("tr-cruiser");
    await page
      .getByLabel("Deniz görevi", { exact: true })
      .selectOption("patrol");
    await page
      .getByLabel("Deniz bölgesi", { exact: true })
      .selectOption("black");
    await activate(page.getByTestId("apply-naval-order"));
    assert.equal(
      await page
        .getByTestId("current-naval-order")
        .getAttribute("data-mission"),
      "patrol",
    );
    await page.getByTestId("manual-naval-orders").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "touch-mobile-naval-order.png"),
    });
    const mobileCommanded = await save();
    for (const area of ["air", "navy"])
      assert.equal(mobileCommanded.countries.turkey.automation[area], false);
    assert.equal(
      mobileCommanded.countries.turkey.air.wings.find(
        (wing) => wing.id === "tr-fighter",
      ).target,
      "bulgaria-2",
    );
    assert.equal(
      mobileCommanded.countries.turkey.air.wings.find(
        (wing) => wing.id === "tr-bomb",
      ).mission,
      "strategic",
    );
    const rebasedBomber = mobileCommanded.countries.turkey.air.wings.find(
      (wing) => wing.id === "tr-bomb",
    );
    assert.equal(rebasedBomber.base, "turkey-city-13");
    assert.equal(
      rebasedBomber.readiness,
      70,
      "Moving to the chosen air base must pay the actual readiness cost",
    );
    assert.equal(
      mobileCommanded.countries.turkey.navy.ships.find(
        (ship) => ship.id === "tr-cruiser",
      ).mission,
      "patrol",
    );
    pass(
      "Touch mobile applies real fighter, bomber and naval patrol orders while both AI helpers remain off",
    );

    await advanceClockHours(page, 1, 1);
    const mobileSettled = await save();
    assert.deepEqual(mobileSettled, simulateTo(mobileCommanded, mobileSettled));
    const effects = ownReport(mobileSettled);
    assert.ok(
      effects.air.flown > 0 &&
        effects.air.fuelSpent > 0 &&
        effects.air.bombingDamage > 0,
    );
    assert.ok(
      effects.navy.active > 0 &&
        effects.navy.fuelSpent > 0 &&
        effects.navy.combatDamage > 0,
    );
    await load(mobileSettled);
    await tab("Hava / Deniz");
    await checkReport(mobileSettled);
    await screenshot("touch-mobile-real-mission-results");
    assert.deepEqual(await save(), mobileSettled);
    pass(
      "Manually issued mobile missions produce actual fuel use, bombing and naval battle effects; their save reloads unchanged",
    );
    await checkLandControls("mobile");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    pass("Touch mobile map and command panels stay within the viewport");
    await mobileContext.close();
    page = null;
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
