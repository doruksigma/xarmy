"use client";

import { useMemo, useState } from "react";
import { focusTree, type Focus } from "./catalog";
import { HISTORICAL_EVENTS } from "./historical-catalog";
import { historicalFocusAvailability } from "./historical-events";
import MilitaryIcon from "./MilitaryIcon";
import { dateLabel } from "./world";
import type { Action, World } from "./types";
import styles from "./historical-events.module.css";

const HISTORY_BRANCH = "historical";
const ALL_BRANCHES = "all";

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
  if (focus.id.startsWith("history-"))
    return historicalFocusAvailability(world, c, focus.id.slice(8));
  return null;
}

/** A reachable national tree and a separate, persistent historical dossier. */
export default function HistoricalEvents({
  world,
  onAction,
}: {
  world: World;
  onAction: (action: Action) => unknown;
}) {
  const country = world.countries[world.player];
  const focuses = useMemo(() => focusTree(country.id), [country.id]);
  const byId = useMemo(() => new Map(focuses.map((f) => [f.id, f])), [focuses]);
  const hasHistorical = focuses.some((f) => f.id.startsWith("history-"));
  const [view, setView] = useState<"tree" | "archive">("tree");
  const [branch, setBranch] = useState(
    hasHistorical ? HISTORY_BRANCH : ALL_BRANCHES,
  );
  const [scope, setScope] = useState<"country" | "world">("country");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const branches = [
    ...new Set(
      focuses.filter((f) => !f.id.startsWith("history-")).map((f) => f.branch),
    ),
  ];
  const visible = focuses.filter(
    (f) =>
      branch === ALL_BRANCHES ||
      (branch === HISTORY_BRANCH
        ? f.id.startsWith("history-")
        : !f.id.startsWith("history-") && f.branch === branch),
  );
  const depth = (focus: Focus, visited = new Set<string>()): number => {
    if (visited.has(focus.id)) return 0;
    const next = new Set(visited).add(focus.id);
    return Math.max(
      0,
      ...focus.requires.map((id) => {
        const parent = byId.get(id);
        return parent ? 1 + depth(parent, next) : 0;
      }),
    );
  };
  const ordered = [...visible].sort((a, b) => depth(a) - depth(b));
  const active = country.focus && byId.get(country.focus.id);
  const events = HISTORICAL_EVENTS.filter((event) => {
    const involved =
      event.country === country.id || event.target === country.id;
    const text = `${event.title} ${world.countries[event.country]?.name ?? ""} ${event.target ? (world.countries[event.target]?.name ?? "") : ""}`;
    return (
      (scope === "world" || involved) &&
      text
        .toLocaleLowerCase("tr-TR")
        .includes(query.toLocaleLowerCase("tr-TR").trim())
    );
  })
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  function showFocus(id: string) {
    const focus = byId.get(id);
    if (!focus) return;
    setView("tree");
    setBranch(focus.id.startsWith("history-") ? HISTORY_BRANCH : focus.branch);
    setHighlight(id);
    // The filter commits first; scrolling stays inside the management panel.
    requestAnimationFrame(() => {
      const node = document.getElementById(`focus-node-${id}`);
      node?.scrollIntoView({ block: "nearest", behavior: "auto" });
      node?.focus({ preventScroll: true });
    });
  }

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
        Bir odak seç, hazırlığını tamamla ve gelen kararı imzala. Tarihî
        odakların diplomasi maliyeti mevcut siyasi gücünden bir kez düşer.
      </p>
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
            </div>
          )}
          <label className={styles.field}>
            Odak dalı
            <select
              aria-label="Odak dalı"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setHighlight(null);
              }}
            >
              {hasHistorical && (
                <option value={HISTORY_BRANCH}>Tarihî diplomasi</option>
              )}
              <option value={ALL_BRANCHES}>Bütün ulusal odaklar</option>
              {branches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>
            Bağlantı etiketine dokunarak gereken önceki odağa gidebilirsin.
          </p>
          <div className={styles.tree} aria-label="Ulusal odak ağacı">
            {ordered.map((focus) => {
              const done = country.focuses.includes(focus.id);
              const block = focusBlock(world, focus);
              const definition = HISTORICAL_EVENTS.find(
                (event) => `history-${event.id}` === focus.id,
              );
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
                        {definition ? "TARİHÎ DİPLOMASİ" : focus.branch}
                      </small>
                      <span>
                        {done
                          ? "TAMAMLANDI"
                          : country.focus?.id === focus.id
                            ? "ETKİN"
                            : `AŞAMA ${depth(focus) + 1}`}
                      </span>
                    </div>
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
                    </div>
                    {definition && (
                      <p className={styles.hint}>
                        Tarihsel mod eşiği: {historicalDate(definition.date)}.
                        Alternatif tarihte daha erken hazırlanabilir. Hazırlık
                        bitince kabul veya vazgeçme kararını sen verirsin.
                      </p>
                    )}
                    {focus.excludes && (
                      <p className={styles.hint}>
                        Alternatif yol:{" "}
                        {byId.get(focus.excludes)?.name ?? focus.excludes}
                      </p>
                    )}
                    <button
                      type="button"
                      className={styles.start}
                      disabled={!!block}
                      aria-describedby={
                        block ? `focus-block-${focus.id}` : undefined
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
            1936–1945 döneminden {HISTORICAL_EVENTS.length} olay ve anlaşma. Bu
            seferde alınan kararlar ve sonuçları kayıt dosyanla birlikte
            saklanır.
          </p>
          <div className={styles.filters}>
            <label className={styles.field}>
              Kapsam
              <select
                aria-label="Tarihî olay kapsamı"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "country" | "world")
                }
              >
                <option value="country">Ülkemi ilgilendiren</option>
                <option value="world">Bütün ülkeler</option>
              </select>
            </label>
            <label className={styles.field}>
              Olay ara
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Anschluss, Montrö…"
              />
            </label>
          </div>
          <div className={styles.archive} data-testid="historical-archive">
            {events.length === 0 && (
              <p className={styles.empty}>
                Bu filtrede olay yok. Bütün ülkeleri seçebilir veya aramayı
                temizleyebilirsin.
              </p>
            )}
            {events.map((event) => {
              const pending = world.historical?.pending.find(
                (decision) => decision.eventId === event.id,
              );
              const result = world.historical?.resolved.find(
                (decision) => decision.eventId === event.id,
              );
              const own = event.country === country.id;
              const focus = byId.get(`history-${event.id}`);
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
                  <h3>{event.title}</h3>
                  <p className={styles.parties}>
                    {world.countries[event.country]?.flag}{" "}
                    {world.countries[event.country]?.name}
                    {event.target
                      ? ` → ${world.countries[event.target]?.name ?? event.target}`
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
                  <details className={styles.outcomes}>
                    <summary>Kararlar ve etkileri</summary>
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
                      Hazırlık: {event.days} gün · Diplomasi maliyeti:{" "}
                      {event.cost} siyasi güç. Karar anında güncel ülke
                      koşulları tekrar kontrol edilir.
                    </p>
                  </details>
                  {own && focus && !result && (
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
