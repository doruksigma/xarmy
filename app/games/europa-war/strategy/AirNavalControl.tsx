"use client";
import { useState } from "react";
import { AIRCRAFT, AIR_MISSIONS, SEA_ZONES, SHIPS } from "./advanced-catalog";
import { wingEfficiency } from "./airnaval";
import { mapDistance } from "./geography-distance";
import { effectiveAutomationEnabled } from "./management";
import { seaControl, shipOperational } from "./military-assets";
import {
  previewAirOrder,
  previewNavalOrder,
  navalOrderMatches,
} from "./manual-airnaval-orders";
import MilitaryIcon from "./MilitaryIcon";
import { atWar, friendly, GEOGRAPHY } from "./world";
import type {
  Action,
  AirMission,
  AirModel,
  AirWing,
  SeaZone,
  ShipModel,
  Warship,
  World,
} from "./types";
import styles from "./air-naval-control.module.css";

type Props = {
  w: World;
  command: (action: Action) => void;
  target: string;
  requestedTheater?: { kind: "air" | "naval"; revision: number };
};
const number = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const navalNames: Record<Warship["mission"], string> = {
  idle: "Limanda bekle",
  patrol: "Devriye",
  escort: "Konvoyları koru",
  raid: "Konvoy baskını",
};
const airEffects: Record<AirMission, string> = {
  idle: "Uçuş durur, kanat üste hazırlanır. Saldırı veya destek üretmez.",
  superiority:
    "Menzilindeki düşman uçaklarıyla savaşır; kara desteğinin ve hava indirmesinin güvenliğini artırır.",
  support:
    "Hedef çevresindeki, menzile giren gerçek kara muharebelerine saldırı desteği verir.",
  strategic:
    "Hedef düşman bölgesindeki altyapı ve tesislere hasar vererek üretim ve ikmali azaltır.",
  naval:
    "Seçilen düşman limanının deniz bölgesindeki görevdeki düşman gemilerine saldırır.",
  recon:
    "Hedef ülke hakkında istihbarat sağlar; savaş uçakları gibi kara hasarı üretmez.",
  transport:
    "Hava indirme için taşıma kapasitesi hazırlar. Paraşüt emrini Ordu ekranından ayrıca ver.",
};
const navalEffects: Record<Warship["mission"], string> = {
  idle: "Gemi ana limanına döner. Güvenli limanda tersane ve çelik varsa gövdesi onarılır.",
  patrol:
    "Bölgedeki düşman donanmasıyla savaşır; deniz üstünlüğü geçiş ve ikmal yollarını destekler.",
  escort:
    "Bölgedeki ticaret yollarını düşman denizaltı baskınlarına karşı korur ve deniz savaşına katılır.",
  raid: "Bölgeden geçen düşman deniz ticaretinin teslimatını azaltır; eskortlarla karşılaşabilir.",
};
function Notices({
  error,
  warnings,
}: {
  error: string | null;
  warnings: string[];
}) {
  return (
    <div aria-live="polite">
      {error && (
        <p className={styles.warning} role="status">
          {error}
        </p>
      )}
      {warnings.map((message) => (
        <p className={styles.warning} key={message}>
          {message}
        </p>
      ))}
    </div>
  );
}

function AirOrderEditor({
  w,
  command,
  target: targetCountry,
  wing,
}: Props & { wing: AirWing }) {
  const country = w.countries[w.player];
  const [base, setBase] = useState(wing.base),
    [mission, setMission] = useState<AirMission>(wing.mission),
    [target, setTarget] = useState(wing.target),
    [search, setSearch] = useState("");
  const bases = Object.values(w.provinces).filter(
    (p) => friendly(w, country.id, p.controller) && p.buildings.airfield > 0,
  );
  const order = { base, mission, target: mission === "idle" ? base : target };
  const preview = previewAirOrder(w, country, wing, order);
  const candidates = Object.values(w.provinces)
    .filter((p) => {
      if (p.id === target) return true;
      const accessible =
        friendly(w, country.id, p.controller) ||
        atWar(w, country.id, p.controller);
      const allowed = ["strategic", "naval"].includes(mission)
        ? atWar(w, country.id, p.controller)
        : accessible;
      return allowed && (mission !== "naval" || GEOGRAPHY[p.id].port);
    })
    .sort(
      (a, b) =>
        mapDistance(GEOGRAPHY[base], GEOGRAPHY[a.id]) -
          mapDistance(GEOGRAPHY[base], GEOGRAPHY[b.id]) ||
        a.id.localeCompare(b.id),
    );
  const query = search.toLocaleLowerCase("tr-TR").trim();
  const filtered = candidates.filter(
    (p) =>
      p.id === target ||
      `${GEOGRAPHY[p.id].name} ${w.countries[p.controller].name}`
        .toLocaleLowerCase("tr-TR")
        .includes(query),
  );
  const nearestTarget = candidates.find(
    (p) =>
      p.controller === targetCountry &&
      !previewAirOrder(w, country, wing, {
        base,
        mission:
          mission === "idle" ? AIRCRAFT[wing.model].missions[0] : mission,
        target: p.id,
      }).error,
  );
  const same =
    wing.base === order.base &&
    wing.mission === order.mission &&
    wing.target === order.target;
  return (
    <div className={styles.editor} data-testid="manual-air-orders">
      <div
        className={styles.current}
        data-testid="current-air-order"
        data-wing={wing.id}
        data-mission={wing.mission}
        data-target={wing.target}
        data-base={wing.base}
      >
        <strong>{wing.name}</strong>
        <span>
          {number(wing.count)} / {wing.size} uçak · Hazırlık %
          {Math.round(wing.readiness)}
        </span>
        <span>
          Kaydedilmiş emir: {AIR_MISSIONS[wing.mission]} ·{" "}
          {GEOGRAPHY[wing.target].name}
        </span>
        <span>
          {wing.mission === "idle"
            ? "Üste bekliyor"
            : `Sonraki uçuş için etkinlik: %${Math.round(wingEfficiency(w, country, wing) * 100)}`}
        </span>
      </div>
      <label>
        1. Hava üssü
        <select
          aria-label="Hava üssü"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        >
          {!bases.some((p) => p.id === base) && (
            <option value={base} disabled>
              {GEOGRAPHY[base].name} · üs kullanılamıyor
            </option>
          )}
          {bases.map((p) => (
            <option key={p.id} value={p.id}>
              {GEOGRAPHY[p.id].name} · {p.buildings.airfield * 100} uçak
              kapasiteli
            </option>
          ))}
        </select>
      </label>
      <label>
        2. Görev
        <select
          aria-label="Görev"
          value={mission}
          onChange={(e) => setMission(e.target.value as AirMission)}
        >
          {["idle" as const, ...AIRCRAFT[wing.model].missions].map((id) => (
            <option key={id} value={id}>
              {AIR_MISSIONS[id]}
            </option>
          ))}
        </select>
      </label>
      {mission !== "idle" && (
        <>
          <label>
            Hava hedefi ara
            <input
              type="search"
              value={search}
              placeholder="Şehir veya ülke adı"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            3. Hedef bölge
            <select
              aria-label="Hedef bölge"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {filtered.map((p) => {
                const far =
                  mapDistance(GEOGRAPHY[base], GEOGRAPHY[p.id]) > preview.range;
                return (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={far && p.id !== target}
                  >
                    {GEOGRAPHY[p.id].name} · {w.countries[p.controller].name}
                    {far ? " · menzil dışında" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            disabled={!nearestTarget}
            onClick={() => {
              if (nearestTarget) {
                setSearch("");
                setTarget(nearestTarget.id);
              }
            }}
          >
            Seçili ülkede uygun hedef bul
          </button>
        </>
      )}
      <p className={styles.effect}>{airEffects[mission]}</p>
      <div className={styles.metrics}>
        <span>
          Günlük yakıt <b>{number(preview.fuelPerDay)}</b>
        </span>
        <span>
          Yakıt stoku <b>{number(country.stock.fuel)}</b>
        </span>
        {mission !== "idle" && (
          <span>
            Menzil kullanımı{" "}
            <b>%{Math.round((preview.distance / preview.range) * 100)}</b>
          </span>
        )}
      </div>
      <Notices error={preview.error} warnings={preview.warnings} />
      <button
        className={styles.primary}
        data-testid="apply-air-order"
        disabled={!!preview.error || same}
        onClick={() => command({ type: "wing", id: wing.id, ...order })}
      >
        {same ? "Hava emri uygulanıyor" : "Hava görevini uygula"}
      </button>
      <p className={styles.note}>
        Seçimler bu düğmeye basana kadar emri değiştirmez. Uçuş sonuçları oyun
        günü tamamlanınca aşağıdaki rapora işlenir.
      </p>
      <div className={styles.buttons}>
        <button
          disabled={wing.mission === "idle"}
          onClick={() =>
            command({
              type: "wing",
              id: wing.id,
              base: wing.base,
              target: wing.base,
              mission: "idle",
            })
          }
        >
          Uçuşu durdur
        </button>
        <button
          disabled={!friendly(w, country.id, w.provinces[wing.base].controller)}
          onClick={() => command({ type: "disbandWing", id: wing.id })}
        >
          Uçakları yedeğe al
        </button>
      </div>
    </div>
  );
}

function NavalOrderEditor({ w, command, ship }: Props & { ship: Warship }) {
  const country = w.countries[w.player];
  const [zone, setZone] = useState<SeaZone>(ship.zone),
    [mission, setMission] = useState<Warship["mission"]>(ship.mission);
  const preview = previewNavalOrder(w, country, ship, { zone, mission });
  const returnPreview = previewNavalOrder(w, country, ship, {
    zone: ship.zone,
    mission: "idle",
  });
  const same = navalOrderMatches(ship, mission, preview);
  return (
    <div className={styles.editor} data-testid="manual-naval-orders">
      <div
        className={styles.current}
        data-testid="current-naval-order"
        data-ship={ship.id}
        data-mission={ship.mission}
        data-zone={ship.zone}
      >
        <strong>{ship.name}</strong>
        <span>
          Gövde %{Math.round(ship.health)} · {SEA_ZONES[ship.zone].name}
        </span>
        <span>Kaydedilmiş emir: {navalNames[ship.mission]}</span>
        <span>
          {ship.transit > 0
            ? `İntikal sürüyor · ${ship.transit} oyun günü kaldı`
            : ship.mission === "idle"
              ? "Limanda bekliyor / onarılıyor"
              : shipOperational(w, country, ship)
                ? "Görevde · sonraki günlük harekâta hazır"
                : "Görev verildi · yakıt, liman veya boğaz erişimi bekleniyor"}
        </span>
        <span>Ana liman: {GEOGRAPHY[ship.port].name}</span>
      </div>
      <label>
        1. Deniz görevi
        <select
          aria-label="Deniz görevi"
          value={mission}
          disabled={ship.transit > 0}
          onChange={(e) => setMission(e.target.value as Warship["mission"])}
        >
          {(
            [
              "idle",
              "patrol",
              "escort",
              ...(ship.model === "submarine" ? ["raid"] : []),
            ] as Warship["mission"][]
          ).map((id) => (
            <option key={id} value={id}>
              {navalNames[id]}
            </option>
          ))}
        </select>
      </label>
      <label>
        2. Deniz bölgesi
        <select
          aria-label="Deniz bölgesi"
          value={zone}
          disabled={ship.transit > 0 || mission === "idle"}
          onChange={(e) => setZone(e.target.value as SeaZone)}
        >
          {(Object.keys(SEA_ZONES) as SeaZone[]).map((id) => (
            <option key={id} value={id}>
              {SEA_ZONES[id].name}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.effect}>{navalEffects[mission]}</p>
      <div className={styles.metrics}>
        <span>
          İntikal <b>{preview.transitDays} gün</b>
        </span>
        <span>
          İntikal yakıtı <b>{number(preview.transitFuel)}</b>
        </span>
        <span>
          Günlük yakıt <b>{number(preview.fuelPerDay)}</b>
        </span>
        <span>
          Bölgede deniz üstünlüğü{" "}
          <b>%{Math.round(seaControl(w, country.id, preview.zone) * 100)}</b>
        </span>
      </div>
      {preview.route && (
        <p className={styles.note}>
          Rota: {preview.route.map((id) => SEA_ZONES[id].name).join(" → ")}
        </p>
      )}
      <Notices error={preview.error} warnings={preview.warnings} />
      <button
        className={styles.primary}
        data-testid="apply-naval-order"
        disabled={!!preview.error || same}
        onClick={() => command({ type: "ship", id: ship.id, zone, mission })}
      >
        {same ? "Deniz emri uygulanıyor" : "Deniz görevini uygula"}
      </button>
      <p className={styles.note}>
        İntikal tamamlanınca görev başlar. Düşman gemisi veya baskın yapılan
        ticaret rotası yoksa kayıp oluşmaz. Sonuçlar günlük harekât raporunda
        görünür.
      </p>
      <button
        disabled={
          !!returnPreview.error ||
          navalOrderMatches(ship, "idle", returnPreview)
        }
        onClick={() =>
          command({
            type: "ship",
            id: ship.id,
            zone: ship.zone,
            mission: "idle",
          })
        }
      >
        Limana dön
      </button>
      {ship.model === "carrier" && (
        <div className={styles.carrier}>
          <p>
            Güvertede {number(ship.aircraft)} / 30 deniz avcısı · yedek{" "}
            {number(country.equipment.carrierFighter)}
          </p>
          <button
            disabled={
              ship.mission !== "idle" ||
              ship.transit > 0 ||
              ship.aircraft >= 30 ||
              country.equipment.carrierFighter < 1
            }
            onClick={() =>
              command({
                type: "carrierAircraft",
                id: ship.id,
                count: Math.min(
                  30,
                  Math.floor(ship.aircraft + country.equipment.carrierFighter),
                ),
              })
            }
          >
            Yedek avcıları güverteye yükle
          </button>
        </div>
      )}
    </div>
  );
}

function AircraftReserve({ w, command }: Props) {
  const country = w.countries[w.player];
  const [model, setModel] = useState<AirModel>("fighter"),
    [count, setCount] = useState(10),
    [base, setBase] = useState(country.capital);
  const bases = Object.values(w.provinces).filter(
    (p) => friendly(w, country.id, p.controller) && p.buildings.airfield > 0,
  );
  const selectedBase = bases.some((p) => p.id === base)
    ? base
    : (bases[0]?.id ?? "");
  return (
    <details className={styles.reserve} open={!country.air.wings.length}>
      <summary>Yeni hava kanadı kur</summary>
      <p>
        Üretilmiş yedek uçakları bir üsse bağla. Yeni uçak üretimini Sanayi
        ekranından ver.
      </p>
      <label>
        Uçak modeli
        <select
          aria-label="Uçak modeli"
          value={model}
          onChange={(e) => setModel(e.target.value as AirModel)}
        >
          {(Object.keys(AIRCRAFT) as AirModel[]).map((id) => (
            <option key={id} value={id}>
              {AIRCRAFT[id].name} · yedek {number(country.equipment[id])}
            </option>
          ))}
        </select>
      </label>
      <label>
        Üs
        <select
          aria-label="Üs"
          value={selectedBase}
          onChange={(e) => setBase(e.target.value)}
        >
          {bases.map((p) => (
            <option key={p.id} value={p.id}>
              {GEOGRAPHY[p.id].name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Uçak sayısı
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <button
        disabled={
          !selectedBase ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 100 ||
          country.equipment[model] < count ||
          country.air.wings.length >= 40
        }
        onClick={() =>
          command({ type: "createWing", model, count, base: selectedBase })
        }
      >
        Kanat kur
      </button>
      {!bases.length && (
        <p className={styles.warning}>
          Kullanılabilir hava üssü yok. Kendi bölgene hava üssü inşa et.
        </p>
      )}
      {country.equipment[model] < count && (
        <p className={styles.warning}>
          Bu kanat için {count - Math.floor(country.equipment[model])} uçak daha
          gerekiyor.
        </p>
      )}
    </details>
  );
}
function NavalReserve({ w, command }: Props) {
  const country = w.countries[w.player];
  const [model, setModel] = useState<ShipModel>("destroyer");
  const ports = Object.values(w.provinces).filter(
    (p) =>
      p.controller === country.id && GEOGRAPHY[p.id].port && p.id !== "ussr-13",
  );
  const [port, setPort] = useState(ports[0]?.id ?? "");
  const selectedPort = ports.some((p) => p.id === port)
    ? port
    : (ports[0]?.id ?? "");
  return (
    <details className={styles.reserve} open={!country.navy.ships.length}>
      <summary>Tamamlanmış gemiyi filoya kat</summary>
      <p>
        Sanayi ekranında tersaneye gemi üretimi ver. Tamamlanan gemiyi burada
        göreve al.
      </p>
      <label>
        Gemi sınıfı
        <select
          aria-label="Gemi sınıfı"
          value={model}
          onChange={(e) => setModel(e.target.value as ShipModel)}
        >
          {(Object.keys(SHIPS) as ShipModel[]).map((id) => (
            <option key={id} value={id}>
              {SHIPS[id].name} · hazır {Math.floor(country.equipment[id])}
            </option>
          ))}
        </select>
      </label>
      <label>
        Liman
        <select
          aria-label="Liman"
          value={selectedPort}
          onChange={(e) => setPort(e.target.value)}
        >
          {ports.map((p) => (
            <option key={p.id} value={p.id}>
              {GEOGRAPHY[p.id].name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={
          !selectedPort ||
          country.equipment[model] < 1 ||
          country.navy.ships.length >= 120
        }
        onClick={() =>
          command({ type: "commission", model, port: selectedPort })
        }
      >
        Gemiyi filoya kat
      </button>
      {!ports.length && (
        <p className={styles.warning}>Kontrolünde kullanılabilir liman yok.</p>
      )}
      {country.equipment[model] < 1 && (
        <p className={styles.warning}>
          Bu sınıfta tamamlanmış yedek gemi yok. Önce tersanede üret.
        </p>
      )}
    </details>
  );
}

export default function AirNavalControl(props: Props) {
  const { w, command } = props,
    country = w.countries[w.player];
  const [branch, setBranch] = useState<"air" | "navy">(
      props.requestedTheater?.kind === "naval" ? "navy" : "air",
    ),
    [wingId, setWingId] = useState(""),
    [shipId, setShipId] = useState("");
  const wing =
      country.air.wings.find((item) => item.id === wingId) ??
      country.air.wings[0],
    ship =
      country.navy.ships.find((item) => item.id === shipId) ??
      country.navy.ships[0];
  const auto = effectiveAutomationEnabled(country, branch),
    autoLabel =
      branch === "air"
        ? "Hava kuvvetlerini yapay zekâ yönetsin"
        : "Deniz kuvvetlerini yapay zekâ yönetsin";
  return (
    <section
      className={styles.control}
      data-testid="air-navy-control"
      aria-label="Hava ve deniz komutası"
    >
      <div className={styles.tabs} role="group" aria-label="Yönetilecek kuvvet">
        <button
          data-testid="air-control-tab"
          aria-pressed={branch === "air"}
          onClick={() => setBranch("air")}
        >
          <MilitaryIcon name="plane" /> Hava kuvvetleri{" "}
          <small>{country.air.wings.length} kanat</small>
        </button>
        <button
          data-testid="naval-control-tab"
          aria-pressed={branch === "navy"}
          onClick={() => setBranch("navy")}
        >
          <MilitaryIcon name="navy" /> Donanma{" "}
          <small>{country.navy.ships.length} gemi</small>
        </button>
      </div>
      <label className={styles.automation}>
        <input
          type="checkbox"
          role="switch"
          aria-label={autoLabel}
          checked={auto}
          onChange={(e) =>
            command({
              type: "automation",
              area: branch,
              enabled: e.target.checked,
            })
          }
        />
        <span>
          {autoLabel}
          <small>
            {auto
              ? "Yardımcı açık · haftalık kararlar emirleri değiştirebilir"
              : "Manuel kontrol · bütün görevleri sen veriyorsun"}
          </small>
        </span>
      </label>
      <p className={styles.note}>
        Kuvveti seç → görev ve hedefi belirle → uygula. Yardımcıyı kapatmak
        devam eden görevleri durdurmaz.
      </p>
      {branch === "air" ? (
        <>
          <label>
            Yönetilecek hava kanadı
            <select
              aria-label="Yönetilecek hava kanadı"
              value={wing?.id ?? ""}
              disabled={!wing}
              onChange={(e) => setWingId(e.target.value)}
            >
              {!wing && <option value="">Önce hava kanadı kur</option>}
              {country.air.wings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {Math.floor(item.count)} uçak ·{" "}
                  {AIR_MISSIONS[item.mission]}
                </option>
              ))}
            </select>
          </label>
          {wing && (
            <AirOrderEditor
              key={`${wing.id}:${wing.base}:${wing.mission}:${wing.target}`}
              {...props}
              wing={wing}
            />
          )}
          <AircraftReserve {...props} />
        </>
      ) : (
        <>
          <label>
            Yönetilecek gemi
            <select
              aria-label="Yönetilecek gemi"
              value={ship?.id ?? ""}
              disabled={!ship}
              onChange={(e) => setShipId(e.target.value)}
            >
              {!ship && <option value="">Önce gemiyi filoya kat</option>}
              {country.navy.ships.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · %{Math.floor(item.health)} gövde ·{" "}
                  {navalNames[item.mission]}
                </option>
              ))}
            </select>
          </label>
          {ship && (
            <NavalOrderEditor
              key={`${ship.id}:${ship.zone}:${ship.mission}:${ship.port}`}
              {...props}
              ship={ship}
            />
          )}
          <NavalReserve {...props} />
        </>
      )}
    </section>
  );
}
