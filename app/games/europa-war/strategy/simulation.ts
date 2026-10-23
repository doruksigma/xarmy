import type { World } from "./types";

export type SimulationRequest = {
  type: "advance";
  id: number;
  revision: number;
  // Omitted only when the worker already holds this revision's accepted state.
  world?: World;
};

export type SimulationResponse =
  | { type: "ready"; assets: string[] }
  | { type: "result"; id: number; revision: number; world: World }
  | { type: "error"; id: number; revision: number; error: string };

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
  onAssets?: (assets: string[]) => void;
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
  private pending: { id: number; revision: number; timeout: Timer } | null =
    null;
  private readonly setTimer: NonNullable<Options["setTimer"]>;
  private readonly clearTimer: NonNullable<Options["clearTimer"]>;

  constructor(private readonly options: Options) {
    this.setTimer =
      options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  /** Warm the worker so its code can be cached before the first day starts. */
  initialize() {
    if (this.disposed || this.worker) return;
    try {
      const worker = this.options.createWorker();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.disposed || this.worker !== worker) return;
        if (data.type === "ready") {
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
            "Gün hesaplanamadı. Zaman duraklatıldı; mevcut sefer korunuyor.",
          );
          return;
        }
        this.world = data.world;
        this.workerRevision = pending.revision;
        this.options.onWorld(data.world);
        // Waiting after completion avoids queued days on slower devices.
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
    this.schedule();
  }

  setRunning(running: boolean) {
    if (this.disposed || this.running === running) return;
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

  private schedule() {
    if (
      this.disposed ||
      !this.running ||
      !this.world ||
      this.pending ||
      this.scheduled !== null
    )
      return;
    this.scheduled = this.setTimer(() => {
      this.scheduled = null;
      this.advance();
    }, 1000 / this.speed);
  }

  private advance() {
    if (this.disposed || !this.running || !this.world || this.pending) return;
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
      timeout: this.setTimer(() => {
        this.fail(
          "Gün hesaplaması zaman aşımına uğradı. Zaman duraklatıldı; mevcut sefer korunuyor. Tekrar ▶ ile deneyebilirsin.",
        );
      }, this.options.timeoutMs ?? 20_000),
    };
    try {
      this.worker.postMessage({
        type: "advance",
        id,
        revision,
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
