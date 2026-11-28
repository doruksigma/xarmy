import type { Match } from "./engine";
import { validMatch } from "./storage";
import { TERRITORY_SIZE } from "./territory";

export const MAX_ONLINE_BODY_BYTES = 1024 * 1024;
export type PackedMatch = Omit<Match, "territory"> & {
  encoding: "dot-front-rle-1";
  territory: { revision: number; runs: [number, number][] };
};

function withinBudget(value: unknown): boolean {
  const json = JSON.stringify(value);
  return typeof json === "string" && json.length <= MAX_ONLINE_BODY_BYTES &&
    new TextEncoder().encode(json).length <= MAX_ONLINE_BODY_BYTES;
}

/** Lossless transport encoding; simulation timers, paths and random state remain intact. */
export function packMatch(match: Match): PackedMatch {
  if (!validMatch(match)) throw new Error("Invalid online match");
  // The dense occupation grid is encoded directly; cloning its 51,840 cells
  // before RLE doubled snapshot allocation on tablet hosts. All dynamic state
  // still gets an independent copy for stable network retries.
  const { territory, ...liveState } = match;
  const state = structuredClone(liveState);
  const runs: [number, number][] = [];
  for (const owner of territory.owners) {
    const last = runs[runs.length - 1];
    if (last?.[0] === owner) last[1]++; else runs.push([owner, 1]);
  }
  const packed: PackedMatch = { ...state, encoding: "dot-front-rle-1", territory: { revision: territory.revision, runs } };
  if (!withinBudget(packed)) throw new Error("Online match exceeds the snapshot limit");
  return packed;
}

/** Reject malformed/oversized input before allocating the fixed occupation grid. */
export function unpackMatch(value: unknown): Match | null {
  try {
    if (!value || typeof value !== "object" || !withinBudget(value)) return null;
    const packed = value as PackedMatch;
    if (packed.encoding !== "dot-front-rle-1" || !packed.territory || !Array.isArray(packed.territory.runs) ||
      !packed.territory.runs.length || packed.territory.runs.length > TERRITORY_SIZE ||
      !Number.isInteger(packed.territory.revision) || packed.territory.revision < 0 || packed.territory.revision > 0x7fffffff ||
      Object.hasOwn(packed.territory, "owners")) return null;
    let size = 0;
    for (const run of packed.territory.runs) {
      if (!Array.isArray(run) || run.length !== 2 || ![0, 1, 2].includes(run[0]) ||
        !Number.isSafeInteger(run[1]) || run[1] <= 0 || run[1] > TERRITORY_SIZE - size) return null;
      size += run[1];
    }
    if (size !== TERRITORY_SIZE) return null;
    const owners = new Array<number>(TERRITORY_SIZE);
    let offset = 0;
    for (const [owner, count] of packed.territory.runs) { owners.fill(owner, offset, offset + count); offset += count; }
    const { encoding, territory, ...state } = packed;
    void encoding;
    const match = { ...structuredClone(state), territory: { revision: territory.revision, owners } };
    return validMatch(match) ? match : null;
  } catch { return null; }
}
