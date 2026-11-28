import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { HEIGHT, WIDTH, units } from "./config";
import { createMatch } from "./engine";
import { colors, landscapeCanvas, render, resize, toWorld, viewOf } from "./render";
import { getMap } from "./terrain";
import { TERRITORY_COLS } from "./territory";

type Paint = { method: string; args: unknown[]; fill: unknown; stroke: unknown; width: unknown };
class Canvas {
  width = 300; height = 150; clientWidth = 960; clientHeight = 600;
  dataset: Record<string, string> = {};
  calls: Paint[] = [];
  contextOptions: (CanvasRenderingContext2DSettings | undefined)[] = [];
  private state: Record<string, unknown> = {};
  context = new Proxy(this.state, {
    get: (state, key: string) => state[key] ?? ((...args: unknown[]) => {
      this.calls.push({ method: key, args, fill: state.fillStyle, stroke: state.strokeStyle, width: state.lineWidth });
    }),
    set: (state, key: string, value) => { state[key] = value; return true; },
  });
  getContext(_kind?: string, options?: CanvasRenderingContext2DSettings) { this.contextOptions.push(options); return this.context; }
  element() { return this as unknown as HTMLCanvasElement; }
}
class Drawing {
  calls: { method: string; args: number[] }[] = [];
  moveTo(...args: number[]) { this.calls.push({ method: "moveTo", args }); }
  lineTo(...args: number[]) { this.calls.push({ method: "lineTo", args }); }
  quadraticCurveTo(...args: number[]) { this.calls.push({ method: "quadraticCurveTo", args }); }
  closePath() { this.calls.push({ method: "closePath", args: [] }); }
}
function environment(t: TestContext, coarse = false) {
  const canvases: Canvas[] = [], paths: Drawing[] = [];
  const values = {
    document: { createElement() { const canvas = new Canvas(); canvases.push(canvas); return canvas; } },
    window: { devicePixelRatio: 3, matchMedia: () => ({ matches: coarse }) },
    Path2D: class extends Drawing { constructor() { super(); paths.push(this); } },
  };
  const originals = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    for (const key of Object.keys(values)) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  // Evict terrain canvases created by other DOM-mock suites sharing this process.
  landscapeCanvas("forest"); landscapeCanvas("valley");
  return { canvases, paths };
}

test("flat terrain uses bounded raster memory and preserves every original terrain tile", t => {
  environment(t);
  const terrain = landscapeCanvas("plains") as unknown as Canvas;
  assert.equal(terrain.width, WIDTH * 4); assert.equal(terrain.height, HEIGHT * 4);
  assert.ok(terrain.width * terrain.height * 4 * 2 < 1_700_000, "two cached maps fit within 1.7 MB");
  const palette = { field: "#a4c242", forest: "#38802f", rock: "#8c9089", water: "#2997f9", bridge: "#c5b57e" };
  const painted: unknown[] = new Array(WIDTH * HEIGHT);
  const fills = terrain.calls.filter(call => call.method === "fillRect");
  for (const call of fills) {
    const [x, y, width, height] = call.args as number[];
    assert.equal(height, 1);
    for (let dx = 0; dx < width; dx++) painted[y * WIDTH + x + dx] = call.fill;
  }
  assert.deepEqual(painted.map(color => color === "#6e736d" ? palette.rock : color), getMap("plains").tiles.map(tile => palette[tile]));
  assert.ok(fills.length < WIDTH * HEIGHT / 4, "contiguous flat spans replace noisy per-tile painting");
  assert.equal(terrain.calls.some(call => call.method === "arc" || call.method === "stroke"), false);
  assert.equal(landscapeCanvas("plains"), terrain.element(), "the map raster is reused");
});

test("high-density tablet canvases respect the pixel budget without changing input coordinates", t => {
  environment(t, true);
  const canvas = new Canvas(); canvas.clientWidth = 1366; canvas.clientHeight = 1024;
  const sized = resize(canvas.element());
  assert.ok(canvas.width * canvas.height <= 1_503_000);
  assert.ok(sized.ratio <= 1, "flat map art uses at most one backing pixel per CSS pixel on tablets");
  const camera = { x: 60, y: 30, zoom: 2 }, view = viewOf(sized.width, sized.height, camera);
  assert.deepEqual(toWorld(view, { x: sized.width / 2, y: sized.height / 2 }), { x: 60, y: 30 });
  const dimensions = [canvas.width, canvas.height]; resize(canvas.element());
  assert.deepEqual([canvas.width, canvas.height], dimensions);
});

test("zoomed rendering crops visible terrain, skips an empty overlay and culls distant soldiers", t => {
  environment(t);
  const match = createMatch("normal", "render-crop", false, "plains"), canvas = new Canvas();
  match.cities = [];
  match.units = [{ ...match.units[0], x: 72, y: 45, kind: "heavy" }, { ...match.units[1], x: 1, y: 1 }];
  const terrain = landscapeCanvas(match.map), view = viewOf(960, 600, { x: 72, y: 45, zoom: 4 });
  render(canvas.element(), null, terrain, view, match, new Set(), null, [], null);
  assert.equal(canvas.contextOptions[0]?.alpha, false, "the fully repainted battle canvas requests an opaque surface");
  const blits = canvas.calls.filter(call => call.method === "drawImage");
  assert.equal(blits.length, 1, "normal supplied territory needs no color-changing overlay blit");
  for (const call of blits) {
    const source = call.args[0] as HTMLCanvasElement;
    assert.equal(call.args.length, 9);
    assert.ok(Number(call.args[3]) < source.width && Number(call.args[4]) < source.height);
  }
  const circles = canvas.calls.filter(call => call.method === "arc");
  assert.ok(circles.length >= 2, "the heavy soldier keeps an outer ring");
  assert.ok(circles.every(call => call.args[0] === 72 && call.args[1] === 45));
  assert.ok(canvas.calls.some(call => call.method === "fill" && call.fill === colors[1]), "heavy troops retain their team fill");
});

test("unchanged minimaps and front geometry are reused while moving units update only the dynamic layer", t => {
  const env = environment(t), match = createMatch("normal", "render-cache", false, "plains");
  const canvas = new Canvas(), mini = new Canvas(); mini.width = 180; mini.height = 112;
  const terrain = landscapeCanvas(match.map), view = viewOf(960, 600, { x: 72, y: 45, zoom: 1 });
  const paint = () => render(canvas.element(), mini.element(), terrain, view, match, new Set(), null, [], null);
  paint();
  const calls = mini.calls.length, paths = env.paths.length, allocated = env.canvases.length;
  const base = [...env.canvases].reverse().find(value => value.width === mini.width && value.height === mini.height)!;
  const baseCalls = base.calls.length;
  paint();
  assert.equal(mini.calls.length, calls, "an identical overview does no paint work");
  assert.equal(env.paths.length, paths); assert.equal(env.canvases.length, allocated);
  match.units[0].x += .5; paint();
  assert.ok(mini.calls.length > calls); assert.equal(base.calls.length, baseCalls, "moving soldiers reuse the static minimap");
  match.cities[0].owner = 2; paint();
  assert.ok(base.calls.length > baseCalls, "city ownership still invalidates the overview");
  const hiddenCalls = mini.calls.length; mini.clientWidth = 0;
  match.units[0].x += 1; paint();
  assert.equal(mini.calls.length, hiddenCalls, "a CSS-hidden minimap does no paint work");
});

test("persistent pocket loops use cached black curves whose smoothing stays within half a cell", t => {
  const env = environment(t), match = createMatch("normal", "render-pocket", false, "plains");
  for (let y = 38; y < 42; y++) for (let x = 38; x < 42; x++) match.territory.owners[y * TERRITORY_COLS + x] = 2;
  match.territory.revision++;
  const canvas = new Canvas(), view = viewOf(960, 600, { x: 72, y: 45, zoom: 1 });
  render(canvas.element(), null, landscapeCanvas(match.map), view, match, new Set(), null, [], null);
  const curves = env.paths.flatMap(path => path.calls.filter(call => call.method === "quadraticCurveTo"));
  assert.ok(curves.length >= 4); assert.ok(env.paths.some(path => path.calls.some(call => call.method === "closePath")));
  for (const { args: [cx, cy, x, y] } of curves) assert.ok(Math.hypot(x - cx, y - cy) <= .350001);
  assert.ok(canvas.calls.some(call => call.method === "stroke" && call.stroke === "#000000" && Number(call.width) * view.scale >= 4.5));
  assert.ok(canvas.calls.some(call => call.method === "fill" && call.fill === "#ffff00"), "cities are pure yellow markers");
});

test("team ownership never washes terrain colors on the map or minimap and markers use the explicit palette", t => {
  const env = environment(t), match = createMatch("normal", "render-palette", false, "plains");
  const canvas = new Canvas(), mini = new Canvas(); mini.width = 180; mini.height = 112;
  render(canvas.element(), mini.element(), landscapeCanvas(match.map), viewOf(960, 600, { x: 72, y: 45, zoom: 1 }), match, new Set(), null, [], null);
  const overlay = env.canvases.find(value => value.width === TERRITORY_COLS && value.height === HEIGHT * 2)!;
  assert.ok(overlay);
  assert.equal(overlay.calls.some(call => call.method === "fillRect" || call.method === "fill"), false, "ownership adds no filled tint");
  const base = [...env.canvases].reverse().find(value => value.width === mini.width && value.height === mini.height)!;
  assert.equal(base.calls.filter(call => call.method === "drawImage").length, 1, "overview also shows the original terrain colors");
  for (const color of ["#3700ff", "#ff0000", "#ffff00"]) {
    assert.ok(canvas.calls.some(call => call.method === "fill" && call.fill === color), `map marker retains ${color}`);
  }
});

test("dark rock interiors stay strictly inside existing rock masses", t => {
  environment(t);
  const tiles = getMap("passes").tiles, original = [...tiles], terrain = landscapeCanvas("passes") as unknown as Canvas;
  const interiors = terrain.calls.filter(call => call.method === "fillRect" && call.fill === "#6e736d");
  assert.ok(interiors.length > 0);
  for (const call of interiors) {
    const [start, y, width] = call.args as number[];
    for (let x = start; x < start + width; x++) {
      for (const index of [y * WIDTH + x, y * WIDTH + x - 1, y * WIDTH + x + 1, (y - 1) * WIDTH + x, (y + 1) * WIDTH + x]) {
        assert.equal(tiles[index], "rock", "a dark inset cannot recolor a passable tile or rock edge");
      }
    }
  }
  assert.deepEqual(tiles, original);
});

test("restored maps replace stale landscape inputs instead of painting the previous match terrain", t => {
  environment(t);
  const stale = landscapeCanvas("plains"), match = createMatch("normal", "render-restored", false, "valley"), canvas = new Canvas();
  render(canvas.element(), null, stale, viewOf(960, 600, { x: 72, y: 45, zoom: 1 }), match, new Set(), null, [], null);
  const first = canvas.calls.find(call => call.method === "drawImage")!;
  assert.equal((first.args[0] as HTMLCanvasElement).dataset.dotFrontMap, "valley");
});

test("detail labels display surviving strength, update after damage and omit offscreen armies", t => {
  environment(t);
  const match = createMatch("normal", "army-strength", false, "plains"), canvas = new Canvas(), mini = new Canvas();
  const first = { ...match.units[0], x: 68, y: 40 }, second = { ...match.units[1], x: 76, y: 50, hp: units.light.hp / 2 };
  const offscreen = { ...match.units[2], x: 1, y: 1 };
  match.units = [first, second, offscreen];
  const terrain = landscapeCanvas(match.map), view = viewOf(960, 600, { x: 72, y: 45, zoom: 3 });
  const paint = () => render(canvas.element(), mini.element(), terrain, view, match, new Set(), null, [], null);
  paint();
  const labels = canvas.calls.filter(call => call.method === "fillText");
  assert.deepEqual(labels.map(call => call.args[0]), ["10.000", "5.000"]);
  assert.ok(labels.every(call => call.fill === "#ffffff"));
  assert.equal(mini.calls.some(call => call.method === "fillText"), false, "the overview remains label-free");
  canvas.calls = []; first.hp = units.light.hp / 4; paint();
  assert.deepEqual(canvas.calls.filter(call => call.method === "fillText").map(call => call.args[0]), ["2.500", "5.000"]);
});

test("zoomed-out maps show only selected strength labels and selected armies win overlap conflicts", t => {
  environment(t);
  const match = createMatch("normal", "army-label-priority", false, "plains"), canvas = new Canvas();
  const ordinary = { ...match.units[0], x: 72, y: 45 }, picked = { ...match.units[1], x: 72.2, y: 45, hp: units.light.hp / 2 };
  match.units = [ordinary, picked];
  const terrain = landscapeCanvas(match.map), overview = viewOf(960, 600, { x: 72, y: 45, zoom: 1 });
  render(canvas.element(), null, terrain, overview, match, new Set(), null, [], null);
  assert.equal(canvas.calls.some(call => call.method === "fillText"), false);
  canvas.calls = [];
  render(canvas.element(), null, terrain, overview, match, new Set([picked.id]), null, [], null);
  assert.deepEqual(canvas.calls.filter(call => call.method === "fillText").map(call => call.args[0]), ["5.000"]);
  canvas.calls = [];
  render(canvas.element(), null, terrain, viewOf(960, 600, { x: 72, y: 45, zoom: 3 }), match, new Set([picked.id]), null, [], null);
  assert.deepEqual(canvas.calls.filter(call => call.method === "fillText").map(call => call.args[0]), ["5.000"], "selected strength takes priority over a nearby unselected label");
});
