/* Real production UI checks for the visual/settings release. Requires the
   Next server, Color Hide WS server, Playwright on NODE_PATH and Chromium.
   No renderer, clock, simulation or socket mocks; screenshots use real draws.
   VISUAL_COLOR_ONLY=1 reruns Color Hide preferences and room cleanup.
   VISUAL_SCENERY_ONLY=1 checks actual Battle landing plus mobile Europa layers. */
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const base = process.env.VISUAL_BASE_URL || "http://localhost:3000";
const output = process.env.VISUAL_ARTIFACT_DIR || "/tmp/xarmy-visual-upgrade";
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.VISUAL_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const checks = [],
    errors = [],
    contexts = [];
  let active;
  const passed = (name) => {
    checks.push(name);
    console.log(JSON.stringify({ passed: name }));
  };
  const waitFor = async (predicate, label, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error(`Timed out: ${label}`);
  };
  const open = async (mobile = false) => {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 860 },
      ...(mobile
        ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
        : {}),
      serviceWorkers: "block",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) =>
      errors.push({ url: page.url(), message: error.message }),
    );
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /THREE\.WebGLProgram|Shader Error|VALIDATE_STATUS|GL_INVALID|WebGL: INVALID|Error creating WebGL context/i.test(
          message.text(),
        )
      )
        errors.push({ url: page.url(), message: message.text() });
    });
    active = page;
    return page;
  };
  const shot = async (page, name) =>
    page.screenshot({
      path: path.join(output, `${name}.png`),
      fullPage: false,
      timeout: 30000,
    });
  const fits = async (page) =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Page should fit the viewport horizontally",
    );
  try {
    let page;
    if (process.env.VISUAL_SCENERY_ONLY === "1") {
      page = await open();
      await page.setViewportSize({ width: 960, height: 650 });
      await page.goto(`${base}/play`, { timeout: 60000 });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="battle-viewport"]')?.dataset
            .ready === "true",
        {},
        { timeout: 120000 },
      );
      await page
        .getByRole("button", { name: "Oyun ayarları", exact: true })
        .click();
      await page
        .getByLabel("Grafik kalitesi", { exact: true })
        .selectOption("low");
      await page
        .getByLabel("Rakiplerin zorluğu", { exact: true })
        .selectOption("easy");
      await page
        .getByRole("button", { name: "Ayarları kapat", exact: true })
        .click();
      await page.evaluate(() => document.exitPointerLock?.());
      await page.waitForFunction(() => !document.pointerLockElement);
      if (
        (await page.getByTestId("battle-arena").getAttribute("data-phase")) ===
        "plane"
      )
        await page.getByTestId("battle-jump").click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="battle-arena"]')?.dataset
            .phase === "combat",
        {},
        { timeout: 120000 },
      );
      await page.getByTestId("battle-viewport").click();
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(2000);
      await page.keyboard.up("KeyW");
      await page.evaluate(() => document.exitPointerLock?.());
      await page.waitForFunction(() => !document.pointerLockElement);
      await page
        .getByRole("button", { name: "Oyun ayarları", exact: true })
        .click();
      await page
        .getByLabel("Grafik kalitesi", { exact: true })
        .selectOption("high");
      await page
        .getByRole("button", { name: "Ayarları kapat", exact: true })
        .click();
      await page.evaluate(() => document.exitPointerLock?.());
      await shot(page, "battle-ground-high");
      passed(
        "Battle Royale actual jump, parachute landing, ground movement and high-quality scene render without shader/runtime errors",
      );
      await page.context().close();

      page = await open(true);
      await page.goto(`${base}/games/europa-war`);
      await page.getByRole("button", { name: /SEFERİ BAŞLAT/ }).click();
      await page.getByTestId("war-map").waitFor();
      const closePanel = page.getByRole("button", {
        name: "Yönetim panelini kapat",
        exact: true,
      });
      if (await closePanel.isVisible()) await closePanel.click();
      await page
        .getByRole("button", { name: "Başkentime git", exact: true })
        .click();
      const relief = page.getByRole("button", { name: /Kabartma/ });
      await relief.click();
      assert.equal(await page.getByTestId("terrain-overlay").count(), 0);
      await relief.click();
      await page.getByTestId("terrain-overlay").waitFor();
      await page.getByRole("button", { name: /Birlik durumu/ }).click();
      await page.getByRole("button", { name: /Birlik durumu/ }).click();
      await fits(page);
      await shot(page, "europa-mobile-map");
      passed(
        "mobile Europa map layer buttons remain clickable after dismissing the army panel",
      );
      assert.deepEqual(errors, []);
      writeFileSync(
        path.join(output, "report.json"),
        JSON.stringify(
          {
            result: "passed",
            base,
            checks,
            errors,
            testedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (process.env.VISUAL_COLOR_ONLY !== "1") {
      page = await open();
      await page.goto(base);
      for (const href of [
        "/play",
        "/games/chess",
        "/games/europa-war",
        "/games/color-hide",
      ])
        assert.ok(
          await page.locator(`main a[href="${href}"]`).count(),
          `Gallery links to ${href}`,
        );
      await fits(page);
      await shot(page, "gallery-desktop");
      passed(
        "desktop gallery links to all four playable games and fits the viewport",
      );
      await page.context().close();

      page = await open(true);
      await page.goto(base);
      await fits(page);
      await shot(page, "gallery-mobile");
      const menu = page.getByRole("button", {
        name: "Oyun menüsünü aç",
        exact: true,
      });
      await menu.click();
      const mobileNav = page.getByRole("navigation", {
        name: "Mobil oyun menüsü",
        exact: true,
      });
      await mobileNav
        .getByRole("link", { name: "Satranç", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await mobileNav.isVisible(), false);
      await menu.click();
      await mobileNav
        .getByRole("link", { name: "Ana sayfa", exact: true })
        .click();
      assert.equal(await mobileNav.isVisible(), false);
      await page.locator("#oyunlar").scrollIntoViewIfNeeded();
      await shot(page, "gallery-mobile-cards");
      passed(
        "mobile gallery fits without horizontal overflow; navigation opens, closes with Escape and follows links",
      );
      await page.context().close();

      page = await open();
      await page.goto(`${base}/games/chess`);
      const board = page.getByTestId("chess-board");
      await board.waitFor();
      const fen = await board.getAttribute("data-fen");
      const initial = await board.boundingBox();
      await page
        .getByRole("button", { name: "Tahta görünümü", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Tahta görünümü",
        exact: true,
      });
      await dialog
        .getByRole("button", { name: "Ceviz teması", exact: true })
        .click();
      await dialog
        .getByRole("checkbox", { name: /Kare koordinatları/ })
        .uncheck();
      await dialog
        .getByRole("checkbox", { name: /Yumuşak taş hareketleri/ })
        .uncheck();
      await dialog.getByRole("button", { name: "Tamam", exact: true }).click();
      assert.equal(await board.getAttribute("data-theme"), "walnut");
      assert.equal(await board.getAttribute("data-fen"), fen);
      const after = await board.boundingBox();
      assert.ok(
        Math.abs(initial.width - after.width) < 1 &&
          Math.abs(initial.height - after.height) < 1,
        "Appearance changes preserve board geometry",
      );
      await page.reload();
      await board.waitFor();
      await waitFor(
        async () => (await board.getAttribute("data-theme")) === "walnut",
        "persisted walnut theme",
      );
      await page
        .getByRole("button", { name: "Tahta görünümü", exact: true })
        .click();
      assert.equal(
        await dialog
          .getByRole("checkbox", { name: /Kare koordinatları/ })
          .isChecked(),
        false,
      );
      assert.equal(
        await dialog
          .getByRole("checkbox", { name: /Yumuşak taş hareketleri/ })
          .isChecked(),
        false,
      );
      await dialog
        .getByRole("button", { name: "Gece teması", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await waitFor(
        () => dialog.isHidden(),
        "Escape closes native chess dialog",
      );
      await shot(page, "chess-desktop");
      await page.setViewportSize({ width: 390, height: 844 });
      await fits(page);
      await board.scrollIntoViewIfNeeded();
      const mobileBoard = await board.boundingBox();
      assert.ok(
        Math.abs(mobileBoard.width - mobileBoard.height) < 2,
        "Mobile chess board remains square",
      );
      await shot(page, "chess-mobile");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page
        .getByRole("button", { name: "Tahta görünümü", exact: true })
        .click();
      await waitFor(
        () =>
          dialog
            .getByRole("checkbox", { name: /Yumuşak taş hareketleri/ })
            .isDisabled(),
        "reduced-motion preference disables animation",
      );
      assert.equal(
        await dialog
          .getByRole("checkbox", { name: /Yumuşak taş hareketleri/ })
          .isChecked(),
        false,
      );
      passed(
        "chess themes, coordinates and animation preferences persist; board/FEN stay stable and reduced-motion is honored",
      );
      await page.context().close();

      page = await open();
      await page.goto(`${base}/games/europa-war`);
      await page.getByRole("button", { name: /SEFERİ BAŞLAT/ }).click();
      await page.getByTestId("war-map").waitFor();
      const relief = page.getByRole("button", { name: /Kabartma/ });
      const readiness = page.getByRole("button", { name: /Birlik durumu/ });
      assert.equal(await relief.getAttribute("aria-pressed"), "true");
      await relief.click();
      assert.equal(await page.getByTestId("terrain-overlay").count(), 0);
      await relief.click();
      await page.getByTestId("terrain-overlay").waitFor();
      const army = page.getByTestId("war-map").locator("[data-army]").first();
      await army.waitFor();
      await army.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", { name: "Seçili tümenlere git", exact: true })
        .click();
      await waitFor(
        async () => (await page.locator("[data-army-readiness]").count()) > 0,
        "selected army readiness badge",
      );
      await readiness.click();
      assert.equal(await page.locator("[data-army-readiness]").count(), 0);
      await readiness.click();
      await shot(page, "europa-desktop");
      await page.setViewportSize({ width: 390, height: 844 });
      await fits(page);
      await page.getByTestId("war-map").scrollIntoViewIfNeeded();
      await shot(page, "europa-mobile");
      passed(
        "Europa relief and army-status layers toggle, selected divisions can be focused, and map stays usable at mobile size",
      );
      await page.context().close();

      page = await open();
      await page.setViewportSize({ width: 900, height: 650 });
      await page.goto(`${base}/play`, { timeout: 60000 });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="battle-viewport"]')?.dataset
            .ready === "true",
        {},
        { timeout: 120000 },
      );
      assert.equal(
        await page.getByTestId("battle-viewport").locator("canvas").count(),
        1,
      );
      await page
        .getByRole("button", { name: "Oyun ayarları", exact: true })
        .click();
      for (const quality of ["low", "high", "ultra", "low"]) {
        await page
          .getByLabel("Grafik kalitesi", { exact: true })
          .selectOption(quality);
        await page.waitForFunction(
          (value) =>
            document.querySelector('[data-testid="battle-arena"]')?.dataset
              .quality === value,
          quality,
          { timeout: 60000 },
        );
      }
      await page
        .getByRole("button", { name: "Ayarları kapat", exact: true })
        .click();
      await page.evaluate(() => document.exitPointerLock?.());
      await shot(page, "battle-desktop");
      passed(
        "Battle Royale creates a real WebGL scene and switches low/high/ultra quality without runtime errors",
      );
      await page.context().close();
    }
    const clients = [];
    for (const name of ["Ada", "Bora"]) {
      const target = await open(true);
      const client = { name, page: target, room: null };
      clients.push(client);
      target.on("websocket", (socket) =>
        socket.on("framereceived", ({ payload }) => {
          try {
            const data = JSON.parse(payload.toString());
            if (data.type === "snapshot") client.room = data.room;
          } catch {}
        }),
      );
      await target.goto(`${base}/games/color-hide`);
      await target.getByLabel("Oyuncu adı", { exact: true }).fill(name);
    }
    const [host, guest] = clients;
    await host.page.getByRole("button", { name: /Oda oluştur/ }).click();
    await waitFor(
      () => host.room?.phase === "lobby",
      "Color Hide real room creation",
    );
    await guest.page
      .getByLabel("Oda kodu", { exact: true })
      .fill(host.room.code);
    await guest.page
      .getByRole("button", { name: "Katıl →", exact: true })
      .click();
    await waitFor(
      () => guest.room?.players.length === 2,
      "second independent Color Hide client",
    );
    for (const client of clients) {
      await client.page.getByRole("button", { name: /^Orman/ }).click();
      await client.page
        .getByRole("button", { name: "Hazırım", exact: true })
        .click();
    }
    await waitFor(
      () => host.room.players.every((p) => p.ready),
      "both clients ready",
    );
    await host.page
      .getByRole("button", { name: "Zarı at ve başlat", exact: true })
      .click();
    await waitFor(
      () => clients.every((c) => c.room?.phase === "hiding"),
      "normal draw completes",
    );
    const hider = clients.find(
      (c) => c.room.players.find((p) => p.id === c.room.you).team === "hider",
    );
    page = hider.page;
    active = page;
    const ownPlayer = () =>
      hider.room.players.find((p) => p.id === hider.room.you);
    const startPosition = { ...ownPlayer().position };
    await page.getByLabel("Color Hide 3D oyun alanı", { exact: true }).focus();
    await page.keyboard.down("KeyW");
    await waitFor(
      () =>
        Math.hypot(
          ownPlayer().position.x - startPosition.x,
          ownPlayer().position.z - startPosition.z,
        ) > 0.3,
      "normal movement before opening settings",
    );
    await page
      .getByRole("button", { name: "Oyun ayarlarını aç", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Oyun ayarları",
      exact: true,
    });
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
    const stopped = { ...ownPlayer().position };
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(500);
    await page.keyboard.up("KeyW");
    assert.ok(
      Math.hypot(
        ownPlayer().position.x - stopped.x,
        ownPlayer().position.z - stopped.z,
      ) < 0.05,
      "Settings dialog blocks movement and clears held keys",
    );
    await settings
      .getByLabel("Görüntü kalitesi", { exact: true })
      .selectOption("low");
    await settings.getByLabel("Kamera", { exact: true }).selectOption("first");
    await settings.locator("#color-sensitivity").fill("1.4");
    await settings.getByRole("checkbox", { name: /Oyun sesleri/ }).uncheck();
    await fits(page);
    await shot(page, "color-settings-mobile");
    await settings
      .getByRole("button", { name: "Oyuna dön", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Oyun ayarlarını aç", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Oyun ayarlarını aç", exact: true })
      .click();
    assert.equal(
      await settings
        .getByLabel("Görüntü kalitesi", { exact: true })
        .inputValue(),
      "low",
    );
    assert.equal(
      await settings.getByLabel("Kamera", { exact: true }).inputValue(),
      "first",
    );
    assert.equal(
      await settings.locator("#color-sensitivity").inputValue(),
      "1.4",
    );
    assert.equal(
      await settings
        .getByRole("checkbox", { name: /Oyun sesleri/ })
        .isChecked(),
      false,
    );
    await settings.getByLabel("Kamera", { exact: true }).selectOption("third");
    await settings
      .getByLabel("Görüntü kalitesi", { exact: true })
      .selectOption("high");
    await settings
      .getByRole("button", { name: "Oyuna dön", exact: true })
      .click();
    await shot(page, "color-forest-mobile");
    passed(
      "two real Color Hide players join and start; settings block movement and mobile quality, camera, sensitivity and sound preferences survive reload/resume",
    );
    for (const [index, client] of clients.entries()) {
      if (index > 0)
        await waitFor(
          () => client.room.phase === "finished",
          "departure ends the two-person round",
        );
      const leave = client.page.getByRole("button", {
        name: "Odadan ayrıl",
        exact: true,
      });
      if (!(await leave.isVisible().catch(() => false)))
        await client.page
          .getByRole("button", { name: "Çık", exact: true })
          .click();
      await leave.click();
      await client.page.getByLabel("Oyuncu adı", { exact: true }).waitFor();
      await client.page.context().close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          result: "passed",
          base,
          checks,
          errors,
          testedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { checks, errors, failure: String(error.stack || error) },
        null,
        2,
      ),
    );
    if (active && !active.isClosed())
      await shot(active, "failure").catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
