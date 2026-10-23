"use client";
import { useEffect, useState } from "react";
import { listSaves, SAVE_CHANGE_EVENT } from "./storage";

/** Refresh the archive when storage changes, not on every simulation day. */
export function useSaveSlots() {
  const [slots, setSlots] = useState<ReturnType<typeof listSaves>>([]);
  useEffect(() => {
    const refresh = () => setSlots(listSaves());
    const externalChange = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("xarmy-europa-1936-v1:"))
        refresh();
    };
    refresh();
    window.addEventListener(SAVE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", externalChange);
    return () => {
      window.removeEventListener(SAVE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", externalChange);
    };
  }, []);
  return slots;
}
