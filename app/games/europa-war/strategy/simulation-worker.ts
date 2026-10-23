import { SIMULATION_WORKER_PATH } from "./worker-bootstrap";

/** Webpack recognizes this factory via the rule for useSimulation.ts. */
export function createSimulationWorker(entry: URL): Worker {
  // Worker startup requests use the worker URL's service worker scope. The
  // emitted /_next entry is outside the game scope, so enter through this URL.
  const bootstrap = new URL(SIMULATION_WORKER_PATH, location.origin);
  // Webpack may pass a TrustedScriptURL, which has no URL fields.
  const bundle = new URL(String(entry), bootstrap.origin);
  if (bundle.origin !== bootstrap.origin)
    throw new Error("Simulation worker must be served by this origin");
  bootstrap.searchParams.set("entry", bundle.pathname);
  return new Worker(bootstrap);
}
