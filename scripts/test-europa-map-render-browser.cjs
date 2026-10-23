/* Regression checks for live map layers after rendering optimizations.
   Requires a production server, Playwright on NODE_PATH and Chromium.
   Fixtures enter only through the public save-file import; captures use the real clock. */
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
  addArmy,
  GEOGRAPHY,
  MAP,
  localSupply,
  supplyNetwork,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-map-render";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [],
    checks = [];
  let page;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    const tab = (name) => page.locator(`button[title="${name}"]`).click();
    const region = (id) => page.locator(`[data-province="${id}"]`);
    const mode = (value) =>
      page.getByLabel("Harita görünümü", { exact: true }).selectOption(value);
    const load = async (world) => {
      // Validate fixture as the real save format before sending it through the UI.
      const encoded = encodeSave(decodeSave(encodeSave(world)));
      await tab("Kayıtlar");
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: "map-render-check.json",
        mimeType: "application/json",
        buffer: Buffer.from(encoded),
      });
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
    };
    const focus = async (id) => {
      await page
        .getByRole("textbox", { name: "Şehir bul", exact: true })
        .fill(GEOGRAPHY[id].name);
      await page
        .getByRole("list", { name: "Şehir arama sonuçları" })
        .getByRole("button")
        .filter({ hasText: GEOGRAPHY[id].name })
        .first()
        .click();
      await region(id).waitFor();
    };
    const expectedFill = async (id, fill) =>
      page.waitForFunction(
        ({ id, fill }) =>
          document
            .querySelector(`[data-province="${id}"]`)
            ?.getAttribute("fill") === fill,
        { id, fill },
      );
    const occupationCount = (id) =>
      page
        .getByTestId("war-map")
        .locator('path[fill="url(#occupied)"]')
        .evaluateAll(
          (paths, d) => paths.filter((p) => p.getAttribute("d") === d).length,
          GEOGRAPHY[id].path,
        );
    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    const world = createWorld("germany", "historical", 1936, "normal");
    declareWar(world, "germany", "poland");
    world.armies = [];
    const origin = MAP.provinces.find(
      (p) =>
        p.country === "germany" &&
        p.neighbors.some((n) => !n.sea && GEOGRAPHY[n.id].country === "poland"),
    ).id;
    const target = GEOGRAPHY[origin].neighbors.find(
      (n) => !n.sea && GEOGRAPHY[n.id].country === "poland",
    ).id;
    const attacker = addArmy(world, "germany", origin);
    attacker.organization = 100;
    attacker.move = { to: target, days: 2, progress: 2 };
    await load(world);
    await focus(target);
    await mode("political");
    await expectedFill(target, world.countries.poland.color);
    assert.equal(await occupationCount(target), 0);
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await expectedFill(target, world.countries.germany.color);
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    assert.equal(
      await region(target).getAttribute("aria-label"),
      `${GEOGRAPHY[target].name}, ${world.countries.germany.name}`,
    );
    assert.equal(await occupationCount(target), 1);
    assert.ok(
      (
        await page
          .locator(`[data-army="${attacker.id}"]`)
          .getAttribute("aria-label")
      ).includes(GEOGRAPHY[target].name),
    );
    checks.push(
      "Real simulation capture updates province color, accessible owner, occupation overlay and army position without reloading the map",
    );
    await load(world);
    await focus(target);
    await expectedFill(target, world.countries.poland.color);
    assert.equal(
      await region(target).getAttribute("aria-label"),
      `${GEOGRAPHY[target].name}, ${world.countries.poland.name}`,
    );
    assert.equal(await occupationCount(target), 0);
    await mode("military");
    await expectedFill(target, "#a46d60");
    checks.push(
      "Loading the earlier campaign restores owner and removes occupation; military mode immediately shows enemy territory",
    );
    const peace = createWorld("germany", "historical", 1936, "normal");
    await load(peace);
    await focus(target);
    await expectedFill(target, "#71756a");
    peace.countries.germany.allies.push("poland");
    peace.countries.poland.allies.push("germany");
    await load(peace);
    await focus(target);
    await expectedFill(target, "#79979d");
    checks.push(
      "Military province colors update from enemy to neutral to allied after campaign/diplomacy changes",
    );
    const capital = peace.countries.germany.capital;
    peace.armies = [];
    Object.assign(peace.provinces[capital].buildings, {
      infra: 5,
      rail: 5,
      hub: 3,
    });
    peace.provinces[capital].damage = 0;
    await load(peace);
    await focus(capital);
    await mode("supply");
    const supplyFill = (w) =>
      `hsl(${localSupply(w, w.player, capital, supplyNetwork(w, w.player)) * 110} 29% 42%)`;
    const healthy = supplyFill(peace);
    await expectedFill(capital, healthy);
    peace.provinces[capital].damage = 100;
    Object.assign(peace.provinces[capital].buildings, {
      infra: 0,
      rail: 0,
      hub: 0,
    });
    await load(peace);
    await focus(capital);
    const damaged = supplyFill(peace);
    assert.notEqual(healthy, damaged);
    await expectedFill(capital, damaged);
    checks.push(
      "Supply layer recalculates after infrastructure and damage changes instead of retaining cached province color",
    );
    const neighbor = GEOGRAPHY[capital].neighbors.find(
      (n) => !n.sea && GEOGRAPHY[n.id].country === "germany",
    ).id;
    await region(neighbor).focus();
    await page.keyboard.press("Enter");
    assert.equal(await region(neighbor).getAttribute("tabindex"), "0");
    assert.equal(await region(capital).getAttribute("tabindex"), "-1");
    assert.equal(
      await page.locator(`[data-city-label="${neighbor}"]`).count(),
      1,
    );
    checks.push(
      "Keyboard activation uses the current selection handler after campaign/day changes; selected-city label and tab stop stay live",
    );
    await page.screenshot({ path: path.join(output, "live-map.png") });
    assert.deepEqual(errors, []);
    const report = { result: "passed", checks, errors };
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } catch (error) {
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify({ error: error.stack, checks, errors }, null, 2),
    );
    if (page)
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
