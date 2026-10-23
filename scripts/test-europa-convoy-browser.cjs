/* Real UI regression for a mixed 16-division order. The clock is advanced
   one real day at a time and each observation is exported through manual save.
   No engine actions or application internals are invoked inside the browser.
   EUROPA_BASELINE=1 records failures against the old production bundle. */
const assert = require("node:assert/strict");
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
  dateLabel,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const { encodeSave } = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-convoy";
const baseline = process.env.EUROPA_BASELINE === "1";
mkdirSync(output, { recursive: true });

function fixture() {
  const world = createWorld("germany", "historical", 1936, "normal");
  declareWar(world, "germany", "poland");
  world.armies = [];
  const origin = "germany-8",
    destination = "poland-city-2";
  const retreat = GEOGRAPHY[origin].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === "germany",
  ).id;
  const attackers = Array.from({ length: 16 }, (_, i) =>
    addArmy(world, "germany", origin, i === 0 ? "lightTank" : "infantry"),
  );
  const defender = addArmy(world, "poland", destination);
  for (const a of world.armies) {
    a.organization = 100;
    a.entrenchment = 0;
  }
  // Break the defender before the fast tank finishes traveling, so a
  // prolonged battle cannot conceal an early tank / late infantry split.
  defender.organization = 20;
  // A developed supply corridor isolates group speed from the separate
  // sixteen-division overcrowding penalty on an undeveloped border.
  for (const id of [origin, destination, retreat]) {
    world.provinces[id].buildings.infra = 20;
    world.provinces[id].buildings.rail = 20;
    world.provinces[id].buildings.hub = 20;
  }
  // Plenty of fuel isolates coordinated movement from shortage behavior.
  world.countries.germany.stock.fuel = 1000;
  for (const country of Object.values(world.countries)) {
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
  }
  return { world, origin, destination, retreat, attackers, defender };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const checks = [],
    failures = [],
    pageErrors = [],
    consoleErrors = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") consoleErrors.push(e.text());
  });
  const tab = (label) => page.locator(`button[title="${label}"]`).click();
  const pause = async () => {
    const button = page.getByRole("button", {
      name: "Zamanı duraklat",
      exact: true,
    });
    if (await button.count()) await button.click();
  };
  const save = async () => {
    await pause();
    await tab("Kayıtlar");
    await page
      .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
      .first()
      .click();
    return page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1")).world,
    );
  };
  const load = async (f, name) => {
    await pause();
    await tab("Kayıtlar");
    const encoded = JSON.parse(encodeSave(f.world));
    if (baseline)
      for (const army of encoded.world.armies) delete army.marchGroup;
    await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
      name: name + ".json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(encoded)),
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
  };
  const select = async (f) => {
    // On phones the open management panel overlays search results.
    if (page.viewportSize().width <= 700) {
      const close = page.getByRole("button", {
        name: "Yönetim panelini kapat",
        exact: true,
      });
      if (await close.count()) await close.click();
    }
    await focus(f.origin);
    if (page.viewportSize().width <= 700) {
      const close = page.getByRole("button", {
        name: "Yönetim panelini kapat",
        exact: true,
      });
      if (await close.count()) await close.click();
    }
    const stack = page.locator(
      `[data-army-stack="${f.attackers.map((a) => a.id).join(",")}"]`,
    );
    if (page.viewportSize().width <= 700) await stack.tap();
    else await stack.click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="army-selection-count"]')
          ?.textContent === "16 tümen seçili",
    );
  };
  const clickProvince = async (id) => {
    const point = await page
      .locator(`[data-province="${id}"]`)
      .evaluate((el, region) => {
        const matrix = el.getScreenCTM(),
          bounds = el.getBBox();
        const candidates = [{ x: region.x, y: region.y }];
        for (let row = 1; row < 30; row++)
          for (let col = 1; col < 30; col++)
            candidates.push({
              x: bounds.x + (bounds.width * col) / 30,
              y: bounds.y + (bounds.height * row) / 30,
            });
        for (const candidate of candidates) {
          if (!el.isPointInFill(new DOMPoint(candidate.x, candidate.y)))
            continue;
          const screen = new DOMPoint(candidate.x, candidate.y).matrixTransform(
            matrix,
          );
          if (
            document
              .elementFromPoint(screen.x, screen.y)
              ?.closest("[data-province]")?.dataset.province === region.id
          )
            return { x: screen.x, y: screen.y };
        }
        return null;
      }, GEOGRAPHY[id]);
    assert.ok(point, `Visible clickable polygon: ${id}`);
    if (page.viewportSize().width <= 700)
      await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
  };
  const order = async (destination) => {
    await tab("Ordu");
    await page
      .getByTestId("army-selection-count")
      .locator("..")
      .getByRole("button", {
        name: "Haritada hedef seç · 16 tümen",
        exact: true,
      })
      .click();
    await clickProvince(destination);
    await page
      .getByRole("button", { name: "Emri iptal et", exact: true })
      .waitFor({ state: "detached" });
  };
  const day = async () => {
    const before = await page.getByTestId("game-date").textContent();
    let index = -1;
    for (let i = 0; i < 100; i++)
      if (dateLabel(i) === before) {
        index = i;
        break;
      }
    assert.ok(index >= 0, "Known date before daily clock step");
    await page.getByRole("button", { name: "1 kat hız", exact: true }).click();
    // Stop through the public pause button as soon as the real clock renders
    // a new date. This avoids CDP round trips skipping a day on a busy host.
    await page.evaluate(() => {
      const clock = document.querySelector('[data-testid="game-date"]');
      const old = clock.textContent;
      window.__convoyDateStep = new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (clock.textContent === old) return;
          observer.disconnect();
          clearTimeout(timeout);
          document
            .querySelector('button[aria-label="Zamanı duraklat"]')
            .click();
          resolve(clock.textContent);
        });
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(
            new Error("The real game clock did not advance within 15 seconds"),
          );
        }, 15000);
        observer.observe(clock, {
          subtree: true,
          characterData: true,
          childList: true,
        });
      });
    });
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.evaluate(() => window.__convoyDateStep);
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .waitFor();
    assert.equal(
      await page.getByTestId("game-date").textContent(),
      dateLabel(index + 1),
      "Observe every actual simulation day; never skip a possible split",
    );
  };
  const members = (w, f) =>
    f.attackers.map((initial) => {
      const a = w.armies.find((a) => a.id === initial.id);
      assert.ok(a, `Surviving test division ${initial.id} must exist`);
      return a;
    });
  const check = async (name, fn) => {
    try {
      await fn();
      checks.push(name);
      console.log("PASS " + name);
    } catch (e) {
      failures.push({ name, error: e.stack });
      await page
        .screenshot({
          path: path.join(output, `failure-${failures.length}.png`),
        })
        .catch(() => {});
      console.log("FAIL " + name + ": " + e.message);
      await pause().catch(() => {});
    }
  };
  try {
    await page.goto(base + "/games/europa-war", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    for (const [label, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      await check(
        `${label}: one fast tank and fifteen infantry move and capture as one group`,
        async () => {
          await page.setViewportSize(viewport);
          const f = fixture();
          await load(f, label + "-16-mixed");
          await select(f);
          await order(f.destination);
          let w = await save();
          assert.ok(
            members(w, f).every((a) => a.route.at(-1) === f.destination),
            "All sixteen receive the order in one command",
          );
          const history = [];
          const damaged = new Set();
          let arrived = false,
            sawBattle = false;
          for (let i = 0; i < 20; i++) {
            await tab("Ordu");
            await day();
            w = await save();
            const group = members(w, f);
            for (const a of group) if (a.strength < 100) damaged.add(a.id);
            history.push({
              day: w.day,
              units: group.map((a) => ({
                id: a.id,
                province: a.province,
                move: a.move,
                strength: a.strength,
              })),
            });
            writeFileSync(
              path.join(output, `${label}-daily-march.json`),
              JSON.stringify(history, null, 2),
            );
            sawBattle ||=
              w.countries.germany.casualties > 0 &&
              w.countries.poland.casualties > 0;
            assert.equal(
              new Set(group.map((a) => a.province)).size,
              1,
              `Day ${w.day}: no first-one / remaining-fifteen split`,
            );
            if (group.every((a) => a.province === f.destination)) {
              arrived = true;
              break;
            }
          }
          assert.ok(
            arrived,
            "All sixteen enter the target within twenty real days",
          );
          assert.ok(
            sawBattle,
            "Real combat damages both sides before occupation",
          );
          assert.equal(w.provinces[f.destination].controller, "germany");
          assert.equal(
            damaged.size,
            16,
            "All sixteen participated and took real losses before reinforcement",
          );
          await tab("Ordu");
          const stack = page.locator(
            `[data-army-stack="${f.attackers.map((a) => a.id).join(",")}"]`,
          );
          assert.equal(
            await stack.count(),
            1,
            "Map continues to show a single sixteen-division stack",
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            "No horizontal overflow",
          );
          await page.screenshot({
            path: path.join(output, `${label}-16-captured.png`),
          });
        },
      );
    }
    await check(
      "desktop: retarget and halt affect all sixteen without leaving the fast tank behind",
      async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        const f = fixture();
        await load(f, "16-retarget-halt");
        await select(f);
        await order(f.destination);
        await day();
        await order(f.retreat);
        let w = await save();
        assert.ok(
          members(w, f).every(
            (a) => a.move?.to !== f.destination && a.route.at(-1) === f.retreat,
          ),
          "Every division leaves the obsolete attack order",
        );
        await tab("Ordu");
        await page
          .getByRole("button", { name: "Dur / savun · 16 tümen", exact: true })
          .click();
        w = await save();
        for (const a of members(w, f)) {
          assert.equal(a.move, null);
          assert.deepEqual(a.route, []);
          assert.equal(a.stance, "hold");
        }
        await tab("Ordu");
        await day();
        w = await save();
        assert.ok(
          members(w, f).every(
            (a) => a.province === f.origin && a.move === null,
          ),
          "Halted group stays together next day",
        );
        await tab("Ordu");
        await order(f.retreat);
        let arrived = false;
        for (let i = 0; i < 20; i++) {
          await day();
          w = await save();
          const group = members(w, f);
          assert.equal(
            new Set(group.map((a) => a.province)).size,
            1,
            `Retreat day ${w.day}: no split`,
          );
          if (group.every((a) => a.province === f.retreat)) {
            arrived = true;
            break;
          }
          await tab("Ordu");
        }
        assert.ok(
          arrived,
          "Reissued order reaches friendly city with all sixteen",
        );
      },
    );
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          result:
            failures.length || pageErrors.length || consoleErrors.length
              ? "failed"
              : "passed",
          baseline,
          checks,
          failures,
          pageErrors,
          consoleErrors,
        },
        null,
        2,
      ),
    );
    await context.close();
    await browser.close();
  }
  if (failures.length || pageErrors.length || consoleErrors.length)
    process.exitCode = 1;
})();
