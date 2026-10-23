/* Production browser regression for asynchronous autosaves.
   Exercise public import/clock/archive/load controls and inspect standard browser
   storage. API instrumentation observes main-thread work and injects real IDB
   transaction aborts; it never reads or mutates React state. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");
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
const {
  encodeSave,
  decodeSave,
} = require("../app/games/europa-war/strategy/storage.ts");
const base = process.env.EUROPA_BASE_URL || "http://localhost:3000";
const output = process.env.EUROPA_ARTIFACT_DIR || "/tmp/xarmy-europa-autosave";
const database = "xarmy-europa-auto-v1";
const store = "saves";
const legacyKey = "xarmy-europa-1936-v1:auto-1";
const saveError =
  "Cihaz kaydı yapılamadı. Depolama iznini/boş alanı kontrol et veya JSON dosyası indir.";
const readyText = "Çevrimdışı kullanıma hazır · bu cihaz";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [],
    checks = [],
    networkFailures = [],
    responseErrors = [];
  let page, offlineBeforeReload;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    context.on("requestfailed", (request) =>
      networkFailures.push({
        url: request.url(),
        error: request.failure()?.errorText,
      }),
    );
    context.on("response", (response) => {
      if (response.status() >= 400)
        responseErrors.push({ url: response.url(), status: response.status() });
    });
    await context.addInitScript(
      ({ database, store }) => {
        const offline = (window.__europaOfflineWork = {
          requests: [],
          replies: [],
        });
        const workerPost = ServiceWorker.prototype.postMessage;
        ServiceWorker.prototype.postMessage = function (...args) {
          if (args[0]?.type?.startsWith("EUROPA_"))
            offline.requests.push({ at: performance.now(), ...args[0] });
          return Reflect.apply(workerPost, this, args);
        };
        const onmessage = Object.getOwnPropertyDescriptor(
          MessagePort.prototype,
          "onmessage",
        );
        Object.defineProperty(MessagePort.prototype, "onmessage", {
          ...onmessage,
          set(callback) {
            return Reflect.apply(onmessage.set, this, [
              typeof callback === "function"
                ? function (event) {
                    if (event.data?.type?.startsWith("EUROPA_"))
                      offline.replies.push({
                        at: performance.now(),
                        ...event.data,
                      });
                    return Reflect.apply(callback, this, [event]);
                  }
                : callback,
            ]);
          },
        });
        const work = (window.__europaSaveWork = {
          parses: [],
          stringifies: [],
          localWrites: [],
          puts: [],
          commits: [],
          aborts: [],
          abortNextWrite: false,
          failRead: false,
        });
        const parse = JSON.parse;
        JSON.parse = function (...args) {
          const save =
            typeof args[0] === "string" &&
            args[0].slice(0, 100).includes('"format":"xarmy-europa-1936"');
          const start = performance.now();
          try {
            return Reflect.apply(parse, this, args);
          } finally {
            if (save)
              work.parses.push({
                length: args[0].length,
                ms: performance.now() - start,
              });
          }
        };
        const stringify = JSON.stringify;
        JSON.stringify = function (...args) {
          const value = args[0];
          const save =
            value?.format === "xarmy-europa-1936" ||
            (value?.version === 2 &&
              Array.isArray(value.armies) &&
              value.countries);
          const start = performance.now();
          try {
            return Reflect.apply(stringify, this, args);
          } finally {
            if (save) work.stringifies.push({ ms: performance.now() - start });
          }
        };
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (...args) {
          if (/^xarmy-europa-1936-v1:auto-[12]$/.test(args[0]))
            work.localWrites.push({ key: args[0], length: args[1].length });
          return Reflect.apply(setItem, this, args);
        };
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          if (
            this.name === database &&
            work.failRead &&
            (args[1] || "readonly") === "readonly"
          )
            throw new DOMException(
              "Injected autosave read denial",
              "NotAllowedError",
            );
          return Reflect.apply(transaction, this, args);
        };
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          const request = Reflect.apply(put, this, args);
          if (this.transaction.db.name === database && this.name === store) {
            const entry = { slot: args[1], day: args[0]?.world?.day };
            work.puts.push(entry);
            const tx = this.transaction;
            tx.addEventListener("complete", () => work.commits.push(entry), {
              once: true,
            });
            tx.addEventListener("abort", () => work.aborts.push(entry), {
              once: true,
            });
            if (work.abortNextWrite) {
              work.abortNextWrite = false;
              // A successful put request is insufficient: the transaction can
              // still fail before it commits and must preserve the older save.
              request.addEventListener("success", () => tx.abort(), {
                once: true,
              });
            }
          }
          return request;
        };
      },
      { database, store },
    );
    const attach = (next) => {
      page = next;
      page.setDefaultTimeout(20000);
      page.on("pageerror", (error) => errors.push(error.message));
      return page;
    };
    const passed = (check) => {
      checks.push(check);
      console.log(JSON.stringify({ passed: check }));
    };
    const tab = (name, target = page) =>
      target.locator('button[title="' + name + '"]').click();
    const auto = (number = 1, target = page) =>
      target
        .getByRole("heading", { name: "Otomatik kayıt " + number, exact: true })
        .locator("..");
    const resetWork = (target = page) =>
      target.evaluate(() => {
        const work = window.__europaSaveWork;
        for (const key of [
          "parses",
          "stringifies",
          "localWrites",
          "puts",
          "commits",
          "aborts",
        ])
          work[key] = [];
      });
    const importWorld = async (world, target = page) => {
      await tab("Kayıtlar", target);
      await target.getByLabel("Sefer kayıt dosyası").setInputFiles({
        name: "autosave-day" + world.day + ".json",
        mimeType: "application/json",
        buffer: Buffer.from(encodeSave(world)),
      });
      await target
        .getByRole("heading", { name: "Komuta merkezi", exact: true })
        .waitFor();
      await expectPaused(target);
    };
    const exportWorld = async (target = page) => {
      await tab("Kayıtlar", target);
      const downloadEvent = target.waitForEvent("download");
      await target
        .getByRole("button", { name: "JSON dosyası indir", exact: true })
        .click();
      const download = await downloadEvent;
      return decodeSave(fs.readFileSync(await download.path(), "utf8"));
    };
    const storage = (action, slot, value, target = page) =>
      target.evaluate(
        ({ database, store, action, slot, value }) =>
          new Promise((resolve, reject) => {
            const opening = indexedDB.open(database, 1);
            opening.onerror = () => reject(opening.error);
            opening.onsuccess = () => {
              const db = opening.result;
              let tx;
              try {
                tx = db.transaction(
                  store,
                  action === "get" ? "readonly" : "readwrite",
                );
              } catch (error) {
                db.close();
                reject(error);
                return;
              }
              const objectStore = tx.objectStore(store);
              const request =
                action === "get"
                  ? objectStore.get(slot)
                  : action === "delete"
                    ? objectStore.delete(slot)
                    : objectStore.put(value, slot);
              tx.oncomplete = () => {
                const result = request.result;
                db.close();
                resolve(result);
              };
              tx.onabort = tx.onerror = () => {
                const error = tx.error;
                db.close();
                reject(error);
              };
            };
          }),
        { database, store, action, slot, value },
      );
    const waitForCommit = (day, slot = "auto-1", target = page) =>
      target.waitForFunction(
        ({ day, slot }) =>
          window.__europaSaveWork.commits.some(
            (entry) => entry.day === day && entry.slot === slot,
          ),
        { day, slot },
      );
    const openArchive = async () => {
      await tab("Komuta");
      await tab("Kayıtlar");
    };
    const label = (day) => "Türkiye · " + day + ". gün";
    const expectPaused = (target = page) =>
      target.waitForFunction(() => {
        const button = document.querySelector(
          'button[aria-label="Zamanı başlat"]',
        );
        return button && !button.disabled;
      });
    const resume = async (day, target = page) => {
      await target
        .getByText("Kayıtlı sefere devam et", { exact: true })
        .click();
      await target
        .getByRole("button", { name: label(day) + " →", exact: true })
        .first()
        .click();
      await expectPaused(target);
    };
    const world = createWorld("turkey", "historical", 1936, "normal");
    while (world.armies.length < 2000)
      addArmy(world, "turkey", world.countries.turkey.capital);
    world.day = 13;
    decodeSave(encodeSave(world));
    const dayWorld = (day) => ({ ...world, day });

    attach(await context.newPage());
    await page.goto(base + "/games/europa-war", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await importWorld(world);
    await resetWork();
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await waitForCommit(14);
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    const gameplayWork = await page.evaluate(() => window.__europaSaveWork);
    assert.equal(
      gameplayWork.parses.length,
      0,
      "Gameplay must not parse an unused save archive",
    );
    assert.equal(
      gameplayWork.stringifies.length,
      0,
      "Automatic saves must not stringify a campaign on the main thread",
    );
    assert.equal(
      gameplayWork.localWrites.length,
      0,
      "Automatic saves must not write localStorage",
    );
    const saved = await storage("get", "auto-1");
    const savedWorld = decodeSave(JSON.stringify(saved));
    assert.equal(savedWorld.day, 14);
    assert.equal(savedWorld.armies.length, 2000);
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), legacyKey),
      null,
    );
    passed(
      "Day 14 persists all 2000 divisions in IndexedDB with no main-thread save stringify, parse, or localStorage write",
    );

    await importWorld(dayWorld(73));
    await tab("Kayıtlar");
    await auto().getByText(label(14), { exact: true }).waitFor();
    await auto().getByRole("button", { name: "Yükle", exact: true }).click();
    await expectPaused();
    assert.deepEqual(await exportWorld(), savedWorld);
    offlineBeforeReload = await page.evaluate(() => window.__europaOfflineWork);
    await page.reload({ waitUntil: "domcontentloaded" });
    await resume(14);
    assert.deepEqual(await exportWorld(), savedWorld);
    passed(
      "Archive load and refresh/setup resume both restore the complete IndexedDB campaign and pause time",
    );

    await storage("delete", "auto-1");
    const legacyWorld = dayWorld(9);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: legacyKey,
      raw: encodeSave(legacyWorld),
    });
    await openArchive();
    await auto().getByText(label(9), { exact: true }).waitFor();
    await auto().getByRole("button", { name: "Yükle", exact: true }).click();
    await expectPaused();
    assert.deepEqual(await exportWorld(), legacyWorld);
    await page
      .getByRole("button", { name: "Bu yuvaya kaydet", exact: true })
      .first()
      .click();
    const manual = await page.evaluate(() =>
      localStorage.getItem("xarmy-europa-1936-v1:slot-1"),
    );
    assert.deepEqual(decodeSave(manual), legacyWorld);
    passed(
      "Missing IndexedDB autosaves fall back to legacy localStorage saves; manual save and JSON export remain usable",
    );

    await storage("put", "auto-1", saved);
    await openArchive();
    await auto().getByText(label(14), { exact: true }).waitFor();
    const corrupt = {
      format: "xarmy-europa-1936",
      version: 2,
      savedAt: "invalid",
      world: {},
    };
    await storage("put", "auto-1", corrupt);
    // Keep the previously enabled button visible: loading must revalidate the
    // stored record rather than trusting an earlier archive summary.
    await auto().getByRole("button", { name: "Yükle", exact: true }).click();
    await page.getByText(/Bu kayıt eksik, bozuk|Eski kayıt bozuk/).waitFor();
    assert.deepEqual(await exportWorld(), legacyWorld);
    await openArchive();
    await auto().getByText("Okunamayan kayıt", { exact: true }).waitFor();
    assert.equal(
      await auto()
        .getByRole("button", { name: "Yükle", exact: true })
        .isDisabled(),
      true,
    );
    passed(
      "A malformed IndexedDB record is rejected on load and in the archive, preserving the campaign and never falling back to an older legacy save",
    );

    await storage("put", "auto-1", saved);
    await page.evaluate(() => {
      window.__europaSaveWork.failRead = true;
    });
    await openArchive();
    await auto().getByText("Okunamayan kayıt", { exact: true }).waitFor();
    assert.equal(
      await auto()
        .getByRole("button", { name: "Yükle", exact: true })
        .isDisabled(),
      true,
    );
    await page.evaluate(() => {
      window.__europaSaveWork.failRead = false;
    });
    await openArchive();
    await auto().getByText(label(14), { exact: true }).waitFor();
    passed(
      "IndexedDB read denial reports an unreadable autosave instead of concealing it with legacy data, and recovers when access returns",
    );

    await importWorld(dayWorld(41));
    await resetWork();
    await page.evaluate(() => {
      window.__europaSaveWork.abortNextWrite = true;
    });
    await page
      .getByRole("button", { name: "Zamanı başlat", exact: true })
      .click();
    await page.getByText(saveError, { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Zamanı duraklat", exact: true })
      .click();
    assert.deepEqual(await storage("get", "auto-1"), saved);
    const aborted = await page.evaluate(() => window.__europaSaveWork.aborts);
    assert.ok(
      aborted.some((entry) => entry.slot === "auto-1" && entry.day === 42),
    );
    await tab("Kayıtlar");
    await auto().getByText(label(14), { exact: true }).waitFor();
    passed(
      "An abort after the put request succeeds shows a save error and preserves the previous committed autosave",
    );

    await page.evaluate(() => {
      window.__europaSaveWork.abortNextWrite = true;
    });
    await page.locator('button[title="Yeni sefer"]').click();
    await page.getByText(saveError, { exact: true }).waitFor();
    await page.waitForFunction(() =>
      window.__europaSaveWork.aborts.some((entry) => entry.slot === "auto-2"),
    );
    assert.equal(
      await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).count(),
      0,
    );
    await expectPaused();
    passed(
      "A failed save when returning to setup keeps the existing campaign open and paused",
    );

    const external = await context.newPage();
    external.setDefaultTimeout(20000);
    external.on("pageerror", (error) => errors.push(error.message));
    await external.goto(base + "/games/europa-war", {
      waitUntil: "domcontentloaded",
    });
    await external.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await importWorld(dayWorld(73), external);
    await external.locator('button[title="Yeni sefer"]').click();
    await external.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    await auto(2).getByText(label(73), { exact: true }).waitFor();
    passed(
      "A committed automatic save in another tab updates an already open archive",
    );

    await external.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
    await importWorld(dayWorld(81), external);
    await importWorld(dayWorld(80));
    await page.getByRole("button", { name: "5 kat hız", exact: true }).click();
    await resetWork();
    await resetWork(external);
    // Hold a real transaction open, so both public save requests are in flight
    // together. Repeated reads keep it active until the test releases the lock.
    await page.evaluate(
      ({ database, store }) =>
        new Promise((resolve, reject) => {
          const opening = indexedDB.open(database, 1);
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const tx = db.transaction(store, "readwrite");
            const gate = (window.__europaSaveGate = {
              released: false,
              complete: false,
            });
            const repeat = () => {
              const request = tx.objectStore(store).getKey("auto-2");
              request.onsuccess = () => {
                if (!gate.released) repeat();
              };
            };
            tx.oncomplete = () => {
              gate.complete = true;
              db.close();
            };
            tx.onabort = () => {
              db.close();
              reject(tx.error);
            };
            repeat();
            resolve();
          };
        }),
      { database, store },
    );
    await page.locator('button[title="Yeni sefer"]').click();
    await page.waitForFunction(() =>
      window.__europaSaveWork.puts.some(
        (entry) => entry.day === 80 && entry.slot === "auto-2",
      ),
    );
    // Hiding the tab while its exit save is pending must not enqueue a second
    // snapshot behind it, which could overwrite the other tab's later save.
    await page.evaluate(() => {
      const hidden = Object.getOwnPropertyDescriptor(document, "hidden");
      try {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      } finally {
        if (hidden) Object.defineProperty(document, "hidden", hidden);
        else delete document.hidden;
      }
    });
    assert.deepEqual(
      await page.evaluate(() => window.__europaSaveWork.puts),
      [{ slot: "auto-2", day: 80 }],
    );
    const heldDate = await page.getByTestId("game-date").textContent();
    assert.equal(
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "5 kat hız", exact: true })
        .isDisabled(),
      true,
    );
    // Focus ordinary page text so Space reaches the global shortcut instead
    // of activating the previously clicked New Campaign button.
    await page.getByTestId("game-date").click();
    await page.keyboard.press("Space");
    const difficulty = page.getByLabel("Oyun zorluğu", { exact: true });
    if (await difficulty.isEnabled()) await difficulty.selectOption("hard");
    assert.equal(await difficulty.inputValue(), "normal");
    await page.waitForTimeout(1100);
    assert.equal(await page.getByTestId("game-date").textContent(), heldDate);
    assert.equal(
      await page
        .getByRole("button", { name: "Zamanı başlat", exact: true })
        .isDisabled(),
      true,
    );
    await external.locator('button[title="Yeni sefer"]').click();
    await external.waitForFunction(() =>
      window.__europaSaveWork.puts.some(
        (entry) => entry.day === 81 && entry.slot === "auto-2",
      ),
    );
    assert.equal(
      await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).count(),
      0,
    );
    assert.equal(
      await external.getByRole("button", { name: "SEFERİ BAŞLAT" }).count(),
      0,
    );
    await page.evaluate(() => {
      window.__europaSaveGate.released = true;
    });
    await page.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    await external.getByRole("button", { name: "SEFERİ BAŞLAT" }).waitFor();
    assert.deepEqual(
      decodeSave(JSON.stringify(await storage("get", "auto-2"))),
      dayWorld(81),
    );
    await page
      .getByRole("button", { name: "Mevcut sefere dön", exact: true })
      .click();
    assert.deepEqual(await exportWorld(), dayWorld(80));
    assert.deepEqual(
      await page.evaluate(() => ({
        puts: window.__europaSaveWork.puts,
        commits: window.__europaSaveWork.commits,
      })),
      {
        puts: [{ slot: "auto-2", day: 80 }],
        commits: [{ slot: "auto-2", day: 80 }],
      },
      "A visibility change during a pending exit must not queue another autosave",
    );
    passed(
      "Concurrent saves wait for commit, block clock/Space/commands and duplicate visibility autosaves while pending, preserve the current campaign, and retain the later requested save",
    );

    await external.close();
    await page
      .getByText(readyText, { exact: true })
      .waitFor({ timeout: 60000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.clearBrowserCache");
    await context.setOffline(true);
    await page.close();
    attach(await context.newPage());
    const offlineCdp = await context.newCDPSession(page);
    await offlineCdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(base + "/games/europa-war", {
      waitUntil: "domcontentloaded",
    });
    await resume(14);
    assert.deepEqual(await exportWorld(), savedWorld);
    await page.screenshot({ path: path.join(output, "autosave-offline.png") });
    passed(
      "A fresh offline page resumes and exports the complete IndexedDB autosave with the HTTP cache disabled",
    );

    assert.deepEqual(errors, []);
    const report = { result: "passed", gameplayWork, checks, errors };
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } catch (error) {
    const offline =
      page && !page.isClosed()
        ? await page
            .evaluate(async () => ({
              status: document.body.innerText
                .split("\n")
                .filter((line) => line.startsWith("Çevrimdışı")),
              workers: (await navigator.serviceWorker.getRegistrations()).map(
                (registration) => ({
                  scope: registration.scope,
                  active: registration.active?.state,
                  installing: registration.installing?.state,
                  waiting: registration.waiting?.state,
                }),
              ),
              caches: await caches.keys(),
              assets: [
                ...document.querySelectorAll(
                  'script[src],link[rel="stylesheet"],link[rel="preload"]',
                ),
              ].map((element) => element.src || element.href),
              exchange: window.__europaOfflineWork,
            }))
            .catch((failure) => ({ error: failure.message }))
        : null;
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        {
          error: error.stack,
          checks,
          errors,
          networkFailures,
          responseErrors,
          offline,
          offlineBeforeReload,
        },
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
