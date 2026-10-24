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
          Hız, zeka ve refleks odaklı mini oyunlar. Skorunu yükselt, sıralamaya
          gir, lider ol.
        </p>

        {/* CTA BUTTONS */}
        <div className="flex justify-center flex-wrap gap-4">
          <Link
            href="/play"
            className="px-7 py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition"
          >
            🪂 Battle Royale’a Atla
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
              Bot & Online
            </span>
          </Link>

          <Link
            href="/games/europa-war"
            className="px-7 py-3 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 transition flex items-center gap-2"
          >
            🌍 Europa War
            <span className="text-[10px] bg-black/20 px-2 py-1 rounded-lg">
              Strategy
            </span>
          </Link>
          <Link
            href="/leaderboard"
            className="px-6 py-3 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
          >
            🏆 Skor Tablosu
          </Link>
        </div>
      </section>

      <Link
        href="/games/color-hide"
        className="relative mt-12 overflow-hidden rounded-3xl border border-lime-300/30 bg-gradient-to-br from-emerald-950 via-green-950 to-slate-900 p-7 md:p-10 transition hover:border-lime-300/70 group"
      >
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[140px] text-lime-300/10 pointer-events-none"
          aria-hidden="true"
        >
          ♣
        </div>
        <span className="text-[10px] tracking-[.25em] font-bold text-lime-300">
          YENİ OYUN · 2–5 ARKADAŞ · ONLINE
        </span>
        <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-white">
          Color <span className="text-lime-300">Hide</span> 3D
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-100/70">
          Rengini seç, gözden kaybol. Ormanda, şehirde ve okulda arkadaşlarınla
          saklambaç oyna. Yakalanırsan ebe takımına katıl!
        </p>
        <span className="mt-5 inline-flex items-center gap-8 rounded-xl bg-lime-300 px-5 py-3 text-sm font-bold text-emerald-950 group-hover:bg-lime-200">
          Odaya gir <span aria-hidden="true">↗</span>
        </span>
      </Link>

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
