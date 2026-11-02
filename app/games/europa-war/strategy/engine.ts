import { conferencesDay } from "./conference";
import { cleanupCommanders, commandersDay } from "./commanders";
import { managementDay } from "./management";
import { planningStep } from "./planning";
import { aiDay } from "./ai";
import { economyDay } from "./economy";
import { resolveLandStep, routeTo } from "./land";
import { operationsDay } from "./operations";
import { politicsDay } from "./politics";
import { clamp, friendly } from "./world";
import { applyCountryAction } from "./action-engine";
import { createCommand, executeCommandInPlace } from "./commands";
import type { Action, World } from "./types";
import { HOURS_PER_DAY, MAX_CAMPAIGN_HOUR, worldHour } from "./time";
export { createWorld } from "./world";

/** Legacy callers retain their atomic semantics; UI commands use commands.ts. */
export function applyAction(
  world: World,
  action: Action,
): { world: World; error: string | null } {
  return applyCountryAction(world, world.player, action);
}
function stepHour(w: World): void {
  w.hour++;
  if (w.hour === HOURS_PER_DAY) {
    w.hour = 0;
    w.day++;
    // Daily settlement is ordered: industry/research/personnel, politics,
    // air/naval/intelligence, then strategic decisions. New equipment can
    // reinforce ground formations in this boundary hour, never before it.
    economyDay(w);
    politicsDay(w);
    operationsDay(w);
    aiDay(w);
    managementDay(
      w,
      (issuer, action) =>
        executeCommandInPlace(w, createCommand(w, action, issuer), issuer)
          .status === "applied",
    );
    conferencesDay(w);
    w.tension = clamp(w.tension - 0.002);
  }
  planningStep(w, 1 / HOURS_PER_DAY);
  const armyById = new Map(w.armies.map((a) => [a.id, a]));
  for (const front of w.fronts) {
    const points = front.provinces.filter((id) =>
      friendly(w, front.country, w.provinces[id].controller),
    );
    front.armies = front.armies.filter(
      (id) => armyById.get(id)?.country === front.country,
    );
    if (!points.length) continue;
    front.armies.forEach((id, i) => {
      const a = armyById.get(id)!;
      if (a.move || a.route.length) return;
      const to = points[i % points.length];
      if (a.province !== to) a.route = routeTo(w, a, to) ?? [];
    });
  }
  w.fronts = w.fronts.filter((f) => f.armies.length > 0);
  commandersDay(w);
  resolveLandStep(w, 1 / HOURS_PER_DAY);
  const surviving = new Map(w.armies.map((a) => [a.id, a.country]));
  for (const p of w.plans)
    p.armies = p.armies.filter((id) => surviving.get(id) === p.country);
  w.plans = w.plans.filter((p) => p.armies.length);
  for (const f of w.fronts)
    f.armies = f.armies.filter((id) => surviving.get(id) === f.country);
  w.fronts = w.fronts.filter((f) => f.armies.length);
  cleanupCommanders(w);
}

/** Fixed hourly steps, cloned once per batch. Speed never changes the rules. */
export function advanceHours(world: World, hours: number): World {
  if (!Number.isSafeInteger(hours) || hours < 0 || hours > HOURS_PER_DAY)
    throw new Error("Bir adımda 0–24 tam oyun saati ilerletilebilir.");
  if (worldHour(world) + hours > MAX_CAMPAIGN_HOUR)
    throw new Error("Seferin desteklenen tarih sınırına ulaşıldı.");
  const w = structuredClone(world);
  for (let i = 0; i < hours; i++) stepHour(w);
  return w;
}

export function advanceHour(world: World): World {
  return advanceHours(world, 1);
}

/** Compatibility API: a day now means exactly 24 of the same hourly steps. */
export function advanceDay(world: World): World {
  return advanceHours(world, HOURS_PER_DAY);
}
