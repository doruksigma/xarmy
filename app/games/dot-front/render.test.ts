import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { HEIGHT, WIDTH, units } from "./config";
import { createMatch } from "./engine";
import type { Flash } from "./engine";
import { colors, landscapeCanvas, render, resize, toWorld, viewOf } from "./render";
import { getMap } from "./terrain";
import { TERRITORY_COLS } from "./territory";

type Paint = { method: string; args: unknown[]; fill: unknown; stroke: unknown; width: unknown; alpha: unknown };
class Canvas {
  width = 300; height = 150; clientWidth = 960; clientHeight = 600;
  dataset: Record<string, string> = {};
  calls: Paint[] = [];
  contextOptions: (CanvasRenderingContext2DSettings | undefined)[] = [];
  private state: Record<string, unknown> = {};
  context = new Proxy(this.state, {
    get: (state, key: string) => state[key] ?? ((...args: unknown[]) => {
      this.calls.push({ method: key, args, fill: state.fillStyle, stroke: state.strokeStyle, width: state.lineWidth, alpha: state.globalAlpha });
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
  const circles = canvas.calls.filter(call => call.method === "arc" && Number(call.args[2]) >= .48);
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

test("regional front badges total nearby armies, update after damage and exclude rear formations", t => {
  environment(t);
  const match = createMatch("normal", "front-strength", false, "plains"), canvas = new Canvas(), mini = new Canvas();
  const first = { ...match.units[0], x: 68, y: 35 }, second = { ...match.units[1], x: 70, y: 37, hp: units.light.hp / 2 };
  const red = { ...match.units.find(unit => unit.team === 2)!, x: 76, y: 36 }, rear = { ...match.units[2], x: 10, y: 36 };
  match.units = [first, second, red, rear];
  const terrain = landscapeCanvas(match.map), view = viewOf(960, 600, { x: 72, y: 45, zoom: 1 });
  const paint = () => render(canvas.element(), mini.element(), terrain, view, match, new Set(), null, [], null);
  paint();
  const labels = canvas.calls.filter(call => call.method === "fillText");
  assert.deepEqual(labels.map(call => call.args[0]), ["Cephe", "15.000", "10.000"]);
  assert.ok(labels.every(call => call.fill === "#ffffff"));
  assert.equal(mini.calls.some(call => call.method === "fillText"), false, "the overview remains label-free");
  canvas.calls = []; first.hp = units.light.hp / 4; paint();
  assert.deepEqual(canvas.calls.filter(call => call.method === "fillText").map(call => call.args[0]), ["Cephe", "7.500", "10.000"]);
  canvas.calls = []; second.x = 10; paint();
  const moved = canvas.calls.filter(call => call.method === "fillText");
  assert.deepEqual(moved.map(call => call.args[0]), ["Cephe", "2.500", "10.000"]);
  assert.deepEqual(moved[0].args.slice(1), labels[0].args.slice(1), "the card stays attached to the front while army positions change");
});

test("individual dots never receive numeric labels, including selected armies at detail zoom", t => {
  environment(t);
  const match = createMatch("normal", "no-army-labels", false, "plains"), canvas = new Canvas();
  const ordinary = { ...match.units[0], x: 10, y: 45 }, picked = { ...match.units[1], x: 12, y: 45, hp: units.light.hp / 2 };
  match.units = [ordinary, picked];
  const terrain = landscapeCanvas(match.map), overview = viewOf(960, 600, { x: 72, y: 45, zoom: 1 });
  render(canvas.element(), null, terrain, overview, match, new Set(), null, [], null);
  assert.equal(canvas.calls.some(call => call.method === "fillText"), false);
  canvas.calls = [];
  render(canvas.element(), null, terrain, overview, match, new Set([picked.id]), null, [], null);
  assert.equal(canvas.calls.some(call => call.method === "fillText"), false);
  canvas.calls = [];
  render(canvas.element(), null, terrain, viewOf(960, 600, { x: 12, y: 45, zoom: 3 }), match, new Set([ordinary.id, picked.id]), null, [], null);
  assert.equal(canvas.calls.some(call => call.method === "fillText"), false);
});

test("a narrow phone view anchors regional totals to its visible frontier even when the sector midpoint is offscreen", t => {
  environment(t, true);
  const match = createMatch("normal", "phone-front-badge", false, "plains"), canvas = new Canvas();
  match.units = [{ ...match.units[0], x: 68, y: 36 }, { ...match.units.find(unit => unit.team === 2)!, x: 76, y: 36 }];
  const view = viewOf(360, 540, { x: 72, y: 45, zoom: 16 });
  assert.ok(36 * view.scale + view.y < 0, "the normal sector midpoint is outside this viewport");
  render(canvas.element(), null, landscapeCanvas(match.map), view, match, new Set(), null, [], null);
  const labels = canvas.calls.filter(call => call.method === "fillText");
  assert.deepEqual(labels.map(call => call.args[0]), ["Cephe", "10.000", "10.000"]);
  for (const label of labels) {
    const x = Number(label.args[1]) * view.scale + view.x, y = Number(label.args[2]) * view.scale + view.y;
    assert.ok(x >= 0 && x <= view.width && y >= 0 && y <= view.height);
  }
  canvas.calls = [];
  render(canvas.element(), null, landscapeCanvas(match.map), viewOf(360, 540, { x: 20, y: 45, zoom: 16 }), match, new Set(), null, [], null);
  assert.equal(canvas.calls.some(call => call.method === "fillText"), false, "fronts outside the camera are culled");
});

test("short mobile views clamp and separate regional badges instead of stacking every sector", t => {
  environment(t, true);
  const match = createMatch("normal", "badge-density", false, "plains"), canvas = new Canvas();
  const view = viewOf(360, 160, { x: 72, y: 45, zoom: 1 });
  render(canvas.element(), null, landscapeCanvas(match.map), view, match, new Set(match.units.map(unit => unit.id)), null, [], null);
  const badges = canvas.calls.filter(call => call.method === "fillText" && call.args[0] === "Cephe");
  assert.ok(badges.length > 0 && badges.length <= 3);
  const positions = badges.map(call => Number(call.args[2]) * view.scale + view.y).sort((a, b) => a - b);
  for (let index = 1; index < positions.length; index++) assert.ok(positions[index] - positions[index - 1] >= 39);
});


test("support silhouettes keep team colors, aircraft overlay ground formations and health remains readable", t => {
  environment(t);
  const match = createMatch("normal", "support-glyphs", false, "plains"), canvas = new Canvas();
  const plane = { ...match.units[0], kind: "aircraft" as const, x: 20.5, y: 25.5, hp: units.aircraft.hp / 2,
    path: [{ x: 26.5, y: 25.5 }], waypoint: 0 };
  const cannon = { ...match.units.find(unit => unit.team === 2)!, kind: "artillery" as const,
    x: plane.x, y: plane.y, hp: units.artillery.hp };
  match.cities = []; match.units = [plane, cannon];
  const view = viewOf(960, 600, { x: 20.5, y: 25.5, zoom: 4 });
  render(canvas.element(), null, landscapeCanvas(match.map), view, match, new Set([plane.id]), null, [], null);
  const teamFills = canvas.calls.filter(call => call.method === "fill" && colors.slice(1).includes(String(call.fill)));
  assert.equal(teamFills[0].fill, colors[2]);
  assert.equal(teamFills.at(-1)!.fill, colors[1], "aircraft are above ground regardless of unit-array order");
  assert.ok(canvas.calls.some(call => call.method === "fill" && call.fill === "#00000038"), "aircraft cast a separate light shadow");
  assert.ok(canvas.calls.some(call => call.method === "stroke" && call.stroke === "#ffffff60"), "moving aircraft have bounded line trails");
  assert.ok(canvas.calls.some(call => call.method === "strokeRect" && call.stroke === "#000000"), "the artillery barrel has a readable outline");
  assert.ok(canvas.calls.some(call => call.method === "stroke" && call.stroke === "#ffffff"), "selected aircraft retain a white selection ring");
  const health = canvas.calls.filter(call => call.method === "fillRect" && call.fill === colors[1]);
  assert.ok(health.some(call => Math.abs(Number(call.args[2]) - Math.max(.95, 22 / view.scale) / 2) < 1e-8), "aircraft health uses its own low maximum");
  assert.equal(canvas.calls.some(call => call.method === "fillText"), false, "support dots do not regain individual numeric labels");
});

test("aircraft remain visible above impassable water and support markers cull outside the camera", t => {
  environment(t);
  const match = createMatch("normal", "aircraft-water-render", false, "valley"), canvas = new Canvas();
  const water = getMap(match.map).tiles.findIndex((tile, index) => tile === "water" && index > WIDTH * 30);
  assert.ok(water >= 0);
  const plane = { ...match.units[0], kind: "aircraft" as const, x: water % WIDTH + .5,
    y: Math.floor(water / WIDTH) + .5, hp: units.aircraft.hp };
  const far = { ...match.units[1], kind: "artillery" as const, x: 5, y: 5, hp: units.artillery.hp };
  match.units = [plane, far]; match.cities = [];
  render(canvas.element(), null, landscapeCanvas(match.map), viewOf(960, 600, { ...plane, zoom: 6 }), match, new Set(), null, [], null);
  assert.ok(canvas.calls.some(call => call.method === "translate" && call.args[0] === plane.x && call.args[1] === plane.y), "a flight sprite is not rejected by ground passability");
  assert.equal(canvas.calls.some(call => call.method === "translate" && call.args[0] === far.x && call.args[1] === far.y), false);
});

test("minimap type and support-heading changes repaint markers while reusing terrain and geometry", t => {
  const env = environment(t), match = createMatch("normal", "support-minimap", false, "plains");
  const canvas = new Canvas(), mini = new Canvas(); mini.width = 180; mini.height = 112;
  match.cities = []; match.units = [{ ...match.units[0], x: 20.5, y: 25.5 }];
  const unit = match.units[0], terrain = landscapeCanvas(match.map), view = viewOf(960, 600, { x: 72, y: 45, zoom: 1 });
  const paint = () => render(canvas.element(), mini.element(), terrain, view, match, new Set(), null, [], null);
  paint();
  const base = [...env.canvases].reverse().find(value => value.width === mini.width && value.height === mini.height)!;
  const baseCalls = base.calls.length, allocations = env.canvases.length;
  let calls = mini.calls.length;
  unit.kind = "artillery"; unit.hp = units.artillery.hp; paint();
  assert.ok(mini.calls.length > calls, "a kind-only change cannot leave the old infantry marker cached");
  assert.ok(mini.calls.some(call => call.method === "closePath"), "artillery uses a filled directional marker");
  calls = mini.calls.length; unit.kind = "aircraft"; unit.hp = units.aircraft.hp; paint();
  assert.ok(mini.calls.length > calls);
  calls = mini.calls.length; unit.path = [{ x: unit.x, y: unit.y + 10 }]; unit.waypoint = 0; paint();
  assert.ok(mini.calls.length > calls, "turning in place also refreshes the plane marker");
  assert.ok(mini.calls.some(call => call.method === "rotate" && Math.abs(Number(call.args[0]) - Math.PI / 2) < 1e-8));
  calls = mini.calls.length; paint(); assert.equal(mini.calls.length, calls, "unchanged support markers do no extra work");
  assert.equal(base.calls.length, baseCalls); assert.equal(env.canvases.length, allocations);
  assert.equal(mini.calls.some(call => call.method === "fillText"), false);
});

test("artillery arcs and aircraft bomb impacts stay visible across frames and expire without particle accumulation", t => {
  environment(t);
  const match = createMatch("normal", "support-effects", false, "plains"), canvas = new Canvas();
  match.units = []; match.cities = [];
  const flashes: Flash[] = [
    { kind: "artillery", team: 1, targetId: 1, from: { x: 20, y: 20 }, to: { x: 30, y: 20 }, expires: .8 },
    { kind: "aircraft", team: 2, targetId: 2, from: { x: 32, y: 20 }, to: { x: 32, y: 21 }, expires: .7 },
    { kind: "artillery", team: 1, targetId: 3, from: { x: 140, y: 80 }, to: { x: 142, y: 80 }, expires: .8 },
  ];
  const view = viewOf(960, 600, { x: 25, y: 20, zoom: 4 });
  const paint = () => render(canvas.element(), null, landscapeCanvas(match.map), view, match, new Set(), null, flashes, null);
  match.elapsed = .1; paint();
  const firstArcs = canvas.calls.filter(call => call.method === "quadraticCurveTo");
  assert.equal(firstArcs.length, 2, "offscreen fire is culled while both support trajectories render");
  assert.ok(canvas.calls.some(call => call.method === "stroke" && call.stroke === "#ffb33c"));
  assert.ok(canvas.calls.some(call => call.method === "stroke" && call.stroke === "#ffea96"));
  const firstCalls = canvas.calls.length;
  canvas.calls = []; match.elapsed = .6; paint();
  assert.equal(canvas.calls.filter(call => call.method === "quadraticCurveTo").length, 2, "support fire outlasts a brief rifle flash");
  assert.ok(canvas.calls.length <= firstCalls, "each frame has a fixed small drawing cost");
  assert.ok(canvas.calls.filter(call => call.method === "stroke" && (call.stroke === "#ffb33c" || call.stroke === "#ffea96"))
    .every(call => Number(call.alpha) > 0 && Number(call.alpha) < 1));
  canvas.calls = []; match.elapsed = .8; paint();
  assert.equal(canvas.calls.some(call => call.method === "quadraticCurveTo"), false, "expired effects are not drawn even if a caller retained them");
  assert.equal(canvas.context.globalAlpha, 1, "effects never leave the rest of the map translucent");
});

test("a guest effect clock animates and expires support fire without changing authoritative match time", t => {
  environment(t);
  const match = createMatch("normal", "guest-render-clock", false, "plains"), canvas = new Canvas();
  match.units = []; match.cities = []; match.elapsed = 4;
  const flash: Flash = { kind: "artillery", team: 1, targetId: 1, from: { x: 20, y: 20 }, to: { x: 30, y: 20 }, expires: 4.8 };
  const view = viewOf(960, 600, { x: 25, y: 20, zoom: 4 });
  const before = structuredClone(match);
  const paint = (time: number) => render(canvas.element(), null, landscapeCanvas(match.map), view, match, new Set(), null, [flash], null, [], time);
  paint(4.1);
  const early = canvas.calls.find(call => call.method === "quadraticCurveTo")!;
  canvas.calls = []; paint(4.5);
  assert.notDeepEqual(canvas.calls.find(call => call.method === "quadraticCurveTo")!.args, early.args);
  canvas.calls = []; paint(4.8);
  assert.equal(canvas.calls.some(call => call.method === "quadraticCurveTo"), false);
  assert.deepEqual(match, before, "visual interpolation never moves units or advances the battle");
});
