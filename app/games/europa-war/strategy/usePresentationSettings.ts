"use client";
import { useCallback, useEffect, useState } from "react";
import {
  PRESENTATION_KEYS,
  presentationSettings,
  reducedAnimations,
  type PresentationSettings,
} from "./presentation-settings";

export function usePresentationSettings() {
  const [settings, setSettings] = useState<PresentationSettings>(() =>
    presentationSettings(),
  );
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setSystemReduced(media.matches);
    updateMotion();
    const restore = () => {
      const values: Partial<Record<keyof PresentationSettings, string | null>> =
        {};
      try {
        for (const key of Object.keys(
          PRESENTATION_KEYS,
        ) as (keyof PresentationSettings)[])
          values[key] = localStorage.getItem(PRESENTATION_KEYS[key]);
      } catch {
        /* Device preferences are optional. */
      }
      setSettings(
        presentationSettings(
          values,
          window.matchMedia("(pointer: coarse)").matches,
        ),
      );
    };
    restore();
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        Object.values(PRESENTATION_KEYS).some((key) => key === event.key)
      )
        restore();
    };
    media.addEventListener("change", updateMotion);
    window.addEventListener("storage", storageChanged);
    return () => {
      media.removeEventListener("change", updateMotion);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  const change = useCallback((patch: Partial<PresentationSettings>) => {
    setSettings((previous) => presentationSettings({ ...previous, ...patch }));
    try {
      for (const key of Object.keys(patch) as (keyof PresentationSettings)[])
        if (patch[key] !== undefined)
          localStorage.setItem(PRESENTATION_KEYS[key], String(patch[key]));
    } catch {
      /* Rendering remains usable without local storage. */
    }
  }, []);
  return {
    settings,
    change,
    reduced: reducedAnimations(settings.motion, systemReduced),
  };
}
