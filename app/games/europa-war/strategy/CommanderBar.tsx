"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  COMMANDER_CAPACITY,
  commanderArmies,
  commanderBorders,
  commanderTargets,
} from "./commanders";
import { atWar } from "./world";
import type { Action, General, World } from "./types";
import styles from "./commander-bar.module.css";

/** Original vector portrait, drawn locally; no remote images or asset loading. */
const CommanderPortrait = memo(function CommanderPortrait({
  id,
}: {
  id: string;
}) {
  const variant = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const uniform = ["#64715c", "#596a70", "#706659"][variant % 3];
  const skin = ["#cfaa86", "#c09975", "#b88f70"][variant % 3];
  return (
    <svg viewBox="0 0 72 82" aria-hidden="true" focusable="false">
      <path fill="#23352e" d="M0 0h72v82H0z" />
      <path fill="#344c3e" d="m0 49 72-34v67H0z" />
      <path fill={uniform} d="M7 82V68q3-12 19-15h20q16 3 19 15v14" />
      <path fill="#b38c6c" d="M29 45h14v16l-7 6-7-6z" />
      <ellipse cx="36" cy="32" rx="15" ry="22" fill={skin} />
      <path fill="#a67e5c" d="M42 14q15 23-1 37l-5 2q14-19 6-39" />
      <path fill="#3a3931" d="M21 23v13l3-7 2-12h20l3 14 2 5V22L43 9H28z" />
      <path fill={uniform} d="M14 16 23 5h27l8 11-7 8H21z" />
      <path fill="#b8a56b" d="M19 19h34v4H19z" />
      <path fill="#26352e" d="M19 23h34q-2 6-17 6t-17-6" />
      <path fill="#d7be7f" d="m36 9 2 4 4 1-3 3v4l-3-2-4 2 1-4-3-3 4-1z" />
      <path d="m26 33 5-1m10 0 5 1" stroke="#4d4439" strokeWidth="2" />
      <path
        d="m35 34-2 9h5m-8 4 6 2 6-2"
        fill="none"
        stroke="#8d654a"
        strokeWidth="1.4"
      />
      {variant % 2 === 0 && (
        <path d="m28 46 8-2 8 2-4 3-4-1-4 1z" fill="#514438" />
      )}
      <path fill="#28392e" d="m25 54 11 13-10 8-6-18m27-3L36 67l10 8 6-18" />
      <path fill="#d3bc7c" d="m9 64 13-4 2 5-14 4m53-5-13-4-2 5 14 4" />
      <path d="M36 67v15" stroke="#a3a88b" strokeWidth="1" />
      <path fill="#bea866" d="M45 73h10v2H45z" />
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
              ×
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
                  ◇ Savun
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
                  ↗ Saldır
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
          <span>Yeni tümenleri otomatik komutana ata</span>
        </label>
        <button
          type="button"
          data-testid="commander-create"
          disabled={locked}
          onClick={() => command({ type: "commanderCreate" })}
        >
          + Komutan
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
              disabled={locked}
              aria-expanded={selected?.id === general.id}
              aria-label={`${general.name}, ${size}/${COMMANDER_CAPACITY} tümen`}
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
                  {size}/{COMMANDER_CAPACITY} tümen
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
    </section>
  );
}
