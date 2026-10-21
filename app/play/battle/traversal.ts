import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Actor, Collider } from "./types";

type World = {
  heightAt(x: number, z: number): number;
  colliders: Collider[];
};
type DriveInput = { forward: number; steer: number; brake: boolean };
type VehicleKind = "suv" | "motorcycle" | "buggy";
type Vehicle = {
  root: THREE.Group;
  collider: Collider;
  wheels: { steering: THREE.Group; roll: THREE.Group; front: boolean }[];
  size: THREE.Vector3;
  speed: number;
  yaw: number;
  maxSpeed: number;
  acceleration: number;
  name: string;
  seat: number;
  wheelRadius: number;
};

/** Local, kinematic traversal. No network, physics service or downloaded assets. */
export function createTraversal(scene: THREE.Scene, world: World) {
  const root = new THREE.Group();
  root.name = "Vehicles and cable crossing";
  scene.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const own = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.add(geometry);
    return geometry;
  };
  const material = (color: number, roughness: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mats = {
    paint: material(0x667764, 0.39, 0.65),
    orange: material(0xc18134, 0.38, 0.65),
    bike: material(0x35494d, 0.36, 0.6),
    metal: material(0x262e32, 0.36, 0.85),
    rim: material(0x9fa9aa, 0.3, 0.88),
    rubber: material(0x171b1c, 0.92),
    seat: material(0x302d28, 0.9),
    glass: material(0x477281, 0.12, 0.6),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xfff5ca,
      emissive: 0xffc166,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    }),
    tail: new THREE.MeshStandardMaterial({
      color: 0x991d16,
      emissive: 0xe83b18,
      emissiveIntensity: 0.35,
    }),
  };
  type Material = keyof typeof mats;
  const rounded = own(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 12));
  const tire = own(new THREE.TorusGeometry(0.72, 0.28, 8, 18));
  const hub = own(new THREE.CylinderGeometry(0.64, 0.64, 0.8, 12));
  const wire = own(new THREE.CylinderGeometry(1, 1, 1, 8));
  const ownedColliders: Collider[] = [];
  const vehicles: Vehicle[] = [];
  let ridden: Vehicle | null = null;
  let zip: {
    from: number;
    t: number;
    board: number;
    ground: THREE.Vector3;
  } | null = null;
  let disposed = false;
  const probe = new THREE.Box3();
  const up = new THREE.Vector3(0, 1, 0);

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const object = new THREE.Mesh(geometry, mats[mat]);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.rotation.set(rx, ry, rz);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function bar(
    parent: THREE.Object3D,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius = 0.055,
    mat: Material = "metal",
  ) {
    const line = b.clone().sub(a);
    const object = mesh(
      parent,
      wire,
      mat,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
      radius,
      line.length(),
      radius,
    );
    object.quaternion.setFromUnitVectors(up, line.normalize());
    return object;
  }
  function bake(group: THREE.Group) {
    // Preserve movable wheel groups; merge all static chassis pieces by material.
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      const geometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      const mat = child.material as THREE.Material;
      const batch = batches.get(mat) ?? [];
      batch.push(geometry);
      batches.set(mat, batch);
      group.remove(child);
    }
    for (const [mat, parts] of batches) {
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (!geometry) throw new Error("Vehicle model could not be assembled.");
      const object = new THREE.Mesh(own(geometry), mat);
      object.castShadow = object.receiveShadow = true;
      group.add(object);
    }
  }
  function updateBox(
    vehicle: Vehicle,
    position = vehicle.root.position,
    yaw = vehicle.yaw,
  ) {
    // Conservative rotated AABB prevents driving corners through thin walls.
    const c = Math.abs(Math.cos(yaw)),
      s = Math.abs(Math.sin(yaw));
    const halfX = (vehicle.size.x * c + vehicle.size.z * s) / 2;
    const halfZ = (vehicle.size.z * c + vehicle.size.x * s) / 2;
    probe.min.set(position.x - halfX, position.y + 0.34, position.z - halfZ);
    probe.max.set(
      position.x + halfX,
      position.y + vehicle.size.y,
      position.z + halfZ,
    );
    return probe;
  }
  function collides(box: THREE.Box3, ignore?: Collider) {
    return world.colliders.some(
      (c) =>
        c !== ignore &&
        !c.destroyed &&
        c.box.max.y > box.min.y + 0.06 &&
        c.box.intersectsBox(box),
    );
  }
  function spawnVehicle(kind: VehicleKind, x: number, z: number) {
    const group = new THREE.Group();
    group.name = kind;
    const bike = kind === "motorcycle",
      buggy = kind === "buggy";
    const width = bike ? 0.85 : buggy ? 2.1 : 2.2;
    const length = bike ? 2.3 : buggy ? 3.7 : 4.6;
    const height = bike ? 1.5 : buggy ? 1.8 : 2.2;
    const paint: Material = bike ? "bike" : buggy ? "orange" : "paint";
    const wheelRadius = bike ? 0.42 : 0.49;
    const wheels: Vehicle["wheels"] = [];
    const axles = bike ? [-0.82, 0.82] : [-length * 0.33, length * 0.33];
    for (const axle of axles)
      for (const side of bike ? [0] : [-1, 1]) {
        const steering = new THREE.Group(),
          roll = new THREE.Group();
        steering.position.set(side * width * 0.47, wheelRadius, axle);
        roll.rotation.y = Math.PI / 2;
        mesh(
          roll,
          tire,
          "rubber",
          0,
          0,
          0,
          wheelRadius,
          wheelRadius,
          bike ? 0.23 : 0.43,
        );
        mesh(
          roll,
          hub,
          "rim",
          0,
          0,
          0,
          wheelRadius,
          bike ? 0.18 : 0.3,
          wheelRadius,
          Math.PI / 2,
        );
        for (let spoke = 0; spoke < 6; spoke++) {
          const a = (spoke / 3) * Math.PI;
          mesh(
            roll,
            rounded,
            "metal",
            Math.sin(a) * wheelRadius * 0.33,
            Math.cos(a) * wheelRadius * 0.33,
            0.13,
            wheelRadius * 0.13,
            wheelRadius * 0.7,
            0.055,
            0,
            0,
            -a,
          );
        }
        bake(roll);
        steering.add(roll);
        group.add(steering);
        wheels.push({ steering, roll, front: axle < 0 });
      }
    if (bike) {
      mesh(group, rounded, paint, 0, 0.99, -0.18, 0.62, 0.47, 0.8, -0.13);
      mesh(group, rounded, "seat", 0, 1.13, 0.43, 0.52, 0.18, 0.74);
      mesh(
        group,
        cylinder,
        "metal",
        0,
        0.62,
        0.05,
        0.26,
        0.47,
        0.26,
        0,
        0,
        Math.PI / 2,
      );
      for (const side of [-1, 1]) {
        bar(
          group,
          new THREE.Vector3(side * 0.18, 0.4, -0.82),
          new THREE.Vector3(side * 0.18, 1.31, -0.55),
          0.045,
          "rim",
        );
        bar(
          group,
          new THREE.Vector3(side * 0.2, 0.42, 0.82),
          new THREE.Vector3(side * 0.2, 0.96, -0.35),
          0.055,
        );
      }
      mesh(
        group,
        cylinder,
        "metal",
        0,
        1.4,
        -0.52,
        0.045,
        0.85,
        0.045,
        0,
        0,
        Math.PI / 2,
      );
      mesh(group, rounded, "lamp", 0, 1.14, -0.85, 0.34, 0.25, 0.13);
      mesh(group, rounded, "tail", 0, 1.11, 0.88, 0.26, 0.1, 0.11);
      mesh(
        group,
        cylinder,
        "rim",
        0.28,
        0.48,
        0.5,
        0.09,
        0.9,
        0.09,
        Math.PI / 2,
      );
    } else {
      mesh(
        group,
        rounded,
        "metal",
        0,
        0.53,
        0,
        width * 0.76,
        0.2,
        length * 0.92,
      );
      mesh(
        group,
        rounded,
        paint,
        0,
        0.88,
        0,
        width * 0.92,
        0.57,
        length * 0.86,
      );
      mesh(
        group,
        rounded,
        paint,
        0,
        1.17,
        -length * 0.31,
        width * 0.92,
        0.26,
        length * 0.25,
        0.06,
      );
      mesh(group, rounded, "metal", 0, 0.72, -length * 0.48, width, 0.22, 0.16);
      mesh(group, rounded, "metal", 0, 0.72, length * 0.48, width, 0.22, 0.16);
      for (const side of [-1, 1]) {
        mesh(
          group,
          rounded,
          "lamp",
          side * width * 0.32,
          1.01,
          -length * 0.438,
          0.37,
          0.23,
          0.08,
        );
        mesh(
          group,
          rounded,
          "tail",
          side * width * 0.36,
          1.0,
          length * 0.437,
          0.2,
          0.23,
          0.08,
        );
        mesh(group, rounded, "seat", side * 0.46, 1.04, 0.12, 0.64, 0.16, 0.72);
        mesh(
          group,
          rounded,
          "seat",
          side * 0.46,
          1.41,
          0.42,
          0.62,
          0.72,
          0.18,
          -0.12,
        );
        mesh(
          group,
          rounded,
          "metal",
          side * width * 0.52,
          0.56,
          0.1,
          0.18,
          0.1,
          length * 0.44,
        );
        for (const end of [-1, 1]) {
          bar(
            group,
            new THREE.Vector3(side * width * 0.42, 1.1, end * length * 0.2),
            new THREE.Vector3(
              side * width * 0.37,
              height - 0.1,
              end * length * 0.15,
            ),
            0.07,
          );
          bar(
            group,
            new THREE.Vector3(
              side * width * 0.37,
              height - 0.1,
              -length * 0.15,
            ),
            new THREE.Vector3(side * width * 0.37, height - 0.1, length * 0.15),
            0.06,
          );
        }
        if (!buggy) {
          mesh(
            group,
            rounded,
            paint,
            side * width * 0.43,
            1.2,
            0.05,
            0.13,
            0.5,
            length * 0.42,
          );
          mesh(
            group,
            rounded,
            "glass",
            side * width * 0.4,
            1.75,
            0.05,
            0.035,
            0.55,
            length * 0.38,
          );
          mesh(
            group,
            rounded,
            "metal",
            side * width * 0.49,
            1.72,
            -0.58,
            0.2,
            0.16,
            0.31,
          );
          mesh(
            group,
            rounded,
            "rim",
            side * width * 0.46,
            1.35,
            0.18,
            0.045,
            0.06,
            0.21,
          );
        }
      }
      if (!buggy) {
        mesh(
          group,
          rounded,
          "glass",
          0,
          1.75,
          -length * 0.19,
          width * 0.76,
          0.57,
          0.045,
          -0.25,
        );
        mesh(
          group,
          rounded,
          "glass",
          0,
          1.73,
          length * 0.2,
          width * 0.76,
          0.57,
          0.045,
          0.1,
        );
        mesh(
          group,
          rounded,
          paint,
          0,
          height - 0.1,
          0.01,
          width * 0.83,
          0.16,
          length * 0.43,
        );
        for (const side of [-1, 1])
          mesh(
            group,
            rounded,
            "metal",
            side * width * 0.32,
            height + 0.02,
            0.05,
            0.07,
            0.11,
            length * 0.36,
          );
      } else {
        bar(
          group,
          new THREE.Vector3(-0.8, 1.75, 0.56),
          new THREE.Vector3(0.8, 1.13, 0.56),
          0.055,
        );
        bar(
          group,
          new THREE.Vector3(0.8, 1.75, 0.56),
          new THREE.Vector3(-0.8, 1.13, 0.56),
          0.055,
        );
      }
      for (let vent = -3; vent <= 3; vent++)
        mesh(
          group,
          rounded,
          "metal",
          vent * 0.13,
          0.96,
          -length * 0.44,
          0.055,
          0.23,
          0.055,
        );
    }
    bake(group);
    root.add(group);
    const collider: Collider = {
      object: group,
      box: new THREE.Box3(),
      surface: "metal",
    };
    const vehicle: Vehicle = {
      root: group,
      collider,
      wheels,
      size: new THREE.Vector3(width, height, length),
      speed: 0,
      yaw: 0,
      maxSpeed: bike ? 28 : buggy ? 25 : 20,
      acceleration: bike ? 14 : buggy ? 12 : 9,
      name: bike ? "Motosiklet" : buggy ? "Arazi aracı" : "SUV",
      seat: bike ? 0.85 : 1.0,
      wheelRadius,
    };
    // Deterministic nearby search avoids random crates and building corners.
    let found = false;
    for (let ring = 0; ring <= 20 && !found; ring += 2)
      for (let i = 0; i < 12 && !found; i++) {
        const angle = (i / 12) * Math.PI * 2;
        group.position.set(
          x + Math.cos(angle) * ring,
          0,
          z + Math.sin(angle) * ring,
        );
        group.position.y = world.heightAt(group.position.x, group.position.z);
        found = !collides(updateBox(vehicle));
      }
    if (!found) {
      root.remove(group);
      return;
    }
    collider.box.copy(updateBox(vehicle));
    world.colliders.push(collider);
    ownedColliders.push(collider);
    vehicles.push(vehicle);
  }

  spawnVehicle("suv", 0, 30);
  spawnVehicle("motorcycle", -130, 120);
  spawnVehicle("buggy", 130, 90);

  const stations = [
    new THREE.Vector3(25, 0, 55),
    new THREE.Vector3(-100, 0, 100),
  ];
  for (const p of stations) p.y = world.heightAt(p.x, p.z);
  let cableHeight = Math.max(...stations.map((p) => p.y)) + 10;
  for (let i = 0; i <= 24; i++) {
    const p = stations[0].clone().lerp(stations[1], i / 24);
    cableHeight = Math.max(cableHeight, world.heightAt(p.x, p.z) + 6);
  }
  const cablePoints = stations.map(
    (p) => new THREE.Vector3(p.x, cableHeight, p.z),
  );
  const cableCurve = new THREE.QuadraticBezierCurve3(
    cablePoints[0],
    cablePoints[0]
      .clone()
      .lerp(cablePoints[1], 0.5)
      .add(new THREE.Vector3(0, -3, 0)),
    cablePoints[1],
  );
  const cableMesh = new THREE.Mesh(
    own(new THREE.TubeGeometry(cableCurve, 48, 0.035, 5, false)),
    mats.metal,
  );
  root.add(cableMesh);
  for (const station of stations) {
    const tower = new THREE.Group();
    tower.position.copy(station);
    root.add(tower);
    const height = cableHeight - station.y;
    for (const side of [-1, 1]) {
      mesh(
        tower,
        rounded,
        "metal",
        side * 1.2,
        height / 2,
        0,
        0.15,
        height,
        0.15,
      );
      const object = new THREE.Object3D();
      object.position.set(station.x + side * 1.2, station.y, station.z);
      root.add(object);
      const c: Collider = {
        object,
        surface: "metal",
        box: new THREE.Box3(
          new THREE.Vector3(
            object.position.x - 0.15,
            station.y,
            station.z - 0.15,
          ),
          new THREE.Vector3(
            object.position.x + 0.15,
            cableHeight,
            station.z + 0.15,
          ),
        ),
      };
      world.colliders.push(c);
      ownedColliders.push(c);
    }
    mesh(tower, rounded, "orange", 0, height, 0, 2.8, 0.24, 0.25);
    mesh(tower, rounded, "orange", 0, 1.1, 0.4, 0.45, 0.85, 0.25);
    mesh(tower, cylinder, "rim", 0, 1.22, 0.57, 0.14, 0.07, 0.14, Math.PI / 2);
    for (let y = 0.5; y < height; y += 0.5)
      mesh(tower, rounded, "rim", 0.92, y, 0, 0.48, 0.05, 0.1);
    for (let y = 0; y < height - 1; y += 2)
      bar(
        tower,
        new THREE.Vector3(-1.2, y, 0),
        new THREE.Vector3(1.2, Math.min(height, y + 2), 0),
        0.028,
      );
    bake(tower);
  }

  function nearestVehicle(player: Actor) {
    let best: Vehicle | null = null,
      distance = Infinity;
    for (const vehicle of vehicles) {
      const d = player.position.distanceTo(vehicle.root.position);
      if (d < Math.max(vehicle.size.z / 2 + 1.6, 3.2) && d < distance) {
        best = vehicle;
        distance = d;
      }
    }
    return best;
  }
  function nearestStation(player: Actor) {
    return stations.findIndex(
      (station) => player.position.distanceTo(station) < 3,
    );
  }
  function safeExit(player: Actor, vehicle: Vehicle) {
    for (const angle of [
      Math.PI / 2,
      -Math.PI / 2,
      Math.PI,
      0,
      Math.PI / 4,
      -Math.PI / 4,
    ]) {
      const distance =
        angle === Math.PI || angle === 0
          ? vehicle.size.z / 2 + 1
          : vehicle.size.x / 2 + 1;
      const a = angle + vehicle.yaw;
      const x = vehicle.root.position.x + Math.sin(a) * distance;
      const z = vehicle.root.position.z + Math.cos(a) * distance;
      const y = world.heightAt(x, z);
      probe.min.set(x - 0.38, y + 0.1, z - 0.38);
      probe.max.set(x + 0.38, y + 1.85, z + 0.38);
      if (Math.abs(x) < 296 && Math.abs(z) < 296 && !collides(probe)) {
        player.position.set(x, y, z);
        player.speed = 0;
        return true;
      }
    }
    return false;
  }
  function interact(player: Actor) {
    if (disposed || !player.alive) return false;
    if (zip) {
      zip = null;
      player.speed = 0;
      return true;
    }
    if (ridden) {
      if (safeExit(player, ridden)) {
        ridden.speed = 0;
        ridden = null;
      }
      return true;
    }
    const vehicle = nearestVehicle(player);
    if (vehicle) {
      ridden = vehicle;
      player.crouched = false;
      player.speed = 0;
      return true;
    }
    const station = nearestStation(player);
    if (station >= 0) {
      zip = { from: station, t: 0, board: 0, ground: player.position.clone() };
      player.crouched = false;
      player.speed = 0;
      return true;
    }
    return false;
  }
  function prompt(player: Actor) {
    if (zip) return "E · Hattan ayrıl";
    if (ridden)
      return `${ridden.name} · W/S gaz · A/D yön · Boşluk fren · E in`;
    const vehicle = nearestVehicle(player);
    if (vehicle) return `E · ${vehicle.name} kullan`;
    if (nearestStation(player) >= 0) return "E · Zipline vinciyle karşıya geç";
    return "";
  }
  function update(dt: number, player: Actor, input: DriveInput) {
    if (disposed || !player.alive) {
      ridden = null;
      zip = null;
      return false;
    }
    dt = THREE.MathUtils.clamp(dt, 0, 0.1);
    if (zip) {
      const endpoint = cablePoints[zip.from]
        .clone()
        .add(new THREE.Vector3(0, -2, 0));
      if (zip.board < 1) {
        zip.board = Math.min(1, zip.board + dt * 0.65);
        const t = zip.board * zip.board * (3 - 2 * zip.board);
        player.position.copy(zip.ground).lerp(endpoint, t);
        player.speed = 0;
      } else {
        zip.t = Math.min(
          1,
          zip.t + (24 * dt) / stations[0].distanceTo(stations[1]),
        );
        const t = zip.from === 0 ? zip.t : 1 - zip.t;
        player.position
          .copy(cableCurve.getPoint(t))
          .add(new THREE.Vector3(0, -2, 0));
        const tangent = cableCurve
          .getTangent(t)
          .multiplyScalar(zip.from === 0 ? 1 : -1);
        player.yaw = Math.atan2(-tangent.x, -tangent.z);
        player.speed = 24;
        if (zip.t >= 1) {
          // Release in the air; the normal falling/parachute controller lands the actor.
          zip = null;
          player.speed = 0;
        }
      }
      return true;
    }
    if (!ridden) return false;
    const v = ridden;
    const throttle = THREE.MathUtils.clamp(input.forward, -1, 1);
    const steering = THREE.MathUtils.clamp(input.steer, -1, 1);
    if (input.brake) v.speed *= Math.exp(-dt * 8);
    else if (Math.abs(throttle) > 0.05)
      v.speed += throttle * v.acceleration * dt;
    else v.speed *= Math.exp(-dt * 1.5);
    v.speed = THREE.MathUtils.clamp(v.speed, -v.maxSpeed * 0.35, v.maxSpeed);
    const movement = v.speed * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(movement) / 0.4));
    for (let step = 0; step < steps; step++) {
      const yaw =
        v.yaw -
        (steering *
          Math.min(1.5, Math.abs(v.speed) * 0.12) *
          Math.sign(v.speed) *
          dt) /
          steps;
      const next = v.root.position
        .clone()
        .add(
          new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(
            movement / steps,
          ),
        );
      const ground = world.heightAt(next.x, next.z);
      const rise = ground - v.root.position.y;
      next.y = ground;
      const tooSteep =
        Math.abs(rise) > Math.max(0.65, Math.abs(movement / steps) * 0.8);
      if (
        Math.abs(next.x) > 294 ||
        Math.abs(next.z) > 294 ||
        ground < -1.7 ||
        tooSteep ||
        collides(updateBox(v, next, yaw), v.collider)
      ) {
        v.speed *= -0.12;
        break;
      }
      v.root.position.copy(next);
      v.yaw = yaw;
    }
    const front = world.heightAt(
      v.root.position.x - Math.sin(v.yaw) * v.size.z * 0.3,
      v.root.position.z - Math.cos(v.yaw) * v.size.z * 0.3,
    );
    const rear = world.heightAt(
      v.root.position.x + Math.sin(v.yaw) * v.size.z * 0.3,
      v.root.position.z + Math.cos(v.yaw) * v.size.z * 0.3,
    );
    v.root.rotation.set(
      THREE.MathUtils.clamp(
        Math.atan2(front - rear, v.size.z * 0.6),
        -0.35,
        0.35,
      ),
      v.yaw,
      ((-steering * v.speed) / v.maxSpeed) * 0.055,
      "YXZ",
    );
    v.collider.box.copy(updateBox(v));
    for (const wheel of v.wheels) {
      wheel.steering.rotation.y = wheel.front ? -steering * 0.36 : 0;
      wheel.roll.rotation.z -= (v.speed * dt) / v.wheelRadius;
    }
    player.position.copy(v.root.position).add(new THREE.Vector3(0, v.seat, 0));
    player.yaw = v.yaw;
    player.speed = Math.abs(v.speed);
    return true;
  }
  return {
    interact,
    prompt,
    update,
    occupiedCollider: () => ridden?.collider ?? null,
    active: (): "vehicle" | "zipline" | null =>
      ridden ? "vehicle" : zip ? "zipline" : null,
    dispose() {
      if (disposed) return;
      disposed = true;
      ridden = null;
      zip = null;
      root.removeFromParent();
      for (const collider of ownedColliders) {
        const index = world.colliders.indexOf(collider);
        if (index >= 0) world.colliders.splice(index, 1);
      }
      for (const geometry of geometries) geometry.dispose();
      for (const mat of Object.values(mats)) mat.dispose();
    },
  };
}
