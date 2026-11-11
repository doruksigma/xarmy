"use client";
import type { GameAudioControls } from "./useGameAudio";
import styles from "./sound-settings.module.css";

export default function SoundSettings({ audio }: { audio: GameAudioControls }) {
  const { settings, setSettings } = audio;
  return (
    <details className={styles.settings} data-testid="sound-settings">
      <summary aria-label="Ses ayarları">
        {settings.enabled && settings.volume > 0 ? "Ses açık" : "Ses kapalı"}
      </summary>
      <div className={styles.content}>
        <strong>Sefer sesleri</strong>
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              setSettings({ ...settings, enabled: e.target.checked })
            }
          />{" "}
          Sesleri aç
        </label>
        <label className={styles.volume}>
          Ses düzeyi <output>{Math.round(settings.volume * 100)}%</output>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(settings.volume * 100)}
            aria-label="Ses düzeyi"
            onChange={(e) =>
              setSettings({ ...settings, volume: Number(e.target.value) / 100 })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.effects}
            onChange={(e) =>
              setSettings({ ...settings, effects: e.target.checked })
            }
          />{" "}
          Menü, olay ve daktilo
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.battle}
            onChange={(e) =>
              setSettings({ ...settings, battle: e.target.checked })
            }
          />{" "}
          Çatışma ve birlik hareketi
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.voice}
            disabled={!audio.voiceStatus.available && !settings.voice}
            onChange={(e) =>
              setSettings({ ...settings, voice: e.target.checked })
            }
          />
          Konuşmalı bildirimler
        </label>
        <p role="status">{audio.voiceStatus.reason}</p>
        <button
          type="button"
          disabled={
            !settings.enabled ||
            !settings.voice ||
            !audio.voiceStatus.available ||
            settings.volume === 0
          }
          onClick={() =>
            audio.speak("Komutanım, birlikleriniz emirlerinizi bekliyor.")
          }
        >
          Konuşmayı dene
        </button>
        <button
          type="button"
          disabled={
            !settings.enabled || !settings.effects || settings.volume === 0
          }
          onClick={() => audio.play("complete")}
        >
          Sesi dene
        </button>
        <p>
          Sesler cihazında üretilir. Arka plana geçtiğinde susar; zaman
          duraklatılınca çatışma ve yürüyüş sesleri durur.
        </p>
      </div>
    </details>
  );
}
