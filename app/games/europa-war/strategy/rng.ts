import type { World } from "./types";

/** These names and seed salts are part of the saved simulation rules. */
export const RANDOM_STREAMS = [
  "combat",
  "events",
  "ai",
  "intelligence",
] as const;
export type RandomStream = (typeof RANDOM_STREAMS)[number];
export type RandomStreams = Record<RandomStream, number>;

export function isUint32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

export function isValidRandomStreams(value: unknown): value is RandomStreams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === RANDOM_STREAMS.length &&
    RANDOM_STREAMS.every(
      (stream) => Object.hasOwn(record, stream) && isUint32(record[stream]),
    )
  );
}

function mixedSeed(seed: number, salt: number): number {
  let value = seed ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Intelligence retains the old generator's next draw, including seed zero. */
export function createRandomStreams(seed: number): RandomStreams {
  if (!isUint32(seed)) throw new Error("Geçersiz rastgelelik tohumu.");
  return {
    combat: mixedSeed(seed, 0x434f4d42),
    events: mixedSeed(seed, 0x45564e54),
    ai: mixedSeed(seed, 0x41495354),
    intelligence: seed,
  };
}

/**
 * Missing streams are a genuine legacy save, not a malformed modern state.
 * Migrate only at the first draw so reading or exporting old saves is pure.
 */
function streamsFor(world: World): RandomStreams {
  if (!isUint32(world.seed)) throw new Error("Geçersiz rastgelelik tohumu.");
  if (!Object.hasOwn(world, "rng")) {
    world.rng = createRandomStreams(world.seed);
  } else if (
    !isValidRandomStreams(world.rng) ||
    world.rng.intelligence !== world.seed
  ) {
    throw new Error("Geçersiz kayıtlı rastgelelik akışları.");
  }
  return world.rng!;
}

/**
 * One independent saved LCG per simulation domain. Graphics use visualRandom;
 * reserving a domain does not make currently deterministic rules random.
 */
export function nextRandom(world: World, stream: RandomStream): number {
  if (!RANDOM_STREAMS.includes(stream))
    throw new Error("Bilinmeyen rastgelelik akışı.");
  const streams = streamsFor(world);
  const next = (Math.imul(streams[stream], 1664525) + 1013904223) >>> 0;
  streams[stream] = next;
  // Keep the legacy public seed as an exact mirror, never a second generator.
  if (stream === "intelligence") world.seed = next;
  return next / 0x100000000;
}
