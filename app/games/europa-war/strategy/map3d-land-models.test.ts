import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLandModelGeometries } from "./map3d-land-models";

const PARTS = [
  "infantry-body",
  "infantry-legs",
  "tank-hull",
  "truck-body",
  "artillery-base",
  "infantry-details",
  "tank-turret",
  "tank-barrel",
  "artillery-barrel",
  "vehicle-wheels",
  "tank-treads",
  "support-crates",
  "capture-poles",
];

test("Detailed land models retain thirteen shared animation batches and bounded finite geometry", () => {
  const parts = createLandModelGeometries();
  assert.deepEqual(
    parts.map((geometry) => geometry.name),
    PARTS,
  );
  let vertices = 0;
  for (const geometry of parts) {
    const count = geometry.getAttribute("position").count;
    vertices += count;
    assert.ok(
      count > 0 && count < 5000,
      `${geometry.name}: bounded close-up mesh`,
    );
    assert.equal(count % 3, 0, "Merged triangle lists must be complete");
    for (const key of ["position", "normal", "color", "unitSurface"]) {
      const attribute = geometry.getAttribute(key);
      assert.equal(attribute.count, count, `${geometry.name}: ${key}`);
      assert.equal(attribute.itemSize, key === "unitSurface" ? 2 : 3);
      assert.ok([...attribute.array].every(Number.isFinite));
    }
    assert.ok(
      [...geometry.getAttribute("unitSurface").array].every(
        (value) => value >= 0 && value <= 1,
      ),
    );
    assert.ok(
      geometry.boundingSphere &&
        Number.isFinite(geometry.boundingSphere.radius),
    );
  }
  assert.ok(
    vertices < 22000,
    "Added detail must not grow the shared geometry budget without limit",
  );
  parts.forEach((geometry) => geometry.dispose());
});

test("New equipment keeps muzzle anchors, foot contact and city-clearance envelopes", () => {
  const parts = createLandModelGeometries();
  const byName = new Map(parts.map((geometry) => [geometry.name, geometry]));
  const bounds = (name: string) => byName.get(name)!.boundingBox!;
  assert.ok(Math.abs(bounds("infantry-body").max.z - 1.97) < 0.005);
  assert.ok(Math.abs(bounds("tank-barrel").max.z - 4.21) < 0.005);
  assert.ok(
    bounds("artillery-barrel").containsPoint(new THREE.Vector3(0, 1.96, 2.96)),
  );
  assert.ok(Math.abs(bounds("infantry-legs").min.y + 1.66) < 0.005);
  assert.ok(
    bounds("infantry-body").max.y * 2.45 < 13,
    "Helmet stays below the existing selection badge",
  );
  const truck = bounds("truck-body");
  assert.ok(Math.max(Math.abs(truck.min.x), truck.max.x) * 2.45 <= 3.3);
  assert.ok(truck.max.z * 2.45 <= 6.8 && -truck.min.z * 2.45 <= 6.6);
  const hull = bounds("tank-hull");
  assert.ok(Math.max(Math.abs(hull.min.x), hull.max.x) * 2.45 <= 5.1);
  assert.ok(hull.max.z * 2.45 <= 5.8 && -hull.min.z * 2.45 <= 5.8);
  const gun = bounds("artillery-base");
  assert.ok(Math.max(Math.abs(gun.min.x), gun.max.x) * 2.45 <= 3.05);
  assert.ok(gun.max.z * 2.45 <= 1.3 && -gun.min.z * 2.45 <= 6.9);
  parts.forEach((geometry) => geometry.dispose());
});

test("Merged models distinguish fabric, gun metal and cab glass without material groups", () => {
  const parts = createLandModelGeometries();
  const surface = (part: number, hex: number) => {
    const geometry = parts[part],
      colors = geometry.getAttribute("color"),
      surfaces = geometry.getAttribute("unitSurface");
    const color = new THREE.Color(hex);
    for (let index = 0; index < colors.count; index++) {
      if (
        Math.abs(colors.getX(index) - color.r) < 1e-6 &&
        Math.abs(colors.getY(index) - color.g) < 1e-6 &&
        Math.abs(colors.getZ(index) - color.b) < 1e-6
      )
        return [surfaces.getX(index), surfaces.getY(index)];
    }
    assert.fail(`Missing material swatch ${hex.toString(16)}`);
  };
  const fabric = surface(0, 0x666d49),
    metal = surface(0, 0x3d4440),
    glass = surface(3, 0x63868a);
  assert.ok(fabric[0] > 0.9 && fabric[1] === 0);
  assert.ok(metal[0] < 0.45 && metal[1] > 0.7);
  assert.ok(glass[0] < 0.2 && glass[1] < 0.2);
  assert.ok(
    parts.every((geometry) => geometry.groups.length === 0),
    "Surface variation must not add sub-material draw calls",
  );
  parts.forEach((geometry) => geometry.dispose());
});

test("Repeated model creation is deterministic with independently owned disposable buffers", () => {
  const first = createLandModelGeometries(),
    second = createLandModelGeometries();
  let disposed = 0;
  first.forEach((geometry, index) => {
    assert.notEqual(geometry.uuid, second[index].uuid);
    for (const key of ["position", "normal", "color", "unitSurface"]) {
      assert.notEqual(
        geometry.getAttribute(key).array,
        second[index].getAttribute(key).array,
      );
      assert.deepEqual(
        geometry.getAttribute(key).array,
        second[index].getAttribute(key).array,
      );
    }
    geometry.addEventListener("dispose", () => disposed++);
    geometry.dispose();
  });
  assert.equal(disposed, 13);
  second.forEach((geometry) => geometry.dispose());
});
