"use client";
import { memo, useEffect, useRef, useState } from "react";
import {
  Map3DRenderer,
  type Map3DState,
  type Map3DMetrics,
} from "./map3d-renderer";
import { GRAPHICS_QUALITY, type GraphicsQuality } from "./map3d-visuals";
import { GEOGRAPHY, MAP } from "./world";
import { TERRAINS } from "./catalog";
import styles from "./map3d.module.css";

const QUALITY_KEY = "xarmy-europa-3d-quality-v1";
const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i");
const initialQuality = (): GraphicsQuality => {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    if (value && value in GRAPHICS_QUALITY) return value as GraphicsQuality;
  } catch {
    /* Private browsing can disable preferences. */
  }
  return typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
    ? "low"
    : "medium";
};
function WarMap3D(
  props: Map3DState & { onUnavailable?: (message: string) => void },
) {
  const canvas = useRef<HTMLCanvasElement>(null),
    labels = useRef<HTMLDivElement>(null),
    renderer = useRef<Map3DRenderer | null>(null);
  const live = useRef(props);
  live.current = props;
  const [quality, setQuality] = useState<GraphicsQuality>(initialQuality);
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [search, setSearch] = useState("");
  const [metrics, setMetrics] = useState<Map3DMetrics | null>(null);
  const [error, setError] = useState("");
  const [showMetrics, setShowMetrics] = useState(false);
  useEffect(() => {
    if (!canvas.current || !labels.current) return;
    try {
      renderer.current = new Map3DRenderer(
        canvas.current,
        labels.current,
        live.current,
        quality,
        setMetrics,
        (message) => {
          setError(message);
          live.current.onUnavailable?.(message);
        },
      );
    } catch (error) {
      const message =
        "Bu cihazda 3D harita başlatılamadı. Seferin korunuyor; 2D haritayla devam edebilirsin.";
      setError(message);
      live.current.onUnavailable?.(message);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
    // Build a single scene; updates below only change existing buffers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    renderer.current?.update(props);
  }, [props]);
  useEffect(() => {
    renderer.current?.setQuality(quality);
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {}
  }, [quality]);
  const matches = search.trim()
    ? MAP.provinces
        .filter((p) => normalize(p.name).includes(normalize(search)))
        .slice(0, 7)
    : [];
  const selected = GEOGRAPHY[props.selected];
  const onDemand =
    reducedMotion ||
    (props.paused && quality === "low" && !metrics?.continuous);
  return (
    <div className={styles.root} data-testid="map3d-container">
      <canvas
        ref={canvas}
        data-testid="war-map-3d"
        className={styles.canvas}
        tabIndex={0}
        aria-label="3D strateji haritası. Sürükle: kaydır; tekerlek: yakınlaştır; orta tuş: döndür; Shift sürükle: tümen seç; sağ tık: seçili birliğe emir."
      />
      <div ref={labels} className={styles.labels} />
      <div className={styles.search}>
        <label>
          <span className={styles.srOnly}>Şehir bul</span>
          <input
            type="search"
            aria-label="Şehir bul"
            placeholder="⌕ Şehir bul…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
            }}
          />
        </label>
        {matches.length > 0 && (
          <div
            className={styles.results}
            role="list"
            aria-label="Şehir arama sonuçları"
          >
            {matches.map((p) => (
              <div key={p.id} role="listitem">
                <button
                  type="button"
                  onClick={() => {
                    renderer.current?.focusProvince(p.id);
                    if (!props.armyIds.length) props.onSelect(p.id, false);
                    setSearch("");
                  }}
                >
                  {p.name}
                  <small>
                    {
                      props.world.countries[
                        props.world.provinces[p.id].controller
                      ]?.name
                    }
                  </small>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.quality}>
        <label>
          GRAFİK{" "}
          <select
            aria-label="Grafik kalitesi"
            value={quality}
            onChange={(e) => setQuality(e.target.value as GraphicsQuality)}
          >
            {Object.entries(GRAPHICS_QUALITY).map(([id, preset]) => (
              <option key={id} value={id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={styles.controls}
        role="group"
        aria-label="3D kamera kontrolleri"
      >
        <button
          type="button"
          aria-label="Haritayı yakınlaştır"
          onClick={() => renderer.current?.zoom(0.75)}
        >
          ＋
        </button>
        <button
          type="button"
          aria-label="Haritayı uzaklaştır"
          onClick={() => renderer.current?.zoom(1.33)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Başkentime git"
          onClick={() =>
            renderer.current?.focusProvince(
              props.world.countries[props.world.player].capital,
              350,
            )
          }
        >
          ⌖
        </button>
        <button
          type="button"
          aria-label="Tüm haritayı göster"
          onClick={() => renderer.current?.reset()}
        >
          ↔
        </button>
        <button
          type="button"
          aria-label="Seçili tümenlere git"
          disabled={!props.armyIds.length}
          onClick={() => renderer.current?.focusArmies()}
        >
          ▣
        </button>
      </div>
      {selected && (
        <div className={styles.selected} data-testid="map3d-selection">
          <strong>{selected.name}</strong>
          <span>
            {TERRAINS[selected.terrain as keyof typeof TERRAINS].name} ·{" "}
            {
              props.world.countries[
                props.world.provinces[selected.id].controller
              ]?.name
            }
          </span>
        </div>
      )}
      <div className={styles.performance}>
        <button
          type="button"
          aria-label="3D görüntü ölçümleri"
          aria-expanded={showMetrics}
          onClick={() => setShowMetrics((v) => !v)}
        >
          3D ·{" "}
          {metrics
            ? onDemand
              ? "Durağan"
              : `${metrics.fps} FPS`
            : "Yükleniyor…"}
        </button>
        {showMetrics && metrics && (
          <div data-testid="map3d-metrics">
            Son çizim ölçümü: {metrics.fps} FPS
            {onDemand && " · Gerektiğinde çizim"}
            <br />
            {metrics.calls} çizim · {metrics.triangles.toLocaleString("tr-TR")}{" "}
            üçgen
            <br />
            {metrics.geometries} geometri · {metrics.textures} doku
            <br />
            Grafik ayarları savaş hesabını değiştirmez.
          </div>
        )}
      </div>
      <div className={styles.help}>
        Sürükle: kaydır · İki parmak / tekerlek: yakınlaş · Orta tuş: döndür ·
        Shift+sürükle: tümen seç
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
}
export default memo(WarMap3D);
