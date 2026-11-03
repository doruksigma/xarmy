import * as THREE from "three";
import { createVehicleModelGeometry } from "./map3d-vehicle-models";
import type { NationalModelProfile } from "./map3d-national-profiles";
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

export const LAND_MODEL_PART_NAMES = [
  "infantry-body",
  "infantry-legs",
  "tank-hull",
  "truck-body",
  "artillery-base",
  "infantry-details",
  "tank-turret",
  "tank-barrel",
  "artillery-barrel",
  "vehicle-wheels",
  "tank-treads",
  "support-crates",
  "capture-poles",
  "infantry-head",
  "infantry-head-details",
] as const;

/** Build only the requested animated part. Each caller owns the returned buffers. */
export function createLandModelGeometry(
  part: number,
  tier: LandModelTier = 0,
  profile?: NationalModelProfile,
): THREE.BufferGeometry {
  if (profile?.id === "default") profile = undefined;
  const infantry = profile?.infantry;
  const builders = [
    () => infantryBody(tier, infantry),
    () => infantryLeg(tier, infantry),
    () => createVehicleModelGeometry("tankHull", tier, profile),
    () => createVehicleModelGeometry("truckBody", tier, profile),
    () => createVehicleModelGeometry("artilleryBase", tier, profile),
    () => infantryDetails(tier, infantry),
    () => createVehicleModelGeometry("tankTurret", tier, profile),
    () => createVehicleModelGeometry("tankBarrel", tier, profile),
    () => createVehicleModelGeometry("artilleryBarrel", tier, profile),
    () => createVehicleModelGeometry("wheels", tier, profile),
    () => createVehicleModelGeometry("tracks", tier, profile),
    supplyCrate,
    flagPole,
    () => infantryHead(tier, infantry),
    () => infantryHeadDetails(tier, infantry),
  ];
  const build = builders[part];
  if (!build) throw new RangeError(`Unknown land model part: ${part}`);
  const geometry = build();
  geometry.name = LAND_MODEL_PART_NAMES[part];
  return geometry;
}

/** The first thirteen slots retain their historical animation indices. Head
 * parts append slots 13/14; every caller owns all returned geometry buffers. */
export function createLandModelGeometries(
  tier: LandModelTier = 0,
  profile?: NationalModelProfile,
): THREE.BufferGeometry[] {
  return LAND_MODEL_PART_NAMES.map((_, part) =>
    createLandModelGeometry(part, tier, profile),
  );
}

/** Share only identical shapes. National colours stay in per-instance uniforms. */
export function landModelGeometryKey(
  part: number,
  tier: LandModelTier,
  profile?: NationalModelProfile,
): string {
  if (profile?.id === "default") profile = undefined;
  if (part >= 9 && part <= 12) return `${part}:shared`;
  if (part === 7 || part === 8) return `${part}:${tier}`;
  if (!profile) return `${part}:${tier}:default`;
  const infantry = profile.infantry;
  let shape: unknown;
  if (part === 0)
    shape = [
      infantry.tunic,
      infantry.collar,
      infantry.webbing,
      infantry.pack,
      infantry.coatLength,
      infantry.packWidth,
      infantry.headwear ?? "helmet",
      Boolean(infantry.scarf),
      infantry.scarf ? infantry.helmet : undefined,
      Boolean(infantry.chestCanister),
    ];
  else if (part === 1)
    shape = [infantry.tunic === "gymnastiorka", infantry.boots];
  else if (part === 5) shape = infantry.tunic;
  else if (part === 13 || part === 14)
    shape = [
      infantry.helmet,
      infantry.helmetWidth,
      infantry.headwear ?? "helmet",
      Boolean(infantry.scarf),
    ];
  else if (part === 2)
    shape = [
      profile.tank.hull,
      profile.tank.hullWidth,
      profile.tank.hullLength,
      profile.tank.skirt,
      tier >= 2 ? profile.tank.variant : undefined,
    ];
  else if (part === 6)
    shape = [
      profile.tank.turret,
      profile.tank.turretWidth,
      tier >= 2 ? profile.tank.variant : undefined,
    ];
  else if (part === 3)
    shape = [
      profile.truck.cab,
      profile.truck.hoodLength,
      profile.truck.cabHeight,
      profile.truck.bedLength,
      profile.truck.canvas,
      profile.truck.spare,
      tier >= 2 ? profile.truck.variant : undefined,
    ];
  else if (part === 4)
    shape = [
      profile.artillery.shield,
      profile.artillery.shieldWidth,
      profile.artillery.shieldHeight,
      profile.artillery.trailWidth,
      tier >= 2 ? profile.artillery.variant : undefined,
    ];
  return `${part}:${part === 1 || part === 13 || part === 14 ? 0 : tier}:${JSON.stringify(shape)}`;
}
