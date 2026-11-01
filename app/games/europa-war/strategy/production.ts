import { EQUIPMENT } from "./catalog";
import { ECONOMIES, PRODUCTION_BALANCE } from "./economy-balance";
import { capacity } from "./world";
import type { Country, Equipment, Resource, World } from "./types";

export interface ProductionStep {
  equipment: Equipment;
  allocatedFactories: number;
  /** Effective capacity may be fractional after occupation or building damage. */
  activeFactories: number;
  work: number;
  completed: number;
  progress: number;
  cost: number;
  inputs: Partial<Record<Resource, number>>;
  blocked: "paused" | "capacity" | "resources" | "storage" | null;
}

/** Pure, priority-ordered allocation shared by the production UI and simulation.
 * Work already carried by a line has already consumed its material inputs.
 * Forecasts use currently available stock, before tomorrow's extraction/trade. */
export function productionPlan(w: World, c: Country): ProductionStep[] {
  const stock = { ...c.stock };
  let military = Math.max(0, capacity(w, c.id, "military"));
  let docks = Math.max(0, capacity(w, c.id, "dock"));
  const output =
    ECONOMIES[c.economy].output *
    (c.advisor === "industry" ? 1.1 : 1) *
    (c.cabinet.economy === "producer" ? 1.12 : 1) *
    (1 +
      (c.tech.includes("industry1") ? 0.15 : 0) +
      (c.tech.includes("industry2") ? 0.2 : 0));
  return c.production.map((line) => {
    const def = EQUIPMENT[line.equipment];
    const factories = Math.min(line.factories, def.naval ? docks : military);
    if (def.naval) docks -= factories;
    else military -= factories;
    const carry = line.progress ?? 0;
    // Existing saves can contain fractional inventory. Keep its value, and
    // only start work that can finish an entire new item inside the stock cap.
    const slots = Math.max(
      0,
      Math.floor(
        PRODUCTION_BALANCE.equipmentStockLimit - c.equipment[line.equipment],
      ),
    );
    const remainingCapacity = Math.max(0, slots * def.cost - carry);
    let work = Math.min(
      factories *
        PRODUCTION_BALANCE.workPerFactoryDay *
        line.efficiency *
        output,
      remainingCapacity,
    );
    for (const [resource, perItem] of Object.entries(def.inputs))
      work = Math.min(work, (stock[resource as Resource] / perItem) * def.cost);
    work = Math.max(0, work);
    const inputs: Partial<Record<Resource, number>> = {};
    for (const [resource, perItem] of Object.entries(def.inputs)) {
      const key = resource as Resource;
      inputs[key] = (work / def.cost) * perItem;
      stock[key] = Math.max(0, stock[key] - inputs[key]!);
    }
    const total = carry + work;
    const completed =
      work > 0
        ? Math.min(
            slots,
            Math.floor(
              (total + PRODUCTION_BALANCE.roundingTolerance) / def.cost,
            ),
          )
        : 0;
    const progress = Math.max(0, total - completed * def.cost);
    return {
      equipment: line.equipment,
      allocatedFactories: line.factories,
      activeFactories: factories,
      work,
      completed,
      progress,
      cost: def.cost,
      inputs,
      blocked: !line.factories
        ? "paused"
        : !factories
          ? "capacity"
          : !remainingCapacity
            ? "storage"
            : !work
              ? "resources"
              : null,
    };
  });
}

export function applyProduction(w: World, c: Country): ProductionStep[] {
  const plan = productionPlan(w, c);
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const line = c.production[i];
    for (const [resource, used] of Object.entries(step.inputs))
      c.stock[resource as Resource] = Math.max(
        0,
        c.stock[resource as Resource] - used,
      );
    c.equipment[step.equipment] += step.completed;
    line.progress = step.progress;
    if (step.work > 0)
      line.efficiency = Math.min(
        PRODUCTION_BALANCE.maximumEfficiency,
        line.efficiency + PRODUCTION_BALANCE.dailyEfficiencyGain,
      );
  }
  return plan;
}
