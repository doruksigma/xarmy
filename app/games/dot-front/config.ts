export const STEP = 0.05;
export const CAPTURE = 8;
export const SUPPLY = 5;
export const GRACE = 15;
export const RADIUS = 1.45;
export const WIDTH = 48;
export const HEIGHT = 30;

export const units = {
  light: { hp: 48, damage: 6, range: 2.3, speed: 2.2, cooldown: 0.75, build: 6, supply: 1, forest: 0.8 },
  heavy: { hp: 110, damage: 16, range: 3.1, speed: 1.3, cooldown: 1.2, build: 14, supply: 2, forest: 0.49 },
};
export type Kind = keyof typeof units;
export type Point = { x: number; y: number };
export type Team = 1 | 2;
export type Owner = 0 | Team;
export type Difficulty = "easy" | "normal" | "hard";
export const difficulty = {
  easy: { period: 9, gather: 5, caution: 0.75 },
  normal: { period: 5, gather: 6, caution: 1.02 },
  hard: { period: 3, gather: 7, caution: 1.23 },
};
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
