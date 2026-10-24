import { randomInt } from "node:crypto";
import { getMap } from "./maps";
import { CHARACTERS, DEFAULT_PAINT, MAP_IDS, RULES } from "./types";
import type {
  CharacterId,
  ClientMessage,
  GameEvent,
  InputState,
  MapDefinition,
  MapId,
  MapObject,
  Paint,
  Phase,
  PlayerView,
  RoomView,
  Team,
  Vec3,
} from "./types";

export interface Player extends Omit<PlayerView, "position"> {
  position: Vec3;
  input: InputState;
  lastInputAt: number;
  disconnectedAt: number | null;
  velocityY: number;
  jumpQueued: boolean;
  lastShotAt: number;
  caughtAt: number | null;
}
export interface Room {
  code: string;
  hostId: string;
  players: Record<string, Player>;
  phase: Phase;
  map: MapId;
  round: number;
  phaseEndsAt: number;
  initialSeekerId: string | null;
  winner: Team | null;
  finishReason: string | null;
  survivors: string[];
  events: GameEvent[];
  nextEventId: number;
  hidingStartedAt: number;
  lastActivityAt: number;
  randomIndex: (length: number) => number;
}
type NewPlayer = { id: string; name: string; character: CharacterId };
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const emptyInput = (): InputState => ({
  seq: 0,
  forward: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  sprint: false,
  crouch: false,
  jump: false,
});
function assert(condition: unknown, text: string): asserts condition {
  if (!condition) throw new Error(text);
}
function choose(room: Room, length: number) {
  const n = room.randomIndex(length);
  assert(
    Number.isSafeInteger(n) && n >= 0 && n < length,
    "Kura tamamlanamadı.",
  );
  return n;
}
function character(value: unknown): value is CharacterId {
  return CHARACTERS.some((c) => c.id === value);
}
function participant(data: NewPlayer, now: number, spawn: Vec3): Player {
  assert(
    data &&
      typeof data.id === "string" &&
      data.id.length > 0 &&
      data.id.length <= 80,
    "Oyuncu kimliği geçersiz.",
  );
  assert(typeof data.name === "string", "Oyuncu adını yaz.");
  const name = data.name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  assert(
    name.length > 0 && name.length <= 24,
    "Oyuncu adı 1–24 karakter olmalı.",
  );
  assert(character(data.character), "Bir karakter seç.");
  return {
    id: data.id,
    name,
    character: data.character,
    paint: { ...DEFAULT_PAINT },
    team: "hider",
    connected: true,
    ready: false,
    vote: "forest",
    position: { ...spawn },
    yaw: 0,
    pitch: 0,
    crouching: false,
    moving: false,
    ammo: RULES.magazine,
    reloadEndsAt: 0,
    captures: 0,
    survivedMs: 0,
    lastInputSeq: 0,
    input: emptyInput(),
    lastInputAt: now,
    disconnectedAt: null,
    velocityY: 0,
    jumpQueued: false,
    lastShotAt: -Infinity,
    caughtAt: null,
  };
}
function event(room: Room, data: Omit<GameEvent, "id">) {
  room.events.push({ ...data, id: room.nextEventId++ });
  if (room.events.length > 64) room.events.splice(0, room.events.length - 64);
}
function phase(room: Room, value: Phase, endsAt: number, now: number) {
  room.phase = value;
  room.phaseEndsAt = endsAt;
  for (const p of Object.values(room.players)) {
    p.input = {
      ...emptyInput(),
      seq: p.lastInputSeq,
      yaw: p.yaw,
      pitch: p.pitch,
    };
    p.moving = false;
    p.jumpQueued = false;
  }
  event(room, { type: "phase", at: now });
}
export function createRoom(
  code: string,
  host: NewPlayer,
  now: number,
  randomIndex: (length: number) => number = randomInt,
): Room {
  const room: Room = {
    code,
    hostId: host.id,
    players: Object.create(null) as Record<string, Player>,
    phase: "lobby",
    map: "forest",
    round: 0,
    phaseEndsAt: 0,
    initialSeekerId: null,
    winner: null,
    finishReason: null,
    survivors: [],
    events: [],
    nextEventId: 1,
    hidingStartedAt: 0,
    lastActivityAt: now,
    randomIndex,
  };
  addPlayer(room, host, now);
  return room;
}
export function addPlayer(room: Room, data: NewPlayer, now: number) {
  assert(room.phase === "lobby", "Tur başladı. Sonraki turu bekle.");
  assert(!Object.hasOwn(room.players, data.id), "Oyuncu zaten odada.");
  const list = Object.values(room.players);
  assert(
    list.length < RULES.maxPlayers,
    "Oda dolu; en fazla 5 kişi oynayabilir.",
  );
  const map = getMap(room.map);
  room.players[data.id] = participant(
    data,
    now,
    map.spawns[list.length] ?? map.spawn,
  );
  room.lastActivityAt = now;
  event(room, { type: "joined", playerId: data.id, at: now });
}
function finish(room: Room, winner: Team | null, reason: string, now: number) {
  if (room.phase === "finished") return;
  room.winner = winner;
  room.finishReason = reason;
  room.survivors = Object.values(room.players)
    .filter((p) => p.team === "hider")
    .map((p) => p.id);
  for (const p of Object.values(room.players))
    if (p.team === "hider")
      p.survivedMs = Math.max(0, now - room.hidingStartedAt);
  phase(room, "finished", 0, now);
}
function reconcile(room: Room, now: number) {
  const players = Object.values(room.players);
  if (!players.some((p) => p.id === room.hostId && p.connected))
    room.hostId = players.find((p) => p.connected)?.id ?? players[0]?.id ?? "";
  if (room.phase === "lobby" || room.phase === "finished") return;
  if (players.length < RULES.minPlayers) {
    finish(
      room,
      null,
      "Oyuncu sayısı azaldı. Yeni bir arkadaş katıldığında tekrar oynayabilirsiniz.",
      now,
    );
    return;
  }
  if (!players.some((p) => p.team === "hider")) {
    finish(room, "seeker", "Bütün saklananlar yakalandı.", now);
    return;
  }
  if (!players.some((p) => p.team === "seeker")) {
    const available = players.filter((p) => p.connected);
    if (!available.length) return;
    const next = available[choose(room, available.length)];
    next.team = "seeker";
    next.ammo = RULES.magazine;
    next.reloadEndsAt = 0;
    next.position = { ...getMap(room.map).spawn };
    next.survivedMs = Math.max(0, now - room.hidingStartedAt);
    // In a draw/hide phase the successor receives the same private blackout.
    if (room.phase === "drawing") room.initialSeekerId = next.id;
    event(room, { type: "phase", playerId: next.id, at: now });
  }
}
export function removePlayer(room: Room, id: string, now: number) {
  if (!Object.hasOwn(room.players, id)) return;
  delete room.players[id];
  room.lastActivityAt = now;
  event(room, { type: "left", playerId: id, at: now });
  reconcile(room, now);
}
export function setConnected(
  room: Room,
  id: string,
  connected: boolean,
  now: number,
) {
  const p = room.players[id];
  assert(p, "Oyuncu artık odada değil.");
  p.connected = connected;
  p.disconnectedAt = connected ? null : now;
  p.lastInputAt = now;
  p.input = {
    ...emptyInput(),
    seq: p.lastInputSeq,
    yaw: p.yaw,
    pitch: p.pitch,
  };
  p.jumpQueued = false;
  p.moving = false;
  room.lastActivityAt = now;
  reconcile(room, now);
}
function start(room: Room, id: string, now: number) {
  assert(room.hostId === id, "Turu yalnızca oda sahibi başlatabilir.");
  assert(room.phase === "lobby", "Tur zaten başladı.");
  const players = Object.values(room.players);
  assert(
    players.length >= RULES.minPlayers && players.length <= RULES.maxPlayers,
    "Başlamak için 2–5 oyuncu gerekli.",
  );
  assert(
    players.every((p) => p.connected && p.ready),
    "Bütün oyuncular hazır olmalı.",
  );
  const votes = MAP_IDS.map((map) => ({
    map,
    count: players.filter((p) => p.vote === map).length,
  }));
  const best = Math.max(...votes.map((v) => v.count));
  const ties = votes.filter((v) => v.count === best);
  room.map = ties[ties.length === 1 ? 0 : choose(room, ties.length)].map;
  const map = getMap(room.map);
  room.initialSeekerId = players[choose(room, players.length)].id;
  room.round++;
  room.winner = null;
  room.finishReason = null;
  room.survivors = [];
  room.hidingStartedAt = now + RULES.drawMs;
  players.forEach((p, index) => {
    p.team = p.id === room.initialSeekerId ? "seeker" : "hider";
    p.position = {
      ...(p.team === "seeker" ? map.spawn : (map.spawns[index] ?? map.spawn)),
    };
    p.captures = 0;
    p.survivedMs = 0;
    p.caughtAt = null;
    p.ammo = RULES.magazine;
    p.reloadEndsAt = 0;
    p.velocityY = 0;
    p.lastShotAt = -Infinity;
    p.crouching = false;
    p.yaw = 0;
    p.pitch = 0;
  });
  phase(room, "drawing", now + RULES.drawMs, now);
}
function input(value: unknown): InputState {
  assert(value && typeof value === "object", "Hareket komutu geçersiz.");
  const v = value as InputState;
  assert(
    Number.isSafeInteger(v.seq) && v.seq >= 1 && v.seq <= 2147483647,
    "Hareket sırası geçersiz.",
  );
  assert(
    [v.forward, v.strafe, v.yaw, v.pitch].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ),
    "Hareket değeri geçersiz.",
  );
  assert(
    Math.abs(v.forward) <= 1 &&
      Math.abs(v.strafe) <= 1 &&
      Math.abs(v.yaw) <= 1000000 &&
      Math.abs(v.pitch) <= Math.PI / 2,
    "Hareket sınırı aşıldı.",
  );
  assert(
    [v.sprint, v.crouch, v.jump].every((b) => typeof b === "boolean"),
    "Hareket komutu geçersiz.",
  );
  return {
    seq: v.seq,
    forward: v.forward,
    strafe: v.strafe,
    yaw: Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw)),
    pitch: clamp(v.pitch, -1.4, 1.4),
    sprint: v.sprint,
    crouch: v.crouch,
    jump: v.jump,
  };
}
function paint(value: unknown): Paint {
  assert(value && typeof value === "object", "Üç bölge için renk seç.");
  const v = value as Paint;
  assert(
    [v.head, v.body, v.legs].every(
      (color) => typeof color === "string" && /^#[\da-fA-F]{6}$/.test(color),
    ),
    "Renk altı haneli HEX biçiminde olmalı.",
  );
  return {
    head: v.head.toLowerCase(),
    body: v.body.toLowerCase(),
    legs: v.legs.toLowerCase(),
  };
}
function overlaps(x: number, z: number, o: MapObject) {
  const closestX = clamp(x, o.x - o.width / 2, o.x + o.width / 2);
  const closestZ = clamp(z, o.z - o.depth / 2, o.z + o.depth / 2);
  return Math.hypot(x - closestX, z - closestZ) < RULES.radius;
}
function bodyBlocked(
  map: MapDefinition,
  x: number,
  z: number,
  y: number,
  height: number,
) {
  return map.objects.some(
    (o) =>
      o.solid &&
      y + height > (o.y ?? 0) + 0.02 &&
      y < (o.y ?? 0) + o.height - 0.02 &&
      overlaps(x, z, o),
  );
}
function move(p: Player, map: MapDefinition, now: number, dt: number) {
  const active = now - p.lastInputAt <= 350;
  const current = active ? p.input : emptyInput();
  const oldCrouch = p.crouching;
  p.crouching =
    current.crouch ||
    (oldCrouch &&
      bodyBlocked(map, p.position.x, p.position.z, p.position.y, 1.65));
  const height = p.crouching ? 1 : 1.65;
  const grounded =
    p.position.y < 0.001 ||
    map.objects.some(
      (o) =>
        o.solid &&
        Math.abs(p.position.y - ((o.y ?? 0) + o.height)) < 0.03 &&
        overlaps(p.position.x, p.position.z, o),
    );
  if (p.jumpQueued && grounded && !p.crouching) p.velocityY = 6;
  p.jumpQueued = false;
  const previousY = p.position.y;
  p.velocityY -= 18 * dt;
  let nextY = previousY + p.velocityY * dt;
  let floor = 0;
  for (const o of map.objects) {
    if (!o.solid || !overlaps(p.position.x, p.position.z, o)) continue;
    const bottom = o.y ?? 0;
    const top = bottom + o.height;
    if (p.velocityY <= 0 && previousY >= top - 0.03 && nextY < top)
      floor = Math.max(floor, top);
    if (
      p.velocityY > 0 &&
      previousY + height <= bottom + 0.03 &&
      nextY + height > bottom
    ) {
      nextY = bottom - height;
      p.velocityY = 0;
    }
  }
  if (nextY <= floor) {
    nextY = floor;
    p.velocityY = 0;
  }
  p.position.y = Math.max(0, nextY);
  const length = Math.max(1, Math.hypot(current.forward, current.strafe));
  const speed = p.crouching
    ? RULES.crouchSpeed
    : current.sprint
      ? RULES.sprintSpeed
      : RULES.walkSpeed;
  const dx =
    ((-Math.sin(p.yaw) * current.forward + Math.cos(p.yaw) * current.strafe) /
      length) *
    speed *
    dt;
  const dz =
    ((-Math.cos(p.yaw) * current.forward - Math.sin(p.yaw) * current.strafe) /
      length) *
    speed *
    dt;
  const before = { ...p.position };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  const extent = map.halfSize - RULES.radius;
  for (let i = 0; i < steps; i++) {
    const x = clamp(p.position.x + dx / steps, -extent, extent);
    if (!bodyBlocked(map, x, p.position.z, p.position.y, height))
      p.position.x = x;
    const z = clamp(p.position.z + dz / steps, -extent, extent);
    if (!bodyBlocked(map, p.position.x, z, p.position.y, height))
      p.position.z = z;
  }
  p.moving =
    Math.hypot(p.position.x - before.x, p.position.z - before.z) > 0.001;
}
function rayBox(origin: Vec3, direction: Vec3, low: Vec3, high: Vec3) {
  let near = 0,
    far = RULES.shotRange as number;
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < low[axis] || origin[axis] > high[axis])
        return Infinity;
    } else {
      const a = (low[axis] - origin[axis]) / direction[axis];
      const b = (high[axis] - origin[axis]) / direction[axis];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
  }
  return near;
}
function direction(yaw: number, pitch: number): Vec3 {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}
type ShotAim = { yaw: number; pitch: number };
function shotAim(value: unknown): ShotAim {
  assert(value && typeof value === "object", "Nişan yönü geçersiz.");
  const aim = value as ShotAim;
  assert(
    typeof aim.yaw === "number" &&
      Number.isFinite(aim.yaw) &&
      typeof aim.pitch === "number" &&
      Number.isFinite(aim.pitch) &&
      Math.abs(aim.yaw) <= 1000000 &&
      Math.abs(aim.pitch) <= 1.2,
    "Nişan yönü geçersiz.",
  );
  return {
    yaw: Math.atan2(Math.sin(aim.yaw), Math.cos(aim.yaw)),
    pitch: aim.pitch,
  };
}
function shoot(room: Room, p: Player, now: number, aim?: ShotAim) {
  assert(
    room.phase === "seeking" && p.team === "seeker",
    "Ateş etmek için arama aşamasında ebe olmalısın.",
  );
  if (p.reloadEndsAt || now - p.lastShotAt < RULES.shotCooldownMs) return;
  assert(p.ammo > 0, "Şarjör boş. Yeniden doldur.");
  p.lastShotAt = now;
  p.ammo--;
  const map = getMap(room.map);
  const origin = {
    ...p.position,
    y: p.position.y + (p.crouching ? 0.82 : 1.42),
  };
  // Third-person crosshairs converge toward the camera's centre, while every
  // pellet still originates at the authoritative player's eyes. A client can
  // supply an aim direction, never an origin, target or successful hit.
  const shotYaw = aim?.yaw ?? p.yaw;
  const shotPitch = aim?.pitch ?? p.pitch;
  const centre = direction(shotYaw, shotPitch);
  event(room, {
    type: "shot",
    playerId: p.id,
    at: now,
    position: origin,
    direction: centre,
  });
  const targets = new Set<string>();
  for (const [yaw, pitch] of [
    [0, 0],
    [-0.035, 0],
    [0.035, 0],
    [0, -0.035],
    [0, 0.035],
    [-0.025, -0.025],
    [0.025, 0.025],
  ]) {
    const ray = direction(shotYaw + yaw, shotPitch + pitch);
    let closest = RULES.shotRange as number;
    for (const o of map.objects)
      if (o.solid)
        closest = Math.min(
          closest,
          rayBox(
            origin,
            ray,
            { x: o.x - o.width / 2, y: o.y ?? 0, z: o.z - o.depth / 2 },
            {
              x: o.x + o.width / 2,
              y: (o.y ?? 0) + o.height,
              z: o.z + o.depth / 2,
            },
          ),
        );
    let caught: Player | undefined;
    for (const target of Object.values(room.players)) {
      if (target.team !== "hider") continue;
      const at = target.position;
      const distance = rayBox(
        origin,
        ray,
        { x: at.x - RULES.radius, y: at.y, z: at.z - RULES.radius },
        {
          x: at.x + RULES.radius,
          y: at.y + (target.crouching ? 1 : 1.65),
          z: at.z + RULES.radius,
        },
      );
      if (distance < closest) {
        closest = distance;
        caught = target;
      }
    }
    if (caught) targets.add(caught.id);
  }
  for (const id of targets) {
    const target = room.players[id];
    if (target.team !== "hider") continue;
    target.team = "seeker";
    target.caughtAt = now;
    target.survivedMs = Math.max(0, now - room.hidingStartedAt);
    target.ammo = RULES.magazine;
    target.reloadEndsAt = 0;
    target.lastShotAt = now;
    p.captures++;
    event(room, { type: "capture", playerId: p.id, targetId: id, at: now });
  }
  reconcile(room, now);
}
export function applyMessage(
  room: Room,
  playerId: string,
  message: ClientMessage,
  now: number,
) {
  const p = room.players[playerId];
  assert(p && p.connected, "Oyuncu artık bağlı değil.");
  assert(
    message && typeof message === "object" && typeof message.type === "string",
    "Komut geçersiz.",
  );
  // Advancing deadlines before actions prevents late shots or paints from
  // changing an outcome merely because the next simulation tick is delayed.
  advancePhases(room, now);
  room.lastActivityAt = now;
  switch (message.type) {
    case "ready":
      assert(
        room.phase === "lobby" && typeof message.ready === "boolean",
        "Hazır durumu yalnızca lobide değişir.",
      );
      p.ready = message.ready;
      break;
    case "vote":
      assert(
        room.phase === "lobby" && MAP_IDS.includes(message.map),
        "Lobide bir harita seç.",
      );
      p.vote = message.map;
      break;
    case "character":
      assert(
        room.phase === "lobby" && character(message.character),
        "Karakter yalnızca lobide seçilebilir.",
      );
      p.character = message.character;
      break;
    case "start":
      start(room, playerId, now);
      break;
    case "input": {
      const next = input(message.input);
      if (next.seq <= p.lastInputSeq) break;
      p.jumpQueued ||= next.jump && !p.input.jump;
      p.input = next;
      p.lastInputSeq = next.seq;
      p.yaw = next.yaw;
      p.pitch = next.pitch;
      p.lastInputAt = now;
      break;
    }
    case "paint":
      assert(
        room.phase === "lobby" ||
          (room.phase === "hiding" && p.team === "hider"),
        "Boyanma yalnızca lobide veya 60 saniyelik saklanma sırasında yapılır.",
      );
      p.paint = paint(message.paint);
      break;
    case "shoot":
      shoot(
        room,
        p,
        now,
        message.aim === undefined ? undefined : shotAim(message.aim),
      );
      break;
    case "reload":
      assert(
        room.phase === "seeking" && p.team === "seeker",
        "Yalnızca arayan ebe şarjör doldurabilir.",
      );
      if (!p.reloadEndsAt && p.ammo < RULES.magazine)
        p.reloadEndsAt = now + RULES.reloadMs;
      break;
    case "rematch":
      assert(
        room.phase === "finished" && room.hostId === playerId,
        "Yeni turu oda sahibi açabilir.",
      );
      room.winner = null;
      room.finishReason = null;
      room.survivors = [];
      room.initialSeekerId = null;
      for (const player of Object.values(room.players)) {
        player.ready = false;
        player.team = "hider";
        player.vote = "forest";
        player.captures = 0;
        player.survivedMs = 0;
        player.reloadEndsAt = 0;
      }
      phase(room, "lobby", 0, now);
      break;
    case "leave":
      removePlayer(room, playerId, now);
      break;
    default:
      throw new Error("Bilinmeyen oyun komutu.");
  }
}
function advancePhases(room: Room, now: number) {
  if (room.phase === "drawing" && now >= room.phaseEndsAt) {
    const at = room.phaseEndsAt;
    room.hidingStartedAt = at;
    phase(room, "hiding", at + RULES.hideMs, at);
  }
  if (room.phase === "hiding" && now >= room.phaseEndsAt) {
    const at = room.phaseEndsAt;
    for (const p of Object.values(room.players))
      if (p.team === "seeker") p.position = { ...getMap(room.map).spawn };
    phase(room, "seeking", at + RULES.seekMs, at);
  }
  if (room.phase === "seeking" && now >= room.phaseEndsAt)
    finish(
      room,
      "hider",
      "Arama süresi doldu; saklananlar kurtuldu.",
      room.phaseEndsAt,
    );
}
export function tick(room: Room, now: number, dtSeconds: number) {
  for (const p of Object.values(room.players))
    if (
      p.disconnectedAt !== null &&
      now - p.disconnectedAt >= RULES.disconnectGraceMs
    )
      removePlayer(room, p.id, now);
  advancePhases(room, now);
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.1);
  const map = getMap(room.map);
  for (const p of Object.values(room.players)) {
    if (p.reloadEndsAt && now >= p.reloadEndsAt) {
      p.ammo = RULES.magazine;
      p.reloadEndsAt = 0;
    }
    if (
      !p.connected ||
      !(
        room.phase === "seeking" ||
        (room.phase === "hiding" && p.team === "hider")
      )
    ) {
      p.moving = false;
      continue;
    }
    // Incoming packets also tick with zero elapsed time to enforce deadlines.
    // Only simulation ticks integrate motion: consuming a queued jump at dt=0
    // would immediately land it again and erase animation between player packets.
    if (dt > 0) move(p, map, now, dt);
    if (p.team === "hider")
      p.survivedMs = Math.max(0, now - room.hidingStartedAt);
  }
}
export function snapshot(room: Room, playerId: string, now: number): RoomView {
  const recipient = room.players[playerId];
  assert(recipient, "Oyuncu odada bulunamadı.");
  const blackout =
    room.phase === "drawing" ||
    (room.phase === "hiding" && recipient.team === "seeker");
  return {
    code: room.code,
    hostId: room.hostId,
    you: playerId,
    phase: room.phase,
    map: room.map,
    round: room.round,
    serverTime: now,
    phaseEndsAt: room.phaseEndsAt,
    initialSeekerId: room.initialSeekerId,
    winner: room.winner,
    finishReason: room.finishReason,
    survivors: [...room.survivors],
    players: Object.values(room.players).map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      paint: { ...p.paint },
      team: p.team,
      connected: p.connected,
      ready: p.ready,
      vote: p.vote,
      position: blackout ? null : { ...p.position },
      yaw: blackout ? 0 : p.yaw,
      pitch: blackout ? 0 : p.pitch,
      crouching: blackout ? false : p.crouching,
      moving: blackout ? false : p.moving,
      ammo: p.ammo,
      reloadEndsAt: p.reloadEndsAt,
      captures: p.captures,
      survivedMs: p.survivedMs,
      lastInputSeq: p.lastInputSeq,
    })),
    events: room.events
      .filter((e) => now - e.at <= 4000)
      .map((e) =>
        blackout
          ? {
              id: e.id,
              type: e.type,
              playerId: e.playerId,
              targetId: e.targetId,
              at: e.at,
            }
          : {
              ...e,
              ...(e.position ? { position: { ...e.position } } : {}),
              ...(e.direction ? { direction: { ...e.direction } } : {}),
            },
      ),
  };
}
