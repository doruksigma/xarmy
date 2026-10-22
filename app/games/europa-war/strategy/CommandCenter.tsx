"use client";
import { advice, AUTOMATION } from "./management";
import { BUILDINGS, focusTree, TECHNOLOGIES } from "./catalog";
import { controlled, GEOGRAPHY } from "./world";
import type { Action, Country, World } from "./types";
import type { Tab } from "./WarPanels";
import styles from "../europa.module.css";

export default function CommandCenter({
  world: w,
  command,
  onTab,
}: {
  world: World;
  command: (a: Action) => void;
  onTab: (tab: Tab) => void;
}) {
  const c = w.countries[w.player],
    priorities = advice(w);
  const armies = w.armies.filter((a) => a.country === c.id),
    wings = c.air.wings.reduce((n, a) => n + a.count, 0);
  return (
    <>
      <div className={styles.eyebrow}>
        GENEL DURUM · {c.wars.length ? "SAVAŞ DÖNEMİ" : "HAZIRLIK DÖNEMİ"}
      </div>
      <h2>Komuta merkezi</h2>
      <p className={styles.subtitle}>
        Ülkenin yönünü sen belirle. Ayrıntıları istediğin zaman aç.
      </p>
      <div className={styles.commandStats}>
        {[
          ["Bölge", controlled(w, c.id).length],
          ["Tümen", armies.length],
          ["Uçak", Math.floor(wings)],
          ["Gemi", c.navy.ships.length],
        ].map(([label, n]) => (
          <div key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
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
      <details className={styles.fold} open>
        <summary>Yönetim yardımcısı</summary>
        <p>
          Açtığın alan haftada bir ihtiyaçlara göre yönetilir. Harcamalar kendi
          kaynaklarından yapılır. İstediğin anda kapatabilirsin.
        </p>
        {(
          Object.entries(AUTOMATION) as [keyof Country["automation"], string][]
        ).map(([area, name]) => (
          <label className={styles.toggleRow} key={area}>
            <span>
              {name}
              <small>
                {c.automation[area] ? "Yardımcı yönetiyor" : "Sen yönetiyorsun"}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label={`${name} otomatik yönetim`}
              checked={c.automation[area]}
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
            ✦ {focusTree(c.id).find((f) => f.id === c.focus!.id)?.name} ·{" "}
            {Math.ceil(c.focus.total - c.focus.progress)} gün
          </p>
        )}
        {c.research.map((q) => (
          <p key={q.id}>
            ⌬ {TECHNOLOGIES.find((t) => t.id === q.id)?.name} · %
            {Math.floor((q.progress / q.total) * 100)}
          </p>
        ))}
        {c.construction.map((q) => (
          <p key={q.id}>
            ▥ {BUILDINGS[q.building].name} · {GEOGRAPHY[q.province].name} · %
            {Math.floor((q.progress / q.total) * 100)}
          </p>
        ))}
        {c.recruitment.length > 0 && (
          <p>⚑ {c.recruitment.length} tümen eğitimde.</p>
        )}
        {!c.focus &&
          !c.research.length &&
          !c.construction.length &&
          !c.recruitment.length && <p>Henüz bir iş başlatılmadı.</p>}
      </details>
      <details className={styles.fold}>
        <summary>Nasıl oynanır?</summary>
        <ol className={styles.helpSteps}>
          <li>
            Araştırma, ulusal odak ve üretim seç. Yardımcıya da bırakabilirsin.
          </li>
          <li>Üstteki ▶ ile zamanı ilerlet. Boşluk tuşuyla duraklat.</li>
          <li>Diplomaside ilişkiler kur. Savaşa gireceksen gerekçe hazırla.</li>
          <li>
            Ordu panelinde tümenleri seç, haritadan hedefleri işaretle. Hazırlık
            tamamlanınca taarruzu başlat.
          </li>
          <li>
            İkmal ve yakıtı izle. Uçakları ve gemileri uygun bölgelere gönder.
          </li>
          <li>
            Zaferden sonra barış görüşmelerinde yeni sınırları belirle. Kayıtlar
            cihazında saklanır.
          </li>
        </ol>
      </details>
    </>
  );
}
