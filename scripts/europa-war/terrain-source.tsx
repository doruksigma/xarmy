// Source for the static terrain overlay. Regenerate with render-terrain.cjs.
// Borders, interaction, ownership and military overlays stay live in WarMap.
import MAP from "../../app/games/europa-war/strategy/map-data.json";
function TerrainTexture({
  terrain,
  id,
  path,
  x,
  y,
}: {
  terrain: string;
  id: string;
  path: string;
  x: number;
  y: number;
}) {
  return (
    <g pointerEvents="none" clipPath={`url(#province-clip-${id})`}>
      <path d={path} fill={`url(#texture-${terrain})`} />
      {terrain === "mountain" && (
        <g transform={`translate(${x - 65} ${y - 55}) rotate(-15 60 60)`}>
          {[0, 1, 2, 3].map((n) => (
            <g key={n} transform={`translate(${n * 26} ${(n % 2) * 16})`}>
              <path
                d="M-12 100 Q2 48 28 0 Q30 27 68 96Z"
                fill="url(#mountain-relief)"
              />
              <path
                d="M28 0Q22 31 13 46M28 0Q38 35 48 49M21 26L26 27 29 18 34 30"
                fill="none"
                stroke="#f8eed1"
                strokeWidth="1.1"
                opacity=".35"
              />
              {[28, 44, 60, 76].map((h) => (
                <path
                  key={h}
                  d={`M${22 - h * 0.25} ${h}Q23 ${h - 10} ${32 + h * 0.3} ${h + 4}`}
                  fill="none"
                  stroke="#372f25"
                  strokeWidth=".6"
                  opacity=".16"
                />
              ))}
            </g>
          ))}
        </g>
      )}
      {terrain === "urban" && (
        <g
          transform={`translate(${x - 18} ${y - 15}) rotate(-14 18 15)`}
          opacity=".3"
        >
          {Array.from({ length: 16 }, (_, i) => (
            <rect
              key={i}
              x={(i % 4) * 10}
              y={Math.floor(i / 4) * 9}
              width={5 + (i % 3)}
              height={4 + (i % 2)}
              fill="#4a483c"
              stroke="#eadbbe"
              strokeWidth=".5"
            />
          ))}
        </g>
      )}
      <path d={path} fill="url(#land-light)" opacity=".32" />
    </g>
  );
}
export function TerrainAtlas() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={MAP.width * 2}
      height={MAP.height * 2}
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
    >
      <defs>
        <linearGradient id="land-light" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fcf0cf" stopOpacity=".5" />
          <stop offset=".5" stopColor="#e8dab4" stopOpacity="0" />
          <stop offset="1" stopColor="#17271c" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id="mountain-relief" x1="0" y1="0" x2="1" y2=".5">
          <stop stopColor="#eadfbd" stopOpacity=".4" />
          <stop offset=".47" stopColor="#e4d7b2" stopOpacity=".36" />
          <stop offset=".51" stopColor="#262d23" stopOpacity=".4" />
          <stop offset="1" stopColor="#343b29" stopOpacity="0" />
        </linearGradient>
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
          id="paper-grain"
          width="19"
          height="17"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M2 3h1m8 3h1M5 14h1M17 12h1"
            stroke="#eadfbd"
            strokeWidth=".7"
            opacity=".15"
          />
          <path
            d="M15 3h1M2 9h1M10 15h1"
            stroke="#273c2d"
            strokeWidth=".9"
            opacity=".14"
          />
        </pattern>
        <pattern
          id="texture-plains"
          width="44"
          height="34"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 13Q11 4 25 13T51 14M-3 18Q11 9 25 18T51 19"
            stroke="#a2ac7e"
            fill="none"
            strokeWidth=".7"
            opacity=".21"
          />
        </pattern>
        <pattern
          id="texture-forest"
          width="23"
          height="21"
          patternUnits="userSpaceOnUse"
        >
          <g fill="#243f2c" opacity=".23">
            <path d="M4 1L.5 9H2L0 13H8L6 9H8Z" />
            <path d="M16 9L12 18H20Z" />
          </g>
          <path
            d="M4 6V15M16 14V20"
            stroke="#e1d9b1"
            opacity=".12"
            strokeWidth=".6"
          />
        </pattern>
        <pattern
          id="texture-mountain"
          width="54"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M-5 35Q12 0 29 32T62 30M-5 40Q12 5 29 37T62 35M-5 45Q12 10 29 42T62 40"
            fill="none"
            stroke="#374334"
            opacity=".24"
            strokeWidth=".8"
          />
        </pattern>
        <pattern
          id="texture-marsh"
          width="28"
          height="25"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M2 15H15M6 18H18M12 4H26M10 15V8M8 13L6 10M10 12L13 8"
            stroke="#1f4b45"
            opacity=".3"
            strokeWidth=".8"
            fill="none"
          />
        </pattern>
        <pattern
          id="texture-desert"
          width="40"
          height="25"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 15Q15 0 28 14M4 19Q15 4 28 18"
            stroke="#dbc291"
            fill="none"
            opacity=".35"
          />
          <circle cx="32" cy="7" r=".6" fill="#584a32" opacity=".4" />
        </pattern>
        <pattern
          id="texture-urban"
          width="43"
          height="41"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 20H43M21 0V41"
            stroke="#b6a984"
            opacity=".12"
            strokeWidth=".5"
          />
        </pattern>

        <clipPath id="land-clip">
          {MAP.countries.map((c) => (
            <path key={c.id} d={c.path} />
          ))}
        </clipPath>
        {MAP.provinces.map((p) => (
          <clipPath key={p.id} id={`province-clip-${p.id}`}>
            <path d={p.path} fillRule="evenodd" />
          </clipPath>
        ))}
      </defs>
      {MAP.provinces.map((p) => (
        <TerrainTexture
          key={p.id}
          terrain={p.terrain}
          id={p.id}
          path={p.path}
          x={p.x}
          y={p.y}
        />
      ))}
      <path
        d={`M0 0H${MAP.width}V${MAP.height}H0Z`}
        clipPath="url(#land-clip)"
        fill="url(#paper-grain)"
      />
    </svg>
  );
}
