import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-slate-800/70">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="text-sm text-slate-400">
          © {new Date().getFullYear()} <span className="text-slate-200 font-semibold">XARMY</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <Link href="/englishmeter/privacy-policy" className="hover:text-teal-300 underline underline-offset-4">
            EnglishMeter Gizlilik Politikası
          </Link>
          <span>Built with Next.js • Tailwind</span>
        </div>
      </div>
    </footer>
  );
}
