import * as THREE from "three";

/** M40 shell dimensions/parametric surface adapted from Muster WWII, MIT.
 * Copyright (c) 2026 Kenton Wang. Full notice: /licenses/muster-ww2-MIT.txt.
 * Source: Kenton-GMI/muster-ww2@7d2fa86ebc3b999eaf085831cdcd5dccefea63d4
 * src/assets/germany/gear/helmet.ts (shellPoint and its dimensional helpers).
 * Adaptation: bounded map tessellation, rolled rim, head-local coordinates;
 * no hidden liner, separate draw calls, textures or runtime SDF construction.
 */
const SCALE = 2.35;
const BAND_Y = 0.53;
const SEGMENTS = 24;
const RINGS = 8;
const DOME_END = 0.62;
const smooth = (from: number, to: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

function shellPoint(theta: number, v: number, width: number) {
  const s = Math.sin(theta),
    c = Math.cos(theta);
  const degrees =
    (Math.abs(((theta + Math.PI) % (Math.PI * 2)) - Math.PI) * 180) / Math.PI;
  const length = c >= 0 ? 0.1125 : 0.1185;
  const radius = 1 / Math.sqrt((s / 0.0958) ** 2 + (c / length) ** 2);
  const junction = 0.004 + 0.015 * Math.max(0, c) ** 1.5;
  let x: number, y: number, z: number;
  if (v <= DOME_END) {
    const phi = ((v / DOME_END) * Math.PI) / 2;
    const rho = Math.sin(phi) ** 0.82;
    x = s * radius * rho;
    y = junction + (0.131 - junction) * Math.max(0, Math.cos(phi)) ** 1.08;
    z = c * radius * rho - 0.003 * rho;
  } else {
    const w = (v - DOME_END) / (1 - DOME_END);
    const flare =
      0.033 -
      0.007 * smooth(25, 80, degrees) +
      0.018 * smooth(100, 175, degrees);
    const rim =
      -0.014 -
      0.035 * smooth(40, 98, degrees) -
      0.012 * smooth(98, 180, degrees);
    const r = radius + flare * w * w;
    x = s * r;
    y = junction + (rim - junction) * (1 - (1 - w) ** 1.15);
    z = c * r - 0.003;
  }
  return new THREE.Vector3(
    x * SCALE * width,
    BAND_Y + y * SCALE,
    z * SCALE * width,
  );
}

/** Outward-facing asymmetric steel shell, with a deeper neck guard than visor. */
export function createM40HelmetShell(width = 1): THREE.BufferGeometry {
  const safeWidth = Number.isFinite(width)
    ? THREE.MathUtils.clamp(width, 0.85, 1.15)
    : 1;
  const positions: number[] = [],
    indices: number[] = [];
  positions.push(...shellPoint(0, 0, safeWidth).toArray());
  for (let ring = 1; ring <= RINGS; ring++) {
    // More rows around the change from dome to the flared skirt.
    const v =
      ring <= 5
        ? (ring / 5) * DOME_END
        : DOME_END + ((ring - 5) / 3) * (1 - DOME_END);
    for (let column = 0; column < SEGMENTS; column++)
      positions.push(
        ...shellPoint(
          (column / SEGMENTS) * Math.PI * 2,
          v,
          safeWidth,
        ).toArray(),
      );
  }
  for (let column = 0; column < SEGMENTS; column++) {
    const next = (column + 1) % SEGMENTS;
    indices.push(0, 1 + column, 1 + next);
    for (let ring = 0; ring < RINGS - 1; ring++) {
      const a = 1 + ring * SEGMENTS + column,
        b = 1 + ring * SEGMENTS + next;
      const c = a + SEGMENTS,
        d = b + SEGMENTS;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Rolled steel edge is a separate smooth tube following the asymmetric rim.
  const rimStart = positions.length / 3,
    tubeSides = 5,
    bead = 0.0057;
  for (let column = 0; column < SEGMENTS; column++) {
    const theta = (column / SEGMENTS) * Math.PI * 2;
    const center = shellPoint(theta, 1, safeWidth);
    const radial = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    for (let side = 0; side < tubeSides; side++) {
      const phi = (side / tubeSides) * Math.PI * 2;
      positions.push(
        center.x + radial.x * Math.cos(phi) * bead,
        center.y + Math.sin(phi) * bead,
        center.z + radial.z * Math.cos(phi) * bead,
      );
      const a = rimStart + column * tubeSides + side;
      const b = rimStart + ((column + 1) % SEGMENTS) * tubeSides + side;
      const c = rimStart + column * tubeSides + ((side + 1) % tubeSides);
      const d =
        rimStart +
        ((column + 1) % SEGMENTS) * tubeSides +
        ((side + 1) % tubeSides);
      indices.push(a, b, c, c, b, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
