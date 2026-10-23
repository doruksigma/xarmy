import geography from "./map-data.json";
import type { World } from "./types";

export const MINIMAP_COLORS = [
  "#b4c29b", // Player-controlled territory.
  "#a47564", // Enemy-controlled territory.
  "#8caeb2", // Allied territory.
  "#617567", // Other territory.
] as const;
export const MINIMAP_WIDTH = 144;
export const MINIMAP_HEIGHT = 96;

/** Only changes that affect the miniature's pixels invalidate its backdrop. */
export function minimapSignature(world: World) {
  const player = world.countries[world.player];
  const enemies = new Set(player.wars),
    allies = new Set(player.allies);
  return geography.provinces
    .map(({ id }) => {
      const controller = world.provinces[id].controller;
      return controller === world.player
        ? "0"
        : enemies.has(controller)
          ? "1"
          : allies.has(controller)
            ? "2"
            : "3";
    })
    .join("");
}

export function minimapPixelRatio(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(4, value)) : 1;
}

// Geography is immutable. Keep one set of paths and only the latest bitmap,
// rather than retaining images for every simulation day or campaign.
let paths: Path2D[] | null = null;
let latest: { key: string; url: string } | null = null;

/** Local Canvas rendering also works offline; null keeps the SVG fallback. */
export function minimapBitmap(signature: string, deviceRatio: number) {
  if (typeof document === "undefined" || typeof Path2D === "undefined")
    return null;
  const ratio = minimapPixelRatio(deviceRatio);
  const width = Math.ceil(MINIMAP_WIDTH * ratio),
    height = Math.ceil(MINIMAP_HEIGHT * ratio),
    key = `${width}:${height}:${signature}`;
  if (latest?.key === key) return latest.url;
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    paths ??= geography.provinces.map((province) => new Path2D(province.path));
    context.scale(width / geography.width, height / geography.height);
    context.fillStyle = "#18323a";
    context.fillRect(0, 0, geography.width, geography.height);
    context.strokeStyle = "#1e302d";
    context.lineWidth = 1;
    for (let index = 0; index < paths.length; index++) {
      const color = Number(signature[index]);
      context.fillStyle = MINIMAP_COLORS[color] ?? MINIMAP_COLORS[3];
      context.fill(paths[index], "evenodd");
      context.stroke(paths[index]);
    }
    const url = canvas.toDataURL("image/png");
    if (!url.startsWith("data:image/png")) return null;
    latest = { key, url };
    return url;
  } catch {
    // Some browsers or constrained devices refuse a canvas/context allocation.
    // The caller retains exactly the same interactive miniature as SVG paths.
    return null;
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
