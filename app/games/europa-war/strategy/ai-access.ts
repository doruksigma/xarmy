import { seaEdgeOpen } from "./military-assets";
import { friendly, GEOGRAPHY } from "./world";
import type { World } from "./types";

/** A tactical access snapshot needs neither travel times nor supply searches.
 * The move command still computes and validates its full weighted route. This
 * snapshot lasts one decision pass, so the next sees occupations, diplomacy,
 * naval losses and fuel changes without any persisted cache invalidation. */
export function tacticalAccess(w: World, country: string) {
  const seaGates = new Map<string, boolean>();
  const adjacency = new Map<string, string[]>();
  const reachable = new Map<string, Set<string>>();
  const seaOpen = (from: string, to: string) => {
    const key = `${from}:${to}`;
    if (!seaGates.has(key))
      seaGates.set(key, seaEdgeOpen(w, country, from, to));
    return seaGates.get(key)!;
  };
  const neighbors = (from: string) => {
    if (!adjacency.has(from))
      adjacency.set(
        from,
        (GEOGRAPHY[from]?.neighbors ?? [])
          .filter(
            (edge) =>
              friendly(w, country, w.provinces[edge.id].controller) &&
              (!edge.sea || seaOpen(from, edge.id)),
          )
          .map((edge) => edge.id),
      );
    return adjacency.get(from)!;
  };
  const canReach = (from: string, to: string) => {
    if (from === to) return true;
    if (!friendly(w, country, w.provinces[to].controller)) return false;
    if (!reachable.has(from)) {
      const seen = new Set([from]);
      const queue = [from];
      for (let head = 0; head < queue.length; head++)
        for (const next of neighbors(queue[head]))
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
      reachable.set(from, seen);
    }
    return reachable.get(from)!.has(to);
  };
  return { canReach, seaOpen };
}
