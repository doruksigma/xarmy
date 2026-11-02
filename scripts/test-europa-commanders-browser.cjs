/* Exercise real commander UI, workers and save/load on desktop and touch mobile.
   Fixtures are built outside the browser and imported through the normal save
   UI; observations are exported through manual save, never application hooks.
   Run after a production build. EUROPA_BASE_URL, EUROPA_CHROMIUM and
   EUROPA_ARTIFACT_DIR may override local defaults. */
const assert = require("node:assert/strict");
const { advanceClockHours } = require("./europa-browser-clock.cjs");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
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
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const { applyAction } = require("../app/games/europa-war/strategy/engine.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-commanders";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
mkdirSync(output, { recursive: true });

function borders(world, target) {
  return Object.values(world.provinces)
    .filter(
      (province) =>
        province.controller === world.player &&
        GEOGRAPHY[province.id].neighbors.some(
          (edge) => !edge.sea && world.provinces[edge.id].controller === target,
        ),
    )
    .map((province) => province.id)
    .sort();
}
function neighbors(world) {
  return [
    ...new Set(
      Object.values(world.provinces)
        .filter((province) => province.controller === world.player)
        .flatMap((province) =>
          GEOGRAPHY[province.id].neighbors
            .filter((edge) => !edge.sea)
            .map((edge) => world.provinces[edge.id].controller),
        ),
    ),
  ]
    .filter((id) => id !== world.player)
    .sort();
}
function fixture({
  war = false,
  count = 13,
  assign = false,
  trained = false,
} = {}) {
  let world = createWorld("germany", "historical", 1936, "normal");
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.autoAssignCommanders = false;
    country.generals = country.generals.slice(0, 2);
    for (const general of country.generals) delete general.front;
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    country.air.wings = [];
    country.navy.ships = [];
  }
  if (war) {
    declareWar(world, "germany", "france");
    declareWar(world, "germany", "poland");
  }
  const country = world.countries.germany,
    points = borders(world, "france");
  assert.ok(points.length > 1 && points.length <= 12);
  const ids = [];
  for (let i = 0; i < count; i++) {
    const army = addArmy(
      world,
      "germany",
      war && i < 12 ? points[i % points.length] : country.capital,
    );
    army.organization = 100;
    if (assign) army.general = country.generals[Math.floor(i / 12)].id;
    ids.push(army.id);
  }
  for (const province of Object.values(world.provinces)) {
    if (["germany", "france"].includes(province.controller)) {
      province.buildings.infra = 20;
      province.buildings.rail = 20;
      province.buildings.hub = 20;
    }
  }
  if (trained) {
    country.autoAssignCommanders = true;
    const result = applyAction(world, {
      type: "recruit",
      unit: "infantry",
      province: country.capital,
    });
    assert.equal(result.error, null);
    world = result.world;
    const training = world.countries.germany.recruitment.at(-1);
    training.progress = training.total - 1;
  }
  world = decodeSave(encodeSave(world));
  return {
    world,
    ids,
    first: country.generals[0].id,
    second: country.generals[1].id,
    target: "france",
    points,
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const checks = [],
    pageErrors = [],
    consoleErrors = [];
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
      // This suite exercises the retained SVG map; 3D has a separate integration suite.
      await context.addInitScript(() =>
        localStorage.setItem("xarmy-europa-map-view-v1", "2d"),
      );
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (entry) => {
        if (entry.type() === "error") consoleErrors.push(entry.text());
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.count()) await click(button);
      };
      const closeCommander = async () => {
        const button = page.getByRole("button", {
          name: "Komutan panelini kapat",
          exact: true,
        });
        if (await button.count()) await click(button);
      };
      const tab = async (name) => {
        await closeCommander();
        await click(page.locator(`button[title="${name}"]`));
      };
      const save = async (name) => {
        await pause();
        await tab("Kayıtlar");
        await click(
          page
            .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
            .first(),
        );
        const world = await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1"))
              .world,
        );
        decodeSave(
          JSON.stringify({
            format: "xarmy-europa-1936",
            version: world.version,
            world,
          }),
        );
        if (name)
          writeFileSync(
            path.join(output, `${label}-${name}.json`),
            JSON.stringify(world),
          );
        return world;
      };
      const load = async (f, name) => {
        await pause();
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: `${name}.json`,
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(f.world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .waitFor();
        await page.getByTestId("commander-bar").waitFor();
      };
      const select = async (id) => {
        await closeCommander();
        await click(page.getByTestId(`commander-card-${id}`));
        await page.getByTestId("commander-panel").waitFor();
      };
      const deploy = async (id, target) => {
        await select(id);
        await click(page.getByTestId("commander-deploy"));
        await click(page.getByTestId(`commander-target-${target}`));
        await page.getByTestId("commander-defend").waitFor();
      };
      const day = async () => {
        await closeCommander();
        await advanceClockHours(page, 24);
      };
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: "SEFERİ BAŞLAT" }));

      const f = fixture();
      await load(f, "peaceful-commanders");
      assert.equal(
        await page.getByTestId("commander-auto-assign").isChecked(),
        false,
      );
      await click(page.getByTestId("commander-auto-assign"));
      let world = await save("auto-assigned");
      assert.equal(world.countries.germany.autoAssignCommanders, true);
      assert.equal(
        world.armies.filter((a) => a.general === f.first).length,
        12,
      );
      assert.equal(
        world.armies.filter((a) => a.general === f.second).length,
        1,
      );
      await select(f.first);
      assert.equal(await page.getByTestId("commander-attack").count(), 0);
      assert.equal(await page.getByTestId("commander-defend").count(), 0);
      await page.getByTestId("commander-panel").focus();
      await page.keyboard.press("Space");
      assert.equal(
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .count(),
        1,
        "Space in the commander drawer must not start the simulation",
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.getByTestId("commander-panel").count(), 0);
      assert.equal(
        await page
          .getByTestId(`commander-card-${f.first}`)
          .evaluate((button) => document.activeElement === button),
        true,
        "Closing the drawer restores focus to its commander portrait",
      );
      await page.keyboard.press("Space");
      await page.getByTestId("commander-panel").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .count(),
        1,
        "Space still activates the portrait without advancing the clock",
      );
      await click(page.getByTestId("commander-deploy"));
      const flags = await page
        .getByTestId("commander-targets")
        .locator("button[data-testid]")
        .evaluateAll((buttons) =>
          buttons
            .map((button) =>
              button.dataset.testid.replace("commander-target-", ""),
            )
            .sort(),
        );
      assert.deepEqual(
        flags,
        neighbors(f.world),
        "Only real neighboring country flags are selectable",
      );
      assert.equal(
        await page.getByTestId("commander-target-turkey").count(),
        0,
      );
      await click(page.getByTestId("commander-target-france"));
      assert.equal(
        await page.getByTestId("commander-defend").getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await page.getByTestId("commander-attack").isDisabled(),
        true,
        "Peaceful deployment cannot start a war implicitly",
      );
      const box = await page.getByTestId("commander-panel").boundingBox();
      assert.ok(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1,
        "Commander drawer fits the viewport",
      );
      await page.screenshot({
        path: path.join(output, `${label}-commander-deployed.png`),
      });
      world = await save("deployed");
      const front = world.countries.germany.generals.find(
        (g) => g.id === f.first,
      ).front;
      assert.equal(front.target, "france");
      assert.equal(front.stance, "defend");
      const distribution = Object.values(front.assignments);
      assert.equal(distribution.length, 12);
      const counts = f.points.map(
        (id) => distribution.filter((assigned) => assigned === id).length,
      );
      assert.ok(
        Math.max(...counts) - Math.min(...counts) <= 1,
        "Twelve divisions distribute equally across every reachable border",
      );
      for (const [id, to] of Object.entries(front.assignments)) {
        const army = world.armies.find((a) => a.id === id);
        assert.equal(army.route.at(-1) ?? army.move?.to ?? army.province, to);
      }
      const idleBefore = world.armies.find((a) => a.general === f.second);
      await select(f.second);
      assert.equal(await page.getByTestId("commander-attack").count(), 0);
      assert.equal(await page.getByTestId("commander-defend").count(), 0);
      await day();
      world = await save("defense-day");
      const idleAfter = world.armies.find((a) => a.id === idleBefore.id);
      assert.equal(idleAfter.province, idleBefore.province);
      assert.equal(idleAfter.move, null);
      assert.deepEqual(idleAfter.route, []);
      assert.equal(
        world.countries.germany.generals.find((g) => g.id === f.second).front,
        undefined,
      );
      passed(
        `${label}: portraits and drawer keyboard, auto assignment 12+1, neighboring flags, even deployment, peaceful defense and idle commander isolation`,
      );

      await tab("Kayıtlar");
      await click(
        page.getByRole("button", { name: "Yükle", exact: true }).first(),
      );
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      assert.equal(
        await page.getByTestId("commander-panel").count(),
        0,
        "Loading clears transient commander selection",
      );
      await select(f.first);
      assert.equal(
        await page.getByTestId("commander-defend").getAttribute("aria-pressed"),
        "true",
      );
      assert.match(
        await page.getByTestId("commander-order-description").textContent(),
        /Fransa/,
      );
      assert.equal(
        await page.getByTestId("commander-auto-assign").isChecked(),
        true,
      );
      passed(
        `${label}: manual save and reload preserve commander members, target, stance and auto assignment`,
      );

      const battle = fixture({ war: true, assign: true });
      await load(battle, "two-enemy-commanders");
      await deploy(battle.first, battle.target);
      assert.equal(
        await page.getByTestId("commander-attack").isEnabled(),
        true,
      );
      await click(page.getByTestId("commander-attack"));
      assert.equal(
        await page.getByTestId("commander-attack").getAttribute("aria-pressed"),
        "true",
      );
      await day();
      world = await save("attacking");
      const fighting = world.armies.filter((a) => a.general === battle.first);
      const hostileDestinations = fighting
        .flatMap((a) => [...(a.move ? [a.move.to] : []), ...a.route])
        .filter((id) => world.provinces[id].controller !== "germany");
      assert.ok(
        hostileDestinations.length > 0,
        "Attack issues actual hostile movement",
      );
      assert.ok(
        hostileDestinations.every(
          (id) => world.provinces[id].controller === "france",
        ),
        "No orders against the other enemy Poland",
      );
      await select(battle.first);
      await click(page.getByTestId("commander-defend"));
      world = await save("defending");
      assert.equal(
        world.countries.germany.generals.find((g) => g.id === battle.first)
          .front.target,
        "france",
      );
      for (const a of world.armies.filter((a) => a.general === battle.first))
        assert.ok(
          [...(a.move ? [a.move.to] : []), ...a.route].every(
            (id) => world.provinces[id].controller === "germany",
          ),
          "Defense cancels hostile movement",
        );
      await select(battle.first);
      await click(page.getByTestId("commander-attack"));
      let captured = false;
      for (let index = 0; index < 10 && !captured; index++) {
        await day();
        world = await save();
        captured = Object.values(world.provinces).some(
          (p) => p.owner === "france" && p.controller === "germany",
        );
        const idle = world.armies.find((a) => a.id === battle.ids[12]);
        assert.equal(idle.province, battle.world.countries.germany.capital);
        assert.equal(idle.move, null);
        assert.deepEqual(idle.route, []);
      }
      assert.ok(
        captured,
        "Commander advances and captures a target city through the real worker",
      );
      assert.equal(
        Object.values(world.provinces).some(
          (p) => p.owner === "poland" && p.controller === "germany",
        ),
        false,
      );
      passed(
        `${label}: attack captures only the assigned enemy; defend cancels attack; another commander remains idle`,
      );

      const full = fixture({ count: 24, assign: true, trained: true });
      await load(full, "full-commanders-recruit");
      const beforeGenerals = full.world.countries.germany.generals.map(
        (g) => g.id,
      );
      await day();
      world = await save("new-commander");
      const recruit = world.armies.find(
        (a) => a.country === "germany" && !full.ids.includes(a.id),
      );
      assert.ok(recruit?.general && !beforeGenerals.includes(recruit.general));
      const newGeneral = world.countries.germany.generals.find(
        (g) => g.id === recruit.general,
      );
      assert.ok(newGeneral);
      assert.equal(
        newGeneral.front,
        undefined,
        "New commander does not inherit another commander's war",
      );
      assert.equal(
        world.countries.germany.generals.length,
        beforeGenerals.length + 1,
      );
      assert.ok(
        world.countries.germany.generals.every(
          (g) =>
            world.armies.filter(
              (a) => a.country === "germany" && a.general === g.id,
            ).length <= 12,
        ),
      );
      await select(newGeneral.id);
      assert.equal(await page.getByTestId("commander-attack").count(), 0);
      await page.screenshot({
        path: path.join(output, `${label}-overflow-commander.png`),
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      passed(
        `${label}: real training completion creates an idle commander when existing 12-division rosters are full`,
      );
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        { result: "passed", checks, pageErrors, consoleErrors },
        null,
        2,
      ),
    );
  } catch (error) {
    await activePage
      ?.screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          result: "failed",
          checks,
          pageErrors,
          consoleErrors,
          error: error.stack,
        },
        null,
        2,
      ),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
