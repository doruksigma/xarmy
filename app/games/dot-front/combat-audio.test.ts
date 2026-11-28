import assert from "node:assert/strict";
import test from "node:test";
import { combatSoundsBetween, spatialSound } from "./combat-audio";
import { units, STEP } from "./config";
import type { Kind, Team } from "./config";
import { createMatch, step } from "./engine";
import type { Match, Unit } from "./engine";

const soldier = (id: number, team: Team, x: number, y: number, kind: Kind = "light"): Unit => ({
  id, team, kind, x, y, hp: units[kind].hp, cooldown: 0, stance: "manual", nextOrder: 0,
  pocketed: false, pocketTime: 0, order: { mode: "hold" }, path: [], waypoint: 0, replan: 0, marked: false,
});
const fixture = (army: Unit[]): Match => {
  const match = createMatch("normal", "combat-audio", false, "plains");
  match.units = army; match.nextId = Math.max(0, ...army.map(unit => unit.id)) + 1; match.elapsed = 20;
  return match;
};
const later = (previous: Match, delta = .5) => {
  const next = structuredClone(previous); next.elapsed += delta;
  for (const unit of next.units) unit.cooldown = Math.max(0, unit.cooldown - delta);
  return next;
};

test("online support volleys infer one explosion per source and decay alone remains silent", () => {
  const artillery = soldier(1, 1, 64.5, 45.5, "artillery");
  const aircraft = soldier(2, 1, 71.5, 45.5, "aircraft");
  const targets = Array.from({ length: 5 }, (_, i) => soldier(i + 3, 2, 73 + i * .2, 45.5));
  const previous = fixture([artillery, aircraft, ...targets]);
  const decayed = later(previous);
  decayed.units[1].hp -= .15;
  assert.deepEqual(combatSoundsBetween(previous, decayed), [], "fuel or maintenance losses are not bombing events");
  const next = later(previous);
  next.units = next.units.slice(0, 2);
  next.units[0].cooldown = units.artillery.cooldown - .2;
  next.units[1].cooldown = units.aircraft.cooldown - .2;
  const sounds = combatSoundsBetween(previous, next);
  assert.deepEqual(sounds.map(sound => sound.kind), ["artillery", "aircraft"]);
  assert.ok(sounds.every(sound => sound.impact), "nearby lethal support fire includes an impact");
});

test("spatial audio follows the CSS camera transform with centered and symmetric panning", () => {
  const view = { width: 1000, height: 600, x: 0, y: 0, scale: 10 };
  assert.deepEqual(spatialSound({ x: 50, y: 30 }, view), { pan: 0, distance: 0 });
  const left = spatialSound({ x: 25, y: 30 }, view), right = spatialSound({ x: 75, y: 30 }, view);
  assert.equal(left.pan, -.5); assert.equal(right.pan, .5); assert.equal(left.distance, right.distance);
  assert.ok(left.distance > 0 && left.distance < 1);
  assert.deepEqual(spatialSound({ x: 75, y: 30 }, { ...view, x: -250 }), { pan: 0, distance: 0 });
  const zoomed = spatialSound({ x: 75, y: 30 }, { ...view, scale: 20, x: -500, y: -300 });
  assert.equal(zoomed.pan, 1); assert.equal(zoomed.distance, right.distance * 2);
});

test("distance fades in every direction and clamps distant or unusable viewports to silence", () => {
  const view = { width: 1000, height: 600, x: 0, y: 0, scale: 10 };
  assert.ok(spatialSound({ x: 50, y: 50 }, view).distance > spatialSound({ x: 50, y: 40 }, view).distance);
  assert.equal(spatialSound({ x: 200, y: 30 }, view).distance, 1);
  assert.equal(spatialSound({ x: 200, y: 30 }, view).pan, 1);
  assert.equal(spatialSound({ x: -100, y: 30 }, view).pan, -1);
  assert.equal(spatialSound({ x: 50, y: -100 }, view).distance, 1);
  for (const invalid of [{ ...view, width: 0 }, { ...view, height: -1 }, { ...view, scale: 0 }, { ...view, x: NaN }])
    assert.deepEqual(spatialSound({ x: 50, y: 30 }, invalid), { pan: 0, distance: 1 });
  assert.deepEqual(spatialSound({ x: Infinity, y: 30 }, view), { pan: 0, distance: 1 });
});

test("uniform viewport or pixel-density scaling does not change perceived pan or distance", () => {
  const view = { width: 900, height: 500, x: -120, y: -80, scale: 9 }, point = { x: 78, y: 32 };
  const scaled = { width: 1800, height: 1000, x: -240, y: -160, scale: 18 };
  assert.deepEqual(spatialSound(point, scaled), spatialSound(point, view));
});

test("both light and heavy cooldown resets create one sound per source, including a 3x snapshot interval", () => {
  const previous = fixture([soldier(1, 1, 70.5, 45.5), soldier(2, 2, 72.5, 45.5, "heavy")]);
  previous.units[0].cooldown = .2; previous.units[1].cooldown = .3;
  const next = later(previous, 1.5);
  next.units[0].cooldown = 1.7; next.units[1].cooldown = 3.3;
  const events = combatSoundsBetween(previous, next);
  assert.deepEqual(events.map(event => event.kind), ["light", "heavy"]);
  assert.deepEqual(events[0].from, { x: 70.5, y: 45.5 });
  assert.equal(events[0].impact, undefined, "a surviving light-fire target does not create a death impact");
  assert.deepEqual(events[1].impact, { x: 70.5, y: 45.5 });
});

test("real fixed-step combat produces inferred shots while ordinary cooldown decay stays silent", () => {
  const previous = fixture([soldier(1, 1, 70.5, 45.5), soldier(2, 2, 72.5, 45.5, "heavy")]);
  const next = structuredClone(previous);
  for (let count = 0; count < 30; count++) step(next, STEP, [], () => {});
  assert.equal(combatSoundsBetween(previous, next).length, 2);
  const cooling = structuredClone(next);
  for (let count = 0; count < 10; count++) step(cooling, STEP, [], () => {});
  assert.deepEqual(combatSoundsBetween(next, cooling), []);
});

test("duplicate, rollback, long catch-up, changed match/map and finished snapshots never replay gunfire", () => {
  const previous = fixture([soldier(1, 1, 70.5, 45.5)]);
  const next = later(previous); next.units[0].cooldown = 3;
  for (const delta of [0, -.5, 4.001, 30, NaN]) {
    const value = structuredClone(next); value.elapsed = previous.elapsed + delta;
    assert.deepEqual(combatSoundsBetween(previous, value), []);
  }
  const changedId = { ...next, id: "another-battle" }, changedMap = { ...next, map: "forest" as const };
  assert.deepEqual(combatSoundsBetween(previous, changedId), []);
  assert.deepEqual(combatSoundsBetween(previous, changedMap), []);
  assert.deepEqual(combatSoundsBetween({ ...previous, result: "won" }, next), []);
  assert.deepEqual(combatSoundsBetween(previous, { ...next, result: "lost" }), []);
  assert.deepEqual(combatSoundsBetween(next, structuredClone(next)), []);
});

test("production, attrition and disappearing enemies alone are not shooting evidence", () => {
  const previous = fixture([soldier(1, 1, 70.5, 45.5), soldier(2, 2, 72.5, 45.5)]);
  previous.units[0].cooldown = 1;
  const next = later(previous);
  next.units[0].hp -= 8; next.units[0].pocketed = true;
  next.units = [next.units[0], { ...soldier(3, 1, 69.5, 44.5), cooldown: 3 }]; next.nextId = 4;
  assert.deepEqual(combatSoundsBetween(previous, next), []);
});

test("tiny cooldown drift and replaced unit identities are ignored", () => {
  const previous = fixture([soldier(1, 1, 70.5, 45.5)]); previous.units[0].cooldown = 2;
  const next = later(previous); next.units[0].cooldown = 1.59;
  assert.deepEqual(combatSoundsBetween(previous, next), []);
  next.units[0].cooldown = 3; next.units[0].team = 2;
  assert.deepEqual(combatSoundsBetween(previous, next), []);
  next.units[0].team = 1; next.units[0].kind = "heavy";
  assert.deepEqual(combatSoundsBetween(previous, next), []);
});

test("light impacts require a plausible removed target and follow explicit attack intent first", () => {
  const shooter = soldier(1, 1, 70.5, 45.5), enemy = soldier(2, 2, 72.5, 45.5);
  shooter.order = { mode: "attack", target: enemy.id };
  const previous = fixture([shooter, enemy]);
  const next = later(previous); next.units = [next.units[0]];
  next.units[0].cooldown = 3; next.units[0].order = { mode: "hold" };
  assert.deepEqual(combatSoundsBetween(previous, next)[0].impact, { x: enemy.x, y: enemy.y });
  const other = soldier(3, 2, 70.5, 46.5);
  previous.units.push(other); next.units.push(structuredClone(enemy));
  next.units[0].order = { mode: "attack", target: enemy.id };
  assert.equal(combatSoundsBetween(previous, next)[0].impact, undefined,
    "an unrelated removed enemy does not replace the surviving explicit target");
});

test("heavy impacts select the nearest valid opponent with stable ID ties", () => {
  const previous = fixture([soldier(1, 1, 70.5, 45.5, "heavy"),
    soldier(3, 2, 71.5, 46.5), soldier(2, 2, 71.5, 44.5)]);
  const next = later(previous); next.units[0].cooldown = 4.5;
  assert.deepEqual(combatSoundsBetween(previous, next)[0].impact, { x: 71.5, y: 44.5 });
  previous.units.reverse(); next.units.reverse();
  assert.deepEqual(combatSoundsBetween(previous, next)[0].impact, { x: 71.5, y: 44.5 });
});

test("inferred impacts cannot cross rock or reach a distant removed unit", () => {
  // Both endpoints are open, but the thin rock edge at tile37,16 blocks the ray.
  const previous = fixture([soldier(1, 1, 37.5, 15.5, "heavy"), soldier(2, 2, 37.5, 17.5)]);
  const next = later(previous); next.units[0].cooldown = 4.5;
  assert.equal(combatSoundsBetween(previous, next)[0].impact, undefined);
  previous.units[0] = soldier(1, 1, 70.5, 45.5); previous.units[1] = soldier(2, 2, 90.5, 45.5);
  const far = later(previous); far.units = [far.units[0]]; far.units[0].cooldown = 3;
  assert.equal(combatSoundsBetween(previous, far)[0].impact, undefined);
});

test("sound bursts are capped in deterministic source-ID order and never mutate snapshots", () => {
  const previous = fixture(Array.from({ length: 70 }, (_, index) => soldier(index + 1, 1, index + .5, 10.5)));
  const next = later(previous); next.units.forEach(unit => { unit.cooldown = 3; }); next.units.reverse();
  const savedPrevious = structuredClone(previous), savedNext = structuredClone(next);
  const events = combatSoundsBetween(previous, next);
  assert.equal(events.length, 32);
  assert.deepEqual(events.map(event => event.from.x), Array.from({ length: 32 }, (_, index) => index + .5));
  assert.deepEqual(previous, savedPrevious); assert.deepEqual(next, savedNext);
  events[0].from.x = -1;
  assert.deepEqual(next, savedNext, "events carry copied positions, not mutable live units");
});
