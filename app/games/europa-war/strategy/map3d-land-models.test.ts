import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as THREE from "three";
import legacyEurope from "./legacy-europe-map.json";
import {
  createLandModelGeometries,
  createLandModelGeometry,
  landModelGeometryKey,
  INFANTRY_NECK_PIVOT,
  type LandModelTier,
} from "./map3d-land-models";

import {
  COUNTRY_MODEL_PROFILES,
  type NationalModelProfile,
  type InfantryModelProfile,
} from "./map3d-national-profiles";

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
        count > 0 && count < 16000,
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
      const normals = geometry.getAttribute("normal");
      for (let index = 0; index < normals.count; index++) {
        assert.ok(
          Math.abs(
            Math.hypot(
              normals.getX(index),
              normals.getY(index),
              normals.getZ(index),
            ) - 1,
          ) < 1e-4,
          `${tier}/${geometry.name}: normalized shading normals`,
        );
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
      vertices <= 45000,
      `Tier ${tier}: ${vertices} must stay below the shared bank budget`,
    );
    dispose(parts);
  }
});

test("Research changes actual infantry, vehicle and gun geometry at every stage", () => {
  const banks = TIERS.map((tier) => createLandModelGeometries(tier));
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

test("Infantry has human head proportions and continuously curved cloth and leather silhouettes", () => {
  for (const tier of TIERS) {
    const parts = createLandModelGeometries(tier);
    const head = parts[13].boundingBox!;
    assert.ok(head.max.y + INFANTRY_NECK_PIVOT[1] < 4.2);
    assert.ok(head.max.x - head.min.x < 0.78, "Helmet fits a human-sized head");
    const skin = new THREE.Color(0xbe9872);
    const positions = parts[13].getAttribute("position");
    const colors = parts[13].getAttribute("color");
    const skull = new THREE.Box3();
    for (let index = 0; index < positions.count; index++) {
      if (
        positions.getY(index) >= 0.089 &&
        Math.abs(colors.getX(index) - skin.r) < 1e-6 &&
        Math.abs(colors.getY(index) - skin.g) < 1e-6 &&
        Math.abs(colors.getZ(index) - skin.b) < 1e-6
      )
        skull.expandByPoint(
          new THREE.Vector3().fromBufferAttribute(positions, index),
        );
    }
    const headHeight = skull.max.y - skull.min.y;
    const figureHeads = (head.max.y + INFANTRY_NECK_PIVOT[1]) / headHeight;
    assert.ok(
      figureHeads >= 6.7 && figureHeads <= 7.6,
      "Standing silhouette stays near seven heads tall",
    );
    for (const [part, hex] of [
      [0, 0x666d49],
      [1, 0x39352c],
    ]) {
      const geometry = parts[part],
        color = new THREE.Color(hex);
      const paint = geometry.getAttribute("color"),
        normals = geometry.getAttribute("normal");
      let selected = 0,
        curved = 0;
      for (let index = 0; index < paint.count; index++) {
        if (
          Math.abs(paint.getX(index) - color.r) > 1e-6 ||
          Math.abs(paint.getY(index) - color.g) > 1e-6 ||
          Math.abs(paint.getZ(index) - color.b) > 1e-6
        )
          continue;
        selected++;
        if (
          Math.abs(normals.getX(index)) > 0.1 &&
          Math.abs(normals.getZ(index)) > 0.1
        )
          curved++;
      }
      assert.ok(
        curved / selected > 0.45,
        `${PARTS[part]} uses rounded surfaces, not flat rectangular anatomy`,
      );
    }
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

test("all national rigs retain researched geometry, animation anchors, clearances and safe family sharing", () => {
  const signatures = new Map<string, string>();
  const nationalShapes = new Map<string, Set<string>>(
    [0, 2, 3, 4].flatMap((part) =>
      TIERS.map((tier) => [`${part}:${tier}`, new Set<string>()] as const),
    ),
  );
  const originalShapes = new Map(
    [...nationalShapes.keys()].map((key) => [key, new Set<string>()]),
  );
  const hash = (geometry: THREE.BufferGeometry, allAttributes = false) => {
    const digest = createHash("sha256");
    for (const name of allAttributes ? Object.keys(ATTRIBUTES) : ["position"]) {
      const array = geometry.getAttribute(name).array;
      digest.update(
        Buffer.from(array.buffer, array.byteOffset, array.byteLength),
      );
    }
    return digest.digest("hex");
  };
  for (const profile of Object.values(COUNTRY_MODEL_PROFILES)) {
    const research = new Map<number, Set<string>>(
      [0, 2, 3, 4].map((part) => [part, new Set<string>()]),
    );
    for (const tier of TIERS) {
      const parts = createLandModelGeometries(tier, profile);
      assert.equal(parts.length, 15);
      let vertices = 0;
      for (const [part, geometry] of parts.entries()) {
        const count = geometry.getAttribute("position").count;
        vertices += count;
        assert.ok(
          count > 0 && count < 16000,
          `${profile.id}/${tier}/${part}: part budget`,
        );
        assert.equal(count % 3, 0);
        for (const [name, itemSize] of Object.entries(ATTRIBUTES)) {
          const attribute = geometry.getAttribute(name);
          assert.equal(attribute.itemSize, itemSize);
          assert.equal(
            attribute.count,
            geometry.getAttribute("position").count,
          );
          for (const value of attribute.array)
            assert.ok(
              Number.isFinite(value),
              `${profile.id}/${tier}/${part}/${name}`,
            );
        }
        const key = landModelGeometryKey(part, tier, profile),
          signature = hash(geometry, true);
        if (signatures.has(key))
          assert.equal(
            signature,
            signatures.get(key),
            `shared ${key} must have identical buffers`,
          );
        else signatures.set(key, signature);
      }
      assert.ok(
        vertices < 55000,
        `${profile.id}/${tier}: ${vertices} vertices`,
      );
      assert.ok(
        parts[0].boundingBox!.max.y < 3.4 && parts[5].boundingBox!.max.y < 3.4,
        `${profile.id}/${tier}: torso accessories remain below head rig`,
      );
      assert.ok(Math.abs(parts[0].boundingBox!.max.z - 1.97) < 0.005);
      assert.ok(Math.abs(parts[1].boundingBox!.min.y + 1.66) < 0.005);
      assert.ok(Math.abs(parts[7].boundingBox!.max.z - 4.21) < 0.005);
      assert.ok(
        parts[8].boundingBox!.containsPoint(new THREE.Vector3(0, 1.96, 2.96)),
      );
      assert.ok(
        parts[13].boundingBox!.containsPoint(new THREE.Vector3(0, 0, 0)),
      );
      assert.ok(
        (parts[13].boundingBox!.max.y + INFANTRY_NECK_PIVOT[1]) * 2.45 < 13,
      );
      for (const [part, halfWidth, front, rear] of [
        [2, 5.1, 5.8, 5.8],
        [3, 3.3, 6.8, 6.6],
        [4, 3.05, 1.3, 6.9],
      ]) {
        const bounds = parts[part].boundingBox!;
        assert.ok(
          Math.max(Math.abs(bounds.min.x), bounds.max.x) * 2.45 <= halfWidth,
          `${profile.id}/${tier}/${part}: width`,
        );
        assert.ok(
          bounds.max.z * 2.45 <= front && -bounds.min.z * 2.45 <= rear,
          `${profile.id}/${tier}/${part}: length`,
        );
      }
      for (const [part, stages] of research) {
        stages.add(hash(parts[part]));
        const shape =
          part === 0
            ? [0, 1, 13].map((index) => hash(parts[index])).join(":")
            : part === 2
              ? [2, 6].map((index) => hash(parts[index])).join(":")
              : hash(parts[part]);
        nationalShapes.get(`${part}:${tier}`)!.add(shape);
        if (legacyEurope.countryIds.includes(profile.id))
          originalShapes.get(`${part}:${tier}`)!.add(shape);
      }
      dispose(parts);
    }
    for (const [part, stages] of research)
      assert.equal(
        stages.size,
        4,
        `${profile.id}/${PARTS[part]}: four research stages`,
      );
  }
  for (const [part, shapes] of nationalShapes) {
    assert.equal(
      originalShapes.get(part)!.size,
      legacyEurope.countryIds.length,
      `part/tier ${part}: existing national silhouettes are preserved`,
    );
    assert.ok(
      shapes.size >= originalShapes.get(part)!.size &&
        shapes.size <= Object.keys(COUNTRY_MODEL_PROFILES).length,
      `part/tier ${part}: additional countries may share supported vehicle families`,
    );
  }
});

const positionSignature = (geometry: THREE.BufferGeometry) => {
  const array = geometry.getAttribute("position").array;
  return createHash("sha256")
    .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
    .digest("hex");
};

test("advanced national vehicle references change geometry only after the second research stage", () => {
  const representatives = new Map<string, string>();
  for (const [id, profile] of Object.entries(COUNTRY_MODEL_PROFILES))
    representatives.set(
      [
        profile.tank.variant,
        profile.truck.variant,
        profile.artillery.variant,
      ].join(":"),
      id,
    );
  assert.ok(representatives.size >= 7);
  for (const id of representatives.values()) {
    const profile = COUNTRY_MODEL_PROFILES[id];
    const generic: NationalModelProfile = {
      ...profile,
      tank: { ...profile.tank, variant: undefined },
      truck: { ...profile.truck, variant: undefined },
      artillery: { ...profile.artillery, variant: undefined },
    };
    const relabeled: NationalModelProfile = {
      ...profile,
      label: "Translated country label",
      tank: { ...profile.tank, modelName: "Translated tank label" },
      truck: { ...profile.truck, modelName: "Translated truck label" },
      artillery: { ...profile.artillery, modelName: "Translated gun label" },
    };
    for (const tier of TIERS) {
      for (const part of [2, 6, 3, 4]) {
        const actual = createLandModelGeometry(part, tier, profile);
        const baseline = createLandModelGeometry(part, tier, generic);
        try {
          assert.equal(
            landModelGeometryKey(part, tier, profile),
            landModelGeometryKey(part, tier, relabeled),
            `${id}/${tier}/${part}: labels do not duplicate cached geometry`,
          );
          const kind =
            part === 2 || part === 6
              ? "tank"
              : part === 3
                ? "truck"
                : "artillery";
          if (tier < 2 || !profile[kind].variant) {
            assert.equal(
              positionSignature(actual),
              positionSignature(baseline),
              `${id}/${tier}/${part}: early or generic equipment is retained`,
            );
            assert.equal(
              landModelGeometryKey(part, tier, profile),
              landModelGeometryKey(part, tier, generic),
            );
          } else {
            assert.notEqual(
              positionSignature(actual),
              positionSignature(baseline),
              `${id}/${tier}/${part}: reference silhouette is real geometry`,
            );
            assert.notEqual(
              landModelGeometryKey(part, tier, profile),
              landModelGeometryKey(part, tier, generic),
            );
          }
        } finally {
          actual.dispose();
          baseline.dispose();
        }
      }
      for (const part of [7, 8, 9, 10])
        assert.equal(
          landModelGeometryKey(part, tier, profile),
          landModelGeometryKey(part, tier, generic),
          `${id}: muzzle and moving track rig stays shared`,
        );
    }
  }
});

test("reference uniform accessories and winter headwear select actual geometry without changing the research tier", () => {
  const cases: {
    id: string;
    change: Partial<InfantryModelProfile>;
    parts: number[];
  }[] = [
    { id: "uk", change: { scarf: false }, parts: [0, 13, 14] },
    { id: "france", change: { scarf: false }, parts: [0, 13] },
    { id: "germany", change: { chestCanister: false }, parts: [0] },
    { id: "ussr", change: { headwear: "helmet" }, parts: [0, 13, 14] },
    { id: "turkey", change: { headwear: "helmet" }, parts: [13, 14] },
  ];
  for (const { id, change, parts } of cases) {
    const profile = COUNTRY_MODEL_PROFILES[id];
    const without: NationalModelProfile = {
      ...profile,
      infantry: { ...profile.infantry, ...change },
    };
    for (const part of parts) {
      const actual = createLandModelGeometry(part, 0, profile);
      const stripped = createLandModelGeometry(part, 0, without);
      try {
        assert.notEqual(
          positionSignature(actual),
          positionSignature(stripped),
          `${id}/${part}: visible national uniform accessory`,
        );
        assert.notEqual(
          landModelGeometryKey(part, 0, profile),
          landModelGeometryKey(part, 0, without),
        );
      } finally {
        actual.dispose();
        stripped.dispose();
      }
    }
    assert.equal(
      landModelGeometryKey(1, 0, profile),
      landModelGeometryKey(1, 0, without),
      `${id}: walking rig is shared`,
    );
  }
});
