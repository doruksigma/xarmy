/* Production browser checks. Requires Playwright on NODE_PATH and Chromium.
   BATTLE_LIFECYCLE_ONLY=1 accelerates simulation and omits GPU draws; that mode
   validates match completion/cleanup, never graphics quality or performance. */
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const base = process.env.BATTLE_BASE_URL || "http://localhost:3000";
const output = process.env.BATTLE_ARTIFACT_DIR || "/tmp/xarmy-battle-browser";
const lifecycle = process.env.BATTLE_LIFECYCLE_ONLY === "1";
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BATTLE_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  let page;
  const checks = [],
    errors = [];
  const passed = (name) => {
    checks.push(name);
    console.log(JSON.stringify({ passed: name }));
  };
  const ready = async () => {
    await page.goto(`${base}/play`, { timeout: 60000 });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="battle-viewport"]')?.dataset
          .ready === "true",
      {},
      { timeout: 120000 },
    );
    assert.equal(
      await page
        .getByTestId("battle-viewport")
        .evaluate((element) => "battleSnapshot" in element),
      false,
    );
    assert.equal(
      await page.getByTestId("battle-viewport").locator("canvas").count(),
      1,
    );
  };
  const watch = () =>
    page.on("pageerror", (error) => errors.push(error.message));
  const draws = () => page.evaluate(() => window.__battleDrawCalls);
  const still = async () => {
    await page.waitForTimeout(600);
    const before = await draws();
    await page.waitForTimeout(1200);
    assert.equal(
      await draws(),
      before,
      "Paused scenery must stop submitting GPU draws",
    );
    return before;
  };
  try {
    if (lifecycle) {
      page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      watch();
      await page.addInitScript(() => {
        const native = requestAnimationFrame.bind(window);
        let clock;
        window.requestAnimationFrame = (callback) =>
          native((time) => {
            clock = (clock ?? time) + 250;
            callback(clock);
          });
        for (const Type of [
          window.WebGLRenderingContext,
          window.WebGL2RenderingContext,
        ]) {
          if (!Type) continue;
          for (const name of [
            "drawArrays",
            "drawElements",
            "drawArraysInstanced",
            "drawElementsInstanced",
            "drawRangeElements",
          ])
            if (Type.prototype[name]) Type.prototype[name] = function () {};
        }
      });
      await ready();
      await page.waitForFunction(
        () =>
          ["victory", "defeated"].includes(
            document.querySelector('[data-testid="battle-arena"]')?.dataset
              .phase,
          ),
        {},
        { timeout: 180000 },
      );
      await page.getByTestId("battle-result").waitFor();
      await page
        .getByRole("button", { name: "YENİ MAÇ →", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="battle-viewport"]')?.dataset
            .ready === "true" &&
          document.querySelector('[data-testid="battle-arena"]')?.dataset
            .phase === "plane",
        {},
        { timeout: 120000 },
      );
      assert.equal(
        await page.getByTestId("battle-health").textContent(),
        "100",
      );
      assert.equal(await page.getByTestId("battle-result").count(), 0);
      assert.equal(
        await page.getByTestId("battle-viewport").locator("canvas").count(),
        1,
      );
      passed(
        "accelerated natural match completion, result screen and clean fresh match",
      );
    } else {
      page = await browser.newPage({ viewport: { width: 900, height: 650 } });
      watch();
      await page.addInitScript(() => {
        window.__battleDrawCalls = 0;
        for (const Type of [
          window.WebGLRenderingContext,
          window.WebGL2RenderingContext,
        ]) {
          if (!Type) continue;
          for (const name of [
            "drawArrays",
            "drawElements",
            "drawArraysInstanced",
            "drawElementsInstanced",
            "drawRangeElements",
          ]) {
            const original = Type.prototype[name];
            if (original)
              Type.prototype[name] = function (...args) {
                window.__battleDrawCalls++;
                return original.apply(this, args);
              };
          }
        }
      });
      await ready();
      await page
        .getByRole("button", { name: "Oyun ayarları", exact: true })
        .click();
      await page.getByLabel("Grafik kalitesi").selectOption("low");
      assert.ok((await draws()) > 0, "The scene must issue real WebGL draws");
      await still();
      passed(
        "production WebGL scene opens and paused settings stop repeated rendering",
      );
      for (const quality of ["medium", "high", "ultra", "low"]) {
        const before = await draws();
        await page.getByLabel("Grafik kalitesi").selectOption(quality);
        await page.waitForFunction(
          (count) => window.__battleDrawCalls > count,
          before,
          { timeout: 60000 },
        );
        await still();
        assert.equal(
          await page.getByTestId("battle-arena").getAttribute("data-quality"),
          quality,
        );
      }
      const beforeResize = await draws();
      await page.setViewportSize({ width: 920, height: 650 });
      await page.waitForFunction(
        (count) => window.__battleDrawCalls > count,
        beforeResize,
      );
      await still();
      for (const difficulty of ["easy", "normal", "hard", "insane", "easy"])
        await page.getByLabel("Rakiplerin zorluğu").selectOption(difficulty);
      await page.locator("#battle-volume").fill("0.25");
      assert.equal(await page.locator("#battle-volume").inputValue(), "0.25");
      passed(
        "all quality/difficulty settings work and paused resize redraws without resuming",
      );
      await page
        .getByRole("button", { name: "Ayarları kapat", exact: true })
        .click();
      // A hidden tab must pause before the initial plane silently auto-deploys.
      await page.evaluate(() => {
        // Native tab switches release pointer lock. A synthetic visibility event
        // alone does not, leaving automation clicks pinned at the old cursor.
        if (document.pointerLockElement) document.exitPointerLock();
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await still();
      assert.equal(
        await page.getByTestId("battle-arena").getAttribute("data-phase"),
        "plane",
      );
      await page.evaluate(() => {
        delete document.hidden;
        if (document.pointerLockElement) document.exitPointerLock();
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForFunction(() => !document.pointerLockElement);
      await page.getByTestId("battle-jump").click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="battle-arena"]')?.dataset
            .phase === "combat",
        {},
        { timeout: 120000 },
      );
      passed("hidden-tab flight pauses; player can resume, parachute and land");
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("KeyE");
        await page.waitForTimeout(200);
      }
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="battle-weapon"]')
            ?.textContent?.trim() === "M4 CARBINE" &&
          Number(
            document.querySelector('[data-testid="battle-ammo"]')?.textContent,
          ) === 30,
        {},
        { timeout: 60000 },
      );
      const ammo = 30;
      console.log(
        JSON.stringify({
          beforeFire: await page.evaluate(() => ({
            ammo: document.querySelector('[data-testid="battle-ammo"]')
              ?.textContent,
            weapon: document.querySelector('[data-testid="battle-weapon"]')
              ?.textContent,
            locked: !!document.pointerLockElement,
            resumeVisible: [...document.querySelectorAll("button")].some(
              (button) => button.textContent.includes("DEVAM ET"),
            ),
            phase: document.querySelector('[data-testid="battle-arena"]')
              ?.dataset.phase,
          })),
          sampledAmmo: ammo,
        }),
      );
      await page.mouse.down({ button: "left" });
      await page.waitForTimeout(180);
      await page.mouse.up({ button: "left" });
      await page.waitForFunction(
        (oldAmmo) =>
          Number(
            document.querySelector('[data-testid="battle-ammo"]').textContent,
          ) < oldAmmo,
        ammo,
        { timeout: 60000 },
      );
      await page.keyboard.press("KeyR");
      await page.waitForFunction(
        (oldAmmo) =>
          Number(
            document.querySelector('[data-testid="battle-ammo"]').textContent,
          ) === oldAmmo,
        ammo,
        { timeout: 60000 },
      );
      await page.mouse.down({ button: "right" });
      await page.locator('[class*="adsCrosshair"]').waitFor({ timeout: 60000 });
      await page.mouse.up({ button: "right" });
      await page.keyboard.press("KeyB");
      await page.getByRole("button", { name: /Sis bombası/ }).waitFor();
      await page.keyboard.press("KeyG");
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent.includes("Sis bombası") &&
            button.querySelector("b")?.textContent === "2",
        ),
      );
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /DEVAM ET/ }).waitFor();
      await still();
      await page.screenshot({ path: path.join(output, "combat-paused.png") });
      await page.getByRole("button", { name: /DEVAM ET/ }).click();
      const resumeDraws = await draws();
      await page.waitForFunction(
        (count) => window.__battleDrawCalls > count,
        resumeDraws,
      );
      passed(
        "loot, held mouse firing, reload, ADS, smoke grenade and combat pause/resume",
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("link", { name: "← Arenadan çık", exact: true })
        .click();
      await page.waitForURL(`${base}/`);
      assert.equal(await page.getByTestId("battle-viewport").count(), 0);
      passed("arena exit removes the game view");
      await page.close();
      page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      });
      watch();
      await ready();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page
        .getByRole("button", { name: "Oyun ayarları", exact: true })
        .tap();
      await page.getByLabel("Grafik kalitesi").selectOption("low");
      await page
        .getByRole("button", { name: "Ayarları kapat", exact: true })
        .tap();
      await page.getByTestId("battle-jump").tap();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="battle-arena"]')?.dataset
            .phase === "drop",
      );
      await page.screenshot({ path: path.join(output, "mobile-drop.png") });
      passed("mobile scene, fitted layout, settings and touch deployment");
    }
    assert.deepEqual(errors, []);
    const result = {
      result: "passed",
      mode: lifecycle
        ? "accelerated simulation without GPU draws"
        : "real WebGL",
      checks,
      errors,
    };
    writeFileSync(
      path.join(output, lifecycle ? "lifecycle-results.json" : "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    writeFileSync(
      path.join(output, "failure-results.json"),
      JSON.stringify(
        { result: "failed", checks, errors, failure: String(error) },
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
