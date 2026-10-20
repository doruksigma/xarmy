import { Chess } from "chess.js";

const lines = [
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6",
  "e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3",
  "e4 e6 d4 d5 Nc3 Nf6",
  "e4 c6 d4 d5 Nc3 dxe4 Nxe4",
  "d4 d5 c4 e6 Nc3 Nf6",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6",
  "c4 e5 Nc3 Nf6 g3 d5",
  "Nf3 d5 g3 Nf6 Bg2 g6",
];
const positions = new Map<string, Set<string>>();
const key = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
for (const line of lines) {
  const game = new Chess();
  for (const san of line.split(" ")) {
    const position = key(game.fen());
    const move = game.move(san);
    const candidates = positions.get(position) ?? new Set<string>();
    candidates.add(`${move.from}${move.to}${move.promotion ?? ""}`);
    positions.set(position, candidates);
  }
}

export function openingCandidates(fen: string): string[] {
  return [...(positions.get(key(fen)) ?? [])];
}

export function randomChoice<T>(items: T[], random = Math.random): T {
  return items[
    Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))
  ];
}
