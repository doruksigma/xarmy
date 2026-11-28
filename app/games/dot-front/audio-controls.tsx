import type { SoundMix } from "./audio-types";
import { copy } from "./copy";
import styles from "./game.module.css";

type Props = {
  sound: boolean;
  mix: SoundMix;
  onSoundChange(enabled: boolean): void;
  onMixChange(mix: SoundMix): void;
  compact?: boolean;
};
const channels = ["masterVolume", "ambienceVolume", "effectsVolume"] as const;

export function AudioControls({ sound, mix, onSoundChange, onMixChange, compact = false }: Props) {
  const panel = <section className={styles.audioPanel} aria-label={copy.soundSettings}>
    <button type="button" aria-pressed={sound} onClick={() => onSoundChange(!sound)}>
      {sound ? copy.soundDisable : copy.soundEnable}
    </button>
    <div className={styles.audioSliders}>{channels.map(channel => {
      const percent = Math.round(mix[channel] * 100);
      return <label className={styles.audioSlider} key={channel}>
        <span>{copy[channel]} <output aria-hidden="true">{percent}%</output></span>
        <input type="range" min={0} max={100} step={1} value={percent}
          aria-label={copy[channel]} aria-valuetext={`${percent}%`}
          onChange={event => onMixChange({ ...mix, [channel]: Number(event.target.value) / 100 })} />
      </label>;
    })}</div>
    <a className={styles.audioCredits} href="/dot-front/audio/CREDITS.md" target="_blank" rel="noopener noreferrer">{copy.audioCredits}</a>
  </section>;
  return compact ? <details className={styles.audioControls}>
    <summary onClick={() => { if (sound) onSoundChange(true); }}>{copy.soundSettings} <span>{sound ? copy.soundOn : copy.soundOff}</span></summary>
    {panel}
  </details> : panel;
}
