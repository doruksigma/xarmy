import { conferencesDay } from "./conference";
import { cleanupCommanders, commandersDay } from "./commanders";
import { managementDay } from "./management";
import { planningDay } from "./planning";
import { aiDay } from "./ai";
import { economyDay } from "./economy";
import { resolveLandDay, routeTo } from "./land";
import { operationsDay } from "./operations";
import { politicsDay } from "./politics";
import { clamp, friendly } from "./world";
import { applyCountryAction } from "./action-engine";
import type { Action, World } from "./types";
export { createWorld } from "./world";

/** Legacy callers retain their atomic semantics; UI commands use commands.ts. */
export function applyAction(
  world: World,
  action: Action,
): { world: World; error: string | null } {
  return applyCountryAction(world, world.player, action);
}
export function advanceDay(world: World): World {
  const w = structuredClone(world);
  w.day++;
  economyDay(w);
  politicsDay(w);
  operationsDay(w);
  aiDay(w);
  managementDay(w);
  planningDay(w);
  for (const front of w.fronts) {
    const points = front.provinces.filter((id) =>
      friendly(w, front.country, w.provinces[id].controller),
    );
    front.armies = front.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === front.country),
    );
    if (!points.length) continue;
    front.armies.forEach((id, i) => {
      const a = w.armies.find((a) => a.id === id)!;
      if (a.move || a.route.length) return;
      const to = points[i % points.length];
      if (a.province !== to) a.route = routeTo(w, a, to) ?? [];
    });
  }
  w.fronts = w.fronts.filter((f) => f.armies.length > 0);
  commandersDay(w);
  resolveLandDay(w);
  for (const p of w.plans)
    p.armies = p.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === p.country),
    );
  w.plans = w.plans.filter((p) => p.armies.length);
  for (const f of w.fronts)
    f.armies = f.armies.filter((id) =>
      w.armies.some((a) => a.id === id && a.country === f.country),
    );
  w.fronts = w.fronts.filter((f) => f.armies.length);
  conferencesDay(w);
  cleanupCommanders(w);
  w.tension = clamp(w.tension - 0.002);
  return w;
}
