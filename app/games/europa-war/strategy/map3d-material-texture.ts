import * as THREE from "three";

/** Original seamless surface masks, shared by all field-model batches.
 * R: fine grain, G: broad finish variation, B: woven cloth. No world RNG. */
export function createFieldSurfaceTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 0x35a72c19;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = seed / 4294967296;
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const broad =
        0.5 +
        Math.sin(u * 2 + Math.cos(v * 3)) * 0.18 +
        Math.cos(v * 2 - Math.sin(u * 3)) * 0.16 +
        Math.sin(u * 7 + v * 5) * 0.07;
      const weave =
        0.5 + Math.sin(u * 32) * Math.cos(v * 32) * 0.2 + (grain - 0.5) * 0.12;
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(grain * 255);
      pixels[index + 1] = Math.round(broad * 255);
      pixels[index + 2] = Math.round(weave * 255);
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = "original-field-surface-masks";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
