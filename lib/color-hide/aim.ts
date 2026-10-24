import { RULES } from "./types";
import type { MapObject, Vec3 } from "./types";

export type AimTarget = { position: Vec3; crouching: boolean };
export type AimAngles = { yaw: number; pitch: number };

function rayBox(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3): number {
  let near = 0,
    far = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
    } else {
      let a = (min[axis] - origin[axis]) / direction[axis];
      let b = (max[axis] - origin[axis]) / direction[axis];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return near;
}

/** Resolve exactly the screen-centre ray, not the nearest enemy. The resulting
 * angle is a request: the server still owns the firing origin, range, timing,
 * wall tests and capture result. Moving and camera orbit retain their own yaw. */
export function shotAim(
  camera: Vec3,
  direction: Vec3,
  eyes: Vec3,
  objects: readonly MapObject[],
  targets: readonly AimTarget[],
): AimAngles {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-8) return { yaw: 0, pitch: 0 };
  const ray = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
  let distance =
    RULES.shotRange +
    Math.hypot(camera.x - eyes.x, camera.y - eyes.y, camera.z - eyes.z);
  for (const o of objects)
    if (o.solid)
      distance = Math.min(
        distance,
        rayBox(
          camera,
          ray,
          { x: o.x - o.width / 2, y: o.y ?? 0, z: o.z - o.depth / 2 },
          {
            x: o.x + o.width / 2,
            y: (o.y ?? 0) + o.height,
            z: o.z + o.depth / 2,
          },
        ),
      );
  for (const target of targets) {
    const p = target.position;
    distance = Math.min(
      distance,
      rayBox(
        camera,
        ray,
        { x: p.x - RULES.radius, y: p.y, z: p.z - RULES.radius },
        {
          x: p.x + RULES.radius,
          y: p.y + (target.crouching ? 1 : 1.65),
          z: p.z + RULES.radius,
        },
      ),
    );
  }
  const dx = camera.x + ray.x * distance - eyes.x;
  const dy = camera.y + ray.y * distance - eyes.y;
  const dz = camera.z + ray.z * distance - eyes.z;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz)))),
  };
}
