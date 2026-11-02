/* Real player controls exercise command previews, atomic failure, journals and
   save/load across desktop and touch mobile. Fixtures enter via the save UI;
   assertions inspect exported saves, never React state or private app hooks. */
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
  dateLabel,
} = require("../app/games/europa-war/strategy/world.ts");
const {
  BUILDINGS,
  UNITS,
} = require("../app/games/europa-war/strategy/catalog.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-command-protocol";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });
function fixture(treasury = 10000) {
  const world = createWorld("turkey", "historical", 1936, "easy");
  for (const country of Object.values(world.countries))
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
  world.countries.turkey.treasury = treasury;
  world.countries.turkey.manpower = 500000;
  world.countries.turkey.equipment.rifle = 10000;
  return world;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const checks = [],
    errors = [];
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
      });
      await context.addInitScript(() =>
        localStorage.setItem("xarmy-europa-map-view-v1", "2d"),
      );
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
      page.on("console", (e) => {
        if (e.type() === "error") errors.push(`${label}: ${e.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const tab = (name) => click(page.locator(`button[title="${name}"]`));
      const load = async (world) => {
        await tab("Kayıtlar");
        await page
          .getByLabel("Sefer kayıt dosyası")
          .setInputFiles({
            name: "fixture.json",
            mimeType: "application/json",
            buffer: Buffer.from(encodeSave(world)),
          });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .waitFor();
      };
      const save = async () => {
        await tab("Kayıtlar");
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        return decodeSave(
          await page.evaluate(() =>
            localStorage.getItem("xarmy-europa-1936-v1:slot-1"),
          ),
        );
      };
      const preview = async () => {
        const details = page
          .locator("details")
          .filter({
            has: page.locator("summary", { hasText: /^Emir önizlemesi$/ }),
          });
        await click(details.locator("summary"));
        await details.getByRole("status").waitFor();
        return details;
      };
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: "SEFERİ BAŞLAT" }));
      const original = fixture();
      await load(original);
      await tab("Bölge");
      const buildPreview = await preview();
      assert.match(await buildPreview.innerText(), /İnşaat emri uygulanabilir/);
      assert.match(
        await buildPreview.innerText(),
        new RegExp(`Hazine: -${BUILDINGS.civil.cost}`),
      );
      assert.deepEqual(
        await save(),
        original,
        "Opening preview must not spend or journal an order",
      );
      passed(
        `${label}: build preview is truthful and leaves the campaign untouched`,
      );
      await tab("Bölge");
      await click(
        page.getByRole("button", {
          name: "İnşaat kuyruğuna ekle",
          exact: true,
        }),
      );
      const built = await save();
      assert.equal(
        built.countries.turkey.treasury,
        original.countries.turkey.treasury - BUILDINGS.civil.cost,
      );
      assert.equal(built.countries.turkey.construction.length, 1);
      assert.equal(built.commandState.cursors.turkey, 1);
      assert.equal(built.commandState.receipts[0].action.type, "build");
      passed(
        `${label}: public construction button spends once and creates a receipt`,
      );
      await tab("Ordu");
      const recruitPreview = await preview();
      assert.match(
        await recruitPreview.innerText(),
        /Tümen eğitimi uygulanabilir/,
      );
      assert.match(await recruitPreview.innerText(), /Yedek insan gücü: -/);
      assert.deepEqual(await save(), built);
      await tab("Ordu");
      await click(page.getByRole("button", { name: /^Eğitime başla/ }));
      const trained = await save();
      assert.equal(trained.countries.turkey.recruitment.length, 1);
      assert.equal(
        trained.countries.turkey.manpower,
        built.countries.turkey.manpower - UNITS.infantry.men,
      );
      assert.equal(
        trained.countries.turkey.equipment.rifle,
        built.countries.turkey.equipment.rifle - UNITS.infantry.equipment.rifle,
      );
      assert.equal(trained.commandState.cursors.turkey, 2);
      passed(
        `${label}: training preview and real equipment/personnel deductions agree`,
      );
      await load(trained);
      const history = page
        .locator("details")
        .filter({
          has: page.locator("summary", { hasText: /^Verdiğin emirler$/ }),
        });
      await click(history.locator("summary"));
      assert.match(await history.innerText(), /İnşaat emri/);
      assert.match(await history.innerText(), /Tümen eğitimi/);
      await page.screenshot({
        path: path.join(output, `${label}-command-history.png`),
      });
      await page
        .getByLabel("Oyun zorluğu", { exact: true })
        .selectOption("normal");
      const continued = await save();
      assert.equal(continued.commandState.cursors.turkey, 3);
      assert.deepEqual(
        continued.commandState.receipts.slice(0, 2),
        trained.commandState.receipts,
      );
      passed(
        `${label}: save import retains journal and resumes the next sequence`,
      );
      // Real worker advancement preserves journal state while the campaign progresses.
      await page.evaluate(() => {
        window.__journalDay = new Promise((resolve, reject) => {
          const clock = document.querySelector('[data-testid="game-date"]'),
            before = clock.textContent;
          const observer = new MutationObserver(() => {
            if (clock.textContent === before) return;
            observer.disconnect();
            clearTimeout(timeout);
            document
              .querySelector('button[aria-label="Zamanı duraklat"]')
              .click();
            resolve(clock.textContent);
          });
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("Worker clock timeout"));
          }, 15000);
          observer.observe(clock, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        });
      });
      await click(
        page.getByRole("button", { name: "Zamanı başlat", exact: true }),
      );
      assert.equal(
        await page.evaluate(() => window.__journalDay),
        dateLabel(continued.day + 1),
      );
      const advanced = await save();
      assert.equal(advanced.day, continued.day + 1);
      assert.deepEqual(advanced.commandState, continued.commandState);
      passed(`${label}: real worker preserves command state across a day`);
      const broke = fixture(0);
      await load(broke);
      await tab("Bölge");
      const deniedPreview = await preview();
      assert.doesNotMatch(await deniedPreview.innerText(), /uygulanabilir/);
      assert.match(await deniedPreview.innerText(), /hazine/i);
      await click(
        page.getByRole("button", {
          name: "İnşaat kuyruğuna ekle",
          exact: true,
        }),
      );
      assert.deepEqual(
        await save(),
        broke,
        "Rejected order must not partially mutate or consume sequence",
      );
      passed(
        `${label}: insufficient funds rejects both preview and execution atomically`,
      );
      const corrupt = JSON.parse(encodeSave(trained));
      corrupt.world.commandState.receipts[0].action.extra = "invalid";
      await page
        .getByLabel("Sefer kayıt dosyası")
        .setInputFiles({
          name: "corrupt.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(corrupt)),
        });
      await page
        .getByText(/bozuk|eksik/)
        .first()
        .waitFor();
      assert.deepEqual(await save(), broke);
      passed(
        `${label}: corrupted journal import preserves the current campaign`,
      );
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, errors }));
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
      fs.writeFileSync(
        path.join(output, "failure.txt"),
        await activePage
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
    }
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
