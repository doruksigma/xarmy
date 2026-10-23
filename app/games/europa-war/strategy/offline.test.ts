import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import { GET } from "../sw.js/route";
import { GET as workerBootstrapGET } from "../simulation-worker.js/route";
import manifest from "./map-assets.json";

const ORIGIN = "https://game.example";
const PAGE = "/games/europa-war";
const VERSION = "europa-offline-v3";
const MAIN = "/_next/static/chunks/main-v1.js";
const STYLE = "/_next/static/css/game-v1.css";
const WORKER = "/_next/static/chunks/simulation-v1.js";
const SHARED = "/_next/static/chunks/engine-v1.js";
const BOOTSTRAP = bootstrapURL(WORKER);

function bootstrapURL(entry: string) {
  return `${PAGE}/simulation-worker.js?entry=${encodeURIComponent(entry)}`;
}

function pageHTML(version: number) {
  return `<!doctype html><html><head><script src="/_next/static/chunks/main-v${version}.js"></script></head><body>page-v${version}</body></html>`;
}

type Resource = string | URL | Request | { url: string };
type Reply = { type: string; version?: string; terrain?: string };
type MessageData = Record<string, unknown>;
type Event = {
  data?: MessageData;
  request?: { method: string; url: string; mode?: string };
  ports?: { postMessage: (reply: Reply) => void }[];
  source?: { postMessage: (reply: Reply) => void };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
};

function absolute(resource: Resource) {
  const value = typeof resource === "string"
    ? resource
    : resource instanceof URL
      ? resource.href
      : resource.url;
  return new URL(value, ORIGIN).href;
}

class MemoryCache {
  entries = new Map<string, Response>();
  async match(resource: Resource) {
    return this.entries.get(absolute(resource))?.clone();
  }
  async put(resource: Resource, response: Response) {
    this.entries.set(absolute(resource), response.clone());
  }
  async delete(resource: Resource) {
    return this.entries.delete(absolute(resource));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

class MemoryCaches {
  stores = new Map<string, MemoryCache>();
  async open(name: string) {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new MemoryCache();
      this.stores.set(name, cache);
    }
    return cache;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async has(name: string) {
    return this.stores.has(name);
  }
  async match(resource: Resource) {
    for (const cache of this.stores.values()) {
      const hit = await cache.match(resource);
      if (hit) return hit;
    }
    return undefined;
  }
}

function cacheMessage(overrides: MessageData = {}): MessageData {
  return {
    type: "EUROPA_CACHE",
    version: VERSION,
    assets: [MAIN, STYLE, WORKER, SHARED],
    workerAssets: [BOOTSTRAP, WORKER, SHARED],
    terrain: manifest.terrain.url,
    ...overrides,
  };
}

async function harness() {
  const caches = new MemoryCaches();
  const listeners = new Map<string, (event: Event) => void>();
  const responses = new Map<string, Response>();
  const failures = new Set<string>();
  const fetched: string[] = [];
  let offline = false;
  const resource = (url: string, text: string, type: string) => {
    responses.set(absolute(url), new Response(text, {
      headers: { "Content-Type": type },
    }));
  };
  resource(PAGE, pageHTML(1), "text/html; charset=utf-8");
  resource(MAIN, "main-v1", "application/javascript");
  resource(STYLE, "style-v1", "text/css");
  resource(WORKER, "worker-v1", "application/javascript");
  resource(BOOTSTRAP, "bootstrap-v1", "application/javascript");
  resource(SHARED, "shared-v1", "application/javascript");
  resource(manifest.terrain.url, "terrain-v1", "image/webp");
  const fetch = async (input: Resource) => {
    const url = absolute(input);
    fetched.push(url);
    if (offline || failures.has(url)) throw new TypeError("Network unavailable");
    return responses.get(url)?.clone() ?? new Response("Not found", { status: 404 });
  };
  const self = {
    location: { origin: ORIGIN, href: `${ORIGIN}${PAGE}/sw.js` },
    addEventListener: (type: string, callback: (event: Event) => void) => {
      listeners.set(type, callback);
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    crypto: webcrypto,
  };
  vm.runInNewContext(await GET().text(), {
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
    Headers,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
  }, { filename: "europa-service-worker.js" });
  const message = async (data: MessageData) => {
    const replies: Reply[] = [];
    const pending: Promise<unknown>[] = [];
    listeners.get("message")!({
      data,
      ports: [{ postMessage: (reply) => replies.push(reply) }],
      waitUntil: (promise) => pending.push(promise),
      respondWith: () => assert.fail("Messages cannot respond with a fetch response"),
    });
    await Promise.all(pending);
    return replies;
  };
  const request = async (url: string, mode?: string) => {
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    listeners.get("fetch")!({
      request: { url: absolute(url), method: "GET", mode },
      waitUntil: (promise) => pending.push(promise),
      respondWith: (promise) => { response = Promise.resolve(promise); },
    });
    if (!response) return undefined;
    const result = await response;
    await Promise.all(pending);
    return result;
  };
  return {
    caches,
    responses,
    failures,
    fetched,
    resource,
    message,
    request,
    goOffline: () => { offline = true; },
  };
}

function assertReply(replies: Reply[], type: Reply["type"]) {
  assert.equal(replies.length, 1, "Each cache request must get one definite answer");
  assert.equal(replies[0].type, type);
  assert.equal(replies[0].version, VERSION);
}

test("Offline worker announces its protocol version through the request's message port", async () => {
  const h = await harness();
  const replies = await h.message({ type: "EUROPA_PING" });
  assertReply(replies, "EUROPA_VERSION");
  assert.equal(replies[0].terrain, manifest.terrain.url);
});

test("A complete offline pack includes worker entry, worker chunks, terrain and page assets", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage()), "EUROPA_READY");
  for (const path of [PAGE, MAIN, STYLE, BOOTSTRAP, WORKER, SHARED, manifest.terrain.url]) {
    assert.ok(h.fetched.includes(absolute(path)), `The pack must download ${path}`);
  }
  h.goOffline();
  for (const [path, expected] of [
    [PAGE, pageHTML(1)],
    [MAIN, "main-v1"],
    [STYLE, "style-v1"],
    [BOOTSTRAP, "bootstrap-v1"],
    [WORKER, "worker-v1"],
    [SHARED, "shared-v1"],
    [manifest.terrain.url, "terrain-v1"],
  ]) {
    const response = await h.request(path, path === PAGE ? "navigate" : undefined);
    assert.equal(response?.status, 200, path);
    assert.equal(await response?.text(), expected, path);
  }
});

test("A pack without reported worker assets cannot claim offline readiness", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage({ workerAssets: [] })), "EUROPA_FAILED");
  h.goOffline();
  assert.equal((await h.request(PAGE, "navigate"))?.status, 503);
});

test("Terrain must be the exact versioned asset from the current map manifest", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage({ terrain: `${PAGE}/terrain-old.webp` })), "EUROPA_FAILED");
});

test("The scoped bootstrap imports only a same-origin emitted worker JavaScript asset", async () => {
  const response = await workerBootstrapGET(new Request(absolute(BOOTSTRAP)));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /javascript/);
  const source = await response.text();
  assert.match(source, /importScripts\(/);
  assert.ok(source.includes(WORKER));
});

test("The bootstrap resolves its entry against the public worker origin behind a proxy", async () => {
  const response = await workerBootstrapGET(new Request(
    new URL(BOOTSTRAP, "http://localhost:3000"),
    {
      headers: {
        host: "127.0.0.1:43210",
        "x-forwarded-host": "game.example",
        "x-forwarded-proto": "https",
      },
    },
  ));
  assert.equal(response.status, 200);
  const source = await response.text();
  assert.equal(source, `importScripts(${JSON.stringify(WORKER)});`);
  assert.doesNotMatch(source, /localhost:3000|127\.0\.0\.1:43210/);
  const publicWorker = new URL(BOOTSTRAP, ORIGIN);
  const imported: string[] = [];
  vm.runInNewContext(source, {
    importScripts: (entry: string) => imported.push(new URL(entry, publicWorker).href),
  });
  assert.deepEqual(imported, [absolute(WORKER)]);
});

test("The scoped bootstrap rejects private paths, non-JavaScript entries and foreign origins", async () => {
  for (const entry of [
    "/api/private",
    "/_next/static/css/private.css",
    "https://other.example/_next/static/chunks/worker.js",
    "//other.example/_next/static/chunks/worker.js",
    "/_next/static/../../api/private.js",
    "http://[",
    "",
  ]) {
    const response = await workerBootstrapGET(new Request(absolute(bootstrapURL(entry))));
    assert.ok(response.status >= 400 && response.status < 500, entry);
    assert.doesNotMatch(await response.text(), /importScripts\(/);
  }
});

test("An offline pack rejects a scoped bootstrap pointing outside the immutable same-origin assets", async () => {
  for (const entry of ["/api/private", "https://other.example/_next/static/chunks/worker.js"]) {
    const h = await harness();
    assertReply(await h.message(cacheMessage({
      workerAssets: [bootstrapURL(entry), WORKER, SHARED],
    })), "EUROPA_FAILED");
    assert.equal(h.fetched.includes(absolute(bootstrapURL(entry))), false);
  }
});

test("An offline pack cannot omit the immutable entry imported by its scoped bootstrap", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage({
    assets: [MAIN, STYLE, SHARED],
    workerAssets: [BOOTSTRAP, SHARED],
  })), "EUROPA_FAILED");
  h.goOffline();
  assert.equal((await h.request(PAGE, "navigate"))?.status, 503);
});

test("A worker asset report without its scoped bootstrap cannot claim offline readiness", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage({
    workerAssets: [WORKER, SHARED],
  })), "EUROPA_FAILED");
});

test("Worker, shared chunk, terrain and page download failures never report READY", async () => {
  for (const failed of [BOOTSTRAP, WORKER, SHARED, manifest.terrain.url, PAGE]) {
    const h = await harness();
    h.responses.delete(absolute(failed));
    assertReply(await h.message(cacheMessage()), "EUROPA_FAILED");
    h.goOffline();
    assert.equal((await h.request(PAGE, "navigate"))?.status, 503, failed);
  }
});

test("A successful HTTP response containing an error document cannot replace game HTML", async () => {
  const h = await harness();
  h.resource(PAGE, "Unavailable", "text/plain");
  assertReply(await h.message(cacheMessage()), "EUROPA_FAILED");
  h.goOffline();
  assert.equal((await h.request(PAGE, "navigate"))?.status, 503);
});

for (const [label, html] of [
  ["empty HTML", ""],
  ["an HTML error page", "<!doctype html><html><body><h1>Service unavailable</h1></body></html>"],
  ["a stylesheet without application JavaScript", `<html><head><link href="${STYLE}" rel="stylesheet"></head><body>Unavailable</body></html>`],
  ["the worker script without application JavaScript", `<html><script src="${WORKER}"></script></html>`],
  ["a worker shared chunk without application JavaScript", `<html><script src="${SHARED}"></script></html>`],
]) {
  test(`HTTP 200 with ${label} cannot claim offline readiness`, async () => {
    const h = await harness();
    h.resource(PAGE, html, "text/html; charset=utf-8");
    assertReply(await h.message(cacheMessage()), "EUROPA_FAILED");
    h.goOffline();
    assert.equal((await h.request(PAGE, "navigate"))?.status, 503);
  });
}

test("An upgrade receiving an HTML error page preserves the previous playable pack", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage()), "EUROPA_READY");
  const nextMain = "/_next/static/chunks/main-v2.js";
  const nextWorker = "/_next/static/chunks/simulation-v2.js";
  h.resource(nextMain, "main-v2", "application/javascript");
  h.resource(nextWorker, "worker-v2", "application/javascript");
  h.resource(bootstrapURL(nextWorker), "bootstrap-v2", "application/javascript");
  h.resource(PAGE, "<html><body>Temporarily unavailable</body></html>", "text/html");
  assertReply(await h.message(cacheMessage({
    assets: [nextMain, STYLE, nextWorker, SHARED],
    workerAssets: [bootstrapURL(nextWorker), nextWorker, SHARED],
  })), "EUROPA_FAILED");
  h.goOffline();
  assert.equal(await (await h.request(PAGE, "navigate"))?.text(), pageHTML(1));
  assert.equal(await (await h.request(MAIN))?.text(), "main-v1");
  assert.equal(await (await h.request(WORKER))?.text(), "worker-v1");
});

test("A failed upgrade preserves the previous complete offline page and worker", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage()), "EUROPA_READY");
  const nextMain = "/_next/static/chunks/main-v2.js";
  const nextWorker = "/_next/static/chunks/simulation-v2.js";
  h.resource(PAGE, pageHTML(2), "text/html");
  h.resource(nextMain, "main-v2", "application/javascript");
  h.resource(nextWorker, "worker-v2", "application/javascript");
  h.resource(bootstrapURL(nextWorker), "bootstrap-v2", "application/javascript");
  h.failures.add(absolute(nextWorker));
  assertReply(await h.message(cacheMessage({
    assets: [nextMain, STYLE, nextWorker, SHARED],
    workerAssets: [bootstrapURL(nextWorker), nextWorker, SHARED],
  })), "EUROPA_FAILED");
  h.goOffline();
  assert.equal(await (await h.request(PAGE, "navigate"))?.text(), pageHTML(1));
  assert.equal(await (await h.request(MAIN))?.text(), "main-v1");
  assert.equal(await (await h.request(WORKER))?.text(), "worker-v1");
  assert.equal(await (await h.request(manifest.terrain.url))?.text(), "terrain-v1");
  await assert.rejects(h.request(nextMain), /Network unavailable/);
});

test("A successful upgrade switches offline navigation and code to the new completed pack", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage()), "EUROPA_READY");
  const nextMain = "/_next/static/chunks/main-v2.js";
  const nextWorker = "/_next/static/chunks/simulation-v2.js";
  h.resource(PAGE, pageHTML(2), "text/html");
  h.resource(nextMain, "main-v2", "application/javascript");
  h.resource(nextWorker, "worker-v2", "application/javascript");
  h.resource(bootstrapURL(nextWorker), "bootstrap-v2", "application/javascript");
  assertReply(await h.message(cacheMessage({
    assets: [nextMain, STYLE, nextWorker, SHARED],
    workerAssets: [bootstrapURL(nextWorker), nextWorker, SHARED],
  })), "EUROPA_READY");
  h.goOffline();
  assert.equal(await (await h.request(`${PAGE}/`, "navigate"))?.text(), pageHTML(2));
  assert.equal(await (await h.request(nextMain))?.text(), "main-v2");
  assert.equal(await (await h.request(nextWorker))?.text(), "worker-v2");
});

test("A deployment changing during download cannot mix new HTML with an older asset list", async () => {
  const h = await harness();
  assertReply(await h.message(cacheMessage()), "EUROPA_READY");
  const nextMain = "/_next/static/chunks/main-v2.js";
  const nextWorker = "/_next/static/chunks/simulation-v2.js";
  h.resource(nextMain, "main-v2", "application/javascript");
  h.resource(nextWorker, "worker-v2", "application/javascript");
  h.resource(bootstrapURL(nextWorker), "bootstrap-v2", "application/javascript");
  h.resource(PAGE,
    '<html><script src="/_next/static/chunks/main-v3.js"></script></html>',
    "text/html");
  assertReply(await h.message(cacheMessage({
    assets: [nextMain, STYLE, nextWorker, SHARED],
    workerAssets: [bootstrapURL(nextWorker), nextWorker, SHARED],
  })), "EUROPA_FAILED");
  h.goOffline();
  assert.equal(await (await h.request(PAGE, "navigate"))?.text(), pageHTML(1));
  assert.equal(await (await h.request(WORKER))?.text(), "worker-v1");
});

test("An older installed pack remains available while the new pack is unavailable", async () => {
  const h = await harness();
  const old = await h.caches.open("xarmy-europa-offline-v1");
  await old.put(PAGE, new Response("legacy-page", { headers: { "Content-Type": "text/html" } }));
  await old.put(MAIN, new Response("legacy-main"));
  h.failures.add(absolute(WORKER));
  assertReply(await h.message(cacheMessage()), "EUROPA_FAILED");
  h.goOffline();
  assert.equal(await (await h.request(PAGE, "navigate"))?.text(), "legacy-page");
  assert.equal(await (await h.request(MAIN))?.text(), "legacy-main");
});

test("Successful upgrades retain two complete packs and failed upgrades preserve them", async () => {
  const h = await harness();
  const legacy = await h.caches.open("xarmy-europa-offline-v1");
  await legacy.put(PAGE, new Response("legacy-page"));
  const unrelated = await h.caches.open("another-game-assets");
  await unrelated.put("/other-game.png", new Response("unrelated-asset"));
  const deploy = async (version: number) => {
    const main = `/_next/static/chunks/main-v${version}.js`;
    const worker = `/_next/static/chunks/simulation-v${version}.js`;
    h.resource(PAGE, pageHTML(version), "text/html");
    h.resource(main, `main-v${version}`, "application/javascript");
    h.resource(worker, `worker-v${version}`, "application/javascript");
    h.resource(bootstrapURL(worker), `bootstrap-v${version}`, "application/javascript");
    return h.message(cacheMessage({
      assets: [main, STYLE, worker, SHARED],
      workerAssets: [bootstrapURL(worker), worker, SHARED],
    }));
  };
  assertReply(await deploy(1), "EUROPA_READY");
  assert.equal(await h.caches.has("xarmy-europa-offline-v1"), false);
  assertReply(await deploy(2), "EUROPA_READY");
  assertReply(await deploy(3), "EUROPA_READY");
  const beforeFailure = (await h.caches.keys()).sort();
  const packs = beforeFailure.filter((name) => name.startsWith("xarmy-europa-pack-v2-"));
  assert.equal(packs.length, 2);
  const pages = await Promise.all(packs.map(async (name) => {
    return (await (await h.caches.open(name)).match(PAGE))?.text();
  }));
  assert.deepEqual(pages.sort(), [pageHTML(2), pageHTML(3)]);
  assert.equal(await h.caches.has("another-game-assets"), true);

  h.failures.add(absolute("/_next/static/chunks/simulation-v4.js"));
  assertReply(await deploy(4), "EUROPA_FAILED");
  assert.deepEqual((await h.caches.keys()).sort(), beforeFailure);
  h.goOffline();
  assert.equal(await (await h.request(PAGE, "navigate"))?.text(), pageHTML(3));
  assert.equal(await (await h.request("/_next/static/chunks/simulation-v2.js"))?.text(), "worker-v2");
  assert.equal(await (await h.request("/_next/static/chunks/simulation-v3.js"))?.text(), "worker-v3");
  assert.equal(await (await unrelated.match("/other-game.png"))?.text(), "unrelated-asset");
});

test("The game worker does not intercept unrelated pages, requests or external assets", async () => {
  const h = await harness();
  h.goOffline();
  assert.equal(await h.request("/account", "navigate"), undefined);
  assert.equal(await h.request("/api/private"), undefined);
  assert.equal(await h.request("https://other.example/_next/static/chunk.js"), undefined);
});
