"use client";

export default function EuropaWarClient() {
  return (
    <main className="min-h-[calc(100vh-120px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-300">
            🌍 Europa War
          </h1>
          <p className="mt-3 text-slate-400 max-w-3xl">
            HOI4 benzeri, ülke seçmeli, şehir yönetimli, ekonomi ve savaş odaklı
            Avrupa strateji oyunu.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="font-bold text-slate-100">Ülke Seçimi</h2>
              <p className="mt-2 text-sm text-slate-400">
                Avrupa ülkelerini gör ve birini seç.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="font-bold text-slate-100">Ekonomi & Teknoloji</h2>
              <p className="mt-2 text-sm text-slate-400">
                Fabrika kur, para kazan, teknoloji geliştir.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="font-bold text-slate-100">Savaş & Diplomasi</h2>
              <p className="mt-2 text-sm text-slate-400">
                Birlik üret, şehirleri işgal et, ittifak kur.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
            İlk aşamada burada ülke seçim haritası görünecek.
          </div>
        </div>
      </div>
    </main>
  );
}
