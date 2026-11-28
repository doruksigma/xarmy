export const STEP = 0.05;
export const CAPTURE = 24;
export const SUPPLY = 5;
export const GRACE = 15;
// A completed grounded enclosure resolves immediately. These penalties apply
// only to disconnected supply that has not become a completed enemy enclosure.
export const POCKET_GRACE = 20;
export const POCKET_DAMAGE = 1.25;
export const POCKET_SPEED = 0.75;
export const POCKET_FIREPOWER = 0.65;
export const RADIUS = 1.45;
export const WIDTH = 144;
export const HEIGHT = 90;
/** Each owned supplied city independently recruits once per simulation minute. */
export const CITY_PRODUCTION = 60;
export const FRONT_INTERVAL = 1;
export const FRONT_ATTACK_ADVANCE = 5;
export const FRONT_REPLAN_DISTANCE = 0.75;
export const FRONT_ATTACK_COMMIT_DISTANCE = 1.25;
export const FRONT_ATTACK_SEARCH = 35;
export const MAX_ROUTE_POINTS = 128;

export const units = {
  light: { hp: 48, damage: 4, range: 2.3, speed: 0.4, cooldown: 3, build: CITY_PRODUCTION, supply: 1, forest: 0.8 },
  heavy: { hp: 110, damage: 10, range: 3.1, speed: 0.25, cooldown: 4.5, build: CITY_PRODUCTION, supply: 2, forest: 0.49 },
};
export type Kind = keyof typeof units;
export type Point = { x: number; y: number };
export type Team = 1 | 2;
export type Owner = 0 | Team;
export type Difficulty = "easy" | "normal" | "hard";
export const difficulty = {
  easy: { period: 15, gather: 5, caution: 0.75 },
  normal: { period: 10, gather: 6, caution: 1.02 },
  hard: { period: 6, gather: 7, caution: 1.23 },
};
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
