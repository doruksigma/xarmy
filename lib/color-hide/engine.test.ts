import assert from "node:assert/strict";
import test from "node:test";
import {
  addPlayer,
  applyMessage,
  createRoom,
  removePlayer,
  setConnected,
  snapshot,
  tick,
} from "./engine";
import type { Room } from "./engine";
import { DEFAULT_PAINT, RULES } from "./types";
import type { ClientMessage, InputState } from "./types";

const user = (n: number) => ({
  id: `p${n}`,
  name: `Oyuncu ${n}`,
  character: "scout" as const,
});
function lobby(count = 3, pick = 0) {
  const room = createRoom("ABC123", user(0), 0, () => pick);
  for (let i = 1; i < count; i++) addPlayer(room, user(i), 0);
  for (const p of Object.values(room.players))
    applyMessage(room, p.id, { type: "ready", ready: true }, 0);
  return room;
}
function seeking(count = 3): Room {
  const room = lobby(count);
  applyMessage(room, "p0", { type: "start" }, 0);
  tick(room, RULES.drawMs + RULES.hideMs, 0.05);
  return room;
}
const searchAt = RULES.drawMs + RULES.hideMs;
function movement(
  room: Room,
  id: string,
  now: number,
  data: Partial<InputState> = {},
) {
  applyMessage(
    room,
    id,
    {
      type: "input",
      input: {
        seq: room.players[id].lastInputSeq + 1,
        forward: 0,
        strafe: 0,
        yaw: 0,
        pitch: 0,
        sprint: false,
        crouch: false,
        jump: false,
        ...data,
      },
    },
    now,
  );
}
function clearLine(room: Room) {
  room.players.p0.position = { x: 0, y: 0, z: 24 };
  room.players.p1.position = { x: 0, y: 0, z: 18 };
  if (room.players.p2) room.players.p2.position = { x: 6, y: 0, z: 20 };
}

test("lobby validates names/characters, reserves at most five slots, and blocks late joins", () => {
  const room = lobby(5);
  assert.throws(() => addPlayer(room, user(5), 0), /Oda dolu/);
  assert.throws(
    () => createRoom("ABC123", { ...user(0), name: " " }, 0),
    /1–24/,
  );
  assert.throws(
    () =>
      createRoom("ABC123", { ...user(0), character: "untrusted" as never }, 0),
    /karakter/,
  );
  setConnected(room, "p4", false, 100);
  assert.throws(() => addPlayer(room, user(5), 100), /Oda dolu/);
  tick(room, 100 + RULES.disconnectGraceMs, 0.05);
  addPlayer(room, user(5), 21000);
  applyMessage(room, "p5", { type: "ready", ready: true }, 21000);
  applyMessage(room, "p0", { type: "start" }, 21000);
  assert.throws(() => addPlayer(room, user(6), 21000), /Tur başladı/);
});

test("only host can start with at least two connected ready players", () => {
  const room = lobby(1);
  assert.throws(() => applyMessage(room, "p0", { type: "start" }, 0), /2–5/);
  addPlayer(room, user(1), 0);
  assert.throws(
    () => applyMessage(room, "p1", { type: "start" }, 0),
    /oda sahibi/,
  );
  assert.throws(() => applyMessage(room, "p0", { type: "start" }, 0), /hazır/);
  applyMessage(room, "p1", { type: "ready", ready: true }, 0);
  setConnected(room, "p1", false, 0);
  assert.throws(() => applyMessage(room, "p0", { type: "start" }, 0), /hazır/);
  setConnected(room, "p1", true, 1);
  applyMessage(room, "p0", { type: "start" }, 1);
  assert.equal(room.phase, "drawing");
});

test("uniform draw maps each random slot to exactly one player, and voting chooses majority", () => {
  for (let i = 0; i < 5; i++) {
    const room = lobby(5, i);
    for (const p of Object.values(room.players))
      applyMessage(room, p.id, { type: "vote", map: "school" }, 0);
    applyMessage(room, "p0", { type: "start" }, 0);
    assert.equal(room.initialSeekerId, `p${i}`);
    assert.equal(
      Object.values(room.players).filter((p) => p.team === "seeker").length,
      1,
    );
    assert.equal(room.map, "school");
  }
  const tied = lobby(2);
  applyMessage(tied, "p1", { type: "vote", map: "city" }, 0);
  const calls: number[] = [];
  tied.randomIndex = (length) => {
    calls.push(length);
    return length - 1;
  };
  applyMessage(tied, "p0", { type: "start" }, 0);
  assert.equal(tied.map, "city");
  assert.equal(tied.initialSeekerId, "p1");
  assert.deepEqual(calls, [2, 2]);
});

test("server deadlines provide four-second draw, sixty-second hiding, ten-minute search", () => {
  const room = lobby();
  applyMessage(room, "p0", { type: "start" }, 0);
  tick(room, 3999, 0.05);
  assert.equal(room.phase, "drawing");
  tick(room, 4000, 0.05);
  assert.equal(room.phase, "hiding");
  assert.equal(room.phaseEndsAt, 64000);
  tick(room, 63999, 0.05);
  assert.equal(room.phase, "hiding");
  tick(room, 64000, 0.05);
  assert.equal(room.phase, "seeking");
  assert.equal(room.phaseEndsAt, 664000);
  tick(room, 663999, 0.05);
  assert.equal(room.phase, "seeking");
  tick(room, 664000, 0.05);
  assert.equal(room.phase, "finished");
  assert.equal(room.winner, "hider");
  assert.deepEqual(room.survivors, ["p1", "p2"]);
  assert.equal(room.players.p1.survivedMs, 660000);
});

test("delayed server tick does not lengthen phases; a deadline shot cannot steal a timeout win", () => {
  const room = lobby(2);
  applyMessage(room, "p0", { type: "start" }, 100);
  tick(room, 664100, 0.05);
  assert.equal(room.phase, "finished");
  assert.equal(room.winner, "hider");
  const another = seeking(2);
  clearLine(another);
  assert.throws(
    () =>
      applyMessage(another, "p0", { type: "shoot" }, searchAt + RULES.seekMs),
    /arama aşamasında/,
  );
  assert.equal(another.winner, "hider");
  assert.equal(another.players.p1.team, "hider");
});

test("hiding snapshot redacts coordinates, aim, movement and positional events from seeker", () => {
  const room = lobby();
  applyMessage(room, "p0", { type: "start" }, 0);
  tick(room, 4000, 0.05);
  room.players.p1.position = { x: 12, y: 0, z: 15 };
  room.players.p1.yaw = 2;
  room.players.p1.moving = true;
  room.events.push({
    id: 900,
    type: "shot",
    at: 4000,
    position: { x: 12, y: 1, z: 15 },
    direction: { x: 1, y: 0, z: 0 },
  });
  const secret = snapshot(room, "p0", 4000);
  assert.ok(
    secret.players.every(
      (p) => p.position === null && p.yaw === 0 && !p.moving,
    ),
  );
  assert.ok(secret.events.every((e) => !e.position && !e.direction));
  assert.deepEqual(
    snapshot(room, "p1", 4000).players.find((p) => p.id === "p1")!.position,
    { x: 12, y: 0, z: 15 },
  );
  tick(room, searchAt, 0.05);
  assert.ok(
    snapshot(room, "p0", searchAt).players.every((p) => p.position !== null),
  );
});

test("seeker cannot move or shoot in hiding; hider can move and paint only during preparation", () => {
  const room = lobby();
  applyMessage(room, "p0", { type: "start" }, 0);
  tick(room, 4000, 0.05);
  const origin = { ...room.players.p0.position };
  movement(room, "p0", 5000, { forward: 1, sprint: true });
  movement(room, "p1", 5000, { forward: 1 });
  tick(room, 5000, 0.1);
  assert.deepEqual(room.players.p0.position, origin);
  assert.ok(room.players.p1.position.z < 24);
  assert.throws(
    () => applyMessage(room, "p0", { type: "shoot" }, 5000),
    /arama aşamasında/,
  );
  assert.throws(
    () =>
      applyMessage(room, "p0", { type: "paint", paint: DEFAULT_PAINT }, 5000),
    /Boyanma/,
  );
  applyMessage(
    room,
    "p1",
    {
      type: "paint",
      paint: { head: "#ABCDEF", body: "#123456", legs: "#001100" },
    },
    5000,
  );
  assert.equal(room.players.p1.paint.head, "#abcdef");
  assert.throws(
    () =>
      applyMessage(
        room,
        "p1",
        { type: "paint", paint: { ...DEFAULT_PAINT, head: "url(evil)" } },
        5000,
      ),
    /HEX/,
  );
  tick(room, searchAt, 0.05);
  assert.throws(
    () =>
      applyMessage(
        room,
        "p1",
        { type: "paint", paint: DEFAULT_PAINT },
        searchAt,
      ),
    /Boyanma/,
  );
});

test("authoritative motion ignores positions, normalizes diagonal speed, and expires stale input", () => {
  const room = seeking();
  room.players.p1.position = { x: 0, y: 0, z: 26 };
  movement(room, "p1", searchAt, { forward: 1, strafe: 1 });
  tick(room, searchAt, 50); // An oversized elapsed duration is capped.
  assert.ok(
    Math.abs(
      Math.hypot(room.players.p1.position.x, room.players.p1.position.z - 26) -
        0.4,
    ) < 1e-9,
  );
  const stopped = { ...room.players.p1.position };
  tick(room, searchAt + 500, 0.1);
  assert.deepEqual(room.players.p1.position, stopped);
  applyMessage(
    room,
    "p1",
    {
      type: "input",
      input: {
        ...room.players.p1.input,
        seq: 999,
        x: 9000,
        position: { x: 8000, y: 8, z: 8000 },
        forward: 0,
        strafe: 0,
      },
    } as ClientMessage,
    searchAt + 600,
  );
  tick(room, searchAt + 600, 0.05);
  assert.deepEqual(room.players.p1.position, stopped);
  assert.equal(room.players.p1.lastInputSeq, 999);
});

test("invalid and stale input cannot accelerate or rotate a player", () => {
  const room = seeking();
  movement(room, "p1", searchAt, { yaw: 1 });
  const last = room.players.p1.input;
  applyMessage(
    room,
    "p1",
    { type: "input", input: { ...last, yaw: 2 } },
    searchAt + 10,
  );
  assert.equal(room.players.p1.yaw, 1);
  for (const data of [
    { forward: 2 },
    { yaw: Infinity },
    { pitch: NaN },
    { seq: -1 },
    { jump: "yes" },
  ])
    assert.throws(
      () => movement(room, "p1", searchAt + 20, data as Partial<InputState>),
      /Hareket/,
    );
  assert.throws(
    () =>
      applyMessage(
        room,
        "p1",
        {
          type: "teleport",
          position: { x: 3, y: 0, z: 3 },
        } as unknown as ClientMessage,
        searchAt,
      ),
    /Bilinmeyen/,
  );
});

test("solid perimeter blocks walking and sprinting without tunnelling", () => {
  const room = seeking();
  room.players.p1.position = { x: 0, y: 0, z: -30 };
  for (let i = 0; i < 60; i++) {
    const at = searchAt + i * 50;
    movement(room, "p1", at, { forward: 1, sprint: true });
    tick(room, at, 0.05);
  }
  assert.ok(room.players.p1.position.z > -31.16);
  assert.ok(room.players.p1.position.z < -30.8);
});

test("jump is authoritative, holding jump does not fly, crouch reduces movement", () => {
  const room = seeking();
  room.players.p1.position = { x: 0, y: 0, z: 26 };
  movement(room, "p1", searchAt, { jump: true });
  tick(room, searchAt, 0.05);
  assert.ok(room.players.p1.position.y > 0);
  for (let i = 1; i <= 40; i++) {
    movement(room, "p1", searchAt + i * 50, { jump: true });
    tick(room, searchAt + i * 50, 0.05);
  }
  assert.equal(room.players.p1.position.y, 0);
  movement(room, "p1", searchAt + 2050, {
    crouch: true,
    forward: 1,
    sprint: true,
  });
  tick(room, searchAt + 2050, 0.1);
  assert.equal(room.players.p1.crouching, true);
  assert.ok(Math.abs(room.players.p1.position.z - 25.8) < 1e-9);
  room.players.p1.position.y = 2;
  room.players.p1.velocityY = 0; // unsupported apex/ceiling contact
  movement(room, "p1", searchAt + 2100, { jump: true });
  tick(room, searchAt + 2100, 0.05);
  assert.ok(
    room.players.p1.position.y < 2,
    "a new jump cannot launch from unsupported air",
  );
});

test("authoritative pellets capture once, convert to seeker, and never hurt teammates", () => {
  const room = seeking();
  clearLine(room);
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 100);
  assert.equal(room.players.p1.team, "seeker");
  assert.equal(room.players.p1.ammo, 6);
  assert.equal(room.players.p0.captures, 1);
  assert.equal(room.players.p0.ammo, 5);
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 100);
  assert.equal(room.players.p0.ammo, 5);
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 1000);
  assert.equal(room.players.p0.captures, 1);
  assert.equal(room.players.p1.team, "seeker");
  assert.equal(room.events.filter((e) => e.type === "capture").length, 1);
  assert.equal(room.phase, "seeking");
});

test("last capture ends the round immediately and freezes movement; survivors are empty", () => {
  const room = seeking(2);
  clearLine(room);
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 1000);
  assert.equal(room.phase, "finished");
  assert.equal(room.winner, "seeker");
  assert.deepEqual(room.survivors, []);
  assert.equal(room.players.p1.survivedMs, RULES.hideMs + 1000);
  const origin = { ...room.players.p1.position };
  movement(room, "p1", searchAt + 1100, { forward: 1 });
  tick(room, searchAt + 1100, 0.1);
  assert.deepEqual(room.players.p1.position, origin);
});

test("wall obstruction, crouch hitbox and maximum range are checked by server", () => {
  const room = seeking();
  room.players.p0.position = { x: 8, y: 0, z: 14 };
  room.players.p1.position = { x: 8, y: 0, z: 4 }; // rock at8,8 blocks both bodies
  room.players.p2.position = { x: -28, y: 0, z: 24 };
  applyMessage(room, "p0", { type: "shoot" }, searchAt);
  assert.equal(room.players.p1.team, "hider");
  room.players.p0.position = { x: 30, y: 0, z: 24 };
  room.players.p1.position = { x: 30, y: 0, z: -20 };
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 1000);
  assert.equal(room.players.p1.team, "hider");
  room.players.p0.position = { x: 0, y: 0, z: 24 };
  room.players.p1.position = { x: 0, y: 0, z: 22 };
  room.players.p1.crouching = true;
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 2000);
  assert.equal(
    room.players.p1.team,
    "hider",
    "standing straight shot misses nearby crouched body",
  );
  movement(room, "p0", searchAt + 3000, { pitch: -0.4 });
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 3000);
  assert.equal(room.players.p1.team, "seeker");
});

test("reload and shot cadence prevent unlimited fire; hiders cannot use weapons", () => {
  const room = seeking();
  room.players.p0.position = { x: 30, y: 0, z: 30 };
  movement(room, "p0", searchAt, { yaw: -Math.PI / 2 });
  assert.throws(
    () => applyMessage(room, "p1", { type: "shoot" }, searchAt),
    /arama aşamasında/,
  );
  assert.throws(
    () => applyMessage(room, "p1", { type: "reload" }, searchAt),
    /Yalnızca/,
  );
  for (let i = 0; i < 6; i++)
    applyMessage(room, "p0", { type: "shoot" }, searchAt + i * 1000);
  assert.equal(room.players.p0.ammo, 0);
  assert.throws(
    () => applyMessage(room, "p0", { type: "shoot" }, searchAt + 6000),
    /Şarjör boş/,
  );
  applyMessage(room, "p0", { type: "reload" }, searchAt + 6000);
  assert.equal(room.players.p0.reloadEndsAt, searchAt + 7800);
  applyMessage(room, "p0", { type: "reload" }, searchAt + 6200);
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 7700);
  assert.equal(room.players.p0.ammo, 0);
  tick(room, searchAt + 7799, 0.05);
  assert.equal(room.players.p0.ammo, 0);
  tick(room, searchAt + 7800, 0.05);
  assert.equal(room.players.p0.ammo, 6);
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 7800);
  assert.equal(room.players.p0.ammo, 5);
});

test("disconnect grace supports resume and transfers host without moving disconnected players", () => {
  const room = seeking();
  movement(room, "p0", searchAt, { forward: 1 });
  setConnected(room, "p0", false, searchAt);
  assert.equal(room.hostId, "p1");
  const origin = { ...room.players.p0.position };
  tick(room, searchAt + 100, 0.1);
  assert.deepEqual(room.players.p0.position, origin);
  tick(room, searchAt + RULES.disconnectGraceMs - 1, 0.05);
  assert.ok(room.players.p0);
  setConnected(room, "p0", true, searchAt + RULES.disconnectGraceMs - 1);
  tick(room, searchAt + RULES.disconnectGraceMs + 1, 0.05);
  assert.ok(room.players.p0.connected);
  assert.equal(room.players.p0.team, "seeker");
});

test("departed seeker is replaced; fewer than two players cancels instead of hanging", () => {
  const room = seeking(4);
  removePlayer(room, "p0", searchAt + 100);
  assert.equal(room.hostId, "p1");
  assert.equal(room.players.p1.team, "seeker");
  assert.equal(room.phase, "seeking");
  removePlayer(room, "p2", searchAt + 200);
  assert.equal(room.phase, "seeking");
  removePlayer(room, "p3", searchAt + 300);
  assert.equal(room.phase, "finished");
  assert.equal(room.winner, null);
  assert.match(room.finishReason!, /Oyuncu sayısı/);
});

test("last hider departure resolves seeking win and grace expiry releases lobby capacity", () => {
  const room = seeking();
  clearLine(room);
  applyMessage(room, "p0", { type: "shoot" }, searchAt);
  removePlayer(room, "p2", searchAt + 100);
  assert.equal(room.winner, "seeker");
  assert.equal(room.phase, "finished");
  const waiting = lobby(5);
  setConnected(waiting, "p4", false, 100);
  tick(waiting, 20100, 0.05);
  assert.equal(Object.keys(waiting.players).length, 4);
  addPlayer(waiting, user(5), 20100);
  assert.equal(Object.keys(waiting.players).length, 5);
});

test("rematch keeps room and paint, clears readiness/results/votes and draws again", () => {
  const room = seeking(2);
  clearLine(room);
  room.players.p1.paint.body = "#112233";
  applyMessage(room, "p0", { type: "shoot" }, searchAt + 100);
  assert.throws(
    () => applyMessage(room, "p1", { type: "rematch" }, searchAt + 200),
    /oda sahibi/,
  );
  applyMessage(room, "p0", { type: "rematch" }, searchAt + 200);
  assert.equal(room.phase, "lobby");
  assert.equal(room.code, "ABC123");
  assert.equal(room.initialSeekerId, null);
  assert.equal(room.winner, null);
  assert.ok(
    Object.values(room.players).every(
      (p) => !p.ready && p.team === "hider" && p.captures === 0,
    ),
  );
  assert.equal(room.players.p1.paint.body, "#112233");
  room.randomIndex = (n) => n - 1;
  for (const p of Object.values(room.players)) {
    applyMessage(room, p.id, { type: "ready", ready: true }, searchAt + 300);
    applyMessage(room, p.id, { type: "vote", map: "city" }, searchAt + 300);
  }
  applyMessage(room, "p0", { type: "start" }, searchAt + 400);
  assert.equal(room.round, 2);
  assert.equal(room.initialSeekerId, "p1");
  assert.equal(room.map, "city");
});

test("snapshots expose no internal input/RNG state and cannot mutate authoritative room", () => {
  const room = seeking();
  const view = snapshot(room, "p1", searchAt);
  assert.equal("randomIndex" in view, false);
  assert.equal("input" in view.players[0], false);
  assert.equal("lastShotAt" in view.players[0], false);
  view.players[0].position!.x = 900;
  view.players[0].paint.body = "#000000";
  assert.notEqual(room.players.p0.position.x, 900);
  assert.notEqual(room.players.p0.paint.body, "#000000");
  assert.throws(() => snapshot(room, "absent", searchAt), /bulunamadı/);
});

test("third-person converged aim uses server eye origin without rotating movement input", () => {
  const room = seeking();
  clearLine(room);
  room.players.p1.position = { x: 0.8, y: 0, z: 20 };
  applyMessage(room, "p0", { type: "shoot" }, searchAt);
  assert.equal(
    room.players.p1.team,
    "hider",
    "a parallel camera heading misses the offset target",
  );
  const aim = {
    yaw: Math.atan2(-0.8, 4),
    pitch: Math.atan2(1.2 - 1.42, Math.hypot(0.8, 4)),
  };
  applyMessage(room, "p0", { type: "shoot", aim }, searchAt + 1000);
  assert.equal(room.players.p1.team, "seeker");
  assert.equal(room.players.p0.yaw, 0);
  assert.equal(room.players.p0.input.yaw, 0);
  const shot = room.events.filter((e) => e.type === "shot").at(-1)!;
  assert.deepEqual(shot.position, { x: 0, y: 1.42, z: 24 });
  assert.ok(shot.direction!.x > 0);
});

test("malformed explicit shot aim is rejected without consuming ammunition or cooldown", () => {
  const room = seeking();
  for (const aim of [
    null,
    "forward",
    {},
    { yaw: 0, pitch: NaN },
    { yaw: Infinity, pitch: 0 },
    { yaw: "0", pitch: 0 },
    { yaw: 1000001, pitch: 0 },
    { yaw: 0, pitch: 1.21 },
    { yaw: 0, pitch: -1.21 },
  ]) {
    assert.throws(
      () =>
        applyMessage(
          room,
          "p0",
          { type: "shoot", aim } as ClientMessage,
          searchAt,
        ),
      /Nişan yönü/,
    );
    assert.equal(room.players.p0.ammo, RULES.magazine);
    assert.equal(room.players.p0.lastShotAt, -Infinity);
  }
  assert.equal(room.events.filter((e) => e.type === "shot").length, 0);
});

test("explicit aim cannot bypass cover or forge an origin or capture target", () => {
  const room = seeking();
  room.players.p0.position = { x: 8, y: 0, z: 14 };
  room.players.p1.position = { x: 8, y: 0, z: 4 };
  room.players.p2.position = { x: -28, y: 0, z: 24 };
  applyMessage(
    room,
    "p0",
    {
      type: "shoot",
      aim: { yaw: 0, pitch: 0 },
      origin: { x: 8, y: 1.42, z: 5 },
      targetId: "p1",
    } as ClientMessage,
    searchAt,
  );
  assert.equal(room.players.p1.team, "hider");
  assert.equal(room.players.p0.captures, 0);
  const shot = room.events.filter((e) => e.type === "shot").at(-1)!;
  assert.deepEqual(shot.position, { x: 8, y: 1.42, z: 14 });
  room.players.p0.position = { x: 30, y: 0, z: 24 };
  room.players.p1.position = { x: 30, y: 0, z: -20 };
  applyMessage(
    room,
    "p0",
    { type: "shoot", aim: { yaw: 0, pitch: 0 } },
    searchAt + 1000,
  );
  assert.equal(
    room.players.p1.team,
    "hider",
    "explicit direction does not extend weapon range",
  );
});

test("zero-time packet ticks preserve queued jumps, air velocity and movement animation", () => {
  const room = seeking(5);
  const jumper = room.players.p1;
  jumper.position = { x: 0, y: 0, z: 26 };
  movement(room, "p1", searchAt, { jump: true, forward: 1 });
  // Every incoming WebSocket packet enforces deadlines with tick(..., 0).
  // Other players' input and even releasing jump before the next frame must
  // not consume the press before the authoritative physics tick can integrate it.
  for (const id of ["p2", "p3", "p4", "p0"]) {
    tick(room, searchAt + 10, 0);
    movement(room, id, searchAt + 10, { forward: 1 });
  }
  tick(room, searchAt + 15, 0);
  movement(room, "p1", searchAt + 15, { jump: false, forward: 1 });
  assert.equal(jumper.jumpQueued, true);
  assert.equal(jumper.position.y, 0);
  tick(room, searchAt + 50, 0.05);
  assert.ok(jumper.position.y > 0);
  assert.ok(jumper.velocityY > 0);
  assert.equal(jumper.moving, true);
  const position = { ...jumper.position };
  const velocity = jumper.velocityY;
  for (let i = 0; i < 10; i++) tick(room, searchAt + 51 + i, 0);
  assert.deepEqual(jumper.position, position);
  assert.equal(jumper.velocityY, velocity);
  assert.equal(jumper.moving, true);
  assert.equal(jumper.jumpQueued, false);
  assert.equal(jumper.survivedMs, RULES.hideMs + 60);
});
