"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_SPEEDS, recovery, startBattle, summary, timeLabel } from "./battle";
import type { Summary } from "./battle";
import { BattleHud, ManpowerScoreboard, SupportHud } from "./battle-hud";
import { formatSoldiers } from "./manpower";
import { AudioControls } from "./audio-controls";
import { unlockAudio } from "./audio";
import type { SoundMix } from "./audio-types";
import { CITY_PRODUCTION, HEIGHT, WIDTH } from "./config";
import { copy } from "./copy";
import type { Match } from "./engine";
import { clearRoomSession, connectRoom, createRoom, joinRoom, restoreRoomSession } from "./online-session";
import type { OnlineController } from "./online-session";
import type { RoomAction, RoomSession, RoomView, OnlineSpeed } from "./online-types";
import { mapIds } from "./terrain";
import type { MapId } from "./terrain";
import styles from "./game.module.css";

type Game = ReturnType<typeof startBattle>;
type Connection = "connected" | "reconnecting" | "closed";
type Action = Exclude<RoomAction, { action: "sync" }>;
type Props = { initialMap: MapId; sound: boolean; soundMix: SoundMix; onSoundChange(value: boolean): void; onMixChange(mix: SoundMix): void; onBack(): void };
const message = (error: unknown) => error instanceof Error ? error.message : copy.onlineError;

export default function OnlineClient({ initialMap, sound, soundMix, onSoundChange, onMixChange, onBack }: Props) {
  const [map, setMap] = useState(initialMap);
  const [code, setCode] = useState("");
  const [session, setSession] = useState<RoomSession | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [hud, setHud] = useState<Summary | null>(null);
  const [connection, setConnection] = useState<Connection>("reconnecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<"create" | "join" | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(true);
  const [multi, setMulti] = useState(false);
  const [wide, setWide] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const arena = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const battle = useRef<Game | null>(null);
  const controller = useRef<OnlineController | null>(null);
  const stableMatch = useRef<Match | null>(null);
  const currentRoom = useRef<RoomView | null>(null);
  const currentConnection = useRef<Connection>("reconnecting");
  const accessAbort = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const appliedPause = useRef(true);
  const pauseRequested = useRef(false);
  const leavingRoom = useRef(false);
  const invalidSnapshot = useRef(false);
  const soundEnabled = useRef(sound);

  useEffect(() => {
    mounted.current = true;
    const remembered = restoreRoomSession();
    if (remembered) setSession(remembered);
    return () => { mounted.current = false; accessAbort.current?.abort(); };
  }, []);

  const control = useCallback(async (value: Action) => {
    const active = controller.current;
    if (!active) return;
    if ((value.action === "start" || value.action === "resume") && soundEnabled.current) unlockAudio();
    setError(""); setBusy(true);
    if (value.action === "pause" || value.action === "resign") {
      pauseRequested.current = true; appliedPause.current = true;
      battle.current?.pause(true); setPaused(true);
    }
    try { await active.action(value); }
    catch (failure) { if (mounted.current) setError(message(failure)); }
    finally {
      if (value.action === "pause" || value.action === "resign") pauseRequested.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    currentConnection.current = "reconnecting";
    setConnection("reconnecting");
    const applyControl = () => {
      const latest = currentRoom.current;
      const freeze = pauseRequested.current || leavingRoom.current || invalidSnapshot.current || document.hidden ||
        currentConnection.current !== "connected" || !latest || latest.paused ||
        latest.status !== "playing" || !latest.hostPresent || !latest.guestPresent;
      // Polling a room must not reset an in-progress pointer gesture or the
      // host's simulation accumulator when the pause state has not changed.
      if (appliedPause.current !== freeze) {
        battle.current?.pause(freeze);
        appliedPause.current = freeze;
      }
      if (latest) battle.current?.speed(latest.speed);
      setPaused(freeze);
    };
    const online = connectRoom(session, {
      view(next) {
        if (disposed) return;
        currentRoom.current = next;
        setRoom(next);
        applyControl();
      },
      status(value, detail) {
        if (disposed) return;
        currentConnection.current = value;
        setConnection(value); setConnectionMessage(detail ?? "");
        applyControl();
        if (value === "closed" && currentRoom.current?.status !== "finished" && !stableMatch.current?.result) {
          clearRoomSession();
          setError(detail || copy.onlineClosed);
          setSession(null); setRoom(null); setMatch(null); setHud(null);
          currentRoom.current = null; stableMatch.current = null;
        }
      },
      replaceSnapshot(snapshot) {
        if (disposed) return;
        const current = stableMatch.current;
        if (!current) {
          stableMatch.current = snapshot;
          online.attach(snapshot);
          setHud(summary(snapshot, new Set(), null, false, session.team));
          setMatch(snapshot);
        } else if (current.id === snapshot.id && current.map === snapshot.map) {
          if (battle.current) battle.current.replaceSnapshot(snapshot);
          else {
            Object.assign(current, snapshot);
            setHud(summary(current, new Set(), null, false, session.team));
          }
        } else {
          invalidSnapshot.current = true; appliedPause.current = true;
          battle.current?.pause(true); setPaused(true); setError(copy.onlineSnapshotError);
        }
      },
    });
    controller.current = online;
    if (stableMatch.current) online.attach(stableMatch.current);
    return () => {
      disposed = true;
      online.dispose();
      if (controller.current === online) controller.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!match || !session || !canvas.current || !mini.current) return;
    const game = startBattle(match, canvas.current, mini.current, setHud,
      () => { void control({ action: "pause" }); }, () => {}, () => {}, {
        team: session.team, simulate: session.role === "host", bot: false,
        command: command => controller.current?.command(command),
      });
    battle.current = game;
    const latest = currentRoom.current;
    game.speed(latest?.speed ?? 1);
    const freeze = document.hidden || currentConnection.current !== "connected" || !latest || latest.paused ||
      latest.status !== "playing" || !latest.hostPresent || !latest.guestPresent;
    game.pause(freeze); appliedPause.current = freeze;
    game.focus();
    return () => {
      game.dispose();
      if (battle.current === game) battle.current = null;
    };
  }, [match, session, control]);

  useEffect(() => {
    battle.current?.soundMix({ masterVolume: soundMix.masterVolume, ambienceVolume: soundMix.ambienceVolume, effectsVolume: soundMix.effectsVolume });
  }, [soundMix.masterVolume, soundMix.ambienceVolume, soundMix.effectsVolume, match]);
  useEffect(() => { soundEnabled.current = sound; battle.current?.sound(sound); }, [sound, match]);
  useEffect(() => { battle.current?.multi(multi); }, [multi, match]);
  useEffect(() => {
    if (paused || hud?.result) dialog.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [paused, hud?.result]);

  async function enter(kind: "create" | "join") {
    if (pending || session) return;
    if (kind === "join" && !/^\d{6}$/.test(code)) { setError(copy.invalidCode); return; }
    if (sound) unlockAudio();
    setError(""); setNotice(""); setPending(kind);
    invalidSnapshot.current = false;
    const abort = new AbortController(); accessAbort.current = abort;
    try {
      const access = kind === "create" ? await createRoom(map, abort.signal) : await joinRoom(code, abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      currentRoom.current = access.room;
      setRoom(access.room); setSession(access.session);
    } catch (failure) {
      if (mounted.current && !abort.signal.aborted) setError(message(failure));
    } finally {
      if (accessAbort.current === abort) accessAbort.current = null;
      if (mounted.current) setPending(null);
    }
  }

  function changeSound(enabled: boolean) {
    if (enabled) unlockAudio();
    soundEnabled.current = enabled;
    battle.current?.sound(enabled);
    onSoundChange(enabled);
  }
  function changeMix(mix: SoundMix) {
    if (sound && battle.current) unlockAudio();
    battle.current?.soundMix(mix);
    onMixChange(mix);
  }

  async function leave() {
    if (leaving) return;
    leavingRoom.current = true; appliedPause.current = true;
    setLeaving(true); battle.current?.pause(true); setPaused(true);
    accessAbort.current?.abort();
    const online = controller.current;
    if (online) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      // Leaving stays possible offline; the server also expires absent rooms.
      await Promise.race([online.action({ action: "leave" }).catch(() => {}),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 1500); })]);
      if (timeout !== undefined) clearTimeout(timeout);
      online.dispose();
    }
    clearRoomSession();
    if (document.fullscreenElement === arena.current) await document.exitFullscreen().catch(() => {});
    if (mounted.current) onBack();
  }

  async function copyRoomCode() {
    if (!session) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(session.code);
      setNotice(copy.copiedCode);
    } catch {
      codeField.current?.focus(); codeField.current?.select();
      setNotice(copy.copyCodeFallback);
    }
  }

  async function fullscreen() {
    const element = arena.current;
    if (!element) return;
    if (document.fullscreenElement === element) await document.exitFullscreen().catch(() => {});
    else if (wide) setWide(false);
    else {
      try {
        if (!element.requestFullscreen) throw new Error();
        await element.requestFullscreen();
      } catch { setWide(true); }
    }
  }

  const role = session?.role;
  const connected = connection === "connected";
  const bothPresent = Boolean(room?.hostPresent && room.guestPresent);
  const connectionLabel = connected ? copy.onlineConnected : connection === "closed" ? copy.onlineClosed : copy.onlineReconnecting;
  const roomCode = session && <div className={styles.codeRow}>
    <label htmlFor="dot-front-room-code">{copy.roomCode}</label>
    <input id="dot-front-room-code" ref={codeField} className={styles.roomCode} value={session.code} readOnly
      onFocus={event => event.currentTarget.select()} />
    <button onClick={() => void copyRoomCode()}>{copy.copyCode}</button>
  </div>;
  const presence = room && <div className={styles.presence}>
    <span className={styles.blue}>{copy.host} · {copy.player}: <b>{room.hostPresent ? copy.present : copy.absent}</b></span>
    <span className={styles.red}>{copy.guest} · {copy.enemy}: <b>{room.guestPresent ? copy.present : copy.absent}</b></span>
  </div>;

  if (!match || !hud || !session || !room) return <section className={styles.shell} aria-labelledby="online-title">
    <button className={styles.onlineBack} disabled={leaving} onClick={() => void leave()}>{copy.onlineBack}</button>
    <div className={styles.details}>
      <p className={styles.mapName}>{copy.title} · {copy.online}</p>
      <h1 id="online-title" className={styles.heading}>{copy.onlineTitle}</h1>
      <p>{copy.onlineDescription}</p>
      {!session ? <div className={styles.onlineGrid}>
        <form className={styles.onlineCard} onSubmit={event => { event.preventDefault(); void enter("create"); }}>
          <h2>{copy.createRoom}</h2>
          <label className={styles.onlineField}>{copy.chooseMap}
            <select value={map} disabled={Boolean(pending)} onChange={event => setMap(event.target.value as MapId)}>
              {mapIds.map(id => <option key={id} value={id}>{copy.maps[id].name}</option>)}
            </select>
          </label>
          <p className={styles.note}>{copy.maps[map].detail}</p>
          <button className={styles.primary} disabled={Boolean(pending)} type="submit">{pending === "create" ? copy.onlineLoading : copy.createRoom}</button>
        </form>
        <form className={styles.onlineCard} onSubmit={event => { event.preventDefault(); void enter("join"); }}>
          <h2>{copy.joinRoom}</h2>
          <label className={styles.onlineField}>{copy.roomCode}
            <input value={code} type="text" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" required
              placeholder={copy.codePlaceholder} disabled={Boolean(pending)}
              onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          <button disabled={Boolean(pending)} type="submit">{pending === "join" ? copy.onlineLoading : copy.joinRoom}</button>
        </form>
      </div> : <div className={styles.onlineCard}>
        {roomCode}
        <p className={session.team === 1 ? styles.blue : styles.red}><strong>{copy.you}: {session.team === 1 ? copy.player : copy.enemy}</strong></p>
        {room && <p>{copy.onlineMap}: <strong>{copy.maps[room.map].name}</strong></p>}
        {presence}
        <p role="status">{connectionLabel}{connectionMessage ? ` ${connectionMessage}` : ""}</p>
        {room?.status === "waiting" ? <>
          <p>{room.guestJoined ? role === "host" ? copy.guestReady : copy.waitingHost : copy.waitingGuest}</p>
          {role === "host" && <button className={styles.primary} disabled={!connected || !room.guestJoined || !bothPresent || busy}
            onClick={() => void control({ action: "start" })}>{copy.startOnline}</button>}
        </> : <p>{copy.onlineLoading}</p>}
        <button disabled={leaving} onClick={() => void leave()}>{copy.leaveRoom}</button>
        <p className={styles.note}>{copy.leaveHint}</p>
      </div>}
      {error && <p className={styles.warning} role="alert">{error}</p>}
      {notice && <p className={styles.note} role="status">{notice}</p>}
      <p className={styles.note}>{copy.onlineRules}</p>
      <p className={styles.note}>{copy.openingComposition} · {copy.openingArmoredCities}</p>
      <p className={styles.note}>{copy.openingSupport} · {copy.openingEconomy}</p>
      <p className={styles.note}>{copy.automaticRecruitment} · {copy.onlineSave}</p>
    </div>
  </section>;

  const canCommand = connected && !paused && !hud.result && room.status === "playing";
  const hasSelection = hud.selectedUnits > 0;
  const canResume = role === "host" && connected && bothPresent && !busy && !hud.result;
  const city = hud.city;
  return <section className={styles.shell} aria-labelledby="online-title">
    <h1 id="online-title" className={styles.heading}>{copy.title} <span className={styles.matchMap}>{copy.online} · {copy.maps[match.map].name}</span></h1>
    <section ref={arena} className={wide ? styles.wide : styles.arena} aria-label={copy.online}>
      <div className={styles.onlineHeader}>
        <strong className={session.team === 1 ? styles.blue : styles.red}>{copy.you}: {session.team === 1 ? copy.player : copy.enemy}</strong>
        <span>{copy.roomCode}: <b>{session.code}</b></span>
        <span role="status">{room.status === "finished" ? copy.onlineFinished : connectionLabel}</span>
        <button disabled={leaving} onClick={() => void leave()}>{copy.leaveRoom}</button>
      </div>
      <BattleHud hud={hud} markLocalTeam />
      {hud.shortage > 0 && <p className={styles.warning} role="status">{copy.supplyWarning} · {recovery(hud.shortage) ? `${recovery(hud.shortage)} ${copy.seconds}` : copy.attrition}</p>}
      {hud.playerPocketed > 0 && <p className={styles.pocketWarning} role="status"><strong>{hud.playerPocketed} {copy.pocketWarning}.</strong> {copy.pocketRescue}</p>}
      <div className={styles.ordersPanel} aria-label={copy.orders}>
        <div className={styles.ordersTitle}><strong>{copy.orders}</strong><span>{copy.ordersHint}</span></div>
        <div className={styles.tactics} role="group" aria-label={copy.tactics}>
          <button disabled={!canCommand || !hasSelection} title={copy.attackHint} aria-pressed={hud.selectedStance === "attack"}
            onClick={() => battle.current?.stance("attack")}>{copy.attackStance}</button>
          <button disabled={!canCommand || !hasSelection} title={copy.defendHint} aria-pressed={hud.selectedStance === "defend"}
            onClick={() => battle.current?.stance("defend")}>{copy.defendStance}</button>
          <button className={styles.frontButton} disabled={!canCommand} title={copy.spreadHint}
            onClick={() => battle.current?.frontlineAll()}>{copy.spreadAll}</button>
        </div>
      </div>
      {hud.routeDrawing && <p className={styles.routeHint} role="status">{copy.drawingRoute}</p>}
      <div className={styles.stage}>
        <canvas className={styles.canvas} ref={canvas} tabIndex={0} aria-label={copy.maps[match.map].name} />
        <canvas className={styles.minimap} ref={mini} width={192} height={120} aria-label={copy.maps[match.map].name}
          onPointerDown={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            battle.current?.pan({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
          }} />
        {(paused || hud.result) && <div className={styles.shade}>
          <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="online-battle-dialog"
            onKeyDown={event => {
              if (event.key === "Escape" && !event.repeat) {
                event.preventDefault(); event.stopPropagation();
                if (canResume) void control({ action: "resume" });
              }
              if (event.key !== "Tab") return;
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
              if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
              else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
            }}>
            <h2 id="online-battle-dialog">{hud.result ? copy[hud.result] : copy.paused}</h2>
            {hud.result ? <>
              <p>{copy.time}: {timeLabel(hud.time)}</p>
              <p>{hud.result === "draw" ? copy.draw : `${copy.winningSide}: ${match.result === "won" ? copy.player : copy.enemy}`}</p>
              <ManpowerScoreboard hud={hud} markLocalTeam result />
              <p>{copy.remainingArmies}: {copy.player} {hud.manpower.blue.formations} · {copy.enemy} {hud.manpower.red.formations}</p>
              <p>{copy.cities}: {copy.player} {hud.blueCities} · {copy.enemy} {hud.redCities}</p>
            </> : <>
              {!connected && <p>{connectionMessage || copy.onlineReconnecting}</p>}
              {!bothPresent && <p>{copy.bothPresent}</p>}
              {role === "host" ? <button className={styles.primary} disabled={!canResume}
                onClick={() => void control({ action: "resume" })}>{copy.resume}</button> : <p>{copy.hostResume}</p>}
              <button disabled={!connected || busy} onClick={() => void control({ action: "resign" })}>{copy.surrender}</button>
            </>}
            <button disabled={leaving} onClick={() => void leave()}>{copy.leaveRoom}</button>
          </div>
        </div>}
      </div>
      <div className={styles.toolbar}>
        <button disabled={!canCommand} onClick={() => battle.current?.selectAll()}>{copy.selectAll}</button>
        <button disabled={!canCommand || (!hasSelection && !city)} onClick={() => battle.current?.deselect()}>{copy.deselect}</button>
        <button disabled={!canCommand || !hasSelection} onClick={() => battle.current?.hold()}>{copy.hold}</button>
        <button disabled={!canCommand || !hasSelection} aria-pressed={hud.routeDrawing} onClick={() => battle.current?.routeMode(!hud.routeDrawing)}>{copy.drawRoute}</button>
        <button disabled={!canCommand} aria-pressed={multi} onClick={() => setMulti(!multi)}>{copy.multi}</button>
        <button disabled={!canCommand || busy} onClick={() => void control({ action: "pause" })}>{copy.pause}</button>
        <label className={styles.speedControl}>{copy.speed}
          <select value={room.speed} aria-label={copy.speed} disabled={role !== "host" || !connected || busy || Boolean(hud.result)}
            onChange={event => void control({ action: "speed", speed: Number(event.target.value) as OnlineSpeed })}>
            {GAME_SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        <AudioControls compact sound={sound} mix={soundMix} onSoundChange={changeSound} onMixChange={changeMix} />
        <button onClick={() => void fullscreen()}>{copy.full}</button>
      </div>
      <div className={styles.inspector}>
        <span>{copy.selectedArmies} <b>{hud.selectedUnits}</b></span>
        <span>{copy.selectedSoldiers} <b>{formatSoldiers(hud.selectedSoldiers)}</b></span>
        {hud.selectedStance && <span>{hud.selectedStance === "attack" ? copy.attackStance : hud.selectedStance === "defend" ? copy.defendStance : hud.selectedStance === "mixed" ? copy.mixedOrders : copy.manualOrders}</span>}
        <span>{copy.light} <b>{hud.light}</b> · {copy.heavy} <b>{hud.heavy}</b></span>
        <span>{copy.artillery} <b>{hud.artillery}</b> · {copy.aircraft} <b>{hud.aircraft}</b></span>
        {(!city || city.owner !== session.team) && <span className={styles.armoredHint}>{copy.armoredHint}</span>}
        {hud.selectedPocketed > 0 && <span className={styles.pocketStatus} role="status">{copy.pocketed} <b>{hud.selectedPocketed}/{hud.selectedUnits}</b> · {hud.selectedPocketGrace ? `${copy.pocketGrace} ${hud.selectedPocketGrace} ${copy.seconds}` : copy.pocketDamage}</span>}
        {city && <>
          <strong>{copy.placeNames[city.id]} · {city.owner ? copy[city.owner === 1 ? "player" : "enemy"] : copy.neutral}</strong>
          {hud.cityIsolated && <span className={styles.pocketStatus}>{copy.isolatedCity}</span>}
          <button disabled={!canCommand || !hasSelection} onClick={() => battle.current?.sendToCity()}>{copy.send}</button>
          {city.owner === session.team && <>
            <label className={styles.field}>{copy.production}
              <progress aria-label={copy.cityProductionTimer} value={city.build?.elapsed ?? 0} max={CITY_PRODUCTION} />
              <span>{Math.floor(city.build?.elapsed ?? 0)}/{CITY_PRODUCTION} {copy.seconds}</span>
            </label>
            <span>{copy.productionKind}: {copy[city.build?.kind ?? "light"]}</span>
            <button disabled={!canCommand} aria-pressed={city.build?.kind === "light"} onClick={() => battle.current?.build("light")}>{copy.chooseLight}</button>
            <button disabled={!canCommand} aria-pressed={city.build?.kind === "heavy"} title={copy.armoredProductionHint} onClick={() => battle.current?.build("heavy")}>{copy.chooseHeavy}</button>
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
      <SupportHud hud={hud} canPan={canCommand} onSourceClick={() => {
        const source = match.cities.find(item => item.id === hud.support.cityId);
        if (source) battle.current?.pan({ x: source.x / WIDTH, y: source.y / HEIGHT });
      }} />
      {presence}
      {error && <p className={styles.warning} role="alert">{error}</p>}
      <p className={styles.note}>{copy.productionEvery} · {copy.hostControls}</p>
    </section>
    <p className={styles.note}>{copy.touch}</p>
    <p className={styles.note}>{copy.onlineRules}</p>
  </section>;
}
