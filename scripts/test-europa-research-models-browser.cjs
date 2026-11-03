/* Research-driven miniatures, passive idle poses and manual management.
   Imports use ordinary validated save files. Only public UI and the actual
   worker clock change campaigns; renderer diagnostics are read-only. */
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
const {
  applyAction,
  advanceHours,
} = require("../app/games/europa-war/strategy/engine.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const { worldHour } = require("../app/games/europa-war/strategy/time.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR ||
  "/workspace/scratch/europa-research-models-browser";
const requestedDevice = process.env.EUROPA_DEVICE;
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
function fixture({ queued = false, complete = false, battle = false } = {}) {
  let world = createWorld("turkey", "historical", 1936, "normal");
  world.hour = queued ? 23 : 10;
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
  if (queued) {
    for (const id of ["weapons1"]) {
      const result = applyAction(world, { type: "research", id });
      assert.equal(result.error, null);
      world = result.world;
    }
    for (const project of world.countries.turkey.research)
      project.progress = project.total - 0.01;
  }
  if (battle) {
    declareWar(world, "turkey", "bulgaria");
    addArmy(world, "bulgaria", target).organization = 100;
  }
  return { world: decodeSave(encodeSave(world)), origin, target, ids };
}
function simulatedUntil(before, after) {
  let expected = before;
  let remaining = worldHour(after) - worldHour(before);
  assert.ok(
    Number.isSafeInteger(remaining) && remaining >= 0 && remaining < 48,
  );
  while (remaining > 0) {
    const hours = Math.min(24, remaining);
    expected = advanceHours(expected, hours);
    remaining -= hours;
  }
  return expected;
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
  };
  try {
    for (const [label, viewport, mobile] of [
      ["desktop", { width: 1440, height: 1000 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ].filter(([name]) => !requestedDevice || requestedDevice === name)) {
      const desktopStart = !mobile
        ? process.env.EUROPA_DESKTOP_START
        : undefined;
      const resumed =
        !mobile &&
        (process.env.EUROPA_RESUME_DESKTOP === "1" || Boolean(desktopStart));
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
      const choose = async (name, value) => {
        const control = page.getByLabel(name, { exact: true });
        if ((await control.inputValue()) === value) return;
        const before = await stats();
        console.log(
          `STEP ${label}: ${name}→${value}, frame ${before.renderedFrames}`,
        );
        await control.selectOption(value);
        if (name === "Animasyonlar") {
          await page.waitForFunction(
            (value) =>
              document.querySelector('[data-testid="war-map-3d"]')?.dataset
                .animations === value,
            value,
          );
          if (before.animations === value) return;
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
        await page.screenshot({ path: file });
        console.log("SCREENSHOT " + file);
      };
      const modelView = async (id) => {
        await choose("Harita bakışı", "perspective");
        await focus(id, mobile ? 2 : 3);
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
      console.log(`STEP ${label}: campaign paused`);
      const original = fixture();
      await load(original);
      if (!resumed) {
        await tab("Komuta");
        await click(page.getByTestId("easy-mode"));
        await page.getByTestId("manual-management-hub").waitFor();
        for (const name of ["Kabartma", "Birlik durumu"]) {
          const size = await page
            .getByRole("button", { name, exact: true })
            .locator("svg")
            .evaluate((element) => ({
              width: getComputedStyle(element).width,
              height: getComputedStyle(element).height,
            }));
          assert.deepEqual(size, { width: "14px", height: "14px" });
        }
        const counter = await page
          .getByTestId("war-map")
          .locator("svg[data-military-icon]")
          .first()
          .evaluate((element) => {
            const own = element.getScreenCTM();
            const parent = element.parentElement.getScreenCTM();
            const rect = element.getBoundingClientRect();
            return {
              width: element.width.baseVal.value,
              height: element.height.baseVal.value,
              viewBox: element.viewBox.baseVal.width,
              ratio: Math.hypot(own.a, own.b) / Math.hypot(parent.a, parent.b),
              renderedWidth: rect.width,
              renderedHeight: rect.height,
              cssWidth: getComputedStyle(element).width,
              cssHeight: getComputedStyle(element).height,
            };
          });
        await shot("manual-management");
        samples.push({ label, view: "svg-counter-size", data: counter });
        assert.equal(counter.width, 16);
        assert.equal(counter.height, 16);
        assert.ok(Math.abs(counter.ratio - 16 / counter.viewBox) < 0.001);
        assert.ok(counter.renderedWidth > 0 && counter.renderedHeight > 0);
        assert.equal(await page.locator('button[title="Siyaset"]').count(), 0);
        assert.equal(await page.locator('button[title="Harekât"]').count(), 0);
        assert.equal(
          await page
            .locator("details")
            .filter({
              has: page.locator("summary", { hasText: "Yönetim yardımcısı" }),
            })
            .getAttribute("open"),
          null,
        );
        for (const [id, panel] of [
          ["manual-recruit", "ORDU"],
          ["manual-build", "BÖLGE"],
          ["manual-research", "ARAŞTIRMA"],
          ["manual-diplomacy", "DİPLOMASİ"],
        ]) {
          await click(page.getByTestId(id));
          assert.ok((await page.locator("aside").innerText()).includes(panel));
          await tab("Komuta");
          console.log(`STEP ${label}: ${id} opens ${panel}`);
        }
        await click(page.getByTestId("full-mode"));
        for (const title of ["Siyaset", "Harekât", "Araştırma", "Kayıtlar"])
          assert.equal(
            await page.locator(`button[title="${title}"]`).count(),
            1,
          );
        await tab("Harekât");
        await page
          .getByRole("heading", { name: "Harekât merkezi", exact: true })
          .waitFor();
        await tab("Komuta");
        await click(page.getByTestId("easy-mode"));
        assert.deepEqual(await save(), original.world);
        console.log(`STEP ${label}: manual view leaves campaign unchanged`);
        const savedPreference = fixture();
        savedPreference.world.countries.turkey.automation.economy = true;
        await load(savedPreference);
        await tab("Komuta");
        await click(page.getByTestId("full-mode"));
        await click(page.getByTestId("easy-mode"));
        assert.ok(
          (
            await page.getByTestId("manual-control-status").innerText()
          ).includes("1 yönetim yardımcısı açık"),
        );
        assert.deepEqual(await save(), savedPreference.world);
        pass(
          `${label}: manual shortcuts and advanced mode navigate real panels without spending, enabling automation or resetting saved assistant preferences`,
        );
      }
      const queued = fixture({ queued: true });
      let before = { cameraDistance: String(220 * 0.75 ** (mobile ? 2 : 3)) };
      if (!resumed) {
        await load(queued);
        console.log(`STEP ${label}: queued research fixture imported`);
        if (!(await canvas.count()))
          await click(
            page.getByRole("button", { name: "3D arazi", exact: true }),
          );
        await ready();
        await modelView(queued.origin);
        before = await stats();
        assertTier(before, baselineTiers);
        assert.ok(JSON.parse(before.nightCityLights).lights > 0);
        samples.push({ label, view: "queued-baseline", data: before });
        await shot("models-before-research");
        assert.deepEqual(await save(), queued.world);
      }
      const modern = fixture({ complete: true });
      if (desktopStart !== "idle" && desktopStart !== "combat") {
        await load(modern);
        if (!(await canvas.count()))
          await click(
            page.getByRole("button", { name: "3D arazi", exact: true }),
          );
        await ready();
        console.log(`STEP ${label}: completed research fixture imported`);
        await modelView(modern.origin);
        const after = await stats();
        assertTier(after, finalTiers);
        assert.ok(
          Math.abs(
            Number(after.cameraDistance) - Number(before.cameraDistance),
          ) <= 0.01,
        );
        assert.ok(Number(after.idleHeads) > 0);
        assert.equal(after.idleAnimating, "false");
        samples.push({ label, view: "completed-upgrades", data: after });
        await shot("models-after-research");
        if (!mobile) {
          await choose("Grafik kalitesi", "high");
          const high = await stats();
          assertTier(high, finalTiers);
          samples.push({ label, view: "completed-upgrades-high", data: high });
          await shot("upgraded-models-high");
          await choose("Grafik kalitesi", "low");
        }
        assert.deepEqual(await save(), modern.world);
        pass(
          `${label}: completed research visibly selects four upgraded model banks at the same camera without changing units or campaign state`,
        );
      }
      if (!resumed) {
        await load(queued);
        await modelView(queued.origin);
        await advanceClockHours(page, 1, 1);
        const completed = await save();
        assert.deepEqual(completed, advanceHours(queued.world, 1));
        assert.ok(completed.countries.turkey.tech.includes("weapons1"));
        assert.ok(!completed.countries.turkey.tech.includes("armor1"));
        assert.equal(completed.countries.turkey.research.length, 0);
        await page.waitForFunction(() => {
          const value = document.querySelector('[data-testid="war-map-3d"]')
            ?.dataset.unitVisualTiers;
          return (
            value &&
            JSON.parse(value).infantry[1] === 1 &&
            JSON.parse(value).tank[0] === 1 &&
            JSON.parse(value).artillery[1] === 1
          );
        });
        assertTier(await stats(), {
          infantry: 1,
          tank: 0,
          artillery: 1,
          truck: 0,
        });
        await tab("Araştırma");
        const armorResearch = page.locator(
          '[data-unit-research-guide] [data-model-kind="tank"] [data-visual-research-id="armor1"]',
        );
        assert.ok(await armorResearch.isEnabled());
        await click(armorResearch);
        await page.waitForFunction(
          () =>
            document.querySelector(
              '[data-model-kind="tank"] [data-visual-research-id="armor1"]',
            )?.disabled === true,
        );
        assert.equal(await armorResearch.innerText(), "Araştırılıyor");
        await shot("manual-research-guide");
        const manualResearch = await save();
        assert.deepEqual(
          manualResearch.countries.turkey.tech,
          completed.countries.turkey.tech,
        );
        assert.equal(manualResearch.countries.turkey.research.length, 1);
        assert.equal(manualResearch.countries.turkey.research[0].id, "armor1");
        assert.equal(manualResearch.countries.turkey.research[0].progress, 0);
        assert.deepEqual(manualResearch.armies, completed.armies);
        assert.deepEqual(
          manualResearch.countries.turkey.automation,
          completed.countries.turkey.automation,
        );
        assertTier(await stats(), {
          infantry: 1,
          tank: 0,
          artillery: 1,
          truck: 0,
        });
        pass(
          `${label}: only real research completion upgrades models; the manual next-tech button queues tank research without applying its future visual tier`,
        );
      }
      if (desktopStart !== "combat") {
        await load(modern);
        if (!(await canvas.count()))
          await click(
            page.getByRole("button", { name: "3D arazi", exact: true }),
          );
        await ready();
        await modelView(modern.origin);
        await choose("Animasyonlar", "full");
        const idleBefore = await save();
        const yawBefore = JSON.parse((await stats()).headYawSample);
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await page.waitForFunction((before) => {
          const data = document.querySelector(
            '[data-testid="war-map-3d"]',
          )?.dataset;
          if (data?.idleAnimating !== "true") return false;
          const current = JSON.parse(data.headYawSample);
          return current.some(
            (head) =>
              Math.abs(
                head.yaw - (before.find((old) => old.id === head.id)?.yaw ?? 0),
              ) > 0.02,
          );
        }, yawBefore);
        await pause();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="war-map-3d"]')?.dataset
              .idleAnimating === "false",
        );
        const still = await stats();
        await page.waitForTimeout(450);
        assert.equal((await stats()).headYawSample, still.headYawSample);
        await choose("Animasyonlar", "reduced");
        const reduced = (await stats()).headYawSample;
        await click(
          page.getByRole("button", { name: "Zamanı başlat", exact: true }),
        );
        await page.waitForTimeout(450);
        assert.equal((await stats()).headYawSample, reduced);
        await pause();
        const idleAfter = await save();
        assert.deepEqual(idleAfter, simulatedUntil(idleBefore, idleAfter));
        for (const id of modern.ids) {
          const unit = idleAfter.armies.find((army) => army.id === id);
          assert.equal(unit.province, modern.origin);
          assert.ok(
            unit.move == null,
            "Idle units must not have movement orders",
          );
          assert.deepEqual(unit.route, []);
        }
        samples.push({ label, view: "idle-frozen", data: still });
        pass(
          `${label}: idle soldiers look around without marching, pause/reduced motion freezes their heads and the campaign matches only real elapsed clock steps`,
        );
      }
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
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
          button: "right",
        });
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
