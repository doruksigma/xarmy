"use client";
import type { SimulationDiagnostics } from "./simulation";
import { dateLabel } from "./world";
import { hourLabel, HOURS_PER_DAY } from "./time";
import styles from "../europa.module.css";

/** Optional diagnostics; reading this panel never runs or changes the simulation. */
export default function SimulationMetrics({
  metrics,
}: {
  metrics: SimulationDiagnostics | null;
}) {
  return (
    <details className={styles.fold}>
      <summary>Simülasyon ölçümleri</summary>
      {metrics ? (
        <div
          data-testid="simulation-metrics"
          data-transport={metrics.transport}
          data-tick={metrics.tick}
          data-payload-bytes={metrics.payloadBytes}
          data-snapshot-bytes={metrics.snapshotBytes}
        >
          <p className={styles.hint}>
            Son kabul edilen saat:{" "}
            {dateLabel(Math.floor(metrics.tick / HOURS_PER_DAY))} ·{" "}
            {hourLabel(metrics.tick)}
            <br />
            Hesaplama: {metrics.computeMs.toFixed(1)} ms · Paket hazırlama:{" "}
            {metrics.encodeMs.toFixed(1)} ms
            <br />
            Paket (JSON eşdeğeri): {(metrics.payloadBytes / 1024).toFixed(1)} KB
            / tam durum {(metrics.snapshotBytes / 1024).toFixed(1)} KB
            <br />
            {metrics.transport === "delta"
              ? "Yalnız değişen veriler gönderildi."
              : "Tam durum gönderildi."}
          </p>
          {metrics.summary && (
            <p
              className={styles.hint}
              data-testid="simulation-checkpoint"
              data-tick={metrics.summary.tick}
            >
              Son dünya özeti ({hourLabel(metrics.summary.tick)} ·{" "}
              {Math.floor(metrics.summary.tick / HOURS_PER_DAY)}. gün):
              <br />
              <code>{metrics.summary.digest}</code>
            </p>
          )}
          <p className={styles.hint}>
            Bunlar son oyun saatinin ölçümleridir; haritanın FPS değeri ayrı
            ölçülür. Dünya özeti yeniden eşitlemede ve gün başında hesaplanır.
          </p>
        </div>
      ) : (
        <p className={styles.hint}>
          Ölçümler, zaman ilerleyip ilk saat tamamlanınca görünür.
        </p>
      )}
    </details>
  );
}
