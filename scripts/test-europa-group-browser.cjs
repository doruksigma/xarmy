/* Run against a production server with Playwright on NODE_PATH.
   EUROPA_BASE_URL, EUROPA_CHROMIUM and EUROPA_ARTIFACT_DIR are optional. */
const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
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
};
const {
  createWorld,
  addArmy,
  GEOGRAPHY,
  MAP,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-groups";
mkdirSync(output, { recursive: true });

function peacefulFixture() {
  const world = createWorld("turkey", "historical", 1936, "normal");
  const origin = world.countries.turkey.capital;
  const destination = GEOGRAPHY[origin].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === "turkey",
  ).id;
  world.armies = world.armies.filter((army) => army.country !== world.player);
  const group = Array.from({ length: 3 }, () =>
    addArmy(world, "turkey", origin),
  );
  const other = addArmy(world, "turkey", destination);
  return {
    world: decodeSave(encodeSave(world)),
    origin,
    destination,
    group,
    other,
  };
}

function battleFixture() {
  const world = createWorld("germany", "historical", 1936, "normal");
  declareWar(world, "germany", "poland");
  const origin = MAP.provinces.find(
    (p) =>
      p.country === "germany" &&
      p.neighbors.some(
        (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
      ),
  ).id;
  const destination = GEOGRAPHY[origin].neighbors.find(
    (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
  ).id;
  world.armies = [];
  const group = Array.from({ length: 3 }, () =>
    addArmy(world, "germany", origin),
  );
  const defenders = Array.from({ length: 3 }, () =>
    addArmy(world, "poland", destination),
  );
  for (const army of world.armies) army.organization = 100;
  return {
    world: decodeSave(encodeSave(world)),
    origin,
    destination,
    group,
    defenders,
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [],
    consoleErrors = [],
    checks = [];
  let page;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error")
        consoleErrors.push({ text: entry.text(), url: entry.location().url });
    });

    const tab = (name) => page.locator(`button[title="${name}"]`).click();
    const selection = () => page.getByTestId("army-selection-count");
    const groupCard = () => selection().locator("..");
    const stack = (group) =>
      page.locator(`[data-army-stack="${group.map((a) => a.id).join(",")}"]`);
    const expectSelected = async (count) => {
      await page.waitForFunction(
        (n) =>
          document.querySelector('[data-testid="army-selection-count"]')
            ?.textContent === `${n} tümen seçili`,
        count,
      );
    };
    const saveWorld = async () => {
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
    const loadWorld = async (world, name) => {
      await tab("Kayıtlar");
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: `${name}.json`,
        mimeType: "application/json",
        buffer: Buffer.from(encodeSave(world)),
      });
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
    };
    const focusProvince = async (id) => {
      await page
        .getByRole("textbox", { name: "Şehir bul", exact: true })
        .fill(GEOGRAPHY[id].name);
      await page
        .getByRole("list", { name: "Şehir arama sonuçları" })
        .getByRole("button")
        .filter({
          hasText: GEOGRAPHY[id].name,
        })
        .first()
        .click();
    };
    const clickProvince = async (id, modifiers = []) => {
      const point = await page
        .locator(`[data-province="${id}"]`)
        .evaluate((el, region) => {
          const matrix = el.getScreenCTM(),
            bounds = el.getBBox();
          const candidates = [{ x: region.x, y: region.y }];
          for (let row = 1; row < 30; row++) {
            for (let col = 1; col < 30; col++) {
              candidates.push({
                x: bounds.x + (bounds.width * col) / 30,
                y: bounds.y + (bounds.height * row) / 30,
              });
            }
          }
          for (const candidate of candidates) {
            if (!el.isPointInFill(new DOMPoint(candidate.x, candidate.y)))
              continue;
            const screen = new DOMPoint(
              candidate.x,
              candidate.y,
            ).matrixTransform(matrix);
            const hit = document.elementFromPoint(screen.x, screen.y);
            if (hit?.closest("[data-province]")?.dataset.province === region.id)
              return { x: screen.x, y: screen.y };
          }
          return null;
        }, GEOGRAPHY[id]);
      assert.ok(point, `No exposed province polygon for ${id}`);
      for (const modifier of modifiers) await page.keyboard.down(modifier);
      try {
        await page.mouse.click(point.x, point.y);
      } finally {
        for (const modifier of modifiers) await page.keyboard.up(modifier);
      }
    };
    const orderMove = async (destination, count) => {
      await groupCard()
        .getByRole("button", {
          name: `Haritada hedef seç · ${count} tümen`,
          exact: true,
        })
        .click();
      await clickProvince(destination);
      await page
        .getByRole("button", { name: "Emri iptal et", exact: true })
        .waitFor({ state: "detached" });
    };
    const verifyRoutes = (world, ids, destination) => {
      for (const id of ids) {
        const army = world.armies.find((a) => a.id === id);
        assert.ok(army, `${id} must still exist`);
        assert.equal(
          army.route.at(-1),
          destination,
          `${id} must receive the group destination`,
        );
        assert.equal(army.stance, "advance");
      }
    };
    const verifyHalted = (world, ids) => {
      for (const id of ids) {
        const army = world.armies.find((a) => a.id === id);
        assert.deepEqual(army.route, [], `${id} route must be cleared`);
        assert.equal(army.move, null);
        assert.equal(army.stance, "hold");
      }
    };

    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    const peaceful = peacefulFixture(),
      ids = peaceful.group.map((a) => a.id);
    await loadWorld(peaceful.world, "group-movement");

    const capitals = new Set(
      Object.values(peaceful.world.countries).map((c) => c.capital),
    );
    const verifyLabels = async (selected = peaceful.origin) => {
      const labels = await page
        .locator("[data-city-label]")
        .evaluateAll((nodes) =>
          nodes.map((el) => el.getAttribute("data-city-label")),
        );
      assert.ok(labels.length, "At least one city label should be visible");
      assert.deepEqual(
        labels.filter((id) => !capitals.has(id) && id !== selected),
        [],
        "Unselected non-capital names must stay hidden",
      );
    };
    const modes = [
      "political",
      "military",
      "terrain",
      "supply",
      "air",
      "naval",
    ];
    for (const scale of ["whole", "country", "close"]) {
      if (scale === "whole")
        await page
          .getByRole("button", { name: "Tüm haritayı göster", exact: true })
          .click();
      else
        await page
          .getByRole("button", { name: "Başkentime git", exact: true })
          .click();
      if (scale === "close") {
        for (let zoom = 0; zoom < 3; zoom++)
          await page
            .getByRole("button", { name: "Haritayı yakınlaştır", exact: true })
            .click();
      }
      if (scale === "whole") {
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll("[data-province]").length === count,
          MAP.provinces.length,
        );
      }
      for (const mode of modes) {
        await page
          .getByLabel("Harita görünümü", { exact: true })
          .selectOption(mode);
        await verifyLabels();
      }
    }
    await page
      .getByLabel("Harita görünümü", { exact: true })
      .selectOption("political");
    const cities = ["Eskişehir", "İzmir"].map((name) =>
      MAP.provinces.find((p) => p.name === name),
    );
    for (const city of cities) {
      await focusProvince(city.id);
      await page.locator(`[data-city-label="${city.id}"]`).waitFor();
      await verifyLabels(city.id);
    }
    assert.equal(
      await page.locator(`[data-city-label="${cities[0].id}"]`).count(),
      0,
    );
    await page.screenshot({ path: path.join(output, "selected-city.png") });
    checks.push(
      "capital-only labels across all six modes and three zoom levels; selection replaces non-capital name",
    );

    await focusProvince(peaceful.origin);
    await stack(peaceful.group).click();
    await expectSelected(3);
    assert.equal(
      await stack(peaceful.group).getAttribute("aria-pressed"),
      "true",
    );
    await stack([peaceful.other]).click({ modifiers: ["Shift"] });
    await expectSelected(4);
    await stack(peaceful.group).click();
    await expectSelected(3);
    await orderMove(peaceful.destination, 3);
    await page
      .getByRole("status")
      .filter({ hasText: "3 tümen için hareket emri hazır." })
      .waitFor();
    assert.match(
      await page.getByRole("status").textContent(),
      /Zaman duraklatıldı/,
    );
    let saved = await saveWorld();
    verifyRoutes(saved, ids, peaceful.destination);
    verifyHalted(saved, [peaceful.other.id]);
    await tab("Ordu");
    await groupCard()
      .getByRole("button", { name: "Dur / savun · 3 tümen", exact: true })
      .click();
    saved = await saveWorld();
    verifyHalted(saved, ids);
    checks.push(
      "stack selects all three; Shift adds another stack; group move and halt update every selected unit only",
    );

    await tab("Ordu");
    await page
      .getByRole("checkbox", {
        name: `${peaceful.group[2].name} seçime dahil`,
        exact: true,
      })
      .uncheck();
    await expectSelected(2);
    await orderMove(peaceful.destination, 2);
    saved = await saveWorld();
    verifyRoutes(saved, ids.slice(0, 2), peaceful.destination);
    verifyHalted(saved, [ids[2], peaceful.other.id]);
    await tab("Ordu");
    await page
      .getByRole("button", {
        name: new RegExp(
          `^.*${peaceful.group[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ),
      })
      .filter({ has: page.locator("small") })
      .first()
      .click();
    await expectSelected(1);
    await page.screenshot({ path: path.join(output, "group-panel.png") });
    checks.push(
      "checkbox subset limits group command; individual row restores single-unit selection",
    );

    await loadWorld(peaceful.world, "selection-reset");
    await tab("Ordu");
    await expectSelected(0);
    assert.equal(
      await page.locator('[data-army-stack][aria-pressed="true"]').count(),
      0,
    );
    await focusProvince(peaceful.origin);
    await stack(peaceful.group).click();
    await expectSelected(3);
    await page.locator('button[title="Yeni sefer"]').click();
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await tab("Ordu");
    await expectSelected(0);
    checks.push("load and new campaign clear stale group selection");

    const battle = battleFixture(),
      attackers = battle.group.map((a) => a.id);
    await loadWorld(battle.world, "group-battle");
    await focusProvince(battle.origin);
    await stack(battle.group).click();
    await expectSelected(3);
    await orderMove(battle.destination, 3);
    saved = await saveWorld();
    verifyRoutes(saved, attackers, battle.destination);
    await tab("Ordu");
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.getByTestId("battle-report").first().waitFor();
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    saved = await saveWorld();
    assert.ok(saved.day > 0, "Real game clock must advance the battle");
    for (const army of [...battle.group, ...battle.defenders]) {
      assert.ok(
        saved.armies.find((a) => a.id === army.id)?.strength < army.strength,
        `${army.id} must take combat losses`,
      );
    }
    assert.ok(
      saved.countries.germany.casualties > 0 &&
        saved.countries.poland.casualties > 0,
    );
    await tab("Ordu");
    await page.screenshot({ path: path.join(output, "group-battle.png") });
    checks.push(
      "all three attackers and defenders take real combat losses after advancing the UI clock",
    );

    await loadWorld(peaceful.world, "mobile-group");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Yönetim panelini kapat", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await stack(peaceful.group).tap();
    await expectSelected(3);
    await page.screenshot({ path: path.join(output, "mobile-group.png") });
    await page
      .getByRole("checkbox", {
        name: `${peaceful.group[2].name} seçime dahil`,
        exact: true,
      })
      .uncheck();
    await expectSelected(2);
    await orderMove(peaceful.destination, 2);
    saved = await saveWorld();
    verifyRoutes(saved, ids.slice(0, 2), peaceful.destination);
    verifyHalted(saved, [ids[2], peaceful.other.id]);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    checks.push(
      "mobile stack tap and checkbox subset issue group movement without horizontal overflow",
    );

    assert.deepEqual(errors, [], "No uncaught browser exceptions");
    const report = {
      result: "passed",
      checks,
      pageErrors: errors,
      consoleErrors,
      screenshots: output,
    };
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    await context.close();
  } catch (error) {
    writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { error: error.stack, checks, pageErrors: errors, consoleErrors },
        null,
        2,
      ),
    );
    if (page && !page.isClosed())
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
