import { GEOGRAPHY } from "./world";
import { movementLegPath, remainingCorridor } from "./land-corridors";
import type { Army, World } from "./types";

export type GraphicsQuality = "low" | "medium" | "high" | "ultra";
export const GRAPHICS_QUALITY = {
  low: { name: "Düşük", pixelRatio: 1, shadows: 0, scenery: 0.3, fps: 24 },
  medium: {
    name: "Orta",
    pixelRatio: 1.25,
    shadows: 1024,
    scenery: 0.55,
    fps: 60,
  },
  high: {
    name: "Yüksek",
    pixelRatio: 1.5,
    shadows: 2048,
    scenery: 0.8,
    fps: 60,
  },
  ultra: { name: "Ultra", pixelRatio: 2, shadows: 2048, scenery: 1, fps: 60 },
} as const;

export function visualSeed(id: string) {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++)
    value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}
export function visualRandom(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Same disclosed formations as the strategic map, without exposing hidden armies. */
export function visibleFormations(world: World): Army[][] {
  const player = world.countries[world.player];
  const battles = new Set(world.battles.map((b) => b.province));
  const groups = new Map<string, Army[]>();
  for (const army of world.armies) {
    const known =
      army.country === world.player ||
      player.allies.includes(army.country) ||
      player.intel[army.country]?.expires > world.day ||
      battles.has(army.province) ||
      GEOGRAPHY[army.province].neighbors.some(
        (edge) => world.provinces[edge.id].controller === world.player,
      );
    if (!known) continue;
    const key = `${army.country}:${army.province}:${army.move?.to ?? "idle"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(army);
  }
  return [...groups.values()];
}

/** Visual interpolation only. Never advance simulation progress or RNG. */
export function armyMapPosition(army: Army) {
  const origin = GEOGRAPHY[army.province];
  if (!army.move) return { x: origin.x, y: origin.y };
  const path = movementLegPath(
    army.province,
    army.move.to,
    army.move.kind === "paradrop",
  );
  if (!path) return { x: origin.x, y: origin.y };
  const ratio = Math.max(
    0,
    Math.min(0.94, army.move.progress / Math.max(0.01, army.move.days)),
  );
  return remainingCorridor(path, ratio)[0];
}
