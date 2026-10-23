import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDamage,
  advanceFall,
  matchOutcome,
  randomGenerator,
  reloadMagazine,
  WEAPONS,
  zoneAt,
  zoneDamage,
} from "./rules";

test("armor absorbs only its available share and excess damage reaches health", () => {
  assert.deepEqual(applyDamage(100, 50, 40), { hp: 88, armor: 22 });
  assert.deepEqual(applyDamage(100, 10, 40), { hp: 70, armor: 0 });
  assert.deepEqual(applyDamage(20, 0, 85), { hp: 0, armor: 0 });
  assert.deepEqual(applyDamage(100, 50, -5), { hp: 100, armor: 50 });
});
test("magazine reload conserves ammunition, including a nearly empty reserve", () => {
  assert.deepEqual(reloadMagazine(3, 90, 30), { ammo: 30, reserve: 63 });
  assert.deepEqual(reloadMagazine(3, 5, 30), { ammo: 8, reserve: 0 });
  assert.deepEqual(reloadMagazine(30, 50, 30), { ammo: 30, reserve: 50 });
});
test("zone holds before each contraction, shrinks continuously and eventually closes", () => {
  assert.equal(zoneAt(0).radius, 285);
  assert.equal(zoneAt(23).radius, 285);
  assert.ok(zoneAt(42).radius < 285 && zoneAt(42).radius > 205);
  assert.equal(zoneAt(60).radius, 205);
  let previous = Infinity;
  for (let seconds = 0; seconds < 500; seconds++) {
    const zone = zoneAt(seconds);
    assert.ok(zone.radius <= previous && zone.radius >= 0);
    assert.ok(zone.remaining >= 0);
    previous = zone.radius;
  }
  assert.equal(zoneAt(361).radius, 0);
});
test("storm damage applies only outside and scales with simulation time", () => {
  const zone = zoneAt(0);
  assert.equal(zoneDamage(zone, 0, 0, 1), 0);
  assert.equal(zoneDamage(zone, 285, 0, 1), 0);
  assert.equal(zoneDamage(zone, 286, 0, 1), 2.8);
  assert.equal(zoneDamage(zone, 286, 0, 0.5), 1.4);
});
test("elimination and last survivor produce exclusive, restartable match results", () => {
  assert.equal(matchOutcome(true, 23), "combat");
  assert.equal(matchOutcome(true, 0), "victory");
  assert.equal(matchOutcome(false, 0), "defeated");
  assert.equal(matchOutcome(false, 5), "defeated");
  assert.equal(matchOutcome(true, 23), "combat");
});
test("every firearm has a distinct playable firing and reload profile", () => {
  assert.equal(Object.keys(WEAPONS).length, 7);
  for (const w of Object.values(WEAPONS)) {
    assert.ok(
      w.damage > 0 &&
        w.magazine > 0 &&
        w.interval > 0 &&
        w.reload > 0 &&
        w.range > 0,
    );
  }
  assert.ok(WEAPONS.sniper.range > WEAPONS.smg.range);
  assert.ok(WEAPONS.lmg.magazine > WEAPONS.m4.magazine);
  assert.ok(WEAPONS.shotgun.pellets > 1);
});
test("seeded rounds vary while remaining reproducible for regression checks", () => {
  const a = randomGenerator(45),
    b = randomGenerator(45),
    c = randomGenerator(46);
  const first = Array.from({ length: 50 }, () => a());
  assert.deepEqual(
    first,
    Array.from({ length: 50 }, () => b()),
  );
  assert.notDeepEqual(
    first,
    Array.from({ length: 50 }, () => c()),
  );
  assert.ok(first.every((n) => n >= 0 && n < 1));
});

test("a long fall keeps its emergency parachute open through low altitude until landing", () => {
  for (const dt of [1 / 60, 0.05]) {
    let height = 55,
      velocity = 0,
      open = false,
      deployed = false,
      lowAltitudeFrames = 0;
    for (let frame = 0; height > 0 && frame < 1000; frame++) {
      const next = advanceFall(velocity, dt, height, open);
      if (deployed)
        assert.equal(
          next.parachute,
          true,
          "An open chute must not flicker or close in midair",
        );
      velocity = next.velocity;
      open = next.parachute;
      deployed ||= open;
      if (open) assert.ok(velocity >= -8);
      if (height < 15 && open) lowAltitudeFrames++;
      height += velocity * dt;
    }
    assert.ok(deployed && lowAltitudeFrames > 5);
    assert.ok(height <= 0, "The parachute must still allow landing");
    assert.equal(advanceFall(0, dt, 0, open).parachute, false);
  }
});

test("ordinary ground jumps and short falls do not deploy the emergency parachute", () => {
  let height = 0,
    velocity = 7.2;
  for (let frame = 0; frame < 100; frame++) {
    const next = advanceFall(velocity, 0.05, height, false);
    assert.equal(next.parachute, false);
    velocity = next.velocity;
    height += velocity * 0.05;
    if (height <= 0) break;
  }
  assert.equal(advanceFall(-15, 0.05, 5, false).parachute, false);
});
