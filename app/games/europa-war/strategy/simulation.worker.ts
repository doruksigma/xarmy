import { advanceHour } from "./engine";
import type { SimulationRequest, SimulationResponse } from "./simulation";
import type { World } from "./types";
import {
  checkedSimulationTick,
  createStateTransfer,
  SIMULATION_PROTOCOL,
} from "./simulation-state";
import { worldHour } from "./time";
import { fingerprintWorld } from "./world-digest";

const worker = self as unknown as {
  location: Location;
  performance: Performance;
  onmessage: ((event: MessageEvent<SimulationRequest>) => void) | null;
  postMessage: (message: SimulationResponse) => void;
};

let snapshot: World | null = null;
let snapshotRevision: number | null = null;

worker.onmessage = ({ data }) => {
  if (data.type !== "advance") return;
  const { id, revision, world, baseTick } = data;
  try {
    if (
      data.protocol !== SIMULATION_PROTOCOL ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      !Number.isSafeInteger(baseTick)
    )
      throw new Error("Unsupported simulation protocol");
    const source = world ?? (snapshotRevision === revision ? snapshot : null);
    if (!source || checkedSimulationTick(source) !== baseTick)
      throw new Error("Simulation snapshot missing or obsolete");
    const started = performance.now();
    const next = advanceHour(source);
    const computeMs = performance.now() - started;
    const encodeStarted = performance.now();
    const { state, metrics } = createStateTransfer(source, next);
    const nextTick = worldHour(next);
    const summary =
      world || next.hour === 0
        ? { format: 1 as const, tick: nextTick, digest: fingerprintWorld(next) }
        : undefined;
    const encodeMs = performance.now() - encodeStarted;
    snapshot = next;
    snapshotRevision = revision;
    worker.postMessage({
      type: "result",
      protocol: SIMULATION_PROTOCOL,
      id,
      revision,
      baseTick,
      nextTick,
      state,
      metrics: { ...metrics, computeMs, encodeMs },
      ...(summary ? { summary } : {}),
    });
  } catch (error) {
    // Recovery must start from the authoritative state held by the controller.
    snapshot = null;
    snapshotRevision = null;
    worker.postMessage({
      type: "error",
      protocol: SIMULATION_PROTOCOL,
      id,
      revision,
      error: error instanceof Error ? error.message : "Simulation failed",
    });
  }
};

// Imported webpack chunks are already loaded before this entry executes.
const location = new URL(worker.location.href);
const entry = location.searchParams.get("entry");
worker.postMessage({
  type: "ready",
  protocol: SIMULATION_PROTOCOL,
  assets: [
    ...new Set([
      worker.location.href,
      // The outer importScripts timing may not finish until after this message.
      ...(entry ? [new URL(entry, location).href] : []),
      ...worker.performance
        .getEntriesByType("resource")
        .map((entry) => entry.name),
    ]),
  ],
});
