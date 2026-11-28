import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createMatch } from "../app/games/dot-front/engine";
import type { Match } from "../app/games/dot-front/engine";
import { isGameCommand } from "../app/games/dot-front/commands";
import type { GameCommand } from "../app/games/dot-front/commands";
import { mapIds } from "../app/games/dot-front/terrain";
import type { MapId } from "../app/games/dot-front/terrain";
import { packMatch, unpackMatch, unpackStoredMatch, MAX_ONLINE_BODY_BYTES } from "../app/games/dot-front/online-protocol";
import type { PackedMatch } from "../app/games/dot-front/online-protocol";
import type { OnlineRole, OnlineSpeed, QueuedCommand, RoomAccess, RoomView } from "../app/games/dot-front/online-types";
import { transactRoom, RoomError } from "./dot-front-room-store";
export { RoomError } from "./dot-front-room-store";

const LIFETIME = 2 * 60 * 60 * 1000;
const HEARTBEAT = 8000;
const MAX_QUEUE = 128;
const MAX_BATCH = 32;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[1-9][0-9]{5}$/;
const speeds: readonly number[] = [.5, 1, 2, 3];
type Presence = { present: boolean; seen: number };
type RoomRecord = {
  protocol: 1; code: string; map: MapId; hostHash: string; guestHash: string | null;
  createdAt: number; expiresAt: number; revision: number; controlVersion: number;
  status: RoomView["status"]; paused: boolean; speed: OnlineSpeed;
  host: Presence; guest: Presence; snapshot: PackedMatch | null; snapshotSeq: number;
  commands: QueuedCommand[]; guestSeq: number; ack: number;
};
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const sequence = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function codeOf(value: unknown): string {
  if (typeof value !== "string" || !CODE.test(value)) throw new RoomError(400, "Oda numarası 6 rakamdan oluşmalıdır.");
  return value;
}
function requireRoom(value: RoomRecord | null): RoomRecord {
  if (!value) throw new RoomError(404, "Oda bulunamadı veya süresi doldu. Yeni bir oda oluşturun.");
  if (value.protocol !== 1) throw new RoomError(503, "Bu oda sürümü artık desteklenmiyor. Yeni bir oda oluşturun.");
  return value;
}
function roleOf(room: RoomRecord, token: string): OnlineRole {
  if (typeof token !== "string" || !TOKEN.test(token)) throw new RoomError(401, "Oda oturumunuz geçersiz. Odaya tekrar bağlanın.");
  const hash = Buffer.from(tokenHash(token), "hex");
  if (timingSafeEqual(hash, Buffer.from(room.hostHash, "hex"))) return "host";
  if (room.guestHash && timingSafeEqual(hash, Buffer.from(room.guestHash, "hex"))) return "guest";
  throw new RoomError(401, "Bu odaya erişim yetkiniz yok.");
}
function normalizeStoredSnapshot(room: RoomRecord): boolean {
  if (!room.snapshot || (room.snapshot as { version?: unknown }).version === 6) return false;
  // This upgrade is for an authenticated, already-stored room only. New host
  // payloads retain strict v6 validation and cannot use the legacy decoder.
  const snapshot = unpackStoredMatch(room.snapshot);
  if (!snapshot || snapshot.map !== room.map || snapshot.tutorial !== null)
    throw new RoomError(409, "Bu odanın eski kaydı okunamadı. Lütfen yeni bir oda oluşturun.");
  room.snapshot = packMatch(snapshot);
  room.snapshotSeq++; room.controlVersion++; room.revision++;
  room.paused = true;
  return true;
}
const present = (state: Presence, now: number) => state.present && now - state.seen <= HEARTBEAT;
function touch(room: RoomRecord, role: OnlineRole, visible: boolean, now: number): void {
  const current = room[role];
  // Visibility keepalives can overtake a slower regular sync. A CAS retry must
  // not let that older heartbeat make a hidden participant look available.
  if (now < current.seen || (now === current.seen && !current.present && visible)) return;
  room[role] = { present: visible, seen: now };
}
function view(room: RoomRecord, role: OnlineRole, now: number): RoomView {
  return {
    code: room.code, role, team: role === "host" ? 1 : 2, map: room.map,
    status: room.status, revision: room.revision, controlVersion: room.controlVersion,
    paused: room.paused, speed: room.speed,
    hostPresent: present(room.host, now), guestPresent: Boolean(room.guestHash && present(room.guest, now)),
    guestJoined: Boolean(room.guestHash), snapshot: room.snapshot, snapshotSeq: room.snapshotSeq,
    commands: role === "host" ? room.commands : [], guestSeq: room.guestSeq, ack: room.ack,
    expiresAt: room.expiresAt,
  };
}
function pauseDisconnected(room: RoomRecord, now: number): boolean {
  if (room.status !== "playing" || room.paused || (present(room.host, now) && room.guestHash && present(room.guest, now))) return false;
  room.paused = true; room.controlVersion++; room.revision++;
  return true;
}

export async function createRoom(map: unknown): Promise<RoomAccess> {
  if (typeof map !== "string" || !(mapIds as readonly string[]).includes(map)) throw new RoomError(400, "Geçerli bir harita seçin.");
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = String(randomInt(100000, 1000000)), token = newToken(), now = Date.now();
    const record: RoomRecord = {
      protocol: 1, code, map: map as MapId, hostHash: tokenHash(token), guestHash: null,
      createdAt: now, expiresAt: now + LIFETIME, revision: 1, controlVersion: 1,
      status: "waiting", paused: true, speed: 1,
      host: { present: true, seen: now }, guest: { present: false, seen: 0 },
      snapshot: null, snapshotSeq: 0, commands: [], guestSeq: 0, ack: 0,
    };
    const result = await transactRoom<RoomRecord, RoomAccess | null>(code, current => current
      ? { result: null } : { record, result: { room: view(record, "host", now), token } });
    if (result) return result;
  }
  throw new RoomError(503, "Oda oluşturulamadı. Birazdan tekrar deneyin.");
}

export async function joinRoom(input: unknown): Promise<RoomAccess> {
  const code = codeOf(input), token = newToken(), now = Date.now();
  return transactRoom<RoomRecord, RoomAccess>(code, current => {
    const room = requireRoom(current);
    if (room.guestHash || room.status !== "waiting") throw new RoomError(409, "Bu oda dolu veya oyun başladı.");
    room.guestHash = tokenHash(token); room.guest = { present: true, seen: now }; room.revision++;
    return { record: room, result: { room: view(room, "guest", now), token } };
  });
}

export async function getRoom(input: unknown, token: string): Promise<RoomView> {
  const code = codeOf(input), now = Date.now();
  return transactRoom<RoomRecord, RoomView>(code, current => {
    const room = requireRoom(current), role = roleOf(room, token);
    const migrated = normalizeStoredSnapshot(room);
    const changed = pauseDisconnected(room, now) || migrated;
    return { ...(changed ? { record: room } : {}), result: view(room, role, now) };
  });
}

function cleanCommand(command: GameCommand): GameCommand {
  if (command.kind === "move") return { kind: "move", ids: [...command.ids], point: { x: command.point.x, y: command.point.y } };
  if (command.kind === "stance") return { kind: "stance", ids: [...command.ids], stance: command.stance };
  if (command.kind === "build") return { kind: "build", city: command.city, unit: command.unit };
  if (command.kind === "rally") return { kind: "rally", city: command.city, point: command.point && { x: command.point.x, y: command.point.y } };
  const order = command.order;
  return { kind: "order", ids: [...command.ids], order: order.mode === "move" ? { mode: "move", point: { x: order.point.x, y: order.point.y } }
    : order.mode === "route" ? { mode: "route", points: order.points.map(point => ({ x: point.x, y: point.y })), next: order.next }
      : order.mode === "attack" ? { mode: "attack", target: order.target } : { mode: "hold" } };
}

function ownCommand(match: Match, command: GameCommand): void {
  // Missing soldiers/targets can result from a legitimate stale snapshot. Their
  // sequence is acknowledged and application becomes a no-op, not a retry loop.
  if ("ids" in command) {
    if (command.ids.some(id => match.units.some(unit => unit.id === id && unit.team !== 2)))
      throw new RoomError(403, "Yalnızca kendi askerlerine emir verebilirsin.");
    if (command.kind === "order" && command.order.mode === "attack") {
      const target = command.order.target;
      if (match.units.some(unit => unit.id === target && unit.team === 2)) throw new RoomError(400, "Saldırı hedefi bir rakip olmalıdır.");
    }
  } else {
    const city = match.cities.find(city => city.id === command.city);
    if (city && city.owner !== 2) throw new RoomError(403, "Yalnızca kendi şehrine emir verebilirsin.");
  }
}

function queueGuest(room: RoomRecord, commands: unknown): void {
  if (!Array.isArray(commands) || commands.length > MAX_BATCH) throw new RoomError(400, "Bir istekte en fazla 32 emir gönderilebilir.");
  const match = room.snapshot && unpackMatch(room.snapshot);
  if (!match) throw new RoomError(409, "Maç henüz başlamadı.");
  const accepted: QueuedCommand[] = [];
  let next = room.guestSeq, previous = 0;
  for (const value of commands) {
    if (!object(value) || !sequence(value.seq) || value.seq < 1 || value.seq <= previous) throw new RoomError(400, "Emir sırası geçersiz.");
    previous = value.seq;
    if (value.seq <= room.guestSeq) continue;
    if (value.seq !== next + 1) throw new RoomError(409, "Emir sırası güncel değil. Oda durumunu yenileyin.");
    if (!isGameCommand(value.command)) throw new RoomError(400, "Geçersiz oyun emri.");
    ownCommand(match, value.command);
    accepted.push({ seq: value.seq, command: cleanCommand(value.command) }); next = value.seq;
  }
  if (room.commands.length + accepted.length > MAX_QUEUE) throw new RoomError(429, "Emir kuyruğu dolu. Bağlantının güncellenmesini bekleyin.");
  room.commands.push(...accepted); room.guestSeq = next;
}

function acceptSnapshot(room: RoomRecord, body: Record<string, unknown>): void {
  if (!sequence(body.snapshotSeq) || body.snapshotSeq < 1 || !sequence(body.controlVersion) ||
      (body.ack !== undefined && (!sequence(body.ack) || body.ack > room.guestSeq))) throw new RoomError(400, "Oyun durumunun sıra bilgisi geçersiz.");
  // An obsolete upload must never undo a server-side pause or discard inputs.
  // Return current controls instead, allowing the host to restore the last state.
  if (body.controlVersion !== room.controlVersion || body.snapshotSeq <= room.snapshotSeq || room.status !== "playing") return;
  if (object(body.snapshot) && body.snapshot.version === 5)
    throw new RoomError(409, "Oyun güncellendi; iki oyuncu da sayfayı yenilesin.");
  const snapshot = unpackMatch(body.snapshot), previous = room.snapshot && unpackMatch(room.snapshot);
  if (!snapshot || !previous || snapshot.id !== previous.id || snapshot.map !== room.map || snapshot.tutorial !== null ||
      snapshot.elapsed < previous.elapsed) throw new RoomError(400, "Geçersiz maç durumu.");
  // A paused world does not continue advancing through a matching-version upload.
  if (room.paused && snapshot.elapsed > previous.elapsed + 1e-6) return;
  room.snapshot = packMatch(snapshot); room.snapshotSeq = body.snapshotSeq;
  if (body.ack !== undefined) {
    room.ack = Math.max(room.ack, body.ack as number);
    room.commands = room.commands.filter(command => command.seq > room.ack);
  }
  if (snapshot.result) {
    room.status = "finished"; room.paused = true; room.controlVersion++;
    room.commands = []; room.ack = room.guestSeq;
  }
}

function finishByDeparture(room: RoomRecord, role: OnlineRole): void {
  const snapshot = room.snapshot && unpackMatch(room.snapshot);
  if (snapshot) {
    snapshot.result = role === "host" ? "lost" : "won";
    room.snapshot = packMatch(snapshot); room.snapshotSeq++;
  }
  room.status = "finished"; room.paused = true; room.controlVersion++;
  room.commands = []; room.ack = room.guestSeq;
}

export async function actInRoom(input: unknown, token: string, body: unknown): Promise<RoomView> {
  const code = codeOf(input), now = Date.now();
  if (!object(body) || typeof body.action !== "string") throw new RoomError(400, "Geçersiz oda işlemi.");
  return transactRoom<RoomRecord, RoomView>(code, current => {
    const room = requireRoom(current), role = roleOf(room, token);
    normalizeStoredSnapshot(room);
    pauseDisconnected(room, now);
    const host = role === "host";
    if (body.action === "sync") {
      if (typeof body.present !== "boolean") throw new RoomError(400, "Bağlantı durumu eksik.");
      touch(room, role, body.present, now);
      pauseDisconnected(room, now);
      if (!host && (body.snapshot !== undefined || body.snapshotSeq !== undefined || body.ack !== undefined || body.controlVersion !== undefined))
        throw new RoomError(403, "Maç durumunu yalnızca oda sahibi yayımlayabilir.");
      if (host && body.commands !== undefined && (!Array.isArray(body.commands) || body.commands.length))
        throw new RoomError(403, "Oda sahibi misafir adına emir gönderemez.");
      if (body.snapshot === undefined && (body.snapshotSeq !== undefined || body.ack !== undefined))
        throw new RoomError(400, "Onay sırası için maç durumu gereklidir.");
      if (room.status === "playing") {
        if (!host && body.commands !== undefined) queueGuest(room, body.commands);
        if (host && body.snapshot !== undefined) acceptSnapshot(room, body);
      }
    } else if (body.action === "leave" || body.action === "resign") {
      touch(room, role, false, now);
      if (room.status === "playing" || (room.status === "waiting" && host)) finishByDeparture(room, role);
      else if (room.status === "waiting") {
        room.guestHash = null; room.guestSeq = 0; room.ack = 0; room.commands = [];
      }
    } else if (body.action === "start") {
      if (!host) throw new RoomError(403, "Maçı yalnızca oda sahibi başlatabilir.");
      touch(room, "host", true, now);
      if (room.status === "finished") throw new RoomError(409, "Bu maç sona erdi.");
      if (room.status === "waiting") {
        if (!room.guestHash || !present(room.host, now) || !present(room.guest, now)) throw new RoomError(409, "Başlamak için iki oyuncunun da bağlı olması gerekiyor.");
        room.snapshot = packMatch(createMatch("normal", `online:${code}:${room.createdAt}`, false, room.map));
        room.snapshotSeq = 1; room.status = "playing"; room.paused = false; room.controlVersion++;
      }
    } else if (body.action === "pause") {
      if (!room.paused) { room.paused = true; room.controlVersion++; }
      touch(room, role, true, now);
    } else if (body.action === "resume") {
      if (!host) throw new RoomError(403, "Maça yalnızca oda sahibi devam edebilir.");
      touch(room, "host", true, now);
      if (room.status !== "playing" || !room.guestHash || !present(room.host, now) || !present(room.guest, now)) throw new RoomError(409, "Devam etmek için iki oyuncunun da bağlı olması gerekiyor.");
      if (room.paused) { room.paused = false; room.controlVersion++; }
    } else if (body.action === "speed") {
      if (!host) throw new RoomError(403, "Ortak oyun hızını yalnızca oda sahibi değiştirebilir.");
      if (typeof body.speed !== "number" || !speeds.includes(body.speed)) throw new RoomError(400, "Geçersiz oyun hızı.");
      if (room.status !== "finished" && room.speed !== body.speed) { room.speed = body.speed as OnlineSpeed; room.controlVersion++; }
      touch(room, "host", true, now);
    } else throw new RoomError(400, "Bilinmeyen oda işlemi.");
    room.revision++;
    return { record: room, result: view(room, role, now) };
  });
}

export function roomToken(request: Request): string {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw new RoomError(401, "Oda oturumunuz eksik. Odaya tekrar bağlanın.");
  return token;
}
export function checkRoomOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new RoomError(403, "Bu kaynaktan oda işlemi yapılamaz.");
  const origin = request.headers.get("origin");
  if (!origin) return;
  let host: string;
  try { host = new URL(origin).host; } catch { throw new RoomError(403, "Geçersiz istek kaynağı."); }
  if (host !== (request.headers.get("host") || new URL(request.url).host)) throw new RoomError(403, "Bu kaynaktan oda işlemi yapılamaz.");
}
export async function roomJson(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError(400, "İstek verisi eksik.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_ONLINE_BODY_BYTES) { await reader.cancel(); throw new RoomError(413, "İstek verisi çok büyük."); }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!object(value)) throw new Error("object required");
    return value;
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError(400, "Geçerli JSON verisi gönderin.");
  } finally { reader.releaseLock(); }
}
export async function roomResponse(action: () => Promise<unknown>, status = 200): Promise<NextResponse> {
  const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  try { return NextResponse.json(await action(), { status, headers }); }
  catch (error) {
    if (error instanceof RoomError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("Dot Front room operation failed");
    return NextResponse.json({ error: "Odaya erişilemiyor. Lütfen birazdan tekrar deneyin." }, { status: 500, headers });
  }
}
