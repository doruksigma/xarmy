import MilitaryIcon from "./MilitaryIcon";
import { dateLabel } from "./world";
import type { World } from "./types";
import styles from "./air-naval-report.module.css";

const formatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});

function amount(value: number) {
  return value > 0 && value < 0.01 ? "<0,01" : formatter.format(value);
}

function Metric({
  id,
  label,
  value,
  unit,
  loss = false,
}: {
  id: string;
  label: string;
  value: number;
  unit?: string;
  loss?: boolean;
}) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd
        data-testid={`air-naval-metric-${id}`}
        data-value={value}
        data-tone={loss && value > 0 ? "loss" : undefined}
      >
        {amount(value)}
        {unit && <small> {unit}</small>}
      </dd>
    </div>
  );
}

/** Only the player's completed settlement is exposed in this panel. */
export default function AirNavalReport({ w }: { w: World }) {
  const report = w.airNavalReports?.find((entry) => entry.country === w.player);
  return (
    <section
      className={styles.report}
      aria-label={`${w.countries[w.player].name} hava ve deniz günlük raporu`}
      data-testid="air-naval-report"
      data-report-country={w.player}
      data-report-day={report?.day}
    >
      <header className={styles.header}>
        <MilitaryIcon name="operations" size={20} />
        <div>
          <h3 className={styles.heading}>Günlük harekât raporu</h3>
          {report && (
            <p className={styles.date}>
              Rapor tarihi: <strong>{dateLabel(report.day)}</strong>
              {report.day < w.day && " · Son kayıtlı rapor"}
            </p>
          )}
        </div>
      </header>
      {!report ? (
        <p className={styles.notice} data-testid="air-naval-report-empty">
          İlk günlük rapor, takvim bir sonraki güne geçtiğinde oluşur. Uçak ve
          gemilerinin gerçek görev sonuçları burada gösterilir.
        </p>
      ) : (
        <>
          <dl className={styles.headlines}>
            <Metric
              id="aircraft-losses"
              label="Uçak kaybı"
              value={
                report.air.combatLosses +
                report.air.baseLosses +
                report.navy.aircraftLost
              }
              loss
            />
            <Metric
              id="ships-sunk"
              label="Batan gemi"
              value={report.navy.sunk}
              loss
            />
            <Metric
              id="fuel-spent"
              label="Yakıt tüketimi"
              value={report.air.fuelSpent + report.navy.fuelSpent}
            />
            <Metric
              id="bombing-damage"
              label="Verilen tesis hasarı"
              value={report.air.bombingDamage}
              unit="puan"
            />
          </dl>
          <details className={styles.breakdown}>
            <summary>Görev ve kayıp ayrıntıları</summary>
            <h4 className={styles.subheading}>
              <MilitaryIcon name="plane" size={16} /> Hava kuvvetleri
            </h4>
            <dl className={styles.rows}>
              <Metric
                id="air-flown"
                label="Göreve çıkan uçak"
                value={report.air.flown}
              />
              <Metric
                id="air-engagements"
                label="Çatışan kanat"
                value={report.air.engagements}
              />
              <Metric
                id="air-combat-losses"
                label="Muharebe / uçaksavar kaybı"
                value={report.air.combatLosses}
                loss
              />
              <Metric
                id="air-base-losses"
                label="Üs kaybı / tahliye kaybı"
                value={report.air.baseLosses}
                loss
              />
              <Metric
                id="air-reinforced"
                label="Kanat takviyesi"
                value={report.air.reinforced}
              />
              <Metric
                id="air-fuel"
                label="Uçuş yakıtı"
                value={report.air.fuelSpent}
              />
              <Metric
                id="air-naval-damage"
                label="Gemilere verilen hava hasarı"
                value={report.air.navalDamage}
                unit="puan"
              />
            </dl>
            <h4 className={styles.subheading}>
              <MilitaryIcon name="navy" size={16} /> Deniz kuvvetleri
            </h4>
            <dl className={styles.rows}>
              <Metric
                id="navy-active"
                label="Görev yapan gemi"
                value={report.navy.active}
              />
              <Metric
                id="navy-engagements"
                label="Çatışan gemi"
                value={report.navy.engagements}
              />
              <Metric
                id="navy-combat-damage"
                label="Alınan muharebe hasarı"
                value={report.navy.combatDamage}
                unit="puan"
                loss
              />
              <Metric
                id="navy-attrition-damage"
                label="İkmalsizlik hasarı"
                value={report.navy.attritionDamage}
                unit="puan"
                loss
              />
              <Metric
                id="carrier-aircraft-lost"
                label="Uçak gemisi uçak kaybı"
                value={report.navy.aircraftLost}
                loss
              />
              <Metric
                id="navy-repaired"
                label="Onarılan gövde"
                value={report.navy.repaired}
                unit="puan"
              />
              <Metric
                id="navy-fuel"
                label="Donanma yakıtı"
                value={report.navy.fuelSpent}
              />
            </dl>
            <p className={styles.notice}>
              Uçak kaybı toplamına üs ve uçak gemisi kayıpları dahildir. Uçak
              sayılarındaki ondalıklar kademeli yıpranmayı gösterir. Hasar
              puanları etkilenen tesis ve gemilerin toplamıdır.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
