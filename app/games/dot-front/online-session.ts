import { applyGameCommand, canApplyGameCommand, isGameCommand } from "./commands";
import type { GameCommand } from "./commands";
import type { Match } from "./engine";
import { packMatch, unpackMatch } from "./online-protocol";
import type { RoomAccess, RoomAction, RoomSession, RoomView, QueuedCommand } from "./online-types";
import { ONLINE_SESSION_KEY } from "./online-types";
import { mapIds } from "./terrain";
import type { MapId } from "./terrain";

const BASE = "/api/dot-front/rooms";
const REQUEST_TIMEOUT = 4000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
type ControlAction = Exclude<RoomAction, { action: "sync" }>;
export type OnlineCallbacks = {
  view(room: RoomView): void;
  status(value: "connected" | "reconnecting" | "closed", message?: string): void;
  replaceSnapshot?(match: Match): void;
};
export type OnlineController = {
  attach(match: Match): void;
  command(command: GameCommand): void;
  action(action: ControlAction): Promise<void>;
  dispose(): void;
};
/** Injectable clock and fetch keep retry/cleanup tests deterministic. */
export type OnlineEnvironment = {
  fetch: typeof fetch;
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  visible(): boolean;
  watchVisibility(callback: () => void): () => void;
  watchPageHide(callback: () => void): () => void;
};

class RelayError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function browserEnvironment(): OnlineEnvironment {
  return {
    fetch: (input, init) => fetch(input, init),
    setTimer: (callback, delay) => setTimeout(callback, delay), clearTimer: timer => clearTimeout(timer),
    visible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    watchVisibility: callback => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", callback);
      return () => document.removeEventListener("visibilitychange", callback);
    },
    watchPageHide: callback => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("pagehide", callback);
      return () => window.removeEventListener("pagehide", callback);
    },
  };
}
function validSession(value: unknown): value is RoomSession {
  const session = value as RoomSession;
  return Boolean(session && typeof session.code === "string" && /^[A-Z0-9]{4,12}$/.test(session.code) &&
    typeof session.token === "string" && session.token.length >= 16 && session.token.length <= 256 &&
    ((session.role === "host" && session.team === 1) || (session.role === "guest" && session.team === 2)));
}
export function restoreRoomSession(): RoomSession | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ONLINE_SESSION_KEY) ?? "null");
    if (validSession(value)) return value;
    clearRoomSession();
  } catch { /* Storage may be unavailable; online play still works in this tab. */ }
  return null;
}
export function clearRoomSession(): void {
  try { sessionStorage.removeItem(ONLINE_SESSION_KEY); } catch { /* Optional reload recovery only. */ }
}
function remember(session: RoomSession) {
  try { sessionStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify(session)); } catch { /* No bot-save fallback. */ }
}
async function jsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new RelayError("Oda yanıtı çok büyük.", 502);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new RelayError("Oda sunucusundan geçersiz yanıt geldi.", 502); }
  if (!response.ok) {
    const error = value as { error?: unknown };
    throw new RelayError(typeof error?.error === "string" ? error.error : "Oda bağlantısı kurulamadı.", response.status);
  }
  return value;
}
function validRoom(value: unknown, session?: RoomSession): value is RoomView {
  const room = value as RoomView;
  const integer = (number: unknown) => Number.isSafeInteger(number) && Number(number) >= 0;
  return Boolean(room && typeof room.code === "string" && (room.role === "host" || room.role === "guest") &&
    room.team === (room.role === "host" ? 1 : 2) && (mapIds as readonly string[]).includes(room.map) &&
    ["waiting", "playing", "finished"].includes(room.status) && integer(room.revision) && integer(room.controlVersion) &&
    integer(room.snapshotSeq) && integer(room.guestSeq) && integer(room.ack) && room.ack <= room.guestSeq &&
    typeof room.paused === "boolean" && [.5, 1, 2, 3].includes(room.speed) &&
    [room.hostPresent, room.guestPresent, room.guestJoined].every(value => typeof value === "boolean") &&
    Array.isArray(room.commands) && room.commands.length <= 256 && room.commands.every(command =>
      command && integer(command.seq) && command.seq > 0 && isGameCommand(command.command)) &&
    Number.isFinite(room.expiresAt) && (room.snapshot === null || typeof room.snapshot === "object") &&
    (!session || (room.code === session.code && room.role === session.role && room.team === session.team)));
}
async function access(path: string, body: unknown, signal?: AbortSignal): Promise<{ session: RoomSession; room: RoomView }> {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT);
  const cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) abort.abort();
  try {
    const data = await jsonResponse(await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", signal: abort.signal })) as RoomAccess;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!validRoom(data?.room)) throw new Error("Geçersiz oda bilgisi.");
    const session: RoomSession = { code: data.room.code, token: data.token, role: data.room.role, team: data.room.team };
    if (!validSession(session)) throw new Error("Geçersiz oda oturumu.");
    remember(session); return { session, room: data.room };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
export function createRoom(map: MapId, signal?: AbortSignal) { return access(BASE, { map }, signal); }
export function joinRoom(code: string, signal?: AbortSignal) { return access(`${BASE}/join`, { code: code.trim().toUpperCase() }, signal); }

/** One in-flight request, bounded retries and monotonic command/snapshot sequences.
 * Only the host mutates simulation. The guest submits intent and renders snapshots.
 */
export function connectRoom(session: RoomSession, callbacks: OnlineCallbacks, environment = browserEnvironment()): OnlineController {
  if (!validSession(session)) throw new Error("Geçersiz oda oturumu.");
  let disposed = false, closed = false, running = false, failures = 0, urgent = false;
  let timer: ReturnType<typeof setTimeout> | undefined, abort: AbortController | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let room: RoomView | null = null, match: Match | null = null, guestApplied = 0, nextGuestSeq = 0, displayedSeq = -1;
  let retryUpload: Extract<RoomAction, { action: "sync" }> | undefined;
  let outbox: QueuedCommand[] = [];
  const actions: { value: ControlAction; resolve(): void; reject(reason: unknown): void }[] = [];
  const url = `${BASE}/${encodeURIComponent(session.code)}`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` };
  const report = (status: "connected" | "reconnecting" | "closed", message?: string) => {
    if (!disposed) callbacks.status(status, message);
  };
  const restore = (snapshot: Match) => {
    if (session.role === "host" && match) Object.assign(match, snapshot);
    callbacks.replaceSnapshot?.(snapshot);
  };
  const applyGuest = () => {
    if (session.role !== "host" || !match || !room || room.paused || room.status !== "playing") return;
    for (const queued of [...room.commands].sort((a, b) => a.seq - b.seq)) {
      if (queued.seq <= guestApplied) continue;
      if (queued.seq !== guestApplied + 1) break;
      applyGameCommand(match, 2, queued.command); // Stale/dead targets are acknowledged no-ops.
      guestApplied = queued.seq;
    }
  };
  const receive = (next: RoomView, sent?: Extract<RoomAction, { action: "sync" }>) => {
    const prior = room;
    // Responses are serialized, but an action can advance control while a host upload is in flight.
    const rejectedUpload = session.role === "host" && sent?.snapshotSeq !== undefined && next.snapshotSeq !== sent.snapshotSeq;
    const changedControl = Boolean(prior && next.controlVersion !== prior.controlVersion);
    const recovered = session.role === "host" && failures > 0;
    const initial = !prior;
    let decoded: Match | null = null;
    const needsSnapshot = next.snapshot && (session.role === "guest" ? next.snapshotSeq > displayedSeq : initial || rejectedUpload || changedControl || recovered);
    if (needsSnapshot) {
      decoded = unpackMatch(next.snapshot);
      if (!decoded || decoded.map !== next.map) throw new RelayError("Oyun kaydı doğrulanamadı.", 502);
    }
    room = next;
    nextGuestSeq = Math.max(nextGuestSeq, next.guestSeq);
    const previousPending = outbox.length;
    outbox = outbox.filter(command => command.seq > next.guestSeq);
    if (outbox.length && outbox.length < previousPending) urgent = true;
    if (initial || rejectedUpload || changedControl || recovered) guestApplied = next.ack;
    retryUpload = undefined;
    // Pause/control is delivered before replacing or applying a state snapshot.
    callbacks.view(next);
    if (decoded) { restore(decoded); displayedSeq = next.snapshotSeq; }
    applyGuest();
    failures = 0;
    if (next.status === "finished") {
      closed = true; clearRoomSession(); report("closed");
      for (const action of actions.splice(0)) action.reject(new Error("Maç sona erdi."));
    } else report("connected");
  };
  const schedule = (delay: number) => {
    if (disposed || closed) return;
    if (timer !== undefined) environment.clearTimer(timer);
    timer = environment.setTimer(() => { timer = undefined; void pump(); }, delay);
  };
  const request = async (body: RoomAction) => {
    abort = new AbortController();
    requestTimer = environment.setTimer(() => abort?.abort(), REQUEST_TIMEOUT);
    try {
      const response = await environment.fetch(url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store", signal: abort.signal });
      const data = await jsonResponse(response) as { room?: unknown };
      if (!validRoom(data?.room, session)) throw new RelayError("Geçersiz oda durumu.", 502);
      return data.room;
    } finally {
      if (requestTimer !== undefined) environment.clearTimer(requestTimer);
      requestTimer = undefined; abort = undefined;
    }
  };
  const sync = (): Extract<RoomAction, { action: "sync" }> => {
    const body: Extract<RoomAction, { action: "sync" }> = { action: "sync", present: environment.visible() };
    // A lost response may have committed this exact upload. Reuse it until the
    // server replies instead of silently changing the payload under the same seq.
    if (retryUpload && body.present) return retryUpload;
    if (session.role === "guest") {
      if (outbox.length) body.commands = outbox.slice(0, 32).map(entry => ({ seq: entry.seq, command: structuredClone(entry.command) }));
    } else if (match && room?.status === "playing" && !room.paused && body.present) {
      body.snapshot = packMatch(match); body.snapshotSeq = room.snapshotSeq + 1;
      body.ack = guestApplied; body.controlVersion = room.controlVersion;
    }
    return body;
  };
  async function pump() {
    if (disposed || closed || running) return;
    running = true; urgent = false;
    const action = actions.shift(), started = Date.now();
    let body: RoomAction | undefined;
    try {
      body = action?.value ?? sync();
      if (session.role === "host" && body.action === "sync" && body.snapshot) retryUpload = body;
      const next = await request(body);
      if (!disposed) receive(next, body.action === "sync" ? body : undefined);
      action?.resolve();
    } catch (error) {
      action?.reject(error);
      if (!disposed) {
        if (error instanceof RelayError && error.status < 500) retryUpload = undefined;
        if (session.role === "guest" && body?.action === "sync" && body.commands?.length &&
          error instanceof RelayError && [400, 403, 409].includes(error.status)) {
          // Ownership can change between guest selection and server receipt.
          // Reset the rejected intent chain; a heartbeat refreshes the server sequence
          // before command() is enabled again, preventing permanent poisoned retries.
          outbox = []; nextGuestSeq = room?.guestSeq ?? 0;
        }
        failures++;
        if (error instanceof RelayError && [401, 404, 410].includes(error.status)) {
          closed = true; clearRoomSession(); report("closed", error.message);
        } else report("reconnecting", error instanceof Error ? error.message : "Bağlantı kesildi; oyun duraklatıldı.");
      }
    } finally {
      running = false;
      const cadence = room?.status === "waiting" ? 1000 : 500;
      if (!disposed && !closed) schedule(actions.length || urgent ? 0 : failures ? Math.min(8000, 500 * 2 ** Math.min(failures, 4)) : Math.max(0, cadence - (Date.now() - started)));
    }
  }
  const wake = () => {
    urgent = true;
    if (!running) schedule(0);
  };
  const presenceOff = () => {
    if (disposed || closed) return;
    // This small keepalive never carries simulation state or acknowledges commands.
    void environment.fetch(url, { method: "POST", headers, body: JSON.stringify({ action: "sync", present: false }),
      keepalive: true, cache: "no-store" }).catch(() => {});
  };
  const removeVisibility = environment.watchVisibility(() => {
    if (!environment.visible()) { report("reconnecting", "Sekme gizlendi; oyun duraklatıldı."); presenceOff(); }
    wake();
  });
  const removePageHide = environment.watchPageHide(presenceOff);
  schedule(0);
  return {
    attach(value) { match = value; applyGuest(); },
    command(command) {
      if (disposed || closed || failures || !room || room.status !== "playing" || room.paused || !match ||
        !environment.visible() || !isGameCommand(command) || !canApplyGameCommand(match, session.team, command)) return;
      if (session.role === "host") applyGameCommand(match, 1, command);
      else {
        if (outbox.length >= 64) { report("reconnecting", "Komutlar gönderilmeyi bekliyor."); return; }
        outbox.push({ seq: ++nextGuestSeq, command: structuredClone(command) });
      }
      wake();
    },
    action(value) {
      if (disposed || closed) return Promise.reject(new Error("Oda bağlantısı kapalı."));
      if (session.role === "guest" && ["start", "resume", "speed"].includes(value.action)) return Promise.reject(new Error("Bu kontrol oda sahibine ait."));
      return new Promise<void>((resolve, reject) => { actions.push({ value, resolve, reject }); wake(); });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) environment.clearTimer(timer);
      if (requestTimer !== undefined) environment.clearTimer(requestTimer);
      abort?.abort(); removeVisibility(); removePageHide();
      for (const action of actions.splice(0)) action.reject(new Error("Oda bağlantısı kapalı."));
      outbox = []; match = null;
    },
  };
}
