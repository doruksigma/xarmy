let assets: readonly string[] | null = null;

export function getSimulationWorkerAssets() {
  return assets;
}

export function reportSimulationWorkerAssets(urls: string[]) {
  assets = [...new Set(urls)];
  window.dispatchEvent(new CustomEvent("europa-worker-assets", { detail: assets }));
}

export function reportSimulationWorkerError() {
  window.dispatchEvent(new Event("europa-worker-error"));
}
