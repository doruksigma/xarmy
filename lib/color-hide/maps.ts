import type { MapDefinition, MapId, MapObject } from "./types";

// Original compact arenas. These same objects are used by server collision and
// ray tests, so a rendered wall cannot be bypassed by client-supplied positions.
function arena(
  id: MapId,
  name: string,
  subtitle: string,
  ground: string,
  sky: string,
  palette: string[],
): MapDefinition {
  return {
    id,
    name,
    subtitle,
    ground,
    sky,
    palette,
    halfSize: 32,
    spawn: { x: 0, y: 0, z: 24 },
    spawns: [-4, -2, 0, 2, 4].map((x) => ({ x, y: 0, z: 24 })),
    objects: [],
  };
}
function add(
  map: MapDefinition,
  kind: MapObject["kind"],
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  color: string,
  solid = true,
  y = 0,
) {
  map.objects.push({
    id: `${map.id}-${map.objects.length}`,
    kind,
    x,
    z,
    width,
    depth,
    height,
    color,
    solid,
    y,
  });
}
function border(map: MapDefinition, color: string, height = 2.8) {
  add(map, "wall", 0, -32, 65, 1, height, color);
  add(map, "wall", 0, 32, 65, 1, height, color);
  add(map, "wall", -32, 0, 1, 64, height, color);
  add(map, "wall", 32, 0, 1, 64, height, color);
}
// Two doorways provide a through route rather than a dead-end box. Roofs are
// above standing head height and participate in authoritative bullet occlusion.
function room(
  map: MapDefinition,
  x: number,
  z: number,
  w: number,
  d: number,
  color: string,
  roof: string,
) {
  const h = 3.7,
    door = 2.8,
    wing = (w - door) / 2;
  add(map, "wall", x - w / 2, z, 0.45, d, h, color);
  add(map, "wall", x + w / 2, z, 0.45, d, h, color);
  for (const side of [-1, 1]) {
    add(
      map,
      "wall",
      x - (door + wing) / 2,
      z + (side * d) / 2,
      wing,
      0.45,
      h,
      color,
    );
    add(
      map,
      "wall",
      x + (door + wing) / 2,
      z + (side * d) / 2,
      wing,
      0.45,
      h,
      color,
    );
    add(map, "wall", x, z + (side * d) / 2, door, 0.45, 0.8, color, true, 2.9);
  }
  add(map, "roof", x, z, w + 0.7, d + 0.7, 0.35, roof, true, h);
}

const forest = arena(
  "forest",
  "Orman",
  "Yosunlu kayalar · gizli mağaralar · yaprak örtüsü",
  "#648e55",
  "#b9dfdf",
  ["#648e55", "#345c43", "#99b36c", "#827c6d", "#674e3a", "#c3b78b"],
);
border(forest, "#456348", 2.5);
for (const [x, z, s] of [
  [-24, -23, 1],
  [-17, -25, 1.2],
  [-5, -25, 1],
  [7, -24, 1.25],
  [22, -24, 1.2],
  [27, -14, 1],
  [-27, -10, 1.1],
  [-22, 0, 1.2],
  [-25, 12, 1],
  [25, 9, 1.25],
  [22, 20, 1],
  [-18, 24, 1.1],
  [-12, 12, 1],
  [12, 12, 1.3],
  [-11, -9, 1.2],
  [10, -10, 1.1],
  [-4, 3, 1],
  [7, 3, 1.1],
  [18, -2, 1.1],
  [-19, -13, 1],
]) {
  add(forest, "tree", x, z, 0.9 * s, 0.9 * s, 4.3 * s, "#674e3a");
}
for (const [x, z, w, d] of [
  [-15, -1, 3.8, 2.5],
  [-11, 1, 3, 2.2],
  [13, -20, 3, 2.5],
  [18, 13, 4, 2],
  [-24, 19, 3, 3],
  [23, -8, 3, 2],
  [-2, -13, 4, 2],
  [-7, 18, 3.2, 2],
  [8, 20, 3, 2.2],
  [13, 1, 2.8, 2],
]) {
  add(forest, "bush", x, z, w, d, 1.6, "#345c43", false);
}
for (const [x, z, w, d, h] of [
  [-18, 6, 4, 3, 2.5],
  [16, -13, 3.5, 4, 2.8],
  [-8, -18, 3.2, 2.8, 2.2],
  [8, 8, 2.4, 3.6, 1.8],
  [24, 25, 3, 2.5, 2.2],
  [-25, -26, 3, 3, 2],
])
  add(forest, "rock", x, z, w, d, h, "#827c6d");
// Walk-through cave with a daylight exit; its collision is also its geometry.
add(forest, "rock", -22, -19, 2.5, 8, 3.7, "#827c6d");
add(forest, "rock", -14, -19, 2.5, 8, 3.7, "#827c6d");
add(forest, "roof", -18, -19, 10, 8, 0.85, "#827c6d", true, 3.7);
add(forest, "crate", -3, -3, 1.8, 1.8, 1.4, "#a68454");
add(forest, "crate", -5, -4, 1.5, 1.5, 1.7, "#a68454");
add(forest, "bench", 0, 13, 3, 1, 1.3, "#b29564");
add(forest, "sign", -5, 23, 1.4, 0.3, 2.5, "#e4bd6b", false);

const city = arena(
  "city",
  "Şehir",
  "Renkli dükkânlar · ara sokaklar · küçük avlular",
  "#b9b6ac",
  "#bddbea",
  ["#c9876d", "#7aa6a4", "#c6bda3", "#779290", "#586575", "#c8b4d4"],
);
border(city, "#94a2a0", 3);
room(city, -17, -16, 13, 13, "#c9876d", "#91594b");
room(city, 16, -17, 14, 12, "#7aa6a4", "#44646f");
room(city, -18, 9, 12, 10, "#c6bda3", "#7b7665");
room(city, 18, 11, 12, 12, "#c8b4d4", "#796784");
for (const [x, z, c] of [
  [-21, -18, "#a76e53"],
  [-13, -13, "#a76e53"],
  [12, -20, "#648a87"],
  [20, -15, "#648a87"],
  [-21, 9, "#9b8968"],
  [21, 11, "#a38bb0"],
] as const)
  add(city, "crate", x, z, 2.6, 1.6, 1.5, c);
add(city, "car", -6, -9, 2.3, 4.5, 1.6, "#e8af56");
add(city, "car", 7, 7, 2.3, 4.5, 1.6, "#6d95b0");
add(city, "car", -6, 16, 2.3, 4.5, 1.6, "#bd6e77");
for (const [x, z] of [
  [-8, -26],
  [8, -26],
  [-8, 27],
  [8, 27],
])
  add(city, "lamp", x, z, 0.35, 0.35, 4.5, "#435461");
for (const [x, z] of [
  [-26, -1],
  [25, -1],
  [13, 27],
  [-14, 27],
])
  add(city, "bench", x, z, 3, 1, 1.3, "#927658");
for (const [x, z] of [
  [-27, -26],
  [27, -26],
  [-27, 26],
  [27, 26],
]) {
  add(city, "tree", x, z, 0.8, 0.8, 3.6, "#78634d");
  add(city, "bush", x, z, 2.5, 2.5, 1.3, "#779290", false);
}
add(city, "sign", -17, -9, 3.8, 0.2, 1.1, "#f2d38d", false, 2.3);
add(city, "sign", 16, -10.5, 4, 0.2, 1.1, "#b7dbdd", false, 2.3);

const school = arena(
  "school",
  "Okul",
  "Sınıflar · dolap koridorları · spor salonu",
  "#c4c2ac",
  "#d7e4de",
  ["#c4c2ac", "#789c91", "#ba896f", "#7795ad", "#7d8870", "#d0b782"],
);
border(school, "#7d9486", 3.2);
room(school, -18, -17, 16, 13, "#d8cba6", "#8c9d8d");
room(school, 18, -17, 16, 13, "#b9d0c7", "#7c9a8c");
room(school, -18, 8, 16, 13, "#d4b4a4", "#a28b7e");
room(school, 18, 8, 16, 16, "#b8c6d0", "#788b9b");
for (const [cx, cz] of [
  [-18, -17],
  [18, -17],
  [-18, 8],
]) {
  for (const dx of [-4, 4])
    for (const dz of [-3, 2])
      add(school, "desk", cx + dx, cz + dz, 2.4, 1.5, 1.05, "#d0b782");
  add(school, "wall", cx, cz - 5.9, 7, 0.15, 1.7, "#40635a", true, 1);
}
for (const z of [-18, -14, -10, 1, 5, 9]) {
  add(school, "locker", -7, z, 1, 2.8, 2.4, "#789c91");
  add(school, "locker", 7, z, 1, 2.8, 2.4, "#7795ad");
}
for (const z of [3, 12]) add(school, "bench", 22, z, 4, 1, 1.3, "#ba896f");
add(school, "crate", 13, 4, 2.6, 2.6, 1.8, "#7795ad");
add(school, "crate", 13, 12, 2.6, 2.6, 1.8, "#ba896f");
for (const [x, z] of [
  [-26, 25],
  [25, 26],
])
  add(school, "tree", x, z, 0.8, 0.8, 4, "#7d8870");
add(school, "bench", -14, 25, 4, 1, 1.3, "#9f8966");
add(school, "sign", 0, -28, 5, 0.4, 2.6, "#e6c77d", false);

export const MAPS: Record<MapId, MapDefinition> = { forest, city, school };
export function getMap(id: MapId): MapDefinition {
  return MAPS[id];
}
