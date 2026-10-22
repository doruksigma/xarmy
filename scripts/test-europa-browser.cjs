/* Integration checks against a running production server (npm run build && npm start).
   Requires Playwright in Node's module path and an installed Chromium executable. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const map = require("../app/games/europa-war/strategy/map-data.json");
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-browser";
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  let page;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    const errors = [],
      requests = [];
    const saveWorld = async () => {
      await page.locator('button[title="Kayıtlar"]').click();
      await page
        .getByRole("button", { name: "Bu yuvaya kaydet" })
        .first()
        .click();
      return page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("xarmy-europa-1936-v1:slot-1")).world,
      );
    };
    const escapeRegExp = (value) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    await page.screenshot({ path: path.join(output, "scenario.png") });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await page
      .getByText("Çevrimdışı kullanıma hazır · bu cihaz", { exact: true })
      .waitFor({ timeout: 45000 });
    assert.equal(
      await page.locator('[data-testid="game-date"]').textContent(),
      "1 Ocak 1936",
    );
    await page
      .getByRole("heading", { name: "Komuta merkezi", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("switch").count(), 4);
    assert.equal(
      await page.getByLabel("Oyun zorluğu", { exact: true }).inputValue(),
      "easy",
    );
    await page
      .getByLabel("Oyun zorluğu", { exact: true })
      .selectOption("normal");
    const initial = await saveWorld();
    assert.equal(initial.difficulty, "normal");
    await page.locator('button[title="Komuta"]').click();
    await page.getByLabel("Oyun zorluğu", { exact: true }).selectOption("easy");
    assert.ok(
      Object.values(initial.countries.turkey.automation).every((v) => !v),
    );
    await page.locator('button[title="Komuta"]').click();
    await page
      .getByRole("switch", { name: "Sanayi ve tedarik otomatik yönetim" })
      .check();
    const automated = await saveWorld();
    assert.equal(automated.countries.turkey.automation.economy, true);
    await page.locator('button[title="Komuta"]').click();
    await page
      .getByRole("switch", { name: "Sanayi ve tedarik otomatik yönetim" })
      .uncheck();
    const manual = await saveWorld();
    assert.equal(manual.difficulty, "easy");
    assert.equal(manual.countries.turkey.automation.economy, false);
    await page.locator('button[title="Araştırma"]').click();
    await page
      .getByRole("button", { name: "Araştır · 70 temel gün" })
      .first()
      .click();
    await page.locator('button[title="Siyaset"]').click();
    await page
      .getByRole("button", { name: "Odağı seç · 56 gün" })
      .first()
      .click();
    await page.locator('button[title="Ordu"]').click();
    const firstArmy = initial.armies.find((army) => army.country === "turkey");
    await page
      .getByRole("button", { name: new RegExp(escapeRegExp(firstArmy.name)) })
      .click();
    await page.getByText(/^Tümen desteği ·/).click();
    await page
      .getByRole("heading", { name: "İstihkâm", exact: true })
      .locator("..")
      .getByRole("button", { name: "Tümene ekle", exact: true })
      .click();
    const supported = await saveWorld();
    assert.deepEqual(
      supported.armies.find((army) => army.id === firstArmy.id).support,
      ["engineers"],
    );
    assert.equal(
      supported.countries.turkey.equipment.rifle,
      manual.countries.turkey.equipment.rifle - 20,
    );
    await page.locator('button[title="Harekât"]').click();
    const originalWing = initial.countries.turkey.air.wings[0];
    await page
      .getByRole("button", { name: "Uçakları yedeğe al" })
      .first()
      .click();
    const reserved = await saveWorld();
    assert.ok(
      !reserved.countries.turkey.air.wings.some(
        (wing) => wing.id === originalWing.id,
      ),
    );
    assert.equal(
      reserved.countries.turkey.equipment[originalWing.model],
      initial.countries.turkey.equipment[originalWing.model] +
        originalWing.count,
    );
    await page.locator('button[title="Harekât"]').click();
    await page.getByText("Yeni hava kanadı kur", { exact: true }).click();
    await page
      .getByLabel("Uçak modeli", { exact: true })
      .selectOption(originalWing.model);
    await page
      .getByLabel("Üs", { exact: true })
      .selectOption(originalWing.base);
    await page
      .getByLabel("Uçak sayısı", { exact: true })
      .fill(String(originalWing.count));
    await page.getByRole("button", { name: "Kanat kur", exact: true }).click();
    await page
      .getByLabel("Görev", { exact: true })
      .first()
      .selectOption("superiority");
    await page.getByText(/^Donanma ve deniz bölgeleri ·/).click();
    await page
      .getByRole("button", { name: "Eskort", exact: true })
      .first()
      .click();
    const deployed = await saveWorld(),
      newWing = deployed.countries.turkey.air.wings.find(
        (wing) => wing.model === originalWing.model,
      );
    assert.ok(newWing);
    assert.notEqual(newWing.id, originalWing.id);
    assert.equal(newWing.count, originalWing.count);
    assert.equal(newWing.base, originalWing.base);
    assert.equal(newWing.target, originalWing.base);
    assert.equal(newWing.mission, "superiority");
    assert.equal(
      deployed.countries.turkey.equipment[originalWing.model],
      initial.countries.turkey.equipment[originalWing.model],
    );
    assert.equal(deployed.countries.turkey.navy.ships[0].mission, "escort");
    const mapMode = page.getByLabel("Harita görünümü", { exact: true });
    await mapMode.selectOption("air");
    const airCounter = page.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(newWing.name)},`),
    });
    await airCounter.focus();
    await airCounter.press("Enter");
    await page
      .getByRole("button", { name: "Hava bilgilerini kapat" })
      .waitFor();
    await page.screenshot({ path: path.join(output, "air-map.png") });
    await mapMode.selectOption("naval");
    const seaCounter = page.getByRole("button", {
      name: /^Karadeniz, deniz üstünlüğü/,
    });
    await seaCounter.focus();
    await seaCounter.press("Enter");
    await page
      .getByRole("button", { name: "Deniz bilgilerini kapat" })
      .waitFor();
    await page.screenshot({ path: path.join(output, "naval-map.png") });
    await mapMode.selectOption("political");
    await page.getByRole("textbox", { name: "Şehir bul" }).fill("Eskişehir");
    await page.getByRole("button", { name: /^Eskişehir\s*Türkiye$/ }).click();
    await page.locator('[data-testid="urban-centers"]').waitFor();
    const eskisehir = map.provinces.find((p) => p.name === "Eskişehir");
    assert.ok(eskisehir && eskisehir.id !== eskisehir.legacyRegion);
    await page
      .getByRole("heading", { name: "Eskişehir", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(`[data-province="${eskisehir.id}"]`).count(),
      1,
    );
    assert.notEqual(
      eskisehir.path,
      map.provinces.find((p) => p.id === eskisehir.legacyRegion).path,
    );
    await page.screenshot({ path: path.join(output, "cities.png") });
    await page
      .getByRole("button", { name: "Tüm haritayı göster", exact: true })
      .click();
    await page.locator('button[title="Ordu"]').click();
    await page
      .getByRole("button", { name: "Tüm tümenler için savunma hattı çiz" })
      .click();
    // At whole-map scale a neighbouring army counter can cover a city. Focus
    // the country, then click an exposed point of the actual province polygon.
    // Derive adjacency from the shipped map so subdivision changes stay valid.
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    const capital = map.provinces.find(
      (p) => p.id === initial.countries.turkey.capital,
    );
    const neighbourId = capital.neighbors.find(
      (edge) => !edge.sea && initial.provinces[edge.id].controller === "turkey",
    )?.id;
    assert.ok(neighbourId, "Player capital needs an adjacent own land region");
    const frontProvinces = [capital.id, neighbourId];
    for (const id of frontProvinces) {
      const region = map.provinces.find((p) => p.id === id);
      const point = await page
        .locator(`[data-province="${id}"]`)
        .evaluate((el, p) => {
          const matrix = el.getScreenCTM();
          const box = el.getBBox();
          const candidates = [{ x: p.x, y: p.y }];
          for (let row = 1; row < 20; row++) {
            for (let col = 1; col < 20; col++) {
              candidates.push({
                x: box.x + (box.width * col) / 20,
                y: box.y + (box.height * row) / 20,
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
            if (hit?.closest("[data-province]")?.dataset.province === p.id)
              return { x: screen.x, y: screen.y };
          }
          return null;
        }, region);
      assert.ok(point, `No exposed clickable polygon found for ${id}`);
      await page.mouse.click(point.x, point.y);
    }
    await page.getByRole("button", { name: "Hattı kaydet ve dağıt" }).click();
    await page.getByRole("button", { name: "5 kat hız" }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="game-date"]').textContent !==
        "1 Ocak 1936",
    );
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    const state = await saveWorld();
    assert.equal(state.fronts.length, 1);
    assert.deepEqual(state.fronts[0].provinces, frontProvinces);
    assert.equal(state.countries.turkey.research.length, 1);
    assert.ok(state.countries.turkey.focus);
    assert.equal(state.countries.turkey.automation.economy, false);
    assert.deepEqual(
      state.armies.find((army) => army.id === firstArmy.id).support,
      ["engineers"],
    );
    assert.equal(
      state.countries.turkey.air.wings.find((wing) => wing.id === newWing.id)
        .mission,
      "superiority",
    );
    assert.equal(state.countries.turkey.navy.ships[0].mission, "escort");
    await page
      .getByRole("button", { name: "Yükle", exact: true })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Komuta merkezi", exact: true })
      .waitFor();
    assert.deepEqual(await saveWorld(), state);
    await page.locator('button[title="Komuta"]').click();
    await page.screenshot({ path: path.join(output, "campaign.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, "mobile-panel.png") });
    await page.getByRole("button", { name: "Yönetim panelini kapat" }).click();
    await page.screenshot({ path: path.join(output, "mobile-map.png") });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const svg = page.locator('[data-testid="war-map"]'),
      box = await svg.boundingBox();
    const before = await svg.getAttribute("viewBox");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.mouse.wheel(0, -150);
    await page.waitForFunction(
      (old) =>
        document
          .querySelector('[data-testid="war-map"]')
          .getAttribute("viewBox") !== old,
      before,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    await page.getByText("Kayıtlı sefere devam et", { exact: true }).click();
    await page
      .getByRole("button", { name: /Türkiye · \d+\. gün/ })
      .first()
      .click();
    const restoredDate = await page
      .locator('[data-testid="game-date"]')
      .textContent();
    assert.notEqual(restoredDate, "1 Ocak 1936");
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      (old) =>
        document.querySelector('[data-testid="game-date"]').textContent !== old,
      restoredDate,
    );
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    await page.screenshot({ path: path.join(output, "offline.png") });
    // Build a legitimate save with a defended border to verify actual combat UI,
    // using the public import flow instead of adding test hooks to the game.
    const ts = require("typescript");
    require.extensions[".ts"] = (module, filename) => {
      module._compile(
        ts.transpileModule(require("node:fs").readFileSync(filename, "utf8"), {
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
      GEOGRAPHY,
    } = require("../app/games/europa-war/strategy/world.ts");
    const {
      applyAction,
    } = require("../app/games/europa-war/strategy/engine.ts");
    const {
      declareWar,
    } = require("../app/games/europa-war/strategy/diplomacy.ts");
    const {
      encodeSave,
    } = require("../app/games/europa-war/strategy/storage.ts");
    let fixture = createWorld("germany", "historical", 1936, "normal");
    declareWar(fixture, "germany", "poland");
    const border = Object.values(GEOGRAPHY).find(
      (p) =>
        p.country === "germany" &&
        p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "poland"),
    );
    const destination = border.neighbors.find(
      (e) => !e.sea && GEOGRAPHY[e.id].country === "poland",
    ).id;
    const attacker = fixture.armies.find((a) => a.country === "germany"),
      defender = fixture.armies.find((a) => a.country === "poland");
    attacker.province = border.id;
    defender.province = destination;
    attacker.type = defender.type = "infantry";
    attacker.organization = defender.organization = 100;
    fixture.armies = [attacker, defender];
    const ordered = applyAction(fixture, {
      type: "move",
      army: attacker.id,
      to: destination,
    });
    assert.equal(ordered.error, null);
    fixture = ordered.world;
    await page.locator('button[title="Kayıtlar"]').click();
    await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
      name: "border-battle.json",
      mimeType: "application/json",
      buffer: Buffer.from(encodeSave(fixture)),
    });
    await page
      .getByRole("heading", { name: "Komuta merkezi", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "5 kat hız" }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="game-date"]').textContent !==
        "1 Ocak 1936",
    );
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    const fought = await saveWorld();
    assert.ok(fought.countries.germany.casualties > 0);
    assert.ok(fought.countries.poland.casualties > 0);
    assert.ok(fought.armies.find((a) => a.id === defender.id).strength < 100);
    await page.locator('button[title="Ordu"]').click();
    await page.locator('[data-testid="battle-report"]').waitFor();
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await page.screenshot({ path: path.join(output, "battle.png") });
    assert.deepEqual(errors, []);
    assert.ok(
      !requests.some((url) =>
        /upstash|lichess|api\/.*europa|tiles\.|openstreetmap/i.test(url),
      ),
    );
    console.log(
      JSON.stringify({
        result: "passed",
        checks: [
          "country selection",
          "easy/normal difficulty persisted",
          "447 independent city regions with city search",
          "defended border battle causes real losses and shows battle report",
          "command center default and restored panel",
          "automation enable/disable persisted state",
          "research",
          "national focus",
          "division support and equipment cost",
          "aircraft reserve, wing creation, and air mission",
          "individual ship escort mission",
          "air and naval map overlays",
          "draw and assign front",
          "daily clock",
          "manual save/load",
          "mobile panel close",
          "map zoom",
          "offline reload and continued simulation",
        ],
        pageErrors: errors,
        screenshots: output,
      }),
    );
    await context.close();
  } catch (error) {
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
