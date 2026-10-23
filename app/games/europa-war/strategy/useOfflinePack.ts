"use client";
import { useEffect, useState } from "react";
import manifest from "./map-assets.json";
import { EUROPA_OFFLINE_VERSION } from "./offline-protocol";
import { getSimulationWorkerAssets } from "./simulation-assets";
import { collectOfflinePageAssets } from "./offline-assets";

type Reply = { type: string; version: string; terrain: string };

function documentAssets(): string[] {
  return [
    ...Array.from(
      document.querySelectorAll<HTMLScriptElement>("script[src]"),
      (element) => element.src,
    ),
    ...Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel="stylesheet"],link[rel="preload"]',
      ),
      (element) => element.href,
    ),
  ];
}

function requestWorker(
  worker: ServiceWorker,
  message: Record<string, unknown>,
  timeout: number,
  signal: AbortSignal,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error?: Error, reply?: Reply) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      channel.port1.close();
      channel.port2.close();
      if (error) reject(error);
      else resolve(reply!);
    };
    const abort = () => finish(new Error("Offline preparation cancelled"));
    const timer = setTimeout(
      () => finish(new Error("Offline worker timed out")),
      timeout,
    );
    signal.addEventListener("abort", abort, { once: true });
    channel.port1.onmessage = ({ data }: MessageEvent<Reply>) =>
      finish(undefined, data);
    if (signal.aborted) abort();
    else {
      try {
        worker.postMessage(message, [channel.port2]);
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Offline worker unavailable"),
        );
      }
    }
  });
}

function simulationAssets(signal: AbortSignal): Promise<readonly string[]> {
  const ready = getSimulationWorkerAssets();
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const finish = (assets?: readonly string[]) => {
      clearTimeout(timer);
      window.removeEventListener("europa-worker-assets", receive);
      window.removeEventListener("europa-worker-error", failed);
      signal.removeEventListener("abort", failed);
      if (assets) resolve(assets);
      else reject(new Error("Simulation worker unavailable"));
    };
    const receive = () => finish(getSimulationWorkerAssets() ?? undefined);
    const failed = () => finish();
    const timer = setTimeout(failed, 20_000);
    window.addEventListener("europa-worker-assets", receive);
    window.addEventListener("europa-worker-error", failed);
    signal.addEventListener("abort", failed, { once: true });
    if (signal.aborted) failed();
  });
}

async function currentOfflineWorker(
  registration: ServiceWorkerRegistration,
  signal: AbortSignal,
) {
  const deadline = Date.now() + 20_000;
  // ready alone can resolve to an older active worker while the update installs.
  while (!signal.aborted && Date.now() < deadline) {
    const worker = registration.active;
    if (worker?.state === "activated") {
      try {
        const reply = await requestWorker(
          worker,
          { type: "EUROPA_PING" },
          750,
          signal,
        );
        if (
          reply.type === "EUROPA_VERSION" &&
          reply.version === EUROPA_OFFLINE_VERSION &&
          reply.terrain === manifest.terrain.url
        )
          return worker;
      } catch {
        if (signal.aborted) break;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Current offline worker unavailable");
}

export function useOfflinePack() {
  const [status, setStatus] = useState("Sefer bu cihazda çalışır.");
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    // Next may remove executed script tags while worker registration awaits.
    // Capture them now; resource timing below also covers an already late mount.
    const initialAssets = documentAssets();
    const cancellation = new AbortController();
    const { signal } = cancellation;
    const update = (text: string) => {
      if (!signal.aborted) setStatus(text);
    };
    update("Çevrimdışı oyun paketi hazırlanıyor…");
    async function prepare() {
      try {
        // Wait before declaring readiness: workers do not appear in script tags.
        const workerAssets = await simulationAssets(signal);
        const registration = await navigator.serviceWorker.register(
          "/games/europa-war/sw.js",
          { scope: "/games/europa-war", updateViaCache: "none" },
        );
        // Registration checks for updates. A failed update is normal offline;
        // the version handshake still requires a compatible active worker.
        await registration.update().catch(() => undefined);
        const worker = await currentOfflineWorker(registration, signal);
        const local = collectOfflinePageAssets(
          location.origin,
          [...initialAssets, ...documentAssets()],
          performance.getEntriesByType("resource"),
        );
        const result = await requestWorker(
          worker,
          {
            type: "EUROPA_CACHE",
            version: EUROPA_OFFLINE_VERSION,
            assets: local,
            workerAssets,
            terrain: manifest.terrain.url,
          },
          60_000,
          signal,
        );
        if (
          result.type !== "EUROPA_READY" ||
          result.version !== EUROPA_OFFLINE_VERSION
        )
          throw new Error("Incomplete offline pack");
        update("Çevrimdışı kullanıma hazır · bu cihaz");
      } catch {
        update(
          "Çevrimdışı paket güncellenemedi. Mevcut kayıtların korunuyor; bu seferi yeniden açmak için internet gerekebilir.",
        );
      }
    }
    void prepare();
    return () => cancellation.abort();
  }, []);
  return status;
}
