"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WarMap, { type MapMode } from "./strategy/WarMap";
import WarPanels, { Meter, number, TABS, type Tab } from "./strategy/WarPanels";
import { applyAction, createWorld } from "./strategy/engine";
import { dateLabel, GEOGRAPHY, MAP, surrender } from "./strategy/world";
import {
  decodeSave,
  encodeSave,
  loadLocal,
  saveLocal,
  type SaveSlot,
} from "./strategy/storage";
import { useOfflinePack } from "./strategy/useOfflinePack";
import { useSimulation } from "./strategy/useSimulation";
import { useSaveSlots } from "./strategy/useSaveSlots";
import type { Action, OffensivePlan, World } from "./strategy/types";
import styles from "./europa.module.css";

function Saves({
  world,
  onLoad,
  onMessage,
}: {
  world: World;
  onLoad: (w: World) => void;
  onMessage: (s: string) => void;
}) {
  const slots = useSaveSlots(),
    input = useRef<HTMLInputElement>(null);
  function save(slot: SaveSlot) {
    try {
      saveLocal(slot, world);
      onMessage("Sefer bu cihaza kaydedildi.");
    } catch (e) {
      onMessage((e as Error).message);
    }
  }
  function load(slot: SaveSlot) {
    try {
      onLoad(loadLocal(slot));
      onMessage("Kayıt yüklendi. Zaman duraklatıldı.");
    } catch (e) {
      onMessage((e as Error).message);
    }
  }
  function download() {
    const blob = new Blob([encodeSave(world)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `xarmy-${world.player}-${world.day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className={styles.eyebrow}>YEREL ARŞİV</div>
      <h2>Kayıtlar</h2>
      <p>
        Seferler bu tarayıcıda saklanır. Başka cihaza taşımak için JSON
        dosyasını indir. Her 14 oyun gününde iki dönüşümlü otomatik yuva
        kullanılır.
      </p>
      {slots.map(({ slot, label, valid }) => (
        <div key={slot} className={styles.card}>
          <h3>
            {slot.startsWith("auto") ? "Otomatik kayıt" : "Manuel kayıt"}{" "}
            {slot.at(-1)}
          </h3>
          <p>{label}</p>
          <div className={styles.buttonRow}>
            {!slot.startsWith("auto") && (
              <button onClick={() => save(slot)}>Bu yuvaya kaydet</button>
            )}
            <button disabled={!valid} onClick={() => load(slot)}>
              Yükle
            </button>
          </div>
        </div>
      ))}
      <div className={styles.buttonRow}>
        <button onClick={download}>JSON dosyası indir</button>
        <button onClick={() => input.current?.click()}>Dosyadan yükle</button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Sefer kayıt dosyası"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 4 * 1024 * 1024)
              throw new Error("Dosya en fazla 4 MB olabilir.");
            onLoad(decodeSave(await file.text()));
            onMessage("Dosya doğrulandı ve sefer yüklendi.");
          } catch (error) {
            onMessage((error as Error).message);
          }
          e.target.value = "";
        }}
      />
      <p className={styles.hint}>
        Eski 2025 senaryosunun kayıtları ayrı tutulur ve silinmez. 1936
        seferiyle uyumlu değiller.
      </p>
    </>
  );
}
export default function EuropaWarClient() {
  const [campaignRevision, setCampaignRevision] = useState(0);
  const [setup, setSetup] = useState(true),
    [choice, setChoice] = useState("turkey"),
    [scenario, setScenario] = useState<World["mode"]>("historical"),
    [difficulty, setDifficulty] = useState<World["difficulty"]>("easy");
  const [tab, setTab] = useState<Tab>("command"),
    [selected, setSelected] = useState("turkey-0"),
    [armyIds, setArmyIds] = useState<string[]>([]),
    [target, setTarget] = useState("germany");
  const [mode, setMode] = useState<MapMode>("political"),
    [order, setOrder] = useState<
      "move" | "paradrop" | "front" | "offensive" | null
    >(null),
    [message, setMessage] = useState(""),
    [panel, setPanel] = useState(true),
    [log, setLog] = useState(false);
  const saved = useSaveSlots();
  const [attackArmies, setAttackArmies] = useState<string[]>([]),
    [attackStance, setAttackStance] =
      useState<OffensivePlan["stance"]>("balanced");
  const [frontPoints, setFrontPoints] = useState<string[]>([]);
  const say = useCallback((text: string) => {
    setMessage(text);
  }, []);
  const { world, setWorld, current, paused, setPaused, speed, setSpeed } =
    useSimulation(say);
  const offline = useOfflinePack();
  const lastAuto = useRef(-1),
    lastHiddenSave = useRef(-1);
  const preview = useMemo(
    () => createWorld(choice, scenario, 1936, difficulty),
    [choice, scenario, difficulty],
  );
  const shown = world && !setup ? world : preview,
    c = shown.countries[shown.player],
    chosen = preview.countries[choice];
  const selectedArmies = useMemo(() => {
    const own = new Map(
      shown.armies.filter((a) => a.country === c.id).map((a) => [a.id, a]),
    );
    return armyIds.map((id) => own.get(id)).filter((a) => a !== undefined);
  }, [armyIds, shown.armies, c.id]);
  const selectedArmyIds = useMemo(
    () => selectedArmies.map((a) => a.id),
    [selectedArmies],
  );
  const armyId = selectedArmyIds[0] ?? null;
  useEffect(() => {
    const available = new Set(
      shown.armies.filter((a) => a.country === shown.player).map((a) => a.id),
    );
    setArmyIds((ids) => {
      const remaining = ids.filter((id) => available.has(id));
      return remaining.length === ids.length ? ids : remaining;
    });
  }, [shown.armies, shown.player]);
  useEffect(() => {
    if (!armyId && (order === "move" || order === "paradrop")) setOrder(null);
  }, [armyId, order]);
  useEffect(() => {
    if (!world || world.day % 14 !== 0 || world.day === lastAuto.current)
      return;
    try {
      saveLocal(Math.floor(world.day / 14) % 2 ? "auto-1" : "auto-2", world);
      lastAuto.current = world.day;
    } catch (e) {
      say((e as Error).message);
    }
  }, [world, say]);
  useEffect(() => {
    const hide = () => {
      if (!document.hidden) return;
      setPaused(true);
      const w = current.current;
      if (w && lastHiddenSave.current !== w.day) {
        try {
          saveLocal("auto-2", w);
          lastHiddenSave.current = w.day;
        } catch (e) {
          say((e as Error).message);
        }
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [say, setPaused, current]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea,button,a"))
        return;
      if (e.code === "Space" && !setup) {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === "Escape") {
        setOrder(null);
        setPaused(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setup, setPaused]);
  function restore(w: World) {
    setCampaignRevision((revision) => revision + 1);
    setWorld(w);
    setSetup(false);
    setPaused(true);
    setSelected(w.countries[w.player].capital);
    setArmyIds([]);
    setOrder(null);
    setFrontPoints([]);
    setAttackArmies([]);
    setTarget(Object.keys(w.countries).find((id) => id !== w.player)!);
    setTab("command");
    lastAuto.current = w.day;
    lastHiddenSave.current = -1;
  }
  function start() {
    restore(
      createWorld(
        choice,
        scenario,
        Math.floor(Date.now() % 4294967296),
        difficulty,
      ),
    );
    say(
      "Sefer hazır. Komuta merkezi önceliklerini gösteriyor. Planını seç, sonra ▶ ile zamanı ilerlet.",
    );
  }
  const command = useCallback(
    (a: Action) => {
      const w = current.current;
      if (!w) return false;
      const result = applyAction(w, a);
      if (result.error) {
        say(result.error);
        setPanel(true);
        return false;
      } else {
        setWorld(result.world);
        const count = "armies" in a ? new Set(a.armies).size : 1,
          movementOrder = ["move", "moveGroup", "paradrop", "plan"].includes(
            a.type,
          ),
          feedback =
            a.type === "haltGroup"
              ? `${count} tümen için hareket durduruldu; savunma emri verildi.`
              : a.type === "moveGroup"
                ? `${count} tümen için hareket emri hazır.`
                : movementOrder
                  ? "Emir hazır."
                  : "Emir uygulandı.";
        setMessage(
          feedback +
            (paused && movementOrder
              ? " Zaman duraklatıldı; ▶ ile ilerlettiğinde birlikler harekete geçer."
              : ""),
        );
        return true;
      }
    },
    [current, setWorld, paused],
  );
  function onArmy(id: string) {
    onArmies([id]);
  }
  const onArmies = useCallback(
    (ids: string[], append = false) => {
      const ownIds = new Set(
        shown.armies.filter((a) => a.country === shown.player).map((a) => a.id),
      );
      const eligible = ids.filter((id) => ownIds.has(id));
      setArmyIds((previous) => [
        ...new Set([
          ...(append ? previous.filter((id) => ownIds.has(id)) : []),
          ...eligible,
        ]),
      ]);
      setTab("army");
      setPanel(true);
      setOrder(null);
      const a = shown.armies.find((a) => a.id === eligible[0]);
      if (a) setSelected(a.province);
    },
    [shown],
  );
  const onProvince = useCallback(
    (id: string, append = false) => {
      if (setup) {
        setChoice(shown.provinces[id].owner);
        setSelected(id);
        return;
      }
      if (order === "front" || order === "offensive") {
        setFrontPoints((points) =>
          points.includes(id)
            ? points.slice(0, points.indexOf(id) + 1)
            : [...points, id],
        );
        setSelected(id);
        return;
      }
      if ((order === "move" || order === "paradrop") && armyId) {
        const accepted = command(
          order === "move"
            ? { type: "moveGroup", armies: selectedArmyIds, to: id, append }
            : { type: "paradrop", army: armyId, to: id },
        );
        if (accepted) setOrder(null);
        setSelected(id);
        return;
      }
      setSelected(id);
      setTab("province");
      setPanel(true);
      const country = shown.provinces[id].controller;
      if (country !== shown.player) setTarget(country);
    },
    [setup, shown, order, armyId, selectedArmyIds, command],
  );
  function beginOrder(value: "move" | "paradrop" | "front" | "offensive") {
    if (value === "move" && !selectedArmyIds.length) {
      say("Hareket emri vermek için kendi tümenlerini seç.");
      return;
    }
    if (
      value === "paradrop" &&
      (selectedArmies.length !== 1 || selectedArmies[0].type !== "paratrooper")
    ) {
      say("Hava indirme için tek bir paraşütçü tümeni seç.");
      return;
    }
    setOrder(value);
    setFrontPoints([]);
    if (window.matchMedia("(max-width:700px)").matches) setPanel(false);
  }
  function newCampaign() {
    setPaused(true);
    setOrder(null);
    setArmyIds([]);
    setFrontPoints([]);
    setAttackArmies([]);
    const w = current.current;
    if (w)
      try {
        saveLocal("auto-2", w);
      } catch (e) {
        say((e as Error).message);
      }
    setSetup(true);
  }
  const totalOwned = Object.values(shown.provinces).filter(
    (p) => p.controller === c.id,
  ).length;
  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <Link
          className={styles.brand}
          href="/"
          aria-label="XARMY oyunlarına dön"
          onClick={() => {
            setPaused(true);
            const w = current.current;
            if (w)
              try {
                saveLocal("auto-2", w);
              } catch {
                /* Manual export remains available in the archive. */
              }
          }}
        >
          X<span>ARMY</span>
          <small>EUROPA WAR</small>
        </Link>
        <div className={styles.nation}>
          <span style={{ background: c.color }}>{c.flag}</span>
          <div>
            <strong>{c.name}</strong>
            <small>
              {c.capitulated
                ? "TESLİM OLDU"
                : c.wars.length
                  ? "SAVAŞ HALİNDE"
                  : "BARIŞ DÖNEMİ"}
            </small>
          </div>
        </div>
        <div className={styles.topStats}>
          <div title="Hazine">
            <span>HAZİNE</span>
            <b>{number(c.treasury)}</b>
          </div>
          <div title="Yedek insan gücü">
            <span>İNSAN GÜCÜ</span>
            <b>{number(c.manpower)}</b>
          </div>
          <div title="Siyasi güç">
            <span>SİYASİ GÜÇ</span>
            <b>{number(c.political)}</b>
          </div>
          <div title="Dünya gerilimi">
            <span>DÜNYA GERİLİMİ</span>
            <b className={shown.tension > 50 ? styles.red : ""}>
              %{Math.round(shown.tension)}
            </b>
          </div>
        </div>
        <div className={styles.clock}>
          <strong data-testid="game-date">{dateLabel(shown.day)}</strong>
          <div>
            <button
              disabled={setup}
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Zamanı başlat" : "Zamanı duraklat"}
              title="Boşluk: duraklat / devam et"
            >
              {paused ? "▶" : "Ⅱ"}
            </button>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                className={speed === s ? styles.active : ""}
                disabled={setup}
                aria-label={`${s} kat hız`}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className={styles.workspace}>
        <nav className={styles.rail} aria-label="Yönetim panelleri">
          {TABS.map(([id, icon, label]) => (
            <button
              key={id}
              className={tab === id && panel ? styles.active : ""}
              onClick={() => {
                setTab(id);
                setPanel(true);
              }}
              title={label}
              disabled={setup}
            >
              <span>{icon}</span>
              <small>{label}</small>
            </button>
          ))}
          <button onClick={newCampaign} title="Yeni sefer">
            <span>↻</span>
            <small>Yeni sefer</small>
          </button>
        </nav>
        <main className={styles.theater}>
          <div className={styles.mapTop}>
            <div>
              <span className={styles.eyebrow}>AVRUPA HAREKÂT SAHASI</span>
              <h1>
                {setup
                  ? "Fırtınadan önce"
                  : order
                    ? "Harekât hedefini seç"
                    : paused
                      ? "Komuta sende."
                      : "Dünya değişiyor."}
              </h1>
            </div>
            <label>
              Harita görünümü
              <select
                aria-label="Harita görünümü"
                value={mode}
                onChange={(e) => setMode(e.target.value as MapMode)}
              >
                <option value="political">Siyasi</option>
                <option value="military">Askerî</option>
                <option value="terrain">Arazi</option>
                <option value="supply">İkmal</option>
                <option value="air">Hava harekâtı</option>
                <option value="naval">Deniz harekâtı</option>
              </select>
            </label>
          </div>
          <WarMap
            world={shown}
            selected={selected}
            armyId={armyId}
            armyIds={selectedArmyIds}
            mode={mode}
            onSelect={onProvince}
            onArmies={onArmies}
            ordering={!!order}
            draft={frontPoints}
          />
          {order && (
            <div className={styles.orderBanner}>
              {order === "front" || order === "offensive"
                ? `${frontPoints.length} eyalet · ${order === "front" ? "Komşu savunma bölgelerini" : "Düşman hedeflerini"} sırayla seç.`
                : order === "move"
                  ? `${selectedArmyIds.length} tümen için haritada hedef eyalete tıkla. Shift: rotaya hedef ekle.`
                  : "Seçili paraşütçü tümeni için haritada hedef eyalete tıkla."}
              {(order === "front" || order === "offensive") && (
                <button
                  disabled={
                    frontPoints.length < (order === "offensive" ? 1 : 2)
                  }
                  onClick={() => {
                    const success = command(
                      order === "offensive"
                        ? {
                            type: "offensive",
                            armies: attackArmies,
                            objectives: frontPoints,
                            stance: attackStance,
                          }
                        : {
                            type: "front",
                            provinces: frontPoints,
                            armies: shown.armies
                              .filter((a) => a.country === c.id)
                              .map((a) => a.id),
                          },
                    );
                    if (success) {
                      setOrder(null);
                      setFrontPoints([]);
                      setPanel(true);
                    }
                  }}
                >
                  {order === "offensive"
                    ? "Taarruz planını hazırla"
                    : "Hattı kaydet ve dağıt"}
                </button>
              )}
              <button
                onClick={() => {
                  setOrder(null);
                  setFrontPoints([]);
                }}
              >
                Emri iptal et
              </button>
            </div>
          )}
          {!panel && (
            <button className={styles.openPanel} onClick={() => setPanel(true)}>
              Yönetim panelini aç →
            </button>
          )}
          <div className={styles.bottomBar}>
            <span>
              <i className={paused ? styles.pausedDot : styles.liveDot} />
              {setup
                ? "1936 SENARYOSU"
                : paused
                  ? "DURAKLATILDI"
                  : `${speed}× ZAMAN`}
            </span>
            <span>
              {totalOwned} bölge ·{" "}
              {shown.armies.filter((a) => a.country === c.id).length} tümen ·{" "}
              {shown.battles.length} muharebe
            </span>
            <button onClick={() => setLog((v) => !v)}>
              {log ? "Olayları gizle" : "Olay günlüğü"}{" "}
              <b>{shown.events.length}</b>
            </button>
          </div>
          {log && (
            <div className={styles.eventLog} aria-label="Önemli olaylar">
              <h3>Harekât günlüğü</h3>
              {shown.events.map((e, i) => (
                <div key={`${e.day}-${i}`}>
                  <time>{dateLabel(e.day)}</time>
                  <p className={e.kind === "war" ? styles.red : ""}>{e.text}</p>
                </div>
              ))}
            </div>
          )}
        </main>
        {panel && (
          <aside className={styles.panel}>
            <div className={styles.panelTop}>
              <span>
                {TABS.find((t) => t[0] === tab)?.[2].toLocaleUpperCase("tr-TR")}
              </span>
              <button
                aria-label="Yönetim panelini kapat"
                onClick={() => setPanel(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.panelBody}>
              {message && (
                <div role="status" className={styles.notice}>
                  <span>{message}</span>
                  <button
                    aria-label="Bildirimi kapat"
                    onClick={() => setMessage("")}
                  >
                    ×
                  </button>
                </div>
              )}
              {tab === "saves" && world ? (
                <Saves world={world} onLoad={restore} onMessage={say} />
              ) : (
                <WarPanels
                  key={`${campaignRevision}:${shown.player}`}
                  world={shown}
                  tab={tab}
                  selected={selected}
                  armyId={armyId}
                  armyIds={selectedArmyIds}
                  target={target}
                  onTarget={setTarget}
                  command={command}
                  onProvince={onProvince}
                  onArmy={onArmy}
                  onArmies={onArmies}
                  onOrder={() => beginOrder("move")}
                  onParadrop={() => beginOrder("paradrop")}
                  onFront={() => beginOrder("front")}
                  onTab={setTab}
                  onOffensive={(armies, stance) => {
                    setAttackArmies(armies);
                    setAttackStance(stance);
                    beginOrder("offensive");
                  }}
                />
              )}
              {!setup && (
                <div className={styles.campaignNote}>
                  <Meter
                    label="Ülkenin teslimiyet riski"
                    value={surrender(shown, c.id)}
                    color="#c78369"
                  />
                  <p>{offline}</p>
                  <small>
                    Avrupa 1936 · Yaklaşık tarihsel sınırlar, şehir merkezli
                    stratejik bölgeler. Veriler oyun ölçeğine uyarlanmıştır.
                  </small>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      {setup && (
        <div className={styles.setupShade}>
          <section
            className={styles.setup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scenario-heading"
          >
            <div className={styles.eyebrow}>XARMY / BÜYÜK STRATEJİ</div>
            <h2 id="scenario-heading">
              AVRUPA, <em>1936.</em>
            </h2>
            <p className={styles.setupIntro}>
              Bir ulusun geleceğini yönet.
              <br />
              Sanayini kur, diplomasiyi şekillendir, cephelerini savun.
            </p>
            <div className={styles.scenarioTag}>
              II. DÜNYA SAVAŞI DÖNEMİ <span>01 OCAK 1936</span>
            </div>
            <label className={styles.field}>
              Komuta edeceğin ülke
              <select
                value={choice}
                onChange={(e) => {
                  setChoice(e.target.value);
                  setSelected(preview.countries[e.target.value].capital);
                }}
              >
                {MAP.countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.countryChoices}>
              {["turkey", "germany", "uk", "france", "italy", "ussr"].map(
                (id) => (
                  <button
                    key={id}
                    className={choice === id ? styles.active : ""}
                    onClick={() => {
                      setChoice(id);
                      setSelected(preview.countries[id].capital);
                    }}
                  >
                    <span>{preview.countries[id].flag}</span>
                    {preview.countries[id].name}
                  </button>
                ),
              )}
            </div>
            <div className={styles.setupLeader}>
              <span style={{ background: chosen.color }}>{chosen.flag}</span>
              <div>
                <strong>{chosen.name}</strong>
                <small>
                  {chosen.leader} · {number(chosen.population)} nüfus
                </small>
              </div>
            </div>
            <div className={styles.modeChoices}>
              <button
                className={scenario === "historical" ? styles.active : ""}
                onClick={() => setScenario("historical")}
              >
                <strong>Tarihsel yönelim</strong>
                <small>
                  1936–1941 krizleri ve savaş tarihleri; kararların olayları
                  değiştirebilir.
                </small>
              </button>
              <button
                className={scenario === "alternative" ? styles.active : ""}
                onClick={() => setScenario("alternative")}
              >
                <strong>Alternatif tarih</strong>
                <small>
                  Ülkeler tehdide, güce ve kaynaklara göre kendi yollarını
                  seçer.
                </small>
              </button>
            </div>
            <label className={styles.field}>
              Zorluk
              <select
                aria-label="Sefer zorluğu"
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as World["difficulty"])
                }
              >
                <option value="easy">Kolay · ilk sefer için önerilir</option>
                <option value="normal">Normal · eşit koşullar</option>
                <option value="hard">Zor · deneyimli komutan</option>
              </select>
              <small>
                Kolayda birliklerin daha güçlü, rakiplerin daha temkinli. Sefer
                sırasında da değiştirebilirsin.
              </small>
            </label>
            <button className={styles.launch} onClick={start}>
              SEFERİ BAŞLAT <span>→</span>
            </button>
            {world && (
              <button
                className={styles.textButton}
                onClick={() => setSetup(false)}
              >
                Mevcut sefere dön
              </button>
            )}
            {saved.filter((s) => s.valid).length > 0 && (
              <details className={styles.details}>
                <summary>Kayıtlı sefere devam et</summary>
                {saved
                  .filter((s) => s.valid)
                  .map((s) => (
                    <button
                      key={s.slot}
                      className={styles.rowButton}
                      onClick={() => {
                        try {
                          restore(loadLocal(s.slot));
                        } catch (e) {
                          say((e as Error).message);
                        }
                      }}
                    >
                      {s.label} →
                    </button>
                  ))}
              </details>
            )}
            <p className={styles.setupFoot}>
              Tek oyunculu · Yerel kayıt · Özgün oyun sistemleri
              <br />
              Sınırlar yaklaşık, bölgeler şehir merkezlidir. Harita: Natural
              Earth.
            </p>
            <Link className={styles.textButton} href="/">
              ← XARMY oyunları
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
