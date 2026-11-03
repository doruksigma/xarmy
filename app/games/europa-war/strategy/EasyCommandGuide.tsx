"use client";
import MilitaryIcon from "./MilitaryIcon";

import { useMemo, useState } from "react";
import { COMMANDER_CAPACITY } from "./commander-roster";
import { easyCommanderGuide } from "./easy-play";
import type { Action, World } from "./types";
import styles from "./easy-play.module.css";

export function EasyPlayMode({
  simple,
  onChange,
}: {
  simple: boolean;
  onChange: (simple: boolean) => void;
}) {
  return (
    <div className={styles.mode} role="group" aria-label="Yönetim görünümü">
      <button
        type="button"
        data-testid="easy-mode"
        aria-pressed={simple}
        onClick={() => onChange(true)}
      >
        Kolay yönetim
      </button>
      <button
        type="button"
        data-testid="full-mode"
        aria-pressed={!simple}
        onClick={() => onChange(false)}
      >
        Tüm ayrıntılar
      </button>
    </div>
  );
}

export default function EasyCommandGuide({
  world,
  command,
  paused,
  onResume,
  onDiplomacy,
  onArmy,
  onShowMap,
  selectedGeneralId,
  onSelectedGeneralChange,
}: {
  world: World;
  command: (action: Action) => boolean | void;
  paused: boolean;
  onResume?: () => void;
  onDiplomacy: (target: string) => void;
  onArmy: () => void;
  onShowMap?: () => void;
  selectedGeneralId?: string;
  onSelectedGeneralChange?: (id: string) => void;
}) {
  const [localSelectedId, setLocalSelectedId] = useState("");
  const selectedId = selectedGeneralId ?? localSelectedId;
  const [borderId, setBorderId] = useState("");
  const [changingBorder, setChangingBorder] = useState(false);
  const guide = useMemo(
    () => easyCommanderGuide(world, selectedId),
    [world, selectedId],
  );
  const { country, selected, members, deployedTarget } = guide;
  const border =
    guide.neighbors.find((neighbor) => neighbor.id === borderId) ??
    guide.neighbors.find((neighbor) => neighbor.id === deployedTarget?.id) ??
    guide.neighbors[0];
  const locked = country.capitulated;
  return (
    <section
      className={styles.guide}
      data-testid="easy-command-guide"
      aria-label="Adım adım komuta"
    >
      <header>
        <span aria-hidden="true">
          <MilitaryIcon
            name="command"
            size={24}
            style={{ marginInlineEnd: 0 }}
          />
        </span>
        <div>
          <h3>Orduna emir ver</h3>
          <small>
            {country.flag} {country.name} · {guide.total} tümen
          </small>
        </div>
      </header>
      {locked && (
        <p className={styles.status}>
          Ülken teslim oldu. Diplomasi ve barış koşullarını inceleyebilirsin.
        </p>
      )}
      <div className={styles.step}>
        <strong>1 · Komutanını hazırla</strong>
        {country.generals.length > 0 && (
          <label>
            Komutan
            <select
              aria-label="Rehber komutanı"
              value={selected?.id ?? ""}
              onChange={(event) => {
                if (onSelectedGeneralChange)
                  onSelectedGeneralChange(event.target.value);
                else setLocalSelectedId(event.target.value);
                setBorderId("");
                setChangingBorder(false);
              }}
            >
              {country.generals.map((general) => (
                <option key={general.id} value={general.id}>
                  {general.name} · {guide.counts.get(general.id) ?? 0}/
                  {COMMANDER_CAPACITY} tümen
                </option>
              ))}
            </select>
          </label>
        )}
        {guide.unassigned > 0 && (
          <>
            <p>
              {guide.unassigned} tümen boşta. İstersen mevcut ve yeni tümenleri
              en fazla 12 tümenlik gruplara otomatik bağla; dolunca yeni komutan
              açılır.
            </p>
            <button
              type="button"
              data-testid="easy-assign"
              className={`${styles.primary} ${styles.wide}`}
              disabled={locked}
              onClick={() =>
                command({ type: "commanderAutoAssign", enabled: true })
              }
            >
              Tümenleri komutanlara bağla
            </button>
          </>
        )}
        {members === 0 && (
          <p>
            {guide.total
              ? "Bu komutana tümen bağlı değil. Dolu bir komutan seçebilir veya Ordu bölümünden tümen atayabilirsin."
              : "Henüz tümenin yok. Ordu bölümünden kaynaklarına uygun bir tümen eğit."}
          </p>
        )}
        <button
          type="button"
          className={`${styles.subtle} ${styles.wide}`}
          onClick={onArmy}
        >
          Orduyu elle düzenle →
        </button>
      </div>
      {selected && members > 0 && (
        <div className={styles.step}>
          <strong>2 · Sınırını seç</strong>
          {deployedTarget && (
            <>
              <p className={styles.status} data-testid="easy-applied-front">
                {deployedTarget.flag} {deployedTarget.name} sınırı · {members}{" "}
                tümen
              </p>
              <button
                type="button"
                className={`${styles.subtle} ${styles.wide}`}
                aria-expanded={changingBorder}
                onClick={() => setChangingBorder((value) => !value)}
              >
                Sınırı değiştir
              </button>
            </>
          )}
          {(!deployedTarget || changingBorder) && (
            <>
              <p>
                Komşunu seç. Tümenlerin ulaşılabilen sınır bölgelerine eşit
                dağılsın.
              </p>
              <div
                className={styles.neighbors}
                role="group"
                aria-label="Rehber sınır seçimi"
              >
                {guide.neighbors.map((neighbor) => (
                  <button
                    type="button"
                    key={neighbor.id}
                    data-testid={`easy-target-${neighbor.id}`}
                    aria-pressed={border?.id === neighbor.id}
                    disabled={locked}
                    onClick={() => setBorderId(neighbor.id)}
                  >
                    <span aria-hidden="true">{neighbor.flag}</span>
                    <span>{neighbor.name}</span>
                  </button>
                ))}
              </div>
              {!guide.neighbors.length && (
                <p>
                  Kara sınırı paylaştığın bir ülke yok. Deniz ve hava
                  harekâtları Harekât bölümünde.
                </p>
              )}
              <button
                type="button"
                data-testid="easy-deploy"
                className={`${styles.primary} ${styles.wide}`}
                disabled={!guide.canDeploy || !border}
                onClick={() => {
                  if (
                    border &&
                    command({
                      type: "commanderDeploy",
                      general: selected.id,
                      target: border.id,
                    }) === true
                  )
                    setChangingBorder(false);
                }}
              >
                {border
                  ? `${border.name} sınırına yerleştir`
                  : "Sınır seçilemiyor"}
              </button>
            </>
          )}
        </div>
      )}
      {selected?.front && deployedTarget && members > 0 && (
        <div className={styles.step}>
          <strong>3 · {deployedTarget.name} cephesine emir ver</strong>
          <div className={styles.actions}>
            <button
              type="button"
              data-testid="easy-defend"
              aria-pressed={selected.front.stance === "defend"}
              disabled={locked}
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
              data-testid="easy-attack"
              aria-pressed={selected.front.stance === "attack"}
              disabled={!guide.canAttack}
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
          <p>
            {selected.front.stance === "attack"
              ? `Bu komutan yalnızca ${deployedTarget.name} birlikleri ve şehirlerine ilerler.`
              : `Bu komutan ${deployedTarget.name} sınırını tutar; düşman şehirlerine ilerlemez.`}
          </p>
          {deployedTarget.capitulated && (
            <p>Bu ülke teslim oldu. Gerekiyorsa başka bir sınır görevi seç.</p>
          )}
          {!guide.canAttack && !locked && !deployedTarget.capitulated && (
            <p>
              Saldırmak için önce diplomasiden savaş ilan et. Sınıra
              yerleştirmek savaş başlatmaz.
            </p>
          )}
          <button
            type="button"
            data-testid="easy-diplomacy"
            className={`${styles.subtle} ${styles.wide}`}
            onClick={() => onDiplomacy(deployedTarget.id)}
          >
            {deployedTarget.name} ile diplomasi →
          </button>
        </div>
      )}
      <div className={styles.step}>
        <p>
          {paused
            ? "Hazır olunca zamanı başlat; emirlerin ilerlesin."
            : "Zaman ilerliyor. Düşünmek için üstteki duraklat düğmesini kullan."}
        </p>
        {paused && onResume && (
          <button
            type="button"
            data-testid="easy-resume"
            aria-label="Rehberden zamanı ilerlet"
            className={`${styles.primary} ${styles.wide}`}
            disabled={locked}
            onClick={onResume}
          >
            <MilitaryIcon name="play" size={14} />
            Emirleri yürüt
          </button>
        )}
        {onShowMap && (
          <button
            type="button"
            className={`${styles.subtle} ${styles.wide}`}
            onClick={onShowMap}
          >
            Haritayı göster →
          </button>
        )}
      </div>
    </section>
  );
}
