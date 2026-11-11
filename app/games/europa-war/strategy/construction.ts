import { ECONOMIES } from "./economy-balance";
import { capacity } from "./world";
import type { Country, World } from "./types";

/** Shared by daily settlement and the queue's current-capacity estimate. */
export function constructionWorkPerDay(
  country: Country,
  civilCapacity: number,
) {
  return Math.max(
    0.1,
    civilCapacity *
      ECONOMIES[country.economy].construction *
      (country.advisor === "industry" ? 1.15 : 1) *
      (country.cabinet.economy === "builder" ? 1.15 : 1),
  );
}

export function constructionSchedule(world: World, country: Country) {
  const rate = constructionWorkPerDay(
    country,
    capacity(world, country.id, "civil"),
  );
  let days = 0;
  let active = false;
  return country.construction.map((entry) => {
    if (world.provinces[entry.province].controller !== country.id)
      return { entry, state: "occupied" as const, days: null };
    const state = active ? ("waiting" as const) : ("active" as const);
    active = true;
    days += Math.max(1, Math.ceil((entry.total - entry.progress) / rate));
    return { entry, state, days };
  });
}
