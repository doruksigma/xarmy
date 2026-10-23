export const SIMULATION_WORKER_PATH = "/games/europa-war/simulation-worker.js";

export function simulationWorkerEntry(url: URL): URL | null {
  if (
    url.pathname !== SIMULATION_WORKER_PATH ||
    url.hash ||
    [...url.searchParams.keys()].length !== 1
  )
    return null;
  const value = url.searchParams.get("entry");
  if (!value) return null;
  try {
    const entry = new URL(value, url.origin);
    return entry.origin === url.origin &&
      entry.pathname.startsWith("/_next/static/chunks/") &&
      entry.pathname.endsWith(".js") &&
      !entry.search &&
      !entry.hash
      ? entry
      : null;
  } catch {
    return null;
  }
}
