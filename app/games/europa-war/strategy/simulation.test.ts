import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { advanceDay, createWorld } from "./engine";
import {
  SimulationController,
  type SimulationRequest,
  type SimulationResponse,
  type SimulationWorker,
} from "./simulation";
import type {} from "./simulation.worker";
import { createSimulationWorker } from "./simulation-worker";
import type { World } from "./types";

test("The worker factory normalizes URLs, strings and TrustedScriptURL values into the scoped bootstrap", () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const constructed: URL[] = [];
  class BrowserWorker {
    constructor(url: URL) {
      constructed.push(new URL(String(url)));
    }
  }
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: BrowserWorker,
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    writable: true,
    value: { origin: "https://game.example" },
  });
  try {
    const entry = new URL("https://game.example/_next/static/chunks/simulation-123.js");
    const trusted = { toString: () => entry.href };
    assert.equal("origin" in trusted, false);
    assert.equal("pathname" in trusted, false);
    for (const input of [entry, entry.href, trusted]) {
      const worker = createSimulationWorker(input as URL);
      assert.ok(worker instanceof BrowserWorker);
    }
    assert.equal(constructed.length, 3);
    for (const url of constructed) {
      assert.equal(url.origin, entry.origin);
      assert.equal(url.pathname, "/games/europa-war/simulation-worker.js");
      assert.equal(url.searchParams.get("entry"), entry.pathname);
      assert.deepEqual([...url.searchParams.keys()], ["entry"]);
      assert.equal(url.href, constructed[0].href);
    }
    const foreign = new URL("https://other.example/_next/static/chunks/simulation.js");
    for (const input of [foreign, foreign.href, { toString: () => foreign.href }]) {
      assert.throws(() => createSimulationWorker(input as URL), /this origin/);
    }
    assert.equal(constructed.length, 3, "A foreign entry must not construct a worker");
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, "Worker", previousWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
    if (previousLocation) Object.defineProperty(globalThis, "location", previousLocation);
    else Reflect.deleteProperty(globalThis, "location");
  }
});

class Clock {
  now = 0;
  nextId = 0;
  timers = new Map<number, { due: number; run: () => void }>();
  setTimer = (run: () => void, delay: number) => {
    const id = ++this.nextId;
    this.timers.set(id, { due: this.now + delay, run });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  clearTimer = (id: ReturnType<typeof setTimeout>) => {
    this.timers.delete(id as unknown as number);
  };
  advance(ms: number) {
    const end = this.now + ms;
    let runs = 0;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      assert.ok(++runs < 1000, "The scheduler must yield instead of spinning");
      this.now = next[1].due;
      this.timers.delete(next[0]);
      next[1].run();
    }
    this.now = end;
  }
}

class FakeWorker implements SimulationWorker {
  onmessage: SimulationWorker["onmessage"] = null;
  onerror: SimulationWorker["onerror"] = null;
  onmessageerror: SimulationWorker["onmessageerror"] = null;
  requests: SimulationRequest[] = [];
  terminated = false;
  postMessageError: Error | null = null;
  postMessage(request: SimulationRequest) {
    if (this.postMessageError) throw this.postMessageError;
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  finish(request: SimulationRequest, result = world(request.world.day + 1)) {
    this.onmessage?.({
      data: {
        type: "result",
        id: request.id,
        revision: request.revision,
        world: result,
      },
    });
  }
}

// The scheduler transports worlds without inspecting engine state.
function world(day = 0, player = "turkey") {
  return { day, player } as World;
}

function fixture(options: {
  timeoutMs?: number;
  createError?: boolean;
  canRun?: () => boolean;
} = {}) {
  const clock = new Clock();
  const workers: FakeWorker[] = [];
  const published: World[] = [];
  const errors: string[] = [];
  const assets: string[][] = [];
  const initial = world();
  const controller = new SimulationController({
    createWorker: () => {
      if (options.createError) throw new Error("Worker unavailable");
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    onWorld: (result) => published.push(result),
    onError: (error) => errors.push(error),
    onAssets: (urls) => assets.push(urls),
    canRun: options.canRun,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    timeoutMs: options.timeoutMs,
  });
  controller.setWorld(initial);
  const start = (speed = 1) => {
    controller.setSpeed(speed);
    controller.setRunning(true);
    clock.advance(1000 / speed);
    assert.equal(workers.length, 1);
    return workers[0];
  };
  return { clock, workers, published, errors, assets, initial, controller, start };
}

test("Initialization can expose offline worker assets without advancing a paused campaign", () => {
  const f = fixture();
  f.controller.initialize();
  f.controller.initialize();
  assert.equal(f.workers.length, 1);
  const worker = f.workers[0];
  const assets = ["/_next/static/chunks/simulation.worker.js"];
  worker.onmessage?.({ data: { type: "ready", assets } });
  assert.deepEqual(f.assets, [assets]);
  f.clock.advance(60_000);
  assert.deepEqual(worker.requests, []);
  assert.equal(f.published.length, 0);
  f.controller.dispose();
});

test("Simulation creates its worker lazily and never advances a paused campaign", () => {
  const f = fixture();
  f.clock.advance(60_000);
  assert.equal(f.workers.length, 0);
  assert.equal(f.published.length, 0);
  f.controller.setRunning(true);
  f.clock.advance(999);
  assert.equal(f.workers.length, 0);
  f.clock.advance(1);
  assert.equal(f.workers.length, 1);
  assert.equal(f.workers[0].requests.length, 1);
  assert.equal(f.workers[0].requests[0].world, f.initial);
  f.controller.dispose();
});

test("A slow daily step has one in-flight request and schedules from completion", () => {
  const f = fixture();
  const worker = f.start(5);
  f.clock.advance(8000);
  assert.equal(worker.requests.length, 1, "Slow hardware must not queue days");
  const result = world(1);
  worker.finish(worker.requests[0], result);
  assert.deepEqual(f.published, [result]);
  f.clock.advance(199);
  assert.equal(worker.requests.length, 1);
  f.clock.advance(1);
  assert.equal(worker.requests.length, 2);
  assert.equal(worker.requests[1].world, result);
  assert.notEqual(worker.requests[1].id, worker.requests[0].id);
  f.controller.dispose();
});

test("A command replaces the authoritative world immediately and stale work cannot overwrite it", () => {
  const f = fixture();
  const worker = f.start();
  const obsolete = worker.requests[0];
  const commanded = { ...f.initial, tension: 42 };
  f.controller.setWorld(commanded);
  f.clock.advance(2000);
  assert.equal(worker.requests.length, 1, "Invalidation must not queue another job");
  worker.finish(obsolete);
  assert.equal(f.published.length, 0);
  f.clock.advance(1000);
  assert.equal(worker.requests.length, 2);
  const next = worker.requests[1];
  assert.equal(next.world, commanded);
  assert.notEqual(next.revision, obsolete.revision);
  const result = { ...commanded, day: 1 };
  worker.finish(next, result);
  assert.deepEqual(f.published, [result]);
  f.controller.dispose();
});

test("Multiple commands during one step keep the newest state without a request backlog", () => {
  const f = fixture();
  const worker = f.start(5);
  const obsolete = worker.requests[0];
  for (let i = 1; i <= 12; i++) {
    f.controller.setWorld({ ...f.initial, tension: i });
    f.clock.advance(100);
  }
  assert.equal(worker.requests.length, 1);
  worker.finish(obsolete);
  assert.equal(f.published.length, 0);
  f.clock.advance(200);
  assert.equal(worker.requests.length, 2);
  assert.equal(worker.requests[1].world.tension, 12);
  f.controller.dispose();
});

test("Loading a campaign while a step runs never publishes the previous campaign", () => {
  const f = fixture();
  const worker = f.start();
  const oldRequest = worker.requests[0];
  const restored = world(125, "france");
  f.controller.setRunning(false);
  f.controller.setWorld(restored);
  worker.finish(oldRequest);
  f.clock.advance(60_000);
  assert.equal(f.published.length, 0);
  assert.equal(worker.requests.length, 1);
  f.controller.setRunning(true);
  f.clock.advance(1000);
  assert.equal(worker.requests[1].world, restored);
  worker.finish(worker.requests[1], world(126, "france"));
  assert.equal(f.published[0].player, "france");
  assert.equal(f.published[0].day, 126);
  f.controller.dispose();
});

test("Pause and resume before a reply discard that reply and do not run overlapping steps", () => {
  const f = fixture();
  const worker = f.start();
  f.controller.setRunning(false);
  f.controller.setRunning(true);
  f.clock.advance(2000);
  assert.equal(worker.requests.length, 1);
  worker.finish(worker.requests[0]);
  assert.equal(f.published.length, 0);
  f.clock.advance(1000);
  assert.equal(worker.requests.length, 2);
  assert.equal(worker.requests[1].world, f.initial);
  worker.finish(worker.requests[1]);
  assert.equal(f.published.length, 1);
  f.controller.dispose();
});

test("Pausing before the next step cancels scheduled work", () => {
  const f = fixture();
  f.controller.setRunning(true);
  f.clock.advance(500);
  f.controller.setRunning(false);
  f.clock.advance(60_000);
  assert.equal(f.workers.length, 0);
  assert.equal(f.clock.timers.size, 0);
  f.controller.dispose();
});

test("Removing the campaign invalidates a running step and prevents further work", () => {
  const f = fixture();
  const worker = f.start();
  f.controller.setWorld(null);
  worker.finish(worker.requests[0]);
  f.clock.advance(60_000);
  assert.equal(f.published.length, 0);
  assert.equal(worker.requests.length, 1);
  f.controller.dispose();
});

test("Changing speed during a step applies to the next delay without queuing extra work", () => {
  const f = fixture();
  const worker = f.start();
  f.controller.setSpeed(5);
  f.clock.advance(1000);
  assert.equal(worker.requests.length, 1);
  worker.finish(worker.requests[0]);
  f.clock.advance(199);
  assert.equal(worker.requests.length, 1);
  f.clock.advance(1);
  assert.equal(worker.requests.length, 2);
  f.controller.dispose();
});

test("A duplicated reply cannot publish twice or complete a newer request", () => {
  const f = fixture();
  const worker = f.start();
  const first = worker.requests[0];
  worker.finish(first);
  f.clock.advance(1000);
  assert.equal(worker.requests.length, 2);
  worker.finish(first, world(999));
  assert.equal(f.published.length, 1);
  worker.finish(worker.requests[1], world(2));
  assert.deepEqual(f.published.map((w) => w.day), [1, 2]);
  f.controller.dispose();
});

test("A worker timeout reports once, preserves the latest world and stops scheduling", () => {
  const f = fixture({ timeoutMs: 2000 });
  const worker = f.start();
  const lateReply = worker.onmessage!;
  const request = worker.requests[0];
  f.controller.setWorld({ ...f.initial, tension: 66 });
  f.clock.advance(2000);
  assert.equal(f.errors.length, 1);
  assert.ok(f.errors[0].length > 0);
  assert.equal(worker.terminated, true);
  assert.equal(f.published.length, 0);
  lateReply({
    data: {
      type: "result",
      id: request.id,
      revision: request.revision,
      world: world(1),
    },
  });
  f.clock.advance(60_000);
  assert.equal(f.published.length, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(f.workers.length, 1);
  assert.equal(f.clock.timers.size, 0);
  f.controller.dispose();
});

test("Worker startup failures pause without simulating on the main thread", () => {
  const f = fixture({ createError: true });
  f.controller.setRunning(true);
  f.clock.advance(1000);
  assert.equal(f.errors.length, 1);
  assert.equal(f.published.length, 0);
  f.clock.advance(60_000);
  assert.equal(f.errors.length, 1);
  assert.equal(f.clock.timers.size, 0);
  f.controller.dispose();
});

test("Failure to send a world to the worker clears pending work and reports the failure", () => {
  const f = fixture();
  f.controller.initialize();
  const worker = f.workers[0];
  worker.postMessageError = new Error("World could not be cloned");
  f.controller.setRunning(true);
  f.clock.advance(1000);
  assert.equal(f.errors.length, 1);
  assert.equal(worker.terminated, true);
  assert.equal(f.published.length, 0);
  f.clock.advance(60_000);
  assert.equal(f.errors.length, 1);
  assert.equal(f.clock.timers.size, 0);
  f.controller.dispose();
});

test("Worker computation and transport errors stop the loop and preserve the current save", () => {
  for (const failure of ["response", "error", "messageerror"] as const) {
    const f = fixture();
    const worker = f.start();
    const request = worker.requests[0];
    if (failure === "response") {
      worker.onmessage?.({
        data: {
          type: "error",
          id: request.id,
          revision: request.revision,
          error: "Daily simulation failed",
        },
      });
    } else if (failure === "error") worker.onerror?.({ message: "Worker failed" });
    else worker.onmessageerror?.();
    assert.equal(f.errors.length, 1, failure);
    assert.equal(f.published.length, 0, failure);
    assert.equal(worker.terminated, true, failure);
    f.clock.advance(60_000);
    assert.equal(f.workers.length, 1, failure);
    assert.equal(f.errors.length, 1, failure);
    assert.equal(f.clock.timers.size, 0, failure);
    f.controller.dispose();
  }
});

test("Disposal clears all timers and ignores queued callbacks after unmount", () => {
  const f = fixture();
  const worker = f.start();
  const lateReply = worker.onmessage!;
  const lateError = worker.onerror!;
  const request = worker.requests[0];
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(worker.terminated, true);
  assert.equal(f.clock.timers.size, 0);
  lateReply({
    data: { type: "result", id: request.id, revision: request.revision, world: world(1) },
  });
  lateError({ message: "Queued error after unmount" });
  f.clock.advance(60_000);
  assert.equal(f.published.length, 0);
  assert.deepEqual(f.errors, []);
  assert.equal(f.workers.length, 1);
});

test("A hidden document cannot accept a completed step before its visibility event runs", () => {
  let visible = true;
  const f = fixture({ canRun: () => visible });
  const worker = f.start();
  visible = false;
  worker.finish(worker.requests[0]);
  assert.equal(f.published.length, 0);
  f.controller.setRunning(false);
  f.clock.advance(60_000);
  assert.equal(worker.requests.length, 1);
  visible = true;
  f.controller.setRunning(true);
  f.clock.advance(1000);
  assert.equal(worker.requests[1].world, f.initial);
  f.controller.dispose();
});

test("A hidden document cannot start a scheduled step before its visibility event runs", () => {
  let visible = true;
  const f = fixture({ canRun: () => visible });
  f.controller.setRunning(true);
  visible = false;
  f.clock.advance(1000);
  assert.equal(f.workers.length, 0);
  assert.equal(f.published.length, 0);
  f.controller.setRunning(false);
  f.clock.advance(60_000);
  assert.equal(f.clock.timers.size, 0);
  f.controller.dispose();
});

test("The real worker entry returns the deterministic daily engine result across a thread", { timeout: 10_000 }, async (t) => {
  const worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     globalThis.self = globalThis;
     globalThis.location = { href: require("node:url").pathToFileURL(workerData.entry).href };
     globalThis.postMessage = parentPort.postMessage.bind(parentPort);
     parentPort.on("message", data => globalThis.onmessage({ data }));
     require(workerData.entry);`,
    {
      eval: true,
      workerData: { entry: require.resolve("./simulation.worker") },
    },
  );
  t.after(() => worker.terminate());
  const [ready] = (await once(worker, "message")) as [SimulationResponse];
  assert.equal(ready.type, "ready");
  if (ready.type !== "ready") assert.fail("Worker must report ready before a day starts");
  assert.equal(ready.assets.length, 1);
  assert.match(ready.assets[0], /simulation\.worker\.js$/);

  const input = createWorld("turkey", "historical", 1936, "easy");
  const snapshot = structuredClone(input);
  const reply = once(worker, "message");
  const request: SimulationRequest = {
    type: "advance",
    id: 17,
    revision: 8,
    world: input,
  };
  worker.postMessage(request);
  const [response] = (await reply) as [SimulationResponse];
  assert.equal(response.type, "result");
  if (response.type !== "result") assert.fail("Worker must return a computed world");
  assert.equal(response.id, request.id);
  assert.equal(response.revision, request.revision);
  assert.deepEqual(response.world, advanceDay(input));
  assert.deepEqual(input, snapshot, "Sending and advancing a world must preserve its source");
});
