/* Real hourly worker, combat, daily settlement and save/load regression.
   Public import, clock, archive, difficulty and map controls only; no private
   React state or engine hooks. Desktop and touch mobile use the same rules. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");
const { advanceClockHours } = require("./europa-browser-clock.cjs");
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
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  applyAction,
  advanceHour,
} = require("../app/games/europa-war/strategy/engine.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const { worldHour } = require("../app/games/europa-war/strategy/time.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-hourly";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

function fixture(combat = true) {
  let world = createWorld("turkey", "historical", 71336, "normal");
  world.hour = combat ? 8 : 23;
  world.armies = [];
  for (const c of Object.values(world.countries)) {
    c.autoAssignCommanders = false;
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
  for (const p of Object.values(world.provinces)) {
    p.buildings.infra = 10;
    p.buildings.hub = 5;
    p.damage = 0;
  }
  world.countries.turkey.treasury = 10000;
  world.countries.turkey.stock.fuel = 1000;
  const ids = [];
  let defender;
  if (combat) {
    declareWar(world, "turkey", "bulgaria");
    for (const type of ["infantry", "lightTank", "artillery"]) {
      const a = addArmy(world, "turkey", "turkey-city-0", type);
      a.organization = 100;
      ids.push(a.id);
    }
    defender = addArmy(world, "bulgaria", "bulgaria-city-0").id;
    const order = applyAction(world, {
      type: "moveGroup",
      armies: ids,
      to: "bulgaria-city-0",
    });
    assert.equal(order.error, null);
    world = order.world;
  }
  for (const action of [
    { type: "build", building: "civil", province: "turkey-0" },
    { type: "research", id: "armor1" },
  ]) {
    const result = applyAction(world, action);
    assert.equal(result.error, null);
    world = result.world;
  }
  return { world: decodeSave(encodeSave(world)), ids, defender };
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
      page.setDefaultTimeout(20000);
      page.on("pageerror", (error) =>
        errors.push(`${label}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`${label}: ${entry.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const tab = (name) => click(page.locator(`button[title="${name}"]`));
      const load = async (world) => {
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "hourly-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .waitFor();
        assert.equal(
          Number(
            await page.getByTestId("game-date").getAttribute("data-game-hour"),
          ),
          worldHour(world),
        );
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
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: "SEFERİ BAŞLAT" }));
      const battle = fixture();
      await load(battle.world);
      assert.match(await page.getByTestId("game-date").textContent(), /08:00/);
      assert.deepEqual(await save(), battle.world);
      passed(
        `${label}: non-midnight v3 save restores the exact hour and complete campaign`,
      );

      await advanceClockHours(page, 1, 1);
      const fought = await save();
      assert.equal(fought.day, 0);
      assert.equal(fought.hour, 9);
      const formation = battle.ids.map((id) =>
        fought.armies.find((a) => a.id === id),
      );
      assert.ok(
        formation.every(
          (a) =>
            a && a.move && a.move.progress > 0 && a.move.progress < a.move.days,
        ),
      );
      const pace = formation[0].move.progress / formation[0].move.days;
      assert.ok(
        formation.every(
          (a) => Math.abs(a.move.progress / a.move.days - pace) < 1e-10,
        ),
      );
      assert.ok(
        formation.every((a) => a.strength < 100 && a.strength > 90),
        "All three formations must receive partial-hour return fire",
      );
      const defender = fought.armies.find((a) => a.id === battle.defender);
      assert.ok(defender && defender.strength < 100 && defender.strength > 90);
      assert.deepEqual(
        fought.countries.turkey.construction,
        battle.world.countries.turkey.construction,
      );
      assert.deepEqual(
        fought.countries.turkey.research,
        battle.world.countries.turkey.research,
      );
      assert.deepEqual(fought, advanceHour(battle.world));
      passed(
        `${label}: all selected divisions march together and both sides take hourly damage before daily settlement`,
      );

      await tab("Komuta");
      const map = page.getByTestId("war-map");
      const viewBefore = await map.getAttribute("viewBox");
      await map.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("+");
      assert.notEqual(await map.getAttribute("viewBox"), viewBefore);
      await page.waitForTimeout(1100);
      assert.deepEqual(await save(), fought);
      passed(
        `${label}: pause freezes movement, damage and queues while map navigation remains responsive`,
      );

      await load(fought);
      await page
        .getByLabel("Oyun zorluğu", { exact: true })
        .selectOption("easy");
      const commanded = await save();
      assert.equal(worldHour(commanded), worldHour(fought));
      assert.equal(
        commanded.commandState.receipts.at(-1).appliedTick,
        worldHour(fought),
      );
      await load(commanded);
      assert.deepEqual(await save(), commanded);
      passed(
        `${label}: same-hour commands and their receipt survive manual save and import without advancing time`,
      );

      await load(battle.world);
      await advanceClockHours(page, 3, 1);
      const slow = await save();
      await load(battle.world);
      await advanceClockHours(page, 3, 5);
      assert.deepEqual(await save(), slow);
      passed(
        `${label}: 1x and 5x produce identical combat and campaign state at the same hour`,
      );

      const peaceful = fixture(false).world;
      await load(peaceful);
      await advanceClockHours(page, 1);
      const midnight = await save();
      assert.equal(midnight.day, 1);
      assert.equal(midnight.hour, 0);
      assert.ok(
        midnight.countries.turkey.construction[0].progress >
          peaceful.countries.turkey.construction[0].progress,
      );
      assert.ok(
        midnight.countries.turkey.research[0].progress >
          peaceful.countries.turkey.research[0].progress,
      );
      assert.deepEqual(midnight, advanceHour(peaceful));
      passed(
        `${label}: midnight advances industry and research exactly once through the real worker`,
      );

      await load(midnight);
      await advanceClockHours(page, 1);
      const morning = await save();
      assert.deepEqual(
        morning.countries.turkey.construction,
        midnight.countries.turkey.construction,
      );
      assert.deepEqual(
        morning.countries.turkey.research,
        midnight.countries.turkey.research,
      );
      assert.deepEqual(morning, advanceHour(midnight));
      await page.screenshot({
        path: path.join(output, `${label}-hourly-clock.png`),
      });
      fs.writeFileSync(
        path.join(output, `${label}-campaign.json`),
        encodeSave(morning),
      );
      passed(
        `${label}: loading midnight resumes at 01:00 without paying daily progress twice`,
      );
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(
      JSON.stringify({ passed: checks.length, errors: errors.length, output }),
    );
  } catch (error) {
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify({ checks, errors, error: String(error) }, null, 2),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
