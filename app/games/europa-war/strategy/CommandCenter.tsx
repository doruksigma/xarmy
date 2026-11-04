"use client";
import MilitaryIcon from "./MilitaryIcon";
import { useState } from "react";
import ActionPreview from "./ActionPreview";
import EasyCommandGuide from "./EasyCommandGuide";
import SimpleManagement from "./SimpleManagement";
import {
  advice,
  AUTOMATION,
  activeAutomationCount,
  effectiveAutomationEnabled,
} from "./management";
import { BUILDINGS, focusTree, TECHNOLOGIES } from "./catalog";
import { controlled, dateLabel, GEOGRAPHY } from "./world";
import { hourLabel } from "./time";
import { COMMAND_TICKS_PER_DAY } from "./command-types";
import type { Action, Country, World } from "./types";
import type { Tab } from "./WarPanels";
import styles from "../europa.module.css";

export default function CommandCenter({
  world: w,
  command,
  onTab,
  simple = false,
  paused = true,
  onResume,
  onDiplomacy,
  onShowMap,
  selectedGeneralId,
  onSelectedGeneralChange,
  onBuild,
}: {
  world: World;
  command: (a: Action) => boolean | void;
  onTab: (tab: Tab) => void;
  simple?: boolean;
  paused?: boolean;
  onResume?: () => void;
  onDiplomacy?: (target: string) => void;
  onShowMap?: () => void;
  selectedGeneralId?: string;
  onSelectedGeneralChange?: (id: string) => void;
  onBuild?: () => void;
}) {
  const [previewArea, setPreviewArea] =
    useState<keyof Country["automation"]>("research");
  const [automationOpen, setAutomationOpen] = useState(false);
  const [costPreviewOpen, setCostPreviewOpen] = useState(false);
  const c = w.countries[w.player],
    priorities = simple ? [] : advice(w),
    activeAssistants = activeAutomationCount(c);
  const armies = w.armies.filter((a) => a.country === c.id),
    wings = c.air.wings.reduce((n, a) => n + a.count, 0);
  return (
    <>
      <div className={styles.eyebrow}>
        GENEL DURUM · {c.wars.length ? "SAVAŞ DÖNEMİ" : "HAZIRLIK DÖNEMİ"}
      </div>
      <h2>
        <MilitaryIcon name="command" size={26} />
        Komuta merkezi
      </h2>
      <p className={styles.subtitle}>
        {simple
          ? "Ülkeni yönet, komutanına emir ver, zamanı ilerlet."
          : "Ülkenin yönünü sen belirle. Ayrıntıları istediğin zaman aç."}
      </p>
      {simple && (
        <SimpleManagement
          onTab={onTab}
          onBuild={onBuild ?? (() => onTab("province"))}
        />
      )}
      {simple && (
        <EasyCommandGuide
          world={w}
          command={command}
          paused={paused}
          onResume={onResume}
          onDiplomacy={onDiplomacy ?? (() => onTab("diplomacy"))}
          onArmy={() => onTab("army")}
          onShowMap={onShowMap}
          selectedGeneralId={selectedGeneralId}
          onSelectedGeneralChange={onSelectedGeneralChange}
        />
      )}
      <details className={styles.fold} open={!simple}>
        <summary>Oyun zorluğu</summary>
        <label className={styles.field}>
          Zorluk
          <select
            aria-label="Oyun zorluğu"
            value={w.difficulty}
            onChange={(e) =>
              command({
                type: "difficulty",
                value: e.target.value as World["difficulty"],
              })
            }
          >
            <option value="easy">Kolay</option>
            <option value="normal">Normal</option>
            <option value="hard">Zor</option>
          </select>
          <small>
            {w.difficulty === "easy"
              ? "Birliklerine %50 muharebe gücü desteği; rakipler sana karşı daha temkinli."
              : w.difficulty === "normal"
                ? "Bütün ülkeler aynı muharebe koşullarında."
                : "Birliklerin %15 daha az muharebe gücüyle savaşır."}
          </small>
        </label>
      </details>
      {!simple && (
        <details className={styles.fold} open>
          <summary>Ülke durumu ve öneriler</summary>
          <div className={styles.commandStats}>
            {[
              ["Bölge", controlled(w, c.id).length, "province"],
              ["Tümen", armies.length, "infantry"],
              ["Uçak", Math.floor(wings), "plane"],
              ["Gemi", c.navy.ships.length, "ship"],
            ].map(([label, n, icon]) => (
              <div key={label}>
                <strong>{n}</strong>
                <span>
                  <MilitaryIcon
                    name={icon as "province" | "infantry" | "plane" | "ship"}
                    size={15}
                  />
                  {label}
                </span>
              </div>
            ))}
          </div>
          <h3>Önce bunlara bak</h3>
          <div className={styles.priorities}>
            {priorities.map((p, i) => (
              <article key={p.id} className={styles.priority}>
                <span className={styles.priorityNumber}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h4>{p.title}</h4>
                  <p>{p.reason}</p>
                  <div className={styles.buttonRow}>
                    {p.action && (
                      <button
                        className={styles.primary}
                        onClick={() => command(p.action!)}
                      >
                        {p.id === "stability"
                          ? "Destek programını uygula"
                          : "Önerilen planı uygula"}
                      </button>
                    )}
                    <button onClick={() => onTab(p.tab)}>İncele →</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
      {simple && (
        <p className={styles.hint} data-testid="manual-control-status">
          {activeAssistants
            ? `${activeAssistants} yönetim yardımcısı açık. Aşağıdan ayarlarını değiştirebilirsin; görünüm değiştirmek bu tercihleri değiştirmez.`
            : "Sanayi, araştırma ve eğitim senin kontrolünde. Yönetim yardımcısı kapalı."}
        </p>
      )}
      <details
        className={styles.fold}
        open={automationOpen}
        onToggle={(event) => setAutomationOpen(event.currentTarget.open)}
      >
        <summary>
          Yönetim yardımcısı ·{" "}
          {activeAssistants ? `${activeAssistants} alan açık` : "kapalı"}
        </summary>
        <p>
          Açtığın alan hemen, ardından haftada bir ihtiyaçlara göre yönetilir.
          Araştırma, inşa ve eğitim için kendi kaynaklarını harcar. İstediğin
          anda kapatabilirsin; başlamış işler kuyrukta kalır.
        </p>
        {(
          Object.entries(AUTOMATION) as [keyof Country["automation"], string][]
        ).map(([area, name]) => (
          <label className={styles.toggleRow} key={area}>
            <span>
              {name}
              <small>
                {effectiveAutomationEnabled(c, area)
                  ? "Yardımcı yönetiyor"
                  : "Sen yönetiyorsun"}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label={`${name} otomatik yönetim`}
              checked={effectiveAutomationEnabled(c, area)}
              onChange={(e) =>
                command({ type: "automation", area, enabled: e.target.checked })
              }
            />
          </label>
        ))}
        <p className={styles.hint}>
          Savaş ilanı, barış koşulları ve siyasi yönetim değişimi her zaman
          senin kararın.
        </p>
        <details
          className={styles.fold}
          onToggle={(event) => setCostPreviewOpen(event.currentTarget.open)}
        >
          <summary>Yardımcı harcamalarını önizle</summary>
          <label className={styles.field}>
            Önizlenecek alan
            <select
              aria-label="Önizlenecek yardım alanı"
              value={previewArea}
              onChange={(event) =>
                setPreviewArea(
                  event.target.value as keyof Country["automation"],
                )
              }
            >
              {Object.entries(AUTOMATION).map(([area, name]) => (
                <option key={area} value={area}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {automationOpen && costPreviewOpen && (
            <ActionPreview
              world={w}
              action={{ type: "automation", area: previewArea, enabled: true }}
            />
          )}
          <p className={styles.hint}>
            Bu alanı şimdi açmanın kaynak etkisini gösterir. Gelecek haftaların
            harcamaları ihtiyaçlarına göre değişir.
          </p>
        </details>
      </details>
      <details className={styles.fold}>
        <summary>
          Devam eden işler{" "}
          <span>
            {c.research.length +
              c.construction.length +
              c.recruitment.length +
              Number(!!c.focus)}
          </span>
        </summary>
        {c.focus && (
          <p>
            <MilitaryIcon name="medal" size={15} />
            {focusTree(c.id).find((f) => f.id === c.focus!.id)?.name} ·{" "}
            {Math.ceil(c.focus.total - c.focus.progress)} gün
          </p>
        )}
        {c.research.map((q) => (
          <p key={q.id}>
            <MilitaryIcon name="research" size={15} />
            {TECHNOLOGIES.find((t) => t.id === q.id)?.name} · %
            {Math.floor((q.progress / q.total) * 100)}
          </p>
        ))}
        {c.construction.map((q) => (
          <p key={q.id}>
            <MilitaryIcon name="factory" size={15} />
            {BUILDINGS[q.building].name} · {GEOGRAPHY[q.province].name} · %
            {Math.floor((q.progress / q.total) * 100)}
          </p>
        ))}
        {c.recruitment.length > 0 && (
          <p>
            <MilitaryIcon name="infantry" size={15} />
            {c.recruitment.length} tümen eğitimde.
          </p>
        )}
        {!c.focus &&
          !c.research.length &&
          !c.construction.length &&
          !c.recruitment.length && <p>Henüz bir iş başlatılmadı.</p>}
      </details>
      {!simple && (
        <details className={styles.fold}>
          <summary>Ülkenin emirleri</summary>
          <p className={styles.hint}>
            Senin ve yönetim yardımcının son uygulanan emirleri kayıt dosyasıyla
            birlikte saklanır. Bu liste yalnızca kendi ülkeni gösterir.
          </p>
          {!w.commandState?.receipts.some((r) => r.issuerCountryId === c.id) ? (
            <p>Henüz kayıtlı bir emrin yok.</p>
          ) : (
            <ol className={styles.helpSteps} aria-label="Uygulanan emirler">
              {w
                .commandState!.receipts.filter(
                  (r) => r.issuerCountryId === c.id,
                )
                .slice(-12)
                .reverse()
                .map((r) => (
                  <li key={r.commandId}>
                    <strong>{r.summary}</strong>
                    <br />
                    <small>
                      {dateLabel(
                        Math.floor(r.appliedTick / COMMAND_TICKS_PER_DAY),
                      )}
                      {" · "}
                      {hourLabel(r.appliedTick)}
                    </small>
                  </li>
                ))}
            </ol>
          )}
        </details>
      )}
      {!simple && (
        <details className={styles.fold}>
          <summary>Nasıl oynanır?</summary>
          <ol className={styles.helpSteps}>
            <li>
              Araştırma, ulusal odak ve üretim seç. Yardımcıya da
              bırakabilirsin.
            </li>
            <li>Üstteki ▶ ile zamanı ilerlet. Boşluk tuşuyla duraklat.</li>
            <li>
              Diplomaside ilişkiler kur. Savaşa gireceksen gerekçe hazırla.
            </li>
            <li>
              Ordu panelinde tümenleri seç, haritadan hedefleri işaretle.
              Hazırlık tamamlanınca taarruzu başlat.
            </li>
            <li>
              İkmal ve yakıtı izle. Uçakları ve gemileri uygun bölgelere gönder.
            </li>
            <li>
              Zaferden sonra barış görüşmelerinde yeni sınırları belirle.
              Kayıtlar cihazında saklanır.
            </li>
          </ol>
        </details>
      )}
    </>
  );
}
