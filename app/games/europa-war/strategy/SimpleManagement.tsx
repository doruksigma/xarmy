"use client";

import MilitaryIcon from "./MilitaryIcon";
import type { Tab } from "./WarPanels";
import styles from "./easy-play.module.css";

/** Navigation only: resource spending still requires the player's next choice. */
export default function SimpleManagement({
  onTab,
  onBuild,
}: {
  onTab: (tab: Tab) => void;
  onBuild: () => void;
}) {
  return (
    <section
      className={styles.management}
      data-testid="manual-management-hub"
      aria-label="Ülkeni kendin yönet"
    >
      <h3>Ne yapmak istiyorsun?</h3>
      <div className={styles.shortcuts}>
        <button
          type="button"
          data-testid="manual-recruit"
          onClick={() => onTab("army")}
        >
          <MilitaryIcon name="infantry" size={22} />
          <span>
            <strong>Tümen eğit</strong>
            <small>Birlik türünü seç</small>
          </span>
        </button>
        <button type="button" data-testid="manual-build" onClick={onBuild}>
          <MilitaryIcon name="factory" size={22} />
          <span>
            <strong>Yapı inşa et</strong>
            <small>Kendi bölgende kur</small>
          </span>
        </button>
        <button
          type="button"
          data-testid="manual-research"
          onClick={() => onTab("research")}
        >
          <MilitaryIcon name="research" size={22} />
          <span>
            <strong>Teknoloji seç</strong>
            <small>Yeni birlikleri aç</small>
          </span>
        </button>
        <button
          type="button"
          data-testid="manual-diplomacy"
          onClick={() => onTab("diplomacy")}
        >
          <MilitaryIcon name="diplomacy" size={22} />
          <span>
            <strong>Diplomasi yap</strong>
            <small>İlişkileri yönet</small>
          </span>
        </button>
      </div>
      <p>
        Bu kısayollar ilgili seçimleri açar. Harcamayı ve emri sen onaylarsın.
      </p>
      <p className={styles.more}>
        Uçak ve gemilerin için <strong>Hava / Deniz</strong> panelini aç.
        Siyaset için <strong>Tüm ayrıntılar</strong> görünümünü kullan.
      </p>
    </section>
  );
}
