// Run with the repository's TypeScript compiler, then node --test on the output.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  RoomError,
  checkRoomOrigin,
  createRoom,
  drawRoomDice,
  getRoom,
  joinRoom as joinRoomRandom,
  moveInRoom,
  resignRoom,
  roomJson,
  roomResponse,
  roomToken,
} from "./chess-room";

let directory: string;
const previousDirectory = process.env.XARMY_CHESS_ROOM_DIR;
const storeEnvironmentNames = [
  "VERCEL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];
const previousStoreEnvironment = new Map(
  storeEnvironmentNames.map((name) => [name, process.env[name]]),
);
before(async () => {
  for (const name of storeEnvironmentNames) delete process.env[name];
  directory = await mkdtemp(join(tmpdir(), "xarmy-room-tests-"));
  process.env.XARMY_CHESS_ROOM_DIR = directory;
});
after(async () => {
  for (const [name, value] of previousStoreEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (previousDirectory === undefined) delete process.env.XARMY_CHESS_ROOM_DIR;
  else process.env.XARMY_CHESS_ROOM_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
});
const joinRoom = (code: unknown) =>
  joinRoomRandom(code, () => ({ host: 6, guest: 1 }));

const statusIs = (status: number) => (error: unknown) =>
  error instanceof RoomError && error.status === status;
async function pair() {
  const host = await createRoom();
  const guest = await joinRoom(host.room.code);
  return { host, guest, code: host.room.code };
}

test("rooms expose only the player's view and persist hashed credentials", async () => {
  const { host, guest, code } = await pair();
  assert.match(code, /^[1-9][0-9]{5}$/);
  assert.equal(host.room.color, "w");
  assert.equal(host.room.status, "waiting");
  assert.equal(guest.room.color, "b");
  const view = await getRoom(code, host.token);
  assert.equal(view.status, "playing");
  assert.equal(view.version, 2);
  assert.equal(view.moves.length, 0);
  const stored = await readFile(join(directory, `${code}.json`), "utf8");
  assert.equal(stored.includes(host.token), false);
  assert.equal(stored.includes(guest.token), false);
  assert.equal(JSON.stringify(view).includes("Hash"), false);
  await assert.rejects(getRoom(code, "a".repeat(43)), statusIs(401));
  await assert.rejects(getRoom("../../etc/passwd", host.token), statusIs(400));
});

test("simultaneous joins allow exactly one guest", async () => {
  const host = await createRoom();
  const attempts = await Promise.allSettled([
    joinRoom(host.room.code),
    joinRoom(host.room.code),
  ]);
  assert.equal(
    attempts.filter((item) => item.status === "fulfilled").length,
    1,
  );
  const rejected = attempts.find((item) => item.status === "rejected");
  assert.ok(rejected?.status === "rejected" && statusIs(409)(rejected.reason));
  await assert.rejects(joinRoom(host.room.code), statusIs(409));
});

test("legacy waiting rooms receive a real draw when the guest arrives", async () => {
  const host = await createRoom();
  const path = join(directory, `${host.room.code}.json`);
  const legacy = JSON.parse(await readFile(path, "utf8"));
  delete legacy.hostColor;
  await writeFile(path, JSON.stringify(legacy));
  assert.equal((await getRoom(host.room.code, host.token)).colorsDrawn, false);
  const guest = await joinRoomRandom(host.room.code, () => ({
    host: 2,
    guest: 5,
  }));
  assert.equal(guest.room.color, "w");
  assert.deepEqual(guest.room.colorDraw, { yourRoll: 5, opponentRoll: 2 });
  assert.equal((await getRoom(host.room.code, host.token)).color, "b");
});

test("legacy games that have already started keep their original color mapping", async () => {
  const { host, guest, code } = await pair();
  const path = join(directory, `${code}.json`);
  const legacy = JSON.parse(await readFile(path, "utf8"));
  delete legacy.hostColor;
  delete legacy.colorDraw;
  await writeFile(path, JSON.stringify(legacy));
  const hostView = await getRoom(code, host.token);
  assert.equal(hostView.color, "w");
  assert.equal(hostView.colorsDrawn, true);
  assert.equal(hostView.colorDraw, null);
  assert.equal((await getRoom(code, guest.token)).color, "b");
  await assert.rejects(
    joinRoomRandom(code, () => {
      throw new Error("active games must not be redrawn");
    }),
    statusIs(409),
  );
  await moveInRoom(code, host.token, { from: "e2", to: "e4" });
});

test("dice reroll ties and retain the first distinct rolls", () => {
  const rolls = [3, 3, 1, 1, 2, 6];
  assert.deepEqual(
    drawRoomDice(() => rolls.shift()!),
    {
      host: 2,
      guest: 6,
    },
  );
  assert.equal(rolls.length, 0);
});

test("the join draw assigns either color, persists it, and enforces the drawn turn", async () => {
  for (const drawn of ["w", "b"] as const) {
    const host = await createRoom();
    assert.equal(host.room.colorsDrawn, false);
    assert.equal(host.room.colorDraw, null);
    const dice = drawn === "w" ? { host: 6, guest: 1 } : { host: 1, guest: 6 };
    const guest = await joinRoomRandom(host.room.code, () => dice);
    const currentHost = await getRoom(host.room.code, host.token);
    assert.equal(currentHost.colorsDrawn, true);
    assert.equal(currentHost.color, drawn);
    assert.notEqual(guest.room.color, drawn);
    assert.deepEqual(currentHost.colorDraw, {
      yourRoll: dice.host,
      opponentRoll: dice.guest,
    });
    assert.deepEqual(guest.room.colorDraw, {
      yourRoll: dice.guest,
      opponentRoll: dice.host,
    });
    const white = drawn === "w" ? host : guest;
    const black = drawn === "w" ? guest : host;
    await assert.rejects(
      moveInRoom(host.room.code, black.token, { from: "e7", to: "e5" }),
      statusIs(409),
    );
    await moveInRoom(host.room.code, white.token, { from: "e2", to: "e4" });
    const persisted = await getRoom(host.room.code, host.token);
    assert.equal(persisted.color, drawn);
    assert.deepEqual(persisted.colorDraw, currentHost.colorDraw);
    const raw = JSON.parse(
      await readFile(join(directory, `${host.room.code}.json`), "utf8"),
    );
    assert.deepEqual(raw.colorDraw, dice);
    const resigned = await resignRoom(host.room.code, host.token);
    assert.equal(resigned.result?.winner, drawn === "w" ? "b" : "w");
  }
});

test("all distinct dice outcomes give each player equal chances of white", async () => {
  let whiteHosts = 0;
  let blackHosts = 0;
  for (let hostDie = 1; hostDie <= 6; hostDie++) {
    for (let guestDie = 1; guestDie <= 6; guestDie++) {
      if (hostDie === guestDie) continue;
      const host = await createRoom();
      await joinRoomRandom(host.room.code, () => ({
        host: hostDie,
        guest: guestDie,
      }));
      const view = await getRoom(host.room.code, host.token);
      assert.equal(view.color, hostDie > guestDie ? "w" : "b");
      if (view.color === "w") whiteHosts++;
      else blackHosts++;
    }
  }
  assert.equal(whiteHosts, 15);
  assert.equal(blackHosts, 15);
});

test("waiting, illegal, out-of-turn, and duplicate stale moves cannot change the board", async () => {
  const host = await createRoom();
  const code = host.room.code;
  await assert.rejects(
    moveInRoom(code, host.token, { from: "e2", to: "e4" }),
    statusIs(409),
  );
  const guest = await joinRoom(code);
  await assert.rejects(
    moveInRoom(code, guest.token, { from: "e7", to: "e5" }),
    statusIs(409),
  );
  await assert.rejects(
    moveInRoom(code, host.token, { from: "e2", to: "e5" }),
    statusIs(400),
  );
  await assert.rejects(
    moveInRoom(code, host.token, { from: "e2", to: "e4", promotion: "king" }),
    statusIs(400),
  );
  const attempts = await Promise.allSettled([
    moveInRoom(code, host.token, { from: "e2", to: "e4", expectedVersion: 2 }),
    moveInRoom(code, host.token, { from: "d2", to: "d4", expectedVersion: 2 }),
  ]);
  assert.equal(
    attempts.filter((item) => item.status === "fulfilled").length,
    1,
  );
  assert.equal((await getRoom(code, guest.token)).moves.length, 1);
  await assert.rejects(
    moveInRoom(code, guest.token, { from: "e7", to: "e5", expectedVersion: 2 }),
    statusIs(409),
  );
  const next = await moveInRoom(code, guest.token, {
    from: "e7",
    to: "e5",
    expectedVersion: 3,
  });
  assert.equal(next.version, 4);
  assert.deepEqual(next.lastMove, { from: "e7", to: "e5", san: "e5" });
});

test("checkmate ends the game and remains visible to both players", async () => {
  const { host, guest, code } = await pair();
  await moveInRoom(code, host.token, { from: "f2", to: "f3" });
  await moveInRoom(code, guest.token, { from: "e7", to: "e5" });
  await moveInRoom(code, host.token, { from: "g2", to: "g4" });
  const view = await moveInRoom(code, guest.token, { from: "d8", to: "h4" });
  assert.equal(view.status, "finished");
  assert.deepEqual(view.result, { winner: "b", reason: "checkmate" });
  assert.equal((await getRoom(code, host.token)).fen, view.fen);
  await assert.rejects(
    moveInRoom(code, host.token, { from: "e2", to: "e4" }),
    statusIs(409),
  );
});

test("threefold repetition survives reconstruction from persisted move history", async () => {
  const { host, guest, code } = await pair();
  for (let cycle = 0; cycle < 2; cycle++) {
    await moveInRoom(code, host.token, { from: "g1", to: "f3" });
    await moveInRoom(code, guest.token, { from: "g8", to: "f6" });
    await moveInRoom(code, host.token, { from: "f3", to: "g1" });
    await moveInRoom(code, guest.token, { from: "f6", to: "g8" });
  }
  assert.deepEqual((await getRoom(code, host.token)).result, {
    winner: null,
    reason: "threefold",
  });
});

test("en passant and explicit underpromotion use authoritative chess rules", async () => {
  const first = await pair();
  await moveInRoom(first.code, first.host.token, { from: "e2", to: "e4" });
  await moveInRoom(first.code, first.guest.token, { from: "a7", to: "a6" });
  await moveInRoom(first.code, first.host.token, { from: "e4", to: "e5" });
  await moveInRoom(first.code, first.guest.token, { from: "d7", to: "d5" });
  const captured = await moveInRoom(first.code, first.host.token, {
    from: "e5",
    to: "d6",
  });
  assert.equal(captured.moves.at(-1), "exd6");
  const { host, guest, code } = await pair();
  for (const [from, to, token] of [
    ["a2", "a4", host.token],
    ["h7", "h5", guest.token],
    ["a4", "a5", host.token],
    ["h5", "h4", guest.token],
    ["a5", "a6", host.token],
    ["h4", "h3", guest.token],
    ["a6", "b7", host.token],
    ["h3", "g2", guest.token],
  ])
    await moveInRoom(code, token, { from, to });
  await assert.rejects(
    moveInRoom(code, host.token, { from: "b7", to: "a8" }),
    statusIs(400),
  );
  const promoted = await moveInRoom(code, host.token, {
    from: "b7",
    to: "a8",
    promotion: "n",
  });
  assert.equal(promoted.lastMove?.promotion, "n");
  assert.match(promoted.moves.at(-1)!, /=N/);
});

test("resignation is authenticated, final, and idempotent", async () => {
  const { host, guest, code } = await pair();
  await assert.rejects(resignRoom(code, "x".repeat(43)), statusIs(401));
  const result = await resignRoom(code, guest.token);
  assert.deepEqual(result.result, { winner: "w", reason: "resignation" });
  assert.deepEqual((await resignRoom(code, host.token)).result, result.result);
  await assert.rejects(
    moveInRoom(code, host.token, { from: "e2", to: "e4" }),
    statusIs(409),
  );
});

test("the host can cancel a waiting room and prevent later joins", async () => {
  const host = await createRoom();
  const closed = await resignRoom(host.room.code, host.token);
  assert.equal(closed.status, "finished");
  assert.deepEqual(closed.result, { winner: null, reason: "cancelled" });
  await assert.rejects(joinRoom(host.room.code), statusIs(409));
});

test("expired rooms disappear and a stale crashed-process lock can be recovered", async () => {
  const { host, guest, code } = await pair();
  const lock = join(directory, `${code}.lock`);
  const exited = spawnSync(process.execPath, ["-e", ""]);
  assert.equal(exited.status, 0);
  await writeFile(lock, JSON.stringify({ pid: exited.pid }));
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
  await moveInRoom(code, host.token, { from: "e2", to: "e4" });
  const path = join(directory, `${code}.json`);
  const stored = JSON.parse(await readFile(path, "utf8"));
  stored.expiresAt = Date.now() - 1;
  await writeFile(path, JSON.stringify(stored));
  await assert.rejects(getRoom(code, guest.token), statusIs(404));
  await assert.rejects(joinRoom(code), statusIs(404));
});

test("concurrent stale-lock reclamation commits only one versioned move", async () => {
  const { host, guest, code } = await pair();
  const lock = join(directory, `${code}.lock`);
  await writeFile(lock, "");
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
  const attempts = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      moveInRoom(code, host.token, {
        from: index % 2 ? "d2" : "e2",
        to: index % 2 ? "d4" : "e4",
        expectedVersion: 2,
      }),
    ),
  );
  assert.equal(
    attempts.filter((item) => item.status === "fulfilled").length,
    1,
  );
  for (const attempt of attempts) {
    if (attempt.status === "rejected") assert.ok(statusIs(409)(attempt.reason));
  }
  const view = await getRoom(code, guest.token);
  assert.equal(view.version, 3);
  assert.equal(view.moves.length, 1);
});

test("an old lock owned by a live process is never reclaimed", async () => {
  const { host, code } = await pair();
  const lock = join(directory, `${code}.lock`);
  const owner = JSON.stringify({ pid: process.pid });
  await writeFile(lock, owner);
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
  try {
    await assert.rejects(
      moveInRoom(code, host.token, {
        from: "e2",
        to: "e4",
        expectedVersion: 2,
      }),
      statusIs(503),
    );
    assert.equal(await readFile(lock, "utf8"), owner);
    assert.equal((await getRoom(code, host.token)).moves.length, 0);
  } finally {
    await rm(lock, { force: true });
  }
});

test("HTTP helpers bound JSON, reject cross-origin writes, and never cache secrets", async () => {
  const request = (body: string) =>
    new Request("http://localhost/api/chess/rooms/join", {
      method: "POST",
      body,
    });
  assert.deepEqual(await roomJson(request('{"code":"123456"}')), {
    code: "123456",
  });
  await assert.rejects(roomJson(request("[1]")), statusIs(400));
  await assert.rejects(roomJson(request("{")), statusIs(400));
  await assert.rejects(roomJson(request("x".repeat(1025))), statusIs(413));
  assert.throws(
    () =>
      checkRoomOrigin(
        new Request("http://localhost/api/chess/rooms", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    statusIs(403),
  );
  assert.throws(
    () =>
      checkRoomOrigin(
        new Request("http://localhost/api/chess/rooms", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    statusIs(403),
  );
  checkRoomOrigin(
    new Request("http://localhost/api/chess/rooms", {
      headers: { origin: "http://localhost" },
    }),
  );
  assert.throws(
    () => roomToken(new Request("http://localhost")),
    statusIs(401),
  );
  const response = await roomResponse(async () => {
    throw new RoomError(409, "Oda dolu");
  });
  assert.equal(response.status, 409);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await response.json(), { error: "Oda dolu" });
});
