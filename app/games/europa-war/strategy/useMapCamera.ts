"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type Camera = { x: number; y: number; w: number; h: number };
export const CAMERA_OVERSCAN = 0.45;
type Update = Camera | ((view: Camera) => Camera);

/** Move the composed map during a gesture; reconcile geometry after it settles. */
export function useMapCamera(
  svg: RefObject<SVGSVGElement | null>,
  initial: () => Camera,
) {
  const [view, renderView] = useState(initial);
  const liveView = useRef(view),
    base = useRef(view);
  const overviewRef = useRef<SVGRectElement>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promoted = useRef(false);
  const size = useRef({ width: 0, height: 0 });

  const paint = useCallback(() => {
    const element = svg.current;
    if (!element) return;
    const next = liveView.current,
      previous = base.current;
    const scale = previous.w / next.w;
    const x = ((previous.x - next.x) * size.current.width) / next.w;
    const y = ((previous.y - next.y) * size.current.height) / next.h;
    const moving = Math.abs(x) + Math.abs(y) + Math.abs(scale - 1) > 0.001;
    element.style.transform = moving
      ? `translate(${x}px, ${y}px) scale(${scale})`
      : "";
    // Rebuilding/dropping the compositor layer on every rebase or reversal
    // causes a full SVG repaint. Keep it until the whole gesture has settled.
    element.style.willChange = promoted.current ? "transform" : "";
    if (overviewRef.current) {
      for (const key of ["x", "y", "w", "h"] as const)
        overviewRef.current.setAttribute(
          key === "w" ? "width" : key === "h" ? "height" : key,
          String(next[key]),
        );
    }
  }, [svg]);

  const finish = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    renderView(liveView.current);
    if (release.current !== null) clearTimeout(release.current);
    release.current = setTimeout(() => {
      release.current = null;
      promoted.current = false;
      paint();
    }, 250);
  }, [paint]);

  const setView = useCallback(
    (update: Update) => {
      liveView.current =
        typeof update === "function" ? update(liveView.current) : update;
      finish();
    },
    [finish],
  );

  const moveView = useCallback(
    (update: Update, settle = true) => {
      liveView.current =
        typeof update === "function" ? update(liveView.current) : update;
      if (release.current !== null) clearTimeout(release.current);
      release.current = null;
      promoted.current = true;
      if (timer.current !== null) clearTimeout(timer.current);
      // A held pointer can produce slow/coalesced events on busy devices.
      // Only wheel/keyboard gestures use idle detection; dragging finishes on
      // pointerup, otherwise each slow pinch step can rebuild the whole map.
      timer.current = settle ? setTimeout(finish, 120) : null;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        paint();
        const next = liveView.current,
          previous = base.current;
        // Refresh before the camera reaches the edge of the overscanned geometry.
        // Check the whole rectangle: simultaneous pan + zoom can cross an edge
        // even when each movement is individually below its threshold.
        const margin = CAMERA_OVERSCAN - 0.1;
        if (
          Math.abs(next.x - previous.x) > previous.w * 0.25 ||
          Math.abs(next.y - previous.y) > previous.h * 0.25 ||
          next.w / previous.w > 1.35 ||
          next.w / previous.w < 0.7 ||
          next.x < previous.x - previous.w * margin ||
          next.y < previous.y - previous.h * margin ||
          next.x + next.w > previous.x + previous.w * (1 + margin) ||
          next.y + next.h > previous.y + previous.h * (1 + margin)
        )
          renderView(liveView.current);
      });
    },
    [finish, paint],
  );

  useLayoutEffect(() => {
    base.current = view;
    if (svg.current)
      size.current = {
        width: svg.current.clientWidth,
        height: svg.current.clientHeight,
      };
    paint();
  }, [view, paint, svg]);

  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current !== null) clearTimeout(timer.current);
      if (release.current !== null) clearTimeout(release.current);
      frame.current = null;
      timer.current = null;
      release.current = null;
      promoted.current = false;
    },
    [],
  );

  return {
    view,
    liveView,
    setView,
    moveView,
    finish,
    overviewRef,
    canvasSize: size,
  };
}
