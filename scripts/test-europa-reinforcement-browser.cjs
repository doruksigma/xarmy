/* Public-UI acceptance for paid ground replacements. Requires a production
 * server; ordinary validated save files are the only scenario input. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/europa-reinforcement-browser";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".reinforcement-browser-"),
  );
  const checks = [],
    errors = [];
  let browser, page;
  const report = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors }, null, 2),
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
    const source = path.join(compiled, "app/games/europa-war/strategy");
    const { createWorld, GEOGRAPHY } = require(path.join(source, "world.js"));
    const { reserveReinforcements, resolveReinforcements } = require(
      path.join(source, "reinforcements.js"),
    );
    const { encodeSave, decodeSave, validateWorld } = require(
      path.join(source, "storage.js"),
    );
    const { declareWar } = require(path.join(source, "diplomacy.js"));
    const initial = createWorld("turkey");
    for (const country of Object.values(initial.countries)) {
      country.automation = {
        economy: false,
        research: false,
        recruitment: false,
        operations: false,
        air: false,
        navy: false,
      };
      country.autoAssignCommanders = false;
      for (const general of country.generals) delete general.front;
    }
    const country = initial.countries.turkey;
    country.production = [];
    const army = initial.armies.find(
      (a) => a.country === country.id && a.type === "infantry",
    );
    assert.ok(army);
    army.province = GEOGRAPHY[country.capital].neighbors.find(
      (edge) =>
        !edge.sea && initial.provinces[edge.id].controller === country.id,
    ).id;
    army.strength = 80;
    army.supply = 1;
    army.general = null;
    army.route = [];
    army.move = null;
    const originalRifles = country.equipment.rifle;
    reserveReinforcements(initial, new Set([army.id]));
    assert.ok(initial.reinforcements.shipments.length === 1);
    const shipmentId = initial.reinforcements.shipments[0].id;
    assert.equal(army.strength, 80);
    assert.equal(
      country.equipment.rifle +
        initial.reinforcements.shipments[0].cargo.equipment.rifle,
      originalRifles,
    );
    assert.ok(validateWorld(initial));
    const blocked = structuredClone(initial);
    declareWar(blocked, "turkey", "greece");
    for (const edge of GEOGRAPHY[country.capital].neighbors)
      blocked.provinces[edge.id].controller = "greece";
    // Isolate the depot by control, and progress only this real shipment model.
    for (let i = 0; i < 3; i++) {
      blocked.hour++;
      resolveReinforcements(blocked, new Set([army.id]));
    }
    assert.equal(blocked.reinforcements.shipments[0].blocked, "route");
    assert.ok(validateWorld(blocked));
    pass(
      "Ordinary saved campaigns contain paid in-transit cargo and a real cut supply route",
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
      ],
    });
    for (const [device, viewport, mobile] of [
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
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) =>
        errors.push(`${device}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`${device}: ${entry.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const pause = async () => {
        const stop = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await stop.isVisible()) await click(stop);
      };
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
      const load = async (world) => {
        await pause();
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "reinforcements.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await close();
        await pause();
      };
      const save = async () => {
        await pause();
        await tab("Kayıtlar");
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
        await close();
        return world;
      };
      const openLogistics = async () => {
        await tab("Ordu");
        const panel = page.getByTestId("reinforcement-logistics");
        await panel.scrollIntoViewIfNeeded();
        const details = panel.locator("details");
        if ((await details.getAttribute("open")) === null)
          await click(panel.locator("summary"));
        return panel;
      };
      const value = async (id) =>
        Number(
          await page
            .getByTestId(`reinforcement-${id}`)
            .getAttribute("data-value"),
        );
      const screenshot = async (name) =>
        page.screenshot({ path: path.join(output, `${device}-${name}.png`) });
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByLabel("Komuta edeceğin ülke").selectOption("turkey");
      await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
      await pause();
      await close();
      await load(initial);
      const panel = await openLogistics();
      assert.equal(await panel.getAttribute("data-country"), "turkey");
      assert.equal(
        await value("transit-manpower"),
        initial.reinforcements.shipments[0].cargo.manpower,
      );
      assert.equal(await value("free-rifle"), country.equipment.rifle);
      assert.equal(await value("delivered-rifle"), 0);
      assert.ok(
        await page
          .getByTestId(`reinforcement-shipment-${shipmentId}`)
          .isVisible(),
      );
      await screenshot("paid-cargo");
      assert.deepEqual(await save(), initial);
      pass(
        `${device}: depot, reserved cargo and ledger show the actual imported values without changing the campaign`,
      );

      await load(blocked);
      await openLogistics();
      assert.equal(
        await page
          .getByTestId(`reinforcement-shipment-${shipmentId}`)
          .getAttribute("data-blocked"),
        "route",
      );
      assert.equal(await value("delivered-manpower"), 0);
      await screenshot("blocked-route");
      assert.deepEqual(await save(), blocked);
      pass(
        `${device}: a severed route displays its real waiting state and cannot deliver cargo`,
      );

      await load(initial);
      await openLogistics();
      await click(page.getByRole("button", { name: "1 kat hız", exact: true }));
      await click(
        page.getByRole("button", { name: "Zamanı başlat", exact: true }),
      );
      await page.waitForFunction(
        () =>
          Number(
            document
              .querySelector('[data-testid="reinforcement-delivered-manpower"]')
              ?.getAttribute("data-value"),
          ) > 0,
      );
      await pause();
      await page
        .getByTestId("reinforcement-logistics")
        .scrollIntoViewIfNeeded();
      await screenshot("delivered");
      const arrived = await save();
      assert.ok(arrived.armies.find((a) => a.id === army.id).strength > 80);
      const ledger = arrived.reinforcements.ledger.turkey;
      assert.ok(ledger.delivered.manpower > 0);
      const pending = arrived.reinforcements.shipments
        .filter((s) => s.country === "turkey")
        .reduce((n, s) => n + s.cargo.manpower, 0);
      assert.ok(
        Math.abs(
          ledger.dispatched.manpower -
            ledger.delivered.manpower -
            ledger.returned.manpower -
            ledger.lost.manpower -
            pending,
        ) < 1e-7,
      );
      assert.ok(
        Math.abs(
          arrived.countries.turkey.equipment.rifle +
            ledger.dispatched.equipment.rifle -
            (ledger.returned.equipment.rifle || 0) -
            originalRifles,
        ) < 1e-7,
      );
      assert.ok(validateWorld(arrived));
      await load(arrived);
      await openLogistics();
      assert.equal(
        await value("delivered-manpower"),
        ledger.delivered.manpower,
      );
      assert.deepEqual(await save(), arrived);
      pass(
        `${device}: the real running simulation delivers paid cargo once, strengthens its recipient, and preserves the ledger after reload`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      pass(
        `${device}: logistics is readable and scrollable without page overflow`,
      );
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
