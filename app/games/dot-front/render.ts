import { CAPTURE, COMMANDER_LIMIT, GRACE, HEIGHT, RADIUS, WIDTH, units } from "./config";
import type { Point } from "./config";
import type { Flash, Match, Unit } from "./engine";
import { getMap } from "./terrain";
import type { MapId } from "./terrain";

export const colors = ["#b2b7ae", "#69c7ff", "#ff806f"];
const terrainColors = { field: "#475447", forest: "#2d4139", rock: "#31363d", water: "#243946", bridge: "#807360" };
export type Camera = Point & { zoom: number };
export type View = { width: number; height: number; scale: number; x: number; y: number };
export type Box = { from: Point; to: Point };

export function viewOf(width: number, height: number, camera: Camera): View {
  const scale = Math.min(width / WIDTH, height / HEIGHT) * camera.zoom;
  return { width, height, scale, x: width / 2 - camera.x * scale, y: height / 2 - camera.y * scale };
}
export const toWorld = (view: View, point: Point) => ({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale });
const troopRadius = (unit: Unit, scale: number) => Math.max(unit.kind === "heavy" ? .52 : .38, (unit.kind === "heavy" ? 6 : 4) / scale);
/** The input adapter uses this exact CSS rectangle for commander badge hit testing. */
export function commanderBadge(view: View, unit: Unit) {
  return { x: view.x + unit.x * view.scale, y: view.y + unit.y * view.scale - troopRadius(unit, view.scale) * view.scale - 25, width: 56, height: 32 };
}

const landscapes = new Map<MapId, HTMLCanvasElement>();
export function landscapeCanvas(mapId: MapId = "valley") {
  const cached = landscapes.get(mapId);
  if (cached) { landscapes.delete(mapId); landscapes.set(mapId, cached); return cached; }
  const tiles = getMap(mapId).tiles;
  const canvas = document.createElement("canvas");
  canvas.dataset.dotFrontMap = mapId;
  canvas.width = WIDTH * 16;
  canvas.height = HEIGHT * 16;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(16, 16);
  for (let id = 0; id < tiles.length; id++) {
    const x = id % WIDTH;
    const y = Math.floor(id / WIDTH);
    const tile = tiles[id];
    ctx.fillStyle = terrainColors[tile];
    ctx.fillRect(x, y, 1, 1);
    const seed = ((id * 17431 + 1291) % 997) / 997;
    ctx.fillStyle = seed > 0.5 ? "#ffffff0b" : "#050e151b";
    ctx.fillRect(x, y, 1, 1);
    ctx.lineWidth = 0.035;
    if (tile === "forest") {
      ctx.fillStyle = "#23322e";
      for (const shift of [0.21, 0.58]) {
        ctx.beginPath();
        ctx.moveTo(x + shift, y + 0.72 - seed / 5);
        ctx.lineTo(x + shift + 0.15, y + 0.19 + seed / 5);
        ctx.lineTo(x + shift + 0.34, y + 0.72 - seed / 5);
        ctx.fill();
      }
    } else if (tile === "rock") {
      ctx.fillStyle = "#50575b";
      ctx.beginPath();
      ctx.moveTo(x + 0.04, y + 0.83);
      ctx.lineTo(x + 0.24 + seed / 4, y + 0.15);
      ctx.lineTo(x + 0.73, y + 0.44);
      ctx.lineTo(x + 0.92, y + 0.87);
      ctx.fill();
    } else if (tile === "bridge" || tile === "water") {
      ctx.strokeStyle = tile === "bridge" ? "#ada18a" : "#395867";
      ctx.beginPath();
      ctx.moveTo(x + 0.05, y + 0.35 + seed / 3);
      ctx.lineTo(x + 0.95, y + 0.35 + seed / 3);
      ctx.stroke();
    }
  }
  landscapes.set(mapId, canvas);
  // Two recent maps cap retained raster memory at about 27 MB on mobile.
  if (landscapes.size > 2) landscapes.delete(landscapes.keys().next().value!);
  return canvas;
}

type Territory = { owners: string; canvas: HTMLCanvasElement; nearest: Int16Array };
const territories = new WeakMap<Match, Territory>();
function territoryCanvas(match: Match) {
  let cached = territories.get(match);
  const owners = match.cities.map(city => city.owner).join("");
  if (cached?.owners === owners) return cached.canvas;
  if (!cached) {
    const canvas = document.createElement("canvas"); canvas.width = WIDTH * 4; canvas.height = HEIGHT * 4;
    const nearest = new Int16Array(WIDTH * HEIGHT);
    for (let id = 0; id < nearest.length; id++) {
      const x = id % WIDTH + .5, y = Math.floor(id / WIDTH) + .5;
      let closest = Infinity;
      match.cities.forEach((city, index) => {
        const distance = (city.x - x) ** 2 + (city.y - y) ** 2;
        if (distance < closest) { closest = distance; nearest[id] = index; }
      });
    }
    cached = { owners: "", canvas, nearest }; territories.set(match, cached);
  }
  const ctx = cached.canvas.getContext("2d")!;
  ctx.setTransform(4, 0, 0, 4, 0, 0); ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const ownerAt = (id: number) => match.cities[cached!.nearest[id]]?.owner ?? 0;
  for (let id = 0; id < cached.nearest.length; id++) {
    const owner = ownerAt(id); if (!owner) continue;
    ctx.fillStyle = colors[owner] + "18"; ctx.fillRect(id % WIDTH, Math.floor(id / WIDTH), 1, 1);
  }
  // Territory is recomputed only after a city changes hands, not every frame.
  ctx.beginPath();
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const id = y * WIDTH + x, owner = ownerAt(id);
    if (x < WIDTH - 1 && owner !== ownerAt(id + 1)) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
    if (y < HEIGHT - 1 && owner !== ownerAt(id + WIDTH)) { ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); }
  }
  ctx.strokeStyle = "#14212cbd"; ctx.lineWidth = .55; ctx.stroke();
  ctx.strokeStyle = "#f7eac8b8"; ctx.lineWidth = .18; ctx.setLineDash([.65, .45]); ctx.stroke(); ctx.setLineDash([]);
  cached.owners = owners;
  return cached.canvas;
}

export function resize(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(2_600_000 / Math.max(1, width * height)));
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

export function render(
  canvas: HTMLCanvasElement, mini: HTMLCanvasElement | null, terrain: HTMLCanvasElement,
  view: View, match: Match, selected: Set<number>, selectedCity: number | null, flashes: Flash[], box: Box | null,
) {
  // A restored match always paints its own map, even if a caller supplies an old cache.
  if (terrain.dataset.dotFrontMap !== match.map) terrain = landscapeCanvas(match.map);
  const territory = territoryCanvas(match);
  const byId = new Map(match.units.map(unit => [unit.id, unit]));
  const groups = new Map<number, Unit[]>();
  const pickedCommanders = new Set<number>();
  for (const unit of match.units) {
    const group = groups.get(unit.commanderId) ?? [];
    group.push(unit); groups.set(unit.commanderId, group);
    if (selected.has(unit.id)) pickedCommanders.add(unit.commanderId);
  }
  const leaders = new Set(match.commanders.map(commander => commander.leaderId));
  const visible = (point: Point, padding = 3) => point.x * view.scale + view.x > -padding * view.scale &&
    point.y * view.scale + view.y > -padding * view.scale && point.x * view.scale + view.x < view.width + padding * view.scale &&
    point.y * view.scale + view.y < view.height + padding * view.scale;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(canvas.width / Math.max(1, view.width), 0, 0, canvas.height / Math.max(1, view.height), 0, 0);
  ctx.fillStyle = "#101a20";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  ctx.drawImage(terrain, 0, 0, WIDTH, HEIGHT);
  ctx.drawImage(territory, 0, 0, WIDTH, HEIGHT);
  for (const city of match.cities) {
    if (!visible(city)) continue;
    circle(ctx, city, RADIUS);
    ctx.fillStyle = colors[city.owner] + "25";
    ctx.fill();
    ctx.strokeStyle = selectedCity === city.id ? "#fff1b2" : colors[city.owner] + "a0";
    ctx.lineWidth = selectedCity === city.id ? 0.13 : 0.055;
    ctx.stroke();
    if (city.progress > 0) {
      ctx.beginPath();
      ctx.arc(city.x, city.y, RADIUS, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * city.progress / CAPTURE);
      ctx.strokeStyle = colors[city.capturing];
      ctx.lineWidth = 0.16;
      ctx.stroke();
    }
    ctx.fillStyle = "#152129";
    ctx.fillRect(city.x - 0.43, city.y - 0.43, 0.86, 0.86);
    ctx.strokeStyle = colors[city.owner];
    ctx.lineWidth = 0.105;
    ctx.strokeRect(city.x - 0.43, city.y - 0.43, 0.86, 0.86);
    ctx.beginPath();
    if (city.owner === 1) {
      ctx.moveTo(city.x, city.y - 0.25);
      ctx.lineTo(city.x, city.y + 0.25);
    } else if (city.owner === 2) {
      ctx.moveTo(city.x - 0.25, city.y);
      ctx.lineTo(city.x + 0.25, city.y);
    } else {
      ctx.moveTo(city.x - 0.18, city.y + 0.18);
      ctx.lineTo(city.x + 0.18, city.y - 0.18);
    }
    ctx.stroke();
    if (city.build) {
      ctx.fillStyle = colors[city.owner];
      ctx.fillRect(city.x - 0.5, city.y + 0.64, Math.min(1, city.build.elapsed / units[city.build.kind].build), Math.max(.10, 2 / view.scale));
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
  for (const commander of match.commanders) {
    if (!pickedCommanders.has(commander.id)) continue;
    const leader = byId.get(commander.leaderId); if (!leader) continue;
    ctx.beginPath();
    for (const unit of groups.get(commander.id) ?? []) {
      if (unit.id === leader.id) continue;
      ctx.moveTo(leader.x, leader.y); ctx.lineTo(unit.x, unit.y);
    }
    ctx.strokeStyle = colors[commander.team] + "60"; ctx.lineWidth = 1 / view.scale;
    ctx.setLineDash([3 / view.scale, 4 / view.scale]); ctx.stroke(); ctx.setLineDash([]);
  }
  let paintedPaths = 0;
  for (const unit of match.units) {
    if (!visible(unit, 7)) continue;
    const picked = selected.has(unit.id);
    const radius = troopRadius(unit, view.scale);
    const stats = units[unit.kind];
    if (picked && unit.path[unit.waypoint] && paintedPaths++ < 16) {
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      for (let i = unit.waypoint; i < unit.path.length; i++) ctx.lineTo(unit.path[i].x, unit.path[i].y);
      ctx.strokeStyle = "#8dd4ff64";
      ctx.lineWidth = Math.max(.055, 1 / view.scale);
      ctx.stroke();
    }
    if (picked || unit.marked) {
      circle(ctx, unit, radius + Math.max(.19, 3 / view.scale));
      ctx.strokeStyle = unit.marked ? "#ffcb6c" : "#f6f4d4";
      ctx.lineWidth = Math.max(.085, 1.5 / view.scale);
      ctx.stroke();
    }
    circle(ctx, unit, radius);
    ctx.fillStyle = unit.kind === "heavy" ? "#17222a" : colors[unit.team];
    ctx.fill();
    ctx.strokeStyle = unit.kind === "heavy" ? colors[unit.team] : "#1b282d";
    ctx.lineWidth = Math.max(unit.kind === "heavy" ? 0.12 : 0.063, (unit.kind === "heavy" ? 2 : 1) / view.scale);
    ctx.stroke();
    if (unit.team === 2) {
      ctx.fillStyle = unit.kind === "heavy" ? colors[2] : "#44282a";
      ctx.fillRect(unit.x - radius * .55, unit.y - radius * .12, radius * 1.1, radius * .24);
    }
    if (leaders.has(unit.id)) {
      circle(ctx, unit, radius + 2.5 / view.scale);
      ctx.strokeStyle = "#fff1b2"; ctx.lineWidth = 1.3 / view.scale; ctx.stroke();
      ctx.fillStyle = "#fff4cd";
      ctx.beginPath(); ctx.moveTo(unit.x, unit.y - radius * .6); ctx.lineTo(unit.x + radius * .45, unit.y + radius * .3);
      ctx.lineTo(unit.x - radius * .45, unit.y + radius * .3); ctx.closePath(); ctx.fill();
    }
    if (picked || unit.hp < stats.hp) {
      const barWidth = Math.max(.95, 22 / view.scale), barHeight = Math.max(.12, 3 / view.scale);
      const barY = unit.y - radius - 7 / view.scale;
      ctx.fillStyle = "#152129";
      ctx.fillRect(unit.x - barWidth / 2, barY, barWidth, barHeight);
      ctx.fillStyle = unit.marked && match.shortage[unit.team - 1] >= GRACE ? "#ffcb6c" : colors[unit.team];
      ctx.fillRect(unit.x - barWidth / 2, barY, barWidth * Math.max(0, unit.hp / stats.hp), barHeight);
    }
  }
  for (const flash of flashes) {
    ctx.strokeStyle = colors[flash.team];
    ctx.globalAlpha = Math.min(1, (flash.expires - match.elapsed) / 0.14);
    ctx.lineWidth = Math.max(0.095, 1.3 / view.scale);
    ctx.beginPath();
    ctx.moveTo(flash.from.x, flash.from.y);
    ctx.lineTo(flash.to.x, flash.to.y);
    ctx.stroke();
    circle(ctx, flash.to, 0.17);
    ctx.stroke();
  }
  ctx.restore();
  // Badges stay readable at every camera zoom and identify the existing leader.
  for (const commander of match.commanders) {
    const leader = byId.get(commander.leaderId); if (!leader) continue;
    const badge = commanderBadge(view, leader);
    if (badge.x < -badge.width || badge.y < -badge.height || badge.x > view.width + badge.width || badge.y > view.height + badge.height) continue;
    const picked = pickedCommanders.has(commander.id), count = groups.get(commander.id)?.length ?? 0;
    ctx.fillStyle = picked ? "#182a35f5" : "#10202be8";
    ctx.fillRect(badge.x - badge.width / 2, badge.y - badge.height / 2, badge.width, badge.height);
    ctx.strokeStyle = picked ? "#fff1b2" : colors[commander.team]; ctx.lineWidth = picked ? 1.5 : 1;
    ctx.strokeRect(badge.x - badge.width / 2 + .5, badge.y - badge.height / 2 + .5, badge.width - 1, badge.height - 1);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 11px system-ui, sans-serif"; ctx.fillStyle = "#e8f1ee";
    ctx.fillText(`${count}/${COMMANDER_LIMIT}`, badge.x, badge.y - 6);
    ctx.font = "700 10px system-ui, sans-serif"; ctx.fillStyle = colors[commander.team];
    ctx.fillText(`#${commander.id}`, badge.x + 5, badge.y + 7);
    ctx.beginPath(); ctx.moveTo(badge.x - 17, badge.y + 9); ctx.lineTo(badge.x - 13, badge.y + 4); ctx.lineTo(badge.x - 9, badge.y + 9);
    ctx.lineWidth = 1.5; ctx.strokeStyle = colors[commander.team]; ctx.stroke();
  }
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  if (box) {
    ctx.fillStyle = "#69c7ff28";
    ctx.strokeStyle = "#8bd5ff";
    ctx.lineWidth = 1;
    ctx.fillRect(box.from.x, box.from.y, box.to.x - box.from.x, box.to.y - box.from.y);
    ctx.strokeRect(box.from.x, box.from.y, box.to.x - box.from.x, box.to.y - box.from.y);
  }
  if (mini) {
    const map = mini.getContext("2d")!;
    map.setTransform(mini.width / WIDTH, 0, 0, mini.height / HEIGHT, 0, 0);
    map.drawImage(terrain, 0, 0, WIDTH, HEIGHT);
    map.drawImage(territory, 0, 0, WIDTH, HEIGHT);
    for (const city of match.cities) {
      map.fillStyle = colors[city.owner];
      map.fillRect(city.x - 0.8, city.y - 0.8, 1.6, 1.6);
    }
    for (const unit of match.units) {
      map.fillStyle = colors[unit.team];
      map.fillRect(unit.x - 0.35, unit.y - 0.35, 0.7, 0.7);
    }
    map.strokeStyle = "#fff1b2";
    map.lineWidth = 0.4;
    map.strokeRect(-view.x / view.scale, -view.y / view.scale, view.width / view.scale, view.height / view.scale);
  }
}
