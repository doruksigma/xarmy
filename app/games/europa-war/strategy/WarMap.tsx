"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { TERRAINS, UNITS } from "./catalog";
import { AIRCRAFT, AIR_MISSIONS, SEA_ZONES } from "./advanced-catalog";
import { seaControl } from "./military-assets";
import { GEOGRAPHY, localSupply, MAP, supplyNetwork } from "./world";
import type { SeaZone, World } from "./types";
import styles from "../europa.module.css";
import atlas from "./map.module.css";
import mapAssets from "./map-assets.json";
import { CAMERA_OVERSCAN, useMapCamera, type Camera } from "./useMapCamera";

export type MapMode =
  | "political"
  | "terrain"
  | "military"
  | "supply"
  | "air"
  | "naval";
const MODE_NAMES: Record<MapMode, string> = {
  political: "Siyasi harita",
  terrain: "Arazi ve coğrafya",
  military: "Kara harekâtı",
  supply: "İkmal ağı",
  air: "Hava harekâtı",
  naval: "Deniz harekâtı",
};
const URBAN_PLACES = MAP.provinces.map((p) => ({
  id: p.id,
  name: p.name,
  province: p.id,
  x: p.x,
  y: p.y,
}));
const REGION_BOUNDS = new Map(
  MAP.provinces.map((p) => {
    const coordinates = p.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const xs = coordinates.filter((_, i) => i % 2 === 0);
    const ys = coordinates.filter((_, i) => i % 2 === 1);
    return [
      p.id,
      {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      },
    ];
  }),
);
const searchName = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i");
type PointerPosition = { x: number; y: number };
const fitCamera = (ratio: number): Camera => {
  const w = Math.max(MAP.width, MAP.height * ratio),
    h = w / ratio;
  return { x: (MAP.width - w) / 2, y: (MAP.height - h) / 2, w, h };
};
const constrainCamera = (view: Camera): Camera => {
  const constrain = (position: number, size: number, extent: number) => {
    const margin = Math.min(80, size * 0.12);
    if (size >= extent + margin * 2) return (extent - size) / 2;
    return Math.max(-margin, Math.min(extent - size + margin, position));
  };
  return {
    ...view,
    x: constrain(view.x, view.w, MAP.width),
    y: constrain(view.y, view.h, MAP.height),
  };
};
const zoomWidth = (width: number, ratio: number) =>
  Math.max(Math.min(260, 260 * ratio), Math.min(fitCamera(ratio).w, width));
const TINY_COUNTRIES = new Set([
  "luxembourg",
  "belgium",
  "netherlands",
  "albania",
  "estonia",
  "latvia",
  "lithuania",
  "switzerland",
  "denmark",
]);
const links = MAP.provinces.flatMap((p) =>
  p.neighbors
    .filter((n) => !n.sea && p.id < n.id)
    .map((n) => ({ a: p, b: GEOGRAPHY[n.id] })),
);
const pointList = (ids: string[]) =>
  ids
    .filter((id) => GEOGRAPHY[id])
    .map((id) => `${GEOGRAPHY[id].x},${GEOGRAPHY[id].y}`)
    .join(" ");
const curvedPath = (ax: number, ay: number, bx: number, by: number) =>
  `M${ax} ${ay} Q${(ax + bx) / 2 + (by - ay) * 0.12} ${(ay + by) / 2 - (bx - ax) * 0.12} ${bx} ${by}`;
function WarMap({
  world,
  selected,
  armyId,
  armyIds,
  onArmies,
  mode,
  onSelect,
  ordering,
  draft = [],
}: {
  world: World;
  selected: string;
  armyId: string | null;
  armyIds: string[];
  onArmies: (ids: string[], append?: boolean) => void;
  mode: MapMode;
  onSelect: (id: string, append: boolean) => void;
  ordering: boolean;
  draft?: string[];
}) {
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef({ id: -1, x: 0, y: 0, vx: 0, vy: 0, scale: 1, moved: false }),
    pointers = useRef(new Map<number, PointerPosition>()),
    pinch = useRef<{
      distance: number;
      view: Camera;
      anchor: PointerPosition;
    } | null>(null);
  const { view, liveView, setView, moveView, finish, overviewRef, canvasSize } =
    useMapCamera(svg, () => fitCamera(MAP.width / MAP.height));
  const [search, setSearch] = useState("");
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [hover, setHover] = useState(""),
    [wingId, setWingId] = useState<string | null>(null),
    [seaZone, setSeaZone] = useState<SeaZone | null>(null);
  const player = world.countries[world.player];
  const capitalRef = useRef(player.capital);
  capitalRef.current = player.capital;
  const counterScale = Math.max(0.22, Math.min(1.6, view.w / viewportWidth));
  const needsSupply = mode === "supply" || !!hover;
  const network = useMemo(
    () =>
      needsSupply ? supplyNetwork(world, world.player) : new Set<string>(),
    [world, needsSupply],
  );
  const selectedArmies = new Set(armyIds);
  // Keep the neighboring viewport ready while the compositor moves the map.
  const bounds = useMemo(
    () => ({
      x: view.x - view.w * CAMERA_OVERSCAN,
      y: view.y - view.h * CAMERA_OVERSCAN,
      w: view.w * (1 + CAMERA_OVERSCAN * 2),
      h: view.h * (1 + CAMERA_OVERSCAN * 2),
    }),
    [view],
  );
  const capitals = useMemo(
    () => new Set(Object.values(world.countries).map((c) => c.capital)),
    [world],
  );
  // Only mount terrain detail that intersects the camera. Province polygons stay
  // selectable; no game data or territory is removed by this render optimization.
  const terrainInView = useMemo(
    () =>
      new Set(
        MAP.provinces
          .filter((p) => {
            const b = REGION_BOUNDS.get(p.id)!;
            return (
              b.right >= bounds.x &&
              b.left <= bounds.x + bounds.w &&
              b.bottom >= bounds.y &&
              b.top <= bounds.y + bounds.h
            );
          })
          .map((p) => p.id),
      ),
    [bounds],
  );
  const detailed = view.w < 1000,
    close = view.w < 650;
  const visible = (id: string) =>
    id === world.player ||
    player.allies.includes(id) ||
    player.intel[id]?.expires > world.day;
  const formations = useMemo(() => {
    const out = new Map<string, typeof world.armies>();
    for (const a of world.armies) {
      const known =
        a.country === world.player ||
        player.allies.includes(a.country) ||
        player.intel[a.country]?.expires > world.day ||
        world.battles.some((b) => b.province === a.province) ||
        GEOGRAPHY[a.province].neighbors.some(
          (n) => world.provinces[n.id].controller === world.player,
        );
      if (!known) continue;
      const key = `${a.province}:${a.country}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(a);
    }
    return [...out.values()];
  }, [world, player]);
  const countryLabels = useMemo(
    () =>
      Object.values(world.countries)
        .map((c) => {
          const lands = MAP.provinces.filter(
            (p) => world.provinces[p.id].controller === c.id,
          );
          if (!lands.length) return null;
          const x = lands.reduce((n, p) => n + p.x, 0) / lands.length;
          const y = lands.reduce((n, p) => n + p.y, 0) / lands.length;
          const anchor = lands.reduce(
            (best, p) =>
              Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y)
                ? p
                : best,
            lands[0],
          );
          return {
            country: c,
            lands: lands.length,
            x: anchor.x + (c.id === "uk" ? 22 : c.id === "ireland" ? -12 : 0),
            y: anchor.y - (detailed ? 25 : 19) + (c.id === "ireland" ? 17 : 0),
          };
        })
        .filter((x) => x !== null),
    [world, detailed],
  );
  const cityLabels = useMemo(() => {
    // Capitals are named at every zoom. Other names appear only on selection.
    type Box = { x: number; y: number; w: number; h: number };
    const boxes: Box[] = [];
    for (const l of countryLabels)
      boxes.push({
        x: l.x - l.country.name.length * 3.5,
        y: l.y - 9,
        w: l.country.name.length * 7,
        h: 12,
      });
    for (const f of formations) {
      const p = GEOGRAPHY[f[0].province];
      boxes.push({
        x: p.x - 14 * counterScale,
        y: p.y + 3 * counterScale,
        w: 39 * counterScale,
        h: 25 * counterScale,
      });
    }
    const placed = new Map<string, { x: number; y: number; end: boolean }>();
    const size = 11 * counterScale;
    const overlap = (b: Box) =>
      boxes.some(
        (a) =>
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y,
      );
    const candidates = MAP.provinces
      .filter((p) => p.id === selected || capitals.has(p.id))
      .sort(
        (a, b) =>
          Number(b.id === selected) - Number(a.id === selected) || b.vp - a.vp,
      );
    for (const p of candidates) {
      if (
        p.x < bounds.x - 20 ||
        p.x > bounds.x + bounds.w + 20 ||
        p.y < bounds.y - 20 ||
        p.y > bounds.y + bounds.h + 20
      )
        continue;
      const width = p.name.length * size * 0.57 + 3 * counterScale;
      const candidates = [
        { x: p.x + 7 * counterScale, y: p.y - 5 * counterScale, end: false },
        { x: p.x - 7 * counterScale, y: p.y - 5 * counterScale, end: true },
        { x: p.x + 7 * counterScale, y: p.y - 35 * counterScale, end: false },
        { x: p.x - 20 * counterScale, y: p.y + 14 * counterScale, end: true },
        { x: p.x + 40 * counterScale, y: p.y + 14 * counterScale, end: false },
      ];
      for (const label of candidates) {
        const box = {
          x: label.end ? label.x - width : label.x,
          y: label.y - size,
          w: width,
          h: size + 3 * counterScale,
        };
        if (overlap(box) && p.id !== selected && label !== candidates.at(-1))
          continue;
        boxes.push(box);
        placed.set(p.id, label);
        break;
      }
    }
    return placed;
  }, [countryLabels, formations, counterScale, selected, bounds, capitals]);
  const selectedWing = Object.values(world.countries)
    .filter((country) => visible(country.id))
    .flatMap((country) => country.air.wings.map((wing) => ({ wing, country })))
    .find(({ wing }) => wing.id === wingId);
  function zoom(factor: number, point?: DOMPoint, gesture = false) {
    (gesture ? moveView : setView)((v) => {
      const w = zoomWidth(v.w * factor, v.w / v.h),
        h = (w * v.h) / v.w;
      return constrainCamera({
        x: point ? point.x - ((point.x - v.x) * w) / v.w : v.x + (v.w - w) / 2,
        y: point ? point.y - ((point.y - v.y) * h) / v.h : v.y + (v.h - h) / 2,
        w,
        h,
      });
    });
  }
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    let initialized = false;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      setViewportWidth(width);
      const ratio = width / height,
        initial = !initialized;
      initialized = true;
      setView((v) => {
        if (initial || Math.abs(v.w - fitCamera(v.w / v.h).w) < 1) {
          if (ratio < 0.75) {
            const p = GEOGRAPHY[capitalRef.current],
              w = 520 * ratio,
              h = 520;
            return constrainCamera({ x: p.x - w / 2, y: p.y - h / 2, w, h });
          }
          return fitCamera(ratio);
        }
        const w = zoomWidth(v.h * ratio, ratio),
          h = w / ratio;
        return constrainCamera({
          x: v.x + (v.w - w) / 2,
          y: v.y + (v.h - h) / 2,
          w,
          h,
        });
      });
    });
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.parentElement?.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        const camera = liveView.current;
        zoom(
          Math.exp(
            Math.max(
              -0.3,
              Math.min(0.3, e.deltaY * (e.deltaMode === 1 ? 0.035 : 0.0018)),
            ),
          ),
          new DOMPoint(
            camera.x + ((e.clientX - rect.left) * camera.w) / rect.width,
            camera.y + ((e.clientY - rect.top) * camera.h) / rect.height,
          ),
          true,
        );
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  function focusPlayer() {
    const p = GEOGRAPHY[player.capital];
    setView((v) => {
      const ratio = v.w / v.h,
        w = Math.min(700, 470 * ratio),
        h = w / ratio;
      return constrainCamera({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    });
  }
  function resetView() {
    setView((v) => fitCamera(v.w / v.h));
  }
  function endPointer(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    const next = pointers.current.entries().next().value;
    if (next) {
      const [id, point] = next;
      drag.current = {
        id,
        x: point.x,
        y: point.y,
        vx: liveView.current.x,
        vy: liveView.current.y,
        scale: liveView.current.w / canvasSize.current.width,
        moved: true,
      };
    } else drag.current.id = -1;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!next) finish();
  }
  const routes = [
    ...new Set(
      world.armies
        .filter((a) => selectedArmies.has(a.id))
        .map((a) =>
          pointList([a.province, ...(a.move ? [a.move.to] : []), ...a.route]),
        )
        .filter((points) => points.includes(" ")),
    ),
  ];
  const hovered = hover && world.provinces[hover] ? GEOGRAPHY[hover] : null;
  const infoProvince = hovered ? world.provinces[hover] : null;
  const friendlyPlans = world.plans.filter((p) => p.country === world.player);
  return (
    <div
      className={`${styles.map} ${atlas.atlas} ${ordering ? styles.ordering : ""}`}
    >
      <svg
        ref={svg}
        className={atlas.canvas}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Avrupa strateji haritası. Ok tuşlarıyla gezin, artı ve eksi ile yakınlaştırın, Home ile tüm haritayı gösterin."
        tabIndex={0}
        data-testid="war-map"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            const key = e.key;
            moveView((v) =>
              constrainCamera({
                ...v,
                x:
                  v.x +
                  (key === "ArrowLeft"
                    ? -v.w * 0.12
                    : key === "ArrowRight"
                      ? v.w * 0.12
                      : 0),
                y:
                  v.y +
                  (key === "ArrowUp"
                    ? -v.h * 0.12
                    : key === "ArrowDown"
                      ? v.h * 0.12
                      : 0),
              }),
            );
          } else if (["+", "=", "-", "Home"].includes(e.key)) {
            e.preventDefault();
            if (e.key === "Home") resetView();
            else zoom(e.key === "-" ? 1.25 : 0.8);
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()],
              rect = e.currentTarget.parentElement!.getBoundingClientRect(),
              camera = liveView.current;
            const anchor = new DOMPoint(
              camera.x +
                (((a.x + b.x) / 2 - rect.left) * camera.w) / rect.width,
              camera.y +
                (((a.y + b.y) / 2 - rect.top) * camera.h) / rect.height,
            );
            pinch.current = {
              distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
              view: camera,
              anchor,
            };
            drag.current.moved = true;
            setHover("");
            for (const id of pointers.current.keys())
              e.currentTarget.setPointerCapture(id);
          } else if (pointers.current.size === 1) {
            drag.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              vx: liveView.current.x,
              vy: liveView.current.y,
              scale: liveView.current.w / canvasSize.current.width,
              moved: false,
            };
          }
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const gesture = pinch.current;
          if (gesture && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()],
              rect = e.currentTarget.parentElement!.getBoundingClientRect();
            const w = zoomWidth(
              (gesture.view.w * gesture.distance) /
                Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
              gesture.view.w / gesture.view.h,
            );
            const h = (w * gesture.view.h) / gesture.view.w;
            moveView(
              constrainCamera({
                x:
                  gesture.anchor.x -
                  (((a.x + b.x) / 2 - rect.left) / rect.width) * w,
                y:
                  gesture.anchor.y -
                  (((a.y + b.y) / 2 - rect.top) / rect.height) * h,
                w,
                h,
              }),
              false,
            );
            return;
          }
          const d = drag.current;
          if (d.id !== e.pointerId) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (d.moved || Math.hypot(dx, dy) > 5) {
            d.moved = true;
            setHover("");
            e.currentTarget.setPointerCapture(e.pointerId);
            moveView(
              (v) =>
                constrainCamera({
                  ...v,
                  x: d.vx - dx * d.scale,
                  y: d.vy - dy * d.scale,
                }),
              false,
            );
          }
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <defs>
          <radialGradient id="sea-glow">
            <stop stopColor="#476268" />
            <stop offset=".65" stopColor="#233f48" />
            <stop offset="1" stopColor="#10262e" />
          </radialGradient>
          <pattern
            id="sea-grid"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M80 0H0V80"
              fill="none"
              stroke="#b2c7bf"
              strokeWidth=".5"
              opacity=".12"
            />
            <path d="M39 40H41M40 39V41" stroke="#bbd0c9" opacity=".35" />
          </pattern>
          <pattern
            id="sea-lines"
            width="190"
            height="150"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M-20 35Q50 5 120 40T230 40M-20 41Q50 11 120 46T230 46M-20 47Q50 17 120 52T230 52M-25 120Q50 85 120 112T230 112M-25 126Q50 91 120 118T230 118"
              stroke="#89a6a2"
              strokeWidth=".5"
              fill="none"
              opacity=".08"
            />
          </pattern>
          <pattern
            id="occupied"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(30)"
          >
            <path d="M0 0V7" stroke="#f7e6c6" strokeWidth="2" opacity=".3" />
          </pattern>
          <marker
            id="order-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0 0L6 3L0 6Z" fill="#f2c779" />
          </marker>
          <marker
            id="offensive-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="3.7"
            refY="2"
            orient="auto"
          >
            <path d="M0 0L4 2L0 4L1 2Z" fill="#eac484" />
          </marker>
          <marker
            id="air-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2"
            orient="auto"
          >
            <path d="M0 0L4 2L0 4Z" fill="#a2d4dd" />
          </marker>
          <clipPath id="land-clip">
            {MAP.countries.map((c) => (
              <path key={c.id} d={c.path} />
            ))}
          </clipPath>
          <mask id="ocean-mask">
            <rect x="-1000" y="-1000" width="4000" height="4000" fill="white" />
            {MAP.countries.map((c) => (
              <path key={c.id} d={c.path} fill="black" />
            ))}
          </mask>
          <symbol id="aircraft-symbol" viewBox="-9 -9 18 18">
            <path d="M0-8L2-1 8 3V5L2 3 2 7 0 6-2 7-2 3-8 5V3L-2-1Z" />
          </symbol>
          <symbol id="anchor-symbol" viewBox="-9 -9 18 18">
            <path
              d="M0-4V7M-4-2H4M-7 2Q-7 7 0 7Q7 7 7 2M-8 4L-7 2-5 3M5 3L7 2 8 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <circle
              cy="-6"
              r="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </symbol>
        </defs>
        <rect
          x="-1000"
          y="-1000"
          width="4000"
          height="4000"
          fill="url(#sea-glow)"
        />
        <rect
          x="-1000"
          y="-1000"
          width="4000"
          height="4000"
          fill="url(#sea-lines)"
        />
        <rect
          x="-1000"
          y="-1000"
          width="4000"
          height="4000"
          fill="url(#sea-grid)"
        />
        <g pointerEvents="none">
          {MAP.countries.map((c) => (
            <path
              key={c.id}
              d={c.path}
              fill="#98b7b2"
              stroke="#a0b8ac"
              strokeWidth="6"
              strokeLinejoin="round"
              opacity=".13"
            />
          ))}
        </g>
        {MAP.provinces
          .filter((g) => terrainInView.has(g.id))
          .map((g) => {
            const p = world.provinces[g.id],
              country = world.countries[p.controller];
            let fill = country.color;
            if (mode === "terrain")
              fill = TERRAINS[GEOGRAPHY[g.id].terrain].color;
            if (mode === "supply")
              fill =
                p.controller === world.player
                  ? `hsl(${localSupply(world, world.player, p.id, network) * 110} 29% 42%)`
                  : "#53615b";
            if (mode === "military")
              fill =
                p.controller === world.player
                  ? "#79937a"
                  : player.wars.includes(p.controller)
                    ? "#a46d60"
                    : player.allies.includes(p.controller)
                      ? "#79979d"
                      : "#71756a";
            if (mode === "air" || mode === "naval")
              fill =
                p.controller === world.player
                  ? "#708d83"
                  : player.wars.includes(p.controller)
                    ? "#916f62"
                    : "#59695f";
            return (
              <g key={g.id}>
                <path
                  d={g.path}
                  fill={fill}
                  fillRule="evenodd"
                  stroke={close ? "#b1b99a" : "#2c3c33"}
                  strokeWidth={close ? 1 : detailed ? 0.7 : 0.45}
                  vectorEffect="non-scaling-stroke"
                  className={styles.province}
                  role="button"
                  aria-label={`${g.name}, ${country.name}`}
                  tabIndex={g.id === selected ? 0 : -1}
                  data-province={g.id}
                  onPointerEnter={() => {
                    if (!pointers.current.size) setHover(g.id);
                  }}
                  onPointerLeave={() => setHover("")}
                  onClick={(e) => {
                    if (!drag.current.moved) onSelect(g.id, e.shiftKey);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(g.id, e.shiftKey);
                    }
                  }}
                >
                  <title>{`${g.name} · ${country.name} · ${TERRAINS[GEOGRAPHY[g.id].terrain].name} · ${g.vp} zafer puanı`}</title>
                </path>
              </g>
            );
          })}
        {/* Terrain is immutable: reuse one prerendered layer instead of thousands
            of clipped SVG primitives on every pan or simulation update. */}
        <image
          href={mapAssets.terrain.url}
          width={MAP.width}
          height={MAP.height}
          preserveAspectRatio="none"
          pointerEvents="none"
          data-testid="terrain-overlay"
        />
        <g pointerEvents="none">
          {MAP.provinces
            .filter(
              (g) =>
                terrainInView.has(g.id) &&
                world.provinces[g.id].owner !==
                  world.provinces[g.id].controller,
            )
            .map((g) => (
              <path
                key={g.id}
                d={g.path}
                fill="url(#occupied)"
                fillRule="evenodd"
              />
            ))}
        </g>
        <g pointerEvents="none" className={atlas.borders}>
          {MAP.countries.map((c) => (
            <path
              key={c.id}
              d={c.path}
              fill="none"
              stroke="#26362e"
              strokeWidth={close ? 1.8 : 1.6}
              vectorEffect="non-scaling-stroke"
              opacity=".85"
            />
          ))}
          {MAP.countries.map((c) => (
            <path
              key={c.id}
              d={c.path}
              fill="none"
              stroke="#e9dfbf"
              strokeWidth=".55"
              vectorEffect="non-scaling-stroke"
              opacity=".35"
            />
          ))}
        </g>
        {(detailed || mode === "supply") && (
          <g pointerEvents="none" clipPath="url(#land-clip)">
            {links
              .filter(
                ({ a, b }) =>
                  world.provinces[a.id].buildings.rail > 0 &&
                  world.provinces[b.id].buildings.rail > 0 &&
                  (mode === "supply" ||
                    a.id === selected ||
                    b.id === selected ||
                    (a.id === a.legacyRegion && b.id === b.legacyRegion)) &&
                  (mode !== "supply" ||
                    (network.has(a.id) && network.has(b.id))),
              )
              .map(({ a, b }) => (
                <g key={`${a.id}-${b.id}`}>
                  <path
                    d={curvedPath(a.x, a.y, b.x, b.y)}
                    fill="none"
                    stroke={mode === "supply" ? "#bad59c" : "#343d2e"}
                    strokeWidth={mode === "supply" ? 2 : 0.9}
                    vectorEffect="non-scaling-stroke"
                    opacity={mode === "supply" ? 0.7 : 0.4}
                  />
                  <path
                    d={curvedPath(a.x, a.y, b.x, b.y)}
                    fill="none"
                    stroke={mode === "supply" ? "#182c28" : "#eadfbd"}
                    strokeWidth=".65"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray="2 4"
                    opacity=".65"
                  />
                </g>
              ))}
          </g>
        )}
        {[hover, selected].filter(Boolean).map((id, i) => (
          <path
            key={`${id}-${i}`}
            d={GEOGRAPHY[id].path}
            fill={id === selected ? "#f2cb8c16" : "#ffffff13"}
            stroke={id === selected ? "#ffe0a3" : "#f4ecd1"}
            strokeWidth={id === selected ? 2.3 : 1.4}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {Object.entries(SEA_ZONES).map(([id, z]) => (
          <text
            key={id}
            x={z.x}
            y={z.y - (mode === "naval" ? 40 : 0)}
            className={atlas.seaName}
          >
            {z.name.toLocaleUpperCase("tr-TR")}
          </text>
        ))}
        {countryLabels.map((label) => {
          if (mode === "naval" || mode === "air") return null;
          const c = label.country,
            selectedCountry = world.provinces[selected]?.controller === c.id;
          if (
            (!detailed || close) &&
            TINY_COUNTRIES.has(c.id) &&
            !selectedCountry
          )
            return null;
          return (
            <g
              key={c.id}
              pointerEvents="none"
              opacity={mode === "supply" ? 0.55 : 1}
            >
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                className={atlas.nationName}
                style={{
                  fontSize: close
                    ? 8.5
                    : label.lands > 8
                      ? 15
                      : label.lands > 3
                        ? 12
                        : 9,
                  letterSpacing: close ? 1.3 : label.lands > 5 ? 2.5 : 1.1,
                }}
              >
                {(c.id === "uk"
                  ? "Britanya"
                  : c.id === "spain"
                    ? "İspanya"
                    : c.name
                ).toLocaleUpperCase("tr-TR")}
              </text>
            </g>
          );
        })}
        <g pointerEvents="none" data-testid="urban-centers">
          {MAP.provinces.map((p) => {
            const country = world.countries[world.provinces[p.id].controller],
              capital = capitals.has(p.id),
              label = cityLabels.get(p.id),
              markerSize = counterScale;
            if (!capital && !detailed && p.vp < 4 && p.id !== selected)
              return null;
            if (
              p.x < bounds.x - 30 ||
              p.x > bounds.x + bounds.w + 30 ||
              p.y < bounds.y - 30 ||
              p.y > bounds.y + bounds.h + 30
            )
              return null;
            return (
              <g key={p.id} data-city={p.id}>
                {capital ? (
                  <g
                    transform={`translate(${p.x} ${p.y}) scale(${markerSize})`}
                  >
                    <circle
                      r="5.2"
                      fill="#efe0b5"
                      stroke="#293e32"
                      strokeWidth="1"
                    />
                    <path
                      d="M0-3L.8-1 3-1 1.2.5 2 3 0 1.5-2 3-1.2.5-3-1-.8-1Z"
                      fill="#5b4930"
                    />
                  </g>
                ) : (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={(p.vp > 3 ? 2.6 : 2) * markerSize}
                    fill={p.id === selected ? "#fff1c8" : "#dccda6"}
                    stroke="#334533"
                    strokeWidth={0.8 * markerSize}
                  />
                )}
                {label && (
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor={label.end ? "end" : "start"}
                    data-city-label={p.id}
                    className={atlas.cityName}
                    style={{
                      fontSize: 11 * markerSize,
                      strokeWidth: 2.5 * markerSize,
                    }}
                  >
                    {p.name}
                  </text>
                )}
                {p.port && detailed && (
                  <use
                    href="#anchor-symbol"
                    x={p.x - 15 * markerSize}
                    y={p.y - 5 * markerSize}
                    width={8 * markerSize}
                    height={8 * markerSize}
                    style={{ color: "#d0d7c2" }}
                  />
                )}
                {mode === "supply" &&
                  world.provinces[p.id].buildings.hub > 0 &&
                  world.provinces[p.id].controller === player.id && (
                    <rect
                      x={p.x - 4 * markerSize}
                      y={p.y + 5 * markerSize}
                      width={8 * markerSize}
                      height={7 * markerSize}
                      fill={network.has(p.id) ? "#d6e6b4" : "#d38b70"}
                      stroke="#293f2a"
                      strokeWidth={markerSize}
                    />
                  )}
              </g>
            );
          })}
        </g>
        {[
          ...world.fronts
            .filter((f) => f.country === world.player)
            .map((f) => ({ id: f.id, points: f.provinces })),
          { id: "draft", points: draft },
        ]
          .filter((f) => f.points.length > 0)
          .map((f) => (
            <g key={f.id} pointerEvents="none">
              <polyline
                points={pointList(f.points)}
                fill="none"
                stroke="#183528"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity=".55"
              />
              <polyline
                points={pointList(f.points)}
                fill="none"
                stroke={f.id === "draft" ? "#ffe2a2" : "#b7d5a0"}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity=".9"
              />
              {f.points.map((id) => (
                <circle
                  key={id}
                  cx={GEOGRAPHY[id].x}
                  cy={GEOGRAPHY[id].y}
                  r="3.3"
                  fill="#eef0ce"
                  stroke="#354a32"
                />
              ))}
            </g>
          ))}
        {friendlyPlans.map((p) => {
          const army = world.armies.find((a) => p.armies.includes(a.id));
          if (!army || !p.objectives.length) return null;
          const points = pointList([army.province, ...p.objectives]);
          return (
            <g key={p.id} pointerEvents="none" opacity={p.active ? 0.95 : 0.6}>
              <polyline
                points={points}
                stroke="#573e29"
                strokeWidth="9"
                fill="none"
                strokeLinejoin="round"
                opacity=".5"
              />
              <polyline
                points={points}
                stroke="#eac484"
                strokeWidth="4.5"
                fill="none"
                strokeLinejoin="round"
                strokeDasharray={p.active ? undefined : "8 5"}
                markerEnd="url(#offensive-arrow)"
              />
              <text
                x={GEOGRAPHY[p.objectives[0]].x}
                y={GEOGRAPHY[p.objectives[0]].y - 22}
                className={atlas.planLabel}
              >
                {p.active
                  ? "TAARRUZ"
                  : `HAZIRLIK %${Math.floor(p.preparation)}`}
              </text>
            </g>
          );
        })}
        {routes.map((points) => (
          <polyline
            key={points}
            points={points}
            fill="none"
            stroke="#f2c779"
            strokeWidth="2.5"
            strokeDasharray="6 3"
            markerEnd="url(#order-arrow)"
            pointerEvents="none"
          />
        ))}
        {mode === "air" && (
          <g>
            {selectedWing && (
              <circle
                cx={GEOGRAPHY[selectedWing.wing.base].x}
                cy={GEOGRAPHY[selectedWing.wing.base].y}
                r={
                  AIRCRAFT[selectedWing.wing.model].range *
                  (selectedWing.country.tech.includes("aviation3") ? 1.2 : 1)
                }
                fill="#8fcedb08"
                stroke="#b2d7dc"
                strokeWidth="1.1"
                strokeDasharray="7 7"
                pointerEvents="none"
              />
            )}
            {Object.values(world.countries)
              .filter((c) => visible(c.id))
              .flatMap((c) =>
                c.air.wings
                  .filter((w) => w.count > 0)
                  .map((w) => {
                    const base = GEOGRAPHY[w.base],
                      target = GEOGRAPHY[w.target],
                      own = c.id === player.id;
                    const active = w.mission !== "idle",
                      path = curvedPath(base.x, base.y, target.x, target.y);
                    const offset =
                      c.air.wings
                        .slice(0, c.air.wings.indexOf(w))
                        .filter((a) => a.base === w.base && a.count > 0)
                        .length * 18;
                    return (
                      <g key={w.id}>
                        {active && (
                          <>
                            <path
                              d={path}
                              fill="none"
                              stroke={own ? "#b5dce4" : "#ddb1a2"}
                              strokeWidth={wingId === w.id ? 2.5 : 1.5}
                              strokeDasharray="5 4"
                              markerEnd="url(#air-arrow)"
                              pointerEvents="none"
                            />
                            <circle
                              cx={target.x}
                              cy={target.y}
                              r="12"
                              stroke="#9fc8cc"
                              fill="#a4c8d01a"
                              strokeDasharray="3 3"
                              pointerEvents="none"
                            />
                          </>
                        )}
                        <g
                          transform={`translate(${base.x + offset - 7} ${base.y - 22})`}
                          role="button"
                          aria-label={`${w.name}, ${Math.floor(w.count)} uçak, ${AIR_MISSIONS[w.mission]}`}
                          tabIndex={0}
                          className={atlas.airCounter}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!drag.current.moved) {
                              if (ordering) onSelect(w.base, e.shiftKey);
                              else setWingId(wingId === w.id ? null : w.id);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (ordering) onSelect(w.base, e.shiftKey);
                              else setWingId(wingId === w.id ? null : w.id);
                            }
                          }}
                        >
                          <rect
                            x="-2"
                            y="-2"
                            width="19"
                            height="22"
                            rx="2"
                            fill="#1a3e49"
                            stroke={wingId === w.id ? "#ffdc9a" : "#b9d4d5"}
                            strokeWidth="1"
                          />
                          <use
                            href="#aircraft-symbol"
                            width="12"
                            height="12"
                            x="1"
                            y="-1"
                            fill="#cfe9e9"
                          />
                          <text
                            x="7.5"
                            y="17"
                            textAnchor="middle"
                            fill="#e0e7d2"
                            fontSize="6.5"
                          >
                            {Math.floor(w.count)}
                          </text>
                          <title>{`${c.name} · ${w.name} · ${AIR_MISSIONS[w.mission]} · ${target.name}`}</title>
                        </g>
                      </g>
                    );
                  }),
              )}
          </g>
        )}
        {mode === "naval" && (
          <g>
            {(
              Object.entries(SEA_ZONES) as [
                SeaZone,
                (typeof SEA_ZONES)[SeaZone],
              ][]
            ).map(([id, z]) => {
              const control = seaControl(world, player.id, id),
                ownShips = player.navy.ships.filter(
                  (s) => s.zone === id && s.mission !== "idle",
                ),
                color =
                  control >= 0.5
                    ? "#9acdc1"
                    : ownShips.length
                      ? "#d7ab82"
                      : "#8ba3a3";
              const fleets = Object.values(world.countries)
                .filter(
                  (c) =>
                    visible(c.id) ||
                    (ownShips.some((s) => s.mission === "patrol") &&
                      player.wars.includes(c.id)),
                )
                .map((c) => ({
                  c,
                  ships: c.navy.ships.filter(
                    (s) => s.zone === id && s.mission !== "idle",
                  ),
                }))
                .filter((f) => f.ships.length);
              return (
                <g key={id}>
                  <ellipse
                    cx={z.x}
                    cy={z.y}
                    rx={id === "mediterranean" ? 220 : 125}
                    ry={id === "mediterranean" ? 65 : 90}
                    fill={`${color}15`}
                    stroke={color}
                    strokeWidth="1.2"
                    strokeDasharray="7 6"
                    mask="url(#ocean-mask)"
                    pointerEvents="none"
                  />
                  <g
                    transform={`translate(${z.x - 42} ${z.y - 20})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${z.name}, deniz üstünlüğü yüzde ${Math.round(control * 100)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!drag.current.moved)
                        setSeaZone(seaZone === id ? null : id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSeaZone(seaZone === id ? null : id);
                      }
                    }}
                    className={atlas.seaCounter}
                  >
                    <rect
                      width="84"
                      height="28"
                      rx="3"
                      fill="#16343c"
                      stroke={seaZone === id ? "#f6d8a0" : color}
                      strokeWidth="1"
                    />
                    <text
                      x="42"
                      y="11"
                      textAnchor="middle"
                      fill="#a9c3c0"
                      fontSize="6"
                      letterSpacing="1"
                    >
                      DENİZ ÜSTÜNLÜĞÜ
                    </text>
                    <text
                      x="42"
                      y="23"
                      textAnchor="middle"
                      fill="#e3e6cd"
                      fontSize="10"
                    >
                      %{Math.round(control * 100)}
                    </text>
                  </g>
                  {fleets.map(({ c, ships }, i) => (
                    <g
                      key={c.id}
                      transform={`translate(${z.x - 30 + i * 37} ${z.y + 15})`}
                      pointerEvents="none"
                    >
                      <rect
                        width="32"
                        height="20"
                        rx="2"
                        fill={c.id === player.id ? "#d7e1cd" : "#977967"}
                        stroke="#102a2f"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M4 11L6 15H18L21 11ZM10 10V5H15V10M12 5V2"
                        stroke="#2f4c48"
                        fill="none"
                        strokeWidth="1"
                      />
                      <text
                        x="26"
                        y="14"
                        textAnchor="middle"
                        fill="#29443e"
                        fontSize="8"
                      >
                        {ships.length}
                      </text>
                      <title>{`${c.name} · ${ships.length} gemi · ortalama gövde %${Math.round(ships.reduce((n, s) => n + s.health, 0) / ships.length)}`}</title>
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        )}
        {formations.map((group, index) => {
          const position = GEOGRAPHY[group[0].province];
          if (
            position.x < bounds.x - 50 * counterScale ||
            position.x > bounds.x + bounds.w + 50 * counterScale ||
            position.y < bounds.y - 50 * counterScale ||
            position.y > bounds.y + bounds.h + 50 * counterScale
          )
            return null;
          const a = group.find((a) => a.id === armyId) ?? group[0],
            p = GEOGRAPHY[a.province],
            own = a.country === world.player,
            chosen = group.some((x) => selectedArmies.has(x.id));
          const offset =
            formations
              .slice(0, index)
              .filter((g) => g[0].province === a.province).length * 31;
          const averageOrg =
            group.reduce((n, a) => n + a.organization, 0) / group.length;
          return (
            <g
              key={`${a.province}:${a.country}`}
              transform={`translate(${p.x + (-13 + offset) * counterScale} ${p.y + 4 * counterScale}) scale(${counterScale})`}
              role="button"
              tabIndex={own ? 0 : -1}
              aria-label={`${world.countries[a.country].name}: ${group.length} tümen, ${p.name}`}
              data-army={own ? a.id : undefined}
              data-army-stack={
                own ? group.map((unit) => unit.id).join(",") : undefined
              }
              aria-pressed={own ? chosen : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (!drag.current.moved) {
                  if (ordering) onSelect(a.province, e.shiftKey);
                  else if (own)
                    onArmies(
                      group.map((unit) => unit.id),
                      e.shiftKey,
                    );
                  else onSelect(a.province, false);
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && own) {
                  e.preventDefault();
                  if (ordering) onSelect(a.province, e.shiftKey);
                  else
                    onArmies(
                      group.map((unit) => unit.id),
                      e.shiftKey,
                    );
                }
              }}
              className={`${styles.counter} ${atlas.armyCounter}`}
              opacity={mode === "air" || mode === "naval" ? 0.65 : 1}
            >
              {group.length > 1 && (
                <rect
                  x="3"
                  y="-3"
                  width="29"
                  height="20"
                  rx="1.5"
                  fill="#9ca58c"
                  stroke="#263b31"
                  strokeWidth="1"
                />
              )}
              <rect
                width="29"
                height="20"
                rx="1.5"
                fill={
                  own
                    ? "#e3dfc5"
                    : player.allies.includes(a.country)
                      ? "#b9ced0"
                      : "#9c7765"
                }
                stroke={chosen ? "#ffdf97" : "#25362d"}
                strokeWidth={chosen ? 2.1 : 1.3}
              />
              <rect
                x="0"
                y="0"
                width="3"
                height="20"
                fill={world.countries[a.country].color}
              />
              <rect
                x="6"
                y="4"
                width="12"
                height="9"
                fill="none"
                stroke={own ? "#364a38" : "#f1e8d1"}
                strokeWidth=".8"
              />
              <text
                x="12"
                y="12"
                textAnchor="middle"
                fontSize="10"
                fill={own ? "#263b2e" : "#f4ecd7"}
              >
                {UNITS[a.type].symbol}
              </text>
              <text
                x="23"
                y="13"
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill={own ? "#263b2e" : "#f4ecd7"}
              >
                {group.length}
              </text>
              <rect x="3" y="17" width="26" height="3" fill="#394537" />
              <rect
                x="3"
                y="17"
                width={(26 * averageOrg) / 100}
                height="3"
                fill={a.supply < 0.3 ? "#dc8065" : "#83b77c"}
              />
              {a.move && <path d="M30 8L35 10L30 12" fill="#f2cd8f" />}
              <title>{`${a.name} · ${group.length} tümen · Organizasyon %${Math.round(averageOrg)} · İkmal %${Math.round(a.supply * 100)}`}</title>
            </g>
          );
        })}
        {world.battles
          .filter(
            (b) =>
              visible(b.attacker) ||
              visible(b.defender) ||
              GEOGRAPHY[b.province].neighbors.some(
                (n) => world.provinces[n.id].controller === player.id,
              ),
          )
          .map((b) => {
            const p = GEOGRAPHY[b.province],
              ratio = b.attack / Math.max(1, b.attack + b.defense),
              favorable = b.attacker === player.id ? ratio >= 0.5 : ratio < 0.5;
            return (
              <g
                key={b.id}
                transform={`translate(${p.x + 30} ${p.y - 12})`}
                className={styles.battlePulse}
                pointerEvents="none"
              >
                <circle
                  r="12"
                  fill="#352c22"
                  stroke={favorable ? "#bdd598" : "#db9c7c"}
                  strokeWidth="2"
                />
                <path
                  d="M-4-5L5 5M-5 5L5-5M-5-4L-3-6M4 6L6 4M-6 4L-4 6M3-6L5-4"
                  stroke="#e9d7ad"
                  strokeWidth="1.4"
                />
                <title>{`${p.name} muharebesi · saldırı ${Math.round(b.attack)} / savunma ${Math.round(b.defense)}`}</title>
              </g>
            );
          })}
      </svg>
      <div className={atlas.search}>
        <input
          aria-label="Şehir bul"
          placeholder="⌕ Şehir bul…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearch("");
          }}
        />
        {search.trim() && (
          <div role="list" aria-label="Şehir arama sonuçları">
            {URBAN_PLACES.filter((p) =>
              searchName(p.name).includes(searchName(search.trim())),
            )
              .slice(0, 6)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setView((v) => {
                      const w = Math.min(420, (350 * v.w) / v.h),
                        h = (w * v.h) / v.w;
                      return constrainCamera({
                        x: p.x - w / 2,
                        y: p.y - h / 2,
                        w,
                        h,
                      });
                    });
                    onSelect(p.province, false);
                    setSearch("");
                  }}
                >
                  {p.name}
                  <small>
                    {
                      world.countries[world.provinces[p.province].controller]
                        .name
                    }
                  </small>
                </button>
              ))}
            {!URBAN_PLACES.some((p) =>
              searchName(p.name).includes(searchName(search.trim())),
            ) && <p>Şehir bulunamadı.</p>}
          </div>
        )}
      </div>
      <div className={atlas.compass} aria-hidden="true">
        <span>K</span>
        <svg viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth=".7"
          />
          <path
            d="M22 4L27 22 22 40 17 22Z"
            fill="none"
            stroke="currentColor"
            strokeWidth=".9"
          />
          <path d="M22 4L27 22H22Z" fill="currentColor" />
          <path d="M4 22H40" stroke="currentColor" strokeWidth=".5" />
        </svg>
      </div>
      <div className={styles.mapControls}>
        <button onClick={() => zoom(0.75)} aria-label="Haritayı yakınlaştır">
          ＋
        </button>
        <button onClick={() => zoom(1.33)} aria-label="Haritayı uzaklaştır">
          −
        </button>
        <button
          onClick={focusPlayer}
          title="Başkentime git"
          aria-label="Başkentime git"
        >
          ⌖
        </button>
        <button onClick={resetView} aria-label="Tüm haritayı göster">
          ↔
        </button>
      </div>
      {hovered && infoProvince && !ordering && (
        <div className={atlas.regionInfo} aria-live="polite">
          <span className={atlas.infoLine}>
            <i
              style={{
                background: world.countries[infoProvince.controller].color,
              }}
            />
            {world.countries[infoProvince.controller].name}
          </span>
          <strong>{hovered.name}</strong>
          <span>
            {TERRAINS[GEOGRAPHY[hovered.id].terrain].name} · {hovered.vp} zafer
            puanı {hovered.port ? "· Liman" : ""}
          </span>
          {infoProvince.controller === player.id && (
            <small>
              İkmal %
              {Math.round(
                localSupply(world, player.id, hovered.id, network) * 100,
              )}{" "}
              · Altyapı {infoProvince.buildings.infra}/5
            </small>
          )}
        </div>
      )}
      {mode === "air" && selectedWing && (
        <div className={atlas.layerInfo}>
          <button
            aria-label="Hava bilgilerini kapat"
            onClick={() => setWingId(null)}
          >
            ×
          </button>
          <strong>{selectedWing.wing.name}</strong>
          <small>
            {selectedWing.country.name} ·{" "}
            {AIRCRAFT[selectedWing.wing.model].name}
          </small>
          <span>
            {AIR_MISSIONS[selectedWing.wing.mission]} ·{" "}
            {Math.floor(selectedWing.wing.count)} uçak
          </span>
          <small>
            {GEOGRAPHY[selectedWing.wing.base].name} →{" "}
            {GEOGRAPHY[selectedWing.wing.target].name}
          </small>
          <small>Kesikli çember: üsten erişim menzili</small>
        </div>
      )}
      {mode === "naval" && seaZone && (
        <div className={atlas.layerInfo}>
          <button
            aria-label="Deniz bilgilerini kapat"
            onClick={() => setSeaZone(null)}
          >
            ×
          </button>
          <strong>{SEA_ZONES[seaZone].name}</strong>
          <span>
            Deniz üstünlüğü %
            {Math.round(seaControl(world, player.id, seaZone) * 100)}
          </span>
          <small>
            {
              player.navy.ships.filter(
                (s) => s.zone === seaZone && s.mission !== "idle",
              ).length
            }{" "}
            görevde gemin var.
          </small>
          <small>Devriye ve eskortlar deniz ikmalini korur.</small>
        </div>
      )}
      <div className={atlas.overview}>
        <span>
          HAREKÂT SAHASI{" "}
          <b>{Math.round((fitCamera(view.w / view.h).w / view.w) * 100)}%</b>
        </span>
        <svg
          viewBox="0 0 1320 880"
          role="button"
          aria-label="Küçük haritada konuma git"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              focusPlayer();
            }
          }}
          onClick={(e) => {
            const matrix = e.currentTarget.getScreenCTM();
            if (!matrix) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
              matrix.inverse(),
            );
            setView((v) =>
              constrainCamera({ ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 }),
            );
          }}
        >
          <rect width="1320" height="880" fill="#18323a" />
          {MAP.provinces.map((p) => {
            const controller = world.provinces[p.id].controller;
            return (
              <path
                key={p.id}
                d={p.path}
                fill={
                  controller === world.player
                    ? "#b4c29b"
                    : player.wars.includes(controller)
                      ? "#a47564"
                      : player.allies.includes(controller)
                        ? "#8caeb2"
                        : "#617567"
                }
                fillRule="evenodd"
                stroke="#1e302d"
                strokeWidth="1"
              />
            );
          })}
          <rect
            ref={overviewRef}
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="#e2d5a30c"
            stroke="#eed9a4"
            strokeWidth="10"
          />
        </svg>
      </div>
      <div className={styles.mapLegend}>
        <b>{MODE_NAMES[mode]}</b> ·{" "}
        {ordering
          ? "Hedef seç"
          : "Sürükle · Tekerlek / iki parmak: yakınlaştır"}
        <span>
          {mode === "supply"
            ? "Hatlar: demiryolu · Kare: ikmal merkezi · Kırmızı: ikmal kesik"
            : mode === "military"
              ? "Yeşil: sen · Kırmızı: düşman · Oklar: taarruz planı"
              : mode === "terrain"
                ? "Kabartma: dağ · Ağaç dokusu: orman · Çizgiler: demiryolu"
                : mode === "air"
                  ? "Uçağa tıkla: menzil · Kesikli hat: görev rotası"
                  : mode === "naval"
                    ? "Bölgeye tıkla: deniz üstünlüğü · Semboller: görevdeki filolar"
                    : "★ Başkent · Taralı alan: işgal · Yakınlaş: şehirler ve demiryolları"}
        </span>
      </div>
    </div>
  );
}

export default memo(WarMap);
