"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Chess, type Color, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { BotDifficulty, BotResponse } from "./bot";
import type { RoomView } from "@/lib/chess-room";

type Session = { code: string; token: string };
type Promotion = { from: string; to: string };
const SESSION_KEY = "xarmy-chess-room";
const button =
  "rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400";
const primary = `${button} bg-emerald-400 text-slate-950 hover:bg-emerald-300`;
const secondary = `${button} border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500`;
const colorName = (color: Color) => (color === "w" ? "Beyaz" : "Siyah");
const reasons: Record<string, string> = {
  checkmate: "Şah mat",
  stalemate: "Pat",
  threefold: "Üç konum tekrarı",
  "insufficient-material": "Yetersiz taş",
  "fifty-move": "50 hamle kuralı",
  draw: "Beraberlik",
  resignation: "Terk",
  cancelled: "Oda kapatıldı",
};

class RoomRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function roomRequest(
  path: string,
  session?: Session | null,
  body?: unknown,
) {
  let response: Response;
  try {
    response = await fetch(`/api/chess/rooms${path}`, {
      signal: AbortSignal.timeout(10000),
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new RoomRequestError(
      data?.error || "Odaya bağlanılamadı. Tekrar deneyin.",
      response.status,
    );
  if (!data?.room) throw new Error("Oda bilgisi alınamadı. Tekrar dene.");
  return data as { room: RoomView; token?: string };
}

function localResult(game: Chess) {
  if (game.isCheckmate())
    return `Şah mat · ${colorName(game.turn() === "w" ? "b" : "w")} kazandı`;
  if (game.isStalemate()) return "Beraberlik · Pat";
  if (game.isThreefoldRepetition()) return "Beraberlik · Üç konum tekrarı";
  if (game.isInsufficientMaterial()) return "Beraberlik · Yetersiz taş";
  if (game.isDrawByFiftyMoves()) return "Beraberlik · 50 hamle kuralı";
  if (game.isDraw()) return "Beraberlik";
  return null;
}

export default function ChessArena() {
  const [mode, setMode] = useState<"bot" | "online">("bot");
  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef(game);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [preferredColor, setPreferredColor] = useState<Color>("w");
  const [botStarted, setBotStarted] = useState(false);
  const [botColor, setBotColor] = useState<Color>("w");
  const [botResigned, setBotResigned] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [botError, setBotError] = useState(false);
  const [botRetry, setBotRetry] = useState(0);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "offline"
  >("connecting");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const botRequest = useRef(0);
  const activeMode = useRef(mode);
  activeMode.current = mode;

  const saveGame = useCallback((next: Chess) => {
    gameRef.current = next;
    setGame(next);
    setSelected(null);
    setPromotion(null);
  }, []);

  const applyRoom = useCallback((next: RoomView) => {
    setRoom((previous) =>
      previous?.code === next.code && previous.version > next.version
        ? previous
        : next,
    );
  }, []);

  useEffect(() => {
    if (!room) return;
    const next = new Chess();
    room.moves.forEach((move) => next.move(move));
    saveGame(next);
  }, [room?.code, room?.version, saveGame]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Session;
      if (!/^\d{6}$/.test(parsed.code) || typeof parsed.token !== "string")
        return;
      sessionRef.current = parsed;
      setSession(parsed);
      setMode("online");
    } catch {
      /* Private browsing may disable storage. */
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const { room: next } = await roomRequest(`/${session!.code}`, session);
        if (!stopped && sessionRef.current?.token === session!.token) {
          applyRoom(next);
          setConnection("connected");
        }
      } catch (err) {
        if (!stopped) {
          setConnection("offline");
          if (
            err instanceof RoomRequestError &&
            [401, 404].includes(err.status)
          ) {
            setError(err.message);
            setRoom(null);
          }
        }
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [session, applyRoom]);

  useEffect(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBotThinking(false);
    if (
      mode !== "bot" ||
      !botStarted ||
      botResigned ||
      game.isGameOver() ||
      game.turn() === botColor
    )
      return;
    const requestId = ++botRequest.current;
    let finished = false;
    const fail = () => {
      if (!finished) {
        finished = true;
        workerRef.current?.terminate();
        setBotThinking(false);
        setBotError(true);
      }
    };
    try {
      const worker = new Worker(new URL("./bot.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      setBotThinking(true);
      setBotError(false);
      worker.onmessage = ({ data }: MessageEvent<BotResponse>) => {
        if (
          finished ||
          data.requestId !== requestId ||
          activeMode.current !== "bot"
        )
          return;
        if (data.error || !data.move) {
          fail();
          return;
        }
        try {
          const next = new Chess();
          gameRef.current.history().forEach((move) => next.move(move));
          next.move({
            from: data.move.slice(0, 2),
            to: data.move.slice(2, 4),
            promotion: data.move[4],
          });
          finished = true;
          setBotThinking(false);
          saveGame(next);
        } catch {
          fail();
        }
        worker.terminate();
      };
      worker.onerror = fail;
      worker.postMessage({ fen: game.fen(), difficulty, requestId });
    } catch {
      fail();
    }
    const timeout = setTimeout(fail, 15000);
    return () => {
      finished = true;
      clearTimeout(timeout);
      workerRef.current?.terminate();
    };
  }, [
    mode,
    botStarted,
    botColor,
    botResigned,
    game,
    difficulty,
    botRetry,
    saveGame,
  ]);

  const playerColor = mode === "online" ? (room?.color ?? "w") : botColor;
  const isFinished =
    mode === "online"
      ? room?.status === "finished"
      : botResigned || game.isGameOver();
  const isActive =
    mode === "online" ? room?.status === "playing" : botStarted && !isFinished;
  const canMove = Boolean(
    isActive &&
      !isFinished &&
      !busy &&
      !botThinking &&
      game.turn() === playerColor &&
      (mode !== "online" || connection === "connected"),
  );
  const history = game.history();
  const lastMove = game.history({ verbose: true }).at(-1);
  let status = "Tahta hazır. Bir oyun başlat.";
  if (mode === "online" && session && !room) status = "Odaya bağlanılıyor…";
  else if (mode === "online" && room?.status === "waiting")
    status = "Arkadaşının odaya katılması bekleniyor…";
  else if (isFinished) {
    status =
      mode === "online" && room?.result
        ? `${room.result.winner ? `${colorName(room.result.winner)} kazandı` : "Beraberlik"} · ${reasons[room.result.reason] ?? room.result.reason}`
        : botResigned
          ? "Oyunu terk ettin · Bot kazandı"
          : (localResult(game) ?? "Oyun bitti");
  } else if (isActive)
    status = `${botThinking ? "Bot düşünüyor…" : game.turn() === playerColor ? "Sıra sende" : mode === "bot" ? "Botun sırası" : "Arkadaşının sırası"}${game.isCheck() ? " · Şah!" : ""}`;

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove)
      for (const square of [lastMove.from, lastMove.to])
        styles[square] = { backgroundColor: "rgba(250, 204, 21, .3)" };
    if (selected && canMove) {
      styles[selected] = { backgroundColor: "rgba(52, 211, 153, .65)" };
      for (const move of game.moves({
        square: selected as Square,
        verbose: true,
      })) {
        styles[move.to] = {
          background: move.captured
            ? "radial-gradient(transparent 58%, rgba(15,23,42,.35) 59%)"
            : "radial-gradient(rgba(15,23,42,.3) 22%, transparent 24%)",
        };
      }
    }
    if (game.isCheck())
      for (const row of game.board())
        for (const piece of row) {
          if (piece?.type === "k" && piece.color === game.turn())
            styles[piece.square] = { backgroundColor: "rgba(239,68,68,.65)" };
        }
    return styles;
  }, [game, selected, canMove, lastMove?.san]);

  async function makeMove(
    from: string,
    to: string,
    promoted?: string,
  ): Promise<boolean> {
    if (!canMove || busyRef.current) return false;
    const legal = game
      .moves({ square: from as Square, verbose: true })
      .filter((move) => move.to === to);
    if (!legal.length) return false;
    if (legal.some((move) => move.promotion) && !promoted) {
      setPromotion({ from, to });
      return false;
    }
    setError("");
    if (mode === "online" && session && room) {
      busyRef.current = true;
      setBusy(true);
      setSelected(null);
      setPromotion(null);
      try {
        const { room: next } = await roomRequest(
          `/${session.code}/move`,
          session,
          {
            from,
            to,
            ...(promoted ? { promotion: promoted } : {}),
            expectedVersion: room.version,
          },
        );
        if (sessionRef.current?.token === session.token) applyRoom(next);
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    }
    const next = new Chess();
    history.forEach((move) => next.move(move));
    try {
      next.move({ from, to, promotion: promoted });
      saveGame(next);
      return true;
    } catch {
      return false;
    }
  }

  function clickSquare(square: string) {
    if (!canMove || promotion) return;
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (
      selected &&
      game
        .moves({ square: selected as Square, verbose: true })
        .some((move) => move.to === square)
    ) {
      void makeMove(selected, square);
      return;
    }
    setSelected(
      game.get(square as Square)?.color === playerColor ? square : null,
    );
  }

  function startBot() {
    setBotColor(preferredColor);
    setBotStarted(true);
    setBotResigned(false);
    setBotError(false);
    setError("");
    setFlipped(false);
    saveGame(new Chess());
  }

  async function enterRoom(join: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await roomRequest(
        join ? "/join" : "",
        null,
        join ? { code: roomCode } : {},
      );
      if (!data.token) throw new Error("Oturum oluşturulamadı.");
      const next = { code: data.room.code, token: data.token };
      sessionRef.current = next;
      setMode("online");
      setSession(next);
      setRoom(data.room);
      setConnection("connected");
      setFlipped(false);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch {
        /* The live session works without persistence. */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function leaveRoom() {
    if (busyRef.current) return;
    if (session && room && room.status !== "finished") {
      busyRef.current = true;
      setBusy(true);
      try {
        await roomRequest(`/${session.code}/resign`, session, {});
      } catch (err) {
        if (
          !(err instanceof RoomRequestError && [401, 404].includes(err.status))
        ) {
          setError((err as Error).message);
          setConfirmLeave(false);
          busyRef.current = false;
          setBusy(false);
          return;
        }
      }
      busyRef.current = false;
      setBusy(false);
    }
    sessionRef.current = null;
    setSession(null);
    setRoom(null);
    setError("");
    setConfirmLeave(false);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* No stored session. */
    }
    saveGame(new Chess());
  }

  function changeMode(next: "bot" | "online") {
    if (
      busyRef.current ||
      session ||
      (mode === "bot" && botStarted && !isFinished)
    )
      return;
    setMode(next);
    setError("");
    setBotStarted(false);
    setBotResigned(false);
    setBotError(false);
    saveGame(new Chess());
  }

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[.25em] text-emerald-400">
            XARMY · Satranç kulübü
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Bir hamle öne geç.
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Botla pratik yap ya da bir oda aç, arkadaşına meydan oku.
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300">
          ♟ 2 oyuncu · Sonsuz olasılık
        </span>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-label="Satranç tahtası"
          className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 p-3 sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-xl">
                {mode === "bot" ? "♟" : "♚"}
              </span>
              <div className="font-semibold">
                {mode === "bot"
                  ? "XARMY Bot"
                  : room?.status === "waiting"
                    ? "Rakip bekleniyor"
                    : "Arkadaşın"}
                <div className="text-xs font-normal text-slate-500">
                  {colorName(playerColor === "w" ? "b" : "w")} taşlar
                </div>
              </div>
            </div>
            {botThinking && (
              <span className="animate-pulse text-xs text-emerald-300">
                Düşünüyor…
              </span>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-700 shadow-xl">
            <Chessboard
              options={{
                id: "arena",
                position: game.fen(),
                boardOrientation:
                  (playerColor === "w") !== flipped ? "white" : "black",
                darkSquareStyle: { backgroundColor: "#6b8a79" },
                lightSquareStyle: { backgroundColor: "#e3e8db" },
                animationDurationInMs: 180,
                allowDragging: canMove && !promotion,
                allowDragOffBoard: false,
                canDragPiece: ({ piece }) =>
                  canMove && piece.pieceType[0] === playerColor,
                onSquareClick: ({ square }) => clickSquare(square),
                onPieceDrop: ({ sourceSquare, targetSquare }) => {
                  if (!targetSquare || !canMove) return false;
                  const moves = game
                    .moves({ square: sourceSquare as Square, verbose: true })
                    .filter((move) => move.to === targetSquare);
                  if (moves.length) void makeMove(sourceSquare, targetSquare);
                  return (
                    mode === "bot" &&
                    moves.length > 0 &&
                    !moves.some((move) => move.promotion)
                  );
                },
                squareRenderer: ({ square, piece, children }) => (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${square}${piece ? ` ${piece.pieceType}` : " boş"}`}
                    aria-disabled={!canMove}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        clickSquare(square);
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      ...squareStyles[square],
                    }}
                    className="focus-visible:outline focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-emerald-500"
                  >
                    {children}
                  </div>
                ),
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-xl text-emerald-300">
                ♔
              </span>
              <div className="font-semibold">
                Sen
                <div className="text-xs font-normal text-slate-500">
                  {colorName(playerColor)} taşlar
                </div>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
              onClick={() => setFlipped((value) => !value)}
            >
              ↻ Tahtayı çevir
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            Taşı sürükle veya önce taşa, sonra gideceği kareye dokun.
          </p>
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div
              className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1"
              aria-label="Oyun modu"
            >
              {(
                [
                  ["bot", "♟ Botla oyna"],
                  ["online", "♚ Arkadaşınla oyna"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={
                    busy ||
                    Boolean(session) ||
                    (mode === "bot" && botStarted && !isFinished)
                  }
                  onClick={() => changeMode(value)}
                  className={`rounded-lg px-2 py-3 text-xs font-semibold transition disabled:cursor-default ${mode === value ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "bot" ? (
              <>
                <h2 className="font-bold">Kendi hızında, kendi seviyende.</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Bir seviye seç ve ilk hamleni yap.
                </p>
                <label
                  className="mb-2 mt-5 block text-xs font-semibold text-slate-300"
                  htmlFor="difficulty"
                >
                  Bot seviyesi
                </label>
                <select
                  id="difficulty"
                  disabled={botStarted && !isFinished}
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value as BotDifficulty)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm disabled:opacity-50"
                >
                  <option value="easy">Kolay · Isınma turu</option>
                  <option value="medium">Orta · Dengeli rakip</option>
                  <option value="hard">Zor · Bir adım ötesi</option>
                </select>
                <div className="mb-2 mt-4 text-xs font-semibold text-slate-300">
                  Taş rengin
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["w", "b"] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      disabled={botStarted && !isFinished}
                      onClick={() => setPreferredColor(color)}
                      aria-pressed={preferredColor === color}
                      className={`${button} border ${preferredColor === color ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-300" : "border-slate-700 text-slate-400"}`}
                    >
                      {color === "w" ? "♔" : "♚"} {colorName(color)}
                    </button>
                  ))}
                </div>
                {!botStarted || isFinished ? (
                  <button
                    className={`${primary} mt-5 w-full`}
                    onClick={startBot}
                  >
                    {botStarted ? "Yeniden oyna" : "Oyuna başla"}{" "}
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <button
                    className={`${secondary} mt-5 w-full`}
                    onClick={() => setConfirmLeave(true)}
                  >
                    Oyunu terk et
                  </button>
                )}
                {botError && (
                  <div className="mt-3 text-sm text-amber-300" role="alert">
                    Bot yanıt veremedi.{" "}
                    <button
                      className="underline"
                      onClick={() => {
                        setBotError(false);
                        setBotRetry((value) => value + 1);
                      }}
                    >
                      Tekrar dene
                    </button>
                  </div>
                )}
              </>
            ) : session ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Oyun odan</h2>
                  <span
                    className={`text-xs ${connection === "connected" ? "text-emerald-400" : "text-amber-300"}`}
                  >
                    {connection === "connected"
                      ? "● Bağlı"
                      : connection === "offline"
                        ? "● Yeniden bağlanıyor"
                        : "● Bağlanıyor"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Arkadaşın “Odaya katıl” alanına bu numarayı girsin.
                </p>
                <div className="mt-4 rounded-xl border border-dashed border-emerald-400/40 bg-emerald-400/5 p-4 text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                    Oda numarası
                  </span>
                  <div
                    data-testid="room-code"
                    className="mt-1 font-mono text-3xl font-bold tracking-[.25em] text-white"
                  >
                    {session.code}
                  </div>
                </div>
                <button
                  className={`${secondary} mt-3 w-full`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(session.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setError(
                        "Kopyalanamadı. Oda numarasını seçerek kopyalayabilirsin.",
                      );
                    }
                  }}
                >
                  {copied ? "✓ Numara kopyalandı" : "Oda numarasını kopyala"}
                </button>
                <p className="mt-4 text-xs text-slate-400">
                  {colorName(room?.color ?? "w")} taşlarla oynuyorsun. Odaya
                  yalnızca iki kişi katılabilir. Oda 24 saat geçerlidir.
                </p>
                {connection === "offline" && (
                  <p
                    role="alert"
                    className="mt-3 text-xs leading-5 text-amber-300"
                  >
                    Bağlantı kesildi veya odanın süresi doldu. Bağlantı tekrar
                    deneniyor; gerekirse odadan çıkıp yeni bir oda aç.
                  </p>
                )}
                <button
                  disabled={busy}
                  className={`${secondary} mt-4 w-full`}
                  onClick={() =>
                    room?.status === "finished" || !room
                      ? void leaveRoom()
                      : setConfirmLeave(true)
                  }
                >
                  {room?.status === "playing"
                    ? "Terk et ve odadan çık"
                    : "Odadan çık"}
                </button>
                {connection === "offline" && (
                  <button
                    className="mt-3 w-full text-xs text-slate-400 underline"
                    onClick={() => {
                      sessionRef.current = null;
                      setSession(null);
                      setRoom(null);
                      setError("");
                      setConfirmLeave(false);
                      saveGame(new Chess());
                      try {
                        sessionStorage.removeItem(SESSION_KEY);
                      } catch {
                        /* Unavailable storage. */
                      }
                    }}
                  >
                    Bağlantıyı bırak ve ana menüye dön
                  </button>
                )}
              </>
            ) : (
              <>
                <h2 className="font-bold">Aynı tahta, iki arkadaş.</h2>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Odanı oluştur, numarayı paylaş. Arkadaşın katılınca oyun
                  başlar.
                </p>
                <button
                  disabled={busy}
                  className={`${primary} mt-5 w-full`}
                  onClick={() => void enterRoom(false)}
                >
                  {busy ? "Bağlanıyor…" : "+ Oda oluştur"}
                </button>
                <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                  <div className="h-px flex-1 bg-slate-800" />
                  veya
                  <div className="h-px flex-1 bg-slate-800" />
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void enterRoom(true);
                  }}
                >
                  <label
                    htmlFor="room-code"
                    className="mb-2 block text-xs font-semibold text-slate-300"
                  >
                    Arkadaşının oda numarası
                  </label>
                  <input
                    id="room-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="6 haneli numara"
                    value={roomCode}
                    onChange={(event) =>
                      setRoomCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-center tracking-widest placeholder:text-xs placeholder:tracking-normal focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || roomCode.length !== 6}
                    className={`${secondary} mt-3 w-full`}
                  >
                    Odaya katıl →
                  </button>
                </form>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs leading-5 text-red-300"
              >
                {error}
              </p>
            )}
          </section>
          <section
            className={`rounded-2xl border p-4 ${isFinished ? "border-emerald-400/40 bg-emerald-400/10" : "border-slate-800 bg-slate-900/40"}`}
            aria-live="polite"
          >
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Oyun durumu
            </div>
            <p data-testid="game-status" className="text-sm font-semibold">
              {status}
            </p>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-300">Hamleler</h2>
              <span className="text-xs text-slate-500">
                {history.length} yarım hamle
              </span>
            </div>
            <div
              className="max-h-52 overflow-y-auto"
              data-testid="move-history"
            >
              {history.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th>Hamle</th>
                      <th>Beyaz</th>
                      <th>Siyah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      { length: Math.ceil(history.length / 2) },
                      (_, index) => (
                        <tr
                          key={index}
                          className={index % 2 ? "bg-slate-800/40" : ""}
                        >
                          <td className="w-10 rounded-l px-2 py-1.5 font-mono text-xs text-slate-500">
                            {index + 1}.
                          </td>
                          <td className="px-2 py-1.5 font-mono text-slate-200">
                            {history[index * 2]}
                          </td>
                          <td className="rounded-r px-2 py-1.5 font-mono text-slate-200">
                            {history[index * 2 + 1] ?? "—"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              ) : (
                <p className="py-3 text-center text-xs text-slate-500">
                  İlk hamleyle hikâye başlar.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      {promotion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6"
          >
            <h2 id="promotion-title" className="text-lg font-bold">
              Piyonunu terfi ettir
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Hangi taşı seçiyorsun?
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {(
                [
                  ["q", "♛ Vezir"],
                  ["r", "♜ Kale"],
                  ["b", "♝ Fil"],
                  ["n", "♞ At"],
                ] as const
              ).map(([piece, label], index) => (
                <button
                  autoFocus={index === 0}
                  key={piece}
                  className={secondary}
                  onClick={() =>
                    void makeMove(promotion.from, promotion.to, piece)
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="mt-4 w-full text-sm text-slate-400"
              onClick={() => setPromotion(null)}
            >
              Vazgeç
            </button>
          </section>
        </div>
      )}
      {confirmLeave && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6"
          >
            <h2 id="leave-title" className="text-lg font-bold">
              {room?.status === "waiting"
                ? "Oda kapatılsın mı?"
                : "Oyunu terk etmek istiyor musun?"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {room?.status === "waiting"
                ? "Yeni bir oda oluşturup tekrar davet edebilirsin."
                : "Terk edersen rakibin kazanır."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                autoFocus
                className={`${secondary} flex-1`}
                onClick={() => setConfirmLeave(false)}
              >
                Devam et
              </button>
              <button
                disabled={busy}
                className={`${button} flex-1 bg-red-400 text-slate-950 hover:bg-red-300`}
                onClick={() => {
                  if (mode === "online") void leaveRoom();
                  else {
                    setBotResigned(true);
                    setConfirmLeave(false);
                    setSelected(null);
                  }
                }}
              >
                {busy ? "Çıkılıyor…" : "Evet, çık"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
