import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { Chess, type Square } from "chess.js";
import { NextResponse } from "next/server";
import { readStoredRoom, transactRoom, RoomError } from "./chess-room-store";
export { RoomError } from "./chess-room-store";

export type RoomResult = {
  winner: "w" | "b" | null;
  reason:
    | "checkmate"
    | "stalemate"
    | "threefold"
    | "insufficient-material"
    | "fifty-move"
    | "draw"
    | "resignation"
    | "cancelled";
};

export type RoomView = {
  code: string;
  status: "waiting" | "playing" | "finished";
  fen: string;
  moves: string[];
  color: "w" | "b";
  colorsDrawn: boolean;
  colorDraw: { yourRoll: number; opponentRoll: number } | null;
  turn: "w" | "b";
  result: RoomResult | null;
  lastMove: {
    from: string;
    to: string;
    san: string;
    promotion?: string;
  } | null;
  version: number;
  createdAt: number;
  expiresAt: number;
};

type RoomRecord = {
  code: string;
  hostHash: string;
  guestHash: string | null;
  /** Missing colors are kept only for legacy games that already started. */
  hostColor?: "w" | "b" | null;
  colorDraw?: { host: number; guest: number };
  moves: string[];
  result: RoomResult | null;
  version: number;
  createdAt: number;
  expiresAt: number;
};

const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[1-9][0-9]{5}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SQUARE_PATTERN = /^[a-h][1-8]$/;
function validateCode(code: unknown): asserts code is string {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) {
    throw new RoomError(400, "Oda numarası 6 rakamdan oluşmalıdır.");
  }
}

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/** Ties are rerolled; neither player controls the server's cryptographic dice. */
export function drawRoomDice(rollDie: () => number = () => randomInt(1, 7)): {
  host: number;
  guest: number;
} {
  let host: number;
  let guest: number;
  do {
    host = rollDie();
    guest = rollDie();
  } while (host === guest);
  return { host, guest };
}

function playerColor(room: RoomRecord, token: string): "w" | "b" {
  if (!TOKEN_PATTERN.test(token))
    throw new RoomError(401, "Oda oturumunuz geçersiz. Odaya tekrar bağlanın.");
  const hash = Buffer.from(hashToken(token), "hex");
  const hostColor = room.hostColor ?? "w";
  if (timingSafeEqual(hash, Buffer.from(room.hostHash, "hex")))
    return hostColor;
  if (
    room.guestHash &&
    timingSafeEqual(hash, Buffer.from(room.guestHash, "hex"))
  )
    return hostColor === "w" ? "b" : "w";
  throw new RoomError(401, "Bu odaya erişim yetkiniz yok.");
}

function boardFor(room: RoomRecord): Chess {
  const board = new Chess();
  for (const move of room.moves) board.move(move);
  return board;
}

function viewFor(
  room: RoomRecord,
  color: "w" | "b",
  board = boardFor(room),
): RoomView {
  const last = board.history({ verbose: true }).at(-1);
  return {
    code: room.code,
    status: room.result ? "finished" : room.guestHash ? "playing" : "waiting",
    fen: board.fen(),
    moves: [...room.moves],
    color,
    colorsDrawn: Boolean(room.guestHash),
    colorDraw: room.colorDraw
      ? {
          yourRoll:
            color === room.hostColor
              ? room.colorDraw.host
              : room.colorDraw.guest,
          opponentRoll:
            color === room.hostColor
              ? room.colorDraw.guest
              : room.colorDraw.host,
        }
      : null,
    turn: board.turn(),
    result: room.result,
    lastMove: last
      ? {
          from: last.from,
          to: last.to,
          san: last.san,
          ...(last.promotion ? { promotion: last.promotion } : {}),
        }
      : null,
    version: room.version,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
  };
}

function resultFor(board: Chess): RoomResult | null {
  if (board.isCheckmate())
    return { winner: board.turn() === "w" ? "b" : "w", reason: "checkmate" };
  if (board.isStalemate()) return { winner: null, reason: "stalemate" };
  if (board.isThreefoldRepetition())
    return { winner: null, reason: "threefold" };
  if (board.isInsufficientMaterial())
    return { winner: null, reason: "insufficient-material" };
  if (board.isDrawByFiftyMoves()) return { winner: null, reason: "fifty-move" };
  if (board.isDraw()) return { winner: null, reason: "draw" };
  return null;
}

function requireRoom(room: RoomRecord | null): RoomRecord {
  if (!room)
    throw new RoomError(
      404,
      "Oda bulunamadı veya süresi doldu. Yeni bir oda oluşturun.",
    );
  return room;
}

export async function createRoom(): Promise<{ room: RoomView; token: string }> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = String(randomInt(100000, 1000000));
    const token = newToken();
    const now = Date.now();
    const record: RoomRecord = {
      code,
      hostHash: hashToken(token),
      guestHash: null,
      hostColor: null,
      moves: [],
      result: null,
      version: 1,
      createdAt: now,
      expiresAt: now + ROOM_LIFETIME_MS,
    };
    const created = await transactRoom<
      RoomRecord,
      { room: RoomView; token: string } | null
    >(code, (existing) => {
      if (existing) return { result: null };
      return { record, result: { room: viewFor(record, "w"), token } };
    });
    if (created) return created;
  }
  throw new RoomError(503, "Oda oluşturulamadı. Birazdan tekrar deneyin.");
}

export async function joinRoom(
  code: unknown,
  drawDice: () => { host: number; guest: number } = drawRoomDice,
): Promise<{ room: RoomView; token: string }> {
  validateCode(code);
  const token = newToken();
  return transactRoom<RoomRecord, { room: RoomView; token: string }>(
    code,
    (current) => {
      const room = requireRoom(current);
      if (room.guestHash || room.result)
        throw new RoomError(409, "Bu oda dolu veya oyun sona erdi.");
      // An accepted join starts a game, including a legacy waiting room.
      // Store the actual dice with the assignment in the same transaction.
      const dice = drawDice();
      room.colorDraw = dice;
      room.hostColor = dice.host > dice.guest ? "w" : "b";
      room.guestHash = hashToken(token);
      room.version++;
      const guestColor = room.hostColor === "w" ? "b" : "w";
      return {
        record: room,
        result: { room: viewFor(room, guestColor), token },
      };
    },
  );
}

export async function getRoom(code: string, token: string): Promise<RoomView> {
  validateCode(code);
  const room = requireRoom(await readStoredRoom<RoomRecord>(code));
  return viewFor(room, playerColor(room, token));
}

export async function moveInRoom(
  code: string,
  token: string,
  input: Record<string, unknown>,
): Promise<RoomView> {
  validateCode(code);
  if (
    typeof input.from !== "string" ||
    !SQUARE_PATTERN.test(input.from) ||
    typeof input.to !== "string" ||
    !SQUARE_PATTERN.test(input.to)
  ) {
    throw new RoomError(400, "Geçerli başlangıç ve hedef karelerini seçin.");
  }
  if (
    input.promotion !== undefined &&
    (typeof input.promotion !== "string" || !/^[qrbn]$/.test(input.promotion))
  ) {
    throw new RoomError(400, "Geçersiz terfi taşı.");
  }
  if (
    input.expectedVersion !== undefined &&
    (!Number.isSafeInteger(input.expectedVersion) ||
      (input.expectedVersion as number) < 1)
  ) {
    throw new RoomError(400, "Geçersiz oyun sürümü.");
  }
  return transactRoom<RoomRecord, RoomView>(code, (current) => {
    const room = requireRoom(current);
    const color = playerColor(room, token);
    if (room.result) throw new RoomError(409, "Bu oyun sona erdi.");
    if (!room.guestHash)
      throw new RoomError(409, "Arkadaşınızın odaya katılması bekleniyor.");
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== room.version
    )
      throw new RoomError(
        409,
        "Tahta güncellendi. Yeni konumu bekleyip tekrar oynayın.",
      );
    const board = boardFor(room);
    if (board.turn() !== color)
      throw new RoomError(409, "Hamle sırası rakibinizde.");
    try {
      board.move({
        from: input.from as Square,
        to: input.to as Square,
        ...(input.promotion ? { promotion: input.promotion as string } : {}),
      });
    } catch {
      throw new RoomError(400, "Bu hamle satranç kurallarına uygun değil.");
    }
    room.moves = board.history();
    room.result = resultFor(board);
    room.version++;
    return { record: room, result: viewFor(room, color, board) };
  });
}

export async function resignRoom(
  code: string,
  token: string,
): Promise<RoomView> {
  validateCode(code);
  return transactRoom<RoomRecord, RoomView>(code, (current) => {
    const room = requireRoom(current);
    const color = playerColor(room, token);
    if (room.result) return { result: viewFor(room, color) };
    room.result = room.guestHash
      ? { winner: color === "w" ? "b" : "w", reason: "resignation" }
      : { winner: null, reason: "cancelled" };
    room.version++;
    return { record: room, result: viewFor(room, color) };
  });
}

export function roomToken(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match)
    throw new RoomError(401, "Oda oturumunuz eksik. Odaya tekrar bağlanın.");
  return match[1];
}

export function checkRoomOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new RoomError(403, "Bu kaynaktan oda işlemi yapılamaz.");
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new RoomError(403, "Geçersiz istek kaynağı.");
  }
  if (originHost !== (request.headers.get("host") || new URL(request.url).host))
    throw new RoomError(403, "Bu kaynaktan oda işlemi yapılamaz.");
}

export async function roomJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError(400, "İstek verisi eksik.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) {
        await reader.cancel();
        throw new RoomError(413, "İstek verisi çok büyük.");
      }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("object required");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError(400, "Geçerli JSON verisi gönderin.");
  } finally {
    reader.releaseLock();
  }
}

export async function roomResponse(
  action: () => Promise<unknown>,
  status = 200,
): Promise<NextResponse> {
  const headers = {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    return NextResponse.json(await action(), { status, headers });
  } catch (error) {
    if (error instanceof RoomError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers },
      );
    console.error(
      "Chess room storage operation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Odaya erişilemiyor. Lütfen birazdan tekrar deneyin." },
      { status: 500, headers },
    );
  }
}
