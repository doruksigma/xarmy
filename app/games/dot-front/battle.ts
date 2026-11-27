import { decide } from "./ai";
import { soundEffects } from "./audio";
import { GRACE, HEIGHT, MAX_ROUTE_POINTS, POCKET_GRACE, RADIUS, STEP, WIDTH, dist, units } from "./config";
import type { Kind, Point } from "./config";
import { commandUnit, setGroupStance, step, supply } from "./engine";
import type { Flash, Match, Order, Unit } from "./engine";
import { bindInput, clampCamera, MAX_ZOOM } from "./input";
import { landscapeCanvas, render, resize, viewOf } from "./render";
import type { Box, Camera } from "./render";
import { nearestOpen } from "./terrain";
import { isSupplied } from "./territory";

export const GAME_SPEEDS = [0.5, 1, 2, 3] as const;

export function summary(match: Match, picked: Set<number>, cityId: number | null, routeDrawing = false) {
  const city = cityId === null ? null : match.cities[cityId];
  const logistics = supply(match, 1);
  const selected = match.units.filter((unit) => picked.has(unit.id));
  const pocketed = selected.filter(unit => unit.pocketed);
  const cityIsolated = Boolean(city?.owner && !isSupplied(match, city.owner, city));
  const selectedStance: Unit["stance"] | "mixed" | null = !selected.length ? null
    : selected.every(unit => unit.stance === selected[0].stance) ? selected[0].stance : "mixed";
  return {
    time: Math.floor(match.elapsed), logistics, shortage: match.shortage[0],
    blue: match.units.filter((unit) => unit.team === 1).length,
    red: match.units.filter((unit) => unit.team === 2).length,
    blueCities: match.cities.filter((item) => item.owner === 1).length,
    redCities: match.cities.filter((item) => item.owner === 2).length,
    bluePocketed: match.units.filter(unit => unit.team === 1 && unit.pocketed).length,
    selectedUnits: selected.length, selectedStance,
    selectedPocketed: pocketed.length,
    selectedPocketGrace: pocketed.length ? Math.max(0, Math.ceil(POCKET_GRACE - Math.max(...pocketed.map(unit => unit.pocketTime)))) : null,
    routeDrawing: routeDrawing && selected.length > 0,
    light: selected.filter((unit) => unit.kind === "light").length, heavy: selected.filter((unit) => unit.kind === "heavy").length,
    city: city && { ...city, build: city.build && { ...city.build } },
    cityIsolated,
    blocked: Boolean(city?.build && (cityIsolated || logistics.used + units[city.build.kind].supply > logistics.capacity)),
    tutorial: match.tutorial, result: match.result, report: { ...match.report },
  };
}

export type Summary = ReturnType<typeof summary>;

export function startBattle(
  match: Match, canvas: HTMLCanvasElement, mini: HTMLCanvasElement,
  notify: (summary: Summary) => void, onPause: () => void, autosave: () => void, finished: () => void,
) {
  const terrain = landscapeCanvas(match.map);
  const initialUnit = match.units.filter(unit => unit.team === 1)
    .sort((a, b) => dist(a, { x: WIDTH / 2 - 6, y: HEIGHT / 2 }) - dist(b, { x: WIDTH / 2 - 6, y: HEIGHT / 2 }))[0];
  const detailZoom = () => Math.max(1, Math.min(MAX_ZOOM,
    20 / Math.min(Math.max(1, canvas.clientWidth) / WIDTH, Math.max(1, canvas.clientHeight) / HEIGHT)));
  const camera: Camera = { x: initialUnit ? initialUnit.x + 4 : WIDTH / 2, y: initialUnit?.y ?? HEIGHT / 2, zoom: detailZoom() };
  const picked = new Set<number>();
  let cityId: number | null = null;
  let flashes: Flash[] = [];
  let box: Box | null = null;
  let paused = document.hidden;
  let multi = false;
  let rally = false;
  let routeDrawing = false;
  let routePreview: Point[] = [];
  let speed = 1;
  let muted = true;
  let frame = 0;
  let previous = 0;
  let accumulator = 0;
  let nextNotice = 0;
  let lastSave = performance.now();
  let notifiedResult = false;
  let disposed = false;
  const audio = soundEffects();
  const view = () => viewOf(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), camera);
  const update = () => notify(summary(match, picked, cityId, routeDrawing));
  const selected = () => match.units.filter(unit => unit.team === 1 && picked.has(unit.id));
  const currentCity = () => cityId === null ? null : match.cities[cityId];
  const myCity = () => {
    const city = currentCity();
    return city?.owner === 1 ? city : null;
  };
  const active = () => !disposed && !paused && !match.result && !document.hidden;
  const focus = () => { if (active()) canvas.focus({ preventScroll: true }); };
  function exitRoute() {
    routeDrawing = false;
    routePreview = [];
    controls.reset();
  }
  function syncSelection() {
    const unitIds = new Set(match.units.filter(unit => unit.team === 1).map(unit => unit.id));
    for (const id of picked) if (!unitIds.has(id)) picked.delete(id);
    if (!picked.size && routeDrawing) exitRoute();
  }
  function pick(units: Unit[], add: boolean) {
    exitRoute();
    if (!add) picked.clear();
    for (const unit of units) if (unit.team === 1) picked.add(unit.id);
    syncSelection();
    if (units.length) {
      cityId = null;
      if (match.tutorial === 0) match.tutorial = 1;
    }
    rally = false;
    update();
  }
  function move(point: Point) {
    exitRoute();
    const individuals = selected();
    if (!individuals.length) return;
    const columns = Math.ceil(Math.sqrt(individuals.length));
    individuals.forEach((unit, index) => {
      const offset = { x: index % columns - (columns - 1) / 2, y: Math.floor(index / columns) - (Math.ceil(individuals.length / columns) - 1) / 2 };
      commandUnit(match, unit.id, { mode: "move", point: nearestOpen({ x: point.x + offset.x, y: point.y + offset.y }, match.map) });
    });
    if (match.tutorial === 1) match.tutorial = 2;
  }
  function issue(order: Order) {
    for (const unit of selected()) commandUnit(match, unit.id, order);
  }
  function attack(target: Unit) {
    exitRoute();
    if (!picked.size) return;
    issue({ mode: "attack", target: target.id });
    if (match.tutorial === 4) match.tutorial = 5;
  }
  function finish() {
    if (!match.result || notifiedResult || disposed) return;
    notifiedResult = true;
    audio.stop();
    controls.reset();
    finished();
  }

  const controls = bindInput(canvas, {
    view, camera, active, multi: () => multi, drag: (value) => { box = value; },
    pause: () => { setPaused(true); onPause(); },
    routeMode: () => routeDrawing && picked.size > 0,
    preview: points => { routePreview = points; },
    route: points => {
      if (!active() || !picked.size || !points.length) return;
      issue({ mode: "route", points: points.slice(0, MAX_ROUTE_POINTS).map(point => ({ ...point })), next: 0 });
      exitRoute();
      if (match.tutorial === 1) match.tutorial = 2;
      update();
    },
    select(from, to, add) {
      if (!active()) return;
      const inside = (point: Point) => point.x >= Math.min(from.x, to.x) && point.x <= Math.max(from.x, to.x) &&
        point.y >= Math.min(from.y, to.y) && point.y <= Math.max(from.y, to.y);
      pick(match.units.filter(unit => unit.team === 1 && inside(unit)), add);
    },
    tap(point, command, touch, add, radius) {
      if (!active()) return;
      const owned = myCity();
      if (rally && owned) {
        owned.rally = nearestOpen(point, match.map);
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
        exitRoute();
        picked.clear();
        cityId = null;
      }
      update();
    },
  });

  function tick(now: number) {
    frame = 0;
    if (disposed) return;
    const delta = previous ? Math.max(0, Math.min((now - previous) / 1000, 0.15)) : 0;
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
      syncSelection();
      if (now - lastSave >= 15_000 && !match.result) {
        lastSave = now;
        autosave();
      }
    }
    if (now >= nextNotice || (match.result && !notifiedResult)) {
      nextNotice = now + 160;
      update();
    }
    finish();
    if (disposed) return;
    resize(canvas);
    clampCamera(camera, view());
    render(canvas, mini, terrain, view(), match, picked, cityId, flashes, box, routePreview);
    schedule();
  }
  function schedule() {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function setPaused(value: boolean) {
    if (disposed) return;
    const next = value || document.hidden || Boolean(match.result);
    const changed = paused !== next;
    paused = next;
    accumulator = 0;
    previous = 0;
    controls.reset();
    box = null;
    if (paused) { routeDrawing = false; routePreview = []; }
    if (paused) {
      audio.stop();
      if (changed && !match.result) {
        lastSave = performance.now();
        autosave();
      }
    } else if (!muted) void audio.enable().catch(() => {});
    update();
  }
  schedule();

  function visibility() {
    previous = 0;
    accumulator = 0;
    if (document.hidden) {
      stopFrame();
      setPaused(true);
      if (!match.result) onPause();
    } else schedule();
  }
  function pagehide() {
    setPaused(true);
    stopFrame();
  }
  function pageshow() {
    previous = 0;
    accumulator = 0;
    if (paused && !match.result) onPause();
    schedule();
  }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);

  return {
    focus,
    pause: setPaused,
    speed(value: number) { speed = (GAME_SPEEDS as readonly number[]).includes(value) ? value : 1; },
    sound(value: boolean) {
      muted = !value;
      if (value && active()) void audio.enable().catch(() => {});
      else audio.stop();
    },
    multi(value: boolean) { multi = value; controls.reset(); focus(); },
    selectAll() { if (active()) { pick(match.units.filter((unit) => unit.team === 1), false); focus(); } },
    stance(value: "attack" | "defend") {
      if (!active()) return;
      exitRoute();
      setGroupStance(match, [...picked], value);
      update(); focus();
    },
    frontlineAll() {
      if (!active()) return;
      pick(match.units.filter(unit => unit.team === 1), false);
      setGroupStance(match, [...picked], "defend");
      update(); focus();
    },
    routeMode(enabled: boolean) {
      if (!active()) return;
      controls.reset();
      routeDrawing = enabled && picked.size > 0;
      routePreview = [];
      rally = false;
      update(); focus();
    },
    deselect() { if (active()) { cityId = null; pick([], false); focus(); } },
    hold() {
      if (!active()) return;
      exitRoute();
      issue({ mode: "hold" });
      rally = false;
      update(); focus();
    },
    sendToCity() {
      const city = currentCity();
      if (city && active()) { move(city); focus(); }
    },
    rally() { exitRoute(); rally = Boolean(myCity()) && active(); focus(); return rally; },
    rallyPending() { return rally; },
    build(kind: Kind = "light") {
      const city = myCity();
      if (!active() || !city) return;
      if (!city.build) city.build = { kind, elapsed: 0 };
      else city.build.kind = kind;
      city.repeat = true;
      update();
      focus();
    },
    pan(point: Point) {
      if (!active()) return;
      camera.zoom = Math.max(1.5, camera.zoom);
      camera.x = point.x * WIDTH;
      camera.y = point.y * HEIGHT;
      clampCamera(camera, view());
      focus();
    },
    surrender() {
      if (disposed || match.result) return;
      match.result = "lost";
      update();
      // Commit the result even if the page closes before another animation frame.
      finish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopFrame();
      controls.dispose();
      audio.dispose();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
    },
  };
}

export const timeLabel = (seconds: number) => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
export const recovery = (shortage: number) => Math.max(0, Math.ceil(GRACE - shortage));
