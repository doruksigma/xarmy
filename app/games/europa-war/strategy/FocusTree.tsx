"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Focus } from "./catalog";
import MilitaryIcon, { type MilitaryIconName } from "./MilitaryIcon";
import {
  FOCUS_NODE_HEIGHT,
  FOCUS_NODE_WIDTH,
  layoutFocusGraph,
  visibleFocusNodes,
  type FocusNodeState,
} from "./focus-graph";
import styles from "./focus-tree.module.css";

const STATE_LABEL: Record<FocusNodeState, string> = {
  available: "Hazır",
  locked: "Kilitli",
  active: "Hazırlanıyor",
  completed: "Tamamlandı",
  excluded: "Diğer yol seçildi",
  pending: "Karar bekliyor",
  declined: "Vazgeçildi",
};
function focusIcon(focus: Focus): MilitaryIconName {
  const label = `${focus.branch} ${focus.name}`.toLocaleLowerCase("tr");
  if (/imparator|hanedan|anayasa|siyasi|yönetim|muhalefet/.test(label))
    return "politics";
  if (/deniz|liman|tersane|filo/.test(label)) return "navy";
  if (/uçak|hava|radar/.test(label)) return "plane";
  if (/tank|zırh|panzer|tiger/.test(label)) return "armor";
  if (/demiryol|ulaşım|lojistik/.test(label)) return "rail";
  if (/sanayi|fabrika|üretim|atölye/.test(label)) return "factory";
  if (/bilim|araştırma|üniversite|teknoloji/.test(label)) return "research";
  if (/ordu|silah|asker|güvenlik/.test(label)) return "infantry";
  if (/petrol|yakıt|kaynak/.test(label)) return "oil";
  if (/diploma|barış|antlaşma|pakt/.test(label)) return "diplomacy";
  return "medal";
}

export default function FocusTree({
  focuses,
  matches,
  states,
  selected,
  onSelect,
}: {
  focuses: Focus[];
  matches: ReadonlySet<string>;
  states: ReadonlyMap<string, FocusNodeState>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => layoutFocusGraph(focuses), [focuses]);
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.85);
  const [view, setView] = useState({
    left: 0,
    top: 0,
    width: 700,
    height: 450,
  });
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const frame = useRef(0);
  const measure = useCallback(() => {
    const element = viewport.current;
    if (element)
      setView({
        left: element.scrollLeft / zoom,
        top: element.scrollTop / zoom,
        width: element.clientWidth / zoom,
        height: element.clientHeight / zoom,
      });
  }, [zoom]);
  const scheduleMeasure = useCallback(() => {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        measure();
      });
  }, [measure]);
  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure]);
  useEffect(() => {
    const node = layout.nodes.find(
      (candidate) => candidate.focus.id === selected,
    );
    const element = viewport.current;
    if (!node || !element) return;
    const left = node.x * zoom,
      top = node.y * zoom;
    if (
      left < element.scrollLeft ||
      left + FOCUS_NODE_WIDTH * zoom > element.scrollLeft + element.clientWidth
    )
      element.scrollLeft = Math.max(
        0,
        left - (element.clientWidth - FOCUS_NODE_WIDTH * zoom) / 2,
      );
    if (
      top < element.scrollTop ||
      top + FOCUS_NODE_HEIGHT * zoom > element.scrollTop + element.clientHeight
    )
      element.scrollTop = Math.max(0, top - 35);
    measure();
  }, [layout, selected, zoom, measure]);
  const visible = useMemo(
    () => visibleFocusNodes(layout.nodes, view, selected),
    [layout.nodes, view, selected],
  );
  const pan = (x: number, y: number) =>
    viewport.current?.scrollBy({ left: x, top: y, behavior: "auto" });
  return (
    <div
      className={styles.board}
      data-testid="focus-graph"
      data-node-count={layout.nodes.length}
    >
      <div className={styles.toolbar}>
        <span>ULUSAL ODAK AĞACI</span>
        <div role="group" aria-label="Odak ağacı yakınlaştırma">
          <button
            type="button"
            aria-label="Odak ağacını uzaklaştır"
            disabled={zoom <= 0.5}
            onClick={() =>
              setZoom((value) => Math.max(0.5, +(value - 0.15).toFixed(2)))
            }
          >
            −
          </button>
          <output aria-label="Odak ağacı ölçeği">
            %{Math.round(zoom * 100)}
          </output>
          <button
            type="button"
            aria-label="Odak ağacını yakınlaştır"
            disabled={zoom >= 1.3}
            onClick={() =>
              setZoom((value) => Math.min(1.3, +(value + 0.15).toFixed(2)))
            }
          >
            +
          </button>
          <button
            type="button"
            aria-label="Odak ağacının başına dön"
            onClick={() => {
              viewport.current?.scrollTo({ left: 0, top: 0 });
            }}
          >
            ⌂
          </button>
        </div>
      </div>
      <div
        className={styles.viewport}
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Bağlantılı odak ağacı. Kaydır veya ok tuşlarını kullan; bir odağa dokunarak ayrıntılarını aç."
        data-testid="focus-graph-viewport"
        onScroll={scheduleMeasure}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const offsets: Record<string, [number, number]> = {
            ArrowLeft: [-150, 0],
            ArrowRight: [150, 0],
            ArrowUp: [0, -150],
            ArrowDown: [0, 150],
          };
          const offset = offsets[event.key];
          if (offset) {
            event.preventDefault();
            event.stopPropagation();
            pan(...offset);
          }
        }}
        onPointerDown={(event) => {
          if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          const element = event.currentTarget;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
            moved: false,
          };
          element.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
          event.currentTarget.scrollLeft = start.left - dx;
          event.currentTarget.scrollTop = start.top - dy;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className={styles.extent}
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          <div
            className={styles.canvas}
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
          >
            <svg
              className={styles.connections}
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
              data-testid="focus-graph-connections"
            >
              {layout.edges.map((edge) => (
                <path
                  key={`${edge.from}:${edge.to}`}
                  d={edge.path}
                  data-from={edge.from}
                  data-to={edge.to}
                  data-complete={states.get(edge.from) === "completed"}
                />
              ))}
            </svg>
            {layout.branches.map((group) => (
              <div
                className={styles.branch}
                key={group.name}
                style={{ left: group.x, width: group.width - 26 }}
              >
                {group.name}
              </div>
            ))}
            {visible.map(({ focus, x, y }) => {
              const state = states.get(focus.id) ?? "locked";
              return (
                <button
                  type="button"
                  key={focus.id}
                  className={styles.node}
                  data-focus-node={focus.id}
                  data-state={state}
                  data-context={!matches.has(focus.id)}
                  aria-label={`${focus.name} · ${STATE_LABEL[state]}`}
                  aria-pressed={selected === focus.id}
                  title={`${focus.name} — ${STATE_LABEL[state]}`}
                  style={{
                    left: x,
                    top: y,
                    width: FOCUS_NODE_WIDTH,
                    height: FOCUS_NODE_HEIGHT,
                  }}
                  onClick={() => onSelect(focus.id)}
                >
                  <span className={styles.medallion}>
                    <MilitaryIcon name={focusIcon(focus)} size={31} />
                    <span className={styles.rank}>◆</span>
                  </span>
                  <span className={styles.name}>{focus.name}</span>
                  <span className={styles.state}>
                    {state === "completed"
                      ? "✓ "
                      : state === "excluded"
                        ? "× "
                        : ""}
                    {STATE_LABEL[state]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles.legend}>
        <span data-tone="available">● Hazır</span>
        <span data-tone="active">● Hazırlanıyor</span>
        <span data-tone="completed">● Tamamlandı</span>
        <span data-tone="locked">● Kilitli</span>
        <small>
          Sürükle / kaydır · Bir simge seç · Çizgiler gerçek önkoşullardır
        </small>
      </div>
      <div
        className={styles.panControls}
        role="group"
        aria-label="Odak ağacını kaydır"
      >
        <button
          type="button"
          onClick={() => pan(-220, 0)}
          aria-label="Odak ağacında sola kaydır"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => pan(0, -220)}
          aria-label="Odak ağacında yukarı kaydır"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => pan(0, 220)}
          aria-label="Odak ağacında aşağı kaydır"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => pan(220, 0)}
          aria-label="Odak ağacında sağa kaydır"
        >
          →
        </button>
      </div>
    </div>
  );
}
