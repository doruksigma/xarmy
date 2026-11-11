"use client";
import { useEffect, useId, useRef } from "react";
import SoundSettings from "./SoundSettings";
import type { GameAudioControls } from "./useGameAudio";
import type { PresentationSettings } from "./presentation-settings";
import styles from "./game-settings.module.css";

export default function GameSettings({
  audio,
  settings,
  onChange,
  onClose,
}: {
  audio: GameAudioControls;
  settings: PresentationSettings;
  onChange: (patch: Partial<PresentationSettings>) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={title}
      data-testid="game-settings"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <small>BU CİHAZDA SAKLANIR</small>
          <h2 id={title}>Oyun ayarları</h2>
        </div>
        <button type="button" aria-label="Ayarları kapat" onClick={onClose}>
          ×
        </button>
      </header>
      <div className={styles.body}>
        <fieldset>
          <legend>Harita ve görüntü</legend>
          <label>
            Harita çizimi
            <select
              aria-label="Ayarlar: harita çizimi"
              value={settings.map}
              onChange={(event) =>
                onChange({
                  map: event.target.value as PresentationSettings["map"],
                })
              }
            >
              <option value="2d">2D siyasi harita</option>
              <option value="3d">3D arazi ve modeller</option>
            </select>
          </label>
          <label>
            Grafik kalitesi
            <select
              aria-label="Ayarlar: grafik kalitesi"
              value={settings.quality}
              onChange={(event) =>
                onChange({
                  quality: event.target
                    .value as PresentationSettings["quality"],
                })
              }
            >
              <option value="low">Düşük — telefon için</option>
              <option value="medium">Orta</option>
              <option value="high">Yüksek</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>
          <label>
            3D kamera
            <select
              aria-label="Ayarlar: harita bakışı"
              value={settings.viewpoint}
              onChange={(event) =>
                onChange({
                  viewpoint: event.target
                    .value as PresentationSettings["viewpoint"],
                })
              }
            >
              <option value="strategic">Stratejik üstten bakış</option>
              <option value="perspective">Yakın perspektif</option>
            </select>
          </label>
          <p>
            Grafik kalitesi ve kamera tercihi 3D haritaya uygulanır. Düşük
            kalite gölgeleri ve ayrıntı yoğunluğunu azaltır.
          </p>
        </fieldset>
        <fieldset>
          <legend>Animasyonlar</legend>
          <label>
            Hareket ve efektler
            <select
              aria-label="Ayarlar: animasyonlar"
              value={settings.motion}
              onChange={(event) =>
                onChange({
                  motion: event.target.value as PresentationSettings["motion"],
                })
              }
            >
              <option value="system">Cihaz tercihine uy</option>
              <option value="full">Açık</option>
              <option value="reduced">Azaltılmış</option>
            </select>
          </label>
          <p>
            Azaltılmış görünüm tren, asker, muharebe ve daktilo animasyonlarını
            azaltır; birlik konumları ve savaş sonuçları güncellenmeye devam
            eder.
          </p>
        </fieldset>
        <SoundSettings audio={audio} />
        <p>
          Zamanı üst çubuktaki 1×–5× düğmelerinden değiştir. Önemli olay
          kararlarında oyun otomatik durur.
        </p>
      </div>
      <footer>
        <button type="button" onClick={onClose}>
          Tamam
        </button>
      </footer>
    </dialog>
  );
}
