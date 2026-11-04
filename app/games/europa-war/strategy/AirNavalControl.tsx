"use client";
import { AirNavalPanel } from "./AdvancedPanels";
import MilitaryIcon from "./MilitaryIcon";
import { effectiveAutomationEnabled } from "./management";
import type { Action, World } from "./types";
import styles from "../europa.module.css";

export default function AirNavalControl({
  w,
  command,
  target,
}: {
  w: World;
  command: (action: Action) => void;
  target: string;
}) {
  const country = w.countries[w.player];
  return (
    <>
      <div className={styles.card} data-testid="air-navy-control">
        <h3>
          <MilitaryIcon name="operations" /> Hava ve deniz komutası
        </h3>
        <p>
          Kanadını veya gemini seç, görevini ve hedefini belirle. Destek
          uçuşları kara savaşını; bombardıman sanayiyi, devriye ve eskortlar
          deniz ikmalini etkiler.
        </p>
        {(
          [
            ["air", "Hava kuvvetlerini yapay zekâ yönetsin"],
            ["navy", "Deniz kuvvetlerini yapay zekâ yönetsin"],
          ] as const
        ).map(([area, label]) => (
          <label key={area} className={styles.toggleRow}>
            <span>
              {label}
              <small>
                {effectiveAutomationEnabled(country, area)
                  ? "Yardımcı açık"
                  : "Emirleri sen veriyorsun"}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label={label}
              checked={effectiveAutomationEnabled(country, area)}
              onChange={(event) =>
                command({
                  type: "automation",
                  area,
                  enabled: event.target.checked,
                })
              }
            />
          </label>
        ))}
        <p className={styles.hint}>
          Yalnız açtığın kuvvet hemen, ardından haftada bir yönetilir; yedek
          araçları göreve alabilir ve emirleri yenileyebilir. Kapatınca mevcut
          görevler sürer, yeni kararları sen verirsin.
        </p>
      </div>
      <AirNavalPanel w={w} command={command} target={target} />
    </>
  );
}
