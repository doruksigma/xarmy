import { decide } from "./ai";
import { soundEffects } from "./audio";
import { GRACE, HEIGHT, RADIUS, STEP, WIDTH, dist, units } from "./config";
import type { Kind, Point } from "./config";
import { orderUnit, send, step, supply } from "./engine";
import type { Flash, Match, Unit } from "./engine";
import { bindInput, clampCamera } from "./input";
import { landscapeCanvas, render, resize, viewOf } from "./render";
import type { Box, Camera } from "./render";
import { nearestOpen } from "./terrain";

export function summary(match: Match, picked: Set<number>, cityId: number | null) {
  const city = cityId === null ? null : match.cities[cityId];
  const logistics = supply(match, 1);
  const selected = match.units.filter((unit) => picked.has(unit.id));
  return {
    time: Math.floor(match.elapsed), logistics, shortage: match.shortage[0],
    blue: match.units.filter((unit) => unit.team === 1).length,
    red: match.units.filter((unit) => unit.team === 2).length,
    blueCities: match.cities.filter((item) => item.owner === 1).length,
    redCities: match.cities.filter((item) => item.owner === 2).length,
    light: selected.filter((unit) => unit.kind === "light").length, heavy: selected.filter((unit) => unit.kind === "heavy").length,
    city: city && { ...city, build: city.build && { ...city.build } },
    blocked: Boolean(city?.build && logistics.used + units[city.build.kind].supply > logistics.capacity),
    tutorial: match.tutorial, result: match.result, report: { ...match.report },
  };
}

export type Summary = ReturnType<typeof summary>;

export function startBattle(
  match: Match, canvas: HTMLCanvasElement, mini: HTMLCanvasElement,
  notify: (summary: Summary) => void, onPause: () => void, autosave: () => void, finished: () => void,
) {
  const terrain = landscapeCanvas();
  const camera: Camera = { x: WIDTH / 2, y: HEIGHT / 2, zoom: 1 };
  const picked = new Set<number>();
  let cityId: number | null = null;
  let flashes: Flash[] = [];
  let box: Box | null = null;
  let paused = document.hidden;
  let multi = false;
  let rally = false;
  let speed = 1;
  let muted = true;
  let frame = 0;
  let previous = 0;
  let accumulator = 0;
  let nextNotice = 0;
  let lastSave = performance.now();
  let notifiedResult = false;
  const audio = soundEffects();
  const view = () => viewOf(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), camera);
  const update = () => notify(summary(match, picked, cityId));
  const selected = () => match.units.filter((unit) => picked.has(unit.id));
  const currentCity = () => cityId === null ? null : match.cities[cityId];
  const myCity = () => {
    const city = currentCity();
    return city?.owner === 1 ? city : null;
  };
  const active = () => !paused && !match.result;
  function pick(units: Unit[], add: boolean) {
    if (!add) picked.clear();
    for (const unit of units) picked.add(unit.id);
    if (units.length) {
      cityId = null;
      if (match.tutorial === 0) match.tutorial = 1;
    }
    rally = false;
    update();
  }
  function move(point: Point) {
    const group = selected();
    if (!group.length) return;
    send(group, point);
    if (match.tutorial === 1) match.tutorial = 2;
  }
  function attack(target: Unit) {
    const group = selected();
    if (!group.length) return;
    for (const unit of group) orderUnit(unit, { mode: "attack", target: target.id });
    if (match.tutorial === 4) match.tutorial = 5;
  }

  const controls = bindInput(canvas, {
    view, camera, multi: () => multi, drag: (value) => { box = value; },
    pause: onPause,
    select(from, to, add) {
      if (!active()) return;
      pick(match.units.filter((unit) => unit.team === 1 &&
        unit.x >= Math.min(from.x, to.x) && unit.x <= Math.max(from.x, to.x) &&
        unit.y >= Math.min(from.y, to.y) && unit.y <= Math.max(from.y, to.y)), add);
    },
    tap(point, command, touch, add, radius) {
      if (!active()) return;
      const owned = myCity();
      if (rally && owned) {
        owned.rally = nearestOpen(point);
        rally = false;
        update();
        return;
      }
      const hits = match.units.filter((unit) => dist(unit, point) <= radius)
        .sort((a, b) => dist(a, point) - dist(b, point));
      const enemy = hits.find((unit) => unit.team === 2);
      const own = hits.find((unit) => unit.team === 1);
      const city = match.cities.find((item) => dist(item, point) < Math.min(RADIUS, Math.max(radius, 0.8)));
      if (command || (touch && enemy && (!own || dist(enemy, point) < dist(own, point)))) {
        if (enemy) attack(enemy);
        else move(point);
      } else if (own && (!city || dist(own, point) < dist(city, point))) {
        pick([own], add);
      } else if (city) {
        cityId = city.id;
        rally = false;
      } else if (touch) {
        move(point);
      } else if (!add) {
        picked.clear();
        cityId = null;
      }
      update();
    },
  });

  function tick(now: number) {
    const delta = previous ? Math.min((now - previous) / 1000, 0.15) : 0;
    previous = now;
    if (active() && !document.hidden) {
      controls.moveCamera(delta);
      accumulator += delta * speed;
      while (accumulator >= STEP && !match.result) {
        accumulator -= STEP;
        const before = flashes.length;
        step(match, STEP, flashes, decide);
        if (!muted && flashes.length > before) audio.hit();
      }
      flashes = flashes.filter((flash) => flash.expires > match.elapsed);
      const alive = new Set(match.units.map((unit) => unit.id));
      for (const id of picked) if (!alive.has(id)) picked.delete(id);
      if (now - lastSave >= 15_000 && !match.result) {
        lastSave = now;
        autosave();
      }
    }
    if (now >= nextNotice || (match.result && !notifiedResult)) {
      nextNotice = now + 160;
      update();
    }
    if (match.result && !notifiedResult) {
      notifiedResult = true;
      audio.stop();
      finished();
    }
    resize(canvas);
    render(canvas, mini, terrain, view(), match, picked, cityId, flashes, box);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  function visibility() {
    if (!document.hidden || match.result) return;
    paused = true;
    accumulator = 0;
    previous = 0;
    box = null;
    audio.stop();
    onPause();
  }
  document.addEventListener("visibilitychange", visibility);

  return {
    focus() { canvas.focus({ preventScroll: true }); },
    pause(value: boolean) {
      paused = value;
      accumulator = 0;
      previous = 0;
      if (value) {
        audio.stop();
        autosave();
      } else if (!muted) void audio.enable().catch(() => {});
    },
    speed(value: number) { speed = value; },
    sound(value: boolean) {
      muted = !value;
      if (value && active()) void audio.enable().catch(() => {});
      else audio.stop();
    },
    multi(value: boolean) { multi = value; },
    selectAll() { if (active()) pick(match.units.filter((unit) => unit.team === 1), false); },
    deselect() { cityId = null; pick([], false); },
    hold() { if (active()) for (const unit of selected()) orderUnit(unit, { mode: "hold" }); },
    sendToCity() {
      const city = currentCity();
      if (city && active()) move(city);
    },
    rally() { rally = Boolean(myCity()) && active(); return rally; },
    build(kind: Kind) {
      const city = myCity();
      if (!active() || !city || city.build) return;
      city.build = { kind, elapsed: 0 };
      if (match.tutorial === 3) match.tutorial = 4;
      update();
    },
    repeat(value: boolean) { const city = myCity(); if (active() && city) city.repeat = value; update(); },
    cancel() { const city = myCity(); if (active() && city) city.build = null; update(); },
    pan(point: Point) {
      camera.zoom = Math.max(1.5, camera.zoom);
      camera.x = point.x * WIDTH;
      camera.y = point.y * HEIGHT;
      clampCamera(camera);
    },
    surrender() { match.result = "lost"; update(); },
    dispose() {
      cancelAnimationFrame(frame);
      controls.dispose();
      audio.dispose();
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

export const timeLabel = (seconds: number) => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
export const recovery = (shortage: number) => Math.max(0, Math.ceil(GRACE - shortage));
