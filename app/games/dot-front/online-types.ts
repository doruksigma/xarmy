import type { Team } from "./config";
import type { MapId } from "./terrain";
import type { GameCommand } from "./commands";
import type { PackedMatch } from "./online-protocol";

export const ONLINE_SESSION_KEY = "xarmy:dot-front:online-session-v1";

export type OnlineRole = "host" | "guest";
export type OnlineSpeed = 0.5 | 1 | 2 | 3;
export type RoomSession = { code: string; token: string; role: OnlineRole; team: Team };
export type QueuedCommand = { seq: number; command: GameCommand };
export type RoomView = {
  code: string; role: OnlineRole; team: Team; map: MapId;
  status: "waiting" | "playing" | "finished";
  revision: number; controlVersion: number; paused: boolean; speed: OnlineSpeed;
  hostPresent: boolean; guestPresent: boolean; guestJoined: boolean;
  snapshot: PackedMatch | null; snapshotSeq: number;
  commands: QueuedCommand[]; guestSeq: number; ack: number;
  expiresAt: number;
};
export type RoomAccess = { room: RoomView; token: string };
export type RoomAction =
  | { action: "sync"; present: boolean; commands?: QueuedCommand[];
      snapshot?: PackedMatch; snapshotSeq?: number; ack?: number; controlVersion?: number }
  | { action: "start" | "pause" | "resume" | "leave" | "resign" }
  | { action: "speed"; speed: OnlineSpeed };
