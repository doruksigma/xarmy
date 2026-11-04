export interface OverlayLabelBox {
  /** Pixel anchor: horizontal centre and bottom edge of the label. */
  x: number;
  y: number;
  width: number;
  height: number;
}

const CELL = 64;
const PADDING = 4;

/** A frame-local occupancy grid. Metadata/priority is cached by the renderer;
 * this only handles projected pixel rectangles and never measures the DOM. */
export function createOverlayLabelLayout() {
  const cells = new Map<number, OverlayLabelBox[]>();
  let width = 1,
    height = 1,
    columns = 1;
  const bounds = (box: OverlayLabelBox) => ({
    left: box.x - box.width / 2 - PADDING,
    right: box.x + box.width / 2 + PADDING,
    top: box.y - box.height - PADDING,
    bottom: box.y + PADDING,
  });
  const keys = (box: OverlayLabelBox) => {
    const b = bounds(box),
      result: number[] = [];
    for (
      let row = Math.max(0, Math.floor(b.top / CELL));
      row <= Math.min(Math.floor(height / CELL), Math.floor(b.bottom / CELL));
      row++
    )
      for (
        let column = Math.max(0, Math.floor(b.left / CELL));
        column <= Math.min(columns - 1, Math.floor(b.right / CELL));
        column++
      )
        result.push(row * columns + column);
    return result;
  };
  const overlaps = (box: OverlayLabelBox) => {
    const a = bounds(box);
    for (const key of keys(box))
      for (const other of cells.get(key) ?? []) {
        const b = bounds(other);
        if (
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top
        )
          return true;
      }
    return false;
  };
  const reserve = (box: OverlayLabelBox) => {
    for (const key of keys(box)) {
      const entries = cells.get(key) ?? [];
      entries.push(box);
      cells.set(key, entries);
    }
    return box;
  };
  return {
    reset(viewWidth: number, viewHeight: number) {
      width = Math.max(1, viewWidth);
      height = Math.max(1, viewHeight);
      columns = Math.ceil(width / CELL) + 1;
      cells.clear();
    },
    place(box: OverlayLabelBox, priority: "army" | "pinned" | "ordinary") {
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite))
        return null;
      if (
        box.x + box.width / 2 < 0 ||
        box.x - box.width / 2 > width ||
        box.y < 0 ||
        box.y - box.height > height
      )
        return null;
      // Army buttons are gameplay controls and must never disappear because a
      // decorative place name shares their projected position.
      if (priority === "army") return reserve(box);
      const offsets =
        priority === "pinned"
          ? [
              [0, 0],
              [0, box.height + 10],
              [box.width / 2 + 42, 0],
              [-box.width / 2 - 42, 0],
              [0, -60],
            ]
          : [[0, 0]];
      for (const [dx, dy] of offsets) {
        const candidate = { ...box, x: box.x + dx, y: box.y + dy };
        if (
          candidate.x - candidate.width / 2 < 0 ||
          candidate.x + candidate.width / 2 > width ||
          candidate.y - candidate.height < 0 ||
          candidate.y > height
        )
          continue;
        if (!overlaps(candidate)) return reserve(candidate);
      }
      // Keep the selected city and player's capital available even at an edge.
      return priority === "pinned" ? reserve(box) : null;
    },
  };
}
