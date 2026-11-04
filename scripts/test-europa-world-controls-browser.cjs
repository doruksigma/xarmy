/* World-1936 acceptance journey against a production build.
 * Run with Playwright on NODE_PATH after npm run build && npm start.
 * Campaigns enter through ordinary validated save imports. Commands use the
 * public interface; canvas diagnostics and saved campaigns are read-only.
 * No absolute frame-rate claim: SwiftShader is not a physical mobile GPU.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const focused = process.env.EUROPA_RECRUITMENT_OFFLINE_ONLY === "1";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-world-controls";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".europa-world-browser-"),
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
        "app/games/europa-war/strategy/simulation.ts",
        "app/games/europa-war/strategy/map3d-airnaval-state.ts",
      ],
      { cwd: root, stdio: "pipe" },
    );
    const strategy = path.join(compiled, "app/games/europa-war/strategy");
    const { createWorld, addArmy, GEOGRAPHY, MAP } = require(
      path.join(strategy, "world.js"),
    );
    const { applyAction, advanceHours } = require(
      path.join(strategy, "engine.js"),
    );
    const { encodeSave, decodeSave } = require(
      path.join(strategy, "storage.js"),
    );
    const { TECHNOLOGIES, UNITS } = require(path.join(strategy, "catalog.js"));
    const { AIRCRAFT, SHIPS } = require(
      path.join(strategy, "advanced-catalog.js"),
    );
    const { airNavalUnits } = require(
      path.join(strategy, "map3d-airnaval-state.js"),
    );
    const { seaControl } = require(path.join(strategy, "military-assets.js"));
    const { SIMULATION_HOUR_MS } = require(
      path.join(strategy, "simulation.js"),
    );
    const tick = (world) => world.day * 24 + world.hour;
    const command = (world, action) => {
      const result = applyAction(world, action);
      assert.equal(result.error, null, JSON.stringify(action));
      return result.world;
    };
    const ownProvince = (world, predicate) =>
      Object.values(world.provinces).find(
        (province) =>
          province.owner === world.player &&
          province.controller === world.player &&
          predicate(province),
      );
    const fixture = (types = []) => {
      let world = createWorld("turkey", "historical", 1936, "easy");
      world.hour = 22;
      world.armies = [];
      for (const country of Object.values(world.countries)) {
        country.automation = {
          economy: false,
          research: false,
          recruitment: false,
          operations: false,
          air: false,
          navy: false,
        };
        country.autoAssignCommanders = false;
        country.air.wings = [];
        country.navy.ships = [];
        for (const general of country.generals) delete general.front;
      }
      const player = world.countries[world.player];
      player.tech = TECHNOLOGIES.map((technology) => technology.id);
      player.manpower = 500000;
      player.stock.fuel = 1000;
      player.recruitment = [];
      for (const equipment of Object.keys(player.equipment))
        player.equipment[equipment] = 1000;
      // Keep AI opt-in checks bounded: no hidden stockpile of 1,000 ships.
      for (const model of [...Object.keys(AIRCRAFT), ...Object.keys(SHIPS)])
        player.equipment[model] = 0;
      player.equipment.fighter = 30;
      player.equipment.destroyer = 1;
      world.provinces[player.capital].buildings.airfield = 5;
      for (let index = 0; index < types.length; index++) {
        const army = addArmy(world, world.player, player.capital, types[index]);
        army.strength = 100 - index * 20;
        army.organization = 85 - index * 10;
      }
      const port = ownProvince(
        world,
        (province) => GEOGRAPHY[province.id].port,
      );
      assert.ok(
        port,
        "The player needs a real controlled port for the naval journey",
      );
      world = command(world, {
        type: "commission",
        model: "destroyer",
        port: port.id,
      });
      return decodeSave(encodeSave(world));
    };
    for (const id of ["usa", "japan", "brazil"]) {
      const world = decodeSave(encodeSave(createWorld(id)));
      const country = world.countries[id];
      assert.equal(world.provinces[country.capital].controller, id);
      assert.ok(
        GEOGRAPHY[country.capital].x >= 0 &&
          GEOGRAPHY[country.capital].x <= MAP.width,
      );
      assert.ok(
        GEOGRAPHY[country.capital].y >= 0 &&
          GEOGRAPHY[country.capital].y <= MAP.height,
      );
    }
    assert.equal(MAP.scenario, "world-1936-v1");
    assert.ok(MAP.width > 1320 && MAP.height > 880);
    const controls = fixture();
    const tankOnly = fixture([
      "lightTank",
      "lightTank",
      "lightTank",
      "lightTank",
    ]);
    let mixed = fixture(["infantry", "lightTank", "artillery", "motorized"]);
    const capital = controls.countries.turkey.capital;
    const second = ownProvince(
      controls,
      (province) => province.id !== capital,
    ).id;
    mixed = command(mixed, {
      type: "createWing",
      model: "fighter",
      count: 10,
      base: capital,
    });
    mixed = command(mixed, {
      type: "wing",
      id: mixed.countries.turkey.air.wings[0].id,
      mission: "superiority",
      target: capital,
    });
    const fighter = airNavalUnits(mixed).find((unit) => unit.airborne);
    assert.ok(fighter?.active && fighter.scale === 0.55);
    assert.equal(SIMULATION_HOUR_MS, 150);
    samples.push({
      world: {
        scenario: MAP.scenario,
        countries: MAP.countries.length,
        provinces: MAP.provinces.length,
        width: MAP.width,
        height: MAP.height,
      },
      simulationHourMs: SIMULATION_HOUR_MS,
    });
    pass(
      "1936 global campaigns and focused fixtures pass the actual save validator",
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
      serviceWorkers: focused ? "allow" : "block",
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
    const canvas = page.getByTestId("war-map-3d");
    const load = async (world) => {
      await pause();
      const previous = (await canvas.count())
        ? await canvas.elementHandle()
        : null;
      await tab("Kayıtlar");
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: "world-controls.json",
        mimeType: "application/json",
        buffer: Buffer.from(encodeSave(world)),
      });
      if (previous) {
        await page.waitForFunction((element) => !element.isConnected, previous);
        await previous.dispose();
      }
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
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
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      await close();
    };
    const focus = async (id) => {
      await close();
      await page
        .getByLabel("Şehir bul", { exact: true })
        .fill(GEOGRAPHY[id].name);
      await page
        .getByRole("list", { name: "Şehir arama sonuçları" })
        .getByRole("button")
        .filter({ hasText: GEOGRAPHY[id].name })
        .first()
        .click();
      await close();
    };
    const stats = () => canvas.evaluate((element) => ({ ...element.dataset }));
    const rendered = () =>
      page.waitForFunction(
        () =>
          document.querySelector('[data-testid="war-map-3d"]')?.dataset
            .ready === "true",
        null,
        { timeout: 120000 },
      );
    const screenshot = (name) =>
      page.screenshot({ path: path.join(output, name + ".png") });
    const airSwitch = () =>
      page.getByRole("switch", {
        name: "Hava kuvvetlerini yapay zekâ yönetsin",
        exact: true,
      });
    const navySwitch = () =>
      page.getByRole("switch", {
        name: "Deniz kuvvetlerini yapay zekâ yönetsin",
        exact: true,
      });
    const navyFold = async () => {
      const summary = page
        .locator("summary")
        .filter({ hasText: "Donanma ve deniz bölgeleri" });
      if (!(await summary.evaluate((element) => element.parentElement.open)))
        await summary.click();
    };

    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "DÜNYA, 1936.", exact: true })
      .waitFor();
    await screenshot("world-scenario");
    if (focused) {
      await page.getByLabel("Komuta edeceğin ülke").selectOption("turkey");
      await page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }).click();
      await load(controls);
      const assertQuickTraining = async () => {
        await tab("Ordu");
        const train = page.getByRole("button", { name: /^Eğitime başla ·/ });
        assert.equal(
          await page
            .getByLabel("Birliklerin çıkacağı şehir", { exact: true })
            .inputValue(),
          capital,
        );
        const summary = await page
          .getByTestId("recruitment-training-summary")
          .innerText();
        assert.ok(
          summary.includes(`${UNITS.infantry.days} gün`) &&
            summary.includes("9.000 asker") &&
            summary.includes("90"),
        );
        assert.ok(
          await train.evaluate((button) => {
            const bounds = button.getBoundingClientRect();
            const hit = document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            );
            const detail = document.querySelector(
              '[data-testid="recruitment-unit-stats"]',
            );
            return (
              bounds.top >= 0 &&
              bounds.bottom <= innerHeight &&
              button.contains(hit) &&
              !!(
                button.compareDocumentPosition(detail) &
                Node.DOCUMENT_POSITION_FOLLOWING
              )
            );
          }),
          "The train button must be reachable immediately, above detailed stats, without scrolling",
        );
      };
      await assertQuickTraining();
      await screenshot("desktop-recruitment-quick");
      await page.setViewportSize({ width: 390, height: 844 });
      await assertQuickTraining();
      await screenshot("mobile-recruitment-quick");
      await page.getByRole("button", { name: /^Eğitime başla ·/ }).click();
      const trained = await save();
      assert.deepEqual(
        trained.countries.turkey.recruitment.map((item) => [
          item.type,
          item.province,
        ]),
        [["infantry", capital]],
      );
      assert.equal(
        trained.countries.turkey.manpower,
        controls.countries.turkey.manpower - UNITS.infantry.men,
      );
      assert.equal(
        trained.countries.turkey.equipment.rifle,
        controls.countries.turkey.equipment.rifle -
          UNITS.infantry.equipment.rifle,
      );
      pass(
        "Desktop and 390px mobile expose capital, unit, cost/time summary and training above details; actual costs and queue remain correct",
      );

      await tab("Hava / Deniz");
      await screenshot("mobile-final-air-navy");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await close();
      await page.getByRole("button", { name: "3D arazi", exact: true }).click();
      await rendered();
      const overviewFrame = Number((await stats()).renderedFrames);
      await page
        .getByRole("button", { name: "Tüm haritayı göster", exact: true })
        .click();
      await page.waitForFunction(
        (previous) =>
          Number(
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .renderedFrames,
          ) > previous,
        overviewFrame,
        { timeout: 120000 },
      );
      const labels = await page.evaluate(() => {
        const all = [
          ...document.querySelectorAll('.map3d-label[data-kind="capital"]'),
        ];
        const visible = all.filter(
          (element) => getComputedStyle(element).display !== "none",
        );
        const boxes = visible.map((element) => element.getBoundingClientRect());
        let overlaps = 0;
        for (let left = 0; left < boxes.length; left++)
          for (let right = left + 1; right < boxes.length; right++) {
            const a = boxes[left],
              b = boxes[right];
            if (
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top
            )
              overlaps++;
          }
        return {
          visible: visible.length,
          overlaps,
          hidden: all
            .filter((element) => getComputedStyle(element).display === "none")
            .map((element) => element.textContent),
        };
      });
      assert.ok(labels.visible > 0 && labels.hidden.length > 0);
      assert.equal(
        labels.overlaps,
        0,
        "Visible capital labels must not overlap on the world overview",
      );
      await screenshot("final-world-overview-3d");
      const hiddenCapital = MAP.countries.find((country) =>
        labels.hidden.some((name) =>
          name.includes(GEOGRAPHY[country.capital].name),
        ),
      );
      assert.ok(hiddenCapital);
      await focus(hiddenCapital.capital);
      await page
        .locator('.map3d-label[data-kind="capital"]')
        .filter({ hasText: GEOGRAPHY[hiddenCapital.capital].name })
        .first()
        .waitFor({ state: "visible" });
      samples.push({
        capitalLabels: {
          visible: labels.visible,
          hidden: labels.hidden.length,
          overlaps: labels.overlaps,
          restoredAfterFocus: GEOGRAPHY[hiddenCapital.capital].name,
        },
      });
      await screenshot("final-capital-label-restored");
      pass(
        "World overview capital labels do not overlap and a hidden capital label reappears when focused",
      );
      await page
        .getByRole("button", { name: "2D siyasi harita", exact: true })
        .click();
      await tab("Komuta");
      const offlineDetails = page.getByText(
        "Sefer bilgileri ve çevrimdışı durum",
        { exact: true },
      );
      if ((await offlineDetails.locator("..").getAttribute("open")) === null)
        await offlineDetails.click();
      await page
        .getByText("Çevrimdışı kullanıma hazır · bu cihaz", { exact: true })
        .waitFor({ timeout: 120000 });
      const terrainUrl = await page
        .getByTestId("terrain-overlay")
        .getAttribute("href");
      assert.ok(terrainUrl);
      const cached = await page.evaluate(
        async (url) =>
          (await caches.match(new URL(url, location.href).href))?.ok,
        terrainUrl,
      );
      assert.equal(
        cached,
        true,
        "The final world terrain must be present in the offline cache",
      );
      await screenshot("mobile-offline-ready");
      const session = await context.newCDPSession(page);
      await session.send("Network.clearBrowserCache");
      await session.send("Network.setCacheDisabled", { cacheDisabled: true });
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Kayıtlı sefere devam et", { exact: true }).click();
      const label = `${trained.countries.turkey.name} · ${trained.day}. gün · ${String(trained.hour).padStart(2, "0")}:00 →`;
      await page
        .getByRole("button", { name: label, exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      let restored = await save();
      assert.equal(restored.mapVersion, "world-1936-v1");
      assert.deepEqual(
        restored.countries.turkey.recruitment,
        trained.countries.turkey.recruitment,
      );
      assert.equal(
        Object.keys(restored.provinces).length,
        MAP.provinces.length,
      );
      await page
        .getByRole("button", { name: "5 kat hız", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .click();
      await page.waitForFunction(
        (hour) =>
          Number(
            document
              .querySelector('[data-testid="game-date"]')
              ?.getAttribute("data-game-hour"),
          ) > hour,
        tick(restored),
        { timeout: 60000 },
      );
      await pause();
      const bitmap = await page.evaluate(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Offline world atlas unavailable");
        const bitmap = await createImageBitmap(await response.blob());
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
      }, terrainUrl);
      assert.ok(bitmap.width >= 1320 && bitmap.height >= 880);
      await page.getByRole("button", { name: "3D arazi", exact: true }).click();
      await rendered();
      assert.ok(Number((await stats()).triangles) > 0);
      await screenshot("offline-3d-global-campaign");
      await page
        .getByRole("button", { name: "2D siyasi harita", exact: true })
        .click();
      await page.locator('button[title="Yeni sefer"]').click();
      await page.getByLabel("Komuta edeceğin ülke").selectOption("brazil");
      await page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }).click();
      restored = await save();
      assert.equal(restored.player, "brazil");
      assert.equal(restored.mapVersion, "world-1936-v1");
      await page
        .getByRole("button", { name: "Tüm haritayı göster", exact: true })
        .click();
      await screenshot("offline-new-brazil");
      samples.push({
        offline: {
          httpCacheDisabled: true,
          terrain: bitmap,
          continuedCampaign: "turkey",
          startedCampaign: restored.player,
          provinces: Object.keys(restored.provinces).length,
        },
      });
      pass(
        "With networking and HTTP cache disabled, a reload restores the global save, runs a new worker, renders the world atlas in 2D/3D and starts Brazil",
      );
      assert.deepEqual(errors, []);
      report();
      console.log(
        JSON.stringify({
          passed: checks.length,
          report: path.join(output, "report.json"),
        }),
      );
      return;
    }
    for (const id of ["usa", "japan", "brazil"]) {
      if (id !== "usa")
        await page.locator('button[title="Yeni sefer"]').click();
      await page.getByLabel("Komuta edeceğin ülke").selectOption(id);
      await page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }).click();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      const world = await save();
      assert.equal(world.player, id);
      assert.equal(world.provinces[world.countries[id].capital].controller, id);
    }
    await screenshot("world-brazil");
    await page
      .getByRole("button", { name: "Tüm haritayı göster", exact: true })
      .click();
    await screenshot("world-overview-2d");
    pass(
      "USA, Japan and Brazil can each be selected and started through the scenario interface",
    );

    await load(controls);
    await tab("Ordu");
    const spawn = page.getByLabel("Birliklerin çıkacağı şehir", {
      exact: true,
    });
    assert.equal(await spawn.inputValue(), capital);
    await focus(second);
    await tab("Ordu");
    assert.equal(
      await spawn.inputValue(),
      capital,
      "Map selection must never redirect recruitment",
    );
    await page.getByRole("button", { name: /^Eğitime başla ·/ }).click();
    await spawn.selectOption(second);
    await page.getByRole("button", { name: /^Eğitime başla ·/ }).click();
    assert.equal(await page.getByTestId("recruitment-queue-item").count(), 2);
    await tab("Komuta");
    await tab("Ordu");
    assert.equal(
      await spawn.inputValue(),
      second,
      "Opening another tab must retain the chosen training city",
    );
    pass(
      "Ordu starts at the capital, ignores map selection and retains the player's chosen training city",
    );
    await page
      .getByRole("button", { name: "Birlik türünü değiştir", exact: true })
      .click();
    await page
      .getByRole("button", { name: `${UNITS.lightTank.name} seç`, exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Birlik türünü değiştir", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.ok(
      (await page.getByTestId("recruitment-unit-stats").innerText()).includes(
        UNITS.lightTank.name,
      ),
    );
    await page.getByRole("button", { name: /^Eğitime başla ·/ }).click();
    await page.getByTestId("army-recruitment").scrollIntoViewIfNeeded();
    await screenshot("desktop-recruitment");
    let current = await save();
    assert.deepEqual(
      current.countries.turkey.recruitment.map((item) => [
        item.type,
        item.province,
      ]),
      [
        ["infantry", capital],
        ["infantry", second],
        ["lightTank", second],
      ],
    );
    const selectedTypes = [UNITS.infantry, UNITS.infantry, UNITS.lightTank];
    assert.equal(
      current.countries.turkey.manpower,
      controls.countries.turkey.manpower -
        selectedTypes.reduce((sum, unit) => sum + unit.men, 0),
    );
    for (const equipment of Object.keys(controls.countries.turkey.equipment))
      assert.equal(
        current.countries.turkey.equipment[equipment],
        controls.countries.turkey.equipment[equipment] -
          selectedTypes.reduce(
            (sum, unit) => sum + (unit.equipment[equipment] || 0),
            0,
          ),
      );
    pass(
      "Different unit types reserve real manpower/equipment and queued units keep their individual cities",
    );

    await tab("Hava / Deniz");
    assert.equal(await airSwitch().isChecked(), false);
    assert.equal(await navySwitch().isChecked(), false);
    await page
      .locator("summary")
      .filter({ hasText: "Yeni hava kanadı kur" })
      .click();
    await page
      .getByLabel("Uçak modeli", { exact: true })
      .selectOption("fighter");
    await page.getByLabel("Üs", { exact: true }).selectOption(capital);
    await page.getByLabel("Uçak sayısı", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Kanat kur", exact: true }).click();
    await page.getByLabel("Görev", { exact: true }).selectOption("superiority");
    await page.getByLabel("Hedef bölge", { exact: true }).selectOption(second);
    await screenshot("desktop-air-control");
    current = await save();
    let player = current.countries.turkey;
    assert.equal(player.air.wings.length, 1);
    assert.equal(player.air.wings[0].count, 10);
    assert.equal(player.air.wings[0].mission, "superiority");
    assert.equal(player.air.wings[0].target, second);
    assert.equal(
      player.equipment.fighter,
      controls.countries.turkey.equipment.fighter - 10,
    );
    pass(
      "The simple interface creates and manually assigns a real air wing without enabling AI",
    );
    await tab("Hava / Deniz");
    await navyFold();
    await page.getByRole("button", { name: "Eskort", exact: true }).click();
    await screenshot("desktop-naval-control");
    current = await save();
    player = current.countries.turkey;
    assert.equal(player.navy.ships[0].mission, "escort");
    assert.ok(
      seaControl(current, "turkey", player.navy.ships[0].zone) >
        seaControl(controls, "turkey", player.navy.ships[0].zone),
    );
    pass("Manual ship orders change the saved mission and actual sea control");

    await tab("Hava / Deniz");
    await airSwitch().check();
    assert.equal(await navySwitch().isChecked(), false);
    current = await save();
    assert.equal(current.countries.turkey.automation.air, true);
    assert.equal(current.countries.turkey.automation.navy, false);
    assert.equal(current.countries.turkey.navy.ships[0].mission, "escort");
    await tab("Hava / Deniz");
    await airSwitch().uncheck();
    await navySwitch().check();
    current = await save();
    await load(current);
    await tab("Hava / Deniz");
    assert.equal(await airSwitch().isChecked(), false);
    assert.equal(await navySwitch().isChecked(), true);
    await navySwitch().uncheck();
    await page.getByLabel("Görev", { exact: true }).selectOption("superiority");
    await page.getByLabel("Hedef bölge", { exact: true }).selectOption(second);
    current = await save();
    assert.equal(current.countries.turkey.automation.air, false);
    assert.equal(current.countries.turkey.automation.navy, false);
    pass(
      "Air and navy assistance are independent, opt-in and preserved by save/import",
    );

    const before = current,
      startedAt = Date.now();
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      (hour) =>
        Number(
          document
            .querySelector('[data-testid="game-date"]')
            ?.getAttribute("data-game-hour"),
        ) >=
        hour + 3,
      tick(before),
      { timeout: 60000 },
    );
    await pause();
    current = await save();
    let expected = before;
    while (tick(expected) < tick(current))
      expected = advanceHours(
        expected,
        Math.min(24, tick(current) - tick(expected)),
      );
    assert.deepEqual(
      current,
      decodeSave(encodeSave(expected)),
      "The faster browser clock must retain the same simulation rules",
    );
    assert.ok(
      current.countries.turkey.recruitment[0].progress >
        before.countries.turkey.recruitment[0].progress,
    );
    assert.equal(current.countries.turkey.air.wings[0].target, second);
    samples.push({
      clock: {
        hours: tick(current) - tick(before),
        observedMs: Date.now() - startedAt,
        requestedHourMsAt5x: SIMULATION_HOUR_MS / 5,
      },
    });
    pass(
      "The faster real worker clock crosses midnight, advances training and agrees with engine results",
    );

    await load(tankOnly);
    await page.getByRole("button", { name: "3D arazi", exact: true }).click();
    await rendered();
    const overviewFrame = Number((await stats()).renderedFrames);
    await page
      .getByRole("button", { name: "Tüm haritayı göster", exact: true })
      .click();
    await page.waitForFunction(
      (previous) =>
        Number(
          document.querySelector('[data-testid="war-map-3d"]')?.dataset
            .renderedFrames,
        ) > previous,
      overviewFrame,
      { timeout: 120000 },
    );
    await screenshot("world-overview-3d");
    await focus(capital);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="war-map-3d"]')?.dataset
          .tankModels === "1",
      null,
      { timeout: 120000 },
    );
    let data = await stats();
    for (const key of ["infantryModels", "artilleryModels", "truckModels"])
      assert.equal(Number(data[key]), 0, key);
    assert.equal(Number(data.tankModels), 1);
    await screenshot("four-tanks-one-type");
    pass(
      "Four tank divisions render a tank representative without inventing infantry, artillery or trucks",
    );

    await load(mixed);
    await rendered();
    await focus(capital);
    await page.waitForFunction(
      () => {
        const data = document.querySelector(
          '[data-testid="war-map-3d"]',
        )?.dataset;
        return (
          data &&
          [
            "infantryModels",
            "tankModels",
            "artilleryModels",
            "truckModels",
          ].every((key) => data[key] === "1")
        );
      },
      null,
      { timeout: 120000 },
    );
    const health = page.locator(
      `[data-formation="turkey:${capital}:idle"] .map3d-unit-health`,
    );
    await health.waitFor({ state: "visible", timeout: 120000 });
    assert.equal(await health.getAttribute("data-strength"), "70.00");
    assert.equal(await health.getAttribute("data-organization"), "70.00");
    assert.equal(await health.innerText(), "CAN %70");
    data = await stats();
    samples.push({ models: data });
    await screenshot("mixed-unit-health");
    pass(
      "Actual infantry, tank, artillery and motorized types appear together with truthful 3D health bars",
    );
    assert.ok(Number(data.aircraftModels) > 0);
    assert.ok(Number(data.triangles) > 0 && Number(data.renderedFrames) > 0);
    samples.push({
      aircraft: {
        representativeScale: fighter.scale,
        renderedModels: Number(data.aircraftModels),
        note: "Scale is checked in the production scene descriptor; the screenshot confirms rendering, not a physical-device FPS measurement.",
      },
    });
    pass("A real assigned air wing renders using the reduced aircraft scale");

    for (let index = 0; index < 2; index++) {
      const frame = Number((await stats()).renderedFrames);
      await page
        .getByRole("button", { name: "Haritayı yakınlaştır", exact: true })
        .click();
      await page.waitForFunction(
        (previous) =>
          Number(
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .renderedFrames,
          ) > previous,
        frame,
        { timeout: 120000 },
      );
    }
    await screenshot("typed-models-closeup");

    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot("mobile-capital-health");
    await tab("Ordu");
    assert.equal(await spawn.inputValue(), capital);
    await page
      .getByRole("button", { name: /^Eğitime başla ·/ })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page.getByRole("button", { name: /^Eğitime başla ·/ }).isVisible(),
      true,
    );
    await screenshot("mobile-army");
    await tab("Hava / Deniz");
    assert.equal(await airSwitch().isVisible(), true);
    assert.equal(await navySwitch().isVisible(), true);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Mobile layout must not overflow horizontally",
    );
    await screenshot("mobile-air-navy");
    await close();
    await page
      .getByRole("button", { name: "2D siyasi harita", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tüm haritayı göster", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Haritayı yakınlaştır", exact: true })
      .click();
    const map = page.getByTestId("war-map"),
      initialBox = await map.getAttribute("viewBox");
    const rectangle = await map.boundingBox();
    assert.ok(rectangle && rectangle.height > 100);
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 2,
    });
    const startX = rectangle.x + rectangle.width * 0.62,
      startY = rectangle.y + rectangle.height * 0.55;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y: startY }],
    });
    for (let step = 1; step <= 5; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX - step * 18, y: startY + step * 8 }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForFunction(
      (previous) =>
        document
          .querySelector('[data-testid="war-map"]')
          ?.getAttribute("viewBox") !== previous,
      initialBox,
    );
    samples.push({
      mobilePan: {
        before: initialBox,
        after: await map.getAttribute("viewBox"),
      },
    });
    await screenshot("mobile-world-pan");
    pass(
      "At 390px recruitment and manual air/naval controls remain usable and the world map pans by touch",
    );
    assert.deepEqual(errors, [], "No unhandled browser errors are permitted");
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
