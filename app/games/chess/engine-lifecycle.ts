// The NNUE WASM download is about 7 MB. A cold start on a mobile connection
// needs its own budget; it must not consume the subsequent search deadline.
export const ENGINE_STARTUP_TIMEOUT_MS = 240_000;
// Allow the outer module worker time to report an inner engine startup failure.
export const ENGINE_UI_STARTUP_TIMEOUT_MS = ENGINE_STARTUP_TIMEOUT_MS + 15_000;
export const ENGINE_SEARCH_TIMEOUT_MS = 75_000;
export type EngineStage = "loading" | "thinking";
