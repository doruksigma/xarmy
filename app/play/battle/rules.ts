import type { Rarity, WeaponId, Zone } from "./types";

export interface WeaponSpec {
  name: string;
  damage: number;
  magazine: number;
  interval: number;
  range: number;
  spread: number;
  recoil: number;
  reload: number;
  pellets: number;
  automatic: boolean;
}
export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  ak47: {
    name: "AK-47",
    damage: 29,
    magazine: 30,
    interval: 0.13,
    range: 170,
    spread: 0.012,
    recoil: 0.026,
    reload: 2.5,
    pellets: 1,
    automatic: true,
  },
  m4: {
    name: "M4 CARBINE",
    damage: 23,
    magazine: 30,
    interval: 0.095,
    range: 160,
    spread: 0.008,
    recoil: 0.016,
    reload: 2.1,
    pellets: 1,
    automatic: true,
  },
  smg: {
    name: "VECTOR SMG",
    damage: 17,
    magazine: 32,
    interval: 0.065,
    range: 75,
    spread: 0.016,
    recoil: 0.012,
    reload: 1.7,
    pellets: 1,
    automatic: true,
  },
  sniper: {
    name: "M-24 PRECISION",
    damage: 85,
    magazine: 5,
    interval: 1.25,
    range: 300,
    spread: 0.002,
    recoil: 0.065,
    reload: 3,
    pellets: 1,
    automatic: false,
  },
  shotgun: {
    name: "M870 BREACHER",
    damage: 13,
    magazine: 8,
    interval: 0.85,
    range: 38,
    spread: 0.055,
    recoil: 0.05,
    reload: 2.8,
    pellets: 8,
    automatic: false,
  },
  pistol: {
    name: "P9 SIDEARM",
    damage: 23,
    magazine: 12,
    interval: 0.25,
    range: 75,
    spread: 0.012,
    recoil: 0.024,
    reload: 1.4,
    pellets: 1,
    automatic: false,
  },
  lmg: {
    name: "M249 SUPPORT",
    damage: 25,
    magazine: 75,
    interval: 0.115,
    range: 190,
    spread: 0.018,
    recoil: 0.023,
    reload: 4.2,
    pellets: 1,
    automatic: true,
  },
};
export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xb7c8cc,
  rare: 0x56a9f6,
  epic: 0xc084fc,
  legendary: 0xf5bc67,
};
export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  common: 1,
  rare: 1.08,
  epic: 1.16,
  legendary: 1.25,
};
export function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function applyDamage(
  hp: number,
  armor: number,
  damage: number,
): { hp: number; armor: number } {
  const hit = Math.max(0, damage);
  const absorbed = Math.min(Math.max(0, armor), hit * 0.7);
  return {
    hp: Math.max(0, hp - (hit - absorbed)),
    armor: Math.max(0, armor - absorbed),
  };
}
const RADII = [285, 205, 135, 80, 42, 16, 0];
export function zoneAt(seconds: number): Zone {
  const stage = Math.min(5, Math.max(0, Math.floor(seconds / 60)));
  const within = Math.max(0, seconds - stage * 60);
  const shrink = Math.min(1, Math.max(0, (within - 24) / 36));
  return {
    x: 0,
    z: 0,
    radius: RADII[stage] + (RADII[stage + 1] - RADII[stage]) * shrink,
    nextRadius: RADII[stage + 1],
    stage: stage + 1,
    remaining: Math.max(0, (within < 24 ? 24 : 60) - within),
  };
}
export function zoneDamage(
  zone: Zone,
  x: number,
  z: number,
  dt: number,
): number {
  return Math.hypot(x - zone.x, z - zone.z) > zone.radius
    ? Math.max(0, dt) * (1.5 + zone.stage * 1.3)
    : 0;
}
export function reloadMagazine(
  ammo: number,
  reserve: number,
  capacity: number,
) {
  const moved = Math.min(Math.max(0, capacity - ammo), Math.max(0, reserve));
  return { ammo: ammo + moved, reserve: reserve - moved };
}
export function matchOutcome(
  playerAlive: boolean,
  opponentsAlive: number,
): "combat" | "victory" | "defeated" {
  return !playerAlive
    ? "defeated"
    : opponentsAlive === 0
      ? "victory"
      : "combat";
}
