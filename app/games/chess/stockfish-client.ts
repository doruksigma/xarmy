/** Stockfish 17.1 lite NNUE, running in a single-threaded classic WASM worker. */
export type StockfishScore = { type: "cp" | "mate"; value: number };

export type StockfishResult = {
  bestMove: string | null;
  /** UCI scores are relative to the side to move in the searched position. */
  score: StockfishScore;
  depth: number;
  pv: string[];
  nodes: number;
};

export type StockfishSearch = {
  fen: string;
  /** Include the game's UCI move history to preserve repetition detection. */
  positionCommand?: string;
  depth: number;
  movetime?: number;
  searchMoves?: string[];
};

type Search = {
  result: Omit<StockfishResult, "bestMove"> | null;
  resolve: (result: StockfishResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cancelled: boolean;
};

function abortError() {
  return new DOMException("Stockfish search cancelled", "AbortError");
}

/** No SharedArrayBuffer or cross-origin isolation is required. */
export class StockfishClient {
  readonly ready: Promise<void>;
  private readonly worker: Worker;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private initialized = false;
  private failure: Error | null = null;
  private active: Search | null = null;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly startupTimer: ReturnType<typeof setTimeout>;

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // The upstream distribution is a classic worker, including when this
    // client is constructed inside a Next.js module worker.
    this.worker = new Worker("/stockfish/engine/stockfish.js");
    this.startupTimer = setTimeout(() => {
      this.fail(
        new Error("Stockfish engine could not start within 60 seconds"),
      );
    }, 60_000);
    this.worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (typeof data === "string") {
        for (const line of data.split(/\r?\n/)) this.onLine(line.trim());
      }
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.fail(
        new Error("Stockfish could not load its engine or WASM assets"),
      );
    };
    this.worker.onmessageerror = () => {
      this.fail(new Error("Stockfish returned an unreadable message"));
    };
    // The engine may fail while its caller is still constructing the UI.
    // The original ready promise continues to reject for callers awaiting it.
    void this.ready.catch(() => undefined);
    this.worker.postMessage("uci");
  }

  analyze(options: StockfishSearch): Promise<StockfishResult> {
    const generation = this.generation;
    const result = this.queue.then(async () => {
      await this.ready;
      if (this.failure) throw this.failure;
      if (generation !== this.generation) throw abortError();
      return this.search(options);
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  cancel(): void {
    ++this.generation;
    if (!this.active || this.active.cancelled) return;
    this.active.cancelled = true;
    this.worker.postMessage("stop");
    // Drain bestmove first: UCI does not tag output with request identifiers.
    clearTimeout(this.active.timer);
    this.active.timer = setTimeout(() => {
      this.fail(
        new Error("Stockfish did not acknowledge the cancelled search"),
      );
    }, 5_000);
  }

  terminate(): void {
    ++this.generation;
    this.fail(abortError());
  }

  private search(options: StockfishSearch): Promise<StockfishResult> {
    const depth = Math.min(40, Math.max(1, Math.floor(options.depth)));
    if (!Number.isFinite(depth) || /[\r\n]/.test(options.fen)) {
      return Promise.reject(
        new Error("Invalid Stockfish search position or depth"),
      );
    }
    const position = options.positionCommand ?? `position fen ${options.fen}`;
    if (
      !/^position (startpos(?: moves [a-h1-8qrbn ]+)?|fen [^\r\n]+)$/.test(
        position,
      )
    ) {
      return Promise.reject(new Error("Invalid Stockfish position command"));
    }
    const moves = options.searchMoves ?? [];
    if (moves.some((move) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) {
      return Promise.reject(new Error("Invalid Stockfish search move"));
    }
    const movetime =
      options.movetime === undefined
        ? undefined
        : Math.min(60_000, Math.max(50, Math.floor(options.movetime)));
    if (movetime !== undefined && !Number.isFinite(movetime)) {
      return Promise.reject(new Error("Invalid Stockfish search time"));
    }
    return new Promise<StockfishResult>((resolve, reject) => {
      this.active = {
        result: null,
        resolve,
        reject,
        cancelled: false,
        timer: setTimeout(
          () => {
            this.fail(new Error("Stockfish search timed out"));
          },
          Math.max(30_000, (movetime ?? 45_000) + 15_000),
        ),
      };
      this.worker.postMessage(position);
      const limit = movetime === undefined ? "" : ` movetime ${movetime}`;
      const restricted = moves.length ? ` searchmoves ${moves.join(" ")}` : "";
      this.worker.postMessage(`go depth ${depth}${limit}${restricted}`);
    });
  }

  private onLine(line: string): void {
    if (this.failure) return;
    if (line === "uciok" && !this.initialized) {
      this.worker.postMessage("setoption name Threads value 1");
      this.worker.postMessage("setoption name Hash value 32");
      this.worker.postMessage("setoption name Skill Level value 20");
      this.worker.postMessage("setoption name UCI_LimitStrength value false");
      this.worker.postMessage("setoption name MultiPV value 1");
      this.worker.postMessage("setoption name UCI_AnalyseMode value true");
      this.worker.postMessage("isready");
      return;
    }
    if (line === "readyok" && !this.initialized) {
      this.initialized = true;
      clearTimeout(this.startupTimer);
      this.readyResolve();
      return;
    }
    const search = this.active;
    if (!search) return;
    if (line.startsWith("info ")) {
      // Fail-high/fail-low bounds must never become measured move grades.
      if (/\b(?:upperbound|lowerbound)\b/.test(line)) return;
      const multipv = /\bmultipv (\d+)/.exec(line);
      if (multipv && multipv[1] !== "1") return;
      const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
      const depth = /\bdepth (\d+)/.exec(line);
      if (!score || !depth) return;
      if (search.result && Number(depth[1]) < search.result.depth) return;
      const nodes = /\bnodes (\d+)/.exec(line);
      const pv = /\bpv (.+)$/.exec(line);
      search.result = {
        score: {
          type: score[1] as StockfishScore["type"],
          value: Number(score[2]),
        },
        depth: Number(depth[1]),
        pv: pv ? pv[1].trim().split(/\s+/) : [],
        nodes: nodes ? Number(nodes[1]) : 0,
      };
      return;
    }
    if (line.startsWith("bestmove ")) {
      this.active = null;
      clearTimeout(search.timer);
      if (search.cancelled) {
        search.reject(abortError());
      } else if (!search.result) {
        search.reject(
          new Error("Stockfish did not return an exact evaluation"),
        );
      } else {
        const bestMove = line.split(/\s+/)[1];
        if (
          bestMove !== "(none)" &&
          bestMove !== "0000" &&
          (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove) ||
            search.result.pv[0] !== bestMove)
        ) {
          search.reject(
            new Error(
              "Stockfish's exact evaluation does not match its selected move",
            ),
          );
          return;
        }
        search.resolve({
          ...search.result,
          bestMove:
            bestMove === "(none)" || bestMove === "0000" ? null : bestMove,
        });
      }
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    clearTimeout(this.startupTimer);
    this.worker.terminate();
    if (!this.initialized) this.readyReject(error);
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(error);
      this.active = null;
    }
  }
}
