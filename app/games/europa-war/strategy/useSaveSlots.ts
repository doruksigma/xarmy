"use client";
import { useEffect, useState } from "react";
import { SAVE_CHANGE_EVENT, type SaveSummary } from "./storage";
import { listBrowserSaves, SAVE_CHANNEL } from "./storage-browser";

/** Refresh the archive when storage changes, not on every simulation day. */
export function useSaveSlots(enabled = true) {
  const [slots, setSlots] = useState<SaveSummary[]>([]);
  useEffect(() => {
    // The setup screen's archive is hidden during play. Revalidating every
    // autosave there blocks map input even though none of its labels are shown.
    // Reopening the archive still reads and validates the current stored text.
    if (!enabled) return;
    let revision = 0;
    let active = true;
    const refresh = () => {
      const request = ++revision;
      void listBrowserSaves().then((next) => {
        // Reads can overlap when another tab commits a save. Only the newest
        // request may update the currently visible archive.
        if (active && request === revision) setSlots(next);
      });
    };
    const externalChange = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("xarmy-europa-1936-v1:"))
        refresh();
    };
    refresh();
    window.addEventListener(SAVE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", externalChange);
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel(SAVE_CHANNEL);
    } catch {
      // Some private contexts disable channels. Reopening/focusing the archive
      // still fetches and validates the latest database contents.
    }
    if (channel) channel.onmessage = refresh;
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(SAVE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", externalChange);
      window.removeEventListener("focus", refresh);
      channel?.close();
    };
  }, [enabled]);
  return slots;
}
