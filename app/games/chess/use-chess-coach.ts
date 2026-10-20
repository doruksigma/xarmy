"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chess, Color } from "chess.js";
import type { CoachResponse, MoveReview, PositionAdvice } from "./coach";

export type ReviewedMove = MoveReview & { ply: number };

export function useChessCoach({
  game,
  mode,
  active,
  finished,
  playerColor,
}: {
  game: Chess;
  mode: "bot" | "online" | "coach";
  active: boolean;
  finished: boolean;
  playerColor: Color;
}) {
  const fen = game.fen();
  const movesKey = game.history().join(" ");
  const playerTurn = game.turn() === playerColor;
  const [advice, setAdvice] = useState<PositionAdvice | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintRetry, setHintRetry] = useState(0);
  const [reviews, setReviews] = useState<ReviewedMove[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRetry, setReviewRetry] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedPly, setSelectedPly] = useState(-1);
  const [showPlayed, setShowPlayed] = useState(false);
  const requestCounter = useRef(0);
  const hintWorker = useRef<Worker | null>(null);
  const lastHint = useRef<PositionAdvice | null>(null);
  const manuallySelected = useRef(false);

  useEffect(
    () => () => {
      hintWorker.current?.terminate();
      hintWorker.current = null;
    },
    [],
  );

  useEffect(() => {
    setAdvice(null);
    setHintError(null);
    setHintLoading(false);
    if (mode !== "coach" || !active || finished) {
      hintWorker.current?.terminate();
      hintWorker.current = null;
      return;
    }
    if (!playerTurn) return;
    let alive = true;
    let completed = false;
    let worker: Worker | null = null;
    const requestId = ++requestCounter.current;
    const fail = () => {
      if (!alive) return;
      alive = false;
      worker?.terminate();
      if (hintWorker.current === worker) hintWorker.current = null;
      setHintLoading(false);
      setHintError(
        "Stockfish önerisi hazırlanamadı. Güvenilir bir ölçüm için yeniden deneyebilir veya hamleni yapabilirsin.",
      );
    };
    const timeout = setTimeout(fail, 75_000);
    setHintLoading(true);
    try {
      worker =
        hintWorker.current ??
        new Worker(new URL("./coach.worker.ts", import.meta.url), {
          type: "module",
        });
      hintWorker.current = worker;
      worker.onmessage = ({ data }: MessageEvent<CoachResponse>) => {
        if (!alive || data.requestId !== requestId) return;
        if (data.kind === "error") {
          fail();
          return;
        }
        if (data.kind !== "hint") return;
        completed = true;
        alive = false;
        clearTimeout(timeout);
        setAdvice(data.advice);
        lastHint.current = data.advice;
        setHintLoading(false);
      };
      worker.onerror = fail;
      worker.postMessage({
        kind: "hint",
        requestId,
        fen,
        moves: movesKey ? movesKey.split(" ") : [],
        excludeMove:
          hintRetry > 0 && lastHint.current?.fen === fen
            ? (lastHint.current.bestMove ?? undefined)
            : undefined,
      });
    } catch {
      fail();
    }
    return () => {
      alive = false;
      clearTimeout(timeout);
      if (!completed) {
        worker?.terminate();
        if (hintWorker.current === worker) hintWorker.current = null;
      }
      if (worker) worker.onmessage = null;
    };
  }, [mode, active, finished, playerTurn, fen, movesKey, hintRetry]);

  useEffect(() => {
    setReviews([]);
    setReviewError(null);
    setShowPlayed(false);
    manuallySelected.current = false;
    const moves = movesKey ? movesKey.split(" ") : [];
    setProgress({ completed: 0, total: moves.length });
    if (!finished || moves.length === 0) {
      setReviewOpen(false);
      setAnalyzing(false);
      setSelectedPly(-1);
      return;
    }
    setReviewOpen(true);
    setSelectedPly(playerColor === "b" && moves.length > 1 ? 1 : 0);
    setAnalyzing(true);
    let alive = true;
    let worker: Worker | undefined;
    let watchdog: ReturnType<typeof setTimeout>;
    const accumulated: ReviewedMove[] = [];
    const requestId = ++requestCounter.current;
    const fail = () => {
      if (!alive) return;
      alive = false;
      clearTimeout(watchdog);
      worker?.terminate();
      setAnalyzing(false);
      setReviewError(
        "Analiz tamamlanamadı. Tahtayı incelemeye devam edebilir veya yeniden deneyebilirsin.",
      );
    };
    const watch = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(fail, accumulated.length === 0 ? 90_000 : 45_000);
    };
    watch();
    try {
      worker = new Worker(new URL("./coach.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }: MessageEvent<CoachResponse>) => {
        if (!alive || data.requestId !== requestId) return;
        if (data.kind === "error") {
          fail();
          return;
        }
        if (data.kind === "progress") {
          watch();
          accumulated.push(data.review);
          setReviews([...accumulated]);
          setProgress({ completed: data.completed, total: data.total });
        }
        if (data.kind === "complete") {
          alive = false;
          clearTimeout(watchdog);
          setAnalyzing(false);
          if (!manuallySelected.current) {
            const own = accumulated.filter(
              (move) => move.ply % 2 === (playerColor === "w" ? 0 : 1),
            );
            const severity = {
              unmeasured: -1,
              best: 0,
              good: 1,
              inaccuracy: 2,
              mistake: 3,
              blunder: 4,
            };
            const largestLesson = own.reduce<ReviewedMove | null>(
              (best, move) => {
                if (!best) return move;
                const difference =
                  severity[move.judgment] - severity[best.judgment];
                return difference > 0 ||
                  (difference === 0 && (move.lossCp ?? 0) > (best.lossCp ?? 0))
                  ? move
                  : best;
              },
              null,
            );
            if (largestLesson) setSelectedPly(largestLesson.ply);
          }
          worker?.terminate();
        }
      };
      worker.onerror = fail;
      worker.postMessage({ kind: "review", requestId, moves });
    } catch {
      fail();
    }
    return () => {
      alive = false;
      clearTimeout(watchdog);
      worker?.terminate();
    };
  }, [finished, movesKey, playerColor, reviewRetry]);

  const selectPly = useCallback((ply: number) => {
    manuallySelected.current = true;
    setSelectedPly(ply);
    setShowPlayed(false);
  }, []);

  return {
    advice: advice?.fen === fen ? advice : null,
    hintLoading,
    hintError,
    retryHint: () => setHintRetry((value) => value + 1),
    reviews,
    progress,
    analyzing,
    reviewError,
    selectedPly,
    selectPly,
    showPlayed,
    setShowPlayed: (value: boolean) => {
      manuallySelected.current = true;
      setShowPlayed(value);
    },
    reviewOpen: finished && reviewOpen,
    openReview: () => {
      if (finished) setReviewOpen(true);
    },
    closeReview: () => setReviewOpen(false),
    retryReview: () => setReviewRetry((value) => value + 1),
  };
}
