import Link from "next/link";

const nav = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/games", label: "Oyunlar" },
  { href: "/leaderboard", label: "Sıralama" }
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/70 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="group inline-flex items-center gap-2">
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60">
            <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition bg-indigo-500/15" />
            <span className="relative font-black text-indigo-300">X</span>
          </span>

          <div className="leading-tight">
            <div className="font-extrabold tracking-tight">
              <span className="text-indigo-300">XARMY</span>{" "}
              <span className="text-slate-200">Arena</span>
            </div>
            <div className="text-xs text-slate-400 -mt-0.5">
              mini games • scores • fun
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-xl text-sm text-slate-200 hover:bg-slate-900/60 hover:text-white transition"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-2">
          <Link
            href="/games"
            className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition"
          >
            Başla
          </Link>
        </div>
      </div>
    </header>
  );
}
