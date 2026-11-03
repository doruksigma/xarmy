/** Original path data shared by React panels, SVG maps and imperative 3D labels. */
export const MILITARY_MAP_PATHS = {
  infantry: "M3 5h18v14H3ZM4 6l16 12M20 6 4 18M9 2v2m6-2v2",
  tank: "M2 5h20v14H2ZM9 9h6a3 3 0 0 1 0 6H9a3 3 0 0 1 0-6ZM9 2v2m6-2v2",
  artillery: "M3 5h18v14H3ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0M9 2v2m6-2v2",
  truck:
    "M2 7h12v10H2ZM14 10h4l4 4v3h-8m4-7v4h4M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0m12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0M4 4h8",
  capital:
    "m12 2 2.9 6.2 6.8.9-5 4.7 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.7 6.8-.9Z",
} as const;
export type MilitaryMapSymbol = keyof typeof MILITARY_MAP_PATHS;

/** Called only when a renderer creates its DOM labels; no per-frame SVG work. */
export function createMilitaryMapIcon(
  name: MilitaryMapSymbol,
  size = 18,
): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("data-military-icon", name);
  svg.style.pointerEvents = "none";
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", MILITARY_MAP_PATHS[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
