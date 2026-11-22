import { CAPTURE, GRACE, HEIGHT, RADIUS, WIDTH, units } from "./config";
import type { Point } from "./config";
import type { Flash, Match } from "./engine";
import { tiles } from "./terrain";

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

export function landscapeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * 24;
  canvas.height = HEIGHT * 24;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(24, 24);
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
  return canvas;
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
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(canvas.width / Math.max(1, view.width), 0, 0, canvas.height / Math.max(1, view.height), 0, 0);
  ctx.fillStyle = "#101a20";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  ctx.drawImage(terrain, 0, 0, WIDTH, HEIGHT);
  for (const city of match.cities) {
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
      ctx.fillRect(city.x - 0.5, city.y + 0.64, city.build.elapsed / units[city.build.kind].build, 0.10);
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
  for (const unit of match.units) {
    const picked = selected.has(unit.id);
    const radius = unit.kind === "heavy" ? 0.37 : 0.24;
    const stats = units[unit.kind];
    if (picked && unit.path[unit.waypoint]) {
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      for (let i = unit.waypoint; i < unit.path.length; i++) ctx.lineTo(unit.path[i].x, unit.path[i].y);
      ctx.strokeStyle = "#8dd4ff64";
      ctx.lineWidth = 0.055;
      ctx.stroke();
    }
    if (picked || unit.marked) {
      circle(ctx, unit, radius + 0.19);
      ctx.strokeStyle = unit.marked ? "#ffcb6c" : "#f6f4d4";
      ctx.lineWidth = 0.085;
      ctx.stroke();
    }
    circle(ctx, unit, radius);
    ctx.fillStyle = unit.kind === "heavy" ? "#17222a" : colors[unit.team];
    ctx.fill();
    ctx.strokeStyle = unit.kind === "heavy" ? colors[unit.team] : "#1b282d";
    ctx.lineWidth = unit.kind === "heavy" ? 0.12 : 0.063;
    ctx.stroke();
    if (unit.team === 2) {
      ctx.fillStyle = unit.kind === "heavy" ? colors[2] : "#44282a";
      ctx.fillRect(unit.x - 0.14, unit.y - 0.03, 0.28, 0.06);
    }
    if (picked || unit.hp < stats.hp) {
      ctx.fillStyle = "#152129";
      ctx.fillRect(unit.x - 0.38, unit.y - radius - 0.31, 0.76, 0.12);
      ctx.fillStyle = unit.marked && match.shortage[unit.team - 1] >= GRACE ? "#ffcb6c" : colors[unit.team];
      ctx.fillRect(unit.x - 0.38, unit.y - radius - 0.31, 0.76 * Math.max(0, unit.hp / stats.hp), 0.12);
    }
  }
  for (const flash of flashes) {
    ctx.strokeStyle = colors[flash.team];
    ctx.globalAlpha = Math.min(1, (flash.expires - match.elapsed) / 0.14);
    ctx.lineWidth = 0.095;
    ctx.beginPath();
    ctx.moveTo(flash.from.x, flash.from.y);
    ctx.lineTo(flash.to.x, flash.to.y);
    ctx.stroke();
    circle(ctx, flash.to, 0.17);
    ctx.stroke();
  }
  ctx.restore();
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
    for (const city of match.cities) {
      map.fillStyle = colors[city.owner];
      map.fillRect(city.x - 0.6, city.y - 0.6, 1.2, 1.2);
    }
    for (const unit of match.units) {
      map.fillStyle = colors[unit.team];
      map.fillRect(unit.x - 0.2, unit.y - 0.2, 0.4, 0.4);
    }
    map.strokeStyle = "#fff1b2";
    map.lineWidth = 0.4;
    map.strokeRect(-view.x / view.scale, -view.y / view.scale, view.width / view.scale, view.height / view.scale);
  }
}
