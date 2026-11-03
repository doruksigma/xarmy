/** Original night-atlas colours. These are presentation values, never country
 * state: changing the map theme cannot alter a save, ownership or diplomacy. */
export const NIGHT_COUNTRY_COLORS: Readonly<Record<string, string>> = {
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

/** Shared by SVG and WebGL so civil-war/new-country colours stay consistent.
 * Only unknown IDs need the deterministic subdued fallback. */
export function politicalCountryColor(
  countryId: string,
  fallback: string,
): string {
  if (Object.hasOwn(NIGHT_COUNTRY_COLORS, countryId))
    return NIGHT_COUNTRY_COLORS[countryId];
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

/** Relief is illustrative, never measured DEM. */
export const CARTOGRAPHIC_TERRAINS = {
  plains: { index: 0, color: 0x4e5e58 },
  urban: { index: 1, color: 0x64646d },
  mountain: { index: 2, color: 0x747a87 },
  forest: { index: 3, color: 0x334c43 },
  marsh: { index: 4, color: 0x3b5c61 },
  desert: { index: 5, color: 0x82745d },
} as const;
