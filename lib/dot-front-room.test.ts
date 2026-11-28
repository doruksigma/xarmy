import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actInRoom, checkRoomOrigin, createRoom, getRoom, joinRoom, roomJson, roomResponse, roomToken, RoomError } from "./dot-front-room";
import { packMatch, unpackMatch, MAX_ONLINE_BODY_BYTES } from "../app/games/dot-front/online-protocol";
import { applyGameCommand } from "../app/games/dot-front/commands";
import type { GameCommand } from "../app/games/dot-front/commands";
import type { RoomView } from "../app/games/dot-front/online-types";

const names = ["VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "XARMY_DOT_FRONT_ROOM_DIR"];
const previous = new Map(names.map(name => [name, process.env[name]]));
const originalNow = Date.now;
let directory: string, now: number;
beforeEach(async () => {
  for (const name of names) delete process.env[name];
  directory = await mkdtemp(join(tmpdir(), "dot-front-room-domain-"));
  process.env.XARMY_DOT_FRONT_ROOM_DIR = directory;
  now = originalNow(); Date.now = () => now;
});
afterEach(async () => {
  Date.now = originalNow;
  for (const [name, value] of previous) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  await rm(directory, { recursive: true, force: true });
});
const status = (expected: number) => (error: unknown) => error instanceof RoomError && error.status === expected;
async function pair(start = true) {
  const host = await createRoom("plains"), guest = await joinRoom(host.room.code);
  const room = start ? await actInRoom(host.room.code, host.token, { action: "start" }) : await getRoom(host.room.code, host.token);
  return { host, guest, room, code: room.code };
}
const world = (room: RoomView) => { const match = unpackMatch(room.snapshot); assert.ok(match); return match; };
const guestMove = (room: RoomView): GameCommand => ({ kind: "move", ids: [world(room).units.find(unit => unit.team === 2)!.id], point: { x: 70, y: 10 } });
const upload = (room: RoomView, snapshot: unknown = room.snapshot, overrides = {}) => ({
  action: "sync", present: true, snapshot, snapshotSeq: room.snapshotSeq + 1,
  controlVersion: room.controlVersion, ack: room.guestSeq, ...overrides,
});
async function storeLegacySnapshot(code: string) {
  const path = join(directory, `${code}.json`);
  const record = JSON.parse(await readFile(path, "utf8"));
  const snapshot = { ...record.snapshot, version: 5, recruitment: [17, 29] };
  for (const city of snapshot.cities) if (city.build) city.build.elapsed = 0;
  snapshot.cities.find((city: { owner: number }) => city.owner === 1).build.elapsed = 17;
  snapshot.cities.find((city: { owner: number }) => city.owner === 2).build.elapsed = 29;
  record.snapshot = snapshot;
  await writeFile(path, JSON.stringify(record));
  return { snapshot, record, raw: await readFile(path, "utf8") };
}

test("rooms expose private two-player views, hash tokens and expire after two hours", async () => {
  const { host, guest, room, code } = await pair(false);
  assert.match(code, /^[1-9][0-9]{5}$/);
  assert.equal(room.status, "waiting"); assert.equal(room.snapshot, null);
  assert.equal(room.team, 1); assert.equal(guest.room.team, 2);
  assert.equal(room.expiresAt, now + 2 * 60 * 60 * 1000);
  const raw = await readFile(join(directory, `${code}.json`), "utf8");
  assert.equal(raw.includes(host.token), false); assert.equal(raw.includes(guest.token), false);
  assert.equal("hostHash" in room, false); assert.equal("guestHash" in guest.room, false);
  await assert.rejects(getRoom(code, "A".repeat(43)), status(401));
  await assert.rejects(getRoom("../../room", host.token), status(400));
  now += 2 * 60 * 60 * 1000 + 1;
  await assert.rejects(getRoom(code, host.token), status(404));
});

test("concurrent joins grant exactly one guest and reject a third player", async () => {
  const host = await createRoom("forest");
  const results = await Promise.allSettled([joinRoom(host.room.code), joinRoom(host.room.code)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(status(409)(rejected.reason));
  await assert.rejects(joinRoom(host.room.code), status(409));
});

test("only the host can start after a guest joins, and retrying start preserves the match", async () => {
  const host = await createRoom("valley");
  await assert.rejects(actInRoom(host.room.code, host.token, { action: "start" }), status(409));
  const guest = await joinRoom(host.room.code);
  await assert.rejects(actInRoom(host.room.code, guest.token, { action: "start" }), status(403));
  const started = await actInRoom(host.room.code, host.token, { action: "start" });
  const match = world(started);
  assert.equal(match.version, 6); assert.equal("recruitment" in match, false); assert.equal(match.map, "valley");
  assert.ok(match.cities.every(city => city.owner ? city.build?.elapsed === 0 : city.build === null));
  assert.equal(match.tutorial, null); assert.equal(match.units.length, 50);
  assert.equal(started.paused, false);
  const retry = await actInRoom(host.room.code, host.token, { action: "start" });
  assert.deepEqual(retry.snapshot, started.snapshot); assert.equal(retry.snapshotSeq, started.snapshotSeq);
});

test("authenticated reads upgrade a stored v5 room once, pause it and preserve sessions, orders and city progress", async () => {
  const { host, guest, room, code } = await pair();
  await actInRoom(code, guest.token, { action: "sync", present: true, commands: [
    { seq: 1, command: guestMove(room) }, { seq: 2, command: guestMove(room) },
  ] });
  const queued = await getRoom(code, host.token), progressed = world(queued);
  applyGameCommand(progressed, 2, queued.commands[0].command);
  progressed.report = { captured: 2, killed: 3, fallen: 4 };
  await actInRoom(code, host.token, upload(queued, packMatch(progressed), { ack: 1 }));
  const legacy = await storeLegacySnapshot(code);
  const upgraded = await getRoom(code, host.token), match = world(upgraded);
  assert.equal(match.version, 6); assert.equal("recruitment" in match, false);
  assert.equal(match.id, legacy.snapshot.id); assert.deepEqual(match.report, legacy.snapshot.report);
  assert.equal(upgraded.paused, true);
  assert.equal(upgraded.snapshotSeq, legacy.record.snapshotSeq + 1);
  assert.equal(upgraded.controlVersion, legacy.record.controlVersion + 1);
  assert.equal(upgraded.revision, legacy.record.revision + 1);
  assert.equal(upgraded.guestSeq, 2); assert.equal(upgraded.ack, 1); assert.equal(upgraded.commands.length, 1);
  assert.equal(upgraded.commands[0].seq, 2);
  assert.equal(match.cities.find(city => city.owner === 1)!.build!.elapsed, 17);
  assert.equal(match.cities.find(city => city.owner === 2)!.build!.elapsed, 29);
  assert.equal(match.cities.filter(city => city.build && city.build.elapsed > 0).length, 2, "a shared clock is not copied to every city");
  const again = await getRoom(code, host.token);
  assert.equal(again.revision, upgraded.revision); assert.equal(again.snapshotSeq, upgraded.snapshotSeq);
  assert.equal((await getRoom(code, guest.token)).snapshotSeq, upgraded.snapshotSeq);
  const stored = JSON.parse(await readFile(join(directory, `${code}.json`), "utf8"));
  assert.equal(stored.snapshot.version, 6); assert.equal(stored.hostHash, legacy.record.hostHash);
  assert.equal(stored.guestHash, legacy.record.guestHash); assert.equal(stored.expiresAt, legacy.record.expiresAt);
});

test("unauthorized requests cannot migrate stored snapshots and malformed legacy data is not fabricated", async () => {
  const { host, code } = await pair();
  const legacy = await storeLegacySnapshot(code), path = join(directory, `${code}.json`);
  await assert.rejects(getRoom(code, "A".repeat(43)), status(401));
  await assert.rejects(actInRoom(code, "A".repeat(43), { action: "sync", present: true }), status(401));
  assert.equal(await readFile(path, "utf8"), legacy.raw);
  legacy.record.snapshot.recruitment = [NaN, 29];
  const corrupt = JSON.stringify(legacy.record);
  await writeFile(path, corrupt);
  await assert.rejects(getRoom(code, host.token), status(409));
  assert.equal(await readFile(path, "utf8"), corrupt);
});

test("legacy in-flight uploads cannot overwrite an upgrade and current clients can explicitly resume", async () => {
  const { host, guest, room, code } = await pair();
  const legacy = await storeLegacySnapshot(code);
  const migrated = await actInRoom(code, host.token, upload(room, legacy.snapshot));
  assert.equal(migrated.paused, true); assert.equal(world(migrated).version, 6);
  const persisted = JSON.stringify(migrated.snapshot);
  await assert.rejects(actInRoom(code, host.token, upload(migrated, legacy.snapshot)), error =>
    status(409)(error) && (error as Error).message.includes("iki oyuncu da sayfayı yenilesin"));
  assert.equal(JSON.stringify((await getRoom(code, host.token)).snapshot), persisted);
  await actInRoom(code, guest.token, { action: "sync", present: true });
  const resumed = await actInRoom(code, host.token, { action: "resume" }); assert.equal(resumed.paused, false);
  const progressed = world(resumed); progressed.elapsed += .05;
  const first = progressed.cities.find(city => city.owner === 1)!;
  first.build!.elapsed += .05;
  const synced = await actInRoom(code, host.token, upload(resumed, packMatch(progressed)));
  assert.equal(world(synced).cities[first.id].build!.elapsed, 17.05);
  assert.equal(world(await getRoom(code, guest.token)).version, 6);
});

test("guest commands relay once in sequence, apply as team two, and ack only with the host snapshot", async () => {
  const { host, guest, room, code } = await pair();
  const command = guestMove(room);
  const sent = await actInRoom(code, guest.token, { action: "sync", present: true, commands: [{ seq: 1, command }] });
  assert.equal(sent.guestSeq, 1); assert.deepEqual(sent.commands, []);
  const queued = await getRoom(code, host.token);
  assert.equal(queued.commands.length, 1);
  await actInRoom(code, guest.token, { action: "sync", present: true, commands: [{ seq: 1, command }] });
  assert.equal((await getRoom(code, host.token)).commands.length, 1);
  const match = world(queued); assert.equal(applyGameCommand(match, 2, queued.commands[0].command), true);
  const accepted = await actInRoom(code, host.token, upload(queued, packMatch(match)));
  assert.equal(accepted.ack, 1); assert.equal(accepted.commands.length, 0);
  assert.deepEqual(world(accepted).units.find(unit => unit.id === (command as Extract<GameCommand, { kind: "move" }>).ids[0])!.order.mode, "move");
  await assert.rejects(actInRoom(code, host.token, { action: "sync", present: true, ack: 1 }), status(400));
});

test("command authorization rejects enemy IDs, city theft, malformed data and hidden state fields", async () => {
  const { host, guest, room, code } = await pair(), match = world(room);
  const blue = match.units.find(unit => unit.team === 1)!, red = match.units.find(unit => unit.team === 2)!;
  const send = (command: unknown) => actInRoom(code, guest.token, { action: "sync", present: true, commands: [{ seq: 1, command }] });
  await assert.rejects(send({ kind: "move", ids: [blue.id], point: { x: 70, y: 10 } }), status(403));
  await assert.rejects(send({ kind: "move", ids: [red.id, blue.id], point: { x: 70, y: 10 } }), status(403));
  await assert.rejects(send({ kind: "build", city: match.cities.find(city => city.owner === 1)!.id, unit: "heavy" }), status(403));
  await assert.rejects(send({ kind: "move", ids: [red.id], point: { x: Infinity, y: 10 } }), status(400));
  await assert.rejects(send({ kind: "order", ids: [red.id], order: { mode: "route", points: [], next: 0 } }), status(400));
  await assert.rejects(send({ kind: "order", ids: [red.id], order: { mode: "attack", target: red.id } }), status(400));
  await assert.rejects(actInRoom(code, guest.token, upload(room)), status(403));
  await assert.rejects(actInRoom(code, host.token, { action: "sync", present: true, commands: [{ seq: 1, command: guestMove(room) }] }), status(403));
  assert.equal((await getRoom(code, host.token)).guestSeq, 0);
  await send({ ...guestMove(room), snapshot: { hp: 99999 }, point: { x: 70, y: 10, extra: "ignored" } });
  const queued = (await getRoom(code, host.token)).commands[0].command;
  assert.equal("snapshot" in queued, false);
  if (queued.kind === "move") assert.deepEqual(queued.point, { x: 70, y: 10 });
});

test("stale disappeared units and targets are acknowledged as safe no-ops", async () => {
  const { host, guest, room, code } = await pair(), match = world(room);
  const red = match.units.find(unit => unit.team === 2)!;
  await actInRoom(code, guest.token, { action: "sync", present: true, commands: [
    { seq: 1, command: { kind: "move", ids: [999999], point: { x: 70, y: 10 } } },
    { seq: 2, command: { kind: "order", ids: [red.id], order: { mode: "attack", target: 999999 } } },
  ] });
  const queued = await getRoom(code, host.token); assert.equal(queued.guestSeq, 2);
  for (const entry of queued.commands) assert.equal(applyGameCommand(match, 2, entry.command), false);
});

test("concurrent duplicate guest retries cannot execute twice or lose subsequent commands", async () => {
  const { host, guest, room, code } = await pair();
  const first = { action: "sync", present: true, commands: [{ seq: 1, command: guestMove(room) }] };
  await Promise.all([actInRoom(code, guest.token, first), actInRoom(code, guest.token, first)]);
  const view = await getRoom(code, host.token); assert.equal(view.commands.length, 1); assert.equal(view.guestSeq, 1);
  await assert.rejects(actInRoom(code, guest.token, { ...first, commands: [{ seq: 3, command: guestMove(room) }] }), status(409));
  await actInRoom(code, guest.token, { ...first, commands: [{ seq: 2, command: guestMove(room) }] });
  assert.deepEqual((await getRoom(code, host.token)).commands.map(entry => entry.seq), [1, 2]);
});

test("batch and queue limits reject atomically without consuming sequence numbers", async () => {
  const { host, guest, room, code } = await pair();
  const batch = (first: number, count: number) => ({ action: "sync", present: true,
    commands: Array.from({ length: count }, (_, index) => ({ seq: first + index, command: guestMove(room) })) });
  await assert.rejects(actInRoom(code, guest.token, batch(1, 33)), status(400));
  for (let index = 0; index < 4; index++) await actInRoom(code, guest.token, batch(index * 32 + 1, 32));
  await assert.rejects(actInRoom(code, guest.token, batch(129, 1)), status(429));
  const queued = await getRoom(code, host.token); assert.equal(queued.guestSeq, 128); assert.equal(queued.commands.length, 128);
});

test("snapshot validation rejects bad sequences, wrong identity/map and time reversal", async () => {
  const { host, room, code } = await pair();
  await assert.rejects(actInRoom(code, host.token, upload(room, room.snapshot, { snapshotSeq: 1.5 })), status(400));
  await assert.rejects(actInRoom(code, host.token, upload(room, room.snapshot, { ack: 1 })), status(400));
  await assert.rejects(actInRoom(code, host.token, upload(room, { encoding: "bad" })), status(400));
  const changed = world(room); changed.id = "another-room";
  await assert.rejects(actInRoom(code, host.token, upload(room, packMatch(changed))), status(400));
  const forward = world(room); forward.elapsed = 1;
  const accepted = await actInRoom(code, host.token, upload(room, packMatch(forward)));
  await assert.rejects(actInRoom(code, host.token, upload(accepted, room.snapshot)), status(400));
  assert.equal(world(await getRoom(code, host.token)).elapsed, 1);
});

test("stale control and duplicate snapshots cannot unpause or acknowledge uncommitted commands", async () => {
  const { host, guest, room, code } = await pair();
  await actInRoom(code, guest.token, { action: "sync", present: true, commands: [{ seq: 1, command: guestMove(room) }] });
  const paused = await actInRoom(code, guest.token, { action: "pause" });
  const late = world(room); late.elapsed = 1;
  const ignored = await actInRoom(code, host.token, upload(room, packMatch(late), { ack: 1 }));
  assert.equal(ignored.paused, true); assert.equal(ignored.controlVersion, paused.controlVersion);
  assert.equal(ignored.snapshotSeq, room.snapshotSeq); assert.equal(ignored.ack, 0); assert.equal(ignored.commands.length, 1);
  const duplicate = await actInRoom(code, host.token, upload(ignored, ignored.snapshot, { snapshotSeq: ignored.snapshotSeq, ack: 1 }));
  assert.equal(duplicate.ack, 0);
  const pausedAdvance = await actInRoom(code, host.token, upload(ignored, packMatch(late), { ack: 1 }));
  assert.equal(pausedAdvance.snapshotSeq, room.snapshotSeq); assert.equal(pausedAdvance.ack, 0);
});

test("a racing pause and host upload preserve one coherent snapshot, acknowledgement and control state", async () => {
  const { host, guest, room, code } = await pair();
  await actInRoom(code, guest.token, { action: "sync", present: true, commands: [{ seq: 1, command: guestMove(room) }] });
  const queued = await getRoom(code, host.token), match = world(queued);
  applyGameCommand(match, 2, queued.commands[0].command); match.elapsed = 1;
  await Promise.all([
    actInRoom(code, host.token, upload(queued, packMatch(match))),
    actInRoom(code, guest.token, { action: "pause" }),
  ]);
  const current = await getRoom(code, host.token);
  assert.equal(current.paused, true);
  assert.equal(current.ack, world(current).elapsed === 1 ? 1 : 0);
  assert.equal(current.commands.length, current.ack === 1 ? 0 : 1);
});

test("heartbeat timeout and hidden tabs pause both players until the host explicitly resumes", async () => {
  const { host, guest, room, code } = await pair();
  now += 8001;
  const timedOut = await getRoom(code, guest.token);
  assert.equal(timedOut.paused, true); assert.equal(timedOut.hostPresent, false); assert.equal(timedOut.guestPresent, false);
  assert.ok(timedOut.controlVersion > room.controlVersion);
  await assert.rejects(actInRoom(code, host.token, { action: "resume" }), status(409));
  await actInRoom(code, guest.token, { action: "sync", present: true });
  const hostBack = await actInRoom(code, host.token, { action: "sync", present: true });
  assert.equal(hostBack.paused, true);
  await assert.rejects(actInRoom(code, guest.token, { action: "resume" }), status(403));
  const resumed = await actInRoom(code, host.token, { action: "resume" }); assert.equal(resumed.paused, false);
  const hidden = await actInRoom(code, guest.token, { action: "sync", present: false });
  assert.equal(hidden.paused, true); assert.equal(hidden.guestPresent, false);
  await assert.rejects(actInRoom(code, host.token, { action: "resume" }), status(409));
});

test("an older in-flight heartbeat cannot overwrite a newer hidden-tab keepalive after a Redis CAS retry", async () => {
  const originalFetch = globalThis.fetch;
  const records = new Map<string, string>();
  let delayRead = false;
  let releaseRead: (() => void) | undefined;
  process.env.VERCEL = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as (string | number)[];
    const key = String(command[command[0] === "GET" ? 1 : 3]);
    if (command[0] === "GET") {
      const snapshot = records.get(key) ?? null;
      if (delayRead) {
        delayRead = false;
        return new Promise<Response>(resolve => { releaseRead = () => resolve(Response.json({ result: snapshot })); });
      }
      return Response.json({ result: snapshot });
    }
    assert.equal(command[0], "EVAL");
    if ((records.get(key) ?? "") !== command[4]) return Response.json({ result: 0 });
    records.set(key, String(command[5]));
    return Response.json({ result: 1 });
  };
  try {
    const { host, room, code } = await pair();
    delayRead = true;
    const slow = actInRoom(code, host.token, { action: "sync", present: true });
    assert.ok(releaseRead);
    now++;
    const hidden = await actInRoom(code, host.token, { action: "sync", present: false });
    assert.equal(hidden.hostPresent, false); assert.equal(hidden.paused, true);
    releaseRead();
    const late = await slow;
    assert.equal(late.hostPresent, false); assert.equal(late.paused, true);
    assert.ok(late.controlVersion > room.controlVersion);
    assert.equal((await getRoom(code, host.token)).hostPresent, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("either side can pause but shared speed is host-only and changes control version", async () => {
  const { host, guest, room, code } = await pair();
  await assert.rejects(actInRoom(code, guest.token, { action: "speed", speed: 3 }), status(403));
  await assert.rejects(actInRoom(code, host.token, { action: "speed", speed: 100 }), status(400));
  const faster = await actInRoom(code, host.token, { action: "speed", speed: 3 });
  assert.equal(faster.speed, 3); assert.ok(faster.controlVersion > room.controlVersion);
  assert.equal((await actInRoom(code, guest.token, { action: "pause" })).paused, true);
});

test("resignation and leaving are final, authenticated, and cannot be overwritten by host uploads", async () => {
  for (const departing of ["host", "guest"] as const) {
    const { host, guest, room, code } = await pair();
    const token = departing === "host" ? host.token : guest.token;
    const finished = await actInRoom(code, token, { action: departing === "host" ? "leave" : "resign" });
    assert.equal(finished.status, "finished"); assert.equal(finished.paused, true);
    assert.equal(world(finished).result, departing === "host" ? "lost" : "won");
    const retry = await actInRoom(code, host.token, upload(room));
    assert.equal(world(retry).result, world(finished).result); assert.equal(retry.snapshotSeq, finished.snapshotSeq);
    const repeated = await actInRoom(code, token, { action: "resign" });
    assert.equal(repeated.snapshotSeq, finished.snapshotSeq);
  }
});

test("a racing guest resignation remains final even when the host publishes an older running world", async () => {
  const { host, guest, room, code } = await pair();
  await Promise.all([
    actInRoom(code, guest.token, { action: "resign" }),
    actInRoom(code, host.token, upload(room)),
  ]);
  const finished = await getRoom(code, host.token);
  assert.equal(finished.status, "finished"); assert.equal(finished.paused, true);
  assert.equal(world(finished).result, "won"); assert.ok(finished.snapshotSeq > room.snapshotSeq);
});

test("normal host result finishes both views, and waiting guest can leave without taking the room", async () => {
  const { host, guest, room, code } = await pair();
  const match = world(room); match.result = "draw";
  const finished = await actInRoom(code, host.token, upload(room, packMatch(match)));
  assert.equal(finished.status, "finished"); assert.equal(world(await getRoom(code, guest.token)).result, "draw");
  const waiting = await pair(false);
  await actInRoom(waiting.code, waiting.guest.token, { action: "leave" });
  await assert.rejects(getRoom(waiting.code, waiting.guest.token), status(401));
  const replacement = await joinRoom(waiting.code); assert.equal(replacement.room.role, "guest");
  await actInRoom(waiting.code, waiting.host.token, { action: "leave" });
  await assert.rejects(joinRoom(waiting.code), status(409));
});

test("HTTP helpers bound input, reject cross-origin writes, and protect credential responses", async () => {
  const request = (body: string, headers = {}) => new Request("https://xarmy.test/api/dot-front/rooms", { method: "POST", headers, body });
  assert.throws(() => checkRoomOrigin(request("{}", { origin: "https://evil.test" })), status(403));
  assert.throws(() => checkRoomOrigin(request("{}", { "sec-fetch-site": "cross-site" })), status(403));
  checkRoomOrigin(request("{}", { origin: "https://xarmy.test" }));
  await assert.rejects(roomJson(request(" ".repeat(MAX_ONLINE_BODY_BYTES + 1))), status(413));
  await assert.rejects(roomJson(request("[]")), status(400));
  await assert.rejects(roomJson(request("{")), status(400));
  assert.throws(() => roomToken(request("{}")), status(401));
  const response = await roomResponse(() => createRoom("plains"), 201);
  assert.equal(response.status, 201); assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const bad = await roomResponse(() => createRoom("bad-map")); assert.equal(bad.status, 400);
  assert.equal(typeof (await bad.json()).error, "string");
});
