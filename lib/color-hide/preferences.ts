export type ColorHidePreferences = {
  camera: "first" | "third";
  lowQuality: boolean;
  muted: boolean;
  sensitivity: number;
};

const KEY = "xarmy-color-hide-preferences-v1";

export function readPreferences(): ColorHidePreferences {
  const defaults: ColorHidePreferences = {
    camera: "third",
    lowQuality:
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
    muted: false,
    sensitivity: 1,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!value || typeof value !== "object") return defaults;
    const saved = value as Partial<ColorHidePreferences>;
    return {
      camera: saved.camera === "first" ? "first" : "third",
      lowQuality:
        typeof saved.lowQuality === "boolean"
          ? saved.lowQuality
          : defaults.lowQuality,
      muted: saved.muted === true,
      sensitivity:
        typeof saved.sensitivity === "number" &&
        Number.isFinite(saved.sensitivity)
          ? Math.min(2, Math.max(0.4, saved.sensitivity))
          : 1,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(value: ColorHidePreferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private browsing/storage limits do not prevent changing settings this round.
  }
}
