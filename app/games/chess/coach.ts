import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

export interface AnalysisOptions {
  /** The worker keeps this bounded calculation away from the board UI. */
  timeMs?: number;
  maxDepth?: number;
  maxNodes?: number;
}

export interface PositionAdvice {
  fen: string;
  bestMove: string | null;
  bestSan: string | null;
  /** Centipawns from the side to move's perspective; positive favors that side. */
  scoreCp: number;
  depth: number;
  /** A legal principal variation, in UCI notation. */
  pv: string[];
  explanation: string;
}

export type MoveJudgment =
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface MoveReview {
  fen: string;
  afterFen: string;
  playedMove: string;
  playedSan: string;
  bestMove: string | null;
  bestSan: string | null;
  /** Both scores use the player who made this move's perspective. */
  scoreBefore: number;
  scoreAfter: number;
  lossCp: number;
  judgment: MoveJudgment;
  explanation: string;
  betterExplanation: string;
  depth: number;
  pv: string[];
}

export type CoachRequest =
  | { requestId: number; kind: "hint"; fen: string }
  | {
      requestId: number;
      kind: "review";
      /** SAN and UCI are both accepted. The replay starts at the normal opening. */
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
const MATE = 100_000;
const EXHAUSTED = Symbol("analysis limit");
const CENTER: Square[] = ["d4", "e4", "d5", "e5"];

export function moveToUci(
  move: Pick<Move, "from" | "to" | "promotion">,
): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** Accepts UCI without losing a promotion, or SAN from chess.js's history. */
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

function materialAndPosition(game: Chess): number {
  const board = game.board();
  let score = 0;
  let remainingPieces = 0;
  for (const row of board) {
    for (const piece of row)
      if (piece && piece.type !== "p") remainingPieces += VALUES[piece.type];
  }
  for (let row = 0; row < 8; row += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[row][file];
      if (!piece) continue;
      const advance = piece.color === "w" ? 7 - row : row;
      const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - file);
      let position = 0;
      if (piece.type === "p") position = advance * 7 + center * 4;
      if (piece.type === "n") position = center * 13;
      if (piece.type === "b") position = center * 8;
      if (piece.type === "r") position = advance * 2;
      if (piece.type === "q") position = center * 3;
      if (piece.type === "k")
        position =
          remainingPieces < 1_600 ? center * 12 : -center * 6 - advance * 4;
      score += (piece.color === "w" ? 1 : -1) * (VALUES[piece.type] + position);
    }
  }
  return game.turn() === "w" ? score : -score;
}

function priority(move: Move): number {
  if (move.san.endsWith("#")) return MATE;
  return (
    (move.captured ? VALUES[move.captured] * 10 - VALUES[move.piece] : 0) +
    (move.promotion ? VALUES[move.promotion] : 0) +
    (move.san.includes("+") ? 40 : 0)
  );
}

function ordered(moves: Move[], preferred?: string): Move[] {
  return [...moves].sort((a, b) => {
    if (moveToUci(a) === preferred) return -1;
    if (moveToUci(b) === preferred) return 1;
    return (
      priority(b) - priority(a) || moveToUci(a).localeCompare(moveToUci(b))
    );
  });
}

function drawn(game: Chess): boolean {
  return (
    game.isInsufficientMaterial() ||
    game.isDrawByFiftyMoves() ||
    game.isThreefoldRepetition()
  );
}

interface SearchLine {
  score: number;
  pv: string[];
}
interface RootResult {
  move: Move | null;
  score: number;
  pv: string[];
  playedScore: number;
  playedPv: string[];
  depth: number;
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

/**
 * Compare every root move at the same completed depth. For reviews the played
 * move is searched first with a full window, so its score is exact at that depth
 * rather than an alpha-beta bound. An interrupted iteration is discarded whole.
 */
function searchPosition(
  fen: string,
  played?: string,
  options: AnalysisOptions = {},
): RootResult {
  const game = new Chess(fen);
  const timeMs = bounded(options.timeMs, 280, 25, 1_500);
  const maxDepth = bounded(options.maxDepth, 3, 1, 5);
  const maxNodes = bounded(options.maxNodes, 12_000, 100, 60_000);
  const deadline = Date.now() + timeMs;
  const rootMoves = ordered(game.moves({ verbose: true }));
  if (rootMoves.length === 0 || drawn(game)) {
    const score = rootMoves.length === 0 && game.isCheck() ? -MATE : 0;
    return {
      move: null,
      score,
      pv: [],
      playedScore: score,
      playedPv: [],
      depth: 0,
    };
  }
  let nodes = 0;
  const guard = () => {
    nodes += 1;
    if (nodes > maxNodes || Date.now() >= deadline) throw EXHAUSTED;
  };

  // A cheap complete fallback preserves legal suggestions even on slow devices.
  // Mate-in-one is recognized before the budgeted search, at every node too.
  let result: RootResult = {
    move: rootMoves[0],
    score: -Infinity,
    pv: [],
    playedScore: 0,
    playedPv: [],
    depth: 0,
  };
  for (const move of rootMoves) {
    game.move(move);
    const score = move.san.endsWith("#")
      ? MATE - 1
      : drawn(game)
        ? 0
        : -materialAndPosition(game);
    game.undo();
    const notation = moveToUci(move);
    if (score > result.score)
      result = { ...result, move, score, pv: [notation] };
    if (notation === played) {
      result.playedScore = score;
      result.playedPv = [notation];
    }
  }

  const search = (
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    quietDepth = 3,
  ): SearchLine => {
    guard();
    const moves = ordered(game.moves({ verbose: true }));
    if (moves.length === 0)
      return { score: game.isCheck() ? -MATE + ply : 0, pv: [] };
    if (drawn(game)) return { score: 0, pv: [] };
    const mate = moves.find((move) => move.san.endsWith("#"));
    if (mate) return { score: MATE - ply - 1, pv: [moveToUci(mate)] };
    const inCheck = game.isCheck();
    let candidates = moves;
    let best: SearchLine = { score: -Infinity, pv: [] };
    if (depth <= 0) {
      const standPat = materialAndPosition(game);
      if ((!inCheck && quietDepth <= 0) || quietDepth <= -2)
        return { score: standPat, pv: [] };
      if (!inCheck) {
        best.score = standPat;
        if (standPat >= beta) return best;
        alpha = Math.max(alpha, standPat);
        candidates = moves.filter((move) => move.captured || move.promotion);
      }
    }
    for (const move of candidates) {
      game.move(move);
      let child: SearchLine;
      try {
        child = search(
          depth - 1,
          -beta,
          -alpha,
          ply + 1,
          depth <= 0 ? quietDepth - 1 : quietDepth,
        );
      } finally {
        game.undo();
      }
      const score = -child.score;
      if (score > best.score)
        best = { score, pv: [moveToUci(move), ...child.pv] };
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  };

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    let best: RootResult = { ...result, score: -Infinity, depth };
    let alpha = -Infinity;
    try {
      // Searching the played move first produces a comparable full-window score.
      for (const move of ordered(
        rootMoves,
        played ?? (result.move ? moveToUci(result.move) : undefined),
      )) {
        game.move(move);
        let child: SearchLine;
        try {
          child = search(depth - 1, -Infinity, -alpha, 1);
        } finally {
          game.undo();
        }
        const score = -child.score;
        const notation = moveToUci(move);
        const pv = [notation, ...child.pv];
        if (score > best.score) best = { ...best, move, score, pv };
        if (notation === played) {
          best.playedScore = score;
          best.playedPv = pv;
        }
        alpha = Math.max(alpha, score);
      }
      result = best;
      if (!played && result.score >= MATE - depth) break;
    } catch (error) {
      if (error !== EXHAUSTED) throw error;
      break;
    }
  }
  return result;
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
    return `${move.san} ile başlayan ${line.map((item) => item.san).join(" → ")} devamı mat ile bitiyor. Bu, kısa aramada bulunan mat devamıdır.`;
  }
  if (move.promotion)
    return `${move.san}, son sıraya ulaşan piyonunu ${NAMES[move.promotion]} yapıyor ve taş gücünü artırıyor.`;
  if (move.captured) {
    const reply = line[1];
    const recapture =
      reply?.captured && reply.to === move.to
        ? ` Rakip ${reply.san} ile geri alabiliyor; öneri bu karşılığı da hesaba katıyor.`
        : "";
    return `${move.san}, ${move.to} karesindeki ${NAMES[move.captured]} taşını alıyor.${recapture} İncelenen hamleler arasında en yüksek değerlendirmeyi veriyor.`;
  }
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    return `${move.san} rok yapıyor: şahını ${move.to} karesine taşırken kaleni de oyuna sokuyor. Tek hamlede iki taşın yerini düzenliyor.`;
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
    return `${move.san}, ${NAMES[move.piece]} ile ${controlled.join(", ")} merkez karelerini kontrol ediyor. Kısa aramada incelenen diğer hamlelere göre daha iyi bir konum bırakıyor.`;
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
    return `${move.san}, şah çekişine yasal bir yanıt vererek şahını tehditten kurtarıyor.${continuation}`;
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
      ? `Gösterilen devamda maddi denge senin lehine yaklaşık ${(materialChange / 100).toFixed(1)} piyon değişiyor.`
      : materialChange < 0
        ? `Gösterilen devamda maddi denge rakibin lehine yaklaşık ${(-materialChange / 100).toFixed(1)} piyon değişiyor; bu, incelenen diğer seçeneklerden daha yüksek puan alan devam.`
        : "Gösterilen devamın sonunda iki tarafın toplam taş değeri farkı değişmiyor.";
  return `${move.san}, ${NAMES[move.piece]} taşını ${move.from} karesinden ${move.to} karesine taşıyor. ${materialReason}${continuation}`;
}

export function analyzePosition(
  fen: string,
  options: AnalysisOptions = {},
): PositionAdvice {
  const result = searchPosition(fen, undefined, options);
  return {
    fen,
    bestMove: result.move ? moveToUci(result.move) : null,
    bestSan: result.move?.san ?? null,
    scoreCp: result.score,
    depth: result.depth,
    pv: result.pv,
    explanation: suggestionExplanation(fen, result.move, result.pv),
  };
}

function classify(
  lossCp: number,
  played: string,
  best: string | null,
): MoveJudgment {
  if (played === best) return "best";
  if (lossCp <= 50) return "good";
  if (lossCp <= 120) return "inaccuracy";
  if (lossCp <= 250) return "mistake";
  return "blunder";
}

export function analyzePlayedMove(
  fen: string,
  notation: string,
  options: AnalysisOptions = {},
): MoveReview {
  const game = new Chess(fen);
  if (game.isGameOver()) throw new Error("Bitmiş konumda hamle incelenemez.");
  const played = playAnalysisMove(game, notation);
  const playedUci = moveToUci(played);
  const result = searchPosition(fen, playedUci, options);
  const bestUci = result.move ? moveToUci(result.move) : null;
  const lossCp = Math.max(0, Math.round(result.score - result.playedScore));
  const judgment = classify(lossCp, playedUci, bestUci);
  const line = lineMoves(fen, result.playedPv);
  const reply = line[1];
  let explanation: string;
  if (judgment === "best")
    explanation = `${played.san}, bu kısa aramada bulunan en iyi hamleyle aynı. ${suggestionExplanation(fen, played, result.playedPv)}`;
  else if (judgment === "good")
    explanation = `${played.san} iyi bir hamle. Önerilen hamleyle arasındaki fark bu kısa aramada en fazla yarım piyon değerinde; belirgin bir hata bulunmadı.`;
  else if (reply?.san.endsWith("#"))
    explanation = `${played.san} sonrasında rakip ${reply.san} ile şah mat yapabiliyor. Hamleden önce rakibin şah çekişlerini ve mat tehditlerini kontrol et.`;
  else if (reply?.captured)
    explanation = `${played.san} sonrasında rakip ${reply.san} ile ${reply.to} karesindeki ${NAMES[reply.captured]} taşını alabiliyor. Bu karşılığı da hesaba katan kısa arama, önerilen hamleyi daha iyi buluyor.`;
  else if (result.move?.san.endsWith("#"))
    explanation = `${played.san}, ${result.move.san} ile hemen mat yapma fırsatını kaçırıyor.`;
  else if (result.move?.captured)
    explanation = `${played.san}, ${result.move.san} ile ${result.move.to} karesindeki ${NAMES[result.move.captured]} taşını alma fırsatına göre daha düşük değerlendiriliyor. Önce zorlayıcı hamleleri ve taş alışlarını karşılaştır.`;
  else if (
    line.at(-1)?.san.endsWith("#") &&
    line.at(-1)?.color !== played.color
  )
    explanation = `${played.san} sonrasında incelenen ${line
      .slice(1)
      .map((item) => item.san)
      .join(
        " → ",
      )} devamında rakip mat yapıyor. Bu tehdidi durduran hamleleri ara.`;
  else
    explanation = `${played.san}, kısa aramanın önerdiği ${result.move?.san ?? "alternatif hamle"} hamlesinden yaklaşık ${(lossCp / 100).toFixed(1)} piyon değerinde daha düşük değerlendiriliyor. Taş dengesini, rakibin yanıtlarını ve taşlarının etkinliğini birlikte kontrol et.`;
  let betterExplanation = suggestionExplanation(fen, result.move, result.pv);
  if (judgment !== "best" && judgment !== "good" && result.move && reply) {
    const alternatives = new Chess(result.move.after).moves({ verbose: true });
    const sameReply = alternatives.find(
      (move) => moveToUci(move) === moveToUci(reply),
    );
    if (reply.san.endsWith("#") && !sameReply?.san.endsWith("#")) {
      betterExplanation += ` Ayrıca gösterilen ${reply.san} matına izin vermiyor.`;
    } else if (
      reply.captured &&
      (!sameReply || sameReply.captured !== reply.captured)
    ) {
      betterExplanation += ` Ayrıca gösterilen ${reply.san} ile ${NAMES[reply.captured]} kaybını önlüyor.`;
    }
  }
  return {
    fen,
    afterFen: game.fen(),
    playedMove: playedUci,
    playedSan: played.san,
    bestMove: bestUci,
    bestSan: result.move?.san ?? null,
    scoreBefore: result.score,
    scoreAfter: result.playedScore,
    lossCp,
    judgment,
    explanation,
    betterExplanation,
    depth: result.depth,
    pv: result.pv,
  };
}
