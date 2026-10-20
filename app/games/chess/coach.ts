import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

/** Scores always belong to the player who is about to move at the root. */
export type EngineScore = { type: "cp" | "mate"; value: number };
export interface CoachSearch {
  fen: string;
  positionCommand?: string;
  depth: number;
  movetime?: number;
  searchMoves?: string[];
}
export interface CoachSearchResult {
  bestMove: string | null;
  score: EngineScore | null;
  depth: number;
  pv: string[];
}
/** A narrow interface makes the analysis auditable without a browser worker. */
export interface CoachEngine {
  analyze(request: CoachSearch): Promise<CoachSearchResult>;
}
export interface AnalysisOptions {
  engine: CoachEngine;
  timeMs?: number;
  maxDepth?: number;
  minDepth?: number;
  /** Complete history preserves repetition and the fifty-move rule in UCI. */
  startFen?: string;
  moves?: string[];
}
export type AnalysisQuality = "complete" | "limited" | "unmeasured";
export interface PositionAdvice {
  fen: string;
  bestMove: string | null;
  bestSan: string | null;
  scoreCp: number | null;
  scoreMate: number | null;
  depth: number;
  quality: AnalysisQuality;
  pv: string[];
  explanation: string;
}
export type MoveJudgment =
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "unmeasured";
export interface MoveReview {
  fen: string;
  afterFen: string;
  playedMove: string;
  playedSan: string;
  bestMove: string | null;
  bestSan: string | null;
  /** Null for a mate score: forced mate is never invented as centipawns. */
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreBeforeMate: number | null;
  scoreAfterMate: number | null;
  lossCp: number | null;
  judgment: MoveJudgment;
  explanation: string;
  betterExplanation: string;
  /** The two searches must complete the same depth before receiving a verdict. */
  depth: number;
  playedDepth: number;
  quality: AnalysisQuality;
  pv: string[];
}
export type CoachRequest =
  | {
      requestId: number;
      kind: "hint";
      fen: string;
      startFen?: string;
      moves?: string[];
    }
  | {
      requestId: number;
      kind: "review";
      moves: string[];
      startFen?: string;
      playerColor?: Color;
    };
export type CoachResponse =
  | { requestId: number; kind: "hint"; advice: PositionAdvice }
  | {
      requestId: number;
      kind: "progress";
      completed: number;
      total: number;
      review: MoveReview & { ply: number };
    }
  | { requestId: number; kind: "complete" }
  | { requestId: number; kind: "error"; error: string };

const VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};
const NAMES: Record<PieceSymbol, string> = {
  p: "piyon",
  n: "at",
  b: "fil",
  r: "kale",
  q: "vezir",
  k: "şah",
};
const CENTER: Square[] = ["d4", "e4", "d5", "e5"];

export function moveToUci(
  move: Pick<Move, "from" | "to" | "promotion">,
): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}
export function playAnalysisMove(game: Chess, notation: string): Move {
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(notation)) {
    return game.move({
      from: notation.slice(0, 2),
      to: notation.slice(2, 4),
      promotion: notation[4],
    });
  }
  return game.move(notation);
}

function bounded(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value!)))
    : fallback;
}

function context(
  fen: string,
  options: Pick<AnalysisOptions, "startFen" | "moves">,
) {
  // A bare FEN is sufficient only when no history was supplied by the caller.
  if (!options.moves)
    return { game: new Chess(fen), positionCommand: `position fen ${fen}` };
  const game = options.startFen ? new Chess(options.startFen) : new Chess();
  const uci = options.moves.map((notation) =>
    moveToUci(playAnalysisMove(game, notation)),
  );
  if (game.fen() !== new Chess(fen).fen())
    throw new Error("Hamle geçmişi konumla uyuşmuyor.");
  const root = options.startFen
    ? `position fen ${options.startFen}`
    : "position startpos";
  return {
    game,
    positionCommand: `${root}${uci.length ? ` moves ${uci.join(" ")}` : ""}`,
  };
}

/** All plies are analyzed, irrespective of who hosted an online room. */
export function reviewPositions(moves: string[], startFen?: string) {
  const game = startFen ? new Chess(startFen) : new Chess();
  const history: string[] = [];
  return moves.map((notation, ply) => {
    const position = {
      fen: game.fen(),
      notation,
      ply,
      color: game.turn(),
      moves: [...history],
    };
    history.push(moveToUci(playAnalysisMove(game, notation)));
    return position;
  });
}

function validResult(
  fen: string,
  result: CoachSearchResult,
): CoachSearchResult {
  if (!result.bestMove)
    throw new Error("Stockfish yasal bir hamle döndürmedi.");
  const game = new Chess(fen);
  playAnalysisMove(game, result.bestMove);
  const pv = result.pv.length ? result.pv : [result.bestMove];
  if (pv[0] !== result.bestMove)
    throw new Error("Stockfish devamı öneriyle uyuşmuyor.");
  const replay = new Chess(fen);
  for (const notation of pv) playAnalysisMove(replay, notation);
  const score =
    result.score &&
    ["cp", "mate"].includes(result.score.type) &&
    Number.isFinite(result.score.value)
      ? result.score
      : null;
  const depth = Number.isFinite(result.depth)
    ? Math.max(0, Math.floor(result.depth))
    : 0;
  return { ...result, depth, pv, score };
}

function quality(
  depth: number,
  target: number,
  minimum: number,
  measured: boolean,
): AnalysisQuality {
  if (!measured || depth < minimum) return "unmeasured";
  return depth >= target ? "complete" : "limited";
}

function scoreText(score: EngineScore): string {
  if (score.type === "mate") {
    return score.value > 0
      ? `${score.value} hamlede zorunlu mat`
      : `${Math.abs(score.value)} hamlede mat tehdidi (rakip lehine)`;
  }
  return `${score.value >= 0 ? "+" : ""}${(score.value / 100).toFixed(2)} piyon`;
}
function lineMoves(fen: string, pv: string[]): Move[] {
  const game = new Chess(fen);
  const moves: Move[] = [];
  for (const notation of pv) {
    try {
      moves.push(playAnalysisMove(game, notation));
    } catch {
      break;
    }
  }
  return moves;
}

function suggestionExplanation(
  fen: string,
  move: Move | null,
  pv: string[],
): string {
  if (!move) {
    const game = new Chess(fen);
    return game.isCheckmate()
      ? "Şah mat olduğu için oynanabilecek hamle yok."
      : "Konum beraberlikle bitti; önerilecek hamle yok.";
  }
  if (move.san.endsWith("#"))
    return `${move.san} şah mat yapıyor: rakibin şahını kurtaracak yasal hamlesi kalmıyor.`;
  const line = lineMoves(fen, pv);
  if (
    line.length > 1 &&
    line.at(-1)!.san.endsWith("#") &&
    line.at(-1)!.color === move.color
  ) {
    return `${move.san} ile başlayan ${line.map((item) => item.san).join(" → ")} devamı mat ile bitiyor. Stockfish bu devamda zorunlu mat buluyor.`;
  }
  if (move.promotion)
    return `${move.san}, son sıraya ulaşan piyonu ${NAMES[move.promotion]} yapıyor ve taş gücünü artırıyor.`;
  if (move.captured) {
    const reply = line[1];
    const recapture =
      reply?.captured && reply.to === move.to
        ? ` Rakip ${reply.san} ile geri alabiliyor; öneri bu karşılığı da hesaba katıyor.`
        : "";
    return `${move.san}, ${move.to} karesindeki ${NAMES[move.captured]} taşını alıyor.${recapture} İncelenen hamleler arasında en yüksek değerlendirmeyi veriyor.`;
  }
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    return `${move.san} rok yapıyor: şahı ${move.to} karesine taşırken kaleyi de oyuna sokuyor. Tek hamlede iki taşın yerini düzenliyor.`;
  }
  const after = new Chess(move.after);
  const controlled = CENTER.filter((square) =>
    after.attackers(square, move.color).includes(move.to),
  );
  const home = move.color === "w" ? "1" : "8";
  if ((move.piece === "n" || move.piece === "b") && move.from.endsWith(home)) {
    return `${move.san}, ${NAMES[move.piece]} taşını başlangıç karesinden çıkarıp geliştiriyor.${controlled.length ? ` ${controlled.join(", ")} merkez karelerini kontrol ediyor.` : " Daha etkin bir kareden oyuna katılmasını sağlıyor."}`;
  }
  if (controlled.length)
    return `${move.san}, ${NAMES[move.piece]} ile ${controlled.join(", ")} merkez karelerini kontrol ediyor. Stockfish, rakibin yanıtlarını da inceleyerek bu devamı öneriyor.`;
  if (move.san.includes("+"))
    return `${move.san} şah çekiyor; rakibin bir sonraki hamlede bu tehdide yanıt vermesi gerekiyor. İncelenen devam bu zorunlu yanıtları hesaba katıyor.`;
  const before = new Chess(fen);
  const opponent = move.color === "w" ? "b" : "w";
  const displayedLine = line.slice(0, 4);
  const continuation =
    displayedLine.length > 1
      ? ` İncelenen devam: ${displayedLine.map((item) => item.san).join(" → ")}.`
      : "";
  if (before.isCheck())
    return `${move.san}, şah çekişine yasal bir yanıt vererek şahı tehditten kurtarıyor.${continuation}`;
  if (
    before.isAttacked(move.from, opponent) &&
    !after.isAttacked(move.to, opponent)
  ) {
    return `${move.san}, ${NAMES[move.piece]} taşını saldırı altındaki ${move.from} karesinden rakibin şu anda saldırmadığı ${move.to} karesine taşıyor.${continuation}`;
  }
  const material = (position: Chess) =>
    position
      .board()
      .flat()
      .reduce(
        (total, piece) =>
          total +
          (piece
            ? (piece.color === move.color ? 1 : -1) * VALUES[piece.type]
            : 0),
        0,
      );
  const finalPosition = new Chess(displayedLine.at(-1)?.after ?? move.after);
  const materialChange = material(finalPosition) - material(before);
  const materialReason =
    materialChange > 0
      ? `Gösterilen devamda maddi denge hamleyi yapan taraf lehine yaklaşık ${(materialChange / 100).toFixed(1)} piyon değişiyor.`
      : materialChange < 0
        ? `Gösterilen devamda maddi denge hamleyi yapan tarafın rakibi lehine yaklaşık ${(-materialChange / 100).toFixed(1)} piyon değişiyor; bu, incelenen diğer seçeneklerden daha yüksek puan alan devam.`
        : "Gösterilen devamın sonunda iki tarafın toplam taş değeri farkı değişmiyor.";
  return `${move.san}, ${NAMES[move.piece]} taşını ${move.from} karesinden ${move.to} karesine taşıyor. ${materialReason}${continuation}`;
}

export async function analyzePosition(
  fen: string,
  options: AnalysisOptions,
): Promise<PositionAdvice> {
  const { game, positionCommand } = context(fen, options);
  if (game.isGameOver()) {
    return {
      fen,
      bestMove: null,
      bestSan: null,
      scoreCp: null,
      scoreMate: game.isCheckmate() ? 0 : null,
      depth: 0,
      quality: "unmeasured",
      pv: [],
      explanation: suggestionExplanation(fen, null, []),
    };
  }
  const target = bounded(options.maxDepth, 18, 1, 30);
  const minimum = bounded(options.minDepth, 12, 1, 30);
  const result = validResult(
    fen,
    await options.engine.analyze({
      fen,
      positionCommand,
      depth: target,
      movetime: bounded(options.timeMs, 3_000, 100, 10_000),
    }),
  );
  const move = playAnalysisMove(new Chess(fen), result.bestMove!);
  const analysisQuality = quality(
    result.depth,
    target,
    minimum,
    Boolean(result.score),
  );
  const evidence =
    analysisQuality === "unmeasured"
      ? ` Stockfish yalnızca ${result.depth}. derinliğe ulaştı; bu öneri henüz yeterli derinlikte doğrulanmadı.`
      : ` Stockfish ${result.depth}. derinlik değerlendirmesi: ${scoreText(result.score!)}.${analysisQuality === "limited" ? " Süre sınırı nedeniyle hedef derinliğe ulaşılamadı." : ""}`;
  return {
    fen,
    bestMove: result.bestMove,
    bestSan: move.san,
    scoreCp: result.score?.type === "cp" ? result.score.value : null,
    scoreMate: result.score?.type === "mate" ? result.score.value : null,
    depth: result.depth,
    quality: analysisQuality,
    pv: result.pv,
    explanation: suggestionExplanation(fen, move, result.pv) + evidence,
  };
}

function judgmentFor(
  played: string,
  bestMove: string,
  best: EngineScore,
  actual: EngineScore,
): {
  judgment: Exclude<MoveJudgment, "unmeasured">;
  lossCp: number | null;
  reason: string;
} {
  if (played === bestMove)
    return {
      judgment: "best",
      lossCp: best.type === "cp" ? 0 : null,
      reason:
        "Oynanan hamle, Stockfish’in aynı derinlikte seçtiği en iyi hamleyle aynı.",
    };
  if (best.type === "cp" && actual.type === "cp") {
    const lossCp = Math.max(0, Math.round(best.value - actual.value));
    const judgment =
      lossCp <= 25
        ? "good"
        : lossCp <= 75
          ? "inaccuracy"
          : lossCp <= 175
            ? "mistake"
            : "blunder";
    return {
      judgment,
      lossCp,
      reason: `En iyi devam ${scoreText(best)}, oynanan hamle ${scoreText(actual)}: kayıp ${(lossCp / 100).toFixed(2)} piyon.`,
    };
  }
  if (best.type === "mate" && best.value > 0) {
    if (actual.type !== "mate" || actual.value <= 0) {
      return {
        judgment: "blunder",
        lossCp: null,
        reason: `${best.value} hamlede zorunlu mat fırsatı kaçırılıyor.${actual.type === "mate" ? ` Üstelik rakip ${Math.abs(actual.value)} hamlede mat edebiliyor.` : " Oynanan devamda Stockfish artık zorunlu mat bulmuyor."}`,
      };
    }
    const slower = actual.value - best.value;
    return {
      judgment: slower > 2 ? "inaccuracy" : "good",
      lossCp: null,
      reason: `Zorunlu mat korunuyor; önerilen devam ${best.value}, oynanan devam ${actual.value} hamlede mat ediyor.`,
    };
  }
  if (actual.type === "mate" && actual.value <= 0) {
    if (best.type !== "mate" || best.value > 0) {
      return {
        judgment: "blunder",
        lossCp: null,
        reason: `Bu hamle rakibe ${Math.abs(actual.value)} hamlede zorunlu mat veriyor; önerilen hamlede bu zorunlu mat yok.`,
      };
    }
    const sooner = Math.abs(best.value) - Math.abs(actual.value);
    return {
      judgment: sooner > 1 ? "mistake" : sooner > 0 ? "inaccuracy" : "good",
      lossCp: null,
      reason: `Konum zaten zorunlu mat ile kayıp. En iyi savunma matı ${Math.abs(best.value)} hamleye erteliyor; oynanan devamda mat ${Math.abs(actual.value)} hamlede geliyor.`,
    };
  }
  // The restricted root search can discover a winning mate or a defense absent
  // from the unrestricted PV. Do not manufacture a negative loss from this.
  return {
    judgment: "good",
    lossCp: null,
    reason: `Oynanan devam ${scoreText(actual)}; bu derinlikte önerilen devamdan daha kötü bir sonuç ölçülmedi.`,
  };
}

export async function analyzePlayedMove(
  fen: string,
  notation: string,
  options: AnalysisOptions,
): Promise<MoveReview> {
  const { game, positionCommand } = context(fen, options);
  if (game.isGameOver()) throw new Error("Bitmiş konumda hamle incelenemez.");
  const played = playAnalysisMove(game, notation);
  const playedUci = moveToUci(played);
  const target = bounded(options.maxDepth, 16, 1, 30);
  const minimum = bounded(options.minDepth, 12, 1, 30);
  const movetime = bounded(options.timeMs, 2_500, 100, 10_000);
  const search = async (depth: number, searchMoves?: string[]) =>
    validResult(
      fen,
      await options.engine.analyze({
        fen,
        positionCommand,
        depth,
        movetime,
        searchMoves,
      }),
    );
  let best = await search(target);
  let actual: CoachSearchResult;
  if (best.bestMove === playedUci) {
    actual = best;
  } else {
    actual = await search(best.depth || target, [playedUci]);
    if (actual.bestMove !== playedUci)
      throw new Error("Stockfish oynanan hamleyi inceleyemedi.");
    // movetime may interrupt either search. Compare only a common completed
    // depth, rerunning the shallower target rather than mixing horizon lengths.
    for (
      let attempt = 0;
      best.depth !== actual.depth && attempt < 3;
      attempt += 1
    ) {
      const common = Math.min(best.depth, actual.depth);
      if (common < minimum) break;
      if (best.depth > common) best = await search(common);
      else actual = await search(common, [playedUci]);
      if (best.bestMove === playedUci) actual = best;
      else if (actual.bestMove !== playedUci)
        throw new Error("Stockfish oynanan hamleyi inceleyemedi.");
    }
  }
  const equalDepth = best.depth === actual.depth;
  const measured = equalDepth && Boolean(best.score && actual.score);
  const analysisQuality = quality(
    Math.min(best.depth, actual.depth),
    target,
    minimum,
    measured,
  );
  const bestMove = playAnalysisMove(new Chess(fen), best.bestMove!);
  const verdict =
    analysisQuality === "unmeasured"
      ? null
      : judgmentFor(playedUci, best.bestMove!, best.score!, actual.score!);
  const line = lineMoves(fen, actual.pv);
  const reply = line[1];
  let explanation = verdict
    ? `${played.san}: ${verdict.reason}`
    : `${played.san} için güvenilir bir hüküm verilemiyor. En iyi hamle araması ${best.depth}, oynanan hamle araması ${actual.depth}. derinliğe ulaştı; eşit derinlikte en az ${minimum} katman gerekli. Bu hamle “iyi” olarak sayılmadı.`;
  if (verdict && verdict.judgment !== "best" && verdict.judgment !== "good") {
    if (reply?.san.endsWith("#"))
      explanation += ` Rakibin ${reply.san} yanıtı şah mat yapıyor.`;
    else if (reply?.captured)
      explanation += ` Rakip ${reply.san} ile ${reply.to} karesindeki ${NAMES[reply.captured]} taşını alabiliyor.`;
    const continuation = line
      .slice(1, 5)
      .map((move) => move.san)
      .join(" → ");
    if (continuation)
      explanation += ` Oynanan hamleden sonra incelenen devam: ${continuation}.`;
  }
  let betterExplanation = suggestionExplanation(fen, bestMove, best.pv);
  if (analysisQuality !== "unmeasured" && best.score)
    betterExplanation += ` Aynı ${best.depth}. derinlikte değerlendirme: ${scoreText(best.score)}.`;
  else
    betterExplanation +=
      " Bu öneri yeterli ve eşit derinlikte doğrulanamadı; kesin bir üstünlük iddiası değildir.";
  return {
    fen,
    afterFen: game.fen(),
    playedMove: playedUci,
    playedSan: played.san,
    bestMove: best.bestMove,
    bestSan: bestMove.san,
    scoreBefore: best.score?.type === "cp" ? best.score.value : null,
    scoreAfter: actual.score?.type === "cp" ? actual.score.value : null,
    scoreBeforeMate: best.score?.type === "mate" ? best.score.value : null,
    scoreAfterMate: actual.score?.type === "mate" ? actual.score.value : null,
    lossCp: verdict?.lossCp ?? null,
    judgment: verdict?.judgment ?? "unmeasured",
    explanation,
    betterExplanation,
    depth: best.depth,
    playedDepth: actual.depth,
    quality: analysisQuality,
    pv: best.pv,
  };
}
