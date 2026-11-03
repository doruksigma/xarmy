/* Focused WWII miniature visual review and compact mobile graphics controls.
   Imports use ordinary validated save files. Only public UI and the actual
   worker clock change campaigns; renderer diagnostics are read-only. */
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
  "/workspace/scratch/europa-wwii-reference-browser";
const requestedDevice = process.env.EUROPA_DEVICE;
const runCombat = process.env.EUROPA_REFERENCE_COMBAT === "1";
const combatOnly = process.env.EUROPA_REFERENCE_STAGE === "combat";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
assert.ok(!requestedDevice || ["desktop", "mobile"].includes(requestedDevice));
fs.mkdirSync(output, { recursive: true });

const completedTech = [
  "weapons1",
  "weapons2",
  "weapons3",
  "armor1",
  "armor2",
  "armor3",
  "motorization",
  "engines",
  "mechanization",
  "landDoctrine",
  "logistics",
  "industry1",
  "industry2",
];
function fixture({ complete = false, battle = false } = {}) {
  const world = createWorld("turkey", "historical", 1936, "normal");
  world.hour = 10;
  world.armies = [];
  for (const country of Object.values(world.countries)) {
    country.automation = {
      economy: false,
      research: false,
      recruitment: false,
      operations: false,
    };
    country.autoAssignCommanders = false;
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
  world.countries.turkey.tech = complete ? [...completedTech] : [];
  const origin = battle ? "turkey-city-0" : world.countries.turkey.capital;
  const target = battle ? "bulgaria-city-0" : "turkey-city-16";
  const ids = ["infantry", "lightTank", "artillery", "motorized"].map(
    (type) => {
      const unit = addArmy(world, "turkey", origin, type);
      unit.organization = 100;
      return unit.id;
    },
  );
  if (battle) {
    declareWar(world, "turkey", "bulgaria");
    addArmy(world, "bulgaria", target).organization = 100;
  }
  return { world: decodeSave(encodeSave(world)), origin, target, ids };
}
function tierCounts(data) {
  return JSON.parse(data.unitVisualTiers);
}
function assertTier(data, expected) {
  const counts = tierCounts(data);
  for (const [kind, tier] of Object.entries(expected))
    assert.deepEqual(
      counts[kind],
      [0, 1, 2, 3].map((index) => (index === tier ? 1 : 0)),
      kind,
    );
}
const baselineTiers = { infantry: 0, tank: 0, artillery: 0, truck: 0 };
const finalTiers = { infantry: 3, tank: 3, artillery: 3, truck: 3 };

(async () => {
  const browser = await chromium.launch({
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
  const checks = [],
    errors = [],
    samples = [];
  let activePage;
  const pass = (name) => {
    checks.push(name);
    console.log("PASS " + name);
    fs.writeFileSync(
      path.join(output, "progress.json"),
      JSON.stringify({ checks, errors, samples }, null, 2),
    );
  };
  try {
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 1000 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ].filter(([name]) => !requestedDevice || requestedDevice === name)) {
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      // Start with existing public saved presentation preferences. This avoids
      // rendering the large initial army before the focused fixture is loaded.
      await context.addInitScript(() => {
        localStorage.setItem("xarmy-europa-map-view-v1", "2d");
        localStorage.setItem("xarmy-europa-3d-quality-v1", "low");
        localStorage.setItem("xarmy-europa-3d-motion-v1", "reduced");
      });
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(120000);
      page.on("pageerror", (error) =>
        errors.push({ label, message: error.message }),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error")
          errors.push({ label, message: entry.text() });
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const canvas = page.getByTestId("war-map-3d");
      const stats = () =>
        canvas.evaluate((element) => ({ ...element.dataset }));
      const ready = () =>
        page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      const frameAfter = (frame) =>
        page.waitForFunction(
          (previous) =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .renderedFrames,
            ) > previous,
          frame,
          { timeout: 120000 },
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
      const tab = async (name) => {
        await close();
        await click(page.locator(`button[title="${name}"]`));
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
      const load = async (f) => {
        await pause();
        const previous = (await canvas.count())
          ? await canvas.elementHandle()
          : null;
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "research-models.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(f.world)),
        });
        if (previous) {
          await page.waitForFunction(
            (element) => !element.isConnected,
            previous,
          );
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
          worldHour(f.world),
        );
        await close();
        if (await canvas.count()) await ready();
        await click(
          page.getByRole("button", { name: "1 kat hız", exact: true }),
        );
      };
      const settings = page.getByTestId("map3d-settings");
      const settingsToggle = page.getByTestId("map3d-settings-toggle");
      const setSettings = async (open) => {
        if (!mobile) return;
        const expanded = await settings.evaluate((element) => element.open);
        if (expanded !== open) await click(settingsToggle);
        await page.waitForFunction(
          (expected) =>
            document.querySelector('[data-testid="map3d-settings"]')?.open ===
            expected,
          open,
        );
      };
      const choose = async (name, value) => {
        const control = page.getByLabel(name, { exact: true });
        if ((await control.inputValue()) === value) return;
        const before = await stats();
        console.log(
          `STEP ${label}: ${name}→${value}, frame ${before.renderedFrames}`,
        );
        await setSettings(true);
        await control.selectOption(value);
        if (name === "Animasyonlar") {
          await page.waitForFunction(
            (value) =>
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .animations === value,
            value,
          );
          if (before.animations === value) {
            await setSettings(false);
            return;
          }
        }
        try {
          await frameAfter(Number(before.renderedFrames));
        } catch (error) {
          const diagnostic = await page.evaluate(() => {
            const data = document.querySelector(
              '[data-testid="war-map-3d"]',
            )?.dataset;
            return {
              hidden: document.hidden,
              visibility: document.visibilityState,
              ready: data?.ready,
              frames: data?.renderedFrames,
              viewpoint: data?.viewpoint,
              quality: data?.quality,
              distance: data?.cameraDistance,
            };
          });
          console.log("FRAME WAIT FAILED " + JSON.stringify(diagnostic));
          throw error;
        }
        await setSettings(false);
        console.log(
          `STEP ${label}: ${name} rendered frame ${(await stats()).renderedFrames}`,
        );
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
        await frameAfter(frame);
        for (let index = 0; index < zoom; index++) {
          frame = Number((await stats()).renderedFrames);
          await click(
            page.getByRole("button", {
              name: "Haritayı yakınlaştır",
              exact: true,
            }),
          );
          await frameAfter(frame);
        }
        await page.waitForFunction(
          (expected) =>
            Math.abs(
              Number(
                document.querySelector('[data-testid="war-map-3d"]')?.dataset
                  .cameraDistance,
              ) - expected,
            ) < 0.01,
          220 * 0.75 ** zoom,
        );
      };
      const shot = async (name) => {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const file = path.join(output, `${label}-${name}.png`);
        await page.screenshot({ path: file, timeout: 60000 });
        console.log("SCREENSHOT " + file);
      };
      const modelView = async (id, zoom = mobile ? 2 : 3) => {
        await choose("Harita bakışı", "perspective");
        await focus(id, zoom);
        if (mobile) return;
        const box = await canvas.boundingBox();
        const frame = Number((await stats()).renderedFrames);
        await page.mouse.move(
          box.x + box.width * 0.7,
          box.y + box.height * 0.55,
        );
        await page.mouse.down({ button: "middle" });
        await page.mouse.move(
          box.x + box.width * 0.39,
          box.y + box.height * 0.5,
          { steps: 6 },
        );
        await page.mouse.up({ button: "middle" });
        await frameAfter(frame);
      };

      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      console.log(`STEP ${label}: page loaded`);
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await pause();
      await close();
      const original = fixture();
      const modern = fixture({ complete: true });
      await load(original);
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await ready();
      if (!combatOnly) {
        if (mobile) {
          assert.equal(
            await settings.evaluate((element) => element.open),
            false,
          );
          assert.equal(
            await page
              .getByLabel("Grafik kalitesi", { exact: true })
              .isVisible(),
            false,
          );
          const rect = await settingsToggle.boundingBox();
          assert.ok(
            rect &&
              rect.height >= 40 &&
              rect.x >= 0 &&
              rect.x + rect.width <= viewport.width + 1,
          );
          await shot("mobile-controls-closed");
          await setSettings(true);
          for (const name of [
            "Harita bakışı",
            "Grafik kalitesi",
            "Animasyonlar",
          ])
            assert.ok(
              await page.getByLabel(name, { exact: true }).isVisible(),
              name,
            );
          await shot("mobile-controls-open");
          await setSettings(false);
          assert.deepEqual(await save(), original.world);
          pass(
            `${label}: graphics controls collapse into a usable touch target and expand without mutating the campaign`,
          );
        }
        await modelView(original.origin);
        const baseline = await stats();
        assertTier(baseline, baselineTiers);
        assert.ok(
          Number(baseline.infantryModels) === 1 &&
            Number(baseline.vehicleModels) === 3,
        );
        assert.equal(baseline.idleAnimating, "false");
        samples.push({ label, view: "tier0-same-camera", data: baseline });
        await shot("tier0-same-camera-low");
        if (!mobile) {
          await modelView(original.origin, 5);
          await shot("tier0-closeup-low");
        }
        assert.deepEqual(await save(), original.world);
        await load(modern);
        await modelView(modern.origin);
        const advanced = await stats();
        assertTier(advanced, finalTiers);
        assert.ok(
          Math.abs(
            Number(advanced.cameraDistance) - Number(baseline.cameraDistance),
          ) <= 0.01,
        );
        assert.ok(Number(advanced.idleHeads) > 0);
        samples.push({ label, view: "tier3-same-camera", data: advanced });
        await shot("tier3-same-camera-low");
        if (!mobile) {
          await choose("Grafik kalitesi", "high");
          assertTier(await stats(), finalTiers);
          await shot("tier3-same-camera-high");
          await modelView(modern.origin, 5);
          const closeup = await stats();
          assert.ok(Number(closeup.cameraDistance) < 55);
          samples.push({ label, view: "tier3-closeup-high", data: closeup });
          await shot("tier3-closeup-high");
          await choose("Grafik kalitesi", "low");
        }
        assert.deepEqual(await save(), modern.world);
        pass(
          `${label}: actual tier0/tier3 geometry renders at the same camera and presentation controls preserve the full campaign`,
        );
      }
      if (!mobile && runCombat) {
        const battle = fixture({ complete: true, battle: true });
        await load(battle);
        if (!(await canvas.count()))
          await click(
            page.getByRole("button", { name: "3D arazi", exact: true }),
          );
        await ready();
        await choose("Harita bakışı", "strategic");
        await choose("Animasyonlar", "full");
        await focus(battle.target);
        await click(
          page.locator(`[data-formation^="turkey:${battle.origin}:"]`).first(),
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
          await page.mouse.click(
            box.x + box.width / 2,
            box.y + box.height / 2,
            {
              button: "right",
            },
          );
        await focus(battle.target, 1);
        await choose("Grafik kalitesi", "low");
        const battleBefore = await save();
        const clockBox = await page
          .getByRole("button", { name: "Zamanı başlat", exact: true })
          .boundingBox();
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        const handle = await page.waitForFunction(() => {
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
        const firing = await handle.jsonValue();
        await handle.dispose();
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
        console.log(
          `STEP ${label}: actual upgraded combat firing captured and publicly paused`,
        );
        await shot("upgraded-combat-lights");
        const battleAfter = await save();
        assert.ok(
          battleAfter.countries.turkey.casualties >
            battleBefore.countries.turkey.casualties,
        );
        assert.ok(
          battleAfter.countries.bulgaria.casualties >
            battleBefore.countries.bulgaria.casualties,
        );
        assert.ok(
          battle.ids.every(
            (id) =>
              battleAfter.armies.find((army) => army.id === id)?.strength < 100,
          ),
        );
        assert.equal(Number(firing.unitDynamicLights), 0);
        assert.ok(Number(firing.unitHeadlights) >= 2);
        assert.equal(firing.idleAnimating, "false");
        assert.ok(
          JSON.parse(firing.headYawSample).every(
            (head) => Math.abs(head.yaw) < 0.0001,
          ),
        );
        assert.equal(tierCounts(firing).tank[3], 1);
        assert.equal(tierCounts(firing).artillery[3], 1);
        samples.push({ label, view: "upgraded-combat", data: firing });
        if (!mobile) {
          await choose("Animasyonlar", "reduced");
          await choose("Grafik kalitesi", "high");
          const highCombat = await stats();
          assert.ok(
            Number(highCombat.unitDynamicLights) > 0 &&
              Number(highCombat.unitDynamicLights) <= 2,
          );
          assert.ok(
            Number(highCombat.unitGlows) > 0 &&
              Number(highCombat.unitGroundGlows) > 0,
          );
          assert.equal(tierCounts(highCombat).tank[3], 1);
          samples.push({
            label,
            view: "upgraded-combat-high-paused",
            data: highCombat,
          });
          await shot("upgraded-combat-high-paused");
          await choose("Grafik kalitesi", "low");
          assert.deepEqual(await save(), battleAfter);
        }
        await load(modern);
        await focus(modern.origin);
        const clear = await stats();
        for (const field of [
          "unitGlows",
          "unitGroundGlows",
          "unitDynamicLights",
          "unitHeadlights",
          "infantryTracers",
          "tankShells",
          "shells",
          "muzzleFlashes",
          "impacts",
        ])
          assert.equal(Number(clear[field]), 0, field);
        assert.deepEqual(await save(), modern.world);
        pass(
          `${label}: upgraded rifles, tanks and artillery emit combat lights only with real mutual damage, and peaceful import clears every old effect`,
        );
      }
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
