import { createWorld, event, MAP, uid } from "./world";
import type { World } from "./types";
import { provincePrice } from "./conference";

export const GLOBAL_MAP_VERSION = "world-1936-v1" as const;

/** Called only after the complete, old European save has passed validation. */
export function extendEuropeanCampaign(source: World): World {
  const world = structuredClone(source);
  const template = createWorld(
    world.player,
    world.mode,
    world.seed,
    world.difficulty,
  );
  const existingCountries = new Set(Object.keys(world.countries));
  const newCountries = new Set(
    MAP.countries
      .filter((country) => !existingCountries.has(country.id))
      .map((country) => country.id),
  );
  for (const id of newCountries) world.countries[id] = template.countries[id];
  for (const [id, province] of Object.entries(template.provinces)) {
    if (Object.hasOwn(world.provinces, id)) continue;
    const original = world.countries[province.owner];
    // Expanding a defeated nation must not resurrect it or undo an old victory.
    if (existingCountries.has(original.id) && original.capitulated) {
      const capital = source.provinces[original.capital];
      const successor =
        original.victor ??
        (capital?.controller !== original.id
          ? capital?.controller
          : undefined) ??
        (capital?.owner !== original.id ? capital?.owner : undefined);
      if (successor && world.countries[successor]) {
        province.controller = successor;
        // A completed annexation remains completed after adding overseas land.
        if (!original.victor) province.owner = successor;
      }
      const conference = world.conferences.find(
        (q) => q.defeated === original.id && q.status === "open",
      );
      if (conference) {
        conference.available.push(id);
        // Give the expanded territory an equal additional settlement budget;
        // old awards, existing balances, and the current turn stay intact.
        const share = Math.ceil(
          provincePrice(id) / conference.participants.length,
        );
        for (const participant of conference.participants)
          conference.points[participant] += share;
      }
    }
    world.provinces[id] = province;
  }
  const usedIds = new Set([
    ...world.armies.map((army) => army.id),
    ...Object.values(source.countries).flatMap((country) => [
      ...country.air.wings.map((wing) => wing.id),
      ...country.navy.ships.map((ship) => ship.id),
    ]),
  ]);
  const freshId = (prefix: string) => {
    let id: string;
    do {
      id = uid(world, prefix);
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  for (const id of newCountries) {
    const country = world.countries[id];
    const lands = Object.values(world.provinces).filter(
      (province) => province.controller === id,
    );
    // Iceland, for example, occupied existing Danish IDs in the old map. Keep
    // those saved controllers rather than silently splitting their territory.
    if (!lands.length) {
      country.capitulated = true;
      country.victor = world.provinces[country.capital].controller;
      country.air.wings = [];
      country.navy.ships = [];
      continue;
    }
    if (world.provinces[country.capital].controller !== id)
      country.capital = lands[0].id;
    country.air.wings = country.air.wings
      .filter((wing) => world.provinces[wing.base].controller === id)
      .map((wing) => ({ ...wing, id: freshId("wing") }));
    country.navy.ships = country.navy.ships
      .filter((ship) => world.provinces[ship.port].controller === id)
      .map((ship) => ({ ...ship, id: freshId("ship") }));
    for (const army of template.armies) {
      if (
        army.country !== id ||
        world.provinces[army.province].controller !== id
      )
        continue;
      world.armies.push({ ...army, id: freshId("army") });
    }
  }
  for (const country of Object.values(world.countries)) {
    for (const other of Object.values(world.countries)) {
      if (country.id === other.id || Object.hasOwn(country.relations, other.id))
        continue;
      country.relations[other.id] =
        country.ideology === other.ideology ? 20 : -5;
    }
    if (newCountries.has(country.id) && country.subjectOf) {
      const parent = world.countries[country.subjectOf];
      if (parent && !parent.allies.includes(country.id))
        parent.allies.push(country.id);
    }
  }
  world.mapVersion = GLOBAL_MAP_VERSION;
  event(
    world,
    "Avrupa kaydı dünya haritasına genişletildi. Eski bölgeler, ordular, kuyruklar ve emirler korundu; yeni ülkeler ve bölgeler 1936 başlangıç verileriyle eklendi.",
  );
  return world;
}
