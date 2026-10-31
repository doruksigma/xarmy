"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const nav = [
  { href: "/", label: "Ana sayfa" },
  { href: "/play", label: "Battle Royale" },
  { href: "/games/europa-war", label: "Europa War" },
  { href: "/games/chess", label: "Satranç" },
  { href: "/games/color-hide", label: "Color Hide" },
  { href: "/leaderboard", label: "Sıralama" },
];

export default function Navbar() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  function links(mobile = false) {
    return nav.map((item) => {
      const active =
        item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={`${mobile ? "px-4 py-3 text-sm" : "px-3 py-2 text-xs"} rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-200 ${active ? "bg-emerald-300/10 text-emerald-100" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
        >
          {item.label}
        </Link>
      );
    });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-200"
          aria-label="XARMY Arena ana sayfa"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200/20 bg-emerald-100/5 text-xl font-black text-emerald-100">
            X
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-wide text-slate-100">
              XARMY <span className="font-normal text-slate-400">ARENA</span>
            </span>
            <span className="block text-[9px] tracking-[.18em] text-slate-500">
              OYUN SENİN
            </span>
          </span>
        </Link>
        <nav
          className="hidden items-center gap-0.5 lg:flex"
          aria-label="Ana gezinme"
        >
          {links()}
        </nav>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-game-navigation"
          aria-label={open ? "Oyun menüsünü kapat" : "Oyun menüsünü aç"}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-slate-700 px-3 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-200 lg:hidden"
        >
          Oyunlar{" "}
          <span aria-hidden="true" className="text-lg">
            {open ? "×" : "☰"}
          </span>
        </button>
      </div>
      <nav
        id="mobile-game-navigation"
        hidden={!open}
        className={`${open ? "grid" : "hidden"} mx-auto max-w-6xl grid-cols-2 gap-1 border-t border-slate-800 px-4 py-3 lg:!hidden`}
        aria-label="Mobil oyun menüsü"
      >
        {links(true)}
      </nav>
    </header>
  );
}
