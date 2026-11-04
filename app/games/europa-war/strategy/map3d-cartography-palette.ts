import map from "./map-data.json";

/** Original night-atlas colours. These are presentation values, never country
 * state: changing the map theme cannot alter a save, ownership or diplomacy. */
const EUROPE_NIGHT_COLORS: Readonly<Record<string, string>> = {
  turkey: "#77585f",
  germany: "#26323b",
  france: "#4b5b83",
  uk: "#6d4e60",
  italy: "#445d50",
  ussr: "#6c4d5a",
  poland: "#735b70",
  czechoslovakia: "#436375",
  yugoslavia: "#303e59",
  spain: "#776e60",
  portugal: "#535f43",
  romania: "#85806a",
  hungary: "#7c6061",
  bulgaria: "#575e43",
  greece: "#456476",
  albania: "#644b51",
  austria: "#85818a",
  switzerland: "#664a55",
  belgium: "#78764b",
  netherlands: "#7c665c",
  luxembourg: "#536563",
  denmark: "#69677d",
  norway: "#68717a",
  sweden: "#585a7b",
  finland: "#818590",
  estonia: "#4d627e",
  latvia: "#70617f",
  lithuania: "#7b795d",
  ireland: "#385a4f",
};

function subduedColor(fallback: string): string {
  const hex = /^#[\da-f]{6}$/i.test(fallback)
    ? fallback.slice(1)
    : /^#[\da-f]{3}$/i.test(fallback)
      ? [...fallback.slice(1)].map((digit) => digit + digit).join("")
      : "667382";
  const channels = [0, 2, 4].map((start) =>
    parseInt(hex.slice(start, start + 2), 16),
  );
  const grey = channels.reduce((sum, value) => sum + value, 0) / 3;
  return (
    "#" +
    channels
      .map((value) =>
        Math.round(value * 0.48 + grey * 0.16)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function hslColor(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(
      (lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1))) *
        255,
    )
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// Preserve the original European palette while giving every new polity a
// distinct subdued colour. Source data uses repeated regional colours, so a
// deterministic hue search separates neighbours without brighter land washes.
export const NIGHT_COUNTRY_COLORS: Readonly<Record<string, string>> = (() => {
  const colors: Record<string, string> = { ...EUROPE_NIGHT_COLORS };
  const neighbors = new Map<string, Set<string>>();
  const provinces = new Map(
    map.provinces.map((province) => [province.id, province]),
  );
  for (const province of map.provinces) {
    const countries = neighbors.get(province.country) ?? new Set<string>();
    for (const edge of province.neighbors) {
      const country = provinces.get(edge.id)?.country;
      if (country && country !== province.country) countries.add(country);
    }
    neighbors.set(province.country, countries);
  }
  const distance = (a: string, b: string) =>
    [1, 3, 5].reduce(
      (sum, channel) =>
        sum +
        (parseInt(a.slice(channel, channel + 2), 16) -
          parseInt(b.slice(channel, channel + 2), 16)) **
          2,
      0,
    );
  for (const country of map.countries) {
    if (Object.hasOwn(colors, country.id)) continue;
    const used = Object.values(colors);
    const adjacent = [...(neighbors.get(country.id) ?? [])]
      .map((id) => colors[id])
      .filter(Boolean);
    let seed = 2166136261;
    for (const letter of country.id)
      seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
    let best = subduedColor(country.color),
      bestScore = -Infinity;
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidate =
        attempt === 0
          ? best
          : hslColor(
              ((seed % 360) + attempt * 137.508) % 360,
              0.24 + ((seed >>> 8) % 12) / 100,
              0.29 + ((seed >>> 16) % 13) / 100,
            );
      if (used.includes(candidate)) continue;
      const score =
        Math.min(
          ...(adjacent.length ? adjacent : used).map((color) =>
            distance(candidate, color),
          ),
        ) +
        Math.min(...used.map((color) => distance(candidate, color))) * 0.1;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    colors[country.id] = best;
  }
  return Object.freeze(colors);
})();

/** Shared by SVG and WebGL so civil-war/new-country colours stay consistent. */
export function politicalCountryColor(
  countryId: string,
  fallback: string,
): string {
  return Object.hasOwn(NIGHT_COUNTRY_COLORS, countryId)
    ? NIGHT_COUNTRY_COLORS[countryId]
    : subduedColor(fallback);
}

/** Relief is illustrative, never measured DEM. */
export const CARTOGRAPHIC_TERRAINS = {
  plains: { index: 0, color: 0x4e5e58 },
  urban: { index: 1, color: 0x64646d },
  mountain: { index: 2, color: 0x747a87 },
  forest: { index: 3, color: 0x334c43 },
  marsh: { index: 4, color: 0x3b5c61 },
  desert: { index: 5, color: 0x82745d },
} as const;
