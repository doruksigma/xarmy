import { decide } from "./ai";
import { soundEffects } from "./audio";
import { GRACE, HEIGHT, RADIUS, STEP, WIDTH, dist, units } from "./config";
import type { Kind, Point } from "./config";
import { commanderLeader, commanderMembers, commandCommander, setCommanderAutoFront, step, supply } from "./engine";
import type { Flash, Match, Unit } from "./engine";
import { bindInput, clampCamera, MAX_ZOOM } from "./input";
import { commanderBadge, landscapeCanvas, render, resize, toWorld, viewOf } from "./render";
import type { Box, Camera } from "./render";
import { nearestOpen } from "./terrain";

export function summary(match: Match, picked: Set<number>, cityId: number | null) {
  const city = cityId === null ? null : match.cities[cityId];
  const logistics = supply(match, 1);
  const selected = match.units.filter((unit) => picked.has(unit.id));
  const commanders = match.commanders.filter(commander => commander.team === 1).map(commander => {
    const members = commanderMembers(match, commander.id);
    const leader = commanderLeader(match, commander.id);
    return {
      id: commander.id, leaderId: commander.leaderId, count: members.length,
      selected: members.some(unit => picked.has(unit.id)), autoFront: commander.autoFront,
      x: leader?.x ?? members[0]?.x ?? WIDTH / 2, y: leader?.y ?? members[0]?.y ?? HEIGHT / 2,
      order: { ...commander.order },
    };
  }).filter(commander => commander.count > 0);
  return {
    time: Math.floor(match.elapsed), logistics, shortage: match.shortage[0],
    blue: match.units.filter((unit) => unit.team === 1).length,
    red: match.units.filter((unit) => unit.team === 2).length,
    blueCities: match.cities.filter((item) => item.owner === 1).length,
    redCities: match.cities.filter((item) => item.owner === 2).length,
    commanders, blueCommanders: commanders.length,
    redCommanders: match.commanders.filter(commander => commander.team === 2 && commanderMembers(match, commander.id).length > 0).length,
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
  const terrain = landscapeCanvas(match.map);
  const initialLeader = match.commanders.filter(commander => commander.team === 1)
    .map(commander => commanderLeader(match, commander.id)).filter((unit): unit is Unit => Boolean(unit))
    .sort((a, b) => dist(a, { x: WIDTH / 2 - 6, y: HEIGHT / 2 }) - dist(b, { x: WIDTH / 2 - 6, y: HEIGHT / 2 }))[0];
  const detailZoom = () => Math.max(1, Math.min(MAX_ZOOM,
    20 / Math.min(Math.max(1, canvas.clientWidth) / WIDTH, Math.max(1, canvas.clientHeight) / HEIGHT)));
  const camera: Camera = { x: initialLeader ? initialLeader.x + 4 : WIDTH / 2, y: initialLeader?.y ?? HEIGHT / 2, zoom: detailZoom() };
  const picked = new Set<number>();
  const pickedCommanders = new Set<number>();
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
  let disposed = false;
  const audio = soundEffects();
  const view = () => viewOf(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), camera);
  const update = () => notify(summary(match, picked, cityId));
  const selectedCommanders = () => match.commanders.filter(commander => commander.team === 1 && pickedCommanders.has(commander.id));
  const currentCity = () => cityId === null ? null : match.cities[cityId];
  const myCity = () => {
    const city = currentCity();
    return city?.owner === 1 ? city : null;
  };
  const active = () => !disposed && !paused && !match.result && !document.hidden;
  const focus = () => { if (active()) canvas.focus({ preventScroll: true }); };
  function syncSelection() {
    const alive = new Set(match.commanders.filter(commander => commander.team === 1 && commanderMembers(match, commander.id).length > 0).map(commander => commander.id));
    for (const id of pickedCommanders) if (!alive.has(id)) pickedCommanders.delete(id);
    picked.clear();
    for (const unit of match.units) if (unit.team === 1 && pickedCommanders.has(unit.commanderId)) picked.add(unit.id);
  }
  function pick(units: Unit[], add: boolean) {
    if (!add) pickedCommanders.clear();
    for (const unit of units) if (unit.team === 1) pickedCommanders.add(unit.commanderId);
    syncSelection();
    if (units.length) {
      cityId = null;
      if (match.tutorial === 0) match.tutorial = 1;
    }
    rally = false;
    update();
  }
  function move(point: Point) {
    const commanders = selectedCommanders();
    if (!commanders.length) return;
    commanders.forEach((commander, index) => {
      const radius = index ? 4 * Math.ceil(index / 6) : 0;
      const angle = (index - 1) * Math.PI / 3;
      const destination = nearestOpen({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius }, match.map);
      commandCommander(match, commander.id, { mode: "move", point: destination });
    });
    if (match.tutorial === 1) match.tutorial = 2;
  }
  function attack(target: Unit) {
    const commanders = selectedCommanders();
    if (!commanders.length) return;
    for (const commander of commanders) commandCommander(match, commander.id, { mode: "attack", target: target.id });
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
    select(from, to, add) {
      if (!active()) return;
      const inside = (point: Point) => point.x >= Math.min(from.x, to.x) && point.x <= Math.max(from.x, to.x) &&
        point.y >= Math.min(from.y, to.y) && point.y <= Math.max(from.y, to.y);
      const badgeLeaders = match.commanders.filter(commander => commander.team === 1).map(commander => commanderLeader(match, commander.id))
        .filter((unit): unit is Unit => Boolean(unit)).filter(unit => inside(toWorld(view(), commanderBadge(view(), unit))));
      pick([...match.units.filter(unit => unit.team === 1 && inside(unit)), ...badgeLeaders], add);
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
      const screen = { x: view().x + point.x * view().scale, y: view().y + point.y * view().scale };
      const badgeLeader = match.commanders.map(commander => commanderLeader(match, commander.id)).find(unit => {
        if (!unit) return false;
        const badge = commanderBadge(view(), unit), padding = touch ? 5 : 2;
        return Math.abs(screen.x - badge.x) <= badge.width / 2 + padding && Math.abs(screen.y - badge.y) <= badge.height / 2 + padding;
      });
      const hits = badgeLeader ? [badgeLeader] : match.units.filter((unit) => dist(unit, point) <= radius)
        .sort((a, b) => dist(a, point) - dist(b, point));
      const enemy = hits.find((unit) => unit.team === 2);
      const own = hits.find((unit) => unit.team === 1);
      const city = match.cities.find((item) => dist(item, point) < Math.min(RADIUS, Math.max(radius, 0.8)));
      if (command || (touch && enemy && (!own || dist(enemy, point) < dist(own, point)))) {
        if (enemy) attack(enemy);
        else move(point);
      } else if (own && (badgeLeader || !city || dist(own, point) < dist(city, point))) {
        pick([own], add);
      } else if (city) {
        cityId = city.id;
        rally = false;
      } else if (touch) {
        move(point);
      } else if (!add) {
        pickedCommanders.clear();
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
    render(canvas, mini, terrain, view(), match, picked, cityId, flashes, box);
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
    if (paused) {
      audio.stop();
      if (changed && !match.result) {
        lastSave = performance.now();
        autosave();
      }
    } else if (!muted) void audio.enable().catch(() => {});
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
    speed(value: number) { speed = value === 2 ? 2 : 1; focus(); },
    sound(value: boolean) {
      muted = !value;
      if (value && active()) void audio.enable().catch(() => {});
      else audio.stop();
    },
    multi(value: boolean) { multi = value; controls.reset(); focus(); },
    selectAll() { if (active()) { pick(match.units.filter((unit) => unit.team === 1), false); focus(); } },
    selectCommander(id: number, center = true) {
      if (!active()) return;
      const commander = match.commanders.find(item => item.id === id && item.team === 1);
      const leader = commander && commanderLeader(match, id);
      if (!leader) return;
      pick(commanderMembers(match, id), false);
      if (center) {
        camera.x = leader.x; camera.y = leader.y;
        camera.zoom = Math.max(camera.zoom, detailZoom());
        clampCamera(camera, view());
      }
      focus();
    },
    autoFront(enabled: boolean) {
      if (!active()) return;
      for (const commander of selectedCommanders()) setCommanderAutoFront(match, commander.id, enabled);
      update(); focus();
    },
    deselect() { if (active()) { cityId = null; pick([], false); focus(); } },
    hold() {
      if (!active()) return;
      for (const commander of selectedCommanders()) commandCommander(match, commander.id, { mode: "hold" });
      rally = false;
      update(); focus();
    },
    sendToCity() {
      const city = currentCity();
      if (city && active()) { move(city); focus(); }
    },
    rally() { rally = Boolean(myCity()) && active(); focus(); return rally; },
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
