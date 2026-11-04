/** Presentation-only world framing. Distances remain in the map's unit scale. */
export function fitMapDistance(
  width: number,
  height: number,
  aspect: number,
  verticalFieldOfView = 42,
) {
  const ratio = Math.max(0.25, Math.min(5, aspect || 1));
  const tangent = Math.tan((verticalFieldOfView * Math.PI) / 360);
  // Allow room for the tilted far edge without clipping the nearest coastline.
  return (Math.max(height, width / ratio) / (2 * tangent)) * 1.25;
}

export function mapCameraFar(width: number, height: number) {
  return Math.max(6000, Math.hypot(width, height) * 12);
}

/** Fixed texture memory even when the strategic map becomes much larger. */
export function terrainAtlasSize(width: number, height: number) {
  const scale = Math.min(2, 4096 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
