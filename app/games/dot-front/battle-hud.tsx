import { timeLabel } from "./battle";
import type { Summary } from "./battle";
import { copy } from "./copy";
import { formatSoldiers } from "./manpower";
import styles from "./game.module.css";

type ScoreboardProps = { hud: Summary; markLocalTeam?: boolean; result?: boolean };
const moneyFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const rateFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const rate = (value: number) => rateFormat.format(Math.abs(value));

export function ManpowerScoreboard({ hud, markLocalTeam = false, result = false }: ScoreboardProps) {
  return <table className={`${styles.scoreboard}${result ? ` ${styles.resultScoreboard}` : ""}`}
    aria-label={result ? copy.resultManpower : copy.manpowerScoreboard}>
    <thead><tr>
      <th scope="col">{copy.side}</th>
      <th scope="col">{copy.soldiers}</th>
      <th scope="col">{copy.deadSoldiers}</th>
    </tr></thead>
    <tbody>{([1, 2] as const).map(team => {
      const strength = team === 1 ? hud.manpower.blue : hud.manpower.red;
      return <tr key={team}>
        <th scope="row"><span className={styles.sideLabel}>
          <span className={team === 1 ? styles.blueMarker : styles.redMarker} aria-hidden="true" />
          {team === 1 ? copy.player : copy.enemy}
          {markLocalTeam && hud.localTeam === team ? <small className={styles.youMarker}>{copy.you}</small> : null}
        </span></th>
        <td>{formatSoldiers(strength.soldiers)}</td>
        <td>{formatSoldiers(strength.fallen)}</td>
      </tr>;
    })}</tbody>
  </table>;
}

export function BattleHud({ hud, markLocalTeam = false }: Omit<ScoreboardProps, "result">) {
  return <header className={styles.hud}>
    <div className={styles.hudDetails}>
      <span>{copy.player}: <b>{hud.blueCities}</b> {copy.cities}</span>
      <span>{copy.enemy}: <b>{hud.redCities}</b> {copy.cities}</span>
      <span>{copy.supply}: <b>{hud.logistics.used}/{hud.logistics.capacity}</b></span>
      <time aria-label={`${copy.time}: ${timeLabel(hud.time)}`}>{timeLabel(hud.time)}</time>
      <div className={styles.economyRow} role="group" aria-label={copy.economy}>
        <span className={hud.economy.shortage > 0 ? styles.budgetEmpty : styles.money}>
          {copy.money}: <b>{moneyFormat.format(hud.economy.money)}</b>
        </span>
        <span>{copy.income} <b>+{rate(hud.economy.income)}</b>{copy.perSecond}</span>
        <span>{copy.upkeep} <b>−{rate(hud.economy.upkeep)}</b>{copy.perSecond}</span>
        <span className={hud.economy.net < 0 ? styles.budgetEmpty : undefined}>
          {copy.netIncome} <b>{hud.economy.net < 0 ? "−" : "+"}{rate(hud.economy.net)}</b>{copy.perSecond}
        </span>
      </div>
    </div>
    <ManpowerScoreboard hud={hud} markLocalTeam={markLocalTeam} />
    {hud.economy.shortage > 0 && <p className={styles.budgetWarning} role="status">{copy.budgetWarning}</p>}
  </header>;
}

export function SupportHud({ hud, onSourceClick, canPan = false }: Pick<ScoreboardProps, "hud"> & {
  onSourceClick?(): void; canPan?: boolean;
}) {
  const next = (seconds: number) => seconds > 0 ? `${Math.ceil(seconds)} ${copy.seconds}` : copy.supportReady;
  return <section className={styles.supportBar} aria-label={copy.support}>
    <div className={styles.supportCounts} role="group" aria-label={copy.supportCounts}>
      <strong>{copy.support}</strong>
      <span>{copy.artillery}: <b>{hud.armyKinds.artillery}</b> · {copy.nextSupport}: <b>{next(hud.support.artilleryIn)}</b></span>
      <span>{copy.aircraft}: <b>{hud.armyKinds.aircraft}</b> · {copy.nextSupport}: <b>{next(hud.support.aircraftIn)}</b></span>
      <span>{copy.supportCity}: <b>{hud.support.cityId === null ? copy.supportNoCity : copy.placeNames[hud.support.cityId]}</b></span>
      {onSourceClick && <button type="button" disabled={!canPan || hud.support.cityId === null}
        onClick={onSourceClick}>{copy.supportLocate}</button>}
    </div>
    <p>{hud.support.blocked ? copy.supportWaiting : copy.supportRate}</p>
    <details className={styles.supportInfo}>
      <summary>{copy.supportDetails}</summary>
      <p>{copy.artilleryRules}</p><p>{copy.aircraftRules}</p><p>{copy.supportRules}</p><p>{copy.economyRules}</p>
    </details>
  </section>;
}
