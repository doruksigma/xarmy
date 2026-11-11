import type { World } from "./types";
import { MAX_CAMPAIGN_HOUR, worldHour } from "./time";
import {
  acceptStateTransfer,
  SIMULATION_PROTOCOL,
  type StateTransfer,
  type TransferMetrics,
} from "./simulation-state";

/** At 1× one game hour per 150 ms, always waiting for worker completion. */
export const SIMULATION_HOUR_MS = 150;

/** Read only the tiny decision queue; do not load political rules into the scheduler. */
export function hasPendingPlayerDecision(world: World | null): boolean {
  // A country may capitulate in the same hour that politics opens a proposal.
  // It can no longer issue commands; the politics cleanup closes that stale item.
  if (world?.countries?.[world.player]?.capitulated) return false;
  return !!world?.historical?.pending.some(
    (decision) => decision.recipient === world.player,
  );
}

export type SimulationRequest = {
  type: "advance";
  protocol: typeof SIMULATION_PROTOCOL;
  id: number;
  revision: number;
  baseTick: number;
  // Omitted only when the worker already holds this revision's accepted state.
  world?: World;
};

export type SimulationMetrics = TransferMetrics & {
  computeMs: number;
  encodeMs: number;
};
export type SimulationSummary = { format: 1; tick: number; digest: string };
export type SimulationDiagnostics = SimulationMetrics & {
  tick: number;
  summary?: SimulationSummary;
};

export type SimulationResponse =
  | { type: "ready"; protocol: typeof SIMULATION_PROTOCOL; assets: string[] }
  | {
      type: "result";
      protocol: typeof SIMULATION_PROTOCOL;
      id: number;
      revision: number;
      baseTick: number;
      nextTick: number;
      state: StateTransfer;
      metrics: SimulationMetrics;
      summary?: SimulationSummary;
    }
  | {
      type: "error";
      protocol: typeof SIMULATION_PROTOCOL;
      id: number;
      revision: number;
      error: string;
    };

export interface SimulationWorker {
  onmessage: ((event: { data: SimulationResponse }) => void) | null;
  onerror:
    | ((event: { message?: string; preventDefault?: () => void }) => void)
    | null;
  onmessageerror: (() => void) | null;
  postMessage(message: SimulationRequest): void;
  terminate(): void;
}

type Timer = ReturnType<typeof setTimeout>;
type Options = {
  createWorker: () => SimulationWorker;
  onWorld: (world: World) => void;
  onError: (message: string) => void;
  /** A pending human decision is a normal pause, not a worker failure. */
  onPause?: () => void;
  onAssets?: (assets: string[]) => void;
  onDiagnostics?: (diagnostics: SimulationDiagnostics) => void;
  canRun?: () => boolean;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  timeoutMs?: number;
};

/** One physical request at a time, even when a command invalidates its result. */
export class SimulationController {
  private worker: SimulationWorker | null = null;
  private world: World | null = null;
  private running = false;
  private disposed = false;
  private speed = 1;
  private revision = 0;
  private workerRevision: number | null = null;
  private nextId = 0;
  private scheduled: Timer | null = null;
  private pending: {
    id: number;
    revision: number;
    source: World;
    timeout: Timer;
  } | null = null;
  private readonly setTimer: NonNullable<Options["setTimer"]>;
  private readonly clearTimer: NonNullable<Options["clearTimer"]>;

  constructor(private readonly options: Options) {
    this.setTimer =
      options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  /** Warm the worker so its code can be cached before the first hour starts. */
  initialize() {
    if (this.disposed || this.worker) return;
    try {
      const worker = this.options.createWorker();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.disposed || this.worker !== worker) return;
        if (data.type === "ready") {
          if (data.protocol !== SIMULATION_PROTOCOL) {
            this.fail(
              "Simülasyon sürümü oyunla uyuşmadı. Sefer korundu; sayfayı yenileyerek tekrar deneyebilirsin.",
            );
            return;
          }
          this.options.onAssets?.(data.assets);
          return;
        }
        const pending = this.pending;
        if (
          !pending ||
          data.id !== pending.id ||
          data.revision !== pending.revision
        )
          return;
        this.clearTimer(pending.timeout);
        this.pending = null;
        // Commands, pause and loading replace the authoritative state immediately.
        if (pending.revision !== this.revision || !this.running) {
          this.schedule();
          return;
        }
        if (this.options.canRun?.() === false) {
          this.setRunning(false);
          return;
        }
        if (data.type === "error") {
          this.fail(
            "Oyun saati hesaplanamadı. Zaman duraklatıldı; mevcut sefer korunuyor.",
          );
          return;
        }
        let next: World;
        try {
          if (
            data.protocol !== SIMULATION_PROTOCOL ||
            this.world !== pending.source
          )
            throw new Error("Simulation protocol or source mismatch");
          next = acceptStateTransfer(
            pending.source,
            data.state,
            data.baseTick,
            data.nextTick,
          );
          if (
            !data.metrics ||
            data.metrics.transport !== data.state.kind ||
            [
              data.metrics.computeMs,
              data.metrics.encodeMs,
              data.metrics.payloadBytes,
              data.metrics.snapshotBytes,
            ].some((n) => !Number.isFinite(n) || n < 0) ||
            data.metrics.payloadBytes > data.metrics.snapshotBytes ||
            (data.summary &&
              (data.summary.format !== 1 ||
                data.summary.tick !== data.nextTick ||
                typeof data.summary.digest !== "string" ||
                !/^ew1:[0-9a-f]{16}$/.test(data.summary.digest)))
          )
            throw new Error("Invalid simulation diagnostics");
        } catch {
          this.fail(
            "Simülasyon sonucu seferle uyuşmadı. Zaman duraklatıldı; mevcut sefer korunuyor. Tekrar ▶ ile yeniden eşitleyebilirsin.",
          );
          return;
        }
        this.world = next;
        this.workerRevision = pending.revision;
        // Stop synchronously before publishing. React may render the event
        // dialog later, but even at 5× another worker hour cannot be queued.
        this.pauseForDecision();
        this.options.onWorld(next);
        this.options.onDiagnostics?.({
          ...data.metrics,
          tick: data.nextTick,
          ...(data.summary ? { summary: data.summary } : {}),
        });
        // Waiting after completion avoids queued hours on slower devices.
        this.schedule();
      };
      worker.onerror = (event) => {
        if (this.disposed || this.worker !== worker) return;
        event.preventDefault?.();
        this.fail(
          "Simülasyon çalıştırılamadı. Zaman duraklatıldı; mevcut sefer korunuyor. Tekrar ▶ ile deneyebilirsin.",
        );
      };
      worker.onmessageerror = () => {
        if (this.disposed || this.worker !== worker) return;
        this.fail(
          "Simülasyon sonucu okunamadı. Zaman duraklatıldı; mevcut sefer korunuyor.",
        );
      };
    } catch {
      this.fail(
        "Simülasyon başlatılamadı. Zaman duraklatıldı; mevcut sefer korunuyor. Sayfayı yeniden yükleyip deneyebilirsin.",
      );
    }
  }

  setWorld(world: World | null) {
    if (this.disposed) return;
    this.world = world;
    this.revision++;
    this.clearScheduled();
    this.pauseForDecision();
    this.schedule();
  }

  setRunning(running: boolean) {
    if (this.disposed) return;
    if (running && hasPendingPlayerDecision(this.world)) {
      const alreadyPaused = !this.running;
      this.pauseForDecision();
      if (alreadyPaused) this.options.onPause?.();
      return;
    }
    if (this.running === running) return;
    this.running = running;
    this.revision++;
    this.clearScheduled();
    this.schedule();
  }

  setSpeed(speed: number) {
    if (this.disposed) return;
    this.speed = Math.max(1, Math.min(5, Number.isFinite(speed) ? speed : 1));
    this.clearScheduled();
    this.schedule();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.revision++;
    this.clearScheduled();
    this.releaseWorker();
  }

  private clearScheduled() {
    if (this.scheduled !== null) this.clearTimer(this.scheduled);
    this.scheduled = null;
  }

  private releaseWorker() {
    if (this.pending) this.clearTimer(this.pending.timeout);
    this.pending = null;
    const worker = this.worker;
    this.worker = null;
    this.workerRevision = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  }

  private fail(message: string) {
    if (this.disposed) return;
    this.running = false;
    this.revision++;
    this.clearScheduled();
    this.releaseWorker();
    this.options.onError(message);
  }

  private pauseForDecision(): boolean {
    if (!hasPendingPlayerDecision(this.world)) return false;
    if (this.running) {
      this.running = false;
      this.revision++;
      this.clearScheduled();
      this.options.onPause?.();
    }
    return true;
  }

  private schedule() {
    if (
      this.disposed ||
      !this.running ||
      !this.world ||
      this.pending ||
      this.scheduled !== null
    )
      return;
    if (this.pauseForDecision()) return;
    this.scheduled = this.setTimer(() => {
      this.scheduled = null;
      this.advance();
    }, SIMULATION_HOUR_MS / this.speed);
  }

  private advance() {
    if (this.disposed || !this.running || !this.world || this.pending) return;
    if (this.pauseForDecision()) return;
    if (worldHour(this.world) >= MAX_CAMPAIGN_HOUR) {
      this.fail(
        "Seferin desteklenen tarih sınırına ulaşıldı. Zaman duraklatıldı; seferini kaydedebilir veya yeni sefer başlatabilirsin.",
      );
      return;
    }
    if (this.options.canRun?.() === false) {
      this.setRunning(false);
      return;
    }
    this.initialize();
    if (!this.worker || !this.running) return;
    const id = ++this.nextId;
    const revision = this.revision;
    this.pending = {
      id,
      revision,
      source: this.world,
      timeout: this.setTimer(() => {
        this.fail(
          "Saat hesaplaması zaman aşımına uğradı. Zaman duraklatıldı; mevcut sefer korunuyor. Tekrar ▶ ile deneyebilirsin.",
        );
      }, this.options.timeoutMs ?? 20_000),
    };
    try {
      this.worker.postMessage({
        type: "advance",
        protocol: SIMULATION_PROTOCOL,
        id,
        revision,
        baseTick: worldHour(this.world),
        // Commands, loading, pause/resume and a fresh worker require a full
        // resync. Continuous days reuse the last accepted worker snapshot,
        // avoiding a synchronous main-thread clone of the whole campaign.
        ...(this.workerRevision === revision ? {} : { world: this.world }),
      });
    } catch {
      this.fail(
        "Sefer simülasyona gönderilemedi. Zaman duraklatıldı; mevcut sefer korunuyor.",
      );
    }
  }
}
