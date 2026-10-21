"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TERRAINS, UNITS } from "./catalog";
import { GEOGRAPHY, localSupply, MAP, supplyNetwork } from "./world";
import type { World } from "./types";
import styles from "../europa.module.css";

export type MapMode = "political" | "terrain" | "military" | "supply";
export default function WarMap({
  world,
  selected,
  armyId,
  mode,
  onSelect,
  onArmy,
  ordering,
  draft = [],
}: {
  world: World;
  selected: string;
  armyId: string | null;
  mode: MapMode;
  onSelect: (id: string, append: boolean) => void;
  onArmy: (id: string) => void;
  ordering: boolean;
  draft?: string[];
}) {
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef({ id: -1, x: 0, y: 0, vx: 0, vy: 0, moved: false });
  const [view, setView] = useState({ x: 0, y: 0, w: 1320, h: 880 });
  const [hover, setHover] = useState("");
  const network = useMemo(() => supplyNetwork(world, world.player), [world]);
  const selectedArmy = world.armies.find((a) => a.id === armyId);
  const formations = useMemo(() => {
    const out = new Map<string, typeof world.armies>();
    for (const a of world.armies) {
      const visible =
        a.country === world.player ||
        world.countries[world.player].allies.includes(a.country) ||
        world.countries[world.player].intel[a.country]?.expires > world.day ||
        world.battles.some((b) => b.province === a.province) ||
        GEOGRAPHY[a.province].neighbors.some(
          (n) => world.provinces[n.id].controller === world.player,
        );
      if (!visible) continue;
      const key = `${a.province}:${a.country}`;
      out.set(key, [...(out.get(key) ?? []), a]);
    }
    return [...out.values()];
  }, [world]);
  function zoom(factor: number, fx = 0.5, fy = 0.5, point?: DOMPoint) {
    setView((v) => {
      const w = Math.max(260, Math.min(1800, v.w * factor)),
        h = (w * 2) / 3;
      return {
        x: point ? point.x - ((point.x - v.x) * w) / v.w : v.x + (v.w - w) * fx,
        y: point ? point.y - ((point.y - v.y) * h) / v.h : v.y + (v.h - h) * fy,
        w,
        h,
      };
    });
  }
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const matrix = el.getScreenCTM();
      if (matrix)
        zoom(
          e.deltaY > 0 ? 1.12 : 0.89,
          0.5,
          0.5,
          new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()),
        );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  function focusPlayer() {
    const p = GEOGRAPHY[world.countries[world.player].capital];
    setView({ x: p.x - 350, y: p.y - 235, w: 700, h: 466.67 });
  }
  const route = selectedArmy
    ? [
        selectedArmy.province,
        ...(selectedArmy.move ? [selectedArmy.move.to] : []),
        ...selectedArmy.route,
      ]
    : [];
  return (
    <div className={`${styles.map} ${ordering ? styles.ordering : ""}`}>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid slice"
        aria-label="Avrupa strateji haritası"
        data-testid="war-map"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            vx: view.x,
            vy: view.y,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d.id !== e.pointerId) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 5) {
            d.moved = true;
            svg.current?.setPointerCapture(e.pointerId);
            const rect = e.currentTarget.getBoundingClientRect();
            const scale = Math.min(view.w / rect.width, view.h / rect.height);
            setView((v) => ({
              ...v,
              x: Math.max(-500, Math.min(1450, d.vx - dx * scale)),
              y: Math.max(-350, Math.min(950, d.vy - dy * scale)),
            }));
          }
        }}
        onPointerUp={(e) => {
          drag.current.id = -1;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current.id = -1;
        }}
      >
        <defs>
          <pattern
            id="sea-grid"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M60 0H0V60"
              fill="none"
              stroke="#abc5be"
              strokeWidth=".3"
              opacity=".12"
            />
          </pattern>
          <pattern
            id="occupied"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(30)"
          >
            <path d="M0 0V6" stroke="#f7e6c6" strokeWidth="2" opacity=".3" />
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
          <radialGradient id="sea-glow">
            <stop stopColor="#263d43" />
            <stop offset="1" stopColor="#14282e" />
          </radialGradient>
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
          fill="url(#sea-grid)"
        />
        {[
          [245, 130, "KUZEY ATLANTİK"],
          [525, 260, "KUZEY DENİZİ"],
          [555, 845, "AKDENİZ"],
          [990, 625, "KARADENİZ"],
        ].map(([x, y, name]) => (
          <text key={name} x={x} y={y} className={styles.seaLabel}>
            {name}
          </text>
        ))}
        {MAP.provinces.map((g) => {
          const p = world.provinces[g.id],
            country = world.countries[p.controller];
          let fill = country.color;
          if (mode === "terrain")
            fill = TERRAINS[GEOGRAPHY[g.id].terrain].color;
          if (mode === "supply")
            fill =
              p.controller === world.player
                ? `hsl(${localSupply(world, world.player, p.id, network) * 110} 30% 40%)`
                : "#3d494c";
          if (mode === "military")
            fill =
              p.controller === world.player
                ? "#678879"
                : world.countries[world.player].wars.includes(p.controller)
                  ? "#955d58"
                  : world.countries[world.player].allies.includes(p.controller)
                    ? "#618594"
                    : "#535b59";
          return (
            <g key={g.id}>
              <path
                d={g.path}
                fill={fill}
                fillRule="evenodd"
                stroke="#24312f"
                strokeWidth=".85"
                className={styles.province}
                role="button"
                aria-label={`${g.name}, ${country.name}`}
                tabIndex={g.id === selected ? 0 : -1}
                data-province={g.id}
                onPointerEnter={() => setHover(g.id)}
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
              {p.owner !== p.controller && (
                <path
                  d={g.path}
                  fill="url(#occupied)"
                  fillRule="evenodd"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
        {MAP.countries.map((c) => (
          <path
            key={c.id}
            d={c.path}
            fill="none"
            stroke="#101f21"
            strokeWidth="1.6"
            opacity=".65"
            pointerEvents="none"
          />
        ))}
        {[hover, selected].filter(Boolean).map((id, i) => (
          <path
            key={`${id}-${i}`}
            d={GEOGRAPHY[id].path}
            fill={i === 1 ? "#f2cb8c12" : "#ffffff12"}
            stroke={i === 1 ? "#f2cb8c" : "#e7e6ce"}
            strokeWidth={i === 1 ? 2.2 : 1.2}
            pointerEvents="none"
          />
        ))}
        {MAP.countries.map((c) => {
          const capital = GEOGRAPHY[c.capital];
          const wc = world.countries[c.id];
          if (
            wc.capitulated &&
            !Object.values(world.provinces).some((p) => p.controller === c.id)
          )
            return null;
          return (
            <g key={c.id} pointerEvents="none">
              <circle
                cx={capital.x}
                cy={capital.y}
                r="2.5"
                fill="#f5e2b5"
                stroke="#253334"
                strokeWidth="1"
              />
              <text
                x={capital.x}
                y={capital.y - 12}
                textAnchor="middle"
                className={styles.countryLabel}
                style={{
                  fontSize: [
                    "luxembourg",
                    "belgium",
                    "netherlands",
                    "albania",
                    "estonia",
                    "latvia",
                    "lithuania",
                  ].includes(c.id)
                    ? 8
                    : 11,
                }}
              >
                {c.name.toLocaleUpperCase("tr-TR")}
              </text>
            </g>
          );
        })}
        {view.w < 800 &&
          MAP.provinces.map((p) => (
            <text
              key={p.id}
              x={p.x}
              y={p.y + 20}
              textAnchor="middle"
              className={styles.cityLabel}
              pointerEvents="none"
            >
              {p.name}
              {p.port ? " ⚓" : ""}
            </text>
          ))}
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
                points={f.points
                  .map((id) => `${GEOGRAPHY[id].x},${GEOGRAPHY[id].y}`)
                  .join(" ")}
                fill="none"
                stroke={f.id === "draft" ? "#f9dba1" : "#adcfb5"}
                strokeWidth="5"
                strokeLinecap="round"
                opacity=".75"
              />
              {f.points.map((id) => (
                <circle
                  key={id}
                  cx={GEOGRAPHY[id].x}
                  cy={GEOGRAPHY[id].y}
                  r="4"
                  fill="#dbe4bd"
                />
              ))}
            </g>
          ))}
        {route.length > 1 && (
          <polyline
            points={route
              .map((id) => `${GEOGRAPHY[id].x},${GEOGRAPHY[id].y}`)
              .join(" ")}
            fill="none"
            stroke="#f2c779"
            strokeWidth="2.5"
            strokeDasharray="6 3"
            markerEnd="url(#order-arrow)"
            pointerEvents="none"
          />
        )}
        {formations.map((group, index) => {
          const a = group.find((a) => a.id === armyId) ?? group[0],
            p = GEOGRAPHY[a.province],
            own = a.country === world.player;
          const offset =
            formations
              .slice(0, index)
              .filter((g) => g[0].province === a.province).length * 26;
          return (
            <g
              key={`${a.province}:${a.country}`}
              transform={`translate(${p.x - 11 + offset} ${p.y - 3})`}
              role="button"
              tabIndex={own ? 0 : -1}
              aria-label={`${world.countries[a.country].name}: ${group.length} tümen, ${p.name}`}
              data-army={own ? a.id : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (!drag.current.moved) {
                  if (own) onArmy(a.id);
                  else onSelect(a.province, false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && own) onArmy(a.id);
              }}
              className={styles.counter}
            >
              <rect
                width="25"
                height="17"
                rx="2"
                fill={own ? "#e2dfca" : "#625655"}
                stroke={
                  group.some((x) => x.id === armyId) ? "#ffd183" : "#202b2c"
                }
                strokeWidth="1.8"
              />
              <rect
                x="3"
                y="3"
                width="12"
                height="9"
                fill="none"
                stroke={own ? "#3b5045" : "#f2e2cf"}
                strokeWidth=".7"
              />
              <text
                x="9"
                y="11.5"
                textAnchor="middle"
                fontSize="10"
                fill={own ? "#243d35" : "#f2e2cf"}
              >
                {UNITS[a.type].symbol}
              </text>
              <text
                x="20"
                y="12"
                textAnchor="middle"
                fontSize="8"
                fill={own ? "#243d35" : "#f2e2cf"}
              >
                {group.length}
              </text>
              <rect
                y="15"
                height="2"
                width={(25 * a.organization) / 100}
                fill={a.supply < 0.3 ? "#e77c65" : "#77b591"}
              />
            </g>
          );
        })}
        {world.battles.map((b) => {
          const p = GEOGRAPHY[b.province];
          return (
            <g
              key={b.id}
              transform={`translate(${p.x + 25} ${p.y - 12})`}
              className={styles.battlePulse}
              pointerEvents="none"
            >
              <circle r="10" fill="#873f30" stroke="#ffc28a" />
              <text y="4" textAnchor="middle" fontSize="13" fill="#ffe6cb">
                ⚔
              </text>
            </g>
          );
        })}
      </svg>
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
        <button
          onClick={() => setView({ x: 0, y: 0, w: 1320, h: 880 })}
          aria-label="Tüm haritayı göster"
        >
          ↔
        </button>
      </div>
      <div className={styles.mapLegend}>
        {ordering
          ? "HEDEF SEÇ · Shift ile rotaya ekle"
          : "Sürükle: harita · Tekerlek: yakınlaştır"}
        <span>
          {mode === "supply"
            ? "Kırmızı: kesik ikmal · Yeşil: güçlü ikmal"
            : mode === "military"
              ? "Yeşil: sen · Kırmızı: düşman · Mavi: müttefik"
              : mode === "terrain"
                ? "Dağ · Orman · Ova · Şehir · Bataklık"
                : "★ Başkent · Taralı alan: işgal"}
        </span>
      </div>
    </div>
  );
}
