/* Cold-load the real engine over a measured 75 KiB/s connection. No asset,
   worker, or game-response mocks. A page-only CDP throttle does not cover
   nested workers: attach recursively and apply network-only rules before
   each worker starts. Requires Chromium supporting emulateNetworkConditionsByRule.
   Run against a production localhost server. CHESS_SLOW_CASES=bot,coach,review
   selects cases; CHESS_BASE_URL, CHESS_CHROMIUM, CHESS_ARTIFACT_DIR are optional.
   Each case takes about two minutes because the real 7 MiB WASM is downloaded. */
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { chromium } = require("playwright");
const WebSocket = require("ws");
const { Chess } = require("chess.js");

const base = process.env.CHESS_BASE_URL || "http://localhost:3000";
const output = process.env.CHESS_ARTIFACT_DIR || "/tmp/xarmy-chess-slow-browser";
const cases = (process.env.CHESS_SLOW_CASES || "bot,coach,review").split(",");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
assert.ok(cases.length && cases.every((name) => ["bot", "coach", "review"].includes(name)));
mkdirSync(output, { recursive: true });

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function throttleWorkers(page, port, mark, errors) {
  const discovery = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket = new WebSocket(discovery.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let nextId = 0;
  const pending = new Map();
  const sends = new Set();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timed out: ${method}`));
    }, 10000);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
      return;
    }
    if (message.method !== "Target.attachedToTarget" || message.params.targetInfo.type !== "worker") return;
    const { sessionId, targetInfo } = message.params;
    const work = (async () => {
      try {
        await send("Network.enable", {}, sessionId);
        await send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
        // The deprecated emulateNetworkConditions also changes navigator state,
        // which is unsupported on workers. The network-only API works here.
        await send("Network.emulateNetworkConditionsByRule", {
          offline: false,
          matchedNetworkConditions: [{
            urlPattern: "", latency: 100,
            downloadThroughput: 75 * 1024, uploadThroughput: 75 * 1024,
          }],
        }, sessionId);
        await send("Target.setAutoAttach", {
          autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
        }, sessionId);
        mark("worker-throttled", { url: targetInfo.url, bytesPerSecond: 75 * 1024 });
      } catch (error) {
        errors.push(error.message);
        mark("instrumentation-error", { error: error.message });
      } finally {
        await send("Runtime.runIfWaitingForDebugger", {}, sessionId);
      }
    })().catch((error) => errors.push(error.message));
    sends.add(work);
    void work.finally(() => sends.delete(work));
  });
  socket.on("error", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  const attached = await send("Target.attachToTarget", { targetId: targetInfo.targetId, flatten: true });
  await send("Target.setAutoAttach", {
    autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
  }, attached.sessionId);
  return async () => {
    await Promise.allSettled([...sends]);
    socket.close();
    for (const request of pending.values()) clearTimeout(request.timer);
    await cdp.detach();
  };
}

async function runCase(name) {
  const port = await freePort();
  const browser = await chromium.launch({
    executablePath: process.env.CHESS_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${port}`],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  const events = [], errors = [], checks = [];
  let started = Date.now(), enabled = false, closeThrottle;
  const mark = (type, detail = {}) => {
    const entry = { case: name, type, at: Date.now() - started, ...detail };
    events.push(entry);
    console.log(JSON.stringify(entry));
  };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (enabled && /\/stockfish\/engine\//.test(request.url())) mark("request", { url: request.url() });
  });
  page.on("response", (response) => {
    if (enabled && /\/stockfish\/engine\//.test(response.url())) {
      mark("response", { url: response.url(), status: response.status(), headers: response.headers() });
    }
  });
  page.on("requestfinished", (request) => {
    if (enabled && /\/stockfish\/engine\//.test(request.url())) {
      mark("requestfinished", { url: request.url(), timing: request.timing() });
    }
  });
  page.on("requestfailed", (request) => {
    if (enabled && /\/stockfish\/engine\//.test(request.url())) {
      errors.push(`${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  try {
    await page.goto(`${base}/games/chess`);
    await page.getByRole("button", { name: "♟ Botla oyna", exact: true }).waitFor();
    if (name === "coach") {
      await page.getByRole("button", { name: "✦ Yapay zekâ eğitmeni", exact: true }).tap();
    } else {
      await page.getByLabel("Bot seviyesi").selectOption("easy");
    }
    if (name === "bot") await page.getByRole("button", { name: "♚ Siyah", exact: true }).tap();
    if (name === "review") {
      // Create a real two-ply game normally, then force a fresh cold analysis download.
      await page.getByRole("button", { name: "Oyuna başla", exact: true }).tap();
      await page.locator('[data-square="e2"]').tap();
      await page.locator('[data-square="e4"]').tap();
      await page.getByTestId("game-status").filter({ hasText: "Sıra sende" }).waitFor({ timeout: 30000 });
    }
    closeThrottle = await throttleWorkers(page, port, mark, errors);
    await page.evaluate(() => {
      window.__chessSlowStatuses = [];
      const capture = () => {
        const text = ["game-status", "trainer-advice", "chess-review-panel"]
          .map((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent || "").join("\n");
        const previous = window.__chessSlowStatuses.at(-1);
        if (previous?.text !== text) window.__chessSlowStatuses.push({ at: Date.now(), text });
      };
      new MutationObserver(capture).observe(document.body, { childList: true, subtree: true, characterData: true });
      capture();
    });
    enabled = true;
    started = Date.now();
    if (name === "review") {
      await page.getByRole("button", { name: "Oyunu terk et", exact: true }).tap();
      await page.getByRole("button", { name: "Evet, çık", exact: true }).tap();
    } else {
      await page.getByRole("button", { name: "Oyuna başla", exact: true }).tap();
    }
    for (let checkpoint = 15; checkpoint <= 75; checkpoint += 15) {
      await page.waitForTimeout(Math.max(0, checkpoint * 1000 - (Date.now() - started)));
      assert.deepEqual(errors, [], "worker instrumentation and page must remain error-free");
      // Next's route announcer is also role=alert; inspect actual engine failures.
      assert.equal(await page.getByRole("alert").filter({
        hasText: /Stockfish yüklenemedi|Stockfish önerisi hazırlanamadı|Analiz tamamlanamadı/,
      }).count(), 0, "download must not trigger a premature timeout");
      if (checkpoint === 60) {
        assert.ok(!events.some((e) => e.type === "requestfinished" && e.url.endsWith(".wasm")),
          "cold WASM must still be downloading at the former 60-second engine timeout");
      }
      mark("checkpoint", { seconds: checkpoint, gameStatus: await page.getByTestId("game-status").textContent() });
    }
    assert.ok(events.some((e) => e.type === "worker-throttled" && e.url.endsWith("stockfish.js")), "nested engine worker must actually be throttled");
    checks.push("no false error at 75 seconds after actual cold WASM download exceeds the former 60-second timeout");
    if (name === "bot") {
      await page.getByTestId("game-status").filter({ hasText: "Sıra sende" }).waitFor({ timeout: 240000 });
      const cells = await page.getByTestId("move-history").getByRole("cell").allTextContents();
      const board = new Chess();
      assert.ok(cells.some((text) => board.moves().includes(text.trim())), "bot must return a legal opening move");
      checks.push("real bot played a legal opening move after download");
    } else if (name === "coach") {
      await page.getByTestId("trainer-best-move").waitFor({ timeout: 240000 });
      assert.ok(new Chess().moves().includes((await page.getByTestId("trainer-best-move").textContent()).trim()));
      assert.ok((await page.getByTestId("trainer-explanation").textContent()).length > 15);
      checks.push("real coach returned a legal suggestion and measured explanation after download");
    } else {
      await page.getByText("Analiz tamamlandı", { exact: true }).waitFor({ timeout: 240000 });
      assert.ok((await page.getByTestId("review-explanation").textContent()).length > 15);
      checks.push("real postgame review completed after cold download");
    }
    const statuses = await page.evaluate(() => window.__chessSlowStatuses);
    const loading = statuses.findIndex((s) => s.text.includes("Satranç motoru hazırlanıyor"));
    const thinkingText = name === "bot" ? "Bot düşünüyor" : name === "coach" ? "En iyi hamleyi ve nedenini inceliyorum" : "Hamleler inceleniyor";
    const thinking = statuses.findIndex((s) => s.text.includes(thinkingText));
    assert.ok(loading >= 0, "UI must explain the cold engine download");
    // An easy bot's very short search can be batched with its result by React.
    // Coach and postgame searches are long enough to require a visible search stage.
    if (name !== "bot") assert.ok(thinking > loading, "UI must distinguish engine loading from real search");
    const wasm = events.find((e) => e.type === "requestfinished" && e.url.endsWith(".wasm"));
    assert.ok(wasm && wasm.timing.responseEnd > 60000, "real WASM transfer must exceed the former 60-second timeout");
    assert.ok(events.filter((e) => e.type === "response").every((e) => e.status === 200));
    assert.deepEqual(errors, []);
    checks.push(`${thinking > loading ? "loading → thinking → result" : "loading → legal result"}; actual engine assets HTTP 200; no browser errors`);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    writeFileSync(path.join(output, `${name}.json`), JSON.stringify({ passed: true, checks, errors, events, statuses }, null, 2));
    mark("passed", { checks });
    return { case: name, passed: true, checks };
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true }).catch(() => {});
    writeFileSync(path.join(output, `${name}.json`), JSON.stringify({
      passed: false, error: error.stack, checks, errors, events,
      statuses: await page.evaluate(() => window.__chessSlowStatuses || []).catch(() => []),
      body: await page.locator("body").innerText().catch(() => ""),
    }, null, 2));
    throw error;
  } finally {
    if (closeThrottle) await closeThrottle();
    await browser.close();
  }
}

(async () => {
  const results = [];
  for (const name of cases) results.push(await runCase(name));
  writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
