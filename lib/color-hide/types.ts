export type MapId = "forest" | "city" | "school";
export type CharacterId = "scout" | "fox" | "robot";
export type Phase = "lobby" | "drawing" | "hiding" | "seeking" | "finished";
export type Team = "hider" | "seeker";
export type Paint = { head: string; body: string; legs: string };
export type Vec3 = { x: number; y: number; z: number };
export type InputState = {
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
};
export type PlayerView = {
  id: string;
  name: string;
  character: CharacterId;
  paint: Paint;
  team: Team;
  connected: boolean;
  ready: boolean;
  vote: MapId;
  position: Vec3 | null;
  yaw: number;
  pitch: number;
  crouching: boolean;
  moving: boolean;
  ammo: number;
  reloadEndsAt: number;
  captures: number;
  survivedMs: number;
  lastInputSeq: number;
};
export type GameEvent = {
  id: number;
  type: "shot" | "capture" | "joined" | "left" | "phase";
  playerId?: string;
  targetId?: string;
  at: number;
  position?: Vec3;
  direction?: Vec3;
};
export type RoomView = {
  code: string;
  hostId: string;
  you: string;
  phase: Phase;
  map: MapId;
  round: number;
  serverTime: number;
  phaseEndsAt: number;
  initialSeekerId: string | null;
  winner: Team | null;
  finishReason: string | null;
  survivors: string[];
  players: PlayerView[];
  events: GameEvent[];
};
export type ClientMessage =
  | { type: "create"; name: string; character: CharacterId }
  | { type: "join"; code: string; name: string; character: CharacterId }
  | { type: "resume"; code: string; token: string }
  | { type: "ready"; ready: boolean }
  | { type: "vote"; map: MapId }
  | { type: "character"; character: CharacterId }
  | { type: "start" }
  | { type: "input"; input: InputState }
  | { type: "paint"; paint: Paint }
  | { type: "shoot"; aim?: { yaw: number; pitch: number } }
  | { type: "reload" }
  | { type: "rematch" }
  | { type: "leave" }
  | { type: "ping" };
export type ServerMessage =
  | { type: "welcome"; code: string; playerId: string; token: string }
  | { type: "snapshot"; room: RoomView }
  | { type: "error"; message: string; code?: string }
  | { type: "left" }
  | { type: "pong"; serverTime: number };

export type MapObject = {
  id: string;
  kind:
    | "tree"
    | "bush"
    | "rock"
    | "wall"
    | "crate"
    | "car"
    | "desk"
    | "locker"
    | "bench"
    | "lamp"
    | "sign"
    | "roof";
  x: number;
  z: number;
  y?: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  solid: boolean;
};
export type MapDefinition = {
  id: MapId;
  name: string;
  subtitle: string;
  ground: string;
  sky: string;
  palette: string[];
  halfSize: number;
  spawn: Vec3;
  spawns: Vec3[];
  objects: MapObject[];
};
export const MAP_IDS: MapId[] = ["forest", "city", "school"];
export const CHARACTERS: {
  id: CharacterId;
  name: string;
  description: string;
}[] = [
  { id: "scout", name: "İzci", description: "Meraklı bir orman gezgini" },
  { id: "fox", name: "Tilki", description: "Küçük kulaklar, büyük kaçışlar" },
  { id: "robot", name: "Robot", description: "Renk değiştiren keşif robotu" },
];
export const DEFAULT_PAINT: Paint = {
  head: "#e8b581",
  body: "#5c9c66",
  legs: "#40545c",
};
export const RULES = {
  maxPlayers: 5,
  minPlayers: 2,
  drawMs: 4000,
  hideMs: 60000,
  seekMs: 600000,
  disconnectGraceMs: 20000,
  magazine: 6,
  reloadMs: 1800,
  shotCooldownMs: 850,
  shotRange: 30,
  radius: 0.36,
  walkSpeed: 4,
  sprintSpeed: 6,
  crouchSpeed: 2,
} as const;
