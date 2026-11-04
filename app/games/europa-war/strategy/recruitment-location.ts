import { GEOGRAPHY } from "./world";
import type { World } from "./types";

/** Training can only use a province both owned and controlled by the issuer. */
export function canRecruitAt(
  world: World,
  country: string,
  province: string,
): boolean {
  const state = world.provinces[province];
  return (
    !!world.countries[country] &&
    !!state &&
    state.owner === country &&
    state.controller === country
  );
}

/** Camera selection deliberately is not an input to the recruitment preference. */
export function resolveRecruitmentProvince(
  world: World,
  preferred: string | null | undefined,
  country = world.player,
): string | null {
  const owner = world.countries[country];
  if (!owner) return null;
  if (preferred && canRecruitAt(world, country, preferred)) return preferred;
  if (canRecruitAt(world, country, owner.capital)) return owner.capital;
  return (
    Object.keys(world.provinces)
      .sort()
      .find((id) => canRecruitAt(world, country, id)) ?? null
  );
}

/** Called when province control changes, not once per animation frame. */
export function recruitmentLocations(world: World, country = world.player) {
  const capital = world.countries[country]?.capital;
  return capital
    ? recruitmentLocationsIn(world.provinces, country, capital)
    : [];
}

export function recruitmentLocationsIn(
  provinces: World["provinces"],
  country: string,
  capital: string,
) {
  return Object.keys(provinces)
    .filter(
      (id) =>
        provinces[id].owner === country && provinces[id].controller === country,
    )
    .map((id) => ({
      id,
      name: GEOGRAPHY[id]?.name ?? id,
      capital: id === capital,
    }))
    .sort(
      (a, b) =>
        Number(b.capital) - Number(a.capital) ||
        a.name.localeCompare(b.name, "tr") ||
        a.id.localeCompare(b.id),
    );
}
