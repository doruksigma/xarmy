import * as THREE from "three";
import { MAP } from "./world";
import { containsProvincePoint, heightAt } from "./map3d-geometry";
import {
  GRAPHICS_QUALITY,
  visualRandom,
  visualSeed,
  type GraphicsQuality,
} from "./map3d-visuals";
import type { World } from "./types";

type Item = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  angle: number;
  color: number;
};
/** Original procedural miniatures, batched by material/shape rather than one draw per building. */
export function createScenery(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
  });
  const geometries = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ConeGeometry(0.72, 1, 4),
    new THREE.CylinderGeometry(0.25, 0.4, 1, 5),
    new THREE.ConeGeometry(0.8, 1, 7),
    new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  ];
  const meshes = geometries.map((geometry, i) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      i === 1 ? roofMaterial : material,
      18000,
    );
    mesh.count = 0;
    mesh.castShadow = i !== 3;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  });
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  let quality: GraphicsQuality = "medium",
    current: World | null = null,
    signature = "";
  function update(world: World) {
    current = world;
    const construction = new Set(
      Object.values(world.countries).flatMap((c) =>
        c.construction.map((q) => q.province),
      ),
    );
    const nextSignature =
      quality +
      MAP.provinces
        .map((p) => {
          const state = world.provinces[p.id];
          return `${p.id}:${state.buildings.civil},${state.buildings.military},${state.buildings.airfield},${state.buildings.dock},${state.buildings.refinery},${state.damage > 35},${state.damage > 50},${construction.has(p.id)}`;
        })
        .join("|");
    if (nextSignature === signature) return;
    signature = nextSignature;
    const items: Item[][] = geometries.map(() => []);
    const density = GRAPHICS_QUALITY[quality].scenery;
    function item(
      kind: number,
      x: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      tint: number,
      angle = 0,
      lift = 0,
    ) {
      items[kind].push({
        x: x - MAP.width / 2,
        z: z - MAP.height / 2,
        y: heightAt(x, z) + sy / 2 + lift,
        sx,
        sy,
        sz,
        angle,
        color: tint,
      });
    }
    for (const p of MAP.provinces) {
      const state = world.provinces[p.id];
      if (!state) continue;
      const random = visualRandom(visualSeed(p.id));
      const urban = p.terrain === "urban";
      const homes = Math.min(
        20,
        3 + Math.floor(p.population / 170000) + (urban ? 5 : 0),
      );
      for (let i = 0; i < homes; i++) {
        const x = p.x + (random() - 0.5) * 12,
          z = p.y + (random() - 0.5) * 12;
        const size = 0.7 + random() * 1.4,
          height = 1.3 + random() * (urban ? 4 : 1.8),
          keep = random();
        if (keep > density || !containsProvincePoint(p.id, x, z)) continue;
        const damaged = state.damage > 35 && i % 3 === 0;
        item(
          0,
          x,
          z,
          size,
          damaged ? height * 0.4 : height,
          size,
          damaged ? 0x514a3d : 0xc3b69b,
        );
        if (!damaged)
          item(
            1,
            x,
            z,
            size + 0.15,
            0.8,
            size + 0.15,
            0x725346,
            Math.PI / 4,
            height - 0.2,
          );
      }
      if (p.terrain === "forest" || p.terrain === "mountain") {
        const amount = p.terrain === "forest" ? 22 : 9;
        for (let i = 0; i < amount; i++) {
          const x = p.x + (random() - 0.5) * 35,
            z = p.y + (random() - 0.5) * 35,
            size = 1.6 + random() * 2;
          if (random() > density || !containsProvincePoint(p.id, x, z))
            continue;
          item(2, x, z, 0.5, size, 0.5, 0x655544);
          item(3, x, z, size, size * 1.7, size, 0x3d5c42, 0, size * 0.45);
        }
      }
      for (
        let i = 0;
        i < Math.min(3, state.buildings.military + state.buildings.civil);
        i++
      ) {
        const x = p.x + 4 + i * 3.5,
          z = p.y + 5;
        if (!containsProvincePoint(p.id, x, z)) continue;
        item(0, x, z, 3, 1.8, 2.4, state.damage > 50 ? 0x4d4a43 : 0x7a8075);
        if (density > 0.4) item(4, x + 1, z + 0.7, 0.65, 4, 0.65, 0x686056);
      }
      if (state.buildings.airfield > 0) {
        item(0, p.x - 5, p.y, 1, 0.12, 12, 0x46504c);
        item(0, p.x - 7, p.y + 3, 3, 1.8, 3, 0x8b9186);
      }
      if (state.buildings.dock > 0 && p.port) {
        item(0, p.x, p.y + 6, 6, 0.5, 1, 0x746552);
        item(0, p.x + 2, p.y + 8, 1, 0.5, 5, 0x746552);
      }
      if (state.buildings.refinery > 0) {
        item(4, p.x - 3, p.y - 4, 2.4, 2.8, 2.4, 0xb1b4a5);
        item(4, p.x, p.y - 4, 2.4, 2.8, 2.4, 0xb1b4a5);
      }
      if (construction.has(p.id)) {
        item(0, p.x + 4, p.y - 3, 0.35, 7, 0.35, 0xd7ad53);
        item(0, p.x + 2, p.y - 3, 4, 0.35, 0.35, 0xd7ad53, 0, 6.5);
      }
    }
    meshes.forEach((mesh, kind) => {
      mesh.count = Math.min(items[kind].length, 18000);
      for (let i = 0; i < mesh.count; i++) {
        const p = items[kind][i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.rotation.set(0, p.angle, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setHex(p.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }
  return {
    update,
    setQuality(value: GraphicsQuality) {
      quality = value;
      if (current) update(current);
    },
    updateLOD(distance: number) {
      meshes[2].visible = distance < 1100;
      meshes[3].visible = distance < 1100;
      meshes[1].visible = distance < 1500;
    },
    dispose() {
      scene.remove(group);
      meshes.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      material.dispose();
      roofMaterial.dispose();
    },
  };
}
