"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BUILDINGS, EQUIPMENT, RESOURCES, TECHNOLOGIES } from "./catalog";
import { ECONOMIES } from "./economy";
import { productionPlan } from "./production";
import { capacity, GEOGRAPHY } from "./world";
import MilitaryIcon, {
  buildingIcon,
  equipmentIcon,
  resourceIcon,
} from "./MilitaryIcon";
import EquipmentIllustration from "./EquipmentIllustration";
import type { Action, Country, Equipment, Resource, World } from "./types";
import styles from "./production-panel.module.css";

const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as Equipment[];
const AIR = new Set<Equipment>([
  "fighter",
  "bomber",
  "strategicBomber",
  "reconPlane",
  "transport",
  "carrierFighter",
]);
const format = (value: number, digits = 0) =>
  value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
const percent = (value: number) => Math.max(0, Math.min(100, value));
type Filter = "all" | "land" | "air" | "naval";
const FILTERS: [Filter, string][] = [
  ["all", "Tümü"],
  ["land", "Kara"],
  ["air", "Hava"],
  ["naval", "Deniz"],
];
const matches = (id: Equipment, filter: Filter) =>
  filter === "all" ||
  (filter === "naval"
    ? !!EQUIPMENT[id].naval
    : filter === "air"
      ? AIR.has(id)
      : !EQUIPMENT[id].naval && !AIR.has(id));

function HistoryChart({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values),
    min = Math.min(0, ...values);
  return (
    <figure className={styles.chart}>
      <figcaption>
        {label} <b>{format(values.at(-1) ?? 0)}</b>
      </figcaption>
      {values.length > 1 ? (
        <svg viewBox="0 0 300 64" role="img" aria-label={label}>
          <path d="M0 60h300M0 30h300" className={styles.chartGrid} />
          <polyline
            points={values
              .map(
                (value, i) =>
                  `${(i / (values.length - 1)) * 300},${58 - ((value - min) / (max - min)) * 50}`,
              )
              .join(" ")}
          />
        </svg>
      ) : (
        <p>Haftalık veriler zaman ilerledikçe birikecek.</p>
      )}
    </figure>
  );
}

export default function ProductionPanel({
  world,
  command,
  onResearch,
}: {
  world: World;
  command: (action: Action) => void;
  onResearch: () => void;
}) {
  const country = world.countries[world.player];
  const [filter, setFilter] = useState<Filter>("all");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (catalogOpen) catalog.current?.scrollIntoView({ block: "nearest" });
  }, [catalogOpen]);
  const [selected, setSelected] = useState<Equipment>("rifle");
  const [query, setQuery] = useState("");
  const [showLocked, setShowLocked] = useState(true);
  const steps = useMemo(
    () =>
      new Map(
        productionPlan(world, country).map((step) => [step.equipment, step]),
      ),
    [world, country],
  );
  const military = Math.floor(capacity(world, country.id, "military"));
  const docks = Math.floor(capacity(world, country.id, "dock"));
  const usedMilitary = country.production.reduce(
    (sum, line) =>
      sum + (!EQUIPMENT[line.equipment].naval ? line.factories : 0),
    0,
  );
  const usedDocks = country.production.reduce(
    (sum, line) => sum + (EQUIPMENT[line.equipment].naval ? line.factories : 0),
    0,
  );
  const freeMilitary = Math.max(0, military - usedMilitary),
    freeDocks = Math.max(0, docks - usedDocks);
  const lines = country.production.filter((line) =>
    matches(line.equipment, filter),
  );
  const results = EQUIPMENT_IDS.filter(
    (id) =>
      matches(id, filter) &&
      (showLocked ||
        !EQUIPMENT[id].tech ||
        country.tech.includes(EQUIPMENT[id].tech!)) &&
      EQUIPMENT[id].name
        .toLocaleLowerCase("tr-TR")
        .includes(query.toLocaleLowerCase("tr-TR").trim()),
  );
  const selectedDef = EQUIPMENT[selected];
  const selectedLine = country.production.find(
    (line) => line.equipment === selected,
  );
  const selectedLocked =
    !!selectedDef.tech && !country.tech.includes(selectedDef.tech);
  const selectedFree = selectedDef.naval ? freeDocks : freeMilitary;
  const selectedTech = TECHNOLOGIES.find(
    (tech) => tech.id === selectedDef.tech,
  );
  const allocate = (equipment: Equipment, factories: number) =>
    command({ type: "production", equipment, factories });

  return (
    <div className={styles.container}>
      <section className={styles.panel} data-testid="production-panel">
        <header className={styles.heading}>
          <MilitaryIcon name="factory" size={30} />
          <div>
            <small>SANAYİ KOMİSERLİĞİ</small>
            <h2>Üretim</h2>
          </div>
          <span>{country.flag}</span>
        </header>
        <div className={styles.capacity}>
          <div data-testid="production-military-capacity">
            <MilitaryIcon name="factory" />
            <span>
              Askerî fabrika
              <strong>
                {usedMilitary} / {military}
              </strong>
              <small>
                {freeMilitary} boş
                {usedMilitary > military
                  ? ` · ${usedMilitary - military} kapasite dışı`
                  : ""}
              </small>
            </span>
          </div>
          <div data-testid="production-dock-capacity">
            <MilitaryIcon name="navy" />
            <span>
              Tersane
              <strong>
                {usedDocks} / {docks}
              </strong>
              <small>
                {freeDocks} boş
                {usedDocks > docks
                  ? ` · ${usedDocks - docks} kapasite dışı`
                  : ""}
              </small>
            </span>
          </div>
        </div>
        <div className={styles.stocks} aria-label="Stratejik stoklar">
          {Object.entries(RESOURCES).map(([id, name]) => (
            <div key={id} title={name}>
              <MilitaryIcon name={resourceIcon(id as Resource)} size={17} />
              <span>
                {name}
                <b>{format(country.stock[id as Resource])}</b>
              </span>
            </div>
          ))}
        </div>
        <div className={styles.toolbar}>
          <div
            className={styles.filters}
            role="group"
            aria-label="Üretim kategorisi"
          >
            {FILTERS.map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => {
                  setFilter(id);
                  if (!matches(selected, id)) {
                    const next =
                      EQUIPMENT_IDS.find(
                        (equipment) =>
                          matches(equipment, id) &&
                          (!EQUIPMENT[equipment].tech ||
                            country.tech.includes(EQUIPMENT[equipment].tech!)),
                      ) ??
                      EQUIPMENT_IDS.find((equipment) => matches(equipment, id));
                    if (next) setSelected(next);
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.addLine}
            aria-expanded={catalogOpen}
            aria-controls="production-catalog"
            onClick={() => setCatalogOpen((open) => !open)}
          >
            <MilitaryIcon name={catalogOpen ? "minus" : "plus"} size={16} />
            {catalogOpen ? "Kataloğu kapat" : "Yeni üretim hattı"}
          </button>
        </div>
        <p className={styles.hint}>
          Fabrika kutularına basarak kapasite ata. Her gün kaynak tüketilir,
          tamamlanan ekipman depoya girer. Sıfır fabrika, biriken işi koruyarak
          hattı duraklatır.
        </p>
        {catalogOpen && (
          <section
            id="production-catalog"
            ref={catalog}
            className={styles.catalog}
            data-testid="production-catalog"
          >
            <header>
              <h3>Ekipman kataloğu</h3>
              <button
                type="button"
                aria-label="Üretim kataloğunu kapat"
                onClick={() => setCatalogOpen(false)}
              >
                ×
              </button>
            </header>
            <label className={styles.search}>
              Ekipman ara
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tank, uçak, top…"
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={showLocked}
                onChange={(event) => setShowLocked(event.target.checked)}
              />
              Araştırma bekleyen modelleri göster
            </label>
            <div className={styles.catalogList}>
              {results.map((id) => {
                const def = EQUIPMENT[id],
                  locked = !!def.tech && !country.tech.includes(def.tech);
                return (
                  <button
                    type="button"
                    className={styles.catalogItem}
                    key={id}
                    aria-pressed={selected === id}
                    data-equipment={id}
                    onClick={() => setSelected(id)}
                  >
                    <EquipmentIllustration equipment={id} />
                    <span>
                      <strong>{def.name}</strong>
                      <small>
                        {locked
                          ? "Araştırma gerekli"
                          : country.production.some(
                                (line) => line.equipment === id,
                              )
                            ? "Üretim hattı mevcut"
                            : "Üretime hazır"}
                      </small>
                    </span>
                    <MilitaryIcon
                      name={locked ? "research" : "plus"}
                      size={16}
                    />
                  </button>
                );
              })}
              {results.length === 0 && <p>Bu filtreye uygun ekipman yok.</p>}
            </div>
            <section
              className={styles.equipmentDetail}
              data-testid="production-equipment-detail"
            >
              <div className={styles.detailTitle}>
                <EquipmentIllustration equipment={selected} />
                <div>
                  <small>
                    {selectedDef.naval
                      ? "TERSANE MODELİ"
                      : "ASKERÎ ÜRETİM MODELİ"}
                  </small>
                  <h3>{selectedDef.name}</h3>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Üretim bedeli</dt>
                  <dd>{selectedDef.cost} puan / adet</dd>
                </div>
                <div>
                  <dt>Mevcut stok</dt>
                  <dd>{format(country.equipment[selected])}</dd>
                </div>
                <div>
                  <dt>Gerekli kapasite</dt>
                  <dd>{selectedDef.naval ? "Tersane" : "Askerî fabrika"}</dd>
                </div>
              </dl>
              <h4>Bir ekipmanın malzemeleri</h4>
              <div className={styles.inputs}>
                {Object.entries(selectedDef.inputs).map(([id, amount]) => (
                  <span key={id}>
                    <MilitaryIcon
                      name={resourceIcon(id as Resource)}
                      size={16}
                    />
                    {RESOURCES[id as Resource]} <b>{format(amount, 2)}</b>
                  </span>
                ))}
              </div>
              {selectedTech && (
                <p>
                  {selectedLocked
                    ? "Gerekli araştırma: "
                    : "Tamamlanan teknoloji: "}
                  <strong>{selectedTech.name}</strong>
                </p>
              )}
              {selectedLocked ? (
                <button type="button" onClick={onResearch}>
                  <MilitaryIcon name="research" size={17} />
                  Araştırmayı aç
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    selectedFree <= 0 || (selectedLine?.factories ?? 0) >= 100
                  }
                  onClick={() => {
                    allocate(selected, (selectedLine?.factories ?? 0) + 1);
                    setCatalogOpen(false);
                  }}
                >
                  <MilitaryIcon name="plus" size={17} />
                  {selectedLine
                    ? "Hatta 1 kapasite daha ata"
                    : `1 ${selectedDef.naval ? "tersane" : "fabrika"} ile üretime başla`}
                </button>
              )}
              {!selectedLocked && selectedFree <= 0 && (
                <p className={styles.warning}>
                  Boş {selectedDef.naval ? "tersane" : "askerî fabrika"} yok.
                  Başka hattan kapasite azalt veya yeni yapı inşa et.
                </p>
              )}
            </section>
          </section>
        )}
        <div className={styles.lines} data-testid="production-lines">
          {lines.length === 0 && (
            <div className={styles.empty}>
              <MilitaryIcon name="factory" size={30} />
              <strong>
                {country.production.length
                  ? "Bu kategoride üretim hattı yok."
                  : "İlk üretim hattını kur."}
              </strong>
              <button type="button" onClick={() => setCatalogOpen(true)}>
                Ekipman seç
              </button>
            </div>
          )}
          {lines.map((line, index) => {
            const id = line.equipment,
              def = EQUIPMENT[id],
              preview = steps.get(id)!;
            const locked = !!def.tech && !country.tech.includes(def.tech);
            const free = def.naval ? freeDocks : freeMilitary;
            const slotCount = Math.min(
              15,
              Math.max(5, line.factories, line.factories + free),
            );
            const canAdd = !locked && free > 0 && line.factories < 100;
            const blocked = preview.blocked
              ? {
                  paused: "Duraklatıldı · biriken iş korunuyor",
                  capacity: "Kapasite yok · fabrika inşa et",
                  resources: "Kaynak yetersiz · stok veya ticareti artır",
                  storage: "Ekipman deposu dolu",
                }[preview.blocked]
              : null;
            return (
              <article
                key={id}
                className={`${styles.line} ${preview.blocked ? styles.blocked : ""}`}
                data-testid={`production-${id}`}
              >
                <div className={styles.lineTop}>
                  <span className={styles.order}>{index + 1}</span>
                  <h3>
                    <MilitaryIcon name={equipmentIcon(id)} size={16} />
                    {def.name}
                  </h3>
                  <span className={styles.stock}>
                    Depo <b>{format(country.equipment[id])}</b>
                  </span>
                </div>
                <div className={styles.lineBody}>
                  <button
                    type="button"
                    className={styles.modelButton}
                    aria-label={`${def.name} üretim ayrıntıları`}
                    onClick={() => {
                      setSelected(id);
                      setCatalogOpen(true);
                    }}
                  >
                    <EquipmentIllustration equipment={id} />
                    <small>
                      {def.naval
                        ? "DENİZ ÜRETİMİ"
                        : AIR.has(id)
                          ? "HAVA ÜRETİMİ"
                          : "KARA ÜRETİMİ"}
                    </small>
                  </button>
                  <div className={styles.lineInfo}>
                    <div className={styles.rate}>
                      <strong>{format(preview.work / def.cost, 2)}</strong>
                      <span>adet / gün</span>
                      <small>
                        Sonraki gün <b>{preview.completed}</b> tamamlanır
                      </small>
                    </div>
                    <div className={styles.efficiency}>
                      <span>
                        Verimlilik <b>%{Math.round(line.efficiency * 100)}</b>
                      </span>
                      <i>
                        <em
                          style={{
                            width: `${percent(line.efficiency * 100)}%`,
                          }}
                        />
                      </i>
                    </div>
                    <div
                      className={styles.progress}
                      data-testid={`production-progress-${id}`}
                    >
                      <span>
                        Üretim ilerlemesi{" "}
                        <b>
                          {format(line.progress ?? 0, 2)} / {def.cost}
                        </b>
                      </span>
                      <i>
                        <em
                          style={{
                            width: `${percent(((line.progress ?? 0) / def.cost) * 100)}%`,
                          }}
                        />
                      </i>
                    </div>
                  </div>
                </div>
                <div className={styles.assignment}>
                  <div
                    className={styles.factorySlots}
                    aria-label={`${def.name} kapasite kutuları`}
                  >
                    {Array.from({ length: slotCount }, (_, i) => i + 1).map(
                      (count) => (
                        <button
                          key={count}
                          type="button"
                          aria-label={`${def.name} ${count} ${def.naval ? "tersane" : "fabrika"} ata`}
                          aria-pressed={count <= line.factories}
                          disabled={
                            count > line.factories &&
                            (locked || count > line.factories + free)
                          }
                          title={`${count} ${def.naval ? "tersane" : "fabrika"} ata`}
                          onClick={() => allocate(id, count)}
                        >
                          <MilitaryIcon
                            name={def.naval ? "navy" : "factory"}
                            size={14}
                          />
                        </button>
                      ),
                    )}
                    {line.factories > slotCount && (
                      <span>+{line.factories - slotCount}</span>
                    )}
                  </div>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      aria-label={`${def.name} fabrika azalt`}
                      disabled={!line.factories}
                      onClick={() => allocate(id, line.factories - 1)}
                    >
                      −
                    </button>
                    <strong>{line.factories}</strong>
                    <button
                      type="button"
                      aria-label={`${def.name} fabrika artır`}
                      disabled={!canAdd}
                      onClick={() => allocate(id, line.factories + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className={styles.lineFooter}>
                  <span>
                    Etkin {format(preview.activeFactories, 1)} /{" "}
                    {line.factories} {def.naval ? "tersane" : "fabrika"}
                  </span>
                  <button
                    type="button"
                    disabled={!line.factories}
                    onClick={() => allocate(id, 0)}
                    aria-label={`${def.name} üretimini duraklat`}
                  >
                    Duraklat
                  </button>
                </div>
                {blocked && <p className={styles.warning}>{blocked}</p>}
              </article>
            );
          })}
        </div>

        <details className={styles.management}>
          <summary>Ekonomi kanunu ve haftalık göstergeler</summary>
          <label className={styles.search}>
            Ekonomi kanunu · değişiklik 50 siyasi güç
            <select
              value={country.economy}
              onChange={(event) =>
                command({
                  type: "economy",
                  law: event.target.value as Country["economy"],
                })
              }
            >
              {Object.entries(ECONOMIES).map(([id, def]) => (
                <option key={id} value={id}>
                  {def.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            Savaş ekonomisi üretimi artırır; sivil inşaatı ve vergi gelirini
            azaltır.
          </p>
          <p>
            Sivil inşaat kapasitesi:{" "}
            <strong>{format(capacity(world, country.id, "civil"), 1)}</strong>
          </p>
          <HistoryChart
            label="Haftalık hazine"
            values={country.history.map((point) => point.treasury)}
          />
          <HistoryChart
            label="Haftalık fabrika kapasitesi"
            values={country.history.map((point) => point.factories)}
          />
        </details>
        <details
          className={styles.management}
          open={country.construction.length > 0}
        >
          <summary>
            İnşaat kuyruğu · {country.construction.length} proje
          </summary>
          <p>
            İnşaatlar sırayla tamamlanır. Bölge panelinden yeni yapı
            ekleyebilirsin.
          </p>
          {!country.construction.length && <p>Kuyruk boş.</p>}
          {country.construction.map((entry, index) => (
            <article className={styles.construction} key={entry.id}>
              <h4>
                {index + 1}.{" "}
                <MilitaryIcon name={buildingIcon(entry.building)} size={16} />
                {BUILDINGS[entry.building].name}
              </h4>
              <p>
                {GEOGRAPHY[entry.province].name}
                {world.provinces[entry.province].controller !== country.id
                  ? " · işgal nedeniyle durdu"
                  : ""}
              </p>
              <div className={styles.progress}>
                <span>
                  Tamamlanma{" "}
                  <b>
                    %{Math.floor(percent((entry.progress / entry.total) * 100))}
                  </b>
                </span>
                <i>
                  <em
                    style={{
                      width: `${percent((entry.progress / entry.total) * 100)}%`,
                    }}
                  />
                </i>
              </div>
              <button
                type="button"
                onClick={() => command({ type: "cancelBuild", id: entry.id })}
              >
                İptal et · kullanılmayan bütçenin %75’i iade
              </button>
            </article>
          ))}
        </details>
      </section>
    </div>
  );
}
