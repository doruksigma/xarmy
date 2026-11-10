import { SEA_ZONES } from "./advanced-catalog";
import type { SeaZone } from "./types";

/** Presentation only: the simulation assigns a sea basin, not a ship track.
 * The complete patrol disk plus the largest hull/wake fits inside open water
 * in the shipped geographic polygons. Regression tests verify edge distances,
 * so no coastline scans or collision work are needed in the render loop. */
export const NAVAL_PRESENTATION: Record<
  SeaZone,
  { separation: number; radius: number; scale: number }
> = {
  atlantic: { separation: 8, radius: 22, scale: 1 },
  north: { separation: 6, radius: 14, scale: 1 },
  baltic: { separation: 3, radius: 5, scale: 0.5 },
  mediterranean: { separation: 8, radius: 18, scale: 1 },
  black: { separation: 5, radius: 7, scale: 0.85 },
  southAtlantic: { separation: 8, radius: 22, scale: 1 },
  northPacific: { separation: 8, radius: 22, scale: 1 },
  southPacific: { separation: 8, radius: 22, scale: 1 },
  indian: { separation: 8, radius: 22, scale: 1 },
  caribbean: { separation: 5, radius: 8, scale: 0.55 },
  arctic: { separation: 8, radius: 18, scale: 0.85 },
};

// Includes all hulls, the battleship size multiplier, roll, and wake extent.
export const NAVAL_FOOTPRINT_RADIUS = 31;
export const NAVAL_MODEL_SCALE = 0.32;

export interface NavalFormationSlot {
  x: number;
  y: number;
  scale: number;
  patrolRadius: number;
}

/** Build once per fleet snapshot. Separate complete hull/wake envelopes, then
 * shrink dense fleets together to stay inside the already verified water disk. */
export function navalFormationLayout(
  zone: SeaZone,
  count: number,
): NavalFormationSlot[] {
  if (count <= 0) return [];
  const presentation = NAVAL_PRESENTATION[zone];
  const columns = Math.ceil(Math.sqrt(count)),
    rows = Math.ceil(count / columns);
  const footprint =
    NAVAL_FOOTPRINT_RADIUS * presentation.scale * NAVAL_MODEL_SCALE;
  const spacing = footprint * 2.5,
    patrolRadius = footprint * 0.1;
  const gridRadius = Math.hypot(
    ((columns - 1) * spacing) / 2,
    ((rows - 1) * spacing) / 2,
  );
  const waterRadius =
    presentation.separation +
    presentation.radius +
    NAVAL_FOOTPRINT_RADIUS * presentation.scale;
  const scale = Math.min(
    1,
    waterRadius / (gridRadius + footprint + patrolRadius),
  );
  return Array.from({ length: count }, (_, index) => ({
    x: ((index % columns) - (columns - 1) / 2) * spacing * scale,
    y: (Math.floor(index / columns) - (rows - 1) / 2) * spacing * scale,
    scale,
    patrolRadius: patrolRadius * scale,
  }));
}

export function navalPatrolPose(
  zone: SeaZone,
  slot: NavalFormationSlot,
  phase: number,
  active: boolean,
) {
  const basin = SEA_ZONES[zone],
    radius = active ? slot.patrolRadius : 0;
  return {
    x: basin.x + slot.x + Math.cos(phase) * radius,
    y: basin.y + slot.y + Math.sin(phase) * radius,
    // Forward is -Z; face the ellipse tangent rather than sliding sideways.
    angle: active ? Math.atan2(Math.sin(phase), -Math.cos(phase)) : 0.2,
  };
}
