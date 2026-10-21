"use client";
import { useEffect, useState } from "react";

export function useOfflinePack() {
  const [status, setStatus] = useState("Sefer bu cihazda çalışır.");
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    let disposed = false;
    const update = (s: string) => {
      if (!disposed) setStatus(s);
    };
    update("Çevrimdışı oyun paketi hazırlanıyor…");
    const receive = (e: MessageEvent) => {
      if (e.data?.type === "EUROPA_READY")
        update("Çevrimdışı kullanıma hazır · bu cihaz");
      if (e.data?.type === "EUROPA_FAILED")
        update(
          "Sefer açıkken çevrimdışı oynanabilir. Yeniden açmak için paket henüz hazır değil.",
        );
    };
    navigator.serviceWorker.addEventListener("message", receive);
    async function prepare() {
      try {
        const registration = await navigator.serviceWorker.register(
          "/games/europa-war/sw.js",
          { scope: "/games/europa-war" },
        );
        await navigator.serviceWorker.ready;
        const assets = new Set<string>();
        for (const el of document.querySelectorAll<HTMLScriptElement>(
          "script[src]",
        ))
          assets.add(el.src);
        for (const el of document.querySelectorAll<HTMLLinkElement>(
          'link[rel="stylesheet"],link[rel="preload"]',
        ))
          assets.add(el.href);
        const local = [...assets].filter((url) => {
          const u = new URL(url, location.origin);
          return (
            u.origin === location.origin &&
            u.pathname.startsWith("/_next/static/")
          );
        });
        registration.active?.postMessage({
          type: "EUROPA_CACHE",
          assets: local,
        });
      } catch {
        update(
          "Çevrimdışı paket hazırlanamadı. Kayıt dosyanı cihazına indirebilirsin.",
        );
      }
    }
    prepare();
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("message", receive);
    };
  }, []);
  return status;
}
