import { SOLDIERS_PER_ARMY, units } from "./config";
import type { Kind } from "./config";
import type { Match } from "./engine";

const numberFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
export const formatSoldiers = (value: number): string => numberFormat.format(value);

/** The last surviving soldier remains until the existing combat HP reaches zero. */
export function soldiersInUnit(unit: { kind: Kind; hp: number }): number {
  return Math.ceil(Math.max(0, Math.min(1, unit.hp / units[unit.kind].hp)) * SOLDIERS_PER_ARMY);
}

/** Derive personnel from saved combat state, so reloads and online peers agree.
 * Fallen formations are counted on removal; surviving formations also retain
 * their partial losses. Recruiting adds strength, never erases casualties. */
export function manpower(match: Pick<Match, "units" | "report">) {
  const blue = { soldiers: 0, fallen: match.report.fallen * SOLDIERS_PER_ARMY, formations: 0 };
  const red = { soldiers: 0, fallen: match.report.killed * SOLDIERS_PER_ARMY, formations: 0 };
  for (const unit of match.units) {
    const side = unit.team === 1 ? blue : red;
    const strength = soldiersInUnit(unit);
    side.soldiers += strength;
    side.fallen += SOLDIERS_PER_ARMY - strength;
    if (unit.hp > 0) side.formations++;
  }
  return { blue, red };
}
