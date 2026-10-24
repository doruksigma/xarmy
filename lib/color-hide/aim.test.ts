import { test } from "node:test";
import assert from "node:assert/strict";
import { shotAim } from "./aim";
import type { MapObject, Vec3 } from "./types";
const direction = (from: Vec3, to: Vec3) => ({
  x: to.x - from.x,
  y: to.y - from.y,
  z: to.z - from.z,
});
const eyes = { x: 0, y: 1.42, z: 0 };
const camera = { x: 0.6, y: 1.9, z: 3.3 };
const rayPosition = (aim: { yaw: number; pitch: number }, z: number) => {
  const dz = -Math.cos(aim.yaw) * Math.cos(aim.pitch),
    travel = z / dz;
  return {
    x: -Math.sin(aim.yaw) * Math.cos(aim.pitch) * travel,
    y: eyes.y + Math.sin(aim.pitch) * travel,
    z,
  };
};

test("third-person close target under the reticle converges from server eyes", () => {
  const aim = shotAim(
    camera,
    direction(camera, { x: 0.4, y: 1, z: -4 }),
    eyes,
    [],
    [{ position: { x: 0.4, y: 0, z: -4 }, crouching: false }],
  );
  const at = rayPosition(aim, -3.64);
  assert.ok(at.x >= 0.04 && at.x <= 0.76, `ray x ${at.x}`);
  assert.ok(at.y >= 0 && at.y <= 1.65);
});
test("opaque cover wins over a hider behind it", () => {
  const wall: MapObject = {
    id: "wall",
    kind: "wall",
    x: 0.45,
    z: -1,
    width: 3,
    depth: 0.5,
    height: 3,
    color: "#eeeeee",
    solid: true,
  };
  const view = direction(camera, { x: 0.4, y: 1, z: -4 });
  const withTarget = shotAim(
    camera,
    view,
    eyes,
    [wall],
    [{ position: { x: 0.4, y: 0, z: -4 }, crouching: false }],
  );
  assert.deepEqual(withTarget, shotAim(camera, view, eyes, [wall], []));
  assert.notDeepEqual(
    withTarget,
    shotAim(
      camera,
      view,
      eyes,
      [],
      [{ position: { x: 0.4, y: 0, z: -4 }, crouching: false }],
    ),
  );
});
test("a nearby enemy outside the centre ray does not attract the shot", () => {
  const view = direction(camera, { x: 0, y: 1.42, z: -30 });
  assert.deepEqual(
    shotAim(
      camera,
      view,
      eyes,
      [],
      [{ position: { x: 4, y: 0, z: -4 }, crouching: false }],
    ),
    shotAim(camera, view, eyes, [], []),
  );
});
test("first-person aim and crouched eye height remain aligned", () => {
  const crouchedEyes = { x: 0, y: 0.82, z: 0 };
  const aim = shotAim(
    crouchedEyes,
    { x: 0, y: 0, z: -1 },
    crouchedEyes,
    [],
    [{ position: { x: 0, y: 0, z: -5 }, crouching: true }],
  );
  assert.ok(Math.abs(aim.yaw) < 1e-12);
  assert.ok(Math.abs(aim.pitch) < 1e-12);
});
