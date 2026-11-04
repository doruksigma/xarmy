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

// Includes the maximum battleship scale (1.25), roll, and wake extent.
export const NAVAL_FOOTPRINT_RADIUS = 31;

export function navalPatrolPose(
  zone: SeaZone,
  unitPhase: number,
  countryPhase: number,
  phase: number,
) {
  const basin = SEA_ZONES[zone],
    presentation = NAVAL_PRESENTATION[zone];
  const fleet = countryPhase * Math.PI * 2,
    radius = presentation.radius * (0.55 + unitPhase * 0.45);
  return {
    x:
      basin.x +
      Math.cos(fleet) * presentation.separation +
      Math.cos(phase) * radius,
    y:
      basin.y +
      Math.sin(fleet) * presentation.separation +
      Math.sin(phase) * radius * 0.65,
    // Forward is -Z; face the ellipse tangent rather than sliding sideways.
    angle: Math.atan2(Math.sin(phase), -Math.cos(phase) * 0.65),
  };
}
