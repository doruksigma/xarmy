"use client";

import { useMemo, useState } from "react";
import { focusTree, type Focus } from "./catalog";
import {
  allCountryEvents,
  countryEvents,
  historicalEvent,
  type HistoricalEventDefinition,
} from "./historical-catalog";
import { historicalFocusAvailability } from "./historical-events";
import MilitaryIcon from "./MilitaryIcon";
import { dateLabel, MAP } from "./world";
import type { Action, World } from "./types";
import styles from "./historical-events.module.css";

const HISTORY_BRANCH = "historical";
const ALL = "all";
const PAGE_SIZE = 12;
const TURKISH = new Intl.Collator("tr");
// Catalog labels remain stable across hourly economy and political updates.
const COUNTRY_NAMES = new Map(
  MAP.countries.map((country) => [
    country.id,
    `${country.flag} ${country.name}`,
  ]),
);
type EraFilter =
  | "all"
  | "historical"
  | "policy"
  | "alternative"
  | "standard"
  | "national";
const ERA_LABELS = {
  historical: "Tarihî olay",
  policy: "Ulusal politika",
  alternative: "Alternatif tarih",
  standard: "Temel ulusal odak",
} as const;
const normalize = (text: string) => text.toLocaleLowerCase("tr-TR").trim();
const eventForFocus = (id: string) =>
  id.startsWith("history-") ? historicalEvent(id.slice(8)) : undefined;
const eventEra = (event: HistoricalEventDefinition) =>
  event.era ?? "historical";
function historicalDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function focusBlock(world: World, focus: Focus): string | null {
  const c = world.countries[world.player];
  if (c.capitulated) return "Ülken teslim oldu.";
  if (c.focuses.includes(focus.id)) return "Tamamlandı";
  if (c.focus?.id === focus.id) return "Hazırlanıyor";
  if (c.focus) return "Önce yürürlükteki odağı tamamla.";
  if (focus.requires.some((id) => !c.focuses.includes(id)))
    return "Önce bağlantılı odakları tamamla.";
  if (focus.excludes && c.focuses.includes(focus.excludes))
    return "Seçtiğin siyasi yol bu odağı kapattı.";
  if (c.political < (focus.cost ?? 0))
    return `${focus.cost} siyasi güç gerekir.`;
  return focus.id.startsWith("history-")
    ? historicalFocusAvailability(world, c, focus.id.slice(8))
    : null;
}

function Pagination({
  page,
  total,
  onPage,
  label,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        aria-label={`${label}: önceki sayfa`}
      >
        ← Önceki
      </button>
      <span>
        Sayfa {page + 1} / {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
        aria-label={`${label}: sonraki sayfa`}
      >
        Sonraki →
      </button>
    </nav>
  );
}
function EffectDetails({ event }: { event: HistoricalEventDefinition }) {
  return (
    <details className={styles.outcomes}>
      <summary>Kararlar, maliyetler ve etkileri</summary>
      <p>
        <strong>{event.acceptLabel}</strong>
        <br />
        {event.effectText}
      </p>
      <p>
        <strong>{event.declineLabel}</strong>
        <br />
        {event.declineText}
      </p>
      <p className={styles.hint}>
        Hazırlık: {event.days} gün · Başlangıçta {event.cost} siyasi güç.
        Kararın etkisinde belirtilen hazine ve malzeme giderleri kabul sırasında
        ayrıca ödenir. Güncel koşullar karar anında yeniden kontrol edilir.
      </p>
      {event.requires.length > 0 && (
        <p className={styles.hint}>
          Önkoşullar:{" "}
          {event.requires
            .map((id) => eventForFocus(id)?.title ?? id)
            .join(" + ")}
        </p>
      )}
      {!!event.excludes?.length && (
        <p className={styles.exclusions}>
          Birbirini dışlayan yollar:{" "}
          {event.excludes
            .map((id) => historicalEvent(id)?.title ?? id)
            .join(" · ")}
        </p>
      )}
    </details>
  );
}

/** Bounded rendering: catalog size does not increase the number of mounted cards. */
export default function HistoricalEvents({
  world,
  onAction,
}: {
  world: World;
  onAction: (action: Action) => unknown;
}) {
  const country = world.countries[world.player];
  const focuses = useMemo(() => focusTree(country.id), [country.id]);
  const ownEvents = useMemo(() => countryEvents(country.id), [country.id]);
  const allEvents = useMemo(() => allCountryEvents(), []);
  const orderedEvents = useMemo(
    () =>
      [...allEvents].sort((a, b) =>
        a.date < b.date
          ? -1
          : a.date > b.date
            ? 1
            : TURKISH.compare(a.title, b.title),
      ),
    [allEvents],
  );
  const byId = useMemo(
    () => new Map(focuses.map((focus) => [focus.id, focus])),
    [focuses],
  );
  const depths = useMemo(() => {
    const result = new Map<string, number>();
    const depth = (id: string, seen = new Set<string>()): number => {
      if (result.has(id)) return result.get(id)!;
      if (seen.has(id)) return 0;
      const focus = byId.get(id);
      if (!focus) return 0;
      const next = new Set(seen).add(id);
      const value = Math.max(
        0,
        ...focus.requires
          .filter((key) => byId.has(key))
          .map((key) => 1 + depth(key, next)),
      );
      result.set(id, value);
      return value;
    };
    for (const focus of focuses) depth(focus.id);
    return result;
  }, [focuses, byId]);
  const sortedFocuses = useMemo(
    () =>
      [...focuses].sort((a, b) => {
        const priority = (focus: Focus) => {
          const event = eventForFocus(focus.id);
          return event
            ? eventEra(event) === "historical"
              ? 0
              : event.countrySpecific
                ? 1
                : 2
            : 3;
        };
        return (
          priority(a) - priority(b) ||
          (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0)
        );
      }),
    [focuses, depths],
  );
  const branches = useMemo(
    () =>
      [...new Set(focuses.map((focus) => focus.branch))].sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
    [focuses],
  );
  const [view, setView] = useState<"tree" | "archive">("tree");
  const [branch, setBranch] = useState(ownEvents.length ? HISTORY_BRANCH : ALL);
  const [focusEra, setFocusEra] = useState<EraFilter>(ALL);
  const [focusQuery, setFocusQuery] = useState("");
  const [focusPage, setFocusPage] = useState(0);
  const [scope, setScope] = useState<"country" | "world">("country");
  const [archiveCountry, setArchiveCountry] = useState(ALL);
  const [archiveEra, setArchiveEra] = useState<EraFilter>(ALL);
  const [archiveBranch, setArchiveBranch] = useState(ALL);
  const [query, setQuery] = useState("");
  const [archivePage, setArchivePage] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const countryNames = COUNTRY_NAMES;
  const archiveSearchIndex = useMemo(
    () =>
      new Map(
        allEvents.map((event) => [
          event.id,
          normalize(
            `${event.title} ${event.description} ${countryNames.get(event.country) ?? ""} ${event.target ? (countryNames.get(event.target) ?? "") : ""}`,
          ),
        ]),
      ),
    [allEvents, countryNames],
  );
  const availableCountries = useMemo(
    () =>
      [...new Set(allEvents.map((event) => event.country))].sort((a, b) =>
        (countryNames.get(a) ?? a).localeCompare(
          countryNames.get(b) ?? b,
          "tr",
        ),
      ),
    [allEvents, countryNames],
  );
  const archivedBranches = useMemo(
    () =>
      [...new Set(allEvents.map((event) => event.branch ?? "Diplomasi"))].sort(
        (a, b) => a.localeCompare(b, "tr"),
      ),
    [allEvents],
  );
  const relevantEvents = useMemo(
    () =>
      orderedEvents.filter(
        (event) => event.country === country.id || event.target === country.id,
      ),
    [orderedEvents, country.id],
  );
  const filteredFocuses = useMemo(() => {
    const q = normalize(focusQuery);
    return sortedFocuses.filter((focus) => {
      const definition = eventForFocus(focus.id);
      const era = definition ? eventEra(definition) : "standard";
      return (
        (branch === ALL ||
          (branch === HISTORY_BRANCH
            ? !!definition
            : focus.branch === branch)) &&
        (focusEra === ALL ||
          (focusEra === "national"
            ? !!definition?.countrySpecific
            : focusEra === era)) &&
        (!q ||
          normalize(
            `${focus.name} ${focus.description} ${focus.branch}`,
          ).includes(q))
      );
    });
  }, [sortedFocuses, branch, focusEra, focusQuery]);
  const filteredEvents = useMemo(() => {
    const q = normalize(query);
    return (scope === "country" ? relevantEvents : orderedEvents).filter(
      (event) =>
        (archiveCountry === ALL || event.country === archiveCountry) &&
        (archiveEra === ALL ||
          (archiveEra === "national"
            ? !!event.countrySpecific
            : eventEra(event) === archiveEra)) &&
        (archiveBranch === ALL ||
          (event.branch ?? "Diplomasi") === archiveBranch) &&
        (!q || archiveSearchIndex.get(event.id)?.includes(q)),
    );
  }, [
    scope,
    relevantEvents,
    orderedEvents,
    archiveCountry,
    archiveEra,
    archiveBranch,
    query,
    archiveSearchIndex,
  ]);
  const focusCurrent = Math.min(
    focusPage,
    Math.max(0, Math.ceil(filteredFocuses.length / PAGE_SIZE) - 1),
  );
  const archiveCurrent = Math.min(
    archivePage,
    Math.max(0, Math.ceil(filteredEvents.length / PAGE_SIZE) - 1),
  );
  const visibleFocuses = filteredFocuses.slice(
    focusCurrent * PAGE_SIZE,
    (focusCurrent + 1) * PAGE_SIZE,
  );
  const visibleEvents = filteredEvents.slice(
    archiveCurrent * PAGE_SIZE,
    (archiveCurrent + 1) * PAGE_SIZE,
  );
  const active = country.focus && byId.get(country.focus.id);
  const decisions = useMemo(
    () => ({
      pending: new Map(
        world.historical?.pending.map((decision) => [
          decision.eventId,
          decision,
        ]) ?? [],
      ),
      resolved: new Map(
        world.historical?.resolved.map((decision) => [
          decision.eventId,
          decision,
        ]) ?? [],
      ),
    }),
    [world.historical],
  );

  function showFocus(id: string) {
    const focus = byId.get(id);
    if (!focus) return;
    setView("tree");
    setBranch(ALL);
    setFocusEra(ALL);
    setFocusQuery("");
    setFocusPage(
      Math.floor(sortedFocuses.findIndex((node) => node.id === id) / PAGE_SIZE),
    );
    setHighlight(id);
    requestAnimationFrame(() => {
      const node = document.getElementById(`focus-node-${id}`);
      node?.scrollIntoView({ block: "nearest", behavior: "auto" });
      node?.focus({ preventScroll: true });
    });
  }
  function resetFocusFilters() {
    setBranch(ALL);
    setFocusEra(ALL);
    setFocusQuery("");
    setFocusPage(0);
    setHighlight(null);
  }
  const countLabel = (page: number, length: number) =>
    length
      ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, length)} / ${length}`
      : "0 / 0";
  const typeOptions = (standard = false) => (
    <>
      <option value="all">Bütün türler</option>
      <option value="historical">Tarihî olaylar</option>
      <option value="policy">Ulusal politikalar</option>
      <option value="alternative">Alternatif tarih</option>
      <option value="national">Ülkeye özel yollar</option>
      {standard && <option value="standard">Temel ulusal odaklar</option>}
    </>
  );

  return (
    <section
      className={styles.desk}
      aria-label="Ulusal odaklar ve tarihî olaylar"
      data-testid="historical-desk"
    >
      <div className={styles.eyebrow}>DEVLET ARŞİVİ · {country.name}</div>
      <h2>
        <MilitaryIcon name="medal" size={25} /> Odaklar ve olaylar
      </h2>
      <div className={styles.balance}>
        <span>
          <MilitaryIcon name="diplomacy" size={18} /> Diplomasi bütçesi
        </span>
        <strong>
          {Math.floor(country.political).toLocaleString("tr-TR")}{" "}
          <small>siyasi güç</small>
        </strong>
      </div>
      <p className={styles.intro}>
        Bir odak seç, hazırlığını tamamla ve gelen kararı imzala. Diplomasi
        maliyeti siyasi gücünden bir kez düşer. Kabul sırasında gereken diğer
        kaynaklar etkiler bölümünde gösterilir.
      </p>
      <div
        className={styles.catalogSummary}
        data-testid="national-catalog-count"
      >
        <strong>{ownEvents.length}</strong>
        <span>
          {country.name} için olay ve politika
          <br />
          {ownEvents.filter((event) => event.countrySpecific).length} ülkeye
          özel yol · {focuses.length} toplam ulusal odak
        </span>
      </div>
      <div
        className={styles.tabs}
        role="group"
        aria-label="Devlet arşivi görünümü"
      >
        <button
          type="button"
          aria-pressed={view === "tree"}
          onClick={() => setView("tree")}
        >
          <MilitaryIcon name="medal" size={16} /> Odak ağacı
        </button>
        <button
          type="button"
          aria-pressed={view === "archive"}
          onClick={() => setView("archive")}
        >
          <MilitaryIcon name="save" size={16} /> Tarihî olaylar
        </button>
      </div>
      {view === "tree" ? (
        <>
          {active && country.focus && (
            <div className={styles.active} data-testid="active-national-focus">
              <small>HAZIRLIK SÜRÜYOR</small>
              <h3>{active.name}</h3>
              <progress
                aria-label={`${active.name} ilerlemesi`}
                value={country.focus.progress}
                max={country.focus.total}
              />
              <span>
                {Math.ceil(
                  Math.max(0, country.focus.total - country.focus.progress),
                )}{" "}
                oyun günü kaldı · %
                {Math.floor(
                  (country.focus.progress / country.focus.total) * 100,
                )}
              </span>
              <button
                type="button"
                className={styles.activeLink}
                onClick={() => showFocus(active.id)}
              >
                Etkin odağı göster →
              </button>
            </div>
          )}
          <div className={styles.filterGrid}>
            <label className={styles.field}>
              Odak dalı
              <select
                aria-label="Odak dalı"
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setFocusPage(0);
                  setHighlight(null);
                }}
              >
                <option value={ALL}>Bütün ulusal odaklar</option>
                {ownEvents.length > 0 && (
                  <option value={HISTORY_BRANCH}>
                    Olay ve politika odakları
                  </option>
                )}
                {branches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              İçerik türü
              <select
                aria-label="Odak türü"
                value={focusEra}
                onChange={(e) => {
                  setFocusEra(e.target.value as EraFilter);
                  setFocusPage(0);
                }}
              >
                {typeOptions(true)}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            Odak ara
            <input
              type="search"
              aria-label="Odak ara"
              placeholder="Anschluss, sanayi, tarafsızlık…"
              value={focusQuery}
              onChange={(e) => {
                setFocusQuery(e.target.value);
                setFocusPage(0);
                setHighlight(null);
              }}
            />
          </label>
          <p className={styles.hint}>
            Tarihî olaylar geçmişteki gelişmelere dayanır. Ulusal politika ve
            alternatif tarih seçenekleri, seferinde seçebileceğin oyun
            yollarıdır.
          </p>
          <div className={styles.results}>
            <span data-testid="focus-result-count">
              {countLabel(focusCurrent, filteredFocuses.length)} odak
              gösteriliyor · {focuses.length} toplam
            </span>
            <button type="button" onClick={resetFocusFilters}>
              Filtreleri temizle
            </button>
          </div>
          <p className={styles.hint}>
            Seçili dal:{" "}
            <strong>
              {branch === ALL
                ? "Bütün ulusal odaklar"
                : branch === HISTORY_BRANCH
                  ? "Olay ve politika odakları"
                  : branch}
            </strong>
            . Önkoşul etiketleri seni ilgili odağın sayfasına götürür.
          </p>
          <Pagination
            page={focusCurrent}
            total={filteredFocuses.length}
            onPage={setFocusPage}
            label="Odak sayfaları"
          />
          <div className={styles.tree} aria-label="Ulusal odak ağacı">
            {visibleFocuses.length === 0 && (
              <p className={styles.empty}>
                Bu filtrelerle odak bulunamadı. Filtreleri temizleyerek bütün
                ulusal odakları görebilirsin.
              </p>
            )}
            {visibleFocuses.map((focus) => {
              const done = country.focuses.includes(focus.id),
                block = focusBlock(world, focus),
                definition = eventForFocus(focus.id);
              return (
                <article
                  key={focus.id}
                  id={`focus-node-${focus.id}`}
                  tabIndex={-1}
                  className={`${styles.node} ${done ? styles.completed : ""} ${highlight === focus.id ? styles.highlight : ""}`}
                  data-focus-id={focus.id}
                  data-linked={focus.requires.length > 0}
                  data-state={
                    done
                      ? "completed"
                      : country.focus?.id === focus.id
                        ? "active"
                        : block
                          ? "locked"
                          : "available"
                  }
                >
                  <div className={styles.nodeMark}>
                    <MilitaryIcon name={done ? "check" : "medal"} size={19} />
                  </div>
                  <div className={styles.nodeBody}>
                    <div className={styles.nodeHeading}>
                      <small>
                        {definition
                          ? ERA_LABELS[eventEra(definition)]
                          : focus.branch}
                      </small>
                      <span>
                        {done
                          ? "TAMAMLANDI"
                          : country.focus?.id === focus.id
                            ? "ETKİN"
                            : `AŞAMA ${(depths.get(focus.id) ?? 0) + 1}`}
                      </span>
                    </div>
                    {definition?.countrySpecific && (
                      <p className={styles.countryBadge}>
                        {country.name} için özel yol
                      </p>
                    )}
                    {focus.requires.length > 0 && (
                      <div
                        className={styles.links}
                        aria-label="Önkoşul bağlantıları"
                      >
                        <span aria-hidden="true">↳</span>
                        {focus.requires.map((id) => (
                          <button
                            type="button"
                            key={id}
                            onClick={() => showFocus(id)}
                            aria-label={`Önkoşula git: ${byId.get(id)?.name ?? id}`}
                          >
                            {country.focuses.includes(id) && (
                              <MilitaryIcon name="check" size={11} />
                            )}
                            {byId.get(id)?.name ?? id}
                          </button>
                        ))}
                      </div>
                    )}
                    <h3>{focus.name}</h3>
                    <p>{focus.description}</p>
                    <div className={styles.meta}>
                      <span>{focus.days} gün</span>
                      <span>
                        {focus.cost
                          ? `${focus.cost} siyasi güç`
                          : "Puan maliyeti yok"}
                      </span>
                      <span>{focus.branch}</span>
                    </div>
                    {definition && (
                      <>
                        <p className={styles.hint}>
                          Tarihsel mod eşiği: {historicalDate(definition.date)}.
                          Alternatif tarihte daha erken hazırlanabilir. Hazırlık
                          bitince son kararı sen verirsin.
                        </p>
                        <EffectDetails event={definition} />
                      </>
                    )}
                    {focus.excludes && (
                      <p className={styles.exclusions}>
                        Birbirini dışlayan yol:{" "}
                        {byId.get(focus.excludes)?.name ?? focus.excludes}
                      </p>
                    )}
                    <button
                      type="button"
                      className={styles.start}
                      disabled={!!block}
                      aria-describedby={
                        block && !done && country.focus?.id !== focus.id
                          ? `focus-block-${focus.id}`
                          : undefined
                      }
                      onClick={() => onAction({ type: "focus", id: focus.id })}
                    >
                      {done
                        ? "Tamamlandı"
                        : country.focus?.id === focus.id
                          ? "Hazırlanıyor"
                          : `Odağı başlat${focus.cost ? ` · ${focus.cost} puan` : ""}`}
                    </button>
                    {block && !done && country.focus?.id !== focus.id && (
                      <p
                        id={`focus-block-${focus.id}`}
                        className={styles.reason}
                      >
                        {block}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className={styles.intro}>
            Dünya arşivinde {allEvents.length.toLocaleString("tr-TR")} olay ve
            politika bulunuyor. Tarihî kayıtları, ülkelere özel alternatif
            yolları ve ortak ulusal programları tür filtresiyle ayırabilirsin.
            Kararların kayıt dosyanla saklanır.
          </p>
          <div className={styles.filterGrid}>
            <label className={styles.field}>
              Kapsam
              <select
                aria-label="Tarihî olay kapsamı"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as "country" | "world");
                  setArchiveCountry(ALL);
                  setArchivePage(0);
                }}
              >
                <option value="country">Ülkemi ilgilendiren</option>
                <option value="world">Bütün ülkeler</option>
              </select>
            </label>
            <label className={styles.field}>
              Kararı başlatan ülke
              <select
                aria-label="Olay ülkesi"
                value={archiveCountry}
                onChange={(e) => {
                  setArchiveCountry(e.target.value);
                  setScope("world");
                  setArchivePage(0);
                }}
              >
                <option value={ALL}>Bütün ülkeler</option>
                {availableCountries.map((id) => (
                  <option key={id} value={id}>
                    {countryNames.get(id) ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              İçerik türü
              <select
                aria-label="Olay türü"
                value={archiveEra}
                onChange={(e) => {
                  setArchiveEra(e.target.value as EraFilter);
                  setArchivePage(0);
                }}
              >
                {typeOptions()}
              </select>
            </label>
            <label className={styles.field}>
              Olay dalı
              <select
                aria-label="Olay dalı"
                value={archiveBranch}
                onChange={(e) => {
                  setArchiveBranch(e.target.value);
                  setArchivePage(0);
                }}
              >
                <option value={ALL}>Bütün dallar</option>
                {archivedBranches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            Olay ara
            <input
              type="search"
              aria-label="Olay ara"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setArchivePage(0);
              }}
              placeholder="Anschluss, Montrö, sağlık…"
            />
          </label>
          <div className={styles.results}>
            <span data-testid="archive-result-count">
              {countLabel(archiveCurrent, filteredEvents.length)} olay
              gösteriliyor · {allEvents.length.toLocaleString("tr-TR")} toplam
            </span>
            <button
              type="button"
              onClick={() => {
                setScope("world");
                setArchiveCountry(ALL);
                setArchiveEra(ALL);
                setArchiveBranch(ALL);
                setQuery("");
                setArchivePage(0);
              }}
            >
              Filtreleri temizle
            </button>
          </div>
          <Pagination
            page={archiveCurrent}
            total={filteredEvents.length}
            onPage={setArchivePage}
            label="Olay sayfaları"
          />
          <div className={styles.archive} data-testid="historical-archive">
            {visibleEvents.length === 0 && (
              <p className={styles.empty}>
                Bu filtrede olay yok. Bütün ülkeleri seçebilir veya aramayı
                temizleyebilirsin.
              </p>
            )}
            {visibleEvents.map((event) => {
              const pending = decisions.pending.get(event.id),
                result = decisions.resolved.get(event.id),
                focus = byId.get(`history-${event.id}`);
              const status = result
                ? (
                    {
                      accepted: "Kabul edildi",
                      declined: "Reddedildi",
                      unavailable: "Koşullar değişti",
                    } as const
                  )[result.outcome]
                : pending
                  ? "Karar bekliyor"
                  : country.focus?.id === `history-${event.id}`
                    ? "Hazırlanıyor"
                    : "Henüz gerçekleşmedi";
              return (
                <article
                  key={event.id}
                  className={styles.dossier}
                  data-event-id={event.id}
                >
                  <div className={styles.nodeHeading}>
                    <time dateTime={event.date}>
                      {historicalDate(event.date)}
                    </time>
                    <span>{status}</span>
                  </div>
                  <div className={styles.contentBadges}>
                    <span>{ERA_LABELS[eventEra(event)]}</span>
                    <span>{event.branch ?? "Diplomasi"}</span>
                    {event.countrySpecific && <span>Ülkeye özel</span>}
                  </div>
                  <h3>{event.title}</h3>
                  <p className={styles.parties}>
                    {countryNames.get(event.country) ?? event.country}
                    {event.target
                      ? ` → ${countryNames.get(event.target) ?? event.target}`
                      : ""}
                  </p>
                  <p>{event.description}</p>
                  {result && (
                    <p className={styles.resolution}>
                      {dateLabel(result.day)} · Kararı veren:{" "}
                      {world.countries[result.by]?.name ?? result.by}
                    </p>
                  )}
                  {pending && (
                    <p className={styles.resolution}>
                      {world.countries[pending.recipient]?.name} karar verecek.
                    </p>
                  )}
                  <EffectDetails event={event} />
                  {event.country === country.id && focus && !result && (
                    <button
                      type="button"
                      className={styles.goTo}
                      onClick={() => showFocus(focus.id)}
                    >
                      Odak ağacında göster <span aria-hidden="true">→</span>
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
