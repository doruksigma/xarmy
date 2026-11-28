import { CITY_INCOME, UNFUNDED_DAMAGE, UPKEEP, units } from "./config";
import type { Team } from "./config";
import type { Match } from "./engine";

/** Money is a team resource. These rates are identical for human and AI sides. */
export function economySummary(match: Match, team: Team) {
  const state = match.economy[team - 1];
  const income = match.cities.reduce((sum, city) => sum + (city.owner === team ? CITY_INCOME : 0), 0);
  const upkeep = match.units.reduce((sum, unit) => sum + (unit.team === team && unit.hp > 0 ? UPKEEP[unit.kind] : 0), 0);
  return { money: state.money, income, upkeep, net: income - upkeep, shortage: state.shortage };
}

/** If treasury runs out mid-step, only its unfunded duration causes losses. */
export function advanceEconomy(match: Match, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (const team of [1, 2] as const) {
    const state = match.economy[team - 1], { income, upkeep, net } = economySummary(match, team);
    if (net >= 0) {
      state.money = Math.min(Number.MAX_SAFE_INTEGER, state.money + net * dt);
      state.shortage = 0;
      continue;
    }
    const deficit = -net, funded = Math.min(dt, state.money / deficit), exposed = Math.max(0, dt - funded);
    state.money = Math.max(0, state.money - deficit * dt);
    if (state.money < 1e-8) state.money = 0;
    if (!exposed) { state.shortage = 0; continue; }
    state.shortage += exposed;
    const uncovered = Math.max(0, Math.min(1, (upkeep - income) / upkeep));
    for (const unit of match.units) if (unit.team === team && unit.hp > 0) {
      unit.hp = Math.max(0, unit.hp - units[unit.kind].hp * UNFUNDED_DAMAGE * uncovered * exposed);
    }
  }
}
