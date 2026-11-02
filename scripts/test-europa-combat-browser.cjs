/* Real production WebGL/UI regression for short, one- and two-division
   battles, motion preferences and the slower campaign clock. No engine hooks.
   Run with NODE_PATH pointing to the Playwright installation when needed. */
const assert = require("node:assert/strict");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
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
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-combat";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
mkdirSync(output, { recursive: true });

function fixture(count, weak = false) {
  const world = createWorld("turkey", "historical", 1936, "normal");
  world.day = 1;
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    country.air.wings = [];
    country.navy.ships = [];
    for (const general of country.generals) delete general.front;
  }
  declareWar(world, "turkey", "bulgaria");
  const origin = "turkey-city-0",
    target = "bulgaria-city-0";
  const types = ["infantry", "lightTank", "artillery", "motorized"];
  const ids = Array.from({ length: count }, (_, i) => {
    const army = addArmy(world, "turkey", origin, types[i]);
    army.organization = 100;
    return army.id;
  });
  const defender = addArmy(world, "bulgaria", target);
  defender.organization = weak ? 11 : 100;
  for (const province of Object.values(world.provinces)) {
    province.buildings.rail = 0;
    province.buildings.infra = 10;
    province.buildings.hub = 5;
    province.damage = 0;
  }
  world.countries.turkey.stock.fuel = 1000;
  return {
    world: decodeSave(encodeSave(world)),
    origin,
    target,
    ids,
    defender: defender.id,
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const checks = [],
    samples = [],
    pageErrors = [],
    consoleErrors = [],
    failedRequests = [];
  const passed = (name) => {
    checks.push(name);
    console.log("PASS " + name);
  };
  let activePage;
  try {
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 1000 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
      });
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(30000);
      page.on("pageerror", (e) =>
        pageErrors.push({ label, message: e.message }),
      );
      page.on("console", (e) => {
        if (e.type() === "error")
          consoleErrors.push({ label, message: e.text() });
      });
      page.on("requestfailed", (r) =>
        failedRequests.push({
          label,
          url: r.url(),
          error: r.failure()?.errorText,
        }),
      );
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const canvas = page.getByTestId("war-map-3d");
      const ready = () =>
        page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      const stats = () => canvas.evaluate((el) => ({ ...el.dataset }));
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.count()) await click(button);
      };
      let clockPoint;
      const play = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı başlat",
          exact: true,
        });
        const box = await button.boundingBox();
        clockPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await click(button);
      };
      const pauseVisibleFrame = async () => {
        // Real pointer input, without waiting two extra actionability frames:
        // slow software rendering can otherwise miss a short projectile.
        if (mobile) await page.touchscreen.tap(clockPoint.x, clockPoint.y);
        else await page.mouse.click(clockPoint.x, clockPoint.y);
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .waitFor();
      };
      const speed = (value) =>
        click(
          page.getByRole("button", { name: `${value} kat hız`, exact: true }),
        );
      const close = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
        ]) {
          const button = page.getByRole("button", { name, exact: true });
          if (await button.count()) await click(button);
        }
        const notice = page
          .getByTestId("map-order-notice")
          .getByRole("button", { name: "Bildirimi kapat", exact: true });
        if (await notice.count()) await click(notice);
      };
      const save = async (name) => {
        await pause();
        await close();
        await click(page.locator('button[title="Kayıtlar"]'));
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
          JSON.stringify({ format: "xarmy-europa-1936", version: 2, world }),
        );
        if (name)
          writeFileSync(
            path.join(output, `${label}-${name}.json`),
            JSON.stringify(world),
          );
        await close();
        return world;
      };
      const load = async (scenario) => {
        await pause();
        await close();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "combat-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(scenario.world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await close();
        await ready();
        await speed(1);
        await page
          .getByLabel("Grafik kalitesi", { exact: true })
          .selectOption("low");
      };
      const focus = async (id, zoom = 0) => {
        await close();
        await page
          .getByLabel("Şehir bul", { exact: true })
          .fill(GEOGRAPHY[id].name);
        await click(
          page
            .getByRole("list", { name: "Şehir arama sonuçları" })
            .getByRole("button")
            .filter({ hasText: GEOGRAPHY[id].name })
            .first(),
        );
        await close();
        for (let i = 0; i < zoom; i++)
          await click(
            page.getByRole("button", {
              name: "Haritayı yakınlaştır",
              exact: true,
            }),
          );
      };
      const screenshot = (name) =>
        page.screenshot({ path: path.join(output, `${label}-${name}.png`) });
      const motion = async (value, resolved) => {
        await page
          .getByLabel("Animasyonlar", { exact: true })
          .selectOption(value);
        await page.waitForFunction(
          (expected) =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .animations === expected,
          resolved,
        );
      };
      const order = async (scenario) => {
        await focus(scenario.target);
        await click(
          page
            .locator(`[data-formation^="turkey:${scenario.origin}:"]`)
            .first(),
        );
        if (mobile)
          await click(
            page.getByRole("button", {
              name: `Haritada hedef seç · ${scenario.ids.length} tümen`,
              exact: true,
            }),
          );
        await close();
        const box = await canvas.boundingBox();
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        if (mobile) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y, { button: "right" });
        await focus(scenario.target, 1);
      };
      const observedFrame = async (field, after = 0, recent = false) => {
        const handle = await page.waitForFunction(
          ({ field, after, recent }) => {
            const d = document.querySelector(
              '[data-testid="war-map-3d"]',
            )?.dataset;
            return d &&
              Number(d[field]) > 0 &&
              Number(d.renderedFrames) > after &&
              (!recent || Number(d.recentCombats) > 0)
              ? { ...d }
              : false;
          },
          { field, after, recent },
        );
        const frame = await handle.jsonValue();
        await handle.dispose();
        return frame;
      };

      await page.goto(base + "/games/europa-war", {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await close();
      await ready();
      const neutral = fixture(1);
      neutral.world.armies = [];
      await load(neutral);
      await motion("system", "reduced");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="war-map-3d"]')?.dataset
            .animations === "full",
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="war-map-3d"]')?.dataset
            .animations === "reduced",
      );
      await motion("full", "full");
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("xarmy-europa-3d-motion-v1"),
        ),
        "full",
      );
      await click(
        page.getByRole("button", { name: "2D siyasi harita", exact: true }),
      );
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await ready();
      assert.equal(
        await page.getByLabel("Animasyonlar", { exact: true }).inputValue(),
        "full",
      );
      assert.equal((await stats()).animations, "full");
      passed(
        `${label}: motion follows live OS preferences and explicit playback persists across map remounts`,
      );

      if (!mobile) {
        // DOM observations only: record actual date changes produced by the worker.
        const dayIntervals = async (rate) => {
          await speed(rate);
          const dates = page.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const element = document.querySelector(
                  '[data-testid="game-date"]',
                );
                const changes = [];
                let last = element.textContent;
                const timeout = setTimeout(() => {
                  observer.disconnect();
                  reject(new Error("Date did not advance three times"));
                }, 25000);
                const observer = new MutationObserver(() => {
                  if (element.textContent === last) return;
                  last = element.textContent;
                  changes.push({ date: last, time: performance.now() });
                  if (changes.length === 3) {
                    clearTimeout(timeout);
                    observer.disconnect();
                    resolve(changes);
                  }
                });
                observer.observe(element, {
                  childList: true,
                  characterData: true,
                  subtree: true,
                });
              }),
          );
          await play();
          const changes = await dates;
          await pause();
          return changes
            .slice(1)
            .map((change, i) => change.time - changes[i].time);
        };
        const normal = await dayIntervals(1);
        assert.ok(
          normal.every((delay) => delay >= 1800),
          `1x days advanced too quickly: ${normal}`,
        );
        const frozenDate = await page.getByTestId("game-date").textContent();
        await page.waitForTimeout(2200);
        assert.equal(
          await page.getByTestId("game-date").textContent(),
          frozenDate,
        );
        const accelerated = await dayIntervals(5);
        assert.ok(accelerated.every((delay) => delay >= 350));
        assert.ok(
          accelerated.reduce((a, b) => a + b) <
            normal.reduce((a, b) => a + b) * 0.85,
          JSON.stringify({ normal, accelerated }),
        );
        samples.push({ label, view: "campaign-clock", normal, accelerated });
        passed(
          "desktop: actual 1x days wait at least two seconds, pause freezes the date and 5x accelerates it",
        );
      }

      for (const count of mobile ? [1, 2] : [1, 2, 4]) {
        const scenario = fixture(count);
        await load(scenario);
        await motion("full", "full");
        await order(scenario);
        const before = await save();
        assert.equal(
          Number((await stats()).combatFormations),
          0,
          "Orders alone must not animate a battle",
        );
        const field =
          count === 1
            ? "infantryTracers"
            : count === 2
              ? "tankShells"
              : "shells";
        await play();
        const first = await observedFrame(field);
        const second = await observedFrame(field, Number(first.renderedFrames));
        await pauseVisibleFrame();
        await screenshot(`combat-${count}-projectile`);
        const fighting = await save(`combat-${count}-fighting`);
        assert.ok(
          fighting.countries.turkey.casualties >
            before.countries.turkey.casualties,
        );
        assert.ok(
          fighting.countries.bulgaria.casualties >
            before.countries.bulgaria.casualties,
        );
        assert.ok(
          scenario.ids.every(
            (id) =>
              fighting.armies.find((army) => army.id === id)?.strength < 100,
          ),
        );
        assert.ok(
          Number(second.combatFormations) >= 2,
          "Both the attacking and defending formations must visibly fight",
        );
        samples.push({ label, view: `combat-${count}`, first, second });
        const pausedEffects = await stats();
        await page.waitForTimeout(600);
        const stillPaused = await stats();
        for (const key of [
          "infantryTracers",
          "tankShells",
          "shells",
          "muzzleFlashes",
          "impacts",
        ])
          assert.equal(
            stillPaused[key],
            pausedEffects[key],
            `${key} changed while paused`,
          );
        assert.deepEqual(
          await save(),
          fighting,
          "Visuals and UI inspection cannot mutate the paused campaign",
        );
        passed(
          `${label}: ${count}-division battle renders ${field} across frames, applies real mutual damage and freezes when paused`,
        );
        if (mobile && count === 1) {
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await click(
            page.getByRole("button", { name: "2D siyasi harita", exact: true }),
          );
          const pulse = page.locator('svg g[class*="battlePulse"]').first();
          await pulse.waitFor({ state: "attached" });
          assert.notEqual(
            await pulse.evaluate((el) => getComputedStyle(el).animationName),
            "none",
          );
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.waitForFunction(() => {
            const el = document.querySelector('svg g[class*="battlePulse"]');
            return el && getComputedStyle(el).animationName === "none";
          });
          await click(
            page.getByRole("button", { name: "3D arazi", exact: true }),
          );
          await ready();
          await focus(scenario.target, 1);
          passed(
            "mobile: the 2D combat pulse animates on touch screens and respects reduced motion",
          );
        }
        await speed(5);
        await play();
        await page.waitForFunction(
          () =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .captures,
            ) > 0,
        );
        await page.waitForFunction(() => {
          const d = document.querySelector(
            '[data-testid="war-map-3d"]',
          )?.dataset;
          return (
            d &&
            Number(d.combatFormations) === 0 &&
            Number(d.infantryTracers) +
              Number(d.tankShells) +
              Number(d.shells) +
              Number(d.muzzleFlashes) ===
              0
          );
        });
        await pause();
        const won = await save(`combat-${count}-captured`);
        assert.equal(won.provinces[scenario.target].controller, "turkey");
        assert.ok(
          scenario.ids.every(
            (id) =>
              won.armies.find((army) => army.id === id)?.province ===
              scenario.target,
          ),
        );
        await screenshot(`combat-${count}-captured`);
        passed(
          `${label}: all ${count} attackers actually capture the city and firing stops after combat`,
        );
      }

      if (!mobile) {
        const short = fixture(2, true);
        await load(short);
        await motion("full", "full");
        await order(short);
        await speed(5);
        await play();
        const replay = await observedFrame("tankShells", 0, true);
        await pauseVisibleFrame();
        await screenshot("one-day-resolved-battle");
        const resolved = await save("one-day-resolved-battle");
        assert.ok(
          resolved.countries.turkey.casualties >
            short.world.countries.turkey.casualties,
        );
        assert.ok(
          resolved.countries.bulgaria.casualties >
            short.world.countries.bulgaria.casualties,
        );
        assert.ok(
          !resolved.armies.some(
            (army) =>
              army.id === short.defender && army.province === short.target,
          ),
          "The defender has already left the frontline",
        );
        samples.push({ label, view: "one-day-resolved-battle", ...replay });
        await speed(1);
        await play();
        await page.waitForFunction(() => {
          const d = document.querySelector(
            '[data-testid="war-map-3d"]',
          )?.dataset;
          return (
            d &&
            Number(d.recentCombats) === 0 &&
            Number(d.combatFormations) === 0 &&
            Number(d.tankShells) === 0
          );
        });
        await pause();
        passed(
          "desktop: a real one-day rout at 5x visibly fires once and its bounded recent-combat presentation expires",
        );
      }
      await motion("reduced", "reduced");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      passed(
        `${label}: animation controls fit the viewport and reduced motion remains available`,
      );
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedRequests, []);
    const report = {
      result: "passed",
      checks,
      pageErrors,
      consoleErrors,
      failedRequests,
      samples,
      rendererNote:
        "Actual headless Chromium WebGL through SwiftShader; mobile uses touch emulation, not a physical-device FPS benchmark.",
    };
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({ result: "passed", checks, artifacts: output }),
    );
  } catch (error) {
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        {
          error: String(error),
          checks,
          pageErrors,
          consoleErrors,
          failedRequests,
          samples,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
