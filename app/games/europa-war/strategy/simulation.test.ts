import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { isDeepStrictEqual } from "node:util";
import { advanceHour, createWorld } from "./engine";
import {
  SimulationController,
  SIMULATION_HOUR_MS,
  type SimulationRequest,
  type SimulationResponse,
  type SimulationWorker,
  type SimulationDiagnostics,
} from "./simulation";
import type {} from "./simulation.worker";
import { createSimulationWorker } from "./simulation-worker";
import type { World } from "./types";
import {
  acceptStateTransfer,
  createStateTransfer,
  SIMULATION_PROTOCOL,
  statePayloadBytes,
} from "./simulation-state";
import { worldHour } from "./time";
import { createCommand, executeCommand } from "./commands";

test("1× ve 5× aynı oyun saatlerindeki emirlerle aynı gerçek simülasyonu üretir", () => {
  function run(speed: number) {
    const clock = new Clock();
    const worker = new FakeWorker();
    let current = createWorld("turkey", "alternative", 77);
    const controller = new SimulationController({
      createWorker: () => worker,
      onWorld: (next) => {
        current = next;
      },
      onError: (message) => assert.fail(message),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    controller.setWorld(current);
    controller.setSpeed(speed);
    controller.setRunning(true);
    for (let hour = 0; hour < 30; hour++) {
      if (hour === 5 || hour === 20) {
        const command = createCommand(current, {
          type: "commanderAutoAssign",
          enabled: hour === 20,
        });
        const result = executeCommand(current, command, current.player);
        assert.equal(result.status, "applied");
        current = result.world;
        controller.setWorld(current);
      }
      clock.advance(SIMULATION_HOUR_MS / speed);
      const request = worker.requests.at(-1)!;
      worker.finish(request, advanceHour(current));
    }
    controller.dispose();
    return current;
  }
  assert.deepEqual(run(1), run(5));
});

test("The worker factory normalizes URLs, strings and TrustedScriptURL values into the scoped bootstrap", () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const previousLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
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
    const entry = new URL(
      "https://game.example/_next/static/chunks/simulation-123.js",
    );
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
    const foreign = new URL(
      "https://other.example/_next/static/chunks/simulation.js",
    );
    for (const input of [
      foreign,
      foreign.href,
      { toString: () => foreign.href },
    ]) {
      assert.throws(() => createSimulationWorker(input as URL), /this origin/);
    }
    assert.equal(
      constructed.length,
      3,
      "A foreign entry must not construct a worker",
    );
  } finally {
    if (previousWorker)
      Object.defineProperty(globalThis, "Worker", previousWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
    if (previousLocation)
      Object.defineProperty(globalThis, "location", previousLocation);
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
  snapshot: World | null = null;
  postMessage(request: SimulationRequest) {
    if (this.postMessageError) throw this.postMessageError;
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  finish(request: SimulationRequest, result?: World) {
    const source = request.world ?? this.snapshot;
    assert.ok(source, "A worker needs a full initial snapshot");
    result ??= world(worldHour(source) + 1, source.player);
    this.snapshot = result;
    this.onmessage?.({
      data: resultResponse(request, result),
    });
  }
}

// The scheduler transports worlds without inspecting engine state.
function world(tick = 0, player = "turkey") {
  return { day: Math.floor(tick / 24), hour: tick % 24, player } as World;
}
function resultResponse(
  request: SimulationRequest,
  result: World,
): Extract<SimulationResponse, { type: "result" }> {
  const state = { kind: "snapshot" as const, world: result };
  const bytes = statePayloadBytes(state);
  return {
    type: "result",
    protocol: SIMULATION_PROTOCOL,
    id: request.id,
    revision: request.revision,
    baseTick: request.baseTick,
    nextTick: request.baseTick + 1,
    state,
    metrics: {
      transport: "snapshot",
      payloadBytes: bytes,
      snapshotBytes: bytes,
      computeMs: 1,
      encodeMs: 1,
    },
  };
}

function fixture(
  options: {
    timeoutMs?: number;
    createError?: boolean;
    canRun?: () => boolean;
  } = {},
) {
  const clock = new Clock();
  const workers: FakeWorker[] = [];
  const published: World[] = [];
  const errors: string[] = [];
  const assets: string[][] = [];
  const diagnostics: SimulationDiagnostics[] = [];
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
    onDiagnostics: (entry) => diagnostics.push(entry),
    canRun: options.canRun,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    timeoutMs: options.timeoutMs,
  });
  controller.setWorld(initial);
  const start = (speed = 1) => {
    controller.setSpeed(speed);
    controller.setRunning(true);
    clock.advance(SIMULATION_HOUR_MS / speed);
    assert.equal(workers.length, 1);
    return workers[0];
  };
  return {
    clock,
    workers,
    published,
    errors,
    assets,
    diagnostics,
    initial,
    controller,
    start,
  };
}

test("Tarih sınırında worker başlatmadan anlaşılır bildirimle durur ve kayıt korunur", () => {
  const f = fixture();
  const last = { ...world(), day: 36500, hour: 23 };
  f.controller.setWorld(last);
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(f.workers.length, 0);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /tarih sınırına/);
  assert.equal(f.published.length, 0);
  f.clock.advance(60_000);
  assert.equal(f.errors.length, 1);
  assert.equal(last.day, 36500);
  assert.equal(last.hour, 23);
  f.controller.dispose();
});

test("Initialization can expose offline worker assets without advancing a paused campaign", () => {
  const f = fixture();
  f.controller.initialize();
  f.controller.initialize();
  assert.equal(f.workers.length, 1);
  const worker = f.workers[0];
  const assets = ["/_next/static/chunks/simulation.worker.js"];
  worker.onmessage?.({
    data: { type: "ready", protocol: SIMULATION_PROTOCOL, assets },
  });
  assert.deepEqual(f.assets, [assets]);
  f.clock.advance(60_000);
  assert.deepEqual(worker.requests, []);
  assert.equal(f.published.length, 0);
  f.controller.dispose();
});

test("An obsolete cached worker protocol stops immediately before accepting any state", () => {
  const f = fixture();
  f.controller.initialize();
  const worker = f.workers[0];
  worker.onmessage?.({ data: { type: "ready", protocol: 1 as 2, assets: [] } });
  assert.equal(worker.terminated, true);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /sürümü oyunla uyuşmadı/);
  assert.equal(f.assets.length, 0);
  assert.equal(f.published.length, 0);
  assert.equal(f.diagnostics.length, 0);
  f.controller.dispose();
});

test("Simulation creates its worker lazily and never advances a paused campaign", () => {
  const f = fixture();
  f.clock.advance(60_000);
  assert.equal(f.workers.length, 0);
  assert.equal(f.published.length, 0);
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS - 1);
  assert.equal(f.workers.length, 0);
  f.clock.advance(1);
  assert.equal(f.workers.length, 1);
  assert.equal(f.workers[0].requests.length, 1);
  assert.equal(f.workers[0].requests[0].world, f.initial);
  f.controller.dispose();
});

test("Normal pace waits 150 ms per hour and 1–5× retain their relative intervals", () => {
  assert.equal(SIMULATION_HOUR_MS, 150);
  for (const speed of [1, 2, 3, 4, 5]) {
    const interval = SIMULATION_HOUR_MS / speed;
    const f = fixture();
    f.controller.setSpeed(speed);
    f.controller.setRunning(true);
    f.clock.advance(interval - 1);
    assert.equal(f.workers.length, 0, `${speed}× must not advance early`);
    f.clock.advance(1);
    assert.equal(f.workers.length, 1, `${speed}× must start at its interval`);
    const worker = f.workers[0];
    assert.equal(worker.requests.length, 1);
    // A slow computation must neither consume the next interval nor queue days.
    f.clock.advance(3000);
    assert.equal(worker.requests.length, 1);
    worker.finish(worker.requests[0]);
    f.clock.advance(interval - 1);
    assert.equal(worker.requests.length, 1);
    f.clock.advance(1);
    assert.equal(worker.requests.length, 2);
    assert.deepEqual(f.published.map(worldHour), [1]);
    f.controller.dispose();
  }
});

test("Changing a scheduled speed replaces its delay; pause and resume never catch up missed days", () => {
  const f = fixture();
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS * 0.85);
  f.controller.setSpeed(2);
  f.clock.advance(SIMULATION_HOUR_MS * 0.15);
  assert.equal(f.workers.length, 0, "The old 1× timer must be cancelled");
  f.clock.advance(SIMULATION_HOUR_MS * 0.35 - 1);
  assert.equal(f.workers.length, 0, "The new 2× interval starts when selected");
  f.clock.advance(1);
  const worker = f.workers[0];
  assert.equal(worker.requests.length, 1);
  worker.finish(worker.requests[0]);
  f.clock.advance(SIMULATION_HOUR_MS / 4);
  f.controller.setRunning(false);
  f.clock.advance(60_000);
  assert.equal(worker.requests.length, 1);
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS / 2 - 1);
  assert.equal(worker.requests.length, 1, "Resume waits a full 2× interval");
  f.clock.advance(1);
  assert.equal(worker.requests.length, 2);
  assert.deepEqual(f.published.map(worldHour), [1]);
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
  f.clock.advance(SIMULATION_HOUR_MS / 5 - 1);
  assert.equal(worker.requests.length, 1);
  f.clock.advance(1);
  assert.equal(worker.requests.length, 2);
  assert.equal(
    "world" in worker.requests[1],
    false,
    "An accepted day must reuse the worker snapshot without cloning the campaign",
  );
  assert.equal(worker.requests[1].revision, worker.requests[0].revision);
  assert.notEqual(worker.requests[1].id, worker.requests[0].id);
  f.controller.dispose();
});

test("Continuous accepted days send only advance metadata, including after a speed change", () => {
  const f = fixture();
  const worker = f.start();
  const revision = worker.requests[0].revision;
  for (let day = 1; day <= 5; day++) {
    worker.finish(worker.requests.at(-1)!);
    f.controller.setSpeed(day);
    f.clock.advance(SIMULATION_HOUR_MS / day);
    const request = worker.requests.at(-1)!;
    assert.deepEqual(Object.keys(request).sort(), [
      "baseTick",
      "id",
      "protocol",
      "revision",
      "type",
    ]);
    assert.equal(request.revision, revision);
  }
  assert.deepEqual(f.published.map(worldHour), [1, 2, 3, 4, 5]);
  f.controller.dispose();
});

test("A cached worker resynchronizes after a command, stale paused step and new campaign", () => {
  const f = fixture();
  const worker = f.start();
  worker.finish(worker.requests[0]);
  f.clock.advance(SIMULATION_HOUR_MS);
  const obsolete = worker.requests.at(-1)!;
  assert.equal("world" in obsolete, false);
  const commanded = { ...f.published[0], tension: 73 };
  f.controller.setWorld(commanded);
  worker.finish(obsolete, world(2));
  assert.equal(f.published.length, 1);
  f.clock.advance(SIMULATION_HOUR_MS);
  const synchronized = worker.requests.at(-1)!;
  assert.equal(synchronized.world, commanded);
  assert.notEqual(synchronized.revision, obsolete.revision);
  const accepted = { ...commanded, hour: 2 };
  worker.finish(synchronized, accepted);
  f.clock.advance(SIMULATION_HOUR_MS);
  const paused = worker.requests.at(-1)!;
  assert.equal("world" in paused, false);
  f.controller.setRunning(false);
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(
    worker.requests.at(-1),
    paused,
    "A stale step still occupies the worker",
  );
  worker.finish(paused, world(3));
  assert.equal(f.published.length, 2);
  f.clock.advance(SIMULATION_HOUR_MS);
  const resumed = worker.requests.at(-1)!;
  assert.equal(
    resumed.world,
    accepted,
    "Resume must discard the worker's unaccepted day",
  );
  worker.finish(resumed, { ...accepted, hour: 3 });
  f.clock.advance(SIMULATION_HOUR_MS);
  const oldCampaign = worker.requests.at(-1)!;
  const replacement = world(125, "france");
  f.controller.setWorld(replacement);
  worker.finish(oldCampaign, world(4));
  f.clock.advance(SIMULATION_HOUR_MS);
  const restored = worker.requests.at(-1)!;
  assert.equal(restored.world, replacement);
  worker.finish(restored);
  assert.equal(f.published.at(-1)?.player, "france");
  assert.equal(worldHour(f.published.at(-1)!), 126);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal("world" in worker.requests.at(-1)!, false);
  f.controller.dispose();
});

test("Retry after a cached worker fails sends the last accepted world to the new worker", () => {
  const f = fixture();
  const worker = f.start();
  const accepted = world(1);
  worker.finish(worker.requests[0], accepted);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal("world" in worker.requests.at(-1)!, false);
  worker.onerror?.({ message: "Worker failed" });
  assert.equal(worker.terminated, true);
  assert.equal(f.errors.length, 1);
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(f.workers.length, 2);
  const replacement = f.workers[1];
  assert.equal(replacement.requests[0].world, accepted);
  replacement.finish(replacement.requests[0]);
  assert.deepEqual(f.published.map(worldHour), [1, 2]);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal("world" in replacement.requests.at(-1)!, false);
  f.controller.dispose();
});

test("A command replaces the authoritative world immediately and stale work cannot overwrite it", () => {
  const f = fixture();
  const worker = f.start();
  const obsolete = worker.requests[0];
  const commanded = { ...f.initial, tension: 42 };
  f.controller.setWorld(commanded);
  f.clock.advance(2000);
  assert.equal(
    worker.requests.length,
    1,
    "Invalidation must not queue another job",
  );
  worker.finish(obsolete);
  assert.equal(f.published.length, 0);
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(worker.requests.length, 2);
  const next = worker.requests[1];
  assert.equal(next.world, commanded);
  assert.notEqual(next.revision, obsolete.revision);
  const result = { ...commanded, hour: 1 };
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
  f.clock.advance(SIMULATION_HOUR_MS / 5);
  assert.equal(worker.requests.length, 2);
  assert.equal(worker.requests[1].world?.tension, 12);
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
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(worker.requests[1].world, restored);
  worker.finish(worker.requests[1], world(126, "france"));
  assert.equal(f.published[0].player, "france");
  assert.equal(worldHour(f.published[0]), 126);
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
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(worker.requests.length, 2);
  assert.equal(worker.requests[1].world, f.initial);
  worker.finish(worker.requests[1]);
  assert.equal(f.published.length, 1);
  f.controller.dispose();
});

test("Pausing before the next step cancels scheduled work", () => {
  const f = fixture();
  f.controller.setRunning(true);
  f.clock.advance(SIMULATION_HOUR_MS / 4);
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
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(worker.requests.length, 1);
  worker.finish(worker.requests[0]);
  f.clock.advance(SIMULATION_HOUR_MS / 5 - 1);
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
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(worker.requests.length, 2);
  worker.finish(first, world(999));
  assert.equal(f.published.length, 1);
  worker.finish(worker.requests[1], world(2));
  assert.deepEqual(f.published.map(worldHour), [1, 2]);
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
    data: resultResponse(request, world(1)),
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
  f.clock.advance(SIMULATION_HOUR_MS);
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
  f.clock.advance(SIMULATION_HOUR_MS);
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
          protocol: SIMULATION_PROTOCOL,
          id: request.id,
          revision: request.revision,
          error: "Daily simulation failed",
        },
      });
    } else if (failure === "error")
      worker.onerror?.({ message: "Worker failed" });
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
    data: resultResponse(request, world(1)),
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
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(worker.requests[1].world, f.initial);
  f.controller.dispose();
});

test("A hidden document cannot start a scheduled step before its visibility event runs", () => {
  let visible = true;
  const f = fixture({ canRun: () => visible });
  f.controller.setRunning(true);
  visible = false;
  f.clock.advance(SIMULATION_HOUR_MS);
  assert.equal(f.workers.length, 0);
  assert.equal(f.published.length, 0);
  f.controller.setRunning(false);
  f.clock.advance(60_000);
  assert.equal(f.clock.timers.size, 0);
  f.controller.dispose();
});

test("Accepted deltas preserve unchanged references and publish measured diagnostics once", () => {
  const f = fixture();
  const before = createWorld("turkey");
  f.controller.setWorld(before);
  const worker = f.start();
  const request = worker.requests[0];
  const after = advanceHour(before);
  const transfer = createStateTransfer(before, after);
  const response: SimulationResponse = {
    ...resultResponse(request, after),
    ...transfer,
    metrics: { ...transfer.metrics, computeMs: 12, encodeMs: 3 },
    summary: { format: 1, tick: 1, digest: "ew1:0123456789abcdef" },
  };
  worker.onmessage?.({ data: response });
  assert.deepEqual(f.published[0], after);
  for (const id of Object.keys(before.countries))
    if (after.countries[id] === before.countries[id])
      assert.equal(f.published[0].countries[id], before.countries[id], id);
  assert.equal(f.diagnostics.length, 1);
  assert.equal(f.diagnostics[0].tick, 1);
  assert.equal(f.diagnostics[0].transport, "delta");
  assert.equal(f.diagnostics[0].computeMs, 12);
  worker.onmessage?.({ data: response });
  assert.equal(f.diagnostics.length, 1);
  f.controller.dispose();
});

test("Malformed result protocol, tick or patch pauses atomically and retry sends full authoritative state", () => {
  for (const failure of [
    "protocol",
    "base",
    "next",
    "patch",
    "metrics",
    "summary",
  ] as const) {
    const f = fixture();
    const before = createWorld("turkey");
    const immutable = structuredClone(before);
    f.controller.setWorld(before);
    const worker = f.start();
    const request = worker.requests[0];
    const after = advanceHour(before);
    const transfer = createStateTransfer(before, after);
    const response = {
      ...resultResponse(request, after),
      ...transfer,
      metrics: { ...transfer.metrics, computeMs: 1, encodeMs: 1 },
    };
    if (failure === "protocol") response.protocol = 1 as 2;
    if (failure === "base") response.baseTick++;
    if (failure === "next") response.nextTick++;
    if (failure === "patch")
      response.state = {
        kind: "delta",
        patch: {
          kind: "object",
          changes: {},
          removed: ["player", "no-such-field"],
        },
      };
    if (failure === "metrics") response.metrics.payloadBytes = NaN;
    if (failure === "summary")
      response.summary = { format: 1, tick: 999, digest: "bad" };
    worker.onmessage?.({ data: response });
    assert.equal(f.errors.length, 1, failure);
    assert.match(f.errors[0], /seferle uyuşmadı/);
    assert.equal(f.published.length, 0);
    assert.equal(f.diagnostics.length, 0);
    assert.equal(worker.terminated, true);
    assert.deepEqual(before, immutable);
    f.clock.advance(30_000);
    assert.equal(worker.requests.length, 1);
    f.controller.setRunning(true);
    f.clock.advance(SIMULATION_HOUR_MS);
    assert.equal(f.workers[1].requests[0].world, before);
    f.controller.dispose();
  }
});

test(
  "The real worker transfers deterministic deltas, rejects stale ticks and resynchronizes changed campaigns",
  { timeout: 20_000 },
  async (t) => {
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
    if (ready.type !== "ready") assert.fail("Worker must report ready");
    assert.equal(ready.assets.length, 1);
    assert.match(ready.assets[0], /simulation\.worker\.js$/);
    async function advance(request: SimulationRequest) {
      const reply = once(worker, "message");
      worker.postMessage(request);
      return (await reply)[0] as SimulationResponse;
    }
    function request(
      id: number,
      revision: number,
      base: World,
      full = false,
    ): SimulationRequest {
      return {
        type: "advance",
        protocol: SIMULATION_PROTOCOL,
        id,
        revision,
        baseTick: worldHour(base),
        ...(full ? { world: base } : {}),
      };
    }
    function accept(before: World, response: SimulationResponse): World {
      if (response.type !== "result")
        assert.fail("Worker must return a result");
      assert.equal(response.protocol, SIMULATION_PROTOCOL);
      assert.equal(response.metrics.transport, response.state.kind);
      assert.ok(
        response.metrics.payloadBytes <= response.metrics.snapshotBytes,
      );
      assert.ok(
        response.metrics.computeMs >= 0 && response.metrics.encodeMs >= 0,
      );
      return acceptStateTransfer(
        before,
        response.state,
        response.baseTick,
        response.nextTick,
      );
    }
    const input = createWorld("turkey", "historical", 1936, "easy");
    const snapshot = structuredClone(input);
    const firstRequest = request(17, 8, input, true);
    const response = await advance(firstRequest);
    assert.equal(response.type, "result");
    if (response.type !== "result") assert.fail("Worker must return a result");
    assert.equal(response.id, firstRequest.id);
    assert.equal(response.revision, firstRequest.revision);
    assert.equal(response.state.kind, "delta");
    assert.ok(
      response.metrics.payloadBytes < response.metrics.snapshotBytes * 0.25,
    );
    assert.equal(response.summary?.tick, 1);
    let current = accept(input, response);
    assert.deepEqual(current, advanceHour(input));
    assert.deepEqual(input, snapshot, "Source must remain immutable");
    for (let id = 18; id <= 43; id++) {
      const next = await advance(request(id, 8, current));
      const previous = current;
      current = accept(current, next);
      assert.deepEqual(current, advanceHour(previous));
      if (next.type === "result") {
        assert.equal(!!next.summary, current.hour === 0);
        if (current.hour !== 0) {
          // Understrength guards can spend replacement manpower hourly, and
          // tactical AI can issue paid orders between daily settlements.
          // Unchanged country branches must still retain their identities.
          let unchanged = 0;
          for (const id of Object.keys(current.countries)) {
            if (
              isDeepStrictEqual(current.countries[id], previous.countries[id])
            ) {
              assert.equal(current.countries[id], previous.countries[id]);
              unchanged++;
            }
          }
          assert.ok(unchanged > 0);
        }
      }
    }
    const obsolete = await advance(request(44, 9, current));
    assert.equal(
      obsolete.type,
      "error",
      "Uncached revision cannot use old world",
    );
    const commanded = { ...current, tension: 73 };
    const resynced = await advance(request(45, 9, commanded, true));
    current = accept(commanded, resynced);
    assert.deepEqual(current, advanceHour(commanded));
    const staleTick = await advance({
      ...request(46, 9, current),
      baseTick: worldHour(current) - 1,
    });
    assert.equal(
      staleTick.type,
      "error",
      "A duplicate base tick cannot advance twice",
    );
    const replacement = createWorld("france", "historical", 1936, "easy");
    replacement.day = 125;
    const restored = await advance(request(47, 10, replacement, true));
    current = accept(replacement, restored);
    assert.deepEqual(current, advanceHour(replacement));
    const continued = await advance(request(48, 10, current));
    assert.deepEqual(accept(current, continued), advanceHour(current));
    const unsupported = await advance({
      ...request(49, 10, current),
      protocol: 1 as 2,
    });
    assert.equal(unsupported.type, "error");
  },
);
