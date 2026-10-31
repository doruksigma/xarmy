import * as THREE from "three";

export type SurfaceKind = "stone" | "masonry" | "wood" | "cloth";

const noise = (x: number, y: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/** Small original tileable surface maps, shared by every material of a kind.
 * These are surface relief only; they never introduce gameplay obstacles. */
export function surfaceMaps(kind: SurfaceKind) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let grain = noise(x, y) * 10;
      if (kind === "wood")
        grain +=
          Math.sin(((x + Math.sin((y * Math.PI) / 64) * 3) * Math.PI) / 8) * 7;
      else if (kind === "cloth")
        grain += (x % 4 < 2 ? 5 : -5) + (y % 4 < 2 ? 5 : -5);
      else grain += noise(Math.floor(x / 8), Math.floor(y / 8)) * 8;
      const i = (y * size + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 226 + grain;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (kind === "masonry") {
    ctx.fillStyle = "#afb6b1";
    for (let row = 0; row < 4; row++) {
      ctx.fillRect(0, row * 64, size, 3);
      for (let column = -1; column < 3; column++)
        ctx.fillRect(column * 128 + (row % 2) * 64, row * 64, 3, 64);
    }
  } else if (kind === "wood") {
    ctx.fillStyle = "#c8cbc2";
    for (let x = 0; x < size; x += 64) ctx.fillRect(x, 0, 2, size);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  // Bump data deliberately has no colour transform.
  const bumpMap = new THREE.CanvasTexture(canvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

/** One sky draw and one instanced cloud draw. Everything sits above/outside
 * the arena, so neither low quality nor cloud movement changes player cover. */
export function createAtmosphere() {
  const group = new THREE.Group();
  const skyGeometry = new THREE.SphereGeometry(130, 24, 12);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      horizon: { value: new THREE.Color("#d9eee0") },
      zenith: { value: new THREE.Color("#66a9c9") },
      sunDirection: { value: new THREE.Vector3(-23, 36, 19).normalize() },
    },
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float elevation = pow(max(direction.y, 0.0), 0.65);
        vec3 colour = mix(horizon, zenith, elevation);
        float facing = max(dot(direction, sunDirection), 0.0);
        colour += vec3(1.0, 0.76, 0.39) * (pow(facing, 40.0) * 0.18 + smoothstep(0.9985, 0.9993, facing) * 0.7);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  group.add(sky);
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 6);
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: "#eaf2e5",
    fog: false,
  });
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 35);
  const matrix = new THREE.Object3D();
  for (let cluster = 0; cluster < 7; cluster++) {
    const angle = (cluster / 7) * Math.PI * 2;
    for (let puff = 0; puff < 5; puff++) {
      matrix.position.set(
        Math.sin(angle) * 57 + (puff - 2) * 3.3,
        25 + noise(cluster, 8) * 8 + Math.sin(puff * 1.1) * 1.3,
        Math.cos(angle) * 57 + Math.sin(puff * 1.4) * 2,
      );
      matrix.scale.set(
        4 + noise(cluster, puff) * 3,
        1.7 + noise(puff, cluster),
        3.7,
      );
      matrix.updateMatrix();
      clouds.setMatrixAt(cluster * 5 + puff, matrix.matrix);
    }
  }
  clouds.computeBoundingSphere();
  group.add(clouds);
  return {
    group,
    palette(horizon: string, forest: boolean) {
      skyMaterial.uniforms.horizon.value.set(horizon);
      skyMaterial.uniforms.zenith.value.set(forest ? "#6daebc" : "#6faacb");
    },
    quality(low: boolean) {
      clouds.visible = !low;
    },
    update(seconds: number) {
      clouds.rotation.y = seconds * 0.003;
    },
    dispose() {
      skyGeometry.dispose();
      skyMaterial.dispose();
      clouds.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
    },
  };
}
