import { Vector3 } from "three";
import type { Actor, Collider, Difficulty, Loot, Zone } from "./types";

/** Accuracy is the hit probability used by the combat system, not an aim lock. */
export const BOT_DIFFICULTY = {
  easy: {
    reaction: 1.05,
    accuracy: 0.24,
    vision: 65,
    fov: 100,
    moveSpeed: 3.6,
    strafeSpeed: 1.4,
    thinkInterval: 0.38,
    aggression: 0.35,
  },
  normal: {
    reaction: 0.62,
    accuracy: 0.43,
    vision: 85,
    fov: 112,
    moveSpeed: 4.2,
    strafeSpeed: 1.9,
    thinkInterval: 0.26,
    aggression: 0.55,
  },
  hard: {
    reaction: 0.34,
    accuracy: 0.64,
    vision: 110,
    fov: 124,
    moveSpeed: 4.8,
    strafeSpeed: 2.3,
    thinkInterval: 0.2,
    aggression: 0.72,
  },
  insane: {
    reaction: 0.2,
    accuracy: 0.79,
    vision: 135,
    fov: 132,
    moveSpeed: 5.1,
    strafeSpeed: 2.7,
    thinkInterval: 0.16,
    aggression: 0.86,
  },
} satisfies Record<
  Difficulty,
  {
    reaction: number;
    accuracy: number;
    vision: number;
    fov: number;
    moveSpeed: number;
    strafeSpeed: number;
    thinkInterval: number;
    aggression: number;
  }
>;

export interface BotContext {
  actors: Actor[];
  loot: Loot[];
  colliders: Collider[];
  zone: Zone;
  heightAt(x: number, z: number): number;
  time: number;
  shoot(actor: Actor, target: Actor): void;
  pickup(actor: Actor, loot: Loot): void;
  heal(actor: Actor): void;
  reload?(actor: Actor): void;
}

/** Segment/AABB slab test. Unlike mesh raycasts this works without a renderer. */
export function segmentBlocked(
  from: Vector3,
  to: Vector3,
  colliders: Collider[],
  padding = 0,
): boolean {
  for (const collider of colliders) {
    if (collider.destroyed) continue;
    const box = collider.box;
    let near = 0;
    let far = 1;
    let intersects = true;
    for (const axis of ["x", "y", "z"] as const) {
      const start = from[axis];
      const direction = to[axis] - start;
      const min = box.min[axis] - padding;
      const max = box.max[axis] + padding;
      if (Math.abs(direction) < 1e-9) {
        if (start < min || start > max) {
          intersects = false;
          break;
        }
      } else {
        const first = (min - start) / direction;
        const second = (max - start) / direction;
        near = Math.max(near, Math.min(first, second));
        far = Math.min(far, Math.max(first, second));
        if (near > far) {
          intersects = false;
          break;
        }
      }
    }
    if (intersects && near < 0.999 && far > 0.001) return true;
  }
  return false;
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function distanceXZ(a: Vector3, b: Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function yawTo(from: Vector3, to: Vector3) {
  return Math.atan2(from.x - to.x, from.z - to.z);
}
function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let x = Math.imul(value ^ (value >>> 15), 1 | value);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Basic LOS/FOV policy is shared by every difficulty; harder never sees through walls. */
export function canSeeActor(
  actor: Actor,
  other: Actor,
  difficulty: Difficulty,
  colliders: Collider[],
) {
  if (!actor.alive || !other.alive || actor.id === other.id) return false;
  const stats = BOT_DIFFICULTY[difficulty];
  const distance = actor.position.distanceTo(other.position);
  if (distance > stats.vision) return false;
  if (
    Math.abs(angleDelta(actor.yaw, yawTo(actor.position, other.position))) >
    (stats.fov * Math.PI) / 360
  )
    return false;
  return !segmentBlocked(
    actor.position.clone().add(new Vector3(0, actor.crouched ? 1 : 1.5, 0)),
    other.position.clone().add(new Vector3(0, other.crouched ? 0.9 : 1.35, 0)),
    colliders,
  );
}

type Mode = "roam" | "loot" | "engage" | "search" | "cover" | "zone";

export function createBotBrain(
  actor: Actor,
  difficulty: Difficulty,
  seed: number,
) {
  const random = seeded(seed + actor.id * 7411);
  let perception = random() * BOT_DIFFICULTY[difficulty].thinkInterval;
  let target: Actor | null = null;
  let lastSeenAt = -Infinity;
  let acquiredAt = Infinity;
  let shootAfter = 0;
  let healAfter = 0;
  let nextGoalAt = 0;
  let mode: Mode = "roam";
  let lootTarget: Loot | null = null;
  let waypoint: Vector3 | null = null;
  let route: Vector3[] = [];
  let routeAfter = 0;
  let stuckFor = 0;
  let strafeSign = random() < 0.5 ? -1 : 1;
  let turnAfter = 0;
  const lastSeen = actor.position.clone();
  const goal = actor.position.clone();
  const previous = actor.position.clone();
  const body = new Vector3();
  const destination = new Vector3();

  function walkable(from: Vector3, to: Vector3, ctx: BotContext) {
    const height = ctx.heightAt(to.x, to.z);
    if (!Number.isFinite(height) || Math.abs(height - from.y) > 1.3)
      return false;
    body.copy(from).y += 0.9;
    destination.copy(to).y = height + 0.9;
    return !segmentBlocked(body, destination, ctx.colliders, 0.36);
  }

  // Bounded local A* is requested only when direct steering is obstructed.
  // Its waypoints let bots find actual openings instead of pressing into walls.
  function planRoute(ctx: BotContext): Vector3[] {
    const step = 2;
    const origin = actor.position.clone();
    const delta = goal.clone().sub(origin);
    delta.y = 0;
    if (delta.length() > 30) delta.setLength(30);
    const gx = Math.round(delta.x / step);
    const gz = Math.round(delta.z / step);
    type Node = {
      x: number;
      z: number;
      g: number;
      f: number;
      parent: Node | null;
    };
    const start: Node = {
      x: 0,
      z: 0,
      g: 0,
      f: Math.hypot(gx, gz),
      parent: null,
    };
    const open = [start];
    const visited = new Map<string, number>([["0,0", 0]]);
    let nearest = start;
    let nearDistance = start.f;
    const nodePosition = (node: { x: number; z: number }) => {
      const x = origin.x + node.x * step,
        z = origin.z + node.z * step;
      return new Vector3(x, ctx.heightAt(x, z), z);
    };
    // Spatial prefilter avoids testing the entire world's boxes per grid edge.
    const local: BotContext = {
      ...ctx,
      colliders: ctx.colliders.filter(
        (c) =>
          !c.destroyed &&
          c.box.max.x > origin.x - 36 &&
          c.box.min.x < origin.x + 36 &&
          c.box.max.z > origin.z - 36 &&
          c.box.min.z < origin.z + 36,
      ),
    };
    for (let expanded = 0; open.length && expanded < 160; expanded++) {
      let best = 0;
      for (let index = 1; index < open.length; index++)
        if (open[index].f < open[best].f) best = index;
      const node = open.splice(best, 1)[0];
      const distance = Math.hypot(gx - node.x, gz - node.z);
      if (distance < nearDistance) {
        nearest = node;
        nearDistance = distance;
      }
      if (distance <= 1) {
        nearest = node;
        break;
      }
      const from = nodePosition(node);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const x = node.x + dx,
          z = node.z + dz;
        if (Math.abs(x) > 17 || Math.abs(z) > 17) continue;
        const cost = node.g + Math.hypot(dx, dz);
        const key = `${x},${z}`;
        if ((visited.get(key) ?? Infinity) <= cost) continue;
        const next = nodePosition({ x, z });
        if (!walkable(from, next, local)) continue;
        visited.set(key, cost);
        open.push({
          x,
          z,
          g: cost,
          f: cost + Math.hypot(gx - x, gz - z) * 1.15,
          parent: node,
        });
      }
    }
    const path: Vector3[] = [];
    while (nearest.parent) {
      path.push(nodePosition(nearest));
      nearest = nearest.parent;
    }
    return path.reverse();
  }

  function chooseRoam(ctx: BotContext) {
    const angle = random() * Math.PI * 2;
    const radius = 18 + random() * 42;
    const safe = Math.max(3, ctx.zone.radius - 5);
    goal.set(
      actor.position.x + Math.cos(angle) * radius,
      0,
      actor.position.z + Math.sin(angle) * radius,
    );
    const dx = goal.x - ctx.zone.x,
      dz = goal.z - ctx.zone.z;
    const distance = Math.hypot(dx, dz);
    if (distance > safe) {
      goal.x = ctx.zone.x + (dx / distance) * safe;
      goal.z = ctx.zone.z + (dz / distance) * safe;
    }
    goal.y = ctx.heightAt(goal.x, goal.z);
    nextGoalAt = ctx.time + 5 + random() * 5;
    mode = "roam";
    waypoint = null;
    route = [];
  }

  function chooseLoot(ctx: BotContext) {
    let best: Loot | null = null;
    let bestScore = 0;
    for (const item of ctx.loot) {
      // Keys and attachments are player-only inventory. Pursuing an item that
      // pickup cannot consume leaves a bot repeatedly returning to the same spot.
      if (item.taken || item.kind === "attachment" || item.kind === "key")
        continue;
      const distance = distanceXZ(actor.position, item.position);
      if (
        distance > 42 ||
        Math.hypot(item.position.x - ctx.zone.x, item.position.z - ctx.zone.z) >
          ctx.zone.radius - 2
      )
        continue;
      let need = 0;
      if (item.kind === "medkit" && actor.hp < 75) need = 100 - actor.hp;
      if (item.kind === "armor" && actor.armor < 65) need = 85 - actor.armor;
      if (item.kind === "ammo" && actor.reserve < 45) need = 80 - actor.reserve;
      if (item.kind === "weapon" && actor.weapon === "pistol") need = 65;
      if (item.kind === "chest") need = 36;
      const score = need / (distance + 6);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }

  function chooseCover(ctx: BotContext, enemyPosition: Vector3) {
    let best: Vector3 | null = null;
    let bestDistance = Infinity;
    const enemyHead = enemyPosition.clone().add(new Vector3(0, 1.5, 0));
    for (const collider of ctx.colliders) {
      if (collider.destroyed || collider.box.max.y < actor.position.y + 1)
        continue;
      const center = collider.box.getCenter(new Vector3());
      if (distanceXZ(actor.position, center) > 16) continue;
      const away = center.clone().sub(enemyPosition);
      away.y = 0;
      if (away.lengthSq() < 0.01) continue;
      away.normalize();
      const size = collider.box.getSize(new Vector3());
      const point = center.addScaledVector(
        away,
        Math.hypot(size.x, size.z) / 2 + 1.2,
      );
      point.y = ctx.heightAt(point.x, point.z);
      const distance = distanceXZ(point, actor.position);
      const hidden = segmentBlocked(
        enemyHead,
        point.clone().add(new Vector3(0, 1, 0)),
        ctx.colliders,
      );
      if (hidden && distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    if (best) goal.copy(best);
    else {
      const away = actor.position.clone().sub(enemyPosition);
      away.y = 0;
      if (away.lengthSq() > 0.01) away.setLength(10);
      goal.copy(actor.position).add(away);
      goal.y = ctx.heightAt(goal.x, goal.z);
    }
    mode = "cover";
    nextGoalAt = ctx.time + 2.2;
    waypoint = null;
    route = [];
  }

  return {
    setDifficulty(next: Difficulty) {
      difficulty = next;
    },
    /** Read-only state is useful for game diagnostics and behavioral tests. */
    get mode(): Mode {
      return mode;
    },
    update(dt: number, ctx: BotContext) {
      if (!actor.alive || actor.hp <= 0 || dt <= 0 || !Number.isFinite(dt)) {
        actor.speed = 0;
        return;
      }
      const deltaTime = Math.min(dt, 0.1);
      const stats = BOT_DIFFICULTY[difficulty];
      if (actor.ammo <= 0 && actor.reserve > 0) ctx.reload?.(actor);
      const outside =
        Math.hypot(
          actor.position.x - ctx.zone.x,
          actor.position.z - ctx.zone.z,
        ) > Math.max(1, ctx.zone.radius - 6);
      perception -= deltaTime;
      if (perception <= 0) {
        perception = stats.thinkInterval;
        // Nearest visible combatant wins selection, regardless of player ID.
        const candidates = ctx.actors
          .filter(
            (other) =>
              other.id !== actor.id &&
              other.alive &&
              other.hp > 0 &&
              actor.position.distanceToSquared(other.position) <
                stats.vision ** 2,
          )
          .sort(
            (a, b) =>
              actor.position.distanceToSquared(a.position) -
              actor.position.distanceToSquared(b.position),
          );
        const visible = candidates.find((other) =>
          canSeeActor(actor, other, difficulty, ctx.colliders),
        );
        if (visible) {
          if (target?.id !== visible.id || ctx.time - lastSeenAt > 1.2)
            acquiredAt = ctx.time;
          target = visible;
          lastSeen.copy(visible.position);
          lastSeenAt = ctx.time;
        } else if (!target?.alive || ctx.time - lastSeenAt > 5) {
          target = null;
          acquiredAt = Infinity;
        }
        if (!outside && !target) lootTarget = chooseLoot(ctx);
      }

      if (outside) {
        // An actor never chases a target into the damaging ring.
        const vector = actor.position
          .clone()
          .sub(new Vector3(ctx.zone.x, 0, ctx.zone.z));
        vector.y = 0;
        if (vector.lengthSq() > 0)
          vector.setLength(Math.max(0, ctx.zone.radius - 20));
        goal.set(ctx.zone.x + vector.x, 0, ctx.zone.z + vector.z);
        goal.y = ctx.heightAt(goal.x, goal.z);
        if (mode !== "zone") {
          waypoint = null;
          route = [];
        }
        mode = "zone";
      } else if (target?.alive) {
        const visible = canSeeActor(actor, target, difficulty, ctx.colliders);
        const distance = distanceXZ(actor.position, target.position);
        if (visible) {
          lastSeen.copy(target.position);
          lastSeenAt = ctx.time;
        }
        if (
          (actor.hp < 34 || actor.ammo === 0) &&
          (mode !== "cover" || ctx.time > nextGoalAt)
        )
          chooseCover(ctx, lastSeen);
        else if (mode !== "cover" || ctx.time > nextGoalAt) {
          mode = visible ? "engage" : "search";
          const preferredRange =
            actor.weapon === "shotgun"
              ? 9
              : actor.weapon === "sniper"
                ? 52
                : actor.weapon === "smg"
                  ? 17
                  : 30;
          goal.copy(lastSeen);
          if (visible && distance < preferredRange) {
            const away = actor.position.clone().sub(target.position);
            away.y = 0;
            if (away.lengthSq() > 0.01) away.normalize();
            if (ctx.time > turnAfter) {
              strafeSign *= -1;
              turnAfter = ctx.time + 2 + random() * 3;
            }
            const side = new Vector3(-away.z, 0, away.x).multiplyScalar(
              strafeSign * 3.5,
            );
            goal.copy(actor.position).add(side);
            if (distance < preferredRange * 0.5) goal.addScaledVector(away, 4);
          }
          goal.y = ctx.heightAt(goal.x, goal.z);
        }
        if (
          visible &&
          ctx.time - acquiredAt >= stats.reaction &&
          ctx.time >= shootAfter &&
          actor.ammo > 0
        ) {
          const aligned =
            Math.abs(
              angleDelta(actor.yaw, yawTo(actor.position, target.position)),
            ) < 0.25;
          if (aligned) {
            ctx.shoot(actor, target);
            shootAfter = ctx.time + 0.1;
          }
        }
      } else if (lootTarget && !lootTarget.taken) {
        if (mode !== "loot") {
          waypoint = null;
          route = [];
        }
        mode = "loot";
        goal.copy(lootTarget.position);
        if (actor.position.distanceTo(lootTarget.position) < 2.25) {
          ctx.pickup(actor, lootTarget);
          lootTarget = null;
          nextGoalAt = 0;
        }
      } else if (
        ctx.time >= nextGoalAt ||
        distanceXZ(actor.position, goal) < 2 ||
        mode !== "roam"
      )
        chooseRoam(ctx);

      if (
        actor.hp < 58 &&
        ctx.time >= healAfter &&
        (!target ||
          (mode === "cover" &&
            !canSeeActor(actor, target, difficulty, ctx.colliders)))
      ) {
        ctx.heal(actor);
        healAfter = ctx.time + 7;
      }

      actor.crouched = mode === "cover" && distanceXZ(actor.position, goal) < 2;
      while (waypoint && distanceXZ(actor.position, waypoint) <= 0.7)
        waypoint = route.shift() ?? null;
      const destinationPoint = waypoint ?? goal;
      const distance = distanceXZ(actor.position, destinationPoint);
      const desiredYaw =
        target?.alive && ctx.time - lastSeenAt < 1
          ? yawTo(actor.position, lastSeen)
          : yawTo(actor.position, destinationPoint);
      actor.yaw +=
        angleDelta(actor.yaw, desiredYaw) * Math.min(1, deltaTime * 9);
      let speed =
        actor.crouched || distance < 0.6
          ? 0
          : mode === "engage"
            ? stats.strafeSpeed
            : stats.moveSpeed;
      if (mode === "zone") speed *= 1.35;
      const dx =
        (destinationPoint.x - actor.position.x) / Math.max(distance, 0.001);
      const dz =
        (destinationPoint.z - actor.position.z) / Math.max(distance, 0.001);
      const amount = Math.min(distance, speed * deltaTime);
      previous.copy(actor.position);
      const next = actor.position
        .clone()
        .add(new Vector3(dx * amount, 0, dz * amount));
      const lookAhead = actor.position
        .clone()
        .add(
          new Vector3(dx * Math.max(amount, 1), 0, dz * Math.max(amount, 1)),
        );
      if (amount > 0 && walkable(actor.position, next, ctx)) {
        actor.position.copy(next);
        actor.position.y = ctx.heightAt(next.x, next.z);
        stuckFor = 0;
      } else if (amount > 0) {
        stuckFor += deltaTime;
        if (ctx.time >= routeAfter) {
          routeAfter = ctx.time + 0.7 + random() * 0.6;
          route = planRoute(ctx);
          waypoint = route.shift() ?? null;
        }
        // Immediate local steering keeps actors moving between path updates.
        const base = Math.atan2(dz, dx);
        for (const angle of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
          const a = base + angle * strafeSign;
          const probe = actor.position
            .clone()
            .add(new Vector3(Math.cos(a) * amount, 0, Math.sin(a) * amount));
          if (!walkable(actor.position, probe, ctx)) continue;
          actor.position.copy(probe);
          actor.position.y = ctx.heightAt(probe.x, probe.z);
          break;
        }
        if (stuckFor > 4) {
          waypoint = null;
          route = [];
          lootTarget = null;
          chooseRoam(ctx);
          stuckFor = 0;
        }
      }
      // Plan before physically touching a wall; this also helps find doorways.
      if (
        amount > 0 &&
        !waypoint &&
        ctx.time >= routeAfter &&
        !walkable(actor.position, lookAhead, ctx)
      ) {
        routeAfter = ctx.time + 1;
        route = planRoute(ctx);
        waypoint = route.shift() ?? null;
      }
      actor.speed = distanceXZ(previous, actor.position) / deltaTime;
    },
  };
}
