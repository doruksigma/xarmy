import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceHours } from "./engine";
import { operationsDay, intelChance } from "./operations";
import {
  createRandomStreams,
  isValidRandomStreams,
  nextRandom,
  RANDOM_STREAMS,
  type RandomStream,
} from "./rng";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { createWorld, random } from "./world";

const oldStep = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

test("Yeni sefer bütün alanları ayrı, tekrarlanabilir ve sınırlı RNG durumuyla kurar", () => {
  for (const seed of [0, 1, 1936, 0x7fffffff, 0xffffffff]) {
    const world = createWorld("turkey", "historical", seed);
    assert.deepEqual(world.rng, createRandomStreams(seed));
    assert.ok(isValidRandomStreams(world.rng));
    assert.equal(world.rng!.intelligence, seed);
    assert.equal(new Set(Object.values(world.rng!)).size, 4);
    assert.deepEqual(decodeSave(encodeSave(world)), world);
  }
});

test("Her akıştaki ek zarlar diğer üç akışın sonraki sonuçlarını değiştirmez", () => {
  for (const consumed of RANDOM_STREAMS) {
    const normal = createWorld("germany", "alternative", 71);
    const extra = structuredClone(normal);
    for (let i = 0; i < 97; i++) nextRandom(extra, consumed);
    assert.notEqual(extra.rng![consumed], normal.rng![consumed]);
    for (const untouched of RANDOM_STREAMS) {
      if (untouched === consumed) continue;
      for (let i = 0; i < 30; i++)
        assert.equal(
          nextRandom(extra, untouched),
          nextRandom(normal, untouched),
        );
    }
    assert.ok(validateWorld(extra));
    assert.ok(validateWorld(normal));
  }
});

test("İstihbarat ve eski random çağrısı eski LCG dizisini sıfır dahil aynen sürdürür", () => {
  for (const initial of [0, 1936, 0xffffffff]) {
    const world = createWorld("turkey", "historical", initial);
    let seed = initial;
    for (let i = 0; i < 100; i++) {
      seed = oldStep(seed);
      const value = i % 2 ? random(world) : nextRandom(world, "intelligence");
      assert.equal(value, seed / 0x100000000);
      assert.ok(value >= 0 && value < 1);
      assert.equal(world.seed, seed);
      assert.equal(world.rng!.intelligence, seed);
    }
  }
});

test("Eski V3 kaydı okumak veya kaydetmek akış yaratmaz; ilk zar kayıp olmadan geçirir", () => {
  const legacy = createWorld("turkey", "historical", 0);
  delete legacy.rng;
  legacy.seed = oldStep(oldStep(0));
  const before = structuredClone(legacy);
  assert.ok(validateWorld(legacy));
  const loaded = decodeSave(encodeSave(legacy));
  assert.deepEqual(loaded, before);
  assert.deepEqual(legacy, before);
  assert.equal(Object.hasOwn(loaded, "rng"), false);
  const expected = oldStep(before.seed);
  assert.equal(nextRandom(loaded, "intelligence"), expected / 0x100000000);
  assert.equal(loaded.seed, expected);
  assert.deepEqual(loaded.rng, {
    ...createRandomStreams(before.seed),
    intelligence: expected,
  });
  assert.ok(validateWorld(loaded));
});

test("Eski kayıtta önce başka alanın zarı atılsa da sıradaki istihbarat zarı değişmez", () => {
  const world = createWorld("france", "historical", 2345);
  delete world.rng;
  const seed = world.seed;
  for (let i = 0; i < 17; i++) nextRandom(world, "combat");
  assert.equal(world.seed, seed);
  assert.equal(nextRandom(world, "intelligence"), oldStep(seed) / 0x100000000);
});

test("Dört akışın ortasında kayıt yüklemek ve klonlamak bütün sonraki zarları korur", () => {
  const uninterrupted = createWorld("turkey", "alternative", 99);
  for (let i = 0; i < 31; i++) nextRandom(uninterrupted, RANDOM_STREAMS[i % 4]);
  const loaded = decodeSave(encodeSave(uninterrupted));
  const clone = structuredClone(uninterrupted);
  for (let i = 0; i < 111; i++) {
    const stream = RANDOM_STREAMS[(i * 3) % 4];
    const expected = nextRandom(uninterrupted, stream);
    assert.equal(nextRandom(loaded, stream), expected);
    assert.equal(nextRandom(clone, stream), expected);
  }
  assert.deepEqual(loaded, uninterrupted);
  assert.deepEqual(clone, uninterrupted);
});

function missionWorld(seed: number) {
  const world = createWorld("turkey", "alternative", seed);
  const country = world.countries.turkey;
  country.agency = true;
  country.agents = 0;
  country.missions = [
    {
      id: "rng-intel-test",
      target: "bulgaria",
      type: "intel",
      progress: 0,
      total: 1,
    },
  ];
  return world;
}

test("Gerçek başarılı/başarısız casusluk yalnız istihbarat akışını tüketir", () => {
  let sawSuccess = false,
    sawFailure = false;
  for (const seed of [0, 1, 1936, 1000, 0x7fffffff, 0xffffffff]) {
    const world = missionWorld(seed);
    const initial = structuredClone(world.rng!);
    const successSeed = oldStep(seed);
    const success =
      successSeed / 0x100000000 <
      intelChance(world.countries.turkey, world.countries.bulgaria);
    operationsDay(world);
    assert.equal(world.countries.turkey.missions.length, 0);
    assert.equal(!!world.countries.turkey.intel.bulgaria, success);
    const lastSeed = success ? successSeed : oldStep(successSeed);
    assert.equal(world.seed, lastSeed);
    assert.equal(world.rng!.intelligence, lastSeed);
    for (const stream of ["combat", "events", "ai"] as const)
      assert.equal(world.rng![stream], initial[stream]);
    assert.equal(
      world.countries.turkey.agents,
      success || lastSeed / 0x100000000 > 0.45 ? 1 : 0,
    );
    sawSuccess ||= success;
    sawFailure ||= !success;
    assert.ok(validateWorld(world));
  }
  assert.ok(sawSuccess && sawFailure, "Both actual mission paths must run");
});

test("Savaş/AI/olay akışındaki ek çekimler gerçek casusluk sonucuna karışmaz", () => {
  const baseline = missionWorld(1936);
  const extra = structuredClone(baseline);
  for (const stream of ["combat", "events", "ai"] as const)
    for (let i = 0; i < 43; i++) nextRandom(extra, stream);
  operationsDay(baseline);
  operationsDay(extra);
  delete baseline.rng;
  delete extra.rng;
  assert.deepEqual(extra, baseline);
});

test("Ülke ve görev kayıt sırası istihbarat zarlarının ülkelere dağılımını değiştirmez", () => {
  const original = missionWorld(1936);
  original.countries.turkey.missions.push({
    id: "another-intel-test",
    target: "greece",
    type: "intel",
    progress: 0,
    total: 1,
  });
  original.countries.germany.agency = true;
  original.countries.germany.missions.push({
    id: "german-intel-test",
    target: "poland",
    type: "intel",
    progress: 0,
    total: 1,
  });
  const reordered = structuredClone(original);
  reordered.countries = Object.fromEntries(
    Object.entries(reordered.countries).reverse(),
  );
  for (const country of Object.values(reordered.countries))
    country.missions.reverse();
  operationsDay(original);
  operationsDay(reordered);
  assert.deepEqual(reordered, original);
});

test("Saat sınırındaki gerçek casusluk kayıt sonrası aynı dünya sonucunu verir", () => {
  const world = missionWorld(999);
  world.hour = 23;
  nextRandom(world, "events");
  nextRandom(world, "combat");
  const loaded = decodeSave(encodeSave(world));
  const before = structuredClone(world);
  const expected = advanceHours(world, 4);
  assert.deepEqual(advanceHours(loaded, 4), expected);
  assert.deepEqual(world, before, "The source snapshot stays immutable");
  assert.equal(expected.countries.turkey.missions.length, 0);
  assert.ok(validateWorld(expected));
});

test("Kayıt doğrulaması kesirli/sınır dışı tohumu ve bozuk akışları onarmaz", () => {
  const world = createWorld("turkey");
  for (const seed of [-1, 0.5, 0x100000000, NaN, Infinity, "1936", null]) {
    const invalid = { ...world, seed };
    assert.equal(validateWorld(invalid), false);
    assert.throws(() =>
      decodeSave(
        JSON.stringify({
          format: "xarmy-europa-1936",
          version: 3,
          world: invalid,
        }),
      ),
    );
  }
  const malformed: unknown[] = [
    null,
    [],
    {},
    1,
    "rng",
    { ...world.rng, extra: 1 },
    { combat: 1, ai: 2, intelligence: world.seed },
  ];
  for (const stream of RANDOM_STREAMS)
    for (const value of [-1, 0.5, 0x100000000, NaN, Infinity, "5", null])
      malformed.push({ ...world.rng, [stream]: value });
  for (const rng of malformed) {
    assert.equal(isValidRandomStreams(rng), false);
    const invalid = { ...world, rng };
    assert.equal(validateWorld(invalid), false);
    assert.throws(() =>
      decodeSave(
        JSON.stringify({
          format: "xarmy-europa-1936",
          version: 3,
          world: invalid,
        }),
      ),
    );
  }
  assert.equal(validateWorld({ ...world, rng: undefined }), false);
  assert.equal(isValidRandomStreams(Object.create(world.rng!)), false);
  const mismatch = { ...world, seed: world.seed + 1 };
  assert.equal(validateWorld(mismatch), false);
  assert.throws(() => decodeSave(encodeSave(mismatch)));
});

test("Üreteç bilinmeyen alanı veya bozuk durumu değiştirmeden reddeder", () => {
  const world = createWorld("turkey");
  delete world.rng;
  const before = structuredClone(world);
  for (const stream of ["__proto__", "constructor", "weather", ""])
    assert.throws(() => nextRandom(world, stream as RandomStream));
  assert.deepEqual(world, before);
  world.rng = createRandomStreams(world.seed);
  world.rng.intelligence++;
  const corrupt = structuredClone(world);
  assert.throws(() => nextRandom(world, "combat"));
  assert.deepEqual(world, corrupt);
});

function legacySnapshot(version: 1 | 2) {
  const old = createWorld("turkey", "historical", 7321);
  delete old.rng;
  const snapshot = old as unknown as Record<string, unknown>;
  snapshot.version = version;
  delete snapshot.hour;
  for (const event of old.events) delete event.hour;
  if (version === 2) return snapshot;
  for (const key of ["difficulty", "plans", "conferences", "warScore"])
    delete snapshot[key];
  for (const country of Object.values(old.countries)) {
    for (const wing of country.air.wings)
      country.equipment[wing.model] += wing.count;
    for (const ship of country.navy.ships) country.equipment[ship.model]++;
    for (const key of [
      "strategicBomber",
      "reconPlane",
      "transport",
      "carrierFighter",
      "destroyer",
      "battleship",
    ])
      Reflect.deleteProperty(country.equipment, key);
    for (const key of ["automation", "cabinet", "decisions"])
      Reflect.deleteProperty(country, key);
    Reflect.deleteProperty(country.air, "wings");
    Reflect.deleteProperty(country.navy, "ships");
    Reflect.deleteProperty(country.navy, "zone");
  }
  for (const province of Object.values(old.provinces))
    for (const key of ["mine", "airfield", "antiAir"])
      Reflect.deleteProperty(province.buildings, key);
  for (const army of old.armies) Reflect.deleteProperty(army, "support");
  return snapshot;
}

test("Gerçek akışsız V1 ve V2 kayıt geçişleri sıradaki eski zarı korur", () => {
  for (const version of [1, 2] as const) {
    const old = legacySnapshot(version);
    const loaded = decodeSave(
      JSON.stringify({
        format: "xarmy-europa-1936",
        version,
        world: old,
      }),
    );
    assert.equal(loaded.version, 3);
    assert.equal(Object.hasOwn(loaded, "rng"), false);
    assert.equal(loaded.seed, old.seed);
    assert.ok(validateWorld(loaded));
    assert.equal(
      nextRandom(loaded, "intelligence"),
      oldStep(old.seed as number) / 0x100000000,
    );
    assert.deepEqual(decodeSave(encodeSave(loaded)), loaded);
  }
});
