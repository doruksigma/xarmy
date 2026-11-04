/* Public-UI acceptance for faster time, real contact damage and capital guards.
 * Run against a fresh production build with Playwright on NODE_PATH.
 * Imports use validated save files; no application hooks or mocked simulation.
 * EUROPA_FIXTURES_ONLY=1 validates the focused combat fixture without a browser.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-tempo";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".europa-tempo-browser-"),
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
    const { declareWar } = require(path.join(strategy, "diplomacy.js"));
    const { encodeSave, decodeSave } = require(
      path.join(strategy, "storage.js"),
    );
    const { SIMULATION_HOUR_MS } = require(
      path.join(strategy, "simulation.js"),
    );
    const { LAND_COMBAT_TEMPO } = require(path.join(strategy, "land.js"));
    const tick = (world) => world.day * 24 + world.hour;
    const strength = (world, id) =>
      world.armies.find((army) => army.id === id)?.strength ?? 0;
    const assertCapitalGuards = (world) => {
      const guarded = [];
      for (const country of Object.values(world.countries)) {
        if (
          country.capitulated ||
          world.provinces[country.capital].controller !== country.id
        )
          continue;
        assert.ok(
          world.armies.some(
            (army) =>
              army.country === country.id &&
              army.province === country.capital &&
              army.strength > 0 &&
              !army.move &&
              !army.route.length,
          ),
          `An idle defender must remain in ${country.name}'s controlled capital`,
        );
        guarded.push(country.id);
      }
      return guarded;
    };
    const battleFixture = () => {
      let world = createWorld("turkey", "historical", 1936, "hard");
      // Retain genuine initial capital defenders; isolate the border engagement
      // from unrelated starting formations and automated player orders.
      world.armies = world.armies.filter(
        (army) => army.province === world.countries[army.country].capital,
      );
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
      const origin = MAP.provinces.find(
        (province) =>
          province.country === "turkey" &&
          province.neighbors.some(
            (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "bulgaria",
          ),
      );
      assert.ok(origin);
      const target = origin.neighbors.find(
        (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "bulgaria",
      ).id;
      declareWar(world, "turkey", "bulgaria");
      // Begin immediately after Bulgaria's staggered tactical slot. This gives
      // the initial damage check a real contact window before its next order;
      // the later clock run crosses that slot and checks its capital reserve.
      const defenderIndex = Object.keys(world.countries).indexOf("bulgaria");
      world.hour = (6 - (defenderIndex % 6)) % 6;
      const attacker = addArmy(world, "turkey", origin.id, "infantry");
      const defender = addArmy(world, "bulgaria", target, "infantry");
      for (const army of [attacker, defender]) {
        army.organization = 100;
        army.general = null;
        world.provinces[army.province].buildings.infra = 10;
        world.provinces[army.province].buildings.hub = 5;
      }
      const moved = applyAction(world, {
        type: "move",
        army: attacker.id,
        to: target,
      });
      assert.equal(moved.error, null);
      world = advanceHours(moved.world, 1);
      assert.ok(world.battles.some((battle) => battle.province === target));
      assert.ok(
        strength(world, attacker.id) < 100 &&
          strength(world, defender.id) < 100,
      );
      assertCapitalGuards(world);
      return {
        world: decodeSave(encodeSave(world)),
        target,
        attacker: attacker.id,
        defender: defender.id,
      };
    };
    assert.equal(SIMULATION_HOUR_MS, 150);
    assert.ok(LAND_COMBAT_TEMPO > 1);
    const initial = createWorld("vatican", "historical", 1936, "hard");
    const capitalCountries = assertCapitalGuards(initial);
    assert.equal(
      capitalCountries.length,
      Object.keys(initial.countries).length,
    );
    const battle = battleFixture();
    samples.push({
      simulationHourMs: SIMULATION_HOUR_MS,
      landCombatTempo: LAND_COMBAT_TEMPO,
      guardedCountries: capitalCountries.length,
    });
    pass(
      "All initial capitals, including tiny countries, have real defenders and the validated battle applies mutual damage",
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
    const readTick = async () =>
      Number(
        await page.getByTestId("game-date").getAttribute("data-game-hour"),
      );
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
      await page
        .getByLabel("Sefer kayıt dosyası")
        .setInputFiles({
          name: "tempo-campaign.json",
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
    const screenshot = (name) =>
      page.screenshot({ path: path.join(output, name + ".png") });
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
    const simulateTo = (before, after) => {
      assert.ok(tick(after) > tick(before) && tick(after) - tick(before) < 96);
      let expected = before;
      while (tick(expected) < tick(after))
        expected = advanceHours(
          expected,
          Math.min(24, tick(after) - tick(expected)),
        );
      return decodeSave(encodeSave(expected));
    };
    const advanceInBrowser = async (speed, minimumHours, interact = false) => {
      const before = await readTick();
      await page
        .getByRole("button", { name: `${speed} kat hız`, exact: true })
        .click();
      const started = Date.now();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .click();
      if (interact) {
        await tab("Ordu");
        await page.getByTestId("army-recruitment").waitFor();
        await close();
      }
      await page.waitForFunction(
        (target) =>
          Number(
            document
              .querySelector('[data-testid="game-date"]')
              ?.getAttribute("data-game-hour"),
          ) >= target,
        before + minimumHours,
        { timeout: 60000 },
      );
      await pause();
      const after = await readTick();
      await page.waitForTimeout(Math.max(600, SIMULATION_HOUR_MS * 4));
      assert.equal(
        await readTick(),
        after,
        "Pausing must reject late worker results and stop campaign time",
      );
      samples.push({
        clock: {
          speed,
          hours: after - before,
          observedMs: Date.now() - started,
          requestedHourMs: SIMULATION_HOUR_MS / speed,
          interactionDuringSimulation: interact,
        },
      });
      return save();
    };

    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(
      await page.getByLabel("Sefer zorluğu", { exact: true }).inputValue(),
      "hard",
    );
    await page.getByLabel("Komuta edeceğin ülke").selectOption("vatican");
    await screenshot("default-hard-tiny-country");
    await page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }).click();
    let current = await save();
    assert.equal(current.player, "vatican");
    assert.equal(current.difficulty, "hard");
    assertCapitalGuards(current);
    await focus(current.countries.vatican.capital);
    await screenshot("vatican-capital-defender");
    pass(
      "The public setup defaults to hard and even the Vatican starts with its actual capital defender",
    );

    for (const difficulty of ["easy", "normal"]) {
      const existing = createWorld("turkey", "historical", 1939, difficulty);
      await load(existing);
      assert.equal((await save()).difficulty, difficulty);
    }
    pass(
      "Loading existing easy and normal campaigns preserves their saved difficulty",
    );

    await load(battle.world);
    await focus(battle.target);
    await screenshot("ongoing-border-battle-before");
    current = await advanceInBrowser(1, 3, true);
    assert.deepEqual(current, simulateTo(battle.world, current));
    assert.ok(
      strength(current, battle.attacker) <
        strength(battle.world, battle.attacker),
    );
    assert.ok(
      strength(current, battle.defender) <
        strength(battle.world, battle.defender),
    );
    assert.ok(
      current.countries.turkey.casualties >
        battle.world.countries.turkey.casualties,
    );
    assert.ok(
      current.countries.bulgaria.casualties >
        battle.world.countries.bulgaria.casualties,
    );
    assertCapitalGuards(current);
    await screenshot("ongoing-border-battle-after");
    pass(
      "At 1x the real worker advances a live war, both armies lose strength, panels respond and pause holds",
    );

    for (let speed = 1; speed <= 5; speed++) {
      const button = page.getByRole("button", {
        name: `${speed} kat hız`,
        exact: true,
      });
      await button.click();
      assert.match(await button.getAttribute("class"), /active/);
      assert.ok(
        (await button.getAttribute("title")).includes(
          ((speed * 1000) / SIMULATION_HOUR_MS).toLocaleString("tr-TR", {
            maximumFractionDigits: 1,
          }),
        ),
      );
    }
    const fasterBefore = current;
    current = await advanceInBrowser(5, 8);
    assert.deepEqual(current, simulateTo(fasterBefore, current));
    assertCapitalGuards(current);
    samples.push({
      battle: {
        attackerStrengthBefore: strength(battle.world, battle.attacker),
        attackerStrengthAfter: strength(current, battle.attacker),
        defenderStrengthBefore: strength(battle.world, battle.defender),
        defenderStrengthAfter: strength(current, battle.defender),
        controlledEnemyCapital:
          current.provinces[current.countries.bulgaria.capital].controller,
      },
    });
    pass(
      "All five speeds work; 5x crosses a hard-AI tactical interval without changing simulation rules or abandoning capitals",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["Zamanı başlat", "1 kat hız", "5 kat hız"]) {
      const button = page.getByRole("button", { name, exact: true });
      assert.ok(
        await button.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= 0 &&
            box.bottom <= innerHeight
          );
        }),
      );
    }
    await screenshot("mobile-clock-and-war");
    pass("The mobile clock and speed controls remain visible at 390px");
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
