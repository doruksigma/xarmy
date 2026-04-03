"use client";

import { useState } from "react";
import WorldSelectMap from "./components/WorldSelectMap";
import { countries } from "./data/countries";
import type { Country } from "./lib/gameTypes";

export default function EuropaWarClient() {
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);

  return (
    <main className="min-h-[calc(100vh-120px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {!selectedCountry ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-300">
              🌍 Europa War
            </h1>
            <p className="mt-3 text-slate-400 max-w-3xl">
              Oyuna başlamadan önce bir ülke seç. İlk sürümde Avrupa’daki
              temel ülkelerden birini seçip ekonomi, teknoloji ve savaş sistemiyle oynayacaksın.
            </p>

            <div className="mt-8">
              <WorldSelectMap
                countries={countries}
                onSelect={(country) => setSelectedCountry(country)}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-2xl font-bold text-emerald-300">
              Seçilen Ülke: {selectedCountry.name}
            </h2>
            <p className="mt-2 text-slate-400">
              Şimdi sıradaki adımda şehirler, harita, para, asker üretimi ve zaman sistemi eklenecek.
            </p>

            <button
              onClick={() => setSelectedCountry(null)}
              className="mt-6 rounded-xl bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            >
              Ülke seçimine geri dön
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
