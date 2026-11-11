/* Reference-layout acceptance through the public game UI. Fixtures enter using
 * validated JSON imports; observations use the normal committed IndexedDB slot.
 * Run against a fresh production build with Playwright available on NODE_PATH. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { advanceClockHours } = require("./europa-browser-clock.cjs");

const root = path.resolve(__dirname, "..");
const base = process.env.EUROPA_BASE_URL || "http://127.0.0.1:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/europa-reference-workflows";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const compiled = fs.mkdtempSync(
    path.join(root, "node_modules", ".reference-workflows-"),
  );
  const checks = [],
    errors = [];
  let browser, page;
  const report = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
  const pass = (message) => {
    checks.push(message);
    console.log("PASS " + message);
    report();
  };
  try {
    execFileSync(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc"),
        "--outDir",
        compiled,
        "--rootDir",
        root,
        "--module",
        "commonjs",
        "--target",
        "ES2022",
        "--moduleResolution",
        "node",
        "--resolveJsonModule",
        "--esModuleInterop",
        "--skipLibCheck",
        "--strict",
        "app/games/europa-war/strategy/engine.ts",
        "app/games/europa-war/strategy/storage.ts",
      ],
      { cwd: root, stdio: "pipe" },
    );
    const source = path.join(compiled, "app/games/europa-war/strategy");
    const { createWorld, addArmy, GEOGRAPHY, MAP } = require(
      path.join(source, "world.js"),
    );
    const { encodeSave, decodeSave } = require(path.join(source, "storage.js"));
    const { declareWar } = require(path.join(source, "diplomacy.js"));
    const { applyAction, advanceHour } = require(
      path.join(source, "engine.js"),
    );
    const { planningStep } = require(path.join(source, "planning.js"));
    const { EQUIPMENT, TECHNOLOGIES } = require(
      path.join(source, "catalog.js"),
    );
    const { historicalEvent } = require(
      path.join(source, "historical-catalog.js"),
    );
    const safe = (world) => decodeSave(encodeSave(world));
    const command = (world, action) => {
      const result = applyAction(world, action);
      assert.equal(result.error, null, result.error);
      return safe(result.world);
    };
    const initial = createWorld("germany", "alternative", 1936, "easy");
    for (const country of Object.values(initial.countries)) {
      country.automation = {
        economy: false,
        research: false,
        recruitment: false,
        operations: false,
        air: false,
        navy: false,
      };
    }
    initial.countries.germany.political = 500;
    initial.countries.germany.treasury = 10000;
    initial.countries.germany.research = [];
    initial.countries.germany.production = [
      { equipment: "rifle", factories: 1, efficiency: 0.6, progress: 0 },
    ];
    for (const id of Object.keys(initial.countries.germany.stock))
      initial.countries.germany.stock[id] = 10000;
    const baseWorld = safe(initial);
    const tech = TECHNOLOGIES.find(
      (entry) =>
        entry.year <= 1936 &&
        !baseWorld.countries.germany.tech.includes(entry.id) &&
        entry.requires.every((id) =>
          baseWorld.countries.germany.tech.includes(id),
        ),
    );
    const lockedTech = TECHNOLOGIES.find((entry) =>
      entry.requires.some(
        (id) => !baseWorld.countries.germany.tech.includes(id),
      ),
    );
    assert.ok(tech && lockedTech);

    const armyWorld = structuredClone(baseWorld);
    armyWorld.armies = [];
    for (const country of Object.values(armyWorld.countries)) {
      country.autoAssignCommanders = false;
      for (const general of country.generals) delete general.front;
    }
    const origin = MAP.provinces.find(
      (province) =>
        province.country === "germany" &&
        province.neighbors.some(
          (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
        ) &&
        province.neighbors.some(
          (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "germany",
        ),
    ).id;
    const destination = GEOGRAPHY[origin].neighbors.find(
      (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "germany",
    ).id;
    const enemy = GEOGRAPHY[origin].neighbors.find(
      (edge) => !edge.sea && GEOGRAPHY[edge.id].country === "poland",
    ).id;
    const [first, second] = armyWorld.countries.germany.generals;
    const divisionIds = Array.from({ length: 12 }, () => {
      const army = addArmy(armyWorld, "germany", origin);
      army.general = first.id;
      army.organization = 100;
      return army.id;
    });
    const outsider = addArmy(armyWorld, "germany", destination);
    outsider.general = second.id;
    const peaceful = safe(armyWorld);
    const war = structuredClone(peaceful);
    declareWar(war, "germany", "poland");
    addArmy(war, "poland", enemy);
    const battle = safe(war);
    const workshop = "national-germany-workshops";
    pass(
      "Fixtures validate with a 12-division commander and an independent second commander",
    );
    if (process.env.EUROPA_FIXTURES_ONLY === "1") return;

    for (const [device, viewport, mobile] of [
      ["desktop", { width: 1440, height: 1000 }, false],
      ["mobile", { width: 390, height: 844 }, true],
    ]) {
      if (
        process.env.EUROPA_REFERENCE_DEVICE &&
        process.env.EUROPA_REFERENCE_DEVICE !== device
      )
        continue;
      browser = await chromium.launch({
        executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        localStorage.setItem("xarmy-europa-map-view-v1", "2d");
        localStorage.setItem("xarmy-europa-3d-motion-v1", "reduced");
      });
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) =>
        errors.push(`${device}: ${error.message}`),
      );
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`${device}: ${entry.text()}`);
      });
      page.on("crash", () => errors.push(`${device}: browser page crashed`));
      const click = async (locator) => {
        await locator.scrollIntoViewIfNeeded();
        return mobile ? locator.tap() : locator.click();
      };
      const screenshot = (name) =>
        page.screenshot({ path: path.join(output, `${device}-${name}.png`) });
      const noOverflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        );
      const pause = async () => {
        const button = page.getByRole("button", {
          name: "Zamanı duraklat",
          exact: true,
        });
        if (await button.isVisible()) await click(button);
      };
      const close = async () => {
        for (const name of [
          "Komutan panelini kapat",
          "Yönetim panelini kapat",
          "Bildirimi kapat",
        ]) {
          const button = page
            .getByRole("button", { name, exact: true })
            .first();
          if (await button.isVisible()) await click(button);
        }
      };
      const tab = async (name) => {
        await close();
        await click(page.locator(`button[title="${name}"]`));
      };
      const load = async (world) => {
        await pause();
        await tab("Kayıtlar");
        await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
          name: "workflow.json",
          mimeType: "application/json",
          buffer: Buffer.from(encodeSave(world)),
        });
        await page
          .getByRole("heading", { name: "Komuta merkezi", exact: true })
          .waitFor();
        await close();
      };
      const save = async () => {
        await pause();
        await tab("Kayıtlar");
        const button = page
          .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
          .first();
        await click(button);
        await page
          .getByText("Sefer bu cihaza kaydedildi.", { exact: true })
          .waitFor();
        await page.waitForFunction(() =>
          [...document.querySelectorAll("button")]
            .filter((button) => button.textContent === "Bu yuvaya kaydet")
            .every((button) => !button.disabled),
        );
        const stored = await page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open("xarmy-europa-auto-v1", 1);
              request.onerror = () =>
                reject(new Error("Save database unavailable"));
              request.onsuccess = () => {
                const db = request.result,
                  transaction = db.transaction("saves", "readonly");
                const get = transaction.objectStore("saves").get("slot-1");
                get.onsuccess = () => resolve(JSON.stringify(get.result));
                get.onerror = () => reject(new Error("Saved slot unavailable"));
                transaction.oncomplete = () => db.close();
              };
            }),
        );
        return decodeSave(stored);
      };
      const focusMap = async (id) => {
        await close();
        await page
          .getByRole("textbox", { name: "Şehir bul", exact: true })
          .fill(GEOGRAPHY[id].name);
        await click(
          page
            .getByRole("list", { name: "Şehir arama sonuçları" })
            .getByRole("button")
            .filter({ hasText: GEOGRAPHY[id].name })
            .first(),
        );
        await close();
      };
      const clickProvince = async (id) => {
        const point = await page
          .locator(`[data-province="${id}"]`)
          .evaluate((element, region) => {
            const matrix = element.getScreenCTM(),
              bounds = element.getBBox();
            const candidates = [{ x: region.x, y: region.y }];
            for (let row = 1; row < 30; row++)
              for (let col = 1; col < 30; col++)
                candidates.push({
                  x: bounds.x + (bounds.width * col) / 30,
                  y: bounds.y + (bounds.height * row) / 30,
                });
            for (const candidate of candidates) {
              if (
                !element.isPointInFill(new DOMPoint(candidate.x, candidate.y))
              )
                continue;
              const screen = new DOMPoint(
                candidate.x,
                candidate.y,
              ).matrixTransform(matrix);
              if (
                document
                  .elementFromPoint(screen.x, screen.y)
                  ?.closest("[data-province]")?.dataset.province === region.id
              )
                return { x: screen.x, y: screen.y };
            }
            return null;
          }, GEOGRAPHY[id]);
        assert.ok(point, `${device}: no exposed province for ${id}`);
        if (mobile) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
      };
      const selectCommander = async () => {
        await close();
        await click(page.getByTestId(`commander-card-${first.id}`));
        await page.getByTestId("commander-panel").waitFor();
      };
      const touchRevealFocusAction = async (button) => {
        const reachable = () =>
          button.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const x = bounds.x + bounds.width / 2,
              y = bounds.y + bounds.height / 2;
            return (
              document.elementFromPoint(x, y)?.closest("button") === element
            );
          });
        const cdp = await context.newCDPSession(page);
        try {
          for (
            let attempt = 0;
            attempt < 5 && !(await reachable());
            attempt++
          ) {
            const bounds = await page
              .locator('aside[data-tab="history"]')
              .boundingBox();
            // The panel's right padding lies outside the graph's nested pan area.
            const x = bounds.x + bounds.width - 6,
              y = bounds.y + bounds.height - 28;
            const distance = Math.min(340, bounds.height * 0.65);
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [{ x, y }],
            });
            for (let step = 1; step <= 12; step++) {
              await cdp.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [{ x, y: y - (distance * step) / 12 }],
              });
              await page.waitForTimeout(16);
            }
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
            await page.waitForTimeout(150);
          }
          assert.ok(
            await reachable(),
            "Selected focus action must be reachable with normal outer-panel touch scrolling",
          );
        } finally {
          await cdp.detach();
        }
      };
      const assertOtherUnchanged = (world, before = peaceful) =>
        assert.deepEqual(
          world.armies.find((army) => army.id === outsider.id),
          before.armies.find((army) => army.id === outsider.id),
        );

      await page.goto(`${base}/games/europa-war`, {
        waitUntil: "domcontentloaded",
      });
      await click(page.getByRole("button", { name: /^SEFERİ BAŞLAT/ }));
      await pause();
      if (
        !(
          device === "desktop" &&
          process.env.EUROPA_REFERENCE_RESUME === "single"
        )
      ) {
        await load(baseWorld);
        await tab("Odak / Olaylar");
        const graph = page.getByTestId("focus-graph");
        await graph.waitFor();
        assert.ok((await graph.locator("[data-focus-node]").count()) > 0);
        assert.ok(
          (await page
            .getByTestId("focus-graph-connections")
            .locator("path[data-from][data-to]")
            .count()) > 0,
        );
        await screenshot("focus-tree-overview");
        const graphViewport = page.getByTestId("focus-graph-viewport");
        const previousScroll = await graphViewport.evaluate(
          (element) => element.scrollLeft,
        );
        await click(
          page.getByRole("button", {
            name: "Odak ağacında sağa kaydır",
            exact: true,
          }),
        );
        assert.ok(
          (await graphViewport.evaluate((element) => element.scrollLeft)) >
            previousScroll,
        );
        const scale = page.getByLabel("Odak ağacı ölçeği", { exact: true });
        const oldScale = await scale.innerText();
        await click(
          page.getByRole("button", {
            name: "Odak ağacını yakınlaştır",
            exact: true,
          }),
        );
        assert.notEqual(await scale.innerText(), oldScale);
        await click(
          page.getByRole("button", {
            name: "Odak ağacını uzaklaştır",
            exact: true,
          }),
        );
        await page
          .getByLabel("Odak ara", { exact: true })
          .fill(historicalEvent(workshop).title);
        await click(page.locator(`[data-focus-node="history-${workshop}"]`));
        const focusDetail = page.getByTestId("focus-detail");
        assert.match(
          await focusDetail.innerText(),
          /Yerel Atölyelerin Birleştirilmesi/,
        );
        assert.ok(await noOverflow());
        await screenshot("focus-tree");
        const startFocus = focusDetail.getByRole("button", {
          name: /^Odağı başlat/,
        });
        if (mobile) {
          await touchRevealFocusAction(startFocus);
          await screenshot("focus-touch-action");
          pass(
            "mobile: a selected focus action is reachable through ordinary touch scrolling outside the graph",
          );
        }
        await click(startFocus);
        const focused = await save();
        assert.equal(focused.countries.germany.focus.id, `history-${workshop}`);
        assert.equal(
          focused.countries.germany.political,
          baseWorld.countries.germany.political -
            historicalEvent(workshop).cost,
        );
        pass(
          `${device}: connected focus graph supports zoom, full-catalog search, selection and an actual paid focus start`,
        );
        if (process.env.EUROPA_REFERENCE_PHASE === "focus") {
          await load(baseWorld);
          await tab("Sanayi");
          assert.ok(await noOverflow());
          await screenshot("production-overview");
          await tab("Araştırma");
          assert.ok(await noOverflow());
          await screenshot("research-overview");
          await load(peaceful);
          await focusMap(origin);
          await selectCommander();
          await click(
            page.getByRole("button", {
              name: "Komutan panelini kapat",
              exact: true,
            }),
          );
          assert.match(
            await page.getByTestId("commander-map-selection").innerText(),
            /12\/12/,
          );
          assert.ok(await noOverflow());
          await screenshot("commander-selected");
          if (mobile) {
            await page.setViewportSize({ width: 320, height: 760 });
            await load(baseWorld);
            await tab("Odak / Olaylar");
            assert.ok(await noOverflow());
            await screenshot("focus-320");
            await tab("Sanayi");
            assert.ok(await noOverflow());
            await screenshot("production-320");
            await tab("Araştırma");
            assert.ok(await noOverflow());
            await screenshot("research-320");
            pass("mobile: compact focus graph fits the 320px viewport");
          }
          await context.close();
          page = null;
          await browser.close();
          browser = null;
          continue;
        }

        await load(baseWorld);
        await tab("Sanayi");
        const rifle = page.getByTestId("production-rifle");
        await rifle.waitFor();
        await click(
          rifle.getByRole("button", {
            name: `${EQUIPMENT.rifle.name} fabrika artır`,
            exact: true,
          }),
        );
        assert.ok(await noOverflow());
        await screenshot("production");
        const allocated = await save();
        assert.equal(
          allocated.countries.germany.production.find(
            (line) => line.equipment === "rifle",
          ).factories,
          2,
        );
        const productionNear = structuredClone(allocated);
        productionNear.hour = 23;
        const expectedProduction = advanceHour(safe(productionNear));
        await load(safe(productionNear));
        await advanceClockHours(page, 1);
        const produced = await save();
        assert.equal(
          produced.countries.germany.equipment.rifle,
          expectedProduction.countries.germany.equipment.rifle,
        );
        assert.deepEqual(
          produced.countries.germany.production,
          expectedProduction.countries.germany.production,
        );
        await tab("Sanayi");
        await click(
          page.getByTestId("production-rifle").getByRole("button", {
            name: `${EQUIPMENT.rifle.name} üretimini duraklat`,
            exact: true,
          }),
        );
        assert.equal(
          (await save()).countries.germany.production.find(
            (line) => line.equipment === "rifle",
          ).factories,
          0,
        );
        pass(
          `${device}: production factory buttons update real assignments, the next worker day matches actual output, and pause frees factories`,
        );

        await load(baseWorld);
        await tab("Araştırma");
        await page.getByTestId("research-panel").waitFor();
        await click(page.getByTestId("research-slot-0"));
        await page
          .getByRole("checkbox", {
            name: "Yalnız önkoşulları tamamlananlar",
            exact: true,
          })
          .uncheck();
        await page
          .getByLabel("Teknoloji ara", { exact: true })
          .fill(lockedTech.name);
        await click(page.locator(`[data-tech-id="${lockedTech.id}"]`));
        assert.ok(await page.getByTestId("research-start").isDisabled());
        await page.getByLabel("Teknoloji ara", { exact: true }).fill(tech.name);
        await click(page.locator(`[data-tech-id="${tech.id}"]`));
        await click(page.getByTestId("research-start"));
        await page.getByTestId("research-slot-0").scrollIntoViewIfNeeded();
        assert.ok(await noOverflow());
        await screenshot("research-slots");
        const researching = await save();
        assert.equal(researching.countries.germany.research[0].id, tech.id);
        const researchNear = structuredClone(researching);
        researchNear.hour = 23;
        const expectedResearch = advanceHour(safe(researchNear));
        await load(safe(researchNear));
        await advanceClockHours(page, 1);
        assert.deepEqual(
          (await save()).countries.germany.research,
          expectedResearch.countries.germany.research,
        );
        pass(
          `${device}: research slots select technologies, enforce prerequisites and show real worker progress`,
        );

        await load(peaceful);
        await focusMap(origin);
        await selectCommander();
        assert.match(
          await page.getByTestId("commander-order-count").innerText(),
          /12/,
        );
        await click(page.getByTestId("commander-move"));
        assert.equal(await page.getByTestId("commander-panel").count(), 0);
        assert.match(
          await page.getByTestId("commander-map-selection").innerText(),
          /12\/12/,
        );
        await click(page.locator(`[data-army-stack="${outsider.id}"]`));
        const moved = await save();
        for (const id of divisionIds) {
          const army = moved.armies.find((entry) => entry.id === id);
          assert.equal(army.route.at(-1) ?? army.move?.to, destination);
          assert.equal(army.general, first.id);
        }
        assertOtherUnchanged(moved);
        pass(
          `${device}: commander move sends all twelve divisions while preserving their commander and leaving the second command untouched`,
        );

        await load(peaceful);
        await focusMap(origin);
        await selectCommander();
        await click(page.getByTestId("commander-front"));
        await clickProvince(origin);
        await clickProvince(destination);
        await click(page.getByTestId("map-save-operation"));
        const defended = await save();
        const front = defended.fronts.find((entry) =>
          entry.armies.includes(divisionIds[0]),
        );
        assert.deepEqual([...front.armies].sort(), [...divisionIds].sort());
        assert.deepEqual(front.provinces, [origin, destination]);
        assertOtherUnchanged(defended);
        await selectCommander();
        await screenshot("commander-front");
        await click(page.getByTestId("commander-halt"));
        const halted = await save();
        assert.ok(
          halted.fronts.every(
            (entry) => !entry.armies.some((id) => divisionIds.includes(id)),
          ),
        );
        for (const id of divisionIds) {
          const army = halted.armies.find((entry) => entry.id === id);
          assert.equal(army.move, null);
          assert.deepEqual(army.route, []);
        }
        assertOtherUnchanged(halted);
        pass(
          `${device}: drawn defense line contains exactly the selected twelve divisions and commander halt clears their operation only`,
        );

        await load(battle);
        await focusMap(origin);
        await selectCommander();
        await click(page.getByTestId("commander-offensive"));
        await clickProvince(enemy);
        await page
          .getByLabel("Harekât yaklaşımı", { exact: true })
          .selectOption("careful");
        await click(page.getByTestId("map-save-operation"));
        const planned = await save();
        const plan = planned.plans.find((entry) =>
          entry.armies.includes(divisionIds[0]),
        );
        assert.deepEqual([...plan.armies].sort(), [...divisionIds].sort());
        assert.deepEqual(plan.objectives, [enemy]);
        assert.equal(plan.stance, "careful");
        assert.equal(plan.active, false);
        assertOtherUnchanged(planned, battle);
        await selectCommander();
        assert.ok(await page.getByTestId("commander-plan-start").isDisabled());
        const prepared = structuredClone(planned);
        planningStep(prepared, 100);
        assert.ok(
          prepared.plans.find((entry) => entry.id === plan.id).preparation >=
            30,
        );
        await load(safe(prepared));
        await selectCommander();
        await click(page.getByTestId("commander-plan-start"));
        const active = await save();
        assert.equal(
          active.plans.find((entry) => entry.id === plan.id).active,
          true,
        );
        await selectCommander();
        await screenshot("commander-offensive");
        await click(page.getByTestId("commander-plan-pause"));
        assert.equal(
          (await save()).plans.find((entry) => entry.id === plan.id).active,
          false,
        );
        pass(
          `${device}: commander offensive creates a twelve-division plan with a real objective, preparation gate and working start/pause controls`,
        );
      }

      await load(peaceful);
      await focusMap(origin);
      await selectCommander();
      await click(page.getByTestId("commander-divisions").locator("summary"));
      const member = page
        .getByTestId("commander-divisions")
        .locator(`[data-army-id="${divisionIds[0]}"]`);
      await click(member);
      assert.match(
        await page.getByTestId("map-target-selection").innerText(),
        /1 tümen/,
      );
      await clickProvince(destination);
      const single = await save();
      assert.equal(
        single.armies.find((army) => army.id === divisionIds[0]).route.at(-1),
        destination,
      );
      for (const id of divisionIds.slice(1))
        assert.deepEqual(
          single.armies.find((army) => army.id === id),
          peaceful.armies.find((army) => army.id === id),
        );
      assertOtherUnchanged(single);
      pass(
        `${device}: selecting one commander member restores direct single-division movement without moving the other eleven`,
      );

      if (mobile) {
        await page.setViewportSize({ width: 320, height: 760 });
        await load(baseWorld);
        await tab("Araştırma");
        assert.ok(await noOverflow());
        await screenshot("research-320");
        await tab("Sanayi");
        assert.ok(await noOverflow());
        await screenshot("production-320");
        await tab("Odak / Olaylar");
        assert.ok(await noOverflow());
        await screenshot("focus-320");
        pass(
          "mobile: focus, production and research remain within a 320px viewport",
        );
      }
      await context.close();
      page = null;
      await browser.close();
      browser = null;
    }
    assert.deepEqual(errors, []);
    report();
  } catch (error) {
    errors.push(error.stack || String(error));
    report();
    if (page)
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    fs.rmSync(compiled, { recursive: true, force: true });
    report();
  }
})();
