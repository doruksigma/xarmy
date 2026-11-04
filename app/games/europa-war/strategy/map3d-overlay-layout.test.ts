import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOverlayLabelLayout,
  type OverlayLabelBox,
} from "./map3d-overlay-layout";

function overlap(a: OverlayLabelBox, b: OverlayLabelBox) {
  return (
    a.x - a.width / 2 < b.x + b.width / 2 &&
    a.x + a.width / 2 > b.x - b.width / 2 &&
    a.y - a.height < b.y &&
    a.y > b.y - b.height
  );
}

test("army controls remain visible and selected/player-capital captions move clear of them", () => {
  const layout = createOverlayLabelLayout();
  layout.reset(800, 600);
  const army = layout.place({ x: 200, y: 200, width: 64, height: 50 }, "army")!;
  const selected = layout.place(
    { x: 200, y: 200, width: 90, height: 22 },
    "pinned",
  )!;
  const playerCapital = layout.place(
    { x: 205, y: 202, width: 100, height: 22 },
    "pinned",
  )!;
  assert.ok(army && selected && playerCapital);
  assert.equal(overlap(army, selected), false);
  assert.equal(overlap(army, playerCapital), false);
  assert.equal(overlap(selected, playerCapital), false);
  assert.equal(
    layout.place({ x: 204, y: 201, width: 84, height: 22 }, "ordinary"),
    null,
  );
  assert.ok(
    layout.place({ x: 200, y: 200, width: 64, height: 50 }, "army"),
    "Other armies are never hidden by decorative captions",
  );
});

test("crowded world capitals are decluttered deterministically and reappear at regional zoom", () => {
  const layout = createOverlayLabelLayout();
  const capitals = [0, 1, 2, 3].map((index) => ({
    x: 180 + index * 10,
    y: 200,
    width: 80,
    height: 22,
  }));
  const place = (spread: number) => {
    layout.reset(800, 600);
    return capitals.map((capital, index) =>
      layout.place({ ...capital, x: 180 + index * spread }, "ordinary"),
    );
  };
  const world = place(10);
  assert.equal(world.filter(Boolean).length, 1);
  assert.deepEqual(place(10), world);
  const regional = place(130);
  assert.equal(regional.filter(Boolean).length, capitals.length);
  for (let index = 1; index < regional.length; index++)
    assert.equal(overlap(regional[index - 1]!, regional[index]!), false);
});

test("new frames clear occupancy and offscreen/invalid labels never block visible captions", () => {
  const layout = createOverlayLabelLayout();
  layout.reset(390, 500);
  assert.equal(
    layout.place({ x: Infinity, y: 100, width: 90, height: 22 }, "ordinary"),
    null,
  );
  assert.equal(
    layout.place({ x: -200, y: 100, width: 90, height: 22 }, "army"),
    null,
  );
  const label = { x: 100, y: 100, width: 90, height: 22 };
  assert.ok(layout.place(label, "ordinary"));
  assert.equal(layout.place(label, "ordinary"), null);
  layout.reset(390, 500);
  assert.ok(layout.place(label, "ordinary"));
  assert.ok(
    layout.place({ x: 15, y: 20, width: 90, height: 22 }, "pinned"),
    "Selected border cities stay available",
  );
});
