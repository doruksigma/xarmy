import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createTraversal } from "./traversal";
import type { Actor, Collider } from "./types";

const playerAt = (x: number, z: number): Actor => ({
  id: 0,
  name: "Driver",
  position: new THREE.Vector3(x, 0, z),
  yaw: 0,
  hp: 100,
  armor: 0,
  weapon: "pistol",
  ammo: 12,
  reserve: 12,
  alive: true,
  crouched: false,
  speed: 0,
});
const gas = { forward: 1, steer: 0, brake: false };
const idle = { forward: 0, steer: 0, brake: false };

test("all three vehicles accelerate, brake and let the player leave safely", () => {
  const scene = new THREE.Scene();
  const world = { heightAt: () => 0, colliders: [] as Collider[] };
  const traversal = createTraversal(scene, world);
  try {
    for (const [x, z] of [
      [0, 30],
      [-130, 120],
      [130, 90],
    ]) {
      const player = playerAt(x + 2, z);
      assert.match(traversal.prompt(player), /kullan/);
      assert.equal(traversal.interact(player), true);
      assert.equal(traversal.active(), "vehicle");
      for (let i = 0; i < 120; i++) traversal.update(1 / 60, player, gas);
      assert.ok(player.position.z < z - 10);
      for (let i = 0; i < 120; i++)
        traversal.update(1 / 60, player, { ...idle, brake: true });
      assert.ok(player.speed < 0.01);
      assert.equal(traversal.interact(player), true);
      assert.equal(traversal.active(), null);
      assert.equal(player.position.y, 0);
      assert.equal(
        world.colliders.some((c) =>
          c.box.containsPoint(
            player.position.clone().add(new THREE.Vector3(0, 1, 0)),
          ),
        ),
        false,
      );
    }
  } finally {
    traversal.dispose();
  }
  traversal.dispose();
  assert.equal(world.colliders.length, 0);
  assert.equal(scene.children.length, 0);
});

test("a moving vehicle cannot tunnel through a thin wall", () => {
  const wall: Collider = {
    box: new THREE.Box3(
      new THREE.Vector3(-5, 0, 15),
      new THREE.Vector3(5, 5, 15.15),
    ),
    object: new THREE.Object3D(),
    surface: "stone",
  };
  const world = { heightAt: () => 0, colliders: [wall] };
  const traversal = createTraversal(new THREE.Scene(), world);
  const player = playerAt(2, 30);
  try {
    traversal.interact(player);
    for (let i = 0; i < 150; i++) traversal.update(0.1, player, gas);
    assert.ok(player.position.z > 17.4);
  } finally {
    traversal.dispose();
  }
  assert.deepEqual(world.colliders, [wall]);
});

test("zipline boards from the ground, crosses the cable, and releases into a fall", () => {
  const traversal = createTraversal(new THREE.Scene(), {
    heightAt: () => 0,
    colliders: [],
  });
  const player = playerAt(25, 55);
  try {
    assert.match(traversal.prompt(player), /Zipline/);
    traversal.interact(player);
    let top = 0;
    for (let i = 0; i < 600 && traversal.active(); i++) {
      traversal.update(1 / 60, player, idle);
      top = Math.max(top, player.position.y);
    }
    assert.equal(traversal.active(), null);
    assert.ok(top > 7);
    assert.ok(
      player.position.distanceTo(new THREE.Vector3(-100, 8, 100)) < 0.1,
    );
    assert.equal(traversal.update(1 / 60, player, idle), false);
  } finally {
    traversal.dispose();
  }
});
