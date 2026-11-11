import type { GraphicsQuality } from "./map3d-visuals";

export type MotionPreference = "system" | "full" | "reduced";
export interface PresentationSettings {
  map: "2d" | "3d";
  quality: GraphicsQuality;
  viewpoint: "strategic" | "perspective";
  motion: MotionPreference;
}
export const PRESENTATION_KEYS = {
  map: "xarmy-europa-map-view-v1",
  quality: "xarmy-europa-3d-quality-v1",
  viewpoint: "xarmy-europa-3d-view-v1",
  motion: "xarmy-europa-3d-motion-v1",
} as const;

/** Read the original per-setting keys so existing device preferences survive. */
export function presentationSettings(
  value: Partial<Record<keyof PresentationSettings, unknown>> = {},
  touch = false,
): PresentationSettings {
  return {
    map: value.map === "3d" ? "3d" : "2d",
    quality: ["low", "medium", "high", "ultra"].includes(String(value.quality))
      ? (value.quality as GraphicsQuality)
      : touch
        ? "low"
        : "medium",
    viewpoint: value.viewpoint === "perspective" ? "perspective" : "strategic",
    motion:
      value.motion === "full" || value.motion === "reduced"
        ? value.motion
        : "system",
  };
}
export function reducedAnimations(
  motion: MotionPreference,
  systemReduced: boolean,
) {
  return motion === "reduced" || (motion === "system" && systemReduced);
}
