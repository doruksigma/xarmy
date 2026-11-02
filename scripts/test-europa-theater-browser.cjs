/* Cartography, guided command controls and real air/naval presentations.
   Fixture setup runs outside the browser; import, orders, time and archive
   checks use the public UI. Canvas data describes actual rendered geometry. */
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
  applyCountryAction,
} = require("../app/games/europa-war/strategy/action-engine.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const { worldHour } = require("../app/games/europa-war/strategy/time.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-theater";
const theaterOnly = process.env.EUROPA_THEATER_ONLY === "1";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

function baseWorld() {
  const world = createWorld("turkey", "historical", 73290, "easy");
  world.hour = 10;
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
    c.stock.fuel = 1000;
    for (const general of c.generals) delete general.front;
  }
  for (const p of Object.values(world.provinces)) {
    p.buildings.infra = 10;
    p.buildings.hub = 5;
    p.damage = 0;
  }
  return world;
}

function borderFixture(capture = false) {
  const world = baseWorld();
  declareWar(world, "turkey", "bulgaria");
  if (capture) {
    const army = addArmy(world, "turkey", "turkey-city-0");
    army.move = { to: "bulgaria-city-0", progress: 0.99, days: 1 };
    army.stance = "advance";
    army.organization = 100;
  }
  return decodeSave(encodeSave(world));
}

function guideFixture() {
  const world = baseWorld();
  world.countries.turkey.claims.push("bulgaria");
  for (let i = 0; i < 16; i++) addArmy(world, "turkey", "turkey-0");
  return decodeSave(encodeSave(world));
}

function theaterFixture() {
  let world = baseWorld();
  world.hour = 20;
  declareWar(world, "turkey", "bulgaria");
  for (const province of ["turkey-1", "bulgaria-2"])
    world.provinces[province].buildings.airfield = 4;
  world.provinces["bulgaria-city-0"].buildings.antiAir = 0;
  world.provinces["bulgaria-city-0"].buildings.military = 2;
  // Revealed assets are eligible for the same visual layer as the player's
  // forces; production data remains the real saved simulation state.
  world.countries.turkey.intel.bulgaria = { level: 90, expires: 20 };
  const ids = {};
  const order = (country, action) => {
    const result = applyCountryAction(world, country, action);
    assert.equal(result.error, null, `${country}: ${action.type}`);
    world = result.world;
  };
  for (const [country, base, model, mission, key] of [
    ["turkey", "turkey-1", "fighter", "superiority", "fighter"],
    ["turkey", "turkey-1", "strategicBomber", "strategic", "bomber"],
    ["bulgaria", "bulgaria-2", "fighter", "superiority", "enemyFighter"],
  ]) {
    world.countries[country].equipment[model] = 20;
    order(country, { type: "createWing", model, base, count: 20 });
    const wing = world.countries[country].air.wings.at(-1);
    wing.readiness = 100;
    ids[key] = wing.id;
    order(country, {
      type: "wing",
      id: wing.id,
      mission,
      target: "bulgaria-city-0",
    });
  }
  for (const [country, port, model, key] of [
    ["turkey", "turkey-1", "battleship", "ship"],
    ["bulgaria", "bulgaria-2", "destroyer", "enemyShip"],
  ]) {
    world.countries[country].equipment[model] = 1;
    order(country, { type: "commission", model, port });
    const ship = world.countries[country].navy.ships.at(-1);
    ids[key] = ship.id;
    order(country, {
      type: "ship",
      id: ship.id,
      mission: "patrol",
      zone: "black",
    });
  }
  return { world: decodeSave(encodeSave(world)), ids };
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
        reducedMotion: "reduce",
      });
      const page = (activePage = await context.newPage());
      page.setDefaultTimeout(45000);
      page.on("pageerror", (error) =>
        errors.push(`${label}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`${label}: ${entry.text()}`);
      });
      const click = (locator) => (mobile ? locator.tap() : locator.click());
      const canvas = page.getByTestId("war-map-3d");
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.count()) await click(button);
      };
      const closePanel = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
        ]) {
          const button = page.getByRole("button", { name, exact: true });
          if (await button.count()) await click(button);
        }
      };
      const ready = async () => {
        await canvas.waitFor();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      };
      const stats = () =>
        canvas.evaluate((element) => ({ ...element.dataset }));
      const waitForRenderAfter = async (frame) => {
        await page.waitForFunction(
          (before) =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .renderedFrames,
            ) > before,
          frame,
        );
      };
      const settledCamera = async () => {
        let previous = NaN;
        for (let attempts = 0; attempts < 50; attempts++) {
          await page.waitForTimeout(150);
          const current = Number((await stats()).cameraDistance);
          if (Number.isFinite(previous) && Math.abs(current - previous) < 0.001)
            return current;
          previous = current;
        }
        throw new Error("Camera did not settle");
      };
      const save = async (name) => {
        await pause();
        await closePanel();
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
        if (name)
          fs.writeFileSync(
            path.join(output, `${label}-${name}.json`),
            encodeSave(world),
          );
        await closePanel();
        return world;
      };
      const load = async (world) => {
        await pause();
        await closePanel();
        const previousCanvas = await canvas.elementHandle();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "theater-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(world)),
        });
        await page.waitForFunction(
          (element) => !element.isConnected,
          previousCanvas,
        );
        await previousCanvas.dispose();
        await page.waitForFunction(
          (hour) =>
            Number(
              document
                .querySelector('[data-testid="game-date"]')
                ?.getAttribute("data-game-hour"),
            ) === hour,
          worldHour(world),
        );
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await closePanel();
        await ready();
      };
      const commandTab = async () => {
        await closePanel();
        await click(page.locator('button[title="Komuta"]'));
      };
      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await closePanel();
      await ready();
      await page
        .getByLabel("Grafik kalitesi", { exact: true })
        .selectOption("low");

      if (!theaterOnly) {
        const cartography = borderFixture();
        await load(cartography);
        let cameraFrame = Number((await stats()).renderedFrames);
        await click(
          page.getByRole("button", {
            name: "Tüm haritayı göster",
            exact: true,
          }),
        );
        await page
          .getByLabel("Harita bakışı", { exact: true })
          .selectOption("strategic");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .viewpoint === "strategic",
        );
        await waitForRenderAfter(cameraFrame);
        // Import can still have a first country-focus frame in flight. Wait for
        // the public fit-map command's actual rendered distance, not that frame.
        const mapBox = await canvas.boundingBox();
        const fittedDistance = mapBox.width / mapBox.height < 0.8 ? 1550 : 1100;
        await page.waitForFunction(
          (distance) =>
            Math.abs(
              Number(
                document.querySelector('[data-testid="war-map-3d"]')?.dataset
                  .cameraDistance,
              ) - distance,
            ) < 0.01,
          fittedDistance,
        );
        const countries = page.locator(
          ".map3d-country-label[data-map-country]",
        );
        assert.ok((await countries.count()) >= 10);
        assert.equal(
          await countries
            .first()
            .evaluate((element) => getComputedStyle(element).pointerEvents),
          "none",
        );
        await page
          .locator('.map3d-country-label[data-map-country="turkey"]')
          .waitFor({ state: "visible" });
        const cameraDistance = await settledCamera();
        await page.screenshot({
          path: path.join(output, `${label}-political-map.png`),
        });
        cameraFrame = Number((await stats()).renderedFrames);
        await page
          .getByLabel("Harita bakışı", { exact: true })
          .selectOption("perspective");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .viewpoint === "perspective",
        );
        await waitForRenderAfter(cameraFrame);
        await settledCamera();
        cameraFrame = Number((await stats()).renderedFrames);
        await page
          .getByLabel("Harita bakışı", { exact: true })
          .selectOption("strategic");
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .viewpoint === "strategic",
        );
        await waitForRenderAfter(cameraFrame);
        const cameraAfter = await settledCamera();
        assert.ok(
          Math.abs(cameraAfter - cameraDistance) < 0.05,
          `A camera viewpoint round trip must preserve zoom: ${cameraDistance} -> ${cameraAfter}`,
        );
        assert.deepEqual(await save(), cartography);
        passed(
          `${label}: country labels and both camera viewpoints render without changing the campaign`,
        );

        const bordersBefore = JSON.parse((await stats()).politicalBorderStats);
        assert.ok(
          bordersBefore.countrySegments > 0 &&
            bordersBefore.coastSegments > 0 &&
            bordersBefore.frontSegments > 0,
        );
        await advanceClockHours(page, 1);
        const bordersIdle = JSON.parse((await stats()).politicalBorderStats);
        assert.equal(bordersIdle.fingerprint, bordersBefore.fingerprint);
        assert.equal(bordersIdle.rebuilds, bordersBefore.rebuilds);
        passed(
          `${label}: national, coastal and hostile borders stay cached through an unchanged hour`,
        );

        const conquest = borderFixture(true);
        await load(conquest);
        const beforeCapture = JSON.parse((await stats()).politicalBorderStats);
        await advanceClockHours(page, 1);
        const captured = await save("captured");
        assert.equal(
          captured.provinces["bulgaria-city-0"].controller,
          "turkey",
        );
        await page.waitForFunction((fingerprint) => {
          const value = document.querySelector('[data-testid="war-map-3d"]')
            ?.dataset.politicalBorderStats;
          return value && JSON.parse(value).fingerprint !== fingerprint;
        }, beforeCapture.fingerprint);
        const afterCapture = JSON.parse((await stats()).politicalBorderStats);
        assert.ok(afterCapture.rebuilds > beforeCapture.rebuilds);
        passed(
          `${label}: actual city capture updates ownership borders instead of leaving the initial map outline`,
        );

        const guided = guideFixture();
        await load(guided);
        await commandTab();
        await page.getByTestId("easy-command-guide").waitFor();
        assert.equal(
          await page.getByTestId("easy-mode").getAttribute("aria-pressed"),
          "true",
        );
        await click(page.getByTestId("easy-assign"));
        const assigned = await save();
        assert.equal(assigned.countries.turkey.autoAssignCommanders, true);
        assert.ok(assigned.armies.every((a) => a.general));
        const generalCounts = Object.groupBy(assigned.armies, (a) => a.general);
        assert.equal(Object.keys(generalCounts).length, 2);
        assert.ok(
          Object.values(generalCounts).every((members) => members.length <= 12),
        );
        const general = assigned.armies.at(-1).general;
        await commandTab();
        await page
          .getByLabel("Rehber komutanı", { exact: true })
          .selectOption(general);
        assert.equal(await page.getByTestId("easy-target-germany").count(), 0);
        await click(page.getByTestId("easy-target-bulgaria"));
        await click(page.getByTestId("easy-deploy"));
        assert.equal(await page.getByTestId("easy-attack").isDisabled(), true);
        await page.screenshot({
          path: path.join(output, `${label}-commander-guide.png`),
        });
        const deployed = await save();
        const deployedFront = deployed.countries.turkey.generals.find(
          (g) => g.id === general,
        ).front;
        assert.equal(deployedFront.target, "bulgaria");
        assert.equal(deployedFront.stance, "defend");
        assert.equal(Object.keys(deployedFront.assignments).length, 4);
        assert.deepEqual(deployed.countries.turkey.wars, []);
        assert.ok(
          deployed.armies
            .filter((a) => a.general === general)
            .every((a) => a.move || a.route.length > 0),
        );
        assert.ok(
          deployed.armies
            .filter((a) => a.general !== general)
            .every((a) => !a.move && a.route.length === 0),
        );
        passed(
          `${label}: guided assignment and neighboring-border deployment issue real orders and do not declare war`,
        );

        await commandTab();
        await click(page.getByTestId("easy-diplomacy"));
        await page
          .getByRole("heading", { name: "Diplomasi", exact: true })
          .waitFor();
        const diplomacyHeading = await page
          .getByRole("heading", { name: "Diplomasi", exact: true })
          .boundingBox();
        assert.ok(
          diplomacyHeading &&
            diplomacyHeading.y >= 0 &&
            diplomacyHeading.y + diplomacyHeading.height <= viewport.height,
          "Opening another panel must reveal its heading instead of retaining the old scroll position",
        );
        assert.equal(
          await page.getByLabel(/^Hedef ülke/).inputValue(),
          "bulgaria",
        );
        await click(page.getByRole("button", { name: /^Savaş ilan et/ }));
        await commandTab();
        assert.equal(
          await page
            .getByLabel("Rehber komutanı", { exact: true })
            .inputValue(),
          general,
        );
        assert.equal(await page.getByTestId("easy-attack").isDisabled(), false);
        await click(page.getByTestId("easy-attack"));
        const attacking = await save();
        assert.ok(attacking.countries.turkey.wars.includes("bulgaria"));
        assert.equal(
          attacking.countries.turkey.generals.find((g) => g.id === general)
            .front.stance,
          "attack",
        );
        await commandTab();
        await click(page.getByTestId("easy-defend"));
        const defending = await save();
        assert.equal(
          defending.countries.turkey.generals.find((g) => g.id === general)
            .front.stance,
          "defend",
        );
        passed(
          `${label}: guide opens the selected country's diplomacy and real attack/defend orders remain tied to that front`,
        );

        await commandTab();
        await click(page.getByTestId("full-mode"));
        await page
          .getByTestId("easy-command-guide")
          .waitFor({ state: "hidden" });
        assert.equal(
          await page
            .getByRole("navigation", { name: "Yönetim panelleri" })
            .locator('button[title]:not([title="Yeni sefer"])')
            .count(),
          9,
        );
        assert.deepEqual(await save(), defending);
        await commandTab();
        await click(page.getByTestId("easy-mode"));
        const oldTick = worldHour(defending);
        await page.evaluate((oldTick) => {
          window.__theaterGuideHour = new Promise((resolve, reject) => {
            const clock = document.querySelector('[data-testid="game-date"]');
            const observer = new MutationObserver(() => {
              const current = Number(clock.getAttribute("data-game-hour"));
              if (current === oldTick) return;
              observer.disconnect();
              clearTimeout(timeout);
              document
                .querySelector('button[aria-label="Zamanı duraklat"]')
                .click();
              resolve(current);
            });
            const timeout = setTimeout(() => {
              observer.disconnect();
              reject(new Error("Guide did not start the real clock"));
            }, 45000);
            observer.observe(clock, {
              attributes: true,
              attributeFilter: ["data-game-hour"],
            });
          });
        }, oldTick);
        await click(
          page.getByRole("button", {
            name: "Rehberden zamanı ilerlet",
            exact: true,
          }),
        );
        assert.equal(
          await page.evaluate(() => window.__theaterGuideHour),
          oldTick + 1,
        );
        const marched = await save();
        assert.ok(marched.armies.some((a) => a.move?.progress > 0));
        passed(
          `${label}: simple/full views retain all systems and the guide's execute button advances real troop movement`,
        );
      }

      const theater = theaterFixture();
      await load(theater.world);
      await page
        .getByLabel("Animasyonlar", { exact: true })
        .selectOption("full");
      await page.getByLabel("Şehir bul", { exact: true }).fill("İstanbul");
      await click(
        page
          .getByRole("list", { name: "Şehir arama sonuçları" })
          .getByRole("button")
          .filter({ hasText: "İstanbul" })
          .first(),
      );
      await closePanel();
      for (let step = 0; step < 2; step++)
        await click(
          page.getByRole("button", {
            name: "Haritayı uzaklaştır",
            exact: true,
          }),
        );
      await page.waitForFunction(() => {
        const d = document.querySelector('[data-testid="war-map-3d"]')?.dataset;
        return d && Number(d.aircraftModels) >= 2 && Number(d.shipModels) >= 2;
      });
      const before = await stats();
      assert.equal(Number(before.theaterConfirmedEvents), 0);
      assert.equal(Number(before.theaterEffects), 0);
      for (const [mode, text, button] of [
        ["air", "40 uçak", "Hava emirlerini aç"],
        ["naval", "1 gemi", "Deniz emirlerini aç"],
      ]) {
        await page
          .getByLabel("Harita görünümü", { exact: true })
          .selectOption(mode);
        assert.ok(
          (
            await page.getByTestId("map3d-theater-summary").innerText()
          ).includes(text),
        );
        await click(page.getByRole("button", { name: button, exact: true }));
        await page
          .getByRole("heading", { name: "Harekât merkezi", exact: true })
          .waitFor();
        await closePanel();
      }
      await page
        .getByLabel("Harita görünümü", { exact: true })
        .selectOption("political");
      assert.deepEqual(await save(), theater.world);
      passed(
        `${label}: active mission aircraft and warships render from saved forces without fabricated combat effects`,
      );

      assert.ok(JSON.parse(before.theaterPositions).length >= 4);
      // Allow multiple real rendered frames after resume on software WebGL;
      // the daily battle boundary remains the following separate hour.
      await advanceClockHours(page, 3, 1);
      await page.waitForFunction(
        (time) =>
          Number(
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .theaterAnimationTime,
          ) > time,
        Number(before.theaterAnimationTime),
      );
      const flying = await stats();
      const previousPositions = new Map(
        JSON.parse(before.theaterPositions).map((position) => [
          position.id,
          position,
        ]),
      );
      const flyingPositions = new Map(
        JSON.parse(flying.theaterPositions).map((position) => [
          position.id,
          position,
        ]),
      );
      for (const id of [theater.ids.fighter, theater.ids.ship]) {
        assert.ok(previousPositions.has(id) && flyingPositions.has(id));
        assert.notDeepEqual(flyingPositions.get(id), previousPositions.get(id));
      }
      const beforeBattle = await save();
      assert.equal(beforeBattle.hour, 23);
      assert.equal(Number(flying.theaterConfirmedEvents), 0);
      passed(
        `${label}: real active air and naval missions move their own models as the clock runs`,
      );

      await advanceClockHours(page, 1, 1);
      await page.waitForFunction(() => {
        const d = document.querySelector('[data-testid="war-map-3d"]')?.dataset;
        return (
          d &&
          Number(d.airCombats) > 0 &&
          Number(d.navalCombats) > 0 &&
          Number(d.bombingRuns) > 0 &&
          Number(d.theaterEffects) > 0
        );
      });
      const battleEffects = await stats();
      // Capture the rendered battle before opening a save panel: closing that
      // panel resizes WebGL and temporarily clears its drawing buffer.
      await page.screenshot({
        path: path.join(output, `${label}-air-naval-battle.png`),
      });
      const fought = await save("air-naval-battle");
      assert.equal(fought.day, 1);
      assert.equal(fought.hour, 0);
      for (const [country, key] of [
        ["turkey", "fighter"],
        ["bulgaria", "enemyFighter"],
      ]) {
        const oldWing = theater.world.countries[country].air.wings.find(
          (a) => a.id === theater.ids[key],
        );
        const nextWing = fought.countries[country].air.wings.find(
          (a) => a.id === theater.ids[key],
        );
        assert.ok(nextWing.count < oldWing.count);
      }
      for (const [country, key] of [
        ["turkey", "ship"],
        ["bulgaria", "enemyShip"],
      ]) {
        const oldShip = theater.world.countries[country].navy.ships.find(
          (s) => s.id === theater.ids[key],
        );
        const nextShip = fought.countries[country].navy.ships.find(
          (s) => s.id === theater.ids[key],
        );
        assert.ok(nextShip.health < oldShip.health);
      }
      assert.ok(
        fought.provinces["bulgaria-city-0"].damage >
          theater.world.provinces["bulgaria-city-0"].damage,
      );
      assert.ok(Number(battleEffects.theaterConfirmedEvents) >= 3);
      passed(
        `${label}: real aircraft losses, naval damage and strategic bombing produce their corresponding visible effects`,
      );

      const frozen = await stats();
      await page.waitForTimeout(900);
      const still = await stats();
      assert.ok(JSON.parse(frozen.theaterPositions).length >= 4);
      for (const field of [
        "theaterEffects",
        "theaterConfirmedEvents",
        "airCombats",
        "navalCombats",
        "bombingRuns",
        "theaterPositions",
        "theaterAnimationTime",
      ])
        assert.equal(
          still[field],
          frozen[field],
          `${field} must freeze while paused`,
        );
      assert.deepEqual(await save(), fought);
      await page
        .getByLabel("Animasyonlar", { exact: true })
        .selectOption("reduced");
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="war-map-3d"]')?.dataset
            .animations === "reduced",
      );
      const reduced = await stats();
      await advanceClockHours(page, 1);
      const reducedAdvanced = await stats();
      assert.equal(reducedAdvanced.theaterPositions, reduced.theaterPositions);
      assert.equal(
        reducedAdvanced.theaterAnimationTime,
        reduced.theaterAnimationTime,
      );
      assert.equal((await save()).hour, 1);
      passed(
        `${label}: pause freezes theater effects and reduced motion freezes models while the simulation can still advance`,
      );

      await load(fought);
      await page
        .getByLabel("Animasyonlar", { exact: true })
        .selectOption("full");
      await ready();
      assert.equal(Number((await stats()).theaterConfirmedEvents), 0);
      assert.equal(Number((await stats()).theaterEffects), 0);
      assert.deepEqual(await save(), fought);
      passed(
        `${label}: importing an already damaged campaign does not replay or invent new battles`,
      );
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, errors, output }));
  } catch (error) {
    const canvasState =
      activePage && !activePage.isClosed()
        ? await activePage
            .evaluate(() => {
              const canvas = document.querySelector(
                '[data-testid="war-map-3d"]',
              );
              return canvas ? { ...canvas.dataset } : null;
            })
            .catch(() => null)
        : null;
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { checks, errors, error: String(error), canvasState },
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
