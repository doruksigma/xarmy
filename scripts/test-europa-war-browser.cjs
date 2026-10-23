/* Production browser regression: real UI orders, clock, combat and occupation.
   Fixtures enter through the public save-import control; no application hooks.
   EUROPA_BASELINE=1 records pre-fix failures while omitting newly added labels. */
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
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-war";
const baseline = process.env.EUROPA_BASELINE === "1";
mkdirSync(output, { recursive: true });
function fixture({ weak = false, defended = true } = {}) {
  const world = createWorld("germany", "historical", 1936, "normal");
  declareWar(world, "germany", "poland");
  const origin = "germany-8",
    destination = "poland-city-2";
  const retreat = GEOGRAPHY[origin].neighbors.find(
    (e) => !e.sea && world.provinces[e.id].controller === "germany",
  ).id;
  world.armies = [];
  const attackers = Array.from({ length: weak ? 1 : 3 }, () =>
    addArmy(world, "germany", origin),
  );
  const defenders = defended ? [addArmy(world, "poland", destination)] : [];
  for (const a of attackers) {
    a.organization = 100;
    a.strength = weak ? 10 : 100;
  }
  for (const a of defenders) {
    a.organization = 45;
    a.entrenchment = 0;
  }
  // No reinforcement can hide the exhausted-unit occupation regression.
  if (weak) {
    const c = world.countries.germany;
    c.manpower = 0;
    c.production = [];
    for (const key of Object.keys(c.equipment)) c.equipment[key] = 0;
  }
  return {
    world: decodeSave(encodeSave(world)),
    origin,
    destination,
    retreat,
    attackers,
    defenders,
  };
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
  const tab = (name) => page.locator(`button[title="${name}"]`).click();
  const pause = async () => {
    const b = page.getByRole("button", {
      name: "Zamanı duraklat",
      exact: true,
    });
    if (await b.count()) await b.click();
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
    await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
      name: name + ".json",
      mimeType: "application/json",
      buffer: Buffer.from(encodeSave(f.world)),
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
    await focus(f.origin);
    if (page.viewportSize().width <= 700) {
      const close = page.getByRole("button", {
        name: "Yönetim panelini kapat",
        exact: true,
      });
      if (await close.count()) await close.click();
    }
    await page
      .locator(`[data-army-stack="${f.attackers.map((a) => a.id).join(",")}"]`)
      .click();
    await page.waitForFunction(
      (n) =>
        document.querySelector('[data-testid="army-selection-count"]')
          ?.textContent === `${n} tümen seçili`,
      f.attackers.length,
    );
  };
  const clickProvince = async (id) => {
    const point = await page
      .locator(`[data-province="${id}"]`)
      .evaluate((el, r) => {
        const m = el.getScreenCTM(),
          b = el.getBBox(),
          points = [{ x: r.x, y: r.y }];
        for (let y = 1; y < 30; y++)
          for (let x = 1; x < 30; x++)
            points.push({
              x: b.x + (b.width * x) / 30,
              y: b.y + (b.height * y) / 30,
            });
        for (const p of points) {
          if (!el.isPointInFill(new DOMPoint(p.x, p.y))) continue;
          const s = new DOMPoint(p.x, p.y).matrixTransform(m);
          if (
            document.elementFromPoint(s.x, s.y)?.closest("[data-province]")
              ?.dataset.province === r.id
          )
            return { x: s.x, y: s.y };
        }
        return null;
      }, GEOGRAPHY[id]);
    assert.ok(point, `Province ${id} must be clickable`);
    await page.mouse.click(point.x, point.y);
  };
  const order = async (f, to = f.destination) => {
    await page
      .getByTestId("army-selection-count")
      .locator("..")
      .getByRole("button", {
        name: `Haritada hedef seç · ${f.attackers.length} tümen`,
        exact: true,
      })
      .click();
    await clickProvince(to);
    await page
      .getByRole("button", { name: "Emri iptal et", exact: true })
      .waitFor({ state: "detached" });
  };
  const advance = async (days) => {
    const before = await page.getByTestId("game-date").textContent();
    let day = -1;
    for (let i = 0; i < 1000; i++)
      if (dateLabel(i) === before) {
        day = i;
        break;
      }
    assert.ok(day >= 0, `Known campaign date: ${before}`);
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.waitForFunction(
      (labels) =>
        labels.includes(
          document.querySelector('[data-testid="game-date"]')?.textContent,
        ),
      Array.from({ length: 30 }, (_, i) => dateLabel(day + days + i)),
      { timeout: 25000 },
    );
    await pause();
  };
  const check = async (name, fn) => {
    if (process.env.EUROPA_CASE && !name.includes(process.env.EUROPA_CASE))
      return;
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
    await check(
      "desktop paused group order, damage, defenders retreat and all three divisions occupy",
      async () => {
        const f = fixture();
        await load(f, "desktop-capture");
        await select(f);
        await order(f);
        const before = await page.getByTestId("game-date").textContent();
        await page.waitForTimeout(450);
        assert.equal(await page.getByTestId("game-date").textContent(), before);
        if (!baseline)
          assert.match(
            await page.getByTestId("army-order-status").textContent(),
            /Emir bekliyor/,
          );
        assert.match(
          await page.getByRole("status").textContent(),
          /Zaman duraklatıldı/,
        );
        let w = await save();
        for (const a of f.attackers) {
          const unit = w.armies.find((b) => b.id === a.id);
          assert.equal(unit.province, f.origin);
          assert.equal(unit.move, null);
          assert.equal(unit.route[0], f.destination);
        }
        await tab("Ordu");
        await advance(1);
        await page.getByTestId("battle-report").first().waitFor();
        if (!baseline)
          assert.match(
            await page.getByTestId("army-order-status").textContent(),
            /Çatışıyor/,
          );
        w = await save();
        assert.ok(
          w.countries.germany.casualties > 0 &&
            w.countries.poland.casualties > 0,
        );
        for (const a of f.attackers)
          assert.ok(w.armies.find((b) => b.id === a.id).strength < a.strength);
        assert.ok(
          w.armies.find((b) => b.id === f.defenders[0].id).strength < 100,
        );
        await tab("Ordu");
        await page.screenshot({
          path: path.join(output, "desktop-combat.png"),
        });
        await advance(10);
        w = await save();
        assert.equal(w.provinces[f.destination].controller, "germany");
        for (const a of f.attackers)
          assert.equal(
            w.armies.find((b) => b.id === a.id).province,
            f.destination,
          );
        assert.ok(
          w.armies
            .filter((a) => a.country === "poland")
            .every((a) => a.province !== f.destination),
        );
        await tab("Ordu");
        await page.screenshot({
          path: path.join(output, "desktop-captured.png"),
        });
        writeFileSync(
          path.join(output, "desktop-captured.json"),
          JSON.stringify(w, null, 2),
        );
      },
    );
    await check(
      "replacement order redirects every attacking division to a friendly city",
      async () => {
        const f = fixture();
        f.world.armies.find((a) => a.id === f.defenders[0].id).organization =
          100;
        await load(f, "redirect-attack");
        await select(f);
        await order(f);
        await advance(1);
        await order(f, f.retreat);
        let w = await save();
        for (const a of f.attackers) {
          const unit = w.armies.find((b) => b.id === a.id);
          assert.notEqual(
            unit.move?.to,
            f.destination,
            "Replacing the order must cancel the previous attack leg",
          );
        }
        await advance(15);
        w = await save();
        for (const a of f.attackers)
          assert.equal(w.armies.find((b) => b.id === a.id).province, f.retreat);
      },
    );
    await check(
      "exhausted division reaches and occupies an undefended hostile city",
      async () => {
        const f = fixture({ weak: true, defended: false });
        await load(f, "weak-unopposed");
        await select(f);
        await order(f);
        await advance(12);
        const w = await save();
        writeFileSync(
          path.join(output, "weak-arrival.json"),
          JSON.stringify(w, null, 2),
        );
        assert.equal(w.provinces[f.destination].controller, "germany");
        assert.equal(
          w.armies.find((a) => a.id === f.attackers[0].id).province,
          f.destination,
        );
      },
    );
    await check(
      "completed march remains a real battle until defenders retreat, with bounded progress",
      async () => {
        const f = fixture();
        const defender = f.world.armies.find((a) => a.id === f.defenders[0].id);
        defender.organization = 100;
        for (let i = 0; i < 2; i++)
          addArmy(f.world, "poland", f.destination).organization = 100;
        for (const original of f.attackers) {
          const unit = f.world.armies.find((a) => a.id === original.id);
          unit.move = { to: f.destination, days: 2, progress: 8 };
          unit.stance = "advance";
        }
        await load(f, "completed-march-defended");
        await select(f);
        await advance(1);
        await page.getByTestId("battle-report").first().waitFor();
        if (!baseline) {
          assert.match(
            await page.getByTestId("army-order-status").textContent(),
            /Çatışıyor/,
          );
          const progress = page
            .getByText("Yol ilerlemesi", { exact: true })
            .locator("xpath=following-sibling::div[1]");
          assert.equal((await progress.textContent()).trim(), "%100");
          assert.equal(
            await progress.locator("i").evaluate((el) => el.style.width),
            "100%",
          );
        }
        const w = await save();
        assert.equal(w.provinces[f.destination].controller, "poland");
        assert.ok(w.battles.some((b) => b.province === f.destination));
        assert.ok(
          w.countries.germany.casualties > 0 &&
            w.countries.poland.casualties > 0,
        );
        for (const a of f.attackers)
          assert.equal(w.armies.find((b) => b.id === a.id).province, f.origin);
      },
    );
    await check(
      "mobile paused war order remains visible and three divisions capture after resume",
      async () => {
        const f = fixture();
        await load(f, "mobile-capture");
        await page.setViewportSize({ width: 390, height: 844 });
        const close = page.getByRole("button", {
          name: "Yönetim panelini kapat",
          exact: true,
        });
        if (await close.count()) await close.click();
        await select(f);
        await order(f);
        const feedbackVisible = await page
          .getByRole("status")
          .filter({ hasText: "Zaman duraklatıldı" })
          .isVisible();
        await page.screenshot({
          path: path.join(output, "mobile-paused-order.png"),
        });
        const before = await page.getByTestId("game-date").textContent();
        await page.waitForTimeout(450);
        assert.equal(await page.getByTestId("game-date").textContent(), before);
        if (!baseline) {
          const notice = page.getByTestId("map-order-notice");
          await notice
            .getByRole("button", { name: "Bildirimi kapat", exact: true })
            .click();
          assert.equal(await notice.count(), 0);
          await page
            .getByRole("button", { name: "Zamanı başlat", exact: true })
            .waitFor();
          await tab("Ordu");
          await order(f);
          await notice
            .getByRole("button", { name: "▶ Zamanı ilerlet", exact: true })
            .click();
          await page.waitForFunction(
            (old) =>
              document.querySelector('[data-testid="game-date"]')
                ?.textContent !== old,
            before,
          );
          await pause();
        } else await advance(1);
        let w = await save();
        assert.ok(
          w.countries.germany.casualties > 0 &&
            w.countries.poland.casualties > 0,
        );
        await advance(10);
        w = await save();
        for (const a of f.attackers)
          assert.equal(
            w.armies.find((b) => b.id === a.id).province,
            f.destination,
          );
        assert.equal(w.provinces[f.destination].controller, "germany");
        await tab("Ordu");
        await page.screenshot({
          path: path.join(output, "mobile-captured.png"),
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        assert.ok(
          feedbackVisible,
          "Paused command feedback must remain visible after mobile targeting closes the management panel",
        );
      },
    );
    assert.deepEqual(pageErrors, [], "No uncaught browser exceptions");
    assert.deepEqual(consoleErrors, [], "No browser console errors");
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
  assert.deepEqual(failures, [], "War lifecycle regressions");
  console.log(
    JSON.stringify({
      result: "passed",
      checks,
      pageErrors,
      consoleErrors,
      output,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
