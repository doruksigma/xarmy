"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WarMap, { type MapMode } from "./strategy/WarMap";
import WarPanels, { Meter, number, TABS, type Tab } from "./strategy/WarPanels";
import CommanderBar from "./strategy/CommanderBar";
import MilitaryIcon from "./strategy/MilitaryIcon";
import CommandCenter from "./strategy/CommandCenter";
import { EasyPlayMode } from "./strategy/EasyCommandGuide";
import {
  EASY_PLAY_PREFERENCE,
  easyPresentationPreference,
} from "./strategy/easy-play";
import MapPresentationBoundary from "./strategy/MapPresentationBoundary";
import { createWorld } from "./strategy/engine";
import { createCommand, executeCommand } from "./strategy/commands";
import { dateLabel, MAP, surrender } from "./strategy/world";
import { hourLabel, worldHour } from "./strategy/time";
import {
  decodeSave,
  encodeSave,
  saveLocal,
  type SaveSlot,
} from "./strategy/storage";
import { loadBrowserSave, saveAutomatic } from "./strategy/storage-browser";
import { useOfflinePack } from "./strategy/useOfflinePack";
import { useSimulation } from "./strategy/useSimulation";
import { SIMULATION_HOUR_MS } from "./strategy/simulation";
import SimulationMetrics from "./strategy/SimulationMetrics";
import { useSaveSlots } from "./strategy/useSaveSlots";
import type { Action, OffensivePlan, World } from "./strategy/types";
import styles from "./europa.module.css";

const load3DMap = () => import("./strategy/WarMap3D");
const WarMap3D = dynamic(load3DMap, {
  ssr: false,
  loading: () => (
    <div className={styles.mapLoading} role="status">
      3D arazi hazırlanıyor…
    </div>
  ),
});
const MAP_VIEW_KEY = "xarmy-europa-map-view-v1";

function Saves({
  world,
  onLoadSaved,
  onImport,
  onMessage,
}: {
  world: World;
  onLoadSaved: (slot: SaveSlot) => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onMessage: (s: string) => void;
}) {
  const slots = useSaveSlots(),
    input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const loadPending = useRef(false);
  function save(slot: SaveSlot) {
    try {
      saveLocal(slot, world);
      onMessage("Sefer bu cihaza kaydedildi.");
    } catch (e) {
      onMessage((e as Error).message);
    }
  }
  async function load(slot: SaveSlot) {
    if (loadPending.current) return;
    loadPending.current = true;
    setLoading(true);
    try {
      await onLoadSaved(slot);
    } finally {
      loadPending.current = false;
      setLoading(false);
    }
  }
  function download() {
    const blob = new Blob([encodeSave(world)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `xarmy-${world.player}-${world.day}-${world.hour}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className={styles.eyebrow}>YEREL ARŞİV</div>
      <h2>
        <MilitaryIcon name="save" size={26} />
        Kayıtlar
      </h2>
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
              <button disabled={loading} onClick={() => save(slot)}>
                <MilitaryIcon name="save" size={15} />
                Bu yuvaya kaydet
              </button>
            )}
            <button disabled={!valid || loading} onClick={() => load(slot)}>
              <MilitaryIcon name="load" size={15} />
              Yükle
            </button>
          </div>
        </div>
      ))}
      <div className={styles.buttonRow}>
        <button onClick={download}>
          <MilitaryIcon name="download" size={15} />
          JSON dosyası indir
        </button>
        <button disabled={loading} onClick={() => input.current?.click()}>
          <MilitaryIcon name="load" size={15} />
          Dosyadan yükle
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Sefer kayıt dosyası"
        onChange={async (e) => {
          const element = e.currentTarget;
          const file = element.files?.[0];
          if (!file || loadPending.current) return;
          loadPending.current = true;
          setLoading(true);
          try {
            await onImport(file);
          } finally {
            element.value = "";
            loadPending.current = false;
            setLoading(false);
          }
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
  const router = useRouter();
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const transitionPending = useRef(false);
  const [transition, setTransition] = useState<"saving" | "loading" | null>(
    null,
  );
  const [campaignRevision, setCampaignRevision] = useState(0);
  const [recruitProvince, setRecruitProvince] = useState<string | null>(null);
  const [mapView, setMapView] = useState<"3d" | "2d">("3d");
  const [simple, setSimple] = useState(true);
  const [guideGeneralId, setGuideGeneralId] = useState("");
  useEffect(() => {
    try {
      if (localStorage.getItem(MAP_VIEW_KEY) === "2d") setMapView("2d");
      setSimple(
        easyPresentationPreference(localStorage.getItem(EASY_PLAY_PREFERENCE)),
      );
    } catch {
      /* The presentation also works without storage permission. */
    }
  }, []);
  const changePresentation = useCallback((value: boolean) => {
    setSimple(value);
    try {
      localStorage.setItem(EASY_PLAY_PREFERENCE, value ? "easy" : "advanced");
    } catch {
      /* The guide also works without storing a preference. */
    }
  }, []);
  const changeMapView = useCallback((view: "3d" | "2d") => {
    setMapView(view);
    try {
      localStorage.setItem(MAP_VIEW_KEY, view);
    } catch {
      /* Optional preference. */
    }
  }, []);
  const [setup, setSetup] = useState(true),
    [choice, setChoice] = useState("turkey"),
    [scenario, setScenario] = useState<World["mode"]>("historical"),
    [difficulty, setDifficulty] = useState<World["difficulty"]>("hard");
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
  const saved = useSaveSlots(setup);
  const [attackArmies, setAttackArmies] = useState<string[]>([]),
    [attackStance, setAttackStance] =
      useState<OffensivePlan["stance"]>("balanced");
  const [frontPoints, setFrontPoints] = useState<string[]>([]);
  const say = useCallback((text: string) => {
    setMessage(text);
  }, []);
  const {
    world,
    setWorld,
    current,
    paused,
    setPaused: setSimulationPaused,
    speed,
    setSpeed,
    diagnostics,
  } = useSimulation(say);
  const setPaused = useCallback(
    (next: boolean | ((paused: boolean) => boolean)) => {
      // A save/restore owns the campaign snapshot until it finishes. Pausing
      // remains allowed, but neither a keyboard toggle nor a map control can
      // restart simulation while an exit is waiting for its transaction.
      if (transitionPending.current && next !== true) return;
      setSimulationPaused(next);
    },
    [setSimulationPaused],
  );
  const offline = useOfflinePack(load3DMap);
  const lastAuto = useRef(-1),
    lastHiddenSave = useRef<World | null>(null);
  const preview = useMemo(
    () => createWorld(choice, scenario, 1936, difficulty),
    [choice, scenario, difficulty],
  );
  const shown = world && !setup ? world : preview,
    c = shown.countries[shown.player],
    chosen = preview.countries[choice];
  useEffect(() => {
    // A new panel starts at its heading; simulation snapshots never interrupt
    // reading or scrolling inside the current panel.
    if (panelBodyRef.current) panelBodyRef.current.scrollTop = 0;
  }, [tab, campaignRevision, shown.player, panel]);
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
    // Mark the request before starting it: commands on the same day must not
    // enqueue a second full snapshot while its database transaction is pending.
    lastAuto.current = world.day;
    void saveAutomatic(
      Math.floor(world.day / 14) % 2 ? "auto-1" : "auto-2",
      world,
    ).catch((e: Error) => say(e.message));
  }, [world, say]);
  useEffect(() => {
    const hide = () => {
      if (!document.hidden) return;
      setPaused(true);
      // A load owns the selected save until it completes; writing the previous
      // campaign on tab hide could otherwise replace the very slot being read.
      // An exit already has its own committed-save request in flight.
      if (transitionPending.current) return;
      const w = current.current;
      if (w && lastHiddenSave.current !== w) {
        lastHiddenSave.current = w;
        void saveAutomatic("auto-2", w).catch((e: Error) => say(e.message));
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [say, setPaused, current]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,select,textarea,button,a,summary,[contenteditable='true']",
        )
      )
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
    setRecruitProvince(null);
    setWorld(w);
    setSetup(false);
    setPaused(true);
    setSelected(w.countries[w.player].capital);
    setArmyIds([]);
    setGuideGeneralId("");
    setOrder(null);
    setFrontPoints([]);
    setAttackArmies([]);
    setTarget(Object.keys(w.countries).find((id) => id !== w.player)!);
    setTab("command");
    lastAuto.current = w.day;
    lastHiddenSave.current = null;
  }
  function start() {
    if (transitionPending.current) return;
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
  async function restoreSaved(slot: SaveSlot) {
    if (transitionPending.current) return;
    transitionPending.current = true;
    setTransition("loading");
    setPaused(true);
    try {
      restore(await loadBrowserSave(slot));
      say("Kayıt yüklendi. Zaman duraklatıldı.");
    } catch (e) {
      say((e as Error).message);
    } finally {
      transitionPending.current = false;
      setTransition(null);
    }
  }
  async function importSaved(file: File) {
    if (transitionPending.current) return;
    transitionPending.current = true;
    setTransition("loading");
    setPaused(true);
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Dosya en fazla 4 MB olabilir.");
      restore(decodeSave(await file.text()));
      say("Dosya doğrulandı ve sefer yüklendi.");
    } catch (e) {
      say((e as Error).message);
    } finally {
      transitionPending.current = false;
      setTransition(null);
    }
  }
  const command = useCallback(
    (a: Action) => {
      if (transitionPending.current) return false;
      const w = current.current;
      if (!w) return false;
      const result = executeCommand(w, createCommand(w, a), w.player);
      if (result.status === "rejected") {
        say(result.message);
        setPanel(true);
        return false;
      } else {
        if (result.world !== w) setWorld(result.world);
        const count = "armies" in a ? new Set(a.armies).size : 1,
          movementOrder =
            [
              "move",
              "moveGroup",
              "paradrop",
              "front",
              "commanderDeploy",
            ].includes(a.type) ||
            (a.type === "plan" && a.kind === "start") ||
            (a.type === "commanderStance" && a.stance === "attack"),
          feedback =
            a.type === "commanderDeploy"
              ? "Komutanın tümenleri seçtiğin ülkenin sınırına dengeli yerleşecek."
              : a.type === "commanderStance"
                ? a.stance === "attack"
                  ? "Komutan yalnızca atandığı ülkeye karşı taarruza geçti."
                  : "Komutan savunmaya geçti; düşman topraklarına ilerlemeyecek."
                : a.type === "commanderRecall"
                  ? "Komutanın sınır görevi kaldırıldı. Tümenleri yeni emir bekliyor."
                  : a.type === "haltGroup"
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
    [current, setWorld, paused, say],
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
  const onMapOrder = useCallback(
    (id: string) => {
      if (setup || transitionPending.current) return;
      if (order) {
        onProvince(id);
        return;
      }
      if (!selectedArmyIds.length) {
        say("Önce kendi tümenlerini seç; ardından hedef bölgeye sağ tıkla.");
        return;
      }
      if (command({ type: "moveGroup", armies: selectedArmyIds, to: id }))
        setSelected(id);
    },
    [setup, order, onProvince, selectedArmyIds, command, say],
  );
  const on3DUnavailable = useCallback(
    (reason: string) => {
      changeMapView("2d");
      say(reason);
    },
    [changeMapView, say],
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
  async function newCampaign() {
    if (transitionPending.current) return;
    transitionPending.current = true;
    setTransition("saving");
    setPaused(true);
    setOrder(null);
    setArmyIds([]);
    setFrontPoints([]);
    setAttackArmies([]);
    const w = current.current;
    try {
      if (w) await saveAutomatic("auto-2", w);
      setSetup(true);
    } catch (e) {
      say((e as Error).message);
    } finally {
      transitionPending.current = false;
      setTransition(null);
    }
  }
  const totalOwned = Object.values(shown.provinces).filter(
    (p) => p.controller === c.id,
  ).length;
  return (
    <div className={`${styles.app}${simple ? ` ${styles.simpleView}` : ""}`}>
      <header className={styles.topbar}>
        <Link
          className={styles.brand}
          href="/"
          prefetch={false}
          aria-label="XARMY oyunlarına dön"
          onClick={async (event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            if (transitionPending.current) return;
            transitionPending.current = true;
            setTransition("saving");
            setPaused(true);
            const w = current.current;
            try {
              if (w) await saveAutomatic("auto-2", w);
              router.push("/");
            } catch (e) {
              say((e as Error).message);
            } finally {
              transitionPending.current = false;
              setTransition(null);
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
            <span>
              <MilitaryIcon name="treasury" size={12} />
              HAZİNE
            </span>
            <b>{number(c.treasury)}</b>
          </div>
          <div title="Yedek insan gücü">
            <span>
              <MilitaryIcon name="manpower" size={12} />
              İNSAN GÜCÜ
            </span>
            <b>{number(c.manpower)}</b>
          </div>
          <div title="Siyasi güç">
            <span>
              <MilitaryIcon name="politics" size={12} />
              SİYASİ GÜÇ
            </span>
            <b>{number(c.political)}</b>
          </div>
          <div title="Dünya gerilimi">
            <span>
              <MilitaryIcon name="tension" size={12} />
              DÜNYA GERİLİMİ
            </span>
            <b className={shown.tension > 50 ? styles.red : ""}>
              %{Math.round(shown.tension)}
            </b>
          </div>
        </div>
        <div className={styles.clock}>
          <strong data-testid="game-date" data-game-hour={worldHour(shown)}>
            {dateLabel(shown.day)} · {hourLabel(worldHour(shown))}
          </strong>
          {transition && (
            <small role="status">
              {transition === "saving"
                ? "Sefer kaydediliyor…"
                : "Sefer yükleniyor…"}
            </small>
          )}
          <div>
            <button
              disabled={setup || transition !== null}
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Zamanı başlat" : "Zamanı duraklat"}
              title="Boşluk: duraklat / devam et"
            >
              <MilitaryIcon name={paused ? "play" : "pause"} size={12} />
            </button>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                className={speed === s ? styles.active : ""}
                disabled={setup || transition !== null}
                aria-label={`${s} kat hız`}
                title={`${s}×: saniyede en fazla ${((s * 1000) / SIMULATION_HOUR_MS).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} oyun saati; hesaplama tamamlanınca ilerler`}
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
          {TABS.filter(([id]) => !simple || id !== "politics").map(
            ([id, icon, label]) => (
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
                <span className={styles.militaryEmblem}>
                  <MilitaryIcon name={icon} size={24} />
                </span>
                <small>{label}</small>
              </button>
            ),
          )}
          <button onClick={newCampaign} title="Yeni sefer">
            <span className={styles.militaryEmblem}>
              <MilitaryIcon name="reset" size={23} />
            </span>
            <small>Yeni sefer</small>
          </button>
        </nav>
        <main className={styles.theater}>
          <div className={styles.mapTop}>
            <div>
              <span className={styles.eyebrow}>DÜNYA HAREKÂT SAHASI</span>
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
            <div className={styles.mapPresentation}>
              <div
                className={styles.mapViewButtons}
                role="group"
                aria-label="Harita çizimi"
              >
                <button
                  type="button"
                  aria-pressed={mapView === "3d"}
                  onClick={() => changeMapView("3d")}
                >
                  3D arazi
                </button>
                <button
                  type="button"
                  aria-pressed={mapView === "2d"}
                  onClick={() => changeMapView("2d")}
                >
                  2D siyasi harita
                </button>
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
          </div>
          {mapView === "3d" ? (
            <MapPresentationBoundary
              key={`${mapView}:${campaignRevision}`}
              onUnavailable={on3DUnavailable}
            >
              <WarMap3D
                world={shown}
                selected={selected}
                armyId={armyId}
                armyIds={selectedArmyIds}
                mode={mode}
                onSelect={onProvince}
                onArmies={onArmies}
                ordering={!!order}
                draft={frontPoints}
                onOrder={onMapOrder}
                onUnavailable={on3DUnavailable}
                paused={paused || setup}
                onTheater={() => {
                  setTab("operations");
                  setPanel(true);
                }}
              />
            </MapPresentationBoundary>
          ) : (
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
          )}
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
          {!setup && !panel && !order && message && (
            <div
              role="status"
              className={`${styles.orderBanner} ${styles.mapNotice}`}
              data-testid="map-order-notice"
            >
              <span>{message}</span>
              <div className={styles.buttonRow}>
                {paused && (
                  <button
                    onClick={() => {
                      setPaused(false);
                      setMessage("");
                    }}
                  >
                    <MilitaryIcon name="play" size={14} />
                    Zamanı ilerlet
                  </button>
                )}
                <button onClick={() => setPanel(true)}>
                  Yönetim panelini aç →
                </button>
                <button
                  aria-label="Bildirimi kapat"
                  onClick={() => setMessage("")}
                >
                  <MilitaryIcon name="close" size={14} />
                </button>
              </div>
            </div>
          )}
          {!panel && (setup || order || !message) && (
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
                  <time>
                    {dateLabel(e.day)}
                    {e.hour !== undefined && ` · ${hourLabel(e.hour)}`}
                  </time>
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
                onClick={() => {
                  setPanel(false);
                  setMessage("");
                }}
              >
                <MilitaryIcon name="close" size={14} />
              </button>
            </div>
            <div ref={panelBodyRef} className={styles.panelBody}>
              {!setup && (
                <EasyPlayMode
                  simple={simple}
                  onChange={(value) => {
                    changePresentation(value);
                    setTab("command");
                  }}
                />
              )}
              {message && (
                <div role="status" className={styles.notice}>
                  <span>{message}</span>
                  <button
                    aria-label="Bildirimi kapat"
                    onClick={() => setMessage("")}
                  >
                    <MilitaryIcon name="close" size={14} />
                  </button>
                </div>
              )}
              {tab === "command" ? (
                <CommandCenter
                  key={`command:${campaignRevision}:${shown.player}`}
                  world={shown}
                  command={command}
                  onTab={setTab}
                  simple={simple}
                  paused={paused}
                  onResume={() => setPaused(false)}
                  onShowMap={() => setPanel(false)}
                  onBuild={() => {
                    const owned = Object.values(shown.provinces).filter(
                      (province) => province.controller === shown.player,
                    );
                    const province =
                      owned.find((item) => item.id === selected) ??
                      owned.find((item) => item.id === c.capital) ??
                      owned[0];
                    if (province) setSelected(province.id);
                    setTab("province");
                  }}
                  selectedGeneralId={guideGeneralId}
                  onSelectedGeneralChange={setGuideGeneralId}
                  onDiplomacy={(country) => {
                    setTarget(country);
                    setTab("diplomacy");
                  }}
                />
              ) : tab === "saves" && world ? (
                <Saves
                  world={world}
                  onLoadSaved={restoreSaved}
                  onImport={importSaved}
                  onMessage={say}
                />
              ) : (
                <WarPanels
                  key={`${campaignRevision}:${shown.player}`}
                  world={shown}
                  simple={simple}
                  tab={tab}
                  selected={selected}
                  armyId={armyId}
                  armyIds={selectedArmyIds}
                  target={target}
                  onTarget={setTarget}
                  preferredRecruitmentProvince={recruitProvince}
                  onRecruitmentProvinceChange={setRecruitProvince}
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
              {!setup && tab === "command" && (
                <SimulationMetrics metrics={diagnostics} />
              )}
              {!setup && (
                <div className={styles.campaignNote}>
                  <Meter
                    label="Ülkenin teslimiyet riski"
                    value={surrender(shown, c.id)}
                    color="#c78369"
                  />
                  <details open={!simple}>
                    <summary>Sefer bilgileri ve çevrimdışı durum</summary>
                    <p>{offline}</p>
                    <small>
                      Dünya 1936 · Yaklaşık tarihsel sınırlar, şehir merkezli
                      stratejik bölgeler. Veriler oyun ölçeğine uyarlanmıştır.
                    </small>
                  </details>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      {!setup && (
        <CommanderBar
          key={`commanders:${campaignRevision}:${shown.player}`}
          world={shown}
          disabled={transition !== null}
          paused={paused}
          command={command}
          onSelect={(ids) => {
            setArmyIds(ids);
            const general = shown.armies.find((army) =>
              ids.includes(army.id),
            )?.general;
            if (general) setGuideGeneralId(general);
            setOrder(null);
            setFrontPoints([]);
            setPanel(false);
          }}
        />
      )}
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
              DÜNYA, <em>1936.</em>
            </h2>
            <p className={styles.setupIntro}>
              Bir ulusun geleceğini yönet.
              <br />
              Sanayini kur, diplomasiyi şekillendir, cephelerini savun.
            </p>
            <EasyPlayMode simple={simple} onChange={changePresentation} />
            <p className={styles.hint}>
              {simple
                ? "Tümen eğit, yapı kur, teknoloji seç; komutanını sınırına yerleştir. Her önemli seçimi sen yaparsın."
                : "Ülke istatistikleri ve ayrıntılı öneriler doğrudan gösterilir. İstediğin zaman kolay yönetime dönebilirsin."}{" "}
              Hava ve deniz kuvvetlerini Hava / Deniz panelinden yönetebilirsin.
              Siyaset için Tüm ayrıntılar görünümünü aç. Görünüm seçimi oyun
              kurallarını veya yönetim yardımcısı ayarlarını değiştirmez.
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
                <option value="hard">Çok zor · etkin cephe komutası</option>
              </select>
              <small>
                Çok zorda botlar cepheyi 6 oyun saatinde bir değerlendirir,
                başkentlerini korur ve birlikte saldırır. Zorluğu sefer
                sırasında değiştirebilirsin.
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
                      onClick={() => restoreSaved(s.slot)}
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
            <Link className={styles.textButton} href="/" prefetch={false}>
              ← XARMY oyunları
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
