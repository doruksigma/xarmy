This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Chess

Open `/games/chess` to play against the local bot or create a room and share its
six-digit code with a friend. When the friend joins, the server draws the colors
once; either player can receive white. The saved draw survives refreshes, and
both browsers receive the same server-validated board. Existing games keep their
original colors. No external
chess API key or signaling service is required. Each room lasts 24 hours; the
browser keeps its private player token so refreshing can resume the game.

Online rooms use a shared Redis REST store when an Upstash or Vercel KV REST
connection is configured. This supports Vercel's independent serverless
instances. Atomic Redis transactions reject simultaneous stale moves and allow
exactly one guest to join; room keys expire at the original 24-hour deadline.
The local bot works without Redis.

### Chess coach

Choose **Yapay zekâ eğitmeni** to play against the bot with a live recommendation
on your turn. The green arrow shows the suggested move, and the coach explains
the concrete idea in Turkish. You can play the suggestion or choose another move.

After a bot, training, or online game ends, the coach automatically reviews its
move history. Use the move list and previous/next controls to replay positions;
**Hamleden önce** shows the recommendation in green and mistakes in red, while
**Hamleden sonra** shows the move as played. Each reviewed move includes its
classification, an explanation, and the reason for the suggested alternative.
Resigning also preserves the finished game for review before leaving the room.

Hints are available during training only. Normal bot and online games reveal
their analysis after the game ends. Bots, training recommendations, and game
reviews run **Stockfish 17.1 lite NNUE** in a browser WebAssembly worker, so no
Gemini or Lichess credentials are required. The single-threaded engine needs no
SharedArrayBuffer or cross-origin isolation. Reviews arrive progressively while
the UI remains usable. Search depth and evaluation are measured by Stockfish;
device speed and the allotted thinking time still limit how deeply it searches.
Choose **Güçlü**, **Orta**, or **Kötü** for different opponent behavior, including
in training. Kötü chooses random legal moves and misses tactics; Orta mixes
shallow searches with imperfect choices. Güçlü uses deep Stockfish search and a
varied repertoire of established openings. Recommendations and reviews use full
analysis strength, independently of the opponent's level. Reviews compare the
best and played moves from the same position and history at equal completed
depth; insufficient searches remain unmeasured. The interface gives short,
concrete reasons instead of scores or engine statistics. **Matı göster** replays
a verified mating continuation on the board. Both players can select their own,
white's, or black's lessons. Replay uses instant position changes and a bounded
layout to keep the board visible while scrolling through explanations. Training
can suggest a different good move after verifying its quality against the best
move at the same depth. **Başka iyi hamle göster** requests another option;
forced mates and positions with only one sound defense keep their best move.
**Maçı terk et** resigns the running game for review. **Analizden çık** clears
the finished game and stored room session so a new game starts with a clean board.

### Stockfish assets and license

`npm ci` installs Stockfish 17.1.0 from the existing lockfile. Both `npm run dev`
and `npm run build` automatically run `npm run prepare:stockfish`, copying the
matching lite single-threaded JavaScript and WASM files into the ignored
`public/stockfish/engine/` directory. Vercel therefore prepares the engine during
its normal build; no manual file upload or additional service is needed. If
running Next.js directly instead of the npm scripts, prepare these assets first.

Stockfish is distributed under GPLv3. The full license and exact corresponding
source links are served at `/stockfish/LICENSE.txt` and `/stockfish/SOURCE.md`;
the latter records the upstream release commit and build instructions. The
copied distribution retains its original license header and author list.

### Vercel setup

1. Open the **xarmy** project in Vercel, then **Storage → Connect Database**
   (or **Marketplace → Upstash Redis**) and connect an Upstash Redis database.
2. Make the connection available to **Production** and any **Preview** environments
   where online rooms should work. The server accepts either complete pair:
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or
   `KV_REST_API_URL` + `KV_REST_API_TOKEN`. The URL must be the HTTPS **REST**
   endpoint, and the token must allow writes and `EVAL`; a Redis TCP URL or
   read-only token does not work. Keep these server-side; never use `NEXT_PUBLIC_`
   for either value or commit values to the repository.
3. Deploy the updated `main` branch, or **Redeploy** after adding/changing the
   environment variables. Previously built deployments do not acquire new values.
4. Visit `/games/chess`, create an online room, and join its six-digit code in
   another browser. Check that each player's move reaches the other board.

When deployed on Vercel without a complete Redis connection, online room endpoints
return HTTP 503 with an unavailable message. The bot remains available. Storage
configuration requirements appear in server logs without secret values.

### Local or self-hosted development

With no Redis variables configured, rooms use a writable directory on the local
Node.js host. Run `npm run build` followed by `npm start`, and optionally set
`XARMY_CHESS_ROOM_DIR` to an application-owned persistent directory to retain
rooms across server restarts. The default is the operating system's temporary
directory. Multiple local Node processes must use the same directory on one
host; independent replicas should use Redis instead. Apply request rate limits at
the reverse proxy before exposing room creation to untrusted public traffic.

The room API is:

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/chess/rooms` | Empty | `{ room, token }` (host; colors pending) |
| `POST /api/chess/rooms/join` | `{ "code": "123456" }` | `{ room, token }` (guest; colors drawn) |
| `GET /api/chess/rooms/:code` | Bearer token | `{ room }` |
| `POST /api/chess/rooms/:code/move` | Bearer token and `{ "from": "e2", "to": "e4", "expectedVersion": 2 }` | `{ room }` |
| `POST /api/chess/rooms/:code/resign` | Bearer token | `{ room }` |

Send JSON bodies with `Content-Type: application/json`, and player credentials
only as `Authorization: Bearer <token>`. A promotion move also supplies
`"promotion": "q"`, `"r"`, `"b"`, or `"n"`. Use the latest room `version` as
`expectedVersion` to reject stale moves. Resigning before a guest joins cancels
the room. State responses never expose either player's token or credential hash.

Run the backend rule, authorization, race, and HTTP-helper regression tests from
the repository root (Node.js 24):

```bash
npm run test:chess
npm exec tsc -- --noEmit --incremental false
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

Use `npm run build` and `npm start` on a Node.js 24 host, or deploy the Next.js
project to Vercel. Vercel online chess rooms require the Redis REST connection
and redeployment described above. The bot does not require external services.
