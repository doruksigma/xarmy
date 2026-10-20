import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { StockfishClient } from "./stockfish-client";

class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: string[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWorker.instances.push(this);
  }
  postMessage(message: string) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(line: string) {
    this.onmessage?.({ data: line } as MessageEvent);
  }
  error() {
    this.onerror?.({ preventDefault() {} } as ErrorEvent);
  }
}

const previousWorker = globalThis.Worker;
const clients: StockfishClient[] = [];
const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeEach(() => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.terminate());
  globalThis.Worker = previousWorker;
});
async function readyClient() {
  const client = new StockfishClient();
  clients.push(client);
  const worker = FakeWorker.instances.at(-1)!;
  worker.emit("uciok");
  worker.emit("readyok");
  await client.ready;
  return { client, worker };
}

test("single-threaded NNUE engine is initialized with full skill and no Elo handicap", async () => {
  const { worker } = await readyClient();
  assert.equal(worker.url, "/stockfish/engine/stockfish.js");
  for (const required of [
    "uci",
    "setoption name Threads value 1",
    "setoption name Skill Level value 20",
    "setoption name UCI_LimitStrength value false",
    "setoption name MultiPV value 1",
    "isready",
  ])
    assert.ok(worker.messages.includes(required), required);
});

test("only exact primary-variation scores become measured evaluations", async () => {
  const { client, worker } = await readyClient();
  const search = client.analyze({ fen, depth: 16, movetime: 2200 });
  await tick();
  worker.emit("info depth 14 multipv 1 score cp 31 nodes 12345 pv e2e4 e7e5");
  worker.emit(
    "info depth 16 multipv 1 score cp 200 lowerbound nodes 99999 pv d2d4 d7d5",
  );
  worker.emit("info depth 16 multipv 2 score cp 900 pv g1f3");
  worker.emit("info depth 12 score cp 12 pv a2a3");
  worker.emit("bestmove e2e4 ponder e7e5");
  assert.deepEqual(await search, {
    bestMove: "e2e4",
    score: { type: "cp", value: 31 },
    depth: 14,
    pv: ["e2e4", "e7e5"],
    nodes: 12345,
  });
});

test("mate scores retain signed distance and forced root move constraints", async () => {
  const { client, worker } = await readyClient();
  const positionCommand = "position startpos moves f2f3 e7e5";
  const search = client.analyze({
    fen,
    positionCommand,
    depth: 16,
    searchMoves: ["g2g4"],
  });
  await tick();
  assert.ok(worker.messages.includes(positionCommand));
  assert.ok(worker.messages.includes("go depth 16 searchmoves g2g4"));
  worker.emit("info depth 16 score mate -1 nodes 1000 pv g2g4 d8h4");
  worker.emit("bestmove g2g4");
  assert.deepEqual((await search).score, { type: "mate", value: -1 });
});

test("searches are serialized and never share an active untagged UCI stream", async () => {
  const { client, worker } = await readyClient();
  const first = client.analyze({ fen, depth: 14 });
  const second = client.analyze({ fen, depth: 18, searchMoves: ["d2d4"] });
  await tick();
  assert.equal(
    worker.messages.filter((message) => message.startsWith("go ")).length,
    1,
  );
  worker.emit("info depth 14 score cp 20 pv e2e4");
  worker.emit("bestmove e2e4");
  await first;
  await tick();
  assert.equal(
    worker.messages.filter((message) => message.startsWith("go ")).length,
    2,
  );
  worker.emit("info depth 18 score cp 15 pv d2d4");
  worker.emit("bestmove d2d4");
  assert.equal((await second).bestMove, "d2d4");
});

test("cancellation drains bestmove and rejects stale queued searches before a fresh request", async () => {
  const { client, worker } = await readyClient();
  const first = client.analyze({ fen, depth: 18 });
  const queued = client.analyze({ fen, depth: 16 });
  const firstRejected = assert.rejects(first, { name: "AbortError" });
  const queuedRejected = assert.rejects(queued, { name: "AbortError" });
  await tick();
  client.cancel();
  const fresh = client.analyze({ fen, depth: 14 });
  assert.equal(worker.messages.at(-1), "stop");
  worker.emit("info depth 13 score cp 2 pv e2e4");
  worker.emit("bestmove e2e4");
  await firstRejected;
  await queuedRejected;
  await tick();
  worker.emit("info depth 14 score cp 23 pv d2d4");
  worker.emit("bestmove d2d4");
  assert.equal((await fresh).bestMove, "d2d4");
});

test("bound-only or mismatched move evaluations fail instead of inventing good grades", async () => {
  const { client, worker } = await readyClient();
  const bound = client.analyze({ fen, depth: 14 });
  const boundRejected = assert.rejects(bound, /exact evaluation/);
  await tick();
  worker.emit("info depth 14 score cp 33 upperbound pv e2e4");
  worker.emit("bestmove e2e4");
  await boundRejected;
  const mismatch = client.analyze({ fen, depth: 14 });
  const mismatchRejected = assert.rejects(mismatch, /does not match/);
  await tick();
  worker.emit("info depth 14 score cp 33 pv e2e4");
  worker.emit("bestmove d2d4");
  await mismatchRejected;
});

test("terminal UCI results keep mate zero and no invented legal move", async () => {
  const { client, worker } = await readyClient();
  const search = client.analyze({ fen, depth: 14 });
  await tick();
  worker.emit("info depth 0 score mate 0");
  worker.emit("bestmove (none)");
  assert.deepEqual(await search, {
    bestMove: null,
    score: { type: "mate", value: 0 },
    depth: 0,
    pv: [],
    nodes: 0,
  });
});

test("startup errors reject ready, stop the worker, and do not silently change engines", async () => {
  const client = new StockfishClient();
  clients.push(client);
  const rejected = assert.rejects(client.ready, /could not load/);
  FakeWorker.instances.at(-1)!.error();
  await rejected;
  assert.equal(FakeWorker.instances.at(-1)!.terminated, true);
  await assert.rejects(client.analyze({ fen, depth: 14 }), /could not load/);
});

test("invalid newlines and invalid root searchmoves never reach the engine", async () => {
  const { client, worker } = await readyClient();
  await assert.rejects(
    client.analyze({ fen: fen + "\nquit", depth: 14 }),
    /Invalid/,
  );
  await assert.rejects(
    client.analyze({ fen, depth: 14, searchMoves: ["e2e4\nquit"] }),
    /Invalid/,
  );
  assert.equal(
    worker.messages.some((message) => message.startsWith("go ")),
    false,
  );
});
