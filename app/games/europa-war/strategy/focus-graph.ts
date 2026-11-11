import type { Focus } from "./catalog";

export const FOCUS_NODE_WIDTH = 168;
export const FOCUS_NODE_HEIGHT = 118;
const COLUMN = 194;
const ROW = 164;
const TOP = 56;

export type FocusNodeState =
  | "available"
  | "locked"
  | "active"
  | "completed"
  | "excluded"
  | "pending"
  | "declined";
export interface FocusGraphNode {
  focus: Focus;
  x: number;
  y: number;
  depth: number;
}
export interface FocusGraphLayout {
  nodes: FocusGraphNode[];
  edges: { from: string; to: string; path: string }[];
  branches: { name: string; x: number; width: number }[];
  width: number;
  height: number;
}

/** Keep the real predecessor chain when search or a branch filter hides it. */
export function focusGraphContext(
  matches: readonly Focus[],
  all: readonly Focus[],
) {
  const lookup = new Map(all.map((focus) => [focus.id, focus]));
  const included = new Set<string>();
  const include = (focus: Focus) => {
    if (included.has(focus.id)) return;
    included.add(focus.id);
    for (const id of focus.requires) {
      const prerequisite = lookup.get(id);
      if (prerequisite) include(prerequisite);
    }
  };
  for (const focus of matches) include(focus);
  return all.filter((focus) => included.has(focus.id));
}

/** Layered DAG, grouped by actual focus branches; edges never invent a prerequisite. */
export function layoutFocusGraph(focuses: readonly Focus[]): FocusGraphLayout {
  const lookup = new Map(focuses.map((focus) => [focus.id, focus]));
  const depths = new Map<string, number>();
  const depth = (id: string, visiting = new Set<string>()): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    const focus = lookup.get(id);
    if (!focus) return 0;
    const next = new Set(visiting).add(id);
    const value = Math.max(
      0,
      ...focus.requires
        .filter((key) => lookup.has(key))
        .map((key) => 1 + depth(key, next)),
    );
    depths.set(id, value);
    return value;
  };
  for (const focus of focuses) depth(focus.id);
  const groups = new Map<string, Focus[]>();
  for (const focus of focuses) {
    const group = groups.get(focus.branch) ?? [];
    group.push(focus);
    groups.set(focus.branch, group);
  }
  const nodes: FocusGraphNode[] = [];
  const branches: FocusGraphLayout["branches"] = [];
  let offset = 24;
  for (const [name, group] of groups) {
    const rows = new Map<number, Focus[]>();
    for (const focus of group) {
      const row = depths.get(focus.id) ?? 0;
      rows.set(row, [...(rows.get(row) ?? []), focus]);
    }
    const columns = Math.max(1, ...[...rows.values()].map((row) => row.length));
    const width = columns * COLUMN;
    branches.push({ name, x: offset, width });
    for (const [row, entries] of rows) {
      const start = offset + (width - entries.length * COLUMN) / 2;
      entries.forEach((focus, index) =>
        nodes.push({
          focus,
          x: start + index * COLUMN,
          y: TOP + row * ROW,
          depth: row,
        }),
      );
    }
    offset += width + 30;
  }
  const positioned = new Map(nodes.map((node) => [node.focus.id, node]));
  const edges: FocusGraphLayout["edges"] = [];
  for (const node of nodes) {
    for (const id of node.focus.requires) {
      const parent = positioned.get(id);
      if (!parent) continue;
      const x1 = parent.x + FOCUS_NODE_WIDTH / 2;
      const y1 = parent.y + FOCUS_NODE_HEIGHT;
      const x2 = node.x + FOCUS_NODE_WIDTH / 2;
      const y2 = node.y;
      const middle = (y1 + y2) / 2;
      edges.push({
        from: id,
        to: node.focus.id,
        path: `M${x1},${y1}V${middle}H${x2}V${y2}`,
      });
    }
  }
  return {
    nodes,
    edges,
    branches,
    width: Math.max(360, offset - 6),
    height: Math.max(
      310,
      TOP + Math.max(0, ...depths.values()) * ROW + FOCUS_NODE_HEIGHT + 40,
    ),
  };
}

/** Only render nodes near the visible board; the catalogue still remains searchable. */
export function visibleFocusNodes(
  nodes: readonly FocusGraphNode[],
  viewport: { left: number; top: number; width: number; height: number },
  selected?: string | null,
) {
  const pad = 180;
  return nodes.filter(
    (node) =>
      node.focus.id === selected ||
      (node.x + FOCUS_NODE_WIDTH >= viewport.left - pad &&
        node.x <= viewport.left + viewport.width + pad &&
        node.y + FOCUS_NODE_HEIGHT >= viewport.top - pad &&
        node.y <= viewport.top + viewport.height + pad),
  );
}
