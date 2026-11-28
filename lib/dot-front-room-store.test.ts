import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStoredRoom, RoomError, transactRoom } from "./dot-front-room-store";

const configurationNames = [
  "VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL", "KV_REST_API_TOKEN", "XARMY_DOT_FRONT_ROOM_DIR",
] as const;
const previousEnvironment = new Map(configurationNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
let directory: string;
let diagnostics: string[];
type Record = { code: string; expiresAt: number; version: number; actions: number[] };
const code = "123456";
const statusIs = (status: number) => (error: unknown) => error instanceof RoomError && error.status === status;
const record = (): Record => ({ code, expiresAt: Date.now() + 2 * 60 * 60 * 1000, version: 1, actions: [] });
const create = (value = record()) => transactRoom<Record, Record>(value.code, existing => {
  if (existing) throw new RoomError(409, "Oda zaten var.");
  return { record: value, result: value };
});
const change = (value: number, version?: number) => transactRoom<Record, Record>(code, current => {
  if (!current) throw new RoomError(404, "Oda bulunamadı.");
  if (version !== undefined && current.version !== version) throw new RoomError(409, "Eski sürüm.");
  current.version++;
  current.actions.push(value);
  return { record: current, result: current };
});

class RedisRest {
  entries = new Map<string, { raw: string; expiresAt: number }>();
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
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-token");
    if (this.failWith) return this.failWith.clone();
    const command = JSON.parse(String(init?.body)) as (string | number)[];
    const key = String(command[command[0] === "GET" ? 1 : 3]);
    assert.match(key, /^xarmy:dot-front:room:[1-9][0-9]{5}$/);
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt <= Date.now()) this.entries.delete(key);
    if (command[0] === "GET") return Response.json({ result: this.entries.get(key)?.raw ?? null });
    assert.equal(command[0], "EVAL");
    assert.equal(command[2], 1);
    assert.match(String(command[1]), /redis\.call\('GET', KEYS\[1\]\)/);
    assert.match(String(command[1]), /'PXAT'/);
    this.beforeCommit?.(key);
    if ((this.entries.get(key)?.raw ?? "") !== command[4]) {
      this.conflicts++;
      return Response.json({ result: 0 });
    }
    this.entries.set(key, { raw: String(command[5]), expiresAt: Number(command[6]) });
    this.commits++;
    return Response.json({ result: 1 });
  };
}

function useRedis() {
  const redis = new RedisRest();
  process.env.VERCEL = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  globalThis.fetch = redis.fetch;
  return redis;
}

beforeEach(async () => {
  for (const name of configurationNames) delete process.env[name];
  directory = await mkdtemp(join(tmpdir(), "dot-front-room-store-test-"));
  process.env.XARMY_DOT_FRONT_ROOM_DIR = directory;
  diagnostics = [];
  console.error = (...args: unknown[]) => { diagnostics.push(args.map(String).join(" ")); };
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  await rm(directory, { force: true, recursive: true });
});

test("local Dot Front room writes stay isolated, private and keep their original expiry", async () => {
  const initial = await create();
  await change(7);
  const saved = await readStoredRoom<Record>(code);
  assert.equal(saved?.expiresAt, initial.expiresAt);
  assert.deepEqual(saved?.actions, [7]);
  assert.equal(saved?.version, 2);
  assert.equal((await stat(join(directory, `${code}.json`))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), [`${code}.json`]);
  assert.equal(await readStoredRoom("654321"), null);
  await writeFile(join(directory, `${code}.json`), JSON.stringify({ ...initial, expiresAt: Date.now() - 1 }));
  assert.equal(await readStoredRoom(code), null);
});

test("local concurrent transactions serialize without losing a command", async () => {
  await create();
  await Promise.all(Array.from({ length: 12 }, (_, index) => change(index)));
  const saved = await readStoredRoom<Record>(code);
  assert.equal(saved?.version, 13);
  assert.deepEqual(saved?.actions.slice().sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index));
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => change(index, 13)));
  assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
  for (const attempt of attempts) if (attempt.status === "rejected") assert.ok(statusIs(409)(attempt.reason));
});

test("local stale crashed-owner locks are recovered once under concurrent updates", async () => {
  await create();
  const exited = spawnSync(process.execPath, ["-e", ""]);
  assert.equal(exited.status, 0);
  const lock = join(directory, `${code}.lock`);
  await writeFile(lock, JSON.stringify({ pid: exited.pid }));
  const old = new Date(Date.now() - 60_000); await utimes(lock, old, old);
  const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => change(index, 1)));
  assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
  assert.equal((await readStoredRoom<Record>(code))?.version, 2);
});

test("an old local lock with a living owner is never stolen", async () => {
  await create();
  const lock = join(directory, `${code}.lock`), owner = JSON.stringify({ pid: process.pid });
  await writeFile(lock, owner);
  const old = new Date(Date.now() - 60_000); await utimes(lock, old, old);
  await assert.rejects(change(1), statusIs(503));
  assert.equal(await readFile(lock, "utf8"), owner);
  assert.equal((await readStoredRoom<Record>(code))?.version, 1);
});

test("invalid storage keys, mismatched record identities and corrupt records fail safely", async () => {
  for (const invalid of ["../secret", "12345", "012345", "123456/other", "xarmy:chess:room:123456"]) {
    await assert.rejects(readStoredRoom(invalid), statusIs(400));
    await assert.rejects(transactRoom(invalid, () => ({ result: null })), statusIs(400));
  }
  await assert.rejects(transactRoom<Record, null>(code, () => ({ record: { ...record(), code: "654321" }, result: null })), statusIs(503));
  await assert.rejects(transactRoom<Record, null>(code, () => ({ record: { ...record(), expiresAt: NaN }, result: null })), statusIs(503));
  await writeFile(join(directory, `${code}.json`), "not json private-fixture-secret");
  await assert.rejects(readStoredRoom(code), error => {
    assert.ok(statusIs(503)(error));
    assert.doesNotMatch(String(error), /private-fixture-secret|Unexpected token/);
    return true;
  });
});

test("Redis records use the Dot Front namespace and fixed two-hour domain expiry", async () => {
  const redis = useRedis(), initial = await create();
  await change(42);
  const saved = await readStoredRoom<Record>(code);
  assert.equal(saved?.version, 2);
  assert.equal(saved?.expiresAt, initial.expiresAt);
  assert.deepEqual(saved?.actions, [42]);
  assert.equal(redis.entries.has(`xarmy:dot-front:room:${code}`), true);
  assert.equal(redis.entries.has(`xarmy:chess:room:${code}`), false);
  assert.deepEqual(await readdir(directory), []);
});

test("Redis CAS retries concurrent commands and rejects stale versions without lost updates", async () => {
  const redis = useRedis(); await create();
  await Promise.all(Array.from({ length: 12 }, (_, index) => change(index)));
  assert.ok(redis.conflicts > 0, "the mock must exercise actual compare-and-swap conflicts");
  const current = await readStoredRoom<Record>(code);
  assert.equal(current?.version, 13);
  assert.deepEqual(current?.actions.slice().sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index));
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => change(index, 13)));
  assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
  for (const attempt of attempts) if (attempt.status === "rejected") assert.ok(statusIs(409)(attempt.reason));
  assert.equal((await readStoredRoom<Record>(code))?.version, 14);
});

test("an expired Redis record is not resurrected after a racing commit", async () => {
  const redis = useRedis(); await create();
  redis.beforeCommit = key => { redis.beforeCommit = null; redis.entries.delete(key); };
  await assert.rejects(change(1), statusIs(404));
  assert.equal(redis.conflicts, 1);
  assert.equal(await readStoredRoom(code), null);
});

test("the existing KV REST variable pair uses the same namespaced Redis backend", async () => {
  const redis = useRedis();
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.KV_REST_API_URL = "https://redis.example.test"; process.env.KV_REST_API_TOKEN = "fixture-token";
  await create(); await change(9);
  assert.equal((await readStoredRoom<Record>(code))?.version, 2);
  assert.equal(redis.commits, 2);
});

test("missing, partial and insecure Redis configuration fails closed on Vercel", async () => {
  const redis = useRedis();
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await assert.rejects(create(), statusIs(503));
  delete process.env.UPSTASH_REDIS_REST_URL;
  await assert.rejects(create(), statusIs(503));
  delete process.env.VERCEL;
  process.env.KV_REST_API_TOKEN = "fixture-token";
  await assert.rejects(create(), statusIs(503));
  delete process.env.KV_REST_API_TOKEN;
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  for (const url of ["http://redis.example.test", "https://user:secret@redis.example.test", "https://redis.example.test?token=private-fixture-secret", "https://redis.example.test/#secret"]) {
    process.env.UPSTASH_REDIS_REST_URL = url;
    await assert.rejects(create(), statusIs(503));
  }
  assert.equal(redis.requests, 0);
  assert.doesNotMatch(diagnostics.join("\n"), /fixture-token|private-fixture-secret|user:secret/);
});

test("Redis errors and corrupt upstream payloads never expose provider details", async () => {
  const redis = useRedis();
  for (const response of [
    new Response("private upstream fixture-token", { status: 403 }),
    Response.json({ error: "private upstream fixture-token" }),
    Response.json({ result: { unexpected: "fixture-token" } }),
    Response.json({ result: "not json private upstream fixture-token" }),
    Response.json({ result: JSON.stringify({ code, expiresAt: "fixture-token" }) }),
    new Response("private upstream fixture-token"),
  ]) {
    redis.failWith = response;
    await assert.rejects(readStoredRoom(code), error => {
      assert.ok(statusIs(503)(error));
      assert.doesNotMatch(String(error), /fixture-token|private upstream|redis\.example/);
      return true;
    });
  }
  globalThis.fetch = async () => { throw new Error("private provider fixture-token"); };
  await assert.rejects(readStoredRoom(code), error => {
    assert.ok(statusIs(503)(error));
    assert.doesNotMatch(String(error), /fixture-token|private provider/);
    return true;
  });
  assert.doesNotMatch(diagnostics.join("\n"), /fixture-token|private upstream|redis\.example/);
});
