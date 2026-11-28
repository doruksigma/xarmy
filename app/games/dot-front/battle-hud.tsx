import { timeLabel } from "./battle";
import type { Summary } from "./battle";
import { copy } from "./copy";
import { formatSoldiers } from "./manpower";
import styles from "./game.module.css";

type ScoreboardProps = { hud: Summary; markLocalTeam?: boolean; result?: boolean };

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
    </div>
    <ManpowerScoreboard hud={hud} markLocalTeam={markLocalTeam} />
  </header>;
}
