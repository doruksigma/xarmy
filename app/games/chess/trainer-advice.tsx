"use client";

import { useMemo } from "react";
import { Chess } from "chess.js";
import type { PositionAdvice } from "./coach";

function matingLine(advice: PositionAdvice | null): string[] {
  if (!advice || advice.quality === "unmeasured" || advice.scoreMate === null)
    return [];
  try {
    const game = new Chess(advice.fen);
    const moves = advice.pv.map(
      (move) =>
        game.move({
          from: move.slice(0, 2),
          to: move.slice(2, 4),
          promotion: move[4],
        }).san,
    );
    return game.isCheckmate() ? moves : [];
  } catch {
    return [];
  }
}

export default function TrainerAdvice({
  advice,
  loading,
  error,
  playerTurn,
  canPlay,
  onPlay,
  onRetry,
}: {
  advice: PositionAdvice | null;
  loading: boolean;
  error: string | null;
  playerTurn: boolean;
  canPlay: boolean;
  onPlay: () => void;
  onRetry: () => void;
}) {
  const mateMoves = useMemo(() => matingLine(advice), [advice]);
  return (
    <section
      data-testid="trainer-advice"
      className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5"
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-emerald-300">
          ✦ Eğitmeninin önerisi
        </h2>
        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
          Öğrenme modu
        </span>
      </div>
      {!playerTurn ? (
        <p className="text-sm leading-6 text-slate-300">
          Eğitmenin düşünüyor. Sıra sana gelince önerini göstereceğim.
        </p>
      ) : loading ? (
        <p className="animate-pulse text-sm leading-6 text-slate-300">
          En iyi hamleyi ve nedenini inceliyorum…
        </p>
      ) : error ? (
        <div role="alert">
          <p className="text-sm leading-6 text-amber-300">{error}</p>
          <button
            onClick={onRetry}
            className="mt-2 rounded-lg py-2 text-xs font-semibold text-emerald-300 underline"
          >
            Öneriyi tekrar hazırla
          </button>
        </div>
      ) : advice?.quality === "unmeasured" ? (
        <div role="status">
          <p className="text-sm leading-6 text-amber-300">
            Bu konum için henüz net bir öneri yok. Tekrar deneyebilirsin.
          </p>
          <button
            onClick={onRetry}
            className="mt-2 text-sm text-emerald-300 underline"
          >
            Öneriyi yeniden hazırla
          </button>
        </div>
      ) : advice?.bestMove ? (
        <>
          <div className="my-3 rounded-xl border border-emerald-400/20 bg-slate-950/50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Önerilen hamle
            </div>
            <p
              data-testid="trainer-best-move"
              className="mt-1 font-mono text-2xl font-bold text-emerald-300"
            >
              {advice.bestSan}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {advice.bestMove.slice(0, 2)} → {advice.bestMove.slice(2, 4)} ·
              Tahtadaki yeşil ok
            </p>
          </div>
          <p
            data-testid="trainer-explanation"
            className="text-sm leading-6 text-slate-200"
          >
            {advice.explanation}
          </p>
          {mateMoves.length > 0 && (
            <div
              className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/5 p-3"
              data-testid="trainer-mate-line"
            >
              <p className="text-xs font-semibold text-amber-200">
                {advice.scoreMate! > 0 ? "Mat fırsatı" : "Rakibin mat tehdidi"}
              </p>
              <p className="mt-1 max-h-20 overflow-y-auto break-words font-mono text-xs leading-5 text-amber-100">
                {mateMoves.join(" → ")}
              </p>
            </div>
          )}
          <button
            disabled={!canPlay}
            onClick={onPlay}
            className="mt-4 w-full rounded-xl bg-emerald-400 px-3 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Önerilen hamleyi oyna
          </button>
          <button
            disabled={!canPlay}
            onClick={onRetry}
            className="mt-2 w-full rounded-lg py-2 text-xs text-emerald-300 underline disabled:opacity-40"
          >
            Başka iyi hamle göster
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Başka bir hamle de seçebilirsin; maç sonunda birlikte inceleriz.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-400">Hamle önerisi hazırlanıyor…</p>
      )}
    </section>
  );
}
