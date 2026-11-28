import { decide } from "./ai";
import { soundEffects, unlockAudio } from "./audio";
import type { SoundMix } from "./audio-types";
import { combatSoundsBetween, spatialSound } from "./combat-audio";
import { CITY_PRODUCTION, GRACE, HEIGHT, MAX_ROUTE_POINTS, POCKET_GRACE, RADIUS, STEP, SUPPORT_PRODUCTION, WIDTH, dist, units } from "./config";
import type { GroundKind, Kind, Point, Team } from "./config";
import { applyGameCommand, canApplyGameCommand } from "./commands";
import type { GameCommand } from "./commands";
import { step, supply, supportSourceCity } from "./engine";
import type { Flash, Match, Order, Unit } from "./engine";
import { bindInput, clampCamera, MAX_ZOOM } from "./input";
import { landscapeCanvas, render, resize, viewOf } from "./render";
import type { Box, Camera } from "./render";
import { isSupplied } from "./territory";
import { manpower, soldiersInUnit } from "./manpower";
import { economySummary } from "./economy";

export const GAME_SPEEDS = [0.5, 1, 2, 3] as const;
const MAX_STEPS_PER_FRAME = 6;
const SIMULATION_BUDGET_MS = 8;
const MAX_SIMULATION_BUDGET_MS = 24;
const MINIMAP_INTERVAL_MS = 100;

export function summary(match: Match, picked: Set<number>, cityId: number | null, routeDrawing = false, localTeam: Team = 1) {
  const city = cityId === null ? null : match.cities.find(item => item.id === cityId);
  const logistics = supply(match, localTeam);
  const selected = match.units.filter((unit) => unit.team === localTeam && picked.has(unit.id) && unit.hp > 0);
  const ownedCities = match.cities.filter(item => item.owner === localTeam);
  const producing = ownedCities.filter(item => item.build && isSupplied(match, localTeam, item) &&
    logistics.used + units[item.build.kind].supply <= logistics.capacity);
  const nextProductionIn = producing.length
    ? Math.max(0, Math.ceil(CITY_PRODUCTION - Math.max(...producing.map(item => item.build!.elapsed)))) : null;
  const cityLogistics = city?.owner ? city.owner === localTeam ? logistics : supply(match, city.owner) : null;
  const pocketed = selected.filter(unit => unit.pocketed);
  const cityIsolated = Boolean(city?.owner && !isSupplied(match, city.owner, city));
  const selectedStance: Unit["stance"] | "mixed" | null = !selected.length ? null
    : selected.every(unit => unit.stance === selected[0].stance) ? selected[0].stance : "mixed";
  const armyKinds = { light: 0, heavy: 0, artillery: 0, aircraft: 0 };
  for (const unit of match.units) if (unit.team === localTeam && unit.hp > 0) armyKinds[unit.kind]++;
  const supportCity = supportSourceCity(match, localTeam), supportClocks = match.support[localTeam - 1];
  return {
    localTeam, time: Math.floor(match.elapsed), logistics, shortage: match.shortage[localTeam - 1],
    blue: match.units.filter((unit) => unit.team === 1).length,
    red: match.units.filter((unit) => unit.team === 2).length,
    blueCities: match.cities.filter((item) => item.owner === 1).length,
    redCities: match.cities.filter((item) => item.owner === 2).length,
    bluePocketed: match.units.filter(unit => unit.team === 1 && unit.pocketed).length,
    player: match.units.filter(unit => unit.team === localTeam).length,
    enemy: match.units.filter(unit => unit.team !== localTeam).length,
    playerCities: ownedCities.length,
    enemyCities: match.cities.filter(item => item.owner && item.owner !== localTeam).length,
    playerPocketed: match.units.filter(unit => unit.team === localTeam && unit.pocketed).length,
    producingCities: producing.length, nextProductionIn,
    armyKinds, economy: economySummary(match, localTeam),
    support: {
      artilleryIn: Math.max(0, Math.ceil(SUPPORT_PRODUCTION - supportClocks.artillery)),
      aircraftIn: Math.max(0, Math.ceil(SUPPORT_PRODUCTION - supportClocks.aircraft)),
      cityId: supportCity?.id ?? null,
      blocked: !supportCity || logistics.used + Math.min(units.artillery.supply, units.aircraft.supply) > logistics.capacity || match.units.length >= 600,
    },
    selectedUnits: selected.length, selectedStance,
    manpower: manpower(match), selectedSoldiers: selected.reduce((total, unit) => total + soldiersInUnit(unit), 0),
    selectedPocketed: pocketed.length,
    selectedPocketGrace: pocketed.length ? Math.max(0, Math.ceil(POCKET_GRACE - Math.max(...pocketed.map(unit => unit.pocketTime)))) : null,
    routeDrawing: routeDrawing && selected.length > 0,
    light: selected.filter((unit) => unit.kind === "light").length, heavy: selected.filter((unit) => unit.kind === "heavy").length,
    artillery: selected.filter((unit) => unit.kind === "artillery").length, aircraft: selected.filter((unit) => unit.kind === "aircraft").length,
    city: city && { ...city, build: city.build && { ...city.build } },
    cityIsolated,
    blocked: Boolean(city?.build && cityLogistics && (cityIsolated || cityLogistics.used + units[city.build.kind].supply > cityLogistics.capacity)),
    tutorial: match.tutorial,
    result: localTeam === 2 && match.result && match.result !== "draw" ? match.result === "won" ? "lost" as const : "won" as const : match.result,
    report: { ...match.report },
  };
}

export type Summary = ReturnType<typeof summary>;
export type BattleOptions = {
  team?: Team; simulate?: boolean; bot?: boolean; command?: (cmd: GameCommand) => void;
  audio?: ReturnType<typeof soundEffects>;
};

export function startBattle(
  match: Match, canvas: HTMLCanvasElement, mini: HTMLCanvasElement,
  notify: (summary: Summary) => void, onPause: () => void, autosave: () => void, finished: () => void,
  options: BattleOptions = {},
) {
  const localTeam = options.team ?? 1, simulate = options.simulate ?? true, bot = options.bot ?? true;
  const direction = localTeam === 1 ? 1 : -1;
  let terrain = landscapeCanvas(match.map);
  const initialUnit = match.units.filter(unit => unit.team === localTeam)
    .sort((a, b) => dist(a, { x: WIDTH / 2 - direction * 6, y: HEIGHT / 2 }) - dist(b, { x: WIDTH / 2 - direction * 6, y: HEIGHT / 2 }))[0];
  const detailZoom = () => Math.max(1, Math.min(MAX_ZOOM,
    20 / Math.min(Math.max(1, canvas.clientWidth) / WIDTH, Math.max(1, canvas.clientHeight) / HEIGHT)));
  const camera: Camera = { x: initialUnit ? initialUnit.x + direction * 4 : WIDTH / 2, y: initialUnit?.y ?? HEIGHT / 2, zoom: detailZoom() };
  const picked = new Set<number>();
  let cityId: number | null = null;
  let flashes: Flash[] = [];
  let box: Box | null = null;
  let paused = document.hidden;
  let pageHidden = false;
  let multi = false;
  let rally = false;
  let routeDrawing = false;
  let routePreview: Point[] = [];
  let speed = 1;
  let muted = true;
  let snapshotAudioReady = false;
  let snapshotVisualReady = false;
  let guestVisualAge = 0;
  let frame = 0;
  let previous = 0;
  let accumulator = 0;
  let nextNotice = 0;
  let lastSave = performance.now();
  let notifiedResult = false;
  let disposed = false;
  let ticking = false;
  let dirty = true;
  let hudReady = false;
  let lastPaint = -Infinity;
  let lastMiniPaint = -Infinity;
  let paintedElapsed = -1;
  let paintedView: ReturnType<typeof viewOf> | null = null;
  let paintedRatio = 0;
  const renderInterval = window.matchMedia?.("(pointer: coarse)").matches ? 1000 / 30 : 1000 / 60;
  const audio = options.audio ?? soundEffects();
  const view = () => viewOf(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), camera);
  function requestPaint() { dirty = true; schedule(); }
  const update = () => { hudReady = true; requestPaint(); notify(summary(match, picked, cityId, routeDrawing, localTeam)); };
  const selected = () => match.units.filter(unit => unit.team === localTeam && picked.has(unit.id) && unit.hp > 0);
  const currentCity = () => cityId === null ? null : match.cities.find(city => city.id === cityId);
  const myCity = () => {
    const city = currentCity();
    return city?.owner === localTeam ? city : null;
  };
  const dispatch = (command: GameCommand) => {
    if (!canApplyGameCommand(match, localTeam, command)) return;
    if (options.command) options.command(command);
    else applyGameCommand(match, localTeam, command);
  };
  const active = () => !disposed && !paused && !pageHidden && !match.result && !document.hidden;
  const unlock = () => {
    if (muted || !active()) return;
    unlockAudio();
    void audio.enable().catch(() => {});
  };
  const playCombat = (events: readonly { kind: Kind; from: Point; impact?: Point }[]) => {
    if (muted || !active() || !events.length) return;
    const currentView = view();
    // Keep the closest battles audible when many armies fire in one update.
    const nearby = events.map(event => {
      const position = spatialSound(event.from, currentView);
      const impact = event.impact ? spatialSound(event.impact, currentView) : undefined;
      return { event, position, impact, distance: Math.min(position.distance, impact?.distance ?? 1) };
    }).filter(item => item.distance < 1).sort((a, b) => a.distance - b.distance).slice(0, 12);
    for (const { event, position, impact } of nearby) {
      audio.shot({ kind: event.kind, ...position });
      if (impact) audio.impact(impact);
    }
  };
  const focus = () => { if (active()) canvas.focus({ preventScroll: true }); };
  function exitRoute() {
    routeDrawing = false;
    routePreview = [];
    controls.reset();
  }
  function syncSelection() {
    const count = picked.size;
    if (!count) return false;
    const unitIds = new Set(match.units.filter(unit => unit.team === localTeam && unit.hp > 0).map(unit => unit.id));
    for (const id of picked) if (!unitIds.has(id)) picked.delete(id);
    if (!picked.size && routeDrawing) exitRoute();
    return count !== picked.size;
  }
  function pick(units: Unit[], add: boolean) {
    exitRoute();
    if (!add) picked.clear();
    for (const unit of units) if (unit.team === localTeam) picked.add(unit.id);
    syncSelection();
    if (units.length) {
      cityId = null;
      if (!options.command && match.tutorial === 0) match.tutorial = 1;
    }
    rally = false;
    update();
  }
  function move(point: Point) {
    exitRoute();
    const individuals = selected();
    if (!individuals.length) return;
    dispatch({ kind: "move", ids: individuals.map(unit => unit.id), point });
  }
  function issue(order: Order) {
    dispatch({ kind: "order", ids: selected().map(unit => unit.id), order });
  }
  function attack(target: Unit) {
    exitRoute();
    if (!picked.size) return;
    issue({ mode: "attack", target: target.id });
  }
  function finish() {
    if (!match.result || notifiedResult || disposed) return;
    notifiedResult = true;
    audio.stop();
    controls.reset();
    finished();
  }

  const controls = bindInput(canvas, {
    view, camera, active, multi: () => multi, drag: (value) => { box = value; requestPaint(); },
    invalidate: requestPaint,
    pause: () => { setPaused(true); onPause(); },
    routeMode: () => routeDrawing && picked.size > 0,
    preview: points => { routePreview = points; requestPaint(); },
    route: points => {
      if (!active() || !picked.size || !points.length) return;
      issue({ mode: "route", points: points.slice(0, MAX_ROUTE_POINTS).map(point => ({ ...point })), next: 0 });
      exitRoute();
      update();
    },
    select(from, to, add) {
      if (!active()) return;
      const inside = (point: Point) => point.x >= Math.min(from.x, to.x) && point.x <= Math.max(from.x, to.x) &&
        point.y >= Math.min(from.y, to.y) && point.y <= Math.max(from.y, to.y);
      pick(match.units.filter(unit => unit.team === localTeam && inside(unit)), add);
    },
    tap(point, command, touch, add, radius) {
      if (!active()) return;
      const owned = myCity();
      if (rally && owned) {
        dispatch({ kind: "rally", city: owned.id, point });
        rally = false;
        update();
        return;
      }
      const hits = match.units.filter((unit) => dist(unit, point) <= Math.max(radius,
        unit.kind === "aircraft" ? 1.15 : unit.kind === "artillery" ? .8 : 0))
        .sort((a, b) => {
          const distance = dist(a, point) - dist(b, point);
          // Aircraft are painted above ground units; honor that order only
          // when their hit areas substantially overlap.
          return Math.abs(distance) < .3 && (a.kind === "aircraft") !== (b.kind === "aircraft")
            ? a.kind === "aircraft" ? -1 : 1 : distance;
        });
      const enemy = hits.find((unit) => unit.team !== localTeam);
      const own = hits.find((unit) => unit.team === localTeam);
      const city = match.cities.find((item) => dist(item, point) < Math.min(RADIUS, Math.max(radius, 0.8)));
      if (command || (touch && enemy && (!own || dist(enemy, point) < dist(own, point)))) {
        if (enemy) attack(enemy);
        else move(point);
      } else if (own && (!city || dist(own, point) < dist(city, point) ||
        ((own.kind === "artillery" || own.kind === "aircraft") && dist(own, point) <= dist(city, point) + .05 &&
          dist(own, point) <= (own.kind === "aircraft" ? .6 : .55)))) {
        // Support glyphs are drawn above cities and may stay on their spawn
        // city. A tied tap must still make that individual unit selectable.
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
    ticking = true;
    const delta = previous ? Math.max(0, Math.min((now - previous) / 1000, 0.15)) : 0;
    previous = now;
    if (active() && !document.hidden) {
      controls.moveCamera(delta);
      if (simulate) accumulator += delta * speed;
      else if (flashes.length) {
        // Animate guest effects between network snapshots without advancing
        // the authoritative battle, production or economy clocks.
        guestVisualAge += delta * speed;
        flashes = flashes.filter(flash => flash.expires > match.elapsed + guestVisualAge);
        dirty = true;
      }
      let steps = 0;
      const simulationStart = performance.now();
      const dueSteps = Math.floor((accumulator + 1e-10) / STEP);
      // A slower frame has more legitimate fixed steps due. Give those steps
      // proportionate time so 3x remains 3x at 20–30Hz, while capping long bursts.
      const simulationBudget = Math.min(MAX_SIMULATION_BUDGET_MS, Math.max(SIMULATION_BUDGET_MS, dueSteps * SIMULATION_BUDGET_MS));
      while (accumulator + 1e-10 >= STEP && !match.result && steps < MAX_STEPS_PER_FRAME) {
        // Keep fixed steps and retain unprocessed debt. Yield between steps so a
        // slow tablet can deliver input instead of doing a long catch-up burst.
        if (steps && performance.now() - simulationStart >= simulationBudget) break;
        accumulator -= STEP;
        steps++;
        const before = flashes.length;
        step(match, STEP, flashes, bot ? decide : () => {});
        if (!muted && flashes.length > before) {
          const living = new Set(match.units.map(unit => unit.id));
          playCombat(flashes.slice(before).map(flash => ({ kind: flash.kind, from: flash.from,
            impact: flash.kind !== "light" || !living.has(flash.targetId) ? flash.to : undefined })));
        }
      }
      if (steps) {
        if (flashes.length) flashes = flashes.filter((flash) => flash.expires > match.elapsed);
        if (syncSelection()) update();
      }
      if (simulate && now - lastSave >= 15_000 && !match.result) {
        lastSave = now;
        autosave();
      }
    }
    if (!hudReady || (simulate && active() && now >= nextNotice) || (match.result && !notifiedResult)) {
      nextNotice = now + 160;
      update();
    }
    finish();
    if (disposed) { ticking = false; return; }
    let currentView = view();
    clampCamera(camera, currentView);
    currentView = view();
    const ratio = window.devicePixelRatio || 1;
    const resized = !paintedView || currentView.width !== paintedView.width || currentView.height !== paintedView.height || ratio !== paintedRatio;
    const cameraMoved = !paintedView || currentView.x !== paintedView.x || currentView.y !== paintedView.y || currentView.scale !== paintedView.scale;
    const changed = dirty || resized || cameraMoved || match.elapsed !== paintedElapsed;
    if (changed && (!active() || now - lastPaint + .1 >= renderInterval)) {
      resize(canvas);
      const paintMini = resized || !active() || now - lastMiniPaint >= MINIMAP_INTERVAL_MS;
      render(canvas, paintMini ? mini : null, terrain, currentView, match, picked, cityId, flashes, box, routePreview,
        match.elapsed + (simulate ? 0 : guestVisualAge));
      if (paintMini) lastMiniPaint = now;
      paintedView = currentView;
      paintedRatio = ratio;
      paintedElapsed = match.elapsed;
      lastPaint = now;
      dirty = false;
    }
    ticking = false;
    if (active() || dirty) schedule();
  }
  function schedule() {
    if (!disposed && !ticking && !frame && !pageHidden && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function setPaused(value: boolean) {
    if (disposed) return;
    const next = value || document.hidden || pageHidden || Boolean(match.result);
    const changed = paused !== next;
    paused = next;
    accumulator = 0;
    previous = 0;
    controls.reset();
    box = null;
    if (paused) { routeDrawing = false; routePreview = []; }
    if (paused) {
      snapshotAudioReady = false;
      snapshotVisualReady = false;
      audio.stop();
      if (simulate && changed && !match.result) {
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
    pageHidden = true;
    setPaused(true);
    stopFrame();
    if (!match.result) onPause();
  }
  function pageshow() {
    pageHidden = false;
    previous = 0;
    accumulator = 0;
    if (paused && !match.result) onPause();
    schedule();
  }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  window.addEventListener("resize", requestPaint);
  canvas.addEventListener("pointerdown", unlock);
  canvas.addEventListener("keydown", unlock);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(requestPaint);
  observer?.observe(canvas);

  return {
    focus,
    pause: setPaused,
    speed(value: number) { speed = (GAME_SPEEDS as readonly number[]).includes(value) ? value : 1; },
    sound(value: boolean) {
      if (muted === value) snapshotAudioReady = false;
      muted = !value;
      if (value && active()) void audio.enable().catch(() => {});
      else audio.stop();
    },
    soundMix(mix: Partial<SoundMix>) { if (!disposed) audio.configure(mix); },
    multi(value: boolean) { multi = value; controls.reset(); focus(); },
    selectAll() { if (active()) { pick(match.units.filter((unit) => unit.team === localTeam), false); focus(); } },
    stance(value: "attack" | "defend") {
      if (!active()) return;
      exitRoute();
      dispatch({ kind: "stance", ids: [...picked], stance: value });
      update(); focus();
    },
    frontlineAll() {
      if (!active()) return;
      pick(match.units.filter(unit => unit.team === localTeam), false);
      dispatch({ kind: "stance", ids: [...picked], stance: "defend" });
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
    build(kind: GroundKind = "light") {
      const city = myCity();
      if (!active() || !city) return;
      dispatch({ kind: "build", city: city.id, unit: kind });
      update();
      focus();
    },
    pan(point: Point) {
      if (!active()) return;
      camera.zoom = Math.max(1.5, camera.zoom);
      camera.x = point.x * WIDTH;
      camera.y = point.y * HEIGHT;
      clampCamera(camera, view());
      requestPaint();
      focus();
    },
    surrender() {
      if (disposed || match.result) return;
      match.result = localTeam === 1 ? "lost" : "won";
      update();
      // Commit the result even if the page closes before another animation frame.
      finish();
    },
    replaceSnapshot(snapshot: Match) {
      if (disposed) return;
      const events = snapshotVisualReady && !simulate && active() ? combatSoundsBetween(match, snapshot) : [];
      const sounds = snapshotAudioReady && !muted ? events : [];
      const copy = structuredClone(snapshot);
      if (copy.map !== match.map) terrain = landscapeCanvas(copy.map);
      Object.assign(match, copy);
      guestVisualAge = 0;
      // The guest does not simulate combat. Reconstruct brief visual events
      // from fresh authoritative cooldown resets, even when sound is muted.
      flashes = events.flatMap(event => event.to && event.targetId !== undefined ? [{
        kind: event.kind, from: event.from, to: event.to, team: event.team, targetId: event.targetId,
        expires: match.elapsed + (event.kind === "artillery" ? .8 : event.kind === "aircraft" ? .7 : .18),
      }] : []);
      accumulator = 0;
      previous = 0;
      syncSelection();
      if (cityId !== null && !currentCity()) cityId = null;
      if (!myCity()) rally = false;
      if (match.result) { routeDrawing = false; routePreview = []; box = null; controls.reset(); }
      update();
      playCombat(sounds);
      snapshotAudioReady = !simulate && !muted && active();
      snapshotVisualReady = !simulate && active();
      finish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopFrame();
      controls.dispose();
      audio.dispose();
      canvas.removeEventListener("pointerdown", unlock);
      canvas.removeEventListener("keydown", unlock);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      window.removeEventListener("resize", requestPaint);
    },
  };
}

export const timeLabel = (seconds: number) => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
export const recovery = (shortage: number) => Math.max(0, Math.ceil(GRACE - shortage));
