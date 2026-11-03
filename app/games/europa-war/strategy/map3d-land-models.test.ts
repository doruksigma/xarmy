import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as THREE from "three";
import {
  createLandModelGeometries,
  INFANTRY_NECK_PIVOT,
  type LandModelTier,
} from "./map3d-land-models";

const TIERS: LandModelTier[] = [0, 1, 2, 3];
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
  "infantry-head",
  "infantry-head-details",
];
const ATTRIBUTES = {
  position: 3,
  normal: 3,
  color: 3,
  unitSurface: 2,
  unitCloth: 1,
};
const dispose = (parts: THREE.BufferGeometry[]) =>
  parts.forEach((geometry) => geometry.dispose());

test("All four model banks retain fifteen animation slots with bounded finite geometry", () => {
  for (const tier of TIERS) {
    const parts = createLandModelGeometries(tier);
    assert.deepEqual(
      parts.map((geometry) => geometry.name),
      PARTS,
    );
    let vertices = 0;
    for (const geometry of parts) {
      const count = geometry.getAttribute("position").count;
      vertices += count;
      assert.ok(
        count > 0 && count < 7000,
        `${tier}/${geometry.name}: mesh budget`,
      );
      assert.equal(count % 3, 0, "Merged triangle lists must be complete");
      for (const [key, size] of Object.entries(ATTRIBUTES)) {
        const attribute = geometry.getAttribute(key);
        assert.equal(
          attribute.count,
          count,
          `${tier}/${geometry.name}: ${key}`,
        );
        assert.equal(attribute.itemSize, size);
        assert.ok([...attribute.array].every(Number.isFinite));
      }
      assert.ok(
        [...geometry.getAttribute("unitSurface").array].every(
          (value) => value >= 0 && value <= 1,
        ),
      );
      assert.ok(
        [...geometry.getAttribute("unitCloth").array].every(
          (value) => value === 0 || value === 1,
        ),
      );
      assert.ok(
        geometry.boundingSphere &&
          Number.isFinite(geometry.boundingSphere.radius),
      );
    }
    assert.ok(
      vertices < 30000,
      `Tier ${tier}: ${vertices} must stay below the shared bank budget`,
    );
    dispose(parts);
  }
});

test("Research changes actual infantry, vehicle and gun geometry at every stage", () => {
  const banks = TIERS.map(createLandModelGeometries);
  // Hash positions rather than colors: completed research changes actual meshes.
  for (const part of [0, 2, 3, 4, 6, 7, 8, 13]) {
    const hashes = banks.map((parts) => {
      const array = parts[part].getAttribute("position").array;
      return createHash("sha256")
        .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
        .digest("hex");
    });
    assert.equal(
      new Set(hashes).size,
      4,
      `${PARTS[part]} must have four geometry stages`,
    );
  }
  assert.ok(
    banks[0][3].boundingBox!.max.y < banks[1][3].boundingBox!.max.y,
    "Research adds a visible canvas roof to the open cargo bed",
  );
  assert.ok(
    banks[2][3].boundingBox!.max.y > banks[1][3].boundingBox!.max.y,
    "Improved logistics adds roof stowage",
  );
  assert.ok(
    banks[3][3].getAttribute("position").count >
      banks[0][3].getAttribute("position").count,
    "Mechanized transport adds armored side panels and rear tracks",
  );
  banks.forEach(dispose);
});

test("Every research stage preserves muzzle anchors, foot contact and city-clearance envelopes", () => {
  for (const tier of TIERS) {
    const parts = createLandModelGeometries(tier);
    const byName = new Map(parts.map((geometry) => [geometry.name, geometry]));
    const bounds = (name: string) => byName.get(name)!.boundingBox!;
    assert.ok(
      Math.abs(bounds("infantry-body").max.z - 1.97) < 0.005,
      `Tier ${tier}: rifle muzzle`,
    );
    assert.ok(
      Math.abs(bounds("tank-barrel").max.z - 4.21) < 0.005,
      `Tier ${tier}: tank muzzle`,
    );
    assert.ok(
      bounds("artillery-barrel").containsPoint(
        new THREE.Vector3(0, 1.96, 2.96),
      ),
      `Tier ${tier}: cannon muzzle`,
    );
    assert.ok(Math.abs(bounds("infantry-legs").min.y + 1.66) < 0.005);
    const truck = bounds("truck-body");
    assert.ok(
      Math.max(Math.abs(truck.min.x), truck.max.x) * 2.45 <= 3.3,
      `Tier ${tier}: truck width`,
    );
    assert.ok(
      truck.max.z * 2.45 <= 6.8 && -truck.min.z * 2.45 <= 6.6,
      `Tier ${tier}: truck length`,
    );
    const hull = bounds("tank-hull");
    assert.ok(
      Math.max(Math.abs(hull.min.x), hull.max.x) * 2.45 <= 5.1,
      `Tier ${tier}: tank width`,
    );
    assert.ok(
      hull.max.z * 2.45 <= 5.8 && -hull.min.z * 2.45 <= 5.8,
      `Tier ${tier}: tank length`,
    );
    const gun = bounds("artillery-base");
    assert.ok(
      Math.max(Math.abs(gun.min.x), gun.max.x) * 2.45 <= 3.05,
      `Tier ${tier}: gun width`,
    );
    assert.ok(
      gun.max.z * 2.45 <= 1.3 && -gun.min.z * 2.45 <= 6.9,
      `Tier ${tier}: gun length`,
    );
    dispose(parts);
  }
});

test("Head and face rotate independently around the neck without changing rifle or label clearance", () => {
  assert.deepEqual(INFANTRY_NECK_PIVOT, [0, 3.32, 0]);
  for (const tier of TIERS) {
    const parts = createLandModelGeometries(tier);
    const body = parts[0].boundingBox!,
      details = parts[5].boundingBox!,
      head = parts[13].boundingBox!,
      face = parts[14].boundingBox!;
    assert.ok(
      body.max.y < 3.4 && details.max.y < 3.4,
      "Body batches contain jacket/gear, not a fixed helmet or face",
    );
    assert.ok(
      head.containsPoint(new THREE.Vector3(0, 0, 0)),
      "Neck is the head-local origin",
    );
    assert.ok(head.min.y >= -0.15 && head.max.y < 1.3);
    assert.ok(face.min.y > 0 && face.max.y < 1.3);
    assert.ok(
      (head.max.y + INFANTRY_NECK_PIVOT[1]) * 2.45 < 13,
      "Head and helmet remain below the existing selection badge",
    );
    assert.ok(
      Math.hypot(
        Math.max(Math.abs(head.min.x), head.max.x),
        Math.max(Math.abs(head.min.z), head.max.z),
      ) < 1.0,
      "Idle yaw cannot carry the head into the rifle muzzle",
    );
    dispose(parts);
  }
});

test("Country tint masks cloth while fabric, skin, gun metal and glass retain distinct surfaces", () => {
  for (const tier of TIERS) {
    const parts = createLandModelGeometries(tier);
    const surface = (part: number, hex: number) => {
      const geometry = parts[part],
        colors = geometry.getAttribute("color"),
        surfaces = geometry.getAttribute("unitSurface"),
        cloth = geometry.getAttribute("unitCloth");
      const color = new THREE.Color(hex);
      for (let index = 0; index < colors.count; index++) {
        if (
          Math.abs(colors.getX(index) - color.r) < 1e-6 &&
          Math.abs(colors.getY(index) - color.g) < 1e-6 &&
          Math.abs(colors.getZ(index) - color.b) < 1e-6
        )
          return [
            surfaces.getX(index),
            surfaces.getY(index),
            cloth.getX(index),
          ];
      }
      assert.fail(`Missing material swatch ${hex.toString(16)}`);
    };
    const fabric = surface(0, 0x666d49),
      metal = surface(0, 0x3d4440),
      glass = surface(3, 0x63868a),
      skin = surface(13, 0xbe9872);
    assert.ok(fabric[0] > 0.9 && fabric[1] === 0 && fabric[2] === 1);
    assert.ok(metal[0] < 0.45 && metal[1] > 0.7 && metal[2] === 0);
    assert.ok(glass[0] < 0.2 && glass[1] < 0.2 && glass[2] === 0);
    assert.ok(skin[0] > 0.8 && skin[1] === 0 && skin[2] === 0);
    assert.ok(
      parts.every((geometry) => geometry.groups.length === 0),
      "Surface variation must not add sub-material draw calls",
    );
    dispose(parts);
  }
});

test("Repeated tier creation is deterministic with independently owned disposable buffers", () => {
  for (const tier of TIERS) {
    const first = createLandModelGeometries(tier),
      second = createLandModelGeometries(tier);
    let disposed = 0;
    first.forEach((geometry, index) => {
      assert.notEqual(geometry.uuid, second[index].uuid);
      for (const key of Object.keys(ATTRIBUTES)) {
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
    assert.equal(disposed, 15);
    dispose(second);
  }
});
