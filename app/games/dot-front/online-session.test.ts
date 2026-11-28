import test from "node:test";
import assert from "node:assert/strict";
import { createMatch } from "./engine";
import type { Match } from "./engine";
import { connectRoom, createRoom, restoreRoomSession, clearRoomSession } from "./online-session";
import type { OnlineEnvironment } from "./online-session";
import { packMatch } from "./online-protocol";
import type { RoomAction, RoomSession, RoomView } from "./online-types";
import { ONLINE_SESSION_KEY } from "./online-types";

const host: RoomSession = { code: "ABCDEF", token: "a".repeat(32), role: "host", team: 1 };
const guest: RoomSession = { ...host, role: "guest", team: 2 };
const response = (room: RoomView) => new Response(JSON.stringify({ room }), { status: 200 });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function view(match: Match, session = host): RoomView {
  return { code: session.code, role: session.role, team: session.team, map: match.map, status: "playing", revision: 1,
    controlVersion: 1, paused: false, speed: 1, hostPresent: true, guestPresent: true, guestJoined: true,
    snapshot: packMatch(match), snapshotSeq: 1, commands: [], guestSeq: 0, ack: 0, expiresAt: Date.now() + 60000 };
}
function harness(handler: (body: RoomAction, init: RequestInit) => Promise<Response> | Response) {
  let sequence = 0, visible = true;
  const timers = new Map<number, { callback(): void; delay: number }>();
  const requests: { body: RoomAction; init: RequestInit }[] = [];
  const visibility = new Set<() => void>(), pagehide = new Set<() => void>();
  const environment: OnlineEnvironment = {
    fetch: async (_input, init = {}) => {
      const body = JSON.parse(String(init.body)) as RoomAction;
      requests.push({ body, init }); return handler(body, init);
    },
    setTimer(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimer(timer) { timers.delete(timer as unknown as number); },
    visible: () => visible,
    watchVisibility(callback) { visibility.add(callback); return () => { visibility.delete(callback); }; },
    watchPageHide(callback) { pagehide.add(callback); return () => { pagehide.delete(callback); }; },
  };
  return { environment, requests, timers, visibility, pagehide,
    async poll() {
      const entry = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0];
      assert.ok(entry, "a poll is scheduled"); timers.delete(entry[0]); entry[1].callback(); await flush();
    },
    async hide() { visible = false; visibility.forEach(callback => callback()); await flush(); },
  };
}

test("host applies queued guest commands once and publishes their ack with the authoritative snapshot", async () => {
  const match = createMatch("normal", "host-ordering", false, "plains"), remote = view(match);
  const enemy = match.units.find(unit => unit.team === 2)!;
  remote.commands = [{ seq: 1, command: { kind: "order", ids: [enemy.id], order: { mode: "hold" } } }]; remote.guestSeq = 1;
  const h = harness(body => {
    if (body.action === "sync" && body.snapshot) { remote.snapshot = body.snapshot; remote.snapshotSeq = body.snapshotSeq!; remote.ack = body.ack!; }
    return response(remote);
  });
  const controller = connectRoom(host, { view() {}, status() {} }, h.environment);
  controller.attach(match); await h.poll();
  assert.equal(match.units.find(unit => unit.id === enemy.id)!.order.mode, "hold");
  assert.equal(match.units.find(unit => unit.id === enemy.id)!.stance, "manual");
  await h.poll();
  const body = h.requests[1].body;
  assert.equal(body.action, "sync");
  if (body.action !== "sync") throw new Error();
  assert.equal(body.ack, 1); assert.equal(body.snapshotSeq, 2); assert.ok(body.snapshot);
  match.units.find(unit => unit.id === enemy.id)!.stance = "defend";
  await h.poll();
  assert.equal(match.units.find(unit => unit.id === enemy.id)!.stance, "defend", "duplicate queue delivery is not reapplied");
  controller.dispose();
});

test("host rolls back rejected control-version uploads and replays only unacknowledged commands after resume", async () => {
  const match = createMatch("normal", "rollback", false, "plains");
  match.cities[0].build!.elapsed = 17; match.cities[1].build!.elapsed = 43;
  const remote = view(match);
  const enemy = match.units.find(unit => unit.team === 2)!;
  const replacements: Match[] = [], pauses: boolean[] = [];
  let reject = false;
  const h = harness(body => {
    if (reject && body.action === "sync" && body.snapshot) { remote.controlVersion++; remote.paused = true; reject = false; }
    else if (body.action === "resume") { remote.controlVersion++; remote.paused = false; }
    else if (body.action === "sync" && body.snapshot) { remote.snapshot = body.snapshot; remote.snapshotSeq = body.snapshotSeq!; remote.ack = body.ack!; }
    return response(remote);
  });
  const controller = connectRoom(host, { view(room) { pauses.push(room.paused); }, status() {}, replaceSnapshot(snapshot) { replacements.push(snapshot); } }, h.environment);
  controller.attach(match); await h.poll();
  remote.commands = [{ seq: 1, command: { kind: "order", ids: [enemy.id], order: { mode: "hold" } } }]; remote.guestSeq = 1;
  await h.poll(); // Apply intent after the previous snapshot was accepted.
  match.elapsed = 42; match.cities[0].build!.elapsed = 54; match.cities[1].build!.elapsed = 59;
  reject = true; await h.poll();
  assert.equal(match.elapsed, 0, "rejected simulation progress is restored to server state");
  assert.equal(match.cities[0].build!.elapsed, 17); assert.equal(match.cities[1].build!.elapsed, 43);
  assert.equal(match.units.find(unit => unit.id === enemy.id)!.stance, "defend", "unacknowledged intent waits while paused");
  assert.equal(pauses.at(-1), true); assert.ok(replacements.length >= 2);
  const resumed = controller.action({ action: "resume" }); await h.poll(); await resumed;
  assert.equal(match.cities[0].build!.elapsed, 17); assert.equal(match.cities[1].build!.elapsed, 43);
  assert.equal(match.units.find(unit => unit.id === enemy.id)!.stance, "manual", "intent replays from server ack after resume");
  await h.poll();
  const body = h.requests.at(-1)!.body;
  assert.equal(body.action === "sync" && body.ack, 1);
  controller.dispose();
});

test("guest sends intent without mutating simulation, retries the same sequence and cannot control the host or blue units", async () => {
  const match = createMatch("normal", "guest-authority", false, "plains"), remote = view(match, guest);
  const red = match.units.find(unit => unit.team === 2)!, blue = match.units.find(unit => unit.team === 1)!;
  const snapshots: Match[] = [], statuses: string[] = [];
  let fail = true;
  const h = harness(body => {
    if (body.action === "sync" && body.commands?.length) {
      if (fail) { fail = false; throw new Error("offline"); }
      remote.guestSeq = body.commands.at(-1)!.seq;
    }
    return response(remote);
  });
  const controller = connectRoom(guest, { view() {}, status(value) { statuses.push(value); }, replaceSnapshot(value) { snapshots.push(value); } }, h.environment);
  controller.attach(match); await h.poll();
  controller.command({ kind: "order", ids: [blue.id], order: { mode: "hold" } });
  await assert.rejects(controller.action({ action: "speed", speed: 3 }), /sahibine/);
  await assert.rejects(controller.action({ action: "resume" }), /sahibine/);
  controller.command({ kind: "order", ids: [red.id], order: { mode: "hold" } });
  assert.equal(red.stance, "defend", "guest does not locally apply an order");
  await h.poll(); assert.equal(statuses.at(-1), "reconnecting");
  await h.poll(); assert.equal(statuses.at(-1), "connected");
  const sent = h.requests.filter(item => item.body.action === "sync" && item.body.commands?.length);
  assert.equal(sent.length, 2); assert.deepEqual(sent[0].body, sent[1].body);
  assert.equal(sent[0].body.action === "sync" && sent[0].body.commands?.[0].seq, 1);
  assert.ok(h.requests.every(item => item.body.action !== "sync" || !item.body.snapshot));
  assert.equal(snapshots.length, 1, "unchanged snapshot sequence never rebuilds guest state");
  controller.dispose();
});

test("polling never overlaps; dispose aborts requests, timers and presence listeners", async () => {
  const match = createMatch("normal", "cleanup", false, "plains"), remote = view(match);
  let finish: ((response: Response) => void) | undefined;
  const h = harness(() => new Promise<Response>(resolve => { finish = resolve; }));
  const statuses: string[] = [];
  const controller = connectRoom(host, { view() {}, status(value) { statuses.push(value); } }, h.environment);
  controller.attach(match); await h.poll();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 1, "only request timeout remains while fetch is pending");
  const signal = h.requests[0].init.signal!;
  controller.dispose(); assert.equal(signal.aborted, true);
  assert.equal(h.timers.size, 0, "dispose immediately clears the request timeout");
  assert.equal(h.visibility.size, 0); assert.equal(h.pagehide.size, 0);
  finish!(response(remote)); await flush();
  assert.equal(h.timers.size, 0); assert.deepEqual(statuses, []);
});

test("hidden tabs announce absent presence without publishing simulation or commands", async () => {
  const match = createMatch("normal", "presence", false, "plains"), remote = view(match);
  const statuses: string[] = [];
  const h = harness(() => response(remote));
  const controller = connectRoom(host, { view() {}, status(value) { statuses.push(value); } }, h.environment);
  controller.attach(match); await h.poll(); await h.hide();
  assert.equal(statuses.at(-1), "reconnecting");
  const goodbye = h.requests.at(-1)!;
  assert.deepEqual(goodbye.body, { action: "sync", present: false }); assert.equal(goodbye.init.keepalive, true);
  await h.poll();
  assert.deepEqual(h.requests.at(-1)!.body, { action: "sync", present: false });
  controller.dispose();
});

test("a lost accepted host response retries the exact snapshot and restores from the acknowledged server frame", async () => {
  const match = createMatch("normal", "lost-host-response", false, "plains"), remote = view(match);
  let lose = true;
  const h = harness(body => {
    if (body.action === "sync" && body.snapshot && body.snapshotSeq! > remote.snapshotSeq) {
      remote.snapshot = body.snapshot; remote.snapshotSeq = body.snapshotSeq!; remote.ack = body.ack!;
      if (lose) { lose = false; throw new Error("response lost after commit"); }
    }
    return response(remote);
  });
  const controller = connectRoom(host, { view() {}, status() {} }, h.environment);
  controller.attach(match); await h.poll();
  match.elapsed = 10; await h.poll();
  match.elapsed = 14; // Simulation had run while the unanswered request was in flight.
  await h.poll();
  assert.deepEqual(h.requests[1].body, h.requests[2].body, "snapshot seq has one immutable payload until acknowledged");
  assert.equal(match.elapsed, 10, "recovery rolls back unpublished progress even when the returned sequence matches");
  controller.dispose();
});

test("large guest intent bursts drain in bounded 32-command batches without sequence gaps", async () => {
  const match = createMatch("normal", "batch", false, "plains"), remote = view(match, guest);
  const red = match.units.find(unit => unit.team === 2)!;
  const h = harness(body => {
    if (body.action === "sync" && body.commands?.length) remote.guestSeq = body.commands.at(-1)!.seq;
    return response(remote);
  });
  const controller = connectRoom(guest, { view() {}, status() {} }, h.environment);
  controller.attach(match); await h.poll();
  for (let i = 0; i < 50; i++) controller.command({ kind: "order", ids: [red.id], order: { mode: "hold" } });
  await h.poll(); await h.poll();
  const batches = h.requests.flatMap(request => request.body.action === "sync" && request.body.commands ? [request.body.commands] : []);
  assert.deepEqual(batches.map(batch => batch.length), [32, 18]);
  assert.deepEqual(batches.flatMap(batch => batch.map(command => command.seq)), Array.from({ length: 50 }, (_, i) => i + 1));
  controller.dispose();
});

test("a stale ownership rejection drops poisoned intent, refreshes sequence and allows a new valid command", async () => {
  const match = createMatch("normal", "rejection", false, "plains"), remote = view(match, guest);
  const red = match.units.find(unit => unit.team === 2)!;
  let reject = true;
  const h = harness(body => {
    if (body.action === "sync" && body.commands?.length) {
      if (reject) { reject = false; return new Response(JSON.stringify({ error: "city changed ownership" }), { status: 403 }); }
      remote.guestSeq = body.commands.at(-1)!.seq;
    }
    return response(remote);
  });
  const controller = connectRoom(guest, { view() {}, status() {} }, h.environment);
  controller.attach(match); await h.poll();
  controller.command({ kind: "order", ids: [red.id], order: { mode: "hold" } }); await h.poll();
  await h.poll();
  assert.deepEqual(h.requests.at(-1)!.body, { action: "sync", present: true }, "recovery heartbeat does not replay the forbidden command");
  controller.command({ kind: "order", ids: [red.id], order: { mode: "hold" } }); await h.poll();
  const body = h.requests.at(-1)!.body;
  assert.equal(body.action === "sync" && body.commands?.[0].seq, 1);
  controller.dispose();
});

test("room session recovery uses only its namespace, rejects corrupt data, and aborts access on unmount", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage"), originalFetch = globalThis.fetch;
  const data = new Map<string, string>([["xarmy:dot-front:bot-save", "preserved"]]);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
  try {
    data.set(ONLINE_SESSION_KEY, JSON.stringify(guest)); assert.deepEqual(restoreRoomSession(), guest);
    data.set(ONLINE_SESSION_KEY, JSON.stringify({ ...guest, team: 1 })); assert.equal(restoreRoomSession(), null);
    assert.equal(data.has(ONLINE_SESSION_KEY), false);
    data.set(ONLINE_SESSION_KEY, JSON.stringify(host)); clearRoomSession();
    assert.equal(data.get("xarmy:dot-front:bot-save"), "preserved");
    globalThis.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const abort = new AbortController(), pending = createRoom("plains", abort.signal);
    abort.abort(); await assert.rejects(pending, /Aborted/);
    assert.equal(data.has(ONLINE_SESSION_KEY), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
