"use client";
import { useMemo, useRef, useState } from "react";
import { TECHNOLOGIES, type Technology } from "./catalog";
import MilitaryIcon, { type MilitaryIconName } from "./MilitaryIcon";
import { researchDays, researchSlots } from "./politics";
import {
  researchDailyProgress,
  researchPositions,
  researchRemainingDays,
  researchStatus,
} from "./research-presentation";
import UnitResearchGuide from "./UnitResearchGuide";
import type { Action, World } from "./types";
import styles from "./research-panel.module.css";

const BRANCH_ICONS: Record<string, MilitaryIconName> = {
  Kara: "infantry",
  Zırh: "armor",
  Hava: "plane",
  Deniz: "navy",
  Sanayi: "factory",
  İstihbarat: "espionage",
  Doktrin: "command",
};
const STATUS = {
  completed: "Tamamlandı",
  working: "Araştırılıyor",
  available: "Seçilebilir",
  locked: "Önkoşul gerekli",
};
const BRANCHES = [
  ...new Set(TECHNOLOGIES.map((technology) => technology.branch)),
];
const iconFor = (technology: Technology) =>
  BRANCH_ICONS[technology.branch] ?? "research";

export default function ResearchPanel({
  world,
  command,
  simple = false,
}: {
  world: World;
  command: (action: Action) => void;
  simple?: boolean;
}) {
  const country = world.countries[world.player];
  const [branch, setBranch] = useState("Kara");
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(
    () =>
      TECHNOLOGIES.find(
        (technology) => researchStatus(country, technology.id) === "available",
      )?.id ?? TECHNOLOGIES[0].id,
  );
  const searchInput = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLElement>(null);
  const slots = researchSlots(country);
  const selected = TECHNOLOGIES.find(
    (technology) => technology.id === selectedId,
  )!;
  const selectedStatus = researchStatus(country, selected.id);
  const slotFull = country.research.length >= slots;
  const current = country.research.find(
    (project) => project.id === selected.id,
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return TECHNOLOGIES.filter(
      (technology) =>
        (branch === "Tümü" || branch === technology.branch) &&
        (!query ||
          `${technology.name} ${technology.description} ${technology.year}`
            .toLocaleLowerCase("tr-TR")
            .includes(query)) &&
        (!availableOnly ||
          researchStatus(country, technology.id) === "available"),
    );
  }, [branch, search, availableOnly, country]);
  const positions = useMemo(
    () => researchPositions(filtered.map((technology) => technology.id)),
    [filtered],
  );
  const positionById = new Map(
    positions.map((position) => [position.id, position]),
  );
  const width = Math.max(178, ...positions.map((position) => position.x + 172));
  const height = Math.max(
    126,
    ...positions.map((position) => position.y + 106),
  );
  const choose = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() =>
      detail.current?.scrollIntoView({ block: "nearest", behavior: "auto" }),
    );
  };
  const browse = () => {
    setAvailableOnly(true);
    setSearch("");
    setBranch("Tümü");
    searchInput.current?.focus();
    searchInput.current?.scrollIntoView({ block: "center" });
  };
  return (
    <div className={styles.container}>
      <section className={styles.root} data-testid="research-panel">
        <header className={styles.heading}>
          <span className={styles.seal}>
            <MilitaryIcon name="research" size={30} />
          </span>
          <div>
            <small>BİLİM VE DOKTRİNLER</small>
            <h2>Araştırma dairesi</h2>
          </div>
          <strong>
            {country.research.length}
            <span> / {slots} yuva</span>
          </strong>
        </header>
        <div className={styles.summary}>
          <span>
            <b>{country.tech.length}</b> teknoloji tamamlandı
          </span>
          <span>
            <b>
              +%
              {Math.round(
                (country.science + (country.advisor === "science" ? 0.15 : 0)) *
                  100,
              )}
            </b>{" "}
            genel hız
          </span>
        </div>
        <div className={styles.slots} aria-label="Araştırma yuvaları">
          {Array.from({ length: slots }, (_, index) => {
            const project = country.research[index];
            const technology = TECHNOLOGIES.find(
              (item) => item.id === project?.id,
            );
            const percent = project
              ? Math.min(100, (project.progress / project.total) * 100)
              : 0;
            return (
              <button
                type="button"
                key={index}
                className={`${styles.slot} ${project ? styles.busy : styles.empty}`}
                data-testid={`research-slot-${index}`}
                data-technology={project?.id ?? ""}
                onClick={() => (project ? choose(project.id) : browse())}
                aria-label={
                  project
                    ? `${index + 1}. araştırma yuvası: ${technology?.name}`
                    : `${index + 1}. boş araştırma yuvası: teknoloji seç`
                }
              >
                <span className={styles.slotIcon}>
                  <MilitaryIcon
                    name={technology ? iconFor(technology) : "plus"}
                    size={32}
                  />
                </span>
                <span className={styles.slotBody}>
                  <small>
                    ARAŞTIRMA YUVASI {index + 1}
                    {technology ? ` · ${technology.year}` : ""}
                  </small>
                  <strong>{technology?.name ?? "Yeni araştırma seç"}</strong>
                  {project ? (
                    <>
                      <span
                        className={styles.progress}
                        role="progressbar"
                        aria-label={`${technology?.name} ilerlemesi`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.floor(percent)}
                      >
                        <i style={{ width: `${percent}%` }} />
                      </span>
                      <span className={styles.slotMeta}>
                        <b>%{Math.floor(percent)}</b>
                        <span>
                          {researchRemainingDays(country, project)} gün kaldı
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className={styles.slotMeta}>
                      Boş yuva · bir teknoloji seçerek çalışmaya başla
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <section className={styles.browser} aria-label="Teknoloji seçimi">
          <div className={styles.browserHeading}>
            <h3>Teknoloji arşivi</h3>
            <span>
              {filtered.length} / {TECHNOLOGIES.length}
            </span>
          </div>
          <div className={styles.branches} aria-label="Araştırma kategorileri">
            {["Tümü", ...BRANCHES].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={branch === value}
                onClick={() => setBranch(value)}
              >
                <MilitaryIcon
                  name={BRANCH_ICONS[value] ?? "research"}
                  size={15}
                />
                {value}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            Teknoloji ara
            <input
              ref={searchInput}
              aria-label="Teknoloji ara"
              value={search}
              placeholder="Silah, tank, radar…"
              onChange={(event) => {
                setSearch(event.target.value);
                if (event.target.value) setBranch("Tümü");
              }}
            />
          </label>
          <label className={styles.filter}>
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
            />
            Yalnız önkoşulları tamamlananlar
          </label>
          <p className={styles.hint}>
            Bir teknoloji seç; ayrıntılarını inceleyip boş yuvada başlat.
            Bağlantılar araştırma önkoşullarını gösterir.
          </p>
          {filtered.length ? (
            <div
              className={styles.boardViewport}
              tabIndex={0}
              role="region"
              aria-label="Kaydırılabilir teknoloji ağacı"
              data-testid="research-tech-board"
            >
              <div className={styles.board} style={{ width, height }}>
                <svg
                  className={styles.connections}
                  width={width}
                  height={height}
                  aria-hidden="true"
                >
                  {filtered.flatMap((technology) =>
                    technology.requires.map((required) => {
                      const from = positionById.get(required),
                        to = positionById.get(technology.id);
                      if (!from || !to) return null;
                      return (
                        <path
                          key={`${required}-${technology.id}`}
                          data-complete={country.tech.includes(required)}
                          d={`M${from.x + 158} ${from.y + 46}H${from.x + 171}V${to.y + 46}H${to.x}`}
                        />
                      );
                    }),
                  )}
                </svg>
                {filtered.map((technology) => {
                  const position = positionById.get(technology.id)!;
                  const status = researchStatus(country, technology.id);
                  return (
                    <button
                      type="button"
                      key={technology.id}
                      className={styles.technology}
                      data-tech-id={technology.id}
                      data-status={status}
                      aria-pressed={selectedId === technology.id}
                      onClick={() => choose(technology.id)}
                      style={{ left: position.x, top: position.y }}
                    >
                      <small>
                        {technology.year}
                        <span>
                          {status === "completed"
                            ? "✓"
                            : status === "working"
                              ? "●"
                              : ""}
                        </span>
                      </small>
                      <span className={styles.techTitle}>
                        <MilitaryIcon name={iconFor(technology)} size={25} />
                        <b>{technology.name}</b>
                      </span>
                      <span className={styles.status}>{STATUS[status]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className={styles.noResults}>
              Bu filtreye uygun teknoloji yok. Başka bir kategori seç veya
              aramayı temizle.
            </p>
          )}
        </section>
        <section
          ref={detail}
          className={styles.detail}
          data-testid="research-detail"
          data-technology={selected.id}
        >
          <div className={styles.detailHeader}>
            <span className={styles.seal}>
              <MilitaryIcon name={iconFor(selected)} size={34} />
            </span>
            <div>
              <small>
                {selected.branch} · {selected.year}
              </small>
              <h3>{selected.name}</h3>
            </div>
          </div>
          <p>{selected.description}</p>
          {selected.requires.length > 0 && (
            <div className={styles.prerequisites}>
              <small>ÖNKOŞULLAR</small>
              {selected.requires.map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => {
                    setBranch("Tümü");
                    setSearch("");
                    setAvailableOnly(false);
                    choose(id);
                  }}
                >
                  <MilitaryIcon
                    name={country.tech.includes(id) ? "check" : "research"}
                    size={14}
                  />
                  {
                    TECHNOLOGIES.find((technology) => technology.id === id)
                      ?.name
                  }
                </button>
              ))}
            </div>
          )}
          <dl className={styles.detailStats}>
            <div>
              <dt>Temel süre</dt>
              <dd>
                {current?.total ?? researchDays(world, country, selected.id)}{" "}
                gün
              </dd>
            </div>
            <div>
              <dt>Bu dalda hız</dt>
              <dd>
                +%
                {Math.round(
                  (researchDailyProgress(country, selected.id) - 1) * 100,
                )}
              </dd>
            </div>
            <div>
              <dt>{current ? "Kalan süre" : "Tahmini süre"}</dt>
              <dd>
                {current
                  ? researchRemainingDays(country, current)
                  : Math.ceil(
                      researchDays(world, country, selected.id) /
                        researchDailyProgress(country, selected.id),
                    )}{" "}
                gün
              </dd>
            </div>
          </dl>
          <p className={styles.hint}>
            Süre, erken araştırma cezasını ve mevcut danışman/kabine bonuslarını
            içerir. Bonuslar değişirse kalan süre de değişir.
          </p>
          <button
            type="button"
            className={styles.start}
            data-testid="research-start"
            disabled={selectedStatus !== "available" || slotFull}
            onClick={() => command({ type: "research", id: selected.id })}
          >
            <MilitaryIcon
              name={selectedStatus === "completed" ? "check" : "research"}
              size={18}
            />
            {selectedStatus === "completed"
              ? "Tamamlandı"
              : selectedStatus === "working"
                ? "Araştırılıyor"
                : selectedStatus === "locked"
                  ? "Önce bağlı teknolojileri tamamla"
                  : slotFull
                    ? "Tüm araştırma yuvaları dolu"
                    : "Araştırmayı başlat"}
          </button>
        </section>
        <details
          className={styles.guide}
          open={!simple}
          key={simple ? "simple" : "full"}
        >
          <summary>Birlik modelleri ve geliştirme yolları</summary>
          <UnitResearchGuide
            country={country}
            onResearch={(id) => command({ type: "research", id })}
          />
        </details>
      </section>
    </div>
  );
}
