import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  addPlayer,
  applyMessage,
  createRoom,
  removePlayer,
  setConnected,
  snapshot,
  tick,
  type Room,
} from "../../lib/color-hide/engine";
import {
  CHARACTERS,
  type CharacterId,
  type ClientMessage,
  type ServerMessage,
} from "../../lib/color-hide/types";

export type ServerOptions = {
  allowedOrigins: string[];
  now?: () => number;
  randomIndex?: (length: number) => number;
  autoTick?: boolean;
  maxRooms?: number;
  maxConnections?: number;
  handshakeMs?: number;
  idleRoomMs?: number;
};
type Session = {
  id: string;
  code: string;
  token: string;
  socket: WebSocket | null;
};
type Client = {
  session: Session | null;
  windowAt: number;
  frames: number;
  inputs: number;
  actions: number;
  violations: number;
  alive: boolean;
  deadline: ReturnType<typeof setTimeout>;
};
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GAME_MESSAGES = new Set([
  "ready",
  "vote",
  "character",
  "start",
  "input",
  "paint",
  "shoot",
  "reload",
  "rematch",
]);

/** One authoritative process owns its rooms. Do not horizontally scale without a room router. */
export function createColorHideServer(options: ServerOptions) {
  const now = options.now ?? Date.now;
  const allowedOrigins = new Set(
    options.allowedOrigins.map((value) => {
      const url = new URL(value);
      if (url.origin !== value || !["http:", "https:"].includes(url.protocol))
        throw new Error(
          "COLOR_HIDE_ALLOWED_ORIGINS must contain exact HTTP(S) origins.",
        );
      return value;
    }),
  );
  if (!allowedOrigins.size)
    throw new Error("At least one allowed browser origin is required.");
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>();
  const clients = new Map<WebSocket, Client>();
  const roomCreationRates = new Map<string, { at: number; count: number }>();
  let closed = false;
  let previousTick = now();
  let previousBroadcast = previousTick;
  let previousCleanup = previousTick;
  const http: HttpServer = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({ ok: true, game: "color-hide", protocol: 1 }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Color Hide gerçek zamanlı oyun sunucusu.");
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8192,
    perMessageDeflate: false,
  });
  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 1024 * 1024) {
      socket.terminate();
      return;
    }
    if (message.type === "snapshot" && socket.bufferedAmount > 128 * 1024)
      return;
    socket.send(JSON.stringify(message));
  };
  const error = (socket: WebSocket, message: string, code = "INVALID_ACTION") =>
    send(socket, { type: "error", message, code });
  const roomFor = (session: Session): Room => {
    const room = rooms.get(session.code);
    if (!room || !room.players[session.id])
      throw new Error(
        "Oda veya oyuncu oturumu sona erdi. Yeni bir odaya katıl.",
      );
    return room;
  };
  const broadcast = (room: Room) => {
    for (const session of sessions.values()) {
      if (
        session.code !== room.code ||
        !session.socket ||
        !room.players[session.id]
      )
        continue;
      send(session.socket, {
        type: "snapshot",
        room: snapshot(room, session.id, now()),
      });
    }
  };
  const forget = (session: Session, explicit = false) => {
    const room = rooms.get(session.code);
    if (room && room.players[session.id]) removePlayer(room, session.id, now());
    sessions.delete(session.token);
    const socket = session.socket;
    session.socket = null;
    if (socket) {
      const client = clients.get(socket);
      if (client?.session === session) client.session = null;
      if (explicit) send(socket, { type: "left" });
    }
    if (room) {
      if (!Object.keys(room.players).length) rooms.delete(room.code);
      else broadcast(room);
    }
  };
  const attach = (socket: WebSocket, client: Client, session: Session) => {
    if (session.socket && session.socket !== socket) {
      const previous = session.socket;
      const previousClient = clients.get(previous);
      if (previousClient) previousClient.session = null;
      error(
        previous,
        "Bu oyuncu başka bir sekmede yeniden bağlandı.",
        "SESSION_REPLACED",
      );
      previous.close(1008, "Session replaced");
    }
    session.socket = socket;
    client.session = session;
    clearTimeout(client.deadline);
    setConnected(roomFor(session), session.id, true, now());
    send(socket, {
      type: "welcome",
      code: session.code,
      playerId: session.id,
      token: session.token,
    });
    broadcast(roomFor(session));
  };
  http.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    if (
      closed ||
      !origin ||
      !allowedOrigins.has(origin) ||
      clients.size >= (options.maxConnections ?? 300) ||
      (request.url !== "/" && request.url !== "/color-hide")
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) =>
      wss.emit("connection", webSocket, request),
    );
  });
  wss.on("connection", (socket, request) => {
    const client: Client = {
      session: null,
      windowAt: now(),
      frames: 0,
      inputs: 0,
      actions: 0,
      violations: 0,
      alive: true,
      deadline: setTimeout(() => {
        if (!client.session) socket.close(1008, "Join timeout");
      }, options.handshakeMs ?? 15000),
    };
    client.deadline.unref();
    clients.set(socket, client);
    socket.on("pong", () => {
      client.alive = true;
    });
    socket.on("error", () => {
      /* Connection errors must not terminate the room process. */
    });
    socket.on("close", () => {
      clearTimeout(client.deadline);
      clients.delete(socket);
      const session = client.session;
      if (!session || session.socket !== socket) return;
      session.socket = null;
      const room = rooms.get(session.code);
      if (room?.players[session.id]) {
        setConnected(room, session.id, false, now());
        broadcast(room);
      }
    });
    socket.on("message", (raw, isBinary) => {
      try {
        if (now() - client.windowAt >= 1000) {
          client.windowAt = now();
          client.frames = 0;
          client.inputs = 0;
          client.actions = 0;
        }
        // Count every frame before parsing. Invalid JSON and binary frames must
        // not provide a cheaper bypass around the input/action rate budgets.
        if (++client.frames > 50) {
          if (++client.violations >= 5) socket.close(1008, "Rate limit");
          return;
        }
        if (isBinary) throw new Error("Yalnızca oyun mesajları kabul edilir.");
        const value: unknown = JSON.parse(raw.toString());
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !("type" in value) ||
          typeof value.type !== "string"
        )
          throw new Error("Geçersiz oyun mesajı.");
        const message = value as ClientMessage;
        const overLimit =
          message.type === "input"
            ? ++client.inputs > 35
            : ++client.actions > 15;
        if (overLimit) {
          if (++client.violations >= 5) socket.close(1008, "Rate limit");
          else
            error(
              socket,
              "Çok hızlı işlem gönderiliyor. Biraz bekle.",
              "RATE_LIMIT",
            );
          return;
        }
        if (message.type === "ping") {
          send(socket, { type: "pong", serverTime: now() });
          return;
        }
        if (message.type === "leave") {
          if (client.session) forget(client.session, true);
          else send(socket, { type: "left" });
          socket.close(1000, "Left room");
          return;
        }
        if (["create", "join", "resume"].includes(message.type)) {
          if (client.session) throw new Error("Önce bulunduğun odadan ayrıl.");
          if (message.type === "resume") {
            if (
              typeof message.code !== "string" ||
              typeof message.token !== "string" ||
              message.token.length > 128
            )
              throw new Error("Geçersiz oturum.");
            const session = sessions.get(message.token);
            const room = session && rooms.get(session.code);
            if (room) tick(room, now(), 0); // Enforce disconnect deadline before resuming.
            if (
              !session ||
              session.code !== message.code.toUpperCase() ||
              !room?.players[session.id]
            ) {
              error(
                socket,
                "Oturum sona erdi. Oda koduyla yeniden katıl.",
                "SESSION_EXPIRED",
              );
              return;
            }
            attach(socket, client, session);
            return;
          }
          const identity = message as { name?: unknown; character?: unknown };
          if (
            typeof identity.name !== "string" ||
            identity.name.trim().length < 1 ||
            identity.name.trim().length > 24 ||
            /[\u0000-\u001f\u007f]/.test(identity.name)
          )
            throw new Error("İsmin 1–24 harf uzunluğunda olmalı.");
          if (
            !CHARACTERS.some((character) => character.id === identity.character)
          )
            throw new Error("Bir karakter seç.");
          const player = {
            id: randomUUID(),
            name: identity.name.trim(),
            character: identity.character as CharacterId,
          };
          let room: Room;
          if (message.type === "create") {
            if (rooms.size >= (options.maxRooms ?? 100))
              throw new Error("Sunucu şu anda dolu. Birazdan tekrar dene.");
            const ip = request.socket.remoteAddress ?? "unknown";
            let budget = roomCreationRates.get(ip);
            if (!budget || now() - budget.at > 60000) {
              budget = { at: now(), count: 0 };
              roomCreationRates.set(ip, budget);
            }
            if (++budget.count > 12)
              throw new Error("Çok fazla oda açıldı. Bir dakika bekle.");
            let code: string;
            do {
              code = Array.from(
                { length: 6 },
                () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
              ).join("");
            } while (rooms.has(code));
            room = createRoom(code, player, now(), options.randomIndex);
            rooms.set(code, room);
          } else {
            if (
              message.type !== "join" ||
              typeof message.code !== "string" ||
              !/^[A-Z2-9]{6}$/.test(message.code.toUpperCase())
            )
              throw new Error("Altı karakterli oda kodunu kontrol et.");
            const existing = rooms.get(message.code.toUpperCase());
            if (!existing)
              throw new Error(
                "Oda bulunamadı. Kodu kontrol et veya yeni oda kur.",
              );
            room = existing;
            tick(room, now(), 0);
            addPlayer(room, player, now());
          }
          const session: Session = {
            code: room.code,
            id: player.id,
            token: randomBytes(32).toString("base64url"),
            socket: null,
          };
          sessions.set(session.token, session);
          attach(socket, client, session);
          return;
        }
        if (!client.session) throw new Error("Önce bir odaya katıl.");
        if (!GAME_MESSAGES.has(message.type))
          throw new Error("Geçersiz oyun işlemi.");
        const room = roomFor(client.session);
        tick(room, now(), 0);
        applyMessage(room, client.session.id, message, now());
        // Inputs are broadcast at the next authoritative tick, never trusted as positions.
        if (message.type !== "input") broadcast(room);
      } catch (caught) {
        const known =
          caught instanceof Error && !(caught instanceof SyntaxError)
            ? caught.message
            : "Geçersiz oyun mesajı.";
        error(socket, known.slice(0, 180));
      }
    });
  });
  const step = () => {
    if (closed) return;
    const time = now();
    const dt = Math.max(0, Math.min(0.1, (time - previousTick) / 1000));
    previousTick = time;
    for (const room of rooms.values()) {
      tick(room, time, dt);
      for (const session of sessions.values())
        if (session.code === room.code && !room.players[session.id])
          forget(session);
      if (
        !Object.keys(room.players).length ||
        time - room.lastActivityAt > (options.idleRoomMs ?? 30 * 60 * 1000)
      ) {
        for (const session of [...sessions.values()])
          if (session.code === room.code) {
            if (session.socket) {
              error(
                session.socket,
                "Oda uzun süre kullanılmadığı için kapandı.",
                "SESSION_EXPIRED",
              );
              session.socket.close(1000, "Room expired");
            }
            sessions.delete(session.token);
          }
        rooms.delete(room.code);
      }
    }
    if (time - previousBroadcast >= 100) {
      previousBroadcast = time;
      for (const room of rooms.values()) broadcast(room);
    }
    if (time - previousCleanup >= 60000) {
      previousCleanup = time;
      for (const [key, budget] of roomCreationRates)
        if (time - budget.at > 60000) roomCreationRates.delete(key);
    }
  };
  const ticker = options.autoTick === false ? null : setInterval(step, 50);
  ticker?.unref();
  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive) {
        socket.terminate();
        continue;
      }
      client.alive = false;
      socket.ping();
    }
  }, 10000);
  heartbeat.unref();
  return {
    step,
    listen: (port = 3001, host = "0.0.0.0") =>
      new Promise<number>((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, host, () => {
          http.removeListener("error", reject);
          resolve((http.address() as AddressInfo).port);
        });
      }),
    close: async () => {
      closed = true;
      if (ticker) clearInterval(ticker);
      clearInterval(heartbeat);
      for (const [socket, client] of clients) {
        clearTimeout(client.deadline);
        socket.terminate();
      }
      sessions.clear();
      rooms.clear();
      roomCreationRates.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
