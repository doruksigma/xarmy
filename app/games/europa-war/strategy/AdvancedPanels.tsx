"use client";
import { useState } from "react";
import {
  AIRCRAFT,
  AIR_MISSIONS,
  cabinetOptions,
  SEA_ZONES,
  SHIPS,
  SUPPORT,
} from "./advanced-catalog";
import { EQUIPMENT } from "./catalog";
import { wingEfficiency } from "./airnaval";
import { provincePrice } from "./conference";
import { DECISIONS } from "./decisions";
import { seaControl } from "./military-assets";
import { controlled, dateLabel, friendly, GEOGRAPHY } from "./world";
import type {
  Action,
  AirMission,
  AirModel,
  Country,
  OffensivePlan,
  SeaZone,
  ShipModel,
  SupportType,
  World,
} from "./types";
import styles from "../europa.module.css";

type Props = { w: World; command: (a: Action) => void };
export function ArmyTools({
  w,
  command,
  armyId,
  onOffensive,
}: Props & {
  armyId: string | null;
  onOffensive: (armies: string[], stance: OffensivePlan["stance"]) => void;
}) {
  const own = w.armies.filter((a) => a.country === w.player),
    a = own.find((a) => a.id === armyId),
    c = w.countries[w.player];
  const [selected, setSelected] = useState<string[]>([]),
    [stance, setStance] = useState<OffensivePlan["stance"]>("balanced");
  return (
    <>
      {a && (
        <details className={styles.fold}>
          <summary>Tümen desteği · {a.support.length}/3</summary>
          {(
            Object.entries(SUPPORT) as [
              SupportType,
              (typeof SUPPORT)[SupportType],
            ][]
          ).map(([id, d]) => (
            <div className={styles.mission} key={id}>
              <h4>
                {d.name} {a.support.includes(id) && "✓"}
              </h4>
              <p>{d.description}</p>
              <button
                disabled={
                  !a.support.includes(id) &&
                  !!d.tech &&
                  !c.tech.includes(d.tech)
                }
                onClick={() =>
                  command({
                    type: "support",
                    army: a.id,
                    support: id,
                    remove: a.support.includes(id),
                  })
                }
              >
                {a.support.includes(id)
                  ? "Desteği çıkar · ekipmanın yarısı geri döner"
                  : "Tümene ekle"}
              </button>
            </div>
          ))}
          <p>
            Takviyeler artık tümenin tank, top, kamyon ve destek ekipmanlarını
            da tüketir.
          </p>
        </details>
      )}
      <details className={styles.fold} open>
        <summary>Birlikte taarruz planla</summary>
        <p>
          Tümenleri seç, hedeflerini haritada işaretle. Plan ikmal ve düşman
          gücünü değerlendirerek ilerler.
        </p>
        <div className={styles.buttonRow}>
          <button onClick={() => setSelected(own.map((a) => a.id))}>
            Tüm tümenleri seç
          </button>
          <button onClick={() => setSelected([])}>Seçimi temizle</button>
        </div>
        <div className={styles.unitChoices}>
          {own.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, a.id]
                      : ids.filter((id) => id !== a.id),
                  )
                }
              />
              {a.name}
              <small>{GEOGRAPHY[a.province].name}</small>
            </label>
          ))}
        </div>
        <label className={styles.field}>
          İlerleme yaklaşımı
          <select
            value={stance}
            onChange={(e) =>
              setStance(e.target.value as OffensivePlan["stance"])
            }
          >
            <option value="careful">Temkinli · üstünlük bekle</option>
            <option value="balanced">Dengeli · fırsatları değerlendir</option>
            <option value="aggressive">Agresif · daha fazla kayıp riski</option>
          </select>
        </label>
        <button
          className={styles.primary}
          disabled={
            !selected.some((id) => own.some((a) => a.id === id)) ||
            !c.wars.length
          }
          onClick={() =>
            onOffensive(
              selected.filter((id) => own.some((a) => a.id === id)),
              stance,
            )
          }
        >
          Haritada taarruz hedeflerini çiz
        </button>
        {!c.wars.length && (
          <p>
            Taarruz hedefi için savaşta olduğun bir ülke gerekir. Barışta
            savunma hattı hazırlayabilirsin.
          </p>
        )}
      </details>
      {w.plans
        .filter((p) => p.country === c.id)
        .map((p) => (
          <article key={p.id} className={styles.card}>
            <h3>{p.name}</h3>
            <p>
              {p.armies.length} tümen ·{" "}
              {p.active ? "İlerliyor" : "Hazırlanıyor"} · Hazırlık %
              {Math.floor(p.preparation)}
            </p>
            <progress
              value={p.preparation}
              max={100}
              aria-label="Taarruz hazırlığı"
            />
            <p>{p.objectives.map((id) => GEOGRAPHY[id].name).join(" → ")}</p>
            <div className={styles.buttonRow}>
              <button
                disabled={!p.active && p.preparation < 30}
                onClick={() =>
                  command({
                    type: "plan",
                    id: p.id,
                    kind: p.active ? "pause" : "start",
                  })
                }
              >
                {p.active ? "Taarruzu durdur" : "Taarruzu başlat"}
              </button>
              <button
                onClick={() =>
                  command({ type: "plan", id: p.id, kind: "delete" })
                }
              >
                Planı kaldır
              </button>
            </div>
          </article>
        ))}
    </>
  );
}
export function AirNavalPanel({
  w,
  command,
  target,
}: Props & { target: string }) {
  const c = w.countries[w.player],
    bases = Object.values(w.provinces).filter(
      (p) => friendly(w, c.id, p.controller) && p.buildings.airfield > 0,
    ),
    ports = controlled(w, c.id).filter(
      (p) => GEOGRAPHY[p.id].port && p.id !== "ussr-13",
    );
  const [model, setModel] = useState<AirModel>("fighter"),
    [count, setCount] = useState(10),
    [base, setBase] = useState(c.capital),
    [shipModel, setShipModel] = useState<ShipModel>("destroyer"),
    [port, setPort] = useState(ports[0]?.id ?? "");
  const defaultTarget = w.countries[target]?.capital ?? c.capital;
  return (
    <>
      <details className={styles.fold} open>
        <summary>Hava kanatları · {c.air.wings.length}</summary>
        <p>
          Her kanadın üssü, menzili ve görevi ayrıdır. Sağlam ve yeterli
          büyüklükte üsler uçuşları verimli kılar.
        </p>
        {c.air.wings.map((wing) => (
          <div key={wing.id} className={styles.card}>
            <h4>{wing.name}</h4>
            <p>
              {Math.floor(wing.count)}/{wing.size} uçak · Hazırlık %
              {Math.round(wing.readiness)} · Görev etkinliği %
              {Math.round(wingEfficiency(w, c, wing) * 100)}
            </p>
            <label className={styles.field}>
              Hava üssü
              <select
                aria-label="Hava üssü"
                value={wing.base}
                onChange={(e) =>
                  command({
                    type: "wing",
                    id: wing.id,
                    base: e.target.value,
                    target: wing.target,
                    mission: "idle",
                  })
                }
              >
                {bases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {GEOGRAPHY[p.id].name} · {p.buildings.airfield * 100} uçak
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Hedef bölge
              <select
                aria-label="Hedef bölge"
                value={wing.target}
                onChange={(e) =>
                  command({
                    type: "wing",
                    id: wing.id,
                    mission: wing.mission,
                    target: e.target.value,
                  })
                }
              >
                {Object.values(w.provinces)
                  .filter(
                    (p) =>
                      friendly(w, c.id, p.controller) ||
                      c.wars.includes(p.controller),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {GEOGRAPHY[p.id].name} · {w.countries[p.controller].name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              Görev
              <select
                aria-label="Görev"
                value={wing.mission}
                onChange={(e) =>
                  command({
                    type: "wing",
                    id: wing.id,
                    target: wing.target,
                    mission: e.target.value as AirMission,
                  })
                }
              >
                {["idle" as const, ...AIRCRAFT[wing.model].missions].map(
                  (m) => (
                    <option key={m} value={m}>
                      {AIR_MISSIONS[m]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className={styles.buttonRow}>
              <button
                onClick={() =>
                  command({
                    type: "wing",
                    id: wing.id,
                    mission: "idle",
                    target: defaultTarget,
                  })
                }
              >
                Seçili ülkeye yönlendir
              </button>
              <button
                onClick={() => command({ type: "disbandWing", id: wing.id })}
              >
                Uçakları yedeğe al
              </button>
            </div>
          </div>
        ))}
        <details className={styles.fold}>
          <summary>Yeni hava kanadı kur</summary>
          <label className={styles.field}>
            Uçak modeli
            <select
              aria-label="Uçak modeli"
              value={model}
              onChange={(e) => setModel(e.target.value as AirModel)}
            >
              {(Object.keys(AIRCRAFT) as AirModel[]).map((m) => (
                <option key={m} value={m}>
                  {AIRCRAFT[m].name} · yedek {Math.floor(c.equipment[m])}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Üs
            <select
              aria-label="Üs"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            >
              {bases.map((p) => (
                <option key={p.id} value={p.id}>
                  {GEOGRAPHY[p.id].name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
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
              !bases.length ||
              c.equipment[model] < count ||
              count < 1 ||
              count > 100
            }
            onClick={() => command({ type: "createWing", model, count, base })}
          >
            Kanat kur
          </button>
        </details>
      </details>
      <details className={styles.fold}>
        <summary>
          Donanma ve deniz bölgeleri · {c.navy.ships.length} gemi
        </summary>
        <div className={styles.seaStatus}>
          {(Object.keys(SEA_ZONES) as SeaZone[]).map((z) => (
            <div key={z}>
              <span>{SEA_ZONES[z].name}</span>
              <strong>%{Math.round(seaControl(w, c.id, z) * 100)}</strong>
            </div>
          ))}
        </div>
        <p>
          Deniz üstünlüğü, açık boğazlar ve eskortlar ikmali korur. Hasarlı
          gemiler güvenli limanda çelik ve tersane kapasitesiyle onarılır.
        </p>
        {c.navy.ships.map((ship) => (
          <div className={styles.card} key={ship.id}>
            <h4>{ship.name}</h4>
            <p>
              Gövde %{Math.floor(ship.health)} · {SEA_ZONES[ship.zone].name}
              {ship.transit > 0 ? ` · ${ship.transit} gün intikal` : ""}
            </p>
            <label className={styles.field}>
              Deniz bölgesi
              <select
                aria-label="Deniz bölgesi"
                value={ship.zone}
                disabled={ship.transit > 0}
                onChange={(e) =>
                  command({
                    type: "ship",
                    id: ship.id,
                    mission: ship.mission === "idle" ? "patrol" : ship.mission,
                    zone: e.target.value as SeaZone,
                  })
                }
              >
                {(Object.keys(SEA_ZONES) as SeaZone[]).map((z) => (
                  <option key={z} value={z}>
                    {SEA_ZONES[z].name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.buttonRow}>
              {(
                [
                  ["idle", "Limana dön"],
                  ["patrol", "Devriye"],
                  ["escort", "Eskort"],
                  ...(ship.model === "submarine"
                    ? [["raid", "Konvoy baskını"]]
                    : []),
                ] as ["idle" | "patrol" | "escort" | "raid", string][]
              ).map(([mission, name]) => (
                <button
                  key={mission}
                  className={ship.mission === mission ? styles.active : ""}
                  disabled={ship.transit > 0}
                  onClick={() =>
                    command({
                      type: "ship",
                      id: ship.id,
                      zone: ship.zone,
                      mission,
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            {ship.model === "carrier" && (
              <>
                <p>Güvertede {Math.floor(ship.aircraft)}/30 deniz avcısı</p>
                <button
                  disabled={ship.mission !== "idle" || ship.transit > 0}
                  onClick={() =>
                    command({
                      type: "carrierAircraft",
                      id: ship.id,
                      count: Math.min(
                        30,
                        Math.floor(ship.aircraft + c.equipment.carrierFighter),
                      ),
                    })
                  }
                >
                  Yedek avcıları güverteye yükle
                </button>
              </>
            )}
          </div>
        ))}
        <details className={styles.fold}>
          <summary>Tamamlanmış gemiyi filoya kat</summary>
          <label className={styles.field}>
            Gemi sınıfı
            <select
              value={shipModel}
              onChange={(e) => setShipModel(e.target.value as ShipModel)}
            >
              {(Object.keys(SHIPS) as ShipModel[]).map((m) => (
                <option key={m} value={m}>
                  {SHIPS[m].name} · hazır {Math.floor(c.equipment[m])}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Liman
            <select value={port} onChange={(e) => setPort(e.target.value)}>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {GEOGRAPHY[p.id].name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!ports.length || c.equipment[shipModel] < 1}
            onClick={() =>
              command({ type: "commission", model: shipModel, port })
            }
          >
            Filoya kat
          </button>
        </details>
      </details>
    </>
  );
}
export function PeacePanel({ w, command, target }: Props & { target: string }) {
  const c = w.countries[w.player];
  const [kind, setKind] = useState<"annex" | "puppet" | "liberate">("annex");
  const conferences = w.conferences.filter(
    (q) => q.status === "open" && q.participants.includes(c.id),
  );
  const canRelease = Object.values(w.provinces).some(
    (p) =>
      p.owner === c.id &&
      p.controller === c.id &&
      GEOGRAPHY[p.id].country === target,
  );
  return (
    <>
      {conferences.map((q) => (
        <div key={q.id} className={styles.card}>
          <div className={styles.eyebrow}>BARIŞ KONFERANSI · TUR {q.round}</div>
          <h3>{w.countries[q.defeated].name}</h3>
          <p>
            {q.participants[q.turn] === c.id
              ? "Söz sende."
              : `${w.countries[q.participants[q.turn]].name} düşünüyor. Zamanı ilerlet.`}{" "}
            Kullanılabilir puanın: {Math.floor(q.points[c.id])}
          </p>
          <p>
            Katılımcılar:{" "}
            {q.participants
              .map(
                (id) => `${w.countries[id].name} (${Math.floor(q.points[id])})`,
              )
              .join(" · ")}
          </p>
          <label className={styles.field}>
            Bölgenin geleceği
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="annex">Ülkeme kat</option>
              <option value="puppet">Bağlı yönetim kur</option>
              <option value="liberate">Bağımsız bırak</option>
            </select>
          </label>
          <div className={styles.peaceRegions}>
            {q.available.map((id) => (
              <button
                key={id}
                disabled={
                  q.participants[q.turn] !== c.id ||
                  q.points[c.id] < provincePrice(id)
                }
                onClick={() =>
                  command({
                    type: "peaceClaim",
                    conference: q.id,
                    province: id,
                    kind,
                  })
                }
              >
                <span>{GEOGRAPHY[id].name}</span>
                <b>{provincePrice(id)} puan</b>
              </button>
            ))}
          </div>
          <button
            disabled={q.participants[q.turn] !== c.id}
            onClick={() => command({ type: "peacePass", conference: q.id })}
          >
            Pas geç · sonraki tur için puan biriktir
          </button>
          <p>
            Kararlar bütün bölgeler görüşüldüğünde uygulanır. 25 tur sonunda
            kalan bölgeler bağımsız bırakılır.
          </p>
          {q.awards.length > 0 && (
            <details>
              <summary>Karara bağlanan bölgeler ({q.awards.length})</summary>
              {q.awards.map((a) => (
                <p key={a.province}>
                  {GEOGRAPHY[a.province].name}:{" "}
                  {a.kind === "annex"
                    ? w.countries[a.country].name
                    : a.kind === "puppet"
                      ? `${w.countries[a.country].name} bağlı yönetimi`
                      : "Bağımsızlık"}
                </p>
              ))}
            </details>
          )}
        </div>
      ))}
      {canRelease && (
        <div className={styles.card}>
          <h3>Bağımsızlığı yeniden tanı</h3>
          <p>
            {w.countries[target].name} ülkesinin elindeki tarihsel bölgelerini
            geri ver.
          </p>
          <button onClick={() => command({ type: "release", country: target })}>
            Toprakları bırak ve bağımsızlık ver
          </button>
        </div>
      )}
    </>
  );
}
export function CabinetPanel({
  w,
  command,
  target,
}: Props & { target: string }) {
  const c = w.countries[w.player];
  return (
    <>
      <details className={styles.fold}>
        <summary>Kabine ve araştırma kurumları</summary>
        <p>
          Her atama 35 siyasi güç tüketir. Görevlerin etkileri birlikte
          uygulanır.
        </p>
        {(["economy", "military", "science"] as const).map((slot) => (
          <div key={slot}>
            <h4>
              {
                {
                  economy: "Ekonomi bakanlığı",
                  military: "Genelkurmay",
                  science: "Araştırma kurumu",
                }[slot]
              }
            </h4>
            {cabinetOptions(c.id, slot).map((o) => (
              <button
                key={o.id}
                className={`${styles.cabinetOption} ${c.cabinet[slot] === o.id ? styles.active : ""}`}
                disabled={c.cabinet[slot] === o.id || c.political < 35}
                onClick={() => command({ type: "cabinet", slot, id: o.id })}
              >
                <strong>{o.name}</strong>
                <small>
                  {o.description}
                  {c.cabinet[slot] === o.id ? " · görevde" : ""}
                </small>
              </button>
            ))}
          </div>
        ))}
      </details>
      <details className={styles.fold}>
        <summary>Ülke kararları ve kriz yönetimi</summary>
        {Object.entries(DECISIONS).map(([id, d]) => (
          <div className={styles.mission} key={id}>
            <h4>{d.name}</h4>
            <p>{d.text}</p>
            {id === "crisisTalks" && (
              <p>Seçili hedef: {w.countries[target]?.name}</p>
            )}
            <button
              disabled={
                (c.decisions[id] ?? 0) > w.day ||
                c.treasury < d.money ||
                c.political < d.political ||
                (id === "warBonds" && !c.wars.length)
              }
              onClick={() => command({ type: "decision", id, target })}
            >
              {(c.decisions[id] ?? 0) > w.day
                ? `${dateLabel(c.decisions[id])} tarihinde tekrar`
                : "Kararı uygula"}
            </button>
          </div>
        ))}
      </details>
    </>
  );
}
