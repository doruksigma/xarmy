"use client";
import MilitaryIcon from "./MilitaryIcon";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  COMMANDER_CAPACITY,
  commanderArmies,
  commanderBorders,
  commanderTargets,
} from "./commanders";
import { atWar } from "./world";
import type { Action, General, World } from "./types";
import styles from "./commander-bar.module.css";

/** Original local portrait art; a reusable SVG keeps the dock sharp at every scale. */
const CommanderPortrait = memo(function CommanderPortrait({
  id,
}: {
  id: string;
}) {
  const gradient = useId();
  const variant = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const uniform = ["#626b56", "#596269", "#726756"][variant % 3];
  const skin = ["#cfaa86", "#c09975", "#b88f70"][variant % 3];
  return (
    <svg viewBox="0 0 72 82" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${gradient}-back`} x2="1" y2="1">
          <stop stopColor="#665e4d" />
          <stop offset=".5" stopColor="#343a32" />
          <stop offset="1" stopColor="#131b19" />
        </linearGradient>
        <linearGradient id={`${gradient}-cloth`} x2="1" y2=".2">
          <stop stopColor="#252d28" />
          <stop offset=".42" stopColor={uniform} />
          <stop offset="1" stopColor="#343c32" />
        </linearGradient>
        <linearGradient id={`${gradient}-face`} x2="1" y2=".4">
          <stop stopColor="#967155" />
          <stop offset=".4" stopColor={skin} />
          <stop offset=".65" stopColor="#d5b291" />
          <stop offset="1" stopColor="#785b49" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradient}-back)`} d="M0 0h72v82H0z" />
      <path fill="#a1947050" d="m0 0 18 0L0 65z" />
      <path
        fill={`url(#${gradient}-cloth)`}
        d="M2 82 6 66q2-6 20-11h21q16 5 19 11l5 16z"
      />
      <path fill="#8f6b50" d="m29 46 14-1 1 14-8 11-9-12z" />
      <path fill="#a27f60" d="m21 29-3 1 1 11 5 3m25-15 4 2-2 11-4 2" />
      <path
        fill={`url(#${gradient}-face)`}
        d="M22 22q14-11 27 0l-2 21-5 10-7 4-8-6-4-11z"
      />
      <path fill="#ded0b346" d="m27 28 6-2-3 8-5 2m12-10 7 3 1 5-5-1z" />
      <path fill="#614d3d" d="m25 49 11 3 9-6-4 8-6 3z" opacity=".48" />
      <path d="m25 32 7-1m7 0 7 2" stroke="#514335" strokeWidth="1.7" />
      <path d="m26 34 5 .2m9-.1 5 .6" stroke="#302f2b" strokeWidth="1" />
      <path
        d="m35 34-2 9 5 1m-7 4 6 1 5-2"
        fill="none"
        stroke="#8f624a"
        strokeWidth="1.2"
      />
      <path
        d="m27 39-2 5m19-6 1 5"
        stroke="#87634d"
        strokeWidth=".7"
        opacity=".7"
      />
      <path fill="#3b3b31" d="M21 27v10l3-9 1-8h22l1 10 2 4V22L43 11H28z" />
      <path
        fill={`url(#${gradient}-cloth)`}
        d="m14 18 8-10 14-3 16 5 7 10-8 6H21z"
      />
      <path
        d="m21 15 15-6 17 7"
        fill="none"
        stroke="#afb091"
        strokeWidth=".6"
        opacity=".65"
      />
      <path fill="#373e32" d="m20 21 32 1v6H21z" />
      <path fill="#b8a56b" d="m21 24 31 1-.4 1.4-30.4-1z" />
      <path fill="#19211e" d="m21 27 32 1q-4 5-18 4l-13-2z" />
      <path d="m23 29 23 1" stroke="#8a9078" strokeWidth=".65" />
      <path fill="#c3ae79" d="m36 13 3 3-1 5-4 1-2-4 1-4z" />
      <path fill="#555b43" d="m35 15 2 1-.5 3-1.5.5-1-2z" />
      {variant % 2 === 0 && (
        <path d="m29 46 7-1.5 7 1.5-3 2-4-.5-4 .5z" fill="#574738" />
      )}
      <path fill="#2d352d" d="m26 54 10 15-10 9-7-20m28-4L36 69l10 9 7-20" />
      <path
        d="m25 57 7 12-7 5m23-17-8 12 7 5"
        fill="none"
        stroke="#b6b194"
        strokeWidth=".65"
      />
      <path fill="#aaa079" d="m7 66 14-6 2 4-15 6m57-4-14-6-2 4 15 6" />
      <path d="m10 66 11-4m31 0 10 4" stroke="#d9c9a1" strokeWidth="1" />
      <path d="M36 68v14" stroke="#9c9f80" strokeWidth=".8" />
      <circle cx="37" cy="75" r="1.1" fill="#c3b27b" />
      <circle cx="37" cy="81" r="1.1" fill="#c3b27b" />
      <path fill="#bda774" d="M46 70h11v2H46z" />
      <path fill="#773e32" d="M46 72h3v3h-3z" />
      <path fill="#b6bba5" d="M50 72h3v3h-3z" />
      <path fill="#beaa6f" d="M54 72h3v3h-3z" />
      <path
        d="M1 1h70v80H1z"
        fill="none"
        stroke="#c9b98a"
        strokeOpacity=".18"
      />
    </svg>
  );
});

export default function CommanderBar({
  world,
  disabled,
  paused,
  command,
  onSelect,
}: {
  world: World;
  disabled: boolean;
  paused: boolean;
  command: (action: Action) => boolean;
  onSelect: (armies: string[]) => void;
}) {
  const country = world.countries[world.player];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosingBorder, setChoosingBorder] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const activeCard = useRef<HTMLButtonElement | null>(null);
  const selected = country.generals.find((g) => g.id === selectedId);
  const members = useMemo(() => {
    const counts = new Map<string, number>();
    for (const army of world.armies)
      if (army.country === country.id && army.general)
        counts.set(army.general, (counts.get(army.general) ?? 0) + 1);
    return counts;
  }, [world.armies, country.id]);
  const neighbors = useMemo(
    () => (choosingBorder ? commanderTargets(world, country.id) : []),
    [world, country.id, choosingBorder],
  );
  const count = selected ? (members.get(selected.id) ?? 0) : 0;
  const target = selected?.front
    ? world.countries[selected.front.target]
    : undefined;
  const locked = disabled || country.capitulated;
  const canAttack = Boolean(target && atWar(world, country.id, target.id));

  useEffect(() => {
    if (selectedId) panelRef.current?.focus({ preventScroll: true });
  }, [selectedId]);

  function closePanel() {
    setSelectedId(null);
    setChoosingBorder(false);
    activeCard.current?.focus({ preventScroll: true });
  }

  function choose(general: General) {
    setSelectedId((id) => (id === general.id ? null : general.id));
    setChoosingBorder(false);
    onSelect(commanderArmies(world, country.id, general.id).map((a) => a.id));
  }

  return (
    <section
      className={styles.bar}
      aria-label="Komutanlar"
      data-testid="commander-bar"
    >
      {selected && (
        <section
          ref={panelRef}
          tabIndex={-1}
          className={styles.panel}
          data-testid="commander-panel"
          aria-label={`${selected.name} komuta emirleri`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closePanel();
            }
            // Space belongs to the focused drawer/control, not the map clock.
            // Keep native button/checkbox activation and drawer scrolling.
            if (event.code === "Space") event.stopPropagation();
          }}
        >
          <div className={styles.heading}>
            <div className={styles.largePortrait}>
              <CommanderPortrait id={selected.id} />
            </div>
            <div>
              <small>KOMUTA EMİRLERİ</small>
              <h3>{selected.name}</h3>
              <span>
                {count}/{COMMANDER_CAPACITY} tümen ·{" "}
                {target ? `${target.name} cephesi` : "Sınıra atanmadı"}
              </span>
            </div>
            <button
              type="button"
              aria-label="Komutan panelini kapat"
              onClick={closePanel}
            >
              <MilitaryIcon
                name="close"
                size={14}
                style={{ marginInlineEnd: 0 }}
              />
            </button>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              data-testid="commander-deploy"
              disabled={locked || count === 0}
              aria-expanded={choosingBorder}
              onClick={() => setChoosingBorder((value) => !value)}
            >
              Sınırlara yerleştir
            </button>
            {selected.front && (
              <button
                type="button"
                data-testid="commander-recall"
                disabled={locked}
                onClick={() => {
                  if (
                    command({ type: "commanderRecall", general: selected.id })
                  )
                    setChoosingBorder(false);
                }}
              >
                Sınır görevini kaldır
              </button>
            )}
          </div>
          {count === 0 && (
            <p>
              Bu komutana henüz tümen bağlı değil. Otomatik atamayı açabilir
              veya Ordu panelinden tümen atayabilirsin.
            </p>
          )}
          {choosingBorder && (
            <div
              className={styles.borderPicker}
              aria-label="Komşu ülke seçimi"
              data-testid="commander-targets"
            >
              <p>
                Bir bayrağa dokun. Tümenler o ülkeye bakan erişilebilir sınır
                bölgelerine dengeli dağılır.
              </p>
              <div className={styles.countries}>
                {neighbors.map((neighbor) => (
                  <button
                    type="button"
                    key={neighbor.id}
                    data-testid={`commander-target-${neighbor.id}`}
                    aria-label={`${neighbor.name} sınırına yerleştir`}
                    disabled={locked}
                    onClick={() => {
                      if (
                        command({
                          type: "commanderDeploy",
                          general: selected.id,
                          target: neighbor.id,
                        })
                      )
                        setChoosingBorder(false);
                    }}
                  >
                    <span
                      className={styles.flag}
                      style={{ background: neighbor.color }}
                      aria-hidden="true"
                    >
                      {neighbor.flag}
                    </span>
                    <span>
                      {neighbor.name}
                      <small>
                        {
                          commanderBorders(world, country.id, neighbor.id)
                            .length
                        }{" "}
                        sınır bölgesi
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              {!neighbors.length && (
                <p>Kara sınırı paylaştığın bir ülke yok.</p>
              )}
            </div>
          )}
          {selected.front && target ? (
            <>
              <div
                className={styles.orders}
                role="group"
                aria-label="Komutanın cephe emri"
              >
                <button
                  type="button"
                  data-testid="commander-defend"
                  disabled={locked}
                  aria-pressed={selected.front.stance === "defend"}
                  onClick={() =>
                    command({
                      type: "commanderStance",
                      general: selected.id,
                      stance: "defend",
                    })
                  }
                >
                  <MilitaryIcon name="defend" size={16} />
                  Savun
                </button>
                <button
                  type="button"
                  data-testid="commander-attack"
                  disabled={locked || !canAttack}
                  aria-pressed={selected.front.stance === "attack"}
                  onClick={() =>
                    command({
                      type: "commanderStance",
                      general: selected.id,
                      stance: "attack",
                    })
                  }
                >
                  <MilitaryIcon name="attack" size={16} />
                  Saldır
                </button>
              </div>
              <p data-testid="commander-order-description">
                {selected.front.stance === "attack"
                  ? `Yalnızca ${target.name} birliklerine ve şehirlerine ilerler. Diğer cephelere katılmaz.`
                  : `${target.name} sınırını tutar ve gelen saldırıları karşılar. Düşman şehirlerine ilerlemez.`}
              </p>
              {!canAttack && (
                <p className={styles.notice}>
                  Saldırmak için önce Diplomasi panelinden {target.name} ile
                  savaşta olmalısın.
                </p>
              )}
              {paused && (
                <p className={styles.notice}>
                  Zaman duraklatıldı. Birlikleri hareket ettirmek için ▶
                  düğmesine bas.
                </p>
              )}
            </>
          ) : (
            <p>
              Önce bir sınıra yerleştir. Bu komutan emir verilmeden başka
              komutanın cephesine katılmaz.
            </p>
          )}
        </section>
      )}
      <div className={styles.dock}>
        <div className={styles.toolbar}>
          <strong>KOMUTANLAR</strong>
          <label className={styles.autoAssign}>
            <input
              type="checkbox"
              data-testid="commander-auto-assign"
              checked={country.autoAssignCommanders === true}
              disabled={locked}
              onChange={(event) =>
                command({
                  type: "commanderAutoAssign",
                  enabled: event.currentTarget.checked,
                })
              }
            />
            <span title="Yeni tümenleri otomatik komutana ata">
              Otomatik ata
            </span>
            <span className={styles.srOnly}>
              {" "}
              — Yeni tümenleri otomatik komutana ata
            </span>
          </label>
          <button
            type="button"
            data-testid="commander-create"
            aria-label="+ Komutan"
            disabled={locked}
            onClick={() => command({ type: "commanderCreate" })}
          >
            <MilitaryIcon name="plus" size={13} />
            Komutan
          </button>
        </div>
        <div className={styles.roster}>
          {country.generals.map((general) => {
            const size = members.get(general.id) ?? 0;
            const opponent =
              general.front && world.countries[general.front.target];
            return (
              <button
                type="button"
                key={general.id}
                data-testid={`commander-card-${general.id}`}
                data-general={general.id}
                className={styles.card}
                data-stance={general.front?.stance ?? "idle"}
                disabled={locked}
                title={`${general.name} · ${size}/${COMMANDER_CAPACITY} tümen · ${opponent ? `${opponent.name}: ${general.front!.stance === "attack" ? "Saldırıyor" : "Savunuyor"}` : "Emir bekliyor"}`}
                aria-expanded={selected?.id === general.id}
                aria-label={`${general.name}, ${size}/${COMMANDER_CAPACITY} tümen${opponent ? `, ${opponent.name}, ${general.front!.stance === "attack" ? "Saldırıyor" : "Savunuyor"}` : ", Emir bekliyor"}`}
                onClick={(event) => {
                  activeCard.current = event.currentTarget;
                  choose(general);
                }}
              >
                <span className={styles.portrait}>
                  <CommanderPortrait id={general.id} />
                </span>
                <span className={styles.cardText}>
                  <strong>{general.name}</strong>
                  <span>
                    {size}/{COMMANDER_CAPACITY}
                    <span className={styles.srOnly}> tümen</span>
                  </span>
                  <small>
                    {opponent
                      ? `${opponent.flag} ${general.front!.stance === "attack" ? "Saldırıyor" : "Savunuyor"}`
                      : "Emir bekliyor"}
                  </small>
                </span>
              </button>
            );
          })}
          <span className={styles.capacityHint}>
            Her komutan en fazla 12 tümen yönetir.
            <br />
            Hepsi dolunca yeni tümen için komutan oluşturulur.
          </span>
        </div>
      </div>
    </section>
  );
}
