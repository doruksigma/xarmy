import assert from "node:assert/strict";
import test from "node:test";
import { MAP, addArmy, createWorld } from "./world";
import {
  getUnitVisualResearch,
  getVisibleUnitVisualResearch,
} from "./map3d-unit-research";
import {
  COUNTRY_MODEL_PROFILES,
  DEFAULT_COUNTRY_MODEL_PROFILE,
  NATIONAL_MODEL_PROFILE_IDS,
  getCountryModelProfile,
  getNationalModelDescription,
} from "./map3d-national-profiles";
import { createM40HelmetShell } from "./map3d-helmet-shell";

test("Every playable country has a bounded national silhouette profile beyond its colour", () => {
  assert.deepEqual(
    Object.keys(COUNTRY_MODEL_PROFILES).sort(),
    MAP.countries.map((c) => c.id).sort(),
  );
  assert.equal(
    new Set(NATIONAL_MODEL_PROFILE_IDS).size,
    MAP.countries.length + 1,
  );
  const signatures = new Set<string>();
  for (const country of MAP.countries) {
    const profile = getCountryModelProfile(country.id);
    assert.equal(profile.id, country.id);
    assert.ok(Object.isFrozen(profile));
    for (const kind of ["infantry", "tank", "truck", "artillery"] as const) {
      assert.ok(Object.isFrozen(profile[kind]));
      assert.ok(getNationalModelDescription(profile, kind).length > 15);
      for (const value of Object.values(profile[kind])) {
        if (typeof value === "number")
          assert.ok(Number.isFinite(value) && value >= 0.8 && value <= 1.2);
      }
    }
    signatures.add(
      JSON.stringify([
        profile.infantry,
        ...[profile.tank, profile.truck, profile.artillery].map((shape) =>
          Object.fromEntries(
            Object.entries(shape).filter(([key]) => key !== "modelName"),
          ),
        ),
      ]),
    );
  }
  assert.equal(
    signatures.size,
    MAP.countries.length,
    "Profiles differ in geometry parameters, independently of labels/colours",
  );
});

test("Reference uniforms keep their distinctive headwear, winter clothing and equipment", () => {
  const germany = getCountryModelProfile("germany").infantry;
  assert.equal(germany.helmet, "stahlhelm");
  assert.ok(germany.scarf && germany.chestCanister && germany.packWidth > 1.08);
  assert.ok(getCountryModelProfile("uk").infantry.scarf);
  assert.equal(getCountryModelProfile("uk").infantry.helmet, "brodie");
  assert.equal(getCountryModelProfile("france").infantry.helmet, "adrian");
  assert.ok(getCountryModelProfile("france").infantry.scarf);
  const soviet = getCountryModelProfile("ussr").infantry;
  assert.equal(soviet.headwear, "ushanka");
  assert.equal(soviet.tunic, "capote");
  const turkey = getCountryModelProfile("turkey").infantry;
  assert.equal(turkey.headwear, "peaked");
  assert.equal(turkey.tunic, "capote");
  assert.equal(getCountryModelProfile("italy").infantry.helmet, "m33");
  assert.equal(getCountryModelProfile("netherlands").infantry.helmet, "dutch");
  assert.match(
    getNationalModelDescription(getCountryModelProfile("ussr"), "infantry"),
    /kürk başlık.*kışlık kaput/,
  );
  assert.match(
    getNationalModelDescription(getCountryModelProfile("turkey"), "infantry"),
    /siperlikli asker kasketi/,
  );
});

test("Advanced vehicle references identify imported designs and shared families without claiming exact replicas", () => {
  const references = [
    ["germany", "tiger1", "opel_blitz", "lefh18"],
    ["uk", "churchill", "bedford_ql", "25pdr"],
    ["france", "somua_s35", "laffly_s20tl", "canon75"],
    ["ussr", "t34", "zis5", "zis3"],
    ["italy", "m13_40", "fiat626", "cannone75_27"],
    ["czechoslovakia", "lt38", "praga_rv", "skoda100"],
    ["sweden", "strv_m42", "volvo_tlv", "bofors75"],
    ["turkey", "t26", "ford_aa", "25pdr"],
    ["poland", "7tp", "polski_fiat621", "25pdr"],
    ["netherlands", "ctls", "daf_trado", "bofors75"],
  ] as const;
  for (const [country, tank, truck, artillery] of references) {
    const profile = getCountryModelProfile(country);
    assert.deepEqual(
      [profile.tank.variant, profile.truck.variant, profile.artillery.variant],
      [tank, truck, artillery],
    );
    for (const kind of ["tank", "truck", "artillery"] as const)
      assert.match(
        getNationalModelDescription(profile, kind),
        /ileri görünüm: .+ esintili$/,
      );
  }
  assert.match(getCountryModelProfile("turkey").tank.modelName!, /ithal T-26/);
  assert.match(
    getCountryModelProfile("netherlands").tank.modelName!,
    /Doğu Hint Adaları/,
  );
  assert.match(
    getCountryModelProfile("austria").tank.modelName!,
    /ortak Alman tasarım ailesi/,
  );
  assert.equal(DEFAULT_COUNTRY_MODEL_PROFILE.tank.variant, undefined);
});

test("Rebel and untrusted country IDs cannot allocate unbounded national variants", () => {
  for (const id of Object.keys(COUNTRY_MODEL_PROFILES)) {
    assert.equal(
      getCountryModelProfile(`${id}-rebels`),
      getCountryModelProfile(id),
    );
    assert.equal(
      getUnitVisualResearch({ id: `${id}-rebels`, tech: [] }).profile,
      id,
    );
  }
  for (const id of [
    undefined,
    "",
    "unknown",
    "constructor",
    "__proto__",
    "toString",
    "germany-rebels-rebels",
  ]) {
    assert.equal(getCountryModelProfile(id), DEFAULT_COUNTRY_MODEL_PROFILE);
    assert.equal(
      getUnitVisualResearch({ id: id ?? "", tech: [] }).profile,
      DEFAULT_COUNTRY_MODEL_PROFILE.id,
      "Research derivation uses the same single canonicalization as geometry",
    );
  }
});

test("National identity survives research and public observation without revealing hidden technology", () => {
  const world = createWorld("turkey", "alternative", 1936);
  const enemy = world.countries.germany;
  enemy.tech = ["weapons3", "armor3", "motorization", "mechanization"];
  const army = addArmy(world, enemy.id, enemy.capital);
  army.type = "infantry";
  const before = JSON.stringify(world);
  const observed = getVisibleUnitVisualResearch(world, [army]);
  assert.equal(observed.profile, "germany");
  assert.equal(observed.infantry, 0);
  assert.equal(observed.tank, 0);
  const full = getUnitVisualResearch(enemy);
  assert.equal(full.profile, "germany");
  assert.equal(full.infantry, 3);
  assert.equal(full.tank, 3);
  assert.equal(
    JSON.stringify(world),
    before,
    "Appearance leaves campaign data unchanged",
  );
  world.countries.turkey.intel.germany = { level: 80, expires: world.day + 3 };
  assert.deepEqual(getVisibleUnitVisualResearch(world, [army]), full);
});

test("Adapted M40 shell has an asymmetric neck guard, smooth outward normals and a bounded mesh", () => {
  for (const width of [0.85, 1, 1.15, Number.NaN]) {
    const mesh = createM40HelmetShell(width);
    try {
      const position = mesh.getAttribute("position"),
        normal = mesh.getAttribute("normal");
      assert.ok(mesh.index && mesh.index.count <= 2000);
      assert.equal(position.count, normal.count);
      let front = Infinity,
        rear = Infinity,
        outward = 0,
        tested = 0;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i),
          y = position.getY(i),
          z = position.getZ(i);
        assert.ok([x, y, z].every(Number.isFinite));
        assert.ok(
          Math.abs(
            Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1,
          ) < 1e-5,
        );
        if (z > 0.2 && Math.abs(x) < 0.03) front = Math.min(front, y);
        if (z < -0.2 && Math.abs(x) < 0.03) rear = Math.min(rear, y);
        // Main shell only: the rolled lip deliberately has both inner/outer sides.
        if (i > 0 && i < 193) {
          tested++;
          if (
            normal.getX(i) * x +
              normal.getY(i) * (y - 0.53) +
              normal.getZ(i) * z >
            0
          )
            outward++;
        }
      }
      assert.ok(
        rear < front - 0.07,
        "The neck guard drops below the forward visor",
      );
      assert.equal(
        outward,
        tested,
        "Steel shell faces outward rather than disappearing with backface culling",
      );
      assert.ok(
        mesh.boundingBox!.max.y < 0.86 && mesh.boundingBox!.min.y > 0.36,
      );
    } finally {
      mesh.dispose();
    }
  }
});
