"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  Attachment,
  Difficulty,
  GameCommand,
  GameController,
  HudState,
  Quality,
  Rarity,
} from "./battle/types";
import styles from "./battle/battle.module.css";

const initialHud: HudState = {
  phase: "plane",
  hp: 100,
  armor: 50,
  stamina: 100,
  ammo: 0,
  reserve: 0,
  weapon: "Teçhizat bekleniyor",
  weaponId: "pistol",
  rarity: "common",
  kills: 0,
  alive: 24,
  fps: 0,
  zone: { x: 0, z: 0, radius: 285, nextRadius: 205, stage: 0, remaining: 60 },
  heading: 0,
  location: "Operasyon sahası",
  elapsed: 0,
  prompt: "",
  notice: "",
  reloading: 0,
  hit: 0,
  damageDirection: null,
  aiming: false,
  parachute: false,
  locked: false,
  paused: false,
  weather: "clear",
  attachments: [],
  grenades: 3,
  grenadeType: "El bombası",
  medkits: 2,
  damageLabels: [],
  feed: [],
  playerX: 0,
  playerZ: 0,
  killer: "",
  replay: false,
};
const rarityNames: Record<Rarity, string> = {
  common: "STANDART",
  rare: "NADİR",
  epic: "EPİK",
  legendary: "EFSANEVİ",
};
const attachmentNames: Record<Attachment, string> = {
  scope: "Dürbün",
  suppressor: "Susturucu",
  laser: "Lazer",
  grip: "Kabza",
  magazine: "Uzatılmış şarjör",
};
const weatherNames = {
  clear: "Açık",
  rain: "Yağmur",
  fog: "Sis",
  storm: "Fırtına",
};
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const timer = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;

function MiniMap({ hud }: { hud: HudState }) {
  const scale = 160 / 600;
  const x = 80 + hud.playerX * scale;
  const y = 80 + hud.playerZ * scale;
  return (
    <div
      className={styles.map}
      aria-label="Mini harita: senin konumun ve güvenli bölge"
    >
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <pattern
            id="battle-map-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#b0bc9b"
              strokeOpacity=".12"
              strokeWidth=".5"
            />
          </pattern>
        </defs>
        <rect width="160" height="160" fill="#172c29" />
        <path
          d="M0 22 24 13 47 25 59 6 84 16 108 3 130 25 160 14V0H0Z M0 117 30 106 54 125 88 115 112 133 144 111 160 130V160H0Z"
          fill="#32423a"
        />
        <g transform={`translate(80 80) scale(${scale})`}>
          <ellipse cx="160" cy="-125" rx="63" ry="47" fill="#294b54" />
          <path
            d="M75 -65Q150 -72 200 -82T300 -80"
            fill="none"
            stroke="#294b54"
            strokeWidth="18"
          />
          <path
            d="M0 -78V78M-80 0H80M-15 60 -130 125M-60 -35 -135 -110M65 20 140 85M60 0 101 -48M101 -48V-84L140 -170M0 80 70 190"
            fill="none"
            stroke="#929686"
            strokeOpacity=".5"
            strokeWidth="6"
          />
          <g fill="#a9ae9d" opacity=".6">
            {[-48, -23, 23, 48].flatMap((x) =>
              [-35, 35].map((z) => (
                <rect
                  key={`${x}-${z}`}
                  x={x - 7}
                  y={z - 7}
                  width="14"
                  height="14"
                />
              )),
            )}
            {[
              [-156, -125],
              [-123, -132],
              [-150, -91],
              [-112, -93],
              [-143, 115],
              [-114, 145],
              [128, 76],
              [157, 110],
              [70, 190],
            ].map(([x, z]) => (
              <rect
                key={`${x}-${z}`}
                x={x - 7}
                y={z - 7}
                width="14"
                height="14"
              />
            ))}
          </g>
        </g>
        <rect width="160" height="160" fill="url(#battle-map-grid)" />
        <circle
          cx={80 + hud.zone.x * scale}
          cy={80 + hud.zone.z * scale}
          r={hud.zone.radius * scale}
          fill="none"
          stroke="#f2ead4"
          strokeWidth="1.2"
        />
        <circle
          cx={80 + hud.zone.x * scale}
          cy={80 + hud.zone.z * scale}
          r={hud.zone.nextRadius * scale}
          fill="none"
          stroke="#f4bc66"
          strokeWidth=".8"
          strokeDasharray="3 3"
          opacity=".75"
        />
        <g
          transform={`translate(${clamp(x, 5, 155)},${clamp(y, 5, 155)}) rotate(${hud.heading})`}
        >
          <path
            d="M0 -7 4 4 0 2 -4 4Z"
            fill="#ffc675"
            stroke="#1c2523"
            strokeWidth="1"
          />
        </g>
        <text x="80" y="12" textAnchor="middle" fill="#faf5df" fontSize="8">
          K
        </text>
      </svg>
      <div className={styles.mapCaption}>
        {hud.location}
        <span>600 × 600</span>
      </div>
    </div>
  );
}

function Compass({ heading }: { heading: number }) {
  const directions = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];
  return (
    <div
      className={styles.compass}
      aria-label={`Yön ${Math.round(heading)} derece`}
    >
      <div className={styles.compassTrack}>
        {Array.from({ length: 7 }, (_, i) => {
          const degree = ((Math.floor(heading / 15) + i - 3) * 15 + 720) % 360;
          return (
            <span key={i} className={degree % 45 === 0 ? styles.cardinal : ""}>
              {degree % 45 === 0 ? directions[degree / 45] : degree}
            </span>
          );
        })}
      </div>
      <span className={styles.compassNeedle}>▾</span>
      <strong>
        {String(Math.round((heading + 360) % 360)).padStart(3, "0")}°
      </strong>
    </div>
  );
}

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controller = useRef<GameController | null>(null);
  const settingsRef = useRef({
    quality: "high" as Quality,
    difficulty: "normal" as Difficulty,
    volume: 0.55,
  });
  const seed = useRef(0);
  const [matchId, setMatchId] = useState(0);
  const [hud, setHud] = useState<HudState>(initialHud);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  const [quality, setQuality] = useState<Quality>("high");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [volume, setVolume] = useState(0.55);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const joystickPointer = useRef<number | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const resumeAfterSettings = useRef(false);
  const hudRef = useRef(hud);
  hudRef.current = hud;
  settingsOpenRef.current = settingsOpen;

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    if (query.matches) {
      settingsRef.current.quality = "medium";
      setQuality("medium");
    }
    query.addEventListener("change", update);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      query.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let game: GameController | null = null;
    setLoading(true);
    setError("");
    setHud(initialHud);
    setSettingsOpen(false);
    setJoystick({ x: 0, y: 0 });
    joystickPointer.current = null;
    lookPointer.current = null;
    resumeAfterSettings.current = false;
    seed.current ||= Date.now() >>> 0;
    void import("./battle/engine")
      .then(({ createGame }) => {
        if (disposed || !mountRef.current) return;
        game = createGame(
          mountRef.current,
          (next) => {
            if (!disposed) setHud(next);
          },
          {
            quality: settingsRef.current.quality,
            difficulty: settingsRef.current.difficulty,
            seed: seed.current + matchId * 7919,
          },
        );
        controller.current = game;
        game.setVolume(settingsRef.current.volume);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          game?.dispose();
          if (controller.current === game) controller.current = null;
          mountRef.current?.replaceChildren();
          console.error("Battle Royale initialization failed", cause);
          const detail = cause instanceof Error ? cause.message : "";
          setError(
            /webgl|context|gpu/i.test(detail)
              ? "3D sahne başlatılamadı. Tarayıcında donanım hızlandırmasını açıp tekrar deneyebilirsin."
              : "Oyun dünyası yüklenemedi. Tekrar deneyebilir veya sayfayı yenileyebilirsin.",
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      game?.touch({
        x: 0,
        y: 0,
        lookX: 0,
        lookY: 0,
        fire: false,
        aim: false,
        sprint: false,
      });
      game?.dispose();
      if (controller.current === game) controller.current = null;
    };
  }, [matchId]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (settingsOpenRef.current && event.code === "Escape") {
        event.preventDefault();
        settingsOpenRef.current = false;
        setSettingsOpen(false);
        return;
      }
      if (
        event.code !== "KeyO" ||
        event.repeat ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      event.preventDefault();
      const wasOpen = settingsOpenRef.current;
      if (!wasOpen) {
        resumeAfterSettings.current = !hudRef.current.paused;
        if (resumeAfterSettings.current) controller.current?.command("pause");
      } else if (resumeAfterSettings.current)
        controller.current?.capturePointer();
      settingsOpenRef.current = !wasOpen;
      setSettingsOpen(!wasOpen);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const dialog = document.querySelector<HTMLElement>(
      `[role="dialog"][aria-label="Oyun ayarları"]`,
    );
    const controls = dialog?.querySelectorAll<HTMLElement>(
      "button, select, input, a[href]",
    );
    controls?.[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", trap);
    return () => dialog?.removeEventListener("keydown", trap);
  }, [settingsOpen]);

  const command = (value: GameCommand) => {
    controller.current?.command(value);
    // A game action must not leave keyboard movement trapped on its HUD button.
    if (document.activeElement instanceof HTMLButtonElement)
      document.activeElement.blur();
  };
  const openSettings = () => {
    resumeAfterSettings.current = !hud.paused;
    if (resumeAfterSettings.current) command("pause");
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    setSettingsOpen(false);
    if (resumeAfterSettings.current) controller.current?.capturePointer();
  };
  const resetJoystick = () => {
    joystickPointer.current = null;
    setJoystick({ x: 0, y: 0 });
    controller.current?.touch({ x: 0, y: 0 });
  };
  const moveJoystick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.36);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.36);
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    setJoystick({ x, y });
    controller.current?.touch({ x, y });
  };
  const hold = (
    event: PointerEvent<HTMLButtonElement>,
    field: "fire" | "aim" | "sprint",
    pressed: boolean,
  ) => {
    event.preventDefault();
    if (pressed) {
      event.currentTarget.setPointerCapture(event.pointerId);
      controller.current?.capturePointer();
    }
    controller.current?.touch({ [field]: pressed });
  };
  const end = hud.phase === "defeated" || hud.phase === "victory";
  const outside =
    Math.hypot(hud.playerX - hud.zone.x, hud.playerZ - hud.zone.z) >
    hud.zone.radius;
  const metersStyle = {
    "--health": `${clamp(hud.hp, 0, 100)}%`,
    "--armor": `${clamp(hud.armor, 0, 100)}%`,
    "--stamina": `${clamp(hud.stamina, 0, 100)}%`,
  } as CSSProperties;

  return (
    <div
      className={styles.arena}
      data-testid="battle-arena"
      data-phase={hud.phase}
      data-quality={quality}
    >
      <div
        ref={mountRef}
        className={styles.viewport}
        data-testid="battle-viewport"
      />
      <div className={styles.vignette} />
      {outside && hud.phase === "combat" && (
        <div className={styles.stormVignette} />
      )}
      {hud.damageDirection !== null && (
        <div
          className={styles.damageDirection}
          style={{
            transform: `translate(-50%, -50%) rotate(${hud.damageDirection}rad)`,
          }}
        >
          <span />
        </div>
      )}

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>X</span>
          <div>
            <strong>
              XARMY<span> BATTLE ROYALE</span>
            </strong>
            <small>TEK OYUNCU · SON KİŞİ AYAKTA</small>
          </div>
        </div>
        <div className={styles.matchStats}>
          <div>
            <span>HAYATTA</span>
            <strong data-testid="battle-alive">
              {hud.alive.toString().padStart(2, "0")}
            </strong>
          </div>
          <i />
          <div>
            <span>ELEME</span>
            <strong>{hud.kills.toString().padStart(2, "0")}</strong>
          </div>
          <button
            aria-label="Oyun ayarları"
            onClick={openSettings}
            className={styles.settingsButton}
          >
            ☷
          </button>
        </div>
      </header>
      <Compass heading={hud.heading} />

      <div className={styles.upperLeft}>
        <div className={`${styles.zone} ${outside ? styles.zoneDanger : ""}`}>
          <span className={styles.zoneIcon}>◉</span>
          <div>
            <small>
              {outside
                ? "GÜVENLİ BÖLGEYE DÖN"
                : hud.zone.stage === 0
                  ? "İLK GÜVENLİ BÖLGE"
                  : `BÖLGE ${hud.zone.stage}`}
            </small>
            <strong>
              {timer(hud.zone.remaining)}
              <em>{outside ? "Alan dışındasın" : "Daralma için kalan süre"}</em>
            </strong>
          </div>
        </div>
        <div className={styles.feed}>
          {hud.feed.slice(-4).map((item, index) => (
            <p key={`${index}-${item}`}>{item}</p>
          ))}
        </div>
      </div>
      <div className={styles.upperRight}>
        <MiniMap hud={hud} />
        <div className={styles.telemetry}>
          <span>{weatherNames[hud.weather]}</span>
          <span>{Math.round(hud.fps)} FPS</span>
          <span>{timer(hud.elapsed)}</span>
        </div>
      </div>

      {!loading && !error && !end && (
        <>
          {hud.phase === "combat" && (
            <div
              className={`${styles.crosshair} ${hud.aiming ? styles.adsCrosshair : ""} ${hud.hit > 0 ? styles.hitCrosshair : ""}`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
              <i />
              <b />
            </div>
          )}
          {hud.damageLabels.map((label) => (
            <div
              key={label.id}
              className={`${styles.damageLabel} ${label.headshot ? styles.headshot : ""}`}
              style={{ left: label.x, top: label.y }}
            >
              {label.headshot && <small>KAFA VURUŞU</small>}
              {Math.round(label.value)}
            </div>
          ))}
          <div className={styles.centerMessages} aria-live="polite">
            {hud.phase === "plane" && (
              <div className={styles.dropPrompt}>
                <small>OPERASYON BAŞLADI</small>
                <h1>İniş noktanı seç.</h1>
                <p>Teçhizatını topla. Bölgeye ilerle. Hayatta kal.</p>
                <button
                  onClick={() => {
                    controller.current?.capturePointer();
                    command("jump");
                  }}
                  data-testid="battle-jump"
                >
                  <kbd>E</kbd> UÇAKTAN ATLA <span>↘</span>
                </button>
              </div>
            )}
            {hud.phase === "drop" && (
              <div className={styles.airborne}>
                <span>↓</span>
                <div>
                  <strong>PARAŞÜTLE İNİŞ</strong>
                  <small>
                    {mobile
                      ? "Joystick ile inişini yönlendir"
                      : "W A S D ile inişini yönlendir"}
                  </small>
                </div>
              </div>
            )}
            {hud.notice && (
              <p className={styles.notice} data-testid="battle-notice">
                {hud.notice}
              </p>
            )}
            {hud.prompt && hud.phase === "combat" && (
              <button
                className={styles.interact}
                data-testid="battle-interact"
                onClick={() => command("interact")}
              >
                <kbd>E</kbd>
                {hud.prompt}
              </button>
            )}
            {hud.reloading > 0 && (
              <div className={styles.reloadIndicator}>
                <span
                  style={{ width: `${clamp(1 - hud.reloading, 0, 1) * 100}%` }}
                />
                <p>Şarjör değiştiriliyor</p>
              </div>
            )}
          </div>
          {(hud.paused || (!mobile && !hud.locked)) &&
            !settingsOpen &&
            hud.phase !== "plane" && (
              <button
                className={styles.capture}
                onClick={() => controller.current?.capturePointer()}
              >
                {hud.paused ? "DEVAM ET" : "KONTROLÜ AL"}
                <small>
                  {mobile
                    ? "Dokunarak maça devam et"
                    : "Fare ile nişan al · Esc ile bırak"}
                </small>
              </button>
            )}
        </>
      )}

      <div className={styles.bottomLeft} style={metersStyle}>
        <div className={styles.operator}>
          <div className={styles.operatorPortrait}>◇</div>
          <div>
            <small>OPERATÖR 01</small>
            <strong>YALNIZ KURT</strong>
          </div>
          <span>SOLO</span>
        </div>
        <div className={styles.armorMeter}>
          <span>▱</span>
          <div>
            <i />
          </div>
          <strong>{Math.ceil(hud.armor)}</strong>
        </div>
        <div className={styles.healthMeter}>
          <span>+</span>
          <div>
            <i />
          </div>
          <strong data-testid="battle-health">{Math.ceil(hud.hp)}</strong>
        </div>
        <div className={styles.staminaMeter}>
          <i />
        </div>
        <div className={styles.supplies}>
          <button onClick={() => command("heal")}>
            <kbd>H</kbd> İLK YARDIM <b>{hud.medkits}</b>
          </button>
          <button onClick={() => command("grenadeType")}>
            <kbd>B</kbd>
            {hud.grenadeType}
            <b>{hud.grenades}</b>
          </button>
        </div>
      </div>
      <div className={`${styles.bottomRight} ${styles[hud.rarity]}`}>
        <div className={styles.weaponTop}>
          <span>{rarityNames[hud.rarity]}</span>
          <button onClick={() => command("weapon")}>
            <kbd>1 / 2</kbd> DEĞİŞTİR
          </button>
        </div>
        <div className={styles.weaponName}>
          <strong data-testid="battle-weapon">{hud.weapon}</strong>
          <svg viewBox="0 0 130 35" aria-hidden="true">
            <path
              d="M4 12h23l7-6h39l6 5h38v5H81l-8 5H54l-5 12h-9l4-12H28L6 28H2Z"
              fill="currentColor"
            />
            <path d="M68 22h13l-3 12H65Z" fill="currentColor" />
            <path d="M117 8h7v13h-7M46 3h15v3H46" fill="currentColor" />
          </svg>
        </div>
        <div className={styles.ammunition}>
          <strong data-testid="battle-ammo">
            {hud.ammo.toString().padStart(2, "0")}
          </strong>
          <span>/ {hud.reserve}</span>
          <button
            onClick={() => command("reload")}
            aria-label="Şarjör değiştir"
          >
            <kbd>R</kbd>
          </button>
        </div>
        <div className={styles.attachments}>
          {hud.attachments.length ? (
            hud.attachments.map((item) => (
              <span key={item}>{attachmentNames[item]}</span>
            ))
          ) : (
            <span>EKLENTİ YUVASI BOŞ</span>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <a href="/">← Arenadan çık</a>
        <span>
          <kbd>WASD</kbd> Hareket <kbd>Shift</kbd> Koş <kbd>Sağ tık</kbd> Nişan{" "}
          <kbd>O</kbd> Ayarlar
        </span>
        <span>ASHFALL / OPERASYON SAHASI</span>
      </footer>

      {mobile && !end && !settingsOpen && !loading && (
        <div className={styles.touchControls}>
          <div
            className={styles.lookPad}
            aria-label="Bakış kontrolü"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              lookPointer.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              };
              controller.current?.capturePointer();
            }}
            onPointerMove={(event) => {
              const point = lookPointer.current;
              if (point?.id !== event.pointerId) return;
              controller.current?.touch({
                lookX: event.clientX - point.x,
                lookY: event.clientY - point.y,
              });
              point.x = event.clientX;
              point.y = event.clientY;
            }}
            onPointerUp={() => {
              lookPointer.current = null;
            }}
            onPointerCancel={() => {
              lookPointer.current = null;
            }}
            onLostPointerCapture={() => {
              lookPointer.current = null;
            }}
          />
          <div
            className={styles.joystick}
            role="application"
            aria-label="Hareket joystick'i"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              joystickPointer.current = event.pointerId;
              controller.current?.capturePointer();
              moveJoystick(event);
            }}
            onPointerMove={(event) => {
              if (joystickPointer.current === event.pointerId)
                moveJoystick(event);
            }}
            onPointerUp={resetJoystick}
            onPointerCancel={resetJoystick}
            onLostPointerCapture={resetJoystick}
          >
            <i
              style={{
                transform: `translate(${joystick.x * 32}px, ${joystick.y * 32}px)`,
              }}
            />
            <span>HAREKET</span>
          </div>
          <div className={styles.touchActions}>
            <button
              className={styles.fireButton}
              aria-label="Ateş et"
              onPointerDown={(e) => hold(e, "fire", true)}
              onPointerUp={(e) => hold(e, "fire", false)}
              onPointerCancel={(e) => hold(e, "fire", false)}
              onLostPointerCapture={(e) => hold(e, "fire", false)}
            >
              ◎
            </button>
            <button
              aria-label="Nişan al"
              onPointerDown={(e) => hold(e, "aim", true)}
              onPointerUp={(e) => hold(e, "aim", false)}
              onPointerCancel={(e) => hold(e, "aim", false)}
              onLostPointerCapture={(e) => hold(e, "aim", false)}
            >
              ⊕
            </button>
            <button aria-label="Zıpla" onClick={() => command("jump")}>
              ↑
            </button>
            <button aria-label="Eğil" onClick={() => command("crouch")}>
              ↓
            </button>
            <button
              aria-label="Koş"
              onPointerDown={(e) => hold(e, "sprint", true)}
              onPointerUp={(e) => hold(e, "sprint", false)}
              onPointerCancel={(e) => hold(e, "sprint", false)}
              onLostPointerCapture={(e) => hold(e, "sprint", false)}
            >
              »
            </button>
            <button aria-label="Bomba at" onClick={() => command("grenade")}>
              G
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className={styles.settingsScrim} onClick={closeSettings}>
          <section
            className={styles.settingsPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Oyun ayarları"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.panelHeading}>
              <div>
                <small>OPERATÖR AYARLARI</small>
                <h2>Sana göre ayarla.</h2>
              </div>
              <button onClick={closeSettings} aria-label="Ayarları kapat">
                ×
              </button>
            </div>
            <label htmlFor="battle-quality">Grafik kalitesi</label>
            <select
              id="battle-quality"
              value={quality}
              onChange={(event) => {
                const value = event.target.value as Quality;
                settingsRef.current.quality = value;
                setQuality(value);
                controller.current?.setQuality(value);
              }}
            >
              <option value="low">Low · Düşük</option>
              <option value="medium">Medium · Orta</option>
              <option value="high">High · Yüksek</option>
              <option value="ultra">Ultra</option>
            </select>
            <p>Görüntü takılıyorsa daha düşük bir kalite seçebilirsin.</p>
            <label htmlFor="battle-difficulty">Rakiplerin zorluğu</label>
            <select
              id="battle-difficulty"
              value={difficulty}
              onChange={(event) => {
                const value = event.target.value as Difficulty;
                settingsRef.current.difficulty = value;
                setDifficulty(value);
                controller.current?.setDifficulty(value);
              }}
            >
              <option value="easy">Easy · Kolay</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard · Zor</option>
              <option value="insane">Insane · Çok zor</option>
            </select>
            <label htmlFor="battle-volume">
              Ses <span>{Math.round(volume * 100)}%</span>
            </label>
            <input
              id="battle-volume"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={volume}
              onChange={(event) => {
                const value = Number(event.target.value);
                settingsRef.current.volume = value;
                setVolume(value);
                controller.current?.setVolume(value);
              }}
            />
            <div className={styles.controlList}>
              {[
                ["WASD", "Hareket / sürüş"],
                ["Shift", "Koş"],
                ["Space", "Zıpla / araç freni"],
                ["Ctrl", "Kay"],
                ["C / Z", "Eğil / sürün"],
                ["Q", "Omuz değiştir"],
                ["Sağ tık", "Nişan al"],
                ["R", "Şarjör değiştir"],
                ["E", "Etkileşim / bin / in"],
                ["G / B", "Bomba / türü"],
                ["H", "İlk yardım"],
                ["1 / 2", "Silah değiştir"],
              ].map(([key, label]) => (
                <div key={key}>
                  <kbd>{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p>
              Alçak engelde Space ile tırman. Araç veya zipline yanında E ile
              bin; yeniden E ile in.
            </p>
            <button className={styles.primaryButton} onClick={closeSettings}>
              OYUNA DÖN →
            </button>
          </section>
        </div>
      )}

      {(loading || error) && (
        <div className={styles.loadingScreen} role="status">
          <span className={styles.loadingEmblem}>X</span>
          <small>XARMY · BATTLE ROYALE</small>
          <h1>{error ? "Sahneye bağlanamadık." : "Operasyon hazırlanıyor."}</h1>
          <p>{error || "Arazi, ışıklar ve teçhizat yükleniyor."}</p>
          {error ? (
            <button
              className={styles.primaryButton}
              onClick={() => setMatchId((id) => id + 1)}
            >
              TEKRAR DENE
            </button>
          ) : (
            <div className={styles.loadingLine}>
              <i />
            </div>
          )}
          <a href="/">← Arenadan çık</a>
        </div>
      )}
      {end && !loading && (
        <div
          className={`${styles.endScreen} ${hud.replay ? styles.replayScreen : ""}`}
          data-testid="battle-result"
        >
          <small>
            {hud.replay
              ? "SON ÇATIŞMA · TEKRAR"
              : hud.phase === "victory"
                ? "GÖREV TAMAMLANDI"
                : "OPERASYON SONA ERDİ"}
          </small>
          <h1>
            {hud.phase === "victory"
              ? "SON KİŞİ SENSİN."
              : hud.replay
                ? "Son anlar."
                : "BİR SONRAKİNE."}
          </h1>
          <p>
            {hud.phase === "victory"
              ? "Bütün rakiplerini geride bıraktın. Bölge senin."
              : hud.killer
                ? `${hud.killer} tarafından elendin.`
                : "Bu kez bölge seni geride bıraktı."}
          </p>
          <div className={styles.resultStats}>
            <span>
              <strong>{hud.kills}</strong>ELEME
            </span>
            <span>
              <strong>{timer(hud.elapsed)}</strong>HAYATTA KALMA
            </span>
          </div>
          <button
            className={styles.primaryButton}
            onClick={() => setMatchId((id) => id + 1)}
          >
            YENİ MAÇ →
          </button>
          <a href="/">Arenadan çık</a>
        </div>
      )}
    </div>
  );
}
