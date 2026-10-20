import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  RoomError,
  createRoom,
  getRoom,
  joinRoom as joinRoomRandom,
  moveInRoom,
  resignRoom,
  roomResponse,
} from "./chess-room";

const configurationNames = [
  "VERCEL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;
const previousEnvironment = new Map(
  configurationNames.map((name) => [name, process.env[name]]),
);
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const joinRoom = (code: unknown) =>
  joinRoomRandom(code, () => ({ host: 6, guest: 1 }));

test("Redis preserves the random black-host assignment across reads and moves", async () => {
  const host = await createRoom();
  const guest = await joinRoomRandom(host.room.code, () => ({
    host: 2,
    guest: 5,
  }));
  assert.equal(guest.room.color, "w");
  const hostView = await getRoom(host.room.code, host.token);
  assert.equal(hostView.color, "b");
  assert.deepEqual(hostView.colorDraw, { yourRoll: 2, opponentRoll: 5 });
  assert.deepEqual(guest.room.colorDraw, { yourRoll: 5, opponentRoll: 2 });
  await moveInRoom(host.room.code, guest.token, { from: "e2", to: "e4" });
  const afterMove = await getRoom(host.room.code, host.token);
  assert.equal(afterMove.color, "b");
  assert.deepEqual(afterMove.colorDraw, hostView.colorDraw);
  assert.deepEqual(JSON.parse(redis.entry(host.room.code).raw).colorDraw, {
    host: 2,
    guest: 5,
  });
});

const statusIs = (status: number) => (error: unknown) =>
  error instanceof RoomError && error.status === status;

type Entry = { raw: string; expiresAt: number };

// Model independent serverless requests against one atomic Redis instance.
// Returning each GET snapshot before the awaited response is consumed lets
// concurrent operations genuinely race instead of serializing them in the mock.
class RedisRest {
  entries = new Map<string, Entry>();
  conflicts = 0;
  commits = 0;
  requests = 0;
  failWith: Response | null = null;
  beforeCommit: ((key: string) => void) | null = null;

  fetch: typeof fetch = async (input, init) => {
    this.requests++;
    assert.equal(String(input), "https://redis.example.test/");
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer fixture-token",
    );
    if (this.failWith) return this.failWith.clone();
    const command = JSON.parse(String(init?.body)) as (string | number)[];
    const key = String(command[command[0] === "GET" ? 1 : 3]);
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) this.entries.delete(key);
    if (command[0] === "GET")
      return Response.json({ result: this.entries.get(key)?.raw ?? null });
    assert.equal(command[0], "EVAL");
    assert.equal(command[2], 1);
    assert.match(String(command[1]), /redis\.call\('GET', KEYS\[1\]\)/);
    assert.match(String(command[1]), /'PXAT'/);
    this.beforeCommit?.(key);
    if ((this.entries.get(key)?.raw ?? "") !== command[4]) {
      this.conflicts++;
      return Response.json({ result: 0 });
    }
    this.entries.set(key, {
      raw: String(command[5]),
      expiresAt: Number(command[6]),
    });
    this.commits++;
    return Response.json({ result: 1 });
  };

  entry(code: string): Entry {
    const entry = this.entries.get(`xarmy:chess:room:${code}`);
    assert.ok(entry);
    return entry;
  }
}

let redis: RedisRest;
beforeEach(() => {
  for (const name of configurationNames) delete process.env[name];
  process.env.VERCEL = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  redis = new RedisRest();
  globalThis.fetch = redis.fetch;
  console.error = () => undefined;
});
afterEach(() => {
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

async function pair() {
  const host = await createRoom();
  const guest = await joinRoom(host.room.code);
  return { host, guest, code: host.room.code };
}

test("Redis rooms preserve shared state, private credentials, and fixed 24-hour expiry", async () => {
  const { host, guest, code } = await pair();
  const expiry = redis.entry(code).expiresAt;
  assert.equal(expiry, host.room.createdAt + 24 * 60 * 60 * 1000);
  const view = await moveInRoom(code, host.token, {
    from: "e2",
    to: "e4",
    expectedVersion: 2,
  });
  assert.equal(view.version, 3);
  assert.deepEqual((await getRoom(code, guest.token)).moves, ["e4"]);
  assert.equal(redis.entry(code).expiresAt, expiry);
  assert.equal(redis.entry(code).raw.includes(host.token), false);
  assert.equal(redis.entry(code).raw.includes(guest.token), false);
  await assert.rejects(getRoom(code, "x".repeat(43)), statusIs(401));
  const resigned = await resignRoom(code, guest.token);
  assert.deepEqual(resigned.result, { winner: "w", reason: "resignation" });
  assert.equal(resigned.version, 4);
  assert.equal((await resignRoom(code, host.token)).version, 4);
  assert.equal(redis.entry(code).expiresAt, expiry);
  redis.entry(code).expiresAt = Date.now() - 1;
  await assert.rejects(getRoom(code, host.token), statusIs(404));
});

test("concurrent Redis joins and stale versioned moves commit once without lost updates", async () => {
  const host = await createRoom();
  const joins = await Promise.allSettled(
    Array.from({ length: 12 }, () => joinRoom(host.room.code)),
  );
  assert.equal(joins.filter((item) => item.status === "fulfilled").length, 1);
  for (const attempt of joins)
    if (attempt.status === "rejected") assert.ok(statusIs(409)(attempt.reason));
  assert.ok(redis.conflicts > 0, "the test must exercise a real CAS conflict");
  const successful = joins.find((item) => item.status === "fulfilled");
  assert.ok(successful?.status === "fulfilled");
  const guest = successful.value;
  const conflictsBeforeMoves = redis.conflicts;
  const moves = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      moveInRoom(host.room.code, host.token, {
        from: index % 2 ? "e2" : "d2",
        to: index % 2 ? "e4" : "d4",
        expectedVersion: 2,
      }),
    ),
  );
  assert.equal(moves.filter((item) => item.status === "fulfilled").length, 1);
  for (const attempt of moves)
    if (attempt.status === "rejected") assert.ok(statusIs(409)(attempt.reason));
  assert.ok(redis.conflicts > conflictsBeforeMoves);
  const view = await getRoom(host.room.code, guest.token);
  assert.equal(view.version, 3);
  assert.equal(view.moves.length, 1);
  const reply = await moveInRoom(host.room.code, guest.token, {
    from: "e7",
    to: "e5",
    expectedVersion: 3,
  });
  assert.equal(reply.version, 4);
  assert.equal(reply.moves.length, 2);
  assert.equal(redis.commits, 4);
});

test("a Redis record expiring between read and commit cannot be resurrected", async () => {
  const { host, code } = await pair();
  redis.beforeCommit = (key) => {
    redis.beforeCommit = null;
    redis.entries.delete(key);
  };
  await assert.rejects(
    moveInRoom(code, host.token, {
      from: "e2",
      to: "e4",
      expectedVersion: 2,
    }),
    statusIs(404),
  );
  assert.equal(redis.conflicts, 1);
  assert.equal(redis.entries.has(`xarmy:chess:room:${code}`), false);
});

test("the Vercel KV REST variable pair uses the same shared Redis backend", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.KV_REST_API_URL = "https://redis.example.test";
  process.env.KV_REST_API_TOKEN = "fixture-token";
  const { host, guest, code } = await pair();
  assert.equal((await getRoom(code, guest.token)).version, 2);
  assert.equal((await getRoom(code, host.token)).status, "playing");
});

test("Vercel without a complete secure Redis configuration returns a useful 503", async () => {
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await roomResponse(createRoom);
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.match(text, /Online odalar henüz etkinleştirilmedi/);
  assert.doesNotMatch(text, /UPSTASH|KV_REST|fixture-token/);
  assert.equal(redis.requests, 0);
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  for (const url of [
    "http://redis.example.test",
    "https://user:pass@redis.example.test",
    "https://redis.example.test?token=secret",
  ]) {
    process.env.UPSTASH_REDIS_REST_URL = url;
    await assert.rejects(createRoom(), statusIs(503));
  }
  assert.equal(redis.requests, 0);
});

test("Redis HTTP errors and invalid responses fail closed without exposing provider details", async () => {
  for (const response of [
    new Response("private upstream token fixture-token", { status: 403 }),
    Response.json({ error: "private upstream token fixture-token" }),
    Response.json({ result: { unexpected: true } }),
    new Response("not json"),
  ]) {
    redis.failWith = response;
    const result = await roomResponse(createRoom);
    assert.equal(result.status, 503);
    assert.doesNotMatch(
      await result.text(),
      /fixture-token|private upstream|redis\.example/,
    );
  }
});
