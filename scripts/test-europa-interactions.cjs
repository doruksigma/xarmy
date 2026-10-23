/* Browser regressions for compositor camera gestures and paginated army commands.
   Run against a fresh production build; fixtures enter through the public save import.
   NODE_PATH=<playwright modules> node scripts/test-europa-interactions.cjs
   Optional: EUROPA_BASE_URL, EUROPA_CHROMIUM, EUROPA_ARTIFACT_DIR. */
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
  MAP,
} = require("../app/games/europa-war/strategy/world.ts");
const { declareWar } = require("../app/games/europa-war/strategy/diplomacy.ts");
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output =
  process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-interactions";
mkdirSync(output, { recursive: true });
const count = 96;
const regionBounds = MAP.provinces.map((p) => {
  const numbers = p.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0),
    ys = numbers.filter((_, i) => i % 2 === 1);
  return {
    id: p.id,
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
});
function fixture() {
  const world = createWorld("germany", "historical", 1936, "normal");
  declareWar(world, "germany", "poland");
  const origin = MAP.provinces.find(
    (p) =>
      p.country === "germany" &&
      p.neighbors.some((n) => !n.sea && GEOGRAPHY[n.id].country === "poland") &&
      p.neighbors.some((n) => !n.sea && GEOGRAPHY[n.id].country === "germany"),
  ).id;
  const destination = GEOGRAPHY[origin].neighbors.find(
    (n) => !n.sea && GEOGRAPHY[n.id].country === "germany",
  ).id;
  const enemy = GEOGRAPHY[origin].neighbors.find(
    (n) => !n.sea && GEOGRAPHY[n.id].country === "poland",
  ).id;
  world.armies = world.armies.filter((army) => army.country !== world.player);
  const armies = Array.from({ length: count }, (_, i) => {
    const army = addArmy(world, world.player, origin);
    army.name = `Denetim ${String(i + 1).padStart(3, "0")}`;
    return army;
  });
  return {
    world: decodeSave(encodeSave(world)),
    origin,
    destination,
    enemy,
    armies,
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
      serviceWorkers: "block",
    });
    // Observe the public canvas API, not application state. Comparing only href
    // would miss repeatedly rasterizing identical pixels into the same PNG.
    await context.addInitScript(() => {
      window.__europaMinimapRasterizations = 0;
      const encode = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const ratio = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
        if (
          args[0] === "image/png" &&
          this.width === Math.ceil(144 * ratio) &&
          this.height === Math.ceil(96 * ratio)
        )
          window.__europaMinimapRasterizations++;
        return Reflect.apply(encode, this, args);
      };
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error") consoleErrors.push(entry.text());
    });
    const data = fixture();
    let selectedId = data.world.countries[data.world.player].capital;
    const map = () => page.getByTestId("war-map");
    const tab = (name) => page.locator(`button[title="${name}"]`).click();
    const groupCard = () =>
      page.getByTestId("army-selection-count").locator("..");
    const attackCard = () =>
      page.locator("details").filter({
        has: page.locator("summary", { hasText: "Birlikte taarruz planla" }),
      });
    const readView = () =>
      map()
        .getAttribute("viewBox")
        .then((s) => s.split(" ").map(Number));
    const settle = async (before) => {
      await page.waitForFunction((old) => {
        const svg = document.querySelector('[data-testid="war-map"]');
        return (
          svg &&
          !svg.style.transform &&
          !svg.style.willChange &&
          (!old || svg.getAttribute("viewBox") !== old)
        );
      }, before?.join(" "));
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    };
    const expectSelection = async (n) =>
      page.waitForFunction(
        (n) =>
          document.querySelector('[data-testid="army-selection-count"]')
            ?.textContent === `${n} tümen seçili`,
        n,
      );
    const load = async (world = data.world) => {
      await tab("Kayıtlar");
      await page.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: "interaction-audit.json",
        mimeType: "application/json",
        buffer: Buffer.from(encodeSave(world)),
      });
      await page
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .waitFor();
      selectedId = world.countries[world.player].capital;
      await settle();
    };
    const minimapSnapshot = async () => {
      const backdrop = page.getByTestId("minimap-backdrop");
      await backdrop.waitFor({ state: "attached" });
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="minimap-backdrop"]')
          ?.getAttribute("href")
          ?.startsWith("data:image/png"),
      );
      return {
        href: await backdrop.getAttribute("href"),
        rasterizations: await page.evaluate(
          () => window.__europaMinimapRasterizations,
        ),
      };
    };
    const expectSameBackdrop = async (previous, label) => {
      const next = await minimapSnapshot();
      assert.equal(
        next.href,
        previous.href,
        `${label}: backdrop pixels stay valid`,
      );
      assert.equal(
        next.rasterizations,
        previous.rasterizations,
        `${label}: unchanged backdrop must not be rasterized again`,
      );
    };
    const save = async () => {
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
      selectedId = id;
      await settle();
    };
    // Find an exposed point INSIDE a polygon. Its bounding box may contain sea,
    // another province or a military counter; locator.click() would be ambiguous.
    const provincePoint = async (id) =>
      page.locator(`[data-province="${id}"]`).evaluate((el, region) => {
        const matrix = el.getScreenCTM(),
          box = el.getBBox();
        const candidates = [{ x: region.x, y: region.y }];
        for (let row = 1; row < 30; row++)
          for (let col = 1; col < 30; col++)
            candidates.push({
              x: box.x + (box.width * col) / 30,
              y: box.y + (box.height * row) / 30,
            });
        for (const p of candidates) {
          if (!el.isPointInFill(new DOMPoint(p.x, p.y))) continue;
          const screen = new DOMPoint(p.x, p.y).matrixTransform(matrix);
          if (
            document
              .elementFromPoint(screen.x, screen.y)
              ?.closest("[data-province]")
              ?.getAttribute("data-province") === region.id
          )
            return { x: screen.x, y: screen.y };
        }
        return null;
      }, GEOGRAPHY[id]);
    const clickProvince = async (id) => {
      const p = await provincePoint(id);
      assert.ok(p, `Province ${id} needs an exposed clickable interior`);
      await page.mouse.click(p.x, p.y);
    };
    const verifyLabels = async () => {
      const selected = selectedId;
      const capitals = new Set(
        Object.values(data.world.countries).map((c) => c.capital),
      );
      const labels = await page
        .locator("[data-city-label]")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-city-label")),
        );
      assert.deepEqual(
        labels.filter((id) => id !== selected && !capitals.has(id)),
        [],
        "Only capitals and selected city can have names",
      );
    };
    // Check actual visible world bounds, including the live CSS transform. This
    // catches holes while dragging, not just after React reconciles the camera.
    const verifyCoverage = async (label) => {
      const result = await map().evaluate((svg, bounds) => {
        const rect = svg.parentElement.getBoundingClientRect(),
          inverse = svg.getScreenCTM().inverse();
        const a = new DOMPoint(rect.left, rect.top).matrixTransform(inverse),
          b = new DOMPoint(rect.right, rect.bottom).matrixTransform(inverse);
        const mounted = new Set(
          [...svg.querySelectorAll("[data-province]")].map((el) =>
            el.getAttribute("data-province"),
          ),
        );
        const expected = bounds.filter(
          (p) =>
            p.right >= a.x && p.left <= b.x && p.bottom >= a.y && p.top <= b.y,
        );
        return {
          expected: expected.length,
          mounted: mounted.size,
          missing: expected.filter((p) => !mounted.has(p.id)).map((p) => p.id),
        };
      }, regionBounds);
      assert.ok(result.expected > 0, `${label}: viewport must include land`);
      assert.deepEqual(
        result.missing,
        [],
        `${label}: visible provinces must remain mounted`,
      );
      return result;
    };
    const verifyNoAccidentalSelection = async (label) => {
      const selected = await map()
        .locator('[data-province][tabindex="0"]')
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-province")),
        );
      assert.ok(
        selected.length <= 1 && selected.every((id) => id === selectedId),
        `${label}: gesture must not select an unintended city`,
      );
    };
    const selectVisible = async (label) => {
      const before = selectedId;
      const visible = await map()
        .locator("[data-province]")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-province")),
        );
      let id, p;
      for (const candidate of visible) {
        if (candidate === before) continue;
        const point = await provincePoint(candidate);
        if (point) {
          id = candidate;
          p = point;
          break;
        }
      }
      assert.ok(p, `${label}: a visible province should be selectable`);
      await page.mouse.click(p.x, p.y);
      await page.locator(`[data-province="${id}"][tabindex="0"]`).waitFor();
      selectedId = id;
      await verifyLabels();
      checks.push(
        `${label}: real polygon click selects ${GEOGRAPHY[id].name} after camera settles`,
      );
    };
    const surfacePoint = async () =>
      map().evaluate((svg) => {
        const r = svg.parentElement.getBoundingClientRect();
        for (const fy of [0.55, 0.45, 0.65, 0.35])
          for (const fx of [0.5, 0.6, 0.4, 0.7]) {
            const x = r.left + r.width * fx,
              y = r.top + r.height * fy;
            const el = document.elementFromPoint(x, y);
            if (el && svg.contains(el) && !el.closest("[data-army-stack]"))
              return { x, y };
          }
        return null;
      });
    const worldPoint = (point) =>
      map().evaluate((svg, p) => {
        const world = new DOMPoint(p.x, p.y).matrixTransform(
          svg.getScreenCTM().inverse(),
        );
        return { x: world.x, y: world.y };
      }, point);
    const expectAnchor = async (world, screen, label) => {
      const drift = await map().evaluate(
        (svg, { world, screen }) => {
          const result = new DOMPoint(world.x, world.y).matrixTransform(
            svg.getScreenCTM(),
          );
          return Math.hypot(result.x - screen.x, result.y - screen.y);
        },
        { world, screen },
      );
      assert.ok(
        drift < 2,
        `${label}: map anchor drifted ${drift.toFixed(2)} CSS pixels`,
      );
    };
    const pinch = async ({
      zoomOut = false,
      translateX = 0,
      translateY = 0,
      center: requestedCenter,
    } = {}) => {
      const center = requestedCenter ?? (await surfacePoint());
      assert.ok(center, "Pinch center must be exposed");
      const session = await context.newCDPSession(page);
      const points = (distance, fraction = 0) =>
        [0, 1].map((id) => ({
          x: center.x + (id ? 1 : -1) * distance + translateX * fraction,
          y: center.y + translateY * fraction,
          id,
          radiusX: 2,
          radiusY: 2,
          force: 1,
        }));
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: points(zoomOut ? 72 : 48).slice(0, 1),
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: points(zoomOut ? 72 : 48),
      });
      const distances = zoomOut ? [66, 60, 54, 48] : [54, 60, 66, 72];
      for (const [index, distance] of distances.entries()) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: points(distance, (index + 1) / distances.length),
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await verifyCoverage(
          zoomOut ? "during translated pinch zoom-out" : "during pinch zoom-in",
        );
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await session.detach();
    };
    const verifyAnchoredWheel = async (label) => {
      const anchor = await surfacePoint();
      assert.ok(anchor, `${label}: wheel anchor must be exposed`);
      const world = await worldPoint(anchor),
        previous = await readView();
      await page.mouse.move(anchor.x, anchor.y);
      await page.mouse.wheel(0, -70);
      await settle(previous);
      assert.ok(
        (await readView())[2] < previous[2],
        `${label}: wheel zooms in`,
      );
      await expectAnchor(world, anchor, label);
      await verifyCoverage(label);
      await verifyNoAccidentalSelection(label);
    };
    const verifyAnchoredPinch = async (label) => {
      const center = await surfacePoint();
      assert.ok(center, `${label}: pinch anchor must be exposed`);
      const world = await worldPoint(center),
        previous = await readView();
      await pinch({ center });
      await settle(previous);
      assert.ok(
        (await readView())[2] < previous[2],
        `${label}: pinch zooms in`,
      );
      await expectAnchor(world, center, label);
      await verifyCoverage(label);
      await verifyNoAccidentalSelection(label);
    };
    const resizeMap = async (viewport, label) => {
      const previous = await readView();
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const svg = document.querySelector('[data-testid="war-map"]');
        const camera = svg.viewBox.baseVal;
        const box = svg.parentElement.getBoundingClientRect();
        return (
          Math.abs(camera.width / camera.height - box.width / box.height) <
          0.002
        );
      });
      await settle(previous);
      const camera = await readView();
      assert.ok(
        camera.every(Number.isFinite),
        `${label}: finite camera coordinates`,
      );
      await verifyCoverage(label);
    };

    await page.goto(`${base}/games/europa-war`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await load();
    const originalBackdrop = await minimapSnapshot();
    assert.ok(
      originalBackdrop.rasterizations > 0,
      "Chromium must rasterize the minimap",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Küçük haritada konuma git", exact: true })
        .locator("path")
        .count(),
      0,
      "The raster minimap must not retain hundreds of SVG province paths",
    );
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await settle();
    const outlineScales = [];
    for (let level = 0; level < 3; level++) {
      await map().focus();
      await page.keyboard.press("Tab");
      await page.waitForFunction((id) => {
        const active = document.activeElement;
        return (
          active?.getAttribute("data-province") === id &&
          active.matches(":focus-visible")
        );
      }, selectedId);
      const outline = await map().evaluate((svg) => {
        const province = document.activeElement;
        const style = getComputedStyle(province),
          matrix = province.getScreenCTM();
        const scale = Math.hypot(matrix.a, matrix.b);
        const pixels =
          parseFloat(style.strokeWidth) *
          (style.vectorEffect === "non-scaling-stroke" ? 1 : scale);
        const fixedStrokes = [
          ...svg.querySelectorAll("[data-province]"),
        ].filter(
          (el) => getComputedStyle(el).vectorEffect === "non-scaling-stroke",
        ).length;
        return { pixels, scale, fixedStrokes };
      });
      assert.ok(
        Math.abs(outline.pixels - 3) < 0.05,
        `Keyboard focus outline must stay 3 CSS pixels at zoom ${level}; got ${outline.pixels}`,
      );
      assert.equal(
        outline.fixedStrokes,
        1,
        "Only the keyboard-focused province needs a non-scaling outline",
      );
      outlineScales.push(outline.scale);
      if (level < 2) {
        const previous = await readView();
        await page
          .getByRole("button", { name: "Haritayı yakınlaştır", exact: true })
          .click();
        await settle(previous);
      }
    }
    assert.ok(
      Math.max(...outlineScales) / Math.min(...outlineScales) > 1.5,
      "Keyboard outline test must exercise substantially different map scales",
    );
    checks.push(
      "Keyboard Tab focus keeps a 3 CSS-pixel province outline at three zoom levels; all other province strokes retain normal rendering",
    );
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await settle();
    let before = await readView();
    const start = await surfacePoint();
    assert.ok(start);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 95, start.y + 45, { steps: 12 });
    // A held pointer must keep the compositor transform active: an idle debounce
    // would force expensive map reconciliation in the middle of a slow gesture.
    await page.waitForTimeout(300);
    assert.deepEqual(
      await readView(),
      before,
      "A small held-pointer drag must not prematurely commit its camera",
    );
    assert.ok(
      await map().evaluate((svg) => !!svg.style.transform),
      "Held-pointer drag must remain visibly transformed",
    );
    await verifyCoverage("during pointer drag");
    await page.mouse.up();
    await settle(before);
    let after = await readView();
    assert.equal(after[2], before[2], "Dragging must not change zoom");
    assert.ok(Math.abs(after[0] - before[0]) > 10, "Dragging must move camera");
    await verifyNoAccidentalSelection("pointer drag");
    await verifyCoverage("after pointer drag");
    await selectVisible("pointer drag");
    for (const direction of [1, -1, 1, -1]) {
      const anchor = await surfacePoint();
      before = await readView();
      await page.mouse.move(anchor.x, anchor.y);
      await page.mouse.down();
      await page.mouse.move(
        anchor.x + direction * 180,
        anchor.y - direction * 60,
        { steps: 16 },
      );
      await verifyCoverage("repeated live pointer drag");
      await page.mouse.up();
      await settle(before);
      await verifyNoAccidentalSelection("repeated pointer drag");
      await verifyCoverage("repeated settled pointer drag");
    }
    await selectVisible("four repeated drags");

    // Separate wheel notches can arrive well after a short frame debounce. Keep
    // their visible movement immediate without rebuilding SVG between notches.
    await map().focus();
    before = await readView();
    const slowWheelPoint = await surfacePoint();
    assert.ok(
      slowWheelPoint,
      "Slow wheel anchor must be inside the exposed map",
    );
    const slowWheelWorld = await worldPoint(slowWheelPoint);
    await page.mouse.move(slowWheelPoint.x, slowWheelPoint.y);
    for (let notch = 1; notch <= 2; notch++) {
      await page.mouse.wheel(0, -20);
      await page.waitForTimeout(300);
      assert.deepEqual(
        await readView(),
        before,
        `Slow wheel notch ${notch} must not commit geometry during the 300 ms gap`,
      );
      const live = await map().evaluate((svg) => ({
        transform: svg.style.transform,
        promoted: svg.style.willChange,
      }));
      assert.ok(
        live.transform,
        `Slow wheel notch ${notch} must visibly transform the map`,
      );
      assert.equal(
        live.promoted,
        "transform",
        "The wheel gesture must retain its compositor layer",
      );
    }
    await settle(before);
    assert.ok(
      (await readView())[2] < before[2],
      "Slow wheel notches must finally commit their zoom",
    );
    await expectAnchor(slowWheelWorld, slowWheelPoint, "Slow wheel notches");
    await verifyCoverage("after slow wheel notches");
    await verifyNoAccidentalSelection("slow wheel notches");
    checks.push(
      "Two slow wheel notches 300 ms apart keep immediate CSS movement without intermediate viewBox commits; final camera preserves pointer anchor and visible coverage",
    );

    before = await readView();
    const wheelPoint = await surfacePoint();
    await page.mouse.move(wheelPoint.x, wheelPoint.y);
    await page.mouse.wheel(0, -110);
    await settle(before);
    after = await readView();
    assert.ok(after[2] < before[2], "Wheel up must zoom in");
    await verifyNoAccidentalSelection("wheel");
    await verifyCoverage("after wheel");
    await selectVisible("wheel");

    before = await readView();
    await pinch();
    await settle(before);
    after = await readView();
    assert.ok(after[2] < before[2], "Two-finger spreading must zoom in");
    await verifyNoAccidentalSelection("pinch");
    await verifyCoverage("after pinch");
    await selectVisible("two-finger pinch");
    before = await readView();
    await pinch({ zoomOut: true, translateX: 70, translateY: 35 });
    await settle(before);
    assert.ok(
      (await readView())[2] > before[2],
      "Converging fingers while translating must zoom out",
    );
    await verifyNoAccidentalSelection("translated pinch zoom-out");
    await verifyCoverage("after translated pinch zoom-out");
    await selectVisible("translated pinch zoom-out");

    const mini = page.getByRole("button", {
      name: "Küçük haritada konuma git",
      exact: true,
    });
    const target = GEOGRAPHY[data.world.countries.turkey.capital];
    const destination = await mini.evaluate((svg, p) => {
      const point = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM());
      return { x: point.x, y: point.y };
    }, target);
    before = await readView();
    await page.mouse.click(destination.x, destination.y);
    await settle(before);
    await verifyNoAccidentalSelection("minimap");
    await verifyCoverage("after minimap");
    await selectVisible("minimap");
    await page.screenshot({ path: path.join(output, "camera-minimap.png") });
    checks.push(
      "Visible province coverage checked during and after drag/pinch, after wheel and minimap; labels remain limited to capitals and selected city",
    );
    await expectSameBackdrop(
      originalBackdrop,
      "Camera movement and city selection",
    );
    // These snapshots pass through the real import UI. Only the displayed state
    // varies, so the expected raster invalidation cannot be caused by AI combat.
    const nextDay = structuredClone(data.world);
    nextDay.day++;
    await load(nextDay);
    await expectSameBackdrop(originalBackdrop, "A day-only world update");
    const allied = structuredClone(nextDay);
    allied.countries.germany.allies.push("turkey");
    allied.countries.turkey.allies.push("germany");
    await load(allied);
    await page.waitForFunction(
      (href) =>
        document
          .querySelector('[data-testid="minimap-backdrop"]')
          ?.getAttribute("href") !== href,
      originalBackdrop.href,
    );
    const alliedBackdrop = await minimapSnapshot();
    assert.equal(
      alliedBackdrop.rasterizations,
      originalBackdrop.rasterizations + 1,
      "Alliance color changes must rebuild the backdrop once",
    );
    const occupied = structuredClone(allied);
    occupied.provinces[data.enemy].controller = occupied.player;
    await load(occupied);
    await page.waitForFunction(
      (href) =>
        document
          .querySelector('[data-testid="minimap-backdrop"]')
          ?.getAttribute("href") !== href,
      alliedBackdrop.href,
    );
    const occupiedBackdrop = await minimapSnapshot();
    assert.equal(
      occupiedBackdrop.rasterizations,
      alliedBackdrop.rasterizations + 1,
      "Captured territory must rebuild the backdrop once",
    );
    await load();
    const restoredBackdrop = await minimapSnapshot();
    assert.equal(
      restoredBackdrop.href,
      originalBackdrop.href,
      "Restoring country control and relations must restore the original minimap pixels",
    );
    checks.push(
      "Raster minimap: no SVG province duplication or repeated rasterization on camera/day updates; alliance and occupation changes refresh pixels once; loading the original campaign restores them",
    );

    // ResizeObserver now provides camera dimensions. Check the ground point under
    // the pointer, not merely changing viewBox values, after desktop resizing.
    await resizeMap({ width: 1180, height: 900 }, "Desktop viewport resize");
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await settle();
    await verifyAnchoredWheel("Wheel anchor after desktop resize");
    await verifyAnchoredPinch("Pinch anchor after desktop resize");
    await resizeMap({ width: 1440, height: 1000 }, "Desktop viewport restore");
    await tab("Ordu");
    const scrolled = await page
      .getByTestId("army-roster")
      .evaluate((roster) => {
        for (let el = roster.parentElement; el; el = el.parentElement) {
          if (
            /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
            el.scrollHeight > el.clientHeight + 100
          ) {
            el.scrollTop = Math.min(
              el.scrollHeight - el.clientHeight,
              el.scrollTop + 160,
            );
            return el.scrollTop > 0;
          }
        }
        return false;
      });
    assert.ok(
      scrolled,
      "Army panel must really scroll to exercise viewport-cache invalidation",
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await settle();
    await verifyAnchoredWheel("Wheel anchor after panel scroll");
    await verifyAnchoredPinch("Pinch anchor after panel scroll");
    await expectSameBackdrop(restoredBackdrop, "Resize and scroll gestures");
    checks.push(
      "Desktop resize and real panel scroll: wheel/pinch preserve the intended ground point within 2 CSS pixels, camera ratio follows viewport and visible map coverage remains intact",
    );

    // 96 own divisions make each roster span three pages (40 + 40 + 16).
    await focus(data.origin);
    await tab("Ordu");
    await expectSelection(0);
    const roster = page.getByTestId("army-roster");
    const checkbox = (i) =>
      roster.getByRole("checkbox", {
        name: `${data.armies[i].name} seçime dahil`,
        exact: true,
      });
    assert.equal(await roster.getByRole("checkbox").count(), 40);
    await checkbox(0).check();
    await page
      .getByRole("button", { name: "Sonraki birlikler", exact: true })
      .click();
    assert.equal(await roster.getByRole("checkbox").count(), 40);
    await checkbox(40).check();
    await expectSelection(2);
    await page
      .getByRole("button", { name: "Sonraki birlikler", exact: true })
      .click();
    assert.equal(await roster.getByRole("checkbox").count(), 16);
    await checkbox(95).check();
    await expectSelection(3);
    await page
      .getByRole("button", { name: "Önceki birlikler", exact: true })
      .click();
    assert.ok(
      await checkbox(40).isChecked(),
      "Page-two selection survives page changes",
    );
    await page
      .getByRole("button", { name: "Önceki birlikler", exact: true })
      .click();
    assert.ok(
      await checkbox(0).isChecked(),
      "Page-one selection survives page changes",
    );
    const armySearch = page.getByRole("textbox", {
      name: "Birlik ara",
      exact: true,
    });
    await armySearch.fill("Denetim 096");
    assert.equal(await roster.getByRole("checkbox").count(), 1);
    assert.ok(await checkbox(95).isChecked());
    await expectSelection(3);
    await armySearch.fill("no-such-division");
    assert.equal(await roster.getByRole("checkbox").count(), 0);
    await expectSelection(3);
    // Select all while a filter hides every row: all own troops must be selected.
    await groupCard()
      .getByRole("button", { name: "Tüm tümenleri seç", exact: true })
      .click();
    await expectSelection(count);
    await armySearch.fill("");
    await groupCard()
      .getByRole("button", {
        name: `Haritada hedef seç · ${count} tümen`,
        exact: true,
      })
      .click();
    await clickProvince(data.destination);
    selectedId = data.destination;
    await page
      .getByRole("button", { name: "Emri iptal et", exact: true })
      .waitFor({ state: "detached" });
    let saved = await save();
    for (const army of data.armies) {
      const result = saved.armies.find((a) => a.id === army.id);
      assert.equal(
        result.route.at(-1),
        data.destination,
        `${army.name} must receive group move, including off-page units`,
      );
      assert.equal(result.stance, "advance");
    }
    assert.equal(saved.day, 0, "Paused command test must not advance time");
    checks.push(
      "Army roster: 40/40/16 pagination, cross-page selection, exact and empty search, select-all under filter, saved movement routes for all 96 divisions",
    );

    await tab("Ordu");
    const advanceOneDay = async () => {
      const date = await page.getByTestId("game-date").textContent();
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .click();
      await page.waitForFunction(
        (previous) =>
          document.querySelector('[data-testid="game-date"]')?.textContent !==
          previous,
        date,
      );
      await page
        .getByRole("button", { name: "Zamanı duraklat", exact: true })
        .click();
    };
    await armySearch.fill("Denetim 096");
    await advanceOneDay();
    assert.equal(
      await armySearch.inputValue(),
      "Denetim 096",
      "Advancing the simulation must preserve roster search",
    );
    assert.equal(await roster.getByRole("checkbox").count(), 1);
    assert.ok(await checkbox(95).isChecked());
    await armySearch.fill("");
    await page
      .getByRole("button", { name: "Sonraki birlikler", exact: true })
      .click();
    await advanceOneDay();
    assert.ok(
      await checkbox(40).isChecked(),
      "Advancing the simulation must preserve roster page and selection",
    );
    assert.equal(await checkbox(0).count(), 0);
    checks.push(
      "Simulation-day updates preserve roster search, current page and selected divisions",
    );

    await load();
    await focus(data.origin);
    await tab("Ordu");
    const offensive = page.getByTestId("offensive-roster");
    const offensiveBox = (i) =>
      offensive.getByRole("checkbox", {
        name: new RegExp(`^${data.armies[i].name}\\b`),
      });
    assert.equal(await offensive.getByRole("checkbox").count(), 40);
    await offensiveBox(0).check();
    await page
      .getByRole("button", { name: "Sonraki taarruz birlikleri", exact: true })
      .click();
    await offensiveBox(40).check();
    await page
      .getByRole("button", { name: "Sonraki taarruz birlikleri", exact: true })
      .click();
    assert.equal(await offensive.getByRole("checkbox").count(), 16);
    await offensiveBox(95).check();
    await page
      .getByRole("button", { name: "Önceki taarruz birlikleri", exact: true })
      .click();
    assert.ok(await offensiveBox(40).isChecked());
    await page
      .getByRole("button", { name: "Önceki taarruz birlikleri", exact: true })
      .click();
    assert.ok(await offensiveBox(0).isChecked());
    const offensiveSearch = page.getByRole("textbox", {
      name: "Taarruz için birlik ara",
      exact: true,
    });
    await offensiveSearch.fill("Denetim 096");
    assert.equal(await offensive.getByRole("checkbox").count(), 1);
    assert.ok(await offensiveBox(95).isChecked());
    assert.match(
      await attackCard().textContent(),
      /3 tümen taarruz için seçili/,
    );
    await attackCard()
      .getByRole("button", { name: "Tüm tümenleri seç", exact: true })
      .click();
    assert.match(
      await attackCard().textContent(),
      /96 tümen taarruz için seçili/,
    );
    await offensiveSearch.fill("");
    await attackCard()
      .getByRole("button", {
        name: "Haritada taarruz hedeflerini çiz",
        exact: true,
      })
      .click();
    await clickProvince(data.enemy);
    selectedId = data.enemy;
    await page
      .getByRole("button", { name: "Taarruz planını hazırla", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Emri iptal et", exact: true })
      .waitFor({ state: "detached" });
    saved = await save();
    const plan = saved.plans.find((p) => p.country === saved.player);
    assert.ok(plan, "Public target drawing must create a real offensive plan");
    assert.deepEqual(
      [...plan.armies].sort(),
      data.armies.map((a) => a.id).sort(),
    );
    assert.deepEqual(plan.objectives, [data.enemy]);
    assert.equal(plan.stance, "balanced");
    checks.push(
      "Offensive roster: 40/40/16 pagination, cross-page selection and search; select-all under filter creates a saved plan containing all 96 divisions and the clicked enemy city",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const closePanel = page.getByRole("button", {
      name: "Yönetim panelini kapat",
      exact: true,
    });
    if (await closePanel.isVisible()) await closePanel.click();
    await page
      .getByRole("button", { name: "Başkentime git", exact: true })
      .click();
    await settle();
    before = await readView();
    const mobileAnchor = await surfacePoint();
    assert.ok(mobileAnchor);
    const touchSession = await context.newCDPSession(page);
    const finger = (dx, dy) => [
      {
        x: mobileAnchor.x + dx,
        y: mobileAnchor.y + dy,
        id: 0,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      },
    ];
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: finger(0, 0),
    });
    for (let i = 1; i <= 8; i++)
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: finger(i * 9, i * 3),
      });
    await verifyCoverage("during mobile one-finger drag");
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touchSession.detach();
    await settle(before);
    assert.equal(
      (await readView())[2],
      before[2],
      "One-finger dragging must preserve zoom",
    );
    await verifyNoAccidentalSelection("mobile one-finger drag");
    await verifyCoverage("after mobile one-finger drag");
    before = await readView();
    await pinch();
    await settle(before);
    assert.ok((await readView())[2] < before[2], "Mobile pinch must zoom map");
    await verifyNoAccidentalSelection("mobile pinch");
    await verifyCoverage("mobile pinch");
    before = await readView();
    await pinch({ zoomOut: true, translateX: 35, translateY: 18 });
    await settle(before);
    assert.ok(
      (await readView())[2] > before[2],
      "Mobile translated pinch must zoom out",
    );
    await verifyNoAccidentalSelection("mobile translated pinch zoom-out");
    await verifyCoverage("mobile translated pinch zoom-out");
    await page.screenshot({ path: path.join(output, "mobile-camera.png") });
    await selectVisible("mobile pinch");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Mobile viewport must not overflow horizontally",
    );
    await page.screenshot({ path: path.join(output, "mobile-pinch.png") });
    checks.push(
      "390×844 touch viewport: one-finger dragging, pinch, visible province coverage, correct post-gesture selection, no horizontal page overflow",
    );
    if (await closePanel.isVisible()) await closePanel.click();
    const orientationBackdrop = await minimapSnapshot();
    for (const [viewport, label] of [
      [{ width: 844, height: 390 }, "Landscape orientation"],
      [{ width: 390, height: 844 }, "Portrait orientation restore"],
    ]) {
      await resizeMap(viewport, label);
      await page
        .getByRole("button", { name: "Başkentime git", exact: true })
        .click();
      await settle();
      await verifyAnchoredWheel(`${label}: wheel`);
      await verifyAnchoredPinch(`${label}: pinch`);
    }
    await expectSameBackdrop(
      orientationBackdrop,
      "Orientation changes and camera gestures",
    );
    checks.push(
      "Portrait→landscape→portrait orientation: resized map dimensions stay finite and proportional; wheel/pinch anchors remain within 2 CSS pixels; minimap is not rasterized again",
    );
    await resizeMap(
      { width: 1440, height: 1000 },
      "Final desktop viewport restore",
    );
    await tab("Ordu");
    await armySearch.fill("Denetim 096");
    await offensiveSearch.fill("Denetim 096");
    await page.locator('button[title="Yeni sefer"]').click();
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await tab("Ordu");
    assert.equal(
      await armySearch.inputValue(),
      "",
      "New campaign must reset army search",
    );
    assert.equal(
      await offensiveSearch.inputValue(),
      "",
      "New campaign must reset offensive search",
    );
    await expectSelection(0);
    checks.push(
      "New campaign resets both roster searches and clears selection",
    );
    assert.deepEqual(errors, [], "No uncaught browser exceptions");
    assert.deepEqual(consoleErrors, [], "No browser console errors");
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        { checks, errors, consoleErrors, artifactDirectory: output },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        { checks, errors, consoleErrors, artifactDirectory: output },
        null,
        2,
      ),
    );
  } catch (error) {
    if (page)
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        {
          message: String(error),
          stack: error.stack,
          checks,
          errors,
          consoleErrors,
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
