import { advanceDay } from "./engine";
import type { SimulationRequest, SimulationResponse } from "./simulation";
import type { World } from "./types";

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
  const { id, revision, world } = data;
  try {
    const source = world ?? (snapshotRevision === revision ? snapshot : null);
    if (!source) throw new Error("Simulation snapshot missing or obsolete");
    const next = advanceDay(source);
    snapshot = next;
    snapshotRevision = revision;
    worker.postMessage({ type: "result", id, revision, world: next });
  } catch (error) {
    // Recovery must start from the authoritative state held by the controller.
    snapshot = null;
    snapshotRevision = null;
    worker.postMessage({
      type: "error",
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
