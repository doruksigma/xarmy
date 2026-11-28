"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { GAME_SPEEDS, recovery, startBattle, summary, timeLabel } from "./battle";
import type { Summary } from "./battle";
import { BattleHud, ManpowerScoreboard } from "./battle-hud";
import { formatSoldiers } from "./manpower";
import { AudioControls } from "./audio-controls";
import { unlockAudio } from "./audio";
import type { SoundMix } from "./audio-types";
import { copy } from "./copy";
import { CITY_PRODUCTION } from "./config";
import type { Difficulty } from "./config";
import { createMatch } from "./engine";
import type { Match } from "./engine";
import { defaults, emptyStats, loadMatch, readSettings, readStats, recordResult, saveMatch, saveSettings, validMatch } from "./storage";
import type { Settings } from "./storage";
import { mapIds } from "./terrain";
import type { MapId } from "./terrain";
import { landscapeCanvas } from "./render";
import { ONLINE_SESSION_KEY } from "./online-types";
import styles from "./game.module.css";

type Panel = "how" | "stats" | "settings";
type Game = ReturnType<typeof startBattle>;
const options: Difficulty[] = ["easy", "normal", "hard"];
const OnlineClient = dynamic(() => import("./online-client"), {
  ssr: false,
  loading: () => <p role="status">{copy.onlineLoading}</p>,
});

function MapThumbnail({ id }: { id: MapId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const terrain = landscapeCanvas(id);
    context.drawImage(terrain, 0, 0, canvas.width, canvas.height);
  }, [id]);
  return <canvas ref={ref} width={240} height={150} className={styles.mapThumbnail} aria-hidden="true" />;
}

export default function DotFront() {
  const [settings, setSettings] = useState(defaults);
  const [match, setMatch] = useState<Match | null>(null);
  const [saved, setSaved] = useState<Match | null>(null);
  const [stats, setStats] = useState(emptyStats);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(false);
  const [hud, setHud] = useState<Summary | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [multi, setMulti] = useState(false);
  const [wide, setWide] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const arena = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const battle = useRef<Game | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  function persist(value: Match) {
    const snapshot = structuredClone(value);
    setSaved(snapshot.result ? null : snapshot);
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      if (snapshot.result) await recordResult(snapshot);
      await saveMatch(snapshot);
    }).catch(() => setStatus(copy.noSave));
  }

  useEffect(() => {
    let alive = true;
    try { setSettings(readSettings()); } catch { setStatus(copy.noSave); }
    try { if (sessionStorage.getItem(ONLINE_SESSION_KEY)) setOnline(true); } catch { /* Rooms remain usable without remembered sessions. */ }
    void loadMatch().then((value) => {
      if (!alive || value === undefined) return;
      if (!validMatch(value)) setStatus(copy.badSave);
      else if (!value.result) setSaved(value);
    }).catch(() => { if (alive) setStatus(copy.noSave); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (panel !== "stats") return;
    let alive = true;
    void saveQueue.current.then(readStats).then((value) => {
      if (alive) setStats(value);
    }).catch(() => { if (alive) setStatus(copy.noSave); });
    return () => { alive = false; };
  }, [panel]);

  useEffect(() => {
    if (!match || !canvas.current || !mini.current) return;
    const game = startBattle(match, canvas.current, mini.current, setHud,
      () => {
        game.pause(true);
        setPaused(true);
      },
      () => persist(match), () => persist(match));
    battle.current = game;
    game.focus();
    return () => {
      game.dispose();
      battle.current = null;
    };
  }, [match]);

  useEffect(() => {
    battle.current?.soundMix({ masterVolume: settings.masterVolume, ambienceVolume: settings.ambienceVolume, effectsVolume: settings.effectsVolume });
  }, [settings.masterVolume, settings.ambienceVolume, settings.effectsVolume, match]);
  useEffect(() => { battle.current?.sound(settings.sound); }, [settings.sound, match]);
  useEffect(() => { battle.current?.speed(speed); }, [speed, match]);
  useEffect(() => { battle.current?.multi(multi); }, [multi, match]);
  useEffect(() => {
    if (paused || hud?.result) dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [paused, hud?.result]);

  function updateSettings(value: Settings) {
    setSettings(value);
    try { saveSettings(value); } catch { setStatus(copy.noSave); }
  }
  function changeSound(enabled: boolean) {
    if (enabled) unlockAudio();
    battle.current?.sound(enabled);
    updateSettings({ ...settings, sound: enabled });
  }
  function changeMix(mix: SoundMix) {
    if (settings.sound && battle.current) unlockAudio();
    battle.current?.soundMix(mix);
    updateSettings({ ...settings, ...mix });
  }
  function start(value: Match) {
    if (settings.sound) unlockAudio();
    const fresh = structuredClone(value);
    setStatus("");
    setHud(summary(fresh, new Set(), null));
    setMatch(fresh);
    setPaused(document.hidden);
    setMulti(false);
    setSpeed(1);
    setPanel(null);
    persist(fresh);
  }
  function newMatch(tutorial = false, level = settings.difficulty, map = settings.map) {
    const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-");
    start(createMatch(level, id, tutorial, tutorial ? "plains" : map));
  }
  function pause(value: boolean) {
    if (!value && settings.sound) unlockAudio();
    battle.current?.pause(value);
    setPaused(value);
    if (!value) battle.current?.focus();
  }
  function toMenu() {
    if (match) persist(match);
    if (document.fullscreenElement === arena.current) void document.exitFullscreen().catch(() => {});
    setWide(false);
    setMatch(null);
    setPanel(null);
  }
  async function fullscreen() {
    const element = arena.current;
    if (!element) return;
    if (document.fullscreenElement === element) {
      await document.exitFullscreen().catch(() => {});
    } else if (wide) {
      setWide(false);
    } else {
      try {
        if (!element.requestFullscreen) throw new Error();
        await element.requestFullscreen();
      } catch { setWide(true); }
    }
  }

  const difficultyPicker = (
    <label className={styles.field}>{copy.difficulty}
      <select value={settings.difficulty} onChange={(event) =>
        updateSettings({ ...settings, difficulty: event.target.value as Difficulty })}>
        {options.map((level) => <option key={level} value={level}>{copy[level]}</option>)}
      </select>
    </label>
  );

  const soundMix: SoundMix = { masterVolume: settings.masterVolume, ambienceVolume: settings.ambienceVolume, effectsVolume: settings.effectsVolume };
  if (online) return <OnlineClient initialMap={settings.map} sound={settings.sound} soundMix={soundMix}
    onSoundChange={(sound) => updateSettings({ ...settings, sound })}
    onMixChange={(mix) => updateSettings({ ...settings, ...mix })} onBack={() => setOnline(false)} />;

  if (!match || !hud) return (
    <section className={styles.shell} aria-labelledby="dot-front-title">
      <Link className={styles.back} href="/#oyunlar">{copy.back}</Link>
      <div className={styles.landing}>
        <div>
          <p className={styles.mapName}>{copy.mapCount}</p>
          <h1 id="dot-front-title">{copy.title}</h1>
          <p className={styles.lead}>{copy.description}</p>
          <div className={styles.briefing}>
            <span>{copy.openingCities}</span><span>{copy.openingArmy}</span>
            <span>{copy.openingComposition}</span><span>{copy.openingArmoredCities}</span>
            <span>{copy.automaticRecruitment}</span><span>{copy.openingFront}</span>
          </div>
          <p className={styles.selectedMap}><strong>{copy.maps[settings.map].name}</strong>{copy.maps[settings.map].detail}</p>
        </div>
        <div className={styles.menu}>
          {difficultyPicker}
          <button className={styles.primary} onClick={() => newMatch()}>{copy.quick}</button>
          <button onClick={() => setOnline(true)}>{copy.online}</button>
          <button disabled={!loaded || !saved} onClick={() => { if (saved) start(saved); }}>{copy.resume}</button>
          <button onClick={() => setPanel(panel === "how" ? null : "how")}>{copy.how}</button>
          <button onClick={() => setPanel(panel === "stats" ? null : "stats")}>{copy.stats}</button>
          <button onClick={() => setPanel(panel === "settings" ? null : "settings")}>{copy.settings}</button>
        </div>
      </div>
      <fieldset className={styles.mapPicker}>
        <legend>{copy.chooseMap}</legend>
        <div className={styles.mapGrid}>
          {mapIds.map((id) => <button key={id} type="button" className={styles.mapCard}
            aria-pressed={settings.map === id} onClick={() => updateSettings({ ...settings, map: id })}>
            <MapThumbnail id={id} />
            <span><strong>{copy.maps[id].name}</strong><small>{copy.maps[id].detail}</small></span>
          </button>)}
        </div>
      </fieldset>
      {saved && <p className={styles.note}>{copy.saveMap}: {copy.maps[saved.map].name} · {copy[saved.difficulty]} · {timeLabel(Math.floor(saved.elapsed))}</p>}
      {panel === "how" && <div className={styles.details}>
        <h2>{copy.how}</h2><p>{copy.goal}</p><p>{copy.manpowerRules}</p><p>{copy.armoredRules}</p><p>{copy.logistics}</p><p>{copy.frontRules}</p><p>{copy.pocketRules}</p><p>{copy.routeRules}</p><p>{copy.paceRules}</p><p>{copy.terrainRules}</p><p>{copy.controls}</p><p>{copy.touch}</p>
        <p className={styles.note}>{copy.tutorialMap}</p>
        <button onClick={() => newMatch(true)}>{copy.tutorial}</button>
      </div>}
      {panel === "stats" && <div className={styles.details}>
        <h2>{copy.stats}</h2>
        <p>{copy.won} {stats.won} · {copy.lost} {stats.lost} · {copy.draw} {stats.draw}</p>
      </div>}
      {panel === "settings" && <div className={styles.details}><h2>{copy.settings}</h2>
        <AudioControls sound={settings.sound} mix={soundMix} onSoundChange={changeSound} onMixChange={changeMix} />
      </div>}
      <p className={styles.note} role="status">{status || (loaded ? copy.saved : copy.loading)}</p>
    </section>
  );

  const city = hud.city;
  const canCommand = !paused && !hud.result;
  const hasSelection = hud.light + hud.heavy > 0;
  return (
    <section className={styles.shell} aria-labelledby="dot-front-title">
      <Link className={styles.back} href="/#oyunlar">{copy.back}</Link>
      <h1 className={styles.heading} id="dot-front-title">{copy.title} <span className={styles.matchMap}>{copy.maps[match.map].name}</span></h1>
      <section ref={arena} className={wide ? styles.wide : styles.arena} aria-label={copy.title}>
        <BattleHud hud={hud} />
        {hud.shortage > 0 && <p className={styles.warning} role="status">
          {copy.supplyWarning} · {recovery(hud.shortage) ? recovery(hud.shortage) + " sn" : copy.attrition}
        </p>}
        {hud.bluePocketed > 0 && <p className={styles.pocketWarning} role="status">
          <strong>{hud.bluePocketed} {copy.pocketWarning}.</strong> {copy.pocketRescue}
        </p>}
        {hud.tutorial !== null && <p className={styles.tutorial} role="status">{copy.steps[hud.tutorial]}</p>}
        <div className={styles.ordersPanel} aria-label={copy.orders}>
          <div className={styles.ordersTitle}><strong>{copy.orders}</strong><span>{copy.ordersHint}</span></div>
          <div className={styles.tactics} role="group" aria-label={copy.tactics}>
            <button disabled={!canCommand || !hasSelection} title={copy.attackHint}
              aria-pressed={hud.selectedStance === "attack"}
              onClick={() => battle.current?.stance("attack")}>{copy.attackStance}</button>
            <button disabled={!canCommand || !hasSelection} title={copy.defendHint}
              aria-pressed={hud.selectedStance === "defend"}
              onClick={() => battle.current?.stance("defend")}>{copy.defendStance}</button>
            <button className={styles.frontButton} disabled={!canCommand} title={copy.spreadHint}
              onClick={() => battle.current?.frontlineAll()}>{copy.spreadAll}</button>
          </div>
        </div>
        {hud.routeDrawing && <p className={styles.routeHint} role="status">{copy.drawingRoute}</p>}
        <div className={styles.stage}>
          <canvas className={styles.canvas} ref={canvas} tabIndex={0} aria-label={copy.maps[match.map].name} />
          <canvas ref={mini} className={styles.minimap} width={192} height={120} aria-label={copy.maps[match.map].name}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              battle.current?.pan({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
            }} />
          {(paused || hud.result) && <div className={styles.shade}>
            <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="battle-dialog"
              onKeyDown={(event) => {
                if (event.key === "Escape" && !hud.result && !event.repeat) {
                  event.preventDefault(); event.stopPropagation(); pause(false);
                }
                if (event.key !== "Tab") return;
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                if (event.shiftKey && document.activeElement === buttons[0]) {
                  event.preventDefault(); buttons.at(-1)?.focus();
                } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
                  event.preventDefault(); buttons[0]?.focus();
                }
              }}>
              <h2 id="battle-dialog">{hud.result ? copy[hud.result] : copy.paused}</h2>
              {hud.result ? <>
                <p>{copy.time} {timeLabel(hud.time)} · {copy.captured} {hud.report.captured}</p>
                <ManpowerScoreboard hud={hud} result />
                <p>{copy.remainingArmies}: {copy.player} {hud.manpower.blue.formations} · {copy.enemy} {hud.manpower.red.formations}</p>
                <button className={styles.primary} onClick={() => newMatch(false, match.difficulty, match.map)}>{copy.replay}</button>
              </> : <>
                <button className={styles.primary} onClick={() => pause(false)}>{copy.resume}</button>
                <button onClick={() => { battle.current?.surrender(); setPaused(false); }}>{copy.surrender}</button>
              </>}
              <button onClick={toMenu}>{copy.menu}</button>
            </div>
          </div>}
        </div>
        <div className={styles.toolbar}>
          <button disabled={!canCommand} onClick={() => battle.current?.selectAll()}>{copy.selectAll}</button>
          <button disabled={!canCommand || (!hasSelection && !city)} onClick={() => battle.current?.deselect()}>{copy.deselect}</button>
          <button disabled={!canCommand || !hasSelection} onClick={() => battle.current?.hold()}>{copy.hold}</button>
          <button disabled={!canCommand || !hasSelection} aria-pressed={hud.routeDrawing}
            onClick={() => battle.current?.routeMode(!hud.routeDrawing)}>{copy.drawRoute}</button>
          <button disabled={!canCommand} aria-pressed={multi} onClick={() => setMulti(!multi)}>{copy.multi}</button>
          <button disabled={!canCommand} onClick={() => pause(true)}>{copy.pause}</button>
          <label className={styles.speedControl}>{copy.speed}
            <select aria-label={copy.speed} value={speed} disabled={Boolean(hud.result)}
              onChange={(event) => setSpeed(Number(event.target.value))}>
              {GAME_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
          <AudioControls compact sound={settings.sound} mix={soundMix} onSoundChange={changeSound} onMixChange={changeMix} />
          <button onClick={() => void fullscreen()}>{copy.full}</button>
        </div>
        <div className={styles.inspector}>
          <span>{copy.selectedArmies} <b>{hud.selectedUnits}</b></span>
          <span>{copy.selectedSoldiers} <b>{formatSoldiers(hud.selectedSoldiers)}</b></span>
          {hud.selectedStance && <span>{hud.selectedStance === "attack" ? copy.attackStance : hud.selectedStance === "defend" ? copy.defendStance : hud.selectedStance === "mixed" ? copy.mixedOrders : copy.manualOrders}</span>}
          <span>{copy.light} <b>{hud.light}</b> · {copy.heavy} <b>{hud.heavy}</b></span>
          {hud.selectedPocketed > 0 && <span className={styles.pocketStatus} role="status">
            {copy.pocketed} <b>{hud.selectedPocketed}/{hud.selectedUnits}</b> · {hud.selectedPocketGrace
              ? `${copy.pocketGrace} ${hud.selectedPocketGrace} ${copy.seconds}` : copy.pocketDamage}
          </span>}
          <span className={styles.note}>{copy.liveFront}</span>
          {(!city || city.owner !== 1) && <span className={styles.armoredHint}>{copy.armoredHint}</span>}
          {city && <>
            <strong>{copy.placeNames[city.id]} · {city.owner ? copy[city.owner === 1 ? "player" : "enemy"] : copy.neutral}</strong>
            {hud.cityIsolated && <span className={styles.pocketStatus}>{copy.isolatedCity}</span>}
            <button disabled={!canCommand || !hasSelection} onClick={() => battle.current?.sendToCity()}>{copy.send}</button>
            {city.owner === 1 && <>
              <label className={styles.field}>{copy.production}
                <progress aria-label={copy.cityProductionTimer} value={city.build?.elapsed ?? 0} max={CITY_PRODUCTION} />
                <span>{Math.floor(city.build?.elapsed ?? 0)}/{CITY_PRODUCTION} {copy.seconds}</span>
              </label>
              <span className={styles.note}>{copy.productionEvery}</span>
              <span>{copy.productionKind}: {copy[city.build?.kind ?? "light"]}</span>
              <button disabled={!canCommand} aria-pressed={city.build?.kind === "light"}
                onClick={() => battle.current?.build("light")}>{copy.chooseLight}</button>
              <button disabled={!canCommand} aria-pressed={city.build?.kind === "heavy"} title={copy.armoredProductionHint}
                onClick={() => battle.current?.build("heavy")}>{copy.chooseHeavy}</button>
              <button disabled={!canCommand} aria-pressed={battle.current?.rallyPending() ?? false}
                onClick={() => { battle.current?.rally(); setHud({ ...hud }); }}>{copy.rally}</button>
              {battle.current?.rallyPending() && <span className={styles.note}>{copy.rallyHint}</span>}
              {hud.blocked && <span className={styles.warning}>{hud.cityIsolated ? copy.isolatedProduction : copy.supplyWarning}</span>}
            </>}
          </>}
        </div>
        <div className={styles.recruitmentBar}>
          <span>{copy.producingCities}: <b>{hud.producingCities}/{hud.playerCities}</b></span>
          <span>{hud.nextProductionIn === null ? hud.playerCities ? copy.productionWaiting : copy.productionNoCities
            : `${copy.nextReinforcement}: ${hud.nextProductionIn} ${copy.seconds}`}</span>
          <span>{copy.productionEvery}</span>
        </div>
        {status && <p className={styles.note} role="status">{status}</p>}
      </section>
      <p className={styles.note}>{copy.touch}</p>
    </section>
  );
}
