"use client";

import type { Country } from "../lib/gameTypes";

type Props = {
  countries: Country[];
  onSelect: (country: Country) => void;
};

export default function WorldSelectMap({ countries, onSelect }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {countries.map((country) => (
        <button
          key={country.id}
          onClick={() => onSelect(country)}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-left transition hover:scale-[1.02] hover:border-slate-600 hover:bg-slate-800"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{country.name}</h3>
            <span
              className="inline-block h-4 w-4 rounded-full"
              style={{ backgroundColor: country.color }}
            />
          </div>

          <div className="mt-4 space-y-1 text-sm text-slate-400">
            <p>Başlangıç Para: {country.treasury}</p>
            <p>Başlangıç Fabrika: {country.factories}</p>
          </div>

          <div className="mt-4 text-xs text-indigo-300">
            Bu ülkeyi seç
          </div>
        </button>
      ))}
    </div>
  );
}
