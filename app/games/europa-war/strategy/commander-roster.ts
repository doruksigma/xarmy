import type { Army, Country, General, World } from "./types";

export const COMMANDER_CAPACITY = 12;
export const MAX_COMMANDERS = 250;

/** Recheck at combat time, too: another battle may change a controller today. */
export function commanderOrderAllows(
  w: World,
  army: Army,
  to: string,
): boolean {
  const c = w.countries[army.country];
  const front = c.generals.find((g) => g.id === army.general)?.front;
  if (!front) return true;
  const controller = w.provinces[to]?.controller;
  if (!controller) return false;
  if (!c.wars.includes(controller)) return true;
  return front.stance === "attack" && front.target === controller;
}

export function createCommander(w: World, c: Country): General {
  if (c.generals.length >= MAX_COMMANDERS)
    throw new Error(
      "Komutan sınırına ulaşıldı; boş komutanlardan birini kullan.",
    );
  const general: General = {
    id: `commander-${++w.serial}`,
    name: `${c.generals.length + 1}. Ordu Komutanı`,
    trait: (["attack", "defense", "logistics"] as const)[c.generals.length % 3],
    skill: 1,
    xp: 0,
  };
  c.generals.push(general);
  return general;
}

/** Called only at birth, explicit auto-assignment, or an AI roster decision. */
export function assignAvailableCommander(
  w: World,
  c: Country,
  army: Army,
  preferred?: string,
): General {
  const counts = new Map<string, number>();
  for (const other of w.armies)
    if (other.country === c.id && other.general && other.id !== army.id)
      counts.set(other.general, (counts.get(other.general) ?? 0) + 1);
  const candidates = [...c.generals].sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
  );
  const general =
    candidates.find((g) => (counts.get(g.id) ?? 0) < COMMANDER_CAPACITY) ??
    createCommander(w, c);
  army.general = general.id;
  return general;
}
