import Link from "next/link";
 
export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col justify-center">
      {/* HERO */}
      <section className="text-center space-y-6">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
          <span className="text-indigo-400">XARMY</span>
          <br />
          <span className="text-slate-100">Game Arena</span>
        </h1>

        <p className="max-w-2xl mx-auto text-slate-400 text-lg">
          Hız, zeka ve refleks odaklı mini oyunlar.
          Skorunu yükselt, sıralamaya gir, lider ol.
        </p>

        {/* CTA BUTTONS */}
        <div className="flex justify-center flex-wrap gap-4">
          <Link
            href="/play"
            className="px-7 py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition"
          >
            🚀 3D Arena’ya Gir
          </Link>

          <Link
            href="/games"
            className="px-6 py-3 rounded-xl bg-slate-800 text-slate-100 hover:bg-slate-700 transition"
          >
            🎮 Oyunlar
          </Link>

          {/* ✅ CHESS BUTTON */}
          <Link
            href="/games/chess"
            className="px-7 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition flex items-center gap-2"
          >
            ♟️ Satranç
            <span className="text-[10px] bg-black/20 px-2 py-1 rounded-lg">
              Stockfish
            </span>
          </Link>

          <Link
            href="/leaderboard"
            className="px-6 py-3 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
          >
           <Link
  href="/games/europa-war"
  className="px-7 py-3 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 transition flex items-center gap-2"
>
  🌍 Europa War
  <span className="text-[10px] bg-black/20 px-2 py-1 rounded-lg">
    Strategy
  </span>
</Link>
            🏆 Skor Tablosu
          </Link>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mt-20 grid gap-6 md:grid-cols-3">
        <Feature
          title="⚡ Hızlı Oyunlar"
          desc="Kısa sürede oynanabilen, refleks ve dikkat geliştiren mini oyunlar."
        />
        <Feature
          title="🧠 Zeka & Strateji"
          desc="Sadece hız değil, doğru karar ve mantık da kazandırır."
        />
        <Feature
          title="🏆 Rekabet"
          desc="Skorunu kaydet, diğer oyuncularla yarış, zirveye çık."
        />
      </section>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 text-slate-400 text-sm">{desc}</p>
    </div>
  );
}
