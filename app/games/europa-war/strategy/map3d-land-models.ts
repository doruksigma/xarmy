import * as THREE from "three";
import { createVehicleModelGeometries } from "./map3d-vehicle-models";
import {
  infantryBody,
  infantryLeg,
  infantryDetails,
  infantryHead,
  infantryHeadDetails,
} from "./map3d-infantry-model";
import {
  ModelBuilder,
  type LandModelTier,
  LEATHER,
  STEEL,
} from "./map3d-model-builder";
export { INFANTRY_NECK_PIVOT, type LandModelTier } from "./map3d-model-builder";

function supplyCrate() {
  const m = new ModelBuilder([0.9, 0]);
  m.softBox([0.8, 0.56, 0.65], [0, 0, 0], 0xa88b59, 0.045);
  for (const x of [-0.28, 0.28]) m.box([0.07, 0.6, 0.7], [x, 0, 0], LEATHER);
  m.box([0.27, 0.1, 0.02], [0, 0.03, 0.34], 0xe2d9ae);
  return m.build();
}
function flagPole() {
  const m = new ModelBuilder(STEEL);
  m.cylinder(0.045, 4.7, [0, 2.35, 0], 0xb5ac89, [0, 0, 0], 6);
  m.sphere(0.1, [0, 4.75, 0], 0xd5b96b);
  return m.build();
}

/** The first thirteen slots retain their historical animation indices. Head
 * parts append slots13/14; every caller owns all returned geometry buffers. */
export function createLandModelGeometries(
  tier: LandModelTier = 0,
): THREE.BufferGeometry[] {
  const vehicles = createVehicleModelGeometries(tier);
  const parts = [
    ["infantry-body", () => infantryBody(tier)],
    ["infantry-legs", () => infantryLeg(tier)],
    ["tank-hull", () => vehicles.tankHull],
    ["truck-body", () => vehicles.truckBody],
    ["artillery-base", () => vehicles.artilleryBase],
    ["infantry-details", () => infantryDetails(tier)],
    ["tank-turret", () => vehicles.tankTurret],
    ["tank-barrel", () => vehicles.tankBarrel],
    ["artillery-barrel", () => vehicles.artilleryBarrel],
    ["vehicle-wheels", () => vehicles.wheels],
    ["tank-treads", () => vehicles.tracks],
    ["support-crates", supplyCrate],
    ["capture-poles", flagPole],
    ["infantry-head", () => infantryHead(tier)],
    ["infantry-head-details", () => infantryHeadDetails(tier)],
  ] as const;
  return parts.map(([name, build]) => {
    const geometry = build();
    geometry.name = name;
    return geometry;
  });
}
