export default function Footer() {
  return (
    <footer className="border-t border-slate-800/70">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div className="text-sm text-slate-400">
          © {new Date().getFullYear()} <span className="text-slate-200 font-semibold">XARMY</span>
        </div>
        <div className="text-xs text-slate-500">
          Built with Next.js • Tailwind
        </div>
      </div>
    </footer>
  );
}
