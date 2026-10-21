import type * as THREE from "three";

export type Quality = "low" | "medium" | "high" | "ultra";
export type Difficulty = "easy" | "normal" | "hard" | "insane";
export type WeaponId =
  | "ak47"
  | "m4"
  | "smg"
  | "sniper"
  | "shotgun"
  | "pistol"
  | "lmg";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Surface = "soil" | "stone" | "metal" | "wood" | "glass";
export type Phase = "plane" | "drop" | "combat" | "victory" | "defeated";
export type Weather = "clear" | "rain" | "fog" | "storm";
export type Attachment = "scope" | "suppressor" | "laser" | "grip" | "magazine";
export interface Collider {
  box: THREE.Box3;
  object: THREE.Object3D;
  surface: Surface;
  health?: number;
  destroyed?: boolean;
}
export interface Location {
  name: string;
  x: number;
  z: number;
  radius: number;
}
export interface Zone {
  x: number;
  z: number;
  radius: number;
  nextRadius: number;
  stage: number;
  remaining: number;
}
export interface Actor {
  id: number;
  name: string;
  position: THREE.Vector3;
  yaw: number;
  hp: number;
  armor: number;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  alive: boolean;
  crouched: boolean;
  speed: number;
}
export interface Loot {
  id: number;
  position: THREE.Vector3;
  kind: "weapon" | "ammo" | "armor" | "medkit" | "chest" | "attachment" | "key";
  weapon?: WeaponId;
  attachment?: Attachment;
  rarity: Rarity;
  taken: boolean;
}
export interface DamageLabel {
  id: number;
  x: number;
  y: number;
  value: number;
  headshot: boolean;
}
export interface HudState {
  phase: Phase;
  hp: number;
  armor: number;
  stamina: number;
  ammo: number;
  reserve: number;
  weapon: string;
  weaponId: WeaponId;
  rarity: Rarity;
  kills: number;
  alive: number;
  fps: number;
  zone: Zone;
  heading: number;
  location: string;
  elapsed: number;
  prompt: string;
  notice: string;
  reloading: number;
  hit: number;
  damageDirection: number | null;
  aiming: boolean;
  parachute: boolean;
  locked: boolean;
  paused: boolean;
  weather: Weather;
  attachments: Attachment[];
  grenades: number;
  grenadeType: string;
  medkits: number;
  damageLabels: DamageLabel[];
  feed: string[];
  playerX: number;
  playerZ: number;
  killer: string;
  replay: boolean;
}
export type GameCommand =
  | "jump"
  | "interact"
  | "reload"
  | "crouch"
  | "prone"
  | "slide"
  | "grenade"
  | "grenadeType"
  | "heal"
  | "weapon"
  | "shoulder"
  | "pause";
export interface TouchInput {
  x: number;
  y: number;
  lookX: number;
  lookY: number;
  fire: boolean;
  aim: boolean;
  sprint: boolean;
}
export interface GameController {
  command(command: GameCommand): void;
  touch(input: Partial<TouchInput>): void;
  setQuality(quality: Quality): void;
  setDifficulty(difficulty: Difficulty): void;
  setVolume(volume: number): void;
  capturePointer(): void;
  dispose(): void;
}
