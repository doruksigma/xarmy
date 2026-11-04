/* Regenerate the original SVG strategic-border index from shipped province
 * polygons. This is build-time geographic work, never a browser task. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "app/games/europa-war/strategy/map-data.json");
const destination = path.join(
  root,
  "app/games/europa-war/strategy/strategic-map-boundaries.json",
);
const bytes = fs.readFileSync(source);
const map = JSON.parse(bytes);
if (map.provinces.some((p) => /[^MLZ\d.,\s-]/.test(p.path)))
  throw new Error(
    "Only the supplied M/L/Z polygon data is supported; regenerate the parser for changed geography.",
  );
const geographyById = Object.fromEntries(map.provinces.map((p) => [p.id, p]));
let geography;
function geographicEdges() {
  if (geography) return geography;
  const polygons = new Map(
    map.provinces.map((province) => {
      const rings = (province.path.match(/M[^M]+/g) ?? []).map((part) => {
        const numbers = part.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const points = [];
        for (let i = 0; i < numbers.length; i += 2)
          points.push({ x: numbers[i], y: numbers[i + 1] });
        return points;
      });
      return [province.id, rings];
    }),
  );
  const boxes = new Map(
    [...polygons].map(([id, rings]) => {
      const points = rings.flat();
      return [
        id,
        {
          left: Math.min(...points.map((p) => p.x)),
          right: Math.max(...points.map((p) => p.x)),
          top: Math.min(...points.map((p) => p.y)),
          bottom: Math.max(...points.map((p) => p.y)),
        },
      ];
    }),
  );
  const inside = (id, x, y) => {
    const box = boxes.get(id);
    if (!box || x < box.left || x > box.right || y < box.top || y > box.bottom)
      return false;
    let found = false;
    for (const ring of polygons.get(id) ?? []) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j];
        if (
          a.y > y !== b.y > y &&
          x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
        )
          found = !found;
      }
    }
    return found;
  };
  const candidates = new Map();
  const key = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  for (const [id, rings] of polygons)
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
        const k = [key(a), key(b)].sort().join("|");
        const existing = candidates.get(k);
        if (existing) {
          if (!existing.provinces.includes(id)) existing.provinces.push(id);
        } else candidates.set(k, { a, b, provinces: [id] });
      }
    }
  const edges = [];
  for (const edge of candidates.values()) {
    const dx = edge.b.x - edge.a.x,
      dy = edge.b.y - edge.a.y;
    const length = Math.hypot(dx, dy),
      steps = edge.provinces.length > 1 ? 1 : Math.ceil(length / 10);
    for (let i = 0; i < steps; i++) {
      const a = {
        x: edge.a.x + (dx * i) / steps,
        y: edge.a.y + (dy * i) / steps,
      };
      const b = {
        x: edge.a.x + (dx * (i + 1)) / steps,
        y: edge.a.y + (dy * (i + 1)) / steps,
      };
      const provinces = [...edge.provinces];
      if (provinces.length === 1) {
        const x = (a.x + b.x) / 2,
          y = (a.y + b.y) / 2;
        // Adjacency is already a bounded geographic index. Sea links must not
        // turn straits into land fronts. Different edge subdivisions are matched
        // by probing immediately across each real polygon edge, not city links.
        for (const neighbor of geographyById[provinces[0]].neighbors) {
          if (neighbor.sea || provinces.includes(neighbor.id)) continue;
          if (
            [-1, 1].some((side) =>
              inside(
                neighbor.id,
                x - (dy / length) * 0.28 * side,
                y + (dx / length) * 0.28 * side,
              ),
            )
          )
            provinces.push(neighbor.id);
        }
      }
      edges.push({
        a,
        b,
        provinces,
        path: `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`,
      });
    }
  }
  geography = edges;
  return edges;
}
const groups = new Map();
for (const edge of geographicEdges()) {
  if (edge.provinces.length < 2) continue; // Existing country paths draw coasts.
  const provinces = [...edge.provinces].sort();
  const key = provinces.join("|");
  const group = groups.get(key) ?? { provinces, paths: [] };
  group.paths.push(edge.path);
  groups.set(key, group);
}
const output =
  JSON.stringify({
    version: 1,
    sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    groups: [...groups.values()].map(({ provinces, paths }) => ({
      provinces,
      path: paths.join(""),
    })),
  }) + "\n";
if (process.argv.includes("--check")) {
  if (
    !fs.existsSync(destination) ||
    fs.readFileSync(destination, "utf8") !== output
  ) {
    console.error(
      "Strategic boundary asset is stale. Run node scripts/europa-war/build-strategic-boundaries.cjs",
    );
    process.exitCode = 1;
  } else console.log("Strategic boundary asset matches the shipped map.");
} else {
  fs.writeFileSync(destination, output);
  console.log(
    `${groups.size} shared boundaries, ${Buffer.byteLength(output)} bytes written.`,
  );
}
