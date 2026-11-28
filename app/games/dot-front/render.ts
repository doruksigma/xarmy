import { CAPTURE, GRACE, HEIGHT, RADIUS, WIDTH, units } from "./config";
import type { Point } from "./config";
import type { Flash, Match, Unit } from "./engine";
import { frontField } from "./front";
import type { FrontField } from "./front";
import { TERRITORY_COLS, TERRITORY_ROWS, TERRITORY_SPACING, suppliedCells } from "./territory";
import { getMap } from "./terrain";
import type { MapId } from "./terrain";
import { formatSoldiers } from "./manpower";
import { frontStrength } from "./front-strength";
import type { FrontStrength } from "./front-strength";
import { copy } from "./copy";

export const colors = ["#858b8d", "#3700ff", "#ff0000"];
const terrainColors = { field: "#a4c242", forest: "#38802f", rock: "#8c9089", water: "#2997f9", bridge: "#c5b57e" };
const ROCK_INTERIOR = "#6e736d";
const CITY_COLOR = "#ffff00";
const RASTER_SCALE = 4;
export type Camera = Point & { zoom: number };
export type View = { width: number; height: number; scale: number; x: number; y: number };
export type Box = { from: Point; to: Point };

export function viewOf(width: number, height: number, camera: Camera): View {
  const scale = Math.min(width / WIDTH, height / HEIGHT) * camera.zoom;
  return { width, height, scale, x: width / 2 - camera.x * scale, y: height / 2 - camera.y * scale };
}
export const toWorld = (view: View, point: Point) => ({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale });
const troopSizes = { light: [.48, 5.5], heavy: [.65, 7.5], artillery: [.68, 8], aircraft: [.82, 10] } as const;
const troopRadius = (unit: Unit, scale: number) => {
  const size = troopSizes[unit.kind];
  return Math.max(size[0], size[1] / scale);
};
const kindCodes = { light: 0, heavy: 1, artillery: 2, aircraft: 3 };
function heading(unit: Unit, match: Match): number {
  const order = unit.order;
  const destination = unit.path[unit.waypoint] ?? (order.mode === "move" ? order.point
    : order.mode === "attack" ? match.units.find(target => target.id === order.target) : undefined);
  return destination && Math.abs(destination.x - unit.x) + Math.abs(destination.y - unit.y) > .01
    ? Math.atan2(destination.y - unit.y, destination.x - unit.x) : unit.team === 1 ? 0 : Math.PI;
}

// Fixed, inexpensive silhouette paths make support types recognizable even
// without color. Local +x is the vehicle's nose/barrel direction.
const aircraftOutline = [[1, 0], [.23, -.17], [-.08, -.9], [-.35, -.9], [-.22, -.14],
  [-.7, -.11], [-.93, -.42], [-1, -.42], [-.87, 0], [-1, .42], [-.93, .42],
  [-.7, .11], [-.22, .14], [-.35, .9], [-.08, .9], [.23, .17]] as const;
function planePath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath(); ctx.moveTo(aircraftOutline[0][0], aircraftOutline[0][1]);
  for (let i = 1; i < aircraftOutline.length; i++) ctx.lineTo(aircraftOutline[i][0], aircraftOutline[i][1]);
  ctx.closePath();
}
function supportGlyph(ctx: CanvasRenderingContext2D, unit: Unit, match: Match, radius: number, scale: number) {
  const angle = heading(unit, match);
  if (unit.kind === "aircraft") {
    // A short shadow and two static trails replace per-frame particle systems.
    ctx.save(); ctx.translate(unit.x + .24, unit.y + .34); ctx.rotate(angle); ctx.scale(radius, radius);
    planePath(ctx); ctx.fillStyle = "#00000038"; ctx.fill(); ctx.restore();
  }
  ctx.save(); ctx.translate(unit.x, unit.y); ctx.rotate(angle); ctx.scale(radius, radius);
  ctx.fillStyle = colors[unit.team]; ctx.strokeStyle = "#000000"; ctx.lineWidth = Math.max(.09, 1.3 / (scale * radius));
  if (unit.kind === "aircraft") {
    if (unit.path[unit.waypoint]) {
      ctx.beginPath(); ctx.moveTo(-1.1, -.32); ctx.lineTo(-1.85, -.32);
      ctx.moveTo(-1.1, .32); ctx.lineTo(-1.85, .32);
      ctx.strokeStyle = "#ffffff60"; ctx.lineWidth = Math.max(.06, 1 / (scale * radius)); ctx.stroke();
      ctx.strokeStyle = "#000000"; ctx.lineWidth = Math.max(.09, 1.3 / (scale * radius));
    }
    planePath(ctx); ctx.fill(); ctx.stroke();
    // The cockpit remains visible on both the blue and red silhouette.
    ctx.beginPath(); ctx.moveTo(.18, 0); ctx.lineTo(.55, 0);
    ctx.strokeStyle = "#ffffffc0"; ctx.lineWidth = .1; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(.25, 0); ctx.lineTo(-.75, -.65); ctx.lineTo(-.75, .65); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#000000";
    ctx.beginPath(); ctx.arc(-.45, -.58, .23, 0, Math.PI * 2); ctx.arc(-.45, .58, .23, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors[unit.team];
    ctx.fillRect(-.25, -.16, 1.3, .32); ctx.strokeRect(-.25, -.16, 1.3, .32);
  }
  ctx.restore();
}

function supportFlash(ctx: CanvasRenderingContext2D, flash: Flash, remaining: number, scale: number) {
  const artillery = flash.kind === "artillery", progress = 1 - remaining;
  const dx = flash.to.x - flash.from.x, dy = flash.to.y - flash.from.y;
  const arc = artillery ? Math.min(3.5, Math.max(.8, Math.hypot(dx, dy) * .16)) : .5;
  const control = { x: (flash.from.x + flash.to.x) / 2, y: (flash.from.y + flash.to.y) / 2 - arc };
  const travel = Math.min(1, progress / .55), inverse = 1 - travel;
  const shell = { x: inverse * inverse * flash.from.x + 2 * inverse * travel * control.x + travel * travel * flash.to.x,
    y: inverse * inverse * flash.from.y + 2 * inverse * travel * control.y + travel * travel * flash.to.y };
  ctx.strokeStyle = colors[flash.team]; ctx.lineWidth = Math.max(.08, 1.2 / scale);
  ctx.globalAlpha = remaining * .65;
  ctx.beginPath(); ctx.moveTo(flash.from.x, flash.from.y);
  ctx.quadraticCurveTo(flash.from.x + (control.x - flash.from.x) * travel,
    flash.from.y + (control.y - flash.from.y) * travel, shell.x, shell.y); ctx.stroke();
  ctx.globalAlpha = remaining;
  circle(ctx, shell, Math.max(artillery ? .16 : .2, 2.3 / scale));
  ctx.fillStyle = artillery ? "#ffe28a" : "#202020"; ctx.fill();
  ctx.strokeStyle = "#000000"; ctx.stroke();
  // Damage is authoritative at the shot; its destination flashes immediately.
  // A bounded expanding ring communicates the area strike without particles.
  const radius = (artillery ? .38 : .28) + progress * (artillery ? 1.4 : 1);
  ctx.strokeStyle = artillery ? "#ffb33c" : "#ffea96";
  ctx.lineWidth = Math.max(.11, 1.8 / scale); circle(ctx, flash.to, radius); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(flash.to.x - radius * .65, flash.to.y); ctx.lineTo(flash.to.x + radius * .65, flash.to.y);
  ctx.moveTo(flash.to.x, flash.to.y - radius * .65); ctx.lineTo(flash.to.x, flash.to.y + radius * .65); ctx.stroke();
}

const landscapes = new Map<MapId, HTMLCanvasElement>();
export function landscapeCanvas(mapId: MapId = "valley") {
  const cached = landscapes.get(mapId);
  if (cached) { landscapes.delete(mapId); landscapes.set(mapId, cached); return cached; }
  const tiles = getMap(mapId).tiles;
  const canvas = document.createElement("canvas");
  canvas.dataset.dotFrontMap = mapId;
  canvas.width = WIDTH * RASTER_SCALE;
  canvas.height = HEIGHT * RASTER_SCALE;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.scale(RASTER_SCALE, RASTER_SCALE);
  // Flat, run-length painted terrain preserves the exact passability layout.
  // No per-tile noise, tree sprites or high-resolution texture buffers are needed.
  for (let y = 0; y < HEIGHT; y++) {
    let x = 0;
    while (x < WIDTH) {
      const tile = tiles[y * WIDTH + x];
      let end = x + 1;
      while (end < WIDTH && tiles[y * WIDTH + end] === tile) end++;
      ctx.fillStyle = terrainColors[tile];
      ctx.fillRect(x, y, end - x, 1);
      x = end;
    }
  }
  // A solid inset distinguishes the interior of larger rock masses, without
  // adding texture noise or changing any passable tile or obstacle boundary.
  ctx.fillStyle = ROCK_INTERIOR;
  const rockInterior = (x: number, y: number) => tiles[y * WIDTH + x] === "rock" &&
    tiles[y * WIDTH + x - 1] === "rock" && tiles[y * WIDTH + x + 1] === "rock" &&
    tiles[(y - 1) * WIDTH + x] === "rock" && tiles[(y + 1) * WIDTH + x] === "rock";
  for (let y = 1; y < HEIGHT - 1; y++) {
    let x = 1;
    while (x < WIDTH - 1) {
      if (!rockInterior(x, y)) { x++; continue; }
      let end = x + 1;
      while (end < WIDTH - 1 && rockInterior(end, y)) end++;
      ctx.fillRect(x, y, end - x, 1); x = end;
    }
  }
  landscapes.set(mapId, canvas);
  // Two recent maps retain about 1.7 MB instead of the old 27 MB textures.
  if (landscapes.size > 2) landscapes.delete(landscapes.keys().next().value!);
  return canvas;
}

type Territory = { key: string; canvas: HTMLCanvasElement; painted: boolean };
const territories = new WeakMap<Match, Territory>();
function territoryCanvas(match: Match, field: FrontField) {
  let cached = territories.get(match);
  if (cached?.key === field.key) return cached.painted ? cached.canvas : null;
  if (!cached) {
    const canvas = document.createElement("canvas"); canvas.width = TERRITORY_COLS; canvas.height = TERRITORY_ROWS;
    cached = { key: "", canvas, painted: false }; territories.set(match, cached);
  }
  const ctx = cached.canvas.getContext("2d")!;
  ctx.setTransform(1 / TERRITORY_SPACING, 0, 0, 1 / TERRITORY_SPACING, 0, 0); ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const owners = match.territory.owners, supplied = suppliedCells(match);
  // Ownership is shown by the black front and team markers, never a color wash
  // over the terrain. Only disconnected pockets add a sparse warning hatch.
  const isolatedRuns: Array<{ x: number; y: number; length: number }> = [];
  for (let y = 0; y < TERRITORY_ROWS; y++) {
    let x = 0;
    while (x < TERRITORY_COLS) {
      const cell = y * TERRITORY_COLS + x, owner = owners[cell], isolated = owner !== 0 && supplied[cell] !== owner;
      let end = x + 1;
      while (end < TERRITORY_COLS && owners[y * TERRITORY_COLS + end] === owner &&
        (owner !== 0 && supplied[y * TERRITORY_COLS + end] !== owner) === isolated) end++;
      if (isolated) isolatedRuns.push({ x, y, length: end - x });
      x = end;
    }
  }
  ctx.beginPath();
  for (const run of isolatedRuns) {
    for (let x = run.x; x < run.x + run.length; x++) {
      if ((x + run.y) % 4 !== 0) continue;
      ctx.moveTo(x * TERRITORY_SPACING, (run.y + 1) * TERRITORY_SPACING);
      ctx.lineTo((x + 1) * TERRITORY_SPACING, run.y * TERRITORY_SPACING);
    }
  }
  ctx.strokeStyle = "#8d4b0090"; ctx.lineWidth = .2; ctx.stroke();
  cached.key = field.key; cached.painted = isolatedRuns.length > 0;
  return cached.painted ? cached.canvas : null;
}

type FrontDrawing = { path: Path2D | null; chains: Point[][] };
const frontDrawings = new WeakMap<FrontField, FrontDrawing>();
type PathWriter = Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "quadraticCurveTo" | "closePath">;
function roundedChain(path: PathWriter, points: readonly Point[]) {
  if (points.length < 2) return;
  const closed = points.length > 2 && points[0].x === points.at(-1)!.x && points[0].y === points.at(-1)!.y;
  const count = points.length - Number(closed);
  const corner = (index: number) => {
    const current = points[index], before = points[(index - 1 + count) % count], after = points[(index + 1) % count];
    const incoming = Math.hypot(before.x - current.x, before.y - current.y), outgoing = Math.hypot(after.x - current.x, after.y - current.y);
    const radius = Math.min(.35, incoming / 2, outgoing / 2);
    return { current,
      a: { x: current.x + (before.x - current.x) * radius / (incoming || 1), y: current.y + (before.y - current.y) * radius / (incoming || 1) },
      b: { x: current.x + (after.x - current.x) * radius / (outgoing || 1), y: current.y + (after.y - current.y) * radius / (outgoing || 1) } };
  };
  const start = closed ? corner(0).a : points[0]; path.moveTo(start.x, start.y);
  for (let index = closed ? 0 : 1; index < (closed ? count : count - 1); index++) {
    const { current, a, b } = corner(index);
    path.lineTo(a.x, a.y); path.quadraticCurveTo(current.x, current.y, b.x, b.y);
  }
  if (closed) path.closePath(); else path.lineTo(points[count - 1].x, points[count - 1].y);
}
function frontDrawing(field: FrontField): FrontDrawing {
  const existing = frontDrawings.get(field); if (existing) return existing;
  const key = (point: Point) => Math.round(point.y * 2) * (TERRITORY_COLS + 1) + Math.round(point.x * 2);
  const adjacent = new Map<number, number[]>(), used = new Uint8Array(field.segments.length), chains: Point[][] = [];
  field.segments.forEach((segment, index) => {
    for (const point of [segment.a, segment.b]) {
      const id = key(point), edges = adjacent.get(id);
      if (edges) edges.push(index); else adjacent.set(id, [index]);
    }
  });
  const walk = (start: Point, edge: number) => {
    const chain = [start]; let point = start, next: number | undefined = edge;
    while (next !== undefined && !used[next]) {
      const segment = field.segments[next]; used[next] = 1;
      point = key(segment.a) === key(point) ? segment.b : segment.a; chain.push(point);
      if (key(point) === key(start)) break;
      next = adjacent.get(key(point))?.find(index => !used[index]);
    }
    chains.push(chain);
  };
  // Open map-edge lines first, followed by closed encirclement loops.
  field.segments.forEach((segment, index) => {
    if (used[index]) return;
    if (adjacent.get(key(segment.a))!.length !== 2) walk(segment.a, index);
    else if (adjacent.get(key(segment.b))!.length !== 2) walk(segment.b, index);
  });
  field.segments.forEach((segment, index) => { if (!used[index]) walk(segment.a, index); });
  const path = typeof Path2D === "undefined" ? null : new Path2D();
  if (path) for (const chain of chains) roundedChain(path, chain);
  const drawing = { path, chains }; frontDrawings.set(field, drawing); return drawing;
}
function drawFront(ctx: CanvasRenderingContext2D, field: FrontField, scale: number, minPixels = 4.5) {
  const drawing = frontDrawing(field);
  ctx.strokeStyle = "#000000"; ctx.lineWidth = Math.max(.62, minPixels / scale);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (drawing.path) ctx.stroke(drawing.path);
  else { ctx.beginPath(); for (const chain of drawing.chains) roundedChain(ctx, chain); ctx.stroke(); }
}

function drawArrow(ctx: CanvasRenderingContext2D, points: readonly Point[], scale: number, preview = false) {
  if (points.length < 2) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.strokeStyle = preview ? "#ffe49a" : "#f2da90bc";
  ctx.lineWidth = (preview ? 2.5 : 1.7) / scale;
  ctx.setLineDash(preview ? [] : [5 / scale, 3 / scale]); ctx.stroke(); ctx.setLineDash([]);
  const end = points.at(-1)!;
  let before = points.at(-2)!;
  for (let index = points.length - 2; index >= 0 && Math.hypot(end.x - before.x, end.y - before.y) < .001; index--) before = points[index];
  const angle = Math.atan2(end.y - before.y, end.x - before.x), length = (preview ? 13 : 10) / scale;
  ctx.beginPath(); ctx.moveTo(end.x - Math.cos(angle - .45) * length, end.y - Math.sin(angle - .45) * length);
  ctx.lineTo(end.x, end.y); ctx.lineTo(end.x - Math.cos(angle + .45) * length, end.y - Math.sin(angle + .45) * length);
  ctx.stroke();
}

export function resize(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const ratio = Math.min(coarse ? 1 : 1.5, window.devicePixelRatio || 1,
    Math.sqrt((coarse ? 1_500_000 : 2_000_000) / Math.max(1, width * height)));
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  return { width, height, ratio };
}
const circle = (ctx: CanvasRenderingContext2D, p: Point, radius: number) => {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
};

type Bounds = { left: number; top: number; right: number; bottom: number };
function visibleBounds(view: View): Bounds {
  return { left: Math.max(0, -view.x / view.scale), top: Math.max(0, -view.y / view.scale),
    right: Math.min(WIDTH, (view.width - view.x) / view.scale), bottom: Math.min(HEIGHT, (view.height - view.y) / view.scale) };
}
function drawVisible(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, bounds: Bounds) {
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
  if (width <= 0 || height <= 0) return;
  ctx.drawImage(source, bounds.left * source.width / WIDTH, bounds.top * source.height / HEIGHT,
    width * source.width / WIDTH, height * source.height / HEIGHT, bounds.left, bounds.top, width, height);
}

function visibleFrontAnchor(group: FrontStrength, view: View, bounds: Bounds): Point | null {
  const midpointVisible = group.x >= bounds.left && group.x <= bounds.right && group.y >= bounds.top && group.y <= bounds.bottom;
  const preferred = midpointVisible ? group : toWorld(view, { x: view.width / 2, y: view.height / 2 });
  let best: Point | null = null, distance = Infinity;
  for (const segment of group.segments) {
    const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
    let from = 0, to = 1;
    for (const [delta, start, low, high] of [[dx, segment.a.x, bounds.left, bounds.right], [dy, segment.a.y, bounds.top, bounds.bottom]]) {
      if (Math.abs(delta) < 1e-9) { if (start < low || start > high) to = -1; continue; }
      const a = (low - start) / delta, b = (high - start) / delta;
      from = Math.max(from, Math.min(a, b)); to = Math.min(to, Math.max(a, b));
    }
    if (from >= to) continue;
    const length = dx * dx + dy * dy;
    const along = Math.max(from, Math.min(to, length ? ((preferred.x - segment.a.x) * dx + (preferred.y - segment.a.y) * dy) / length : 0));
    const point = { x: segment.a.x + dx * along, y: segment.a.y + dy * along };
    const candidate = (point.x - preferred.x) ** 2 + (point.y - preferred.y) ** 2;
    if (candidate < distance) { best = point; distance = candidate; }
  }
  return best;
}
function drawFrontStrength(ctx: CanvasRenderingContext2D, match: Match, field: FrontField, view: View, bounds: Bounds) {
  const groups = frontStrength(match, field).flatMap(group => {
    const anchor = visibleFrontAnchor(group, view, bounds);
    return anchor && group.formations ? [{ group, anchor }] : [];
  });
  const center = toWorld(view, { x: view.width / 2, y: view.height / 2 });
  groups.sort((a, b) => (a.anchor.x - center.x) ** 2 + (a.anchor.y - center.y) ** 2 -
    (b.anchor.x - center.x) ** 2 - (b.anchor.y - center.y) ** 2 || a.group.id.localeCompare(b.group.id));
  const occupied: Bounds[] = [], limit = Math.max(1, Math.min(view.width < 600 ? 4 : 10, Math.floor(view.height / 44)));
  ctx.textBaseline = "middle";
  for (const { group, anchor } of groups) {
    if (occupied.length >= limit) break;
    const blue = formatSoldiers(group.blue), red = formatSoldiers(group.red);
    const column = Math.max(55, Math.ceil(Math.max(blue.length, red.length) * 6.6 + 26)), width = column * 2, height = 33;
    if (width + 12 > view.width || height + 12 > view.height) continue;
    const px = anchor.x * view.scale + view.x, py = anchor.y * view.scale + view.y;
    const left = Math.round(Math.max(6, Math.min(view.width - width - 6, px - width / 2)));
    let chosen: Bounds | undefined;
    for (const preferredTop of [py - height - 10, py + 10]) {
      const top = Math.round(Math.max(6, Math.min(view.height - height - 6, preferredTop)));
      const box = { left, top, right: left + width, bottom: top + height };
      if (occupied.some(other => box.left < other.right + 6 && box.right > other.left - 6 && box.top < other.bottom + 6 && box.bottom > other.top - 6)) continue;
      chosen = box; break;
    }
    if (!chosen) continue;
    occupied.push(chosen);
    const worldLeft = (chosen.left - view.x) / view.scale, worldTop = (chosen.top - view.y) / view.scale;
    // Cards are attached to the visible boundary geometry, never to an army dot.
    const stemX = Math.max(chosen.left, Math.min(chosen.right, px));
    const stemY = py < chosen.top ? chosen.top : chosen.bottom;
    ctx.strokeStyle = "#000000"; ctx.lineWidth = 1 / view.scale;
    ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y); ctx.lineTo((stemX - view.x) / view.scale, (stemY - view.y) / view.scale); ctx.stroke();
    ctx.fillStyle = "#000000"; ctx.fillRect(worldLeft, worldTop, width / view.scale, height / view.scale);
    ctx.fillStyle = "#ffffff"; ctx.font = `600 ${10 / view.scale}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(copy.frontStrength, worldLeft + width / view.scale / 2, worldTop + 8.5 / view.scale);
    ctx.font = `600 ${11 / view.scale}px monospace`; ctx.textAlign = "left";
    for (const [index, text] of [blue, red].entries()) {
      const x = worldLeft + index * column / view.scale, y = worldTop + 23.5 / view.scale;
      ctx.fillStyle = colors[index + 1];
      if (index === 0) {
        circle(ctx, { x: x + 9 / view.scale, y }, 3.2 / view.scale); ctx.fill();
      } else ctx.fillRect(x + 5.8 / view.scale, y - 3.2 / view.scale, 6.4 / view.scale, 6.4 / view.scale);
      ctx.fillStyle = "#ffffff"; ctx.fillText(text, x + 18 / view.scale, y);
    }
  }
}

type MiniCache = { match: Match; base: HTMLCanvasElement; baseKey: string; units: number; viewport: string };
const minimaps = new WeakMap<HTMLCanvasElement, MiniCache>();
function drawMinimap(mini: HTMLCanvasElement, terrain: HTMLCanvasElement, territory: HTMLCanvasElement | null, field: FrontField, match: Match, view: View) {
  let cached = minimaps.get(mini);
  if (!cached || cached.match !== match) {
    cached = { match, base: document.createElement("canvas"), baseKey: "", units: -1, viewport: "" }; minimaps.set(mini, cached);
  }
  let ownership = 0, unitHash = 2166136261;
  for (const city of match.cities) ownership = Math.imul(ownership ^ city.owner, 16777619);
  for (const unit of match.units) {
    unitHash = Math.imul(unitHash ^ unit.id ^ (unit.team << 20) ^ (kindCodes[unit.kind] << 24), 16777619);
    if (unit.kind === "aircraft" || unit.kind === "artillery") unitHash = Math.imul(unitHash ^ Math.round(heading(unit, match) * 16), 16777619);
    unitHash = Math.imul(unitHash ^ Math.round(unit.x * 4), 16777619);
    unitHash = Math.imul(unitHash ^ Math.round(unit.y * 4), 16777619);
  }
  const key = `${field.key}:${ownership}:${mini.width}:${mini.height}`;
  const viewport = `${view.x.toFixed(1)}:${view.y.toFixed(1)}:${view.scale.toFixed(4)}:${view.width}:${view.height}`;
  const rebuild = cached.baseKey !== key;
  if (!rebuild && cached.units === unitHash && cached.viewport === viewport) return;
  if (rebuild) {
    if (cached.base.width !== mini.width) cached.base.width = mini.width;
    if (cached.base.height !== mini.height) cached.base.height = mini.height;
    const base = cached.base.getContext("2d", { alpha: false })!;
    base.setTransform(mini.width / WIDTH, 0, 0, mini.height / HEIGHT, 0, 0);
    base.drawImage(terrain, 0, 0, WIDTH, HEIGHT);
    if (territory) base.drawImage(territory, 0, 0, WIDTH, HEIGHT);
    drawFront(base, field, mini.width / WIDTH, 1.1);
    for (const city of match.cities) {
      base.fillStyle = colors[city.owner]; base.fillRect(city.x - 1, city.y - 1, 2, 2);
      base.fillStyle = CITY_COLOR; base.fillRect(city.x - .5, city.y - .5, 1, 1);
    }
    cached.baseKey = key;
  }
  const map = mini.getContext("2d", { alpha: false })!;
  map.setTransform(1, 0, 0, 1, 0, 0); map.drawImage(cached.base, 0, 0);
  map.setTransform(mini.width / WIDTH, 0, 0, mini.height / HEIGHT, 0, 0);
  for (let layer = 0; layer < 2; layer++) for (const unit of match.units) {
    if ((unit.kind === "aircraft") !== Boolean(layer)) continue;
    map.fillStyle = colors[unit.team];
    if (unit.kind === "light" || unit.kind === "heavy") { map.fillRect(unit.x - .55, unit.y - .55, 1.1, 1.1); continue; }
    map.save(); map.translate(unit.x, unit.y); map.rotate(heading(unit, match));
    map.strokeStyle = "#000000"; map.lineWidth = Math.max(.45, .8 / (mini.width / WIDTH));
    if (unit.kind === "aircraft") {
      map.scale(1.65, 1.65); planePath(map); map.fill(); map.stroke();
    } else {
      map.beginPath(); map.moveTo(1.15, 0); map.lineTo(-.9, -1); map.lineTo(-.9, 1); map.closePath(); map.fill(); map.stroke();
    }
    map.restore();
  }
  map.strokeStyle = "#ffffff"; map.lineWidth = Math.max(.45, 1 / (mini.width / WIDTH));
  map.strokeRect(-view.x / view.scale, -view.y / view.scale, view.width / view.scale, view.height / view.scale);
  cached.units = unitHash; cached.viewport = viewport;
}

export function render(
  canvas: HTMLCanvasElement, mini: HTMLCanvasElement | null, terrain: HTMLCanvasElement,
  view: View, match: Match, selected: Set<number>, selectedCity: number | null, flashes: Flash[], box: Box | null,
  routePreview: readonly Point[] = [], effectTime = match.elapsed,
) {
  // A restored match always paints its own map, even if a caller supplies an old cache.
  if (terrain.dataset.dotFrontMap !== match.map) terrain = landscapeCanvas(match.map);
  const field = frontField(match), territory = territoryCanvas(match, field);
  const bounds = visibleBounds(view);
  const visible = (point: Point, padding = 3) => point.x > bounds.left - padding && point.y > bounds.top - padding &&
    point.x < bounds.right + padding && point.y < bounds.bottom + padding;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.setTransform(canvas.width / Math.max(1, view.width), 0, 0, canvas.height / Math.max(1, view.height), 0, 0);
  ctx.fillStyle = terrainColors.water;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  drawVisible(ctx, terrain, bounds);
  if (territory) drawVisible(ctx, territory, bounds);
  drawFront(ctx, field, view.scale);
  for (const city of match.cities) {
    if (!visible(city)) continue;
    const cityRadius = Math.max(.58, 5.5 / view.scale);
    const ownerRadius = cityRadius + Math.max(.15, 2 / view.scale);
    const indicatorRadius = Math.max(RADIUS, ownerRadius + Math.max(.25, 2 / view.scale));
    if (selectedCity === city.id) {
      circle(ctx, city, indicatorRadius);
      ctx.fillStyle = "#fff9aa45"; ctx.fill(); ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(.13, 1.5 / view.scale); ctx.stroke();
    }
    if (city.progress > 0) {
      ctx.beginPath();
      ctx.arc(city.x, city.y, indicatorRadius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * city.progress / CAPTURE);
      ctx.strokeStyle = colors[city.capturing];
      ctx.lineWidth = Math.max(.2, 2.5 / view.scale);
      ctx.stroke();
    }
    circle(ctx, city, ownerRadius);
    ctx.fillStyle = colors[city.owner]; ctx.fill();
    circle(ctx, city, cityRadius);
    ctx.fillStyle = CITY_COLOR; ctx.fill(); ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(.075, 1 / view.scale); ctx.stroke();
    ctx.beginPath();
    if (city.owner === 1) {
      ctx.moveTo(city.x, city.y - cityRadius * .38);
      ctx.lineTo(city.x, city.y + cityRadius * .38);
    } else if (city.owner === 2) {
      ctx.moveTo(city.x - cityRadius * .38, city.y);
      ctx.lineTo(city.x + cityRadius * .38, city.y);
    } else {
      ctx.moveTo(city.x - 0.18, city.y + 0.18);
      ctx.lineTo(city.x + 0.18, city.y - 0.18);
    }
    ctx.stroke();
    if (city.build && (city.build.elapsed > 0 || selectedCity === city.id)) {
      ctx.fillStyle = colors[city.owner];
      ctx.fillRect(city.x - cityRadius, city.y + cityRadius + .35, cityRadius * 2 * Math.min(1, city.build.elapsed / units[city.build.kind].build), Math.max(.10, 2 / view.scale));
    }
    if (selectedCity === city.id && city.rally) {
      ctx.beginPath();
      ctx.setLineDash([0.2, 0.15]);
      ctx.moveTo(city.x, city.y);
      ctx.lineTo(city.rally.x, city.rally.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillRect(city.rally.x - 0.15, city.rally.y - 0.15, 0.3, 0.3);
    }
  }
  let paintedPaths = 0;
  // Two passes keep aircraft above every ground formation without allocating
  // or sorting a fresh army list for every Canvas frame.
  for (let layer = 0; layer < 2; layer++) for (const unit of match.units) {
    if ((unit.kind === "aircraft") !== Boolean(layer) || !visible(unit, 7)) continue;
    const picked = selected.has(unit.id);
    const radius = troopRadius(unit, view.scale);
    const stats = units[unit.kind];
    if (picked && unit.path[unit.waypoint] && paintedPaths++ < 16) {
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      for (let i = unit.waypoint; i < unit.path.length; i++) ctx.lineTo(unit.path[i].x, unit.path[i].y);
      ctx.strokeStyle = "#123a77a0";
      ctx.lineWidth = Math.max(.055, 1 / view.scale);
      ctx.stroke();
      if (unit.order.mode === "route") drawArrow(ctx, [unit, ...unit.order.points.slice(unit.order.next)], view.scale);
    }
    if (picked || unit.marked || unit.pocketed) {
      circle(ctx, unit, radius + Math.max(.19, 3 / view.scale));
      ctx.strokeStyle = unit.pocketed || unit.marked ? "#985400" : "#ffffff";
      if (unit.pocketed) ctx.setLineDash([3 / view.scale, 2 / view.scale]);
      ctx.lineWidth = Math.max(.085, 1.5 / view.scale);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (unit.kind === "artillery" || unit.kind === "aircraft") supportGlyph(ctx, unit, match, radius, view.scale);
    else {
      circle(ctx, unit, radius);
      ctx.fillStyle = colors[unit.team]; ctx.fill(); ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(unit.kind === "heavy" ? .18 : .07, (unit.kind === "heavy" ? 2.5 : 1) / view.scale); ctx.stroke();
      if (unit.kind === "heavy") {
        circle(ctx, unit, radius + Math.max(.21, 2.5 / view.scale));
        ctx.lineWidth = Math.max(.075, 1 / view.scale); ctx.stroke();
      }
    }
    if (unit.team === 2 && unit.kind !== "aircraft") {
      ctx.fillStyle = "#ffffffbd";
      ctx.fillRect(unit.x - radius * .4, unit.y - radius * .1, radius * .8, radius * .2);
    }
    if (picked || unit.hp < stats.hp || unit.pocketed) {
      const barWidth = Math.max(.95, 22 / view.scale), barHeight = Math.max(.12, 3 / view.scale);
      const barY = unit.y - radius - 7 / view.scale;
      ctx.fillStyle = "#152129";
      ctx.fillRect(unit.x - barWidth / 2, barY, barWidth, barHeight);
      ctx.fillStyle = unit.pocketed || (unit.marked && match.shortage[unit.team - 1] >= GRACE) ? "#ffc331" : colors[unit.team];
      ctx.fillRect(unit.x - barWidth / 2, barY, barWidth * Math.max(0, unit.hp / stats.hp), barHeight);
    }
  }
  for (const flash of flashes) {
    if (flash.expires <= effectTime || (!visible(flash.from) && !visible(flash.to))) continue;
    if (flash.kind === "artillery" || flash.kind === "aircraft") {
      supportFlash(ctx, flash, Math.min(1, (flash.expires - effectTime) / (flash.kind === "artillery" ? .8 : .7)), view.scale);
      continue;
    }
    ctx.strokeStyle = colors[flash.team];
    ctx.globalAlpha = Math.min(1, (flash.expires - effectTime) / 0.14);
    ctx.lineWidth = Math.max(0.095, 1.3 / view.scale);
    ctx.beginPath();
    ctx.moveTo(flash.from.x, flash.from.y);
    ctx.lineTo(flash.to.x, flash.to.y);
    ctx.stroke();
    circle(ctx, flash.to, 0.17);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawArrow(ctx, routePreview, view.scale, true);
  drawFrontStrength(ctx, match, field, view, bounds);
  ctx.restore();
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  if (box) {
    ctx.fillStyle = "#69c7ff28";
    ctx.strokeStyle = "#8bd5ff";
    ctx.lineWidth = 1;
    ctx.fillRect(box.from.x, box.from.y, box.to.x - box.from.x, box.to.y - box.from.y);
    ctx.strokeRect(box.from.x, box.from.y, box.to.x - box.from.x, box.to.y - box.from.y);
  }
  if (mini && mini.clientWidth > 0 && mini.clientHeight > 0) drawMinimap(mini, terrain, territory, field, match, view);
}
