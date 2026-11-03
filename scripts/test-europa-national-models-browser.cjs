/* National WWII miniatures at identical camera and research, plus mobile and real combat.
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
  "/workspace/scratch/europa-national-models-browser";
const requestedDevice = process.env.EUROPA_DEVICE;
const runCombat = process.env.EUROPA_NATIONAL_COMBAT !== "0";
const countryIds = ["germany", "uk", "france", "ussr", "italy", "turkey", "poland", "czechoslovakia", "netherlands", "sweden"];
const { startCivilWar } = require("../app/games/europa-war/strategy/politics.ts");
const { advanceHours } = require("../app/games/europa-war/strategy/engine.ts");
const { getCountryModelProfile, getNationalModelDescription } = require("../app/games/europa-war/strategy/map3d-national-profiles.ts");
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
function fixture({ nation = "turkey", tier = 0, complete = false, battle = false, rebels = false, foreignResearch = false } = {}) {
  const world = createWorld(nation, "historical", 1936, "normal");
  if (rebels) {
    startCivilWar(world, nation, true);
    nation += "-rebels";
    world.player = nation;
  }
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
    country.tech = foreignResearch ? [...completedTech] : [];
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
  world.countries[nation].tech = complete || tier === 3 ? [...completedTech] : tier === 1 ? ["weapons1", "armor1", "motorization"] : [];
  const origin = battle ? "turkey-city-0" : world.countries.turkey.capital;
  const target = battle ? "bulgaria-city-0" : "turkey-city-16";
  const ids = ["infantry", "lightTank", "artillery", "motorized"].map(
    (type) => {
      const unit = addArmy(world, nation, origin, type);
      unit.organization = 100;
      return unit.id;
    },
  );
  if (battle) {
    declareWar(world, "turkey", "bulgaria");
    addArmy(world, "bulgaria", target).organization = 100;
  }
  return { world: decodeSave(encodeSave(world)), origin, target, ids, nation, tier: complete ? 3 : tier };
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

function assertNational(data, f) {
  assert.deepEqual(JSON.parse(data.unitModelProfiles), { [getCountryModelProfile(f.nation).id]: 4 });
  assertTier(data, { infantry: f.tier, tank: f.tier, artillery: f.tier, truck: f.tier });
  assert.equal(Number(data.infantryModels), 1);
  assert.equal(Number(data.vehicleModels), 3);
  assert.ok(Number(data.renderedFrames) > 0 && Number(data.triangles) > 1000);
  assert.ok(Number(data.unitModelParts) > 0 && Number(data.unitModelVertices) > 0);
  assert.ok(Number(data.unitModelIdleParts) <= 64);
  assert.ok(Number(data.unitModelIdleVertices) <= 180000);
  assert.ok(Number(data.unitModelIdleCapacity) <= 4096);
  assert.equal(data.idleAnimating, "false");
}
function simulatedUntil(before, after) {
  let expected = before;
  let remaining = worldHour(after) - worldHour(before);
  assert.ok(Number.isSafeInteger(remaining) && remaining >= 0 && remaining < 48);
  while (remaining > 0) {
    const hours = Math.min(24, remaining);
    expected = advanceHours(expected, hours);
    remaining -= hours;
  }
  return expected;
}
// Public save validation can be checked without opening Chromium.
for (const nation of countryIds) for (const tier of [0, 1, 3]) fixture({ nation, tier });
fixture({ nation: "france", rebels: true });
fixture({ tier: 0, foreignResearch: true });
fixture({ complete: true, battle: true });
for (const id of [undefined, "unknown", "__proto__", "germany-rebels-rebels"])
  assert.equal(getCountryModelProfile(id).id, "default");
if (process.env.EUROPA_FIXTURES_ONLY === "1") {
  console.log("PASS national fixtures validate and unchecked profile IDs use bounded fallback");
  process.exit(0);
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
      const assertResearchGuide = async (f) => {
        await tab("Araştırma");
        const guide = page.locator("[data-unit-research-guide]");
        const profile = getCountryModelProfile(f.nation);
        assert.equal(await guide.getAttribute("data-national-model-profile"), profile.id);
        assert.ok((await guide.innerText()).includes(`${profile.label} modelleri.`));
        for (const kind of ["infantry", "tank", "artillery", "truck"]) {
          const model = guide.locator(`[data-model-kind="${kind}"]`);
          assert.equal(await model.getAttribute("data-model-tier"), String(f.tier));
          assert.ok((await model.innerText()).includes(getNationalModelDescription(profile, kind)), kind);
        }
        await close();
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
          name: "national-models.json",
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
      // Public perspective + focus controls reset the same fixed camera offset.
      // Wait for its final render before comparing projected city anchors.
      const settleCamera = async () => {
        await page.evaluate(() => new Promise((resolve, reject) => {
          const start = performance.now();
          let lastFrame = -1, changed = start;
          const check = () => {
            const current = Number(document.querySelector('[data-testid="war-map-3d"]')?.dataset.renderedFrames);
            const now = performance.now();
            if (current !== lastFrame) { lastFrame = current; changed = now; }
            if (now - start > 120000) return reject(new Error("Camera did not settle"));
            if (now - changed > 800 && now - start > 1000) return resolve();
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }));
      };
      let comparisonProjection;
      const assertComparisonCamera = async (id) => {
        const projection = await page.locator(`[data-province-label="${id}"]`).evaluate((element) => {
          const match = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(element.style.transform);
          return match ? [Number(match[1]), Number(match[2])] : null;
        });
        assert.ok(projection, "The fixed comparison city has a projected anchor");
        if (comparisonProjection)
          projection.forEach((value, index) => assert.ok(Math.abs(value - comparisonProjection[index]) <= 0.3,
            `Settled camera projection differs: ${projection} vs ${comparisonProjection}`));
        else comparisonProjection = projection;
      };
      const modelView = async (id, zoom = mobile ? 4 : 5) => {
        await choose("Harita bakışı", "perspective");
        await focus(id, zoom);
        await settleCamera();
      };

      await page.goto(`${base}/games/europa-war`, { waitUntil: "domcontentloaded" });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await pause();
      await close();
      const original = fixture();
      const modern = fixture({ complete: true });
      await load(original);
      await click(page.getByRole("button", { name: "3D arazi", exact: true }));
      await ready();
      const nations = mobile ? ["turkey", "germany"] : countryIds;
      let sameDistance;
      for (const nation of nations) {
        const f = fixture({ nation });
        await load(f);
        await modelView(f.origin);
        await assertComparisonCamera(f.origin);
        const data = await stats();
        assertNational(data, f);
        const distance = Number(data.cameraDistance);
        if (sameDistance != null) assert.ok(Math.abs(distance - sameDistance) < 0.01);
        sameDistance = distance;
        samples.push({ label, view: `${nation}-tier0-same-camera`, data });
        await shot(`${nation}-tier0-same-camera`);
        await assertResearchGuide(f);
        assert.deepEqual(await save(), f.world);
        pass(`${label}: ${nation} renders four national models at equal research and camera without changing the campaign`);
      }
      if (mobile) {
        assert.equal(await settings.evaluate((element) => element.open), false);
        const rect = await settingsToggle.boundingBox();
        assert.ok(rect && rect.height >= 40 && rect.x >= 0 && rect.x + rect.width <= viewport.width + 1);
        await setSettings(true);
        for (const name of ["Harita bakışı", "Grafik kalitesi", "Animasyonlar"])
          assert.ok(await page.getByLabel(name, { exact: true }).isVisible(), name);
        await shot("controls-open");
        await setSettings(false);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        pass("mobile: national models and collapsible controls fit 390×844 without horizontal overflow");
      }
      for (const nation of nations) {
        const upgraded = fixture({ nation, tier: 3 });
        await load(upgraded);
        await modelView(upgraded.origin);
        await assertComparisonCamera(upgraded.origin);
        assertNational(await stats(), upgraded);
        assert.ok(Math.abs(Number((await stats()).cameraDistance) - sameDistance) < 0.01);
        await shot(`${nation}-tier3-same-camera`);
        samples.push({ label, view: `${nation}-tier3-same-camera`, data: await stats() });
        if (!mobile && nation === "germany") {
          await choose("Grafik kalitesi", "high");
          assertNational(await stats(), upgraded);
          await shot("germany-tier3-high");
          await choose("Grafik kalitesi", "low");
        }
        await assertResearchGuide(upgraded);
        assert.deepEqual(await save(), upgraded.world);
        pass(`${label}: ${nation} upgraded models retain their national profile, research descriptions and campaign at the same camera`);
      }
      if (!mobile) {
        const unrelated = fixture({ nation: "turkey", tier: 0, foreignResearch: true });
        await load(unrelated);
        await modelView(unrelated.origin);
        assertNational(await stats(), unrelated);
        await shot("turkey-tier0-foreign-research");
        assert.deepEqual(await save(), unrelated.world);
        pass("desktop: another country's completed research does not change the player's tier");
        const rebel = fixture({ nation: "france", rebels: true });
        await load(rebel);
        await modelView(rebel.origin);
        assertNational(await stats(), rebel);
        await shot("france-rebels-tier0");
        await assertResearchGuide(rebel);
        assert.deepEqual(await save(), rebel.world);
        pass("desktop: a validated civil-war country inherits the French model family");
      }
      await load(modern);
      await modelView(modern.origin);
      await choose("Animasyonlar", "full");
      const idleBefore = await save();
      const yawBefore = JSON.parse((await stats()).headYawSample);
      await click(page.getByRole("button", { name: "Zamanı başlat", exact: true }));
      await page.waitForFunction((before) => {
        const data = document.querySelector('[data-testid="war-map-3d"]')?.dataset;
        if (data?.idleAnimating !== "true") return false;
        return JSON.parse(data.headYawSample).some((head) =>
          Math.abs(head.yaw - (before.find((old) => old.id === head.id)?.yaw ?? 0)) > 0.02);
      }, yawBefore);
      await pause();
      await page.waitForFunction(() => document.querySelector('[data-testid="war-map-3d"]')?.dataset.idleAnimating === "false");
      const still = await stats();
      await page.waitForTimeout(450);
      assert.equal((await stats()).headYawSample, still.headYawSample);
      await choose("Animasyonlar", "reduced");
      const reduced = (await stats()).headYawSample;
      await click(page.getByRole("button", { name: "Zamanı başlat", exact: true }));
      await page.waitForTimeout(450);
      assert.equal((await stats()).headYawSample, reduced);
      await pause();
      const idleAfter = await save();
      assert.deepEqual(idleAfter, simulatedUntil(idleBefore, idleAfter));
      for (const id of modern.ids) {
        const unit = idleAfter.armies.find((army) => army.id === id);
        assert.equal(unit.province, modern.origin);
        assert.ok(unit.move == null);
        assert.deepEqual(unit.route, []);
      }
      samples.push({ label, view: "national-idle-frozen", data: still });
      pass(`${label}: national heads look around while running and freeze on pause/reduced motion without marching`);
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
