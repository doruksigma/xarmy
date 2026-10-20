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
import { Chessboard, type Arrow } from "react-chessboard";
import { useChessCoach } from "./use-chess-coach";
import ChessReviewPanel from "./review-panel";
import TrainerAdvice from "./trainer-advice";
import { createMateLine } from "./review-playback";
import styles from "./chess-arena.module.css";
import type { BotDifficulty, BotResponse } from "./bot";
import type { RoomView } from "@/lib/chess-room";

type GameMode = "bot" | "online" | "coach";
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
    throw new Error(
      "Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.",
    );
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
  const [mode, setMode] = useState<GameMode>("bot");
  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef(game);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("hard");
  const [preferredColor, setPreferredColor] = useState<Color>("w");
  const [botStarted, setBotStarted] = useState(false);
  const [botColor, setBotColor] = useState<Color>("w");
  const [botResigned, setBotResigned] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [matePlayback, setMatePlayback] = useState<{
    key: string;
    step: number;
  } | null>(null);
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

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    setBotThinking(false);
    if (mode === "online" || !botStarted || botResigned || game.isGameOver()) {
      workerRef.current?.terminate();
      workerRef.current = null;
      return;
    }
    if (game.turn() === botColor) return;
    const requestId = ++botRequest.current;
    let finished = false;
    let worker: Worker | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      worker?.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setBotThinking(false);
      setBotError(true);
    };
    try {
      worker =
        workerRef.current ??
        new Worker(new URL("./bot.worker.ts", import.meta.url), {
          type: "module",
        });
      workerRef.current = worker;
      setBotThinking(true);
      setBotError(false);
      worker.onmessage = ({ data }: MessageEvent<BotResponse>) => {
        if (
          finished ||
          data.requestId !== requestId ||
          activeMode.current !== mode
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
          clearTimeout(timeout);
          setBotThinking(false);
          saveGame(next);
        } catch {
          fail();
        }
      };
      worker.onerror = fail;
      const moves = game
        .history({ verbose: true })
        .map((move) => `${move.from}${move.to}${move.promotion ?? ""}`)
        .join(" ");
      worker.postMessage({
        fen: game.fen(),
        difficulty,
        requestId,
        positionCommand: `position startpos${moves ? ` moves ${moves}` : ""}`,
      });
      timeout = setTimeout(fail, 75_000);
    } catch {
      fail();
    }
    return () => {
      clearTimeout(timeout);
      if (!finished) {
        worker?.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
      finished = true;
      if (worker) worker.onmessage = null;
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
  const coach = useChessCoach({
    game,
    mode,
    active: Boolean(isActive),
    finished: Boolean(isFinished),
    playerColor,
  });
  const showReview = coach.reviewOpen;
  const selectedReview = coach.reviews.find(
    (move) => move.ply === coach.selectedPly,
  );
  const mateLine = useMemo(
    () => createMateLine(selectedReview),
    [selectedReview],
  );
  const mateStep =
    showReview && mateLine && matePlayback?.key === mateLine.key
      ? matePlayback.step
      : -1;
  const displayedGame = useMemo(() => {
    if (!showReview) return game;
    if (mateLine && mateStep >= 0)
      return new Chess(mateLine.positions[mateStep]);
    const board = new Chess();
    const count =
      coach.selectedPly < 0
        ? 0
        : coach.selectedPly + (coach.showPlayed ? 1 : 0);
    game
      .history()
      .slice(0, count)
      .forEach((move) => board.move(move));
    return board;
  }, [
    showReview,
    game,
    coach.selectedPly,
    coach.showPlayed,
    mateLine,
    mateStep,
  ]);
  const boardArrows = useMemo<Arrow[]>(() => {
    if (showReview) {
      if (mateLine && mateStep >= 0) {
        const move = mateLine.uci[mateStep];
        return move
          ? [
              {
                startSquare: move.slice(0, 2),
                endSquare: move.slice(2, 4),
                color: "#34d399",
              },
            ]
          : [];
      }
      if (coach.showPlayed || coach.selectedPly < 0) return [];
      const review = coach.reviews.find(
        (move) => move.ply === coach.selectedPly,
      );
      if (!review || review.quality === "unmeasured") return [];
      const arrows: Arrow[] = [];
      if (review.bestMove)
        arrows.push({
          startSquare: review.bestMove.slice(0, 2),
          endSquare: review.bestMove.slice(2, 4),
          color: "#34d399",
        });
      if (
        ["inaccuracy", "mistake", "blunder"].includes(review.judgment) &&
        review.bestMove !== review.playedMove
      ) {
        arrows.push({
          startSquare: review.playedMove.slice(0, 2),
          endSquare: review.playedMove.slice(2, 4),
          color: "#f87171",
        });
      }
      return arrows;
    }
    if (
      mode === "coach" &&
      isActive &&
      game.turn() === playerColor &&
      coach.advice?.bestMove &&
      coach.advice.quality !== "unmeasured"
    )
      return [
        {
          startSquare: coach.advice.bestMove.slice(0, 2),
          endSquare: coach.advice.bestMove.slice(2, 4),
          color: "#34d399",
        },
      ];
    return [];
  }, [
    showReview,
    coach.showPlayed,
    coach.selectedPly,
    coach.reviews,
    coach.advice,
    mateLine,
    mateStep,
    mode,
    isActive,
    game,
    playerColor,
  ]);
  const canMove = Boolean(
    isActive &&
      !showReview &&
      !isFinished &&
      !busy &&
      !botThinking &&
      game.turn() === playerColor &&
      (mode !== "online" || connection === "connected"),
  );
  const history = game.history();
  const lastMove = displayedGame.history({ verbose: true }).at(-1);
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
    status = `${botThinking ? "Bot düşünüyor…" : game.turn() === playerColor ? "Sıra sende" : mode !== "online" ? "Botun sırası" : "Arkadaşının sırası"}${game.isCheck() ? " · Şah!" : ""}`;

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
    if (displayedGame.isCheck())
      for (const row of displayedGame.board())
        for (const piece of row) {
          if (piece?.type === "k" && piece.color === displayedGame.turn())
            styles[piece.square] = { backgroundColor: "rgba(239,68,68,.65)" };
        }
    return styles;
  }, [game, displayedGame, selected, canMove, lastMove?.san]);

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
    workerRef.current?.terminate();
    workerRef.current = null;
    setMatePlayback(null);
    setBotColor(preferredColor);
    setBotStarted(true);
    setBotResigned(false);
    setBotError(false);
    setError("");
    setFlipped(false);
    saveGame(new Chess());
  }

  function resetToMenu() {
    workerRef.current?.terminate();
    workerRef.current = null;
    ++botRequest.current;
    sessionRef.current = null;
    setSession(null);
    setRoom(null);
    setRoomCode("");
    setBotStarted(false);
    setBotResigned(false);
    setBotThinking(false);
    setBotError(false);
    setMatePlayback(null);
    setConfirmLeave(false);
    setError("");
    setFlipped(false);
    coach.closeReview();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* Storage may be disabled. */
    }
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
      let ended: RoomView | null = null;
      try {
        ended = (await roomRequest(`/${session.code}/resign`, session, {}))
          .room;
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
      if (room.status === "playing" && ended) {
        applyRoom(ended);
        setConfirmLeave(false);
        return;
      }
    }
    resetToMenu();
  }

  function changeMode(next: GameMode) {
    if (
      busyRef.current ||
      session ||
      (mode !== "online" && botStarted && !isFinished)
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
      {showReview ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">Maç analizi</h1>
          <button
            onClick={resetToMenu}
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs font-semibold"
          >
            Analizden çık
          </button>
        </div>
      ) : (
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[.25em] text-emerald-400">
              XARMY · Satranç kulübü
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Bir hamle öne geç.
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Botla oyna, arkadaşına meydan oku veya eğitmeninle öğren.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300">
            ♟ 2 oyuncu · Sonsuz olasılık
          </span>
        </div>
      )}
      <div
        className={`${styles.layout} ${showReview ? styles.reviewLayout : ""} grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]`}
      >
        <section
          aria-label="Satranç tahtası"
          className={`${showReview ? styles.reviewBoard : ""} min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 p-3 sm:p-5 lg:sticky lg:top-20`}
        >
          {showReview ? (
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>{mateStep >= 0 ? "Mat yolu" : "Hamleyi incele"}</span>
              <button
                type="button"
                onClick={() => setFlipped((value) => !value)}
                className="rounded px-2 py-1 hover:text-white"
              >
                ↻ Tahtayı çevir
              </button>
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-xl">
                  {mode === "online" ? "♚" : "♟"}
                </span>
                <div className="font-semibold">
                  {mode === "coach"
                    ? "Yapay zekâ eğitmenin"
                    : mode === "bot"
                      ? `${difficulty === "hard" ? "Güçlü" : difficulty === "medium" ? "Orta" : "Kötü"} bot`
                      : room?.status === "waiting"
                        ? "Rakip bekleniyor"
                        : "Arkadaşın"}
                  <div className="text-xs font-normal text-slate-500">
                    {mode === "online" && room && !room.colorsDrawn
                      ? "Renkler kura ile belirlenecek"
                      : `${colorName(playerColor === "w" ? "b" : "w")} taşlar`}
                  </div>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                {botThinking && (
                  <span className="animate-pulse text-xs text-emerald-300">
                    Düşünüyor…
                  </span>
                )}
                {isActive && (
                  <button
                    className="rounded-lg border border-slate-600 px-2 py-2 text-xs"
                    onClick={() => setConfirmLeave(true)}
                  >
                    Maçı terk et
                  </button>
                )}
              </div>
            </div>
          )}
          <div
            data-testid="chess-board"
            data-fen={displayedGame.fen()}
            className={`${styles.boardFrame} overflow-hidden rounded-lg border border-slate-700 shadow-xl`}
          >
            <Chessboard
              key={showReview ? "review" : "live"}
              options={{
                id: "arena",
                position: displayedGame.fen(),
                arrows: boardArrows,
                allowDrawingArrows: !showReview,
                clearArrowsOnClick: false,
                clearArrowsOnPositionChange: true,
                boardOrientation:
                  (playerColor === "w") !== flipped ? "white" : "black",
                darkSquareStyle: { backgroundColor: "#6b8a79" },
                lightSquareStyle: { backgroundColor: "#e3e8db" },
                showAnimations: !showReview,
                animationDurationInMs: showReview ? 0 : 180,
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
                    mode !== "online" &&
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
          {!showReview && (
            <>
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-xl text-emerald-300">
                    ♔
                  </span>
                  <div className="font-semibold">
                    Sen
                    <div className="text-xs font-normal text-slate-500">
                      {mode === "online" && room && !room.colorsDrawn
                        ? "Renk kurası bekleniyor"
                        : `${colorName(playerColor)} taşlar`}
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
                {showReview
                  ? "Geçmiş konumu inceliyorsun. Sağdaki hamlelerle tahtayı geri sarabilirsin."
                  : "Taşı sürükle veya önce taşa, sonra gideceği kareye dokun."}
              </p>
              <p className="mt-2 text-center text-[10px] text-slate-500">
                Stockfish 17.1 ·{" "}
                <a
                  href="/stockfish/SOURCE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Kaynak
                </a>{" "}
                ·{" "}
                <a
                  href="/stockfish/LICENSE.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  GPLv3 lisansı
                </a>
              </p>
            </>
          )}
        </section>
        <aside
          className={`${showReview ? styles.reviewSidebar : ""} space-y-4`}
        >
          {mode === "coach" && isActive && !isFinished && (
            <TrainerAdvice
              advice={coach.advice}
              loading={coach.hintLoading}
              error={coach.hintError}
              playerTurn={game.turn() === playerColor}
              onRetry={coach.retryHint}
              canPlay={canMove}
              onPlay={() => {
                const move =
                  coach.advice?.quality === "unmeasured"
                    ? null
                    : coach.advice?.bestMove;
                if (move)
                  void makeMove(move.slice(0, 2), move.slice(2, 4), move[4]);
              }}
            />
          )}
          {!showReview && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div
                className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1"
                aria-label="Oyun modu"
              >
                {(
                  [
                    ["bot", "♟ Botla oyna"],
                    ["online", "♚ Arkadaşınla oyna"],
                    ["coach", "✦ Yapay zekâ eğitmeni"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    disabled={
                      busy ||
                      Boolean(session) ||
                      (mode !== "online" && botStarted && !isFinished)
                    }
                    onClick={() => changeMode(value)}
                    className={`${value === "coach" ? "col-span-2" : ""} rounded-lg px-2 py-3 text-xs font-semibold transition disabled:cursor-default ${mode === value ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode !== "online" ? (
                <>
                  <h2 className="font-bold">
                    {mode === "coach"
                      ? "Hamleni birlikte düşünelim."
                      : "Kendi hızında, kendi seviyende."}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {mode === "coach"
                      ? "Sıra sendeyken iyi hamleyi yeşil okla ve nedenleriyle gör. Maç sonunda hatalarını birlikte inceleyelim."
                      : "Bir seviye seç ve ilk hamleni yap. Maçın bitince tüm hamlelerini inceleyebilirsin."}
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
                    <option value="hard">Güçlü</option>
                    <option value="medium">Orta</option>
                    <option value="easy">Kötü</option>
                  </select>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {mode === "coach"
                      ? "Rakibinin seviyesini seç. Eğitmenin her seviyede en iyi hamleyi önerir."
                      : "Güçlü zorlu oynar, orta dengeli oynar, kötü daha sık hata yapar."}
                  </p>
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
                      Stockfish yüklenemedi veya yanıt veremedi.{" "}
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
                  <p
                    data-testid="color-draw"
                    className="mt-4 text-xs text-slate-400"
                  >
                    <span className={room?.colorsDrawn ? styles.dice : ""}>
                      🎲
                    </span>{" "}
                    {room?.colorsDrawn
                      ? `Kura sonucu: ${colorName(room.color)} taşlarla oynuyorsun.`
                      : "Arkadaşın katılınca renk kurası çekilecek."}{" "}
                    Odaya yalnızca iki kişi katılabilir.
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
                      ? "Oyunu terk et"
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
          )}
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
            {isFinished && !showReview && (
              <button
                className={`${secondary} mt-3 w-full`}
                onClick={resetToMenu}
              >
                Oyundan çık
              </button>
            )}
            {isFinished && history.length > 0 && !showReview && (
              <button
                className={`${primary} mt-3 w-full`}
                onClick={coach.openReview}
              >
                ✦ Maçı analiz et
              </button>
            )}
          </section>
          {showReview ? (
            <ChessReviewPanel
              moves={history}
              playerColor={playerColor}
              reviews={coach.reviews}
              selectedPly={coach.selectedPly}
              onSelectPly={(ply) => {
                setMatePlayback(null);
                coach.selectPly(ply);
              }}
              showPlayed={coach.showPlayed}
              onShowPlayed={(after) => {
                setMatePlayback(null);
                coach.setShowPlayed(after);
              }}
              progress={coach.progress}
              analyzing={coach.analyzing}
              error={coach.reviewError}
              onRetry={coach.retryReview}
              onClose={() => {
                resetToMenu();
              }}
              mateLine={
                mateLine
                  ? {
                      moves: mateLine.moves,
                      selectedStep: mateStep,
                      onStep: (step) =>
                        setMatePlayback(
                          step < 0
                            ? null
                            : {
                                key: mateLine.key,
                                step: Math.max(
                                  0,
                                  Math.min(mateLine.moves.length, step),
                                ),
                              },
                        ),
                    }
                  : null
              }
            />
          ) : (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-300">
                  Hamleler
                </h2>
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
          )}
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
