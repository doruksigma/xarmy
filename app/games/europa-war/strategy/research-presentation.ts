import { TECHNOLOGIES } from "./catalog";
import type { Country } from "./types";

/** The same daily progress is used by the simulation and the lab forecast. */
export function researchDailyProgress(c: Country, id: string): number {
  const branch = TECHNOLOGIES.find(
    (technology) => technology.id === id,
  )?.branch;
  const cabinetBonus =
    c.cabinet.science === "institute"
      ? 0.1
      : c.cabinet.science === "engineers" &&
          branch &&
          ["Sanayi", "Zırh"].includes(branch)
        ? 0.25
        : c.cabinet.science === "doctrine" && branch === "Doktrin"
          ? 0.3
          : 0;
  return 1 + c.science + (c.advisor === "science" ? 0.15 : 0) + cabinetBonus;
}

export function researchRemainingDays(
  c: Country,
  project: Country["research"][number],
): number {
  return Math.max(
    0,
    Math.ceil(
      (project.total - project.progress) / researchDailyProgress(c, project.id),
    ),
  );
}

export function researchStatus(c: Country, id: string) {
  if (c.tech.includes(id)) return "completed" as const;
  if (c.research.some((project) => project.id === id))
    return "working" as const;
  const technology = TECHNOLOGIES.find((item) => item.id === id);
  return technology?.requires.every((requirement) =>
    c.tech.includes(requirement),
  )
    ? ("available" as const)
    : ("locked" as const);
}

/** Stable columns follow prerequisites; cross-category dependencies retain rank. */
export function researchPositions(ids: readonly string[]) {
  const depths = new Map<string, number>();
  const depth = (id: string): number => {
    if (depths.has(id)) return depths.get(id)!;
    const requires =
      TECHNOLOGIES.find((item) => item.id === id)?.requires ?? [];
    const value = requires.length ? 1 + Math.max(...requires.map(depth)) : 0;
    depths.set(id, value);
    return value;
  };
  const rows = new Map<number, number>();
  const minimum = ids.length ? Math.min(...ids.map(depth)) : 0;
  return ids.map((id) => {
    const column = depth(id) - minimum;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { id, x: 14 + column * 184, y: 14 + row * 112 };
  });
}
