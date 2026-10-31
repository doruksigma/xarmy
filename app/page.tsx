import Link from "next/link";
import styles from "./home.module.css";

type ArtworkKind = "battle" | "chess" | "europa" | "hide";

// Original, lightweight vector artwork; playable renderers load on game routes.
function Artwork({ kind }: { kind: ArtworkKind }) {
  if (kind === "battle")
    return (
      <svg viewBox="0 0 560 240" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gallery-battle-sky" x2="0" y2="1">
            <stop stopColor="#9db5ba" />
            <stop offset="1" stopColor="#dfc6a4" />
          </linearGradient>
        </defs>
        <path fill="url(#gallery-battle-sky)" d="M0 0h560v240H0z" />
        <circle cx="414" cy="68" r="35" fill="#fff1c9" opacity=".8" />
        <path
          d="M0 153 81 93 141 131 237 54 321 138 395 102 560 164V240H0Z"
          fill="#6a858b"
        />
        <path d="m186 94 51-40 42 42-33-12-14 17-14-15Z" fill="#d7dfd5" />
        <path
          d="M0 184 87 151 172 172 275 124 374 174 464 137 560 175v65H0Z"
          fill="#344f53"
        />
        <path d="M0 212 130 185 249 202 360 171 560 212v28H0Z" fill="#1a3337" />
        {[42, 82, 474, 514].map((x, i) => (
          <g key={x} transform={`translate(${x} ${139 + (i % 2) * 19})`}>
            <path d="M0-52-17 2h11l-16 28h44L6 2h11Z" fill="#223f43" />
            <path d="M-2 23h4v24h-4Z" fill="#253a3b" />
          </g>
        ))}
        <path d="M332 164h64v33h-64Zm-4 0 35-19 39 19Z" fill="#b99b76" />
        <path d="M339 177h10v11h-10Zm29-2h13v22h-13Z" fill="#3d5151" />
        <path d="M271 240 317 184h9l-26 56Z" fill="#b9a68a" opacity=".7" />
        <g transform="translate(226 168)">
          <ellipse cy="67" rx="33" ry="5" fill="#0d252a" opacity=".6" />
          <path d="m-11 32-4 36h10l8-31 6 31h10l-6-37Z" fill="#172a2f" />
          <path
            d="m-14 4-8 33 9 2 4-20v22h25V16l8 9 7-6L18 3Z"
            fill="#42504a"
          />
          <path d="M-6-13h15l5 8-4 13H-5l-6-13Z" fill="#9a9980" />
          <path d="M-11-9q10-17 24-1v5h-24Z" fill="#253d41" />
          <path d="m13 18 33-12 3 5-33 14Z" fill="#15282e" />
          <path d="M-6 8h17v26H-6Z" fill="#68705b" />
        </g>
        <path
          d="m107 41 30 9-23 4-8 9-4-2 4-10-23-5 1-4 24 4 5-11 4 1Z"
          fill="#435d64"
        />
      </svg>
    );
  if (kind === "hide")
    return (
      <svg viewBox="0 0 560 240" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gallery-hide-sky" x2="0" y2="1">
            <stop stopColor="#8ec9b4" />
            <stop offset="1" stopColor="#dce2b7" />
          </linearGradient>
        </defs>
        <path fill="url(#gallery-hide-sky)" d="M0 0h560v240H0z" />
        <circle cx="423" cy="62" r="32" fill="#fff1b6" />
        <path d="M0 170Q140 70 280 159T560 134v106H0Z" fill="#78a883" />
        <path d="M0 205Q130 128 265 194T560 175v65H0Z" fill="#4b805f" />
        {[69, 483].map((x) => (
          <g key={x} transform={`translate(${x} 0)`}>
            <path d="M-8 65H9v140H-8Z" fill="#7d7150" />
            <ellipse cy="58" rx="48" ry="61" fill="#2d7258" />
            <ellipse cx="-21" cy="80" rx="36" ry="40" fill="#3d8861" />
            <ellipse cx="28" cy="79" rx="29" ry="39" fill="#39815b" />
          </g>
        ))}
        <ellipse
          cx="270"
          cy="220"
          rx="105"
          ry="12"
          fill="#244e41"
          opacity=".35"
        />
        <g transform="translate(251 136)">
          <path d="M-18 39h14v40h-14Zm24 0h14v40H6Z" fill="#354e4c" />
          <rect x="-26" y="-3" width="55" height="55" rx="14" fill="#8fa95b" />
          <rect x="-42" y="4" width="17" height="43" rx="8" fill="#9fb763" />
          <rect x="28" y="4" width="17" height="43" rx="8" fill="#9fb763" />
          <circle cy="-27" r="27" fill="#ddbd8a" />
          <path d="M-31-34q6-34 40-20 15 5 19 20Z" fill="#759653" />
          <rect x="-36" y="-35" width="72" height="8" rx="4" fill="#b5c57d" />
          <circle cx="-9" cy="-23" r="2.5" fill="#374b39" />
          <circle cx="10" cy="-23" r="2.5" fill="#374b39" />
          <path
            d="M-7-12q8 7 16 0"
            fill="none"
            stroke="#886d47"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
        <path
          d="M298 232q-21-37 4-49-4-36 27-33 17-25 39-6 31-2 33 31 27 17 7 57Z"
          fill="#397d50"
        />
        <path
          d="M317 205q9-21 26-13-1-20 20-22"
          fill="none"
          stroke="#79a161"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <g transform="translate(161 155) rotate(-15)">
          <rect x="-26" y="-26" width="52" height="52" rx="12" fill="#fbebbd" />
          {[
            [-12, -12],
            [12, -12],
            [0, 0],
            [-12, 12],
            [12, 12],
          ].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r="4" fill="#467e58" />
          ))}
        </g>
        <path
          d="M0 227q90-30 185 13H0Zm420 13q69-48 140-25v25Z"
          fill="#2f654c"
        />
      </svg>
    );
  if (kind === "chess")
    return (
      <svg viewBox="0 0 560 240" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gallery-chess-back" x2="1" y2="1">
            <stop stopColor="#34484b" />
            <stop offset="1" stopColor="#142728" />
          </linearGradient>
          <linearGradient id="gallery-chess-piece" x2="1" y2="0">
            <stop stopColor="#a9bbab" />
            <stop offset=".45" stopColor="#f4eedb" />
            <stop offset="1" stopColor="#a7b7a5" />
          </linearGradient>
        </defs>
        <path fill="url(#gallery-chess-back)" d="M0 0h560v240H0z" />
        <circle cx="281" cy="96" r="135" fill="#b1c5a3" opacity=".04" />
        <g transform="translate(68 114) skewX(-25) scale(1 .48)">
          {Array.from({ length: 32 }, (_, i) => (
            <rect
              key={i}
              x={(i % 8) * 52}
              y={Math.floor(i / 8) * 52}
              width="52"
              height="52"
              fill={(Math.floor(i / 8) + (i % 8)) % 2 ? "#6a8378" : "#b7c2ad"}
            />
          ))}
        </g>
        <ellipse
          cx="277"
          cy="205"
          rx="54"
          ry="9"
          fill="#132b2a"
          opacity=".65"
        />
        <g fill="url(#gallery-chess-piece)">
          <path d="M243 187q27-46 17-71h33q-8 28 18 71Z" />
          <rect x="247" y="106" width="57" height="12" rx="5" />
          <path d="m249 102-5-29 18 13 15-24 14 24 18-13-6 29Z" />
          <circle cx="277" cy="58" r="7" />
          <rect x="235" y="183" width="85" height="14" rx="6" />
          <rect x="228" y="196" width="98" height="12" rx="5" />
        </g>
        <g fill="#465e5a" stroke="#819489" strokeWidth="1.5">
          <path d="M381 149q12-27 9-43h22q-3 16 9 43Z" />
          <circle cx="401" cy="91" r="17" />
          <rect x="376" y="148" width="50" height="10" rx="4" />
          <rect x="372" y="157" width="58" height="8" rx="3" />
        </g>
        <path
          d="m134 64 29-14m-29 14 32 7m-32-7 8-27"
          fill="none"
          stroke="#c5d0b5"
          opacity=".35"
          strokeWidth="2"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 560 240" aria-hidden="true" focusable="false">
      <defs>
        <pattern
          id="gallery-europa-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M40 0H0v40"
            fill="none"
            stroke="#cbd2b9"
            strokeOpacity=".1"
          />
        </pattern>
      </defs>
      <path fill="#273e42" d="M0 0h560v240H0z" />
      <path fill="url(#gallery-europa-grid)" d="M0 0h560v240H0z" />
      <g stroke="#c5c5a5" strokeWidth="1.4" strokeLinejoin="round">
        <path d="m171 105 27-7 18 16-4 28-25 12-29-19Z" fill="#869c89" />
        <path d="m158 136 30 19 25-12 18 37-16 24-43-7-25-27Z" fill="#9b916c" />
        <path d="m147 172 25 24 41 8-5 30-66-2-16-21Z" fill="#ae9e76" />
        <path d="m216 114 25-21 27 8 11 43-20 21-29 15-18-37Z" fill="#758783" />
        <path d="m244 95 14-41 30-16 8 14-16 27-11 22Z" fill="#a8a68a" />
        <path
          d="m279 79 18-29 37-21 13 15-18 35-13 30-35 5-12-13Z"
          fill="#8a9f8f"
        />
        <path d="m279 114 37-4 33 23-10 30-44 9-16-28Z" fill="#b0a888" />
        <path
          d="m260 166 19-22 16 29 45-10 29 24-30 24-30-5-15 22-31-20Z"
          fill="#9b8b70"
        />
        <path d="m230 180 29-14 6 41 20 21-5 12-22-12-16-30Z" fill="#bbab82" />
        <path d="m316 110 14-31 57-17 54 26-6 37-40 28-47-21Z" fill="#8d987c" />
      </g>
      <path
        d="m205 79-19-13-6 23 8 13 9-7 5-6Z"
        fill="#b0a584"
        stroke="#d0c8a7"
      />
      <path
        d="M385 188q-28-28-66-42"
        fill="none"
        stroke="#e8ab7d"
        strokeWidth="4"
        strokeDasharray="7 5"
      />
      <path d="m323 139-16 3 10 14Z" fill="#e8ab7d" />
      {[
        [248, 127],
        [188, 173],
        [310, 187],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <rect
            x="-12"
            y="-8"
            width="24"
            height="16"
            rx="2"
            fill="#263f42"
            stroke="#e7ddba"
          />
          <path d="m-7-4 14 8m0-8-14 8" stroke="#e7ddba" />
        </g>
      ))}
      <g
        transform="translate(486 57)"
        stroke="#c5c5a5"
        fill="none"
        opacity=".65"
      >
        <circle r="22" />
        <path d="M0-30V30M-30 0H30m-10-20 40 40m0-40-40 40" />
        <path d="M0-19 5 5 0 0-5 5Z" fill="#d7d5b5" />
      </g>
    </svg>
  );
}

const games = [
  {
    id: "battle" as const,
    href: "/play",
    eyebrow: "AKSİYON · TEK OYUNCULU",
    name: "Battle Royale",
    description:
      "Paraşütle in, ekipmanını topla. Daralan alanda botlara karşı hayatta kalan son kişi ol.",
    tags: ["3D dünya", "23 bot", "Dokunmatik kontrol"],
    action: "Arenaya atla",
  },
  {
    id: "hide" as const,
    href: "/games/color-hide",
    eyebrow: "SAKLAMBAÇ · 2–5 ARKADAŞ",
    name: "Color Hide 3D",
    description:
      "Rengini çevrene uydur, gözden kaybol. Arkadaşlarınla aynı odaya gir; yakalanırsan ebe ol.",
    tags: ["Online odalar", "3 harita", "Telefon & bilgisayar"],
    action: "Odaya katıl",
  },
  {
    id: "europa" as const,
    href: "/games/europa-war",
    eyebrow: "BÜYÜK STRATEJİ · TEK OYUNCULU",
    name: "Europa War",
    description:
      "1936’da ülkenin başına geç. Ordunu, ekonomini ve diplomasini yönet; tarihin yönünü değiştir.",
    tags: ["Ülke yönetimi", "Yerel kayıt", "Dokunmatik harita"],
    action: "Ülkeni seç",
  },
  {
    id: "chess" as const,
    href: "/games/chess",
    eyebrow: "SATRANÇ · BOT & ONLINE",
    name: "Satranç Arenası",
    description:
      "Arkadaşınla karşılaş veya bota meydan oku. Eğitmenle çalış, maçtan sonra hamlelerini incele.",
    tags: ["Oda koduyla oyna", "Yapay zekâ eğitmeni", "Maç analizi"],
    action: "Tahtaya geç",
  },
];

export default function HomePage() {
  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div>
          <p className={styles.eyebrow}>
            <span /> XARMY OYUN KOLEKSİYONU
          </p>
          <h1 id="home-title">
            Bir dünya seç.
            <br />
            <span>Oyuna kendini kat.</span>
          </h1>
          <p className={styles.intro}>
            Bir sonraki hamlen, son saklanma yerin ya da yeni cephen.
            <br className={styles.desktopBreak} /> Tarayıcından aç, kendi
            tarzında oyna.
          </p>
          <a className={styles.heroAction} href="#oyunlar">
            Oyunları keşfet <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className={styles.heroNote}>
          <span className={styles.heroMark} aria-hidden="true">
            X
          </span>
          <span>
            Dört farklı deneyim.
            <br />
            <strong>Tek bir arena.</strong>
          </span>
        </div>
      </section>
      <section
        id="oyunlar"
        className={styles.collection}
        aria-labelledby="collection-title"
      >
        <div className={styles.collectionHeading}>
          <h2 id="collection-title">Oyunlar</h2>
          <span>01 — 04</span>
        </div>
        <div className={styles.grid}>
          {games.map((game) => (
            <Link
              key={game.id}
              href={game.href}
              className={`${styles.card} ${styles[game.id]}`}
            >
              <div className={styles.artwork}>
                <Artwork kind={game.id} />
                <span className={styles.artworkArrow} aria-hidden="true">
                  ↗
                </span>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.cardEyebrow}>{game.eyebrow}</p>
                <h3>{game.name}</h3>
                <p className={styles.description}>{game.description}</p>
                <ul className={styles.tags}>
                  {game.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <span className={styles.cardAction}>
                  {game.action} <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <aside className={styles.bottomNote}>
        <div>
          <strong>Arkadaşlarınla aynı arenada.</strong>
          <p>
            Satranç ve Color Hide’da oda kodunu paylaşarak birlikte
            oynayabilirsin.
          </p>
        </div>
        <Link href="/games/color-hide">
          Bir oda oluştur <span aria-hidden="true">↗</span>
        </Link>
      </aside>
    </div>
  );
}
