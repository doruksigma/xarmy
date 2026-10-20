import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";
import { openingCandidates } from "./openings";

/** Scores always belong to the player who is about to move at the root. */
export type EngineScore = { type: "cp" | "mate"; value: number };
export interface CoachSearch {
  fen: string;
  positionCommand?: string;
  depth?: number;
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
  vary?: boolean;
  excludeMove?: string;
  random?: () => number;
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
  alternativeStatus?: "found" | "unavailable";
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
  /** Verified continuation after choosing the played move, including that move. */
  playedPv: string[];
}
export type CoachRequest =
  | {
      requestId: number;
      kind: "hint";
      fen: string;
      startFen?: string;
      moves?: string[];
      vary?: boolean;
      excludeMove?: string;
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

function material(position: Chess, color: Color): number {
  return position
    .board()
    .flat()
    .reduce(
      (total, piece) =>
        total +
        (piece ? (piece.color === color ? 1 : -1) * VALUES[piece.type] : 0),
      0,
    );
}

function suggestionExplanation(
  fen: string,
  move: Move | null,
  pv: string[],
): string {
  if (!move) {
    return new Chess(fen).isCheckmate()
      ? "Şah mat; oynanabilecek hamle kalmadı."
      : "Oyun beraberlikle bitti; önerilecek hamle yok.";
  }
  if (move.san.endsWith("#"))
    return `${move.san} şah mat yapıyor; rakibin şahını kurtaracak hamlesi kalmıyor.`;
  const line = lineMoves(fen, pv);
  const last = line.at(-1);
  if (last?.san.endsWith("#") && last.color === move.color)
    return `${move.san} ile mat ağı kuruluyor. Gösterilen devam ${last.san} ile mat bitiyor.`;
  if (move.promotion)
    return `${move.san}, piyonu ${NAMES[move.promotion]} yapıp taş gücünü artırıyor.`;
  if (move.captured) {
    const reply = line[1];
    return `${move.san}, ${move.to} karesindeki ${NAMES[move.captured]} taşını alıyor.${reply?.captured && reply.to === move.to ? ` Rakibin ${reply.san} ile geri alması da hesaba katılıyor.` : ""}`;
  }
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `${move.san}, şahı güvene alırken kaleyi de oyuna sokuyor.`;
  const before = new Chess(fen);
  const after = new Chess(move.after);
  const opponent = move.color === "w" ? "b" : "w";
  if (before.isCheck())
    return `${move.san}, şahı tehditten kurtarıyor ve oyuna devam etmeyi sağlıyor.`;
  if (
    before.isAttacked(move.from, opponent) &&
    !after.isAttacked(move.to, opponent)
  )
    return `${move.san}, ${NAMES[move.piece]} taşını saldırıdan kurtarıyor; ${move.to} karesine şu anda rakip taş saldırmıyor.`;
  const controlled = CENTER.filter((square) =>
    after.attackers(square, move.color).includes(move.to),
  );
  const home = move.color === "w" ? "1" : "8";
  const developing =
    (move.piece === "n" || move.piece === "b") && move.from.endsWith(home);
  if (developing)
    return `${move.san}, ${NAMES[move.piece]} taşını geliştiriyor${controlled.length ? ` ve ${controlled.join(", ")} merkez karelerini kontrol ediyor` : "; başlangıç karesinden oyuna katılmasını sağlıyor"}.`;
  if (controlled.length)
    return `${move.san}, ${NAMES[move.piece]} ile ${controlled.join(", ")} merkez karelerini kontrol ediyor.`;
  if (move.san.includes("+"))
    return `${move.san} şah çekiyor; rakip önce şahını korumak zorunda kalıyor.`;
  const final = new Chess(last?.after ?? move.after);
  if (material(final, move.color) > material(before, move.color)) {
    const capture = line.find(
      (item) => item.color === move.color && item.captured,
    );
    if (capture)
      return `${move.san} ile başlayan devamda ${capture.san}, rakibin ${NAMES[capture.captured!]} taşını alıyor.`;
  }
  return `${move.san}, ${NAMES[move.piece]} taşını ${move.to} karesine getiriyor.${line[1] ? ` Rakibin ${line[1].san} yanıtına karşı devamı hazır tutuyor.` : ""}`;
}

/** Explain only consequences present in the legal, measured engine line. */
function playedExplanation(
  fen: string,
  played: Move,
  bestMove: Move,
  best: CoachSearchResult,
  actual: CoachSearchResult,
  judgment: Exclude<MoveJudgment, "unmeasured">,
): string {
  if (judgment === "best")
    return `${played.san}, bu konumdaki en iyi seçenek. ${suggestionExplanation(fen, played, actual.pv)}`;
  const line = lineMoves(fen, actual.pv);
  const reply = line[1];
  if (
    best.score?.type === "mate" &&
    best.score.value > 0 &&
    (actual.score?.type !== "mate" || actual.score.value <= 0)
  )
    return `${played.san}, zorunlu mat fırsatını kaçırıyor. ${bestMove.san}${bestMove.san.endsWith("#") ? " ile hemen şah mat mümkündü" : " ile mat ağı kurulabiliyordu"}.`;
  if (actual.score?.type === "mate" && actual.score.value <= 0) {
    if (best.score?.type === "mate" && best.score.value <= 0)
      return judgment === "good"
        ? `${played.san}, zaten mat ağı içindeki şah için en iyi savunmalardan biri. Mat tehdidi yine de sürüyor.`
        : `${played.san}, zaten mat ağı içindeki şahın daha erken mat olmasına yol açıyor. ${bestMove.san} daha uzun savunma sağlıyor.`;
    if (reply?.san.endsWith("#"))
      return `${played.san}, şahı savunmasız bırakıyor. Rakip ${reply.san} ile şah mat yapabiliyor.`;
    return `${played.san}, rakibe zorunlu mat yolu açıyor.${reply ? ` Rakip ${reply.san} ile mat saldırısını başlatabiliyor.` : " Şahı koruyacak bir savunma kalmıyor."}`;
  }
  if (
    best.score?.type === "mate" &&
    actual.score?.type === "mate" &&
    actual.score.value > 0
  )
    return judgment === "good"
      ? `${played.san}, zorunlu matı koruyor.`
      : `${played.san}, matı gereksiz yere uzatıyor. ${bestMove.san} daha kısa yoldan bitiriyor.`;
  if (judgment === "good")
    return `${played.san}, oynanabilir bir seçenek; belirgin bir hata bulunmadı.`;
  if (reply?.captured) {
    const exposed = reply.to === played.to && reply.captured === played.piece;
    return `${played.san}${exposed ? `, ${NAMES[played.piece]} taşını rakibin saldırısına bırakıyor` : " sonrasında rakip taş alabiliyor"}. Rakip ${reply.san} ile ${reply.to} karesindeki ${NAMES[reply.captured]} taşını alıyor.`;
  }
  const before = new Chess(fen);
  const final = new Chess(line.at(-1)?.after ?? played.after);
  const lostMaterial =
    material(final, played.color) < material(before, played.color);
  const capture = line
    .slice(1)
    .find((move) => move.color !== played.color && move.captured);
  if (lostMaterial && capture)
    return `${played.san} sonrasındaki devamda taş kaybı var. Rakip ${capture.san} ile ${capture.to} karesindeki ${NAMES[capture.captured!]} taşını alabiliyor.`;
  if (bestMove.captured && !played.captured)
    return `${played.san}, alınabilecek taşı kaçırıyor. ${bestMove.san} ile ${bestMove.to} karesindeki ${NAMES[bestMove.captured]} taşını almak mümkündü.`;
  const home = played.color === "w" ? "1" : "8";
  if (
    (bestMove.piece === "n" || bestMove.piece === "b") &&
    bestMove.from.endsWith(home)
  )
    return `${played.san} yerine ${bestMove.san}, bekleyen ${NAMES[bestMove.piece]} taşını oyuna katıyor. Önce taşları geliştirmek daha yararlı.`;
  if (reply?.san.includes("+"))
    return `${played.san}, rakibe ${reply.san} ile şah çekme fırsatı veriyor. Şahı savunmak için zaman harcamak gerekiyor.`;
  return `${played.san} yerine ${bestMove.san} daha iyi bir devam bırakıyor. ${suggestionExplanation(fen, bestMove, best.pv)}`;
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
  // Coaching never inherits the opponent's handicap. By default, use the
  // engine's full timed search without cutting it off at an artificial depth.
  const target =
    options.maxDepth === undefined
      ? undefined
      : bounded(options.maxDepth, 18, 1, 30);
  const minimum = bounded(options.minDepth, 12, 1, 30);
  let result = validResult(
    fen,
    await options.engine.analyze({
      fen,
      positionCommand,
      ...(target === undefined ? {} : { depth: target }),
      movetime: bounded(options.timeMs, 8_000, 100, 30_000),
    }),
  );
  let alternativeStatus: PositionAdvice["alternativeStatus"] = options.vary
    ? "unavailable"
    : undefined;
  if (options.vary && result.score?.type === "cp" && result.depth >= minimum) {
    const book = openingCandidates(fen);
    const candidates =
      book.length > 1 ? book : game.moves({ verbose: true }).map(moveToUci);
    const random = options.random ?? Math.random;
    const shuffled = candidates.filter(
      (move) => move !== result.bestMove && move !== options.excludeMove,
    );
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    for (const candidate of shuffled.slice(0, 3)) {
      const alternative = validResult(
        fen,
        await options.engine.analyze({
          fen,
          positionCommand,
          depth: result.depth,
          movetime: 3_000,
          searchMoves: [candidate],
        }),
      );
      // Offer alternatives only when explicitly requested and verified to be
      // at least as strong at the same depth. Never trade strength for variety.
      if (
        alternative.bestMove === candidate &&
        alternative.depth === result.depth &&
        alternative.score?.type === "cp" &&
        alternative.score.value >= result.score!.value
      ) {
        result = alternative;
        alternativeStatus = "found";
        break;
      }
    }
  }
  const move = playAnalysisMove(new Chess(fen), result.bestMove!);
  const analysisQuality = quality(
    result.depth,
    target ?? result.depth,
    minimum,
    Boolean(result.score),
  );
  return {
    fen,
    bestMove: result.bestMove,
    bestSan: move.san,
    scoreCp: result.score?.type === "cp" ? result.score.value : null,
    scoreMate: result.score?.type === "mate" ? result.score.value : null,
    depth: result.depth,
    quality: analysisQuality,
    pv: result.pv,
    explanation:
      analysisQuality === "unmeasured"
        ? "Bu öneri henüz doğrulanamadı; yeniden analiz edebilirsin."
        : suggestionExplanation(fen, move, result.pv),
    alternativeStatus,
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
} {
  if (played === bestMove)
    return {
      judgment: "best",
      lossCp: best.type === "cp" ? 0 : null,
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
    };
  }
  if (best.type === "mate" && best.value > 0) {
    if (actual.type !== "mate" || actual.value <= 0) {
      return {
        judgment: "blunder",
        lossCp: null,
      };
    }
    const slower = actual.value - best.value;
    return {
      judgment: slower > 2 ? "inaccuracy" : "good",
      lossCp: null,
    };
  }
  if (actual.type === "mate" && actual.value <= 0) {
    if (best.type !== "mate" || best.value > 0) {
      return {
        judgment: "blunder",
        lossCp: null,
      };
    }
    const sooner = Math.abs(best.value) - Math.abs(actual.value);
    return {
      judgment: sooner > 1 ? "mistake" : sooner > 0 ? "inaccuracy" : "good",
      lossCp: null,
    };
  }
  // The restricted root search can discover a winning mate or a defense absent
  // from the unrestricted PV. Do not manufacture a negative loss from this.
  return {
    judgment: "good",
    lossCp: null,
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
  const explanation = verdict
    ? playedExplanation(fen, played, bestMove, best, actual, verdict.judgment)
    : `${played.san} için güvenilir bir hüküm verilemiyor; iyi veya kötü diye etiketlemiyorum.`;
  const betterExplanation =
    analysisQuality === "unmeasured"
      ? "Bu aday henüz doğrulanamadı; yeniden analiz edebilirsin."
      : suggestionExplanation(fen, bestMove, best.pv);
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
    playedPv: actual.pv,
  };
}
