import assert from "node:assert/strict";
import test from "node:test";
import type { Focus } from "./catalog";
import {
  FOCUS_NODE_HEIGHT,
  FOCUS_NODE_WIDTH,
  focusGraphContext,
  layoutFocusGraph,
  visibleFocusNodes,
} from "./focus-graph";

const focus = (
  id: string,
  requires: string[] = [],
  branch = "Sanayi",
): Focus => ({
  id,
  requires,
  branch,
  name: id,
  description: id,
  days: 35,
  effect: "civil",
});

test("focus graph preserves forks, merges and cross-branch prerequisites", () => {
  const source = [
    focus("root"),
    focus("rail", ["root"]),
    focus("science", ["root"]),
    focus("factory", ["rail", "science"]),
    focus("army", ["factory"], "Ordu"),
  ];
  const graph = layoutFocusGraph(source);
  assert.equal(graph.nodes.length, source.length);
  assert.equal(graph.branches.length, 2);
  assert.deepEqual(
    new Set(graph.edges.map((edge) => `${edge.from}>${edge.to}`)),
    new Set([
      "root>rail",
      "root>science",
      "rail>factory",
      "science>factory",
      "factory>army",
    ]),
  );
  for (const edge of graph.edges) {
    const from = graph.nodes.find((node) => node.focus.id === edge.from)!;
    const to = graph.nodes.find((node) => node.focus.id === edge.to)!;
    assert.ok(to.y > from.y + FOCUS_NODE_HEIGHT);
    assert.match(edge.path, /^M[\d.,]+V[\d.]+H[\d.]+V[\d.]+$/);
  }
  for (const a of graph.nodes)
    for (const b of graph.nodes) {
      if (a === b) continue;
      assert.ok(
        a.x + FOCUS_NODE_WIDTH <= b.x ||
          b.x + FOCUS_NODE_WIDTH <= a.x ||
          a.y + FOCUS_NODE_HEIGHT <= b.y ||
          b.y + FOCUS_NODE_HEIGHT <= a.y,
      );
    }
});

test("search keeps each real ancestor without inventing missing or unrelated dependencies", () => {
  const source = [
    focus("root"),
    focus("rail", ["root"]),
    focus("factory", ["rail", "foreign-focus"]),
    focus("unrelated"),
  ];
  assert.deepEqual(
    focusGraphContext([source[2]], source).map((entry) => entry.id),
    ["root", "rail", "factory"],
  );
  assert.deepEqual(focusGraphContext([], source), []);
  assert.equal(
    layoutFocusGraph(focusGraphContext([source[2]], source)).edges.length,
    2,
  );
});

test("offscreen national branches are culled while the selected node remains available", () => {
  const source = Array.from({ length: 200 }, (_, index) =>
    focus(
      `f-${index}`,
      index % 10 ? [`f-${index - 1}`] : [],
      `Dal ${Math.floor(index / 10)}`,
    ),
  );
  const graph = layoutFocusGraph(source);
  const visible = visibleFocusNodes(
    graph.nodes,
    { left: 0, top: 0, width: 600, height: 400 },
    "f-199",
  );
  assert.ok(visible.length < 30);
  assert.ok(visible.some((node) => node.focus.id === "f-199"));
  assert.ok(!visible.some((node) => node.focus.id === "f-150"));
  const last = graph.nodes.find((node) => node.focus.id === "f-199")!;
  assert.ok(
    visibleFocusNodes(graph.nodes, {
      left: last.x,
      top: last.y,
      width: 300,
      height: 300,
    }).some((node) => node.focus.id === "f-199"),
  );
});

test("empty, missing and malformed cyclic dependencies remain finite without mutating the catalog", () => {
  const a = focus("a", ["b"]),
    b = focus("b", ["a"]);
  const source = [a, b, focus("c", ["unknown"])];
  const before = JSON.stringify(source);
  const graph = layoutFocusGraph(source);
  assert.equal(graph.nodes.length, 3);
  assert.ok(Number.isFinite(graph.width) && Number.isFinite(graph.height));
  assert.equal(JSON.stringify(source), before);
  assert.equal(layoutFocusGraph([]).nodes.length, 0);
  assert.equal(focusGraphContext([a], source).length, 2);
});
