import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Object3D, Vector3 } from "three";
import {
  BOT_DIFFICULTY,
  canSeeActor,
  createBotBrain,
  segmentBlocked,
  type BotContext,
} from "./ai";
import type { Actor, Collider, Difficulty, Loot } from "./types";

function actor(id: number, x = 0, z = 0): Actor {
  return {
    id,
    name: `Actor ${id}`,
    position: new Vector3(x, 0, z),
    yaw: 0,
    hp: 100,
    armor: 50,
    weapon: "m4",
    ammo: 30,
    reserve: 90,
    alive: true,
    crouched: false,
    speed: 0,
  };
}
function wall(
  min: [number, number, number],
  max: [number, number, number],
): Collider {
  return {
    box: new Box3(new Vector3(...min), new Vector3(...max)),
    object: new Object3D(),
    surface: "stone",
  };
}
function context(actors: Actor[]): BotContext {
  return {
    actors,
    loot: [],
    colliders: [],
    zone: { x: 0, z: 0, radius: 250, nextRadius: 150, stage: 0, remaining: 30 },
    time: 0,
    heightAt: () => 0,
    shoot: () => {},
    pickup: () => {},
    heal: () => {},
  };
}
function advance(
  brain: ReturnType<typeof createBotBrain>,
  ctx: BotContext,
  seconds: number,
) {
  for (let count = 0; count < seconds * 20; count++) {
    ctx.time += 0.05;
    brain.update(0.05, ctx);
  }
}

test("segment visibility stops at walls, but not destroyed walls or objects behind the target", () => {
  const start = new Vector3(0, 1.5, 0),
    end = new Vector3(0, 1.5, -10);
  const blocking = wall([-3, 0, -6], [3, 4, -5]);
  assert.equal(segmentBlocked(start, end, [blocking]), true);
  assert.equal(
    segmentBlocked(start, end, [wall([-3, 0, -16], [3, 4, -15])]),
    false,
  );
  assert.equal(
    segmentBlocked(start, new Vector3(5, 1.5, -10), [
      wall([-1, 0, -6], [1, 4, -5]),
    ]),
    false,
  );
  blocking.destroyed = true;
  assert.equal(segmentBlocked(start, end, [blocking]), false);
});

test("every difficulty obeys FOV, range and occlusion", () => {
  const bot = actor(1),
    front = actor(0, 0, -20),
    behind = actor(2, 0, 20),
    far = actor(3, 0, -200);
  for (const difficulty of [
    "easy",
    "normal",
    "hard",
    "insane",
  ] as Difficulty[]) {
    assert.equal(canSeeActor(bot, front, difficulty, []), true);
    assert.equal(canSeeActor(bot, behind, difficulty, []), false);
    assert.equal(canSeeActor(bot, far, difficulty, []), false);
    assert.equal(
      canSeeActor(bot, front, difficulty, [wall([-100, 0, -6], [100, 4, -5])]),
      false,
    );
  }
});

test("visible targets require reaction time and bots fight each other without favoring the player", () => {
  const bot = actor(1),
    player = actor(0, 0, -35),
    rival = actor(2, 0, -12);
  const ctx = context([player, bot, rival]);
  const shots: { time: number; target: number }[] = [];
  ctx.shoot = (_, target) => shots.push({ time: ctx.time, target: target.id });
  const brain = createBotBrain(bot, "easy", 16);
  advance(brain, ctx, 0.9);
  assert.equal(shots.length, 0);
  advance(brain, ctx, 1.2);
  assert.ok(shots.length > 0);
  assert.ok(shots.every((shot) => shot.time >= BOT_DIFFICULTY.easy.reaction));
  assert.ok(shots.every((shot) => shot.target === rival.id));
});

test("losing line of sight ends fire immediately, including during target memory", () => {
  const bot = actor(1),
    enemy = actor(0, 0, -20),
    ctx = context([bot, enemy]);
  let shots = 0;
  ctx.shoot = () => shots++;
  const brain = createBotBrain(bot, "hard", 28);
  advance(brain, ctx, 1.1);
  assert.ok(shots > 0);
  const before = shots;
  ctx.colliders.push(wall([-100, 0, -12], [100, 20, -10]));
  advance(brain, ctx, 0.5);
  assert.equal(shots, before);
});

test("the damaging zone takes priority over chasing or looting", () => {
  const bot = actor(1, 45, 0),
    enemy = actor(0, 60, 0),
    ctx = context([bot, enemy]);
  bot.yaw = -Math.PI / 2;
  ctx.zone.radius = 25;
  const brain = createBotBrain(bot, "hard", 3);
  advance(brain, ctx, 1);
  assert.equal(brain.mode, "zone");
  assert.ok(bot.position.x < 40);
  assert.equal(bot.position.z, 0);
});

test("a bot navigates around a wall to collect needed medicine without crossing its volume", () => {
  const bot = actor(1),
    ctx = context([bot]);
  bot.hp = 40;
  const medicine: Loot = {
    id: 1,
    position: new Vector3(0, 0, -12),
    kind: "medkit",
    rarity: "common",
    taken: false,
  };
  ctx.loot = [medicine];
  const obstacle = wall([-3, 0, -6], [3, 4, -5]);
  ctx.colliders = [obstacle];
  let pickups = 0;
  ctx.pickup = (_, loot) => {
    loot.taken = true;
    pickups++;
  };
  const brain = createBotBrain(bot, "normal", 3);
  for (let count = 0; count < 600 && !pickups; count++) {
    ctx.time += 0.05;
    brain.update(0.05, ctx);
    assert.equal(
      obstacle.box
        .clone()
        .expandByScalar(0.3)
        .containsPoint(bot.position.clone().add(new Vector3(0, 0.9, 0))),
      false,
    );
  }
  assert.equal(pickups, 1);
});

test("empty magazines request reload and injured unobserved bots request healing without spamming", () => {
  const bot = actor(1),
    ctx = context([bot]);
  bot.hp = 45;
  bot.ammo = 0;
  let reloads = 0,
    heals = 0;
  ctx.reload = () => {
    reloads++;
    bot.ammo = 30;
    bot.reserve -= 30;
  };
  ctx.heal = () => {
    heals++;
    bot.hp += 25;
  };
  const brain = createBotBrain(bot, "normal", 1);
  advance(brain, ctx, 3);
  assert.equal(reloads, 1);
  assert.equal(heals, 1);
  assert.equal(bot.hp, 70);
});

test("dead bots cannot move, shoot, loot or heal", () => {
  const bot = actor(1),
    enemy = actor(0, 0, -10),
    ctx = context([bot, enemy]);
  bot.alive = false;
  bot.hp = 0;
  ctx.shoot =
    ctx.heal =
    ctx.pickup =
      () => assert.fail("dead actors must not act");
  const before = bot.position.clone();
  const brain = createBotBrain(bot, "insane", 3);
  advance(brain, ctx, 3);
  assert.deepEqual(bot.position, before);
  assert.equal(bot.speed, 0);
});

test("bots do not get stuck collecting player-only attachments or bunker keys", () => {
  const bot = actor(1),
    ctx = context([bot]);
  bot.armor = 100;
  ctx.loot = [
    {
      id: 1,
      position: bot.position.clone(),
      kind: "attachment",
      attachment: "scope",
      rarity: "rare",
      taken: false,
    },
    {
      id: 2,
      position: bot.position.clone(),
      kind: "key",
      rarity: "legendary",
      taken: false,
    },
  ];
  let attempts = 0;
  // The engine intentionally refuses both item kinds for bots.
  ctx.pickup = () => attempts++;
  const brain = createBotBrain(bot, "normal", 21);
  advance(brain, ctx, 3);
  assert.equal(attempts, 0);
  assert.equal(brain.mode, "roam");
  assert.ok(bot.position.length() > 5, "The bot should continue patrolling");
  assert.ok(ctx.loot.every((item) => !item.taken));
});
