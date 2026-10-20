"use client";

import { useMemo, useState } from "react";
import type { MoveReview } from "./coach";

export type ChessReviewPanelProps = {
  moves: string[];
  playerColor: "w" | "b";
  reviews: Array<MoveReview & { ply: number }>;
  selectedPly: number;
  onSelectPly: (ply: number) => void;
  showPlayed: boolean;
  onShowPlayed: (show: boolean) => void;
  progress: { completed: number; total: number };
  analyzing: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  mateLine?: {
    /** SAN moves from the reviewed position to the verified mating position. */
    moves: string[];
    /** -1: normal review; 0: line start; n: n continuation plies played. */
    selectedStep: number;
    onStep: (step: number) => void;
  } | null;
};

const judgments = {
  unmeasured: {
    label: "Henüz değerlendirilemedi",
    short: "Bekliyor",
    symbol: "…",
    color: "border-slate-600 bg-slate-800/50 text-slate-400",
  },
  best: {
    label: "En iyi hamle",
    short: "En iyi",
    symbol: "★",
    color: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  good: {
    label: "İyi hamle",
    short: "İyi",
    symbol: "✓",
    color: "border-teal-400/30 bg-teal-400/10 text-teal-300",
  },
  inaccuracy: {
    label: "Daha iyisi vardı",
    short: "Eksik",
    symbol: "?!",
    color: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  mistake: {
    label: "Hata",
    short: "Hata",
    symbol: "?",
    color: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  },
  blunder: {
    label: "Büyük hata",
    short: "Büyük hata",
    symbol: "??",
    color: "border-red-400/30 bg-red-400/10 text-red-300",
  },
} as const;

const control =
  "rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

export default function ChessReviewPanel({
  moves,
  playerColor,
  reviews,
  selectedPly,
  onSelectPly,
  showPlayed,
  onShowPlayed,
  progress,
  analyzing,
  error,
  onRetry,
  onClose,
  mateLine,
}: ChessReviewPanelProps) {
  const byPly = useMemo(
    () => new Map(reviews.map((review) => [review.ply, review])),
    [reviews],
  );
  const [perspective, setPerspective] = useState<"mine" | "w" | "b">("mine");
  const reviewColor = perspective === "mine" ? playerColor : perspective;
  const colorName = reviewColor === "w" ? "Beyaz" : "Siyah";
  const playerColorName = playerColor === "w" ? "Beyaz" : "Siyah";
  const selectedReview = byPly.get(selectedPly);
  const ownSelected = (selectedPly % 2 === 0 ? "w" : "b") === playerColor;
  const judgment = selectedReview ? judgments[selectedReview.judgment] : null;
  const measured = selectedReview && selectedReview.quality !== "unmeasured";
  const hasBetterMove = Boolean(
    selectedReview && selectedReview.bestMove !== selectedReview.playedMove,
  );
  const isError = Boolean(
    selectedReview &&
      ["inaccuracy", "mistake", "blunder"].includes(selectedReview.judgment),
  );
  const completed = Math.min(progress.total, Math.max(0, progress.completed));
  const percent = progress.total > 0 ? (completed / progress.total) * 100 : 0;

  function selectPerspective(value: "mine" | "w" | "b") {
    setPerspective(value);
    const color = value === "mine" ? playerColor : value;
    if (selectedPly >= 0 && (selectedPly % 2 === 0 ? "w" : "b") !== color) {
      const firstPly = moves.findIndex(
        (_, ply) => (ply % 2 === 0 ? "w" : "b") === color,
      );
      if (firstPly >= 0) {
        onSelectPly(firstPly);
        onShowPlayed(false);
      }
    }
  }

  return (
    <section
      aria-labelledby="chess-review-title"
      className="min-w-0 space-y-4 rounded-2xl border border-emerald-400/30 bg-slate-900/70 p-4 sm:p-5 [overflow-anchor:none]"
      data-testid="chess-review-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Maç sonrası
          </p>
          <h2
            id="chess-review-title"
            className="mt-1 text-lg font-bold text-white"
          >
            Satranç hocan
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label="Maç analizini kapat ve son konuma dön"
        >
          Kapat ×
        </button>
      </div>

      <p className="text-xs leading-5 text-slate-400">
        Sen {playerColorName.toLocaleLowerCase("tr-TR")} taşlarla oynadın. İki
        tarafın hamlelerini de inceleyebilirsin.
      </p>

      {(analyzing || progress.total > 0) && (
        <div>
          <div className="mb-2 flex justify-between gap-2 text-xs text-slate-400">
            <span role="status">
              {analyzing
                ? "Hamleler inceleniyor…"
                : error
                  ? "Analiz durakladı"
                  : "Analiz tamamlandı"}
            </span>
            <span className="font-mono">
              {completed}/{progress.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Maç analizinin ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, progress.total)}
            aria-valuenow={completed}
            className="h-1.5 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-200"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={analyzing}
            className="mt-2 rounded font-semibold underline underline-offset-4 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
          >
            Analizi tekrar dene
          </button>
        </div>
      )}

      <div>
        <div
          className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-950/70 p-1"
          role="group"
          aria-label="Analiz edilecek oyuncu"
        >
          {([
            ["mine", "Benim hamlelerim"],
            ["w", "Beyaz"],
            ["b", "Siyah"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={perspective === value}
              onClick={() => selectPerspective(value)}
              className={`rounded-md px-2 py-2 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${perspective === value ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs text-slate-400" aria-live="polite">
          {colorName}
          {reviewColor === playerColor
            ? " · Senin hamlelerin"
            : " · Rakibinin hamleleri"}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            className={control}
            onClick={() => onSelectPly(-1)}
            disabled={selectedPly < 0}
            aria-label="Başlangıç konumuna dön"
            title="Başlangıç konumu"
          >
            ⏮
          </button>
          <button
            type="button"
            className={`${control} flex-1`}
            onClick={() => onSelectPly(selectedPly - 1)}
            disabled={selectedPly < 0}
            aria-label="Önceki hamleyi incele"
          >
            ← Önceki
          </button>
          <button
            type="button"
            className={`${control} flex-1`}
            onClick={() => onSelectPly(selectedPly + 1)}
            disabled={selectedPly >= moves.length - 1}
            aria-label="Sonraki hamleyi incele"
          >
            Sonraki →
          </button>
          <button
            type="button"
            className={control}
            onClick={() => onSelectPly(moves.length - 1)}
            disabled={!moves.length || selectedPly >= moves.length - 1}
            aria-label="Son hamleyi incele"
            title="Son hamle"
          >
            ⏭
          </button>
        </div>
        <p
          className="mt-3 text-center text-xs text-slate-400"
          aria-live="polite"
        >
          {selectedPly < 0
            ? "Başlangıç konumu"
            : `${Math.floor(selectedPly / 2) + 1}. hamle · ${selectedPly % 2 === 0 ? "Beyaz" : "Siyah"} · ${ownSelected ? "Sen" : "Rakibin"}`}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-900 p-1">
          {(
            [
              [false, "Hamleden önce"],
              [true, "Hamleden sonra"],
            ] as const
          ).map(([after, label]) => (
            <button
              key={String(after)}
              type="button"
              disabled={selectedPly < 0}
              aria-pressed={showPlayed === after}
              onClick={() => onShowPlayed(after)}
              className={`rounded-md px-2 py-2 text-xs transition disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${showPlayed === after ? "bg-slate-700 font-semibold text-white" : "text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selectedPly < 0 ? (
        <p className="min-h-64 rounded-xl border border-slate-800 p-3 text-xs leading-5 text-slate-400">
          Aşağıdan bir hamle seç veya sonraki hamleye ilerle.
        </p>
      ) : selectedReview && judgment ? (
        <div className="min-h-64 space-y-3 break-words" data-testid="move-review">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">
              {ownSelected ? "Senin hamlen" : "Rakibinin hamlesi"}{" "}
              <span className="ml-1 font-mono font-bold text-white">
                {selectedReview.playedSan}
              </span>
            </p>
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${judgment.color}`}
              data-testid="review-judgment"
            >
              {judgment.symbol} {judgment.label}
            </span>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-200">
              {!measured
                ? "Analiz henüz net değil"
                : isError
                  ? "Neden hatalı?"
                  : "Neden iyi?"}
            </h3>
            <p
              className="text-sm leading-6 text-slate-300"
              data-testid="review-explanation"
            >
              {selectedReview.explanation}
            </p>
          </div>
          {measured && selectedReview.bestSan && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
              <h3 className="text-xs font-bold text-emerald-300">
                {hasBetterMove
                  ? isError
                    ? "Daha iyi hamle"
                    : "Başka bir seçenek"
                  : "Bu hamleyi neden oynamalısın?"}
                {" · "}
                <span className="font-mono">{selectedReview.bestSan}</span>
              </h3>
              <p
                className="mt-2 text-xs leading-5 text-slate-300"
                data-testid="review-better-explanation"
              >
                {selectedReview.betterExplanation}
              </p>
            </div>
          )}
          {measured && mateLine && mateLine.moves.length > 0 && (
            <div
              className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3"
              data-testid="review-mate-line"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-amber-200">Mat devamı</h3>
                {mateLine.selectedStep < 0 ? (
                  <button
                    type="button"
                    onClick={() => mateLine.onStep(1)}
                    className="rounded-lg bg-amber-200 px-3 py-2 text-xs font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                  >
                    Matı göster
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => mateLine.onStep(-1)}
                    className="min-h-8 rounded px-2 text-xs text-amber-200 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
                  >
                    Maç analizine dön
                  </button>
                )}
              </div>
              <div
                className="flex max-h-24 flex-wrap items-center gap-1 overflow-y-auto"
                aria-label="Mat devamındaki hamleler"
              >
                {mateLine.moves.map((move, index) => (
                  <button
                    key={`${index}-${move}`}
                    type="button"
                    onClick={() => mateLine.onStep(index + 1)}
                    aria-current={
                      mateLine.selectedStep === index + 1 ? "step" : undefined
                    }
                    aria-label={`Mat devamı ${index + 1}. hamle: ${move}`}
                    className={`rounded px-2 py-1 font-mono text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 ${mateLine.selectedStep === index + 1 ? "bg-amber-200 font-bold text-slate-950" : "bg-slate-900 text-amber-100 hover:bg-slate-700"}`}
                  >
                    {move}
                  </button>
                ))}
              </div>
              <div className="min-h-9">
                {mateLine.selectedStep >= 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => mateLine.onStep(mateLine.selectedStep - 1)}
                      disabled={mateLine.selectedStep === 0}
                      className={`${control} flex-1`}
                      aria-label="Mat devamında önceki hamle"
                    >
                      ← Önceki
                    </button>
                    <span className="text-[11px] text-amber-100" aria-live="polite">
                      {mateLine.selectedStep === mateLine.moves.length
                        ? "Şah mat"
                        : `${mateLine.selectedStep}/${mateLine.moves.length}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => mateLine.onStep(mateLine.selectedStep + 1)}
                      disabled={mateLine.selectedStep === mateLine.moves.length}
                      className={`${control} flex-1`}
                      aria-label="Mat devamında sonraki hamle"
                    >
                      Sonraki →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {!measured || (mateLine && mateLine.selectedStep >= 0) ? null : showPlayed ? (
            <button
              type="button"
              onClick={() => onShowPlayed(false)}
              className="rounded text-left text-xs leading-5 text-emerald-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              Öneriyi okla görmek için hamleden önceye dön.
            </button>
          ) : (
            <div
              className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400"
              aria-label="Tahtadaki okların açıklaması"
            >
              <span>
                <span aria-hidden="true" className="font-bold text-emerald-400">
                  ↗
                </span>{" "}
                Yeşil: önerilen hamle
              </span>
              {isError && hasBetterMove && (
                <span>
                  <span aria-hidden="true" className="font-bold text-red-400">
                    ↗
                  </span>{" "}
                  Kırmızı: oynanan hamle
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className="min-h-64 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs leading-5 text-slate-400"
          role="status"
        >
          <p className="font-semibold text-slate-300">
            {ownSelected ? "Senin hamlen" : "Rakibinin hamlesi"}:{" "}
            {moves[selectedPly]}
          </p>
          <p className="mt-1">
            {analyzing
              ? "Bu hamle inceleniyor…"
              : error
                ? "Bu hamle incelenemedi. Tekrar deneyebilirsin."
                : "Bu hamle için analiz bekleniyor."}
          </p>
        </div>
      )}

      <div className="border-t border-slate-800 pt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <h3 className="font-semibold text-slate-300">Hamleye dön</h3>
          <span>İki tarafı da inceleyebilirsin</span>
        </div>
        <div
          className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-slate-800"
          data-testid="review-move-list"
        >
          {moves.length ? (
            <table className="w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 bg-slate-950 text-[10px] text-slate-500">
                <tr>
                  <th className="w-9 px-2 py-2">
                    <span className="sr-only">Hamle numarası</span>
                  </th>
                  <th className="px-1 py-2">
                    Beyaz {playerColor === "w" && "· Sen"}
                  </th>
                  <th className="px-1 py-2">
                    Siyah {playerColor === "b" && "· Sen"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: Math.ceil(moves.length / 2) },
                  (_, row) => (
                    <tr key={row} className={row % 2 ? "bg-slate-800/20" : ""}>
                      <th
                        scope="row"
                        className="px-2 py-1 font-mono font-normal text-slate-500"
                      >
                        {row + 1}.
                      </th>
                      {[0, 1].map((side) => {
                        const ply = row * 2 + side;
                        if (ply >= moves.length) return <td key={side} />;
                        const review = byPly.get(ply);
                        const badge = review
                          ? judgments[review.judgment]
                          : null;
                        const own = (side === 0 ? "w" : "b") === playerColor;
                        const active = selectedPly === ply;
                        return (
                          <td key={side} className="p-1">
                            <button
                              type="button"
                              aria-current={active ? "step" : undefined}
                              aria-label={`${row + 1}. ${side === 0 ? "Beyaz" : "Siyah"}: ${moves[ply]}${own ? ", senin hamlen" : ""}, ${badge?.label ?? "analiz bekleniyor"}`}
                              onClick={() => onSelectPly(ply)}
                              className={`flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-2 font-mono transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${active ? "border-emerald-400 bg-emerald-400/15 text-white" : own ? "border-transparent bg-emerald-400/5 text-emerald-200 hover:border-slate-600" : "border-transparent text-slate-300 hover:border-slate-600 hover:bg-slate-800"}`}
                            >
                              <span className="truncate">{moves[ply]}</span>
                              <span
                                title={badge?.label ?? "Analiz bekleniyor"}
                                className={`min-w-5 rounded border px-1 text-center text-[10px] ${badge?.color ?? "border-slate-700 text-slate-600"}`}
                                aria-hidden="true"
                              >
                                {badge?.symbol ?? "…"}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-center text-xs text-slate-500">
              Bu maçta henüz hamle yapılmadı.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
