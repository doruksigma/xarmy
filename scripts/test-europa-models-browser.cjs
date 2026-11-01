/* Focused production-browser regression for actual 3D soldiers, scenery and
   supply-rail trains. Browser observations use rendered diagnostics and UI
   saves; fixture generation is outside the browser. No engine hooks.
   Optional EUROPA_BASE_URL, EUROPA_CHROMIUM, EUROPA_ARTIFACT_DIR. */
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
  dateLabel,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-models";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
mkdirSync(output, { recursive: true });
function fixture() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  world.armies = [];
  for (const c of Object.values(world.countries)) {
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
  declareWar(world, "turkey", "bulgaria");
  for (const p of Object.values(world.provinces)) {
    p.buildings.rail = 0;
    p.damage = 0;
  }
  const capital = world.countries.turkey.capital;
  const railNeighbor = "turkey-city-16";
  assert.ok(
    GEOGRAPHY[capital].neighbors.some((e) => e.id === railNeighbor && !e.sea),
  );
  world.provinces[capital].buildings.rail = 2;
  world.provinces[railNeighbor].buildings.rail = 2;
  const origin = "turkey-city-0",
    target = "bulgaria-city-0";
  const group = Array.from({ length: 3 }, () =>
    addArmy(world, "turkey", origin),
  );
  addArmy(world, "turkey", capital, "lightTank");
  addArmy(world, "turkey", capital, "infantry");
  for (const a of world.armies) a.organization = 100;
  return {
    world: decodeSave(encodeSave(world)),
    capital,
    railNeighbor,
    origin,
    target,
    ids: group.map((a) => a.id),
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
    pageErrors = [],
    consoleErrors = [],
    failedRequests = [],
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
          consoleErrors.push({
            label,
            message: e.text(),
            location: e.location(),
          });
      });
      page.on("requestfailed", (r) =>
        failedRequests.push({
          label,
          url: r.url(),
          error: r.failure()?.errorText,
        }),
      );
      const click = (l) => (mobile ? l.tap() : l.click());
      const canvas = page.getByTestId("war-map-3d");
      const ready = () =>
        page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .ready === "true",
        );
      const stats = () =>
        canvas.evaluate((el) => ({
          ...el.dataset,
          trainPositions: JSON.parse(el.dataset.trainPositions || "[]"),
          trainCountries: JSON.parse(el.dataset.trainCountries || "[]"),
          railProvinces: JSON.parse(el.dataset.railProvinces || "[]"),
          cityHouseCounts: JSON.parse(el.dataset.cityHouseCounts || "{}"),
          emptyCityProvinces: JSON.parse(el.dataset.emptyCityProvinces || "[]"),
        }));
      const assertModels = (sample, count) => {
        assert.equal(Number(sample.infantryModels), 1);
        assert.equal(Number(sample.tankModels), count >= 2 ? 1 : 0);
        assert.equal(Number(sample.artilleryModels), count >= 3 ? 1 : 0);
        assert.equal(Number(sample.truckModels), count >= 4 ? 1 : 0);
        assert.equal(Number(sample.vehicleModels), Math.min(3, count - 1));
      };
      const pause = async () => {
        const b = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await b.count()) await click(b);
      };
      const close = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
        ]) {
          const b = page.getByRole("button", { name, exact: true });
          if (await b.count()) await click(b);
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
        const w = await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1"))
              .world,
        );
        decodeSave(
          JSON.stringify({ format: "xarmy-europa-1936", version: 2, world: w }),
        );
        if (name)
          writeFileSync(
            path.join(output, label + "-" + name + ".json"),
            JSON.stringify(w),
          );
        await close();
        return w;
      };
      const load = async (f) => {
        await pause();
        await close();
        await click(page.locator('button[title="Kayıtlar"]'));
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "model-fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(f.world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await close();
        await ready();
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
        if (zoom >= 4)
          await page.waitForFunction(
            () =>
              Number(
                document.querySelector('[data-testid="war-map-3d"]').dataset
                  .cameraDistance,
              ) < 85,
          );
        await ready();
      };
      const screenshot = async (name) =>
        page.screenshot({
          path: path.join(output, label + "-" + name + ".png"),
        });
      const setMotion = async (reduced) => {
        await page.emulateMedia({
          reducedMotion: reduced ? "reduce" : "no-preference",
        });
        await click(
          page.getByRole("button", { name: "2D siyasi harita", exact: true }),
        );
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await ready();
      };
      const orderGroup = async (scenario, count) => {
        await focus(scenario.target);
        await click(
          page
            .locator('[data-formation^="turkey:' + scenario.origin + ':"]')
            .first(),
        );
        if (mobile) {
          await click(
            page.getByRole("button", {
              name: `Haritada hedef seç · ${count} tümen`,
              exact: true,
            }),
          );
        }
        await close();
        const box = await canvas.boundingBox();
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (mobile) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y, { button: "right" });
      };
      await page.goto(base + "/games/europa-war", {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /SEFERİ BAŞLAT/ }));
      await close();
      await ready();
      const f = fixture();
      const capitalFixture = structuredClone(f);
      capitalFixture.world.armies = capitalFixture.world.armies.filter(
        (a) => a.province === f.capital,
      );
      const borderFixture = structuredClone(f);
      borderFixture.world.armies = borderFixture.world.armies.filter(
        (a) => a.province === f.origin,
      );
      writeFileSync(
        path.join(output, label + "-fixture-metadata.json"),
        JSON.stringify(
          { capital: f.capital, railNeighbor: f.railNeighbor, group: f.ids },
          null,
          2,
        ),
      );
      await load(capitalFixture);
      await focus(f.capital, 4);
      await screenshot("ankara-close");
      const near = await stats();
      assert.equal(
        Number(near.railEdges),
        1,
        "Only the two equipped adjacent capital provinces form a supply rail edge",
      );
      assert.equal(
        Number(near.trainCount),
        1,
        "Exactly one actual locomotive is rendered for the isolated supply route",
      );
      assert.equal(near.trainPositions.length, 1);
      assert.ok(
        Number(near.unitInstances) >= 2,
        "Near capital must render both infantry and tank instances",
      );
      assertModels(near, 2);
      assert.equal(near.modelDetail, "true");
      assert.ok(near.cityHouseCounts[f.capital] > 0);
      assert.deepEqual(near.emptyCityProvinces, []);
      samples.push({ label, view: "capital-close", ...near });
      await load(borderFixture);
      await focus(f.origin, 4);
      await screenshot("infantry-close");
      assertModels(await stats(), 3);
      passed(
        label +
          ": close-up infantry, tank, detailed scenery and one real supply train render in WebGL",
      );
      for (const count of mobile ? [4, 12] : [1, 2, 3, 4, 12]) {
        const grouped = structuredClone(f);
        grouped.world.armies = [];
        for (let i = 0; i < count; i++)
          addArmy(grouped.world, "turkey", f.capital);
        grouped.world = decodeSave(encodeSave(grouped.world));
        await load(grouped);
        await focus(f.capital, 4);
        const shown = await stats();
        assertModels(shown, count);
        assert.equal(Number(shown.muzzleFlashes), 0);
        assert.equal(Number(shown.combatFormations), 0);
        assert.equal(Number(shown.shells), 0);
        assert.equal(Number(shown.impacts), 0);
        assert.equal(
          Number(shown.captures),
          0,
          "Importing a campaign must not create a capture effect",
        );
        samples.push({ label, view: `group-${count}`, ...shown });
        await screenshot(`group-${count}`);
        assert.equal(
          (await save(`group-${count}`)).armies.length,
          count,
          "Representative miniatures must not delete divisions",
        );
      }
      passed(
        label +
          ": group-size silhouettes are exact while all real divisions remain in the campaign",
      );
      const beforeQuality = await save("before-quality");
      for (const value of ["low", "medium", "high", "ultra", "low"]) {
        await page
          .getByRole("combobox", { name: "Grafik kalitesi", exact: true })
          .selectOption(value);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const sample = await stats();
        assertModels(sample, 12);
        assert.ok(
          Number(sample.drawCalls) > 0 && Number(sample.drawCalls) < 180,
          "Instanced model/rail draw calls must remain bounded",
        );
        assert.ok(
          Number(sample.triangles) < 800000,
          "Procedural detail remains within the intended scene budget",
        );
        samples.push({ label, view: "quality-" + value, ...sample });
      }
      assert.deepEqual(
        await save("after-quality"),
        beforeQuality,
        "Changing model detail cannot mutate the simulation",
      );
      passed(
        label +
          ": all quality levels preserve group symbols and the world with bounded rendering",
      );
      if (!mobile) {
        await load(capitalFixture);
        // Recreate via public view controls so matchMedia is read as normal motion.
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await click(
          page.getByRole("button", { name: "2D siyasi harita", exact: true }),
        );
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await ready();
        await focus(f.capital, 4);
        const pausedWorld = await save("ambient-paused-before");
        const pausedDate = await page.getByTestId("game-date").textContent();
        await page.waitForTimeout(350);
        const ambientStart = await stats();
        const waitForTrainMovement = (positions) =>
          page.waitForFunction((before) => {
            const d = document.querySelector(
              '[data-testid="war-map-3d"]',
            )?.dataset;
            return (
              d &&
              JSON.stringify(JSON.parse(d.trainPositions || "[]")) !== before
            );
          }, JSON.stringify(positions));
        await waitForTrainMovement(ambientStart.trainPositions);
        const ambientMiddle = await stats();
        await page.waitForTimeout(1100);
        const ambientEnd = await stats();
        assert.notDeepEqual(
          ambientEnd.trainPositions,
          ambientMiddle.trainPositions,
          "Low-quality paused trains must keep moving without new UI interactions",
        );
        assert.ok(
          Number(ambientEnd.renderedFrames) >
            Number(ambientStart.renderedFrames) + 1,
        );
        assert.doesNotMatch(
          await page
            .getByRole("button", { name: "3D görüntü ölçümleri", exact: true })
            .textContent(),
          /Durağan/,
        );
        assert.equal(
          await page.getByTestId("game-date").textContent(),
          pausedDate,
        );
        assert.deepEqual(
          await save("ambient-paused-after"),
          pausedWorld,
          "Ambient trains must not change any campaign state while paused",
        );
        await screenshot("ambient-train-paused");
        samples.push({
          label,
          view: "ambient-paused-low",
          before: ambientStart,
          after: ambientEnd,
        });
        passed(
          "desktop: Low-quality trains move continuously while paused without advancing or mutating the campaign",
        );

        const trainStart = (await stats()).trainPositions;
        const oldDay = await page.getByTestId("game-date").textContent();
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await waitForTrainMovement(trainStart);
        await page.waitForFunction(
          (old) =>
            document.querySelector('[data-testid="game-date"]')?.textContent !==
            old,
          oldDay,
        );
        await pause();
        const advanced = await save("train-running");
        assert.ok(advanced.day > pausedWorld.day);
        passed(
          "desktop: trains also move while the actual simulation clock advances",
        );

        // Reduced-motion remains the explicit accessibility exception. Recreate
        // through public view controls so constructor-time media settings apply.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await click(
          page.getByRole("button", { name: "2D siyasi harita", exact: true }),
        );
        await click(
          page.getByRole("button", { name: "3D arazi", exact: true }),
        );
        await ready();
        await focus(f.capital, 4);
        await page.waitForTimeout(350);
        const stopped = await stats();
        await page.waitForTimeout(1200);
        const stillStopped = await stats();
        assert.deepEqual(stillStopped.trainPositions, stopped.trainPositions);
        assert.equal(
          stillStopped.renderedFrames,
          stopped.renderedFrames,
          "Reduced-motion paused scene should stop drawing after it settles",
        );
        passed(
          "desktop: reduced-motion freezes train positions and settles to on-demand rendering",
        );

        // Keep the train isolated from army miniatures for a readable asset
        // review; units are preserved and exercised in the other fixtures.
        const trainOnly = structuredClone(capitalFixture);
        trainOnly.world.armies = [];
        await load(trainOnly);
        await focus(f.capital, 4);
        await screenshot("train-close");
        samples.push({
          label,
          view: "isolated-train-close",
          ...(await stats()),
        });

        const wholeCountry = structuredClone(f);
        for (const province of Object.values(wholeCountry.world.provinces))
          province.buildings.rail = province.controller === "turkey" ? 2 : 0;
        await load(wholeCountry);
        await click(
          page.getByRole("button", { name: "Başkentime git", exact: true }),
        );
        await page.waitForFunction(
          () =>
            Number(
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .cameraDistance,
            ) > 300,
        );
        const network = await stats();
        assert.ok(Number(network.railEdges) > 1);
        assert.ok(Number(network.trainCount) > 0);
        await screenshot("country-rail-network");
        samples.push({ label, view: "country-rail-network", ...network });
        passed(
          "desktop: the actual capital-connected country rail network renders multiple links and trains",
        );

        // A disconnected captured pocket and allied foreign rail must not
        // appear. Only exact player control plus a capital connection qualifies.
        const corridor = structuredClone(capitalFixture);
        const bridge = f.railNeighbor,
          pocket = "turkey-city-17";
        for (const province of Object.values(corridor.world.provinces))
          province.buildings.rail = 0;
        for (const id of [f.capital, bridge, pocket])
          corridor.world.provinces[id].buildings.rail = 2;
        for (const id of [bridge, pocket])
          corridor.world.provinces[id].owner = "bulgaria";
        corridor.world.provinces[bridge].controller = "bulgaria";
        corridor.world.provinces[pocket].controller = "turkey";
        corridor.world.countries.turkey.allies.push("uk");
        corridor.world.countries.uk.allies.push("turkey");
        const foreignCapital = corridor.world.countries.uk.capital;
        corridor.world.provinces[foreignCapital].buildings.rail = 2;
        corridor.world = decodeSave(encodeSave(corridor.world));
        await load(corridor);
        await focus(f.capital);
        const disconnected = await stats();
        assert.ok(!disconnected.railProvinces.includes(bridge));
        assert.ok(!disconnected.railProvinces.includes(pocket));
        assert.ok(!disconnected.railProvinces.includes(foreignCapital));
        assert.ok(disconnected.trainCountries.every((id) => id === "turkey"));
        await screenshot("disconnected-captured-pocket");
        await focus(foreignCapital, 4);
        const alliedView = await stats();
        assert.equal(Number(alliedView.trainCount), 0);
        assert.ok(!alliedView.railProvinces.includes(foreignCapital));
        await screenshot("allied-foreign-rails-hidden");
        await focus("luxembourg-0", 4);
        const tinyCity = await stats();
        assert.ok(tinyCity.cityHouseCounts["luxembourg-0"] > 0);
        assert.deepEqual(tinyCity.emptyCityProvinces, []);
        await screenshot("luxembourg-small-city");
        passed(
          "desktop: allied foreign rail and a disconnected captured pocket remain hidden",
        );

        corridor.world.provinces[bridge].controller = "turkey";
        await load(corridor);
        await focus(bridge, 1);
        const connected = await stats();
        for (const id of [f.capital, bridge, pocket])
          assert.ok(
            connected.railProvinces.includes(id),
            `Connected captured province ${id} must render`,
          );
        assert.ok(Number(connected.trainCount) > 0);
        assert.ok(connected.trainCountries.every((id) => id === "turkey"));
        assert.equal(
          Number(connected.captures),
          0,
          "Loading a changed fixture cannot pretend a conquest happened",
        );
        const beforePan = await save("connected-capture-before-pan");
        await screenshot("connected-captured-rail-corridor");
        await focus(f.capital, 4);
        assertModels(await stats(), 2);
        assert.deepEqual(await save("connected-capture-after-pan"), beforePan);
        passed(
          "desktop: a player-controlled corridor adds captured foreign rail without changing the world during camera movement",
        );

        corridor.world.provinces[bridge].controller = "bulgaria";
        await load(corridor);
        await focus(pocket, 1);
        const lost = await stats();
        assert.ok(!lost.railProvinces.includes(bridge));
        assert.ok(!lost.railProvinces.includes(pocket));
        assert.ok(lost.trainCountries.every((id) => id === "turkey"));
        await screenshot("lost-corridor-removes-captured-rails");
        samples.push({
          label,
          view: "player-only-network",
          disconnected,
          alliedView,
          connected,
          lost,
        });
        passed(
          "desktop: losing the connecting corridor removes captured pocket railway visuals",
        );
        const cut = structuredClone(capitalFixture);
        cut.world.provinces[f.capital].buildings.rail = 0;
        cut.world.provinces[f.railNeighbor].buildings.rail = 0;
        await load(cut);
        await focus(f.capital, 4);
        let state = await stats();
        assert.equal(Number(state.railEdges), 0);
        assert.equal(Number(state.trainCount), 0);
        assert.deepEqual(state.trainPositions, []);
        await screenshot("rail-cut");
        const occupied = structuredClone(capitalFixture);
        occupied.world.provinces[f.capital].controller = "bulgaria";
        await load(occupied);
        await focus(f.capital, 4);
        state = await stats();
        assert.equal(Number(state.railEdges), 0);
        assert.equal(Number(state.trainCount), 0);
        passed(
          "desktop: removing rail facilities or enemy capital occupation removes the unsupported train network",
        );

        // These are starting conditions only. The browser issues the order and
        // the real worker must resolve casualties, conquest and capture effects.
        const combat = structuredClone(f);
        combat.world.armies = [];
        combat.world.day = 1; // Avoid Bulgaria's scheduled first-day AI attack.
        combat.ids = ["infantry", "lightTank", "artillery", "motorized"].map(
          (type) => {
            const army = addArmy(combat.world, "turkey", f.origin, type);
            army.organization = 100;
            return army.id;
          },
        );
        const defender = addArmy(combat.world, "bulgaria", f.target);
        defender.organization = 100;
        for (const province of Object.values(combat.world.provinces)) {
          province.buildings.infra = 10;
          province.buildings.hub = 5;
          province.damage = 0;
        }
        combat.world.countries.turkey.stock.fuel = 1000;
        combat.world = decodeSave(encodeSave(combat.world));
        await load(combat);
        await setMotion(false);
        await orderGroup(combat, 4);
        await focus(f.target, 1);
        assert.equal(Number((await stats()).captures), 0);
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        const shellFrame = await page.waitForFunction(() => {
          const d = document.querySelector(
            '[data-testid="war-map-3d"]',
          )?.dataset;
          return d && Number(d.shells) > 0 ? { ...d } : false;
        });
        const firing = await shellFrame.jsonValue();
        await shellFrame.dispose();
        await pause();
        await screenshot("actual-battle-artillery-shell");
        const battleWorld = await save("actual-battle");
        assert.ok(battleWorld.battles.some((b) => b.province === f.target));
        assert.ok(
          battleWorld.countries.turkey.casualties >
            combat.world.countries.turkey.casualties,
        );
        assert.ok(
          battleWorld.countries.bulgaria.casualties >
            combat.world.countries.bulgaria.casualties,
        );
        assert.ok(
          combat.ids.every(
            (id) => battleWorld.armies.find((a) => a.id === id)?.strength < 100,
          ),
        );
        assert.ok(Number(firing.artilleryModels) >= 1);
        assert.ok(Number(firing.combatFormations) >= 1);
        assert.ok(Number(firing.shells) > 0);
        samples.push({
          label,
          view: "actual-battle-artillery-shell",
          ...firing,
        });
        passed(
          "desktop: a real group battle causes casualties and visibly fires an artillery shell",
        );

        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        const captureFrame = await page.waitForFunction(() => {
          const d = document.querySelector(
            '[data-testid="war-map-3d"]',
          )?.dataset;
          return d && Number(d.captures) > 0 ? { ...d } : false;
        });
        const celebration = await captureFrame.jsonValue();
        await captureFrame.dispose();
        await pause();
        await screenshot("actual-city-capture-animation");
        const capturedWorld = await save("actual-combat-capture");
        assert.equal(capturedWorld.provinces[f.target].controller, "turkey");
        assert.ok(
          combat.ids.every(
            (id) =>
              capturedWorld.armies.find((a) => a.id === id)?.province ===
              f.target,
          ),
        );
        assert.ok(Number(celebration.captures) > 0);
        samples.push({
          label,
          view: "actual-city-capture-animation",
          ...celebration,
        });
        passed(
          "desktop: actual conquest moves every attacker into the city and produces a capture animation",
        );
        await setMotion(true);
      }
      await load(f);
      await orderGroup(f, 3);
      let moved = await save("ordered");
      for (const id of f.ids) {
        const a = moved.armies.find((a) => a.id === id);
        assert.ok(
          a.route.includes(f.target) || a.move?.to === f.target,
          "All selected divisions keep their tactical order with the new models",
        );
      }
      for (
        let i = 0;
        i < 12 &&
        !f.ids.every(
          (id) => moved.armies.find((a) => a.id === id)?.province === f.target,
        );
        i++
      ) {
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await page.waitForFunction(
          (old) =>
            document.querySelector('[data-testid="game-date"]')?.textContent !==
            old,
          dateLabel(moved.day),
        );
        await pause();
        moved = await save();
      }
      assert.equal(moved.provinces[f.target].controller, "turkey");
      assert.ok(
        f.ids.every(
          (id) => moved.armies.find((a) => a.id === id)?.province === f.target,
        ),
      );
      await focus(f.target, 4);
      assertModels(await stats(), 3);
      await screenshot("group-captured");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      passed(
        label +
          ": all three divisions still move together, capture the target and fit the responsive layout",
      );
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          result: "passed",
          checks,
          pageErrors,
          consoleErrors,
          failedRequests,
          samples,
          rendererNote:
            "Actual headless Chromium WebGL via SwiftShader; mobile is touch emulation, not a physical-device benchmark.",
          hiddenTabValidation:
            "Not verified: native headless tabs remain document.visibilityState=visible. No synthetic visibility overrides are used.",
        },
        null,
        2,
      ),
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
