/* Real production-browser checks for country arrows, original military symbols,
   articulated unit silhouettes and night combat lighting. Only public save
   import, UI commands and the real clock modify the campaign. */
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
  GEOGRAPHY,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const { worldHour } = require("../app/games/europa-war/strategy/time.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR ||
  "/workspace/scratch/europa-military-browser";
const device = process.env.EUROPA_DEVICE;
const captureModelsOnly = process.env.EUROPA_CAPTURE_MODELS_ONLY === "1";
const skipDesktopModels = process.env.EUROPA_SKIP_DESKTOP_MODELS === "1";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
assert.ok(!device || ["desktop", "mobile"].includes(device));
fs.mkdirSync(output, { recursive: true });

function baseWorld() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  world.hour = 10;
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.autoAssignCommanders = false;
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    country.air.wings = [];
    country.navy.ships = [];
    country.stock.fuel = 1000;
    for (const general of country.generals) delete general.front;
  }
  for (const province of Object.values(world.provinces)) {
    province.buildings.rail = 0;
    province.buildings.infra = 10;
    province.buildings.hub = 5;
    province.damage = 0;
  }
  return world;
}
function modelFixture(count, battle = false) {
  const world = baseWorld();
  const origin = battle ? "turkey-city-0" : world.countries.turkey.capital;
  const target = battle ? "bulgaria-city-0" : "turkey-city-16";
  const types = ["infantry", "lightTank", "artillery", "motorized"];
  const ids = [];
  for (let index = 0; index < count; index++) {
    const army = addArmy(world, "turkey", origin, types[index]);
    army.organization = 100;
    ids.push(army.id);
  }
  if (battle) {
    declareWar(world, "turkey", "bulgaria");
    addArmy(world, "bulgaria", target).organization = 100;
  }
  return { world: decodeSave(encodeSave(world)), origin, target, ids };
}
function movementFixture(completing = false) {
  const f = modelFixture(4);
  for (const army of f.world.armies) {
    army.move = { to: f.target, progress: completing ? 0.999 : 0.2, days: 1 };
    army.route = [];
  }
  if (!completing) {
    declareWar(f.world, "turkey", "bulgaria");
    const near = addArmy(f.world, "bulgaria", "bulgaria-city-0");
    const nearTarget = GEOGRAPHY[near.province].neighbors.find(
      (edge) =>
        !edge.sea && f.world.provinces[edge.id].controller === "bulgaria",
    ).id;
    near.move = { to: nearTarget, progress: 0.1, days: 1 };
    const remote = addArmy(
      f.world,
      "germany",
      f.world.countries.germany.capital,
    );
    const remoteTarget = GEOGRAPHY[remote.province].neighbors.find(
      (edge) =>
        !edge.sea && f.world.provinces[edge.id].controller === "germany",
    ).id;
    remote.move = { to: remoteTarget, progress: 0.1, days: 1 };
    f.nearTarget = nearTarget;
  }
  f.world = decodeSave(encodeSave(f.world));
  return f;
}
const effectFields = [
  "unitGlows",
  "unitGroundGlows",
  "unitDynamicLights",
  "unitHeadlights",
  "infantryTracers",
  "tankShells",
  "shells",
  "muzzleFlashes",
  "impacts",
];

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
    errors = [],
    samples = [];
  let activePage;
  const passed = (name) => {
    checks.push(name);
    console.log("PASS " + name);
  };
  try {
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 1000 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ].filter(([name]) => !device || device === name)) {
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(60000);
      page.on("pageerror", (error) =>
        errors.push({ label, message: error.message }),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error")
          errors.push({
            label,
            message: entry.text(),
            location: entry.location(),
          });
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const canvas = page.getByTestId("war-map-3d");
      const stats = () =>
        canvas.evaluate((element) => ({ ...element.dataset }));
      const arrows = async () => JSON.parse((await stats()).movementArrows);
      const ready = () =>
        page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      const renderAfter = (frame) =>
        page.waitForFunction(
          (before) =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .renderedFrames,
            ) > before,
          frame,
        );
      const close = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
          "Bildirimi kapat",
        ]) {
          const button = page.getByRole("button", { name, exact: true });
          if (await button.count()) await click(button.first());
        }
      };
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.count()) await click(button);
      };
      const save = async () => {
        await pause();
        await close();
        await click(page.locator('button[title="Kayıtlar"]'));
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
      const load = async (f) => {
        await pause();
        await close();
        const previous = await canvas.elementHandle();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "military-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(f.world)),
        });
        await page.waitForFunction((element) => !element.isConnected, previous);
        await previous.dispose();
        await page.waitForFunction(
          (hour) =>
            Number(
              document
                .querySelector('[data-testid="game-date"]')
                ?.getAttribute("data-game-hour"),
            ) === hour,
          worldHour(f.world),
        );
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await close();
        await ready();
        await click(
          page.getByRole("button", { name: "1 kat hız", exact: true }),
        );
      };
      const choose = async (name, value) => {
        const control = page.getByLabel(name, { exact: true });
        if ((await control.inputValue()) === value) return;
        const before = await stats();
        await control.selectOption(value);
        if (name === "Animasyonlar") {
          const resolved = value === "system" ? "reduced" : value;
          await page.waitForFunction(
            (expected) =>
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .animations === expected,
            resolved,
          );
          // Switching from the OS preference to its identical explicit value
          // intentionally does not redraw a paused on-demand scene.
          if (before.animations === resolved) return;
        }
        await renderAfter(Number(before.renderedFrames));
      };
      const focus = async (id, zoom = 0) => {
        await close();
        let frame = Number((await stats()).renderedFrames);
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
        await renderAfter(frame);
        for (let i = 0; i < zoom; i++) {
          frame = Number((await stats()).renderedFrames);
          await click(
            page.getByRole("button", {
              name: "Haritayı yakınlaştır",
              exact: true,
            }),
          );
          await renderAfter(frame);
        }
      };
      const screenshot = async (name) => {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const file = path.join(output, `${label}-${name}.png`);
        await page.screenshot({ path: file });
        console.log("SCREENSHOT " + file);
      };
      const observed = async (predicate) => {
        const handle = await page.waitForFunction(predicate);
        const data = await handle.jsonValue();
        await handle.dispose();
        return data;
      };
      const assertModels = (data, count) => {
        assert.equal(Number(data.infantryModels), 1);
        assert.equal(Number(data.tankModels), count >= 2 ? 1 : 0);
        assert.equal(Number(data.artilleryModels), count >= 3 ? 1 : 0);
        assert.equal(Number(data.truckModels), count >= 4 ? 1 : 0);
      };

      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await close();
      await ready();
      await pause();
      await choose("Grafik kalitesi", "low");
      await choose("Animasyonlar", "reduced");
      for (const [title, icon] of [
        ["Komuta", "command"],
        ["Ordu", "infantry"],
        ["Sanayi", "factory"],
        ["Kayıtlar", "save"],
      ]) {
        const button = page.locator(`button[title="${title}"]`);
        assert.equal(
          await button.locator(`svg[data-military-icon="${icon}"]`).count(),
          1,
        );
      }
      assert.equal(
        await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .locator('svg[data-military-icon="play"]')
          .count(),
        1,
      );
      passed(
        `${label}: real navigation and clock controls use coherent original military SVG symbols`,
      );

      const modelCounts =
        mobile || captureModelsOnly
          ? [4]
          : skipDesktopModels
            ? []
            : [1, 2, 3, 4];
      for (const count of modelCounts) {
        const f = modelFixture(count);
        await load(f);
        await choose("Harita bakışı", "perspective");
        await focus(f.origin, mobile ? 2 : 3);
        const data = await stats();
        assertModels(data, count);
        assert.equal(Number(data.unitGlows), 0);
        assert.equal(Number(data.unitDynamicLights), 0);
        assert.equal(Number(data.unitHeadlights), 0);
        samples.push({ label, view: `models-${count}`, data });
        if (count === 4) {
          await screenshot("four-models-close");
          if (captureModelsOnly && !mobile) {
            await choose("Grafik kalitesi", "high");
            const box = await canvas.boundingBox();
            const frame = Number((await stats()).renderedFrames);
            // Rotate the real OrbitControls camera with its normal middle
            // mouse gesture. No renderer or campaign internals are changed.
            await page.mouse.move(
              box.x + box.width * 0.7,
              box.y + box.height * 0.55,
            );
            await page.mouse.down({ button: "middle" });
            await page.mouse.move(
              box.x + box.width * 0.39,
              box.y + box.height * 0.5,
              { steps: 18 },
            );
            await page.mouse.up({ button: "middle" });
            await renderAfter(frame);
            const oblique = await stats();
            assertModels(oblique, 4);
            assert.ok(Number(oblique.cameraDistance) < 340);
            samples.push({ label, view: "models-oblique-high", data: oblique });
            await screenshot("four-models-oblique-high");
          }
          assert.deepEqual(
            await save(),
            f.world,
            "Viewing detailed models must not mutate the saved campaign",
          );
        }
        passed(
          `${label}: ${count}-division formation renders the correct detailed model set with no idle combat lights`,
        );
      }
      const marching = movementFixture();
      await load(marching);
      await choose("Harita bakışı", "strategic");
      await focus(marching.origin);
      let routeData = await arrows();
      assert.equal(routeData.routes, 2);
      assert.equal(routeData.heads, 2);
      assert.ok(routeData.vertices > 0 && routeData.vertices <= 60000);
      assert.deepEqual(routeData.arrows.map((arrow) => arrow.country).sort(), [
        "bulgaria",
        "turkey",
      ]);
      for (const arrow of routeData.arrows) {
        assert.equal(
          arrow.color,
          marching.world.countries[arrow.country].color,
        );
        assert.equal(arrow.selected, false);
        assert.equal(arrow.kind, "march");
      }
      assert.equal(
        routeData.arrows.find((arrow) => arrow.country === "turkey").count,
        4,
      );
      assert.equal(Number((await stats()).unitHeadlights), 2);
      samples.push({ label, view: "march-arrows", routeData });
      await screenshot("country-movement-arrow");
      passed(
        `${label}: nonselected moving armies retain grouped country-colored arrowheads; unknown German movement stays hidden`,
      );
      if (captureModelsOnly) {
        await context.close();
        continue;
      }

      await click(
        page.getByRole("button", { name: "2D siyasi harita", exact: true }),
      );
      await page.getByTestId("war-map").waitFor();
      const ownRoute = page.locator(
        '[data-movement-route][data-country="turkey"]',
      );
      assert.equal(await ownRoute.count(), 1);
      assert.equal(await ownRoute.getAttribute("data-count"), "4");
      assert.equal(
        await ownRoute.getAttribute("data-color"),
        marching.world.countries.turkey.color,
      );
      assert.ok((await ownRoute.locator("polygon").count()) > 0);
      assert.equal(
        await page
          .locator('[data-movement-route][data-country="germany"]')
          .count(),
        0,
      );
      await screenshot("svg-movement-arrow");
      assert.deepEqual(
        await save(),
        marching.world,
        "Switching arrow presentations must not move armies or alter the world",
      );
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await ready();
      await focus(marching.origin);
      await click(
        page.locator(`[data-formation^="turkey:${marching.origin}:"]`).first(),
      );
      await click(
        page
          .getByRole("button", { name: "Seçimi temizle", exact: true })
          .first(),
      );
      await close();
      routeData = await arrows();
      assert.equal(
        routeData.arrows.find((arrow) => arrow.country === "turkey").selected,
        false,
      );
      assert.equal(
        routeData.arrows.find((arrow) => arrow.country === "turkey").count,
        4,
      );
      await click(
        page.locator(`[data-formation^="turkey:${marching.origin}:"]`).first(),
      );
      await click(
        page.getByRole("button", {
          name: "Dur / savun · 4 tümen",
          exact: true,
        }),
      );
      await close();
      await page.waitForFunction(() => {
        const data = document.querySelector(
          '[data-testid="war-map-3d"]',
        )?.dataset;
        return (
          data &&
          !JSON.parse(data.movementArrows).arrows.some(
            (arrow) => arrow.country === "turkey",
          )
        );
      });
      const halted = await save();
      assert.ok(
        marching.ids.every(
          (id) => !halted.armies.find((army) => army.id === id).move,
        ),
      );
      assert.equal(Number((await stats()).unitHeadlights), 0);
      passed(
        `${label}: SVG arrows match 3D; clearing selection retains arrows and public halt removes all four marching orders`,
      );

      const completing = movementFixture(true);
      await load(completing);
      await focus(completing.origin);
      await advanceClockHours(page, 1, 1);
      await page.waitForFunction(() => {
        const data = document.querySelector(
          '[data-testid="war-map-3d"]',
        )?.dataset;
        return data && JSON.parse(data.movementArrows).routes === 0;
      });
      const arrived = await save();
      assert.ok(
        completing.ids.every((id) => {
          const army = arrived.armies.find((unit) => unit.id === id);
          return army.province === completing.target && !army.move;
        }),
      );
      passed(
        `${label}: the real clock completes all grouped arrivals and removes the movement arrow`,
      );

      const combat = modelFixture(4, true);
      await load(combat);
      await choose("Harita bakışı", "strategic");
      await choose("Animasyonlar", "full");
      await focus(combat.target);
      await click(
        page.locator(`[data-formation^="turkey:${combat.origin}:"]`).first(),
      );
      if (mobile)
        await click(
          page.getByRole("button", {
            name: "Haritada hedef seç · 4 tümen",
            exact: true,
          }),
        );
      await close();
      const box = await canvas.boundingBox();
      if (mobile)
        await page.touchscreen.tap(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
      else
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
          button: "right",
        });
      await focus(combat.target, 1);
      assert.equal(
        Number((await stats()).combatFormations),
        0,
        "Orders alone must not invent firing",
      );
      const before = await save();
      const play = page.getByRole("button", {
        name: "Zamanı başlat",
        exact: true,
      });
      const clockBox = await play.boundingBox();
      await click(play);
      const shot = await observed(() => {
        const data = document.querySelector(
          '[data-testid="war-map-3d"]',
        )?.dataset;
        return data &&
          Number(data.combatFormations) >= 2 &&
          Number(data.unitGlows) > 0 &&
          Number(data.unitGroundGlows) > 0 &&
          Number(data.infantryTracers) > 0 &&
          Number(data.tankShells) > 0 &&
          Number(data.shells) > 0
          ? { ...data }
          : false;
      });
      if (mobile)
        await page.touchscreen.tap(
          clockBox.x + clockBox.width / 2,
          clockBox.y + clockBox.height / 2,
        );
      else
        await page.mouse.click(
          clockBox.x + clockBox.width / 2,
          clockBox.y + clockBox.height / 2,
        );
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      await screenshot("combat-glowing-projectiles");
      const fighting = await save();
      assert.ok(
        fighting.countries.turkey.casualties >
          before.countries.turkey.casualties,
      );
      assert.ok(
        fighting.countries.bulgaria.casualties >
          before.countries.bulgaria.casualties,
      );
      assert.ok(
        combat.ids.every(
          (id) =>
            fighting.armies.find((army) => army.id === id)?.strength < 100,
        ),
      );
      assert.equal(
        Number(shot.unitDynamicLights),
        0,
        "Low uses bounded glow instead of dynamic lights",
      );
      assert.ok(Number(shot.unitHeadlights) >= 2);
      samples.push({ label, view: "combat-shot", shot });
      passed(
        `${label}: real mutual combat damage produces glowing rifle/tank/artillery projectiles, ground light and truck support lamps`,
      );

      const paused = await stats();
      await page.waitForTimeout(500);
      const frozen = await stats();
      for (const field of effectFields)
        assert.equal(
          frozen[field],
          paused[field],
          `${field} must freeze while paused`,
        );
      if (!mobile) {
        await choose("Grafik kalitesi", "high");
        const lit = await stats();
        assert.ok(
          Number(lit.unitDynamicLights) > 0 &&
            Number(lit.unitDynamicLights) <= 2,
        );
        assert.ok(Number(lit.unitGlows) > 0 && Number(lit.unitGroundGlows) > 0);
        samples.push({ label, view: "combat-high-lighting", data: lit });
        await screenshot("combat-high-illumination");
        await choose("Grafik kalitesi", "low");
        assert.equal(Number((await stats()).unitDynamicLights), 0);
      }
      await choose("Animasyonlar", "reduced");
      const reduced = await stats();
      await page.waitForTimeout(500);
      const reducedAgain = await stats();
      for (const field of effectFields)
        assert.equal(
          reducedAgain[field],
          reduced[field],
          `${field} must remain stable in reduced motion`,
        );
      assert.deepEqual(
        await save(),
        fighting,
        "Lighting, quality and motion preferences cannot change damage or the campaign",
      );
      passed(
        `${label}: combat lighting freezes with pause/reduced motion and quality scaling preserves the entire campaign`,
      );

      const calm = modelFixture(4);
      await load(calm);
      await focus(calm.origin, mobile ? 1 : 2);
      const calmData = await stats();
      for (const field of effectFields)
        assert.equal(
          Number(calmData[field]),
          0,
          `${field} survived a noncombat save import`,
        );
      assert.deepEqual(await save(), calm.world);
      passed(
        `${label}: a peaceful imported campaign clears every old shot, glow, pooled light and stationary-truck lamp`,
      );
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors, samples }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, errors, output }));
  } catch (error) {
    const state =
      activePage && !activePage.isClosed()
        ? await activePage
            .evaluate(() => ({
              ...document.querySelector('[data-testid="war-map-3d"]')?.dataset,
            }))
            .catch(() => null)
        : null;
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { error: error.stack, checks, errors, samples, state },
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
