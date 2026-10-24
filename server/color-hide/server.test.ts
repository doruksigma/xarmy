import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import { createColorHideServer } from "./server";
import {
  RULES,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from "../../lib/color-hide/types";
const ORIGIN = "http://localhost:3000";
const delay = (ms = 10) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until<T>(
  read: () => T | undefined,
  description: string,
): Promise<T> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await delay();
  }
  throw new Error(`Timed out: ${description}`);
}
class Peer {
  messages: ServerMessage[] = [];
  socket: WebSocket;
  constructor(url: string) {
    this.socket = new WebSocket(url, { origin: ORIGIN });
    this.socket.on("message", (raw) =>
      this.messages.push(JSON.parse(raw.toString()) as ServerMessage),
    );
    this.socket.on("error", () => undefined);
  }
  async open() {
    await until(
      () => (this.socket.readyState === WebSocket.OPEN ? true : undefined),
      "connection",
    );
    return this;
  }
  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }
  async message<T extends ServerMessage["type"]>(
    type: T,
    from = 0,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    return until(
      () =>
        this.messages.slice(from).find((m) => m.type === type) as
          | Extract<ServerMessage, { type: T }>
          | undefined,
      type,
    );
  }
  async room(predicate: (room: RoomView) => boolean) {
    return until(
      () =>
        [...this.messages]
          .reverse()
          .find(
            (m): m is Extract<ServerMessage, { type: "snapshot" }> =>
              m.type === "snapshot" && predicate(m.room),
          )?.room,
      "room snapshot",
    );
  }
}
async function fixture(maxRooms = 100) {
  let time = 100000;
  const server = createColorHideServer({
    allowedOrigins: [ORIGIN],
    now: () => time,
    randomIndex: () => 0,
    autoTick: false,
    maxRooms,
  });
  const port = await server.listen(0, "127.0.0.1");
  const peers: Peer[] = [];
  return {
    server,
    port,
    now: () => time,
    advance: async (ms: number) => {
      time += ms;
      server.step();
      await delay();
    },
    connect: async () => {
      const peer = await new Peer(`ws://127.0.0.1:${port}`).open();
      peers.push(peer);
      return peer;
    },
    close: async () => {
      for (const peer of peers) peer.socket.terminate();
      await server.close();
    },
  };
}
async function makePlayers(
  f: Awaited<ReturnType<typeof fixture>>,
  count: number,
) {
  const peers: Peer[] = [],
    identities: Extract<ServerMessage, { type: "welcome" }>[] = [];
  for (let i = 0; i < count; i++) {
    const peer = await f.connect();
    peers.push(peer);
    peer.send(
      i === 0
        ? { type: "create", name: `Oyuncu ${i + 1}`, character: "scout" }
        : {
            type: "join",
            code: identities[0].code,
            name: `Oyuncu ${i + 1}`,
            character: "fox",
          },
    );
    identities.push(await peer.message("welcome"));
  }
  return { peers, identities };
}
async function start(peers: Peer[], round = 1) {
  for (const peer of peers) {
    peer.send({ type: "ready", ready: true });
    await peer.room(
      (r) =>
        r.phase === "lobby" &&
        r.round === round - 1 &&
        r.players.find((p) => p.id === r.you)?.ready === true,
    );
  }
  await peers[0].room(
    (r) =>
      r.phase === "lobby" &&
      r.round === round - 1 &&
      r.players.every((p) => p.ready),
  );
  peers[0].send({ type: "start" });
  return peers[0].room((r) => r.phase === "drawing" && r.round === round);
}

test("five real sockets share votes, ready status, private blackout, authoritative timeout and rematch", async () => {
  const f = await fixture();
  try {
    const { peers, identities } = await makePlayers(f, 5);
    assert.equal(new Set(identities.map((p) => p.playerId)).size, 5);
    assert.ok(identities.every((p) => p.token.length >= 43));
    const sixth = await f.connect();
    sixth.send({
      type: "join",
      code: identities[0].code,
      name: "Altıncı",
      character: "robot",
    });
    assert.match((await sixth.message("error")).message, /5|dolu/);
    for (const peer of peers.slice(0, 3))
      peer.send({ type: "vote", map: "school" });
    await peers[4].room(
      (r) => r.players.filter((p) => p.vote === "school").length === 3,
    );
    const drawing = await start(peers);
    assert.equal(drawing.map, "school");
    assert.equal(drawing.initialSeekerId, identities[0].playerId);
    assert.ok(drawing.players.every((p) => p.position === null));
    await f.advance(RULES.drawMs);
    const blackout = await peers[0].room((r) => r.phase === "hiding");
    const hidden = await peers[1].room((r) => r.phase === "hiding");
    assert.equal(blackout.phaseEndsAt - blackout.serverTime, 60000);
    assert.ok(blackout.players.every((p) => p.position === null));
    assert.ok(hidden.players.every((p) => p.position !== null));
    assert.ok(!JSON.stringify(blackout).includes(identities[1].token));
    peers[1].send({
      type: "paint",
      paint: { head: "#123456", body: "#789abc", legs: "#fedcba" },
    });
    await peers[4].room(
      (r) =>
        r.players.find((p) => p.id === identities[1].playerId)?.paint.head ===
        "#123456",
    );
    await f.advance(59999);
    assert.equal(
      (await peers[0].room((r) => r.serverTime === f.now())).phase,
      "hiding",
    );
    await f.advance(101);
    const released = await peers[0].room((r) => r.phase === "seeking");
    assert.equal(released.phaseEndsAt, drawing.phaseEndsAt + 60000 + 600000);
    assert.ok(released.players.every((p) => p.position !== null));
    await f.advance(600000);
    const end = await peers[4].room((r) => r.phase === "finished");
    assert.equal(end.winner, "hider");
    assert.equal(end.survivors.length, 4);
    peers[0].send({ type: "rematch" });
    const lobby = await peers[4].room(
      (r) => r.phase === "lobby" && r.round === 1,
    );
    assert.ok(lobby.players.every((p) => !p.ready));
    const next = await start(peers, 2);
    assert.equal(next.round, 2);
  } finally {
    await f.close();
  }
});

test("real sockets move through inputs, reject teleport/speed values, shoot once and convert hider", async () => {
  const f = await fixture();
  try {
    const { peers, identities } = await makePlayers(f, 2);
    await start(peers);
    await f.advance(RULES.drawMs);
    const before = await peers[1].room((r) => r.phase === "hiding");
    const position = before.players.find(
      (p) => p.id === identities[1].playerId,
    )!.position!;
    for (let i = 0; i < 10; i++) {
      peers[1].send({
        type: "input",
        input: {
          seq: i + 1,
          forward: 1,
          strafe: 0,
          yaw: 0,
          pitch: 0,
          sprint: false,
          crouch: false,
          jump: false,
        },
        position: { x: 99999, y: 999, z: 99999 },
      });
      await delay();
      await f.advance(50);
    }
    const moved = await peers[1].room(
      (r) =>
        r.players.find((p) => p.id === identities[1].playerId)!.position!.z <
        position.z - 1.8,
    );
    const movedPosition = moved.players.find(
      (p) => p.id === identities[1].playerId,
    )!.position!;
    assert.ok(Math.abs(movedPosition.z - (position.z - 2)) < 0.01);
    assert.equal(movedPosition.x, position.x);
    let from = peers[1].messages.length;
    peers[1].send({
      type: "input",
      input: {
        seq: 50,
        forward: 100,
        strafe: 0,
        yaw: 0,
        pitch: 0,
        sprint: true,
        crouch: false,
        jump: false,
      },
    });
    assert.match((await peers[1].message("error", from)).message, /sınır/);
    await f.advance(60000);
    const active = await peers[0].room((r) => r.phase === "seeking");
    const shooter = active.players.find(
      (p) => p.id === identities[0].playerId,
    )!.position!;
    const target = active.players.find(
      (p) => p.id === identities[1].playerId,
    )!.position!;
    const yaw = Math.atan2(-(target.x - shooter.x), -(target.z - shooter.z));
    peers[0].send({
      type: "input",
      input: {
        seq: 1,
        forward: 0,
        strafe: 0,
        yaw,
        pitch: 0,
        sprint: false,
        crouch: false,
        jump: false,
      },
    });
    peers[0].send({ type: "shoot" });
    peers[0].send({ type: "shoot" });
    const caught = await peers[1].room((r) => r.phase === "finished");
    assert.equal(caught.winner, "seeker");
    assert.ok(caught.players.every((p) => p.team === "seeker"));
    assert.equal(
      caught.players.find((p) => p.id === identities[0].playerId)!.captures,
      1,
    );
    assert.equal(
      caught.players.find((p) => p.id === identities[0].playerId)!.ammo,
      5,
    );
    assert.equal(caught.events.filter((e) => e.type === "capture").length, 1);
  } finally {
    await f.close();
  }
});

test("resume tokens are private, replace old sockets, and cannot revive expired sessions", async () => {
  const f = await fixture();
  try {
    const { peers, identities } = await makePlayers(f, 3);
    const thief = await f.connect();
    thief.send({
      type: "resume",
      code: identities[0].code,
      token: "invented-token",
    });
    assert.equal((await thief.message("error")).code, "SESSION_EXPIRED");
    const resumed = await f.connect();
    resumed.send({
      type: "resume",
      code: identities[0].code,
      token: identities[0].token,
    });
    assert.equal(
      (await resumed.message("welcome")).playerId,
      identities[0].playerId,
    );
    assert.equal((await peers[0].message("error")).code, "SESSION_REPLACED");
    await peers[1].room(
      (r) =>
        r.players.find((p) => p.id === identities[0].playerId)?.connected ===
        true,
    );
    resumed.socket.terminate();
    await peers[1].room(
      (r) =>
        r.players.find((p) => p.id === identities[0].playerId)?.connected ===
        false,
    );
    await f.advance(RULES.disconnectGraceMs + 1);
    const remaining = await peers[1].room((r) => r.players.length === 2);
    assert.equal(remaining.hostId, identities[1].playerId);
    const late = await f.connect();
    late.send({
      type: "resume",
      code: identities[0].code,
      token: identities[0].token,
    });
    assert.equal((await late.message("error")).code, "SESSION_EXPIRED");
    peers[1].send({ type: "leave" });
    await peers[1].message("left");
    const last = await peers[2].room((r) => r.players.length === 1);
    assert.equal(last.hostId, identities[2].playerId);
  } finally {
    await f.close();
  }
});

test("origin, capacity, malformed frames, oversized payloads, and health endpoint are guarded", async () => {
  const f = await fixture(1);
  try {
    const health = await fetch(`http://127.0.0.1:${f.port}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).protocol, 1);
    for (const origin of [undefined, "https://untrusted.example"]) {
      const status = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(
          `ws://127.0.0.1:${f.port}`,
          origin ? { origin } : {},
        );
        socket.on("unexpected-response", (_request, response) => {
          resolve(response.statusCode!);
          response.resume();
          socket.terminate();
        });
        socket.on("error", () => undefined);
        socket.on("open", () => {
          socket.terminate();
          reject(new Error("Unauthorized origin accepted"));
        });
      });
      assert.equal(status, 403);
    }
    await makePlayers(f, 1);
    const extra = await f.connect();
    extra.send({ type: "create", name: "Dolu", character: "robot" });
    assert.match((await extra.message("error")).message, /dolu/);
    const flood = await f.connect();
    for (let i = 0; i < 60; i++) flood.socket.send("{ invalid JSON");
    await until(
      () => (flood.socket.readyState === WebSocket.CLOSED ? true : undefined),
      "malformed frame rate limit",
    );
    const oversized = await f.connect();
    oversized.socket.send("x".repeat(9000));
    await until(
      () =>
        oversized.socket.readyState === WebSocket.CLOSED ? true : undefined,
      "payload size limit",
    );
  } finally {
    await f.close();
  }
});

test("interleaved socket inputs preserve a queued jump until the authoritative physics tick", async () => {
  const f = await fixture();
  try {
    const { peers, identities } = await makePlayers(f, 3);
    await start(peers);
    await f.advance(RULES.drawMs);
    await peers[1].room((r) => r.phase === "hiding");
    const input = {
      seq: 1,
      forward: 0,
      strafe: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      crouch: false,
      jump: true,
    };
    let from = peers[1].messages.length;
    peers[1].send({ type: "input", input });
    peers[1].send({ type: "ping" });
    await peers[1].message("pong", from);
    // The transport checks deadlines with tick(dt=0) before each message.
    // Another player and an immediately released jump key must not consume
    // this player's queued jump before the next positive-duration physics tick.
    from = peers[2].messages.length;
    peers[2].send({
      type: "input",
      input: { ...input, jump: false, forward: 1 },
    });
    peers[2].send({ type: "ping" });
    await peers[2].message("pong", from);
    from = peers[1].messages.length;
    peers[1].send({ type: "input", input: { ...input, seq: 2, jump: false } });
    peers[1].send({ type: "ping" });
    await peers[1].message("pong", from);
    await f.advance(100);
    const airborne = await peers[2].room((r) => r.serverTime === f.now());
    assert.ok(
      airborne.players.find((p) => p.id === identities[1].playerId)!.position!
        .y > 0.3,
    );
    assert.ok(
      airborne.players.find((p) => p.id === identities[2].playerId)!.position!
        .z < 24,
    );
  } finally {
    await f.close();
  }
});
