"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CHARACTERS,
  DEFAULT_PAINT,
  MAP_IDS,
  RULES,
} from "@/lib/color-hide/types";
import type {
  CharacterId,
  ClientMessage,
  Paint,
  RoomView,
} from "@/lib/color-hide/types";
import { getMap } from "@/lib/color-hide/maps";
import { useRoom } from "./useRoom";
import styles from "./color-hide.module.css";

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
const characterIcon = { scout: "◉", fox: "♢", robot: "▣" };
const teamName = { hider: "Saklanan", seeker: "Ebe" };
const mapIcon = { forest: "♣", city: "▥", school: "▤" };

function Character({
  character,
  selected,
  onClick,
}: {
  character: (typeof CHARACTERS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.character} ${selected ? styles.selected : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span
        className={`${styles.avatar} ${styles[character.id]}`}
        aria-hidden="true"
      >
        <i />
        <b />
        <em />
        <em />
      </span>
      <strong>{character.name}</strong>
      <small>{character.description}</small>
    </button>
  );
}

export default function ColorHide() {
  const { room, status, error, available, send, enter, leave, clearError } =
    useRoom();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [character, setCharacter] = useState<CharacterId>("scout");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const connected = status === "connected";
  const busy = status === "connecting" || status === "reconnecting";
  const me = room?.players.find((player) => player.id === room.you);
  const ready =
    room &&
    room.players.length >= RULES.minPlayers &&
    room.players.every((p) => p.ready && p.connected);
  const copy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setCopyError("");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Kodu seçip kopyalayabilirsin.");
    }
  };

  return (
    <section
      className={`${styles.root} ${room && room.phase !== "lobby" ? styles.inGame : ""}`}
    >
      {(!room || room.phase === "lobby") && (
        <>
          <header className={styles.header}>
            <Link href="/" className={styles.back}>
              ← XARMY GAMES
            </Link>
            <span className={styles.online}>
              <i /> 2–5 ARKADAŞ · ONLINE
            </span>
          </header>
          <div className={styles.title}>
            <p>RENGİNİ SEÇ. GÖZDEN KAYBOL.</p>
            <h1>
              COLOR <span>HIDE</span>
              <sup>3D</sup>
            </h1>
            <p>
              Ortamla bütünleş, arkadaşlarından saklan.
              <br />
              Yakalanırsan aramaya sen de katıl!
            </p>
          </div>
        </>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button aria-label="Uyarıyı kapat" onClick={clearError}>
            ×
          </button>
        </div>
      )}
      {!room && (
        <div className={styles.setup}>
          <div className={styles.panel}>
            <div className={styles.eyebrow}>01 / KENDİ TARZINI SEÇ</div>
            <h2>Kim saklanıyor?</h2>
            <label className={styles.label}>
              Oyuncu adı
              <input
                aria-label="Oyuncu adı"
                autoComplete="nickname"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Arkadaşların seni nasıl tanısın?"
              />
            </label>
            <div className={styles.characters}>
              {CHARACTERS.map((item) => (
                <Character
                  key={item.id}
                  character={item}
                  selected={character === item.id}
                  onClick={() => setCharacter(item.id)}
                />
              ))}
            </div>
          </div>
          <div className={`${styles.panel} ${styles.roomPanel}`}>
            <div className={styles.eyebrow}>02 / BİR ARAYA GELİN</div>
            <h2>Bir kod. Beş arkadaş.</h2>
            <p>
              Oda kur, kodu arkadaşlarına gönder.
              <br />
              Herkes hazır olduğunda zar konuşsun.
            </p>
            <button
              className={styles.primary}
              disabled={busy || !name.trim() || !available}
              onClick={() =>
                enter({ type: "create", name: name.trim(), character })
              }
            >
              Oda oluştur <span>↗</span>
            </button>
            <div className={styles.divider}>veya bir arkadaşına katıl</div>
            <form
              className={styles.join}
              onSubmit={(e) => {
                e.preventDefault();
                enter({
                  type: "join",
                  name: name.trim(),
                  character,
                  code: code.trim().toUpperCase(),
                });
              }}
            >
              <input
                aria-label="Oda kodu"
                placeholder="ODA KODU"
                autoComplete="off"
                autoCapitalize="characters"
                value={code}
                maxLength={6}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
              />
              <button
                disabled={
                  busy || !name.trim() || code.length !== 6 || !available
                }
              >
                Katıl →
              </button>
            </form>
            {busy && (
              <p role="status">
                {status === "reconnecting"
                  ? "Odana yeniden bağlanılıyor…"
                  : "Odaya bağlanılıyor…"}
              </p>
            )}
            {!available && (
              <p className={styles.unavailable} role="status">
                Çevrimiçi oyun sunucusu henüz kullanıma açılmadı.
              </p>
            )}
            <div className={styles.rules}>
              <span>
                <b>60 sn</b> saklan
              </span>
              <span>
                <b>10 dk</b> hayatta kal
              </span>
              <span>
                <b>3</b> farklı harita
              </span>
            </div>
          </div>
        </div>
      )}
      {room?.phase === "lobby" && me && (
        <div className={styles.lobby}>
          <div className={styles.panel}>
            <div className={styles.codeRow}>
              <div>
                <div className={styles.eyebrow}>ARKADAŞLARINI DAVET ET</div>
                <strong className={styles.roomCode}>{room.code}</strong>
              </div>
              <button onClick={copy}>
                {copied ? "Kopyalandı ✓" : "Kodu kopyala"}
              </button>
            </div>
            {copyError && <small>{copyError}</small>}
            <h2>
              Odadakiler <small>{room.players.length}/5</small>
            </h2>
            <ul className={styles.roster}>
              {room.players.map((p) => (
                <li key={p.id}>
                  <span
                    className={styles.token}
                    style={{ background: p.paint.body }}
                  >
                    {characterIcon[p.character]}
                  </span>
                  <div>
                    <strong>
                      {p.name}
                      {p.id === room.you ? " (Sen)" : ""}
                    </strong>
                    <small>
                      {p.id === room.hostId ? "Oda sahibi · " : ""}
                      {CHARACTERS.find((c) => c.id === p.character)?.name}
                    </small>
                  </div>
                  <span className={p.ready ? styles.ready : styles.waiting}>
                    {!p.connected
                      ? "Bağlantı kesildi"
                      : p.ready
                        ? "Hazır ✓"
                        : "Hazırlanıyor"}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.characterChange}>
              <label>
                Karakter
                <select
                  aria-label="Karakter seç"
                  value={me.character}
                  disabled={!connected}
                  onChange={(e) =>
                    send({
                      type: "character",
                      character: e.target.value as CharacterId,
                    })
                  }
                >
                  {CHARACTERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className={styles.primary}
              disabled={!connected}
              onClick={() => send({ type: "ready", ready: !me.ready })}
            >
              {me.ready ? "Hazır değilim" : "Hazırım"}
            </button>
            {room.hostId === me.id ? (
              <button
                className={styles.start}
                disabled={!ready || !connected}
                onClick={() => send({ type: "start" })}
              >
                Zarı at ve başlat
              </button>
            ) : (
              <p className={styles.hint}>
                Herkes hazır olduğunda oda sahibi turu başlatacak.
              </p>
            )}
            {!ready && room.hostId === me.id && (
              <p className={styles.hint}>
                En az 2 oyuncu gerekli. Herkes “Hazırım” demeli.
              </p>
            )}
            <button className={styles.leave} onClick={leave}>
              Odadan ayrıl
            </button>
          </div>
          <div className={styles.panel}>
            <div className={styles.eyebrow}>HARİTA OYLAMASI</div>
            <h2>Nereye saklanıyoruz?</h2>
            <p>En çok oy alan harita seçilir. Eşitlikte kura çekilir.</p>
            <div className={styles.mapChoices}>
              {MAP_IDS.map((id) => {
                const map = getMap(id);
                const votes = room.players.filter((p) => p.vote === id).length;
                return (
                  <button
                    key={id}
                    disabled={!connected}
                    className={`${styles.mapCard} ${styles[id]} ${me.vote === id ? styles.mapSelected : ""}`}
                    aria-pressed={me.vote === id}
                    aria-label={`${map.name} haritasına oy ver`}
                    onClick={() => send({ type: "vote", map: id })}
                  >
                    <span className={styles.mapArt} aria-hidden="true">
                      {mapIcon[id]}
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>
                      <strong>{map.name}</strong>
                      <small>{map.subtitle}</small>
                    </span>
                    <b>
                      {votes} oy {me.vote === id ? "✓" : ""}
                    </b>
                  </button>
                );
              })}
            </div>
            <div className={styles.tip}>
              <b>Ufak bir ipucu</b>
              <p>
                Başını, gövdeni ve bacaklarını ayrı ayrı boya. Hareketsiz durmak
                bazen en iyi kaçış planıdır.
              </p>
            </div>
          </div>
        </div>
      )}
      {room && room.phase !== "lobby" && (
        <Arena room={room} send={send} leave={leave} connected={connected} />
      )}
      {room && busy && (
        <div className={styles.connection} role="status">
          Bağlantı yeniden kuruluyor… Oyuncun kısa süre odada tutuluyor.
          <button onClick={leave}>Odadan ayrıl</button>
        </div>
      )}
      {(!room || room.phase === "lobby") && (
        <footer className={styles.help}>
          <span>
            WASD hareket · Fare bakış · Shift koş · C eğil · Boşluk zıpla
          </span>
          <span>Telefonunda dokunmatik kontroller hazır.</span>
        </footer>
      )}
    </section>
  );
}

function Arena({
  room,
  send,
  leave,
  connected,
}: {
  room: RoomView;
  send: (message: ClientMessage) => boolean;
  leave: () => void;
  connected: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<Awaited<
    ReturnType<(typeof import("./scene"))["createScene"]>
  > | null>(null);
  const live = useRef(room);
  live.current = room;
  const online = useRef(connected);
  online.current = connected;
  const me = room.players.find((p) => p.id === room.you)!;
  const keys = useRef(new Set<string>());
  // Seed before the async Three.js import, so early packets preserve a resumed view.
  const input = useRef({
    seq: me.lastInputSeq,
    yaw: me.yaw,
    pitch: me.pitch,
    crouch: me.crouching,
    jump: false,
  });
  const [paintOpen, setPaintOpen] = useState(false);
  const [paint, setPaint] = useState<Paint>(DEFAULT_PAINT);
  const [part, setPart] = useState<keyof Paint>("body");
  const [camera, setCamera] = useState<"first" | "third">("third");
  const [lowQuality, setLowQuality] = useState(false);
  const settings = useRef({ camera, lowQuality });
  settings.current = { camera, lowQuality };
  const [sceneError, setSceneError] = useState("");
  const [locked, setLocked] = useState(false);
  const [remaining, setRemaining] = useState(
    room.phaseEndsAt - room.serverTime,
  );
  const [crouch, setCrouch] = useState(me.crouching);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const paintTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const map = getMap(room.map);
  const blocked =
    (room.phase === "hiding" || room.phase === "drawing") &&
    me.team === "seeker";
  const playing = room.phase === "hiding" || room.phase === "seeking";
  const sendRef = useRef(send);
  sendRef.current = send;
  const paintOpenRef = useRef(paintOpen);
  paintOpenRef.current = paintOpen;
  const toggleCrouch = () => {
    input.current.crouch = !input.current.crouch;
    setCrouch(input.current.crouch);
  };
  const sendShot = (aim?: { yaw: number; pitch: number }) => {
    if (live.current.phase === "seeking" && online.current)
      sendRef.current({ type: "shoot", ...(aim ? { aim } : {}) });
  };
  useEffect(() => setLowQuality(matchMedia("(pointer: coarse)").matches), []);

  useEffect(() => {
    let disposed = false;
    import("./scene")
      .then(({ createScene }) => {
        if (disposed || !container.current) return;
        try {
          controller.current = createScene(container.current, {
            onLook: (yaw, pitch) => {
              input.current.yaw = yaw;
              input.current.pitch = pitch;
            },
            onFire: sendShot,
            onLock: setLocked,
            onError: setSceneError,
          });
          const player = live.current.players.find(
            (p) => p.id === live.current.you,
          );
          input.current.yaw = player?.yaw ?? 0;
          input.current.pitch = player?.pitch ?? 0;
          controller.current.setLook(player?.yaw ?? 0, player?.pitch ?? 0);
          controller.current.setCamera(settings.current.camera);
          controller.current.setQuality(settings.current.lowQuality);
          controller.current.update(live.current);
        } catch {
          setSceneError(
            "3D görüntü başlatılamadı. WebGL destekli güncel bir tarayıcıda tekrar dene.",
          );
        }
      })
      .catch(() =>
        setSceneError(
          "3D oyun dosyaları yüklenemedi. Sayfayı yenileyip tekrar dene.",
        ),
      );
    return () => {
      disposed = true;
      controller.current?.dispose();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.update(room);
    input.current.seq = Math.max(input.current.seq, me.lastInputSeq);
  }, [room, me.lastInputSeq]);
  useEffect(() => {
    setPaint(me.paint);
  }, [me.paint.head, me.paint.body, me.paint.legs]);
  useEffect(() => {
    if (room.phase !== "hiding") {
      setPaintOpen(false);
      clearTimeout(paintTimeout.current);
    }
  }, [room.phase]);
  useEffect(() => () => clearTimeout(paintTimeout.current), []);
  useEffect(() => {
    if (room.phase === "finished" || sceneError || !connected) {
      keys.current.clear();
      input.current.jump = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }, [room.phase, sceneError, connected]);
  useEffect(() => {
    controller.current?.setCamera(camera);
  }, [camera]);
  useEffect(() => {
    controller.current?.setQuality(lowQuality);
  }, [lowQuality]);
  useEffect(() => {
    const received = performance.now();
    setRemaining(room.phaseEndsAt - room.serverTime);
    const interval = setInterval(
      () =>
        setRemaining(
          room.phaseEndsAt - room.serverTime - (performance.now() - received),
        ),
      100,
    );
    return () => clearInterval(interval);
  }, [room.phaseEndsAt, room.serverTime]);
  useEffect(() => {
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      !!target.closest("input,select,textarea,button");
    const down = (e: KeyboardEvent) => {
      if (editable(e.target) || paintOpenRef.current) return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "KeyC",
          "KeyR",
          "KeyV",
        ].includes(e.code)
      )
        e.preventDefault();
      keys.current.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space") input.current.jump = true;
      if (e.code === "KeyC") {
        input.current.crouch = !input.current.crouch;
        setCrouch(input.current.crouch);
      }
      if (e.code === "KeyR") sendRef.current({ type: "reload" });
      if (e.code === "KeyV")
        setCamera((current) => (current === "first" ? "third" : "first"));
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const reset = () => {
      keys.current.clear();
      input.current.jump = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    const interval = setInterval(() => {
      const world = live.current;
      if (world.phase !== "hiding" && world.phase !== "seeking") return;
      const enabled =
        online.current &&
        !document.hidden &&
        !paintOpenRef.current &&
        (world.phase === "hiding" || world.phase === "seeking");
      const current = input.current;
      if (!online.current) return;
      sendRef.current({
        type: "input",
        input: {
          seq: ++current.seq,
          forward: enabled
            ? Number(keys.current.has("KeyW")) -
              Number(keys.current.has("KeyS"))
            : 0,
          strafe: enabled
            ? Number(keys.current.has("KeyD")) -
              Number(keys.current.has("KeyA"))
            : 0,
          yaw: current.yaw,
          pitch: current.pitch,
          sprint:
            enabled &&
            (keys.current.has("ShiftLeft") || keys.current.has("ShiftRight")),
          crouch: current.crouch,
          jump: enabled && current.jump,
        },
      });
      current.jump = false;
    }, 50);
    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
      reset();
    };
  }, []);
  const touchKey = (key: string, label: string, text: string) => (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        keys.current.add(key);
      }}
      onPointerUp={() => keys.current.delete(key)}
      onPointerCancel={() => keys.current.delete(key)}
      onLostPointerCapture={() => keys.current.delete(key)}
    >
      {text}
    </button>
  );
  const applyPaint = (color: string, all = false) => {
    const next = all
      ? { head: color, body: color, legs: color }
      : { ...paint, [part]: color };
    setPaint(next);
    clearTimeout(paintTimeout.current);
    paintTimeout.current = setTimeout(() => {
      if (live.current.phase === "hiding" && online.current)
        sendRef.current({ type: "paint", paint: next });
    }, 120);
  };
  const hiders = room.players.filter((p) => p.team === "hider");
  const seekers = room.players.filter((p) => p.team === "seeker");
  const longest = room.players
    .filter((p) => p.id !== room.initialSeekerId)
    .sort((a, b) => b.survivedMs - a.survivedMs)[0];
  const best = [...room.players].sort((a, b) => b.captures - a.captures)[0];
  const initial = room.players.find((p) => p.id === room.initialSeekerId);

  return (
    <div className={styles.arena}>
      <div ref={container} className={styles.canvas} />
      {sceneError && (
        <div className={styles.sceneError} role="alert">
          {sceneError}
          <button onClick={leave}>Odadan ayrıl</button>
        </div>
      )}
      <div className={styles.hudTop}>
        <div className={styles.hudBrand}>
          <b>
            COLOR<span>HIDE</span>
          </b>
          <small>
            {map.name} · Oda {room.code}
          </small>
        </div>
        <div className={styles.timer}>
          <small>
            {room.phase === "drawing"
              ? "EBE KURASI"
              : room.phase === "hiding"
                ? "SAKLANMA SÜRESİ"
                : room.phase === "finished"
                  ? "TUR BİTTİ"
                  : "ARAMA SÜRESİ"}
          </small>
          <strong>{room.phase === "finished" ? "✓" : clock(remaining)}</strong>
        </div>
        <div className={styles.team}>
          <b>{teamName[me.team]}</b>
          <small>
            {hiders.length} saklanan · {seekers.length} ebe
          </small>
        </div>
      </div>
      <div className={styles.toolBar}>
        <button
          aria-label="Kamerayı değiştir"
          onClick={() =>
            setCamera((current) => (current === "first" ? "third" : "first"))
          }
        >
          {camera === "first" ? "1. kişi" : "3. kişi"} ◉
        </button>
        <button
          aria-label="Grafik kalitesini değiştir"
          onClick={() => setLowQuality(!lowQuality)}
        >
          {lowQuality ? "Akıcı grafik" : "Detaylı grafik"}
        </button>
        <button
          onClick={() => {
            document.exitPointerLock?.();
            setConfirmLeave(true);
          }}
        >
          Çık
        </button>
      </div>
      {room.phase === "drawing" && (
        <div className={styles.centerOverlay}>
          <div className={styles.dice} aria-hidden="true">
            ⚄
          </div>
          <p>ŞANS HERKESE EŞİT</p>
          <h2>EBE SEÇİLDİ!</h2>
          <strong className={styles.chosen}>{initial?.name}</strong>
          <div className={styles.drawNames}>
            {room.players.map((p) => (
              <span
                key={p.id}
                className={
                  p.id === room.initialSeekerId ? styles.selectedName : ""
                }
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {room.phase === "hiding" && blocked && (
        <div className={styles.blackout} data-testid="seeker-blackout">
          <span>◉</span>
          <h2>SAKLANMALARINI BEKLE</h2>
          <strong>{clock(remaining)}</strong>
          <p>
            Bu sürede harita ve oyuncular gizli.
            <br />
            Süre dolduğunda otomatik olarak haritaya çıkacaksın.
          </p>
        </div>
      )}
      {room.phase === "seeking" && remaining > RULES.seekMs - 3500 && (
        <div className={styles.release}>EBE SERBEST!</div>
      )}
      {playing && !blocked && (
        <>
          <div className={styles.crosshair} aria-hidden="true">
            +
          </div>
          {!locked && (
            <div className={styles.lookHint}>
              Bakmak için sahneyi sürükle · Bilgisayarda tıklayarak fareyi
              kilitle · ESC serbest bırak
            </div>
          )}
          <div className={styles.bottomHud}>
            <div>
              <b>{me.name}</b>
              <small>
                {me.team === "hider"
                  ? "Rengine güven. Sessizce saklan."
                  : "Renkli pompalı · Arkadaşlarını bul"}
              </small>
            </div>
            {me.team === "seeker" ? (
              <strong>
                {me.reloadEndsAt > room.serverTime
                  ? "Dolduruluyor…"
                  : `${me.ammo} / ${RULES.magazine}`}
                <small>R · Doldur</small>
              </strong>
            ) : (
              <button
                className={styles.paintButton}
                disabled={room.phase !== "hiding"}
                onClick={() => {
                  document.exitPointerLock?.();
                  keys.current.clear();
                  setPaintOpen(!paintOpen);
                }}
              >
                {room.phase === "hiding" ? "◐ Boyan" : "◐ Kamuflaj hazır"}
              </button>
            )}
          </div>
          <div className={styles.mobileMove}>
            {touchKey("KeyW", "İleri hareket", "↑")}
            <div>
              {touchKey("KeyA", "Sola hareket", "←")}
              {touchKey("KeyS", "Geri hareket", "↓")}
              {touchKey("KeyD", "Sağa hareket", "→")}
            </div>
          </div>
          <div className={styles.mobileActions}>
            {touchKey("ShiftLeft", "Koş", "Koş")}
            <button
              aria-label="Zıpla"
              onPointerDown={(e) => {
                e.preventDefault();
                input.current.jump = true;
              }}
            >
              Zıpla
            </button>
            <button
              aria-label="Eğil"
              aria-pressed={crouch}
              onClick={toggleCrouch}
            >
              {crouch ? "Kalk" : "Eğil"}
            </button>
            {me.team === "seeker" && (
              <>
                <button
                  aria-label="Şarjör doldur"
                  onClick={() => send({ type: "reload" })}
                >
                  Doldur
                </button>
                <button
                  className={styles.fire}
                  aria-label="Ateş et"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    controller.current?.fire();
                  }}
                >
                  ◎
                </button>
              </>
            )}
          </div>
        </>
      )}
      {paintOpen && room.phase === "hiding" && me.team === "hider" && (
        <div className={styles.paintPanel}>
          <header>
            <div>
              <small>KAMUFLAJ ATÖLYESİ</small>
              <h2>Ortamın bir parçası ol.</h2>
            </div>
            <button
              aria-label="Boyama menüsünü kapat"
              onClick={() => setPaintOpen(false)}
            >
              ×
            </button>
          </header>
          <div className={styles.parts}>
            {(["head", "body", "legs"] as const).map((key) => (
              <button
                key={key}
                aria-pressed={part === key}
                onClick={() => setPart(key)}
              >
                <i style={{ background: paint[key] }} />
                {{ head: "Baş", body: "Gövde", legs: "Bacaklar" }[key]}
              </button>
            ))}
          </div>
          <div className={styles.swatches}>
            {map.palette.map((color) => (
              <button
                key={color}
                style={{ background: color }}
                aria-label={`Renk ${color}`}
                onClick={() => applyPaint(color)}
              />
            ))}
          </div>
          <label className={styles.customColor}>
            Kendi rengin
            <input
              aria-label="Özel boya rengi"
              type="color"
              value={paint[part]}
              onChange={(e) => applyPaint(e.target.value)}
            />
          </label>
          <button
            className={styles.primary}
            onClick={() => applyPaint(paint[part], true)}
          >
            Bu rengi tüm vücuda uygula
          </button>
          <p>Boyan diğer oyuncularda da aynı görünür.</p>
        </div>
      )}
      {room.phase === "finished" && (
        <div className={styles.results}>
          <div className={styles.resultCard}>
            <div className={styles.eyebrow}>TUR {room.round} TAMAMLANDI</div>
            <span className={styles.trophy}>✦</span>
            <h2>
              {room.winner === "seeker"
                ? "EBELER KAZANDI!"
                : room.winner === "hider"
                  ? "SAKLANANLAR KAZANDI!"
                  : "TUR SONLANDI"}
            </h2>
            <p>{room.finishReason}</p>
            {room.survivors.length > 0 && (
              <p>
                <b>Yakalanmayanlar:</b>{" "}
                {room.survivors
                  .map((id) => room.players.find((p) => p.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            <div className={styles.resultStats}>
              <span>
                En çok yakalayan
                <b>
                  {best?.captures
                    ? `${best.name} · ${best.captures}`
                    : "Henüz yakalama yok"}
                </b>
              </span>
              <span>
                En uzun saklanan
                <b>
                  {longest
                    ? `${longest.name} · ${clock(longest.survivedMs)}`
                    : "—"}
                </b>
              </span>
            </div>
            {room.hostId === room.you ? (
              <button
                className={styles.primary}
                disabled={!connected}
                onClick={() => send({ type: "rematch" })}
              >
                TEKRAR OYNA
              </button>
            ) : (
              <p>Yeni turu oda sahibi başlatabilir.</p>
            )}
            <button className={styles.leave} onClick={leave}>
              Odadan ayrıl
            </button>
          </div>
        </div>
      )}
      {confirmLeave && (
        <div className={styles.results}>
          <div className={styles.resultCard}>
            <h2>Odadan ayrıl?</h2>
            <p>Arkadaşların oynamaya devam edebilir.</p>
            <button className={styles.primary} onClick={leave}>
              Odadan ayrıl
            </button>
            <button
              className={styles.leave}
              onClick={() => setConfirmLeave(false)}
            >
              Oyuna dön
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
