import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class RoomError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type StoredRoom = { code: string; expiresAt: number };
type Change<T, R> = { record?: T; result: R };
const LOCK_STALE_MS = 30_000;
const CODE_PATTERN = /^[1-9][0-9]{5}$/;
const roomDirectory = () =>
  process.env.XARMY_DOT_FRONT_ROOM_DIR || join(tmpdir(), "xarmy-dot-front-rooms");

function validateCode(code: string): void {
  if (typeof code !== "string" || !CODE_PATTERN.test(code))
    throw new RoomError(400, "Oda numarası 6 rakamdan oluşmalıdır.");
}

function validateRecord(record: StoredRoom, code: string): void {
  if (!record || typeof record !== "object" || record.code !== code ||
      !Number.isSafeInteger(record.expiresAt) || record.expiresAt < 0)
    throw new RoomError(503, "Online oda verisi okunamıyor. Lütfen birazdan tekrar deneyin.");
}

async function readFileRoom<T extends StoredRoom>(
  code: string,
): Promise<T | null> {
  try {
    return decodeRoom<T>(await readFile(join(roomDirectory(), `${code}.json`), "utf8"), code);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function saveFileRoom(room: StoredRoom): Promise<void> {
  const temporary = join(
    roomDirectory(),
    `${room.code}.${randomBytes(12).toString("hex")}.tmp`,
  );
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(room), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(roomDirectory(), `${room.code}.json`));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function ownerIsAlive(contents: string): boolean {
  let pid: unknown;
  try {
    pid = (JSON.parse(contents) as { pid?: unknown }).pid;
  } catch {
    // Older releases wrote empty lock files. Only the stale-lock path may
    // recover these; current releases always record their owner.
    return false;
  }
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch (error) {
    // Permission errors and other uncertain observations do not prove death.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function recoverStaleLock(lockPath: string): Promise<void> {
  const previous = await stat(lockPath).catch(() => null);
  if (!previous || Date.now() - previous.mtimeMs <= LOCK_STALE_MS) return;

  // Only one process may inspect and remove a stale lock at a time. Without
  // this guard, a second reclaimer could unlink a newly acquired replacement.
  const reaperPath = `${lockPath}.reaper`;
  let reaper;
  try {
    reaper = await open(reaperPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }
  try {
    const current = await stat(lockPath).catch(() => null);
    if (
      !current ||
      current.ino !== previous.ino ||
      Date.now() - current.mtimeMs <= LOCK_STALE_MS
    )
      return;
    const contents = await readFile(lockPath, "utf8").catch(() => null);
    if (contents === null || ownerIsAlive(contents)) return;
    const checked = await stat(lockPath).catch(() => null);
    if (
      checked?.ino === current.ino &&
      Date.now() - checked.mtimeMs > LOCK_STALE_MS
    ) {
      await unlink(lockPath).catch(() => undefined);
    }
  } finally {
    await reaper.close();
    await unlink(reaperPath).catch(() => undefined);
  }
}

// Local development can share a disk on one host. Production serverless
// deployments use the Redis compare-and-swap transaction below instead.
async function withRoomLock<T>(
  code: string,
  action: () => Promise<T>,
): Promise<T> {
  await mkdir(roomDirectory(), { recursive: true, mode: 0o700 });
  const lockPath = join(roomDirectory(), `${code}.lock`);
  for (let attempt = 0; attempt < 80; attempt++) {
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Age alone cannot distinguish a crashed owner from a live process
      // paused during disk I/O, so recovery also checks the owner PID.
      await recoverStaleLock(lockPath);
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    const identity = await lock.stat();
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid }), "utf8");
      return await action();
    } finally {
      await lock.close();
      const current = await stat(lockPath).catch(() => null);
      if (current?.ino === identity.ino)
        await unlink(lockPath).catch(() => undefined);
    }
  }
  throw new RoomError(503, "Oda şu anda meşgul. Birazdan tekrar deneyin.");
}

type RedisConfiguration = { url: string; token: string };

function redisConfiguration(): RedisConfiguration | null {
  const candidates = [
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
  ];
  const complete = candidates.find(([url, token]) => url && token);
  if (!complete) {
    if (
      process.env.VERCEL === "1" ||
      candidates.some((pair) => pair.some(Boolean))
    ) {
      console.error(
        "Dot Front room storage needs UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN.",
      );
      throw new RoomError(
        503,
        "Online odalar henüz etkinleştirilmedi. Lütfen daha sonra tekrar dene.",
      );
    }
    return null;
  }
  const [url, token] = complete as [string, string];
  try {
    const endpoint = new URL(url);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error("HTTPS REST endpoint required");
    return { url: endpoint.toString(), token };
  } catch {
    console.error(
      "Dot Front room storage requires a valid HTTPS Redis REST endpoint without URL credentials or query parameters.",
    );
    throw new RoomError(
      503,
      "Online odalar henüz etkinleştirilmedi. Lütfen daha sonra tekrar dene.",
    );
  }
}

async function redisCommand(
  configuration: RedisConfiguration,
  command: (string | number)[],
): Promise<unknown> {
  try {
    const response = await fetch(configuration.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("Redis request rejected");
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      "error" in payload ||
      !("result" in payload)
    )
      throw new Error("Invalid Redis response");
    return (payload as { result: unknown }).result;
  } catch {
    // REST responses and fetch errors may contain credentials. Never surface
    // their bodies, endpoint, or error text in either logs or the room response.
    throw new RoomError(
      503,
      "Online oda sunucusuna erişilemiyor. Lütfen birazdan tekrar deneyin.",
    );
  }
}

const redisKey = (code: string) => `xarmy:dot-front:room:${code}`;

function decodeRoom<T extends StoredRoom>(raw: string | null, code: string): T | null {
  if (raw === null) return null;
  try {
    const record = JSON.parse(raw) as T;
    validateRecord(record, code);
    return record.expiresAt > Date.now() ? record : null;
  } catch {
    // Invalid JSON errors may include a fragment of the stored payload.
    throw new RoomError(503, "Online oda verisi okunamıyor. Lütfen birazdan tekrar deneyin.");
  }
}

async function redisRead(
  configuration: RedisConfiguration,
  code: string,
): Promise<string | null> {
  const raw = await redisCommand(configuration, ["GET", redisKey(code)]);
  if (raw !== null && typeof raw !== "string")
    throw new RoomError(
      503,
      "Online oda verisi okunamıyor. Lütfen birazdan tekrar deneyin.",
    );
  return raw;
}

// Compare the exact snapshot, not only its version: a room code can be reused
// after expiry with version 1. Lua executes atomically on Redis and never relies
// on an expiring distributed lock. PXAT preserves the original room expiry.
const COMPARE_AND_SWAP = `
local current = redis.call('GET', KEYS[1])
if (current or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PXAT', ARGV[3])
return 1
`;

export async function readStoredRoom<T extends StoredRoom>(
  code: string,
): Promise<T | null> {
  validateCode(code);
  const configuration = redisConfiguration();
  return configuration
    ? decodeRoom<T>(await redisRead(configuration, code), code)
    : readFileRoom<T>(code);
}

// change must be synchronous and free of external side effects: Redis may
// re-run it with a newer snapshot after a concurrent player commits a change.
export async function transactRoom<T extends StoredRoom, R>(
  code: string,
  change: (current: T | null) => Change<T, R>,
): Promise<R> {
  validateCode(code);
  const configuration = redisConfiguration();
  if (!configuration) {
    return withRoomLock(code, async () => {
      const outcome = change(await readFileRoom<T>(code));
      if (outcome.record) {
        validateRecord(outcome.record, code);
        await saveFileRoom(outcome.record);
      }
      return outcome.result;
    });
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    const raw = await redisRead(configuration, code);
    const outcome = change(decodeRoom<T>(raw, code));
    if (!outcome.record) return outcome.result;
    validateRecord(outcome.record, code);
    const committed = await redisCommand(configuration, [
      "EVAL",
      COMPARE_AND_SWAP,
      1,
      redisKey(code),
      raw ?? "",
      JSON.stringify(outcome.record),
      outcome.record.expiresAt,
    ]);
    if (committed === 1) return outcome.result;
    if (committed !== 0)
      throw new RoomError(
        503,
        "Online oda verisi kaydedilemiyor. Lütfen birazdan tekrar deneyin.",
      );
  }
  throw new RoomError(503, "Oda şu anda meşgul. Birazdan tekrar deneyin.");
}
