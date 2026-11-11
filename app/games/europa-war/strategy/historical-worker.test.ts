import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld } from "./world";
import type { World } from "./types";
import {
  hasPendingPlayerDecision,
  SimulationController,
  SIMULATION_HOUR_MS,
  type SimulationRequest,
  type SimulationWorker,
} from "./simulation";
import {
  acceptStateTransfer,
  createStateTransfer,
  SIMULATION_PROTOCOL,
} from "./simulation-state";
import { fingerprintWorld } from "./world-digest";
import { worldHour } from "./time";

class Clock {
  now = 0;
  serial = 0;
  timers = new Map<number, { due: number; run: () => void }>();
  setTimer = (run: () => void, delay: number) => {
    const id = ++this.serial;
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
      assert.ok(++runs < 1000, "The scheduler must yield");
      this.now = next[1].due;
      this.timers.delete(next[0]);
      next[1].run();
    }
    this.now = end;
  }
}

class Worker implements SimulationWorker {
  onmessage: SimulationWorker["onmessage"] = null;
  onerror: SimulationWorker["onerror"] = null;
  onmessageerror: SimulationWorker["onmessageerror"] = null;
  requests: SimulationRequest[] = [];
  postMessage(request: SimulationRequest) {
    this.requests.push(request);
  }
  terminate() {}
  finish(request: SimulationRequest, before: World, after: World) {
    const { state, metrics } = createStateTransfer(before, after);
    this.onmessage?.({
      data: {
        type: "result",
        protocol: SIMULATION_PROTOCOL,
        id: request.id,
        revision: request.revision,
        baseTick: worldHour(before),
        nextTick: worldHour(after),
        state,
        metrics: { ...metrics, computeMs: 1, encodeMs: 1 },
      },
    });
  }
}

function decisionWorld(player = "germany", recipient = player) {
  const world = createWorld(player, "alternative", 830);
  world.historical = {
    pending: [
      {
        id: "history-anschluss-1",
        eventId: "anschluss",
        initiator: "germany",
        recipient,
        stage: recipient === "germany" ? "initiate" : "respond",
        createdDay: world.day,
      },
    ],
    resolved: [],
  };
  return world;
}

function harness(initial = createWorld("germany", "alternative", 830)) {
  const clock = new Clock();
  const worker = new Worker();
  const worlds: World[] = [];
  const notices: string[] = [];
  const controller = new SimulationController({
    createWorker: () => worker,
    onWorld: (world) => {
      notices.push("world");
      worlds.push(world);
    },
    onPause: () => notices.push("pause"),
    onError: (message) => assert.fail(message),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  controller.setWorld(initial);
  controller.setSpeed(5);
  return { clock, worker, worlds, notices, controller, initial };
}

test("5× worker result stops on a new player decision before publishing or scheduling another hour", () => {
  const h = harness();
  h.controller.setRunning(true);
  h.clock.advance(SIMULATION_HOUR_MS / 5);
  assert.equal(h.worker.requests.length, 1);
  const next = decisionWorld();
  next.hour = 1;
  h.worker.finish(h.worker.requests[0], h.initial, next);
  assert.deepEqual(h.notices, ["pause", "world"]);
  assert.deepEqual(h.worlds[0].historical, next.historical);
  assert.equal(worldHour(h.worlds[0]), 1);
  h.clock.advance(60_000);
  assert.equal(h.worker.requests.length, 1);
  h.controller.setSpeed(1);
  h.controller.setRunning(true);
  h.clock.advance(60_000);
  assert.equal(h.worker.requests.length, 1, "Play cannot bypass a decision");
  h.controller.dispose();
});

test("An imported pending response cannot start the worker; another country's decision can", () => {
  const h = harness(decisionWorld("austria", "austria"));
  h.controller.setRunning(true);
  h.clock.advance(60_000);
  assert.equal(h.worker.requests.length, 0);
  assert.deepEqual(h.notices, ["pause"]);
  const foreign = decisionWorld("austria", "germany");
  h.controller.setWorld(foreign);
  h.controller.setRunning(true);
  h.clock.advance(SIMULATION_HOUR_MS / 5);
  assert.equal(h.worker.requests.length, 1);
  h.controller.dispose();
});

test("Loading a decision invalidates an in-flight hour without overwriting the loaded queue", () => {
  const h = harness();
  h.controller.setRunning(true);
  h.clock.advance(SIMULATION_HOUR_MS / 5);
  const request = h.worker.requests[0];
  h.controller.setWorld(decisionWorld());
  assert.deepEqual(h.notices, ["pause"]);
  const oldResult = structuredClone(h.initial);
  oldResult.hour++;
  h.worker.finish(request, h.initial, oldResult);
  h.clock.advance(60_000);
  assert.equal(h.worlds.length, 0);
  assert.equal(h.worker.requests.length, 1);
  h.controller.dispose();
});

test("Resolving a queue preserves the pause and the next manual resume resends the authoritative world", () => {
  const h = harness(decisionWorld());
  h.controller.setRunning(true);
  const resolved = structuredClone(h.initial);
  resolved.historical!.pending = [];
  resolved.historical!.resolved.push({
    eventId: "anschluss",
    day: 0,
    outcome: "declined",
    by: "germany",
  });
  h.controller.setWorld(resolved);
  h.clock.advance(60_000);
  assert.equal(h.worker.requests.length, 0);
  h.controller.setRunning(true);
  h.clock.advance(SIMULATION_HOUR_MS / 5);
  assert.equal(h.worker.requests.length, 1);
  assert.equal(h.worker.requests[0].world, resolved);
  assert.deepEqual(h.worker.requests[0].world?.historical, resolved.historical);
  h.controller.dispose();
});

test("State deltas preserve decision additions, stage changes and removals; fingerprints include choices", () => {
  let local = createWorld("germany", "alternative", 830);
  const initialDigest = fingerprintWorld(local);
  const pending = decisionWorld();
  assert.notEqual(fingerprintWorld(pending), initialDigest);
  for (const change of ["add", "respond", "remove"] as const) {
    const next = structuredClone(local);
    next.hour++;
    if (change === "add") next.historical = structuredClone(pending.historical);
    else if (change === "respond") {
      next.historical!.pending[0].recipient = "austria";
      next.historical!.pending[0].stage = "respond";
    } else {
      next.historical!.pending = [];
      next.historical!.resolved.push({
        eventId: "anschluss",
        day: 0,
        outcome: "declined",
        by: "austria",
      });
    }
    const { state } = createStateTransfer(local, next);
    assert.equal(state.kind, "delta");
    const accepted = acceptStateTransfer(
      local,
      state,
      worldHour(local),
      worldHour(next),
    );
    assert.deepEqual(accepted, next);
    assert.equal(fingerprintWorld(accepted), fingerprintWorld(next));
    local = accepted;
  }
});

test("Legacy campaigns without history and empty decision queues do not pause", () => {
  assert.equal(hasPendingPlayerDecision(null), false);
  const initial = createWorld("germany", "alternative", 830);
  delete initial.historical;
  assert.equal(hasPendingPlayerDecision(initial), false);
  initial.historical = { pending: [], resolved: [] };
  assert.equal(hasPendingPlayerDecision(initial), false);
});

test("A same-hour capitulation does not trap an unanswerable diplomatic proposal", () => {
  const pending = decisionWorld("austria", "austria");
  assert.equal(hasPendingPlayerDecision(pending), true);
  pending.countries.austria.capitulated = true;
  assert.equal(hasPendingPlayerDecision(pending), false);
  const h = harness(pending);
  h.controller.setRunning(true);
  h.clock.advance(SIMULATION_HOUR_MS / 5);
  assert.equal(h.worker.requests.length, 1);
  assert.deepEqual(h.notices, []);
  h.controller.dispose();
});
